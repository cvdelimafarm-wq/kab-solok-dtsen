// lib/sigapBerandaKartu.ts
//
// (31 Okt 2026) BERANDA = SATU KARTU PER SURVEI (permintaan user). Pelatihan dan Pendataan satu survei boleh dua kartu; kartu usang (selesai/periode lewat)
// di urutan bawah dan redup. Tiap kartu menampilkan nama survei dan SATU poin mendesak menurut peran. Murni (tanpa React/DB) supaya teruji.
//
// URUTAN POIN HARI INI (PPL, PML, Supervisor sama; hanya langkah 3 yang berbeda):
//   1. TRANSLOK     foto awal (slot 1 dan 2) belum lengkap -> foto itu dulu
//   2. LAPORAN      foto awal sudah ada -> PPL: laporan pendataan; PML: lembar QC/pengawasan; Supervisor: lembar QC/supervisi
//   3. SISA FOTO    laporan/lembar sudah terisi -> lengkapi foto yang tersisa
//   4. LENGKAP      semuanya sudah
//   Di luar hari kerja: "libur" (atau ajakan memilih hari kerja bila belum ada).
// REALISASI berdampingan dengan Translok (chip di kartu yang sama, bukan pengganti poin): bermasalah bila proporsi realisasi (KK didata dibanding target)
//   lebih kecil daripada proporsi waktu yang sudah terpakai -- sama artinya dengan sisa target lebih besar daripada sisa hari kerja. Batas waktunya
//   TARGET SELESAI PENDATAAN (sigap_kegiatan.target_selesai; belum diisi -> akhir periode), bukan masa lapangan; hari kerja = Senin-Jumat.
// PERINGATAN MERAH: hari ini hari kerja (tidak libur) tetapi sampai 13.00 WIB belum ada foto maupun isian. Supervisor hanya diperiksa pada hari
//   ke-1, 3, 5, ... sejak awal periode (dan hanya pada hari kerja). Push 13.00 memakai aturan yang sama (pilihPeringatanPush).

import type { NadaKegiatan, RingkasHariIni, RingkasKegiatan } from "@/lib/sigapKegiatan";

export type PeranKartu = "ppl" | "pml" | "supervisor";
export const JAM_PERINGATAN = 13;
/** Nama tiap nomor foto Transport Lokal (aturan 5 foto). Selain 5 foto dipakai "Foto n". */
export const NAMA_SLOT: Record<number, string> = { 1: "Berangkat", 2: "Tiba di lokasi", 3: "Mendata", 4: "Pulang", 5: "Tiba di rumah" };
/** Foto awal yang harus ada dulu sebelum laporan. */
export const SLOT_AWAL = [1, 2];

export function peranKartu(peran: string | null | undefined): PeranKartu {
  const p = (peran ?? "").toLowerCase();
  if (p === "supervisor" || p === "korwil") return "supervisor";
  if (p === "pml") return "pml";
  return "ppl";
}
export const labelPeran = (p: PeranKartu): string => (p === "ppl" ? "PPL" : p === "pml" ? "PML" : "Supervisor");

