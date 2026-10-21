import { describe, expect, it } from "vitest";
import { MAKS_ISI_PUSH } from "@/lib/sigapPushUtil";
import { adaPlotting, bawaanTugas, daftarKecamatan, periksaTugas, pesanTugas, pplBawaan, ringkasPlotting, riwayatTerakhir, saringBelum, SARINGAN_AWAL, susunPushTugas, urutBelum, type BelumItem, type TimTugas } from "@/lib/belumDiajukan";

const sub = (o: Partial<BelumItem>): BelumItem => ({ idsubsls: "1303080001000502", kecamatan: "GUNUNG TALANG", nagari: "CUPAK", sls: "JORONG BALAI TANGAH", sub_sls: "02", kk: 75, didata: 0, kolam: false, plotting: [], terakhir: null, ...o });
const TIM: TimTugas[] = [
  { pml_id: 236, pml_nama: "Yeni siswanti", sub: 3, ppl: [{ petugas_id: 116, nama: "PUSPITA PUTRI", akun_id: 900 }, { petugas_id: 117, nama: "putri nasriati", akun_id: 901 }] },
  { pml_id: 460, pml_nama: "Ardial Jaraf", sub: 8, ppl: [{ petugas_id: 83, nama: "Diana", akun_id: 154 }] },
  { pml_id: 500, pml_nama: "Tanpa PPL", sub: 0, ppl: [] },
];
const plot = (pml_id: number, ppl_id: number | null, extra = {}) => ({ pml_id, pml_nama: "Yeni siswanti", ppl_id, ppl_nama: ppl_id ? "PUSPITA PUTRI" : null, mode_kerja: "keroyok", porsi_kk: null, terkunci: true, ...extra });

describe("periksaTugas", () => {
  it("menerima pilihan sah", () => {
    const r = periksaTugas([{ idsubsls: "1303080001000502", pml_id: 236, ppl_akun_id: 900 }]);
    expect(r).toEqual({ ok: true, pilihan: [{ idsubsls: "1303080001000502", pml_id: 236, ppl_akun_id: 900 }] });
  });
  it("menolak kosong, bukan larik, kode salah, PML/PPL kosong, dobel, dan kebanyakan", () => {
    expect(periksaTugas([]).ok).toBe(false);
    expect(periksaTugas("x").ok).toBe(false);
    expect(periksaTugas([{ idsubsls: "123", pml_id: 1, ppl_akun_id: 2 }]).ok).toBe(false);
    expect(periksaTugas([{ idsubsls: "1303080001000502", pml_id: 0, ppl_akun_id: 2 }]).ok).toBe(false);
    expect(periksaTugas([{ idsubsls: "1303080001000502", pml_id: 1, ppl_akun_id: "a" }]).ok).toBe(false);
    const d = { idsubsls: "1303080001000502", pml_id: 1, ppl_akun_id: 2 };
    expect(periksaTugas([d, d]).ok).toBe(false);
    expect(periksaTugas([d, { ...d, idsubsls: "1303080001000503" }], 1).ok).toBe(false);
    expect(periksaTugas([null]).ok).toBe(false);
  });
});

describe("pesanTugas", () => {
  it("tiap alasan punya kalimat, label ikut bila ada", () => {
    for (const a of ["nonaktif", "tidak_ada", "tanpa_kk", "ppl_bukan_tim", "sudah_didata", "sudah_diminta", "bukan_peserta", "kosong", "aneh"]) expect(pesanTugas(a).length).toBeGreaterThan(10);
    expect(pesanTugas("sudah_diminta", "Jorong Gando 04")).toContain("Jorong Gando 04:");
  });
});

describe("saringBelum / urutBelum", () => {
  const a = sub({ idsubsls: "A", kecamatan: "LEMBAH GUMANTI", nagari: "ALAHAN", sls: "JORONG X", plotting: [plot(236, 116)] });
  const b = sub({ idsubsls: "B", kecamatan: "GUNUNG TALANG", nagari: "CUPAK", sls: "JORONG Y", kolam: true });
  it("jenis plotting / kolam", () => {
    expect(saringBelum([a, b], { ...SARINGAN_AWAL, jenis: "plotting" })).toEqual([a]);
    expect(saringBelum([a, b], { ...SARINGAN_AWAL, jenis: "kolam" })).toEqual([b]);
  });
  it("kecamatan dan kata (juga nama PML plotting)", () => {
    expect(saringBelum([a, b], { ...SARINGAN_AWAL, kecamatan: "GUNUNG TALANG" })).toEqual([b]);
    expect(saringBelum([a, b], { ...SARINGAN_AWAL, kata: "yeni" })).toEqual([a]);
    expect(saringBelum([a, b], { ...SARINGAN_AWAL, kata: "cupak jorong" })).toEqual([b]);
    expect(saringBelum([a, b], { ...SARINGAN_AWAL, kata: "tidak ada" })).toEqual([]);
  });
  it("urut kecamatan lalu nagari, angka alami; daftarKecamatan unik", () => {
    expect(urutBelum([a, b]).map((x) => x.idsubsls)).toEqual(["B", "A"]);
    const s2 = sub({ idsubsls: "S2", sub_sls: "2" });
    const s10 = sub({ idsubsls: "S10", sub_sls: "10" });
    expect(urutBelum([s10, s2]).map((x) => x.idsubsls)).toEqual(["S2", "S10"]);
    expect(daftarKecamatan([a, b, b])).toEqual(["GUNUNG TALANG", "LEMBAH GUMANTI"]);
  });
});

