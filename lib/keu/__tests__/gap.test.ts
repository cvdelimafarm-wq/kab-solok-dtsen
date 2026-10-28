// lib/keu/__tests__/gap.test.ts
//
// (25 Okt 2026, tahap 32) Uji aturan temuan Gap: jumlah petugas, jadwal, laporan harian, biaya, evaluasi, tautan, dan pembantu urutan/sidik/keras baru.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, normalisasi } from "../identifikasi";
import type { BarisRincian, IsiLanjutan } from "../lanjutan";
import type { BahanPelaksanaan, KegiatanBahan } from "../pelaksanaan";
import { hitungGap, potongPesan, MAKS_PESAN, hitungTingkat, kerasBaru, layakLaporanAkhir, normalisasiTemuan, ringkasGap, sidikTemuan, urutkanTemuan, type MasukanGap, type Temuan } from "../gap";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const isiDasar = (): IsiLanjutan => salin(vektor.base) as IsiLanjutan;
const form = (() => { const f = awalForm(); f.nama = "UJI"; return normalisasi(f); })();

function keg(ubah?: (k: KegiatanBahan) => void): KegiatanBahan {
  const k: KegiatanBahan = {
    id: 1, kode: "uji", nama: "Kegiatan Uji", kode_anggaran: "x", jenis: "pendataan", aktif: true, mulai: "2026-03-01", selesai: "2026-03-15", fungsi: "pendataan", tarif: [], rapat_evaluasi: 0, presensi: 0,
    petugas: [
      { akun_id: 1, nama: "A", peran: "pml", aktif: true, maks_hari: null, kelas: null, hari_kerja: 3, laporan: 3, lapor_pertama: "2026-03-02", lapor_terakhir: "2026-03-04" },
      { akun_id: 2, nama: "B", peran: "ppl", aktif: true, maks_hari: null, kelas: null, hari_kerja: 4, laporan: 4, lapor_pertama: "2026-03-02", lapor_terakhir: "2026-03-05" },
    ],
  };
  ubah?.(k);
  return k;
}
const bahan = (ks: KegiatanBahan[], real: BahanPelaksanaan["realisasi"] = []): BahanPelaksanaan => ({ ident_id: 1, ro_kode: "RO", tahun: 2026, dibuat_at: "", kegiatan: ks, realisasi: real, realisasi_sampai: real.length ? "2026-03-01" : null });
function masukan(ubah?: (m: MasukanGap) => void): MasukanGap {
  const m: MasukanGap = { form, isi: isiDasar(), pascaH15: false, bahan: bahan([keg()]), rincian: [], jadwal: [{ periode: "TW I", mulai: "2026-03-01", selesai: "2026-03-15" }], hariIni: "2026-03-10" };
  ubah?.(m);
  return m;
}
const cari = (t: Temuan[], awal: string) => t.filter((x) => x.kunci.startsWith(awal));

describe("tautan dan lanjutan", () => {
  it("tanpa lanjutan: hanya satu informasi", () => {
    const t = hitungGap(masukan((m) => { m.isi = null; }));
    expect(t).toHaveLength(1);
    expect(t[0].kunci).toBe("tautan:lanjutan");
  });
  it("tanpa kegiatan: informasi sebelum jendela, perlu perhatian sesudahnya", () => {
    expect(hitungGap(masukan((m) => { m.bahan = bahan([]); m.hariIni = "2026-02-01"; }))[0].tingkat).toBe("info");
    expect(hitungGap(masukan((m) => { m.bahan = bahan([]); m.hariIni = "2026-03-02"; }))[0].tingkat).toBe("sedang");
  });
  it("tanpa kegiatan pendataan: hanya informasi tautan", () => {
    const t = hitungGap(masukan((m) => { m.bahan = bahan([keg((k) => { k.fungsi = "pelatihan"; })]); }));
    expect(cari(t, "tautan:pendataan")).toHaveLength(1);
    expect(cari(t, "petugas")).toHaveLength(0);
  });
  it("sesudah H-15 diubah: temuan kebijakan", () => {
    expect(cari(hitungGap(masukan((m) => { m.pascaH15 = true; })), "kebijakan:pasca_h15")).toHaveLength(1);
  });
});

