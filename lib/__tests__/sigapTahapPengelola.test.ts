// (3 Nov 2026) Panitia / instruktur yang BUKAN peserta tetap melihat kartu Pelatihan di Beranda (dulu hilang: tahap pelatihan tak punya modul bagi non-peserta).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ringkasInduk, susunTahap, type Induk, type KonteksTahap, type TahapDef } from "../sigapTahap";
import { aktivitasDariInduk } from "../sigapAktivitas";

const mockIzin = vi.fn();
vi.mock("@/lib/sigapAkses", async (asli) => ({ ...(await asli<typeof import("../sigapAkses")>()), izinAkun: (...a: unknown[]) => mockIzin(...a) }));

const T = (kode: string, urutan: number, isi: string[]): TahapDef => ({ kode, urutan, nama: kode, uraian: null, isi, buka_mode: "langsung", buka_tanggal: null });
const INDUK = (ekstra: Partial<Induk> = {}): Induk => ({
  kode: "seruti_tw4", nama: "Seruti TW IV", pendek: "Seruti TW IV", ikon: "bencana", menyerap: [],
  tahap: [T("pelatihan", 1, ["pelatihan", "translok:7"]), T("pendataan", 2, ["translok:6"])],
  perencanaan: null, wilayah: null, ...ekstra,
});
const K = (induk: Induk, ekstra: Partial<KonteksTahap> = {}): KonteksTahap => ({ induk, hub: null, hubMuat: "siap", keg: [], nowMs: Date.parse("2026-11-03T03:00:00Z"), ...ekstra });

describe("kartu Pelatihan bagi pengelola yang bukan peserta", () => {
  it("bukan peserta dan bukan pengelola: tidak ada kartu (perilaku lama)", () => {
    expect(aktivitasDariInduk(K(INDUK()))).toEqual([]);
  });
  it("panitia: tahap pelatihan tampil dengan modul Pantau pelatihan menuju ?kegiatan=7", () => {
    const t = susunTahap(K(INDUK({ pengelola: { 7: "panitia" } })));
    expect(t).toHaveLength(1);
    expect(t[0].modul[0]).toMatchObject({ judul: "Pantau pelatihan", href: "/sigap/pelatihan?kegiatan=7", status: "berjalan" });
    expect(t[0].modul[0].ket).toContain("panitia");
    const akt = aktivitasDariInduk(K(INDUK({ pengelola: { 7: "panitia" } })));
    expect(akt).toHaveLength(1);
    expect(akt[0]).toMatchObject({ judul: "Pelatihan Seruti TW IV", jenis: "pelatihan", href: "/sigap/pelatihan?kegiatan=7" });
    expect(ringkasInduk(K(INDUK({ pengelola: { 7: "panitia" } })))).not.toBeNull();
  });
  it("instruktur: teks menyebut kelas Anda; peran di pelatihan lain tidak berlaku di kegiatan ini", () => {
    expect(susunTahap(K(INDUK({ pengelola: { 7: "instruktur" } })))[0].modul[0].ket).toContain("instruktur");
    expect(susunTahap(K(INDUK({ pengelola: { 3: "panitia" } })))).toEqual([]);
  });
  it("tahap Pendataan (translok kegiatan 6) tidak ikut bila akun tak punya penugasannya", () => {
    expect(aktivitasDariInduk(K(INDUK({ pengelola: { 7: "panitia" } }))).map((a) => a.jenis)).toEqual(["pelatihan"]);
  });
  it("sebelum hub siap, tampilan lama ('Memuat…') tidak berubah", () => {
    expect(susunTahap(K(INDUK({ pengelola: { 7: "panitia" } }), { hubMuat: "memuat" }))[0].modul[0].ket).toBe("Memuat…");
  });
});

describe("pengelolaPelatihan (server)", () => {
  beforeEach(() => {
    mockIzin.mockReset();
  });
  const db = (kegiatanInstruktur: number[]) => ({
    from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: kegiatanInstruktur.map((kegiatan_id) => ({ kegiatan_id })) }) }) }) }),
  });
  it("panitia didahulukan atas instruktur; selain itu kosong", async () => {
    const { pengelolaPelatihan } = await import("../portal/pengelolaPelatihan");
    mockIzin.mockResolvedValue({ peran: [], izin: { "pelatihan.kelola": { level: "lihat", semua: false, kegiatan: [7] } } });
    const h = await pengelolaPelatihan(db([7, 3]) as never, 354, [3, 7, 9]);
    expect(h.get(7)).toBe("panitia");
    expect(h.get(3)).toBe("instruktur");
    expect(h.has(9)).toBe(false);
  });
  it("izin gagal dibaca: kosong, tidak melempar", async () => {
    const { pengelolaPelatihan } = await import("../portal/pengelolaPelatihan");
    mockIzin.mockImplementation(() => { throw new Error("x"); });
    expect((await pengelolaPelatihan(db([]) as never, 1, [7])).size).toBe(0);
  });
});
