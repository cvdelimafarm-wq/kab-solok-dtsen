import { describe, expect, it } from "vitest";
import { bersihkanTeksSanggah, gabungPenerima, periksaPetugas, periksaSanggah, sanggahTerbuka, susunBarisTampilan, teksPetugas, urutPetugas, bagiKolom, barisExcel, barisExcelPerNagari, barisExcelPml, periksaBarisPml, persenRealisasi, ringkasPml, urutkanPml, kelompokkan, namaBerkasRekap, periksaBarisRekap, rapikanNama, ringkasRekap, susunBarisGambar, type BarisRekap } from "@/lib/rekapIdentifikasi";

// (11 Okt 2026) Uji rekap hasil identifikasi (hanya Sub SLS + status).
const r = (idsubsls: string, kecamatan: string, nagari: string, sls: string, sub_sls: string, status: BarisRekap["status"] = "terdampak"): BarisRekap => ({ idsubsls, kecamatan, nagari, sls, sub_sls, status });
const DATA: BarisRekap[] = [
  r("1303080001000802", "GUNUNG TALANG", "CUPAK", "JORONG SAWAH TALUAK", "02"),
  r("1303080001000801", "GUNUNG TALANG", "CUPAK", "JORONG SAWAH TALUAK", "01", "tidak_terdampak"),
  r("1303080001000901", "GUNUNG TALANG", "CUPAK", "JORONG TANGAH PADANG", "01"),
  r("1303070002000101", "GUNUNG TALANG", "AIE DINGIN", "JORONG A", "01"),
  r("1303050001000101", "LEMBAH GUMANTI", "ALAHAN PANJANG", "JORONG B", "01", "tidak_terdampak"),
  r("1303050001000102", "LEMBAH GUMANTI", "ALAHAN PANJANG", "JORONG B", "02", "belum"),
];

describe("rapikanNama", () => {
  it("menjadi huruf judul", () => {
    expect(rapikanNama("JORONG SAWAH  TALUAK")).toBe("Jorong Sawah Taluak");
    expect(rapikanNama("")).toBe("");
  });
});

describe("periksaBarisRekap", () => {
  it("membuang baris tak sah dan mengurutkan", () => {
    const x = periksaBarisRekap([{ idsubsls: "x" }, null, 5, { idsubsls: "1303080001000802", kecamatan: "K", nagari: "N", sls: "S", sub_sls: "02", status: "terdampak" }, { idsubsls: "1303080001000801", kecamatan: "K", nagari: "N", sls: "S", sub_sls: "01", status: "tidak_terdampak" }]);
    expect(x.map((b) => b.sub_sls)).toEqual(["01", "02"]);
    expect(x[0].status).toBe("tidak_terdampak");
  });
  it("status tak dikenal dianggap terdampak; bukan larik -> kosong", () => {
    expect(periksaBarisRekap([{ idsubsls: "1303080001000802", status: "aneh" }])[0].status).toBe("terdampak");
    expect(periksaBarisRekap([{ idsubsls: "1303080001000802", status: "belum" }])[0].status).toBe("belum");
    expect(periksaBarisRekap("x")).toEqual([]);
  });
});

describe("kelompokkan & ringkasRekap", () => {
  it("per nagari: terurut dan terhitung", () => {
    const g = kelompokkan(DATA, "nagari");
    expect(g.map((k) => k.judul)).toEqual(["AIE DINGIN", "CUPAK", "ALAHAN PANJANG"]);
    const cupak = g.find((k) => k.judul === "CUPAK")!;
    expect(cupak.baris).toHaveLength(3);
    expect(cupak.terdampak).toBe(2);
    expect(cupak.tidak).toBe(1);
    expect(cupak.belum).toBe(0);
    expect(cupak.induk).toBe("GUNUNG TALANG");
    expect(cupak.baris.map((b) => b.sub_sls)).toEqual(["01", "02", "01"]);
  });
  it("per kecamatan menghitung jumlah nagari", () => {
    const g = kelompokkan(DATA, "kecamatan");
    const gt = g.find((k) => k.judul === "GUNUNG TALANG")!;
    expect(gt.nagari).toBe(2);
    expect(gt.baris).toHaveLength(4);
    expect(gt.induk).toBeNull();
  });
  it("ringkasan total", () => {
    expect(ringkasRekap(DATA)).toEqual({ total: 6, terdampak: 3, tidak: 2, belum: 1, nagari: 3, kecamatan: 2 });
    expect(ringkasRekap([])).toEqual({ total: 0, terdampak: 0, tidak: 0, belum: 0, nagari: 0, kecamatan: 0 });
  });
  it("kelompok memisahkan belum diidentifikasi", () => {
    const ap = kelompokkan(DATA, "nagari").find((k) => k.judul === "ALAHAN PANJANG")!;
    expect(ap.baris).toHaveLength(2);
    expect([ap.terdampak, ap.tidak, ap.belum]).toEqual([0, 1, 1]);
  });
});

