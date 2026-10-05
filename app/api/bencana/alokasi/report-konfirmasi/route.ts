// app/api/bencana/alokasi/report-konfirmasi/route.ts
//
// (4 Okt 2026) API ADMIN utk kartu "Report Konfirmasi Petugas per Wilayah" di bagian
// ATAS tab Alokasi Petugas (app/bencana/ReportKonfirmasiWilayah.tsx).
//
// Definisi:
//   - "Ditawarkan" = petugas yg sudah DIPLOT (memegang Sub SLS sbg PPL) + PML (atasan_id)
//     dari PPL tsb. Wilayah = wilayah TUGAS (kecamatan/nagari Sub SLS hasil plotting),
//     bukan domisili. Petugas yg memegang Sub SLS di > 1 wilayah dihitung di tiap wilayah
//     itu; baris TOTAL dihitung tanpa ganda.
//   - Status (sama dgn statusBaris() di UndanganAdminCard.tsx):
//       belum_dibuka : belum pernah lolos verifikasi di halaman undangan
//       dibaca       : sudah membuka undangan, belum menjawab
//       bersedia     : bersedia (konfirmasi reguler diterima / tawaran menginap bersedia)
//       pulang_pergi : tidak bersedia menginap tapi bersedia pulang-pergi (dihitung bersedia)
//       menolak      : menolak
//   - Jumlah minimum PPL = kebutuhan PPL per kecamatan dari RPC bencana_kebutuhan_petugas(hari_kerja)
//     (default 20 hari kerja).
//
// GET ?hari_kerja=20
//   -> { hari_kerja, kebutuhan: [{ kecamatan, ppl_min, pml_min }],
//        petugas: [{ id, nama, peran, status, wilayah: [{ kecamatan, nagari, subsls }] }] }
// Agregasi per wilayah dilakukan di FE supaya bisa dibuka/ditutup per kecamatan.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusKonfirmasi = "belum_dibuka" | "dibaca" | "bersedia" | "pulang_pergi" | "menolak";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const hkRaw = Number(req.nextUrl.searchParams.get("hari_kerja"));
  const hariKerja = Number.isFinite(hkRaw) && hkRaw > 0 ? Math.min(Math.round(hkRaw), 24) : 20;

  try {
    // 1) plot (PPL -> Sub SLS)
    const { data: alokRaw, error: errAlok } = await db.from("bencana_alokasi_subsls").select("idsubsls, ppl_id");
    if (errAlok) return NextResponse.json({ error: errAlok.message }, { status: 500 });
    const alok = ((alokRaw ?? []) as { idsubsls: string; ppl_id: number | null }[]).filter((a) => a.ppl_id != null) as {
      idsubsls: string;
      ppl_id: number;
    }[];

    // 2) wilayah Sub SLS
    const idsubsls = Array.from(new Set(alok.map((a) => a.idsubsls)));
    const wil = new Map<string, { kecamatan: string; nagari: string }>();
    for (let i = 0; i < idsubsls.length; i += 200) {
      const { data } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari").in("idsubsls", idsubsls.slice(i, i + 200));
      for (const r of (data ?? []) as { idsubsls: string; kecamatan: string; nagari: string }[]) {
        wil.set(r.idsubsls, { kecamatan: String(r.kecamatan ?? "").trim().toUpperCase(), nagari: String(r.nagari ?? "").trim().toUpperCase() });
      }
    }

    // 3) petugas PPL + PML (atasan)
    const pplIds = Array.from(new Set(alok.map((a) => a.ppl_id)));
    const petugasInfo = new Map<number, { id: number; nama: string; atasan_id: number | null; status_kontak: string | null }>();
    async function muatPetugas(ids: number[]) {
      const baru = ids.filter((id) => !petugasInfo.has(id));
      for (let i = 0; i < baru.length; i += 200) {
        const { data } = await db!
          .from("bencana_petugas")
          .select("id, nama, atasan_id, status_kontak_pendaftaran_bencana")
          .in("id", baru.slice(i, i + 200));
        for (const p of (data ?? []) as { id: number; nama: string; atasan_id: number | null; status_kontak_pendaftaran_bencana: string | null }[]) {
          petugasInfo.set(p.id, { id: p.id, nama: p.nama, atasan_id: p.atasan_id, status_kontak: p.status_kontak_pendaftaran_bencana });
        }
      }
    }
    await muatPetugas(pplIds);
    const pmlIds = Array.from(new Set(pplIds.map((id) => petugasInfo.get(id)?.atasan_id).filter((x): x is number => typeof x === "number")));
    await muatPetugas(pmlIds);

    // 4) status undangan + tawaran menginap terakhir
    const semuaId = Array.from(new Set([...pplIds, ...pmlIds]));
    const dibaca = new Map<number, boolean>();
    const tawaran = new Map<number, { status: string | null; pp: boolean | null }>();
    for (let i = 0; i < semuaId.length; i += 200) {
      const potong = semuaId.slice(i, i + 200);
      const { data: und } = await db.from("bencana_undangan").select("petugas_id, diverifikasi_at").in("petugas_id", potong);
      for (const u of (und ?? []) as { petugas_id: number; diverifikasi_at: string | null }[]) dibaca.set(u.petugas_id, !!u.diverifikasi_at);
      const { data: kand } = await db
        .from("bencana_tawaran_menginap_kandidat")
        .select("petugas_id, status, bersedia_pulang_pergi, dibuat_pada")
        .in("petugas_id", potong)
        .order("dibuat_pada", { ascending: false });
      for (const k of (kand ?? []) as { petugas_id: number; status: string | null; bersedia_pulang_pergi: boolean | null }[]) {
        if (!tawaran.has(k.petugas_id)) tawaran.set(k.petugas_id, { status: k.status, pp: k.bersedia_pulang_pergi });
      }
    }

    function statusDari(id: number): StatusKonfirmasi {
      const t = tawaran.get(id);
      const kontak = petugasInfo.get(id)?.status_kontak ?? null;
      if (t) {
        if (t.status === "bersedia") return "bersedia";
        if (t.status === "tidak_bersedia") return t.pp === true ? "pulang_pergi" : "menolak";
      } else {
        if (kontak === "menolak") return "menolak";
        if (kontak === "diterima") return "bersedia";
      }
      return dibaca.get(id) ? "dibaca" : "belum_dibuka";
    }

    // 5) wilayah per petugas: PPL = wilayah Sub SLS miliknya; PML = gabungan wilayah PPL bawahannya
    type Wil = { kecamatan: string; nagari: string; subsls: number };
    const wilPpl = new Map<number, Map<string, Wil>>();
    for (const a of alok) {
      const w = wil.get(a.idsubsls);
      if (!w) continue;
      const m = wilPpl.get(a.ppl_id) ?? new Map<string, Wil>();
      const kunci = `${w.kecamatan}|${w.nagari}`;
      const cur = m.get(kunci) ?? { kecamatan: w.kecamatan, nagari: w.nagari, subsls: 0 };
      cur.subsls += 1;
      m.set(kunci, cur);
      wilPpl.set(a.ppl_id, m);
    }
    const wilPml = new Map<number, Map<string, Wil>>();
    for (const ppl of pplIds) {
      const atasan = petugasInfo.get(ppl)?.atasan_id;
      if (typeof atasan !== "number") continue;
      const m = wilPml.get(atasan) ?? new Map<string, Wil>();
      for (const [kunci, w] of wilPpl.get(ppl) ?? []) {
        const cur = m.get(kunci) ?? { kecamatan: w.kecamatan, nagari: w.nagari, subsls: 0 };
        cur.subsls += w.subsls;
        m.set(kunci, cur);
      }
      wilPml.set(atasan, m);
    }

    const petugas: { id: number; nama: string; peran: "ppl" | "pml"; status: StatusKonfirmasi; wilayah: Wil[] }[] = [];
    for (const id of pplIds) {
      petugas.push({ id, nama: petugasInfo.get(id)?.nama ?? `#${id}`, peran: "ppl", status: statusDari(id), wilayah: Array.from(wilPpl.get(id)?.values() ?? []) });
    }
    for (const id of pmlIds) {
      petugas.push({ id, nama: petugasInfo.get(id)?.nama ?? `#${id}`, peran: "pml", status: statusDari(id), wilayah: Array.from(wilPml.get(id)?.values() ?? []) });
    }

    // 6) kebutuhan minimum per kecamatan (RPC yg sama dgn Ringkasan Alokasi)
    const { data: keb, error: errKeb } = await db.rpc("bencana_kebutuhan_petugas", { hari_kerja: hariKerja });
    if (errKeb) return NextResponse.json({ error: errKeb.message }, { status: 500 });
    const kebutuhan = ((keb ?? []) as { kecamatan: string; jumlah_ppl_dibutuhkan: number; jumlah_pml_dibutuhkan: number }[]).map((k) => ({
      kecamatan: String(k.kecamatan).trim().toUpperCase(),
      ppl_min: Number(k.jumlah_ppl_dibutuhkan),
      pml_min: Number(k.jumlah_pml_dibutuhkan),
    }));

    // 7) (5 Okt 2026) SELURUH wilayah sampel (termasuk yg belum punya PPL terplot) supaya
    //    monitoring jelas: tiap nagari tampil dgn jumlah Sub SLS sampel & berapa yg sudah terplot.
    const { data: calon, error: errCalon } = await db.rpc("bencana_daftar_calon_sampel");
    if (errCalon) return NextResponse.json({ error: errCalon.message }, { status: 500 });
    const terplot = new Set(alok.map((a) => a.idsubsls));
    const peta = new Map<string, { kecamatan: string; nagari: string; sampel: number; terplot: number }>();
    for (const r of (calon ?? []) as { idsubsls: string; kecamatan: string; nagari: string; termasuk_sampel: boolean }[]) {
      if (!r.termasuk_sampel) continue;
      const kecamatan = String(r.kecamatan ?? "").trim().toUpperCase();
      const nagari = String(r.nagari ?? "").trim().toUpperCase();
      const kunci = `${kecamatan}|${nagari}`;
      const cur = peta.get(kunci) ?? { kecamatan, nagari, sampel: 0, terplot: 0 };
      cur.sampel += 1;
      if (terplot.has(r.idsubsls)) cur.terplot += 1;
      peta.set(kunci, cur);
    }
    const wilayahSampel = Array.from(peta.values());

    return NextResponse.json({ hari_kerja: hariKerja, kebutuhan, petugas, wilayah_sampel: wilayahSampel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
