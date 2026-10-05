// app/api/bencana/alokasi/reassign/route.ts
//
// Plotting PPL manual per Sub SLS (bagian dari kertas kerja "Alokasi
// Petugas"). TIDAK ADA algoritma otomatis lagi -- setiap baris Sub SLS
// diplot satu per satu oleh admin lewat dropdown nama petugas, sesudah
// melihat skor beban awal & kedekatan wilayah di kertas kerja.
//
// POST { idsubsls, ppl_id }
//   -> tugaskan SATU Sub SLS (yg sudah termasuk wilayah sampel) ke petugas
//      pilihan admin. Petugas WAJIB berstatus mitra (aturan: "PPL wajib
//      mitra") dan belum berperan lain (PML/Korwil). Peran petugas itu
//      otomatis diset 'ppl' sesaat sebelum baris ditugaskan -- tidak lagi
//      mensyaratkan peran sudah 'ppl' sebelumnya (dulu itu hanya bisa
//      terjadi lewat auto-plotting, yg sekarang dihapus).
//
// POST { idsubsls, buka_kunci: true }
//   -> batalkan plotting Sub SLS ini (baris dihapus dari
//      bencana_alokasi_subsls). Kalau ini adalah plot TERAKHIR utk petugas
//      tsb, perannya dilepas lagi (peran=null) supaya nama itu bisa dipilih
//      ulang utk peran lain (PPL/PML/Korwil) di panel "Susunan Tim".

