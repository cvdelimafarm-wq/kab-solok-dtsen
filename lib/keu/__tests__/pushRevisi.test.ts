import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigapPush", () => ({ pushSiap: () => true, kirimKeAkun: async () => ({ perangkat: 0, terkirim: 0, gagal: 0 }) }));
vi.mock("@/lib/sigapPushJadwal", () => ({ jamSenyap: (ms: number) => ms === 0 }));
import { kirimPushRevisi, TAUTAN_BAWAAN } from "../pushRevisi";

const SIANG = Date.parse("2026-11-08T05:00:00Z");
const antri = [
  { notif_id: 1, akun_id: 10, judul: "Siklus revisi dibuka", isi: "isi 1", tautan: "/sigap/revisi/tanggapan" },
  { notif_id: 2, akun_id: 11, judul: "Saatnya menanggapi", isi: "isi 2", tautan: "https://jahat.example/x" },
  { notif_id: 3, akun_id: 12, judul: "Tanpa perangkat", isi: "isi 3", tautan: null },
  { notif_id: 4, akun_id: 13, judul: "Gagal kirim", isi: "isi 4", tautan: "/sigap/revisi/tanggapan" },
];
function dbPalsu(data: unknown, galat?: string) {
  const panggilan: { fn: string; args: Record<string, unknown> }[] = [];
  const db = { rpc: async (fn: string, args: Record<string, unknown>) => { panggilan.push({ fn, args }); return fn === "keu_revisi_push_antri" ? { data, error: galat ? { message: galat } : null } : { data: 1, error: null }; } };
  return { db: db as never, panggilan };
}
const pengirim = (peta: Record<number, { perangkat: number; terkirim: number; gagal: number }>, dikirim: { akun: number; url: string; tag?: string }[] = []) =>
  async (_db: unknown, akun: number[], p: { url: string; tag?: string }) => { dikirim.push({ akun: akun[0], url: p.url, tag: p.tag }); return peta[akun[0]] ?? { perangkat: 0, terkirim: 0, gagal: 0 }; };

describe("kirimPushRevisi", () => {
  it("mengirim, menandai yang terkirim atau tanpa perangkat, membiarkan yang gagal", async () => {
    const { db, panggilan } = dbPalsu(antri);
    const dikirim: { akun: number; url: string; tag?: string }[] = [];
    const h = await kirimPushRevisi(db, SIANG, false, pengirim({ 10: { perangkat: 1, terkirim: 1, gagal: 0 }, 11: { perangkat: 2, terkirim: 2, gagal: 0 }, 13: { perangkat: 1, terkirim: 0, gagal: 1 } }, dikirim) as never);
    expect(h).toMatchObject({ antrean: 4, terkirim: 2, tanpa_perangkat: 1, gagal: 1 });
    const tandai = panggilan.find((p) => p.fn === "keu_revisi_push_tandai");
    expect(tandai?.args.p_ids).toEqual([1, 2, 3]);
    expect(dikirim.find((d) => d.akun === 11)?.url).toBe(TAUTAN_BAWAAN); // tautan luar ditolak
    expect(dikirim.find((d) => d.akun === 12)?.url).toBe(TAUTAN_BAWAAN); // tanpa tautan: halaman Tanggapan
    expect(dikirim[0].tag).toBe("revisi-1");
  });
  it("uji kering hanya menghitung", async () => {
    const { db, panggilan } = dbPalsu(antri);
    const h = await kirimPushRevisi(db, SIANG, true, pengirim({}) as never);
    expect(h).toMatchObject({ antrean: 4, terkirim: 0, uji: true });
    expect(panggilan.map((p) => p.fn)).toEqual(["keu_revisi_push_antri"]);
  });
  it("jam senyap: tidak membaca antrean", async () => {
    const { db, panggilan } = dbPalsu(antri);
    const h = await kirimPushRevisi(db, 0, false, pengirim({}) as never);
    expect(h.senyap).toBe(true);
    expect(panggilan).toEqual([]);
  });
  it("galat basis data (SQL belum dijalankan) dikembalikan, tidak dilempar", async () => {
    const { db } = dbPalsu(null, "function keu_revisi_push_antri does not exist");
    const h = await kirimPushRevisi(db, SIANG, false, pengirim({}) as never);
    expect(h.galat).toMatch(/does not exist/);
    expect(h.terkirim).toBe(0);
  });
  it("antrean kosong: tidak memanggil penandaan", async () => {
    const { db, panggilan } = dbPalsu([]);
    const h = await kirimPushRevisi(db, SIANG, false, pengirim({}) as never);
    expect(h.antrean).toBe(0);
    expect(panggilan.map((p) => p.fn)).toEqual(["keu_revisi_push_antri"]);
  });
  it("pengirim melempar: dihitung gagal, lanjut ke berikutnya", async () => {
    const { db } = dbPalsu(antri.slice(0, 2));
    let n = 0;
    const h = await kirimPushRevisi(db, SIANG, false, (async () => { if (n++ === 0) throw new Error("x"); return { perangkat: 1, terkirim: 1, gagal: 0 }; }) as never);
    expect(h).toMatchObject({ gagal: 1, terkirim: 1 });
  });
});
