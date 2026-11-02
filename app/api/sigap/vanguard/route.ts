// app/api/sigap/vanguard/route.ts
//
// (1 Nov 2026) VANGUARD V2a: rekaman percobaan simulasi kuesioner KP. Aturan: lib/vanguard/rekam.ts (penilaian ulang di server), lib/vanguardAkses.ts.
//   GET  ?kegiatan=ID  -> { mode:"tercatat", boleh, alasan, riwayat:[{kasus, percobaan, benar, bintang}], lemah:[{jenis, jumlah}], pengaturan:{level_dibuka, nilai_lulus, buka_at, tutup_at, maks_percobaan, status}, lulus:{dibuka, benar, persen, lulus}, final:{status, nilai, dibuka, benar, selesai, remark, pendampingan} }
//                         (hanya milik akun sendiri; lemah = kesalahan per jenis, dasar saran Latihan kesalahan saya; pengaturan = sigap_vanguard_pengaturan, bawaan bila belum ada)
//                         tanpa ?kegiatan -> { mode:"bebas", boleh:false, riwayat:[] } (simulasi bebas: tidak ada rekaman)
//        (V5b) kegiatan bermode uji memakai buku uji: riwayat dan lulus hanya dari percobaan bermode "uji"; batas percobaan dan bintang juga dihitung dari percobaan uji saja.
//        (V5b) pengaturan.mode = "latihan" | "uji"; `uji` = mode uji sedang berlaku (jadwal buka); `kemampuan` (jenis kesalahan per kasus, dasar saran) hanya pada latihan.
//        (2 Nov 2026) `runtutan` = { mode, tuntas, berturut, hari_berturut, hari_ini_sudah, terputus, petak:[{status,tanggal}], kelayakan:{batas_mulai,mungkin,cadangan_hari,hari_terakhir_mulai}, tanggal_pretest } | null
//   POST { kegiatan, kasus, isian, petunjuk, lihatJawaban, durasiDtk, kalkulator } -> menilai ulang di server, mencatat, dan membalas { dicatat, nomor, benar, bintang, koreksi, pemeriksaan }
//        (V5b) pada MODE UJI yang berlaku: petunjuk diabaikan (0), "Lihat jawaban" ditolak (400), percobaan dicatat bermode "uji", dan balasan hanya { dicatat, uji:true, nomor, benar, bintang, jmlSalah }
//        (tanpa koreksi, pemeriksaan, atau kotak mana yang salah: kunci tidak bocor lewat balasan).
//        Ditolak bila di luar jadwal (403), level kasus belum dibuka (403), atau batas percobaan tercapai (429): lib/vanguard/pengaturan.ts.
// Tidak boleh mencatat saat "masuk sebagai" akun lain (hanya lihat). Tidak ada data responden nyata: kasus fiktif; yang disimpan isian petugas.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, sesiDariHeader } from "@/lib/sigapAkses";
import { bolehMencatat } from "@/lib/vanguardAkses";
import { barisKesalahan, barisPercobaan, bacaMuatan, modeMasuk, ringkasLemah, ringkasPercobaan, ringkasRiwayat } from "@/lib/vanguard/rekam";
import { bolehMencoba, hasilFinal, hitungLulus, statusJadwal, ujiBerlaku } from "@/lib/vanguard/pengaturan";
import { KASUS } from "@/lib/vanguard/kasus";
import { adalahKasusK } from "@/lib/vanguard/kuesioner/publik";
import { petaKemampuan } from "@/lib/vanguard/remedial";
import { muatPengaturan, tambahKalkulator } from "@/lib/vanguardPengaturanDb";
import { ringkasRuntutanAkun } from "@/lib/vanguardRuntutanDb"; // (2 Nov 2026) runtutan "N hari berturut-turut" untuk kartu Hari ini

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

