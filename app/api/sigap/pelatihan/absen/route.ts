// app/api/sigap/pelatihan/absen/route.ts
//
// (2 Nov 2026) Absen peserta (pelatihan 5 tab, tahap E). Rancangan: rancangan-absen-kedatangan-jendela-30-menit-2nov.
//
// GET  (Bearer sesi; ?kegiatan=ID &tanggal=YYYY-MM-DD &kelas=N)
//   pengelola (panitia / instruktur) -> { sebagai:"pengelola", jenis, tersedia, tanggal, hari, kedatangan_berlaku, atur, kelas_pilihan, kelas, kelas_terkunci, sesi:[...rencana + keadaan], disarankan, peserta:[...], datang:[...], hadir:[...], sekarang }
//   GET ?sebagai=peserta  -> { sebagai:"peserta", tersedia, kedatangan:{berlaku,sudah,at,manual,terlambat}, sesi_terbuka:[{id,no,label,metode,tutup_at,sisa_detik,sudah_hadir}],
//                            sesi_hari:[{id,no,label,jam,keadaan:dibuka|habis|ditutup,tutup_at,sudah_hadir}] (3 Nov 2026: semua sesi hari ini untuk kelas peserta) }
// POST pengelola: {aksi:"mulai",tanggal,no,label?,jam?,kelas?,metode:[...]} | {aksi:"tutup",sesi_id} | {aksi:"ganti",sesi_id,metode} (3 Nov 2026) | {aksi:"centang",sesi_id,akun_id,hadir,alasan?}
//                 | {aksi:"datang",akun_id,hadir,alasan?,tanggal} | {aksi:"posisi",sesi_id,lat,lng,akurasi} | {aksi:"atur",sesi?,jendela_menit?,radius_m?} (izin kelola)
//                 | (3 Nov 2026, alat darurat) {aksi:"susulan",tanggal,no,label?,jam,kelas?,alasan} | {aksi:"kode_baru",sesi_id} | {aksi:"radius",sesi_id,radius_m}
//                 | {aksi:"centang_massal",sesi_id,akun_ids[],alasan}
// GET pengelola ?rekap=1 -> { rekap:[{jenis,tanggal,sesi,nama,alasan,oleh,at}] } rekap koreksi (centang manual, kedatangan manual, sesi susulan); instruktur hanya kelasnya.
// POST peserta:   {aksi:"kode",sesi_id,kode} | {aksi:"lokasi",sesi_id,lat,lng,akurasi}
// Waktu dan jendela SELALU dihitung di server. Instruktur hanya mengelola kelasnya; panitia semua kelas.

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { TUBUH_GERBANG } from "@/lib/gerbangUndangan";
import { periksaGerbang } from "@/lib/sigapPelatihanBaruDb";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";
import { posisiValid } from "@/lib/sigapPresensi";
import { bacaSusulan, kedatanganBerlaku, keadaanSesi, menitWib, periksaAlasan, periksaJamSusulan, periksaMetodeTunggal, periksaRadius, sarankanSesi, sisaDetik, tanggalWib } from "@/lib/sigapAbsen";
import {
  ambilSesi, batalDatangManual, catatDatangManual, catatSusulan, centangMassal, centangPeserta, gantiMetode, hariKegiatan, kirimKode, kodeBaru, konfirmasiLokasi, muatAtur, muatDatang, muatHadir, muatRekapKoreksi,
  muatSesiHari, mulaiSesi, pesertaKelas, simpanAtur, simpanPosisiPengelola, tutupSesi, ubahRadius, PESAN_SQL,
} from "@/lib/sigapAbsenDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });
const acakKuat = () => randomBytes(4).readUInt32BE(0) / 2 ** 32;
const angka = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const tanggalSah = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const url = new URL(req.url);
    const sekarang = Date.now();
    const hari = await hariKegiatan(db, kegiatanId);

    // ---------- sisi peserta ----------
    if (url.searchParams.get("sebagai") === "peserta") {
      const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
      if (!peserta) return galat("Anda bukan peserta pelatihan ini.", 403);
      if ((await periksaGerbang(db, kegiatanId, akun.id)) !== "boleh") return NextResponse.json(TUBUH_GERBANG, { status: 403 }); // (3 Nov 2026) terima undangan dahulu
      const hariIni = tanggalWib(sekarang);
      const berlaku = kedatanganBerlaku(hari, hariIni);
      const datang = berlaku ? (await muatDatang(db, kegiatanId, hariIni, [akun.id])).get(akun.id) ?? null : null;
      // (3 Nov 2026) Seluruh sesi hari ini untuk kelas peserta (bukan hanya yang dibuka): kartu "Presensi sesi" di tab Hari ini selalu tampil dengan statusnya.
      const { sesi: sesiHariIni } = await muatSesiHari(db, kegiatanId, hariIni);
      const untukku = sesiHariIni.filter((s) => s.kelas === null || s.kelas === undefined || peserta.kelas === null || peserta.kelas === undefined || Number(s.kelas) === Number(peserta.kelas));
      const terbuka = untukku.filter((s) => keadaanSesi(s, sekarang) === "dibuka");
      const hadirHari = await muatHadir(db, untukku.map((s) => s.id));
      const hadir = hadirHari;
      return NextResponse.json({
        sebagai: "peserta",
        tersedia: true,
        hari_ini: hariIni,
        kedatangan: { berlaku, sudah: !!datang, at: datang?.at ?? null, manual: datang?.manual ?? false, terlambat: datang?.terlambat ?? false },
        sesi_terbuka: terbuka.map((s) => ({
          id: s.id, no: s.no, label: s.label, metode: s.metode, tutup_at: s.tutup_at, sisa_detik: sisaDetik(s.tutup_at, sekarang), radius_m: s.radius_m,
          sudah_hadir: hadir.some((h) => h.absen_sesi_id === s.id && h.akun_id === akun.id && h.diterima),
          di_luar_radar: hadir.some((h) => h.absen_sesi_id === s.id && h.akun_id === akun.id && !h.diterima && h.metode === "radar"),
        })),
        sesi_hari: untukku.map((s) => ({
          id: s.id, no: s.no, label: s.label, jam: s.jam_rencana, keadaan: keadaanSesi(s, sekarang), tutup_at: s.tutup_at,
          sudah_hadir: hadirHari.some((h) => h.absen_sesi_id === s.id && h.akun_id === akun.id && h.diterima),
        })),
        sekarang,
      });
    }

    // ---------- sisi pengelola ----------
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta") return galat("Hanya panitia dan instruktur yang dapat mengelola absen.", 403);
    const kelasTerkunci = pengguna.jenis === "instruktur" && pengguna.kelas !== null;
    const semua = await pesertaKelas(db, kegiatanId, null);
    const kelasPilihan = Array.from(new Set(semua.map((p) => p.kelas).filter((k): k is number => k !== null))).sort((a, b) => a - b);
    const kelasMinta = angka(url.searchParams.get("kelas"));
    const kelas = kelasTerkunci ? (pengguna as { kelas: number }).kelas : kelasMinta !== null && kelasPilihan.includes(kelasMinta) ? kelasMinta : kelasPilihan.length === 1 ? kelasPilihan[0] : null;
    if (url.searchParams.get("rekap") === "1") return NextResponse.json({ rekap: await muatRekapKoreksi(db, kegiatanId, kelas) });
    const tanggalMinta = url.searchParams.get("tanggal");
    const tanggal = tanggalSah(tanggalMinta) ? tanggalMinta : tanggalWib(sekarang);
    const peserta = kelas === null ? semua : semua.filter((p) => p.kelas === kelas);
    const [atur, { tersedia, sesi: sesiDb }, datangPeta] = await Promise.all([
      muatAtur(db, kegiatanId),
      muatSesiHari(db, kegiatanId, tanggal),
      muatDatang(db, kegiatanId, tanggal, peserta.map((p) => p.akun_id)),
    ]);
    const sesiKelas = sesiDb.filter((s) => (s.kelas ?? null) === (kelas ?? null));
    const hadir = await muatHadir(db, sesiKelas.map((s) => s.id));
    const dimulai = new Set(sesiKelas.map((s) => s.no));
    const nomor = Array.from(new Set([...atur.sesi.map((s) => s.no), ...sesiKelas.map((s) => s.no)])).sort((a, b) => a - b);
    const rencana = nomor.map((no) => {
      const r = atur.sesi.find((s) => s.no === no);
      const d = sesiKelas.find((s) => s.no === no) ?? null;
      return {
        no, label: d?.label ?? r?.label ?? `Sesi ${no}`, jam: d?.jam_rencana ?? r?.jam ?? "",
        sesi: d ? { id: d.id, metode: d.metode, kode: d.kode, status: d.status, keadaan: keadaanSesi(d, sekarang), dibuka_at: d.dibuka_at, tutup_at: d.tutup_at, sisa_detik: sisaDetik(d.tutup_at, sekarang), radius_m: d.radius_m, susulan: bacaSusulan(d.dibuka_oleh) } : null,
        sudah_dimulai: dimulai.has(no),
      };
    });
    return NextResponse.json({
      sebagai: "pengelola",
      jenis: pengguna.jenis,
      tersedia,
      tanggal,
      hari_ini: tanggalWib(sekarang),
      hari,
      kedatangan_berlaku: kedatanganBerlaku(hari, tanggal),
      atur: { sesi: atur.sesi, jendela_menit: atur.jendela_menit, radius_m: atur.radius_m },
      kelas_pilihan: kelasPilihan,
      kelas,
      kelas_terkunci: kelasTerkunci,
      sesi: rencana,
      disarankan: sarankanSesi(atur.sesi, menitWib(sekarang), dimulai),
      peserta: peserta.map((p) => ({ akun_id: p.akun_id, nama: p.nama, kelas: p.kelas })),
      datang: Array.from(datangPeta, ([akun_id, d]) => ({ akun_id, ...d })),
      hadir: hadir.map((h) => ({ sesi_id: h.absen_sesi_id, akun_id: h.akun_id, metode: h.metode, diterima: h.diterima, manual: h.manual, jarak_m: h.jarak_m, alasan: h.alasan, at: h.at })),
      boleh_atur: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId),
      sekarang,
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return galat("Permintaan tidak valid.");
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const sekarang = Date.now();
    const aksi = body.aksi;

    // ---------- peserta ----------
    if (aksi === "kode" || aksi === "lokasi") {
      const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
      if (!peserta) return galat("Anda bukan peserta pelatihan ini.", 403);
      if ((await periksaGerbang(db, kegiatanId, akun.id)) !== "boleh") return NextResponse.json(TUBUH_GERBANG, { status: 403 }); // (3 Nov 2026) terima undangan dahulu
      const sesiId = angka(body.sesi_id);
      const sesi = sesiId === null ? null : await ambilSesi(db, kegiatanId, sesiId);
      const h = aksi === "kode"
        ? await kirimKode(db, sesi, akun.id, peserta.kelas ?? null, body.kode, sekarang)
        : await konfirmasiLokasi(db, sesi, akun.id, peserta.kelas ?? null, posisiValid(body) ? { lat: body.lat, lng: body.lng, akurasi: body.akurasi } : null, sekarang);
      if (!h.ok) return galat(h.pesan, h.status, { tunggu_detik: h.tunggu_detik, sisa_percobaan: h.sisa_percobaan, kode: h.kode, jarak_m: h.jarak_m });
      return NextResponse.json({ ok: true, sudah: !!h.sudah });
    }

    // ---------- pengelola ----------
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta") return galat("Hanya panitia dan instruktur yang dapat mengelola absen.", 403);
    const kelasSendiri = pengguna.jenis === "instruktur" ? pengguna.kelas : null;
    const bolehKelas = (kelas: number | null) => pengguna.jenis === "panitia" || kelasSendiri === null || kelas === kelasSendiri;

    if (aksi === "atur") {
      if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengubah pengaturan absen.", 403);
      const h = await simpanAtur(db, kegiatanId, { sesi: body.sesi, jendela_menit: body.jendela_menit, radius_m: body.radius_m }, akun.nama);
      if (!h.ok) return galat(h.pesan, h.pesan === PESAN_SQL ? 500 : 400);
      await catatAudit(db, akun.id, "absen_atur", { kegiatan_id: kegiatanId, jendela_menit: h.atur.jendela_menit, radius_m: h.atur.radius_m, jumlah_sesi: h.atur.sesi.length });
      return NextResponse.json({ ok: true, atur: h.atur });
    }

    if (aksi === "mulai") {
      const no = angka(body.no);
      if (no === null || !Number.isInteger(no) || no < 1 || no > 12) return galat("Nomor sesi tidak valid.");
      if (!tanggalSah(body.tanggal)) return galat("Tanggal tidak valid.");
      const m = periksaMetodeTunggal(body.metode); // (3 Nov 2026) satu metode pada satu waktu
      if (!m.ok) return galat(m.pesan);
      const kelasMinta = angka(body.kelas);
      const kelas = kelasSendiri !== null ? kelasSendiri : kelasMinta;
      if (!bolehKelas(kelas)) return galat("Anda hanya dapat mengelola kelas Anda sendiri.", 403);
      const atur = await muatAtur(db, kegiatanId);
      const rencana = atur.sesi.find((s) => s.no === no);
      const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : rencana?.label ?? `Sesi ${no}`;
      const disarankan = sarankanSesi(atur.sesi, menitWib(sekarang), new Set());
      const h = await mulaiSesi(db, kegiatanId, { tanggal: body.tanggal, no, label, jam: rencana?.jam || null, kelas, metode: [m.metode], disarankan }, akun.nama, acakKuat, sekarang);
      if (!h.ok) return galat(h.pesan, h.pesan === PESAN_SQL ? 500 : 409);
      await catatAudit(db, akun.id, "absen_mulai", { kegiatan_id: kegiatanId, sesi_id: h.sesi.id, no, kelas, metode: [m.metode], tutup_at: h.sesi.tutup_at });
      return NextResponse.json({ ok: true, sesi: { id: h.sesi.id, no: h.sesi.no, kode: h.sesi.kode, metode: h.sesi.metode, tutup_at: h.sesi.tutup_at, sisa_detik: sisaDetik(h.sesi.tutup_at, sekarang) } });
    }

    if (aksi === "susulan") {
      // (3 Nov 2026) sesi yang lupa dibuka: dicatat sesudah kejadian dengan jam sebenarnya dan alasan; kehadiran diisi dengan centang
      const no = angka(body.no);
      if (no === null || !Number.isInteger(no) || no < 1 || no > 12) return galat("Nomor sesi tidak valid.");
      if (!tanggalSah(body.tanggal)) return galat("Tanggal tidak valid.");
      const hariKeg = await hariKegiatan(db, kegiatanId);
      if (hariKeg.length > 0 && !hariKeg.includes(body.tanggal)) return galat("Tanggal itu bukan hari pelatihan.");
      const j = periksaJamSusulan(body.jam, body.tanggal, sekarang);
      if (!j.ok) return galat(j.pesan);
      const a = periksaAlasan(body.alasan);
      if (!a.ok) return galat(a.pesan);
      const kelasMinta = angka(body.kelas);
      const kelas = kelasSendiri !== null ? kelasSendiri : kelasMinta;
      if (!bolehKelas(kelas)) return galat("Anda hanya dapat mengelola kelas Anda sendiri.", 403);
      const atur = await muatAtur(db, kegiatanId);
      const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : atur.sesi.find((x) => x.no === no)?.label ?? `Sesi ${no}`;
      const h = await catatSusulan(db, kegiatanId, { tanggal: body.tanggal, no, label, jam: j.jam, mulaiMs: j.mulaiMs, kelas, alasan: a.alasan }, akun.nama, sekarang);
      if (!h.ok) return galat(h.pesan, h.pesan === PESAN_SQL ? 500 : 409);
      await catatAudit(db, akun.id, "absen_susulan", { kegiatan_id: kegiatanId, sesi_id: h.sesi.id, no, kelas, tanggal: body.tanggal, jam: j.jam, alasan: a.alasan });
      return NextResponse.json({ ok: true, sesi: { id: h.sesi.id, no: h.sesi.no } });
    }

    if (aksi === "datang") {
      const akunId = angka(body.akun_id);
      const tanggal = tanggalSah(body.tanggal) ? body.tanggal : tanggalWib(sekarang);
      if (akunId === null) return galat("Peserta tidak valid.");
      const hari = await hariKegiatan(db, kegiatanId);
      if (!kedatanganBerlaku(hari, tanggal)) return galat("Kedatangan hanya dicatat pada hari pertama pelatihan.", 409);
      const daftar = await pesertaKelas(db, kegiatanId, kelasSendiri);
      const p = daftar.find((x) => x.akun_id === akunId);
      if (!p) return galat("Peserta tidak ditemukan di kelas Anda.", 404);
      const h = body.hadir === false
        ? await batalDatangManual(db, kegiatanId, akunId, tanggal)
        : await catatDatangManual(db, kegiatanId, p, tanggal, typeof body.alasan === "string" ? body.alasan : "", akun.nama, sekarang);
      if (!h.ok) return galat(h.pesan ?? "Gagal menyimpan.", 400);
      await catatAudit(db, akun.id, body.hadir === false ? "absen_datang_batal" : "absen_datang_manual", { kegiatan_id: kegiatanId, akun_id: akunId, tanggal });
      return NextResponse.json({ ok: true });
    }

    // aksi yang bertumpu pada satu sesi
    const sesiId = angka(body.sesi_id);
    if (sesiId === null) return galat("Sesi tidak valid.");
    const sesi = await ambilSesi(db, kegiatanId, sesiId);
    if (!sesi) return galat("Sesi absen tidak ditemukan.", 404);
    if (!bolehKelas(sesi.kelas ?? null)) return galat("Anda hanya dapat mengelola kelas Anda sendiri.", 403);

    if (aksi === "tutup") {
      const h = await tutupSesi(db, kegiatanId, sesiId, sekarang);
      if (!h.ok) return galat(h.pesan ?? "Gagal menutup sesi.", 500);
      await catatAudit(db, akun.id, "absen_tutup", { kegiatan_id: kegiatanId, sesi_id: sesiId });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "ganti") {
      // (3 Nov 2026) ganti metode di tengah jalan pada sesi yang masih dibuka; jendela waktu tidak berubah
      if (keadaanSesi(sesi, sekarang) !== "dibuka") return galat("Sesi ini sudah tidak dibuka. Mulai presensi lagi untuk memakai metode lain.", 409);
      const m = periksaMetodeTunggal(body.metode);
      if (!m.ok) return galat(m.pesan);
      const h = await gantiMetode(db, sesi, m.metode, acakKuat);
      if (!h.ok) return galat(h.pesan, 500);
      await catatAudit(db, akun.id, "absen_ganti_metode", { kegiatan_id: kegiatanId, sesi_id: sesiId, dari: sesi.metode, ke: m.metode });
      return NextResponse.json({ ok: true, metode: [m.metode], kode: h.kode });
    }

    if (aksi === "centang") {
      const akunId = angka(body.akun_id);
      if (akunId === null) return galat("Peserta tidak valid.");
      const daftar = await pesertaKelas(db, kegiatanId, sesi.kelas ?? null);
      if (!daftar.some((p) => p.akun_id === akunId)) return galat("Peserta tidak ditemukan di kelas sesi ini.", 404);
      const h = await centangPeserta(db, sesi, akunId, body.hadir !== false, akun.nama, typeof body.alasan === "string" ? body.alasan : null);
      if (!h.ok) return galat(h.pesan ?? "Gagal menyimpan.", 500);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "kode_baru") {
      // (3 Nov 2026) kode bocor: kode lama langsung mati
      if (keadaanSesi(sesi, sekarang) !== "dibuka") return galat("Sesi ini sudah tidak dibuka.", 409);
      const h = await kodeBaru(db, sesi, acakKuat);
      if (!h.ok) return galat(h.pesan, h.pesan === PESAN_SQL ? 500 : 409);
      await catatAudit(db, akun.id, "absen_kode_baru", { kegiatan_id: kegiatanId, sesi_id: sesiId });
      return NextResponse.json({ ok: true, kode: h.kode });
    }

    if (aksi === "radius") {
      // (3 Nov 2026) radius sementara untuk sesi ini saja (mis. aula besar atau GPS meleset)
      if (keadaanSesi(sesi, sekarang) !== "dibuka") return galat("Sesi ini sudah tidak dibuka.", 409);
      if (!sesi.metode.includes("radar")) return galat("Sesi ini sedang tidak memakai radar GPS.", 409);
      const r = periksaRadius(body.radius_m);
      if (!r.ok) return galat(r.pesan);
      const h = await ubahRadius(db, sesi, r.radius);
      if (!h.ok) return galat(h.pesan ?? "Gagal mengubah radius.", 500);
      await catatAudit(db, akun.id, "absen_radius", { kegiatan_id: kegiatanId, sesi_id: sesiId, dari: sesi.radius_m, ke: r.radius });
      return NextResponse.json({ ok: true, radius_m: r.radius });
    }

    if (aksi === "centang_massal") {
      const a = periksaAlasan(body.alasan);
      if (!a.ok) return galat(a.pesan);
      const ids = Array.isArray(body.akun_ids) ? Array.from(new Set(body.akun_ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))) : [];
      if (ids.length === 0) return galat("Pilih minimal satu peserta.");
      const daftar = await pesertaKelas(db, kegiatanId, sesi.kelas ?? null);
      const dipilih = daftar.filter((p) => ids.includes(p.akun_id));
      if (dipilih.length === 0) return galat("Peserta tidak ditemukan di kelas sesi ini.", 404);
      const h = await centangMassal(db, sesi, dipilih, akun.nama, a.alasan, sekarang);
      if (!h.ok) return galat(h.pesan, h.pesan === PESAN_SQL ? 500 : 400);
      await catatAudit(db, akun.id, "absen_centang_massal", { kegiatan_id: kegiatanId, sesi_id: sesiId, jumlah: h.jumlah, dipilih: dipilih.length, alasan: a.alasan });
      return NextResponse.json({ ok: true, jumlah: h.jumlah });
    }

    if (aksi === "posisi") {
      if (!posisiValid(body)) return galat("Posisi tidak terbaca.");
      if (keadaanSesi(sesi, sekarang) !== "dibuka") return galat("Sesi ini sudah tidak dibuka.", 409);
      const h = await simpanPosisiPengelola(db, sesi, akun.id, { lat: body.lat, lng: body.lng, akurasi: body.akurasi }, sekarang);
      return h.ok ? NextResponse.json({ ok: true }) : galat("Posisi belum dapat disimpan.", 500);
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
