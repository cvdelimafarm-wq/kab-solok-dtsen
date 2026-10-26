// lib/korwilMonitor.ts
//
// (19 Okt 2026) Monitoring Korwil di HP (kortim): Progres Lapangan per tim PML + Progres Administrasi (PPL/PML x tanggal). HANYA-BACA.
// Fungsi MURNI (tanpa database) supaya mudah diuji; datanya dikumpulkan oleh lib/portal/korwilMonitor.ts.
//
// Aturan (keputusan user 19 Okt 2026):
//  - Target tim = KK di Sub SLS aktif tim (Sub SLS non aktif / dibekukan tidak dihitung). Realisasi = KK terdampak + tidak terdampak yang sudah didata;
//    "tidak ditemukan" ditampilkan terpisah (tidak dihitung berhasil), sama dengan tab Monitoring.
//  - Sub SLS yang didata LEBIH DARI SATU PML (tim berbagi Sub SLS) DIPROPORSIKAN: realisasi tiap tim = KK yang didata anggota timnya sendiri;
//    sisa yang belum didata (total KK - jumlah didata semua tim) dibagi rata ke tim-tim itu dan ditambahkan ke target masing-masing.
//    Contoh: 77 KK, tim A didata 30, tim B 41 -> sisa 6 -> target A = 30 + 3 = 33, target B = 41 + 3 = 44.
//    Sisa ganjil: kelebihan satu KK diberikan ke tim yang realisasinya lebih besar (seri: id PML lebih kecil), jadi jumlah target tim = total KK.
//    Karena itu angka tim dapat dijumlahkan langsung menjadi angka kelompok tanpa menghitung dua kali.
//  - Sub SLS yang hanya dipegang satu tim: realisasi = semua KK yang sudah didata di Sub SLS itu, siapa pun penandanya.
//  - Progres Administrasi memakai penilai hari yang sama dengan tab Monitoring (kelasHari): lengkap / sebagian / kosong / anomali / tidak ada;
//    hari ini yang belum lengkap tampil "berjalan" (belum dinilai).

import type { BarisKkMon } from "@/lib/pendataanMonitor";
import { daftarTanggal, kelasHari, type KelasHari } from "@/lib/monitorKinerja";
import { ringkasDariSel } from "@/lib/ringkasHariKerja";

// ----------------------------------------------------------------------------------------------- masukan
export type AnggotaKorwil = { petugas_id: number; nama: string; akun_ids: number[] };
/** Satu tim: PML + PPL-nya. `tampil` = false untuk tim di luar kelompok yang hanya dibutuhkan untuk membagi Sub SLS bersama. */
export type TimKorwilMasuk = { pml: AnggotaKorwil; ppl: AnggotaKorwil[]; tampil: boolean };
export type SubInfoKorwil = { nagari: string; sls: string; sub_sls: string };
export type SubPmlKorwil = { idsubsls: string; pml_id: number };

// ----------------------------------------------------------------------------------------------- keluaran Lapangan
export type SubKorwil = {
  idsubsls: string;
  nagari: string;
  label: string;
  /** seluruh KK aktif di Sub SLS (tanpa pembagian) */
  kk_total: number;
  target: number;
  realisasi: number;
  tidak_ditemukan: number;
  /** jumlah tim yang memegang Sub SLS ini (1 = tidak dibagi) */
  dibagi: number;
};
export type NagariKorwil = { nagari: string; sub: number; target: number; realisasi: number };
export type ProgresPetugas = { petugas_id: number; nama: string; peran: "pml" | "ppl"; didata: number; tidak_ditemukan: number };
export type TimProgres = {
  pml_id: number;
  pml_nama: string;
  pml: ProgresPetugas;
  ppl: ProgresPetugas[];
  sub: SubKorwil[];
  nagari: NagariKorwil[];
  target: number;
  realisasi: number;
  tidak_ditemukan: number;
  sub_dibagi: number;
};
export type LapanganKorwil = {
  tim: TimProgres[];
  total: { target: number; realisasi: number; tidak_ditemukan: number; sub: number; tim: number; ppl: number };
};

const berhasil = (h: BarisKkMon["hasil"]) => h === "terdampak" || h === "tidak_terdampak";

