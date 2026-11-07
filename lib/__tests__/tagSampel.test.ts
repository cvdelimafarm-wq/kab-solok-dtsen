import { describe, expect, it } from "vitest";
import {
  bacaPeranTag, formatSisa, KOLOM_TEMPLAT_TAG, periksaTagUnggah, petaKolomTag, rekapTagSub, selisihJam, sisaDetik, statusEfektif, templatTag,
  type InfoJendela, type KonteksTag,
} from "@/lib/tagSampel";

const S1 = "1303110005000101";
const S2 = "1303110005000102";

const jendela = (o: Partial<InfoJendela> = {}): InfoJendela => ({ status: "terbuka", detik_sisa: 3600, jumlah_buka: 1, sekarang: "2026-11-09T01:00:00.000Z", dibuka_at: "2026-11-09T00:00:00.000Z", batas_at: "2026-11-10T00:00:00.000Z", ditutup_at: "2026-11-10T00:00:00.000Z", ...o });

describe("hitung mundur jendela", () => {
  it("memakai jam server, bukan jam HP", () => {
    const j = jendela();
    // HP mengira sekarang 2026-11-09T05:00 (jam HP salah +4 jam), padahal server 01:00
    const hp = Date.parse("2026-11-09T05:00:00.000Z");
    const sel = selisihJam(j.sekarang, hp);
    expect(sel).toBe(-4 * 3600_000);
    expect(sisaDetik(j, sel, hp)).toBe(23 * 3600);
    expect(sisaDetik(j, sel, hp + 3600_000)).toBe(22 * 3600);
  });
  it("tidak negatif dan nol bila tidak terbuka", () => {
    const j = jendela();
    expect(sisaDetik(j, 0, Date.parse("2026-11-11T00:00:00.000Z"))).toBe(0);
    expect(sisaDetik(jendela({ status: "terkunci" }), 0, 0)).toBe(0);
    expect(sisaDetik(jendela({ status: "belum", batas_at: undefined }), 0, 0)).toBe(0);
  });
  it("status efektif terkunci saat hitung mundur habis walau data belum dimuat ulang", () => {
    const j = jendela();
    expect(statusEfektif(j, 0, Date.parse("2026-11-09T12:00:00.000Z"))).toBe("terbuka");
    expect(statusEfektif(j, 0, Date.parse("2026-11-10T00:00:01.000Z"))).toBe("terkunci");
    expect(statusEfektif(jendela({ status: "belum" }), 0, Date.parse("2030-01-01T00:00:00.000Z"))).toBe("belum");
  });
  it("memformat sisa waktu", () => {
    expect(formatSisa(0)).toBe("0 menit");
    expect(formatSisa(30)).toBe("kurang dari 1 menit");
    expect(formatSisa(5 * 60)).toBe("5 menit");
    expect(formatSisa(23 * 3600 + 59 * 60 + 10)).toBe("23 jam 59 menit");
  });
});

describe("bacaPeranTag", () => {
  it("mengenali utama, cadangan, kosong, dan tak dikenal", () => {
    for (const v of ["utama", "Utama", " U ", "1", "x", "✓", "Sampel Utama"]) expect(bacaPeranTag(v)).toBe("utama");
    for (const v of ["cadangan", "CAD", "c", "2"]) expect(bacaPeranTag(v)).toBe("cadangan");
    for (const v of ["", "  ", null, undefined]) expect(bacaPeranTag(v)).toBe("");
    for (const v of ["mungkin", "3", "tidak"]) expect(bacaPeranTag(v)).toBeNull();
  });
});

describe("templat", () => {
  it("baris judul dan isi mengikuti kolom baku", () => {
    const t = templatTag([{ idsubsls: S1, nks: "N1", kecamatan: "K", nagari: "NG", sls: "J", kk_id: 7, nama_kk: "Pak A", anggota_lain: null, patokan: null, ppl_nama: "Ani", peran: "utama" }]);
    expect(t[0]).toEqual([...KOLOM_TEMPLAT_TAG]);
    expect(t[1]).toEqual([S1, "N1", "K", "NG", "J", "7", "Pak A", "", "", "Ani", "utama"]);
    expect(t[1]).toHaveLength(t[0].length);
  });
  it("judul templat dikenali pembacanya", () => {
    expect(petaKolomTag([...KOLOM_TEMPLAT_TAG])).toEqual({ kode: "Kode Sub SLS", kk: "ID KK", peran: "Peran Sampel" });
  });
});

