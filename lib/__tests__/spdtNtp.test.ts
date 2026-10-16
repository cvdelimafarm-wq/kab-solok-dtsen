// (16 Okt 2026) Uji Lembar Pendataan SPDT NTP: tautan navigasi, penyaringan, ringkasan modul, dan penyusun Monitoring.
import { describe, expect, it } from "vitest";
import {
  akurasiRendah,
  awalHariWib,
  daftarPpl,
  judulKata,
  kelompokJorong,
  ketModulSpdt,
  periksaBuka,
  ringkasSpdt,
  saringKk,
  susunMonitoring,
  tautanNavigasi,
  teksJarak,
  type KkSpdt,
} from "../spdtNtp";

const KK = (id: number, ppl: [number, string], pml: [number, string], ekstra: Partial<KkSpdt> = {}): KkSpdt => ({
  id,
  urut: id,
  kode_wilayah: `13030500040005${String(id).padStart(2, "0")}`,
  kecamatan: "LEMBAH GUMANTI",
  nagari: "AIE DINGIN",
  jorong: "JORONG CUBADAK",
  nama_kk: `KK ${id}`,
  anggota_lain: null,
  alamat: null,
  akurasi_m: 3,
  lat: -1.15,
  lng: 100.82,
  ppl_nama: ppl[1],
  pml_nama: pml[1],
  ppl_akun_id: ppl[0],
  pml_akun_id: pml[0],
  ...ekstra,
});

describe("tautan & akurasi", () => {
  it("tautan navigasi memuat tujuan lintang,bujur", () => {
    expect(tautanNavigasi(-1.15622, 100.8204067)).toBe("https://www.google.com/maps/dir/?api=1&destination=-1.1562200,100.8204067&travelmode=driving");
  });
  it("akurasi di atas 50 m dianggap rendah; kosong tidak", () => {
    expect(akurasiRendah(50)).toBe(false);
    expect(akurasiRendah(50.1)).toBe(true);
    expect(akurasiRendah(null)).toBe(false);
  });
  it("judulKata & teksJarak", () => {
    expect(judulKata("JORONG KAYU ARO")).toBe("Jorong Kayu Aro");
    expect(teksJarak(420)).toBe("420 m");
    expect(teksJarak(2340)).toBe("2,3 km");
  });
});

describe("daftarPpl & saringKk", () => {
  const kk = [
    KK(1, [5, "ADRINADI"], [630, "SRI MULYATI"], { nama_kk: "ADRI SYAH PUTRA", anggota_lain: "ANISA WAHYUNI" }),
    KK(2, [5, "ADRINADI"], [630, "SRI MULYATI"], { jorong: "JORONG KAYU ARO" }),
    KK(3, [121, "DANA NOKELADIO"], [94, "AYU SEPRIANI"]),
    KK(4, [121, "DANA NOKELADIO"], [370, "MEGAWATI"], { akurasi_m: 90 }),
  ];
  it("daftar PPL urut nama, indeks stabil, PML ganda digabung", () => {
    const p = daftarPpl(kk);
    expect(p.map((x) => x.nama)).toEqual(["ADRINADI", "DANA NOKELADIO"]);
    expect(p.map((x) => x.indeks)).toEqual([0, 1]);
    expect(p[1].pml).toBe("AYU SEPRIANI / MEGAWATI");
    expect(p[0].jumlah).toBe(2);
  });
  it("saring per PPL, jorong, kata cari (semua kata harus ada), dan akurasi rendah", () => {
    expect(saringKk(kk, { ppl: 5, jorong: null, cari: "" }).map((k) => k.id)).toEqual([1, 2]);
    expect(saringKk(kk, { ppl: null, jorong: "AIE DINGIN|JORONG KAYU ARO", cari: "" }).map((k) => k.id)).toEqual([2]);
    expect(saringKk(kk, { ppl: null, jorong: null, cari: "anisa adri" }).map((k) => k.id)).toEqual([1]);
    expect(saringKk(kk, { ppl: null, jorong: null, cari: "", hanyaRendah: true }).map((k) => k.id)).toEqual([4]);
  });
  it("kelompok jorong mengurutkan nama KK", () => {
    const g = kelompokJorong([KK(2, [5, "A"], [1, "P"], { nama_kk: "ZZZ" }), KK(1, [5, "A"], [1, "P"], { nama_kk: "AAA" })]);
    expect(g).toHaveLength(1);
    expect(g[0].kk.map((k) => k.nama_kk)).toEqual(["AAA", "ZZZ"]);
  });
});

