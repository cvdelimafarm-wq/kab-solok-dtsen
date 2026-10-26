// lib/__tests__/sigapKekurangan.test.ts
// (14 Okt 2026) Uji daftar "yang belum dilengkapi" petugas (lib/sigapKekurangan.ts) dan penilai bersama hariDinilai (lib/sigap.ts).
import { describe, expect, it } from "vitest";
import { hariDinilai, type AturanIsian } from "@/lib/sigap";
import { bagianKurang, hitungTerlewat, normalisasiNomorWa, rentangNomor, slotKurang, susunKekurangan, tautanWaIzinSusulan, type MasukanKekurangan } from "@/lib/sigapKekurangan";

const ATURAN: AturanIsian = { jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 };
const HARI_INI = "2026-10-14";
const at = (jam: string) => Date.parse(`${HARI_INI}T${jam}:00+07:00`);

const dasar = (o: Partial<MasukanKekurangan> = {}): MasukanKekurangan => ({
  penugasanId: 88,
  namaKegiatan: "Pendataan Pascabencana",
  namaPetugas: "Budi",
  aturan: ATURAN,
  satuan: "KK",
  aktif: true,
  hariKerja: [HARI_INI],
  isian: {},
  hariIni: HARI_INI,
  hrefDasar: "/sigap/translok/tok?p=88",
  sumber: "pendataan",
  hrefLembar: "/sigap/pendataan",
  waAdmin: "6281200000000",
  ...o,
});

describe("hariDinilai", () => {
  it("laporan dianggap menggantikan laporan manual; foto tetap mengikuti aturan", () => {
    expect(hariDinilai(false, true, 5, ATURAN)).toBe(true);
    expect(hariDinilai(false, true, 4, ATURAN)).toBe(false);
    expect(hariDinilai(false, false, 5, ATURAN)).toBe(false);
    expect(hariDinilai(true, false, 5, ATURAN)).toBe(true);
    expect(hariDinilai(false, false, 5, { ...ATURAN, wajib_laporan: false })).toBe(true);
  });
});

