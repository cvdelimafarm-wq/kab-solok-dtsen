// lib/perencanaanPok.ts
//
// (11 Okt 2026) Baris POK per RO + pemetaan ke kegiatan + rencana realisasi -- UJI COBA, permintaan user:
// "Pastikan tidak ada yang terlewat dengan mengambil daftar dari POK ... setiap baris harus ditautkan ke salah satu kegiatan.
//  Baris yang belum tertaut ditandai 'belum dipetakan' ... 1 baris detil item anggaran bisa juga tertaut ke >1 kegiatan
//  (RAB-nya diakumulasi dari beberapa kegiatan tsb) dan masuk ke rencana realisasi yang meliputi jumlah dan kapan akan dibayarkan."
//
// Model: DetailPok (satu baris detail POK di bawah RO) <- Alokasi (detail x kegiatan, volume/nilai, rencana bayar per bulan).
// Satu detail boleh punya banyak alokasi (banyak kegiatan); jumlah alokasi tidak boleh melebihi pagu detail.
// Sumber baris: tempelan dari Excel (kolom tetap) -- format export RKKS/SAKTI akan ditambahkan setelah contoh berkasnya ada.
// Logika murni (tanpa DOM/DB); uji: lib/__tests__/perencanaanPok.test.ts.

export type DetailPok = {
  id: string;
  roId: string;
  /** Kode komponen, mis. "051". */
  komponen: string;
  /** Kode sub komponen, mis. "A". Kosong bila tidak ada. */
  subKomponen: string;
  /** Kode akun 6 digit, mis. "524113". */
  akun: string;
  uraian: string;
  volume: number | null;
  satuan: string;
  harga: number | null;
  /** Pagu baris (Rp). */
  jumlah: number;
};

export type RencanaBayar = { /** YYYY-MM */ bulan: string; nilai: number };

export type Alokasi = {
  id: string;
  detailId: string;
  kegiatanId: string;
  /** Volume yang dipakai kegiatan ini (bila baris punya harga satuan). */
  volume: number | null;
  /** Nilai alokasi (Rp) = volume x harga bila ada harga, selain itu diisi langsung. */
  nilai: number;
  rencana: RencanaBayar[];
};

// ---------------------------------------------------------------- angka

/** Baca angka gaya Indonesia/Excel: "1.234.567", "1,234,567.00", "Rp 170.000", "12,5". Kosong/tidak valid -> null. */
export function parseAngka(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let x = s.replace(/rp\.?/gi, "").replace(/\s/g, "");
  if (!x) return null;
  const neg = /^\(.*\)$/.test(x) || x.startsWith("-");
  x = x.replace(/[()\-]/g, "");
  const titik = (x.match(/\./g) ?? []).length;
  const koma = (x.match(/,/g) ?? []).length;
  if (titik && koma) {
    // pemisah desimal = yang terakhir muncul
    if (x.lastIndexOf(",") > x.lastIndexOf(".")) x = x.replace(/\./g, "").replace(",", ".");
    else x = x.replace(/,/g, "");
  } else if (titik > 1) x = x.replace(/\./g, "");
  else if (koma > 1) x = x.replace(/,/g, "");
  else if (titik === 1) {
    // "170.000" = ribuan; "12.5" = desimal
    const [, b] = x.split(".");
    if (b.length === 3) x = x.replace(".", "");
  } else if (koma === 1) {
    const [, b] = x.split(",");
    x = b.length === 3 ? x.replace(",", "") : x.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(x)) return null;
  const n = Number(x);
  return neg ? -n : n;
}

// ---------------------------------------------------------------- tempelan dari Excel

export const KOLOM_TEMPEL = ["Komponen", "Sub Komponen", "Akun", "Uraian", "Volume", "Satuan", "Harga satuan", "Jumlah"] as const;

export type HasilTempel = { baris: Omit<DetailPok, "id" | "roId">[]; galat: { baris: number; pesan: string }[] };

/**
 * Tempelan dari Excel: satu baris per detail, kolom dipisah TAB (salin-tempel Excel) atau titik koma.
 * Urutan kolom: Komponen | Sub Komponen | Akun | Uraian | Volume | Satuan | Harga satuan | Jumlah.
 * Baris judul (tanpa angka jumlah & memuat kata "akun"/"uraian") dilewati. Jumlah kosong = volume x harga.
 */
