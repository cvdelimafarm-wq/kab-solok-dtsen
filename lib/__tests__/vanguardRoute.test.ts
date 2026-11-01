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
    tabel.sigap_vanguard_kesalahan.push({ id: 1, percobaan_id: 1, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, jenis: "konversi_seminggu", tingkat: "fatal" }, { id: 2, percobaan_id: 1, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, jenis: "konversi_seminggu", tingkat: "fatal" }, { id: 3, percobaan_id: 1, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, jenis: "alternatif", tingkat: "berat" }, { id: 4, percobaan_id: 2, kegiatan_id: 5, akun_id: 99, kasus: "B01", jenis: "belum_diisi", tingkat: "berat" });
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j).toMatchObject({ boleh: true, riwayat: [{ kasus: kasus.kode, percobaan: 1, benar: true, bintang: 3 }] });
    expect(j.lemah).toEqual([{ jenis: "konversi_seminggu", jumlah: 2 }, { jenis: "alternatif", jumlah: 1 }]); // hanya milik sendiri, urut terbanyak
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

describe("pengaturan per kegiatan dan cacahan kalkulator", () => {
  const atur = (o: Record<string, unknown>) => { tabel.sigap_vanguard_pengaturan = [{ kegiatan_id: 5, level_dibuka: [], nilai_lulus: null, buka_at: null, tutup_at: null, maks_percobaan: null, ...o }]; };
  const levelLain = KASUS_BERNILAI.find((k) => k.level !== kasus.level)!;

  it("GET menyertakan pengaturan (bawaan bila belum ada) dan status lulus", async () => {
    tabel.sigap_vanguard_percobaan.push({ id: 1, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, nomor: 1, benar: true, bintang: 3 });
    const j0 = await (await ambil("?kegiatan=5")).json();
    expect(j0.pengaturan).toMatchObject({ level_dibuka: [], nilai_lulus: null, buka_at: null, tutup_at: null, maks_percobaan: null, status: "buka" });
    expect(j0.lulus).toMatchObject({ benar: 1, lulus: null });
    atur({ level_dibuka: [kasus.level], nilai_lulus: 50, maks_percobaan: 4 });
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.pengaturan).toMatchObject({ level_dibuka: [kasus.level], nilai_lulus: 50, maks_percobaan: 4, status: "buka" });
    expect(j.lulus.dibuka).toBeGreaterThan(0);
    expect(j.lulus.benar).toBe(1);
  });
  it("jadwal: belum buka dan sudah tutup ditolak 403 tanpa rekaman; di dalam jadwal diterima", async () => {
    atur({ buka_at: new Date(Date.now() + 3_600_000).toISOString() });
    let r = await kirim(muatan({ ...kasus.kunci })); expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("Latihan Vanguard untuk kegiatan ini belum dibuka.");
    atur({ tutup_at: new Date(Date.now() - 3_600_000).toISOString() });
    r = await kirim(muatan({ ...kasus.kunci })); expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("Latihan Vanguard untuk kegiatan ini sudah ditutup.");
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(0);
    atur({ buka_at: new Date(Date.now() - 3_600_000).toISOString(), tutup_at: new Date(Date.now() + 3_600_000).toISOString() });
    expect((await kirim(muatan({ ...kasus.kunci }))).status).toBe(200);
    expect((await (await ambil("?kegiatan=5")).json()).pengaturan.status).toBe("buka");
  });
  it("level belum dibuka ditolak 403 (walau klien dimanipulasi)", async () => {
    atur({ level_dibuka: [kasus.level] });
    const r = await kirim(muatan({}, { kasus: levelLain.kode }));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("Kasus ini belum dibuka untuk kegiatan Anda.");
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(0);
    expect((await kirim(muatan({ ...kasus.kunci }))).status).toBe(200);
  });
  it("batas percobaan per kegiatan: percobaan ke-3 ditolak 429 bila batas 2", async () => {
    atur({ maks_percobaan: 2 });
    expect((await kirim(muatan({}))).status).toBe(200);
    expect((await kirim(muatan({}))).status).toBe(200);
    const r = await kirim(muatan({})); expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("Batas percobaan untuk kasus ini sudah tercapai.");
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(2);
  });
  it("kalkulator: cacahan bertambah sesuai kiriman; nilai tak sah ditolak; tanpa cacahan tidak menulis", async () => {
    tabel.sigap_vanguard_kalkulator = [];
    expect((await kirim(muatan({}))).status).toBe(200);
    expect(tabel.sigap_vanguard_kalkulator).toHaveLength(0);
    expect((await kirim(muatan({}, { kalkulator: 3 }))).status).toBe(200);
    expect(tabel.sigap_vanguard_kalkulator).toHaveLength(1);
    expect(tabel.sigap_vanguard_kalkulator[0]).toMatchObject({ kegiatan_id: 5, akun_id: 77, jumlah: 3 });
    expect((await kirim(muatan({}, { kalkulator: 2 }))).status).toBe(200);
    expect(tabel.sigap_vanguard_kalkulator[0].jumlah).toBe(5);
    for (const v of [-1, 1.5, 501, "2"]) expect((await kirim(muatan({}, { kalkulator: v }))).status).toBe(400);
  });
});

