import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { KASUS } from "../vanguard/kasus";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";

let tabel: Tabel = {};
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel) }));
vi.mock("@/lib/sigapAkses", () => ({ sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null) }));
const { GET } = await import("../../app/api/sigap/vanguard/remark/route");

const A = KASUS.filter((k) => k.level === "A" && !k.bebas);
const perc = (akun: number, kasus: string, nomor: number, benar: boolean, mode = "uji") => ({ id: Math.random(), kegiatan_id: 5, akun_id: akun, kasus, nomor, benar, bintang: benar ? 3 : 0, jml_salah: 0, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 5, dibuat_at: "2026-11-01T01:00:00Z", mode });
// akun 10 supervisor, 20 PML (tidak lulus final), 21 PML (lulus), 30 PPL (tidak lulus final), 31 PPL (berjalan), 32 PPL (lulus), 40 PPL kegiatan lain
const gagalSemua = (akun: number) => A.flatMap((k) => [1, 2, 3].map((n) => perc(akun, k.kode, n, false)));
const lulusSemua = (akun: number) => A.map((k) => perc(akun, k.kode, 1, true));

function mulai(peng: Record<string, unknown> | null = { kegiatan_id: 5, level_dibuka: ["A"], nilai_lulus: 70, maks_percobaan: 3, buka_at: null, tutup_at: null, mode: "uji" }) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local";
  tabel = {
    sigap_kegiatan_fitur: [{ kegiatan_id: 5, fitur: "vanguard", aktif: true }],
    keu_ident_kegiatan: [], keu_ident: [], keu_ident_versi: [],
    sigap_penugasan: [
      { id: 1, kegiatan_id: 5, akun_id: 10, peran: "supervisor", aktif: true, sumber: null },
      { id: 2, kegiatan_id: 5, akun_id: 20, peran: "pml", aktif: true, sumber: null },
      { id: 3, kegiatan_id: 5, akun_id: 21, peran: "pml", aktif: true, sumber: null },
      { id: 4, kegiatan_id: 5, akun_id: 30, peran: "ppl", aktif: true, sumber: null },
      { id: 5, kegiatan_id: 5, akun_id: 31, peran: "ppl", aktif: true, sumber: null },
      { id: 6, kegiatan_id: 5, akun_id: 32, peran: "ppl", aktif: true, sumber: null },
      { id: 7, kegiatan_id: 5, akun_id: 33, peran: "ppl", aktif: false, sumber: null },
      { id: 8, kegiatan_id: 6, akun_id: 40, peran: "ppl", aktif: true, sumber: null },
    ],
    sigap_akun: [10, 20, 21, 30, 31, 32, 33, 40].map((id) => ({ id, nama: `Akun ${id}` })),
    sigap_vanguard_pengaturan: peng ? [peng] : [],
    sigap_vanguard_percobaan: [...gagalSemua(20), ...lulusSemua(21), ...gagalSemua(30), ...A.slice(0, 2).map((k) => perc(31, k.kode, 1, false)), ...lulusSemua(32), ...gagalSemua(33)],
  };
}
const ambil = (akun: number | null, q = "?kegiatan=5") => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/remark${q}`, { headers: akun ? { "x-akun": String(akun) } : {} }));
beforeEach(() => mulai());

describe("GET /api/sigap/vanguard/remark: remark berjenjang", () => {
  it("tanpa sesi 401; kegiatan tidak sah 400", async () => {
    expect((await ambil(null)).status).toBe(401);
    for (const q of ["", "?kegiatan=abc", "?kegiatan=0"]) expect((await ambil(10, q)).status).toBe(400);
  });
  it("supervisor melihat PML dan PPL yang tidak lulus final (PML dulu); yang lulus, berjalan, dan tidak aktif tidak muncul", async () => {
    const j = await (await ambil(10)).json();
    expect(j.boleh).toBe(true); expect(j.peran).toBe("supervisor");
    expect(j.remark.map((r: { akun_id: number }) => r.akun_id)).toEqual([20, 30]);
    expect(j.remark[0]).toMatchObject({ peran: "pml", nilai: 0 });
    expect(j.remark[0].remark).toMatch(/pendampingan khusus/);
  });
  it("PML melihat HANYA PPL yang tidak lulus final, bukan sesama PML dan bukan dirinya", async () => {
    const j = await (await ambil(21)).json();
    expect(j.remark.map((r: { akun_id: number }) => r.akun_id)).toEqual([30]);
    const k = await (await ambil(20)).json(); // PML yang sendiri tidak lulus: tidak melihat remark dirinya
    expect(k.remark.map((r: { akun_id: number }) => r.akun_id)).toEqual([30]);
  });
  it("PPL tidak melihat remark siapa pun (termasuk miliknya); akun di luar kegiatan juga tidak", async () => {
    for (const akun of [30, 32, 40, 99]) { const j = await (await ambil(akun)).json(); expect(j, String(akun)).toMatchObject({ boleh: false, remark: [] }); }
  });
  it("tanpa nilai lulus, tanpa Vanguard menyala, atau mode latihan dengan latihan lama: kosong atau mengikuti buku", async () => {
    mulai({ kegiatan_id: 5, level_dibuka: ["A"], nilai_lulus: null, maks_percobaan: 3, buka_at: null, tutup_at: null, mode: "uji" });
    expect((await (await ambil(10)).json()).remark).toEqual([]);
    mulai(); tabel.sigap_kegiatan_fitur = [{ kegiatan_id: 5, fitur: "vanguard", aktif: false }];
    expect((await (await ambil(10)).json())).toMatchObject({ boleh: false, remark: [] });
    mulai(); tabel.sigap_vanguard_percobaan = [...gagalSemua(30).map((x) => ({ ...x, mode: "latihan" }))]; // latihan lama tidak dihitung pada kegiatan bermode uji
    expect((await (await ambil(10)).json()).remark).toEqual([]);
  });
  it("hasil final belum tercapai (masih ada percobaan) tidak diberi remark", async () => {
    tabel.sigap_vanguard_percobaan = A.map((k) => perc(30, k.kode, 1, false)); // hanya 1 dari 3 percobaan
    expect((await (await ambil(10)).json()).remark).toEqual([]);
  });
});
