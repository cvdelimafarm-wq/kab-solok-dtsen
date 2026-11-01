import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { KASUS_BERNILAI } from "../vanguard/kasus";
import { awalForm, normalisasi } from "../keu/identifikasi";
import { buatDbPalsu, type Galat, type Tabel } from "./vanguardFakeDb";

let tabel: Tabel = {};
let gagal: (n: string) => Galat = () => null;
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel, (n) => gagal(n)) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: (h: Headers) => (h.get("x-aktor") ? Number(h.get("x-aktor")) : null),
}));

const { GET, POST } = await import("../../app/api/sigap/vanguard/route");
const kasus = KASUS_BERNILAI.find((k) => Object.keys(k.kunci).length >= 1 && !k.nol && !k.lengkap)!;
const form = (): ReturnType<typeof awalForm> => normalisasi({ instrumen: "FASIH", vanguard: { pendataan: true, pelatihan: false } });

function mulai() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local";
  gagal = () => null;
  tabel = {
    sigap_kegiatan_fitur: [],
    keu_ident_kegiatan: [{ id: 1, ident_id: 10, kegiatan_id: 5, fungsi: "pendataan", dilepas_at: null }],
    keu_ident: [{ id: 10, status: "sah", ver: 1 }],
    keu_ident_versi: [{ ident_id: 10, ver: 1, form: form() }],
    sigap_penugasan: [{ id: 1, kegiatan_id: 5, akun_id: 77, aktif: true, sumber: null }],
    sigap_vanguard_percobaan: [], sigap_vanguard_kesalahan: [],
  };
}
const kirim = (badan: unknown, kepala: Record<string, string> = { "x-akun": "77" }) =>
  POST(new NextRequest("http://uji.local/api/sigap/vanguard", { method: "POST", headers: kepala, body: typeof badan === "string" ? badan : JSON.stringify(badan) }));
