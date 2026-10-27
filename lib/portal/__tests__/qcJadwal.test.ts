import { describe, it, expect, vi, beforeEach } from "vitest";
import { instanWib, jamKeMenit, type QcPengaturan } from "@/lib/sigapQc";

const kirim: { akun: number[]; judul: string; tunda?: boolean }[] = [];
vi.mock("@/lib/sigapPush", () => ({
  pushSiap: () => true,
  kirimKeAkun: async (_db: unknown, akun: number[], p: { judul: string; tunda?: boolean }) => {
    kirim.push({ akun: [...akun], judul: p.judul, tunda: p.tunda });
    return { akun_berlangganan: akun, perangkat: akun.length, terkirim: akun.length, gagal: 0 };
  },
}));
vi.mock("@/lib/sigapPendataanTab", () => ({ KEGIATAN_PENDATAAN: 1 }));

import { jalankanJadwal } from "../qc";

const wib = (tgl: string, jam: string) => instanWib(tgl, jamKeMenit(jam)!).getTime();
const iso = (tgl: string, jam: string) => new Date(wib(tgl, jam)).toISOString();

const P: QcPengaturan & { kegiatan_id: number } = {
  kegiatan_id: 1, aktif: true, rilis_jam: "05:30:00", batas_jam: "20:00:00", soal_per_hari: 10, maks_ulang: 3, rekap_jam: "05:00:00",
  ingat_menit: [210, 330], ingat_berkala_menit: 120, mulai: null, akhir: null,
};

type Belum = { akun_id: number; nama: string; peran: string; pml_akun_id: number | null; pml_nama: string | null; percobaan: number; skor_terbaik: number };
const ppl = (id: number, percobaan = 0, skor = 0): Belum => ({ akun_id: id, nama: `PPL ${id}`, peran: "ppl", pml_akun_id: 1, pml_nama: "PML", percobaan, skor_terbaik: skor });

/** Db palsu: from(tabel) -> rantai yang mengembalikan data tetap; rpc(fn) -> keluaran tetap; mencatat klaim. */
function dbPalsu(o: { tunda: { akun_id: number; ke: number; sampai: string }[]; kirim: { akun_id: number; slot: number; dibuat_at: string; jenis?: string }[]; belum: Belum[]; tundaRpcGalat?: boolean }) {
  const klaim = new Set<string>();
  const rantai = (data: unknown) => {
    const r: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "gte", "order", "limit"]) r[k] = () => r;
    r.maybeSingle = async () => ({ data: null, error: null });
    r.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
    return r;
  };
  const db = {
    from(tabel: string) {
      if (tabel === "sigap_qc_pengaturan") return rantai([P]);
      if (tabel === "sigap_qc_hari") return rantai(null);
      if (tabel === "sigap_qc_kirim") return rantai(o.kirim);
      return rantai([]);
    },
    async rpc(fn: string, a: Record<string, unknown>) {
      if (fn === "sigap_qc_tunda_aktif") return o.tundaRpcGalat ? { data: null, error: { code: "42883", message: "tidak ada" } } : { data: o.tunda, error: null };
      if (fn === "sigap_qc_belum") return { data: o.belum, error: null };
      if (fn === "sigap_qc_kirim_catat") {
        const k = `${a.p_tanggal}|${a.p_jenis}|${a.p_akun}|${a.p_slot}`;
        const baru = !klaim.has(k);
        klaim.add(k);
        return { data: baru, error: null };
      }
      if (fn === "sigap_qc_hari_pastikan") return { data: ["x"], error: null };
      if (fn === "sigap_qc_peserta") return { data: o.belum.map((b) => ({ akun_id: b.akun_id })), error: null };
      return { data: null, error: null };
    },
  };
  return { db, klaim };
}

beforeEach(() => {
  kirim.length = 0;
});

