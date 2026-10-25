// lib/keu/identifikasiHilir.ts
//
// (25 Okt 2026) Identifikasi survei -- bagian yang bergantung pada keadaan basis data atau dipakai modul hilir:
// status persetujuan, hak tombol, pembaruan periode H-15, pencocokan paket belanja dengan POK, serta turunan
// agenda/rekrutmen/evaluasi dari versi yang berlaku (identifikasi awal, lalu versi terupdate). Murni (tanpa React/DB).
// Tahap 27a: PPK dan Tata Usaha menyetujui PARALEL, KPA terakhir; revisi yang dikirim sesudah H-15 hanya perlu KPA.

import {
  HARI_H15, NAMA_AKUN, NAMA_PAKET, NAMA_TAHAP, TAHAP, adaPendataan, adaPeriode, daftarPeriode, hitungJadwal, jabatanHonorTim, jadwalValid, kebutuhan, peranTerpakai,
  ringkasPetugas, selisihHari, tambahHari, tanggalSesi, tglIndo,
  type Form, type Jadwal, type Kebutuhan, type PembaruanH15,
} from "@/lib/keu/identifikasi";

// ---------------------------------------------------------------------------------------------------------------------
// Status persetujuan
// ---------------------------------------------------------------------------------------------------------------------

export type StatusIdent = "draf" | "menunggu_ketua" | "menunggu_setuju" | "sah" | "revisi" | "dibatalkan";
export const LANGKAH_SETUJU = ["PPK", "Tata Usaha", "KPA"] as const;

/** Baris tampilan keu_v_ident. */
export type BarisIdent = {
  id: number; tahun: number; ro_kode: string; nama: string; status: StatusIdent; rev: boolean; ver: number; langkah: number;
  /** Persetujuan paralel pada pengiriman ini; `pasca_h15` = dikirim sesudah H-15 (hanya KPA). */
  ok_ppk: boolean; ok_tu: boolean; pasca_h15: boolean;
  form: unknown; form_sah: unknown | null; sah_at: string | null;
  alasan_revisi: string; catatan_kembali: string; kembali_oleh: string | null; kembali_at: string | null;
  upd: Record<string, UpdTercatat> | null;
  dibuat_oleh: number | null; diajukan_oleh: number | null; diajukan_at: string | null; disetujui_ketua_oleh: number | null; disetujui_ketua_at: string | null;
  dibuat_at: string; diubah_at: string; menunggu: string | null;
};
export type UpdTercatat = PembaruanH15 & { geser_mulai?: number; geser_selesai?: number; oleh?: number; at?: string };
export type RiwayatIdent = { id: number; ident_id: number; nama: string; ro_kode: string; aksi: string; dari: string | null; ke: string; ver: number; oleh_nama: string | null; catatan: string; waktu: string };
export type BarisPaket = { tahun: number; ro_kode: string; kunci_stabil: string; paket: string[]; oleh_nama: string | null; diubah_at: string };
/** Hak akun pada satu RO (hasil `keu_ident_hak`); hanya untuk menampilkan tombol -- yang memutuskan tetap basis data. */
export type HakIdent = { susun: boolean; ketua: boolean; ppk: boolean; tu: boolean; kpa: boolean; akun?: number | null };
export const HAK_KOSONG: HakIdent = { susun: false, ketua: false, ppk: false, tu: false, kpa: false, akun: null };

export type Nada = "abu" | "biru" | "kuning" | "hijau" | "merah";
export type LabelStatus = { teks: string; nada: Nada; ket: string };

/** Versi pertama = "identifikasi awal"; versi berikutnya = "terupdate". Yang dibaca modul hilir selalu versi terakhir; versi awal bahan evaluasi. */
export const namaVersi = (ver: number): string => (ver <= 1 ? "Identifikasi awal" : `Terupdate v${ver}`);

type FlagSetuju = { ok_ppk?: boolean; ok_tu?: boolean; pasca_h15?: boolean };
/** Siapa yang ditunggu pada status menunggu_setuju: PPK dan TU paralel, KPA terakhir (atau satu-satunya sesudah H-15). */
export function siapaMenunggu(b: FlagSetuju): string {
  if (b.pasca_h15) return "KPA (sesudah H-15)";
  if (!b.ok_ppk && !b.ok_tu) return "PPK dan Tata Usaha";
  if (!b.ok_ppk) return "PPK";
  if (!b.ok_tu) return "Tata Usaha";
  return "KPA";
}

