// Menguji lib/vanguardPengingat.ts (murni): jendela kirim, penentuan kejadian, pesan, kunci anti-ganda, dan aturan modal.
import { describe, expect, it } from "vitest";
import { CATATAN_KOSONG, JEDA_MODAL_MENIT, MAKS_MODAL_PER_HARI, catatModalTampil, jendelaSekarang, kejadianUntuk, kunciKirimVg, kunciPjVg, pesanPetugas, pesanPj, putuskanModal, segarkanCatatan, urlLatihanVg, type MasukanKejadian } from "../vanguardPengingat";

const wib = (tgl: string, jam: number, mnt = 0) => new Date(`${tgl}T${String(jam).padStart(2, "0")}:${String(mnt).padStart(2, "0")}:00+07:00`).getTime();
const dasar: MasukanKejadian = { tuntas: false, hari_ini_sudah: false, terputus: false, berturut: 0, hari_berturut: 3, kelayakan: { mungkin: true, hari_terakhir_mulai: false, batas_mulai: "2026-11-06" } };
const dengan = (o: Omit<Partial<MasukanKejadian>, "kelayakan"> & { kelayakan?: Partial<MasukanKejadian["kelayakan"]> }): MasukanKejadian => ({ ...dasar, ...o, kelayakan: { ...dasar.kelayakan, ...(o.kelayakan ?? {}) } });

describe("jendela kirim", () => {
  it("pagi 07.00-07.44 dan sore 16.00-16.44 WIB, selain itu tidak ada", () => {
    expect(jendelaSekarang(wib("2026-11-04", 7, 0))).toBe("pagi");
    expect(jendelaSekarang(wib("2026-11-04", 7, 44))).toBe("pagi");
    expect(jendelaSekarang(wib("2026-11-04", 7, 45))).toBeNull();
    expect(jendelaSekarang(wib("2026-11-04", 16, 20))).toBe("sore");
    expect(jendelaSekarang(wib("2026-11-04", 12, 0))).toBeNull();
    expect(jendelaSekarang(wib("2026-11-04", 23, 30))).toBeNull();
  });
});

describe("kejadian", () => {
  it("tuntas atau sudah berlatih hari ini = tidak perlu diingatkan", () => {
    expect(kejadianUntuk(dengan({ tuntas: true }))).toBeNull();
    expect(kejadianUntuk(dengan({ hari_ini_sudah: true }))).toBeNull();
  });
  it("mulai / lanjut / terputus / hari terakhir / lewat batas, dengan urutan prioritas", () => {
    expect(kejadianUntuk(dasar)).toBe("mulai");
    expect(kejadianUntuk(dengan({ berturut: 1 }))).toBe("lanjut");
    expect(kejadianUntuk(dengan({ berturut: 0, terputus: true }))).toBe("terputus");
    expect(kejadianUntuk(dengan({ kelayakan: { hari_terakhir_mulai: true } }))).toBe("hari_terakhir");
    expect(kejadianUntuk(dengan({ terputus: true, kelayakan: { hari_terakhir_mulai: true } }))).toBe("hari_terakhir");
    expect(kejadianUntuk(dengan({ kelayakan: { mungkin: false } }))).toBe("lewat_batas");
  });
  it("tanggal buka Pretest tidak diketahui (mungkin null) tetap diingatkan mulai/lanjut", () => {
    expect(kejadianUntuk(dengan({ kelayakan: { mungkin: null, batas_mulai: null } }))).toBe("mulai");
  });
});

describe("pesan", () => {
  it("memuat jumlah hari, batas mulai, dan alamat latihan kegiatan", () => {
    const p = pesanPetugas("mulai", dasar, 7);
    expect(p.url).toBe(urlLatihanVg(7));
    expect(p.url).toBe("/sigap/vanguard?k=7");
    expect(p.isi).toContain("3 hari berturut-turut");
    expect(p.isi).toContain("November");
    expect(pesanPetugas("lanjut", dengan({ berturut: 1 }), 7).judul).toBe("Vanguard: hari ke-2 dari 3");
    expect(pesanPetugas("terputus", dasar, 7).judul).toMatch(/terputus/i);
    expect(pesanPetugas("hari_terakhir", dasar, 7).isi).toContain("Mulai hari ini");
    expect(pesanPetugas("lewat_batas", dasar, 7).isi).toMatch(/panitia/i);
  });
  it("panjang judul dan isi terjaga untuk notifikasi", () => {
    for (const k of ["mulai", "lanjut", "terputus", "hari_terakhir", "lewat_batas"] as const) {
      const p = pesanPetugas(k, dasar, 7);
      expect(p.judul.length).toBeLessThanOrEqual(80);
      expect(p.isi.length).toBeLessThanOrEqual(240);
    }
  });
  it("pesan PJ menyebut jumlah dan menuju Monitoring", () => {
    const p = pesanPj(3, 20);
    expect(p.judul).toContain("3 peserta");
    expect(p.isi).toContain("3 dari 20");
    expect(p.url).toContain("tab=monitoring");
  });
});

