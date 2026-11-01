import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";

let tabel: Tabel = {};
let izinAda: string[] = [];
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: () => null,
  izinAkun: async () => ({ peran: [], izin: {} }),
  boleh: (_izin: unknown, menu: string) => izinAda.includes(menu),
}));
const { GET } = await import("../../app/api/sigap/vanguard/admin/route");

const baris = (n: number, f: (i: number) => Record<string, unknown>) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ...f(i) }));
function mulai() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local";
  izinAda = ["pelatihan.kelola"];
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
