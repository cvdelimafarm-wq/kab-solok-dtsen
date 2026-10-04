// app/api/bencana/menginap/[token]/route.ts
//
// Halaman publik "Konfirmasi Kesediaan Menginap" -- TANPA LOGIN, lewat token
// UNIK PER KANDIDAT PER TAWARAN (bencana_tawaran_menginap_kandidat.token,
// BUKAN bencana_petugas.token -- 1 petugas bisa saja ditawari lebih dari 1
// tawaran menginap pada waktu yg berbeda, masing2 butuh link & status
// jawaban sendiri). Dikirim admin ke beberapa kandidat sekaligus utk 1
// kebutuhan/klaster yg kekurangan petugas dekat (lihat kartu "Tawaran
// Menginap" di tab Alokasi Petugas, dan
// app/api/bencana/alokasi/tawaran-menginap/route.ts utk pembuatan tawaran).
//
// GET  -> info kandidat (nama) + info tawaran (kecamatan/nagari/keterangan)
//         + status jawaban SAAT INI (kalau sudah pernah jawab).
// POST -> submit jawaban. (4 Okt 2026) skema pertanyaan diperluas:
//         bersedia=true  : pola_menginap ('penuh'|'akhir_pekan'), jadwal_pelatihan
//                          (array), hari_libur (array tanggal 10-31 Okt), teman_menginap?
//         bersedia=false : alasan_kategori ('keluarga'|'kesehatan'|'pekerjaan'|'lainnya'),
//                          alasan (teks), bersedia_pulang_pergi (boolean). TIDAK mengubah bencana_alokasi_subsls / plot
//         resmi apa pun -- murni mencatat kesediaan, admin yg memplot
//         manual sesudah melihat siapa yg bersedia (tab Alokasi Petugas).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WA_GROUP_URL, punyaAkun } from "@/lib/undangan";

