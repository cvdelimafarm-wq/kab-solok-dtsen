// lib/keu/__tests__/keluaran.test.ts
//
// (28 Okt 2026) Uji keluaran RAB per survei: dana (Bendahara), rencana bayar (PPK/TU), butir pengadaan dan spesifikasi (PBJ).

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import type { BarisRincian, IsiLanjutan } from "../lanjutan";
import type { ItemPengadaan } from "../pengadaan";
import {
  samaIsi,
  bacaIsiKeluaran, bersihkanSpek, barisKeluaran, hambatanAjukan, jumlahTotal, KOLOM_SPEK, kurangSpek, petaKunci, petaTanda, susunBayar, susunButir, susunDana, susunKeluaran, type BarisKel,
} from "../keluaran";

const isi = vektor.base as unknown as IsiLanjutan;
const rc = (kelompok: BarisRincian["kelompok"], uraian: string, akun: string): BarisRincian => ({ kelompok, uraian, akun, volume: 10, satuan: "orang", tarif: 50000, jumlah: 500000, catatan: "", perk: false });
const rincian = [rc("Pelatihan", "Pelatihan Triwulan I: konsumsi tanpa paket", "521211"), rc("Rapat", "Konsumsi rapat evaluasi tatap muka", "521211")];
const periode = [{ periode: "Triwulan I", mulai: "2026-03-02", selesai: "2026-03-06" }];
const libur = new Set<string>();
const meta = petaKunci(rincian, periode, isi, libur);

const baris = (id: number, item: number, akun: string, uraian: string, jumlah: number, kunci: string | null, bulan = 3, minggu = 2): BarisKel =>
  ({ baris_id: id, item_id: item, ket: `r${id}`, volume: 2, satuan: "orang", harga: jumlah / 2, jumlah, bulan, minggu, kunci, akun, itemUraian: uraian });

describe("barisKeluaran", () => {
  it("hanya baris identifikasi ini yang itemnya dikenal, urut baris_id, angka jadi number", () => {
    const b = [
      { baris_id: 3, item_id: 1, ket: "a", volume: "2", satuan: "x", harga_satuan: "100", jumlah: "200", bulan_mulai: 3, minggu: 1, ident_id: 9, ident_kunci: "k" },
      { baris_id: 2, item_id: 1, ket: "b", volume: 1, satuan: "x", harga_satuan: 5, jumlah: 5, bulan_mulai: 3, minggu: 1, ident_id: 8, ident_kunci: "k" },
      { baris_id: 1, item_id: 7, ket: "c", volume: 1, satuan: "x", harga_satuan: 5, jumlah: 5, bulan_mulai: 3, minggu: 1, ident_id: 9, ident_kunci: "k" },
      { baris_id: 0, item_id: 1, ket: "d", volume: 1, satuan: "x", harga_satuan: 5, jumlah: 5, bulan_mulai: 3, minggu: 1, ident_id: 9, ident_kunci: null },
    ];
    const r = barisKeluaran(b, [{ id: 1, akun_kode: "521211", uraian: "Konsumsi" }], 9);
    expect(r.map((x) => x.baris_id)).toEqual([0, 3]);
    expect(r[1]).toMatchObject({ volume: 2, harga: 100, jumlah: 200, akun: "521211", itemUraian: "Konsumsi", kunci: "k" });
    expect(r[0].kunci).toBeNull();
  });
});

describe("susunDana", () => {
  const bs = [baris(1, 10, "521211", "Konsumsi A", 300000, "a"), baris(2, 10, "521211", "Konsumsi A", 200000, "b", 4, 1), baris(3, 11, "524113", "Translok", 100000, "c", 3, 2), baris(4, 12, "521211", "Konsumsi B", 50000, "d", 3, 4)];
  const d = susunDana(bs, (a) => (a === "521211" ? "Belanja Barang Operasional Lainnya" : ""));
  it("total dan pohon akun > item > rincian", () => {
    expect(d.total).toBe(650000);
    expect(d.akun.map((a) => [a.akun, a.total, a.nama])).toEqual([["521211", 550000, "Belanja Barang Operasional Lainnya"], ["524113", 100000, ""]]);
    expect(d.akun[0].item.map((i) => [i.itemId, i.total, i.rincian.length])).toEqual([[10, 500000, 2], [12, 50000, 1]]);
  });
  it("ringkasan per bulan dan minggu cair", () => {
    expect(d.bulan.map((b) => [b.bulan, b.total])).toEqual([[3, 450000], [4, 200000]]);
    expect(d.bulan[0].minggu).toEqual([{ minggu: 2, total: 400000 }, { minggu: 4, total: 50000 }]);
  });
  it("kosong", () => {
    expect(susunDana([])).toEqual({ total: 0, akun: [], bulan: [] });
  });
});

