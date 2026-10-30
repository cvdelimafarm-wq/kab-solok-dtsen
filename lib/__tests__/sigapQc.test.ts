import { describe, it, expect } from "vitest";
import {
  bagianWib, jamKeMenit, menitKeJam, geserHari, instanWib, hariBerlaku, jendelaQc, teksSisaWaktu, sorotKata, hitungSkor, labelPercobaan, labelStatusPpl,
  rencanaAksi, ringkasStatusQc, tanggalPendekQc, pushRilis, pushIngatPetugas, pushIngatPml, pushRekapPml, daftarBriefing, kalimatBriefing, validasiPengaturan, validasiSoal, sumberSoalDari, kolamSoal, cekHariTanggal, namaHariDari, type QcPengaturan, type QcRekapTim,
  hariIso, hariRilisDari, teksHariRilis, rilisBerikut, nilaiLulusDari, wajibUlangDari, maksPercobaanDari, lulusMenurut, kalimatHasil,
} from "../sigapQc";

const P: QcPengaturan = { aktif: true, rilis_jam: "19:00", batas_jam: "20:00", soal_per_hari: 10, maks_ulang: 3, rekap_jam: "07:00", ingat_menit: [30, 50], ingat_berkala_menit: 60, mulai: null, akhir: null };
// WIB -> Date (WIB = UTC+7)
const wib = (tgl: string, jam: string) => instanWib(tgl, jamKeMenit(jam)!);

describe("waktu WIB", () => {
  it("bagianWib melewati tengah malam UTC", () => {
    expect(bagianWib(new Date("2026-10-26T17:30:00Z"))).toEqual({ tanggal: "2026-10-27", menit: 30 });
    expect(bagianWib(new Date("2026-10-26T11:59:00Z"))).toEqual({ tanggal: "2026-10-26", menit: 18 * 60 + 59 });
  });
  it("jamKeMenit / menitKeJam", () => {
    expect(jamKeMenit("19:00")).toBe(1140);
    expect(jamKeMenit("19:00:00")).toBe(1140);
    expect(jamKeMenit("24:00")).toBeNull();
    expect(jamKeMenit("7")).toBeNull();
    expect(jamKeMenit(null)).toBeNull();
    expect(menitKeJam(1140)).toBe("19:00");
    expect(menitKeJam(5)).toBe("00:05");
  });
  it("geserHari lintas bulan dan tahun", () => {
    expect(geserHari("2026-10-31", 1)).toBe("2026-11-01");
    expect(geserHari("2027-01-01", -1)).toBe("2026-12-31");
  });
  it("hariBerlaku: sebelum rilis masih hari kemarin", () => {
    expect(hariBerlaku(wib("2026-10-27", "06:59"), P)).toBe("2026-10-26");
    expect(hariBerlaku(wib("2026-10-27", "18:59"), P)).toBe("2026-10-26");
    expect(hariBerlaku(wib("2026-10-27", "19:00"), P)).toBe("2026-10-27");
  });
  it("hariBerlaku menghormati periode", () => {
    const q = { ...P, mulai: "2026-10-27", akhir: "2026-10-28" };
    expect(hariBerlaku(wib("2026-10-27", "10:00"), q)).toBeNull();
    expect(hariBerlaku(wib("2026-10-27", "20:00"), q)).toBe("2026-10-27");
    expect(hariBerlaku(wib("2026-10-29", "20:00"), q)).toBeNull();
  });
  it("jendelaQc: hari susulan tidak pernah lewat batas", () => {
    const j = jendelaQc(wib("2026-10-26", "21:00"), P, true)!;
    expect(j.lewatBatas).toBe(false);
    expect(teksSisaWaktu(j, true)).toMatch(/tidak dihitung terlambat/);
  });
  it("jendelaQc dan teks sisa waktu", () => {
    const j = jendelaQc(wib("2026-10-26", "19:20"), P)!;
    expect(j.tanggal).toBe("2026-10-26");
    expect(j.lewatBatas).toBe(false);
    expect(j.sisaMenit).toBe(40);
    expect(teksSisaWaktu(j)).toBe("40 menit lagi batas pengisian.");
    const l = jendelaQc(wib("2026-10-27", "07:30"), P)!;
    expect(l.tanggal).toBe("2026-10-26");
    expect(l.lewatBatas).toBe(true);
    expect(teksSisaWaktu(l)).toMatch(/terlambat/);
    expect(teksSisaWaktu({ lewatBatas: false, sisaMenit: 120 })).toBe("2 jam lagi batas pengisian.");
    expect(teksSisaWaktu({ lewatBatas: false, sisaMenit: 90 })).toBe("1 jam 30 menit lagi batas pengisian.");
  });
});

describe("sorotKata", () => {
  const gabung = (s: ReturnType<typeof sorotKata>) => s.map((x) => x.teks).join("");
  it("menyorot tanpa membedakan huruf besar kecil dan tidak mengubah teks", () => {
    const t = "Surat Tugas wajib dibawa PPL saat Pendataan.";
    const s = sorotKata(t, ["surat tugas", "ppl"]);
    expect(gabung(s)).toBe(t);
    expect(s.filter((x) => x.sorot).map((x) => x.teks)).toEqual(["Surat Tugas", "PPL"]);
  });
  it("kata kunci terpanjang menang", () => {
    const s = sorotKata("surat tugas", ["surat", "surat tugas"]);
    expect(s).toEqual([{ teks: "surat tugas", sorot: true }]);
  });
  it("tidak menyala di tengah kata (batas kiri)", () => {
    const s = sorotKata("KEST dan ST", ["ST"]);
    expect(s.filter((x) => x.sorot).map((x) => x.teks)).toEqual(["ST"]);
    expect(s.filter((x) => x.sorot)).toHaveLength(1);
  });
  it("karakter regex dalam kata kunci aman", () => {
    const s = sorotKata("Biaya (Rp.) dan a+b?", ["(Rp.)", "a+b?"]);
    expect(s.filter((x) => x.sorot).map((x) => x.teks)).toEqual(["(Rp.)", "a+b?"]);
  });
  it("tanpa kata kunci / teks kosong", () => {
    expect(sorotKata("halo", [])).toEqual([{ teks: "halo", sorot: false }]);
    expect(sorotKata("halo", null)).toEqual([{ teks: "halo", sorot: false }]);
    expect(sorotKata("", ["a"])).toEqual([]);
  });
  it("tanda HTML tidak diubah (dirender sebagai teks)", () => {
    const s = sorotKata("<b>ppl</b>", ["ppl"]);
    expect(gabung(s)).toBe("<b>ppl</b>");
  });
  it("kata kunci kosong/spasi diabaikan", () => {
    expect(sorotKata("halo dunia", ["", "  "])).toEqual([{ teks: "halo dunia", sorot: false }]);
  });
});