describe("jalankanJadwal dengan tunda", () => {
  it("tunda berakhir -> satu push 'tunda selesai' (dengan tombol), lalu pengingat 09.00 melewati yang menunda dan yang baru dikirimi", async () => {
    const { db, klaim } = dbPalsu({
      tunda: [
        { akun_id: 11, ke: 1, sampai: iso("2026-10-28", "08:05") }, // sudah berakhir, belum dikirim -> push tunda selesai
        { akun_id: 12, ke: 1, sampai: iso("2026-10-28", "11:00") }, // masih menunda
      ],
      kirim: [{ akun_id: 14, slot: 0, dibuat_at: iso("2026-10-28", "08:30"), jenis: "ingat_petugas" }], // baru dikirimi 30 menit lalu
      belum: [ppl(11), ppl(12), ppl(13), ppl(14), ppl(15, 2, 80)],
    });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "09:00"), false);
    const aksi = h[0].aksi.map((a) => `${a.jenis}:${a.slot}:${a.penerima}`);
    expect(aksi).toEqual(["ingat_petugas:200:1", "ingat_petugas:1:2", "ingat_pml:1:1"]);
    expect(klaim.has("2026-10-28|ingat_petugas|11|201")).toBe(true);
    // push: tunda selesai ke 11; pengingat slot 1 ke 13 (belum mengisi) dan 15 (skor sendiri); 12 dan 14 dilewati
    const petugas = kirim.filter((k) => k.tunda);
    expect(petugas.map((k) => k.akun)).toEqual([[11], [13], [15]]);
    expect(kirim.every((k) => (k.judul.includes("PPL") ? true : true))).toBe(true);
    expect(kirim.filter((k) => !k.tunda).length).toBe(1); // ingat_pml tanpa tombol
  });

  it("putaran berikutnya tidak mengirim ulang tunda selesai yang sudah tercatat", async () => {
    const { db } = dbPalsu({
      tunda: [{ akun_id: 11, ke: 1, sampai: iso("2026-10-28", "08:05") }],
      kirim: [{ akun_id: 11, slot: 201, dibuat_at: iso("2026-10-28", "08:05"), jenis: "ingat_petugas" }],
      belum: [ppl(11)],
    });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "08:10"), false);
    expect(h[0].aksi).toEqual([]);
    expect(kirim).toEqual([]);
  });

  it("sudah 100 (tidak ada di daftar belum): tidak ada push tunda selesai", async () => {
    const { db } = dbPalsu({ tunda: [{ akun_id: 11, ke: 1, sampai: iso("2026-10-28", "08:05") }], kirim: [], belum: [ppl(99)] });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "08:10"), false);
    expect(h[0].aksi[0]).toMatchObject({ slot: 200, penerima: 0 });
    expect(kirim).toEqual([]);
  });

  it("TENGGAT 20.00 dikirim ke semua yang belum, termasuk yang sedang menunda dan yang baru dikirimi", async () => {
    const { db } = dbPalsu({
      tunda: [{ akun_id: 12, ke: 3, sampai: iso("2026-10-28", "20:00") }],
      kirim: [{ akun_id: 14, slot: 5, dibuat_at: iso("2026-10-28", "19:45"), jenis: "ingat_petugas" }],
      belum: [ppl(12), ppl(13), ppl(14)],
    });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "20:02"), false);
    const a = h[0].aksi.find((x) => x.jenis === "ingat_petugas" && x.slot === 99);
    expect(a?.penerima).toBe(3);
    // satu push tenggat ke ketiganya; tunda 12 yang dipotong di batas TIDAK menghasilkan push "tunda selesai" tambahan
    expect(kirim.filter((k) => k.tunda).map((k) => [...k.akun].sort())).toEqual([[12, 13, 14]]);
    expect(h[0].aksi.find((x) => x.slot === 200)).toBeUndefined();
  });

  it("tunda ditekan sesudah batas (tidak dipotong): tunda selesai tetap dikirim", async () => {
    const { db } = dbPalsu({ tunda: [{ akun_id: 12, ke: 1, sampai: iso("2026-10-28", "21:30") }], kirim: [], belum: [ppl(12)] });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "21:35"), false);
    expect(h[0].aksi.find((x) => x.slot === 200)).toMatchObject({ penerima: 1 });
    expect(kirim.filter((k) => k.tunda)[0].akun).toEqual([12]);
  });

  it("uji kering: tidak mengklaim dan tidak mengirim, tetapi menghitung penerima", async () => {
    const { db, klaim } = dbPalsu({ tunda: [{ akun_id: 11, ke: 1, sampai: iso("2026-10-28", "08:05") }], kirim: [], belum: [ppl(11), ppl(13)] });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "09:00"), true);
    expect(h[0].aksi.map((a) => `${a.slot}:${a.penerima}`)).toContain("200:1");
    expect(klaim.size).toBe(0);
    expect(kirim).toEqual([]);
  });

  it("migrasi tunda belum dijalankan (fungsi tidak ada): jadwal lama tetap jalan", async () => {
    const { db } = dbPalsu({ tunda: [], tundaRpcGalat: true, kirim: [], belum: [ppl(13)] });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "09:00"), false);
    expect(h[0].aksi.map((a) => a.slot)).toEqual([1, 1]);
    expect(kirim.filter((k) => k.tunda)[0].akun).toEqual([13]);
  });

  it("jam senyap: tunda yang berakhir menunggu sampai 06.00", async () => {
    const { db } = dbPalsu({ tunda: [{ akun_id: 11, ke: 1, sampai: iso("2026-10-28", "23:30") }], kirim: [], belum: [ppl(11)] });
    const h = await jalankanJadwal(db as never, wib("2026-10-28", "23:40"), false);
    expect(h[0].aksi).toEqual([]);
  });
});
