import { describe, expect, it } from "vitest";
import { bacaSesiLuring, buatSesiLuring, muatanKirim, pilihJawaban, selesaikan, simpanSesiLuring, sisaMs, tandaiTerkirim } from "../sesiLuring";
import { bersihkanSaatKeluar } from "../luringSimpan";
import type { PaketTes } from "../sigapTesLuring";

function penyimpan() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const paket = { v: 1, tes_id: 3, kegiatan_id: 5, jenis: "pretest", judul: "Pretest", durasi_menit: 30, buka_at: "", tutup_at: "", dimulai_instruktur: true, jumlah_soal: 2, versi: "v1", diunduh_at: "", tersandi: { v: 1, garam: "", iv: "", iterasi: 1, data: "" } } as PaketTes;
const isi = { tes_id: 3, versi: "v1", soal: [{ nomor: 1, teks: "a", opsi: [{ kode: "A", teks: "x" }] }] };

describe("sesi tes tanpa sinyal", () => {
  it("ketuk, batalkan, jejak tercatat, waktu habis dipotong ke batas", () => {
    let s = buatSesiLuring(paket, isi, 1000, "P", 0, false);
    s = pilihJawaban(s, 1, "A", 10);
    s = pilihJawaban(s, 1, "A", 20);
    expect(s.jawaban).toEqual({});
    expect(s.jejak.map((j) => j.k)).toEqual(["A", ""]);
    s = pilihJawaban(s, 1, "A", 30);
    expect(sisaMs(s, 60_000)).toBe(30 * 60_000 - 60_000);
    s = selesaikan(s, 99 * 60_000);
    expect(s.selesai_hp_ms).toBe(30 * 60_000);
    expect(pilihJawaban(s, 1, "A", 40)).toBe(s); // terkunci sesudah selesai
    const m = muatanKirim(s, 31 * 60_000);
    expect(m.selisih_ms).toBe(1000);
    expect(m.jawaban).toEqual({ "1": "A" });
  });
  it("belum terkirim tahan keluar akun; sesudah terkirim ikut dibuang", () => {
    const p = penyimpan();
    const s = buatSesiLuring(paket, isi, 0, "P", 0, false);
    simpanSesiLuring(p, s);
    expect(bersihkanSaatKeluar(p)).toBe(0);
    expect(bacaSesiLuring(p, "pretest", "P")).not.toBeNull();
    expect(bacaSesiLuring(p, "pretest", "Q")).toBeNull();
    simpanSesiLuring(p, tandaiTerkirim(s, "2026-11-20T00:00:00Z"));
    expect(bersihkanSaatKeluar(p)).toBe(1);
  });
});

import { bolehMulaiLuring, type RingkasTes } from "../sesiLuring";
describe("boleh mulai tanpa sinyal", () => {
  const r = (x: Partial<RingkasTes>): RingkasTes => ({ v: 1, pemilik: "P", status: "buka", percobaan: 0, wajib_100: true, tuntas: false, bisa_ulang: false, disimpan_at: "2026-11-20T01:00:00Z", ...x });
  it("pertama, ulang wajib 100, dan yang ditolak", () => {
    expect(bolehMulaiLuring(null, null)).toEqual({ boleh: true, ulang: false });
    expect(bolehMulaiLuring(r({ status: "selesai", bisa_ulang: true }), null)).toEqual({ boleh: true, ulang: true });
    expect(bolehMulaiLuring(r({ status: "selesai", tuntas: true }), null).boleh).toBe(false);
    const s = buatSesiLuring(paket, isi, 0, "P", 0, false);
    expect(bolehMulaiLuring(null, s).boleh).toBe(false); // kotor
    expect(bolehMulaiLuring(r({ status: "selesai", bisa_ulang: true }), tandaiTerkirim(s, "2026-11-20T02:00:00Z")).boleh).toBe(false); // nilai belum diketahui
  });
});
