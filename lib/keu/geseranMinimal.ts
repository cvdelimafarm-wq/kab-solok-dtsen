// lib/keu/geseranMinimal.ts
//
// (24 Okt 2026) Tahap 4l: "Terapkan RAB dalam batas pagu" (usulan geseran minimal, Mode Pagu Tetap), "Turunkan item yang boleh ditunda", dan
// "Terapkan RAB penuh (Revisi DIPA)" pada Kertas Kerja per KRO (papan 1 mockup). Logika murni (tanpa React/DB) yang menyusun RENCANA; yang menulis
// ke basis data adalah halaman, lewat keu_tulis (keu_kk_baris, keu_kk_geseran), dan basis data tetap yang memutuskan.
//
// Aturan (dari teks mockup dan basis data):
//  - Geseran hanya dalam satu RO dan satu kelompok belanja (51, 524, 52 selain 524, 53), sehingga pagu RO dan pagu kelompok tidak berubah (R-05, R-16, R-17).
//  - Penerima: item ber-RAB (belum selesai) yang POK Menjadi-nya kurang dari RAB. Urutan menurut kategori prioritas (bawaan Inti, Penting, Dapat ditunda),
//    lalu kekurangan terbesar.
//  - Sumber, berurutan: baris Dana penggenap; item selesai; kelebihan di atas RAB (terbesar dulu); item tanpa RAB bila dicentang; item kategori
//    boleh ditunda (di bawah RAB) bila dicentang. Tak ada sumber yang turun di bawah Booked + Realisasi (R-06) maupun, kecuali kategori ditunda, di bawah RAB.
//  - Volume diubah dalam satuan penuh (harga satuan tetap). Selisih pembulatan ditampung di baris Dana penggenap (52xxxx) bila boleh; bila tidak
//    bisa pas, kelompok itu dilewati dan dicatat alasannya. Dana penggenap (volume 1) diubah pada harga, jadi tepat rupiah.
//  - Jumlah Menjadi dihitung seperti basis data (keu_kk_sebelum): sama dengan Semula bila volume dan harga tak berubah, selain itu round(volume x harga).

import { kelompokAkun, n } from "./kk";
import type { BarisMx } from "./matriks";
import type { BarisRabKro } from "./rabKro";
import type { BarisRabRow } from "./rab";

export type OpsiGeseran = { tanpaRab: boolean; turunkanTunda: boolean; tampungPenggenap: boolean };
export const OPSI_GESERAN_AWAL: OpsiGeseran = { tanpaRab: false, turunkanTunda: false, tampungPenggenap: true };
export const KODE_TUNDA_BAWAAN = ["tunda"];

export type Perubahan = {
  id: number; ro: string; kelompok: string; uraian: string; peran: "donor" | "penerima" | "penggenap";
  volDari: number; volKe: number; hargaDari: number; hargaKe: number; jumlahDari: number; jumlahKe: number;
};
export type Aliran = { ro: string; kelompok: string; donorId: number; donorUraian: string; penerimaId: number | null; penerimaUraian: string; jumlah: number };
export type PenggenapBaru = { ro: string; kelompok: string; komponen: string; akun: string; jumlah: number };
export type Dilewati = { ro: string; kelompok: string; alasan: string };
export type RencanaGeseran = {
  perubahan: Perubahan[]; aliran: Aliran[]; penggenapBaru: PenggenapBaru[]; dilewati: Dilewati[];
  kekuranganAwal: number; kekuranganSesudah: number; dipindah: number;
};

const bulat2 = (x: number): number => Math.round(x * 100) / 100;

type Baris = {
  id: number; ro: string; komponen: string; akun: string; kel: string; uraian: string; vol: number; harga: number; jumlah: number;
  semula: { vol: number; harga: number; jumlah: number }; lantai: number; rab: number | null; status: string; prio: string | null; penggenap: boolean;
};

/** Jumlah Menjadi seperti yang dihitung basis data setelah volume/harga diubah. */
export function jumlahMenjadi(b: Pick<Baris, "semula">, vol: number, harga: number): number {
  return vol === b.semula.vol && harga === b.semula.harga ? b.semula.jumlah : Math.round(vol * harga);
}

