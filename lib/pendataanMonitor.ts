// lib/pendataanMonitor.ts
//
// (18 Okt 2026) Tab Monitoring di Kelola Pendataan (admin) -- Fase 1: variabel "Progres petugas" (rekap menurut PPL / PML / Tim).
// Fungsi MURNI (tanpa database) supaya mudah diuji; datanya disusun oleh lib/portal/pendataanMonitor.ts.
//
// Aturan (keputusan user 18 Okt 2026):
//  - Target tim = KK dari SEMUA Sub SLS plotting tim (bencana_alokasi_subsls, sudah memuat yang diajukan dari Kolam wilayah), TANPA Sub SLS non aktif (dibekukan).
//  - Target per PPL = target tim dibagi rata ke jumlah PPL tim.
//  - "Didata" per PPL = KK terdampak + tidak terdampak yang ditandai PPL itu; "tidak ditemukan" ditampilkan terpisah (tidak dihitung berhasil).
//  - KK yang ditandai PML / akun lain tidak dihitung pada PPL maupun Tim (hanya info), sama dengan Monitoring Lapangan (keputusan 11 Okt 2026).
//  - Satu Sub SLS bisa tercatat pada lebih dari satu PML (tim berbagi Sub SLS): tiap tim memuatnya pada targetnya, tetapi jumlah KESELURUHAN menghitungnya sekali.

export type HasilMon = "terdampak" | "tidak_terdampak" | "tidak_ditemukan";
export type Hitung3 = { terdampak: number; tidak_terdampak: number; tidak_ditemukan: number };

export type PetugasMon = { petugas_id: number; nama: string; peran: "pml" | "ppl"; atasan_id: number | null; akun_ids: number[] };
/** Baris fungsi database bencana_pendataan_ringkas(p_pml): hasil null = belum didata. `pml_id` = tim pemanggil. */
export type BarisKkMon = { pml_id: number; idsubsls: string; ppl_akun_id: number | null; hasil: HasilMon | null; jumlah: number };
export type SubMon = { idsubsls: string; pml_id: number };
export type IdfMon = { pml_id: number; ditugaskan: number; selesai: number };

export type TimMon = {
  pml_id: number;
  pml_nama: string;
  sub: number; // Sub SLS aktif milik tim
  sub_nonaktif: number; // Sub SLS dibekukan (tidak dihitung)
  kk_target: number; // seluruh KK aktif di Sub SLS aktif tim
  ppl: number;
  target_per_ppl: number;
  hasil: Hitung3; // hanya yang ditandai PPL
  oleh_lain: number; // KK berhasil yang ditandai PML/akun lain (info, tidak dihitung)
  idf_ditugaskan: number | null;
  idf_selesai: number | null;
};
export type PplMon = {
  petugas_id: number;
  akun_id: number | null;
  nama: string;
  pml_id: number | null;
  pml_nama: string | null;
  target: number; // target per PPL (target tim / jumlah PPL tim)
  hasil: Hitung3;
};
export type TotalMon = { sub: number; kk_target: number; ppl: number; pml: number; hasil: Hitung3 };
export type DataMonitoringPendataan = { sekarang: string; tim: TimMon[]; ppl: PplMon[]; total: TotalMon };

const nol = (): Hitung3 => ({ terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 });
/** KK berhasil = terdampak + tidak terdampak (tidak ditemukan tidak dihitung berhasil). */
export const berhasil = (h: Hitung3) => h.terdampak + h.tidak_terdampak;
/** Persen (0..n) dibulatkan; target 0 -> 0. */
export const persen = (nilai: number, target: number) => (target > 0 ? Math.round((nilai / target) * 100) : 0);

