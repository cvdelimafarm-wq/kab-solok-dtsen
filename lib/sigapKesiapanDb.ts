// lib/sigapKesiapanDb.ts
//
// (8 Nov 2026) Pemuat data kartu Kesiapan Kelola Pelatihan (hanya BACA; tidak menulis apa pun). Hitungan ada di lib/sigapKesiapan.ts.
// Dipanggil dari GET /api/sigap/pelatihan/admin?bagian=kesiapan.

import type { Db } from "@/lib/sigap";
import { muatInstruktur } from "@/lib/sigapInstrukturDb";
import { muatKelasBerSurat } from "@/lib/sigapSuratUndanganDb";
import { muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";
import { daftarTanggal, hitungKesiapan, type HasilKesiapan, type MasukanKesiapan } from "@/lib/sigapKesiapan";

type Baris = Record<string, unknown>;
const ang = (v: unknown): number => Number(v);

export async function muatKesiapan(
  db: Db,
  kegiatanId: number,
  tes: { jenis: string; aktif: boolean; buka_at: string; tutup_at: string; jumlah_soal: number }[],
  sekarang: Date,
): Promise<HasilKesiapan> {
  const { data: keg } = await db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle();
  const mulai = (keg?.tanggal_mulai as string | null) ?? null;
  const selesai = (keg?.tanggal_selesai as string | null) ?? null;
  const tanggal = daftarTanggal(mulai, selesai);

  // Penugasan (semua, termasuk nonaktif dan panitia/instruktur manual dari Administrasi) + nama akun
  const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id, peran, aktif, kelas").eq("kegiatan_id", kegiatanId).limit(5000);
  const penugasan = (pen ?? []) as Baris[];
  const akunIds = Array.from(new Set(penugasan.map((p) => ang(p.akun_id))));
  const { data: akunRows } = akunIds.length ? await db.from("sigap_akun").select("id, nama").in("id", akunIds).limit(5000) : { data: [] as Baris[] };
  const nama = new Map(((akunRows ?? []) as Baris[]).map((a) => [ang(a.id), String(a.nama ?? `Akun ${a.id}`)]));
  const penugasanId = penugasan.map((p) => ang(p.id));

  // Hari kerja milik kegiatan ini, dan hari kerja akun yang sama di kegiatan lain pada tanggal pelatihan (bentrokan)
  let hariKerja: MasukanKesiapan["hariKerja"] = [];
  let bentrok: MasukanKesiapan["bentrok"] = [];
  if (tanggal.length && akunIds.length) {
    const { data: hk } = await db
      .from("sigap_hari_kerja")
      .select("akun_id, tanggal, penugasan_id")
      .in("akun_id", akunIds)
      .gte("tanggal", tanggal[0])
      .lte("tanggal", tanggal[tanggal.length - 1])
      .is("batal_at", null)
      .limit(20000);
    const milik = new Set(penugasanId);
    const lain = ((hk ?? []) as Baris[]).filter((h) => !milik.has(ang(h.penugasan_id)));
    hariKerja = ((hk ?? []) as Baris[]).filter((h) => milik.has(ang(h.penugasan_id))).map((h) => ({ akun_id: ang(h.akun_id), tanggal: String(h.tanggal) }));
    if (lain.length) {
      const idLain = Array.from(new Set(lain.map((h) => ang(h.penugasan_id))));
      const { data: pl } = await db.from("sigap_penugasan").select("id, kegiatan_id").in("id", idLain).limit(5000);
      const kegLain = new Map(((pl ?? []) as Baris[]).map((p) => [ang(p.id), ang(p.kegiatan_id)]));
      const idKeg = Array.from(new Set(Array.from(kegLain.values())));
      const { data: kn } = idKeg.length ? await db.from("sigap_kegiatan").select("id, nama").in("id", idKeg).limit(200) : { data: [] as Baris[] };
      const namaKeg = new Map(((kn ?? []) as Baris[]).map((k) => [ang(k.id), String(k.nama)]));
      bentrok = lain.map((h) => ({
        akun_id: ang(h.akun_id),
        nama: nama.get(ang(h.akun_id)) ?? `Akun ${h.akun_id}`,
        tanggal: String(h.tanggal),
        kegiatan: namaKeg.get(kegLain.get(ang(h.penugasan_id)) ?? -1) ?? "kegiatan lain",
      }));
      // hanya yang penugasannya di sini masih aktif
      const aktifIni = new Set(penugasan.filter((p) => p.aktif === true).map((p) => ang(p.akun_id)));
      bentrok = bentrok.filter((b) => aktifIni.has(b.akun_id));
    }
  }

  const [resp, hier, kelas, instruktur, skemaR, titik, mat, berkas, umum, tarif, foto, undangan] = await Promise.all([
    db.from("sigap_pelatihan_undangan_respons").select("akun_id").eq("kegiatan_id", kegiatanId).limit(5000),
    db.from("sigap_pelatihan_hierarki").select("akun_id, atasan_akun_id").eq("kegiatan_id", kegiatanId).limit(5000),
    muatKelasKegiatan(db, kegiatanId),
    muatInstruktur(db, kegiatanId),
    db.from("sigap_pelatihan_nilai_skema").select("pakai_pretest, pakai_posttest, pakai_kuis, bobot_pretest, bobot_posttest, bobot_kuis, pakai_disiplin, bobot_disiplin, pakai_sikap, bobot_sikap").eq("kegiatan_id", kegiatanId).maybeSingle(),
    db.from("sigap_pelatihan_titik").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true),
    db.from("sigap_pelatihan_materi").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true),
    db.from("sigap_pelatihan_berkas").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true),
    db.from("sigap_pengumuman").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).eq("aktif", true),
    db.from("sigap_kegiatan_tarif").select("peran, tarif").eq("kegiatan_id", kegiatanId).limit(100),
    db.from("sigap_pelatihan_laporan_foto").select("kelas, tanggal").eq("kegiatan_id", kegiatanId).limit(1000),
    db.from("arsip_nomor").select("id", { count: "exact", head: true }).eq("jenis", "undangan").eq("kegiatan_id", kegiatanId).eq("status", "terpakai"),
  ]);

  // (9 Nov 2026) agenda hari H; tabel belum ada / galat = tidak dimuat (butir hanya informatif)
  const agendaR = await db.from("sigap_agenda_sesi").select("tes_id, kelas").eq("kegiatan_id", kegiatanId).limit(500);
  let agenda: MasukanKesiapan["agenda"];
  if (!agendaR.error) {
    const { data: tesRows } = await db.from("sigap_tes").select("id, jenis").eq("kegiatan_id", kegiatanId).limit(50);
    const jenisTes = new Map(((tesRows ?? []) as Baris[]).map((t) => [ang(t.id), String(t.jenis)]));
    agenda = ((agendaR.data ?? []) as Baris[]).filter((a) => jenisTes.has(ang(a.tes_id))).map((a) => ({ jenis: jenisTes.get(ang(a.tes_id)) as string, kelas: ang(a.kelas) }));
  }

  const skema = skemaR.data as Baris | null;
  let totalBobot: number | null = null;
  if (skema) {
    const pasang: [string, string][] = [["pakai_pretest", "bobot_pretest"], ["pakai_posttest", "bobot_posttest"], ["pakai_kuis", "bobot_kuis"], ["pakai_disiplin", "bobot_disiplin"], ["pakai_sikap", "bobot_sikap"]];
    totalBobot = pasang.reduce((t, [p, b]) => t + (skema[p] === true ? Number(skema[b] ?? 0) : 0), 0);
  }
  // (9 Nov 2026) kolom tanggal belum dipasang -> baca ulang tanpa tanggal; fotoHari undefined = hitung total seperti dulu
  let fotoBaris = (foto.data ?? []) as Baris[];
  let fotoHari: { kelas: number; tanggal: string | null }[] | undefined;
  if (foto.error) {
    const { data: lama } = await db.from("sigap_pelatihan_laporan_foto").select("kelas").eq("kegiatan_id", kegiatanId).limit(1000);
    fotoBaris = (lama ?? []) as Baris[];
  } else {
    fotoHari = fotoBaris.map((f) => ({ kelas: ang(f.kelas), tanggal: typeof f.tanggal === "string" ? f.tanggal.slice(0, 10) : null }));
  }
  const suratUndangan = await muatKelasBerSurat(db, kegiatanId);
  const fotoPer = new Map<number, number>();
  for (const f of fotoBaris) fotoPer.set(ang(f.kelas), (fotoPer.get(ang(f.kelas)) ?? 0) + 1);

  const masukan: MasukanKesiapan = {
    mulai,
    selesai,
    penugasan: penugasan.map((p) => ({ akun_id: ang(p.akun_id), nama: nama.get(ang(p.akun_id)) ?? `Akun ${p.akun_id}`, peran: String(p.peran), aktif: p.aktif === true, kelas: p.kelas === null ? null : ang(p.kelas) })),
    hariKerja,
    bentrok,
    respons: ((resp.data ?? []) as Baris[]).map((r) => ang(r.akun_id)),
    hierarki: ((hier.data ?? []) as Baris[]).map((h) => ({ akun_id: ang(h.akun_id), atasan: h.atasan_akun_id === null ? null : ang(h.atasan_akun_id) })),
    kelas: kelas.map((k) => k.nomor),
    instruktur: instruktur.map((i) => ({ akun_id: i.akun_id, kelas: i.kelas })),
    tes: tes.map((t) => ({ jenis: t.jenis, jumlah_soal: t.jumlah_soal, aktif: t.aktif, buka_at: t.buka_at, tutup_at: t.tutup_at })),
    skema: { tersimpan: !!skema, totalBobot },
    presensi: { titikAktif: titik.count ?? 0 },
    materi: mat.count ?? 0,
    berkas: berkas.count ?? 0,
    pengumuman: umum.count ?? 0,
    tarifPeran: ((tarif.data ?? []) as Baris[]).filter((t) => Number(t.tarif) > 0).map((t) => String(t.peran)),
    foto: Array.from(fotoPer.entries()).map(([k, jumlah]) => ({ kelas: k, jumlah })),
    fotoHari,
    undanganBernomor: undangan.count ?? 0,
    suratUndangan,
    agenda,
    sekarang,
  };
  return hitungKesiapan(masukan);
}