function susunBaris(baris: BarisMx[], rab: BarisRabKro[]): Baris[] {
  const perId = new Map(rab.map((r) => [r.id, r]));
  const hasil: Baris[] = [];
  for (const b of baris) {
    const kel = kelompokAkun(b.akun_menjadi);
    if (kel === null) continue;
    const r = perId.get(b.id);
    hasil.push({
      id: b.id, ro: b.ro_kode, komponen: b.komponen_kode, akun: b.akun_menjadi, kel, uraian: b.uraian_menjadi ?? b.uraian_semula ?? "", vol: n(b.vol_menjadi), harga: n(b.harga_menjadi),
      jumlah: n(b.jumlah_menjadi), semula: { vol: n(b.vol_semula), harga: n(b.harga_semula), jumlah: n(b.jumlah_semula) }, lantai: b.booked + b.real,
      rab: r && r.status !== "belum" ? r.rab : null, status: b.penggenap ? "penggenap" : (r?.status ?? "belum"), prio: r?.prioritas ?? b.prioritas_kode ?? null, penggenap: b.penggenap,
    });
  }
  return hasil;
}

type Sumber = { b: Baris; avail: number; tier: number };

function sumberUntuk(rows: Baris[], butuh: Set<number>, opsi: OpsiGeseran, kodeTunda: string[]): Sumber[] {
  const s: Sumber[] = [];
  for (const b of rows) {
    if (butuh.has(b.id)) continue;
    const bebas = b.jumlah - b.lantai;
    if (bebas <= 0) continue;
    if (b.penggenap) s.push({ b, avail: bebas, tier: 0 });
    else if (b.status === "selesai") s.push({ b, avail: bebas, tier: 1 });
    else if (b.rab !== null) {
      const lebih = b.jumlah - Math.max(b.rab, b.lantai);
      if (lebih > 0) s.push({ b, avail: lebih, tier: 2 });
      if (opsi.turunkanTunda && b.prio !== null && kodeTunda.includes(b.prio)) {
        const tambah = Math.min(b.jumlah, Math.max(b.rab, b.lantai)) - b.lantai;
        if (tambah > 0) s.push({ b, avail: tambah, tier: 4 });
      }
    } else if (opsi.tanpaRab) s.push({ b, avail: bebas, tier: 3 });
  }
  return s.sort((x, y) => x.tier - y.tier || y.avail - x.avail || x.b.id - y.b.id);
}

/**
 * Rencana geseran minimal untuk semua RO dan kelompok pada baris-baris itu. Tidak mengubah masukan.
 * `urutPrioritas`: kode kategori -> urutan (kecil = dipenuhi lebih dulu); kategori tak dikenal paling akhir.
 */
