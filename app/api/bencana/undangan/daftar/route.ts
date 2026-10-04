// app/api/bencana/undangan/daftar/route.ts
//
// (4 Okt 2026) Formulir "Data belum ditemukan? Daftar / Lengkapi Data" di halaman
// Undangan Konfirmasi Bersama (/bencana/undangan). Dua kegunaan, satu endpoint:
//
//   A) Petugas/mitra SUDAH ada di daftar tetapi datanya belum lengkap
//      -> identitas (nama + NIK + email + tgl lahir) diverifikasi dgn aturan yg sama
//         seperti /verifikasi (salah 5x -> terkunci), lalu data yang masih KOSONG
//         dilengkapi (fill-only: tidak pernah menimpa isian yg sudah ada, kecuali
//         lokasi GPS yg memang baru ditekan petugas).
//   B) Belum ada sama sekali -> didaftarkan sbg petugas mitra AKTIF
//      (sumber_roster='pendaftaran_mandiri_bencana', pendaftaran_mandiri_at terisi
//      sbg penanda utk ditinjau admin).
//
// POST {
//   nama, nik, email, tanggal_lahir, no_hp,
//   alamat_kecamatan, alamat_nagari, alamat_detail,
//   lat, lng (dari tombol GPS),
//   jenis_kelamin ('Lk'|'Pr'), pendidikan, pekerjaan,
//   bisa_mengendarai_motor, punya_kendaraan_bermotor, punya_hp_android, pernah_capi (boolean),
//   kegiatan_lain: string[]   (opsional),
//   website                   (honeypot, harus kosong)
// }
//  -> { ok:true, mode:'baru'|'lengkapi', nama, tipe, path }
//  -> { ok:false, kolom, sisa_percobaan } kalau identitas tdk cocok
//  -> 409 / 429 / 400 dgn { error }

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

