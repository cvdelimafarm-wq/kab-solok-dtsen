// lib/keu/struktur.ts
//
// (24 Okt 2026, tahap 16) Papan 16 mockup: Menambah Program, Kegiatan, KRO, RO, Komponen, Subkomponen, Akun, dan Item sebagai BARIS USULAN.
// Logika murni (tanpa React/jaringan): rantai induk, pilihan induk, pemeriksaan isian, jalur, status, aksi yang tersedia, argumen fungsi basis data.
// Pemeriksa di sini hanya untuk memberi tahu pengguna lebih dulu; yang memutuskan tetap fungsi basis data keu_struktur_usul/aksi/... (hak dan aturan ditegakkan di sana).

import type { AliasSatuan, SatuanMaster, WaktuMaster } from "./master";

export type LevelStruktur = {
  kode: string; no: number; nama: string; istilah_sakti: string; contoh: string; format_ket: string; format_re: string | null;
  induk_kode: string | null; pengusul: "pusat" | "ppk" | "tim" | string; tampil: boolean;
};
export type JalurMaster = {
  id: number; level_kode: string; sumber: string; khusus: boolean; jalur_kode: string; nama: string; pemutus: string; dasar: string;
  kepastian: string; tenggat_kode: string | null; syarat: string[] | null;
};
export type NodeJalur = { node_id: number; tingkat: string; kode: string; nama: string; jalur: string };
export type UsulanStruktur = {
  id: number; kode_sementara: string; level: string; level_nama: string; level_no: number; induk: string | null; induk_usulan_id: number | null;
  ro_kode: string | null; kode: string | null; uraian: string; volume: number | string | null; satuan: string | null; harga: number | string | null; jumlah: number | string | null;
  sumber: string; khusus: boolean; jalur_kode: string; jalur_nama: string | null; jalur_pemutus: string | null; kepastian: string; tenggat_kode: string | null;
  status: string; boleh_komitmen: boolean; menunggu: string | null; catatan: string; dibuat_oleh: number | null; nomor_dokumen: string | null;
  kode_resmi: string | null; cara_padan: string | null; alasan_akhir: string | null; nomor_item: string | null; diusulkan_at?: string | null;
};
export type RiwayatStruktur = { id: number; usulan_id: number; kode_sementara: string; level: string; level_nama: string; aksi: string; dari: string | null; ke: string; oleh_nama: string | null; catatan: string; waktu: string };
export type RingkasStruktur = { level: string; status: string; n: number | string };

// ---------------------------------------------------------------- level dan sumber dana
export const SUMBER_DANA: { kode: string; nama: string }[] = [
  { kode: "dalam", nama: "Digeser dari dalam RO dan jenis belanja yang sama" },
  { kode: "lintas", nama: "Digeser dari jenis belanja lain atau RO lain" },
  { kode: "tambahan", nama: "Tambahan pagu dari pusat" },
];

export const levelTampil = (l: LevelStruktur[]): LevelStruktur[] => l.filter((x) => x.tampil).sort((a, b) => a.no - b.no);
export const nomorLevel = (l: LevelStruktur[], kode: string): number => levelTampil(l).findIndex((x) => x.kode === kode) + 1;
export const namaLevelPendek = (n: string): string => n.replace(" (Klasifikasi Rincian Output)", "").replace(" (Rincian Output)", "").replace(" (detail)", "");
export const KETERANGAN_PENGUSUL: Record<string, string> = { pusat: "Pusat; PPK mencatat usulan", ppk: "PPK", tim: "Ketua tim; admin RO sebagai draf" };
export const kewenanganPengusul = (pengusul: string): "str_ppk" | "str_tim" => (pengusul === "tim" ? "str_tim" : "str_ppk");

