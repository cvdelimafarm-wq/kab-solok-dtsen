// app/api/bencana/konfirmasi/[token]/route.ts
//
// Halaman self-service "Konfirmasi Kesediaan Ikut Pendataan Bencana" --
// TANPA LOGIN, lewat link unik bertoken (bencana_petugas.token, SAMA kolom
// yg sudah dipakai /bencana/lokasi/[token]). Dikirim ke mitra yang SUDAH
// di-plot ke minimal 1 Sub SLS (lihat kartu "Mitra Perlu Dihubungi" / tombol
// "Salin Link Konfirmasi" di tab Alokasi Petugas), supaya mitra bisa
// langsung menjawab Bersedia/Tidak Bersedia sendiri -- admin tidak perlu
// menelepon satu-satu kalau mitra sempat buka link & isi sendiri (meski
// kartu "Mitra Perlu Dihubungi" tetap ada utk yg dikontak manual via WA/telp).
//
// SENGAJA MEMAKAI ULANG kolom2 yang sudah ada di bencana_petugas (bukan
// bikin tabel baru) -- field2 ini SUDAH jadi "status kesediaan resmi" yg
// dipakai juga oleh endpoint kontak-mitra & warning ikon Langkah 4:
//   - pendaftaran_bencana_konfirmasi (boolean): true kalau Bersedia.
//   - status_kontak_pendaftaran_bencana ('diterima'|'menolak'|null).
//   - catatan_penolakan_pendaftaran_bencana: alasan kalau Tidak Bersedia.
//   - dikontak_pendaftaran_bencana_at: waktu submit (dipakai jg sbg "waktu
//     kontak" oleh kartu admin, konsisten dgn makna kolom yg sudah ada).
//   - jadwal_pelatihan_dipilih (BARU, 3 Okt 2026): '7 Oktober 2026' |
//     '8 Oktober 2026', diisi kalau Bersedia.
//     (4 Okt 2026) Sekarang CHECKBOX, kedua tanggal terpilih otomatis --
//     pelatihan cuma 1 hari di SALAH SATU tanggal, jadi isinya = tanggal2
//     yg petugas SANGGUP hadiri (bisa 1 atau 2, dipisah ", ", mis.
//     '7 Oktober 2026, 8 Oktober 2026'); panitia yg menentukan hari
//     finalnya sesudah melihat jawaban semua petugas.
//   - perkiraan_hari_libur (BARU, 4 Okt 2026, text[]): tanggal2
//     (YYYY-MM-DD) dlm 10-31 Okt 2026 yg diperkirakan petugas LIBUR/tidak
//     bisa mendata; hari kerja = sisanya. NULL = belum diisi.
//
// GET  -> info petugas (nama, status saat ini) + "perkiraan wilayah kerja"
//         (Sub SLS yg SUDAH di-plot resmi ke petugas ini di
//         bencana_alokasi_subsls -- BUKAN draft, krn halaman ini dikirim
//         SESUDAH admin plot di Langkah 4), lengkap nama kecamatan/nagari/
//         jorong + jumlah KK total & perkiraan KK terdampak (dari RPC
//         bencana_kertas_kerja_beban(), SAMA dgn yg dipakai "Kertas Kerja
//         Beban" admin -- supaya angkanya konsisten, tidak dihitung ulang
//         dgn rumus lain di sini). Juga mengembalikan field2 identitas yg
//         dipakai FE utk mendeteksi "data belum lengkap" (lihat PATCH).
// POST  -> submit jawaban { bersedia: boolean, jadwal_pelatihan?: string[],
//         hari_libur?: string[] (wajib array, boleh kosong, kalau bersedia),
//         alasan?: string }.
// PATCH -> (3 Okt 2026) "Lengkapi Data Anda" -- permintaan user: selain
//         jawab Bersedia/Tidak Bersedia, halaman ini jg menawarkan petugas
//         melengkapi SENDIRI data dirinya yg masih kosong di roster, BEDA
//         per orang ("tergantung orangnya" -- FE cuma menampilkan field yg
//         benar2 kosong utk petugas ybs, lihat halaman):
//           - lat/lng (lokasi rumah): SAMA persis dgn /bencana/lokasi/[token]
//             (lokasi_status -> 'riil') -- disatukan ke sini supaya petugas
//             tidak perlu buka 2 link berbeda. Link /bencana/lokasi/[token]
//             TETAP ada & masih berfungsi (tidak dihapus).
//           - no_hp.
//           - umur, jenis_kelamin, pendidikan, pekerjaan,
//             bisa_mengendarai_motor, punya_kendaraan_bermotor -- field
//             "demografi" hasil rekrutmen mitra yg SEBELUM ini TIDAK BISA
//             diedit lewat endpoint manapun (read-only di tab Master
//             Petugas/Kegiatan Petugas). FE hanya menawarkan field2 ini utk
//             petugas status_kepegawaian='mitra' (utk 'organik' field ini
//             memang bukan bagian rekrutmen mitra, lihat komentar di
//             app/api/bencana/master-petugas/route.ts).
//         Semua field OPSIONAL per request (whitelist ketat, hanya field yg
//         dikirim yg diupdate) -- petugas boleh isi sebagian & lanjut nanti.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WA_GROUP_URL, punyaAkun } from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JADWAL_VALID = ["7 Oktober 2026", "8 Oktober 2026"] as const;

