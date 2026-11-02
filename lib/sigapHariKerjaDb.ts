// lib/sigapHariKerjaDb.ts  (khusus server)
//
// (2 Nov 2026) Manajemen hari kerja pelatihan: memuat matriks peserta x tanggal dan mengubahnya (buat / lepas / pindah dari kegiatan lain).
// Tidak butuh SQL baru: memakai sigap_hari_kerja + sigap_hari_kerja_riwayat yang sudah ada. Aturan ada di lib/hariKerjaPelatihan.ts.

import type { Db } from "@/lib/sigap";
import { hariIniWib, rentangTanggal } from "@/lib/sigap";
import { FILTER_BUKAN_ADMINISTRASI } from "@/lib/sigapTesDb";
import { bangunMatriks, itemDariMatriks, kunciIsi, periksaItem, type Aksi, type BarisHK, type BarisMatriks, type Item, type PesertaHK } from "@/lib/hariKerjaPelatihan";

const PERAN_PESERTA = ["ppl", "pml", "korwil"];
const BATAS = 5000;

export type DataHariKerja = {
  kegiatan: { id: number; nama: string; tanggal_mulai: string | null; tanggal_selesai: string | null } | null;
  tanggal: string[];
  hari_ini: string;
  matriks: BarisMatriks[];
  baris: BarisHK[];
};

