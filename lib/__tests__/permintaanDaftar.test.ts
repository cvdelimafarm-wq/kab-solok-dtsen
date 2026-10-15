import { describe, expect, it } from "vitest";
import { batasPengajuan, MAKS_SUB_SEKALI_KIRIM, JUDUL_TEMPLAT_FASIH, labelJorong, susunPushBatal, susunPushKeluar, barisTemplatFasih, namaBerkasTemplat, pecahKodeSubsls, periksaEmail, periksaIds, periksaPilihan, sisaKuota, tanggalWib, tanpaEmail, urutPermintaan, CATATAN_BATAL, LABEL_STATUS_MINTA, type Permintaan } from "@/lib/permintaanDaftar";

const P = (o: Partial<Permintaan>): Permintaan => ({ id: 1, idsubsls: "1303071002000101", kecamatan: "", nagari: "", sls: "", sub_sls: "", pml_id: 1, pml_nama: "", ppl_akun_id: 1, ppl_nama: "", tanggal: "2026-10-13", status: "menunggu", diminta_at: "2026-10-13T01:00:00Z", selesai_at: null, ...o });

describe("tanggalWib & batas teknis", () => {
  it("memakai tanggal WIB (UTC+7)", () => {
    expect(tanggalWib("2026-10-13T16:59:00Z")).toBe("2026-10-13");
    expect(tanggalWib("2026-10-13T17:00:00Z")).toBe("2026-10-14");
  });
  it("batas total pengajuan naik bertahap: 7 (15 Okt), 9 (16 Okt), 11 (17 Okt dst)", () => {
    expect(batasPengajuan("2026-10-14")).toBe(7);
    expect(batasPengajuan("2026-10-15")).toBe(7);
    expect(batasPengajuan("2026-10-16")).toBe(9);
    expect(batasPengajuan("2026-10-17")).toBe(11);
    expect(batasPengajuan("2026-11-30")).toBe(11);
    expect(MAKS_SUB_SEKALI_KIRIM).toBe(200);
  });
  it("sisa kuota = batas total dikurangi pengajuan yang masih berlaku", () => {
    expect(sisaKuota([], 7)).toBe(7);
    expect(sisaKuota([P({})], 7)).toBe(6);
    expect(sisaKuota([P({ tanggal: "2026-10-12" }), P({ id: 2, tanggal: "2026-10-13" })], 9)).toBe(7);
    expect(sisaKuota([1, 2, 3, 4, 5, 6, 7], 7)).toBe(0);
    expect(sisaKuota([1, 2, 3, 4, 5, 6, 7, 8], 7)).toBe(0);
  });
});

describe("periksaPilihan", () => {
  it("menerima pilihan sah", () => {
    const r = periksaPilihan([{ idsubsls: "1303071002000101", ppl_akun_id: 5 }, { idsubsls: "1303071002000901", ppl_akun_id: "6" }]);
    expect(r).toEqual({ ok: true, pilihan: [{ idsubsls: "1303071002000101", ppl_akun_id: 5 }, { idsubsls: "1303071002000901", ppl_akun_id: 6 }] });
  });
  it("menolak kosong, melebihi batas yang diberikan, kode salah, PPL kosong, dan ganda", () => {
    expect(periksaPilihan([]).ok).toBe(false);
    expect(periksaPilihan("x").ok).toBe(false);
    const enam = ["1303071002000101", "1303071002000901", "1303080008000401", "1303080008000402", "1303080008000403", "1303080008000404"].map((idsubsls) => ({ idsubsls, ppl_akun_id: 1 }));
    expect(periksaPilihan(enam).ok).toBe(true); // tidak lagi dibatasi 5
    expect(periksaPilihan(enam, 5).ok).toBe(false);
    expect(periksaPilihan(enam.slice(0, 5)).ok).toBe(true);
    expect(periksaPilihan([{ idsubsls: "123", ppl_akun_id: 1 }]).ok).toBe(false);
    expect(periksaPilihan([{ idsubsls: "1303071002000101", ppl_akun_id: 0 }]).ok).toBe(false);
    expect(periksaPilihan([{ idsubsls: "1303071002000101", ppl_akun_id: 1 }, { idsubsls: "1303071002000101", ppl_akun_id: 2 }]).ok).toBe(false);
  });
  it("periksaIds membuang ganda dan menolak yang tak sah", () => {
    expect(periksaIds([3, "3", 4])).toEqual([3, 4]);
    expect(periksaIds([])).toBeNull();
    expect(periksaIds([1, "abc"])).toBeNull();
    expect(periksaIds("1")).toBeNull();
  });
});