// ---------------------------------------------------------------- rantai induk
/** Tingkat yang dipilih berurutan untuk menentukan induk. Induk adalah tingkat TERAKHIR rantai; tingkat di depannya hanya penyaring (jalur POK memuat jalur lengkapnya). */
export const RANTAI_INDUK: Record<string, string[]> = {
  program: [], kegiatan: ["program"], kro: ["kegiatan"], ro: ["kro"], komponen: ["ro"],
  subkomp: ["ro", "komponen"], akun: ["ro", "komponen"], item: ["ro", "komponen", "akun"],
};
/** Induk langsung tiap tingkat (untuk menyaring pilihan). Program->Kegiatan tidak terhubung lewat jalur POK, jadi tidak disaring. */
const INDUK_LANGSUNG: Record<string, string | null> = { program: null, kegiatan: null, kro: "kegiatan", ro: "kro", komponen: "ro", subkomp: "komponen", akun: "komponen", item: "akun" };
export const NAMA_TINGKAT: Record<string, string> = { program: "Program", kegiatan: "Kegiatan", kro: "KRO", ro: "RO", komponen: "Komponen", subkomp: "Subkomponen", akun: "Akun", item: "Item" };
export const rantaiInduk = (level: string): string[] => RANTAI_INDUK[level] ?? [];

const STATUS_AKHIR = ["dibatalkan", "ditolak_pusat"];
export const usulanBerjalan = (u: UsulanStruktur): boolean => !STATUS_AKHIR.includes(u.status);

export type PilihInduk = { jenis: "jalur" | "usulan"; nilai: string };
export type OpsiInduk = { nilai: string; label: string; usulan: boolean };
/** Nilai pilihan disimpan sebagai teks: "j:<jalur POK>" atau "u:<id usulan>". */
export const nilaiJalur = (jalur: string): string => `j:${jalur}`;
export const nilaiUsulan = (id: number): string => `u:${id}`;
export function uraiPilihan(v: string | undefined | null): PilihInduk | null {
  if (!v) return null;
  if (v.startsWith("j:") && v.length > 2) return { jenis: "jalur", nilai: v.slice(2) };
  if (v.startsWith("u:") && /^\d+$/.test(v.slice(2))) return { jenis: "usulan", nilai: v.slice(2) };
  return null;
}

/** Pilihan untuk satu tingkat dalam rantai, disaring menurut pilihan tingkat di atasnya (bila ada di rantai). */
export function opsiInduk(tingkat: string, pilihan: Record<string, string>, node: NodeJalur[], usulan: UsulanStruktur[]): OpsiInduk[] {
  const induk = INDUK_LANGSUNG[tingkat];
  const ind = induk ? uraiPilihan(pilihan[induk]) : null;
  const hasil: OpsiInduk[] = [];
  const ada = new Set<string>();
  for (const n of node) {
    if (n.tingkat !== tingkat) continue;
    if (ind) {
      if (ind.jenis !== "jalur") continue; // induk masih usulan: belum ada simpul resmi di bawahnya
      const awalan = tingkat === "kro" || tingkat === "ro" ? `${ind.nilai}.` : `${ind.nilai}/`;
      if (tingkat === "kro" || tingkat === "ro" || tingkat === "komponen" || tingkat === "subkomp" || tingkat === "akun") {
        if (!n.jalur.startsWith(awalan)) continue;
      }
    }
    if (ada.has(n.jalur)) continue;
    ada.add(n.jalur);
    hasil.push({ nilai: nilaiJalur(n.jalur), label: `${n.jalur} · ${n.nama}`, usulan: false });
  }
  for (const u of usulan) {
    if (u.level !== tingkat || !usulanBerjalan(u)) continue;
    if (ind) {
      if (ind.jenis === "jalur" && !(u.induk_usulan_id === null && u.induk === ind.nilai)) continue;
      if (ind.jenis === "usulan" && String(u.induk_usulan_id) !== ind.nilai) continue;
    }
    hasil.push({ nilai: nilaiUsulan(u.id), label: `${u.kode_sementara} · ${u.kode ?? u.uraian} (usulan, ${STATUS_USULAN[u.status]?.nama ?? u.status})`, usulan: true });
  }
  return hasil.sort((a, b) => (a.usulan === b.usulan ? a.label.localeCompare(b.label) : a.usulan ? 1 : -1));
}

