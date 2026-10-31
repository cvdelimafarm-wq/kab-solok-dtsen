import { describe, expect, it } from "vitest";
import type { RingkasHariIni } from "@/lib/sigapKegiatan";
import {
  belumAdaKerja,
  poinKegiatanSelanjutnya,
  hariKeN,
  hitungHariKerja,
  kartuBiasa,
  kartuTemplate,
  peranKartu,
  peringatanMerah,
  pilihPeringatanPush,
  poinHariIni,
  statusRealisasi,
  urutKartu,
  wajibDiperiksa,
  type KartuBeranda,
} from "@/lib/sigapBerandaKartu";

const at = (tgl: string, jam: string) => Date.parse(`${tgl}T${jam}:00+07:00`);
const JUM = "2026-10-30"; // Jumat

const hi = (o: Partial<RingkasHariIni> = {}): RingkasHariIni => ({
  tanggal: JUM,
  adaJadwal: true,
  hariKerjaBerikut: "2026-11-02",
  peran: "ppl",
  fotoTotal: 5,
  slot: [],
  wajibLaporan: true,
  laporanSudah: false,
  hasilLembar: null,
  sumber: "pendataan",
  mulai: "2026-10-10",
  targetSelesai: "2026-11-10",
  hrefKerja: "/sigap/translok/tok?p=7",
  hrefLembar: "/sigap/pendataan",
  ...o,
});

describe("peran dan waktu", () => {
  it("peran penugasan -> peran kartu", () => {
    expect(peranKartu("ppl")).toBe("ppl");
    expect(peranKartu("pml")).toBe("pml");
    expect(peranKartu("supervisor")).toBe("supervisor");
    expect(peranKartu("korwil")).toBe("supervisor");
    expect(peranKartu(undefined)).toBe("ppl");
  });
  it("hari kerja kalender = Senin-Jumat", () => {
    expect(hitungHariKerja("2026-10-26", "2026-10-30")).toBe(5);
    expect(hitungHariKerja("2026-10-30", "2026-11-02")).toBe(2); // Jumat + Senin
    expect(hitungHariKerja("2026-10-31", "2026-11-01")).toBe(0); // Sabtu-Minggu
    expect(hitungHariKerja("2026-11-02", "2026-10-30")).toBe(0);
  });
  it("hari ke-n sejak awal periode", () => {
    expect(hariKeN("2026-10-10", "2026-10-10")).toBe(1);
    expect(hariKeN("2026-10-10", "2026-10-31")).toBe(22);
    expect(hariKeN(null, "2026-10-31")).toBeNull();
  });
});

describe("realisasi vs sisa hari kerja (batas = target selesai pendataan)", () => {
  const dasar = { mulai: "2026-10-10", targetSelesai: "2026-11-10", hariIni: "2026-10-31" };
  it("proporsi realisasi lebih kecil daripada waktu terpakai -> bermasalah", () => {
    // hari kerja terpakai 15 (12-30 Okt), sisa 7 (2-10 Nov): waktu terpakai 68%
    const r = statusRealisasi({ didata: 100, total: 400, ...dasar })!;
    expect(r.persen).toBe(25);
    expect(r.persenWaktu).toBe(68);
    expect(r.sisaHariKerja).toBe(7);
    expect(r.bermasalah).toBe(true);
    expect(r.ket).toContain("sisa 7 hari kerja");
  });
  it("realisasi menyusul waktu -> aman", () => {
    expect(statusRealisasi({ didata: 300, total: 400, ...dasar })!.bermasalah).toBe(false);
  });
  it("target sudah tercapai -> aman walau waktu hampir habis", () => {
    const r = statusRealisasi({ didata: 400, total: 400, mulai: "2026-10-10", targetSelesai: "2026-10-30", hariIni: "2026-11-02" })!;
    expect(r.bermasalah).toBe(false);
  });
  it("target selesai sudah lewat dan belum selesai -> bermasalah", () => {
    const r = statusRealisasi({ didata: 390, total: 400, mulai: "2026-10-10", targetSelesai: "2026-10-30", hariIni: "2026-11-02" })!;
    expect(r.sisaHariKerja).toBe(0);
    expect(r.bermasalah).toBe(true);
    expect(r.ket).toContain("sudah lewat");
  });
  it("tanggal target tidak diketahui -> hanya angka, tidak pernah bermasalah", () => {
    const r = statusRealisasi({ didata: 1, total: 400, mulai: "2026-10-10", targetSelesai: null, hariIni: "2026-10-31" })!;
    expect(r.persenWaktu).toBeNull();
    expect(r.bermasalah).toBe(false);
  });
  it("tanpa KK -> tidak ada realisasi", () => {
    expect(statusRealisasi({ didata: 0, total: 0, ...dasar })).toBeNull();
  });
  it("awal periode: belum ada hari terpakai, tidak bermasalah", () => {
    const r = statusRealisasi({ didata: 0, total: 400, mulai: "2026-10-12", targetSelesai: "2026-11-10", hariIni: "2026-10-12" })!;
    expect(r.persenWaktu).toBe(0);
    expect(r.bermasalah).toBe(false);
  });
});

