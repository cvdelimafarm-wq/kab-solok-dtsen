import { describe, expect, it } from "vitest";
import { BAWAAN_TRANSLOK, bacaTranslok, bacaUmum, cekUrutan, fasihAktif, gabungRiwayat, jenisLogFasih, menitDariJam, statusDenyut, tahapJatuhTempo, validasiSimpan } from "../pushPengaturan";

/** Jam WIB (tanggal tetap) -> ms epoch UTC. */
const wib = (jam: string) => Date.parse(`2026-11-02T${jam}:00+07:00`);

describe("bawaan + pembacaan", () => {
  it("tanpa baris = bawaan penuh (13.00 / 17.00 / 21.00, foto 1 dan 4, jarak 4 jam, menyala)", () => {
    expect(bacaTranslok([])).toEqual({ aktif: true, jam1: "13:00", jam2: "17:00", jam3: "21:00", foto1: 1, foto2: 4, jarak_jam: 4 });
    expect(bacaUmum([])).toEqual({ maks_harian: 5 });
  });
  it("baris ada: nilai dipakai; bidang rusak diganti bawaan per bidang", () => {
    const s = bacaTranslok([{ kunci: "translok", aktif: false, nilai: { jam1: "09:30", jam2: "abc", foto1: 2 } }]);
    expect(s).toMatchObject({ aktif: false, jam1: "09:30", jam2: "17:00", foto1: 2, foto2: 4 });
  });
  it("kombinasi jam tersimpan yang melanggar urutan/jarak -> jam kembali bawaan", () => {
    const s = bacaTranslok([{ kunci: "translok", aktif: true, nilai: { jam1: "20:00", jam2: "10:00", jam3: "22:00" } }]);
    expect([s.jam1, s.jam2, s.jam3]).toEqual(["13:00", "17:00", "21:00"]);
  });
  it("FASIH: tidak ada baris = menyala; baris mati = mati", () => {
    expect(fasihAktif([], "fasih_minta")).toBe(true);
    expect(fasihAktif([{ kunci: "fasih_minta", aktif: false }], "fasih_minta")).toBe(false);
    expect(fasihAktif([{ kunci: "fasih_minta", aktif: false }], "fasih_tolak")).toBe(true);
    expect(jenisLogFasih("fasih_tugas")).toBe("alur_fasih_tugas");
  });
  it("menitDariJam: kelipatan 5 saja", () => {
    expect(menitDariJam("10:00")).toBe(600);
    expect(menitDariJam("10:03")).toBeNull();
    expect(menitDariJam("24:00")).toBeNull();
    expect(menitDariJam(1000)).toBeNull();
  });
});

describe("tahapJatuhTempo (jendela 15 menit sejak jam)", () => {
  const s = { ...BAWAAN_TRANSLOK };
  it("tepat jam, +10 menit masuk; +15 menit keluar; sebelum jam belum", () => {
    expect(tahapJatuhTempo(s, wib("13:00"))).toBe(1);
    expect(tahapJatuhTempo(s, wib("13:10"))).toBe(1);
    expect(tahapJatuhTempo(s, wib("13:15"))).toBeNull();
    expect(tahapJatuhTempo(s, wib("12:55"))).toBeNull();
  });
  it("tahap 2 dan 3", () => {
    expect(tahapJatuhTempo(s, wib("17:05"))).toBe(2);
    expect(tahapJatuhTempo(s, wib("21:00"))).toBe(3);
    expect(tahapJatuhTempo(s, wib("21:14"))).toBe(3);
    expect(tahapJatuhTempo(s, wib("22:00"))).toBeNull();
  });
  it("nonaktif -> tidak ada", () => {
    expect(tahapJatuhTempo({ ...s, aktif: false }, wib("13:00"))).toBeNull();
  });
  it("22.45 masih sempat sebelum jam senyap 23.00 (cron terakhir 22.55)", () => {
    expect(tahapJatuhTempo({ ...s, jam3: "22:45" }, wib("22:55"))).toBe(3);
  });
});

