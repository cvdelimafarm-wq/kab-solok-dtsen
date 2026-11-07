// lib/sigapIndukBaru.ts  (murni, tanpa basis data)
//
// (7 Nov 2026) Kegiatan induk (sigap_induk + sigap_tahap) selama ini hanya terbentuk lewat berkas SQL; membuat kegiatan atau menugaskan petugas tidak membuatnya, sehingga
// petugas kegiatan baru tidak melihat kartu kegiatan sampai SQL ditulis. Di sini: (1) mendeteksi kegiatan aktif yang sudah punya penugasan tetapi belum masuk induk mana pun,
// (2) menyusun induk baru dari satu kegiatan dengan isi awal paling aman (hanya Transport Lokal, ditambah Pelatihan untuk kegiatan jenis pelatihan). Admin mengatur tahap
// selanjutnya di halaman Atur tahap.

import { periksaTahapAdmin } from "@/lib/sigapTahap";

export type KegiatanAnggaran = { id: number; nama: string; jenis?: string | null; aktif?: boolean | null };
export type KegiatanTanpaInduk = { id: number; nama: string; jenis: string | null; penugasan: number };

/** Kegiatan aktif yang punya penugasan aktif tetapi tidak ada di `kegiatan_ids` induk mana pun (aktif maupun nonaktif: induk yang sengaja dimatikan bukan kelalaian). */
export function kegiatanTanpaInduk(kegiatan: readonly KegiatanAnggaran[], penugasanAktifPerKegiatan: ReadonlyMap<number, number>, induk: readonly { kegiatan_ids: readonly (number | string)[] }[]): KegiatanTanpaInduk[] {
  const sudah = new Set<number>();
  for (const i of induk) for (const k of i.kegiatan_ids) sudah.add(Number(k));
  return kegiatan
    .filter((k) => k.aktif !== false && !sudah.has(k.id) && (penugasanAktifPerKegiatan.get(k.id) ?? 0) > 0)
    .map((k) => ({ id: k.id, nama: k.nama, jenis: k.jenis ?? null, penugasan: penugasanAktifPerKegiatan.get(k.id) ?? 0 }))
    .sort((a, b) => a.id - b.id);
}

/** Kode induk dari nama: huruf kecil/angka/garis bawah, 2-30 karakter, tidak kembar dengan `dipakai`. */
export function kodeIndukDariNama(nama: string, dipakai: ReadonlySet<string>): string {
  const dasar = nama.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
  const awal = dasar.length >= 2 ? dasar : "kegiatan";
  let k = awal;
  let n = 2;
  while (dipakai.has(k)) k = `${awal.slice(0, 26)}_${n++}`;
  return k;
}

export type IndukBaru = {
  induk: { kode: string; nama: string; pendek: string; ikon: string; kegiatan_ids: number[]; urutan: number; aktif: true };
  tahap: { kode: string; nama: string; uraian: string | null; isi: string[]; buka_mode: "langsung"; buka_tanggal: null; aktif: true; urutan: 1 }[];
};

/** Induk baru untuk satu kegiatan. Mengembalikan pesan galat bila hasil tidak lolos pemeriksaan tahap. */
export function susunIndukBaru(k: KegiatanAnggaran, kodeDipakai: ReadonlySet<string>, urutanMaks: number): { ok: true; baru: IndukBaru } | { ok: false; pesan: string } {
  const nama = k.nama.trim();
  if (!nama) return { ok: false, pesan: "Kegiatan tidak bernama." };
  const jenis = (k.jenis ?? "").toLowerCase();
  const tahapKode = jenis === "pelatihan" ? "pelatihan" : jenis === "pendataan" ? "pendataan" : "pelaksanaan";
  const tahapNama = jenis === "pelatihan" ? "Pelatihan" : jenis === "pendataan" ? "Pendataan" : "Pelaksanaan";
  const isi = jenis === "pelatihan" ? ["pelatihan", `translok:${k.id}`] : [`translok:${k.id}`];
  const baru: IndukBaru = {
    induk: {
      kode: kodeIndukDariNama(nama, kodeDipakai),
      nama: nama.slice(0, 80),
      pendek: nama.length > 28 ? `${nama.slice(0, 27).trimEnd()}…` : nama,
      ikon: "grafik",
      kegiatan_ids: [k.id],
      urutan: urutanMaks + 1,
      aktif: true,
    },
    tahap: [{ kode: tahapKode, nama: tahapNama, uraian: null, isi, buka_mode: "langsung", buka_tanggal: null, aktif: true, urutan: 1 }],
  };
  for (const t of baru.tahap) {
    const salah = periksaTahapAdmin({ kode: t.kode, nama: t.nama, isi: t.isi, buka_mode: t.buka_mode, buka_tanggal: t.buka_tanggal }, baru.induk.kegiatan_ids);
    if (salah) return { ok: false, pesan: salah };
  }
  return { ok: true, baru };
}