export function susunMonitoring(masuk: { petugas: PetugasMon[]; sub: SubMon[]; nonaktif: ReadonlySet<string>; baris: BarisKkMon[]; idf?: IdfMon[]; sekarang?: string }): DataMonitoringPendataan {
  const { petugas, sub, nonaktif, baris } = masuk;
  const pml = petugas.filter((p) => p.peran === "pml");
  const ppl = petugas.filter((p) => p.peran === "ppl");
  const akunKePetugas = new Map<number, PetugasMon>();
  for (const p of petugas) for (const a of p.akun_ids) if (!akunKePetugas.has(a)) akunKePetugas.set(a, p);
  const idf = new Map((masuk.idf ?? []).map((x) => [x.pml_id, x]));

  // Sub SLS per tim (tanpa kembar), dipisah aktif / non aktif
  const subAktif = new Map<number, Set<string>>();
  const subBeku = new Map<number, Set<string>>();
  for (const s of sub) {
    const tujuan = nonaktif.has(s.idsubsls) ? subBeku : subAktif;
    let set = tujuan.get(s.pml_id);
    if (!set) tujuan.set(s.pml_id, (set = new Set()));
    set.add(s.idsubsls);
  }

  // jumlah PPL per tim
  const jmlPpl = new Map<number, number>();
  for (const p of ppl) if (p.atasan_id != null) jmlPpl.set(p.atasan_id, (jmlPpl.get(p.atasan_id) ?? 0) + 1);

  // --- per tim
  const timMap = new Map<number, TimMon>();
  for (const m of pml) {
    const aktif = subAktif.get(m.petugas_id) ?? new Set<string>();
    const n = jmlPpl.get(m.petugas_id) ?? 0;
    timMap.set(m.petugas_id, {
      pml_id: m.petugas_id,
      pml_nama: m.nama,
      sub: aktif.size,
      sub_nonaktif: (subBeku.get(m.petugas_id) ?? new Set()).size,
      kk_target: 0,
      ppl: n,
      target_per_ppl: 0,
      hasil: nol(),
      oleh_lain: 0,
      idf_ditugaskan: idf.get(m.petugas_id)?.ditugaskan ?? null,
      idf_selesai: idf.get(m.petugas_id)?.selesai ?? null,
    });
  }
  for (const b of baris) {
    const t = timMap.get(b.pml_id);
    if (!t) continue;
    if (!(subAktif.get(b.pml_id)?.has(b.idsubsls) ?? false)) continue; // hanya Sub SLS aktif tim ini
    t.kk_target += b.jumlah;
    if (b.hasil === null || b.ppl_akun_id === null) continue;
    const penanda = akunKePetugas.get(b.ppl_akun_id);
    if (penanda?.peran === "ppl") t.hasil[b.hasil] += b.jumlah;
    else if (b.hasil !== "tidak_ditemukan") t.oleh_lain += b.jumlah;
  }
  for (const t of timMap.values()) t.target_per_ppl = t.ppl > 0 ? t.kk_target / t.ppl : 0;

  // --- per PPL: kelompok (Sub SLS, penanda, hasil) tanpa kembar lintas tim; Sub SLS non aktif tidak dihitung
  const kelompok = new Map<string, BarisKkMon>();
  for (const b of baris) {
    if (b.hasil === null || b.ppl_akun_id === null || nonaktif.has(b.idsubsls)) continue;
    const kunci = `${b.idsubsls}|${b.ppl_akun_id}|${b.hasil}`;
    if (!kelompok.has(kunci)) kelompok.set(kunci, b);
  }
  const hasilPpl = new Map<number, Hitung3>();
  for (const b of kelompok.values()) {
    const p = akunKePetugas.get(b.ppl_akun_id as number);
    if (!p || p.peran !== "ppl") continue;
    const h = hasilPpl.get(p.petugas_id) ?? nol();
    h[b.hasil as HasilMon] += b.jumlah;
    hasilPpl.set(p.petugas_id, h);
  }
  const daftarPpl: PplMon[] = ppl
    .map((p) => {
      const tim = p.atasan_id != null ? timMap.get(p.atasan_id) : undefined;
      return {
        petugas_id: p.petugas_id,
        akun_id: p.akun_ids[0] ?? null,
        nama: p.nama,
        pml_id: tim?.pml_id ?? null,
        pml_nama: tim?.pml_nama ?? null,
        target: tim ? tim.target_per_ppl : 0,
        hasil: hasilPpl.get(p.petugas_id) ?? nol(),
      };
    })
    .sort((a, b) => (a.pml_nama ?? "~").localeCompare(b.pml_nama ?? "~") || a.nama.localeCompare(b.nama));

  const daftarTim = [...timMap.values()].sort((a, b) => a.pml_nama.localeCompare(b.pml_nama));

  // --- jumlah keseluruhan: Sub SLS dan KK dihitung sekali walau dipakai dua tim
  const subUnik = new Set<string>();
  for (const set of subAktif.values()) for (const s of set) subUnik.add(s);
  const totalHasil = nol();
  for (const h of hasilPpl.values()) {
    totalHasil.terdampak += h.terdampak;
    totalHasil.tidak_terdampak += h.tidak_terdampak;
    totalHasil.tidak_ditemukan += h.tidak_ditemukan;
  }
  // tiap kelompok (Sub SLS, penanda, hasil) dihitung sekali walau muncul pada dua tim
  const kelompokKk = new Map<string, number>();
  for (const b of baris) {
    if (!subUnik.has(b.idsubsls)) continue;
    const kunci = `${b.idsubsls}|${b.ppl_akun_id ?? "-"}|${b.hasil ?? "-"}`;
    if (!kelompokKk.has(kunci)) kelompokKk.set(kunci, b.jumlah);
  }
  let kkTarget = 0;
  for (const j of kelompokKk.values()) kkTarget += j;

  return { sekarang: masuk.sekarang ?? new Date().toISOString(), tim: daftarTim, ppl: daftarPpl, total: { sub: subUnik.size, kk_target: kkTarget, ppl: ppl.length, pml: pml.length, hasil: totalHasil } };
}

/** Saring daftar PPL menurut tim (pml_id) dan kata kunci nama; null/"" = semua. */
export function saringPpl(daftar: PplMon[], pmlId: number | null, cari: string): PplMon[] {
  const q = cari.toLowerCase().replace(/\s+/g, " ").trim();
  return daftar.filter((p) => (pmlId == null || p.pml_id === pmlId) && (!q || p.nama.toLowerCase().includes(q) || (p.pml_nama ?? "").toLowerCase().includes(q)));
}
/** Saring daftar tim menurut pml_id dan kata kunci nama PML. */
export function saringTim(daftar: TimMon[], pmlId: number | null, cari: string): TimMon[] {
  const q = cari.toLowerCase().replace(/\s+/g, " ").trim();
  return daftar.filter((t) => (pmlId == null || t.pml_id === pmlId) && (!q || t.pml_nama.toLowerCase().includes(q)));
}
