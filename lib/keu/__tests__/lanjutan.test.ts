// lib/keu/__tests__/lanjutan.test.ts
//
// (25 Okt 2026, tahap 29) Uji identifikasi lanjutan: pemeriksa isi dan penentu status (kasus bersama dengan 51_uji_lanjutan.sql lewat lanjutan.vektor.json),
// isi awal dari identifikasi awal, normalisasi, peringatan terhadap lembar kebijakan, alasan Draf, dan rincian biaya.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, normalisasi, type Form } from "../identifikasi";
import { isiPredefined } from "../kebijakan";
import {
  ID_LJ, KODE_PERAN, MAKS_INSTRUKTUR, alasanDraf, awalLanjutan, hariKelas, idBaru, jadwalPendataan, jumlahPetugas, jumlahRincian, normalisasiLanjutan, periksaLanjutan,
  pesertaKelas, peringatanLanjutan, instrukturLengkap, rincianBiaya, statusLanjutan, tglValid, tujuanLanjutan, tarifHonor, TARIF_HONOR_BAWAAN, type IsiLanjutan,
} from "../lanjutan";

type Op = { op: "set" | "del" | "tambah" | "ganti"; path?: (string | number)[]; value?: unknown };
function terapkan(base: unknown, ops: Op[]): unknown {
  let x = JSON.parse(JSON.stringify(base));
  for (const o of ops) {
    if (o.op === "ganti") { x = o.value; continue; }
    const path = o.path ?? [];
    let p = x;
    for (let i = 0; i < path.length - 1; i++) p = p[path[i]];
    const akhir = path[path.length - 1];
    if (o.op === "set") p[akhir] = o.value;
    else if (o.op === "del") { if (Array.isArray(p)) p.splice(akhir as number, 1); else delete p[akhir]; }
    else if (o.op === "tambah") p[akhir].push(o.value);
  }
  return x;
}
const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("pemeriksa isi dan status: kasus bersama dengan 51_uji_lanjutan.sql", () => {
  for (const k of vektor.cases as { nama: string; ops: Op[]; galat: string[]; status?: string }[]) {
    it(k.nama, () => {
      const isi = terapkan(vektor.base, k.ops);
      expect([...periksaLanjutan(isi)].sort()).toEqual([...k.galat].sort());
      if (k.galat.length === 0) expect(statusLanjutan(isi as IsiLanjutan)).toBe(k.status);
    });
  }
  it("dasar lolos dan Final", () => {
    expect(periksaLanjutan(vektor.base)).toEqual([]);
    expect(statusLanjutan(vektor.base as IsiLanjutan)).toBe("final");
    expect(alasanDraf(vektor.base as IsiLanjutan)).toEqual([]);
  });
});

describe("tanggal", () => {
  it("tglValid", () => {
    expect(tglValid("2026-02-28")).toBe(true);
    expect(tglValid("2028-02-29")).toBe(true);
    expect(tglValid("2026-02-29")).toBe(false);
    expect(tglValid("2026-13-01")).toBe(false);
    expect(tglValid("26-01-01")).toBe(false);
    expect(tglValid("")).toBe(false);
  });
  it("hariKelas inklusif", () => {
    expect(hariKelas("2026-03-02", "2026-03-03")).toBe(2);
    expect(hariKelas("2026-03-02", "2026-03-02")).toBe(1);
    expect(hariKelas("2026-03-03", "2026-03-02")).toBe(0);
    expect(hariKelas("", "2026-03-02")).toBe(0);
  });
});