const konteks = (o: Partial<KonteksTag> = {}): KonteksTag => ({
  alokasi: new Map([[S1, 2], [S2, 2]]),
  cadangan: 1,
  kk: new Map<number, string>([[1, S1], [2, S1], [3, S1], [4, S1], [11, S2], [12, S2], [13, S2]]),
  ada: new Map(),
  ...o,
});
const b = (kode: string, kk: number | string, peran: string, ekstra: Record<string, unknown> = {}) => ({ "Kode Sub SLS": kode, "ID KK": String(kk), "Nama KK": "x", "Peran Sampel": peran, ...ekstra });

describe("periksaTagUnggah", () => {
  it("berkas sah: utama dan cadangan sesuai batas", () => {
    const h = periksaTagUnggah([b(S1, 1, "utama"), b(S1, 2, "utama"), b(S1, 3, "cadangan"), b(S1, 4, ""), b(S2, 11, "utama"), b(S2, 12, "u"), b(S2, 13, "c")], konteks(), "tambah");
    expect(h.galat).toEqual([]);
    expect(h.bisa_simpan).toBe(true);
    expect(h.baris).toHaveLength(6);
    expect(h.ringkas).toMatchObject({ sampel: 6, baru: 6, sama: 0, konflik: 0, subsls: 2 });
  });
  it("peringatan bila jumlah masih kurang dari target atau jatah", () => {
    const h = periksaTagUnggah([b(S1, 1, "utama")], konteks(), "tambah");
    expect(h.galat).toEqual([]);
    expect(h.peringatan.map((p) => p.pesan).join(" ")).toMatch(/utama 1 dari target 2/);
    expect(h.peringatan.map((p) => p.pesan).join(" ")).toMatch(/cadangan 0 dari jatah 1/);
  });
  it("galat bila melebihi target atau jatah cadangan, dan bila cadangan tidak dipakai", () => {
    const lebih = periksaTagUnggah([b(S1, 1, "utama"), b(S1, 2, "utama"), b(S1, 3, "utama")], konteks(), "tambah");
    expect(lebih.bisa_simpan).toBe(false);
    expect(lebih.galat.map((g) => g.pesan).join(" ")).toMatch(/melebihi target 2/);
    const cad = periksaTagUnggah([b(S1, 1, "cadangan"), b(S1, 2, "cadangan")], konteks(), "tambah");
    expect(cad.galat.map((g) => g.pesan).join(" ")).toMatch(/melebihi jatah 1/);
    const tanpa = periksaTagUnggah([b(S1, 1, "cadangan")], konteks({ cadangan: 0 }), "tambah");
    expect(tanpa.galat.map((g) => g.pesan).join(" ")).toMatch(/tidak memakai sampel cadangan/);
  });
  it("galat: kolom hilang, kode 14 digit, ID KK tidak sah/tak cocok, ganda, peran asing, sub SLS tak beralokasi", () => {
    expect(periksaTagUnggah([{ Kode: S1, Lain: "x" }], konteks(), "tambah").galat[0].pesan).toMatch(/Kolom tidak ditemukan/);
    const h = periksaTagUnggah(
      [b("13031100050001", 1, "utama"), b(S1, "abc", "utama"), b(S1, 11, "utama"), b(S1, 1, "utama"), b(S1, 1, "cadangan"), b(S1, 2, "mungkin"), b("1303120001000101", 1, "utama")],
      konteks(), "tambah",
    );
    const pesan = h.galat.map((g) => `${g.baris}:${g.pesan}`).join("\n");
    expect(pesan).toMatch(/2:.*14 digit/);
    expect(pesan).toMatch(/3:.*ID KK "abc" tidak sah/);
    expect(pesan).toMatch(/4:.*ID KK 11 tidak cocok/);
    expect(pesan).toMatch(/6:.*sudah ada di baris 5/);
    expect(pesan).toMatch(/7:.*"mungkin" tidak dikenal/);
    expect(pesan).toMatch(/8:.*tidak ada dalam alokasi/);
    expect(h.bisa_simpan).toBe(false);
  });
  it("tidak ada KK berperan = galat; baris kosong dilewati", () => {
    const h = periksaTagUnggah([b(S1, 1, ""), {}], konteks(), "tambah");
    expect(h.dilewati).toBe(1);
    expect(h.bisa_simpan).toBe(false);
    expect(h.galat.map((g) => g.pesan).join(" ")).toMatch(/Tidak ada KK yang diberi peran/);
  });
  it("mode tambah: tag sama dilewati, peran beda = konflik (tidak ditimpa diam-diam)", () => {
    const ada = new Map([[1, { idsubsls: S1, peran: "utama" as const, hasil: null }], [2, { idsubsls: S1, peran: "utama" as const, hasil: null }]]);
    const sama = periksaTagUnggah([b(S1, 1, "utama"), b(S1, 2, "utama")], konteks({ ada }), "tambah");
    expect(sama.galat).toEqual([]);
    expect(sama.ringkas).toMatchObject({ baru: 0, sama: 2 });
    const beda = periksaTagUnggah([b(S1, 1, "cadangan"), b(S1, 2, "utama")], konteks({ ada }), "tambah");
    expect(beda.bisa_simpan).toBe(false);
    expect(beda.ringkas.konflik).toBe(1);
    expect(beda.galat[0].pesan).toMatch(/sudah bertag utama.*mode "Ganti"/);
  });
  it("mode tambah: tag lama di sub SLS ikut dihitung terhadap target", () => {
    const ada = new Map([[1, { idsubsls: S1, peran: "utama" as const, hasil: null }], [2, { idsubsls: S1, peran: "utama" as const, hasil: null }]]);
    const h = periksaTagUnggah([b(S1, 3, "utama")], konteks({ ada }), "tambah");
    expect(h.galat.map((g) => g.pesan).join(" ")).toMatch(/menjadi 3, melebihi target 2/);
  });
  it("mode ganti: peran ditukar, tag lain di sub SLS berkas dilepas, tag ber-hasil dilindungi", () => {
    const ada = new Map([
      [1, { idsubsls: S1, peran: "utama" as const, hasil: null }],
      [2, { idsubsls: S1, peran: "utama" as const, hasil: null }],
      [3, { idsubsls: S1, peran: "cadangan" as const, hasil: null }],
    ]);
    const ok = periksaTagUnggah([b(S1, 3, "utama"), b(S1, 4, "utama")], konteks({ ada }), "ganti");
    expect(ok.galat).toEqual([]);
    expect(ok.ringkas).toMatchObject({ baru: 1, ganti_peran: 1, dilepas: 2 });
    const adaHasil = new Map<number, { idsubsls: string; peran: "utama" | "cadangan"; hasil: "didata" | "menolak" | "tidak_ditemukan" | null }>(ada).set(2, { idsubsls: S1, peran: "utama" as const, hasil: "didata" as const });
    const tolak = periksaTagUnggah([b(S1, 3, "utama"), b(S1, 4, "utama")], konteks({ ada: adaHasil }), "ganti");
    expect(tolak.bisa_simpan).toBe(false);
    expect(tolak.galat.map((g) => g.pesan).join(" ")).toMatch(/sudah punya hasil pendataan \(Didata\)/);
  });
  it("ubah peran pada KK ber-hasil ditolak di kedua mode", () => {
    const ada = new Map([[1, { idsubsls: S1, peran: "utama" as const, hasil: "menolak" as const }]]);
    for (const mode of ["tambah", "ganti"] as const) {
      const h = periksaTagUnggah([b(S1, 1, "cadangan")], konteks({ ada }), mode);
      expect(h.bisa_simpan).toBe(false);
      expect(h.galat[0].pesan).toMatch(/sudah punya hasil pendataan \(Menolak\)/);
    }
  });
});

describe("rekapTagSub", () => {
  it("menghitung utama, cadangan, dan hasil", () => {
    const r = rekapTagSub(S1, 10, 2, [
      { kk_id: 1, peran: "utama", hasil: "didata", via: "hp" },
      { kk_id: 2, peran: "utama", hasil: "menolak", via: "unggah" },
      { kk_id: 3, peran: "utama", hasil: null, via: "hp" },
      { kk_id: 4, peran: "cadangan", hasil: null, via: "hp" },
    ]);
    expect(r).toMatchObject({ utama: 3, cad: 1, didata: 1, menolak: 1, tidak_ditemukan: 0, target: 10, cadangan: 2 });
  });
});
