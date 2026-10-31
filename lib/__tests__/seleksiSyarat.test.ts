import { describe, expect, it } from "vitest";
import { bacaSyarat, jarakKm, nilaiKelayakan, normalWilayah, periksaRancangan, ringkasKelayakan, sisaKebutuhan, type KandidatLokasi, type SyaratSeleksi, type WilayahSeleksi } from "../seleksiSyarat";

const w = (o: Partial<WilayahSeleksi>): WilayahSeleksi => ({ kode: "k1", nama: "SLS 1", kecamatan: "KUBUNG", nagari: "KOTO BARU", lat: -0.80, lng: 100.66, jumlah_sampel: 10, kebutuhan_ppl: 1, kebutuhan_pml: 0, ...o });
const k = (o: Partial<KandidatLokasi>): KandidatLokasi => ({ id: 1, nama: "Ani", kecamatan: "(110) KUBUNG", nagari: "(008) KOTO BARU", lat: -0.81, lng: 100.67, ...o });
const syarat = (o: Partial<SyaratSeleksi> = {}): SyaratSeleksi => ({ domisili: { aktif: false, level: "kecamatan" }, jarak: { aktif: false, maks_km: 10 }, ...o });

describe("normalWilayah", () => {
  it("membuang kode awalan dan menyeragamkan huruf", () => {
    expect(normalWilayah("(002)  Sungai   Nanam")).toBe("SUNGAI NANAM");
    expect(normalWilayah(null)).toBe("");
    expect(normalWilayah("KUBUNG")).toBe("KUBUNG");
  });
});

describe("jarakKm", () => {
  it("nol untuk titik sama dan wajar untuk 1 derajat bujur di ekuator (~111 km)", () => {
    expect(jarakKm({ lat: -0.8, lng: 100.6 }, { lat: -0.8, lng: 100.6 })).toBeCloseTo(0, 5);
    expect(jarakKm({ lat: 0, lng: 100 }, { lat: 0, lng: 101 })).toBeGreaterThan(110);
    expect(jarakKm({ lat: 0, lng: 100 }, { lat: 0, lng: 101 })).toBeLessThan(112);
  });
});

describe("bacaSyarat", () => {
  it("isian rusak jatuh ke bawaan", () => {
    expect(bacaSyarat(null)).toEqual(syarat());
    expect(bacaSyarat({ jarak: { aktif: true, maks_km: -5 } }).jarak).toEqual({ aktif: true, maks_km: 10 });
    expect(bacaSyarat({ jarak: { aktif: true, maks_km: 9999 } }).jarak.maks_km).toBe(10);
    expect(bacaSyarat({ domisili: { aktif: true, level: "nagari" } }).domisili).toEqual({ aktif: true, level: "nagari" });
  });
});

describe("nilaiKelayakan", () => {
  it("tanpa syarat aktif semua kandidat memenuhi, jarak tetap dilaporkan", () => {
    const h = nilaiKelayakan(k({}), [w({})], syarat());
    expect(h.status).toBe("memenuhi");
    expect(h.jarak_km).not.toBeNull();
    expect(h.wilayah_terdekat).toBe("SLS 1");
  });
  it("domisili kecamatan: cocok memenuhi, luar wilayah tidak", () => {
    const s = syarat({ domisili: { aktif: true, level: "kecamatan" } });
    expect(nilaiKelayakan(k({}), [w({})], s).status).toBe("memenuhi");
    expect(nilaiKelayakan(k({ kecamatan: "(080) GUNUNG TALANG" }), [w({})], s).status).toBe("tidak");
  });
  it("domisili tanpa data kecamatan = perlu_lokasi, bukan ditolak", () => {
    const s = syarat({ domisili: { aktif: true, level: "kecamatan" } });
    expect(nilaiKelayakan(k({ kecamatan: null }), [w({})], s).status).toBe("perlu_lokasi");
  });
  it("domisili nagari memakai nama nagari", () => {
    const s = syarat({ domisili: { aktif: true, level: "nagari" } });
    expect(nilaiKelayakan(k({}), [w({})], s).status).toBe("memenuhi");
    expect(nilaiKelayakan(k({ nagari: "(003) SINGKARAK" }), [w({})], s).status).toBe("tidak");
  });
  it("jarak: dalam batas memenuhi, melebihi batas tidak", () => {
    const s = syarat({ jarak: { aktif: true, maks_km: 5 } });
    expect(nilaiKelayakan(k({}), [w({})], s).status).toBe("memenuhi");
    const jauh = nilaiKelayakan(k({ lat: -0.5, lng: 100.9 }), [w({})], s);
    expect(jauh.status).toBe("tidak");
    expect(jauh.alasan[0]).toContain("melebihi 5 km");
  });
  it("jarak memakai wilayah TERDEKAT di antara beberapa", () => {
    const s = syarat({ jarak: { aktif: true, maks_km: 5 } });
    const h = nilaiKelayakan(k({}), [w({ kode: "a", nama: "Jauh", lat: -1.5, lng: 101.5 }), w({ kode: "b", nama: "Dekat" })], s);
    expect(h.status).toBe("memenuhi");
    expect(h.wilayah_terdekat).toBe("Dekat");
  });
  it("jarak tanpa titik domisili = perlu_lokasi", () => {
    const s = syarat({ jarak: { aktif: true, maks_km: 5 } });
    expect(nilaiKelayakan(k({ lat: null, lng: null }), [w({})], s).status).toBe("perlu_lokasi");
    expect(nilaiKelayakan(k({ lat: 0, lng: 0 }), [w({})], s).status).toBe("perlu_lokasi");
  });
  it("jarak aktif tetapi tidak ada wilayah berkoordinat = perlu_lokasi", () => {
    const s = syarat({ jarak: { aktif: true, maks_km: 5 } });
    expect(nilaiKelayakan(k({}), [w({ lat: null, lng: null })], s).status).toBe("perlu_lokasi");
  });
  it("syarat 'tidak' mengalahkan 'perlu_lokasi'", () => {
    const s = syarat({ domisili: { aktif: true, level: "kecamatan" }, jarak: { aktif: true, maks_km: 5 } });
    const h = nilaiKelayakan(k({ kecamatan: "(080) GUNUNG TALANG", lat: null, lng: null }), [w({})], s);
    expect(h.status).toBe("tidak");
  });
});

