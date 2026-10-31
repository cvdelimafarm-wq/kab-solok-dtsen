import { describe, expect, it } from "vitest";
import { bandingkanSeleksi, hitungPenugasanSeleksi, ringkasSeleksi, type BarisPeserta, type BarisSeleksi } from "../seleksiHasil";

const sel = (o: Partial<BarisSeleksi> = {}): BarisSeleksi => ({ id: 1, nama: "Seleksi PPL TW IV", jalur: "seleksi", status: "dibuka", kebutuhan_ppl: 10, kebutuhan_pml: 3, sudah_ppl: 2, sudah_pml: 0, ...o });
const ps = (o: Partial<BarisPeserta> = {}): BarisPeserta => ({ seleksi_id: 1, peran: "ppl", status: "terdaftar", hasil: null, konfirmasi: null, ditugaskan_at: null, ...o });

describe("ringkasSeleksi", () => {
  it("menghitung pendaftar, lulus, bersedia, menolak, ditugaskan per peran; sisa = kebutuhan - organik", () => {
    const r = ringkasSeleksi(
      [sel()],
      [
        ps(),
        ps({ hasil: "lulus", konfirmasi: "bersedia", ditugaskan_at: "2026-11-01T00:00:00Z" }),
        ps({ hasil: "lulus", konfirmasi: "menolak" }),
        ps({ hasil: "cadangan" }),
        ps({ peran: "pml", hasil: "lulus", konfirmasi: "bersedia" }),
      ],
    );
    expect(r[0].ppl).toEqual({ kebutuhan: 10, sisa: 8, pendaftar: 4, lulus: 2, bersedia: 1, menolak: 1, ditugaskan: 1 });
    expect(r[0].pml).toEqual({ kebutuhan: 3, sisa: 3, pendaftar: 1, lulus: 1, bersedia: 1, menolak: 0, ditugaskan: 0 });
  });
  it("peserta mundur dan seleksi lain tidak dihitung; urut menurut id", () => {
    const r = ringkasSeleksi([sel({ id: 2, nama: "B" }), sel({ id: 1, nama: "A" })], [ps({ status: "mundur" }), ps({ seleksi_id: 99 }), ps({ seleksi_id: 2 })]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
    expect(r[0].ppl.pendaftar).toBe(0);
    expect(r[1].ppl.pendaftar).toBe(1);
  });
  it("peran asing diabaikan; sisa tidak negatif", () => {
    const r = ringkasSeleksi([sel({ kebutuhan_ppl: 1, sudah_ppl: 5 })], [ps({ peran: "kortim" })]);
    expect(r[0].ppl.pendaftar).toBe(0);
    expect(r[0].ppl.sisa).toBe(0);
  });
});

describe("bandingkanSeleksi", () => {
  it("kurang, lebih, dan terpenuhi", () => {
    const b = bandingkanSeleksi({ ppl: 10, pml: 2 }, { ppl: 7, pml: 4 });
    expect(b[0]).toMatchObject({ peran: "ppl", direncanakan: 10, ditugaskan: 7, kurang: 3, lebih: 0 });
    expect(b[1]).toMatchObject({ peran: "pml", kurang: 0, lebih: 2 });
    expect(bandingkanSeleksi({ ppl: 3, pml: 0 }, { ppl: 3, pml: 0 })[0]).toMatchObject({ kurang: 0, lebih: 0 });
  });
  it("angka aneh dibersihkan", () => {
    expect(bandingkanSeleksi({ ppl: -4, pml: Number.NaN }, { ppl: 2.9, pml: 0 })[0]).toMatchObject({ direncanakan: 0, ditugaskan: 2 });
  });
});

describe("hitungPenugasanSeleksi", () => {
  it("hanya sumber berawalan seleksi_ dan peran ppl/pml", () => {
    const r = hitungPenugasanSeleksi([
      { peran: "ppl", sumber: "seleksi_12" },
      { peran: "pml", sumber: "seleksi_12" },
      { peran: "ppl", sumber: "admin:354" },
      { peran: "ppl", sumber: null },
      { peran: "korwil", sumber: "seleksi_12" },
      { peran: "ppl", sumber: "seleksi_13" },
    ]);
    expect(r).toEqual({ ppl: 2, pml: 1 });
  });
});
