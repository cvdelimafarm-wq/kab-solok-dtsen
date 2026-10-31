// lib/sigapPelatihanSurvei.ts
//
// (31 Okt 2026) Kelola Pelatihan per SURVEI: satu kartu untuk satu survei (kegiatan induk, sigap_induk), dan di dalam halaman kelola ada
// dropdown Survei (serta dropdown Pelatihan bila satu survei punya lebih dari satu pelatihan) -- sama seperti pemilih survei di Kelola Pendataan.
// Logika MURNI (tanpa React/DB) dipakai API daftar dan halaman; diuji di lib/__tests__/sigapPelatihanSurvei.test.ts.
// Survei = sigap_induk; pelatihan = kegiatan berjenis 'pelatihan' di kegiatan_ids induk itu. Alamat: ?survei=<kode induk>&kegiatan=<id pelatihan>&tab=...

export type StatusPelatihan = "berlangsung" | "akan_datang" | "selesai" | "nonaktif";

export type PelatihanSurvei = {
  id: number;
  kode: string;
  nama: string;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  status: StatusPelatihan;
  peserta: number;
  boleh_kelola: boolean;
  /** Pelatihan bawaan (dipakai server bila alamat tidak menyebut ?kegiatan). */
  bawaan?: boolean;
};

export type Survei = {
  /** Kode induk (sigap_induk.kode); pelatihan yang tidak termasuk induk mana pun memakai KODE_SURVEI_LAIN. */
  kode: string;
  nama: string;
  pelatihan: PelatihanSurvei[];
};

export const KODE_SURVEI_LAIN = "_lain";

const URUT_STATUS: Record<StatusPelatihan, number> = { berlangsung: 0, akan_datang: 1, selesai: 2, nonaktif: 3 };

/** Pelatihan yang dibuka pertama kali saat survei dipilih: yang sedang berlangsung, lalu yang akan datang paling dekat, lalu selesai paling baru. */
export function pilihPelatihanAwal(daftar: readonly PelatihanSurvei[]): PelatihanSurvei | null {
  if (daftar.length === 0) return null;
  const urut = [...daftar].sort((a, b) => {
    const s = URUT_STATUS[a.status] - URUT_STATUS[b.status];
    if (s !== 0) return s;
    const ta = a.tanggal_mulai ?? "";
    const tb = b.tanggal_mulai ?? "";
    // akan datang: yang paling dekat dulu; selainnya: yang paling baru dulu
    if (a.status === "akan_datang") return ta.localeCompare(tb) || a.id - b.id;
    return tb.localeCompare(ta) || a.id - b.id;
  });
  return urut[0];
}

export type RingkasSurvei = { jumlah: number; peserta: number; status: StatusPelatihan | "kosong"; mulai: string | null; selesai: string | null };

/** Ringkasan satu survei untuk kartu hub. */
export function ringkasSurvei(s: Pick<Survei, "pelatihan">): RingkasSurvei {
  const p = s.pelatihan;
  if (p.length === 0) return { jumlah: 0, peserta: 0, status: "kosong", mulai: null, selesai: null };
  const status = [...p].sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status])[0].status;
  const mulai = p.map((x) => x.tanggal_mulai).filter((x): x is string => !!x).sort()[0] ?? null;
  const selesai = p.map((x) => x.tanggal_selesai ?? x.tanggal_mulai).filter((x): x is string => !!x).sort().slice(-1)[0] ?? null;
  return { jumlah: p.length, peserta: p.reduce((a, x) => a + x.peserta, 0), status, mulai, selesai };
}

/**
 * Menyusun daftar survei dari induk + pelatihan yang boleh dilihat akun.
 * - Induk yang punya pelatihan terlihat selalu tampil.
 * - Induk TANPA pelatihan tampil (kartu "Belum ada pelatihan") hanya bila akun punya lingkup ke induk itu: lingkup "semua", atau salah satu kegiatan induk ada di lingkup.
 * - Pelatihan yang tidak masuk induk mana pun dikumpulkan di survei "Pelatihan lainnya".
 */
export function susunSurvei(
  induk: readonly { kode: string; nama: string; kegiatan_ids: readonly (number | string)[] | null }[],
  pelatihan: readonly PelatihanSurvei[],
  lingkup: "semua" | readonly number[],
): Survei[] {
  const hasil: Survei[] = [];
  const sisa = new Set(pelatihan.map((p) => p.id));
  for (const i of induk) {
    const anggota = (i.kegiatan_ids ?? []).map(Number);
    const isi = pelatihan.filter((p) => anggota.includes(p.id) && sisa.has(p.id));
    isi.forEach((p) => sisa.delete(p.id));
    const dalamLingkup = lingkup === "semua" || anggota.some((id) => lingkup.includes(id));
    if (isi.length === 0 && !dalamLingkup) continue;
    hasil.push({ kode: i.kode, nama: i.nama, pelatihan: urutkanPelatihan(isi) });
  }
  const lain = pelatihan.filter((p) => sisa.has(p.id));
  if (lain.length > 0) hasil.push({ kode: KODE_SURVEI_LAIN, nama: "Pelatihan lainnya", pelatihan: urutkanPelatihan(lain) });
  return hasil;
}

function urutkanPelatihan(p: readonly PelatihanSurvei[]): PelatihanSurvei[] {
  return [...p].sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status] || (b.tanggal_mulai ?? "").localeCompare(a.tanggal_mulai ?? "") || a.id - b.id);
}

// ----------------------------------------------------------------------------------------------
// Alamat halaman kelola
// ----------------------------------------------------------------------------------------------
export type ParamKelola = { kegiatan: number | null; survei: string | null; tab: string | null };

/** Membaca ?kegiatan, ?survei, ?tab dari query. Nilai tidak sah menjadi null. */
export function bacaParamKelola(search: string): ParamKelola {
  const q = new URLSearchParams(search);
  const k = q.get("kegiatan");
  const kegiatan = k && /^\d{1,12}$/.test(k) && Number(k) > 0 ? Number(k) : null;
  const s = (q.get("survei") ?? "").trim();
  const survei = /^[A-Za-z0-9_-]{1,60}$/.test(s) ? s : null;
  const t = (q.get("tab") ?? "").trim();
  const tab = /^[a-z_]{1,30}$/.test(t) ? t : null;
  return { kegiatan, survei, tab };
}

/** Alamat setelah memilih survei/pelatihan: ?survei dan ?kegiatan diisi, ?tab dan parameter lain dibiarkan. kegiatan null = hapus ?kegiatan. */
export function urlKelola(pathname: string, search: string, p: { survei: string | null; kegiatan: number | null }): string {
  const q = new URLSearchParams(search);
  if (p.survei) q.set("survei", p.survei);
  else q.delete("survei");
  if (p.kegiatan !== null) q.set("kegiatan", String(p.kegiatan));
  else q.delete("kegiatan");
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Survei yang memuat pelatihan `kegiatanId`; bila tidak ada, survei menurut kode `kode`. */
export function cariSurvei(daftar: readonly Survei[], kegiatanId: number | null, kode: string | null): Survei | null {
  if (kegiatanId !== null) {
    const s = daftar.find((x) => x.pelatihan.some((p) => p.id === kegiatanId));
    if (s) return s;
  }
  return kode ? (daftar.find((x) => x.kode === kode) ?? null) : null;
}
