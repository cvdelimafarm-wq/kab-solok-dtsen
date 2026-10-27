// lib/portal/qcHasilKorwil.ts  (hanya server)
//
// (27 Okt 2026) Lembar Supervisi > Hasil QC Pemahaman. HANYA-BACA. Mengambil anggota kelompok (PML & PPL), semua percobaan QC Pemahaman mereka
// (tabel sigap_qc_percobaan) dan soal yang muncul di sana (sigap_qc_soal). Penyusunan per tim / matriks dikerjakan di layar oleh lib/korwilHasilQc.ts.

import type { Db } from "@/lib/sigap";
import { KEGIATAN_QC } from "@/lib/portal/qc";
import { anggotaKelompok } from "@/lib/portal/korwilMonitor";
import type { AnggotaHasil, PercobaanMentah, SoalMentah } from "@/lib/korwilHasilQc";

export type DataHasilQc = { kelompok: number; sekarang: string; anggota: AnggotaHasil[]; percobaan: PercobaanMentah[]; soal: SoalMentah[] };

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const teksMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
  return out;
};

/** null = kelompok tidak ada. */
export async function dataHasilQc(db: Db, kelompok: number): Promise<DataHasilQc | null> {
  const anggota = await anggotaKelompok(db, kelompok);
  if (!anggota) return null;
  const ids = anggota.map((a) => a.akun_id);

  const percobaan: PercobaanMentah[] = [];
  for (let dari = 0; dari < 20_000 && ids.length > 0; dari += 1000) {
    const { data, error } = await db
      .from("sigap_qc_percobaan")
      .select("akun_id, tanggal, ke, jawaban, salah")
      .eq("kegiatan_id", KEGIATAN_QC)
      .in("akun_id", ids)
      .order("tanggal")
      .order("akun_id")
      .order("ke")
      .range(dari, dari + 999);
    if (error) throw new Error(`Gagal membaca percobaan QC: ${error.message}`);
    const b = (data ?? []) as { akun_id: number; tanggal: string; ke: number; jawaban: unknown; salah: unknown }[];
    for (const r of b) percobaan.push({ akun_id: n(r.akun_id), tanggal: String(r.tanggal), ke: n(r.ke), jawaban: teksMap(r.jawaban), salah: Array.isArray(r.salah) ? r.salah.map(String) : [] });
    if (b.length < 1000) break;
  }

  const idSoal = Array.from(new Set(percobaan.flatMap((p) => [...Object.keys(p.jawaban ?? {}), ...(p.salah ?? [])])));
  const soal: SoalMentah[] = [];
  for (let i = 0; i < idSoal.length; i += 200) {
    const { data, error } = await db.from("sigap_qc_soal").select("id, pertanyaan, opsi, kunci, penjelasan").in("id", idSoal.slice(i, i + 200));
    if (error) throw new Error(`Gagal membaca soal QC: ${error.message}`);
    for (const r of (data ?? []) as { id: string; pertanyaan: string; opsi: unknown; kunci: string; penjelasan: string }[]) {
      soal.push({ id: String(r.id), pertanyaan: String(r.pertanyaan ?? ""), opsi: teksMap(r.opsi), kunci: String(r.kunci ?? ""), penjelasan: String(r.penjelasan ?? "") });
    }
  }
  return { kelompok, sekarang: new Date().toISOString(), anggota, percobaan, soal };
}
