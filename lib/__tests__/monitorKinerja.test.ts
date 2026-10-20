import { describe, expect, it } from "vitest";
import {
  ATURAN,
  daftarTanggal,
  hariKerjaKalender,
  jarakPerkiraanKm,
  kelasHari,
  matriksPoin,
  perkiraanAnggaran,
  poinHari,
  PARAM_AWAL,
  realisasiHariKerja,
  realisasiPpl,
  susunRute,
  susunTransport,
  tanggalWib,
  targetTanggal,
  urutanSub,
  type DataKinerja,
  type HariOrang,
  type OrangKinerja,
} from "@/lib/monitorKinerja";
import { hitungPoinHari, hitungRealisasi } from "@/lib/skorKinerja";

const hari = (tanggal: string, o: Partial<HariOrang> = {}): HariOrang => ({ tanggal, hari_kerja: true, lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: true, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0, km: 0, metode: "jalan", ...o });

describe("kelasHari (Transport lokal)", () => {
  it("lengkap: hari kerja + hasil + laporan/foto penuh", () => expect(kelasHari(hari("2026-10-16"))).toBe("lengkap"));
  it("sebagian: ada hasil tetapi laporan/foto belum penuh", () => expect(kelasHari(hari("2026-10-16", { lengkap: false, jumlah_foto: 2 }))).toBe("sebagian"));
  it("sebagian: laporan lengkap tetapi belum ada hasil", () => expect(kelasHari(hari("2026-10-16", { aktif: false }))).toBe("sebagian"));
  it("kosong: hari kerja dipilih, laporan DAN foto belum ada sama sekali", () => expect(kelasHari(hari("2026-10-16", { ada_laporan: false, jumlah_foto: 0, lengkap: false, aktif: false }))).toBe("kosong"));
  it("kosong walau ada hasil tetapi laporan dan foto belum ada", () => expect(kelasHari(hari("2026-10-16", { ada_laporan: false, jumlah_foto: 0, lengkap: false, aktif: true }))).toBe("kosong"));
  it("hanya foto saja bukan kosong", () => expect(kelasHari(hari("2026-10-16", { ada_laporan: false, jumlah_foto: 1, lengkap: false }))).toBe("sebagian"));
  it("anomali: ada hasil tanpa hari kerja dipilih", () => expect(kelasHari(hari("2026-10-16", { hari_kerja: false, ada_laporan: false, jumlah_foto: 0, lengkap: false }))).toBe("anomali"));
  it("tidak ada: bukan hari kerja dan tanpa kegiatan", () => expect(kelasHari(hari("2026-10-16", { hari_kerja: false, ada_laporan: false, jumlah_foto: 0, lengkap: false, aktif: false }))).toBe("tidak_ada"));
});

const orang = (id: number, nama: string, h: HariOrang[], peran: OrangKinerja["peran"] = "ppl", pml = 1): OrangKinerja => ({ akun_id: id, nama, peran, pml_id: peran === "ppl" ? pml : peran === "pml" ? pml : null, pml_nama: "PML", sisa_kk: 0, rumah_ke_sisa_km: null, hari: h });

describe("susunTransport", () => {
  const o = orang(1, "Ani", [hari("2026-10-15"), hari("2026-10-16", { lengkap: false }), hari("2026-10-17", { ada_laporan: false, jumlah_foto: 0, lengkap: false }), hari("2026-10-18", { hari_kerja: false, lengkap: false, ada_laporan: false, jumlah_foto: 0 })]);
  it("menghitung per kelas dan mencatat tanggalnya", () => {
    const { baris, total } = susunTransport([o], null, null);
    expect(baris[0]).toMatchObject({ hari_kerja: 3, lengkap: 1, sebagian: 1, kosong: 1, anomali: 1, tanggal_kosong: ["2026-10-17"], tanggal_anomali: ["2026-10-18"] });
    expect(total).toMatchObject({ orang: 1, hari_kerja: 3, lengkap: 1, sebagian: 1, kosong: 1, anomali: 1 });
  });
  it("rentang tanggal membatasi hitungan", () => {
    const { baris } = susunTransport([o], "2026-10-16", "2026-10-16");
    expect(baris[0]).toMatchObject({ hari_kerja: 1, lengkap: 0, sebagian: 1, kosong: 0, anomali: 0 });
  });
});

