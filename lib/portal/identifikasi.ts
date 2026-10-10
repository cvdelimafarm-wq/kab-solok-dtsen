// lib/portal/identifikasi.ts  (hanya server)
//
// (10 Okt 2026) Lembar Identifikasi SLS untuk PML -- permintaan user.
// - Pembagian TERPISAH dari plotting PPL: tabel bencana_identifikasi_alokasi, per SLS utuh -> 1 PML pelaksana (terdekat) + 1 PML pendamping,
//   hanya untuk nagari terdampak. Hasil identifikasi kelak menjadi dasar plotting PPL.
// - Hasil (bencana_identifikasi_subsls, kunci idsubsls) dipakai BERSAMA: pelaksana & pendamping sama-sama bisa mengisi/melihat; progres tercatat untuk keduanya.
// - Monitoring admin (izin bencana.admin): progres per PML sebagai pelaksana (sekat unik, jadi total tidak ganda) + ringkasan peran pendamping.
// - Peta WA (desa) & peta SLS: berkas di bucket Storage "peta-wilayah" (wa/<kode desa 10 digit>.<ext>, sls/<idsubsls 16 digit>[ n dari m].<ext>).

import type { Db } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { ambilSkorSubsls } from "@/lib/portal/skorSubsls";
import { buangMemo, memoWaktu } from "@/lib/portal/memoSingkat";
import { KUNCI_RINCIAN, idSubSlsSah, ringkasIdentifikasi, type Isian, type RingkasIdentifikasi, type SubIdentifikasi } from "@/lib/identifikasi";

const angka = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

type BarisHasil = Record<string, unknown> & { pml_id: number; idsubsls: string };
type Hasil = NonNullable<SubIdentifikasi["hasil"]>;
type Skor = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; kk_total: number; kk_terdampak_estimasi: number };
// (10 Okt 2026) pml_pendamping_id boleh kosong: wilayah yang hanya punya tim PML pelaksana (mis. Danau Kembar/Lembah Gumanti/Pantai Cermin) tanpa pendamping -- permintaan user.
type Alok = { idsls: string; pml_pelaksana_id: number; pml_pendamping_id: number | null };

function jadiHasil(b: BarisHasil, nama: Map<number, string>): Hasil {
  const h = { kk_terdampak: angka(b.kk_terdampak), tidak_terdampak: b.tidak_terdampak === true, lainnya_ket: (b.lainnya_ket as string | null) ?? "", catatan: (b.catatan as string | null) ?? "", diperbarui_at: String(b.diperbarui_at ?? ""), oleh: nama.get(Number(b.pml_id)) ?? null } as Hasil;
  for (const k of KUNCI_RINCIAN) h[k] = angka(b[k]);
  return h;
}

const urut = (a: SubIdentifikasi, b: SubIdentifikasi) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.sls.localeCompare(b.sls) || a.sub_sls.localeCompare(b.sub_sls);

type Kontak = { nama: Map<number, string>; hp: Map<number, string> };

// (10 Okt 2026) Nama + nomor HP PML (rekan satu SLS perlu bisa saling menghubungi) -- permintaan user.
async function kontakPml(db: Db, ids: number[]): Promise<Kontak> {
  const k: Kontak = { nama: new Map(), hp: new Map() };
  if (ids.length === 0) return k;
  const { data } = await db.from("bencana_petugas").select("id, nama, no_hp").in("id", Array.from(new Set(ids)));
  for (const r of data ?? []) {
    k.nama.set(r.id as number, r.nama as string);
    if (r.no_hp) k.hp.set(r.id as number, String(r.no_hp));
  }
  return k;
}

/** Petugas ini PML aktif? */
export async function ambilPml(db: Db, petugasId: number | null): Promise<{ id: number; nama: string } | null> {
  if (!petugasId) return null;
  const { data } = await db.from("bencana_petugas").select("id, nama, peran, aktif").eq("id", petugasId).maybeSingle();
  if (!data || data.peran !== "pml" || data.aktif === false) return null;
  return { id: data.id as number, nama: data.nama as string };
}

