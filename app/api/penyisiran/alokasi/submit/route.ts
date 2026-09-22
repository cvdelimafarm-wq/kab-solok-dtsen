// app/api/penyisiran/alokasi/submit/route.ts
//
// Menyimpan checklist SLS/Jorong yang dipilih PPL penyisiran (tab
// "Perencanaan Lapangan") -- REPLACE penuh (hapus pilihan lama punya
// petugas ybs, lalu insert yang baru) krn cuma ada SATU set pilihan aktif
// per petugas, bukan riwayat berlapis.
//
// KHUSUS akun PML (dikonfirmasi user, lihat lib/wilayahAlokasiPetugas.ts):
// DITOLAK (403) sama sekali -- PML tidak pernah memilih wilayah sendiri,
// wilayah kerjanya otomatis = gabungan seluruh PPL yang diawasi lewat
// pengawas_id. Dicek dari SESI yang login (daftarIdUntukSesi), sama pola
// dgn pembatasan PML di /api/penyisiran/update/route.ts.
//
// TIDAK ADA BATAS JUMLAH (dulu maks 5, DIHAPUS atas permintaan user) --
// petugas boleh memilih SEBANYAK yang dia mau. SEBAGAI GANTINYA, checklist
// sekarang EKSKLUSIF: 1 Sub SLS (atau 1 SLS utuh kalau SLS itu tidak py
// breakdown Sub SLS sama sekali) HANYA BOLEH dipegang SATU petugas --
// BEDA dari perilaku lama yang mengizinkan SLS yang sama dipilih >1
// petugas tanpa saling menghalangi. Makanya unique constraint di tabel
// (petugas_id, sls_key) TETAP ada (1 petugas cuma py 1 baris per SLS),
// TAPI eksklusivitas ANTAR petugas (baris ini) yang jadi penjaga utama:
// SEBELUM insert, dicek dulu apakah ada petugas LAIN yang sudah pegang
// SLS/Sub SLS yang sama -- kalau ada, request ini DITOLAK (bukan
// menimpa/berbagi diam2).
//
// Body: { pilihan: [{ sls_key: string, subsls_kode?: string[] }] } --
// subsls_kode kosong/tidak dikirim = pilih SELURUH SLS/Jorong. Kalau
// subsls_kode dikirim, tiap kodenya divalidasi ulang di server lewat RPC
// penyisiran_alokasi_dasar_subsls (memastikan kode itu benar milik SLS
// tsb) -- BUKAN percaya begitu saja dari client.
//
// sls_key sendiri jg di-RESOLVE ulang lewat RPC penyisiran_alokasi_resolve_sls
// (bukan percaya nama kec/nagari/sls dari body request) -- mencegah data
// sampah/palsu kalau ada yang iseng panggil endpoint ini langsung.
//
// CATATAN: pengecekan konflik di sini murni di level APLIKASI (baca-lalu-
// tulis, bukan constraint database atomik) -- utk skala pemakaian ini
// (puluhan petugas, submit manual tidak bersamaan detik yang sama persis)
// risiko race condition (2 orang submit SLS yang sama di detik yang
// SANGAT berdekatan) dianggap dapat diterima, konsisten dgn pola validasi
// lain di aplikasi ini yang jg di level JS (mis. cek MAKS_PILIHAN yang
// dulu dipakai di sini).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { daftarIdUntukSesi } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PilihanBodyEntry {
  sls_key: string;
  subsls_kode?: string[];
}

interface KlaimOrangLain {
  sls_key: string;
  subsls_kode_list: string[] | null;
  petugas_id: number;
}