describe("jumlah petugas", () => {
  const dgn = (rencana: Record<string, number>, ubah?: (m: MasukanGap) => void) => masukan((m) => {
    const isi = m.isi as IsiLanjutan;
    for (const k of Object.keys(isi.peran) as (keyof IsiLanjutan["peran"])[]) { isi.peran[k].on = false; isi.peran[k].nOrg = 0; isi.peran[k].nMit = 0; }
    for (const [k, n] of Object.entries(rencana)) { const p = isi.peran[k as keyof IsiLanjutan["peran"]]; p.on = true; p.nOrg = n; p.nMit = 0; }
    ubah?.(m);
  });
  it("sesuai rencana: tanpa temuan petugas", () => {
    expect(cari(hitungGap(dgn({ pml: 1, ppl: 1 })), "petugas")).toHaveLength(0);
  });
  it("kurang sebelum mulai: informasi; sesudah mulai: perlu perhatian atau keras (>20%)", () => {
    expect(cari(hitungGap(dgn({ ppl: 2 }, (m) => { m.hariIni = "2026-02-01"; (m.bahan as BahanPelaksanaan).kegiatan[0].mulai = "2026-03-01"; })), "petugas:ppl:kurang")[0].tingkat).toBe("info");
    expect(cari(hitungGap(dgn({ ppl: 10 }, (m) => { (m.bahan as BahanPelaksanaan).kegiatan[0].petugas.push(...Array.from({ length: 8 }, (_, i) => ({ akun_id: 100 + i, nama: `X${i}`, peran: "ppl", aktif: true, maks_hari: null, kelas: null, hari_kerja: 1, laporan: 1, lapor_pertama: null, lapor_terakhir: null }))); })), "petugas:ppl:kurang")[0].tingkat).toBe("sedang");
    expect(cari(hitungGap(dgn({ ppl: 10 })), "petugas:ppl:kurang")[0].tingkat).toBe("keras");
  });
  it("lebih dari rencana: perlu perhatian; entri tidak dibandingkan; petugas nonaktif dan akun ganda tidak dihitung", () => {
    expect(cari(hitungGap(dgn({ pml: 1 })), "petugas:ppl:lebih")).toHaveLength(1);
    expect(cari(hitungGap(dgn({ pml: 1, ppl: 0 }, (m) => { (m.isi as IsiLanjutan).peran.ppl.on = true; })), "petugas:ppl:lebih")[0].tingkat).toBe("sedang");
    const m = dgn({ entri: 5, ppl: 1 }, (x) => {
      const k = (x.bahan as BahanPelaksanaan).kegiatan[0];
      k.petugas.push({ ...k.petugas[1], aktif: false, akun_id: 99 }, { ...k.petugas[1] });
    });
    expect(ringkasGap(m).peran.find((p) => p.peran === "ppl")?.aktual).toBe(1);
    expect(ringkasGap(m).peran.find((p) => p.peran === "entri")).toBeUndefined();
  });
  it("kortim dipetakan ke korwil", () => {
    const m = dgn({ kortim: 1 }, (x) => { (x.bahan as BahanPelaksanaan).kegiatan[0].petugas[0].peran = "korwil"; });
    expect(ringkasGap(m).peran[0].aktual).toBe(1);
  });
});

