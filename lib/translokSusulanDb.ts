// lib/translokSusulanDb.ts  (hanya server)
//
// (3 Nov 2026) Data & kewenangan "Ajukan susulan" translok. Tabel: sigap_translok_susulan (SQL 20261103c). Rantai atasan memakai fungsi yang sama dengan blokir
// (lib/translokBlokirDb.ts). Pembacaan toleran bila tabel belum dibuat: dianggap tidak ada pengajuan (aplikasi lama tetap jalan sampai SQL dijalankan).
//
// Menyetujui = (1) mengklaim pengajuan (status diajukan -> disetujui, atomik lewat kondisi status), (2) membuat hari kerja bila belum ada, (3) membuat izin susulan
// 24 jam. Bila langkah 2 atau 3 gagal, langkah sebelumnya dibatalkan dan pengajuan dikembalikan ke "diajukan".

import { HK_AKTIF, hariIniWib, hariLengkap, translokDiblokir, type Db, type Penugasan } from "@/lib/sigap";
import { adminTranslok, akunSupervisor, petaAtasanAkun } from "@/lib/translokBlokirDb";
import { rantaiAtasan } from "@/lib/translokBlokir";
import {
  KOLOM_SUSULAN, bolehMemutuskanSusulan, cekPengajuan, izinSampaiIso, penyetujuDuaLevel, susunLevel, tanggalKandidat,
  type BarisSusulan, type FaktaPengajuan, type HasilPengajuan,
} from "@/lib/translokSusulan";

/** Akun berperan tertentu (kode peran persis) pada lingkup kegiatan itu atau semua kegiatan. */
export async function akunBerperan(db: Db, kegiatanId: number, kodePeran: string): Promise<number[]> {
  const { data: pr } = await db.from("sigap_peran").select("id").eq("kode", kodePeran);
  const ids = (pr ?? []).map((p) => p.id as number);
  if (!ids.length) return [];
  const { data } = await db.from("sigap_akun_peran").select("akun_id, kegiatan_id").in("peran_id", ids);
  return [...new Set((data ?? []).filter((x) => x.kegiatan_id == null || x.kegiatan_id === kegiatanId).map((x) => x.akun_id as number))];
}

/** Pembuat fungsi "penyetuju sebuah akun": peta atasan, Supervisor, dan PJ dibaca SEKALI per kegiatan. */
export async function pembuatPenyetuju(db: Db, kegiatanId: number): Promise<(akunId: number) => { levels: number[][]; penyetuju: number[] }> {
  const [peta, sup, pj] = await Promise.all([petaAtasanAkun(db, kegiatanId), akunSupervisor(db, kegiatanId), akunBerperan(db, kegiatanId, "pj_kegiatan")]);
  return (akunId: number) => {
    const levels = susunLevel(rantaiAtasan(akunId, peta), sup, pj, akunId);
    return { levels, penyetuju: penyetujuDuaLevel(levels) };
  };
}

async function bacaTerbuka(db: Db, penugasanId: number, tanggal: string[]): Promise<Set<string>> {
  if (!tanggal.length) return new Set();
  const { data, error } = await db.from("sigap_translok_susulan").select("tanggal").eq("penugasan_id", penugasanId).eq("status", "diajukan").in("tanggal", tanggal);
  return error ? new Set() : new Set((data ?? []).map((x) => x.tanggal as string));
}

