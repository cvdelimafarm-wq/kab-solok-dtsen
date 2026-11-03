// Menguji lib/konteksVanguard.ts (murni): status, nada, sisa hari, teks Panduan, label WAJIB/OPSIONAL, dan kartu yang disembunyikan.
import { describe, expect, it } from "vitest";
import { TEKS_BANK_SOAL, aturanDihitung, dihitungAturan, kartuTampil, labelKartu, nadaKonteks, panduanKonteks, sisaHari, soalLatihanBerikutnya, statusKonteks, teksSisa, teksSertifikasiWajib, type KonteksPelatihan, type KartuVg } from "../konteksVanguard";

const petak = (selesai: number, hariIni = true) => Array.from({ length: 3 }, (_, i) => (i < selesai ? { status: "selesai" as const, tanggal: null } : i === selesai && hariIni ? { status: "hari_ini" as const, tanggal: "2026-11-02" } : { status: "belum" as const, tanggal: null }));
const dasar = (o: Partial<KonteksPelatihan> = {}, r: Partial<NonNullable<KonteksPelatihan["runtutan"]>> | null = {}): KonteksPelatihan => ({
  kegiatan_id: 7, nama: "Pelatihan Petugas Seruti Triwulan IV 2026", mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0,
  tenggat: "2026-11-08", tenggat_sumber: "atur", mulai_paling_lambat: "2026-11-06", hari_ini: "2026-11-02",
  runtutan: r === null ? null : { berturut: 0, tuntas: false, hari_ini_sudah: false, terputus: false, sesi_hari_ini: 0, petak: petak(0), mungkin: true, cadangan_hari: 4, hari_terakhir_mulai: false, ...r },
  ...o,
});

describe("sisa hari dan nada", () => {
  it("sisa dihitung ke tenggat; hari ini = hari terakhir; lewat = terlambat", () => {
    expect(sisaHari(dasar())).toBe(6);
    expect(teksSisa(dasar())).toBe("Sisa 6 hari");
    expect(teksSisa(dasar({ hari_ini: "2026-11-08" }))).toBe("Hari terakhir");
    expect(teksSisa(dasar({ hari_ini: "2026-11-10" }))).toBe("Terlambat 2 hari");
    expect(teksSisa(dasar({ tenggat: null }))).toBeNull();
  });
  it("nada: netral, kuning (sisa <= 2 atau terputus), merah (lewat batas wajib), hijau (tuntas)", () => {
    expect(nadaKonteks(dasar())).toBe("netral");
    expect(nadaKonteks(dasar({ hari_ini: "2026-11-06" }))).toBe("kuning");
    expect(nadaKonteks(dasar({ hari_ini: "2026-11-08" }))).toBe("kuning");
    expect(nadaKonteks(dasar({}, { terputus: true }))).toBe("kuning");
    expect(nadaKonteks(dasar({}, { mungkin: false }))).toBe("merah");
    expect(nadaKonteks(dasar({ mode: "opsional" }, { mungkin: false }))).toBe("kuning");
    expect(nadaKonteks(dasar({}, { tuntas: true, berturut: 3 }))).toBe("hijau");
    expect(nadaKonteks(dasar({ mode: "tidak_ada" }, null))).toBe("netral");
  });
});

describe("status", () => {
  it("bebas / belum mulai / berjalan / terputus / lewat batas / tuntas", () => {
    expect(statusKonteks(dasar({ mode: "tidak_ada" }, null))).toBe("bebas");
    expect(statusKonteks(dasar())).toBe("belum_mulai");
    expect(statusKonteks(dasar({}, { berturut: 1 }))).toBe("berjalan");
    expect(statusKonteks(dasar({}, { terputus: true }))).toBe("terputus");
    expect(statusKonteks(dasar({}, { mungkin: false }))).toBe("lewat_batas");
    expect(statusKonteks(dasar({}, { tuntas: true, berturut: 3 }))).toBe("tuntas");
  });
  it("tuntas menang atas lewat batas", () => {
    expect(statusKonteks(dasar({}, { tuntas: true, mungkin: false }))).toBe("tuntas");
  });
});

