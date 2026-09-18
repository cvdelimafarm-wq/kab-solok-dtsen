// app/api/penyisiran/alokasi/auto-alokasi/route.ts
//
// POST -> alokasi OTOMATIS 5 SLS/Jorong prioritas tertinggi utk SEMUA
// petugas AKTIF yang BELUM PERNAH submit pilihan sendiri (dikonfirmasi
// user lewat AskUserQuestion 2026-09-19: petugas yg SUDAH submit manual
// TIDAK disentuh -- SLS yang sudah mereka pilih dianggap "terpakai",
// tidak bisa direbut petugas lain oleh proses ini).
//
// ALGORITMA -- "deferred acceptance" ala Gale-Shapley, sisi petugas yg
// melamar: tiap petugas punya daftar SLS diurutkan skor prioritas
// (skor_akhir) turun, melamar SLS teratas yg belum pernah dicoba. Tiap
// SLS cuma bisa dipegang OLEH SATU petugas (kapasitas 1) -- kalau
// direbut petugas lain yg "lebih prioritas" utk SLS itu, petugas yg
// kalah otomatis lanjut melamar SLS berikutnya di daftarnya. Diulang
// sampai semua petugas dpt 5 SLS ATAU kandidatnya habis. Hasil akhir ini
// STABIL (tidak ada petugas yg lebih menginginkan SLS org lain drpd SLS
// yg dia dapat sendiri, kecuali org itu memang lebih diprioritaskan utk
// SLS tsb) -- lihat teorema Gale-Shapley (college admissions, versi
// many-to-one: petugas kapasitas 5, SLS kapasitas 1).
//
// "LEBIH PRIORITAS" dibandingkan berurutan lewat 2 kriteria:
//  1. TIER keakuratan titik asal (angka lbh kecil = lbh akurat = menang):
//       1 = lokasi rumah asli (lat/lng tersimpan, dari GPS)
//       2 = titik tengah (centroid) NAGARI tempat tinggal -- dipakai
//           kalau lat/lng kosong TAPI alamat_kecamatan+alamat_nagari
//           (tabel Master Petugas) cocok dgn >=1 SLS berkoordinat di
//           nagari itu (dikonfirmasi user)
//       3 = tanpa data lokasi sama sekali -> skor pakai Skor Dasar +
//           Bonus Volume SAJA (penalti jarak dianggap 0, BUKAN krn dia
//           benar2 dekat, tapi krn jaraknya tidak bisa dihitung) --
//           SENGAJA ditaruh tier PALING AKHIR: kalau dibandingkan angka
//           skor mentah dia bisa tampak lbh tinggi drpd yg kena penalti
//           jarak, padahal itu cuma krn datanya tidak lengkap.
//  2. Kalau tier sama -> bandingkan skor_akhir (lbh tinggi menang), lalu
//     jumlah_potensi (lbh besar menang) sbg tie-break terakhir.
//
// Dipanggil dari tombol "🎯 Alokasikan Otomatis" di WilayahSampelPanel
// (app/penyisiran/perencanaan-lapangan.tsx) -- HANYA tampil & HANYA
// bisa diakses (dijaga jg di server lewat pastikanPengelola di bawah)
// utk 4 pengelola yg sama dgn tab Manajemen Target/Master Petugas
// (bolehAksesManajemenTarget). Menulis LANGSUNG ke tabel
// penyisiran_alokasi_pilihan (REPLACE per petugas -- sama persis spt
// kalau petugas ybs klik "Kirim Pilihan" sendiri), jadi sesudah proses
// ini, petugas ybs otomatis tampak "sudah pernah submit" & TIDAK akan
// diproses ulang kalau tombol ini diklik lagi nanti (kalau perlu diubah,
// petugas ybs tetap bisa checklist ulang manual spt biasa).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { haversineKm, hitungJarakJalanMassal, type Titik } from "@/lib/jarakJalan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_PILIHAN = 5;
// Jaga-jaga murni thd bug tak terduga (loop tak berujung) -- jumlah
// iterasi wajar utk skala data ini (puluhan petugas x ratusan SLS) jauh
// di bawah ini.
const BATAS_PENGAMAN_ITERASI = 500_000;

