import { describe, expect, it } from "vitest";
import {
  dariJsonPejabat, GalatPejabat, nipBerspasi, pejabatSpj, periksaIsianPejabat, tanggalAcuanTahun, tanggalAtau, tanggalIndo, timpaMasterKontrak,
} from "@/lib/pejabat";

const JSON_DB = {
  KPA: { id: 1, akun_id: 787, nama: "Bambang Suryanggono, SST., M.Ec.Dev", nip: "198209282004121001", jabatan: "Kepala BPS Kabupaten Solok", sk_nomor: "", sk_tanggal: null },
  PPK: { id: 2, akun_id: 462, nama: "Novriady, S.Ak", nip: "198011132006041003", jabatan: "Pejabat Pembuat Komitmen", sk_nomor: "001", sk_tanggal: "2026-01-02" },
  BEND: { id: 3, akun_id: 23, nama: "Alex Kandria", nip: "198406062007011004", jabatan: "Bendahara Pengeluaran", sk_nomor: "", sk_tanggal: null },
  PP: { id: 4, akun_id: 354, nama: "M. Iqbal Hadi, SST", nip: "199410062017011001", jabatan: "Pejabat Pengadaan", sk_nomor: "2", sk_tanggal: "2026-01-02" },
};

describe("pejabat: satu sumber", () => {
  it("membaca hasil keu_pejabat_pada", () => {
    const p = dariJsonPejabat(JSON_DB);
    expect(p.PPK?.nama).toBe("Novriady, S.Ak");
    expect(p.KPA?.akunId).toBe(787);
    expect(p.BEND?.skTanggal).toBeNull();
    expect(dariJsonPejabat(null)).toEqual({});
    expect(dariJsonPejabat({ PPK: { nama: "" }, XYZ: { nama: "A" } })).toEqual({});
  });

  it("kwitansi dan visum menolak bila pejabat belum diatur", () => {
    const p = dariJsonPejabat(JSON_DB);
    expect(pejabatSpj(p, "2026-10-01").ppk.nip).toBe("198011132006041003");
    expect(() => pejabatSpj({ PPK: p.PPK }, "2025-06-01")).toThrow(GalatPejabat);
    expect(() => pejabatSpj({}, "2025-06-01")).toThrow(/1 Juni 2025/);
  });

  it("format NIP dan tanggal", () => {
    expect(nipBerspasi("198011132006041003")).toBe("19801113 200604 1 003");
    expect(nipBerspasi("123")).toBe("123");
    expect(tanggalIndo("2026-01-02")).toBe("2 Januari 2026");
    expect(tanggalIndo("")).toBe("");
    expect(tanggalAtau("2026-09-30T00:00:00", "2026-11-14")).toBe("2026-09-30");
    expect(tanggalAtau(null, "2026-11-14")).toBe("2026-11-14");
    expect(tanggalAcuanTahun(2026, "2026-11-14")).toBe("2026-11-14");
    expect(tanggalAcuanTahun(2025, "2026-11-14")).toBe("2025-12-31");
  });

  it("master kontrak ditimpa pejabat; tanpa pejabat nilai lama tetap", () => {
    const lama = { Nama_PPK: "Novriady S.Ak", NIP_PPK: "19801113 200604 1 003", No_SK_PPK: "001", DIPA: "x" };
    const m = timpaMasterKontrak(lama, dariJsonPejabat(JSON_DB));
    expect(m.Nama_PPK).toBe("Novriady, S.Ak");
    expect(m.Tgl_SK_PPK).toBe("2 Januari 2026");
    expect(m.Nama_Pejabat_Pengadaan).toBe("M. Iqbal Hadi, SST");
    expect(m.NIP_Pejabat).toBe("19941006 201701 1 001");
    expect(m.DIPA).toBe("x");
    expect(timpaMasterKontrak(lama, {})).toEqual(lama);
  });

  it("pemeriksaan isian formulir", () => {
    expect(periksaIsianPejabat({ nama: "Novriady, S.Ak", nip: "19801113 200604 1 003", jabatan: "PPK", mulai: "2026-12-01" })).toEqual([]);
    expect(periksaIsianPejabat({ nama: "N", nip: "123", jabatan: "", mulai: "" })).toHaveLength(4);
  });
});