describe("skor dan label", () => {
  it("hitungSkor", () => {
    expect(hitungSkor(10, 10)).toBe(100);
    expect(hitungSkor(7, 10)).toBe(70);
    expect(hitungSkor(1, 3)).toBe(33);
    expect(hitungSkor(0, 0)).toBe(0);
    expect(hitungSkor(12, 10)).toBe(100);
  });
  it("label", () => {
    expect(labelPercobaan(1, 4)).toBe("Percobaan awal (1 dari 4)");
    expect(labelPercobaan(3, 4)).toBe("Ulangan 2 dari 3");
    expect(labelStatusPpl({ percobaan: 0, lulus: false, skor_terbaik: null }, 4)).toBe("Belum mengisi");
    expect(labelStatusPpl({ percobaan: 2, lulus: true, skor_terbaik: 100 }, 4)).toBe("Lulus 100");
    expect(labelStatusPpl({ percobaan: 4, lulus: false, skor_terbaik: 80 }, 4)).toBe("Habis percobaan (80)");
    expect(labelStatusPpl({ percobaan: 2, lulus: false, skor_terbaik: 80 }, 4)).toMatch(/masih mengulang/);
  });
});

describe("rencanaAksi (cron tiap 5 menit)", () => {
  const semua = (now: Date, p = P) => rencanaAksi(now, p).map((a) => `${a.jenis}:${a.tanggal}:${a.slot}`);
  // abaikan rekap kemarin kecuali tes memang membahasnya
  const jenis = (now: Date, p = P) => semua(now, p).filter((x) => !x.startsWith("rekap_pml"));
  it("nonaktif -> tidak ada aksi", () => {
    expect(rencanaAksi(wib("2026-10-26", "19:00"), { ...P, aktif: false })).toEqual([]);
  });
  it("sebelum rilis tidak ada rilis", () => {
    // hari kemarin masih memblokir (berkala berjalan), tetapi tidak ada rilis baru
    expect(jenis(wib("2026-10-26", "18:55")).filter((x) => x.startsWith("rilis"))).toEqual([]);
  });
  it("tepat jam rilis", () => {
    expect(jenis(wib("2026-10-26", "19:00"))).toEqual(["rilis:2026-10-26:0"]);
    expect(jenis(wib("2026-10-26", "19:05"))).toEqual(["rilis:2026-10-26:0"]);
  });
  it("pengingat slot 1 dan 2 untuk petugas dan PML", () => {
    expect(jenis(wib("2026-10-26", "19:30"))).toEqual(["rilis:2026-10-26:0", "ingat_petugas:2026-10-26:1", "ingat_pml:2026-10-26:1"]);
    // lewat 45 menit sejak rilis: push rilis tidak diulang, pengingat tetap
    expect(jenis(wib("2026-10-26", "19:50"))).toEqual(["ingat_petugas:2026-10-26:2", "ingat_pml:2026-10-26:2"]);
  });
  it("pengingat basi dilewati (cron terlambat > toleransi)", () => {
    expect(jenis(wib("2026-10-26", "19:46"))).toEqual([]);
  });
  it("sesudah batas: tidak ada rilis baru; pengingat berkala belum mulai pada selang pertama (kecuali pengingat TENGGAT tepat di batas)", () => {
    expect(jenis(wib("2026-10-26", "20:00"))).toEqual(["ingat_petugas:2026-10-26:99", "ingat_pml:2026-10-26:99"]);
    expect(jenis(wib("2026-10-26", "20:14"))).toEqual(["ingat_petugas:2026-10-26:99", "ingat_pml:2026-10-26:99"]);
    expect(jenis(wib("2026-10-26", "20:15"))).toEqual([]);
    expect(jenis(wib("2026-10-26", "20:59"))).toEqual([]);
  });
  it("(28 Okt) pengingat TENGGAT: tidak pada hari susulan dan tidak di jam senyap", () => {
    const susulanAt = wib("2026-10-26", "19:10");
    expect(rencanaAksi(wib("2026-10-26", "20:00"), P, { susulanAt }).filter((a) => a.slot === 99)).toEqual([]);
    // batas di jam senyap (23.30) tidak mengirim apa pun
    const malam = { ...P, rilis_jam: "19:00", batas_jam: "23:30", ingat_menit: [] };
    expect(rencanaAksi(wib("2026-10-26", "23:30"), malam).filter((a) => a.slot === 99)).toEqual([]);
  });
  it("(28 Okt) jadwal pengguna: rilis 05.30, pengingat 09.00 dan tiap 2 jam, tenggat 20.00, berkala 120 menit", () => {
    const q: QcPengaturan = { ...P, rilis_jam: "05:30", batas_jam: "20:00", ingat_menit: [210, 330, 450, 570, 690], ingat_berkala_menit: 120, rekap_jam: "05:00" };
    // 05.30 senyap -> push rilis baru keluar saat senyap berakhir (06.00) selama jendela 45 menit sejak rilis
    expect(jenis(wib("2026-10-28", "05:35"), q)).toEqual([]);
    expect(jenis(wib("2026-10-28", "06:00"), q)).toEqual(["rilis:2026-10-28:0"]);
    expect(jenis(wib("2026-10-28", "06:20"), q)).toEqual([]);
    const jam = ["09:00", "11:00", "13:00", "15:00", "17:00"];
    jam.forEach((j, i) => expect(jenis(wib("2026-10-28", j), q)).toEqual([`ingat_petugas:2026-10-28:${i + 1}`, `ingat_pml:2026-10-28:${i + 1}`]));
    expect(jenis(wib("2026-10-28", "20:00"), q)).toEqual(["ingat_petugas:2026-10-28:99", "ingat_pml:2026-10-28:99"]);
    expect(jenis(wib("2026-10-28", "22:00"), q)).toEqual(["ingat_petugas:2026-10-28:101", "ingat_pml:2026-10-28:101"]);
  });
  it("pengingat berkala tiap selang sesudah batas, bukan di jam senyap", () => {
    expect(jenis(wib("2026-10-26", "21:00"))).toEqual(["ingat_petugas:2026-10-26:101", "ingat_pml:2026-10-26:101"]);
    expect(jenis(wib("2026-10-26", "21:59"))).toEqual(["ingat_petugas:2026-10-26:101", "ingat_pml:2026-10-26:101"]);
    expect(jenis(wib("2026-10-26", "22:05"))).toEqual(["ingat_petugas:2026-10-26:102", "ingat_pml:2026-10-26:102"]);
    expect(jenis(wib("2026-10-26", "23:00"))).toEqual([]);
    expect(jenis(wib("2026-10-27", "05:59"))).toEqual([]);
  });
  it("pagi berikutnya hari lama masih memblokir: berkala lanjut 06.00 sampai rilis baru", () => {
    // hari 26 (batas 20.00); 06.00 = 10 jam sesudah batas -> slot 110
    expect(jenis(wib("2026-10-27", "06:00"))).toEqual(["ingat_petugas:2026-10-26:110", "ingat_pml:2026-10-26:110"]);
    expect(jenis(wib("2026-10-27", "18:30"))).toEqual(["ingat_petugas:2026-10-26:122", "ingat_pml:2026-10-26:122"]);
    // 19.00: hari baru, mulai lagi dari rilis
    expect(jenis(wib("2026-10-27", "19:00"))).toEqual(["rilis:2026-10-27:0"]);
  });
  it("pengingat berkala mati bila selang 0", () => {
    expect(jenis(wib("2026-10-26", "21:00"), { ...P, ingat_berkala_menit: 0 })).toEqual([]);
  });
  it("selang berkala diatur: 90 menit", () => {
    expect(jenis(wib("2026-10-26", "21:30"), { ...P, ingat_berkala_menit: 90 })).toEqual(["ingat_petugas:2026-10-26:101", "ingat_pml:2026-10-26:101"]);
    expect(jenis(wib("2026-10-26", "21:20"), { ...P, ingat_berkala_menit: 90 })).toEqual([]);
  });
  it("HARI SUSULAN: push rilis susulan dalam jendela, lalu berkala dari saat ditandai (tanpa menunggu batas)", () => {
    const susulanAt = wib("2026-10-26", "20:30");
    const q = (j: string) => semua(wib("2026-10-26", j), P).length; // penanda dipakai di bawah
    expect(q("20:30")).toBeGreaterThanOrEqual(0);
    const dgn = (now: Date) => rencanaAksi(now, P, { susulanAt }).map((a) => `${a.jenis}:${a.tanggal}:${a.slot}`);
    expect(dgn(wib("2026-10-26", "20:35"))).toEqual(["rilis:2026-10-26:0"]);
    expect(dgn(wib("2026-10-26", "21:20"))).toEqual([]); // rilis lewat jendela 45 menit; berkala belum satu selang
    expect(dgn(wib("2026-10-26", "21:30"))).toEqual(["ingat_petugas:2026-10-26:101", "ingat_pml:2026-10-26:101"]);
    expect(dgn(wib("2026-10-26", "22:35"))).toEqual(["ingat_petugas:2026-10-26:102", "ingat_pml:2026-10-26:102"]);
    expect(dgn(wib("2026-10-26", "23:30"))).toEqual([]);
  });
  it("hari susulan ditandai di jam senyap: tidak ada push rilis", () => {
    const susulanAt = wib("2026-10-26", "23:10");
    expect(rencanaAksi(wib("2026-10-26", "23:20"), P, { susulanAt })).toEqual([]);
  });
  it("rekap PML pagi untuk hari kemarin", () => {
    // pagi/siang hari lama masih memblokir (berkala berjalan); di sini yang diuji hanya rekap
    const jenis = (now: Date, p = P) => semua(now, p).filter((x) => x.startsWith("rekap_pml"));
    expect(jenis(wib("2026-10-27", "06:55"))).toEqual([]);
    expect(jenis(wib("2026-10-27", "07:00"))).toEqual(["rekap_pml:2026-10-26:0"]);
    expect(jenis(wib("2026-10-27", "12:00"))).toEqual(["rekap_pml:2026-10-26:0"]);
    expect(jenis(wib("2026-10-27", "18:59"))).toEqual(["rekap_pml:2026-10-26:0"]);
    // begitu soal baru dirilis, rekap kemarin berhenti dikirim
    expect(semua(wib("2026-10-27", "19:00"))).toEqual(["rilis:2026-10-27:0"]);
  });
  it("periode dihormati", () => {
    const q = { ...P, mulai: "2026-10-27", akhir: "2026-10-27" };
    const jenis = (now: Date, p = P) => semua(now, p).filter((x) => !x.startsWith("ingat"));
    expect(jenis(wib("2026-10-26", "19:00"), q)).toEqual([]);
    expect(jenis(wib("2026-10-27", "19:00"), q)).toEqual(["rilis:2026-10-27:0"]);
    expect(jenis(wib("2026-10-28", "07:00"), q)).toEqual(["rekap_pml:2026-10-27:0"]);
    expect(jenis(wib("2026-10-28", "19:00"), q)).toEqual([]);
  });
  it("pengaturan rusak tidak menghasilkan aksi", () => {
    expect(rencanaAksi(wib("2026-10-26", "19:00"), { ...P, rilis_jam: "x" })).toEqual([]);
    expect(rencanaAksi(wib("2026-10-26", "19:00"), { ...P, rilis_jam: "20:00", batas_jam: "19:00" })).toEqual([]);
  });
  it("jam WIB melewati tengah malam UTC", () => {
    // 19:00 WIB = 12:00 UTC; 07:00 WIB = 00:00 UTC hari yang sama
    expect(semua(new Date("2026-10-27T00:00:00Z")).filter((x) => x.startsWith("rekap"))).toEqual(["rekap_pml:2026-10-26:0"]);
    expect(jenis(new Date("2026-10-26T12:00:00Z"))).toEqual(["rilis:2026-10-26:0"]);
  });
});