describe("urutPermintaan", () => {
  it("menunggu dulu (terlama di atas), lalu yang sudah keluar (terbaru di atas)", () => {
    const a = P({ id: 1, status: "sudah_keluar", selesai_at: "2026-10-13T03:00:00Z" });
    const b = P({ id: 2, status: "menunggu", diminta_at: "2026-10-13T02:00:00Z" });
    const c = P({ id: 3, status: "menunggu", diminta_at: "2026-10-13T01:00:00Z" });
    const d = P({ id: 4, status: "sudah_keluar", selesai_at: "2026-10-13T05:00:00Z" });
    expect(urutPermintaan([a, b, c, d]).map((x) => x.id)).toEqual([3, 2, 4, 1]);
  });
});

describe("templat FASIH (Pengawas-Pencacah)", () => {
  it("judul kolom persis seperti templat FASIH", () => {
    expect([...JUDUL_TEMPLAT_FASIH]).toEqual(["PROVINSI", "KABUPATEN/KOTA", "KECAMATAN", "DESA/KELURAHAN", "SLS/SUBSLS", "Email Pengawas", "Email Pencacah"]);
  });
  it("memecah kode 16 digit; SLS/SUBSLS = 6 digit terakhir (nol di depan tetap)", () => {
    expect(pecahKodeSubsls("1303071002000101")).toEqual({ prov: "13", kab: "03", kec: "071", desa: "002", slsSub: "000101" });
    expect(pecahKodeSubsls("13030710020001")).toBeNull();
  });
  it("baris berisi teks, email dirapikan, kode tak sah dilewati", () => {
    const b = barisTemplatFasih([
      { idsubsls: "1303080008000401", email_pengawas: " Ilham-PPPK@bps.go.id ", email_pencacah: "A@gmail.com" },
      { idsubsls: "1303071002000101", email_pengawas: "ilham-pppk@bps.go.id", email_pencacah: "" },
      { idsubsls: "bukan-kode", email_pengawas: "x", email_pencacah: "y" },
    ]);
    expect(b).toEqual([
      { PROVINSI: "13", "KABUPATEN/KOTA": "03", KECAMATAN: "071", "DESA/KELURAHAN": "002", "SLS/SUBSLS": "000101", "Email Pengawas": "ilham-pppk@bps.go.id", "Email Pencacah": "" },
      { PROVINSI: "13", "KABUPATEN/KOTA": "03", KECAMATAN: "080", "DESA/KELURAHAN": "008", "SLS/SUBSLS": "000401", "Email Pengawas": "ilham-pppk@bps.go.id", "Email Pencacah": "a@gmail.com" },
    ]);
    expect(b.every((r) => Object.values(r).every((v) => typeof v === "string"))).toBe(true);
  });
  it("tanpaEmail & nama berkas", () => {
    expect(tanpaEmail({ email_pengawas: "a@b", email_pencacah: "" })).toBe(true);
    expect(tanpaEmail({ email_pengawas: "a@b", email_pencacah: "c@d" })).toBe(false);
    expect(namaBerkasTemplat("2026-10-13")).toBe("Pengawas-Pencacah-20261013.xlsx");
  });
});

describe("periksaEmail", () => {
  it("merapikan dan memvalidasi", () => {
    expect(periksaEmail("  RiniNofsiska4@Gmail.com ")).toBe("rininofsiska4@gmail.com");
    expect(periksaEmail("tanpa-at.com")).toBeNull();
    expect(periksaEmail("a b@c.com")).toBeNull();
    expect(periksaEmail("a@b")).toBeNull();
    expect(periksaEmail(123)).toBeNull();
    expect(periksaEmail("x".repeat(120) + "@b.co")).toBeNull();
  });
});

