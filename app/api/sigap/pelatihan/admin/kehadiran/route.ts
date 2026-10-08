// app/api/sigap/pelatihan/admin/kehadiran/route.ts
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan > Monitoring presensi & Transport Lokal + pengaturan titik presensi.
// Izin menu `pelatihan.kelola`: lihat = monitoring; kelola = pengaturan & presensi manual. Aksi tulis dicatat di sigap_audit.
//
// GET ?bagian=pengaturan              -> pengaturan presensi (titik, radius, sesi per hari, akurasi); belum disimpan -> isian bawaan (bawaan:true)
// GET ?bagian=presensi                -> peserta x status presensi hari ini (hadir lengkap / sebagian / ditolak / belum) per sesi + statistik
// GET ?bagian=translok                -> peserta x foto Transport Lokal pada hari pelatihan
// GET ?bagian=akses                  -> peserta x akses ke halaman Pelatihan (pertama kali), login terakhir, kontak (pengelola)
// GET ?bagian=foto&penugasan_id=N     -> foto (tautan sementara 1 jam) seorang peserta
// POST {aksi:"reset_pin", akun_id}  -> PIN sementara utk peserta (tampil sekali)
// POST {aksi:"atur_presensi", titik:[{nama,lat,lng,radius_m}] (1-5 titik), sesi:[{nama,buka:"HH:MM",tutup:"HH:MM"}] (1-3 sesi per hari, WIB;
//        berlaku di setiap hari kegiatan), akurasi_maks_m, tempat?}   (bentuk lama: buka_at, tutup_at = 1 sesi)
// POST {aksi:"presensi_manual", akun_id, alasan, sesi?}   -> panitia mencatat hadir (mis. GPS gagal); sesi = kunci "YYYY-MM-DD#no", bawaan sesi yang belum tercatat

