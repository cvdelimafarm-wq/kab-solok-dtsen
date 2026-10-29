import { describe, expect, it } from "vitest";
import { saringPetugas, susunPetugasQc, type PesertaMentah } from "../sigapQcMonitor";

const P: PesertaMentah[] = [
  { akun_id: 1, nama: "Ayu", peran: "pml", pml_akun_id: null, pml_nama: null },
  { akun_id: 2, nama: "Dana", peran: "ppl", pml_akun_id: 1, pml_nama: "Ayu" },
  { akun_id: 3, nama: "Ega", peran: "ppl", pml_akun_id: 1, pml_nama: "Ayu" },
  { akun_id: 4, nama: "Fitri", peran: "ppl", pml_akun_id: 1, pml_nama: "Ayu" },
];
const RILIS = "2026-10-29T07:00:00Z";
const SEKARANG = new Date("2026-10-29T07:30:00Z");
const dasar = { peserta: P, percobaan: [], langganan: [], kirim: [], sesi: [], tundaAkun: [], nilaiLulus: 100, rilisAt: RILIS, now: SEKARANG };

describe("susunPetugasQc", () => {
  it("nilai: skor awal, terbaik, lulus menurut nilai_lulus", () => {
    const r = susunPetugasQc({
      ...dasar,
      percobaan: [
        { akun_id: 2, ke: 1, skor: 60, benar: 9, jumlah: 15, terlambat: false, selesai_at: "2026-10-29T07:10:00Z" },
        { akun_id: 2, ke: 2, skor: 100, benar: 15, jumlah: 15, terlambat: false, selesai_at: "2026-10-29T07:20:00Z" },
        { akun_id: 3, ke: 1, skor: 93, benar: 14, jumlah: 15, terlambat: true, selesai_at: "2026-10-29T07:12:00Z" },
      ],
    });
    const dana = r.petugas.find((p) => p.akun_id === 2)!;
    expect(dana).toMatchObject({ percobaan: 2, skor_awal: 60, skor_terbaik: 100, lulus: true, selesai_at: "2026-10-29T07:20:00Z" });
    const ega = r.petugas.find((p) => p.akun_id === 3)!;
    expect(ega).toMatchObject({ percobaan: 1, lulus: false, terlambat: true });
    const lulus70 = susunPetugasQc({ ...dasar, nilaiLulus: 90, percobaan: [{ akun_id: 3, ke: 1, skor: 93, benar: 14, jumlah: 15, terlambat: false, selesai_at: "x" }] });
    expect(lulus70.petugas.find((p) => p.akun_id === 3)!.lulus).toBe(true);
    expect(r.monitoring).toMatchObject({ sudah_mengisi: 2, lulus: 1, peserta: 4 });
  });

  it("modal sampai = sesi sejak rilis, sudah mengisi, atau tunda; sesi sebelum rilis tidak dihitung", () => {
    const r = susunPetugasQc({
      ...dasar,
      sesi: [
        { akun_id: 2, terakhir_aktif_at: "2026-10-29T07:05:00Z" },
        { akun_id: 3, terakhir_aktif_at: "2026-10-29T06:59:00Z" },
        { akun_id: 2, terakhir_aktif_at: "2026-10-29T07:20:00Z" },
      ],
      tundaAkun: [4],
    });
    const by = (id: number) => r.petugas.find((p) => p.akun_id === id)!;
    expect(by(2)).toMatchObject({ modal_sampai: true, buka_at: "2026-10-29T07:20:00Z" });
    expect(by(3)).toMatchObject({ modal_sampai: false, buka_at: null });
    expect(by(4)).toMatchObject({ modal_sampai: true, tunda: true });
    expect(by(1).modal_sampai).toBe(false);
    expect(r.monitoring).toMatchObject({ modal_sampai: 2, belum_buka: 2, tunda: 1 });
  });

  it("push: perangkat, bermasalah, rilis/ingat tercatat; peringatan penjadwal bila lewat 15 menit tanpa catatan", () => {
    const r = susunPetugasQc({
      ...dasar,
      langganan: [
        { akun_id: 2, gagal: 0, terakhir_ok_at: null },
        { akun_id: 3, gagal: 5, terakhir_ok_at: null },
      ],
    });
    expect(r.petugas.find((p) => p.akun_id === 2)).toMatchObject({ perangkat: 1, push_bermasalah: false });
    expect(r.petugas.find((p) => p.akun_id === 3)).toMatchObject({ perangkat: 1, push_bermasalah: true });
    expect(r.monitoring).toMatchObject({ push_aktif: 2, push_rilis_dikirim: 0, penjadwal_terdeteksi: false, peringatan_penjadwal: true });

    const k = susunPetugasQc({
      ...dasar,
      kirim: [
        { akun_id: 2, jenis: "rilis", dibuat_at: "2026-10-29T07:01:00Z" },
        { akun_id: 2, jenis: "ingat_petugas", dibuat_at: "2026-10-29T07:20:00Z" },
        { akun_id: 3, jenis: "rilis", dibuat_at: "2026-10-29T07:01:00Z" },
      ],
    });
    expect(k.petugas.find((p) => p.akun_id === 2)).toMatchObject({ push_rilis_at: "2026-10-29T07:01:00Z", push_ingat: 1 });
    expect(k.monitoring).toMatchObject({ push_rilis_dikirim: 2, push_ingat_dikirim: 1, penjadwal_terdeteksi: true, peringatan_penjadwal: false });

    // belum 15 menit sejak rilis: belum ada peringatan
    const awal = susunPetugasQc({ ...dasar, now: new Date("2026-10-29T07:10:00Z") });
    expect(awal.monitoring.peringatan_penjadwal).toBe(false);
  });
});

describe("saringPetugas", () => {
  const r = susunPetugasQc({
    ...dasar,
    percobaan: [{ akun_id: 2, ke: 1, skor: 100, benar: 15, jumlah: 15, terlambat: false, selesai_at: "x" }],
    langganan: [{ akun_id: 2, gagal: 0, terakhir_ok_at: null }],
    kirim: [{ akun_id: 2, jenis: "rilis", dibuat_at: "2026-10-29T07:01:00Z" }],
    sesi: [{ akun_id: 3, terakhir_aktif_at: "2026-10-29T07:05:00Z" }],
  }).petugas;
  const base = { peran: "semua", status: "semua", pml: "semua", cari: "" } as const;
  const nama = (f: Partial<Parameters<typeof saringPetugas>[1]>) => saringPetugas(r, { ...base, ...f }).map((p) => p.nama);

  it("menurut peran, status, PML, dan nama", () => {
    expect(nama({})).toEqual(["Ayu", "Dana", "Ega", "Fitri"]);
    expect(nama({ peran: "pml" })).toEqual(["Ayu"]);
    expect(nama({ peran: "ppl", status: "lulus" })).toEqual(["Dana"]);
    expect(nama({ status: "belum_mengisi" })).toEqual(["Ayu", "Ega", "Fitri"]);
    expect(nama({ status: "belum_lulus" })).toEqual(["Ayu", "Ega", "Fitri"]);
    expect(nama({ status: "modal_belum" })).toEqual(["Ayu", "Fitri"]);
    expect(nama({ status: "tanpa_push" })).toEqual(["Ayu", "Ega", "Fitri"]);
    expect(nama({ status: "push_belum_dikirim" })).toEqual(["Ayu", "Ega", "Fitri"]);
    expect(nama({ pml: 1 })).toEqual(["Ayu", "Dana", "Ega", "Fitri"]);
    expect(nama({ cari: " eg " })).toEqual(["Ega"]);
  });
});
