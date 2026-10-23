// lib/sigapFotoServer.ts  (hanya server)
//
// (19 Okt 2026) Kamera SIGAP -- pembantu database untuk route /api/sigap/foto/*:
// token potret, mode (saklar), hak akses, daftar rekan, wilayah tugas, dan pemeriksaan kepercayaan.
// Aturan tetap: tidak ada hapus; perubahan saklar dicatat ke sigap_audit; Supabase lewat service role.

import crypto from "crypto";
import type { Db } from "@/lib/sigap";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { jarakM, modeEfektif, slotBerlokasi, type ModeFoto, type ModeKegiatan } from "@/lib/sigapFoto";

/** Menu izin (sigap_peran_izin.menu_kode, level 'kelola') yang boleh mengelola saklar dan usulan hapus selain akun super.
 *  Dipilih 'translok.verifikasi' (verifikasi SPJ; dimiliki 4 peran) karena foto adalah bukti SPJ. Mudah diganti ke menu lain yang ada. */
export const MENU_ADMIN_FOTO = "translok.verifikasi";

function kunciToken(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset.");
  return `sigap-foto:${k}`;
}
const tandaToken = (isi: string) => crypto.createHmac("sha256", kunciToken()).update(isi).digest("base64url");

// ------------------------------------------------------------------ token potret
/** Awalan nonce untuk token PAKET (dipakai saat tanpa sinyal). Base64url tidak pernah memuat "~", jadi awalan ini tidak bisa ditiru
 *  oleh token biasa; dan karena nonce ikut ditandatangani, awalan tidak bisa ditambah/dibuang tanpa kunci server. */
export const AWALAN_NONCE_PAKET = "P~";

/** Token sekali pakai: akunId.waktuServerMs.nonce.tanda. Dipakai server untuk menetapkan waktu resmi foto.
 *  `opsi.paket` = token paket (nonce berawalan "P~"): foto yang memakainya dinilai sebagai foto tanpa sinyal (kuning, bukan hijau). */
export function buatTokenPotret(akunId: number, sekarangMs = Date.now(), opsi: { paket?: boolean } = {}): { token: string; t: number } {
  const nonce = (opsi.paket ? AWALAN_NONCE_PAKET : "") + crypto.randomBytes(12).toString("base64url");
  const isi = `${akunId}.${sekarangMs}.${nonce}`;
  return { token: `${isi}.${tandaToken(isi)}`, t: sekarangMs };
}

/** (23 Okt 2026) Paket token untuk kerja tanpa sinyal: `jumlah` token sekali pakai, semuanya bercap waktu server yang sama (`t`). */
export function buatPaketToken(akunId: number, jumlah: number, sekarangMs = Date.now()): { t: number; tokens: string[] } {
  const n = Math.max(1, Math.min(Math.floor(jumlah), 100));
  return { t: sekarangMs, tokens: Array.from({ length: n }, () => buatTokenPotret(akunId, sekarangMs, { paket: true }).token) };
}

export function bacaTokenPotret(token: unknown, akunId: number): { t: number; nonce: string; paket: boolean } | null {
  if (typeof token !== "string") return null;
  const p = token.split(".");
  if (p.length !== 4) return null;
  const isi = p.slice(0, 3).join(".");
  const a = Buffer.from(p[3]);
  const b = Buffer.from(tandaToken(isi));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(p[0]) !== akunId) return null;
  const t = Number(p[1]);
  if (!Number.isFinite(t) || t <= 0) return null;
  return { t, nonce: p[2], paket: p[2].startsWith(AWALAN_NONCE_PAKET) };
}

export const sha256Hex = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/** Kode verifikasi acak SGP-XXXX-XXXX-XXXX (48 bit). */
export function kodeAcak(kodeDariByte: (b: Uint8Array) => string): string {
  return kodeDariByte(crypto.randomBytes(6));
}

