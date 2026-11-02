// lib/hariKerjaPelatihan.ts
//
// (2 Nov 2026) Manajemen hari kerja untuk PELATIHAN (Kelola Pelatihan > tab Hari Kerja). Logika murni (tanpa basis data) supaya mudah diuji.
//
// Aturan yang sudah berlaku di sistem dan dijaga di sini:
//  - 1 orang, 1 tanggal = 1 kegiatan (juga dijaga basis data: UNIQUE (akun_id, tanggal)).
//  - Hari yang sudah berisi laporan / foto / izin susulan tidak boleh dilepas atau dipindahkan.
//  - Hari kerja uji coba (uji_coba_sampai terisi) tidak disentuh.
//  - Tanggal yang sudah lewat tidak ditambah, tidak dilepas, tidak dipindahkan.

export type PesertaHK = { penugasan_id: number; akun_id: number; nama: string; peran: string; maks_hari: number | null; kelas: number | null };
export type BarisHK = { id: number; penugasan_id: number; akun_id: number; tanggal: string; uji_coba: boolean; kegiatan_id: number; kegiatan_nama: string };

export type StatusSel = "ada" | "kosong" | "lain" | "terkunci_lain";
export type Sel = {
  tanggal: string;
  status: StatusSel;
  /** hanya untuk status "lain" / "terkunci_lain": kegiatan yang memakai tanggal itu */
  kegiatan_id?: number;
  kegiatan_nama?: string;
  /** sel "ada": hari ini sudah berisi laporan/foto/izin */
  berisi?: boolean;
  bisa_buat: boolean;
  bisa_lepas: boolean;
  bisa_pindah: boolean;
  /** alasan sel tidak bisa diubah (tampil sebagai keterangan) */
  alasan?: string;
};
export type BarisMatriks = { peserta: PesertaHK; sel: Sel[]; terpakai: number };

export const kunciIsi = (penugasanId: number, tanggal: string) => `${penugasanId}|${tanggal}`;

/** Membangun matriks peserta x tanggal. `terisi` = kunci (penugasan|tanggal) yang sudah punya laporan/foto/izin susulan. */
export function bangunMatriks(peserta: PesertaHK[], tanggal: string[], baris: BarisHK[], terisi: Set<string>, hariIni: string): BarisMatriks[] {
  const peta = new Map<string, BarisHK[]>();
  for (const b of baris) {
    const k = `${b.akun_id}|${b.tanggal}`;
    const l = peta.get(k);
    if (l) l.push(b);
    else peta.set(k, [b]);
  }
  return peserta.map((p) => {
    let terpakai = 0;
    const sel = tanggal.map<Sel>((t) => {
      const ada = peta.get(`${p.akun_id}|${t}`) ?? [];
      const milik = ada.find((b) => b.penugasan_id === p.penugasan_id);
      const lain = ada.find((b) => b.penugasan_id !== p.penugasan_id);
      const lewat = t < hariIni;
      if (milik) {
        terpakai++;
        const berisi = terisi.has(kunciIsi(milik.penugasan_id, t));
        const alasan = milik.uji_coba ? "Hari kerja uji coba, tidak diubah dari sini." : berisi ? "Sudah ada laporan/foto/izin susulan pada hari ini." : lewat ? "Tanggal sudah lewat." : undefined;
        return { tanggal: t, status: "ada", berisi, bisa_buat: false, bisa_lepas: !alasan, bisa_pindah: false, alasan };
      }
      if (lain) {
        const berisi = terisi.has(kunciIsi(lain.penugasan_id, t));
        const alasan = lain.uji_coba ? "Hari kerja uji coba di kegiatan lain." : berisi ? "Di kegiatan lain sudah ada laporan/foto/izin susulan." : lewat ? "Tanggal sudah lewat." : undefined;
        return { tanggal: t, status: alasan ? "terkunci_lain" : "lain", kegiatan_id: lain.kegiatan_id, kegiatan_nama: lain.kegiatan_nama, bisa_buat: false, bisa_lepas: false, bisa_pindah: !alasan, alasan };
      }
      return { tanggal: t, status: "kosong", bisa_buat: !lewat, bisa_lepas: false, bisa_pindah: false, alasan: lewat ? "Tanggal sudah lewat." : undefined };
    });
    return { peserta: p, sel, terpakai };
  });
}

