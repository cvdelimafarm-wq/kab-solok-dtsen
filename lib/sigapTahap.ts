// lib/sigapTahap.ts
//
// (9 Okt 2026) Struktur baru SIGAP (permintaan user, mockup "Kegiatan, Proses Bisnis, Halaman Kerja" disetujui):
//   Layer 1 = KEGIATAN induk (mis. Pendataan Pascabencana, NTP, Penyisiran)
//   Layer 2 = TAHAP proses bisnis di dalam kegiatan (Perencanaan, Pelatihan, Pendataan, Evaluasi, dst.), diatur admin per kegiatan
//   Layer 3 = halaman kerja (langkah pelatihan, Transport Lokal, wilayah tugas per tim, dst.)
// Berkas ini murni (tanpa React/DB) supaya mudah diuji: tipe bersama server-klien, status tiap modul & tahap, aturan buka, ringkasan Layer 1.
// Data tahap disimpan di tabel sigap_induk + sigap_tahap; modul yang boleh diisikan ke satu tahap ada di KATALOG_MODUL.

import { ringkasPelatihan, type NadaKegiatan, type RingkasKegiatan, type StatusLangkah } from "@/lib/sigapKegiatan";
import type { HubTugas, IkonKode } from "@/lib/sigapTugasUtama";

export type BukaMode = "langsung" | "setelah_sebelumnya" | "tanggal";

export type TahapDef = {
  kode: string;
  urutan: number;
  nama: string;
  uraian: string | null;
  /** kode modul halaman kerja: konfirmasi | pelatihan | wilayah_tim | translok:<kegiatan_id> */
  isi: string[];
  buka_mode: BukaMode;
  buka_tanggal: string | null;
};

/** Perencanaan (konfirmasi kesediaan & wilayah) untuk akun yang terhubung ke petugas bencana. */
export type InfoPerencanaan = { konfirmasi: boolean | null; href: string | null; pesan?: string | null };
/** Ringkasan wilayah tugas tim (detail lengkap di /api/portal/wilayah-tim). */
export type InfoWilayah = { total: number; ada_laporan: number; kk: number; kk_terdampak: number };

export type Induk = {
  kode: string;
  nama: string;
  pendek: string;
  ikon: IkonKode;
  /** id ikon Layer 1 yang diserap kegiatan induk ini (supaya tidak tampil dobel) */
  menyerap: string[];
  tahap: TahapDef[];
  perencanaan: InfoPerencanaan | null;
  wilayah: InfoWilayah | null;
};

export type ModulTahap = {
  kode: string;
  judul: string;
  ket: string;
  status: StatusLangkah;
  /** halaman kerja (Layer 3); null = tampil di halaman tahap itu sendiri / belum bisa dibuka */
  href: string | null;
  aksi?: string;
  /** 0..1 untuk cincin progres */
  pecahan: number;
  batas?: string | null;
};

export type TahapHasil = TahapDef & {
  no: number;
  status: StatusLangkah;
  modul: ModulTahap[];
  terkunci: boolean;
  alasanKunci: string | null;
  /** halaman tujuan ketukan tahap */
  rute: string;
  /** satu baris keterangan */
  ringkas: string;
  /** 0..1 */
  pecahan: number;
};

export type KonteksTahap = {
  induk: Induk;
  hub: HubTugas | null;
  hubMuat: "memuat" | "siap" | "gagal";
  /** ringkasan Transport Lokal dari /api/portal/kegiatan (punya kegiatan_id) */
  keg: RingkasKegiatan[];
  nowMs: number;
};