function formUji(): Form {
  const f = awalForm();
  f.nama = "UJI Survei"; f.periode = "Triwulanan"; f.keList = ["Triwulan I", "Triwulan II"];
  f.instrumen = "FASIH";
  f.sesi.pelatihan = { on: true, bentuk: "Luring", tempat: "Hotel dalam kota", tgl: { "Triwulan I": { mulai: "2026-03-02", selesai: "2026-03-03" }, "Triwulan II": { mulai: "2026-06-01", selesai: "2026-06-02" } }, pulsa: false, perl: false, pengajar: false };
  f.sesi.briefing = { on: true, bentuk: "Daring", tempat: "", tgl: { "Triwulan I": { mulai: "2026-03-04", selesai: "2026-03-04" } }, pulsa: true, perl: false, pengajar: false };
  f.peran.pml = { ...f.peran.pml, on: true, status: "Organik dan mitra", nOrg: 2, nMit: 3, perk: false, translok: true };
  f.peran.ppl = { ...f.peran.ppl, on: true, status: "Mitra", nOrg: 5, nMit: 4, perk: true, translok: false };
  return normalisasi(f);
}

describe("isi awal dari identifikasi awal", () => {
  const f = formUji();
  const a = awalLanjutan(f, 2026);
  it("lolos pemeriksa dan masih Draf", () => {
    expect(periksaLanjutan(a)).toEqual([]);
    expect(statusLanjutan(a)).toBe("draf");
  });
  it("kelas dibuat per sesi dan per periode, semua Perkiraan", () => {
    expect(a.kelas.map((k) => k.nama)).toEqual(["Briefing Triwulan I", "Briefing Triwulan II", "Pelatihan Triwulan I", "Pelatihan Triwulan II"]);
    expect(a.kelas.every((k) => !k.fix)).toBe(true);
    const p1 = a.kelas.find((k) => k.nama === "Pelatihan Triwulan I")!;
    expect(p1.metode).toBe("Luring"); expect(p1.tempat).toBe("Hotel dalam kota"); expect(p1.oh).toBe(2); expect(p1.mulai).toBe("2026-03-02");
    expect(new Set(a.kelas.map((k) => k.id)).size).toBe(a.kelas.length);
  });
  it("peran: Mitra mengosongkan organik, Fix mengikuti penanda Perkiraan", () => {
    expect(a.peran.pml).toMatchObject({ on: true, nOrg: 2, nMit: 3, translok: true, fix: true });
    expect(a.peran.ppl).toMatchObject({ on: true, nOrg: 0, nMit: 4, fix: false });
    expect(a.peran.supervisor.on).toBe(true);
    expect(a.peran.kortim.on).toBe(false);
  });
  it("petugas diturunkan dari jumlah, semua menyusul, mitra bersumber kepka", () => {
    const j = jumlahPetugas(a);
    expect(j.total).toBe(a.petugas.length);
    expect(j.menyusul).toBe(j.total);
    expect(a.petugas.filter((p) => p.peran === "pml" && p.status === "Organik")).toHaveLength(2);
    expect(a.petugas.filter((p) => p.peran === "pml" && p.status === "Mitra")).toHaveLength(3);
    expect(a.petugas.filter((p) => p.status === "Mitra").every((p) => p.sumber === "kepka")).toBe(true);
    expect(new Set(a.petugas.map((p) => p.id)).size).toBe(a.petugas.length);
  });
  it("survei yang berbagi sesi tidak menurunkan kelas", () => {
    const g = salin(f); g.berbagi = true;
    expect(awalLanjutan(g, 2026).kelas).toEqual([]);
  });
  it("peserta kelas = jumlah Fix peran yang diikuti", () => {
    const p1 = a.kelas.find((k) => k.nama === "Pelatihan Triwulan I")!;
    expect(pesertaKelas(a, p1)).toBe(a.peran.pml.nOrg + a.peran.pml.nMit + a.peran.ppl.nOrg + a.peran.ppl.nMit + a.peran.supervisor.nOrg + a.peran.supervisor.nMit);
  });
});

describe("normalisasi", () => {
  it("nilai hilang diisi bawaan", () => {
    const n = normalisasiLanjutan({});
    expect(n.kelas).toEqual([]); expect(n.petugas).toEqual([]);
    for (const k of KODE_PERAN) expect(n.peran[k]).toEqual({ on: false, nOrg: 0, nMit: 0, translok: false, penginapan: false, fix: false });
  });
  it("isi sah tidak berubah", () => {
    expect(normalisasiLanjutan(vektor.base)).toEqual(vektor.base);
  });
  it("jabatan dobel dan asing dibuang, status asing menjadi Organik", () => {
    const n = normalisasiLanjutan({ petugas: [{ id: "p1", nama: "A", status: "X", jabatan: ["ketua", "ketua", "bos"] }] });
    expect(n.petugas[0].jabatan).toEqual(["ketua"]); expect(n.petugas[0].status).toBe("Organik");
  });
});