// (5 Okt 2026) PLOTTING DUA LAPIS -- permintaan user: Sub SLS diplot ke PML
// (tim) dulu, PPL opsional. Kolom bencana_alokasi_subsls.pml_id = tim pemilik.
// Bentuk body yg didukung sekarang:
//   { idsubsls, pml_id, ppl_id? }        -> plot ke tim PML (+ PPL penanggung
//                                           jawab kalau ada; PPL wajib anggota
//                                           tim itu, PPL tanpa tim otomatis
//                                           dimasukkan ke tim tsb).
//   { idsubsls, ppl_id }                 -> (kompatibel lama) PML ikut tim PPL.
//   { idsubsls, aksi: "lepas_ppl" }      -> copot PPL saja, Sub SLS TETAP di tim.
//   { idsubsls, aksi: "lepas_tim" }      -> Sub SLS kembali "belum diplot"
//                                           (sama dgn buka_kunci lama).
//   { idsubsls, pml_id, hanya_pml:true } -> ganti tim utk Sub SLS yg dipecah.
//   { aksi: "lepas_semua_tim", pml_id }  -> SELURUH Sub SLS tim kembali belum diplot.
//   { aksi: "ganti_pml", pml_lama, pml_baru } -> PML pengganti mewarisi
//                                           seluruh wilayah & PPL tim lama.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hitungJarakJalanMassal, haversineKm } from "@/lib/jarakJalan";
import { rpcSemua } from "@/lib/supabaseRpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);

  // (5 Okt 2026) Aksi tingkat TIM (tanpa idsubsls).
  if (body?.aksi === "lepas_semua_tim" || body?.aksi === "ganti_pml") {
    return aksiTim(supabase, body);
  }

  const idsubsls = typeof body?.idsubsls === "string" ? body.idsubsls.trim() : "";
  if (!idsubsls) {
    return NextResponse.json({ error: "idsubsls wajib diisi." }, { status: 400 });
  }

  try {
    // (5 Okt 2026) Lepas PPL saja: Sub SLS tetap milik tim (pml_id), baris pecahan digabung jadi 1 baris tanpa PPL.
    if (body?.aksi === "lepas_ppl") {
      const { data: ada } = await supabase.from("bencana_alokasi_subsls").select("ppl_id, pml_id").eq("idsubsls", idsubsls);
      const pmlAda = ((ada ?? []) as { pml_id: number | null }[]).map((r) => r.pml_id).find((v) => v != null) ?? null;
      if (!pmlAda) return NextResponse.json({ error: "Sub SLS ini belum diplot ke PML (tim), tidak ada yg bisa dipertahankan." }, { status: 400 });
      const { error: eDel } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });
      const { error: eIns } = await supabase
        .from("bencana_alokasi_subsls")
        .insert({ idsubsls, pml_id: pmlAda, ppl_id: null, terkunci: true, porsi_kk: null });
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 });
      return NextResponse.json({ ok: true, lepas_ppl: true });
    }

    // (5 Okt 2026) Ganti tim utk Sub SLS yg dipecah: hanya pml_id, pembagian PPL tidak disentuh.
    if (body?.hanya_pml === true) {
      const pmlBaru = typeof body?.pml_id === "number" ? body.pml_id : null;
      if (pmlBaru) {
        const cek = await cekPml(supabase, pmlBaru);
        if (cek) return NextResponse.json({ error: cek }, { status: 400 });
      }
      const { error } = await supabase.from("bencana_alokasi_subsls").update({ pml_id: pmlBaru }).eq("idsubsls", idsubsls);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body?.buka_kunci === true || body?.aksi === "lepas_tim") {
      // (3 Okt 2026) .select() biasa (BUKAN .maybeSingle()) -- kalau Sub SLS
      // ini sudah dipecah (Pecah Sub SLS) bisa ada LEBIH DARI SATU baris
      // (satu per PPL); .maybeSingle() akan error kalau >1 baris cocok.
      const { data: existing } = await supabase
        .from("bencana_alokasi_subsls")
        .select("ppl_id")
        .eq("idsubsls", idsubsls);

      const { error } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      for (const id of Array.from(new Set((existing ?? []).map((r) => r.ppl_id).filter((v): v is number => v != null)))) {
        const { count } = await supabase
          .from("bencana_alokasi_subsls")
          .select("id", { count: "exact", head: true })
          .eq("ppl_id", id);
        if (!count) {
          // (5 Okt 2026) PPL yg masih anggota tim (atasan_id terisi) tetap berperan PPL (non-plot).
          await supabase.from("bencana_petugas").update({ peran: null }).eq("id", id).is("atasan_id", null);
        }
      }

      return NextResponse.json({ ok: true, dibuka: true });
    }

    const pplId = typeof body?.ppl_id === "number" ? body.ppl_id : null;
    // (5 Okt 2026) pml_id: number = tim tujuan; tidak dikirim = (kompatibel lama) ikut tim PPL.
    const pmlDiminta: number | null | undefined =
      typeof body?.pml_id === "number" ? body.pml_id : body?.pml_id === null ? null : undefined;
    if (!pplId && !pmlDiminta) {
      return NextResponse.json({ error: "Pilih PML (tim) dan/atau PPL." }, { status: 400 });
    }
    if (pmlDiminta) {
      const cek = await cekPml(supabase, pmlDiminta);
      if (cek) return NextResponse.json({ error: cek }, { status: 400 });
    }

    const { data: sampel, error: errSampel } = await supabase
      .from("bencana_sampel_subsls")
      .select("termasuk_sampel")
      .eq("idsubsls", idsubsls)
      .maybeSingle();
    if (errSampel) return NextResponse.json({ error: errSampel.message }, { status: 500 });
    if (!sampel?.termasuk_sampel) {
      return NextResponse.json(
        { error: "Sub SLS ini belum dicentang sebagai wilayah sampel. Centang dulu di langkah 1." },
        { status: 400 }
      );
    }

    // (5 Okt 2026) Plot ke tim saja (belum ada PPL).
    if (!pplId) {
      const { error: eDel } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });
      const { error: eIns } = await supabase
        .from("bencana_alokasi_subsls")
        .insert({ idsubsls, pml_id: pmlDiminta, ppl_id: null, terkunci: true, porsi_kk: null });
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { data: ppl, error: errPpl } = await supabase
      .from("bencana_petugas")
      .select("id, nama, peran, status_kepegawaian, aktif, lat, lng, lokasi_status, atasan_id")
      .eq("id", pplId)
      .maybeSingle();
    if (errPpl) return NextResponse.json({ error: errPpl.message }, { status: 500 });
    if (!ppl) return NextResponse.json({ error: "Petugas tidak ditemukan." }, { status: 404 });
    if (!ppl.aktif) {
      return NextResponse.json({ error: `${ppl.nama} berstatus tidak aktif.` }, { status: 400 });
    }
    if (ppl.status_kepegawaian !== "mitra") {
      return NextResponse.json(
        { error: `${ppl.nama} berstatus ${ppl.status_kepegawaian}. Aturan: PPL wajib mitra.` },
        { status: 400 }
      );
    }
    if (ppl.peran && ppl.peran !== "ppl") {
      return NextResponse.json(
        { error: `${ppl.nama} sudah berperan sebagai ${ppl.peran}. Tidak bisa merangkap sebagai PPL.` },
        { status: 400 }
      );
    }

    // (5 Okt 2026) Tim tujuan: PML yg diminta; kalau tidak disebut, ikut tim PPL.
    // PPL anggota tim LAIN tidak boleh dipasang (pindahkan dulu di Langkah 3 Susunan Tim);
    // PPL yg belum punya tim otomatis dimasukkan ke tim tujuan.
    const pmlTujuan: number | null = pmlDiminta !== undefined ? pmlDiminta : ((ppl.atasan_id as number | null) ?? null);
    if (pmlTujuan && ppl.atasan_id && ppl.atasan_id !== pmlTujuan) {
      const { data: pmlLain } = await supabase.from("bencana_petugas").select("nama").eq("id", ppl.atasan_id).maybeSingle();
      return NextResponse.json(
        { error: `${ppl.nama} anggota tim ${pmlLain?.nama ?? "PML lain"}. Pindahkan dulu di Langkah 3 (Susunan Tim) atau pilih PPL dari tim ini.` },
        { status: 400 }
      );
    }
    const updPetugas: Record<string, unknown> = {};
    if (ppl.peran !== "ppl") updPetugas.peran = "ppl";
    if (pmlTujuan && !ppl.atasan_id) updPetugas.atasan_id = pmlTujuan;
    if (Object.keys(updPetugas).length > 0) {
      const { error: errPeran } = await supabase.from("bencana_petugas").update(updPetugas).eq("id", pplId);
      if (errPeran) return NextResponse.json({ error: errPeran.message }, { status: 500 });
    }

    let jarak_km: number | null = null;
    let jarak_metode: string | null = null;
    let jarak_status = "tanpa_data";

    if (ppl.lokasi_status === "riil" && typeof ppl.lat === "number" && typeof ppl.lng === "number") {
      // (3 Okt 2026) rpcSemua, BUKAN supabase.rpc() langsung -- AKAR
      // PENYEBAB bug "Skor Jarak" yg tetap "belum tersedia" walau PPL yg
      // diplot sudah lokasi riil (mis. laporan MINDA SUSANTI): RPC ini 1084
      // baris, melewati batas 1000 baris/request PostgREST, jadi .find() di
      // bawah ini bisa gagal menemukan idsubsls ybs kalau dia kebetulan ada
      // di 84 baris terakhir yg terpotong. Lihat lib/supabaseRpc.ts.
      const { data: centroidRows } = await rpcSemua<{ idsubsls: string; lat: number | null; lng: number | null }>(
        supabase,
        "bencana_subsls_titik_jarak"
      );
      const titik = (centroidRows ?? []).find((c) => c.idsubsls === idsubsls);
      if (titik && typeof titik.lat === "number" && typeof titik.lng === "number") {
        const asal = { lat: ppl.lat, lng: ppl.lng };
        const tujuan = { lat: titik.lat, lng: titik.lng };
        const hasilOsrm = await hitungJarakJalanMassal(asal, [tujuan]);
        if (hasilOsrm) {
          jarak_km = Math.round(hasilOsrm[0] * 100) / 100;
          jarak_metode = "osrm";
        } else {
          jarak_km = Math.round(haversineKm(asal.lat, asal.lng, tujuan.lat, tujuan.lng) * 100) / 100;
          jarak_metode = "haversine_fallback";
        }
        jarak_status = "riil";
      }
    }

    // (3 Okt 2026) Constraint unik sekarang (idsubsls, ppl_id) -- BUKAN lagi
    // idsubsls saja (lihat migrasi Pecah Sub SLS, porsi_kk). Kalau PPL diganti
    // (idsubsls sama, ppl_id beda dari sebelumnya), onConflict "idsubsls" tidak
    // match apa pun -> perlu hapus dulu baris lama Sub SLS ini yg ppl_id-nya
    // BEDA, baru upsert dgn conflict target (idsubsls, ppl_id). Ini jg otomatis
    // membersihkan Sub SLS yg sebelumnya dipecah (>1 baris) kalau plot ulang
    // manual lewat dropdown biasa -- jadi tidak akan nyisa baris pecahan lama.
    // (5 Okt 2026) .neq() TIDAK menangkap baris ppl_id NULL (baris "belum ada PPL"), jadi dihapus terpisah.
    const { error: errBersih } = await supabase
      .from("bencana_alokasi_subsls")
      .delete()
      .eq("idsubsls", idsubsls)
      .neq("ppl_id", pplId);
    if (errBersih) return NextResponse.json({ error: errBersih.message }, { status: 500 });
    const { error: errBersihNull } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls).is("ppl_id", null);
    if (errBersihNull) return NextResponse.json({ error: errBersihNull.message }, { status: 500 });

    const { error: errUpsert } = await supabase
      .from("bencana_alokasi_subsls")
      .upsert(
        { idsubsls, ppl_id: pplId, pml_id: pmlTujuan, jarak_km, jarak_metode, jarak_status, terkunci: true, porsi_kk: null },
        { onConflict: "idsubsls,ppl_id" }
      );
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });

    return NextResponse.json({ ok: true, ppl_nama: ppl.nama });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