const JADWAL_VALID = ["7 Oktober 2026", "8 Oktober 2026"] as const;
const TANGGAL_PENDATAAN_VALID: string[] = Array.from({ length: 22 }, (_, i) => `2026-10-${String(10 + i).padStart(2, "0")}`);
const AWAL_MENOLAK_MENGINAP = "Tidak bersedia menginap";
const POLA_VALID = ["penuh", "akhir_pekan"] as const;
const KATEGORI_VALID = ["keluarga", "kesehatan", "pekerjaan", "lainnya"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { data: kandidat, error } = await supabase
    .from("bencana_tawaran_menginap_kandidat")
    .select(
      "id, petugas_id, status, catatan, dijawab_pada, pola_menginap, jadwal_pelatihan, perkiraan_hari_libur, teman_menginap, alasan_kategori, bersedia_pulang_pergi, bencana_petugas(nama), bencana_tawaran_menginap(kecamatan, nagari, keterangan)"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!kandidat) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  const petugas = kandidat.bencana_petugas as unknown as { nama: string } | null;
  const tawaran = kandidat.bencana_tawaran_menginap as unknown as {
    kecamatan: string;
    nagari: string | null;
    keterangan: string;
  } | null;

  // (4 Okt 2026) WA grup baru tampil setelah bersedia & membuat akun (PIN).
  const sudahAkun = await punyaAkun(supabase, kandidat.petugas_id as number);
  // Token petugas dikirim hanya setelah bersedia: dipakai panel "Lengkapi Data Anda"
  // (memanfaatkan API reguler); pemilik link menginap = orang yang sama.
  let petugasToken: string | null = null;
  if (kandidat.status === "bersedia") {
    const { data: pt } = await supabase.from("bencana_petugas").select("token").eq("id", kandidat.petugas_id as number).maybeSingle();
    petugasToken = (pt?.token as string | undefined) ?? null;
  }

  return NextResponse.json({
    data: {
      nama: petugas?.nama ?? "",
      punya_akun: sudahAkun,
      petugas_token: petugasToken,
      wa_group_url: kandidat.status === "bersedia" && sudahAkun ? WA_GROUP_URL : null,
      kecamatan: tawaran?.kecamatan ?? "",
      nagari: tawaran?.nagari ?? null,
      keterangan: tawaran?.keterangan ?? "",
      status: kandidat.status,
      catatan: kandidat.catatan,
      dijawab_pada: kandidat.dijawab_pada,
      pola_menginap: kandidat.pola_menginap,
      jadwal_pelatihan: kandidat.jadwal_pelatihan,
      perkiraan_hari_libur: kandidat.perkiraan_hari_libur,
      teman_menginap: kandidat.teman_menginap,
      alasan_kategori: kandidat.alasan_kategori,
      bersedia_pulang_pergi: kandidat.bersedia_pulang_pergi,
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
    status: body.bersedia ? "bersedia" : "tidak_bersedia",
    dijawab_pada: new Date().toISOString(),
  };
  let jadwalTeks: string | null = null;
  let hariLibur: string[] = [];
  if (body.bersedia) {
    if (!(POLA_VALID as readonly string[]).includes(body.pola_menginap)) {
      return NextResponse.json({ error: "Pilih pola menginap yang Anda sanggupi." }, { status: 400 });
    }
    const jadwalRaw: unknown[] = Array.isArray(body.jadwal_pelatihan) ? body.jadwal_pelatihan : [];
    const jadwal = JADWAL_VALID.filter((j) => jadwalRaw.includes(j));
    if (jadwal.length === 0 || jadwalRaw.some((j) => !(JADWAL_VALID as readonly string[]).includes(j as string))) {
      return NextResponse.json({ error: "Pilih minimal 1 tanggal pelatihan (7 dan/atau 8 Oktober 2026)." }, { status: 400 });
    }
    if (!Array.isArray(body.hari_libur) || body.hari_libur.some((t: unknown) => typeof t !== "string" || !TANGGAL_PENDATAAN_VALID.includes(t))) {
      return NextResponse.json({ error: "Perkiraan hari libur tidak valid (harus dalam 10-31 Oktober 2026)." }, { status: 400 });
    }
    hariLibur = Array.from(new Set(body.hari_libur as string[])).sort();
    jadwalTeks = jadwal.join(", ");
    const teman = typeof body.teman_menginap === "string" ? body.teman_menginap.trim().slice(0, 200) : "";
    update.pola_menginap = body.pola_menginap;
    update.jadwal_pelatihan = jadwalTeks;
    update.perkiraan_hari_libur = hariLibur;
    update.teman_menginap = teman || null;
    update.catatan = null;
    update.alasan_kategori = null;
    update.bersedia_pulang_pergi = null;
  } else {
    const alasan = typeof body.alasan === "string" ? body.alasan.trim() : "";
    if (!(KATEGORI_VALID as readonly string[]).includes(body.alasan_kategori)) {
      return NextResponse.json({ error: "Pilih kategori alasan tidak bersedia." }, { status: 400 });
    }
    if (!alasan) {
      return NextResponse.json({ error: "Alasan tidak bersedia wajib diisi." }, { status: 400 });
    }
    if (typeof body.bersedia_pulang_pergi !== "boolean") {
      return NextResponse.json({ error: "Jawab apakah Anda tetap bersedia pulang-pergi." }, { status: 400 });
    }
    update.catatan = alasan;
    update.alasan_kategori = body.alasan_kategori;
    update.bersedia_pulang_pergi = body.bersedia_pulang_pergi;
    update.pola_menginap = null;
    update.jadwal_pelatihan = null;
    update.perkiraan_hari_libur = null;
    update.teman_menginap = null;
  }

  const { data, error } = await supabase
    .from("bencana_tawaran_menginap_kandidat")
    .update(update)
    .eq("token", token)
    .select("id, bencana_petugas(nama)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  // (4 Okt 2026) Sinkron ke data petugas (kesediaan umum):
  //  - bersedia menginap          : jadwal pelatihan & hari libur ikut disimpan; kalau sudah
  //                                 diplot, status kesediaan = diterima (sama dgn konfirmasi reguler).
  //  - tidak bersedia, tidak mau pulang-pergi, sudah diplot : plot jadi kosong karena penolakan
  //                                 -> ditandai 'menolak' (memunculkan peringatan di Langkah 4).
  //  - tidak bersedia tapi bersedia pulang-pergi : plot tetap, tidak ada penanda menolak.
  const { data: kand } = await supabase
    .from("bencana_tawaran_menginap_kandidat")
    .select("petugas_id")
    .eq("token", token)
    .maybeSingle();
  const pid = kand?.petugas_id as number | undefined;
  if (pid) {
    const { count } = await supabase.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).eq("ppl_id", pid);
    const diplot = !!count && count > 0;
    const sekarang = new Date().toISOString();
    if (body.bersedia === true) {
      const upd: Record<string, unknown> = { jadwal_pelatihan_dipilih: jadwalTeks, perkiraan_hari_libur: hariLibur };
      if (diplot) {
        upd.pendaftaran_bencana_konfirmasi = true;
        upd.status_kontak_pendaftaran_bencana = "diterima";
        upd.catatan_penolakan_pendaftaran_bencana = null;
        upd.dikontak_pendaftaran_bencana_at = sekarang;
      }
      await supabase.from("bencana_petugas").update(upd).eq("id", pid);
    } else if (body.bersedia === false && diplot && body.bersedia_pulang_pergi === false) {
      await supabase
        .from("bencana_petugas")
        .update({
          status_kontak_pendaftaran_bencana: "menolak",
          catatan_penolakan_pendaftaran_bencana: `${AWAL_MENOLAK_MENGINAP}: ${update.catatan as string}`,
          dikontak_pendaftaran_bencana_at: sekarang,
        })
        .eq("id", pid);
    } else if (body.bersedia === false && diplot) {
      // bersedia pulang-pergi: bersihkan penanda menolak otomatis dari jawaban sebelumnya
      await supabase
        .from("bencana_petugas")
        .update({ status_kontak_pendaftaran_bencana: null, catatan_penolakan_pendaftaran_bencana: null })
        .eq("id", pid)
        .eq("status_kontak_pendaftaran_bencana", "menolak")
        .like("catatan_penolakan_pendaftaran_bencana", `${AWAL_MENOLAK_MENGINAP}%`);
    }
  }

  const petugas = data.bencana_petugas as unknown as { nama: string } | null;
  return NextResponse.json({ ok: true, nama: petugas?.nama ?? "" });
}
