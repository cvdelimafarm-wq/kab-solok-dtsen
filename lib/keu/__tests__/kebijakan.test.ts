// lib/keu/__tests__/kebijakan.test.ts
//
// (25 Okt 2026, tahap 28; 28 Okt: parameter opsional hari_bayar_maks menggantikan hari_cair_maks) Uji lembar kebijakan manajemen tim: angka predefined, pemeriksa isi, keterangan yang dibangkitkan, dan penentu tombol.
// Vektor kasus (kebijakan.vektor.json) dipakai SAMA PERSIS oleh 50_uji_kebijakan.sql sehingga pemeriksa TypeScript dan SQL terbukti sepaham.

import { describe, expect, it } from "vitest";
import vektor from "./kebijakan.vektor.json";
import {
  HAK_KOSONG, JABATAN, KODE_JABATAN, KODE_PARAM, KODE_PARAM_LAMA, KODE_PARAM_OPSIONAL, KODE_STRATA, aksiTersedia, isiPredefined, ketMinimal, ketStrata, labelNilai, labelStatus,
  kalimatMenunggu, kanonik, nilaiPersen, pilihLembar, periksaIsi, tujuanGalat, ID_BAGIAN, rentangStrata, ringkasPengesahan, strataUntuk, totalMinimal,
  type BarisPengesah, type HakKebijakan, type IsiKebijakan,
} from "../kebijakan";

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

describe("angka predefined", () => {
  it("sama dengan basis vektor bersama TS-SQL dan lolos pemeriksa tanpa galat", () => {
    expect(isiPredefined()).toEqual(vektor.base);
    expect(periksaIsi(isiPredefined()).galat).toEqual([]);
  });
  it("memuat 9 strata, 10 jabatan, 21 parameter wajib, dan 1 parameter opsional", () => {
    const i = isiPredefined();
    expect(i.strata.map((s) => s.k)).toEqual([...KODE_STRATA]);
    expect(JABATAN).toHaveLength(10);
    expect(KODE_PARAM).toHaveLength(21);
    expect(KODE_PARAM_OPSIONAL).toEqual(["hari_bayar_maks"]);
    expect(KODE_PARAM_LAMA).toEqual(["hari_cair_maks"]);
    expect(i.param.map((x) => x.k)).toEqual([...KODE_PARAM, ...KODE_PARAM_OPSIONAL]);
    const hb = i.param.find((x) => x.k === "hari_bayar_maks")!;
    expect(hb.jenis === "angka" && hb.aturan === 10 && hb.kebijakan === 10).toBe(true);
    const sp = i.param.find((x) => x.k === "batas_spj")!;
    expect(sp.jenis === "angka" && sp.aturan === 5 && sp.kebijakan === 5 && sp.satuan === "hari kerja").toBe(true);
  });
  it("menyalin angka tabel V1 bagian 6.1 (jumlah minimal per jabatan)", () => {
    const i = isiPredefined();
    const baris = (s: (typeof KODE_STRATA)[number]) => [i.minimal[s].ketua, i.minimal[s].wakil, i.minimal[s].pj_pengolahan, i.minimal[s].pj_kualitas, i.minimal[s].pj_lapangan, i.minimal[s].pj_admin, i.minimal[s].pj_logistik, i.minimal[s].pj_sdm];
    expect(baris("S1")).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(baris("S3")).toEqual([1, 1, 1, 1, 0, 1, 0, 0]);
    expect(baris("S4")).toEqual([1, 1, 1, 2, 1, 1, 0, 0]);
    expect(baris("S7")).toEqual([1, 2, 2, 3, 5, 3, 1, 1]);
    expect(baris("S9")).toEqual([1, 4, 3, 4, 12, 6, 3, 3]);
    for (const s of KODE_STRATA) { expect(i.minimal[s].inda).toBe(0); expect(i.minimal[s].innas).toBe(0); }
    expect(i.strata.map((s) => s.maks_jabatan)).toEqual([5, 4, 3, 3, 2, 2, 2, 1, 1]);
    expect(i.strata.map((s) => s.persen_baru)).toEqual([null, null, null, 20, 20, 15, 10, 10, 5]);
  });
  it("matriks rangkap mengikuti V1 bagian 6.2", () => {
    const i = isiPredefined();
    expect(i.rangkap.S1).toHaveLength(10);
    expect(i.rangkap.S2).not.toContain("wakil");
    expect(i.rangkap.S2).toHaveLength(9);
    expect(i.rangkap.S3).not.toContain("pj_pengolahan");
    expect(i.rangkap.S4).toEqual(["ketua", "pj_kualitas", "pj_lapangan", "pj_logistik", "pj_sdm", "inda"]);
    expect(i.rangkap.S7).toEqual(["ketua", "inda"]);
    expect(i.rangkap.S8).toEqual(["ketua"]);
    expect(i.rangkap.S9).toEqual(["ketua"]);
  });
  it("kebijakan awal sama dengan aturan, dan semua jabatan terdaftar", () => {
    for (const x of isiPredefined().param) if (x.jenis === "angka" || x.jenis === "persen" || x.jenis === "yatidak") expect(x.kebijakan).toEqual(x.aturan);
    for (const s of KODE_STRATA) for (const j of isiPredefined().rangkap[s]) expect(KODE_JABATAN).toContain(j);
  });
  it("peringatan: tabel rujukan belum diunggah dan dasar aturan belum diisi (tidak memblokir)", () => {
    const h = periksaIsi(isiPredefined());
    expect(h.galat).toEqual([]);
    expect(h.peringatan.filter((x) => x.includes("tabel rujukan belum diunggah"))).toHaveLength(3);
    expect(h.peringatan.some((x) => x.includes("parameter belum mencantumkan dasar aturan"))).toBe(true);
  });
});

