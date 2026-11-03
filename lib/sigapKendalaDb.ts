// lib/sigapKendalaDb.ts
//
// (3 Nov 2026) Kelola Pelatihan > Kendala, tahap pertama: PETUGAS MENOLAK / MUNDUR. Pengelola memutuskan satu dari tiga:
//   ganti   -> calon baru mewarisi peran, kelas, atasan, dan bawahan petugas lama; calon langsung masuk daftar peserta (menerima undangan lewat HP)
//   kosong  -> tempat dibiarkan kosong sementara; tercatat di daftar "menunggu pengganti"
//   alihkan -> tempat diambil alih petugas yang SUDAH ADA. Tidak ada pembagian otomatis: bawahan petugas lama pindah seluruhnya ke penerima (bebannya bisa ganda)
// Setiap keputusan dicatat di sigap_pelatihan_kendala dengan snapshot keadaan sebelumnya sehingga bisa DIURUNGKAN. Tanpa tabel itu (SQL belum dijalankan)
// semua fungsi tulis menolak dengan petunjuk; fungsi baca mengembalikan tersedia=false.
//
// Yang diubah hanya data pelatihan ini: sigap_penugasan, sigap_pelatihan_hierarki. Sampel/beban survei lapangan TIDAK disentuh.

import { FILTER_BUKAN_ADMINISTRASI } from "@/lib/sigapTesDb";

type Db = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type Keputusan = "ganti" | "kosong" | "alihkan";
export const DAFTAR_KEPUTUSAN: readonly Keputusan[] = ["ganti", "kosong", "alihkan"];
export const LABEL_KEPUTUSAN: Record<Keputusan, string> = {
  ganti: "Diganti calon baru",
  kosong: "Dibiarkan kosong sementara",
  alihkan: "Dialihkan ke petugas yang ada",
};
export const PESAN_SQL = "Panel Kendala belum aktif. Jalankan dulu SQL 20261103a_pelatihan_kendala di Supabase.";

const PERAN_SAH = ["ppl", "pml", "korwil"] as const;
type PeranPelatihan = (typeof PERAN_SAH)[number];
const peranSah = (x: unknown): x is PeranPelatihan => typeof x === "string" && (PERAN_SAH as readonly string[]).includes(x);

export type Petugas = {
  akun_id: number;
  nama: string;
  peran: string;
  kelas: number | null;
  atasan_akun_id: number | null;
  bawahan: number;
  kecamatan: string | null;
  respons: "terima" | "tolak" | null;
};

export type Perlu = {
  akun_id: number;
  nama: string;
  peran: string;
  kelas: number | null;
  bawahan: number;
  kecamatan: string | null;
  status: "menolak" | "kosong";
  alasan: string | null;
  sejak: string | null;
};

export type Riwayat = {
  id: number;
  akun_id: number;
  nama: string;
  keputusan: Keputusan;
  pengganti_nama: string | null;
  catatan: string | null;
  at: string;
  oleh_nama: string | null;
  dibatalkan_at: string | null;
  selesai_at: string | null;
  bisa_urung: boolean;
};

export type Papan = { tersedia: boolean; petugas: Petugas[]; perlu: Perlu[]; riwayat: Riwayat[] };

export type Kandidat = { akun_id: number; nama: string; kecamatan: string | null; sewilayah: boolean };

type BarisKendala = {
  id: number;
  akun_id: number;
  keputusan: Keputusan;
  pengganti_akun_id: number | null;
  catatan: string | null;
  snapshot: Snapshot | null;
  oleh: number | null;
  at: string;
  selesai_at: string | null;
  dibatalkan_at: string | null;
};

type PenugasanSnap = { id: number; peran: string; kelas: number | null; aktif: boolean; sumber: string | null; maks_hari: number | null };
type HierarkiSnap = { peran_pelatihan: string; atasan_akun_id: number | null; sumber: string };
type Snapshot = {
  pemberi: { penugasan: PenugasanSnap; hierarki: HierarkiSnap | null; bawahan: number[] };
  penerima?: { akun_id: number; penugasan: PenugasanSnap | null; hierarki: HierarkiSnap | null };
};

const num = (x: unknown): number => Number(x);

