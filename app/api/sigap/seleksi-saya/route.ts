// app/api/sigap/seleksi-saya/route.ts
//
// (31 Okt 2026) Sisi Mitra pada seleksi petugas (paket 3): melihat seleksi yang diikuti, memeriksa kelayakan diri, mendaftar, dan mundur.
//   GET  ?id=N                          -> { seleksi, jendela, kelayakan, saya, boleh: {ppl, pml} }
//   POST { aksi: "daftar", id, peran }  -> terdaftar (diperiksa ulang di server: jadwal, kebutuhan peran, kelayakan)
//   POST { aksi: "mundur", id }         -> mundur selama pendaftaran masih dibuka
// Hanya akun Mitra aktif anggota pool (lib/portal/seleksiKandidat.bacaCalonSatu). Seleksi berstatus draft/batal tidak terlihat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, sesiDariHeader } from "@/lib/sigapAkses";
import { bacaSyarat, nilaiKelayakan, sisaKebutuhan, type HasilKelayakan } from "@/lib/seleksiSyarat";
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
    if (!n.ok) return NextResponse.json({ seleksi, tidak_berhak: n.alasan, saya: saya ?? null });
    const ppl = n.putus("ppl");
    const pml = n.putus("pml");
    return NextResponse.json({ seleksi, jendela: n.jendela, kelayakan: n.kelayakan, saya: saya ?? null, boleh: { ppl, pml } });
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