describe("isi push", () => {
  it("rilis", () => {
    const x = pushRilis("2026-10-26", P);
    expect(x.isi).toContain("10 soal");
    expect(x.isi).toContain("20:00");
    expect(x.tag).toBe("qc-rilis-2026-10-26");
  });
  it("ingat petugas: sebelum batas, sesudah batas, susulan, dan yang masih harus mengulang", () => {
    expect(pushIngatPetugas("2026-10-26", 20, P).isi).toContain("Sisa 20 menit");
    expect(pushIngatPetugas("2026-10-26", 0, P).isi).toContain("Isi sekarang, lalu ulangi sampai nilai 100");
    expect(pushIngatPetugas("2026-10-26", 30, P, { belumMengisi: true }, true).isi).toContain("Isi sekarang");
    const u = pushIngatPetugas("2026-10-26", 0, P, { belumMengisi: false, skorTerbaik: 80, sisaUlang: 2 });
    expect(u.judul).toBe("Ulangi QC Pemahaman sampai 100");
    expect(u.isi).toContain("Nilai terbaik Anda 80");
    expect(u.isi).toContain("sisa 2 kali");
  });
  it("(28 Okt) push ke petugas membawa tombol tunda; push ke PML (pengingat PPL, rekap) tidak", () => {
    expect(pushRilis("2026-10-26", P).tunda).toBe(true);
    expect(pushRilis("2026-10-26", P, true).tunda).toBe(true);
    expect(pushIngatPetugas("2026-10-26", 20, P).tunda).toBe(true);
    expect(pushIngatPetugas("2026-10-26", 0, P, { belumMengisi: false, skorTerbaik: 80, sisaUlang: 2 }).tunda).toBe(true);
    expect(pushIngatPml("2026-10-26", ["Ani"], P).tunda).toBeUndefined();
    expect(pushRekapPml("2026-10-26", { jumlah_ppl: 6, sudah: 6, belum_mengisi: 0, lulus: 6, rata_awal: 100, salah: [] }).tunda).toBeUndefined();
  });
  it("rilis susulan tidak menyebut batas jam", () => {
    expect(pushRilis("2026-10-26", P, true).isi).toContain("terlambat dirilis");
    expect(pushRilis("2026-10-26", P, true).isi).not.toContain("sebelum pukul");
  });
  it("ingat PML merangkum nama", () => {
    expect(pushIngatPml("2026-10-26", ["Ani", "Budi"], P).judul).toBe("2 petugas Anda belum mengisi QC");
    const x = pushIngatPml("2026-10-26", ["A", "B", "C", "D", "E"], P);
    expect(x.isi).toContain("A, B, C dan 2 lainnya");
  });
  const tim = (o: Partial<QcRekapTim> = {}): QcRekapTim => ({ pml_akun_id: 1, pml_nama: "Pak PML", jumlah_ppl: 6, sudah: 5, belum_mengisi: 1, lulus: 3, rata_awal: 72, rata_terbaik: 90, ppl: [], salah: [], ...o });
  it("rekap PML dengan soal salah mengajak briefing ulang", () => {
    const x = pushRekapPml("2026-10-26", tim({ salah: [{ soal_id: "a", pertanyaan: "Apa fungsi surat tugas?", kunci: "A", kunci_teks: "x", penjelasan: "", jumlah: 3, nama: ["A", "B", "C"] }] }));
    expect(x.judul).toMatch(/briefing ulang/);
    expect(x.isi).toContain("5 dari 6");
    expect(x.isi).toContain("1 belum mengisi");
    expect(x.isi).toContain("rata-rata nilai awal 72");
    expect(x.isi).toContain("Segera briefing kembali");
    expect(x.isi.length).toBeLessThanOrEqual(180);
  });
  it("rekap PML aman bila semua benar", () => {
    const x = pushRekapPml("2026-10-26", tim({ belum_mengisi: 0, sudah: 6 }));
    expect(x.judul).toMatch(/aman/);
    expect(x.isi).not.toMatch(/briefing/);
  });
});

