// lib/portal/seleksiPenugasan.ts  (hanya server)
//
// (31 Okt 2026) Peserta yang lulus dan menyatakan bersedia otomatis masuk penugasan kegiatan (sigap_penugasan, sumber "seleksi_<id>").
// Penugasan yang sudah ada (kegiatan + akun sama) tidak diubah. Peserta pelatihan mengikuti penugasan kegiatan.

import type { Db } from "@/lib/sigap";

export async function tugaskanPeserta(db: Db, o: { seleksiId: number; kegiatanId: number; akunId: number; peran: "ppl" | "pml" }): Promise<{ hasil: "ditambahkan" | "sudah_ada" | "gagal" }> {
  const { data: ada, error: e0 } = await db.from("sigap_penugasan").select("id").eq("kegiatan_id", o.kegiatanId).eq("akun_id", o.akunId).maybeSingle();
  if (e0) return { hasil: "gagal" };
  let hasil: "ditambahkan" | "sudah_ada" = "sudah_ada";
  if (!ada) {
    const { error } = await db.from("sigap_penugasan").insert({ kegiatan_id: o.kegiatanId, akun_id: o.akunId, peran: o.peran, aktif: true, sumber: `seleksi_${o.seleksiId}` });
    if (error) return { hasil: "gagal" };
    hasil = "ditambahkan";
  }
  await db.from("sigap_seleksi_peserta").update({ ditugaskan_at: new Date().toISOString() }).eq("seleksi_id", o.seleksiId).eq("akun_id", o.akunId);
  return { hasil };
}
