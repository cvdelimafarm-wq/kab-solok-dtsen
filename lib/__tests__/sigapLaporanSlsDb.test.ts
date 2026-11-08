import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/portal/realisasiOtomatis", () => ({
  ambilWilayahRingkas: async () => [
    { idsubsls: "A1", kecamatan: "Gunung Talang", nagari: "Cupak", sls: "Jorong A", sub_sls: "01" },
    { idsubsls: "B1", kecamatan: "Kubung", nagari: "Salayo", sls: "Jorong B", sub_sls: "01" },
  ],
}));

import { simpanLaporanSlsManual } from "@/lib/sigapLaporanSlsDb";
import { SUMBER_LAPORAN_MANUAL } from "@/lib/sigapLengkapiMandiri";

type Sisip = { tabel: string; baris: Record<string, unknown> };
function fakeDb(sudahAda: boolean, sisipan: Sisip[]) {
  return {
    from(tabel: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: sudahAda && tabel === "sigap_realisasi" ? { id: 1 } : null });
      q.insert = async (baris: Record<string, unknown>) => { sisipan.push({ tabel, baris }); return { error: null }; };
      return q;
    },
  } as never;
}
const target = { penugasanId: 10, kegiatanId: 3, tanggal: "2026-11-02" };
const rincian = [{ kecamatan: "Gunung Talang", nagari: "Cupak", jorong: "Jorong A", terdampak: 10, tidak_terdampak: 5, tidak_ditemukan: 2 }];

describe("simpanLaporanSlsManual", () => {
  let sisipan: Sisip[];
  beforeEach(() => { sisipan = []; });

  it("menyimpan, menandai sumber manual, tanpa idsubsls, jumlah = jumlah ketiganya, dan mencatat audit atas nama", async () => {
    const h = await simpanLaporanSlsManual(fakeDb(false, sisipan), target, { rincian_sls: rincian, kendala: " hujan " }, 99, 5);
    expect(h).toEqual({ ok: true, jumlah: 17 });
    const real = sisipan.find((s) => s.tabel === "sigap_realisasi")!.baris;
    expect(real.jumlah_realisasi).toBe(17);
    expect(real.kendala).toBe("hujan");
    const lok = real.lokasi as Record<string, unknown>[];
    expect(lok[0]).toMatchObject({ idsubsls: null, sumber: SUMBER_LAPORAN_MANUAL, terdampak: 10, tidak_terdampak: 5, tidak_ditemukan: 2 });
    const audit = sisipan.find((s) => s.tabel === "sigap_audit")!.baris;
    expect(audit).toMatchObject({ akun_id: 99, aksi: "translok.lengkapi_laporan" });
    expect(audit.detail).toMatchObject({ untuk_akun_id: 5, oleh_sendiri: false });
  });
  it("menolak bila laporan sudah ada (tidak menimpa)", async () => {
    const h = await simpanLaporanSlsManual(fakeDb(true, sisipan), target, { rincian_sls: rincian, kendala: "" }, 5, 5);
    expect(h).toMatchObject({ status: 403 });
    expect(sisipan).toHaveLength(0);
  });
  it("menolak SLS di luar master dan tidak menulis apa pun", async () => {
    const h = await simpanLaporanSlsManual(fakeDb(false, sisipan), target, { rincian_sls: [{ ...rincian[0], jorong: "Fiktif" }], kendala: "" }, 5, 5);
    expect(h).toMatchObject({ status: 400 });
    expect(sisipan).toHaveLength(0);
  });
});