// ------------------------------------------------------------------------------------------------------------------------------ waktu (WIB)
export const hariWib = (ms: number): string => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
export const jamWib = (ms: number): number => {
  const d = new Date(ms + 7 * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
const hariMs = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
/** Selisih hari kalender (b - a). */
export const selisihHari = (a: string, b: string): number => Math.round((hariMs(b) - hariMs(a)) / 86_400_000);
/** Senin-Jumat? */
export const hariKerjaKalender = (iso: string): boolean => {
  const w = new Date(hariMs(iso)).getUTCDay();
  return w >= 1 && w <= 5;
};
/** Jumlah hari kerja (Senin-Jumat) dari `dari` sampai `sampai`, keduanya ikut dihitung. */
export function hitungHariKerja(dari: string, sampai: string): number {
  const n = selisihHari(dari, sampai);
  let jml = 0;
  for (let i = 0; i <= n; i++) if (hariKerjaKalender(new Date(hariMs(dari) + i * 86_400_000).toISOString().slice(0, 10))) jml++;
  return jml;
}
const geser = (iso: string, n: number): string => new Date(hariMs(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** Hari ke-berapa dalam periode (awal periode = hari ke-1); null bila awal periode tidak diketahui. */
export const hariKeN = (mulai: string | null | undefined, hariIni: string): number | null => (mulai ? selisihHari(mulai, hariIni) + 1 : null);

// ------------------------------------------------------------------------------------------------------------------------------ realisasi
export type StatusRealisasi = {
  didata: number;
  total: number;
  /** 0..100 */
  persen: number;
  /** proporsi waktu terpakai 0..100; null = target selesai tidak diketahui */
  persenWaktu: number | null;
  sisaHariKerja: number | null;
  targetSelesai: string | null;
  bermasalah: boolean;
  ket: string;
};

const TGL_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const tglPendek = (iso: string): string => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${TGL_PENDEK[m - 1]}`;
};

export function statusRealisasi(i: { didata: number; total: number; mulai: string | null; targetSelesai: string | null; hariIni: string }): StatusRealisasi | null {
  if (!(i.total > 0)) return null;
  const didata = Math.max(0, Math.min(i.didata, i.total));
  const persen = Math.round((didata / i.total) * 100);
  const dasar = { didata, total: i.total, persen, targetSelesai: i.targetSelesai };
  if (!i.mulai || !i.targetSelesai || i.targetSelesai < i.mulai) {
    return { ...dasar, persenWaktu: null, sisaHariKerja: null, bermasalah: false, ket: `${didata} dari ${i.total} KK (${persen}%)` };
  }
  const lewat = i.hariIni > i.mulai ? hitungHariKerja(i.mulai, i.hariIni <= i.targetSelesai ? geser(i.hariIni, -1) : i.targetSelesai) : 0;
  const sisa = i.hariIni <= i.targetSelesai ? hitungHariKerja(i.hariIni < i.mulai ? i.mulai : i.hariIni, i.targetSelesai) : 0;
  const jumlah = lewat + sisa;
  const persenWaktu = jumlah > 0 ? Math.round((lewat / jumlah) * 100) : null;
  const selesai = didata >= i.total;
  const bermasalah = !selesai && (sisa === 0 || (persenWaktu !== null && persen < persenWaktu));
  const ket = selesai
    ? `${didata} dari ${i.total} KK, target tercapai`
    : sisa === 0
      ? `${didata} dari ${i.total} KK (${persen}%), target selesai ${tglPendek(i.targetSelesai)} sudah lewat`
      : `${didata} dari ${i.total} KK (${persen}%), sisa ${sisa} hari kerja sampai ${tglPendek(i.targetSelesai)}`;
  return { ...dasar, persenWaktu, sisaHariKerja: sisa, bermasalah, ket };
}

// ------------------------------------------------------------------------------------------------------------------------------ peringatan merah
/** Belum ada kerja sama sekali hari ini: tanpa foto, tanpa laporan, tanpa hasil lembar. */
export const belumAdaKerja = (h: RingkasHariIni): boolean => h.slot.length === 0 && !h.laporanSudah && !((h.hasilLembar ?? 0) > 0);

/** Pemeriksaan harian berlaku hari ini? Supervisor hanya pada hari ke-1, 3, 5, ...; peran lain tiap hari. */
export function wajibDiperiksa(peran: PeranKartu, h: Pick<RingkasHariIni, "mulai" | "tanggal">): boolean {
  if (peran !== "supervisor") return true;
  const n = hariKeN(h.mulai, h.tanggal);
  return n !== null && n % 2 === 1;
}

/** Peringatan merah menyala? (hari kerja, sudah lewat 13.00 WIB, belum ada kerja, dan hari ini memang diperiksa untuk peran itu) */
export function peringatanMerah(h: RingkasHariIni | null | undefined, nowMs: number): boolean {
  if (!h || !h.adaJadwal) return false;
  if (hariWib(nowMs) !== h.tanggal || jamWib(nowMs) < JAM_PERINGATAN) return false;
  return wajibDiperiksa(peranKartu(h.peran), h) && belumAdaKerja(h);
}

// ------------------------------------------------------------------------------------------------------------------------------ poin mendesak
export type NadaPoin = "merah" | "emas" | "biru" | "abu" | "hijau";
export type KodePoin = "foto_awal" | "laporan" | "sisa_foto" | "lengkap" | "libur" | "pilih_hari" | "info";
export type Poin = { kode: KodePoin; nada: NadaPoin; judul: string; uraian: string; aksi: string; href: string };

const namaSlot = (n: number, total: number): string => (total === 5 && NAMA_SLOT[n] ? `${n} ${NAMA_SLOT[n]}` : `${n}`);
const daftarSlot = (nomor: number[], total: number): string => nomor.map((n) => namaSlot(n, total)).join(", ");

const LABEL_LAPORAN: Record<PeranKartu, { judul: string; aksi: string }> = {
  ppl: { judul: "Isi laporan pendataan", aksi: "Buka laporan" },
  pml: { judul: "Isi lembar QC / pengawasan", aksi: "Buka lembar" },
  supervisor: { judul: "Isi lembar QC / supervisi", aksi: "Buka lembar" },
};

export function poinHariIni(h: RingkasHariIni, hrefHariIni: string): Poin {
  const hariKerjaBerikut = h.hariKerjaBerikut;
  const peran = peranKartu(h.peran);
  if (!h.adaJadwal) {
    return hariKerjaBerikut
      ? { kode: "libur", nada: "abu", judul: "Hari ini bukan hari kerja Anda", uraian: `Hari kerja berikutnya ${tglPendek(hariKerjaBerikut)}.`, aksi: "Lihat hari kerja", href: hrefHariIni }
      : { kode: "pilih_hari", nada: "emas", judul: "Pilih hari kerja", uraian: "Belum ada hari kerja yang dipilih. Foto dan laporan hanya bisa diisi pada hari kerja.", aksi: "Pilih hari kerja", href: `${h.hrefKerja}${h.hrefKerja.includes("?") ? "&" : "?"}tab=hari_kerja` };
  }
  const ada = new Set(h.slot);
  const awalKurang = SLOT_AWAL.filter((n) => n <= h.fotoTotal && !ada.has(n));
  if (awalKurang.length > 0) {
    return { kode: "foto_awal", nada: "biru", judul: "Foto Transport Lokal dulu", uraian: `Foto awal belum lengkap: ${daftarSlot(awalKurang, h.fotoTotal)}.`, aksi: "Ambil foto", href: hrefHariIni };
  }
  if (h.wajibLaporan && !h.laporanSudah) {
    const l = LABEL_LAPORAN[peran];
    return { kode: "laporan", nada: "biru", judul: l.judul, uraian: "Foto awal sudah ada. Laporan hari ini belum terisi.", aksi: l.aksi, href: h.hrefLembar ?? hrefHariIni };
  }
  const sisa: number[] = [];
  for (let n = 1; n <= h.fotoTotal; n++) if (!ada.has(n)) sisa.push(n);
  if (sisa.length > 0) {
    return { kode: "sisa_foto", nada: "biru", judul: `Lengkapi ${sisa.length} foto lagi`, uraian: `Foto yang tersisa: ${daftarSlot(sisa, h.fotoTotal)}.`, aksi: "Ambil foto", href: hrefHariIni };
  }
  return { kode: "lengkap", nada: "hijau", judul: "Hari ini sudah lengkap", uraian: "Foto dan laporan hari ini terisi.", aksi: "Lihat", href: hrefHariIni };
}

// ------------------------------------------------------------------------------------------------------------------------------ kartu
export type KartuBeranda = {
  id: string;
  /** pelatihan | pendataan | lain */
  jenis: "pelatihan" | "pendataan" | "lain";
  judul: string;
  peran: PeranKartu | null;
  href: string;
  nada: NadaKegiatan;
  /** kartu usang: selesai atau periodenya lewat -> di bawah dan redup */
  redup: boolean;
  poin: Poin | null;
  realisasi: StatusRealisasi | null;
  peringatan: { judul: string; uraian: string; href: string } | null;
  /** kartu yang dibuka lewat tautan masuk tunggal (penyisiran): diketuk sebagai tombol */
  sso?: "penyisiran";
};

const NADA_URUT: Record<string, number> = { merah: 0, emas: 1, biru: 2, abu: 3, hijau: 4 };

/** Peringatan merah di kartu: isi teks. */
export function teksPeringatan(h: RingkasHariIni, hrefHariIni: string): { judul: string; uraian: string; href: string } {
  return {
    judul: "Belum ada kegiatan hari ini",
    uraian: "Hari ini hari kerja Anda tetapi sampai 13.00 WIB belum ada foto maupun isian. Mulai sekarang, atau ubah hari kerja bila hari ini libur.",
    href: hrefHariIni || h.hrefKerja,
  };
}

/** Urutan kartu: aktif dulu (peringatan merah, lalu nada mendesak ke tenang, realisasi bermasalah menaikkan), usang di bawah. Urutan asli dipertahankan pada seri. */
export function urutKartu(daftar: KartuBeranda[]): KartuBeranda[] {
  const skor = (k: KartuBeranda): number => {
    if (k.redup) return 100 + NADA_URUT[k.nada];
    if (k.peringatan) return 0;
    const dasar = NADA_URUT[k.poin?.nada ?? k.nada] ?? 3;
    return k.realisasi?.bermasalah ? Math.min(dasar, 1) + 0.5 : dasar + 1;
  };
  return daftar.map((k, i) => ({ k, i })).sort((a, b) => skor(a.k) - skor(b.k) || a.i - b.i).map((v) => v.k);
}

/** Kartu usang? Kegiatan yang sudah selesai seluruhnya (nada hijau). */
export const kartuUsang = (nada: NadaKegiatan): boolean => nada === "hijau";

// ------------------------------------------------------------------------------------------------------------------------------ pembangun kartu
const NADA_DARI_KEKURANGAN: Record<string, NadaPoin> = { merah: "merah", emas: "emas", biru: "biru", abu: "abu", hijau: "hijau" };

/** Gabungkan nada kartu: peringatan merah > realisasi bermasalah (minimal emas) > nada poin. */
function nadaKartu(poin: Poin | null, realisasi: StatusRealisasi | null, peringatan: unknown, dasar: NadaKegiatan): NadaKegiatan {
  if (peringatan) return "merah";
  if (realisasi?.bermasalah) return "emas";
  if (!poin) return dasar;
  if (poin.kode === "lengkap") return "hijau";
  if (poin.kode === "libur" || poin.kode === "info") return dasar === "merah" || dasar === "emas" ? dasar : "abu";
  return poin.nada === "biru" && (dasar === "merah" || dasar === "emas") ? dasar : poin.nada;
}

type BahanTemplate = { induk: { pendataan?: { total: number; didata: number } | null } | undefined; keg: Pick<RingkasKegiatan, "kegiatan_id" | "hariIni" | "kekurangan" | "judul">[]; idTranslok: number[]; nowMs: number };

/**
 * Kartu kegiatan pendataan bermenu rutin (Hari Ini): poin dari ringkasan Transport Lokal kegiatan itu, realisasi dari ringkasan pendataan tim.
 * Tanpa ringkasan Transport Lokal (belum dimuat / bukan peserta) -> kartu memakai `cadangan` (informasi tahap).
 */
export function kartuTemplate(a: { id: string; judul: string; href: string; nada: NadaKegiatan }, b: BahanTemplate, cadangan: Poin | null): KartuBeranda {
  const k = b.keg.find((x) => x.kegiatan_id !== undefined && b.idTranslok.includes(x.kegiatan_id) && !!x.hariIni);
  const h = k?.hariIni ?? null;
  const poin = h ? poinHariIni(h, a.href) : cadangan;
  const peran = h ? peranKartu(h.peran) : null;
  const pend = b.induk?.pendataan ?? null;
  const realisasi = h && pend && peran !== "supervisor" ? statusRealisasi({ didata: pend.didata, total: pend.total, mulai: h.mulai, targetSelesai: h.targetSelesai, hariIni: h.tanggal }) : null;
  const peringatan = h && peringatanMerah(h, b.nowMs) ? teksPeringatan(h, a.href) : null;
  const redup = kartuUsang(a.nada);
  return {
    id: a.id,
    jenis: "pendataan",
    judul: a.judul,
    peran,
    href: a.href,
    nada: redup ? "hijau" : nadaKartu(poin, realisasi, peringatan, a.nada),
    redup,
    poin,
    realisasi,
    peringatan,
  };
}

/** Kartu sederhana (pelatihan, kegiatan lain): satu poin dari informasi yang ada. */
export function kartuBiasa(a: { id: string; judul: string; href: string; nada: NadaKegiatan; jenis: KartuBeranda["jenis"] }, poin: Poin | null): KartuBeranda {
  const redup = kartuUsang(a.nada);
  return { id: a.id, jenis: a.jenis, judul: a.judul, peran: null, href: a.href, nada: a.nada, redup, poin: redup ? null : poin, realisasi: null, peringatan: null };
}

export const poinInfo = (judul: string, href: string, nada: NadaPoin = "biru", aksi = "Buka", uraian = ""): Poin => ({ kode: "info", nada, judul, uraian, aksi, href });

/** Poin dari kekurangan teratas Transport Lokal (kegiatan tanpa ringkasan hari ini). */
export function poinDariKekurangan(k: { nada: string; judul: string; uraian: string; aksi: string; href: string } | undefined | null): Poin | null {
  if (!k) return null;
  return { kode: "info", nada: NADA_DARI_KEKURANGAN[k.nada] ?? "biru", judul: k.judul, uraian: k.uraian, aksi: k.aksi, href: k.href };
}

// ------------------------------------------------------------------------------------------------------------------------------ push 13.00
export const JENIS_KUNCI_PERINGATAN = "peringatan_belum_mendata";
export const kunciPeringatan = (tanggal: string, kegiatanId: number | string): string => `${JENIS_KUNCI_PERINGATAN}|${tanggal}|${kegiatanId}`;

/**
 * Push slot siang (13.00): kegiatan yang BELUM dikerjakan hari ini menurut aturan peringatan merah. Satu kegiatan per akun per hari (kunci riwayat).
 * `kegiatan` = ringkasan Transport Lokal akun (RingkasKegiatan.hariIni). Mengembalikan pesan atau null.
 */
export function pilihPeringatanPush(
  kegiatan: Pick<RingkasKegiatan, "judul" | "kegiatan_id" | "hariIni">[],
  nowMs: number,
  kunciSudah: ReadonlySet<string>
): { kunci: string; judul: string; isi: string; url: string } | null {
  for (const k of kegiatan) {
    const h = k.hariIni;
    if (!h || !peringatanMerah(h, nowMs)) continue;
    const kunci = kunciPeringatan(h.tanggal, k.kegiatan_id ?? k.judul);
    if (kunciSudah.has(kunci)) continue;
    const nama = k.judul.replace(/^Transport Lokal\s*[—-]\s*/, "");
    return {
      kunci,
      judul: "Belum ada pendataan hari ini",
      isi: `${nama}: sampai 13.00 WIB belum ada foto maupun isian. Ketuk untuk mulai; bila hari ini libur, ubah hari kerja Anda.`.slice(0, 160),
      url: h.hrefKerja,
    };
  }
  return null;
}
