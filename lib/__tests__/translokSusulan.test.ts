import { describe, expect, it } from "vitest";
import {
  JENDELA_SUSULAN_JAM, MAKS_TANGGAL_KANDIDAT, bolehMemutuskanSusulan, cekAlasanSusulan, cekPengajuan, izinSampaiIso, penyetujuDuaLevel, pesanKeputusanSusulan,
  pesanPengajuanSusulan, sisaJendelaTeks, statusTampil, susunLevel, tanggalIndo, tanggalKandidat, tanggalValid, urutkanSusulan, type FaktaPengajuan,
} from "@/lib/translokSusulan";

const dasar: FaktaPengajuan = {
  tanggal: "2026-11-01",
  hariIni: "2026-11-03",
  periode: { mulai: "2026-10-10", selesai: "2026-11-10" },
  jenisKegiatan: "pendataan",
  dikunci: false,
  arsip: false,
  diblokir: false,
  adaHariKerja: false,
  dipakaiKegiatanLain: false,
  jumlahHariKerjaAktif: 10,
  maksHari: 25,
  lengkap: false,
  izinAktif: false,
  pengajuanTerbuka: false,
};
const f = (o: Partial<FaktaPengajuan>): FaktaPengajuan => ({ ...dasar, ...o });

describe("cekPengajuan: empat kasus pemilik", () => {
  it("1. hari kerja ada tetapi terlewat -> mode lengkapi", () => {
    expect(cekPengajuan(f({ adaHariKerja: true }))).toEqual({ ok: true, mode: "lengkapi" });
  });
  it("2. hari kerja ada, dokumen kurang (belum lengkap) -> mode lengkapi", () => {
    expect(cekPengajuan(f({ adaHariKerja: true, lengkap: false }))).toEqual({ ok: true, mode: "lengkapi" });
  });
  it("4. hari belum pernah dipilih -> mode tambah (hari kerja dibuat saat disetujui)", () => {
    expect(cekPengajuan(f({ adaHariKerja: false }))).toEqual({ ok: true, mode: "tambah" });
  });
  it("hari kerja yang sudah lengkap tidak perlu disusulkan", () => {
    const h = cekPengajuan(f({ adaHariKerja: true, lengkap: true }));
    expect(h.ok).toBe(false);
  });
});

describe("cekPengajuan: penolakan", () => {
  const tolak = (o: Partial<FaktaPengajuan>) => {
    const h = cekPengajuan(f(o));
    expect(h.ok).toBe(false);
    return h.ok ? "" : h.pesan;
  };
  it("hari ini dan mendatang bukan susulan (3: langsung pilih/isi)", () => {
    expect(tolak({ tanggal: "2026-11-03" })).toMatch(/sudah lewat/);
    expect(tolak({ tanggal: "2026-11-09" })).toMatch(/sudah lewat/);
  });
  it("di luar periode", () => {
    expect(tolak({ tanggal: "2026-10-09" })).toMatch(/luar periode/);
    expect(tolak({ periode: { mulai: "2026-10-10", selesai: "2026-10-31" }, tanggal: "2026-11-01" })).toMatch(/luar periode/);
  });
  it("periode belum ditetapkan", () => {
    expect(tolak({ periode: { mulai: null, selesai: null } })).toMatch(/belum ditetapkan/);
  });
  it("SPJ dikunci, kegiatan arsip, diblokir, pelatihan", () => {
    expect(tolak({ dikunci: true })).toMatch(/dikunci/);
    expect(tolak({ arsip: true })).toMatch(/arsip/);
    expect(tolak({ diblokir: true })).toMatch(/diblokir/);
    expect(tolak({ jenisKegiatan: "pelatihan" })).toMatch(/pelatihan/);
  });
  it("tanggal dipakai kegiatan lain; izin sudah aktif; sudah ada pengajuan terbuka", () => {
    expect(tolak({ dipakaiKegiatanLain: true })).toMatch(/kegiatan lain/);
    expect(tolak({ izinAktif: true, adaHariKerja: true })).toMatch(/izin susulan/);
    expect(tolak({ pengajuanTerbuka: true })).toMatch(/menunggu/);
  });
  it("kuota hari kerja penuh hanya menolak mode tambah, bukan mode lengkapi", () => {
    expect(tolak({ jumlahHariKerjaAktif: 25, maksHari: 25 })).toMatch(/Kuota/);
    expect(cekPengajuan(f({ jumlahHariKerjaAktif: 25, maksHari: 25, adaHariKerja: true }))).toEqual({ ok: true, mode: "lengkapi" });
    expect(cekPengajuan(f({ jumlahHariKerjaAktif: 99, maksHari: null }))).toEqual({ ok: true, mode: "tambah" });
  });
  it("tanggal tak valid", () => {
    expect(tolak({ tanggal: "2026-13-40" })).toMatch(/tidak valid/);
  });
});

