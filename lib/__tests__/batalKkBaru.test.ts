import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigapAkses", () => ({ catatAudit: vi.fn(async () => undefined) }));
import { bisaBatalkanKkBaru, periksaBatalKkBaru } from "@/lib/pendataan";
import { batalkanKkBaru } from "@/lib/portal/pendataan";
import { catatAudit } from "@/lib/sigapAkses";

const baru = (o: Partial<{ ditambah_oleh_akun: number | null; ppl_akun_id: number | null }> = {}) => ({ ditambah_oleh_akun: 91, ppl_akun_id: 91, ...o });

describe("bisaBatalkanKkBaru (tampil/sembunyi tombol)", () => {
  it("KK dari daftar awal (bukan tambahan) tidak pernah bisa dibatalkan", () => {
    expect(bisaBatalkanKkBaru({ ditambah_oleh_akun: null, ppl_akun_id: null }, 5, "pml")).toBe(false);
    expect(bisaBatalkanKkBaru({ ppl_akun_id: null }, 5, "ppl")).toBe(false);
  });
  it("PML tim boleh membatalkan KK baru siapa pun penambahnya, juga setelah rekan menimpa hasil", () => {
    expect(bisaBatalkanKkBaru(baru({ ppl_akun_id: 77 }), 5, "pml")).toBe(true);
  });
  it("PPL boleh hanya KK yang ia tambahkan sendiri", () => {
    expect(bisaBatalkanKkBaru(baru(), 91, "ppl")).toBe(true);
    expect(bisaBatalkanKkBaru(baru(), 92, "ppl")).toBe(false);
  });
  it("PPL penambah tidak boleh bila hasil sudah ditimpa rekan; hasil kosong atau miliknya tetap boleh", () => {
    expect(bisaBatalkanKkBaru(baru({ ppl_akun_id: 77 }), 91, "ppl")).toBe(false);
    expect(bisaBatalkanKkBaru(baru({ ppl_akun_id: null }), 91, "ppl")).toBe(true);
  });
  it("tanpa akun atau peran: tidak tampil", () => {
    expect(bisaBatalkanKkBaru(baru(), 0, "ppl")).toBe(false);
    expect(bisaBatalkanKkBaru(baru(), 91, null)).toBe(false);
  });
});

describe("periksaBatalKkBaru", () => {
  it("menerima kk_id bilangan bulat positif; alasan dirapikan dan dipotong 200", () => {
    expect(periksaBatalKkBaru({ aksi: "batalkan_baru", kk_id: 105047, alasan: "  dobel  " })).toEqual({ ok: true, isi: { kk_id: 105047, alasan: "dobel" } });
    expect(periksaBatalKkBaru({ kk_id: 1, alasan: "x".repeat(500) })).toMatchObject({ ok: true, isi: { alasan: "x".repeat(200) } });
    expect(periksaBatalKkBaru({ kk_id: 1 })).toEqual({ ok: true, isi: { kk_id: 1, alasan: null } });
  });
  it("menolak kk_id tidak sah", () => {
    for (const v of [undefined, null, 0, -3, 1.5, "7", NaN]) expect(periksaBatalKkBaru({ kk_id: v }).ok).toBe(false);
    expect(periksaBatalKkBaru(null).ok).toBe(false);
  });
});

function dbPalsu(jawab: unknown, error: { message: string } | null = null) {
  const panggilan: { nama: string; arg: unknown }[] = [];
  const db = {
    rpc: async (nama: string, arg: unknown) => {
      panggilan.push({ nama, arg });
      return { data: jawab, error };
    },
  };
  return { db: db as never, panggilan };
}

describe("batalkanKkBaru (server)", () => {
  it("tercatat: memanggil fungsi DB dan mencatat audit", async () => {
    vi.mocked(catatAudit).mockClear();
    const { db, panggilan } = dbPalsu({ status: "tercatat" });
    expect(await batalkanKkBaru(db, 91, 105047, "dobel")).toEqual({ ok: true, sudah: false });
    expect(panggilan).toEqual([{ nama: "bencana_pendataan_nonaktifkan", arg: { p_akun: 91, p_kk: 105047, p_alasan: "dobel" } }]);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
  it("sudah dibatalkan sebelumnya: berhasil tanpa audit ganda (idempoten)", async () => {
    vi.mocked(catatAudit).mockClear();
    const { db } = dbPalsu({ status: "sudah" });
    expect(await batalkanKkBaru(db, 91, 1, null)).toEqual({ ok: true, sudah: true });
    expect(catatAudit).not.toHaveBeenCalled();
  });
  it("ditolak: pesan jelas per alasan, alasan tak dikenal tetap ada pesan", async () => {
    for (const a of ["kk_tidak_ada", "bukan_hasil_tambah", "bukan_pml_tim", "bukan_penambah_atau_pml", "sudah_ditimpa_rekan"]) {
      const r = await batalkanKkBaru(dbPalsu({ status: "ditolak", alasan: a }).db, 1, 1, null);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.pesan.length).toBeGreaterThan(10);
    }
    const aneh = await batalkanKkBaru(dbPalsu({ status: "ditolak", alasan: "aneh" }).db, 1, 1, null);
    expect(aneh).toEqual({ ok: false, pesan: "Ditolak." });
  });
  it("galat database dilempar (ditangani route sebagai 500)", async () => {
    await expect(batalkanKkBaru(dbPalsu(null, { message: "boom" }).db, 1, 1, null)).rejects.toThrow("boom");
  });
});
