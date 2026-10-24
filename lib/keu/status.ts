// lib/keu/status.ts
//
// (25 Okt 2026, tahap 20) Papan 5 mockup: "Siklus status, peran, dan riwayat". Tanpa React/DB.
//  - Posisi sebuah jadwal revisi pada deret tahap (kartu "Tahap n"), diturunkan dari status jadwal (keu_revisi_jadwal.status) dan
//    baris riwayat (keu_jadwal_riwayat): pengajuan, dikembalikan, ditolak, dan perbaikan pada revisi DIPA hanya ada di riwayat.
//  - Tindakan yang tersedia (hanya yang masuk akal; yang memutuskan tetap fungsi basis data keu_jadwal_langkah).
//  - Tabel "Siapa boleh apa" dari master peran dan kewenangan (bukan tulisan tangan).
//  - Baris riwayat siap tampil.

import { aksiJadwalTersedia, tanggalSah } from "@/lib/keu/revisi";
import type { JenisRevisi } from "@/lib/keu/lampiran";

export type AksiLangkah = "buka" | "tutup" | "terapkan" | "sah" | "lewati" | "pulihkan" | "ajukan" | "kembalikan" | "tolak" | "perbaiki";
export type SubStatus = "diajukan" | "dikembalikan" | "ditolak" | null;
export type WarnaChip = "hijau" | "kuning" | "abu" | "merah" | "biru" | "ungu";

export type RiwayatJadwal = {
  id: number | string; jadwal_id: number | string; waktu: string; aksi: string; status_ke: string;
  nomor: string; tanggal: string | null; catatan: string; oleh_nama: string | null;
};

const AKSI_DIPA = ["ajukan", "kembalikan", "tolak", "perbaiki"];
export const adalahDipa = (jenis: string): boolean => jenis === "dipa_djpb" || jenis === "dipa_dja";

// ---------------------------------------------------------------- posisi
export type Posisi = {
  /** Indeks tahap yang sedang berjalan pada `tahap`; -1 bila jadwal dilewati. */
  indeks: number;
  sub: SubStatus;
  /** Versi usulan: 1 + banyaknya perbaikan setelah dikembalikan atau ditolak (hanya DIPA). */
  versi: number;
  sah: boolean;
  dilewati: boolean;
};

/** Riwayat diurutkan menaik menurut id sebelum dipakai. */
function urutNaik(r: RiwayatJadwal[]): RiwayatJadwal[] {
  return r.slice().sort((a, b) => Number(a.id) - Number(b.id));
}

export function subStatusDari(riwayat: RiwayatJadwal[]): SubStatus {
  const u = urutNaik(riwayat).filter((r) => AKSI_DIPA.includes(r.aksi));
  const t = u[u.length - 1];
  if (!t) return null;
  if (t.aksi === "ajukan") return "diajukan";
  if (t.aksi === "kembalikan") return "dikembalikan";
  if (t.aksi === "tolak") return "ditolak";
  return null; // perbaiki: kembali ke tahap Diterapkan
}

export function versiDari(riwayat: RiwayatJadwal[]): number {
  return 1 + riwayat.filter((r) => r.aksi === "perbaiki").length;
}

export type Tahap = { kunci: string; nama: string };
export function daftarTahap(jenis: string): Tahap[] {
  const dasar: Tahap[] = [
    { kunci: "pengumpulan", nama: "Pengumpulan usulan" },
    { kunci: "ditutup", nama: "Ditutup" },
    { kunci: "diterapkan", nama: "Diterapkan di SAKTI" },
  ];
  return adalahDipa(jenis)
    ? [...dasar, { kunci: "diajukan", nama: "Diajukan" }, { kunci: "hasil", nama: "Hasil resmi" }]
    : [...dasar, { kunci: "sah", nama: "Disahkan" }];
}

export function posisiJadwal(jenis: string, status: string, riwayat: RiwayatJadwal[]): Posisi {
  const dipa = adalahDipa(jenis);
  const sub = dipa ? subStatusDari(riwayat) : null;
  const versi = dipa ? versiDari(riwayat) : 1;
  const n = daftarTahap(jenis).length;
  if (status === "dilewati") return { indeks: -1, sub: null, versi, sah: false, dilewati: true };
  if (status === "sah") return { indeks: n - 1, sub, versi, sah: true, dilewati: false };
  if (status === "diterapkan") {
    if (dipa && sub === "diajukan") return { indeks: 3, sub, versi, sah: false, dilewati: false };
    if (dipa && (sub === "dikembalikan" || sub === "ditolak")) return { indeks: 4, sub, versi, sah: false, dilewati: false };
    return { indeks: 2, sub, versi, sah: false, dilewati: false };
  }
  if (status === "terkumpul") return { indeks: 1, sub: null, versi, sah: false, dilewati: false };
  return { indeks: 0, sub: null, versi, sah: false, dilewati: false }; // terjadwal, dibuka
}

