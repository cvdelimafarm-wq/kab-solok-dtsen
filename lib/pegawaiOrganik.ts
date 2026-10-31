// lib/pegawaiOrganik.ts  (logika murni)
//
// (31 Okt 2026) Daftar pegawai organik di tab Pengguna: profil kepegawaian (sigap_pegawai_profil) digabung dengan akun SIGAP.
// Usia dan masa kerja dihitung saat tampil (tahun penuh, tanggal WIB), tidak disimpan. NIP disamarkan kecuali diminta penuh.

import { samarkanId } from "./penggunaPool";

export type ProfilPegawai = {
  id: number;
  nip_lama: string;
  urutan: number;
  akun_id: number | null;
  nama_lengkap: string;
  nip_baru: string | null;
  jabatan: string | null;
  status_pegawai: string | null;
  jenis_kelamin: string | null;
  tanggal_lahir: string | null;
  tmt: string | null;
  tmt_teks: string | null;
  email: string | null;
  domisili_kecamatan: string | null;
  domisili_nagari: string | null;
  kantor_kecamatan: string | null;
};

export type AkunOrganik = { id: number; nama: string; nip: string | null; aktif: boolean; alamat_kecamatan: string | null; alamat_nagari?: string | null };

export type BarisPegawai = {
  no: number;
  profil_id: number | null;
  akun_id: number | null;
  nama: string;
  dalam_daftar: boolean;
  akun_aktif: boolean | null;
  domisili_kecamatan: string | null;
  domisili_nagari: string | null;
  nip_lama: string | null;
  nip_baru: string | null;
  jabatan: string | null;
  status: string | null;
  jenis_kelamin: "L" | "P" | null;
  tanggal_lahir: string | null;
  /** Tanggal lahir mentah (yyyy-mm-dd); layar menghitung usia dari sini agar ikut bergerak. */
  lahir_iso: string | null;
  usia: number | null;
  tmt_teks: string | null;
  /** TMT mentah (yyyy-mm-dd); layar menghitung masa kerja dari sini agar ikut bergerak. */
  tmt_iso: string | null;
  masa_kerja: number | null;
  email: string | null;
  kantor_kecamatan: string | null;
};

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Tanggal WIB (yyyy-mm-dd) dari epoch ms. */
export function tanggalWib(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Selisih tahun penuh antara tanggal ISO `dari` dan tanggal ISO `sampai`; null bila tanggal tak sah / `dari` setelah `sampai`. */
export function selisihTahun(dari: string | null | undefined, sampai: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(dari ?? "");
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(sampai);
  if (!a || !b) return null;
  let t = Number(b[1]) - Number(a[1]);
  if (Number(b[2]) < Number(a[2]) || (Number(b[2]) === Number(a[2]) && Number(b[3]) < Number(a[3]))) t -= 1;
  return t < 0 ? null : t;
}

export type Durasi = { tahun: number; bulan: number; hari: number };

const urai = (s: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};
const hariDalamBulan = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Selisih kalender tahun-bulan-hari antara dua tanggal ISO; null bila tak sah atau `dari` setelah `sampai`.
 *  Bulan penuh dihitung dari tanggal awal (dipangkas ke akhir bulan bila bulan tujuan lebih pendek), sisanya hari. */
export function durasi(dari: string | null | undefined, sampai: string): Durasi | null {
  const a = urai(dari);
  const b = urai(sampai);
  if (!a || !b) return null;
  let bulanPenuh = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) bulanPenuh -= 1;
  if (bulanPenuh < 0) return null;
  const idx = a.y * 12 + (a.m - 1) + bulanPenuh;
  const ay = Math.floor(idx / 12);
  const am = (idx % 12) + 1;
  const hariAnchor = Math.min(a.d, hariDalamBulan(ay, am));
  const hari = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(ay, am - 1, hariAnchor)) / 86_400_000);
  if (hari < 0) return null;
  return { tahun: Math.floor(bulanPenuh / 12), bulan: bulanPenuh % 12, hari };
}

/** "21 th 10 bln" (dengan hari: "21 th 10 bln 12 hr"). null bila durasi tidak ada. */
export function teksDurasi(d: Durasi | null, denganHari = false): string | null {
  if (!d) return null;
  return `${d.tahun} th ${d.bulan} bln${denganHari ? ` ${d.hari} hr` : ""}`;
}