/** Susun daftar Sub SLS dari SLS yang dialokasikan + hasil bersama. `pmlId` = sudut pandang (peran & rekan); null = tanpa peran (dipakai monitoring). */
function susunSub(alok: Alok[], skor: Skor[], hasil: BarisHasil[], nama: Map<number, string>, hp: Map<number, string>, pmlId: number): SubIdentifikasi[] {
  const peranSls = new Map<string, { peran: "pelaksana" | "pendamping"; rekan: number | null }>();
  for (const a of alok) {
    if (a.pml_pelaksana_id === pmlId) peranSls.set(a.idsls, { peran: "pelaksana", rekan: a.pml_pendamping_id });
    else if (a.pml_pendamping_id === pmlId) peranSls.set(a.idsls, { peran: "pendamping", rekan: a.pml_pelaksana_id });
  }
  const petaHasil = new Map<string, BarisHasil>(hasil.map((r) => [r.idsubsls, r]));
  const sub: SubIdentifikasi[] = [];
  for (const s of skor) {
    const p = peranSls.get(s.idsubsls.slice(0, 14));
    if (!p) continue;
    const r = petaHasil.get(s.idsubsls);
    sub.push({ idsubsls: s.idsubsls, kecamatan: s.kecamatan, nagari: s.nagari, sls: s.sls, sub_sls: s.sub_sls, kk: angka(s.kk_total), kk_awal: angka(s.kk_terdampak_estimasi), peran: p.peran, rekan: p.rekan == null ? null : (nama.get(p.rekan) ?? null), rekan_hp: p.rekan == null ? null : (hp.get(p.rekan) ?? null), hasil: r ? jadiHasil(r, nama) : null });
  }
  return sub.sort(urut);
}

/** Sub SLS yang dibagikan ke PML ini (pelaksana + pendamping) + hasil identifikasi yang sudah tersimpan. */
export async function daftarIdentifikasi(db: Db, pmlId: number): Promise<{ sub: SubIdentifikasi[]; ringkas: RingkasIdentifikasi }> {
  const { data: al } = await db.from("bencana_identifikasi_alokasi").select("idsls, pml_pelaksana_id, pml_pendamping_id").or(`pml_pelaksana_id.eq.${pmlId},pml_pendamping_id.eq.${pmlId}`);
  const alok = (al ?? []) as Alok[];
  if (alok.length === 0) return { sub: [], ringkas: ringkasIdentifikasi([]) };
  const sls = new Set(alok.map((a) => a.idsls));
  // (10 Okt 2026) Ambil seluruh 1084 Sub SLS (rpc polos terpotong 1000 baris) -- lihat skorSubsls.ts.
  const skor = await ambilSkorSubsls(db);
  const dasar = skor.filter((s) => sls.has(s.idsubsls.slice(0, 14)));
  const [{ data: hs }, kontak] = await Promise.all([
    db.from("bencana_identifikasi_subsls").select("*").in("idsubsls", dasar.map((s) => s.idsubsls)),
    kontakPml(db, alok.flatMap((a) => (a.pml_pendamping_id == null ? [a.pml_pelaksana_id] : [a.pml_pelaksana_id, a.pml_pendamping_id]))),
  ]);
  const sub = susunSub(alok, dasar, (hs ?? []) as BarisHasil[], kontak.nama, kontak.hp, pmlId);
  return { sub, ringkas: ringkasIdentifikasi(sub) };
}

