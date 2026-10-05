// app/api/bencana/alokasi/pecah/route.ts
//
// "Pecah Sub SLS": memecah SATU Sub SLS yang skor beban pendatanya sangat
// besar ke BEBERAPA PPL sekaligus, masing-masing memegang sebagian KK
// secara langsung (basis "Jumlah KK langsung" -- bukan persentase/skor
// mentah, sesuai pilihan admin). Skor beban & skor jarak tiap bagian
// diprorata otomatis oleh bencana_kertas_kerja_alokasi() di database
// (lihat migrasi 3 Okt 2026, kolom porsi_kk di bencana_alokasi_subsls).
//
// POST { idsubsls, pembagian: [{ ppl_id, porsi_kk }, ...] }  (min. 2 bagian)
//   -> validasi lalu GANTI SELURUH baris alokasi Sub SLS ini dgn baris2
//      pecahan baru (hapus dulu yg lama, insert yg baru -- jadi ini juga
//      berfungsi utk MENGUBAH pembagian yg sudah ada, bukan cuma bikin baru).
//
// POST { idsubsls, gabung_kembali: true }
//   -> batalkan pecahan, kembali ke 1 Sub SLS = 1 baris blm terplot (sama
//      persis dgn efek "buka_kunci" di /alokasi/reassign, dipakai ulang di
//      sini via import supaya logika lepas-peran konsisten).

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

