// lib/kolamWilayah.ts
//
// (16 Okt 2026) KOLAM WILAYAH KERJA pendataan pascabencana -- Sub SLS berstatus Terdampak (FASIH, 16 Okt 2026) yang belum terplot ke tim.
// Tampil di Lembar Pendataan lewat tombol float; PML tim mana pun boleh memilih bila syaratnya terpenuhi (keputusan pemilik, 16 Okt 2026):
//   1. wilayah kerja awal tim SELESAI LEBIH DARI 70% (KK ber-hasil / KK aktif di daftar; tambahan dari kolam tidak ikut dihitung);
//   2. paling banyak 2 Sub SLS sekali pilih;
//   3. pilih lagi hanya bila SELURUH tambahan dari kolam sudah selesai SEKURANGNYA 50% (KK ber-hasil / KK aktif);
//   4. satu Sub SLS satu tim; tercatat tim mana dan kapan; pilihan kolam TIDAK menghabiskan kuota total 7/9/11.
// Fungsi MURNI (tanpa DB/React): konstanta, tipe, pemeriksaan aturan, teks peringatan modal, dan pengelompokan kecamatan > nagari.
// Aturan yang sama dijaga ATOMIK di fungsi database bencana_kolam_pilih (migrasi 20261016c).

import { rapikanNama } from "@/lib/rekapIdentifikasi";

export const API_KOLAM = "/api/portal/pendataan/kolam";
/** Wilayah awal harus selesai LEBIH DARI angka ini (persen KK). */
export const SYARAT_WILAYAH_PERSEN = 70;
/** Seluruh tambahan dari kolam harus selesai SEKURANGNYA angka ini (persen KK) sebelum boleh memilih lagi. */
export const SYARAT_TAMBAHAN_PERSEN = 50;
/** Paling banyak Sub SLS sekali pilih. */
export const MAKS_PILIH_KOLAM = 2;

/** Hitungan KK tim dari fungsi database bencana_kolam_progres. */
export type ProgresKolam = {
  awal_total: number;
  awal_didata: number;
  tambahan_sub: number;
  tambahan_total: number;
  tambahan_didata: number;
  /** (16 Okt 2026) PML dikecualikan dari syarat wilayah > 70% (tabel bencana_kolam_izin, mis. wilayah kerja sudah habis) */
  izin_wilayah?: boolean;
};

export type ItemKolam = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk: number;
  didata: number;
  /** terisi bila sudah dipilih sebuah tim */
  diambil_pml_id: number | null;
  diambil_nama: string | null;
  diambil_at: string | null;
};

export type DataKolam = {
  sekarang: string;
  /** hanya PML tim (bukan sesi "masuk sebagai") yang boleh memilih */
  bisa_pilih: boolean;
  pml: { id: number; nama: string };
  progres: ProgresKolam;
  item: ItemKolam[];
};

// ---------------------------------------------------------------- hitungan

/** Persen satu angka desimal; total 0 -> 0. */
export function persen(d: number, t: number): number {
  return t > 0 ? Math.round((d / t) * 1000) / 10 : 0;
}

/** KK ber-hasil minimal agar wilayah awal LEBIH DARI 70%. */
export const perluWilayah = (total: number): number => Math.floor((total * SYARAT_WILAYAH_PERSEN) / 100) + 1;
/** KK ber-hasil minimal agar tambahan SEKURANGNYA 50%. */
export const perluTambahan = (total: number): number => Math.ceil((total * SYARAT_TAMBAHAN_PERSEN) / 100);

/** Wilayah awal lebih dari 70%? Tanpa daftar KK sama sekali -> belum lolos. PML dengan izin khusus (izin_wilayah) selalu lolos syarat ini. */
export const lolosWilayah = (p: ProgresKolam): boolean => p.izin_wilayah === true || (p.awal_total > 0 && p.awal_didata * 100 > SYARAT_WILAYAH_PERSEN * p.awal_total);
/** Belum pernah mengambil dari kolam -> lolos; kalau sudah, seluruh tambahan harus >= 50%. */
export const lolosTambahan = (p: ProgresKolam): boolean => p.tambahan_sub === 0 || (p.tambahan_total > 0 && p.tambahan_didata * 100 >= SYARAT_TAMBAHAN_PERSEN * p.tambahan_total);