/** Total bulan penuh (kunci urut). */
export const totalBulan = (d: Durasi | null): number | null => (d ? d.tahun * 12 + d.bulan : null);

/** Buang kode BPS di depan nama wilayah: "(002) SUNGAI NANAM" -> "SUNGAI NANAM". */
export function bersihKodeWilayah(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/^\s*\(\d+\)\s*/, "").trim();
  return t === "" ? null : t;
}

/** "1982-09-28" -> "28 Sep 1982". */
export function tanggalIndo(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const bulan = BULAN[Number(m[2]) - 1];
  return bulan ? `${Number(m[3])} ${bulan} ${m[1]}` : null;
}

const bersih = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Huruf besar semua ("KUBUNG") dan kapitalisasi biasa ("Kubung") dianggap sama; ditampilkan dalam kapitalisasi kata. */
export function kapitalWilayah(s: string | null | undefined): string | null {
  const t = bersih(s);
  return t ? t.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()) : null;
}

export function bentukDaftarPegawai(profil: ProfilPegawai[], akun: AkunOrganik[], nowMs: number, nipPenuh = false): BarisPegawai[] {
  const hariIni = tanggalWib(nowMs);
  const idNip = (v: string | null) => (nipPenuh ? bersih(v) : samarkanId(v));
  const akunPerId = new Map(akun.map((a) => [a.id, a]));
  const akunPerNip = new Map(akun.filter((a) => bersih(a.nip)).map((a) => [String(a.nip).trim(), a]));
  const terpakai = new Set<number>();

  const baris: BarisPegawai[] = [...profil]
    .sort((x, y) => x.urutan - y.urutan || x.nama_lengkap.localeCompare(y.nama_lengkap, "id"))
    .map((p) => {
      const a = (p.akun_id !== null ? akunPerId.get(p.akun_id) : undefined) ?? akunPerNip.get(p.nip_lama);
      if (a) terpakai.add(a.id);
      const jk = p.jenis_kelamin === "L" || p.jenis_kelamin === "P" ? p.jenis_kelamin : null;
      return {
        no: 0,
        profil_id: p.id,
        akun_id: a?.id ?? null,
        nama: p.nama_lengkap,
        dalam_daftar: true,
        akun_aktif: a ? a.aktif : null,
        domisili_kecamatan: kapitalWilayah(p.domisili_kecamatan) ?? kapitalWilayah(a?.alamat_kecamatan),
        domisili_nagari: kapitalWilayah(p.domisili_nagari) ?? kapitalWilayah(a?.alamat_nagari),
        nip_lama: idNip(p.nip_lama),
        nip_baru: idNip(p.nip_baru),
        jabatan: bersih(p.jabatan),
        status: bersih(p.status_pegawai),
        jenis_kelamin: jk,
        tanggal_lahir: tanggalIndo(p.tanggal_lahir),
        lahir_iso: urai(p.tanggal_lahir) ? String(p.tanggal_lahir).slice(0, 10) : null,
        usia: selisihTahun(p.tanggal_lahir, hariIni),
        tmt_teks: bersih(p.tmt_teks) ?? tanggalIndo(p.tmt),
        tmt_iso: urai(p.tmt) ? String(p.tmt).slice(0, 10) : null,
        masa_kerja: selisihTahun(p.tmt, hariIni),
        email: bersih(p.email),
        kantor_kecamatan: kapitalWilayah(p.kantor_kecamatan),
      };
    });

  // Akun organik yang tidak ada di daftar kepegawaian ditaruh di bawah, ditandai
  for (const a of akun.filter((x) => !terpakai.has(x.id)).sort((x, y) => x.nama.localeCompare(y.nama, "id"))) {
    baris.push({
      no: 0, profil_id: null, akun_id: a.id, nama: a.nama, dalam_daftar: false, akun_aktif: a.aktif,
      domisili_kecamatan: kapitalWilayah(a.alamat_kecamatan), domisili_nagari: kapitalWilayah(a.alamat_nagari),
      nip_lama: idNip(a.nip), nip_baru: null, jabatan: null, status: null, jenis_kelamin: null, tanggal_lahir: null, lahir_iso: null, usia: null,
      tmt_teks: null, tmt_iso: null, masa_kerja: null, email: null, kantor_kecamatan: null,
    });
  }
  return baris.map((b, i) => ({ ...b, no: i + 1 }));
}

export type RingkasPegawai = { daftar: number; punya_akun: number; tanpa_akun: number; akun_di_luar_daftar: number; pns: number; pppk: number };

