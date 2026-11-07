// lib/portal/batasVersi.ts  (hanya server)
//
// (7 Nov 2026, tahap C2) Versi batas sub SLS yang diunggah di Master (SQL 20261107i): simpan (pemeriksaan ulang di server, tulis ke Storage `peta-batas`),
// daftar riwayat, aktifkan/kembalikan, dan pembacaan versi aktif untuk alamat /peta/batas/* (app/api/peta/batas/[nama]) dan status batas di Master > Wilayah.
// Tanpa versi aktif aplikasi memakai berkas bawaan (public/peta/batas). Aman dipakai sebelum SQL dijalankan: tabel belum ada = tanpa versi aktif.

import type { Db } from "@/lib/sigap";
import { bacaBerkasBatas, bacaManifestBatas } from "@/lib/batasSubsls";
import { MAKS_TITIK_BATAS, adalahTandaVersi, siapkanFitur, susunVersi, tandaVersi, type FiturMentah } from "@/lib/batasUnggah";
import type { RingkasBatas } from "@/lib/masterWilayah";
import { muatIdBatas, type HasilBatas } from "@/lib/portal/batasServer";

export const BUCKET_BATAS = "peta-batas";
const TTL_AKTIF_MS = 30_000;
const TTL_ID_MS = 10 * 60_000;
const MAKS_BERKAS_MEMORI = 24;

const belumAda = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the (table|view)|schema cache/i.test(e.message ?? ""));

export const namaBerkasBatasSah = (nama: string) => nama === "manifest.json" || /^batas-\d{7}\.json$/.test(nama);

// ---------------------------------------------------------------- versi aktif dan isi berkas (memori proses)
let aktifSimpan: { at: number; versi: string | null } | null = null;
const isiSimpan = new Map<string, string>();
let idSimpan: { at: number; versi: string; hasil: HasilBatas } | null = null;

export function lupakanCacheBatas() {
  aktifSimpan = null;
  isiSimpan.clear();
  idSimpan = null;
}

/** Versi aktif (tanda), atau null = berkas bawaan. Disimpan 30 dtk di memori. */
export async function versiAktifBatas(db: Db, sekarang = Date.now()): Promise<string | null> {
  if (aktifSimpan && sekarang - aktifSimpan.at < TTL_AKTIF_MS) return aktifSimpan.versi;
  const { data, error } = await db.from("master_batas_versi").select("versi").eq("aktif", true).limit(1);
  if (error) {
    if (belumAda(error)) {
      aktifSimpan = { at: sekarang, versi: null };
      return null;
    }
    throw new Error(error.message);
  }
  const v = (data as { versi: string }[] | null)?.[0]?.versi;
  const versi = v && adalahTandaVersi(v) ? v : null;
  aktifSimpan = { at: sekarang, versi };
  return versi;
}

async function unduhTeks(db: Db, kunci: string): Promise<string | null> {
  const ada = isiSimpan.get(kunci);
  if (ada !== undefined) return ada;
  const { data, error } = await db.storage.from(BUCKET_BATAS).download(kunci);
  if (error || !data) return null;
  const teks = await data.text();
  if (isiSimpan.size >= MAKS_BERKAS_MEMORI) {
    const tertua = isiSimpan.keys().next().value;
    if (tertua !== undefined) isiSimpan.delete(tertua);
  }
  isiSimpan.set(kunci, teks);
  return teks;
}

/** Isi satu berkas dari versi aktif (manifest.json atau batas-<kec>.json); null bila tidak ada versi aktif atau berkasnya tidak ada. */
export async function berkasBatasAktif(db: Db, nama: string, sekarang = Date.now()): Promise<{ versi: string; isi: string } | null> {
  if (!namaBerkasBatasSah(nama)) return null;
  const versi = await versiAktifBatas(db, sekarang);
  if (!versi) return null;
  const isi = await unduhTeks(db, `${versi}/${nama}`);
  return isi === null ? null : { versi, isi };
}

/** Sub SLS yang punya batas menurut versi aktif (unggahan) atau, bila tidak ada, berkas bawaan aplikasi. */
export async function muatIdBatasUntuk(db: Db, sekarang = Date.now()): Promise<(HasilBatas & { ringkas: RingkasBatas }) | null> {
  let versi: string | null = null;
  try {
    versi = await versiAktifBatas(db, sekarang);
  } catch {
    versi = null;
  }
  if (versi) {
    if (idSimpan && idSimpan.versi === versi && sekarang - idSimpan.at < TTL_ID_MS) return idSimpan.hasil as HasilBatas & { ringkas: RingkasBatas };
    const manifestTeks = await unduhTeks(db, `${versi}/manifest.json`);
    let manifest: ReturnType<typeof bacaManifestBatas> = null;
    try {
      manifest = manifestTeks ? bacaManifestBatas(JSON.parse(manifestTeks)) : null;
    } catch {
      manifest = null;
    }
    if (manifest) {
      const ids = new Set<string>();
      let terbaca = 0;
      for (const kec of Object.values(manifest.kecamatan)) {
        try {
          const teks = await unduhTeks(db, `${versi}/${kec.berkas}`);
          const berkas = teks ? bacaBerkasBatas(JSON.parse(teks)) : null;
          if (!berkas) continue;
          terbaca += 1;
          for (const f of berkas.fitur) ids.add(f.id);
        } catch {
          // satu berkas rusak: lewati
        }
      }
      if (terbaca > 0) {
        const hasil = { ids, ringkas: { versi, dibuat: manifest.dibuat || null, dibaca: true, kecamatan: terbaca, poligon: ids.size, sumber: "unggahan" as const } };
        idSimpan = { at: sekarang, versi, hasil };
        return hasil;
      }
    }
    // versi aktif tidak terbaca di Storage: jatuh ke berkas bawaan (dan ditandai lewat sumber)
  }
  const bawaan = await muatIdBatas();
  return bawaan ? { ids: bawaan.ids, ringkas: { ...bawaan.ringkas, sumber: "bawaan" as const } } : null;
}

