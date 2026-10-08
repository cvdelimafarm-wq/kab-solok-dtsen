// lib/sigapPulsa.ts
//
// (8 Okt 2026) SIGAP > Pelatihan > nomor HP untuk pengisian pulsa.
// - Nomor HP ASLI petugas dicari dari data yang sudah ada (tidak ada kolom no_hp di sigap_akun):
//   bencana_petugas.no_hp -> bencana_mitra.no_telp (via sigap_akun) -> petugas_penyisiran_akun.no_hp (cocok nama; organik).
// - Petugas mengonfirmasi nomor asli atau menggantinya dengan nomor lain KHUSUS pulsa; disimpan di
//   sigap_pelatihan_pulsa. Nomor asli di tabel sumber tidak pernah diubah.

import type { Db } from "@/lib/sigap";

/** Bentuk baku 08xxxxxxxxxx (10-14 digit) atau null bila tidak valid. Menerima +62/62/0 dan spasi/strip. */
export function normalisasiHp(mentah: unknown): string | null {
  if (typeof mentah !== "string" && typeof mentah !== "number") return null;
  let d = String(mentah).replace(/\D/g, "");
  if (d.startsWith("620")) d = d.slice(2); // salah ketik "+62 0812..."
  else if (d.startsWith("62")) d = "0" + d.slice(2);
  else if (d.startsWith("8")) d = "0" + d;
  if (!/^08\d{8,12}$/.test(d)) return null;
  return d;
}

/** 081266863316 -> "0812-6686-3316" (hanya tampilan). */
export function tampilHp(n: string | null | undefined): string {
  if (!n) return "";
  const d = n.replace(/\D/g, "");
  if (d.length < 9) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
}

/** Nomor HP asli (baku) seorang akun, atau null bila tidak tercatat di sumber mana pun. */
export async function nomorAsli(db: Db, akunId: number): Promise<string | null> {
  const { data: a } = await db.from("sigap_akun").select("nama, petugas_bencana_id, mitra_id").eq("id", akunId).maybeSingle();
  if (!a) return null;
  if (a.petugas_bencana_id) {
    const { data } = await db.from("bencana_petugas").select("no_hp").eq("id", a.petugas_bencana_id).maybeSingle();
    const n = normalisasiHp(data?.no_hp);
    if (n) return n;
  }
  if (a.mitra_id) {
    const { data } = await db.from("bencana_mitra").select("no_telp").eq("id", a.mitra_id).maybeSingle();
    const n = normalisasiHp(data?.no_telp);
    if (n) return n;
  }
  // Organik: data penyisiran (cocok nama persis, abaikan huruf besar/kecil; hanya bila tepat satu baris cocok).
  const nama = String(a.nama ?? "").trim();
  if (nama) {
    const { data } = await db.from("petugas_penyisiran_akun").select("no_hp").ilike("nama", nama.replace(/[%_]/g, "\\$&")).limit(2);
    if (data && data.length === 1) {
      const n = normalisasiHp(data[0].no_hp);
      if (n) return n;
    }
  }
  return null;
}

export type StatusPulsa = {
  asli: string | null;
  /** nomor pulsa yang sudah dikonfirmasi, null bila belum */
  pulsa: string | null;
  diubah: boolean;
  dikonfirmasi_at: string | null;
};

export async function statusPulsa(db: Db, kegiatanId: number, akunId: number): Promise<StatusPulsa> {
  const [asli, { data }] = await Promise.all([
    nomorAsli(db, akunId),
    db.from("sigap_pelatihan_pulsa").select("no_pulsa, diubah, dikonfirmasi_at").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle(),
  ]);
  return {
    asli,
    pulsa: (data?.no_pulsa as string | undefined) ?? null,
    diubah: Boolean(data?.diubah),
    dikonfirmasi_at: (data?.dikonfirmasi_at as string | undefined) ?? null,
  };
}

/** Simpan konfirmasi. `nomor` = nomor pulsa baku; `asli` = nomor asli saat ini (untuk jejak & penanda diubah). */
export async function simpanPulsa(db: Db, kegiatanId: number, akunId: number, nomor: string, asli: string | null): Promise<void> {
  const { error } = await db.from("sigap_pelatihan_pulsa").upsert(
    { kegiatan_id: kegiatanId, akun_id: akunId, no_hp_asli: asli, no_pulsa: nomor, diubah: asli !== nomor, dikonfirmasi_at: new Date().toISOString() },
    { onConflict: "kegiatan_id,akun_id" },
  );
  if (error) throw new Error(error.message);
}

export type PulsaAdm = { pulsa: string | null; diubah: boolean; dikonfirmasi_at: string | null; asli: string | null };

/** Untuk monitoring panitia: nomor pulsa per akun (tanpa mencari nomor asli bagi yang sudah konfirmasi). */
export async function pulsaBanyak(db: Db, kegiatanId: number, akunIds: number[]): Promise<Map<number, PulsaAdm>> {
  const hasil = new Map<number, PulsaAdm>();
  if (akunIds.length === 0) return hasil;
  const { data } = await db.from("sigap_pelatihan_pulsa").select("akun_id, no_pulsa, no_hp_asli, diubah, dikonfirmasi_at").eq("kegiatan_id", kegiatanId).in("akun_id", akunIds).limit(2000);
  for (const r of data ?? []) {
    hasil.set(r.akun_id as number, { pulsa: r.no_pulsa as string, diubah: Boolean(r.diubah), dikonfirmasi_at: r.dikonfirmasi_at as string, asli: (r.no_hp_asli as string | null) ?? null });
  }
  return hasil;
}
