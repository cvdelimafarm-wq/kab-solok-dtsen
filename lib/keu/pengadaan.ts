// lib/keu/pengadaan.ts
//
// (26 Okt 2026, tahap 34) Draf pengadaan: barang dan jasa yang perlu diadakan menurut identifikasi lanjutan (paket meeting hotel, konsumsi pelatihan dan rapat,
// perlengkapan pelatihan, pulsa, penggandaan dokumen PAPI, cetak buku). Berkas ini MURNI (tanpa React/DB). Susunannya sejalan dengan `kebutuhan()` pada identifikasi.ts
// (jalur "Pengadaan"), tetapi memakai data Fix dari lanjutan: kelas, tanggal, peserta, tempat, dan paket. Nilai rupiah hanya muncul bila tarif lembar kebijakan sudah ada
// (tarif = batas tertinggi); selain itu item tetap tampil dengan daftar hal yang masih perlu dilengkapi.
//
// Prinsip: draf hanya MEMBACA dan menyarankan. Tidak ada yang tertulis; metode dan nilai pengadaan ditentukan PPK atau pejabat pengadaan (cek aturan), bukan di sini.

import { daftarPeriode, hitungJadwal, selisihHari, tempatHotel, type Form, type PembaruanH15 } from "./identifikasi";
import { tglValid, type BarisRincian, type IsiLanjutan, type Kelas } from "./lanjutan";

export type JenisPengadaan = "Paket meeting" | "Konsumsi" | "Perlengkapan" | "Pulsa" | "Penggandaan" | "Cetak buku";
export type KelompokPengadaan = "Pelatihan" | "Rapat" | "Pendataan" | "Diseminasi";

export type ItemPengadaan = {
  kunci: string;
  /** Kode TETAP butir (tidak bergeser bila susunan berubah): dipakai untuk menyimpan status pengadaan. Hanya a-z, 0-9, titik dua, garis bawah, strip; maksimal 80. */
  id: string;
  kelompok: KelompokPengadaan;
  jenis: JenisPengadaan;
  uraian: string;
  akun: string;
  volume: number | null;
  satuan: string;
  tarif: number | null;
  /** volume x tarif bila keduanya ada; selain itu null. */
  nilai: number | null;
  /** Tempat (jenis dan nama tempat) bila relevan. */
  tempat: string;
  /** Paket (fullday atau fullboard) bila relevan. */
  paket: string;
  /** Hari pertama dan terakhir barang atau jasa dibutuhkan; null bila belum ada tanggal. */
  butuhMulai: string | null;
  butuhSelesai: string | null;
  /** Bersumber dari isian bertanda Perkiraan. */
  perkiraan: boolean;
  /** Hal yang masih perlu dilengkapi sebelum diajukan (tidak memblokir). */
  perlu: string[];
  /** Catatan tarif atau dasar. */
  catatan: string[];
};

const tgl = (t: string): string | null => (tglValid(t) ? t : null);
const ada = (s: string): boolean => s.replace(/^ +| +$/g, "") !== "";
const awalTerkecil = (a: (string | null)[]): string | null => { const x = a.filter((t): t is string => t !== null).sort(); return x.length ? x[0] : null; };
const akhirTerbesar = (a: (string | null)[]): string | null => { const x = a.filter((t): t is string => t !== null).sort(); return x.length ? x[x.length - 1] : null; };

