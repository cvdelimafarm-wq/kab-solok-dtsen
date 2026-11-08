// lib/sigapFotoHari.ts
//
// (9 Nov 2026) Foto pelaksanaan pelatihan: 4 foto PER HARI per KELAS. Panitia dan instruktur kelas memakai satu kumpulan yang sama
// (yang satu mengunggah, yang lain melihat kekurangannya). Fungsi MURNI (tanpa database); pemuat data ada di lib/sigapAdministrasi.ts.
// Skema: claude/rancangan-butir5-agenda-hari-h-9nov.md (butir 6a). Kolom `tanggal` di sigap_pelatihan_laporan_foto; foto lama (tanpa tanggal)
// dihitung sebagai hari pertama pelatihan.

export const FOTO_PER_HARI = 4;

export type Pengunggah = "panitia" | "instruktur" | "lain";

export type FotoHari = { tanggal: string | null; dibuat_oleh: string | null };

export type RingkasHari = {
  tanggal: string;
  jumlah: number;
  panitia: number;
  instruktur: number;
  lain: number;
  /** Kekurangan terhadap target 4 (0 bila sudah cukup/lebih). */
  kurang: number;
};

/** Ambil id akun dari label "Nama (#12)" yang disimpan di kolom dibuat_oleh. */
export function idDariLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /\(#(\d+)\)\s*$/.exec(label);
  return m ? Number(m[1]) : null;
}

/** Instruktur bila akunnya terdaftar instruktur kelas; "lain" bila label tidak bisa dibaca (data lama); selain itu panitia. */
export function jenisPengunggah(label: string | null | undefined, idInstruktur: ReadonlySet<number>): Pengunggah {
  const id = idDariLabel(label);
  if (id === null) return "lain";
  return idInstruktur.has(id) ? "instruktur" : "panitia";
}

/** Tanggal efektif sebuah foto: tanpa tanggal = hari pertama. */
export function tanggalEfektif(tanggal: string | null | undefined, hari: readonly string[]): string | null {
  if (tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return tanggal;
  return hari[0] ?? null;
}

/** Ringkasan per hari. Foto dengan tanggal di luar daftar hari tidak dihitung ke hari mana pun. */
export function ringkasPerHari(hari: readonly string[], foto: readonly FotoHari[], idInstruktur: ReadonlySet<number>, target = FOTO_PER_HARI): RingkasHari[] {
  const peta = new Map<string, RingkasHari>(hari.map((t) => [t, { tanggal: t, jumlah: 0, panitia: 0, instruktur: 0, lain: 0, kurang: target }]));
  for (const f of foto) {
    const t = tanggalEfektif(f.tanggal, hari);
    const r = t ? peta.get(t) : undefined;
    if (!r) continue;
    r.jumlah++;
    r[jenisPengunggah(f.dibuat_oleh, idInstruktur)]++;
    r.kurang = Math.max(0, target - r.jumlah);
  }
  return hari.map((t) => peta.get(t) as RingkasHari);
}

/** Total foto yang dihitung terhadap target (hanya yang jatuh di hari pelatihan). */
export const totalDihitung = (r: readonly RingkasHari[]) => r.reduce((n, x) => n + Math.min(x.jumlah, FOTO_PER_HARI), 0);

/** Batas unggah per kelas: 4 x jumlah hari (longgar: sebaran antarhari tidak dipaksa, hanya kekurangan yang ditandai). */
export const batasFotoKelas = (jumlahHari: number) => FOTO_PER_HARI * Math.max(1, jumlahHari);

/** Hari yang masih kurang, dari yang paling awal. */
export const hariKurang = (r: readonly RingkasHari[]) => r.filter((x) => x.kurang > 0);

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tglSingkat(t: string): string {
  const [, m, d] = t.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1] ?? m}`;
}

/** "Hari 1 (9 Nov): 3/4 — 2 panitia, 1 instruktur" */
export function teksHari(r: RingkasHari, nomor: number, target = FOTO_PER_HARI): string {
  const rincian: string[] = [];
  if (r.panitia) rincian.push(`${r.panitia} panitia`);
  if (r.instruktur) rincian.push(`${r.instruktur} instruktur`);
  if (r.lain) rincian.push(`${r.lain} lain`);
  return `Hari ${nomor} (${tglSingkat(r.tanggal)}): ${r.jumlah}/${target}${rincian.length ? ` — ${rincian.join(", ")}` : ""}`;
}

/** Catatan di halaman lampiran PDF bila belum lengkap; null bila lengkap. Laporan tetap boleh dicetak. */
export function catatanLampiran(r: readonly RingkasHari[]): string | null {
  const k = hariKurang(r);
  if (k.length === 0) return null;
  return `Foto pelaksanaan belum lengkap (target ${FOTO_PER_HARI} foto per hari): ${k.map((x) => `${tglSingkat(x.tanggal)} kurang ${x.kurang}`).join("; ")}.`;
}

/** Tanggal yang dipilih sah bila ada di daftar hari; selain itu hari pertama (atau hari ini bila hari ini termasuk). */
export function pilihTanggalBawaan(hari: readonly string[], hariIni: string): string | null {
  if (hari.length === 0) return null;
  return hari.includes(hariIni) ? hariIni : hari[0];
}
