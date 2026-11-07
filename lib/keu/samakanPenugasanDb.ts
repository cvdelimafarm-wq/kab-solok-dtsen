// lib/keu/samakanPenugasanDb.ts  (khusus server)
//
// (7 Nov 2026) Memuat dan menerapkan "Samakan dengan lanjutan" (pembanding murni: lib/keu/samakanPenugasan.ts).
// Hak: membaca = hak melihat usulan (diperiksa keu_usulan_penugasan di basis data); menerapkan = hak susun identifikasi RO (keu_boleh 'ident_susun') DAN izin Kelola
// menu `translok.penugasan` untuk kegiatan itu (sama dengan "Terapkan usulan"), serta lanjutan berstatus Final. Mode "masuk sebagai" ditolak di route.
// Penerapan memperbarui penugasan, lalu merapikan tabel turunan kegiatan itu (hierarki pelatihan dan Tim) supaya tidak menyisakan peran atau atasan lama.

import type { Db } from "@/lib/sigap";
import { catatAudit, izinAkun } from "@/lib/sigapAkses";
import { bolehKelolaKegiatan } from "@/lib/aturanLingkup";
import { panggilKeu } from "@/lib/keu/gerbang";
import { normalisasiUsulan } from "@/lib/keu/pelaksanaan";
import { selisihPenugasan, type AksiSamakan, type BarisPenugasanKegiatan, type BarisSuratTugas, type SelisihPenugasan } from "@/lib/keu/samakanPenugasan";

export type GalatSamakan = { ok: false; status: number; pesan: string };
export type DataSamakan = { ok: true; selisih: SelisihPenugasan[]; peringatan: string[]; final: boolean; lanjutan_ver: number | null; boleh_terapkan: boolean };

const PERAN_HIERARKI = new Set(["ppl", "pml", "korwil"]);

async function bolehTerapkan(db: Db, akunId: number, identId: number, roKode: string, kegiatanId: number): Promise<boolean> {
  const { izin } = await izinAkun(db, akunId);
  if (!bolehKelolaKegiatan(izin, "translok.penugasan", kegiatanId)) return false;
  const h = await panggilKeu<boolean>(db, akunId, "keu_boleh", { p_kew: "ident_susun", p_ro: roKode });
  return h.ok && h.data === true;
}

export async function muatSamakan(db: Db, akunId: number, identId: number, kegiatanId: number): Promise<DataSamakan | GalatSamakan> {
  const { data: ident } = await db.from("keu_ident").select("ro_kode").eq("id", identId).maybeSingle();
  const ro = (ident as { ro_kode?: string } | null)?.ro_kode;
  if (!ro) return { ok: false, status: 404, pesan: "Identifikasi tidak ditemukan." };

  const usulan = await panggilKeu(db, akunId, "keu_usulan_penugasan", { p_ident: identId, p_kegiatan: kegiatanId });
  if (!usulan.ok) return { ok: false, status: usulan.galat.status, pesan: usulan.galat.pesan };
  const butir = normalisasiUsulan(usulan.data);

  const { data: lj } = await db.from("keu_ident_lanjutan").select("ver, status, ver_hilir, status_hilir").eq("ident_id", identId).maybeSingle();
  const l = lj as { ver: number; status: string; ver_hilir: number | null; status_hilir: string | null } | null;
  const status = l ? (l.ver_hilir !== null ? l.status_hilir : l.status) : null;

  const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id, peran, aktif, sumber").eq("kegiatan_id", kegiatanId).limit(5000);
  const baris = (pen ?? []) as { id: number; akun_id: number; peran: string; aktif: boolean; sumber: string | null }[];
  const ids = Array.from(new Set(baris.map((b) => b.akun_id)));
  const { data: akun } = ids.length ? await db.from("sigap_akun").select("id, nama").in("id", ids).limit(5000) : { data: [] };
  const nama = new Map(((akun ?? []) as { id: number; nama: string }[]).map((a) => [a.id, a.nama]));
  const penugasan: BarisPenugasanKegiatan[] = baris.map((b) => ({ id: b.id, akun_id: b.akun_id, nama: nama.get(b.akun_id) ?? `Akun ${b.akun_id}`, peran: b.peran, aktif: b.aktif, sumber: b.sumber }));

  let surat: BarisSuratTugas[] = [];
  if (baris.length > 0) {
    const { data: st, error } = await db.from("sigap_surat_tugas").select("penugasan_id, nomor_st, peran_tertera").in("penugasan_id", baris.map((b) => b.id)).limit(5000);
    if (!error) surat = ((st ?? []) as { penugasan_id: number | null; nomor_st: string | null; peran_tertera: string | null }[]).filter((s) => s.penugasan_id !== null).map((s) => ({ penugasan_id: s.penugasan_id as number, nomor_st: s.nomor_st, peran_tertera: s.peran_tertera }));
  }
  let tarif: Set<string> | null = null;
  {
    const { data: t, error } = await db.from("sigap_kegiatan_tarif").select("peran").eq("kegiatan_id", kegiatanId).limit(500);
    if (!error) tarif = new Set(((t ?? []) as { peran: string }[]).map((x) => x.peran));
  }

  const { selisih, peringatan } = selisihPenugasan(butir, penugasan, surat, tarif);
  return { ok: true, selisih, peringatan, final: status === "final", lanjutan_ver: l ? (l.ver_hilir ?? l.ver) : null, boleh_terapkan: await bolehTerapkan(db, akunId, identId, ro, kegiatanId) };
}