describe("peringatan merah jam 13.00", () => {
  it("PPL: hari kerja, lewat 13.00, belum ada apa-apa -> menyala", () => {
    expect(peringatanMerah(hi(), at(JUM, "12:59"))).toBe(false);
    expect(peringatanMerah(hi(), at(JUM, "13:00"))).toBe(true);
    expect(peringatanMerah(hi(), at(JUM, "21:00"))).toBe(true);
  });
  it("sudah ada satu foto, atau laporan, atau hasil lembar -> tidak menyala", () => {
    expect(peringatanMerah(hi({ slot: [1] }), at(JUM, "14:00"))).toBe(false);
    expect(peringatanMerah(hi({ laporanSudah: true }), at(JUM, "14:00"))).toBe(false);
    expect(peringatanMerah(hi({ hasilLembar: 3 }), at(JUM, "14:00"))).toBe(false);
    expect(belumAdaKerja(hi())).toBe(true);
  });
  it("bukan hari kerja (libur) -> tidak menyala", () => {
    expect(peringatanMerah(hi({ adaJadwal: false }), at(JUM, "14:00"))).toBe(false);
  });
  it("data hari lain (tanggal tidak sama dengan hari ini) -> tidak menyala", () => {
    expect(peringatanMerah(hi({ tanggal: "2026-10-29" }), at(JUM, "14:00"))).toBe(false);
  });
  it("supervisor hanya pada hari ke-1,3,5,... periode", () => {
    // 30 Okt = hari ke-21 (ganjil); 29 Okt = hari ke-20 (genap)
    expect(wajibDiperiksa("supervisor", { mulai: "2026-10-10", tanggal: "2026-10-30" })).toBe(true);
    expect(wajibDiperiksa("supervisor", { mulai: "2026-10-10", tanggal: "2026-10-29" })).toBe(false);
    expect(wajibDiperiksa("supervisor", { mulai: null, tanggal: "2026-10-30" })).toBe(false);
    expect(wajibDiperiksa("ppl", { mulai: "2026-10-10", tanggal: "2026-10-29" })).toBe(true);
    expect(peringatanMerah(hi({ peran: "supervisor" }), at(JUM, "14:00"))).toBe(true);
    const rabu = "2026-10-28"; // hari ke-19 (ganjil)
    const kamis = "2026-10-29"; // hari ke-20 (genap)
    expect(peringatanMerah(hi({ peran: "supervisor", tanggal: rabu }), at(rabu, "14:00"))).toBe(true);
    expect(peringatanMerah(hi({ peran: "supervisor", tanggal: kamis }), at(kamis, "14:00"))).toBe(false);
    expect(peringatanMerah(hi({ peran: "korwil", tanggal: kamis }), at(kamis, "14:00"))).toBe(false);
  });
});

