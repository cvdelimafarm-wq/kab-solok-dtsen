import { describe, expect, it } from "vitest";
import { normalisasi } from "../identifikasi";
import { awalLanjutan, periksaLanjutan, type IsiLanjutan } from "../lanjutan";
import {
  bandingPeran, bolehTurunkanJumlah, dampakSelisih, hapusAlokasi, hapusNama, jumlahBernama, jumlahSlot, selisihDariAwal, slotKosong, teksSelisihPeran,
} from "../selisihLanjutan";

// Bentuk Seruti Triwulan IV 2026: PML 6 organik + 2 mitra, PPL 15 mitra, briefing luring di hotel dalam kota.
const FORM = normalisasi({
  nama: "Seruti Triwulan IV 2026", periode: "Triwulanan", keList: ["Triwulan IV"], berbagi: false,
  sesi: {
    briefing: { on: true, bentuk: "Luring", tempat: "Hotel dalam kota", pengajar: false, tgl: { "Triwulan IV": { mode: "tgl", perk: false, bulan: 10, minggu: 1, mulai: "2026-11-09", selesai: "2026-11-09" } } },
    pelatihan: { on: false },
  },
  peran: { pml: { on: true, nOrg: 6, nMit: 2, status: "Organik dan mitra", translok: true }, ppl: { on: true, nOrg: 0, nMit: 15, status: "Mitra", translok: true } },
});
const dasar = (): IsiLanjutan => awalLanjutan(FORM, 2026);
const isiNama = (): IsiLanjutan => { const g = dasar(); g.petugas.forEach((p, i) => { p.nama = `Nama ${i + 1}`; p.menyusul = false; }); return g; };

describe("slot petugas", () => {
  it("lanjutan baru: 24 slot kosong (1 supervisor, 6 PML organik, 2 PML mitra, 15 PPL mitra)", () => {
    const g = dasar();
    expect(g.petugas).toHaveLength(24);
    expect(g.petugas.every(slotKosong)).toBe(true);
    expect(jumlahSlot(g, "ppl", "Mitra")).toBe(15);
    expect(jumlahBernama(g, "ppl", "Mitra")).toBe(0);
  });

  it("hapus nama mengosongkan slot, melepas akun, jabatan, dan penanda baru; alokasi tetap", () => {
    const g = isiNama();
    const p = g.petugas.find((e) => e.peran === "pml" && e.status === "Organik")!;
    p.akun = 99; p.baru = true; p.jabatan = ["ketua"];
    const hasil = hapusNama(g, p.id);
    expect(hasil).toEqual({ ada: true, jabatanDilepas: ["ketua"] });
    expect(p).toMatchObject({ nama: "", menyusul: true, baru: false, jabatan: [] });
    expect("akun" in p).toBe(false);
    expect(g.peran.pml.nOrg).toBe(6);
    expect(g.petugas).toHaveLength(24);
    expect(periksaLanjutan(g)).toEqual([]);
  });

  it("hapus nama untuk kode yang tidak ada: tidak mengubah apa pun", () => {
    const g = isiNama(); const sebelum = JSON.stringify(g);
    expect(hapusNama(g, "tidak-ada")).toEqual({ ada: false, jabatanDilepas: [] });
    expect(JSON.stringify(g)).toBe(sebelum);
  });

  it("hapus alokasi hanya untuk slot kosong; slot bernama ditolak dan tidak berubah", () => {
    const g = isiNama(); const sebelum = JSON.stringify(g);
    const p = g.petugas.find((e) => e.peran === "ppl")!;
    expect(hapusAlokasi(g, p.id)).toBe(false);
    expect(JSON.stringify(g)).toBe(sebelum);
  });

  it("kosongkan nama lalu hapus alokasi: slot hilang dan jumlah mitra PPL turun satu (15 → 14), jumlah lain tetap", () => {
    const g = isiNama();
    const p = g.petugas.find((e) => e.peran === "ppl")!;
    hapusNama(g, p.id);
    expect(hapusAlokasi(g, p.id)).toBe(true);
    expect(g.peran.ppl).toMatchObject({ nOrg: 0, nMit: 14 });
    expect(jumlahSlot(g, "ppl", "Mitra")).toBe(14);
    expect(g.peran.pml).toMatchObject({ nOrg: 6, nMit: 2 });
    expect(periksaLanjutan(g)).toEqual([]);
  });

  it("slot kelebihan (slot lebih banyak dari alokasi) dibuang tanpa mengurangi alokasi", () => {
    const g = dasar(); g.peran.ppl.nMit = 10;
    const p = g.petugas.filter((e) => e.peran === "ppl")[0];
    expect(jumlahSlot(g, "ppl", "Mitra")).toBe(15);
    expect(hapusAlokasi(g, p.id)).toBe(true);
    expect(g.peran.ppl.nMit).toBe(10);
    expect(jumlahSlot(g, "ppl", "Mitra")).toBe(14);
  });

  it("slot tanpa peran dibuang tanpa menyentuh alokasi peran mana pun", () => {
    const g = dasar(); g.petugas.push({ id: "p99", nama: "", menyusul: true, peran: "", status: "Organik", sumber: "", baru: false, jabatan: [] });
    const peranSebelum = JSON.stringify(g.peran);
    expect(hapusAlokasi(g, "p99")).toBe(true);
    expect(JSON.stringify(g.peran)).toBe(peranSebelum);
  });

  it("jumlah per peran tidak boleh diturunkan di bawah jumlah slot; menaikkan dan jumlah sama boleh", () => {
    const g = dasar();
    expect(bolehTurunkanJumlah(g, "ppl", "Mitra", 14)).toBe(false);
    expect(bolehTurunkanJumlah(g, "ppl", "Mitra", 15)).toBe(true);
    expect(bolehTurunkanJumlah(g, "ppl", "Mitra", 20)).toBe(true);
    g.peran.ppl.nMit = 20; // kerangka belum dibuat penuh: boleh turun sampai jumlah slot
    expect(bolehTurunkanJumlah(g, "ppl", "Mitra", 16)).toBe(true);
    expect(bolehTurunkanJumlah(g, "ppl", "Mitra", 14)).toBe(false);
  });
});