export type KartuTahap = { no: string; nama: string; label: string; warna: WarnaChip; aktif: boolean };
export function kartuTahap(jenis: string, status: string, p: Posisi): KartuTahap[] {
  const tahap = daftarTahap(jenis);
  return tahap.map((t, i) => {
    const hasil = t.kunci === "hasil" || t.kunci === "sah";
    const aktif = i === p.indeks;
    const lewat = p.indeks >= 0 && i < p.indeks;
    let label = aktif ? "Sekarang" : lewat ? "Selesai" : "Belum";
    let warna: WarnaChip = aktif ? "biru" : lewat ? "hijau" : "abu";
    if (aktif && i === 0) label = status === "terjadwal" ? "Terjadwal" : "Dibuka";
    if (aktif && hasil) {
      if (p.sah) { label = "Disahkan"; warna = "hijau"; }
      else if (p.sub === "dikembalikan") { label = "Dikembalikan"; warna = "kuning"; }
      else if (p.sub === "ditolak") { label = "Ditolak"; warna = "merah"; }
    }
    if (aktif && t.kunci === "diajukan") { label = "Menunggu hasil"; warna = "ungu"; }
    return { no: `Tahap ${i + 1}`, nama: t.nama, label, warna, aktif };
  });
}

/** Kalimat penjelas di bawah deret tahap (mengikuti papan 5). */
export function keteranganJalur(jenis: string): string {
  switch (jenis) {
    case "pok": return "Revisi POK ditetapkan di satker (Pasal 173): PPK menyatakan sah dari keputusan atau nota, dan KPA menerima laporannya, tanpa pengajuan ke luar satker. Tahap Diajukan dan hasil dari pihak lain tidak dipakai.";
    case "administrasi": return "Revisi administrasi ditetapkan di satker: PPK menyatakan sah dari dokumen dasarnya. Tidak ada pengajuan ke luar satker.";
    case "dipa_djpb": return "Jalur DJPb: setelah diterapkan, pengajuan ke Kanwil DJPb dicatat dari suratnya. Hasil resmi berupa salah satu dari Dikembalikan, Ditolak, atau Disahkan, dicatat dari surat balasan.";
    case "dipa_dja": return "Jalur DJA: setelah diterapkan, pengajuan ke Eselon I atau DJA dicatat dari suratnya. Hasil resmi berupa salah satu dari Dikembalikan, Ditolak, atau Disahkan, dicatat dari surat balasan.";
    default: return "";
  }
}

// ---------------------------------------------------------------- tindakan
export type TindakanLangkah = { aksi: AksiLangkah; label: string; utama: boolean; berbahaya: boolean; perluDokumen: boolean };
const t = (aksi: AksiLangkah, label: string, o: Partial<Omit<TindakanLangkah, "aksi" | "label">> = {}): TindakanLangkah =>
  ({ aksi, label, utama: false, berbahaya: false, perluDokumen: false, ...o });

/**
 * Tindakan untuk PPK (kewenangan jadwal). `boleh` = apakah akun ini berwenang; tanpa wewenang tidak ada tindakan.
 * Enam aksi lama mengikuti aksiJadwalTersedia; aksi DIPA dari riwayat.
 */
