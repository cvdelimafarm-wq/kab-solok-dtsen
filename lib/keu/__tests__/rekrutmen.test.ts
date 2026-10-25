// lib/keu/__tests__/rekrutmen.test.ts
//
// (26 Okt 2026, tahap 34) Uji rekrutmen mitra: status per mitra, kebutuhan per peran, tenggat SPK, dan catatan ringkasan.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import type { IsiLanjutan } from "../lanjutan";
import { LABEL_MITRA, ringkasRekrutmen, statusMitra, teksTenggat, tenggatPeran } from "../rekrutmen";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const dasar = (): IsiLanjutan => salin(vektor.base) as unknown as IsiLanjutan;
const PENDATAAN = [{ mulai: "2026-03-10" }];
const HARI = "2026-02-01";

describe("statusMitra", () => {
  const isi = dasar();
  const [, budi, citra] = isi.petugas;
  it("bernama tanpa dokumen = siap SPK; konsep; terbit", () => {
    expect(statusMitra(budi, [])).toBe("siap_spk");
    expect(statusMitra(budi, [{ jenis: "tugas", kunci: "p2", status: "konsep" }])).toBe("spk_konsep");
    expect(statusMitra(budi, [{ jenis: "tugas", kunci: "p2", status: "terbit" }])).toBe("spk_terbit");
  });
  it("dokumen jenis lain atau kunci lain tidak dihitung", () => {
    expect(statusMitra(budi, [{ jenis: "undangan", kunci: "p2", status: "terbit" }, { jenis: "tugas", kunci: "p3", status: "terbit" }])).toBe("siap_spk");
  });
  it("tanpa nama: seleksi atau kepka; spasi saja dianggap kosong", () => {
    expect(statusMitra({ ...citra, nama: "", menyusul: true }, [])).toBe("menunggu_seleksi");
    expect(statusMitra({ ...budi, nama: "   ", menyusul: false }, [])).toBe("menunggu_nama");
    expect(statusMitra({ ...budi, nama: "", menyusul: true }, [])).toBe("menunggu_nama");
  });
  it("bernama tetapi peran belum dipilih", () => {
    expect(statusMitra({ ...budi, peran: "" }, [])).toBe("peran_kosong");
    expect(statusMitra({ ...budi, peran: "" }, [{ jenis: "tugas", kunci: "p2", status: "terbit" }])).toBe("spk_terbit");
  });
});

describe("tenggatPeran", () => {
  it("mulai kelas paling awal yang diikuti peran; peran lain memakai pendataan", () => {
    const isi = dasar();
    expect(tenggatPeran(isi, "pml", PENDATAAN)).toBe("2026-03-02");
    expect(tenggatPeran(isi, "supervisor", PENDATAAN)).toBe("2026-03-10");
    expect(tenggatPeran(isi, "", PENDATAAN)).toBe("2026-03-10");
    expect(tenggatPeran(isi, "supervisor", [])).toBeNull();
  });
  it("kelas tanpa tanggal valid diabaikan", () => {
    const isi = dasar();
    isi.kelas[0].mulai = "";
    expect(tenggatPeran(isi, "pml", PENDATAAN)).toBe("2026-03-10");
    isi.kelas.push({ ...isi.kelas[0], id: "k2", mulai: "2026-02-20", selesai: "2026-02-21" });
    expect(tenggatPeran(isi, "pml", PENDATAAN)).toBe("2026-02-20");
    isi.kelas.push({ ...isi.kelas[0], id: "k3", mulai: "2026-02-30", selesai: "2026-02-31" });
    expect(tenggatPeran(isi, "pml", PENDATAAN)).toBe("2026-02-20");
  });
});

