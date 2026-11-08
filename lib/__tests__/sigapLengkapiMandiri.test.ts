import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MAKS_FOTO_KURANG_MANDIRI,
  bolehLengkapiMandiri,
  hitungKekurangan,
  olehMelepas,
  olehMengembalikan,
  tanggalDapatDipulihkan,
} from "@/lib/sigapLengkapiMandiri";
import { cekAksesIsian } from "@/lib/sigap";

const ATURAN = { wajib_laporan: true, jumlah_foto: 5 };

describe("hitungKekurangan / bolehLengkapiMandiri", () => {
  it("hari kosong: laporan + 5 foto kurang -> terlalu banyak foto yang kurang", () => {
    const k = hitungKekurangan(false, false, 0, ATURAN);
    expect(k).toEqual({ laporanKurang: true, fotoKurang: 5 });
    expect(bolehLengkapiMandiri(k)).toEqual({ boleh: false, alasan: "foto_terlalu_kurang" });
  });
  it("kurang tepat batas (2 foto) masih boleh", () => {
    const k = hitungKekurangan(true, false, 5 - MAKS_FOTO_KURANG_MANDIRI, ATURAN);
    expect(bolehLengkapiMandiri(k)).toEqual({ boleh: true });
  });
  it("kurang 3 foto ditolak", () => {
    expect(bolehLengkapiMandiri(hitungKekurangan(true, false, 2, ATURAN))).toEqual({ boleh: false, alasan: "foto_terlalu_kurang" });
  });
  it("hanya laporan yang kurang boleh; lengkap ditolak", () => {
    expect(bolehLengkapiMandiri(hitungKekurangan(false, false, 5, ATURAN))).toEqual({ boleh: true });
    expect(bolehLengkapiMandiri(hitungKekurangan(true, false, 5, ATURAN))).toEqual({ boleh: false, alasan: "lengkap" });
  });
  it("laporan dianggap atau kegiatan tanpa laporan tidak dihitung kurang", () => {
    expect(hitungKekurangan(false, true, 4, ATURAN).laporanKurang).toBe(false);
    expect(hitungKekurangan(false, false, 4, { wajib_laporan: false, jumlah_foto: 5 }).laporanKurang).toBe(false);
  });
});

describe("tanggalDapatDipulihkan", () => {
  const hariIni = "2026-11-08";
  const r = (id: number, tanggal: string, aksi: string, oleh: string | null) => ({ id, tanggal, aksi, oleh });
  it("hanya pelepasan terakhir oleh petugas yang sama dan belum hari kerja", () => {
    const riwayat = [
      r(1, "2026-11-02", "hapus", olehMelepas("Oryza")),
      r(2, "2026-11-03", "hapus", olehMelepas("Budi")), // petugas lain
      r(3, "2026-11-04", "hapus", "admin:Iqbal"), // dilepas admin
      r(4, "2026-11-05", "hapus", olehMelepas("Oryza")),
      r(5, "2026-11-05", "tambah", olehMengembalikan("Oryza")), // sudah dikembalikan
      r(6, "2026-11-06", "hapus", olehMelepas("Oryza")), // sekarang hari kerja lagi
      r(7, "2026-11-09", "hapus", olehMelepas("Oryza")), // belum lewat
    ];
    expect(tanggalDapatDipulihkan(riwayat, "Oryza", hariIni, new Set(["2026-11-06"]))).toEqual(["2026-11-02"]);
  });
  it("urutan ditentukan id, bukan urutan larik", () => {
    const riwayat = [r(9, "2026-11-02", "tambah", olehMengembalikan("Oryza")), r(3, "2026-11-02", "hapus", olehMelepas("Oryza"))];
    expect(tanggalDapatDipulihkan(riwayat, "Oryza", hariIni, new Set())).toEqual([]);
    const lagi = [r(3, "2026-11-02", "tambah", "petugas:Oryza"), r(9, "2026-11-02", "hapus", olehMelepas("Oryza"))];
    expect(tanggalDapatDipulihkan(lagi, "Oryza", hariIni, new Set())).toEqual(["2026-11-02"]);
  });
});

// ---- cekAksesIsian dengan jalur lengkapiMandiri ----
type Tabel = Record<string, Record<string, unknown>[]>;
function fakeDb(t: Tabel) {
  return {
    from(nama: string) {
      let rows = [...(t[nama] ?? [])];
      const q: Record<string, unknown> = {};
      const kembali = () => q;
      for (const m of ["select", "order", "limit", "or", "not", "gt", "lt", "in", "is", "neq"]) q[m] = kembali;
      q.eq = (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q; };
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
      return q;
    },
  } as never;
}
const baseTabel = (foto: number, ada: boolean, ekstra: Partial<Tabel> = {}): Tabel => ({
  sigap_penugasan: [{ id: 10, akun_id: 1, kegiatan_id: 3, peran: "ppl", maks_hari: null, surat_tugas_id: null, dikunci_at: null, aktif: true }],
  sigap_kegiatan: [{ id: 3, kode: "pascabencana", nama: "PSP", kode_anggaran: null, satuan_realisasi: "ruta", tanggal_mulai: "2026-10-01", tanggal_selesai: "2026-12-31", aktif: true, hari_tenggang: 30, dibuka_sampai: null, jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 }],
  sigap_kegiatan_tarif: [{ kegiatan_id: 3, peran: "ppl", tarif: 170000, label_jabatan: "PPL", maks_hari_default: null }],
  sigap_surat_tugas: [],
  sigap_translok_blokir: [],
  sigap_hari_kerja: [{ id: 1, penugasan_id: 10, tanggal: "2026-11-02" }],
  sigap_izin_susulan: [],
  sigap_realisasi: ada ? [{ id: 1, penugasan_id: 10, tanggal: "2026-11-02" }] : [],
  sigap_dokumentasi: Array.from({ length: foto }, (_, i) => ({ penugasan_id: 10, tanggal: "2026-11-02", slot: i + 1 })),
  ...ekstra,
});

