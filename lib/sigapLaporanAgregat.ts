// lib/sigapLaporanAgregat.ts  (murni)
//
// (28 Okt 2026) Mengubah catatan lapangan mentah (baris fungsi SQL sigap_isi_harian, isian identifikasi PML, lembar QC) menjadi DataIsiHarian per tanggal
// untuk lampiran Laporan SPJ (lib/sigapLaporanIsi.ts). Pembacaan basis data ada di lib/sigapLaporanData.ts; di sini hanya hitungan.

import { HASIL_KK } from "./pendataan";
import { KOLOM_IDENTIFIKASI, hasilKosong, type DataIsiHarian, type PeranLaporan } from "./sigapLaporanIsi";

/** Satu baris keluaran sigap_isi_harian: t tanggal WIB, a akun, h hasil, al alasan, s Sub SLS, j jarak km (alokasi), js status jarak, n jumlah KK. */
export type BarisHarian = { t: string; a: number; h: string; al: string | null; s: string | null; j: number | null; js: string | null; n: number };
export type AnggotaIsi = { akun_id: number; nama: string; peran: "pml" | "ppl"; tim: string | null };

const hariWib = (iso: string): string => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
const angka = (x: unknown): number => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
};

type Kumpul = NonNullable<Pick<DataIsiHarian, "pendataan" | "jarak">>;

/** Hasil pendataan, alasan, rincian per petugas/tim, dan jarak -- per tanggal. `anggota` memberi nama (PPL dalam lingkup laporan ini). */
export function agregatPendataan(peran: PeranLaporan, baris: readonly BarisHarian[], anggota: readonly AnggotaIsi[]): Map<string, Pick<DataIsiHarian, "pendataan" | "jarak">> {
  const nama = new Map(anggota.map((x) => [x.akun_id, x]));
  const hari = new Map<string, { hasil: ReturnType<typeof hasilKosong>; alasan: Map<string, number>; petugas: Map<string, ReturnType<typeof hasilKosong>>; pasangan: Map<string, number | null>; status: Map<string, string | null> }>();
  for (const b of baris) {
    if (!(HASIL_KK as readonly string[]).includes(b.h)) continue;
    const h = b.h as (typeof HASIL_KK)[number];
    let d = hari.get(b.t);
    if (!d) hari.set(b.t, (d = { hasil: hasilKosong(), alasan: new Map(), petugas: new Map(), pasangan: new Map(), status: new Map() }));
    const n = angka(b.n);
    d.hasil[h] += n;
    if (h === "tidak_ditemukan") {
      const al = (b.al ?? "").trim() || "Tanpa alasan";
      d.alasan.set(al, (d.alasan.get(al) ?? 0) + n);
    }
    if (peran !== "ppl") {
      const a = nama.get(b.a);
      const kunci = peran === "pml" ? (a?.nama ?? `Akun ${b.a}`) : (a?.tim ?? "Tanpa PML");
      const p = d.petugas.get(kunci) ?? hasilKosong();
      p[h] += n;
      d.petugas.set(kunci, p);
    }
    if (b.s) {
      const k = `${b.a}|${b.s}`;
      const ada = d.pasangan.get(k);
      if (ada == null) {
        d.pasangan.set(k, b.j == null ? null : angka(b.j));
        d.status.set(k, b.js);
      }
    }
  }
  const hasil = new Map<string, Pick<DataIsiHarian, "pendataan" | "jarak">>();
  for (const [t, d] of hari) {
    const jarakAda = Array.from(d.pasangan.entries()).filter(([, j]) => j != null) as [string, number][];
    const tanpa = d.pasangan.size - jarakAda.length;
    const km = jarakAda.map(([, j]) => j);
    const k: Kumpul = {
      pendataan: {
        hasil: d.hasil,
        alasan: Array.from(d.alasan, ([alasan, n]) => ({ alasan, n })),
        petugas: Array.from(d.petugas, ([nm, h]) => ({ nama: nm, hasil: h })).sort((a, b) => a.nama.localeCompare(b.nama, "id", { sensitivity: "base" })),
      },
      jarak:
        km.length || tanpa
          ? { pasangan: km.length, rataKm: km.length ? km.reduce((s, x) => s + x, 0) / km.length : 0, maksKm: km.length ? Math.max(...km) : 0, perkiraan: jarakAda.filter(([key]) => (d.status.get(key) ?? "riil") !== "riil").length, tanpa }
          : null,
    };
    hasil.set(t, k);
  }
  return hasil;
}

/** Isian identifikasi PML (satu baris per Sub SLS) per tanggal WIB isian: jumlah Sub SLS berbeda dan jumlah tiap variabel. */
export function agregatIdentifikasi(baris: readonly ({ idsubsls: string; diisi_at: string | null } & Record<string, unknown>)[]): Map<string, NonNullable<DataIsiHarian["identifikasi"]>> {
  const per = new Map<string, { sub: Set<string>; nilai: Record<string, number> }>();
  for (const b of baris) {
    if (!b.diisi_at) continue;
    const t = hariWib(b.diisi_at);
    const d = per.get(t) ?? { sub: new Set<string>(), nilai: {} };
    d.sub.add(b.idsubsls);
    for (const k of KOLOM_IDENTIFIKASI) d.nilai[k] = (d.nilai[k] ?? 0) + angka(b[k]);
    per.set(t, d);
  }
  return new Map(Array.from(per, ([t, d]) => [t, { subsls: d.sub.size, nilai: d.nilai }]));
}

/** Lembar QC yang disimpan pemeriksa (sigap_qc_lembar.ringkas) per tanggal lembar. */
export function agregatQc(baris: readonly { tanggal: string; ringkas: unknown }[]): Map<string, NonNullable<DataIsiHarian["qc"]>> {
  const per = new Map<string, NonNullable<DataIsiHarian["qc"]>>();
  for (const b of baris) {
    const r = b.ringkas && typeof b.ringkas === "object" && !Array.isArray(b.ringkas) ? (b.ringkas as Record<string, unknown>) : {};
    const d = per.get(b.tanggal) ?? { lembar: 0, kategori: {}, sesuai: 0, perluPerbaikan: 0, tidakSesuai: 0 };
    d.lembar += 1;
    const kat = typeof r.kategori === "string" && r.kategori.trim() ? r.kategori.trim() : "Belum dinilai";
    d.kategori[kat] = (d.kategori[kat] ?? 0) + 1;
    d.sesuai += angka(r.sesuai);
    d.perluPerbaikan += angka(r.perlu_perbaikan);
    d.tidakSesuai += angka(r.tidak_sesuai);
    per.set(b.tanggal, d);
  }
  return per;
}

/** Gabungkan hasil agregat per tanggal menjadi satu peta DataIsiHarian. */
export function gabungHarian(bagian: {
  pendataan?: Map<string, Pick<DataIsiHarian, "pendataan" | "jarak">> | null;
  identifikasi?: Map<string, NonNullable<DataIsiHarian["identifikasi"]>> | null;
  qc?: Map<string, NonNullable<DataIsiHarian["qc"]>> | null;
}): Map<string, DataIsiHarian> {
  const hasil = new Map<string, DataIsiHarian>();
  const ambil = (t: string) => hasil.get(t) ?? (hasil.set(t, {}), hasil.get(t)!);
  for (const [t, v] of bagian.pendataan ?? []) Object.assign(ambil(t), v);
  for (const [t, v] of bagian.identifikasi ?? []) ambil(t).identifikasi = v;
  for (const [t, v] of bagian.qc ?? []) ambil(t).qc = v;
  return hasil;
}
