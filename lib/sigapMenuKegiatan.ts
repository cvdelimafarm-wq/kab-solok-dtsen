// lib/sigapMenuKegiatan.ts  (murni)
//
// (31 Okt 2026) Template halaman kegiatan "menu rutin" (permintaan user): ikon kegiatan di Beranda langsung membuka HARI INI, dan satu bar bawah yang sama
// dipakai di semua halaman kegiatan itu:
//   PPL        : Hari Ini | Sampel | [Kamera] | Translok
//   PML        : Hari Ini | Sampel | Pengawasan | [Kamera] | Translok
//   Supervisor : Hari Ini | Sampel | Supervisi  | [Kamera] | Translok        ([Kamera] = tombol aksi, bukan tab)
// Aturan UMUM (tanpa konfigurasi per kegiatan): pekerjaan RUTIN (translok, sampel, pendataan, pengawasan) tampil sebagai tab sejajar tanpa nomor/kunci;
// hanya langkah SEKALI JALAN dan berurutan (konfirmasi, pelatihan, identifikasi) yang disebut "tahap". Kegiatan yang seluruh isinya rutin memakai template ini.
// (31 Okt 2026, Fase 4) Pascabencana ikut: bagian PENDATAANnya (tahap tanpa modul pelatihan -- pelatihan tetap kegiatan sendiri dengan ikon sendiri) memakai template;
// langkah sekali jalan (konfirmasi kesediaan, identifikasi SLS) tampil sebagai kartu "Selesaikan dulu" di Hari Ini, bukan tahap bernomor.
// Bawaan ada di sini (kode); penggantian per kegiatan lewat Kelola menyusul (Fase 2).

export type PeranMenu = "ppl" | "pml" | "supervisor";
export type KunciTab = "hari_ini" | "sampel" | "pengawasan" | "translok";
export type KunciItem = KunciTab | "kamera";

/** Modul yang sifatnya berulang tiap hari (bukan langkah yang selesai sekali). */
export function modulRutin(kode: string): boolean {
  return kode === "pendataan" || kode === "monitoring_korwil" || kode === "spdt_lembar" || /^translok:\d+$/.test(kode) || /^sampel:\d+$/.test(kode);
}

/**
 * Modul yang halamannya SUDAH memasang bar bawah ini. Kegiatan hanya memakai template bila semua modulnya ada di sini (kegiatan lain tetap memakai
 * garis waktu tahap sampai halamannya ikut dipasangi bar). Tambahkan kode modul di sini ketika halamannya selesai diadaptasi.
 */
const MODUL_BERBAR = new Set<string>(["spdt_lembar", "pendataan", "monitoring_korwil"]);
const adaBar = (kode: string) => MODUL_BERBAR.has(kode) || /^translok:\d+$/.test(kode);

/** Langkah SEKALI JALAN: tidak menjadi tab, melainkan kartu "Selesaikan dulu" di Hari Ini selama belum selesai. */
export const MODUL_SEKALI = ["konfirmasi", "identifikasi"] as const;
/** Modul hanya-informasi (tanpa halaman sendiri): ikut kegiatan bermenu tanpa menjadi tab. */
const MODUL_INFO = new Set<string>(["wilayah_tim"]);
const sekali = (kode: string) => (MODUL_SEKALI as readonly string[]).includes(kode);

/** Tahap yang membentuk kegiatan "Pendataan" (semua selain Pelatihan; kegiatan Pelatihan punya ikon dan halaman sendiri). */
export function tahapMenu<T extends { isi: readonly string[] }>(tahap: readonly T[]): T[] {
  return tahap.filter((t) => !t.isi.includes("pelatihan"));
}

/** id kegiatan Transport Lokal yang termasuk kegiatan bermenu (bukan translok milik tahap Pelatihan). */
export function idTranslokMenu(tahap: readonly { isi: readonly string[] }[]): number[] {
  return tahapMenu(tahap)
    .flatMap((t) => [...t.isi])
    .flatMap((m) => (/^translok:\d+$/.test(m) ? [Number(m.slice(9))] : []));
}

