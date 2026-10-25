// lib/keu/__tests__/pelaksanaan.test.ts
//
// (25 Okt 2026, tahap 31) Uji jembatan identifikasi lanjutan -> pelaksanaan: usulan penugasan, bahan, keselarasan jadwal, laporan harian, evaluasi, kesiapan Bendahara.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, normalisasi } from "../identifikasi";
import type { BarisRincian, IsiLanjutan } from "../lanjutan";
import {
  agendaEvaluasi, calonBelumTertaut, fungsiBawaan, kalimatHasilTerap, kesiapanBiaya, kesiapanPencairan, kodeSiap, normalisasiBahan, normalisasiHasilTerap, normalisasiUsulan,
  petugasBernama, ringkasLaporan, ringkasUsulan, selarasJadwal, urutkanUsulan, type CalonKegiatan, type KegiatanBahan,
} from "../pelaksanaan";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const isiDasar = (): IsiLanjutan => salin(vektor.base) as IsiLanjutan;

function keg(ubah?: (k: KegiatanBahan) => void): KegiatanBahan {
  const k: KegiatanBahan = {
    id: 1, kode: "uji", nama: "Kegiatan Uji", kode_anggaran: "x", jenis: "pendataan", aktif: true, mulai: "2026-03-01", selesai: "2026-03-15", fungsi: "pendataan", tarif: [], rapat_evaluasi: 0, presensi: 0,
    petugas: [
      { akun_id: 1, nama: "A", peran: "pml", aktif: true, maks_hari: null, kelas: null, hari_kerja: 3, laporan: 3, lapor_pertama: "2026-03-02", lapor_terakhir: "2026-03-04" },
      { akun_id: 2, nama: "B", peran: "ppl", aktif: true, maks_hari: null, kelas: null, hari_kerja: 4, laporan: 1, lapor_pertama: "2026-03-02", lapor_terakhir: "2026-03-02" },
      { akun_id: 3, nama: "C", peran: "ppl", aktif: true, maks_hari: null, kelas: null, hari_kerja: 0, laporan: 0, lapor_pertama: null, lapor_terakhir: null },
      { akun_id: 4, nama: "D", peran: "ppl", aktif: false, maks_hari: null, kelas: null, hari_kerja: 0, laporan: 0, lapor_pertama: null, lapor_terakhir: null },
    ],
  };
  ubah?.(k);
  return k;
}

describe("calon dan fungsi kegiatan", () => {
  const c = (id: number, nama: string, disarankan: boolean, aktif = true, tertaut = false): CalonKegiatan => ({ ident_id: 1, kegiatan_id: id, kode: `k${id}`, nama, kode_anggaran: null, jenis: null, aktif, mulai: null, selesai: null, disarankan, tertaut });
  it("yang disarankan dan aktif di atas; yang sudah tertaut tidak ditawarkan", () => {
    const hasil = calonBelumTertaut([c(1, "Zeta", false), c(2, "Alfa", true, false), c(3, "Beta", true), c(4, "Gamma", false, true, true)]);
    expect(hasil.map((x) => x.kegiatan_id)).toEqual([3, 2, 1]);
  });
  it("fungsi bawaan dari jenis kegiatan", () => {
    expect(fungsiBawaan("pelatihan")).toBe("pelatihan");
    expect(fungsiBawaan("Pendataan")).toBe("pendataan");
    expect(fungsiBawaan("rapat")).toBe("lain");
    expect(fungsiBawaan(null)).toBe("lain");
  });
});