describe("laporan harian dan jadwal", () => {
  it("kegiatan berakhir dengan laporan kurang: keras", () => {
    const t = hitungGap(masukan((m) => { m.hariIni = "2026-03-20"; (m.bahan as BahanPelaksanaan).kegiatan[0].petugas[1].laporan = 1; }));
    expect(cari(t, "laporan:1:kurang")[0].tingkat).toBe("keras");
  });
  it("kegiatan berakhir tanpa laporan: keras", () => {
    const t = hitungGap(masukan((m) => { m.hariIni = "2026-03-20"; for (const p of (m.bahan as BahanPelaksanaan).kegiatan[0].petugas) { p.laporan = 0; p.hari_kerja = 0; } }));
    expect(cari(t, "laporan:1:nol")[0].tingkat).toBe("keras");
  });
  it("belum memilih hari kerja saat berjalan: perlu perhatian", () => {
    const t = hitungGap(masukan((m) => { (m.bahan as BahanPelaksanaan).kegiatan[0].petugas[0].hari_kerja = 0; }));
    expect(cari(t, "laporan:1:hari")[0].tingkat).toBe("sedang");
  });
  it("kegiatan berjalan tanpa petugas aktif", () => {
    const t = hitungGap(masukan((m) => { (m.bahan as BahanPelaksanaan).kegiatan[0].petugas = []; }));
    expect(cari(t, "laporan:1:tanpa_petugas")).toHaveLength(1);
  });
  it("periode tak selaras jadwal pendataan: perlu perhatian", () => {
    const t = hitungGap(masukan((m) => { (m.bahan as BahanPelaksanaan).kegiatan[0].mulai = "2026-02-25"; }));
    expect(cari(t, "jadwal:1")[0].tingkat).toBe("sedang");
  });
  it("sama dengan jadwal dan lengkap: tidak ada temuan laporan atau jadwal", () => {
    const t = hitungGap(masukan());
    expect(cari(t, "laporan")).toHaveLength(0);
    expect(cari(t, "jadwal")).toHaveLength(0);
  });
});

describe("biaya dan evaluasi", () => {
  const baris = (akun: string, jumlah: number | null): BarisRincian => ({ kelompok: "Honor", uraian: "Honor", akun, volume: 1, satuan: "x", tarif: jumlah, jumlah } as unknown as BarisRincian);
  it("kebutuhan melebihi sisa: keras; tanpa akun pagu: perlu perhatian; tanpa laporan: informasi", () => {
    const keras = hitungGap(masukan((m) => { m.rincian = [baris("521213", 1000)]; m.bahan = bahan([keg()], [{ akun: "521213", pagu: 800, real_sd: 300, sisa: 500 }]); }));
    expect(cari(keras, "biaya:521213")[0].tingkat).toBe("keras");
    const sedang = hitungGap(masukan((m) => { m.rincian = [baris("524111", 100)]; m.bahan = bahan([keg()], [{ akun: "521213", pagu: 800, real_sd: 300, sisa: 500 }]); }));
    expect(cari(sedang, "biaya:524111")[0].tingkat).toBe("sedang");
    expect(cari(hitungGap(masukan((m) => { m.rincian = [baris("521213", 100)]; })), "biaya:laporan")[0].tingkat).toBe("info");
  });
  it("RAB per survei siap dipakai untuk kebutuhan biaya; draf hanya memberi tahu", () => {
    const real = [{ akun: "521213", pagu: 800, real_sd: 300, sisa: 500 }];
    const rab = (status: "draf" | "siap") => ({ status, baris: [{ akun: "521213", ket: "r", volume: 1, satuan: "x", harga: 400, jumlah: 400 }], berubah: 0 });
    const siap = hitungGap(masukan((m) => { m.rincian = [baris("521213", 1000)]; m.bahan = bahan([keg()], real); m.rabSurvei = rab("siap"); }));
    expect(cari(siap, "biaya:521213")).toHaveLength(0);
    expect(cari(siap, "biaya:rab_selisih")[0].tingkat).toBe("info");
    const draf = hitungGap(masukan((m) => { m.rincian = [baris("521213", 1000)]; m.bahan = bahan([keg()], real); m.rabSurvei = rab("draf"); }));
    expect(cari(draf, "biaya:521213")[0].tingkat).toBe("keras");
    expect(cari(draf, "biaya:rab_draf")).toHaveLength(1);
    const tanpa = hitungGap(masukan((m) => { m.rincian = [baris("521213", 1000)]; m.bahan = bahan([keg()], real); }));
    expect(cari(tanpa, "biaya:rab")).toHaveLength(0);
  });
  it("kegiatan berakhir tanpa rapat evaluasi: perlu perhatian; dengan rapat: tidak ada temuan", () => {
    expect(cari(hitungGap(masukan((m) => { m.hariIni = "2026-03-20"; })), "evaluasi")[0].tingkat).toBe("sedang");
    expect(cari(hitungGap(masukan((m) => { m.hariIni = "2026-03-20"; (m.bahan as BahanPelaksanaan).kegiatan[0].rapat_evaluasi = 1; })), "evaluasi")).toHaveLength(0);
  });
});

