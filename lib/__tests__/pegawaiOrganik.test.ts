import { describe, expect, it } from "vitest";
import { bentukDaftarPegawai, bersihKodeWilayah, bersihWilayah, durasi, teksDurasi, totalBulan, kapitalWilayah, periksaUbahProfil, susunDaftarWilayah, ringkasPegawai, saringPegawai, selisihTahun, tanggalIndo, tanggalWib, type AkunOrganik, type ProfilPegawai } from "../pegawaiOrganik";

const SEKARANG = Date.parse("2026-10-31T03:00:00Z"); // 31 Okt 2026 10:00 WIB

const p = (o: Partial<ProfilPegawai>): ProfilPegawai => ({
  id: 1, nip_lama: "340000001", urutan: 1, akun_id: null, nama_lengkap: "Ani", nip_baru: "198001012000011001", jabatan: "Pegawai", status_pegawai: "PNS", jenis_kelamin: "P",
  tanggal_lahir: "1980-01-01", tmt: "2000-01-01", tmt_teks: "Jan 2000", email: "ani@bps.go.id", domisili_kecamatan: null, domisili_nagari: null, kantor_kecamatan: "Gunung Talang", ...o,
});
const a = (o: Partial<AkunOrganik>): AkunOrganik => ({ id: 1, nama: "Ani", nip: null, aktif: true, alamat_kecamatan: null, ...o });

