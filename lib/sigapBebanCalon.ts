// lib/sigapBebanCalon.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Peringatan BEBAN untuk penunjukan langsung: sebelum PJ memplot seseorang ke kegiatan, tampilkan (1) beban Delego orang itu beberapa minggu ke depan
// memakai rumus yang sama dengan layar Delego (lib/delego/hitung.ts) dan (2) penugasan kegiatan lain yang periodenya beririsan. Hanya peringatan; tidak memblokir.
// Alasan dua sumber: penugasan survei (sigap_penugasan) tidak dihitung Delego, sehingga Mitra yang sudah dua survei tampak "ringan" bila hanya melihat Delego.

import { awalMinggu, bebanPerOrang, hariKe, kapasitasMinggu, kategoriBeban, tambahHari, tglPendek, type KategoriBeban } from "@/lib/delego/hitung";
import type { Delegasi } from "@/lib/delego/tipe";

export type MingguBeban = { mulai: string; poin: number; kapasitas: number; persen: number; kategori: KategoriBeban };

/** Beban satu orang pada `jumlah` minggu berturut-turut mulai minggu yang memuat `hariIni` (mulai pekan depan bila hariIni Sabtu/Minggu); poin Delego aktif: baru/berjalan. */
export function bebanMingguan(delegasi: Delegasi[], akun: { id: number; nama: string; jenis: "organik" | "mitra" }, hariIni: string, jumlah = 4): { minggu: MingguBeban[]; delegasiAktif: number } {
  const milik = delegasi.filter((d) => d.penerima_akun === akun.id && (d.status === "baru" || d.status === "berjalan"));
  const minggu: MingguBeban[] = [];
  // Sabtu dan Minggu: pekan berjalan hampir habis (hari kerjanya sudah lewat), mulai dari pekan depan.
  const awal = hariKe(hariIni) >= 6 ? tambahHari(awalMinggu(hariIni), 7) : awalMinggu(hariIni);
  for (let i = 0; i < Math.max(1, Math.min(12, jumlah)); i++) {
    const hari = tambahHari(awal, 7 * i);
    const o = bebanPerOrang(milik, hari, [akun]).find((x) => x.akun === akun.id);
    const poin = o?.beban ?? 0;
    const kapasitas = kapasitasMinggu(hari);
    const persen = kapasitas > 0 ? Math.round((poin / kapasitas) * 100) : 0;
    minggu.push({ mulai: awalMinggu(hari), poin: Math.round(poin * 10) / 10, kapasitas, persen, kategori: kategoriBeban(persen) });
  }
  return { minggu, delegasiAktif: milik.length };
}

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const sah = (t: string | null | undefined): t is string => typeof t === "string" && TGL.test(t.slice(0, 10));

/** Dua rentang tanggal beririsan? null bila salah satu rentang belum lengkap (tidak bisa dipastikan). */
export function irisanPeriode(a: { mulai: string | null; selesai: string | null }, b: { mulai: string | null; selesai: string | null }): boolean | null {
  if (!sah(a.mulai) || !sah(a.selesai) || !sah(b.mulai) || !sah(b.selesai)) return null;
  const am = a.mulai.slice(0, 10);
  const as = a.selesai.slice(0, 10);
  const bm = b.mulai.slice(0, 10);
  const bs = b.selesai.slice(0, 10);
  return am <= bs && bm <= as;
}

export type PenugasanLain = { kegiatan_id: number; nama: string; peran: string; mulai: string | null; selesai: string | null; beririsan: boolean | null };
export type TingkatPeringatan = "aman" | "perhatian" | "berat";
export type PeringatanCalon = { tingkat: TingkatPeringatan; pesan: string[]; maks_persen: number; minggu_terberat: string | null };

const URUT: Record<TingkatPeringatan, number> = { aman: 0, perhatian: 1, berat: 2 };
const naik = (a: TingkatPeringatan, b: TingkatPeringatan): TingkatPeringatan => (URUT[b] > URUT[a] ? b : a);

/**
 * Menyusun peringatan dari beban mingguan dan penugasan lain.
 * Beban: >100% kapasitas = berat; 80-100% = perhatian. Penugasan beririsan: 1 = perhatian, 2 atau lebih = berat. Periode belum lengkap = hanya keterangan.
 */
export function susunPeringatan(minggu: readonly MingguBeban[], lain: readonly PenugasanLain[]): PeringatanCalon {
  let tingkat: TingkatPeringatan = "aman";
  const pesan: string[] = [];

  let terberat: MingguBeban | null = null;
  for (const m of minggu) if (terberat === null || m.persen > terberat.persen) terberat = m;
  if (terberat && terberat.kategori === "berlebih") {
    tingkat = naik(tingkat, "berat");
    pesan.push(`Beban Delego pekan ${tglPendek(terberat.mulai)} mencapai ${terberat.persen}% kapasitas (berlebih).`);
  } else if (terberat && terberat.kategori === "sasaran") {
    tingkat = naik(tingkat, "perhatian");
    pesan.push(`Beban Delego pekan ${tglPendek(terberat.mulai)} sudah ${terberat.persen}% kapasitas (mendekati penuh).`);
  }

  const irisan = lain.filter((p) => p.beririsan === true);
  const takPasti = lain.filter((p) => p.beririsan === null);
  if (irisan.length > 0) {
    tingkat = naik(tingkat, irisan.length >= 2 ? "berat" : "perhatian");
    pesan.push(`Sudah bertugas aktif pada periode yang beririsan: ${irisan.map((p) => `${p.nama} (${p.peran.toUpperCase()})`).join(", ")}.`);
  }
  if (takPasti.length > 0) {
    pesan.push(`Juga bertugas di ${takPasti.map((p) => `${p.nama} (${p.peran.toUpperCase()})`).join(", ")}, tetapi periode salah satu kegiatan belum lengkap sehingga irisannya tidak bisa dipastikan.`);
  }
  if (pesan.length === 0) pesan.push("Tidak ada bentrok: beban Delego ringan dan tidak ada penugasan lain yang beririsan.");

  return { tingkat, pesan, maks_persen: terberat?.persen ?? 0, minggu_terberat: terberat ? terberat.mulai : null };
}
