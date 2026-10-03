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
//
// GET  -> info petugas (nama, status saat ini) + "perkiraan wilayah kerja"
//         (Sub SLS yg SUDAH di-plot resmi ke petugas ini di
//         bencana_alokasi_subsls -- BUKAN draft, krn halaman ini dikirim
//         SESUDAH admin plot di Langkah 4), lengkap nama kecamatan/nagari/
//         jorong + jumlah KK total & perkiraan KK terdampak (dari RPC
//         bencana_kertas_kerja_beban(), SAMA dgn yg dipakai "Kertas Kerja
//         Beban" admin -- supaya angkanya konsisten, tidak dihitung ulang
//         dgn rumus lain di sini).
// POST -> submit jawaban { bersedia: boolean, jadwal_pelatihan?: string,
//         alasan?: string }.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JADWAL_VALID = ["7 Oktober 2026", "8 Oktober 2026"] as const;

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
      "id, nama, status_kepegawaian, aktif, pendaftaran_bencana_konfirmasi, status_kontak_pendaftaran_bencana, catatan_penolakan_pendaftaran_bencana, jadwal_pelatihan_dipilih"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!petugas) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  // Wilayah kerja -- Sub SLS yg SUDAH diplot RESMI (tersimpan, bukan draft)
  // ke petugas ini.
  const { data: alokasiRows, error: errAlokasi } = await supabase
    .from("bencana_alokasi_subsls")
    .select("idsubsls")
    .eq("ppl_id", petugas.id);
  if (errAlokasi) return NextResponse.json({ error: errAlokasi.message }, { status: 500 });

  const idsubslsList = Array.from(new Set((alokasiRows ?? []).map((r) => r.idsubsls as string)));
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
    wilayahKerja.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan, "id") || a.nagari.localeCompare(b.nagari, "id"));
  }

  return NextResponse.json({
    data: {
      nama: petugas.nama,
      pendaftaran_bencana_konfirmasi: petugas.pendaftaran_bencana_konfirmasi,
      status_kontak_pendaftaran_bencana: petugas.status_kontak_pendaftaran_bencana,
      catatan_penolakan_pendaftaran_bencana: petugas.catatan_penolakan_pendaftaran_bencana,
      jadwal_pelatihan_dipilih: petugas.jadwal_pelatihan_dipilih,
      wilayah_kerja: wilayahKerja,
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
    if (!(JADWAL_VALID as readonly string[]).includes(body.jadwal_pelatihan)) {
      return NextResponse.json({ error: "Jadwal pelatihan (7 atau 8 Oktober 2026) wajib dipilih." }, { status: 400 });
    }
    update.jadwal_pelatihan_dipilih = body.jadwal_pelatihan;
    update.catatan_penolakan_pendaftaran_bencana = null;
  } else {
    const alasan = typeof body.alasan === "string" ? body.alasan.trim() : "";
    if (!alasan) {
      return NextResponse.json({ error: "Alasan tidak bersedia wajib diisi." }, { status: 400 });
    }
    update.catatan_penolakan_pendaftaran_bencana = alasan;
    update.jadwal_pelatihan_dipilih = null;
  }

  const { data, error } = await supabase.from("bencana_petugas").update(update).eq("token", token).select("nama").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  return NextResponse.json({ ok: true, nama: data.nama });
}
