import { describe, expect, it } from "vitest";
import { bacaKodeSub, buatProyeksi, jarakMeter, kunciBaris, periksaBarisKk, periksaCatat, petakanBarisExcel, ringkasPerPpl, ringkasPerSub, type BarisRingkas } from "@/lib/pendataan";

// (11 Okt 2026) Uji aturan Pendataan keroyokan: penandaan hasil, validasi baris unggahan, proyeksi peta, ringkasan monitoring.
const KUNCI = "3f2b8c1e-5a4d-4c7e-9b1a-2d6e8f0a1b3c";
const dasar = { kk_id: 12, hasil: "terdampak", waktu: "2026-10-12T03:00:00.000Z", kunci: KUNCI };

describe("periksaCatat", () => {
  it("menerima hasil sah dan merapikan alasan", () => {
    const r = periksaCatat({ ...dasar, hasil: "tidak_ditemukan", alasan: "  rumah   kosong " });
    expect(r.ok && r.isi.alasan).toBe("rumah kosong");
  });
  it("menerima 'belum' (Urungkan)", () => {
    expect(periksaCatat({ ...dasar, hasil: "belum" }).ok).toBe(true);
  });
  it("menolak hasil/kunci/waktu tidak sah", () => {
    expect(periksaCatat({ ...dasar, hasil: "selesai" }).ok).toBe(false);
    expect(periksaCatat({ ...dasar, kunci: "abc" }).ok).toBe(false);
    expect(periksaCatat({ ...dasar, waktu: "kemarin" }).ok).toBe(false);
    expect(periksaCatat({ ...dasar, kk_id: 0 }).ok).toBe(false);
    expect(periksaCatat(null).ok).toBe(false);
  });
  it("menolak alasan > 200 huruf", () => {
    expect(periksaCatat({ ...dasar, alasan: "x".repeat(201) }).ok).toBe(false);
  });
  it("posisi opsional; posisi rusak diabaikan, bukan menggagalkan", () => {
    const a = periksaCatat({ ...dasar, pos: { lat: -0.79, lng: 100.65, akurasi: 12 } });
    expect(a.ok && a.isi.pos?.lat).toBe(-0.79);
    const b = periksaCatat({ ...dasar, pos: { lat: 999, lng: 100 } });
    expect(b.ok && b.isi.pos).toBe(null);
  });
});

describe("periksaBarisKk", () => {
  const sah = { idsubsls: "1303150001000100", nama_kk: " Budi  Santoso ", anggota_lain: "Siti; Ani", patokan: "dekat masjid", lat: "-0,7896", lng: "100,6512" };
  it("menerima baris lengkap, koma desimal diubah titik", () => {
    const r = periksaBarisKk(sah);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.baris.nama_kk).toBe("Budi Santoso");
      expect(r.baris.lat).toBeCloseTo(-0.7896);
      expect(r.baris.lng).toBeCloseTo(100.6512);
    }
  });
  it("koordinat boleh kosong dua-duanya", () => {
    const r = periksaBarisKk({ ...sah, lat: "", lng: null });
    expect(r.ok && r.baris.lat).toBe(null);
  });
  it("menolak koordinat setengah terisi", () => {
    expect(periksaBarisKk({ ...sah, lng: "" }).ok).toBe(false);
  });
  it("menolak koordinat di luar kabupaten dan mengenali yang tertukar", () => {
    const r = periksaBarisKk({ ...sah, lat: "100.6512", lng: "-0.7896" });
    expect(!r.ok && r.pesan).toMatch(/tertukar/);
    expect(periksaBarisKk({ ...sah, lat: "-6.2", lng: "106.8" }).ok).toBe(false);
  });
  it("menolak kode Sub SLS bukan 16 digit atau notasi ilmiah", () => {
    expect(periksaBarisKk({ ...sah, idsubsls: "12345" }).ok).toBe(false);
    const r = periksaBarisKk({ ...sah, idsubsls: "1.30315E+15" });
    expect(!r.ok && r.pesan).toMatch(/angka/);
  });
  it("menolak nama kosong atau terlalu panjang", () => {
    expect(periksaBarisKk({ ...sah, nama_kk: "  " }).ok).toBe(false);
    expect(periksaBarisKk({ ...sah, nama_kk: "x".repeat(151) }).ok).toBe(false);
  });
});