describe("idBaru", () => {
  it("tidak memakai ulang id", () => {
    expect(idBaru("k", ["k1", "k2"])).toBe("k3");
    expect(idBaru("p", ["p2", "p1"])).toBe("p3");
    expect(idBaru("p", ["p3"])).toBe("p2");
  });
});

describe("peringatan terhadap lembar kebijakan", () => {
  const lembar = isiPredefined();
  const dasar = (): IsiLanjutan => salin(vektor.base) as IsiLanjutan;
  it("tanpa lembar berlaku: satu peringatan dan berhenti", () => {
    const w = peringatanLanjutan(dasar(), { lembar: null, dasarUsang: false, form: null });
    expect(w.some((x) => x.includes("Belum ada lembar kebijakan yang berlaku"))).toBe(true);
  });
  it("jabatan minimal pada strata kecil: S1 hanya butuh ketua", () => {
    const w = peringatanLanjutan(dasar(), { lembar, dasarUsang: false, form: null });
    expect(w.filter((x) => x.includes("minimal"))).toEqual([]);
  });
  it("S2 (5 petugas) butuh wakil dan PJ pengolahan", () => {
    const i = dasar();
    i.petugas.push({ id: "p5", nama: "Eka", menyusul: false, peran: "", status: "Organik", sumber: "", baru: false, jabatan: [] });
    const w = peringatanLanjutan(i, { lembar, dasarUsang: false, form: null });
    expect(w.some((x) => x.includes("Wakil: minimal 1 pada S2"))).toBe(true);
    expect(w.some((x) => x.includes("PJ pengolahan: minimal 1 pada S2"))).toBe(true);
  });
  it("rangkap melebihi batas dan jabatan yang tidak boleh dirangkap", () => {
    const i = dasar();
    i.petugas[0].jabatan = ["ketua", "wakil"];
    const w = peringatanLanjutan(i, { lembar, dasarUsang: false, form: null });
    expect(w.some((x) => x.includes("merangkap Wakil") || x.includes("merangkap"))).toBe(false); // S1: semua jabatan boleh dirangkap
    i.petugas.push(...[5, 6, 7, 8, 9].map((n) => ({ id: `p${n}`, nama: `T${n}`, menyusul: false, peran: "" as const, status: "Organik" as const, sumber: "" as const, baru: false, jabatan: [] })));
    const w2 = peringatanLanjutan(i, { lembar, dasarUsang: false, form: null });
    expect(w2.some((x) => x.includes("merangkap Wakil"))).toBe(true);
  });
  it("persen petugas baru", () => {
    const i = dasar();
    for (let n = 5; n <= 25; n++) i.petugas.push({ id: `p${n}`, nama: `T${n}`, menyusul: false, peran: "", status: "Organik", sumber: "", baru: n <= 15, jabatan: [] });
    const w = peringatanLanjutan(i, { lembar, dasarUsang: false, form: null });
    expect(w.some((x) => x.includes("Petugas baru") && x.includes("S4"))).toBe(true);
  });
  it("peserta kelas melebihi batas", () => {
    const i = dasar();
    i.peran.ppl.nMit = 40; i.peran.ppl.nOrg = 0;
    const w = peringatanLanjutan(i, { lembar, dasarUsang: false, form: null });
    expect(w.some((x) => x.includes("melebihi batas kebijakan 30"))).toBe(true);
  });
  it("hotel luar kota bila kebijakan melarang", () => {
    const l = salin(lembar); l.param.find((p) => p.k === "hotel_luar_kota")!.kebijakan = false;
    const i = dasar(); i.kelas[0].tempat = "Hotel luar kota";
    expect(peringatanLanjutan(i, { lembar: l, dasarUsang: false, form: null }).some((x) => x.includes("hotel luar kota tidak diperkenankan"))).toBe(true);
  });
  it("dasar usang dan wilayah kosong", () => {
    const i = dasar(); i.wilayah = "";
    const w = peringatanLanjutan(i, { lembar, dasarUsang: true, form: null });
    expect(w[0]).toContain("Identifikasi awal telah direvisi");
    expect(w.some((x) => x.includes("Wilayah tugas belum diisi"))).toBe(true);
  });
  it("identifikasi memuat pelatihan tanpa kelas", () => {
    const i = dasar(); i.kelas = [];
    const w = peringatanLanjutan(i, { lembar, dasarUsang: false, form: formUji() });
    expect(w.some((x) => x.includes("memuat pelatihan, tetapi belum ada kelasnya"))).toBe(true);
    expect(w.some((x) => x.includes("memuat briefing, tetapi belum ada kelasnya"))).toBe(true);
  });
  it("setiap peringatan dan alasan Draf punya tujuan", () => {
    const i = awalLanjutan(formUji(), 2026);
    const semua = [...peringatanLanjutan(i, { lembar, dasarUsang: true, form: formUji() }), ...alasanDraf(i)];
    for (const t of semua) expect(tujuanLanjutan(t), t).not.toBeNull();
    expect(Object.values(ID_LJ)).toContain(tujuanLanjutan("Wilayah tugas belum diisi"));
  });
});

