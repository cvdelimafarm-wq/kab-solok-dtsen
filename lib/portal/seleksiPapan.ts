// lib/portal/seleksiPapan.ts  (hanya server)
//
// (31 Okt 2026) Papan penilaian seleksi: gabungan pendaftar + nilai tiap variabel + skor akhir + peringkat usulan + hasil tersimpan.
// Dipakai app/api/sigap/seleksi-nilai (PJ/admin) dan aksi tetapkan/umumkan. Aturan hitung: lib/seleksiNilai.ts. Kelayakan: lib/seleksiSyarat.ts.

import type { Db } from "@/lib/sigap";
import { bacaSyarat, nilaiKelayakan, sisaKebutuhan, type PeringkatLevel, type WilayahSeleksi } from "@/lib/seleksiSyarat";
import {
  grupPeserta, JARAK_NOL_BAWAAN_KM, kuotaGrup, levelEfektif, nilaiJarak, nilaiRekamJejak, skorAkhir, susunPeringkat,
  type Hasil, type Peran, type PesertaNilai, type Variabel,
} from "@/lib/seleksiNilai";
import { bacaWilayah } from "@/lib/portal/seleksiKandidat";

export type SeleksiLengkap = {
  id: number; kegiatan_id: number; nama: string; jalur: string; status: string; kebutuhan_ppl: number; kebutuhan_pml: number; sudah_ppl: number; sudah_pml: number;
  syarat: unknown; peringkat_level: string; tampil_nilai: boolean; jadwal_tutup: string | null;
  tes_aktif: boolean; tes_buka_at: string | null; tes_tutup_at: string | null; tes_durasi_menit: number;
  info_pelatihan: string | null; ditetapkan_at: string | null; diumumkan_at: string | null; konfirmasi_batas: string | null;
};

export const KOLOM_LENGKAP =
  "id, kegiatan_id, nama, jalur, status, kebutuhan_ppl, kebutuhan_pml, sudah_ppl, sudah_pml, syarat, peringkat_level, tampil_nilai, jadwal_tutup, tes_aktif, tes_buka_at, tes_tutup_at, tes_durasi_menit, info_pelatihan, ditetapkan_at, diumumkan_at, konfirmasi_batas";

export async function muatSeleksiLengkap(db: Db, id: number): Promise<{ baris: SeleksiLengkap | null; siap: boolean }> {
  const { data, error } = await db.from("sigap_seleksi").select(KOLOM_LENGKAP).eq("id", id).maybeSingle();
  if (error) return { baris: null, siap: false };
  return { baris: (data as SeleksiLengkap | null) ?? null, siap: true };
}

export async function bacaVariabel(db: Db, seleksiId: number): Promise<Variabel[]> {
  const { data } = await db.from("sigap_seleksi_variabel").select("id, kode, nama, sumber, bobot, urutan").eq("seleksi_id", seleksiId).order("urutan").order("id");
  return ((data ?? []) as { id: number; kode: string; nama: string; sumber: Variabel["sumber"]; bobot: number | string; urutan: number }[]).map((v) => ({ ...v, bobot: Number(v.bobot) }));
}

