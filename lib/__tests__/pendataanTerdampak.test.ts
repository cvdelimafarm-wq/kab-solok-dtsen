import { describe, expect, it } from "vitest";
import { hanyaSubAktif, ringkasAktif } from "../pendataan";

describe("hanya Sub SLS terdampak (non aktif disembunyikan)", () => {
  it("hanyaSubAktif membuang yang nonaktif; tanpa kolom nonaktif dianggap aktif", () => {
    const sub = [{ idsubsls: "A" }, { idsubsls: "B", nonaktif: true }, { idsubsls: "C", nonaktif: false }, { idsubsls: "D", nonaktif: null }];
    expect(hanyaSubAktif(sub).map((s) => s.idsubsls)).toEqual(["A", "C", "D"]);
  });
  it("ringkasAktif membuang baris Sub SLS non aktif", () => {
    const baris = [{ idsubsls: "A", jumlah: 5 }, { idsubsls: "B", jumlah: 7 }, { idsubsls: "A", jumlah: 2 }];
    expect(ringkasAktif(baris, new Set(["B"]))).toEqual([{ idsubsls: "A", jumlah: 5 }, { idsubsls: "A", jumlah: 2 }]);
    expect(ringkasAktif(baris, new Set())).toHaveLength(3);
  });
});
