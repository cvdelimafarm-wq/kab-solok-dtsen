// lib/keu/revisi.ts
//
// (24 Okt 2026) Logika murni layar PPK dan keputusan kekurangan: jadwal revisi, pengesahan, tambahan pagu resmi, keputusan penuhi/tunda/tolak.
// Mencerminkan aturan fungsi basis data (e_revisi.sql, j_kekurangan.sql); yang memutuskan tetap basis data, ini untuk mencegah kiriman sia-sia
// dan menampilkan hanya tombol yang masuk akal.

import { kodeRoSah } from "@/lib/keu/ro";

export type AksiJadwal = "buka" | "tutup" | "terapkan" | "sah" | "lewati" | "pulihkan";

export const LABEL_STATUS_JADWAL: Record<string, string> = {
  terjadwal: "Terjadwal", dibuka: "Dibuka", terkumpul: "Ditutup (terkumpul)", diterapkan: "Diterapkan", sah: "Sah", dilewati: "Dilewati",
};
export const WARNA_STATUS_JADWAL: Record<string, string> = {
  terjadwal: "bg-[#EEF2F7] text-[#44546F]", dibuka: "bg-[#E6F6EC] text-[#14653A]", terkumpul: "bg-[#FFF4D6] text-[#8A6200]",
  diterapkan: "bg-[#E3EEFF] text-[#1F5FD1]", sah: "bg-[#D9F0E3] text-[#0F5A32]", dilewati: "bg-[#F1E9E9] text-[#7A5252]",
};
export const LABEL_JENIS_JADWAL: Record<string, string> = {
  pok: "Revisi POK", administrasi: "Revisi administrasi", dipa_djpb: "Revisi DIPA (DJPb)", dipa_dja: "Revisi DIPA (DJA)",
};
export const LABEL_STATUS_USULAN: Record<string, string> = {
  draf: "Draf", menunggu_ketua: "Menunggu ketua tim", menunggu_ppk: "Menunggu PPK", disetujui: "Disetujui", dikembalikan: "Dikembalikan",
};

export type PilihanAksi = { aksi: AksiJadwal; label: string; perluDokumen: boolean; berbahaya: boolean };

/** Aksi jadwal yang masuk akal untuk status ini. `tutup`/`hariIni` berbentuk YYYY-MM-DD (pulihkan hanya selama jendela belum lewat). */
export function aksiJadwalTersedia(status: string, tutup: string, hariIni: string): PilihanAksi[] {
  const p = (aksi: AksiJadwal, label: string, perluDokumen = false, berbahaya = false): PilihanAksi => ({ aksi, label, perluDokumen, berbahaya });
  switch (status) {
    case "terjadwal": return [p("buka", "Buka jendela usulan"), p("lewati", "Lewati bulan ini", false, true)];
    case "dibuka": return [p("tutup", "Tutup dan kumpulkan usulan"), p("lewati", "Lewati", false, true)];
    case "terkumpul": return [p("terapkan", "Tandai sudah diterapkan di SAKTI")];
    case "diterapkan": return [p("sah", "Nyatakan sah", true)];
    case "dilewati": return tutup >= hariIni ? [p("pulihkan", "Pulihkan jadwal")] : [];
    default: return [];
  }
}