describe("usulan penugasan", () => {
  const mentah = [
    { urut: 3, kode: "p3", nama: "C", peran_lanjutan: "ppl", peran_sigap: "ppl", calon: 1, akun_id: 3, akun_nama: "C", status: "tarif_belum", catatan: "x" },
    { urut: 1, kode: "p1", nama: "A", peran_lanjutan: "kortim", peran_sigap: "korwil", calon: 1, akun_id: 1, akun_nama: "A", status: "siap", catatan: "" },
    { urut: 2, kode: "p2", nama: "B", peran_lanjutan: "pml", peran_sigap: "pml", calon: 1, akun_id: "2", akun_nama: "B", status: "sudah_ada", catatan: "" },
    { urut: 4, kode: "p4", nama: "", peran_lanjutan: null, peran_sigap: null, calon: 0, akun_id: null, akun_nama: null, status: "menyusul", catatan: "" },
    { urut: 5, kode: "p5", nama: "E", peran_lanjutan: "ppl", peran_sigap: "ppl", calon: 2, akun_id: null, akun_nama: null, status: "ambigu", catatan: "" },
    { urut: 6, kode: "p6", nama: "F", peran_lanjutan: "ppl", peran_sigap: "ppl", calon: 0, akun_id: null, akun_nama: null, status: "tidak_ada", catatan: "" },
    { urut: 7, kode: "p7", nama: "G", peran_lanjutan: null, peran_sigap: null, calon: 0, akun_id: null, akun_nama: null, status: "peran_kosong", catatan: "" },
    { urut: 8, kode: "p8", nama: "H", peran_lanjutan: "ppl", peran_sigap: "ppl", calon: 0, akun_id: null, akun_nama: null, status: "bukan_status", catatan: "" },
    "bukan objek",
  ];
  it("menormalkan masukan, membuang yang tidak dikenal, dan mengubah angka teks", () => {
    const d = normalisasiUsulan(mentah);
    expect(d).toHaveLength(7);
    expect(d.find((x) => x.kode === "p2")?.akun_id).toBe(2);
    expect(normalisasiUsulan(null)).toEqual([]);
    expect(normalisasiUsulan({})).toEqual([]);
  });
  it("urutan: siap, sudah ditugaskan, lalu yang perlu tindakan", () => {
    const d = urutkanUsulan(normalisasiUsulan(mentah));
    expect(d.map((x) => x.status)).toEqual(["siap", "sudah_ada", "tarif_belum", "ambigu", "tidak_ada", "peran_kosong", "menyusul"]);
  });
  it("ringkasan dan kode siap", () => {
    const d = normalisasiUsulan(mentah);
    expect(ringkasUsulan(d)).toEqual({ total: 7, siap: 1, sudahAda: 1, perluTindakan: 4, menyusul: 1 });
    expect(kodeSiap(d)).toEqual(["p1"]);
  });
  it("hasil penerapan", () => {
    const h = normalisasiHasilTerap({ ditambah: 2, dilewati: [{ kode: "p2", status: "sudah_ada" }, { kode: "*", status: "kode_tak_dikenal", jumlah: 3 }], lanjutan_ver: 4 });
    expect(h).not.toBeNull();
    expect(kalimatHasilTerap(h!)).toBe("2 penugasan ditambahkan dari lanjutan versi 4. 1 petugas dilewati (sudah ditugaskan atau perlu tindakan). 3 kode petugas tidak dikenal.");
    expect(normalisasiHasilTerap("x")).toBeNull();
    expect(kalimatHasilTerap(normalisasiHasilTerap({ ditambah: 0, dilewati: [], lanjutan_ver: 1 })!)).toBe("0 penugasan ditambahkan dari lanjutan versi 1.");
  });
});

describe("bahan pelaksanaan", () => {
  it("menormalkan bentuk dari basis data (angka teks, nilai kosong, fungsi tak dikenal)", () => {
    const b = normalisasiBahan({
      ident_id: 7, ro_kode: "2906.BMA.001", tahun: 2026, dibuat_at: "2026-12-10T00:00:00Z", realisasi_sampai: "2026-12-10",
      kegiatan: [{ id: 9, kode: "k", nama: "N", kode_anggaran: null, jenis: "pendataan", aktif: true, mulai: "2026-12-01", selesai: "2026-12-15", fungsi: "aneh", rapat_evaluasi: "1", presensi: 2,
        tarif: [{ peran: "pml", tarif: "170000", maks_hari: null }], petugas: [{ akun_id: 4, nama: "Akun 4", peran: "pml", aktif: true, maks_hari: null, kelas: null, hari_kerja: 3, laporan: 2, lapor_pertama: "2026-12-02", lapor_terakhir: "2026-12-03" }, 5] }],
      realisasi: [{ akun: "524113", pagu: "1500000", real_sd: 500000, sisa: 1000000 }],
    });
    expect(b?.kegiatan[0].fungsi).toBe("lain");
    expect(b?.kegiatan[0].rapat_evaluasi).toBe(1);
    expect(b?.kegiatan[0].tarif[0].tarif).toBe(170000);
    expect(b?.kegiatan[0].petugas).toHaveLength(1);
    expect(b?.realisasi[0].pagu).toBe(1500000);
    expect(normalisasiBahan(null)).toBeNull();
    expect(normalisasiBahan([])).toBeNull();
    expect(normalisasiBahan({})?.kegiatan).toEqual([]);
  });
});

