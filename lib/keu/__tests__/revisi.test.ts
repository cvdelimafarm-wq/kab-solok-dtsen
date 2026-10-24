import { describe, it, expect } from "vitest";
import { dataJadwalBaru, jadwalKosong, periksaJadwalBaru, ringkasPok, statusTenggat, tglPanjang, tidakIkutPaket, aksiJadwalTersedia, argsJadwalAksi, argsPutuskan, argsTambahan, awalKeputusan, bacaBulat, periksaKeputusan, periksaSah, periksaTambahan, tambahanKosong, tanggalSah } from "../revisi";

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
    // jadwal bawaan bulanan: "Lewati bulan ini"; jadwal sekali-jalan: "Lewati"
    expect(aksiJadwalTersedia("terjadwal", "2026-12-31", "2026-10-24", true).find((x) => x.aksi === "lewati")?.label).toBe("Lewati bulan ini");
    expect(aksiJadwalTersedia("terjadwal", "2026-12-31", "2026-10-24", false).find((x) => x.aksi === "lewati")?.label).toBe("Lewati");
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

describe("tampilan jadwal (papan 11)", () => {
  it("tglPanjang", () => {
    expect(tglPanjang("2026-10-24")).toBe("24 Okt 2026");
    expect(tglPanjang("2026-12-07T00:00:00Z")).toBe("7 Des 2026");
    expect(tglPanjang("bukan")).toBe("bukan");
    expect(tglPanjang(null)).toBe("");
  });
  it("statusTenggat: warna menurut sisa hari", () => {
    expect(statusTenggat(6)).toEqual({ warna: "merah", teks: "6 hari lagi" });
    expect(statusTenggat("37")).toEqual({ warna: "abu", teks: "37 hari lagi" });
    expect(statusTenggat(20).warna).toBe("kuning");
    expect(statusTenggat(0)).toEqual({ warna: "merah", teks: "hari ini" });
    expect(statusTenggat(-3)).toEqual({ warna: "merah", teks: "lewat 3 hari" });
    expect(statusTenggat(null).teks).toBe("");
  });
  it("tidakIkutPaket hanya setelah jendela ditutup dan belum disetujui", () => {
    expect(tidakIkutPaket("dibuka", "draf")).toBe(false);
    expect(tidakIkutPaket("terkumpul", "menunggu_ppk")).toBe(true);
    expect(tidakIkutPaket("sah", "disetujui")).toBe(false);
  });
  it("ringkasPok: tanpa revisi sah memakai POK dasar", () => {
    const r = ringkasPok([], new Map(), { nomor_pok: "POK posisi 30 Sep 2026", tanggal_efektif: "2026-09-30" });
    expect(r.label).toBe("POK dasar");
    expect(r.ket).toContain("belum ada revisi sah");
    expect(r.riwayat).toHaveLength(1);
    expect(ringkasPok([], new Map(), null).riwayat[0].ket).toBe("Belum ada POK dasar di sistem.");
  });
  it("ringkasPok: versi tertinggi di atas, dasar di bawah", () => {
    const r = ringkasPok(
      [{ jadwal_id: 1, versi_sistem: 1, nomor_dokumen: "N-1", tanggal_dokumen: "2026-10-12" }, { jadwal_id: 2, versi_sistem: "2", nomor_dokumen: "N-2", tanggal_dokumen: "2026-11-12" }],
      new Map([[1, "Revisi POK Okt"], [2, "Revisi POK Nov"]]), null,
    );
    expect(r.label).toBe("Versi 2");
    expect(r.ket).toBe("Revisi POK Nov, sah 12 Nov 2026");
    expect(r.riwayat.map((v) => v.label)).toEqual(["Versi 2: Revisi POK Nov", "Versi 1: Revisi POK Okt", "POK dasar sistem"]);
  });
  it("jadwal baru: pemeriksaan dan data", () => {
    const ok = { ...jadwalKosong(), judul: " Revisi DIPA Nov ", buka: "2026-11-02", tutup: "2026-11-06" };
    expect(periksaJadwalBaru(ok, [2026])).toEqual([]);
    expect(dataJadwalBaru(ok)).toEqual({ tahun: 2026, jenis: "dipa_djpb", judul: "Revisi DIPA Nov", buka: "2026-11-02", tutup: "2026-11-06" });
    expect(periksaJadwalBaru({ ...ok, judul: "a" }, [2026])).toHaveLength(1);
    expect(periksaJadwalBaru({ ...ok, tutup: "2026-11-01" }, [2026])[0]).toContain("lebih awal");
    expect(periksaJadwalBaru({ ...ok, buka: "2027-01-05", tutup: "2027-01-08" }, [2026])[0]).toContain("2027 belum terdaftar");
    expect(periksaJadwalBaru(jadwalKosong(), [2026]).length).toBeGreaterThanOrEqual(3);
  });
});

describe("halaman revisi: alamat baca sesuai daftar putih", () => {
  it("setiap urlBaca yang dipakai lolos periksaMasukanBaca", async () => {
    const { urlBaca } = await import("../ro");
    const { periksaMasukanBaca } = await import("../baca");
    const daftar = [
      urlBaca("keu_v_revisi_ringkas", {}, { urut: "buka", batas: 200 }),
      urlBaca("keu_revisi_jadwal", {}, { urut: "buka", batas: 200, kolom: ["id", "ulang", "catatan"] }),
      urlBaca("keu_revisi_sah", {}, { batas: 200, kolom: ["jadwal_id", "versi_sistem", "nomor_dokumen", "tanggal_dokumen"] }),
      urlBaca("keu_v_tenggat", {}, { urut: "tanggal", batas: 20 }),
      urlBaca("keu_pok_versi", { status: "berlaku" }, { urut: "-id", batas: 1, kolom: ["id", "nomor_pok", "tanggal_efektif"] }),
      urlBaca("keu_tahun_anggaran", {}, { urut: "tahun", batas: 20, kolom: ["tahun"] }),
      urlBaca("keu_ro", {}, { urut: "kode", batas: 500, kolom: ["kode", "nama"] }),
      urlBaca("keu_revisi_usulan", { jadwal_id: 5 }, { urut: "ro_kode", batas: 500, kolom: ["id", "ro_kode", "status", "catatan"] }),
    ];
    for (const u of daftar) {
      const q = Object.fromEntries(new URL(u, "http://x").searchParams.entries());
      const r = periksaMasukanBaca(q);
      expect(r.ok, u).toBe(true);
    }
  });
});