describe("petaKunci dan susunBayar", () => {
  it("hari terakhir kegiatan per kunci: kelas dari akhir kelas, rapat dari akhir periode", () => {
    const sel = [...meta.values()].map((m) => [m.kelompok, m.selesai]);
    expect(sel).toContainEqual(["Pelatihan", "2026-03-03"]);
    expect(sel).toContainEqual(["Rapat", "2026-03-06"]);
  });
  const kPel = [...meta.entries()].find(([, m]) => m.kelompok === "Pelatihan")![0];
  const kRap = [...meta.entries()].find(([, m]) => m.kelompok === "Rapat")![0];
  it("tenggat SPJ 5 dan bayar 10 hari kerja; urut menurut tenggat; baris tanpa kunci dikenal = tanpa tanggal", () => {
    const bs = [baris(1, 1, "521211", "A", 300000, kRap), baris(2, 1, "521211", "A", 200000, kPel), baris(3, 1, "521211", "A", 100000, "asing"), baris(4, 1, "521211", "A", 50000, null)];
    const b = susunBayar(bs, meta, libur);
    expect(b.rincian.map((r) => [r.selesai, r.tenggatSpj, r.tenggatBayar])).toEqual([
      ["2026-03-03", "2026-03-10", "2026-03-17"], ["2026-03-06", "2026-03-13", "2026-03-20"], [null, null, null], [null, null, null],
    ]);
    expect(b.tanpaTanggal).toBe(2);
    expect(b.totalTanpaTanggal).toBe(150000);
    expect(b.perBulan).toEqual([{ bulan: "2026-03", total: 500000, n: 2 }]);
  });
  it("libur menggeser tenggat; hari bayar null = tanpa tenggat bayar", () => {
    const b = susunBayar([baris(1, 1, "521211", "A", 100, kPel)], meta, new Set(["2026-03-04"]), 5, null);
    expect(b.rincian[0].tenggatSpj).toBe("2026-03-11");
    expect(b.rincian[0].tenggatBayar).toBeNull();
    expect(b.perBulan[0].bulan).toBe("2026-03");
  });
});

describe("spesifikasi", () => {
  it("bersihkanSpek: hanya kolom jenis itu, rapikan spasi, pilihan dan angka divalidasi, baris barang kosong dibuang", () => {
    const s = bersihkanSpek("Paket meeting", {
      isi: { tempat: "  Hotel   Contoh ", paket: "fullday", peserta: "30", hari: "dua", asing: "x" },
      barang: [{ nama: " Spidol ", jumlah: "5", satuan: "pak", spesifikasi: "" }, { nama: "", jumlah: "1", satuan: "", spesifikasi: "" }],
      catatan: "  perlu proyektor ",
    });
    expect(s.isi).toEqual({ tempat: "Hotel Contoh", paket: "fullday", peserta: "30" });
    expect(s.barang).toEqual([{ nama: "Spidol", jumlah: "5", satuan: "pak", spesifikasi: "" }]);
    expect(s.catatan).toBe("perlu proyektor");
    expect(bersihkanSpek("Paket meeting", { isi: { paket: "fullmoon" } }).isi).toEqual({});
    expect(bersihkanSpek("Pulsa", "bukan objek")).toEqual({ isi: {}, barang: [], catatan: "" });
  });
  it("batas jumlah barang dan panjang teks", () => {
    const banyak = Array.from({ length: 100 }, (_, i) => ({ nama: `b${i}`, jumlah: "1", satuan: "x", spesifikasi: "" }));
    expect(bersihkanSpek("Perlengkapan", { barang: banyak }).barang).toHaveLength(60);
    expect(bersihkanSpek("Konsumsi", { isi: { waktu: "x".repeat(900) } }).isi.waktu).toHaveLength(300);
  });
  it("kurangSpek: wajib per jenis; perlengkapan butuh barang", () => {
    expect(kurangSpek("Pulsa", bersihkanSpek("Pulsa", { isi: { jenis: "Pulsa" } }))).toEqual(["Nominal per orang (Rp) belum diisi", "Jumlah penerima belum diisi"]);
    expect(kurangSpek("Perlengkapan", bersihkanSpek("Perlengkapan", {}))).toEqual(["daftar barang belum diisi"]);
    expect(kurangSpek("Perlengkapan", bersihkanSpek("Perlengkapan", { barang: [{ nama: "Map" }] }))).toEqual([]);
  });
  it("tiap jenis punya kolom dengan kunci unik", () => {
    for (const [j, kol] of Object.entries(KOLOM_SPEK)) {
      expect(new Set(kol.map((k) => k.kunci)).size, j).toBe(kol.length);
      expect(kol.length, j).toBeGreaterThan(0);
    }
  });
});