describe("poinHari", () => {
  // aturan lama (15-19 Okt 2026): target 45, 1 poin per km -- hari yang sudah berlalu tidak berubah
  const V1 = "2026-10-16";
  it("5 poin terdampak, 1 poin tidak terdampak, 1 poin per km (aturan lama, 16 Okt)", () => {
    expect(poinHari({ tanggal: V1, terdampak: 6, tidak_terdampak: 4, km: 8.5 })).toMatchObject({ poin_kk: 34, poin_jarak: 8.5, total: 42.5, persen: 94 });
  });
  it("poin jarak dibatasi 15", () => expect(poinHari({ tanggal: V1, terdampak: 1, tidak_terdampak: 0, km: 40 }).poin_jarak).toBe(15));
  it("KK tidak ditemukan saja tetap mendapat poin jarak (sama dengan skor kinerja asli)", () => expect(poinHari({ tanggal: V1, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 3, km: 12.345 })).toMatchObject({ poin_kk: 0, poin_jarak: 12.35, total: 12.35 }));
  it("tanpa KK didata tidak ada poin jarak", () => expect(poinHari({ tanggal: V1, terdampak: 0, tidak_terdampak: 0, km: 12 }).total).toBe(0));
  // aturan baru (mulai 20 Okt 2026): target 60, poin jarak tetap 1 per km
  it("aturan baru mulai 20 Okt: poin jarak tetap, target 60", () => {
    expect(poinHari({ tanggal: "2026-10-20", terdampak: 6, tidak_terdampak: 4, km: 8.5 })).toMatchObject({ poin_kk: 34, poin_jarak: 8.5, total: 42.5, persen: 71 });
    expect(poinHari({ tanggal: "2026-10-20", terdampak: 1, tidak_terdampak: 0, km: 100 }).poin_jarak).toBe(15);
    expect(poinHari({ tanggal: "2026-10-20", terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 3, km: 12.345 })).toMatchObject({ poin_jarak: 12.35 });
  });
  it("tanpa tanggal = aturan yang berlaku sekarang", () => {
    expect(poinHari({ terdampak: 6, tidak_terdampak: 4, km: 8.5 }).total).toBe(42.5);
  });
  it("targetTanggal menurut tanggal", () => {
    expect(targetTanggal("2026-10-19")).toBe(45);
    expect(targetTanggal("2026-10-20")).toBe(60);
  });
});

