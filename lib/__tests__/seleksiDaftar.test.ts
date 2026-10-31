import { describe, expect, it } from "vitest";
import { jendelaPendaftaran, pesanPushAjakan, pesanUndangan, peranDaftarSah, putusanDaftar, teksWaktuWib } from "../seleksiDaftar";
import type { HasilKelayakan } from "../seleksiSyarat";

const ok: HasilKelayakan = { status: "memenuhi", alasan: [], jarak_km: 2, wilayah_terdekat: "A" };
const buka = { buka: true, alasan: null };
const T = (s: string) => Date.parse(s);

describe("jendelaPendaftaran", () => {
  const dasar = { status: "dibuka", jadwal_buka: "2026-11-05T01:00:00Z", jadwal_tutup: "2026-11-10T10:00:00Z" };
  it("terbuka di dalam jadwal", () => expect(jendelaPendaftaran({ ...dasar, nowMs: T("2026-11-07T00:00:00Z") }).buka).toBe(true));
  it("belum mulai dan sudah lewat", () => {
    expect(jendelaPendaftaran({ ...dasar, nowMs: T("2026-11-04T00:00:00Z") }).alasan).toContain("belum dimulai");
    expect(jendelaPendaftaran({ ...dasar, nowMs: T("2026-11-11T00:00:00Z") }).alasan).toContain("lewat");
  });
  it("batas kosong tidak membatasi; status selain dibuka menutup", () => {
    expect(jendelaPendaftaran({ status: "dibuka", jadwal_buka: null, jadwal_tutup: null, nowMs: 1 }).buka).toBe(true);
    expect(jendelaPendaftaran({ status: "draft", jadwal_buka: null, jadwal_tutup: null, nowMs: 1 }).alasan).toContain("belum dibuka");
    expect(jendelaPendaftaran({ status: "ditutup", jadwal_buka: null, jadwal_tutup: null, nowMs: 1 }).alasan).toContain("ditutup");
  });
});

describe("putusanDaftar", () => {
  it("boleh bila jendela terbuka, ada kebutuhan, dan memenuhi", () => {
    expect(putusanDaftar({ jendela: buka, kelayakan: ok, peran: "ppl", sisaPpl: 3, sisaPml: 0 }).boleh).toBe(true);
  });
  it("menolak peran tanpa kebutuhan", () => {
    const h = putusanDaftar({ jendela: buka, kelayakan: ok, peran: "pml", sisaPpl: 3, sisaPml: 0 });
    expect(h.boleh).toBe(false);
    expect(h.alasan).toContain("PML");
  });
  it("menolak bila perlu_lokasi atau tidak memenuhi, dengan alasan", () => {
    const a = putusanDaftar({ jendela: buka, kelayakan: { ...ok, status: "perlu_lokasi", alasan: ["Titik domisili belum ada"] }, peran: "ppl", sisaPpl: 1, sisaPml: 1 });
    expect(a.alasan).toContain("Lengkapi lokasi");
    const b = putusanDaftar({ jendela: buka, kelayakan: { ...ok, status: "tidak", alasan: ["Jarak 30 km"] }, peran: "ppl", sisaPpl: 1, sisaPml: 1 });
    expect(b.alasan).toContain("Belum memenuhi");
  });
  it("jendela tertutup mengalahkan semuanya", () => {
    expect(putusanDaftar({ jendela: { buka: false, alasan: "Pendaftaran sudah ditutup." }, kelayakan: ok, peran: "ppl", sisaPpl: 1, sisaPml: 1 }).alasan).toBe("Pendaftaran sudah ditutup.");
  });
});

describe("teks", () => {
  it("waktu WIB", () => {
    expect(teksWaktuWib("2026-11-10T09:00:00Z")).toBe("10 Nov 2026 pukul 16.00 WIB");
    expect(teksWaktuWib(null)).toBeNull();
    expect(teksWaktuWib("bukan")).toBeNull();
  });
  it("pesan undangan memuat tautan penuh", () => {
    const t = pesanUndangan({ namaKegiatan: "Seruti TW IV", namaSeleksi: "Seleksi PPL", tutup: "2026-11-10T09:00:00Z", seleksiId: 7, asal: "https://bps-solokkab.up.railway.app/" });
    expect(t).toContain("https://bps-solokkab.up.railway.app/sigap/seleksi/7");
    expect(t).toContain("10 Nov 2026 pukul 16.00 WIB");
  });
  it("push ajakan pendek dan menuju halaman seleksi", () => {
    const p = pesanPushAjakan({ namaSeleksi: "Seleksi PPL", namaKegiatan: "Seruti TW IV", tutup: null, seleksiId: 7 });
    expect(p.url).toBe("/sigap/seleksi/7");
    expect(p.isi.length).toBeLessThanOrEqual(180);
  });
  it("peran sah", () => {
    expect(peranDaftarSah("ppl")).toBe(true);
    expect(peranDaftarSah("admin")).toBe(false);
  });
});
