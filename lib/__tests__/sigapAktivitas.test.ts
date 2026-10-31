import { describe, expect, it } from "vitest";
import { aktivitasDariInduk, namaDasar, pisahAktif, tahapUtama } from "../sigapAktivitas";
import { susunTahap, type Induk, type KonteksTahap, type TahapDef } from "../sigapTahap";
import type { RingkasKegiatan } from "../sigapKegiatan";

const T = (kode: string, urutan: number, isi: string[]): TahapDef => ({ kode, urutan, nama: kode[0].toUpperCase() + kode.slice(1), uraian: null, isi, buka_mode: "langsung", buka_tanggal: null });
const TL = (kegiatan_id: number, nada: RingkasKegiatan["nada"], kek = false): RingkasKegiatan => ({
  id: `translok-${kegiatan_id}0`,
  judul: `Transport Lokal ${kegiatan_id}`,
  pendek: "Translok",
  ikon: "motor",
  nada,
  pecahan: 0.4,
  selesai: 2,
  total: 5,
  sub: "2/5 · Foto kurang",
  peringatan: nada === "merah" || nada === "emas",
  href: `/sigap/kegiatan/translok-${kegiatan_id}0`,
  kegiatan_id,
  ...(kek ? { kekurangan: [{ kode: "foto", jenis: "foto", tanggal: null, skor: 80, nada: "emas", label: "SEGERA", judul: "Unggah 5 foto", ringkas: "Foto belum lengkap", uraian: "", batas: null, aksi: "Unggah foto 1–5", href: "/sigap/translok/abc?tab=foto" } as never] } : {}),
});
const INDUK = (tahap: TahapDef[], ekstra: Partial<Induk> = {}): Induk => ({ kode: "pascabencana", nama: "Pendataan Pascabencana", pendek: "Pendataan Pascabencana", ikon: "bencana", menyerap: [], tahap, perencanaan: { konfirmasi: true, href: "/b" }, wilayah: { total: 4, ada_laporan: 1, kk: 100, kk_terdampak: 10 }, ...ekstra });
const K = (induk: Induk, keg: RingkasKegiatan[] = []): KonteksTahap => ({ induk, hub: null, hubMuat: "gagal", keg, nowMs: Date.parse("2026-10-30T03:00:00Z") });

describe("namaDasar", () => {
  it("membuang awalan Pendataan/Pelatihan", () => {
    expect(namaDasar("Pendataan Pascabencana")).toBe("Pascabencana");
    expect(namaDasar("SPDT NTP")).toBe("SPDT NTP");
  });
});

describe("aktivitasDariInduk", () => {
  const induk = INDUK([T("perencanaan", 1, ["konfirmasi"]), T("pelatihan", 2, ["pelatihan", "translok:3"]), T("pendataan", 3, ["wilayah_tim", "translok:1"]), T("evaluasi", 4, [])]);

  it("memecah satu induk menjadi Pelatihan dan Pendataan; tahap kosong (Evaluasi) tidak jadi kegiatan", () => {
    const a = aktivitasDariInduk(K(induk, [TL(3, "biru"), TL(1, "emas", true)]));
    expect(a.map((x) => x.judul)).toEqual(["Pelatihan Pascabencana", "Pendataan Pascabencana"]);
    expect(a.map((x) => x.jenis)).toEqual(["pelatihan", "pendataan"]);
  });

  it("ketukan ikon = halaman kerja tahap utama (modul terbanyak), melewati layer Tahapan", () => {
    const a = aktivitasDariInduk(K(induk, [TL(3, "biru"), TL(1, "biru")]));
    expect(a[0].href).toBe("/sigap/pelatihan");
    expect(a[1].href).toBe("/sigap/kegiatan/pascabencana/pendataan");
  });

  it("Pascabencana bertemplate (ada Lembar Pendataan): ikon Pendataan membuka Hari Ini; ikon Pelatihan tetap halaman pelatihan", () => {
    const bermenu = INDUK([T("perencanaan", 1, ["konfirmasi"]), T("pelatihan", 2, ["pelatihan", "translok:3"]), T("pendataan", 3, ["wilayah_tim", "identifikasi", "pendataan", "translok:1"]), T("evaluasi", 4, [])], {
      pendataan: { total: 10, didata: 2, terdampak: 1 },
      identifikasi: { total: 5, terisi: 5, tidak_terdampak: 0, hasil: 9 },
    });
    const a = aktivitasDariInduk(K(bermenu, [TL(3, "biru"), TL(1, "biru")]));
    expect(a.find((x) => x.jenis === "pelatihan")!.href).toBe("/sigap/pelatihan");
    expect(a.find((x) => x.jenis === "pendataan")!.href).toBe("/sigap/kegiatan/pascabencana");
  });

  it("keterangan = informasi paling mendesak dan bertautan ke bagian yang sesuai (foto), bukan sekadar status", () => {
    const a = aktivitasDariInduk(K(induk, [TL(3, "hijau"), TL(1, "emas", true)]));
    const p = a.find((x) => x.jenis === "pendataan")!;
    expect(p.nada).toBe("emas");
    expect(p.info?.teks).toBe("Foto belum lengkap");
    expect(p.info?.href).toBe("/sigap/translok/abc?tab=foto");
  });

  it("tanpa yang mendesak: tidak ada info; kegiatan selesai berwarna hijau", () => {
    const a = aktivitasDariInduk(K(INDUK([T("pendataan", 1, ["translok:1"])]), [TL(1, "hijau")]));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ nada: "hijau", info: null, sub: "Selesai" });
  });

  it("induk tanpa pelatihan (SPDT NTP) hanya menghasilkan Pendataan SPDT NTP", () => {
    const spdt = INDUK([T("lembar_pendataan", 1, ["spdt_lembar"]), T("translok", 2, ["translok:2"])], { kode: "spdt_ntp", nama: "SPDT NTP 2026", pendek: "SPDT NTP", ikon: "grafik", perencanaan: null, wilayah: null, spdt: { peran: "ppl", total: 20, ppl: 1, pml: 1 } });
    const a = aktivitasDariInduk(K(spdt, [TL(2, "biru")]));
    expect(a.map((x) => x.judul)).toEqual(["Pendataan SPDT NTP"]);
    expect(a[0].ikon).toBe("grafik");
    expect(a[0].href).toBe("/sigap/kegiatan/spdt_ntp"); // bermenu rutin -> mendarat di Hari Ini
  });

  it("akun tanpa modul yang berlaku tidak mendapat kegiatan", () => {
    expect(aktivitasDariInduk(K(INDUK([T("pendataan", 1, ["translok:1"])]), []))).toEqual([]);
  });
});

describe("tahapUtama & pisahAktif", () => {
  it("tahapUtama memilih modul terbanyak", () => {
    const h = susunTahap(K(INDUK([T("a", 1, ["konfirmasi"]), T("b", 2, ["wilayah_tim", "translok:1"])]), [TL(1, "biru")]));
    expect(tahapUtama(h).kode).toBe("b");
  });
  it("yang aktif mendesak di depan, selesai dipisah", () => {
    const r = pisahAktif([{ nada: "hijau", n: 1 }, { nada: "biru", n: 2 }, { nada: "merah", n: 3 }, { nada: "abu", n: 4 }]);
    expect(r.aktif.map((x) => x.n)).toEqual([3, 2, 4]);
    expect(r.selesai.map((x) => x.n)).toEqual([1]);
  });
});