describe("panduan", () => {
  it("belum mulai: ajak latihan, sebut tenggat dan batas mulai, Pretest terkunci pada mode wajib", () => {
    const p = panduanKonteks(dasar());
    expect(p.judul).toBe("Latihan 0 dari 3 hari berturut-turut");
    expect(p.ket).toContain("8 November");
    expect(p.ket).toContain("Pretest terkunci");
    expect(p.langkah).toContain("6 November");
    expect(p.tombol).toEqual({ jenis: "latihan", teks: "Latihan hari ini" });
    expect(p.tenggat).toContain("Minggu");
    expect(p.sisa).toBe("Sisa 6 hari");
    expect(p.wajib).toBe(true);
    expect(p.petak).toHaveLength(3);
  });
  it("mode opsional tidak menyebut kunci Pretest", () => {
    const p = panduanKonteks(dasar({ mode: "opsional" }));
    expect(p.ket).not.toContain("terkunci");
    expect(p.wajib).toBe(false);
  });
  it("berjalan, sudah berlatih hari ini: tombol tidak lagi mengajak; lanjut besok", () => {
    const p = panduanKonteks(dasar({}, { berturut: 1, hari_ini_sudah: true, petak: petak(1, false) }));
    expect(p.judul).toBe("Latihan 1 dari 3 hari berturut-turut");
    expect(p.ket).toContain("Lanjutkan besok");
    expect(p.langkah).toContain("hari ke-2");
    expect(p.tombol.jenis).toBe("sudah_hari_ini");
  });
  it("berjalan, hari ini belum: tombol latihan", () => {
    const p = panduanKonteks(dasar({}, { berturut: 1 }));
    expect(p.tombol.jenis).toBe("latihan");
    expect(p.langkah).toContain("hari ke-2");
  });
  it("hari terakhir mulai", () => {
    expect(panduanKonteks(dasar({ hari_ini: "2026-11-06" }, { hari_terakhir_mulai: true })).langkah).toContain("hari terakhir");
  });
  it("terputus: mulai lagi dari hari 1", () => {
    const p = panduanKonteks(dasar({}, { terputus: true }));
    expect(p.ket).toContain("Mulai lagi dari hari 1 hari ini");
    expect(p.nada).toBe("kuning");
  });
  it("tuntas: tombol Selesai dan tidak ada banner tenggat yang menakutkan", () => {
    const p = panduanKonteks(dasar({}, { tuntas: true, berturut: 3, petak: petak(3, false) }));
    expect(p.tombol).toEqual({ jenis: "selesai", teks: "Selesai ✓" });
    expect(p.progres).toEqual({ x: 3, n: 3 });
    expect(p.ket).toContain("tidak lagi terkunci");
  });
  it("lewat batas (wajib): arahkan menghubungi panitia; opsional: tetap boleh latihan", () => {
    const w = panduanKonteks(dasar({ hari_ini: "2026-11-09" }, { mungkin: false }));
    expect(w.tombol.jenis).toBe("hubungi");
    expect(w.sisa).toBe("Terlambat 1 hari");
    expect(w.nada).toBe("merah");
    const o = panduanKonteks(dasar({ mode: "opsional", hari_ini: "2026-11-09" }, { mungkin: false }));
    expect(o.tombol.jenis).toBe("latihan");
  });
  it("tanpa kewajiban (tidak_ada): latihan bebas, tanpa petak dan tenggat", () => {
    const p = panduanKonteks(dasar({ mode: "tidak_ada", tenggat: null, mulai_paling_lambat: null }, null));
    expect(p.status).toBe("bebas");
    expect(p.petak).toEqual([]);
    expect(p.progres).toBeNull();
    expect(p.tombol.jenis).toBe("bebas");
    expect(p.sisa).toBeNull();
  });
  it("tenggat tidak diketahui: tidak mengarang tanggal", () => {
    const p = panduanKonteks(dasar({ tenggat: null, mulai_paling_lambat: null }, { mungkin: null }));
    expect(p.tenggat).toBeNull();
    expect(p.sisa).toBeNull();
    expect(p.ket).toContain("sebelum Pretest");
  });
});

describe("apa yang dihitung", () => {
  it("menyebut jenis sesi yang dihitung, minimal sesi/skor bila ada, Sabtu-Minggu, dan yang tidak dihitung", () => {
    const t = aturanDihitung(dasar({ sesi_min_per_hari: 2, nilai_minimal: 60 })).join(" ");
    expect(t).toContain("2 sesi");
    expect(t).toContain("Latihan harian");
    expect(t).toContain("Skor tiap sesi minimal 60");
    expect(t).toContain("Sabtu dan Minggu ikut dihitung");
    expect(t).toContain("Tidak dihitung: Latihan bank soal");
    expect(t).toContain("tidak memengaruhi pelatihan");
    expect(aturanDihitung(dasar()).join(" ")).not.toContain("Skor tiap sesi");
  });
});

