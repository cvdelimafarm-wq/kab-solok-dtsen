import { describe, expect, it } from "vitest";
import { KASUS, URUTAN_LEVEL } from "../vanguard/kasus";
import { PENGATURAN_BAWAAN, bacaPengaturan, bolehMencoba, hitungLulus, inputWibKeIso, isoKeInputWib, hasilFinal, kasusDibuka, kasusSedangDiuji, levelDibuka, maksPercobaan, periksaSimpan, statusJadwal, ujiBerlaku, type Pengaturan } from "../vanguard/pengaturan";

const P = (o: Partial<Pengaturan> = {}): Pengaturan => ({ ...PENGATURAN_BAWAAN, ...o });
const T = (s: string) => Date.parse(s);

describe("bacaPengaturan", () => {
  it("bawaan untuk masukan rusak; nilai di luar batas dibuang; level urut dan unik; semua level = kosong", () => {
    for (const x of [null, undefined, "x", [], 5]) expect(bacaPengaturan(x)).toEqual(PENGATURAN_BAWAAN);
    expect(bacaPengaturan({ level_dibuka: ["C", "A", "A", "Z"], nilai_lulus: 80, maks_percobaan: 10 })).toMatchObject({ level_dibuka: ["A", "C"], nilai_lulus: 80, maks_percobaan: 10 });
    expect(bacaPengaturan({ level_dibuka: [...URUTAN_LEVEL] }).level_dibuka).toEqual([]);
    expect(bacaPengaturan({ nilai_lulus: 0, maks_percobaan: 999 })).toMatchObject({ nilai_lulus: null, maks_percobaan: null });
    expect(bacaPengaturan({ nilai_lulus: 50.5 }).nilai_lulus).toBeNull();
  });
  it("tutup yang tidak sesudah buka dibuang; waktu rusak = null", () => {
    expect(bacaPengaturan({ buka_at: "2026-11-02T00:00:00Z", tutup_at: "2026-11-01T00:00:00Z" }).tutup_at).toBeNull();
    expect(bacaPengaturan({ buka_at: "bukan waktu" }).buka_at).toBeNull();
    expect(bacaPengaturan({ buka_at: "2026-11-01T00:00:00Z", tutup_at: "2026-11-03T00:00:00Z" })).toMatchObject({ buka_at: "2026-11-01T00:00:00.000Z", tutup_at: "2026-11-03T00:00:00.000Z" });
  });
});

describe("periksaSimpan (masukan admin)", () => {
  it("menerima pengaturan sah dan menormalkan", () => {
    const r = periksaSimpan({ level_dibuka: ["B", "A"], nilai_lulus: "80", maks_percobaan: "" });
    expect(r.ok).toBe(false); // string "80" tidak diterima: harus bilangan
    const s = periksaSimpan({ level_dibuka: ["B", "A"], nilai_lulus: 80, maks_percobaan: null, buka_at: "2026-11-01T01:00:00Z", tutup_at: "2026-11-08T01:00:00Z" });
    expect(s).toEqual({ ok: true, pengaturan: { level_dibuka: ["A", "B"], nilai_lulus: 80, maks_percobaan: null, buka_at: "2026-11-01T01:00:00.000Z", tutup_at: "2026-11-08T01:00:00.000Z", mode: "latihan" } });
  });
  it("kosong = bawaan; semua level terpilih disimpan sebagai kosong", () => {
    expect(periksaSimpan({})).toEqual({ ok: true, pengaturan: PENGATURAN_BAWAAN });
    expect(periksaSimpan({ level_dibuka: [...URUTAN_LEVEL] })).toEqual({ ok: true, pengaturan: PENGATURAN_BAWAAN });
  });
  it("menolak dengan pesan jelas", () => {
    for (const [x, pesan] of [
      [null, "Pengaturan tidak sah."], [{ level_dibuka: "A" }, "Level dibuka tidak sah."], [{ level_dibuka: ["Z"] }, "Ada level yang tidak dikenal."],
      [{ nilai_lulus: 0 }, "Nilai lulus harus bilangan bulat 1 sampai 100 (persen)."], [{ nilai_lulus: 101 }, "Nilai lulus harus bilangan bulat 1 sampai 100 (persen)."], [{ nilai_lulus: 70.5 }, "Nilai lulus harus bilangan bulat 1 sampai 100 (persen)."],
      [{ maks_percobaan: 0 }, "Batas percobaan harus bilangan bulat 1 sampai 200."], [{ maks_percobaan: 201 }, "Batas percobaan harus bilangan bulat 1 sampai 200."],
      [{ buka_at: "x" }, "Waktu buka tidak sah."], [{ tutup_at: "x" }, "Waktu tutup tidak sah."],
      [{ buka_at: "2026-11-02T00:00:00Z", tutup_at: "2026-11-02T00:00:00Z" }, "Waktu tutup harus sesudah waktu buka."],
    ] as [unknown, string][]) { const r = periksaSimpan(x); expect(r.ok, JSON.stringify(x)).toBe(false); if (!r.ok) expect(r.pesan).toBe(pesan); }
  });
});

