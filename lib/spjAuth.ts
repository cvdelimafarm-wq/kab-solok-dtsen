// lib/spjAuth.ts
//
// Helper sesi KHUSUS menu "Administrasi / SPJ Translok" -- dipakai SEMUA
// route di app/api/penyisiran/spj/*. Menu ini SENGAJA TIDAK bikin akun/role
// baru: login-nya menumpang PERSIS token & tabel akun yang sudah ada di
// dua tab lain (PPL TIDAK ikut, sesuai keputusan -- SPJ translok cuma
// relevan utk yang benar2 turun lapangan & dapat honor transport):
//  - role "identifikasi_jorong" -> tabel petugas_penyisiran_akun (subject
//    token = petugas_penyisiran_akun.id)
//  - role "identifikasi_tetangga" -> tabel tetangga_akun (subject token =
//    tetangga_akun.id)
//
// Semua tabel spj_* (lihat migrasi 20260918_spj_translok.sql) menyimpan
// pasangan (petugas_jenis, petugas_id) alih-alih FK asli, krn petugas_id
// bisa merujuk salah satu dari DUA tabel sumber tergantung petugas_jenis
// -- fungsi verifySpjSession() di bawah yang menerjemahkan role token jadi
// pasangan itu, supaya logikanya tidak perlu diulang di tiap route.

import { verifySession, getSessionSubject } from "./penyisiranAuth";
import { bolehAksesManajemenTarget } from "./manajemenTargetAkses";

export type SpjPetugasJenis = "penyisiran" | "tetangga";

const ROLE_KE_JENIS: Record<string, SpjPetugasJenis> = {
  identifikasi_jorong: "penyisiran",
  identifikasi_tetangga: "tetangga",
};

// Token berformat "role.subjectB64.exp.sig" -- bagian pertama selalu nama
// role. Tidak perlu fungsi baru di lib/penyisiranAuth.ts cuma utk ini
// (pola yg sama jg dipakai di app/api/penyisiran/jorong-top/route.ts).
function ambilRoleToken(token: string): string {
  return token.split(".")[0] || "";
}

export interface SpjSession {
  jenis: SpjPetugasJenis;
  petugasId: string;
}

/**
 * Validasi token utk menu SPJ Translok (role identifikasi_jorong ATAU
 * identifikasi_tetangga) DAN uraikan jadi (jenis, petugasId) siap pakai ke
 * kolom petugas_jenis/petugas_id di tabel spj_*. null kalau token tidak
 * valid/kedaluwarsa/bukan salah satu dari dua role itu.
 */
export function verifySpjSession(token: string | null | undefined): SpjSession | null {
  if (!verifySession(token, ["identifikasi_jorong", "identifikasi_tetangga"])) return null;
  const jenis = ROLE_KE_JENIS[ambilRoleToken(token as string)];
  if (!jenis) return null;
  const petugasId = getSessionSubject(token);
  if (!petugasId) return null;
  return { jenis, petugasId };
}

// Nama tabel akun sesuai jenis -- dipakai route yang perlu JOIN manual ke
// tabel sumber (mis. ambil nama/NIP petugas), krn petugas_id bukan FK asli.
export function tabelAkun(jenis: SpjPetugasJenis): "petugas_penyisiran_akun" | "tetangga_akun" {
  return jenis === "penyisiran" ? "petugas_penyisiran_akun" : "tetangga_akun";
}

/**
 * Cek tambahan utk aksi yang cuma boleh PENGELOLA (mis. upload Surat
 * Tugas): sesi SPJ valid (lihat verifySpjSession) DITAMBAH nama akun yg
 * login termasuk allow-list Manajemen Target (lib/manajemenTargetAkses.ts)
 * -- SAMA PERSIS pola pastikanPengelola() di
 * app/api/penyisiran/target/route.ts. Ke-4 nama pengelola itu memang
 * sudah terdaftar di petugas_penyisiran_akun (dipakai jg utk login
 * Manajemen Target/Penyisiran Usaha), jadi bisa login ke sini lewat role
 * "identifikasi_jorong" spt petugas biasa lainnya.
 *
 * supabase diketik "any" (bukan ReturnType<typeof createClient>) --
 * lihat catatan yang sama di app/api/penyisiran/target/route.ts kenapa.
 */
export async function pastikanPengelolaSpj(session: SpjSession, supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from(tabelAkun(session.jenis))
    .select("nama")
    .eq("id", session.petugasId)
    .maybeSingle();
  const nama = data?.nama ?? null;
  if (!bolehAksesManajemenTarget(nama)) return null;
  return nama as string;
}