/** Pilihan yang masih sah setelah pilihan di atasnya berubah (yang tidak lagi ada di daftar dibuang). */
export function rapikanPilihan(level: string, pilihan: Record<string, string>, node: NodeJalur[], usulan: UsulanStruktur[]): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const t of rantaiInduk(level)) {
    const v = pilihan[t];
    // begitu satu tingkat gugur, tingkat di bawahnya ikut gugur (pilihannya hanya sah di bawah induk yang lama)
    if (!v || !opsiInduk(t, hasil, node, usulan).some((o) => o.nilai === v)) break;
    hasil[t] = v;
  }
  return hasil;
}

export type IndukTerpilih = { lengkap: boolean; induk: string | null; indukUsulan: number | null; teks: string; roKode: string | null };
/** Induk (tingkat terakhir rantai) beserta kode RO untuk memeriksa hak ketua tim/admin RO. */
export function indukTerpilih(level: string, pilihan: Record<string, string>, node: NodeJalur[], usulan: UsulanStruktur[]): IndukTerpilih {
  const rantai = rantaiInduk(level);
  if (rantai.length === 0) return { lengkap: true, induk: null, indukUsulan: null, teks: "(tingkat tertinggi)", roKode: null };
  const akhir = rantai[rantai.length - 1];
  const p = uraiPilihan(pilihan[akhir]);
  if (!p) return { lengkap: false, induk: null, indukUsulan: null, teks: "belum lengkap", roKode: null };
  let roKode: string | null = null;
  const ro = uraiPilihan(pilihan.ro);
  if (rantai.includes("ro") && ro) {
    if (ro.jenis === "jalur") roKode = ro.nilai;
    else roKode = usulan.find((u) => String(u.id) === ro.nilai)?.kode_sementara ?? null;
  }
  if (p.jenis === "jalur") {
    const n = node.find((x) => x.tingkat === akhir && x.jalur === p.nilai);
    return { lengkap: true, induk: p.nilai, indukUsulan: null, teks: `${NAMA_TINGKAT[akhir]} ${p.nilai}${n ? ` (${n.nama})` : ""}`, roKode };
  }
  const u = usulan.find((x) => String(x.id) === p.nilai);
  return { lengkap: !!u, induk: null, indukUsulan: u?.id ?? null, teks: u ? `${NAMA_TINGKAT[akhir]} usulan ${u.kode_sementara}` : "belum lengkap", roKode };
}

// ---------------------------------------------------------------- jalur
/** Sama dengan fungsi basis data keu_jalur: khusus hanya berlaku untuk Komponen bersumber bukan tambahan. */
export function cariJalur(jalur: JalurMaster[], level: string, sumber: string, khusus: boolean): JalurMaster | null {
  const k = khusus && level === "komponen" && sumber !== "tambahan";
  return jalur.find((j) => j.level_kode === level && j.sumber === sumber && j.khusus === k) ?? null;
}
export const teksKepastian = (k: string): string => (k === "catatan" ? "Sesuai catatan PMK" : "Dugaan, tanyakan Kanwil");
export const warnaKepastian = (k: string): "hijau" | "kuning" => (k === "catatan" ? "hijau" : "kuning");
export const warnaJalur = (kode: string): "hijau" | "kuning" | "merah" => (kode === "pok" ? "hijau" : kode === "djpb" ? "kuning" : "merah");
export function teksTenggat(waktu: WaktuMaster[], kode: string | null): string {
  if (!kode) return "tidak ada tenggat khusus";
  return waktu.find((w) => w.kode === kode)?.nilai ?? "belum diatur";
}
export type BarisMatriks = { no: number; kode: string; nama: string; pengusul: string; jalur: string; pemutus: string; kepastian: string };
export function matriksJalur(level: LevelStruktur[], jalur: JalurMaster[]): BarisMatriks[] {
  return levelTampil(level).map((l, i) => {
    const j = cariJalur(jalur, l.kode, "dalam", false);
    return { no: i + 1, kode: l.kode, nama: l.nama, pengusul: KETERANGAN_PENGUSUL[l.pengusul] ?? l.pengusul, jalur: j?.nama ?? "-", pemutus: j?.pemutus ?? "-", kepastian: j?.kepastian ?? "dugaan" };
  });
}

