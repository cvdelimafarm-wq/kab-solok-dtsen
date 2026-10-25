import { describe, expect, it } from "vitest";
import {
  argsLangkah, barisRiwayat, catatanSahDenganPdf, periksaLampiranPok, perluLampiranPok, daftarTahap, kartuTahap, keteranganJalur, labelDokumen, matriksBoleh, periksaLangkah, posisiJadwal, subStatusDari,
  tindakanTersedia, versiDari, waktuWib, type RiwayatJadwal,
} from "../status";

const r = (id: number, aksi: string, status_ke: string, extra: Partial<RiwayatJadwal> = {}): RiwayatJadwal => ({
  id, jadwal_id: 1, waktu: "2026-10-23T01:12:00Z", aksi, status_ke, nomor: "", tanggal: null, catatan: "", oleh_nama: "M. Iqbal Hadi", ...extra,
});

describe("posisi dan kartu tahap", () => {
  it("POK: empat tahap, dibuka = tahap 1, diterapkan = tahap 3, sah = tahap 4 disahkan", () => {
    expect(daftarTahap("pok").map((x) => x.kunci)).toEqual(["pengumpulan", "ditutup", "diterapkan", "sah"]);
    expect(posisiJadwal("pok", "dibuka", []).indeks).toBe(0);
    expect(posisiJadwal("pok", "terkumpul", []).indeks).toBe(1);
    expect(posisiJadwal("pok", "diterapkan", []).indeks).toBe(2);
    const p = posisiJadwal("pok", "sah", []);
    expect(p).toMatchObject({ indeks: 3, sah: true });
    const k = kartuTahap("pok", "sah", p);
    expect(k.map((x) => x.label)).toEqual(["Selesai", "Selesai", "Selesai", "Disahkan"]);
    expect(k[3].warna).toBe("hijau");
  });

  it("DIPA: lima tahap; pengajuan, dikembalikan, ditolak dibaca dari riwayat", () => {
    expect(daftarTahap("dipa_djpb")).toHaveLength(5);
    const aju = [r(1, "ajukan", "diajukan")];
    expect(posisiJadwal("dipa_djpb", "diterapkan", aju)).toMatchObject({ indeks: 3, sub: "diajukan" });
    const kembali = [...aju, r(2, "kembalikan", "dikembalikan")];
    const pk = posisiJadwal("dipa_dja", "diterapkan", kembali);
    expect(pk).toMatchObject({ indeks: 4, sub: "dikembalikan" });
    const kartu = kartuTahap("dipa_dja", "diterapkan", pk);
    expect(kartu[4]).toMatchObject({ label: "Dikembalikan", warna: "kuning", aktif: true });
    expect(kartu[3].label).toBe("Selesai");
    const tolak = [...aju, r(2, "tolak", "ditolak")];
    expect(kartuTahap("dipa_djpb", "diterapkan", posisiJadwal("dipa_djpb", "diterapkan", tolak))[4]).toMatchObject({ label: "Ditolak", warna: "merah" });
  });

  it("perbaiki membawa kembali ke Diterapkan dan menaikkan versi", () => {
    const rw = [r(1, "ajukan", "diajukan"), r(2, "tolak", "ditolak"), r(3, "perbaiki", "diterapkan")];
    expect(subStatusDari(rw)).toBeNull();
    expect(versiDari(rw)).toBe(2);
    expect(posisiJadwal("dipa_djpb", "diterapkan", rw)).toMatchObject({ indeks: 2, versi: 2 });
  });

  it("urutan riwayat tidak tergantung urutan masuk", () => {
    const rw = [r(3, "perbaiki", "diterapkan"), r(1, "ajukan", "diajukan"), r(2, "tolak", "ditolak")];
    expect(subStatusDari(rw)).toBeNull();
    expect(subStatusDari([r(2, "tolak", "ditolak"), r(1, "ajukan", "diajukan")])).toBe("ditolak");
  });

  it("DIPA sah tampil Disahkan di tahap Hasil resmi; dilewati tanpa tahap aktif", () => {
    const p = posisiJadwal("dipa_djpb", "sah", [r(1, "ajukan", "diajukan"), r(2, "sah", "sah")]);
    expect(p.indeks).toBe(4);
    expect(kartuTahap("dipa_djpb", "sah", p)[4]).toMatchObject({ label: "Disahkan", warna: "hijau" });
    const l = posisiJadwal("pok", "dilewati", []);
    expect(l.dilewati).toBe(true);
    expect(kartuTahap("pok", "dilewati", l).every((x) => !x.aktif && x.label === "Belum")).toBe(true);
  });

  it("tahap pertama menunjukkan Terjadwal atau Dibuka", () => {
    expect(kartuTahap("pok", "terjadwal", posisiJadwal("pok", "terjadwal", []))[0].label).toBe("Terjadwal");
    expect(kartuTahap("pok", "dibuka", posisiJadwal("pok", "dibuka", []))[0].label).toBe("Dibuka");
  });

  it("keterangan jalur ada untuk keempat jenis", () => {
    for (const j of ["pok", "administrasi", "dipa_djpb", "dipa_dja"]) expect(keteranganJalur(j).length).toBeGreaterThan(20);
  });
});