describe("tanggal", () => {
  it("tanggalWib memakai zona WIB", () => {
    expect(tanggalWib(Date.parse("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
  });
  it("selisihTahun menghitung tahun penuh", () => {
    expect(selisihTahun("1982-09-28", "2026-10-31")).toBe(44);
    expect(selisihTahun("1985-12-31", "2026-10-31")).toBe(40); // belum ulang tahun
    expect(selisihTahun("2004-12-01", "2026-10-31")).toBe(21);
    expect(selisihTahun("2025-01-01", "2026-10-31")).toBe(1);
    expect(selisihTahun("2027-01-01", "2026-10-31")).toBeNull();
    expect(selisihTahun(null, "2026-10-31")).toBeNull();
    expect(selisihTahun("bukan", "2026-10-31")).toBeNull();
  });
  it("tanggalIndo", () => {
    expect(tanggalIndo("1982-09-28")).toBe("28 Sep 1982");
    expect(tanggalIndo("1973-05-13")).toBe("13 Mei 1973");
    expect(tanggalIndo("")).toBeNull();
  });
  it("kapitalWilayah menyeragamkan huruf", () => {
    expect(kapitalWilayah("GUNUNG TALANG")).toBe("Gunung Talang");
    expect(kapitalWilayah(" kubung ")).toBe("Kubung");
    expect(kapitalWilayah("  ")).toBeNull();
  });
});

describe("bentukDaftarPegawai", () => {
  it("menghitung usia dan masa kerja, menyamarkan NIP", () => {
    const [b] = bentukDaftarPegawai([p({ tanggal_lahir: "1985-12-31", tmt: "2011-01-01" })], [], SEKARANG);
    expect(b.usia).toBe(40);
    expect(b.masa_kerja).toBe(15);
    expect(b.nip_lama).toBe("•••••0001");
    expect(b.nip_baru?.endsWith("1001")).toBe(true);
    expect(b.nip_baru?.startsWith("•")).toBe(true);
    expect(b.tanggal_lahir).toBe("31 Des 1985");
  });
  it("NIP penuh bila diminta", () => {
    const [b] = bentukDaftarPegawai([p({})], [], SEKARANG, true);
    expect(b.nip_lama).toBe("340000001");
  });
  it("mencocokkan akun lewat akun_id, lalu lewat NIP; kecamatan domisili jatuh ke akun", () => {
    const daftar = bentukDaftarPegawai(
      [p({ nip_lama: "340000001", urutan: 1, akun_id: 7 }), p({ nip_lama: "340000002", urutan: 2, nama_lengkap: "Budi" })],
      [a({ id: 7, alamat_kecamatan: "GUNUNG TALANG" }), a({ id: 9, nama: "Budi", nip: "340000002", alamat_kecamatan: "Kubung" })],
      SEKARANG,
    );
    expect(daftar.map((x) => x.akun_id)).toEqual([7, 9]);
    expect(daftar.map((x) => x.domisili_kecamatan)).toEqual(["Gunung Talang", "Kubung"]);
  });
  it("isian profil mengalahkan akun; akun tanpa profil ditaruh di bawah dan ditandai", () => {
    const daftar = bentukDaftarPegawai([p({ akun_id: 7, domisili_kecamatan: "Kubung", domisili_nagari: "SAOK LAWEH" })], [a({ id: 7, alamat_kecamatan: "Gunung Talang" }), a({ id: 8, nama: "Zed", aktif: false })], SEKARANG);
    expect(daftar[0].domisili_kecamatan).toBe("Kubung");
    expect(daftar[0].domisili_nagari).toBe("Saok Laweh");
    expect(daftar[1]).toMatchObject({ no: 2, nama: "Zed", dalam_daftar: false, akun_aktif: false });
  });
  it("urut menurut kolom urutan", () => {
    const daftar = bentukDaftarPegawai([p({ nip_lama: "2", urutan: 2, nama_lengkap: "B" }), p({ nip_lama: "1", urutan: 1, nama_lengkap: "A" })], [], SEKARANG);
    expect(daftar.map((x) => x.nama)).toEqual(["A", "B"]);
  });
});

describe("ringkas dan saring", () => {
  const daftar = bentukDaftarPegawai(
    [p({ nip_lama: "1", urutan: 1, akun_id: 7, nama_lengkap: "Ani", status_pegawai: "PNS" }), p({ nip_lama: "2", urutan: 2, nama_lengkap: "Budi", status_pegawai: "PPPK", email: "budi@bps.go.id" })],
    [a({ id: 7 }), a({ id: 8, nama: "Zed" })],
    SEKARANG,
  );
  it("ringkasPegawai", () => {
    expect(ringkasPegawai(daftar)).toEqual({ daftar: 2, punya_akun: 1, tanpa_akun: 1, akun_di_luar_daftar: 1, pns: 1, pppk: 1 });
  });
  it("saringPegawai", () => {
    expect(saringPegawai(daftar, { status: "PPPK" }).map((x) => x.nama)).toEqual(["Budi"]);
    expect(saringPegawai(daftar, { status: "tanpa_akun" }).map((x) => x.nama)).toEqual(["Budi"]);
    expect(saringPegawai(daftar, { status: "luar_daftar" }).map((x) => x.nama)).toEqual(["Zed"]);
    expect(saringPegawai(daftar, { q: "ani" }).map((x) => x.nama)).toEqual(["Ani"]);
  });
});

describe("ubah profil", () => {
  it("bersihWilayah", () => {
    expect(bersihWilayah("  Gunung   Talang ")).toEqual({ ok: true, nilai: "Gunung Talang" });
    expect(bersihWilayah("")).toEqual({ ok: true, nilai: null });
    expect(bersihWilayah(null)).toEqual({ ok: true, nilai: null });
    expect(bersihWilayah("a<b").ok).toBe(false);
    expect(bersihWilayah("x".repeat(61)).ok).toBe(false);
    expect(bersihWilayah(5).ok).toBe(false);
  });
  it("periksaUbahProfil", () => {
    expect(periksaUbahProfil({ profil_id: 3, domisili_kecamatan: "Kubung", domisili_nagari: "Selayo", kantor_kecamatan: "Gunung Talang", kantor_semua: true })).toEqual({
      ok: true, nilai: { profil_id: 3, domisili_kecamatan: "Kubung", domisili_nagari: "Selayo", kantor_kecamatan: "Gunung Talang", kantor_semua: true },
    });
    expect(periksaUbahProfil({ profil_id: 0 }).ok).toBe(false);
    expect(periksaUbahProfil({ profil_id: 1, domisili_nagari: "Selayo" }).ok).toBe(false); // nagari tanpa kecamatan
    expect(periksaUbahProfil({ profil_id: 1, domisili_kecamatan: "Kubung", domisili_nagari: "S<" }).ok).toBe(false);
  });
  it("susunDaftarWilayah", () => {
    const d = susunDaftarWilayah([
      { kecamatan: "KUBUNG", nagari: "SELAYO" }, { kecamatan: "KUBUNG", nagari: "SELAYO" }, { kecamatan: "GUNUNG TALANG", nagari: "BATANG BARUS" }, { kecamatan: null, nagari: "X" },
    ]);
    expect(d.kecamatan).toEqual(["Gunung Talang", "Kubung"]);
    expect(d.nagari).toEqual([{ nagari: "Batang Barus", kecamatan: "Gunung Talang" }, { nagari: "Selayo", kecamatan: "Kubung" }]);
  });
});

describe("durasi (usia dan masa kerja yang bergerak)", () => {
  it("menghitung tahun, bulan, hari kalender", () => {
    expect(durasi("2004-12-01", "2026-10-31")).toEqual({ tahun: 21, bulan: 10, hari: 30 });
    expect(durasi("1982-09-28", "2026-10-31")).toEqual({ tahun: 44, bulan: 1, hari: 3 });
  });
  it("meminjam hari dari bulan sebelumnya saat hari lebih kecil", () => {
    expect(durasi("2025-01-31", "2025-03-01")).toEqual({ tahun: 0, bulan: 1, hari: 1 }); // Feb 2025 = 28 hari
    expect(durasi("2024-01-31", "2024-03-01")).toEqual({ tahun: 0, bulan: 1, hari: 1 }); // Feb 2024 = 29 hari
  });
  it("meminjam tahun saat bulan lebih kecil", () => {
    expect(durasi("2000-11-15", "2026-02-10")).toEqual({ tahun: 25, bulan: 2, hari: 26 });
  });
  it("bergerak: besok lebih besar satu hari, bulan depan satu bulan", () => {
    const a = durasi("2004-12-01", "2026-10-31")!;
    const b = durasi("2004-12-01", "2026-11-01")!;
    expect(b).toEqual({ tahun: 21, bulan: 11, hari: 0 });
    expect(totalBulan(b)).toBe((totalBulan(a) as number) + 1);
  });
  it("null untuk tanggal tak sah atau di masa depan", () => {
    expect(durasi(null, "2026-10-31")).toBeNull();
    expect(durasi("2030-01-01", "2026-10-31")).toBeNull();
    expect(durasi("abc", "2026-10-31")).toBeNull();
  });
  it("teks durasi", () => {
    expect(teksDurasi({ tahun: 21, bulan: 10, hari: 12 })).toBe("21 th 10 bln");
    expect(teksDurasi({ tahun: 21, bulan: 10, hari: 12 }, true)).toBe("21 th 10 bln 12 hr");
    expect(teksDurasi(null)).toBeNull();
  });
  it("bentukDaftarPegawai menyertakan tanggal mentah untuk dihitung layar", () => {
    const [b] = bentukDaftarPegawai([p({ tanggal_lahir: "1982-09-28", tmt: "2004-12-01" })], [], SEKARANG);
    expect(b.lahir_iso).toBe("1982-09-28");
    expect(b.tmt_iso).toBe("2004-12-01");
    const [k] = bentukDaftarPegawai([p({ tanggal_lahir: null, tmt: null })], [], SEKARANG);
    expect(k.lahir_iso).toBeNull();
    expect(k.tmt_iso).toBeNull();
  });
});

describe("nagari domisili dari akun", () => {
  it("kode BPS di depan nama dibuang", () => {
    expect(bersihKodeWilayah("(002) SUNGAI NANAM")).toBe("SUNGAI NANAM");
    expect(bersihKodeWilayah("  (130) X KOTO SINGKARAK ")).toBe("X KOTO SINGKARAK");
    expect(bersihKodeWilayah("Koto Baru")).toBe("Koto Baru");
    expect(bersihKodeWilayah("")).toBeNull();
    expect(bersihKodeWilayah(null)).toBeNull();
  });
  it("nagari profil menang; bila kosong memakai nagari akun", () => {
    const akun = [a({ id: 5, nip: "340000001", alamat_kecamatan: "KUBUNG", alamat_nagari: "KOTO BARU" })];
    const [x] = bentukDaftarPegawai([p({ domisili_nagari: null })], akun, SEKARANG);
    expect(x.domisili_nagari).toBe("Koto Baru");
    const [y] = bentukDaftarPegawai([p({ domisili_nagari: "Selayo" })], akun, SEKARANG);
    expect(y.domisili_nagari).toBe("Selayo");
  });
});