// ---------------------------------------------------------------- isian
export type Isian = { kode: string; uraian: string; volume: string; satuan: string; harga: string; sumber: string; khusus: boolean; catatan: string };
export const isianKosong = (): Isian => ({ kode: "", uraian: "", volume: "", satuan: "", harga: "", sumber: "dalam", khusus: false, catatan: "" });
export const butuhVolume = (level: string): boolean => level === "ro" || level === "item";
export const butuhHarga = (level: string): boolean => level === "item";
export const butuhKode = (level: string): boolean => level !== "item";
export const bolehKhusus = (level: string): boolean => level === "komponen";

const norm = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();
/** Kode baku satuan (kode itu sendiri atau alias), hanya bila ada dan aktif di Master satuan. Meniru keu_satuan_baku + pemeriksaan aktif. */
export function satuanBaku(teks: string, satuan: SatuanMaster[], alias: AliasSatuan[]): string | null {
  const t = norm(teks);
  if (!t) return null;
  const langsung = satuan.find((s) => norm(s.kode) === t);
  const lewat = langsung ? null : alias.find((a) => norm(a.alias) === t);
  const kode = langsung?.kode ?? lewat?.satuan_kode ?? null;
  if (!kode) return null;
  return satuan.some((s) => s.kode === kode && s.aktif) ? kode : null;
}
export const angkaBersih = (t: string): number => {
  const s = t.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};
export const fmtRp = (n: number): string => new Intl.NumberFormat("id-ID").format(Math.round(n));

export type KonteksCek = { level: LevelStruktur; induk: IndukTerpilih; isian: Isian; node: NodeJalur[]; usulan: UsulanStruktur[]; akun: { kode: string; nama: string; aktif: boolean; pola_kode?: string }[]; satuan: SatuanMaster[]; alias: AliasSatuan[] };
export type Butir = { ok: boolean; t: string };

/** Kode jalur resmi anak (meniru keu_struktur_jalur_anak). */
export function jalurAnak(level: string, induk: string | null, kode: string): string {
  if (level === "program" || level === "kegiatan") return kode;
  if (level === "kro" || level === "ro") return `${induk ?? ""}.${kode}`;
  return `${induk ?? ""}/${kode}`;
}

/** Apakah kode/uraian sudah ada di POK berlaku atau pada usulan lain yang masih berjalan di induk yang sama. */
export function cariKembar(c: KonteksCek): string | null {
  const { level, induk, isian, node, usulan } = c;
  const kode = norm(isian.kode);
  const ura = isian.uraian.trim().toLowerCase();
  if (level.kode !== "item" && kode && induk.lengkap) {
    if (induk.induk !== null || level.kode === "program") {
      const j = jalurAnak(level.kode, induk.induk, kode);
      if (node.some((n) => n.tingkat === level.kode && n.jalur === j)) return `${level.nama} ${j} sudah ada di POK berlaku.`;
    }
  }
  for (const u of usulan) {
    if (u.level !== level.kode || !usulanBerjalan(u)) continue;
    const samaInduk = induk.indukUsulan !== null ? u.induk_usulan_id === induk.indukUsulan : induk.induk !== null && u.induk_usulan_id === null && u.induk === induk.induk;
    if (level.kode === "program") { if (norm(u.kode) === kode && kode) return `Program ${kode} sudah diusulkan (${u.kode_sementara}).`; continue; }
    if (!samaInduk) continue;
    if (level.kode === "item" ? (u.uraian ?? "").trim().toLowerCase() === ura && ura !== "" : norm(u.kode) === kode && kode !== "") return `Sudah ada usulan ${u.kode_sementara} dengan ${level.kode === "item" ? "uraian" : "kode"} yang sama di induk ini.`;
  }
  return null;
}