describe("tindakan", () => {
  const ada = (jenis: string, status: string, sub: Parameters<typeof tindakanTersedia>[2], boleh = true) =>
    tindakanTersedia(jenis, status, sub, "2026-12-31", "2026-10-25", false, boleh).map((x) => x.aksi);

  it("tanpa kewenangan tidak ada tindakan", () => {
    expect(ada("pok", "terkumpul", null, false)).toEqual([]);
  });
  it("siklus POK: buka, tutup, terapkan, sah (dokumen wajib)", () => {
    expect(ada("pok", "terjadwal", null)).toEqual(["buka", "lewati"]);
    expect(ada("pok", "dibuka", null)).toEqual(["tutup", "lewati"]);
    expect(ada("pok", "terkumpul", null)).toEqual(["terapkan"]);
    const s = tindakanTersedia("pok", "diterapkan", null, "2026-12-31", "2026-10-25", false, true);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ aksi: "sah", perluDokumen: true, utama: true });
    expect(s[0].label).toContain("PDF POK resmi");
  });
  it("siklus DIPA: ajukan, lalu hasil, lalu perbaiki", () => {
    expect(ada("dipa_djpb", "diterapkan", null)).toEqual(["ajukan"]);
    expect(tindakanTersedia("dipa_dja", "diterapkan", null, "", "", false, true)[0].label).toContain("DJA");
    expect(tindakanTersedia("dipa_djpb", "diterapkan", null, "", "", false, true)[0].label).toContain("Kanwil DJPb");
    expect(ada("dipa_djpb", "diterapkan", "diajukan")).toEqual(["kembalikan", "tolak", "sah"]);
    expect(ada("dipa_djpb", "diterapkan", "dikembalikan")).toEqual(["perbaiki"]);
    expect(ada("dipa_djpb", "diterapkan", "ditolak")).toEqual(["perbaiki"]);
    expect(tindakanTersedia("dipa_djpb", "diterapkan", "ditolak", "", "", false, true)[0].perluDokumen).toBe(false);
    expect(ada("dipa_djpb", "sah", null)).toEqual([]);
  });
  it("jadwal dilewati hanya dapat dipulihkan selama jendela belum lewat", () => {
    expect(tindakanTersedia("pok", "dilewati", null, "2026-12-31", "2026-10-25", true, true).map((x) => x.aksi)).toEqual(["pulihkan"]);
    expect(tindakanTersedia("pok", "dilewati", null, "2026-10-01", "2026-10-25", true, true)).toEqual([]);
  });
  it("label dokumen mengikuti jenis dan aksi", () => {
    expect(labelDokumen("pok", "sah").nomor).toContain("keputusan PPK");
    expect(labelDokumen("dipa_djpb", "ajukan").nomor).toBe("Nomor surat");
    expect(labelDokumen("dipa_dja", "sah").nomor).toContain("pengesahan");
  });
  it("periksa dokumen hanya untuk tindakan yang memerlukannya", () => {
    const sah = tindakanTersedia("pok", "diterapkan", null, "", "", false, true)[0];
    expect(periksaLangkah(sah, "", "")).toHaveLength(1);
    expect(periksaLangkah(sah, "012/KPA/2026", "2026-02-30")).toHaveLength(1);
    expect(periksaLangkah(sah, "012/KPA/2026", "2026-10-28")).toEqual([]);
    const tutup = tindakanTersedia("pok", "dibuka", null, "", "", false, true)[0];
    expect(periksaLangkah(tutup, "", "")).toEqual([]);
  });
  it("argumen ke fungsi: nomor dan tanggal hanya bila sah, catatan dipangkas", () => {
    expect(argsLangkah(7, "tutup", "", "", "")).toEqual({ p_jadwal: 7, p_aksi: "tutup", p_catatan: "" });
    expect(argsLangkah(7, "ajukan", " S-1/2026 ", "2026-10-28", " ke Kanwil ")).toEqual({ p_jadwal: 7, p_aksi: "ajukan", p_catatan: "ke Kanwil", p_nomor: "S-1/2026", p_tanggal: "2026-10-28" });
    expect(argsLangkah(7, "ajukan", "S-1", "bukan-tanggal", "x".repeat(400)).p_catatan).toHaveLength(300);
    expect(argsLangkah(7, "ajukan", "S-1", "bukan-tanggal", "").p_tanggal).toBeUndefined();
  });
});

