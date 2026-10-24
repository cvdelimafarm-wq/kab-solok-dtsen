import { describe, it, expect } from "vitest";
import { aksiJadwalTersedia, argsJadwalAksi, argsPutuskan, argsTambahan, awalKeputusan, bacaBulat, periksaKeputusan, periksaSah, periksaTambahan, tambahanKosong, tanggalSah } from "../revisi";

describe("aksiJadwalTersedia", () => {
  it("mengikuti urutan status", () => {
    const a = (s: string, t = "2026-12-31") => aksiJadwalTersedia(s, t, "2026-10-24").map((x) => x.aksi);
    expect(a("terjadwal")).toEqual(["buka", "lewati"]);
    expect(a("dibuka")).toEqual(["tutup", "lewati"]);
    expect(a("terkumpul")).toEqual(["terapkan"]);
    expect(a("diterapkan")).toEqual(["sah"]);
    expect(a("sah")).toEqual([]);
    expect(a("dilewati")).toEqual(["pulihkan"]);
    expect(a("dilewati", "2026-10-01")).toEqual([]);
  });
  it("sah memerlukan dokumen", () => {
    expect(aksiJadwalTersedia("diterapkan", "2026-12-31", "2026-10-24")[0].perluDokumen).toBe(true);
  });
});

describe("sah", () => {
  it("tanggal dan nomor", () => {
    expect(tanggalSah("2026-02-30")).toBe(false);
    expect(tanggalSah("2026-10-24")).toBe(true);
    expect(periksaSah("ab", "")).toHaveLength(2);
    expect(periksaSah("S-123", "2026-10-24")).toEqual([]);
    expect(argsJadwalAksi(5, "sah", { nomor: " S-123 ", tanggal: "2026-10-24" })).toEqual({ p_jadwal: 5, p_aksi: "sah", p_nomor: "S-123", p_tanggal: "2026-10-24" });
    expect(argsJadwalAksi(5, "buka")).toEqual({ p_jadwal: 5, p_aksi: "buka" });
  });
});

describe("tambahan pagu", () => {
  const ok = { ...tambahanKosong(), ro: "2906.BMA.005", jumlah: "1.500.000", jalur: "djpb" as const, nomor: "S-1/KN.2/2026", tanggal: "2026-10-20" };
  it("angka", () => {
    expect(bacaBulat("1.500.000")).toBe(1500000);
    expect(bacaBulat("Rp 2.000")).toBe(2000);
    expect(bacaBulat("12,5")).toBeNull();
    expect(bacaBulat("")).toBeNull();
  });
  it("lolos dan argumen", () => {
    expect(periksaTambahan(ok)).toEqual([]);
    expect(argsTambahan(ok)).toMatchObject({ p_ro: "2906.BMA.005", p_jumlah: 1500000, p_jalur: "djpb" });
    expect("p_jadwal" in argsTambahan(ok)).toBe(false);
  });
  it("menolak isian salah", () => {
    expect(periksaTambahan(tambahanKosong()).length).toBe(5);
    expect(periksaTambahan({ ...ok, jumlah: "0" })).toHaveLength(1);
  });
  it("jadwal harus cocok jalur", () => {
    expect(periksaTambahan({ ...ok, jadwal: "9" }, [{ id: 9, jenis: "dipa_dja" }])).toHaveLength(1);
    expect(periksaTambahan({ ...ok, jadwal: "9" }, [{ id: 9, jenis: "dipa_djpb" }])).toEqual([]);
    expect(argsTambahan({ ...ok, jadwal: "9" }).p_jadwal).toBe(9);
  });
});

describe("keputusan kekurangan", () => {
  const jml = new Map([[1, 600], [2, 500], [3, 300]]);
  it("awal dari saran", () => {
    const d = awalKeputusan([1, 2, 3], [{ kekurangan_id: "1", saran: "penuhi" }, { kekurangan_id: 2, saran: "tunda" }]);
    expect(d.map((x) => x.keputusan)).toEqual(["penuhi", "tunda", "tunda"]);
  });
  it("tidak boleh melebihi tambahan", () => {
    const d = awalKeputusan([1, 2, 3], []).map((x) => ({ ...x, keputusan: "penuhi" as const }));
    const r = periksaKeputusan(d, jml, 1000);
    expect(r.dipenuhi).toBe(1400);
    expect(r.galat.join(" ")).toMatch(/minus/);
  });
  it("tolak wajib alasan; sisa dihitung", () => {
    const d = [{ id: 1, keputusan: "penuhi" as const, alasan: "" }, { id: 2, keputusan: "tolak" as const, alasan: "x" }, { id: 3, keputusan: "tunda" as const, alasan: "" }];
    const r = periksaKeputusan(d, jml, 1000);
    expect(r.galat).toHaveLength(1);
    expect(r.sisa).toBe(400);
    d[1].alasan = "tidak prioritas";
    expect(periksaKeputusan(d, jml, 1000).galat).toEqual([]);
    expect(argsPutuskan(7, d)).toEqual({ p_tambahan: 7, p_keputusan: [{ id: 1, keputusan: "penuhi", alasan: "" }, { id: 2, keputusan: "tolak", alasan: "tidak prioritas" }, { id: 3, keputusan: "tunda", alasan: "" }] });
  });
});
