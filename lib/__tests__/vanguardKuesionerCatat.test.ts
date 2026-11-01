import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { awalForm, normalisasi } from "../keu/identifikasi";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";
import { KASUS_K, soalK } from "../vanguard/kuesioner/nilaiK";
import { susunDasbor, type BarisKesalahanDb, type BarisPercobaanDb, type Peserta } from "../vanguard/dasbor";

let tabel: Tabel = {};
vi.mock("@/lib/supabaseServer", () => ({ createClient: () => buatDbPalsu(tabel) }));
vi.mock("@/lib/sigapAkses", () => ({
  sesiDariHeader: (h: Headers) => (h.get("x-akun") ? Number(h.get("x-akun")) : null),
  aktorDariHeader: (h: Headers) => (h.get("x-aktor") ? Number(h.get("x-aktor")) : null),
}));

const { POST } = await import("../../app/api/sigap/vanguard/kuesioner/route");
const { GET: GET_UTAMA } = await import("../../app/api/sigap/vanguard/route");
const K = KASUS_K[0];
const form = () => normalisasi({ instrumen: "FASIH", vanguard: { pendataan: true, pelatihan: false } });

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
beforeEach(mulai);

const kirim = (badan: Record<string, unknown>, h: Record<string, string> = { "x-akun": "77" }) =>
  POST(new NextRequest("http://uji.local/api/sigap/vanguard/kuesioner", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(badan) }));
const benar = () => K.kunci.map((e) => ({ ...e }));
const salah = () => benar().filter((e) => e.r !== 177);

describe("POST kuesioner: pencatatan percobaan kasus K (V6g)", () => {
  it("tanpa kegiatan: dinilai tetapi tidak dicatat", async () => {
    const j = await (await kirim({ kode: "K01", isian: salah() })).json();
    expect(j.benar).toBe(false); expect(j.dicatat).toBe(false);
    expect(tabel.sigap_vanguard_percobaan ?? []).toHaveLength(0);
  });
  it("dengan kegiatan dan peserta berhak: percobaan 1 salah + kesalahan; percobaan 2 benar = nomor 2 dan ★★ (1 petunjuk dikurangi)", async () => {
    const a = await (await kirim({ kode: "K01", isian: salah(), kegiatan: 5, petunjuk: 0, durasiDtk: 120 })).json();
    expect(a).toMatchObject({ dicatat: true, nomor: 1, benar: false });
    const p1 = tabel.sigap_vanguard_percobaan[0];
    expect(p1).toMatchObject({ kegiatan_id: 5, akun_id: 77, kasus: "K01", mode: "latihan", nomor: 1, benar: false, bintang: 0, jml_salah: 1, jml_fatal: 0, durasi_dtk: 120 });
    expect(Array.isArray(p1.isian.entri)).toBe(true);
    expect(tabel.sigap_vanguard_kesalahan).toHaveLength(1);
    expect(tabel.sigap_vanguard_kesalahan[0]).toMatchObject({ kasus: "K01", sel: "R177", jenis: "belum_diisi", tingkat: "berat", akun_id: 77, percobaan_id: p1.id });
    const b = await (await kirim({ kode: "K01", isian: benar(), kegiatan: 5, petunjuk: 1 })).json();
    expect(b).toMatchObject({ dicatat: true, nomor: 2, benar: true, bintang: 1 }); // 3 - 1 petunjuk - 1 percobaan ulang
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(2);
    expect(tabel.sigap_vanguard_kesalahan).toHaveLength(1);
  });
  it("skor dari klien tidak dipercaya: petunjuk dan durasi dipangkas, bintang dihitung server", async () => {
    const j = await (await kirim({ kode: "K01", isian: benar(), kegiatan: 5, petunjuk: 99, durasiDtk: 999999, bintang: 3 })).json();
    expect(j.bintang).toBe(1);
    expect(tabel.sigap_vanguard_percobaan[0]).toMatchObject({ petunjuk: 3, durasi_dtk: 86400 });
  });
  it("Lihat kunci menandai percobaan terakhir (bukan percobaan baru), bintang 0, dan kunci dikirim", async () => {
    await kirim({ kode: "K01", isian: salah(), kegiatan: 5 });
    const j = await (await kirim({ kode: "K01", isian: salah(), kegiatan: 5, lihat: true })).json();
    expect(j.kunci).toHaveLength(K.kunci.length);
    expect(j).toMatchObject({ dicatat: true, nomor: 1, bintang: 0 });
    expect(tabel.sigap_vanguard_percobaan).toHaveLength(1);
    expect(tabel.sigap_vanguard_percobaan[0]).toMatchObject({ lihat_jawaban: true, benar: false, bintang: 0 });
  });
  it("bukan peserta kegiatan, mode lihat (masuk sebagai), dan kegiatan tak sah: tidak dicatat (tidak sah = 400)", async () => {
    const a = await (await kirim({ kode: "K01", isian: benar(), kegiatan: 5 }, { "x-akun": "99" })).json();
    expect(a).toMatchObject({ benar: true, dicatat: false }); expect(a.pesanCatat).toBeTruthy();
    const b = await (await kirim({ kode: "K01", isian: benar(), kegiatan: 5 }, { "x-akun": "77", "x-aktor": "1" })).json();
    expect(b.dicatat).toBe(false); expect(b.pesanCatat).toMatch(/masuk sebagai/);
    expect((await kirim({ kode: "K01", isian: benar(), kegiatan: "5" })).status).toBe(400);
    expect((await kirim({ kode: "K01", isian: benar(), kegiatan: 0 })).status).toBe(400);
    expect(tabel.sigap_vanguard_percobaan ?? []).toHaveLength(0);
  });
});