describe("riwayat", () => {
  it("waktu WIB", () => {
    expect(waktuWib("2026-10-23T01:12:00Z")).toBe("23 Okt 2026, 08:12");
    expect(waktuWib("2026-12-31T18:00:00Z")).toBe("1 Jan 2027, 01:00");
    expect(waktuWib("rusak")).toBe("rusak");
  });
  it("terbaru di atas, nomor dan tanggal digabung, DIPA sah tampil Disahkan", () => {
    const rw = [
      r(1, "awal", "diterapkan", { oleh_nama: null }),
      r(2, "ajukan", "diajukan", { nomor: "S-12/KW.03/2026", tanggal: "2026-10-26", catatan: "ke Kanwil" }),
      r(3, "sah", "sah", { nomor: "KEP-1/2026", tanggal: "2026-11-09" }),
    ];
    const b = barisRiwayat(rw, "dipa_djpb");
    expect(b.map((x) => x.id)).toEqual([3, 2, 1]);
    expect(b[0]).toMatchObject({ label: "Disahkan", warna: "hijau", surat: "KEP-1/2026, 9 Nov 2026" });
    expect(b[1]).toMatchObject({ aksi: "Mencatat pengajuan", label: "Diajukan", warna: "ungu", catatan: "ke Kanwil" });
    expect(b[2]).toMatchObject({ peran: "Sistem", surat: "-" });
    expect(barisRiwayat(rw, "pok")[0].label).toBe("Sah");
  });
});

describe("siapa boleh apa", () => {
  const peran = [
    { kode: "PPK", nama: "PPK", urut: 3 }, { kode: "KETUA", nama: "Ketua Tim Kegiatan", urut: 2 }, { kode: "ADMINRO", nama: "Admin RO", urut: 1 },
    { kode: "KPA", nama: "Kepala (KPA)", urut: 4 }, { kode: "ADMIN", nama: "Admin Aplikasi", urut: 0 },
  ];
  const kp = [
    ["draf", "ADMINRO"], ["rab", "KETUA"], ["setuju_ketua", "KETUA"], ["kek_putus", "KETUA"], ["sahkan", "PPK"], ["jadwal", "PPK"], ["pok_pdf", "PPK"],
    ["laporan", "KPA"], ["master", "ADMIN"],
  ].map(([k, p]) => ({ kewenangan_kode: k, peran_kode: p }));
  it("kolom hanya peran yang memegang kewenangan siklus, berurutan", () => {
    const m = matriksBoleh(peran, kp);
    expect(m.kolom.map((p) => p.kode)).toEqual(["ADMINRO", "KETUA", "PPK"]);
    const jadwal = m.baris.find((b) => b.tindakan.startsWith("Mengatur jadwal"))!;
    expect(jadwal.sel).toEqual([false, false, true]);
    const susun = m.baris.find((b) => b.tindakan.startsWith("Menyusun"))!;
    expect(susun.sel).toEqual([true, true, false]);
    expect(m.baris[m.baris.length - 1].sel).toEqual([true, true, true]);
  });
});

