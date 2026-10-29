// lib/sigapQcMonitor.ts  (murni; dipakai server DAN klien)
//
// (29 Okt 2026) Daftar petugas + pemantauan QC Pemahaman untuk Supervisor SPDT NTP: per petugas (percobaan, nilai, status push, apakah sudah
// membuka SIGAP sejak soal dirilis = modal pemblokir sudah muncul) dan ringkasan. Server hanya mengumpulkan baris mentah; aturan ada di sini agar diuji.
//
// Tentang "modal sudah masuk": modal wajib QC muncul begitu petugas membuka SIGAP sesudah jam rilis dan belum lulus. Tidak ada catatan "modal
// tampil" tersendiri, jadi tanda yang dipakai: petugas punya sesi SIGAP aktif sejak jam rilis (sigap_log_sesi), atau sudah mengisi, atau sudah menekan
// "tunda". Belum satu pun dari itu = modal belum pernah sampai ke petugas itu.
// Tentang "push masuk": tercatat dikirim = baris di sigap_qc_kirim (dicatat penjadwal SEBELUM mengirim). Perangkat bisa menerima = punya langganan push aktif.

export type PesertaMentah = { akun_id: number; nama: string; peran: string; pml_akun_id: number | null; pml_nama: string | null };
export type PercobaanMentah = { akun_id: number; ke: number; skor: number; benar: number; jumlah: number; terlambat: boolean; selesai_at: string };
export type LanggananMentah = { akun_id: number; gagal: number; terakhir_ok_at: string | null };
export type KirimMentah = { akun_id: number; jenis: string; dibuat_at: string };
export type SesiMentah = { akun_id: number; terakhir_aktif_at: string };

export type PetugasQc = {
  akun_id: number;
  nama: string;
  peran: "pml" | "ppl";
  pml_akun_id: number | null;
  pml_nama: string | null;
  percobaan: number;
  skor_awal: number | null;
  skor_terbaik: number | null;
  lulus: boolean;
  terlambat: boolean;
  selesai_at: string | null;
  /** jumlah perangkat dengan langganan push aktif */
  perangkat: number;
  /** ada langganan aktif yang gagal berulang (>= 3) dan tidak ada yang sehat */
  push_bermasalah: boolean;
  /** waktu push rilis tercatat dikirim, atau null */
  push_rilis_at: string | null;
  /** jumlah pengingat tercatat dikirim */
  push_ingat: number;
  /** terakhir aktif di SIGAP sejak rilis, atau null */
  buka_at: string | null;
  tunda: boolean;
  /** modal sudah sampai (lihat catatan di atas) */
  modal_sampai: boolean;
};

export type MonitoringQc = {
  peserta: number;
  /** punya perangkat dengan push aktif */
  push_aktif: number;
  push_rilis_dikirim: number;
  push_ingat_dikirim: number;
  /** pernah menerima/ada catatan push apa pun pada hari ini */
  modal_sampai: number;
  belum_buka: number;
  sudah_mengisi: number;
  lulus: number;
  tunda: number;
  /** penjadwal (cron) terdeteksi hidup: ada catatan kirim apa pun untuk survei ini pada hari ini */
  penjadwal_terdeteksi: boolean;
  /** jam rilis sudah lewat > 15 menit tetapi tidak ada catatan push rilis sama sekali */
  peringatan_penjadwal: boolean;
};

const tAda = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);