/** Simpan (upsert) hasil satu Sub SLS. Boleh oleh PML pelaksana maupun pendamping SLS-nya; hasil dipakai bersama. */
export async function simpanIdentifikasi(db: Db, pmlId: number, akunId: number, idsubsls: string, isi: Isian): Promise<{ ok: true; hasil: Hasil } | { ok: false; pesan: string }> {
  if (!idSubSlsSah(idsubsls)) return { ok: false, pesan: "Kode Sub SLS tidak sah." };
  const { data: a } = await db.from("bencana_identifikasi_alokasi").select("idsls, pml_pelaksana_id, pml_pendamping_id").eq("idsls", idsubsls.slice(0, 14)).maybeSingle();
  if (!a || (a.pml_pelaksana_id !== pmlId && a.pml_pendamping_id !== pmlId)) return { ok: false, pesan: "Sub SLS ini bukan bagian dari pembagian identifikasi Anda." };
  const sekarang = new Date().toISOString();
  const baris: Record<string, unknown> = {
    pml_id: pmlId,
    idsubsls,
    kk_terdampak: isi.kk_terdampak,
    tidak_terdampak: isi.tidak_terdampak,
    lainnya_ket: isi.lainnya_ket || null,
    catatan: isi.catatan || null,
    diisi_oleh_akun: akunId,
    diperbarui_at: sekarang,
  };
  for (const k of KUNCI_RINCIAN) baris[k] = isi[k];
  // diisi_at tidak ikut: terisi default saat baru, tetap pada pembaruan berikutnya
  const { data, error } = await db.from("bencana_identifikasi_subsls").upsert(baris, { onConflict: "idsubsls" }).select("*").maybeSingle();
  if (error) return { ok: false, pesan: `Gagal menyimpan: ${error.message}` };
  await catatAudit(db, akunId, "identifikasi_simpan", { pml_id: pmlId, idsubsls, kk_terdampak: isi.kk_terdampak, tidak_terdampak: isi.tidak_terdampak });
  const kontak = await kontakPml(db, [pmlId]);
  return { ok: true, hasil: jadiHasil((data ?? baris) as BarisHasil, kontak.nama) };
}

// ---------------------------------------------------------------- monitoring admin
export type BarisMonitoring = {
  id: number;
  nama: string;
  /** jumlah SLS yang dipegang sebagai pelaksana */
  sls: number;
  /** progres sebagai PML PELAKSANA (sekat unik: semua PML dijumlah tidak ganda) */
  ringkas: RingkasIdentifikasi;
  /** peran pendamping: jumlah SLS & Sub SLS yang didampingi dan berapa yang sudah terisi (oleh siapa pun) */
  pendamping: { sls: number; total: number; terisi: number };
  /** waktu simpan terakhir (ISO) atau null */
  terakhir: string | null;
  /** semua Sub SLS PML ini (pelaksana + pendamping), urut wilayah */
  sub: SubIdentifikasi[];
};
export type Monitoring = {
  pml: BarisMonitoring[];
  /** jumlah PML: selesai (semua Sub SLS pelaksana terisi) / berjalan / belum mulai / tanpa pembagian */
  status: { selesai: number; berjalan: number; belum: number; tanpa_wilayah: number };
  total: RingkasIdentifikasi;
};

