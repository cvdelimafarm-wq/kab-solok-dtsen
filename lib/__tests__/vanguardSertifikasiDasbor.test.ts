import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";
import { csvSertifikasi, susunDasborSertifikasi, type BarisButir, type BarisUjian } from "../vanguard/sertifikasi/dasbor";
import { NAMA_TINGKAT } from "../vanguard/sertifikasi/skor";

let tabel: Tabel = {};
let izinOk = true;
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: () => null,
  izinAkun: async () => ({ izin: {} }),
  boleh: () => izinOk,
}));
const { GET } = await import("../../app/api/sigap/vanguard/sertifikasi/admin/route");

const u = (id: number, akun: number, jenis: BarisUjian["jenis"], mulai: string, selesai: string | null, skor: number | null, tingkat: number | null): BarisUjian => ({ id, akun_id: akun, jenis, mulai_at: mulai, selesai_at: selesai, skor, tingkat });
const UJIAN: BarisUjian[] = [
  u(1, 10, "sertifikasi", "2026-11-01T01:00:00Z", "2026-11-01T01:30:00Z", 70, 3),
  u(2, 10, "sertifikasi", "2026-11-07T01:00:00Z", "2026-11-07T01:30:00Z", 92, 5),
  u(3, 10, "latihan", "2026-11-08T01:00:00Z", "2026-11-08T01:30:00Z", 50, 2),
  u(4, 11, "sertifikasi", "2026-11-02T01:00:00Z", "2026-11-02T01:30:00Z", 50, 2),
  u(5, 12, "sertifikasi", "2026-11-02T02:00:00Z", "2026-11-02T02:10:00Z", null, null), // dibatalkan
  u(6, 13, "latihan", "2026-11-02T03:00:00Z", null, null, null), // belum selesai
];
const BUTIR: BarisButir[] = [
  { ujian_id: 1, kasus: "A01", poin: 100, jml_fatal: 0, benar: true, jawab_at: "x", rincian: [] },
  { ujian_id: 1, kasus: "A02", poin: 40, jml_fatal: 1, benar: false, jawab_at: "x", rincian: [{ jenis: "salah_letak", tingkat: "fatal" }, { jenis: "belum_diisi", tingkat: "berat" }] },
  { ujian_id: 4, kasus: "A02", poin: 80, jml_fatal: 0, benar: false, jawab_at: "x", rincian: [{ jenis: "belum_diisi", tingkat: "berat" }] },
  { ujian_id: 4, kasus: "B01", poin: 0, jml_fatal: 0, benar: false, jawab_at: null, rincian: [{ jenis: "x", tingkat: "fatal" }] }, // belum dijawab: diabaikan
];

describe("susunDasborSertifikasi", () => {
  const d = susunDasborSertifikasi(UJIAN, BUTIR, new Map([[10, "Rina"], [11, "Budi"]]));
  it("ringkasan: petugas bersertifikat memakai tingkat tertinggi; batal dan belum selesai tidak dihitung", () => {
    expect(d.ringkasan).toMatchObject({ petugasBersertifikat: 2, petugasAktif: 4, ujianSertifikasiSelesai: 3, latihanSelesai: 1, rataSkor: 70.67 });
    expect(d.ringkasan.sebaran).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 });
  });
  it("petugas diurut menurut tingkat lalu skor; tertinggi dan terbaru dipisah; nama cadangan 'Akun n'", () => {
    expect(d.petugas.map((p) => [p.nama, p.tingkat])).toEqual([["Rina", 5], ["Budi", 2], ["Akun 12", null], ["Akun 13", null]]);
    const rina = d.petugas[0];
    expect(rina).toMatchObject({ skor: 92, sertifikasi: 2, latihan: 1, terbaru: { tingkat: 5, skor: 92 } });
    expect(d.petugas.find((p) => p.nama === "Akun 12")!.sertifikasi).toBe(0);
  });
  it("butir tersulit (rata poin terendah dahulu, butir belum dijawab diabaikan) dan kesalahan teratas", () => {
    expect(d.butirTersulit).toEqual([{ kasus: "A02", dijawab: 2, rataPoin: 60, persenBenar: 0 }, { kasus: "A01", dijawab: 1, rataPoin: 100, persenBenar: 100 }]);
    expect(d.kesalahanTeratas[0]).toEqual({ jenis: "belum_diisi", tingkat: "berat", jumlah: 2 });
    expect(d.kesalahanTeratas.some((k) => k.jenis === "x")).toBe(false);
  });
  it("csv: BOM tidak ditambahkan di fungsi, kutip bila perlu, 'Belum bersertifikat' untuk yang tanpa tingkat", () => {
    const csv = csvSertifikasi(susunDasborSertifikasi(UJIAN, BUTIR, new Map([[10, 'Rina, "S"']])), NAMA_TINGKAT);
    expect(csv.split("\n")[0]).toBe("Nama,Tingkat,Nama tingkat,Skor tertinggi,Sertifikasi selesai,Latihan selesai,Latihan harian selesai,Rangkaian harian,Kesegaran,Terakhir aktif");
    expect(csv).toContain('"Rina, ""S""",5,Expert,92,2,1,0,0,');
    expect(csv).toContain("Belum bersertifikat");
  });
  it("tanpa data: nol semua, rataSkor null", () => {
    const k = susunDasborSertifikasi([], [], new Map());
    expect(k.ringkasan).toMatchObject({ petugasBersertifikat: 0, petugasAktif: 0, rataSkor: null });
    expect(k.petugas).toEqual([]);
  });
});