export type RingkasHK = { peserta: number; sel: number; ada: number; kosong: number; lain: number; terkunci_lain: number; bisa_buat: number; bisa_pindah: number; lengkap: number };

export function ringkasMatriks(m: BarisMatriks[]): RingkasHK {
  const r: RingkasHK = { peserta: m.length, sel: 0, ada: 0, kosong: 0, lain: 0, terkunci_lain: 0, bisa_buat: 0, bisa_pindah: 0, lengkap: 0 };
  for (const b of m) {
    let semuaAda = b.sel.length > 0;
    for (const s of b.sel) {
      r.sel++;
      r[s.status]++;
      if (s.bisa_buat) r.bisa_buat++;
      if (s.bisa_pindah) r.bisa_pindah++;
      if (s.status !== "ada") semuaAda = false;
    }
    if (semuaAda) r.lengkap++;
  }
  return r;
}

/** Periksa kuota hari (sigap_penugasan.maks_hari): jumlah hari sesudah penambahan tidak boleh melebihi batas. Kosong/0 = tanpa batas. */
export function periksaKuota(maks: number | null | undefined, terpakai: number, tambah: number): string | null {
  if (!maks || maks <= 0) return null;
  return terpakai + tambah > maks ? `Melebihi maksimal ${maks} hari untuk peran ini.` : null;
}

export type Aksi = "buat" | "lepas" | "pindah";
export type Item = { akun_id: number; tanggal: string };

/** Daftar item yang boleh diproses untuk satu aksi, dari matriks (dipakai tombol "semua"). */
export function itemDariMatriks(m: BarisMatriks[], aksi: Aksi): Item[] {
  const out: Item[] = [];
  for (const b of m) {
    let dipakai = b.terpakai;
    for (const s of b.sel) {
      const boleh = aksi === "buat" ? s.bisa_buat : aksi === "lepas" ? s.bisa_lepas : s.bisa_pindah;
      if (!boleh) continue;
      if (aksi !== "lepas") {
        if (periksaKuota(b.peserta.maks_hari, dipakai, 1)) continue;
        dipakai++;
      }
      out.push({ akun_id: b.peserta.akun_id, tanggal: s.tanggal });
    }
  }
  return out;
}

/** Memeriksa satu item terhadap matriks segar. Mengembalikan alasan penolakan, atau null bila boleh. */
export function periksaItem(m: BarisMatriks[], aksi: Aksi, item: Item): string | null {
  const b = m.find((x) => x.peserta.akun_id === item.akun_id);
  if (!b) return "Bukan peserta pelatihan ini.";
  const s = b.sel.find((x) => x.tanggal === item.tanggal);
  if (!s) return "Tanggal di luar jadwal pelatihan.";
  if (aksi === "buat") {
    if (s.status === "ada") return "Sudah menjadi hari kerja pelatihan.";
    if (s.status !== "kosong") return s.alasan ?? "Tanggal ini dipakai kegiatan lain. Gunakan Pindahkan.";
    if (!s.bisa_buat) return s.alasan ?? "Tidak dapat ditambah.";
    return periksaKuota(b.peserta.maks_hari, b.terpakai, 1);
  }
  if (aksi === "lepas") {
    if (s.status !== "ada") return "Bukan hari kerja pelatihan.";
    return s.bisa_lepas ? null : s.alasan ?? "Tidak dapat dilepas.";
  }
  if (s.status === "ada") return "Sudah menjadi hari kerja pelatihan.";
  if (s.status === "kosong") return "Tanggal ini kosong, cukup Buatkan.";
  if (!s.bisa_pindah) return s.alasan ?? "Tidak dapat dipindahkan.";
  return periksaKuota(b.peserta.maks_hari, b.terpakai, 1);
}

export const LABEL_AKSI: Record<Aksi, string> = { buat: "dibuatkan", lepas: "dilepas", pindah: "dipindahkan" };

/**
 * (2 Nov 2026) PELATIHAN: ambil foto dan unggah foto (termasuk "foto laporan" nomor 3) hanya pada HARI KERJA. Di luar hari kerja peserta hanya bisa membuka
 * "Foto saya" dan "Periksa". Kegiatan pendataan tidak berubah (foto laporan di luar hari kerja tetap boleh bila jumlah foto >= 3).
 */
export const fotoHanyaHariKerja = (jenis: unknown): boolean => jenis === "pelatihan";
