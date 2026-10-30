import { describe, expect, it } from "vitest";
import {
  KOLOM_TEMPLAT_SAMPEL, MAKS_BARIS_SAMPEL, bacaKodeWilayah, bacaKonfigSampel, bacaStatusSampel, cadanganTersedia, cocokkanNama, cocokkanPetugasSampel, kelompokPpl, kelompokSls,
  ketModulSampel, kodeSls, normNama, periksaAlokasi, periksaBarisSampel, periksaPermintaanGanti, petaKolomSampel, rekapSampel, templatSampel, type BarisSampelCocok, type SampelRow,
} from "../sampelSls";

const B = (o: Record<string, unknown> = {}) => ({
  "Kode Wilayah": "1303010001000100",
  "Nama Responden": "Budi",
  "Nama Anggota Ruta Lain": "",
  "Status Sampel": "Utama",
  Latitude: "-0,7894",
  Longitude: "100.6502",
  "Nama PPL": "Siti Aminah",
  "Nama PML": "Rudi Hartono",
  ...o,
});

describe("kolom dan status", () => {
  it("judul kolom tidak membedakan huruf besar kecil dan tanda baca", () => {
    const p = petaKolomSampel(["KODE_WILAYAH", "nama responden", "Nama Anggota Ruta Lain (opsional)", "status sampel", "lat", "Long", "Nama  PPL", "nama pml"]);
    expect(p).toMatchObject({ kode: "KODE_WILAYAH", responden: "nama responden", status: "status sampel", lat: "lat", lng: "Long", ppl: "Nama  PPL", pml: "nama pml" });
    expect(p.anggota).toBe("Nama Anggota Ruta Lain (opsional)");
  });
  it("status Utama dan Cadangan dengan beberapa tulisan", () => {
    expect(bacaStatusSampel("Utama")).toBe("utama");
    expect(bacaStatusSampel(" sampel utama ")).toBe("utama");
    expect(bacaStatusSampel("CADANGAN")).toBe("cadangan");
    expect(bacaStatusSampel("Pengganti")).toBe("cadangan");
    expect(bacaStatusSampel("lain")).toBeNull();
  });
  it("kode wilayah 10-16 digit; angka ilmiah ditolak dengan petunjuk", () => {
    expect(bacaKodeWilayah("1303010001000100")).toEqual({ ok: true, kode: "1303010001000100" });
    expect(bacaKodeWilayah("1303010001")).toEqual({ ok: true, kode: "1303010001" });
    expect(bacaKodeWilayah("1.30301E+15")).toMatchObject({ ok: false });
    expect(bacaKodeWilayah("13030")).toMatchObject({ ok: false });
    expect(bacaKodeWilayah("")).toMatchObject({ ok: false });
    expect(kodeSls("1303010001000102")).toBe("13030100010001");
    expect(kodeSls("1303010001")).toBe("1303010001");
  });
});

