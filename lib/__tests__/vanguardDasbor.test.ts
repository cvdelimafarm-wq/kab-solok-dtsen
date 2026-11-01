import { describe, expect, it } from "vitest";
import { barisCsv, csvKesalahan, csvSkor, hariWib, menuDasbor, selCsv, susunDasbor, type BarisKesalahanDb, type BarisPercobaanDb, type Peserta } from "../vanguard/dasbor";
import { PENGATURAN_BAWAAN } from "../vanguard/pengaturan";
import { KASUS } from "../vanguard/kasus";

const P: Peserta[] = [{ akun_id: 1, nama: "Rina", peran: "ppl" }, { akun_id: 2, nama: "Budi", peran: "pml" }, { akun_id: 3, nama: "Sari", peran: "ppl" }];
let id = 0;
const perc = (o: Partial<BarisPercobaanDb> & Pick<BarisPercobaanDb, "akun_id" | "kasus" | "nomor" | "benar">): BarisPercobaanDb =>
  ({ bintang: o.benar ? 3 : 0, jml_salah: o.benar ? 0 : 1, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 60, dibuat_at: `2026-11-01T0${(id++ % 9) + 1}:00:00Z`, ...o });
const kes = (akun_id: number, kasus: string, jenis: BarisKesalahanDb["jenis"], tingkat: BarisKesalahanDb["tingkat"], sel: string | null = "e_rtLain_barangD"): BarisKesalahanDb => ({ akun_id, kasus, sel, jenis, tingkat });

const PERC: BarisPercobaanDb[] = [
  perc({ akun_id: 1, kasus: "A01", nomor: 1, benar: false, durasi_dtk: 30 }),
  perc({ akun_id: 1, kasus: "A01", nomor: 2, benar: true, bintang: 2, petunjuk: 0, durasi_dtk: 90 }),
  perc({ akun_id: 1, kasus: "A02", nomor: 1, benar: true, bintang: 3 }),
  perc({ akun_id: 2, kasus: "A01", nomor: 1, benar: false }),
  perc({ akun_id: 2, kasus: "A01", nomor: 2, benar: false }),
  perc({ akun_id: 2, kasus: "A01", nomor: 3, benar: true, bintang: 1, petunjuk: 2 }),
];
const KES: BarisKesalahanDb[] = [
  kes(1, "A01", "konversi_seminggu", "fatal"),
  kes(2, "A01", "konversi_seminggu", "fatal"), kes(2, "A01", "konversi_seminggu", "fatal", "a1_uang"),
  kes(2, "A01", "belum_diisi", "berat"),
];

describe("kasus ditangguhkan tidak dihitung", () => {
  it("rekaman lama atas D18 (ditangguhkan) diabaikan: percobaan, kesalahan, dan kasus dikerjakan sama dengan tanpa rekaman itu", () => {
    const tambahan = [perc({ akun_id: 1, kasus: "D18", nomor: 1, benar: false }), perc({ akun_id: 3, kasus: "D18", nomor: 1, benar: true, bintang: 3 })];
    const a = susunDasbor(P, PERC, KES);
    const b = susunDasbor(P, [...PERC, ...tambahan], [...KES, kes(3, "D18", "salah_letak", "fatal")]);
    expect(b.ringkasan).toEqual(a.ringkasan);
    expect(b.petugas).toEqual(a.petugas);
  });
});

