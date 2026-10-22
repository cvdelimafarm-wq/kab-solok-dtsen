// lib/anggaranRab.ts
//
// (22 Okt 2026) Logika murni modul Anggaran SIGAP: RAB berversi, vonis sisa/kurang, rencana penarikan dana (RPD), pasangan revisi.
// Dasar: claude/rancangan-anggaran-rab-kelola-mitra.md (bagian 1) dan skema claude/skema-sql/20261022b_keu_anggaran.sql.
// Murni (tanpa DB/React/alamat baru) supaya mudah diuji; aturan di sini SAMA dengan penjaga di SQL
// (keu_rab_cek_setuju: total RAB <= pagu RO x (100 - cadangan) / 100; keu_rab_versi: penyusun tidak boleh menyetujui versinya sendiri).
//
// Yang di sini USULAN AWAL dan harus dikalibrasi tim (rancangan bagian 5): rentang bawaan per versi, cadangan 5%, pola bayar per jenis item.
// Yang TIDAK diputuskan di sini: kewenangan persetujuan revisi (satker/kanwil/pusat). Itu diisi admin dari ketentuan resmi
// (PMK 62/2023 jo 107/2024 jo 41/2026); aplikasi hanya menandai jenis pergeseran.

import { kunciDetail, type DetailPok } from "./perencanaanPok";

// ---------------------------------------------------------------- RAB: baris & total

/** Pola pembayaran sebuah item: bulan (1-12) dan bobotnya. Bobot dinormalkan, jadi {1,1} = dua bulan sama besar. */
export type JadwalBayar = { bulan: number; bobot: number }[];

export type BarisRab = {
  /** Kunci stabil baris POK (lihat kunciDetail di perencanaanPok.ts); null untuk baris RAB di luar POK. */
  kunci: string | null;
  akun: string;
  uraian: string;
  volume: number;
  satuan: string;
  harga: number;
  /** Boleh kosong: dipakai pola bawaan menurut jenis akun/uraian (lihat polaBawaan). */
  jadwal?: JadwalBayar;
};

export const jumlahBaris = (b: Pick<BarisRab, "volume" | "harga">): number => Math.round(b.volume * b.harga);

export const totalRab = (baris: BarisRab[]): number => baris.reduce((s, b) => s + jumlahBaris(b), 0);

/** RAB v1 = salinan POK (aturan rancangan). Baris tanpa volume/harga dihitung 1 x jumlah supaya total tetap sama dengan pagu. */
export function salinPokKeRab(detail: Pick<DetailPok, "komponen" | "subKomponen" | "akun" | "uraian" | "volume" | "satuan" | "harga" | "jumlah">[]): BarisRab[] {
  return detail.map((d) => {
    const punyaRincian = d.volume !== null && d.harga !== null && Math.round(d.volume * d.harga) === d.jumlah;
    return {
      kunci: kunciDetail(d),
      akun: d.akun,
      uraian: d.uraian,
      volume: punyaRincian ? (d.volume as number) : 1,
      satuan: punyaRincian ? d.satuan : "PAKET",
      harga: punyaRincian ? (d.harga as number) : d.jumlah,
    };
  });
}

// ---------------------------------------------------------------- persetujuan RAB (cermin trigger SQL)

export const CADANGAN_BAWAAN_PERSEN = 5;

export type HasilCekSetuju = { boleh: boolean; total: number; batas: number; lebih: number; pesan: string | null };

/** Total RAB tidak boleh melebihi pagu RO dikurangi cadangan. Sama dengan keu_rab_cek_setuju. */
export function cekSetujuRab(total: number, paguRo: number, cadanganPersen: number = CADANGAN_BAWAAN_PERSEN): HasilCekSetuju {
  const batas = (paguRo * (100 - cadanganPersen)) / 100;
  const lebih = Math.max(0, total - batas);
  const boleh = total <= batas;
  return {
    boleh,
    total,
    batas,
    lebih,
    pesan: boleh ? null : `Total RAB ${rp(total)} melebihi pagu RO ${rp(paguRo)} dikurangi cadangan ${cadanganPersen}% (batas ${rp(batas)}).`,
  };
}

