// lib/keu/__tests__/dokumenLanjutan.test.ts — dokumen cetak keluaran lanjutan (laporan Kepala, kebutuhan administrasi, KAK).
import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import type { BarisRincian, IsiLanjutan } from "../lanjutan";
import { barisKeluaran, petaKunci, susunBayar, susunDana, susunKeluaran } from "../keluaran";
import {
  bacaTeksKak, kakBelumDiisi, KAK_KOSONG, perhatianLaporan, pilihSeksi, susunKak, susunKebutuhanAdministrasi, susunLaporanKepala, type BarisDok, type KonteksLanjutan,
} from "../dokumenLanjutan";

const isi = vektor.base as unknown as IsiLanjutan;
const rc = (kelompok: BarisRincian["kelompok"], uraian: string, akun: string, jumlah: number | null): BarisRincian =>
  ({ kelompok, uraian, akun, volume: 10, satuan: "orang", tarif: jumlah === null ? null : jumlah / 10, jumlah, catatan: "", perk: false });
const rincian = [rc("Pelatihan", "Pelatihan Triwulan I: konsumsi tanpa paket", "521211", 500000), rc("Honor", "Honor mitra PPL", "521213", null)];
const periode = [{ periode: "Triwulan I", mulai: "2026-03-02", selesai: "2026-03-06" }];
const meta = petaKunci(rincian, periode, isi, new Set());
const kKons = [...meta.entries()].find(([, m]) => m.kelompok === "Pelatihan")![0];
const kHon = [...meta.entries()].find(([, m]) => m.kelompok === "Honor")![0];

const barisRab = [
  { baris_id: 1, item_id: 1, ket: "Konsumsi 20 orang", volume: 2, satuan: "orang", harga_satuan: 200000, jumlah: 400000, bulan_mulai: 3, minggu: 2, ident_id: 9, ident_kunci: kKons },
  { baris_id: 2, item_id: 2, ket: "Honor mitra PPL", volume: 2, satuan: "OH", harga_satuan: 100000, jumlah: 200000, bulan_mulai: 3, minggu: 2, ident_id: 9, ident_kunci: kHon },
];
const item = [{ id: 1, akun_kode: "521211", uraian: "Konsumsi" }, { id: 2, akun_kode: "521213", uraian: "Honor" }];
const baris = barisKeluaran(barisRab, item, 9);
const keluaran = susunKeluaran(
  { identNama: "Survei Contoh", roKode: "2906.BMA.006", tahun: 2026, identVer: 1, rabNomor: "1", rabStatus: "draf" },
  baris, susunDana(baris, (a) => (a === "521211" ? "Belanja Barang Operasional Lainnya" : "")), susunBayar(baris, meta, new Set()), [],
);

const dok = (kode: string, urutSeksi: number, judul: string, no: number, uraian: string, pihak: string[], sumber: "skema" | "pola" = "skema"): BarisDok =>
  ({ sumber, kode, seksi_urut: urutSeksi, seksi_huruf: "ABCDE"[urutSeksi - 1], seksi_judul: judul, no, uraian, pihak, ket: "", gen: false });
const master: BarisDok[] = [
  dok("521211", 1, "Konsumsi rapat", 1, "KAK", ["Tim Kerja"]), dok("521211", 1, "Konsumsi rapat", 2, "Bukti Transfer", ["Bendahara"]),
  dok("521211", 4, "Pengadaan pulsa/paket data", 1, "KAK", ["Tim Kerja"]),
  dok("521213", 4, "Honor petugas mitra (non PNS atau PNS non BPS)", 1, "SK KPA", ["Perencanaan"]),
  dok("521213", 5, "Honor petugas PNS BPS", 1, "Laporan penyelesaian pekerjaan", ["Tim Kerja"]),
];
const konteks = (o: Partial<KonteksLanjutan> = {}): KonteksLanjutan => ({
  identitas: { nama: "Survei Contoh", roKode: "2906.BMA.006", tahun: 2026, identVer: 1 }, jenisPeriode: "Triwulanan", isi, jendela: periode, rincian, keluaran, statusSurvei: "siap", paketVer: null,
  dok: master, polaAkun: new Map(), tanggalCetak: "29 Oktober 2026", ...o,
});

describe("pilihSeksi", () => {
  const judul = ["Konsumsi rapat", "Perlengkapan / penggandaan", "Pengadaan spanduk", "Pengadaan pulsa/paket data"];
  it("mencocokkan uraian rincian dengan judul seksi", () => {
    expect(pilihSeksi(["Konsumsi 20 orang"], judul)).toEqual([0]);
    expect(pilihSeksi(["Paket data peserta"], judul)).toEqual([3]);
    expect(pilihSeksi(["Fotokopi dokumen", "Spanduk"], judul)).toEqual([1, 2]);
  });
  it("tanpa kecocokan: kosong", () => { expect(pilihSeksi(["Sesuatu"], judul)).toEqual([]); });
});