describe("periksaBarisSampel", () => {
  it("membaca baris sah, koma desimal, dan memotong ke SLS", () => {
    const r = periksaBarisSampel([B(), B({ "Nama Responden": "Cici", "Status Sampel": "Cadangan", Latitude: "", Longitude: "", "Nama Anggota Ruta Lain": "Dedi" })]);
    expect(r.galat).toEqual([]);
    expect(r.baris).toHaveLength(2);
    expect(r.baris[0]).toMatchObject({ kode_sls: "13030100010001", lat: -0.7894, lng: 100.6502, status: "utama", anggota_lain: null });
    expect(r.baris[1]).toMatchObject({ status: "cadangan", lat: null, lng: null, anggota_lain: "Dedi" });
  });
  it("nomor baris Excel menyertai tiap baris hasil", () => {
    const r = periksaBarisSampel([B(), B({ "Status Sampel": "x" }), B({ "Nama Responden": "Cici" })]);
    expect(r.nomor).toEqual([2, 4]);
  });
  it("baris kosong dilewati; nomor galat = nomor baris Excel", () => {
    const r = periksaBarisSampel([B(), B({ "Kode Wilayah": "", "Nama Responden": "", "Status Sampel": "", "Nama PPL": "", "Nama PML": "", Latitude: "", Longitude: "" }), B({ "Status Sampel": "mungkin" })]);
    expect(r.dilewati).toBe(1);
    expect(r.galat).toHaveLength(1);
    expect(r.galat[0].baris).toBe(4);
    expect(r.galat[0].pesan).toContain("Status Sampel");
  });
  it("kolom wajib hilang dilaporkan sekali", () => {
    const { ["Nama PML"]: _x, ...tanpaPml } = B();
    const r = periksaBarisSampel([tanpaPml]);
    expect(r.baris).toEqual([]);
    expect(r.galat).toHaveLength(1);
    expect(r.galat[0].pesan).toContain("Nama PML");
  });
  it("koordinat bermasalah menjadi peringatan dan koordinat dibuang, baris tetap masuk", () => {
    const r = periksaBarisSampel([B({ Latitude: "100.65", Longitude: "-0.78" }), B({ "Nama Responden": "X", Latitude: "abc" }), B({ "Nama Responden": "Y", Longitude: "" })]);
    expect(r.galat).toEqual([]);
    expect(r.baris.map((b) => b.lat)).toEqual([null, null, null]);
    expect(r.peringatan).toHaveLength(3);
    expect(r.peringatan[0].pesan).toContain("tertukar");
  });
  it("baris ganda diperingatkan, bukan ditolak", () => {
    const r = periksaBarisSampel([B(), B()]);
    expect(r.baris).toHaveLength(2);
    expect(r.peringatan[0].pesan).toContain("baris 2");
  });
  it("berkas kosong atau terlalu besar ditolak", () => {
    expect(periksaBarisSampel([]).galat[0].pesan).toContain("tidak berisi");
    const besar = Array.from({ length: MAKS_BARIS_SAMPEL + 1 }, () => B());
    expect(periksaBarisSampel(besar).galat[0].pesan).toContain("batas");
  });
  it("templat memuat semua kolom baku dan dapat dibaca kembali tanpa galat setelah baris contoh dipakai", () => {
    const t = templatSampel();
    expect(t[0]).toEqual([...KOLOM_TEMPLAT_SAMPEL]);
    const objek = t.slice(1).map((b) => Object.fromEntries(t[0].map((k, i) => [k, b[i]])));
    const r = periksaBarisSampel(objek);
    expect(r.galat).toEqual([]);
    expect(r.baris).toHaveLength(3);
  });
});

