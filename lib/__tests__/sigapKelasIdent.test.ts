import { describe, expect, it } from "vitest";
import { aturanMode, bandingPeriode, opsiKelasPeran, ringkasOpsi, tetapkanKelas, teksInfoPelatihan, sebaranDenganPeran, tanggalKelas, usulanRapat, kelasUntukPeserta, periodeKelas, perluFotoTranslok, peringatanKelas, rentangTanggal, ringkasKelas, sebaranPeserta, tglIndo } from "../sigapKelasIdent";

const mentah = (o: Partial<Parameters<typeof ringkasKelas>[0][number]> = {}) => ({
  id: "k1", nama: "Pelatihan Triwulan IV", sesi: "pelatihan" as const, metode: "Luring" as const, tempat: "Hotel dalam kota" as const, lokasi: "Hotel Contoh, Arosuka",
  mulai: "2026-11-02", selesai: "2026-11-03", untuk: ["ppl", "pml"] as ("ppl" | "pml")[], fix: true, ...o,
});

describe("tanggal", () => {
  it("tglIndo dan rentang", () => {
    expect(tglIndo("2026-03-02")).toBe("2 Mar 2026");
    expect(tglIndo("bukan")).toBe("bukan");
    expect(rentangTanggal("2026-03-02", "2026-03-02")).toBe("2 Mar 2026");
    expect(rentangTanggal("2026-03-02", "2026-03-03")).toBe("2–3 Mar 2026");
    expect(rentangTanggal("2026-03-30", "2026-04-01")).toBe("30 Mar – 1 Apr 2026");
    expect(rentangTanggal("2026-12-31", "2027-01-02")).toBe("31 Des 2026 – 2 Jan 2027");
    expect(rentangTanggal("", "")).toBe("Jadwal belum diisi");
    expect(rentangTanggal("2026-03-02", "")).toBe("2 Mar 2026");
  });
});

describe("ringkasKelas", () => {
  it("menghitung hari dan nomor; tanggal tak sah dikosongkan", () => {
    const r = ringkasKelas([mentah(), mentah({ id: "k2", mulai: "2026-02-30", selesai: "2026-11-05" })], false);
    expect(r.map((k) => k.nomor)).toEqual([1, 2]);
    expect(r[0].hari).toBe(2);
    expect(r[1].mulai).toBe("");
    expect(r[1].hari).toBe(0);
  });
  it("tanggal selesai lebih awal -> hari 0", () => {
    expect(ringkasKelas([mentah({ mulai: "2026-11-05", selesai: "2026-11-03" })], false)[0].hari).toBe(0);
  });
  it("hanyaPelatihan membuang briefing dan menomori ulang; tanpa pelatihan, briefing dipertahankan", () => {
    const a = ringkasKelas([mentah({ id: "b", sesi: "briefing" }), mentah({ id: "p1" }), mentah({ id: "p2" })], true);
    expect(a.map((k) => k.id)).toEqual(["p1", "p2"]);
    expect(a.map((k) => k.nomor)).toEqual([1, 2]);
    const b = ringkasKelas([mentah({ id: "b", sesi: "briefing" })], true);
    expect(b).toHaveLength(1);
    expect(b[0].sesi).toBe("briefing");
  });
  it("metode asing -> kosong; nama kosong diberi nama bawaan", () => {
    const r = ringkasKelas([mentah({ metode: "" , nama: "  " })], false)[0];
    expect(r.metode).toBe("");
    expect(r.nama).toBe("Kelas 1");
  });
});

