import { describe, expect, it } from "vitest";
import { aktivitasDariInduk } from "../sigapAktivitas";
import type { RingkasHariIni, RingkasKegiatan } from "../sigapKegiatan";
import type { Induk, KonteksTahap, TahapDef } from "../sigapTahap";
import type { TugasUtama } from "../sigapTugasUtama";
import { poinDariTugas, susunDaftarKartu } from "../sigapBerandaDaftar";

const NOW = Date.parse("2026-10-30T14:00:00+07:00");
const T = (kode: string, urutan: number, isi: string[]): TahapDef => ({ kode, urutan, nama: kode[0].toUpperCase() + kode.slice(1), uraian: null, isi, buka_mode: "langsung", buka_tanggal: null });
const HI = (o: Partial<RingkasHariIni> = {}): RingkasHariIni => ({
  tanggal: "2026-10-30", adaJadwal: true, hariKerjaBerikut: "2026-11-02", peran: "ppl", fotoTotal: 5, slot: [], wajibLaporan: true, laporanSudah: false, hasilLembar: null, sumber: "pendataan",
  mulai: "2026-10-10", targetSelesai: "2026-11-10", hrefKerja: "/sigap/translok/tok?p=1", hrefLembar: "/sigap/pendataan", ...o,
});
const TL = (kegiatan_id: number, nada: RingkasKegiatan["nada"], hariIni?: RingkasHariIni): RingkasKegiatan => ({
  id: `translok-${kegiatan_id}0`, judul: `Transport Lokal — K${kegiatan_id}`, pendek: `Translok K${kegiatan_id}`, ikon: "motor", nada, pecahan: 0.4, selesai: 2, total: 5, sub: "2/5", peringatan: false,
  href: `/sigap/kegiatan/translok-${kegiatan_id}0`, kegiatan_id, ...(hariIni ? { hariIni } : {}),
});
const INDUK = (kode: string, tahap: TahapDef[], ekstra: Partial<Induk> = {}): Induk => ({
  kode, nama: `Pendataan ${kode}`, pendek: `Pendataan ${kode}`, ikon: "bencana", menyerap: [], tahap, perencanaan: { konfirmasi: true, href: null }, wilayah: { total: 3, ada_laporan: 0, kk: 100, kk_terdampak: 10, peran: "ppl", pml_nama: "Budi" }, ...ekstra,
});
const K = (induk: Induk, keg: RingkasKegiatan[]): KonteksTahap => ({ induk, hub: null, hubMuat: "gagal", keg, nowMs: NOW });