describe("realisasiPpl (hutang kumulatif, dibulatkan ke bawah)", () => {
  const ok = (t: string, terd: number, o: Partial<HariOrang> = {}) => hari(t, { terdampak: terd, ...o });
  it("sebelum 15 Okt tiap hari lengkap dihitung penuh", () => {
    expect(realisasiPpl([hari("2026-10-12"), hari("2026-10-13"), hari("2026-10-14", { lengkap: false })]).ok).toBe(2);
  });
  it("target tercapai tiap hari = 1 O-K per hari, kelebihan tidak menambah", () => {
    const r = realisasiPpl([ok("2026-10-15", 9), ok("2026-10-16", 20), ok("2026-10-17", 9)]);
    expect(r).toMatchObject({ ok: 3, hutang: 0 });
  });
  it("kekurangan menjadi hutang dan ditutup poin hari berikutnya lebih dulu", () => {
    // hari 1: 30 poin -> hutang 15 ; hari 2: 60 poin -> menutup hutang 15 + target 45 -> hutang 0 ; kredit 90 -> 2 O-K
    const r = realisasiPpl([ok("2026-10-15", 6), ok("2026-10-16", 12)]);
    expect(r).toMatchObject({ kredit: 90, hutang: 0, ok: 2 });
  });
  it("hutang di akhir periode tidak dibayar, pecahan dibulatkan ke bawah", () => {
    const r = realisasiPpl([ok("2026-10-15", 9), ok("2026-10-16", 6)]); // 45 + 30 = 75 -> 1,67 -> 1
    expect(r).toMatchObject({ kredit: 75, hutang: 15, ok: 1 });
  });
  it("hari tidak lengkap atau bukan hari kerja tidak dikredit dan tidak membuat hutang", () => {
    const r = realisasiPpl([ok("2026-10-15", 9), ok("2026-10-16", 0, { lengkap: false }), ok("2026-10-17", 0, { hari_kerja: false })]);
    expect(r).toMatchObject({ ok: 1, hutang: 0 });
  });
  it("hari kerja lengkap tanpa kegiatan = hutang 45", () => {
    expect(realisasiPpl([hari("2026-10-16", { aktif: false })])).toMatchObject({ ok: 0, hutang: 45 });
  });
  it("realisasiHariKerja (PML/korwil) menghitung hari kerja lengkap", () => {
    expect(realisasiHariKerja([hari("2026-10-15"), hari("2026-10-16", { lengkap: false }), hari("2026-10-17", { hari_kerja: false })])).toBe(1);
  });
});

describe("tanggal & rute", () => {
  it("tanggalWib menggeser ke WIB", () => {
    expect(tanggalWib(Date.parse("2026-10-14T17:30:00Z"))).toBe("2026-10-15");
    expect(tanggalWib(Date.parse("2026-10-15T16:59:00Z"))).toBe("2026-10-15");
  });
  it("hari kerja kalender", () => {
    expect(hariKerjaKalender("2026-10-18", "sen_sab")).toBe(false); // Minggu
    expect(hariKerjaKalender("2026-10-17", "sen_sab")).toBe(true); // Sabtu
    expect(hariKerjaKalender("2026-10-17", "sen_jum")).toBe(false);
    expect(hariKerjaKalender("2026-10-18", "setiap")).toBe(true);
  });
  it("daftarTanggal inklusif", () => expect(daftarTanggal("2026-10-15", "2026-10-17")).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"]));
  it("urutan Sub SLS menurut waktu penandaan pertama", () => {
    expect(urutanSub([{ idsubsls: "B", waktu: 20 }, { idsubsls: "A", waktu: 10 }, { idsubsls: "B", waktu: 5 }])).toEqual(["B", "A"]);
  });
  it("rute rumah-A-B-rumah dan jarak perkiraan = garis lurus x 1,3", () => {
    const rumah = { lat: -0.8, lng: 100.6 };
    const a = { lat: -0.8, lng: 100.7 };
    expect(susunRute(null, [a])).toBeNull();
    expect(susunRute(rumah, [null])).toBeNull();
    const r = susunRute(rumah, [a, null])!;
    expect(r).toEqual([rumah, a, rumah]);
    const km = jarakPerkiraanKm(r);
    expect(km).toBeGreaterThan(2 * 11.0 * 1.3 - 0.5);
    expect(km).toBeLessThan(2 * 11.2 * 1.3 + 0.5);
  });
});

const dasar = (orangs: OrangKinerja[], hariIni = "2026-10-18"): DataKinerja => ({
  sekarang: `${hariIni}T07:00:00Z`,
  hari_ini: hariIni,
  mulai_kegiatan: "2026-10-10",
  mulai_bobot: ATURAN.mulaiBobot,
  batas: "2026-11-10",
  tenggang_hari: 7,
  tarif: { ppl: 170000, pml: 170000, korwil: 170000 },
  kuota: { ppl: 3458, pml: 980, korwil: null },
  orang: orangs,
  tertunda: 0,
  osrm: true,
});

describe("matriksPoin", () => {
  const o = orang(1, "Ani", [hari("2026-10-15", { terdampak: 6, tidak_terdampak: 4, km: 8.5 }), hari("2026-10-16", { terdampak: 2, tidak_terdampak: 0, km: 3 }), hari("2026-10-18", { terdampak: 9, km: 2 })]);
  const pml = orang(2, "PML Satu", [hari("2026-10-15")], "pml");
  const kw = orang(3, "Korwil", [], "korwil");
  const { baris, ringkas } = matriksPoin(dasar([o, pml, kw]));
  it("hanya PPL (korwil tanpa KK dan PML tidak tampil)", () => expect(baris.map((b) => b.nama)).toEqual(["Ani"]));
  it("kolom dari 15 Okt sampai hari ini", () => expect(ringkas.tanggal).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]));
  it("sel hari tanpa kegiatan kosong, hari lain berisi poin", () => {
    expect(baris[0].sel.map((s) => s.ada)).toEqual([true, true, false, true]);
    expect(baris[0].sel[0]).toMatchObject({ poin: 42.5, persen: 94 });
    expect(baris[0].total).toBe(42.5 + 13 + 47);
    expect(baris[0].hari_penuh).toBe(1); // 18 Okt: 45 + 2 = 47
  });
  it("ringkasan hari ini", () => expect(ringkas).toMatchObject({ petugas: 1, penuh_hari_ini: 1, rata_hari_ini: 47 }));
});