/** "JORONG GANDO" -> "Gando"; "MUARO PINGAI" -> "Muaro Pingai" (data di DB kapital). */
export function judulWilayah(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
    .replace(/\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b/gi, (m) => m.toUpperCase()); // angka romawi ("Guci Ii" -> "Guci II")
}
export function labelSubKorwil(sls: string, subSls: string): string {
  const nama = judulWilayah(sls.replace(/^\s*JORONG\s+/i, ""));
  return `${nama} ${subSls}`.trim();
}

type Hitungan = { total: number; didataTim: number; tdkTim: number; didataSemua: number; tdkSemua: number };

export function susunLapanganKorwil(m: {
  tim: TimKorwilMasuk[];
  sub: SubPmlKorwil[];
  nonaktif: ReadonlySet<string>;
  baris: BarisKkMon[];
  info: ReadonlyMap<string, SubInfoKorwil>;
}): LapanganKorwil {
  const { tim, nonaktif, baris, info } = m;

  // akun -> tim (satu akun hanya milik satu tim)
  const akunKeTim = new Map<number, number>();
  for (const t of tim) for (const p of [t.pml, ...t.ppl]) for (const a of p.akun_ids) if (!akunKeTim.has(a)) akunKeTim.set(a, t.pml.petugas_id);

  // Sub SLS aktif tiap tim (urutan tetap, tanpa kembar) dan siapa saja pemegangnya
  const timAda = new Set(tim.map((t) => t.pml.petugas_id));
  const subTim = new Map<number, string[]>();
  const pemegang = new Map<string, number[]>();
  for (const s of m.sub) {
    if (!timAda.has(s.pml_id) || nonaktif.has(s.idsubsls)) continue;
    const daftar = subTim.get(s.pml_id) ?? [];
    if (daftar.includes(s.idsubsls)) continue;
    daftar.push(s.idsubsls);
    subTim.set(s.pml_id, daftar);
    pemegang.set(s.idsubsls, [...(pemegang.get(s.idsubsls) ?? []), s.pml_id]);
  }

  // hitungan per (tim, Sub SLS) dari baris ringkasan tim itu
  const hitung = new Map<string, Hitungan>();
  const kunci = (pml: number, sub: string) => `${pml}|${sub}`;
  for (const b of baris) {
    if (!(subTim.get(b.pml_id)?.includes(b.idsubsls) ?? false)) continue;
    const k = kunci(b.pml_id, b.idsubsls);
    const h = hitung.get(k) ?? { total: 0, didataTim: 0, tdkTim: 0, didataSemua: 0, tdkSemua: 0 };
    h.total += b.jumlah;
    if (b.hasil !== null && b.ppl_akun_id !== null) {
      const milikTim = akunKeTim.get(b.ppl_akun_id) === b.pml_id;
      if (berhasil(b.hasil)) {
        h.didataSemua += b.jumlah;
        if (milikTim) h.didataTim += b.jumlah;
      } else if (b.hasil === "tidak_ditemukan") {
        h.tdkSemua += b.jumlah;
        if (milikTim) h.tdkTim += b.jumlah;
      }
    }
    hitung.set(k, h);
  }
  const ambil = (pml: number, sub: string): Hitungan => hitung.get(kunci(pml, sub)) ?? { total: 0, didataTim: 0, tdkTim: 0, didataSemua: 0, tdkSemua: 0 };

  // target & realisasi tiap (tim, Sub SLS): proporsi untuk Sub SLS bersama
  const hasilSub = new Map<string, { kk_total: number; target: number; realisasi: number; tdk: number; dibagi: number }>();
  for (const [sub, daftar] of pemegang) {
    const total = Math.max(...daftar.map((p) => ambil(p, sub).total));
    if (daftar.length === 1) {
      const h = ambil(daftar[0], sub);
      hasilSub.set(kunci(daftar[0], sub), { kk_total: total, target: total, realisasi: h.didataSemua, tdk: h.tdkSemua, dibagi: 1 });
      continue;
    }
    const jumlahDidata = daftar.reduce((a, p) => a + ambil(p, sub).didataTim, 0);
    const sisa = Math.max(0, total - jumlahDidata);
    const dasar = Math.floor(sisa / daftar.length);
    let lebih = sisa - dasar * daftar.length;
    const urut = [...daftar].sort((a, b) => ambil(b, sub).didataTim - ambil(a, sub).didataTim || a - b);
    for (const p of urut) {
      const h = ambil(p, sub);
      const tambah = dasar + (lebih > 0 ? 1 : 0);
      if (lebih > 0) lebih--;
      hasilSub.set(kunci(p, sub), { kk_total: total, target: h.didataTim + tambah, realisasi: h.didataTim, tdk: h.tdkTim, dibagi: daftar.length });
    }
  }

  // kemajuan per petugas: hanya baris tim sendiri (Sub SLS bersama muncul di dua tim -> jangan dihitung dua kali)
  const kemajuan = new Map<number, { didata: number; tdk: number }>(); // akun -> hitungan
  for (const b of baris) {
    if (b.ppl_akun_id === null || b.hasil === null) continue;
    if (!(subTim.get(b.pml_id)?.includes(b.idsubsls) ?? false)) continue;
    if (akunKeTim.get(b.ppl_akun_id) !== b.pml_id) continue;
    const x = kemajuan.get(b.ppl_akun_id) ?? { didata: 0, tdk: 0 };
    if (berhasil(b.hasil)) x.didata += b.jumlah;
    else if (b.hasil === "tidak_ditemukan") x.tdk += b.jumlah;
    kemajuan.set(b.ppl_akun_id, x);
  }
  const progres = (p: AnggotaKorwil, peran: "pml" | "ppl"): ProgresPetugas => {
    let didata = 0;
    let tdk = 0;
    for (const a of p.akun_ids) {
      const x = kemajuan.get(a);
      if (x) {
        didata += x.didata;
        tdk += x.tdk;
      }
    }
    return { petugas_id: p.petugas_id, nama: p.nama, peran, didata, tidak_ditemukan: tdk };
  };

  const hasil: TimProgres[] = [];
  const subUnik = new Set<string>();
  let jmlPpl = 0;
  for (const t of tim) {
    if (!t.tampil) continue;
    const pml = t.pml.petugas_id;
    const subs: SubKorwil[] = (subTim.get(pml) ?? []).map((id) => {
      const x = hasilSub.get(kunci(pml, id)) ?? { kk_total: 0, target: 0, realisasi: 0, tdk: 0, dibagi: 1 };
      const i = info.get(id);
      return {
        idsubsls: id,
        nagari: judulWilayah(i?.nagari ?? "-"),
        label: i ? labelSubKorwil(i.sls, i.sub_sls) : id,
        kk_total: x.kk_total,
        target: x.target,
        realisasi: x.realisasi,
        tidak_ditemukan: x.tdk,
        dibagi: x.dibagi,
      };
    });
    subs.sort((a, b) => a.nagari.localeCompare(b.nagari) || a.label.localeCompare(b.label, "id", { numeric: true }));
    const nagari = new Map<string, NagariKorwil>();
    for (const s of subs) {
      const n = nagari.get(s.nagari) ?? { nagari: s.nagari, sub: 0, target: 0, realisasi: 0 };
      n.sub++;
      n.target += s.target;
      n.realisasi += s.realisasi;
      nagari.set(s.nagari, n);
      subUnik.add(s.idsubsls);
    }
    const ppl = [...t.ppl].sort((a, b) => a.nama.localeCompare(b.nama)).map((p) => progres(p, "ppl"));
    jmlPpl += ppl.length;
    hasil.push({
      pml_id: pml,
      pml_nama: t.pml.nama,
      pml: progres(t.pml, "pml"),
      ppl,
      sub: subs,
      nagari: [...nagari.values()],
      target: subs.reduce((a, s) => a + s.target, 0),
      realisasi: subs.reduce((a, s) => a + s.realisasi, 0),
      tidak_ditemukan: subs.reduce((a, s) => a + s.tidak_ditemukan, 0),
      sub_dibagi: subs.filter((s) => s.dibagi > 1).length,
    });
  }
  hasil.sort((a, b) => a.pml_nama.localeCompare(b.pml_nama));
  return {
    tim: hasil,
    total: {
      target: hasil.reduce((a, t) => a + t.target, 0),
      realisasi: hasil.reduce((a, t) => a + t.realisasi, 0),
      tidak_ditemukan: hasil.reduce((a, t) => a + t.tidak_ditemukan, 0),
      sub: subUnik.size,
      tim: hasil.length,
      ppl: jmlPpl,
    },
  };
}