describe("rekap untuk modal PML", () => {
  const salah = [
    { soal_id: "b", pertanyaan: "Q2", kunci: "A", kunci_teks: "k", penjelasan: "p", jumlah: 1, nama: ["Zed"] },
    { soal_id: "a", pertanyaan: "Q1", kunci: "B", kunci_teks: "k", penjelasan: "p", jumlah: 3, nama: ["Yan", "Ani"] },
  ];
  it("urut dari paling banyak salah, nama diurutkan", () => {
    const d = daftarBriefing({ salah });
    expect(d.map((x) => x.soalId)).toEqual(["a", "b"]);
    expect(d[0].nama).toEqual(["Ani", "Yan"]);
  });
  it("kalimat briefing", () => {
    expect(kalimatBriefing({ belum_mengisi: 0, salah: [], jumlah_ppl: 5, sudah: 5 })).toMatch(/Tidak perlu briefing/);
    expect(kalimatBriefing({ belum_mengisi: 2, salah, jumlah_ppl: 5, sudah: 3 })).toBe("Briefing kembali 2 soal yang masih dijawab salah dan tegur 2 petugas yang belum mengisi hari ini juga, sebelum pendataan dimulai.");
  });
});

describe("validasiPengaturan", () => {
  it("pengingat berkala: 0 atau 15-720", () => {
    expect(validasiPengaturan({ ingat_berkala_menit: 0 })).toEqual({ ok: true, data: { ingat_berkala_menit: 0 } });
    expect(validasiPengaturan({ ingat_berkala_menit: 60 })).toEqual({ ok: true, data: { ingat_berkala_menit: 60 } });
    expect(validasiPengaturan({ ingat_berkala_menit: 10 })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ ingat_berkala_menit: 721 })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ ingat_berkala_menit: 1.5 })).toMatchObject({ ok: false });
  });
  it("menerima dan menormalkan", () => {
    const h = validasiPengaturan({ aktif: true, rilis_jam: "19:00:00", batas_jam: "20:00", soal_per_hari: "10", maks_ulang: 3, rekap_jam: "7:00", ingat_menit: [50, 30, 30], mulai: "2026-10-27", akhir: "" });
    expect(h).toEqual({ ok: true, data: { aktif: true, rilis_jam: "19:00", batas_jam: "20:00", soal_per_hari: 10, maks_ulang: 3, rekap_jam: "07:00", ingat_menit: [30, 50], mulai: "2026-10-27", akhir: null } });
  });
  it("menolak jam terbalik, menit lewat batas, rekap sesudah rilis", () => {
    expect(validasiPengaturan({ rilis_jam: "20:00", batas_jam: "19:00" })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ rilis_jam: "19:00", batas_jam: "20:00", ingat_menit: [30, 70] })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ rilis_jam: "19:00", rekap_jam: "20:00" })).toMatchObject({ ok: false });
  });
  it("menolak nilai di luar rentang atau bentuk salah", () => {
    expect(validasiPengaturan({ soal_per_hari: 0 })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ soal_per_hari: 31 })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ maks_ulang: 11 })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ maks_ulang: 1.5 })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ aktif: "ya" })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ mulai: "27-10-2026" })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ mulai: "2026-10-28", akhir: "2026-10-27" })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ ingat_menit: "30" })).toMatchObject({ ok: false });
    expect(validasiPengaturan({ ingat_menit: [0] })).toMatchObject({ ok: false });
    expect(validasiPengaturan(null)).toMatchObject({ ok: false });
    expect(validasiPengaturan([])).toMatchObject({ ok: false });
  });
  it("hanya mengembalikan kolom yang dikirim", () => {
    expect(validasiPengaturan({ aktif: false })).toEqual({ ok: true, data: { aktif: false } });
  });
});