export async function monitoringIdentifikasi(db: Db): Promise<Monitoring> {
  const [{ data: pt }, { data: al }, skor, { data: hs }] = await Promise.all([
    db.from("bencana_petugas").select("id, nama, no_hp, aktif").eq("peran", "pml"),
    db.from("bencana_identifikasi_alokasi").select("idsls, pml_pelaksana_id, pml_pendamping_id"),
    ambilSkorSubsls(db),
    db.from("bencana_identifikasi_subsls").select("*"),
  ]);
  const alok = (al ?? []) as Alok[];
  const sls = new Set(alok.map((a) => a.idsls));
  const dasar = skor.filter((s) => sls.has(s.idsubsls.slice(0, 14)));
  const hasil = (hs ?? []) as BarisHasil[];
  const pmls = (pt ?? []).filter((p) => p.aktif !== false);
  const nama = new Map<number, string>(pmls.map((p) => [p.id as number, p.nama as string]));
  const hp = new Map<number, string>(pmls.filter((p) => p.no_hp).map((p) => [p.id as number, String(p.no_hp)]));

  const baris: BarisMonitoring[] = pmls.map((p) => {
    const id = p.id as number;
    const sub = susunSub(alok, dasar, hasil, nama, hp, id);
    const pelaksana = sub.filter((s) => s.peran === "pelaksana");
    const pend = sub.filter((s) => s.peran === "pendamping");
    const terakhir = sub.reduce<string | null>((m, s) => (s.hasil && (!m || s.hasil.diperbarui_at > m) ? s.hasil.diperbarui_at : m), null);
    return {
      id,
      nama: p.nama as string,
      sls: alok.filter((a) => a.pml_pelaksana_id === id).length,
      ringkas: ringkasIdentifikasi(pelaksana),
      pendamping: { sls: alok.filter((a) => a.pml_pendamping_id === id).length, total: pend.length, terisi: pend.filter((s) => s.hasil).length },
      terakhir,
      sub,
    };
  });

  // progres terendah dulu; PML tanpa pembagian paling bawah
  const persen = (b: BarisMonitoring) => (b.ringkas.total ? b.ringkas.terisi / b.ringkas.total : 2);
  baris.sort((a, b) => persen(a) - persen(b) || a.nama.localeCompare(b.nama));

  const status = { selesai: 0, berjalan: 0, belum: 0, tanpa_wilayah: 0 };
  for (const b of baris) {
    if (b.ringkas.total === 0) status.tanpa_wilayah++;
    else if (b.ringkas.terisi === 0) status.belum++;
    else if (b.ringkas.terisi >= b.ringkas.total) status.selesai++;
    else status.berjalan++;
  }
  const total = baris.reduce<RingkasIdentifikasi>(
    (a, b) => ({ total: a.total + b.ringkas.total, terisi: a.terisi + b.ringkas.terisi, tidak_terdampak: a.tidak_terdampak + b.ringkas.tidak_terdampak, kk: a.kk + b.ringkas.kk, awal: a.awal + b.ringkas.awal, hasil: a.hasil + b.ringkas.hasil }),
    { total: 0, terisi: 0, tidak_terdampak: 0, kk: 0, awal: 0, hasil: 0 }
  );
  return { pml: baris, status, total };
}

// ---------------------------------------------------------------- peta wilayah (Storage)
// Nama berkas apa adanya dari BPS, mis. "1303040001000100 1 dari 2.jpg" = peta Sub SLS 1303040001000100 lembar 1 dari 2.
//   sls/<16 digit idsubsls>[ n dari m].<jpg|png|pdf>   (atau 14 digit = berlaku untuk seluruh Sub SLS dalam SLS itu)
//   wa/<10 digit kode desa>[ n dari m].<jpg|png|pdf>   (peta Wilayah Administrasi nagari/desa)
export const BUCKET_PETA = "peta-wilayah";
export type BerkasPeta = { nama: string; url: string; tipe: "pdf" | "gambar"; halaman: number; dari: number };

const POLA_BERKAS = /^(\d{16}|\d{14}|\d{10})(?:[\s_-]+(\d+)[\s_-]+dari[\s_-]+(\d+))?\.(jpe?g|png|pdf|webp)$/i;

/** Daftar berkas satu folder bucket: kode -> berkas (urut lembar). */
// (10 Okt 2026) Daftar isi bucket peta (>1000 berkas = beberapa panggilan Storage berurutan) dulu dibaca ULANG pada setiap permintaan /api/portal/peta,
// sehingga lembar Peta lambat terbuka. Kini disimpan 5 menit di memori server (berkas yang baru diunggah admin muncul paling lambat 5 menit kemudian);
// hasil yang gagal dibaca tidak disimpan. -- permintaan user: "klik ikon peta ... menunggu modal terbuka penuh masih lambat".
const TTL_DAFTAR_PETA_MS = 5 * 60_000;
function daftarBerkas(db: Db, folder: "wa" | "sls"): Promise<Map<string, { nama: string; halaman: number; dari: number }[]>> {
  const kunci = `peta:daftar:${folder}`;
  return memoWaktu(kunci, TTL_DAFTAR_PETA_MS, async () => {
    const { hasil, utuh } = await bacaDaftarBerkas(db, folder);
    if (!utuh) buangMemo(kunci);
    return hasil;
  });
}