describe("mode uji (V5b)", () => {
  const uji = (lebih: Record<string, unknown> = {}) => { tabel.sigap_vanguard_pengaturan = [{ kegiatan_id: 5, level_dibuka: [], nilai_lulus: null, buka_at: null, tutup_at: null, maks_percobaan: null, mode: "uji", ...lebih }]; };

  it("GET: uji berlaku -> uji true dan TANPA kemampuan (peta saran); latihan -> uji false dengan kemampuan", async () => {
    uji();
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.uji).toBe(true);
    expect(j.kemampuan).toBeUndefined();
    expect(j.pengaturan.mode).toBe("uji");
    tabel.sigap_vanguard_pengaturan = [];
    const l = await (await ambil("?kegiatan=5")).json();
    expect(l.uji).toBe(false);
    expect(Object.keys(l.kemampuan).length).toBeGreaterThan(50);
    expect(JSON.stringify(l.kemampuan)).not.toMatch(/\d{4,}/); // hanya jenis kesalahan, tanpa angka kunci
  });
  it("GET: mode uji di luar jadwal tidak berlaku (uji false)", async () => {
    uji({ tutup_at: "2020-01-01T00:00:00Z" });
    expect((await (await ambil("?kegiatan=5")).json()).uji).toBe(false);
  });
  it("POST: balasan hanya vonis; tidak membocorkan koreksi, pemeriksaan, atau kotak yang salah; percobaan bermode uji", async () => {
    uji();
    const r = await kirim(muatan({}));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(Object.keys(j).sort()).toEqual(["benar", "bintang", "dicatat", "jmlSalah", "nomor", "uji"]);
    expect(j).toMatchObject({ dicatat: true, uji: true, nomor: 1, benar: false });
    expect(j.jmlSalah).toBeGreaterThan(0);
    expect(tabel.sigap_vanguard_percobaan[0]).toMatchObject({ mode: "uji", benar: false });
    expect(tabel.sigap_vanguard_kesalahan.length).toBeGreaterThan(0); // BPS tetap melihat rinciannya di dasbor
  });
  it("POST: jawaban benar pada uji = benar true, bintang dari percobaan saja (petunjuk dari klien diabaikan)", async () => {
    uji();
    const j = await (await kirim(muatan({ ...kasus.kunci }, { petunjuk: 3 }))).json();
    expect(j).toMatchObject({ benar: true, bintang: 3 });
    expect(tabel.sigap_vanguard_percobaan[0]).toMatchObject({ petunjuk: 0, mode: "uji", benar: true });
  });
  it("POST: 'Lihat jawaban' ditolak 400 pada uji dan tidak mencatat", async () => {
    uji();
    const r = await kirim(muatan({}, { lihatJawaban: true }));
    expect(r.status).toBe(400);
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(0);
  });
  it("POST: latihan tetap membalas koreksi dan mencatat mode latihan", async () => {
    const j = await (await kirim(muatan({}))).json();
    expect(j.koreksi).toBeDefined(); expect(j.pemeriksaan).toBeDefined();
    expect(tabel.sigap_vanguard_percobaan[0].mode).toBe("latihan");
  });
});

