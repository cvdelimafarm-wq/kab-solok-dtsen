// lib/korwilHasilQc.ts  (murni, tanpa database)
//
// (27 Okt 2026) Lembar Supervisi > Hasil QC Pemahaman. Menyusun jawaban QC Pemahaman petugas (tabel sigap_qc_percobaan) satu kelompok menjadi:
//  * daftar per TIM (satu tim = satu PML dan PPL-nya): skor tiap petugas + soal yang dijawab salah beserta siapa yang salah dan apa yang dipilih;
//  * MATRIKS: baris = soal, kolom = petugas (PML & PPL), sel = benar / salah / belum.
// Saringan: tim, petugas, tanggal. Satu petugas boleh mencoba berkali-kali dalam sehari; yang dihitung SATU percobaan per hari:
//  "pertama" (bawaan, sama dengan rekap PML: yang diukur pemahaman awal) atau "terakhir".
// Dipakai /api/portal/qc/hasil (lib/portal/qcHasilKorwil.ts) dan app/sigap/korwil/KorwilHasilQc.tsx.

export type AnggotaHasil = { akun_id: number; nama: string; peran: "pml" | "ppl"; pml_nama: string | null };
export type PercobaanMentah = { akun_id: number; tanggal: string; ke: number; jawaban: Record<string, string> | null; salah: string[] | null };
export type SoalMentah = { id: string; pertanyaan: string; opsi: Record<string, string>; kunci: string; penjelasan: string };

export type ModePercobaan = "pertama" | "terakhir";
export type Saringan = { mode: ModePercobaan; tim: string | null; petugas: number | null; tanggal: string | null };
export const SARINGAN_AWAL: Saringan = { mode: "pertama", tim: null, petugas: null, tanggal: null };

export type Sel = { status: "benar" | "salah"; pilih: string | null; tanggal: string; kali: number; salahKali: number };
export type PetugasHasil = {
  akun_id: number;
  nama: string;
  peran: "pml" | "ppl";
  tim: string;
  hari: number; // jumlah hari yang diikuti
  terjawab: number;
  benar: number;
  salah: number;
  persen: number | null; // % benar; null bila belum menjawab
};
export type Penjawab = { akun_id: number; nama: string; peran: "pml" | "ppl"; pilih: string | null; tanggal: string };
export type SoalSalah = { soal: SoalMentah; jumlahSalah: number; jumlahJawab: number; penjawab: Penjawab[] };
export type TimHasil = { nama: string; petugas: PetugasHasil[]; terjawab: number; salah: number; persen: number | null; soalSalah: SoalSalah[] };
export type BarisMatriks = { soal: SoalMentah; jumlahSalah: number; jumlahJawab: number; sel: Record<number, Sel | undefined> };
export type HasilQc = {
  tim: TimHasil[];
  matriks: { kolom: PetugasHasil[]; baris: BarisMatriks[] };
  ringkas: { petugas: number; sudahMengisi: number; belumMengisi: number; terjawab: number; salah: number; persen: number | null };
};
export type OpsiSaringan = { tim: string[]; petugas: { akun_id: number; nama: string; tim: string }[]; tanggal: string[] };

const persen = (benar: number, total: number): number | null => (total > 0 ? Math.round((benar / total) * 100) : null);