// ---------------------------------------------------------------- simpan versi baru

export type HasilSimpan = { ok: true; versi: string; jumlah_subsls: number; jumlah_kec: number; ukuran_byte: number } | { ok: false; status: number; pesan: string };

type Isian = { fitur?: unknown; namaAsal?: unknown; catatan?: unknown; ringkas?: unknown };

const angka = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const teksPendek = (v: unknown, maks: number) => (typeof v === "string" ? v.trim().slice(0, maks) : "");

function ringkasAman(mentah: unknown, peringatan: number, info: number): Record<string, unknown> {
  const r = (mentah && typeof mentah === "object" ? mentah : {}) as Record<string, unknown>;
  return {
    baru: angka(r.baru), hilang: angka(r.hilang), berubah: angka(r.berubah), sama: angka(r.sama),
    peringatan, info, sistem: teksPendek(r.sistem, 160), jenis: teksPendek(r.jenis, 20),
  };
}

/** Periksa ulang fitur dari browser (tidak dipercaya), tulis berkas per kecamatan + manifest ke Storage, catat versi. TIDAK mengaktifkan. */
export async function simpanVersiBatas(db: Db, akunId: number, isian: Isian, sekarang = new Date()): Promise<HasilSimpan> {
  if (!Array.isArray(isian.fitur) || isian.fitur.length === 0) return { ok: false, status: 400, pesan: "Tidak ada fitur untuk disimpan." };
  const mentah: FiturMentah[] = [];
  let titik = 0;
  for (const f of isian.fitur as unknown[]) {
    if (!f || typeof f !== "object") continue;
    const x = f as Record<string, unknown>;
    if (!Array.isArray(x.g)) continue;
    for (const p of x.g as unknown[]) if (Array.isArray(p)) for (const c of p) if (Array.isArray(c)) titik += c.length;
    if (titik > MAKS_TITIK_BATAS) return { ok: false, status: 400, pesan: "Isi terlalu besar (lebih dari 3 juta titik)." };
    mentah.push({ atribut: { idsubsls: String(x.id ?? ""), nmsls: teksPendek(x.nm, 120), kdsubsls: teksPendek(x.kd, 20) }, g: x.g as FiturMentah["g"] });
  }
  const h = siapkanFitur(mentah, { id: "idsubsls", nama: "nmsls", kode: "kdsubsls" });
  const galat = h.masalah.filter((m) => m.tingkat === "GALAT");
  if (galat.length > 0) {
    const contoh = galat.slice(0, 5).map((m) => `${m.id}: ${m.pesan}`).join("; ");
    return { ok: false, status: 400, pesan: `Pemeriksaan di server menolak ${galat.length} temuan. ${contoh}` };
  }
  if (h.fitur.length === 0) return { ok: false, status: 400, pesan: "Tidak ada fitur yang sah." };

  const versi = tandaVersi(sekarang);
  const { data: ada, error: eAda } = await db.from("master_batas_versi").select("id").eq("versi", versi).limit(1);
  if (eAda) return belumAda(eAda) ? { ok: false, status: 503, pesan: "SQL 20261107i (versi batas) belum dijalankan." } : { ok: false, status: 500, pesan: eAda.message };
  if (ada && ada.length > 0) return { ok: false, status: 409, pesan: "Versi dengan tanda waktu ini sudah ada; tunggu semenit lalu coba lagi." };

  const paket = susunVersi(h.fitur, versi, sekarang);
  const ditulis: string[] = [];
  let ukuran = 0;
  for (const [nama, isi] of Object.entries(paket.berkas)) {
    const kunci = `${versi}/${nama}`;
    const badan = new TextEncoder().encode(isi);
    const { error } = await db.storage.from(BUCKET_BATAS).upload(kunci, badan, { contentType: "application/json", upsert: false });
    if (error) {
      if (ditulis.length > 0) await db.storage.from(BUCKET_BATAS).remove(ditulis);
      return { ok: false, status: 500, pesan: `Gagal menulis ${nama} ke penyimpanan: ${error.message}` };
    }
    ditulis.push(kunci);
    ukuran += badan.byteLength;
  }
  const peringatan = h.masalah.filter((m) => m.tingkat === "PERINGATAN").length;
  const info = h.masalah.filter((m) => m.tingkat === "INFO").length;
  const jumlahKec = Object.keys(paket.manifest.kecamatan).length;
  const { error: eIns } = await db.from("master_batas_versi").insert({
    versi, dibuat_oleh: akunId, nama_asal: teksPendek(isian.namaAsal, 300) || null, catatan: teksPendek(isian.catatan, 500) || null,
    jumlah_subsls: h.fitur.length, jumlah_kec: jumlahKec, ukuran_byte: ukuran, ringkas: ringkasAman(isian.ringkas, peringatan, info),
  });
  if (eIns) {
    await db.storage.from(BUCKET_BATAS).remove(ditulis);
    return { ok: false, status: 500, pesan: eIns.message };
  }
  return { ok: true, versi, jumlah_subsls: h.fitur.length, jumlah_kec: jumlahKec, ukuran_byte: ukuran };
}

