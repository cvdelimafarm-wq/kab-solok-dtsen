// lib/portal/bebanCalon.ts  (hanya server)
//
// (1 Nov 2026) Data untuk peringatan beban calon petugas pada penunjukan langsung: delegasi aktif (keu_dlg_delegasi + riwayat target), hari libur Delego,
// dan penugasan aktif pada kegiatan lain. Hanya baca. Aturan: lib/sigapBebanCalon.ts, lib/delego/hitung.ts.

import type { Db } from "@/lib/sigap";
import { aturLibur, hariWib } from "@/lib/delego/hitung";
import type { Delegasi } from "@/lib/delego/tipe";
import { bebanMingguan, irisanPeriode, susunPeringatan, type MingguBeban, type PenugasanLain, type PeringatanCalon } from "@/lib/sigapBebanCalon";

export type BebanCalon = {
  akun: { id: number; nama: string; jenis: "organik" | "mitra" };
  hari: string;
  minggu: MingguBeban[];
  delegasi_aktif: number;
  penugasan_lain: PenugasanLain[];
  peringatan: PeringatanCalon;
};

type RowDlg = { id: number; penerima_akun: number; status: string; mulai: string; tenggat: string; hari_kerja: number[] | null; target_harian: number | string; target_total: number | string | null };
type RowTarget = { delegasi_id: number; berlaku_mulai: string; target_harian: number | string; alasan: string | null };

export async function bebanCalon(db: Db, akunId: number, kegiatanId: number, sekarang: Date = new Date()): Promise<BebanCalon | null> {
  const { data: a } = await db.from("sigap_akun").select("id, nama, jenis").eq("id", akunId).maybeSingle();
  if (!a) return null;
  const akun = { id: Number(a.id), nama: String(a.nama), jenis: (a.jenis === "mitra" ? "mitra" : "organik") as "organik" | "mitra" };
  const hari = hariWib(sekarang);

  // Libur Delego (kalender) supaya hitungan sama dengan layar Delego
  const { data: libur } = await db.from("keu_dlg_libur").select("tanggal, nama, aktif");
  aturLibur((libur ?? []) as { tanggal: string; nama: string; aktif: boolean }[]);

  const { data: dl } = await db.from("keu_dlg_delegasi").select("id, penerima_akun, status, mulai, tenggat, hari_kerja, target_harian, target_total").eq("penerima_akun", akunId).in("status", ["baru", "berjalan"]).limit(500);
  const rows = (dl ?? []) as RowDlg[];
  const ids = rows.map((r) => Number(r.id));
  const { data: tg } = ids.length > 0 ? await db.from("keu_dlg_target").select("delegasi_id, berlaku_mulai, target_harian, alasan").in("delegasi_id", ids).order("berlaku_mulai", { ascending: true }) : { data: [] as RowTarget[] };
  const riwayat = new Map<number, { berlaku_mulai: string; target_harian: number | string; alasan: string }[]>();
  for (const t of (tg ?? []) as RowTarget[]) {
    const l = riwayat.get(Number(t.delegasi_id)) ?? [];
    l.push({ berlaku_mulai: String(t.berlaku_mulai), target_harian: t.target_harian, alasan: String(t.alasan ?? "") });
    riwayat.set(Number(t.delegasi_id), l);
  }
  const delegasi = rows.map(
    (r) =>
      ({
        id: Number(r.id), penerima_akun: Number(r.penerima_akun), penerima_nama: akun.nama, penerima_jenis: akun.jenis, status: r.status, mulai: String(r.mulai).slice(0, 10), tenggat: String(r.tenggat).slice(0, 10),
        hari_kerja: (r.hari_kerja ?? []).map(Number), target_harian: r.target_harian, target_total: r.target_total, riwayat_target: riwayat.get(Number(r.id)),
      }) as unknown as Delegasi,
  );
  const { minggu, delegasiAktif } = bebanMingguan(delegasi, akun, hari, 4);

  // Penugasan aktif pada kegiatan lain + periodenya
  const { data: kini } = await db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai, target_selesai").eq("id", kegiatanId).maybeSingle();
  const periodeIni = { mulai: (kini?.tanggal_mulai as string | null) ?? null, selesai: ((kini?.tanggal_selesai as string | null) ?? (kini?.target_selesai as string | null)) ?? null };
  const { data: pen } = await db.from("sigap_penugasan").select("kegiatan_id, peran").eq("akun_id", akunId).eq("aktif", true).neq("kegiatan_id", kegiatanId).limit(100);
  const kIds = Array.from(new Set(((pen ?? []) as { kegiatan_id: number }[]).map((p) => Number(p.kegiatan_id))));
  const { data: kg } = kIds.length > 0 ? await db.from("sigap_kegiatan").select("id, nama, aktif, tanggal_mulai, tanggal_selesai, target_selesai").in("id", kIds).eq("aktif", true) : { data: [] as Record<string, unknown>[] };
  const petaKg = new Map<number, Record<string, unknown>>(((kg ?? []) as Record<string, unknown>[]).map((k) => [Number(k.id), k]));
  const lain: PenugasanLain[] = [];
  for (const p of (pen ?? []) as { kegiatan_id: number; peran: string }[]) {
    const k = petaKg.get(Number(p.kegiatan_id));
    if (!k) continue; // kegiatan nonaktif tidak dihitung
    const mulai = (k.tanggal_mulai as string | null) ?? null;
    const selesai = ((k.tanggal_selesai as string | null) ?? (k.target_selesai as string | null)) ?? null;
    lain.push({ kegiatan_id: Number(k.id), nama: String(k.nama), peran: String(p.peran), mulai, selesai, beririsan: irisanPeriode(periodeIni, { mulai, selesai }) });
  }

  return { akun, hari, minggu, delegasi_aktif: delegasiAktif, penugasan_lain: lain, peringatan: susunPeringatan(minggu, lain) };
}
