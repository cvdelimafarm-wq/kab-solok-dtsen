import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";

let tabel: Tabel = {};
let izinAda: string[] = [];
let gagalUpsert = false;
const audit: { aksi: string; detail: Record<string, unknown> }[] = [];
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel, (n) => (gagalUpsert && n === "sigap_vanguard_pengaturan:upsert" ? { message: "kolom mode tidak ada" } : null)) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: (h: Headers) => (h.get("x-aktor") ? Number(h.get("x-aktor")) : null),
  izinAkun: async () => ({ peran: [], izin: {} }),
  boleh: (_izin: unknown, menu: string, level: string) => izinAda.includes(level === "kelola" ? `${menu}:kelola` : menu),
  catatAudit: async (_db: unknown, _akun: number, aksi: string, detail: Record<string, unknown>) => { audit.push({ aksi, detail }); },
}));
const { GET, POST } = await import("../../app/api/sigap/vanguard/admin/route");

const baris = (n: number, f: (i: number) => Record<string, unknown>) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ...f(i) }));
function mulai() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local";
  izinAda = ["pelatihan.kelola"];
  audit.length = 0;
  tabel = {
    sigap_kegiatan: [{ id: 5, nama: "UJI Pelatihan", jenis: "pelatihan", aktif: true }, { id: 4, nama: "UJI Pendataan", jenis: "pendataan", aktif: true }],
    sigap_kegiatan_fitur: [{ kegiatan_id: 5, fitur: "vanguard", aktif: true }],
    keu_ident_kegiatan: [], keu_ident: [], keu_ident_versi: [],
    sigap_penugasan: [{ id: 1, kegiatan_id: 5, akun_id: 1, peran: "ppl", aktif: true, sumber: null }, { id: 2, kegiatan_id: 5, akun_id: 2, peran: "pml", aktif: true, sumber: null }, { id: 3, kegiatan_id: 5, akun_id: 3, peran: "ppl", aktif: true, sumber: "administrasi" }],
    sigap_akun: [{ id: 1, nama: "Rina" }, { id: 2, nama: "=CMD()" }, { id: 3, nama: "Admin Tambahan" }, { id: 9, nama: "Mantan Peserta" }],
    sigap_vanguard_percobaan: [
      { id: 1, kegiatan_id: 5, akun_id: 1, kasus: "A01", nomor: 1, benar: false, bintang: 0, jml_salah: 1, jml_fatal: 1, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 30, dibuat_at: "2026-11-01T01:00:00Z" },
      { id: 2, kegiatan_id: 5, akun_id: 1, kasus: "A01", nomor: 2, benar: true, bintang: 2, jml_salah: 0, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 50, dibuat_at: "2026-11-01T01:05:00Z" },
      { id: 3, kegiatan_id: 5, akun_id: 9, kasus: "A02", nomor: 1, benar: true, bintang: 3, jml_salah: 0, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 20, dibuat_at: "2026-11-01T02:00:00Z" },
      { id: 4, kegiatan_id: 4, akun_id: 1, kasus: "A01", nomor: 1, benar: true, bintang: 3, jml_salah: 0, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 20, dibuat_at: "2026-11-01T02:00:00Z" },
    ],
    sigap_vanguard_kesalahan: [{ id: 1, kegiatan_id: 5, akun_id: 1, kasus: "A01", sel: "e_rtLain_barangD", jenis: "konversi_seminggu", tingkat: "fatal" }, { id: 2, kegiatan_id: 4, akun_id: 1, kasus: "A01", sel: null, jenis: "belum_diisi", tingkat: "berat" }],
  };
}
const ambil = (q = "", kepala: Record<string, string> = { "x-akun": "7" }) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/admin${q}`, { headers: kepala }));
beforeEach(mulai);

describe("GET /api/sigap/vanguard/admin", () => {
  it("tanpa sesi = 401; tanpa izin = 403; kegiatan tak sah = 400; tak ada = 404", async () => {
    expect((await ambil("", {})).status).toBe(401);
    expect((await ambil("?kegiatan=4")).status).toBe(403); // izin hanya pelatihan.kelola; kegiatan 4 = pendataan butuh translok.monitoring
    expect((await ambil("?kegiatan=abc")).status).toBe(400);
    expect((await ambil("?kegiatan=99")).status).toBe(404);
    izinAda = [];
    expect((await ambil("?kegiatan=5")).status).toBe(403);
  });
  it("daftar: hanya kegiatan yang boleh dilihat dan memakai Vanguard", async () => {
    const d = await (await ambil()).json();
    expect(d.daftar).toEqual([{ id: 5, nama: "UJI Pelatihan", jenis: "pelatihan", menyala: true, percobaan: 3 }]);
    izinAda = ["pelatihan.kelola", "translok.monitoring"];
    const d2 = await (await ambil()).json();
    expect(d2.daftar.map((x: { id: number }) => x.id).sort()).toEqual([4, 5]); // kegiatan 4: ada percobaan walau Vanguard mati
  });
  it("dasbor satu kegiatan: hanya data kegiatan itu; peserta tambahan administrasi tidak dihitung; mantan peserta bernama", async () => {
    const r = await ambil("?kegiatan=5"); expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.terpotong).toBe(false);
    expect(j.kegiatan).toMatchObject({ id: 5, jenis: "pelatihan" });
    expect(j.dasbor.ringkasan).toMatchObject({ peserta: 2, mencoba: 2, percobaan: 3, kesalahanTotal: 1, kesalahanFatal: 1 });
    expect(j.dasbor.petugas.map((p: { nama: string }) => p.nama).sort()).toEqual(["=CMD()", "Mantan Peserta", "Rina"]);
  });
  it("CSV skor: berkas unduhan dengan nama bertanggal; sel berbahaya dinetralkan", async () => {
    const r = await ambil("?kegiatan=5&format=csv&bagian=skor");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="vanguard_skor_\d{8}\.csv"$/);
    const byte = new Uint8Array(await r.clone().arrayBuffer());
    expect([byte[0], byte[1], byte[2]]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 agar Excel membaca huruf Indonesia dengan benar (text() membuangnya)
    const t = await r.text();
    expect(t.startsWith("Nama,Peran")).toBe(true);
    expect(t).toContain("'=CMD()");
    expect(t).not.toMatch(/(^|\r\n)=CMD/);
  });
  it("CSV kesalahan", async () => {
    const t = await (await ambil("?kegiatan=5&format=csv&bagian=kesalahan")).text();
    expect(t).toContain("Rina,A01,");
    expect(t).toContain("Fatal");
    expect(t.trim().split("\r\n")).toHaveLength(2);
  });
  it("lebih dari 50.000 baris dipotong dan ditandai", async () => {
    tabel.sigap_vanguard_percobaan = baris(50_000, (i) => ({ kegiatan_id: 5, akun_id: 1, kasus: "A01", nomor: i + 1, benar: false, bintang: 0, jml_salah: 1, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 1, dibuat_at: "2026-11-01T01:00:00Z" }));
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.terpotong).toBe(true);
    expect(j.dasbor.ringkasan.percobaan).toBe(50_000);
  });
});

const kirim = (badan: unknown, kepala: Record<string, string> = { "x-akun": "7" }) =>
  POST(new NextRequest("http://uji.local/api/sigap/vanguard/admin", { method: "POST", headers: kepala, body: typeof badan === "string" ? badan : JSON.stringify(badan) }));

describe("pengaturan pada rute admin", () => {
  it("GET: pengaturan bawaan dan boleh_kelola menurut izin", async () => {
    let j = await (await ambil("?kegiatan=5")).json();
    expect(j.pengaturan).toMatchObject({ level_dibuka: [], nilai_lulus: null, status: "buka" });
    expect(j.boleh_kelola).toBe(false);
    izinAda = ["pelatihan.kelola", "pelatihan.kelola:kelola"];
    j = await (await ambil("?kegiatan=5")).json();
    expect(j.boleh_kelola).toBe(true);
  });
  it("GET: lulus dan kalkulator ikut dihitung dari pengaturan dan cacahan", async () => {
    tabel.sigap_vanguard_pengaturan = [{ kegiatan_id: 5, level_dibuka: ["A"], nilai_lulus: 1, buka_at: null, tutup_at: null, maks_percobaan: null }];
    tabel.sigap_vanguard_kalkulator = [{ kegiatan_id: 5, akun_id: 1, jumlah: 6 }];
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.dasbor.ringkasan).toMatchObject({ lulus: 1, kalkulatorPetugas: 1, kalkulatorTotal: 6 });
    expect(j.dasbor.petugas.find((p: { nama: string }) => p.nama === "Rina")).toMatchObject({ lulus: true, kalkulator: 6 });
  });
  it("POST: tanpa sesi 401; masuk sebagai 403; tanpa izin kelola 403; kegiatan tak sah 400; tak ada 404", async () => {
    izinAda = ["pelatihan.kelola:kelola"];
    const b = { kegiatan: 5, pengaturan: { nilai_lulus: 80 } };
    expect((await kirim(b, {})).status).toBe(401);
    expect((await kirim(b, { "x-akun": "7", "x-aktor": "1" })).status).toBe(403);
    expect((await kirim({ ...b, kegiatan: "5" })).status).toBe(400);
    expect((await kirim({ ...b, kegiatan: 99 })).status).toBe(404);
    expect((await kirim("{rusak")).status).toBe(400);
    izinAda = ["pelatihan.kelola"]; // lihat saja
    expect((await kirim(b)).status).toBe(403);
    expect(tabel.sigap_vanguard_pengaturan ?? []).toHaveLength(0);
  });
  it("POST: pengaturan tidak sah ditolak dengan pesan; yang sah disimpan, diaudit, dan terbaca di GET", async () => {
    izinAda = ["pelatihan.kelola", "pelatihan.kelola:kelola"];
    const tolak = await kirim({ kegiatan: 5, pengaturan: { nilai_lulus: 101 } });
    expect(tolak.status).toBe(400);
    expect((await tolak.json()).error).toContain("Nilai lulus");
    expect(tabel.sigap_vanguard_pengaturan ?? []).toHaveLength(0);
    const r = await kirim({ kegiatan: 5, pengaturan: { level_dibuka: ["B", "A"], nilai_lulus: 80, maks_percobaan: 5, buka_at: "2026-11-01T01:00:00Z", tutup_at: "2099-01-01T00:00:00Z" } });
    expect(r.status).toBe(200);
    expect((await r.json()).pengaturan).toMatchObject({ level_dibuka: ["A", "B"], nilai_lulus: 80, maks_percobaan: 5, status: "buka" });
    expect(tabel.sigap_vanguard_pengaturan).toHaveLength(1);
    expect(tabel.sigap_vanguard_pengaturan[0]).toMatchObject({ kegiatan_id: 5, level_dibuka: ["A", "B"], nilai_lulus: 80, maks_percobaan: 5, diubah_oleh: "Akun 7".replace("Akun 7", "akun 7") });
    expect(audit).toEqual([{ aksi: "vanguard_pengaturan", detail: expect.objectContaining({ kegiatan_id: 5 }) }]);
    const j = await (await ambil("?kegiatan=5")).json();
    expect(j.pengaturan).toMatchObject({ level_dibuka: ["A", "B"], nilai_lulus: 80, maks_percobaan: 5 });
    // simpan ulang = ubah baris yang sama (bukan menambah)
    await kirim({ kegiatan: 5, pengaturan: { nilai_lulus: 60 } });
    expect(tabel.sigap_vanguard_pengaturan).toHaveLength(1);
    expect(tabel.sigap_vanguard_pengaturan[0]).toMatchObject({ nilai_lulus: 60, level_dibuka: [] });
  });
  it("mode uji (V5b): disimpan, terbaca di GET, dan mode salah ditolak", async () => {
    izinAda = ["pelatihan.kelola", "pelatihan.kelola:kelola"];
    const r = await kirim({ kegiatan: 5, pengaturan: { mode: "uji", nilai_lulus: 70 } });
    expect(r.status).toBe(200);
    expect((await r.json()).pengaturan).toMatchObject({ mode: "uji", nilai_lulus: 70 });
    expect(tabel.sigap_vanguard_pengaturan[0]).toMatchObject({ mode: "uji" });
    expect((await (await ambil("?kegiatan=5")).json()).pengaturan.mode).toBe("uji");
    const tolak = await kirim({ kegiatan: 5, pengaturan: { mode: "ujian" } });
    expect(tolak.status).toBe(400);
    expect((await tolak.json()).error).toBe("Mode harus latihan atau uji.");
    expect(tabel.sigap_vanguard_pengaturan[0].mode).toBe("uji"); // tidak berubah
  });
  it("mode uji tidak dapat disimpan bila penyimpanan gagal (kolom mode belum ada): pesan menyebut SQL 20261101x dan tidak ada yang berubah", async () => {
    izinAda = ["pelatihan.kelola", "pelatihan.kelola:kelola"];
    gagalUpsert = true;
    try {
      const r = await kirim({ kegiatan: 5, pengaturan: { mode: "uji" } });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect((await r.json()).error).toMatch(/20261101x/);
      expect(tabel.sigap_vanguard_pengaturan ?? []).toHaveLength(0);
    } finally { gagalUpsert = false; }
  });
});