describe("lampiran PDF POK resmi saat Sahkan", () => {
  const sah = tindakanTersedia("pok", "diterapkan", null, "", "", false, true)[0];
  const tutup = tindakanTersedia("pok", "dibuka", null, "", "", false, true)[0];
  const ajukan = tindakanTersedia("dipa_djpb", "diterapkan", null, "", "", false, true)[0];
  it("hanya aksi sah yang mewajibkan lampiran", () => {
    expect(perluLampiranPok(sah)).toBe(true);
    expect(perluLampiranPok(tutup)).toBe(false);
    expect(perluLampiranPok(ajukan)).toBe(false);
    const sahDipa = tindakanTersedia("dipa_dja", "diterapkan", "diajukan", "", "", false, true).find((x) => x.aksi === "sah")!;
    expect(perluLampiranPok(sahDipa)).toBe(true);
  });
  it("tanpa berkas, berkas tak utuh, atau kosong: ditolak; berkas utuh: boleh (pagu beda tidak menghalangi)", () => {
    expect(periksaLampiranPok(sah, null)).toHaveLength(1);
    expect(periksaLampiranPok(sah, { utuh: false, nBaris: 10 })).toHaveLength(1);
    expect(periksaLampiranPok(sah, { utuh: true, nBaris: 0 })).toHaveLength(1);
    expect(periksaLampiranPok(sah, { utuh: true, nBaris: 10 })).toEqual([]);
    expect(periksaLampiranPok(tutup, null)).toEqual([]);
  });
  const hasil = (nSama: number, nTak: number) => ({
    baris: Array.from({ length: nSama + nTak }, (_, i) => ({ ro: "R", akun: String(i), resmi: 1, sistem: 1, selisih: 0, status: "sama" as const })),
    nSama, nBeda: nTak, nHanyaResmi: 0, nHanyaSistem: 0, totalResmi: 0, totalSistem: 0, selisihTotal: 0, roBermasalah: [], roTakDibandingkan: [], sama: nTak === 0,
  });
  it("catatan memuat nama berkas, 12 karakter awal hash, dan hasil cek", () => {
    const c = catatanSahDenganPdf({ nama: "POK.pdf", hash: "abcdef0123456789ffff" }, hasil(5, 0), "");
    expect(c).toContain("POK.pdf");
    expect(c).toContain("abcdef012345");
    expect(c).not.toContain("abcdef0123456");
    expect(c).toContain("5 akun sama");
    expect(catatanSahDenganPdf({ nama: "a.pdf", hash: "0".repeat(64) }, hasil(3, 2), "")).toContain("2 dari 5 akun pagu berbeda");
    expect(catatanSahDenganPdf({ nama: "a.pdf", hash: "0".repeat(64) }, null, "")).toContain("tidak dapat dibandingkan");
  });
  it("catatan pengguna dipotong, bagian sistem utuh, total maksimum 300", () => {
    const panjang = "x".repeat(500);
    const c = catatanSahDenganPdf({ nama: "n".repeat(200), hash: "f".repeat(64) }, hasil(1, 1), panjang);
    expect(c.length).toBeLessThanOrEqual(300);
    expect(c).toContain("sha256 ffffffffffff");
    const tanpa = catatanSahDenganPdf({ nama: "a.pdf", hash: "f".repeat(64) }, hasil(1, 0), "Sesuai SPAN");
    expect(tanpa.endsWith("Sesuai SPAN")).toBe(true);
  });
});