describe("susunDasbor", () => {
  const d = susunDasbor(P, PERC, KES);
  it("ringkasan", () => {
    expect(d.ringkasan).toMatchObject({ peserta: 3, mencoba: 2, persenMencoba: 66.7, percobaan: 6, kasusDikerjakan: 2, kesalahanTotal: 4, kesalahanFatal: 3 });
    expect(d.ringkasan.rataPercobaanPerKasus).toBe(2); // 6 percobaan / 3 pasangan
    expect(d.ringkasan.persenBenarTanpaPetunjuk).toBe(66.7); // 2 dari 3 pasangan benar tanpa petunjuk
    expect(d.ringkasan.rataBintang).toBe(2); // (2+3+1)/3
    expect(d.ringkasan.medianDurasiDtk).toBe(60);
  });
  it("kesalahan tersering diurut menurun; fatal terpisah; tingkat tertinggi per jenis", () => {
    expect(d.jenis.map((x) => [x.kunci, x.jumlah, x.petugas, x.tingkat])).toEqual([["konversi_seminggu", 3, 2, "fatal"], ["belum_diisi", 1, 1, "berat"]]);
    expect(d.jenisFatal.map((x) => [x.kunci, x.jumlah])).toEqual([["konversi_seminggu", 3]]);
  });
  it("kotak dan kasus tersering", () => {
    expect(d.sel[0]).toMatchObject({ kunci: "e_rtLain_barangD", jumlah: 3, petugas: 2 });
    expect(d.sel[0].label).toContain("V.E");
    expect(d.kasus[0]).toMatchObject({ kunci: "A01", jumlah: 3, petugas: 2 });
  });
  it("peta panas kasus x jenis", () => {
    expect(d.heat).toHaveLength(1);
    expect(d.heat[0]).toMatchObject({ kasus: "A01", total: 4, per: { konversi_seminggu: 3, belum_diisi: 1 } });
  });
  it("per petugas (peserta yang belum mencoba tetap tampil dengan nol)", () => {
    const rina = d.petugas.find((x) => x.nama === "Rina")!;
    expect(rina).toMatchObject({ percobaan: 3, kasusDikerjakan: 2, kasusBenar: 2, bintang: 5, persenBenarPertama: 50, fatal: 1 });
    expect(rina.kelemahan).toEqual({ jenis: "konversi_seminggu", jumlah: 1 });
    const budi = d.petugas.find((x) => x.nama === "Budi")!;
    expect(budi).toMatchObject({ percobaan: 3, kasusBenar: 1, bintang: 1, persenBenarPertama: 0, fatal: 2 });
    expect(budi.kelemahan).toEqual({ jenis: "konversi_seminggu", jumlah: 2 });
    const sari = d.petugas.find((x) => x.nama === "Sari")!;
    expect(sari).toMatchObject({ percobaan: 0, kasusDikerjakan: 0, kelemahan: null, terakhir: null });
    expect(d.petugas.map((x) => x.nama)).toEqual(["Budi", "Rina", "Sari"]);
  });
  it("perkembangan", () => {
    expect(d.perkembangan).toEqual({ persenBenarPercobaanPertama: 33.3, persenAkhirnyaBenar: 100, rataPercobaanSampaiBenar: 2, pasangan: 3 });
  });
  it("akun yang mencoba tetapi bukan peserta aktif lagi tetap dihitung (nama cadangan)", () => {
    const x = susunDasbor([], [perc({ akun_id: 9, kasus: "A01", nomor: 1, benar: true })], []);
    expect(x.petugas[0].nama).toBe("Akun 9");
    expect(x.ringkasan.persenMencoba).toBe(0);
  });
  it("nama akun non-peserta diambil dari namaLain", () => {
    const x = susunDasbor([], [perc({ akun_id: 9, kasus: "A01", nomor: 1, benar: true })], [], { 9: "Doni" });
    expect(x.petugas[0].nama).toBe("Doni");
  });
  it("menu izin menurut jenis kegiatan", () => {
    expect(menuDasbor("pelatihan")).toBe("pelatihan.kelola");
    expect(menuDasbor("pendataan")).toBe("translok.monitoring");
    expect(menuDasbor(null)).toBe("translok.monitoring");
  });
  it("data kosong tidak membagi dengan nol", () => {
    const k = susunDasbor([], [], []);
    expect(k.ringkasan).toMatchObject({ peserta: 0, mencoba: 0, persenMencoba: 0, percobaan: 0, rataPercobaanPerKasus: 0, persenBenarTanpaPetunjuk: 0, rataBintang: 0, medianDurasiDtk: 0 });
    expect(k.jenis).toEqual([]); expect(k.heat).toEqual([]); expect(k.perHari).toEqual([]);
    expect(k.perkembangan.rataPercobaanSampaiBenar).toBe(0);
  });
  it("per hari memakai tanggal WIB", () => {
    expect(hariWib("2026-10-31T18:00:00Z")).toBe("2026-11-01");
    const x = susunDasbor(P, [perc({ akun_id: 1, kasus: "A01", nomor: 1, benar: true, dibuat_at: "2026-10-31T18:00:00Z" }), perc({ akun_id: 1, kasus: "A02", nomor: 1, benar: false, dibuat_at: "2026-11-01T02:00:00Z" })], []);
    expect(x.perHari).toEqual([{ tgl: "2026-11-01", percobaan: 2, benar: 1 }]);
  });
});