describe("notifikasi sudah di-assign ke FASIH", () => {
  it("labelJorong: sub 00 tidak ditampilkan", () => {
    expect(labelJorong("JORONG TANJUNG", "00")).toBe("Jorong Tanjung");
    expect(labelJorong("JORONG GANDO", "04")).toBe("Jorong Gando 04");
  });
  it("PML: rincian jorong + nama PPL, pengingat cek submit, catatan keroyokan", () => {
    const p = susunPushKeluar("pml", [{ jorong: "Jorong Tanjung", ppl: "Yovinda Oktasia Rahmi" }, { jorong: "Jorong Gando 04", ppl: "Rini Nofsiska Sari" }]);
    expect(p.judul).toBe("Daftar KK sudah di-assign ke FASIH");
    expect(p.isi).toContain("Jorong Tanjung → Yovinda; Jorong Gando 04 → Rini");
    expect(p.isi).toContain("tersubmit di FASIH");
    expect(p.isi).toContain("Keroyokan: semua petugas login pakai akun PPL di atas");
    expect(p.isi.length).toBeLessThanOrEqual(240);
  });
  it("PPL: hanya jorong miliknya + login pakai akun Anda", () => {
    const p = susunPushKeluar("ppl", [{ jorong: "Jorong Tanjung", ppl: "Yovinda" }]);
    expect(p.isi.startsWith("Untuk Anda: Jorong Tanjung.")).toBe(true);
    expect(p.isi).toContain("login pakai akun Anda");
  });
  it("daftar panjang: daftar dipotong (+N lagi), catatan di belakang tetap utuh dan <= 240", () => {
    const banyak = Array.from({ length: 12 }, (_, i) => ({ jorong: `Jorong Panjang Sekali Nomor ${i + 1}`, ppl: `Petugas Nomor ${i + 1}` }));
    for (const untuk of ["pml", "ppl"] as const) {
      const p = susunPushKeluar(untuk, banyak);
      expect(p.isi.length).toBeLessThanOrEqual(240);
      expect(p.isi).toMatch(/\(\+\d+ lagi\)/);
      expect(p.isi).toContain("Keroyokan:");
      expect(p.isi).toContain("tersubmit di FASIH");
    }
  });
});

describe("pembatalan assignment oleh PML", () => {
  it("urutan: menunggu, sudah keluar, lalu dibatalkan", () => {
    const a = urutPermintaan([P({ id: 3, status: "dibatalkan", selesai_at: "2026-10-13T03:00:00Z" }), P({ id: 2, status: "sudah_keluar", selesai_at: "2026-10-13T02:00:00Z" }), P({ id: 1 })]);
    expect(a.map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("label status dan catatan menyebut tanpa persetujuan", () => {
    expect(LABEL_STATUS_MINTA.dibatalkan).toBe("Dibatalkan PML");
    expect(CATATAN_BATAL).toMatch(/tanpa persetujuan/i);
  });
  it("push admin: siapa membatalkan, jorong + PPL, perintah hapus di FASIH", () => {
    const { judul, isi } = susunPushBatal("admin", "Lia Anggraini", [{ jorong: "Jorong Tembok 01", ppl: "Novi Endria Jhoni" }]);
    expect(judul).toBe("Pembatalan assignment FASIH");
    expect(isi).toContain("PML Lia membatalkan: Jorong Tembok 01 (Novi)");
    expect(isi).toContain("Hapus assignment lama di FASIH");
  });
  it("push PPL: assignment dibatalkan, abaikan daftar", () => {
    const { judul, isi } = susunPushBatal("ppl", "Lia Anggraini", [{ jorong: "Jorong Tembok 01", ppl: "Novi" }]);
    expect(judul).toBe("Assignment dibatalkan PML");
    expect(isi).toContain("Dibatalkan PML: Jorong Tembok 01");
    expect(isi).toContain("Abaikan daftar ini");
  });
  it("daftar panjang tetap <= 240 dan ekor utuh", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ jorong: `Jorong Panjang Sekali ${i}`, ppl: "Nama Panjang" }));
    const { isi } = susunPushBatal("admin", "Lia Anggraini", items);
    expect(isi.length).toBeLessThanOrEqual(240);
    expect(isi).toMatch(/lagi\)/);
    expect(isi.endsWith("PPL-nya.")).toBe(true);
  });
});
