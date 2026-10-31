// app/api/sigap/seleksi-saya/route.ts
//
// (31 Okt 2026) Sisi Mitra pada seleksi petugas (paket 3): melihat seleksi yang diikuti, memeriksa kelayakan diri, mendaftar, dan mundur.
//   GET  ?id=N                          -> { seleksi, jendela, kelayakan, saya, boleh: {ppl, pml} }
//   POST { aksi: "daftar", id, peran }  -> terdaftar (diperiksa ulang di server: jadwal, kebutuhan peran, kelayakan)
//   POST { aksi: "mundur", id }         -> mundur selama pendaftaran masih dibuka
// Paket 4 (SQL 20261031i; bila belum dijalankan bagian ini diam):
//   GET  juga memuat { tes, hasil }  -- tes seleksi (status, jadwal, skor bila ditampilkan) dan hasil yang sudah diumumkan (+ boleh konfirmasi)
//   POST { aksi: "mulai_tes", id }   -> soal TANPA kunci + batas waktu (satu kali; mulai lagi = melanjutkan sesi yang berjalan)
//   POST { aksi: "kirim_tes", id, jawaban: {"1":"A",...} } -> dinilai di server
//   POST { aksi: "konfirmasi", id, bersedia: boolean } -> lulus menyatakan bersedia/menolak; bersedia otomatis masuk penugasan kegiatan
// Hanya akun Mitra aktif anggota pool (lib/portal/seleksiKandidat.bacaCalonSatu). Seleksi berstatus draft/batal tidak terlihat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, sesiDariHeader } from "@/lib/sigapAkses";
import { bacaSyarat, nilaiKelayakan, sisaKebutuhan, type HasilKelayakan } from "@/lib/seleksiSyarat";
import { bersihkanJawaban, hitungBatas, hitungSkor, lewatBatas, TOLERANSI_DETIK, validasiSoalJson } from "@/lib/sigapTes";
import { putusanKonfirmasi, statusTesSeleksi } from "@/lib/seleksiNilai";
import { tugaskanPeserta } from "@/lib/portal/seleksiPenugasan";
import { jendelaPendaftaran, peranDaftarSah, putusanDaftar, type PeranDaftar } from "@/lib/seleksiDaftar";
import { bacaCalonSatu, bacaWilayah, tahunPoolKegiatan } from "@/lib/portal/seleksiKandidat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function akunAktif(req: NextRequest, db: Db): Promise<number | null> {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
  return a && a.aktif ? akunId : null;
}

type BarisSeleksi = {
  id: number; kegiatan_id: number; nama: string; jalur: string; status: string; kebutuhan_ppl: number; kebutuhan_pml: number; sudah_ppl: number; sudah_pml: number;
  syarat: unknown; jadwal_buka: string | null; jadwal_tutup: string | null;
};

async function muat(db: Db, id: number): Promise<BarisSeleksi | null> {
  const { data } = await db.from("sigap_seleksi").select("id, kegiatan_id, nama, jalur, status, kebutuhan_ppl, kebutuhan_pml, sudah_ppl, sudah_pml, syarat, jadwal_buka, jadwal_tutup").eq("id", id).maybeSingle();
  const b = data as BarisSeleksi | null;
  // draft/batal dan penunjukan langsung tidak terlihat oleh Mitra
  return b && b.jalur === "seleksi" && b.status !== "draft" && b.status !== "batal" ? b : null;
}

/** Kelayakan + putusan per peran untuk satu Mitra pada satu seleksi. */
async function nilaiSaya(db: Db, b: BarisSeleksi, akunId: number) {
  const tahun = await tahunPoolKegiatan(db, b.kegiatan_id);
  const { calon, alasan } = await bacaCalonSatu(db, akunId, tahun);
  if (!calon) return { ok: false as const, alasan: alasan ?? "Tidak memenuhi ketentuan peserta." };
  const kelayakan: HasilKelayakan = nilaiKelayakan(calon, await bacaWilayah(db, b.id), bacaSyarat(b.syarat));
  const jendela = jendelaPendaftaran({ status: b.status, jadwal_buka: b.jadwal_buka, jadwal_tutup: b.jadwal_tutup, nowMs: Date.now() });
  const sisaPpl = sisaKebutuhan(b.kebutuhan_ppl, b.sudah_ppl);
  const sisaPml = sisaKebutuhan(b.kebutuhan_pml, b.sudah_pml);
  const putus = (peran: PeranDaftar) => putusanDaftar({ jendela, kelayakan, peran, sisaPpl, sisaPml });
  return { ok: true as const, kelayakan, jendela, sisaPpl, sisaPml, putus };
}

