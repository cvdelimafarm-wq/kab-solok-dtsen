import { describe, expect, it } from "vitest";
import { bacaWaktu, bersihkanWaktuKiriman, catatPilih, lamaPerSoal, menitSejakTerakhir, perbaruiWaktu } from "@/lib/waktuJawaban";

const T1 = "2026-11-14T02:00:00.000Z";
const T2 = "2026-11-14T02:01:30.000Z";
const T3 = "2026-11-14T02:03:00.000Z";

describe("waktu per soal", () => {
  it("catat pilihan pertama dan ubahan", () => {
    const a = catatPilih(undefined, T1);
    expect(a).toEqual({ t: T1, u: T1, n: 1 });
    expect(catatPilih(a, T2)).toEqual({ t: T1, u: T2, n: 2 });
  });

  it("autosave tes: hanya soal baru atau berubah yang dicatat", () => {
    const w1 = perbaruiWaktu({}, {}, { "1": "A", "2": "B" }, T1);
    const w2 = perbaruiWaktu(w1, { "1": "A", "2": "B" }, { "1": "A", "2": "C", "3": "D" }, T2);
    expect(w2["1"]).toEqual({ t: T1, u: T1, n: 1 });
    expect(w2["2"]).toEqual({ t: T1, u: T2, n: 2 });
    expect(w2["3"]).toEqual({ t: T2, u: T2, n: 1 });
  });

  it("kiriman QC dibersihkan: soal asing, jam di luar batas, dan bentuk rusak dibuang", () => {
    const now = Date.parse(T3);
    const x = { mulai_at: T1, per_soal: { a: { t: T1, u: T2, n: 2 }, b: { t: "2026-11-13T00:00:00Z", u: T2, n: 1 }, asing: { t: T1, u: T1, n: 1 }, c: "rusak" } };
    const r = bersihkanWaktuKiriman(x, new Set(["a", "b", "c"]), Date.parse("2026-11-14T00:00:00Z"), now)!;
    expect(r.mulai_at).toBe(T1);
    expect(Object.keys(r.per_soal)).toEqual(["a"]);
    expect(bersihkanWaktuKiriman(null, new Set(), 0, now)).toBeNull();
    expect(bacaWaktu([1, 2])).toBeNull();
  });

  it("lama per soal dan menit sejak jawaban terakhir", () => {
    const w = { "2": { t: T2, u: T2, n: 1 }, "1": { t: T1, u: T1, n: 1 } };
    expect(lamaPerSoal(w, "2026-11-14T01:59:00.000Z")).toEqual({ "1": 60, "2": 90 });
    expect(lamaPerSoal(w, null)).toEqual({ "2": 90 });
    expect(menitSejakTerakhir(w, Date.parse(T3))).toBe(1);
    expect(menitSejakTerakhir({}, 0)).toBeNull();
  });
});

describe("topik soal tes", () => {
  it("hanya nomor yang ada; dirapikan; kosong = hapus", async () => {
    const { bersihkanTopikSoal } = await import("@/lib/sigapTes");
    expect(bersihkanTopikSoal({ "2": "  Blok   IV ", "1": "", "9": "asing", x: "y" }, [1, 2, 3])).toEqual([{ nomor: 1, topik: null }, { nomor: 2, topik: "Blok IV" }]);
    expect(bersihkanTopikSoal([1], [1])).toBeNull();
  });
});
