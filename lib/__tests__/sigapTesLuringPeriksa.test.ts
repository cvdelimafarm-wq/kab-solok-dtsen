import { describe, expect, it } from "vitest";
import { bacaKirimLuring, periksaKirimLuring, type KirimLuring } from "../sigapTesLuringPeriksa";

const T = Date.parse("2026-11-20T02:00:00.000Z"); // jam server saat mulai
const tes = { buka_at: "2026-11-20T01:00:00.000Z", tutup_at: "2026-11-20T05:00:00.000Z", durasi_menit: 30 };
// jam HP 3 menit lebih lambat dari server -> selisih +180000
const dasar = (ubah: Partial<KirimLuring> = {}): KirimLuring => ({
  tes_id: 3, versi: "v", selisih_ms: 180_000,
  mulai_hp_ms: T - 180_000, selesai_hp_ms: T - 180_000 + 20 * 60_000, kirim_hp_ms: T - 180_000 + 21 * 60_000,
  jawaban: { "1": "A" }, jejak: [{ n: 1, k: "A", ms: T - 180_000 + 60_000 }], ...ubah,
});

describe("periksa jawaban tes tanpa sinyal", () => {
  it("wajar: diterima, jam diterjemahkan ke jam server", () => {
    const h = periksaKirimLuring(dasar(), tes, false, T + 21 * 60_000);
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.mulai.getTime()).toBe(T);
      expect(h.selesai.getTime()).toBe(T + 20 * 60_000);
      expect(h.catatan).toEqual([]);
    }
  });
  it("dikirim 23 jam kemudian masih diterima; 25 jam ditolak", () => {
    expect(periksaKirimLuring(dasar({ kirim_hp_ms: T - 180_000 + 23 * 3_600_000 }), tes, false, T + 23 * 3_600_000).ok).toBe(true);
    const h = periksaKirimLuring(dasar(), tes, false, T + 30 * 60_000 + 25 * 3_600_000);
    expect(h.ok).toBe(false);
  });
  it("mulai sesudah tutup / sebelum buka ditolak (sebelum buka boleh bila dimulai instruktur)", () => {
    const telat = dasar({ mulai_hp_ms: Date.parse(tes.tutup_at) + 10 * 60_000 - 180_000, selesai_hp_ms: Date.parse(tes.tutup_at) + 20 * 60_000 - 180_000 });
    expect(periksaKirimLuring(telat, tes, false, Date.parse(tes.tutup_at) + 30 * 60_000).ok).toBe(false);
    const awal = dasar({ mulai_hp_ms: Date.parse(tes.buka_at) - 30 * 60_000 - 180_000, selesai_hp_ms: Date.parse(tes.buka_at) - 10 * 60_000 - 180_000, kirim_hp_ms: Date.parse(tes.buka_at) - 9 * 60_000 - 180_000 });
    expect(periksaKirimLuring(awal, tes, false, Date.parse(tes.buka_at) - 9 * 60_000).ok).toBe(false);
    expect(periksaKirimLuring(awal, tes, true, Date.parse(tes.buka_at) - 9 * 60_000).ok).toBe(true);
  });
  it("lewat durasi dipotong + catatan; ketukan janggal dan jam HP bergeser dicatat", () => {
    const h = periksaKirimLuring(dasar({ selesai_hp_ms: T - 180_000 + 50 * 60_000, kirim_hp_ms: T - 180_000 + 51 * 60_000, jejak: [{ n: 1, k: "A", ms: T - 3_600_000 }] }), tes, false, T + 51 * 60_000 + 15 * 60_000);
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.selesai.getTime()).toBe(T + 30 * 60_000);
      expect(h.catatan.length).toBe(3);
    }
  });
  it("bentuk badan tidak sah = null; jawaban dibersihkan", () => {
    expect(bacaKirimLuring({ tes_id: "x" })).toBeNull();
    const b = bacaKirimLuring({ ...dasar(), jawaban: { "1": "A", x: "B", "2": 5 } });
    expect(b?.jawaban).toEqual({ "1": "A" });
  });
});