describe("susunBarisGambar & bagiKolom", () => {
  it("tingkat nagari: hanya isi", () => {
    const k = kelompokkan(DATA, "nagari").find((x) => x.judul === "CUPAK")!;
    const b = susunBarisGambar(k, "nagari");
    expect(b).toHaveLength(3);
    expect(b[0]).toEqual({ jenis: "isi", teks: "Jorong Sawah Taluak · 01", status: "tidak_terdampak" });
  });
  it("tingkat kecamatan: ada judul bagian per nagari dengan hitungan", () => {
    const k = kelompokkan(DATA, "kecamatan").find((x) => x.judul === "GUNUNG TALANG")!;
    const b = susunBarisGambar(k, "kecamatan");
    const bagian = b.filter((x) => x.jenis === "bagian");
    expect(bagian).toHaveLength(2);
    expect(bagian.map((x) => (x.jenis === "bagian" ? x.teks : ""))).toContain("Nagari Cupak");
    const cupak = bagian.find((x) => x.jenis === "bagian" && x.teks === "Nagari Cupak");
    expect(cupak && cupak.jenis === "bagian" && cupak.tidak).toBe(1);
    expect(cupak && cupak.jenis === "bagian" && cupak.belum).toBe(0);
  });
  it("bagiKolom: batas baris dan judul tidak yatim", () => {
    const baris = [
      { jenis: "bagian", teks: "A", terdampak: 0, tidak: 0, belum: 0 },
      { jenis: "isi", teks: "1", status: "terdampak" },
      { jenis: "isi", teks: "2", status: "terdampak" },
      { jenis: "bagian", teks: "B", terdampak: 0, tidak: 0, belum: 0 },
      { jenis: "isi", teks: "3", status: "terdampak" },
    ] as Parameters<typeof bagiKolom>[0];
    const k = bagiKolom(baris, 4);
    expect(k.map((c) => c.length)).toEqual([3, 2]);
    expect(k[1][0].jenis).toBe("bagian"); // B pindah bersama isinya
    expect(k.flat()).toHaveLength(5);
    expect(bagiKolom([], 5)).toEqual([]);
  });
  it("bagiKolom tidak membuat kolom kosong untuk maks sangat kecil", () => {
    const baris = Array.from({ length: 5 }, (_, i) => ({ jenis: "isi" as const, teks: String(i), status: "terdampak" as const }));
    expect(bagiKolom(baris, 1).every((c) => c.length > 0)).toBe(true);
  });
});

describe("nama berkas & Excel", () => {
  it("nama berkas aman", () => {
    const k = kelompokkan(DATA, "nagari").find((x) => x.judul === "AIE DINGIN")!;
    expect(namaBerkasRekap(k, "nagari", "2026-10-11")).toBe("rekap-identifikasi-nagari-aie-dingin-2026-10-11");
  });
  it("Excel hanya memuat wilayah + status", () => {
    const b = barisExcel(DATA);
    expect(Object.keys(b[0])).toEqual(["Kecamatan", "Nagari", "SLS", "Sub SLS", "ID Sub SLS", "Status", "Diidentifikasi oleh", "Jumlah petugas", "Sanggahan terbuka"]);
    expect(b).toHaveLength(6);
    expect(b.some((x) => x.Status === "Tidak terdampak")).toBe(true);
    expect(b.filter((x) => x.Status === "Belum diidentifikasi")).toHaveLength(1);
    const p = barisExcelPerNagari(DATA);
    expect(p.reduce((a, x) => a + Number(x["Total Sub SLS"]), 0)).toBe(6);
    expect(p.reduce((a, x) => a + Number(x["Belum diidentifikasi"]), 0)).toBe(1);
  });
});