// Cek apakah entri yg DIMINTA (kodeDiminta undefined = minta SELURUH SLS)
// bentrok dgn klaim petugas LAIN yg SUDAH ada di sls_key yang sama.
// Return: null kalau tidak ada konflik sama sekali, atau array kode yang
// bentrok (["*"] = konflik krn minta SELURUH SLS tapi org lain sudah py
// klaim apa pun di situ, entah utuh atau sebagian) kalau ada.
function cariKonflik(
  slsKey: string,
  kodeDiminta: string[] | undefined,
  semuaKlaimOrangLain: KlaimOrangLain[]
): string[] | null {
  const relevan = semuaKlaimOrangLain.filter((k) => k.sls_key === slsKey);
  if (relevan.length === 0) return null;
  if (!kodeDiminta) {
    return ["*"];
  }
  const bentrok = new Set<string>();
  for (const k of relevan) {
    if (k.subsls_kode_list === null) {
      kodeDiminta.forEach((kd) => bentrok.add(kd));
    } else {
      kodeDiminta.forEach((kd) => {
        if (k.subsls_kode_list!.includes(kd)) bentrok.add(kd);
      });
    }
  }
  return bentrok.size > 0 ? Array.from(bentrok) : null;
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Terima bentuk baru { pilihan: [...] } -- fallback ke bentuk lama
  // { sls_keys: string[] } (kalau ada pemanggil lama yg belum diperbarui)
  // supaya tetap kompatibel, diperlakukan sbg pilih SELURUH SLS semua.
  let pilihanRaw: PilihanBodyEntry[] | null = null;
  if (Array.isArray(body?.pilihan)) {
    pilihanRaw = body.pilihan;
  } else if (Array.isArray(body?.sls_keys)) {
    pilihanRaw = body.sls_keys
      .filter((s: unknown): s is string => typeof s === "string")
      .map((sls_key: string) => ({ sls_key }));
  }
  if (!pilihanRaw) {
    return NextResponse.json({ error: "Data pilihan tidak valid." }, { status: 400 });
  }

  // Dedup by sls_key (entri terakhir menang kalau ada duplikat).
  const bySlsKey = new Map<string, string[] | undefined>();
  for (const p of pilihanRaw) {
    if (typeof p?.sls_key !== "string" || !p.sls_key.trim()) continue;
    const subsls = Array.isArray(p.subsls_kode)
      ? Array.from(
          new Set(p.subsls_kode.filter((s): s is string => typeof s === "string" && s.trim().length > 0))
        )
      : undefined;
    bySlsKey.set(p.sls_key, subsls && subsls.length > 0 ? subsls : undefined);
  }
  if (bySlsKey.size === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 SLS/Jorong." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // PML TIDAK BOLEH memilih/tag wilayah sendiri (dikonfirmasi user) --
  // wilayah kerja PML SUDAH otomatis = gabungan seluruh PPL yang
  // diawasinya lewat pengawas_id (lihat daftarIdUntukSesi() &
  // penjelasan panjang di lib/wilayahAlokasiPetugas.ts). Pembatasan
  // SEBENARNYA ada di sini (bukan cuma checkbox/tombol dikunci di FE,
  // lihat WilayahSampelPanel di app/penyisiran/perencanaan-lapangan.tsx).
  let isPml = false;
  try {
    ({ isPml } = await daftarIdUntukSesi(supabase, petugasId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memeriksa peran." }, { status: 500 });
  }
  if (isPml) {
    return NextResponse.json(
      {
        error:
          "PML tidak bisa memilih wilayah sendiri -- wilayah kerja otomatis mengikuti gabungan wilayah seluruh PPL yang diawasi.",
      },
      { status: 403 }
    );
  }

  const slsKeys = Array.from(bySlsKey.keys());
  const { data: resolved, error: resolveErr } = await supabase.rpc("penyisiran_alokasi_resolve_sls", {
    p_sls_keys: slsKeys,
  });
  if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 });
  if (!resolved || resolved.length === 0) {
    return NextResponse.json({ error: "SLS/Jorong yang dipilih tidak ditemukan/tidak valid." }, { status: 400 });
  }
  const resolvedBySlsKey = new Map((resolved as { sls_key: string }[]).map((r) => [r.sls_key, r]));

  // Ambil SEMUA klaim petugas LAIN (bukan diri sendiri) atas sls_key yang
  // sedang diminta -- dasar pengecekan eksklusivitas di bawah. Punya
  // sendiri (kalau sebelumnya sudah pernah submit) sengaja DIKECUALIKAN
  // krn baris lama itu toh akan di-REPLACE (dihapus+diganti) di akhir,
  // jadi tidak boleh dianggap "konflik dgn diri sendiri".
  const { data: klaimOrangLainRaw, error: klaimErr } = await supabase
    .from("penyisiran_alokasi_pilihan")
    .select("sls_key, subsls_kode_list, petugas_id")
    .in("sls_key", slsKeys)
    .neq("petugas_id", petugasId);
  if (klaimErr) return NextResponse.json({ error: klaimErr.message }, { status: 500 });
  const klaimOrangLain = (klaimOrangLainRaw ?? []) as KlaimOrangLain[];

  // Validasi subsls_kode (kalau ada) lewat RPC dasar_subsls -- pastikan
  // tiap kode BENAR milik sls_key tsb, jangan percaya array dari client --
  // SEKALIGUS cek eksklusivitas: tolak SELURUH request (bukan cuma
  // melewati diam2) kalau ADA SATU SAJA entri yang bentrok, supaya
  // petugas tahu persis SLS/Sub SLS mana yang perlu diganti sebelum
  // pilihan lainnya ikut tersimpan.
  const rows: Record<string, unknown>[] = [];
  for (const [slsKey, subslsDiminta] of bySlsKey) {
    const r = resolvedBySlsKey.get(slsKey) as Record<string, string> | undefined;
    if (!r) continue; // sls_key tidak valid/tidak ditemukan -- lewati diam2 (spt versi lama)

    const konflik = cariKonflik(slsKey, subslsDiminta, klaimOrangLain);
    if (konflik) {
      const pesan =
        konflik[0] === "*"
          ? `${r.sls_nama} sudah (sebagian atau seluruhnya) dipilih petugas lain -- gunakan "unhide" utk memilih Sub SLS yang masih tersedia saja.`
          : `Sub SLS ${konflik.join(", ")} di ${r.sls_nama} sudah dipilih petugas lain.`;
      return NextResponse.json({ error: pesan }, { status: 409 });
    }

    let subslsKodeList: string[] | null = null;
    if (subslsDiminta && subslsDiminta.length > 0) {
      const { data: subslsValid, error: subslsErr } = await supabase.rpc("penyisiran_alokasi_dasar_subsls", {
        p_sls_key: slsKey,
      });
      if (subslsErr) return NextResponse.json({ error: subslsErr.message }, { status: 500 });
      const kodeValid = new Set((subslsValid ?? []).map((s: { subsls_kode: string }) => s.subsls_kode));
      const cocok = subslsDiminta.filter((k) => kodeValid.has(k));
      if (cocok.length === 0) {
        return NextResponse.json(
          { error: `Sub SLS yang dipilih tidak valid untuk ${r.sls_nama}.` },
          { status: 400 }
        );
      }
      // Kalau semua SUBSLS di SLS ini kebetulan tercentang semua, simpan
      // sbg NULL (pilih seluruh SLS) -- setara secara data, lebih rapi &
      // konsisten dgn baris hasil Alokasi Otomatis/pilihan lama.
      subslsKodeList = cocok.length >= kodeValid.size ? null : cocok;
    }

    rows.push({
      petugas_id: petugasId,
      sls_key: r.sls_key,
      kec_kode: r.kec_kode,
      kec_nama: r.kec_nama,
      nagari_kode: r.nagari_kode,
      nagari_nama: r.nagari_nama,
      sls_kode: r.sls_kode,
      sls_nama: r.sls_nama,
      subsls_kode_list: subslsKodeList,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "SLS/Jorong yang dipilih tidak ditemukan/tidak valid." }, { status: 400 });
  }

  const { error: delErr } = await supabase.from("penyisiran_alokasi_pilihan").delete().eq("petugas_id", petugasId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("penyisiran_alokasi_pilihan").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, jumlah_tersimpan: rows.length });
}
