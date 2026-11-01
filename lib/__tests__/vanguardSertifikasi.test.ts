import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";
import { cacahKesalahan, hitungUjian, poinButir, tingkatDari, JUMLAH_BUTIR_UJIAN } from "../vanguard/sertifikasi/skor";
import { JEDA_ULANG_HARI, hariWibNomor, statusUjian, type RiwayatUjian } from "../vanguard/sertifikasi/jeda";
import { susunUjian } from "../vanguard/sertifikasi/ujian";
import { KOLAM, nilaiButir, sajikanButir } from "../vanguard/sertifikasi/nilai";
import { soalK } from "../vanguard/kuesioner/nilaiK";
import { kasusDariBenih } from "../vanguard/kasus/acak";
import { idSelKasus } from "../vanguard/sel";

let tabel: Tabel = {};
let gagalTabel = false;
let hook: (n: string) => { code?: string; message: string } | null = () => null;
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel, (n: string) => (gagalTabel ? { code: "42P01", message: "relation does not exist" } : hook(n))) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: (h: Headers) => (h.get("x-aktor") ? Number(h.get("x-aktor")) : null),
}));
const { GET, POST } = await import("../../app/api/sigap/vanguard/sertifikasi/route");

describe("skor dan tingkat", () => {
  it("poin butir: 100 dikurangi bobot (fatal 40, berat 20, ringan 8), minimal 0", () => {
    expect(poinButir({ fatal: 0, berat: 0, ringan: 0 })).toBe(100);
    expect(poinButir({ fatal: 1, berat: 1, ringan: 1 })).toBe(32);
    expect(poinButir({ fatal: 3, berat: 0, ringan: 0 })).toBe(0);
    expect(cacahKesalahan([{ tingkat: "fatal" }, { tingkat: "berat" }, { tingkat: "berat" }])).toEqual({ fatal: 1, berat: 2, ringan: 0 });
  });
  it("tingkat 1–5 menurut skor dan butir berkesalahan fatal", () => {
    expect(tingkatDari(95, 0)).toBe(5); expect(tingkatDari(95, 1)).toBe(5); expect(tingkatDari(95, 2)).toBe(4); // skor tinggi tak menutupi fatal berulang
    expect(tingkatDari(85, 3)).toBe(4); expect(tingkatDari(85, 4)).toBe(3);
    expect(tingkatDari(65, 9)).toBe(3); expect(tingkatDari(64.99, 0)).toBe(2); expect(tingkatDari(45, 0)).toBe(2); expect(tingkatDari(44, 0)).toBe(1);
  });
  it("skor ujian = rata-rata; butir tak terjawab = 0; nama tingkat", () => {
    const sempurna = Array.from({ length: 15 }, () => ({ poin: 100, fatal: 0 }));
    expect(hitungUjian(sempurna)).toEqual({ skor: 100, butirFatal: 0, tingkat: 5, nama: "Expert" });
    const setengah = hitungUjian(sempurna.slice(0, 7), 15);
    expect(setengah.skor).toBe(46.67); expect(setengah.nama).toBe("Dasar");
    expect(hitungUjian(Array.from({ length: 15 }, () => ({ poin: 0, fatal: 2 })))).toMatchObject({ skor: 0, tingkat: 1, nama: "Pemula" });
  });
});

