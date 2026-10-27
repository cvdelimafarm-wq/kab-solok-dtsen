import { describe, expect, it } from "vitest";
import { SARINGAN_AWAL, bandingId, namaTim, opsiSaringan, pilihPercobaan, susunHasil, teksJawaban, type AnggotaHasil, type PercobaanMentah, type SoalMentah } from "../korwilHasilQc";

const A: AnggotaHasil[] = [
  { akun_id: 1, nama: "Sari", peran: "pml", pml_nama: null },
  { akun_id: 2, nama: "Budi", peran: "ppl", pml_nama: "Sari" },
  { akun_id: 3, nama: "Citra", peran: "ppl", pml_nama: "Sari" },
  { akun_id: 4, nama: "Dewi", peran: "pml", pml_nama: null },
  { akun_id: 5, nama: "Eko", peran: "ppl", pml_nama: "Dewi" },
];
const S: SoalMentah[] = ["LAT-9", "LAT-16", "LAT-25"].map((id) => ({ id, pertanyaan: `Tanya ${id}`, opsi: { A: "a", B: "b" }, kunci: "A", penjelasan: "" }));
const P = (akun_id: number, ke: number, jawaban: Record<string, string>, salah: string[], tanggal = "2026-10-27"): PercobaanMentah => ({ akun_id, tanggal, ke, jawaban, salah });
const DATA: PercobaanMentah[] = [
  P(2, 1, { "LAT-9": "A", "LAT-16": "B", "LAT-25": "B" }, ["LAT-16", "LAT-25"]),
  P(2, 2, { "LAT-9": "A", "LAT-16": "A", "LAT-25": "A" }, []),
  P(3, 1, { "LAT-9": "A", "LAT-16": "B", "LAT-25": "A" }, ["LAT-16"]),
  P(1, 1, { "LAT-9": "A", "LAT-16": "A", "LAT-25": "A" }, []),
  P(5, 1, { "LAT-9": "B", "LAT-16": "B", "LAT-25": "A" }, ["LAT-9", "LAT-16"]),
];

describe("bandingId & namaTim", () => {
  it("urutan alami", () => expect(["LAT-16", "LAT-9", "LAT-100"].sort(bandingId)).toEqual(["LAT-9", "LAT-16", "LAT-100"]));
  it("PML = timnya sendiri; PPL ikut PML", () => {
    expect(namaTim(A[0])).toBe("Sari");
    expect(namaTim(A[1])).toBe("Sari");
    expect(namaTim({ nama: "X", peran: "ppl", pml_nama: null })).toBe("Tanpa PML");
  });
});

describe("pilihPercobaan", () => {
  it("pertama / terakhir per petugas per hari", () => {
    expect(pilihPercobaan(DATA, "pertama").find((p) => p.akun_id === 2)?.ke).toBe(1);
    expect(pilihPercobaan(DATA, "terakhir").find((p) => p.akun_id === 2)?.ke).toBe(2);
  });
  it("hari berbeda tetap dua percobaan", () => {
    expect(pilihPercobaan([P(2, 1, {}, [], "2026-10-27"), P(2, 1, {}, [], "2026-10-28")], "pertama")).toHaveLength(2);
  });
});