describe("kelasUntukPeserta", () => {
  const daftar = ringkasKelas([mentah({ id: "a", untuk: ["ppl"] }), mentah({ id: "b", untuk: ["pml"] }), mentah({ id: "c", untuk: ["ppl"] })], false);
  it("nomor penugasan dipakai bila ada", () => {
    const h = kelasUntukPeserta(daftar, "ppl", 3);
    expect(h.cara).toBe("penugasan");
    expect(h.kelas?.id).toBe("c");
  });
  it("tanpa nomor: satu-satunya kelas peran itu -> otomatis", () => {
    const h = kelasUntukPeserta(daftar, "pml", null);
    expect(h.cara).toBe("otomatis");
    expect(h.kelas?.id).toBe("b");
  });
  it("tanpa nomor: beberapa kelas -> tidak pasti dengan kandidat", () => {
    const h = kelasUntukPeserta(daftar, "ppl", null);
    expect(h.cara).toBe("tidak_pasti");
    expect(h.kelas).toBeNull();
    expect(h.kandidat.map((k) => k.id)).toEqual(["a", "c"]);
  });
  it("nomor di luar jangkauan jatuh ke aturan peran", () => {
    expect(kelasUntukPeserta(daftar, "pml", 9).cara).toBe("otomatis");
    expect(kelasUntukPeserta(daftar, "pml", 0).cara).toBe("otomatis");
  });
  it("peran tak ada / daftar kosong -> tidak ada", () => {
    expect(kelasUntukPeserta(daftar, "kortim", null).cara).toBe("tidak_ada");
    expect(kelasUntukPeserta([], "ppl", 1).cara).toBe("tidak_ada");
  });
});

describe("aturanMode", () => {
  it("tiga mode dan kosong", () => {
    expect(aturanMode("Daring")).toMatchObject({ presensi: "token", foto_translok: false, pulsa: true });
    expect(aturanMode("Luring")).toMatchObject({ presensi: "lokasi", foto_translok: true, pulsa: false });
    expect(aturanMode("Hybrid")).toMatchObject({ presensi: "keduanya", foto_translok: true, pulsa: true });
    expect(aturanMode("")).toBeNull();
  });
});

describe("peringatanKelas", () => {
  it("kelas lengkap tanpa peringatan", () => {
    expect(peringatanKelas(ringkasKelas([mentah()], false))).toEqual([]);
  });
  it("mengenali isian kurang", () => {
    const r = peringatanKelas(ringkasKelas([mentah({ metode: "", mulai: "", lokasi: "", untuk: [] }), mentah({ id: "x", metode: "Hybrid", lokasi: "", mulai: "2026-11-05", selesai: "2026-11-03" })], false));
    const t = r.map((x) => x.pesan).join("|");
    expect(t).toContain("bentuk kelas");
    expect(t).toContain("tanggal mulai atau selesai belum diisi");
    expect(t).toContain("peran peserta");
    expect(t).toContain("lebih awal");
    expect(t).toContain("nama tempat");
  });
  it("daring tidak butuh nama tempat", () => {
    expect(peringatanKelas(ringkasKelas([mentah({ metode: "Daring", lokasi: "" })], false))).toEqual([]);
  });
});

describe("sebaranPeserta", () => {
  it("menghitung per kelas, tanpa kelas, dan di luar perencanaan", () => {
    const daftar = ringkasKelas([mentah({ id: "a" }), mentah({ id: "b" })], false);
    const s = sebaranPeserta(daftar, [1, 1, 2, null, 5]);
    expect(s.per_kelas.get(1)).toBe(2);
    expect(s.per_kelas.get(2)).toBe(1);
    expect(s.tanpa_kelas).toBe(1);
    expect(s.di_luar).toBe(1);
  });
});

describe("perluFotoTranslok", () => {
  it("hanya Daring yang tidak perlu; luring, hybrid, kosong, dan tak diketahui tetap perlu", () => {
    expect(perluFotoTranslok(aturanMode("Daring"))).toBe(false);
    expect(perluFotoTranslok(aturanMode("Luring"))).toBe(true);
    expect(perluFotoTranslok(aturanMode("Hybrid"))).toBe(true);
    expect(perluFotoTranslok(aturanMode(""))).toBe(true);
    expect(perluFotoTranslok(null)).toBe(true);
    expect(perluFotoTranslok(undefined)).toBe(true);
  });
});