describe("pembantu", () => {
  it("slotKurang dan rentangNomor", () => {
    expect(slotKurang([1, 2], 5)).toEqual([3, 4, 5]);
    expect(rentangNomor([3, 4, 5])).toBe("3–5");
    expect(rentangNomor([3, 5])).toBe("3, 5");
    expect(rentangNomor([5])).toBe("5");
  });
  it("bagianKurang: laporan dianggap tidak dihitung kurang; foto kurang menyebut nomor", () => {
    expect(bagianKurang({ laporan: false, slot: [1, 2, 3, 4, 5], dianggap: true }, ATURAN)).toEqual({ laporan: false, foto: [], fotoN: 0 });
    expect(bagianKurang({ laporan: true, slot: [1, 2] }, ATURAN)).toEqual({ laporan: false, foto: [3, 4, 5], fotoN: 3 });
  });
  it("normalisasiNomorWa", () => {
    expect(normalisasiNomorWa("0812-3456-7890")).toBe("6281234567890");
    expect(normalisasiNomorWa("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalisasiNomorWa("")).toBeNull();
    expect(normalisasiNomorWa("123")).toBeNull();
  });
  it("tautan WhatsApp memuat tanggal dan kekurangan", () => {
    const u = tautanWaIzinSusulan("6281200000000", { namaPetugas: "Budi", namaKegiatan: "Pendataan", tanggal: "2026-10-13", kurang: "foto 4/5" });
    expect(u.startsWith("https://wa.me/6281200000000?text=")).toBe(true);
    expect(decodeURIComponent(u)).toContain("13 Okt");
    expect(decodeURIComponent(u)).toContain("foto 4/5");
  });
});

describe("susunKekurangan: hari ini", () => {
  it("pagi, lembar belum ada hasil: tombol utama = formulir laporan, Lembar = tombol kedua", () => {
    const k = susunKekurangan(dasar(), at("07:00"));
    expect(k[0].jenis).toBe("lembar");
    expect(k[0].href).toContain("fokus=laporan");
    expect(k[0].aksi).toBe("Isi laporan");
    expect(k[0].sekunder?.href).toBe("/sigap/pendataan");
    expect(k[0].sekunder?.teks).toBe("Buka Lembar Pendataan");
    expect(k.some((x) => x.jenis === "foto")).toBe(true);
  });
  it("siang, lembar sudah punya hasil tetapi laporan belum: 'Periksa & simpan laporan' ke kartu laporan", () => {
    const k = susunKekurangan(dasar({ isian: { [HARI_INI]: { laporan: false, slot: [1, 2], hasilLembar: 12, jorong: "Koto Baru" } } }), at("13:00"));
    expect(k[0].jenis).toBe("laporan");
    expect(k[0].aksi).toBe("Periksa & simpan laporan");
    expect(k[0].uraian).toContain("12 KK di Koto Baru");
    expect(k[0].href).toBe("/sigap/translok/tok?p=88&tab=hari_ini&fokus=laporan");
  });
  it("sore, laporan sudah: foto kurang menyebut nomor dan tombol ke bagian foto", () => {
    const k = susunKekurangan(dasar({ isian: { [HARI_INI]: { laporan: true, slot: [1, 2] } } }), at("17:00"));
    expect(k).toHaveLength(1);
    expect(k[0].judul).toBe("Foto kurang 3: nomor 3, 4, 5");
    expect(k[0].aksi).toBe("Unggah foto 3–5");
    expect(k[0].href).toBe("/sigap/translok/tok?p=88&tab=hari_ini&fokus=foto");
    expect(k[0].progres).toEqual({ selesai: 2, total: 5 });
    expect(k[0].nada).toBe("emas");
    expect(k[0].skor).toBe(74);
  });
  it("malam 22.30 (sisa < 2 jam): mendesak, tinggal 1 foto", () => {
    const k = susunKekurangan(dasar({ isian: { [HARI_INI]: { laporan: true, slot: [1, 2, 3, 4] } } }), at("22:30"));
    expect(k[0].judul).toBe("Tinggal 1 foto lagi (nomor 5)");
    expect(k[0].nada).toBe("merah");
    expect(k[0].label).toBe("SEGERA");
    expect(k[0].skor).toBe(90);
  });
  it("kode berubah bila angkanya berubah (kunci modal sekali per keadaan)", () => {
    const a = susunKekurangan(dasar({ isian: { [HARI_INI]: { laporan: true, slot: [1, 2] } } }), at("17:00"))[0].kode;
    const b = susunKekurangan(dasar({ isian: { [HARI_INI]: { laporan: true, slot: [1, 2, 3] } } }), at("17:00"))[0].kode;
    expect(a).not.toBe(b);
  });
  it("lengkap = tidak ada pengingat", () => {
    expect(susunKekurangan(dasar({ isian: { [HARI_INI]: { laporan: true, slot: [1, 2, 3, 4, 5] } } }), at("12:00"))).toEqual([]);
  });
  it("hari ini bukan hari kerja dan tidak ada yang lain: kosong", () => {
    expect(susunKekurangan(dasar({ hariKerja: ["2026-10-20"] }), at("12:00"))).toEqual([]);
  });
  it("kegiatan tanpa laporan (pelatihan): hanya foto", () => {
    const k = susunKekurangan(dasar({ aturan: { jenis: "pelatihan", wajib_laporan: false, jumlah_foto: 5 }, sumber: null, hrefLembar: null }), at("10:00"));
    expect(k).toHaveLength(1);
    expect(k[0].jenis).toBe("foto");
    expect(k[0].judul).toBe("Unggah 5 foto dokumentasi");
  });
  it("PML (sumber identifikasi): tidak diarahkan ke Lembar Identifikasi, laporan manual tanpa tombol lembar", () => {
    const k = susunKekurangan(dasar({ sumber: "identifikasi", hrefLembar: "/sigap/identifikasi" }), at("07:00"));
    expect(k.some((x) => x.jenis === "lembar")).toBe(false);
    const l = k.find((x) => x.jenis === "laporan")!;
    expect(l.aksi).toBe("Isi laporan");
    expect(l.href).toContain("fokus=laporan");
    expect(l.sekunder).toBeUndefined();
    expect(l.uraian).not.toContain("Lembar Identifikasi");
  });
  it("tanpa lembar (peran tanpa sumber otomatis): laporan manual", () => {
    const k = susunKekurangan(dasar({ sumber: null, hrefLembar: null }), at("07:00"));
    expect(k.find((x) => x.jenis === "laporan")?.aksi).toBe("Isi laporan");
    expect(k.some((x) => x.jenis === "lembar")).toBe(false);
  });
  it("tidak aktif (arsip/dikunci): tidak ada pengingat", () => {
    expect(susunKekurangan(dasar({ aktif: false }), at("12:00"))).toEqual([]);
  });
});

describe("susunKekurangan: hari lampau", () => {
  it("kemarin tidak lengkap tanpa izin: 'terlewat' dengan tombol WhatsApp ke admin", () => {
    const k = susunKekurangan(dasar({ hariKerja: ["2026-10-13", HARI_INI], isian: { "2026-10-13": { laporan: true, slot: [1, 2, 3, 4] }, [HARI_INI]: { laporan: true, slot: [1, 2, 3, 4, 5] } } }), at("08:00"));
    expect(k).toHaveLength(1);
    expect(k[0].jenis).toBe("hari_terlewat");
    expect(k[0].judul).toBe("13 Okt belum lengkap (foto 4/5)");
    expect(k[0].uraian).toBe("Isian tanggal ini sudah tutup. Minta izin susulan ke admin bila perlu."); // (26 Okt 2026, B5)
    expect(k[0].href).toBe("/sigap/translok/tok?p=88&tab=hari_kerja&tgl=2026-10-13");
    expect(k[0].sekunder?.luar).toBe(true);
    expect(k[0].sekunder?.href).toContain("wa.me/6281200000000");
  });
  it("tanpa nomor admin: tidak ada tombol WhatsApp", () => {
    const k = susunKekurangan(dasar({ waAdmin: null, hariKerja: ["2026-10-13"], isian: { "2026-10-13": { laporan: false, slot: [] } } }), at("08:00"));
    expect(k[0].sekunder).toBeUndefined();
  });
  it("hari lampau dengan laporan dianggap + foto lengkap TIDAK diingatkan", () => {
    const k = susunKekurangan(dasar({ hariKerja: ["2026-10-13"], isian: { "2026-10-13": { laporan: false, dianggap: true, slot: [1, 2, 3, 4, 5], hasilLembar: 9 } } }), at("08:00"));
    expect(k).toEqual([]);
  });
  it("hari terlewat lebih dari jendela tidak diingatkan lagi (tetap terhitung di hitungTerlewat)", () => {
    const m = dasar({ hariKerja: ["2026-10-08"], isian: { "2026-10-08": { laporan: true, slot: [1] } } });
    expect(susunKekurangan(m, at("08:00"))).toEqual([]);
    expect(hitungTerlewat(m, at("08:00"))).toEqual({ semua: 1, baru: 0, terbaru: "2026-10-08" });
  });
  it("izin susulan aktif: diingatkan dengan batas izin, bukan 'minta izin'", () => {
    const sampai = new Date(at("20:00")).toISOString();
    const k = susunKekurangan(dasar({ hariKerja: ["2026-10-12"], isian: { "2026-10-12": { laporan: true, slot: [1, 2, 3, 4] } }, izin: { "2026-10-12": sampai } }), at("10:00"));
    expect(k[0].jenis).toBe("perbaikan");
    expect(k[0].judul).toBe("Perbaiki administrasi (1 hari)");
    expect(k[0].aksi).toBe("Lengkapi administrasi");
    expect(k[0].href).toBe("/sigap/perbaikan?p=88");
    expect(k[0].penugasanId).toBe(88);
    expect(k[0].hari).toEqual([{ tanggal: "2026-10-12", laporan: false, foto: 4, fotoTotal: 5, sampai: sampai }]);
    expect(k.some((x) => x.jenis === "hari_terlewat" || x.jenis === "izin_susulan")).toBe(false);
    expect(hitungTerlewat(dasar({ hariKerja: ["2026-10-12"], isian: {}, izin: { "2026-10-12": sampai } }), at("10:00")).semua).toBe(0);
  });
  it("beberapa hari dengan izin digabung jadi satu kekurangan, memuat laporan/foto tiap hari; hari yang sudah lengkap tidak ikut", () => {
    const sampai = new Date(at("20:00") + 86_400_000).toISOString();
    const m = dasar({
      hariKerja: ["2026-10-10", "2026-10-12", "2026-10-13"],
      isian: { "2026-10-10": { laporan: true, slot: [1, 2, 3, 4, 5] }, "2026-10-12": { laporan: false, slot: [1, 2, 3] }, "2026-10-13": { laporan: false, dianggap: true, slot: [1, 2] } },
      izin: { "2026-10-10": sampai, "2026-10-12": sampai, "2026-10-13": sampai },
    });
    const k = susunKekurangan(m, at("10:00")).filter((x) => x.jenis === "perbaikan");
    expect(k).toHaveLength(1);
    expect(k[0].hari?.map((h) => [h.tanggal, h.laporan, h.foto])).toEqual([["2026-10-12", true, 3], ["2026-10-13", false, 2]]);
    expect(k[0].judul).toBe("Perbaiki administrasi (2 hari)");
    expect(k[0].skor).toBe(78);
    expect(k[0].nada).toBe("emas");
  });
  it("izin yang sudah habis dihitung terlewat biasa", () => {
    const habis = new Date(at("06:00")).toISOString();
    const k = susunKekurangan(dasar({ hariKerja: ["2026-10-12"], isian: { "2026-10-12": { laporan: true, slot: [1] } }, izin: { "2026-10-12": habis } }), at("10:00"));
    expect(k[0].jenis).toBe("hari_terlewat");
  });
});

describe("susunKekurangan: persiapan dan urutan", () => {
  it("belum memilih hari kerja: 'Pilih hari kerja' ke tab Hari Kerja", () => {
    const k = susunKekurangan(dasar({ hariKerja: [] }), at("09:00"));
    expect(k).toHaveLength(1);
    expect(k[0].href).toBe("/sigap/translok/tok?p=88&tab=hari_kerja");
  });
  it("izin mendesak mengalahkan hari ini biasa; hari ini mendesak mengalahkan izin biasa", () => {
    const izinHabisSebentar = new Date(at("12:30")).toISOString();
    const m = dasar({ hariKerja: ["2026-10-12", HARI_INI], isian: { "2026-10-12": { laporan: true, slot: [1] } }, izin: { "2026-10-12": izinHabisSebentar } });
    expect(susunKekurangan(m, at("11:00"))[0].jenis).toBe("perbaikan");
    const izinPanjang = new Date(at("23:00") + 86_400_000).toISOString();
    const n = dasar({ hariKerja: ["2026-10-12", HARI_INI], isian: { "2026-10-12": { laporan: true, slot: [1] } }, izin: { "2026-10-12": izinPanjang } });
    expect(susunKekurangan(n, at("22:30"))[0].jenis).toBe("foto");
  });
});