describe("susunDaftarKartu", () => {
  const pasca = INDUK("pascabencana", [T("perencanaan", 1, ["konfirmasi"]), T("pelatihan", 2, ["pelatihan", "translok:3"]), T("pendataan", 3, ["wilayah_tim", "translok:1", "pendataan"])], { pendataan: { total: 400, didata: 100, terdampak: 5 } });
  const spdt = INDUK("spdt", [T("pendataan", 1, ["spdt_lembar", "translok:2"])], { spdt: { peran: "ppl", total: 10 } as never });
  const keg = [TL(3, "hijau"), TL(1, "emas", HI()), TL(2, "biru", HI({ slot: [1, 2], laporanSudah: true }))];

  it("satu kartu per survei, Pelatihan dan Pendataan terpisah", () => {
    const akt = [...aktivitasDariInduk(K(pasca, keg)), ...aktivitasDariInduk(K(spdt, keg))];
    const d = susunDaftarKartu({ kegiatan: akt, induk: [pasca, spdt], keg, tugasPelatihan: null, nowMs: NOW });
    expect(d.map((k) => k.judul).sort()).toEqual(["Pendataan pascabencana", "Pendataan spdt", "Pelatihan pascabencana"].sort());
    expect(new Set(d.map((k) => k.id)).size).toBe(d.length);
  });

  it("kartu pendataan bermenu: poin Translok, chip realisasi, dan peringatan merah lewat 13.00", () => {
    const akt = aktivitasDariInduk(K(pasca, keg));
    const d = susunDaftarKartu({ kegiatan: akt, induk: [pasca], keg, tugasPelatihan: null, nowMs: NOW });
    const p = d.find((k) => k.jenis === "pendataan")!;
    expect(p.poin?.kode).toBe("foto_awal");
    expect(p.realisasi?.bermasalah).toBe(true);
    expect(p.peringatan).not.toBeNull();
    expect(d[0].id).toBe(p.id); // peringatan merah paling atas
  });

  it("kartu usang (selesai) di bawah dan redup", () => {
    const selesai = INDUK("lama", [T("pendataan", 1, ["translok:9"])]);
    const kegSelesai = [TL(9, "hijau")];
    const d = susunDaftarKartu({ kegiatan: [...aktivitasDariInduk(K(selesai, kegSelesai)), ...aktivitasDariInduk(K(pasca, keg))], induk: [selesai, pasca], keg: [...keg, ...kegSelesai], tugasPelatihan: null, nowMs: NOW });
    expect(d[d.length - 1].redup).toBe(true);
    expect(d[d.length - 1].judul).toBe("Pendataan lama");
    expect(d.filter((k) => k.redup)).toHaveLength(1);
  });

  it("tugas pelatihan dipasang di kartu Pelatihan", () => {
    const tp: TugasUtama = { skor: 92, ikon: "tes", label: "TUGAS HARI INI", judul: "Kerjakan Pretest", uraian: "20 soal", lencana: { teks: "tutup 10.00", nada: "emas" }, href: "/sigap/pelatihan/tes/pretest", aksi: "Mulai Pretest" };
    const d = susunDaftarKartu({ kegiatan: aktivitasDariInduk(K(pasca, keg)), induk: [pasca], keg, tugasPelatihan: tp, nowMs: NOW });
    const pel = d.find((k) => k.jenis === "pelatihan")!;
    expect(pel.poin).toMatchObject({ judul: "Kerjakan Pretest", nada: "emas", aksi: "Mulai Pretest", href: "/sigap/pelatihan/tes/pretest" });
    expect(poinDariTugas(null)).toBeNull();
  });

  it("kegiatan lain: poin dari kekurangan teratas atau keterangan; penyisiran tetap tombol SSO", () => {
    const lain: RingkasKegiatan[] = [
      { id: "penyisiran", judul: "Penyisiran", pendek: "Penyisiran", ikon: "peta", nada: "biru", pecahan: null, selesai: null, total: null, sub: "Aktif", peringatan: false, href: null, sso: "penyisiran" },
      { id: "dtsen-operator", judul: "Usulan DTSEN", pendek: "Usulan DTSEN", ikon: "dtsen", nada: "abu", pecahan: null, selesai: null, total: null, sub: "Buka dashboard", peringatan: false, href: "/dashboard" },
    ];
    const d = susunDaftarKartu({ kegiatan: lain, induk: null, keg: null, tugasPelatihan: null, nowMs: NOW });
    expect(d.find((k) => k.id === "penyisiran")).toMatchObject({ sso: "penyisiran", jenis: "lain" });
    expect(d.find((k) => k.id === "dtsen-operator")?.poin?.judul).toBe("Buka dashboard");
  });

  it("Transport Lokal tersendiri dengan ringkasan hari ini memakai aturan poin yang sama", () => {
    const d = susunDaftarKartu({ kegiatan: [TL(5, "biru", HI({ slot: [1, 2] }))], induk: null, keg: [TL(5, "biru", HI({ slot: [1, 2] }))], tugasPelatihan: null, nowMs: NOW });
    expect(d[0].jenis).toBe("lain");
    expect(d[0].poin?.kode).toBe("laporan");
  });
});

describe("pelatihan di luar kegiatan induk", () => {
  it("ikon pelatihan lama tetap memakai tugas utama pelatihan", () => {
    const pel: RingkasKegiatan = { id: "pelatihan", judul: "Pelatihan", pendek: "Pelatihan", ikon: "langkah", nada: "emas", pecahan: 0.3, selesai: 2, total: 7, sub: "2/7", peringatan: true, href: "/sigap/pelatihan" };
    const tp: TugasUtama = { skor: 60, ikon: "surat", label: "MULAI DARI SINI", judul: "Baca undangan pelatihan", uraian: "x", href: "/sigap/pelatihan/undangan", aksi: "Buka undangan" };
    const d = susunDaftarKartu({ kegiatan: [pel], induk: null, keg: null, tugasPelatihan: tp, nowMs: NOW });
    expect(d[0]).toMatchObject({ jenis: "pelatihan", poin: { judul: "Baca undangan pelatihan" } });
  });
});

describe("kartu lain tanpa informasi", () => {
  it("keterangan generik 'Buka' tidak dijadikan poin (kartu hanya bisa diketuk)", () => {
    const k: RingkasKegiatan = { id: "penyisiran", judul: "Penyisiran SE2026", pendek: "Penyisiran SE2026", ikon: "peta", nada: "biru", pecahan: null, selesai: null, total: null, sub: "Buka", peringatan: false, href: null, sso: "penyisiran" };
    const d = susunDaftarKartu({ kegiatan: [k], induk: null, keg: null, tugasPelatihan: null, nowMs: NOW });
    expect(d[0].poin).toBeNull();
    expect(d[0].sso).toBe("penyisiran");
  });
});