describe("aturan jeda", () => {
  const r = (jenis: "sertifikasi" | "latihan", mulai: string, selesai: string | null, id = 1): RiwayatUjian => ({ id, jenis, mulai_at: mulai, selesai_at: selesai });
  it("hari berganti 00.00 WIB", () => {
    expect(hariWibNomor("2026-11-01T16:59:00Z")).toBe(hariWibNomor("2026-11-01T00:00:00Z"));
    expect(hariWibNomor("2026-11-01T17:00:00Z")).toBe(hariWibNomor("2026-11-01T00:00:00Z") + 1);
  });
  it("belum pernah selesai: 1 sertifikasi per hari (dihitung dari saat mulai); besok boleh lagi", () => {
    const sekarang = new Date("2026-11-01T08:00:00Z");
    expect(statusUjian([], sekarang)).toMatchObject({ sertifikasiBoleh: true, sudahBersertifikat: false });
    const s = statusUjian([r("sertifikasi", "2026-11-01T01:00:00Z", null)], sekarang);
    expect(s.sertifikasiBoleh).toBe(false); expect(s.alasan).toMatch(/satu kali per hari/); expect(s.bukaLagi).toBe("2026-11-01T17:00:00.000Z");
    expect(statusUjian([r("sertifikasi", "2026-11-01T01:00:00Z", null)], new Date("2026-11-01T17:30:00Z")).sertifikasiBoleh).toBe(true);
    expect(statusUjian([r("latihan", "2026-11-01T01:00:00Z", "2026-11-01T02:00:00Z")], sekarang).sertifikasiBoleh).toBe(true); // latihan tidak menghabiskan jatah
  });
  it(`sesudah selesai: hanya latihan selama ${JEDA_ULANG_HARI} hari, lalu sertifikasi terbuka`, () => {
    const riw = [r("sertifikasi", "2026-11-01T01:00:00Z", "2026-11-01T02:00:00Z")]; // hari ke-0 = 1 Nov WIB
    const s1 = statusUjian(riw, new Date("2026-11-05T10:00:00Z"));
    expect(s1.sertifikasiBoleh).toBe(false); expect(s1.sudahBersertifikat).toBe(true); expect(s1.alasan).toMatch(/berlatih/);
    expect(s1.bukaLagi).toBe("2026-11-05T17:00:00.000Z"); // 6 Nov 00.00 WIB
    expect(statusUjian(riw, new Date("2026-11-05T17:00:01Z")).sertifikasiBoleh).toBe(true);
  });
  it("ujian dibatalkan (tingkat null) tidak dihitung selesai, tetapi tetap menghabiskan jatah hari itu", () => {
    const riw: RiwayatUjian[] = [{ id: 1, jenis: "sertifikasi", mulai_at: "2026-11-01T01:00:00Z", selesai_at: "2026-11-01T01:30:00Z", tingkat: null }];
    const s = statusUjian(riw, new Date("2026-11-01T08:00:00Z"));
    expect(s.sudahBersertifikat).toBe(false); expect(s.sertifikasiBoleh).toBe(false); expect(s.berjalan).toBeNull();
    expect(statusUjian(riw, new Date("2026-11-01T17:30:00Z")).sertifikasiBoleh).toBe(true); // besok boleh lagi
  });
  it("satu ujian berjalan pada satu waktu; kedaluwarsa setelah 12 jam", () => {
    const riw = [r("latihan", "2026-11-01T01:00:00Z", null, 7)];
    expect(statusUjian(riw, new Date("2026-11-01T05:00:00Z")).berjalan?.id).toBe(7);
    expect(statusUjian(riw, new Date("2026-11-01T14:00:00Z")).berjalan).toBeNull();
  });
});

describe("pengundi ujian", () => {
  it("deterministik, tanpa pengulangan, berimbang antar area, dan tiap butir berbenih sendiri", () => {
    const a = susunUjian(42, KOLAM, JUMLAH_BUTIR_UJIAN), b = susunUjian(42, KOLAM, JUMLAH_BUTIR_UJIAN);
    expect(a).toEqual(b);
    expect(susunUjian(43, KOLAM, JUMLAH_BUTIR_UJIAN).map((x) => x.kode)).not.toEqual(a.map((x) => x.kode));
    expect(new Set(a.map((x) => x.kode)).size).toBe(a.length);
    expect(a.map((x) => x.urut)).toEqual(a.map((_, i) => i + 1));
    expect(new Set(a.map((x) => x.benih)).size).toBe(a.length);
    expect(a.length).toBe(Math.min(JUMLAH_BUTIR_UJIAN, KOLAM.length));
  });
  it("berimbang: kolam buatan 3 area, ambil 6 = 2 per area", () => {
    const kolam = ["a", "b", "c"].flatMap((ar) => Array.from({ length: 5 }, (_, i) => ({ kode: `${ar.toUpperCase()}0${i}`, jenis: "v1" as const, area: ar })));
    for (let s = 1; s <= 20; s++) {
      const d = susunUjian(s, kolam, 6);
      const per = new Map<string, number>(); for (const x of d) per.set(x.kode[0], (per.get(x.kode[0]) ?? 0) + 1);
      expect([...per.values()].sort()).toEqual([2, 2, 2]);
    }
  });
  it("kolam memuat K01, K02, A01–A13 dan B01–B10", () => {
    expect(KOLAM.map((x) => x.kode).sort()).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13", "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09", "B10", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13", "D14", "D15", "D16", "D17", "D19", "D20", "D21", "D22", "E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08", "E09", "E10", "E11", "E12", "E13", "E14", "E15", "E16", "E17", "E18", "E19", "E20", "E21", "K01", "K02"]);
  });
});