// ---------------------------------------------------------------- pemeriksaan aturan + teks modal

export type JenisTolak = "ppl" | "wilayah" | "tambahan" | "maks" | "diambil" | "ppl_kosong" | "sudah_didata";

export type PesanAturan = {
  jenis: JenisTolak;
  judul: string;
  isi: string;
  /** rincian angka (progres) bila ada */
  angka?: { judul: string; teks: string; persen: number; syarat: number };
};

const fmt = (n: number) => n.toLocaleString("id-ID");
const koma = (n: number) => String(n).replace(".", ",");

export function pesanTolak(jenis: JenisTolak, p?: ProgresKolam, ekstra?: { pml?: string; nama?: string; waktu?: string; sub?: string }): PesanAturan {
  switch (jenis) {
    case "ppl":
      return {
        jenis,
        judul: "Hanya PML yang bisa memilih",
        isi: `Anda masuk sebagai PPL, jadi kolam ini hanya untuk dilihat. Minta PML tim Anda${ekstra?.pml ? ` (${rapikanNama(ekstra.pml)})` : ""} memilih Sub SLS dari kolam bila tim siap menambah wilayah.`,
      };
    case "wilayah": {
      const t = p?.awal_total ?? 0;
      const d = p?.awal_didata ?? 0;
      const perlu = perluWilayah(t);
      return {
        jenis,
        judul: "Wilayah kerja tim belum cukup selesai",
        isi: `Kolam dibuka untuk tim yang sudah mendata lebih dari ${SYARAT_WILAYAH_PERSEN}% KK di wilayah kerjanya sendiri. Selesaikan wilayah tim dulu, lalu pilih dari kolam.`,
        angka: {
          judul: `Tim Anda saat ini ${koma(persen(d, t))}%`,
          teks: t > 0 ? `${fmt(d)} dari ${fmt(t)} KK sudah didata. Butuh ${fmt(perlu)} KK, kurang ${fmt(Math.max(0, perlu - d))} KK lagi.` : "Belum ada daftar KK yang bisa dihitung di wilayah tim Anda.",
          persen: persen(d, t),
          syarat: SYARAT_WILAYAH_PERSEN,
        },
      };
    }
    case "tambahan": {
      const t = p?.tambahan_total ?? 0;
      const d = p?.tambahan_didata ?? 0;
      const perlu = perluTambahan(t);
      return {
        jenis,
        judul: `Tambahan sebelumnya belum selesai ${SYARAT_TAMBAHAN_PERSEN}%`,
        isi: `Tim Anda sudah mengambil ${p?.tambahan_sub ?? 0} Sub SLS dari kolam. Pilihan berikutnya dibuka setelah seluruh tambahan itu selesai ${SYARAT_TAMBAHAN_PERSEN}% atau lebih, supaya pekerjaan tidak menumpuk.`,
        angka: {
          judul: `Tambahan dari kolam: ${koma(persen(d, t))}%`,
          teks: `${fmt(d)} dari ${fmt(t)} KK sudah didata. Butuh ${fmt(perlu)} KK, kurang ${fmt(Math.max(0, perlu - d))} KK lagi.`,
          persen: persen(d, t),
          syarat: SYARAT_TAMBAHAN_PERSEN,
        },
      };
    }
    case "maks":
      return { jenis, judul: `Maksimal ${MAKS_PILIH_KOLAM} Sub SLS sekali pilih`, isi: `Tim hanya boleh mengambil ${MAKS_PILIH_KOLAM} Sub SLS dari kolam dalam satu kali Kirim. Lepas salah satu tanda centang bila ingin mengganti.` };
    case "diambil":
      return {
        jenis,
        judul: "Sub SLS ini sudah dipilih tim lain",
        isi: `${ekstra?.sub ? `${ekstra.sub} ` : "Sub SLS ini "}sudah dipilih ${ekstra?.nama ? `Tim ${rapikanNama(ekstra.nama)}` : "tim lain"}${ekstra?.waktu ? ` ${ekstra.waktu}` : ""}. Pilih Sub SLS lain di kolam.`,
      };
    case "ppl_kosong":
      return { jenis, judul: "Pilih nama PPL dulu", isi: "Setiap Sub SLS yang ditandai perlu PPL penerima assignment di FASIH. Pilih nama PPL pada setiap kartu yang berwarna ungu." };
    case "sudah_didata":
      return { jenis, judul: "Tidak bisa dikembalikan ke kolam", isi: "Pada Sub SLS ini sudah ada KK yang didata, jadi tidak bisa dikembalikan ke kolam. Lanjutkan pendataannya sampai selesai." };
  }
}