export function hashIp(ip: string): string {
  return crypto.createHmac("sha256", kunciToken()).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
export function ipDariHeader(h: Headers): string {
  const xf = h.get("x-forwarded-for");
  return (xf ? xf.split(",")[0].trim() : h.get("x-real-ip") ?? "tak-diketahui").slice(0, 64);
}

// ------------------------------------------------------------------ saklar
export async function modeBawaan(db: Db): Promise<ModeFoto> {
  const { data } = await db.from("sigap_foto_pengaturan").select("mode_bawaan").eq("id", 1).maybeSingle();
  return data?.mode_bawaan === "kamera" ? "kamera" : "unggah";
}

/** Mode efektif untuk daftar kegiatan: { kegiatan_id: 'kamera' | 'unggah' }. Tabel/baris tidak ada => 'unggah' (metode lama). */
export async function modeKegiatan(db: Db, kegiatanIds: number[]): Promise<Record<number, ModeFoto>> {
  const bawaan = await modeBawaan(db);
  const hasil: Record<number, ModeFoto> = {};
  for (const id of kegiatanIds) hasil[id] = bawaan;
  if (!kegiatanIds.length) return hasil;
  const { data } = await db.from("sigap_foto_pengaturan_kegiatan").select("kegiatan_id, mode").in("kegiatan_id", kegiatanIds);
  for (const r of data ?? []) hasil[r.kegiatan_id as number] = modeEfektif(bawaan, r.mode as ModeKegiatan);
  return hasil;
}

// ------------------------------------------------------------------ hak akses
export async function adalahAdminFoto(db: Db, akunId: number): Promise<boolean> {
  const { data } = await db.from("sigap_akun").select("super").eq("id", akunId).maybeSingle();
  if (data?.super === true) return true;
  const { izin } = await izinAkun(db, akunId);
  return boleh(izin, MENU_ADMIN_FOTO, "kelola");
}

/** Hanya akun super yang boleh menyetujui penghapusan (keputusan user: persetujuan ada di tangan pemilik). */
export async function adalahSuper(db: Db, akunId: number): Promise<boolean> {
  const { data } = await db.from("sigap_akun").select("super").eq("id", akunId).maybeSingle();
  return data?.super === true;
}

async function petugasIdDariAkun(db: Db, akunId: number): Promise<number | null> {
  const { data } = await db.from("sigap_akun").select("petugas_bencana_id").eq("id", akunId).maybeSingle();
  return (data?.petugas_bencana_id as number | null) ?? null;
}

/** Id akun PML yang mengawasi seorang akun (dari alokasi Sub SLS + kelompok tim). */
export async function pmlDariAkun(db: Db, akunId: number): Promise<number[]> {
  const pid = await petugasIdDariAkun(db, akunId);
  const hasil = new Set<number>();
  if (pid) {
    const { data } = await db.from("bencana_alokasi_subsls").select("pml_id").eq("ppl_id", pid).not("pml_id", "is", null);
    const pmlPetugas = Array.from(new Set((data ?? []).map((r) => r.pml_id as number)));
    if (pmlPetugas.length) {
      const { data: ak } = await db.from("sigap_akun").select("id").in("petugas_bencana_id", pmlPetugas).eq("aktif", true);
      for (const a of ak ?? []) hasil.add(a.id as number);
    }
  }
  const { data: kel } = await db.from("bencana_kelompok_tim").select("kegiatan_id, kelompok").eq("akun_id", akunId).eq("aktif", true);
  for (const k of kel ?? []) {
    const { data: rekan } = await db
      .from("bencana_kelompok_tim")
      .select("akun_id")
      .eq("kegiatan_id", k.kegiatan_id)
      .eq("kelompok", k.kelompok)
      .eq("peran", "pml")
      .eq("aktif", true);
    for (const r of rekan ?? []) hasil.add(r.akun_id as number);
  }
  hasil.delete(akunId);
  return Array.from(hasil);
}

/** Boleh memeriksa foto milik `pemotretId`? Admin foto, atau PML-nya. */
export async function bolehPeriksa(db: Db, akunId: number, pemotretId: number): Promise<boolean> {
  if (akunId === pemotretId) return false; // tidak memeriksa foto sendiri
  if (await adalahAdminFoto(db, akunId)) return true;
  return (await pmlDariAkun(db, pemotretId)).includes(akunId);
}

// ------------------------------------------------------------------ rekan tim
export type Rekan = { akun_id: number; nama: string; jenis: string; peran_di_tim: string | null };

/** Rekan tim = satu kelompok (kortim/PML) + PML<->PPL pada alokasi Sub SLS, difilter yang punya penugasan aktif di kegiatan tsb. */
export async function rekanTim(db: Db, akunId: number, kegiatanId: number): Promise<Rekan[]> {
  const kandidat = new Map<number, string | null>();
  const pid = await petugasIdDariAkun(db, akunId);

  const { data: kel } = await db.from("bencana_kelompok_tim").select("kegiatan_id, kelompok").eq("akun_id", akunId).eq("aktif", true);
  for (const k of kel ?? []) {
    const { data } = await db.from("bencana_kelompok_tim").select("akun_id, peran").eq("kegiatan_id", k.kegiatan_id).eq("kelompok", k.kelompok).eq("aktif", true);
    for (const r of data ?? []) kandidat.set(r.akun_id as number, r.peran as string);
  }

  if (pid) {
    const petugasRekan = new Map<number, string>();
    const { data: sbg } = await db.from("bencana_alokasi_subsls").select("pml_id").eq("ppl_id", pid).not("pml_id", "is", null);
    const pmls = Array.from(new Set((sbg ?? []).map((r) => r.pml_id as number)));
    for (const p of pmls) petugasRekan.set(p, "pml");
    const { data: sbp } = await db.from("bencana_alokasi_subsls").select("ppl_id").eq("pml_id", pid).not("ppl_id", "is", null);
    for (const r of sbp ?? []) petugasRekan.set(r.ppl_id as number, "ppl");
    if (pmls.length) {
      const { data: sau } = await db.from("bencana_alokasi_subsls").select("ppl_id").in("pml_id", pmls).not("ppl_id", "is", null);
      for (const r of sau ?? []) if (!petugasRekan.has(r.ppl_id as number)) petugasRekan.set(r.ppl_id as number, "ppl");
    }
    petugasRekan.delete(pid);
    const ids = Array.from(petugasRekan.keys());
    if (ids.length) {
      const { data: ak } = await db.from("sigap_akun").select("id, petugas_bencana_id").in("petugas_bencana_id", ids);
      for (const a of ak ?? []) if (!kandidat.has(a.id as number)) kandidat.set(a.id as number, petugasRekan.get(a.petugas_bencana_id as number) ?? null);
    }
  }
  kandidat.delete(akunId);
  const ids = Array.from(kandidat.keys());
  if (!ids.length) return [];
  const [{ data: ak }, { data: pen }] = await Promise.all([
    db.from("sigap_akun").select("id, nama, jenis, aktif").in("id", ids),
    db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).in("akun_id", ids),
  ]);
  const punyaPenugasan = new Set((pen ?? []).map((p) => p.akun_id as number));
  return (ak ?? [])
    .filter((a) => a.aktif && punyaPenugasan.has(a.id as number))
    .map((a) => ({ akun_id: a.id as number, nama: a.nama as string, jenis: a.jenis as string, peran_di_tim: kandidat.get(a.id as number) ?? null }))
    .sort((x, y) => x.nama.localeCompare(y.nama));
}