describe("pemeriksa isi: kasus bersama dengan 50_uji_kebijakan.sql", () => {
  for (const k of vektor.cases as { nama: string; ops: Op[]; galat: string[] }[]) {
    it(k.nama, () => {
      const isi = terapkan(vektor.base, k.ops);
      expect([...periksaIsi(isi).galat].sort()).toEqual([...k.galat].sort());
    });
  }
});

describe("keterangan yang dibangkitkan dari angka", () => {
  const i = isiPredefined();
  it("rentang strata", () => {
    expect(rentangStrata(i.strata[0])).toBe("1–4 petugas");
    expect(rentangStrata(i.strata[8])).toBe("di atas 400 petugas");
  });
  it("strata menurut jumlah petugas", () => {
    expect(strataUntuk(i, 1)?.k).toBe("S1");
    expect(strataUntuk(i, 4)?.k).toBe("S1");
    expect(strataUntuk(i, 5)?.k).toBe("S2");
    expect(strataUntuk(i, 19)?.k).toBe("S3");
    expect(strataUntuk(i, 20)?.k).toBe("S4");
    expect(strataUntuk(i, 400)?.k).toBe("S8");
    expect(strataUntuk(i, 401)?.k).toBe("S9");
    expect(strataUntuk(i, 5000)?.k).toBe("S9");
    expect(strataUntuk(i, 0)).toBeNull();
  });
  it("minimal dan total", () => {
    expect(ketMinimal(i, "S1")).toBe("Minimal 1 Ketua.");
    expect(ketMinimal(i, "S2")).toBe("Minimal 1 Ketua, 1 Wakil, 1 PJ pengolahan.");
    expect(totalMinimal(i, "S9")).toBe(36);
    expect(totalMinimal(i, "S1")).toBe(1);
  });
  it("keterangan strata memuat rangkap, pengembangan, dan persen baru", () => {
    const s1 = ketStrata(i, "S1").join(" ");
    expect(s1).toContain("Semua jabatan boleh dirangkap.");
    expect(s1).toContain("Boleh menjadi sasaran pengembangan");
    const s5 = ketStrata(i, "S5").join(" ");
    expect(s5).toContain("Tidak boleh menjadi tempat uji coba");
    expect(s5).toContain("Petugas baru paling banyak 20%");
    expect(s5).toContain("Satu orang paling banyak memegang 2 jabatan.");
  });
  it("label nilai dan persen dari parameter acuan", () => {
    const uh = i.param.find((x) => x.k === "uang_harian")!;
    expect(labelNilai(uh, 380000)).toBe("Rp380.000 per hari");
    expect(labelNilai(i.param.find((x) => x.k === "hari_konsultasi")!, 2)).toBe("2 hari");
    expect(labelNilai(i.param.find((x) => x.k === "maks_hari_translok")!, null)).toBe("Tanpa batas");
    expect(labelNilai(i.param.find((x) => x.k === "hotel_luar_kota")!, true)).toBe("Ya");
    expect(nilaiPersen(i, "translok_lebih_8")).toBe(228000);
    const j = JSON.parse(JSON.stringify(i)) as IsiKebijakan;
    j.param.find((x) => x.k === "uang_harian")!.kebijakan = 350000;
    expect(nilaiPersen(j, "translok_lebih_8")).toBe(210000);
    expect(nilaiPersen(i, "uang_harian")).toBeNull();
  });
});

