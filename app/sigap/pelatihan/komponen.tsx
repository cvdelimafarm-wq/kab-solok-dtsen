"use client";

// app/sigap/pelatihan/komponen.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- bagian bersama halaman peserta: kerangka (header + tab
// Undangan | Langkah | Instrumen | Transport Lokal), pengambil data hub, jam server & hitung mundur. Mockup disetujui user.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, fetchJson, keluar, keMasuk, pesanGalat, SesiBerakhir } from "../admin/api";
import { HeaderAdmin, Memuat, Pesan } from "../admin/ui";
import TombolKembali from "@/app/components/TombolKembali";
import { useDetak } from "../useDetak";
import { PulsaPeserta } from "./pulsa";
import PengaturanAwal from "@/app/portal/PengaturanAwal";
import type { PengaturanPresensi, RingkasHari } from "@/lib/sigapPresensi";
import type { PengumumanPeserta } from "@/lib/sigapPengumuman";
import type { InfoUndangan, JenisTes, StatusTes } from "@/lib/sigapTes";
import { useInfoPelatihan } from "./infoPelatihan";
import { judulPelatihan, tujuanKembali } from "@/lib/sigapPelatihanNama";
import { hitungLangkahPelatihan, jendelaPelatihan, statusLangkah, type KodeLangkah } from "@/lib/alurPelatihan"; // (2 Nov 2026) penunjuk langkah pelatihan di HP
import { perluFotoTranslok } from "@/lib/sigapKelasIdent";
import { useKelasSaya } from "./kartuKelas";
import { NavPelatihan, PenunjukPelatihan } from "./AlurPelatihan";
import { TabPelatihanOtomatis, type TabAktif } from "./TabPelatihan"; // (2 Nov 2026) bilah 5 tab, hanya bila kegiatan memakai tampilan baru
import type { KunciTes } from "./KartuTerkunci";

export type TesHub = {
  jenis: JenisTes;
  judul: string;
  buka_at: string;
  tutup_at: string;
  durasi_menit: number;
  status: StatusTes;
  jumlah_soal: number;
  sesi: { mulai_at: string; batas_at: string; selesai_at: string | null; terjawab: number } | null;
  hasil_tertunda: boolean;
  /** (8 Okt 2026) Mengulang (posttest): percobaan ke-n, kuota maksimal, tombol "Ulangi" boleh tampil. */
  percobaan: number;
  ulang_maks: number;
  bisa_ulang: boolean;
  skor: number | null;
  benar: number | null;
  total: number | null;
  /** (2 Nov 2026) Wajib 100: mengulang tanpa batas sampai skor 100; `tuntas` = langkah tes selesai; `aturan_versi` 2 = nilai resmi percobaan PERTAMA. */
  wajib_100?: boolean;
  tuntas?: boolean;
  aturan_versi?: 1 | 2;
  /** (2 Nov 2026) Terhalang tahapan sebelumnya (blokir tahapan); null / kosong = tidak terkunci. */
  terkunci?: KunciTes | null;
};

