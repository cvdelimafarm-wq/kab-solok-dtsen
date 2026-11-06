// lib/slotPj.ts  (hanya server)
//
// (6 Nov 2026) Slot Penanggung Jawab (PJ) dan Wakil PJ per kegiatan (skema-sql/20261106h). Slot boleh kosong; mengisinya memberi peran
// `pj_kegiatan` pada kegiatan itu (wakil = hak sama dengan PJ, putusan Iqbal opsi A), mengosongkan/menggantinya mencabut peran yang DIBUAT slot itu.
// Peran pj_kegiatan yang sudah ada sebelum slot (diberikan lewat Kelola Peran & Akses) tidak pernah dicabut oleh slot.

import type { Db } from "@/lib/sigap";

export const JABATAN_PJ = ["pj", "wakil_pj"] as const;
export type JabatanPj = (typeof JABATAN_PJ)[number];
export const NAMA_JABATAN_PJ: Record<JabatanPj, string> = { pj: "Penanggung Jawab (PJ)", wakil_pj: "Wakil PJ" };
export const KODE_PERAN_PJ = "pj_kegiatan";

export type SlotPj = { jabatan: JabatanPj; akun_id: number | null; nama: string | null };

export const jabatanSah = (v: unknown): v is JabatanPj => v === "pj" || v === "wakil_pj";

/** Dua slot (PJ, Wakil PJ) kegiatan itu; kosong bila belum diisi. tersedia=false bila tabelnya belum dibuat. */
export async function bacaSlotPj(db: Db, kegiatanId: number): Promise<{ tersedia: boolean; slot: SlotPj[] }> {
  const kosong: SlotPj[] = JABATAN_PJ.map((jabatan) => ({ jabatan, akun_id: null, nama: null }));
  const { data, error } = await db.from("sigap_kegiatan_pj").select("jabatan, akun_id").eq("kegiatan_id", kegiatanId);
  if (error) return { tersedia: false, slot: kosong };
  const baris = (data ?? []) as { jabatan: string; akun_id: number | null }[];
  const ids = baris.map((b) => b.akun_id).filter((x): x is number => typeof x === "number");
  const nama = new Map<number, string>();
  if (ids.length) {
    const { data: ak } = await db.from("sigap_akun").select("id, nama").in("id", ids);
    for (const a of (ak ?? []) as { id: number; nama: string }[]) nama.set(a.id, a.nama);
  }
  return {
    tersedia: true,
    slot: JABATAN_PJ.map((jabatan) => {
      const akunId = baris.find((b) => b.jabatan === jabatan)?.akun_id ?? null;
      return { jabatan, akun_id: akunId, nama: akunId != null ? nama.get(akunId) ?? null : null };
    }),
  };
}

export type HasilSlot = { ok: true; berubah: boolean; peranDiberi: boolean; peranDicabut: boolean } | { ok: false; error: string; status: number };

/**
 * Mengisi (akunId) atau mengosongkan (null) satu slot. Izin sudah diperiksa pemanggil (aturanLingkup: periksaLingkupPeran + periksaBeriPeran).
 * Aturan: satu akun tidak boleh mengisi PJ dan Wakil PJ sekaligus pada kegiatan yang sama; akun harus aktif.
 */
export async function aturSlotPj(db: Db, p: { kegiatanId: number; jabatan: JabatanPj; akunId: number | null; oleh: string }): Promise<HasilSlot> {
  const { data: slotRows, error: eSlot } = await db.from("sigap_kegiatan_pj").select("jabatan, akun_id, peran_diberikan_id").eq("kegiatan_id", p.kegiatanId);
  if (eSlot) return { ok: false, error: "Tabel slot PJ belum dibuat (jalankan SQL 20261106h).", status: 409 };
  const baris = (slotRows ?? []) as { jabatan: string; akun_id: number | null; peran_diberikan_id: number | null }[];
  const lama = baris.find((b) => b.jabatan === p.jabatan);
  if (!lama) return { ok: false, error: "Slot kegiatan ini belum ada.", status: 404 };
  const peranLamaId = lama.peran_diberikan_id;
  if (lama.akun_id === p.akunId) return { ok: true, berubah: false, peranDiberi: false, peranDicabut: false };

  let peranId: number | null = null;
  if (p.akunId != null) {
    const lain = baris.find((b) => b.jabatan !== p.jabatan);
    if (lain?.akun_id === p.akunId) return { ok: false, error: "Akun yang sama tidak dapat menjadi PJ dan Wakil PJ sekaligus pada kegiatan ini.", status: 400 };
    const { data: ak } = await db.from("sigap_akun").select("id, aktif").eq("id", p.akunId).maybeSingle();
    if (!ak || !(ak as { aktif: boolean }).aktif) return { ok: false, error: "Akun tidak ditemukan atau tidak aktif.", status: 404 };
    const { data: peran } = await db.from("sigap_peran").select("id").eq("kode", KODE_PERAN_PJ).maybeSingle();
    if (!peran) return { ok: false, error: "Peran PJ Kegiatan tidak ditemukan.", status: 500 };
    peranId = (peran as { id: number }).id;
  }

  let diberiId: number | null = null;
  let peranDiberi = false;
  if (p.akunId != null && peranId != null) {
    const { data: ada } = await db.from("sigap_akun_peran").select("id").eq("akun_id", p.akunId).eq("peran_id", peranId).eq("kegiatan_id", p.kegiatanId).maybeSingle();
    if (!ada) {
      const { data: baru, error } = await db
        .from("sigap_akun_peran")
        .insert({ akun_id: p.akunId, peran_id: peranId, kegiatan_id: p.kegiatanId, diberi_oleh: `${p.oleh} · slot ${p.jabatan}` })
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, error: error.message, status: 500 };
      diberiId = (baru as { id: number } | null)?.id ?? null;
      peranDiberi = true;
    }
  }

  const { error: eUbah } = await db
    .from("sigap_kegiatan_pj")
    .update({ akun_id: p.akunId, peran_diberikan_id: diberiId, diubah_oleh: p.oleh, diubah_at: new Date().toISOString() })
    .eq("kegiatan_id", p.kegiatanId)
    .eq("jabatan", p.jabatan);
  if (eUbah) return { ok: false, error: eUbah.message, status: 500 };

  // Peran lama dicabut paling akhir: bila langkah di atas gagal, pemegang lama tidak kehilangan haknya.
  let peranDicabut = false;
  if (peranLamaId != null) {
    const { error } = await db.from("sigap_akun_peran").delete().eq("id", peranLamaId);
    if (error) return { ok: false, error: error.message, status: 500 };
    peranDicabut = true;
  }
  return { ok: true, berubah: true, peranDiberi, peranDicabut };
}
