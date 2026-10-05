// app/api/bencana/alokasi/papan-tim/route.ts
//
// (5 Okt 2026) Langkah 5 "Papan Tim" (keroyokan) -- permintaan user: kartu per PML berisi
// PPL (+ alamat), daftar Sub SLS tim, skor total & rata-rata per PPL, penanda Sub SLS
// PRIVATE (1 PPL) vs KEROYOK (seluruh PPL tim), drag Sub SLS / PPL antar tim, pilih PPL
// utk Sub SLS private. Perubahan dikirim SEKALIGUS lewat tombol "Simpan Perubahan" (draft).
//
// GET  -> { tim:[...], belum_diplot:[...], ppl_tanpa_tim:[...] }
// POST { ppl: [{ petugas_id, atasan_id|null }],
//        subsls: [{ idsubsls, pml_id|null, ppl_id|null, mode_kerja }] }
//   Urutan proses: (1) perpindahan PPL antar tim, (2) perubahan Sub SLS.
//   Skor yg dipakai = skor_beban_akhir (RPC bencana_kertas_kerja_alokasi) -- keputusan user.
//   Kolom bencana_alokasi_subsls.mode_kerja: 'private' (wajib ada ppl_id, PPL anggota tim)
//   atau 'keroyok' (ppl_id opsional = "PPL awal"). Data lama seluruhnya 'keroyok'.

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
type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

type BarisKertas = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk_total: number | string;
  skor_beban_akhir: number | string;
  porsi_kk: number | string | null;
  ppl_id: number | null;
  ppl_nama: string | null;
  pml_id: number | null;
};
type Petugas = {
  id: number;
  nama: string;
  peran: string | null;
  atasan_id: number | null;
  alamat_nagari: string | null;
  alamat_kecamatan: string | null;
  status_kontak_pendaftaran_bencana: string | null;
  aktif: boolean;
  status_kepegawaian: string | null;
  lat: number | null;
  lng: number | null;
  lokasi_status: string | null;
};