describe("jadwal, level, dan batas percobaan", () => {
  it("statusJadwal", () => {
    const p = P({ buka_at: "2026-11-02T00:00:00.000Z", tutup_at: "2026-11-05T00:00:00.000Z" });
    expect(statusJadwal(p, T("2026-11-01T23:59:59Z"))).toBe("belum_buka");
    expect(statusJadwal(p, T("2026-11-02T00:00:00Z"))).toBe("buka");
    expect(statusJadwal(p, T("2026-11-05T00:00:00Z"))).toBe("tutup");
    expect(statusJadwal(P(), T("2030-01-01T00:00:00Z"))).toBe("buka");
  });
  it("level dibuka dan kasus dibuka", () => {
    expect(levelDibuka(P())).toEqual(URUTAN_LEVEL);
    const p = P({ level_dibuka: ["A", "B"] });
    expect(levelDibuka(p)).toEqual(["A", "B"]);
    const k = kasusDibuka(p); expect(k.length).toBeGreaterThan(0); expect(k.every((x) => x.level === "A" || x.level === "B")).toBe(true);
    expect(kasusDibuka(P()).length).toBe(KASUS.length);
  });
  it("bolehMencoba: jadwal, level, batas percobaan; pesan jelas", () => {
    const a = KASUS.find((k) => k.level === "A")!, c = KASUS.find((k) => k.level === "C")!;
    const p = P({ level_dibuka: ["A"], maks_percobaan: 3, buka_at: "2026-11-02T00:00:00.000Z", tutup_at: "2026-11-05T00:00:00.000Z" });
    expect(bolehMencoba(p, a, 0, T("2026-11-01T00:00:00Z"))).toEqual({ boleh: false, alasan: "Latihan Vanguard untuk kegiatan ini belum dibuka." });
    expect(bolehMencoba(p, a, 0, T("2026-11-06T00:00:00Z"))).toEqual({ boleh: false, alasan: "Latihan Vanguard untuk kegiatan ini sudah ditutup." });
    expect(bolehMencoba(p, c, 0, T("2026-11-03T00:00:00Z"))).toEqual({ boleh: false, alasan: "Kasus ini belum dibuka untuk kegiatan Anda." });
    expect(bolehMencoba(p, a, 3, T("2026-11-03T00:00:00Z"))).toEqual({ boleh: false, alasan: "Batas percobaan untuk kasus ini sudah tercapai." });
    expect(bolehMencoba(p, a, 2, T("2026-11-03T00:00:00Z"))).toEqual({ boleh: true });
    expect(maksPercobaan(P())).toBe(200); expect(maksPercobaan(p)).toBe(3);
  });
});