/** Label status untuk lencana dan keterangan di atas formulir. */
export function labelStatus(b: Pick<BarisIdent, "status" | "ver" | "rev" | "langkah" | "kembali_oleh" | "catatan_kembali"> & FlagSetuju): LabelStatus {
  const tolak = b.kembali_oleh ? ` Dikembalikan oleh ${b.kembali_oleh}: ${b.catatan_kembali}` : "";
  switch (b.status) {
    case "draf":
      return { teks: b.kembali_oleh ? "Draf, dikembalikan" : "Draf", nada: b.kembali_oleh ? "merah" : "abu", ket: b.kembali_oleh ? tolak.trim() : "Belum dikirim. Modul lain belum memakai identifikasi ini." };
    case "menunggu_ketua":
      return { teks: `Menunggu ketua tim${b.rev ? " (revisi)" : ""}`, nada: "kuning", ket: `Terkunci. Modul lain ${b.ver > 0 ? `masih memakai ${namaVersi(b.ver).toLowerCase()}` : "belum memakai identifikasi ini"}.` };
    case "menunggu_setuju":
      return { teks: `Menunggu ${siapaMenunggu(b)}${b.rev ? " (revisi)" : ""}`, nada: "kuning", ket: `Terkunci selama persetujuan. Modul lain ${b.ver > 0 ? `masih memakai ${namaVersi(b.ver).toLowerCase()}` : "belum memakai identifikasi ini"}.${b.pasca_h15 ? " Dikirim sesudah H-15: hanya KPA yang menyetujui, dicatat untuk evaluasi." : ""}` };
    case "sah":
      return { teks: namaVersi(b.ver), nada: "hijau", ket: "Terkunci. Anggaran, Delego, evaluasi, dan rekrutmen membaca versi terakhir ini; versi sebelumnya hanya bahan evaluasi." };
    case "revisi":
      return { teks: `Revisi v${b.ver + 1} (draf)`, nada: b.kembali_oleh ? "merah" : "biru", ket: `Menyunting salinan; modul lain tetap memakai ${namaVersi(b.ver).toLowerCase()} sampai revisi disahkan.${tolak}` };
    default:
      return { teks: "Dibatalkan", nada: "abu", ket: "Tidak dipakai modul lain." };
  }
}

export type LangkahTampil = { no: number; nama: string; status: "Belum dikirim" | "Menunggu giliran" | "Giliran sekarang" | "Disetujui" | "Mengembalikan" | "Tidak diperlukan"; nada: Nada };

/** Tiga pihak penyetuju: PPK dan Tata Usaha paralel, lalu KPA terakhir (sesudah H-15: hanya KPA) untuk diagram. */
export function langkahTampil(b: Pick<BarisIdent, "status" | "langkah" | "kembali_oleh"> & FlagSetuju): LangkahTampil[] {
  return LANGKAH_SETUJU.map((nama, i) => {
    let status: LangkahTampil["status"] = "Belum dikirim"; let nada: Nada = "abu";
    const kpa = i === 2;
    const sudah = kpa ? false : i === 0 ? !!b.ok_ppk : !!b.ok_tu;
    if (b.status === "sah") { status = "Disetujui"; nada = "hijau"; }
    else if (b.status === "menunggu_setuju") {
      if (b.pasca_h15 && !kpa) { status = "Tidak diperlukan"; nada = "abu"; }
      else if (sudah) { status = "Disetujui"; nada = "hijau"; }
      else if (!kpa || b.pasca_h15 || (b.ok_ppk && b.ok_tu)) { status = "Giliran sekarang"; nada = "kuning"; }
      else status = "Menunggu giliran";
    }
    else if (b.status === "menunggu_ketua") status = "Menunggu giliran";
    else if ((b.status === "draf" || b.status === "revisi") && b.kembali_oleh === nama) { status = "Mengembalikan"; nada = "merah"; }
    return { no: i + 1, nama, status, nada };
  });
}

export type AksiIdent = "simpan" | "kirim" | "setuju_ketua" | "setujui" | "kembalikan" | "tarik" | "ajukan_revisi" | "batal_revisi" | "batal";