export function susunPetugasQc(a: {
  peserta: PesertaMentah[];
  percobaan: PercobaanMentah[];
  langganan: LanggananMentah[];
  kirim: KirimMentah[];
  sesi: SesiMentah[];
  tundaAkun: number[];
  nilaiLulus: number;
  rilisAt: string | null;
  now: Date;
}): { petugas: PetugasQc[]; monitoring: MonitoringQc } {
  const lulusItem = (p: PercobaanMentah) => p.jumlah > 0 && p.benar * 100 >= a.nilaiLulus * p.jumlah;
  const per = new Map<number, PercobaanMentah[]>();
  for (const p of a.percobaan) per.set(p.akun_id, [...(per.get(p.akun_id) ?? []), p]);
  const lang = new Map<number, LanggananMentah[]>();
  for (const l of a.langganan) lang.set(l.akun_id, [...(lang.get(l.akun_id) ?? []), l]);
  const kir = new Map<number, KirimMentah[]>();
  for (const k of a.kirim) kir.set(k.akun_id, [...(kir.get(k.akun_id) ?? []), k]);
  const ses = new Map<number, string>();
  const dari = tAda(a.rilisAt);
  for (const s of a.sesi) {
    const t = tAda(s.terakhir_aktif_at);
    if (!Number.isFinite(t) || (Number.isFinite(dari) && t < dari)) continue;
    const lama = ses.get(s.akun_id);
    if (!lama || t > Date.parse(lama)) ses.set(s.akun_id, s.terakhir_aktif_at);
  }
  const tunda = new Set(a.tundaAkun);

  const petugas: PetugasQc[] = a.peserta
    .filter((q) => q.peran === "pml" || q.peran === "ppl")
    .map((q) => {
      const ps = [...(per.get(q.akun_id) ?? [])].sort((x, y) => x.ke - y.ke);
      const ls = lang.get(q.akun_id) ?? [];
      const ks = kir.get(q.akun_id) ?? [];
      const rilis = ks.filter((k) => k.jenis === "rilis").map((k) => k.dibuat_at).sort()[0] ?? null;
      const buka = ses.get(q.akun_id) ?? null;
      const mengisi = ps.length > 0;
      const tn = tunda.has(q.akun_id);
      return {
        akun_id: q.akun_id,
        nama: q.nama,
        peran: q.peran as "pml" | "ppl",
        pml_akun_id: q.pml_akun_id,
        pml_nama: q.pml_nama,
        percobaan: ps.length,
        skor_awal: ps.find((p) => p.ke === 1)?.skor ?? ps[0]?.skor ?? null,
        skor_terbaik: ps.length ? Math.max(...ps.map((p) => p.skor)) : null,
        lulus: ps.some(lulusItem),
        terlambat: ps.some((p) => p.terlambat),
        selesai_at: ps.length ? ps[ps.length - 1].selesai_at : null,
        perangkat: ls.length,
        push_bermasalah: ls.length > 0 && ls.every((l) => l.gagal >= 3),
        push_rilis_at: rilis,
        push_ingat: ks.filter((k) => k.jenis === "ingat_petugas").length,
        buka_at: buka,
        tunda: tn,
        modal_sampai: mengisi || tn || !!buka,
      };
    })
    .sort((x, y) => x.nama.localeCompare(y.nama, "id"));

  const adaKirim = a.kirim.length > 0;
  const lewat = Number.isFinite(dari) && a.now.getTime() - dari > 15 * 60_000;
  const rilisDikirim = petugas.filter((p) => p.push_rilis_at).length;
  const monitoring: MonitoringQc = {
    peserta: petugas.length,
    push_aktif: petugas.filter((p) => p.perangkat > 0).length,
    push_rilis_dikirim: rilisDikirim,
    push_ingat_dikirim: petugas.filter((p) => p.push_ingat > 0).length,
    modal_sampai: petugas.filter((p) => p.modal_sampai).length,
    belum_buka: petugas.filter((p) => !p.modal_sampai).length,
    sudah_mengisi: petugas.filter((p) => p.percobaan > 0).length,
    lulus: petugas.filter((p) => p.lulus).length,
    tunda: petugas.filter((p) => p.tunda).length,
    penjadwal_terdeteksi: adaKirim,
    peringatan_penjadwal: lewat && rilisDikirim === 0,
  };
  return { petugas, monitoring };
}

export type SaringPetugas = {
  peran: "semua" | "pml" | "ppl";
  status: "semua" | "belum_mengisi" | "belum_lulus" | "lulus" | "modal_belum" | "tanpa_push" | "push_belum_dikirim";
  pml: number | "semua";
  cari: string;
};

/** Menyaring daftar petugas menurut pilihan di layar. `pml` = id PML (peserta PPL berisi pml_akun_id; PML sendiri cocok dengan akun_id-nya). */
export function saringPetugas(daftar: PetugasQc[], f: SaringPetugas): PetugasQc[] {
  const q = f.cari.trim().toLowerCase();
  return daftar.filter((p) => {
    if (f.peran !== "semua" && p.peran !== f.peran) return false;
    if (f.pml !== "semua" && p.pml_akun_id !== f.pml && p.akun_id !== f.pml) return false;
    if (q && !p.nama.toLowerCase().includes(q)) return false;
    switch (f.status) {
      case "belum_mengisi":
        return p.percobaan === 0;
      case "belum_lulus":
        return !p.lulus;
      case "lulus":
        return p.lulus;
      case "modal_belum":
        return !p.modal_sampai;
      case "tanpa_push":
        return p.perangkat === 0 || p.push_bermasalah;
      case "push_belum_dikirim":
        return !p.push_rilis_at;
      default:
        return true;
    }
  });
}
