// app/api/sigap/pelatihan/kuis/route.ts
//
// (7-8 Okt 2026) SIGAP > Pelatihan > Adu Sigap -- sisi PESERTA (HP). Satu ruang per kelas.
// GET ?kelas=N               -> keadaan ruang kelas N (ringan; tanpa kunci selama soal berjalan). Dipoll ~1,5 dtk: cukup cek HMAC sesi.
// GET ?kelas=N&detail=1      -> + keadaan pribadi (sudah menjawab? poin, peringkat). Wajib peserta pelatihan / instruktur.
// GET ?kelas=N&review=1      -> review jawaban & penjelasan (hanya soal yang sudah dibuka jawabannya)
// GET ?daftar=1              -> ruang aktif tiap kelas (utk instruktur yang memilih kelas)
// POST {aksi:"gabung", kelas}                         -> bergabung ke ruang aktif kelas
// POST {aksi:"jawab", kelas, ruang_id, nomor, pilihan} -> kirim jawaban (satu kali per soal; waktu & poin dihitung server)
// Peserta dengan penugasan berkelas selalu dipaksa ke kelasnya sendiri. Akun berizin `pelatihan.kelola` (inda/instruktur) dan peserta
// tanpa kelas boleh memilih kelas mana pun dan ikut bermain.

import { NextRequest, NextResponse } from "next/server";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { catatJawaban, dariCache, gabungRuang, keadaanPeserta, reviewPeserta, ruangKelas, ruangSemuaKelas } from "@/lib/sigapKuisDb";
import { infoKuis, kelasInstruktur } from "@/lib/sigapKuisDb";
import { KELAS_GABUNGAN, KELAS_PILIHAN, kelasSah, labelKelas } from "@/lib/sigapKuis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const kelasValid = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return kelasSah(n) ? n : null; // (8 Okt 2026) 0 = Semua Kelas
};
/** (8 Okt 2026) Ruang "Semua Kelas" sedang aktif? Peserta berkelas boleh/diarahkan masuk ke sana. */
async function gabunganAktif(db: NonNullable<ReturnType<typeof dbAdmin>>, kegiatanId: number): Promise<boolean> {
  const g = await ruangKelas(db, kegiatanId, KELAS_GABUNGAN);
  return !!g && g.status !== "selesai";
}
/** Kelas yang dipakai peserta berkelas: kelasnya sendiri, atau 0 bila diminta / ruang kelasnya tidak aktif tetapi ruang gabungan aktif. */
async function kelasPeserta(db: NonNullable<ReturnType<typeof dbAdmin>>, kegiatanId: number, milik: number, diminta: number | null): Promise<number> {
  const gab = await gabunganAktif(db, kegiatanId);
  const sendiri = await ruangKelas(db, kegiatanId, milik);
  const sendiriAktif = !!sendiri && sendiri.status !== "selesai";
  if (diminta === KELAS_GABUNGAN) return gab || !sendiriAktif ? KELAS_GABUNGAN : milik; // minta 0 tapi gabungan sudah selesai & kelasnya aktif -> kelasnya
  if (!gab) return milik;
  return sendiriAktif ? milik : KELAS_GABUNGAN;
}

