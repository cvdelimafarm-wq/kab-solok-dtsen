import { describe, expect, it } from "vitest";
import { kartuSeleksi, susunKartuSeleksi, type MasukanKartu } from "../seleksiBeranda";

const buka = { buka: true, alasan: null };
const tutupJ = { buka: false, alasan: "Pendaftaran sudah ditutup." };
const boleh = { boleh: true, alasan: null };
const tidak = { boleh: false, alasan: "x" };
const layak = { status: "memenuhi" as const, alasan: [], jarak_km: 3, wilayah_terdekat: "A" };
const dasar: MasukanKartu = { id: 1, nama: "Seleksi Seruti", kegiatan: "Seruti TW IV", jadwal_tutup: "2026-11-05T09:00:00Z", jendela: buka, kelayakan: layak, boleh: { ppl: boleh, pml: tidak }, saya: null };

describe("kartuSeleksi", () => {
  it("boleh mendaftar -> kartu biru, sebut peran dan batas tutup", () => {
    const k = kartuSeleksi(dasar)!;
    expect(k.nada).toBe("biru");
    expect(k.pesan).toContain("PPL");
    expect(k.pesan).not.toContain("PML");
    expect(k.pesan).toContain("5 Nov 2026 pukul 16.00 WIB");
    expect(k.href).toBe("/sigap/seleksi/1");
  });
  it("PPL dan PML sama-sama boleh", () => {
    expect(kartuSeleksi({ ...dasar, boleh: { ppl: boleh, pml: boleh } })!.pesan).toContain("PPL atau PML");
  });
  it("sudah terdaftar -> kartu hijau walau jendela tutup", () => {
    const k = kartuSeleksi({ ...dasar, jendela: tutupJ, saya: { peran: "pml", status: "terdaftar" } })!;
    expect(k.nada).toBe("hijau");
    expect(k.pesan).toContain("PML");
  });
  it("mundur dan jendela tutup -> tidak tampil", () => {
    expect(kartuSeleksi({ ...dasar, jendela: tutupJ, saya: { peran: "ppl", status: "mundur" } })).toBeNull();
  });
  it("perlu lokasi -> kartu emas", () => {
    const k = kartuSeleksi({ ...dasar, kelayakan: { status: "perlu_lokasi", alasan: ["titik"], jarak_km: null, wilayah_terdekat: null }, boleh: { ppl: tidak, pml: tidak } })!;
    expect(k.nada).toBe("emas");
    expect(k.aksi).toBe("Lengkapi");
    expect(k.href).toBe("/sigap/lokasi-saya?kembali=%2Fsigap%2Fseleksi%2F1");
  });
  it("tidak memenuhi syarat atau bukan calon -> tidak tampil", () => {
    expect(kartuSeleksi({ ...dasar, kelayakan: { status: "tidak", alasan: ["jauh"], jarak_km: 40, wilayah_terdekat: "A" }, boleh: { ppl: tidak, pml: tidak } })).toBeNull();
    expect(kartuSeleksi({ ...dasar, kelayakan: null, boleh: null })).toBeNull();
  });
});

describe("susunKartuSeleksi", () => {
  it("urut: bisa daftar (tutup terdekat dulu), perlu lokasi, lalu terdaftar", () => {
    const a = { ...dasar, id: 1, jadwal_tutup: "2026-11-10T09:00:00Z" };
    const b = { ...dasar, id: 2, jadwal_tutup: "2026-11-05T09:00:00Z" };
    const c = { ...dasar, id: 3, saya: { peran: "ppl", status: "terdaftar" } };
    const d = { ...dasar, id: 4, kelayakan: { status: "perlu_lokasi" as const, alasan: [], jarak_km: null, wilayah_terdekat: null }, boleh: { ppl: tidak, pml: tidak } };
    const e = { ...dasar, id: 5, kelayakan: null, boleh: null };
    expect(susunKartuSeleksi([c, a, e, d, b]).map((k) => k.id)).toEqual([2, 1, 4, 3]);
  });
});
