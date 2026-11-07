import { describe, expect, it } from "vitest";
import { kalimatSelisih, selisihPenugasan, type BarisPenugasanKegiatan, type ButirLanjutan } from "@/lib/keu/samakanPenugasan";

const b = (kode: string, nama: string, peran: string | null, akun: number | null, status = "sudah_ada"): ButirLanjutan => ({ kode, nama, peran_sigap: peran, akun_id: akun, status });
const p = (id: number, akun: number, nama: string, peran: string, aktif = true, sumber: string | null = "admin:354"): BarisPenugasanKegiatan => ({ id, akun_id: akun, nama, peran, aktif, sumber });
const TARIF = new Set(["ppl", "pml", "supervisor", "entri"]);

// kasus nyata Seruti TW IV (7 Nov 2026): Aprila dari PML menjadi PPL, Jihan dicoret
const BUTIR: ButirLanjutan[] = [b("p8", "APRILA", "ppl", 64), b("p10", "Nisa", "ppl", 444), b("p1", "Iqbal", "pml", 354)];
const PEN: BarisPenugasanKegiatan[] = [p(1, 64, "APRILA", "pml"), p(2, 317, "Jihan", "ppl"), p(3, 444, "Nisa", "ppl"), p(4, 354, "Iqbal", "pml")];

describe("selisihPenugasan", () => {
  it("peran berubah -> ubah_peran; yang dicoret -> cabut; yang sama diabaikan", () => {
    const { selisih } = selisihPenugasan(BUTIR, PEN, [], TARIF);
    expect(selisih.map((s) => [s.nama, s.aksi])).toEqual([["APRILA", "ubah_peran"], ["Jihan", "cabut"]]);
    expect(selisih[0]).toMatchObject({ dari: { peran: "pml", aktif: true }, ke: { peran: "ppl", aktif: true }, bisa: true });
    expect(selisih[1]).toMatchObject({ ke: { peran: null, aktif: false }, penugasan_id: 2 });
  });
  it("penugasan nonaktif yang disebut lanjutan -> aktifkan dengan peran lanjutan", () => {
    const { selisih } = selisihPenugasan([b("p1", "Jihan", "ppl", 317)], [p(2, 317, "Jihan", "ppl", false)], [], TARIF);
    expect(selisih).toHaveLength(1);
    expect(selisih[0]).toMatchObject({ aksi: "aktifkan", ke: { peran: "ppl", aktif: true } });
  });
  it("nonaktif dan tidak disebut lanjutan: tidak ada tindakan", () => {
    expect(selisihPenugasan([], [p(2, 317, "Jihan", "ppl", false)], [], TARIF).selisih).toEqual([]);
  });
  it("penugasan bersumber administrasi (panitia) tidak disentuh", () => {
    expect(selisihPenugasan([], [p(9, 18, "Akbari", "pj_pengolahan", true, "administrasi")], [], TARIF).selisih).toEqual([]);
  });
  it("peran tujuan tanpa tarif: tidak bisa diterapkan, ada catatan", () => {
    const { selisih } = selisihPenugasan([b("p1", "X", "korwil", 5)], [p(7, 5, "X", "ppl")], [], TARIF);
    expect(selisih[0]).toMatchObject({ aksi: "ubah_peran", bisa: false });
    expect(selisih[0].catatan).toMatch(/tarif/);
  });
  it("tarif tidak diketahui (null): tidak diperiksa", () => {
    expect(selisihPenugasan([b("p1", "X", "korwil", 5)], [p(7, 5, "X", "ppl")], [], null).selisih[0].bisa).toBe(true);
  });
  it("butir tanpa akun (menyusul, tidak ada, ambigu, peran kosong) tidak dianggap mencoret siapa pun, dan nama yang belum tertaut diperingatkan", () => {
    const r = selisihPenugasan([b("p9", "Nama Baru", "ppl", null, "tidak_ada"), b("p10", "", null, null, "menyusul")], [p(1, 64, "APRILA", "ppl")], [], TARIF);
    expect(r.selisih.map((s) => s.aksi)).toEqual(["cabut"]); // Aprila memang tidak disebut
    expect(r.peringatan).toHaveLength(1);
    expect(r.peringatan[0]).toMatch(/belum tertaut/);
  });
  it("surat tugas dengan peran berbeda dilaporkan; yang sudah sesuai tidak", () => {
    const { selisih } = selisihPenugasan(BUTIR, PEN, [
      { penugasan_id: 1, nomor_st: "ST-1", peran_tertera: "PML" },
      { penugasan_id: 1, nomor_st: "ST-2", peran_tertera: "ppl" },
      { penugasan_id: 2, nomor_st: "ST-3", peran_tertera: "ppl" },
    ], TARIF);
    expect(selisih[0].surat).toEqual([{ nomor_st: "ST-1", peran_tertera: "PML" }]);
    expect(selisih[1].surat).toEqual([{ nomor_st: "ST-3", peran_tertera: "ppl" }]); // dicabut: semua surat dilaporkan
  });
  it("urutan: ubah_peran, aktifkan, cabut", () => {
    const r = selisihPenugasan([b("a", "Z", "ppl", 1), b("b", "Y", "pml", 2)], [p(1, 1, "Z", "ppl", false), p(2, 2, "Y", "ppl"), p(3, 3, "W", "ppl")], [], TARIF);
    expect(r.selisih.map((s) => s.aksi)).toEqual(["ubah_peran", "aktifkan", "cabut"]);
  });
  it("kalimat ringkas", () => {
    const { selisih } = selisihPenugasan(BUTIR, PEN, [], TARIF);
    expect(kalimatSelisih(selisih[0])).toBe("peran pml → ppl");
    expect(kalimatSelisih(selisih[1])).toMatch(/dinonaktifkan/);
  });
});

describe("pemasangan (pemindaian sumber)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const baca = (rel: string) => require("node:fs").readFileSync(require("node:path").resolve(__dirname, "..", "..", "..", rel), "utf8") as string;
  it("route: mode masuk-sebagai ditolak untuk POST dan mengirim hanya yang berhak", () => {
    const src = baca("app/api/sigap/keu/samakan-penugasan/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.indexOf("aktorId !== null")).toBeGreaterThan(-1);
    expect(post.indexOf("aktorId !== null")).toBeLessThan(post.indexOf("terapkanSamakan("));
  });
  it("server: terapkan memeriksa hak, status Final, dan mencatat audit", () => {
    const src = baca("lib/keu/samakanPenugasanDb.ts");
    const f = src.slice(src.indexOf("export async function terapkanSamakan"));
    expect(f).toMatch(/boleh_terapkan/);
    expect(f).toMatch(/!data\.final/);
    expect(f).toMatch(/catatAudit\(/);
    expect(f.indexOf("!data.final")).toBeLessThan(f.indexOf('.from("sigap_penugasan").update'));
  });
  it("server: pembatalan tidak menghapus penugasan (hanya menonaktifkan)", () => {
    const src = baca("lib/keu/samakanPenugasanDb.ts");
    expect(src).not.toMatch(/from\("sigap_penugasan"\)\.delete/);
  });
  it("halaman: BlokSamakan dipasang di KartuUsulan dan memuat ulang halaman sesudah menerapkan", () => {
    const kartu = baca("app/sigap/kelola/perencanaan/identifikasi/[id]/pelaksanaan/Kartu.tsx");
    expect(kartu).toMatch(/<BlokSamakan /);
    expect(baca("app/sigap/kelola/perencanaan/identifikasi/[id]/pelaksanaan/page.tsx")).toMatch(/onBerubah=\{muatSemua\}/);
  });
});
