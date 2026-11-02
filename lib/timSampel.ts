// lib/timSampel.ts  (logika murni; aman diimpor klien dan server)
//
// (2 Nov 2026) SATU KALI IMPOR: berkas alokasi sampel (lib/sampelSls.ts) kini juga memuat Nama Korwil dan Nama Supervisor (opsional). Dari berkas yang sama disusun
// SUSUNAN TIM kegiatan: siapa berperan apa dan siapa atasannya (PPL -> PML -> Korwil -> Supervisor), plus daftar petugas yang belum ditugaskan pada kegiatan itu
// (ditugaskan otomatis saat disimpan bila admin memilihnya). Tabel tujuan: sigap_penugasan (peran), sigap_tim (atasan), sigap_sampel (wilayah).
// Fungsi di sini murni: pencocokan nama atasan, penyusunan simpul, pembandingan dengan penugasan yang sudah ada, ringkasan untuk pratinjau.

import { cocokkanNama, normNama, type BarisSampel, type GalatBaris, type Kandidat } from "@/lib/sampelSls";

export type PeranTim = "ppl" | "pml" | "korwil" | "supervisor";
export const URUT_PERAN_TIM: Record<PeranTim, number> = { supervisor: 0, korwil: 1, pml: 2, ppl: 3 };
export const LABEL_PERAN_TIM: Record<PeranTim, string> = { supervisor: "Supervisor", korwil: "Korwil", pml: "PML", ppl: "PPL" };

/** Baris sampel yang sudah dicocokkan nama korwil dan supervisornya (null = kolom kosong pada baris itu). */
export type BarisAtasan = { korwil_akun_id: number | null; supervisor_akun_id: number | null };

export type PemetaanAtasan = { peran: "korwil" | "supervisor"; nama_excel: string; nama_akun: string | null; akun_id: number | null; mirip: boolean; pesan: string | null; baris: number };

/**
 * Mencocokkan Nama Korwil dan Nama Supervisor tiap baris ke akun. Hasil `baris` sejajar dengan masukan (panjang sama, urutan sama) sehingga dapat diteruskan
 * ke pencocokan PPL/PML. Kolom kosong = null. Nama yang tidak ditemukan atau ganda = galat pada baris itu (nomor baris Excel dari `nomor`).
 */
export function cocokkanAtasan<T extends BarisSampel>(
  baris: readonly T[],
  korwil: readonly Kandidat[],
  supervisor: readonly Kandidat[],
  nomor?: readonly number[],
  /** "akun" = kandidat semua akun (mode otomatis); "penugasan" = hanya yang sudah ditugaskan pada kegiatan (mode biasa), mempengaruhi bunyi pesan. */
  sumber: "akun" | "penugasan" = "akun",
): { baris: (T & BarisAtasan)[]; galat: GalatBaris[]; pemetaan: PemetaanAtasan[] } {
  const galat: GalatBaris[] = [];
  const pemetaan = new Map<string, PemetaanAtasan>();
  const memo = new Map<string, ReturnType<typeof cocokkanNama>>();
  const cari = (peran: "korwil" | "supervisor", nama: string, no: number) => {
    const kunci = `${peran}|${normNama(nama)}`;
    let h = memo.get(kunci);
    if (!h) {
      h = cocokkanNama(nama, peran === "korwil" ? korwil : supervisor);
      if (!h.ok && h.alasan === "tidak_ada") {
        h = {
          ...h,
          pesan:
            sumber === "akun"
              ? `Nama ${LABEL_PERAN_TIM[peran]} "${nama}" tidak ditemukan di akun SIGAP organik (atau ejaannya berbeda).`
              : `Nama ${LABEL_PERAN_TIM[peran]} "${nama}" belum ditugaskan sebagai ${LABEL_PERAN_TIM[peran]} pada kegiatan ini (atau ejaannya berbeda). Centang "Tugaskan otomatis" untuk menugaskannya dari berkas.`,
        };
      }
      memo.set(kunci, h);
      pemetaan.set(kunci, { peran, nama_excel: nama, nama_akun: h.ok ? h.nama : null, akun_id: h.ok ? h.id : null, mirip: h.ok ? h.mirip : false, pesan: h.ok ? null : h.pesan, baris: no });
    }
    return h;
  };
  const hasil = baris.map((b, i): T & BarisAtasan => {
    const no = nomor?.[i] ?? i + 2;
    const pesan: string[] = [];
    let k: number | null = null;
    let s: number | null = null;
    if (b.korwil_nama && b.korwil_nama.trim()) {
      const h = cari("korwil", b.korwil_nama, no);
      if (h.ok) k = h.id;
      else pesan.push(h.pesan);
    }
    if (b.supervisor_nama && b.supervisor_nama.trim()) {
      const h = cari("supervisor", b.supervisor_nama, no);
      if (h.ok) s = h.id;
      else pesan.push(h.pesan);
    }
    if (pesan.length > 0) galat.push({ baris: no, pesan: pesan.join(" ") });
    return { ...b, korwil_akun_id: k, supervisor_akun_id: s };
  });
  const urut = Array.from(pemetaan.values()).sort((a, b) => (a.peran === b.peran ? a.nama_excel.localeCompare(b.nama_excel) : a.peran === "korwil" ? -1 : 1));
  return { baris: hasil, galat, pemetaan: urut };
}