describe("penyajian dan penilaian butir (server)", () => {
  it("sajikanButir tidak memuat kunci, jebakan, petunjuk, langkah, pembahasan", () => {
    for (const x of KOLAM) {
      const s = sajikanButir(x.kode, 777)!;
      const mentah = JSON.stringify(s);
      for (const f of ['"kunci"', '"jebakan"', '"petunjuk"', '"langkah"', '"pembahasan"', '"alternatif"', '"rujukan"']) expect(mentah, `${x.kode} ${f}`).not.toContain(f);
    }
    expect(sajikanButir("Z99", 1)).toBeNull();
  });
  it("kunci menilai dirinya 100; isian kosong untuk butir berkunci kurang dari 100; butir 'nol' (A10) kosong = benar", () => {
    for (const x of KOLAM) {
      const kunci = x.jenis === "k" ? soalK(x.kode, 555)!.kunci : kasusDariBenih(x.kode, 555)!.kunci;
      const h = nilaiButir(x.kode, 555, kunci);
      expect("galat" in h ? h.galat : h.poin, x.kode).toBe(100);
    }
    const k = nilaiButir("A01", 9, {}) as { poin: number; benar: boolean };
    expect(k.benar).toBe(false); expect(k.poin).toBeLessThan(100);
    expect((nilaiButir("A10", 9, {}) as { benar: boolean }).benar).toBe(true);
  });
  it("isian tidak sah ditolak", () => {
    expect("galat" in (nilaiButir("A01", 9, "x") as object)).toBe(true);
    expect("galat" in (nilaiButir("A01", 9, { kotak_ngawur: 5 }) as object)).toBe(true);
    expect("galat" in (nilaiButir("K01", 9, [{ r: 9999 }]) as object)).toBe(true);
    expect("galat" in (nilaiButir("Z99", 9, {}) as object)).toBe(true);
  });
});

const kepala = (akun = "77") => ({ "x-akun": akun, "content-type": "application/json" });
const post = (badan: Record<string, unknown>, h: Record<string, string> = kepala()) => POST(new NextRequest("http://uji.local/api/sigap/vanguard/sertifikasi", { method: "POST", headers: h, body: JSON.stringify(badan) }));
const ambil = (qs = "", h: Record<string, string> = kepala()) => GET(new NextRequest(`http://uji.local/api/sigap/vanguard/sertifikasi${qs}`, { headers: h }));
const kosong = (row: Record<string, unknown>) => (row.jenis === "k" ? [] : {});
describe("rincian koreksi memuat jawaban Anda vs seharusnya (V8b)", () => {
  it("kotak yang salah membawa nilai isian petugas dan nilai kunci; kotak kosong = 0", () => {
    const kunci = kasusDariBenih("A01", 12)!.kunci as Record<string, number>;
    const sel = Object.keys(kunci).find((k) => kunci[k] > 0)!;
    const kosong = nilaiButir("A01", 12, {}) as { rincian: { sel: string | null; anda?: number | null; seharusnya?: number | null }[] };
    const r0 = kosong.rincian.find((r) => r.sel === sel)!;
    expect(r0.anda).toBe(0);
    expect(r0.seharusnya).toBe(kunci[sel]);
    const salah = nilaiButir("A01", 12, { [sel]: kunci[sel] * 3 }) as { rincian: { sel: string | null; anda?: number | null; seharusnya?: number | null }[] };
    const r1 = salah.rincian.find((r) => r.sel === sel)!;
    expect(r1.anda).toBe(kunci[sel] * 3);
    expect(r1.seharusnya).toBe(kunci[sel]);
  });
});

