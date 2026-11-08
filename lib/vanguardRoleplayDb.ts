// lib/vanguardRoleplayDb.ts  (server)
//
// (8 Nov 2026) ROLEPLAY BERSAMA KELAS (Vanguard): akses dan pemuatan data. Aturan murni ada di lib/vanguard/roleplay/*.
// ROLEPLAY BARU AKTIF bila dicentang di Kelola Pelatihan (sigap_kegiatan_fitur, fitur "vanguard_roleplay", bawaan MATI) DAN Vanguard menyala untuk pelatihan itu.
// Peran: pengelola (izin pelatihan.kelola = admin dan panitia; semua kelas), instruktur (instruktur kelas; kelasnya saja), peserta (peserta aktif kelasnya; syarat sama dengan Vanguard).

import type { Db } from "@/lib/sigap";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { bolehMencatat, keadaanVanguard } from "@/lib/vanguardAkses";
import { muatPesertaKelas } from "@/lib/sigapKelasKegiatan";
import type { BagianSesi, IsianRoleplay, PesertaIsian } from "@/lib/vanguard/roleplay/penilaian";
import type { LangkahBaris, StatusLangkah, TandaPerLangkah } from "@/lib/vanguard/roleplay/susun";

export const KODE_FITUR_ROLEPLAY = "vanguard_roleplay";

/** Dicentang di Kelola Pelatihan? Tidak ada centang = mati. */
export async function roleplayDicentang(db: Db, kegiatanId: number): Promise<boolean> {
  const { data } = await db.from("sigap_kegiatan_fitur").select("aktif").eq("kegiatan_id", kegiatanId).eq("fitur", KODE_FITUR_ROLEPLAY).maybeSingle();
  return (data as { aktif?: unknown } | null)?.aktif === true;
}