export const KATALOG_MODUL: { kode: string; label: string; ket: string }[] = [
  { kode: "konfirmasi", label: "Konfirmasi kesediaan & wilayah", ket: "Halaman konfirmasi petugas/PML (undangan bencana)." },
  { kode: "pelatihan", label: "Langkah pelatihan", ket: "Undangan, instrumen, tes, presensi, foto." },
  { kode: "wilayah_tim", label: "Wilayah tugas per tim", ket: "Tim (PML + semua PPL) dan Sub SLS yang didata bersama, lengkap dengan perkiraan KK." },
  { kode: "translok:", label: "Transport Lokal", ket: "Hari kerja, laporan & foto harian, SPJ untuk satu kegiatan anggaran." },
];

export const NAMA_MODUL = (kode: string, namaKegiatan?: string): string => {
  if (kode === "konfirmasi") return "Konfirmasi kesediaan & wilayah";
  if (kode === "pelatihan") return "Langkah pelatihan";
  if (kode === "wilayah_tim") return "Wilayah tugas per tim";
  if (kode.startsWith("translok:")) return `Transport Lokal${namaKegiatan ? ` (${namaKegiatan})` : ` (kegiatan ${kode.slice(9)})`}`;
  return kode;
};

/** Modul sah: salah satu dari katalog. */
export function modulSah(kode: string): boolean {
  return kode === "konfirmasi" || kode === "pelatihan" || kode === "wilayah_tim" || /^translok:\d+$/.test(kode);
}

const NADA_KE_STATUS: Record<NadaKegiatan, StatusLangkah> = { merah: "mendesak", emas: "perlu", biru: "berjalan", abu: "menunggu", hijau: "selesai" };