describe("pencocokan nama", () => {
  const kand = [
    { id: 1, nama: "Siti Aminah" },
    { id: 2, nama: "Faisal Siddiq, S.Tr.Stat." },
    { id: 3, nama: "Rudi Hartono" },
    { id: 4, nama: "Rudi Santoso" },
    { id: 5, nama: "Ayu Sepriani" },
    { id: 6, nama: "Ayu Sepriani Putri" },
  ];
  it("normalisasi membuang gelar, tanda baca, dan huruf besar", () => {
    expect(normNama("Faisal Siddiq, S.Tr.Stat.")).toBe("faisal siddiq");
    expect(normNama("  SITI   aminah ")).toBe("siti aminah");
    expect(normNama("Mailani Putri, S.Stat.")).toBe("mailani putri");
  });
  it("sama persis menang, gelar boleh berbeda", () => {
    expect(cocokkanNama("faisal siddiq", kand)).toMatchObject({ ok: true, id: 2, mirip: false });
    expect(cocokkanNama("SITI AMINAH", kand)).toMatchObject({ ok: true, id: 1 });
  });
  it("nama persis mengalahkan nama yang lebih panjang yang memuatnya", () => {
    expect(cocokkanNama("Ayu Sepriani", kand)).toMatchObject({ ok: true, id: 5, mirip: false });
  });
  it("kemiripan hanya diterima bila tunggal dan minimal dua kata", () => {
    expect(cocokkanNama("Siti", kand)).toMatchObject({ ok: false, alasan: "tidak_ada" });
    expect(cocokkanNama("Siti Aminah Zahra", kand)).toMatchObject({ ok: true, id: 1, mirip: true });
    expect(cocokkanNama("Rudi", kand)).toMatchObject({ ok: false });
  });
  it("dua akun bernama sama = ganda", () => {
    const r = cocokkanNama("Rudi Hartono", [...kand, { id: 9, nama: "Rudi Hartono" }]);
    expect(r).toMatchObject({ ok: false, alasan: "ganda" });
  });
  it("cocokkanPetugasSampel memetakan, melaporkan yang tidak cocok, dan mengabaikan baris tersaring lewat nomor", () => {
    const baris = periksaBarisSampel([B(), B({ "Nama Responden": "Z", "Nama PPL": "Orang Asing" }), B({ "Nama Responden": "W", "Nama PML": "rudi hartono" })]).baris;
    const r = cocokkanPetugasSampel(baris, [{ id: 1, nama: "Siti Aminah" }], [{ id: 3, nama: "Rudi Hartono" }]);
    expect(r.cocok).toHaveLength(2);
    expect(r.cocok[0]).toMatchObject({ ppl_akun_id: 1, pml_akun_id: 3 });
    expect(r.galat).toHaveLength(1);
    expect(r.galat[0]).toMatchObject({ baris: 3 });
    expect(r.galat[0].pesan).toContain("Orang Asing");
    expect(r.pemetaan.filter((p) => p.peran === "ppl")).toHaveLength(2);
    const lain = cocokkanPetugasSampel(baris, [{ id: 1, nama: "Siti Aminah" }], [{ id: 3, nama: "Rudi Hartono" }], [10, 11, 12]);
    expect(lain.galat[0].baris).toBe(11);
  });
});

const S = (id: number, o: Partial<SampelRow> = {}): SampelRow => ({
  id,
  urut: id,
  kode_wilayah: "1303010001000100",
  kode_sls: "13030100010001",
  nama_responden: `R${id}`,
  anggota_lain: null,
  status: "utama",
  lat: null,
  lng: null,
  ppl_nama: "Siti Aminah",
  pml_nama: "Rudi Hartono",
  ppl_akun_id: 1,
  pml_akun_id: 3,
  menggantikan_id: null,
  alasan: null,
  diganti_at: null,
  diganti_oleh: null,
  ...o,
});

describe("alokasi", () => {
  const cocok = (n: number, o: Partial<BarisSampelCocok> = {}): BarisSampelCocok[] =>
    Array.from({ length: n }, (_, i) => ({ kode_wilayah: "1", kode_sls: "A", nama_responden: `r${i}`, anggota_lain: null, status: "utama" as const, lat: null, lng: null, ppl_nama: "P1", pml_nama: "M1", ppl_akun_id: 1, pml_akun_id: 3, ...o }));
  it("tanpa masalah = tanpa peringatan", () => {
    expect(periksaAlokasi([...cocok(10), ...cocok(2, { status: "cadangan" })], { target_per_sls: 10, maks_sls_per_ppl: 2, boleh_ganti: true })).toEqual([]);
  });
  it("memeriksa target, SLS ganda PPL, PPL kelebihan SLS, PPL pindah PML", () => {
    const baris = [
      ...cocok(9),
      ...cocok(10, { kode_sls: "B", ppl_akun_id: 2, ppl_nama: "P2" }),
      ...cocok(10, { kode_sls: "B", ppl_akun_id: 1 }),
      ...cocok(10, { kode_sls: "C", pml_akun_id: 4 }),
      ...cocok(10, { kode_sls: "D" }),
    ];
    const p = periksaAlokasi(baris, { target_per_sls: 10, maks_sls_per_ppl: 2, boleh_ganti: true });
    const gabung = p.join("\n");
    expect(gabung).toContain("2 SLS tidak berisi tepat 10");
    expect(gabung).toContain("dipegang lebih dari satu PPL");
    expect(gabung).toContain("lebih dari 2 SLS");
    expect(gabung).toContain("lebih dari satu PML");
  });
  it("pengaturan dibaca aman", () => {
    expect(bacaKonfigSampel(null)).toEqual({ target_per_sls: 10, maks_sls_per_ppl: 2, boleh_ganti: true });
    expect(bacaKonfigSampel({ target_per_sls: 8, maks_sls_per_ppl: 1, boleh_ganti: false })).toEqual({ target_per_sls: 8, maks_sls_per_ppl: 1, boleh_ganti: false });
    expect(bacaKonfigSampel({ target_per_sls: 0, maks_sls_per_ppl: "x", boleh_ganti: "ya" })).toEqual({ target_per_sls: 10, maks_sls_per_ppl: 2, boleh_ganti: true });
  });
});