/** Daftar butir "Pemeriksaan isian" (meniru keu_struktur_periksa, ditambah induk dan kembar). Lulus semua = siap disimpan. */
export function cekIsian(c: KonteksCek): Butir[] {
  const { level, induk, isian, akun, satuan, alias } = c;
  const hasil: Butir[] = [];
  const tambah = (ok: boolean, t: string) => hasil.push({ ok, t });
  const indukNama = level.induk_kode ? NAMA_TINGKAT[level.induk_kode] ?? level.induk_kode : "-";
  tambah(level.kode === "program" || induk.lengkap, induk.lengkap && level.kode !== "program" ? `Induk dipilih: ${induk.teks}.` : level.kode === "program" ? "Program tidak punya induk." : `Pilih induk lebih dulu (${indukNama}).`);
  const kode = norm(isian.kode);
  if (butuhKode(level.kode)) {
    let sah = false;
    try { sah = !!level.format_re && new RegExp(level.format_re).test(kode); } catch { sah = false; }
    tambah(sah, sah ? "Format kode sah." : `Format kode: ${level.format_ket}.`);
  }
  const ura = isian.uraian.trim();
  tambah(ura.length >= 3, ura.length >= 3 ? "Uraian terisi." : "Isi uraian (minimal 3 huruf).");
  if (level.kode === "akun") {
    const m = akun.find((a) => a.kode === kode && a.aktif);
    tambah(!!m, m ? `Akun ada di Master akun: ${m.nama}${m.pola_kode ? ` (pola dokumen ${m.pola_kode})` : ""}.` : "Akun belum ada di Master akun. Admin Aplikasi atau PPK menambahkannya dulu, lengkap dengan pola dokumen.");
  }
  if (butuhVolume(level.kode)) {
    const v = angkaBersih(isian.volume);
    tambah(v > 0, v > 0 ? "Volume terisi." : "Volume harus lebih dari nol.");
    const b = satuanBaku(isian.satuan, satuan, alias);
    tambah(!!b, b ? `Satuan ${b} ada di Master satuan.` : "Satuan belum ada di Master satuan; tambahkan dulu (Master data, Satuan).");
    if (butuhHarga(level.kode)) {
      const h = angkaBersih(isian.harga);
      tambah(h > 0, h > 0 ? (v > 0 ? `Jumlah = ${fmtRp(v * h)} (volume x harga).` : "Harga satuan terisi.") : "Harga satuan harus lebih dari nol.");
    }
  }
  const kembar = cariKembar(c);
  tambah(!kembar, kembar ?? (butuhKode(level.kode) ? "Kode belum dipakai di induk ini." : "Uraian belum dipakai di induk ini."));
  return hasil;
}
export const semuaLulus = (b: Butir[]): boolean => b.every((x) => x.ok);

