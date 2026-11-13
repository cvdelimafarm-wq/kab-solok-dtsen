import { describe, expect, it } from "vitest";
import { hrefAtur, KATALOG_KOMPONEN, ringkasLembar, susunLembar, type DataKomponen } from "../komponen";

const nol = { n_pretest: 0, n_posttest: 0, n_materi: 0, n_berkas: 0, n_kuis_pra: 0, n_kuis_live: 0, n_kelas: 0, n_titik_presensi: 0, n_presensi: 0, n_nilai_skema: 0, n_foto_pelatihan: 0, n_surat_undangan: 0, n_laporan_pelatihan: 0, n_alokasi: 0, n_penugasan: 0, n_st: 0, n_qc_atur: 0, n_qc_soal: 0, n_anomali: 0, n_realisasi: 0, n_360: 0 };
const pel: DataKomponen = { ident_id: 7, fungsi: "pelatihan", kegiatan_id: 7, kegiatan_nama: "Pelatihan Seruti", strategi: "umum", fitur: { vanguard: true, vanguard_roleplay: false }, ...nol, n_pretest: 1, n_posttest: 1, n_berkas: 7, n_kuis_live: 1, n_kelas: 1, n_titik_presensi: 1, n_presensi: 18, n_nilai_skema: 1 };

describe("lembar komponen (Fase 2d)", () => {
  it("katalog: 13 pelatihan, 12 pendataan, kode unik", () => {
    expect(KATALOG_KOMPONEN.filter((k) => k.fungsi === "pelatihan")).toHaveLength(13);
    expect(KATALOG_KOMPONEN.filter((k) => k.fungsi === "pendataan")).toHaveLength(12);
    expect(new Set(KATALOG_KOMPONEN.map((k) => k.kode)).size).toBe(KATALOG_KOMPONEN.length);
  });
  it("status dari data Kelola; aturan Belajar dan mutu mengalahkan data (termasuk pembatalan)", () => {
    const b = susunLembar("pelatihan", pel, [
      { kegiatan_id: 7, waktu: "saat_pelatihan", butir: "vanguard_roleplay", aktif: false, wajib: false, batal_alasan: "Sinyal buruk" },
      { kegiatan_id: 7, waktu: "pra_pelatihan", butir: "vanguard_latihan", aktif: true, wajib: true, batal_alasan: null },
    ]);
    const k = (kode: string) => b.find((x) => x.kode === kode)!;
    expect(k("P05").status).toBe("dipakai");
    expect(k("P01").status).toBe("belum");
    expect(k("P07")).toMatchObject({ status: "dibatalkan", ket: "Sinyal buruk", sumber: "belajar" });
    expect(k("P04")).toMatchObject({ status: "dipakai", wajib: true, sumber: "belajar" });
    expect(k("P12").status).toBe("info");
    expect(k("P05").href).toBe("/sigap/kelola/pelatihan?tab=materi&sub=tes&kegiatan=7");
    expect(ringkasLembar(b).dibatalkan).toBe(1);
  });
  it("tanpa kegiatan tertaut: semua belum, tanpa tautan", () => {
    const b = susunLembar("pendataan", null, []);
    expect(b.every((x) => x.status === "belum" && x.href === null)).toBe(true);
    expect(hrefAtur("pendataan", 6, { tab: "qc" })).toBe("/sigap/kelola/pendataan?k=6&tab=qc");
  });
});
