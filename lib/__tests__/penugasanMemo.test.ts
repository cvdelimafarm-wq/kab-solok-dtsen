import { beforeEach, describe, expect, it, vi } from "vitest";

const panggilan = vi.fn();
vi.mock("@/lib/sigap", () => ({
  penugasanAkun: (...a: unknown[]) => panggilan(...a),
}));

import { AWALAN_MEMO_PENUGASAN, penugasanAkunMemo } from "@/lib/portal/penugasanMemo";
import { buangMemo } from "@/lib/portal/memoSingkat";

const db = {} as never;
const contoh = (id: number) => [{ id, peran: "ppl", kegiatan: { id: 7, nama: "Pendataan" } }];

describe("penugasanAkunMemo", () => {
  beforeEach(() => {
    panggilan.mockReset();
    buangMemo(AWALAN_MEMO_PENUGASAN);
  });

  it("pemanggilan berturut-turut untuk akun yang sama hanya menembak database sekali", async () => {
    panggilan.mockResolvedValue(contoh(1));
    const [a, b, c] = await Promise.all([penugasanAkunMemo(db, 5), penugasanAkunMemo(db, 5), penugasanAkunMemo(db, 5)]);
    await penugasanAkunMemo(db, 5);
    expect(panggilan).toHaveBeenCalledTimes(1);
    expect(a).toEqual(contoh(1));
    expect(b).toEqual(c);
  });

  it("akun berbeda tidak berbagi simpanan", async () => {
    panggilan.mockImplementation(async (_d: unknown, id: number) => contoh(id));
    const x = await penugasanAkunMemo(db, 1);
    const y = await penugasanAkunMemo(db, 2);
    expect(x[0].id).toBe(1);
    expect(y[0].id).toBe(2);
    expect(panggilan).toHaveBeenCalledTimes(2);
  });

  it("mengubah hasil tidak merusak simpanan", async () => {
    panggilan.mockResolvedValue(contoh(1));
    const a = await penugasanAkunMemo(db, 9);
    (a[0] as { peran: string }).peran = "diubah";
    a.push(a[0]);
    const b = await penugasanAkunMemo(db, 9);
    expect(b).toHaveLength(1);
    expect(b[0].peran).toBe("ppl");
  });

  it("buangMemo membuat pemanggilan berikutnya membaca ulang", async () => {
    panggilan.mockResolvedValueOnce(contoh(1)).mockResolvedValueOnce(contoh(2));
    expect((await penugasanAkunMemo(db, 3))[0].id).toBe(1);
    buangMemo(AWALAN_MEMO_PENUGASAN);
    expect((await penugasanAkunMemo(db, 3))[0].id).toBe(2);
  });

  it("galat tidak disimpan", async () => {
    panggilan.mockRejectedValueOnce(new Error("gagal")).mockResolvedValueOnce(contoh(4));
    await expect(penugasanAkunMemo(db, 4)).rejects.toThrow("gagal");
    expect((await penugasanAkunMemo(db, 4))[0].id).toBe(4);
  });
});
