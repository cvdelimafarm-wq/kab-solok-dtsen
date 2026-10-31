// lib/penilaianMitra.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Penilaian Mitra per kegiatan: tiap kegiatan menambah satu KOLOM penilaian; tiap Mitra bernilai 1-5 (opsional catatan) per kolom.
// Rata-rata semua kolom = rekam jejak Mitra (dipakai peringkat seleksi; bencana_petugas.nilai_kinerja diturunkan trigger SQL 20261031j).
// Dipakai API (app/api/sigap/penilaian-mitra) dan layar (app/sigap/akses/PenilaianMitra.tsx).

export const NILAI_MIN = 1;
export const NILAI_MAKS = 5;
export const MAKS_CATATAN = 500;
export const MAKS_BANYAK = 500;
export const MAKS_NAMA_KOLOM = 120;

export type NilaiMitra = { n: number; c: string | null };

export const nilaiSah = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= NILAI_MIN && v <= NILAI_MAKS;

/** Rata-rata nilai (1 desimal); null bila tidak ada nilai. */
export function rataRata(nilai: (number | null | undefined)[]): number | null {
  const ada = nilai.filter((x): x is number => nilaiSah(x));
  if (ada.length === 0) return null;
  return Math.round((ada.reduce((a, b) => a + b, 0) / ada.length) * 10) / 10;
}

/** Rata-rata nilai TANPA pembulatan (dipakai skor rekam jejak seleksi); null bila tidak ada nilai sah. */
export function rataPersis(nilai: (number | null | undefined)[]): number | null {
  const ada = nilai.filter((x): x is number => nilaiSah(x));
  return ada.length === 0 ? null : ada.reduce((a, b) => a + b, 0) / ada.length;
}

/** Kode kolom dari nama: huruf besar, angka, tanda minus; maks 40 karakter ("Sakernas TW IV" -> "SAKERNAS-TW-IV"). Kosong -> null. */
export function buatKode(teks: string): string | null {
  const k = teks
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return k === "" ? null : k;
}

