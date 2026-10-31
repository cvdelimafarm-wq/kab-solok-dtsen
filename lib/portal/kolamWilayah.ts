// lib/portal/kolamWilayah.ts  (hanya server)
//
// (16 Okt 2026) Kolam wilayah kerja pendataan pascabencana -- aturan di lib/kolamWilayah.ts, penjagaan atomik di fungsi database (migrasi 20261016c):
//  bencana_kolam_progres(pml)   -> hitungan KK wilayah awal dan tambahan dari kolam
//  bencana_kolam_daftar()       -> isi kolam (bebas + yang sudah dipilih tim, lengkap dengan siapa dan kapan)
//  bencana_kolam_pilih(...)     -> memilih: membuat permintaan ke admin (dari_kolam) + baris alokasi tim dalam SATU transaksi
//  bencana_kolam_lepas(id)      -> melepas baris alokasi yang dibuat pilihan itu bila pilihan dibatalkan (ditolak bila sudah ada KK didata)
// Hanya PML tim yang boleh memilih. Kegagalan push TIDAK menggagalkan pilihan.

import type { Db } from "@/lib/sigap";
import { kirimFasih } from "@/lib/portal/pushTerkelola"; // (31 Okt 2026) saklar per kegiatan: tab Notifikasi di Kelola Pendataan
import { catatAudit } from "@/lib/sigapAkses";
import { gabungPenerima, rapikanNama } from "@/lib/rekapIdentifikasi";
import { akunAdminBencana } from "@/lib/portal/sanggahIdentifikasi";
import type { Tim } from "@/lib/portal/pendataan";
import type { Galat } from "@/lib/portal/permintaanDaftar";
import { labelJorong, tanggalWib, type Pilihan } from "@/lib/permintaanDaftar";
import { MAKS_PILIH_KOLAM, SYARAT_TAMBAHAN_PERSEN, teksDariAlasan, type ItemKolam, type ProgresKolam } from "@/lib/kolamWilayah";

const n = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};
const s = (x: unknown): string => (x == null ? "" : String(x));
const ringkas = (t: string, maks: number) => (t.length > maks ? `${t.slice(0, maks - 1).trimEnd()}…` : t);

function bacaProgres(x: unknown): ProgresKolam {
  const o = (x ?? {}) as Record<string, unknown>;
  return { awal_total: n(o.awal_total), awal_didata: n(o.awal_didata), tambahan_sub: n(o.tambahan_sub), tambahan_total: n(o.tambahan_total), tambahan_didata: n(o.tambahan_didata), izin_wilayah: o.izin_wilayah === true };
}

/** Progres tim dan isi kolam. Gagal baca (migrasi belum dijalankan) -> error, biar terlihat. */
export async function dataKolam(db: Db, pmlId: number): Promise<{ progres: ProgresKolam; item: ItemKolam[] }> {
  const [p, d] = await Promise.all([db.rpc("bencana_kolam_progres", { p_pml: pmlId }), db.rpc("bencana_kolam_daftar")]);
  if (p.error) throw new Error(p.error.message);
  if (d.error) throw new Error(d.error.message);
  const item: ItemKolam[] = (Array.isArray(d.data) ? d.data : []).map((r: Record<string, unknown>) => ({
    idsubsls: s(r.idsubsls),
    kecamatan: s(r.kecamatan),
    nagari: s(r.nagari),
    sls: s(r.sls),
    sub_sls: s(r.sub_sls),
    kk: n(r.kk),
    didata: n(r.didata),
    diambil_pml_id: r.diambil_pml_id == null ? null : n(r.diambil_pml_id),
    diambil_nama: r.diambil_nama == null ? null : s(r.diambil_nama),
    diambil_at: r.diambil_at == null ? null : s(r.diambil_at),
  }));
  return { progres: bacaProgres(p.data), item };
}

