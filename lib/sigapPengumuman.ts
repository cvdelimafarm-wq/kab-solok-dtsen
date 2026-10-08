// lib/sigapPengumuman.ts
//
// (8 Okt 2026) SIGAP > Pelatihan > Pengumuman: modal pengumuman peserta yang diatur panitia di Kelola Pelatihan.
// Fungsi MURNI (tanpa database/React) dipakai bersama server & klien: validasi isian, pengurai isi pesan, pemilihan
// modal yang tampil (jadwal, sasaran), dan kunci "sekali per peserta".
//
// Isi pesan = teks biasa dengan penanda sederhana (TIDAK memakai HTML, jadi aman dari kode berbahaya):
//   **tebal**   ==sorot==   [teks](https://tautan)   baris diawali "- " = daftar
// Hanya tautan https:// yang diterima.

export const JENIS_PENGUMUMAN = ["info", "perhatian", "penting"] as const;
export type JenisPengumuman = (typeof JENIS_PENGUMUMAN)[number];
export const LABEL_JENIS_PENGUMUMAN: Record<JenisPengumuman, string> = { info: "Info (biru)", perhatian: "Perhatian (kuning)", penting: "Penting (merah)" };
export const IKON_PENGUMUMAN: Record<JenisPengumuman, string> = { info: "ℹ️", perhatian: "⚠️", penting: "⛔" };
export const JUDUL_BAWAAN_PENGUMUMAN: Record<JenisPengumuman, string> = { info: "INFO", perhatian: "PERHATIAN", penting: "PENTING" };

export type FrekuensiPengumuman = "tiap" | "sekali";
export const LABEL_FREKUENSI: Record<FrekuensiPengumuman, string> = { tiap: "Setiap halaman Langkah dibuka", sekali: "Sekali per peserta (setelah ditutup)" };

export const PERAN_SASARAN = ["ppl", "pml"] as const;
export const MAKS_JUDUL = 120;
export const MAKS_ISI = 2000;
export const MAKS_LABEL_TOMBOL = 60;
export const MAKS_URL = 500;
export const MAKS_PENGUMUMAN = 30;

/** Baris tabel sigap_pengumuman. */
export type Pengumuman = {
  id: number;
  kegiatan_id: number;
  urut: number;
  judul: string;
  jenis: JenisPengumuman;
  isi: string;
  tombol_label: string | null;
  tombol_url: string | null;
  frekuensi: FrekuensiPengumuman;
  sasaran_kelas: number | null;
  sasaran_peran: string | null;
  mulai_at: string | null;
  akhir_at: string | null;
  aktif: boolean;
  dibuat_at: string;
  diubah_at: string;
};
export const KOLOM_PENGUMUMAN = "id, kegiatan_id, urut, judul, jenis, isi, tombol_label, tombol_url, frekuensi, sasaran_kelas, sasaran_peran, mulai_at, akhir_at, aktif, dibuat_at, diubah_at";

/** Bentuk yang dikirim ke peserta (tanpa sasaran/jadwal). `versi` = diubah_at: bila panitia mengubah modal, "sekali" berlaku lagi. */
export type PengumumanPeserta = {
  id: number;
  versi: string;
  judul: string;
  jenis: JenisPengumuman;
  isi: string;
  tombol_label: string | null;
  tombol_url: string | null;
  frekuensi: FrekuensiPengumuman;
};

export function jenisPengumumanValid(x: unknown): x is JenisPengumuman {
  return typeof x === "string" && (JENIS_PENGUMUMAN as readonly string[]).includes(x);
}

/** Hanya https:// yang aman dipakai sebagai tautan. */
export function urlAman(u: unknown): u is string {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (s.length === 0 || s.length > MAKS_URL || /\s/.test(s)) return false;
  try {
    const p = new URL(s);
    return p.protocol === "https:" && p.hostname.length > 0;
  } catch {
    return false;
  }
}

// ======================================================================
// Pengurai isi pesan
// ======================================================================
export type Sebaris =
  | { t: "teks"; teks: string }
  | { t: "tebal"; teks: string }
  | { t: "sorot"; teks: string }
  | { t: "tautan"; teks: string; url: string };