export async function GET() {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const [kertasRes, alokRes, petugasRes] = await Promise.all([
      db.rpc("bencana_kertas_kerja_alokasi"),
      db.from("bencana_alokasi_subsls").select("idsubsls, ppl_id, pml_id, mode_kerja, porsi_kk"),
      db
        .from("bencana_petugas")
        .select("id, nama, peran, atasan_id, alamat_nagari, alamat_kecamatan, status_kontak_pendaftaran_bencana, aktif, status_kepegawaian, lat, lng, lokasi_status")
        .in("peran", ["ppl", "pml"]),
    ]);
    if (kertasRes.error) return NextResponse.json({ error: kertasRes.error.message }, { status: 500 });
    if (alokRes.error) return NextResponse.json({ error: alokRes.error.message }, { status: 500 });
    if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });

    const petugas = (petugasRes.data ?? []) as Petugas[];
    const namaPetugas = new Map(petugas.map((p) => [p.id, p.nama]));
    const modeBy = new Map<string, string>();
    for (const a of (alokRes.data ?? []) as { idsubsls: string; mode_kerja: string | null }[]) {
      if (!modeBy.has(a.idsubsls)) modeBy.set(a.idsubsls, a.mode_kerja ?? "keroyok");
    }

    // Satu entri per Sub SLS (baris pecahan digabung: skor dijumlah, PPL didaftar).
    type Sub = {
      idsubsls: string;
      kecamatan: string;
      nagari: string;
      sls: string;
      sub_sls: string;
      kk_total: number;
      skor: number;
      pml_id: number | null;
      ppl_id: number | null;
      ppl_nama: string | null;
      dipecah: boolean;
      pecahan: string[];
      mode_kerja: "private" | "keroyok";
    };
    const subMap = new Map<string, Sub>();
    for (const r of (kertasRes.data ?? []) as BarisKertas[]) {
      const ada = subMap.get(r.idsubsls);
      if (ada) {
        ada.skor += Number(r.skor_beban_akhir) || 0;
        ada.dipecah = true;
        if (r.ppl_nama) ada.pecahan.push(r.ppl_nama);
        continue;
      }
      subMap.set(r.idsubsls, {
        idsubsls: r.idsubsls,
        kecamatan: r.kecamatan,
        nagari: r.nagari,
        sls: r.sls,
        sub_sls: r.sub_sls,
        kk_total: Number(r.kk_total) || 0,
        skor: Number(r.skor_beban_akhir) || 0,
        pml_id: r.pml_id,
        ppl_id: r.ppl_id,
        ppl_nama: r.ppl_nama,
        dipecah: r.porsi_kk != null,
        pecahan: r.porsi_kk != null && r.ppl_nama ? [r.ppl_nama] : [],
        mode_kerja: modeBy.get(r.idsubsls) === "private" ? "private" : "keroyok",
      });
    }
    const subs = Array.from(subMap.values()).map((s) => ({ ...s, skor: Math.round(s.skor * 100) / 100 }));

    const pmlIdsWilayah = new Set(subs.map((s) => s.pml_id).filter((v): v is number => v != null));
    const pmlList = petugas.filter(
      (p) => p.peran === "pml" && (pmlIdsWilayah.has(p.id) || petugas.some((x) => x.atasan_id === p.id && x.peran === "ppl"))
    );
    const urut = (a: { nagari: string; sls: string; sub_sls: string }, b: { nagari: string; sls: string; sub_sls: string }) =>
      a.nagari.localeCompare(b.nagari, "id") || a.sls.localeCompare(b.sls, "id") || a.sub_sls.localeCompare(b.sub_sls);

    const tim = pmlList
      .map((pml) => ({
        pml_id: pml.id,
        pml_nama: pml.nama,
        pml_menolak: pml.status_kontak_pendaftaran_bencana === "menolak",
        ppl: petugas
          .filter((p) => p.peran === "ppl" && p.atasan_id === pml.id)
          .map((p) => ({ id: p.id, nama: p.nama, nagari: p.alamat_nagari, kecamatan: p.alamat_kecamatan }))
          .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
        subsls: subs.filter((s) => s.pml_id === pml.id).sort(urut),
      }))
      .sort((a, b) => a.pml_nama.localeCompare(b.pml_nama, "id"));

    return NextResponse.json({
      tim,
      // Sub SLS sampel tanpa tim (termasuk data lama: dipegang PPL tapi belum ada PML).
      belum_diplot: subs.filter((s) => s.pml_id == null || !pmlList.some((p) => p.id === s.pml_id)).sort(urut),
      ppl_tanpa_tim: petugas
        .filter((p) => p.peran === "ppl" && p.atasan_id == null && p.aktif && p.status_kontak_pendaftaran_bencana !== "menolak")
        .map((p) => ({ id: p.id, nama: p.nama, nagari: p.alamat_nagari, kecamatan: p.alamat_kecamatan }))
        .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
      nama_petugas: Object.fromEntries(namaPetugas),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PerubahanPpl = { petugas_id: number; atasan_id: number | null };
type PerubahanSub = { idsubsls: string; pml_id: number | null; ppl_id: number | null; mode_kerja: "private" | "keroyok" };

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const body = await req.json().catch(() => null);
  const pplUbah: PerubahanPpl[] = Array.isArray(body?.ppl) ? body.ppl : [];
  const subUbah: PerubahanSub[] = Array.isArray(body?.subsls) ? body.subsls : [];
  if (pplUbah.length === 0 && subUbah.length === 0) return NextResponse.json({ ok: true, diproses: 0 });

  try {
    const { data: petugasRaw, error: eP } = await db
      .from("bencana_petugas")
      .select("id, nama, peran, atasan_id, alamat_nagari, alamat_kecamatan, status_kontak_pendaftaran_bencana, aktif, status_kepegawaian, lat, lng, lokasi_status");
    if (eP) return NextResponse.json({ error: eP.message }, { status: 500 });
    const petugas = new Map(((petugasRaw ?? []) as Petugas[]).map((p) => [p.id, p]));

    // ---- Validasi PPL ----
    for (const u of pplUbah) {
      const p = petugas.get(u.petugas_id);
      if (!p || p.peran !== "ppl") return NextResponse.json({ error: `Petugas #${u.petugas_id} bukan PPL.` }, { status: 400 });
      if (u.atasan_id != null && petugas.get(u.atasan_id)?.peran !== "pml") {
        return NextResponse.json({ error: `Tujuan pindah ${p.nama} bukan PML.` }, { status: 400 });
      }
    }
    // Atasan efektif SETELAH perpindahan PPL (dipakai validasi PPL private).
    const atasanBaru = new Map<number, number | null>();
    for (const p of petugas.values()) atasanBaru.set(p.id, p.atasan_id);
    for (const u of pplUbah) atasanBaru.set(u.petugas_id, u.atasan_id);

    // ---- Validasi Sub SLS ----
    for (const s of subUbah) {
      if (s.mode_kerja !== "private" && s.mode_kerja !== "keroyok") return NextResponse.json({ error: `Mode ${s.idsubsls} tidak valid.` }, { status: 400 });
      if (s.pml_id != null && petugas.get(s.pml_id)?.peran !== "pml") return NextResponse.json({ error: `Tim tujuan Sub SLS ${s.idsubsls} bukan PML.` }, { status: 400 });
      if (s.pml_id != null && s.mode_kerja === "private") {
        if (!s.ppl_id) return NextResponse.json({ error: `Sub SLS ${s.idsubsls} PRIVATE tapi belum dipilih PPL-nya.` }, { status: 400 });
        if (atasanBaru.get(s.ppl_id) !== s.pml_id) {
          return NextResponse.json({ error: `PPL ${petugas.get(s.ppl_id)?.nama ?? s.ppl_id} bukan anggota tim untuk Sub SLS ${s.idsubsls}.` }, { status: 400 });
        }
      }
    }

    // ---- (1) Perpindahan PPL ----
    for (const u of pplUbah) {
      const { error } = await db.from("bencana_petugas").update({ atasan_id: u.atasan_id }).eq("id", u.petugas_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Sama dgn trigger "PPL ganti tim" (dijalankan eksplisit di sini supaya tetap benar walau trigger blm terpasang):
      // Sub SLS tim lama tetap milik tim lama, PPL dilepas & Sub SLS private jadi keroyok.
      let q = db
        .from("bencana_alokasi_subsls")
        .update({ ppl_id: null, mode_kerja: "keroyok", jarak_km: null, jarak_metode: null, jarak_status: null })
        .eq("ppl_id", u.petugas_id)
        .not("pml_id", "is", null);
      if (u.atasan_id != null) q = q.neq("pml_id", u.atasan_id);
      const { error: e2 } = await q;
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    }

    // ---- (2) Perubahan Sub SLS ----
    let titik: Map<string, { lat: number; lng: number }> | null = null;
    async function hitungJarak(idsubsls: string, pplId: number) {
      const p = petugas.get(pplId);
      if (!p || p.lokasi_status !== "riil" || typeof p.lat !== "number" || typeof p.lng !== "number") {
        return { jarak_km: null, jarak_metode: null, jarak_status: "tanpa_data" };
      }
      if (!titik) {
        const { data } = await rpcSemua<{ idsubsls: string; lat: number | null; lng: number | null }>(db!, "bencana_subsls_titik_jarak");
        titik = new Map(
          (data ?? []).filter((t) => typeof t.lat === "number" && typeof t.lng === "number").map((t) => [t.idsubsls, { lat: t.lat as number, lng: t.lng as number }])
        );
      }
      const tj = titik.get(idsubsls);
      if (!tj) return { jarak_km: null, jarak_metode: null, jarak_status: "tanpa_data" };
      const asal = { lat: p.lat, lng: p.lng };
      const osrm = await hitungJarakJalanMassal(asal, [tj]);
      if (osrm) return { jarak_km: Math.round(osrm[0] * 100) / 100, jarak_metode: "osrm", jarak_status: "riil" };
      return { jarak_km: Math.round(haversineKm(asal.lat, asal.lng, tj.lat, tj.lng) * 100) / 100, jarak_metode: "haversine_fallback", jarak_status: "riil" };
    }

    for (const s of subUbah) {
      const { data: ada, error: eA } = await db.from("bencana_alokasi_subsls").select("id, ppl_id, pml_id, porsi_kk").eq("idsubsls", s.idsubsls);
      if (eA) return NextResponse.json({ error: eA.message }, { status: 500 });
      const baris = (ada ?? []) as { id: number; ppl_id: number | null; pml_id: number | null; porsi_kk: number | null }[];

      // Lepas dari tim -> kembali belum diplot.
      if (s.pml_id == null) {
        if (baris.length > 0) {
          const { error } = await db.from("bencana_alokasi_subsls").delete().eq("idsubsls", s.idsubsls);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
        continue;
      }
      // Sub SLS dipecah (>1 baris): hanya tim & mode yg diubah, pembagian PPL tidak disentuh.
      if (baris.length > 1) {
        const { error } = await db.from("bencana_alokasi_subsls").update({ pml_id: s.pml_id, mode_kerja: s.mode_kerja }).eq("idsubsls", s.idsubsls);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        continue;
      }
      const lama = baris[0];
      const pplBaru = s.ppl_id ?? null;
      const upd: Record<string, unknown> = { pml_id: s.pml_id, ppl_id: pplBaru, mode_kerja: s.mode_kerja, terkunci: true };
      if (!lama || lama.ppl_id !== pplBaru) Object.assign(upd, pplBaru ? await hitungJarak(s.idsubsls, pplBaru) : { jarak_km: null, jarak_metode: null, jarak_status: null });
      if (pplBaru) {
        const p = petugas.get(pplBaru);
        if (p && p.peran !== "ppl") return NextResponse.json({ error: `${p.nama} bukan PPL.` }, { status: 400 });
      }
      if (lama) {
        const { error } = await db.from("bencana_alokasi_subsls").update(upd).eq("id", lama.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { error } = await db.from("bencana_alokasi_subsls").insert({ idsubsls: s.idsubsls, porsi_kk: null, ...upd });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, diproses: pplUbah.length + subUbah.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