type Paket4 = { tes_aktif: boolean; tes_buka_at: string | null; tes_tutup_at: string | null; tes_durasi_menit: number; info_pelatihan: string | null; diumumkan_at: string | null; konfirmasi_batas: string | null; tampil_nilai: boolean };
/** Kolom paket 4; belum ada (SQL belum dijalankan) = null, fitur tes/hasil tidak muncul. */
async function bacaPaket4(db: Db, id: number): Promise<Paket4 | null> {
  const { data, error } = await db.from("sigap_seleksi").select("tes_aktif, tes_buka_at, tes_tutup_at, tes_durasi_menit, info_pelatihan, diumumkan_at, konfirmasi_batas, tampil_nilai").eq("id", id).maybeSingle();
  return error || !data ? null : (data as Paket4);
}

type SayaPaket4 = { hasil: string | null; peringkat: number | null; skor_akhir: number | string | null; konfirmasi: string | null; ditugaskan_at: string | null };
async function bacaSayaPaket4(db: Db, id: number, akunId: number): Promise<SayaPaket4 | null> {
  const { data, error } = await db.from("sigap_seleksi_peserta").select("hasil, peringkat, skor_akhir, konfirmasi, ditugaskan_at").eq("seleksi_id", id).eq("akun_id", akunId).maybeSingle();
  return error || !data ? null : (data as SayaPaket4);
}

