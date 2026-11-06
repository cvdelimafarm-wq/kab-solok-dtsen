import { describe, expect, it } from "vitest";
import { awalForm, hitungJadwal, jadwalValid, jendelaPeriode, kecualiAktif, normalisasi, type Form } from "../identifikasi";
import {
  ALASAN_KHUSUS, ALASAN_LUAR_POLA, ketRentang, isiMulai, isiSelesai, putusanPendataan, rekDariRentang, rekDenganPerk, relDariTanggal,
  relSamaDenganAcuan, relSudahSama, terapkanTanggalPendataan,
} from "../isianTanggal";

const T = 2026;
const form = (u?: (f: Form) => void): Form => { const f = awalForm(); f.keList = ["Triwulan I", "Triwulan II"]; u?.(f); return f; };

describe("rentang tanggal", () => {
  it("mengisi mulai saat selesai kosong menyamakan selesai (kegiatan satu hari)", () => {
    expect(isiMulai({ mulai: "", selesai: "" }, "2026-11-10")).toEqual({ mulai: "2026-11-10", selesai: "2026-11-10" });
  });
  it("mengisi mulai saat sudah ada rentang menggeser rentang dengan jumlah hari tetap", () => {
    expect(isiMulai({ mulai: "2026-11-10", selesai: "2026-11-12" }, "2026-11-20")).toEqual({ mulai: "2026-11-20", selesai: "2026-11-22" });
  });
  it("mulai yang belum lengkap tidak mengubah selesai", () => {
    expect(isiMulai({ mulai: "2026-11-10", selesai: "2026-11-12" }, "")).toEqual({ mulai: "", selesai: "2026-11-12" });
  });
  it("mengisi selesai saat mulai kosong menyamakan mulai; bila mulai ada, hanya selesai yang berubah", () => {
    expect(isiSelesai({ mulai: "", selesai: "" }, "2026-11-10")).toEqual({ mulai: "2026-11-10", selesai: "2026-11-10" });
    expect(isiSelesai({ mulai: "2026-11-10", selesai: "2026-11-10" }, "2026-11-12")).toEqual({ mulai: "2026-11-10", selesai: "2026-11-12" });
  });
  it("selesai sebelum mulai dibiarkan agar tampil sebagai galat", () => {
    expect(isiSelesai({ mulai: "2026-11-10", selesai: "2026-11-10" }, "2026-11-08")).toEqual({ mulai: "2026-11-10", selesai: "2026-11-08" });
    expect(ketRentang("2026-11-10", "2026-11-08")).toEqual({ teks: "Tanggal selesai mendahului tanggal mulai.", galat: true });
  });
  it("keterangan jumlah hari", () => {
    expect(ketRentang("2026-11-10", "2026-11-10")).toEqual({ teks: "1 hari", galat: false });
    expect(ketRentang("2026-11-10", "2026-11-12")).toEqual({ teks: "3 hari", galat: false });
    expect(ketRentang("", "")).toEqual({ teks: "", galat: false });
  });
});

describe("rekaman jadwal dari rentang", () => {
  it("membuang bulan dan minggu perkiraan lama, mode rentang, penanda dipertahankan", () => {
    const lama = { mulai: "2026-11-09", selesai: "2026-11-13", perk: true, mode: "minggu" as const, bulan: 10, minggu: 2 };
    const baru = rekDariRentang(lama, { mulai: "2026-11-10", selesai: "2026-11-10" }, T);
    expect(baru).toEqual({ mulai: "2026-11-10", selesai: "2026-11-10", perk: true, mode: "rentang" });
    expect("bulan" in baru).toBe(false);
    expect("minggu" in baru).toBe(false);
  });
  it("rekaman kosong: Perkiraan (bawaan) dengan rentang", () => {
    expect(rekDariRentang(undefined, { mulai: "2026-11-10", selesai: "2026-11-11" }, T)).toMatchObject({ mulai: "2026-11-10", selesai: "2026-11-11", mode: "rentang" });
  });
  it("mengganti Perkiraan/Fix tidak mengubah tanggal", () => {
    const r = rekDenganPerk({ mulai: "2026-11-09", selesai: "2026-11-13", perk: true, mode: "minggu", bulan: 10, minggu: 2 }, false, T);
    expect(r).toMatchObject({ mulai: "2026-11-09", selesai: "2026-11-13", perk: false, mode: "rentang" });
    expect("bulan" in r).toBe(false);
  });
});