describe("ringkasRekrutmen", () => {
  it("tiga mitra pada fixture: kebutuhan per peran dan urutan", () => {
    const isi = dasar();
    const r = ringkasRekrutmen(isi, [], PENDATAAN, HARI);
    expect(r.aktif).toBe(true);
    expect(r.total).toBe(3);
    expect(r.peran.map((p) => [p.kode, p.target, p.tercatat, p.kepka, p.seleksi, p.kurang, p.lebih])).toEqual([["pml", 1, 1, 1, 0, 0, 0], ["ppl", 2, 2, 1, 1, 0, 0]]);
    expect(r.mitra.map((m) => [m.kode, m.status, m.tenggat])).toEqual([["p2", "siap_spk", "2026-03-02"], ["p3", "siap_spk", "2026-03-02"], ["p4", "siap_spk", "2026-03-02"]]);
  });
  it("urutan: yang perlu tindakan lebih dulu, lalu menurut tenggat", () => {
    const isi = dasar();
    isi.petugas[2] = { ...isi.petugas[2], nama: "", menyusul: true };
    const r = ringkasRekrutmen(isi, [{ jenis: "tugas", kunci: "p4", status: "terbit" }], PENDATAAN, HARI);
    expect(r.mitra.map((m) => [m.kode, m.status])).toEqual([["p3", "menunggu_seleksi"], ["p2", "siap_spk"], ["p4", "spk_terbit"]]);
    expect(r.menungguSeleksi).toBe(1);
    expect(r.siapSpk).toBe(1);
    expect(r.spkTerbit).toBe(1);
    expect(r.catatan.join(" ")).toContain("menunggu hasil seleksi");
  });
  it("tenggat: lewat = merah dengan catatan; dekat = kuning; jauh = biru; terbit = hijau", () => {
    const isi = dasar();
    const lewat = ringkasRekrutmen(isi, [], PENDATAAN, "2026-03-05");
    expect(lewat.nada).toBe("merah");
    expect(lewat.mitra.every((m) => m.nada === "merah" && m.sisaHari !== null && m.sisaHari < 0)).toBe(true);
    expect(lewat.mitra[0].catatan).toContain("Tenggat sudah lewat 3 hari");
    expect(lewat.catatan.join(" ")).toContain("melewati tenggat SPK");
    const dekat = ringkasRekrutmen(isi, [], PENDATAAN, "2026-02-20");
    expect(dekat.mitra.map((m) => m.nada)).toEqual(["kuning", "kuning", "kuning"]);
    const jauh = ringkasRekrutmen(isi, [], PENDATAAN, "2026-01-01");
    expect(jauh.mitra.map((m) => m.nada)).toEqual(["biru", "biru", "biru"]);
    const semua = ringkasRekrutmen(isi, isi.petugas.map((p) => ({ jenis: "tugas", kunci: p.id, status: "terbit" })), PENDATAAN, "2026-03-05");
    expect(semua.nada).toBe("hijau");
    expect(semua.mitra.every((m) => m.nada === "hijau")).toBe(true);
  });
  it("tanpa tanggal sama sekali: tenggat kosong, nada abu, ada catatan", () => {
    const isi = dasar();
    isi.kelas = [];
    const r = ringkasRekrutmen(isi, [], [], HARI);
    expect(r.mitra.every((m) => m.tenggat === null && m.sisaHari === null && m.nada === "abu")).toBe(true);
    expect(r.catatan.join(" ")).toContain("tenggat belum dapat dihitung");
    expect(r.nada).toBe("kuning");
  });
  it("kekurangan dan kelebihan terhadap kebutuhan peran, serta penanda Perkiraan", () => {
    const isi = dasar();
    isi.peran.ppl.nMit = 4; // butuh 4, tercatat 2
    isi.peran.pml.nMit = 0; // butuh 0, tercatat 1
    isi.peran.ppl.fix = false;
    const r = ringkasRekrutmen(isi, [], PENDATAAN, HARI);
    const ppl = r.peran.find((p) => p.kode === "ppl")!;
    const pml = r.peran.find((p) => p.kode === "pml")!;
    expect([ppl.kurang, ppl.lebih, ppl.perkiraan]).toEqual([2, 0, true]);
    expect([pml.kurang, pml.lebih]).toEqual([0, 1]);
    expect(r.kurang).toBe(2);
    const t = r.catatan.join(" | ");
    expect(t).toContain("2 mitra sesuai kebutuhan peran belum dicatat");
    expect(t).toContain("PML: mitra tercatat 1 melebihi kebutuhan 0");
    expect(t).toContain("Jumlah mitra PPL masih Perkiraan");
  });
  it("mitra baru diberi catatan pendaftaran master", () => {
    const isi = dasar();
    for (const p of isi.petugas) p.baru = false;
    isi.petugas[1].baru = true;
    const r = ringkasRekrutmen(isi, [], PENDATAAN, HARI);
    expect(r.baru).toBe(1);
    expect(r.catatan.join(" ")).toContain("terdaftar di master mitra");
    expect(r.peran.find((p) => p.kode === "pml")!.baru).toBe(1);
  });
  it("tanpa mitra: rekrutmen tidak aktif", () => {
    const isi = dasar();
    isi.petugas = isi.petugas.filter((p) => p.status === "Organik");
    isi.peran.pml.nMit = 0; isi.peran.ppl.nMit = 0;
    const r = ringkasRekrutmen(isi, [], PENDATAAN, HARI);
    expect(r.aktif).toBe(false);
    expect(r.total).toBe(0);
    expect(r.catatan[0]).toContain("rekrutmen tidak aktif");
  });
  it("organik tidak ikut dihitung sebagai mitra", () => {
    const isi = dasar();
    const r = ringkasRekrutmen(isi, [], PENDATAAN, HARI);
    expect(r.mitra.some((m) => m.kode === "p1")).toBe(false);
  });
  it("label lengkap untuk setiap status", () => {
    for (const s of Object.keys(LABEL_MITRA)) expect(LABEL_MITRA[s as keyof typeof LABEL_MITRA].teks.length).toBeGreaterThan(3);
  });
});

describe("teksTenggat", () => {
  it("bentuk kalimat", () => {
    expect(teksTenggat(null, null)).toBe("tenggat belum ada");
    expect(teksTenggat("2026-03-02", -3)).toBe("02/03/2026 (lewat 3 hari)");
    expect(teksTenggat("2026-03-02", 0)).toBe("02/03/2026 (hari ini)");
    expect(teksTenggat("2026-03-02", 9)).toBe("02/03/2026 (9 hari lagi)");
  });
});