describe("keselarasan jadwal", () => {
  const jadwal = [
    { periode: "Triwulan I", mulai: "2026-03-01", selesai: "2026-03-15" },
    { periode: "Triwulan II", mulai: "2026-06-01", selesai: "2026-06-15" },
    { periode: "Kosong", mulai: "", selesai: "" },
  ];
  it("sama persis -> hijau", () => {
    const r = selarasJadwal({ mulai: "2026-03-01", selesai: "2026-03-15" }, jadwal);
    expect(r).toEqual([{ nada: "hijau", pesan: "Periode kegiatan sama dengan jendela pendataan Triwulan I (01/03/2026 s.d. 15/03/2026)." }]);
  });
  it("memilih jendela dengan irisan terbesar dan menyebut selisih hari", () => {
    const r = selarasJadwal({ mulai: "2026-03-04", selesai: "2026-03-20" }, jadwal);
    expect(r).toHaveLength(2);
    expect(r[0].pesan).toContain("3 hari lebih lambat");
    expect(r[0].pesan).toContain("Triwulan I");
    expect(r[1].pesan).toContain("5 hari lebih lambat");
    const lebihAwal = selarasJadwal({ mulai: "2026-02-27", selesai: "2026-03-10" }, jadwal);
    expect(lebihAwal[0].pesan).toContain("2 hari lebih awal");
    expect(lebihAwal[1].pesan).toContain("5 hari lebih awal");
  });
  it("tidak beririsan, tanpa periode kegiatan, atau jadwal belum lengkap", () => {
    expect(selarasJadwal({ mulai: "2026-09-01", selesai: "2026-09-10" }, jadwal)[0].pesan).toContain("tidak beririsan");
    expect(selarasJadwal({ mulai: null, selesai: null }, jadwal)[0].nada).toBe("kuning");
    expect(selarasJadwal({ mulai: "2026-03-01", selesai: "2026-03-02" }, [{ periode: "x", mulai: "", selesai: "" }])[0].nada).toBe("abu");
  });
  it("irisan satu hari tetap dihitung", () => {
    const r = selarasJadwal({ mulai: "2026-03-15", selesai: "2026-03-30" }, jadwal);
    expect(r[0].pesan).toContain("14 hari lebih lambat");
  });
});

describe("ringkasan laporan harian", () => {
  it("sebelum mulai: tanpa peringatan hari kerja", () => {
    const r = ringkasLaporan(keg(), "2026-02-20");
    expect(r.petugasAktif).toBe(3);
    expect(r.sudahMulai).toBe(false);
    expect(r.nada).toBe("hijau");
    expect(r.catatan).toEqual([]);
  });
  it("sedang berjalan: petugas tanpa hari kerja diperingatkan", () => {
    const r = ringkasLaporan(keg(), "2026-03-05");
    expect(r.tanpaHariKerja).toBe(1);
    expect(r.nada).toBe("kuning");
    expect(r.catatan).toEqual(["1 petugas belum memilih hari kerja."]);
    expect(r.hariKerja).toBe(7);
    expect(r.laporan).toBe(4);
  });
  it("sesudah berakhir: laporan kurang dari hari kerja -> merah", () => {
    const r = ringkasLaporan(keg(), "2026-03-20");
    expect(r.kurangLapor).toBe(1);
    expect(r.nada).toBe("merah");
    expect(r.catatan).toContain("1 petugas memiliki laporan harian lebih sedikit dari hari kerja yang dipilih.");
  });
  it("tanpa petugas aktif, dan kegiatan nonaktif", () => {
    const r = ringkasLaporan(keg((k) => { k.petugas = []; k.aktif = false; }), "2026-03-05");
    expect(r.nada).toBe("abu");
    expect(r.catatan).toEqual(["Belum ada petugas aktif pada kegiatan ini.", "Kegiatan berstatus nonaktif."]);
  });
});

describe("agenda evaluasi", () => {
  const f = (() => { const x = awalForm(); x.nama = "UJI"; x.periode = "Triwulanan"; x.keList = ["Triwulan I"]; x.instrumen = "FASIH"; return normalisasi(x); })();
  it("memuat bahan evaluasi dari identifikasi", () => {
    const a = agendaEvaluasi(f, [], "2026-03-20");
    expect(a.butir[0]).toContain("Rapat evaluasi (wajib)");
    expect(a.nada).toBe("abu");
    expect(a.pesan).toContain("Belum ada kegiatan tertaut");
  });
  it("rapat tercatat -> hijau; berakhir tanpa rapat -> kuning; belum berakhir -> abu", () => {
    expect(agendaEvaluasi(f, [keg((k) => { k.rapat_evaluasi = 2; })], "2026-03-20").nada).toBe("hijau");
    const lewat = agendaEvaluasi(f, [keg()], "2026-03-20");
    expect(lewat.nada).toBe("kuning");
    expect(lewat.pesan).toContain("Kegiatan Uji sudah berakhir");
    expect(agendaEvaluasi(f, [keg()], "2026-03-10").nada).toBe("abu");
  });
});