/** Pencarian petugas/pegawai lain (di luar tim). Hanya id, nama, jenis. */
export async function cariAkun(db: Db, q: string, kecuali: number): Promise<{ akun_id: number; nama: string; jenis: string }[]> {
  const bersih = q.trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ");
  if (bersih.length < 2) return [];
  const { data } = await db.from("sigap_akun").select("id, nama, jenis").eq("aktif", true).ilike("nama", `%${bersih}%`).neq("id", kecuali).order("nama").limit(10);
  return (data ?? []).map((a) => ({ akun_id: a.id as number, nama: a.nama as string, jenis: a.jenis as string }));
}

// ------------------------------------------------------------------ wilayah tugas
/** Titik KK pada Sub SLS alokasi petugas dalam kotak ±0,1° (~11 km) di sekitar titik foto. */
async function titikKkSekitar(db: Db, akunId: number, lat: number, lng: number): Promise<{ lat: number; lng: number; idsubsls: string }[]> {
  const pid = await petugasIdDariAkun(db, akunId);
  if (!pid) return [];
  const { data: al } = await db.from("bencana_alokasi_subsls").select("idsubsls").or(`ppl_id.eq.${pid},pml_id.eq.${pid}`);
  const subs = Array.from(new Set((al ?? []).map((r) => r.idsubsls as string)));
  if (!subs.length) return [];
  const hasil: { lat: number; lng: number; idsubsls: string }[] = [];
  const D = 0.1;
  for (let dari = 0; dari < 5000; dari += 1000) {
    const { data } = await db
      .from("bencana_pendataan_kk")
      .select("lat, lng, idsubsls")
      .in("idsubsls", subs)
      .eq("aktif", true)
      .gte("lat", lat - D).lte("lat", lat + D)
      .gte("lng", lng - D).lte("lng", lng + D)
      .range(dari, dari + 999);
    for (const r of data ?? []) if (typeof r.lat === "number" && typeof r.lng === "number") hasil.push({ lat: r.lat, lng: r.lng, idsubsls: r.idsubsls as string });
    if (!data || data.length < 1000) break;
  }
  return hasil;
}

