// app/api/sigap/admin/route.ts
//
// (5 Okt 2026) SIGAP -- API halaman Admin Transport Lokal & Kelola Peran & Akses (mockup-sigap-admin
// disetujui user). Semua permintaan wajib header Authorization: Bearer <sesi> (lib/sigapAkses), dan
// setiap bagian dicek izinnya per menu + lingkup kegiatan. Semua aksi tulis dicatat di sigap_audit.
//
// GET ?bagian=ringkas                       -> kegiatan yg terlihat + izin saya
// GET ?bagian=monitoring&kegiatan_id=       -> matriks harian per petugas
// GET ?bagian=penugasan&kegiatan_id=        -> petugas + ST
// GET ?bagian=cari_akun&q=                  -> cari akun master (maks 20)
// GET ?bagian=kegiatan&kegiatan_id=         -> data kegiatan + peran/tarif
// GET ?bagian=verifikasi&kegiatan_id=       -> hari dibayar, nominal, kelengkapan, status kunci
// GET ?bagian=akses                         -> peran, menu, izin, akun-peran (izin akses.kelola)
// GET ?bagian=riwayat                       -> 200 aksi terakhir (izin akses.kelola)
// POST { aksi, ... } -> lihat fungsi POST di bawah.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { HK_AKTIF, aturanDari, hariLengkap, type AturanIsian, hariIniWib, kelompokTanggal, rentangTanggal, tanggalValid, type Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun, lingkup, sesiDariHeader, type PetaIzin } from "@/lib/sigapAkses";
import { resetPinOlehAdmin } from "@/lib/sigapPin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/** Ambil semua baris (PostgREST membatasi 1000 per permintaan). */
async function semuaBaris<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 50000; i += 1000) {
    const { data } = await ambil(i, i + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function sesi(req: NextRequest, db: Db) {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  const { peran, izin } = await izinAkun(db, akunId);
  return { akunId, nama: a.nama as string, peran, izin };
}

type Pen = { id: number; kegiatan_id: number; akun_id: number; peran: string; maks_hari: number | null; surat_tugas_id: number | null; aktif: boolean; dikunci_at: string | null; dikunci_oleh: string | null };

async function dataPenugasan(db: Db, kegiatanId: number) {
  const pen = await semuaBaris<Pen>((a, b) =>
    db.from("sigap_penugasan").select("id, kegiatan_id, akun_id, peran, maks_hari, surat_tugas_id, aktif, dikunci_at, dikunci_oleh").eq("kegiatan_id", kegiatanId).order("id").range(a, b)
  );
  const akunIds = Array.from(new Set(pen.map((p) => p.akun_id)));
  const stIds = pen.map((p) => p.surat_tugas_id).filter((x): x is number => !!x);
  const [akun, st, { data: keg }, { data: tarif }] = await Promise.all([
    akunIds.length ? semuaBaris<{ id: number; nama: string; jenis: string }>((a, b) => db.from("sigap_akun").select("id, nama, jenis").in("id", akunIds).range(a, b)) : Promise.resolve([]),
    stIds.length
      ? semuaBaris<{ id: number; nomor_st: string; tanggal_st: string | null; tanggal_mulai: string | null; tanggal_selesai: string | null; tujuan: string[] | null; file_path: string | null }>((a, b) =>
          db.from("sigap_surat_tugas").select("id, nomor_st, tanggal_st, tanggal_mulai, tanggal_selesai, tujuan, file_path").in("id", stIds).range(a, b)
        )
      : Promise.resolve([]),
    db.from("sigap_kegiatan").select("id, kode, nama, kode_anggaran, tanggal_mulai, tanggal_selesai, satuan_realisasi, aktif, jenis, wajib_laporan, jumlah_foto").eq("id", kegiatanId).maybeSingle(),
    db.from("sigap_kegiatan_tarif").select("peran, tarif, label_jabatan, maks_hari_default").eq("kegiatan_id", kegiatanId),
  ]);
  const baris = pen.map((p) => {
    const a = akun.find((x) => x.id === p.akun_id);
    const s = st.find((x) => x.id === p.surat_tugas_id) ?? null;
    const t = (tarif ?? []).find((x) => x.peran === p.peran);
    return {
      ...p,
      nama: a?.nama ?? "?",
      jenis: a?.jenis ?? "mitra",
      tarif: Number(t?.tarif ?? 0),
      maks_efektif: p.maks_hari ?? ((t?.maks_hari_default as number | null) ?? null),
      st: s ? { id: s.id, nomor: s.nomor_st, tanggal_st: s.tanggal_st, mulai: s.tanggal_mulai, selesai: s.tanggal_selesai, tujuan: s.tujuan ?? [], ada_file: !!s.file_path } : null,
    };
  });
  baris.sort((x, y) => (x.st?.tujuan?.[0] ?? "").localeCompare(y.st?.tujuan?.[0] ?? "") || (x.peran === y.peran ? 0 : x.peran === "pml" ? -1 : 1) || x.nama.localeCompare(y.nama));
  // (5 Okt 2026) peran_opsi: daftar peran kegiatan utk dropdown halaman admin Penugasan -- permintaan user.
  const peranOpsi = (tarif ?? []).map((t) => ({ peran: t.peran as string, label_jabatan: (t.label_jabatan as string | null) ?? null, tarif: Number(t.tarif ?? 0), maks_hari_default: (t.maks_hari_default as number | null) ?? null }));
  return { kegiatan: keg, baris, peranOpsi };
}

/** Status per (penugasan, tanggal) dari hari kerja, realisasi & foto. */
async function statusHarian(db: Db, penIds: number[]) {
  if (penIds.length === 0) return { hk: [], real: [], foto: new Map<string, number>(), izin: [] as { penugasan_id: number; tanggal: string }[] };
  const [hk, real, fotoRows, izin] = await Promise.all([
    semuaBaris<{ penugasan_id: number; tanggal: string }>((a, b) => db.from("sigap_hari_kerja").select("penugasan_id, tanggal").in("penugasan_id", penIds).or(HK_AKTIF()).order("id").range(a, b)),
    semuaBaris<{ penugasan_id: number; tanggal: string; jumlah_realisasi: number }>((a, b) =>
      db.from("sigap_realisasi").select("penugasan_id, tanggal, jumlah_realisasi").in("penugasan_id", penIds).order("id").range(a, b)
    ),
    semuaBaris<{ penugasan_id: number; tanggal: string }>((a, b) => db.from("sigap_dokumentasi").select("penugasan_id, tanggal").in("penugasan_id", penIds).order("id").range(a, b)),
    // (5 Okt 2026) Hanya izin susulan yg MASIH AKTIF -- sama dgn aturan halaman petugas & dokumen SPJ.
    semuaBaris<{ penugasan_id: number; tanggal: string }>((a, b) =>
      db.from("sigap_izin_susulan").select("penugasan_id, tanggal").in("penugasan_id", penIds).gt("berlaku_sampai", new Date().toISOString()).order("id").range(a, b)
    ),
  ]);
  const foto = new Map<string, number>();
  for (const f of fotoRows) foto.set(`${f.penugasan_id}|${f.tanggal}`, (foto.get(`${f.penugasan_id}|${f.tanggal}`) ?? 0) + 1);
  return { hk, real, foto, izin };
}

function statusHari(adaReal: boolean, nFoto: number, tanggal: string, hariIni: string, aturan: AturanIsian): "lengkap" | "sebagian" | "terlewat" | "rencana" {
  // (7 Okt 2026) aturan isian per kegiatan (wajib laporan & jumlah foto)
  if (hariLengkap(adaReal, nFoto, aturan)) return "lengkap";
  if (tanggal > hariIni) return "rencana";
  if (tanggal === hariIni) return "sebagian";
  return "terlewat";
}

function kegiatanTerlihat(izin: PetaIzin): "semua" | number[] {
  const menu = Object.keys(izin).filter((k) => k.startsWith("translok."));
  if (menu.some((m) => lingkup(izin, m) === "semua")) return "semua";
  return Array.from(new Set(menu.flatMap((m) => lingkup(izin, m) as number[])));
}

// ======================================================================
// (7 Okt 2026) portal satu login: peran admin aplikasi & admin per aplikasi hanya dikelola Admin Aplikasi
// (izin portal.kelola) -- permintaan user "di atas admin anggaran ada juga admin aplikasi".
const PERAN_KHUSUS_ADMIN_APLIKASI = ["admin_aplikasi", "admin_delego", "admin_dtsen", "admin_bencana", "admin_penyisiran", "admin_seruti"];

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const sp = req.nextUrl.searchParams;
    const bagian = sp.get("bagian") ?? "ringkas";
    const kegiatanId = Number(sp.get("kegiatan_id")) || null;
    const perlu = (menu: string, level: "lihat" | "kelola" = "lihat") => boleh(s.izin, menu, level, kegiatanId);

    if (bagian === "ringkas") {
      const lihat = kegiatanTerlihat(s.izin);
      let q = db.from("sigap_kegiatan").select("id, kode, nama, tanggal_mulai, tanggal_selesai, aktif").order("id");
      if (lihat !== "semua") q = q.in("id", lihat.length ? lihat : [-1]);
      const { data: keg } = await q;
      return NextResponse.json({ nama: s.nama, peran: s.peran, izin: s.izin, kegiatan: keg ?? [], hari_ini: hariIniWib() });
    }

    // (6 Okt 2026) Beranda backoffice (layout layar lebar, saran desain user): angka & "perlu tindakan"
    // dihitung dari data nyata kegiatan yg terlihat -- bukan angka contoh.
    if (bagian === "beranda") {
      const lihat = kegiatanTerlihat(s.izin);
      let q = db.from("sigap_kegiatan").select("id, nama, tanggal_mulai, tanggal_selesai, aktif").eq("aktif", true).order("id");
      if (lihat !== "semua") q = q.in("id", lihat.length ? lihat : [-1]);
      const { data: kegs } = await q;
      const hariIni = hariIniWib();
      const per = [] as Record<string, unknown>[];
      for (const k of kegs ?? []) {
        const { baris, kegiatan: kegDp } = await dataPenugasan(db, k.id as number);
        const aturan = aturanDari(kegDp);
        const aktif = baris.filter((b) => b.aktif);
        const st = await statusHarian(db, aktif.map((b) => b.id));
        const realSet = new Set(st.real.map((r) => `${r.penugasan_id}|${r.tanggal}`));
        let terlewat = 0,
          kerjaHariIni = 0,
          lengkapHariIni = 0,
          belumPilih = 0,
          siapKunci = 0,
          terkunci = 0;
        for (const b of aktif) {
          const hk = st.hk.filter((h) => h.penugasan_id === b.id).map((h) => h.tanggal);
          if (hk.length === 0) belumPilih++;
          if (b.dikunci_at) terkunci++;
          let lengkapAda = false;
          for (const t of hk) {
            const v = statusHari(realSet.has(`${b.id}|${t}`), st.foto.get(`${b.id}|${t}`) ?? 0, t, hariIni, aturan);
            if (v === "terlewat") terlewat++;
            if (v === "lengkap") lengkapAda = true;
            if (t === hariIni) {
              kerjaHariIni++;
              if (v === "lengkap") lengkapHariIni++;
            }
          }
          if (!b.dikunci_at && lengkapAda && !hk.some((t) => t >= hariIni) && (!k.tanggal_selesai || (k.tanggal_selesai as string) < hariIni)) siapKunci++;
        }
        per.push({
          id: k.id,
          nama: k.nama,
          tanggal_mulai: k.tanggal_mulai,
          tanggal_selesai: k.tanggal_selesai,
          periode_kosong: !k.tanggal_mulai || !k.tanggal_selesai,
          petugas: aktif.length,
          st_tanpa_nomor: aktif.filter((b) => !b.st).length,
          st_tanpa_file: aktif.filter((b) => b.st && !b.st.ada_file).length,
          belum_pilih: belumPilih,
          kerja_hari_ini: kerjaHariIni,
          lengkap_hari_ini: lengkapHariIni,
          terlewat,
          siap_kunci: siapKunci,
          terkunci,
          boleh: {
            monitoring: boleh(s.izin, "translok.monitoring", "lihat", k.id as number),
            penugasan: boleh(s.izin, "translok.penugasan", "kelola", k.id as number),
            kegiatan: boleh(s.izin, "translok.kegiatan", "kelola", k.id as number),
            verifikasi: boleh(s.izin, "translok.verifikasi", "kelola", k.id as number),
            izin: boleh(s.izin, "translok.izin_susulan", "kelola", k.id as number),
          },
        });
      }
      return NextResponse.json({ hari_ini: hariIni, kegiatan: per });
    }

    if (bagian === "cari_akun") {
      if (!(boleh(s.izin, "translok.penugasan", "kelola") || boleh(s.izin, "akses.kelola", "kelola"))) return galat("Tidak punya izin.", 403);
      const q = (sp.get("q") ?? "").trim();
      if (q.length < 2) return NextResponse.json({ akun: [] });
      const { data } = await db.from("sigap_akun").select("id, nama, jenis, alamat_kecamatan").eq("aktif", true).ilike("nama", `%${q.replace(/[%_]/g, "")}%`).order("nama").limit(20);
      return NextResponse.json({ akun: data ?? [] });
    }

    if (bagian === "monitoring" || bagian === "penugasan" || bagian === "verifikasi" || bagian === "kegiatan") {
      if (!kegiatanId) return galat("Pilih kegiatan.");
      const menu = bagian === "monitoring" ? "translok.monitoring" : bagian === "penugasan" ? "translok.penugasan" : bagian === "verifikasi" ? "translok.verifikasi" : "translok.kegiatan";
      if (!perlu(menu)) return galat("Tidak punya izin untuk menu ini.", 403);
      const hariIni = hariIniWib();

      if (bagian === "kegiatan") {
        const [{ data: keg }, { data: tarif }] = await Promise.all([
          db.from("sigap_kegiatan").select("id, kode, nama, kode_anggaran, tanggal_mulai, tanggal_selesai, satuan_realisasi, aktif, jenis, wajib_laporan, jumlah_foto").eq("id", kegiatanId).maybeSingle(),
          db.from("sigap_kegiatan_tarif").select("id, peran, uraian_detail, tarif, label_jabatan, maks_hari_default, urutan").eq("kegiatan_id", kegiatanId).order("urutan").order("peran"),
        ]);
        return NextResponse.json({ kegiatan: keg, tarif: tarif ?? [], boleh_kelola: perlu(menu, "kelola") });
      }

      const { kegiatan, baris, peranOpsi } = await dataPenugasan(db, kegiatanId);
      const aturan = aturanDari(kegiatan);
      if (bagian === "penugasan") return NextResponse.json({ kegiatan, baris, peran_opsi: peranOpsi, boleh_kelola: perlu(menu, "kelola") });

      const aktif = baris.filter((b) => b.aktif);
      const st = await statusHarian(db, aktif.map((b) => b.id));
      const realSet = new Set(st.real.map((r) => `${r.penugasan_id}|${r.tanggal}`));

      if (bagian === "monitoring") {
        const mulai = sp.get("dari") ?? kegiatan?.tanggal_mulai ?? hariIni;
        const akhirKeg = (kegiatan?.tanggal_selesai as string | null) ?? hariIni;
        const sampai = sp.get("sampai") ?? (akhirKeg < hariIni ? akhirKeg : hariIni);
        const tanggal = tanggalValid(mulai) && tanggalValid(sampai) && mulai <= sampai ? rentangTanggal(mulai, sampai).slice(-62) : [];
        let lengkapHariIni = 0,
          kerjaHariIni = 0,
          terlewat = 0,
          belumPilih = 0;
        // (6 Okt 2026) No HP petugas utk tombol "Ingatkan" (buka WhatsApp dgn pesan siap kirim; tidak dikirim
        // otomatis -- keputusan user). Sumber: bencana_petugas.no_hp, cadangan bencana_mitra.no_telp.
        const hpAkun = new Map<number, string>();
        {
          const ids = Array.from(new Set(aktif.map((b) => b.akun_id)));
          const ak = ids.length
            ? await semuaBaris<{ id: number; mitra_id: number | null; petugas_bencana_id: number | null }>((a, z) => db.from("sigap_akun").select("id, mitra_id, petugas_bencana_id").in("id", ids).range(a, z))
            : [];
          const pIds = ak.map((x) => x.petugas_bencana_id).filter((x): x is number => !!x);
          const mIds = ak.map((x) => x.mitra_id).filter((x): x is number => !!x);
          const [pb, mb] = await Promise.all([
            pIds.length ? semuaBaris<{ id: number; no_hp: string | null }>((a, z) => db.from("bencana_petugas").select("id, no_hp").in("id", pIds).range(a, z)) : Promise.resolve([]),
            mIds.length ? semuaBaris<{ id: number; no_telp: string | null }>((a, z) => db.from("bencana_mitra").select("id, no_telp").in("id", mIds).range(a, z)) : Promise.resolve([]),
          ]);
          for (const x of ak) {
            const hp = pb.find((p) => p.id === x.petugas_bencana_id)?.no_hp || mb.find((m) => m.id === x.mitra_id)?.no_telp || "";
            if (hp && String(hp).replace(/\D/g, "").length >= 9) hpAkun.set(x.id, String(hp));
          }
        }
        const rows = aktif.map((b) => {
          const hk = new Set(st.hk.filter((h) => h.penugasan_id === b.id).map((h) => h.tanggal));
          if (hk.size === 0) belumPilih++;
          const status: Record<string, string> = {};
          for (const t of hk) {
            const v = statusHari(realSet.has(`${b.id}|${t}`), st.foto.get(`${b.id}|${t}`) ?? 0, t, hariIni, aturan);
            status[t] = v;
            if (v === "terlewat") terlewat++;
            if (t === hariIni) {
              kerjaHariIni++;
              if (v === "lengkap") lengkapHariIni++;
            }
          }
          const terlewatTanggal = Object.entries(status).filter(([, v]) => v === "terlewat").map(([t]) => t).sort();
          return {
            penugasan_id: b.id,
            nama: b.nama,
            peran: b.peran,
            tujuan: b.st?.tujuan ?? [],
            hari_kerja: hk.size,
            maks: b.maks_efektif,
            lengkap: Object.values(status).filter((v) => v === "lengkap").length,
            status,
            terlewat: terlewatTanggal,
            izin: st.izin.filter((i) => i.penugasan_id === b.id).map((i) => i.tanggal),
            dikunci: !!b.dikunci_at,
            no_hp: hpAkun.get(b.akun_id) ?? null,
          };
        });
        return NextResponse.json({
          kegiatan,
          tanggal,
          hari_ini: hariIni,
          ringkas: { petugas: aktif.length, pml: aktif.filter((b) => b.peran === "pml").length, belum_pilih: belumPilih, kerja_hari_ini: kerjaHariIni, lengkap_hari_ini: lengkapHariIni, terlewat },
          rows,
          boleh_izin: boleh(s.izin, "translok.izin_susulan", "kelola", kegiatanId),
        });
      }

      // verifikasi
      const rows = aktif.map((b) => {
        const hk = st.hk.filter((h) => h.penugasan_id === b.id).map((h) => h.tanggal);
        const izinSet = new Set(st.izin.filter((i) => i.penugasan_id === b.id).map((i) => i.tanggal));
        const dibayar = hk.filter((t) => {
          const v = statusHari(realSet.has(`${b.id}|${t}`), st.foto.get(`${b.id}|${t}`) ?? 0, t, hariIni, aturan);
          return v === "lengkap" || (v !== "terlewat" && t >= hariIni) || izinSet.has(t);
        });
        const kelompok = kelompokTanggal(dibayar);
        const nLap = hk.filter((t) => realSet.has(`${b.id}|${t}`)).length;
        const nDok = hk.filter((t) => (st.foto.get(`${b.id}|${t}`) ?? 0) >= aturan.jumlah_foto).length;
        return {
          penugasan_id: b.id,
          nama: b.nama,
          peran: b.peran,
          hari_kerja: hk.length,
          hari_dibayar: dibayar.length,
          kelompok: kelompok.map((k) => ({ mulai: k.mulai, selesai: k.selesai, jumlah_hari: k.jumlah_hari })),
          nominal: dibayar.length * b.tarif,
          dokumen: { surat_tugas: !!b.st?.ada_file, kwitansi: kelompok.length > 0, visum: kelompok.length > 0, laporan: nLap > 0, dokumentasi: nDok > 0, surat_pernyataan: kelompok.length > 0 },
          belum_selesai: hk.some((t) => t >= hariIni),
          // (10 Okt 2026) semua hari kerja lengkap (laporan bila wajib + foto sesuai aturan kegiatan) -- dipakai "Kunci semua yang lengkap"
          semua_lengkap: hk.length > 0 && hk.every((t) => statusHari(realSet.has(`${b.id}|${t}`), st.foto.get(`${b.id}|${t}`) ?? 0, t, hariIni, aturan) === "lengkap"),
          dikunci_at: b.dikunci_at,
          dikunci_oleh: b.dikunci_oleh,
        };
      });
      return NextResponse.json({ kegiatan, rows, boleh_kelola: perlu("translok.verifikasi", "kelola"), boleh_buka: boleh(s.izin, "translok.buka_kunci", "kelola", kegiatanId) });
    }

    // (6 Okt 2026) Log login & durasi pemakaian -- permintaan user (izin Kelola Peran & Akses: lihat).
    if (bagian === "log_login") {
      if (!boleh(s.izin, "akses.kelola", "lihat")) return galat("Tidak punya izin melihat log login.", 403);
      const akunId = Number(sp.get("akun_id")) || null;
      if (akunId) {
        const { data } = await db.from("sigap_log_sesi").select("id, mulai_at, terakhir_aktif_at, halaman, perangkat, cara").eq("akun_id", akunId).order("mulai_at", { ascending: false }).limit(100);
        return NextResponse.json({ sesi: data ?? [] });
      }
      const hari = Math.min(90, Math.max(1, Number(sp.get("hari")) || 30));
      const sejak = new Date(Date.now() - hari * 86_400_000).toISOString();
      const log = await semuaBaris<{ akun_id: number; mulai_at: string; terakhir_aktif_at: string; perangkat: string | null; halaman: string | null }>((a, b) =>
        db.from("sigap_log_sesi").select("akun_id, mulai_at, terakhir_aktif_at, perangkat, halaman").gte("terakhir_aktif_at", sejak).order("id").range(a, b)
      );
      const ids = Array.from(new Set(log.map((x) => x.akun_id)));
      const akun = ids.length ? await semuaBaris<{ id: number; nama: string; jenis: string; terakhir_masuk_at: string | null }>((a, b) => db.from("sigap_akun").select("id, nama, jenis, terakhir_masuk_at").in("id", ids).range(a, b)) : [];
      const pen = ids.length ? await semuaBaris<{ akun_id: number; peran: string; kegiatan_id: number }>((a, b) => db.from("sigap_penugasan").select("akun_id, peran, kegiatan_id").in("akun_id", ids).eq("aktif", true).range(a, b)) : [];
      const tujuhHari = Date.now() - 7 * 86_400_000;
      const rows = ids.map((id) => {
        const l = log.filter((x) => x.akun_id === id).sort((a, b) => b.terakhir_aktif_at.localeCompare(a.terakhir_aktif_at));
        const dur = (x: { mulai_at: string; terakhir_aktif_at: string }) => Math.max(0, Date.parse(x.terakhir_aktif_at) - Date.parse(x.mulai_at)) / 1000;
        const a = akun.find((x) => x.id === id);
        return {
          akun_id: id,
          nama: a?.nama ?? "?",
          jenis: a?.jenis ?? "",
          peran: Array.from(new Set(pen.filter((p) => p.akun_id === id).map((p) => p.peran.toUpperCase()))),
          terakhir_masuk: a?.terakhir_masuk_at ?? null,
          terakhir_aktif: l[0]?.terakhir_aktif_at ?? null,
          durasi_terakhir_detik: l[0] ? Math.round(dur(l[0])) : 0,
          jumlah_sesi: l.length,
          total_detik: Math.round(l.reduce((t, x) => t + dur(x), 0)),
          total_7hari_detik: Math.round(l.filter((x) => Date.parse(x.terakhir_aktif_at) >= tujuhHari).reduce((t, x) => t + dur(x), 0)),
          perangkat: l[0]?.perangkat ?? null,
          halaman: l[0]?.halaman ?? null,
        };
      });
      rows.sort((x, y) => (y.terakhir_aktif ?? "").localeCompare(x.terakhir_aktif ?? ""));
      return NextResponse.json({ hari, rows });
    }

    if (bagian === "akses" || bagian === "riwayat") {
      if (!boleh(s.izin, "akses.kelola", "lihat")) return galat("Tidak punya izin Kelola Peran & Akses.", 403);
      if (bagian === "riwayat") {
        const { data } = await db.from("sigap_audit").select("id, akun_id, aksi, detail, waktu").order("waktu", { ascending: false }).limit(200);
        const ids = Array.from(new Set((data ?? []).map((x) => x.akun_id).filter(Boolean)));
        const { data: ak } = ids.length ? await db.from("sigap_akun").select("id, nama").in("id", ids) : { data: [] };
        return NextResponse.json({ riwayat: (data ?? []).map((x) => ({ ...x, oleh: (ak ?? []).find((a) => a.id === x.akun_id)?.nama ?? "-" })) });
      }
      const [{ data: peran }, { data: menu }, { data: izin }, { data: ap }, { data: keg }] = await Promise.all([
        db.from("sigap_peran").select("id, kode, nama, keterangan, butuh_lingkup, sistem").order("id"),
        db.from("sigap_menu").select("kode, portal, nama, keterangan, urutan").eq("aktif", true).order("urutan"),
        db.from("sigap_peran_izin").select("peran_id, menu_kode, level"),
        db.from("sigap_akun_peran").select("id, akun_id, peran_id, kegiatan_id, diberi_oleh, dibuat_at").order("id"),
        db.from("sigap_kegiatan").select("id, nama").order("id"),
      ]);
      const ids = Array.from(new Set((ap ?? []).map((x) => x.akun_id)));
      const { data: ak } = ids.length ? await db.from("sigap_akun").select("id, nama, jenis").in("id", ids) : { data: [] };
      return NextResponse.json({
        peran: peran ?? [],
        menu: menu ?? [],
        izin: izin ?? [],
        akun_peran: (ap ?? []).map((x) => ({ ...x, nama: (ak ?? []).find((a) => a.id === x.akun_id)?.nama ?? "?" })),
        kegiatan: keg ?? [],
        boleh_kelola: boleh(s.izin, "akses.kelola", "kelola"),
      });
    }

    return galat("Bagian tidak dikenal.");
  } catch (err) {
    return galat(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga", 500);
  }
}

// ======================================================================
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const body = await req.json().catch(() => null);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const aksi = String(body?.aksi ?? "");
    const oleh = `${s.nama} (#${s.akunId})`;
    const audit = (detail: Record<string, unknown>) => catatAudit(db, s.akunId, aksi, detail);
    const kegDariPen = async (penId: number) => {
      const { data } = await db.from("sigap_penugasan").select("id, kegiatan_id, akun_id, surat_tugas_id, dikunci_at").eq("id", penId).maybeSingle();
      return data as { id: number; kegiatan_id: number; akun_id: number; surat_tugas_id: number | null; dikunci_at: string | null } | null;
    };

    // ---------------- Izin susulan ----------------
    if (aksi === "izin_susulan") {
      const pen = await kegDariPen(Number(body?.penugasan_id));
      if (!pen) return galat("Penugasan tidak ditemukan.", 404);
      if (!boleh(s.izin, "translok.izin_susulan", "kelola", pen.kegiatan_id)) return galat("Tidak punya izin memberi izin susulan.", 403);
      const tanggal = body?.tanggal;
      if (!tanggalValid(tanggal) || tanggal >= hariIniWib()) return galat("Izin susulan hanya untuk tanggal yang sudah lewat.");
      const alasan = String(body?.alasan ?? "").trim();
      if (alasan.length < 5) return galat("Alasan wajib diisi (minimal 5 karakter).");
      const { data: hk } = await db.from("sigap_hari_kerja").select("id").eq("penugasan_id", pen.id).eq("tanggal", tanggal).or(HK_AKTIF()).maybeSingle();
      if (!hk) return galat("Tanggal itu bukan hari kerja petugas ini.");
      const tglSampai = body?.sampai === "besok" ? new Date(Date.now() + 86_400_000) : new Date();
      const sampai = new Date(`${hariIniWib(tglSampai)}T23:59:59.999+07:00`).toISOString();
      const { error } = await db.from("sigap_izin_susulan").insert({ penugasan_id: pen.id, kegiatan_id: pen.kegiatan_id, tanggal, alasan, diberikan_oleh: oleh, diberikan_at: new Date().toISOString(), berlaku_sampai: sampai });
      if (error) return galat(error.message, 500);
      await audit({ penugasan_id: pen.id, tanggal, alasan, berlaku_sampai: sampai });
      return NextResponse.json({ ok: true, berlaku_sampai: sampai });
    }

    // ---------------- Penugasan ----------------
    if (aksi === "tambah_penugasan") {
      const kegiatanId = Number(body?.kegiatan_id);
      if (!boleh(s.izin, "translok.penugasan", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola penugasan.", 403);
      const akunId = Number(body?.akun_id);
      const peran = String(body?.peran ?? "").trim();
      const { data: t } = await db.from("sigap_kegiatan_tarif").select("id").eq("kegiatan_id", kegiatanId).eq("peran", peran).maybeSingle();
      if (!t) return galat("Peran belum terdaftar di kegiatan ini (atur di menu Kegiatan & Tarif).");
      const maks = body?.maks_hari == null || body?.maks_hari === "" ? null : Number(body.maks_hari);
      if (maks !== null && (!Number.isInteger(maks) || maks < 1)) return galat("Maks hari tidak valid.");
      const { data, error } = await db
        .from("sigap_penugasan")
        .upsert({ kegiatan_id: kegiatanId, akun_id: akunId, peran, maks_hari: maks, aktif: true, sumber: `admin:${s.akunId}` }, { onConflict: "kegiatan_id,akun_id" })
        .select("id")
        .single();
      if (error) return galat(error.message, 500);
      await audit({ kegiatan_id: kegiatanId, akun_id: akunId, peran, maks_hari: maks, penugasan_id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (aksi === "ubah_penugasan") {
      const pen = await kegDariPen(Number(body?.penugasan_id));
      if (!pen) return galat("Penugasan tidak ditemukan.", 404);
      if (!boleh(s.izin, "translok.penugasan", "kelola", pen.kegiatan_id)) return galat("Tidak punya izin mengelola penugasan.", 403);
      const ubah: Record<string, unknown> = {};
      if (typeof body?.peran === "string" && body.peran.trim()) ubah.peran = body.peran.trim();
      if ("maks_hari" in (body ?? {})) {
        const m = body.maks_hari == null || body.maks_hari === "" ? null : Number(body.maks_hari);
        if (m !== null && (!Number.isInteger(m) || m < 1)) return galat("Maks hari tidak valid.");
        ubah.maks_hari = m;
      }
      if (typeof body?.aktif === "boolean") ubah.aktif = body.aktif;
      const { error } = await db.from("sigap_penugasan").update(ubah).eq("id", pen.id);
      if (error) return galat(error.message, 500);
      await audit({ penugasan_id: pen.id, ...ubah });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_st") {
      const pen = await kegDariPen(Number(body?.penugasan_id));
      if (!pen) return galat("Penugasan tidak ditemukan.", 404);
      if (!boleh(s.izin, "translok.penugasan", "kelola", pen.kegiatan_id)) return galat("Tidak punya izin mengelola Surat Tugas.", 403);
      const nomor = String(body?.nomor_st ?? "").trim();
      if (!nomor) return galat("Nomor ST wajib diisi.");
      const tg = (k: string) => (tanggalValid(body?.[k]) ? (body[k] as string) : null);
      const tujuan = (Array.isArray(body?.tujuan) ? body.tujuan : String(body?.tujuan ?? "").split(","))
        .map((x: unknown) => String(x).trim())
        .filter(Boolean)
        .slice(0, 20);
      const isi = { kegiatan_id: pen.kegiatan_id, penugasan_id: pen.id, nomor_st: nomor, tanggal_st: tg("tanggal_st"), tanggal_mulai: tg("tanggal_mulai"), tanggal_selesai: tg("tanggal_selesai"), tujuan };
      let stId = pen.surat_tugas_id;
      if (stId) {
        const { error } = await db.from("sigap_surat_tugas").update(isi).eq("id", stId);
        if (error) return galat(error.message.includes("nomor") ? "Nomor ST sudah dipakai." : error.message, 400);
      } else {
        const { data, error } = await db.from("sigap_surat_tugas").insert(isi).select("id").single();
        if (error) return galat(error.message.includes("duplicate") ? "Nomor ST sudah dipakai." : error.message, 400);
        stId = data.id as number;
        await db.from("sigap_penugasan").update({ surat_tugas_id: stId }).eq("id", pen.id);
      }
      await audit({ ...isi }); // (5 Okt 2026) isi sudah memuat penugasan_id (hindari TS2783)
      return NextResponse.json({ ok: true, surat_tugas_id: stId });
    }

    // ---------------- Kegiatan & tarif ----------------
    if (aksi === "simpan_kegiatan") {
      const id = Number(body?.id) || null;
      if (!boleh(s.izin, "translok.kegiatan", "kelola", id)) return galat("Tidak punya izin mengelola kegiatan.", 403);
      if (!id && lingkup(s.izin, "translok.kegiatan") !== "semua") return galat("Membuat kegiatan baru hanya untuk admin dengan lingkup semua kegiatan.", 403);
      const nama = String(body?.nama ?? "").trim();
      if (!nama) return galat("Nama kegiatan wajib diisi.");
      const tg = (k: string) => (tanggalValid(body?.[k]) ? (body[k] as string) : null);
      const isi: Record<string, unknown> = {
        nama,
        kode_anggaran: String(body?.kode_anggaran ?? "").trim() || null,
        tanggal_mulai: tg("tanggal_mulai"),
        tanggal_selesai: tg("tanggal_selesai"),
        satuan_realisasi: String(body?.satuan_realisasi ?? "").trim() || "ruta",
        aktif: body?.aktif !== false,
      };
      // (7 Okt 2026) jenis kegiatan & aturan isian (wajib laporan, jumlah foto) -- hanya bila dikirim
      if (body?.jenis !== undefined || body?.wajib_laporan !== undefined || body?.jumlah_foto !== undefined) {
        const a = aturanDari({ jenis: body?.jenis, wajib_laporan: body?.wajib_laporan, jumlah_foto: body?.jumlah_foto });
        isi.jenis = a.jenis;
        isi.wajib_laporan = a.wajib_laporan;
        isi.jumlah_foto = a.jumlah_foto;
      }
      if (isi.tanggal_mulai && isi.tanggal_selesai && (isi.tanggal_mulai as string) > (isi.tanggal_selesai as string)) return galat("Tanggal mulai melewati tanggal selesai.");
      if (id) {
        const { error } = await db.from("sigap_kegiatan").update(isi).eq("id", id);
        if (error) return galat(error.message, 500);
        await audit({ kegiatan_id: id, ...isi });
        return NextResponse.json({ ok: true, id });
      }
      const kode =
        String(body?.kode ?? "").trim() ||
        nama
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "")
          .slice(0, 40);
      const { data, error } = await db.from("sigap_kegiatan").insert({ ...isi, kode }).select("id").single();
      if (error) return galat(error.message.includes("duplicate") ? "Kode kegiatan sudah dipakai." : error.message, 400);
      await audit({ kegiatan_id: data.id, kode, ...isi });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (aksi === "simpan_tarif") {
      const kegiatanId = Number(body?.kegiatan_id);
      if (!boleh(s.izin, "translok.kegiatan", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola tarif.", 403);
      const peran = String(body?.peran ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_");
      if (!peran) return galat("Kode peran wajib diisi (mis. ppl, pml, koseka).");
      const tarif = Number(body?.tarif);
      if (!Number.isFinite(tarif) || tarif < 0) return galat("Tarif tidak valid.");
      const maks = body?.maks_hari_default == null || body?.maks_hari_default === "" ? null : Number(body.maks_hari_default);
      if (maks !== null && (!Number.isInteger(maks) || maks < 1)) return galat("Maks hari tidak valid.");
      const isi = {
        kegiatan_id: kegiatanId,
        peran,
        tarif,
        label_jabatan: String(body?.label_jabatan ?? "").trim() || peran.toUpperCase(),
        uraian_detail: String(body?.uraian_detail ?? "").trim() || null,
        maks_hari_default: maks,
      };
      const { error } = await db.from("sigap_kegiatan_tarif").upsert(isi, { onConflict: "kegiatan_id,peran" });
      if (error) return galat(error.message, 500);
      await audit(isi);
      return NextResponse.json({ ok: true });
    }

    // ---------------- Verifikasi & kunci ----------------
    if (aksi === "kunci" || aksi === "buka_kunci") {
      const pen = await kegDariPen(Number(body?.penugasan_id));
      if (!pen) return galat("Penugasan tidak ditemukan.", 404);
      if (aksi === "kunci") {
        if (!boleh(s.izin, "translok.verifikasi", "kelola", pen.kegiatan_id)) return galat("Tidak punya izin verifikasi.", 403);
        if (pen.dikunci_at) return galat("SPJ sudah dikunci.");
        const { error } = await db.from("sigap_penugasan").update({ dikunci_at: new Date().toISOString(), dikunci_oleh: oleh }).eq("id", pen.id);
        if (error) return galat(error.message, 500);
        // Bekukan PDF (Kwitansi/Visum/Surat Pernyataan dst.) bila generator dokumen tersedia.
        let beku: unknown = null;
        try {
          const mod = (await import("@/lib/sigapDokumen")) as { bekukanSpj?: (db: Db, penugasanId: number, oleh: string) => Promise<unknown> };
          if (mod.bekukanSpj) beku = await mod.bekukanSpj(db, pen.id, oleh);
        } catch (e) {
          beku = { error: e instanceof Error ? e.message : String(e) };
        }
        await audit({ penugasan_id: pen.id, beku });
        return NextResponse.json({ ok: true, beku });
      }
      if (!boleh(s.izin, "translok.buka_kunci", "kelola", pen.kegiatan_id)) return galat("Tidak punya izin membuka kunci.", 403);
      const alasan = String(body?.alasan ?? "").trim();
      if (alasan.length < 5) return galat("Alasan membuka kunci wajib diisi.");
      const { error } = await db.from("sigap_penugasan").update({ dikunci_at: null, dikunci_oleh: null, dibuka_at: new Date().toISOString(), dibuka_oleh: oleh }).eq("id", pen.id);
      if (error) return galat(error.message, 500);
      await audit({ penugasan_id: pen.id, alasan });
      return NextResponse.json({ ok: true });
    }

    // ---------------- (7 Okt 2026) Reset PIN -> PIN sementara (tampil sekali) ----------------
    if (aksi === "reset_pin") {
      if (!(boleh(s.izin, "akses.kelola", "kelola") || boleh(s.izin, "translok.penugasan", "kelola") || boleh(s.izin, "portal.kelola", "kelola"))) return galat("Tidak punya izin mereset PIN.", 403);
      const r = await resetPinOlehAdmin(db, { akunId: s.akunId, nama: s.nama, adminAplikasi: boleh(s.izin, "portal.kelola", "kelola") }, Number(body?.akun_id));
      if (!r.ok) return galat(r.error, r.status);
      return NextResponse.json({ ok: true, pin: r.pin, nama: r.nama, sampai: r.sampai, hp: r.hp });
    }

    // ---------------- Kelola Peran & Akses ----------------
    if (["buat_peran", "simpan_izin", "beri_peran", "cabut_peran"].includes(aksi)) {
      if (!boleh(s.izin, "akses.kelola", "kelola")) return galat("Tidak punya izin Kelola Peran & Akses.", 403);

      if (aksi === "buat_peran") {
        const nama = String(body?.nama ?? "").trim();
        if (!nama) return galat("Nama peran wajib diisi.");
        const kode =
          String(body?.kode ?? "").trim() ||
          nama
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
        const isi = { kode, nama, keterangan: String(body?.keterangan ?? "").trim() || null, butuh_lingkup: !!body?.butuh_lingkup };
        const id = Number(body?.id) || null;
        const q = id ? db.from("sigap_peran").update({ nama: isi.nama, keterangan: isi.keterangan, butuh_lingkup: isi.butuh_lingkup }).eq("id", id) : db.from("sigap_peran").insert(isi);
        const { error } = await q;
        if (error) return galat(error.message.includes("duplicate") ? "Kode peran sudah ada." : error.message, 400);
        await audit({ id, ...isi });
        return NextResponse.json({ ok: true });
      }

      if (aksi === "simpan_izin") {
        const peranId = Number(body?.peran_id);
        const menu = String(body?.menu_kode ?? "");
        const level = body?.level === "kelola" || body?.level === "lihat" ? (body.level as string) : null;
        const { data: p } = await db.from("sigap_peran").select("kode").eq("id", peranId).maybeSingle();
        if (!p) return galat("Peran tidak ditemukan.", 404);
        if (PERAN_KHUSUS_ADMIN_APLIKASI.includes(p.kode as string) && !boleh(s.izin, "portal.kelola", "kelola")) return galat("Izin peran admin aplikasi hanya dapat diubah Admin Aplikasi.", 403);
        // Pengaman: admin anggaran harus tetap bisa mengelola akses (agar sistem tidak terkunci).
        if (p.kode === "admin_anggaran" && menu === "akses.kelola" && level !== "kelola") return galat("Izin Kelola Akses untuk Admin Anggaran tidak bisa dicabut.");
        if (level) {
          const { error } = await db.from("sigap_peran_izin").upsert({ peran_id: peranId, menu_kode: menu, level }, { onConflict: "peran_id,menu_kode" });
          if (error) return galat(error.message, 500);
        } else {
          const { error } = await db.from("sigap_peran_izin").delete().eq("peran_id", peranId).eq("menu_kode", menu);
          if (error) return galat(error.message, 500);
        }
        await audit({ peran_id: peranId, peran: p.kode, menu, level: level ?? "tidak ada" });
        return NextResponse.json({ ok: true });
      }

      if (aksi === "beri_peran") {
        const akunId = Number(body?.akun_id);
        const peranId = Number(body?.peran_id);
        const kegiatanId = Number(body?.kegiatan_id) || null;
        const { data: p } = await db.from("sigap_peran").select("kode, butuh_lingkup").eq("id", peranId).maybeSingle();
        if (!p) return galat("Peran tidak ditemukan.", 404);
        if (PERAN_KHUSUS_ADMIN_APLIKASI.includes(p.kode as string) && !boleh(s.izin, "portal.kelola", "kelola")) return galat("Peran admin aplikasi hanya dapat diberikan Admin Aplikasi.", 403);
        if (p.butuh_lingkup && !kegiatanId) return galat("Peran ini perlu dipilih kegiatannya.");
        const { error } = await db.from("sigap_akun_peran").insert({ akun_id: akunId, peran_id: peranId, kegiatan_id: kegiatanId, diberi_oleh: oleh });
        if (error) return galat(error.message.includes("duplicate") ? "Akun sudah punya peran ini." : error.message, 400);
        await audit({ akun_id: akunId, peran: p.kode, kegiatan_id: kegiatanId });
        return NextResponse.json({ ok: true });
      }

      if (aksi === "cabut_peran") {
        const id = Number(body?.akun_peran_id);
        const { data: x } = await db.from("sigap_akun_peran").select("id, akun_id, peran_id, kegiatan_id").eq("id", id).maybeSingle();
        if (!x) return galat("Data tidak ditemukan.", 404);
        const { data: p } = await db.from("sigap_peran").select("kode").eq("id", x.peran_id).maybeSingle();
        if (PERAN_KHUSUS_ADMIN_APLIKASI.includes((p?.kode as string) ?? "") && !boleh(s.izin, "portal.kelola", "kelola")) return galat("Peran admin aplikasi hanya dapat dicabut Admin Aplikasi.", 403);
        if (p?.kode === "admin_aplikasi") {
          const { count } = await db.from("sigap_akun_peran").select("id", { count: "exact", head: true }).eq("peran_id", x.peran_id);
          if ((count ?? 0) <= 1) return galat("Admin Aplikasi minimal harus 1 orang.");
        }
        if (p?.kode === "admin_anggaran") {
          const { count } = await db.from("sigap_akun_peran").select("id", { count: "exact", head: true }).eq("peran_id", x.peran_id);
          if ((count ?? 0) <= 1) return galat("Admin anggaran terakhir tidak bisa dicabut, supaya sistem tidak terkunci.");
        }
        const { error } = await db.from("sigap_akun_peran").delete().eq("id", id);
        if (error) return galat(error.message, 500);
        await audit({ akun_id: x.akun_id, peran: p?.kode, kegiatan_id: x.kegiatan_id });
        return NextResponse.json({ ok: true });
      }
    }

    return galat("Aksi tidak dikenal.");
  } catch (err) {
    return galat(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga", 500);
  }
}