/**
 * Aturan yang bisa dicek di layar sebelum Sub SLS dicentang (urutan tetap: PPL -> wilayah -> tambahan -> maks).
 * `jumlahDipilih` = berapa yang sudah dicentang SEBELUM yang baru. null = lolos.
 */
export function periksaAturanKolam(x: { bisaPilih: boolean; progres: ProgresKolam; jumlahDipilih: number }): JenisTolak | null {
  if (!x.bisaPilih) return "ppl";
  if (!lolosWilayah(x.progres)) return "wilayah";
  if (!lolosTambahan(x.progres)) return "tambahan";
  if (x.jumlahDipilih >= MAKS_PILIH_KOLAM) return "maks";
  return null;
}

/** Teks galat server untuk alasan penolakan fungsi database (dipakai saat layar pengguna sudah basi). */
export function teksDariAlasan(alasan: string | undefined, p?: ProgresKolam): string {
  const jenis: JenisTolak | null = alasan === "wilayah" || alasan === "tambahan" || alasan === "maks" || alasan === "diambil" ? alasan : null;
  if (jenis) {
    const m = pesanTolak(jenis, p);
    return m.angka ? `${m.judul}. ${m.angka.judul}: ${m.angka.teks}` : `${m.judul}. ${m.isi}`;
  }
  if (alasan === "bukan_kolam") return "Sub SLS ini tidak ada di kolam.";
  if (alasan === "ppl_tanpa_petugas") return "Akun PPL yang dipilih belum terhubung ke data petugas.";
  return "Pilihan ditolak.";
}

// ---------------------------------------------------------------- pengelompokan tampilan

const koleksi = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

export type NagariKolam = { nagari: string; item: ItemKolam[]; sub: number; kk: number; bebas: number };
export type KecamatanKolam = { kecamatan: string; nagari: NagariKolam[]; sub: number; bebas: number };

/** Kecamatan > nagari > Sub SLS, urut nama. `bebas` = yang belum dipilih tim mana pun. */
export function kelompokKolam(item: ItemKolam[]): KecamatanKolam[] {
  const peta = new Map<string, Map<string, ItemKolam[]>>();
  for (const it of item) {
    const kec = peta.get(it.kecamatan) ?? new Map<string, ItemKolam[]>();
    kec.set(it.nagari, [...(kec.get(it.nagari) ?? []), it]);
    peta.set(it.kecamatan, kec);
  }
  return [...peta.entries()]
    .sort((a, b) => koleksi.compare(a[0], b[0]))
    .map(([kecamatan, nag]) => {
      const nagari: NagariKolam[] = [...nag.entries()]
        .sort((a, b) => koleksi.compare(a[0], b[0]))
        .map(([nama, its]) => {
          const urut = [...its].sort((p, q) => koleksi.compare(p.sls, q.sls) || koleksi.compare(p.sub_sls, q.sub_sls));
          return { nagari: nama, item: urut, sub: urut.length, kk: urut.reduce((s, x) => s + x.kk, 0), bebas: urut.filter((x) => !x.diambil_pml_id).length };
        });
      return { kecamatan, nagari, sub: nagari.reduce((s, n) => s + n.sub, 0), bebas: nagari.reduce((s, n) => s + n.bebas, 0) };
    });
}

/** Jumlah Sub SLS yang masih bebas (belum dipilih tim mana pun). */
export const jumlahBebas = (item: ItemKolam[]): number => item.filter((x) => !x.diambil_pml_id).length;

/** "Jorong Galanggang Tangah Sub 02" */
export const namaItemKolam = (x: Pick<ItemKolam, "sls" | "sub_sls">): string => `${rapikanNama(x.sls)}${x.sub_sls ? ` Sub ${x.sub_sls}` : ""}`;
