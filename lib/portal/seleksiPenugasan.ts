// lib/portal/seleksiPenugasan.ts  (hanya server)
//
// (31 Okt 2026) Peserta yang lulus dan menyatakan bersedia otomatis masuk penugasan kegiatan (sigap_penugasan, sumber "seleksi_<id>").
// Penugasan yang sudah ada (kegiatan + akun sama) tidak diubah. Peserta pelatihan mengikuti penugasan kegiatan.
// (1 Nov 2026) Kelas penugasan (sigap_penugasan.kelas) diisi dari perencanaan bila kegiatan tertaut ke identifikasi: satu-satunya kelas untuk peran itu (otomatis) atau
// kelas yang dipilih Mitra saat konfirmasi (sigap_seleksi_peserta.kelas_pilihan, SQL 20261101s; bila kolom belum ada dianggap tanpa pilihan). Tanpa tautan = kelas kosong seperti dulu.

import type { Db } from "@/lib/sigap";
import { tetapkanKelas } from "@/lib/sigapKelasIdent";
import { muatKelasTertaut } from "@/lib/portal/kelasIdent";

/** Nomor kelas untuk peserta ini, atau null (tanpa tautan / tanpa kelas untuk perannya / belum memilih). Tidak pernah melempar. */
export async function kelasUntukPenugasan(db: Db, o: { seleksiId: number; kegiatanId: number; akunId: number; peran: string }): Promise<number | null> {
  try {
    const kt = await muatKelasTertaut(db, o.kegiatanId, true);
    if (!kt.tersambung || kt.kelas.length === 0) return null;
    const { data } = await db.from("sigap_seleksi_peserta").select("kelas_pilihan").eq("seleksi_id", o.seleksiId).eq("akun_id", o.akunId).maybeSingle();
    const pilihan = (data as { kelas_pilihan?: number | null } | null)?.kelas_pilihan ?? null;
    return tetapkanKelas(kt.kelas, o.peran, pilihan).nomor;
  } catch {
    return null;
  }
}

export async function tugaskanPeserta(db: Db, o: { seleksiId: number; kegiatanId: number; akunId: number; peran: "ppl" | "pml" }): Promise<{ hasil: "ditambahkan" | "sudah_ada" | "gagal" }> {
  const { data: ada, error: e0 } = await db.from("sigap_penugasan").select("id").eq("kegiatan_id", o.kegiatanId).eq("akun_id", o.akunId).maybeSingle();
  if (e0) return { hasil: "gagal" };
  let hasil: "ditambahkan" | "sudah_ada" = "sudah_ada";
  if (!ada) {
    const kelas = await kelasUntukPenugasan(db, o);
    const { error } = await db.from("sigap_penugasan").insert({ kegiatan_id: o.kegiatanId, akun_id: o.akunId, peran: o.peran, aktif: true, sumber: `seleksi_${o.seleksiId}`, ...(kelas !== null ? { kelas } : {}) });
    if (error) return { hasil: "gagal" };
    hasil = "ditambahkan";
  }
  await db.from("sigap_seleksi_peserta").update({ ditugaskan_at: new Date().toISOString() }).eq("seleksi_id", o.seleksiId).eq("akun_id", o.akunId);
  return { hasil };
}
