// lib/__tests__/kegiatanTranslok.test.ts
// (14 Okt 2026) Uji adapter Transport Lokal (lib/portal/kegiatan.ts susunTranslok): tautan dalam per langkah (tab/tgl/fokus), penilai hari bersama,
// daftar kekurangan, dan hari terlewat lama yang tidak lagi memerahkan Beranda terus-menerus. (Sebelumnya susunTranslok tidak punya tes.)
import { describe, expect, it } from "vitest";
import { susunTranslok, type MasukanTranslok } from "@/lib/portal/kegiatan";
import { tugasDariKegiatan } from "@/lib/sigapKegiatan";

const HARI_INI = "2026-10-14";
const at = (jam: string) => Date.parse(`${HARI_INI}T${jam}:00+07:00`);
const HREF = "/sigap/translok/tok?p=46";

const pen = (o: Partial<MasukanTranslok["p"]> = {}): MasukanTranslok["p"] => ({
  id: 46,
  kegiatan: { id: 9, kode: "pascabencana", nama: "Pendataan Pascabencana", kode_anggaran: null, satuan_realisasi: "KK", jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 },
  label_jabatan: "PPL Pascabencana",
  status_periode: "aktif",
  ditutup_pada: null,
  dikunci_at: null,
  ...o,
});
const masuk = (o: Partial<MasukanTranslok> = {}): MasukanTranslok => ({ p: pen(), hariKerja: [HARI_INI], isian: {}, hariIni: HARI_INI, hrefKerja: HREF, nowMs: at("17:00"), sumber: "pendataan", hrefLembar: "/sigap/pendataan", satuan: "KK", waAdmin: "6281200000000", ...o });

describe("susunTranslok: tautan dalam per langkah", () => {
  it("langkah 2 membuka tab Hari Kerja; langkah 5 (SPJ dikunci) membuka tab Arsip", () => {
    const r = susunTranslok(masuk({ p: pen({ dikunci_at: "2026-10-14T00:00:00Z" }) }));
    expect(r.langkah![1].href).toBe(`${HREF}&tab=hari_kerja`);
    expect(r.langkah![4].href).toBe(`${HREF}&tab=arsip`);
  });
  it("(27 Okt 2026) langkah 1 dan 4 ikut punya tautan ke tab Arsip (kartu Beranda: semua kotak bisa diketuk)", () => {
    const r = susunTranslok(masuk());
    expect(r.langkah![0].href).toBe(`${HREF}&tab=arsip`);
    expect(r.langkah![3].href).toBe(`${HREF}&tab=arsip`);
    expect(r.langkah![1].href).toBe(`${HREF}&tab=hari_kerja`);
  });
  it("langkah 3 hari ini: tombol langsung ke bagian foto bila foto yang kurang", () => {
    const r = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: true, foto: 2, slot: [1, 2] } } }));
    const l3 = r.langkah![2];
    expect(l3.status).toBe("perlu");
    expect(l3.href).toBe(`${HREF}&tab=hari_ini&fokus=foto`);
    expect(l3.aksi).toBe("Unggah foto 3–5");
    expect(l3.ket).toContain("Foto kurang 3: nomor 3, 4, 5");
    expect(r.kekurangan![0].jenis).toBe("foto");
    expect(r.sub).toContain("Foto belum lengkap");
    expect(r.sub).not.toContain("Foto kurang 3"); // (26 Okt 2026) judul langkah sudah memuat "Foto kurang 3: nomor ..."; ringkas tidak mengulang
  });
  it("langkah 3 hari lengkap = 'Buka isian' ke halaman kerja biasa", () => {
    const r = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: true, foto: 5 } } }));
    expect(r.langkah![2].status).toBe("selesai");
    expect(r.langkah![2].href).toBe(HREF);
    expect(r.kekurangan).toEqual([]);
  });
});