/** Argumen keu_struktur_usul. Hanya satu dari p_induk / p_induk_usulan yang diisi. */
export function argsUsul(level: string, induk: IndukTerpilih, i: Isian): Record<string, unknown> {
  const a: Record<string, unknown> = {
    p_level: level,
    p_uraian: i.uraian.trim(),
    p_sumber: i.sumber,
    p_khusus: bolehKhusus(level) ? i.khusus : false,
    p_catatan: i.catatan.trim(),
  };
  if (induk.induk !== null) a.p_induk = induk.induk;
  if (induk.indukUsulan !== null) a.p_induk_usulan = induk.indukUsulan;
  if (butuhKode(level)) a.p_kode = norm(i.kode);
  if (butuhVolume(level)) { a.p_volume = angkaBersih(i.volume); a.p_satuan = i.satuan.trim(); }
  if (butuhHarga(level)) a.p_harga = angkaBersih(i.harga);
  return a;
}
/** Argumen keu_struktur_ubah (hanya yang berlaku untuk level itu). */
export function argsUbah(u: UsulanStruktur, i: Isian): Record<string, unknown> {
  const a: Record<string, unknown> = { p_id: u.id, p_uraian: i.uraian.trim(), p_sumber: i.sumber, p_catatan: i.catatan.trim() };
  if (butuhKode(u.level)) a.p_kode = norm(i.kode);
  if (butuhVolume(u.level)) { a.p_volume = angkaBersih(i.volume); a.p_satuan = i.satuan.trim(); }
  if (butuhHarga(u.level)) a.p_harga = angkaBersih(i.harga);
  return a;
}
export function isianDariUsulan(u: UsulanStruktur): Isian {
  const t = (v: number | string | null) => (v === null || v === undefined ? "" : String(v));
  return { kode: u.kode ?? "", uraian: u.uraian, volume: t(u.volume), satuan: u.satuan ?? "", harga: t(u.harga), sumber: u.sumber, khusus: u.khusus, catatan: u.catatan };
}

// ---------------------------------------------------------------- status dan aksi
export const STATUS_USULAN: Record<string, { nama: string; warna: "abu" | "kuning" | "biru" | "hijau" | "merah" }> = {
  draf: { nama: "Draf", warna: "abu" },
  dikembalikan: { nama: "Dikembalikan untuk diperbaiki", warna: "merah" },
  menunggu_ketua: { nama: "Menunggu ketua tim", warna: "kuning" },
  menunggu_ppk: { nama: "Menunggu PPK", warna: "kuning" },
  sah: { nama: "Sah, menunggu dinyatakan diusulkan", warna: "biru" },
  diusulkan: { nama: "Diusulkan, menunggu POK resmi", warna: "biru" },
  perlu_dipadankan: { nama: "Perlu dipadankan", warna: "merah" },
  aktif: { nama: "Aktif", warna: "hijau" },
  dibatalkan: { nama: "Dibatalkan", warna: "abu" },
  ditolak_pusat: { nama: "Ditolak pusat", warna: "abu" },
};
export const statusProses = (s: string): boolean => !["aktif", "dibatalkan", "ditolak_pusat"].includes(s);
export function ringkasStatus(rows: { status: string }[]): { total: number; aktif: number; proses: number; akhir: number } {
  let aktif = 0, proses = 0, akhir = 0;
  for (const r of rows) { if (r.status === "aktif") aktif++; else if (statusProses(r.status)) proses++; else akhir++; }
  return { total: rows.length, aktif, proses, akhir };
}

export type Hak = { ppk: boolean | null; strPpk: boolean | null; perRo: Record<string, { rab: boolean | null; setuju: boolean | null; draf: boolean | null }> };
export const hakKosong = (): Hak => ({ ppk: null, strPpk: null, perRo: {} });
export type AksiUsulan = {
  kode: "ajukan" | "ubah" | "setuju_ketua" | "sahkan" | "kembalikan" | "usulkan" | "tolak_pusat" | "padankan" | "batal";
  nama: string; utama: boolean; butuhAlasan: boolean; butuhNomor: boolean; boleh: boolean; ket: string;
};
const ADA = (v: boolean | null | undefined) => v === true;