type Akses = { kelas: number | null; instruktur: boolean; kelas_saya?: number | null };
/** Siapa boleh bermain: peserta pelatihan (kelasnya dipaksa) atau akun berizin pengelola (bebas pilih kelas). */
async function aksesMain(db: NonNullable<ReturnType<typeof dbAdmin>>, kegiatanId: number, akunId: number): Promise<Akses | null> {
  return dariCache(`akses:${kegiatanId}:${akunId}`, 60_000, async () => {
    const p = await pesertaPelatihan(db, akunId, kegiatanId);
    const { izin } = await izinAkun(db, akunId);
    const instruktur = boleh(izin, "pelatihan.kelola", "lihat", kegiatanId);
    if (p) return { kelas: p.kelas, instruktur };
    return instruktur ? { kelas: null, instruktur: true, kelas_saya: await kelasInstruktur(db, kegiatanId, akunId) } : null;
  });
}

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await dariCache("kegiatan", 60_000, () => idKegiatanPelatihan(db));
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const now = new Date();
    const q = req.nextUrl.searchParams;

    if (q.get("daftar") === "1") {
      const peta = await ruangSemuaKelas(db, kegiatanId);
      const baris = [];
      for (const k of KELAS_PILIHAN) {
        const r = peta.get(k);
        baris.push({ kelas: k, ada: !!r && r.status !== "selesai", status: r ? r.status : null, judul: r ? (await infoKuis(db, r.kuis_id)).judul : null });
      }
      return NextResponse.json({ sekarang: now.toISOString(), ruang: baris });
    }

    let kelas = kelasValid(q.get("kelas"));
    let pribadi: number | null = null;
    const perluAkun = q.get("detail") === "1" || q.get("review") === "1";
    if (perluAkun) {
      const akun = await akunDariRequest(req, db);
      if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
      const ak = await aksesMain(db, kegiatanId, akun.id);
      if (!ak) return galat("Akun ini bukan peserta pelatihan.", 403);
      if (ak.kelas !== null) kelas = await kelasPeserta(db, kegiatanId, ak.kelas, kelas);
      else if (kelas === null && ak.kelas_saya) kelas = ak.kelas_saya; // inda/instruktur: langsung ke kelasnya
      pribadi = akun.id;
    }
    if (kelas === null) return galat("Kelas belum dipilih.", 400);
    const ruang = await ruangKelas(db, kegiatanId, kelas);
    // (8 Okt 2026) ruang kelas ini tidak aktif tetapi "Semua Kelas" aktif -> beri tahu klien utk pindah
    const pindah = kelas !== KELAS_GABUNGAN && (!ruang || ruang.status === "selesai") && (await gabunganAktif(db, kegiatanId)) ? KELAS_GABUNGAN : null;
    if (!ruang) return NextResponse.json({ ada: false, kelas, pindah_kelas: pindah, sekarang: now.toISOString() });

    if (q.get("review") === "1" && pribadi !== null) return NextResponse.json({ sekarang: now.toISOString(), ...(await reviewPeserta(db, ruang, pribadi)) });
    return NextResponse.json({ ada: true, pindah_kelas: pindah, ...(await keadaanPeserta(db, ruang, now, pribadi)) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const body = await req.json().catch(() => null);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await dariCache("kegiatan", 60_000, () => idKegiatanPelatihan(db));
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const ak = await aksesMain(db, kegiatanId, akun.id);
    if (!ak) return galat("Akun ini bukan peserta pelatihan.", 403);
    const kelas = ak.kelas !== null ? await kelasPeserta(db, kegiatanId, ak.kelas, kelasValid(body?.kelas)) : kelasValid(body?.kelas);
    if (kelas === null) return galat("Pilih kelas dulu.", 400);
    const aksi = String(body?.aksi ?? "");
    const now = new Date();

    if (aksi === "gabung") {
      const ruang = await ruangKelas(db, kegiatanId, kelas);
      if (!ruang || ruang.status === "selesai") return galat(`Belum ada kuis yang dibuka untuk ${labelKelas(kelas)}.`, 409);
      const h = await gabungRuang(db, akun.id, ruang);
      if (!h.ok) return galat(h.error, h.status);
      return NextResponse.json({ ok: true, ruang_id: ruang.id, kelas });
    }

    if (aksi === "jawab") {
      const ruangId = Number(body?.ruang_id);
      const nomor = Number(body?.nomor);
      if (!Number.isInteger(ruangId) || !Number.isInteger(nomor)) return galat("Data jawaban tidak valid.");
      const ruang = await ruangKelas(db, kegiatanId, kelas); // cache 500 ms; ruang aktif milik kelas ini
      if (!ruang || ruang.id !== ruangId) return galat("Ruang tidak ditemukan.", 404);
      const h = await catatJawaban(db, akun.id, ruangId, nomor, String(body?.pilihan ?? ""), now);
      if (!h.ok) return galat(h.error, h.status);
      return NextResponse.json({ ok: true, sudah: h.sudah === true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