export function rencanakanGeseran(
  baris: BarisMx[], rab: BarisRabKro[], urutPrioritas: Map<string, number>, opsi: OpsiGeseran = OPSI_GESERAN_AWAL, kodeTunda: string[] = KODE_TUNDA_BAWAAN,
): RencanaGeseran {
  const semua = susunBaris(baris, rab);
  const rencana: RencanaGeseran = { perubahan: [], aliran: [], penggenapBaru: [], dilewati: [], kekuranganAwal: 0, kekuranganSesudah: 0, dipindah: 0 };
  const rank = (p: string | null) => (p === null ? Number.MAX_SAFE_INTEGER : (urutPrioritas.get(p) ?? Number.MAX_SAFE_INTEGER - 1));
  const kunciGrup = [...new Set(semua.map((b) => `${b.ro}|${b.kel}`))].sort();

  for (const kg of kunciGrup) {
    const [ro, kel] = kg.split("|");
    const rows = semua.filter((b) => b.ro === ro && b.kel === kel);
    const penerima = rows
      .filter((b) => !b.penggenap && b.rab !== null && b.status !== "selesai" && b.rab > b.jumlah)
      .sort((a, c) => rank(a.prio) - rank(c.prio) || (c.rab! - c.jumlah) - (a.rab! - a.jumlah) || a.id - c.id);
    if (penerima.length === 0) continue;
    const butuhTotal = penerima.reduce((s, b) => s + (b.rab! - b.jumlah), 0);
    rencana.kekuranganAwal += butuhTotal;

    const keadaan = new Map(rows.map((b) => [b.id, { vol: b.vol, harga: b.harga }]));
    const sumber = sumberUntuk(rows, new Set(penerima.map((b) => b.id)), opsi, kodeTunda);
    // ---- ambil dari sumber
    const ambil = new Map<number, number>(); // id -> jumlah yang sudah diambil dari sumber (perkiraan)
    let sisaButuh = butuhTotal;
    for (const { b, avail } of sumber) {
      if (sisaButuh <= 0) break;
      const sudah = ambil.get(b.id) ?? 0;
      const a = Math.min(avail, b.jumlah - b.lantai - sudah);
      if (a <= 0) continue;
      const st = keadaan.get(b.id)!;
      if (b.penggenap) {
        if (b.vol !== 1) continue;
        const t = Math.min(a, sisaButuh);
        st.harga -= t; ambil.set(b.id, sudah + t); sisaButuh -= t;
      } else {
        if (b.harga <= 0) continue;
        const kMaks = Math.min(Math.floor(a / b.harga), Math.floor(st.vol));
        const k = Math.min(kMaks, Math.ceil(sisaButuh / b.harga));
        if (k <= 0) continue;
        st.vol = bulat2(st.vol - k);
        const nyata = b.jumlah - jumlahMenjadi(b, st.vol, b.harga);
        ambil.set(b.id, sudah + nyata); sisaButuh -= nyata;
      }
    }
    const donorIds = [...ambil.keys()];
    if (donorIds.length === 0) { rencana.dilewati.push({ ro, kelompok: kel, alasan: "Tidak ada dana yang dapat digeser dalam kelompok ini (semua sumber sudah di batas RAB atau Booked + Realisasi)." }); rencana.kekuranganSesudah += butuhTotal; continue; }

    const bebasDonor = (id: number) => { const b = rows.find((x) => x.id === id)!; const st = keadaan.get(id)!; return b.jumlah - jumlahMenjadi(b, st.vol, st.harga); };
    let dibebaskan = donorIds.reduce((s, id) => s + bebasDonor(id), 0);

    // ---- bagikan ke penerima menurut prioritas, dengan volume satuan penuh
    const serap: { b: Baris; vol: number; jumlah: number }[] = [];
    let sisaDana = dibebaskan;
    for (const b of penerima) {
      const st = keadaan.get(b.id)!;
      if (b.harga <= 0) continue;
      const butuh = b.rab! - b.jumlah;
      let u = Math.min(Math.ceil(butuh / b.harga), Math.floor(sisaDana / b.harga));
      let jBaru = b.jumlah;
      while (u > 0) {
        jBaru = jumlahMenjadi(b, bulat2(st.vol + u), b.harga);
        if (jBaru - b.jumlah <= sisaDana) break;
        u--;
      }
      if (u > 0) {
        st.vol = bulat2(st.vol + u);
        sisaDana -= jBaru - b.jumlah;
      }
      // sisa kebutuhan yang kurang dari satu satuan penuh: tambah volume pecahan (dua desimal) selama dana masih ada
      const kurangLagi = butuh - (jBaru - b.jumlah);
      if (kurangLagi > 0 && sisaDana > 0) {
        let f = Math.floor((Math.min(kurangLagi, sisaDana) / b.harga) * 100) / 100;
        while (f > 0) {
          const j2 = jumlahMenjadi(b, bulat2(st.vol + f), b.harga);
          if (j2 - b.jumlah <= sisaDana && j2 - b.jumlah <= butuh) { st.vol = bulat2(st.vol + f); sisaDana -= j2 - b.jumlah; jBaru = j2; break; }
          f = bulat2(f - 0.01);
        }
      }
      if (jBaru > b.jumlah) serap.push({ b, vol: st.vol, jumlah: jBaru - b.jumlah });
    }

    // ---- sisa dana: kurangi sumber tepat-rupiah (Dana penggenap), lalu tampung di Dana penggenap, lalu mundurkan sumber satuan penuh
    let sisa = sisaDana;
    const penggenapBaru: PenggenapBaru[] = [];
    if (sisa > 0) {
      for (const id of donorIds) {
        const b = rows.find((x) => x.id === id)!;
        if (!b.penggenap || sisa <= 0) continue;
        const st = keadaan.get(id)!; const t = Math.min(sisa, b.harga - st.harga);
        if (t > 0) { st.harga += t; sisa -= t; }
      }
    }
    if (sisa > 0 && opsi.tampungPenggenap && (kel === "52L" || kel === "524")) {
      const ada = rows.find((b) => b.penggenap && b.vol === 1 && !ambil.has(b.id));
      if (ada) { keadaan.get(ada.id)!.harga += sisa; sisa = 0; }
      else { const p = penerima[0]; penggenapBaru.push({ ro, kelompok: kel, komponen: p.komponen, akun: p.akun, jumlah: sisa }); sisa = 0; }
    }
    if (sisa > 0) {
      for (const id of [...donorIds].reverse()) {
        const b = rows.find((x) => x.id === id)!;
        if (b.penggenap) continue;
        const st = keadaan.get(id)!;
        while (st.vol < b.vol) {
          const sebelum = bebasDonor(id);
          const coba = bulat2(st.vol + 1 > b.vol ? b.vol : st.vol + 1);
          const j = b.jumlah - jumlahMenjadi(b, coba, b.harga);
          const kurang = sebelum - j;
          if (kurang > sisa) break;
          st.vol = coba; sisa -= kurang;
        }
        if (sisa <= 0) break;
      }
    }
    if (sisa !== 0) {
      rencana.dilewati.push({ ro, kelompok: kel, alasan: `Sisa Rp ${sisa} tidak dapat ditampung tepat (aktifkan Dana penggenap untuk akun 52, atau geser manual).` });
      rencana.kekuranganSesudah += butuhTotal;
      continue;
    }

    // ---- hasil kelompok ini
    const aliranDonor = donorIds.map((id) => ({ id, jumlah: bebasDonor(id) })).filter((x) => x.jumlah > 0);
    const aliranPenerima: { id: number | null; jumlah: number }[] = serap.map((x) => ({ id: x.b.id, jumlah: x.jumlah }));
    const totalDonor = aliranDonor.reduce((s, x) => s + x.jumlah, 0), totalSerap = aliranPenerima.reduce((s, x) => s + x.jumlah, 0);
    const tampung = totalDonor - totalSerap;
    if (tampung > 0) {
      const pg = rows.find((b) => b.penggenap && b.vol === 1 && !ambil.has(b.id) && keadaan.get(b.id)!.harga !== b.harga);
      aliranPenerima.push({ id: pg ? pg.id : null, jumlah: tampung });
    }
    const nama = (id: number | null) => (id === null ? "Dana penggenap (baru)" : rows.find((x) => x.id === id)!.uraian);
    let i = 0, j = 0, sd = aliranDonor[0]?.jumlah ?? 0, sp = aliranPenerima[0]?.jumlah ?? 0;
    while (i < aliranDonor.length && j < aliranPenerima.length) {
      const m = Math.min(sd, sp);
      if (m > 0) rencana.aliran.push({ ro, kelompok: kel, donorId: aliranDonor[i].id, donorUraian: nama(aliranDonor[i].id), penerimaId: aliranPenerima[j].id, penerimaUraian: nama(aliranPenerima[j].id), jumlah: m });
      sd -= m; sp -= m;
      if (sd === 0) { i++; sd = aliranDonor[i]?.jumlah ?? 0; }
      if (sp === 0) { j++; sp = aliranPenerima[j]?.jumlah ?? 0; }
    }
    rencana.dipindah += totalDonor;
    rencana.kekuranganSesudah += butuhTotal - totalSerap;
    for (const [id, st] of keadaan) {
      const b = rows.find((x) => x.id === id)!;
      if (st.vol === b.vol && st.harga === b.harga) continue;
      const jKe = jumlahMenjadi(b, st.vol, st.harga);
      rencana.perubahan.push({
        id, ro, kelompok: kel, uraian: b.uraian, peran: b.penggenap ? "penggenap" : serap.some((x) => x.b.id === id) ? "penerima" : "donor",
        volDari: b.vol, volKe: st.vol, hargaDari: b.harga, hargaKe: st.harga, jumlahDari: b.jumlah, jumlahKe: jKe,
      });
    }
    rencana.penggenapBaru.push(...penggenapBaru);
  }
  return rencana;
}