export function ringkasPegawai(baris: BarisPegawai[]): RingkasPegawai {
  const dalam = baris.filter((b) => b.dalam_daftar);
  return {
    daftar: dalam.length,
    punya_akun: dalam.filter((b) => b.akun_id !== null).length,
    tanpa_akun: dalam.filter((b) => b.akun_id === null).length,
    akun_di_luar_daftar: baris.filter((b) => !b.dalam_daftar).length,
    pns: dalam.filter((b) => b.status === "PNS").length,
    pppk: dalam.filter((b) => b.status === "PPPK").length,
  };
}

export type SaringanPegawai = { q?: string; status?: "semua" | "PNS" | "PPPK" | "tanpa_akun" | "luar_daftar" };

export function saringPegawai(baris: BarisPegawai[], f: SaringanPegawai): BarisPegawai[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return baris.filter((b) => {
    if (f.status === "PNS" || f.status === "PPPK") {
      if (b.status !== f.status) return false;
    } else if (f.status === "tanpa_akun") {
      if (!(b.dalam_daftar && b.akun_id === null)) return false;
    } else if (f.status === "luar_daftar") {
      if (b.dalam_daftar) return false;
    }
    if (!q) return true;
    return [b.nama, b.jabatan, b.email, b.domisili_kecamatan, b.domisili_nagari, b.kantor_kecamatan].some((x) => (x ?? "").toLowerCase().includes(q));
  });
}

// ---- Ubah domisili / kecamatan kantor ----

export type UbahProfil = { profil_id: number; domisili_kecamatan: string | null; domisili_nagari: string | null; kantor_kecamatan: string | null; kantor_semua: boolean };
export const MAKS_NAMA_WILAYAH = 60;

/** Teks wilayah: dipangkas, spasi dirapikan; kosong -> null; tanda < > ` dan karakter kendali ditolak. */
export function bersihWilayah(v: unknown): { ok: true; nilai: string | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, nilai: null };
  if (typeof v !== "string") return { ok: false };
  const t = v.replace(/\s+/g, " ").trim();
  if (t === "") return { ok: true, nilai: null };
  if (t.length > MAKS_NAMA_WILAYAH || /[<>`\u0000-\u001f]/.test(t)) return { ok: false };
  return { ok: true, nilai: t };
}

export function periksaUbahProfil(isi: unknown): { ok: true; nilai: UbahProfil } | { ok: false; pesan: string } {
  const o = (isi ?? {}) as Record<string, unknown>;
  const id = Number(o.profil_id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, pesan: "Pegawai tidak sah." };
  const kec = bersihWilayah(o.domisili_kecamatan);
  const nag = bersihWilayah(o.domisili_nagari);
  const kantor = bersihWilayah(o.kantor_kecamatan);
  if (!kec.ok || !nag.ok || !kantor.ok) return { ok: false, pesan: `Nama wilayah maksimal ${MAKS_NAMA_WILAYAH} karakter dan tanpa simbol khusus.` };
  if (nag.nilai && !kec.nilai) return { ok: false, pesan: "Isi kecamatan domisili sebelum nagari." };
  return { ok: true, nilai: { profil_id: id, domisili_kecamatan: kec.nilai, domisili_nagari: nag.nilai, kantor_kecamatan: kantor.nilai, kantor_semua: o.kantor_semua === true } };
}

export type DaftarWilayah = { kecamatan: string[]; nagari: { nagari: string; kecamatan: string }[] };

/** Baris bencana_wilayah -> daftar kecamatan dan nagari unik (kapitalisasi kata), terurut. */
export function susunDaftarWilayah(baris: { kecamatan: string | null; nagari: string | null }[]): DaftarWilayah {
  const kec = new Set<string>();
  const nag = new Map<string, { nagari: string; kecamatan: string }>();
  for (const b of baris) {
    const k = kapitalWilayah(b.kecamatan);
    const n = kapitalWilayah(b.nagari);
    if (k) kec.add(k);
    if (k && n) nag.set(`${k}|${n}`, { nagari: n, kecamatan: k });
  }
  return { kecamatan: [...kec].sort((a, b) => a.localeCompare(b, "id")), nagari: [...nag.values()].sort((a, b) => a.kecamatan.localeCompare(b.kecamatan, "id") || a.nagari.localeCompare(b.nagari, "id")) };
}