describe("susunTranslok: hari terlewat", () => {
  it("kemarin tidak lengkap: langkah 3 perlu, tombol ke hari itu di tab Hari Kerja", () => {
    const r = susunTranslok(masuk({ hariKerja: ["2026-10-13"], isian: { "2026-10-13": { laporan: true, foto: 4 } }, nowMs: at("08:00") }));
    const l3 = r.langkah![2];
    expect(l3.status).toBe("perlu");
    expect(l3.href).toBe(`${HREF}&tab=hari_kerja&tgl=2026-10-13`);
    expect(r.nada).toBe("emas");
    expect(r.sub).toContain("13 Okt terlewat");
  });
  it("hari terlewat lama (lewat jendela): tidak lagi 'perlu'/emas dan tidak jadi tugas utama Beranda", () => {
    const r = susunTranslok(masuk({ hariKerja: ["2026-10-08", "2026-10-20"], isian: { "2026-10-08": { laporan: true, foto: 1 } }, nowMs: at("08:00") }));
    expect(r.langkah![2].status).toBe("berjalan");
    expect(r.langkah![2].ket).toContain("1 hari terlewat");
    expect(r.nada).toBe("biru");
    expect(r.kekurangan).toEqual([]);
    expect(tugasDariKegiatan([r], at("08:00"))).toBeNull();
  });
  it("laporan dianggap (hasil lembar) + foto lengkap = hari lampau lengkap, sama dengan halaman kerja", () => {
    const r = susunTranslok(masuk({ hariKerja: ["2026-10-13"], isian: { "2026-10-13": { laporan: false, dianggap: true, foto: 5, hasilLembar: 9 } }, nowMs: at("08:00") }));
    expect(r.langkah![2].status).toBe("selesai");
    expect(r.nada).not.toBe("emas");
  });
  it("hari lampau dengan izin susulan aktif: ingatkan izin, bukan 'minta izin'", () => {
    const sampai = new Date(at("20:00")).toISOString();
    const r = susunTranslok(masuk({ hariKerja: ["2026-10-12"], isian: { "2026-10-12": { laporan: true, foto: 4, slot: [1, 2, 3, 4] } }, izin: { "2026-10-12": sampai }, nowMs: at("10:00") }));
    expect(r.langkah![2].status).toBe("perlu");
    expect(r.langkah![2].ket).not.toContain("Minta izin susulan");
    expect(r.langkah![2].href).toBe("/sigap/perbaikan?p=46");
  });
});

describe("tugasDariKegiatan memakai kekurangan teratas", () => {
  it("kartu Beranda: judul dinamis, tombol ke bagian foto, hitung mundur dari batas", () => {
    const r = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: true, foto: 4, slot: [1, 2, 3, 4] } }, nowMs: at("22:30") }));
    const t = tugasDariKegiatan([r], at("22:30"))!;
    expect(t.judul).toBe("Tinggal 1 foto lagi (nomor 5)");
    expect(t.aksi).toBe("Unggah foto 5");
    expect(t.href).toBe(`${HREF}&tab=hari_ini&fokus=foto`);
    expect(t.label).toBe("SEGERA");
    expect(t.lencana?.nada).toBe("merah");
    expect(t.skor).toBeGreaterThanOrEqual(88);
  });
  it("pagi hari kerja tanpa hasil: kartu dan langkah 3 membuka formulir laporan (bukan Lembar Pendataan)", () => {
    const r = susunTranslok(masuk({ nowMs: at("07:00") }));
    const t = tugasDariKegiatan([r], at("07:00"))!;
    expect(t.href).toContain("fokus=laporan");
    expect(t.href).not.toBe("/sigap/pendataan");
    expect(t.aksi).toBe("Isi laporan");
    const l3 = r.langkah!.find((l) => l.kode === "harian")!;
    expect(l3.href).toContain("fokus=laporan");
    expect(l3.ket).toContain("Belum ada hasil di Lembar Pendataan");
  });
  it("tanpa kekurangan (adapter lama) tetap memakai langkah seperti sebelumnya", () => {
    const r = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: true, foto: 2 } } }));
    delete r.kekurangan;
    const t = tugasDariKegiatan([r], at("17:00"))!;
    expect(t.judul).toBe("Laporan & foto harian");
  });
});
