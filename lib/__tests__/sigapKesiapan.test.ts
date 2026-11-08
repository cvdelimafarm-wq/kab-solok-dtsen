// lib/__tests__/sigapKesiapan.test.ts
// (8 Nov 2026) Uji fungsi murni kartu Kesiapan Kelola Pelatihan.
import { describe, expect, it } from "vitest";
import { FOTO_PER_HARI_PER_KELAS, daftarTanggal, hitungKesiapan, tanggalWib, tglPendek, type MasukanKesiapan } from "../sigapKesiapan";
import { TAB_KELOLA, petakanTab } from "../sigapKelolaTab";

const SEKARANG = new Date("2026-11-01T00:00:00Z"); // 1 Nov 07.00 WIB -> H-8

/** Masukan dasar: semua butir wajib hijau. Pelatihan 9-10 Nov 2026, 1 kelas. */
function dasar(ubah: Partial<MasukanKesiapan> = {}): MasukanKesiapan {
  const hari = ["2026-11-09", "2026-11-10"];
  return {
    mulai: "2026-11-09",
    selesai: "2026-11-10",
    penugasan: [
      { akun_id: 1, nama: "Ani", peran: "ppl", aktif: true, kelas: 1 },
      { akun_id: 2, nama: "Budi", peran: "ppl", aktif: true, kelas: 1 },
      { akun_id: 3, nama: "Cici", peran: "panitia", aktif: true, kelas: null },
    ],
    hariKerja: [1, 2, 3].flatMap((a) => hari.map((t) => ({ akun_id: a, tanggal: t }))),
    bentrok: [],
    respons: [1, 2],
    hierarki: [{ akun_id: 1, atasan: 3 }, { akun_id: 2, atasan: 3 }],
    kelas: [1],
    instruktur: [{ akun_id: 4, kelas: 1 }],
    tes: [
      { jenis: "pretest", jumlah_soal: 10, aktif: true, buka_at: "2026-11-09T00:00:00Z", tutup_at: "2026-11-09T03:00:00Z" },
      { jenis: "posttest", jumlah_soal: 10, aktif: true, buka_at: "2026-11-10T01:00:00Z", tutup_at: "2026-11-10T03:00:00Z" },
    ],
    skema: { tersimpan: true, totalBobot: 100 },
    presensi: { titikAktif: 1 },
    materi: 1,
    berkas: 1,
    pengumuman: 1,
    tarifPeran: ["ppl", "panitia", "instruktur"],
    foto: [{ kelas: 1, jumlah: FOTO_PER_HARI_PER_KELAS * 2 }],
    undanganBernomor: 1,
    agenda: [{ jenis: "pretest", kelas: 1 }, { jenis: "posttest", kelas: 1 }],
    sekarang: SEKARANG,
    ...ubah,
  };
}
const cari = (m: MasukanKesiapan, kode: string) => {
  const b = hitungKesiapan(m).butir.find((x) => x.kode === kode);
  if (!b) throw new Error(`butir ${kode} tidak ada`);
  return b;
};

