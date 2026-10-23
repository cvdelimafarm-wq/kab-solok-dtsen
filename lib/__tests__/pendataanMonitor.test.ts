import { describe, expect, it } from "vitest";
import { berhasil, persen, saringPpl, saringTim, susunMonitoring, type BarisKkMon, type PetugasMon } from "@/lib/pendataanMonitor";

// (18 Okt 2026) Tab Monitoring Kelola Pendataan -- Fase 1: progres petugas (PPL / PML / Tim).
const petugas: PetugasMon[] = [
  { petugas_id: 1, nama: "PML Satu", peran: "pml", atasan_id: null, akun_ids: [101] },
  { petugas_id: 2, nama: "PML Dua", peran: "pml", atasan_id: null, akun_ids: [102] },
  { petugas_id: 11, nama: "Ani", peran: "ppl", atasan_id: 1, akun_ids: [111] },
  { petugas_id: 12, nama: "Budi", peran: "ppl", atasan_id: 1, akun_ids: [112] },
  { petugas_id: 21, nama: "Cici", peran: "ppl", atasan_id: 2, akun_ids: [121] },
];
const sub = [
  { idsubsls: "A", pml_id: 1 },
  { idsubsls: "B", pml_id: 1 },
  { idsubsls: "GEL", pml_id: 1 }, // dibekukan
  { idsubsls: "S", pml_id: 1 }, // dipakai bersama
  { idsubsls: "S", pml_id: 2 },
  { idsubsls: "C", pml_id: 2 },
];
const nonaktif = new Set(["GEL"]);
const b = (pml_id: number, idsubsls: string, ppl_akun_id: number | null, hasil: BarisKkMon["hasil"], jumlah: number): BarisKkMon => ({ pml_id, idsubsls, ppl_akun_id, hasil, jumlah });
const baris: BarisKkMon[] = [
  b(1, "A", 111, "terdampak", 6),
  b(1, "A", 111, "tidak_terdampak", 2),
  b(1, "A", null, null, 12),
  b(1, "B", 112, "terdampak", 4),
  b(1, "B", 112, "tidak_ditemukan", 1),
  b(1, "B", 101, "terdampak", 3), // ditandai PML -> info saja
  b(1, "B", null, null, 5),
  b(1, "GEL", null, null, 99), // beku -> tidak dihitung
  b(1, "S", 111, "terdampak", 7),
  b(1, "S", null, null, 3),
  b(2, "S", 111, "terdampak", 7), // sama dengan di atas (tim lain melihat data yang sama)
  b(2, "S", null, null, 3),
  b(2, "C", 121, "terdampak", 5),
  b(2, "C", null, null, 15),
];
const d = susunMonitoring({ petugas, sub, nonaktif, baris, sekarang: "2026-10-18T00:00:00Z" });

describe("susunMonitoring", () => {
  const t1 = d.tim.find((t) => t.pml_id === 1)!;
  const t2 = d.tim.find((t) => t.pml_id === 2)!;
  it("target tim = semua KK di Sub SLS aktif (tanpa yang dibekukan)", () => {
    // A: 6+2+12=20, B: 4+1+3+5=13, S: 7+3=10 ; GEL (99) dikecualikan
    expect(t1.kk_target).toBe(43);
    expect(t1.sub).toBe(3);
    expect(t1.sub_nonaktif).toBe(1);
  });
  it("target per PPL dibagi rata: rata-rata tim pecahan, target tiap PPL bilangan bulat dan jumlahnya = target tim", () => {
    expect(t1.ppl).toBe(2);
    expect(t1.target_per_ppl).toBe(21.5);
    expect(t2.target_per_ppl).toBe(t2.kk_target);
    const tim1 = d.ppl.filter((p) => p.pml_id === 1);
    expect(tim1.map((p) => p.target)).toEqual([22, 21]); // Ani lebih dulu menurut nama, menerima sisa 1
    expect(tim1.reduce((a, p) => a + p.target, 0)).toBe(t1.kk_target);
  });
  it("hasil tim hanya dari PPL; tanda PML masuk 'oleh lain'", () => {
    expect(t1.hasil).toEqual({ terdampak: 6 + 7 + 4, tidak_terdampak: 2, tidak_ditemukan: 1 });
    expect(t1.oleh_lain).toBe(3);
    expect(berhasil(t1.hasil)).toBe(19);
  });
  it("PPL: hasil per orang, target = target per PPL timnya", () => {
    const ani = d.ppl.find((p) => p.nama === "Ani")!;
    expect(ani.hasil).toEqual({ terdampak: 13, tidak_terdampak: 2, tidak_ditemukan: 0 });
    expect(ani.target).toBe(22);
    expect(ani.pml_nama).toBe("PML Satu");
  });
  it("Sub SLS bersama: hasil PPL tidak ganda, jumlah keseluruhan dihitung sekali", () => {
    // Ani menandai S sekali walau muncul pada dua tim
    expect(d.ppl.find((p) => p.nama === "Ani")!.hasil.terdampak).toBe(13);
    expect(d.total.sub).toBe(4); // A, B, S, C
    // kk_target: A 20 + B 13 + S 10 + C 20
    expect(d.total.kk_target).toBe(63);
    expect(d.total.hasil).toEqual({ terdampak: 6 + 7 + 4 + 5, tidak_terdampak: 2, tidak_ditemukan: 1 });
    expect(d.total.ppl).toBe(3);
    expect(d.total.pml).toBe(2);
  });
  it("tim tanpa PPL: target per PPL 0 dan tidak error", () => {
    const x = susunMonitoring({ petugas: [petugas[0]], sub: [{ idsubsls: "A", pml_id: 1 }], nonaktif: new Set(), baris: [b(1, "A", null, null, 4)] });
    expect(x.tim[0].target_per_ppl).toBe(0);
    expect(x.tim[0].kk_target).toBe(4);
  });
  it("data kosong", () => {
    const x = susunMonitoring({ petugas: [], sub: [], nonaktif: new Set(), baris: [] });
    expect(x.total).toEqual({ sub: 0, kk_target: 0, ppl: 0, pml: 0, hasil: { terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 } });
  });
});

describe("persen / saring", () => {
  it("persen", () => {
    expect(persen(19, 43)).toBe(44);
    expect(persen(5, 0)).toBe(0);
  });
  it("saringPpl menurut tim dan kata kunci", () => {
    expect(saringPpl(d.ppl, 1, "").map((p) => p.nama)).toEqual(["Ani", "Budi"]);
    expect(saringPpl(d.ppl, null, "  cICi ").map((p) => p.nama)).toEqual(["Cici"]);
    expect(saringPpl(d.ppl, null, "pml dua").map((p) => p.nama)).toEqual(["Cici"]);
  });
  it("saringTim", () => {
    expect(saringTim(d.tim, 2, "").length).toBe(1);
    expect(saringTim(d.tim, null, "satu").length).toBe(1);
  });
});