describe("tanggalValid / alasan", () => {
  it("menolak format dan tanggal mustahil", () => {
    expect(tanggalValid("2026-11-03")).toBe(true);
    expect(tanggalValid("2026-02-30")).toBe(false);
    expect(tanggalValid("03-11-2026")).toBe(false);
    expect(tanggalValid(20261103)).toBe(false);
  });
  it("alasan minimal 10 huruf, spasi dirapikan", () => {
    expect(cekAlasanSusulan("sakit").ok).toBe(false);
    expect(cekAlasanSusulan("   ").ok).toBe(false);
    const a = cekAlasanSusulan("  HP   rusak  sehari, foto tidak  terkirim ");
    expect(a.ok && a.alasan).toBe("HP rusak sehari, foto tidak terkirim");
  });
});

describe("jendela susulan 24 jam", () => {
  it("izin berlaku tepat 24 jam sejak disetujui", () => {
    const t = Date.UTC(2026, 10, 3, 10, 0, 0);
    expect(izinSampaiIso(t)).toBe("2026-11-04T10:00:00.000Z");
    expect(JENDELA_SUSULAN_JAM).toBe(24);
  });
  it("sisa jendela dan status tampil", () => {
    const sekarang = Date.UTC(2026, 10, 3, 10, 0, 0);
    expect(sisaJendelaTeks("2026-11-03T15:20:00.000Z", sekarang)).toBe("sisa 5 jam 20 menit");
    expect(sisaJendelaTeks("2026-11-03T10:40:00.000Z", sekarang)).toBe("sisa 40 menit");
    expect(sisaJendelaTeks("2026-11-03T12:00:00.000Z", sekarang)).toBe("sisa 2 jam");
    expect(sisaJendelaTeks("2026-11-03T09:00:00.000Z", sekarang)).toBe("berakhir");
    expect(sisaJendelaTeks(null, sekarang)).toBe("");
    const aktif = statusTampil({ status: "disetujui", izin_sampai: "2026-11-04T10:00:00.000Z", keputusan_oleh: "Widya", keputusan_catatan: null }, sekarang);
    expect(aktif.aktif).toBe(true);
    expect(aktif.nada).toBe("hijau");
    const lewat = statusTampil({ status: "disetujui", izin_sampai: "2026-11-02T10:00:00.000Z", keputusan_oleh: "Widya", keputusan_catatan: null }, sekarang);
    expect(lewat.aktif).toBe(false);
    expect(lewat.label).toMatch(/berakhir/);
    expect(statusTampil({ status: "diajukan", izin_sampai: null, keputusan_oleh: null, keputusan_catatan: null }, sekarang).nada).toBe("emas");
    expect(statusTampil({ status: "ditolak", izin_sampai: null, keputusan_oleh: "Deswaty", keputusan_catatan: "Tidak ada bukti" }, sekarang).label).toBe("Ditolak oleh Deswaty: Tidak ada bukti");
    expect(statusTampil({ status: "dibatalkan", izin_sampai: null, keputusan_oleh: null, keputusan_catatan: null }, sekarang).label).toBe("Dibatalkan");
  });
});

