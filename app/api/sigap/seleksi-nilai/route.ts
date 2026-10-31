// app/api/sigap/seleksi-nilai/route.ts
//
// (31 Okt 2026) Paket 4 seleksi petugas, sisi PJ/admin: kertas kerja penilaian, tes seleksi, penetapan, pengumuman.
//   GET  ?id=N                  -> { tabel_siap, boleh_kelola, seleksi, papan }            (papan = pendaftar + nilai + skor + peringkat usulan + hasil tersimpan)
//   GET  ?id=N&aksi=soal        -> { soal[] } lengkap dengan kunci (untuk PJ)
//   POST { aksi: "simpan_variabel", id, variabel[] }                     -> variabel penilaian berbobot (sebelum diumumkan)
//   POST { aksi: "isi_nilai", id, variabel_id, nilai: [{akun_id, nilai}] } -> nilai variabel manual (kosong = hapus)
//   POST { aksi: "simpan_tes", id, aktif, buka, tutup, durasi, soal_teks? } -> jadwal tes + soal (tempel dari Excel: No, Soal, A-E, Kunci, Bobot)
//   POST { aksi: "tetapkan", id }                                         -> simpan peringkat/hasil (seleksi sudah ditutup, belum diumumkan)
//   POST { aksi: "umumkan", id, info_pelatihan?, konfirmasi_batas? }      -> push hasil ke semua pendaftar; status seleksi -> selesai
//   POST { aksi: "naikkan_cadangan", id, akun_id }                        -> cadangan menjadi lulus + push
//   POST { aksi: "tugaskan", id }                                         -> lulus yang bersedia -> penugasan kegiatan (ulang bila ada yang gagal)
// Izin: Penugasan petugas (translok.penugasan) pada kegiatan itu, atau Kelola Peran & Akses.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun, sesiDariHeader, type PetaIzin } from "@/lib/sigapAkses";
import { kirimKeAkun } from "@/lib/sigapPush";
import { bacaBarisSoal } from "@/lib/sigapTes";
import { periksaJadwalTes, periksaVariabel, pesanPengumuman, type Hasil } from "@/lib/seleksiNilai";
import { teksWaktuWib } from "@/lib/seleksiDaftar";
import { bacaPapan, bacaVariabel, muatSeleksiLengkap } from "@/lib/portal/seleksiPapan";
import { tugaskanPeserta } from "@/lib/portal/seleksiPenugasan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string | string[], status = 400) => NextResponse.json({ error: Array.isArray(pesan) ? pesan.join(" ") : pesan, rincian: Array.isArray(pesan) ? pesan : undefined }, { status });
const MAKS_NILAI_SEKALI = 500;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function sesi(req: NextRequest, db: Db) {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  const { izin } = await izinAkun(db, akunId);
  return { akunId, izin };
}