describe("label dan kartu", () => {
  const semuaKartu: KartuVg[] = ["cara_main", "ringkasan", "kasus", "saran", "kuesioner", "sertifikasi", "latihan_format", "harian", "tantangan", "usul", "tingkat"];
  it("wajib: sesi yang dihitung WAJIB, sisanya OPSIONAL tidak dihitung", () => {
    expect(labelKartu("wajib", "harian")).toEqual({ teks: "WAJIB", jenis: "wajib" });
    expect(labelKartu("wajib", "sertifikasi").jenis).toBe("wajib");
    expect(labelKartu("wajib", "tantangan")).toEqual({ teks: "LATIHAN BEBAS", jenis: "opsional" });
    expect(labelKartu("wajib", "kuesioner").jenis).toBe("opsional");
  });
  it("opsional: dihitung tetapi tidak wajib; tidak_ada: semua OPSIONAL", () => {
    expect(labelKartu("opsional", "harian")).toEqual({ teks: "DIHITUNG", jenis: "dihitung" });
    for (const k of semuaKartu) expect(labelKartu("tidak_ada", k).jenis).toBe("opsional");
  });
  it("hanya harian, latihan format, dan sertifikasi yang dihitung", () => {
    expect(semuaKartu.filter(dihitungAturan)).toEqual(["sertifikasi", "latihan_format", "harian"]);
  });
  it("peserta pelatihan (ringkas) hanya melihat sesi yang dihitung dan Cara main; 'tampilkan semua' membuka semuanya", () => {
    const k = dasar();
    const tampil = semuaKartu.filter((x) => kartuTampil(k, x, false));
    expect(tampil).toEqual(["cara_main", "sertifikasi", "latihan_format", "harian"]);
    expect(semuaKartu.every((x) => kartuTampil(k, x, true))).toBe(true);
  });
  it("bukan peserta pelatihan (konteks null): semua kartu tampil seperti semula", () => {
    expect(semuaKartu.every((x) => kartuTampil(null, x, false))).toBe(true);
  });
});

describe("Menu wajib dan Latihan bank soal", () => {
  it("teks bank soal: boleh dicoba sebanyak-banyaknya, tidak memengaruhi pelatihan, dan tidak menyebut 'dicatat'", () => {
    expect(TEKS_BANK_SOAL.judul).toBe("Latihan bank soal");
    expect(TEKS_BANK_SOAL.isi).toContain("berkali-kali");
    expect(TEKS_BANK_SOAL.isi).toContain("tidak memengaruhi pelatihan");
    expect(TEKS_BANK_SOAL.isi.toLowerCase()).not.toContain("catat");
  });
  it("Sertifikasi wajib: judul mengikuti mode; belum / sudah ikut ujian", () => {
    expect(teksSertifikasiWajib({ mode: "wajib", sertifikasi: { selesai: false, tingkat: null } })).toMatchObject({ judul: "Sertifikasi wajib", selesai: false, tombol: "Ikut ujian sertifikasi" });
    expect(teksSertifikasiWajib({ mode: "tidak_ada" }).judul).toBe("Sertifikasi kemampuan");
    const s = teksSertifikasiWajib({ mode: "wajib", sertifikasi: { selesai: true, tingkat: 3 } });
    expect(s.selesai).toBe(true);
    expect(s.ket).toContain("★★★");
    expect(s.ket).toContain("3 dari 5");
    expect(s.tombol).toBe("Lihat sertifikat saya");
  });
  it("soal berikutnya: yang pertama belum benar, melewati kasus bebas dan level tertutup; semua benar = soal pertama", () => {
    const daftar = [{ kode: "A00", bebas: true, level: "A" }, { kode: "A01", level: "A" }, { kode: "A02", level: "A" }, { kode: "B01", level: "B" }];
    const lv = new Set(["A", "B"]);
    expect(soalLatihanBerikutnya(daftar, {}, lv)).toBe(1);
    expect(soalLatihanBerikutnya(daftar, { A01: 2 }, lv)).toBe(2);
    expect(soalLatihanBerikutnya(daftar, { A01: 1, A02: 3, B01: 2 }, lv)).toBe(1);
    expect(soalLatihanBerikutnya(daftar, {}, new Set(["B"]))).toBe(3);
    expect(soalLatihanBerikutnya(daftar, {}, new Set())).toBe(-1);
  });
});
