// app/api/bencana/undangan/daftar/route.ts
//
// (4 Okt 2026) Formulir "Lengkapi Data / Daftar" di halaman Undangan Konfirmasi
// Bersama (/bencana/undangan).
//
// ALUR UTAMA: petugas MEMILIH NAMA dari daftar (dropdown) -- hanya nama yang sudah
// ada di data (petugas mitra aktif + daftar mitra) -- lalu formulir hanya meminta
// data yang BELUM LENGKAP. Identitas (NIK + email + tgl lahir) tetap diverifikasi
// dgn aturan yg sama seperti /verifikasi (salah 5x -> terkunci 30 menit).
// Cadangan: pilihan "Nama saya tidak ada di daftar" -> pendaftar baru (petugas
// mitra aktif, sumber_roster='pendaftaran_mandiri_bencana', utk ditinjau admin).
//
// GET                -> { pilihan: [{ k, n, d }] }  k = "p:<id petugas>" | "m:<id mitra>"
// GET ?k=p:12        -> { nama, butuh: { no_hp, lokasi, jenis_kelamin, ... } }
// POST { pilihan, nama?, nik, email, tanggal_lahir, ...kolom yg diminta..., website }
//   -> { ok:true, mode:'baru'|'lengkapi', nama, tipe, path }
//   -> { ok:false, kolom, sisa_percobaan } kalau identitas tdk cocok
//   -> 400 / 409 / 429 dgn { error }
//
// Semua pengisian FILL-ONLY: tidak pernah menimpa isian yg sudah ada (kecuali titik
// GPS yg baru ditekan petugas).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  MAKS_GAGAL,
  catatGagal,
  cekKunci,
  emailValid,
  nikValid,
  normEmail,
  normNama,
  normNik,
  resetGagal,
  tanggalValid,
  tentukanTujuan,
  type Db,
} from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "benar" | "salah" | "belum_ada" | "belum_dicek";

const PENDIDIKAN = [
  "Tamat SD/Sederajat",
  "Tamat SMP/Sederajat",
  "Tamat SMA/Sederajat",
  "Tamat D1/D2/D3",
  "Tamat D4/S1",
  "Tamat S2",
  "Tamat S3",
];
const PEKERJAAN = [
  "Wiraswasta",
  "Mengurus Rumah Tangga",
  "Pelajar / Mahasiswa",
  "Kader PKK / Karang Taruna / Kader Lainnya",
  "Pegawai / Guru Honorer",
  "Aparat Desa / Kelurahan",
  "Lainnya",
];
const STATUS_MITRA_GUGUR = ["mengundurkan diri", "ditolak", "ditolak (mitra)", "penawaran kerja dibatalkan"];

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/** 08xx / 628xx / 8xx / +628xx -> +628xx ; null kalau bukan nomor seluler Indonesia yg wajar. */
function normHp(s: string): string | null {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  if (!/^628\d{8,12}$/.test(d)) return null;
  return "+" + d;
}

function hitungUmur(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  let umur = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) umur -= 1;
  return umur;
}

