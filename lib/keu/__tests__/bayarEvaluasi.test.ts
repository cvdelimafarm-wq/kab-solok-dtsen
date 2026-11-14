import { describe, expect, it } from "vitest";
import { csvBayar, galatSalin, kalimatRapor, persen, ringkasBayar, type BahanEvaluasi, type DaftarBayar } from "@/lib/keu/bayarEvaluasi";

const baris = (x: Partial<DaftarBayar["kegiatan"][0]["baris"][0]>) => ({
  penugasan_id: 1, akun_id: 1, nama: "A", jenis: "mitra", peran: "ppl", maks_hari: 4, n_hari: 4, n_lampau: 3, n_sah: 2, n_dibayar: 2, n_rencana: 4,
  tarif: "170000", nominal: 340000, nominal_rencana: 680000, terverifikasi: false, ...x,
});
const d: DaftarBayar = {
  hari_ini: "2026-11-14", ident_id: 7, ro_kode: "X", dicatat_ro: 0,
  kegiatan: [{ kegiatan_id: 6, nama: "Pendataan", fungsi: "pendataan", wajib_laporan: true, jumlah_foto: 5, total: 510000, total_rencana: 1360000, tanpa_tarif: 0,
    baris: [baris({}), baris({ penugasan_id: 2, nama: "B; C", n_sah: 1, n_dibayar: 1, nominal: 170000, terverifikasi: true })] }],
};

describe("ringkasBayar", () => {
  it("menjumlah hari sah, rencana, nominal, dan hari lampau yang belum sah", () => {
    expect(ringkasBayar(d)).toEqual({ orang: 2, hariSah: 3, hariRencana: 8, total: 510000, totalRencana: 1360000, terverifikasi: 1, tanpaTarif: 0, belumSah: 3 });
  });
  it("persen aman untuk pembagi nol", () => {
    expect(persen(3, 8)).toBe(38);
    expect(persen(1, 0)).toBeNull();
  });
});

describe("csvBayar", () => {
  it("memakai titik koma, mengutip sel yang berisi pemisah, dan berbaris jumlah", () => {
    const c = csvBayar(d.kegiatan[0]).split("\n");
    expect(c[0]).toBe("No;Nama;Jenis;Peran;Hari terjadwal;Hari lampau;Hari sah;Batas hari;Hari dibayar;Tarif;Nominal;Terverifikasi");
    expect(c[2]).toContain('"B; C"');
    expect(c[3]).toBe(";Jumlah;;;;;;;3;;510000;");
  });
});

describe("rapor dan salin", () => {
  it("menyusun kalimat rapor", () => {
    const b = { spk: { mitra: 18, terbit: 18, terbit_tanggal: [] }, delego: null, penilaian360: { n: 0, penilai: 0, dinilai: 0, rata: null }, bayar: d } as unknown as BahanEvaluasi;
    const k = kalimatRapor(b);
    expect(k[0]).toBe("SPK terbit 18 dari 18 mitra.");
    expect(k[1]).toBe("Hari kerja sah 3 dari 8 hari terjadwal (38%).");
    expect(k[2]).toBe("3 hari lampau belum sah (laporan atau foto belum lengkap).");
  });
  it("nama salinan wajib berbeda", () => {
    expect(galatSalin("Se", "Seruti TW IV")).toMatch(/3 huruf/);
    expect(galatSalin("seruti tw iv", "Seruti TW IV")).toMatch(/berbeda/);
    expect(galatSalin("Seruti Triwulan I 2027", "Seruti TW IV")).toBeNull();
  });
});