describe("target & realisasi per PML", () => {
  const api = [
    { pml_id: 2, nama: "BUDI", peran: "pelaksana", target: 10, realisasi: 4, terdampak: 3, tidak_terdampak: 1 },
    { pml_id: 1, nama: "ANI", peran: "pelaksana", target: 8, realisasi: 8, terdampak: 5, tidak_terdampak: 3 },
    { pml_id: 1, nama: "ANI", peran: "pendamping", target: 6, realisasi: 2, terdampak: 2, tidak_terdampak: 0 },
    { pml_id: 3, nama: "CICI", peran: "pendamping", target: 5, realisasi: 5, terdampak: 5, tidak_terdampak: 0 },
    { pml_id: 0, nama: "TAK SAH", peran: "pelaksana", target: 3, realisasi: 1 },
    null,
  ];
  it("menggabungkan peran, membuang baris tak sah, urut nama", () => {
    const b = periksaBarisPml(api);
    expect(b.map((x) => x.nama)).toEqual(["ANI", "BUDI", "CICI"]);
    const ani = b[0];
    expect([ani.target, ani.realisasi, ani.terdampak, ani.tidak]).toEqual([8, 8, 5, 3]);
    expect([ani.target_pendamping, ani.realisasi_pendamping]).toEqual([6, 2]);
    expect(b[2].target).toBe(0); // CICI hanya pendamping
    expect(periksaBarisPml("x")).toEqual([]);
  });
  it("realisasi tidak melebihi target", () => {
    expect(periksaBarisPml([{ pml_id: 1, nama: "A", peran: "pelaksana", target: 3, realisasi: 9 }])[0].realisasi).toBe(3);
  });
  it("persen dibulatkan ke bawah", () => {
    expect(persenRealisasi(0, 0)).toBe(0);
    expect(persenRealisasi(4, 10)).toBe(40);
    expect(persenRealisasi(249, 250)).toBe(99);
    expect(persenRealisasi(5, 5)).toBe(100);
  });
  it("urut terendah dulu, tanpa target di akhir", () => {
    const b = periksaBarisPml(api);
    expect(urutkanPml(b, "terendah").map((x) => x.nama)).toEqual(["BUDI", "ANI", "CICI"]);
    expect(b.map((x) => x.nama)).toEqual(["ANI", "BUDI", "CICI"]); // tidak mengubah asal
  });
  it("ringkasan memakai target pelaksana saja (tidak ganda)", () => {
    expect(ringkasPml(periksaBarisPml(api))).toEqual({ pml: 2, target: 18, realisasi: 12, belum: 6, persen: 66, selesai: 1 });
  });
  it("Excel per PML", () => {
    const x = barisExcelPml(periksaBarisPml(api));
    expect(Object.keys(x[0])).toEqual(["PML", "Target Sub SLS (pelaksana)", "Realisasi (sudah diidentifikasi)", "Belum", "Persen realisasi", "Terdampak", "Tidak terdampak", "Target sebagai pendamping", "Realisasi sebagai pendamping"]);
    expect(x[1]).toMatchObject({ PML: "Budi", Belum: 6, "Persen realisasi": 40 });
  });
});