const idKegiatan = (s: string | null): number | null => (s && /^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : null);

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatan = idKegiatan(req.nextUrl.searchParams.get("kegiatan"));
    if (modeMasuk(kegiatan) === "bebas") return NextResponse.json({ mode: "bebas", boleh: false, alasan: null, riwayat: [] });
    const izin = await bolehMencatat(db as Db, akunId, kegiatan as number);
    if (!izin.boleh) return NextResponse.json({ mode: "tercatat", boleh: false, alasan: izin.alasan, riwayat: [] });
    const peng = await muatPengaturan(db as Db, kegiatan as number);
    const { data, error } = await db.from("sigap_vanguard_percobaan").select("kasus, benar, bintang, mode").eq("kegiatan_id", kegiatan).eq("akun_id", akunId).limit(5000);
    if (error) return galat("Gagal memuat riwayat.", 500);
    const { data: ks, error: eKs } = await db.from("sigap_vanguard_kesalahan").select("jenis, kasus").eq("kegiatan_id", kegiatan).eq("akun_id", akunId).limit(5000);
    if (eKs) return galat("Gagal memuat riwayat.", 500);
    // Kegiatan bermode uji memakai BUKU UJI: hanya percobaan bermode "uji" yang dihitung (riwayat, bintang, lulus); latihan sebelumnya tidak ikut.
    const semuaBaris = ((data ?? []) as { kasus: string; benar: boolean; bintang: number; mode?: string }[]);
    const baris = semuaBaris.filter((b) => !adalahKasusK(b.kasus)).filter((b) => peng.mode !== "uji" || b.mode === "uji");
    const riwayat = ringkasRiwayat(baris);
    const riwayatK = ringkasRiwayat(semuaBaris.filter((b) => adalahKasusK(b.kasus))); // Mode Kuesioner Penuh: terpisah dari bintang dan kelulusan
    const uji = ujiBerlaku(peng, Date.now());
    const runtutan = await ringkasRuntutanAkun(db as Db, kegiatan as number, akunId, Date.now()); // null bila aturan tidak diatur / Vanguard tidak menyala
    return NextResponse.json({
      mode: "tercatat", boleh: true, alasan: null, runtutan, riwayat, riwayatK, lemah: ringkasLemah(((ks ?? []) as { jenis: string; kasus: string }[]).filter((k) => !adalahKasusK(k.kasus))),
      uji, ...(uji ? {} : { kemampuan: petaKemampuan(KASUS) }),
      pengaturan: { ...peng, status: statusJadwal(peng, Date.now()) },
      lulus: hitungLulus(peng, riwayat.filter((r) => r.benar).map((r) => r.kasus)),
      final: hasilFinal(peng, riwayat),
    });
  } catch {
    return galat("Gagal memuat Vanguard.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat mencatat percobaan.", 403);
    let badan: unknown;
    try { badan = await req.json(); } catch { return galat("Isi permintaan tidak sah."); }
    const baca = bacaMuatan(badan);
    if (!baca.ok) return galat(baca.pesan);
    const { kasus } = baca;
    let { muatan } = baca;
    const izin = await bolehMencatat(db as Db, akunId, muatan.kegiatan);
    if (!izin.boleh) return galat(izin.alasan ?? "Tidak diizinkan.", 403);
    const peng = await muatPengaturan(db as Db, muatan.kegiatan);
    const uji = ujiBerlaku(peng, Date.now());
    if (uji) {
      if (muatan.lihatJawaban) return galat("Mode uji tidak menyediakan \"Lihat jawaban\".", 400);
      muatan = { ...muatan, petunjuk: 0 }; // tidak ada petunjuk pada uji; angka dari klien tidak dipercaya
    }

    // Nomor percobaan = urutan petugas pada kasus ini. Dua kiriman bersamaan bertabrakan di unique (kegiatan, akun, kasus, nomor): coba ulang sekali.
    for (let ulang = 0; ulang < 2; ulang++) {
      const { count, error: eHitung } = await db.from("sigap_vanguard_percobaan").select("id", { count: "exact", head: true }).eq("kegiatan_id", muatan.kegiatan).eq("akun_id", akunId).eq("kasus", muatan.kasus);
      if (eHitung) return galat("Gagal mencatat percobaan.", 500);
      const sudah = count ?? 0;
      const nomor = sudah + 1; // nomor di basis data: urutan semua percobaan petugas pada kasus ini (unik)
      let sudahBuku = sudah;
      if (uji) {
        const { count: cu, error: eUji } = await db.from("sigap_vanguard_percobaan").select("id", { count: "exact", head: true }).eq("kegiatan_id", muatan.kegiatan).eq("akun_id", akunId).eq("kasus", muatan.kasus).eq("mode", "uji");
        if (eUji) return galat("Gagal mencatat percobaan.", 500);
        sudahBuku = cu ?? 0; // pada uji, batas dan bintang dihitung dari percobaan uji saja
      }
      const nomorBuku = sudahBuku + 1;
      const cek = bolehMencoba(peng, kasus, sudahBuku, Date.now());
      if (!cek.boleh) return galat(cek.alasan, cek.alasan.startsWith("Batas percobaan") ? 429 : 403);
      const hasil = ringkasPercobaan(kasus, muatan, nomorBuku);
      const { data: baru, error } = await db.from("sigap_vanguard_percobaan").insert(barisPercobaan(akunId, muatan, hasil, nomor, uji ? "uji" : "latihan")).select("id").single();
      if (error) {
        if ((error as { code?: string }).code === "23505" && ulang === 0) continue;
        return galat("Gagal mencatat percobaan.", 500);
      }
      const kes = barisKesalahan((baru as { id: number }).id, akunId, muatan, hasil);
      if (kes.length > 0) {
        const { error: eKes } = await db.from("sigap_vanguard_kesalahan").insert(kes);
        if (eKes) return galat("Percobaan tercatat, tetapi rincian kesalahan gagal disimpan.", 500);
      }
      await tambahKalkulator(db as Db, muatan.kegiatan, akunId, muatan.kalkulator);
      if (uji) return NextResponse.json({ dicatat: true, uji: true, nomor: nomorBuku, benar: hasil.benar, bintang: hasil.bintang, jmlSalah: hasil.jmlSalah });
      return NextResponse.json({ dicatat: true, nomor: nomorBuku, benar: hasil.benar, bintang: hasil.bintang, koreksi: hasil.koreksi, pemeriksaan: hasil.pemeriksaan });
    }
    return galat("Gagal mencatat percobaan.", 500);
  } catch {
    return galat("Gagal mencatat percobaan.", 500);
  }
}