describe("validasiSoal", () => {
  const dasar = { id: "S-1", paket: 1, pertanyaan: "Apa itu surat tugas?", opsi: { A: "satu", B: "dua", C: "tiga", D: "empat" }, kunci: "b", kata_kunci: ["surat tugas", "surat tugas", " "] };
  it("menerima soal sah dan menormalkan kunci/kata kunci", () => {
    const h = validasiSoal(dasar);
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.data.kunci).toBe("B");
      expect(h.data.kata_kunci).toEqual(["surat tugas"]);
    }
  });
  it("menolak opsi kosong/kembar, kunci salah, pertanyaan pendek, paket salah", () => {
    expect(validasiSoal({ ...dasar, opsi: { ...dasar.opsi, C: "" } })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...dasar, opsi: { ...dasar.opsi, C: "SATU" } })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...dasar, kunci: "E" })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...dasar, pertanyaan: "ab" })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...dasar, paket: 0 })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...dasar, id: "" })).toMatchObject({ ok: false });
    expect(validasiSoal(null)).toMatchObject({ ok: false });
  });
});

describe("ringkasStatusQc (apa yang berlaku sekarang menurut pengaturan tersimpan)", () => {
  const Q = { ...P, mulai: "2026-10-27", akhir: "2026-11-07", rilis_jam: "05:30", batas_jam: "20:00" };
  it("tanggalPendekQc", () => expect(tanggalPendekQc("2026-10-27")).toBe("27 Okt 2026"));
  it("nonaktif", () => {
    const r = ringkasStatusQc(wib("2026-10-27", "10:00"), { ...Q, aktif: false });
    expect(r.status).toBe("nonaktif");
  });
  it("aktif tetapi sebelum rilis pertama = belum mulai", () => {
    const r = ringkasStatusQc(wib("2026-10-27", "04:53"), Q);
    expect(r.status).toBe("belum_mulai");
    expect(r.baris[0]).toContain("27 Okt 2026 pukul 05:30");
  });
  it("sesudah rilis, sebelum batas = berjalan dengan sisa waktu dan rilis berikutnya", () => {
    const r = ringkasStatusQc(wib("2026-10-27", "18:00"), Q);
    expect(r.status).toBe("berjalan");
    expect(r.baris[0]).toContain("dirilis pukul 05:30");
    expect(r.baris[0]).toContain("sisa 2 jam");
    expect(r.baris[1]).toContain("28 Okt 2026 pukul 05:30");
  });
  it("sesudah batas: tetap terkunci dan terlambat", () => {
    const r = ringkasStatusQc(wib("2026-10-27", "21:00"), Q);
    expect(r.status).toBe("berjalan");
    expect(r.baris[0]).toContain("lewat batas 20:00");
  });
  it("hari susulan", () => {
    const r = ringkasStatusQc(wib("2026-10-27", "21:00"), Q, true);
    expect(r.status).toBe("susulan");
  });
  it("hari terakhir periode dan sesudah periode", () => {
    expect(ringkasStatusQc(wib("2026-11-07", "10:00"), Q).baris[1]).toContain("hari terakhir");
    expect(ringkasStatusQc(wib("2026-11-08", "06:00"), Q).status).toBe("selesai");
  });
  it("jam tidak sah", () => {
    expect(ringkasStatusQc(new Date(), { ...Q, rilis_jam: "x" }).status).toBe("tidak_sah");
  });
});

// ---------------------------------------------------------------------------------------------
// (29 Okt 2026) QC per kegiatan: opsi hari rilis, nilai lulus, wajib ulang, peserta, rekap PML, nama kegiatan di notifikasi
// ---------------------------------------------------------------------------------------------
describe("hari rilis (QC per kegiatan)", () => {
  it("hariIso: 26 Okt 2026 Senin, 1 Nov 2026 Minggu", () => {
    expect(hariIso("2026-10-26")).toBe(1);
    expect(hariIso("2026-10-31")).toBe(6);
    expect(hariIso("2026-11-01")).toBe(7);
  });
  it("hariRilisDari: kosong atau tidak sah = setiap hari; diurut dan tanpa duplikat", () => {
    expect(hariRilisDari({})).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hariRilisDari({ hari_rilis: [] })).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hariRilisDari({ hari_rilis: [9, 0] })).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hariRilisDari({ hari_rilis: [5, 1, 5] })).toEqual([1, 5]);
  });
  it("teksHariRilis", () => {
    expect(teksHariRilis(undefined)).toBe("Setiap hari");
    expect(teksHariRilis([1, 2, 3, 4, 5])).toBe("Senin sampai Jumat");
    expect(teksHariRilis([1, 4])).toBe("Senin, Kamis");
    expect(teksHariRilis([1, 2])).toBe("Senin, Selasa");
  });
  it("hariBerlaku mundur ke hari rilis terakhir (sama dengan sigap_qc_hari_berlaku di SQL)", () => {
    const q = { ...P, hari_rilis: [1, 5] };
    expect(hariBerlaku(wib("2026-10-28", "07:00"), q)).toBe("2026-10-26"); // Rabu pagi -> Senin
    expect(hariBerlaku(wib("2026-10-31", "20:00"), q)).toBe("2026-10-30"); // Sabtu malam -> Jumat
    expect(hariBerlaku(wib("2026-10-26", "10:00"), q)).toBe("2026-10-23"); // Senin sebelum rilis -> Jumat lalu
    expect(hariBerlaku(wib("2026-10-26", "19:00"), q)).toBe("2026-10-26"); // Senin sesudah rilis
  });
  it("hariBerlaku: hari rilis terakhir di luar periode = tidak ada hari berlaku", () => {
    const q = { ...P, hari_rilis: [1], mulai: "2026-10-26", akhir: "2026-10-26" };
    expect(hariBerlaku(wib("2026-10-27", "20:00"), q)).toBe("2026-10-26"); // Selasa masih Senin kemarin
    expect(hariBerlaku(wib("2026-11-02", "20:00"), q)).toBeNull();
  });
  it("rilisBerikut", () => {
    expect(rilisBerikut("2026-10-26", { hari_rilis: [1, 5], akhir: null })).toBe("2026-10-30");
    expect(rilisBerikut("2026-10-30", { hari_rilis: [1, 5], akhir: null })).toBe("2026-11-02");
    expect(rilisBerikut("2026-10-30", { hari_rilis: [1, 5], akhir: "2026-10-31" })).toBeNull();
    expect(rilisBerikut("2026-10-26", { hari_rilis: undefined, akhir: null })).toBe("2026-10-27");
  });
  it("rencanaAksi: rilis hanya pada hari rilis; di luar hari rilis tidak ada rilis baru", () => {
    const q = { ...P, hari_rilis: [1, 5] };
    expect(rencanaAksi(wib("2026-10-26", "19:05"), q).some((a) => a.jenis === "rilis" && a.tanggal === "2026-10-26")).toBe(true);
    expect(rencanaAksi(wib("2026-10-27", "19:05"), q).some((a) => a.jenis === "rilis")).toBe(false);
  });
});

