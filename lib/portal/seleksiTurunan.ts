// lib/portal/seleksiTurunan.ts  (hanya server)
//
// (1 Nov 2026) Usulan rancangan seleksi dari data yang ada (hanya baca): kebutuhan dari identifikasi lanjutan yang tertaut ke kegiatan + organik yang sudah di-plot,
// wilayah dari sampel yang diimpor PJ. Aturan: lib/seleksiTurunan.ts. Dipakai app/api/sigap/seleksi (?aksi=usulan).

import type { Db } from "@/lib/sigap";
import { muatLanjutanTertaut } from "@/lib/portal/kelasIdent";
import { dataSeleksiObjek } from "@/lib/portal/sampelObjek";
import { wilayahDariObjek } from "@/lib/seleksiTurunanObjek";
import { koordinatPerSls, usulanKebutuhan, wilayahDariSampel, type BarisSampelMin, type HasilWilayahSampel, type UsulanKebutuhan } from "@/lib/seleksiTurunan";

export type UsulanSeleksi = {
  identifikasi: { tersambung: boolean; nama: string | null; status_lanjutan: "draf" | "final" | null; versi: number | null };
  kebutuhan: (UsulanKebutuhan & { organik_ppl: number; organik_pml: number }) | null;
  /** `sumber`: model 1 (sigap_sampel, per SLS) atau daftar objek model 2/3 (per wilayah pada tingkat profil). */
  sampel: HasilWilayahSampel & { ada: boolean; sumber?: "sampel" | "objek"; model?: 2 | 3 | null; tanpa_wilayah?: number };
};

async function halaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: unknown }>, batas = 20): Promise<T[]> {
  const hasil: T[] = [];
  for (let i = 0; i < batas; i++) {
    const { data, error } = await ambil(i * 1000, i * 1000 + 999);
    if (error) break;
    hasil.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return hasil;
}

const tingkatKelompokSls = (t: string): boolean => t === "sls" || t === "sub_sls";

export async function usulanSeleksi(db: Db, kegiatanId: number): Promise<UsulanSeleksi> {
  const lanj = await muatLanjutanTertaut(db, kegiatanId);

  // Organik yang sudah di-plot pada kegiatan (penugasan aktif PPL/PML berakun organik, yaitu bukan Mitra)
  let kebutuhan: UsulanSeleksi["kebutuhan"] = null;
  if (lanj.isi) {
    const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran").eq("kegiatan_id", kegiatanId).eq("aktif", true).in("peran", ["ppl", "pml"]).limit(5000);
    const baris = (pen ?? []) as { akun_id: number; peran: string }[];
    const ids = Array.from(new Set(baris.map((r) => Number(r.akun_id))));
    const mitra = new Set<number>();
    if (ids.length > 0) {
      const { data: ak } = await db.from("sigap_akun").select("id, jenis").in("id", ids);
      for (const a of (ak ?? []) as { id: number; jenis: string }[]) if (a.jenis === "mitra") mitra.add(Number(a.id));
    }
    const organik = { ppl: 0, pml: 0 };
    for (const r of baris) if (!mitra.has(Number(r.akun_id))) organik[r.peran === "pml" ? "pml" : "ppl"]++;
    const u = usulanKebutuhan({ ppl: lanj.isi.peran.ppl, pml: lanj.isi.peran.pml }, organik);
    kebutuhan = { ...u, organik_ppl: organik.ppl, organik_pml: organik.pml };
  }

  // Sampel aktif (baris tanpa nonaktif_at) -> wilayah per SLS
  const sampel = await halaman<BarisSampelMin>((a, b) =>
    db.from("sigap_sampel").select("kode_wilayah, kode_sls, status, lat, lng").eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).order("id").range(a, b),
  );
  let hasil: HasilWilayahSampel = { wilayah: [], sls: 0, baris_utama: 0, tak_dikenal: 0, terpotong: 0 };
  if (sampel.length > 0) {
    const koord = koordinatPerSls(await halaman<{ idsubsls: string; lat: number; lon: number }>((a, b) => db.from("bencana_subsls_koordinat").select("idsubsls, lat, lon").order("idsubsls").range(a, b), 5));
    hasil = wilayahDariSampel(sampel, koord);
  }

  // (8 Nov 2026, D4) Tanpa sampel model 1: bila kegiatan memakai daftar objek model 2/3, wilayah diturunkan dari objek itu.
  if (sampel.length === 0) {
    try {
      const d = await dataSeleksiObjek(db, kegiatanId);
      if (d.ada && d.tingkat) {
        const koord = tingkatKelompokSls(d.tingkat) ? koordinatPerSls(await halaman<{ idsubsls: string; lat: number; lon: number }>((a, b) => db.from("bencana_subsls_koordinat").select("idsubsls, lat, lon").order("idsubsls").range(a, b), 5)) : new Map();
        const o = wilayahDariObjek(d.baris, d.tingkat, d.nama, koord);
        return {
          identifikasi: { tersambung: lanj.tersambung, nama: lanj.ident_nama, status_lanjutan: lanj.status_lanjutan, versi: lanj.versi },
          kebutuhan,
          sampel: { wilayah: o.wilayah, sls: o.jumlah_wilayah, baris_utama: o.sampel, tak_dikenal: o.tak_dikenal, terpotong: o.terpotong, ada: true, sumber: "objek", model: d.model, tanpa_wilayah: o.tanpa_wilayah },
        };
      }
    } catch {
      /* usulan hanya bantuan: abaikan dan tampilkan seperti belum ada sampel */
    }
  }

  return {
    identifikasi: { tersambung: lanj.tersambung, nama: lanj.ident_nama, status_lanjutan: lanj.status_lanjutan, versi: lanj.versi },
    kebutuhan,
    sampel: { ...hasil, ada: sampel.length > 0, sumber: "sampel" },
  };
}