export type BlokIsi = { tipe: "p"; baris: Sebaris[] } | { tipe: "daftar"; butir: Sebaris[][] };

/** Pecah satu baris menjadi potongan teks/tebal/sorot/tautan (tanpa bersarang). */
export function uraiSebaris(baris: string): Sebaris[] {
  const out: Sebaris[] = [];
  const re = /\*\*(.+?)\*\*|==(.+?)==|\[([^\]]+?)\]\((\S+?)\)/g;
  let akhir = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(baris))) {
    if (m.index > akhir) out.push({ t: "teks", teks: baris.slice(akhir, m.index) });
    if (m[1] !== undefined) out.push({ t: "tebal", teks: m[1] });
    else if (m[2] !== undefined) out.push({ t: "sorot", teks: m[2] });
    else if (urlAman(m[4])) out.push({ t: "tautan", teks: m[3], url: m[4] });
    else out.push({ t: "teks", teks: m[3] }); // tautan tidak aman: tampil sebagai teks biasa
    akhir = m.index + m[0].length;
  }
  if (akhir < baris.length) out.push({ t: "teks", teks: baris.slice(akhir) });
  return out;
}

/** Isi pesan -> blok paragraf & daftar. Baris kosong memisahkan paragraf; baris "- " membentuk daftar. */
export function uraiIsi(isi: string): BlokIsi[] {
  const blok: BlokIsi[] = [];
  const baris = String(isi ?? "").replace(/\r\n?/g, "\n").split("\n");
  const st: { par: Sebaris[]; daftar: Sebaris[][] } = { par: [], daftar: [] };
  const tutup = () => {
    if (st.par.length) blok.push({ tipe: "p", baris: st.par });
    if (st.daftar.length) blok.push({ tipe: "daftar", butir: st.daftar });
    st.par = [];
    st.daftar = [];
  };
  for (const b of baris) {
    if (/^\s*[-•]\s+/.test(b)) {
      if (st.par.length) tutup();
      st.daftar.push(uraiSebaris(b.replace(/^\s*[-•]\s+/, "")));
    } else if (b.trim() === "") {
      tutup();
    } else {
      if (st.daftar.length) tutup();
      // baris berturut-turut dalam satu paragraf dipisah baris baru
      if (st.par.length) st.par.push({ t: "teks", teks: "\n" });
      st.par.push(...uraiSebaris(b));
    }
  }
  tutup();
  return blok;
}

// ======================================================================
// Validasi isian panitia
// ======================================================================
export type IsianPengumuman = {
  judul: string;
  jenis: JenisPengumuman;
  isi: string;
  tombol_label: string | null;
  tombol_url: string | null;
  frekuensi: FrekuensiPengumuman;
  sasaran_kelas: number | null;
  sasaran_peran: string | null;
  mulai_at: string | null;
  akhir_at: string | null;
  aktif: boolean;
};

const waktuAtauNull = (x: unknown): { ok: true; v: string | null } | { ok: false } => {
  if (x === null || x === undefined || x === "") return { ok: true, v: null };
  if (typeof x !== "string") return { ok: false };
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, v: d.toISOString() };
};