describe("perkiraanAnggaran", () => {
  const ppl = (id: number, nama: string, sisa: number, terd: number, pmlId = 10): OrangKinerja => ({
    ...orang(id, nama, [], "ppl", pmlId),
    sisa_kk: sisa,
    rumah_ke_sisa_km: 5,
    hari: daftarTanggal("2026-10-10", "2026-10-17").filter((t) => hariKerjaKalender(t, "sen_sab")).map((t) => hari(t, { terdampak: terd, km: 6 })),
  });
  const pml: OrangKinerja = { ...orang(90, "PML", [], "pml", 10), hari: [hari("2026-10-15"), hari("2026-10-16")] };
  it("realisasi, sisa, total dan rupiah konsisten", () => {
    const d = dasar([ppl(1, "A", 100, 9), ppl(2, "B", 50, 4), pml]);
    const r = perkiraanAnggaran(d, { ...PARAM_AWAL });
    expect(r.realisasi.ppl).toBeGreaterThan(0);
    expect(r.realisasi.pml_korwil).toBe(2);
    expect(r.realisasi.rupiah).toBe((r.realisasi.ppl + 2) * 170000);
    expect(r.total.ok).toBe(r.realisasi.ok + r.sisa.ok);
    expect(r.total.rupiah).toBe(r.realisasi.rupiah + r.sisa.rupiah);
    expect(r.sisa.ok).toBeGreaterThan(0);
  });
  it("sisa hari: tuntas sendiri >= dibagi rata", () => {
    const d = dasar([ppl(1, "A", 400, 9), ppl(2, "B", 20, 9)]);
    const r = perkiraanAnggaran(d, { ...PARAM_AWAL });
    expect(r.hari.tuntas_sendiri!).toBeGreaterThanOrEqual(r.hari.dibagi_rata!);
    expect(r.hari.selesai_tuntas_sendiri! >= r.hari.selesai_dibagi_rata!).toBe(true);
  });
  it("tanpa PML dan korwil: hanya PPL", () => {
    const d = dasar([ppl(1, "A", 100, 9), pml]);
    const r = perkiraanAnggaran(d, { ...PARAM_AWAL, sertakanPmlKorwil: false });
    expect(r.realisasi.pml_korwil).toBe(0);
    expect(r.baris.every((b) => b.peran === "ppl")).toBe(true);
  });
  it("tidak ada sisa KK -> sisa hari 0 dan tidak melewati batas", () => {
    const r = perkiraanAnggaran(dasar([ppl(1, "A", 0, 9)]), { ...PARAM_AWAL });
    expect(r.hari.dibagi_rata).toBe(0);
    expect(r.hari.tuntas_sendiri).toBe(0);
    expect(r.hari.lewat_batas_tuntas_sendiri).toBe(false);
  });
  it("PPL tanpa riwayat memakai laju rata-rata dan dihitung sebagai pengganti", () => {
    const baru: OrangKinerja = { ...orang(3, "Baru", [], "ppl", 10), sisa_kk: 40, rumah_ke_sisa_km: 3 };
    const r = perkiraanAnggaran(dasar([ppl(1, "A", 100, 9), baru]), { ...PARAM_AWAL });
    expect(r.asumsi.ppl_laju_pengganti).toBe(1);
    expect(r.baris.find((b) => b.nama === "Baru")!.sisa_hari).toBeGreaterThan(0);
  });
  it("batas 10 Nov: laju sangat lambat melewati batas", () => {
    const lambat = ppl(1, "Lambat", 2000, 1);
    const r = perkiraanAnggaran(dasar([lambat]), { ...PARAM_AWAL });
    expect(r.hari.lewat_batas_tuntas_sendiri).toBe(true);
    expect(r.hari.batas_tenggang).toBe("2026-11-17");
  });
  it("pola Senin-Jumat memperpanjang tanggal selesai dibanding setiap hari", () => {
    const d = dasar([ppl(1, "A", 400, 5)]);
    const a = perkiraanAnggaran(d, { ...PARAM_AWAL, pola: "sen_jum" });
    const b = perkiraanAnggaran(d, { ...PARAM_AWAL, pola: "setiap" });
    expect(a.hari.selesai_tuntas_sendiri! >= b.hari.selesai_tuntas_sendiri!).toBe(true);
  });
});