// (4 Okt 2026) Grup WhatsApp koordinasi petugas (WA_GROUP_URL di lib/undangan.ts)
// -- HANYA dikembalikan GET kalau petugas sudah konfirmasi Bersedia DAN sudah
// membuat akun (nama + PIN) lewat panel "Buat Akun".

// (4 Okt 2026) Rentang pendataan lapangan -- tanggal hari kerja/libur yg
// boleh dipilih petugas.
const TANGGAL_PENDATAAN_VALID: string[] = Array.from({ length: 22 }, (_, i) => `2026-10-${String(10 + i).padStart(2, "0")}`);

// (3 Okt 2026) Whitelist pendidikan/pekerjaan -- SAMA persis dgn nilai yg
// sudah ada di data hasil rekrutmen mitra (dicek langsung lewat query ke
// bencana_petugas), supaya isian baru dari halaman ini konsisten dgn data
// lama & tetap kompatibel dgn filter "Pendidikan"/"Pekerjaan" di tab Master
// Petugas / Kegiatan Petugas (keduanya derive opsi filter dari nilai unik yg
// ada, bukan dari enum tetap -- lihat opsiUnik() di page.tsx).
const PENDIDIKAN_VALID = [
  "Tamat SD/Sederajat",
  "Tamat SMP/Sederajat",
  "Tamat SMA/Sederajat",
  "Tamat D1/D2/D3",
  "Tamat D4/S1",
  "Tamat S2",
  "Tamat S3",
] as const;