describe("tahap sesudah pendataan: tanggal -> selisih hari", () => {
  const f = form((g) => { g.adaUpdating = true; });
  const jp = hitungJadwal(f, "Triwulan I", T); // pendataan 1 Mar..31 Mar 2026

  it("updating mulai 10 hari sebelum mulai pendataan", () => {
    expect(jp.pendataan?.mulai).toBe("2026-03-01");
    const h = relDariTanggal(f.rel.updating, jp.pendataan, "mulai", "2026-02-19");
    expect(h).toEqual({ patch: { dM: -10 } });
  });
  it("menerapkan hasilnya mengembalikan tanggal yang diketik", () => {
    const h = relDariTanggal(f.rel.updating, jp.pendataan, "selesai", "2026-02-25");
    expect("patch" in h).toBe(true);
    const g = form((x) => { x.adaUpdating = true; });
    if ("patch" in h) Object.assign(g.rel.updating, h.patch);
    expect(hitungJadwal(g, "Triwulan I", T).updating?.selesai).toBe("2026-02-25");
  });
  it("selisih mengikuti penanda acuan selesai/mulai yang sudah ada", () => {
    const an = { mulai: "2026-03-01", selesai: "2026-03-31" };
    expect(relDariTanggal({ aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true }, an, "selesai", "2026-04-20")).toEqual({ patch: { dS: 20 } });
  });
  it("tahap acuan belum bertanggal -> galat; terlalu jauh -> galat", () => {
    expect(relDariTanggal(f.rel.updating, { mulai: "", selesai: "" }, "mulai", "2026-02-19")).toHaveProperty("galat");
    expect(relDariTanggal(f.rel.updating, undefined, "mulai", "2026-02-19")).toHaveProperty("galat");
    expect(relDariTanggal(f.rel.updating, jp.pendataan, "mulai", "2025-12-01")).toHaveProperty("galat"); // 90 hari sebelum
    expect(relDariTanggal(f.rel.pasca, jp.pendataan, "selesai", "2028-01-01")).toHaveProperty("galat");
    expect(relDariTanggal(f.rel.pasca, jp.pendataan, "selesai", "bukan-tanggal")).toHaveProperty("galat");
  });
  it("selisih hasilnya selalu lolos normalisasi (tidak terjepit)", () => {
    const h = relDariTanggal(f.rel.updating, jp.pendataan, "mulai", "2026-01-01"); // -59 hari
    expect(h).toEqual({ patch: { dM: -59 } });
    const g = form((x) => { x.adaUpdating = true; x.rel.updating.dM = -59; });
    expect(normalisasi(JSON.parse(JSON.stringify(g))).rel.updating.dM).toBe(-59);
  });
  it("samakan dengan pendataan", () => {
    const r = { aM: "selesai" as const, dM: 3, aS: "selesai" as const, dS: 9, perk: true };
    expect(relSudahSama(r)).toBe(false);
    expect(relSudahSama({ ...r, ...relSamaDenganAcuan() })).toBe(true);
  });
  it("aturan urutan lama tetap berlaku: updating yang menimpa pendataan tetap dilaporkan lib", () => {
    const g = form((x) => { x.adaUpdating = true; });
    const an = hitungJadwal(g, "Triwulan I", T).pendataan;
    const h = relDariTanggal(g.rel.updating, an, "selesai", "2026-03-05");
    if ("patch" in h) Object.assign(g.rel.updating, h.patch);
    expect(jadwalValid(g, "Triwulan I", T).masalah).toContain("Pendataan dimulai sebelum updating selesai (tidak boleh beririsan).");
  });
});