/** Kode tetap yang aman bagi basis data: huruf kecil, angka, titik dua, garis bawah, strip. */
export const kodeTetap = (...bagian: string[]): string => bagian.map((b) => b.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")).filter((b) => b !== "").join(":").slice(0, 80);

const namaKelas = (k: Kelas): string => k.nama || (k.sesi === "briefing" ? "Briefing" : "Pelatihan");

function pesertaKelas(isi: IsiLanjutan, k: Kelas): number {
  let n = 0;
  for (const kode of k.untuk) {
    const x = isi.peran[kode];
    n += x?.on ? x.nOrg + x.nMit : isi.petugas.filter((p) => p.peran === kode).length;
  }
  return n;
}
function mitraKelas(isi: IsiLanjutan, k: Kelas): number {
  let n = 0;
  for (const kode of k.untuk) {
    const x = isi.peran[kode];
    n += x?.on ? x.nMit : isi.petugas.filter((p) => p.peran === kode && p.status === "Mitra").length;
  }
  return n;
}

const cariRincian = (rincian: BarisRincian[], akun: string, uraian: string): BarisRincian | undefined => rincian.find((r) => r.akun === akun && r.uraian === uraian);

/**
 * Menyusun draf pengadaan. `pendataan` = jendela pendataan efektif per periode (jadwalPendataan); `upd` = pembaruan H-15 per periode (untuk jadwal diseminasi).
 * `rincian` = hasil rincianBiaya (untuk tarif dan nilai bila lembar kebijakan sudah memuatnya).
 */
export function susunPengadaan(
  isi: IsiLanjutan, form: Form, tahun: number, upd: Record<string, PembaruanH15> | null | undefined,
  pendataan: { mulai: string; selesai: string }[], rincian: BarisRincian[],
): ItemPengadaan[] {
  const out: ItemPengadaan[] = [];
  const adaMitra = Object.values(isi.peran).some((x) => x.on && x.nMit > 0) || isi.petugas.some((p) => p.status === "Mitra");
  const mulaiData = awalTerkecil(pendataan.map((p) => tgl(p.mulai)));
  const selesaiData = akhirTerbesar(pendataan.map((p) => tgl(p.selesai)));
  let adaPulsaPeserta = false;
  let n = 0;
  const tambah = (b: Omit<ItemPengadaan, "kunci" | "nilai"> & { nilai?: number | null }): void => {
    n += 1;
    const nilai = b.nilai !== undefined ? b.nilai : b.volume !== null && b.tarif !== null ? b.volume * b.tarif : null;
    let id = b.id; let c = 2;
    while (out.some((o) => o.id === id)) { id = `${b.id.slice(0, 74)}-${c}`; c += 1; } // dua kelas tanpa kode tidak boleh berbagi satu kode
    out.push({ ...b, id, kunci: `pg${n}`, nilai });
  };

  // ----- kelas pelatihan dan briefing
  for (const k of isi.kelas) {
    const nama = namaKelas(k);
    const sf = form.sesi[k.sesi];
    const mulai = tgl(k.mulai); const selesai = tgl(k.selesai);
    const peserta = pesertaKelas(isi, k);
    const luring = k.metode === "Luring" || k.metode === "Hybrid";
    const daring = k.metode === "Daring" || k.metode === "Hybrid";
    const tanggalKurang = mulai === null || selesai === null ? ["tanggal kelas belum lengkap"] : [];
    const tempatTeks = `${k.tempat}${ada(k.lokasi) ? ` — ${k.lokasi.replace(/^ +| +$/g, "")}` : ""}`;

    if (luring && adaMitra) {
      const oh = peserta * k.oh;
      if (tempatHotel(k.tempat)) {
        const akun = k.tempat === "Hotel luar kota" ? "524119" : "524114";
        const uraian = `${nama}: paket ${k.paket || "fullday atau fullboard"} di ${k.tempat.toLowerCase()}`;
        const r = cariRincian(rincian, akun, uraian);
        const perlu = [...tanggalKurang];
        if (k.paket === "") perlu.push("paket (fullday atau fullboard) belum dipilih");
        if (!ada(k.lokasi)) perlu.push("nama hotel belum diisi");
        if (peserta === 0) perlu.push("jumlah peserta belum diketahui");
        if (k.oh === 0) perlu.push("jumlah OH belum diisi");
        tambah({
          id: kodeTetap(k.id, "paket"), kelompok: "Pelatihan", jenis: "Paket meeting", uraian, akun, volume: oh || null, satuan: "orang-hari", tarif: r?.tarif ?? null, tempat: tempatTeks, paket: k.paket,
          butuhMulai: mulai, butuhSelesai: selesai, perkiraan: !k.fix, perlu, catatan: r && r.catatan ? [r.catatan] : [],
        });
      } else {
        const akun = "521211";
        const uraian = `${nama}: konsumsi tanpa paket`;
        const r = cariRincian(rincian, akun, uraian);
        const perlu = [...tanggalKurang];
        if (peserta === 0) perlu.push("jumlah peserta belum diketahui");
        if (k.oh === 0) perlu.push("jumlah OH belum diisi");
        tambah({
          id: kodeTetap(k.id, "konsumsi"), kelompok: "Pelatihan", jenis: "Konsumsi", uraian, akun, volume: oh || null, satuan: "orang-hari", tarif: r?.tarif ?? null, tempat: k.tempat ? tempatTeks : "", paket: "",
          butuhMulai: mulai, butuhSelesai: selesai, perkiraan: !k.fix, perlu, catatan: r && r.catatan ? [r.catatan] : [],
        });
      }
    }
    if (k.sesi === "pelatihan" && luring && sf?.perl) {
      const perlu = [...tanggalKurang];
      if (peserta === 0) perlu.push("jumlah peserta belum diketahui");
      tambah({
        id: kodeTetap(k.id, "perlengkapan"), kelompok: "Pelatihan", jenis: "Perlengkapan", uraian: `${nama}: perlengkapan pelatihan`, akun: "521211", volume: peserta || null, satuan: "paket", tarif: null, tempat: k.tempat ? tempatTeks : "", paket: "",
        butuhMulai: mulai, butuhSelesai: selesai, perkiraan: !k.fix, perlu: [...perlu, "jenis dan harga perlengkapan belum diidentifikasi"], catatan: [],
      });
    }
    if (daring && sf?.pulsa && adaMitra) {
      adaPulsaPeserta = true;
      const uraian = `${nama}: pulsa peserta (mitra)`;
      const r = cariRincian(rincian, "521211", uraian);
      const vol = mitraKelas(isi, k);
      const perlu = [...tanggalKurang];
      if (vol === 0) perlu.push("jumlah peserta mitra belum diketahui");
      tambah({
        id: kodeTetap(k.id, "pulsa"), kelompok: "Pelatihan", jenis: "Pulsa", uraian, akun: "521211", volume: vol || null, satuan: "orang", tarif: r?.tarif ?? null, tempat: "", paket: "",
        butuhMulai: mulai, butuhSelesai: selesai, perkiraan: !k.fix, perlu, catatan: r && r.catatan ? [r.catatan] : [],
      });
    }
  }

  // ----- konsumsi rapat tatap muka
  for (const [id, nama] of [["persiapan", "persiapan"], ["pelaksanaan", "pelaksanaan"], ["evaluasi", "evaluasi"]] as const) {
    const r = form.rapat[id];
    const on = id === "evaluasi" ? true : r.on;
    const dibayar = id === "persiapan" ? r.mitra && adaMitra : true;
    if (!(on && dibayar && r.media.includes("Tatap muka"))) continue;
    const uraian = `Konsumsi rapat ${nama} tatap muka`;
    const rr = cariRincian(rincian, "521211", uraian);
    tambah({
      id: kodeTetap("rapat", id), kelompok: "Rapat", jenis: "Konsumsi", uraian, akun: "521211", volume: null, satuan: "orang", tarif: rr?.tarif ?? null, tempat: "", paket: "",
      butuhMulai: null, butuhSelesai: null, perkiraan: false, perlu: ["tanggal rapat belum ditetapkan", "jumlah peserta rapat belum diidentifikasi"], catatan: rr && rr.catatan ? [rr.catatan] : [],
    });
  }

  // ----- instrumen
  if (form.instrumen === "PAPI" && form.cetakPapi) {
    tambah({
      id: "papi", kelompok: "Pendataan", jenis: "Penggandaan", uraian: "Penggandaan dokumen PAPI di kabupaten", akun: "521211", volume: null, satuan: "eksemplar", tarif: null, tempat: "", paket: "",
      butuhMulai: mulaiData, butuhSelesai: mulaiData, perkiraan: false,
      perlu: [...(mulaiData === null ? ["jadwal pendataan belum lengkap"] : []), "jumlah eksemplar dan harga per lembar belum diidentifikasi"], catatan: ["Dibutuhkan paling lambat pada hari pertama pendataan."],
    });
  }
  if (form.instrumen === "FASIH" && !adaPulsaPeserta && form.pulsaLap) {
    const petugas = isi.petugas.length > 0 ? isi.petugas.length : Object.values(isi.peran).reduce((s, x) => s + (x.on ? x.nOrg + x.nMit : 0), 0);
    tambah({
      id: "pulsa-lapangan", kelompok: "Pendataan", jenis: "Pulsa", uraian: "Pulsa petugas lapangan (FASIH)", akun: "521211", volume: petugas || null, satuan: "orang", tarif: null, tempat: "", paket: "",
      butuhMulai: mulaiData, butuhSelesai: selesaiData, perkiraan: false,
      perlu: [...(mulaiData === null ? ["jadwal pendataan belum lengkap"] : []), ...(petugas === 0 ? ["jumlah petugas belum diketahui"] : []), "tarif pulsa petugas lapangan belum ada pada lembar kebijakan"], catatan: [],
    });
  }

  // ----- cetak buku publikasi
  if (form.adaDiseminasi && form.cetakBuku && form.cetakKab) {
    const jadwalDis = daftarPeriode(form).map((P) => hitungJadwal(form, P, tahun, upd?.[P] ?? null).diseminasi);
    const mulaiDis = awalTerkecil(jadwalDis.map((j) => tgl(j?.mulai ?? "")));
    const selesaiDis = akhirTerbesar(jadwalDis.map((j) => tgl(j?.selesai ?? "")));
    tambah({
      id: "cetak-buku", kelompok: "Diseminasi", jenis: "Cetak buku", uraian: "Cetak buku publikasi di kabupaten (belanja persediaan)", akun: "521811", volume: null, satuan: "eksemplar", tarif: null, tempat: "", paket: "",
      butuhMulai: mulaiDis, butuhSelesai: selesaiDis, perkiraan: true,
      perlu: [...(mulaiDis === null ? ["jadwal diseminasi belum lengkap"] : []), "oplah dan harga cetak per eksemplar belum diidentifikasi"], catatan: [],
    });
  }
  return out;
}

export type RingkasPengadaan = {
  jumlah: number;
  siap: number;
  perluDilengkapi: number;
  perkiraan: number;
  denganNilai: number;
  tanpaNilai: number;
  total: number;
  perAkun: { akun: string; jumlah: number; nilai: number }[];
};

export function ringkasPengadaan(daftar: ItemPengadaan[]): RingkasPengadaan {
  let total = 0; let dengan = 0;
  const per = new Map<string, { jumlah: number; nilai: number }>();
  for (const it of daftar) {
    const x = per.get(it.akun) ?? { jumlah: 0, nilai: 0 };
    x.jumlah += 1;
    if (it.nilai !== null) { x.nilai += it.nilai; total += it.nilai; dengan += 1; }
    per.set(it.akun, x);
  }
  return {
    jumlah: daftar.length, siap: daftar.filter((d) => d.perlu.length === 0).length, perluDilengkapi: daftar.filter((d) => d.perlu.length > 0).length,
    perkiraan: daftar.filter((d) => d.perkiraan).length, denganNilai: dengan, tanpaNilai: daftar.length - dengan, total,
    perAkun: [...per.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([akun, v]) => ({ akun, ...v })),
  };
}

/** Sisa hari sampai barang atau jasa dibutuhkan (negatif = sudah lewat); null bila tanpa tanggal. */
export function sisaHariButuh(it: Pick<ItemPengadaan, "butuhMulai">, hariIni: string): number | null {
  return it.butuhMulai && tglValid(it.butuhMulai) ? selisihHari(it.butuhMulai, hariIni) : null;
}

/** Urutan menurut kapan dibutuhkan (yang tanpa tanggal di akhir), lalu urutan susunan. */
export function urutkanPengadaan(daftar: ItemPengadaan[]): ItemPengadaan[] {
  return [...daftar].sort((a, b) => (a.butuhMulai ?? "9999-12-31").localeCompare(b.butuhMulai ?? "9999-12-31") || Number(a.kunci.slice(2)) - Number(b.kunci.slice(2)));
}

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const tglIndo = (d: string | null): string => (d ? d.split("-").reverse().join("/") : "—");
const rentang = (a: string | null, b: string | null): string => (a && b && a !== b ? `${tglIndo(a)} s.d. ${tglIndo(b)}` : tglIndo(a));

/** Teks polos draf pengadaan untuk disalin (mis. ke permintaan kepada PPK atau pejabat pengadaan). */
export function teksDraf(daftar: ItemPengadaan[], judul: string, ro: string): string {
  const baris: string[] = [`Draf kebutuhan pengadaan: ${judul}`, `RO ${ro}`, "Perkiraan dari identifikasi lanjutan; metode dan nilai pengadaan ditentukan PPK atau pejabat pengadaan.", ""];
  urutkanPengadaan(daftar).forEach((it, i) => {
    baris.push(`${i + 1}. ${it.uraian}`);
    baris.push(`   Akun ${it.akun} · ${it.volume === null ? "volume belum diketahui" : `${it.volume.toLocaleString("id-ID")} ${it.satuan}`} · dibutuhkan ${rentang(it.butuhMulai, it.butuhSelesai)}${it.tempat ? ` · ${it.tempat}` : ""}${it.paket ? ` · paket ${it.paket}` : ""}`);
    baris.push(`   Tarif ${it.tarif === null ? "belum ada" : rp(it.tarif)}${it.nilai === null ? "" : ` · perkiraan nilai ${rp(it.nilai)}`}${it.perkiraan ? " · masih Perkiraan" : ""}`);
    if (it.perlu.length > 0) baris.push(`   Perlu dilengkapi: ${it.perlu.join("; ")}`);
  });
  if (daftar.length === 0) baris.push("(tidak ada kebutuhan pengadaan)");
  return baris.join("\n");
}