describe("poin mendesak per peran", () => {
  const HREF = "/sigap/kegiatan/pascabencana";
  it("1. foto awal belum lengkap -> Translok dulu", () => {
    const p = poinHariIni(hi(), HREF);
    expect(p.kode).toBe("foto_awal");
    expect(p.uraian).toContain("1 Berangkat");
    expect(p.uraian).toContain("2 Tiba di lokasi");
    expect(poinHariIni(hi({ slot: [1] }), HREF).uraian).toBe("Foto awal belum lengkap: 2 Tiba di lokasi.");
    expect(p.href).toBe(HREF);
  });
  it("2. foto awal sudah ada -> laporan menurut peran, menuju lembar", () => {
    const ppl = poinHariIni(hi({ slot: [1, 2] }), HREF);
    expect(ppl).toMatchObject({ kode: "laporan", judul: "Isi laporan pendataan", href: "/sigap/pendataan" });
    expect(poinHariIni(hi({ slot: [1, 2], peran: "pml" }), HREF).judul).toBe("Isi lembar QC / pengawasan");
    expect(poinHariIni(hi({ slot: [1, 2], peran: "supervisor" }), HREF).judul).toBe("Isi lembar QC / supervisi");
    expect(poinHariIni(hi({ slot: [1, 2], hrefLembar: null }), HREF).href).toBe(HREF);
  });
  it("3. laporan sudah terisi -> lengkapi sisa foto", () => {
    const p = poinHariIni(hi({ slot: [1, 2], laporanSudah: true }), HREF);
    expect(p.kode).toBe("sisa_foto");
    expect(p.judul).toBe("Lengkapi 3 foto lagi");
    expect(p.uraian).toBe("Foto yang tersisa: 3 Mendata, 4 Pulang, 5 Tiba di rumah.");
  });
  it("4. semua terisi -> lengkap", () => {
    expect(poinHariIni(hi({ slot: [1, 2, 3, 4, 5], laporanSudah: true }), HREF)).toMatchObject({ kode: "lengkap", nada: "hijau" });
  });
  it("kegiatan tanpa laporan wajib: dari foto awal langsung ke sisa foto", () => {
    expect(poinHariIni(hi({ slot: [1, 2], wajibLaporan: false }), HREF).kode).toBe("sisa_foto");
  });
  it("jumlah foto bukan 5: nama slot generik", () => {
    expect(poinHariIni(hi({ fotoTotal: 3 }), HREF).uraian).toBe("Foto awal belum lengkap: 1, 2.");
    expect(poinHariIni(hi({ fotoTotal: 1 }), HREF).uraian).toBe("Foto awal belum lengkap: 1.");
  });
  it("di luar hari kerja: libur dengan hari kerja berikutnya, atau ajakan memilih hari kerja", () => {
    const libur = poinHariIni(hi({ adaJadwal: false }), HREF);
    expect(libur).toMatchObject({ kode: "libur", nada: "abu" });
    expect(libur.uraian).toContain("2 Nov");
    const pilih = poinHariIni(hi({ adaJadwal: false, hariKerjaBerikut: null }), HREF);
    expect(pilih.kode).toBe("pilih_hari");
    expect(pilih.href).toBe("/sigap/translok/tok?p=7&tab=hari_kerja");
  });
});