export function bacaTempelanPok(teks: string): HasilTempel {
  const baris: HasilTempel["baris"] = [];
  const galat: HasilTempel["galat"] = [];
  const lines = teks.replace(/\r/g, "").split("\n");
  lines.forEach((ln, i) => {
    if (!ln.trim()) return;
    const kol = (ln.includes("\t") ? ln.split("\t") : ln.split(";")).map((c) => c.trim());
    const [komponen = "", sub = "", akun = "", uraian = "", vol = "", satuan = "", harga = "", jumlah = ""] = kol;
    const no = i + 1;
    if (/akun|uraian/i.test(`${akun} ${uraian}`) && parseAngka(jumlah) === null && parseAngka(vol) === null) return; // judul
    const akunBersih = akun.replace(/\D/g, "");
    if (!/^\d{6}$/.test(akunBersih)) {
      galat.push({ baris: no, pesan: `Akun harus 6 digit (terbaca "${akun}").` });
      return;
    }
    if (!uraian) {
      galat.push({ baris: no, pesan: "Uraian kosong." });
      return;
    }
    const v = parseAngka(vol);
    const h = parseAngka(harga);
    let j = parseAngka(jumlah);
    if (j === null && v !== null && h !== null) j = Math.round(v * h);
    if (j === null || j <= 0) {
      galat.push({ baris: no, pesan: "Jumlah (pagu) kosong atau tidak valid." });
      return;
    }
    baris.push({
      komponen: komponen.replace(/\s/g, ""),
      subKomponen: sub.replace(/\s/g, "").toUpperCase(),
      akun: akunBersih,
      uraian: uraian.replace(/\s+/g, " "),
      volume: v,
      satuan: satuan.toUpperCase(),
      harga: h,
      jumlah: j,
    });
  });
  return { baris, galat };
}

/** Kunci stabil sebuah baris detail (dipakai saat muat ulang supaya alokasi tidak hilang). */
export function kunciDetail(d: Pick<DetailPok, "komponen" | "subKomponen" | "akun" | "uraian">): string {
  return [d.komponen, d.subKomponen, d.akun, d.uraian.toLowerCase().replace(/\s+/g, " ").trim()].join("|");
}

/**
 * Gabungkan hasil muat ke baris yang sudah ada untuk satu RO. Kunci sama -> angka diperbarui, id (dan alokasinya) tetap;
 * kunci baru -> ditambah. Baris lama yang tidak ada di muatan baru TIDAK dihapus (dilaporkan sebagai "tidak ada di muatan").
 */
export function gabungMuatan(
  lama: DetailPok[],
  roId: string,
  baru: Omit<DetailPok, "id" | "roId">[],
  idBaru: () => string
): { detail: DetailPok[]; ditambah: number; diperbarui: number; tidakAdaDiMuatan: number } {
  const milikRo = lama.filter((d) => d.roId === roId);
  const lain = lama.filter((d) => d.roId !== roId);
  const peta = new Map(milikRo.map((d) => [kunciDetail(d), d]));
  const terlihat = new Set<string>();
  let ditambah = 0;
  let diperbarui = 0;
  const hasil = [...milikRo];
  for (const b of baru) {
    const k = kunciDetail(b);
    if (terlihat.has(k)) continue; // duplikat dalam satu muatan: ambil yang pertama
    terlihat.add(k);
    const ada = peta.get(k);
    if (ada) {
      const idx = hasil.findIndex((x) => x.id === ada.id);
      hasil[idx] = { ...ada, ...b };
      diperbarui++;
    } else {
      hasil.push({ ...b, id: idBaru(), roId });
      ditambah++;
    }
  }
  const tidakAdaDiMuatan = milikRo.filter((d) => !terlihat.has(kunciDetail(d))).length;
  return { detail: [...lain, ...hasil], ditambah, diperbarui, tidakAdaDiMuatan };
}

// ---------------------------------------------------------------- alokasi & status pemetaan

export type StatusDetail = "belum" | "sebagian" | "penuh" | "lebih";

export function ringkasDetail(d: DetailPok, alokasi: Alokasi[]): { teralokasi: number; sisa: number; status: StatusDetail; jumlahKegiatan: number } {
  const milik = alokasi.filter((a) => a.detailId === d.id);
  const teralokasi = milik.reduce((s, a) => s + a.nilai, 0);
  const sisa = d.jumlah - teralokasi;
  const status: StatusDetail = milik.length === 0 ? "belum" : sisa > 0.5 ? "sebagian" : sisa < -0.5 ? "lebih" : "penuh";
  return { teralokasi, sisa, status, jumlahKegiatan: new Set(milik.map((a) => a.kegiatanId)).size };
}

/** Nilai alokasi: volume x harga bila baris punya harga & volume diisi; selain itu nilai langsung. */
export function nilaiAlokasi(d: Pick<DetailPok, "harga">, volume: number | null, nilai: number | null): number {
  if (d.harga !== null && volume !== null) return Math.round(volume * d.harga);
  return Math.round(nilai ?? 0);
}

/** Periksa seluruh alokasi satu detail (setelah diubah). */
export function periksaAlokasiDetail(d: DetailPok, alokasiDetail: Alokasi[], tahun: number): string | null {
  const kegiatan = new Set<string>();
  for (const a of alokasiDetail) {
    if (!a.kegiatanId) return "Pilih kegiatan untuk setiap baris alokasi.";
    if (kegiatan.has(a.kegiatanId)) return "Satu kegiatan cukup satu baris alokasi untuk detail yang sama.";
    kegiatan.add(a.kegiatanId);
    if (!(a.nilai > 0)) return "Nilai alokasi harus lebih dari 0.";
    const terencana = a.rencana.reduce((s, r) => s + r.nilai, 0);
    if (terencana > a.nilai + 0.5) return "Rencana bayar melebihi nilai alokasi.";
    for (const r of a.rencana) {
      if (!/^\d{4}-\d{2}$/.test(r.bulan) || Number(r.bulan.slice(0, 4)) !== tahun) return `Bulan rencana bayar harus di tahun anggaran ${tahun}.`;
      if (!(r.nilai > 0)) return "Nilai rencana bayar harus lebih dari 0.";
    }
  }
  const total = alokasiDetail.reduce((s, a) => s + a.nilai, 0);
  if (total > d.jumlah + 0.5) return "Total alokasi melebihi pagu baris POK.";
  return null;
}