describe("benih tersimpan pada rekaman (V7a)", () => {
  it("isian rekaman memuat benih; kunci dibangun dari benih itu", async () => {
    const s = soalK("K01", 777)!;
    const j = await (await kirim({ kode: "K01", benih: 777, isian: s.kunci, kegiatan: 5 })).json();
    expect(j).toMatchObject({ dicatat: true, benar: true });
    expect(tabel.sigap_vanguard_percobaan[0].isian.benih).toBe(777);
    expect(tabel.sigap_vanguard_percobaan[0].isian.entri).toHaveLength(s.kunci.length);
  });
});

describe("rekaman kasus K terpisah dari Mode Simulasi", () => {
  it("GET utama: riwayat dan lemah tidak memuat kasus K; riwayatK memuatnya", async () => {
    await kirim({ kode: "K01", isian: salah(), kegiatan: 5 });
    await kirim({ kode: "K01", isian: benar(), kegiatan: 5 });
    const r = await GET_UTAMA(new NextRequest("http://uji.local/api/sigap/vanguard?kegiatan=5", { headers: { "x-akun": "77" } }));
    const j = await r.json();
    expect(j.boleh).toBe(true);
    expect(j.riwayat).toEqual([]);
    expect(j.lemah).toEqual([]);
    expect(j.riwayatK).toEqual([{ kasus: "K01", percobaan: 2, benar: true, bintang: 2 }]);
    expect(j.lulus.benar ?? 0).toBe(0);
  });
  it("susunDasbor mengabaikan rekaman kasus K", () => {
    const P: Peserta[] = [{ akun_id: 77, nama: "Rina", peran: "ppl" }];
    const perc = (kasus: string, nomor: number, benar: boolean): BarisPercobaanDb => ({ akun_id: 77, kasus, nomor, benar, bintang: benar ? 3 : 0, jml_salah: benar ? 0 : 1, jml_fatal: 0, petunjuk: 0, lihat_jawaban: false, durasi_dtk: 60, dibuat_at: "2026-11-01T01:00:00Z" });
    const kes = (kasus: string): BarisKesalahanDb => ({ akun_id: 77, kasus, sel: "R177", jenis: "belum_diisi", tingkat: "berat" });
    const a = susunDasbor(P, [perc("A01", 1, true)], []);
    const b = susunDasbor(P, [perc("A01", 1, true), perc("K01", 1, false), perc("K01", 2, true)], [kes("K01")]);
    expect(b.ringkasan).toEqual(a.ringkasan);
    expect(b.petugas).toEqual(a.petugas);
  });
});