describe("ringkasPlotting / adaPlotting / riwayatTerakhir", () => {
  it("tanpa plotting = kolam", () => {
    expect(ringkasPlotting(sub({}))).toMatch(/kolam/i);
    expect(adaPlotting(sub({}))).toBe(false);
  });
  it("dengan plotting memuat PML, PPL, mode, terkunci", () => {
    const t = ringkasPlotting(sub({ plotting: [plot(236, 116)] }));
    expect(t).toContain("PML Yeni Siswanti");
    expect(t).toContain("PPL Puspita Putri");
    expect(t).toContain("keroyok");
    expect(t).toContain("terkunci");
  });
  it("tanpa PPL tidak menulis panah", () => {
    expect(ringkasPlotting(sub({ plotting: [plot(236, null, { terkunci: false })] }))).not.toContain("→");
  });
  it("riwayat dibatalkan perlu hapus", () => {
    expect(riwayatTerakhir(null)).toBeNull();
    const r = riwayatTerakhir({ status: "dibatalkan", pml_nama: "ardial jaraf", waktu: null, perlu_hapus: true, dari_kolam: false, dari_admin: true });
    expect(r).toContain("dibatalkan");
    expect(r).toContain("dihapus di FASIH");
    expect(r).toContain("penugasan admin");
  });
});

describe("bawaanTugas / pplBawaan", () => {
  it("memakai PPL plotting bila ada di tim", () => {
    expect(bawaanTugas(sub({ plotting: [plot(236, 117)] }), TIM)).toEqual({ pml_id: 236, ppl_akun_id: 901 });
  });
  it("PPL plotting tidak ada di tim -> PPL pertama", () => {
    expect(bawaanTugas(sub({ plotting: [plot(236, 999)] }), TIM)).toEqual({ pml_id: 236, ppl_akun_id: 900 });
    expect(bawaanTugas(sub({ plotting: [plot(236, null)] }), TIM)).toEqual({ pml_id: 236, ppl_akun_id: 900 });
  });
  it("tanpa plotting / PML tidak ada di tim -> kosong; tim tanpa PPL -> ppl kosong", () => {
    expect(bawaanTugas(sub({}), TIM)).toEqual({ pml_id: null, ppl_akun_id: null });
    expect(bawaanTugas(sub({ plotting: [plot(777, 1)] }), TIM)).toEqual({ pml_id: null, ppl_akun_id: null });
    expect(bawaanTugas(sub({ plotting: [plot(500, 1)] }), TIM)).toEqual({ pml_id: 500, ppl_akun_id: null });
  });
  it("pplBawaan", () => {
    expect(pplBawaan(TIM, 460)).toBe(154);
    expect(pplBawaan(TIM, 500)).toBeNull();
    expect(pplBawaan(TIM, 1)).toBeNull();
  });
});

describe("susunPushTugas", () => {
  const item = (i: number) => ({ jorong: `Jorong Panjang Sekali Nomor ${i}`, ppl: `Nama Petugas ${i}` });
  it("tiap penerima punya judul, awal, dan ekor utuh", () => {
    const pml = susunPushTugas("pml", [{ jorong: "Jorong Gando 04", ppl: "PUSPITA PUTRI" }]);
    expect(pml.isi).toContain("Jorong Gando 04 → Puspita");
    expect(pml.isi).toContain("Tidak memakai kuota");
    const ppl = susunPushTugas("ppl", [{ jorong: "Jorong Gando 04", ppl: "x" }]);
    expect(ppl.isi).toContain("Untuk Anda: Jorong Gando 04");
    const lama = susunPushTugas("lama", [{ jorong: "Jorong Gando 04", ppl: "" }]);
    expect(lama.isi).toContain("Dialihkan ke tim lain: Jorong Gando 04");
  });
  it("daftar panjang dipotong '(+N lagi)' dan tidak melebihi batas, ekor tetap ada", () => {
    for (const u of ["pml", "ppl", "lama"] as const) {
      const r = susunPushTugas(u, Array.from({ length: 40 }, (_, i) => item(i)));
      expect(r.isi.length).toBeLessThanOrEqual(MAKS_ISI_PUSH);
      expect(r.isi).toMatch(/\(\+\d+ lagi\)/);
    }
    expect(susunPushTugas("pml", Array.from({ length: 40 }, (_, i) => item(i))).isi).toContain("Tidak memakai kuota");
  });
});
