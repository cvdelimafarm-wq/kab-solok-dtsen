// lib/delego/rekap.ts
//
// (1 Nov 2026) Beban terpadu: delegasi + hari kerja pendataan terpilih + hari pelatihan + ketersediaan (cuti, izin, dinas luar) menjadi satu matriks beban per pegawai per hari,
// dengan rekap per kegiatan. Berkas MURNI. Sumber data: keu_dlg_bahan (delegasi) dan keu_dlg_rekap (lapangan dan ketersediaan), 20261101zb.
//
// Aturan (rancangan 1 Nov 2026):
//  - Hari lapangan (pendataan terpilih atau pelatihan) = satu blok penuh = kapasitas hari itu, dihitung sekali per pegawai per hari per kegiatan.
//  - Delegasi berstatus Usulan tidak membebani; tampil sebagai bayangan (garis putus) agar beban yang sedang diusulkan terlihat.
//  - Kapasitas hari = kapasitasPada(tanggal) dikurangi fraksi tidak tersedia yang DISETUJUI; hari libur dan akhir pekan berkapasitas 0.
//  - Surat tugas adalah payung dan tidak masuk hitungan; yang membebani adalah kegiatan di dalamnya.

import { awalMinggu, bebanDelegasiHari, hariKe, hariLibur, kapasitasPada, kategoriBeban, namaLibur, tambahHari, type KategoriBeban } from "./hitung";
import type { BarisLapangan, Delegasi, Ketersediaan } from "./tipe";

export type SumberBeban = "delegasi" | "lapangan" | "pelatihan";
export type RincianBeban = { sumber: SumberBeban; kegiatanId: number | null; kegiatan: string; poin: number; judul?: string };
export type KategoriSel = KategoriBeban | "kosong" | "tidak_tersedia";
export type SelRekap = {
  tanggal: string;
  hk: number;
  kapasitas: number;
  poin: number;
  persen: number;
  kategori: KategoriSel;
  libur: string | null;
  /** Poin dari usulan pegawai yang belum disetujui (tidak termasuk `poin`). */
  bayangan: number;
  ketersediaan: { jenis: string; status: string; fraksi: number } | null;
  rincian: RincianBeban[];
};
export type BarisRekap = {
  akun: number;
  nama: string;
  sel: SelRekap[];
  total: number;
  kapasitas: number;
  persen: number;
  kategori: KategoriSel;
  perKegiatan: { kegiatanId: number | null; kegiatan: string; poin: number }[];
  bayangan: number;
};
export type KegiatanRekap = { id: number | null; nama: string };
export type HasilRekap = {
  tanggal: string[];
  baris: BarisRekap[];
  kegiatan: KegiatanRekap[];
  ringkas: { jumlah: number; sasaran: number; berlebih: number; ringan: number; tidakTersedia: number };
  adaAkhirPekan: boolean;
};

export const NAMA_KANTOR = "Pekerjaan kantor";
/** Saringan kegiatan: null = semua (rekap); angka = satu kegiatan SIGAP; "kantor" = butir tanpa kegiatan. */
export type SaringanKegiatan = number | "kantor" | null;

export type MasukanRekap = {
  orang: { akun: number; nama: string }[];
  delegasi: Delegasi[];
  lapangan: BarisLapangan[];
  ketersediaan: Ketersediaan[];
  dari: string;
  sampai: string;
  /** Nama kegiatan untuk butir bertautan (id -> nama); yang tidak ada dinamai "Kegiatan <id>". */
  namaKegiatan?: Record<number, string>;
  kegiatan?: SaringanKegiatan;
};

export function rentangTanggal(dari: string, sampai: string, maks = 63): string[] {
  const hasil: string[] = [];
  for (let t = dari; t <= sampai && hasil.length < maks; t = tambahHari(t, 1)) hasil.push(t);
  return hasil;
}

/** Awal dan akhir (Senin sampai Minggu) minggu yang memuat `hari`. */
export const rentangMinggu = (hari: string): { dari: string; sampai: string } => {
  const dari = awalMinggu(hari);
  return { dari, sampai: tambahHari(dari, 6) };
};

const ambil = (x: string | number): number => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
};