describe("tombol dan awalan Selanjutnya", () => {
  it("tombol foto bertuliskan Masuk; tombol laporan/lembar tidak berubah", () => {
    expect(poinHariIni(hi(), "/x").aksi).toBe("Masuk");
    expect(poinHariIni(hi({ slot: [1, 2], laporanSudah: true }), "/x").aksi).toBe("Masuk");
    expect(poinHariIni(hi({ slot: [1, 2] }), "/x").aksi).toBe("Buka laporan");
    expect(poinHariIni(hi({ slot: [1, 2], peran: "pml" }), "/x").aksi).toBe("Buka lembar");
    expect(poinHariIni(hi({ slot: [1, 2], peran: "supervisor" }), "/x").aksi).toBe("Buka lembar");
  });
  it("poin yang harus dikerjakan diberi awalan Selanjutnya; lengkap, libur, dan info tidak", () => {
    for (const h of [hi(), hi({ slot: [1, 2] }), hi({ slot: [1, 2], laporanSudah: true })]) expect(poinKegiatanSelanjutnya(poinHariIni(h, "/x").kode)).toBe(true);
    expect(poinKegiatanSelanjutnya(poinHariIni(hi({ adaJadwal: false, hariKerjaBerikut: null }), "/x").kode)).toBe(true);
    expect(poinKegiatanSelanjutnya(poinHariIni(hi({ slot: [1, 2, 3, 4, 5], laporanSudah: true }), "/x").kode)).toBe(false);
    expect(poinKegiatanSelanjutnya(poinHariIni(hi({ adaJadwal: false }), "/x").kode)).toBe(false);
    expect(poinKegiatanSelanjutnya("info")).toBe(false);
  });
});

describe("kartu per survei", () => {
  const keg = (h: RingkasHariIni | undefined) => [{ kegiatan_id: 1, judul: "Transport Lokal — Pendataan Pascabencana 2026", hariIni: h }];
  const induk = { pendataan: { total: 400, didata: 100 } };
  const dasar = { id: "akt-pascabencana-pendataan", judul: "Pendataan Pascabencana", href: "/sigap/kegiatan/pascabencana", nada: "biru" as const };

  it("PPL: poin foto awal + realisasi tertinggal berdampingan; nada emas", () => {
    const k = kartuTemplate(dasar, { induk, keg: keg(hi({ tanggal: "2026-10-31", adaJadwal: true })), idTranslok: [1], nowMs: at("2026-10-31", "10:00") }, null);
    expect(k.peran).toBe("ppl");
    expect(k.poin?.kode).toBe("foto_awal");
    expect(k.realisasi?.bermasalah).toBe(true);
    expect(k.peringatan).toBeNull();
    expect(k.nada).toBe("emas");
    expect(k.redup).toBe(false);
  });
  it("lewat 13.00 tanpa kerja -> peringatan merah, nada merah", () => {
    const k = kartuTemplate(dasar, { induk, keg: keg(hi()), idTranslok: [1], nowMs: at(JUM, "13:30") }, null);
    expect(k.peringatan?.judul).toBe("Belum ada kegiatan hari ini");
    expect(k.nada).toBe("merah");
  });
  it("supervisor tidak punya chip realisasi", () => {
    const k = kartuTemplate(dasar, { induk, keg: keg(hi({ peran: "supervisor" })), idTranslok: [1], nowMs: at(JUM, "10:00") }, null);
    expect(k.peran).toBe("supervisor");
    expect(k.realisasi).toBeNull();
  });
  it("tanpa ringkasan hari ini memakai poin cadangan", () => {
    const cad = { kode: "info" as const, nada: "biru" as const, judul: "Konfirmasi kesediaan", uraian: "", aksi: "Buka", href: "/x" };
    const k = kartuTemplate(dasar, { induk, keg: keg(undefined), idTranslok: [1], nowMs: at(JUM, "10:00") }, cad);
    expect(k.poin).toBe(cad);
    expect(k.realisasi).toBeNull();
  });
  it("kegiatan selesai -> kartu usang (redup)", () => {
    const k = kartuTemplate({ ...dasar, nada: "hijau" }, { induk, keg: keg(hi()), idTranslok: [1], nowMs: at(JUM, "14:00") }, null);
    expect(k.redup).toBe(true);
    expect(k.nada).toBe("hijau");
  });
  it("kartu biasa selesai: redup tanpa poin", () => {
    const k = kartuBiasa({ id: "a", judul: "Pelatihan X", href: "/p", nada: "hijau", jenis: "pelatihan" }, { kode: "info", nada: "biru", judul: "x", uraian: "", aksi: "Buka", href: "/p" });
    expect(k.redup).toBe(true);
    expect(k.poin).toBeNull();
  });
});

