// lib/portal/masterKk.ts  (hanya server)
//
// (7 Nov 2026, tahap C3) KK master: ringkasan per kecamatan, pratinjau/penerapan unggahan (fungsi SQL master_kk_terapkan, 20261107j) dan keputusan atas usulan
// pembaruan master dari penggantian sampel (master_usul_putuskan). Pratinjau dan penerapan memanggil FUNGSI YANG SAMA, hanya beda p_terapkan.
// Aman dipakai sebelum SQL dijalankan: `siap=false` dan penulisan ditolak 503.

import type { Db } from "@/lib/sigap";
import { MASTER_KK_KOSONG, sahkanBarisKk, type BarisKk, type DataMasterKk, type HasilTerapkanKk, type RiwayatKk, type RingkasKecKk, type UsulanKk } from "@/lib/masterKk";

const belumAda = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "42883" || e.code === "PGRST202" || e.code === "PGRST205" || e.code === "42703" || /does not exist|could not find the (table|view|function)|schema cache/i.test(e.message ?? ""));

const angka = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export async function dataMasterKk(db: Db): Promise<DataMasterKk> {
  const { data: pk, error: e1 } = await db.rpc("master_kk_per_kec");
  if (e1) {
    if (belumAda(e1)) return MASTER_KK_KOSONG;
    throw new Error(e1.message);
  }
  const kecamatan = ((pk ?? []) as Record<string, unknown>[]).map((r): RingkasKecKk => ({
    kd_kec: String(r.kd_kec), kecamatan: String(r.kecamatan ?? ""), subsls: angka(r.subsls), subsls_berkk: angka(r.subsls_berkk), kk_aktif: angka(r.kk_aktif), terbaru: (r.terbaru as string | null) ?? null,
  }));
  const namaKec = new Map(kecamatan.map((k) => [k.kd_kec, k.kecamatan]));

  const { data: rw, error: e2 } = await db
    .from("master_kk_unggah")
    .select("id, kd_kec, nama_berkas, dibuat_oleh, dibuat_at, jumlah_baris, baru, berubah, sama, diaktifkan, nonaktif, nonaktifkan_hilang")
    .order("id", { ascending: false })
    .limit(40);
  if (e2 && !belumAda(e2)) throw new Error(e2.message);
  const baris = (rw ?? []) as Record<string, unknown>[];
  const ids = [...new Set(baris.map((b) => Number(b.dibuat_oleh)).filter((n) => Number.isInteger(n) && n > 0))];
  const nama = new Map<number, string>();
  if (ids.length > 0) {
    const { data: akun } = await db.from("sigap_akun").select("id, nama").in("id", ids);
    for (const a of (akun ?? []) as { id: unknown; nama: unknown }[]) nama.set(Number(a.id), String(a.nama ?? ""));
  }
  const riwayat = baris.map((b): RiwayatKk => ({
    id: angka(b.id), kd_kec: String(b.kd_kec), kecamatan: namaKec.get(String(b.kd_kec)) ?? String(b.kd_kec), nama_berkas: (b.nama_berkas as string | null) ?? null,
    dibuat_at: String(b.dibuat_at), oleh: nama.get(Number(b.dibuat_oleh)) ?? "", jumlah_baris: angka(b.jumlah_baris), baru: angka(b.baru), berubah: angka(b.berubah),
    sama: angka(b.sama), diaktifkan: angka(b.diaktifkan), nonaktif: angka(b.nonaktif), nonaktifkan_hilang: b.nonaktifkan_hilang === true,
  }));

  const { usulan, siap: usulanSiap } = await bacaUsulanKk(db);
  return { siap: true, usulan_siap: usulanSiap, kecamatan, riwayat, usulan };
}

/** Usulan pembaruan master yang belum diputuskan. `siap=false` bila kolom keputusan (SQL j) belum ada. */
async function bacaUsulanKk(db: Db): Promise<{ siap: boolean; usulan: UsulanKk[] }> {
  const { data, error } = await db
    .from("sigap_sampel_ganti")
    .select("id, kegiatan_id, idsubsls, utama_kk_id, alasan, status, diajukan_nama, diajukan_at")
    .eq("usul_master", true)
    .is("usul_putusan", null)
    .in("status", ["menunggu", "disetujui"])
    .order("id", { ascending: false })
    .limit(200);
  if (error) {
    if (belumAda(error)) return { siap: false, usulan: [] };
    throw new Error(error.message);
  }
  const r = (data ?? []) as Record<string, unknown>[];
  if (r.length === 0) return { siap: true, usulan: [] };
  const kkIds = [...new Set(r.map((x) => Number(x.utama_kk_id)).filter((n) => Number.isInteger(n)))];
  const kegIds = [...new Set(r.map((x) => Number(x.kegiatan_id)).filter((n) => Number.isInteger(n)))];
  const subIds = [...new Set(r.map((x) => String(x.idsubsls)))];
  const [{ data: kk }, { data: keg }, { data: wil }] = await Promise.all([
    db.from("master_kk").select("id, nama_kk").in("id", kkIds),
    db.from("sigap_kegiatan").select("id, nama").in("id", kegIds),
    db.from("master_wilayah").select("idsubsls, kecamatan, nagari, sls").in("idsubsls", subIds),
  ]);
  const namaKk = new Map(((kk ?? []) as { id: unknown; nama_kk: unknown }[]).map((x) => [Number(x.id), String(x.nama_kk ?? "")]));
  const namaKeg = new Map(((keg ?? []) as { id: unknown; nama: unknown }[]).map((x) => [Number(x.id), String(x.nama ?? "")]));
  const w = new Map(((wil ?? []) as { idsubsls: string; kecamatan: string; nagari: string; sls: string }[]).map((x) => [x.idsubsls, x]));
  return {
    siap: true,
    usulan: r.map((x): UsulanKk => ({
      id: angka(x.id), kegiatan: namaKeg.get(Number(x.kegiatan_id)) ?? `Kegiatan ${x.kegiatan_id}`, idsubsls: String(x.idsubsls),
      kecamatan: w.get(String(x.idsubsls))?.kecamatan ?? "", nagari: w.get(String(x.idsubsls))?.nagari ?? "", sls: w.get(String(x.idsubsls))?.sls ?? "",
      alasan: String(x.alasan ?? ""), nama_kk: namaKk.get(Number(x.utama_kk_id)) ?? "", status: x.status === "disetujui" ? "disetujui" : "menunggu",
      diajukan_nama: (x.diajukan_nama as string | null) ?? null, diajukan_at: String(x.diajukan_at),
    })),
  };
}

