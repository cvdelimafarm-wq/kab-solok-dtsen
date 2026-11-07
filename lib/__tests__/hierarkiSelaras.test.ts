import { describe, expect, it } from "vitest";
import { saringHierarkiAktif, selisihDenganTim } from "@/lib/hierarkiSelaras";
import type { SimpulHierarki } from "@/lib/hierarkiPelatihan";

const s = (akun_id: number, nama: string, peran: SimpulHierarki["peran"], atasan: number | null): SimpulHierarki => ({ akun_id, nama, peran, atasan_akun_id: atasan, kelas: null });

// kasus nyata Seruti TW IV (7 Nov 2026): Yola dan Jihan masih di bawah Aprila, padahal Stage 1 menaruh Yola di bawah Nurafiza dan Jihan tidak ikut
const SIMPUL: SimpulHierarki[] = [
  s(464, "Nurafiza", "pml", null),
  s(200, "Faisal", "pml", null),
  s(64, "Aprila", "pml", null),
  s(736, "Yola", "ppl", 64),
  s(317, "Jihan", "ppl", 64),
  s(354, "Iqbal", "ppl", null),
  s(691, "Wahyuni", "ppl", 200),
];

describe("selisihDenganTim", () => {
  it("menandai atasan yang berbeda, mengabaikan yang sama dan baris Tim tanpa atasan", () => {
    const r = selisihDenganTim(SIMPUL, [
      { akun_id: 736, atasan_akun_id: 464 }, // beda
      { akun_id: 691, atasan_akun_id: 354 }, // beda, atasan = Iqbal (ppl di pelatihan)
      { akun_id: 64, atasan_akun_id: 200 }, // Aprila: atasan null -> Faisal
      { akun_id: 464, atasan_akun_id: null }, // kosong di Tim: diabaikan
    ]);
    expect(r.map((x) => x.nama)).toEqual(["Aprila", "Wahyuni", "Yola"]);
    const yola = r.find((x) => x.nama === "Yola")!;
    expect(yola).toMatchObject({ atasan_sekarang_nama: "Aprila", atasan_tim_nama: "Nurafiza", bisa: true, atasan_ppl: false });
    expect(r.find((x) => x.nama === "Wahyuni")).toMatchObject({ bisa: true, atasan_ppl: true });
  });
  it("sudah sama: tidak ada selisih", () => {
    expect(selisihDenganTim(SIMPUL, [{ akun_id: 691, atasan_akun_id: 200 }])).toEqual([]);
  });
  it("peserta yang tidak ada di pelatihan (mis. Jihan dicabut atau peserta Tim saja) diabaikan", () => {
    expect(selisihDenganTim(SIMPUL.filter((x) => x.akun_id !== 317), [{ akun_id: 317, atasan_akun_id: 464 }, { akun_id: 999, atasan_akun_id: 464 }])).toEqual([]);
  });
  it("atasan Tim yang bukan peserta pelatihan: tidak bisa diterapkan, dengan alasan", () => {
    const r = selisihDenganTim(SIMPUL, [{ akun_id: 736, atasan_akun_id: 12345 }]);
    expect(r[0]).toMatchObject({ bisa: false, atasan_tim_nama: null });
    expect(r[0].alasan).toMatch(/bukan peserta/);
  });
  it("atasan menurut Tim adalah dirinya sendiri: tidak bisa", () => {
    const r = selisihDenganTim(SIMPUL, [{ akun_id: 736, atasan_akun_id: 736 }]);
    expect(r[0].bisa).toBe(false);
  });
});

describe("saringHierarkiAktif", () => {
  const baris = [{ akun_id: 1 }, { akun_id: 2 }, { akun_id: 3 }];
  it("hanya yang penugasannya aktif", () => expect(saringHierarkiAktif(baris, new Set([1, 3])).map((x) => x.akun_id)).toEqual([1, 3]));
  it("daftar penugasan gagal dibaca (null): tidak menyaring", () => expect(saringHierarkiAktif(baris, null)).toHaveLength(3));
  it("tidak ada yang aktif: kosong", () => expect(saringHierarkiAktif(baris, new Set())).toEqual([]));
});

describe("pemasangan (pemindaian sumber)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const baca = (rel: string) => require("node:fs").readFileSync(require("node:path").resolve(__dirname, "..", "..", rel), "utf8") as string;
  it("muatSimpulHierarki menyaring baris hierarki yatim sebelum membentuk peserta", () => {
    const src = baca("lib/sigapPelatihanBaruDb.ts");
    const f = src.slice(src.indexOf("export async function muatSimpulHierarki"), src.indexOf("export async function muatPenolak"));
    expect(f.indexOf("saringHierarkiAktif(")).toBeGreaterThan(-1);
    expect(f.indexOf("saringHierarkiAktif(")).toBeLessThan(f.indexOf("const peranPer"));
  });
  it("API: GET memuat selisih_tim; POST samakan_tim memakai terapkanPerubahan dan hanya yang bisa", () => {
    const src = baca("app/api/sigap/pelatihan/hierarki/route.ts");
    expect(src).toMatch(/selisih_tim/);
    const b = src.slice(src.indexOf('body.aksi === "samakan_tim"'), src.indexOf('body.aksi === "atur"'));
    expect(b).toMatch(/filter\(\(x\) => x\.bisa\)/);
    expect(b).toMatch(/terapkanPerubahan\(/);
    expect(b).toMatch(/catatAudit\(/);
  });
  it("layar: tombol salin PSP hanya bila tidak ada Tim acuan; tombol samakan memanggil aksi samakan_tim", () => {
    const src = baca("app/sigap/pelatihan/kelola/hierarki.tsx");
    expect(src).toMatch(/!d\.tim && \(/);
    expect(src).toMatch(/aksi: "samakan_tim"/);
  });
});
