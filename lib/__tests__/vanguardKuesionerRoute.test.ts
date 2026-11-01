import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { KASUS_K, soalK } from "../vanguard/kuesioner/nilaiK";
import { buatDbPalsu } from "./vanguardFakeDb";

vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu({}) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: () => null,
}));

const { GET, POST } = await import("../../app/api/sigap/vanguard/kuesioner/route");
const K = KASUS_K[0];
const kepala = { "x-akun": "77", "content-type": "application/json" };
const kirim = (badan: unknown, h: Record<string, string> = kepala) => POST(new NextRequest("http://uji.local/api/sigap/vanguard/kuesioner", { method: "POST", headers: h, body: typeof badan === "string" ? badan : JSON.stringify(badan) }));
const ambil = (qs: string, h: Record<string, string> = kepala) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/kuesioner?${qs}`, { headers: h }));
const isianBenar = () => K.kunci.map((e) => ({ ...e }));

describe("GET petunjuk", () => {
  it("401 tanpa sesi; 400 kode tidak sah; 404 kasus tidak ada", async () => {
    expect((await ambil("kode=K01", {})).status).toBe(401);
    expect((await ambil("kode=k1")).status).toBe(400);
    expect((await ambil("kode=Z99")).status).toBe(404);
  });
  it("mengembalikan petunjuk berurutan sebanyak diminta (0 sampai total)", async () => {
    expect((await (await ambil("kode=K01&petunjuk=0")).json()).petunjuk).toEqual([]);
    const j = await (await ambil("kode=K01&petunjuk=2")).json();
    expect(j.petunjuk).toEqual(K.petunjuk.slice(0, 2));
    expect(j.total).toBe(K.petunjuk.length);
    expect((await (await ambil("kode=K01&petunjuk=99")).json()).petunjuk).toHaveLength(K.petunjuk.length);
    expect((await (await ambil("kode=K01&petunjuk=-3")).json()).petunjuk).toEqual([]);
  });
});

describe("POST penilaian", () => {
  it("401 tanpa sesi; 400 JSON rusak, kode tidak sah, isian tidak sah; 404 kasus tidak ada", async () => {
    expect((await kirim({ kode: "K01", isian: [] }, { "content-type": "application/json" })).status).toBe(401);
    expect((await kirim("{rusak")).status).toBe(400);
    expect((await kirim({ kode: "x", isian: [] })).status).toBe(400);
    expect((await kirim({ kode: "K01", isian: [{ r: 9999 }] })).status).toBe(400);
    expect((await kirim({ kode: "Z99", isian: [] })).status).toBe(404);
  });
  it("isian sama dengan kunci = benar; pembahasan ikut, kunci TIDAK ikut", async () => {
    const j = await (await kirim({ kode: "K01", isian: isianBenar() })).json();
    expect(j.benar).toBe(true);
    expect(j.pembahasan).toBe(K.pembahasan);
    expect(j.kunci).toBeUndefined();
  });
  it("isian kosong/salah = tidak benar; pembahasan dan kunci disembunyikan sampai diminta", async () => {
    const j = await (await kirim({ kode: "K01", isian: [{ r: 156, k1: 2, k2: 1 }] })).json();
    expect(j.benar).toBe(false);
    expect(j.kesalahan.length).toBeGreaterThan(0);
    expect(j.pembahasan).toBeUndefined();
    expect(j.kunci).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain("petunjuk");
  });
  it("lihat=true membuka kunci dan pembahasan", async () => {
    const j = await (await kirim({ kode: "K01", isian: [], lihat: true })).json();
    expect(j.kunci).toHaveLength(K.kunci.length);
    expect(j.pembahasan).toBe(K.pembahasan);
  });
});

describe("soal acak per benih (V7a)", () => {
  it("GET soal=1: tanpa benih = benih baru; dengan benih = soal yang sama; benih 0 = baku; kunci/petunjuk tidak ikut", async () => {
    const a = await (await ambil("kode=K01&soal=1")).json();
    expect(a.benih).toBeGreaterThan(0);
    expect(a.catatan.length).toBeGreaterThan(5);
    expect(Object.keys(a).sort()).toEqual(["benih", "catatan", "cerita", "info", "kode"]);
    const b = await (await ambil(`kode=K01&soal=1&benih=${a.benih}`)).json();
    expect(b).toEqual(a);
    const baku = await (await ambil("kode=K01&soal=1&benih=0")).json();
    expect(baku.catatan[0]).toContain("2 liter diambil dari warung");
    expect(baku.catatan[0]).toContain("Rp25.000");
    expect(JSON.stringify(a)).not.toMatch(/kunci|petunjuk|pembahasan/);
  });
  it("benih tidak sah = 400", async () => {
    for (const b of ["-1", "1.5", "abc", "9999999999", ""]) expect((await ambil(`kode=K01&soal=1&benih=${b}`)).status, b).toBe(400);
    expect((await kirim({ kode: "K01", isian: [], benih: -5 })).status).toBe(400);
    expect((await kirim({ kode: "K01", isian: [], benih: "7" })).status).toBe(400);
  });
  it("POST dinilai terhadap kunci benih yang sama: kunci benih 123 benar pada benih 123 tetapi tidak pada benih 456", async () => {
    const kunci = (b: number) => soalK("K01", b)!.kunci;
    const benar = await (await kirim({ kode: "K01", benih: 123, isian: kunci(123) })).json();
    expect(benar.benar).toBe(true);
    const salah = await (await kirim({ kode: "K01", benih: 456, isian: kunci(123) })).json();
    expect(salah.benar).toBe(false);
    const tanpaBenih = await (await kirim({ kode: "K01", isian: KASUS_K[0].kunci })).json(); // tanpa benih = baku
    expect(tanpaBenih.benar).toBe(true);
  });
});