type Pembagian = { ppl_id: number; porsi_kk: number };

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const idsubsls = typeof body?.idsubsls === "string" ? body.idsubsls.trim() : "";
  if (!idsubsls) {
    return NextResponse.json({ error: "idsubsls wajib diisi." }, { status: 400 });
  }

  try {
    // Baris alokasi LAMA (bisa 0, 1, atau beberapa kalau sebelumnya sudah
    // pernah dipecah) -- dipakai utk tahu petugas mana yg mungkin perlu
    // dilepas perannya kalau tidak lagi dipakai sesudah ganti pembagian.
    const { data: lama, error: errLama } = await supabase
      .from("bencana_alokasi_subsls")
      .select("ppl_id, pml_id")
      .eq("idsubsls", idsubsls);
    if (errLama) return NextResponse.json({ error: errLama.message }, { status: 500 });
    // (5 Okt 2026) ppl_id bisa NULL (baris "belum ada PPL" di plotting dua lapis) -> disaring.
    const ppl_id_lama = (lama ?? []).map((r) => r.ppl_id as number | null).filter((v): v is number => v != null);
    // (5 Okt 2026) Tim (PML) pemilik Sub SLS -- dipertahankan saat dipecah / digabung kembali.
    const pmlLama = ((lama ?? []) as { pml_id: number | null }[]).map((r) => r.pml_id).find((v) => v != null) ?? null;

    if (body?.gabung_kembali === true) {
      const { error: errDel } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
      if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });
      // (5 Okt 2026) Gabung kembali TIDAK melepas Sub SLS dari timnya: tersisa 1 baris milik PML tanpa PPL.
      if (pmlLama) {
        const { error: errTim } = await supabase
          .from("bencana_alokasi_subsls")
          .insert({ idsubsls, pml_id: pmlLama, ppl_id: null, terkunci: true, porsi_kk: null });
        if (errTim) return NextResponse.json({ error: errTim.message }, { status: 500 });
      }
      await lepasPeranJikaTidakDipakaiLagi(supabase, ppl_id_lama);
      return NextResponse.json({ ok: true, digabungkan: true });
    }

    const pembagianRaw: unknown[] = Array.isArray(body?.pembagian) ? body.pembagian : [];
    const pembagian: Pembagian[] = pembagianRaw
      .map((p: unknown): Pembagian => {
        const obj = p as { ppl_id?: unknown; porsi_kk?: unknown };
        return { ppl_id: Number(obj?.ppl_id), porsi_kk: Number(obj?.porsi_kk) };
      })
      .filter((p: Pembagian) => Number.isFinite(p.ppl_id) && Number.isFinite(p.porsi_kk));

    if (pembagian.length < 2) {
      return NextResponse.json({ error: "Pecah Sub SLS butuh minimal 2 PPL." }, { status: 400 });
    }
    if (pembagian.some((p) => p.porsi_kk <= 0)) {
      return NextResponse.json({ error: "Jumlah KK langsung tiap PPL harus lebih dari 0." }, { status: 400 });
    }
    const idSet = new Set(pembagian.map((p) => p.ppl_id));
    if (idSet.size !== pembagian.length) {
      return NextResponse.json({ error: "Tidak boleh ada PPL yang sama dipilih dua kali." }, { status: 400 });
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

    // kk_total Sub SLS ini -- basis validasi porsi_kk (jumlah KK langsung
    // tiap PPL tidak boleh melebihi total KK Sub SLS tsb). bencana_skor_
    // beban_subsls() > 1000 baris total -> WAJIB rpcSemua, bukan .rpc()
    // langsung (lihat lib/supabaseRpc.ts).
    const { data: skorRows, error: errSkor } = await rpcSemua<{ idsubsls: string; kk_total: number }>(
      supabase,
      "bencana_skor_beban_subsls"
    );
    if (errSkor) return NextResponse.json({ error: errSkor.message }, { status: 500 });
    const baris = (skorRows ?? []).find((r) => r.idsubsls === idsubsls);
    if (!baris) return NextResponse.json({ error: "Sub SLS tidak ditemukan." }, { status: 404 });
    const kkTotal = Number(baris.kk_total) || 0;

    const totalPorsi = pembagian.reduce((s, p) => s + p.porsi_kk, 0);
    if (kkTotal > 0 && totalPorsi > kkTotal) {
      return NextResponse.json(
        {
          error: `Total KK yang dibagi (${totalPorsi.toLocaleString(
            "id-ID"
          )}) melebihi KK Total Sub SLS ini (${kkTotal.toLocaleString("id-ID")}).`,
        },
        { status: 400 }
      );
    }

    const pplIds = pembagian.map((p) => p.ppl_id);
    const { data: daftarPpl, error: errPpl } = await supabase
      .from("bencana_petugas")
      .select("id, nama, peran, status_kepegawaian, aktif, lat, lng, lokasi_status, atasan_id")
      .in("id", pplIds);
    if (errPpl) return NextResponse.json({ error: errPpl.message }, { status: 500 });
    const pplMap = new Map((daftarPpl ?? []).map((p) => [p.id, p]));

    for (const p of pembagian) {
      const ppl = pplMap.get(p.ppl_id);
      if (!ppl) return NextResponse.json({ error: `Petugas id ${p.ppl_id} tidak ditemukan.` }, { status: 404 });
      if (!ppl.aktif) return NextResponse.json({ error: `${ppl.nama} berstatus tidak aktif.` }, { status: 400 });
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
    }

    // Titik Sub SLS (utk hitung jarak tiap PPL) -- RPC ini jg > 1000 baris.
    const { data: titikRows, error: errTitik } = await rpcSemua<{
      idsubsls: string;
      lat: number | null;
      lng: number | null;
    }>(supabase, "bencana_subsls_titik_jarak");
    if (errTitik) return NextResponse.json({ error: errTitik.message }, { status: 500 });
    const titik = (titikRows ?? []).find((t) => t.idsubsls === idsubsls);

    // Hapus dulu seluruh baris lama Sub SLS ini (baik yg belum pernah
    // dipecah / 1 baris, maupun pecahan sebelumnya) -- lalu insert ulang
    // bersih sesuai pembagian baru.
    const { error: errDel } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
    if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });

    const barisBaru = [];
    for (const p of pembagian) {
      const ppl = pplMap.get(p.ppl_id)!;
      let jarak_km: number | null = null;
      let jarak_metode: string | null = null;
      let jarak_status = "tanpa_data";

      if (
        ppl.lokasi_status === "riil" &&
        typeof ppl.lat === "number" &&
        typeof ppl.lng === "number" &&
        titik &&
        typeof titik.lat === "number" &&
        typeof titik.lng === "number"
      ) {
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

      barisBaru.push({
        idsubsls,
        ppl_id: p.ppl_id,
        // (5 Okt 2026) tim tetap tim lama; kalau Sub SLS belum punya tim, ikut tim PPL.
        pml_id: pmlLama ?? ((ppl.atasan_id as number | null) ?? null),
        porsi_kk: p.porsi_kk,
        jarak_km,
        jarak_metode,
        jarak_status,
        terkunci: true,
      });

      if (ppl.peran !== "ppl") {
        await supabase.from("bencana_petugas").update({ peran: "ppl" }).eq("id", p.ppl_id);
      }
    }

    const { error: errInsert } = await supabase.from("bencana_alokasi_subsls").insert(barisBaru);
    if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 });

    // Petugas lama yg TIDAK lagi termasuk di pembagian baru -> lepas peran
    // kalau dia tidak lagi punya alokasi di Sub SLS lain.
    const ppl_id_dilepas = ppl_id_lama.filter((id) => !idSet.has(id));
    await lepasPeranJikaTidakDipakaiLagi(supabase, ppl_id_dilepas);

    return NextResponse.json({ ok: true, jumlah_bagian: pembagian.length, sisa_kk: Math.max(kkTotal - totalPorsi, 0) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lepasPeranJikaTidakDipakaiLagi(supabase: any, pplIds: number[]) {
  for (const id of Array.from(new Set(pplIds))) {
    const { count } = await supabase
      .from("bencana_alokasi_subsls")
      .select("id", { count: "exact", head: true })
      .eq("ppl_id", id);
    if (!count) {
      // (5 Okt 2026) anggota tim (atasan_id terisi) tetap PPL non-plot.
      await supabase.from("bencana_petugas").update({ peran: null }).eq("id", id).is("atasan_id", null);
    }
  }
}
