// lib/portal/pendataan.ts  (hanya server)
//
// (11 Okt 2026) Pendataan keroyokan PPL/PML -- permintaan user (rancangan: claude/rancangan-pendataan-keroyokan.md di Project).
// - Tim = satu PML + semua PPL di bawahnya (bencana_petugas.atasan_id). Sub SLS tim = bencana_alokasi_subsls dengan pml_id PML itu.
// - Seluruh anggota tim melihat SEMUA KK di Sub SLS timnya (keroyokan) dan boleh menandai hasil; pelaku tercatat di log.
// - Penulisan hanya lewat fungsi database bencana_pendataan_catat (idempoten, tahan data offline, hasil terakhir menurut waktu kejadian).
// - Admin (izin bencana.admin) mengunggah daftar KK; pembatalan unggahan bersifat lunak (aktif = false), tidak menghapus.

import type { Db } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { MAKS_BARIS_UNGGAH, kunciBaris, periksaBarisKk, type Anggota, type BarisKk, type BarisRingkas, type IsiCatat, type KkLembar, type SubTim } from "@/lib/pendataan";

type AkunMin = { id: number; petugas_bencana_id: number | null };

export type Tim = { pml: { id: number; nama: string }; saya: { akun_id: number; peran: "pml" | "ppl" }; anggota: Anggota[]; sub: SubTim[] };

/** Susun tim akun ini. null = bukan anggota tim pendataan (bukan PML/PPL aktif). */
export async function ambilTim(db: Db, akun: AkunMin): Promise<Tim | null> {
  if (!akun.petugas_bencana_id) return null;
  const { data: saya } = await db.from("bencana_petugas").select("id, nama, peran, atasan_id, aktif").eq("id", akun.petugas_bencana_id).maybeSingle();
  if (!saya || saya.aktif === false || (saya.peran !== "pml" && saya.peran !== "ppl")) return null;
  const pmlId = (saya.peran === "pml" ? saya.id : saya.atasan_id) as number | null;
  if (!pmlId) return null;

  const { data: petugas } = await db.from("bencana_petugas").select("id, nama, peran, aktif").or(`id.eq.${pmlId},atasan_id.eq.${pmlId}`).eq("aktif", true);
  const daftar = (petugas ?? []) as { id: number; nama: string; peran: string }[];
  const pml = daftar.find((p) => p.id === pmlId);
  if (!pml) return null;
  const { data: akunTim } = await db.from("sigap_akun").select("id, petugas_bencana_id, aktif").in("petugas_bencana_id", daftar.map((p) => p.id)).eq("aktif", true);
  const akunPer = new Map<number, number>();
  for (const a of akunTim ?? []) if (a.petugas_bencana_id != null && !akunPer.has(a.petugas_bencana_id as number)) akunPer.set(a.petugas_bencana_id as number, a.id as number);

  // urutan warna stabil: PPL menurut nama, PML terakhir
  const ppl = daftar.filter((p) => p.peran === "ppl").sort((a, b) => a.nama.localeCompare(b.nama));
  const urut = [...ppl, pml];
  const anggota: Anggota[] = [];
  urut.forEach((p, i) => {
    const aid = akunPer.get(p.id);
    if (aid) anggota.push({ akun_id: aid, nama: p.nama, peran: p.peran === "pml" ? "pml" : "ppl", indeks: i });
  });
  // akun yang sedang masuk selalu ada di daftar (mis. akun ganda untuk satu petugas)
  if (!anggota.some((a) => a.akun_id === akun.id)) anggota.push({ akun_id: akun.id, nama: saya.nama as string, peran: saya.peran === "pml" ? "pml" : "ppl", indeks: urut.findIndex((p) => p.id === saya.id) });

  const { data: alok } = await db.from("bencana_alokasi_subsls").select("idsubsls").eq("pml_id", pmlId);
  const ids = Array.from(new Set((alok ?? []).map((x) => x.idsubsls as string)));
  const sub: SubTim[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: w } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").in("idsubsls", ids.slice(i, i + 200));
    for (const r of w ?? []) sub.push(r as SubTim);
  }
  sub.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.sls.localeCompare(b.sls) || a.sub_sls.localeCompare(b.sub_sls));

  return { pml: { id: pmlId, nama: pml.nama }, saya: { akun_id: akun.id, peran: saya.peran === "pml" ? "pml" : "ppl" }, anggota, sub };
}

