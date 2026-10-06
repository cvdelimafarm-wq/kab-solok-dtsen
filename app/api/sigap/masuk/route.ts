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
import { buatSesi } from "@/lib/sigapAkses";
import { bolehMasukPortal } from "@/lib/portal/server";
import { catatAktivitas, ringkasPerangkat } from "@/lib/sigapLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}
type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

type AkunRow = { id: number; nama: string; jenis: string | null; token: string; pin_hash: string | null; pin_salt: string | null; petugas_bencana_id: number | null; mitra_id: number | null };

/** Akun aktif dgn nama ternormalisasi sama persis (diambil per halaman, >1000 baris aman). */
async function cariAkun(db: Db, nama: string): Promise<AkunRow[]> {
  const kunci = normNama(nama);
  if (!kunci) return [];
  const semua: AkunRow[] = [];
  for (let i = 0; i < 10000; i += 1000) {
    const { data } = await db
      .from("sigap_akun")
      .select("id, nama, jenis, token, pin_hash, pin_salt, petugas_bencana_id, mitra_id")
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

const PESAN_BELUM_DITUGASKAN = "Akun Anda belum punya tugas atau peran aktif di aplikasi mana pun. Hubungi admin anggaran / PJ kegiatan.";

/** (5 Okt 2026) Boleh masuk bila punya penugasan aktif ATAU peran SIGAP (admin/PJ/bendahara/dll).
 *  (7 Okt 2026) Portal satu login: juga pegawai organik, petugas bencana & petugas penyisiran. */
async function bolehMasuk(db: Db, a: AkunRow): Promise<boolean> {
  return bolehMasukPortal(db, a);
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const body = await req.json().catch(() => null);
  const aksi = body?.aksi;

  try {
    // ---------------- Masuk dgn PIN ----------------
    if (aksi === "masuk") {
      const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      if (!nama) return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
      if (!pinValid(pin)) return NextResponse.json({ error: "PIN harus 4 digit angka." }, { status: 400 });
      const kunci = `sigap_pin:${normNama(nama)}`;
      const kondisi = await cekKunci(db, kunci);
      if (kondisi.terkunci) return NextResponse.json({ error: "Terlalu banyak percobaan salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai }, { status: 429 });
      const cocok = await cariAkun(db, nama);
      let berhasil = false;
      if (cocok.length === 1) {
        const p = await pinAkun(db, cocok[0]);
        berhasil = !!p && cekPin(pin, p.hash, p.salt);
      }
      if (!berhasil) {
        const g = await catatGagal(db, kunci);
        return NextResponse.json(
          { ok: false, error: "Nama atau PIN salah, atau PIN belum dibuat (pilih tab \"Belum punya PIN\").", sisa_percobaan: g.sisa, maks_percobaan: MAKS_GAGAL },
          { status: g.terkunci ? 429 : 200 }
        );
      }
      await resetGagal(db, kunci);
      if (!(await bolehMasuk(db, cocok[0]))) return NextResponse.json({ error: PESAN_BELUM_DITUGASKAN }, { status: 403 });
      await db.from("sigap_akun").update({ terakhir_masuk_at: new Date().toISOString() }).eq("id", cocok[0].id);
      // (6 Okt 2026) log login: masuk = sesi baru
      await catatAktivitas(db, cocok[0].id, { sesiBaru: true, cara: "masuk", halaman: "masuk", perangkat: ringkasPerangkat(req.headers.get("user-agent")) }).catch(() => {});
      return NextResponse.json({ ok: true, token: cocok[0].token, nama: cocok[0].nama, ...buatSesi(cocok[0].id) });
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
        .select("id, nama, jenis, token, pin_hash, pin_salt, petugas_bencana_id, mitra_id")
        .eq("token", token)
        .maybeSingle();
      if (!a) return NextResponse.json({ error: "Sesi tidak valid. Ulangi verifikasi." }, { status: 404 });
      if (await pinAkun(db, a as AkunRow)) return NextResponse.json({ error: "PIN sudah pernah dibuat. Masuk dengan PIN Anda, atau hubungi admin bila lupa." }, { status: 409 });
      const { hash, salt } = hashPin(pin);
      const { error } = await db.from("sigap_akun").update({ pin_hash: hash, pin_salt: salt, akun_dibuat_at: new Date().toISOString() }).eq("id", a.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await db.from("sigap_akun").update({ terakhir_masuk_at: new Date().toISOString() }).eq("id", a.id);
      await catatAktivitas(db, a.id as number, { sesiBaru: true, cara: "buat_pin", halaman: "masuk", perangkat: ringkasPerangkat(req.headers.get("user-agent")) }).catch(() => {});
      return NextResponse.json({ ok: true, token, ...buatSesi(a.id as number) });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
