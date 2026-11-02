// lib/vanguardPengingatDb.ts  (khusus server)
//
// (2 Nov 2026) Pelaksana push terjadwal pengingat Vanguard. Dipanggil dari cron pengingat-push (mode auto, tiap 5 menit): di luar jendela pagi / sore langsung selesai tanpa kueri.
// Anti-ganda berlapis: klaim (tanggal, kegiatan, "vanguard_<jendela>") di sigap_push_klaim + catatan sigap_push_log (jenis vanguard_runtutan, isi "[kunci] ..." per penerima).
// Tanpa kolom aturan (SQL zp belum dijalankan) = tidak ada kegiatan bermode wajib = tidak ada kiriman.

import type { Db } from "@/lib/sigap";
import { kirimKeAkun } from "@/lib/sigapPush";
import { akunPanitiaPelatihan } from "@/lib/sigapIzinPush";
import { catatDenyut, klaimTahap, selesaiKlaim } from "@/lib/portal/pushTerkelola";
import { hariWib } from "@/lib/runtutanVanguard";
import { muatRuntutanBatch, tanggalBukaPretest } from "@/lib/vanguardRuntutanDb";
import { jendelaSekarang, kejadianUntuk, kunciKirimVg, kunciPjVg, pesanPetugas, pesanPj, type KejadianVg } from "@/lib/vanguardPengingat";

export const JENIS_LOG_VANGUARD = "vanguard_runtutan";
const AWALAN = "[kunci] ";
const HARI_MS = 86_400_000;

export type HasilPengingatVg = { dilewati?: string; jendela?: string; kegiatan: number[]; dikirim: number; perangkat: number; gagal: number; pj_dikirim: number; per_kejadian: Partial<Record<KejadianVg, number>> };

async function pesertaAktifIds(db: Db, kegiatanId: number): Promise<number[]> {
  const { data } = await db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).or("sumber.is.null,sumber.neq.administrasi").limit(5000);
  return Array.from(new Set(((data ?? []) as { akun_id: number }[]).map((r) => Number(r.akun_id))));
}