describe("ringkasan modul", () => {
  const kk = [
    { ppl_akun_id: 5, pml_akun_id: 630 },
    { ppl_akun_id: 5, pml_akun_id: 630 },
    { ppl_akun_id: 20, pml_akun_id: 455 },
  ];
  it("hitung KK, PPL, PML", () => {
    expect(ringkasSpdt("supervisor", kk)).toEqual({ peran: "supervisor", total: 3, ppl: 2, pml: 2 });
  });
  it("keterangan per peran", () => {
    expect(ketModulSpdt({ peran: "ppl", total: 25, ppl: 1, pml: 1 })).toContain("25 KK di wilayah tugas Anda");
    expect(ketModulSpdt({ peran: "pml", total: 45, ppl: 2, pml: 1 })).toContain("2 PPL Anda");
    expect(ketModulSpdt({ peran: "supervisor", total: 811, ppl: 40, pml: 15 })).toContain("811 KK seluruh wilayah");
  });
});

describe("susunMonitoring", () => {
  const tanggal = "2026-10-16";
  const awal = awalHariWib(tanggal); // 2026-10-15T17:00:00.000Z
  const kk = [
    { id: 1, ppl_akun_id: 5, pml_akun_id: 630, ppl_nama: "ADRINADI", pml_nama: "SRI MULYATI" },
    { id: 2, ppl_akun_id: 5, pml_akun_id: 630, ppl_nama: "ADRINADI", pml_nama: "SRI MULYATI" },
    { id: 3, ppl_akun_id: 341, pml_akun_id: 630, ppl_nama: "LIRA INDRIANI", pml_nama: "SRI MULYATI" },
    { id: 4, ppl_akun_id: 121, pml_akun_id: 94, ppl_nama: "DANA NOKELADIO", pml_nama: "AYU SEPRIANI" },
    { id: 5, ppl_akun_id: 121, pml_akun_id: 370, ppl_nama: "DANA NOKELADIO", pml_nama: "MEGAWATI" },
  ];
  const nama = new Map<number, string>([[630, "Sri Mulyati"]]);

  it("awal hari WIB = 17.00 UTC hari sebelumnya", () => {
    expect(awal).toBe("2026-10-15T17:00:00.000Z");
  });

  it("login hari ini, koordinat dibuka dihitung per pasangan, PPL ganda-PML muncul di dua grup", () => {
    const { grup, ringkas } = susunMonitoring({
      tanggal,
      kk,
      nama,
      sesi: [
        { akun_id: 5, mulai_at: "2026-10-15T23:42:00.000Z", terakhir_aktif_at: "2026-10-16T02:00:00.000Z" }, // 06.42 WIB
        { akun_id: 630, mulai_at: "2026-10-15T10:00:00.000Z", terakhir_aktif_at: "2026-10-16T00:05:00.000Z" }, // sesi lintas hari
        { akun_id: 341, mulai_at: "2026-10-14T01:00:00.000Z", terakhir_aktif_at: "2026-10-14T02:00:00.000Z" }, // kemarin
      ],
      buka: [
        { akun_id: 5, kk_id: 1 },
        { akun_id: 5, kk_id: 2 },
        { akun_id: 121, kk_id: 4 },
        { akun_id: 121, kk_id: 5 },
      ],
    });
    expect(grup.map((g) => g.pml.nama)).toEqual(["AYU SEPRIANI", "MEGAWATI", "Sri Mulyati"]);
    const sri = grup.find((g) => g.pml.akun_id === 630)!;
    expect(sri.pml.login).toBe(awal); // mulai dipotong ke awal hari
    expect(sri.ppl.map((p) => [p.nama, p.kk, p.dibuka])).toEqual([
      ["ADRINADI", 2, 2],
      ["LIRA INDRIANI", 1, 0],
    ]);
    expect(sri.ppl[0].login).toBe("2026-10-15T23:42:00.000Z");
    expect(sri.ppl[1].login).toBeNull(); // sesi kemarin tidak dihitung
    // Dana di dua grup, masing-masing 1 KK dan 1 dibuka
    const dana = grup.flatMap((g) => g.ppl).filter((p) => p.akun_id === 121);
    expect(dana.map((p) => [p.kk, p.dibuka])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    // ringkasan per PPL unik: 3 PPL (5, 341, 121)
    expect(ringkas).toEqual({ ppl: 3, login: 1, belum_login: 2, belum_buka: 1, kk_dibuka: 4, kk_total: 5 });
  });

  it("tanpa data sama sekali", () => {
    const r = susunMonitoring({ tanggal, kk: [], nama, sesi: [], buka: [] });
    expect(r.grup).toEqual([]);
    expect(r.ringkas.ppl).toBe(0);
  });
});

describe("periksaBuka", () => {
  it("menolak id tidak sah, menerima navigasi true saja", () => {
    expect(periksaBuka({ kk_id: "x" }).ok).toBe(false);
    expect(periksaBuka(null).ok).toBe(false);
    expect(periksaBuka({ kk_id: 7, navigasi: true })).toEqual({ ok: true, kk_id: 7, navigasi: true });
    expect(periksaBuka({ kk_id: 7, navigasi: "ya" })).toEqual({ ok: true, kk_id: 7, navigasi: false });
  });
});