describe("pendataan: tanggal -> pola atau pengecualian", () => {
  it("tanpa periode: jadwal tunggal; mulai mengisi selesai bila kosong", () => {
    const g = form((x) => { x.periode = "Tanpa periode"; x.keList = []; });
    expect(putusanPendataan(g, "Kegiatan", "mulai", "2026-05-04", T)).toEqual({ aksi: "tunggal" });
    terapkanTanggalPendataan(g, "Kegiatan", "mulai", "2026-05-04", T);
    expect(g.tunggal).toMatchObject({ mulai: "2026-05-04", selesai: "2026-05-04" });
    terapkanTanggalPendataan(g, "Kegiatan", "selesai", "2026-05-15", T);
    expect(g.tunggal).toMatchObject({ mulai: "2026-05-04", selesai: "2026-05-15" });
    terapkanTanggalPendataan(g, "Kegiatan", "mulai", "2026-05-06", T); // tidak menggeser selesai
    expect(g.tunggal).toMatchObject({ mulai: "2026-05-06", selesai: "2026-05-15" });
  });
  it("periode pertama: tanggal menjadi pola yang berlaku untuk semua periode", () => {
    const g = form();
    // Triwulan I: bulan ke-1 = Januari. Mulai 5 April = bulan ke-4 (indeks 3) tanggal 5.
    const k = terapkanTanggalPendataan(g, "Triwulan I", "mulai", "2026-04-05", T);
    expect(k).toEqual({ aksi: "pola", patch: { mb: 3, mj: "tgl", mn: 5 } });
    expect(jendelaPeriode(g, "Triwulan I", T).mulai).toBe("2026-04-05");
    expect(jendelaPeriode(g, "Triwulan II", T).mulai).toBe("2026-07-05"); // periode lain mengikuti pola
  });
  it("selesai pada hari terakhir bulan disimpan sebagai akhir bulan; tanggal lain sebagai tanggal", () => {
    const g = form();
    terapkanTanggalPendataan(g, "Triwulan I", "selesai", "2026-04-30", T);
    expect(g.jend).toMatchObject({ sb: 3, sj: "akhir" });
    expect(jendelaPeriode(g, "Triwulan II", T).selesai).toBe("2026-07-31");
    terapkanTanggalPendataan(g, "Triwulan I", "selesai", "2026-04-20", T);
    expect(g.jend).toMatchObject({ sb: 3, sj: "tgl", sn: 20 });
    expect(jendelaPeriode(g, "Triwulan II", T).selesai).toBe("2026-07-20");
  });
  it("mulai yang semula 'hari terakhir bulan' menjadi tanggal biasa", () => {
    const g = form((x) => { x.jend.mj = "akhir"; x.jend.mn = 7; });
    terapkanTanggalPendataan(g, "Triwulan I", "mulai", "2026-03-25", T);
    expect(g.jend).toMatchObject({ mb: 2, mj: "tgl", mn: 25 });
  });
  it("periode lain: jadi jadwal khusus dengan alasan otomatis; periode pertama tidak berubah", () => {
    const g = form();
    const sebelum = jendelaPeriode(g, "Triwulan I", T);
    const k = terapkanTanggalPendataan(g, "Triwulan II", "mulai", "2026-07-20", T);
    expect(k).toEqual({ aksi: "khusus", luarPola: false });
    const e = kecualiAktif(g, "Triwulan II");
    expect(e).toMatchObject({ on: true, mulai: "2026-07-20", alasan: ALASAN_KHUSUS });
    expect(e?.selesai).toBe(jendelaPeriode(form(), "Triwulan II", T).selesai); // sisi lain tetap sama dengan pola
    expect(jendelaPeriode(g, "Triwulan I", T)).toEqual(sebelum);
  });
  it("alasan yang sudah ditulis pengguna tidak ditimpa", () => {
    const g = form((x) => { x.kecuali["Triwulan II"] = { on: true, mulai: "2026-07-01", selesai: "2026-07-15", alasan: "Libur panjang", perk: false }; });
    terapkanTanggalPendataan(g, "Triwulan II", "selesai", "2026-07-25", T);
    expect(g.kecuali["Triwulan II"]).toMatchObject({ selesai: "2026-07-25", alasan: "Libur panjang" });
  });
  it("periode pertama yang sudah memakai pengecualian: tanggal mengisi pengecualian itu, bukan pola", () => {
    const g = form((x) => { x.kecuali["Triwulan I"] = { on: true, mulai: "2026-03-01", selesai: "2026-03-10", alasan: "x", perk: false }; });
    const pola = { ...g.jend };
    terapkanTanggalPendataan(g, "Triwulan I", "mulai", "2026-03-03", T);
    expect(g.jend).toEqual(pola);
    expect(g.kecuali["Triwulan I"].mulai).toBe("2026-03-03");
  });
  it("tanggal di luar jangkauan pola (sebelum awal periode): pengecualian dengan alasan khusus", () => {
    const g = form();
    const k = terapkanTanggalPendataan(g, "Triwulan II", "mulai", "2026-07-20", T); // bukan periode pertama
    expect(k.aksi).toBe("khusus");
    const g2 = form();
    const k2 = terapkanTanggalPendataan(g2, "Triwulan I", "mulai", "2025-12-20", T); // sebelum Januari 2026
    expect(k2).toEqual({ aksi: "khusus", luarPola: true });
    expect(g2.kecuali["Triwulan I"]).toMatchObject({ mulai: "2025-12-20", alasan: ALASAN_LUAR_POLA });
  });
  it("hasil akhir lolos pemeriksaan jadwal (alasan pengecualian tidak kosong)", () => {
    const g = form();
    terapkanTanggalPendataan(g, "Triwulan II", "mulai", "2026-06-10", T);
    expect(String(g.kecuali["Triwulan II"].alasan).trim()).not.toBe("");
    expect(jadwalValid(g, "Triwulan II", T).masalah).toEqual([]);
  });
});