describe("susunHasil", () => {
  it("percobaan pertama: skor petugas, tim, ringkasan", () => {
    const h = susunHasil(A, DATA, S);
    const budi = h.matriks.kolom.find((p) => p.akun_id === 2)!;
    expect(budi).toMatchObject({ terjawab: 3, salah: 2, benar: 1, persen: 33, hari: 1, tim: "Sari" });
    expect(h.tim.map((t) => t.nama)).toEqual(["Dewi", "Sari"]);
    const sari = h.tim.find((t) => t.nama === "Sari")!;
    expect(sari.petugas.map((p) => p.nama)).toEqual(["Sari", "Budi", "Citra"]); // PML dulu
    expect(sari).toMatchObject({ terjawab: 9, salah: 3, persen: 67 });
    expect(h.ringkas).toMatchObject({ petugas: 5, sudahMengisi: 4, belumMengisi: 1, terjawab: 12, salah: 5 });
  });
  it("mode terakhir: Budi benar semua", () => {
    const h = susunHasil(A, DATA, S, { ...SARINGAN_AWAL, mode: "terakhir" });
    expect(h.matriks.kolom.find((p) => p.akun_id === 2)).toMatchObject({ salah: 0, persen: 100 });
  });
  it("soal salah per tim: urut jumlah salah, memuat siapa dan pilihannya", () => {
    const sari = susunHasil(A, DATA, S).tim.find((t) => t.nama === "Sari")!;
    expect(sari.soalSalah.map((x) => [x.soal.id, x.jumlahSalah])).toEqual([["LAT-16", 2], ["LAT-25", 1]]);
    expect(sari.soalSalah[0].penjawab.map((p) => [p.nama, p.pilih])).toEqual([["Budi", "B"], ["Citra", "B"]]);
  });
  it("matriks: baris diurut paling banyak salah; sel benar/salah/kosong", () => {
    const m = susunHasil(A, DATA, S).matriks;
    expect(m.baris.map((b) => b.soal.id)).toEqual(["LAT-16", "LAT-9", "LAT-25"]); // 16:3 salah, 9:1, 25:1 (9 < 25)
    expect(m.baris[0].jumlahSalah).toBe(3);
    expect(m.baris[0].sel[2]).toMatchObject({ status: "salah", pilih: "B" });
    expect(m.baris[0].sel[1]).toMatchObject({ status: "benar", pilih: "A" });
    expect(m.baris[0].sel[4]).toBeUndefined(); // Dewi belum mengisi
  });
  it("saringan tim, petugas dan tanggal", () => {
    expect(susunHasil(A, DATA, S, { ...SARINGAN_AWAL, tim: "Dewi" }).tim.map((t) => t.nama)).toEqual(["Dewi"]);
    const satu = susunHasil(A, DATA, S, { ...SARINGAN_AWAL, petugas: 3 });
    expect(satu.matriks.kolom.map((p) => p.nama)).toEqual(["Citra"]);
    expect(satu.ringkas.salah).toBe(1);
    expect(susunHasil(A, DATA, S, { ...SARINGAN_AWAL, tanggal: "2026-10-01" }).ringkas).toMatchObject({ terjawab: 0, sudahMengisi: 0, belumMengisi: 5, persen: null });
  });
  it("dua hari: salah dihitung per hari; sel menyimpan hari salah terakhir", () => {
    const d = [P(2, 1, { "LAT-9": "B" }, ["LAT-9"], "2026-10-27"), P(2, 1, { "LAT-9": "A" }, [], "2026-10-28"), P(2, 1, { "LAT-9": "B" }, ["LAT-9"], "2026-10-29")];
    const h = susunHasil(A, d, S);
    const c = h.matriks.baris[0].sel[2]!;
    expect(c).toMatchObject({ kali: 3, salahKali: 2, status: "salah", tanggal: "2026-10-29" });
    expect(h.matriks.kolom.find((p) => p.akun_id === 2)).toMatchObject({ hari: 3, terjawab: 3, salah: 2, persen: 33 });
  });
  it("soal yang sudah tidak ada di bank soal tetap tampil dengan penanda", () => {
    const h = susunHasil(A, [P(2, 1, { "LAT-99": "B" }, ["LAT-99"])], S);
    expect(h.matriks.baris[0].soal.pertanyaan).toContain("sudah tidak ada");
  });
  it("kosong aman", () => {
    const h = susunHasil([], [], []);
    expect(h.tim).toEqual([]);
    expect(h.ringkas.persen).toBeNull();
  });
});

describe("opsiSaringan & teksJawaban", () => {
  it("tim, petugas (PML dulu), tanggal terbaru dulu", () => {
    const o = opsiSaringan(A, [P(2, 1, {}, [], "2026-10-27"), P(2, 1, {}, [], "2026-10-28")]);
    expect(o.tim).toEqual(["Dewi", "Sari"]);
    expect(o.petugas.map((p) => p.nama)).toEqual(["Dewi", "Eko", "Sari", "Budi", "Citra"]);
    expect(o.tanggal).toEqual(["2026-10-28", "2026-10-27"]);
  });
  it("teksJawaban", () => {
    expect(teksJawaban(S[0], "B")).toBe("B. b");
    expect(teksJawaban(S[0], "Z")).toBe("Z");
    expect(teksJawaban(S[0], null)).toBe("—");
  });
});