/**
 * Kegiatan memakai template menu bila (di luar tahap Pelatihan) ada isinya, SEMUA isinya rutin-dan-berbar / sekali jalan / informasi, dan sedikitnya
 * satu modul pemicu (lembar pendataan atau supervisi) sudah berbar.
 */
export function pakaiTemplateMenu(tahap: readonly { isi: readonly string[] }[]): boolean {
  const semua = tahapMenu(tahap).flatMap((t) => [...t.isi]);
  return semua.length > 0 && semua.every((m) => (modulRutin(m) && adaBar(m)) || sekali(m) || MODUL_INFO.has(m)) && semua.some((m) => MODUL_BERBAR.has(m));
}

/**
 * Peran akun di menu: Supervisor SPDT / PPL / PML SPDT menurut `spdt.peran`; Pascabencana: kortim (korwil) = supervisor, selain itu peran di tim wilayah
 * (pml/ppl). null = akun tidak punya peran di kegiatan ini (halaman memakai tampilan lamanya).
 */
export function peranMenuDariInduk(i: { spdt?: { peran?: string | null } | null; korwil?: unknown | null; wilayah?: { peran?: string | null } | null }): PeranMenu | null {
  const sah = (p: string | null | undefined): PeranMenu | null => (p === "ppl" || p === "pml" || p === "supervisor" ? p : null);
  const dariSpdt = sah(i.spdt?.peran);
  if (dariSpdt) return dariSpdt;
  if (i.korwil) return "supervisor";
  return sah(i.wilayah?.peran);
}

export type LangkahSekali = { kode: string; judul: string; ket: string; href: string; aksi: string; mendesak: boolean };

/**
 * Langkah sekali jalan yang BELUM selesai, dari modul hasil susunTahap. Tautan `?dari=` (tujuan tombol Kembali tahap lama) dialihkan ke Hari Ini kegiatan.
 */
export function langkahSekali(
  kodeInduk: string,
  modul: readonly { kode: string; judul: string; ket: string; status: string; href: string | null; aksi?: string }[],
): LangkahSekali[] {
  return modul
    .filter((m) => sekali(m.kode) && m.status !== "selesai" && !!m.href)
    .map((m) => {
      const [dasar, qs = ""] = (m.href as string).split("?");
      const q = new URLSearchParams(qs);
      if (q.has("dari")) q.set("dari", `/sigap/kegiatan/${kodeInduk}`);
      const s = q.toString();
      return { kode: m.kode, judul: m.judul, ket: m.ket, href: s ? `${dasar}?${s}` : dasar, aksi: m.aksi ?? "Buka", mendesak: m.status === "mendesak" || m.status === "perlu" };
    });
}

export type ItemBar = { kunci: KunciItem; label: string; href: string };

export type BahanBar = {
  kode: string; // kode kegiatan induk
  peran: PeranMenu;
  /** kode modul yang berlaku bagi akun ini (hasil susunTahap), mis. ["spdt_lembar", "translok:2"] */
  modul: readonly string[];
  /** penugasan Transport Lokal akun di kegiatan ini (href halaman kerja `/sigap/translok/<token>?p=<id>`), null = tidak punya */
  translok: { href: string; kegiatanId: number } | null;
  /** istilah yang boleh diganti per kegiatan (bawaan di bawah) */
  istilah?: Partial<{ sampel: string; pengawasan: string; supervisi: string; translok: string }>;
};

const tambahParam = (href: string, p: Record<string, string>): string => {
  const [dasar, qs = ""] = href.split("?");
  const q = new URLSearchParams(qs);
  for (const [k, v] of Object.entries(p)) q.set(k, v);
  return `${dasar}?${q.toString()}`;
};

