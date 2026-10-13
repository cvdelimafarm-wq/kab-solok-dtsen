import { describe, expect, it } from "vitest";
import { JUDUL_TEMPLAT_FASIH, barisTemplatFasih, namaBerkasTemplat, pecahKodeSubsls, periksaIds, periksaPilihan, sisaKuota, tanggalWib, tanpaEmail, urutPermintaan, type Permintaan } from "@/lib/permintaanDaftar";

const P = (o: Partial<Permintaan>): Permintaan => ({ id: 1, idsubsls: "1303071002000101", kecamatan: "", nagari: "", sls: "", sub_sls: "", pml_id: 1, pml_nama: "", ppl_akun_id: 1, ppl_nama: "", tanggal: "2026-10-13", status: "menunggu", diminta_at: "2026-10-13T01:00:00Z", selesai_at: null, ...o });

describe("tanggalWib & kuota", () => {
  it("memakai tanggal WIB (UTC+7)", () => {
    expect(tanggalWib("2026-10-13T16:59:00Z")).toBe("2026-10-13");
    expect(tanggalWib("2026-10-13T17:00:00Z")).toBe("2026-10-14");
  });
  it("kuota 2 per hari; hari lain tidak dihitung", () => {
    expect(sisaKuota([], "2026-10-13")).toBe(2);
    expect(sisaKuota([P({})], "2026-10-13")).toBe(1);
    expect(sisaKuota([P({}), P({ id: 2 })], "2026-10-13")).toBe(0);
    expect(sisaKuota([P({}), P({ id: 2 }), P({ id: 3 })], "2026-10-13")).toBe(0);
    expect(sisaKuota([P({ tanggal: "2026-10-12" }), P({ id: 2, tanggal: "2026-10-12" })], "2026-10-13")).toBe(2);
  });
});

describe("periksaPilihan", () => {
  it("menerima 1-2 pilihan sah", () => {
    const r = periksaPilihan([{ idsubsls: "1303071002000101", ppl_akun_id: 5 }, { idsubsls: "1303071002000901", ppl_akun_id: "6" }]);
    expect(r).toEqual({ ok: true, pilihan: [{ idsubsls: "1303071002000101", ppl_akun_id: 5 }, { idsubsls: "1303071002000901", ppl_akun_id: 6 }] });
  });
  it("menolak kosong, lebih dari 2, kode salah, PPL kosong, dan ganda", () => {
    expect(periksaPilihan([]).ok).toBe(false);
    expect(periksaPilihan("x").ok).toBe(false);
    const tiga = ["1303071002000101", "1303071002000901", "1303080008000401"].map((idsubsls) => ({ idsubsls, ppl_akun_id: 1 }));
    expect(periksaPilihan(tiga).ok).toBe(false);
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
