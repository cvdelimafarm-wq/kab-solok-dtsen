// lib/portal/siaranPetugas.ts  (hanya server)
//
// (13 Okt 2026) Siaran ke petugas pendataan: daftar penerima, modal untuk pemanggil, catatan konfirmasi, dan pengiriman.
// Modal disimpan di tabel sigap_pengumuman (kegiatan Pendataan Pascabencana, frekuensi "sekali", otomatis berakhir 14 hari).
// Konfirmasi dicatat di sigap_audit (aksi siaran_pendataan_baca) PER AKUN, jadi modal tidak muncul lagi walau ganti HP.

import type { Db } from "@/lib/sigap";
import { KOLOM_PENGUMUMAN, keBentukPeserta, type Pengumuman, type PengumumanPeserta } from "@/lib/sigapPengumuman";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { catatAudit } from "@/lib/sigapAkses";
import { HARI_MODAL_SIARAN, KODE_KEGIATAN_SIARAN, PERAN_PENERIMA_SIARAN, akhirModalSiaran, kunciBacaSiaran, type Siaran } from "@/lib/siaranPetugas";

export type Galat = { galat: string; status: number };

async function idKegiatanSiaran(db: Db): Promise<number | null> {
  const { data } = await db.from("sigap_kegiatan").select("id").eq("kode", KODE_KEGIATAN_SIARAN).maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

/**
 * Penerima siaran = petugas yang BENAR-BENAR ditugaskan pada kegiatan Pendataan Pascabencana (sigap_penugasan aktif, peran ppl/pml/korwil,
 * akun aktif; peserta tambahan administrasi tidak ikut). Bukan seluruh tabel bencana_petugas, yang memuat ratusan mitra terdaftar
 * (kandidat/cadangan) yang tidak bertugas (saat dibuat: 85 petugas = 1 korwil, 18 PML, 66 PPL).
 */
export async function akunPenerimaSiaran(db: Db): Promise<number[]> {
  const kegiatanId = await idKegiatanSiaran(db);
  if (!kegiatanId) return [];
  const { data: pen } = await db
    .from("sigap_penugasan")
    .select("akun_id")
    .eq("kegiatan_id", kegiatanId)
    .eq("aktif", true)
    .in("peran", [...PERAN_PENERIMA_SIARAN])
    .or("sumber.is.null,sumber.neq.administrasi")
    .limit(5000);
  const akunIds = [...new Set((pen ?? []).map((p) => p.akun_id as number))];
  if (!akunIds.length) return [];
  const { data: ak } = await db.from("sigap_akun").select("id").in("id", akunIds).eq("aktif", true);
  return (ak ?? []).map((a) => a.id as number);
}

/** Modal siaran yang masih berlaku dan BELUM dikonfirmasi akun ini. */
export async function modalUntukAkun(db: Db, akunId: number): Promise<PengumumanPeserta[]> {
  const kegiatanId = await idKegiatanSiaran(db);
  if (!kegiatanId) return [];
  const { data } = await db.from("sigap_pengumuman").select(KOLOM_PENGUMUMAN).eq("kegiatan_id", kegiatanId).eq("aktif", true).order("urut").order("id").limit(50);
  const sekarang = Date.now();
  const berlaku = ((data ?? []) as Pengumuman[]).filter((p) => (!p.mulai_at || sekarang >= new Date(p.mulai_at).getTime()) && (!p.akhir_at || sekarang < new Date(p.akhir_at).getTime()));
  if (!berlaku.length) return [];
  const { data: baca } = await db.from("sigap_audit").select("detail").eq("akun_id", akunId).eq("aksi", "siaran_pendataan_baca").limit(500);
  const sudah = new Set((baca ?? []).map((b) => kunciBacaSiaran(Number((b.detail as Record<string, unknown>)?.id), String((b.detail as Record<string, unknown>)?.versi))));
  return berlaku.filter((p) => !sudah.has(kunciBacaSiaran(p.id, p.diubah_at))).map(keBentukPeserta);
}

/** Catat konfirmasi (hanya bila modalnya memang modal siaran). */
export async function catatBaca(db: Db, akunId: number, id: number, versi: string): Promise<void> {
  const kegiatanId = await idKegiatanSiaran(db);
  if (!kegiatanId) return;
  const { data } = await db.from("sigap_pengumuman").select("id").eq("id", id).eq("kegiatan_id", kegiatanId).maybeSingle();
  if (!data) return;
  await catatAudit(db, akunId, "siaran_pendataan_baca", { id, versi: versi.slice(0, 64) });
}

export type RiwayatSiaran = { waktu: string; judul: string; oleh: string | null; akun: number; terkirim: number; modal: boolean; sudah_konfirmasi: number };

/** Ringkasan untuk admin: jumlah penerima, yang sudah mengaktifkan notifikasi, dan riwayat siaran. */
export async function ringkasSiaran(db: Db): Promise<{ push_siap: boolean; penerima: number; berlangganan: number; riwayat: RiwayatSiaran[] }> {
  const penerima = await akunPenerimaSiaran(db);
  let berlangganan = 0;
  if (penerima.length) {
    const { data } = await db.from("sigap_push_langganan").select("akun_id").eq("aktif", true).in("akun_id", penerima).limit(5000);
    berlangganan = new Set((data ?? []).map((x) => x.akun_id as number)).size;
  }
  const [{ data: sia }, { data: baca }] = await Promise.all([
    db.from("sigap_audit").select("akun_id, waktu, detail").eq("aksi", "siaran_pendataan").order("waktu", { ascending: false }).limit(10),
    db.from("sigap_audit").select("detail").eq("aksi", "siaran_pendataan_baca").limit(5000),
  ]);
  const hitung = new Map<number, number>();
  for (const b of baca ?? []) {
    const id = Number((b.detail as Record<string, unknown>)?.id);
    if (Number.isInteger(id)) hitung.set(id, (hitung.get(id) ?? 0) + 1);
  }
  const olehIds = [...new Set((sia ?? []).map((s) => s.akun_id as number | null).filter((x): x is number => !!x))];
  const { data: ak } = olehIds.length ? await db.from("sigap_akun").select("id, nama").in("id", olehIds) : { data: [] as { id: number; nama: string }[] };
  const nama = new Map((ak ?? []).map((a) => [a.id as number, String(a.nama ?? "")]));
  const riwayat: RiwayatSiaran[] = (sia ?? []).map((s) => {
    const d = (s.detail ?? {}) as Record<string, unknown>;
    const pid = Number(d.pengumuman_id);
    return {
      waktu: String(s.waktu),
      judul: String(d.judul ?? ""),
      oleh: nama.get(s.akun_id as number) ?? null,
      akun: Number(d.akun ?? 0),
      terkirim: Number(d.terkirim ?? 0),
      modal: Number.isInteger(pid) && pid > 0,
      sudah_konfirmasi: Number.isInteger(pid) ? hitung.get(pid) ?? 0 : 0,
    };
  });
  return { push_siap: pushSiap(), penerima: penerima.length, berlangganan, riwayat };
}

/** Kirim siaran: buat modal (bila diminta) lalu kirim push (bila diminta). Siaran kembar dalam 10 menit ditolak (cegah klik ganda). */
export async function siarkan(db: Db, akun: { id: number }, s: Siaran): Promise<{ akun: number; tanpa_notifikasi: number; perangkat: number; terkirim: number; gagal: number; modal: boolean; push: boolean } | Galat> {
  const kegiatanId = await idKegiatanSiaran(db);
  if (!kegiatanId) return { galat: "Kegiatan Pendataan Pascabencana belum ada.", status: 404 };
  if (s.push && !pushSiap()) return { galat: "Pengiriman notifikasi belum aktif: kunci VAPID belum dipasang di server.", status: 503 };

  const judulCek = s.push?.judul ?? s.modal?.judul ?? "";
  const { data: baru } = await db.from("sigap_audit").select("detail").eq("aksi", "siaran_pendataan").gte("waktu", new Date(Date.now() - 10 * 60_000).toISOString()).limit(50);
  if ((baru ?? []).some((b) => String((b.detail as Record<string, unknown>)?.judul ?? "") === judulCek)) return { galat: "Siaran dengan judul yang sama baru saja dikirim (kurang dari 10 menit lalu).", status: 409 };

  let pengumumanId: number | null = null;
  if (s.modal) {
    const { data: mx } = await db.from("sigap_pengumuman").select("urut").eq("kegiatan_id", kegiatanId).order("urut", { ascending: false }).limit(1).maybeSingle();
    const { data: ins, error } = await db
      .from("sigap_pengumuman")
      .insert({ kegiatan_id: kegiatanId, urut: ((mx?.urut as number | undefined) ?? 0) + 1, judul: s.modal.judul, jenis: s.modal.jenis, isi: s.modal.isi, frekuensi: "sekali", aktif: true, akhir_at: akhirModalSiaran(new Date()) })
      .select("id")
      .single();
    if (error || !ins) return { galat: "Modal gagal dibuat. Coba lagi.", status: 500 };
    pengumumanId = ins.id as number;
  }

  const penerima = await akunPenerimaSiaran(db);
  let h = { akun_berlangganan: [] as number[], perangkat: 0, terkirim: 0, gagal: 0 };
  if (s.push) {
    h = await kirimKeAkun(db, penerima, { ...s.push, tag: "siaran-pendataan" });
    await db.from("sigap_push_log").insert({
      kegiatan_id: kegiatanId,
      oleh_akun_id: akun.id,
      jenis: "siaran_pendataan",
      judul: s.push.judul,
      isi: s.push.isi,
      url: s.push.url,
      jumlah_akun: penerima.length,
      jumlah_perangkat: h.perangkat,
      terkirim: h.terkirim,
      gagal: h.gagal,
    });
  }
  await catatAudit(db, akun.id, "siaran_pendataan", { judul: judulCek, pengumuman_id: pengumumanId, akun: penerima.length, perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal, hari_modal: s.modal ? HARI_MODAL_SIARAN : 0 });
  return { akun: penerima.length, tanpa_notifikasi: s.push ? penerima.length - h.akun_berlangganan.length : 0, perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal, modal: !!s.modal, push: !!s.push };
}
