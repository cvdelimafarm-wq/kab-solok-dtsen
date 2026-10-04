// app/api/bencana/alokasi/undangan/route.ts
//
// (4 Okt 2026) API ADMIN utk kartu "Undangan Konfirmasi" di tab Alokasi Petugas
// (lihat app/bencana/UndanganAdminCard.tsx). Sisi publiknya: /undangan
// (+ app/api/bencana/undangan/*).
//
// GET  -> 1 baris per petugas yg SUDAH diplot ATAU pernah ditawari menginap:
//         jarak terjauh rumah->Sub SLS (utk filter "domisili jauh" dgn threshold
//         manual di FE), status undangan (dibaca / WA pribadi / akun / kunci),
//         status kesediaan biasa, tawaran menginap terakhir, + usulan CADANGAN
//         utk petugas yg menolak (plot kosong karena penolakan).
// POST { aksi, ... }
//   - "wa_pribadi"        { petugas_id }            catat WA pribadi (tier 2) terkirim
//   - "buka_kunci"        { petugas_id }            buka kunci verifikasi/PIN
//   - "tolak"             { petugas_id }            tolak MANUAL (hanya jika sudah dibaca >= 24 jam & belum menjawab)
//   - "buat_tawaran_jauh" { petugas_ids: number[] } buat tawaran menginap per nagari terjauh
//
// Tidak ada penghapusan data permanen di sini; kunci percobaan dihapus saja (data
// sementara pembatas), bukan data petugas/plot.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normNama, type Db } from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JAM_TOLAK = 24;
const AWAL_MENOLAK_MENGINAP = "Tidak bersedia menginap";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

type PetugasRow = {
  id: number;
  nama: string;
  no_hp: string | null;
  token: string;
  status_kontak_pendaftaran_bencana: "diterima" | "menolak" | null;
  pendaftaran_bencana_konfirmasi: boolean;
  catatan_penolakan_pendaftaran_bencana: string | null;
  dikontak_pendaftaran_bencana_at: string | null;
  jadwal_pelatihan_dipilih: string | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  nilai_kinerja: number | null;
};

type JarakInfo = {
  jarak_maks_km: number | null;
  semua_riil: boolean;
  jumlah_plot: number;
  idsubsls_terjauh: string | null;
  kecamatan_terjauh: string | null;
  nagari_terjauh: string | null;
};

async function hitungJarak(db: Db, ids?: number[]): Promise<Map<number, JarakInfo>> {
  let q = db.from("bencana_alokasi_subsls").select("idsubsls, ppl_id, jarak_km, jarak_status");
  if (ids && ids.length > 0) q = q.in("ppl_id", ids);
  const { data } = await q;
  const baris = (data ?? []) as { idsubsls: string; ppl_id: number; jarak_km: number | null; jarak_status: string | null }[];
  const idsubsls = Array.from(new Set(baris.map((b) => b.idsubsls)));
  const wil = new Map<string, { kecamatan: string; nagari: string }>();
  for (let i = 0; i < idsubsls.length; i += 200) {
    const { data: w } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari").in("idsubsls", idsubsls.slice(i, i + 200));
    for (const r of (w ?? []) as { idsubsls: string; kecamatan: string; nagari: string }[]) wil.set(r.idsubsls, { kecamatan: r.kecamatan, nagari: r.nagari });
  }
  const hasil = new Map<number, JarakInfo>();
  for (const b of baris) {
    const cur = hasil.get(b.ppl_id) ?? { jarak_maks_km: null, semua_riil: true, jumlah_plot: 0, idsubsls_terjauh: null, kecamatan_terjauh: null, nagari_terjauh: null };
    cur.jumlah_plot += 1;
    if (b.jarak_status !== "riil") cur.semua_riil = false;
    const j = b.jarak_km == null ? null : Number(b.jarak_km);
    if (j != null && (cur.jarak_maks_km == null || j > cur.jarak_maks_km)) {
      cur.jarak_maks_km = j;
      cur.idsubsls_terjauh = b.idsubsls;
      const w = wil.get(b.idsubsls);
      cur.kecamatan_terjauh = w?.kecamatan ?? null;
      cur.nagari_terjauh = w?.nagari ?? null;
    }
    hasil.set(b.ppl_id, cur);
  }
  return hasil;
}