const pad = (n: number) => String(n).padStart(2, "0");
/** Tanggal WIB (YYYY-MM-DD) dari epoch ms. */
export function tanggalWib(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function tglPendek(iso: string): string {
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${b[m - 1]} ${y}`;
}

/** Modul -> keadaan petugas ini; null = modul tidak berlaku bagi petugas (mis. bukan peserta pelatihan). */
export function susunModul(kode: string, tahap: TahapDef, k: KonteksTahap): ModulTahap[] {
  const { induk, hub, hubMuat, keg, nowMs } = k;
  if (kode === "konfirmasi") {
    const p = induk.perencanaan;
    if (!p) return [];
    if (p.konfirmasi === true) return [{ kode, judul: "Konfirmasi kesediaan & wilayah", ket: "Kesediaan sudah dikonfirmasi", status: "selesai", href: p.href, aksi: "Lihat", pecahan: 1 }];
    return [
      {
        kode,
        judul: "Konfirmasi kesediaan & wilayah",
        ket: p.pesan ?? (p.href ? "Konfirmasi bersedia dan cek wilayah tugas" : "Belum ada halaman konfirmasi"),
        status: p.href ? "perlu" : "menunggu",
        href: p.href,
        aksi: "Konfirmasi sekarang",
        pecahan: 0,
      },
    ];
  }
  if (kode === "pelatihan") {
    if (hubMuat === "siap" && (!hub || !hub.peserta)) return [];
    if (hubMuat !== "siap" || !hub) {
      return [{ kode, judul: "Langkah pelatihan", ket: hubMuat === "memuat" ? "Memuat…" : "Buka untuk melihat langkah", status: "menunggu", href: "/sigap/pelatihan", aksi: "Buka", pecahan: 0 }];
    }
    const r = ringkasPelatihan(hub, nowMs);
    if (!r) return [];
    return [{ kode, judul: "Langkah pelatihan", ket: r.sub, status: NADA_KE_STATUS[r.nada], href: r.href, aksi: "Buka langkah", pecahan: r.pecahan ?? 0 }];
  }
  if (kode === "wilayah_tim") {
    const w = induk.wilayah;
    if (!w || w.total <= 0) return [];
    const status: StatusLangkah = w.ada_laporan >= w.total ? "selesai" : w.ada_laporan > 0 ? "berjalan" : "menunggu";
    return [
      {
        kode,
        judul: "Wilayah tugas tim",
        ket: `${w.total} Sub SLS · ${w.ada_laporan} sudah ada laporan`,
        status,
        href: null,
        pecahan: w.total ? Math.min(1, w.ada_laporan / w.total) : 0,
      },
    ];
  }
  const m = /^translok:(\d+)$/.exec(kode);
  if (m) {
    const id = Number(m[1]);
    return keg
      .filter((x) => x.kegiatan_id === id)
      .map((x) => ({
        kode: x.id,
        judul: x.judul,
        ket: x.sub,
        status: NADA_KE_STATUS[x.nada],
        href: x.href ? `${x.href}?dari=${encodeURIComponent(ruteTahap(induk, tahap))}` : null,
        aksi: "Buka",
        pecahan: x.pecahan ?? (x.nada === "hijau" ? 1 : 0),
      }));
  }
  return [];
}

/** Halaman tujuan ketukan tahap: Pelatihan membuka halaman Langkah yang sudah ada; lainnya halaman tahap generik. */
export function ruteTahap(induk: Pick<Induk, "kode">, tahap: Pick<TahapDef, "kode" | "isi">): string {
  if (tahap.isi.includes("pelatihan")) return "/sigap/pelatihan";
  return `/sigap/kegiatan/${induk.kode}/${tahap.kode}`;
}

function statusDariModul(modul: ModulTahap[]): StatusLangkah {
  if (modul.length === 0) return "menunggu";
  if (modul.some((m) => m.status === "mendesak")) return "mendesak";
  if (modul.some((m) => m.status === "perlu")) return "perlu";
  if (modul.every((m) => m.status === "selesai")) return "selesai";
  if (modul.some((m) => m.status === "selesai" || m.status === "berjalan" || m.status === "sekarang")) return "berjalan";
  return "menunggu";
}

/** Daftar tahap yang berlaku bagi petugas ini, lengkap dengan status & kunci. */
export function susunTahap(k: KonteksTahap): TahapHasil[] {
  const hariIni = tanggalWib(k.nowMs);
  const hasil: TahapHasil[] = [];
  const urut = [...k.induk.tahap].sort((a, b) => a.urutan - b.urutan);
  for (const def of urut) {
    const modul = def.isi.flatMap((kode) => susunModul(kode, def, k));
    // tahap berisi modul tapi tak satu pun berlaku bagi petugas ini -> tidak ditampilkan (mis. PML non-peserta pelatihan)
    if (def.isi.length > 0 && modul.length === 0) continue;
    const prev = hasil[hasil.length - 1];
    let terkunci = false;
    let alasan: string | null = null;
    if (def.buka_mode === "tanggal" && def.buka_tanggal && hariIni < def.buka_tanggal) {
      terkunci = true;
      alasan = `Dibuka ${tglPendek(def.buka_tanggal)}`;
    } else if (def.buka_mode === "setelah_sebelumnya" && prev && prev.status !== "selesai") {
      terkunci = true;
      alasan = `Dibuka setelah ${prev.nama} selesai`;
    }
    const statusModul = statusDariModul(modul);
    const status: StatusLangkah = terkunci ? "terkunci" : def.isi.length === 0 ? "menunggu" : statusModul;
    const pecahan = modul.length ? modul.reduce((a, m) => a + m.pecahan, 0) / modul.length : 0;
    const selesaiModul = modul.filter((m) => m.status === "selesai").length;
    const ringkas = terkunci
      ? (alasan ?? "Belum dibuka")
      : def.isi.length === 0
        ? "Belum ada isi"
        : status === "selesai"
          ? "Selesai"
          : (modul.find((m) => m.status === "mendesak" || m.status === "perlu")?.ket ?? `${selesaiModul} dari ${modul.length} bagian selesai`);
    hasil.push({
      ...def,
      no: hasil.length + 1,
      status,
      modul,
      terkunci,
      alasanKunci: alasan,
      rute: ruteTahap(k.induk, def),
      ringkas,
      pecahan: status === "selesai" ? 1 : pecahan,
    });
  }
  return hasil;
}

/** Tahap yang dikerjakan sekarang: tahap pertama yang tak terkunci dan berisi modul mendesak/perlu; null bila tidak ada. */
export function tahapSekarang(t: TahapHasil[]): { tahap: TahapHasil; modul: ModulTahap } | null {
  for (const st of ["mendesak", "perlu"] as const) {
    for (const h of t) {
      if (h.terkunci) continue;
      const m = h.modul.find((x) => x.status === st);
      if (m) return { tahap: h, modul: m };
    }
  }
  return null;
}

/** Ikon Layer 1 untuk kegiatan induk. */
export function ringkasInduk(k: KonteksTahap): RingkasKegiatan | null {
  const t = susunTahap(k);
  if (t.length === 0) return null;
  const buka = t.filter((x) => !x.terkunci);
  const selesai = t.filter((x) => x.status === "selesai").length;
  let nada: NadaKegiatan;
  let pesan: string;
  const sekarang = tahapSekarang(t);
  if (selesai === t.length) {
    nada = "hijau";
    pesan = "Selesai";
  } else if (buka.some((x) => x.status === "mendesak")) {
    nada = "merah";
    pesan = sekarang?.modul.ket ?? "Mendesak";
  } else if (buka.some((x) => x.status === "perlu")) {
    nada = "emas";
    pesan = sekarang?.modul.ket ?? "Perlu dilengkapi";
  } else if (buka.every((x) => x.status === "menunggu") && buka.every((x) => x.pecahan === 0)) {
    nada = "abu";
    pesan = "Belum mulai";
  } else {
    nada = "biru";
    const aktif = buka.find((x) => x.status === "berjalan");
    pesan = aktif ? `${aktif.nama} berjalan` : "Berjalan";
  }
  return {
    id: `induk-${k.induk.kode}`,
    judul: k.induk.nama,
    pendek: k.induk.pendek,
    ikon: k.induk.ikon,
    nada,
    pecahan: t.reduce((a, x) => a + x.pecahan, 0) / t.length,
    selesai,
    total: t.length,
    sub: `${selesai}/${t.length} tahap · ${pesan}`,
    peringatan: nada === "merah" || nada === "emas",
    href: `/sigap/kegiatan/${k.induk.kode}`,
  };
}

/** Pembersihan masukan admin: kode tahap, urutan, isi sah. Mengembalikan pesan galat atau null. */
export function periksaTahapAdmin(t: { kode: string; nama: string; isi: string[]; buka_mode: string; buka_tanggal: string | null }, kegiatanIds: number[]): string | null {
  if (!/^[a-z0-9_]{2,30}$/.test(t.kode)) return `Kode tahap "${t.kode}" harus huruf kecil/angka/garis bawah (2–30 karakter).`;
  if (!t.nama.trim() || t.nama.length > 60) return `Nama tahap "${t.kode}" wajib diisi (maks 60 karakter).`;
  if (!["langsung", "setelah_sebelumnya", "tanggal"].includes(t.buka_mode)) return `Aturan buka tahap "${t.nama}" tidak dikenal.`;
  if (t.buka_mode === "tanggal" && !(t.buka_tanggal && /^\d{4}-\d{2}-\d{2}$/.test(t.buka_tanggal))) return `Tahap "${t.nama}" memakai aturan tanggal tetapi tanggalnya belum diisi.`;
  for (const m of t.isi) {
    if (!modulSah(m)) return `Modul "${m}" pada tahap "${t.nama}" tidak dikenal.`;
    const tm = /^translok:(\d+)$/.exec(m);
    if (tm && !kegiatanIds.includes(Number(tm[1]))) return `Transport Lokal kegiatan ${tm[1]} bukan bagian dari kegiatan induk ini.`;
  }
  if (new Set(t.isi).size !== t.isi.length) return `Tahap "${t.nama}" memuat modul yang sama dua kali.`;
  return null;
}