/** Pemeriksaan akhir rencana: selisih bersih tiap RO dan kelompok harus nol (penggenap baru dihitung). Mengembalikan pesan bila ada yang tidak nol. */
export function periksaRencana(r: RencanaGeseran): string[] {
  const per = new Map<string, number>();
  for (const p of r.perubahan) per.set(`${p.ro}|${p.kelompok}`, (per.get(`${p.ro}|${p.kelompok}`) ?? 0) + (p.jumlahKe - p.jumlahDari));
  for (const g of r.penggenapBaru) per.set(`${g.ro}|${g.kelompok}`, (per.get(`${g.ro}|${g.kelompok}`) ?? 0) + g.jumlah);
  return [...per].filter(([, v]) => v !== 0).map(([k, v]) => `RO/kelompok ${k} tidak seimbang (${v > 0 ? "+" : ""}${v}).`);
}

// ---------------------------------------------------------------- Terapkan RAB penuh (Revisi DIPA)
export type UbahRabPenuh = { id: number; ro: string; uraian: string; volDari: number; volKe: number; hargaDari: number; hargaKe: number; jumlahDari: number; jumlahKe: number };
export type RencanaRabPenuh = { ubah: UbahRabPenuh[]; dilewati: { id: number; uraian: string; alasan: string }[]; selisihTotal: number };