describe("nilai lulus dan kalkulator pada dasbor", () => {
  it("tanpa pengaturan: lulus = null; kalkulator 0", () => {
    const d = susunDasbor(P, PERC, KES);
    expect(d.ringkasan).toMatchObject({ lulus: null, persenLulus: null, kalkulatorPetugas: 0, kalkulatorTotal: 0 });
    expect(d.petugas.every((p) => p.lulus === null && p.kalkulator === 0)).toBe(true);
  });
  it("dengan nilai lulus: dihitung dari kasus bernilai pada level yang dibuka; hanya peserta dihitung pada ringkasan", () => {
    const peng = { level_dibuka: ["A" as const], nilai_lulus: 1, buka_at: null, tutup_at: null, maks_percobaan: null };
    const d = susunDasbor(P, PERC, KES, { 9: "Mantan" }, { pengaturan: peng, kalkulator: { 1: 4, 2: 1, 9: 7 } });
    const rina = d.petugas.find((x) => x.nama === "Rina")!, sari = d.petugas.find((x) => x.nama === "Sari")!;
    expect(rina.lulus).toBe(true); expect(rina.persenBenar).toBeGreaterThan(0);
    expect(sari).toMatchObject({ lulus: false, persenBenar: 0 });
    expect(d.ringkasan.lulus).toBe(2); // Rina dan Budi (masing-masing benar sedikitnya 1 kasus level A)
    expect(d.ringkasan.persenLulus).toBe(66.7);
    expect(d.ringkasan).toMatchObject({ kalkulatorPetugas: 2, kalkulatorTotal: 5 });
    expect(rina.kalkulator).toBe(4);
  });
  it("CSV skor memuat kolom lulus dan kalkulator", () => {
    const peng = { level_dibuka: [], nilai_lulus: 90, buka_at: null, tutup_at: null, maks_percobaan: null, mode: "latihan" as const };
    const l = csvSkor(susunDasbor(P, PERC, KES, {}, { pengaturan: peng, kalkulator: { 1: 2 } })).trim().split("\r\n");
    expect(l[0]).toContain("Hasil final,Remark,Pemakaian kalkulator");
    const rina = l.find((x) => x.startsWith("Rina,"))!.split(",");
    expect(rina[8]).toBe("Belum final"); expect(rina[9]).toBe(""); expect(rina[10]).toBe("2");
  });
});

