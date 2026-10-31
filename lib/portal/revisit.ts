// lib/portal/revisit.ts  (hanya server)
//
// (31 Okt 2026) Penanda REVISIT per Sub SLS pendataan bencana (aturan: lib/revisit.ts; tabel: SQL 20261031c bencana_pendataan_revisit).
// Semua fungsi TAHAN tabel belum ada: sebelum SQL dijalankan, `tersedia` = false dan tidak ada Sub SLS bertanda, jadi aplikasi berjalan seperti biasa.

import type { Db } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";

const TABEL = "bencana_pendataan_revisit";

export type DataRevisit = { tersedia: boolean; aktif: string[] };

/** Semua Sub SLS yang sedang bertanda revisit. */
export async function daftarRevisit(db: Db): Promise<DataRevisit> {
  const { data, error } = await db.from(TABEL).select("idsubsls").eq("aktif", true).limit(5000);
  if (error) return { tersedia: false, aktif: [] };
  return { tersedia: true, aktif: (data ?? []).map((r) => r.idsubsls as string) };
}

/** Apakah satu Sub SLS sedang bertanda revisit (false bila tabel belum ada). */
export async function subBertandaRevisit(db: Db, idsubsls: string): Promise<boolean> {
  const { data, error } = await db.from(TABEL).select("idsubsls").eq("idsubsls", idsubsls).eq("aktif", true).maybeSingle();
  return !error && !!data;
}

/** Pasang / cabut tanda revisit. Hanya Sub SLS yang punya daftar KK aktif yang boleh dipasang; mencabut selalu boleh. */
export async function aturRevisit(db: Db, akunId: number, ids: string[], aktif: boolean): Promise<{ ok: true; diubah: number } | { ok: false; pesan: string; status: number }> {
  const awal = await daftarRevisit(db);
  if (!awal.tersedia) return { ok: false, pesan: "Fitur revisit belum aktif di database. Jalankan SQL 20261031c_pendataan_revisit.sql lebih dulu.", status: 409 };
  let sah = ids;
  if (aktif) {
    const ada = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from("bencana_pendataan_kk").select("idsubsls").in("idsubsls", ids.slice(i, i + 200)).eq("aktif", true).limit(5000);
      if (error) return { ok: false, pesan: "Gagal memeriksa daftar KK. Coba lagi.", status: 500 };
      for (const r of data ?? []) ada.add(r.idsubsls as string);
    }
    sah = ids.filter((id) => ada.has(id));
    if (sah.length === 0) return { ok: false, pesan: "Sub SLS yang dipilih belum punya daftar KK.", status: 409 };
  }
  const sekarang = new Date().toISOString();
  const { error } = await db.from(TABEL).upsert(sah.map((idsubsls) => ({ idsubsls, aktif, diatur_oleh: akunId, diatur_at: sekarang })), { onConflict: "idsubsls" });
  if (error) return { ok: false, pesan: "Gagal menyimpan tanda revisit. Coba lagi.", status: 500 };
  await catatAudit(db, akunId, aktif ? "pendataan_revisit_pasang" : "pendataan_revisit_cabut", { idsubsls: sah }).catch(() => undefined);
  return { ok: true, diubah: sah.length };
}