export function tindakanTersedia(jenis: string, status: string, sub: SubStatus, tutup: string, hariIni: string, berulang: boolean, boleh: boolean): TindakanLangkah[] {
  if (!boleh) return [];
  const dipa = adalahDipa(jenis);
  if (status === "diterapkan") {
    if (!dipa) {
      return [t("sah", jenis === "pok" ? "Catat revisi POK berlaku (keputusan PPK)" : "Nyatakan sah", { utama: true, perluDokumen: true })];
    }
    const tujuan = jenis === "dipa_dja" ? "Eselon I / DJA" : "Kanwil DJPb";
    if (sub === null) return [t("ajukan", `Catat pengajuan ke ${tujuan}`, { utama: true, perluDokumen: true })];
    if (sub === "diajukan") {
      return [
        t("kembalikan", "Catat dikembalikan", { perluDokumen: true }),
        t("tolak", "Catat ditolak", { perluDokumen: true, berbahaya: true }),
        t("sah", "Catat disahkan", { utama: true, perluDokumen: true }),
      ];
    }
    if (sub === "dikembalikan") return [t("perbaiki", "Perbaiki sebagai versi berikutnya", { utama: true })];
    return [t("perbaiki", "Susun usulan baru sebagai versi berikutnya", { utama: true })];
  }
  return aksiJadwalTersedia(status, tutup, hariIni, berulang).map((a) =>
    t(a.aksi, a.label, { utama: !a.berbahaya, berbahaya: a.berbahaya, perluDokumen: a.perluDokumen }));
}

export function teksKosongTindakan(boleh: boolean, status: string, p: Posisi): string {
  if (!boleh) return "Akun ini hanya dapat melihat. Tindakan jadwal dilakukan PPK (kewenangan jadwal).";
  if (status === "sah") return "Siklus jadwal ini selesai. Langkah berikutnya: impor hasil penetapan.";
  if (status === "dilewati") return "Jadwal dilewati dan jendelanya sudah lewat, sehingga tidak dapat dipulihkan.";
  return `Tidak ada tindakan pada tahap ini${p.sub ? ` (${p.sub})` : ""}.`;
}

export type LabelDokumen = { nomor: string; tanggal: string; contoh: string };
export function labelDokumen(jenis: string, aksi: AksiLangkah | null): LabelDokumen {
  if (aksi === "sah" && !adalahDipa(jenis)) {
    return jenis === "pok"
      ? { nomor: "Nomor keputusan PPK atau nota", tanggal: "Tanggal keputusan atau nota", contoh: "mis. 012/KPA/2026" }
      : { nomor: "Nomor dokumen dasar", tanggal: "Tanggal dokumen", contoh: "mis. 012/KPA/2026" };
  }
  if (aksi === "sah") return { nomor: "Nomor surat pengesahan", tanggal: "Tanggal surat", contoh: "mis. S-123/KW.03/2026" };
  return { nomor: "Nomor surat", tanggal: "Tanggal surat", contoh: "mis. S-123/KW.03/2026" };
}

export const PESAN_DOKUMEN = "Isi nomor dan tanggal dokumen (surat, keputusan PPK, atau nota) lebih dahulu. Sistem hanya mencatat apa yang tertulis pada dokumen resmi.";

export function periksaLangkah(tindakan: TindakanLangkah, nomor: string, tanggal: string): string[] {
  if (!tindakan.perluDokumen) return [];
  const g: string[] = [];
  if (nomor.trim().length < 3 || !tanggalSah(tanggal)) g.push(PESAN_DOKUMEN);
  return g;
}

export function argsLangkah(jadwal: number, aksi: AksiLangkah, nomor: string, tanggal: string, catatan: string): Record<string, unknown> {
  const a: Record<string, unknown> = { p_jadwal: jadwal, p_aksi: aksi, p_catatan: catatan.trim().slice(0, 300) };
  if (nomor.trim()) a.p_nomor = nomor.trim().slice(0, 120);
  if (tanggalSah(tanggal)) a.p_tanggal = tanggal;
  return a;
}