const kunciDari = (kasus: string, jenis: string, benih: number) => (jenis === "k" ? soalK(kasus, benih)!.kunci : kasusDariBenih(kasus, benih)!.kunci);

beforeEach(() => { hook = () => null; process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uji.local"; tabel = {}; });

describe("rute sertifikasi", () => {
  it("401 tanpa sesi; mode lihat (masuk sebagai) tidak boleh menulis", async () => {
    expect((await ambil("", {})).status).toBe(401);
    expect((await post({ aksi: "mulai", jenis: "sertifikasi" }, { "x-akun": "77", "x-aktor": "1", "content-type": "application/json" })).status).toBe(403);
    expect((await post({ aksi: "mulai", jenis: "ngawur" })).status).toBe(400);
  });
  it("alur penuh: mulai, jawab semua benar, selesai = 100 / Expert / tersimpan; kunci tidak pernah dikirim", async () => {
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    expect(m.jumlah).toBe(15);
    const daftar = await (await ambil(`?ujian=${m.ujian}`)).json();
    expect(daftar.butir).toHaveLength(15);
    expect(JSON.stringify(daftar)).not.toMatch(/kunci|benih/);
    expect(daftar.butir.every((x: { terjawab: boolean; poin?: number }) => x.terjawab === false && x.poin === undefined)).toBe(true);
    const baris = tabel.sigap_vanguard_ujian_butir;
    expect(baris).toHaveLength(15);
    let akhir: { semuaTerjawab: boolean } | null = null;
    for (const row of baris) {
      const soal = await (await ambil(`?ujian=${m.ujian}&butir=${row.urut}`)).json();
      expect(JSON.stringify(soal)).not.toMatch(/"kunci"|"jebakan"|"pembahasan"/);
      const jwb = await (await post({ aksi: "jawab", ujian: m.ujian, urut: row.urut, isian: kunciDari(row.kasus, row.jenis, row.benih), durasiDtk: 30 })).json();
      expect(jwb).toMatchObject({ benar: true, poin: 100 });
      expect(jwb.rincian).toBeUndefined(); // sertifikasi: tidak ada rincian selama ujian
      akhir = jwb;
    }
    expect(akhir!.semuaTerjawab).toBe(true);
    const sel = await (await post({ aksi: "selesai", ujian: m.ujian })).json();
    expect(sel.hasil).toEqual({ skor: 100, butirFatal: 0, tingkat: 5, nama: "Expert" });
    expect(sel.review).toHaveLength(15);
    expect(tabel.sigap_vanguard_ujian[0]).toMatchObject({ skor: 100, tingkat: 5, butir_fatal: 0 });
    const ring = await (await ambil()).json();
    expect(ring.sertifikat.terbaru).toMatchObject({ tingkat: 5, skor: 100 });
    expect(ring.status.sertifikasiBoleh).toBe(false); expect(ring.status.sudahBersertifikat).toBe(true);
    expect((await post({ aksi: "mulai", jenis: "sertifikasi" })).status).toBe(403); // jeda 5 hari
    const lat = await (await post({ aksi: "mulai", jenis: "latihan" })).json(); expect(lat.jumlah).toBe(15); // latihan boleh
  });
  it("jawab dua kali = 409; ujian orang lain = 404; selesai sebelum semua dijawab = 400 kecuali menyerah", async () => {
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    const row = tabel.sigap_vanguard_ujian_butir[0];
    expect((await post({ aksi: "jawab", ujian: m.ujian, urut: row.urut, isian: kosong(row) })).status).toBe(200);
    expect((await post({ aksi: "jawab", ujian: m.ujian, urut: row.urut, isian: kosong(row) })).status).toBe(409);
    expect((await post({ aksi: "jawab", ujian: m.ujian, urut: 1, isian: kosong(row) }, kepala("99"))).status).toBe(404);
    expect((await ambil(`?ujian=${m.ujian}`, kepala("99"))).status).toBe(404);
    const s = await post({ aksi: "selesai", ujian: m.ujian }); expect(s.status).toBe(400); expect((await s.json()).belum).toBe(14);
    const t = await (await post({ aksi: "selesai", ujian: m.ujian, menyerah: true })).json();
    expect(t.hasil.skor).toBeLessThan(10); expect(t.hasil.tingkat).toBe(1);
    expect((await post({ aksi: "selesai", ujian: m.ujian })).status).toBe(409);
  });
  it("sertifikasi: sehari sekali sebelum pernah selesai; ujian berjalan dilanjutkan, bukan dibuat ganda", async () => {
    const m1 = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    const m2 = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    expect(m2).toMatchObject({ ujian: m1.ujian, dilanjutkan: true });
    expect(tabel.sigap_vanguard_ujian).toHaveLength(1);
    await post({ aksi: "selesai", ujian: m1.ujian, menyerah: true });
    const m3 = await post({ aksi: "mulai", jenis: "sertifikasi" });
    expect(m3.status).toBe(403); // sudah selesai (skor rendah tetap dihitung selesai): jeda 5 hari
  });
  it("latihan menampilkan rincian kesalahan langsung; rincian sertifikasi baru terbuka setelah selesai", async () => {
    const lat = await (await post({ aksi: "mulai", jenis: "latihan" })).json();
    const j = await (await post({ aksi: "jawab", ujian: lat.ujian, urut: tabel.sigap_vanguard_ujian_butir[0].urut, isian: kosong(tabel.sigap_vanguard_ujian_butir[0]) })).json();
    if (!j.benar) expect(Array.isArray(j.rincian)).toBe(true);
  });
  it("penjelasan (langkah, pembahasan, rujukan) ikut pada jawaban salah di latihan dan pada review butir salah; tidak ada pada jawaban sertifikasi sebelum selesai", async () => {
    const lat = await (await post({ aksi: "mulai", jenis: "latihan" })).json();
    const row = tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === lat.ujian).find((x) => { const k = kunciDari(x.kasus, x.jenis, x.benih) as unknown; return Array.isArray(k) ? k.length > 0 : Object.keys(k as object).length > 0; })!;
    const j = await (await post({ aksi: "jawab", ujian: lat.ujian, urut: row.urut, isian: kosong(row) })).json();
    expect(j.benar).toBe(false);
    expect(typeof j.penjelasan.pembahasan).toBe("string");
    expect(Array.isArray(j.penjelasan.langkah)).toBe(true);
    expect(j.penjelasan.pembahasan.length).toBeGreaterThan(0);
    expect([...j.penjelasan.langkah, j.penjelasan.pembahasan, j.penjelasan.rujukan].join(" ")).not.toMatch(/[{}]/); // penampung templat sudah terisi
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    const rs = tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === m.ujian).find((x) => { const k = kunciDari(x.kasus, x.jenis, x.benih) as unknown; return Array.isArray(k) ? k.length > 0 : Object.keys(k as object).length > 0; })!;
    const js = await (await post({ aksi: "jawab", ujian: m.ujian, urut: rs.urut, isian: kosong(rs) })).json();
    expect(js.penjelasan).toBeUndefined();
    const sel = await (await post({ aksi: "selesai", ujian: m.ujian, menyerah: true })).json();
    expect(sel.review.find((x: { urut: number }) => x.urut === rs.urut).penjelasan.pembahasan.length).toBeGreaterThan(0);
  });
  it("review setelah selesai memuat pesan koreksi; sebelum selesai tidak", async () => {
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    const row = tabel.sigap_vanguard_ujian_butir.find((x) => { const k = kunciDari(x.kasus, x.jenis, x.benih) as unknown; return Array.isArray(k) ? k.length > 0 : Object.keys(k as object).length > 0; })!; // butir yang isian kosongnya pasti salah
    await post({ aksi: "jawab", ujian: m.ujian, urut: row.urut, isian: kosong(row) });
    const sebelum = await (await ambil(`?ujian=${m.ujian}`)).json();
    expect(sebelum.butir.find((x: { urut: number }) => x.urut === row.urut).rincian).toBeUndefined();
    const sel = await (await post({ aksi: "selesai", ujian: m.ujian, menyerah: true })).json();
    expect(sel.review.find((x: { urut: number }) => x.urut === row.urut).rincian.length).toBeGreaterThan(0);
    const sesudah = await (await ambil(`?ujian=${m.ujian}`)).json();
    expect(sesudah.butir.find((x: { urut: number }) => x.urut === row.urut).rincian.length).toBeGreaterThan(0);
  });
  it("selesai menilai ULANG butir yang sudah dijawab dengan penilai terbaru (poin lama yang tersimpan tidak dipakai) (V8d)", async () => {
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    let pilih: (typeof tabel.sigap_vanguard_ujian_butir)[number] | undefined; let isian: Record<string, number> = {};
    for (const row of tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === m.ujian && x.jenis === "v1")) {
      const k = kasusDariBenih(row.kasus, row.benih)!; const kunci = k.kunci as Record<string, number>; const ids = idSelKasus(k);
      const terisi = ids.filter((i) => kunci[i]), kosongId = ids.filter((i) => !kunci[i]);
      if (terisi.length >= 1 && kosongId.length >= 1) { pilih = row; isian = { ...Object.fromEntries(terisi.slice(1).map((i) => [i, kunci[i]])), [kosongId[0]]: kunci[terisi[0]] }; break; }
    }
    expect(pilih).toBeTruthy();
    await post({ aksi: "jawab", ujian: m.ujian, urut: pilih!.urut, isian });
    expect(pilih!.poin).toBe(60); // satu salah letak = satu kesalahan fatal
    pilih!.poin = 20; pilih!.jml_fatal = 2; // keadaan lama: dihukum dua kali
    const sel = await (await post({ aksi: "selesai", ujian: m.ujian, menyerah: true })).json();
    expect(sel.review.find((x: { urut: number }) => x.urut === pilih!.urut).poin).toBe(60);
    expect(pilih!.jml_fatal).toBe(1);
  });
  it("tabel belum dibuat (SQL belum dijalankan) = 503 dengan pesan jelas, bukan 500", async () => {
    const { buatDbPalsu: _b } = await import("./vanguardFakeDb");
    void _b;
    gagalTabel = true;
    const r = await ambil(); expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/20261101z/);
    const m = await post({ aksi: "mulai", jenis: "latihan" }); expect(m.status).toBe(503);
    gagalTabel = false;
  });
  it("batal: melepas ujian berjalan tanpa skor; tidak menjadi sertifikat; tidak bisa dibatalkan dua kali; orang lain 404", async () => {
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    expect((await post({ aksi: "batal", ujian: m.ujian }, kepala("99"))).status).toBe(404);
    expect(await (await post({ aksi: "batal", ujian: m.ujian })).json()).toEqual({ dibatalkan: true });
    expect(tabel.sigap_vanguard_ujian[0]).toMatchObject({ skor: null, tingkat: null });
    expect((await post({ aksi: "batal", ujian: m.ujian })).status).toBe(409);
    const ring = await (await ambil()).json();
    expect(ring.berjalan).toBeNull(); expect(ring.status.sudahBersertifikat).toBe(false); expect(ring.sertifikat.tertinggi).toBeNull();
    expect(ring.status.sertifikasiBoleh).toBe(false); // jatah hari ini terpakai
    expect((await post({ aksi: "mulai", jenis: "latihan" })).status).toBe(200); // latihan tetap boleh
  });
});