/** Fakta untuk menilai pengajuan pada beberapa tanggal sekaligus (satu putaran kueri). `abaikanTerbuka`: saat menyetujui, pengajuan itu sendiri tidak dihitung sebagai "masih terbuka". */
export async function muatFakta(db: Db, akunId: number, pen: Penugasan, tanggal: string[], opsi: { abaikanTerbuka?: boolean } = {}): Promise<Map<string, FaktaPengajuan>> {
  const hasil = new Map<string, FaktaPengajuan>();
  if (!tanggal.length) return hasil;
  const hariIni = hariIniWib();
  const sekarang = new Date().toISOString();
  const [hk, jumlah, real, foto, izin, terbuka, diblokir] = await Promise.all([
    db.from("sigap_hari_kerja").select("penugasan_id, tanggal").eq("akun_id", akunId).in("tanggal", tanggal).or(HK_AKTIF()),
    db.from("sigap_hari_kerja").select("id", { count: "exact", head: true }).eq("penugasan_id", pen.id).is("uji_coba_sampai", null),
    db.from("sigap_realisasi").select("tanggal").eq("penugasan_id", pen.id).in("tanggal", tanggal),
    db.from("sigap_dokumentasi").select("tanggal").eq("penugasan_id", pen.id).in("tanggal", tanggal),
    db.from("sigap_izin_susulan").select("tanggal").eq("penugasan_id", pen.id).in("tanggal", tanggal).gt("berlaku_sampai", sekarang),
    opsi.abaikanTerbuka ? Promise.resolve(new Set<string>()) : bacaTerbuka(db, pen.id, tanggal),
    translokDiblokir(db, pen.kegiatan.id, akunId),
  ]);
  const hkSini = new Set((hk.data ?? []).filter((x) => x.penugasan_id === pen.id).map((x) => x.tanggal as string));
  const hkLain = new Set((hk.data ?? []).filter((x) => x.penugasan_id !== pen.id).map((x) => x.tanggal as string));
  const adaReal = new Set((real.data ?? []).map((x) => x.tanggal as string));
  const nFoto = new Map<string, number>();
  for (const f of foto.data ?? []) nFoto.set(f.tanggal as string, (nFoto.get(f.tanggal as string) ?? 0) + 1);
  const izinAktif = new Set((izin.data ?? []).map((x) => x.tanggal as string));
  for (const t of tanggal) {
    hasil.set(t, {
      tanggal: t,
      hariIni,
      periode: pen.periode,
      jenisKegiatan: pen.kegiatan.jenis ?? null,
      dikunci: !!pen.dikunci_at,
      arsip: pen.status_periode === "arsip",
      diblokir,
      adaHariKerja: hkSini.has(t),
      dipakaiKegiatanLain: hkLain.has(t),
      jumlahHariKerjaAktif: jumlah.count ?? 0,
      maksHari: pen.maks_hari,
      lengkap: hariLengkap(adaReal.has(t), nFoto.get(t) ?? 0, pen.kegiatan),
      izinAktif: izinAktif.has(t),
      pengajuanTerbuka: terbuka.has(t),
    });
  }
  return hasil;
}

export type Kandidat = { tanggal: string; ok: boolean; mode?: "tambah" | "lengkapi"; pesan?: string };

/** Tanggal lampau pada periode penugasan beserta bisa/tidaknya diajukan (aturan yang sama dengan POST ajukan). */
export async function kandidatSusulan(db: Db, akunId: number, pen: Penugasan): Promise<Kandidat[]> {
  const tanggal = tanggalKandidat(pen.periode, hariIniWib());
  const fakta = await muatFakta(db, akunId, pen, tanggal);
  return tanggal.map((t) => {
    const h: HasilPengajuan = cekPengajuan(fakta.get(t) as FaktaPengajuan);
    return h.ok ? { tanggal: t, ok: true, mode: h.mode } : { tanggal: t, ok: false, pesan: h.pesan };
  });
}

/** Pengajuan milik akun (terbaru dulu). Tabel belum ada -> kosong. */
export async function susulanSaya(db: Db, akunId: number, kegiatanId: number, batas = 15): Promise<BarisSusulan[]> {
  const { data, error } = await db.from("sigap_translok_susulan").select(KOLOM_SUSULAN).eq("akun_id", akunId).eq("kegiatan_id", kegiatanId).order("diajukan_at", { ascending: false }).limit(batas);
  return error ? [] : ((data ?? []) as BarisSusulan[]);
}

export type MasukTampil = BarisSusulan & { nama: string; peran: string | null };

/** Pengajuan yang menunggu keputusan `aktorId` (dua tingkat atasan terdekat pengaju, atau admin translok). */
export async function susulanMasuk(db: Db, aktorId: number, kegiatanId: number): Promise<MasukTampil[]> {
  const { data, error } = await db.from("sigap_translok_susulan").select(KOLOM_SUSULAN).eq("kegiatan_id", kegiatanId).eq("status", "diajukan").order("diajukan_at", { ascending: true }).limit(500);
  if (error || !data?.length) return [];
  const baris = data as BarisSusulan[];
  const [adm, penyetujuDari] = await Promise.all([adminTranslok(db, aktorId, kegiatanId), pembuatPenyetuju(db, kegiatanId)]);
  const sah = baris.filter((b) => bolehMemutuskanSusulan(penyetujuDari(b.akun_id).penyetuju, aktorId, b.akun_id, adm));
  if (!sah.length) return [];
  const akunIds = [...new Set(sah.map((b) => b.akun_id))];
  const penIds = [...new Set(sah.map((b) => b.penugasan_id))];
  const [{ data: ak }, { data: pen }] = await Promise.all([
    db.from("sigap_akun").select("id, nama").in("id", akunIds),
    db.from("sigap_penugasan").select("id, peran").in("id", penIds),
  ]);
  const nama = new Map((ak ?? []).map((a) => [a.id as number, a.nama as string]));
  const peran = new Map((pen ?? []).map((p) => [p.id as number, p.peran as string]));
  return sah.map((b) => ({ ...b, nama: nama.get(b.akun_id) ?? `Akun ${b.akun_id}`, peran: peran.get(b.penugasan_id) ?? null }));
}