const ambil = (query = "", kepala: Record<string, string> = { "x-akun": "77" }) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard${query}`, { headers: kepala }));
const muatan = (isian: Record<string, number>, lebih: Record<string, unknown> = {}) => ({ kegiatan: 5, kasus: kasus.kode, isian, petunjuk: 0, lihatJawaban: false, durasiDtk: 20, ...lebih });

beforeEach(mulai);

describe("GET /api/sigap/vanguard", () => {
  it("tanpa sesi = 401", async () => { expect((await ambil("", {})).status).toBe(401); });
  it("tanpa kegiatan = simulasi bebas, tanpa rekaman", async () => {
    const r = await ambil(); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ mode: "bebas", boleh: false, alasan: null, riwayat: [] });
  });
  it("kegiatan tidak menyala atau bukan peserta = boleh false dengan alasan", async () => {
    expect(await (await ambil("?kegiatan=6")).json()).toMatchObject({ mode: "tercatat", boleh: false, alasan: "Vanguard belum dinyalakan di kegiatan ini." });
    expect(await (await ambil("?kegiatan=5", { "x-akun": "78" })).json()).toMatchObject({ boleh: false, alasan: "Anda bukan peserta aktif kegiatan ini." });
  });
  it("id kegiatan tidak sah diperlakukan bebas", async () => {
    for (const q of ["?kegiatan=abc", "?kegiatan=0", "?kegiatan=-1", "?kegiatan=1e3", "?kegiatan="]) expect((await (await ambil(q)).json()).mode).toBe("bebas");
  });
  it("riwayat hanya milik sendiri", async () => {
    tabel.sigap_vanguard_percobaan.push({ id: 1, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, nomor: 1, benar: true, bintang: 3 }, { id: 2, kegiatan_id: 5, akun_id: 99, kasus: "B01", nomor: 1, benar: false, bintang: 0 });
    expect(await (await ambil("?kegiatan=5")).json()).toMatchObject({ boleh: true, riwayat: [{ kasus: kasus.kode, percobaan: 1, benar: true, bintang: 3 }] });
  });
});

describe("POST /api/sigap/vanguard", () => {
  it("menolak tanpa sesi, saat masuk sebagai, JSON rusak, dan muatan tak sah", async () => {
    expect((await kirim(muatan({}), {})).status).toBe(401);
    expect((await kirim(muatan({}), { "x-akun": "77", "x-aktor": "1" })).status).toBe(403);
    expect((await kirim("{rusak")).status).toBe(400);
    expect((await kirim(muatan({}, { kegiatan: null }))).status).toBe(400);
    expect((await kirim(muatan({ sel_palsu: 1 }))).status).toBe(400);
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(0);
  });
  it("menolak mencatat bila Vanguard tidak menyala atau bukan peserta (tidak ada rekaman)", async () => {
    expect((await kirim(muatan({}, { kegiatan: 6 }))).status).toBe(403);
    expect((await kirim(muatan({}), { "x-akun": "78" })).status).toBe(403);
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(0);
  });
  it("jawaban benar: dinilai ulang di server, tercatat percobaan pertama bernilai 3 bintang", async () => {
    const r = await kirim(muatan({ ...kasus.kunci })); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ dicatat: true, nomor: 1, benar: true, bintang: 3 });
    expect(tabel.sigap_vanguard_percobaan[0]).toMatchObject({ kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, nomor: 1, benar: true, bintang: 3, mode: "latihan" });
    expect(tabel.sigap_vanguard_kesalahan).toHaveLength(0);
  });
  it("jawaban salah: tercatat dengan rincian kesalahan; percobaan berikutnya bernomor naik", async () => {
    const r1 = await (await kirim(muatan({}))).json();
    expect(r1).toMatchObject({ dicatat: true, nomor: 1, benar: false, bintang: 0 });
    expect(tabel.sigap_vanguard_kesalahan.length).toBeGreaterThan(0);
    expect(tabel.sigap_vanguard_kesalahan.every((k) => k.percobaan_id === 1 && k.akun_id === 77 && k.kegiatan_id === 5)).toBe(true);
    const r2 = await (await kirim(muatan({ ...kasus.kunci }))).json();
    expect(r2).toMatchObject({ nomor: 2, benar: true, bintang: 2 });
  });
  it("klien tidak bisa memalsukan skor: lihatJawaban=true tidak pernah benar", async () => {
    const r = await (await kirim(muatan({ ...kasus.kunci }, { lihatJawaban: true }))).json();
    expect(r).toMatchObject({ benar: false, bintang: 0 });
  });
  it("akun lain punya nomor sendiri", async () => {
    tabel.sigap_penugasan.push({ id: 2, kegiatan_id: 5, akun_id: 88, aktif: true, sumber: null });
    await kirim(muatan({}));
    const r = await (await kirim(muatan({}), { "x-akun": "88" })).json();
    expect(r.nomor).toBe(1);
  });
  it("batas percobaan per kasus", async () => {
    for (let i = 1; i <= 200; i++) tabel.sigap_vanguard_percobaan.push({ id: i, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, nomor: i, benar: false, bintang: 0 });
    expect((await kirim(muatan({}))).status).toBe(429);
  });
  it("kegagalan basis data = 500 tanpa membocorkan rincian; kegagalan rincian kesalahan dilaporkan", async () => {
    gagal = (n) => (n === "sigap_vanguard_percobaan:insert" ? { message: "rahasia internal" } : null);
    const r = await kirim(muatan({})); expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("rahasia");
    mulai(); gagal = (n) => (n === "sigap_vanguard_kesalahan:insert" ? { message: "x" } : null);
    expect((await kirim(muatan({}))).status).toBe(500);
  });
  it("kiriman bersamaan yang bertabrakan nomor dicoba ulang sekali", async () => {
    // sisipkan percobaan nomor 1 setelah hitung tetapi sebelum insert: dengan unique, insert pertama gagal 23505 lalu berhasil dengan nomor 2
    let sudah = false;
    gagal = (n) => { if (n === "sigap_vanguard_percobaan:insert" && !sudah) { sudah = true; tabel.sigap_vanguard_percobaan.push({ id: 99, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, nomor: 1, benar: false, bintang: 0 }); } return null; };
    const r = await kirim(muatan({}));
    expect(r.status).toBe(200);
    expect((await r.json()).nomor).toBe(2);
  });
});
