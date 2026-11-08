// lib/sigapKelasKegiatan.ts  (khusus server, kecuali fungsi murni di bagian atas)
//
// (8 Nov 2026) Pengaturan kelas PER PELATIHAN. Sebelumnya Adu Sigap, filter monitoring, dan pilihan instruktur memakai Kelas 1-4 tetap untuk semua pelatihan.
// Kini setiap pelatihan punya daftar kelasnya sendiri (tabel sigap_pelatihan_kelas: nomor 1..20, nama, kuota; SQL 20261108b_kelas_pelatihan.sql).
// Daftar kelas yang dipakai aplikasi = tabel ITU + kelas yang ternyata sudah dipakai peserta aktif / instruktur (supaya tidak ada kelas "gaib"); tabel kosong -> Kelas 1.
// "Semua Kelas" (nomor 0, ruang gabungan Adu Sigap) tidak disimpan: ia hanya ditawarkan bila kelas lebih dari satu.

import type { Db } from "@/lib/sigap";

export const KELAS_MAKS = 20;
export const KELAS_GABUNGAN_NOMOR = 0;

export type KelasKegiatan = { nomor: number; nama: string; kuota: number | null };

// ---------------------------------------------------------------------------------------------
// Fungsi murni
// ---------------------------------------------------------------------------------------------
export const namaKelasBawaan = (nomor: number) => `Kelas ${nomor}`;
export const nomorKelasSah = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= KELAS_MAKS;

/** Gabungkan kelas tabel dengan nomor kelas yang sudah dipakai data; kosong -> Kelas 1. Urut nomor, tanpa kembar. */
export function gabungKelas(master: readonly KelasKegiatan[], dipakai: readonly number[]): KelasKegiatan[] {
  const peta = new Map<number, KelasKegiatan>();
  for (const k of master) if (nomorKelasSah(k.nomor)) peta.set(k.nomor, { nomor: k.nomor, nama: k.nama?.trim() || namaKelasBawaan(k.nomor), kuota: k.kuota ?? null });
  for (const n of dipakai) if (nomorKelasSah(n) && !peta.has(n)) peta.set(n, { nomor: n, nama: namaKelasBawaan(n), kuota: null });
  if (peta.size === 0) peta.set(1, { nomor: 1, nama: namaKelasBawaan(1), kuota: null });
  return [...peta.values()].sort((a, b) => a.nomor - b.nomor);
}

/** Kelas efektif seorang peserta: kelasnya bila terdaftar; bila pelatihan hanya satu kelas, peserta tanpa kelas dianggap masuk kelas itu; selain itu null. */
export function kelasEfektif(kelasPeserta: number | null | undefined, daftar: readonly KelasKegiatan[]): number | null {
  if (kelasPeserta != null && daftar.some((k) => k.nomor === Number(kelasPeserta))) return Number(kelasPeserta);
  if (daftar.length === 1) return daftar[0].nomor;
  return null;
}

/** Nomor kelas untuk pilihan Adu Sigap: [0 (Semua Kelas, hanya bila > 1 kelas), ...nomor kelas]. */
export function nomorPilihanKuis(daftar: readonly KelasKegiatan[]): number[] {
  const nomor = daftar.map((k) => k.nomor);
  return nomor.length > 1 ? [KELAS_GABUNGAN_NOMOR, ...nomor] : nomor;
}

/** Label kelas dengan memakai nama kelas pelatihan bila ada. */
export function labelKelasNama(nomor: number | null | undefined, daftar: readonly KelasKegiatan[]): string {
  if (nomor === KELAS_GABUNGAN_NOMOR) return "Semua Kelas";
  if (nomor == null) return "?";
  return daftar.find((k) => k.nomor === nomor)?.nama ?? namaKelasBawaan(nomor);
}

/** Bagi `n` peserta menjadi `k` kelas serata mungkin (selisih paling banyak 1); kelas awal mendapat sisa. */
export function ukuranBagiRata(n: number, k: number): number[] {
  if (k <= 0) return [];
  const dasar = Math.floor(n / k);
  const sisa = n % k;
  return Array.from({ length: k }, (_, i) => dasar + (i < sisa ? 1 : 0));
}