describe("cekUrutan / validasiSimpan", () => {
  it("bawaan sah", () => expect(cekUrutan(BAWAAN_TRANSLOK)).toBeNull());
  it("menolak sebelum 06.00, sesudah 22.45, urutan salah, jarak kurang, syarat foto terbalik", () => {
    expect(cekUrutan({ ...BAWAAN_TRANSLOK, jam1: "05:00" })).toMatch(/06\.00/);
    expect(cekUrutan({ ...BAWAAN_TRANSLOK, jam3: "23:00" })).toMatch(/22\.45/);
    expect(cekUrutan({ ...BAWAAN_TRANSLOK, jam2: "09:00" })).toMatch(/Urutan/);
    expect(cekUrutan({ ...BAWAAN_TRANSLOK, jam2: "15:00" })).toMatch(/Jarak/);
    expect(cekUrutan({ ...BAWAAN_TRANSLOK, foto1: 4, foto2: 2 })).toMatch(/foto/);
  });
  it("simpan translok: bidang yang tidak dikirim memakai nilai tersimpan", () => {
    const r = validasiSimpan({ kegiatan: 2, kunci: "translok", aktif: true, nilai: { jam1: "09:00" } }, [{ kunci: "translok", aktif: true, nilai: { foto2: 3 } }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.nilai).toMatchObject({ jam1: "09:00", jam2: "17:00", foto2: 3 });
  });
  it("simpan menolak kunci asing, kegiatan tidak sah, aktif bukan boolean, jarak di luar rentang", () => {
    expect(validasiSimpan({ kegiatan: 2, kunci: "entah", aktif: true }).ok).toBe(false);
    expect(validasiSimpan({ kegiatan: 0, kunci: "translok", aktif: true }).ok).toBe(false);
    expect(validasiSimpan({ kegiatan: 2, kunci: "fasih_minta", aktif: "ya" }).ok).toBe(false);
    expect(validasiSimpan({ kegiatan: 2, kunci: "translok", aktif: true, nilai: { jarak_jam: 20 } }).ok).toBe(false);
  });
  it("simpan umum dan fasih", () => {
    expect(validasiSimpan({ kegiatan: 1, kunci: "umum", aktif: true, nilai: { maks_harian: 7 } })).toEqual({ ok: true, nilai: { kegiatan: 1, kunci: "umum", aktif: true, nilai: { maks_harian: 7 } } });
    expect(validasiSimpan({ kegiatan: 1, kunci: "umum", aktif: true, nilai: { maks_harian: 99 } }).ok).toBe(false);
    expect(validasiSimpan({ kegiatan: 1, kunci: "fasih_tolak", aktif: false })).toEqual({ ok: true, nilai: { kegiatan: 1, kunci: "fasih_tolak", aktif: false, nilai: {} } });
  });
});

describe("gabungRiwayat", () => {
  const b = (dibuat_at: string, jenis: string, judul: string, o: Partial<{ oleh: number | null; akun: number | null; trm: number; gg: number }> = {}) => ({
    dibuat_at, jenis, judul, oleh_akun_id: o.oleh ?? null, jumlah_akun: o.akun ?? null, jumlah_perangkat: 2, terkirim: o.trm ?? 1, gagal: o.gg ?? 0,
  });
  it("pengingat per penerima digabung per jam; terbaru di atas", () => {
    const r = gabungRiwayat([
      b("2026-11-02T03:00:10Z", "pengingat_terjadwal", "A", { oleh: 1 }),
      b("2026-11-02T03:00:40Z", "pengingat_terjadwal", "B", { oleh: 2 }),
      b("2026-11-02T10:00:10Z", "pengingat_terjadwal", "C", { oleh: 3 }),
      b("2026-11-02T05:00:00Z", "siaran_pendataan", "Rapat", { akun: 40, trm: 70 }),
    ]);
    expect(r.map((x) => x.judul)).toEqual(["Pengingat Translok", "Rapat", "Pengingat Translok"]);
    expect(r[2]).toMatchObject({ akun: 2, terkirim: 2 });
    expect(r[1]).toMatchObject({ akun: 40, terkirim: 70, label: "Siaran (manual)" });
  });
  it("jenis lain dengan judul sama pada menit sama digabung; judul kosong memakai label", () => {
    const r = gabungRiwayat([b("2026-11-02T03:00:10Z", "alur_fasih_keluar", "", { akun: 1 }), b("2026-11-02T03:00:50Z", "alur_fasih_keluar", "", { akun: 1 })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ akun: 2, judul: "FASIH · sudah keluar" });
  });
});

describe("statusDenyut", () => {
  const now = Date.parse("2026-11-02T10:00:00Z");
  it("hidup / terlambat / mati / belum", () => {
    expect(statusDenyut("2026-11-02T09:55:00Z", now)).toBe("hidup");
    expect(statusDenyut("2026-11-02T09:00:00Z", now)).toBe("terlambat");
    expect(statusDenyut("2026-11-02T06:00:00Z", now)).toBe("mati");
    expect(statusDenyut(null, now)).toBe("belum");
  });
});