/** Aksi yang relevan menurut status; `boleh` hanya untuk menampilkan tombol (yang memutuskan tetap basis data). */
export function aksiTersedia(u: UsulanStruktur, level: LevelStruktur | undefined, hak: Hak): AksiUsulan[] {
  const tim = level?.pengusul === "tim";
  const h = (u.ro_kode ? hak.perRo[u.ro_kode] : undefined) ?? { rab: null, setuju: null, draf: null };
  const a = (kode: AksiUsulan["kode"], nama: string, utama: boolean, boleh: boolean, ket: string, butuhAlasan = false, butuhNomor = false): AksiUsulan => ({ kode, nama, utama, butuhAlasan, butuhNomor, boleh, ket });
  const hasil: AksiUsulan[] = [];
  const bolehAjukan = tim ? ADA(h.rab) || ADA(hak.ppk) || ADA(h.draf) : ADA(hak.strPpk);
  const ketAjukan = tim ? "Pelaku yang berwenang: ketua tim, admin RO, atau PPK untuk RO ini." : "Level ini diajukan PPK.";
  switch (u.status) {
    case "draf":
    case "dikembalikan":
      hasil.push(a("ajukan", tim && !ADA(h.rab) && !ADA(hak.ppk) ? "Ajukan ke ketua tim" : "Ajukan", true, bolehAjukan, bolehAjukan ? "" : ketAjukan));
      hasil.push(a("ubah", "Ubah isian", false, bolehAjukan || ADA(hak.ppk), ""));
      hasil.push(a("batal", "Batalkan", false, true, "", true));
      break;
    case "menunggu_ketua":
      hasil.push(a("setuju_ketua", "Setujui (ketua tim)", true, ADA(h.setuju), ADA(h.setuju) ? "" : "Pelaku yang berwenang: ketua tim RO ini."));
      hasil.push(a("kembalikan", "Kembalikan", false, ADA(h.setuju), "", true));
      hasil.push(a("batal", "Batalkan", false, true, "", true));
      break;
    case "menunggu_ppk":
      hasil.push(a("sahkan", u.jalur_kode === "pok" ? "Sahkan (Revisi POK)" : "Sahkan sebagai usulan", true, ADA(hak.ppk), ADA(hak.ppk) ? "" : "Pelaku yang berwenang: PPK."));
      hasil.push(a("kembalikan", "Kembalikan", false, ADA(hak.ppk), "", true));
      hasil.push(a("batal", "Batalkan", false, true, "", true));
      break;
    case "sah":
      hasil.push(a("usulkan", u.jalur_kode === "pok" ? "Nyatakan diusulkan (Revisi POK)" : "Teruskan sebagai usulan DIPA", true, ADA(hak.ppk), ADA(hak.ppk) ? "" : "Hanya PPK yang menyatakan usulan diteruskan.", false, u.jalur_kode !== "pok"));
      hasil.push(a("batal", "Batalkan", false, true, "", true));
      break;
    case "diusulkan":
      hasil.push(a("tolak_pusat", "Catat ditolak pusat", false, ADA(hak.ppk), ADA(hak.ppk) ? "" : "Hanya PPK yang mencatat penolakan pusat.", true));
      break;
    case "perlu_dipadankan":
      hasil.push(a("padankan", "Padankan secara manual", true, ADA(hak.ppk), ADA(hak.ppk) ? "" : "Hanya PPK yang memadankan."));
      hasil.push(a("tolak_pusat", "Catat ditolak pusat", false, ADA(hak.ppk), "", true));
      break;
    default:
      break;
  }
  return hasil;
}
export function keteranganStatus(u: UsulanStruktur): string {
  switch (u.status) {
    case "aktif": return `Dokumen kelengkapan, RAB, dan skor tersedia untuk baris ini.${u.level === "ro" ? " PPK menetapkan ketua tim dan tim di Peran dan Akses." : ""}`;
    case "diusulkan": return "Setelah POK resmi diunggah dan diterima, PPK mencocokkan struktur; kode yang sama langsung aktif.";
    case "perlu_dipadankan": return "Kode resmi dari POK berbeda dari kode usulan. Pilih padanan secara manual, jangan ditebak sistem; baris belum boleh dipakai untuk komitmen atau SPJ.";
    case "dibatalkan": case "ditolak_pusat": return u.alasan_akhir ? `Alasan: ${u.alasan_akhir}` : "";
    case "dikembalikan": return u.catatan ? `Catatan pengembalian: ${u.catatan}` : "";
    default: return u.menunggu ? `Menunggu: ${u.menunggu}.` : "";
  }
}
export function periksaAlasan(t: string): string[] { return t.trim().length < 5 ? ["Alasan minimal 5 huruf."] : []; }
export function periksaNomorDokumen(u: UsulanStruktur, nomor: string): string[] {
  const wajib = u.jalur_kode === "dja" || u.jalur_kode === "djpb";
  return wajib && nomor.trim().length < 3 ? [`Nomor surat usulan wajib diisi untuk jalur ${u.jalur_kode.toUpperCase()}.`] : [];
}
export function teksJumlah(u: UsulanStruktur): string {
  if (u.level === "item") return ` Volume ${u.volume} ${u.satuan ?? ""} x Rp ${fmtRp(Number(u.harga))} = Rp ${fmtRp(Number(u.jumlah))}.`;
  if (u.level === "ro") return ` Volume RO ${u.volume} ${u.satuan ?? ""}.`;
  return "";
}