export function periksaNamaKelas(raw: unknown): { ok: true; nama: string } | { ok: false; pesan: string } {
  const nama = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (nama.length < 1 || nama.length > 60) return { ok: false, pesan: "Nama kelas 1 sampai 60 huruf." };
  return { ok: true, nama };
}

export function periksaKuota(raw: unknown): { ok: true; kuota: number | null } | { ok: false; pesan: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, kuota: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 500) return { ok: false, pesan: "Kuota harus angka 1 sampai 500, atau kosong bila tanpa batas." };
  return { ok: true, kuota: n };
}

// ---------------------------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------------------------
type Hasil = { ok: true } | { ok: false; pesan: string };
const gagal = (pesan: string): { ok: false; pesan: string } => ({ ok: false, pesan });

export async function muatKelasKegiatan(db: Db, kegiatanId: number): Promise<KelasKegiatan[]> {
  const [{ data: m }, { data: p }, { data: i }] = await Promise.all([
    db.from("sigap_pelatihan_kelas").select("nomor, nama, kuota").eq("kegiatan_id", kegiatanId).order("nomor").limit(KELAS_MAKS),
    db.from("sigap_penugasan").select("kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).not("kelas", "is", null).limit(5000),
    db.from("sigap_kuis_instruktur_kelas").select("kelas").eq("kegiatan_id", kegiatanId).limit(500),
  ]);
  const master = ((m ?? []) as { nomor: number; nama: string; kuota: number | null }[]).map((x) => ({ nomor: Number(x.nomor), nama: String(x.nama ?? ""), kuota: x.kuota == null ? null : Number(x.kuota) }));
  const dipakai = [...((p ?? []) as { kelas: number }[]), ...((i ?? []) as { kelas: number }[])].map((x) => Number(x.kelas));
  return gabungKelas(master, dipakai);
}

export type PesertaKelas = { penugasan_id: number; akun_id: number; nama: string; peran: string; kelas: number | null; sumber: string | null };

export async function muatPesertaKelas(db: Db, kegiatanId: number): Promise<PesertaKelas[]> {
  const { data } = await db.from("sigap_penugasan").select("id, akun_id, peran, kelas, sumber").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(5000);
  const baris = (data ?? []) as { id: number; akun_id: number; peran: string; kelas: number | null; sumber: string | null }[];
  if (baris.length === 0) return [];
  const nama = new Map<number, string>();
  const ids = [...new Set(baris.map((b) => Number(b.akun_id)))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: a } = await db.from("sigap_akun").select("id, nama").in("id", ids.slice(i, i + 200));
    for (const x of (a ?? []) as { id: number; nama: string }[]) nama.set(Number(x.id), x.nama);
  }
  return baris
    .map((b) => ({ penugasan_id: Number(b.id), akun_id: Number(b.akun_id), nama: nama.get(Number(b.akun_id)) ?? `Akun ${b.akun_id}`, peran: b.peran, kelas: b.kelas == null ? null : Number(b.kelas), sumber: b.sumber ?? null }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

export type Panitia = { akun_id: number; nama: string; peran: string; peran_nama: string; lingkup: "kegiatan" | "semua" };

/** Panitia = pemegang peran yang punya menu pelatihan.kelola untuk pelatihan ini (lingkup kegiatan ini atau semua kegiatan), tanpa peran instruktur. */
export async function muatPanitia(db: Db, kegiatanId: number): Promise<Panitia[]> {
  const { data: izin } = await db.from("sigap_peran_izin").select("peran_id").eq("menu_kode", "pelatihan.kelola");
  const peranIds = [...new Set(((izin ?? []) as { peran_id: number }[]).map((r) => Number(r.peran_id)))];
  if (peranIds.length === 0) return [];
  const [{ data: peran }, { data: ap }] = await Promise.all([
    db.from("sigap_peran").select("id, kode, nama").in("id", peranIds),
    db.from("sigap_akun_peran").select("akun_id, peran_id, kegiatan_id").in("peran_id", peranIds).or(`kegiatan_id.is.null,kegiatan_id.eq.${kegiatanId}`).limit(500),
  ]);
  const dataPeran = new Map(((peran ?? []) as { id: number; kode: string; nama: string }[]).map((p) => [Number(p.id), p]));
  const baris = ((ap ?? []) as { akun_id: number; peran_id: number; kegiatan_id: number | null }[]).filter((r) => dataPeran.get(Number(r.peran_id))?.kode !== "instruktur_pelatihan");
  if (baris.length === 0) return [];
  const { data: akun } = await db.from("sigap_akun").select("id, nama, aktif").in("id", [...new Set(baris.map((r) => Number(r.akun_id)))]);
  const nama = new Map(((akun ?? []) as { id: number; nama: string; aktif: boolean }[]).filter((a) => a.aktif !== false).map((a) => [Number(a.id), a.nama]));
  const hasil: Panitia[] = [];
  for (const r of baris) {
    const n = nama.get(Number(r.akun_id));
    const p = dataPeran.get(Number(r.peran_id));
    if (!n || !p) continue;
    hasil.push({ akun_id: Number(r.akun_id), nama: n, peran: p.kode, peran_nama: p.nama, lingkup: r.kegiatan_id == null ? "semua" : "kegiatan" });
  }
  // urut: lingkup kegiatan dahulu (yang ditetapkan khusus), lalu nama
  return hasil.sort((a, b) => (a.lingkup === b.lingkup ? 0 : a.lingkup === "kegiatan" ? -1 : 1) || a.nama.localeCompare(b.nama) || a.peran_nama.localeCompare(b.peran_nama));
}

// ---------------------------------------------------------------------------------------------
// Tulis (daftar kelas)
// ---------------------------------------------------------------------------------------------
async function pastikanTabel(db: Db): Promise<Hasil> {
  const { error } = await db.from("sigap_pelatihan_kelas").select("nomor").limit(1);
  return error ? gagal("Tabel kelas pelatihan belum ada. Jalankan SQL 20261108b_kelas_pelatihan.sql lebih dahulu.") : { ok: true };
}

/** Pastikan tabel master memuat SEMUA kelas yang kini terlihat (termasuk yang hanya "terpakai"), supaya perubahan berikutnya konsisten. */
async function tuliskanTampak(db: Db, kegiatanId: number): Promise<void> {
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  await db.from("sigap_pelatihan_kelas").upsert(daftar.map((k) => ({ kegiatan_id: kegiatanId, nomor: k.nomor, nama: k.nama, kuota: k.kuota })), { onConflict: "kegiatan_id,nomor", ignoreDuplicates: true });
}

export async function ubahKelas(db: Db, kegiatanId: number, nomor: number, nama: unknown, kuota: unknown): Promise<Hasil> {
  if (!nomorKelasSah(nomor)) return gagal(`Nomor kelas 1 sampai ${KELAS_MAKS}.`);
  const n = periksaNamaKelas(nama);
  if (!n.ok) return n;
  const k = periksaKuota(kuota);
  if (!k.ok) return k;
  const t = await pastikanTabel(db);
  if (!t.ok) return t;
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  if (!daftar.some((x) => x.nomor === nomor)) return gagal("Kelas itu tidak ada.");
  if (daftar.some((x) => x.nomor !== nomor && x.nama.toLowerCase() === n.nama.toLowerCase())) return gagal("Nama kelas itu sudah dipakai kelas lain.");
  if (k.kuota !== null) {
    const { count } = await db.from("sigap_penugasan").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true).eq("kelas", nomor);
    if ((count ?? 0) > k.kuota) return gagal(`Kelas ini sudah berisi ${count} peserta, lebih dari kuota ${k.kuota}. Pindahkan sebagian peserta dahulu.`);
  }
  const { error } = await db.from("sigap_pelatihan_kelas").upsert({ kegiatan_id: kegiatanId, nomor, nama: n.nama, kuota: k.kuota, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,nomor" });
  return error ? gagal("Gagal menyimpan kelas.") : { ok: true };
}

/** Atur jumlah kelas: menambah dari nomor terkecil yang kosong; mengurangi hanya kelas ber-nomor terbesar yang KOSONG (tanpa peserta aktif, instruktur, ruang berjalan). */
export async function aturJumlahKelas(db: Db, kegiatanId: number, jumlah: number): Promise<Hasil & { jumlah?: number }> {
  if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > KELAS_MAKS) return gagal(`Jumlah kelas 1 sampai ${KELAS_MAKS}.`);
  const t = await pastikanTabel(db);
  if (!t.ok) return t;
  await tuliskanTampak(db, kegiatanId);
  let daftar = await muatKelasKegiatan(db, kegiatanId);
  while (daftar.length < jumlah) {
    const dipakai = new Set(daftar.map((k) => k.nomor));
    let n = 1;
    while (dipakai.has(n)) n++;
    const { error } = await db.from("sigap_pelatihan_kelas").insert({ kegiatan_id: kegiatanId, nomor: n, nama: namaKelasBawaan(n) });
    if (error) return gagal("Gagal menambah kelas.");
    daftar = await muatKelasKegiatan(db, kegiatanId);
  }
  while (daftar.length > jumlah) {
    const terakhir = daftar[daftar.length - 1];
    const h = await hapusKelas(db, kegiatanId, terakhir.nomor);
    if (!h.ok) return gagal(`Tidak bisa mengurangi ke ${jumlah} kelas: ${h.pesan}`);
    daftar = await muatKelasKegiatan(db, kegiatanId);
  }
  return { ok: true, jumlah: daftar.length };
}

export async function tambahKelas(db: Db, kegiatanId: number, nama?: unknown): Promise<Hasil & { nomor?: number }> {
  const t = await pastikanTabel(db);
  if (!t.ok) return t;
  await tuliskanTampak(db, kegiatanId);
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  if (daftar.length >= KELAS_MAKS) return gagal(`Paling banyak ${KELAS_MAKS} kelas.`);
  const dipakai = new Set(daftar.map((k) => k.nomor));
  let nomor = 1;
  while (dipakai.has(nomor)) nomor++;
  let namaBaru = namaKelasBawaan(nomor);
  if (nama !== undefined && nama !== null && String(nama).trim() !== "") {
    const n = periksaNamaKelas(nama);
    if (!n.ok) return n;
    namaBaru = n.nama;
  }
  if (daftar.some((k) => k.nama.toLowerCase() === namaBaru.toLowerCase())) return gagal("Nama kelas itu sudah dipakai kelas lain.");
  const { error } = await db.from("sigap_pelatihan_kelas").insert({ kegiatan_id: kegiatanId, nomor, nama: namaBaru });
  return error ? gagal("Gagal menambah kelas.") : { ok: true, nomor };
}

/** Hapus kelas yang kosong. Sisa minimal satu kelas. Pengaturan kuis kelas itu ikut dibuang. */
export async function hapusKelas(db: Db, kegiatanId: number, nomor: number): Promise<Hasil> {
  if (!nomorKelasSah(nomor)) return gagal("Nomor kelas tidak sah.");
  const t = await pastikanTabel(db);
  if (!t.ok) return t;
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  if (!daftar.some((k) => k.nomor === nomor)) return gagal("Kelas itu tidak ada.");
  if (daftar.length <= 1) return gagal("Pelatihan harus punya minimal satu kelas.");
  const [pes, ins, ruang] = await Promise.all([
    db.from("sigap_penugasan").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true).eq("kelas", nomor),
    db.from("sigap_kuis_instruktur_kelas").select("akun_id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("kelas", nomor),
    db.from("sigap_kuis_ruang").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("kelas", nomor).neq("status", "selesai"),
  ]);
  if ((pes.count ?? 0) > 0) return gagal(`Kelas ini masih berisi ${pes.count} peserta. Pindahkan dahulu.`);
  if ((ins.count ?? 0) > 0) return gagal("Kelas ini masih punya instruktur. Pindahkan atau lepas dahulu.");
  if ((ruang.count ?? 0) > 0) return gagal("Ruang Adu Sigap kelas ini masih berjalan. Hentikan dahulu.");
  await db.from("sigap_pelatihan_kelas").delete().eq("kegiatan_id", kegiatanId).eq("nomor", nomor);
  await db.from("sigap_kuis_kelas").delete().eq("kegiatan_id", kegiatanId).eq("kelas", nomor);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Tulis (peserta -> kelas)
// ---------------------------------------------------------------------------------------------
/** Pindahkan peserta (penugasan_id) ke `kelas`; kelas harus ada dan kuotanya cukup. Mengembalikan jumlah yang berubah. */
export async function pindahkanPesertaKelas(db: Db, kegiatanId: number, penugasanIds: readonly number[], kelas: number | null): Promise<Hasil & { berubah?: number }> {
  const ids = [...new Set(penugasanIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return gagal("Pilih peserta lebih dahulu.");
  if (ids.length > 2000) return gagal("Terlalu banyak peserta sekaligus.");
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  const tujuan = kelas === null ? null : daftar.find((k) => k.nomor === kelas);
  if (kelas !== null && !tujuan) return gagal("Kelas tujuan tidak ada di pelatihan ini.");
  const peserta = await muatPesertaKelas(db, kegiatanId);
  const dipilih = peserta.filter((p) => ids.includes(p.penugasan_id));
  if (dipilih.length === 0) return gagal("Peserta itu bukan peserta aktif pelatihan ini.");
  const perlu = dipilih.filter((p) => p.kelas !== kelas);
  if (perlu.length === 0) return { ok: true, berubah: 0 };
  if (tujuan?.kuota != null) {
    const sudah = peserta.filter((p) => p.kelas === kelas).length;
    if (sudah + perlu.length > tujuan.kuota) return gagal(`${tujuan.nama} berkuota ${tujuan.kuota}; berisi ${sudah}, tidak muat ${perlu.length} lagi.`);
  }
  const { error } = await db.from("sigap_penugasan").update({ kelas }).eq("kegiatan_id", kegiatanId).eq("aktif", true).in("id", perlu.map((p) => p.penugasan_id));
  return error ? gagal("Gagal memindahkan peserta.") : { ok: true, berubah: perlu.length };
}

/** Peserta aktif yang belum berkelas (atau berkelas di luar daftar) dimasukkan ke `kelas`. */
export async function masukkanBelumBerkelas(db: Db, kegiatanId: number, kelas: number): Promise<Hasil & { berubah?: number }> {
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  const peserta = await muatPesertaKelas(db, kegiatanId);
  const nomorAda = new Set(daftar.map((k) => k.nomor));
  const yatim = peserta.filter((p) => p.kelas == null || !nomorAda.has(p.kelas));
  if (yatim.length === 0) return { ok: true, berubah: 0 };
  return pindahkanPesertaKelas(db, kegiatanId, yatim.map((p) => p.penugasan_id), kelas);
}

/** Bagi SEMUA peserta aktif ke seluruh kelas serata mungkin, urut nama (potongan berurutan). */
export async function bagiRataPeserta(db: Db, kegiatanId: number): Promise<Hasil & { berubah?: number }> {
  const daftar = await muatKelasKegiatan(db, kegiatanId);
  const peserta = await muatPesertaKelas(db, kegiatanId);
  if (peserta.length === 0) return gagal("Belum ada peserta aktif.");
  const ukuran = ukuranBagiRata(peserta.length, daftar.length);
  const kuotaLanggar = daftar.find((k, i) => k.kuota != null && ukuran[i] > k.kuota);
  if (kuotaLanggar) return gagal(`Pembagian rata tidak muat di kuota ${kuotaLanggar.nama} (${kuotaLanggar.kuota}). Ubah kuota atau tambah kelas.`);
  let berubah = 0;
  let awal = 0;
  for (let i = 0; i < daftar.length; i++) {
    const potong = peserta.slice(awal, awal + ukuran[i]);
    awal += ukuran[i];
    const perlu = potong.filter((p) => p.kelas !== daftar[i].nomor);
    if (perlu.length === 0) continue;
    const { error } = await db.from("sigap_penugasan").update({ kelas: daftar[i].nomor }).eq("kegiatan_id", kegiatanId).eq("aktif", true).in("id", perlu.map((p) => p.penugasan_id));
    if (error) return gagal("Gagal membagi peserta.");
    berubah += perlu.length;
  }
  return { ok: true, berubah };
}
