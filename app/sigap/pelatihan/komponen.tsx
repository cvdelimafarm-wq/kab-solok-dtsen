"use client";

// app/sigap/pelatihan/komponen.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- bagian bersama halaman peserta: kerangka (header + tab
// Undangan | Langkah | Instrumen | Transport Lokal), pengambil data hub, jam server & hitung mundur. Mockup disetujui user.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, keluar, keMasuk } from "../admin/api";
import Link from "next/link";
import { BTN, HeaderAdmin, Kartu, Memuat, Pesan } from "../admin/ui";
import TombolKembali from "@/app/components/TombolKembali";
import { useDetak } from "../useDetak";
import { PulsaPeserta } from "./pulsa";
import PengaturanAwal from "@/app/portal/PengaturanAwal";
import type { PengaturanPresensi, RingkasHari } from "@/lib/sigapPresensi";
import type { PengumumanPeserta } from "@/lib/sigapPengumuman";
import type { InfoUndangan, JenisTes, StatusTes } from "@/lib/sigapTes";
import { useInfoPelatihan } from "./infoPelatihan";
import { PemilihPeran } from "./peranMasuk"; // (3 Nov 2026) dropdown "Masuk sebagai" bagi akun berkewenangan ganda
import { PemilihPelatihan } from "./PemilihPelatihan"; // (3 Nov 2026) hanya tampil bila peserta punya >= 2 pelatihan aktif
import { useDataPel } from "./dataPel"; // (3 Nov 2026) data hub lewat simpanan bersama
import { judulPelatihan, tujuanKembali } from "@/lib/sigapPelatihanNama";
import { KUIS_BELUM_ADA, hitungLangkahPelatihan, jendelaPelatihan, statusLangkah, type KodeLangkah } from "@/lib/alurPelatihan"; // (2 Nov 2026) penunjuk langkah pelatihan di HP
import { perluFotoTranslok } from "@/lib/sigapKelasIdent";
import { useKelasSaya } from "./kartuKelas";
import { LangkahGeser, PenunjukPelatihan } from "./AlurPelatihan";
import { ringkasAbsenSaya, useAbsenSaya } from "./absenSaya"; // (3 Nov 2026) langkah Absen sesi
import { useVanguardSaya } from "../vanguardSaya"; // (3 Nov 2026) langkah Vanguard
import { TabPelatihanOtomatis, useBenderaTab, useTerkunciUndangan, type TabAktif } from "./TabPelatihan"; // (2 Nov 2026) bilah 5 tab, hanya bila kegiatan memakai tampilan baru
import { TEKS_TERKUNCI } from "@/lib/gerbangUndangan"; // (3 Nov 2026) gerbang undangan
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
  // `tibaMs`: kapan jawaban itu diterima HP. Data dari simpanan (3 Nov 2026) bisa sudah beberapa menit lalu, jadi selisih dihitung terhadap saat diterima, bukan saat ini.
  const setujukan = useCallback((sekarangIso: string, tibaMs: number = Date.now()) => {
    offset.current = new Date(sekarangIso).getTime() - tibaMs;
  }, []);
  const sekarang = () => Date.now() + offset.current;
  return { setujukan, sekarang };
}

/**
 * Ambil data hub (/api/sigap/pelatihan). `interval` ms utk segar otomatis (0 = tidak).
 * (2 Nov 2026) `aktif=false`: tidak memuat apa pun (dipakai Kerangka saat halaman sudah punya data hub sendiri, supaya tidak memuat dua kali).
 * (3 Nov 2026) Lewat simpanan bersama (dataPel.ts): data terakhir langsung tampil saat pindah tab, lalu diperbarui di belakang. Jam server dihitung dari
 * saat data DITERIMA, sehingga hitung mundur tetap benar walau data berasal dari simpanan. `muat()` selalu memaksa ke server.
 */