describe("cekAksesIsian lengkapiMandiri", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T05:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("tanpa opsi, hari lampau tetap ditolak", async () => {
    const h = await cekAksesIsian(fakeDb(baseTabel(4, false)), 1, 10, "2026-11-02");
    expect("error" in h && h.status).toBe(403);
  });
  it("dengan opsi, kurang 1 foto + laporan boleh dan bertanda mandiri/susulan", async () => {
    const h = await cekAksesIsian(fakeDb(baseTabel(4, false)), 1, 10, "2026-11-02", { lengkapiMandiri: true });
    expect("error" in h).toBe(false);
    if (!("error" in h)) { expect(h.mandiri).toBe(true); expect(h.susulan).toBe(true); }
  });
  it("kurang 3 foto ditolak dengan pesan batas", async () => {
    const h = await cekAksesIsian(fakeDb(baseTabel(2, true)), 1, 10, "2026-11-02", { lengkapiMandiri: true });
    expect("error" in h && h.error).toMatch(/lebih dari 2/);
  });
  it("hari yang sudah lengkap ditolak", async () => {
    const h = await cekAksesIsian(fakeDb(baseTabel(5, true)), 1, 10, "2026-11-02", { lengkapiMandiri: true });
    expect("error" in h && h.error).toMatch(/sudah lengkap/);
  });
  it("SPJ dikunci admin tetap menolak", async () => {
    const t = baseTabel(4, false);
    t.sigap_penugasan[0].dikunci_at = "2026-11-05T00:00:00Z";
    const h = await cekAksesIsian(fakeDb(t), 1, 10, "2026-11-02", { lengkapiMandiri: true });
    expect("error" in h && h.error).toMatch(/dikunci/);
  });
  it("tanggal yang bukan hari kerja (sudah dilepas) tetap ditolak", async () => {
    const h = await cekAksesIsian(fakeDb(baseTabel(4, false, { sigap_hari_kerja: [] })), 1, 10, "2026-11-02", { lengkapiMandiri: true });
    expect("error" in h && h.status).toBe(400);
  });
});

import { kunciSls, pakaiFormSls, susunLaporanSls } from "@/lib/sigapLengkapiMandiri";

describe("susunLaporanSls", () => {
  const m = { kecamatan: "Gunung Talang", nagari: "Cupak", jorong: "Jorong A" };
  const master = new Set([kunciSls(m), kunciSls({ kecamatan: "Kubung", nagari: "Salayo", jorong: "Jorong B" })]);
  const baris = (x: Partial<Record<string, unknown>> = {}) => ({ ...m, terdampak: 10, tidak_terdampak: 5, tidak_ditemukan: 2, ...x });
  it("menjumlahkan tiga angka dari semua SLS", () => {
    const h = susunLaporanSls([baris(), { kecamatan: "Kubung", nagari: "Salayo", jorong: "Jorong B", terdampak: 1, tidak_terdampak: 0, tidak_ditemukan: 0 }], master);
    expect("error" in h).toBe(false);
    if (!("error" in h)) expect(h.jumlah).toBe(18);
  });
  it("menolak kosong, SLS di luar master, ganda, angka tidak sah, dan total terlalu besar", () => {
    expect(susunLaporanSls([], master)).toHaveProperty("error");
    expect(susunLaporanSls([baris({ jorong: "Tidak Ada" })], master)).toHaveProperty("error");
    expect(susunLaporanSls([baris(), baris()], master)).toHaveProperty("error");
    expect(susunLaporanSls([baris({ terdampak: -1 })], master)).toHaveProperty("error");
    expect(susunLaporanSls([baris({ terdampak: 1.5 })], master)).toHaveProperty("error");
    expect(susunLaporanSls([baris({ terdampak: "5" })], master)).toHaveProperty("error");
    expect(susunLaporanSls([baris({ terdampak: 500, tidak_terdampak: 1 })], master)).toHaveProperty("error");
  });
  it("form SLS hanya untuk Pascabencana", () => {
    expect(pakaiFormSls("pascabencana-psp")).toBe(true);
    expect(pakaiFormSls("seruti-tw4")).toBe(false);
  });
});
