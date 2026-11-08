// (8 Nov 2026) Simulasi kelas utuh: penguncian sesudah PERIKSA, isian telat ditolak, dan rekap poin (benar, salah, kosong, luar cakupan, belum mengisi).
import { describe, expect, it } from "vitest";
import { satuanCakupan, tandaPeserta, petakanVariasi, type PesertaIsian, type IsianRoleplay } from "@/lib/vanguard/roleplay/penilaian";
import { gabungIsianTerkunci, satuanTerkunci, bersihkanIsian } from "@/lib/vanguard/roleplay/isian";
import { susunRekap, tandaGabungan, susunHasilPeserta } from "@/lib/vanguard/roleplay/susun";

describe("roleplay: simulasi satu kelas dari isi sampai rekap", () => {
  const s1 = { bagian: "iv1" as const, dari: 2, sampai: 3 };
  const sA = { bagian: "A" as const };
  const kunciA = satuanCakupan(sA);
  it("blok A punya kotak", () => { expect(kunciA.length).toBeGreaterThan(0); });
  it("alur: isi -> periksa (kunci) -> isian telat ditolak -> tandai -> rekap", () => {
    const idA = kunciA[0].slice(2);
    const lama: IsianRoleplay = bersihkanIsian({ iv1: [{ r: 2, k1: 2, k2: 30000 }], nilai: { [idA]: 500000 } });
    // sesi 1 diperiksa -> R2,R3 terkunci
    const langkah = [{ ...s1, status: "diperiksa" }, { ...sA, status: "berjalan" }];
    const kunci = satuanTerkunci(langkah);
    expect(kunci.has("r2") && kunci.has("r3")).toBe(true);
    expect(kunci.has(kunciA[0])).toBe(false);
    // peserta mencoba mengubah R2 dan menghapus R3 telat, serta mengubah kotak A (boleh)
    const baru = bersihkanIsian({ iv1: [{ r: 2, k1: 9, k2: 99999 }], nilai: { [idA]: 600000 } });
    const g = gabungIsianTerkunci(baru, lama, kunci);
    expect(g.ditolak).toEqual(["r2"]);
    expect(g.isian.iv1).toEqual(lama.iv1);
    expect((g.isian.nilai ?? {})[idA]).toBe(600000);
  });
  it("kelas 4 peserta: poin, kosong, luar cakupan, belum mengisi", () => {
    const idA = kunciA[0].slice(2);
    const P = (akun_id: number, isian: IsianRoleplay | null): PesertaIsian => ({ akun_id, isian });
    const peserta = [
      P(1, bersihkanIsian({ iv1: [{ r: 2, k1: 2, k2: 30000 }, { r: 3, k1: 1, k2: 5000 }], nilai: { [idA]: 500000 } })),
      P(2, bersihkanIsian({ iv1: [{ r: 2, k1: 2, k2: 30000 }], nilai: { [idA]: 500001 } })),
      P(3, bersihkanIsian({ iv1: [{ r: 2, k1: 2, k2: 31000 }, { r: 40, k1: 1, k2: 100 }], nilai: {} })),
      P(4, null),
    ];
    const cakupan = [...satuanCakupan(s1), ...kunciA];
    const t1 = tandaPeserta(peserta[0].isian);
    const tanda = new Map<number, Map<string, string[]>>([[1, new Map([
      ["r2", [t1.get("r2") as string]],
      ["r3", [t1.get("r3") as string]],
      [kunciA[0], [t1.get(kunciA[0]) as string]],
    ])]]);
    const gab = tandaGabungan(tanda);
    const rekap = susunRekap(peserta, new Map([[1, "A"], [2, "B"], [3, "C"], [4, "D"]]), cakupan, gab);
    const per = Object.fromEntries(rekap.map((r) => [r.akun_id, r])) as Record<number, (typeof rekap)[number]>;
    // peserta 1: semua benar -> 100; peserta 2: R2 benar, R3 kosong(0), A benar (selisih 1) -> 2/3 = 66.7
    expect(per[1].poin).toBe(100);
    expect(per[2].poin).toBe(56.7);
    // peserta 3: R2 salah -0.3, R3 kosong 0, A kosong 0, luar R40 -0.3 -> negatif -> 0
    expect(per[3].poin).toBe(0);
    expect(per[4].poin).toBe(0);
    const h = susunHasilPeserta(3, peserta[2].isian, cakupan, gab);
    expect(h.luar.map((x) => x.kunci)).toEqual(["r40"]);
    expect(petakanVariasi("r2", peserta).length).toBe(3);
  });
});