export function useHub(interval = 0, aktif = true) {
  const jam = useJamServer();
  const { setujukan } = jam;
  const h = useDataPel<Hub>("/api/sigap/pelatihan", { aktif, interval, segarMs: interval > 0 ? Math.max(5_000, interval - 5_000) : undefined });
  useEffect(() => {
    if (aktif && !bacaSesi()) keMasuk();
  }, [aktif]);
  // diselaraskan saat digambar (bukan di efek) supaya hitung mundur tidak sempat memakai jam HP satu kali gambar
  const diselaraskan = useRef<Hub | null>(null);
  if (h.data && diselaraskan.current !== h.data) {
    diselaraskan.current = h.data;
    setujukan(h.data.sekarang, h.tiba || Date.now());
  }
  const { muat: muatPaksa } = h;
  const muat = useCallback(async () => {
    await muatPaksa();
  }, [muatPaksa]);
  return { data: aktif ? h.data : null, galat: aktif ? h.galat : null, muat, jam };
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
 * (2 Nov 2026) Penunjuk langkah di atas isi untuk halaman yang merupakan satu langkah pelatihan (tombol Sebelumnya/Berikutnya di bawah isi DIHAPUS atas permintaan user: tahapan sudah jelas dari lajur ikon)
 * (Undangan, Instrumen, Pretest, Posttest). `hub`: data hub milik halaman (null = masih memuat); undefined = muat sendiri.
 * `selesai`: halaman tahu langkahnya sudah selesai padahal data hub belum diperbarui (mis. undangan baru dibuka, tes baru dikirim).
 * `tersembunyi`: sembunyikan sementara tanpa melepas isi (mis. saat mengerjakan tes), supaya state isi halaman tidak hilang.
 */
/** (3 Nov 2026) Kuis belum dibuat panitia: tampilan lima tab tetap menampilkan langkah/kartu Adu Sigap dengan status "belum ada ruang". */
export const KUIS_KOSONG: NonNullable<Hub["kuis"]> = { ada_ruang_aktif: false, status: null, kelas: null, judul: null, sudah_gabung: false, pernah_ikut: false, ada_ruang_selesai: false, jadwal_at: null };

/** Kartu/kode langkah ada di halaman yang sedang dibuka? (untuk ikon langkah: gulir ke kartunya, bukan pindah halaman) */
const adaKartuLangkah = (kode: string) => typeof document !== "undefined" && !!document.getElementById(`langkah-${kode}`);
const gulirKeKartu = (kode: string) => document.getElementById(`langkah-${kode}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

function AlurKerangka({ kode, hub: hubLuar, selesai, tersembunyi, children }: { kode: KodeLangkah | null; hub?: Hub | null; selesai?: boolean; tersembunyi?: boolean; children: React.ReactNode }) {
  const sendiri = useHub(0, hubLuar === undefined);
  const hub = hubLuar === undefined ? sendiri.data : hubLuar;
  const kelas = useKelasSaya();
  const fotoTranslok = perluFotoTranslok(kelas?.aturan);
  // (3 Nov 2026) tampilan lima tab: langkah "Absen sesi" dan "Adu Sigap" SELALU ada di lajur ikon (dulu muncul hanya bila panitia membuka sesi / membuat kuis)
  const bendera = useBenderaTab();
  const lima = !!bendera?.tab_baru;
  const absen = useAbsenSaya(lima);
  const vg = useVanguardSaya(lima && hub?.peserta ? hub.kegiatan_id ?? null : null);
  const sekarangServer = hub?.sekarang;
  const selisih = useMemo(() => (sekarangServer ? new Date(sekarangServer).getTime() - Date.now() : 0), [sekarangServer]);
  const adaDataAbsen = !!absen.data;
  const absenTotal = absen.data?.sesi_hari?.length ?? absen.data?.sesi_terbuka.length ?? 0;
  const daftar = useMemo(() => {
    if (!hub || !hub.peserta) return null;
    const nowMs = Date.now() + selisih;
    const d = hitungLangkahPelatihan({
      langkah: hub.langkah,
      tes: hub.tes,
      presensi: hub.presensi,
      kuis: lima ? hub.kuis ?? KUIS_BELUM_ADA : hub.kuis,
      absenSesi: lima && adaDataAbsen ? ringkasAbsenSaya(absen.data, nowMs) : null,
      vanguard: lima ? vg.langkah : null,
      fotoTranslok,
      mulaiMs: jendelaPelatihan(hub.undangan).mulai,
      now: nowMs,
    });
    return selesai && kode ? d.map((l) => (l.kode === kode ? { ...l, selesai: true, terlewat: false } : l)) : d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, fotoTranslok, selisih, selesai, kode, lima, adaDataAbsen, absenTotal, absen.data, vg.langkah]);
  const status = useMemo(() => (daftar ? statusLangkah(daftar) : []), [daftar]);
  const tampil = !tersembunyi && !!daftar && (kode === null || daftar.some((l) => l.kode === kode));
  const hrefAlih = useMemo<Partial<Record<string, string>>>(() => (lima && hub?.kegiatan_id ? { foto_awal: `/sigap/foto?kegiatan=${hub.kegiatan_id}`, foto_akhir: `/sigap/foto?kegiatan=${hub.kegiatan_id}` } : {}), [lima, hub?.kegiatan_id]);
  return (
    <>
      {tampil && daftar && (kode === null ? <LangkahGeser daftar={daftar} status={status} hrefAlih={hrefAlih} onGulir={gulirKeKartu} cekGulir={adaKartuLangkah} /> : <PenunjukPelatihan daftar={daftar} status={status} aktif={kode} hrefAlih={hrefAlih} />)}
      {children}
    </>
  );
}

/** (3 Nov 2026) Pengganti isi halaman pelatihan selain Hari ini selama undangan belum diterima. */
export function KartuTerkunciUndangan() {
  return (
    <Kartu judul={TEKS_TERKUNCI.judul}>
      <p className="m-0 text-[13.5px] leading-relaxed text-[#3B4A60]">{TEKS_TERKUNCI.ket}</p>
      <div className="mt-3">
        <Link href="/sigap/pelatihan/hari-ini" className={BTN}>
          {TEKS_TERKUNCI.tombol}
        </Link>
      </div>
    </Kartu>
  );
}

export function Kerangka({
  aktif,
  judul,
  sub,
  nama,
  langkah,
  geser,
  hub,
  langkahSelesai,
  alurTersembunyi,
  children,
}: {
  aktif: "undangan" | "pelatihan" | "instrumen" | "hari-ini" | "monitoring" | "absen";
  judul: React.ReactNode;
  sub?: React.ReactNode;
  nama?: string;
  /** Kode langkah pelatihan yang ditampilkan halaman ini; bila diisi, penunjuk langkah dipasang. */
  langkah?: KodeLangkah;
  /** (3 Nov 2026) Pasang kartu "Langkah pelatihan" (lajur ikon geser, tanpa langkah aktif) di atas isi: dipakai tab Hari ini dan tab Pelatihan. */
  geser?: boolean;
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
  // (3 Nov 2026) gerbang undangan: sebelum undangan diterima, hanya Hari ini yang menampilkan isi; halaman lain diganti kartu penjelasan
  const terkunci = useTerkunciUndangan() === true;
  const tutup = terkunci && tabAktif !== "hari-ini";
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
        {/* (2 Nov 2026) pop-up konfirmasi nomor pulsa hanya sampai dikonfirmasi; kartu statusnya redup di bawah tab Hari ini (hari-ini/page.tsx) */}
        {!terkunci && <PulsaPeserta tampilan="pop" judul={judulPelatihan(info)} />}
        <PemilihPelatihan />
        <PemilihPeran />
        {tutup ? (
          <KartuTerkunciUndangan />
        ) : (langkah || geser) && !terkunci ? (
          <AlurKerangka kode={langkah ?? null} hub={hub} selesai={langkahSelesai} tersembunyi={alurTersembunyi}>
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