describe("susunLaporanKepala", () => {
  const d = susunLaporanKepala(konteks());
  it("memuat enam bagian dan dua lampiran, tanda tangan dua pihak", () => {
    expect(d.blok.map((b) => b.judul?.slice(0, 2))).toEqual(["1.", "2.", "3.", "4.", "5.", "6.", "La", "La"]);
    expect(d.blok.filter((b) => b.halamanBaru)).toHaveLength(2);
    expect(d.tandaTangan).toHaveLength(2);
  });
  it("total RAB di ringkasan dan tabel akun", () => {
    const ring = d.blok[0].tabel![0].baris.find((r) => r[0] === "Total RAB survei")!;
    expect(ring[1]).toContain("600.000");
    const akun = d.blok[3].tabel![1];
    expect(akun.baris.at(-1)![2]).toContain("600.000");
    expect(akun.baris[0][1]).toBe("Belanja Barang Operasional Lainnya");
  });
  it("peringatan: paket belum diajukan, rincian belum terhitung, selisih dengan identifikasi lanjutan", () => {
    const h = perhatianLaporan(konteks());
    expect(h.some((x) => x.includes("belum diajukan"))).toBe(true);
    expect(h.some((x) => x.includes("belum dapat dihitung"))).toBe(true);
    expect(h.some((x) => x.includes("lebih besar") && x.includes("100.000"))).toBe(true);
    expect(perhatianLaporan(konteks({ statusSurvei: "draf", paketVer: 2 })).some((x) => x.includes("belum ditandai Siap"))).toBe(true);
    expect(perhatianLaporan(konteks({ paketVer: 2 })).some((x) => x.includes("belum diajukan"))).toBe(false);
  });
  it("lampiran RAB berurutan akun > item > rincian", () => {
    const t = d.blok.at(-1)!.tabel![0];
    expect(t.baris.map((r) => r[0].trim().slice(0, 4))).toEqual(["Akun", "Kons", "Kons", "Akun", "Hono", "Hono"]);
  });
});

describe("susunKebutuhanAdministrasi", () => {
  const d = susunKebutuhanAdministrasi(konteks());
  it("satu blok per akun dengan seksi sesuai uraian", () => {
    const judul = d.blok.map((b) => b.judul);
    expect(judul[0]).toBe("Ringkasan");
    expect(judul[1]).toContain("521211");
    const kons = d.blok[1].tabel!;
    expect(kons).toHaveLength(1);
    expect(kons[0].kolom[0]).toContain("Konsumsi rapat");
    const hon = d.blok[2].tabel!;
    expect(hon[0].kolom[0]).toContain("mitra");
  });
  it("ringkasan menghitung dokumen per pihak", () => {
    const r = d.blok[0].tabel![0].baris;
    expect(r.find((x) => x[0] === "Total dokumen yang perlu disiapkan")![1]).toBe("3");
    expect(r.find((x) => x[0] === "Dokumen dipegang Tim Kerja")![1]).toBe("1");
    expect(r.find((x) => x[0] === "Dokumen dipegang Bendahara")![1]).toBe("1");
  });
  it("akun tanpa master: diberi tahu; memakai pola bila ada", () => {
    expect(susunKebutuhanAdministrasi(konteks({ dok: [] })).blok[1].teks!.join(" ")).toContain("belum ada");
    const p = susunKebutuhanAdministrasi(konteks({ dok: [dok("BRG", 1, "", 1, "Nota", ["Bendahara"], "pola")], polaAkun: new Map([["521211", "BRG"], ["521213", "BRG"]]) }));
    expect(p.blok[1].teks!.join(" ")).toContain("pola umum");
  });
  it("tenggat paling awal ikut disebut", () => {
    expect(d.blok[1].teks![0]).toContain("tenggat SPJ paling awal");
  });
});

describe("susunKak", () => {
  it("teks manual kosong ditandai, terisi dipakai", () => {
    const d0 = susunKak(konteks(), KAK_KOSONG);
    expect(d0.blok[0].teks).toEqual(["[Belum diisi]"]);
    expect(d0.blok[0].manual).toBe(true);
    const d1 = susunKak(konteks(), { ...KAK_KOSONG, latar: "Baris satu\nBaris dua" });
    expect(d1.blok[0].teks).toEqual(["Baris satu", "Baris dua"]);
    expect(d1.blok[0].manual).toBe(false);
  });
  it("bagian otomatis: ruang lingkup, jadwal, organisasi, anggaran", () => {
    const d = susunKak(konteks(), KAK_KOSONG);
    expect(d.blok.map((b) => b.judul)).toEqual(["1. Latar belakang", "2. Maksud dan tujuan", "3. Dasar hukum", "4. Ruang lingkup", "5. Keluaran", "6. Jadwal", "7. Organisasi pelaksana", "8. Anggaran", "9. Penutup"]);
    expect(d.blok[3].tabel![0].baris.find((r) => r[0] === "Wilayah tugas")![1]).toContain("Nagari Contoh A");
    expect(d.blok[7].tabel![0].baris.at(-1)![2]).toContain("600.000");
  });
  it("bacaTeksKak aman terhadap data rusak; kakBelumDiisi", () => {
    expect(bacaTeksKak(null)).toEqual(KAK_KOSONG);
    expect(bacaTeksKak({ latar: 5, tujuan: "x".repeat(5000) }).tujuan).toHaveLength(4000);
    expect(kakBelumDiisi({ ...KAK_KOSONG, latar: "a", dasar: "b" })).toEqual(["Maksud dan tujuan", "Keluaran", "Penutup"]);
  });
});