/** Alamat halaman kerja tab "Sampel" menurut modul pertama yang cocok. null = kegiatan tak punya tab ini. */
export function alamatSampel(modul: readonly string[]): string | null {
  if (modul.includes("spdt_lembar")) return "/sigap/spdt?tab=sampel";
  const s = modul.find((m) => /^sampel:\d+$/.test(m));
  if (s) return `/sigap/sampel?k=${s.slice(7)}`;
  if (modul.includes("pendataan")) return "/sigap/pendataan";
  return null;
}

/** Alamat tab Pengawasan/Supervisi; hanya PML dan Supervisor. */
export function alamatPengawasan(modul: readonly string[], peran: PeranMenu): string | null {
  if (peran === "ppl") return null;
  if (modul.includes("spdt_lembar")) return "/sigap/spdt?tab=pengawasan";
  if (modul.includes("monitoring_korwil")) return "/sigap/korwil";
  return null;
}

/** Alamat Hari Ini: halaman kerja Translok bila punya penugasan, selain itu halaman ringkas kegiatan. */
export function alamatHariIni(b: Pick<BahanBar, "kode" | "translok">): string {
  return b.translok ? tambahParam(b.translok.href, { k: b.kode, tab: "hari_ini" }) : `/sigap/kegiatan/${b.kode}`;
}

export function susunBar(b: BahanBar): ItemBar[] {
  const ist = b.istilah ?? {};
  const item: ItemBar[] = [{ kunci: "hari_ini", label: "Hari Ini", href: alamatHariIni(b) }];
  const sampel = alamatSampel(b.modul);
  if (sampel) item.push({ kunci: "sampel", label: ist.sampel ?? "Sampel", href: tambahParam(sampel, { k: b.kode }) });
  const awas = alamatPengawasan(b.modul, b.peran);
  if (awas) item.push({ kunci: "pengawasan", label: b.peran === "supervisor" ? (ist.supervisi ?? "Supervisi") : (ist.pengawasan ?? "Pengawasan"), href: tambahParam(awas, { k: b.kode }) });
  if (b.translok) {
    item.push({ kunci: "kamera", label: "Kamera", href: `/sigap/foto?kegiatan=${b.translok.kegiatanId}` });
    item.push({ kunci: "translok", label: ist.translok ?? "Translok", href: tambahParam(b.translok.href, { k: b.kode, tab: "hari_kerja" }) });
  }
  return item;
}

/** Tab yang aktif pada halaman Translok: tiga tab dalamnya dilipat menjadi satu item "Translok". */
export function tabBarDariTranslok(tab: string): KunciTab {
  return tab === "hari_ini" ? "hari_ini" : "translok";
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Tombol Back antar tab (permintaan user): Back = tab yang diklik sebelumnya, lalu Hari Ini, lalu Beranda. Riwayat tidak menumpuk: tab yang sudah
// ada di tumpukan tidak didorong lagi, melainkan MUNDUR ke sana, sehingga satu Back selalu satu langkah dan panjang tumpukan paling banyak jumlah tab.
// ---------------------------------------------------------------------------------------------------------------------------------------
export type KeputusanTab = { aksi: "tetap" } | { aksi: "mundur"; n: number; tumpuk: string[] } | { aksi: "maju"; tumpuk: string[] };
export const MAKS_TUMPUK = 6;

/** Samakan tumpukan dengan tab yang sedang tampil (Back sistem bisa mengubahnya tanpa lewat bar). */
export function selaraskanTumpuk(tumpuk: readonly string[], sekarang: string): string[] {
  const i = tumpuk.lastIndexOf(sekarang);
  if (i >= 0) return tumpuk.slice(0, i + 1);
  return [sekarang];
}

export function putuskanTab(tumpuk: readonly string[], sekarang: string, tujuan: string): KeputusanTab {
  const t = selaraskanTumpuk(tumpuk, sekarang);
  if (tujuan === sekarang) return { aksi: "tetap" };
  const i = t.indexOf(tujuan);
  if (i >= 0 && i < t.length - 1) return { aksi: "mundur", n: t.length - 1 - i, tumpuk: t.slice(0, i + 1) };
  return { aksi: "maju", tumpuk: [...t, tujuan].slice(-MAKS_TUMPUK) };
}
