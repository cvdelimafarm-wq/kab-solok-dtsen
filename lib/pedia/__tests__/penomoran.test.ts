// (7 Okt 2026) SIGAP PEDIA -- test penomoran registrasi.
// Bagian DB (pemanggilan bersamaan) hanya jalan bila PEDIA_TEST_DB=1 + NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY diset; memakai tahun uji 1999 (tidak mengganggu nomor tahun berjalan).
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { slugNomor } from "../umum";

const pola = /^SP\/[A-Z]+\.\d{2}\/\d{4}\/\d{4}$/;

describe("format nomor", () => {
  it("SP/{KODE_SUB}/{0001}/{TAHUN}", () => {
    expect("SP/PD.04/0001/2026").toMatch(pola);
    expect("SP/PBJ.02/0123/2026").toMatch(pola);
    expect(slugNomor("SP/PD.04/0001/2026")).toBe("SP_PD.04_0001_2026");
  });
});

const adaDb = process.env.PEDIA_TEST_DB === "1" && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!adaDb)("pedia_nomor_baru (database)", () => {
  it("20 pemanggilan bersamaan -> 20 nomor unik berurutan tanpa celah", async () => {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const hasil = await Promise.all(Array.from({ length: 20 }, () => db.rpc("pedia_nomor_baru", { p_tahun: 1999 })));
    const nomor = hasil.map((h) => h.data as number).sort((a, b) => a - b);
    expect(new Set(nomor).size).toBe(20);
    for (let i = 1; i < nomor.length; i++) expect(nomor[i] - nomor[i - 1]).toBe(1);
  });
});