function str(v: unknown, maks = 200): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, maks) : "";
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function kosong(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}
/** "(002) LOLO" -> "LOLO" */
function bersihDesa(s: string | null | undefined): string {
  return String(s ?? "").replace(/^\(\d+\)\s*/, "").trim();
}
/** "(050) LEMBAH GUMANTI" -> "LEMBAH GUMANTI" */
const bersihKec = bersihDesa;
function judul(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

type PetugasRow = {
  id: number;
  nama: string;
  token: string;
  aktif: boolean;
  status_kepegawaian: string;
  no_hp: string | null;
  lokasi_status: string | null;
  umur: number | null;
  jenis_kelamin: string | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  bisa_mengendarai_motor: boolean | null;
  punya_kendaraan_bermotor: boolean | null;
  punya_hp_android: boolean | null;
  pernah_capi: boolean | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  alamat_detail: string | null;
};
type MitraRow = {
  id: number;
  nama: string;
  nik: string | null;
  email: string | null;
  tanggal_lahir: string | null;
  no_telp: string | null;
  alamat_kecamatan: string | null;
  alamat_desa: string | null;
  latitude: number | null;
  status_seleksi: string | null;
};

const KOLOM_PETUGAS =
  "id, nama, token, aktif, status_kepegawaian, no_hp, lokasi_status, umur, jenis_kelamin, pendidikan, pekerjaan, bisa_mengendarai_motor, punya_kendaraan_bermotor, punya_hp_android, pernah_capi, alamat_kecamatan, alamat_nagari, alamat_detail";
const KOLOM_MITRA = "id, nama, nik, email, tanggal_lahir, no_telp, alamat_kecamatan, alamat_desa, latitude, status_seleksi";

type Butuh = {
  no_hp: boolean;
  lokasi: boolean;
  jenis_kelamin: boolean;
  pendidikan: boolean;
  pekerjaan: boolean;
  bisa_mengendarai_motor: boolean;
  punya_kendaraan_bermotor: boolean;
  punya_hp_android: boolean;
  pernah_capi: boolean;
  alamat: boolean;
};

/** Kolom mana yg MASIH KOSONG (perlu ditanyakan) utk pilihan ini. petugas=null -> belum jadi petugas. */
function hitungButuh(petugas: PetugasRow | null, mitra: MitraRow | null): Butuh {
  const hpMitra = mitra?.no_telp ? normHp(mitra.no_telp) : null;
  const alamatMitraAda = !!mitra && !kosong(bersihKec(mitra.alamat_kecamatan)) && !kosong(bersihDesa(mitra.alamat_desa));
  const alamatPetugasAda = !!petugas && !kosong(petugas.alamat_kecamatan) && !kosong(petugas.alamat_nagari);
  return {
    no_hp: kosong(petugas?.no_hp) && !hpMitra,
    lokasi: petugas?.lokasi_status !== "riil",
    jenis_kelamin: kosong(petugas?.jenis_kelamin),
    pendidikan: kosong(petugas?.pendidikan),
    pekerjaan: kosong(petugas?.pekerjaan),
    bisa_mengendarai_motor: petugas?.bisa_mengendarai_motor == null,
    punya_kendaraan_bermotor: petugas?.punya_kendaraan_bermotor == null,
    punya_hp_android: petugas?.punya_hp_android == null,
    pernah_capi: petugas?.pernah_capi == null,
    alamat: !alamatPetugasAda && !alamatMitraAda,
  };
}

type Pilihan = { petugas: PetugasRow | null; mitraRows: MitraRow[]; mitra: MitraRow | null; nama: string };

/** Menerjemahkan kunci pilihan ("p:12" / "m:34") jadi data petugas + baris mitra yang relevan. */
async function resolvePilihan(db: Db, k: string): Promise<Pilihan | { error: string; status: number }> {
  const m = /^([pm]):(\d+)$/.exec(k);
  if (!m) return { error: "Pilihan nama tidak valid.", status: 400 };
  const id = Number(m[2]);

  let petugas: PetugasRow | null = null;
  let mitraDipilih: MitraRow | null = null;
  let nama = "";

  if (m[1] === "p") {
    const { data } = await db.from("bencana_petugas").select(KOLOM_PETUGAS).eq("id", id).maybeSingle();
    petugas = (data as PetugasRow | null) ?? null;
    if (!petugas) return { error: "Nama tidak ditemukan.", status: 404 };
    if (!petugas.aktif || petugas.status_kepegawaian !== "mitra") {
      return { error: "Nama ini terdaftar dengan status lain. Hubungi admin BPS Kabupaten Solok.", status: 409 };
    }
    nama = petugas.nama;
  } else {
    const { data } = await db.from("bencana_mitra").select(KOLOM_MITRA).eq("id", id).maybeSingle();
    mitraDipilih = (data as MitraRow | null) ?? null;
    if (!mitraDipilih) return { error: "Nama tidak ditemukan.", status: 404 };
    nama = mitraDipilih.nama;
  }

  const kunciNama = normNama(nama);
  const { data: semuaMitra } = await db.from("bencana_mitra").select(KOLOM_MITRA);
  let mitraRows = ((semuaMitra ?? []) as MitraRow[]).filter((r) => normNama(r.nama) === kunciNama);
  // Nama kembar: pilih baris mitra yang desanya sama dgn pilihan.
  if (mitraDipilih) {
    mitraRows = mitraRows.filter((r) => r.id === mitraDipilih!.id);
  } else if (mitraRows.length > 1 && petugas) {
    const desa = normNama(petugas.alamat_nagari ?? "");
    const sama = mitraRows.filter((r) => normNama(bersihDesa(r.alamat_desa)) === desa);
    if (sama.length > 0) mitraRows = sama;
  }

  // Pilihan dari daftar mitra tetapi ternyata sudah ada petugasnya (nama sama) -> pakai petugas itu.
  if (!petugas) {
    const { data: semuaPetugas } = await db.from("bencana_petugas").select(KOLOM_PETUGAS);
    const sama = ((semuaPetugas ?? []) as PetugasRow[]).filter((p) => normNama(p.nama) === kunciNama);
    if (sama.length > 0) {
      const desaM = normNama(bersihDesa(mitraDipilih?.alamat_desa));
      const cocok = sama.length === 1 ? sama : sama.filter((p) => normNama(p.nama) === kunciNama && normNama(p.alamat_nagari ?? "") === desaM);
      if (cocok.length === 1) {
        petugas = cocok[0];
        if (!petugas.aktif || petugas.status_kepegawaian !== "mitra") {
          return { error: "Nama ini terdaftar dengan status lain. Hubungi admin BPS Kabupaten Solok.", status: 409 };
        }
      } else {
        return { error: "Ada lebih dari satu petugas dengan nama ini. Hubungi admin.", status: 409 };
      }
    }
  }

  return { petugas, mitraRows, mitra: mitraRows.length === 1 ? mitraRows[0] : null, nama };
}

// ------------------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const db: Db | null = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  try {
    const k = req.nextUrl.searchParams.get("k");
    if (k) {
      const p = await resolvePilihan(db, k);
      if ("error" in p) return NextResponse.json({ error: p.error }, { status: p.status });
      return NextResponse.json({ nama: p.nama, butuh: hitungButuh(p.petugas, p.mitra) });
    }

    // Daftar nama utk dropdown: petugas mitra aktif + mitra yang belum jadi petugas (kecuali yg gugur).
    const [{ data: petugasData }, { data: mitraData }] = await Promise.all([
      db.from("bencana_petugas").select("id, nama, alamat_kecamatan, alamat_nagari").eq("aktif", true).eq("status_kepegawaian", "mitra"),
      db.from("bencana_mitra").select("id, nama, alamat_kecamatan, alamat_desa, status_seleksi"),
    ]);
    const petugas = (petugasData ?? []) as { id: number; nama: string; alamat_kecamatan: string | null; alamat_nagari: string | null }[];
    const mitra = (mitraData ?? []) as { id: number; nama: string; alamat_kecamatan: string | null; alamat_desa: string | null; status_seleksi: string | null }[];

    const namaPetugas = new Map<string, { desa: string }[]>();
    const hasil: { k: string; n: string; d: string }[] = [];
    for (const p of petugas) {
      const desa = (p.alamat_nagari ?? "").trim();
      const kec = (p.alamat_kecamatan ?? "").trim();
      const arr = namaPetugas.get(normNama(p.nama)) ?? [];
      arr.push({ desa: normNama(desa) });
      namaPetugas.set(normNama(p.nama), arr);
      hasil.push({ k: `p:${p.id}`, n: p.nama.trim(), d: [desa, kec].filter(Boolean).map(judul).join(", ") });
    }
    for (const m of mitra) {
      if (m.status_seleksi && STATUS_MITRA_GUGUR.includes(m.status_seleksi.trim().toLowerCase())) continue;
      const kunci = normNama(m.nama);
      const ada = namaPetugas.get(kunci);
      const desa = bersihDesa(m.alamat_desa);
      if (ada && (ada.length === 1 || ada.some((a) => a.desa === normNama(desa)))) continue; // sudah terwakili petugas
      hasil.push({ k: `m:${m.id}`, n: m.nama.trim(), d: [desa, bersihKec(m.alamat_kecamatan)].filter(Boolean).map(judul).join(", ") });
    }
    hasil.sort((a, b) => a.n.localeCompare(b.n, "id", { sensitivity: "base" }));
    return NextResponse.json({ pilihan: hasil });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ------------------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const db: Db | null = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Data tidak terbaca." }, { status: 400 });

  // Honeypot: kolom tersembunyi yg tidak diisi manusia.
  if (str(body.website)) return NextResponse.json({ ok: true, mode: "baru", nama: "", tipe: "belum", path: null });

  const pilihanKey = str(body.pilihan, 20);
  const baru = pilihanKey === "baru";
  const nik = normNik(str(body.nik, 40));
  const email = normEmail(str(body.email, 150));
  const tgl = str(body.tanggal_lahir, 12);
  const hpInput = str(body.no_hp, 30);
  const hp = hpInput ? normHp(hpInput) : null;
  const kecInput = str(body.alamat_kecamatan, 60).toUpperCase();
  const nagariInput = str(body.alamat_nagari, 80).toUpperCase();
  const detail = str(body.alamat_detail, 200);
  const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
  const jk = body.jenis_kelamin === "Lk" || body.jenis_kelamin === "Pr" ? (body.jenis_kelamin as "Lk" | "Pr") : null;
  const pendidikan = PENDIDIKAN.includes(str(body.pendidikan)) ? str(body.pendidikan) : null;
  const pekerjaan = PEKERJAAN.includes(str(body.pekerjaan)) ? str(body.pekerjaan) : null;
  const motor = bool(body.bisa_mengendarai_motor);
  const punyaMotor = bool(body.punya_kendaraan_bermotor);
  const android = bool(body.punya_hp_android);
  const capi = bool(body.pernah_capi);
  const kegiatanLain: string[] = Array.isArray(body.kegiatan_lain)
    ? Array.from(new Set((body.kegiatan_lain as unknown[]).map((x) => str(x, 80)).filter(Boolean))).slice(0, 8)
    : [];

  // ---- validasi format identitas (BUKAN percobaan salah) ----
  if (!pilihanKey) return NextResponse.json({ error: "Pilih nama Anda dari daftar terlebih dahulu." }, { status: 400 });
  if (!nikValid(nik)) return NextResponse.json({ error: "NIK harus 16 digit angka." }, { status: 400 });
  if (!emailValid(email)) return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  if (!tanggalValid(tgl)) return NextResponse.json({ error: "Tanggal lahir tidak valid." }, { status: 400 });
  if (hpInput && !hp) return NextResponse.json({ error: "No HP/WA tidak valid (contoh 0812xxxxxxxx)." }, { status: 400 });
  if ((lat === null) !== (lng === null) || (lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180))) {
    return NextResponse.json({ error: "Koordinat tidak valid." }, { status: 400 });
  }

  try {
    // ---- tentukan siapa yang dimaksud ----
    let petugasAda: PetugasRow | null = null;
    let barisMitra: MitraRow[] = [];
    let mitraTunggal: MitraRow | null = null;
    let nama: string;

    if (baru) {
      nama = str(body.nama, 120);
      if (nama.length < 3) return NextResponse.json({ error: "Nama lengkap wajib diisi." }, { status: 400 });
      const kunciBaru = normNama(nama);
      const { data: sp } = await db.from("bencana_petugas").select("id, nama");
      const { data: sm } = await db.from("bencana_mitra").select("id, nama");
      const sudahAda =
        ((sp ?? []) as { nama: string }[]).some((x) => normNama(x.nama) === kunciBaru) ||
        ((sm ?? []) as { nama: string }[]).some((x) => normNama(x.nama) === kunciBaru);
      if (sudahAda) {
        return NextResponse.json({ error: "Nama ini sudah ada di daftar. Pilih nama Anda dari dropdown, bukan daftar baru." }, { status: 409 });
      }
    } else {
      const p = await resolvePilihan(db, pilihanKey);
      if ("error" in p) return NextResponse.json({ error: p.error }, { status: p.status });
      petugasAda = p.petugas;
      barisMitra = p.mitraRows;
      mitraTunggal = p.mitra;
      nama = p.nama;
    }

    const kunciNama = normNama(nama);
    const kunci = `verif:${kunciNama}`; // sama dgn /verifikasi -> satu pembatas utk nama yg sama
    const kondisi = await cekKunci(db, kunci);
    if (kondisi.terkunci) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan yang salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai },
        { status: 429 }
      );
    }

    // ---- kolom apa saja yang WAJIB diisi (yang masih kosong) ----
    const butuh: Butuh = baru
      ? {
          no_hp: true,
          lokasi: true,
          jenis_kelamin: true,
          pendidikan: true,
          pekerjaan: true,
          bisa_mengendarai_motor: true,
          punya_kendaraan_bermotor: true,
          punya_hp_android: true,
          pernah_capi: true,
          alamat: true,
        }
      : hitungButuh(petugasAda, mitraTunggal);

    if (butuh.no_hp && !hp) return NextResponse.json({ error: "No HP/WA wajib diisi (contoh 0812xxxxxxxx)." }, { status: 400 });
    if (butuh.alamat && (!kecInput || !nagariInput)) return NextResponse.json({ error: "Kecamatan dan Nagari/Desa wajib diisi." }, { status: 400 });
    if (butuh.lokasi && (lat === null || lng === null)) {
      return NextResponse.json({ error: "Lokasi rumah belum dipilih. Tekan tombol “Ambil lokasi saya”." }, { status: 400 });
    }
    if (butuh.jenis_kelamin && !jk) return NextResponse.json({ error: "Jenis kelamin wajib dipilih." }, { status: 400 });
    if (butuh.pendidikan && !pendidikan) return NextResponse.json({ error: "Pendidikan wajib dipilih." }, { status: 400 });
    if (butuh.pekerjaan && !pekerjaan) return NextResponse.json({ error: "Pekerjaan wajib dipilih." }, { status: 400 });
    if (
      (butuh.bisa_mengendarai_motor && motor === null) ||
      (butuh.punya_kendaraan_bermotor && punyaMotor === null) ||
      (butuh.punya_hp_android && android === null) ||
      (butuh.pernah_capi && capi === null)
    ) {
      return NextResponse.json({ error: "Semua pertanyaan Ya/Tidak wajib dijawab." }, { status: 400 });
    }

    // NIK tidak boleh dipakai nama lain (cegah pendaftaran ganda / salah ketik NIK orang lain).
    const { data: mitraNik } = await db.from("bencana_mitra").select("nama, nik").not("nik", "is", null);
    const nikDipakaiLain = ((mitraNik ?? []) as { nama: string; nik: string | null }[]).some(
      (m) => normNik(m.nik ?? "") === nik && normNama(m.nama) !== kunciNama
    );
    const { data: nikIsi } = await db.from("bencana_undangan").select("petugas_id").eq("nik_isi", nik);
    const nikIsiLain = (nikIsi ?? []).some((r) => (r.petugas_id as number) !== (petugasAda?.id ?? -1));
    if (nikDipakaiLain || nikIsiLain) {
      return NextResponse.json({ error: "NIK ini sudah terdaftar atas nama lain. Periksa kembali atau hubungi admin." }, { status: 409 });
    }

    // ---- verifikasi identitas bila datanya sudah ada ----
    if (!baru) {
      const nikSumber = barisMitra.map((m) => normNik(m.nik ?? "")).filter(nikValid);
      const emailSumber = barisMitra.map((m) => normEmail(m.email ?? "")).filter((e) => e !== "");
      const tglSumber = barisMitra.map((m) => (m.tanggal_lahir ?? "").slice(0, 10)).filter((t) => t !== "");
      const kolom: Record<"nama" | "nik" | "email" | "tanggal_lahir", Status> = {
        nama: "benar",
        nik: nikSumber.length === 0 ? "belum_ada" : nikSumber.includes(nik) ? "benar" : "salah",
        email: emailSumber.length === 0 ? "belum_ada" : emailSumber.includes(email) ? "benar" : "salah",
        tanggal_lahir: tglSumber.length === 0 ? "belum_ada" : tglSumber.includes(tgl) ? "benar" : "salah",
      };
      if (Object.values(kolom).includes("salah")) {
        const g = await catatGagal(db, kunci);
        return NextResponse.json(
          { ok: false, kolom, sisa_percobaan: g.sisa, terkunci: g.terkunci, terkunci_sampai: g.sampai, maks_percobaan: MAKS_GAGAL },
          { status: g.terkunci ? 429 : 200 }
        );
      }
      await resetGagal(db, kunci);
    }

    const sekarang = new Date().toISOString();
    const umur = hitungUmur(tgl);
    // Alamat: isian petugas kalau diminta; kalau tidak, ambil dari data mitra.
    const kecAkhir = kecInput || bersihKec(mitraTunggal?.alamat_kecamatan).toUpperCase();
    const nagariAkhir = nagariInput || bersihDesa(mitraTunggal?.alamat_desa).toUpperCase();
    const hpAkhir = hp ?? (mitraTunggal?.no_telp ? normHp(mitraTunggal.no_telp) : null);

    // ---- bencana_mitra: fill-only (atau baris baru) ----
    if (mitraTunggal) {
      const m = mitraTunggal;
      const upd: Record<string, unknown> = {};
      if (kosong(m.nik)) upd.nik = nik;
      if (kosong(m.email)) upd.email = email;
      if (kosong(m.tanggal_lahir)) upd.tanggal_lahir = tgl;
      if (kosong(m.no_telp) && hp) upd.no_telp = hp;
      if (kosong(m.alamat_kecamatan) && kecInput) upd.alamat_kecamatan = kecInput;
      if (kosong(m.alamat_desa) && nagariInput) upd.alamat_desa = nagariInput;
      if (m.latitude === null && lat !== null && lng !== null) {
        upd.latitude = lat;
        upd.longitude = lng;
        upd.sumber_koordinat = "gps_pendaftar";
        upd.koordinat_diperbarui_at = sekarang;
      }
      if (Object.keys(upd).length > 0) {
        const { error } = await db.from("bencana_mitra").update(upd).eq("id", m.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (barisMitra.length === 0) {
      const { error } = await db.from("bencana_mitra").insert({
        nama,
        nik,
        email,
        tanggal_lahir: tgl,
        no_telp: hpAkhir,
        alamat_kecamatan: kecAkhir || null,
        alamat_desa: nagariAkhir || null,
        posisi: "Pendaftar mandiri",
        latitude: lat,
        longitude: lng,
        sumber_koordinat: lat !== null ? "gps_pendaftar" : null,
        koordinat_diperbarui_at: lat !== null ? sekarang : null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ---- bencana_petugas ----
    let petugasId: number;
    let petugasToken: string;
    let mode: "baru" | "lengkapi";
    if (petugasAda) {
      mode = "lengkapi";
      petugasId = petugasAda.id;
      petugasToken = petugasAda.token;
      const upd: Record<string, unknown> = { data_dilengkapi_at: sekarang };
      if (kosong(petugasAda.no_hp) && hpAkhir) upd.no_hp = hpAkhir;
      if (petugasAda.umur === null) upd.umur = umur;
      if (kosong(petugasAda.jenis_kelamin) && jk) upd.jenis_kelamin = jk;
      if (kosong(petugasAda.pendidikan) && pendidikan) upd.pendidikan = pendidikan;
      if (kosong(petugasAda.pekerjaan) && pekerjaan) upd.pekerjaan = pekerjaan;
      if (petugasAda.bisa_mengendarai_motor === null && motor !== null) upd.bisa_mengendarai_motor = motor;
      if (petugasAda.punya_kendaraan_bermotor === null && punyaMotor !== null) upd.punya_kendaraan_bermotor = punyaMotor;
      if (petugasAda.punya_hp_android === null && android !== null) upd.punya_hp_android = android;
      if (petugasAda.pernah_capi === null && capi !== null) upd.pernah_capi = capi;
      if (kosong(petugasAda.alamat_kecamatan) && kecAkhir) upd.alamat_kecamatan = kecAkhir;
      if (kosong(petugasAda.alamat_nagari) && nagariAkhir) upd.alamat_nagari = nagariAkhir;
      if (kosong(petugasAda.alamat_detail) && detail) upd.alamat_detail = detail;
      // Titik GPS yang baru ditekan petugas = lokasi riil -> dipakai.
      if (lat !== null && lng !== null) {
        upd.lat = lat;
        upd.lng = lng;
        upd.lokasi_status = "riil";
        upd.lokasi_diperbarui_at = sekarang;
      }
      const { error } = await db.from("bencana_petugas").update(upd).eq("id", petugasId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      mode = "baru";
      const { data: dibuat, error } = await db
        .from("bencana_petugas")
        .insert({
          nama,
          status_kepegawaian: "mitra",
          peran: "ppl",
          aktif: true,
          sumber_roster: "pendaftaran_mandiri_bencana",
          pendaftaran_mandiri_at: sekarang,
          data_dilengkapi_at: sekarang,
          alamat_kecamatan: kecAkhir || null,
          alamat_nagari: nagariAkhir || null,
          alamat_detail: detail || null,
          no_hp: hpAkhir,
          lat,
          lng,
          lokasi_status: lat !== null ? "riil" : "tanpa_data",
          lokasi_diperbarui_at: lat !== null ? sekarang : null,
          umur,
          jenis_kelamin: jk,
          pendidikan,
          pekerjaan,
          bisa_mengendarai_motor: motor,
          punya_kendaraan_bermotor: punyaMotor,
          punya_hp_android: android,
          pernah_capi: capi,
        })
        .select("id, token")
        .single();
      if (error || !dibuat) return NextResponse.json({ error: error?.message ?? "Gagal menyimpan pendaftaran." }, { status: 500 });
      petugasId = dibuat.id as number;
      petugasToken = dibuat.token as string;
    }

    // ---- kegiatan lain (opsional) ----
    if (kegiatanLain.length > 0) {
      await db
        .from("bencana_petugas_kegiatan_lain")
        .upsert(
          kegiatanLain.map((x) => ({ petugas_id: petugasId, kegiatan: x, catatan: "Diisi petugas lewat formulir Lengkapi Data" })),
          { onConflict: "petugas_id,kegiatan", ignoreDuplicates: true }
        );
    }

    // ---- tandai terverifikasi supaya bisa langsung membuka undangan ----
    const { data: lama } = await db.from("bencana_undangan").select("diverifikasi_at").eq("petugas_id", petugasId).maybeSingle();
    const { error: errUndangan } = await db.from("bencana_undangan").upsert(
      {
        petugas_id: petugasId,
        diverifikasi_at: (lama?.diverifikasi_at as string | null) ?? sekarang,
        terakhir_masuk_at: sekarang,
      },
      { onConflict: "petugas_id" }
    );
    if (errUndangan) return NextResponse.json({ error: errUndangan.message }, { status: 500 });

    const tujuan = await tentukanTujuan(db, { id: petugasId, nama, token: petugasToken });
    return NextResponse.json({ ok: true, mode, nama, tipe: tujuan.tipe, path: tujuan.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
