// lib/sigapQcImpor.ts
//
// (29 Okt 2026) Impor bank soal QC Pemahaman dari Excel -- logika MURNI (tanpa xlsx, tanpa React). Layar membaca berkas dengan pustaka xlsx
// (sheet_to_json) lalu memanggil `petaSoalDariBaris`; hasilnya dikirim ke /api/portal/qc/admin {aksi:"impor"}. Pemeriksaan akhir tetap di server
// (validasiSoal + database), jadi fungsi ini hanya memberi tahu baris mana yang salah SEBELUM dikirim.
//
// Format kolom (judul kolom tidak membedakan huruf besar/kecil, spasi/tanda baca diabaikan, beberapa nama lain diterima):
//   Kode (boleh kosong: dibuat otomatis) · Paket · Judul Paket · Nomor · Pertanyaan · A · B · C · D · Kunci (A/B/C/D) · Pembahasan · Kata Kunci (dipisah ; atau | atau baris baru)
// (29 Okt 2026) SOAL BENAR/SALAH: kosongkan C dan D. Pilihan A dan B juga boleh dikosongkan bila Kunci diisi "Benar" atau "Salah" (otomatis A=Benar, B=Salah).
// Kolom A/B/C/D pada berkas hanya wajib ADA; isinya wajib untuk A dan B (kecuali kunci Benar/Salah) sedangkan C dan D harus berpasangan.

import { OPSI_BENAR_SALAH, validasiSoal, type SoalMasuk } from "@/lib/sigapQc";

export const KOLOM_TEMPLAT = ["Kode", "Paket", "Judul Paket", "Nomor", "Pertanyaan", "A", "B", "C", "D", "Kunci", "Pembahasan", "Kata Kunci"] as const;

type Medan = "id" | "paket" | "judul_paket" | "nomor" | "pertanyaan" | "A" | "B" | "C" | "D" | "kunci" | "penjelasan" | "kata_kunci";

const ALIAS: Record<Medan, string[]> = {
  id: ["kode", "kodesoal", "id", "idsoal"],
  paket: ["paket", "nomorpaket", "nopaket"],
  judul_paket: ["judulpaket", "namapaket", "topik"],
  nomor: ["nomor", "no", "nomorurut", "urut", "nomorsoal"],
  pertanyaan: ["pertanyaan", "soal", "butirsoal", "teksoal"],
  A: ["a", "pilihana", "opsia", "jawabana"],
  B: ["b", "pilihanb", "opsib", "jawabanb"],
  C: ["c", "pilihanc", "opsic", "jawabanc"],
  D: ["d", "pilihand", "opsid", "jawaband"],
  kunci: ["kunci", "kuncijawaban", "jawabanbenar", "jawaban"],
  penjelasan: ["pembahasan", "penjelasan", "alasan"],
  kata_kunci: ["katakunci", "kata", "sorotan", "katasorot"],
};
const WAJIB: Medan[] = ["pertanyaan", "A", "B", "kunci"]; // C dan D opsional (soal Benar/Salah)
const LABEL: Record<Medan, string> = { id: "Kode", paket: "Paket", judul_paket: "Judul Paket", nomor: "Nomor", pertanyaan: "Pertanyaan", A: "A", B: "B", C: "C", D: "D", kunci: "Kunci", penjelasan: "Pembahasan", kata_kunci: "Kata Kunci" };

const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").trim());

export type GalatBaris = { baris: number; pesan: string };
export type HasilPeta = { soal: SoalMasuk[]; galat: GalatBaris[]; dilewati: number };

/** Mencocokkan judul kolom berkas dengan kolom baku. Mengembalikan peta medan -> judul asli di berkas. */
export function petaKolom(judul: readonly string[]): Partial<Record<Medan, string>> {
  const hasil: Partial<Record<Medan, string>> = {};
  for (const j of judul) {
    const r = rapat(String(j ?? ""));
    if (!r) continue;
    for (const m of Object.keys(ALIAS) as Medan[]) {
      if (!hasil[m] && ALIAS[m].includes(r)) {
        hasil[m] = String(j);
        break;
      }
    }
  }
  return hasil;
}

/** "a; b | c" atau baris baru -> ["a","b","c"] */
export function pecahKataKunci(s: string): string[] {
  return Array.from(new Set(s.split(/[;|\n]+/).map((x) => x.trim()).filter(Boolean)));
}

/**
 * Baris hasil sheet_to_json (objek berkunci judul kolom) -> daftar soal siap kirim. Baris yang seluruh selnya kosong dilewati.
 * Nomor baris pada galat = nomor baris di Excel (judul kolom = baris 1).
 */