describe("ringkasan, urutan, sidik, dan keras baru", () => {
  it("ringkasan menjumlah hari kerja, laporan, kebutuhan, sisa pagu", () => {
    const m = masukan((x) => { x.rincian = [baris2("521213", 400)]; x.bahan = bahan([keg()], [{ akun: "521213", pagu: 800, real_sd: 300, sisa: 500 }]); });
    const r = ringkasGap(m);
    expect(r.hariKerja).toBe(7); expect(r.laporan).toBe(7); expect(r.kebutuhan).toBe(400); expect(r.sisaPagu).toBe(500); expect(r.kegiatan).toBe(1);
    function baris2(akun: string, jumlah: number): BarisRincian { return { kelompok: "Honor", uraian: "Honor", akun, volume: 1, satuan: "x", tarif: jumlah, jumlah } as unknown as BarisRincian; }
  });
  const t = (kunci: string, tingkat: Temuan["tingkat"], kategori: Temuan["kategori"] = "laporan"): Temuan => ({ kunci, kategori, tingkat, pesan: `pesan ${kunci}`, tuju: null });
  it("urutan: keras dulu, lalu kategori, lalu kunci", () => {
    expect(urutkanTemuan([t("b", "info"), t("a", "keras", "biaya"), t("c", "keras", "petugas"), t("d", "sedang")]).map((x) => x.kunci)).toEqual(["c", "a", "d", "b"]);
    expect(hitungTingkat([t("a", "keras"), t("b", "keras"), t("c", "info")])).toEqual({ keras: 2, sedang: 0, info: 1 });
  });
  it("sidik tidak bergantung urutan masukan", () => {
    expect(sidikTemuan([t("a", "keras"), t("b", "info")])).toBe(sidikTemuan([t("b", "info"), t("a", "keras")]));
    expect(sidikTemuan([t("a", "keras")])).not.toBe(sidikTemuan([t("a", "sedang")]));
  });
  it("keras baru: kunci baru atau naik tingkat", () => {
    const lama = [t("a", "keras"), t("b", "sedang")];
    expect(kerasBaru([t("a", "keras"), t("b", "keras"), t("c", "keras"), t("d", "sedang")], lama).map((x) => x.kunci)).toEqual(["b", "c"]);
    expect(kerasBaru([t("a", "keras")], [])).toHaveLength(1);
  });
  it("normalisasi membuang butir yang tidak sah", () => {
    expect(normalisasiTemuan([{ kunci: "a", kategori: "biaya", tingkat: "keras", pesan: "p", tuju: "pl-bendahara" }, { kunci: "", kategori: "biaya", tingkat: "keras", pesan: "p" }, { kunci: "x", kategori: "tak", tingkat: "keras", pesan: "p" }, { kunci: "y", kategori: "biaya", tingkat: "gawat", pesan: "p" }, null, 3])).toEqual([{ kunci: "a", kategori: "biaya", tingkat: "keras", pesan: "p", tuju: "pl-bendahara" }]);
    expect(normalisasiTemuan("x")).toEqual([]);
  });
  it("pesan dipotong pada batas basis data", () => {
    expect(potongPesan("abc")).toBe("abc");
    expect(Array.from(potongPesan("x".repeat(900))).length).toBe(MAKS_PESAN);
    expect(potongPesan("x".repeat(900)).endsWith("…")).toBe(true);
  });
  it("laporan akhir layak hanya sesudah semua kegiatan berakhir", () => {
    expect(layakLaporanAkhir(null, "2026-03-20").layak).toBe(false);
    expect(layakLaporanAkhir(bahan([keg()]), "2026-03-10").layak).toBe(false);
    expect(layakLaporanAkhir(bahan([keg(), keg((k) => { k.id = 2; k.selesai = "2026-04-01"; })]), "2026-03-20").layak).toBe(false);
    expect(layakLaporanAkhir(bahan([keg((k) => { k.selesai = null; })]), "2026-03-20").layak).toBe(false);
    expect(layakLaporanAkhir(bahan([keg()]), "2026-03-20").layak).toBe(true);
  });
});