describe("petugas pengidentifikasi & sanggahan (13 Okt 2026)", () => {
  const pet = [
    { akun_id: 370, nama: "Megawati", n: 4, waktu: "2026-10-10T10:43:35Z", terakhir: false },
    { akun_id: 108, nama: "Budi Pernandes", n: 3, waktu: "2026-10-11T01:46:06Z", terakhir: true },
  ];
  it("periksaPetugas membuang yang tak sah & menetapkan bawaan", () => {
    const x = periksaPetugas([...pet, { akun_id: 0, nama: "x" }, null, { akun_id: 5, nama: "  ", n: 0 }]);
    expect(x).toHaveLength(3);
    expect(x[2]).toMatchObject({ akun_id: 5, nama: "(tanpa nama)", n: 1, terakhir: false });
    expect(periksaPetugas("x")).toEqual([]);
  });
  it("urutPetugas: hasil berlaku dulu; teksPetugas ringkas", () => {
    expect(urutPetugas(pet).map((p) => p.nama)).toEqual(["Budi Pernandes", "Megawati"]);
    expect(teksPetugas(pet)).toBe("Budi Pernandes +1 lainnya");
    expect(teksPetugas([pet[1]])).toBe("Budi Pernandes");
    expect(teksPetugas([])).toBe("");
    expect(teksPetugas(undefined)).toBe("");
  });
  it("periksaSanggah: status tak dikenal -> terbuka; id tak sah dibuang", () => {
    const x = periksaSanggah([{ id: 1, akun_id: 9, nama: "A", alasan: "rumah terendam", waktu: "2026-10-12T00:00:00Z", status: "dikoreksi" }, { id: 2, status: "aneh" }, { id: 0 }, 7]);
    expect(x.map((g) => [g.id, g.status])).toEqual([[1, "dikoreksi"], [2, "terbuka"]]);
    expect(x[1].tanggapan).toBeNull();
  });
  it("periksaBarisRekap membawa petugas/sanggah; baris lama tanpa field tetap sah", () => {
    const x = periksaBarisRekap([
      { idsubsls: "1303140002000101", status: "tidak_terdampak", petugas: pet, sanggah: [{ id: 3, akun_id: 1, nama: "B", alasan: "x", waktu: "w", status: "terbuka" }], sanggah_total: 2, sanggah_terbuka: 1, dapat_tanggapi: true },
      { idsubsls: "1303140002000102", status: "terdampak" },
    ]);
    expect(x[0].petugas).toHaveLength(2);
    expect(x[0].dapat_tanggapi).toBe(true);
    expect(x[1].petugas).toEqual([]);
    expect(x[1].dapat_tanggapi).toBe(false);
    expect(sanggahTerbuka(x[0])).toBe(1);
    expect(sanggahTerbuka(x[1])).toBe(0);
  });
  it("susunBarisTampilan: baris isi membawa Sub SLS-nya, urutan sama dengan gambar", () => {
    const k = kelompokkan(DATA, "kecamatan").find((z) => z.judul === "GUNUNG TALANG")!;
    const t = susunBarisTampilan(k, "kecamatan");
    const g = susunBarisGambar(k, "kecamatan");
    expect(t.map((z) => z.jenis)).toEqual(g.map((z) => z.jenis));
    const isi = t.filter((z) => z.jenis === "isi");
    expect(isi.map((z) => (z.jenis === "isi" ? z.baris.idsubsls : ""))).toEqual(k.baris.map((b) => b.idsubsls));
  });
  it("Excel memuat nama petugas, jumlah, dan sanggahan terbuka", () => {
    const b = barisExcel([{ ...r("1303140002000101", "K", "N", "S", "01", "tidak_terdampak"), petugas: pet, sanggah_terbuka: 2 }]);
    expect(b[0]["Diidentifikasi oleh"]).toBe("Budi Pernandes; Megawati");
    expect(b[0]["Jumlah petugas"]).toBe(2);
    expect(b[0]["Sanggahan terbuka"]).toBe(2);
    expect(barisExcel(DATA)[0]["Diidentifikasi oleh"]).toBe("");
  });
  it("bersihkanTeksSanggah: rapikan spasi, batas panjang", () => {
    expect(bersihkanTeksSanggah("  rumah   terendam \n\n\n\n parah ", 10, "Alasan")).toEqual({ ok: true, teks: "rumah terendam \n\n parah" });
    expect(bersihkanTeksSanggah("pendek", 10, "Alasan")).toEqual({ ok: false, pesan: "Alasan minimal 10 karakter." });
    expect(bersihkanTeksSanggah("x".repeat(501), 10, "Alasan").ok).toBe(false);
    expect(bersihkanTeksSanggah(null, 5, "Tanggapan").ok).toBe(false);
  });
  it("gabungPenerima: tanpa duplikat, tanpa pelaku, tanpa nilai tak sah", () => {
    expect(gabungPenerima([[3, 1, null], [1, 2, 0, -4], [undefined, 9]], 2)).toEqual([1, 3, 9]);
  });
});
