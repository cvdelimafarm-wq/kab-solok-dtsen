// lib/keu/kk.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK (papan 1) -- logika murni tab "Kertas kerja" halaman RO: pengelompokan baris Semula/Menjadi
// (Komponen -> Akun), jumlah, pemicu P-01..P-08, pemeriksaan R-xx, isian item baru / Dana penggenap / pasangan, serta pemeriksaan isian
// sebelum dikirim. Aturan sebenarnya (kertas kerja hanya saat jadwal dibuka/terkumpul, hak, kelompok belanja, akun Master, satuan baku,
// penggenap hanya akun 52xxxx, pagu KRO tetap) ditegakkan basis data (berkas SQL f); di sini hanya membantu tampilan dan isian.

export type BarisKk = {
  id: number; jadwal_id: number; ro_kode: string; kro: string | null; detail_id: number | null; pok_kunci: string | null; komponen_kode: string;
  akun_semula: string | null; akun_menjadi: string; uraian_semula: string | null; uraian_menjadi: string | null;
  vol_semula: number | string; vol_menjadi: number | string | null; sat_semula: string | null; sat_menjadi: string | null;
  harga_semula: number | string; harga_menjadi: number | string | null; jumlah_semula: number | string; jumlah_menjadi: number | string | null; selisih: number | string | null;
  pindah_dari: number | null; pindah_ke: number | null; penggenap: boolean; baru: boolean; prioritas_kode: string | null; rab_item_id: number | null; catatan: string; urut: number; pemicu: string | null;
};

export const n = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const LABEL_PEMICU: Record<string, string> = {
  "P-01": "Volume atau harga berubah",
  "P-02": "Redaksi diganti",
  "P-03": "Akun diganti",
  "P-04": "Item baru (akun baru)",
  "P-05": "Item dikosongkan",
  "P-06": "Item baru (akun sudah ada)",
  "P-07": "Item dikurangi, dana pindah dalam akun",
  "P-08": "Beberapa perubahan sekaligus",
};

export type AkunKk = { akun: string; baris: BarisKk[]; semula: number; menjadi: number; selisih: number };
export type KomponenKk = { komponen: string; akun: AkunKk[]; semula: number; menjadi: number; selisih: number };

const jumlahSemula = (b: BarisKk) => n(b.jumlah_semula);
const jumlahMenjadi = (b: BarisKk) => n(b.jumlah_menjadi);

/** Baris kertas kerja satu RO, dikelompokkan Komponen -> Akun (menurut akun "Menjadi") beserta jumlah. */
export function susunKertas(baris: BarisKk[]): KomponenKk[] {
  const urut = [...baris].sort((a, b) => a.komponen_kode.localeCompare(b.komponen_kode) || a.akun_menjadi.localeCompare(b.akun_menjadi) || n(a.urut) - n(b.urut) || a.id - b.id);
  const hasil: KomponenKk[] = [];
  for (const b of urut) {
    let k = hasil.find((x) => x.komponen === b.komponen_kode);
    if (!k) { k = { komponen: b.komponen_kode, akun: [], semula: 0, menjadi: 0, selisih: 0 }; hasil.push(k); }
    let a = k.akun.find((x) => x.akun === b.akun_menjadi);
    if (!a) { a = { akun: b.akun_menjadi, baris: [], semula: 0, menjadi: 0, selisih: 0 }; k.akun.push(a); }
    a.baris.push(b);
    a.semula += jumlahSemula(b); a.menjadi += jumlahMenjadi(b);
    k.semula += jumlahSemula(b); k.menjadi += jumlahMenjadi(b);
  }
  for (const k of hasil) { k.selisih = k.menjadi - k.semula; for (const a of k.akun) a.selisih = a.menjadi - a.semula; }
  return hasil;
}

export type TotalKk = { semula: number; menjadi: number; selisih: number; nBerubah: number; nBaru: number; nPenggenap: number; totalPenggenap: number };
export function totalKertas(baris: BarisKk[]): TotalKk {
  let semula = 0, menjadi = 0, nBerubah = 0, nBaru = 0, nPenggenap = 0, totalPenggenap = 0;
  for (const b of baris) {
    semula += jumlahSemula(b); menjadi += jumlahMenjadi(b);
    if (b.pemicu) nBerubah++;
    if (b.penggenap) { nPenggenap++; totalPenggenap += jumlahMenjadi(b); } else if (b.baru && b.pindah_dari === null) nBaru++;
  }
  return { semula, menjadi, selisih: menjadi - semula, nBerubah, nBaru, nPenggenap, totalPenggenap };
}

/** Sisa untuk "tepat sampai pagu": positif = pagu masih sisa (perlu Dana penggenap sebesar itu), negatif = melebihi pagu. */
export const sisaTerhadapPagu = (baris: BarisKk[]): number => { const t = totalKertas(baris); return t.semula - t.menjadi; };