export function petaSoalDariBaris(baris: readonly Record<string, unknown>[], opsi: { kegiatanId: number }): HasilPeta {
  const galat: GalatBaris[] = [];
  const soal: SoalMasuk[] = [];
  if (baris.length === 0) return { soal, galat: [{ baris: 0, pesan: "Berkas tidak berisi baris soal." }], dilewati: 0 };
  const kolom = petaKolom(Object.keys(baris[0]));
  const hilang = WAJIB.filter((m) => !kolom[m]);
  if (hilang.length > 0) return { soal, galat: [{ baris: 1, pesan: `Kolom tidak ditemukan: ${hilang.map((m) => LABEL[m]).join(", ")}. Unduh templat untuk melihat format.` }], dilewati: 0 };

  const ambil = (b: Record<string, unknown>, m: Medan) => (kolom[m] ? teks(b[kolom[m] as string]) : "");
  const dipakai = new Set<string>();
  const nomorPerPaket = new Map<number, number>();
  let dilewati = 0;
  baris.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) {
      dilewati++;
      return;
    }
    const paketTeks = ambil(b, "paket");
    const paket = paketTeks === "" ? 1 : Number(paketTeks);
    let nomor = ambil(b, "nomor") === "" ? NaN : Number(ambil(b, "nomor"));
    if (!Number.isInteger(nomor)) {
      nomor = (nomorPerPaket.get(paket) ?? 0) + 1;
    }
    nomorPerPaket.set(paket, Math.max(nomorPerPaket.get(paket) ?? 0, nomor));
    let id = ambil(b, "id");
    if (!id) id = `K${opsi.kegiatanId}-P${Number.isInteger(paket) ? String(paket).padStart(2, "0") : "XX"}-${String(nomor).padStart(2, "0")}`;
    const kunciTeks = ambil(b, "kunci").toUpperCase();
    let kunci = /^[A-D]/.test(kunciTeks) ? kunciTeks[0] : kunciTeks;
    let pilihan = { A: ambil(b, "A"), B: ambil(b, "B"), C: ambil(b, "C"), D: ambil(b, "D") };
    // Benar/Salah: kunci berupa kata; pilihan A/B bawaan "Benar"/"Salah" bila dikosongkan, dan kunci dipetakan ke huruf pilihan yang bertuliskan itu
    if (kunciTeks === "BENAR" || kunciTeks === "SALAH") {
      if (!pilihan.A && !pilihan.B && !pilihan.C && !pilihan.D) pilihan = { ...pilihan, ...OPSI_BENAR_SALAH };
      const huruf = (["A", "B", "C", "D"] as const).find((k) => pilihan[k].trim().toUpperCase() === kunciTeks);
      if (huruf) kunci = huruf;
    }
    const v = validasiSoal({
      id,
      paket,
      judul_paket: ambil(b, "judul_paket") || undefined,
      nomor,
      pertanyaan: ambil(b, "pertanyaan"),
      opsi: pilihan,
      kunci,
      penjelasan: ambil(b, "penjelasan"),
      kata_kunci: pecahKataKunci(ambil(b, "kata_kunci")),
    });
    if (!v.ok) {
      galat.push({ baris: no, pesan: v.galat.join("; ") });
      return;
    }
    if (dipakai.has(v.data.id)) {
      galat.push({ baris: no, pesan: `Kode ${v.data.id} sudah dipakai baris lain dalam berkas.` });
      return;
    }
    dipakai.add(v.data.id);
    soal.push(v.data);
  });
  return { soal, galat, dilewati };
}

/** Isi templat Excel (baris judul + dua contoh) untuk `aoa_to_sheet`. */
export function templatSoal(): string[][] {
  return [
    [...KOLOM_TEMPLAT],
    ["", "1", "Dasar Pendataan", "1", "Contoh pertanyaan: siapa yang mengisi kuesioner ini?", "PML", "PPL", "Admin kabupaten", "Wali nagari", "B", "Pembahasan singkat mengapa jawaban B benar.", "PPL; kuesioner"],
    ["", "1", "Dasar Pendataan", "2", "Contoh pertanyaan kedua ...", "Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D", "C", "", ""],
    // Soal Benar/Salah: C dan D dikosongkan; Kunci diisi Benar atau Salah (A dan B boleh dikosongkan, otomatis Benar dan Salah)
    ["", "1", "Dasar Pendataan", "3", "Contoh Benar/Salah: PPL boleh mengisi kuesioner petani lain tanpa izin.", "", "", "", "", "Salah", "Pembahasan singkat.", ""],
  ];
}
