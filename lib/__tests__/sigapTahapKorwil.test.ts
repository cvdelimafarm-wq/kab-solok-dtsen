import { describe, expect, it } from "vitest";
import { adalahTugas } from "@/lib/sigapPrioritas";
import { indukDari } from "@/lib/sigapNavigasi";
import { KATALOG_MODUL, modulSah, NAMA_MODUL, periksaTahapAdmin, susunTahap, type Induk, type TahapDef } from "@/lib/sigapTahap";

const tahapPendataan: TahapDef = { kode: "pendataan", urutan: 3, nama: "Pendataan", uraian: null, isi: ["monitoring_korwil", "wilayah_tim", "identifikasi", "pendataan", "translok:1"], buka_mode: "langsung", buka_tanggal: null };
const induk = (o: Partial<Induk> = {}): Induk => ({ kode: "pascabencana", nama: "Pendataan Pascabencana", pendek: "Pendataan", ikon: "bencana", menyerap: [], tahap: [tahapPendataan], perencanaan: null, wilayah: null, ...o });
const ctx = (i: Induk) => ({ induk: i, hub: null, hubMuat: "siap" as const, keg: [], nowMs: Date.parse("2026-10-19T03:00:00Z") });

describe("modul monitoring_korwil", () => {
  it("terdaftar di katalog dan sah", () => {
    expect(modulSah("monitoring_korwil")).toBe(true);
    expect(KATALOG_MODUL.some((m) => m.kode === "monitoring_korwil")).toBe(true);
    expect(NAMA_MODUL("monitoring_korwil")).toBe("Supervisi");
    expect(periksaTahapAdmin({ kode: "pendataan", nama: "Pendataan", isi: tahapPendataan.isi, buka_mode: "langsung", buka_tanggal: null }, [1, 3])).toBeNull();
  });
  it("tampil bagi kortim: berjalan, tautan membawa ?dari= ke tahap", () => {
    const t = susunTahap(ctx(induk({ korwil: { kelompok: 1, tim: 3, ppl: 8 } })));
    expect(t).toHaveLength(1);
    const m = t[0].modul[0];
    expect(m).toMatchObject({ kode: "monitoring_korwil", status: "berjalan", judul: "Supervisi", ket: "Kelompok 1 · 3 tim PML · 8 PPL" });
    expect(m.href).toBe("/sigap/korwil?tab=lapangan&kelompok=1&dari=%2Fsigap%2Fkegiatan%2Fpascabencana%2Fpendataan"); // (31 Okt 2026) kartu "Kelompok 1" membuka kelompok 1
  });
  it("tidak tampil bagi akun lain (tahap ikut disembunyikan bila tak ada modul lain yang berlaku)", () => {
    expect(susunTahap(ctx(induk({ korwil: null })))).toHaveLength(0);
    expect(susunTahap(ctx(induk()))).toHaveLength(0);
  });
  it("monitoring ikut bernomor sebagai langkah 1; Transport Lokal langkah 2", () => {
    expect(adalahTugas("monitoring_korwil")).toBe(true);
    expect(adalahTugas("translok-5")).toBe(true);
  });
  it("Back dari /sigap/korwil naik ke garis waktu kegiatan", () => {
    expect(indukDari("/sigap/korwil")).toBe("/sigap/kegiatan/pascabencana");
    expect(indukDari("/sigap/korwil?dari=%2Fsigap%2Fkegiatan%2Fpascabencana%2Fpendataan")).toBe("/sigap/kegiatan/pascabencana");
  });
});
