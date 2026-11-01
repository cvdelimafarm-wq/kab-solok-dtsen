import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { KASUS } from "../vanguard/kasus";
import { awalForm, normalisasi } from "../keu/identifikasi";
import { buatDbPalsu, type Galat, type Tabel } from "./vanguardFakeDb";

let tabel: Tabel = {};
const gagal: (n: string) => Galat = () => null;
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel, (n) => gagal(n)) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: () => null,
}));

const { GET } = await import("../../app/api/sigap/vanguard/kasus/route");
const form = (): ReturnType<typeof awalForm> => normalisasi({ instrumen: "FASIH", vanguard: { pendataan: true, pelatihan: false } });
const levelA = KASUS.find((k) => k.level === "A")!;
const levelD = KASUS.find((k) => k.level === "D")!;

function mulai() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local";
  tabel = {
    sigap_kegiatan_fitur: [],
    keu_ident_kegiatan: [{ id: 1, ident_id: 10, kegiatan_id: 5, fungsi: "pendataan", dilepas_at: null }],
    keu_ident: [{ id: 10, status: "sah", ver: 1 }],
    keu_ident_versi: [{ ident_id: 10, ver: 1, form: form() }],
    sigap_penugasan: [{ id: 1, kegiatan_id: 5, akun_id: 77, aktif: true, sumber: null }],
    sigap_vanguard_pengaturan: [],
  };
}
const ambil = (kode: string, kepala: Record<string, string> = { "x-akun": "77" }) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/kasus?kode=${kode}`, { headers: kepala }));
const uji = (lebih: Record<string, unknown> = {}) => { tabel.sigap_vanguard_pengaturan = [{ kegiatan_id: 5, level_dibuka: [], nilai_lulus: null, buka_at: null, tutup_at: null, maks_percobaan: null, mode: "uji", ...lebih }]; };

beforeEach(mulai);

describe("GET /api/sigap/vanguard/kasus", () => {
  it("tanpa sesi = 401; kode tidak sah = 400; kode tidak ada = 404", async () => {
    expect((await ambil(levelA.kode, {})).status).toBe(401);
    for (const k of ["", "a01", "A1", "A001", "AA1", "../x"]) expect((await ambil(k)).status, k).toBe(400);
    expect((await ambil("Z99")).status).toBe(404);
  });
  it("latihan/bebas: mengembalikan bagian rahasia lengkap dan tidak mengulang bahan soal", async () => {
    const j = await (await ambil(levelA.kode)).json();
    expect(j.kode).toBe(levelA.kode);
    expect(j.rahasia.kunci).toEqual(levelA.kunci);
    expect(Object.keys(j.rahasia).sort()).toEqual(expect.arrayContaining(["alternatif", "jebakan", "kunci", "langkah", "pembahasan", "petunjuk", "rujukan"]));
    expect(j.rahasia.cerita).toBeUndefined();
  });
  it("selama uji berlaku, peserta kegiatan itu DITOLAK 403 untuk kasus pada level yang diuji (juga tanpa menyebut kegiatan)", async () => {
    uji({ level_dibuka: ["A"] });
    const r = await ambil(levelA.kode);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/sedang diujikan/);
  });
  it("level yang tidak diuji tetap tersedia; bukan peserta kegiatan uji tetap tersedia", async () => {
    uji({ level_dibuka: ["A"] });
    expect((await ambil(levelD.kode)).status).toBe(200);
    expect((await ambil(levelA.kode, { "x-akun": "99" })).status).toBe(200);
  });
  it("uji di luar jadwal atau kegiatan bermode latihan tidak mengunci", async () => {
    uji({ tutup_at: "2020-01-01T00:00:00Z" });
    expect((await ambil(levelA.kode)).status).toBe(200);
    uji({ buka_at: "2099-01-01T00:00:00Z" });
    expect((await ambil(levelA.kode)).status).toBe(200);
    uji({ mode: "latihan" });
    expect((await ambil(levelA.kode)).status).toBe(200);
  });
  it("tabel atau kolom mode belum ada (SQL belum dijalankan) = tidak mengunci dan tidak error", async () => {
    delete (tabel as Record<string, unknown>).sigap_vanguard_pengaturan;
    expect((await ambil(levelA.kode)).status).toBe(200);
  });
});