// ---------------------------------------------------------------- riwayat
export const LABEL_AKSI_RIWAYAT: Record<string, string> = {
  awal: "Status saat pencatatan riwayat dimulai", buka: "Membuka jendela usulan", tutup: "Menutup dan mengumpulkan usulan",
  terapkan: "Menandai sudah diterapkan di SAKTI", sah: "Menyatakan sah", lewati: "Melewati jadwal", pulihkan: "Memulihkan jadwal",
  ajukan: "Mencatat pengajuan", kembalikan: "Mencatat usulan dikembalikan", tolak: "Mencatat usulan ditolak", perbaiki: "Memperbaiki sebagai versi berikutnya",
};
const LABEL_STATUS_RIWAYAT: Record<string, [string, WarnaChip]> = {
  terjadwal: ["Terjadwal", "abu"], dibuka: ["Dibuka", "hijau"], terkumpul: ["Ditutup", "kuning"], diterapkan: ["Diterapkan", "biru"],
  sah: ["Sah", "hijau"], dilewati: ["Dilewati", "abu"], diajukan: ["Diajukan", "ungu"], dikembalikan: ["Dikembalikan", "kuning"], ditolak: ["Ditolak", "merah"],
};

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const dua = (n: number) => String(n).padStart(2, "0");
/** "23 Okt 2026, 08:12" dalam WIB (UTC+7). Masukan tak sah dikembalikan apa adanya. */
export function waktuWib(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms + 7 * 3600 * 1000);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}`;
}
export function tanggalSingkat(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  return `${Number(iso.slice(8, 10))} ${BULAN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export type BarisRiwayat = {
  id: number; waktu: string; peran: string; aksi: string; label: string; warna: WarnaChip; surat: string; catatan: string;
};
/** Terbaru di atas. `peran` = nama pelaku (atau "Sistem" bila tidak tercatat). */
export function barisRiwayat(riwayat: RiwayatJadwal[], jenis: string): BarisRiwayat[] {
  return urutNaik(riwayat).reverse().map((r) => {
    const [lab0, warna] = LABEL_STATUS_RIWAYAT[r.status_ke] ?? [r.status_ke, "abu" as WarnaChip];
    const label = r.status_ke === "sah" && adalahDipa(jenis) ? "Disahkan" : lab0;
    const nomor = (r.nomor ?? "").trim();
    const tgl = tanggalSingkat(r.tanggal);
    return {
      id: Number(r.id), waktu: waktuWib(r.waktu), peran: r.oleh_nama?.trim() || (r.aksi === "awal" ? "Sistem" : "-"),
      aksi: LABEL_AKSI_RIWAYAT[r.aksi] ?? r.aksi, label, warna, surat: nomor || tgl ? [nomor, tgl].filter(Boolean).join(", ") : "-", catatan: r.catatan ?? "",
    };
  });
}

// ---------------------------------------------------------------- siapa boleh apa
export type Peran = { kode: string; nama: string; urut?: number | string | null };
export type KewPeran = { kewenangan_kode: string; peran_kode: string };
export type BarisBoleh = { tindakan: string; kewenangan: string[] | null };

/** Tindakan siklus revisi dan kewenangan basis data yang membukanya (null = semua yang masuk). */
export const TINDAKAN_SIKLUS: BarisBoleh[] = [
  { tindakan: "Menyusun usulan RO (kolom Menjadi, RAB)", kewenangan: ["draf", "rab"] },
  { tindakan: "Menyetujui usulan di tingkat tim", kewenangan: ["setuju_ketua"] },
  { tindakan: "Mengesahkan atau mengembalikan usulan RO", kewenangan: ["sahkan"] },
  { tindakan: "Mengatur jadwal, menerapkan, mencatat pengajuan dan hasil resmi", kewenangan: ["jadwal"] },
  { tindakan: "Mengunggah dan mencatat PDF POK", kewenangan: ["pok_pdf"] },
  { tindakan: "Memutuskan kekurangan anggaran", kewenangan: ["kek_putus"] },
  { tindakan: "Melihat kertas kerja, matriks, riwayat", kewenangan: null },
];

export type MatriksBoleh = { kolom: Peran[]; baris: { tindakan: string; sel: boolean[] }[] };
/** Kolom = peran aktif yang memegang paling sedikit satu kewenangan di atas; urut menurut `urut`. */
export function matriksBoleh(peran: Peran[], kewPeran: KewPeran[], tindakan: BarisBoleh[] = TINDAKAN_SIKLUS): MatriksBoleh {
  const punya = (p: string, k: string[]) => kewPeran.some((x) => x.peran_kode === p && k.includes(x.kewenangan_kode));
  const semua = tindakan.flatMap((b) => b.kewenangan ?? []);
  const kolom = peran
    .filter((p) => punya(p.kode, semua))
    .sort((a, b) => Number(a.urut ?? 0) - Number(b.urut ?? 0) || a.nama.localeCompare(b.nama));
  return { kolom, baris: tindakan.map((b) => ({ tindakan: b.tindakan, sel: kolom.map((p) => (b.kewenangan === null ? true : punya(p.kode, b.kewenangan))) })) };
}

export const adalahJenisRevisi = (j: string): j is JenisRevisi => j === "pok" || j === "administrasi" || j === "dipa_djpb" || j === "dipa_dja";