/** Baris dapat dipasangkan (ganti akun/redaksi): baris POK semula yang belum punya pasangan dan masih bervolume. */
export const bolehPasangkan = (b: BarisKk): boolean => b.detail_id !== null && b.pindah_ke === null && n(b.vol_menjadi) > 0;
/** Baris dapat dihapus: bukan baris POK semula (item baru, penggenap, atau pasangan). */
export const bolehHapus = (b: BarisKk): boolean => b.detail_id === null;
/** Volume dan harga dapat diubah langsung pada baris POK semula dan baris baru; akun, redaksi, dan satuan baris POK semula terkunci (D-11). */
export const uraianTerkunci = (b: BarisKk): boolean => b.detail_id !== null;

// ---------------------------------------------------------------- isian
export type IsianBaru = { komponen: string; akun: string; uraian: string; vol: string; sat: string; harga: string };
export const isianBaruKosong = (komponen = ""): IsianBaru => ({ komponen, akun: "", uraian: "", vol: "", sat: "", harga: "" });

/** Angka dari isian (titik ribuan/koma desimal boleh), atau null bila bukan angka. */
export function bacaAngka(t: string): number | null {
  const s = (t ?? "").trim().replace(/\s/g, "");
  if (s === "") return null;
  const norm = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const x = Number(norm);
  return Number.isFinite(x) ? x : null;
}

export function periksaIsianBaru(v: IsianBaru, komponenAda: string[], satuanBaku: string[]): string[] {
  const g: string[] = [];
  if (!komponenAda.includes(v.komponen)) g.push("Pilih komponen yang sudah ada pada RO ini (komponen baru lewat Usulan Struktur).");
  if (!/^\d{6}$/.test(v.akun.trim())) g.push("Akun harus 6 angka.");
  if (v.uraian.trim().length < 3) g.push("Uraian minimal 3 huruf.");
  const vol = bacaAngka(v.vol), harga = bacaAngka(v.harga);
  if (vol === null || vol <= 0) g.push("Volume harus lebih dari 0.");
  if (harga === null || harga < 0) g.push("Harga satuan harus angka 0 atau lebih.");
  if (!satuanBaku.includes(v.sat.trim().toUpperCase())) g.push("Satuan harus salah satu satuan baku.");
  return g;
}

export function argsBaruTulis(jadwal: number, ro: string, v: IsianBaru): Record<string, unknown> {
  return {
    jadwal_id: jadwal, ro_kode: ro, komponen_kode: v.komponen, akun_menjadi: v.akun.trim(), uraian_menjadi: v.uraian.trim(),
    vol_menjadi: bacaAngka(v.vol), sat_menjadi: v.sat.trim().toUpperCase(), harga_menjadi: bacaAngka(v.harga),
  };
}

/** Nama baku baris Dana penggenap (D-09): akun 524 = "Perjalanan dinas Kabupaten", akun 52 lain = nama akun + " Kabupaten". */
export function uraianPenggenap(akun: string, namaAkun: string | null | undefined): string {
  if (akun.startsWith("524")) return "Perjalanan dinas Kabupaten (Dana penggenap)";
  return `${(namaAkun ?? `Akun ${akun}`).trim()} Kabupaten (Dana penggenap)`;
}

/** Isian Dana penggenap: satu paket bernilai `jumlah` pada akun 52xxxx dan komponen terpilih. */
export function argsPenggenap(jadwal: number, ro: string, komponen: string, akun: string, namaAkun: string | null | undefined, jumlah: number): Record<string, unknown> {
  return { jadwal_id: jadwal, ro_kode: ro, komponen_kode: komponen, akun_menjadi: akun, uraian_menjadi: uraianPenggenap(akun, namaAkun), vol_menjadi: 1, sat_menjadi: "PAKET", harga_menjadi: jumlah, penggenap: true };
}

export function periksaPenggenap(akun: string, komponen: string, jumlah: number | null, komponenAda: string[]): string[] {
  const g: string[] = [];
  if (!komponenAda.includes(komponen)) g.push("Pilih komponen yang sudah ada pada RO ini.");
  if (!/^52\d{4}$/.test(akun)) g.push("Dana penggenap hanya untuk akun 52xxxx.");
  if (jumlah === null || jumlah <= 0) g.push("Jumlah penggenap harus lebih dari 0.");
  return g;
}

/** Volume yang dipindah ke pasangan: lebih dari 0 dan paling banyak sisa volume baris. */
export function periksaPasangan(akunBaru: string, uraianBaru: string, vol: number | null, baris: BarisKk): string[] {
  const g: string[] = [];
  const akun = akunBaru.trim(), ura = uraianBaru.trim();
  if (akun && !/^\d{6}$/.test(akun)) g.push("Akun baru harus 6 angka.");
  if (ura && ura.length < 3) g.push("Redaksi baru minimal 3 huruf.");
  if ((!akun || akun === baris.akun_semula) && (!ura || ura === baris.uraian_semula)) g.push("Isi akun atau redaksi yang berbeda dari semula.");
  if (vol === null || vol <= 0 || vol > n(baris.vol_menjadi)) g.push(`Volume yang dipindah harus lebih dari 0 dan paling banyak ${n(baris.vol_menjadi)}.`);
  return g;
}

