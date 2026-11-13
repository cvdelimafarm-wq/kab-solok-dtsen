import { describe, expect, it } from "vitest";
import { kalimatKursi, susunKursi } from "../kursi";
import type { IsiLanjutan, Petugas } from "../lanjutan";

const pr = (nOrg: number, nMit: number, fix = true) => ({ on: true, nOrg, nMit, translok: true, penginapan: false, fix });
const mati = { on: false, nOrg: 0, nMit: 0, translok: false, penginapan: false, fix: false };
const pt = (id: string, peran: Petugas["peran"], nama: string, akun?: number, status: Petugas["status"] = "Mitra"): Petugas => ({ id, nama, menyusul: false, peran, status, sumber: "" as Petugas["sumber"], baru: false, jabatan: [], akun });
const isi = (petugas: Petugas[], fixPml = true): IsiLanjutan => ({ v: 1, wilayah: "", kelas: [], peran: { supervisor: mati, kortim: mati, pml: pr(1, 1, fixPml), ppl: pr(0, 3), entri: mati }, petugas });

describe("status kursi (Fase 2a)", () => {
  const petugas = [pt("a", "pml", "Andi", 1, "Organik"), pt("b", "pml", "Budi", 2), pt("c", "ppl", "Cici", 3), pt("d", "ppl", "Dedi", 4), pt("e", "", "Eka", 5, "Organik")];
  const tugas = [
    { ident_id: 7, fungsi: "pendataan", kegiatan_id: 6, kegiatan_nama: "Seruti", penugasan_id: 1, akun_id: 1, peran: "pml", atasan_akun_id: null, ada_st: true },
    { ident_id: 7, fungsi: "pendataan", kegiatan_id: 6, kegiatan_nama: "Seruti", penugasan_id: 2, akun_id: 3, peran: "ppl", atasan_akun_id: 1, ada_st: false },
    { ident_id: 7, fungsi: "pendataan", kegiatan_id: 6, kegiatan_nama: "Seruti", penugasan_id: 3, akun_id: 4, peran: "pml", atasan_akun_id: null, ada_st: false },
  ];
  it("Final bila lanjutan Final dan jumlah tetap; kursi tanpa nama = Rencana", () => {
    const r = susunKursi(isi(petugas), true, tugas)!;
    const pml = r.peran.find((x) => x.peran === "pml")!;
    const ppl = r.peran.find((x) => x.peran === "ppl")!;
    expect(pml).toMatchObject({ kursi: 2, terisi: 2, rencana: 0, status: "final", ditugaskan: 1, denganSt: 1 });
    expect(ppl).toMatchObject({ kursi: 3, terisi: 2, rencana: 1, status: "sementara", ditugaskan: 1 }); // akun 4 bertugas sebagai PML, bukan PPL
    expect(r.total).toMatchObject({ kursi: 5, terisi: 4, kosong: 1, final: 4, ditugaskan: 2 });
    expect(r.tanpaPeran).toBe(1);
    expect(kalimatKursi(r)).toBe("5 kursi · 4 bernama · 1 belum bernama · 4 Final · 2 ditugaskan");
  });
  it("lanjutan belum Final atau jumlah masih Perkiraan = Sementara", () => {
    expect(susunKursi(isi(petugas), false, [])!.peran.every((x) => x.status !== "final")).toBe(true);
    expect(susunKursi(isi(petugas, false), true, [])!.peran.find((x) => x.peran === "pml")!.status).toBe("sementara");
  });
  it("tanpa nama sama sekali = Rencana; tanpa isi = null", () => {
    expect(susunKursi(isi([]), true, [])!.peran.every((x) => x.status === "rencana")).toBe(true);
    expect(susunKursi(null, true, [])).toBeNull();
  });
});
