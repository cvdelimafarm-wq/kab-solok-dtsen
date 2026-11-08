import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/portal/realisasiOtomatis", () => ({
  ambilWilayahRingkas: async () => [
    { idsubsls: "A1", kecamatan: "Gunung Talang", nagari: "Cupak", sls: "Jorong A", sub_sls: "01" },
    { idsubsls: "B1", kecamatan: "Kubung", nagari: "Salayo", sls: "Jorong B", sub_sls: "01" },
  ],
}));

import { simpanLaporanManual } from "@/lib/sigapLaporanSlsDb";
import { PENANDA_MANUAL, SUMBER_LAPORAN_MANUAL } from "@/lib/sigapLengkapiMandiri";

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
const target = { penugasanId: 10, kegiatanId: 3, tanggal: "2026-11-02", peran: "ppl" };
const rincian = [{ kecamatan: "Gunung Talang", nagari: "Cupak", jorong: "Jorong A", terdampak: 10, tidak_terdampak: 5, tidak_ditemukan: 2 }];

describe("simpanLaporanManual", () => {
  let sisipan: Sisip[];
  beforeEach(() => { sisipan = []; });

  it("menyimpan, menandai sumber manual, tanpa idsubsls, jumlah = jumlah ketiganya, dan mencatat audit atas nama", async () => {
    const h = await simpanLaporanManual(fakeDb(false, sisipan), target, { rincian_sls: rincian, kendala: " hujan " }, 99, 5);
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
    const h = await simpanLaporanManual(fakeDb(true, sisipan), target, { rincian_sls: rincian, kendala: "" }, 5, 5);
    expect(h).toMatchObject({ status: 403 });
    expect(sisipan).toHaveLength(0);
  });
  it("menolak SLS di luar master dan tidak menulis apa pun", async () => {
    const h = await simpanLaporanManual(fakeDb(false, sisipan), target, { rincian_sls: [{ ...rincian[0], jorong: "Fiktif" }], kendala: "" }, 5, 5);
    expect(h).toMatchObject({ status: 400 });
    expect(sisipan).toHaveLength(0);
  });

  it("PML: tiga angka pengawasan disimpan di baris pertama kendala, lokasi kosong, jumlah = SLS diawasi", async () => {
    const h = await simpanLaporanManual(fakeDb(false, sisipan), { ...target, peran: "pml" }, { rincian_pengawasan: { sls: 6, ppl: 4, dokumen: 31 }, kendala: "hujan deras" }, 7, 7);
    expect(h).toEqual({ ok: true, jumlah: 6 });
    const real = sisipan.find((s) => s.tabel === "sigap_realisasi")!.baris;
    expect(real.lokasi).toEqual([]);
    expect(real.jumlah_realisasi).toBe(6);
    expect(real.kendala).toBe(`${PENANDA_MANUAL} SLS diawasi: 6 · PPL diawasi: 4 · Dokumen diperiksa: 31\nhujan deras`);
    expect(sisipan.find((s) => s.tabel === "sigap_audit")!.baris.detail).toMatchObject({ peran: "pml", sls_diawasi: 6, ppl_diawasi: 4, dokumen_diperiksa: 31 });
  });
  it("Korwil: kata 'disupervisi' dan jumlah = dokumen diperiksa", async () => {
    const h = await simpanLaporanManual(fakeDb(false, sisipan), { ...target, peran: "korwil" }, { rincian_pengawasan: { sls: 3, ppl: 2, dokumen: 12 }, kendala: "" }, 7, 7);
    expect(h).toEqual({ ok: true, jumlah: 12 });
    expect(sisipan.find((s) => s.tabel === "sigap_realisasi")!.baris.kendala).toBe(`${PENANDA_MANUAL} SLS disupervisi: 3 · PPL disupervisi: 2 · Dokumen diperiksa: 12`);
  });
  it("PML/Korwil menolak angka tidak sah dan bentuk SLS tidak dipakai; PPL tidak menerima bentuk pengawasan", async () => {
    expect(await simpanLaporanManual(fakeDb(false, sisipan), { ...target, peran: "pml" }, { rincian_pengawasan: { sls: -1, ppl: 1, dokumen: 1 }, kendala: "" }, 7, 7)).toMatchObject({ status: 400 });
    expect(await simpanLaporanManual(fakeDb(false, sisipan), { ...target, peran: "korwil" }, { rincian_pengawasan: { sls: 1, ppl: 1 }, kendala: "" }, 7, 7)).toMatchObject({ status: 400 });
    expect(await simpanLaporanManual(fakeDb(false, sisipan), { ...target, peran: "ppl" }, { rincian_pengawasan: { sls: 1, ppl: 1, dokumen: 1 }, kendala: "" }, 7, 7)).toMatchObject({ status: 400 });
    expect(sisipan).toHaveLength(0);
  });
});