// ---------------------------------------------------------------- pemeriksaan R-xx
export type BarisPeriksa = { jadwal_id: number; kode: string; tingkat: "merah" | "kuning" | "info" | "hijau"; objek: string | null; pesan: string; nilai: number | string | null };
const URUT_TINGKAT: Record<string, number> = { merah: 0, kuning: 1, info: 2, hijau: 3 };
export const WARNA_TINGKAT: Record<string, "merah" | "kuning" | "biru" | "hijau"> = { merah: "merah", kuning: "kuning", info: "biru", hijau: "hijau" };
export const LABEL_TINGKAT: Record<string, string> = { merah: "Memblokir", kuning: "Perhatian", info: "Info", hijau: "Sesuai" };

/** Pemeriksaan terurut menurut tingkat (merah dulu) lalu kode. */
export function urutkanPeriksa(p: BarisPeriksa[]): BarisPeriksa[] {
  return [...p].sort((a, b) => (URUT_TINGKAT[a.tingkat] ?? 9) - (URUT_TINGKAT[b.tingkat] ?? 9) || a.kode.localeCompare(b.kode) || (a.objek ?? "").localeCompare(b.objek ?? ""));
}
/** Jadwal tidak dapat diterapkan selama masih ada pemeriksaan merah (gerbang basis data). */
export const adaMerah = (p: BarisPeriksa[]): boolean => p.some((x) => x.tingkat === "merah");

// ---------------------------------------------------------------- keputusan PPK per KRO (D-15)
export type Kecukupan = { jadwal_id: number; kro: string; kelompok: string; n_item: number | string; rab: number | string; pok: number | string; k: number | string; status: string; kurang: number | string; kurang_dari_k: number | string };
export const WARNA_KECUKUPAN: Record<string, "merah" | "kuning" | "biru" | "hijau"> = { Kurang: "merah", Tipis: "kuning", Cukup: "hijau", Lebih: "biru" };
export type KeputusanKro = "semua" | "sebagian" | "tunda";
export const LABEL_KEPUTUSAN: Record<KeputusanKro, string> = { semua: "Terima semua", sebagian: "Terima sebagian", tunda: "Tunda" };

/** Kekurangan satu KRO = jumlah kekurangan semua kelompok belanjanya. */
export const kurangKro = (c: Kecukupan[], kro: string): number => c.filter((x) => x.kro === kro).reduce((s, x) => s + n(x.kurang), 0);

export function periksaKeputusan(keputusan: KeputusanKro, jumlah: string, kurang: number): string[] {
  if (keputusan === "tunda") return [];
  if (kurang <= 0) return ["KRO ini tidak memiliki kekurangan terhadap RAB."];
  if (keputusan === "semua") return [];
  const j = bacaAngka(jumlah);
  if (j === null || j <= 0) return ["Jumlah yang diterima harus lebih dari 0."];
  if (j > kurang) return [`Jumlah melebihi kekurangan KRO (${kurang}).`];
  return [];
}
export const argsKeputusan = (jadwal: number, kro: string, k: KeputusanKro, jumlah: string, catatan: string): Record<string, unknown> => ({
  p_jadwal: jadwal, p_kro: kro, p_keputusan: k, p_jumlah: k === "sebagian" ? bacaAngka(jumlah) : null, p_catatan: catatan.trim(),
});

// ---------------------------------------------------------------- geseran
export type Geseran = { id: number; jadwal_id: number; donor_id: number; penerima_id: number; jumlah: number | string; catatan: string; batal: boolean };
/** Kelompok belanja akun (sama dengan keu_kelompok_akun di basis data): 51, 524, 52L (52xxxx selain 524), 53; selain itu null. */
export function kelompokAkun(akun: string | null | undefined): string | null {
  const a = (akun ?? "").trim();
  if (!/^\d{6}$/.test(a)) return null;
  if (a.startsWith("51")) return "51";
  if (a.startsWith("524")) return "524";
  if (a.startsWith("52")) return "52L";
  if (a.startsWith("53")) return "53";
  return null;
}
export function periksaGeseran(donor: BarisKk | undefined, penerima: BarisKk | undefined, jumlah: string): string[] {
  const g: string[] = [];
  if (!donor || !penerima) return ["Pilih baris donor dan penerima."];
  if (donor.id === penerima.id) g.push("Donor dan penerima harus berbeda.");
  const kd = kelompokAkun(donor.akun_menjadi), kp = kelompokAkun(penerima.akun_menjadi);
  if (kd === null || kd !== kp) g.push("Geseran hanya dalam kelompok belanja yang sama.");
  const j = bacaAngka(jumlah);
  if (j === null || j <= 0 || !Number.isInteger(j)) g.push("Jumlah harus bilangan bulat lebih dari 0.");
  return g;
}