describe("pembinaan di dasbor (V8)", () => {
  it("harian, tantangan, kesegaran (perlu disegarkan bila > 90 hari), streak per petugas", () => {
    const sekarang = new Date("2026-11-04T05:00:00Z");
    const uj: BarisUjian[] = [
      u(1, 10, "sertifikasi", "2026-06-01T01:00:00Z", "2026-06-01T01:30:00Z", 80, 4), // > 90 hari
      u(2, 11, "sertifikasi", "2026-10-20T01:00:00Z", "2026-10-20T01:30:00Z", 80, 4), // segar
      u(3, 10, "harian", "2026-11-03T01:00:00Z", "2026-11-03T01:05:00Z", 90, 5),
      u(4, 10, "harian", "2026-11-04T01:00:00Z", "2026-11-04T01:05:00Z", 90, 5),
      u(5, 10, "tantangan", "2026-11-02T01:00:00Z", "2026-11-02T01:20:00Z", 60, 3),
      u(6, 11, "harian", "2026-11-04T02:00:00Z", "2026-11-04T02:05:00Z", null, null), // dibatalkan
    ];
    const d = susunDasborSertifikasi(uj, [], new Map([[10, "Rina"], [11, "Budi"]]), sekarang);
    expect(d.ringkasan).toMatchObject({ harianSelesai: 2, tantanganSelesai: 1, perluDisegarkan: 1, ujianSertifikasiSelesai: 2 });
    const rina = d.petugas.find((p) => p.nama === "Rina")!, budi = d.petugas.find((p) => p.nama === "Budi")!;
    expect(rina).toMatchObject({ kesegaran: "perlu", streak: 2, harian: 2 });
    expect(budi).toMatchObject({ kesegaran: "segar", streak: 0, harian: 0 });
  });
});

describe("GET /api/sigap/vanguard/sertifikasi/admin", () => {
  beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local"; izinOk = true; tabel = { sigap_vanguard_ujian: UJIAN.map((x) => ({ ...x })), sigap_vanguard_ujian_butir: BUTIR.map((x, i) => ({ id: i + 1, ...x })), sigap_akun: [{ id: 10, nama: "Rina" }, { id: 11, nama: "Budi" }] }; });
  const ambil = (qs = "", h: Record<string, string> = { "x-akun": "1" }) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/sertifikasi/admin${qs}`, { headers: h }));
  it("401 tanpa sesi; 403 tanpa izin; 200 dengan izin", async () => {
    expect((await ambil("", {})).status).toBe(401);
    izinOk = false; expect((await ambil()).status).toBe(403);
    izinOk = true;
    const j = await (await ambil()).json();
    expect(j.dasbor.ringkasan.petugasBersertifikat).toBe(2); expect(j.dasbor.petugas[0].nama).toBe("Rina"); expect(j.terpotong).toBe(false);
  });
  it("csv diunduh dengan nama berkas bertanggal dan BOM", async () => {
    const r = await ambil("?format=csv");
    expect(r.headers.get("content-disposition")).toMatch(/vanguard_sertifikasi_\d{8}\.csv/);
    const b = new Uint8Array(await r.arrayBuffer()); expect([...b.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); expect(new TextDecoder().decode(b)).toContain("Rina");
  });
  it("tabel belum ada = 503", async () => {
    tabel = {};
    vi.doMock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu({}, () => ({ code: "42P01", message: "relation does not exist" })) }));
    vi.resetModules();
    const { GET: G2 } = await import("../../app/api/sigap/vanguard/sertifikasi/admin/route");
    const r = await G2(new NextRequest("http://uji.local/api/sigap/vanguard/sertifikasi/admin", { headers: { "x-akun": "1" } }));
    expect(r.status).toBe(503);
  });
});
