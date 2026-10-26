// lib/keu/notifikasi.ts
//
// (25 Okt 2026, tahap 30) Notifikasi SIGAP (pesan per akun) dan keputusan KPA atas perubahan sesudah H-15 serta pengecualian kebijakan.
// Berkas MURNI: bentuk data, label, dan aturan tombol. Yang memutuskan tetap basis data (berkas 20261025zh).

export type JenisNotif = "ident_fix" | "ident_pasca_h15" | "nama_terisi" | "lembar_menunggu" | "pengecualian_diajukan" | "pengecualian_putus" | "penugasan_diterapkan" | "gap_keras" | "gap_akhir"
  | "delegasi_baru" | "delegasi_ubah" | "delegasi_tanggapan" | "delegasi_pembinaan" | "delegasi_penghargaan" | "delegasi_pengingat";
export type Nada = "abu" | "biru" | "kuning" | "hijau" | "merah";

export type Notifikasi = {
  id: number; jenis: JenisNotif; ident_id: number | null; lembar_id: number | null; pengecualian_id: number | null;
  judul: string; isi: string; tautan: string; dibuat_at: string; dibaca_at: string | null; pemicu_nama: string | null;
};
export type DaftarNotif = { belum: number; daftar: Notifikasi[] };

export const LABEL_NOTIF: Record<JenisNotif, { teks: string; nada: Nada }> = {
  ident_fix: { teks: "Lanjutan Final", nada: "hijau" },
  ident_pasca_h15: { teks: "Sesudah H-15", nada: "merah" },
  nama_terisi: { teks: "Nama petugas terisi", nada: "biru" },
  lembar_menunggu: { teks: "Pengesahan lembar", nada: "kuning" },
  pengecualian_diajukan: { teks: "Perlu keputusan KPA", nada: "kuning" },
  pengecualian_putus: { teks: "Keputusan KPA", nada: "biru" },
  penugasan_diterapkan: { teks: "Penugasan diterapkan", nada: "hijau" },
  gap_keras: { teks: "Temuan keras pelaksanaan", nada: "merah" },
  gap_akhir: { teks: "Laporan Gap akhir", nada: "biru" },
  delegasi_baru: { teks: "Delegasi baru", nada: "hijau" },
  delegasi_ubah: { teks: "Delegasi diubah", nada: "biru" },
  delegasi_tanggapan: { teks: "Tanggapan delegasi", nada: "biru" },
  delegasi_pembinaan: { teks: "Pembinaan", nada: "kuning" },
  delegasi_penghargaan: { teks: "Penghargaan", nada: "hijau" },
  delegasi_pengingat: { teks: "Pengingat lapor", nada: "kuning" },
};

/** Tautan yang boleh dibuka dari notifikasi: hanya alamat dalam SIGAP (diawali /sigap/). */
export function tautanAman(t: string): string | null {
  return /^\/sigap\/[A-Za-z0-9/_\-]*(#[A-Za-z0-9_\-]+)?$/.test(t) ? t : null;
}

/** Isi bentuk data dari basis data menjadi daftar yang aman dipakai tampilan. */
export function normalisasiDaftar(x: unknown): DaftarNotif {
  const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
  const belum = typeof o.belum === "number" && Number.isFinite(o.belum) ? Math.max(0, Math.floor(o.belum)) : 0;
  const daftar = (Array.isArray(o.daftar) ? o.daftar : []).filter((e): e is Notifikasi => typeof e === "object" && e !== null && typeof (e as Notifikasi).id === "number" && typeof (e as Notifikasi).judul === "string")
    .map((e) => ({ ...e, isi: typeof e.isi === "string" ? e.isi : "", tautan: typeof e.tautan === "string" ? e.tautan : "", dibaca_at: e.dibaca_at ?? null, pemicu_nama: e.pemicu_nama ?? null }));
  return { belum, daftar };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pengecualian dan keputusan KPA
// ---------------------------------------------------------------------------------------------------------------------
export type JenisPengecualian = "perubahan_h15" | "kebijakan" | "rangkap";
export type StatusPengecualian = "diajukan" | "disetujui" | "ditolak" | "ditarik";
export type BarisPengecualian = {
  id: number; ident_id: number; tahun: number; ro_kode: string; nama: string; jenis: JenisPengecualian; objek: string; alasan: string; lanjutan_ver: number | null;
  status: StatusPengecualian; otomatis: boolean; diajukan_oleh: number | null; diajukan_oleh_nama: string | null; diputus_oleh_nama: string | null;
  catatan_putusan: string; diajukan_at: string; diputus_at: string | null;
};

export const NAMA_JENIS_PENGECUALIAN: Record<JenisPengecualian, string> = {
  perubahan_h15: "Perubahan sesudah H-15", kebijakan: "Pelanggaran kebijakan", rangkap: "Rangkap jabatan",
};
export const LABEL_STATUS_PENGECUALIAN: Record<StatusPengecualian, { teks: string; nada: Nada }> = {
  diajukan: { teks: "Menunggu keputusan KPA", nada: "kuning" }, disetujui: { teks: "Disetujui KPA", nada: "hijau" },
  ditolak: { teks: "Ditolak KPA", nada: "merah" }, ditarik: { teks: "Ditarik", nada: "abu" },
};

export type AksiPengecualian = "putus" | "tarik";
/** Tombol yang tersedia (cerminan basis data): putus hanya KPA pada yang diajukan; tarik hanya pengaju pada yang manual dan masih diajukan. */
export function aksiPengecualian(b: Pick<BarisPengecualian, "status" | "otomatis" | "diajukan_oleh">, kpa: boolean, akun: number | null): AksiPengecualian[] {
  const a: AksiPengecualian[] = [];
  if (b.status !== "diajukan") return a;
  if (kpa) a.push("putus");
  if (!b.otomatis && akun !== null && b.diajukan_oleh === akun) a.push("tarik");
  return a;
}

/** Normal: pengecualian yang disetujui KPA dan masih berlaku untuk suatu peringatan (dicocokkan tanpa memedulikan huruf besar kecil dan spasi). */
export const kunciObjek = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
export function peringatanDikecualikan(peringatan: string[], baris: Pick<BarisPengecualian, "jenis" | "objek" | "status">[]): Set<string> {
  const setuju = new Set(baris.filter((b) => b.status === "disetujui" && b.jenis !== "perubahan_h15").map((b) => kunciObjek(b.objek)));
  return new Set(peringatan.filter((w) => setuju.has(kunciObjek(w))));
}

/** Ringkasan keputusan sesudah H-15 untuk satu versi lanjutan (null bila tidak ada). */
export function putusanVersi(baris: Pick<BarisPengecualian, "jenis" | "lanjutan_ver" | "status">[], ver: number): StatusPengecualian | null {
  return baris.find((b) => b.jenis === "perubahan_h15" && b.lanjutan_ver === ver)?.status ?? null;
}