// ----------------------------------------------------------------------------------------------- keluaran Administrasi
/** Baris bencana_monitoring_lapangan yang sudah dinilai penilai kegiatan (lengkap = laporan + foto sesuai aturan; aktif = ada hasil lapangan). */
export type BarisHariKorwil = { akun_id: number; tanggal: string; hari_kerja: boolean; lengkap: boolean; ada_laporan: boolean; jumlah_foto: number; aktif: boolean };
export type SelAdm = KelasHari | "berjalan";
export type BarisAdm = { petugas_id: number; nama: string; peran: "pml" | "ppl"; sel: SelAdm[]; lengkap: number; wajib: number };
export type TimAdm = { pml_id: number; pml_nama: string; baris: BarisAdm[] };
export type PerhatianAdm = { tanggal: string; kosong: string[]; sebagian: string[] };
export type Administrasi = { tanggal: string[]; hari_ini: string; tim: TimAdm[]; perhatian: PerhatianAdm | null; ringkas: { lengkap: number; wajib: number } };

export function susunAdministrasi(m: { tim: TimKorwilMasuk[]; baris: BarisHariKorwil[]; mulai: string; hariIni: string }): Administrasi {
  const tanggal = m.mulai <= m.hariIni ? daftarTanggal(m.mulai, m.hariIni) : [];
  const perAkun = new Map<string, BarisHariKorwil>();
  for (const b of m.baris) {
    const k = `${b.akun_id}|${b.tanggal}`;
    const lama = perAkun.get(k);
    perAkun.set(
      k,
      lama
        ? {
            ...lama,
            hari_kerja: lama.hari_kerja || b.hari_kerja,
            lengkap: lama.lengkap || b.lengkap,
            ada_laporan: lama.ada_laporan || b.ada_laporan,
            jumlah_foto: Math.max(lama.jumlah_foto, b.jumlah_foto),
            aktif: lama.aktif || b.aktif,
          }
        : b,
    );
  }
  const sel = (akunIds: number[], tgl: string, peran: "pml" | "ppl"): SelAdm => {
    const b = akunIds.map((a) => perAkun.get(`${a}|${tgl}`)).find((x): x is BarisHariKorwil => !!x);
    if (!b) return "tidak_ada";
    // PML dinilai dari laporan + foto saja: sesudah Lembar Identifikasi selesai PML tidak lagi punya "hasil lapangan" harian, sehingga tanpa ini
    // semua hari PML akan tampil "sebagian" walau laporan dan fotonya lengkap. PPL tetap memakai aturan tab Monitoring (hasil + laporan + foto).
    const k = kelasHari({ tanggal: tgl, hari_kerja: b.hari_kerja, lengkap: b.lengkap, ada_laporan: b.ada_laporan, jumlah_foto: b.jumlah_foto, aktif: peran === "pml" ? true : b.aktif, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0, km: 0, metode: "tidak_ada" });
    return tgl === m.hariIni && (k === "kosong" || k === "sebagian") ? "berjalan" : k;
  };
  const baris = (p: AnggotaKorwil, peran: "pml" | "ppl"): BarisAdm => {
    const s = tanggal.map((t) => sel(p.akun_ids, t, peran));
    // (26 Okt 2026) hitungan hari kerja memakai fungsi bersama dengan Transport Lokal (lib/ringkasHariKerja): hanya hari yang SUDAH LEWAT; hari ini tidak dihitung
    const r = ringkasDariSel(tanggal, s, m.hariIni);
    return { petugas_id: p.petugas_id, nama: p.nama, peran, sel: s, lengkap: r.lengkap, wajib: r.sudahLewat };
  };
  const tim: TimAdm[] = m.tim
    .filter((t) => t.tampil)
    .map((t) => ({
      pml_id: t.pml.petugas_id,
      pml_nama: t.pml.nama,
      baris: [baris(t.pml, "pml"), ...[...t.ppl].sort((a, b) => a.nama.localeCompare(b.nama)).map((p) => baris(p, "ppl"))],
    }))
    .sort((a, b) => a.pml_nama.localeCompare(b.pml_nama));

  // perhatian: hari kerja terakhir SEBELUM hari ini yang dinilai untuk seseorang -> siapa yang kosong / sebagian
  let perhatian: PerhatianAdm | null = null;
  for (let i = tanggal.length - 1; i >= 0 && !perhatian; i--) {
    if (tanggal[i] >= m.hariIni) continue;
    const kosong: string[] = [];
    const sebagian: string[] = [];
    let dinilai = false;
    for (const t of tim)
      for (const b of t.baris) {
        const x = b.sel[i];
        if (x === "lengkap" || x === "sebagian" || x === "kosong") dinilai = true;
        if (x === "kosong") kosong.push(b.nama);
        else if (x === "sebagian") sebagian.push(b.nama);
      }
    if (dinilai) perhatian = { tanggal: tanggal[i], kosong, sebagian };
  }
  const semua = tim.flatMap((t) => t.baris);
  return { tanggal, hari_ini: m.hariIni, tim, perhatian, ringkas: { lengkap: semua.reduce((a, b) => a + b.lengkap, 0), wajib: semua.reduce((a, b) => a + b.wajib, 0) } };
}

