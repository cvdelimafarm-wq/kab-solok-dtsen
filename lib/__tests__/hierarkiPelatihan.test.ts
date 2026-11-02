import { describe, expect, it } from "vitest";
import { atasanEfektif, cakupanLihat, periksaHierarki, ringkasCakupan, susunPohon, type SimpulHierarki } from "@/lib/hierarkiPelatihan";

const s = (akun_id: number, nama: string, peran: SimpulHierarki["peran"], atasan: number | null, kelas: number | null = 1, tersembunyi = false): SimpulHierarki => ({ akun_id, nama, peran, atasan_akun_id: atasan, kelas, tersembunyi });

// korwil 1 > pml 2, pml 3 ; pml 2 > ppl 4, ppl 5 ; pml 3 > ppl 6 ; ppl 7 tanpa atasan ; kelas 2: pml 8 > ppl 9
const SEMUA: SimpulHierarki[] = [
  s(1, "Korwil Satu", "korwil", null),
  s(2, "Pml Dua", "pml", 1),
  s(3, "Pml Tiga", "pml", 1),
  s(4, "Ppl Empat", "ppl", 2),
  s(5, "Ppl Lima", "ppl", 2),
  s(6, "Ppl Enam", "ppl", 3),
  s(7, "Ppl Tujuh", "ppl", null),
  s(8, "Pml Delapan", "pml", null, 2),
  s(9, "Ppl Sembilan", "ppl", 8, 2),
];
const ids = (b: { simpul: SimpulHierarki }[]) => b.map((x) => x.simpul.akun_id);

describe("atasanEfektif", () => {
  const peta = (l: SimpulHierarki[]) => new Map(l.map((x) => [x.akun_id, x]));
  it("atasan langsung bila ada", () => expect(atasanEfektif(4, peta(SEMUA))).toBe(2));
  it("tanpa atasan -> null", () => expect(atasanEfektif(7, peta(SEMUA))).toBeNull());
  it("jenjang kosong dilompati: PPL tanpa PML langsung ke korwil", () => {
    const l = [s(1, "K", "korwil", null), s(4, "P", "ppl", 1)];
    expect(atasanEfektif(4, peta(l))).toBe(1);
  });
  it("atasan tersembunyi (menolak undangan) dilompati ke atasan berikutnya", () => {
    const l = [s(1, "K", "korwil", null), s(2, "M", "pml", 1, 1, true), s(4, "P", "ppl", 2)];
    expect(atasanEfektif(4, peta(l))).toBe(1);
  });
  it("atasan yang bukan peserta memutus rantai", () => expect(atasanEfektif(4, peta([s(4, "P", "ppl", 99)]))).toBeNull());
  it("siklus tidak menggantung", () => {
    const l = [s(1, "A", "pml", 2), s(2, "B", "pml", 1)];
    expect(atasanEfektif(1, peta(l))).toBe(2);
    expect(susunPohon(l, null)).toHaveLength(2); // keduanya tetap tampil
  });
});

