import { describe, expect, it } from "vitest";
import {
  aksiUsulan, bacaTabTerakhir, bolehBuatUsulan, dariAman, jadwalTampil, jejakUsulan, jumlahMenunggu, keadaanLangkah, labelDari, masaBerlaku,
  menungguSaya, periksaAlasanUsulan, peranSaya, simpanTabTerakhir, teksGiliran, timRo, usulanBerjalan, usulanJadwal, type HakUsulan,
} from "../usulan";
import { TAB_RO, tabDari, type BarisPenugasan } from "../ro";

const H = (o: Partial<HakUsulan> = {}): HakUsulan => ({ rab: false, draf: false, setuju_ketua: false, sahkan: false, ...o });

describe("aksi usulan menurut status dan hak", () => {
  it("tanpa hak tidak ada tombol", () => {
    for (const s of ["draf", "menunggu_ketua", "menunggu_ppk", "dikembalikan", "disetujui"]) expect(aksiUsulan(s, "dibuka", H())).toEqual([]);
  });
  it("admin RO dan ketua tim dapat mengajukan draf dan usulan yang dikembalikan", () => {
    expect(aksiUsulan("draf", "dibuka", H({ draf: true }))).toEqual(["ajukan"]);
    expect(aksiUsulan("dikembalikan", "dibuka", H({ rab: true }))).toEqual(["ajukan"]);
  });
  it("hanya ketua tim menyetujui; hanya PPK mengesahkan; keduanya boleh mengembalikan pada gilirannya", () => {
    expect(aksiUsulan("menunggu_ketua", "dibuka", H({ draf: true }))).toEqual([]);
    expect(aksiUsulan("menunggu_ketua", "dibuka", H({ setuju_ketua: true }))).toEqual(["setuju_ketua", "kembalikan"]);
    expect(aksiUsulan("menunggu_ppk", "dibuka", H({ setuju_ketua: true }))).toEqual([]);
    expect(aksiUsulan("menunggu_ppk", "dibuka", H({ sahkan: true }))).toEqual(["sahkan", "kembalikan"]);
  });
  it("selain jadwal dibuka tidak ada aksi", () => {
    for (const j of ["terjadwal", "terkumpul", "diterapkan", "sah", "dilewati", ""]) expect(aksiUsulan("menunggu_ppk", j, H({ sahkan: true, setuju_ketua: true, rab: true }))).toEqual([]);
  });
  it("usulan disetujui tidak punya aksi", () => {
    expect(aksiUsulan("disetujui", "dibuka", H({ rab: true, draf: true, setuju_ketua: true, sahkan: true }))).toEqual([]);
  });
});

describe("buat usulan dan alasan", () => {
  it("buat hanya saat dibuka, belum ada usulan, dan berwenang", () => {
    expect(bolehBuatUsulan("dibuka", false, H({ draf: true }))).toBe(true);
    expect(bolehBuatUsulan("dibuka", false, H({ rab: true }))).toBe(true);
    expect(bolehBuatUsulan("dibuka", true, H({ rab: true }))).toBe(false);
    expect(bolehBuatUsulan("terkumpul", false, H({ rab: true }))).toBe(false);
    expect(bolehBuatUsulan("dibuka", false, H({ sahkan: true, setuju_ketua: true }))).toBe(false);
  });
  it("kembalikan wajib alasan minimal 5 huruf", () => {
    expect(periksaAlasanUsulan("kembalikan", "  ab ")).toMatch(/minimal 5/);
    expect(periksaAlasanUsulan("kembalikan", "kurang rinci")).toBeNull();
    expect(periksaAlasanUsulan("ajukan", "")).toBeNull();
  });
});

describe("stepper dan teks giliran", () => {
  it("langkah menurut status", () => {
    expect(keadaanLangkah("draf")).toEqual(["sekarang", "belum", "belum", "belum"]);
    expect(keadaanLangkah("menunggu_ketua")).toEqual(["selesai", "sekarang", "belum", "belum"]);
    expect(keadaanLangkah("menunggu_ppk")).toEqual(["selesai", "selesai", "sekarang", "belum"]);
    expect(keadaanLangkah("disetujui")).toEqual(["selesai", "selesai", "selesai", "selesai"]);
    expect(keadaanLangkah("dikembalikan")).toEqual(["sekarang", "belum", "belum", "belum"]);
    expect(keadaanLangkah("aneh")).toEqual(["belum", "belum", "belum", "belum"]);
  });
  it("teks giliran ada untuk tiap status dikenal", () => {
    for (const s of ["draf", "menunggu_ketua", "menunggu_ppk", "dikembalikan", "disetujui"]) expect(teksGiliran(s).length).toBeGreaterThan(5);
    expect(teksGiliran("x")).toBe("");
  });
  it("usulanBerjalan", () => {
    expect(usulanBerjalan("menunggu_ppk")).toBe(true);
    expect(usulanBerjalan("disetujui")).toBe(false);
  });
});