describe("pembantu tanggal", () => {
  it("tanggalWib memakai WIB (UTC+7)", () => {
    expect(tanggalWib(new Date("2026-11-08T17:30:00Z"))).toBe("2026-11-09");
    expect(tanggalWib(new Date("2026-11-08T16:59:00Z"))).toBe("2026-11-08");
  });
  it("daftarTanggal: rentang, satu hari, kosong", () => {
    expect(daftarTanggal("2026-11-09", "2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(daftarTanggal("2026-11-09", null)).toEqual(["2026-11-09"]);
    expect(daftarTanggal(null, null)).toEqual([]);
  });
  it("tglPendek", () => {
    expect(tglPendek("2026-11-09")).toBe("9 Nov");
  });
});

describe("hitungKesiapan", () => {
  it("semua wajib hijau -> siap, 6 butir wajib", () => {
    const h = hitungKesiapan(dasar());
    expect(h.wajibTotal).toBe(6);
    expect(h.wajibOk).toBe(6);
    expect(h.siap).toBe(true);
    expect(h.hariKe).toBe(8);
    expect(h.mendesak).toBe(false);
    expect(h.butir.map((b) => b.status).every((s) => s === "ok")).toBe(true);
  });

  it("butir wajib gagal jauh dari hari H = kuning, lencana belum siap", () => {
    const m = dasar({ penugasan: dasar().penugasan.filter((p) => p.peran !== "panitia") });
    const h = hitungKesiapan(m);
    expect(cari(m, "panitia").status).toBe("kuning");
    expect(h.siap).toBe(false);
    expect(h.wajibOk).toBe(h.wajibTotal - 1);
  });

  it("mulai H-3 butir wajib gagal berubah merah; H-4 masih kuning", () => {
    const tanpaPanitia = { penugasan: dasar().penugasan.filter((p) => p.peran !== "panitia") };
    const h4 = dasar({ ...tanpaPanitia, sekarang: new Date("2026-11-05T00:00:00Z") });
    expect(hitungKesiapan(h4).hariKe).toBe(4);
    expect(cari(h4, "panitia").status).toBe("kuning");
    const h3 = dasar({ ...tanpaPanitia, sekarang: new Date("2026-11-06T00:00:00Z") });
    expect(hitungKesiapan(h3).hariKe).toBe(3);
    expect(hitungKesiapan(h3).mendesak).toBe(true);
    expect(cari(h3, "panitia").status).toBe("merah");
  });

  it("pelatihan sedang berlangsung = mendesak", () => {
    const sedang = hitungKesiapan(dasar({ sekarang: new Date("2026-11-09T05:00:00Z") }));
    expect(sedang.hariKe).toBe(0);
    expect(sedang.mendesak).toBe(true);
  });

  it("sudah berakhir (hari terakhir lewat) = tidak lagi mendesak, tetapi butir wajib tetap dilaporkan", () => {
    const tanpaPanitia = { penugasan: dasar().penugasan.filter((p) => p.peran !== "panitia") };
    const hari2 = hitungKesiapan(dasar({ ...tanpaPanitia, sekarang: new Date("2026-11-10T05:00:00Z") })); // hari terakhir
    expect(hari2.berakhir).toBe(false);
    expect(hari2.mendesak).toBe(true);
    const lewat = dasar({ ...tanpaPanitia, sekarang: new Date("2026-11-12T05:00:00Z") });
    const h = hitungKesiapan(lewat);
    expect(h.hariKe).toBeLessThan(0);
    expect(h.berakhir).toBe(true);
    expect(h.mendesak).toBe(false);
    expect(cari(lewat, "panitia").status).toBe("kuning");
    expect(h.siap).toBe(false);
  });

  it("butir non-wajib tidak menggagalkan lencana Siap", () => {
    const m = dasar({ respons: [], hierarki: [], materi: 0, berkas: 0, pengumuman: 0, undanganBernomor: 0 });
    const h = hitungKesiapan(m);
    expect(h.siap).toBe(true);
    expect(cari(m, "undangan_respons").status).toBe("kuning");
    expect(cari(m, "hierarki").status).toBe("kuning");
    expect(cari(m, "undangan_nomor").status).toBe("kuning");
    expect(cari(m, "materi").status).toBe("info");
  });

  it("saklar tes mati / soal kosong = Pretest-Posttest belum siap tayang", () => {
    const mati = dasar({ tes: dasar().tes.map((t) => (t.jenis === "pretest" ? { ...t, aktif: false } : t)) });
    expect(cari(mati, "tes_tayang").status).toBe("kuning");
    expect(cari(mati, "tes_tayang").rincian.join(" ")).toContain("saklar mati");
    const kosong = dasar({ tes: dasar().tes.map((t) => (t.jenis === "posttest" ? { ...t, jumlah_soal: 0 } : t)) });
    expect(cari(kosong, "tes_tayang").status).toBe("kuning");
    const hilang = dasar({ tes: dasar().tes.filter((t) => t.jenis !== "posttest") });
    expect(cari(hilang, "tes_tayang").rincian.join(" ")).toContain("belum dibuat");
  });

  it("jadwal tes: di luar tanggal, jam sama persis, posttest sebelum pretest ditutup", () => {
    const luar = dasar({ agenda: [], tes: dasar().tes.map((t) => (t.jenis === "pretest" ? { ...t, buka_at: "2026-11-20T00:00:00Z", tutup_at: "2026-11-20T03:00:00Z" } : t)) });
    expect(cari(luar, "jadwal_tes").status).toBe("kuning");
    const sama = dasar({ agenda: [], tes: dasar().tes.map((t) => ({ ...t, buka_at: "2026-11-09T00:00:00Z", tutup_at: "2026-11-09T03:00:00Z" })) });
    expect(cari(sama, "jadwal_tes").rincian.join(" ")).toContain("jam yang sama");
    const tumpang = dasar({ agenda: [], tes: dasar().tes.map((t) => (t.jenis === "posttest" ? { ...t, buka_at: "2026-11-09T01:00:00Z", tutup_at: "2026-11-09T05:00:00Z" } : t)) });
    expect(cari(tumpang, "jadwal_tes").rincian.join(" ")).toContain("sebelum Pretest ditutup");
  });

  it("agenda sesi: tanpa data = info; belum diatur = kuning; lengkap = hijau dan jam sama persis tak diperingatkan", () => {
    expect(cari(dasar({ agenda: undefined }), "agenda_sesi").status).toBe("info");
    expect(cari(dasar({ agenda: undefined }), "agenda_sesi").wajib).toBe(false);
    expect(cari(dasar(), "agenda_sesi").status).toBe("ok");
    const kosong = dasar({ agenda: [] });
    expect(cari(kosong, "agenda_sesi").status).toBe("kuning");
    expect(cari(kosong, "agenda_sesi").rincian).toEqual(["Pretest kelas 1 belum diatur dimulai instruktur", "Posttest kelas 1 belum diatur dimulai instruktur"]);
    expect(cari(kosong, "agenda_sesi").tab).toBe("harih");
    expect(cari(kosong, "agenda_sesi").sub).toBe("agenda");
    const separuh = dasar({ agenda: [{ jenis: "pretest", kelas: 1 }] });
    expect(cari(separuh, "agenda_sesi").rincian).toEqual(["Posttest kelas 1 belum diatur dimulai instruktur"]);
    const penuh = dasar({ agenda: [{ jenis: "pretest", kelas: 1 }, { jenis: "posttest", kelas: 1 }] });
    expect(cari(penuh, "agenda_sesi").status).toBe("ok");
    const sama = dasar({ agenda: penuh.agenda, tes: dasar().tes.map((t) => ({ ...t, buka_at: "2026-11-09T00:00:00Z", tutup_at: "2026-11-09T03:00:00Z" })) });
    expect(cari(sama, "jadwal_tes").status).toBe("ok");
    const samaTanpaAgenda = dasar({ agenda: [], tes: sama.tes });
    expect(cari(samaTanpaAgenda, "jadwal_tes").status).toBe("kuning");
  });

  it("agenda sesi: tes tanpa soal tidak dihitung; dua kelas harus diatur dua-duanya", () => {
    const tanpaSoal = dasar({ agenda: [], tes: dasar().tes.map((t) => ({ ...t, jumlah_soal: 0 })) });
    expect(cari(tanpaSoal, "agenda_sesi").status).toBe("info");
    const duaKelas = dasar({ kelas: [1, 2], agenda: [{ jenis: "pretest", kelas: 1 }, { jenis: "posttest", kelas: 1 }] });
    expect(cari(duaKelas, "agenda_sesi").rincian).toEqual(["Pretest kelas 2 belum diatur dimulai instruktur", "Posttest kelas 2 belum diatur dimulai instruktur"]);
  });

  it("hari kerja: kekurangan dicatat per orang; hari yang bentrok tidak dihitung ganda", () => {
    const tanpaAni = dasar({ hariKerja: dasar().hariKerja.filter((h) => !(h.akun_id === 1 && h.tanggal === "2026-11-09")) });
    expect(cari(tanpaAni, "hari_kerja").status).toBe("kuning");
    expect(cari(tanpaAni, "hari_kerja").rincian).toEqual(["Ani: 1 hari belum ada"]);
    const bentrok = { ...tanpaAni, bentrok: [{ akun_id: 1, nama: "Ani", tanggal: "2026-11-09", kegiatan: "Seruti TW IV" }] };
    expect(cari(bentrok, "hari_kerja").status).toBe("ok");
    expect(cari(bentrok, "bentrokan").status).toBe("kuning");
    expect(cari(bentrok, "bentrokan").rincian[0]).toContain("Seruti TW IV");
  });

  it("kelas tanpa instruktur / belum ada kelas", () => {
    const m = dasar({ kelas: [1, 2] });
    expect(cari(m, "kelas_instruktur").status).toBe("kuning");
    expect(cari(m, "kelas_instruktur").rincian).toEqual(["Kelas 2 belum punya instruktur"]);
    expect(cari(dasar({ kelas: [] }), "kelas_instruktur").ringkas).toBe("Belum ada kelas");
  });

  it("skema nilai: belum disimpan = info; bobot salah = kuning", () => {
    expect(cari(dasar({ skema: { tersimpan: false, totalBobot: null } }), "skema_nilai").status).toBe("info");
    expect(cari(dasar({ skema: { tersimpan: true, totalBobot: 90 } }), "skema_nilai").status).toBe("kuning");
  });

  it("tarif: peran tanpa tarif dilaporkan, instruktur ikut bila ada", () => {
    const m = dasar({ tarifPeran: ["ppl"] });
    expect(cari(m, "tarif").status).toBe("kuning");
    expect(cari(m, "tarif").ringkas).toContain("PANITIA");
    expect(cari(m, "tarif").ringkas).toContain("INSTRUKTUR");
  });

  it("foto: kurang sebelum mulai = info, sesudah mulai = kuning, cukup = ok", () => {
    const kurang = { foto: [{ kelas: 1, jumlah: 3 }] };
    expect(cari(dasar(kurang), "foto_pelaksanaan").status).toBe("info");
    expect(cari(dasar({ ...kurang, sekarang: new Date("2026-11-09T05:00:00Z") }), "foto_pelaksanaan").status).toBe("kuning");
    expect(cari(dasar(), "foto_pelaksanaan").status).toBe("ok");
  });
  it("foto per hari: hari yang belum berjalan tidak ditagih; hari berjalan yang kurang = kuning", () => {
    const hariPertamaLengkap = Array.from({ length: 4 }, () => ({ kelas: 1, tanggal: "2026-11-09" }));
    // 9 Nov berjalan, 10 Nov belum: hari pertama lengkap -> ok
    const jalan = { sekarang: new Date("2026-11-09T05:00:00Z"), foto: [{ kelas: 1, jumlah: 4 }], fotoHari: hariPertamaLengkap };
    expect(cari(dasar(jalan), "foto_pelaksanaan").status).toBe("ok");
    // hari pertama baru 3 -> kuning
    expect(cari(dasar({ ...jalan, fotoHari: hariPertamaLengkap.slice(0, 3) }), "foto_pelaksanaan").status).toBe("kuning");
    // 10 Nov sudah berjalan, hari kedua kosong -> kuning, rincian per hari
    const b = cari(dasar({ ...jalan, sekarang: new Date("2026-11-10T05:00:00Z") }), "foto_pelaksanaan");
    expect(b.status).toBe("kuning");
    expect(b.rincian[0]).toBe("Kelas 1: hari 1 4/4, hari 2 0/4");
  });
  it("foto lama tanpa tanggal dihitung hari pertama", () => {
    const lama = Array.from({ length: 4 }, () => ({ kelas: 1, tanggal: null }));
    expect(cari(dasar({ sekarang: new Date("2026-11-09T05:00:00Z"), foto: [{ kelas: 1, jumlah: 4 }], fotoHari: lama }), "foto_pelaksanaan").status).toBe("ok");
  });

  it("tanpa tanggal: tidak mendesak dan tidak error", () => {
    const h = hitungKesiapan(dasar({ mulai: null, selesai: null, hariKerja: [] }));
    expect(h.hariKe).toBeNull();
    expect(h.mendesak).toBe(false);
    expect(cari(dasar({ mulai: null, selesai: null }), "hari_kerja").ringkas).toBe("Tanggal pelatihan belum diisi");
  });

  it("peserta nonaktif tidak dihitung dan dilaporkan", () => {
    const m = dasar({ penugasan: [...dasar().penugasan, { akun_id: 9, nama: "Dedi", peran: "ppl", aktif: false, kelas: 1 }] });
    expect(cari(m, "peserta_aktif").status).toBe("kuning");
    expect(cari(m, "hari_kerja").status).toBe("ok");
  });

  it("setiap butir menunjuk tab baru yang sah, dan tidak perlu dialihkan lagi", () => {
    for (const b of hitungKesiapan(dasar()).butir) {
      expect(TAB_KELOLA, b.kode).toContain(b.tab);
      expect(petakanTab(b.tab, b.sub), b.kode).toEqual({ tab: b.tab, sub: b.sub });
    }
  });
});