const PEKERJAAN_VALID = [
  "Wiraswasta",
  "Mengurus Rumah Tangga",
  "Pelajar / Mahasiswa",
  "Kader PKK / Karang Taruna / Kader Lainnya",
  "Pegawai / Guru Honorer",
  "Aparat Desa / Kelurahan",
  "Lainnya",
] as const;

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const { data: petugas, error } = await supabase
    .from("bencana_petugas")
    .select(
      // (3 Okt 2026) no_hp, lokasi_status, umur, jenis_kelamin, pendidikan,
      // pekerjaan, bisa_mengendarai_motor, punya_kendaraan_bermotor
      // ditambahkan -- dipakai FE utk deteksi & tampilkan section
      // "Lengkapi Data Anda" (lihat PATCH di atas).
      "id, nama, peran, atasan_id, lat, lng, status_kepegawaian, aktif, pendaftaran_bencana_konfirmasi, status_kontak_pendaftaran_bencana, catatan_penolakan_pendaftaran_bencana, jadwal_pelatihan_dipilih, perkiraan_hari_libur, no_hp, lokasi_status, umur, jenis_kelamin, pendidikan, pekerjaan, bisa_mengendarai_motor, punya_kendaraan_bermotor"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!petugas) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  // (5 Okt 2026) SISTEM KEROYOKAN: wilayah kerja BUKAN lagi 1-1 ke PPL. Yang
  // ditampilkan = SELURUH Sub SLS sampel milik TIM petugas ini, yaitu semua PPL
  // yg satu PML (atasan_id sama) + PML-nya sendiri. Kalau petugas belum punya tim
  // (tanpa atasan & bukan PML), tetap jatuh ke Sub SLS miliknya sendiri.
  const atasanId = (petugas.atasan_id as number | null) ?? (petugas.peran === "pml" ? (petugas.id as number) : null);
  let anggotaTim: { id: number; nama: string; peran: string | null }[] = [{ id: petugas.id as number, nama: petugas.nama as string, peran: (petugas.peran as string | null) ?? null }];
  let pmlNama: string | null = petugas.peran === "pml" ? (petugas.nama as string) : null;
  if (atasanId != null) {
    const { data: tim } = await supabase
      .from("bencana_petugas")
      .select("id, nama, peran")
      .or(`atasan_id.eq.${atasanId},id.eq.${atasanId}`);
    anggotaTim = ((tim ?? []) as { id: number; nama: string; peran: string | null }[]).filter((t) => t.id != null);
    if (!anggotaTim.some((t) => t.id === petugas.id)) {
      anggotaTim.push({ id: petugas.id as number, nama: petugas.nama as string, peran: (petugas.peran as string | null) ?? null });
    }
    pmlNama = anggotaTim.find((t) => t.id === atasanId)?.nama ?? pmlNama;
  }
  const idTim = anggotaTim.map((t) => t.id);
  const namaPpl = new Map(anggotaTim.map((t) => [t.id, t.nama]));

  // Wilayah kerja -- Sub SLS yg SUDAH diplot RESMI (tersimpan, bukan draft)
  // ke seluruh PPL dalam tim.
  const { data: alokasiRows, error: errAlokasi } = await supabase
    .from("bencana_alokasi_subsls")
    .select("idsubsls, ppl_id, jarak_km")
    .in("ppl_id", idTim);
  if (errAlokasi) return NextResponse.json({ error: errAlokasi.message }, { status: 500 });

  const idsubslsList = Array.from(new Set((alokasiRows ?? []).map((r) => r.idsubsls as string)));
  const pemegang = new Map<string, number[]>(); // idsubsls -> ppl_id (bisa > 1 kalau dipecah)
  const jarakAlokasiSaya = new Map<string, number>();
  for (const r of (alokasiRows ?? []) as { idsubsls: string; ppl_id: number; jarak_km: number | string | null }[]) {
    pemegang.set(r.idsubsls, [...(pemegang.get(r.idsubsls) ?? []), r.ppl_id]);
    if (r.ppl_id === petugas.id && r.jarak_km != null) jarakAlokasiSaya.set(r.idsubsls, Number(r.jarak_km));
  }
  let wilayahKerja: {
    idsubsls: string;
    kecamatan: string;
    nagari: string;
    sls: string;
    sub_sls: string;
    kk_total: number;
    kk_terdampak_estimasi: number;
    // (3 Okt 2026) true kalau angka kk_terdampak_estimasi = 0 BUKAN krn
    // benar2 nol KK terdampak, tapi krn indikator dampak KK di form
    // Identifikasi Jorong blm diisi mitra -- lihat komentar panjang di
    // bawah. FE menampilkan "Data belum lengkap" (bukan "0") kalau true,
    // supaya mitra/petugas tidak salah paham wilayahnya dikira tidak
    // terdampak.
    kk_terdampak_belum_lengkap: boolean;
    // (5 Okt 2026) sistem keroyokan: siapa saja PPL di tim yg memegang Sub SLS ini,
    // apakah termasuk milik petugas ini, dan jaraknya dari RUMAH petugas ini.
    milik_saya?: boolean;
    pemegang?: string[];
    jarak_rumah_km?: number | null;
    jarak_sumber?: "garis_lurus" | "alokasi" | null;
  }[] = [];

  if (idsubslsList.length > 0) {
    // RPC yg SAMA dgn "Kertas Kerja Beban" admin -- supaya angka KK
    // terdampak di sini (estimasi rata-rata per Jorong) konsisten, bukan
    // dihitung ulang dgn rumus lain.
    const { data: bebanRows, error: errBeban } = await supabase.rpc("bencana_kertas_kerja_beban");
    if (errBeban) return NextResponse.json({ error: errBeban.message }, { status: 500 });
    const idsubslsSet = new Set(idsubslsList);
    type BebanRow = {
      idsubsls: string;
      kecamatan: string;
      nagari: string;
      sls: string;
      sub_sls: string;
      kk_total: number;
      kk_terdampak_estimasi: number;
      kk_terdampak_manual: boolean;
    };
    // (3 Okt 2026) kk_terdampak_belum_lengkap = (estimasi 0 DAN bukan hasil
    // koreksi manual admin). Baris2 di RPC ini SUDAH pasti is_terdampak
    // (bencana_kertas_kerja_beban() hanya kembalikan Sub SLS terdampak),
    // jadi estimasi 0 di sini CUMA bisa terjadi kalau total KK terdampak
    // Jorong-nya 0 -- yg akar sebabnya adalah mitra blm mengisi bagian
    // "indikator dampak" (jumlah KK per indikator) saat Identifikasi
    // Jorong, BUKAN krn Jorong itu benar2 tidak ada KK terdampak (kalau
    // benar2 tidak ada, mitra akan menjawab "tidak ada yang terdampak" dan
    // Sub SLS itu tidak akan is_terdampak / tidak muncul di RPC ini sama
    // sekali). Lihat bencana_skor_beban_subsls() & bencana_monitoring_
    // jorong() di database utk rumus lengkapnya.
    wilayahKerja = ((bebanRows ?? []) as BebanRow[])
      .filter((r) => idsubslsSet.has(r.idsubsls))
      .map((r) => ({
        idsubsls: r.idsubsls,
        kecamatan: r.kecamatan,
        nagari: r.nagari,
        sls: r.sls,
        sub_sls: r.sub_sls,
        kk_total: r.kk_total,
        kk_terdampak_estimasi: r.kk_terdampak_estimasi,
        kk_terdampak_belum_lengkap: r.kk_terdampak_estimasi === 0 && !r.kk_terdampak_manual,
      }));

    // Sub SLS yg diplot tapi TIDAK TERDAMPAK (tidak muncul di RPC beban,
    // yg hanya mengembalikan Sub SLS terdampak) -- tetap ditampilkan,
    // lewat join langsung ke bencana_wilayah + bencana_kk_subsls, dgn
    // kk_terdampak_estimasi dianggap 0 (bukan dihapus dari daftar, supaya
    // "perkiraan wilayah kerja" tetap lengkap sesuai yg benar2 diplot).
    // Beda dgn kasus "belum_lengkap" di atas -- di sini Sub SLS-nya memang
    // TIDAK ditandai terdampak sama sekali, jadi 0 di sini adalah nilai yg
    // benar (bukan data kosong), kk_terdampak_belum_lengkap = false.
    const idsubslsSudahAda = new Set(wilayahKerja.map((r) => r.idsubsls));
    const sisaIdsubsls = idsubslsList.filter((id) => !idsubslsSudahAda.has(id));
    if (sisaIdsubsls.length > 0) {
      const [{ data: wilayahSisa, error: errWilayah }, { data: kkSisa, error: errKk }] = await Promise.all([
        supabase.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").in("idsubsls", sisaIdsubsls),
        supabase.from("bencana_kk_subsls").select("idsubsls, jumlah_kk_total").in("idsubsls", sisaIdsubsls),
      ]);
      if (errWilayah) return NextResponse.json({ error: errWilayah.message }, { status: 500 });
      if (errKk) return NextResponse.json({ error: errKk.message }, { status: 500 });
      const kkMap = new Map((kkSisa ?? []).map((k) => [k.idsubsls as string, k.jumlah_kk_total as number]));
      for (const w of wilayahSisa ?? []) {
        wilayahKerja.push({
          idsubsls: w.idsubsls as string,
          kecamatan: w.kecamatan as string,
          nagari: w.nagari as string,
          sls: w.sls as string,
          sub_sls: w.sub_sls as string,
          kk_total: kkMap.get(w.idsubsls as string) ?? 0,
          kk_terdampak_estimasi: 0,
          kk_terdampak_belum_lengkap: false,
        });
      }
    }
    // Jarak dari rumah petugas ke tiap Sub SLS tim (garis lurus, haversine, ke titik
    // pusat Sub SLS dari bencana_subsls_koordinat). Kalau lokasi rumah belum riil /
    // koordinat Sub SLS belum ada: pakai jarak hasil plotting utk Sub SLS miliknya sendiri
    // kalau ada, selain itu null (FE menulis "belum tersedia").
    const homeLat = typeof petugas.lat === "number" ? (petugas.lat as number) : null;
    const homeLng = typeof petugas.lng === "number" ? (petugas.lng as number) : null;
    const rumahRiil = petugas.lokasi_status === "riil" && homeLat != null && homeLng != null;
    const koord = new Map<string, { lat: number; lon: number }>();
    if (rumahRiil) {
      for (let i = 0; i < idsubslsList.length; i += 200) {
        const { data: kd } = await supabase.from("bencana_subsls_koordinat").select("idsubsls, lat, lon").in("idsubsls", idsubslsList.slice(i, i + 200));
        for (const k of (kd ?? []) as { idsubsls: string; lat: number | null; lon: number | null }[]) {
          if (typeof k.lat === "number" && typeof k.lon === "number") koord.set(k.idsubsls, { lat: k.lat, lon: k.lon });
        }
      }
    }
    const rad = (d: number) => (d * Math.PI) / 180;
    const haversineKm = (la1: number, lo1: number, la2: number, lo2: number) => {
      const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
    };
    for (const w of wilayahKerja) {
      const ids = pemegang.get(w.idsubsls) ?? [];
      w.milik_saya = ids.includes(petugas.id as number);
      w.pemegang = Array.from(new Set(ids.map((id) => namaPpl.get(id) ?? `#${id}`)));
      const k = koord.get(w.idsubsls);
      if (rumahRiil && k && homeLat != null && homeLng != null) {
        w.jarak_rumah_km = Math.round(haversineKm(homeLat, homeLng, k.lat, k.lon) * 10) / 10;
        w.jarak_sumber = "garis_lurus";
      } else if (jarakAlokasiSaya.has(w.idsubsls)) {
        w.jarak_rumah_km = Math.round((jarakAlokasiSaya.get(w.idsubsls) as number) * 10) / 10;
        w.jarak_sumber = "alokasi";
      } else {
        w.jarak_rumah_km = null;
        w.jarak_sumber = null;
      }
    }
    // Urut: Sub SLS milik sendiri dulu, lalu menurut jarak terdekat dari rumah, lalu wilayah.
    wilayahKerja.sort(
      (a, b) =>
        Number(!!b.milik_saya) - Number(!!a.milik_saya) ||
        (a.jarak_rumah_km ?? 1e9) - (b.jarak_rumah_km ?? 1e9) ||
        a.kecamatan.localeCompare(b.kecamatan, "id") ||
        a.nagari.localeCompare(b.nagari, "id")
    );
  }

  const sudahAkun = await punyaAkun(supabase, petugas.id as number);

  return NextResponse.json({
    data: {
      nama: petugas.nama,
      punya_akun: sudahAkun,
      status_kepegawaian: petugas.status_kepegawaian,
      pendaftaran_bencana_konfirmasi: petugas.pendaftaran_bencana_konfirmasi,
      status_kontak_pendaftaran_bencana: petugas.status_kontak_pendaftaran_bencana,
      catatan_penolakan_pendaftaran_bencana: petugas.catatan_penolakan_pendaftaran_bencana,
      jadwal_pelatihan_dipilih: petugas.jadwal_pelatihan_dipilih,
      perkiraan_hari_libur: petugas.perkiraan_hari_libur as string[] | null,
      wa_group_url: petugas.status_kontak_pendaftaran_bencana === "diterima" && sudahAkun ? WA_GROUP_URL : null,
      wilayah_kerja: wilayahKerja,
      // (5 Okt 2026) info tim keroyokan + status lokasi rumah (utk keterangan jarak).
      tim: {
        pml: pmlNama,
        anggota: anggotaTim.filter((t) => t.peran !== "pml").map((t) => t.nama),
      },
      lokasi_rumah_riil: petugas.lokasi_status === "riil" && petugas.lat != null && petugas.lng != null,
      // (3 Okt 2026) utk section "Lengkapi Data Anda" -- lihat komentar PATCH.
      no_hp: petugas.no_hp,
      lokasi_status: petugas.lokasi_status,
      umur: petugas.umur,
      jenis_kelamin: petugas.jenis_kelamin,
      pendidikan: petugas.pendidikan,
      pekerjaan: petugas.pekerjaan,
      bisa_mengendarai_motor: petugas.bisa_mengendarai_motor,
      punya_kendaraan_bermotor: petugas.punya_kendaraan_bermotor,
    },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.bersedia !== "boolean") {
    return NextResponse.json({ error: "Jawaban kesediaan wajib diisi." }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    pendaftaran_bencana_konfirmasi: body.bersedia,
    status_kontak_pendaftaran_bencana: body.bersedia ? "diterima" : "menolak",
    dikontak_pendaftaran_bencana_at: new Date().toISOString(),
  };

  if (body.bersedia) {
    // jadwal_pelatihan: array tanggal yg disanggupi (checkbox); string
    // tunggal tetap diterima utk kompatibilitas klien lama.
    const jadwalRaw: unknown[] = Array.isArray(body.jadwal_pelatihan) ? body.jadwal_pelatihan : [body.jadwal_pelatihan];
    const jadwal = JADWAL_VALID.filter((j) => jadwalRaw.includes(j));
    if (jadwal.length === 0 || jadwalRaw.some((j) => !(JADWAL_VALID as readonly string[]).includes(j as string))) {
      return NextResponse.json({ error: "Pilih minimal 1 tanggal pelatihan (7 dan/atau 8 Oktober 2026)." }, { status: 400 });
    }
    if (
      !Array.isArray(body.hari_libur) ||
      body.hari_libur.some((t: unknown) => typeof t !== "string" || !TANGGAL_PENDATAAN_VALID.includes(t))
    ) {
      return NextResponse.json({ error: "Perkiraan hari libur tidak valid (harus dlm 10-31 Oktober 2026)." }, { status: 400 });
    }
    update.jadwal_pelatihan_dipilih = jadwal.join(", ");
    update.perkiraan_hari_libur = Array.from(new Set(body.hari_libur as string[])).sort();
    update.catatan_penolakan_pendaftaran_bencana = null;
  } else {
    const alasan = typeof body.alasan === "string" ? body.alasan.trim() : "";
    if (!alasan) {
      return NextResponse.json({ error: "Alasan tidak bersedia wajib diisi." }, { status: 400 });
    }
    update.catatan_penolakan_pendaftaran_bencana = alasan;
    update.jadwal_pelatihan_dipilih = null;
    update.perkiraan_hari_libur = null;
  }

  const { data, error } = await supabase.from("bencana_petugas").update(update).eq("token", token).select("nama").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  return NextResponse.json({ ok: true, nama: data.nama });
}

// PATCH { lat?, lng?, no_hp?, umur?, jenis_kelamin?, pendidikan?, pekerjaan?,
//        bisa_mengendarai_motor?, punya_kendaraan_bermotor? }
// -> "Lengkapi Data Anda" (lihat komentar panjang di atas). Setiap field
// OPSIONAL & divalidasi SENDIRI2 -- hanya field yg benar2 dikirim (!==
// undefined) yg masuk ke update, supaya petugas bisa isi sebagian dulu.
// Scope-nya SELALU lewat token (bukan petugas_id) -- link ini cuma boleh
// mengubah data baris petugas pemilik token itu sendiri.
export async function PATCH(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  // Lokasi rumah -- SAMA persis dgn POST /api/bencana/lokasi/[token] (lihat
  // komentar di file itu utk alasan dipakai utk skor jarak Langkah 4).
  if (body.lat !== undefined || body.lng !== undefined) {
    const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
    if (lat === null || lng === null) {
      return NextResponse.json({ error: "Koordinat tidak valid." }, { status: 400 });
    }
    update.lat = lat;
    update.lng = lng;
    update.lokasi_status = "riil";
    update.lokasi_diperbarui_at = new Date().toISOString();
  }

  if (body.no_hp !== undefined) {
    const v = typeof body.no_hp === "string" ? body.no_hp.trim() : "";
    if (!v) return NextResponse.json({ error: "No HP tidak boleh kosong." }, { status: 400 });
    update.no_hp = v;
  }

  if (body.umur !== undefined) {
    const v = Number(body.umur);
    if (!Number.isFinite(v) || v < 15 || v > 90) {
      return NextResponse.json({ error: "Umur tidak valid (isi antara 15-90 tahun)." }, { status: 400 });
    }
    update.umur = Math.round(v);
  }

  if (body.jenis_kelamin !== undefined) {
    if (body.jenis_kelamin !== "Lk" && body.jenis_kelamin !== "Pr") {
      return NextResponse.json({ error: "Jenis kelamin harus Laki-laki atau Perempuan." }, { status: 400 });
    }
    update.jenis_kelamin = body.jenis_kelamin;
  }

  if (body.pendidikan !== undefined) {
    if (!(PENDIDIKAN_VALID as readonly string[]).includes(body.pendidikan)) {
      return NextResponse.json({ error: "Pilihan pendidikan tidak dikenal." }, { status: 400 });
    }
    update.pendidikan = body.pendidikan;
  }

  if (body.pekerjaan !== undefined) {
    if (!(PEKERJAAN_VALID as readonly string[]).includes(body.pekerjaan)) {
      return NextResponse.json({ error: "Pilihan pekerjaan tidak dikenal." }, { status: 400 });
    }
    update.pekerjaan = body.pekerjaan;
  }

  if (body.bisa_mengendarai_motor !== undefined) {
    if (typeof body.bisa_mengendarai_motor !== "boolean") {
      return NextResponse.json({ error: "Jawaban 'bisa mengendarai motor' tidak valid." }, { status: 400 });
    }
    update.bisa_mengendarai_motor = body.bisa_mengendarai_motor;
  }

  if (body.punya_kendaraan_bermotor !== undefined) {
    if (typeof body.punya_kendaraan_bermotor !== "boolean") {
      return NextResponse.json({ error: "Jawaban 'punya kendaraan bermotor' tidak valid." }, { status: 400 });
    }
    update.punya_kendaraan_bermotor = body.punya_kendaraan_bermotor;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Tidak ada data yang diisi." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bencana_petugas")
    .update(update)
    .eq("token", token)
    .select("nama")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