describe("alasan Draf", () => {
  it("menyebut kelas, peran, dan nama yang menyusul", () => {
    const a = awalLanjutan(formUji(), 2026);
    const r = alasanDraf(a);
    expect(r.some((x) => x.includes("Pelatihan Triwulan I masih Perkiraan"))).toBe(true);
    expect(r.some((x) => x.includes("nama petugas masih menyusul"))).toBe(true);
    expect(r.some((x) => x.includes("PPL masih Perkiraan"))).toBe(true);
  });
  it("jumlah tercatat berbeda dari Fix", () => {
    const i = salin(vektor.base) as IsiLanjutan; i.petugas.pop();
    expect(alasanDraf(i).some((x) => x.includes("mitra tercatat 1 dari 2"))).toBe(true);
  });
});

describe("rincian biaya", () => {
  const lembar = isiPredefined();
  it("paket hotel tanpa tarif SBM: volume ada, jumlah belum", () => {
    const i = salin(vektor.base) as IsiLanjutan;
    const r = rincianBiaya(i, null, lembar);
    const paket = r.find((b) => b.uraian.includes("paket"))!;
    expect(paket.akun).toBe("524114");
    expect(paket.volume).toBe(pesertaKelas(i, i.kelas[0]) * 2);
    expect(paket.jumlah).toBeNull();
    expect(paket.catatan).toContain("Tarif SBM paket belum tersedia");
  });
  it("hotel luar kota memakai akun 524119", () => {
    const i = salin(vektor.base) as IsiLanjutan; i.kelas[0].tempat = "Hotel luar kota";
    expect(rincianBiaya(i, null, lembar).find((b) => b.uraian.includes("paket"))!.akun).toBe("524119");
  });
  it("pulsa peserta dihitung bila volume dan tarif diketahui", () => {
    const f = formUji(); f.sesi.pelatihan.pulsa = true;
    const i = salin(vektor.base) as IsiLanjutan; i.kelas[0].metode = "Hybrid";
    const b = rincianBiaya(i, f, lembar).find((x) => x.uraian.includes("pulsa peserta"))!;
    expect(b.tarif).toBe(100000);
    expect(b.volume).toBe(3);
    expect(b.jumlah).toBe(300000);
  });
  it("translok menampilkan tarif per hari tetapi jumlah menunggu jumlah hari", () => {
    const i = salin(vektor.base) as IsiLanjutan;
    const b = rincianBiaya(i, null, lembar).find((x) => x.uraian.startsWith("Translok PML (kurang"))!;
    expect(b.tarif).toBe(170000); expect(b.volume).toBe(2); expect(b.jumlah).toBeNull();
  });
  it("tanpa lembar kebijakan tarif kosong dengan catatan", () => {
    const f = formUji(); f.sesi.pelatihan.pulsa = true;
    const i = salin(vektor.base) as IsiLanjutan; i.kelas[0].metode = "Hybrid";
    const b = rincianBiaya(i, f, null).find((x) => x.uraian.includes("pulsa peserta"))!;
    expect(b.tarif).toBeNull(); expect(b.jumlah).toBeNull(); expect(b.catatan).toContain("belum ada pada lembar kebijakan");
  });
  it("jumlahRincian menjumlah yang terhitung saja", () => {
    const j = jumlahRincian([
      { kelompok: "Lain-lain", uraian: "a", akun: "1", volume: 1, satuan: "x", tarif: 5, jumlah: 5, catatan: "", perk: false },
      { kelompok: "Lain-lain", uraian: "b", akun: "1", volume: null, satuan: "x", tarif: 5, jumlah: null, catatan: "", perk: false },
    ]);
    expect(j).toEqual({ total: 5, terhitung: 1, belum: 1 });
  });
  it("konsumsi rapat evaluasi tatap muka muncul dengan tarif kebijakan", () => {
    const f = formUji();
    const r = rincianBiaya(salin(vektor.base) as IsiLanjutan, f, lembar).find((b) => b.uraian.includes("rapat evaluasi"));
    expect(r?.tarif).toBe(40000);
  });
});