describe("susunButir", () => {
  const butir = (id: string, uraian: string): ItemPengadaan => ({
    kunci: "pg1", id, kelompok: "Pelatihan", jenis: "Konsumsi", uraian, akun: "521211", volume: 20, satuan: "orang-hari", tarif: 50000, nilai: 1000000, tempat: "Hotel", paket: "",
    butuhMulai: "2026-03-02", butuhSelesai: "2026-03-03", perkiraan: false, perlu: ["tanggal belum"], catatan: [],
  });
  const kPel = [...meta.entries()].find(([, m]) => m.kelompok === "Pelatihan")![0];
  it("butir dikaitkan ke baris RAB yang cocok; nilai dari RAB, bukan dari tarif", () => {
    const bs = [baris(1, 1, "521211", "Konsumsi", 400000, kPel), baris(2, 1, "521211", "Konsumsi", 100000, "asing")];
    const r = susunButir([butir("k1:konsumsi", "Pelatihan Triwulan I: konsumsi tanpa paket")], bs, meta, ["Triwulan I"], new Map());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nilaiRab: 400000, volumeRab: 2, digabung: false });
    expect(r[0].rab.map((x) => x.jumlah)).toEqual([400000]);
    expect(r[0].spek).toEqual({ isi: {}, barang: [], catatan: "" });
    expect(r[0].kurangSpek.length).toBeGreaterThan(0);
  });
  it("tanpa baris RAB yang cocok: nilai null; spesifikasi tersimpan ikut", () => {
    const r = susunButir([butir("k9:konsumsi", "Kelas lain: konsumsi")], [baris(1, 1, "521211", "x", 100, kPel)], meta, ["Triwulan I"], new Map([["k9:konsumsi", { isi: { jenis: "Snack", porsi: "20", kali: "2" } }]]));
    expect(r[0].nilaiRab).toBeNull();
    expect(r[0].spek.isi).toEqual({ jenis: "Snack", porsi: "20", kali: "2" });
    expect(r[0].kurangSpek).toEqual([]);
  });
  it("satu baris RAB cocok dengan dua butir (nama periode diabaikan): digabung, nilai tidak dibagi", () => {
    const bs = [baris(1, 1, "521211", "Konsumsi", 400000, kPel)];
    const r = susunButir([butir("a", "Pelatihan Triwulan I: konsumsi tanpa paket"), butir("b", "Pelatihan: konsumsi tanpa paket")], bs, meta, ["Triwulan I"], new Map());
    expect(r.map((x) => [x.digabung, x.nilaiRab])).toEqual([[true, null], [true, null]]);
  });
});

describe("paket", () => {
  it("susunKeluaran, hambatan, bacaIsiKeluaran, petaTanda", () => {
    const bs = [baris(1, 1, "521211", "A", 100, null), baris(2, 1, "521211", "A", 250, null)];
    const k = susunKeluaran({ identNama: "Susenas", roKode: "R1", tahun: 2026, identVer: 1, rabNomor: "1", rabStatus: "draf" }, bs, susunDana(bs), susunBayar(bs, meta, libur), []);
    expect(k).toMatchObject({ v: 1, n: 2, total: 350 });
    expect(jumlahTotal(bs)).toBe(350);
    expect(bacaIsiKeluaran(JSON.parse(JSON.stringify(k)))).not.toBeNull();
    expect(bacaIsiKeluaran({ v: 2 })).toBeNull();
    expect(bacaIsiKeluaran(null)).toBeNull();
    expect(hambatanAjukan("siap", 2)).toEqual([]);
    expect(hambatanAjukan("draf", 0)).toHaveLength(2);
    const t = petaTanda([{ keluaran_id: 5, bagian: "dana", status: "diterima", catatan: "", oleh_nama: "B", at: "x" }, { keluaran_id: 4, bagian: "bayar", status: "diterima" }, { keluaran_id: 5, bagian: "ngawur" as never, status: "diterima" }], 5);
    expect([...t.keys()]).toEqual(["dana"]);
  });
});

describe("samaIsi", () => {
  it("tidak peduli urutan kunci, peka terhadap nilai", () => {
    expect(samaIsi({ a: 1, b: { c: [1, { x: 1, y: 2 }] } }, { b: { c: [1, { y: 2, x: 1 }] }, a: 1 })).toBe(true);
    expect(samaIsi({ a: 1 }, { a: 2 })).toBe(false);
    expect(samaIsi({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(samaIsi({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});