/** Pemisahan tugas: penyusun tidak boleh menyetujui versi sendiri. */
export function bolehMenyetujui(penyusunId: number, penyetujuId: number): boolean {
  return penyusunId !== penyetujuId;
}

// ---------------------------------------------------------------- rentang & vonis

/** Rentang ketidakpastian bawaan menurut nomor versi (USULAN AWAL): v1 22%, v2 14%, v3 8%, v4 dan seterusnya 5%. */
export function rentangBawaan(nomorVersi: number): number {
  if (nomorVersi <= 1) return 22;
  if (nomorVersi === 2) return 14;
  if (nomorVersi === 3) return 8;
  return 5;
}

export type Vonis = "sisa_pasti" | "kurang_pasti" | "belum_pasti";

export type HasilVonis = {
  vonis: Vonis;
  pagu: number;
  total: number;
  bawah: number;
  atas: number;
  /** pagu - total (positif = sisa, negatif = kurang) pada nilai tengah. */
  selisihTengah: number;
  /** Sisa paling kecil dan paling besar yang mungkin (negatif = kurang). */
  selisihMin: number;
  selisihMaks: number;
  teks: string;
};

/**
 * Vonis otomatis: batas atas kisaran < pagu => "sisa hampir pasti"; batas bawah > pagu => "kekurangan hampir pasti";
 * selain itu "belum pasti, tunggu versi berikut". Batas tepat sama dengan pagu dianggap belum pasti.
 */
export function vonisRab(pagu: number, total: number, rentangPersen: number): HasilVonis {
  const bawah = Math.round((total * (100 - rentangPersen)) / 100);
  const atas = Math.round((total * (100 + rentangPersen)) / 100);
  const vonis: Vonis = atas < pagu ? "sisa_pasti" : bawah > pagu ? "kurang_pasti" : "belum_pasti";
  const teks =
    vonis === "sisa_pasti"
      ? `Sisa hampir pasti: ${rp(pagu - atas)} sampai ${rp(pagu - bawah)}.`
      : vonis === "kurang_pasti"
        ? `Kekurangan hampir pasti: ${rp(bawah - pagu)} sampai ${rp(atas - pagu)}.`
        : "Belum pasti, tunggu versi berikut.";
  return { vonis, pagu, total, bawah, atas, selisihTengah: pagu - total, selisihMin: pagu - atas, selisihMaks: pagu - bawah, teks };
}

/**
 * Rentang yang SEBENARNYA terjadi pada versi lama: simpangan relatif versi lama terhadap realisasi akhir.
 * Dipakai untuk mengkalibrasi rentang bawaan (rancangan: "idealnya dihitung dari seberapa jauh versi lama menyimpang dari realisasi").
 * Mengembalikan persen simpangan; kosong bila realisasi 0.
 */
export function simpanganPersen(totalVersi: number, realisasiAkhir: number): number | null {
  if (!(realisasiAkhir > 0)) return null;
  return Math.round((Math.abs(totalVersi - realisasiAkhir) / realisasiAkhir) * 1000) / 10;
}

// ---------------------------------------------------------------- rencana penarikan dana (RPD)

/** Pola bayar bawaan per jenis item (USULAN AWAL; rancangan: pelatihan awal, transport berjalan, honor setelah dokumen diperiksa). */
export function polaBawaan(akun: string, uraian: string, bulanMulai: number, bulanSelesai: number): JadwalBayar {
  const u = uraian.toLowerCase();
  const m = Math.min(12, Math.max(1, bulanMulai));
  const s = Math.min(12, Math.max(m, bulanSelesai));
  const merata = (): JadwalBayar => Array.from({ length: s - m + 1 }, (_, i) => ({ bulan: m + i, bobot: 1 }));
  if (/pelatihan|briefing|rapat|workshop|bimtek/.test(u)) return [{ bulan: m, bobot: 1 }];
  if (/transport|perjalanan|bbm|lokal/.test(u)) return merata();
  if (/honor|mitra|petugas|pencacah|pengawas|pml|ppl/.test(u)) return [{ bulan: Math.min(12, s + 1), bobot: 1 }];
  void akun;
  return merata();
}