const teksBersih = (v: unknown, maks: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  if (t === "") return null;
  return t.length > maks || /[<>`\u0000-\u001f]/.test(t) ? undefined : t;
};

export type KolomBaru = { nama: string; kode: string; kegiatan_id: number | null };

/** Isian "tambah kolom". Nama kosong diganti nama kegiatan terpilih. `kegiatan` = kegiatan yang dipilih (sudah dibaca dari DB) bila ada. */
export function periksaKolomBaru(isi: unknown, kegiatan: { id: number; nama: string; kode?: string | null } | null): { ok: true; nilai: KolomBaru } | { ok: false; pesan: string } {
  const o = (isi ?? {}) as Record<string, unknown>;
  const nama = teksBersih(o.nama, MAKS_NAMA_KOLOM);
  if (nama === undefined) return { ok: false, pesan: `Nama kolom maksimal ${MAKS_NAMA_KOLOM} karakter dan tanpa simbol khusus.` };
  const dipakai = nama ?? kegiatan?.nama ?? null;
  if (!dipakai) return { ok: false, pesan: "Isi nama kolom atau pilih kegiatan." };
  const kode = buatKode(kegiatan?.kode ?? "") ?? buatKode(kegiatan?.nama ?? "") ?? buatKode(dipakai);
  if (!kode) return { ok: false, pesan: "Nama kolom harus memuat huruf atau angka." };
  return { ok: true, nilai: { nama: dipakai, kode, kegiatan_id: kegiatan?.id ?? null } };
}

export type IsianNilai = { kolom_id: number; akun_id: number; nilai: number | null; catatan: string | null };

const idSah = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

/** Isian satu nilai. nilai null = hapus penilaian. */
export function periksaNilai(isi: unknown): { ok: true; nilai: IsianNilai } | { ok: false; pesan: string } {
  const o = (isi ?? {}) as Record<string, unknown>;
  const kolom = idSah(o.kolom_id);
  const akun = idSah(o.akun_id);
  if (kolom === null) return { ok: false, pesan: "Kolom penilaian tidak sah." };
  if (akun === null) return { ok: false, pesan: "Mitra tidak sah." };
  const nilai = o.nilai === null || o.nilai === undefined || o.nilai === "" ? null : o.nilai;
  if (nilai !== null && !nilaiSah(nilai)) return { ok: false, pesan: `Nilai harus bilangan bulat ${NILAI_MIN}-${NILAI_MAKS}.` };
  const catatan = teksBersih(o.catatan, MAKS_CATATAN);
  if (catatan === undefined) return { ok: false, pesan: `Catatan maksimal ${MAKS_CATATAN} karakter dan tanpa simbol khusus.` };
  return { ok: true, nilai: { kolom_id: kolom, akun_id: akun, nilai, catatan: nilai === null ? null : catatan } };
}

export type BarisBanyak = { akun_id: number; nilai: number; catatan: string | null };

/** Isian banyak nilai sekaligus (hasil tempel): maks MAKS_BANYAK, akun unik, nilai 1-5. */
export function periksaBanyak(isi: unknown): { ok: true; kolom_id: number; baris: BarisBanyak[] } | { ok: false; pesan: string } {
  const o = (isi ?? {}) as Record<string, unknown>;
  const kolom = idSah(o.kolom_id);
  if (kolom === null) return { ok: false, pesan: "Kolom penilaian tidak sah." };
  const mentah = Array.isArray(o.baris) ? o.baris : [];
  if (mentah.length === 0) return { ok: false, pesan: "Tidak ada nilai untuk disimpan." };
  if (mentah.length > MAKS_BANYAK) return { ok: false, pesan: `Paling banyak ${MAKS_BANYAK} nilai sekali simpan.` };
  const lihat = new Set<number>();
  const baris: BarisBanyak[] = [];
  for (const m of mentah) {
    const r = periksaNilai({ ...(m as object), kolom_id: kolom });
    if (!r.ok) return r;
    if (r.nilai.nilai === null) return { ok: false, pesan: "Setiap baris harus punya nilai 1-5." };
    if (lihat.has(r.nilai.akun_id)) continue;
    lihat.add(r.nilai.akun_id);
    baris.push({ akun_id: r.nilai.akun_id, nilai: r.nilai.nilai, catatan: r.nilai.catatan });
  }
  return { ok: true, kolom_id: kolom, baris };
}

// ---- Tempel dari Excel ----

export type BarisTempel = { kunci: string; nilai: number; catatan: string | null; baris_ke: number };
export type GalatTempel = { baris_ke: number; pesan: string };

/**
 * Teks tempel dari Excel: kolom 1 = NIK (atau nama lengkap), kolom 2 = nilai 1-5, kolom 3 = catatan (opsional). Pemisah tab, titik koma, atau koma.
 * Baris judul (nilai bukan angka pada baris pertama) dilewati. Baris tak sah dilaporkan, tidak membatalkan baris lain.
 */
export function uraiTempel(teks: string): { baris: BarisTempel[]; galat: GalatTempel[] } {
  const baris: BarisTempel[] = [];
  const galat: GalatTempel[] = [];
  const garis = teks.replace(/\r/g, "").split("\n");
  garis.forEach((g, i) => {
    if (g.trim() === "") return;
    const pemisah = g.includes("\t") ? "\t" : g.includes(";") ? ";" : ",";
    const sel = g.split(pemisah).map((x) => x.trim());
    const kunci = sel[0] ?? "";
    const mentahNilai = (sel[1] ?? "").replace(",", ".");
    const n = Number(mentahNilai);
    if (kunci === "") return void galat.push({ baris_ke: i + 1, pesan: "NIK/nama kosong." });
    if (!/^\d+(\.0+)?$/.test(mentahNilai) || !nilaiSah(n)) {
      if (i === 0 || baris.length + galat.length === 0) return; // baris judul
      return void galat.push({ baris_ke: i + 1, pesan: `Nilai "${sel[1] ?? ""}" bukan bilangan bulat ${NILAI_MIN}-${NILAI_MAKS}.` });
    }
    const catatan = teksBersih(sel.slice(2).join(" ").trim() || null, MAKS_CATATAN);
    baris.push({ kunci, nilai: n, catatan: catatan ?? null, baris_ke: i + 1 });
  });
  return { baris, galat };
}

export const normalNama = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export type CalonMitra = { id: number; nama: string; nik: string | null };
export type HasilCocok = {
  cocok: { akun_id: number; nama: string; nilai: number; catatan: string | null; baris_ke: number }[];
  tidak_cocok: { kunci: string; baris_ke: number }[];
  ambigu: { kunci: string; baris_ke: number }[];
};

/** Cocokkan baris tempel ke Mitra: NIK utuh (angka, >= 10 digit) lebih dulu, lalu nama persis (tanpa beda huruf/tanda baca); nama kembar = ambigu. */
export function cocokkanMitra(baris: BarisTempel[], mitra: CalonMitra[]): HasilCocok {
  const perNik = new Map<string, CalonMitra[]>();
  const perNama = new Map<string, CalonMitra[]>();
  for (const m of mitra) {
    const nik = (m.nik ?? "").replace(/\D/g, "");
    if (nik.length >= 10) perNik.set(nik, [...(perNik.get(nik) ?? []), m]);
    const nm = normalNama(m.nama);
    if (nm) perNama.set(nm, [...(perNama.get(nm) ?? []), m]);
  }
  const h: HasilCocok = { cocok: [], tidak_cocok: [], ambigu: [] };
  const terpakai = new Set<number>();
  for (const b of baris) {
    const digit = b.kunci.replace(/\D/g, "");
    const kandidat = digit.length >= 10 && digit.length === b.kunci.replace(/\s/g, "").length ? perNik.get(digit) : perNama.get(normalNama(b.kunci));
    if (!kandidat || kandidat.length === 0) h.tidak_cocok.push({ kunci: b.kunci, baris_ke: b.baris_ke });
    else if (kandidat.length > 1) h.ambigu.push({ kunci: b.kunci, baris_ke: b.baris_ke });
    else if (!terpakai.has(kandidat[0].id)) {
      terpakai.add(kandidat[0].id);
      h.cocok.push({ akun_id: kandidat[0].id, nama: kandidat[0].nama, nilai: b.nilai, catatan: b.catatan, baris_ke: b.baris_ke });
    }
  }
  return h;
}
