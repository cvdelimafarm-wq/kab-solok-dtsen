// app/api/sigap/pelatihan/agenda/kelola/route.ts
//
// (9 Nov 2026) SIGAP > Kelola Pelatihan > Hari H > Agenda sesi: panitia/admin mengatur sesi tes mana yang DIMULAI INSTRUKTUR per kelas.
// Izin menu `pelatihan.kelola` (lihat = melihat; kelola = mengubah). Tombol Mulai/Selesai tetap milik instruktur kelas (/api/sigap/pelatihan/agenda).
//
//   GET                                                   -> { boleh_kelola, sekarang, kelas[{nomor,nama,instruktur[]}], tes[{id,jenis,judul,jumlah_soal,durasi_menit}], sesi[{...}] }
//   POST { aksi:"atur",  tes_id, kelas, jendela_menit }   -> buat/ubah baris agenda (jendela saja; waktu mulai tidak disentuh)
//   POST { aksi:"lepas", tes_id, kelas }                  -> hapus baris (kembali berjadwal biasa); DITOLAK bila sesi sudah dimulai
//   POST { aksi:"pasang_semua", jendela_menit? }          -> buat baris untuk semua kelas x tes bersoal yang belum punya (yang ada tidak diubah)
// Tabel sigap_agenda_sesi belum ada = GET mengembalikan ada_tabel:false (kartu menampilkan petunjuk), POST gagal dengan pesan jelas.

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, jumlahSoal, muatTesDaftar } from "@/lib/sigapTesDb";
import { kelasTersedia, muatInstruktur } from "@/lib/sigapInstrukturDb";
import { muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";
import { JENDELA_BAWAAN_MENIT, KOLOM_AGENDA, agendaBelumDiatur, jendelaSah, statusAgenda, tutupJendela } from "@/lib/sigapAgenda";
import { bacaBarisAgenda } from "@/lib/sigapAgendaDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db, req);
  if (!kegiatanId) return { err: galat("Kegiatan pelatihan belum dibuat.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db: db as Db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

async function susun(db: Db, kegiatanId: number, bisaKelola: boolean) {
  const sekarang = new Date();
  const instruktur = await muatInstruktur(db, kegiatanId);
  const nomorKelas = await kelasTersedia(db, kegiatanId, instruktur);
  const master = await muatKelasKegiatan(db, kegiatanId);
  const namaKelas = new Map(master.map((k) => [k.nomor, k.nama]));
  const tes = await muatTesDaftar(db, kegiatanId);
  const soal = await jumlahSoal(db, tes.map((t) => t.id));
  const { data, error } = await db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("kegiatan_id", kegiatanId).limit(500);
  const adaTabel = !error;
  const baris = adaTabel ? ((data ?? []) as unknown[]).map(bacaBarisAgenda) : [];
  const urutan = (j: string) => (j === "pretest" ? 0 : j === "posttest" ? 1 : 2);
  const daftarTes = tes
    .map((t) => ({ id: t.id, jenis: t.jenis as string, judul: t.judul as string, jumlah_soal: soal.get(t.id) ?? 0, durasi_menit: t.durasi_menit as number }))
    .sort((a, b) => urutan(a.jenis) - urutan(b.jenis));
  const jenisDariId = new Map(daftarTes.map((t) => [t.id, t.jenis]));
  return {
    ada_tabel: adaTabel,
    boleh_kelola: bisaKelola,
    sekarang: sekarang.toISOString(),
    jendela_bawaan: JENDELA_BAWAAN_MENIT,
    kelas: nomorKelas.map((n) => ({
      nomor: n,
      nama: namaKelas.get(n) || `Kelas ${n}`,
      instruktur: instruktur.filter((i) => i.kelas === n).map((i) => ({ akun_id: i.akun_id, nama: i.nama })),
    })),
    tes: daftarTes,
    sesi: baris
      .filter((b) => jenisDariId.has(b.tes_id))
      .map((b) => ({
        id: b.id,
        tes_id: b.tes_id,
        kelas: b.kelas,
        jendela_menit: b.jendela_menit,
        status: statusAgenda(b, sekarang),
        mulai_at: b.mulai_at,
        tutup_at: tutupJendela(b),
      })),
    belum_diatur: agendaBelumDiatur(daftarTes, nomorKelas, baris.filter((b) => jenisDariId.has(b.tes_id)).map((b) => ({ jenis: jenisDariId.get(b.tes_id) as string, kelas: b.kelas }))),
  };
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    return NextResponse.json(await susun(p.db, p.kegiatanId, p.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Hanya pengelola yang dapat mengubah agenda sesi.", 403);
    const body = (await req.json().catch(() => null)) as { aksi?: unknown; tes_id?: unknown; kelas?: unknown; jendela_menit?: unknown } | null;
    if (!body) return galat("Permintaan tidak valid.");
    const { db, kegiatanId } = p;

    const cek = await db.from("sigap_agenda_sesi").select("id").eq("kegiatan_id", kegiatanId).limit(1);
    if (cek.error) return galat("Tabel agenda belum dibuat. Jalankan SQL 20261109a_agenda_sesi.sql lebih dulu.", 409);

    const tes = await muatTesDaftar(db, kegiatanId);
    const instruktur = await muatInstruktur(db, kegiatanId);
    const nomorKelas = await kelasTersedia(db, kegiatanId, instruktur);
    const iso = new Date().toISOString();

    if (body.aksi === "atur" || body.aksi === "lepas") {
      const tesId = Number(body.tes_id);
      const kelas = Number(body.kelas);
      if (!tes.some((t) => t.id === tesId)) return galat("Tes tidak ditemukan di pelatihan ini.", 404);
      if (!nomorKelas.includes(kelas)) return galat("Kelas tidak ditemukan di pelatihan ini.", 404);

      if (body.aksi === "atur") {
        const jendela = jendelaSah(body.jendela_menit);
        if (jendela === null) return galat("Jendela mulai harus bilangan bulat 1 sampai 480 menit.");
        const { error } = await db.from("sigap_agenda_sesi").upsert({ kegiatan_id: kegiatanId, kelas, tes_id: tesId, jendela_menit: jendela, diubah_at: iso }, { onConflict: "tes_id,kelas" });
        if (error) return galat(error.message, 500);
        await catatAudit(db, p.akun.id, "pelatihan_agenda_atur", { kegiatan_id: kegiatanId, tes_id: tesId, kelas, jendela_menit: jendela });
      } else {
        const { data } = await db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("tes_id", tesId).eq("kelas", kelas).limit(1).maybeSingle();
        if (data) {
          const b = bacaBarisAgenda(data);
          if (b.mulai_at) return galat("Sesi ini sudah pernah dimulai, tidak bisa dilepas. Biarkan instruktur menyelesaikannya.", 409);
          const { error } = await db.from("sigap_agenda_sesi").delete().eq("id", b.id).is("mulai_at", null);
          if (error) return galat(error.message, 500);
          await catatAudit(db, p.akun.id, "pelatihan_agenda_lepas", { kegiatan_id: kegiatanId, tes_id: tesId, kelas });
        }
      }
    } else if (body.aksi === "pasang_semua") {
      const jendela = body.jendela_menit === undefined || body.jendela_menit === null ? JENDELA_BAWAAN_MENIT : jendelaSah(body.jendela_menit);
      if (jendela === null) return galat("Jendela mulai harus bilangan bulat 1 sampai 480 menit.");
      const soal = await jumlahSoal(db, tes.map((t) => t.id));
      const { data } = await db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("kegiatan_id", kegiatanId).limit(500);
      const ada = ((data ?? []) as unknown[]).map(bacaBarisAgenda);
      const jenisDariId = new Map(tes.map((t) => [t.id, t.jenis as string]));
      const belum = agendaBelumDiatur(
        tes.map((t) => ({ jenis: t.jenis as string, jumlah_soal: soal.get(t.id) ?? 0 })),
        nomorKelas,
        ada.filter((b) => jenisDariId.has(b.tes_id)).map((b) => ({ jenis: jenisDariId.get(b.tes_id) as string, kelas: b.kelas }))
      );
      const idTes = new Map(tes.map((t) => [t.jenis as string, t.id]));
      const baru = belum.map((b) => ({ kegiatan_id: kegiatanId, kelas: b.kelas, tes_id: idTes.get(b.jenis) as number, jendela_menit: jendela, diubah_at: iso }));
      if (baru.length) {
        const { error } = await db.from("sigap_agenda_sesi").upsert(baru, { onConflict: "tes_id,kelas", ignoreDuplicates: true });
        if (error) return galat(error.message, 500);
        await catatAudit(db, p.akun.id, "pelatihan_agenda_pasang_semua", { kegiatan_id: kegiatanId, jumlah: baru.length, jendela_menit: jendela });
      }
    } else {
      return galat("Aksi tidak dikenal.");
    }
    return NextResponse.json(await susun(db, kegiatanId, true));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