describe("kesetaraan dengan lib/skorKinerja.ts (aturan asli)", () => {
  const kasus = [
    { t: 6, n: 4, d: 0, km: 8.5 },
    { t: 0, n: 0, d: 3, km: 12.345 },
    { t: 1, n: 0, d: 0, km: 40 },
    { t: 0, n: 0, d: 0, km: 9 },
    { t: 9, n: 2, d: 1, km: 3.333 },
    { t: 2, n: 20, d: 5, km: 0 },
  ];
  it("poin harian sama dengan hitungPoinHari", () => {
    for (const k of kasus) {
      const a = poinHari({ terdampak: k.t, tidak_terdampak: k.n, tidak_ditemukan: k.d, km: k.km });
      const b = hitungPoinHari({ terdampak: k.t, tidak_terdampak: k.n, tidak_ditemukan: k.d, km: k.km });
      expect(a.total).toBe(b.total);
      expect(a.poin_jarak).toBe(b.poin_jarak);
    }
  });
  it("realisasi O-K sama dengan hitungRealisasi (campuran hari lama, bobot, tidak lengkap, hutang)", () => {
    const tgl = daftarTanggal("2026-10-12", "2026-10-30");
    const hs: HariOrang[] = tgl.map((t, i) => {
      const k = kasus[i % kasus.length];
      return hari(t, { terdampak: k.t, tidak_terdampak: k.n, tidak_ditemukan: k.d, km: k.km, lengkap: i % 5 !== 3 });
    });
    const a = realisasiPpl(hs);
    const b = hitungRealisasi(hs.map((h) => ({ tanggal: h.tanggal, lengkap: h.lengkap, terdampak: h.terdampak, tidak_terdampak: h.tidak_terdampak, tidak_ditemukan: h.tidak_ditemukan, km: h.km })));
    expect(a.ok).toBe(b.ok_dibayar);
    expect(a.hari_dihitung).toBe(b.hari_dihitung);
    expect(a.hutang).toBeCloseTo(b.hutang_poin, 2);
  });
});
