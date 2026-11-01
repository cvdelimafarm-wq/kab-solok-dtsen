import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";

let tabel: Tabel = {};
let izinLihat = true, izinKelola = true, gagalTabel = false;
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel, () => (gagalTabel ? { code: "42P01", message: "relation does not exist" } : null)) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: (h: Headers) => (h.get("x-aktor") ? Number(h.get("x-aktor")) : null),
  izinAkun: async () => ({ izin: {} }),
  boleh: (_i: unknown, _m: string, tingkat: string) => (tingkat === "kelola" ? izinKelola : izinLihat),
}));
const { GET, POST, PATCH } = await import("../../app/api/sigap/vanguard/usulan/route");

const H = (akun = "77", lebih: Record<string, string> = {}) => ({ "x-akun": akun, "content-type": "application/json", ...lebih });
const ok = { judul: "Beras raskin dibayar tunai", cerita: "Rumah tangga membeli beras raskin 10 kg dengan harga Rp3.000 per kg dari pemerintah desa.", jawaban: "Dicatat sebagai bantuan pemerintah.", blok: "V.E" };
const kirim = (b: unknown, h = H()) => POST(new NextRequest("http://uji.local/api/sigap/vanguard/usulan", { method: "POST", headers: h, body: JSON.stringify(b) }));
const ambil = (qs = "", h: Record<string, string> = H()) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/usulan${qs}`, { headers: h }));
const tinjau = (b: unknown, h = H("1")) => PATCH(new NextRequest("http://uji.local/api/sigap/vanguard/usulan", { method: "PATCH", headers: h, body: JSON.stringify(b) }));

beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local"; tabel = { sigap_akun: [{ id: 77, nama: "Rina" }, { id: 88, nama: "Budi" }] }; izinLihat = true; izinKelola = true; gagalTabel = false; });

describe("usul kasus", () => {
  it("401 tanpa sesi; mode lihat tidak boleh menulis; usulan tak sah = 400", async () => {
    expect((await ambil("", {})).status).toBe(401);
    expect((await kirim(ok, H("77", { "x-aktor": "1" }))).status).toBe(403);
    expect((await kirim({ ...ok, judul: "a" })).status).toBe(400);
    expect((await kirim({ ...ok, cerita: ok.cerita + " 1306010101010001" })).status).toBe(400);
  });
  it("mengirim dan melihat usulan sendiri (tanpa isi cerita di daftar pribadi); usulan orang lain tidak terlihat", async () => {
    const r = await (await kirim(ok)).json();
    expect(r.id).toBeGreaterThan(0);
    await kirim({ ...ok, judul: "Usulan Budi lain" }, H("88"));
    const saya = await (await ambil()).json();
    expect(saya.usulan).toHaveLength(1);
    expect(saya.usulan[0]).toMatchObject({ judul: ok.judul, status: "baru" });
    expect(saya.usulan[0].cerita).toBeUndefined();
    expect(tabel.sigap_vanguard_usulan[0]).toMatchObject({ akun_id: 77, status: "baru", blok: "V.E" });
  });
  it("batas 5 usulan per 24 jam = 429", async () => {
    for (let i = 0; i < 5; i++) expect((await kirim({ ...ok, judul: `Usulan nomor ${i + 1} kasus` })).status).toBe(200);
    expect((await kirim(ok)).status).toBe(429);
    expect((await kirim(ok, H("88"))).status).toBe(200);
  });
  it("admin: semua usulan butuh izin lihat; berisi nama dan isi lengkap", async () => {
    await kirim(ok); izinLihat = false;
    expect((await ambil("?semua=1", H("1"))).status).toBe(403);
    izinLihat = true;
    const j = await (await ambil("?semua=1", H("1"))).json();
    expect(j.usulan[0]).toMatchObject({ nama: "Rina", judul: ok.judul, cerita: ok.cerita, status: "baru" });
  });
  it("tinjauan: butuh izin kelola; status sah; usulan tak ada = 404; tersimpan beserta peninjau", async () => {
    const { id } = await (await kirim(ok)).json();
    izinKelola = false; expect((await tinjau({ id, status: "diterima" })).status).toBe(403);
    izinKelola = true;
    expect((await tinjau({ id, status: "baru" })).status).toBe(400);
    expect((await tinjau({ id: 999, status: "diterima" })).status).toBe(404);
    expect((await tinjau({ id, status: "diterima", catatan: "Bagus, kami jadikan soal" })).status).toBe(200);
    expect(tabel.sigap_vanguard_usulan[0]).toMatchObject({ status: "diterima", catatan_admin: "Bagus, kami jadikan soal", ditinjau_oleh: 1 });
    const saya = await (await ambil()).json();
    expect(saya.usulan[0]).toMatchObject({ status: "diterima", catatan_admin: "Bagus, kami jadikan soal" });
    expect((await tinjau({ id, status: "ditolak" }, H("1", { "x-aktor": "9" }))).status).toBe(403);
  });
  it("tabel belum dibuat = 503 dengan pesan jelas", async () => {
    gagalTabel = true;
    const r = await ambil(); expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/20261101za/);
    expect((await kirim(ok)).status).toBe(503);
  });
});