describe("bacaKodeSub", () => {
  it("hanya teks 16 digit; sel angka ditolak karena Excel membulatkan digit ke-16", () => {
    expect(bacaKodeSub("1303150001000100")).toBe("1303150001000100");
    expect(bacaKodeSub(1303150001000100)).toBe(null);
    expect(bacaKodeSub(1.30315e15)).toBe(null);
  });
});

describe("petakanBarisExcel", () => {
  it("memetakan judul templat apa adanya", () => {
    const r = petakanBarisExcel({ "Kode Sub SLS (WAJIB)": "1303150001000100", "Nama KK (WAJIB)": "Budi", "Nama Anggota Keluarga Lain": "Siti", Latitude: -0.78, Longitude: 100.6, "Patokan Alamat": "x" });
    expect(r).toEqual({ idsubsls: "1303150001000100", nama_kk: "Budi", anggota_lain: "Siti", lat: -0.78, lng: 100.6, patokan: "x" });
  });
});

describe("kunciBaris", () => {
  it("sama untuk baris yang hanya beda spasi/huruf besar", () => {
    const a = kunciBaris({ idsubsls: "1", nama_kk: "Budi  S", anggota_lain: null, lat: -0.5, lng: 100.5 });
    const b = kunciBaris({ idsubsls: "1", nama_kk: "budi s", anggota_lain: "", lat: -0.5, lng: 100.5 });
    expect(a).toBe(b);
  });
});

describe("buatProyeksi", () => {
  it("menaruh semua titik di dalam kanvas, utara di atas", () => {
    const t = [
      { lat: -0.8, lng: 100.6 },
      { lat: -0.79, lng: 100.62 },
    ];
    const p = buatProyeksi(t, 360, 440, 24)!;
    for (const x of t) {
      expect(p.x(x.lng)).toBeGreaterThanOrEqual(23.9);
      expect(p.x(x.lng)).toBeLessThanOrEqual(336.1);
      expect(p.y(x.lat)).toBeGreaterThanOrEqual(23.9);
      expect(p.y(x.lat)).toBeLessThanOrEqual(416.1);
    }
    expect(p.y(-0.79)).toBeLessThan(p.y(-0.8));
  });
  it("satu titik tidak menghasilkan NaN", () => {
    const p = buatProyeksi([{ lat: -0.8, lng: 100.6 }], 360, 440)!;
    expect(Number.isFinite(p.x(100.6))).toBe(true);
    expect(buatProyeksi([], 360, 440)).toBe(null);
  });
});

describe("jarakMeter", () => {
  it("0,001 derajat lintang ~ 111 m", () => {
    expect(jarakMeter({ lat: -0.8, lng: 100.6 }, { lat: -0.801, lng: 100.6 })).toBeGreaterThan(105);
    expect(jarakMeter({ lat: -0.8, lng: 100.6 }, { lat: -0.801, lng: 100.6 })).toBeLessThan(117);
  });
});

describe("ringkasan monitoring", () => {
  const baris: BarisRingkas[] = [
    { idsubsls: "A", ppl_akun_id: null, hasil: null, jumlah: 10, hari_ini: 0 },
    { idsubsls: "A", ppl_akun_id: 1, hasil: "terdampak", jumlah: 4, hari_ini: 2 },
    { idsubsls: "A", ppl_akun_id: 2, hasil: "tidak_ditemukan", jumlah: 1, hari_ini: 1 },
    { idsubsls: "B", ppl_akun_id: 1, hasil: "tidak_terdampak", jumlah: 3, hari_ini: 0 },
  ];
  it("per Sub SLS: total, belum, didata", () => {
    const s = ringkasPerSub(baris);
    expect(s.A.total).toBe(15);
    expect(s.A.belum).toBe(10);
    expect(s.A.didata).toBe(5);
    expect(s.A.hari_ini.terdampak).toBe(2);
    expect(s.B.didata).toBe(3);
  });
  it("per PPL dapat dirinci per Sub SLS dan belum didata tidak dihitung", () => {
    const p = ringkasPerPpl(baris);
    expect(p[1].didata).toBe(7);
    expect(p[1].didata_hari_ini).toBe(2);
    expect(p[1].per_sub.B.total.tidak_terdampak).toBe(3);
    expect(p[2].total.tidak_ditemukan).toBe(1);
    expect(Object.keys(p)).toEqual(["1", "2"]);
  });
});
