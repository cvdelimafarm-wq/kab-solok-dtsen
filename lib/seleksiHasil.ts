// lib/seleksiHasil.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Hasil seleksi Mitra yang dibaca balik oleh modul Rekrutmen (halaman Kebutuhan identifikasi): per seleksi, berapa yang mendaftar, lulus, bersedia, menolak, dan sudah
// ditugaskan; dibandingkan dengan Mitra bersumber "seleksi" pada identifikasi lanjutan. Hanya MEMBACA: tidak menulis ke lanjutan (nama petugas diisi di sana oleh PJ).

export type PeranSeleksi = "ppl" | "pml";

export type BarisSeleksi = {
  id: number;
  nama: string;
  jalur: string;
  status: string;
  kebutuhan_ppl: number;
  kebutuhan_pml: number;
  sudah_ppl: number;
  sudah_pml: number;
};
export type BarisPeserta = { seleksi_id: number; peran: string; status: string; hasil: string | null; konfirmasi: string | null; ditugaskan_at: string | null };

export type HitungPeran = { kebutuhan: number; sisa: number; pendaftar: number; lulus: number; bersedia: number; menolak: number; ditugaskan: number };
export type RingkasSeleksi = { id: number; nama: string; jalur: string; status: string; ppl: HitungPeran; pml: HitungPeran };

const kosong = (kebutuhan: number, sudah: number): HitungPeran => ({ kebutuhan, sisa: Math.max(0, kebutuhan - sudah), pendaftar: 0, lulus: 0, bersedia: 0, menolak: 0, ditugaskan: 0 });

/** Satu ringkasan per seleksi (seleksi berstatus batal diabaikan oleh pemanggil). Peserta yang mundur tidak dihitung. */
export function ringkasSeleksi(seleksi: readonly BarisSeleksi[], peserta: readonly BarisPeserta[]): RingkasSeleksi[] {
  const peta = new Map<number, RingkasSeleksi>(
    seleksi.map((s) => [s.id, { id: s.id, nama: s.nama, jalur: s.jalur, status: s.status, ppl: kosong(s.kebutuhan_ppl, s.sudah_ppl), pml: kosong(s.kebutuhan_pml, s.sudah_pml) }]),
  );
  for (const p of peserta) {
    const r = peta.get(p.seleksi_id);
    if (!r || p.status !== "terdaftar") continue;
    const h = p.peran === "pml" ? r.pml : p.peran === "ppl" ? r.ppl : null;
    if (!h) continue;
    h.pendaftar++;
    if (p.hasil === "lulus") h.lulus++;
    if (p.konfirmasi === "bersedia") h.bersedia++;
    if (p.konfirmasi === "menolak") h.menolak++;
    if (p.ditugaskan_at) h.ditugaskan++;
  }
  return [...peta.values()].sort((a, b) => a.id - b.id);
}

export type PerbandinganPeran = {
  peran: PeranSeleksi;
  /** Mitra bersumber seleksi yang direncanakan pada identifikasi lanjutan (kebutuhan lewat seleksi). */
  direncanakan: number;
  /** Penugasan aktif bersumber seleksi pada kegiatan tertaut. */
  ditugaskan: number;
  /** direncanakan - ditugaskan bila positif. */
  kurang: number;
  /** ditugaskan - direncanakan bila positif (mis. rencana belum diperbarui). */
  lebih: number;
};

/** Rencana lewat seleksi (dari lanjutan) dibandingkan dengan penugasan bersumber seleksi. */
export function bandingkanSeleksi(direncanakan: Record<PeranSeleksi, number>, ditugaskan: Record<PeranSeleksi, number>): PerbandinganPeran[] {
  return (["ppl", "pml"] as const).map((peran) => {
    const d = Math.max(0, Math.floor(Number(direncanakan[peran]) || 0));
    const t = Math.max(0, Math.floor(Number(ditugaskan[peran]) || 0));
    return { peran, direncanakan: d, ditugaskan: t, kurang: Math.max(0, d - t), lebih: Math.max(0, t - d) };
  });
}

/** Jumlah penugasan aktif bersumber seleksi per peran (sumber berawalan "seleksi_"). */
export function hitungPenugasanSeleksi(baris: readonly { peran: string; sumber: string | null }[]): Record<PeranSeleksi, number> {
  const r: Record<PeranSeleksi, number> = { ppl: 0, pml: 0 };
  for (const b of baris) {
    if (typeof b.sumber !== "string" || !b.sumber.startsWith("seleksi_")) continue;
    if (b.peran === "ppl" || b.peran === "pml") r[b.peran]++;
  }
  return r;
}