describe("penyetuju: dua tingkat atasan terdekat", () => {
  // akun: PPL=1, PML=2, Korwil=3, Supervisor=4 dan 5, PJ=6
  it("PPL lengkap: PML + Korwil (Supervisor dan PJ belum)", () => {
    const lv = susunLevel([2, 3], [4, 5], [6], 1);
    expect(lv).toEqual([[2], [3], [4, 5], [6]]);
    expect(penyetujuDuaLevel(lv)).toEqual([2, 3]);
  });
  it("tanpa Korwil: PML + Supervisor", () => {
    expect(penyetujuDuaLevel(susunLevel([2], [4, 5], [6], 1))).toEqual([2, 4, 5]);
  });
  it("tanpa Korwil dan Supervisor: PML + PJ", () => {
    expect(penyetujuDuaLevel(susunLevel([2], [], [6], 1))).toEqual([2, 6]);
  });
  it("tanpa rantai (mis. PML tanpa atasan terdaftar): Supervisor + PJ", () => {
    expect(penyetujuDuaLevel(susunLevel([], [4, 5], [6], 2))).toEqual([4, 5, 6]);
  });
  it("pengaju tidak pernah menjadi penyetuju sendiri; akun ganda tidak dihitung dua kali", () => {
    expect(susunLevel([2], [1, 2, 4], [4, 6], 1)).toEqual([[2], [4], [6]]);
    expect(penyetujuDuaLevel(susunLevel([], [1], [], 1))).toEqual([]);
  });
  it("tanpa atasan sama sekali: hanya admin yang bisa", () => {
    const p = penyetujuDuaLevel(susunLevel([], [], [], 1));
    expect(p).toEqual([]);
    expect(bolehMemutuskanSusulan(p, 9, 1, false)).toBe(false);
    expect(bolehMemutuskanSusulan(p, 9, 1, true)).toBe(true);
  });
  it("hanya dua tingkat: Supervisor tidak bisa menyetujui PPL yang punya PML dan Korwil", () => {
    const p = penyetujuDuaLevel(susunLevel([2, 3], [4], [6], 1));
    expect(bolehMemutuskanSusulan(p, 2, 1)).toBe(true);
    expect(bolehMemutuskanSusulan(p, 3, 1)).toBe(true);
    expect(bolehMemutuskanSusulan(p, 4, 1)).toBe(false);
    expect(bolehMemutuskanSusulan(p, 1, 1)).toBe(false);
    expect(bolehMemutuskanSusulan(p, 1, 1, true)).toBe(false); // admin pun tidak menyetujui dirinya sendiri
  });
  it("abaikan id tidak sah", () => {
    expect(susunLevel([0, -1, 2.5, 2], [], [], 1)).toEqual([[2]]);
  });
});

describe("tanggalKandidat", () => {
  it("dari kemarin mundur sampai awal periode, terbaru dulu", () => {
    const t = tanggalKandidat({ mulai: "2026-10-30", selesai: "2026-11-10" }, "2026-11-03");
    expect(t).toEqual(["2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30"]);
  });
  it("periode sudah selesai: mulai dari tanggal selesai", () => {
    expect(tanggalKandidat({ mulai: "2026-10-30", selesai: "2026-11-01" }, "2026-11-03")).toEqual(["2026-11-01", "2026-10-31", "2026-10-30"]);
  });
  it("periode belum mulai atau tidak lengkap: kosong", () => {
    expect(tanggalKandidat({ mulai: "2026-11-05", selesai: "2026-11-10" }, "2026-11-03")).toEqual([]);
    expect(tanggalKandidat({ mulai: null, selesai: null }, "2026-11-03")).toEqual([]);
  });
  it("dibatasi jumlah maksimal", () => {
    expect(tanggalKandidat({ mulai: "2026-01-01", selesai: "2026-12-31" }, "2026-11-03")).toHaveLength(MAKS_TANGGAL_KANDIDAT);
  });
});

describe("teks", () => {
  it("tanggal Indonesia", () => {
    expect(tanggalIndo("2026-11-03")).toBe("Sel, 3 Nov 2026");
    expect(tanggalIndo("bukan")).toBe("bukan");
  });
  it("pesan notifikasi memuat nama, tanggal, dan jendela", () => {
    expect(pesanPengajuanSusulan("Jahar Nas", "Pendataan Pascabencana", "2026-11-01").isi).toMatch(/Jahar Nas.*Min, 1 Nov 2026.*Pendataan Pascabencana/);
    expect(pesanKeputusanSusulan(true, "Widya", "2026-11-01").isi).toMatch(/24 jam/);
    expect(pesanKeputusanSusulan(false, "Widya", "2026-11-01").judul).toBe("Susulan ditolak");
  });
  it("urutan: terlama dulu", () => {
    const u = urutkanSusulan([{ id: 2, diajukan_at: "2026-11-03T02:00:00Z" }, { id: 1, diajukan_at: "2026-11-03T01:00:00Z" }, { id: 3, diajukan_at: "2026-11-03T01:00:00Z" }]);
    expect(u.map((x) => x.id)).toEqual([1, 3, 2]);
  });
});