export async function GET() {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const jarak = await hitungJarak(db);

    const { data: kandRaw, error: errKand } = await db
      .from("bencana_tawaran_menginap_kandidat")
      .select("id, tawaran_id, petugas_id, token, status, catatan, dijawab_pada, dibuat_pada, pola_menginap, jadwal_pelatihan, perkiraan_hari_libur, teman_menginap, alasan_kategori, bersedia_pulang_pergi, bencana_tawaran_menginap(kecamatan, nagari)")
      .order("dibuat_pada", { ascending: false });
    if (errKand) return NextResponse.json({ error: errKand.message }, { status: 500 });
    const kandTerakhir = new Map<number, Record<string, unknown>>();
    for (const k of (kandRaw ?? []) as Record<string, unknown>[]) {
      const pid = k.petugas_id as number;
      if (!kandTerakhir.has(pid)) kandTerakhir.set(pid, k);
    }

    // (4 Okt 2026) PML (peran 'pml' yg membawahi PPL) ikut dipantau: mereka juga diundang lewat /undangan.
    const { data: bawahanRaw } = await db.from("bencana_petugas").select("atasan_id").not("atasan_id", "is", null);
    const jmlPpl = new Map<number, number>();
    for (const b of (bawahanRaw ?? []) as { atasan_id: number }[]) jmlPpl.set(b.atasan_id, (jmlPpl.get(b.atasan_id) ?? 0) + 1);
    const { data: pmlRaw } = await db.from("bencana_petugas").select("id").eq("peran", "pml").eq("aktif", true).eq("status_kepegawaian", "mitra");
    const pmlIds = new Set(((pmlRaw ?? []) as { id: number }[]).map((x) => x.id).filter((id) => (jmlPpl.get(id) ?? 0) > 0));

    const idSemua = Array.from(new Set([...jarak.keys(), ...kandTerakhir.keys(), ...pmlIds]));
    if (idSemua.length === 0) return NextResponse.json({ data: [], cadangan: {} });

    const petugasMap = new Map<number, PetugasRow>();
    for (let i = 0; i < idSemua.length; i += 200) {
      const { data } = await db
        .from("bencana_petugas")
        .select(
          "id, nama, no_hp, token, status_kontak_pendaftaran_bencana, pendaftaran_bencana_konfirmasi, catatan_penolakan_pendaftaran_bencana, dikontak_pendaftaran_bencana_at, jadwal_pelatihan_dipilih, alamat_kecamatan, alamat_nagari, nilai_kinerja"
        )
        .in("id", idSemua.slice(i, i + 200));
      for (const p of (data ?? []) as PetugasRow[]) petugasMap.set(p.id, p);
    }

    const { data: undRaw } = await db
      .from("bencana_undangan")
      .select("petugas_id, diverifikasi_at, terakhir_masuk_at, wa_pribadi_at, wa_pribadi_jumlah, akun_dibuat_at");
    const und = new Map<number, Record<string, unknown>>();
    for (const u of (undRaw ?? []) as Record<string, unknown>[]) und.set(u.petugas_id as number, u);

    const { data: kunciRaw } = await db.from("bencana_undangan_percobaan").select("kunci, terkunci_sampai").not("terkunci_sampai", "is", null);
    const kunciAktif = new Set<string>();
    for (const k of (kunciRaw ?? []) as { kunci: string; terkunci_sampai: string }[]) {
      if (new Date(k.terkunci_sampai).getTime() > Date.now()) kunciAktif.add(k.kunci);
    }

    const rows = idSemua
      .map((id) => {
        const p = petugasMap.get(id);
        if (!p) return null;
        const j = jarak.get(id);
        const u = und.get(id);
        const k = kandTerakhir.get(id);
        const nk = normNama(p.nama);
        const tw = (k?.bencana_tawaran_menginap ?? null) as { kecamatan: string; nagari: string | null } | null;
        return {
          id: p.id,
          nama: p.nama,
          no_hp: p.no_hp,
          alamat_kecamatan: p.alamat_kecamatan,
          alamat_nagari: p.alamat_nagari,
          status_kontak: p.status_kontak_pendaftaran_bencana,
          sudah_konfirmasi: p.pendaftaran_bencana_konfirmasi,
          catatan_menolak: p.catatan_penolakan_pendaftaran_bencana,
          // waktu petugas menjawab (tawaran menginap: dijawab_pada; reguler/PML: waktu kontak) + jadwal pelatihan reguler/PML
          dijawab_at: ((k?.dijawab_pada as string | null) ?? (p.status_kontak_pendaftaran_bencana ? p.dikontak_pendaftaran_bencana_at : null)) ?? null,
          jadwal_reguler: p.jadwal_pelatihan_dipilih,
          peran: pmlIds.has(p.id) ? ("pml" as const) : ("ppl" as const),
          jumlah_ppl: jmlPpl.get(p.id) ?? 0,
          jumlah_plot: j?.jumlah_plot ?? 0,
          jarak_maks_km: j?.jarak_maks_km ?? null,
          jarak_semua_riil: j?.semua_riil ?? true,
          idsubsls_terjauh: j?.idsubsls_terjauh ?? null,
          kecamatan_terjauh: j?.kecamatan_terjauh ?? null,
          nagari_terjauh: j?.nagari_terjauh ?? null,
          dibaca_at: (u?.diverifikasi_at as string | null) ?? null,
          terakhir_masuk_at: (u?.terakhir_masuk_at as string | null) ?? null,
          wa_pribadi_at: (u?.wa_pribadi_at as string | null) ?? null,
          wa_pribadi_jumlah: (u?.wa_pribadi_jumlah as number | null) ?? 0,
          akun_dibuat_at: (u?.akun_dibuat_at as string | null) ?? null,
          terkunci: kunciAktif.has(`verif:${nk}`) || kunciAktif.has(`pin:${nk}`),
          tawaran: k
            ? {
                kandidat_id: k.id as number,
                tawaran_id: k.tawaran_id as number,
                status: k.status as "bersedia" | "tidak_bersedia" | null,
                catatan: (k.catatan as string | null) ?? null,
                dijawab_pada: (k.dijawab_pada as string | null) ?? null,
                dibuat_pada: k.dibuat_pada as string,
                pola_menginap: (k.pola_menginap as string | null) ?? null,
                jadwal_pelatihan: (k.jadwal_pelatihan as string | null) ?? null,
                perkiraan_hari_libur: (k.perkiraan_hari_libur as string[] | null) ?? null,
                teman_menginap: (k.teman_menginap as string | null) ?? null,
                alasan_kategori: (k.alasan_kategori as string | null) ?? null,
                bersedia_pulang_pergi: (k.bersedia_pulang_pergi as boolean | null) ?? null,
                kecamatan: tw?.kecamatan ?? null,
                nagari: tw?.nagari ?? null,
              }
            : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // ---- Usulan cadangan utk petugas yg menolak & masih memegang plot.
    const menolak = rows.filter((r) => r.jumlah_plot > 0 && (r.status_kontak === "menolak" || (r.tawaran?.status === "tidak_bersedia" && r.tawaran.bersedia_pulang_pergi !== true)));
    const cadangan: Record<number, { id: number; nama: string; no_hp: string | null; nagari: string | null; kecamatan: string | null; nilai_kinerja: number | null; kedekatan: string }[]> = {};
    if (menolak.length > 0) {
      const { data: calon } = await db
        .from("bencana_petugas")
        .select("id, nama, no_hp, alamat_kecamatan, alamat_nagari, nilai_kinerja, status_kontak_pendaftaran_bencana, red_flag_kinerja")
        .eq("aktif", true)
        .eq("status_kepegawaian", "mitra")
        .eq("red_flag_kinerja", false);
      const sudahPlot = new Set(jarak.keys());
      const pool = ((calon ?? []) as Record<string, unknown>[]).filter(
        (c) => !sudahPlot.has(c.id as number) && c.status_kontak_pendaftaran_bencana !== "menolak" && !kandTerakhir.has(c.id as number)
      );
      for (const m of menolak) {
        const skor = pool
          .map((c) => {
            const sama = (a: unknown, b: string | null) => !!b && String(a ?? "").toLowerCase() === b.toLowerCase();
            const nagari = sama(c.alamat_nagari, m.nagari_terjauh);
            const kec = sama(c.alamat_kecamatan, m.kecamatan_terjauh);
            return { c, tier: nagari ? 0 : kec ? 1 : 2, nilai: Number(c.nilai_kinerja ?? 0) };
          })
          .filter((x) => x.tier < 2)
          .sort((a, b) => a.tier - b.tier || b.nilai - a.nilai)
          .slice(0, 3);
        cadangan[m.id] = skor.map(({ c, tier }) => ({
          id: c.id as number,
          nama: c.nama as string,
          no_hp: (c.no_hp as string | null) ?? null,
          nagari: (c.alamat_nagari as string | null) ?? null,
          kecamatan: (c.alamat_kecamatan as string | null) ?? null,
          nilai_kinerja: (c.nilai_kinerja as number | null) ?? null,
          kedekatan: tier === 0 ? "satu nagari dgn wilayah" : "satu kecamatan dgn wilayah",
        }));
      }
    }

    return NextResponse.json({ data: rows, cadangan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const body = await req.json().catch(() => null);
  const aksi = typeof body?.aksi === "string" ? body.aksi : "";

  try {
    if (aksi === "buat_tawaran_jauh") {
      const ids: number[] = Array.isArray(body?.petugas_ids)
        ? Array.from(new Set((body.petugas_ids as unknown[]).filter((v): v is number => typeof v === "number" && Number.isFinite(v))))
        : [];
      if (ids.length === 0) return NextResponse.json({ error: "Pilih minimal 1 petugas." }, { status: 400 });
      const jarak = await hitungJarak(db, ids);
      const { data: kandAda } = await db.from("bencana_tawaran_menginap_kandidat").select("petugas_id").in("petugas_id", ids);
      const sudahDitawari = new Set(((kandAda ?? []) as { petugas_id: number }[]).map((k) => k.petugas_id));

      const grup = new Map<string, { kecamatan: string; nagari: string; ids: number[]; maks: number }>();
      let dilewati = 0;
      for (const id of ids) {
        const j = jarak.get(id);
        if (!j || !j.nagari_terjauh || !j.kecamatan_terjauh || sudahDitawari.has(id)) {
          dilewati++;
          continue;
        }
        const kunci = `${j.kecamatan_terjauh}||${j.nagari_terjauh}`;
        const g = grup.get(kunci) ?? { kecamatan: j.kecamatan_terjauh, nagari: j.nagari_terjauh, ids: [], maks: 0 };
        g.ids.push(id);
        g.maks = Math.max(g.maks, j.jarak_maks_km ?? 0);
        grup.set(kunci, g);
      }
      let dibuat = 0;
      let ditawari = 0;
      for (const g of grup.values()) {
        const keterangan =
          `Wilayah kerja Anda di Nagari ${g.nagari}, Kec. ${g.kecamatan} cukup jauh dari domisili Anda (hingga sekitar ${g.maks.toFixed(0)} km). ` +
          `Agar tidak pulang-pergi, BPS menawarkan Anda menginap di kontrakan yang disediakan di lokasi pendataan bersama PPL lain selama masa tugas.`;
        const { data: tw, error } = await db
          .from("bencana_tawaran_menginap")
          .insert({ kecamatan: g.kecamatan, nagari: g.nagari, keterangan })
          .select("id")
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const { error: e2 } = await db
          .from("bencana_tawaran_menginap_kandidat")
          .insert(g.ids.map((petugas_id) => ({ tawaran_id: tw.id, petugas_id })));
        if (e2) {
          await db.from("bencana_tawaran_menginap").delete().eq("id", tw.id); // rollback tawaran kosong yg baru dibuat
          return NextResponse.json({ error: e2.message }, { status: 500 });
        }
        dibuat++;
        ditawari += g.ids.length;
      }
      return NextResponse.json({ ok: true, tawaran_dibuat: dibuat, petugas_ditawari: ditawari, dilewati });
    }

    const petugasId = Number(body?.petugas_id);
    if (!Number.isFinite(petugasId) || petugasId <= 0) return NextResponse.json({ error: "petugas_id wajib diisi." }, { status: 400 });

    const { data: p } = await db.from("bencana_petugas").select("id, nama, status_kontak_pendaftaran_bencana").eq("id", petugasId).maybeSingle();
    if (!p) return NextResponse.json({ error: "Petugas tidak ditemukan." }, { status: 404 });

    if (aksi === "wa_pribadi") {
      const { data: lama } = await db.from("bencana_undangan").select("wa_pribadi_jumlah").eq("petugas_id", petugasId).maybeSingle();
      const { error } = await db
        .from("bencana_undangan")
        .upsert(
          { petugas_id: petugasId, wa_pribadi_at: new Date().toISOString(), wa_pribadi_jumlah: ((lama?.wa_pribadi_jumlah as number | null) ?? 0) + 1 },
          { onConflict: "petugas_id" }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "buka_kunci") {
      const nk = normNama(p.nama as string);
      await db.from("bencana_undangan_percobaan").delete().in("kunci", [`verif:${nk}`, `pin:${nk}`]);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "tolak") {
      const { data: und } = await db.from("bencana_undangan").select("diverifikasi_at").eq("petugas_id", petugasId).maybeSingle();
      const dibaca = und?.diverifikasi_at as string | null | undefined;
      if (!dibaca) return NextResponse.json({ error: "Petugas ini belum membuka undangan, belum bisa ditolak manual." }, { status: 400 });
      const jam = (Date.now() - new Date(dibaca).getTime()) / 3_600_000;
      if (jam < JAM_TOLAK) {
        return NextResponse.json({ error: `Baru ${Math.floor(jam)} jam sejak dibaca. Tolak manual baru bisa setelah ${JAM_TOLAK} jam.` }, { status: 400 });
      }
      const { data: kand } = await db
        .from("bencana_tawaran_menginap_kandidat")
        .select("id, status")
        .eq("petugas_id", petugasId)
        .order("dibuat_pada", { ascending: false })
        .limit(1);
      const sekarang = new Date().toISOString();
      const catatan = `Ditolak admin: sudah dibaca >${JAM_TOLAK} jam tetapi belum mengonfirmasi.`;
      if (kand && kand.length > 0) {
        if (kand[0].status) return NextResponse.json({ error: "Petugas sudah menjawab tawaran menginap." }, { status: 400 });
        const { error } = await db
          .from("bencana_tawaran_menginap_kandidat")
          .update({ status: "tidak_bersedia", catatan, dijawab_pada: sekarang })
          .eq("id", kand[0].id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        // Plot kosong karena penolakan: tandai juga di status kesediaan umum agar muncul peringatan di Langkah 4.
        await db
          .from("bencana_petugas")
          .update({
            status_kontak_pendaftaran_bencana: "menolak",
            catatan_penolakan_pendaftaran_bencana: `${AWAL_MENOLAK_MENGINAP}: ${catatan}`,
            dikontak_pendaftaran_bencana_at: sekarang,
          })
          .eq("id", petugasId);
      } else {
        if (p.status_kontak_pendaftaran_bencana) return NextResponse.json({ error: "Petugas sudah menjawab." }, { status: 400 });
        const { error } = await db
          .from("bencana_petugas")
          .update({ status_kontak_pendaftaran_bencana: "menolak", catatan_penolakan_pendaftaran_bencana: catatan, dikontak_pendaftaran_bencana_at: sekarang })
          .eq("id", petugasId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "aksi tidak dikenal." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga" }, { status: 500 });
  }
}