describe("periodeKelas / bandingPeriode", () => {
  it("rentang paling awal sampai paling akhir; kelas bertanggal rusak diabaikan", () => {
    const d = ringkasKelas([
      mentah({ id: "a", mulai: "2026-11-10", selesai: "2026-11-11" }),
      mentah({ id: "b", mulai: "2026-11-02", selesai: "2026-11-03" }),
      mentah({ id: "c", mulai: "2026-10-01", selesai: "2026-09-01" }), // terbalik
      mentah({ id: "d", mulai: "", selesai: "2026-12-31" }), // belum lengkap
    ], false);
    expect(periodeKelas(d)).toEqual({ mulai: "2026-11-02", selesai: "2026-11-11", hari: 10 });
  });
  it("satu kelas satu hari; tanpa tanggal sah -> null; daftar kosong -> null", () => {
    expect(periodeKelas(ringkasKelas([mentah({ mulai: "2026-11-02", selesai: "2026-11-02" })], false))).toEqual({ mulai: "2026-11-02", selesai: "2026-11-02", hari: 1 });
    expect(periodeKelas(ringkasKelas([mentah({ mulai: "", selesai: "" })], false))).toBeNull();
    expect(periodeKelas([])).toBeNull();
  });
  it("lintas bulan/tahun dihitung benar", () => {
    expect(periodeKelas(ringkasKelas([mentah({ mulai: "2026-12-30", selesai: "2027-01-02" })], false))?.hari).toBe(4);
  });
  it("bandingPeriode", () => {
    const r = { mulai: "2026-11-02", selesai: "2026-11-03" };
    expect(bandingPeriode(r, { mulai: "2026-11-02", selesai: "2026-11-03" })).toBe("sama");
    expect(bandingPeriode(r, { mulai: "2026-11-02", selesai: "2026-11-04" })).toBe("beda");
    expect(bandingPeriode(r, { mulai: null, selesai: "2026-11-03" })).toBe("kosong");
    expect(bandingPeriode(r, { mulai: "", selesai: "" })).toBe("kosong");
  });
});

describe("tanggalKelas / usulanRapat", () => {
  it("daftar tanggal inklusif, lintas bulan; tanggal rusak -> kosong; dibatasi maks", () => {
    expect(tanggalKelas({ mulai: "2026-11-30", selesai: "2026-12-02" })).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(tanggalKelas({ mulai: "2026-11-03", selesai: "2026-11-02" })).toEqual([]);
    expect(tanggalKelas({ mulai: "", selesai: "2026-11-02" })).toEqual([]);
    expect(tanggalKelas({ mulai: "2026-01-01", selesai: "2026-12-31" }, 5)).toHaveLength(5);
  });
  it("hanya Daring/Hybrid; hari yang sudah punya rapat dilewati; judul bernomor hari bila lebih dari satu hari", () => {
    const d = ringkasKelas([
      mentah({ id: "a", nama: "Kelas A", metode: "Daring", mulai: "2026-11-02", selesai: "2026-11-03" }),
      mentah({ id: "b", nama: "Kelas B", metode: "Luring", mulai: "2026-11-02", selesai: "2026-11-02" }),
      mentah({ id: "c", nama: "Kelas C", metode: "Hybrid", mulai: "2026-11-05", selesai: "2026-11-05" }),
    ], false);
    const u = usulanRapat(d, ["2026-11-02"]);
    expect(u.map((x) => [x.kelas_nomor, x.tanggal, x.judul])).toEqual([
      [1, "2026-11-03", "Kelas A (Zoom) – hari ke-2"],
      [3, "2026-11-05", "Kelas C (Zoom)"],
    ]);
    expect(usulanRapat(d, ["2026-11-02", "2026-11-03", "2026-11-05"])).toEqual([]);
  });
});

describe("sebaranDenganPeran", () => {
  const d = ringkasKelas([mentah({ id: "a", untuk: ["ppl"] }), mentah({ id: "b", untuk: ["pml"] }), mentah({ id: "c", untuk: ["pml"] })], false);
  it("nomor eksplisit menang; peran satu kelas -> otomatis; peran dua kelas -> belum pasti; peran tanpa kelas -> belum", () => {
    const r = sebaranDenganPeran(d, [
      { peran: "ppl", kelas: null }, // otomatis -> kelas 1
      { peran: "ppl", kelas: 1 }, // eksplisit kelas 1
      { peran: "pml", kelas: 3 }, // eksplisit kelas 3
      { peran: "pml", kelas: null }, // dua kandidat -> tidak pasti
      { peran: "entri", kelas: null }, // tak ada kelas
      { peran: "ppl", kelas: 9 }, // di luar
    ]);
    expect([...r.per_kelas.entries()]).toEqual([[1, 2], [2, 0], [3, 1]]);
    expect(r.otomatis).toBe(1);
    expect(r.tanpa_kelas).toBe(2);
    expect(r.di_luar).toBe(1);
  });
  it("tanpa kelas sama sekali -> semua tanpa_kelas", () => {
    const r = sebaranDenganPeran([], [{ peran: "ppl", kelas: null }, { peran: "pml", kelas: 1 }]);
    expect(r.tanpa_kelas).toBe(1);
    expect(r.di_luar).toBe(1);
  });
});

