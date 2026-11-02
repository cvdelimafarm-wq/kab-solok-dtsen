import { describe, expect, it } from "vitest";
import { normalisasi } from "../identifikasi";
import { awalLanjutan, instrukturKosongLj, type IsiLanjutan } from "../lanjutan";
import { samakanDenganAwal, tambahDariAwal, tautkanKelas } from "../tautAwal";

// Bentuk Seruti Triwulan IV 2026 (identifikasi nyata): briefing luring di hotel dalam kota, tanggal Fix 9 Nov, tanpa instruktur; pelatihan tidak ada.
const FORM = normalisasi({
  nama: "Seruti Triwulan IV 2026", periode: "Triwulanan", keList: ["Triwulan IV"], berbagi: false,
  sesi: {
    briefing: { on: true, bentuk: "Luring", tempat: "Hotel dalam kota", pengajar: false, tgl: { "Triwulan IV": { mode: "tgl", perk: false, bulan: 10, minggu: 1, mulai: "2026-11-09", selesai: "2026-11-09" } } },
    pelatihan: { on: false },
  },
  peran: { pml: { on: true, nOrg: 6, nMit: 2, status: "Organik dan mitra", translok: true }, ppl: { on: true, nOrg: 0, nMit: 15, status: "Mitra", translok: true } },
});
const dasar = (): IsiLanjutan => awalLanjutan(FORM, 2026);
const satu = (g: IsiLanjutan) => g.kelas[0];

describe("tautan kelas lanjutan ke identifikasi awal", () => {
  it("lanjutan yang baru diturunkan dari awal: semua kelas sesuai, tidak ada yang hilang", () => {
    const g = dasar();
    expect(g.kelas).toHaveLength(1);
    const t = tautkanKelas(g, FORM, 2026);
    expect(t.per[satu(g).id]).toEqual({ status: "sesuai", beda: [], instruktur: null });
    expect(t.hilang).toEqual([]);
  });

  it("metode atau tanggal diubah: menyimpang bertanda dengan nilai awal dan kini; disamakan lagi menjadi sesuai (OH dihitung ulang)", () => {
    const g = dasar();
    satu(g).metode = "Daring"; satu(g).mulai = "2026-11-10"; satu(g).selesai = "2026-11-12"; satu(g).oh = 3;
    const t = tautkanKelas(g, FORM, 2026).per[satu(g).id];
    expect(t.status).toBe("menyimpang");
    expect(t.beda.map((b) => `${b.bidang}:${b.awal}->${b.kini}`)).toEqual(["metode:Luring->Daring", "mulai:2026-11-09->2026-11-10", "selesai:2026-11-09->2026-11-12"]);
    samakanDenganAwal(satu(g), dasar().kelas[0]);
    expect(satu(g)).toMatchObject({ metode: "Luring", mulai: "2026-11-09", selesai: "2026-11-09", oh: 1 });
    expect(tautkanKelas(g, FORM, 2026).per[satu(g).id].status).toBe("sesuai");
  });

  it("isian yang tidak diisi pada awal tidak dianggap menyimpang (tempat lain, lokasi, paket tetap bebas)", () => {
    const g = dasar();
    satu(g).lokasi = "Daima Moosa Glamping Park"; satu(g).paket = "fullday"; satu(g).fix = true;
    expect(tautkanKelas(g, FORM, 2026).per[satu(g).id].status).toBe("sesuai");
    const f2 = normalisasi({ ...FORM, sesi: { ...FORM.sesi, briefing: { ...FORM.sesi.briefing, bentuk: "", tempat: "" } } });
    const g2 = awalLanjutan(f2, 2026); satu(g2).metode = "Luring"; satu(g2).tempat = "Kantor";
    expect(tautkanKelas(g2, f2, 2026).per[satu(g2).id].beda.filter((b) => b.bidang === "metode" || b.bidang === "tempat")).toEqual([]);
  });

  it("kelas yang tidak ada di awal atau kelas ganda pada sesi dan periode yang sama = tambahan", () => {
    const g = dasar();
    g.kelas.push({ ...satu(g), id: "k9", sesi: "pelatihan", nama: "Pelatihan" });
    g.kelas.push({ ...satu(g), id: "k10", nama: "Briefing kelompok 2" });
    const t = tautkanKelas(g, FORM, 2026);
    expect(t.per.k9.status).toBe("tambahan");
    expect(t.per.k10.status).toBe("tambahan");
    expect(t.per[satu(g).id].status).toBe("sesuai");
  });

  it("kelas dari awal yang belum ada di lanjutan dilaporkan hilang dan bisa ditambahkan (id baru, salinan)", () => {
    const g = dasar(); g.kelas = [];
    const h = tautkanKelas(g, FORM, 2026).hilang;
    expect(h.map((k) => k.nama)).toEqual(["Briefing Triwulan IV"]);
    tambahDariAwal(g, h[0]);
    expect(g.kelas).toHaveLength(1);
    g.kelas[0].untuk.push("kortim");
    expect(h[0].untuk).not.toContain("kortim");
    expect(tautkanKelas(g, FORM, 2026).hilang).toEqual([]);
  });

  it("instruktur: awal menyatakan tidak ada instruktur tetapi kelas memuat; jumlah berbeda dari awal diberi catatan", () => {
    const g = dasar();
    satu(g).instruktur = [{ ...instrukturKosongLj(), nama: "Riva Hestaria, A.Md." }];
    expect(tautkanKelas(g, FORM, 2026).per[satu(g).id].instruktur).toContain("tidak ada instruktur");
    const f2 = normalisasi({ ...FORM, sesi: { ...FORM.sesi, briefing: { ...FORM.sesi.briefing, pengajar: true, instr: { jumlah: 2, level: "Inda", asal: "Internal BPS", jam: 4, perk: true } } } });
    const g2 = awalLanjutan(f2, 2026);
    expect(tautkanKelas(g2, f2, 2026).per[satu(g2).id].instruktur).toBeNull();
    g2.kelas[0].instruktur = [g2.kelas[0].instruktur![0]];
    expect(tautkanKelas(g2, f2, 2026).per[satu(g2).id].instruktur).toBe("Identifikasi awal memuat 2 instruktur; kelas ini 1.");
  });

  it("awal belum ada, tahun belum ada, atau jadwal berbagi: tanpa penanda dan tanpa kelas hilang", () => {
    const g = dasar();
    expect(tautkanKelas(g, null, 2026)).toEqual({ per: {}, hilang: [] });
    expect(tautkanKelas(g, FORM, null)).toEqual({ per: {}, hilang: [] });
    const f3 = normalisasi({ ...FORM, berbagi: true });
    expect(tautkanKelas(g, f3, 2026)).toEqual({ per: {}, hilang: [] });
  });
});