/** `uji` = hanya menghitung (tidak mengklaim, tidak mengirim, tidak mencatat). `paksa` = jendela di luar jamnya (hanya untuk uji). */
export async function jalankanPengingatVanguard(db: Db, nowMs: number, uji: boolean, paksa: "pagi" | "sore" | null = null): Promise<HasilPengingatVg> {
  const hasil: HasilPengingatVg = { kegiatan: [], dikirim: 0, perangkat: 0, gagal: 0, pj_dikirim: 0, per_kejadian: {} };
  const jendela = paksa && uji ? paksa : jendelaSekarang(nowMs);
  if (!jendela) return { ...hasil, dilewati: "di luar jendela" };
  hasil.jendela = jendela;
  const tanggal = hariWib(nowMs) as string;

  let kegiatanWajib: number[] = [];
  try {
    const { data, error } = await db.from("sigap_pelatihan_aturan").select("kegiatan_id").eq("vanguard_mode", "wajib");
    if (error) return { ...hasil, dilewati: "kolom aturan belum ada" };
    kegiatanWajib = ((data ?? []) as { kegiatan_id: number }[]).map((r) => Number(r.kegiatan_id));
  } catch {
    return { ...hasil, dilewati: "kolom aturan belum ada" };
  }
  if (kegiatanWajib.length === 0) return { ...hasil, dilewati: "tidak ada kegiatan bermode wajib" };

  // catatan kirim 14 hari terakhir (kunci bertanggal berlaku harian; "lewat_batas" sekali saja)
  const sudah = new Set<string>();
  try {
    const { data } = await db.from("sigap_push_log").select("oleh_akun_id, kegiatan_id, isi").eq("jenis", JENIS_LOG_VANGUARD).gte("dibuat_at", new Date(nowMs - 14 * HARI_MS).toISOString()).limit(20000);
    for (const r of (data ?? []) as { oleh_akun_id: number | null; isi: string | null }[]) {
      const isi = String(r.isi ?? "");
      if (isi.startsWith(AWALAN)) sudah.add(`${r.oleh_akun_id ?? 0}|${isi.slice(AWALAN.length)}`);
    }
  } catch {
    /* tanpa catatan: klaim tetap mencegah ganda dalam satu jendela */
  }

  for (const kegiatanId of kegiatanWajib) {
    try {
      if (!uji) {
        const klaim = await klaimTahap(db, tanggal, kegiatanId, `vanguard_${jendela}`, nowMs);
        if (klaim !== "baru" && klaim !== "lanjut") continue;
      }
      const ids = await pesertaAktifIds(db, kegiatanId);
      const { data: tes } = await db.from("sigap_tes").select("jenis, aktif, buka_at").eq("kegiatan_id", kegiatanId).eq("jenis", "pretest");
      const b = await muatRuntutanBatch(db, kegiatanId, ids, nowMs, tanggalBukaPretest((tes ?? []) as { jenis: string; aktif?: boolean; buka_at?: string | null }[]));
      if (!b.mengunci) {
        if (!uji) await selesaiKlaim(db, tanggal, kegiatanId, `vanguard_${jendela}`);
        continue;
      }
      hasil.kegiatan.push(kegiatanId);
      let lewat = 0;
      for (const [akunId, r] of b.peta) {
        const k = kejadianUntuk(r);
        if (!k) continue;
        if (k === "lewat_batas") lewat++;
        const kunci = kunciKirimVg(k, jendela, nowMs, kegiatanId);
        if (sudah.has(`${akunId}|${kunci}`)) continue;
        if (uji) {
          hasil.dikirim++;
          hasil.per_kejadian[k] = (hasil.per_kejadian[k] ?? 0) + 1;
          continue;
        }
        const pesan = pesanPetugas(k, r, kegiatanId);
        const h = await kirimKeAkun(db, [akunId], pesan);
        if (h.terkirim > 0) {
          hasil.dikirim++;
          hasil.perangkat += h.terkirim;
          hasil.per_kejadian[k] = (hasil.per_kejadian[k] ?? 0) + 1;
          await db.from("sigap_push_log").insert({ kegiatan_id: kegiatanId, oleh_akun_id: akunId, jenis: JENIS_LOG_VANGUARD, judul: pesan.judul, isi: `${AWALAN}${kunci}`, url: pesan.url, jumlah_akun: 1, jumlah_perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
        } else hasil.gagal++;
      }
      // PJ / panitia: sekali sehari (jendela sore) bila ada yang batas mulainya terlewat
      if (jendela === "sore" && lewat > 0) {
        const kunciPj = kunciPjVg(kegiatanId, nowMs);
        if (!sudah.has(`0|${kunciPj}`)) {
          if (uji) hasil.pj_dikirim++;
          else {
            const pesan = pesanPj(lewat, b.peta.size);
            const h = await kirimKeAkun(db, await akunPanitiaPelatihan(db), pesan);
            if (h.terkirim > 0) {
              hasil.pj_dikirim++;
              await db.from("sigap_push_log").insert({ kegiatan_id: kegiatanId, oleh_akun_id: null, jenis: JENIS_LOG_VANGUARD, judul: pesan.judul, isi: `${AWALAN}${kunciPj}`, url: pesan.url, jumlah_akun: h.akun_berlangganan.length, jumlah_perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
            }
          }
        }
      }
      if (!uji) await selesaiKlaim(db, tanggal, kegiatanId, `vanguard_${jendela}`);
    } catch (e) {
      hasil.gagal++;
      console.error("[vanguard pengingat]", kegiatanId, e instanceof Error ? e.message : e);
    }
  }
  if (!uji) await catatDenyut(db, "vanguard", { ...hasil, waktu: new Date(nowMs).toISOString() });
  return hasil;
}
