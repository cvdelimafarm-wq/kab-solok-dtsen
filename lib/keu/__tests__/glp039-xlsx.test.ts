import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { argsRealisasiMasuk, bacaBerkasGlp, periksaUnggahan, sha256Hex } from "../glp039-xlsx";

function lembar(): ArrayBuffer {
  const baris = (t: string[], a: number[] = []) => { const r: (string | number | null)[] = new Array(16 + a.length).fill(null); t.forEach((x, i) => { r[i] = x; }); a.forEach((x, i) => { r[16 + i] = x; }); return r; };
  const A = [1000, 0, 200, 300, 500, 50, 500];
  const aoa = [
    baris(["LAPORAN KETERSEDIAAN DANA DETAIL TA 2026"]), baris(["Periode September 2026"]), [], [], [], [], [], [],
    baris(["GG"], A), baris(["GG.2906", "x"], A), baris(["BMA", "x"], A), baris(["BMA.005", "x"], A), baris(["051", "x"], A),
    baris(["521211", "x"], A), baris(["000252. ATK"], A), baris(["JUMLAH SELURUHNYA"], A),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lap");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("bacaBerkasGlp", () => {
  it("membaca berkas xlsx dan menghitung hash", async () => {
    const buf = lembar();
    const b = await bacaBerkasGlp(buf, "lap.xlsx");
    expect(b.hasil.ok).toBe(true);
    expect(b.hasil.item).toHaveLength(1);
    expect(b.hasil.sampaiTanggal).toBe("2026-09-30");
    expect(b.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.hash).toBe(await sha256Hex(buf));
    expect(periksaUnggahan(b, "2026-09-30")).toBeNull();
    expect(periksaUnggahan(b, "")).toMatch(/tanggal/i);
    expect(periksaUnggahan(null, "2026-09-30")).toMatch(/berkas/i);
    const a = argsRealisasiMasuk(2026, "2026-09-30", "lap.xlsx", b.hash, b.hasil);
    expect(Object.keys(a).sort()).toEqual(["p_hash", "p_item", "p_nama", "p_sampai", "p_tahun"]);
  });
  it("menolak berkas kosong dan berkas bukan Excel", async () => {
    await expect(bacaBerkasGlp(new ArrayBuffer(0), "a.xlsx")).rejects.toThrow(/kosong/);
    const sampah = new TextEncoder().encode("bukan excel sama sekali").buffer as ArrayBuffer;
    const r = await bacaBerkasGlp(sampah, "a.xlsx").catch((e: Error) => e);
    // SheetJS menerima teks sebagai CSV satu sel: tidak ada item -> tidak lolos
    if (r instanceof Error) expect(r.message).toMatch(/Excel|kosong/);
    else expect(r.hasil.ok).toBe(false);
  });
});