import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { UNDANGAN } from "@/lib/sigapTes";
import { resetPinOlehAdmin } from "@/lib/sigapPin";
import { jadwalSesi, keadaanHari, susunHari, validasiSesi, type AturanSesi } from "@/lib/sigapPresensi";
import { FILTER_BUKAN_ADMINISTRASI, akunDariRequest, bawaanPengaturanPresensi, dbAdmin, idKegiatanPelatihan, muatPengaturanPresensi, muatRekamPresensi, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function bacaWaktu(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.length === 16 ? `${s}:00` : s}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return galat("Tidak punya izin membuka menu ini.", 403);
    const bagian = req.nextUrl.searchParams.get("bagian") ?? "";
    const sekarang = new Date();

    if (bagian === "pengaturan") {
      // (8 Okt 2026) belum pernah disimpan -> isian bawaan (1 sesi 06.00-18.00, titik dari pelatihan sebelumnya) agar tidak mengisi dari nol
      const tersimpan = await muatPengaturanPresensi(db, kegiatanId);
      const pengaturan = tersimpan ?? (await bawaanPengaturanPresensi(db, kegiatanId));
      return NextResponse.json({ sekarang: sekarang.toISOString(), boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), pengaturan, bawaan: !tersimpan });
    }

    // daftar peserta (penugasan aktif) + nama
    const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(2000);
    const akunIds = (pen ?? []).map((p) => p.akun_id as number);
    const { data: ak } = akunIds.length ? await db.from("sigap_akun").select("id, nama, jenis").in("id", akunIds).limit(2000) : { data: [] as Record<string, unknown>[] };
    const nama = new Map((ak ?? []).map((a) => [a.id as number, a.nama as string]));
    const jenisAkun = new Map((ak ?? []).map((a) => [a.id as number, (a.jenis as string | null) ?? "mitra"]));
    const urut = <T extends { kelas: number | null; nama: string }>(a: T[]) => a.sort((x, y) => (x.kelas ?? 9) - (y.kelas ?? 9) || x.nama.localeCompare(y.nama));

    if (bagian === "presensi") {
      const peng = await muatPengaturanPresensi(db, kegiatanId);
      // (8 Okt 2026) presensi per sesi pada hari fokus (hari ini bila hari kegiatan): lengkap = semua sesi tercatat, sebagian = sebagian
      const { data: rows } = await db.from("sigap_pelatihan_presensi").select("akun_id, tanggal, sesi_no, at, diterima, jarak_m, akurasi_m, manual, alasan, dicatat_oleh, titik_nama").eq("kegiatan_id", kegiatanId).order("at", { ascending: true }).limit(20000);
      const hariFokusStr = peng ? susunHari(peng.jadwal, [], sekarang.getTime()).tanggal : null;
      const sesiHari = peng && hariFokusStr ? peng.jadwal.filter((x) => x.tanggal === hariFokusStr) : [];
      const diterima = new Map<number, Map<number, Record<string, unknown>>>(); // akun -> sesi_no -> baris
      const percobaan = new Map<number, Record<string, unknown>[]>();
      for (const r of rows ?? []) {
        const id = r.akun_id as number;
        const tgl = String(r.tanggal ?? "").slice(0, 10);
        if (hariFokusStr && tgl !== hariFokusStr) continue;
        if (r.diterima) {
          const m = diterima.get(id) ?? new Map<number, Record<string, unknown>>();
          m.set(Number(r.sesi_no ?? 1), r);
          diterima.set(id, m);
        } else percobaan.set(id, [...(percobaan.get(id) ?? []), r]);
      }
      const peserta = urut(
        (pen ?? []).map((p) => {
          const id = p.akun_id as number;
          const m = diterima.get(id);
          const c = percobaan.get(id) ?? [];
          const terakhir = c[c.length - 1];
          const sesi = sesiHari.map((x) => {
            const r = m?.get(x.no);
            return { no: x.no, nama: x.nama, buka_at: x.buka_at, tutup_at: x.tutup_at, hadir: !!r, at: (r?.at as string | undefined) ?? null, jarak_m: r?.jarak_m != null ? Number(r.jarak_m) : null, titik_nama: (r?.titik_nama as string | null | undefined) ?? null, manual: !!r?.manual, alasan: (r?.alasan as string | undefined) ?? null, dicatat_oleh: (r?.dicatat_oleh as string | undefined) ?? null };
          });
          const jumlahHadir = sesi.filter((x) => x.hadir).length;
          const d = sesi.find((x) => x.hadir) ?? null;
          return {
            akun_id: id,
            nama: nama.get(id) ?? "?",
            jenis_akun: jenisAkun.get(id) ?? "mitra",
            peran: p.peran as string,
            kelas: (p.kelas as number | null) ?? null,
            status: sesi.length && jumlahHadir === sesi.length ? "hadir" : jumlahHadir > 0 ? "sebagian" : c.length ? "ditolak" : "belum",
            sesi,
            hadir_n: jumlahHadir,
            at: d?.at ?? null,
            jarak_m: d?.jarak_m ?? null,
            titik_nama: d?.titik_nama ?? null,
            manual: !!d?.manual,
            alasan: d?.alasan ?? null,
            dicatat_oleh: d?.dicatat_oleh ?? null,
            percobaan: c.length,
            percobaan_terakhir_at: (terakhir?.at as string | undefined) ?? null,
            percobaan_jarak_m: terakhir?.jarak_m != null ? Number(terakhir.jarak_m) : null,
            percobaan_alasan: (terakhir?.alasan as string | undefined) ?? null,
          };
        })
      );
      const stat = { peserta: peserta.length, hadir: peserta.filter((p) => p.status === "hadir").length, sebagian: peserta.filter((p) => p.status === "sebagian").length, ditolak: peserta.filter((p) => p.status === "ditolak").length, belum: peserta.filter((p) => p.status === "belum").length };
      return NextResponse.json({ sekarang: sekarang.toISOString(), boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), pengaturan: peng, tanggal: hariFokusStr, sesi_hari: sesiHari.map((x) => ({ no: x.no, nama: x.nama, buka_at: x.buka_at, tutup_at: x.tutup_at })), stat, peserta });
    }

    if (bagian === "translok") {
      const { data: kg } = await db.from("sigap_kegiatan").select("jumlah_foto").eq("id", kegiatanId).maybeSingle();
      const total = Number(kg?.jumlah_foto) > 0 ? Number(kg?.jumlah_foto) : 5;
      const { data: fo } = await db.from("sigap_dokumentasi").select("penugasan_id, slot, diunggah_at").eq("kegiatan_id", kegiatanId).eq("tanggal", UNDANGAN.tanggal_iso).limit(20000);
      const per = new Map<number, { slot: Set<number>; terakhir: string }>();
      for (const f of fo ?? []) {
        const id = f.penugasan_id as number;
        const e = per.get(id) ?? { slot: new Set<number>(), terakhir: "" };
        e.slot.add(f.slot as number);
        if ((f.diunggah_at as string) > e.terakhir) e.terakhir = f.diunggah_at as string;
        per.set(id, e);
      }
      const peserta = urut(
        (pen ?? []).map((p) => {
          const e = per.get(p.id as number);
          return {
            akun_id: p.akun_id as number,
            penugasan_id: p.id as number,
            nama: nama.get(p.akun_id as number) ?? "?",
            jenis_akun: jenisAkun.get(p.akun_id as number) ?? "mitra",
            peran: p.peran as string,
            kelas: (p.kelas as number | null) ?? null,
            slot: e ? [...e.slot].filter((s) => s >= 1 && s <= total).sort((a, b) => a - b) : [],
            terakhir_at: e?.terakhir || null,
          };
        })
      );
      const lengkap = peserta.filter((p) => p.slot.length >= total).length;
      const belum = peserta.filter((p) => p.slot.length === 0).length;
      return NextResponse.json({ sekarang: sekarang.toISOString(), tanggal: UNDANGAN.tanggal_iso, foto_total: total, stat: { peserta: peserta.length, lengkap, sebagian: peserta.length - lengkap - belum, belum }, peserta });
    }

    if (bagian === "akses") {
      const bisaKelola = boleh(izin, "pelatihan.kelola", "kelola", kegiatanId);
      const { data: ak2 } = akunIds.length
        ? await db.from("sigap_akun").select("id, jenis, alamat_kecamatan, akun_dibuat_at, terakhir_masuk_at, petugas_bencana_id").in("id", akunIds).limit(2000)
        : { data: [] as Record<string, unknown>[] };
      const { data: lg } = await db.from("sigap_pelatihan_langkah").select("akun_id, kode, at").eq("kegiatan_id", kegiatanId).limit(20000);
      const aksesAt = new Map<number, string>();
      const undangan = new Set<number>();
      for (const r of lg ?? []) {
        if (r.kode === "akses") aksesAt.set(r.akun_id as number, r.at as string);
        if (r.kode === "undangan") undangan.add(r.akun_id as number);
      }
      // kontak hanya untuk pengelola (data pribadi)
      const hp = new Map<number, string>();
      if (bisaKelola) {
        const pbIds = (ak2 ?? []).map((a) => a.petugas_bencana_id as number | null).filter((x): x is number => !!x);
        const { data: pb } = pbIds.length ? await db.from("bencana_petugas").select("id, no_hp").in("id", pbIds).limit(2000) : { data: [] as Record<string, unknown>[] };
        const noHp = new Map((pb ?? []).map((x) => [x.id as number, (x.no_hp as string | null) ?? ""]));
        for (const a of ak2 ?? []) {
          const v = noHp.get(a.petugas_bencana_id as number);
          if (v) hp.set(a.id as number, v);
        }
      }
      const info = new Map((ak2 ?? []).map((a) => [a.id as number, a]));
      const peserta = urut(
        (pen ?? []).map((p) => {
          const id = p.akun_id as number;
          const a = info.get(id);
          return {
            akun_id: id,
            nama: nama.get(id) ?? "?",
            jenis_akun: jenisAkun.get(id) ?? "mitra",
            peran: p.peran as string,
            kelas: (p.kelas as number | null) ?? null,
            kecamatan: (a?.alamat_kecamatan as string | null) ?? null,
            akun_dibuat: !!a?.akun_dibuat_at,
            terakhir_masuk_at: (a?.terakhir_masuk_at as string | null) ?? null,
            akses_pertama_at: aksesAt.get(id) ?? null,
            undangan_dibuka: undangan.has(id),
            hp: hp.get(id) ?? null,
          };
        })
      );
      const sudah = peserta.filter((p) => p.akses_pertama_at).length;
      const belumMasuk = peserta.filter((p) => !p.akses_pertama_at && !p.terakhir_masuk_at).length;
      return NextResponse.json({ sekarang: sekarang.toISOString(), boleh_lihat_kontak: bisaKelola, stat: { peserta: peserta.length, sudah, belum: peserta.length - sudah, belum_pernah_masuk: belumMasuk }, peserta });
    }

    if (bagian === "foto") {
      const penugasanId = Number(req.nextUrl.searchParams.get("penugasan_id"));
      const ok = pen?.some((p) => p.id === penugasanId);
      if (!ok) return galat("Penugasan tidak ditemukan.", 404);
      const { data: fo } = await db.from("sigap_dokumentasi").select("slot, file_path, diunggah_at, susulan").eq("kegiatan_id", kegiatanId).eq("penugasan_id", penugasanId).eq("tanggal", UNDANGAN.tanggal_iso).order("slot");
      const foto = [];
      for (const f of fo ?? []) {
        const { data: s } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(String(f.file_path), 3600);
        foto.push({ slot: f.slot as number, url: s?.signedUrl ?? null, diunggah_at: f.diunggah_at as string, susulan: !!f.susulan });
      }
      return NextResponse.json({ foto });
    }

    return galat("Bagian tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const body = await req.json().catch(() => null);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola presensi pelatihan.", 403);
    const aksi = String(body?.aksi ?? "");

    if (aksi === "atur_presensi") {
      // (7 Okt 2026) 1-5 titik lokasi presensi; diterima bila dalam radius salah satunya.
      const mentah = Array.isArray(body?.titik) ? (body.titik as unknown[]) : [];
      if (mentah.length < 1 || mentah.length > 5) return galat("Isi 1 sampai 5 titik lokasi presensi.");
      const titik: { nama: string; lat: number; lng: number; radius_m: number }[] = [];
      for (let i = 0; i < mentah.length; i++) {
        const t = (mentah[i] ?? {}) as Record<string, unknown>;
        const nama = String(t.nama ?? "").trim().slice(0, 80);
        const lat = Number(t.lat);
        const lng = Number(t.lng);
        const radius = Number(t.radius_m);
        const no = `Titik ${i + 1}`;
        if (!nama) return galat(`${no}: nama lokasi wajib diisi.`);
        if (t.lat === "" || t.lat == null || !Number.isFinite(lat) || lat < -90 || lat > 90) return galat(`${no}: lintang (latitude) harus -90 s.d. 90.`);
        if (t.lng === "" || t.lng == null || !Number.isFinite(lng) || lng < -180 || lng > 180) return galat(`${no}: bujur (longitude) harus -180 s.d. 180.`);
        if (!Number.isInteger(radius) || radius < 10 || radius > 5000) return galat(`${no}: radius harus 10–5000 meter.`);
        titik.push({ nama, lat, lng, radius_m: radius });
      }
      const akurasi = Number(body?.akurasi_maks_m);
      if (!Number.isInteger(akurasi) || akurasi < 10 || akurasi > 1000) return galat("Akurasi GPS maksimal harus 10–1000 meter.");
      // (8 Okt 2026) aturan sesi per hari (bentuk baru) -- bentuk lama buka_at/tutup_at (datetime) dianggap 1 sesi
      let aturan: AturanSesi[];
      if (body?.sesi !== undefined) {
        const v = validasiSesi(body.sesi);
        if (!v.ok) return galat(v.error);
        aturan = v.sesi;
      } else {
        const buka = bacaWaktu(body?.buka_at);
        const tutup = bacaWaktu(body?.tutup_at);
        if (!buka || !tutup) return galat("Jam buka/tutup presensi tidak valid.");
        if (tutup.getTime() <= buka.getTime()) return galat("Jam tutup harus setelah jam buka.");
        const jam = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);
        const v = validasiSesi([{ nama: "Presensi", buka: jam(buka), tutup: jam(tutup) }]);
        if (!v.ok) return galat(v.error);
        aturan = v.sesi;
      }
      const sebelum = await muatPengaturanPresensi(db, kegiatanId);
      const dasar = sebelum ?? (await bawaanPengaturanPresensi(db, kegiatanId));
      const jadwal = jadwalSesi(aturan, dasar.hari);
      const baris = {
        kegiatan_id: kegiatanId,
        presensi_sesi: aturan,
        // kolom lama (kompatibilitas) = sesi pertama hari pertama
        presensi_buka_at: jadwal[0].buka_at,
        presensi_tutup_at: jadwal[0].tutup_at,
        akurasi_maks_m: akurasi,
        tempat: typeof body?.tempat === "string" && body.tempat.trim() ? body.tempat.trim().slice(0, 120) : sebelum?.tempat ?? null,
        diubah_at: new Date().toISOString(),
      };
      // kolom lama presensi_lat/lng/radius_m wajib terisi saat baris pertama dibuat -> isi dari titik pertama (titik sebenarnya ada di sigap_pelatihan_titik)
      const { error } = await db.from("sigap_pelatihan_pengaturan").upsert({ ...(sebelum ? {} : { presensi_lat: titik[0].lat, presensi_lng: titik[0].lng, presensi_radius_m: titik[0].radius_m }), ...baris }, { onConflict: "kegiatan_id" });
      if (error) return galat(error.message, 500);
      // ganti seluruh daftar titik (hapus lama -> isi baru); riwayat presensi menyimpan titik_nama sendiri
      const { error: eHapus } = await db.from("sigap_pelatihan_titik").delete().eq("kegiatan_id", kegiatanId);
      if (eHapus) return galat(eHapus.message, 500);
      const { error: eIsi } = await db.from("sigap_pelatihan_titik").insert(titik.map((t, i) => ({ kegiatan_id: kegiatanId, urut: i + 1, ...t, aktif: true })));
      if (eIsi) return galat(eIsi.message, 500);
      await catatAudit(db, akun.id, "pelatihan_atur_presensi", { sebelum: sebelum ? { sesi: sebelum.sesi, titik: sebelum.titik, akurasi_maks_m: sebelum.akurasi_maks_m } : null, sesudah: { sesi: aturan, titik, akurasi_maks_m: akurasi } });
      return NextResponse.json({ ok: true });
    }

    // (7 Okt 2026) Reset PIN peserta pelatihan -> PIN sementara (tampil sekali). Hanya peserta kegiatan ini.
    if (aksi === "reset_pin") {
      const akunId = Number(body?.akun_id);
      const peserta = await pesertaPelatihan(db, akunId, kegiatanId);
      if (!peserta) return galat("Peserta tidak ditemukan.", 404);
      const r = await resetPinOlehAdmin(db, { akunId: akun.id, nama: akun.nama, adminAplikasi: boleh(izin, "portal.kelola", "kelola") }, akunId);
      if (!r.ok) return galat(r.error, r.status);
      return NextResponse.json({ ok: true, pin: r.pin, nama: r.nama, sampai: r.sampai, hp: r.hp });
    }

    if (aksi === "presensi_manual") {
      const akunId = Number(body?.akun_id);
      const alasan = String(body?.alasan ?? "").trim();
      if (alasan.length < 5) return galat("Alasan wajib diisi (minimal 5 huruf).");
      const peserta = await pesertaPelatihan(db, akunId, kegiatanId);
      if (!peserta) return galat("Peserta tidak ditemukan.", 404);
      // (8 Okt 2026) sesi: yang dipilih panitia, atau sesi hari ini yang sedang dibuka / belum tercatat pertama
      const peng = await muatPengaturanPresensi(db, kegiatanId);
      if (!peng) return galat("Presensi belum diatur. Simpan pengaturan presensi lebih dulu.", 409);
      const sekarang = new Date();
      const kead = keadaanHari(susunHari(peng.jadwal, await muatRekamPresensi(db, kegiatanId, akunId), sekarang.getTime()), sekarang.getTime());
      const diminta = typeof body?.sesi === "string" ? kead.sesi.find((x) => x.kunci === body.sesi) : undefined;
      const sesi = diminta ?? kead.aktif ?? kead.sesi.find((x) => !x.at);
      if (!sesi) return galat("Semua sesi presensi hari ini sudah tercatat untuk peserta ini.", 409);
      if (sesi.at) return galat("Peserta ini sudah tercatat hadir pada sesi tersebut.", 409);
      const { error } = await db.from("sigap_pelatihan_presensi").insert({
        kegiatan_id: kegiatanId,
        akun_id: akunId,
        penugasan_id: peserta.penugasan_id,
        tanggal: sesi.tanggal,
        sesi_no: sesi.no,
        at: sekarang.toISOString(),
        diterima: true,
        manual: true,
        alasan: alasan.slice(0, 300),
        dicatat_oleh: `${akun.nama} (#${akun.id})`,
      });
      if (error) return galat(error.code === "23505" ? "Peserta ini sudah tercatat hadir." : error.message, error.code === "23505" ? 409 : 500);
      await catatAudit(db, akun.id, "pelatihan_presensi_manual", { akun_id: akunId, alasan, sesi: sesi.kunci });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