describe("ringkasKelayakan & sisaKebutuhan", () => {
  it("menghitung per status", () => {
    const hs = [
      { status: "memenuhi", alasan: [], jarak_km: 1, wilayah_terdekat: "a" },
      { status: "tidak", alasan: [], jarak_km: 30, wilayah_terdekat: "a" },
      { status: "perlu_lokasi", alasan: [], jarak_km: null, wilayah_terdekat: null },
      { status: "memenuhi", alasan: [], jarak_km: 2, wilayah_terdekat: "a" },
    ] as const;
    expect(ringkasKelayakan(hs.map((h) => ({ ...h, alasan: [...h.alasan] })))).toEqual({ total: 4, memenuhi: 2, tidak: 1, perlu_lokasi: 1 });
  });
  it("sisa kebutuhan tidak negatif", () => {
    expect(sisaKebutuhan(10, 3)).toBe(7);
    expect(sisaKebutuhan(2, 5)).toBe(0);
    expect(sisaKebutuhan(Number.NaN, 1)).toBe(0);
  });
});

describe("periksaRancangan", () => {
  const dasar = { kegiatan_id: 2, nama: "Seleksi PPL SPDT", jalur: "seleksi", kebutuhan_ppl: 10, kebutuhan_pml: 2, sudah_ppl: 3, sudah_pml: 0 };
  it("menerima rancangan minimal", () => {
    const h = periksaRancangan(dasar);
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.nilai.syarat.jarak.aktif).toBe(false);
      expect(h.nilai.peringkat_level).toBe("kabupaten");
      expect(h.nilai.tampil_nilai).toBe(false);
    }
  });
  it("menolak nama pendek, kebutuhan kosong, dan organik melebihi kebutuhan", () => {
    expect(periksaRancangan({ ...dasar, nama: "ab" }).ok).toBe(false);
    expect(periksaRancangan({ ...dasar, kebutuhan_ppl: 0, kebutuhan_pml: 0 }).ok).toBe(false);
    expect(periksaRancangan({ ...dasar, sudah_ppl: 11 }).ok).toBe(false);
    expect(periksaRancangan({ ...dasar, kebutuhan_ppl: -1 }).ok).toBe(false);
  });
  it("jadwal tutup harus setelah buka", () => {
    expect(periksaRancangan({ ...dasar, jadwal_buka: "2026-11-05T08:00:00Z", jadwal_tutup: "2026-11-04T08:00:00Z" }).ok).toBe(false);
    expect(periksaRancangan({ ...dasar, jadwal_buka: "2026-11-05T08:00:00Z", jadwal_tutup: "2026-11-06T08:00:00Z" }).ok).toBe(true);
  });
  it("syarat domisili/jarak butuh wilayah; jarak butuh koordinat", () => {
    expect(periksaRancangan({ ...dasar, syarat: { domisili: { aktif: true, level: "kecamatan" } } }).ok).toBe(false);
    const tanpaKoordinat = { ...dasar, syarat: { jarak: { aktif: true, maks_km: 5 } }, wilayah: [{ kode: "a", nama: "A" }] };
    expect(periksaRancangan(tanpaKoordinat).ok).toBe(false);
    const sah = { ...dasar, syarat: { jarak: { aktif: true, maks_km: 5 } }, wilayah: [{ kode: "a", nama: "A", lat: -0.8, lng: 100.6 }] };
    expect(periksaRancangan(sah).ok).toBe(true);
  });
  it("wilayah: kode ganda dibuang, titik (0,0) dibuang, angka sampel dibersihkan", () => {
    const h = periksaRancangan({ ...dasar, wilayah: [{ kode: "a", nama: "A", lat: 0, lng: 0, jumlah_sampel: "12" }, { kode: "a", nama: "dobel" }, { kode: "", nama: "kosong" }] });
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.nilai.wilayah).toHaveLength(1);
      expect(h.nilai.wilayah[0]).toMatchObject({ kode: "a", lat: null, lng: null, jumlah_sampel: 12 });
    }
  });
});