describe("nilai lulus dan wajib ulang", () => {
  it("bawaan: lulus 100, wajib ulang, 1 + maks_ulang percobaan", () => {
    expect(nilaiLulusDari(P)).toBe(100);
    expect(wajibUlangDari(P)).toBe(true);
    expect(maksPercobaanDari(P)).toBe(4);
  });
  it("tanpa wajib ulang = satu percobaan", () => {
    expect(wajibUlangDari({ wajib_ulang: false })).toBe(false);
    expect(maksPercobaanDari({ ...P, wajib_ulang: false })).toBe(1);
  });
  it("nilaiLulusDari mengabaikan nilai tidak sah", () => {
    expect(nilaiLulusDari({ nilai_lulus: 0 })).toBe(100);
    expect(nilaiLulusDari({ nilai_lulus: 101 })).toBe(100);
    expect(nilaiLulusDari({ nilai_lulus: 80 })).toBe(80);
  });
  it("lulusMenurut (sama dengan sigap_qc_lulus)", () => {
    expect(lulusMenurut(10, 10)).toBe(true);
    expect(lulusMenurut(9, 10)).toBe(false);
    expect(lulusMenurut(4, 5, 80)).toBe(true);
    expect(lulusMenurut(3, 5, 80)).toBe(false);
    expect(lulusMenurut(0, 0, 1)).toBe(false);
  });
  it("labelStatusPpl dengan nilai lulus", () => {
    expect(labelStatusPpl({ percobaan: 1, lulus: true, skor_terbaik: 80 }, 1, 80)).toBe("Lulus (80)");
    expect(labelStatusPpl({ percobaan: 1, lulus: false, skor_terbaik: 60 }, 1, 80)).toBe("Tidak lulus (60)");
    expect(labelStatusPpl({ percobaan: 1, lulus: false, skor_terbaik: 60 }, 4, 80)).toBe("Belum lulus (60), masih mengulang");
    expect(labelStatusPpl({ percobaan: 1, lulus: false, skor_terbaik: 60 }, 4)).toBe("Belum 100 (60), masih mengulang");
  });
  it("kalimatHasil dengan nilai lulus", () => {
    expect(kalimatHasil({ skor: 100, lulus: true, perlu_ulang: false, sisa_ulang: 3 })).toBe("Nilai 100. Semua jawaban benar.");
    expect(kalimatHasil({ skor: 80, lulus: true, perlu_ulang: false, sisa_ulang: 0, nilai_lulus: 80 })).toBe("Nilai 80. Lulus (batas lulus 80).");
    expect(kalimatHasil({ skor: 60, lulus: false, perlu_ulang: true, sisa_ulang: 2, nilai_lulus: 80 })).toContain("nilai 80 ke atas");
    expect(kalimatHasil({ skor: 60, lulus: false, perlu_ulang: false, sisa_ulang: 0, nilai_lulus: 80 })).toContain("batas lulus 80");
    expect(kalimatHasil({ skor: 60, lulus: false, perlu_ulang: false, sisa_ulang: 0 })).toContain("Kesempatan mengulang sudah habis");
  });
});

describe("push per kegiatan", () => {
  it("tanpa opsi: judul dan tag sama dengan sebelumnya", () => {
    expect(pushRilis("2026-10-26", P).judul).toBe("QC Pemahaman Petugas hari ini");
    expect(pushRilis("2026-10-26", P).tag).toBe("qc-rilis-2026-10-26");
    expect(pushIngatPetugas("2026-10-26", 20, P).tag).toBe("qc-ingat-2026-10-26");
  });
  it("dengan opsi: nama kegiatan di judul dan tag berbeda per kegiatan", () => {
    const o = { nama: "SPDT NTP", kegiatanId: 2 };
    expect(pushRilis("2026-10-26", P, false, o).judul).toBe("QC Pemahaman Petugas hari ini (SPDT NTP)");
    expect(pushRilis("2026-10-26", P, false, o).tag).toBe("qc-rilis-2026-10-26-k2");
    expect(pushIngatPetugas("2026-10-26", 20, P, { belumMengisi: true }, false, o).tag).toBe("qc-ingat-2026-10-26-k2");
    expect(pushIngatPml("2026-10-26", ["Ani"], P, o).tag).toBe("qc-ingat-pml-2026-10-26-k2");
    expect(pushRekapPml("2026-10-26", { jumlah_ppl: 2, sudah: 2, belum_mengisi: 0, lulus: 2, rata_awal: 100, salah: [] }, o).tag).toBe("qc-rekap-2026-10-26-k2");
  });
  it("nilai lulus < 100 dan tanpa wajib ulang mengubah kalimat", () => {
    const q = { ...P, nilai_lulus: 80 };
    expect(pushIngatPetugas("2026-10-26", 0, q).isi).toContain("nilai 80 ke atas");
    expect(pushIngatPetugas("2026-10-26", 0, q, { belumMengisi: false, skorTerbaik: 60, sisaUlang: 2 }).judul).toBe("Ulangi QC Pemahaman sampai lulus");
    const tanpa = { ...P, wajib_ulang: false };
    expect(pushIngatPetugas("2026-10-26", 0, tanpa).isi).not.toContain("ulangi");
    expect(pushRilis("2026-10-26", tanpa, true).isi).not.toContain("ulangi");
  });
});