/** Jarak (m) ke KK terdekat pada wilayah alokasi akun. null = wilayah tidak dikenal (tidak dinilai); 99999 = tidak ada KK dalam ~11 km. */
export async function jarakKeWilayah(db: Db, akunId: number, lat: number, lng: number): Promise<number | null> {
  const pid = await petugasIdDariAkun(db, akunId);
  if (!pid) return null;
  const { count } = await db.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).or(`ppl_id.eq.${pid},pml_id.eq.${pid}`);
  if (!count) return null;
  const titik = await titikKkSekitar(db, akunId, lat, lng);
  if (!titik.length) return 99999;
  let min = Infinity;
  for (const t of titik) min = Math.min(min, jarakM(lat, lng, t.lat, t.lng));
  return Math.round(min);
}

/** Jarak (m) dari titik foto ke rumah (domisili) akun; null bila domisili belum diisi / tidak sah. */
export async function jarakKeRumah(db: Db, akunId: number, lat: number, lng: number): Promise<number | null> {
  const { data } = await db.from("sigap_akun").select("domisili_lat, domisili_lng").eq("id", akunId).maybeSingle();
  const a = data?.domisili_lat, b = data?.domisili_lng;
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return Math.round(jarakM(lat, lng, a, b));
}

/** Teks lokasi ("Nagari X, Kec. Y") hanya bila ada KK pada Sub SLS alokasi dalam 1,5 km dari titik; selain itu null. */
export async function teksLokasi(db: Db, akunId: number, lat: number, lng: number): Promise<string | null> {
  const titik = await titikKkSekitar(db, akunId, lat, lng);
  let terdekat: { idsubsls: string; d: number } | null = null;
  for (const t of titik) {
    const d = jarakM(lat, lng, t.lat, t.lng);
    if (d <= 1500 && (!terdekat || d < terdekat.d)) terdekat = { idsubsls: t.idsubsls, d };
  }
  if (!terdekat) return null;
  const { data } = await db.from("bencana_wilayah").select("nagari, kecamatan").eq("idsubsls", terdekat.idsubsls).maybeSingle();
  if (!data) return null;
  const bagian = [data.nagari ? `Nagari ${data.nagari}` : null, data.kecamatan ? `Kec. ${data.kecamatan}` : null].filter(Boolean);
  return bagian.length ? bagian.join(", ") : null;
}

// ------------------------------------------------------------------ pembanding untuk tingkat kepercayaan
export type Pembanding = {
  sebelumnya: { lat: number; lng: number; ms: number } | null;
  koordinatIdentik: boolean;
  sidikLain: string[];
};

/** Foto terakhir pemotret (untuk kecepatan), koordinat identik di hari lain (slot berlokasi), dan sidik gambar foto lain pada kegiatan sama. */
export async function ambilPembanding(db: Db, akunId: number, kegiatanId: number, lat: number, lng: number, tanggal: string, cekIdentik: boolean): Promise<Pembanding> {
  const [{ data: akhir }, { data: sidik }] = await Promise.all([
    db.from("sigap_foto").select("lat, lng, diambil_at").eq("akun_pengambil", akunId).not("lat", "is", null).order("diambil_at", { ascending: false }).limit(1),
    db.from("sigap_foto").select("sidik_gambar").eq("kegiatan_id", kegiatanId).not("sidik_gambar", "is", null).order("id", { ascending: false }).limit(5000),
  ]);
  const a = (akhir ?? [])[0];
  let identik = false;
  if (cekIdentik) {
    const r = (n: number) => Math.round(n * 1e6) / 1e6;
    const { data } = await db
      .from("sigap_foto")
      .select("id")
      .eq("akun_pengambil", akunId)
      .neq("tanggal", tanggal)
      .gte("lat", r(lat) - 0.0000005).lte("lat", r(lat) + 0.0000005)
      .gte("lng", r(lng) - 0.0000005).lte("lng", r(lng) + 0.0000005)
      .limit(1);
    identik = !!(data && data.length);
  }
  return {
    sebelumnya: a ? { lat: a.lat as number, lng: a.lng as number, ms: new Date(a.diambil_at as string).getTime() } : null,
    koordinatIdentik: identik,
    sidikLain: (sidik ?? []).map((s) => s.sidik_gambar as string),
  };
}

export { slotBerlokasi };