describe("hitungLulus", () => {
  const A = KASUS.filter((k) => k.level === "A" && !k.bebas);
  it("tanpa nilai lulus: lulus = null, persen tetap dihitung", () => {
    const r = hitungLulus(P({ level_dibuka: ["A"] }), A.slice(0, 2).map((k) => k.kode));
    expect(r).toMatchObject({ dibuka: A.length, benar: 2, lulus: null });
    expect(r.persen).toBe(Math.round((2 / A.length) * 1000) / 10);
  });
  it("ambang: sama atau lebih = lulus; kasus di luar level dibuka dan kalkulator bebas tidak dihitung", () => {
    const p = P({ level_dibuka: ["A"], nilai_lulus: 50 });
    const separuh = A.slice(0, Math.ceil(A.length / 2)).map((k) => k.kode);
    expect(hitungLulus(p, separuh).lulus).toBe(true);
    expect(hitungLulus(p, A.slice(0, 1).map((k) => k.kode)).lulus).toBe(false);
    const luar = KASUS.find((k) => k.level === "C")!.kode;
    expect(hitungLulus(p, [luar, "H01"]).benar).toBe(0);
    expect(hitungLulus(P({ nilai_lulus: 100 }), KASUS.filter((k) => !k.bebas).map((k) => k.kode)).lulus).toBe(true);
  });
  it("tanpa kasus dibuka: persen 0 dan tidak lulus bila ada ambang", () => {
    expect(hitungLulus(P({ nilai_lulus: 10 }), [], [])).toEqual({ dibuka: 0, benar: 0, persen: 0, lulus: false });
  });
});

describe("waktu WIB untuk kolom isian", () => {
  it("bolak-balik ISO dan datetime-local WIB", () => {
    expect(inputWibKeIso("2026-11-01T08:30")).toBe("2026-11-01T01:30:00.000Z");
    expect(isoKeInputWib("2026-11-01T01:30:00.000Z")).toBe("2026-11-01T08:30");
    expect(isoKeInputWib("2026-10-31T18:00:00Z")).toBe("2026-11-01T01:00"); // lewat tengah malam WIB
    expect(isoKeInputWib(inputWibKeIso("2026-12-31T23:59"))).toBe("2026-12-31T23:59");
  });
  it("kosong dan rusak", () => {
    for (const x of [null, undefined, "", "bukan"]) { expect(isoKeInputWib(x)).toBe(""); }
    for (const x of [null, undefined, "", "2026-11-01", "2026-11-01 08:30", "2026-13-40T99:99"]) expect(inputWibKeIso(x), String(x)).toBeNull();
  });
});

describe("mode uji (V5b)", () => {
  it("bacaPengaturan: hanya 'uji' yang dikenali; lainnya latihan", () => {
    expect(bacaPengaturan({ mode: "uji" }).mode).toBe("uji");
    for (const x of ["latihan", "UJI", "", null, 5, undefined]) expect(bacaPengaturan({ mode: x }).mode, String(x)).toBe("latihan");
    expect(PENGATURAN_BAWAAN.mode).toBe("latihan");
  });
  it("periksaSimpan: menerima latihan dan uji, menolak nilai lain, tanpa mode = latihan", () => {
    expect(periksaSimpan({ mode: "uji" })).toMatchObject({ ok: true, pengaturan: { mode: "uji" } });
    expect(periksaSimpan({ mode: "latihan" })).toMatchObject({ ok: true, pengaturan: { mode: "latihan" } });
    expect(periksaSimpan({})).toMatchObject({ ok: true, pengaturan: { mode: "latihan" } });
    expect(periksaSimpan({ mode: "ujian" })).toEqual({ ok: false, pesan: "Mode harus latihan atau uji." });
  });
  it("ujiBerlaku: hanya bila mode uji DAN jadwal buka", () => {
    const u = P({ mode: "uji", buka_at: "2026-11-02T00:00:00Z", tutup_at: "2026-11-03T00:00:00Z" });
    expect(ujiBerlaku(u, T("2026-11-01T00:00:00Z"))).toBe(false); // belum buka
    expect(ujiBerlaku(u, T("2026-11-02T12:00:00Z"))).toBe(true);
    expect(ujiBerlaku(u, T("2026-11-03T00:00:00Z"))).toBe(false); // sudah tutup
    expect(ujiBerlaku(P({ mode: "latihan" }), T("2026-11-02T12:00:00Z"))).toBe(false);
  });
  it("kasusSedangDiuji: kunci level yang diuji terkunci; level yang tidak dibuka tidak ikut", () => {
    const u = P({ mode: "uji", level_dibuka: ["A", "B"] });
    const t = T("2026-11-01T00:00:00Z");
    expect(kasusSedangDiuji(u, "A", t)).toBe(true);
    expect(kasusSedangDiuji(u, "D", t)).toBe(false);
    expect(kasusSedangDiuji(P({ mode: "uji" }), "H", t)).toBe(true); // kosong = semua level
    expect(kasusSedangDiuji(P({ mode: "latihan" }), "A", t)).toBe(false);
  });
});