type PetugasRow = {
  id: number;
  nama: string;
  token: string;
  aktif: boolean;
  status_kepegawaian: string;
  no_hp: string | null;
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

export async function POST(req: NextRequest) {
  const db: Db | null = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Data tidak terbaca." }, { status: 400 });

  // Honeypot: kolom tersembunyi yg tidak diisi manusia.
  if (str(body.website)) return NextResponse.json({ ok: true, mode: "baru", nama: "", tipe: "belum", path: null });

  const nama = str(body.nama, 120);
  const nik = normNik(str(body.nik, 40));
  const email = normEmail(str(body.email, 150));
  const tgl = str(body.tanggal_lahir, 12);
  const hp = normHp(str(body.no_hp, 30));
  const kec = str(body.alamat_kecamatan, 60).toUpperCase();
  const nagari = str(body.alamat_nagari, 80).toUpperCase();
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
    ? Array.from(new Set((body.kegiatan_lain as unknown[]).map((k) => str(k, 80)).filter(Boolean))).slice(0, 8)
    : [];

  // ---- validasi format (BUKAN percobaan salah) ----
  if (!nama || nama.length < 3) return NextResponse.json({ error: "Nama lengkap wajib diisi." }, { status: 400 });
  if (!nikValid(nik)) return NextResponse.json({ error: "NIK harus 16 digit angka." }, { status: 400 });
  if (!emailValid(email)) return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  if (!tanggalValid(tgl)) return NextResponse.json({ error: "Tanggal lahir tidak valid." }, { status: 400 });
  if (!hp) return NextResponse.json({ error: "No HP/WA tidak valid (contoh 0812xxxxxxxx)." }, { status: 400 });
  if (!kec || !nagari) return NextResponse.json({ error: "Kecamatan dan Nagari/Desa wajib diisi." }, { status: 400 });
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Lokasi rumah belum dipilih. Tekan tombol “Ambil lokasi saya”." }, { status: 400 });
  }
  if (!jk) return NextResponse.json({ error: "Jenis kelamin wajib dipilih." }, { status: 400 });
  if (!pendidikan) return NextResponse.json({ error: "Pendidikan wajib dipilih." }, { status: 400 });
  if (!pekerjaan) return NextResponse.json({ error: "Pekerjaan wajib dipilih." }, { status: 400 });
  if (motor === null || punyaMotor === null || android === null || capi === null) {
    return NextResponse.json({ error: "Semua pertanyaan Ya/Tidak wajib dijawab." }, { status: 400 });
  }

  try {
    const kunciNama = normNama(nama);
    const kunci = `verif:${kunciNama}`; // sama dgn /verifikasi -> satu pembatas utk nama yg sama
    const kondisi = await cekKunci(db, kunci);
    if (kondisi.terkunci) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan yang salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai },
        { status: 429 }
      );
    }

    // ---- cari data yang sudah ada ----
    const { data: semuaPetugas } = await db
      .from("bencana_petugas")
      .select(
        "id, nama, token, aktif, status_kepegawaian, no_hp, umur, jenis_kelamin, pendidikan, pekerjaan, bisa_mengendarai_motor, punya_kendaraan_bermotor, punya_hp_android, pernah_capi, alamat_kecamatan, alamat_nagari, alamat_detail"
      );
    const cocokPetugas = ((semuaPetugas ?? []) as PetugasRow[]).filter((p) => normNama(p.nama) === kunciNama);
    if (cocokPetugas.length > 1) {
      return NextResponse.json({ error: "Ada lebih dari satu petugas dengan nama ini. Hubungi admin." }, { status: 409 });
    }
    const petugasAda = cocokPetugas[0] ?? null;
    if (petugasAda && (!petugasAda.aktif || petugasAda.status_kepegawaian !== "mitra")) {
      return NextResponse.json(
        { error: "Nama ini sudah terdaftar dengan status lain. Hubungi admin BPS Kabupaten Solok." },
        { status: 409 }
      );
    }

    const { data: mitraSemua } = await db
      .from("bencana_mitra")
      .select("id, nama, nik, email, tanggal_lahir, no_telp, alamat_kecamatan, alamat_desa, latitude");
    const mitraList = (mitraSemua ?? []) as {
      id: number;
      nama: string;
      nik: string | null;
      email: string | null;
      tanggal_lahir: string | null;
      no_telp: string | null;
      alamat_kecamatan: string | null;
      alamat_desa: string | null;
      latitude: number | null;
    }[];
    const barisMitra = mitraList.filter((m) => normNama(m.nama) === kunciNama);

    // NIK tidak boleh dipakai nama lain (cegah pendaftaran ganda / salah ketik NIK orang lain).
    const nikDipakaiLain = mitraList.some((m) => normNik(m.nik ?? "") === nik && normNama(m.nama) !== kunciNama);
    if (nikDipakaiLain) {
      return NextResponse.json({ error: "NIK ini sudah terdaftar atas nama lain. Periksa kembali atau hubungi admin." }, { status: 409 });
    }
    const { data: nikIsi } = await db.from("bencana_undangan").select("petugas_id").eq("nik_isi", nik);
    if ((nikIsi ?? []).some((r) => (r.petugas_id as number) !== (petugasAda?.id ?? -1))) {
      return NextResponse.json({ error: "NIK ini sudah terdaftar atas nama lain. Periksa kembali atau hubungi admin." }, { status: 409 });
    }

    const adaReferensi = !!petugasAda || barisMitra.length > 0;

    // ---- verifikasi identitas bila datanya sudah ada ----
    if (adaReferensi) {
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

    // ---- bencana_mitra: fill-only (atau baris baru) ----
    if (barisMitra.length === 1) {
      const m = barisMitra[0];
      const upd: Record<string, unknown> = {};
      if (kosong(m.nik)) upd.nik = nik;
      if (kosong(m.email)) upd.email = email;
      if (kosong(m.tanggal_lahir)) upd.tanggal_lahir = tgl;
      if (kosong(m.no_telp)) upd.no_telp = hp;
      if (kosong(m.alamat_kecamatan)) upd.alamat_kecamatan = kec;
      if (kosong(m.alamat_desa)) upd.alamat_desa = nagari;
      if (m.latitude === null) {
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
        no_telp: hp,
        alamat_kecamatan: kec,
        alamat_desa: nagari,
        posisi: "Pendaftar mandiri",
        latitude: lat,
        longitude: lng,
        sumber_koordinat: "gps_pendaftar",
        koordinat_diperbarui_at: sekarang,
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
      if (kosong(petugasAda.no_hp)) upd.no_hp = hp;
      if (petugasAda.umur === null) upd.umur = umur;
      if (kosong(petugasAda.jenis_kelamin)) upd.jenis_kelamin = jk;
      if (kosong(petugasAda.pendidikan)) upd.pendidikan = pendidikan;
      if (kosong(petugasAda.pekerjaan)) upd.pekerjaan = pekerjaan;
      if (petugasAda.bisa_mengendarai_motor === null) upd.bisa_mengendarai_motor = motor;
      if (petugasAda.punya_kendaraan_bermotor === null) upd.punya_kendaraan_bermotor = punyaMotor;
      if (petugasAda.punya_hp_android === null) upd.punya_hp_android = android;
      if (petugasAda.pernah_capi === null) upd.pernah_capi = capi;
      if (kosong(petugasAda.alamat_kecamatan)) upd.alamat_kecamatan = kec;
      if (kosong(petugasAda.alamat_nagari)) upd.alamat_nagari = nagari;
      if (kosong(petugasAda.alamat_detail) && detail) upd.alamat_detail = detail;
      // Titik GPS yang baru ditekan petugas = lokasi riil -> selalu dipakai.
      upd.lat = lat;
      upd.lng = lng;
      upd.lokasi_status = "riil";
      upd.lokasi_diperbarui_at = sekarang;
      const { error } = await db.from("bencana_petugas").update(upd).eq("id", petugasId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      mode = "baru";
      const { data: baru, error } = await db
        .from("bencana_petugas")
        .insert({
          nama,
          status_kepegawaian: "mitra",
          peran: "ppl",
          aktif: true,
          sumber_roster: "pendaftaran_mandiri_bencana",
          pendaftaran_mandiri_at: sekarang,
          data_dilengkapi_at: sekarang,
          alamat_kecamatan: kec,
          alamat_nagari: nagari,
          alamat_detail: detail || null,
          no_hp: hp,
          lat,
          lng,
          lokasi_status: "riil",
          lokasi_diperbarui_at: sekarang,
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
      if (error || !baru) return NextResponse.json({ error: error?.message ?? "Gagal menyimpan pendaftaran." }, { status: 500 });
      petugasId = baru.id as number;
      petugasToken = baru.token as string;
    }

    // ---- kegiatan lain (opsional) ----
    if (kegiatanLain.length > 0) {
      await db
        .from("bencana_petugas_kegiatan_lain")
        .upsert(
          kegiatanLain.map((k) => ({ petugas_id: petugasId, kegiatan: k, catatan: "Diisi petugas lewat formulir Lengkapi Data" })),
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