// ----------------------------------------------------------------------------------------------- gabungan
export type PilihanKelompok = { kelompok: number; korwil: string[] };
export type DataKorwil = {
  sekarang: string;
  hari_ini: string;
  mulai: string;
  kelompok: number;
  korwil: string[];
  /** untuk akun dengan izin bencana.admin (semua kelompok) atau kortim yang memegang lebih dari satu kelompok (kelompok miliknya) */
  pilihan: PilihanKelompok[];
  lapangan: LapanganKorwil;
  administrasi: Administrasi;
};

/**
 * (27 Okt 2026) Kelompok yang ditampilkan di Monitoring Korwil.
 *  - saya  = kelompok tempat akun menjadi kortim, urut (urutan, kelompok): yang pertama = bawaan.
 *  - semua = semua kelompok yang ada (dipakai admin).
 *  - minta = ?kelompok= dari alamat. Admin boleh kelompok mana pun; kortim hanya kelompok miliknya, selain itu diabaikan.
 * null = tidak berhak (bukan kortim dan bukan admin).
 */
export function tentukanKelompok(p: { admin: boolean; saya: number[]; semua: number[]; minta: number | null }): number | null {
  const m = p.minta != null && Number.isInteger(p.minta) && p.minta > 0 ? p.minta : null;
  if (m != null && (p.admin || p.saya.includes(m))) return m;
  if (p.saya.length > 0) return p.saya[0];
  if (p.admin) return p.semua[0] ?? 1;
  return null;
}

