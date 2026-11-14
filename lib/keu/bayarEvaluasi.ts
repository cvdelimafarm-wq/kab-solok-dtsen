// lib/keu/bayarEvaluasi.ts
//
// (14 Nov 2026, Fase 6 "Uang keluar dan evaluasi") Berkas MURNI untuk tahap 8 identifikasi survei:
//  * bentuk data keu_daftar_bayar (daftar bayar dari hari kerja yang sah x tarif kegiatan per peran, dibatasi maks_hari),
//  * bentuk data keu_ident_evaluasi_bahan (rapor survei) dan keu_ident_spk_sekaligus (pratinjau SPK),
//  * CSV daftar bayar, persen, dan kalimat rapor. Angka dihitung basis data; berkas ini hanya merangkum dan memformat.

export type BarisBayar = {
  penugasan_id: number; akun_id: number; nama: string; jenis: string; peran: string; maks_hari: number | null;
  n_hari: number; n_lampau: number; n_sah: number; n_dibayar: number; n_rencana: number;
  tarif: number | string; nominal: number | string; nominal_rencana: number | string; terverifikasi: boolean;
};
export type KegiatanBayar = {
  kegiatan_id: number; nama: string; fungsi: string; wajib_laporan: boolean; jumlah_foto: number;
  baris: BarisBayar[]; total: number | string; total_rencana: number | string; tanpa_tarif: number;
};
export type DaftarBayar = { hari_ini: string; ident_id: number; ro_kode: string; kegiatan: KegiatanBayar[]; dicatat_ro: number | string };

export type PratinjauSpk = {
  uji: boolean; status_lanjutan?: string; sudah_terbit: number;
  siap?: { kode: string; nama: string; peran: string; konsep: boolean }[];
  terbit?: { kode: string; nama: string; nomor: string }[];
  lewat: { kode: string; nama: string; alasan: string }[];
};

export type BahanEvaluasi = {
  ident: { id: number; nama: string; ro_kode: string; tahun: number; status: string };
  boleh_ubah: boolean;
  evaluasi: { pelajaran: string; kalibrasi: string; tindak_lanjut: string; disimpan_at: string; disimpan_nama: string | null } | null;
  spk: { mitra: number; terbit: number; terbit_tanggal: { kunci: string; tanggal: string }[] };
  delego: { butir: number; selesai: number; batal: number; berjalan: number; lewat_tenggat: number; laporan: number; poin: number | string; poin_diakui: number | string; rata_faktor: number | string | null } | null;
  penilaian360: { n: number; penilai: number; dinilai: number; rata: number | string | null } | null;
  bayar: DaftarBayar;
};

const n = (x: number | string | null | undefined): number => {
  const v = typeof x === "number" ? x : Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
};
/** Rupiah ringkas untuk kartu angka (mis. "Rp7,48 jt"); angka penuh tetap di tabel. */
export function rpRingkas(x: number | string): string {
  const v = n(x);
  if (Math.abs(v) >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`;
  return `Rp${v.toLocaleString("id-ID")}`;
}
export const persen = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

export type RingkasBayar = { orang: number; hariSah: number; hariRencana: number; total: number; totalRencana: number; terverifikasi: number; tanpaTarif: number; belumSah: number };

export function ringkasBayar(d: DaftarBayar): RingkasBayar {
  const r: RingkasBayar = { orang: 0, hariSah: 0, hariRencana: 0, total: 0, totalRencana: 0, terverifikasi: 0, tanpaTarif: 0, belumSah: 0 };
  for (const k of d.kegiatan) {
    r.total += n(k.total);
    r.totalRencana += n(k.total_rencana);
    r.tanpaTarif += k.tanpa_tarif;
    for (const b of k.baris) {
      r.orang++;
      r.hariSah += b.n_dibayar;
      r.hariRencana += b.n_rencana;
      if (b.terverifikasi) r.terverifikasi++;
      r.belumSah += Math.max(0, b.n_lampau - b.n_sah);
    }
  }
  return r;
}

const sel = (v: string | number): string => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (pemisah titik koma, cocok untuk Excel berbahasa Indonesia) satu kegiatan. */
export function csvBayar(k: KegiatanBayar): string {
  const kepala = ["No", "Nama", "Jenis", "Peran", "Hari terjadwal", "Hari lampau", "Hari sah", "Batas hari", "Hari dibayar", "Tarif", "Nominal", "Terverifikasi"];
  const isi = k.baris.map((b, i) => [i + 1, b.nama, b.jenis, b.peran.toUpperCase(), b.n_hari, b.n_lampau, b.n_sah, b.maks_hari ?? "", b.n_dibayar, n(b.tarif), n(b.nominal), b.terverifikasi ? "ya" : "belum"]);
  const jumlah = ["", "Jumlah", "", "", "", "", "", "", k.baris.reduce((s, b) => s + b.n_dibayar, 0), "", n(k.total), ""];
  return [kepala, ...isi, jumlah].map((r) => r.map(sel).join(";")).join("\n");
}

/** Kalimat rapor singkat untuk kepala halaman evaluasi. */
export function kalimatRapor(b: BahanEvaluasi): string[] {
  const out: string[] = [];
  const rb = ringkasBayar(b.bayar);
  out.push(b.spk.mitra > 0 ? `SPK terbit ${b.spk.terbit} dari ${b.spk.mitra} mitra.` : "Tidak ada mitra pada identifikasi lanjutan.");
  if (rb.hariRencana > 0) out.push(`Hari kerja sah ${rb.hariSah} dari ${rb.hariRencana} hari terjadwal (${persen(rb.hariSah, rb.hariRencana)}%).`);
  if (rb.belumSah > 0) out.push(`${rb.belumSah} hari lampau belum sah (laporan atau foto belum lengkap).`);
  if (b.delego && b.delego.butir > 0) out.push(`Delego: ${b.delego.selesai} dari ${b.delego.butir} butir selesai; ${b.delego.lewat_tenggat} pernah lewat tenggat.`);
  if (b.penilaian360 && b.penilaian360.n > 0) out.push(`Penilaian 360: ${b.penilaian360.n} penilaian dari ${b.penilaian360.penilai} penilai, rata-rata ${n(b.penilaian360.rata).toLocaleString("id-ID")}.`);
  return out;
}

export const MIN_NAMA_SALIN = 3;
export const galatSalin = (nama: string, namaLama: string): string | null => {
  const t = nama.trim();
  if (t.length < MIN_NAMA_SALIN) return "Nama survei baru minimal 3 huruf.";
  if (t.toLowerCase() === namaLama.trim().toLowerCase()) return "Nama survei baru harus berbeda dari survei ini.";
  return null;
};