describe("urutan kartu", () => {
  const k = (id: string, o: Partial<KartuBeranda>): KartuBeranda => ({ id, jenis: "pendataan", judul: id, peran: "ppl", href: "/", nada: "biru", redup: false, poin: null, realisasi: null, peringatan: null, ...o });
  const poin = (nada: "merah" | "emas" | "biru" | "abu" | "hijau") => ({ kode: "info" as const, nada, judul: "", uraian: "", aksi: "", href: "/" });
  it("peringatan merah paling atas, usang paling bawah, urutan asli dijaga pada seri", () => {
    const hasil = urutKartu([
      k("usang", { redup: true, nada: "hijau" }),
      k("biru1", { poin: poin("biru") }),
      k("abu", { poin: poin("abu"), nada: "abu" }),
      k("merah", { peringatan: { judul: "", uraian: "", href: "/" }, nada: "merah" }),
      k("biru2", { poin: poin("biru") }),
    ]);
    expect(hasil.map((x) => x.id)).toEqual(["merah", "biru1", "biru2", "abu", "usang"]);
  });
  it("realisasi bermasalah naik di atas kartu biasa", () => {
    const r = { didata: 1, total: 10, persen: 10, persenWaktu: 80, sisaHariKerja: 3, targetSelesai: "2026-11-10", bermasalah: true, ket: "" };
    const hasil = urutKartu([k("biasa", { poin: poin("biru") }), k("lambat", { poin: poin("biru"), realisasi: r, nada: "emas" })]);
    expect(hasil[0].id).toBe("lambat");
  });
});

describe("push 13.00 belum mendata", () => {
  const kegBahan = (h: RingkasHariIni | undefined, id = 1) => [{ kegiatan_id: id, judul: "Transport Lokal — Pendataan Pascabencana 2026", hariIni: h }];
  it("lewat 13.00 dan belum ada kerja -> pesan dengan tautan Translok", () => {
    const m = pilihPeringatanPush(kegBahan(hi()), at(JUM, "13:00"), new Set());
    expect(m?.judul).toBe("Belum ada pendataan hari ini");
    expect(m?.isi).toContain("Pendataan Pascabencana 2026");
    expect(m?.url).toBe("/sigap/translok/tok?p=7");
    expect(m?.kunci).toBe("peringatan_belum_mendata|2026-10-30|1");
  });
  it("sudah dikirim hari ini -> tidak dikirim lagi; sudah mendata -> tidak dikirim", () => {
    expect(pilihPeringatanPush(kegBahan(hi()), at(JUM, "13:00"), new Set(["peringatan_belum_mendata|2026-10-30|1"]))).toBeNull();
    expect(pilihPeringatanPush(kegBahan(hi({ slot: [1] })), at(JUM, "13:00"), new Set())).toBeNull();
    expect(pilihPeringatanPush(kegBahan(hi({ adaJadwal: false })), at(JUM, "13:00"), new Set())).toBeNull();
    expect(pilihPeringatanPush(kegBahan(undefined), at(JUM, "13:00"), new Set())).toBeNull();
  });
  it("sebelum 13.00 -> belum dikirim; supervisor hari genap -> tidak dikirim", () => {
    expect(pilihPeringatanPush(kegBahan(hi()), at(JUM, "12:00"), new Set())).toBeNull();
    const kamis = "2026-10-29";
    expect(pilihPeringatanPush(kegBahan(hi({ peran: "supervisor", tanggal: kamis })), at(kamis, "13:00"), new Set())).toBeNull();
  });
  it("isi pesan tidak melebihi 160 karakter", () => {
    const panjang = [{ kegiatan_id: 1, judul: `Transport Lokal — ${"Survei Sangat Panjang ".repeat(20)}`, hariIni: hi() }];
    expect(pilihPeringatanPush(panjang, at(JUM, "13:00"), new Set())!.isi.length).toBeLessThanOrEqual(160);
  });
});