export type HasilTerapkanServer = ({ ok: true } & HasilTerapkanKk) | { ok: false; status: number; pesan: string };

/** Pratinjau (terapkan=false, tidak menulis apa pun) atau penerapan (terapkan=true) unggahan KK satu kecamatan. */
export async function terapkanUnggahKk(
  db: Db, akunId: number,
  isian: { kec: unknown; berkas: unknown; baris: unknown; nonaktifkan: unknown; terapkan: boolean },
): Promise<HasilTerapkanServer> {
  const kec = typeof isian.kec === "string" ? isian.kec.trim() : "";
  if (!/^\d{7}$/.test(kec)) return { ok: false, status: 400, pesan: "Pilih kecamatan terlebih dahulu." };
  const sah = sahkanBarisKk(isian.baris);
  if (!sah.ok) return { ok: false, status: 400, pesan: sah.pesan };
  const salah = sah.baris.find((b) => !b.idsubsls.startsWith(kec));
  if (salah) return { ok: false, status: 400, pesan: `Ada baris dengan kode sub SLS di luar kecamatan terpilih (contoh …${salah.idsubsls.slice(-8)}).` };
  const berkas = typeof isian.berkas === "string" ? isian.berkas.slice(0, 300) : "";
  const { data, error } = await db.rpc("master_kk_terapkan", {
    p_akun: akunId, p_kec: kec, p_berkas: berkas, p_baris: sah.baris as BarisKk[], p_nonaktifkan: isian.nonaktifkan === true, p_terapkan: isian.terapkan,
  });
  if (error) {
    if (belumAda(error)) return { ok: false, status: 503, pesan: "Fitur KK master belum aktif di basis data (SQL 20261107j belum dijalankan)." };
    if (error.code === "P0001") return { ok: false, status: 400, pesan: error.message };
    if (error.code === "23503") return { ok: false, status: 409, pesan: "Ada kode sub SLS yang tidak ada di master wilayah." };
    throw new Error(error.message);
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const c = (d.contoh ?? {}) as Record<string, unknown>;
  const daftar = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).map((x) => ({ idsubsls: String(x.idsubsls ?? ""), nama: String(x.nama ?? ""), ...(typeof x.terpakai === "boolean" ? { terpakai: x.terpakai } : {}) })) : []);
  return {
    ok: true, terapkan: isian.terapkan, baris: angka(d.baris), baru: angka(d.baru), berubah: angka(d.berubah), sama: angka(d.sama), diaktifkan: angka(d.diaktifkan),
    hilang: angka(d.hilang), hilang_terpakai: angka(d.hilang_terpakai), nonaktif: angka(d.nonaktif), unggah_id: d.unggah_id === null || d.unggah_id === undefined ? null : angka(d.unggah_id),
    contoh: { baru: daftar(c.baru), berubah: daftar(c.berubah), hilang: daftar(c.hilang) },
  };
}

export async function putuskanUsulanKk(db: Db, akunId: number, id: unknown, putusan: unknown, catatan: unknown): Promise<{ ok: true } | { ok: false; status: number; pesan: string }> {
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, status: 400, pesan: "Usulan tidak dikenal." };
  if (putusan !== "diterapkan" && putusan !== "ditolak") return { ok: false, status: 400, pesan: "Keputusan tidak sah." };
  const { error } = await db.rpc("master_usul_putuskan", { p_ganti: n, p_akun: akunId, p_putusan: putusan, p_catatan: typeof catatan === "string" ? catatan.slice(0, 500) : "" });
  if (error) {
    if (belumAda(error)) return { ok: false, status: 503, pesan: "Fitur keputusan usulan belum aktif di basis data (SQL 20261107j belum dijalankan)." };
    if (error.code === "P0001") return { ok: false, status: 400, pesan: error.message };
    throw new Error(error.message);
  }
  return { ok: true };
}