describe("menunggu saya, lencana, jadwal tampil", () => {
  const u = [
    { id: 1, jadwal_id: 10, ro_kode: "2906.BMA.005", status: "menunggu_ketua" },
    { id: 2, jadwal_id: 11, ro_kode: "2906.BMA.005", status: "menunggu_ppk" },
    { id: 3, jadwal_id: 12, ro_kode: "2906.BMA.005", status: "draf" },
  ];
  const js = new Map([[10, "dibuka"], [11, "terkumpul"], [12, "dibuka"]]);
  it("menungguSaya hanya bila ada tindakan yang boleh dilakukan", () => {
    expect(menungguSaya("menunggu_ketua", "dibuka", H({ setuju_ketua: true }))).toBe(true);
    expect(menungguSaya("menunggu_ketua", "dibuka", H({ draf: true }))).toBe(false);
    expect(menungguSaya("draf", "dibuka", H({ draf: true }))).toBe(false); // ajukan bukan menunggu orang lain
  });
  it("jumlahMenunggu menghitung per hak dan status jadwal", () => {
    expect(jumlahMenunggu(u, js, H({ setuju_ketua: true }))).toBe(1);
    expect(jumlahMenunggu(u, js, H({ sahkan: true }))).toBe(0); // jadwal 11 sudah terkumpul
    expect(jumlahMenunggu(u, js, H())).toBe(0);
  });
  it("usulanJadwal memilih yang terbaru per jadwal dan RO", () => {
    const d = [...u, { id: 9, jadwal_id: 10, ro_kode: "2906.BMA.005", status: "dikembalikan" }, { id: 8, jadwal_id: 10, ro_kode: "2906.BMA.006", status: "draf" }];
    expect(usulanJadwal(d, 10, "2906.BMA.005")?.id).toBe(9);
    expect(usulanJadwal(d, 99, "2906.BMA.005")).toBeNull();
  });
  it("jadwalTampil: yang dibuka dan yang sudah punya usulan, dibuka dulu", () => {
    const j = [{ id: 10, status: "dibuka" }, { id: 11, status: "terkumpul" }, { id: 13, status: "sah" }, { id: 14, status: "terjadwal" }, { id: 15, status: "dibuka" }];
    expect(jadwalTampil(j, u).map((x) => x.id)).toEqual([15, 10, 11]);
  });
  it("jejakUsulan menyaring dan mengurutkan terbaru dulu", () => {
    const b = [1, 2, 3].map((i) => ({ id: i, usulan_id: i === 2 ? 5 : 4, jadwal_id: 1, ro_kode: "x", aksi: "ajukan", dari: null, ke: null, oleh_nama: null, catatan: "", waktu: "" }));
    expect(jejakUsulan(b, 4).map((x) => x.id)).toEqual([3, 1]);
  });
});