interface DasarSlsRow {
  sls_key: string;
  kec_kode: string;
  kec_nama: string;
  nagari_kode: string;
  nagari_nama: string;
  sls_kode: string;
  sls_nama: string;
  jumlah_potensi: number;
  skor_dasar_rata: number;
  bonus_volume: number;
  lat_c: number | null;
  lng_c: number | null;
  sudah_dipilih_oleh: number;
}

interface PetugasAkun {
  id: number;
  nama: string;
  lat: number | null;
  lng: number | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
}

interface KandidatSkor {
  sls_key: string;
  skor_akhir: number;
  jumlah_potensi: number;
}

type Tier = 1 | 2 | 3;

interface PetugasProses {
  id: number;
  nama: string;
  tier: Tier;
  kandidat: KandidatSkor[];
  pointer: number;
  assigned: string[];
}

function normTeks(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function pastikanPengelola(
  req: NextRequest,
  supabase: any
): Promise<{ nama: string } | NextResponse> {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  if (!subjectId) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const { data: akun, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nama = akun?.nama ?? null;
  if (!bolehAksesManajemenTarget(nama)) {
    return NextResponse.json(
      { error: "Fitur ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }
  return { nama: nama as string };
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if (gate instanceof NextResponse) return gate;

  const [dasarRes, petugasRes, pilihanRes] = await Promise.all([
    supabase.rpc("penyisiran_alokasi_dasar_sls"),
    supabase
      .from("petugas_penyisiran_akun")
      .select("id, nama, lat, lng, alamat_kecamatan, alamat_nagari")
      .eq("aktif", true),
    supabase.from("penyisiran_alokasi_pilihan").select("petugas_id, sls_key"),
  ]);
  if (dasarRes.error) return NextResponse.json({ error: dasarRes.error.message }, { status: 500 });
  if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });
  if (pilihanRes.error) return NextResponse.json({ error: pilihanRes.error.message }, { status: 500 });

  const dasar = (dasarRes.data ?? []) as DasarSlsRow[];
  const semuaPetugas = (petugasRes.data ?? []) as PetugasAkun[];
  const pilihanLama = (pilihanRes.data ?? []) as { petugas_id: number; sls_key: string }[];

  // Petugas yg SUDAH submit sendiri -- TIDAK disentuh; SLS pilihan mereka
  // dianggap "terpakai" (tidak bisa direbut proses ini), dikonfirmasi user.
  const petugasSudahSubmit = new Set<number>(pilihanLama.map((r) => r.petugas_id));
  const slsTerpakai = new Set<string>(pilihanLama.map((r) => r.sls_key));

  const petugasDiproses = semuaPetugas.filter((p) => !petugasSudahSubmit.has(p.id));
  if (petugasDiproses.length === 0) {
    return NextResponse.json({
      ok: true,
      jumlah_petugas_diproses: 0,
      jumlah_petugas_dilewati: semuaPetugas.length,
      jumlah_rebutan_terjadi: 0,
      jumlah_dpt_penuh: 0,
      hasil: [],
      pesan: "Semua petugas aktif sudah pernah submit pilihan sendiri -- tidak ada yang diproses.",
    });
  }

  // Kandidat SLS = semua SLS berpotensi DIKURANGI yg sudah "terpakai" oleh
  // petugas yg sudah submit sendiri.
  const kandidatPool = dasar.filter((d) => !slsTerpakai.has(d.sls_key));
  const dasarBySlsKey = new Map(dasar.map((d) => [d.sls_key, d]));

  const idxCentroidValid: number[] = [];
  const titikCentroid: Titik[] = [];
  kandidatPool.forEach((r, i) => {
    if (r.lat_c != null && r.lng_c != null) {
      idxCentroidValid.push(i);
      titikCentroid.push({ lat: r.lat_c, lng: r.lng_c });
    }
  });

  // Tentukan tier & titik asal per petugas yg diproses (lihat penjelasan
  // 3 tier di komentar atas file).
  const infoTier = new Map<number, { tier: Tier; asal: Titik | null }>();
  for (const p of petugasDiproses) {
    if (p.lat != null && p.lng != null) {
      infoTier.set(p.id, { tier: 1, asal: { lat: p.lat, lng: p.lng } });
      continue;
    }
    if (p.alamat_kecamatan && p.alamat_nagari) {
      const kecN = normTeks(p.alamat_kecamatan);
      const nagN = normTeks(p.alamat_nagari);
      const cocok = dasar.filter(
        (d) => d.lat_c != null && d.lng_c != null && normTeks(d.kec_nama) === kecN && normTeks(d.nagari_nama) === nagN
      );
      if (cocok.length > 0) {
        const lat = cocok.reduce((s, d) => s + (d.lat_c as number), 0) / cocok.length;
        const lng = cocok.reduce((s, d) => s + (d.lng_c as number), 0) / cocok.length;
        infoTier.set(p.id, { tier: 2, asal: { lat, lng } });
        continue;
      }
    }
    infoTier.set(p.id, { tier: 3, asal: null });
  }

  // Hitung jarak (jalan/OSRM dgn fallback haversine, PERSIS rumus yg sama
  // dgn .../alokasi/rekomendasi/route.ts) -- paralel per petugas (tiap
  // petugas independen satu sama lain).
  const jarakPerPetugas = new Map<number, (number | null)[]>(); // sejajar index kandidatPool
  await Promise.all(
    petugasDiproses.map(async (p) => {
      const info = infoTier.get(p.id)!;
      const jarakArr: (number | null)[] = new Array(kandidatPool.length).fill(null);
      if (info.asal && titikCentroid.length > 0) {
        const jalan = await hitungJarakJalanMassal(info.asal, titikCentroid);
        if (jalan) {
          idxCentroidValid.forEach((origIdx, k) => (jarakArr[origIdx] = jalan[k]));
        } else {
          idxCentroidValid.forEach((origIdx, k) => {
            const t = titikCentroid[k];
            jarakArr[origIdx] = haversineKm(info.asal!.lat, info.asal!.lng, t.lat, t.lng);
          });
        }
      }
      jarakPerPetugas.set(p.id, jarakArr);
    })
  );

  // Susun daftar kandidat terurut skor_akhir turun (lalu jumlah_potensi
  // turun) per petugas -- ini SEKALIGUS urutan "lamaran" & nilai yg
  // dipakai saat SLS direbutkan.
  const proses: PetugasProses[] = petugasDiproses.map((p) => {
    const info = infoTier.get(p.id)!;
    const jarakArr = jarakPerPetugas.get(p.id)!;
    const kandidat: KandidatSkor[] = kandidatPool.map((r, i) => {
      const jarak = jarakArr[i];
      const penalti = jarak != null ? Math.min(20, jarak * 2) : null;
      const skorAkhir = r.skor_dasar_rata + r.bonus_volume - (penalti ?? 0);
      return { sls_key: r.sls_key, skor_akhir: Math.round(skorAkhir * 10) / 10, jumlah_potensi: r.jumlah_potensi };
    });
    kandidat.sort((a, b) => (b.skor_akhir !== a.skor_akhir ? b.skor_akhir - a.skor_akhir : b.jumlah_potensi - a.jumlah_potensi));
    return { id: p.id, nama: p.nama, tier: info.tier, kandidat, pointer: 0, assigned: [] };
  });

  // ---- Algoritma "deferred acceptance" (petugas melamar, SLS kapasitas 1) ----
  const byId = new Map(proses.map((p) => [p.id, p]));
  const holder = new Map<string, { petugasId: number; tier: Tier; skor_akhir: number; jumlah_potensi: number }>();
  let jumlahRebutan = 0;
  const antrian: number[] = proses.map((p) => p.id);
  let pengaman = 0;

  while (antrian.length > 0 && pengaman < BATAS_PENGAMAN_ITERASI) {
    pengaman++;
    const pid = antrian.shift() as number;
    const p = byId.get(pid)!;
    if (p.assigned.length >= MAKS_PILIHAN) continue;

    while (p.pointer < p.kandidat.length) {
      const cand = p.kandidat[p.pointer];
      p.pointer++;
      const held = holder.get(cand.sls_key);
      if (!held) {
        holder.set(cand.sls_key, { petugasId: p.id, tier: p.tier, skor_akhir: cand.skor_akhir, jumlah_potensi: cand.jumlah_potensi });
        p.assigned.push(cand.sls_key);
        break;
      }
      const lebihKuat =
        p.tier < held.tier ||
        (p.tier === held.tier &&
          (cand.skor_akhir > held.skor_akhir ||
            (cand.skor_akhir === held.skor_akhir && cand.jumlah_potensi > held.jumlah_potensi)));
      if (lebihKuat) {
        jumlahRebutan++;
        const lama = byId.get(held.petugasId)!;
        lama.assigned = lama.assigned.filter((k) => k !== cand.sls_key);
        holder.set(cand.sls_key, { petugasId: p.id, tier: p.tier, skor_akhir: cand.skor_akhir, jumlah_potensi: cand.jumlah_potensi });
        p.assigned.push(cand.sls_key);
        if (lama.assigned.length < MAKS_PILIHAN && lama.pointer < lama.kandidat.length) antrian.push(lama.id);
        break;
      }
      // kalah rebutan -- lanjut coba kandidat berikutnya di while ini
    }
    if (p.assigned.length < MAKS_PILIHAN && p.pointer < p.kandidat.length) antrian.push(p.id);
  }

  // ---- Simpan ke DB (REPLACE per petugas, sama persis spt submit sendiri) ----
  const petugasIdsDiproses = proses.map((p) => p.id);
  const { error: delErr } = await supabase
    .from("penyisiran_alokasi_pilihan")
    .delete()
    .in("petugas_id", petugasIdsDiproses);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const rowsInsert: Record<string, unknown>[] = [];
  for (const p of proses) {
    for (const slsKey of p.assigned) {
      const d = dasarBySlsKey.get(slsKey);
      if (!d) continue;
      rowsInsert.push({
        petugas_id: p.id,
        sls_key: d.sls_key,
        kec_kode: d.kec_kode,
        kec_nama: d.kec_nama,
        nagari_kode: d.nagari_kode,
        nagari_nama: d.nagari_nama,
        sls_kode: d.sls_kode,
        sls_nama: d.sls_nama,
      });
    }
  }
  if (rowsInsert.length > 0) {
    const { error: insErr } = await supabase.from("penyisiran_alokasi_pilihan").insert(rowsInsert);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const labelTier: Record<Tier, string> = {
    1: "Lokasi rumah",
    2: "Titik tengah Nagari",
    3: "Tanpa data lokasi",
  };
  const hasil = proses
    .map((p) => ({
      petugas_id: p.id,
      nama: p.nama,
      tier: p.tier,
      tier_label: labelTier[p.tier],
      jumlah_dialokasikan: p.assigned.length,
      daftar_sls: p.assigned.map((k) => dasarBySlsKey.get(k)?.sls_nama ?? k),
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  return NextResponse.json({
    ok: true,
    jumlah_petugas_diproses: proses.length,
    jumlah_petugas_dilewati: semuaPetugas.length - proses.length,
    jumlah_rebutan_terjadi: jumlahRebutan,
    jumlah_dpt_penuh: hasil.filter((h) => h.jumlah_dialokasikan >= MAKS_PILIHAN).length,
    hasil,
  });
}
