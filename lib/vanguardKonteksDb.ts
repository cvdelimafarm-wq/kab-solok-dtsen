// lib/vanguardKonteksDb.ts  (khusus server)
//
// (2 Nov 2026) Penentu KONTEKS PELATIHAN untuk layar Vanguard peserta (lib/konteksVanguard.ts).
// Peserta pelatihan = akun dengan penugasan aktif (bukan peserta tambahan administrasi) di kegiatan berjenis "pelatihan" yang aktif, belum lewat tanggal selesainya,
// dan Vanguard-nya menyala (centang / Identifikasi survei). Bila ada beberapa, yang bermode wajib/opsional didahulukan, lalu yang tanggal pelaksanaannya paling dekat.
// Bukan peserta pelatihan = null: tampilan lama tidak berubah. Hanya MEMBACA basis data.

import type { Db } from "@/lib/sigap";
import { keadaanVanguard } from "@/lib/vanguardAkses";
import { hariWib, tambahHari } from "@/lib/runtutanVanguard";
import { muatAturanVanguard, muatRuntutanBatch, tanggalBukaPretest } from "@/lib/vanguardRuntutanDb";
import type { KonteksPelatihan } from "@/lib/konteksVanguard";

const BUKAN_ADMINISTRASI = "sumber.is.null,sumber.neq.administrasi";

type Kandidat = { id: number; nama: string; tanggal_selesai: string | null; tanggal_mulai: string | null };

/** Status ujian sertifikasi akun (per akun; tabel tidak punya kegiatan_id). Gagal baca = null (kartu tidak menampilkan status). */
async function muatSertifikasiAkun(db: Db, akunId: number): Promise<{ selesai: boolean; tingkat: number | null } | null> {
  try {
    const { data, error } = await db.from("sigap_vanguard_ujian").select("tingkat, selesai_at").eq("akun_id", akunId).eq("jenis", "sertifikasi").not("selesai_at", "is", null).limit(200);
    if (error) return null;
    const t = ((data ?? []) as { tingkat: number | null }[]).map((x) => x.tingkat).filter((x): x is number => typeof x === "number");
    return t.length ? { selesai: true, tingkat: Math.max(...t) } : { selesai: false, tingkat: null };
  } catch {
    return null;
  }
}

export async function muatKonteksPelatihan(db: Db, akunId: number, sekarang: number): Promise<KonteksPelatihan | null> {
  try {
    const hariIni = hariWib(sekarang) as string;
    const { data: tug } = await db.from("sigap_penugasan").select("kegiatan_id").eq("akun_id", akunId).eq("aktif", true).or(BUKAN_ADMINISTRASI).limit(500);
    const ids = Array.from(new Set(((tug ?? []) as { kegiatan_id: number }[]).map((x) => Number(x.kegiatan_id))));
    if (ids.length === 0) return null;
    const { data: keg } = await db.from("sigap_kegiatan").select("id, nama, jenis, aktif, tanggal_mulai, tanggal_selesai").in("id", ids).eq("jenis", "pelatihan").eq("aktif", true);
    const kandidat = ((keg ?? []) as Kandidat[]).filter((k) => !k.tanggal_selesai || k.tanggal_selesai >= hariIni);
    const dipilih: { k: Kandidat; mode: string; urut: string }[] = [];
    for (const k of kandidat) {
      if (!(await keadaanVanguard(db, Number(k.id))).menyala) continue;
      const aturan = await muatAturanVanguard(db, Number(k.id));
      dipilih.push({ k, mode: aturan.mode, urut: k.tanggal_selesai ?? "9999-12-31" });
    }
    if (dipilih.length === 0) return null;
    dipilih.sort((a, b) => Number(b.mode !== "tidak_ada") - Number(a.mode !== "tidak_ada") || a.urut.localeCompare(b.urut) || a.k.id - b.k.id);
    const { k } = dipilih[0];
    const kegiatanId = Number(k.id);
    const aturan = await muatAturanVanguard(db, kegiatanId);
    const sertifikasi = await muatSertifikasiAkun(db, akunId);
    const dasar = { kegiatan_id: kegiatanId, nama: String(k.nama ?? ""), mode: aturan.mode, hari_berturut: aturan.hari_berturut, sesi_min_per_hari: aturan.sesi_min_per_hari, nilai_minimal: aturan.nilai_minimal, hari_ini: hariIni, sertifikasi };
    if (aturan.mode === "tidak_ada") return { ...dasar, tenggat: null, tenggat_sumber: null, mulai_paling_lambat: null, runtutan: null };
    const { data: tes } = await db.from("sigap_tes").select("jenis, aktif, buka_at").eq("kegiatan_id", kegiatanId).eq("jenis", "pretest");
    const b = await muatRuntutanBatch(db, kegiatanId, [akunId], sekarang, tanggalBukaPretest((tes ?? []) as { jenis: string; aktif?: boolean; buka_at?: string | null }[]), aturan);
    const r = b.peta.get(akunId);
    if (!b.berlaku || !r) return { ...dasar, mode: "tidak_ada", tenggat: null, tenggat_sumber: null, mulai_paling_lambat: null, runtutan: null };
    return {
      ...dasar,
      tenggat: b.tenggat,
      tenggat_sumber: b.tenggat_sumber,
      mulai_paling_lambat: r.kelayakan.batas_mulai ?? (b.tenggat ? tambahHari(b.tenggat, 1 - aturan.hari_berturut) : null),
      // Mode wajib: status Sertifikasi wajib mengikuti sumber yang sama dengan penguncian Pretest (sesi 60 hari terakhir), supaya kartu dan kunci tidak berbeda.
      sertifikasi: aturan.mode === "wajib" && dasar.sertifikasi ? { selesai: r.sertifikasi_selesai, tingkat: dasar.sertifikasi.tingkat } : dasar.sertifikasi,
      runtutan: { berturut: r.berturut, tuntas: r.tuntas, hari_ini_sudah: r.hari_ini_sudah, terputus: r.terputus, sesi_hari_ini: r.sesi_hari_ini, petak: r.petak, mungkin: r.kelayakan.mungkin, cadangan_hari: r.kelayakan.cadangan_hari, hari_terakhir_mulai: r.kelayakan.hari_terakhir_mulai },
    };
  } catch {
    return null;
  }
}