// ---------------------------------------------------------------- pemadanan manual
export type KandidatPadan = { nilai: string; label: string };
/** Simpul resmi sejenis di induk resmi yang sama dan belum dipasangkan dengan usulan aktif lain. */
export function kandidatSimpul(u: UsulanStruktur, indukResmi: string | null, node: NodeJalur[], usulan: UsulanStruktur[]): KandidatPadan[] {
  if (u.level === "item") return [];
  const dipakai = new Set(usulan.filter((x) => x.level === u.level && x.status === "aktif" && x.kode_resmi).map((x) => x.kode_resmi as string));
  const awalan = u.level === "program" || u.level === "kegiatan" ? "" : u.level === "kro" || u.level === "ro" ? `${indukResmi ?? ""}.` : `${indukResmi ?? ""}/`;
  return node
    .filter((n) => n.tingkat === u.level && !dipakai.has(n.jalur) && (u.level === "program" || u.level === "kegiatan" ? true : n.jalur.startsWith(awalan)))
    .map((n) => ({ nilai: n.jalur, label: `${n.jalur} · ${n.nama}` }))
    .sort((a, b) => a.nilai.localeCompare(b.nilai));
}
export type DetailPok = { kunci_stabil: string; uraian: string; volume: number | string | null; satuan: string | null; harga_satuan: number | string | null; jumlah: number | string | null; nomor_item: string | null };
export function kandidatItem(detail: DetailPok[], usulan: UsulanStruktur[]): KandidatPadan[] {
  const dipakai = new Set(usulan.filter((x) => x.level === "item" && x.status === "aktif" && x.kode_resmi).map((x) => x.kode_resmi as string));
  return detail.filter((d) => !dipakai.has(d.kunci_stabil)).map((d) => ({ nilai: d.kunci_stabil, label: `${d.nomor_item ? `#${d.nomor_item} ` : ""}${d.uraian} · ${d.volume ?? ""} ${d.satuan ?? ""} x Rp ${fmtRp(Number(d.harga_satuan))}` }));
}

// ---------------------------------------------------------------- riwayat
export const NAMA_AKSI: Record<string, string> = {
  buat: "membuat draf", ubah: "mengubah isian", ajukan: "mengajukan", setuju_ketua: "menyetujui sebagai ketua tim", sahkan: "mengesahkan", kembalikan: "mengembalikan",
  batal: "membatalkan", usulkan: "menyatakan diusulkan", tolak_pusat: "mencatat ditolak pusat", cocok: "mencocokkan dengan POK resmi (kode sama)", perlu_padan: "menandai perlu dipadankan", padankan: "memadankan secara manual",
};
export function teksRiwayat(r: RiwayatStruktur): string {
  const aksi = NAMA_AKSI[r.aksi] ?? r.aksi;
  const ket = r.catatan ? ` (${r.catatan})` : "";
  return `${r.oleh_nama ?? "Sistem"} ${aksi} ${r.kode_sementara}${r.dari !== r.ke ? `: ${STATUS_USULAN[r.dari ?? ""]?.nama ?? r.dari ?? "baru"} menjadi ${STATUS_USULAN[r.ke]?.nama ?? r.ke}` : ""}${ket}.`;
}
