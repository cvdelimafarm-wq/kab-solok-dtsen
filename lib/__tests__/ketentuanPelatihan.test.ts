import { describe, expect, it } from "vitest";
import { KETENTUAN_BAWAAN, MAKS_BUTIR, MAKS_PANJANG_BUTIR, bacaKetentuan, bersihkanButir, hariIniWib, kegiatanSudahSelesai, ketentuanBerubah, ketentuanDiubah, periksaRespons, statusUndangan, tampilanBaruAktif, teksKartuUndangan, type ResponsUndangan } from "@/lib/ketentuanPelatihan";

const terima = (versi: number): ResponsUndangan => ({ respons: "terima", alasan: null, versi_ketentuan: versi, dijawab_at: "2026-11-02T00:00:00Z" });
const tolak: ResponsUndangan = { respons: "tolak", alasan: "sakit", versi_ketentuan: 1, dijawab_at: "2026-11-02T00:00:00Z" };

describe("bacaKetentuan", () => {
  it("baris kosong atau rusak -> bawaan: otomatis, tanpa butir, belum ada baris", () => {
    expect(bacaKetentuan(null)).toEqual(KETENTUAN_BAWAAN);
    expect(bacaKetentuan("x")).toEqual(KETENTUAN_BAWAAN);
    expect(KETENTUAN_BAWAAN).toEqual({ tab_pengaturan: null, butir: [], versi: 1, ada: false });
  });
  it("pengaturan tab: true / false hanya bila persis boolean, selain itu otomatis (null)", () => {
    expect(bacaKetentuan({ tab_baru: true, butir: [], versi: 3 })).toEqual({ tab_pengaturan: true, butir: [], versi: 3, ada: true });
    expect(bacaKetentuan({ tab_baru: false }).tab_pengaturan).toBe(false);
    expect(bacaKetentuan({ tab_baru: null }).tab_pengaturan).toBeNull();
    expect(bacaKetentuan({ tab_baru: "true" }).tab_pengaturan).toBeNull();
    expect(bacaKetentuan({}).tab_pengaturan).toBeNull();
  });
  it("versi tidak sah -> 1", () => {
    expect(bacaKetentuan({ versi: 0 }).versi).toBe(1);
    expect(bacaKetentuan({ versi: 2.5 }).versi).toBe(1);
  });
});

describe("tampilan baru otomatis", () => {
  it("otomatis: baru bila pelatihan belum selesai, lama bila sudah selesai; manual selalu menang", () => {
    expect(tampilanBaruAktif(null, false)).toBe(true);
    expect(tampilanBaruAktif(null, true)).toBe(false);
    expect(tampilanBaruAktif(true, true)).toBe(true);
    expect(tampilanBaruAktif(false, false)).toBe(false);
  });
  it("kegiatanSudahSelesai: memakai tanggal selesai, lalu mulai; tanpa tanggal = belum selesai; hari terakhir belum selesai", () => {
    expect(kegiatanSudahSelesai("2026-10-08", "2026-10-08", "2026-11-02")).toBe(true);
    expect(kegiatanSudahSelesai("2026-11-09", "2026-11-09", "2026-11-02")).toBe(false);
    expect(kegiatanSudahSelesai("2026-11-02", "2026-11-01", "2026-11-02")).toBe(false);
    expect(kegiatanSudahSelesai(null, "2026-10-01", "2026-11-02")).toBe(true);
    expect(kegiatanSudahSelesai(null, null, "2026-11-02")).toBe(false);
  });
  it("hariIniWib: lewat tengah malam WIB sudah hari berikutnya", () => {
    expect(hariIniWib(new Date("2026-11-02T16:59:00Z").getTime())).toBe("2026-11-02");
    expect(hariIniWib(new Date("2026-11-02T17:00:00Z").getTime())).toBe("2026-11-03");
  });
  it("ketentuanDiubah: butir terisi atau versi naik", () => {
    expect(ketentuanDiubah(KETENTUAN_BAWAAN)).toBe(false);
    expect(ketentuanDiubah({ ...KETENTUAN_BAWAAN, butir: ["a"] })).toBe(true);
    expect(ketentuanDiubah({ ...KETENTUAN_BAWAAN, versi: 2 })).toBe(true);
  });
});

describe("bersihkanButir", () => {
  it("memangkas, membuang kosong dan non-teks", () => {
    expect(bersihkanButir(["  Hadir   tepat waktu ", "", 5, null, "Bawa HP"])).toEqual(["Hadir tepat waktu", "Bawa HP"]);
  });
  it("batas panjang dan jumlah", () => {
    expect(bersihkanButir(["a".repeat(MAKS_PANJANG_BUTIR + 50)])[0]).toHaveLength(MAKS_PANJANG_BUTIR);
    expect(bersihkanButir(Array.from({ length: MAKS_BUTIR + 5 }, (_, i) => `b${i}`))).toHaveLength(MAKS_BUTIR);
    expect(bersihkanButir("bukan daftar")).toEqual([]);
  });
});

describe("status undangan", () => {
  it("belum / diterima / ditolak", () => {
    expect(statusUndangan(null)).toBe("belum");
    expect(statusUndangan(terima(1))).toBe("diterima");
    expect(statusUndangan(tolak)).toBe("ditolak");
  });
  it("ketentuan berubah hanya bila yang diterima versi lebih lama", () => {
    const k = { ...KETENTUAN_BAWAAN, versi: 2 };
    expect(ketentuanBerubah(terima(1), k)).toBe(true);
    expect(ketentuanBerubah(terima(2), k)).toBe(false);
    expect(ketentuanBerubah(tolak, k)).toBe(false);
    expect(ketentuanBerubah(null, k)).toBe(false);
  });
});

describe("periksaRespons", () => {
  it("terima wajib setuju", () => {
    expect(periksaRespons({ respons: "terima" })).toMatchObject({ ok: false });
    expect(periksaRespons({ respons: "terima", setuju: "ya" })).toMatchObject({ ok: false });
    expect(periksaRespons({ respons: "terima", setuju: true })).toEqual({ ok: true, respons: "terima", alasan: null });
  });
  it("tolak wajib alasan, dirapikan dan dipangkas", () => {
    expect(periksaRespons({ respons: "tolak", alasan: "  " })).toMatchObject({ ok: false });
    expect(periksaRespons({ respons: "tolak", alasan: "ab" })).toMatchObject({ ok: false });
    expect(periksaRespons({ respons: "tolak", alasan: "  sedang   sakit " })).toEqual({ ok: true, respons: "tolak", alasan: "sedang sakit" });
    const r = periksaRespons({ respons: "tolak", alasan: "x".repeat(500) });
    expect(r.ok && r.alasan?.length).toBe(200);
  });
  it("pilihan lain ditolak", () => {
    expect(periksaRespons({ respons: "mungkin" })).toMatchObject({ ok: false });
    expect(periksaRespons(null)).toMatchObject({ ok: false });
  });
});

describe("teksKartuUndangan", () => {
  it("setiap keadaan punya judul, keterangan, tombol", () => {
    expect(teksKartuUndangan("belum", false)).toMatchObject({ judul: "Belum direspons", tombol: "Buka undangan", nada: "emas" });
    expect(teksKartuUndangan("diterima", false)).toMatchObject({ judul: "Diterima", nada: "hijau" });
    expect(teksKartuUndangan("diterima", true)).toMatchObject({ judul: "Diterima · ketentuan diperbarui", nada: "emas" });
    expect(teksKartuUndangan("ditolak", false)).toMatchObject({ judul: "Ditolak", nada: "merah" });
  });
});