/**
 * Tombol yang layak ditampilkan bagi akun ini. Cerminan aturan fungsi `keu_ident_aksi`; basis data tetap yang memutuskan.
 * `akunId` dipakai untuk aturan "pengirim tidak menyetujui kirimannya sendiri sebagai ketua" dan "tarik oleh pengirim".
 */
export function aksiTersedia(b: Pick<BarisIdent, "status" | "ver" | "langkah" | "diajukan_oleh" | "dibuat_oleh"> & FlagSetuju, hak: HakIdent, akunId: number | null): AksiIdent[] {
  const a: AksiIdent[] = [];
  // mencerminkan SQL keu_ident_giliran: sesudah H-15 hanya KPA; selain itu PPK atau TU (yang belum), lalu KPA bila keduanya sudah
  const giliran = b.status === "menunggu_setuju" && (b.pasca_h15 ? hak.kpa : (hak.ppk && !b.ok_ppk) || (hak.tu && !b.ok_tu) || (hak.kpa && !!b.ok_ppk && !!b.ok_tu));
  if ((b.status === "draf" || b.status === "revisi") && hak.susun) {
    a.push("simpan", "kirim");
    if (b.status === "revisi") a.push("batal_revisi");
    if (b.status === "draf" && b.ver === 0) a.push("batal");
  }
  if (b.status === "menunggu_ketua" && hak.ketua && (akunId === null || akunId !== b.diajukan_oleh)) a.push("setuju_ketua");
  if (giliran) a.push("setujui");
  if ((b.status === "menunggu_ketua" && hak.ketua) || giliran) a.push("kembalikan");
  if ((b.status === "menunggu_ketua" || b.status === "menunggu_setuju") && b.langkah === 0 && (akunId === b.diajukan_oleh || hak.ppk || hak.ketua)) a.push("tarik");
  if (b.status === "sah" && hak.susun) a.push("ajukan_revisi");
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pembaruan periode H-15
// ---------------------------------------------------------------------------------------------------------------------

export type StatusH15 = "Menunggu identifikasi awal disahkan" | "Sudah ditegaskan" | "Jatuh tempo H-15, tegaskan tanggal" | "Terlambat" | "Belum waktunya";

/**
 * Status satu periode. `adaSah` = identifikasi pernah disahkan (ver >= 1). H-15 = 15 hari sebelum mulai pendataan menurut versi berlaku.
 * Pada H-15 ketua tim menegaskan tanggal (Perkiraan menjadi Fix); sesudah H-15 versi terakhir dianggap final, perubahan butuh KPA.
 */
export function statusH15(o: { adaSah: boolean; hariIni: string; asliMulai: string; sudahDiperbarui: boolean }): { status: StatusH15; nada: Nada } {
  if (!o.adaSah) return { status: "Menunggu identifikasi awal disahkan", nada: "abu" };
  if (o.sudahDiperbarui) return { status: "Sudah ditegaskan", nada: "hijau" };
  const h15 = tambahHari(o.asliMulai, -HARI_H15);
  if (o.hariIni >= h15 && o.hariIni <= o.asliMulai) return { status: "Jatuh tempo H-15, tegaskan tanggal", nada: "kuning" };
  if (o.hariIni > o.asliMulai) return { status: "Terlambat", nada: "merah" };
  return { status: "Belum waktunya", nada: "abu" };
}

export type HasilGeser = { geserMulai: number; geserSelesai: number; salah: boolean; lewat: boolean; pesan: string };
/** Memeriksa penegasan terhadap jendela versi berlaku: tanggal TIDAK boleh bergeser; perubahan tanggal lewat revisi (sama dengan SQL zc). */
export function periksaGeser(asli: { mulai: string; selesai: string }, baru: { mulai: string; selesai: string }): HasilGeser {
  const salah = !baru.mulai || !baru.selesai || baru.selesai < baru.mulai || !asli.mulai || !asli.selesai;
  const geserMulai = !salah ? selisihHari(baru.mulai, asli.mulai) : 0;
  const geserSelesai = !salah ? selisihHari(baru.selesai, asli.selesai) : 0;
  const lewat = geserMulai !== 0 || geserSelesai !== 0;
  const pesan = salah
    ? "Tanggal belum lengkap atau selesai sebelum mulai."
    : lewat ? `Tanggal bergeser ${geserMulai} hari (mulai) dan ${geserSelesai} hari (selesai). Perubahan tanggal lewat revisi identifikasi (disetujui PPK dan Tata Usaha, lalu KPA; sesudah H-15 cukup KPA).` : "";
  return { geserMulai, geserSelesai, salah, lewat, pesan };
}

export type BarisH15 = { periode: string; asli: Jadwal; h15: string; upd: UpdTercatat | null; efektif: { mulai: string; selesai: string }; status: StatusH15; nada: Nada };

/** Baris H-15 untuk setiap periode pada versi berlaku. Kosong bila tanpa periode atau tanpa pendataan. */
export function barisH15(formSah: Form, tahun: number, upd: Record<string, UpdTercatat> | null | undefined, hariIni: string): BarisH15[] {
  if (!adaPeriode(formSah) || !adaPendataan(formSah)) return [];
  return daftarPeriode(formSah).map((P) => {
    const asli = hitungJadwal(formSah, P, tahun).pendataan ?? { mulai: "", selesai: "", perk: false };
    const u = upd?.[P] ?? null;
    const s = statusH15({ adaSah: true, hariIni, asliMulai: asli.mulai, sudahDiperbarui: !!u });
    return { periode: P, asli, h15: tambahHari(asli.mulai, -15), upd: u, efektif: u ? { mulai: u.mulai, selesai: u.selesai } : { mulai: asli.mulai, selesai: asli.selesai }, status: s.status, nada: s.nada };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Turunan hilir dari versi SAH
// ---------------------------------------------------------------------------------------------------------------------

export type BarisTurunan = { t: string; kelas: "fix" | "perk" | "" };

/** Agenda satu periode: jadwal tiap tahap, sesi, rapat, penugasan, konsultasi, cetak buku, dan penegasan H-15. */
export function agendaPeriode(f: Form, tahun: number, P: string, upd?: UpdTercatat | null): BarisTurunan[] {
  const ag: BarisTurunan[] = [];
  const add = (t: string, kelas: BarisTurunan["kelas"] = "") => ag.push({ t, kelas });
  const pend = adaPendataan(f);
  const valid = jadwalValid(f, P, tahun, upd).valid;
  const jadwal: BarisTurunan[] = [];
  for (const [k, nama] of TAHAP) {
    const x = valid[k];
    if (x) jadwal.push({ t: `${nama}: ${tglIndo(x.mulai)} s.d. ${tglIndo(x.selesai)}${x.perk ? " (perkiraan)" : " (fix)"}`, kelas: x.perk ? "perk" : "fix" });
  }
  if (!f.berbagi) {
    for (const [id, nama] of [["briefing", "Briefing"], ["pelatihan", "Pelatihan"]] as const) {
      const s = f.sesi[id];
      if (!s.on) continue;
      const t = tanggalSesi(f, id, P, tahun);
      add(`${nama}${s.bentuk ? ` ${s.bentuk.toLowerCase()}` : ""}: ${tglIndo(t.mulai)} s.d. ${tglIndo(t.selesai)}`);
      if (s.pengajar) add(`Penugasan pengajar atau narasumber eksternal untuk ${nama.toLowerCase()}`);
    }
  } else {
    add(`Pelatihan dan briefing mengikuti ${f.rujukan || "survei lain"} (tidak ada agenda sendiri)`);
  }
  for (const [id, nama] of [["persiapan", "persiapan"], ["pelaksanaan", "pelaksanaan"], ["evaluasi", "evaluasi"]] as const) {
    const r = f.rapat[id];
    const on = id === "evaluasi" ? true : r.on;
    if (on && r.media.length > 0) add(`Rapat ${nama} (${r.media.map((m) => m.toLowerCase()).join(", ")})`);
  }
  for (const t of peranTerpakai(f)) {
    const adaOrg = t.p.status === "Organik" || t.p.status === "Organik dan mitra";
    const adaMit = t.p.status === "Mitra" || t.p.status === "Organik dan mitra";
    const hitung = [adaOrg ? `organik ${t.p.nOrg}` : "", adaMit ? `mitra ${t.p.nMit}` : ""].filter(Boolean).join(", ");
    add(`Penugasan ${t.nama} (${t.p.status.toLowerCase()}; ${hitung}${t.p.perk ? ", perkiraan" : ", fix"}): translok ${t.translok ? "ya" : "tidak"}, honor ${t.honor ? "ya" : "tidak"}`, t.p.perk ? "perk" : "fix");
  }
  if (pend) add(`Pendataan lapangan (${f.instrumen})`);
  const jt = jabatanHonorTim(f);
  if (jt.length > 0) add(`Honor tim pelaksana: ${jt.join(", ").toLowerCase()}`);
  if (f.konsultasi) add(`Konsultasi teknis: ${f.cara.toLowerCase()}`);
  if (f.rekon) add("Rekonsiliasi data");
  if (f.adaDiseminasi && f.cetakBuku) add(`Cetak buku publikasi${f.cetakKab ? " (di kabupaten, belanja persediaan)" : " (di luar kabupaten)"}`);
  if (pend && adaPeriode(f)) {
    const asli = hitungJadwal(f, P, tahun).pendataan;
    if (asli?.mulai) {
      add(`Penegasan tanggal periode H-15 (${P}): ${tglIndo(tambahHari(asli.mulai, -HARI_H15))}, oleh ketua tim atau operator`, upd || !asli.perk ? "fix" : "perk");
      if (upd) add(`Pendataan ${P} sesudah penegasan: ${tglIndo(upd.mulai)} s.d. ${tglIndo(upd.selesai)}`, "fix");
    }
  }
  return [...jadwal, ...ag];
}

/** Rencana rekrutmen mitra. */
export function rekrutmenDari(f: Form): BarisTurunan[] {
  const rp = ringkasPetugas(f);
  const out: BarisTurunan[] = [];
  let perk = false;
  for (const t of peranTerpakai(f)) {
    const adaMit = t.p.status === "Mitra" || t.p.status === "Organik dan mitra";
    if (!adaMit) continue;
    if (t.p.perk) perk = true;
    out.push({ t: `Rekrut mitra ${t.nama}: ${t.p.nMit} orang${t.p.perk ? " (perkiraan)" : " (fix)"}`, kelas: t.p.perk ? "perk" : "fix" });
    if (t.honor) out.push({ t: `Kontrak SPK dan honor mitra ${t.nama}`, kelas: "" });
  }
  if (out.length > 0) out.unshift({ t: `Kebutuhan mitra seluruh peran: ${rp.totMit} orang${perk ? " (memuat perkiraan)" : " (fix)"}`, kelas: perk ? "perk" : "fix" });
  else out.push({ t: adaPendataan(f) ? "Tidak ada peran berstatus mitra: rekrutmen tidak aktif." : "Tanpa pendataan: rekrutmen tidak aktif.", kelas: "" });
  return out;
}

/** Bahan evaluasi. */
export function evaluasiDari(f: Form): string[] {
  const out: string[] = [];
  const m = f.rapat.evaluasi.media;
  out.push(`Rapat evaluasi (wajib)${m.length ? `: ${m.map((x) => x.toLowerCase()).join(", ")}` : ""}`);
  if (adaPendataan(f)) {
    out.push("Umpan balik petugas lapangan");
    const rp = ringkasPetugas(f);
    if (rp.mitraPeran.length > 0) out.push(`Penilaian mitra: ${rp.mitraPeran.join(", ")}`);
  }
  out.push("Rencana perbaikan (selalu)");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pencocokan kebutuhan dengan POK
// ---------------------------------------------------------------------------------------------------------------------

/** Baris POK berlaku suatu RO beserta paket belanja yang dipetakan (tabel keu_ident_paket). */
export type BarisPok = { kunci: string; akun: string; uraian: string; paket: string[] };
export type StatusAkun = "ada" | "paket_belum" | "hilang";
export type AnggaranAkun = {
  akun: string; nama: string; alasan: string; paket: string; jalur: string; status: StatusAkun; label: string; ket: string;
  baris: string; saran: string; aksi: string; perlu: boolean;
  /** Alasan kebutuhan per butir: teks tanpa huruf bagian, dan huruf bagian formulir (A-F) tempat jawabannya. */
  butirAlasan: { teks: string; bagian: string }[];
  /** Baris POK pada akun ini, satu per butir. */
  barisList: string[];
};

/** Paket yang boleh dipilih untuk baris POK berakun `akun` (awalan 6 angka harus sama). */
export const paketUntukAkun = (akun: string): string[] => Object.keys(NAMA_PAKET).filter((p) => p.slice(0, 6) === akun);

/**
 * Mencocokkan kebutuhan dengan POK RO dalam tiga lapis: (1) akun ada pada POK, (2) paket sudah dipetakan pada salah satu barisnya,
 * (3) semua paket yang dibutuhkan (atau salah satu, untuk translok) terpetakan. Hanya paket yang awalannya sama dengan akun barisnya yang dihitung.
 */
export function cocokkanPok(need: Kebutuhan[], pok: BarisPok[]): AnggaranAkun[] {
  const mapped = new Set<string>();
  for (const r of pok) for (const p of r.paket) if (p.slice(0, 6) === r.akun) mapped.add(p);
  const urut: string[] = []; const peta: Record<string, { items: Kebutuhan[]; paket: string[]; jalur: string[] }> = {};
  for (const n of need) {
    if (!peta[n.akun]) { peta[n.akun] = { items: [], paket: [], jalur: [] }; urut.push(n.akun); }
    const a = peta[n.akun];
    a.items.push(n);
    for (const p of n.paket) if (!a.paket.includes(p)) a.paket.push(p);
    if (!a.jalur.includes(n.jalur)) a.jalur.push(n.jalur);
  }
  return urut.map((k) => {
    const a = peta[k];
    const baris = pok.filter((r) => r.akun === k);
    const kurang: string[] = [];
    for (const n of a.items) {
      const ok = n.atau ? n.paket.some((p) => mapped.has(p)) : n.paket.every((p) => mapped.has(p));
      if (ok) continue;
      const t = n.atau ? n.paket.join(" atau ") : n.paket.filter((p) => !mapped.has(p)).join(", ");
      if (!kurang.includes(t)) kurang.push(t);
    }
    const tanpaPaket = baris.filter((r) => r.paket.length === 0);
    let status: StatusAkun = "ada"; let label = "Ada dan terpetakan"; let ket = "Semua paket yang dibutuhkan sudah dipetakan pada baris POK."; let aksi = ""; let saran = "";
    if (baris.length === 0) {
      status = "hilang"; label = "Belum ada pada POK RO";
      ket = `Tidak ada baris POK dengan akun ${k}. Tambahkan lewat revisi POK atau ubah jawaban.`; aksi = "Buka kertas kerja RO";
    } else if (kurang.length > 0) {
      status = "paket_belum"; label = "Akun ada, paket belum dipetakan";
      ket = `Ada baris POK pada akun ini, tetapi belum ada yang dipetakan ke: ${kurang.join("; ")}.`; aksi = "Petakan baris POK RO";
      if (tanpaPaket.length > 0) saran = `Saran sistem: baris "${tanpaPaket[0].uraian}" belum dipetakan. Bila sesuai, petakan ke ${kurang[0].split(" ")[0].replace(",", "")}. Konfirmasi tetap oleh admin RO.`;
    }
    return {
      akun: k, nama: NAMA_AKUN[k] ?? "",
      alasan: a.items.map((n) => `${n.teks} (${n.sumber})`).join("; "),
      paket: a.paket.map((p) => p + (NAMA_PAKET[p] ? ` ${NAMA_PAKET[p]}` : "")).join(", "),
      jalur: a.jalur.join(" dan "),
      status, label, ket,
      baris: baris.map((r) => `"${r.uraian}"${r.paket.length ? ` → ${r.paket.join(", ")}` : " (belum dipetakan)"}`).join("; "),
      saran, aksi, perlu: status !== "ada",
      butirAlasan: a.items.map((n) => ({ teks: n.teks, bagian: n.sumber })),
      barisList: baris.map((r) => `${r.uraian}${r.paket.length ? ` → ${r.paket.join(", ")}` : " (belum dipetakan)"}`),
    };
  });
}

/** Ringkasan kebutuhan versi sah untuk modul hilir: akun, mitra, dan jumlah butir perkiraan. */
export function ringkasHilir(f: Form) {
  const need = kebutuhan(f);
  const akun = Array.from(new Set(need.map((n) => n.akun))).sort();
  return { need, akun, mitra: ringkasPetugas(f).totMit, namaTahap: NAMA_TAHAP };
}