describe("tim dan akses", () => {
  const P = (o: Partial<BarisPenugasan>): BarisPenugasan => ({ sumber: "penugasan", peran_kode: "KETUA", ro_kode: "2906.BMA.005", akun_id: 1, akun_nama: "A", berlaku_mulai: "2026-01-01", berlaku_sampai: null, aktif_hari_ini: true, ...o });
  const baris = [
    P({ akun_nama: "Budi", peran_kode: "ADMINRO" }),
    P({ akun_nama: "Citra", peran_kode: "ADMINRO", aktif_hari_ini: false, berlaku_sampai: "2025-12-31", berlaku_mulai: "2025-01-01" }),
    P({ akun_nama: "Ahmad" }),
    P({ akun_nama: "Lain", ro_kode: "2906.BMA.006" }),
    P({ akun_nama: "Pak PPK", peran_kode: "PPK", ro_kode: null }),
    P({ akun_nama: "Tamu", peran_kode: "AKSES_ADM", ro_kode: null, sumber: "akses_adm" }),
  ];
  it("peran per-RO hanya RO itu, kelompok kosong tetap muncul, aktif dulu", () => {
    const { perRo, satker } = timRo(baris, "2906.BMA.005");
    expect(perRo.map((k) => k.peran)).toEqual(["KETUA", "ADMINRO", "PBJ", "AKSES_ADM"]);
    expect(perRo[0].baris.map((b) => b.nama)).toEqual(["Ahmad"]);
    expect(perRo[1].baris.map((b) => b.nama)).toEqual(["Budi", "Citra"]);
    expect(perRo[2].baris).toEqual([]);
    expect(perRo[3].baris.map((b) => b.nama)).toEqual(["Tamu"]);
    expect(perRo[3].baris[0].semuaRo).toBe(true);
    expect(satker.map((k) => k.peran)).toEqual(["PPK"]);
  });
  it("masaBerlaku", () => {
    const f = (s: string) => s;
    expect(masaBerlaku("2026-01-01", null, f)).toBe("sejak 2026-01-01");
    expect(masaBerlaku("2026-01-01", "2026-12-31", f)).toBe("2026-01-01 s.d. 2026-12-31");
  });
  it("peranSaya", () => {
    expect(peranSaya(H())).toEqual([]);
    expect(peranSaya(H({ draf: true }))[0]).toMatch(/Admin RO/);
    expect(peranSaya(H({ rab: true, setuju_ketua: true }))).toEqual(["Ketua tim (menyetujui usulan admin RO)"]);
    expect(peranSaya(H({ rab: true, sahkan: true, setuju_ketua: true }))).toHaveLength(2);
  });
});

describe("dari= dan tab terakhir", () => {
  it("dariAman menerima jalur /sigap dan menolak yang lain", () => {
    expect(dariAman("/sigap/revisi/kertas?jadwal=7&kro=2906")).toBe("/sigap/revisi/kertas?jadwal=7&kro=2906");
    expect(dariAman(encodeURIComponent("/sigap/ro/2906.BMA.005?tab=kertas"))).toBe("/sigap/ro/2906.BMA.005?tab=kertas");
    expect(dariAman("/sigap")).toBe("/sigap");
    for (const x of ["https://jahat.example/sigap", "//jahat.example", "/sigapx", "/lain", "javascript:alert(1)", "/sigap/\\evil", "/sigap/ a", "", null, undefined, "%E0%A4%A", "/sigap/x://y"]) expect(dariAman(x as string)).toBeNull();
    expect(dariAman("/sigap/" + "a".repeat(400))).toBeNull();
  });
  it("labelDari menyebut tujuan", () => {
    expect(labelDari("/sigap/revisi/kertas?jadwal=7")).toBe("Kertas kerja KRO");
    expect(labelDari("/sigap/revisi")).toBe("Jadwal revisi");
    expect(labelDari("/sigap/ro")).toBe("Daftar RO");
    expect(labelDari("/sigap/ro/2906.BMA.005?tab=rab")).toBe("Ruang kerja RO");
    expect(labelDari("/sigap/entah")).toBe("Halaman sebelumnya");
  });
  it("tab terakhir: baca, simpan, dan tahan terhadap data rusak", () => {
    expect(bacaTabTerakhir(null, "A", TAB_RO)).toBeNull();
    expect(bacaTabTerakhir("{rusak", "A", TAB_RO)).toBeNull();
    expect(bacaTabTerakhir("[1]", "A", TAB_RO)).toBeNull();
    const s1 = simpanTabTerakhir(null, "A", "rab");
    expect(bacaTabTerakhir(s1, "A", TAB_RO)).toBe("rab");
    const s2 = simpanTabTerakhir(s1, "B", "tim");
    expect(bacaTabTerakhir(s2, "A", TAB_RO)).toBe("rab");
    expect(bacaTabTerakhir(s2, "B", TAB_RO)).toBe("tim");
    expect(bacaTabTerakhir(simpanTabTerakhir(s2, "A", "hapus-tab"), "A", TAB_RO)).toBeNull();
    expect(simpanTabTerakhir("{rusak", "A", "rab")).toBe('{"A":"rab"}');
  });
  it("simpanan dibatasi 60 RO", () => {
    let s: string | null = null;
    for (let i = 0; i < 70; i++) s = simpanTabTerakhir(s, `RO${i}`, "rab");
    const o = JSON.parse(s!) as Record<string, string>;
    expect(Object.keys(o)).toHaveLength(60);
    expect(o.RO69).toBe("rab");
    expect(o.RO0).toBeUndefined();
  });
  it("TAB_RO memuat tab baru dan tabDari mengenalinya", () => {
    expect(tabDari("revisi")).toBe("revisi");
    expect(tabDari("tim")).toBe("tim");
    expect(tabDari("kertas")).toBe("kertas");
  });
});