export type HasilTerapSamakan = {
  ok: true;
  diterapkan: number;
  dilewati: number;
  /** Bawahan yang atasannya dinonaktifkan: atasan mereka dikosongkan di hierarki dan Tim, perlu diatur ulang. */
  tanpa_atasan: string[];
  /** Surat tugas yang memuat peran lama (perlu diterbitkan ulang). */
  surat_perlu_terbit: { nama: string; nomor_st: string | null; peran_tertera: string | null }[];
};

export async function terapkanSamakan(db: Db, akunId: number, namaPelaku: string, identId: number, kegiatanId: number, pilihan: readonly { akun_id: number; aksi: AksiSamakan }[]): Promise<HasilTerapSamakan | GalatSamakan> {
  const data = await muatSamakan(db, akunId, identId, kegiatanId);
  if (!data.ok) return data;
  if (!data.boleh_terapkan) return { ok: false, status: 403, pesan: "Menyamakan penugasan memerlukan hak menyusun identifikasi RO ini dan izin Kelola pada menu Penugasan (Transport Lokal) untuk kegiatan itu." };
  if (!data.final) return { ok: false, status: 409, pesan: "Penyamaan hanya dapat diterapkan dari identifikasi lanjutan yang Final." };
  const terap = data.selisih.filter((s) => s.bisa && pilihan.some((p) => p.akun_id === s.akun_id && p.aksi === s.aksi));
  if (terap.length === 0) return { ok: false, status: 409, pesan: "Tidak ada perubahan terpilih yang masih berlaku. Data sudah berubah: muat ulang daftar." };

  const dicabut = terap.filter((s) => s.aksi === "cabut").map((s) => s.akun_id);
  const diubah = terap.filter((s) => s.aksi === "ubah_peran" && s.ke.peran !== null);

  for (const s of terap) {
    const patch = s.aksi === "cabut" ? { aktif: false } : s.aksi === "aktifkan" ? { aktif: true, peran: s.ke.peran } : { peran: s.ke.peran };
    const { error } = await db.from("sigap_penugasan").update(patch).eq("id", s.penugasan_id).eq("kegiatan_id", kegiatanId);
    if (error) return { ok: false, status: 500, pesan: `Gagal memperbarui penugasan ${s.nama}. Perubahan sebelumnya mungkin sudah tersimpan; muat ulang daftar.` };
  }

  // tabel turunan kegiatan ini: hierarki pelatihan dan Tim
  const tanpaAtasan: string[] = [];
  try {
    for (const s of diubah) {
      if (PERAN_HIERARKI.has(s.ke.peran as string)) await db.from("sigap_pelatihan_hierarki").update({ peran_pelatihan: s.ke.peran, sumber: "manual", diubah_oleh: namaPelaku.slice(0, 120), diubah_at: new Date().toISOString() }).eq("kegiatan_id", kegiatanId).eq("akun_id", s.akun_id);
      await db.from("sigap_tim").update({ peran: s.ke.peran }).eq("kegiatan_id", kegiatanId).eq("akun_id", s.akun_id);
    }
    if (dicabut.length > 0) {
      const [{ data: h }, { data: t }] = await Promise.all([
        db.from("sigap_pelatihan_hierarki").select("akun_id").eq("kegiatan_id", kegiatanId).in("atasan_akun_id", dicabut).limit(5000),
        db.from("sigap_tim").select("akun_id").eq("kegiatan_id", kegiatanId).in("atasan_akun_id", dicabut).limit(5000),
      ]);
      const bawahan = Array.from(new Set([...((h ?? []) as { akun_id: number }[]), ...((t ?? []) as { akun_id: number }[])].map((x) => x.akun_id)));
      await db.from("sigap_pelatihan_hierarki").delete().eq("kegiatan_id", kegiatanId).in("akun_id", dicabut);
      await db.from("sigap_tim").delete().eq("kegiatan_id", kegiatanId).in("akun_id", dicabut);
      await db.from("sigap_pelatihan_hierarki").update({ atasan_akun_id: null, sumber: "manual", diubah_oleh: namaPelaku.slice(0, 120), diubah_at: new Date().toISOString() }).eq("kegiatan_id", kegiatanId).in("atasan_akun_id", dicabut);
      await db.from("sigap_tim").update({ atasan_akun_id: null }).eq("kegiatan_id", kegiatanId).in("atasan_akun_id", dicabut);
      if (bawahan.length > 0) {
        const { data: n } = await db.from("sigap_akun").select("id, nama").in("id", bawahan).limit(5000);
        for (const a of (n ?? []) as { id: number; nama: string }[]) tanpaAtasan.push(a.nama);
      }
    }
  } catch {
    /* tabel turunan gagal dirapikan: penugasan sudah benar; hierarki/Tim dapat disamakan dari layar Kelola Pelatihan */
  }

  await catatAudit(db, akunId, "keu.samakan_penugasan", {
    ident_id: identId,
    kegiatan_id: kegiatanId,
    lanjutan_ver: data.lanjutan_ver,
    tindakan: terap.map((s) => ({ akun_id: s.akun_id, aksi: s.aksi, dari: s.dari, ke: s.ke })),
  });
  const surat = terap.flatMap((s) => s.surat.map((x) => ({ nama: s.nama, nomor_st: x.nomor_st, peran_tertera: x.peran_tertera })));
  return { ok: true, diterapkan: terap.length, dilewati: data.selisih.length - terap.length, tanpa_atasan: tanpaAtasan, surat_perlu_terbit: surat };
}