export async function ambilSusulan(db: Db, id: number): Promise<BarisSusulan | null> {
  const { data, error } = await db.from("sigap_translok_susulan").select(KOLOM_SUSULAN).eq("id", id).maybeSingle();
  return error || !data ? null : (data as BarisSusulan);
}

export async function bolehMemutuskan(db: Db, aktorId: number, b: Pick<BarisSusulan, "akun_id" | "kegiatan_id">): Promise<boolean> {
  if (aktorId === b.akun_id) return false;
  const [adm, penyetujuDari] = await Promise.all([adminTranslok(db, aktorId, b.kegiatan_id), pembuatPenyetuju(db, b.kegiatan_id)]);
  return bolehMemutuskanSusulan(penyetujuDari(b.akun_id).penyetuju, aktorId, b.akun_id, adm);
}

/** Akun yang diberi tahu saat ada pengajuan: dua tingkat atasan terdekat (admin tidak dibanjiri notifikasi). */
export async function penerimaPengajuan(db: Db, akunId: number, kegiatanId: number): Promise<number[]> {
  const penyetujuDari = await pembuatPenyetuju(db, kegiatanId);
  return penyetujuDari(akunId).penyetuju;
}

export type HasilSetuju = { ok: true; izin_sampai: string; mode: "tambah" | "lengkapi" } | { ok: false; pesan: string; status: number };

/** Menyetujui pengajuan: klaim -> hari kerja (bila perlu) -> izin 24 jam. Gagal di tengah = dibatalkan dan pengajuan kembali "diajukan". */
export async function setujuiSusulan(db: Db, row: BarisSusulan, aktor: { id: number; nama: string }, catatan: string, pen: Penugasan): Promise<HasilSetuju> {
  const fakta = (await muatFakta(db, row.akun_id, pen, [row.tanggal], { abaikanTerbuka: true })).get(row.tanggal) as FaktaPengajuan;
  const cek = cekPengajuan(fakta);
  if (!cek.ok) return { ok: false, pesan: cek.pesan, status: 409 };

  const sekarangIso = new Date().toISOString();
  const izinSampai = izinSampaiIso(Date.now());
  const { data: klaim, error: eKlaim } = await db
    .from("sigap_translok_susulan")
    .update({ status: "disetujui", mode: cek.mode, keputusan_oleh: aktor.nama, keputusan_akun_id: aktor.id, keputusan_at: sekarangIso, keputusan_catatan: catatan || null, izin_sampai: izinSampai })
    .eq("id", row.id)
    .eq("status", "diajukan")
    .select("id")
    .maybeSingle();
  if (eKlaim) return { ok: false, pesan: "Gagal menyimpan keputusan. Coba lagi.", status: 500 };
  if (!klaim) return { ok: false, pesan: "Pengajuan ini sudah diputuskan. Muat ulang halaman.", status: 409 };

  const kembalikan = async () => {
    await db.from("sigap_translok_susulan").update({ status: "diajukan", mode: null, keputusan_oleh: null, keputusan_akun_id: null, keputusan_at: null, keputusan_catatan: null, izin_sampai: null }).eq("id", row.id);
  };

  let hkId: number | null = null;
  if (cek.mode === "tambah") {
    const { data: hk, error: eHk } = await db.from("sigap_hari_kerja").insert({ penugasan_id: row.penugasan_id, akun_id: row.akun_id, tanggal: row.tanggal }).select("id").maybeSingle();
    if (eHk || !hk) {
      await kembalikan();
      return { ok: false, pesan: "Hari kerja tidak dapat dibuat (mungkin tanggal itu baru dipakai kegiatan lain). Pengajuan tetap menunggu.", status: 409 };
    }
    hkId = hk.id as number;
    await db.from("sigap_hari_kerja_riwayat").insert({ penugasan_id: row.penugasan_id, tanggal: row.tanggal, aksi: "tambah", oleh: `susulan disetujui ${aktor.nama}`, alasan: row.alasan.slice(0, 300), akun_id: row.akun_id });
  }

  const { error: eIzin } = await db.from("sigap_izin_susulan").insert({
    penugasan_id: row.penugasan_id,
    kegiatan_id: row.kegiatan_id,
    tanggal: row.tanggal,
    alasan: `Susulan disetujui ${aktor.nama}: ${row.alasan}`.slice(0, 500),
    diberikan_oleh: `${aktor.nama} (persetujuan susulan)`,
    diberikan_at: sekarangIso,
    berlaku_sampai: izinSampai,
  });
  if (eIzin) {
    if (hkId !== null) await db.from("sigap_hari_kerja").delete().eq("id", hkId);
    await kembalikan();
    return { ok: false, pesan: "Izin susulan tidak dapat dibuat. Pengajuan tetap menunggu; coba lagi.", status: 500 };
  }
  return { ok: true, izin_sampai: izinSampai, mode: cek.mode };
}