async function tabelAda(db: Db): Promise<boolean> {
  try {
    const { error } = await db.from("sigap_pelatihan_kendala").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function bacaPenugasan(db: Db, kegiatanId: number, akunId: number): Promise<PenugasanSnap | null> {
  const { data } = await db.from("sigap_penugasan").select("id, peran, kelas, aktif, sumber, maks_hari").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
  if (!data) return null;
  const r = data as { id: number; peran: string; kelas: number | null; aktif: boolean; sumber: string | null; maks_hari: number | null };
  return { id: num(r.id), peran: r.peran, kelas: r.kelas == null ? null : num(r.kelas), aktif: !!r.aktif, sumber: r.sumber ?? null, maks_hari: r.maks_hari == null ? null : num(r.maks_hari) };
}

async function bacaHierarki(db: Db, kegiatanId: number, akunId: number): Promise<HierarkiSnap | null> {
  const { data } = await db.from("sigap_pelatihan_hierarki").select("peran_pelatihan, atasan_akun_id, sumber").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
  if (!data) return null;
  const r = data as { peran_pelatihan: string; atasan_akun_id: number | null; sumber: string };
  return { peran_pelatihan: r.peran_pelatihan, atasan_akun_id: r.atasan_akun_id == null ? null : num(r.atasan_akun_id), sumber: r.sumber };
}

async function bacaBawahan(db: Db, kegiatanId: number, akunId: number): Promise<number[]> {
  const { data } = await db.from("sigap_pelatihan_hierarki").select("akun_id").eq("kegiatan_id", kegiatanId).eq("atasan_akun_id", akunId).limit(5000);
  return ((data ?? []) as { akun_id: number }[]).map((r) => num(r.akun_id));
}

const sekarang = () => new Date().toISOString();

// ----------------------------------------------------------------------------
// Papan (baca)
// ----------------------------------------------------------------------------

/** Petugas aktif, daftar yang perlu ditangani (penolak + menunggu pengganti), dan riwayat keputusan. */
export async function muatPapan(db: Db, kegiatanId: number): Promise<Papan> {
  const kosong: Papan = { tersedia: false, petugas: [], perlu: [], riwayat: [] };
  try {
    const { data: kd, error: ke } = await db.from("sigap_pelatihan_kendala").select("id, akun_id, keputusan, pengganti_akun_id, catatan, snapshot, oleh, at, selesai_at, dibatalkan_at").eq("kegiatan_id", kegiatanId).order("at", { ascending: false }).limit(200);
    const tersedia = !ke;
    const kendala = (tersedia ? ((kd ?? []) as BarisKendala[]) : []).map((k) => ({ ...k, id: num(k.id), akun_id: num(k.akun_id), pengganti_akun_id: k.pengganti_akun_id == null ? null : num(k.pengganti_akun_id) }));

    const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran, kelas, aktif").eq("kegiatan_id", kegiatanId).or(FILTER_BUKAN_ADMINISTRASI).limit(5000);
    const penugasan = ((pen ?? []) as { akun_id: number; peran: string; kelas: number | null; aktif: boolean }[]).map((p) => ({ ...p, akun_id: num(p.akun_id), kelas: p.kelas == null ? null : num(p.kelas) }));

    const { data: hi } = await db.from("sigap_pelatihan_hierarki").select("akun_id, atasan_akun_id").eq("kegiatan_id", kegiatanId).limit(5000);
    const hierarki = ((hi ?? []) as { akun_id: number; atasan_akun_id: number | null }[]).map((h) => ({ akun_id: num(h.akun_id), atasan: h.atasan_akun_id == null ? null : num(h.atasan_akun_id) }));
    const atasanDari = new Map(hierarki.map((h) => [h.akun_id, h.atasan]));
    const jumlahBawahan = new Map<number, number>();
    for (const h of hierarki) if (h.atasan != null) jumlahBawahan.set(h.atasan, (jumlahBawahan.get(h.atasan) ?? 0) + 1);

    const { data: rs } = await db.from("sigap_pelatihan_undangan_respons").select("akun_id, respons, alasan, dijawab_at").eq("kegiatan_id", kegiatanId).limit(5000);
    const respons = new Map(((rs ?? []) as { akun_id: number; respons: string; alasan: string | null; dijawab_at: string }[]).map((r) => [num(r.akun_id), r]));

    // keputusan yang masih berlaku per akun (belum diurungkan, belum digantikan)
    const berlaku = new Map<number, BarisKendala>();
    for (const k of kendala) if (!k.dibatalkan_at && !k.selesai_at && !berlaku.has(k.akun_id)) berlaku.set(k.akun_id, k);

    const idAkun = new Set<number>();
    for (const p of penugasan) idAkun.add(p.akun_id);
    for (const k of kendala) {
      idAkun.add(k.akun_id);
      if (k.pengganti_akun_id != null) idAkun.add(k.pengganti_akun_id);
      if (k.oleh != null) idAkun.add(num(k.oleh));
    }
    const info = new Map<number, { nama: string; kecamatan: string | null }>();
    if (idAkun.size > 0) {
      const { data: ak } = await db.from("sigap_akun").select("id, nama, alamat_kecamatan").in("id", [...idAkun]);
      for (const a of (ak ?? []) as { id: number; nama: string; alamat_kecamatan: string | null }[]) info.set(num(a.id), { nama: a.nama, kecamatan: a.alamat_kecamatan ?? null });
    }
    const nama = (id: number) => info.get(id)?.nama ?? `Akun ${id}`;

    const petugas: Petugas[] = penugasan
      .filter((p) => p.aktif)
      .map((p) => ({
        akun_id: p.akun_id,
        nama: nama(p.akun_id),
        peran: p.peran,
        kelas: p.kelas,
        atasan_akun_id: atasanDari.get(p.akun_id) ?? null,
        bawahan: jumlahBawahan.get(p.akun_id) ?? 0,
        kecamatan: info.get(p.akun_id)?.kecamatan ?? null,
        respons: (respons.get(p.akun_id)?.respons as "terima" | "tolak" | undefined) ?? null,
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama));

    const perlu: Perlu[] = [];
    for (const p of penugasan) {
      if (p.aktif) continue;
      const r = respons.get(p.akun_id);
      const putusan = berlaku.get(p.akun_id);
      if (putusan && putusan.keputusan !== "kosong") continue; // sudah diganti / dialihkan
      if (putusan?.keputusan === "kosong") {
        perlu.push({ akun_id: p.akun_id, nama: nama(p.akun_id), peran: p.peran, kelas: p.kelas, bawahan: jumlahBawahan.get(p.akun_id) ?? 0, kecamatan: info.get(p.akun_id)?.kecamatan ?? null, status: "kosong", alasan: putusan.catatan, sejak: putusan.at });
      } else if (r?.respons === "tolak") {
        perlu.push({ akun_id: p.akun_id, nama: nama(p.akun_id), peran: p.peran, kelas: p.kelas, bawahan: jumlahBawahan.get(p.akun_id) ?? 0, kecamatan: info.get(p.akun_id)?.kecamatan ?? null, status: "menolak", alasan: r.alasan ?? null, sejak: r.dijawab_at });
      }
    }
    perlu.sort((a, b) => (a.status === b.status ? a.nama.localeCompare(b.nama) : a.status === "menolak" ? -1 : 1));

    const terbaruPerAkun = new Set<number>();
    const riwayat: Riwayat[] = kendala.map((k) => {
      const aktifBerlaku = !k.dibatalkan_at && !k.selesai_at;
      const bisa = aktifBerlaku && !terbaruPerAkun.has(k.akun_id);
      if (aktifBerlaku) terbaruPerAkun.add(k.akun_id);
      return {
        id: k.id,
        akun_id: k.akun_id,
        nama: nama(k.akun_id),
        keputusan: k.keputusan,
        pengganti_nama: k.pengganti_akun_id != null ? nama(k.pengganti_akun_id) : null,
        catatan: k.catatan ?? null,
        at: k.at,
        oleh_nama: k.oleh != null ? nama(num(k.oleh)) : null,
        dibatalkan_at: k.dibatalkan_at,
        selesai_at: k.selesai_at,
        bisa_urung: bisa,
      };
    });

    return { tersedia, petugas, perlu, riwayat };
  } catch {
    return kosong;
  }
}

/**
 * Calon pengganti: mitra aktif (pool tahun ini) yang belum menjadi petugas pelatihan ini dan belum menolaknya. Tanpa kata kunci -> saran (sewilayah / satu
 * kecamatan dengan petugas lama lebih dulu). Dengan kata kunci (>= 2 huruf) -> hasil pencarian nama. Maksimal 12.
 */
export async function cariKandidat(db: Db, kegiatanId: number, kata: string, kecamatanAcuan: string | null): Promise<Kandidat[]> {
  try {
    const q = kata.trim().replace(/[%_,()]/g, " ").trim();
    if (q.length === 1) return [];
    const dasar = () => db.from("sigap_akun").select("id, nama, alamat_kecamatan").eq("aktif", true).eq("jenis", "mitra");
    type Mentah = { id: number; nama: string; alamat_kecamatan: string | null };
    const hasil: Mentah[] = [];
    if (q) {
      const { data } = await dasar().ilike("nama", `%${q}%`).order("nama").limit(80);
      hasil.push(...((data ?? []) as Mentah[]));
    } else {
      if (kecamatanAcuan) {
        const { data } = await dasar().eq("alamat_kecamatan", kecamatanAcuan).order("nama").limit(400);
        hasil.push(...((data ?? []) as Mentah[]));
      }
      const { data } = await dasar().order("nama").limit(60); // pelengkap bila satu kecamatan tidak cukup
      hasil.push(...((data ?? []) as Mentah[]));
    }
    const lihat = new Set<number>();
    let calon = hasil
      .filter((a) => (lihat.has(num(a.id)) ? false : (lihat.add(num(a.id)), true)))
      .map((a) => ({ akun_id: num(a.id), nama: a.nama, kecamatan: a.alamat_kecamatan ?? null }));
    if (calon.length === 0) return [];

    const { data: pen } = await db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(5000);
    const sudah = new Set(((pen ?? []) as { akun_id: number }[]).map((r) => num(r.akun_id)));
    const { data: tolak } = await db.from("sigap_pelatihan_undangan_respons").select("akun_id").eq("kegiatan_id", kegiatanId).eq("respons", "tolak").limit(5000);
    const menolak = new Set(((tolak ?? []) as { akun_id: number }[]).map((r) => num(r.akun_id)));
    calon = calon.filter((c) => !sudah.has(c.akun_id) && !menolak.has(c.akun_id));

    // pool tahun ini: bila tabel/baris ada, hanya yang berstatus aktif; bila gagal baca, tidak disaring
    const tahun = new Date().getFullYear();
    const { data: pool, error: pe } = await db.from("sigap_mitra_pool").select("akun_id").eq("tahun", tahun).eq("status", "aktif").limit(5000);
    if (!pe && pool && (pool as unknown[]).length > 0) {
      const sah = new Set((pool as { akun_id: number }[]).map((r) => num(r.akun_id)));
      calon = calon.filter((c) => sah.has(c.akun_id));
    }

    return calon
      .map((c) => ({ ...c, sewilayah: !!kecamatanAcuan && c.kecamatan === kecamatanAcuan }))
      .sort((a, b) => Number(b.sewilayah) - Number(a.sewilayah) || a.nama.localeCompare(b.nama))
      .slice(0, 12);
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// Tulis
// ----------------------------------------------------------------------------

export type InputKendala = { akun_id: number; keputusan: Keputusan; pengganti_akun_id?: number | null; catatan?: string | null };
export type HasilKendala = { ok: true; id: number; ringkas: string; beban?: { nama: string; sebelum: number; sesudah: number } } | { ok: false; pesan: string };

const gagal = (pesan: string): { ok: false; pesan: string } => ({ ok: false, pesan });

/** Memulihkan keadaan dari snapshot (dipakai urungkan dan pembatalan bila langkah di tengah gagal). */
async function pulihkan(db: Db, kegiatanId: number, keputusan: Keputusan, penggantiId: number | null, snap: Snapshot): Promise<void> {
  const pemberiId = await akunPenugasan(db, snap.pemberi.penugasan.id);
  // 1. bawahan kembali ke petugas lama (hanya yang masih menunjuk penerima / pengganti)
  if (penggantiId != null && snap.pemberi.bawahan.length > 0 && pemberiId != null) {
    await db.from("sigap_pelatihan_hierarki").update({ atasan_akun_id: pemberiId, diubah_at: sekarang() }).eq("kegiatan_id", kegiatanId).eq("atasan_akun_id", penggantiId).in("akun_id", snap.pemberi.bawahan);
  }
  // 2. hierarki petugas lama kembali
  if (pemberiId != null && snap.pemberi.hierarki) {
    await db.from("sigap_pelatihan_hierarki").upsert({ kegiatan_id: kegiatanId, akun_id: pemberiId, peran_pelatihan: snap.pemberi.hierarki.peran_pelatihan, atasan_akun_id: snap.pemberi.hierarki.atasan_akun_id, sumber: snap.pemberi.hierarki.sumber, diubah_at: sekarang() }, { onConflict: "kegiatan_id,akun_id" });
  }
  // 3. pengganti: kembali ke keadaan semula (hapus bila sebelumnya tidak ada)
  if (keputusan === "ganti" && snap.penerima) {
    const id = snap.penerima.akun_id;
    if (snap.penerima.hierarki) {
      await db.from("sigap_pelatihan_hierarki").upsert({ kegiatan_id: kegiatanId, akun_id: id, peran_pelatihan: snap.penerima.hierarki.peran_pelatihan, atasan_akun_id: snap.penerima.hierarki.atasan_akun_id, sumber: snap.penerima.hierarki.sumber, diubah_at: sekarang() }, { onConflict: "kegiatan_id,akun_id" });
    } else {
      await db.from("sigap_pelatihan_hierarki").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", id);
    }
    if (snap.penerima.penugasan) {
      const p = snap.penerima.penugasan;
      await db.from("sigap_penugasan").update({ aktif: p.aktif, peran: p.peran, kelas: p.kelas, sumber: p.sumber, maks_hari: p.maks_hari }).eq("id", p.id);
    } else {
      const { error } = await db.from("sigap_penugasan").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", id);
      if (error) await db.from("sigap_penugasan").update({ aktif: false }).eq("kegiatan_id", kegiatanId).eq("akun_id", id); // sudah ada jejak lain: cukup dinonaktifkan
    }
  }
  // 4. petugas lama aktif kembali bila sebelumnya aktif
  if (snap.pemberi.penugasan.aktif) await db.from("sigap_penugasan").update({ aktif: true }).eq("id", snap.pemberi.penugasan.id);
}

async function akunPenugasan(db: Db, penugasanId: number): Promise<number | null> {
  const { data } = await db.from("sigap_penugasan").select("akun_id").eq("id", penugasanId).maybeSingle();
  return data ? num((data as { akun_id: number }).akun_id) : null;
}

/** Menerapkan satu keputusan untuk petugas yang menolak / mundur. */
export async function terapkanKendala(db: Db, kegiatanId: number, oleh: number, inp: InputKendala): Promise<HasilKendala> {
  if (!DAFTAR_KEPUTUSAN.includes(inp.keputusan)) return gagal("Pilihan keputusan tidak dikenal.");
  if (!Number.isInteger(inp.akun_id) || inp.akun_id <= 0) return gagal("Petugas tidak valid.");
  if (!(await tabelAda(db))) return gagal(PESAN_SQL);

  const pen = await bacaPenugasan(db, kegiatanId, inp.akun_id);
  if (!pen) return gagal("Nama itu tidak tercatat sebagai petugas pelatihan ini.");
  if (pen.sumber === "administrasi") return gagal("Peserta tambahan administrasi tidak dikelola dari panel Kendala.");
  if (!peranSah(pen.peran)) return gagal("Peran petugas ini tidak dikenal.");
  const peran: PeranPelatihan = pen.peran;

  // keputusan yang masih berlaku (selain 'kosong') harus diurungkan lebih dulu
  const { data: terbuka } = await db.from("sigap_pelatihan_kendala").select("id, keputusan").eq("kegiatan_id", kegiatanId).eq("akun_id", inp.akun_id).is("dibatalkan_at", null).is("selesai_at", null).limit(10);
  const tumpang = ((terbuka ?? []) as { id: number; keputusan: Keputusan }[]).find((k) => k.keputusan !== "kosong");
  if (tumpang) return gagal("Petugas ini sudah punya keputusan. Urungkan dulu di Riwayat bila ingin mengubahnya.");
  const kosongTerbuka = ((terbuka ?? []) as { id: number; keputusan: Keputusan }[]).filter((k) => k.keputusan === "kosong").map((k) => num(k.id));
  if (inp.keputusan === "kosong" && kosongTerbuka.length > 0) return gagal("Tempat petugas ini sudah ditandai kosong.");

  const hier = await bacaHierarki(db, kegiatanId, inp.akun_id);
  const bawahan = await bacaBawahan(db, kegiatanId, inp.akun_id);
  const snap: Snapshot = { pemberi: { penugasan: pen, hierarki: hier, bawahan } };

  let penggantiId: number | null = null;
  let namaPenerima = "";
  let bawahanPenerimaSebelum = 0;

  if (inp.keputusan !== "kosong") {
    penggantiId = Number(inp.pengganti_akun_id);
    if (!Number.isInteger(penggantiId) || penggantiId <= 0) return gagal(inp.keputusan === "ganti" ? "Pilih calon pengganti dulu." : "Pilih petugas yang mengambil alih dulu.");
    if (penggantiId === inp.akun_id) return gagal("Pengganti tidak boleh orang yang sama.");
    const { data: ak } = await db.from("sigap_akun").select("id, nama, aktif").eq("id", penggantiId).maybeSingle();
    if (!ak) return gagal("Akun pengganti tidak ditemukan.");
    if ((ak as { aktif: boolean }).aktif === false) return gagal("Akun pengganti tidak aktif.");
    namaPenerima = (ak as { nama: string }).nama;
    const { data: tl } = await db.from("sigap_pelatihan_undangan_respons").select("respons").eq("kegiatan_id", kegiatanId).eq("akun_id", penggantiId).maybeSingle();
    if ((tl as { respons?: string } | null)?.respons === "tolak") return gagal(`${namaPenerima} sudah menolak undangan pelatihan ini.`);
    const penPengganti = await bacaPenugasan(db, kegiatanId, penggantiId);
    if (inp.keputusan === "ganti") {
      if (penPengganti?.aktif) return gagal(`${namaPenerima} sudah menjadi petugas pelatihan ini. Pakai pilihan "Alihkan ke petugas yang ada".`);
      snap.penerima = { akun_id: penggantiId, penugasan: penPengganti, hierarki: await bacaHierarki(db, kegiatanId, penggantiId) };
    } else {
      if (!penPengganti?.aktif) return gagal(`${namaPenerima} bukan petugas aktif pelatihan ini.`);
      if (penPengganti.peran !== pen.peran) return gagal(`Pengalihan hanya ke petugas dengan peran yang sama (${pen.peran.toUpperCase()}).`);
      snap.penerima = { akun_id: penggantiId, penugasan: penPengganti, hierarki: await bacaHierarki(db, kegiatanId, penggantiId) };
      bawahanPenerimaSebelum = (await bacaBawahan(db, kegiatanId, penggantiId)).length;
    }
  }

  const catatan = (inp.catatan ?? "").toString().trim().slice(0, 500) || null;
  const { data: baru, error: eIns } = await db
    .from("sigap_pelatihan_kendala")
    .insert({ kegiatan_id: kegiatanId, jenis: "petugas_mundur", akun_id: inp.akun_id, keputusan: inp.keputusan, pengganti_akun_id: penggantiId, peran, kelas: pen.kelas, atasan_akun_id: hier?.atasan_akun_id ?? null, catatan, snapshot: snap, oleh })
    .select("id")
    .single();
  if (eIns || !baru) return gagal("Keputusan belum dapat dicatat.");
  const id = num((baru as { id: number }).id);

  try {
    // petugas lama keluar dari daftar aktif
    if (pen.aktif) {
      const { error } = await db.from("sigap_penugasan").update({ aktif: false }).eq("id", pen.id);
      if (error) throw new Error("penugasan lama");
    }

    if (inp.keputusan === "ganti" && penggantiId != null) {
      const sumber = `kendala:${oleh}`;
      const sebelum = snap.penerima?.penugasan ?? null;
      if (sebelum) {
        const { error } = await db.from("sigap_penugasan").update({ aktif: true, peran, kelas: pen.kelas, sumber, maks_hari: pen.maks_hari }).eq("id", sebelum.id);
        if (error) throw new Error("penugasan pengganti");
      } else {
        const { error } = await db.from("sigap_penugasan").insert({ kegiatan_id: kegiatanId, akun_id: penggantiId, peran, kelas: pen.kelas, aktif: true, sumber, maks_hari: pen.maks_hari });
        if (error) throw new Error("penugasan pengganti");
      }
      if (hier) {
        const atasan = hier.atasan_akun_id === penggantiId ? null : hier.atasan_akun_id;
        const { error } = await db.from("sigap_pelatihan_hierarki").upsert({ kegiatan_id: kegiatanId, akun_id: penggantiId, peran_pelatihan: hier.peran_pelatihan, atasan_akun_id: atasan, sumber: "manual", diubah_oleh: String(oleh), diubah_at: sekarang() }, { onConflict: "kegiatan_id,akun_id" });
        if (error) throw new Error("hierarki pengganti");
      }
    }

    if (inp.keputusan !== "kosong" && penggantiId != null) {
      // seluruh bawahan pindah ke penerima / pengganti (tanpa pembagian); baris hierarki petugas lama dihapus agar tidak jadi hantu
      if (bawahan.length > 0) {
        const { error } = await db.from("sigap_pelatihan_hierarki").update({ atasan_akun_id: penggantiId, sumber: "manual", diubah_oleh: String(oleh), diubah_at: sekarang() }).eq("kegiatan_id", kegiatanId).eq("atasan_akun_id", inp.akun_id).neq("akun_id", penggantiId);
        if (error) throw new Error("bawahan");
      }
      if (hier) {
        const { error } = await db.from("sigap_pelatihan_hierarki").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", inp.akun_id);
        if (error) throw new Error("hierarki lama");
      }
    }

    if (kosongTerbuka.length > 0) await db.from("sigap_pelatihan_kendala").update({ selesai_at: sekarang() }).in("id", kosongTerbuka);
  } catch {
    try {
      await pulihkan(db, kegiatanId, inp.keputusan, penggantiId, snap);
    } catch {
      // pemulihan juga gagal: catatan dibiarkan agar bisa ditelusuri
      return gagal("Keputusan gagal diterapkan sebagian. Periksa tab Tim & Peserta.");
    }
    await db.from("sigap_pelatihan_kendala").delete().eq("id", id);
    return gagal("Keputusan gagal diterapkan; keadaan dikembalikan seperti semula.");
  }

  const nama = await namaAkun(db, inp.akun_id);
  if (inp.keputusan === "ganti") return { ok: true, id, ringkas: `${nama} diganti ${namaPenerima}${bawahan.length ? ` (membawa ${bawahan.length} bawahan)` : ""}. ${namaPenerima} perlu menerima undangan di HP.` };
  if (inp.keputusan === "alihkan") return { ok: true, id, ringkas: `Tempat ${nama} dialihkan ke ${namaPenerima}${bawahan.length ? `; ${bawahan.length} bawahan ikut pindah` : ""}.`, beban: { nama: namaPenerima, sebelum: bawahanPenerimaSebelum, sesudah: bawahanPenerimaSebelum + bawahan.length } };
  return { ok: true, id, ringkas: `Tempat ${nama} dibiarkan kosong sementara.` };
}

async function namaAkun(db: Db, id: number): Promise<string> {
  const { data } = await db.from("sigap_akun").select("nama").eq("id", id).maybeSingle();
  return (data as { nama?: string } | null)?.nama ?? `Akun ${id}`;
}

/** Mengurungkan satu keputusan (kembali ke keadaan sebelum keputusan itu). */
export async function urungkanKendala(db: Db, kegiatanId: number, id: number, oleh: number): Promise<{ ok: true; ringkas: string } | { ok: false; pesan: string }> {
  if (!Number.isInteger(id) || id <= 0) return gagal("Keputusan tidak valid.");
  if (!(await tabelAda(db))) return gagal(PESAN_SQL);
  const { data } = await db.from("sigap_pelatihan_kendala").select("id, akun_id, keputusan, pengganti_akun_id, snapshot, selesai_at, dibatalkan_at").eq("id", id).eq("kegiatan_id", kegiatanId).maybeSingle();
  if (!data) return gagal("Keputusan tidak ditemukan.");
  const k = data as { id: number; akun_id: number; keputusan: Keputusan; pengganti_akun_id: number | null; snapshot: Snapshot | null; selesai_at: string | null; dibatalkan_at: string | null };
  if (k.dibatalkan_at) return gagal("Keputusan ini sudah diurungkan.");
  if (k.selesai_at) return gagal("Keputusan ini sudah digantikan keputusan lain.");
  const snap = k.snapshot;
  if (!snap || !snap.pemberi?.penugasan) return gagal("Keadaan sebelumnya tidak tersimpan, tidak dapat diurungkan.");
  try {
    await pulihkan(db, kegiatanId, k.keputusan, k.pengganti_akun_id == null ? null : num(k.pengganti_akun_id), snap);
    const { error } = await db.from("sigap_pelatihan_kendala").update({ dibatalkan_at: sekarang(), dibatalkan_oleh: oleh }).eq("id", id);
    if (error) return gagal("Keputusan dipulihkan tetapi catatannya belum diperbarui.");
  } catch {
    return gagal("Keputusan belum dapat diurungkan.");
  }
  return { ok: true, ringkas: `Keputusan untuk ${await namaAkun(db, num(k.akun_id))} diurungkan.` };
}