const pg = (peran: BarisPengesah["peran_kode"], akun: number, setuju: boolean, aktif = true): BarisPengesah =>
  ({ lembar_id: 1, peran_kode: peran, akun_id: akun, akun_nama: `Akun ${akun}`, aktif, setuju_at: setuju ? "2026-10-25T00:00:00Z" : null, catatan: "" });

describe("ringkasPengesahan: semua ketua tim, satu PPK, satu KPA", () => {
  it("lengkap bila semua ketua + minimal satu PPK + minimal satu KPA setuju", () => {
    expect(ringkasPengesahan([pg("KETUA", 1, true), pg("KETUA", 2, true), pg("PPK", 3, true), pg("KPA", 4, true)]).lengkap).toBe(true);
  });
  it("belum lengkap bila satu ketua belum setuju", () => {
    const r = ringkasPengesahan([pg("KETUA", 1, true), pg("KETUA", 2, false), pg("PPK", 3, true), pg("KPA", 4, true)]);
    expect(r.lengkap).toBe(false);
    expect(r.menunggu).toEqual(["Ketua tim Akun 2"]);
  });
  it("PPK dan KPA cukup salah satu akun", () => {
    const r = ringkasPengesahan([pg("KETUA", 1, true), pg("PPK", 3, false), pg("PPK", 5, true), pg("KPA", 4, true)]);
    expect(r.lengkap).toBe(true);
  });
  it("satu akun yang memegang semua peran cukup menyetujui sekali", () => {
    expect(ringkasPengesahan([pg("KETUA", 9, true), pg("PPK", 9, true), pg("KPA", 9, true)]).lengkap).toBe(true);
    expect(ringkasPengesahan([pg("KETUA", 9, false), pg("PPK", 9, false), pg("KPA", 9, false)]).menunggu).toHaveLength(3);
  });
  it("baris tidak aktif diabaikan; daftar kosong tidak pernah lengkap", () => {
    expect(ringkasPengesahan([pg("KETUA", 1, true), pg("KETUA", 2, false, false), pg("PPK", 3, true), pg("KPA", 4, true)]).lengkap).toBe(true);
    const k = ringkasPengesahan([]);
    expect(k.lengkap).toBe(false);
    expect(k.menunggu).toHaveLength(3);
  });
});

describe("aksiTersedia", () => {
  const hakSusun: HakKebijakan = { ...HAK_KOSONG, susun: true, akun: 7 };
  const hakKetua: HakKebijakan = { ...HAK_KOSONG, ketua: true, akun: 1 };
  it("draf: penyusun menyimpan, mengajukan, membatalkan; bukan penyusun tidak punya aksi", () => {
    expect(aksiTersedia({ status: "draf", diajukan_oleh: null }, hakSusun, [])).toEqual(["simpan", "ajukan", "batal"]);
    expect(aksiTersedia({ status: "draf", diajukan_oleh: null }, hakKetua, [])).toEqual([]);
  });
  it("menunggu: pengesah menyetujui atau mengembalikan; penyusun menarik selama belum ada yang setuju", () => {
    const daftar = [pg("KETUA", 1, false), pg("PPK", 3, false), pg("KPA", 4, false)];
    expect(aksiTersedia({ status: "menunggu", diajukan_oleh: 7 }, hakKetua, daftar)).toEqual(["setuju", "kembalikan"]);
    expect(aksiTersedia({ status: "menunggu", diajukan_oleh: 7 }, hakSusun, daftar)).toEqual(["tarik"]);
    const sebagian = [pg("KETUA", 1, true), pg("PPK", 3, false), pg("KPA", 4, false)];
    expect(aksiTersedia({ status: "menunggu", diajukan_oleh: 7 }, hakKetua, sebagian)).toEqual(["kembalikan"]);
    expect(aksiTersedia({ status: "menunggu", diajukan_oleh: 7 }, hakSusun, sebagian)).toEqual([]);
  });
  it("berlaku: penyusun dapat membuka revisi; arsip tanpa aksi", () => {
    expect(aksiTersedia({ status: "berlaku", diajukan_oleh: 7 }, hakSusun, [])).toEqual(["revisi"]);
    expect(aksiTersedia({ status: "arsip", diajukan_oleh: 7 }, hakSusun, [])).toEqual([]);
  });
  it("label status", () => {
    expect(labelStatus("berlaku").teks).toBe("Berlaku");
    expect(labelStatus("draf").teks).toBe("Draf (belum sah)");
  });
});

