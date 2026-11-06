import { describe, expect, it } from "vitest";
import { awalForm, bedaForm, bedaTabel, type Form } from "../identifikasi";

const T = 2026;
const dasar = (u?: (f: Form) => void): Form => { const f = awalForm(); f.nama = "Seruti"; f.keList = ["Triwulan I", "Triwulan II"]; u?.(f); return f; };
const salin = (f: Form, u: (g: Form) => void): Form => { const g: Form = JSON.parse(JSON.stringify(f)); u(g); return g; };

describe("bedaTabel", () => {
  it("tanpa perubahan: kedua tabel kosong", () => {
    const f = dasar();
    expect(bedaTabel(f, salin(f, () => {}), T)).toEqual({ jadwal: [], lain: [] });
  });

  it("pola jendela berubah: baris jadwal berisi tanggal jadi per tahap dan periode, tanpa angka pola mentah", () => {
    const a = dasar();
    const b = salin(a, (g) => { g.jend.mn = 5; });
    const t = bedaTabel(a, b, T);
    expect(t.lain).toEqual([]); // jend.* tidak diulang di tabel isian lain
    const peng = t.jadwal.filter((r) => r.nama === "Pendataan");
    expect(peng.map((r) => r.periode)).toEqual(["Triwulan I", "Triwulan II"]);
    expect(peng[0]).toMatchObject({ kelompok: "Tahap", semula: "01/03/2026 s.d. 31/03/2026 (Perkiraan)", menjadi: "05/03/2026 s.d. 31/03/2026 (Perkiraan)" });
    // pengolahan ikut berubah (bawaan sama dengan pendataan), tahap yang tidak berubah tidak muncul
    expect(t.jadwal.some((r) => r.nama === "Pengolahan")).toBe(true);
    expect(t.jadwal.some((r) => r.nama === "Updating")).toBe(false);
  });

  it("hanya penanda Perkiraan -> Fix yang berubah tetap tampil sebagai perubahan jadwal", () => {
    const a = dasar();
    const b = salin(a, (g) => { g.jend.perk = false; g.rel.pengolahan.perk = false; g.rel.pasca.perk = false; g.rel.diseminasi.perk = false; });
    const t = bedaTabel(a, b, T);
    const r = t.jadwal.find((x) => x.nama === "Pendataan" && x.periode === "Triwulan I");
    expect(r?.semula.endsWith("(Perkiraan)")).toBe(true);
    expect(r?.menjadi.endsWith("(Fix)")).toBe(true);
  });

  it("tahap yang ditiadakan tampil sebagai strip, yang diadakan sebaliknya", () => {
    const a = dasar();
    const b = salin(a, (g) => { g.adaUpdating = true; });
    const t = bedaTabel(a, b, T);
    const u = t.jadwal.find((x) => x.nama === "Updating" && x.periode === "Triwulan I");
    expect(u?.semula).toBe("—");
    expect(u?.menjadi).toMatch(/^\d\d\/\d\d\/2026 s\.d\. \d\d\/\d\d\/2026 \(Perkiraan\)$/);
    expect(t.lain).toEqual([expect.objectContaining({ path: "adaUpdating", isian: "Ada updating", semula: "Tidak", menjadi: "Ya" })]); // pilihan Ada tetap dicatat sebagai isian
  });

  it("rapat: satu hari tampil sebagai satu tanggal; rentang lengkap", () => {
    const a = dasar();
    const b = salin(a, (g) => { g.rapat.evaluasi.tgl = { "Triwulan I": { mulai: "2026-04-10", selesai: "2026-04-10", perk: false, mode: "rentang" } }; });
    const t = bedaTabel(a, b, T);
    const r = t.jadwal.find((x) => x.kelompok === "Rapat" && x.periode === "Triwulan I");
    expect(r).toMatchObject({ nama: "Rapat evaluasi", semula: "—", menjadi: "10/04/2026 (Fix)" });
    const c = salin(b, (g) => { g.rapat.evaluasi.tgl!["Triwulan I"].selesai = "2026-04-12"; });
    expect(bedaTabel(b, c, T).jadwal.find((x) => x.kelompok === "Rapat" && x.periode === "Triwulan I")?.menjadi).toBe("10/04/2026 s.d. 12/04/2026 (Fix)");
  });

  it("sesi: jadwal pelatihan berubah muncul di kelompok Pelatihan dan briefing; bentuk sesi di isian lain", () => {
    const a = dasar((f) => { f.sesi.pelatihan.on = true; f.sesi.pelatihan.bentuk = "Daring"; });
    const b = salin(a, (g) => { g.sesi.pelatihan.tgl = { "Triwulan I": { mulai: "2026-02-10", selesai: "2026-02-11", perk: false, mode: "rentang" } }; g.sesi.pelatihan.bentuk = "Luring"; });
    const t = bedaTabel(a, b, T);
    expect(t.jadwal.find((x) => x.nama === "Pelatihan" && x.periode === "Triwulan I")).toMatchObject({ kelompok: "Pelatihan dan briefing", semula: "—", menjadi: "10/02/2026 s.d. 11/02/2026 (Fix)" });
    expect(t.lain).toEqual([expect.objectContaining({ bagian: "Pelatihan dan briefing", isian: "Sesi Pelatihan: bentuk", semula: "Daring", menjadi: "Luring" })]);
  });

  it("isian lain dikelompokkan per bagian dan diurutkan mengikuti formulir", () => {
    const a = dasar();
    const b = salin(a, (g) => { g.rekon = true; g.peran.ppl.nMit = 7; g.nama = "Seruti I"; g.instrumen = "PAPI"; });
    const t = bedaTabel(a, b, T);
    expect(t.jadwal).toEqual([]);
    expect(t.lain.map((r) => r.bagian)).toEqual(["Survei dan jadwal", "Survei dan jadwal", "Organisasi pendataan", "Konsultasi, rekonsiliasi, diseminasi"]);
    const rek = t.lain.find((r) => r.path === "rekon");
    expect(rek).toMatchObject({ isian: "Ada rekonsiliasi data", semula: "Tidak", menjadi: "Ya" });
  });

  it("tanpa periode: periode tidak ditulis; jadwal tunggal tampil sebagai tanggal jadi", () => {
    const a = dasar((f) => { f.periode = "Tanpa periode"; f.keList = []; f.tunggal = { mulai: "2026-05-04", selesai: "2026-05-15", perk: true }; });
    const b = salin(a, (g) => { g.tunggal.mulai = "2026-05-06"; });
    const t = bedaTabel(a, b, T);
    const r = t.jadwal.find((x) => x.nama === "Pendataan");
    expect(r).toMatchObject({ periode: "—", semula: "04/05/2026 s.d. 15/05/2026 (Perkiraan)", menjadi: "06/05/2026 s.d. 15/05/2026 (Perkiraan)" });
    expect(t.lain).toEqual([]);
  });

  it("bedaForm (kalimat) tetap tersedia dan tidak berubah", () => {
    const a = dasar();
    const b = salin(a, (g) => { g.rekon = true; });
    expect(bedaForm(a, b)).toEqual([{ path: "rekon", t: "Ada rekonsiliasi data: Tidak → Ya" }]);
  });
});
