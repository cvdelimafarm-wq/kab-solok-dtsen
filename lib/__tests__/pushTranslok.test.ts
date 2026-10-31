import { describe, expect, it } from "vitest";
import type { Kekurangan } from "../sigapKekurangan";
import type { RingkasHariIni } from "../sigapKegiatan";
import { BAWAAN_TRANSLOK } from "../pushPengaturan";
import { ambangFoto, kunciKirimTranslok, putusanTranslok } from "../pushTranslok";

const NOW = Date.parse("2026-11-03T10:00:00+07:00"); // Selasa
const H = (o: Partial<RingkasHariIni> = {}): RingkasHariIni => ({
  tanggal: "2026-11-03", adaJadwal: true, hariKerjaBerikut: null, peran: "ppl", fotoTotal: 5, slot: [], wajibLaporan: true, laporanSudah: false, hasilLembar: null,
  sumber: null, mulai: "2026-11-02", targetSelesai: null, hrefKerja: "/sigap/translok/x?p=1", hrefLembar: null, ...o,
});
const K = (jenis: Kekurangan["jenis"], skor: number, tanggal = "2026-11-03"): Kekurangan =>
  ({ kode: `${jenis}:1:${tanggal}`, jenis, tanggal, skor, nada: "emas", label: "TUGAS HARI INI", judul: `J ${jenis}`, ringkas: "r", uraian: "u", batas: null, aksi: "Buka", href: "/x" }) as Kekurangan;

describe("putusanTranslok", () => {
  const s = BAWAAN_TRANSLOK;
  it("bukan hari Translok (libur) -> tidak pernah diingatkan, tahap berapa pun", () => {
    for (const t of [1, 2, 3] as const) expect(putusanTranslok({ tahap: t, setelan: s, hariIni: H({ adaJadwal: false }), kekurangan: [K("foto", 90)], nowMs: NOW })).toEqual({ kirim: false, alasan: "bukan_hari_translok" });
  });
  it("tanpa ringkasan hari ini atau tanggal berbeda -> lewat", () => {
    expect(putusanTranslok({ tahap: 1, setelan: s, hariIni: undefined, kekurangan: [K("foto", 90)], nowMs: NOW }).kirim).toBe(false);
    expect(putusanTranslok({ tahap: 1, setelan: s, hariIni: H({ tanggal: "2026-11-02" }), kekurangan: [K("foto", 90)], nowMs: NOW }).kirim).toBe(false);
  });
  it("tahap 1 (10.00): sudah 1 foto -> tidak perlu; belum ada foto -> kirim", () => {
    expect(putusanTranslok({ tahap: 1, setelan: s, hariIni: H({ slot: [1] }), kekurangan: [K("foto", 90)], nowMs: NOW })).toEqual({ kirim: false, alasan: "foto_cukup" });
    expect(putusanTranslok({ tahap: 1, setelan: s, hariIni: H(), kekurangan: [K("foto", 90)], nowMs: NOW }).kirim).toBe(true);
  });
  it("tahap 2 (17.00): 3 foto -> kirim; 4 foto -> tidak perlu", () => {
    expect(putusanTranslok({ tahap: 2, setelan: s, hariIni: H({ slot: [1, 2, 3] }), kekurangan: [K("foto", 90)], nowMs: NOW }).kirim).toBe(true);
    expect(putusanTranslok({ tahap: 2, setelan: s, hariIni: H({ slot: [1, 2, 3, 4] }), kekurangan: [K("foto", 90)], nowMs: NOW })).toEqual({ kirim: false, alasan: "foto_cukup" });
  });
  it("tahap 3 (22.00): dikirim selama belum lengkap, berapa pun fotonya; lengkap -> tidak", () => {
    expect(putusanTranslok({ tahap: 3, setelan: s, hariIni: H({ slot: [1, 2, 3, 4] }), kekurangan: [K("foto", 90)], nowMs: NOW }).kirim).toBe(true);
    expect(putusanTranslok({ tahap: 3, setelan: s, hariIni: H({ slot: [1, 2, 3, 4, 5], laporanSudah: true }), kekurangan: [], nowMs: NOW })).toEqual({ kirim: false, alasan: "lengkap" });
  });
  it("memilih kekurangan skor tertinggi hari ini; abaikan jenis lain dan hari lain", () => {
    const r = putusanTranslok({ tahap: 3, setelan: s, hariIni: H(), kekurangan: [K("foto", 80), K("laporan", 95), K("hari_terlewat", 99), K("foto", 99, "2026-11-02")], nowMs: NOW });
    expect(r.kirim && r.kekurangan.jenis).toBe("laporan");
  });
  it("supervisor di hari genap periode tidak diperiksa", () => {
    // mulai 2026-11-02 -> hari ke-2 (3 Nov) = genap -> tidak wajib
    expect(putusanTranslok({ tahap: 1, setelan: s, hariIni: H({ peran: "supervisor" }), kekurangan: [K("foto", 90)], nowMs: NOW })).toEqual({ kirim: false, alasan: "bukan_giliran" });
  });
});

describe("ambangFoto / kunci", () => {
  it("dibatasi jumlah foto kegiatan (3 foto: syarat 4 menjadi 3)", () => {
    expect(ambangFoto(BAWAAN_TRANSLOK, 2, 3)).toBe(3);
    expect(ambangFoto(BAWAAN_TRANSLOK, 1, 5)).toBe(1);
    expect(ambangFoto(BAWAAN_TRANSLOK, 2, 5)).toBe(4);
  });
  it("kunci kirim", () => expect(kunciKirimTranslok(2, "2026-11-03", 1)).toBe("translok_2|2026-11-03|1"));
});