describe("tujuanGalat: kalimat menuju kartu terkait", () => {
  it("memetakan galat ke bagian dan baris parameter", () => {
    expect(tujuanGalat("Parameter uang_harian: nilai kebijakan lebih longgar dari aturan")).toBe("kb-par-uang_harian");
    expect(tujuanGalat("Rangkap S2: jabatan tukang tidak dikenal")).toBe(ID_BAGIAN.rangkap);
    expect(tujuanGalat("Kompetensi: ambang ketat harus bilangan bulat 1 atau lebih")).toBe(ID_BAGIAN.kompetensi);
    expect(tujuanGalat("Rentang S4 tidak menyambung dengan strata sebelumnya")).toBe(ID_BAGIAN.susunan);
    expect(tujuanGalat("Ketua pada S3 minimal 1")).toBe(ID_BAGIAN.susunan);
    expect(tujuanGalat("Minimal PJ administrasi pada S5 harus bilangan bulat 0 atau lebih")).toBe(ID_BAGIAN.susunan);
    expect(tujuanGalat("Penginapan: tabel rujukan belum diunggah")).toBe(ID_BAGIAN.anggaran);
    expect(tujuanGalat("16 parameter belum mencantumkan dasar aturan (pasal atau juknis)")).toBe(ID_BAGIAN.anggaran);
    expect(tujuanGalat("Tanggal rapat wajib diisi")).toBe(ID_BAGIAN.pengesahan);
    expect(tujuanGalat("sesuatu yang lain")).toBeNull();
  });
  it("setiap galat pemeriksa pada vektor bersama punya tujuan", () => {
    for (const k of vektor.cases as { galat: string[] }[]) for (const g of k.galat) if (g !== "Isi lembar harus berupa objek") expect(tujuanGalat(g), g).not.toBeNull();
  });
});

describe("kanonik dan pilihLembar", () => {
  it("dua isi sama dengan urutan kunci berbeda dianggap sama", () => {
    const a = isiPredefined();
    const b = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    const terbalik = Object.fromEntries(Object.entries(b).reverse());
    expect(kanonik(terbalik)).toBe(kanonik(a));
    const c = JSON.parse(JSON.stringify(a)) as IsiKebijakan;
    c.param[4].kebijakan = 1;
    expect(kanonik(c)).not.toBe(kanonik(a));
  });
  it("memilih lembar default", () => {
    const v = [{ id: 1, ver: 1, status: "arsip" }, { id: 2, ver: 2, status: "berlaku" }, { id: 3, ver: 3, status: "draf" }, { id: 4, ver: 4, status: "dibatalkan" }];
    expect(pilihLembar(v, true)).toBe(3);
    expect(pilihLembar(v, false)).toBe(2);
    expect(pilihLembar([{ id: 1, ver: 1, status: "arsip" }], false)).toBe(1);
    expect(pilihLembar([], true)).toBeNull();
    expect(pilihLembar([{ id: 9, ver: 1, status: "dibatalkan" }], true)).toBeNull();
  });
});

describe("kalimatMenunggu: tanpa titik ganda", () => {
  it("menghapus titik akhir dari nama bergelar", () => {
    expect(kalimatMenunggu(["Ketua tim M. Iqbal Hadi, SST.", "PPK Ani, S.E."])).toBe("Ketua tim M. Iqbal Hadi, SST.; PPK Ani, S.E");
  });
  it("tidak mengubah butir tanpa titik akhir", () => {
    expect(kalimatMenunggu(["Kepala (KPA)"])).toBe("Kepala (KPA)");
  });
});
