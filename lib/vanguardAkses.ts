// lib/vanguardAkses.ts
//
// (1 Nov 2026) VANGUARD V2a: siapa boleh MENCATAT percobaan Vanguard di sebuah kegiatan. Dua syarat, keduanya dari server:
//   1) Vanguard menyala di kegiatan itu. Penentu, urut: (a) centang manual (`sigap_kegiatan_fitur`, fitur "vanguard"; menang atas yang lain, ya atau tidak);
//      (b) permintaan Identifikasi survei: ada identifikasi bertaut AKTIF ke kegiatan (keu_ident_kegiatan.dilepas_at kosong) yang versi Sah-nya
//          menjawab Ya untuk fungsi tautannya (lib/keu/identifikasi.ts `vanguardUntuk`). Identifikasi dibatalkan atau belum Sah tidak dihitung.
//   2) Akun adalah peserta aktif kegiatan (penugasan aktif, bukan peserta tambahan administrasi).
// Simulasi bebas (tanpa kegiatan) tidak melewati berkas ini sama sekali.

import type { Db } from "@/lib/sigap";
import { PESAN_GERBANG } from "@/lib/gerbangUndangan";
import { periksaGerbang } from "@/lib/sigapPelatihanBaruDb";
import { normalisasi, vanguardUntuk } from "@/lib/keu/identifikasi";
import { vanguardDariAturan, type ButirBelajar } from "@/lib/belajarAturan";

export const KODE_FITUR_VANGUARD = "vanguard";
type Fungsi = "pendataan" | "pelatihan" | "lain";
const FUNGSI_SAH: readonly string[] = ["pendataan", "pelatihan", "lain"];
/** Sama dengan FILTER_BUKAN_ADMINISTRASI di lib/sigapTesDb.ts (sumber boleh kosong, bukan "administrasi"). */
const BUKAN_ADMINISTRASI = "sumber.is.null,sumber.neq.administrasi";

export type KeadaanVanguard = { menyala: boolean; sumber: "aturan" | "centang" | "identifikasi" | "mati"; fungsi: Fungsi | null };
export const MATI: KeadaanVanguard = { menyala: false, sumber: "mati", fungsi: null };

export async function keadaanVanguard(db: Db, kegiatanId: number): Promise<KeadaanVanguard> {
  // (13 Nov 2026, keputusan B) sumber tunggal sigap_belajar_aturan menang bila kegiatan sudah punya aturan; galat (tabel belum ada) = cara lama
  try {
    const { data: aturan, error } = await db.from("sigap_belajar_aturan").select("butir, aktif, batal_at").eq("kegiatan_id", kegiatanId);
    const v = error ? null : vanguardDariAturan((aturan ?? []) as { butir: ButirBelajar; aktif: boolean; batal_at: string | null }[]);
    if (v !== null) return v ? { menyala: true, sumber: "aturan", fungsi: null } : MATI;
  } catch {
    /* tabel belum ada */
  }
  const { data: centang } = await db.from("sigap_kegiatan_fitur").select("aktif").eq("kegiatan_id", kegiatanId).eq("fitur", KODE_FITUR_VANGUARD).maybeSingle();
  if (centang && typeof (centang as { aktif: unknown }).aktif === "boolean") {
    const aktif = (centang as { aktif: boolean }).aktif;
    return aktif ? { menyala: true, sumber: "centang", fungsi: null } : MATI;
  }
  const { data: tautan } = await db.from("keu_ident_kegiatan").select("ident_id, fungsi").eq("kegiatan_id", kegiatanId).is("dilepas_at", null);
  const baris = ((tautan ?? []) as { ident_id: number; fungsi: string }[]).filter((t) => FUNGSI_SAH.includes(t.fungsi));
  for (const t of baris) {
    const { data: ident } = await db.from("keu_ident").select("status, ver").eq("id", t.ident_id).maybeSingle();
    const i = ident as { status: string; ver: number } | null;
    if (!i || i.status === "dibatalkan" || !(i.ver >= 1)) continue;
    const { data: versi } = await db.from("keu_ident_versi").select("form").eq("ident_id", t.ident_id).order("ver", { ascending: false }).limit(1).maybeSingle();
    const form = (versi as { form: unknown } | null)?.form;
    if (form && vanguardUntuk(normalisasi(form), t.fungsi as Fungsi)) return { menyala: true, sumber: "identifikasi", fungsi: t.fungsi as Fungsi };
  }
  return MATI;
}

export async function pesertaAktif(db: Db, akunId: number, kegiatanId: number): Promise<boolean> {
  const { data } = await db.from("sigap_penugasan").select("id").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("aktif", true).or(BUKAN_ADMINISTRASI).maybeSingle();
  return !!data;
}

/** Boleh mencatat = menyala DAN peserta aktif. Alasan penolakan disusun untuk pesan galat. */
export async function bolehMencatat(db: Db, akunId: number, kegiatanId: number): Promise<{ boleh: boolean; alasan: string | null; keadaan: KeadaanVanguard }> {
  const keadaan = await keadaanVanguard(db, kegiatanId);
  if (!keadaan.menyala) return { boleh: false, alasan: "Vanguard belum dinyalakan di kegiatan ini.", keadaan };
  if (!(await pesertaAktif(db, akunId, kegiatanId))) return { boleh: false, alasan: "Anda bukan peserta aktif kegiatan ini.", keadaan };
  // (3 Nov 2026) gerbang undangan pelatihan: Vanguard terbuka setelah undangan diterima
  if ((await periksaGerbang(db, kegiatanId, akunId)) !== "boleh") return { boleh: false, alasan: PESAN_GERBANG, keadaan };
  return { boleh: true, alasan: null, keadaan };
}