export async function ringkasTim(db: Db, pmlId: number): Promise<BarisRingkas[]> {
  const { data, error } = await db.rpc("bencana_pendataan_ringkas", { p_pml: pmlId });
  if (error) throw new Error(error.message);
  return (data ?? []) as BarisRingkas[];
}

/** Semua KK aktif satu Sub SLS (paging 1000). Pemanggil sudah memastikan Sub SLS milik tim. */
export async function daftarKk(db: Db, idsubsls: string): Promise<KkLembar[]> {
  const out: KkLembar[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await db
      .from("bencana_pendataan_kk")
      .select("id, no_urut, nama_kk, anggota_lain, patokan, lat, lng, hasil, alasan, ppl_akun_id, status_at")
      .eq("idsubsls", idsubsls)
      .eq("aktif", true)
      .order("nama_kk", { ascending: true })
      .order("id", { ascending: true })
      .range(dari, dari + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as KkLembar[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type HasilCatatDb = { status: "tercatat" | "duplikat" | "ditolak"; terkini?: boolean; alasan?: string };
const PESAN_TOLAK: Record<string, string> = {
  hasil_tidak_dikenal: "Hasil pendataan tidak dikenal.",
  kk_tidak_ada: "KK tidak ditemukan (mungkin unggahan sudah dibatalkan admin).",
  bukan_wilayah_tim: "KK ini bukan di wilayah tim Anda.",
};

export async function catatHasil(db: Db, akunId: number, c: IsiCatat): Promise<{ ok: true; terkini: boolean; duplikat: boolean } | { ok: false; pesan: string }> {
  const { data, error } = await db.rpc("bencana_pendataan_catat", {
    p_akun: akunId,
    p_kk: c.kk_id,
    p_hasil: c.hasil,
    p_alasan: c.alasan,
    p_waktu: c.waktu,
    p_kunci: c.kunci,
    p_pos_lat: c.pos?.lat ?? null,
    p_pos_lng: c.pos?.lng ?? null,
    p_pos_akurasi: c.pos?.akurasi ?? null,
  });
  if (error) throw new Error(error.message);
  const r = data as HasilCatatDb;
  if (r.status === "ditolak") return { ok: false, pesan: PESAN_TOLAK[r.alasan ?? ""] ?? "Ditolak." };
  return { ok: true, terkini: r.status === "tercatat" ? r.terkini === true : false, duplikat: r.status === "duplikat" };
}

/**
 * (11 Okt 2026) Ringkasan untuk modul "Lembar Pendataan KK" di tahap Pendataan: jumlah KK aktif tim, yang sudah didata, dan yang terdampak.
 * Tim = PML + PPL di bawahnya (pml = diri sendiri bila PML, atasan bila PPL). null = bukan PML/PPL, atau tim belum punya daftar KK (modul tidak tampil).
 * Gagal = null supaya Layer 2 tidak ikut rusak.
 */
export async function ringkasModulPendataan(db: Db, petugasId: number): Promise<{ total: number; didata: number; terdampak: number } | null> {
  try {
    const { data: p } = await db.from("bencana_petugas").select("id, peran, atasan_id, aktif").eq("id", petugasId).maybeSingle();
    if (!p || p.aktif === false || (p.peran !== "pml" && p.peran !== "ppl")) return null;
    const pmlId = (p.peran === "pml" ? p.id : p.atasan_id) as number | null;
    if (!pmlId) return null;
    const baris = await ringkasTim(db, pmlId);
    let total = 0, didata = 0, terdampak = 0;
    for (const b of baris) {
      total += b.jumlah;
      if (b.hasil !== null) didata += b.jumlah;
      if (b.hasil === "terdampak") terdampak += b.jumlah;
    }
    return total > 0 ? { total, didata, terdampak } : null;
  } catch {
    return null;
  }
}

/** Tim akun ini sudah punya daftar KK (diunggah admin)? Dipakai Beranda untuk menampilkan kartu Lembar Pendataan. Gagal = anggap belum ada (kartu tidak tampil). */
export async function adaDaftarKkTim(db: Db, akunId: number): Promise<boolean> {
  try {
    const { data: ids, error } = await db.rpc("bencana_pendataan_subsls_akun", { p_akun: akunId });
    if (error || !Array.isArray(ids) || ids.length === 0) return false;
    const { data } = await db.from("bencana_pendataan_kk").select("id").in("idsubsls", ids as string[]).eq("aktif", true).limit(1);
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/** Sub SLS ini milik tim akun? (lewat fungsi database yang sama dengan pencatatan) */
export async function subMilikAkun(db: Db, akunId: number, idsubsls: string): Promise<boolean> {
  const { data, error } = await db.rpc("bencana_pendataan_subsls_akun", { p_akun: akunId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as string[]).includes(idsubsls);
}

// ------------------------------------------------------------------ unggah (admin)
export type TolakBaris = { no: number; pesan: string };

export async function kegiatanAda(db: Db, id: number): Promise<boolean> {
  const { data } = await db.from("sigap_kegiatan").select("id").eq("id", id).maybeSingle();
  return !!data;
}

export async function mulaiUnggah(db: Db, akunId: number, kegiatanId: number, namaBerkas: string): Promise<number> {
  const { data, error } = await db
    .from("bencana_pendataan_batch")
    .insert({ kegiatan_id: kegiatanId, nama_berkas: namaBerkas.slice(0, 200) || null, diunggah_oleh_akun: akunId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function batchAktif(db: Db, batchId: number): Promise<{ id: number; kegiatan_id: number; dibatalkan_at: string | null } | null> {
  const { data } = await db.from("bencana_pendataan_batch").select("id, kegiatan_id, dibatalkan_at").eq("id", batchId).maybeSingle();
  return (data as { id: number; kegiatan_id: number; dibatalkan_at: string | null } | null) ?? null;
}

/** Sub SLS sampel = daftar awal di master wilayah (keputusan user 11 Okt 2026: 636 Sub SLS). */
export async function daftarSampel(db: Db): Promise<string[]> {
  const out: string[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await db.from("bencana_wilayah").select("idsubsls").eq("daftar_awal", true).order("idsubsls").range(dari, dari + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => r.idsubsls as string));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Ada = { id: number; idsubsls: string; sumber_id: string; nama_kk: string; anggota_lain: string | null; patokan: string | null; lat: number | null; lng: number | null; no_urut: number | null; keberadaan_awal: number | null };

/**
 * Terima sekelompok baris (maks MAKS_BARIS_UNGGAH). Baris bermasalah dilaporkan, yang lain tetap masuk. `no` = nomor baris di berkas.
 * - Hanya Sub SLS sampel (daftar awal) yang diterima.
 * - Baris ber-`sumber_id` (ekspor FASIH-SM): unggah ulang MEMPERBARUI KK yang sama (nama, anggota, alamat, koordinat) tanpa menyentuh hasil pendataan;
 *   bila Sub SLS-nya berbeda dari yang sudah tersimpan, ditolak (batalkan unggahan lama dulu).
 * - Baris tanpa `sumber_id` (templat Excel): baris identik yang sudah ada dilewati.
 */
export async function terimaBaris(
  db: Db,
  kegiatanId: number,
  batchId: number,
  baris: { no: number; data: Record<string, unknown> }[]
): Promise<{ diterima: number; diperbarui: number; sama: number; ditolak: TolakBaris[] }> {
  if (baris.length > MAKS_BARIS_UNGGAH) throw new Error(`Maksimal ${MAKS_BARIS_UNGGAH} baris per kiriman.`);
  const ditolak: TolakBaris[] = [];
  const sah: { no: number; b: BarisKk }[] = [];
  const dilihat = new Set<string>();
  for (const x of baris) {
    const r = periksaBarisKk(x.data);
    if (!r.ok) {
      ditolak.push({ no: x.no, pesan: r.pesan });
      continue;
    }
    if (r.baris.sumber_id) {
      if (dilihat.has(r.baris.sumber_id)) {
        ditolak.push({ no: x.no, pesan: "ID penugasan kembar di berkas ini." });
        continue;
      }
      dilihat.add(r.baris.sumber_id);
    }
    sah.push({ no: x.no, b: r.baris });
  }
  if (sah.length === 0) return { diterima: 0, diperbarui: 0, sama: 0, ditolak };

  // kode Sub SLS harus ada di master wilayah DAN termasuk sampel (daftar awal)
  const kode = Array.from(new Set(sah.map((x) => x.b.idsubsls)));
  const status = new Map<string, boolean>();
  for (let i = 0; i < kode.length; i += 200) {
    const { data } = await db.from("bencana_wilayah").select("idsubsls, daftar_awal").in("idsubsls", kode.slice(i, i + 200));
    for (const r of data ?? []) status.set(r.idsubsls as string, r.daftar_awal === true);
  }

  // KK ber-sumber_id yang sudah ada (aktif) pada kegiatan ini
  const sumberIds = sah.map((x) => x.b.sumber_id).filter((x): x is string => !!x);
  const adaSumber = new Map<string, Ada>();
  for (let i = 0; i < sumberIds.length; i += 200) {
    const { data, error } = await db
      .from("bencana_pendataan_kk")
      .select("id, idsubsls, sumber_id, nama_kk, anggota_lain, patokan, lat, lng, no_urut, keberadaan_awal")
      .eq("kegiatan_id", kegiatanId)
      .eq("aktif", true)
      .in("sumber_id", sumberIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Ada[]) adaSumber.set(r.sumber_id, r);
  }

  // cegah ganda untuk baris tanpa sumber_id (templat): baris identik yang sudah ada
  const adaKunci = new Set<string>();
  const subTanpaSumber = Array.from(new Set(sah.filter((x) => !x.b.sumber_id && status.get(x.b.idsubsls)).map((x) => x.b.idsubsls)));
  for (const sub of subTanpaSumber) {
    for (let dari = 0; ; dari += 1000) {
      const { data } = await db
        .from("bencana_pendataan_kk")
        .select("idsubsls, nama_kk, anggota_lain, lat, lng")
        .eq("kegiatan_id", kegiatanId)
        .eq("idsubsls", sub)
        .eq("aktif", true)
        .is("sumber_id", null)
        .range(dari, dari + 999);
      for (const r of data ?? []) adaKunci.add(kunciBaris(r as BarisKk));
      if (!data || data.length < 1000) break;
    }
  }

  const masuk: Record<string, unknown>[] = [];
  const ubah: { id: number; isi: Record<string, unknown> }[] = [];
  let sama = 0;
  for (const x of sah) {
    const sampel = status.get(x.b.idsubsls);
    if (sampel === undefined) {
      ditolak.push({ no: x.no, pesan: "Kode Sub SLS tidak ada di master wilayah." });
      continue;
    }
    if (!sampel) {
      ditolak.push({ no: x.no, pesan: "Bukan Sub SLS sampel (tidak masuk daftar awal)." });
      continue;
    }
    const lama = x.b.sumber_id ? adaSumber.get(x.b.sumber_id) : undefined;
    if (lama) {
      if (lama.idsubsls !== x.b.idsubsls) {
        ditolak.push({ no: x.no, pesan: "ID penugasan sudah tersimpan di Sub SLS lain. Batalkan unggahan lama dulu bila datanya memang pindah." });
        continue;
      }
      const baru = { nama_kk: x.b.nama_kk, anggota_lain: x.b.anggota_lain, patokan: x.b.patokan, lat: x.b.lat, lng: x.b.lng, no_urut: x.b.no_urut ?? null, keberadaan_awal: x.b.keberadaan_awal ?? null };
      const beda = (Object.keys(baru) as (keyof typeof baru)[]).some((k) => (lama[k] ?? null) !== (baru[k] ?? null));
      if (beda) ubah.push({ id: lama.id, isi: baru });
      else sama++;
      continue;
    }
    if (!x.b.sumber_id) {
      const k = kunciBaris(x.b);
      if (adaKunci.has(k)) {
        ditolak.push({ no: x.no, pesan: "Sudah ada (nama, anggota, dan koordinat sama persis di Sub SLS itu)." });
        continue;
      }
      adaKunci.add(k);
    }
    masuk.push({
      kegiatan_id: kegiatanId,
      batch_id: batchId,
      idsubsls: x.b.idsubsls,
      nama_kk: x.b.nama_kk,
      anggota_lain: x.b.anggota_lain,
      patokan: x.b.patokan,
      lat: x.b.lat,
      lng: x.b.lng,
      sumber_id: x.b.sumber_id ?? null,
      no_urut: x.b.no_urut ?? null,
      keberadaan_awal: x.b.keberadaan_awal ?? null,
    });
  }
  for (let i = 0; i < masuk.length; i += 250) {
    const { error } = await db.from("bencana_pendataan_kk").insert(masuk.slice(i, i + 250));
    if (error) throw new Error(error.message);
  }
  // pembaruan: tidak menyentuh hasil / ppl_akun_id / status_at
  for (let i = 0; i < ubah.length; i += 10) {
    await Promise.all(
      ubah.slice(i, i + 10).map(async (u) => {
        const { error } = await db.from("bencana_pendataan_kk").update(u.isi).eq("id", u.id);
        if (error) throw new Error(error.message);
      })
    );
  }
  ditolak.sort((a, b) => a.no - b.no);
  return { diterima: masuk.length, diperbarui: ubah.length, sama, ditolak };
}

/** Tutup unggahan: jumlah diterima dihitung dari isi database; daftar penolakan (maks 200) disimpan di ringkasan. */
export async function selesaiUnggah(db: Db, akunId: number, batchId: number, ditolak: TolakBaris[], catatan: Record<string, number> = {}): Promise<{ diterima: number; ditolak: number }> {
  const { count } = await db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("aktif", true);
  const diterima = count ?? 0;
  await db
    .from("bencana_pendataan_batch")
    .update({ jumlah_diterima: diterima, jumlah_ditolak: ditolak.length, ringkasan: { ditolak: ditolak.slice(0, 200), terpotong: ditolak.length > 200, catatan } })
    .eq("id", batchId);
  await catatAudit(db, akunId, "pendataan.unggah", { batch_id: batchId, diterima, ditolak: ditolak.length, ...catatan });
  return { diterima, ditolak: ditolak.length };
}

/** Batalkan unggahan secara lunak: hanya bila belum satu pun KK-nya didata. */
export async function batalkanUnggah(db: Db, akunId: number, batchId: number): Promise<{ ok: true; dinonaktifkan: number } | { ok: false; pesan: string }> {
  const b = await batchAktif(db, batchId);
  if (!b) return { ok: false, pesan: "Unggahan tidak ditemukan." };
  if (b.dibatalkan_at) return { ok: false, pesan: "Unggahan ini sudah dibatalkan." };
  const { count: sudah } = await db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("batch_id", batchId).not("status_at", "is", null);
  if ((sudah ?? 0) > 0) return { ok: false, pesan: `Tidak bisa dibatalkan: ${sudah} KK dari unggahan ini sudah ada riwayat pendataan.` };
  const { count } = await db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("aktif", true);
  const { error } = await db.from("bencana_pendataan_kk").update({ aktif: false }).eq("batch_id", batchId).eq("aktif", true);
  if (error) throw new Error(error.message);
  await db.from("bencana_pendataan_batch").update({ dibatalkan_at: new Date().toISOString() }).eq("id", batchId);
  await catatAudit(db, akunId, "pendataan.batal_unggah", { batch_id: batchId, dinonaktifkan: count ?? 0 });
  return { ok: true, dinonaktifkan: count ?? 0 };
}

export type RingkasBatch = { id: number; nama_berkas: string | null; diunggah_at: string; oleh: string | null; diterima: number; ditolak: number; aktif: number; sudah_didata: number; dibatalkan_at: string | null; ringkasan: unknown };

export async function daftarUnggahan(db: Db, kegiatanId: number): Promise<{ batch: RingkasBatch[]; total_aktif: number; total_didata: number }> {
  const { data: bs } = await db
    .from("bencana_pendataan_batch")
    .select("id, nama_berkas, diunggah_at, diunggah_oleh_akun, jumlah_diterima, jumlah_ditolak, dibatalkan_at, ringkasan")
    .eq("kegiatan_id", kegiatanId)
    .order("id", { ascending: false })
    .limit(30);
  const akunIds = Array.from(new Set((bs ?? []).map((b) => b.diunggah_oleh_akun as number | null).filter((x): x is number => !!x)));
  const nama = new Map<number, string>();
  if (akunIds.length) {
    const { data } = await db.from("sigap_akun").select("id, nama").in("id", akunIds);
    for (const a of data ?? []) nama.set(a.id as number, a.nama as string);
  }
  const batch: RingkasBatch[] = [];
  for (const b of bs ?? []) {
    const [{ count: aktif }, { count: didata }] = await Promise.all([
      db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("batch_id", b.id).eq("aktif", true),
      db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("batch_id", b.id).eq("aktif", true).not("hasil", "is", null),
    ]);
    batch.push({
      id: b.id as number,
      nama_berkas: (b.nama_berkas as string | null) ?? null,
      diunggah_at: b.diunggah_at as string,
      oleh: b.diunggah_oleh_akun ? nama.get(b.diunggah_oleh_akun as number) ?? null : null,
      diterima: b.jumlah_diterima as number,
      ditolak: b.jumlah_ditolak as number,
      aktif: aktif ?? 0,
      sudah_didata: didata ?? 0,
      dibatalkan_at: (b.dibatalkan_at as string | null) ?? null,
      ringkasan: b.ringkasan ?? null,
    });
  }
  const [{ count: totalAktif }, { count: totalDidata }] = await Promise.all([
    db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true),
    db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true).not("hasil", "is", null),
  ]);
  return { batch, total_aktif: totalAktif ?? 0, total_didata: totalDidata ?? 0 };
}