export async function simpanCentangRoleplay(db: Db, kegiatanId: number, aktif: boolean, oleh: string): Promise<boolean> {
  const { error } = await db.from("sigap_kegiatan_fitur").upsert({ kegiatan_id: kegiatanId, fitur: KODE_FITUR_ROLEPLAY, aktif, diubah_oleh: oleh, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,fitur" });
  return !error;
}

export type PeranRoleplay =
  | { peran: "pengelola"; kelas: "semua" }
  | { peran: "instruktur"; kelas: number[] }
  | { peran: "peserta"; kelas: number | null }
  | { peran: null; alasan: string };

/**
 * Peran akun pada roleplay pelatihan ini. Urutan: pengelola > instruktur > peserta. Mengembalikan alasan penolakan bila roleplay tidak aktif atau akun tidak berhak.
 * Peserta harus lolos syarat Vanguard (bolehMencatat: menyala + peserta aktif + undangan diterima).
 */
export async function peranRoleplay(db: Db, akunId: number, kegiatanId: number): Promise<PeranRoleplay> {
  if (!(await roleplayDicentang(db, kegiatanId))) return { peran: null, alasan: "Roleplay belum diaktifkan di pelatihan ini." };
  if (!(await keadaanVanguard(db, kegiatanId)).menyala) return { peran: null, alasan: "Vanguard belum dinyalakan di pelatihan ini." };
  const { izin } = await izinAkun(db, akunId);
  if (boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return { peran: "pengelola", kelas: "semua" };
  const { data: ins } = await db.from("sigap_kuis_instruktur_kelas").select("kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).limit(20);
  const kelasIns = ((ins ?? []) as { kelas: number }[]).map((x) => Number(x.kelas)).filter((n) => Number.isInteger(n));
  if (kelasIns.length > 0) return { peran: "instruktur", kelas: [...new Set(kelasIns)].sort((a, b) => a - b) };
  const izinPeserta = await bolehMencatat(db, akunId, kegiatanId);
  if (!izinPeserta.boleh) return { peran: null, alasan: izinPeserta.alasan ?? "Tidak diizinkan." };
  const { data: pen } = await db.from("sigap_penugasan").select("kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("aktif", true).limit(1).maybeSingle();
  const kelas = (pen as { kelas?: number | null } | null)?.kelas;
  return { peran: "peserta", kelas: kelas == null ? null : Number(kelas) };
}

export type RoleplayBaris = { id: number; kegiatan_id: number; kelas: number; judul: string; status: "berjalan" | "selesai"; dibuat_oleh: number; dibuat_at: string; selesai_at: string | null };

/** Roleplay kelas ini: yang sedang berjalan, bila tidak ada yang terbaru. */
export async function muatRoleplay(db: Db, kegiatanId: number, kelas: number): Promise<RoleplayBaris | null> {
  const { data } = await db.from("sigap_vanguard_roleplay").select("id, kegiatan_id, kelas, judul, status, dibuat_oleh, dibuat_at, selesai_at").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).order("dibuat_at", { ascending: false }).limit(10);
  const baris = (data ?? []) as RoleplayBaris[];
  return baris.find((b) => b.status === "berjalan") ?? baris[0] ?? null;
}

export async function muatLangkah(db: Db, roleplayId: number): Promise<LangkahBaris[]> {
  const { data } = await db.from("sigap_vanguard_roleplay_langkah").select("id, nomor, bagian, dari, sampai, status, diperiksa_at, selesai_at").eq("roleplay_id", roleplayId).order("nomor").limit(200);
  return ((data ?? []) as { id: number; nomor: number; bagian: BagianSesi; dari: number | null; sampai: number | null; status: StatusLangkah; diperiksa_at: string | null; selesai_at: string | null }[]).map((l) => ({ ...l, id: Number(l.id), nomor: Number(l.nomor), dari: l.dari == null ? null : Number(l.dari), sampai: l.sampai == null ? null : Number(l.sampai) }));
}

export async function muatIsian(db: Db, roleplayId: number, akunId: number): Promise<IsianRoleplay | null> {
  const { data } = await db.from("sigap_vanguard_roleplay_isian").select("iv1, nilai").eq("roleplay_id", roleplayId).eq("akun_id", akunId).maybeSingle();
  if (!data) return null;
  const d = data as { iv1: IsianRoleplay["iv1"]; nilai: IsianRoleplay["nilai"] };
  return { iv1: Array.isArray(d.iv1) ? d.iv1 : [], nilai: d.nilai && typeof d.nilai === "object" ? d.nilai : {} };
}

export async function simpanIsian(db: Db, roleplayId: number, akunId: number, isian: IsianRoleplay): Promise<boolean> {
  const { error } = await db.from("sigap_vanguard_roleplay_isian").upsert({ roleplay_id: roleplayId, akun_id: akunId, iv1: isian.iv1 ?? [], nilai: isian.nilai ?? {}, diperbarui_at: new Date().toISOString() }, { onConflict: "roleplay_id,akun_id" });
  return !error;
}

/** Peserta kelas (aktif, bukan peserta tambahan administrasi) beserta isiannya; peserta yang belum menyimpan = isian null. */
export async function muatPesertaDanIsian(db: Db, kegiatanId: number, kelas: number, roleplayId: number): Promise<{ peserta: PesertaIsian[]; nama: Map<number, string> }> {
  const kelasList = (await muatPesertaKelas(db, kegiatanId)).filter((p) => p.kelas === kelas && p.sumber !== "administrasi");
  const nama = new Map(kelasList.map((p) => [p.akun_id, p.nama]));
  const { data } = await db.from("sigap_vanguard_roleplay_isian").select("akun_id, iv1, nilai").eq("roleplay_id", roleplayId).limit(5000);
  const per = new Map(((data ?? []) as { akun_id: number; iv1: IsianRoleplay["iv1"]; nilai: IsianRoleplay["nilai"] }[]).map((r) => [Number(r.akun_id), { iv1: Array.isArray(r.iv1) ? r.iv1 : [], nilai: r.nilai && typeof r.nilai === "object" ? r.nilai : {} } as IsianRoleplay]));
  const akunIds = [...new Set(kelasList.map((p) => p.akun_id))];
  return { peserta: akunIds.map((a) => ({ akun_id: a, isian: per.get(a) ?? null })), nama };
}

export async function muatTanda(db: Db, langkah: readonly LangkahBaris[]): Promise<TandaPerLangkah> {
  const hasil = new Map<number, Map<string, string[]>>();
  if (langkah.length === 0) return hasil;
  const { data } = await db.from("sigap_vanguard_roleplay_tanda").select("langkah_id, kunci, benar").in("langkah_id", langkah.map((l) => l.id)).limit(5000);
  for (const r of (data ?? []) as { langkah_id: number; kunci: string; benar: unknown }[]) {
    const per = hasil.get(Number(r.langkah_id)) ?? new Map<string, string[]>();
    per.set(r.kunci, Array.isArray(r.benar) ? (r.benar as unknown[]).filter((x): x is string => typeof x === "string") : []);
    hasil.set(Number(r.langkah_id), per);
  }
  return hasil;
}

export async function simpanTanda(db: Db, langkahId: number, kunci: string, benar: readonly string[], oleh: number): Promise<boolean> {
  const { error } = await db.from("sigap_vanguard_roleplay_tanda").upsert({ langkah_id: langkahId, kunci, benar: [...benar], oleh, waktu: new Date().toISOString() }, { onConflict: "langkah_id,kunci" });
  return !error;
}