describe("selisih dua isi", () => {
  it("isi sama: tidak ada selisih dan tidak ada dampak", () => {
    expect(bandingPeran(dasar(), dasar())).toEqual([]);
    expect(dampakSelisih(dasar(), dasar(), FORM, null)).toEqual([]);
  });

  it("peran tidak dipakai dihitung nol", () => {
    const a = dasar(); const b = dasar(); b.peran.ppl.on = false;
    const s = bandingPeran(a, b);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kode: "ppl", dariMit: 15, keMit: 0 });
  });

  it("selisih dari awal: kosong bila belum berubah; PPL 15 → 14 terdeteksi", () => {
    const g = dasar();
    expect(selisihDariAwal(g, FORM, 2026)).toEqual([]);
    g.peran.ppl.nMit = 14;
    const s = selisihDariAwal(g, FORM, 2026);
    expect(s.map(teksSelisihPeran)).toEqual(["PPL 15 → 14 (mitra 15 → 14)"]);
    expect(selisihDariAwal(g, null, 2026)).toEqual([]);
    expect(selisihDariAwal(g, FORM, null)).toEqual([]);
  });

  it("dampak: alokasi, rekrutmen mitra, dan pengadaan ikut berubah saat PPL mitra turun 15 → 14", () => {
    const a = dasar(); const b = dasar(); b.peran.ppl.nMit = 14;
    const d = dampakSelisih(a, b, FORM, null);
    const kunci = d.map((x) => x.kunci);
    expect(kunci).toContain("alokasi");
    expect(kunci).toContain("rekrutmen");
    expect(kunci).toContain("pengadaan");
    expect(d.find((x) => x.kunci === "alokasi")!.butir).toEqual(["PPL 15 → 14 (mitra 15 → 14)"]);
    expect(d.find((x) => x.kunci === "rekrutmen")!.butir).toEqual(["Kebutuhan mitra 17 → 16 orang."]);
    expect(d.find((x) => x.kunci === "pengadaan")!.butir[0]).toMatch(/peserta 24 → 23/);
  });

  it("dampak pengadaan mencatat kelas yang jadwalnya berubah dan kelas yang dihapus", () => {
    const a = dasar(); const b = dasar();
    b.kelas[0].mulai = "2026-11-10"; b.kelas[0].selesai = "2026-11-10";
    const d1 = dampakSelisih(a, b, FORM, null).find((x) => x.kunci === "pengadaan")!;
    expect(d1.butir[0]).toMatch(/jadwal, tempat, atau paket berubah/);
    b.kelas = [];
    const d2 = dampakSelisih(a, b, FORM, null).find((x) => x.kunci === "pengadaan")!;
    expect(d2.butir.some((t) => /kelas dihapus/.test(t))).toBe(true);
  });

  it("perubahan nama petugas saja tidak menimbulkan dampak hilir bernilai", () => {
    const a = isiNama(); const b = isiNama(); b.petugas[0].nama = "Pengganti";
    expect(dampakSelisih(a, b, FORM, null)).toEqual([]);
  });
});