describe("pengelompokan dan penggantian", () => {
  const rows: SampelRow[] = [
    S(1), S(2), S(3),
    S(4, { status: "cadangan", menggantikan_id: 2, alasan: "pindah" }),
    S(5, { status: "cadangan" }),
    S(6, { kode_sls: "13030100010002", ppl_akun_id: 2, ppl_nama: "Budi" }),
  ];
  it("kelompok SLS memuat pengganti dan sisa cadangan", () => {
    const g = kelompokSls(rows);
    expect(g.map((x) => x.kode_sls)).toEqual(["13030100010001", "13030100010002"]);
    const a = g[0];
    expect(a.utama).toHaveLength(3);
    expect(a.cadangan).toHaveLength(2);
    expect(a.diganti).toBe(1);
    expect(a.cadangan_tersisa).toBe(1);
    expect(a.utama[1].pengganti?.id).toBe(4);
    expect(a.cadangan[0].menggantikan?.id).toBe(2);
  });
  it("kelompok PPL dan rekap", () => {
    const p = kelompokPpl(rows);
    expect(p.map((x) => x.ppl_nama)).toEqual(["Budi", "Siti Aminah"]);
    expect(p[1]).toMatchObject({ utama: 3, cadangan: 2, diganti: 1, cadangan_tersisa: 1 });
    expect(rekapSampel(rows)).toMatchObject({ sls: 2, ppl: 2, pml: 1, utama: 4, cadangan: 2, diganti: 1, cadangan_tersisa: 1, berkoordinat: 0 });
  });
  it("cadangan tersedia hanya yang belum terpakai pada SLS dan PPL yang sama", () => {
    expect(cadanganTersedia(rows[0], rows).map((r) => r.id)).toEqual([5]);
    expect(cadanganTersedia(rows[5], rows)).toEqual([]);
  });
  it("permintaan ganti diperiksa", () => {
    expect(periksaPermintaanGanti({ utama_id: 1, cadangan_id: 5, alasan: "  responden   pindah " })).toEqual({ ok: true, data: { utama_id: 1, cadangan_id: 5, alasan: "responden pindah" } });
    expect(periksaPermintaanGanti({ utama_id: 1, cadangan_id: 5, alasan: "" })).toMatchObject({ ok: false });
    expect(periksaPermintaanGanti({ utama_id: "x", cadangan_id: 5, alasan: "pindah" })).toMatchObject({ ok: false });
    expect(periksaPermintaanGanti({ utama_id: 1, cadangan_id: 5, alasan: "x".repeat(301) })).toMatchObject({ ok: false });
  });
  it("keterangan modul untuk PPL dan PML", () => {
    expect(ketModulSampel({ kegiatan_id: 5, peran: "ppl", sls: 2, utama: 20, cadangan: 4, diganti: 1, ppl: 1 })).toBe("2 SLS · 20 sampel utama · 1 diganti cadangan");
    expect(ketModulSampel({ kegiatan_id: 5, peran: "pml", sls: 8, utama: 80, cadangan: 8, diganti: 0, ppl: 4 })).toBe("4 PPL · 8 SLS · 80 sampel utama");
  });
});