describe("teksInfoPelatihan", () => {
  it("menyusun jadwal per kelas; Daring tanpa tempat, Luring/Hybrid dengan tempat", () => {
    const d = ringkasKelas([
      mentah({ id: "a", nama: "Kelas A", metode: "Daring", mulai: "2026-11-02", selesai: "2026-11-03" }),
      mentah({ id: "b", nama: "Kelas B", metode: "Luring", lokasi: "Aula BPS", mulai: "2026-11-05", selesai: "2026-11-05" }),
      mentah({ id: "c", nama: "Kelas C", metode: "", lokasi: "", mulai: "", selesai: "" }),
    ], false);
    expect(teksInfoPelatihan(d)).toBe("Kelas A: 2–3 Nov 2026, Daring (Zoom); Kelas B: 5 Nov 2026, Luring di Aula BPS; Kelas C");
  });
  it("kosong -> kosong; terlalu panjang dipotong pada batas kelas; satu kelas kepanjangan dipotong dengan elipsis", () => {
    expect(teksInfoPelatihan([])).toBe("");
    const d = ringkasKelas([mentah({ id: "a", nama: "A".repeat(30) }), mentah({ id: "b", nama: "B".repeat(30) })], false);
    expect(teksInfoPelatihan(d, 80)).not.toContain("BBBB");
    const panjang = ringkasKelas([mentah({ id: "a", nama: "X".repeat(100) })], false);
    const t = teksInfoPelatihan(panjang, 40);
    expect(t.length).toBe(40);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("opsiKelasPeran / tetapkanKelas", () => {
  const d = ringkasKelas([
    mentah({ id: "a", nama: "Kelas PPL", untuk: ["ppl"] }),
    mentah({ id: "b", nama: "Kelas PML 1", untuk: ["pml"], mulai: "2026-11-05", selesai: "2026-11-05" }),
    mentah({ id: "c", nama: "Kelas PML 2", untuk: ["pml", "ppl"], metode: "Daring", lokasi: "" }),
  ], false);
  it("opsi menurut peran", () => {
    expect(opsiKelasPeran(d, "ppl").map((k) => k.nomor)).toEqual([1, 3]);
    expect(opsiKelasPeran(d, "pml").map((k) => k.nomor)).toEqual([2, 3]);
    expect(opsiKelasPeran(d, "entri")).toEqual([]);
  });
  it("satu kelas -> otomatis; beberapa -> perlu pilih; pilihan harus salah satu opsi", () => {
    const satu = ringkasKelas([mentah({ id: "a", untuk: ["ppl"] }), mentah({ id: "b", untuk: ["pml"] })], false);
    expect(tetapkanKelas(satu, "ppl", null)).toEqual({ nomor: 1, perluPilih: false });
    expect(tetapkanKelas(satu, "pml", 1)).toEqual({ nomor: 2, perluPilih: false }); // pilihan diabaikan bila hanya satu opsi
    expect(tetapkanKelas(d, "ppl", null)).toEqual({ nomor: null, perluPilih: true });
    expect(tetapkanKelas(d, "ppl", 3)).toEqual({ nomor: 3, perluPilih: false });
    expect(tetapkanKelas(d, "ppl", 2)).toEqual({ nomor: null, perluPilih: true }); // kelas 2 bukan untuk PPL
    expect(tetapkanKelas(d, "ppl", Number.NaN)).toEqual({ nomor: null, perluPilih: true });
    expect(tetapkanKelas(d, "entri", 1)).toEqual({ nomor: null, perluPilih: false });
    expect(tetapkanKelas([], "ppl", 1)).toEqual({ nomor: null, perluPilih: false });
  });
  it("ringkasOpsi", () => {
    expect(ringkasOpsi(d[1])).toEqual({ nomor: 2, nama: "Kelas PML 1", metode: "Luring", jadwal: "5 Nov 2026", lokasi: "Hotel Contoh, Arosuka" });
  });
});