describe("cakupanLihat", () => {
  it("PPL hanya dirinya", () => {
    const b = cakupanLihat({ jenis: "peserta", akun_id: 4 }, SEMUA);
    expect(ids(b)).toEqual([4]);
    expect(b[0].diri).toBe(true);
  });
  it("PML: dirinya + PPL bawahannya, urut nama", () => {
    const b = cakupanLihat({ jenis: "peserta", akun_id: 2 }, SEMUA);
    expect(ids(b)).toEqual([2, 4, 5]);
    expect(b.map((x) => x.kedalaman)).toEqual([0, 1, 1]);
  });
  it("korwil: dirinya + PML + PPL di bawahnya", () => {
    const b = cakupanLihat({ jenis: "peserta", akun_id: 1 }, SEMUA);
    expect(ids(b)).toEqual([1, 2, 4, 5, 3, 6]);
    expect(b.map((x) => x.kedalaman)).toEqual([0, 1, 2, 2, 1, 2]);
  });
  it("jenjang kosong dilompati saat melihat ke bawah: PML hilang -> PPL naik ke korwil", () => {
    const l = SEMUA.map((x) => (x.akun_id === 2 ? { ...x, tersembunyi: true } : x));
    const b = cakupanLihat({ jenis: "peserta", akun_id: 1 }, l);
    expect(ids(b)).toEqual([1, 3, 6, 4, 5]); // saudara berurut PML dahulu, lalu PPL yang naik
    expect(b.slice(1).map((x) => x.kedalaman)).toEqual([1, 2, 1, 1]);
  });
  it("peserta yang menolak (tersembunyi) tidak melihat apa pun dan tidak tampil bagi atasannya", () => {
    const l = SEMUA.map((x) => (x.akun_id === 4 ? { ...x, tersembunyi: true } : x));
    expect(cakupanLihat({ jenis: "peserta", akun_id: 4 }, l)).toEqual([]);
    expect(ids(cakupanLihat({ jenis: "peserta", akun_id: 2 }, l))).toEqual([2, 5]);
  });
  it("akun yang bukan peserta pelatihan -> kosong", () => expect(cakupanLihat({ jenis: "peserta", akun_id: 123 }, SEMUA)).toEqual([]));
  it("instruktur: hanya kelasnya", () => {
    const b = cakupanLihat({ jenis: "instruktur", kelas: 2 }, SEMUA);
    expect(ids(b)).toEqual([8, 9]);
    expect(b.every((x) => !x.diri)).toBe(true);
  });
  it("instruktur kelas 1: atasan di luar kelas tidak dihitung", () => {
    const l = [s(1, "K", "korwil", null, 2), s(2, "M", "pml", 1, 1), s(4, "P", "ppl", 2, 1)];
    expect(ids(cakupanLihat({ jenis: "instruktur", kelas: 1 }, l))).toEqual([2, 4]);
  });
  it("panitia: semua kelas, akar tanpa atasan", () => {
    const b = cakupanLihat({ jenis: "panitia" }, SEMUA);
    expect(ids(b).sort((a, c) => a - c)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(b.filter((x) => x.kedalaman === 0).map((x) => x.simpul.akun_id).sort()).toEqual([1, 7, 8]);
  });
  it("Seruti: tanpa korwil, PML berdiri sendiri dan PPL tanpa PML terlihat panitia", () => {
    const l = [s(2, "Pml A", "pml", null, null), s(4, "Ppl A", "ppl", 2, null), s(7, "Ppl Lepas", "ppl", null, null)];
    expect(ids(cakupanLihat({ jenis: "peserta", akun_id: 2 }, l))).toEqual([2, 4]);
    expect(ids(cakupanLihat({ jenis: "instruktur", kelas: null }, l))).toEqual([2, 4, 7]);
  });
});

describe("periksaHierarki", () => {
  it("data bersih: hanya PPL/PML tanpa atasan yang dilaporkan", () => {
    const m = periksaHierarki(SEMUA);
    expect(m.siklus).toEqual([]);
    expect(m.atasan_asing).toEqual([]);
    expect(m.tanpa_atasan.sort((a, b) => a - b)).toEqual([7, 8]);
  });
  it("atasan asing dan siklus terdeteksi", () => {
    const m = periksaHierarki([s(1, "A", "pml", 2), s(2, "B", "pml", 1), s(3, "C", "ppl", 77)]);
    expect(m.siklus.sort()).toEqual([1, 2]);
    expect(m.atasan_asing).toEqual([3]);
  });
});

describe("ringkasCakupan", () => {
  it("peserta: Anda + jumlah per peran", () => expect(ringkasCakupan(cakupanLihat({ jenis: "peserta", akun_id: 1 }, SEMUA))).toBe("Anda + 2 PML, 3 PPL"));
  it("PPL: hanya Anda", () => expect(ringkasCakupan(cakupanLihat({ jenis: "peserta", akun_id: 4 }, SEMUA))).toBe("Hanya Anda"));
  it("panitia: tanpa 'Anda'", () => expect(ringkasCakupan(cakupanLihat({ jenis: "panitia" }, SEMUA))).toBe("1 Korwil, 3 PML, 5 PPL"));
  it("kosong", () => expect(ringkasCakupan([])).toBe("Belum ada peserta"));
});