async function bacaDaftarBerkas(db: Db, folder: "wa" | "sls"): Promise<{ hasil: Map<string, { nama: string; halaman: number; dari: number }[]>; utuh: boolean }> {
  const hasil = new Map<string, { nama: string; halaman: number; dari: number }[]>();
  let utuh = true;
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await db.storage.from(BUCKET_PETA).list(folder, { limit: 1000, offset: off, sortBy: { column: "name", order: "asc" } });
    if (error || !data) {
      utuh = false;
      break;
    }
    for (const f of data) {
      const m = POLA_BERKAS.exec(f.name);
      if (!m) continue;
      const arr = hasil.get(m[1]) ?? [];
      arr.push({ nama: f.name, halaman: m[2] ? Number(m[2]) : 1, dari: m[3] ? Number(m[3]) : 1 });
      hasil.set(m[1], arr);
    }
    if (data.length < 1000) break;
  }
  for (const arr of hasil.values()) arr.sort((a, b) => a.halaman - b.halaman);
  return { hasil, utuh };
}

async function tandatangani(db: Db, folder: "wa" | "sls", terpilih: Map<string, { nama: string; halaman: number; dari: number }[]>): Promise<Record<string, BerkasPeta[]>> {
  const semua = Array.from(terpilih.values()).flat();
  const hasil: Record<string, BerkasPeta[]> = {};
  if (semua.length === 0) return hasil;
  const { data } = await db.storage.from(BUCKET_PETA).createSignedUrls(semua.map((f) => `${folder}/${f.nama}`), 3600);
  const url = new Map<string, string>();
  for (const d of data ?? []) if (d.signedUrl && d.path) url.set(d.path, d.signedUrl);
  for (const [kode, arr] of terpilih) {
    hasil[kode] = arr.flatMap((f) => {
      const u = url.get(`${folder}/${f.nama}`);
      return u ? [{ nama: f.nama, url: u, tipe: /\.pdf$/i.test(f.nama) ? ("pdf" as const) : ("gambar" as const), halaman: f.halaman, dari: f.dari }] : [];
    });
  }
  return hasil;
}

/**
 * Peta yang tersedia. `desa` = kode desa 10 digit; `sub` = idsubsls 16 digit.
 * Peta Sub SLS dicari dengan kode 16 digit; bila tidak ada, dengan kode SLS 14 digit, lalu kode SLS + "00". Yang belum diunggah tidak muncul di hasil.
 */
export async function petaTersedia(db: Db, desa: string[], sub: string[]): Promise<{ wa: Record<string, BerkasPeta[]>; sls: Record<string, BerkasPeta[]> }> {
  const [bWa, bSls] = await Promise.all([desa.length ? daftarBerkas(db, "wa") : Promise.resolve(new Map()), sub.length ? daftarBerkas(db, "sls") : Promise.resolve(new Map())]);
  const pilihWa = new Map<string, { nama: string; halaman: number; dari: number }[]>();
  for (const k of desa) if (bWa.has(k)) pilihWa.set(k, bWa.get(k)!);
  const pilihSls = new Map<string, { nama: string; halaman: number; dari: number }[]>();
  for (const k of sub) {
    // (10 Okt 2026) Urutan: peta Sub SLS (16 digit) -> peta SLS 14 digit -> peta SLS berakhiran "00" (16 digit, mis. 1303040002000900)
    // -- sesuai penamaan berkas peta SLS yang diunduh dari Drive (kode SLS + "00" = satu peta untuk seluruh SLS).
    const arr = bSls.get(k) ?? bSls.get(k.slice(0, 14)) ?? bSls.get(`${k.slice(0, 14)}00`);
    if (arr) pilihSls.set(k, arr);
  }
  const [wa, sls] = await Promise.all([tandatangani(db, "wa", pilihWa), tandatangani(db, "sls", pilihSls)]);
  return { wa, sls };
}