async function ringkasPaket4(db: Db, id: number, akunId: number, terdaftar: boolean) {
  const p4 = await bacaPaket4(db, id);
  if (!p4 || !terdaftar) return { tes: null, hasil: null };
  const now = Date.now();
  let tes = null;
  if (p4.tes_aktif) {
    const { count } = await db.from("sigap_seleksi_soal").select("nomor", { count: "exact", head: true }).eq("seleksi_id", id);
    const { data: ses } = await db.from("sigap_seleksi_sesi").select("batas_at, selesai_at, skor").eq("seleksi_id", id).eq("akun_id", akunId).maybeSingle();
    const status = statusTesSeleksi({ aktif: true, jumlahSoal: count ?? 0, buka: p4.tes_buka_at, tutup: p4.tes_tutup_at, sesi: ses ? { batas_at: ses.batas_at as string, selesai_at: (ses.selesai_at as string | null) ?? null } : null, nowMs: now });
    tes = { status, durasi_menit: p4.tes_durasi_menit, buka: p4.tes_buka_at, tutup: p4.tes_tutup_at, jumlah_soal: count ?? 0, skor: status === "selesai" && p4.tampil_nilai && ses?.skor !== null && ses?.skor !== undefined ? Number(ses.skor) : null };
  }
  let hasil = null;
  if (p4.diumumkan_at) {
    const sp4 = await bacaSayaPaket4(db, id, akunId);
    if (sp4) {
      const k = putusanKonfirmasi({ hasil: sp4.hasil, diumumkan: true, batas: p4.konfirmasi_batas, nowMs: now });
      hasil = {
        hasil: sp4.hasil, peringkat: p4.tampil_nilai ? sp4.peringkat : null, skor: p4.tampil_nilai && sp4.skor_akhir !== null ? Number(sp4.skor_akhir) : null,
        konfirmasi: sp4.konfirmasi, ditugaskan: !!sp4.ditugaskan_at, boleh_konfirmasi: k.boleh && !sp4.ditugaskan_at, alasan_konfirmasi: sp4.ditugaskan_at ? "Anda sudah tercatat dalam penugasan." : k.alasan,
        info_pelatihan: p4.info_pelatihan, batas_konfirmasi: p4.konfirmasi_batas,
      };
    }
  }
  return { tes, hasil };
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = await akunAktif(req, db);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return galat("Seleksi tidak sah.");
    const b = await muat(db, id);
    if (!b) return galat("Seleksi tidak ditemukan atau belum dibuka.", 404);
    const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", b.kegiatan_id).maybeSingle();
    const { data: saya } = await db.from("sigap_seleksi_peserta").select("peran, status, mendaftar_at").eq("seleksi_id", id).eq("akun_id", akunId).maybeSingle();
    const n = await nilaiSaya(db, b, akunId);
    const s = bacaSyarat(b.syarat);
    const seleksi = {
      id: b.id, nama: b.nama, kegiatan: (keg?.nama as string) ?? "", status: b.status, jadwal_buka: b.jadwal_buka, jadwal_tutup: b.jadwal_tutup,
      sisa_ppl: sisaKebutuhan(b.kebutuhan_ppl, b.sudah_ppl), sisa_pml: sisaKebutuhan(b.kebutuhan_pml, b.sudah_pml),
      syarat: { domisili: s.domisili.aktif ? s.domisili.level : null, jarak_km: s.jarak.aktif ? s.jarak.maks_km : null },
    };
    const p4 = await ringkasPaket4(db, id, akunId, saya?.status === "terdaftar");
    if (!n.ok) return NextResponse.json({ seleksi, tidak_berhak: n.alasan, saya: saya ?? null, ...p4 });
    const ppl = n.putus("ppl");
    const pml = n.putus("pml");
    return NextResponse.json({ seleksi, jendela: n.jendela, kelayakan: n.kelayakan, saya: saya ?? null, boleh: { ppl, pml }, ...p4 });
  } catch {
    return galat("Gagal memuat seleksi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = await akunAktif(req, db);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers) !== null) return galat("Tidak dapat mendaftar saat masuk sebagai akun lain.", 403);
    const isi = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = Number(isi?.id);
    if (!isi || !Number.isInteger(id) || id <= 0) return galat("Seleksi tidak sah.");
    const b = await muat(db, id);
    if (!b) return galat("Seleksi tidak ditemukan atau belum dibuka.", 404);

    if (isi.aksi === "mundur") {
      if (b.status !== "dibuka") return galat("Pendaftaran sudah ditutup; tidak dapat mundur lewat aplikasi.");
      const { error } = await db.from("sigap_seleksi_peserta").update({ status: "mundur", diubah_at: new Date().toISOString() }).eq("seleksi_id", id).eq("akun_id", akunId);
      if (error) return galat("Gagal menyimpan.", 500);
      return NextResponse.json({ ok: true });
    }

    // ---- paket 4: tes seleksi dan konfirmasi
    if (isi.aksi === "mulai_tes" || isi.aksi === "kirim_tes" || isi.aksi === "konfirmasi") {
      const p4 = await bacaPaket4(db, id);
      if (!p4) return galat("Fitur ini belum aktif.", 404);
      const { data: sy } = await db.from("sigap_seleksi_peserta").select("peran, status").eq("seleksi_id", id).eq("akun_id", akunId).maybeSingle();
      if (!sy || sy.status !== "terdaftar") return galat("Anda tidak terdaftar pada seleksi ini.", 403);
      const sekarang = new Date();

      if (isi.aksi === "konfirmasi") {
        const sp4 = await bacaSayaPaket4(db, id, akunId);
        const k = putusanKonfirmasi({ hasil: sp4?.hasil ?? null, diumumkan: !!p4.diumumkan_at, batas: p4.konfirmasi_batas, nowMs: sekarang.getTime() });
        if (!k.boleh) return galat(k.alasan ?? "Belum dapat mengonfirmasi.", 403);
        if (typeof isi.bersedia !== "boolean") return galat("Pilih bersedia atau tidak bersedia.");
        if (sp4?.ditugaskan_at && !isi.bersedia) return galat("Anda sudah tercatat dalam penugasan. Hubungi penanggung jawab kegiatan untuk mengundurkan diri.", 403);
        const { error } = await db.from("sigap_seleksi_peserta").update({ konfirmasi: isi.bersedia ? "bersedia" : "menolak", konfirmasi_at: sekarang.toISOString(), diubah_at: sekarang.toISOString() }).eq("seleksi_id", id).eq("akun_id", akunId);
        if (error) return galat("Gagal menyimpan konfirmasi.", 500);
        let ditugaskan: string | null = null;
        if (isi.bersedia) {
          const t = await tugaskanPeserta(db, { seleksiId: id, kegiatanId: b.kegiatan_id, akunId, peran: sy.peran as "ppl" | "pml" });
          ditugaskan = t.hasil;
        }
        return NextResponse.json({ ok: true, ditugaskan });
      }

      // tes
      if (!p4.tes_aktif || !p4.tes_tutup_at || !p4.tes_buka_at) return galat("Tes seleksi tidak tersedia.", 404);
      if (b.status !== "dibuka" && b.status !== "ditutup") return galat("Tes seleksi sudah tidak dibuka.", 403);
      const { data: soalDb } = await db.from("sigap_seleksi_soal").select("nomor, teks, opsi, kunci, bobot").eq("seleksi_id", id).order("nomor");
      const soal = (soalDb ?? []) as { nomor: number; teks: string; opsi: { kode: string; teks: string }[]; kunci: string; bobot: number | string }[];
      const { data: ses } = await db.from("sigap_seleksi_sesi").select("batas_at, selesai_at, jawaban").eq("seleksi_id", id).eq("akun_id", akunId).maybeSingle();

      if (isi.aksi === "mulai_tes") {
        if (ses && (ses.selesai_at || lewatBatas(sekarang, ses.batas_at as string))) return galat("Tes sudah Anda selesaikan.", 403);
        let batas = ses ? (ses.batas_at as string) : null;
        if (!ses) {
          const st = statusTesSeleksi({ aktif: true, jumlahSoal: soal.length, buka: p4.tes_buka_at, tutup: p4.tes_tutup_at, sesi: null, nowMs: sekarang.getTime() });
          if (st !== "buka") return galat(st === "belum_buka" ? "Tes belum dibuka." : st === "terlewat" ? "Waktu tes sudah ditutup." : "Tes belum tersedia.", 403);
          batas = hitungBatas(sekarang, p4.tes_durasi_menit, p4.tes_tutup_at).toISOString();
          const { error } = await db.from("sigap_seleksi_sesi").insert({ seleksi_id: id, akun_id: akunId, mulai_at: sekarang.toISOString(), batas_at: batas });
          if (error) return galat("Gagal memulai tes.", 500);
        }
        return NextResponse.json({ ok: true, batas_at: batas, soal: soal.map((x) => ({ nomor: x.nomor, teks: x.teks, opsi: x.opsi })) });
      }

      // kirim_tes
      if (!ses) return galat("Tes belum dimulai.", 403);
      if (ses.selesai_at) return galat("Tes sudah Anda selesaikan.", 403);
      const terlambat = lewatBatas(sekarang, ses.batas_at as string, TOLERANSI_DETIK);
      const bentuk = validasiSoalJson(soal.map((x) => ({ nomor: x.nomor, teks: x.teks, opsi: x.opsi, kunci: x.kunci, bobot: x.bobot })));
      const jawaban = terlambat ? {} : bersihkanJawaban(isi.jawaban, bentuk.soal);
      const nilai = hitungSkor(bentuk.soal, jawaban);
      const { error } = await db.from("sigap_seleksi_sesi").update({ selesai_at: sekarang.toISOString(), jawaban, skor: nilai.skor, benar: nilai.benar, total: nilai.total }).eq("seleksi_id", id).eq("akun_id", akunId);
      if (error) return galat("Gagal menyimpan jawaban.", 500);
      return NextResponse.json({ ok: true, terlambat, skor: p4.tampil_nilai ? nilai.skor : null, benar: p4.tampil_nilai ? nilai.benar : null, total: nilai.total });
    }

    if (isi.aksi !== "daftar") return galat("Aksi tidak dikenal.");
    if (!peranDaftarSah(isi.peran)) return galat("Pilih peran PPL atau PML.");
    const n = await nilaiSaya(db, b, akunId);
    if (!n.ok) return galat(n.alasan, 403);
    const p = n.putus(isi.peran);
    if (!p.boleh) return galat(p.alasan ?? "Belum dapat mendaftar.", 403);
    const { error } = await db.from("sigap_seleksi_peserta").upsert({ seleksi_id: id, akun_id: akunId, peran: isi.peran, status: "terdaftar", diubah_at: new Date().toISOString() }, { onConflict: "seleksi_id,akun_id" });
    if (error) return galat("Gagal mendaftar. Coba lagi sebentar lagi.", 500);
    return NextResponse.json({ ok: true });
  } catch {
    return galat("Gagal memproses pendaftaran.", 500);
  }
}