describe("kunci anti-ganda", () => {
  const t = wib("2026-11-04", 7, 10);
  it("harian per jendela; lewat_batas sekali saja", () => {
    expect(kunciKirimVg("mulai", "pagi", t, 7)).toBe("vg|7|mulai|pagi|2026-11-04");
    expect(kunciKirimVg("mulai", "sore", t, 7)).not.toBe(kunciKirimVg("mulai", "pagi", t, 7));
    expect(kunciKirimVg("mulai", "pagi", t + 86_400_000, 7)).not.toBe(kunciKirimVg("mulai", "pagi", t, 7));
    expect(kunciKirimVg("lewat_batas", "pagi", t, 7)).toBe(kunciKirimVg("lewat_batas", "sore", t + 86_400_000, 7));
    expect(kunciPjVg(7, t)).toBe("vg|7|pj|2026-11-04");
  });
});

describe("modal", () => {
  const t0 = wib("2026-11-04", 9, 0);
  it("hanya mode wajib", () => {
    expect(putuskanModal("opsional", dasar, CATATAN_KOSONG(t0), t0).tampil).toBeNull();
    expect(putuskanModal("tidak_ada", dasar, CATATAN_KOSONG(t0), t0).tampil).toBeNull();
    expect(putuskanModal("wajib", dasar, CATATAN_KOSONG(t0), t0)).toEqual({ tampil: "ingatkan", kejadian: "mulai" });
  });
  it("batas harian dan jeda antar-tampil", () => {
    let c = CATATAN_KOSONG(t0);
    c = catatModalTampil(c, "ingatkan", t0);
    expect(putuskanModal("wajib", dasar, c, t0 + 60_000).tampil).toBeNull();
    const t1 = t0 + JEDA_MODAL_MENIT * 60_000;
    expect(putuskanModal("wajib", dasar, c, t1).tampil).toBe("ingatkan");
    c = catatModalTampil(c, "ingatkan", t1);
    expect(c.n).toBe(MAKS_MODAL_PER_HARI);
    expect(putuskanModal("wajib", dasar, c, t1 + 10 * 3600_000).tampil).toBeNull();
  });
  it("sudah berlatih hari ini: tidak ada modal; tuntas: ucapan sekali", () => {
    expect(putuskanModal("wajib", dengan({ hari_ini_sudah: true }), CATATAN_KOSONG(t0), t0).tampil).toBeNull();
    const tuntas = dengan({ tuntas: true });
    expect(putuskanModal("wajib", tuntas, CATATAN_KOSONG(t0), t0).tampil).toBe("ucapan");
    const c = catatModalTampil(CATATAN_KOSONG(t0), "ucapan", t0);
    expect(putuskanModal("wajib", tuntas, c, t0 + 1000).tampil).toBeNull();
  });
  it("hari berganti: hitungan nol, tetapi 'ucapan sudah dilihat' dibawa; catatan rusak diabaikan", () => {
    const c = catatModalTampil(catatModalTampil(CATATAN_KOSONG(t0), "ingatkan", t0), "ucapan", t0);
    const esok = segarkanCatatan(c, t0 + 86_400_000);
    expect(esok.n).toBe(0);
    expect(esok.tuntas_dilihat).toBe(true);
    expect(segarkanCatatan("rusak", t0)).toEqual(CATATAN_KOSONG(t0));
    expect(segarkanCatatan({ hari: "2026-11-04", n: -5, terakhir: "x" }, t0).n).toBe(0);
  });
});

describe("Sertifikasi wajib belum selesai (3 Nov 2026)", () => {
  const tinggal = dengan({ tuntas: true, sertifikasi_selesai: false });
  it("latihan tuntas tetapi sertifikasi belum = kejadian 'sertifikasi' (bukan null)", () => {
    expect(kejadianUntuk(tinggal)).toBe("sertifikasi");
    expect(kejadianUntuk(dengan({ tuntas: true, hari_ini_sudah: true, sertifikasi_selesai: false }))).toBe("sertifikasi");
    expect(kejadianUntuk(dengan({ tuntas: true, sertifikasi_selesai: true }))).toBeNull();
    expect(kejadianUntuk(dengan({ tuntas: true }))).toBeNull(); // tidak disyaratkan
  });
  it("pesan mengarah ke layar sertifikasi", () => {
    const p = pesanPetugas("sertifikasi", tinggal, 7);
    expect(p.judul).toBe("Tinggal Sertifikasi wajib");
    expect(p.url).toBe("/sigap/vanguard/sertifikasi?k=7");
  });
  it("modal: bukan ucapan selamat, melainkan pengingat sertifikasi; ucapan hanya bila sertifikasi beres", () => {
    const catatan = CATATAN_KOSONG(wib("2026-11-04", 9));
    expect(putuskanModal("wajib", tinggal, catatan, wib("2026-11-04", 9))).toEqual({ tampil: "ingatkan", kejadian: "sertifikasi" });
    expect(putuskanModal("wajib", dengan({ tuntas: true, sertifikasi_selesai: true }), catatan, wib("2026-11-04", 9))).toEqual({ tampil: "ucapan", kejadian: null });
  });
});