/**
 * Sebar sebuah jumlah (Rp bulat) ke 12 bulan menurut jadwal. Memakai sisa terbesar sehingga jumlah 12 bulan SELALU sama dengan jumlah awal.
 * Jadwal kosong atau bobot nol: seluruhnya ke bulanDefault.
 */
export function sebarKeBulan(jumlah: number, jadwal: JadwalBayar | undefined, bulanDefault: number): number[] {
  const hasil = new Array(12).fill(0);
  const total = Math.round(jumlah);
  const sah = (jadwal ?? []).filter((j) => j.bulan >= 1 && j.bulan <= 12 && j.bobot > 0);
  if (sah.length === 0) {
    hasil[Math.min(12, Math.max(1, bulanDefault)) - 1] = total;
    return hasil;
  }
  const bobotTotal = sah.reduce((s, j) => s + j.bobot, 0);
  const bagian = sah.map((j) => {
    const mentah = (total * j.bobot) / bobotTotal;
    return { bulan: j.bulan, dasar: Math.floor(mentah), sisa: mentah - Math.floor(mentah) };
  });
  let kurang = total - bagian.reduce((s, b) => s + b.dasar, 0);
  [...bagian].sort((a, b) => b.sisa - a.sisa || a.bulan - b.bulan).forEach((b) => {
    if (kurang > 0) {
      b.dasar += 1;
      kurang -= 1;
    }
  });
  for (const b of bagian) hasil[b.bulan - 1] += b.dasar;
  return hasil;
}

/** RPD per bulan dari baris RAB (12 angka). Baris tanpa jadwal ikut bulanDefault. */
export function rpdDariRab(baris: BarisRab[], bulanDefault: number): number[] {
  const hasil = new Array(12).fill(0);
  for (const b of baris) {
    const per = sebarKeBulan(jumlahBaris(b), b.jadwal, bulanDefault);
    per.forEach((n, i) => (hasil[i] += n));
  }
  return hasil;
}

/** Selisih RPD (versi terpilih) terhadap RPD v1 per bulan, plus jumlah kumulatif. Positif = lebih besar dari v1. */
export function bandingRpd(rpd: number[], rpdV1: number[]): { bulan: number; rpd: number; v1: number; selisih: number; kumulatifRpd: number; kumulatifV1: number }[] {
  let kr = 0;
  let k1 = 0;
  return Array.from({ length: 12 }, (_, i) => {
    kr += rpd[i] ?? 0;
    k1 += rpdV1[i] ?? 0;
    return { bulan: i + 1, rpd: rpd[i] ?? 0, v1: rpdV1[i] ?? 0, selisih: (rpd[i] ?? 0) - (rpdV1[i] ?? 0), kumulatifRpd: kr, kumulatifV1: k1 };
  });
}

// ---------------------------------------------------------------- serapan

export type RingkasSerapan = { pagu: number; komitmen: number; realisasi: number; terpakai: number; sisa: number; persenRealisasi: number | null; persenTerpakai: number | null };

/** Serapan satu baris/RO. Terpakai = realisasi + komitmen yang belum direalisasikan (komitmen yang sudah direalisasikan tidak dihitung dua kali). */
export function ringkasSerapan(pagu: number, komitmenBelumRealisasi: number, realisasi: number): RingkasSerapan {
  const terpakai = komitmenBelumRealisasi + realisasi;
  const pct = (x: number) => (pagu > 0 ? Math.round((x / pagu) * 1000) / 10 : null);
  return { pagu, komitmen: komitmenBelumRealisasi, realisasi, terpakai, sisa: pagu - terpakai, persenRealisasi: pct(realisasi), persenTerpakai: pct(terpakai) };
}

// ---------------------------------------------------------------- revisi: pasangan sisa <-> kurang

export type SelisihItem = {
  kunci: string;
  uraian: string;
  programKode: string;
  roKode: string;
  /** pagu - kebutuhan (RAB terpilih). Positif = sisa, negatif = kurang. */
  selisih: number;
};

export type JenisPergeseran = "dalam_ro" | "antar_ro" | "antar_program";