/** Urutan alami id soal: "LAT-9" sebelum "LAT-16". */
export function bandingId(a: string, b: string): number {
  const pa = /^(.*?)(\d+)$/.exec(a);
  const pb = /^(.*?)(\d+)$/.exec(b);
  if (pa && pb && pa[1] === pb[1]) return Number(pa[2]) - Number(pb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Nama tim = nama PML (PML sendiri masuk timnya sendiri). */
export const namaTim = (a: Pick<AnggotaHasil, "nama" | "peran" | "pml_nama">): string => (a.peran === "pml" ? a.nama : (a.pml_nama ?? "Tanpa PML"));

/** Satu percobaan per (petugas, hari): yang pertama atau yang terakhir. */
export function pilihPercobaan(daftar: readonly PercobaanMentah[], mode: ModePercobaan): PercobaanMentah[] {
  const per = new Map<string, PercobaanMentah>();
  for (const p of daftar) {
    const k = `${p.akun_id}|${p.tanggal}`;
    const lama = per.get(k);
    if (!lama || (mode === "pertama" ? p.ke < lama.ke : p.ke > lama.ke)) per.set(k, p);
  }
  return Array.from(per.values());
}

/** Pilihan untuk kotak saringan: dihitung dari data tanpa saringan. */
export function opsiSaringan(anggota: readonly AnggotaHasil[], percobaan: readonly PercobaanMentah[]): OpsiSaringan {
  const tim = Array.from(new Set(anggota.map(namaTim))).sort((a, b) => a.localeCompare(b, "id"));
  const petugas = anggota
    .map((a) => ({ akun_id: a.akun_id, nama: a.nama, tim: namaTim(a) }))
    .sort((a, b) => a.tim.localeCompare(b.tim, "id") || (a.nama === a.tim ? -1 : b.nama === b.tim ? 1 : a.nama.localeCompare(b.nama, "id")));
  const tanggal = Array.from(new Set(percobaan.map((p) => p.tanggal))).sort().reverse();
  return { tim, petugas, tanggal };
}

function soalAda(peta: Map<string, SoalMentah>, id: string): SoalMentah {
  return peta.get(id) ?? { id, pertanyaan: `Soal ${id} (sudah tidak ada di bank soal)`, opsi: {}, kunci: "", penjelasan: "" };
}

/** "B. teks pilihan" bila teksnya ada, selain itu hanya kodenya. */
export function teksJawaban(soal: Pick<SoalMentah, "opsi">, kode: string | null): string {
  if (!kode) return "—";
  const t = soal.opsi?.[kode];
  return t ? `${kode}. ${t}` : kode;
}

export function susunHasil(anggotaSemua: readonly AnggotaHasil[], percobaanSemua: readonly PercobaanMentah[], soalDaftar: readonly SoalMentah[], saringan: Saringan = SARINGAN_AWAL): HasilQc {
  const peta = new Map(soalDaftar.map((s) => [s.id, s]));
  const anggota = anggotaSemua.filter((a) => (saringan.tim == null || namaTim(a) === saringan.tim) && (saringan.petugas == null || a.akun_id === saringan.petugas));
  const ada = new Set(anggota.map((a) => a.akun_id));
  const percobaan = pilihPercobaan(
    percobaanSemua.filter((p) => ada.has(p.akun_id) && (saringan.tanggal == null || p.tanggal === saringan.tanggal)),
    saringan.mode,
  ).sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0)); // urut tanggal naik: "pilih" yang tersimpan = hari terakhir

  const sel = new Map<string, Sel>(); // `${soal}|${akun}`
  const hari = new Map<number, Set<string>>();
  for (const p of percobaan) {
    const salahSet = new Set(p.salah ?? []);
    const jaw = p.jawaban ?? {};
    const ids = new Set<string>([...Object.keys(jaw), ...salahSet]);
    if (!hari.has(p.akun_id)) hari.set(p.akun_id, new Set());
    hari.get(p.akun_id)!.add(p.tanggal);
    for (const id of ids) {
      const k = `${id}|${p.akun_id}`;
      const salah = salahSet.has(id);
      const pilih = jaw[id] ?? null;
      const lama = sel.get(k);
      if (!lama) sel.set(k, { status: salah ? "salah" : "benar", pilih, tanggal: p.tanggal, kali: 1, salahKali: salah ? 1 : 0 });
      else {
        lama.kali += 1;
        if (salah) {
          lama.salahKali += 1;
          lama.status = "salah";
          lama.pilih = pilih;
          lama.tanggal = p.tanggal;
        } else if (lama.salahKali === 0) {
          lama.pilih = pilih;
          lama.tanggal = p.tanggal;
        }
      }
    }
  }

  // petugas
  const petugas: PetugasHasil[] = anggota.map((a) => {
    let terjawab = 0;
    let salah = 0;
    for (const [k, s] of sel) {
      if (!k.endsWith(`|${a.akun_id}`)) continue;
      terjawab += s.kali;
      salah += s.salahKali;
    }
    return { akun_id: a.akun_id, nama: a.nama, peran: a.peran, tim: namaTim(a), hari: hari.get(a.akun_id)?.size ?? 0, terjawab, benar: terjawab - salah, salah, persen: persen(terjawab - salah, terjawab) };
  });
  const urutPetugas = (a: PetugasHasil, b: PetugasHasil) => a.tim.localeCompare(b.tim, "id") || (a.peran !== b.peran ? (a.peran === "pml" ? -1 : 1) : a.nama.localeCompare(b.nama, "id"));
  petugas.sort(urutPetugas);

  // soal -> penjawab
  const idSoal = Array.from(new Set(Array.from(sel.keys()).map((k) => k.slice(0, k.lastIndexOf("|"))))).sort(bandingId);
  const baris: BarisMatriks[] = idSoal.map((id) => {
    const s: Record<number, Sel | undefined> = {};
    let jumlahSalah = 0;
    let jumlahJawab = 0;
    for (const p of petugas) {
      const c = sel.get(`${id}|${p.akun_id}`);
      if (!c) continue;
      s[p.akun_id] = c;
      jumlahJawab += c.kali;
      jumlahSalah += c.salahKali;
    }
    return { soal: soalAda(peta, id), jumlahSalah, jumlahJawab, sel: s };
  });
  baris.sort((a, b) => b.jumlahSalah - a.jumlahSalah || bandingId(a.soal.id, b.soal.id));

  // tim
  const namaTimUrut = Array.from(new Set(petugas.map((p) => p.tim))).sort((a, b) => a.localeCompare(b, "id"));
  const tim: TimHasil[] = namaTimUrut.map((nm) => {
    const anggotaTim = petugas.filter((p) => p.tim === nm);
    const terjawab = anggotaTim.reduce((x, p) => x + p.terjawab, 0);
    const salah = anggotaTim.reduce((x, p) => x + p.salah, 0);
    const soalSalah: SoalSalah[] = [];
    for (const b of baris) {
      const penjawab: Penjawab[] = [];
      let jumlahJawab = 0;
      let jumlahSalah = 0;
      for (const p of anggotaTim) {
        const c = b.sel[p.akun_id];
        if (!c) continue;
        jumlahJawab += c.kali;
        jumlahSalah += c.salahKali;
        if (c.salahKali > 0) penjawab.push({ akun_id: p.akun_id, nama: p.nama, peran: p.peran, pilih: c.pilih, tanggal: c.tanggal });
      }
      if (jumlahSalah > 0) soalSalah.push({ soal: b.soal, jumlahSalah, jumlahJawab, penjawab });
    }
    soalSalah.sort((a, b) => b.jumlahSalah - a.jumlahSalah || bandingId(a.soal.id, b.soal.id));
    return { nama: nm, petugas: anggotaTim, terjawab, salah, persen: persen(terjawab - salah, terjawab), soalSalah };
  });

  const terjawab = petugas.reduce((x, p) => x + p.terjawab, 0);
  const salah = petugas.reduce((x, p) => x + p.salah, 0);
  const sudah = petugas.filter((p) => p.terjawab > 0).length;
  return {
    tim,
    matriks: { kolom: petugas, baris },
    ringkas: { petugas: petugas.length, sudahMengisi: sudah, belumMengisi: petugas.length - sudah, terjawab, salah, persen: persen(terjawab - salah, terjawab) },
  };
}
