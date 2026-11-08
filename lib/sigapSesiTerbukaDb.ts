// lib/sigapSesiTerbukaDb.ts  (hanya server)
//
// (9 Nov 2026) Daftar sesi yang sedang menunggu PESERTA ini (untuk modal pemblokir). Aturan murni di lib/sigapSesiTerbuka.ts.
// Hemat beban: pemantau klien memanggil tiap beberapa detik oleh semua peserta, jadi bacaan tingkat kegiatan/kelas di-cache singkat (dariCache) dan pemeriksaan per akun
// (sesi tes, gerbang undangan, kunci tahapan, isian roleplay, bergabung kuis) hanya dijalankan bila sesi benar-benar sedang terbuka. Semua galat = tidak ada modal.

import type { Db } from "@/lib/sigap";
import { dariCache, ruangKelas } from "@/lib/sigapKuisDb";
import { KELAS_GABUNGAN } from "@/lib/sigapKuis";
import { kelasEfektif, muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";
import { muatInstruktur } from "@/lib/sigapInstrukturDb";
import { muatSesi, muatTesDaftar, pesertaPelatihan } from "@/lib/sigapTesDb";
import { KOLOM_AGENDA, statusAgenda } from "@/lib/sigapAgenda";
import { bacaBarisAgenda } from "@/lib/sigapAgendaDb";
import { muatAturan } from "@/lib/sigapAturanDb";
import { hitungTahapan, kunciUntuk, type KodeTahap } from "@/lib/sigapTahapan";
import { muatIzin, muatTahapanBatch } from "@/lib/sigapTahapanDb";
import { periksaGerbang } from "@/lib/sigapPelatihanBaruDb";
import { muatIsian, muatRoleplay, peranRoleplay } from "@/lib/vanguardRoleplayDb";
import { ALAMAT_KUIS, alamatRoleplayPeserta, alamatTes, kuisPerluModal, namaSesi, roleplayPerluModal, tesPerluModal, urutkanSesi, type SesiTerbuka } from "@/lib/sigapSesiTerbuka";

const TTL_MS = 3000;

async function terkunciTahapan(db: Db, kegiatanId: number, akunId: number, jenis: KodeTahap, sekarangMs: number): Promise<boolean> {
  try {
    const [aturan, izin] = await Promise.all([muatAturan(db, kegiatanId), muatIzin(db, kegiatanId, [akunId], sekarangMs)]);
    if (!aturan.blokir_tahap) return false;
    const barisIzin = izin.peta.get(akunId) ?? [];
    const batch = await muatTahapanBatch(db, kegiatanId, [akunId], sekarangMs, aturan);
    const masukan = batch.masukan.get(akunId);
    if (!masukan) return false;
    // izin buka kunci yang berlaku sudah diperhitungkan di hitungTahapan lewat barisIzin (sama dengan rute tes)
    return kunciUntuk(hitungTahapan(masukan, true, barisIzin, sekarangMs), jenis) !== null;
  } catch {
    return true; // ragu = jangan memblokir
  }
}

export async function muatSesiTerbuka(db: Db, akunId: number, kegiatanId: number, sekarang: Date): Promise<SesiTerbuka[]> {
  const peserta = await pesertaPelatihan(db, akunId, kegiatanId);
  if (!peserta || peserta.peran === "panitia" || peserta.peran === "instruktur") return [];
  const instruktur = await dariCache(`stb:ins:${kegiatanId}`, 30_000, () => muatInstruktur(db, kegiatanId));
  if (instruktur.some((i) => i.akun_id === akunId)) return [];
  const daftarKelas = await dariCache(`stb:kls:${kegiatanId}`, 30_000, () => muatKelasKegiatan(db, kegiatanId));
  const kelas = kelasEfektif(peserta.kelas, daftarKelas) ?? peserta.kelas;
  const sekarangMs = sekarang.getTime();
  const hasil: SesiTerbuka[] = [];

  // ---- Pretest / Posttest dimulai instruktur
  if (kelas !== null) {
    const agenda = await dariCache(`stb:agd:${kegiatanId}:${kelas}`, TTL_MS, async () => {
      const { data, error } = await db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("kegiatan_id", kegiatanId).eq("kelas", kelas);
      return error || !data ? [] : (data as unknown[]).map(bacaBarisAgenda);
    });
    const aktif = agenda.filter((a) => a.mulai_at);
    if (aktif.length > 0) {
      const tes = await dariCache(`stb:tes:${kegiatanId}`, TTL_MS, () => muatTesDaftar(db, kegiatanId));
      for (const a of aktif) {
        const t = tes.find((x) => x.id === a.tes_id);
        if (!t || (t.jenis !== "pretest" && t.jenis !== "posttest")) continue;
        const sesi = await muatSesi(db, t.id, akunId);
        const putusan = tesPerluModal({ agenda: { status: statusAgenda(a, sekarang) }, tesAktif: !!t.aktif, terkunci: false, sesi: sesi ? { selesai_at: sesi.selesai_at, batas_at: sesi.batas_at } : null, sekarang });
        if (!putusan) continue;
        if ((await periksaGerbang(db, kegiatanId, akunId)) !== "boleh") continue;
        if (await terkunciTahapan(db, kegiatanId, akunId, t.jenis as KodeTahap, sekarangMs)) continue;
        hasil.push({ kunci: `tes-${t.id}`, jenis: t.jenis as "pretest" | "posttest", judul: namaSesi(t.jenis as "pretest" | "posttest"), lanjut: putusan === "lanjut", url: alamatTes(t.jenis) });
      }
    }
  }

  // ---- Roleplay Vanguard bareng kelas
  if (kelas !== null) {
    const rp = await dariCache(`stb:rp:${kegiatanId}:${kelas}`, TTL_MS, () => muatRoleplay(db, kegiatanId, kelas));
    if (rp && rp.status === "berjalan") {
      const p = await peranRoleplay(db, akunId, kegiatanId);
      if (p.peran === "peserta") {
        const isian = await muatIsian(db, rp.id, akunId);
        const sudahIsi = !!isian && ((isian.iv1?.length ?? 0) > 0 || Object.keys(isian.nilai ?? {}).length > 0);
        if (roleplayPerluModal({ status: "berjalan", sudahIsi })) hasil.push({ kunci: `rp-${rp.id}`, jenis: "roleplay", judul: namaSesi("roleplay"), lanjut: false, url: alamatRoleplayPeserta(kegiatanId) });
      }
    }
  }

  // ---- Kuis Adu Sigap: ruang kelasnya, atau ruang "Semua Kelas"
  for (const k of kelas === null ? [KELAS_GABUNGAN] : [kelas, KELAS_GABUNGAN]) {
    const ruang = await ruangKelas(db, kegiatanId, k);
    if (!ruang || ruang.status === "selesai") continue;
    const { data } = await db.from("sigap_kuis_peserta").select("akun_id").eq("ruang_id", ruang.id).eq("akun_id", akunId).maybeSingle();
    if (kuisPerluModal({ status: ruang.status, gabungTerlambat: !!ruang.pengaturan?.gabung_terlambat, sudahGabung: !!data })) {
      hasil.push({ kunci: `kuis-${ruang.id}`, jenis: "kuis", judul: namaSesi("kuis"), lanjut: false, url: ALAMAT_KUIS });
      break;
    }
  }

  return urutkanSesi(hasil);
}