export type Hub = {
  nama: string;
  jenis_akun: string;
  peserta: { penugasan_id: number; peran: string; kelas: number | null } | null;
  undangan: InfoUndangan;
  tes: TesHub[];
  /** (7 Okt 2026) Langkah Pelatihan: null bila akun bukan peserta. */
  langkah: { undangan_dibuka: boolean; instrumen_diunduh: boolean; foto: number; foto_total: number; slot: number[] } | null;
  /** (7 Okt 2026) Presensi di lokasi pelatihan: null bila akun bukan peserta / belum diatur. */
  /** (8 Okt 2026) `sudah` = semua sesi presensi hari ini tercatat; `hari` = sesi hari ini + catatan peserta. */
  presensi: { sudah: boolean; at: string | null; jarak_m: number | null; manual: boolean; titik_nama: string | null; hari: RingkasHari; pengaturan: PengaturanPresensi } | null;
  /** (7 Okt 2026) Kuis Live: null bila akun bukan peserta / belum ada kuis (langkah disembunyikan). */
  kuis: { ada_ruang_aktif: boolean; status: string | null; kelas: number | null; judul: string | null; sudah_gabung: boolean; pernah_ikut: boolean; ada_ruang_selesai: boolean; jadwal_at: string | null } | null;
  /** (8 Okt 2026) Modal pengumuman yang tampil berurutan di halaman Langkah (diatur panitia). */
  pengumuman: PengumumanPeserta[];
  token_translok: string | null;
  sekarang: string;
  kegiatan_id: number;
  boleh_lihat_kelola: boolean;
  boleh_kelola: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Detik -> "mm:ss" atau "h:mm:ss". */
export function formatSisa(detik: number): string {
  const s = Math.max(0, Math.floor(detik));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** ISO -> "09.15" (WIB). */
export function jamWib(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}`;
}

export const peranLabel = (p: string) => p.toUpperCase();

/** Jam server: offset dihitung dari `sekarang` respons API; tick tiap detik. */
export function useJamServer() {
  const offset = useRef(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const setujukan = useCallback((sekarangIso: string) => {
    offset.current = new Date(sekarangIso).getTime() - Date.now();
  }, []);
  const sekarang = () => Date.now() + offset.current;
  return { setujukan, sekarang };
}

/**
 * Ambil data hub (/api/sigap/pelatihan). `interval` ms utk segar otomatis (0 = tidak).
 * (2 Nov 2026) `aktif=false`: tidak memuat apa pun (dipakai Kerangka saat halaman sudah punya data hub sendiri, supaya tidak memuat dua kali).
 */
export function useHub(interval = 0, aktif = true) {
  const [data, setData] = useState<Hub | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const jam = useJamServer();
  const { setujukan } = jam;
  const muat = useCallback(async () => {
    try {
      const d = await fetchJson<Hub>("/api/sigap/pelatihan");
      setujukan(d.sekarang);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [setujukan]);
  useEffect(() => {
    if (!aktif) return;
    if (!bacaSesi()) return keMasuk();
    muat();
  }, [muat, aktif]);
  useEffect(() => {
    if (!interval || !aktif) return;
    const t = setInterval(muat, interval);
    return () => clearInterval(t);
  }, [interval, muat, aktif]);
  return { data, galat, muat, jam };
}

/**
 * Panggil `aksi` sekali saat hitung mundur menuju `targetIso` mencapai nol
 * (mis. muat ulang data saat tes dibuka). Aman utk dipanggil tiap render.
 */
export function useSaatLewat(targetIso: string | null, sekarangMs: () => number, aksi: () => void, kunci: string) {
  const sudah = useRef<string>("");
  useEffect(() => {
    if (!targetIso) return;
    if (sekarangMs() >= new Date(targetIso).getTime() && sudah.current !== kunci + targetIso) {
      sudah.current = kunci + targetIso;
      aksi();
    }
  });
}

/**
 * (2 Nov 2026) Penunjuk langkah di atas isi + Sebelumnya/Berikutnya di bawah isi, untuk halaman yang merupakan satu langkah pelatihan
 * (Undangan, Instrumen, Pretest, Posttest). `hub`: data hub milik halaman (null = masih memuat); undefined = muat sendiri.
 * `selesai`: halaman tahu langkahnya sudah selesai padahal data hub belum diperbarui (mis. undangan baru dibuka, tes baru dikirim).
 * `tersembunyi`: sembunyikan sementara tanpa melepas isi (mis. saat mengerjakan tes), supaya state isi halaman tidak hilang.
 */
function AlurKerangka({ kode, hub: hubLuar, selesai, tersembunyi, children }: { kode: KodeLangkah; hub?: Hub | null; selesai?: boolean; tersembunyi?: boolean; children: React.ReactNode }) {
  const sendiri = useHub(0, hubLuar === undefined);
  const hub = hubLuar === undefined ? sendiri.data : hubLuar;
  const kelas = useKelasSaya();
  const fotoTranslok = perluFotoTranslok(kelas?.aturan);
  const sekarangServer = hub?.sekarang;
  const selisih = useMemo(() => (sekarangServer ? new Date(sekarangServer).getTime() - Date.now() : 0), [sekarangServer]);
  const daftar = useMemo(() => {
    if (!hub || !hub.peserta) return null;
    const d = hitungLangkahPelatihan({ langkah: hub.langkah, tes: hub.tes, presensi: hub.presensi, kuis: hub.kuis, fotoTranslok, mulaiMs: jendelaPelatihan(hub.undangan).mulai, now: Date.now() + selisih });
    return selesai ? d.map((l) => (l.kode === kode ? { ...l, selesai: true, terlewat: false } : l)) : d;
  }, [hub, fotoTranslok, selisih, selesai, kode]);
  const status = useMemo(() => (daftar ? statusLangkah(daftar) : []), [daftar]);
  const tampil = !tersembunyi && !!daftar && daftar.some((l) => l.kode === kode);
  return (
    <>
      {tampil && daftar && <PenunjukPelatihan daftar={daftar} status={status} aktif={kode} />}
      {children}
      {tampil && daftar && <NavPelatihan daftar={daftar} aktif={kode} />}
    </>
  );
}

export function Kerangka({
  aktif,
  judul,
  sub,
  nama,
  langkah,
  hub,
  langkahSelesai,
  alurTersembunyi,
  children,
}: {
  aktif: "undangan" | "pelatihan" | "instrumen" | "hari-ini" | "monitoring" | "absen";
  judul: React.ReactNode;
  sub?: React.ReactNode;
  nama?: string;
  /** Kode langkah pelatihan yang ditampilkan halaman ini; bila diisi, penunjuk langkah dan Sebelumnya/Berikutnya dipasang. */
  langkah?: KodeLangkah;
  hub?: Hub | null;
  langkahSelesai?: boolean;
  alurTersembunyi?: boolean;
  children: React.ReactNode;
}) {
  const [sesiDetak] = useState(() => (typeof window === "undefined" ? null : bacaSesi()));
  useDetak({ sesi: sesiDetak }, "pelatihan");
  // (8 Okt 2026) Struktur 3 layer: tab Undangan | Langkah | Instrumen | Transport Lokal dihapus (membingungkan & menumpuk riwayat Back).
  // Undangan & instrumen kini langkah bernomor di halaman Langkah (Layer 2); tombol panah di header naik satu layer.
  // (9 Okt 2026) Pelatihan kini tahap dalam garis waktu Pendataan Pascabencana -> panah kembali naik ke sana.
  const info = useInfoPelatihan();
  // (2 Nov 2026) halaman tab baru (Hari ini, Monitoring) adalah halaman puncak pelatihan: panah kembali naik ke induk pelatihan, bukan ke /sigap/pelatihan (yang mengalihkan ke Hari ini).
  const induk = aktif === "pelatihan" || aktif === "hari-ini" || aktif === "monitoring" || aktif === "absen" ? tujuanKembali(info) : "/sigap/pelatihan"; // (1 Nov 2026) induk pelatihan ini (bukan selalu Pascabencana)
  const tabAktif: TabAktif = aktif === "undangan" ? "hari-ini" : aktif;
  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#14202E]">
      <HeaderAdmin
        kecil={`SIGAP · ${judulPelatihan(info)}`}
        judul={judul}
        onKeluar={keluar}
        kembali={<TombolKembali tema="gelap" induk={induk} />}
        kanan={
          <>
            {nama && <span className="hidden max-w-[160px] truncate text-[11.5px] text-blue-100 sm:inline">{nama}</span>}
          </>
        }
      >
        {sub && <p className="mt-1 text-[12.5px] text-blue-100">{sub}</p>}
      </HeaderAdmin>
      <main className="mx-auto max-w-3xl space-y-3 px-3 pb-16 pt-4 sm:px-4">
        <PulsaPeserta />
        {langkah ? (
          <AlurKerangka kode={langkah} hub={hub} selesai={langkahSelesai} tersembunyi={alurTersembunyi}>
            {children}
          </AlurKerangka>
        ) : (
          children
        )}
        {/* (8 Okt 2026) notifikasi wajib di aplikasi terpasang (permintaan user) */}
        <PengaturanAwal />
      </main>
      <TabPelatihanOtomatis aktif={tabAktif} />
    </div>
  );
}

/** Bagian isi umum: memuat / galat. */
export function Keadaan({ memuat, galat }: { memuat: boolean; galat: string | null }) {
  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (memuat) return <Memuat />;
  return null;
}