export function susunRekap(m: MasukanRekap): HasilRekap {
  const tanggal = rentangTanggal(m.dari, m.sampai);
  const saring = m.kegiatan ?? null;
  const nama = (id: number | null, lain?: string): string => (id === null ? NAMA_KANTOR : (m.namaKegiatan?.[id] ?? lain ?? `Kegiatan ${id}`));
  const cocok = (id: number | null) => (saring === null ? true : saring === "kantor" ? id === null : id === saring);
  const daftarKegiatan = new Map<string, KegiatanRekap>();
  const catat = (id: number | null, n: string) => daftarKegiatan.set(String(id), { id, nama: n });

  const baris: BarisRekap[] = m.orang.map((o) => {
    const punyaDelegasi = m.delegasi.filter((d) => d.penerima_akun === o.akun);
    const punyaLapangan = m.lapangan.filter((l) => l.akun === o.akun);
    const punyaCuti = m.ketersediaan.filter((k) => k.akun === o.akun);
    const sel: SelRekap[] = tanggal.map((t) => {
      const rincian: RincianBeban[] = [];
      let bayangan = 0;
      for (const d of punyaDelegasi) {
        const id = d.kegiatan_id ?? null;
        if (!cocok(id)) continue;
        if (d.status === "usulan") {
          bayangan += bebanDelegasiHari({ ...d, status: "baru" }, t);
          continue;
        }
        const poin = bebanDelegasiHari(d, t);
        if (poin > 0) {
          rincian.push({ sumber: "delegasi", kegiatanId: id, kegiatan: nama(id), poin, judul: d.judul });
          catat(id, nama(id));
        }
      }
      const unik = new Set<number>();
      for (const l of punyaLapangan) {
        if (l.tanggal !== t || unik.has(l.kegiatan_id) || !cocok(l.kegiatan_id)) continue;
        unik.add(l.kegiatan_id);
        rincian.push({ sumber: l.jenis === "pelatihan" ? "pelatihan" : "lapangan", kegiatanId: l.kegiatan_id, kegiatan: nama(l.kegiatan_id, l.kegiatan), poin: kapasitasPada(t), judul: l.peran ? `Peran ${l.peran.toUpperCase()}` : undefined });
        catat(l.kegiatan_id, nama(l.kegiatan_id, l.kegiatan));
      }
      const hk = hariKe(t);
      const libur = namaLibur(t);
      const kerja = hk <= 5 && !hariLibur(t);
      // ketersediaan: fraksi tidak tersedia yang DISETUJUI mengurangi kapasitas; yang masih diajukan hanya ditandai
      const aktifPada = punyaCuti.filter((k) => k.mulai <= t && t <= k.selesai);
      const setuju = aktifPada.filter((k) => k.status === "disetujui");
      const fraksi = Math.min(1, setuju.reduce((s, k) => s + ambil(k.fraksi), 0));
      const tampil = setuju[0] ?? aktifPada.find((k) => k.status === "diajukan") ?? null;
      const kapasitas = kerja ? Math.round(kapasitasPada(t) * (1 - fraksi) * 100) / 100 : 0;
      const poin = rincian.reduce((s, r) => s + r.poin, 0);
      const persen = kapasitas > 0 ? Math.round((poin / kapasitas) * 100) : poin > 0 ? 999 : 0;
      let kategori: KategoriSel;
      if (poin === 0) kategori = fraksi >= 1 ? "tidak_tersedia" : "kosong";
      else kategori = kapasitas > 0 ? kategoriBeban(persen) : "berlebih";
      return {
        tanggal: t, hk, kapasitas, poin, persen, kategori, libur, bayangan,
        ketersediaan: tampil ? { jenis: tampil.jenis, status: tampil.status, fraksi: ambil(tampil.fraksi) } : null,
        rincian,
      };
    });
    const total = sel.reduce((s, x) => s + x.poin, 0);
    const kapasitas = sel.reduce((s, x) => s + x.kapasitas, 0);
    const persen = kapasitas > 0 ? Math.round((total / kapasitas) * 100) : total > 0 ? 999 : 0;
    const semuaCuti = kapasitas === 0 && sel.some((x) => x.ketersediaan?.status === "disetujui");
    const kategori: KategoriSel = semuaCuti && total === 0 ? "tidak_tersedia" : total === 0 ? "kosong" : kategoriBeban(persen);
    const perKegiatan = new Map<string, { kegiatanId: number | null; kegiatan: string; poin: number }>();
    for (const s of sel) for (const r of s.rincian) {
      const k = String(r.kegiatanId);
      const x = perKegiatan.get(k) ?? { kegiatanId: r.kegiatanId, kegiatan: r.kegiatan, poin: 0 };
      x.poin += r.poin;
      perKegiatan.set(k, x);
    }
    return {
      akun: o.akun, nama: o.nama, sel, total, kapasitas, persen, kategori,
      perKegiatan: [...perKegiatan.values()].sort((a, b) => b.poin - a.poin),
      bayangan: sel.reduce((s, x) => s + x.bayangan, 0),
    };
  });

  const urut = [...baris].sort((a, b) => (b.persen === 999 ? 999 : b.persen) - (a.persen === 999 ? 999 : a.persen) || a.nama.localeCompare(b.nama));
  const hitung = (k: KategoriSel) => urut.filter((b) => b.kategori === k).length;
  return {
    tanggal,
    baris: urut,
    kegiatan: [...daftarKegiatan.values()].sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || a.nama.localeCompare(b.nama)),
    ringkas: { jumlah: urut.length, sasaran: hitung("sasaran"), berlebih: hitung("berlebih"), ringan: hitung("ringan") + hitung("kosong"), tidakTersedia: hitung("tidak_tersedia") },
    adaAkhirPekan: urut.some((b) => b.sel.some((s) => s.hk >= 6 && s.poin > 0)),
  };
}