describe("kesiapan Bendahara: biaya dibanding pagu", () => {
  const baris = (akun: string, jumlah: number | null): BarisRincian => ({ kelompok: "Translok dan penginapan", uraian: "x", akun, volume: null, satuan: "orang", tarif: null, jumlah, catatan: "", perk: false });
  it("cukup, kurang, belum dihitung, dan tanpa pagu", () => {
    const rincian = [baris("524113", 400000), baris("524113", 100000), baris("524113", null), baris("521211", 900000), baris("524114", null), baris("524119", 50000)];
    const r = kesiapanBiaya(rincian, [{ akun: "524113", pagu: 1500000, real_sd: 500000, sisa: 1000000 }, { akun: "521211", pagu: 200000, real_sd: 0, sisa: 200000 }], "2026-12-10");
    expect(r.adaLaporan).toBe(true);
    const peta = Object.fromEntries(r.baris.map((b) => [b.akun, b]));
    expect(peta["524113"].status).toBe("cukup");
    expect(peta["524113"].kebutuhan).toBe(500000);
    expect(peta["524113"].catatan).toContain("Belum termasuk 1 baris");
    expect(peta["521211"].status).toBe("kurang");
    expect(peta["521211"].nada).toBe("merah");
    expect(peta["521211"].catatan).toContain("melebihi sisa pagu");
    expect(peta["524114"].status).toBe("belum_dihitung");
    expect(peta["524119"].status).toBe("tanpa_pagu");
    expect(peta["524119"].catatan).toContain("tidak ditemukan pada laporan realisasi");
    expect(r.kurang).toBe(1);
    expect(r.baris.map((b) => b.akun)).toEqual(["521211", "524113", "524114", "524119"]);
  });
  it("tanpa laporan realisasi sama sekali", () => {
    const r = kesiapanBiaya([baris("524113", 100)], [], null);
    expect(r.adaLaporan).toBe(false);
    expect(r.baris[0].status).toBe("tanpa_pagu");
    expect(r.baris[0].catatan).toContain("Belum ada laporan realisasi");
  });
});

describe("kesiapan Bendahara: syarat pencairan", () => {
  it("menghitung petugas bernama", () => {
    const isi = isiDasar();
    expect(petugasBernama(isi)).toBe(4);
    isi.petugas[0].menyusul = true;
    isi.petugas[1].nama = "   ";
    expect(petugasBernama(isi)).toBe(2);
    expect(petugasBernama(null)).toBe(0);
  });
  it("semua siap", () => {
    const r = kesiapanPencairan({ isi: isiDasar(), status: "final", kebijakanVer: 2, kegiatanTertaut: 1, penugasanSigap: 4, suratTerbit: 4, biaya: { adaLaporan: true, kurang: 0 } });
    expect(r.map((b) => b.siap)).toEqual([true, true, true, true, true, true]);
  });
  it("belum siap dan belum diketahui", () => {
    const r = kesiapanPencairan({ isi: isiDasar(), status: "draf", kebijakanVer: null, kegiatanTertaut: 0, penugasanSigap: 1, suratTerbit: 0, biaya: { adaLaporan: false, kurang: 0 } });
    expect(r.map((b) => b.siap)).toEqual([false, false, false, false, false, null]);
    expect(r[3].ket).toBe("1 dari 4 petugas bernama sudah punya penugasan.");
    expect(r[4].ket).toBe("0 dari 4 petugas bernama sudah memiliki dokumen terbit.");
    expect(r[5].ket).toBe("Belum ada laporan realisasi diunggah.");
  });
  it("tanpa lanjutan", () => {
    const r = kesiapanPencairan({ isi: null, status: null, kebijakanVer: null, kegiatanTertaut: 0, penugasanSigap: 0, suratTerbit: 0, biaya: null });
    expect(r[0].ket).toBe("Belum ada identifikasi lanjutan.");
    expect(r[3].siap).toBeNull();
    expect(r[4].siap).toBeNull();
    expect(r[5].ket).toBe("Rincian biaya belum tersedia.");
  });
  it("kekurangan pagu menandai butir terakhir belum siap", () => {
    const r = kesiapanPencairan({ isi: isiDasar(), status: "final", kebijakanVer: 1, kegiatanTertaut: 1, penugasanSigap: 4, suratTerbit: 4, biaya: { adaLaporan: true, kurang: 2 } });
    expect(r[5].siap).toBe(false);
    expect(r[5].ket).toBe("2 akun kebutuhannya melebihi sisa pagu.");
  });
});