/** Pilihan kelompok yang ditawarkan: admin = semua; kortim yang memegang lebih dari satu kelompok = kelompok miliknya; selain itu kosong. */
export function pilihanKelompokUntuk(p: { admin: boolean; saya: number[]; semua: PilihanKelompok[] }): PilihanKelompok[] {
  if (p.admin) return p.semua;
  if (p.saya.length > 1) return p.semua.filter((x) => p.saya.includes(x.kelompok));
  return [];
}

export const persenKorwil =(nilai: number, target: number): number => (target > 0 ? Math.min(100, Math.round((nilai / target) * 1000) / 10) : 0);

/** (26 Okt 2026, C2) id PML tim dengan capaian terendah; kosong bila hanya satu tim dinilai atau capaian semua tim sama. Tim tanpa target tidak dinilai. */
export function timCapaianTerendah(tim: ReadonlyArray<Pick<TimProgres, "pml_id" | "target" | "realisasi">>): number[] {
  const dinilai = tim.filter((t) => t.target > 0);
  if (dinilai.length < 2) return [];
  const nilai = dinilai.map((t) => ({ id: t.pml_id, p: persenKorwil(t.realisasi, t.target) }));
  const min = Math.min(...nilai.map((x) => x.p));
  if (nilai.every((x) => x.p === min)) return [];
  return nilai.filter((x) => x.p === min).map((x) => x.id);
}