/** Bagi sisa pagu ke satu kegiatan (pintasan "seluruh sisa"). */
export function alokasiSisa(d: DetailPok, alokasi: Alokasi[], kegiatanId: string, id: string): Alokasi | null {
  const { sisa } = ringkasDetail(d, alokasi);
  if (sisa <= 0) return null;
  const volume = d.harga ? Math.floor((sisa / d.harga) * 1000) / 1000 : null;
  return { id, detailId: d.id, kegiatanId, volume, nilai: Math.round(sisa), rencana: [] };
}

export function ringkasRo(detail: DetailPok[], alokasi: Alokasi[]): { pagu: number; teralokasi: number; belumBaris: number; belumNilai: number; sebagianBaris: number; lebihBaris: number } {
  let pagu = 0;
  let teralokasi = 0;
  let belumBaris = 0;
  let belumNilai = 0;
  let sebagianBaris = 0;
  let lebihBaris = 0;
  for (const d of detail) {
    const r = ringkasDetail(d, alokasi);
    pagu += d.jumlah;
    teralokasi += r.teralokasi;
    if (r.status === "belum") {
      belumBaris++;
      belumNilai += d.jumlah;
    } else if (r.status === "sebagian") {
      sebagianBaris++;
      belumNilai += r.sisa;
    } else if (r.status === "lebih") lebihBaris++;
  }
  return { pagu, teralokasi, belumBaris, belumNilai, sebagianBaris, lebihBaris };
}

/** RAB kegiatan = akumulasi alokasi dari semua baris POK yang tertaut. */
export function anggaranKegiatan(kegiatanId: string, detail: DetailPok[], alokasi: Alokasi[]): { total: number; terjadwal: number; baris: { alokasi: Alokasi; detail: DetailPok }[] } {
  const peta = new Map(detail.map((d) => [d.id, d]));
  const baris = alokasi.filter((a) => a.kegiatanId === kegiatanId && peta.has(a.detailId)).map((a) => ({ alokasi: a, detail: peta.get(a.detailId)! }));
  const total = baris.reduce((s, b) => s + b.alokasi.nilai, 0);
  const terjadwal = baris.reduce((s, b) => s + b.alokasi.rencana.reduce((t, r) => t + r.nilai, 0), 0);
  return { total, terjadwal, baris };
}

// ---------------------------------------------------------------- rencana realisasi

export const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export type BarisMatriks = { kunci: string; label: string; perBulan: number[]; terjadwal: number; nilai: number; belumDijadwalkan: number };

/**
 * Matriks rencana realisasi per kegiatan x bulan (12 bulan tahun anggaran), ditambah baris "Belum dipetakan" (sisa pagu tanpa kegiatan).
 */
export function matriksRencana(
  detail: DetailPok[],
  alokasi: Alokasi[],
  kegiatan: { id: string; nama: string }[],
  tahun: number
): { baris: BarisMatriks[]; totalBulan: number[]; total: number } {
  const idDetail = new Set(detail.map((d) => d.id));
  const milikRo = alokasi.filter((a) => idDetail.has(a.detailId));
  const baris: BarisMatriks[] = [];
  for (const k of kegiatan) {
    const al = milikRo.filter((a) => a.kegiatanId === k.id);
    if (al.length === 0) continue;
    const perBulan = new Array(12).fill(0);
    let terjadwal = 0;
    for (const a of al)
      for (const r of a.rencana) {
        if (Number(r.bulan.slice(0, 4)) !== tahun) continue;
        perBulan[Number(r.bulan.slice(5, 7)) - 1] += r.nilai;
        terjadwal += r.nilai;
      }
    const nilai = al.reduce((s, a) => s + a.nilai, 0);
    baris.push({ kunci: k.id, label: k.nama, perBulan, terjadwal, nilai, belumDijadwalkan: nilai - terjadwal });
  }
  const { belumNilai } = ringkasRo(detail, milikRo);
  if (belumNilai > 0) baris.push({ kunci: "__belum", label: "Belum dipetakan ke kegiatan", perBulan: new Array(12).fill(0), terjadwal: 0, nilai: belumNilai, belumDijadwalkan: belumNilai });
  const totalBulan = new Array(12).fill(0).map((_, i) => baris.reduce((s, b) => s + b.perBulan[i], 0));
  const total = baris.reduce((s, b) => s + b.nilai, 0);
  return { baris, totalBulan, total };
}
