// app/api/sigap/pelatihan/pengaturan-kelas/route.ts
//
// (8 Nov 2026) Kelola Pelatihan > Tim & Peserta > Pengaturan kelas: jumlah/nama/kuota kelas, siapa masuk kelas mana, instruktur per kelas (dibaca; ditetapkan lewat
// /api/sigap/pelatihan/instruktur), dan panitia (dibaca; ditetapkan di Pengelolaan > Peran dan akses). Izin menu `pelatihan.kelola` (lihat untuk membaca, kelola untuk mengubah).
//
// GET                -> { kegiatan_id, nama, kelas[{nomor,nama,kuota,peserta,instruktur[]}], peserta[], tanpa_kelas, instruktur[], panitia[], maks, boleh_kelola }
// GET ?ringkas=1     -> { kelas[{nomor,nama,kuota}] }  (untuk filter kelas di Monitoring)
// GET ?cari=kata     -> { akun[{id,nama,jenis,sebagai[]}] }  (cari akun untuk dilibatkan; `sebagai` = keterlibatan saat ini)
// POST {aksi:"tambah_kelas", nama?} | {aksi:"ubah_kelas", nomor, nama, kuota} | {aksi:"hapus_kelas", nomor} | {aksi:"atur_jumlah", jumlah}
//      {aksi:"libatkan", sebagai:"peserta"|"instruktur"|"panitia", akun_id, peran?, kelas?} | {aksi:"keluarkan", sebagai, penugasan_id|akun_id|akun_peran_id}
//      {aksi:"pindah_peserta", penugasan_ids[], kelas|null} | {aksi:"masukkan_semua", kelas} | {aksi:"bagi_rata"}  -> { ok, ... }

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { bersihkanCache } from "@/lib/sigapKuisDb";
import { lepasInstruktur, muatInstruktur, tetapkanInstruktur } from "@/lib/sigapInstrukturDb";
import { KELAS_MAKS, aturJumlahKelas, bagiRataPeserta, cabutPanitia, cariAkunLibat, hapusKelas, keluarkanPeserta, libatkanPeserta, peranPesertaKegiatan, tambahPanitia, masukkanBelumBerkelas, muatKelasKegiatan, muatPanitia, muatPesertaKelas, nomorKelasSah, pindahkanPesertaKelas, tambahKelas, ubahKelas } from "@/lib/sigapKelasKegiatan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db, req);
  if (!kegiatanId) return { err: galat("Pelatihan tidak ditemukan.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), adminAplikasi: boleh(izin, "portal.kelola", "kelola") } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (req.nextUrl.searchParams.has("cari")) {
      if (!p.bisaKelola) return galat("Tidak punya izin melibatkan orang di pelatihan ini.", 403);
      return NextResponse.json({ akun: await cariAkunLibat(p.db, p.kegiatanId, req.nextUrl.searchParams.get("cari") ?? "") });
    }
    const kelas = await muatKelasKegiatan(p.db, p.kegiatanId);
    if (req.nextUrl.searchParams.get("ringkas") === "1") return NextResponse.json({ kelas: kelas.map(({ nomor, nama, kuota }) => ({ nomor, nama, kuota })) });

    const [peserta, instruktur, panitia, peranPeserta, { data: keg }] = await Promise.all([
      muatPesertaKelas(p.db, p.kegiatanId),
      muatInstruktur(p.db, p.kegiatanId),
      muatPanitia(p.db, p.kegiatanId),
      peranPesertaKegiatan(p.db, p.kegiatanId),
      p.db.from("sigap_kegiatan").select("nama").eq("id", p.kegiatanId).maybeSingle(),
    ]);
    const nomorAda = new Set(kelas.map((k) => k.nomor));
    return NextResponse.json({
      kegiatan_id: p.kegiatanId,
      nama: (keg as { nama?: string } | null)?.nama ?? "",
      kelas: kelas.map((k) => ({ ...k, peserta: peserta.filter((x) => x.kelas === k.nomor).length, instruktur: instruktur.filter((i) => i.kelas === k.nomor).map((i) => ({ akun_id: i.akun_id, nama: i.nama })) })),
      peserta,
      tanpa_kelas: peserta.filter((x) => x.kelas == null || !nomorAda.has(x.kelas)).length,
      instruktur,
      panitia,
      peran_peserta: peranPeserta,
      maks: KELAS_MAKS,
      boleh_kelola: p.bisaKelola,
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengatur kelas.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return galat("Permintaan tidak valid.");
    const aksi = String(body.aksi ?? "");
    const { db, kegiatanId } = p;
    const audit = (a: string, d: Record<string, unknown>) => catatAudit(db, p.akun.id, a, { kegiatan_id: kegiatanId, ...d });
    // kelas/ruang/akses peserta di-cache beberapa detik; setelah perubahan kelas, buang supaya Adu Sigap langsung mengikuti
    const segarkan = () => {
      bersihkanCache("akses:");
      bersihkanCache("ruang:");
    };

    if (aksi === "tambah_kelas") {
      const h = await tambahKelas(db, kegiatanId, body.nama);
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_tambah", { nomor: h.nomor });
      return NextResponse.json({ ok: true, nomor: h.nomor });
    }
    if (aksi === "ubah_kelas") {
      const nomor = Number(body.nomor);
      if (!nomorKelasSah(nomor)) return galat("Nomor kelas tidak sah.");
      const h = await ubahKelas(db, kegiatanId, nomor, body.nama, body.kuota);
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_ubah", { nomor, nama: body.nama, kuota: body.kuota ?? null });
      return NextResponse.json({ ok: true });
    }
    if (aksi === "hapus_kelas") {
      const nomor = Number(body.nomor);
      const h = await hapusKelas(db, kegiatanId, nomor);
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_hapus", { nomor });
      return NextResponse.json({ ok: true });
    }
    if (aksi === "atur_jumlah") {
      const h = await aturJumlahKelas(db, kegiatanId, Number(body.jumlah));
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_jumlah", { jumlah: h.jumlah });
      return NextResponse.json({ ok: true, jumlah: h.jumlah });
    }
    if (aksi === "pindah_peserta") {
      const ids = Array.isArray(body.penugasan_ids) ? (body.penugasan_ids as unknown[]).map(Number) : [];
      const kelas = body.kelas === null || body.kelas === "" || body.kelas === undefined ? null : Number(body.kelas);
      if (kelas !== null && !nomorKelasSah(kelas)) return galat("Kelas tujuan tidak sah.");
      const h = await pindahkanPesertaKelas(db, kegiatanId, ids, kelas);
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_pindah_peserta", { kelas, penugasan_ids: ids.slice(0, 200), berubah: h.berubah });
      return NextResponse.json({ ok: true, berubah: h.berubah });
    }
    if (aksi === "masukkan_semua") {
      const kelas = Number(body.kelas);
      if (!nomorKelasSah(kelas)) return galat("Kelas tujuan tidak sah.");
      const h = await masukkanBelumBerkelas(db, kegiatanId, kelas);
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_masukkan_semua", { kelas, berubah: h.berubah });
      return NextResponse.json({ ok: true, berubah: h.berubah });
    }
    if (aksi === "bagi_rata") {
      const h = await bagiRataPeserta(db, kegiatanId);
      if (!h.ok) return galat(h.pesan);
      segarkan();
      await audit("pelatihan_kelas_bagi_rata", { berubah: h.berubah });
      return NextResponse.json({ ok: true, berubah: h.berubah });
    }
    if (aksi === "libatkan") {
      // Satu langkah "siapa saja yang dilibatkan": peserta (dengan kelas), instruktur (dengan kelas), atau panitia, untuk pelatihan ini saja.
      const akunId = Number(body.akun_id);
      const sebagai = String(body.sebagai ?? "");
      const kelas = body.kelas === null || body.kelas === "" || body.kelas === undefined ? null : Number(body.kelas);
      if (sebagai === "peserta") {
        const h = await libatkanPeserta(db, kegiatanId, akunId, String(body.peran ?? ""), kelas, p.akun.id);
        if (!h.ok) return galat(h.pesan);
        segarkan();
        await audit("pelatihan_libatkan_peserta", { akun_id: akunId, peran: body.peran, kelas });
        return NextResponse.json({ ok: true, nama: h.nama });
      }
      if (sebagai === "instruktur") {
        if (kelas === null) return galat("Pilih kelas instruktur.");
        const h = await tetapkanInstruktur(db, kegiatanId, akunId, kelas);
        if (!h.ok) return galat(h.pesan);
        segarkan();
        await audit("pelatihan_libatkan_instruktur", { akun_id: akunId, kelas });
        return NextResponse.json({ ok: true });
      }
      if (sebagai === "panitia") {
        const h = await tambahPanitia(db, kegiatanId, akunId, { aktorId: p.akun.id, adminAplikasi: p.adminAplikasi, diberiOleh: `pelatihan:${p.akun.id}` });
        if (!h.ok) return galat(h.pesan);
        segarkan();
        await audit("pelatihan_libatkan_panitia", { akun_id: akunId });
        return NextResponse.json({ ok: true, nama: h.nama });
      }
      return galat("Pilih sebagai apa akun ini dilibatkan: peserta, instruktur, atau panitia.");
    }
    if (aksi === "keluarkan") {
      const sebagai = String(body.sebagai ?? "");
      if (sebagai === "peserta") {
        const h = await keluarkanPeserta(db, kegiatanId, Number(body.penugasan_id));
        if (!h.ok) return galat(h.pesan);
        segarkan();
        await audit("pelatihan_keluarkan_peserta", { penugasan_id: Number(body.penugasan_id) });
        return NextResponse.json({ ok: true });
      }
      if (sebagai === "instruktur") {
        const akunId = Number(body.akun_id);
        const h = await lepasInstruktur(db, kegiatanId, akunId);
        if (!h.ok) return galat(h.pesan);
        segarkan();
        await audit("pelatihan_keluarkan_instruktur", { akun_id: akunId });
        return NextResponse.json({ ok: true });
      }
      if (sebagai === "panitia") {
        const h = await cabutPanitia(db, kegiatanId, Number(body.akun_peran_id), { aktorId: p.akun.id, adminAplikasi: p.adminAplikasi });
        if (!h.ok) return galat(h.pesan);
        await audit("pelatihan_keluarkan_panitia", { akun_peran_id: Number(body.akun_peran_id) });
        return NextResponse.json({ ok: true });
      }
      return galat("Pilih yang dikeluarkan: peserta, instruktur, atau panitia.");
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