/**
 * Seluruh RAB masuk ke Menjadi: tiap item ber-RAB (belum selesai) yang jumlahnya berbeda dari POK Menjadi. Satu rincian bukan "sama dengan item":
 * volume dan harga rincian disalin (satuan harus sama dengan satuan item). Selain itu volume tetap dan harga satuan = RAB / volume bila tepat.
 */
export function rencanakanRabPenuh(baris: BarisMx[], rab: BarisRabKro[], rincian: Map<number, BarisRabRow[]>): RencanaRabPenuh {
  const perId = new Map(baris.map((b) => [b.id, b]));
  const hasil: RencanaRabPenuh = { ubah: [], dilewati: [], selisihTotal: 0 };
  for (const r of rab) {
    if (r.rab === null || r.status === "selesai" || r.status === "belum" || r.rab === r.pok) continue;
    const b = perId.get(r.id);
    if (!b || b.penggenap) continue;
    const st = { semula: { vol: n(b.vol_semula), harga: n(b.harga_semula), jumlah: n(b.jumlah_semula) } };
    const volDari = n(b.vol_menjadi), hargaDari = n(b.harga_menjadi), jumlahDari = n(b.jumlah_menjadi);
    const rows = r.itemId !== null ? (rincian.get(r.itemId) ?? []) : [];
    let volKe = volDari, hargaKe = hargaDari;
    if (rows.length === 1 && !rows[0].sama_dengan_item) {
      if ((rows[0].satuan ?? "").trim().toUpperCase() !== (b.sat_menjadi ?? "").trim().toUpperCase()) { hasil.dilewati.push({ id: r.id, uraian: r.uraian, alasan: `Satuan rincian RAB (${rows[0].satuan}) berbeda dari satuan item POK (${b.sat_menjadi}).` }); continue; }
      volKe = n(rows[0].volume); hargaKe = n(rows[0].harga_satuan);
    } else if (volDari > 0) {
      hargaKe = bulat2(r.rab / volDari);
    } else { hasil.dilewati.push({ id: r.id, uraian: r.uraian, alasan: "Volume Menjadi 0; isi volume lebih dulu." }); continue; }
    const jumlahKe = jumlahMenjadi(st, volKe, hargaKe);
    if (jumlahKe !== r.rab) { hasil.dilewati.push({ id: r.id, uraian: r.uraian, alasan: `RAB Rp ${r.rab} tidak dapat dinyatakan tepat dengan volume dan harga satuan item (hasil Rp ${jumlahKe}); ubah manual.` }); continue; }
    hasil.ubah.push({ id: r.id, ro: b.ro_kode, uraian: r.uraian, volDari, volKe, hargaDari, hargaKe, jumlahDari, jumlahKe });
    hasil.selisihTotal += jumlahKe - jumlahDari;
  }
  return hasil;
}