describe("CSV", () => {
  it("melindungi dari injeksi rumus dan mengutip sel khusus", () => {
    expect(selCsv("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(selCsv("+1")).toBe("'+1");
    expect(selCsv("-5")).toBe("'-5");
    expect(selCsv("@a")).toBe("'@a");
    expect(selCsv("a,b")).toBe("\"a,b\"");
    expect(selCsv("baris\nbaru")).toBe("\"baris\nbaru\"");
    expect(selCsv(null)).toBe("");
    expect(selCsv(12)).toBe("12");
    expect(barisCsv(["a", 1, null])).toBe("a,1,");
  });
  it("skor dan kesalahan: kepala, jumlah baris, nama peserta", () => {
    const d = susunDasbor(P, PERC, KES);
    const s = csvSkor(d).trim().split("\r\n");
    expect(s[0]).toContain("Nama,Peran,Percobaan");
    expect(s).toHaveLength(1 + 3);
    expect(s.some((l) => l.startsWith("Rina,ppl,3,2,2,5,50,"))).toBe(true);
    const k = csvKesalahan(P, KES).trim().split("\r\n");
    expect(k).toHaveLength(1 + 4);
    expect(k[1]).toContain("Rina,A01,");
    expect(k.join("\n")).toContain("Fatal");
  });
});

describe("kelulusan pada buku uji (V5b)", () => {
  const perc = (akun: number, kasus: string, nomor: number, benar: boolean, mode: string) => ({ akun_id: akun, kasus, nomor, benar, bintang: benar ? 3 : 0, jml_salah: 0, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 10, dibuat_at: "2026-11-01T01:00:00Z", mode });
  const peserta = [{ akun_id: 1, nama: "Rina", peran: "ppl" }, { akun_id: 2, nama: "Budi", peran: "ppl" }];
  const data = [perc(1, "A01", 1, true, "latihan"), perc(2, "A01", 1, true, "uji")];
  it("bermode uji: hanya percobaan uji yang membuat lulus", () => {
    const d = susunDasbor(peserta, data as never, [], {}, { pengaturan: { ...PENGATURAN_BAWAAN, level_dibuka: ["A"], nilai_lulus: 1, mode: "uji" } });
    expect(d.petugas.find((p) => p.nama === "Rina")?.lulus).toBe(false);
    expect(d.petugas.find((p) => p.nama === "Budi")?.lulus).toBe(true);
    expect(d.ringkasan.lulus).toBe(1);
  });
  it("bermode latihan: semua percobaan dihitung", () => {
    const d = susunDasbor(peserta, data as never, [], {}, { pengaturan: { ...PENGATURAN_BAWAAN, level_dibuka: ["A"], nilai_lulus: 1, mode: "latihan" } });
    expect(d.ringkasan.lulus).toBe(2);
  });
});

describe("hasil final per petugas (V5c)", () => {
  const A = KASUS.filter((k) => k.level === "A" && !k.bebas);
  const nA = A.length, nLulus = Math.ceil(nA * 0.7);
  const P2 = [{ akun_id: 1, nama: "Rina", peran: "ppl" }, { akun_id: 2, nama: "Budi", peran: "ppl" }, { akun_id: 3, nama: "Sari", peran: "ppl" }];
  const r = (akun: number, kasus: string, nomor: number, benar: boolean, mode = "uji") => ({ akun_id: akun, kasus, nomor, benar, bintang: benar ? 3 : 0, jml_salah: benar ? 0 : 1, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 10, dibuat_at: "2026-11-01T01:00:00Z", mode });
  const peng = { ...PENGATURAN_BAWAAN, level_dibuka: ["A" as const], nilai_lulus: 70, maks_percobaan: 3, mode: "uji" as const };
  const data = [
    // Rina: benar secukupnya untuk nilai 70% -> lulus walau sisa kasus belum dikerjakan
    ...A.slice(0, nLulus).map((k) => r(1, k.kode, 1, true)),
    // Budi: 5 benar, sisanya habis 3 percobaan salah -> tidak lulus FINAL
    ...A.slice(0, 5).map((k) => r(2, k.kode, 1, true)),
    ...A.slice(5).flatMap((k) => [r(2, k.kode, 1, false), r(2, k.kode, 2, false), r(2, k.kode, 3, false)]),
    // Sari: 4 benar, sisanya masih punya percobaan -> berjalan
    ...A.slice(0, 4).map((k) => r(3, k.kode, 1, true)), r(3, A[4].kode, 1, false),
  ];
  const d = susunDasbor(P2, data as never, [], {}, { pengaturan: peng });
  const baris = (n: string) => d.petugas.find((p) => p.nama === n)!;
  it("lulus, tidak lulus final, dan berjalan dibedakan; remark hanya untuk tidak lulus", () => {
    expect(baris("Rina")).toMatchObject({ hasil: "lulus", lulus: true, remark: null });
    expect(baris("Budi")).toMatchObject({ hasil: "tidak_lulus", lulus: false });
    expect(baris("Budi").remark).toMatch(/pendampingan khusus/);
    expect(baris("Sari")).toMatchObject({ hasil: "berjalan", lulus: false, remark: null });
  });
  it("ringkasan: lulus, tidak lulus final, dan belum final", () => {
    expect(d.ringkasan).toMatchObject({ lulus: 1, tidakLulus: 1, belumFinal: 1 });
  });
  it("latihan lama tidak menggagalkan atau meluluskan pada buku uji", () => {
    const lama = A.map((k) => r(3, k.kode, 1, true, "latihan")); // Sari pernah benar semua di latihan
    const d2 = susunDasbor(P2, [...data, ...lama] as never, [], {}, { pengaturan: peng });
    expect(d2.petugas.find((p) => p.nama === "Sari")).toMatchObject({ hasil: "berjalan" });
  });
  it("CSV memuat hasil final dan remark; tanpa nilai lulus kolom kosong", () => {
    const l = csvSkor(d).trim().split("\r\n");
    expect(l.find((x) => x.startsWith("Budi,"))).toContain("Tidak lulus");
    expect(l.find((x) => x.startsWith("Budi,"))).toContain("pendampingan khusus");
    const t = susunDasbor(P2, data as never, [], {}, { pengaturan: { ...peng, nilai_lulus: null } });
    expect(t.ringkasan).toMatchObject({ lulus: null, tidakLulus: null, belumFinal: null });
    expect(t.petugas.every((p) => p.hasil === "tanpa_batas" && p.remark === null)).toBe(true);
  });
});