describe("pembinaan berkelanjutan (V8)", () => {
  const kunciButir = (row: Record<string, unknown>) => kunciDari(row.kasus as string, row.jenis as string, row.benih as number);
  async function selesaikan(ujian: number) {
    for (const row of tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === ujian)) await post({ aksi: "jawab", ujian, urut: row.urut, isian: kunciButir(row) });
    return (await post({ aksi: "selesai", ujian })).json();
  }
  it("latihan harian: 3 butir, soal hari itu tetap bagi akun yang sama (juga setelah dibatalkan), beda antar akun", async () => {
    const a = await (await post({ aksi: "mulai", jenis: "harian" })).json();
    expect(a.jumlah).toBe(3);
    const set1 = tabel.sigap_vanguard_ujian_butir.map((x) => `${x.kasus}:${x.benih}`);
    await post({ aksi: "batal", ujian: a.ujian });
    const b = await (await post({ aksi: "mulai", jenis: "harian" })).json();
    expect(b.ujian).not.toBe(a.ujian);
    expect(tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === b.ujian).map((x) => `${x.kasus}:${x.benih}`)).toEqual(set1);
    await post({ aksi: "batal", ujian: b.ujian });
    const c = await (await post({ aksi: "mulai", jenis: "harian" }, kepala("88"))).json();
    expect(tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === c.ujian).map((x) => `${x.kasus}:${x.benih}`)).not.toEqual(set1);
  });
  it("latihan harian selesai: rincian langsung tampil, streak 1, tidak bisa dua kali, tidak menjadi sertifikat dan tidak menghabiskan jatah sertifikasi", async () => {
    const a = await (await post({ aksi: "mulai", jenis: "harian" })).json();
    const row = tabel.sigap_vanguard_ujian_butir.find((x) => x.ujian_id === a.ujian)!;
    const j = await (await post({ aksi: "jawab", ujian: a.ujian, urut: row.urut, isian: kosong(row) })).json();
    if (!j.benar) expect(Array.isArray(j.rincian)).toBe(true);
    for (const x of tabel.sigap_vanguard_ujian_butir.filter((y) => y.ujian_id === a.ujian && y.urut !== row.urut)) await post({ aksi: "jawab", ujian: a.ujian, urut: x.urut, isian: kunciButir(x) });
    await post({ aksi: "selesai", ujian: a.ujian, menyerah: true });
    const ring = await (await ambil()).json();
    expect(ring.harian).toMatchObject({ sekarang: 1, terpanjang: 1, selesaiHariIni: true });
    expect(ring.status.sudahBersertifikat).toBe(false); expect(ring.status.sertifikasiBoleh).toBe(true); expect(ring.sertifikat.tertinggi).toBeNull();
    const lagi = await post({ aksi: "mulai", jenis: "harian" }); expect(lagi.status).toBe(409);
  });
  it("tantangan mingguan: 5 butir yang SAMA untuk semua petugas, disimpan sekali, satu kali per minggu", async () => {
    const a = await (await post({ aksi: "mulai", jenis: "tantangan" })).json();
    expect(a.jumlah).toBe(5);
    const set = (u: number) => tabel.sigap_vanguard_ujian_butir.filter((x) => x.ujian_id === u).map((x) => `${x.urut}:${x.kasus}:${x.benih}`);
    const b = await (await post({ aksi: "mulai", jenis: "tantangan" }, kepala("99"))).json();
    expect(set(b.ujian)).toEqual(set(a.ujian));
    expect(tabel.sigap_vanguard_tantangan).toHaveLength(1);
    const hasil = await selesaikan(a.ujian);
    expect(hasil.hasil.skor).toBe(100);
    expect((await post({ aksi: "mulai", jenis: "tantangan" })).status).toBe(409);
    expect((await (await ambil()).json()).tantangan.selesai).toBe(true);
  });
  it("kesegaran sertifikat: segar sesaat setelah sertifikasi selesai", async () => {
    const m = await (await post({ aksi: "mulai", jenis: "sertifikasi" })).json();
    await selesaikan(m.ujian);
    const ring = await (await ambil()).json();
    expect(ring.kesegaran).toMatchObject({ status: "segar", umurHari: 0 });
  });
  it("SQL pembinaan belum dijalankan (CHECK jenis menolak 'harian') = 503 dengan pesan jelas", async () => {
    hook = (n) => (n === "sigap_vanguard_ujian:insert" ? { code: "23514", message: "violates check constraint" } : null);
    const r = await post({ aksi: "mulai", jenis: "harian" }); expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/SQL/);
  });
});
