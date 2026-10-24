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