const RE_TGL = /^\d{4}-\d{2}-\d{2}$/;
export function tanggalSah(s: string): boolean {
  if (!RE_TGL.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function periksaSah(nomor: string, tanggal: string): string[] {
  const g: string[] = [];
  if (nomor.trim().length < 3) g.push("Nomor dokumen dasar (mis. nomor DIPA/POK hasil revisi) wajib diisi, minimal 3 karakter.");
  if (!tanggalSah(tanggal)) g.push("Tanggal dokumen dasar tidak valid.");
  return g;
}

export function argsJadwalAksi(jadwal: number, aksi: AksiJadwal, dok?: { nomor: string; tanggal: string }): Record<string, unknown> {
  return aksi === "sah" && dok ? { p_jadwal: jadwal, p_aksi: aksi, p_nomor: dok.nomor.trim(), p_tanggal: dok.tanggal } : { p_jadwal: jadwal, p_aksi: aksi };
}

// ---------- tambahan pagu resmi (PPK) ----------
export type IsianTambahan = { ro: string; jumlah: string; jalur: "" | "dja" | "djpb"; nomor: string; tanggal: string; jadwal: string; catatan: string };
export const tambahanKosong = (): IsianTambahan => ({ ro: "", jumlah: "", jalur: "", nomor: "", tanggal: "", jadwal: "", catatan: "" });

export function bacaBulat(s: string): number | null {
  const t = s.replace(/[.\s]/g, "").replace(/^Rp/i, "");
  if (!/^\d{1,15}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export function periksaTambahan(v: IsianTambahan, jadwal: { id: number; jenis: string }[] = []): string[] {
  const g: string[] = [];
  if (!kodeRoSah(v.ro.trim())) g.push("Kode RO tidak sah (contoh 2906.BMA.005).");
  const n = bacaBulat(v.jumlah);
  if (n === null || n <= 0) g.push("Jumlah harus bilangan bulat rupiah lebih dari nol.");
  if (v.jalur !== "dja" && v.jalur !== "djpb") g.push("Pilih jalur: DJA atau DJPb.");
  if (v.nomor.trim().length < 3) g.push("Nomor dokumen revisi wajib diisi.");
  if (!tanggalSah(v.tanggal)) g.push("Tanggal dokumen tidak valid.");
  if (v.jadwal) {
    const j = jadwal.find((x) => String(x.id) === v.jadwal);
    if (!j) g.push("Jadwal yang dipilih tidak ditemukan.");
    else if (v.jalur && j.jenis !== `dipa_${v.jalur}`) g.push("Jenis jadwal tidak sesuai jalur.");
  }
  return g;
}

export function argsTambahan(v: IsianTambahan): Record<string, unknown> {
  return {
    p_ro: v.ro.trim(), p_jumlah: bacaBulat(v.jumlah), p_jalur: v.jalur, p_nomor: v.nomor.trim(), p_tanggal: v.tanggal,
    ...(v.jadwal ? { p_jadwal: Number(v.jadwal) } : {}), p_catatan: v.catatan.trim(),
  };
}

// ---------- keputusan kekurangan (ketua tim) ----------
export type Putusan = "penuhi" | "tunda" | "tolak";
export type Keputusan = { id: number; keputusan: Putusan; alasan: string };
export const LABEL_PUTUSAN: Record<Putusan, string> = { penuhi: "Penuhi", tunda: "Tunda", tolak: "Tolak" };

/** Awal isian dari saran sistem (prioritas lalu tanggal catat); catatan tanpa saran ditunda. */
export function awalKeputusan(terbukaIds: number[], saran: { kekurangan_id: number | string; saran: string }[]): Keputusan[] {
  const peta = new Map(saran.map((s) => [Number(s.kekurangan_id), s.saran]));
  return terbukaIds.map((id) => {
    const s = peta.get(id);
    return { id, keputusan: s === "penuhi" || s === "tolak" ? s : "tunda", alasan: "" };
  });
}

export function periksaKeputusan(daftar: Keputusan[], jumlahPerId: Map<number, number>, tambahan: number): { galat: string[]; dipenuhi: number; sisa: number } {
  const galat: string[] = [];
  let dipenuhi = 0;
  for (const k of daftar) {
    if (k.keputusan === "tolak" && k.alasan.trim().length < 5) galat.push(`Catatan ${k.id}: alasan penolakan wajib (minimal 5 huruf).`);
    if (k.keputusan === "penuhi") dipenuhi += jumlahPerId.get(k.id) ?? 0;
  }
  if (dipenuhi > tambahan) galat.push(`Yang dipenuhi melebihi tambahan pagu (kelebihan ${dipenuhi - tambahan}). Dana penggenap tidak boleh minus.`);
  return { galat, dipenuhi, sisa: tambahan - dipenuhi };
}

export function argsPutuskan(tambahan: number, daftar: Keputusan[]): Record<string, unknown> {
  return { p_tambahan: tambahan, p_keputusan: daftar.map((k) => ({ id: k.id, keputusan: k.keputusan, alasan: k.alasan.trim() })) };
}

// ---------- tampilan jadwal (papan 11) ----------
export type WarnaChip = "hijau" | "kuning" | "abu" | "merah" | "biru" | "ungu";
/** Kelas Tailwind untuk chip bertitik (papan 11): latar + teks. */
export const KELAS_CHIP: Record<WarnaChip, string> = {
  hijau: "bg-[#E6F6EC] text-[#14653A]", kuning: "bg-[#FFF4D6] text-[#8A6200]", abu: "bg-[#EEF2F7] text-[#44546F]",
  merah: "bg-[#FDE8E8] text-[#B42329]", biru: "bg-[#E3EEFF] text-[#1F5FD1]", ungu: "bg-[#EFE9FB] text-[#5B3FA6]",
};
export const WARNA_CHIP_STATUS_JADWAL: Record<string, WarnaChip> = {
  terjadwal: "abu", dibuka: "hijau", terkumpul: "kuning", diterapkan: "biru", sah: "hijau", dilewati: "abu",
};
export const WARNA_CHIP_STATUS_USULAN: Record<string, WarnaChip> = {
  draf: "abu", menunggu_ketua: "kuning", menunggu_ppk: "kuning", disetujui: "hijau", dikembalikan: "merah",
};
export type JenisJadwal = "pok" | "administrasi" | "dipa_djpb" | "dipa_dja";
export const DAFTAR_JENIS: { kode: JenisJadwal; nama: string; warna: WarnaChip }[] = [
  { kode: "pok", nama: "Revisi POK", warna: "biru" },
  { kode: "administrasi", nama: "Administrasi", warna: "abu" },
  { kode: "dipa_djpb", nama: "DIPA jalur DJPb", warna: "ungu" },
  { kode: "dipa_dja", nama: "DIPA jalur DJA", warna: "kuning" },
];
export const WARNA_CHIP_JENIS: Record<string, WarnaChip> = Object.fromEntries(DAFTAR_JENIS.map((j) => [j.kode, j.warna]));
export const SIAPA_USULAN: Record<string, string> = {
  menunggu_ketua: "menunggu ketua tim", menunggu_ppk: "menunggu PPK", draf: "belum diajukan", dikembalikan: "perlu perbaikan", disetujui: "",
};

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-10-24" -> "24 Okt 2026" (nilai tak dikenal dikembalikan apa adanya). */
export function tglPanjang(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${Number(m[3])} ${BLN[Number(m[2]) - 1]} ${m[1]}` : (iso ?? "");
}

/** Pengingat tenggat Pasal 175: warna menurut sisa hari (merah <= 7 hari atau lewat, kuning <= 30, selain itu abu) dan teks sisa. Tidak mengunci apa pun. */
export function statusTenggat(sisaHari: number | string | null | undefined): { warna: WarnaChip; teks: string } {
  const n = Number(sisaHari);
  if (sisaHari === null || sisaHari === undefined || !Number.isFinite(n)) return { warna: "abu", teks: "" };
  if (n < 0) return { warna: "merah", teks: `lewat ${-n} hari` };
  if (n === 0) return { warna: "merah", teks: "hari ini" };
  return { warna: n <= 7 ? "merah" : n <= 30 ? "kuning" : "abu", teks: `${n} hari lagi` };
}

/** Usulan RO tidak ikut paket bila jadwal sudah ditutup (terkumpul/diterapkan/sah) dan usulan itu belum disetujui. */
export const tidakIkutPaket = (statusJadwal: string, statusUsulan: string): boolean =>
  ["terkumpul", "diterapkan", "sah"].includes(statusJadwal) && statusUsulan !== "disetujui";

export const labelNomorSah = (jenis: string): string =>
  jenis === "pok" ? "Nomor keputusan atau nota PPK" : jenis === "administrasi" ? "Nomor surat pengesahan" : "Nomor surat pengesahan Kanwil atau DJA";
export const petunjukSah = (jenis: string): string =>
  jenis === "pok"
    ? "Revisi POK dinyatakan sah oleh PPK: catat nomor keputusan atau nota PPK sebagai dasar. KPA menerima laporan, tidak menyetujui."
    : "Catat nomor dan tanggal surat hasil pengesahan; bila dikembalikan atau ditolak, kembalikan jadwal ke Dikumpulkan dengan versi berikutnya.";

/** Kartu "POK sistem yang berlaku" dan riwayat versi, dari catatan sah (keu_revisi_sah) dan POK berlaku (keu_pok_versi). */
export type CatatanSah = { jadwal_id: number; versi_sistem: number | string; nomor_dokumen: string; tanggal_dokumen: string };
export type PokDasar = { nomor_pok: string; tanggal_efektif: string | null } | null;
export function ringkasPok(sah: CatatanSah[], judulJadwal: Map<number, string>, dasar: PokDasar): { label: string; ket: string; riwayat: { label: string; ket: string }[] } {
  const urut = [...sah].sort((a, b) => Number(b.versi_sistem) - Number(a.versi_sistem));
  const riwayat = urut.map((s) => ({
    label: `Versi ${Number(s.versi_sistem)}: ${judulJadwal.get(s.jadwal_id) ?? "jadwal revisi"}`,
    ket: `Sah pada ${tglPanjang(s.tanggal_dokumen)}, dasar ${s.nomor_dokumen}.`,
  }));
  const ketDasar = dasar ? `${dasar.nomor_pok}${dasar.tanggal_efektif ? `, efektif ${tglPanjang(dasar.tanggal_efektif)}` : ""}.` : "Belum ada POK dasar di sistem.";
  riwayat.push({ label: "POK dasar sistem", ket: ketDasar });
  return urut.length ? { label: `Versi ${Number(urut[0].versi_sistem)}`, ket: `${judulJadwal.get(urut[0].jadwal_id) ?? "jadwal revisi"}, sah ${tglPanjang(urut[0].tanggal_dokumen)}`, riwayat } : { label: "POK dasar", ket: ketDasar.replace(/\.$/, "") + "; belum ada revisi sah", riwayat };
}

// ---------- tambah jadwal manual ----------
export type IsianJadwal = { jenis: JenisJadwal; judul: string; buka: string; tutup: string };
export const jadwalKosong = (): IsianJadwal => ({ jenis: "dipa_djpb", judul: "", buka: "", tutup: "" });
/** `tahunTerdaftar` = tahun pada keu_tahun_anggaran; jadwal hanya boleh untuk tahun anggaran yang sudah terdaftar. */
export function periksaJadwalBaru(v: IsianJadwal, tahunTerdaftar: number[]): string[] {
  const g: string[] = [];
  if (v.judul.trim().length < 3) g.push("Judul jadwal minimal 3 karakter.");
  const bukaOk = tanggalSah(v.buka), tutupOk = tanggalSah(v.tutup);
  if (!bukaOk) g.push("Tanggal jendela dibuka tidak valid.");
  if (!tutupOk) g.push("Tanggal jendela ditutup tidak valid.");
  if (bukaOk && tutupOk && v.tutup < v.buka) g.push("Jendela ditutup tidak boleh lebih awal dari jendela dibuka.");
  if (bukaOk) {
    const th = Number(v.buka.slice(0, 4));
    if (!tahunTerdaftar.includes(th)) g.push(`Tahun anggaran ${th} belum terdaftar${tahunTerdaftar.length ? ` (terdaftar: ${tahunTerdaftar.join(", ")})` : ""}.`);
  }
  return g;
}
/** Baris untuk keu_tulis('keu_revisi_jadwal','insert'); status awal otomatis Terjadwal (ditetapkan basis data). */
export const dataJadwalBaru = (v: IsianJadwal): Record<string, unknown> => ({ tahun: Number(v.buka.slice(0, 4)), jenis: v.jenis, judul: v.judul.trim(), buka: v.buka, tutup: v.tutup });