export function validasiIsianPengumuman(x: unknown): { ok: true; nilai: IsianPengumuman } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const judul = typeof o.judul === "string" ? o.judul.trim() : "";
  const isi = typeof o.isi === "string" ? o.isi.replace(/\r\n?/g, "\n").trim() : "";
  if (judul.length > MAKS_JUDUL) return { ok: false, pesan: `Judul maksimal ${MAKS_JUDUL} karakter.` };
  if (isi.length > MAKS_ISI) return { ok: false, pesan: `Isi pesan maksimal ${MAKS_ISI} karakter.` };
  if (!judul && !isi) return { ok: false, pesan: "Isi judul atau isi pesan terlebih dahulu." };
  if (!jenisPengumumanValid(o.jenis)) return { ok: false, pesan: "Jenis tampilan tidak dikenal." };
  const frekuensi = o.frekuensi === "tiap" ? "tiap" : o.frekuensi === "sekali" ? "sekali" : null;
  if (!frekuensi) return { ok: false, pesan: "Frekuensi tampil tidak valid." };

  let label: string | null = typeof o.tombol_label === "string" && o.tombol_label.trim() ? o.tombol_label.trim() : null;
  let url: string | null = typeof o.tombol_url === "string" && o.tombol_url.trim() ? o.tombol_url.trim() : null;
  if (label && label.length > MAKS_LABEL_TOMBOL) return { ok: false, pesan: `Label tombol maksimal ${MAKS_LABEL_TOMBOL} karakter.` };
  if (!label && !url) {
    label = null;
    url = null;
  } else if (!label || !url) {
    return { ok: false, pesan: "Tombol tautan perlu label DAN alamat (atau kosongkan keduanya)." };
  } else if (!urlAman(url)) {
    return { ok: false, pesan: "Alamat tombol harus diawali https:// dan berupa tautan yang valid." };
  }

  let kelas: number | null = null;
  if (o.sasaran_kelas !== null && o.sasaran_kelas !== undefined && o.sasaran_kelas !== "") {
    kelas = Number(o.sasaran_kelas);
    if (!Number.isInteger(kelas) || kelas < 1 || kelas > 20) return { ok: false, pesan: "Kelas sasaran tidak valid." };
  }
  let peran: string | null = null;
  if (typeof o.sasaran_peran === "string" && o.sasaran_peran.trim()) {
    peran = o.sasaran_peran.trim().toLowerCase();
    if (!(PERAN_SASARAN as readonly string[]).includes(peran)) return { ok: false, pesan: "Peran sasaran tidak valid." };
  }
  const mulai = waktuAtauNull(o.mulai_at);
  const akhir = waktuAtauNull(o.akhir_at);
  if (!mulai.ok || !akhir.ok) return { ok: false, pesan: "Waktu mulai/berakhir tidak valid." };
  if (mulai.v && akhir.v && new Date(akhir.v).getTime() <= new Date(mulai.v).getTime()) return { ok: false, pesan: "Waktu berakhir harus setelah waktu mulai." };

  return {
    ok: true,
    nilai: {
      judul,
      jenis: o.jenis,
      isi,
      tombol_label: label,
      tombol_url: url,
      frekuensi,
      sasaran_kelas: kelas,
      sasaran_peran: peran,
      mulai_at: mulai.v,
      akhir_at: akhir.v,
      aktif: o.aktif === true,
    },
  };
}

// ======================================================================
// Pemilihan modal untuk peserta
// ======================================================================
/** Modal ini boleh tampil sekarang bagi peserta tersebut? (aktif, dalam jadwal, sesuai kelas & peran) */
export function tampilUntuk(p: Pick<Pengumuman, "aktif" | "mulai_at" | "akhir_at" | "sasaran_kelas" | "sasaran_peran">, peserta: { kelas: number | null; peran: string }, sekarang: Date): boolean {
  if (!p.aktif) return false;
  const t = sekarang.getTime();
  if (p.mulai_at && t < new Date(p.mulai_at).getTime()) return false;
  if (p.akhir_at && t >= new Date(p.akhir_at).getTime()) return false;
  if (p.sasaran_kelas != null && p.sasaran_kelas !== peserta.kelas) return false;
  if (p.sasaran_peran && p.sasaran_peran.toLowerCase() !== String(peserta.peran).toLowerCase()) return false;
  return true;
}

export function keBentukPeserta(p: Pengumuman): PengumumanPeserta {
  return { id: p.id, versi: p.diubah_at, judul: p.judul, jenis: p.jenis, isi: p.isi, tombol_label: p.tombol_label, tombol_url: p.tombol_url, frekuensi: p.frekuensi };
}

/** Kunci penyimpanan browser: modal "sekali" yang sudah ditutup. Berubah bila panitia mengubah modal (versi). */
export const kunciSudahLihat = (akunId: string, p: Pick<PengumumanPeserta, "id" | "versi">) => `sigap_pel_pengumuman_${akunId}_${p.id}_${p.versi}`;