describe("buku uji (V5b): latihan sebelumnya tidak ikut dihitung saat kegiatan bermode uji", () => {
  const set = (lebih: Record<string, unknown> = {}) => { tabel.sigap_vanguard_pengaturan = [{ kegiatan_id: 5, level_dibuka: [], nilai_lulus: 1, buka_at: null, tutup_at: null, maks_percobaan: 2, mode: "uji", ...lebih }]; };
  const lama = (nomor: number, benar: boolean, mode: string) => ({ id: nomor, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, nomor, benar, bintang: benar ? 3 : 0, mode });

  it("GET: riwayat dan lulus hanya dari percobaan uji; latihan lama diabaikan", async () => {
    tabel.sigap_vanguard_percobaan.push(lama(1, true, "latihan"), lama(2, true, "latihan"));
    set();
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.riwayat).toEqual([]);
    expect(j.lulus).toMatchObject({ benar: 0, lulus: false });
    tabel.sigap_vanguard_percobaan.push(lama(3, true, "uji"));
    const k = await (await ambil("?kegiatan=5")).json();
    expect(k.riwayat).toEqual([{ kasus: kasus.kode, percobaan: 1, benar: true, bintang: 3 }]);
    expect(k.lulus).toMatchObject({ benar: 1, lulus: true });
  });
  it("GET: kegiatan bermode latihan tetap menghitung semua percobaan", async () => {
    tabel.sigap_vanguard_percobaan.push(lama(1, true, "latihan"), lama(2, false, "uji"));
    set({ mode: "latihan" });
    expect((await (await ambil("?kegiatan=5")).json()).riwayat).toEqual([{ kasus: kasus.kode, percobaan: 2, benar: true, bintang: 3 }]);
  });
  it("POST: batas percobaan dan nomor balasan dihitung dari percobaan uji saja (nomor di basis data tetap unik)", async () => {
    tabel.sigap_vanguard_percobaan.push(lama(1, false, "latihan"), lama(2, false, "latihan"), lama(3, false, "latihan")); // 3 latihan lama: tidak memakan jatah uji
    set(); // batas 2
    const a = await kirim(muatan({})); expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ uji: true, nomor: 1 });
    const b = await kirim(muatan({})); expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ nomor: 2 });
    const c = await kirim(muatan({})); expect(c.status).toBe(429);
    const uji = tabel.sigap_vanguard_percobaan.filter((x) => x.mode === "uji");
    expect(uji.map((x) => x.nomor)).toEqual([4, 5]); // nomor basis data lanjut dari semua percobaan
  });
  it("POST: bintang uji dari percobaan uji (pertama benar = 3 bintang walau ada latihan lama)", async () => {
    tabel.sigap_vanguard_percobaan.push(lama(1, false, "latihan"), lama(2, false, "latihan"));
    set({ maks_percobaan: null });
    const j = await (await kirim(muatan({ ...kasus.kunci }))).json();
    expect(j).toMatchObject({ benar: true, bintang: 3, nomor: 1 });
  });
});

describe("hasil final pada GET (V5c)", () => {
  const set = (lebih: Record<string, unknown> = {}) => { tabel.sigap_vanguard_pengaturan = [{ kegiatan_id: 5, level_dibuka: ["A"], nilai_lulus: 70, buka_at: null, tutup_at: null, maks_percobaan: 3, mode: "uji", ...lebih }]; };
  const A = KASUS_BERNILAI.filter((k) => k.level === "A");
  const p = (id: number, kode: string, nomor: number, benar: boolean) => ({ id, kegiatan_id: 5, akun_id: 77, kasus: kode, nomor, benar, bintang: benar ? 3 : 0, mode: "uji" });
  it("berjalan -> lulus -> tidak lulus final mengikuti riwayat uji", async () => {
    set();
    expect((await (await ambil("?kegiatan=5")).json()).final).toMatchObject({ status: "berjalan", nilai: 0, remark: null });
    const nLulus = Math.ceil(A.length * 0.7);
    A.slice(0, nLulus).forEach((k, i) => tabel.sigap_vanguard_percobaan.push(p(i + 1, k.kode, 1, true)));
    expect((await (await ambil("?kegiatan=5")).json()).final).toMatchObject({ status: "lulus", benar: nLulus, pendampingan: false });
    tabel.sigap_vanguard_percobaan = [];
    A.slice(0, 5).forEach((k, i) => tabel.sigap_vanguard_percobaan.push(p(i + 1, k.kode, 1, true)));
    A.slice(5).forEach((k, i) => [1, 2, 3].forEach((n) => tabel.sigap_vanguard_percobaan.push(p(100 + i * 3 + n, k.kode, n, false))));
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.final).toMatchObject({ status: "tidak_lulus", nilai: Math.round((5 / A.length) * 1000) / 10, pendampingan: true });
    expect(j.final.remark).toMatch(/pendampingan khusus/);
  });
});