describe("hasil final (V5c): sampai lulus, batas percobaan, final setelah percobaan terakhir", () => {
  const A = KASUS.filter((k) => k.level === "A" && !k.bebas); // jumlah kasus level A (bertambah bersama kasus baru; tes tidak boleh mengunci angkanya)
  const n = A.length;
  const nLulus = Math.ceil(n * 0.7); // paling sedikit kasus benar agar nilai >= 70
  const nilaiDari = (k: number, dari = n) => Math.round((k / dari) * 1000) / 10;
  const P70 = (o: Partial<Pengaturan> = {}) => P({ level_dibuka: ["A"], nilai_lulus: 70, maks_percobaan: 3, mode: "uji", ...o });
  const benar = (n: number) => A.slice(0, n).map((k) => ({ kasus: k.kode, percobaan: 1, benar: true }));
  const habis = (dari: number, sampai: number) => A.slice(dari, sampai).map((k) => ({ kasus: k.kode, percobaan: 3, benar: false }));

  it("tanpa nilai lulus = tanpa batas (tidak ada kelulusan, tanpa remark)", () => {
    expect(hasilFinal(P({ level_dibuka: ["A"] }), benar(2))).toMatchObject({ status: "tanpa_batas", remark: null, pendampingan: false });
  });
  it("lulus begitu nilai tercapai, walau masih ada kasus yang belum dikerjakan (kerjakan sampai lulus)", () => {
    const h = hasilFinal(P70(), benar(nLulus));
    expect(h).toMatchObject({ status: "lulus", nilai: nilaiDari(nLulus), benar: nLulus, dibuka: n, remark: null, pendampingan: false });
    expect(hasilFinal(P70(), benar(nLulus - 1)).status).toBe("berjalan"); // satu kasus kurang = belum lulus
  });
  it("belum lulus tetapi masih ada percobaan = berjalan (belum final, tanpa remark tidak lulus)", () => {
    const h = hasilFinal(P70(), [...benar(5), ...habis(5, 7), { kasus: A[7].kode, percobaan: 2, benar: false }]);
    expect(h).toMatchObject({ status: "berjalan", remark: null, pendampingan: false });
    expect(h.selesai).toBe(7);
  });
  it("tidak lulus FINAL hanya setelah semua kasus benar atau percobaannya habis: remark tidak lulus, tetap boleh mendata (pendampingan)", () => {
    const h = hasilFinal(P70(), [...benar(6), ...habis(6, n)]); // 6 dari n < 70%, semua selesai
    expect(h.status).toBe("tidak_lulus");
    expect(h.nilai).toBe(nilaiDari(6));
    expect(h.pendampingan).toBe(true);
    expect(h.remark).toContain("Tidak lulus");
    expect(h.remark).toContain("pendampingan khusus");
    expect(h.remark).toContain(`${nilaiDari(6)} < 70`);
  });
  it("batas percobaan memakai pengaturan kegiatan (3); kasus dengan 2 percobaan salah belum habis", () => {
    const hampir = [...benar(6), ...habis(6, n - 1), { kasus: A[n - 1].kode, percobaan: 2, benar: false }];
    expect(hasilFinal(P70(), hampir).status).toBe("berjalan");
    expect(hasilFinal(P70({ maks_percobaan: 2 }), hampir).status).toBe("tidak_lulus");
  });
  it("tanpa riwayat = berjalan; level tidak dibuka tidak dihitung; tepat di batas lulus (70%) lulus", () => {
    expect(hasilFinal(P70(), [])).toMatchObject({ status: "berjalan", nilai: 0, benar: 0, selesai: 0 });
    expect(hasilFinal(P70(), [{ kasus: "B01", percobaan: 1, benar: true }]).benar).toBe(0);
    const nB = KASUS.filter((k) => k.level === "B" && !k.bebas).length;
    const dua = P70({ level_dibuka: ["A", "B"] });
    expect(hasilFinal({ ...dua, nilai_lulus: 50 }, benar(n)).nilai).toBe(nilaiDari(n, n + nB));
  });
});