export type SimpulTim = { akun_id: number; nama: string; peran: PeranTim; atasan_akun_id: number | null };

type BarisTim = BarisAtasan & { ppl_akun_id: number; pml_akun_id: number };

/** Nilai yang paling sering muncul; seri dimenangkan id terkecil. Mengembalikan null bila daftar kosong. */
function modus(daftar: readonly number[]): number | null {
  if (daftar.length === 0) return null;
  const n = new Map<number, number>();
  for (const x of daftar) n.set(x, (n.get(x) ?? 0) + 1);
  return Array.from(n.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export type SusunanTim = { simpul: SimpulTim[]; galat: string[]; peringatan: string[] };

/**
 * Menyusun simpul tim dari baris sampel yang SUDAH dicocokkan. Aturan:
 *  - atasan PPL = PML yang paling sering memegang baris-barisnya; atasan PML = korwil yang paling sering tertulis pada baris PML itu (bila tidak ada korwil, supervisor);
 *    atasan korwil = supervisor yang paling sering tertulis; supervisor tanpa atasan.
 *  - satu orang hanya boleh satu peran dalam satu berkas (galat bila tumpang tindih); nama tampil diambil dari `namaAkun`.
 *  - PPL di bawah lebih dari satu PML, PML di bawah lebih dari satu atasan: peringatan (dipakai yang terbanyak), bukan galat.
 */
export function susunTim(baris: readonly BarisTim[], namaAkun: ReadonlyMap<number, string>): SusunanTim {
  const galat: string[] = [];
  const peringatan: string[] = [];
  const nama = (id: number) => namaAkun.get(id) ?? `akun ${id}`;

  const peranDari = new Map<number, Set<PeranTim>>();
  const tandai = (id: number | null | undefined, peran: PeranTim) => {
    if (id == null) return;
    const s = peranDari.get(id) ?? new Set<PeranTim>();
    s.add(peran);
    peranDari.set(id, s);
  };
  for (const b of baris) {
    tandai(b.ppl_akun_id, "ppl");
    tandai(b.pml_akun_id, "pml");
    tandai(b.korwil_akun_id, "korwil");
    tandai(b.supervisor_akun_id, "supervisor");
  }
  const rangkap = Array.from(peranDari.entries()).filter(([, s]) => s.size > 1);
  for (const [id, s] of rangkap.slice(0, 10)) galat.push(`${nama(id)} tertulis dengan lebih dari satu peran dalam berkas (${Array.from(s).map((p) => LABEL_PERAN_TIM[p]).join(", ")}). Satu orang hanya boleh satu peran pada satu kegiatan.`);
  if (rangkap.length > 10) galat.push(`... dan ${rangkap.length - 10} orang lain dengan peran rangkap.`);

  const pmlDariPpl = new Map<number, number[]>();
  const korwilDariPml = new Map<number, number[]>();
  const supDariPml = new Map<number, number[]>();
  const supDariKorwil = new Map<number, number[]>();
  const taruh = (m: Map<number, number[]>, k: number, v: number | null | undefined) => {
    if (v == null) return;
    m.set(k, [...(m.get(k) ?? []), v]);
  };
  for (const b of baris) {
    taruh(pmlDariPpl, b.ppl_akun_id, b.pml_akun_id);
    taruh(korwilDariPml, b.pml_akun_id, b.korwil_akun_id);
    taruh(supDariPml, b.pml_akun_id, b.supervisor_akun_id);
    if (b.korwil_akun_id != null) taruh(supDariKorwil, b.korwil_akun_id, b.supervisor_akun_id);
  }
  const beda = (daftar: readonly number[]) => new Set(daftar).size;

  const simpul: SimpulTim[] = [];
  const kunci = (m: Map<number, Set<PeranTim>>, peran: PeranTim) => Array.from(m.entries()).filter(([, s]) => s.has(peran)).map(([id]) => id);

  for (const id of kunci(peranDari, "ppl")) {
    const p = pmlDariPpl.get(id) ?? [];
    if (beda(p) > 1) peringatan.push(`PPL ${nama(id)} tercatat di bawah ${beda(p)} PML berbeda; dipakai ${nama(modus(p) as number)} (paling banyak).`);
    simpul.push({ akun_id: id, nama: nama(id), peran: "ppl", atasan_akun_id: modus(p) });
  }
  for (const id of kunci(peranDari, "pml")) {
    const k = korwilDariPml.get(id) ?? [];
    const s = supDariPml.get(id) ?? [];
    if (beda(k) > 1) peringatan.push(`PML ${nama(id)} tercatat di bawah ${beda(k)} korwil berbeda; dipakai ${nama(modus(k) as number)} (paling banyak).`);
    simpul.push({ akun_id: id, nama: nama(id), peran: "pml", atasan_akun_id: k.length > 0 ? modus(k) : modus(s) });
  }
  for (const id of kunci(peranDari, "korwil")) {
    const s = supDariKorwil.get(id) ?? [];
    if (beda(s) > 1) peringatan.push(`Korwil ${nama(id)} tercatat di bawah ${beda(s)} supervisor berbeda; dipakai ${nama(modus(s) as number)} (paling banyak).`);
    simpul.push({ akun_id: id, nama: nama(id), peran: "korwil", atasan_akun_id: modus(s) });
  }
  for (const id of kunci(peranDari, "supervisor")) simpul.push({ akun_id: id, nama: nama(id), peran: "supervisor", atasan_akun_id: null });

  // satu akun satu simpul (peran rangkap sudah galat; ambil peran pertama menurut urutan agar hasil tetap deterministik)
  const unik = new Map<number, SimpulTim>();
  for (const s of simpul.sort((a, b) => URUT_PERAN_TIM[a.peran] - URUT_PERAN_TIM[b.peran] || a.nama.localeCompare(b.nama, "id"))) if (!unik.has(s.akun_id)) unik.set(s.akun_id, s);
  const hasil = Array.from(unik.values());
  // atasan harus anggota simpul; bila tidak (mis. atasan berperan lain) dilepas
  const ada = new Set(hasil.map((s) => s.akun_id));
  for (const s of hasil) if (s.atasan_akun_id !== null && (!ada.has(s.atasan_akun_id) || s.atasan_akun_id === s.akun_id)) s.atasan_akun_id = null;
  return { simpul: hasil, galat, peringatan };
}

export type BandingPenugasan = {
  /** belum ditugaskan pada kegiatan: akan ditugaskan saat disimpan (mode otomatis) */
  baru: SimpulTim[];
  /** sudah ditugaskan dengan peran yang sama */
  sudah: SimpulTim[];
  /** sudah ditugaskan dengan peran LAIN: tidak boleh disimpan */
  bentrok: { akun_id: number; nama: string; peran_berkas: PeranTim; peran_ada: string }[];
};

/** Membandingkan simpul dengan penugasan aktif kegiatan (`ada`: akun -> peran). */
export function bandingkanPenugasan(simpul: readonly SimpulTim[], ada: ReadonlyMap<number, string>): BandingPenugasan {
  const hasil: BandingPenugasan = { baru: [], sudah: [], bentrok: [] };
  for (const s of simpul) {
    const p = ada.get(s.akun_id);
    if (p === undefined) hasil.baru.push(s);
    else if (p === s.peran) hasil.sudah.push(s);
    else hasil.bentrok.push({ akun_id: s.akun_id, nama: s.nama, peran_berkas: s.peran, peran_ada: p });
  }
  return hasil;
}

export type RingkasTim = {
  per_peran: Record<PeranTim, number>;
  baru: Record<PeranTim, number>;
  sudah: number;
  ada_atasan: number;
  tanpa_atasan: { nama: string; peran: PeranTim }[];
};

const nol = (): Record<PeranTim, number> => ({ ppl: 0, pml: 0, korwil: 0, supervisor: 0 });

/** Ringkasan untuk pratinjau. `tanpa_atasan` hanya PPL dan PML (korwil dan supervisor memang boleh tanpa atasan). */
export function ringkasTim(simpul: readonly SimpulTim[], banding: BandingPenugasan): RingkasTim {
  const per = nol();
  const baru = nol();
  for (const s of simpul) per[s.peran]++;
  for (const s of banding.baru) baru[s.peran]++;
  return {
    per_peran: per,
    baru,
    sudah: banding.sudah.length,
    ada_atasan: simpul.filter((s) => s.atasan_akun_id !== null).length,
    tanpa_atasan: simpul.filter((s) => s.atasan_akun_id === null && (s.peran === "ppl" || s.peran === "pml")).map((s) => ({ nama: s.nama, peran: s.peran })),
  };
}

/** Bentuk yang dikirim ke fungsi basis data (hanya id dan peran). */
export const bentukTimJson = (simpul: readonly SimpulTim[]) => simpul.map((s) => ({ akun_id: s.akun_id, peran: s.peran, atasan_akun_id: s.atasan_akun_id }));