// (5 Okt 2026) Validasi PML tujuan: harus berperan PML & aktif.
async function cekPml(db: Db, pmlId: number): Promise<string | null> {
  const { data } = await db.from("bencana_petugas").select("nama, peran, aktif").eq("id", pmlId).maybeSingle();
  if (!data) return "PML tidak ditemukan.";
  if (data.peran !== "pml") return `${data.nama} belum berperan PML. Tetapkan dulu di Langkah 3 (Susunan Tim).`;
  if (!data.aktif) return `${data.nama} berstatus tidak aktif.`;
  return null;
}

// (5 Okt 2026) Aksi tingkat tim: "Lepas semua wilayah tim" & "Tunjuk PML pengganti".
async function aksiTim(db: Db, body: Record<string, unknown>) {
  try {
    if (body.aksi === "lepas_semua_tim") {
      const pmlId = typeof body.pml_id === "number" ? body.pml_id : null;
      if (!pmlId) return NextResponse.json({ error: "pml_id wajib diisi." }, { status: 400 });
      const { data, error } = await db.from("bencana_alokasi_subsls").delete().eq("pml_id", pmlId).select("idsubsls");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, dilepas: new Set((data ?? []).map((r) => r.idsubsls as string)).size });
    }
    // ganti_pml
    const lama = typeof body.pml_lama === "number" ? body.pml_lama : null;
    const baru = typeof body.pml_baru === "number" ? body.pml_baru : null;
    if (!lama || !baru || lama === baru) return NextResponse.json({ error: "Pilih PML lama & PML pengganti yang berbeda." }, { status: 400 });
    const cek = await cekPml(db, baru);
    if (cek) return NextResponse.json({ error: cek }, { status: 400 });
    // Urutan penting: alokasi dulu, baru atasan PPL -- supaya trigger "PPL ganti tim" melihat Sub SLS
    // sudah milik PML baru & TIDAK melepas PPL dari Sub SLS-nya.
    const { error: e1 } = await db.from("bencana_alokasi_subsls").update({ pml_id: baru }).eq("pml_id", lama);
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
    const { error: e2 } = await db.from("bencana_petugas").update({ atasan_id: baru }).eq("atasan_id", lama).eq("peran", "ppl");
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