async function dalamPotongan<T>(ids: number[], ambil: (potong: number[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await ambil(ids.slice(i, i + 200));
    hasil.push(...(data ?? []));
  }
  return hasil;
}

export type BarisPapan = {
  akun_id: number; nama: string; peran: Peran; kecamatan: string | null; nagari: string | null;
  kelayakan: "memenuhi" | "tidak" | "perlu_lokasi"; jarak_km: number | null; wilayah_terdekat: string | null;
  nilai: Record<string, number | null>; skor: number; kosong: number; grup: string; peringkat: number; usulan: Hasil;
  hasil: Hasil | null; peringkat_tersimpan: number | null; skor_tersimpan: number | null; konfirmasi: string | null; ditugaskan: boolean;
};

export type Papan = {
  variabel: Variabel[];
  baris: BarisPapan[];
  level: PeringkatLevel;
  catatan_level: string | null;
  sisa: { ppl: number; pml: number };
  kuota: { grup: string; peran: Peran; kuota: number; pendaftar: number }[];
  tes: { jumlah_soal: number; selesai: number };
};

export async function bacaPapan(db: Db, s: SeleksiLengkap): Promise<Papan> {
  const variabel = await bacaVariabel(db, s.id);
  const wilayah: WilayahSeleksi[] = await bacaWilayah(db, s.id);
  const syarat = bacaSyarat(s.syarat);
  const sisa = { ppl: sisaKebutuhan(s.kebutuhan_ppl, s.sudah_ppl), pml: sisaKebutuhan(s.kebutuhan_pml, s.sudah_pml) };

  const { data: pes } = await db
    .from("sigap_seleksi_peserta")
    .select("akun_id, peran, status, hasil, peringkat, skor_akhir, konfirmasi, ditugaskan_at")
    .eq("seleksi_id", s.id)
    .eq("status", "terdaftar");
  const peserta = (pes ?? []) as { akun_id: number; peran: Peran; hasil: Hasil | null; peringkat: number | null; skor_akhir: number | string | null; konfirmasi: string | null; ditugaskan_at: string | null }[];
  const ids = peserta.map((p) => p.akun_id);

  const akun = await dalamPotongan<{ id: number; nama: string; alamat_kecamatan: string | null; domisili_lat: number | null; domisili_lng: number | null; mitra_id: number | null; petugas_bencana_id: number | null }>(ids, (c) =>
    db.from("sigap_akun").select("id, nama, alamat_kecamatan, domisili_lat, domisili_lng, mitra_id, petugas_bencana_id").in("id", c),
  );
  const akunPer = new Map(akun.map((a) => [a.id, a]));

  const mitraIds = akun.map((a) => a.mitra_id).filter((x): x is number => typeof x === "number");
  const desa = new Map((await dalamPotongan<{ id: number; alamat_desa: string | null }>(mitraIds, (c) => db.from("bencana_mitra").select("id, alamat_desa").in("id", c))).map((m) => [m.id, m.alamat_desa]));

  const petugasIds = akun.map((a) => a.petugas_bencana_id).filter((x): x is number => typeof x === "number");
  const kinerja = new Map((await dalamPotongan<{ id: number; nilai_kinerja: number | null }>(petugasIds, (c) => db.from("bencana_petugas").select("id, nilai_kinerja").in("id", c))).map((p) => [p.id, p.nilai_kinerja]));

  const sesiTes = new Map<number, number | null>();
  const { data: ses } = await db.from("sigap_seleksi_sesi").select("akun_id, skor, selesai_at, batas_at").eq("seleksi_id", s.id);
  let selesai = 0;
  for (const x of (ses ?? []) as { akun_id: number; skor: number | string | null; selesai_at: string | null; batas_at: string }[]) {
    const sudah = !!x.selesai_at || Date.now() >= Date.parse(x.batas_at);
    if (sudah) selesai++;
    sesiTes.set(x.akun_id, sudah && x.skor !== null ? Number(x.skor) : null);
  }
  const { count: jumlahSoal } = await db.from("sigap_seleksi_soal").select("nomor", { count: "exact", head: true }).eq("seleksi_id", s.id);

  const manual = new Map<string, number>();
  const idManual = variabel.filter((v) => v.sumber === "manual").map((v) => v.id);
  if (idManual.length) {
    const { data: nm } = await db.from("sigap_seleksi_nilai").select("variabel_id, akun_id, nilai").in("variabel_id", idManual);
    for (const n of (nm ?? []) as { variabel_id: number; akun_id: number; nilai: number | string }[]) manual.set(`${n.variabel_id}:${n.akun_id}`, Number(n.nilai));
  }

  const { level, catatan } = levelEfektif(s.peringkat_level as PeringkatLevel, wilayah);
  const maksJarak = syarat.jarak.aktif ? syarat.jarak.maks_km : JARAK_NOL_BAWAAN_KM;

  const mentah = peserta.map((p) => {
    const a = akunPer.get(p.akun_id);
    const nagari = a?.mitra_id ? desa.get(a.mitra_id) ?? null : null;
    const lok = { id: p.akun_id, nama: a?.nama ?? `#${p.akun_id}`, kecamatan: a?.alamat_kecamatan ?? null, nagari, lat: a?.domisili_lat ?? null, lng: a?.domisili_lng ?? null };
    const kel = nilaiKelayakan(lok, wilayah, syarat);
    const nilai = new Map<number, number | null>();
    for (const v of variabel) {
      const n =
        v.sumber === "tes" ? sesiTes.get(p.akun_id) ?? null
        : v.sumber === "rekam_jejak" ? nilaiRekamJejak(a?.petugas_bencana_id ? kinerja.get(a.petugas_bencana_id) : null)
        : v.sumber === "jarak" ? nilaiJarak(kel.jarak_km, maksJarak)
        : manual.get(`${v.id}:${p.akun_id}`) ?? null;
      nilai.set(v.id, n);
    }
    const sk = skorAkhir(variabel, nilai);
    const grup = grupPeserta(level, lok, wilayah, kel.wilayah_terdekat);
    return { p, lok, kel, nilai, sk, grup };
  });

  const nilaiPeserta: PesertaNilai[] = mentah.map((m) => ({ akun_id: m.p.akun_id, nama: m.lok.nama, peran: m.p.peran, grup: m.grup, skor: m.sk.skor, kosong: m.sk.kosong.length }));
  const peringkat = susunPeringkat(nilaiPeserta, (g, r) => kuotaGrup(level, wilayah, sisa, g, r));
  const peta = new Map(peringkat.map((h) => [h.akun_id, h]));

  const baris: BarisPapan[] = mentah
    .map((m) => {
      const h = peta.get(m.p.akun_id)!;
      const nilai: Record<string, number | null> = {};
      for (const v of variabel) nilai[String(v.id)] = m.nilai.get(v.id) ?? null;
      return {
        akun_id: m.p.akun_id, nama: m.lok.nama, peran: m.p.peran, kecamatan: m.lok.kecamatan, nagari: m.lok.nagari,
        kelayakan: m.kel.status, jarak_km: m.kel.jarak_km, wilayah_terdekat: m.kel.wilayah_terdekat,
        nilai, skor: m.sk.skor, kosong: m.sk.kosong.length, grup: m.grup, peringkat: h.peringkat, usulan: h.hasil,
        hasil: m.p.hasil, peringkat_tersimpan: m.p.peringkat, skor_tersimpan: m.p.skor_akhir === null ? null : Number(m.p.skor_akhir), konfirmasi: m.p.konfirmasi, ditugaskan: !!m.p.ditugaskan_at,
      };
    })
    .sort((a, b) => a.grup.localeCompare(b.grup, "id") || a.peran.localeCompare(b.peran) || a.peringkat - b.peringkat);

  const kunci = new Map<string, { grup: string; peran: Peran; pendaftar: number }>();
  for (const b of baris) {
    const k = `${b.grup}|${b.peran}`;
    const x = kunci.get(k);
    if (x) x.pendaftar++;
    else kunci.set(k, { grup: b.grup, peran: b.peran, pendaftar: 1 });
  }
  const kuota = [...kunci.values()].map((x) => ({ ...x, kuota: kuotaGrup(level, wilayah, sisa, x.grup, x.peran) }));

  return { variabel, baris, level, catatan_level: catatan, sisa, kuota, tes: { jumlah_soal: jumlahSoal ?? 0, selesai } };
}