export function jenisPergeseran(dari: Pick<SelisihItem, "programKode" | "roKode">, ke: Pick<SelisihItem, "programKode" | "roKode">): JenisPergeseran {
  if (dari.programKode !== ke.programKode) return "antar_program";
  if (dari.roKode !== ke.roKode) return "antar_ro";
  return "dalam_ro";
}

export type PasanganRevisi = { dari: SelisihItem; ke: SelisihItem; jumlah: number; jenis: JenisPergeseran };

export type HasilPasangan = {
  pasangan: PasanganRevisi[];
  /** Kekurangan yang belum tertutup sisa mana pun. */
  kurangBelumTertutup: { item: SelisihItem; jumlah: number }[];
  /** Sisa yang belum dipakai menutup kekurangan (kandidat dikembalikan/diblokir). */
  sisaBelumDipakai: { item: SelisihItem; jumlah: number }[];
  totalDigeser: number;
};

/**
 * Pasangkan sisa dengan kekurangan. Prioritas: sedekat mungkin (dalam RO dulu, lalu antar RO, lalu antar program) supaya
 * pergeseran yang butuh persetujuan lebih tinggi dipakai paling akhir; dalam tingkat yang sama, kekurangan terbesar dilayani lebih dulu,
 * sisa terbesar dipakai lebih dulu. Hanya SARAN: keputusan tetap di PPK/KPA.
 */
export function pasangkanRevisi(item: SelisihItem[]): HasilPasangan {
  const sisa = item.filter((x) => x.selisih > 0).map((x) => ({ item: x, sisa: x.selisih }));
  const kurang = item.filter((x) => x.selisih < 0).map((x) => ({ item: x, kurang: -x.selisih }));
  const pasangan: PasanganRevisi[] = [];
  const peringkat: JenisPergeseran[] = ["dalam_ro", "antar_ro", "antar_program"];
  for (const jenis of peringkat) {
    for (const k of [...kurang].sort((a, b) => b.kurang - a.kurang || a.item.kunci.localeCompare(b.item.kunci))) {
      const kandidat = sisa
        .filter((s) => s.sisa > 0 && jenisPergeseran(s.item, k.item) === jenis)
        .sort((a, b) => b.sisa - a.sisa || a.item.kunci.localeCompare(b.item.kunci));
      for (const s of kandidat) {
        if (k.kurang <= 0) break;
        const j = Math.min(s.sisa, k.kurang);
        pasangan.push({ dari: s.item, ke: k.item, jumlah: j, jenis });
        s.sisa -= j;
        k.kurang -= j;
      }
    }
  }
  return {
    pasangan,
    kurangBelumTertutup: kurang.filter((k) => k.kurang > 0).map((k) => ({ item: k.item, jumlah: k.kurang })),
    sisaBelumDipakai: sisa.filter((s) => s.sisa > 0).map((s) => ({ item: s.item, jumlah: s.sisa })),
    totalDigeser: pasangan.reduce((t, p) => t + p.jumlah, 0),
  };
}

/** Jenis pergeseran terjauh dalam satu rangkaian pasangan (menentukan jenjang persetujuan yang dicek admin). */
export function pergeseranTerjauh(pasangan: PasanganRevisi[]): JenisPergeseran | null {
  if (pasangan.length === 0) return null;
  if (pasangan.some((p) => p.jenis === "antar_program")) return "antar_program";
  if (pasangan.some((p) => p.jenis === "antar_ro")) return "antar_ro";
  return "dalam_ro";
}

/**
 * Batas aman sisa yang boleh digeser: sisa dikurangi cadangan rentang (cadanganPersen x total RAB). Tidak pernah negatif.
 * Rancangan: "cek batas aman = sisa dikurangi cadangan rentang (5% x RAB)".
 */
export function batasAmanGeser(sisa: number, totalRab: number, cadanganPersen: number = CADANGAN_BAWAAN_PERSEN): number {
  return Math.max(0, Math.round(sisa - (totalRab * cadanganPersen) / 100));
}

/** Alasan revisi wajib minimal 20 karakter bermakna (cermin check keu_revisi.alasan). */
export const alasanRevisiSah = (alasan: string): boolean => alasan.trim().length >= 20;

// ---------------------------------------------------------------- format

export function rp(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}Rp ${s}`;
}