/** Ada KK yang sudah punya hasil di Sub SLS ini? (pilihan kolam yang sudah dikerjakan tidak boleh dikembalikan ke kolam) */
export async function adaKkBerhasil(db: Db, idsubsls: string): Promise<boolean> {
  const { count, error } = await db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("idsubsls", idsubsls).eq("aktif", true).not("hasil", "is", null);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Setelah permintaan dari kolam dibatalkan: lepaskan baris alokasi yang dibuat pilihan itu. Kegagalan dicatat saja (status batal sudah tersimpan). */
export async function lepasKolam(db: Db, permintaanId: number): Promise<void> {
  const { error } = await db.rpc("bencana_kolam_lepas", { p_permintaan: permintaanId });
  if (error) console.error("[kolam lepas]", error.message);
}

const petaNamaWilayah = async (db: Db, ids: string[]) => {
  const m = new Map<string, string>();
  const { data } = await db.from("bencana_wilayah").select("idsubsls, sls, sub_sls").in("idsubsls", ids);
  for (const w of data ?? []) m.set(w.idsubsls as string, labelJorong(s(w.sls), s(w.sub_sls)));
  return m;
};

/** PML memilih 1..2 Sub SLS dari kolam + PPL penerima tiap Sub SLS. */
export async function pilihKolam(db: Db, akun: { id: number }, tim: Tim, pilihan: Pilihan[]): Promise<{ ids: number[]; dikirim: number } | Galat> {
  if (tim.saya.peran !== "pml") return { galat: "Hanya PML yang dapat memilih dari kolam. PPL hanya melihat.", status: 403 };
  const pplTim = new Set(tim.anggota.filter((a) => a.peran === "ppl").map((a) => a.akun_id));
  for (const p of pilihan) if (!pplTim.has(p.ppl_akun_id)) return { galat: "PPL yang dipilih bukan anggota tim Anda.", status: 400 };

  for (const p of pilihan) {
    const { count, error } = await db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("idsubsls", p.idsubsls).eq("aktif", true);
    if (error) return { galat: "Gagal memeriksa daftar KK. Coba lagi.", status: 500 };
    if (!count) return { galat: "Daftar KK untuk salah satu Sub SLS yang dipilih belum diunggah admin, jadi belum bisa diambil.", status: 409 };
  }

  const { data, error } = await db.rpc("bencana_kolam_pilih", {
    p_pml: tim.pml.id,
    p_akun: akun.id,
    p_tanggal: tanggalWib(Date.now()),
    p_pilihan: pilihan,
    p_maks: MAKS_PILIH_KOLAM,
    p_syarat_awal: 0, // (22 Okt 2026) syarat progres wilayah dihapus; parameter dipertahankan agar tanda tangan fungsi database tidak berubah (diabaikan)
    p_syarat_tambahan: SYARAT_TAMBAHAN_PERSEN,
  });
  if (error) return { galat: "Pilihan gagal disimpan. Coba lagi.", status: 500 };
  const r = (data ?? {}) as { status?: string; ids?: number[]; alasan?: string; d?: number; t?: number; n?: number };
  if (r.status !== "ok") {
    const progres = bacaProgres({ tambahan_total: r.alasan === "tambahan" ? r.t : 0, tambahan_didata: r.alasan === "tambahan" ? r.d : 0, tambahan_sub: r.alasan === "tambahan" ? r.n : 0 });
    return { galat: teksDariAlasan(r.alasan, progres), status: 409 };
  }
  const ids = r.ids ?? [];
  await catatAudit(db, akun.id, "pendataan_kolam_pilih", { pml_id: tim.pml.id, permintaan: ids, sub: pilihan.map((p) => p.idsubsls) }).catch(() => undefined);

  let dikirim = 0;
  try {
    const nama = await petaNamaWilayah(db, pilihan.map((p) => p.idsubsls));
    const namaPpl = new Map(tim.anggota.map((a) => [a.akun_id, a.nama]));
    const daftar = pilihan.map((p) => `${nama.get(p.idsubsls) ?? p.idsubsls} → ${rapikanNama(namaPpl.get(p.ppl_akun_id) ?? "PPL")}`).join("; ");
    const admin = await akunAdminBencana(db);
    const h = await kirimFasih(db, "fasih_kolam", gabungPenerima([admin], akun.id), {
      judul: "Permintaan daftar KK dari kolam wilayah",
      isi: ringkas(`PML ${rapikanNama(tim.pml.nama)} mengambil dari kolam wilayah kerja: ${daftar}. Assign di FASIH lalu tandai sudah keluar.`, 240),
      url: "/sigap/kelola/pendataan",
      tag: `kolam-${tim.pml.id}`,
    });
    dikirim = h.terkirim;
  } catch (e) {
    console.error("[kolam pilih push]", e instanceof Error ? e.message : e);
  }
  return { ids, dikirim };
}