// ---------------------------------------------------------------- aktifkan dan riwayat

export type HasilAktif = { ok: true; aktif: string | null } | { ok: false; status: number; pesan: string };

/** Aktifkan versi (tanda) atau kembali ke berkas bawaan (versi null). Berkas versi dicek ada di Storage sebelum diaktifkan. */
export async function aktifkanVersiBatas(db: Db, akunId: number, versi: string | null): Promise<HasilAktif> {
  if (versi !== null) {
    if (!adalahTandaVersi(versi)) return { ok: false, status: 400, pesan: "Tanda versi tidak sah." };
    const { data, error } = await db.storage.from(BUCKET_BATAS).download(`${versi}/manifest.json`);
    if (error || !data) return { ok: false, status: 404, pesan: "Berkas versi itu tidak ditemukan di penyimpanan." };
  }
  const { data, error } = await db.rpc("master_batas_aktifkan", { p_versi: versi ?? "", p_akun: akunId });
  if (error) return belumAda(error) || /function .* does not exist/i.test(error.message) ? { ok: false, status: 503, pesan: "SQL 20261107i (versi batas) belum dijalankan." } : { ok: false, status: 500, pesan: error.message };
  const r = data as { ok?: boolean; pesan?: string; aktif?: string | null } | null;
  if (!r?.ok) return { ok: false, status: 404, pesan: r?.pesan ?? "Versi tidak ditemukan." };
  lupakanCacheBatas();
  return { ok: true, aktif: r.aktif ?? null };
}

export type VersiBatas = {
  versi: string;
  dibuat_at: string;
  dibuat_oleh: string;
  nama_asal: string | null;
  catatan: string | null;
  jumlah_subsls: number;
  jumlah_kec: number;
  ukuran_byte: number;
  ringkas: Record<string, unknown>;
  aktif: boolean;
  diaktifkan_at: string | null;
};

export type DataBatasVersi = { siap: boolean; aktif: string | null; versi: VersiBatas[]; bawaan: RingkasBatas | null };

export async function daftarVersiBatas(db: Db): Promise<DataBatasVersi> {
  const bawaan = await muatIdBatas();
  const { data, error } = await db
    .from("master_batas_versi")
    .select("versi, dibuat_at, dibuat_oleh, nama_asal, catatan, jumlah_subsls, jumlah_kec, ukuran_byte, ringkas, aktif, diaktifkan_at")
    .order("id", { ascending: false })
    .limit(50);
  if (error) {
    if (belumAda(error)) return { siap: false, aktif: null, versi: [], bawaan: bawaan?.ringkas ?? null };
    throw new Error(error.message);
  }
  const baris = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(baris.map((b) => Number(b.dibuat_oleh)).filter((n) => Number.isInteger(n) && n > 0))];
  const nama = new Map<number, string>();
  if (ids.length > 0) {
    const { data: akun } = await db.from("sigap_akun").select("id, nama").in("id", ids);
    for (const a of (akun ?? []) as { id: unknown; nama: unknown }[]) nama.set(Number(a.id), String(a.nama ?? ""));
  }
  const versi = baris.map((b): VersiBatas => ({
    versi: String(b.versi),
    dibuat_at: String(b.dibuat_at),
    dibuat_oleh: nama.get(Number(b.dibuat_oleh)) ?? "",
    nama_asal: (b.nama_asal as string | null) ?? null,
    catatan: (b.catatan as string | null) ?? null,
    jumlah_subsls: angka(b.jumlah_subsls),
    jumlah_kec: angka(b.jumlah_kec),
    ukuran_byte: angka(b.ukuran_byte),
    ringkas: b.ringkas && typeof b.ringkas === "object" ? (b.ringkas as Record<string, unknown>) : {},
    aktif: b.aktif === true,
    diaktifkan_at: (b.diaktifkan_at as string | null) ?? null,
  }));
  return { siap: true, aktif: versi.find((v) => v.aktif)?.versi ?? null, versi, bawaan: bawaan?.ringkas ?? null };
}