describe("rekap PML per kegiatan", () => {
  it("rekap_pml=false: tidak ada aksi rekap", () => {
    expect(rencanaAksi(wib("2026-10-27", "07:05"), P).some((a) => a.jenis === "rekap_pml")).toBe(true);
    expect(rencanaAksi(wib("2026-10-27", "07:05"), { ...P, rekap_pml: false }).some((a) => a.jenis === "rekap_pml")).toBe(false);
  });
  it("rekap hanya bila kemarin hari rilis", () => {
    const q = { ...P, hari_rilis: [1, 5] };
    expect(rencanaAksi(wib("2026-10-27", "07:05"), q).some((a) => a.jenis === "rekap_pml" && a.tanggal === "2026-10-26")).toBe(true);
    expect(rencanaAksi(wib("2026-10-28", "07:05"), q).some((a) => a.jenis === "rekap_pml")).toBe(false);
  });
});

describe("validasiPengaturan opsi baru", () => {
  it("menerima opsi sah dan merapikan daftar", () => {
    const v = validasiPengaturan({ wajib_ulang: false, nilai_lulus: 80, undi_acak: false, acak_tampil: false, rekap_pml: false, hari_rilis: [5, 1, 5], peran_peserta: ["ppl", "pml", "ppl"] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.data).toEqual({ wajib_ulang: false, nilai_lulus: 80, undi_acak: false, acak_tampil: false, rekap_pml: false, hari_rilis: [1, 5], peran_peserta: ["pml", "ppl"] });
  });
  it("menolak opsi tidak sah", () => {
    for (const bad of [{ nilai_lulus: 0 }, { nilai_lulus: 101 }, { nilai_lulus: 80.5 }, { wajib_ulang: "ya" }, { hari_rilis: [] }, { hari_rilis: [8] }, { hari_rilis: "1" }, { peran_peserta: [] }, { peran_peserta: ["supervisor"] }, { rekap_pml: 1 }]) {
      expect(validasiPengaturan(bad).ok).toBe(false);
    }
  });
});

describe("sumber soal harian", () => {
  const bank = [
    { id: "a1", paket: 1, aktif: true },
    { id: "a2", paket: 1, aktif: false },
    { id: "b1", paket: 2, aktif: true },
    { id: "c1", paket: 3 },
  ];
  it("sumberSoalDari: bawaan semua, nilai asing jadi semua", () => {
    expect(sumberSoalDari(undefined)).toBe("semua");
    expect(sumberSoalDari({ sumber_soal: "paket" })).toBe("paket");
    expect(sumberSoalDari({ sumber_soal: "pilihan" })).toBe("pilihan");
    expect(sumberSoalDari({ sumber_soal: "xyz" as never })).toBe("semua");
  });
  it("kolamSoal: semua = semua soal aktif", () => {
    expect(kolamSoal(bank, {}).map((s) => s.id)).toEqual(["a1", "b1", "c1"]);
  });
  it("kolamSoal: paket terpilih saja, soal nonaktif tidak ikut", () => {
    expect(kolamSoal(bank, { sumber_soal: "paket", paket_pilihan: [1, 3] }).map((s) => s.id)).toEqual(["a1", "c1"]);
    expect(kolamSoal(bank, { sumber_soal: "paket", paket_pilihan: [] })).toEqual([]);
  });
  it("kolamSoal: hanya soal yang dicentang dan aktif", () => {
    expect(kolamSoal(bank, { sumber_soal: "pilihan", soal_pilihan: ["a1", "a2", "c1", "zz"] }).map((s) => s.id)).toEqual(["a1", "c1"]);
  });
  it("validasiPengaturan menerima dan merapikan sumber soal", () => {
    const v = validasiPengaturan({ sumber_soal: "paket", paket_pilihan: [3, 1, 3], soal_pilihan: [" b ", "a", "b"] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.data).toEqual({ sumber_soal: "paket", paket_pilihan: [1, 3], soal_pilihan: ["a", "b"] });
  });
  it("validasiPengaturan menolak sumber soal tidak sah", () => {
    for (const bad of [{ sumber_soal: "acak" }, { sumber_soal: 1 }, { paket_pilihan: [0] }, { paket_pilihan: "1" }, { paket_pilihan: [1.5] }, { soal_pilihan: [""] }, { soal_pilihan: [1] }, { sumber_soal: "paket", paket_pilihan: [] }, { sumber_soal: "pilihan", soal_pilihan: [] }]) {
      expect(validasiPengaturan(bad).ok).toBe(false);
    }
  });
});

describe("cekHariTanggal: kecocokan hari rilis vs tanggal periode", () => {
  const SENIN_JUMAT = [1, 2, 3, 4, 5];
  it("namaHariDari", () => {
    expect(namaHariDari("2026-10-30")).toBe("Jumat");
    expect(namaHariDari("2026-10-31")).toBe("Sabtu");
    expect(namaHariDari("2026-11-02")).toBe("Senin");
  });
  it("periode akhir pekan tanpa hari rilis akhir pekan = galat", () => {
    const c = cekHariTanggal({ mulai: "2026-10-31", akhir: "2026-11-01", hari_rilis: SENIN_JUMAT });
    expect(c.galat).toHaveLength(1);
    expect(c.galat[0]).toContain("Sabtu");
    expect(c.galat[0]).toContain("tidak memuat satu pun hari rilis");
    expect(c.jumlahRilis).toBe(0);
    expect(c.pertama).toBeNull();
  });
  it("periode memuat hari rilis: tanpa galat, jumlah dan tanggal pertama/terakhir benar", () => {
    const c = cekHariTanggal({ mulai: "2026-10-31", akhir: "2026-11-13", hari_rilis: SENIN_JUMAT }); // Sabtu .. Jumat 2 pekan berikutnya
    expect(c.galat).toEqual([]);
    expect(c.jumlahRilis).toBe(10);
    expect(c.pertama).toBe("2026-11-02");
    expect(c.terakhir).toBe("2026-11-13");
    expect(c.peringatan.join(" ")).toContain("Tanggal mulai Sabtu, 31 Okt 2026 bukan hari rilis");
    expect(c.peringatan.join(" ")).not.toContain("Tanggal akhir");
  });
  it("mulai dan akhir tepat hari rilis: tanpa peringatan", () => {
    const c = cekHariTanggal({ mulai: "2026-10-26", akhir: "2026-10-30", hari_rilis: SENIN_JUMAT });
    expect(c).toMatchObject({ galat: [], peringatan: [], jumlahRilis: 5, pertama: "2026-10-26", terakhir: "2026-10-30" });
  });
  it("tanggal akhir bukan hari rilis: peringatan menyebut rilis terakhir", () => {
    const c = cekHariTanggal({ mulai: "2026-10-26", akhir: "2026-11-01", hari_rilis: SENIN_JUMAT });
    expect(c.terakhir).toBe("2026-10-30");
    expect(c.peringatan.join(" ")).toContain("Soal terakhir dirilis Jumat, 30 Okt 2026");
  });
  it("hitungan sama dengan penelusuran tanggal demi tanggal pada periode panjang", () => {
    for (const hr of [[1], [2, 4], [6, 7], [1, 3, 5], [1, 2, 3, 4, 5, 6, 7]]) {
      const c = cekHariTanggal({ mulai: "2026-09-03", akhir: "2026-12-20", hari_rilis: hr });
      let n = 0;
      for (let d = "2026-09-03"; d <= "2026-12-20"; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) if (hr.includes(((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1)) n++;
      expect(c.jumlahRilis).toBe(n);
    }
  });
  it("periode terbuka: tanpa jumlah, tetap memberi tahu rilis pertama", () => {
    const c = cekHariTanggal({ mulai: "2026-10-31", akhir: null, hari_rilis: SENIN_JUMAT });
    expect(c.jumlahRilis).toBeNull();
    expect(c.pertama).toBe("2026-11-02");
    expect(c.galat).toEqual([]);
    expect(cekHariTanggal({ mulai: null, akhir: null, hari_rilis: SENIN_JUMAT })).toMatchObject({ galat: [], peringatan: [], jumlahRilis: null });
  });
  it("periode yang sudah lewat memberi peringatan (bukan galat)", () => {
    const c = cekHariTanggal({ mulai: "2026-10-26", akhir: "2026-10-29", hari_rilis: [1, 2, 3, 4, 5, 6, 7] }, "2026-10-30");
    expect(c.galat).toEqual([]);
    expect(c.peringatan.join(" ")).toContain("sudah lewat");
    expect(cekHariTanggal({ mulai: "2026-10-26", akhir: "2026-10-29", hari_rilis: [1, 2, 3, 4, 5, 6, 7] }, "2026-10-28").peringatan).toEqual([]);
  });
  it("validasiPengaturan menolak periode tanpa hari rilis hanya bila ketiganya dikirim", () => {
    expect(validasiPengaturan({ mulai: "2026-10-31", akhir: "2026-11-01", hari_rilis: SENIN_JUMAT }).ok).toBe(false);
    expect(validasiPengaturan({ mulai: "2026-10-31", akhir: "2026-11-02", hari_rilis: SENIN_JUMAT }).ok).toBe(true);
    expect(validasiPengaturan({ mulai: "2026-10-31", akhir: "2026-11-01" }).ok).toBe(true); // hari rilis tidak dikirim: diperiksa SQL terhadap nilai tersimpan
  });
});

describe("ringkasStatusQc dengan opsi baru", () => {
  const Q2 = { aktif: true, rilis_jam: "19:00", batas_jam: "20:00", mulai: "2026-10-26", akhir: null, hari_rilis: [1, 5], nilai_lulus: 80, wajib_ulang: false };
  it("menyebut hari rilis berikutnya, nilai lulus, dan tanpa ulangan", () => {
    const r = ringkasStatusQc(wib("2026-10-28", "10:00"), Q2);
    expect(r.baris.join(" ")).toContain("30 Okt 2026");
    expect(r.baris.join(" ")).toContain("80 ke atas");
    expect(r.baris.join(" ")).toContain("tanpa ulangan wajib");
  });
  it("belum mulai: soal pertama pada hari rilis pertama sesudah mulai", () => {
    const r = ringkasStatusQc(wib("2026-10-20", "10:00"), { ...Q2, mulai: "2026-10-27" });
    expect(r.status).toBe("belum_mulai");
    expect(r.baris[0]).toContain("30 Okt 2026");
  });
});

describe("validasiSoal: soal 2 pilihan (Benar/Salah)", () => {
  const bs = { id: "BS-1", paket: 1, pertanyaan: "PPL boleh mengisi tanpa izin?", opsi: { A: "Benar", B: "Salah" }, kunci: "b" };
  it("menerima soal tanpa C dan D (kosong atau tidak ada)", () => {
    for (const opsi of [{ A: "Benar", B: "Salah" }, { A: "Benar", B: "Salah", C: "", D: "  " }]) {
      const h = validasiSoal({ ...bs, opsi });
      expect(h.ok).toBe(true);
      if (h.ok) {
        expect(h.data.kunci).toBe("B");
        expect(Object.keys(h.data.opsi)).toEqual(["A", "B"]);
      }
    }
  });
  it("menolak C tanpa D (atau sebaliknya) dan kunci C/D pada soal 2 pilihan", () => {
    expect(validasiSoal({ ...bs, opsi: { A: "Benar", B: "Salah", C: "Mungkin" } })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...bs, opsi: { A: "Benar", B: "Salah", D: "Mungkin" } })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...bs, kunci: "C" })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...bs, kunci: "D" })).toMatchObject({ ok: false });
  });
  it("tetap menolak A atau B kosong dan pilihan kembar", () => {
    expect(validasiSoal({ ...bs, opsi: { A: "Benar", B: "" } })).toMatchObject({ ok: false });
    expect(validasiSoal({ ...bs, opsi: { A: "Benar", B: "benar" } })).toMatchObject({ ok: false });
  });
});
