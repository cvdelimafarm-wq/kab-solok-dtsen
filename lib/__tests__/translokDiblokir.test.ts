import { describe, expect, it } from "vitest";
import { translokDiblokir } from "../sigap";

// Db palsu: from().select().eq().eq().maybeSingle()
function dbPalsu(hasil: { data: unknown; error: unknown }) {
  const rantai: Record<string, unknown> = {};
  rantai.select = () => rantai;
  rantai.eq = () => rantai;
  rantai.maybeSingle = async () => hasil;
  return { from: () => rantai } as never;
}

describe("translokDiblokir", () => {
  it("true untuk blokir dan diajukan", async () => {
    expect(await translokDiblokir(dbPalsu({ data: { status: "blokir" }, error: null }), 1, 311)).toBe(true);
    expect(await translokDiblokir(dbPalsu({ data: { status: "diajukan" }, error: null }), 1, 311)).toBe(true);
  });
  it("false untuk dibuka, tanpa baris, atau tabel belum ada (galat)", async () => {
    expect(await translokDiblokir(dbPalsu({ data: { status: "dibuka" }, error: null }), 1, 311)).toBe(false);
    expect(await translokDiblokir(dbPalsu({ data: null, error: null }), 1, 311)).toBe(false);
    expect(await translokDiblokir(dbPalsu({ data: null, error: { message: 'relation "sigap_translok_blokir" does not exist' } }), 1, 311)).toBe(false);
  });
});