export async function muatHariKerja(db: Db, kegiatanId: number): Promise<DataHariKerja> {
  const hariIni = hariIniWib();
  const { data: keg } = await db.from("sigap_kegiatan").select("id, nama, tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle();
  if (!keg) return { kegiatan: null, tanggal: [], hari_ini: hariIni, matriks: [], baris: [] };
  const kegiatan = { id: keg.id as number, nama: String(keg.nama ?? ""), tanggal_mulai: (keg.tanggal_mulai as string | null) ?? null, tanggal_selesai: (keg.tanggal_selesai as string | null) ?? null };
  const tanggal = kegiatan.tanggal_mulai && kegiatan.tanggal_selesai ? rentangTanggal(kegiatan.tanggal_mulai, kegiatan.tanggal_selesai) : [];

  const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id, peran, maks_hari, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(BATAS);
  const penugasan = ((pen ?? []) as { id: number; akun_id: number; peran: string; maks_hari: number | null; kelas: number | null }[]).filter((p) => PERAN_PESERTA.includes(p.peran));
  if (penugasan.length === 0 || tanggal.length === 0) return { kegiatan, tanggal, hari_ini: hariIni, matriks: [], baris: [] };

  const akunIds = Array.from(new Set(penugasan.map((p) => p.akun_id)));
  const { data: akun } = await db.from("sigap_akun").select("id, nama").in("id", akunIds).limit(BATAS);
  const nama = new Map(((akun ?? []) as { id: number; nama: string }[]).map((a) => [a.id, a.nama]));
  const urutPeran: Record<string, number> = { korwil: 0, pml: 1, ppl: 2 };
  const peserta: PesertaHK[] = penugasan
    .map((p) => ({ penugasan_id: p.id, akun_id: p.akun_id, nama: nama.get(p.akun_id) ?? `Akun ${p.akun_id}`, peran: p.peran, maks_hari: p.maks_hari ?? null, kelas: p.kelas ?? null }))
    .sort((a, b) => (urutPeran[a.peran] ?? 9) - (urutPeran[b.peran] ?? 9) || a.nama.localeCompare(b.nama));

  const { data: hk } = await db.from("sigap_hari_kerja").select("id, penugasan_id, akun_id, tanggal, uji_coba_sampai").in("akun_id", akunIds).in("tanggal", tanggal).limit(BATAS);
  const hkMentah = (hk ?? []) as { id: number; penugasan_id: number; akun_id: number; tanggal: string; uji_coba_sampai: string | null }[];
  const penIds = Array.from(new Set(hkMentah.map((h) => h.penugasan_id)));
  const kegPer = new Map<number, number>();
  const namaKeg = new Map<number, string>();
  if (penIds.length) {
    const { data: p2 } = await db.from("sigap_penugasan").select("id, kegiatan_id").in("id", penIds).limit(BATAS);
    for (const p of (p2 ?? []) as { id: number; kegiatan_id: number }[]) kegPer.set(p.id, p.kegiatan_id);
    const kegIds = Array.from(new Set(Array.from(kegPer.values())));
    if (kegIds.length) {
      const { data: k2 } = await db.from("sigap_kegiatan").select("id, nama").in("id", kegIds);
      for (const k of (k2 ?? []) as { id: number; nama: string }[]) namaKeg.set(k.id, k.nama);
    }
  }
  const baris: BarisHK[] = hkMentah.map((h) => {
    const kid = kegPer.get(h.penugasan_id) ?? 0;
    return { id: h.id, penugasan_id: h.penugasan_id, akun_id: h.akun_id, tanggal: h.tanggal, uji_coba: h.uji_coba_sampai !== null && h.uji_coba_sampai !== undefined, kegiatan_id: kid, kegiatan_nama: namaKeg.get(kid) ?? `Kegiatan ${kid}` };
  });

  // hari yang sudah berisi (laporan, foto, izin susulan aktif) -- untuk baris hari kerja yang ada
  const terisi = new Set<string>();
  if (penIds.length) {
    const [r, f, i] = await Promise.all([
      db.from("sigap_realisasi").select("penugasan_id, tanggal").in("penugasan_id", penIds).in("tanggal", tanggal).limit(BATAS),
      db.from("sigap_dokumentasi").select("penugasan_id, tanggal").in("penugasan_id", penIds).in("tanggal", tanggal).limit(BATAS),
      db.from("sigap_izin_susulan").select("penugasan_id, tanggal").in("penugasan_id", penIds).in("tanggal", tanggal).gt("berlaku_sampai", new Date().toISOString()).limit(BATAS),
    ]);
    for (const x of [...(r.data ?? []), ...(f.data ?? []), ...(i.data ?? [])] as { penugasan_id: number; tanggal: string }[]) terisi.add(kunciIsi(x.penugasan_id, x.tanggal));
  }
  return { kegiatan, tanggal, hari_ini: hariIni, matriks: bangunMatriks(peserta, tanggal, baris, terisi, hariIni), baris };
}

export type HasilUbah = { berhasil: number; dilewati: { akun_id: number; nama: string; tanggal: string; alasan: string }[] };

/** Daftar item untuk tombol "semua": hitung dari matriks segar di server (klien tidak menentukan sendiri). */
export function itemSemua(data: DataHariKerja, aksi: Aksi): Item[] {
  return itemDariMatriks(data.matriks, aksi);
}

export async function ubahHariKerja(db: Db, kegiatanId: number, aksi: Aksi, items: Item[], namaAdmin: string, data?: DataHariKerja): Promise<HasilUbah> {
  const d = data ?? (await muatHariKerja(db, kegiatanId));
  const hasil: HasilUbah = { berhasil: 0, dilewati: [] };
  const oleh = `admin:${namaAdmin}`;
  const namaPelatihan = d.kegiatan?.nama ?? `Kegiatan ${kegiatanId}`;
  const gagal = (b: BarisMatriks | undefined, it: Item, alasan: string) => hasil.dilewati.push({ akun_id: it.akun_id, nama: b?.peserta.nama ?? `Akun ${it.akun_id}`, tanggal: it.tanggal, alasan });

  for (const it of items.slice(0, 2000)) {
    const b = d.matriks.find((x) => x.peserta.akun_id === it.akun_id);
    const tolak = periksaItem(d.matriks, aksi, it);
    if (tolak || !b) {
      gagal(b, it, tolak ?? "Bukan peserta pelatihan ini.");
      continue;
    }
    const sel = b.sel.find((x) => x.tanggal === it.tanggal)!;
    const penId = b.peserta.penugasan_id;
    const riwayat = async (rows: { penugasan_id: number; akun_id: number; tanggal: string; aksi: "tambah" | "hapus"; oleh: string; alasan?: string }[]) => {
      try {
        await db.from("sigap_hari_kerja_riwayat").insert(rows);
      } catch {
        /* riwayat bersifat tambahan */
      }
    };

    if (aksi === "buat") {
      const { error } = await db.from("sigap_hari_kerja").insert({ penugasan_id: penId, akun_id: it.akun_id, tanggal: it.tanggal });
      if (error) {
        gagal(b, it, "Gagal menyimpan (tanggal mungkin baru saja dipakai kegiatan lain).");
        continue;
      }
      await riwayat([{ penugasan_id: penId, akun_id: it.akun_id, tanggal: it.tanggal, aksi: "tambah", oleh, alasan: "dibuatkan admin" }]);
      b.terpakai++;
      sel.status = "ada";
      sel.bisa_buat = false;
      sel.bisa_lepas = true;
    } else if (aksi === "lepas") {
      const { error } = await db.from("sigap_hari_kerja").delete().eq("penugasan_id", penId).eq("tanggal", it.tanggal).is("uji_coba_sampai", null);
      if (error) {
        gagal(b, it, "Gagal melepas hari kerja.");
        continue;
      }
      await riwayat([{ penugasan_id: penId, akun_id: it.akun_id, tanggal: it.tanggal, aksi: "hapus", oleh, alasan: "dilepas admin" }]);
      b.terpakai--;
      sel.status = "kosong";
      sel.bisa_buat = it.tanggal >= d.hari_ini;
      sel.bisa_lepas = false;
    } else {
      const lain = d.baris.find((x) => x.akun_id === it.akun_id && x.tanggal === it.tanggal && x.penugasan_id !== penId);
      if (!lain) {
        gagal(b, it, "Hari kerja di kegiatan lain tidak ditemukan.");
        continue;
      }
      const { error: eHapus } = await db.from("sigap_hari_kerja").delete().eq("id", lain.id).is("uji_coba_sampai", null);
      if (eHapus) {
        gagal(b, it, "Gagal melepas hari kerja di kegiatan lain.");
        continue;
      }
      const { error: eTambah } = await db.from("sigap_hari_kerja").insert({ penugasan_id: penId, akun_id: it.akun_id, tanggal: it.tanggal });
      if (eTambah) {
        // kembalikan hari kerja di kegiatan lain supaya orang itu tidak kehilangan harinya
        await db.from("sigap_hari_kerja").insert({ penugasan_id: lain.penugasan_id, akun_id: it.akun_id, tanggal: it.tanggal });
        gagal(b, it, "Gagal memindahkan; hari kerja di kegiatan lain dikembalikan.");
        continue;
      }
      await riwayat([
        { penugasan_id: lain.penugasan_id, akun_id: it.akun_id, tanggal: it.tanggal, aksi: "hapus", oleh, alasan: `dipindah admin ke ${namaPelatihan}` },
        { penugasan_id: penId, akun_id: it.akun_id, tanggal: it.tanggal, aksi: "tambah", oleh, alasan: `dipindah admin dari ${lain.kegiatan_nama}` },
      ]);
      b.terpakai++;
      sel.status = "ada";
      sel.bisa_pindah = false;
      sel.bisa_lepas = true;
      sel.kegiatan_id = undefined;
      sel.kegiatan_nama = undefined;
    }
    hasil.berhasil++;
  }
  return hasil;
}
