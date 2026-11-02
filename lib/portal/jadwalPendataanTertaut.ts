// lib/portal/jadwalPendataanTertaut.ts  (hanya server)
//
// (3 Nov 2026) Jadwal PENDATAAN dari Identifikasi survei yang tertaut ke kegiatan (keu_ident_kegiatan, dilepas_at null) untuk kartu "Jadwal pendataan" di tab Hari ini peserta.
// Sumber tanggal sama dengan "Peta jadwal" Identifikasi: jadwalPendataan() (pembaruan H-15 bila ada, kalau tidak jendela periode dari formulir) dan penanda Fix / Perkiraan
// dari petaJadwal(). Hanya BACA dan tahan galat: tanpa tautan, tanpa pendataan, tabel / kolom belum ada, atau isi rusak -> null dan kartu tidak tampil.

import type { Db } from "@/lib/sigap";
import { adaPendataan, normalisasi } from "@/lib/keu/identifikasi";
import { jadwalPendataan } from "@/lib/keu/lanjutan";
import { petaJadwal } from "@/lib/keu/petaJadwal";
import type { JadwalPendataanKartu } from "@/lib/jadwalPendataanTampil";

type Upd = Record<string, { mulai: string; selesai: string }>;

export async function muatJadwalPendataanTertaut(db: Db, kegiatanId: number): Promise<JadwalPendataanKartu | null> {
  try {
    const { data: tautan, error } = await db.from("keu_ident_kegiatan").select("ident_id, ditautkan_at").eq("kegiatan_id", kegiatanId).is("dilepas_at", null).order("ditautkan_at", { ascending: false }).limit(5);
    if (error || !tautan || tautan.length === 0) return null;
    for (const t of tautan as { ident_id: number }[]) {
      const id = Number(t.ident_id);
      let { data: ident, error: e1 } = await db.from("keu_ident").select("nama, status, ver, tahun, upd").eq("id", id).maybeSingle();
      if (e1) ({ data: ident } = await db.from("keu_ident").select("nama, status, ver, tahun").eq("id", id).maybeSingle()); // kolom upd belum ada
      const i = ident as { nama?: unknown; status?: unknown; ver?: unknown; tahun?: unknown; upd?: unknown } | null;
      if (!i || i.status === "dibatalkan" || !(Number(i.ver) >= 1)) continue;
      const { data: versi } = await db.from("keu_ident_versi").select("form").eq("ident_id", id).order("ver", { ascending: false }).limit(1).maybeSingle();
      const mentah = (versi as { form: unknown } | null)?.form;
      if (!mentah) continue;
      const f = normalisasi(mentah);
      if (!adaPendataan(f)) continue;
      const tahun = Number(i.tahun);
      if (!Number.isFinite(tahun)) continue;
      const upd = i.upd && typeof i.upd === "object" ? (i.upd as Upd) : null;
      const periode = jadwalPendataan(f, tahun, upd)
        .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.mulai) && /^\d{4}-\d{2}-\d{2}$/.test(p.selesai))
        .map((p) => ({
          periode: p.periode,
          mulai: p.mulai,
          selesai: p.selesai,
          // pembaruan H-15 = tanggal sudah pasti; selain itu ikut penanda "Perkiraan" pada Peta jadwal
          perkiraan: upd?.[p.periode] ? false : (petaJadwal(f, p.periode, tahun).baris.find((b) => b.kunci === "pendataan")?.perk ?? true),
        }));
      if (periode.length === 0) continue;
      return { sumber: String(i.nama ?? ""), periode };
    }
    return null;
  } catch {
    return null;
  }
}