const bolehLihat = (izin: PetaIzin, kegiatanId: number) => boleh(izin, "translok.penugasan", "lihat", kegiatanId) || boleh(izin, "akses.kelola", "lihat");
const bolehKelola = (izin: PetaIzin, kegiatanId: number) => boleh(izin, "translok.penugasan", "kelola", kegiatanId) || boleh(izin, "akses.kelola", "kelola");

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const sp = req.nextUrl.searchParams;
    const id = Number(sp.get("id"));
    if (!Number.isInteger(id) || id <= 0) return galat("Seleksi tidak sah.");
    const { baris: r, siap } = await muatSeleksiLengkap(db, id);
    if (!siap) return NextResponse.json({ tabel_siap: false });
    if (!r) return galat("Seleksi tidak ditemukan.", 404);
    if (!bolehLihat(s.izin, r.kegiatan_id)) return galat("Tidak punya izin.", 403);

    if (sp.get("aksi") === "soal") {
      const { data } = await db.from("sigap_seleksi_soal").select("nomor, teks, opsi, kunci, bobot").eq("seleksi_id", id).order("nomor");
      return NextResponse.json({ soal: data ?? [] });
    }

    const papan = await bacaPapan(db, r);
    return NextResponse.json({
      tabel_siap: true,
      boleh_kelola: bolehKelola(s.izin, r.kegiatan_id),
      seleksi: {
        id: r.id, nama: r.nama, status: r.status, peringkat_level: r.peringkat_level, tampil_nilai: r.tampil_nilai, jadwal_tutup: r.jadwal_tutup,
        tes: { aktif: r.tes_aktif, buka: r.tes_buka_at, tutup: r.tes_tutup_at, durasi: r.tes_durasi_menit },
        info_pelatihan: r.info_pelatihan, ditetapkan_at: r.ditetapkan_at, diumumkan_at: r.diumumkan_at, konfirmasi_batas: r.konfirmasi_batas,
      },
      papan,
    });
  } catch {
    return galat("Gagal memuat penilaian seleksi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers) !== null) return galat("Tidak dapat mengubah seleksi saat masuk sebagai akun lain.", 403);
    const isi = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = Number(isi?.id);
    if (!isi || !Number.isInteger(id) || id <= 0) return galat("Seleksi tidak sah.");
    const { baris: r, siap } = await muatSeleksiLengkap(db, id);
    if (!siap) return galat("Tabel paket 4 belum dibuat (SQL 20261031i_seleksi_nilai.sql).", 500);
    if (!r) return galat("Seleksi tidak ditemukan.", 404);
    if (!bolehKelola(s.izin, r.kegiatan_id)) return galat("Tidak punya izin.", 403);
    if (r.jalur !== "seleksi") return galat("Penilaian hanya untuk seleksi.");
    if (r.status === "batal" || r.status === "draft") return galat("Seleksi belum dibuka atau sudah dibatalkan.");
    const aksi = isi.aksi;
    const sekarang = new Date().toISOString();
    const terkunci = !!r.diumumkan_at;

    // ---------------- variabel penilaian
    if (aksi === "simpan_variabel") {
      if (terkunci) return galat("Hasil sudah diumumkan; variabel tidak dapat diubah.");
      const p = periksaVariabel(isi.variabel);
      if (!p.ok) return galat(p.galat);
      const lama = await bacaVariabel(db, id);
      const peta = new Map(lama.map((v) => [v.kode, v]));
      const kodeBaru = new Set(p.nilai.map((v) => v.kode));
      for (const [urutan, v] of p.nilai.entries()) {
        const ada = peta.get(v.kode);
        const { error } = ada
          ? await db.from("sigap_seleksi_variabel").update({ nama: v.nama, sumber: v.sumber, bobot: v.bobot, urutan }).eq("id", ada.id)
          : await db.from("sigap_seleksi_variabel").insert({ seleksi_id: id, kode: v.kode, nama: v.nama, sumber: v.sumber, bobot: v.bobot, urutan });
        if (error) return galat("Gagal menyimpan variabel.", 500);
      }
      const hapus = lama.filter((v) => !kodeBaru.has(v.kode)).map((v) => v.id);
      if (hapus.length) await db.from("sigap_seleksi_variabel").delete().in("id", hapus);
      await catatAudit(db, s.akunId, "seleksi_variabel", { id, jumlah: p.nilai.length }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    // ---------------- nilai manual
    if (aksi === "isi_nilai") {
      if (terkunci) return galat("Hasil sudah diumumkan; nilai tidak dapat diubah.");
      const idVar = Number(isi.variabel_id);
      const daftar = Array.isArray(isi.nilai) ? (isi.nilai as { akun_id?: unknown; nilai?: unknown }[]) : null;
      if (!Number.isInteger(idVar) || !daftar) return galat("Isian nilai tidak terbaca.");
      if (daftar.length > MAKS_NILAI_SEKALI) return galat(`Maksimal ${MAKS_NILAI_SEKALI} nilai sekali simpan.`);
      const { data: v } = await db.from("sigap_seleksi_variabel").select("id, sumber").eq("id", idVar).eq("seleksi_id", id).maybeSingle();
      if (!v) return galat("Variabel tidak ditemukan.", 404);
      if (v.sumber !== "manual") return galat("Variabel ini dihitung otomatis dan tidak dapat diisi manual.");
      const { data: pes } = await db.from("sigap_seleksi_peserta").select("akun_id").eq("seleksi_id", id).eq("status", "terdaftar");
      const sah = new Set((pes ?? []).map((x: { akun_id: number }) => x.akun_id));
      const simpan: { variabel_id: number; akun_id: number; nilai: number; diisi_oleh: number; diubah_at: string }[] = [];
      const hapus: number[] = [];
      for (const d of daftar) {
        const akun = Number(d.akun_id);
        if (!sah.has(akun)) return galat(`Akun ${String(d.akun_id)} bukan pendaftar seleksi ini.`);
        if (d.nilai === null || d.nilai === undefined || d.nilai === "") {
          hapus.push(akun);
          continue;
        }
        const n = Number(d.nilai);
        if (!Number.isFinite(n) || n < 0 || n > 100) return galat("Nilai harus angka 0-100.");
        simpan.push({ variabel_id: idVar, akun_id: akun, nilai: Math.round(n * 10) / 10, diisi_oleh: s.akunId, diubah_at: sekarang });
      }
      if (simpan.length) {
        const { error } = await db.from("sigap_seleksi_nilai").upsert(simpan, { onConflict: "variabel_id,akun_id" });
        if (error) return galat("Gagal menyimpan nilai.", 500);
      }
      if (hapus.length) await db.from("sigap_seleksi_nilai").delete().eq("variabel_id", idVar).in("akun_id", hapus);
      await catatAudit(db, s.akunId, "seleksi_nilai", { id, variabel_id: idVar, diisi: simpan.length, dihapus: hapus.length }).catch(() => undefined);
      return NextResponse.json({ ok: true, diisi: simpan.length, dihapus: hapus.length });
    }

    // ---------------- tes
    if (aksi === "simpan_tes") {
      if (terkunci) return galat("Hasil sudah diumumkan; tes tidak dapat diubah.");
      const aktif = isi.aktif === true;
      let soalBaru: { nomor: number; teks: string; opsi: unknown; kunci: string; bobot: number }[] | null = null;
      if (typeof isi.soal_teks === "string" && isi.soal_teks.trim() !== "") {
        if (!isi.soal_teks.includes("\t")) return galat("Tempel soal langsung dari Excel (kolom dipisah tab): No, Soal, A, B, C, D, E, Kunci, Bobot.");
        const baris = isi.soal_teks.replace(/\r\n?/g, "\n").split("\n").map((l) => l.split("\t"));
        const h = bacaBarisSoal(baris);
        if (h.galat.length) return galat(h.galat.slice(0, 8));
        soalBaru = h.soal;
      }
      const { count: sudahMulai } = await db.from("sigap_seleksi_sesi").select("akun_id", { count: "exact", head: true }).eq("seleksi_id", id);
      if (soalBaru && (sudahMulai ?? 0) > 0) return galat("Soal tidak dapat diganti setelah ada peserta yang mulai mengerjakan.");
      if (soalBaru) {
        await db.from("sigap_seleksi_soal").delete().eq("seleksi_id", id);
        const { error } = await db.from("sigap_seleksi_soal").insert(soalBaru.map((x) => ({ seleksi_id: id, nomor: x.nomor, teks: x.teks, opsi: x.opsi, kunci: x.kunci, bobot: x.bobot })));
        if (error) return galat("Gagal menyimpan soal.", 500);
      }
      const { count: jumlahSoal } = await db.from("sigap_seleksi_soal").select("nomor", { count: "exact", head: true }).eq("seleksi_id", id);
      const patch: Record<string, unknown> = { tes_aktif: false, diubah_oleh: s.akunId, diubah_at: sekarang };
      if (aktif) {
        const j = periksaJadwalTes(isi.buka, isi.tutup, isi.durasi);
        if (!j.ok) return galat(j.pesan);
        if ((jumlahSoal ?? 0) <= 0) return galat("Tes belum punya soal. Tempel soal terlebih dahulu.");
        Object.assign(patch, { tes_aktif: true, tes_buka_at: j.buka, tes_tutup_at: j.tutup, tes_durasi_menit: j.durasi });
      }
      const { error } = await db.from("sigap_seleksi").update(patch).eq("id", id);
      if (error) return galat("Gagal menyimpan jadwal tes.", 500);
      await catatAudit(db, s.akunId, "seleksi_tes", { id, aktif, soal: soalBaru ? soalBaru.length : null }).catch(() => undefined);
      return NextResponse.json({ ok: true, jumlah_soal: jumlahSoal ?? 0 });
    }

    // ---------------- tetapkan
    if (aksi === "tetapkan") {
      if (terkunci) return galat("Hasil sudah diumumkan.");
      if (r.status !== "ditutup") return galat("Tutup pendaftaran terlebih dahulu sebelum menetapkan hasil.");
      const papan = await bacaPapan(db, r);
      if (papan.variabel.length === 0) return galat("Susun variabel penilaian terlebih dahulu.");
      if (papan.baris.length === 0) return galat("Belum ada pendaftar.");
      for (let i = 0; i < papan.baris.length; i += 25) {
        await Promise.all(
          papan.baris.slice(i, i + 25).map((b) =>
            db.from("sigap_seleksi_peserta").update({ hasil: b.usulan, peringkat: b.peringkat, skor_akhir: b.skor, grup: b.grup, diubah_at: sekarang }).eq("seleksi_id", id).eq("akun_id", b.akun_id),
          ),
        );
      }
      const { error } = await db.from("sigap_seleksi").update({ ditetapkan_at: sekarang, diubah_oleh: s.akunId, diubah_at: sekarang }).eq("id", id);
      if (error) return galat("Gagal menetapkan.", 500);
      const hitung = (h: Hasil) => papan.baris.filter((b) => b.usulan === h).length;
      await catatAudit(db, s.akunId, "seleksi_tetapkan", { id, lulus: hitung("lulus"), cadangan: hitung("cadangan"), tidak: hitung("tidak") }).catch(() => undefined);
      return NextResponse.json({ ok: true, lulus: hitung("lulus"), cadangan: hitung("cadangan"), tidak: hitung("tidak") });
    }

    // ---------------- umumkan
    if (aksi === "umumkan") {
      if (terkunci) return galat("Hasil sudah diumumkan.");
      if (!r.ditetapkan_at) return galat("Tetapkan hasil terlebih dahulu.");
      const info = typeof isi.info_pelatihan === "string" ? isi.info_pelatihan.replace(/\s+/g, " ").trim().slice(0, 500) : "";
      let batas: string | null = null;
      if (typeof isi.konfirmasi_batas === "string" && isi.konfirmasi_batas.trim() !== "") {
        const t = Date.parse(isi.konfirmasi_batas);
        if (!Number.isFinite(t) || t <= Date.now()) return galat("Batas konfirmasi harus waktu yang akan datang.");
        batas = new Date(t).toISOString();
      }
      const { error } = await db.from("sigap_seleksi").update({ diumumkan_at: sekarang, status: "selesai", info_pelatihan: info || null, konfirmasi_batas: batas, diubah_oleh: s.akunId, diubah_at: sekarang }).eq("id", id);
      if (error) return galat("Gagal mengumumkan.", 500);
      const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", r.kegiatan_id).maybeSingle();
      const { data: pes } = await db.from("sigap_seleksi_peserta").select("akun_id, hasil").eq("seleksi_id", id).eq("status", "terdaftar");
      const ringkas: Record<string, { sasaran: number; terkirim: number; tanpa_push: number }> = {};
      for (const h of ["lulus", "cadangan", "tidak"] as Hasil[]) {
        const ids = ((pes ?? []) as { akun_id: number; hasil: string | null }[]).filter((x) => x.hasil === h).map((x) => x.akun_id);
        if (ids.length === 0) continue;
        const pesan = pesanPengumuman({ namaSeleksi: r.nama, namaKegiatan: (keg?.nama as string) ?? "kegiatan", hasil: h, seleksiId: id, infoPelatihan: info || null, batasKonfirmasi: teksWaktuWib(batas) });
        const k = await kirimKeAkun(db, ids, { ...pesan, tag: `seleksi-umum-${id}-${h}` });
        ringkas[h] = { sasaran: ids.length, terkirim: k.terkirim, tanpa_push: ids.length - k.akun_berlangganan.length };
        try {
          await db.from("sigap_push_log").insert({ kegiatan_id: r.kegiatan_id, oleh_akun_id: s.akunId, jenis: "seleksi_umum", judul: pesan.judul, isi: pesan.isi, url: pesan.url, jumlah_akun: k.akun_berlangganan.length, jumlah_perangkat: k.perangkat, terkirim: k.terkirim, gagal: k.gagal });
        } catch {
          /* riwayat hanya pelengkap */
        }
      }
      await catatAudit(db, s.akunId, "seleksi_umumkan", { id, ringkas }).catch(() => undefined);
      return NextResponse.json({ ok: true, ringkas });
    }

    // ---------------- naikkan cadangan
    if (aksi === "naikkan_cadangan") {
      if (!terkunci) return galat("Cadangan baru dapat dinaikkan setelah hasil diumumkan.");
      const akun = Number(isi.akun_id);
      const { data: p } = await db.from("sigap_seleksi_peserta").select("akun_id, hasil").eq("seleksi_id", id).eq("akun_id", akun).eq("status", "terdaftar").maybeSingle();
      if (!p) return galat("Pendaftar tidak ditemukan.", 404);
      if (p.hasil !== "cadangan") return galat("Hanya peserta berstatus cadangan yang dapat dinaikkan.");
      const { error } = await db.from("sigap_seleksi_peserta").update({ hasil: "lulus", diubah_at: sekarang }).eq("seleksi_id", id).eq("akun_id", akun);
      if (error) return galat("Gagal menyimpan.", 500);
      const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", r.kegiatan_id).maybeSingle();
      const pesan = pesanPengumuman({ namaSeleksi: r.nama, namaKegiatan: (keg?.nama as string) ?? "kegiatan", hasil: "lulus", seleksiId: id, infoPelatihan: r.info_pelatihan, batasKonfirmasi: teksWaktuWib(r.konfirmasi_batas) });
      const k = await kirimKeAkun(db, [akun], { ...pesan, tag: `seleksi-umum-${id}-lulus` });
      await catatAudit(db, s.akunId, "seleksi_naik_cadangan", { id, akun_id: akun, terkirim: k.terkirim }).catch(() => undefined);
      return NextResponse.json({ ok: true, terkirim: k.terkirim, tanpa_push: k.akun_berlangganan.length === 0 });
    }

    // ---------------- tugaskan (ulang)
    if (aksi === "tugaskan") {
      if (!terkunci) return galat("Penugasan otomatis berjalan setelah hasil diumumkan dan peserta menyatakan bersedia.");
      const { data: pes } = await db.from("sigap_seleksi_peserta").select("akun_id, peran").eq("seleksi_id", id).eq("hasil", "lulus").eq("konfirmasi", "bersedia").is("ditugaskan_at", null);
      let ditambahkan = 0;
      let sudahAda = 0;
      let gagal = 0;
      for (const p of (pes ?? []) as { akun_id: number; peran: "ppl" | "pml" }[]) {
        const h = await tugaskanPeserta(db, { seleksiId: id, kegiatanId: r.kegiatan_id, akunId: p.akun_id, peran: p.peran });
        if (h.hasil === "ditambahkan") ditambahkan++;
        else if (h.hasil === "sudah_ada") sudahAda++;
        else gagal++;
      }
      await catatAudit(db, s.akunId, "seleksi_tugaskan", { id, ditambahkan, sudahAda, gagal }).catch(() => undefined);
      return NextResponse.json({ ok: true, ditambahkan, sudah_ada: sudahAda, gagal });
    }

    return galat("Aksi tidak dikenal.");
  } catch {
    return galat("Gagal memproses permintaan.", 500);
  }
}
