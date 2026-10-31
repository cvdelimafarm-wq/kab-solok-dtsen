import { describe, expect, it } from "vitest";
import { daftarKecamatan, periksaPermintaanPool, ringkas, samarkanId, saring, statusLokasi, tahunSah, titikSah, type AkunPengguna } from "../penggunaPool";

const dasar: AkunPengguna = {
  id: 1, nama: "Ani Putri", jenis: "mitra", nik: null, nip: null, alamat_kecamatan: "Kubung", domisili_lat: null, domisili_lng: null,
  domisili_sumber: null, verif_at: null, verif_jarak_m: null, terakhir_masuk_at: null, aktif: true, pool: null,
};
const a = (o: Partial<AkunPengguna>): AkunPengguna => ({ ...dasar, ...o });

describe("titikSah / statusLokasi", () => {
  it("menolak null, NaN, di luar rentang, dan (0,0)", () => {
    expect(titikSah(null, 100)).toBe(false);
    expect(titikSah(Number.NaN, 100)).toBe(false);
    expect(titikSah(91, 100)).toBe(false);
    expect(titikSah(-1, 181)).toBe(false);
    expect(titikSah(0, 0)).toBe(false);
    expect(titikSah("-0.8" as unknown, 100.6)).toBe(false);
  });
  it("menerima titik Solok", () => {
    expect(titikSah(-0.79, 100.65)).toBe(true);
  });
  it("tiga tingkat lokasi", () => {
    expect(statusLokasi(a({}))).toBe("belum");
    expect(statusLokasi(a({ domisili_lat: -0.79, domisili_lng: 100.65 }))).toBe("berkoordinat");
    expect(statusLokasi(a({ domisili_lat: -0.79, domisili_lng: 100.65, verif_at: "2026-10-01T00:00:00Z" }))).toBe("terverifikasi");
    // verifikasi tanpa titik domisili tetap "belum"
    expect(statusLokasi(a({ verif_at: "2026-10-01T00:00:00Z" }))).toBe("belum");
  });
});

describe("tahunSah", () => {
  it("menerima bilangan bulat wajar dan string angka", () => {
    expect(tahunSah(2026)).toBe(2026);
    expect(tahunSah("2026")).toBe(2026);
  });
  it("menolak lainnya", () => {
    expect(tahunSah(2026.5)).toBeNull();
    expect(tahunSah("")).toBeNull();
    expect(tahunSah(1999)).toBeNull();
    expect(tahunSah(null)).toBeNull();
    expect(tahunSah("abc")).toBeNull();
  });
});

describe("samarkanId", () => {
  it("hanya 4 digit terakhir yang terlihat", () => {
    expect(samarkanId("1303010101010001")).toBe("••••••••••••0001");
    expect(samarkanId("12")).toBe("••");
    expect(samarkanId(null)).toBeNull();
    expect(samarkanId("  ")).toBeNull();
  });
});

describe("ringkas & saring", () => {
  const daftar = [
    a({ id: 1, nama: "Ani Putri", pool: { status: "aktif", no_kepka: null, catatan: null }, domisili_lat: -0.79, domisili_lng: 100.65, verif_at: "x" }),
    a({ id: 2, nama: "Budi  Santoso", alamat_kecamatan: "Gunung Talang", pool: { status: "nonaktif", no_kepka: null, catatan: null } }),
    a({ id: 3, nama: "Citra", aktif: false, domisili_lat: -0.8, domisili_lng: 100.6 }),
  ];
  it("menghitung ringkasan", () => {
    expect(ringkas(daftar)).toEqual({ total: 3, aktif: 2, pool_aktif: 1, pool_nonaktif: 1, belum_pool: 1, lokasi_terverifikasi: 1, lokasi_berkoordinat: 1, lokasi_belum: 1 });
  });
  it("menyaring nama tanpa peduli huruf besar/spasi ganda", () => {
    expect(saring(daftar, { q: "budi santoso" }).map((x) => x.id)).toEqual([2]);
  });
  it("menyaring pool, lokasi, kecamatan, dan hanya aktif", () => {
    expect(saring(daftar, { pool: "belum" }).map((x) => x.id)).toEqual([3]);
    expect(saring(daftar, { pool: "aktif" }).map((x) => x.id)).toEqual([1]);
    expect(saring(daftar, { lokasi: "belum" }).map((x) => x.id)).toEqual([2]);
    expect(saring(daftar, { kecamatan: "gunung talang" }).map((x) => x.id)).toEqual([2]);
    expect(saring(daftar, { hanyaAktif: true }).map((x) => x.id)).toEqual([1, 2]);
  });
  it("daftar kecamatan unik dan berurut", () => {
    expect(daftarKecamatan(daftar)).toEqual(["Gunung Talang", "Kubung"]);
  });
});

describe("periksaPermintaanPool", () => {
  it("menerima permintaan sah dan membersihkan isian", () => {
    const h = periksaPermintaanPool({ akun_ids: [3, 3, 5, -1, 2.5, "7"], tahun: 2026, status: "aktif", no_kepka: "  KEP-1 ", catatan: "" });
    expect(h).toEqual({ ok: true, nilai: { akun_ids: [3, 5], tahun: 2026, status: "aktif", no_kepka: "KEP-1", catatan: null } });
  });
  it("menolak tahun, status, dan daftar akun yang buruk", () => {
    expect(periksaPermintaanPool({ akun_ids: [1], tahun: 1, status: "aktif" }).ok).toBe(false);
    expect(periksaPermintaanPool({ akun_ids: [1], tahun: 2026, status: "hapus" }).ok).toBe(false);
    expect(periksaPermintaanPool({ akun_ids: [], tahun: 2026, status: "aktif" }).ok).toBe(false);
    expect(periksaPermintaanPool(null).ok).toBe(false);
  });
  it("membatasi jumlah akun sekali proses", () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    expect(periksaPermintaanPool({ akun_ids: ids, tahun: 2026, status: "aktif" }).ok).toBe(false);
  });
});
