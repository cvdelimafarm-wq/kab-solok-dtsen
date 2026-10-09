// app/api/sigap/masuk/route.ts
//
// (5 Okt 2026) Masuk petugas SIGAP Transport Lokal -- nama + PIN (keputusan user).
// Akun = sigap_akun (master mitra ±774 + petugas bencana). PIN disimpan di sigap_akun;
// petugas yg SUDAH punya PIN undangan bencana (bencana_undangan) boleh memakai PIN itu.
// Belum punya PIN -> verifikasi nama + NIK + email + tanggal lahir (pembanding bencana_mitra), lalu buat PIN.
// Hanya akun yg punya penugasan aktif (diatur admin anggaran / PJ kegiatan) yg bisa masuk.
//
// POST { aksi:"masuk", nama, pin }                            -> { ok, token }
// POST { aksi:"verifikasi", nama, nik, email, tanggal_lahir } -> { ok, token, punya_pin } | { ok:false, kolom }
// POST { aksi:"buat_pin", token, pin }                        -> { ok, token }
// (7 Okt 2026) Reset PIN:
// POST { aksi:"lupa_verifikasi", nama, nik, email, tanggal_lahir } -> { ok, tiket, nama } | { ok:false, kolom }   (reset mandiri, min. 2 data cocok)
// POST { aksi:"reset_pin", tiket, pin }                            -> { ok, token, sesi }                       (tiket sekali pakai, 10 menit)
// POST { aksi:"ganti_pin", pin_lama, pin }  + Authorization: Bearer <sesi> -> { ok }                            (wajib sesudah masuk dgn PIN sementara)
// (8 Okt 2026) Login lebih jelas:
// POST { aksi:"cari_nama", q }                                -> { ok, saran:[{id,nama,ket}] }   (saran nama, min 3 huruf, maks 8, dibatasi per IP)
// POST { aksi:"masuk", nama?, akun_id?, pin }                 -> { ok, ..., saran_ganti_pin } | { ok:false, kode, error, saran? }
//      kode: nama_tidak_ditemukan | nama_ambigu | pin_belum_dibuat | pin_salah | terkunci | sementara_kedaluwarsa | belum_ditugaskan
// POST { aksi:"ganti_pin_awal", pin } + Authorization: Bearer <sesi> -> { ok }   (ganti PIN awal bersama 1303 dgn PIN sendiri, tanpa PIN lama)
// (10 Okt 2026) Akun SUPER (sigap_akun.super) boleh "masuk sebagai" akun mana pun untuk menguji tampilan PPL/PML:
// POST { aksi:"daftar_sebagai" } + Bearer <sesi super>                 -> { ok, akun:[{id,nama,jenis,peran,peserta}] }
// POST { aksi:"masuk_sebagai", akun_id } + Bearer <sesi super>         -> { ok, sesi, sampai, token, nama, aktor }  (sesi memuat aktor; dicatat di sigap_audit)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  MAKS_GAGAL,
  catatGagal,
  cekKunci,
  cekPin,
  emailValid,
  hashPin,
  nikValid,
  normEmail,
  normNama,
  normNik,
  pinValid,
  resetGagal,
  tanggalValid,
} from "@/lib/undangan";
import { aktorDariHeader, buatSesi, catatAudit, sesiDariHeader, sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { bacaTiketReset, buatTiketReset, masihPinAwal, simpanPinBaru } from "@/lib/sigapPin";
import { bolehMasukPortal } from "@/lib/portal/server";
import { catatAktivitas, ringkasPerangkat } from "@/lib/sigapLog";
import { PIN_AWAL, alasanPinDitolak, cariNama, cocokkanNama, ketAkun, pesanGalatMasuk, type AkunNama, type Saran } from "@/lib/sigapMasukNama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}
type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

type AkunRow = { id: number; nama: string; jenis: string | null; token: string; pin_hash: string | null; pin_salt: string | null; petugas_bencana_id: number | null; mitra_id: number | null; pin_sementara_sampai?: string | null; pin_diubah_at?: string | null; pin_bawaan?: boolean | null; super?: boolean | null };
const KOLOM_AKUN = "id, nama, jenis, token, pin_hash, pin_salt, petugas_bencana_id, mitra_id, pin_sementara_sampai, pin_diubah_at, pin_bawaan, super";

/** Akun aktif dgn nama ternormalisasi sama persis (diambil per halaman, >1000 baris aman). */
async function cariAkun(db: Db, nama: string): Promise<AkunRow[]> {
  const kunci = normNama(nama);
  if (!kunci) return [];
  const semua: AkunRow[] = [];
  for (let i = 0; i < 10000; i += 1000) {
    const { data } = await db
      .from("sigap_akun")
      .select(KOLOM_AKUN)
      .eq("aktif", true)
      .order("id")
      .range(i, i + 999);
    semua.push(...((data ?? []) as AkunRow[]));
    if (!data || data.length < 1000) break;
  }
  const tepat = semua.filter((a) => normNama(a.nama) === kunci);
  if (tepat.length > 0) return tepat;
  // (5 Okt 2026) Nama di master kadang bergelar ("M. Iqbal Hadi, SST.") -> cocokkan juga tanpa gelar setelah koma.
  const tanpaGelar = (x: string) => normNama(x.split(",")[0]);
  const k2 = tanpaGelar(nama);
  return semua.filter((a) => tanpaGelar(a.nama) === k2);
}

/** PIN akun: milik SIGAP, atau PIN undangan bencana bila akun terhubung ke petugas bencana. */
async function pinAkun(db: Db, a: AkunRow): Promise<{ hash: string; salt: string } | null> {
  if (a.pin_hash && a.pin_salt) return { hash: a.pin_hash, salt: a.pin_salt };
  if (a.petugas_bencana_id) {
    const { data } = await db.from("bencana_undangan").select("pin_hash, pin_salt").eq("petugas_id", a.petugas_bencana_id).maybeSingle();
    if (data?.pin_hash && data?.pin_salt) return { hash: data.pin_hash as string, salt: data.pin_salt as string };
  }
  return null;
}


// ---------------------------------------------------------------- (8 Okt 2026) daftar nama untuk saran & pencocokan
// Hanya id + nama + jenis (BUKAN PIN/token), disimpan di memori server ±60 detik. Data kredensial selalu dibaca segar.
let cacheDaftar: { at: number; daftar: AkunNama[] } | null = null;
async function daftarNama(db: Db, umurMaksMs = 60_000): Promise<AkunNama[]> {
  if (cacheDaftar && Date.now() - cacheDaftar.at < umurMaksMs) return cacheDaftar.daftar;
  const semua: AkunNama[] = [];
  for (let i = 0; i < 10000; i += 1000) {
    const { data } = await db.from("sigap_akun").select("id, nama, jenis").eq("aktif", true).order("id").range(i, i + 999);
    semua.push(...((data ?? []) as AkunNama[]));
    if (!data || data.length < 1000) break;
  }
  cacheDaftar = { at: Date.now(), daftar: semua };
  return semua;
}

// Pembatas permintaan saran per alamat IP (agar daftar nama tidak bisa disalin massal): 40 permintaan / menit.
const batasCari = new Map<string, { n: number; reset: number }>();
function terlaluSeringCari(ip: string): boolean {
  const now = Date.now();
  if (batasCari.size > 2000) for (const [k, v] of batasCari) if (v.reset < now) batasCari.delete(k);
  const b = batasCari.get(ip);
  if (!b || b.reset < now) {
    batasCari.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  b.n += 1;
  return b.n > 40;
}
function ipPeminta(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "tak-dikenal";
}

const BATAS_SARAN_GALAT = 8;
const sebagaiSaran = (l: AkunNama[]): Saran[] => l.slice(0, BATAS_SARAN_GALAT).map((a) => ({ id: a.id, nama: a.nama, ket: ketAkun(a) }));

const PESAN_BELUM_DITUGASKAN = "Akun Anda belum punya tugas atau peran aktif di aplikasi mana pun. Hubungi admin anggaran / PJ kegiatan.";

/** (5 Okt 2026) Boleh masuk bila punya penugasan aktif ATAU peran SIGAP (admin/PJ/bendahara/dll).
 *  (7 Okt 2026) Portal satu login: juga pegawai organik, petugas bencana & petugas penyisiran. */
async function bolehMasuk(db: Db, a: AkunRow): Promise<boolean> {
  return bolehMasukPortal(db, a);
}

/** (10 Okt 2026) Pemanggil (dari sesi; bila sesi "masuk sebagai", aktornya) harus akun SUPER yang aktif. */
async function pemanggilSuper(db: Db, req: NextRequest): Promise<{ id: number; nama: string } | null> {
  const s = sesiLengkapDariHeader(req.headers);
  if (!s) return null;
  const id = s.aktorId ?? s.akunId;
  const { data } = await db.from("sigap_akun").select("id, nama, aktif, super").eq("id", id).maybeSingle();
  if (!data || !data.aktif || data.super !== true) return null;
  return { id: data.id as number, nama: data.nama as string };
}

const PESAN_MODE_SEBAGAI = "Sedang dalam mode \"masuk sebagai\": ganti PIN dinonaktifkan supaya PIN petugas tidak berubah.";

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const body = await req.json().catch(() => null);
  const aksi = body?.aksi;

  try {
    // ---------------- (8 Okt 2026) Saran nama saat mengetik ----------------
    if (aksi === "cari_nama") {
      if (terlaluSeringCari(ipPeminta(req))) return NextResponse.json({ ok: false, error: "Terlalu sering mencari. Tunggu sebentar lalu coba lagi." }, { status: 429 });
      const q = typeof body?.q === "string" ? body.q.slice(0, 80) : "";
      return NextResponse.json({ ok: true, saran: cariNama(await daftarNama(db), q) });
    }

    // ---------------- Masuk dgn PIN ----------------
    if (aksi === "masuk") {
      const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
      const akunIdPilihan = Number.isInteger(body?.akun_id) && body.akun_id > 0 ? (body.akun_id as number) : null;
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      const galat = (kode: Parameters<typeof pesanGalatMasuk>[0], o: Parameters<typeof pesanGalatMasuk>[1] = {}, extra: Record<string, unknown> = {}, status = 200) =>
        NextResponse.json({ ok: false, kode, error: pesanGalatMasuk(kode, o), ...extra }, { status });
      if (!nama && !akunIdPilihan) return galat("nama_kosong", {}, {}, 400);
      if (!pinValid(pin)) return galat("pin_format", {}, {}, 400);

      // 1. Tentukan akun: pilihan dari saran (akun_id) ATAU cocokkan teks nama secara longgar.
      let daftar = await daftarNama(db);
      let dipilih: AkunNama | null = null;
      if (akunIdPilihan) {
        dipilih = daftar.find((a) => a.id === akunIdPilihan) ?? null;
        if (!dipilih) dipilih = (await daftarNama(db, 10_000)).find((a) => a.id === akunIdPilihan) ?? null; // akun baru? muat ulang (maks tiap 10 dtk)
        if (!dipilih) return galat("nama_tidak_ditemukan");
      } else {
        let hasil = cocokkanNama(daftar, nama);
        if (hasil.jenis === "kosong") {
          daftar = await daftarNama(db, 10_000); // mungkin akun baru ditambahkan: muat ulang sekali (maks tiap 10 dtk)
          hasil = cocokkanNama(daftar, nama);
        }
        if (hasil.jenis === "kosong") return galat("nama_tidak_ditemukan"); // tidak dihitung sebagai PIN salah
        if (hasil.jenis === "ambigu") return galat("nama_ambigu", { jumlah: hasil.kandidat.length }, { saran: sebagaiSaran(hasil.kandidat) });
        dipilih = hasil.akun;
      }
      const { data: akunRow } = await db.from("sigap_akun").select(KOLOM_AKUN).eq("id", dipilih.id).eq("aktif", true).maybeSingle();
      if (!akunRow) return galat("nama_tidak_ditemukan");
      const akun = akunRow as AkunRow;

      // 2. Kunci percobaan salah per akun (kunci = nama akun sebenarnya, sama dgn yang dibuka admin saat Reset PIN).
      const kunci = `sigap_pin:${normNama(akun.nama)}`;
      const kondisi = await cekKunci(db, kunci);
      if (kondisi.terkunci) return galat("terkunci", { nama: akun.nama, sampai: kondisi.sampai }, { terkunci_sampai: kondisi.sampai }, 429);

      // 3. PIN
      const p = await pinAkun(db, akun);
      if (!p) return galat("pin_belum_dibuat", { nama: akun.nama }); // tidak dihitung sebagai PIN salah
      const pinBenar = cekPin(pin, p.hash, p.salt);
      // PIN sementara hasil reset admin hanya berlaku 24 jam
      if (pinBenar && akun.pin_sementara_sampai && new Date(akun.pin_sementara_sampai).getTime() < Date.now()) return galat("sementara_kedaluwarsa", { nama: akun.nama });
      if (!pinBenar) {
        const g = await catatGagal(db, kunci);
        if (g.terkunci) return galat("terkunci", { nama: akun.nama, sampai: g.sampai }, { terkunci_sampai: g.sampai }, 429);
        return galat("pin_salah", { nama: akun.nama, sisa: g.sisa, maks: MAKS_GAGAL }, { sisa_percobaan: g.sisa, maks_percobaan: MAKS_GAGAL });
      }
      await resetGagal(db, kunci);
      if (!(await bolehMasuk(db, akun))) return galat("belum_ditugaskan", { nama: akun.nama }, { error_asli: PESAN_BELUM_DITUGASKAN }, 403);
      await db.from("sigap_akun").update({ terakhir_masuk_at: new Date().toISOString() }).eq("id", akun.id);
      // (7 Okt 2026) masuk dgn PIN sementara: klien wajib meminta PIN baru (aksi ganti_pin) sebelum menyimpan sesi
      const sementara = !!akun.pin_sementara_sampai;
      // (8 Okt 2026) masih PIN awal bersama (1303) -> sarankan ganti sekarang; penanda disamakan dengan kenyataan
      const masihAwal = !sementara && pin === PIN_AWAL;
      if (masihAwal && !akun.pin_bawaan) await db.from("sigap_akun").update({ pin_bawaan: true }).eq("id", akun.id);
      // (6 Okt 2026) log login: masuk = sesi baru
      if (!sementara) await catatAktivitas(db, akun.id, { sesiBaru: true, cara: "masuk", halaman: "masuk", perangkat: ringkasPerangkat(req.headers.get("user-agent")) }).catch(() => {});
      return NextResponse.json({ ok: true, token: akun.token, nama: akun.nama, ganti_pin: sementara, saran_ganti_pin: masihAwal, super: akun.super === true && !sementara, ...buatSesi(akun.id) });
    }

    // ---------------- Verifikasi identitas (belum punya PIN) ----------------
    if (aksi === "verifikasi") {
      const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
      const nik = normNik(typeof body?.nik === "string" ? body.nik : "");
      const email = normEmail(typeof body?.email === "string" ? body.email : "");
      const tgl = typeof body?.tanggal_lahir === "string" ? body.tanggal_lahir.trim() : "";
      if (!nama) return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
      if (!nikValid(nik)) return NextResponse.json({ error: "NIK harus 16 digit angka." }, { status: 400 });
      if (!emailValid(email)) return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
      if (!tanggalValid(tgl)) return NextResponse.json({ error: "Tanggal lahir tidak valid." }, { status: 400 });
      const kunci = `sigap_verif:${normNama(nama)}`;
      const kondisi = await cekKunci(db, kunci);
      if (kondisi.terkunci) return NextResponse.json({ error: "Terlalu banyak percobaan salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai }, { status: 429 });

      const cocok = await cariAkun(db, nama);
      if (cocok.length > 1) return NextResponse.json({ error: "Ada lebih dari satu petugas dengan nama ini. Hubungi admin." }, { status: 409 });
      type S = "benar" | "salah" | "belum_ada" | "belum_dicek";
      let kolom: Record<"nama" | "nik" | "email" | "tanggal_lahir", S>;
      if (cocok.length === 0) {
        kolom = { nama: "salah", nik: "belum_dicek", email: "belum_dicek", tanggal_lahir: "belum_dicek" };
      } else {
        // Pembanding = baris mitra milik akun yg cocok (nama persis di master, termasuk gelar).
        const kunciNama = normNama(cocok[0].nama);
        const kataPertama = cocok[0].nama.trim().split(/\s+/)[0].replace(/[%_,]/g, "");
        const { data: mitra } = await db.from("bencana_mitra").select("nama, nik, email, tanggal_lahir").ilike("nama", `%${kataPertama}%`);
        const baris = (mitra ?? []).filter((m) => normNama(m.nama as string) === kunciNama);
        const nikS = baris.map((m) => normNik((m.nik as string) ?? "")).filter(nikValid);
        const emailS = baris.map((m) => normEmail((m.email as string) ?? "")).filter((e) => e !== "");
        const tglS = baris.map((m) => ((m.tanggal_lahir as string | null) ?? "").slice(0, 10)).filter((t) => t !== "");
        kolom = {
          nama: "benar",
          nik: nikS.length === 0 ? "belum_ada" : nikS.includes(nik) ? "benar" : "salah",
          email: emailS.length === 0 ? "belum_ada" : emailS.includes(email) ? "benar" : "salah",
          tanggal_lahir: tglS.length === 0 ? "belum_ada" : tglS.includes(tgl) ? "benar" : "salah",
        };
      }
      if (Object.values(kolom).includes("salah")) {
        const g = await catatGagal(db, kunci);
        return NextResponse.json({ ok: false, kolom, sisa_percobaan: g.sisa, maks_percobaan: MAKS_GAGAL }, { status: g.terkunci ? 429 : 200 });
      }
      await resetGagal(db, kunci);
      const a = cocok[0];
      if (!(await bolehMasuk(db, a))) return NextResponse.json({ error: `Data Anda cocok. ${PESAN_BELUM_DITUGASKAN}` }, { status: 403 });
      // NIK yg belum tercatat di akun disimpan (isian petugas sendiri, sudah lolos verifikasi).
      if (kolom.nik === "belum_ada") await db.from("sigap_akun").update({ nik }).eq("id", a.id).is("nik", null);
      return NextResponse.json({ ok: true, kolom, token: a.token, nama: a.nama, punya_pin: !!(await pinAkun(db, a)) });
    }

    // ---------------- Buat PIN (sesudah verifikasi) ----------------
    if (aksi === "buat_pin") {
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      if (!token) return NextResponse.json({ error: "Permintaan tidak lengkap." }, { status: 400 });
      if (!pinValid(pin)) return NextResponse.json({ error: "PIN harus 4 digit angka." }, { status: 400 });
      const { data: a } = await db
        .from("sigap_akun")
        .select(KOLOM_AKUN)
        .eq("token", token)
        .maybeSingle();
      if (!a) return NextResponse.json({ error: "Sesi tidak valid. Ulangi verifikasi." }, { status: 404 });
      if (await pinAkun(db, a as AkunRow)) return NextResponse.json({ error: "PIN sudah pernah dibuat. Masuk dengan PIN Anda, atau hubungi admin bila lupa." }, { status: 409 });
      const { hash, salt } = hashPin(pin);
      const { error } = await db.from("sigap_akun").update({ pin_hash: hash, pin_salt: salt, pin_bawaan: false, akun_dibuat_at: new Date().toISOString() }).eq("id", a.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await db.from("sigap_akun").update({ terakhir_masuk_at: new Date().toISOString() }).eq("id", a.id);
      await catatAktivitas(db, a.id as number, { sesiBaru: true, cara: "buat_pin", halaman: "masuk", perangkat: ringkasPerangkat(req.headers.get("user-agent")) }).catch(() => {});
      return NextResponse.json({ ok: true, token, ...buatSesi(a.id as number) });
    }

    // ---------------- (7 Okt 2026) Lupa PIN: verifikasi identitas -> tiket reset ----------------
    if (aksi === "lupa_verifikasi") {
      const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
      const nik = normNik(typeof body?.nik === "string" ? body.nik : "");
      const email = normEmail(typeof body?.email === "string" ? body.email : "");
      const tgl = typeof body?.tanggal_lahir === "string" ? body.tanggal_lahir.trim() : "";
      if (!nama) return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
      if (!nikValid(nik)) return NextResponse.json({ error: "NIK harus 16 digit angka." }, { status: 400 });
      if (!emailValid(email)) return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
      if (!tanggalValid(tgl)) return NextResponse.json({ error: "Tanggal lahir tidak valid." }, { status: 400 });
      const kunci = `sigap_lupa:${normNama(nama)}`;
      const kondisi = await cekKunci(db, kunci);
      if (kondisi.terkunci) return NextResponse.json({ error: "Terlalu banyak percobaan salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai }, { status: 429 });
      const cocok = await cariAkun(db, nama);
      if (cocok.length > 1) return NextResponse.json({ error: "Ada lebih dari satu petugas dengan nama ini. Hubungi admin." }, { status: 409 });
      type S = "benar" | "salah" | "belum_ada" | "belum_dicek";
      let kolom: Record<"nama" | "nik" | "email" | "tanggal_lahir", S>;
      if (cocok.length === 0) {
        kolom = { nama: "salah", nik: "belum_dicek", email: "belum_dicek", tanggal_lahir: "belum_dicek" };
      } else {
        const kunciNama = normNama(cocok[0].nama);
        const kataPertama = cocok[0].nama.trim().split(/\s+/)[0].replace(/[%_,]/g, "");
        const { data: mitra } = await db.from("bencana_mitra").select("nama, nik, email, tanggal_lahir").ilike("nama", `%${kataPertama}%`);
        const baris = (mitra ?? []).filter((m) => normNama(m.nama as string) === kunciNama);
        const nikS = baris.map((m) => normNik((m.nik as string) ?? "")).filter(nikValid);
        const emailS = baris.map((m) => normEmail((m.email as string) ?? "")).filter((e) => e !== "");
        const tglS = baris.map((m) => ((m.tanggal_lahir as string | null) ?? "").slice(0, 10)).filter((t) => t !== "");
        // NIK yang tercatat di akun ikut jadi pembanding
        const nikAkun = await db.from("sigap_akun").select("nik").eq("id", cocok[0].id).maybeSingle();
        const nikAkunS = normNik((nikAkun.data?.nik as string | null) ?? "");
        if (nikValid(nikAkunS)) nikS.push(nikAkunS);
        kolom = {
          nama: "benar",
          nik: nikS.length === 0 ? "belum_ada" : nikS.includes(nik) ? "benar" : "salah",
          email: emailS.length === 0 ? "belum_ada" : emailS.includes(email) ? "benar" : "salah",
          tanggal_lahir: tglS.length === 0 ? "belum_ada" : tglS.includes(tgl) ? "benar" : "salah",
        };
      }
      const cocokData = (["nik", "email", "tanggal_lahir"] as const).filter((k) => kolom[k] === "benar").length;
      if (Object.values(kolom).includes("salah")) {
        const g = await catatGagal(db, kunci);
        return NextResponse.json({ ok: false, kolom, sisa_percobaan: g.sisa, maks_percobaan: MAKS_GAGAL }, { status: g.terkunci ? 429 : 200 });
      }
      // Reset mandiri lebih ketat dari pembuatan PIN: minimal 2 dari 3 data pribadi harus benar-benar cocok (bukan "belum ada").
      if (cocokData < 2) {
        const g = await catatGagal(db, kunci);
        return NextResponse.json(
          { ok: false, kolom, error: "Data pembanding Anda di sistem belum cukup untuk reset mandiri. Hubungi admin anggaran BPS Kabupaten Solok untuk reset PIN.", sisa_percobaan: g.sisa, maks_percobaan: MAKS_GAGAL },
          { status: g.terkunci ? 429 : 200 }
        );
      }
      await resetGagal(db, kunci);
      const a = cocok[0];
      if (!(await bolehMasuk(db, a))) return NextResponse.json({ error: `Data Anda cocok. ${PESAN_BELUM_DITUGASKAN}` }, { status: 403 });
      if (!(await pinAkun(db, a))) return NextResponse.json({ ok: true, kolom, belum_punya_pin: true, nama: a.nama });
      return NextResponse.json({ ok: true, kolom, tiket: buatTiketReset(a.id), nama: a.nama });
    }

    // ---------------- (7 Okt 2026) Lupa PIN: simpan PIN baru dgn tiket (sekali pakai, 10 menit) ----------------
    if (aksi === "reset_pin") {
      const t = bacaTiketReset(typeof body?.tiket === "string" ? body.tiket : null);
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      if (!t) return NextResponse.json({ error: "Waktu reset habis (10 menit). Ulangi verifikasi data." }, { status: 410 });
      if (!pinValid(pin)) return NextResponse.json({ error: "PIN harus 4 digit angka." }, { status: 400 });
      const { data: a } = await db.from("sigap_akun").select("id, nama, aktif, pin_diubah_at").eq("id", t.akunId).maybeSingle();
      if (!a || !a.aktif) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
      // sekali pakai: bila PIN sudah diubah sesudah tiket terbit, tiket tidak berlaku lagi
      if (a.pin_diubah_at && new Date(a.pin_diubah_at as string).getTime() >= t.terbit) return NextResponse.json({ error: "Tautan reset ini sudah dipakai. Ulangi verifikasi data bila perlu." }, { status: 410 });
      const err = await simpanPinBaru(db, a.id as number, pin);
      if (err) return NextResponse.json({ error: err }, { status: 500 });
      await resetGagal(db, `sigap_pin:${normNama(String(a.nama ?? ""))}`); // PIN baru -> kunci percobaan salah dibuka
      await catatAudit(db, a.id as number, "reset_pin_mandiri", { nama: a.nama });
      await db.from("sigap_akun").update({ terakhir_masuk_at: new Date().toISOString() }).eq("id", a.id);
      await catatAktivitas(db, a.id as number, { sesiBaru: true, cara: "reset_pin", halaman: "masuk", perangkat: ringkasPerangkat(req.headers.get("user-agent")) }).catch(() => {});
      const { data: tk } = await db.from("sigap_akun").select("token").eq("id", a.id).maybeSingle();
      return NextResponse.json({ ok: true, token: (tk?.token as string) ?? "", ...buatSesi(a.id as number) });
    }

    // ---------------- (7 Okt 2026) Ganti PIN (wajib sesudah PIN sementara) ----------------
    if (aksi === "ganti_pin") {
      if (aktorDariHeader(req.headers)) return NextResponse.json({ error: PESAN_MODE_SEBAGAI }, { status: 403 });
      const akunId = sesiDariHeader(req.headers);
      if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Masuk ulang dengan PIN sementara." }, { status: 401 });
      const pinLama = typeof body?.pin_lama === "string" ? body.pin_lama.trim() : "";
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      if (!pinValid(pinLama) || !pinValid(pin)) return NextResponse.json({ error: "PIN harus 4 digit angka." }, { status: 400 });
      if (pin === pinLama) return NextResponse.json({ error: "PIN baru harus berbeda dari PIN sementara." }, { status: 400 });
      const tolak = alasanPinDitolak(pin);
      if (tolak) return NextResponse.json({ error: tolak }, { status: 400 });
      const { data: a } = await db.from("sigap_akun").select(KOLOM_AKUN).eq("id", akunId).maybeSingle();
      if (!a) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
      const p = await pinAkun(db, a as AkunRow);
      if (!p || !cekPin(pinLama, p.hash, p.salt)) return NextResponse.json({ error: "PIN sementara salah." }, { status: 403 });
      const err = await simpanPinBaru(db, akunId, pin);
      if (err) return NextResponse.json({ error: err }, { status: 500 });
      await catatAudit(db, akunId, "ganti_pin", { nama: a.nama });
      await catatAktivitas(db, akunId, { sesiBaru: true, cara: "masuk", halaman: "masuk", perangkat: ringkasPerangkat(req.headers.get("user-agent")) }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // ---------------- (8 Okt 2026) Ganti PIN awal bersama (1303) dgn PIN sendiri: cepat, tanpa PIN lama ----------------
    if (aksi === "ganti_pin_awal") {
      if (aktorDariHeader(req.headers)) return NextResponse.json({ error: PESAN_MODE_SEBAGAI }, { status: 403 });
      const akunId = sesiDariHeader(req.headers);
      if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Masuk ulang lalu coba lagi." }, { status: 401 });
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      const tolak = alasanPinDitolak(pin);
      if (tolak) return NextResponse.json({ error: tolak }, { status: 400 });
      // Hanya untuk akun yang BENAR-BENAR masih memakai PIN awal (dicek terhadap hash, bukan hanya penanda).
      if (!(await masihPinAwal(db, akunId))) return NextResponse.json({ error: "PIN Anda sudah bukan PIN awal. Tidak perlu diganti lagi." }, { status: 409 });
      const { data: a } = await db.from("sigap_akun").select("id, nama").eq("id", akunId).maybeSingle();
      if (!a) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
      const err = await simpanPinBaru(db, akunId, pin);
      if (err) return NextResponse.json({ error: err }, { status: 500 });
      await catatAudit(db, akunId, "ganti_pin_awal", { nama: a.nama }); // PIN tidak ikut dicatat
      return NextResponse.json({ ok: true });
    }

    // ---------------- (10 Okt 2026) Akun SUPER: daftar akun & "masuk sebagai" ----------------
    // Permintaan user: "akun M. Iqbal Hadi adalah akun super, ketika masuk menggunakan akun ini ada dropdown tampilkan sebagai siapa
    // (seluruh akun yang ada di sistem)" dan boleh melakukan aksi apa saja seperti petugas itu. Pengaman: hanya sigap_akun.super=true,
    // aktor ikut tertanda tangan di sesi, setiap "masuk sebagai" dicatat di sigap_audit, ganti PIN dinonaktifkan selama mode ini.
    if (aksi === "daftar_sebagai") {
      const pemanggil = await pemanggilSuper(db, req);
      if (!pemanggil) return NextResponse.json({ error: "Hanya akun super yang boleh memakai fitur ini." }, { status: 403 });
      const akun: { id: number; nama: string; jenis: string | null; petugas_bencana_id: number | null }[] = [];
      for (let i = 0; i < 10000; i += 1000) {
        const { data } = await db.from("sigap_akun").select("id, nama, jenis, petugas_bencana_id").eq("aktif", true).order("id").range(i, i + 999);
        akun.push(...((data ?? []) as typeof akun));
        if (!data || data.length < 1000) break;
      }
      const peranBencana = new Map<number, string>();
      for (let i = 0; i < 5000; i += 1000) {
        const { data } = await db.from("bencana_petugas").select("id, peran").order("id").range(i, i + 999);
        for (const r of (data ?? []) as { id: number; peran: string | null }[]) if (r.peran) peranBencana.set(r.id, r.peran);
        if (!data || data.length < 1000) break;
      }
      const { data: pel } = await db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", 3).eq("aktif", true);
      const peserta = new Set(((pel ?? []) as { akun_id: number }[]).map((r) => r.akun_id));
      const daftar = akun
        .map((a) => ({ id: a.id, nama: a.nama, jenis: a.jenis, peran: a.petugas_bencana_id ? (peranBencana.get(a.petugas_bencana_id) ?? null) : null, peserta: peserta.has(a.id) }))
        .sort((x, y) => x.nama.localeCompare(y.nama, "id"));
      return NextResponse.json({ ok: true, akun: daftar });
    }

    if (aksi === "masuk_sebagai") {
      const pemanggil = await pemanggilSuper(db, req);
      if (!pemanggil) return NextResponse.json({ error: "Hanya akun super yang boleh memakai fitur ini." }, { status: 403 });
      const akunId = Number.isInteger(body?.akun_id) && body.akun_id > 0 ? (body.akun_id as number) : null;
      if (!akunId) return NextResponse.json({ error: "Pilih akun yang ingin dilihat." }, { status: 400 });
      const { data: t } = await db.from("sigap_akun").select("id, nama, token, aktif").eq("id", akunId).maybeSingle();
      if (!t || !t.aktif) return NextResponse.json({ error: "Akun tidak ditemukan atau tidak aktif." }, { status: 404 });
      const sendiri = t.id === pemanggil.id;
      await catatAudit(db, pemanggil.id, "masuk_sebagai", { target_id: t.id, target_nama: t.nama, sendiri }).catch(() => {});
      return NextResponse.json({ ok: true, nama: t.nama, token: t.token as string, aktor: pemanggil.nama, sendiri, ...buatSesi(t.id as number, sendiri ? null : pemanggil.id) });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