describe("jadwal pendataan untuk surat", () => {
  it("memakai pembaruan H-15 bila ada", () => {
    const f = formUji();
    const j = jadwalPendataan(f, 2026, { "Triwulan I": { mulai: "2026-03-10", selesai: "2026-03-20" } });
    expect(j[0]).toEqual({ periode: "Triwulan I", mulai: "2026-03-10", selesai: "2026-03-20" });
    expect(j[1].periode).toBe("Triwulan II");
    expect(j[1].mulai).toMatch(/^2026-06-/);
  });
});

describe("instruktur kelas (28 Okt 2026)", () => {
  const formIns = (): Form => { const f = formUji(); f.sesi.pelatihan.pengajar = true; f.sesi.pelatihan.instr = { jumlah: 2, level: "Inda", asal: "Eksternal", jam: 8, perk: true }; return f; };
  it("isi awal: kelas pelatihan membawa instruktur dari identifikasi (nama kosong), briefing tidak", () => {
    const a = awalLanjutan(formIns(), 2026);
    const pel = a.kelas.filter((k) => k.sesi === "pelatihan");
    expect(pel.length).toBeGreaterThan(0);
    for (const k of pel) expect(k.instruktur).toEqual([{ nama: "", level: "Inda", asal: "Eksternal", jam: 4 }, { nama: "", level: "Inda", asal: "Eksternal", jam: 4 }]);
    for (const k of a.kelas.filter((x) => x.sesi === "briefing")) expect(k.instruktur).toEqual([]);
    expect(periksaLanjutan(a)).toEqual([]);
    expect(statusLanjutan(a)).toBe("draf");
  });
  it("isi awal: jam total kelas dibagi rata antar instruktur, sisa ke yang pertama", () => {
    const f = formIns(); f.sesi.pelatihan.instr = { jumlah: 3, level: "Innas", asal: "Internal BPS", jam: 8, perk: true };
    const k = awalLanjutan(f, 2026).kelas.find((x) => x.sesi === "pelatihan")!;
    expect(k.instruktur!.map((y) => y.jam)).toEqual([3, 3, 2]);
    expect(k.instruktur!.reduce((t, y) => t + y.jam, 0)).toBe(8);
  });
  it("tanpa pengajar atau jumlah 0: daftar kosong; jumlah dibatasi 20", () => {
    expect(awalLanjutan(formUji(), 2026).kelas.every((k) => (k.instruktur ?? []).length === 0)).toBe(true);
    const f = formIns(); f.sesi.pelatihan.instr.jumlah = 50;
    expect(awalLanjutan(f, 2026).kelas.find((k) => k.sesi === "pelatihan")!.instruktur).toHaveLength(MAKS_INSTRUKTUR);
  });
  it("normalisasi: isi lama tanpa kunci menjadi daftar kosong; nilai tak dikenal dibersihkan", () => {
    const lama = salin(vektor.base) as unknown as Record<string, unknown>;
    delete (lama.kelas as Record<string, unknown>[])[0].instruktur;
    expect(normalisasiLanjutan(lama).kelas[0].instruktur).toEqual([]);
    const kotor = salin(vektor.base) as unknown as { kelas: Record<string, unknown>[] };
    kotor.kelas[0].instruktur = [{ nama: "Ani", level: "Nasional", asal: "Swasta", jam: 9999 }, 7, { nama: 3, level: "Innas", asal: "Internal BPS", jam: 2.5 }];
    expect(normalisasiLanjutan(kotor).kelas[0].instruktur).toEqual([{ nama: "Ani", level: "", asal: "", jam: 500 }, { nama: "", level: "Innas", asal: "Internal BPS", jam: 2 }]);
  });
  it("instrukturLengkap", () => {
    expect(instrukturLengkap({ nama: "Budi", level: "Inda", asal: "Eksternal", jam: 1 })).toBe(true);
    expect(instrukturLengkap({ nama: " ", level: "Inda", asal: "Eksternal", jam: 1 })).toBe(false);
    expect(instrukturLengkap({ nama: "Budi", level: "", asal: "Eksternal", jam: 1 })).toBe(false);
    expect(instrukturLengkap({ nama: "Budi", level: "Inda", asal: "", jam: 1 })).toBe(false);
    expect(instrukturLengkap({ nama: "Budi", level: "Inda", asal: "Eksternal", jam: 0 })).toBe(false);
  });
  it("rincian biaya: honor per level dan asal; JP dijumlahkan; tarif Rp 111.000 per JP (bawaan bila lembar tanpa parameter)", () => {
    const i = salin(vektor.base) as IsiLanjutan;
    i.kelas[0].instruktur = [
      { nama: "Budi", level: "Inda", asal: "Eksternal", jam: 8 }, { nama: "Sari", level: "Inda", asal: "Eksternal", jam: 4 },
      { nama: "Eko", level: "Innas", asal: "Internal BPS", jam: 6 },
    ];
    const honor = rincianBiaya(i, null, isiPredefined()).filter((b) => b.kelompok === "Honor");
    expect(honor).toHaveLength(2);
    const inda = honor.find((b) => b.uraian.includes("Inda"))!;
    expect(inda).toMatchObject({ volume: 12, satuan: "JP", akun: "522151", tarif: 111000, jumlah: 1332000, perk: false });
    expect(inda.uraian).toBe("Pelatihan Triwulan I: honor instruktur Inda, Eksternal");
    expect(inda.catatan).toContain("2 instruktur, 12 JP");
    expect(inda.catatan).toContain("(lembar kebijakan)");
    const tanpaLembar = rincianBiaya(i, null, null).find((b) => b.uraian.includes("Inda"))!;
    expect(tanpaLembar).toMatchObject({ tarif: 111000, jumlah: 1332000 });
    expect(tanpaLembar.catatan).toContain("bawaan, cek aturan");
    expect(honor.find((b) => b.uraian.includes("Innas"))).toMatchObject({ volume: 6, tarif: 111000, jumlah: 666000, perk: false });
    i.kelas[0].instruktur![2].nama = "";
    expect(rincianBiaya(i, null, isiPredefined()).find((b) => b.uraian.includes("Innas"))!.perk).toBe(true);
  });
  it("tarif honor: dari lembar kebijakan (nilai kebijakan), bawaan bila tidak ada, kosong bila level belum dipilih", () => {
    const lembar = isiPredefined();
    expect(tarifHonor(lembar, "Innas").tarif).toBe(111000);
    expect(tarifHonor(lembar, "Inda").catatan).toContain("lembar kebijakan");
    lembar.param.find((x) => x.k === "honor_inda")!.kebijakan = 100000;
    expect(tarifHonor(lembar, "Inda").tarif).toBe(100000);
    expect(tarifHonor(lembar, "Innas").tarif).toBe(111000);
    lembar.param = lembar.param.filter((x) => x.k !== "honor_innas" && x.k !== "honor_inda");
    expect(tarifHonor(lembar, "Innas")).toMatchObject({ tarif: TARIF_HONOR_BAWAAN });
    expect(tarifHonor(null, "Inda").tarif).toBe(111000);
    expect(tarifHonor(lembar, "").tarif).toBeNull();
  });
  it("rincian biaya: tarif honor mengikuti lembar kebijakan; level belum dipilih tanpa jumlah", () => {
    const i = salin(vektor.base) as IsiLanjutan;
    i.kelas[0].instruktur = [{ nama: "Budi", level: "Inda", asal: "Eksternal", jam: 5 }, { nama: "Sari", level: "", asal: "Eksternal", jam: 3 }];
    const lembar = isiPredefined(); lembar.param.find((x) => x.k === "honor_inda")!.kebijakan = 100000;
    const honor = rincianBiaya(i, null, lembar).filter((b) => b.kelompok === "Honor");
    expect(honor.find((b) => b.uraian.includes("Inda"))).toMatchObject({ volume: 5, tarif: 100000, jumlah: 500000 });
    expect(honor.find((b) => b.uraian.includes("belum dipilih"))).toMatchObject({ volume: 3, tarif: null, jumlah: null, perk: true });
  });
  it("rincian biaya: tanpa daftar instruktur tetap memakai baris honor umum bila identifikasi memuat pengajar", () => {
    const i = salin(vektor.base) as IsiLanjutan; i.kelas[0].instruktur = [];
    const f = formIns();
    const honor = rincianBiaya(i, f, isiPredefined()).filter((b) => b.kelompok === "Honor" && b.akun === "522151");
    expect(honor).toHaveLength(1);
    expect(honor[0].uraian).toContain("honor pengajar atau narasumber eksternal");
  });
  it("rincian biaya: honor petugas (29 Okt 2026) per peran berhonor, mitra dan organik terpisah, tarif kosong", () => {
    const f = formIns(); f.peran.pml.honor = true; f.peran.ppl.honor = true;
    const i = salin(vektor.base) as IsiLanjutan; // pml 1 organik + 1 mitra, ppl 2 mitra
    const honor = rincianBiaya(i, f, isiPredefined()).filter((b) => b.akun === "521213");
    expect(honor.map((b) => [b.uraian, b.volume, b.satuan, b.tarif, b.jumlah])).toEqual([
      ["Honor PML (mitra)", 1, "orang", null, null], ["Honor PML (organik)", 1, "orang", null, null], ["Honor PPL (mitra)", 2, "orang", null, null],
    ]);
    expect(honor.every((b) => b.kelompok === "Honor")).toBe(true);
    f.peran.pml.honor = false; f.peran.ppl.honor = false;
    expect(rincianBiaya(i, f, isiPredefined()).filter((b) => b.akun === "521213")).toEqual([]);
    expect(rincianBiaya(i, null, null).filter((b) => b.akun === "521213")).toEqual([]);
  });
  it("peringatan: belum diisi pada kelas, dan instruktur belum lengkap", () => {
    const f = formIns();
    const i = salin(vektor.base) as IsiLanjutan; i.kelas[0].instruktur = [];
    expect(peringatanLanjutan(i, { lembar: null, dasarUsang: false, form: f }).some((w) => w.includes("identifikasi awal memuat instruktur"))).toBe(true);
    i.kelas[0].instruktur = [{ nama: "", level: "Inda", asal: "Eksternal", jam: 8 }, { nama: "Sari", level: "Inda", asal: "Eksternal", jam: 4 }];
    const w = peringatanLanjutan(i, { lembar: null, dasarUsang: false, form: f });
    expect(w.some((x) => x.includes("1 instruktur belum lengkap"))).toBe(true);
    expect(w.some((x) => x.includes("identifikasi awal memuat instruktur"))).toBe(false);
  });
});
