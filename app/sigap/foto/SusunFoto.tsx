"use client";

// app/sigap/foto/SusunFoto.tsx
//
// (21 Okt 2026) Panel "Nomor foto" per hari untuk kegiatan bermode Kamera SIGAP.
//  - Menampilkan 5 nomor (terisi/kosong) beserta foto Kamera SIGAP-nya, dan foto CADANGAN (sudah terkirim tetapi belum bernomor atau tergeser).
//  - `otomatis` (dipakai pada hari izin susulan): begitu panel terbuka, foto cadangan LANGSUNG disusun ke nomor yang masih kosong
//    (urut waktu; bila foto lebih banyak dari nomor kosong, dipilih yang sepadan lalu sisanya jadi cadangan). Tidak pernah menimpa nomor terisi.
// (23 Okt 2026) TAMPILAN DAN ALUR BARU (aturan penomoran, penyimpanan foto, foto cadangan, dan SPJ TIDAK berubah):
//  - Kisi lima nomor (3 + 2): thumbnail, nomor, peran, jam. Cara lama (chip "Pindah ke nomor", tombol lebar "Ganti foto N") dihapus.
//  - TUKAR URUTAN: ketuk foto A, ketuk foto B -> modal konfirmasi -> "Ya, tukar". Hasilnya selalu tukar (atau pindah ke nomor kosong),
//    tidak pernah menimpa. Tidak ada perubahan urutan tanpa konfirmasi; ketuk di luar modal tidak mengonfirmasi dan tidak membatalkan.
//  - Peringatan ⚠ HANYA soal urutan jam (lib/sigapUrutanFoto.ts), selalu disertai alasan satu kalimat di bawah kisi. Lencana kepercayaan
//    (Wajar/Perlu perhatian) tidak lagi tampil di sini; kriterianya tetap dipakai di tempat lain (PeriksaFoto, Foto saya, SPJ).
//  - "Urutkan sesuai jam" dengan pratinjau; foto cadangan dipasang lewat alur yang sama (ketuk cadangan, ketuk nomor, konfirmasi).
//  - (27 Okt 2026) Penampil foto layar penuh juga punya tombol WhatsApp / Story WhatsApp (BagikanWa.tsx).
//  - Penampil foto layar penuh: foto besar, jam, lokasi, "Ambil ulang foto" (foto lama tersimpan sebagai cadangan) dan "Ganti urutan foto ini".
// (26 Okt 2026) PERUBAHAN TAMPILAN (aturan penomoran dan penyimpanan TIDAK berubah):
//  - Ketuk foto = membuka penampil layar penuh (foto selebar layar, geser kiri/kanan atau tombol ‹ › antar foto, seperti Instagram/Facebook).
//  - Tukar urutan HANYA lewat tombol "Ganti urutan": selama aktif, ketuk dua foto = tukar (konfirmasi tetap ada). Selesai atau berhasil = kembali ke mode lihat.
//  - Kisi nomor dan kisi foto cadangan memakai ubin persegi seragam (gambar diisi absolut supaya foto tegak tidak menarik tinggi ubin).
// Tidak ada penghapusan foto di sini.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ambilJson, type GalatFoto } from "./klien";
import { ambilFotoUrlCache, siapkanFoto, sudahAdaFoto } from "./cacheFoto";
import { pemilikSesi } from "@/app/portal/sesi";
import { tetanggaFoto, type UkuranBerkas } from "@/lib/sigapCacheFoto";
import BagikanWa from "./BagikanWa";
import { labelFoto } from "@/lib/sigapLabelFoto";
import type { Kepercayaan } from "@/lib/sigapFoto";
import { labelDariRekan } from "@/lib/sigapFotoRekan";
import { alasanBentrok, jamWib, kalimatJam, nilaiJam, pasangIsi, peranRingkas, rencanaUrutJam, slotBermasalah, tukarIsi, type IsiNomor } from "@/lib/sigapUrutanFoto";

type FotoRingkas = { id: number; kode: string; kepercayaan: Kepercayaan; diambil_at: string; lat?: number | null; lng?: number | null; tahan?: boolean; dari?: string };
type Nomor = { slot: number; terisi: boolean; sumber: string | null; susulan: boolean; foto: FotoRingkas | null; ditahan?: FotoRingkas | null };
type Keadaan = { boleh: boolean; susulan: boolean; lampau?: boolean; sisa_hari?: number | null; alasan_tutup: string | null; jumlah: number; nomor: Nomor[]; kosong: number[]; saran: number | null; ditahan?: number[]; cadangan: FotoRingkas[]; cadangan_rekan?: FotoRingkas[] };

// (27 Okt 2026) Foto cadangan = foto saya + foto rekan yang pernah diterima lalu tergeser (label "dari <nama>"). Foto rekan hanya dipasang lewat ketukan
// manual; "Isi nomor kosong otomatis" (server) tidak memakainya, jadi pemicu/tombol otomatis tetap memeriksa `k.cadangan` saja.
const semuaCadangan = (k: Keadaan): FotoRingkas[] => [...k.cadangan, ...(k.cadangan_rekan ?? [])];
/** Keterangan jam foto cadangan; foto rekan diberi label asalnya. */
const subCadangan = (f: FotoRingkas, jam: string) => (f.dari !== undefined ? `${jam} WIB · ${labelDariRekan(f.dari)}` : f.tahan ? `${jam} · menunggu periksa` : `${jam} WIB`);
type HasilIsi = { ditempatkan: { foto_id: number; slot: number }[]; ditahan?: { foto_id: number; slot: number }[]; cadangan: number; gagal?: { foto_id: number; error: string }[] };

type Pilih = { tipe: "slot"; slot: number } | { tipe: "cadangan"; id: number } | null;
type Konf = { jenis: "tukar"; dari: number; ke: number } | { jenis: "pasang"; fotoId: number; slot: number } | { jenis: "urut" };
type GalatModal = { teks: string; muatUlang: boolean };
/** Isi sebuah nomor seperti dilihat petugas; dikirim sebagai `harap_*` agar server menolak bila layar sudah usang. */
type Harap = "kosong" | "manual" | number;

// (23 Okt 2026) tanggal hari ini (WIB) di sisi klien: kamera hanya bisa memotret SEKARANG, jadi "Ambil ulang foto" hanya untuk hari ini
const hariIniWibKlien = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const jamIso = (iso: string) => jamWib(Date.parse(iso));
const harapNomor = (n: Nomor): Harap => (!n.terisi ? "kosong" : n.foto ? n.foto.id : "manual");

// (28 Okt 2026) Foto dari simpanan bersama (cacheFoto.ts): kotak kisi memakai 'mini' (±25 KB), penampil layar penuh memakai 'penuh' dengan versi
// yang sudah ada (kecil/mini) tampil lebih dulu. Sebelumnya tiap kotak mengunduh foto asli ber-cap.
function Gambar({ id, kelas, alt, ukuran = "mini" }: { id: number; kelas: string; alt: string; ukuran?: UkuranBerkas }) {
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    let batal = false;
    const dipakai: string[] = [];
    let tampil = false;
    const pasang = (u: string) => {
      if (batal) {
        URL.revokeObjectURL(u);
        return;
      }
      dipakai.push(u);
      tampil = true;
      setUrl(u);
    };
    setUrl(null);
    setGagal(false);
    (async () => {
      try {
        if (ukuran === "penuh" && !sudahAdaFoto(id, "penuh")) {
          const dulu: UkuranBerkas | null = sudahAdaFoto(id, "kecil") ? "kecil" : sudahAdaFoto(id, "mini") ? "mini" : null;
          if (dulu) pasang(await ambilFotoUrlCache(id, dulu));
        }
        pasang(await ambilFotoUrlCache(id, ukuran));
      } catch {
        if (!batal && !tampil) setGagal(true);
      }
    })();
    return () => {
      batal = true;
      dipakai.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [id, ukuran]);
  if (gagal) return <div className={`flex items-center justify-center bg-[#EEF2F7] px-1 text-center text-[10.5px] font-semibold text-[#55657D] ${kelas}`}>Foto belum termuat</div>;
  if (!url) return <div className={`animate-pulse bg-[#EEF2F7] ${kelas}`} aria-label="Memuat foto" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={kelas} />;
}

function IkonPeringatan({ kelas = "h-4 w-4" }: { kelas?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={kelas} aria-hidden="true" focusable="false">
      <path d="M10 2.2 18.6 17H1.4L10 2.2Z" fill="#F2B632" stroke="#8A6200" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 7.6v4.2" stroke="#3D2B00" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1" fill="#3D2B00" />
    </svg>
  );
}

/**
 * (23 Okt 2026) Lapisan penuh layar dipasang LANGSUNG di <body> (portal), bukan di dalam halaman. Bila dirender di dalam halaman, lapisan ini
 * terjebak di konteks susunan induknya dan tampil DI BAWAH bilah navigasi bawah (Hari Ini / Hari Kerja / Arsip, z-30), sehingga tombol "Batal"
 * tertutup dan tidak bisa diketuk. z-[100] memastikan di atas bilah navigasi mana pun; ruang bawah mengikuti area aman HP (gestur/tombol sistem).
 */
function Lapisan({ children, kelas, onKlik }: { children: ReactNode; kelas: string; onKlik?: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`fixed inset-0 z-[100] flex justify-center bg-black/50 ${kelas}`} role="presentation" onClick={onKlik} style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      {children}
    </div>,
    document.body
  );
}

/** Jendela konfirmasi. Ketuk di luar jendela TIDAK mengonfirmasi dan TIDAK menutup; hanya tombol Batal (atau Esc) yang menutup. */
function Modal({ judul, idJudul, sibuk, onBatal, children }: { judul: string; idJudul: string; sibuk: boolean; onBatal: () => void; children: ReactNode }) {
  const kotak = useRef<HTMLDivElement>(null);
  useEffect(() => {
    kotak.current?.focus(); // fokus ke jendela (bukan ke tombol), supaya Enter tidak langsung mengonfirmasi
  }, []);
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sibuk) onBatal();
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [sibuk, onBatal]);
  return (
    <Lapisan kelas="items-center px-3">
      <div ref={kotak} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={idJudul} className="max-h-full w-full max-w-sm self-center overflow-y-auto rounded-2xl bg-white p-4 shadow-xl outline-none">
        <h2 id={idJudul} className="text-base font-extrabold leading-snug text-[#0F2A52]">{judul}</h2>
        {children}
      </div>
    </Lapisan>
  );
}

function KartuModal({ fotoId, judul, sub, kosong }: { fotoId: number | null; judul: string; sub: string; kosong?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className={`aspect-square w-full overflow-hidden rounded-xl ${kosong ? "flex items-center justify-center border-2 border-dashed border-[#C9D3E6] bg-white text-xs font-bold text-[#8A6200]" : "bg-[#EEF2F7]"}`}>
        {kosong ? "Kosong" : fotoId !== null ? <Gambar id={fotoId} kelas="h-full w-full object-cover" alt={judul} /> : <div className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-semibold text-[#55657D]">Unggahan manual</div>}
      </div>
      <div className="mt-1 text-[13px] font-extrabold leading-tight text-[#0F2A52]">{judul}</div>
      <div className="text-[11.5px] leading-tight text-[#3C4C68]">{sub}</div>
    </div>
  );
}

const TOMBOL_UTAMA = "min-h-[48px] w-full whitespace-nowrap rounded-xl bg-[#0F2A52] px-3 text-sm font-extrabold text-white disabled:opacity-50";
const TOMBOL_SEKUNDER = "min-h-[48px] w-full whitespace-nowrap rounded-xl border-2 border-[#C9D3E6] bg-white px-3 text-sm font-bold text-[#0F2A52] disabled:opacity-50";

function pesanGalat(e: unknown): GalatModal {
  const g = e as GalatFoto;
  const asli = e instanceof Error ? e.message : "";
  if (g?.status === undefined) return { teks: "Tidak ada sambungan internet. Urutan foto tidak diubah. Coba lagi setelah ada sinyal.", muatUlang: false };
  if (g.status === 401) return { teks: "Sesi Anda berakhir. Masuk ulang, lalu coba lagi. Urutan foto tidak diubah.", muatUlang: false };
  const teks = /tidak diubah/i.test(asli) ? asli : `${asli || "Gagal menyimpan."} Urutan foto tidak diubah.`;
  return { teks, muatUlang: g.status === 409 };
}

// (28 Okt 2026) Keadaan nomor foto terakhir disimpan di memori (per akun, kegiatan, tanggal): membuka kembali panel langsung tampil, lalu
// diperbarui di belakang. Aman: setiap aksi tulis membawa `harap_*` dan server menjawab 409 bila layar sudah usang.
const kacaKeadaan = new Map<string, Keadaan>();
const kunciKeadaan = (kegiatanId: number, tanggal: string) => `${pemilikSesi() ?? 0}|${kegiatanId}|${tanggal}`;

export default function SusunFoto({
  kegiatanId,
  tanggal,
  jenis = null,
  otomatis = false,
  polos = false,
  rapat = false,
  onBerubah,
}: {
  kegiatanId: number;
  tanggal: string;
  jenis?: string | null;
  otomatis?: boolean;
  /** (24 Okt 2026) true bila sudah berada di dalam kartu pembungkus: tanpa bingkai dan jarak sendiri, supaya kisi foto tidak menyempit (kartu bersarang) */
  polos?: boolean;
  /** (25 Okt 2026) true di panel yang sudah selebar layar HP: kisi foto nyaris tanpa jarak (seperti umpan Facebook) supaya tiap foto lebih besar; teks lain diberi jarak sendiri. Layar lebar (640px ke atas) tampil biasa. */
  rapat?: boolean;
  onBerubah?: () => void | Promise<void>;
}) {
  const [k, setK] = useState<Keadaan | null>(() => kacaKeadaan.get(kunciKeadaan(kegiatanId, tanggal)) ?? null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [petunjuk, setPetunjuk] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pilih, setPilih] = useState<Pilih>(null);
  const [konf, setKonf] = useState<Konf | null>(null);
  const [galatModal, setGalatModal] = useState<GalatModal | null>(null);
  const [lihat, setLihat] = useState<string | null>(null); // kunci penampil: "s<nomor>" atau "c<id foto cadangan>"
  const [modeUbah, setModeUbah] = useState(false); // tombol "Ganti urutan" aktif
  const sentuh = useRef<{ x: number; y: number } | null>(null);
  const [kilat, setKilat] = useState<number[]>([]);
  const sudahOtomatis = useRef(false);
  const penjedaKilat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etiket = labelFoto(jenis);

  const muat = useCallback(async () => {
    try {
      const d = await ambilJson<Keadaan>(`/api/sigap/foto/susun?kegiatan=${kegiatanId}&tanggal=${tanggal}`);
      kacaKeadaan.set(kunciKeadaan(kegiatanId, tanggal), d);
      setK(d);
      setGalat(null);
      return d;
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat nomor foto.");
      return null;
    }
  }, [kegiatanId, tanggal]);

  const kabari = useCallback(() => {
    void Promise.resolve(onBerubah?.()).catch(() => undefined);
  }, [onBerubah]);

  async function kirimAksi(badan: Record<string, unknown>) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw Object.assign(new Error("Tidak ada sambungan."), { status: undefined });
    return ambilJson<Record<string, unknown>>("/api/sigap/foto/susun", { method: "POST", body: { kegiatan_id: kegiatanId, tanggal, ...badan } });
  }

  function nyalakanKilat(slot: number[]) {
    setKilat(slot);
    if (penjedaKilat.current) clearTimeout(penjedaKilat.current);
    penjedaKilat.current = setTimeout(() => setKilat([]), 1600);
  }
  useEffect(() => () => { if (penjedaKilat.current) clearTimeout(penjedaKilat.current); }, []);

  async function isi() {
    setSibuk(true);
    setGalat(null);
    setPetunjuk(null);
    try {
      const r = (await kirimAksi({ aksi: "isi" })) as unknown as HasilIsi;
      const tahan = r.ditahan ?? [];
      if (r.ditempatkan.length || tahan.length) {
        const urut = [...r.ditempatkan].sort((a, b) => a.slot - b.slot).map((x) => x.slot).join(", ");
        const urutTahan = [...tahan].sort((a, b) => a.slot - b.slot).map((x) => x.slot).join(", ");
        setPesan(
          `${r.ditempatkan.length ? `${r.ditempatkan.length} foto Kamera SIGAP otomatis mengisi nomor ${urut}.` : ""}${tahan.length ? ` ${tahan.length} foto menunggu diperiksa PML/admin dan nomornya (${urutTahan}) dipesan dulu.` : ""}${r.cadangan ? ` ${r.cadangan} foto lain disimpan sebagai foto cadangan.` : ""} Bila tidak sesuai, ketuk dua foto untuk menukar urutannya.`.trim()
        );
        kabari();
      } else if (r.gagal?.length) setGalat("Sebagian foto belum bisa dipasang. Coba lagi atau pasang manual.");
      else setPesan(null);
    } catch (e) {
      setGalat(pesanGalat(e).teks);
    } finally {
      await muat();
      setSibuk(false);
    }
  }

  /** Jalankan satu perubahan urutan SETELAH dikonfirmasi. Gagal (offline/konflik) -> pesan di jendela, tampilan urutan tidak diubah. */
  async function jalankan(badan: Record<string, unknown>, slotKilat: number[], sukses = "Urutan foto diperbarui") {
    setSibuk(true);
    setGalatModal(null);
    setGalat(null);
    setPetunjuk(null);
    try {
      const r = await kirimAksi(badan);
      kabari();
      await muat();
      setKonf(null);
      setPilih(null);
      setLihat(null);
      setModeUbah(false);
      if (r.status === "sudah_urut") setPesan("Urutan foto sudah sesuai jam.");
      else {
        setPesan(sukses);
        nyalakanKilat(slotKilat);
      }
    } catch (e) {
      setGalatModal(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  useEffect(() => {
    let batal = false;
    (async () => {
      const d = await muat();
      if (batal || !d || !otomatis || sudahOtomatis.current) return;
      if (d.boleh && d.cadangan.length > 0 && d.kosong.length > 0) {
        sudahOtomatis.current = true; // satu kali per pembukaan panel; sesudahnya petugas yang mengatur
        await isi();
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muat, otomatis]);

  // pilihan yang sudah tidak berlaku setelah data dimuat ulang (mis. foto pindah dari HP lain) dibatalkan
  useEffect(() => {
    if (!k || !pilih) return;
    if (pilih.tipe === "slot" && !k.nomor.find((n) => n.slot === pilih.slot)?.terisi) setPilih(null);
    if (pilih.tipe === "cadangan" && !semuaCadangan(k).some((f) => f.id === pilih.id)) setPilih(null);
  }, [k, pilih]);

  const isiNomor = useMemo<IsiNomor[]>(
    () => (k ? k.nomor.filter((n) => n.terisi).map((n) => ({ slot: n.slot, fotoId: n.foto?.id ?? null, ms: n.foto ? Date.parse(n.foto.diambil_at) : null })) : []),
    [k]
  );
  const nilai = useMemo(() => nilaiJam(isiNomor), [isiNomor]);
  const bermasalah = useMemo(() => slotBermasalah(nilai.bentrok), [nilai]);
  const alasan = useMemo(() => alasanBentrok(nilai.bentrok, isiNomor), [nilai, isiNomor]);
  const rencana = useMemo(() => rencanaUrutJam(isiNomor), [isiNomor]);

  // (26 Okt 2026) daftar foto untuk penampil: nomor yang berisi (atau dipesan) menurut nomor, lalu foto cadangan
  type ItemGaleri = { kunci: string; slot: number | null; huruf: string | null; foto: FotoRingkas | null; ditahan: boolean };
  const galeri = useMemo<ItemGaleri[]>(() => {
    if (!k) return [];
    const a: ItemGaleri[] = [];
    for (const n of k.nomor) if (n.terisi || n.ditahan) a.push({ kunci: `s${n.slot}`, slot: n.slot, huruf: null, foto: n.foto ?? n.ditahan ?? null, ditahan: !n.terisi });
    semuaCadangan(k).forEach((f, i) => a.push({ kunci: `c${f.id}`, slot: null, huruf: String.fromCharCode(65 + (i % 26)), foto: f, ditahan: !!f.tahan }));
    return a;
  }, [k]);
  const posLihat = lihat ? galeri.findIndex((g) => g.kunci === lihat) : -1;
  const geserLihat = useCallback(
    (arah: -1 | 1) => {
      setLihat((cur) => {
        const i = galeri.findIndex((g) => g.kunci === cur);
        if (i < 0) return cur;
        const j = i + arah;
        return j < 0 || j >= galeri.length ? cur : galeri[j].kunci;
      });
    },
    [galeri]
  );
  useEffect(() => {
    if (lihat === null) return;
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLihat(null);
      else if (e.key === "ArrowLeft") geserLihat(-1);
      else if (e.key === "ArrowRight") geserLihat(1);
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [lihat, geserLihat]);
  // foto yang dilihat sudah tidak ada (data dimuat ulang): penampil ditutup
  useEffect(() => {
    if (lihat !== null && k && posLihat < 0) setLihat(null);
  }, [lihat, k, posLihat]);

  // (28 Okt 2026) Prefetch: kotak kecil (mini) semua foto hari ini disiapkan di belakang layar; saat penampil terbuka, foto sebelum/sesudahnya
  // (versi kecil) ikut disiapkan supaya geser kiri-kanan terasa seketika.
  useEffect(() => {
    siapkanFoto(galeri.flatMap((g) => (g.foto ? [g.foto.id] : [])), "mini", 12);
  }, [galeri]);
  useEffect(() => {
    if (posLihat < 0) return;
    siapkanFoto(tetanggaFoto(galeri, posLihat).flatMap((g) => (g.foto ? [g.foto.id] : [])), "kecil", 2);
  }, [galeri, posLihat]);

  if (!k) return galat ? <div role="alert" className="rounded-xl bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div> : <div className="h-24 animate-pulse rounded-2xl bg-[#EEF2F7]" aria-label="Memuat nomor foto" />;
  if (k.nomor.every((n) => !n.terisi) && semuaCadangan(k).length === 0 && !k.boleh) return null;

  const boleh = k.boleh;
  const bisaUbah = boleh && !sibuk;
  const bisaKamera = bisaUbah && !k.susulan && tanggal === hariIniWibKlien();
  const nomorDi = (slot: number) => k.nomor.find((n) => n.slot === slot);
  const fotoNomor = (n: Nomor | undefined) => n?.foto ?? null;
  const subNomor = (n: Nomor) => (n.foto ? `${jamIso(n.foto.diambil_at)} WIB` : n.terisi ? "Unggahan manual" : "Kosong");

  function ketukSlot(slot: number) {
    const n = nomorDi(slot);
    if (!n) return;
    setPesan(null);
    setPetunjuk(null);
    // Mode lihat (bawaan): ketuk foto = buka penampil. Tukar urutan hanya saat "Ganti urutan" aktif.
    if (!boleh || !modeUbah) {
      if (n.terisi || n.ditahan) setLihat(`s${slot}`);
      else if (boleh) setPetunjuk(`Nomor ${slot} masih kosong. Tekan Ganti urutan, ketuk foto cadangan, lalu ketuk nomor ini.`);
      return;
    }
    if (sibuk) return;
    if (!pilih) {
      if (!n.terisi) {
        setPetunjuk(`Nomor ${slot} masih kosong. Ketuk dulu foto cadangan atau foto lain, lalu ketuk nomor ini.`);
        return;
      }
      setPilih({ tipe: "slot", slot });
      return;
    }
    if (pilih.tipe === "slot") {
      if (pilih.slot === slot) setPilih(null); // ketuk lagi = batal
      else setKonf({ jenis: "tukar", dari: pilih.slot, ke: slot });
      return;
    }
    siapPasang(pilih.id, slot);
  }

  function ketukCadangan(id: number) {
    setPesan(null);
    setPetunjuk(null);
    if (!boleh || !modeUbah) {
      setLihat(`c${id}`);
      return;
    }
    if (sibuk) return;
    if (!pilih || pilih.tipe === "cadangan") {
      setPilih(pilih && pilih.tipe === "cadangan" && pilih.id === id ? null : { tipe: "cadangan", id });
      return;
    }
    siapPasang(id, pilih.slot);
  }

  function aturUbah(nyala: boolean) {
    setModeUbah(nyala);
    setPilih(null);
    setPesan(null);
    setPetunjuk(null);
  }

  function siapPasang(fotoId: number, slot: number) {
    const f = k ? semuaCadangan(k).find((x) => x.id === fotoId) : undefined;
    const n = nomorDi(slot);
    if (!f || !n) return;
    if (n.terisi && !n.foto) {
      setPetunjuk(`Nomor ${slot} berisi unggahan manual dan tidak bisa digantikan foto cadangan dari sini. Pilih nomor lain.`);
      return;
    }
    if (f.tahan && n.terisi) {
      setPetunjuk("Foto yang menunggu diperiksa PML/admin hanya bisa dipesankan ke nomor yang masih kosong.");
      return;
    }
    setKonf({ jenis: "pasang", fotoId, slot });
  }

  function tutupKonf() {
    if (sibuk) return;
    const muatUlang = galatModal?.muatUlang;
    setKonf(null);
    setGalatModal(null);
    if (muatUlang) {
      setPilih(null);
      void muat();
    }
  }

  // ---------- isi jendela konfirmasi ----------
  function ModalKonfirmasi() {
    if (!konf || !k) return null;
    const peran = (s: number) => peranRingkas(jenis, s);
    const galatBlok = galatModal ? (
      <div role="alert" className="mt-3 rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs font-semibold leading-relaxed text-[#9B1C23]">{galatModal.teks}</div>
    ) : null;
    const tombol = (labelYa: string, onYa: () => void) => (
      <div className="mt-4 flex flex-col gap-2">
        {galatModal?.muatUlang ? (
          <button type="button" onClick={tutupKonf} className={TOMBOL_UTAMA}>Tutup dan muat ulang</button>
        ) : (
          <>
            <button type="button" disabled={sibuk} onClick={onYa} className={TOMBOL_UTAMA}>{sibuk ? "Menyimpan…" : labelYa}</button>
            <button type="button" disabled={sibuk} onClick={tutupKonf} className={TOMBOL_SEKUNDER}>Batal</button>
          </>
        )}
      </div>
    );

    if (konf.jenis === "tukar") {
      const a = nomorDi(konf.dari);
      const b = nomorDi(konf.ke);
      if (!a || !b) return null;
      const sesudah = nilaiJam(tukarIsi(isiNomor, konf.dari, konf.ke));
      const kataJam = kalimatJam(nilai, sesudah, b.terisi ? "ditukar" : "dipindah");
      const pindahKeKosong = !b.terisi;
      return (
        <Modal judul={pindahKeKosong ? `Apakah Anda yakin memindahkan foto ${konf.dari} ke nomor ${konf.ke}?` : "Apakah Anda yakin mengubah urutan 2 foto ini?"} idJudul="judul-konf-tukar" sibuk={sibuk} onBatal={tutupKonf}>
          <div className="mt-3 flex items-start gap-1.5">
            <KartuModal fotoId={a.foto?.id ?? null} judul={`Foto ${a.slot}`} sub={`${peran(a.slot)} · ${a.foto ? jamIso(a.foto.diambil_at) : "tanpa jam"}`} />
            <span className="mt-8 flex-none text-xl font-extrabold text-[#0F2A52]" aria-label="ditukar dengan">⇄</span>
            <KartuModal fotoId={b.foto?.id ?? null} judul={`Foto ${b.slot}`} sub={b.terisi ? `${peran(b.slot)} · ${b.foto ? jamIso(b.foto.diambil_at) : "tanpa jam"}` : peran(b.slot)} kosong={pindahKeKosong} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#1B2B4B]">
            {pindahKeKosong
              ? `Foto ${a.slot} akan pindah ke nomor ${b.slot} dan menjadi “${peran(b.slot)}”. Nomor ${a.slot} menjadi kosong.`
              : `Foto ${a.slot} akan menjadi “${peran(b.slot)}” (nomor ${b.slot}), foto ${b.slot} menjadi “${peran(a.slot)}” (nomor ${a.slot}).`}
          </p>
          {kataJam && <p className={`mt-1.5 text-[13px] font-semibold leading-relaxed ${sesudah.bentrok.length ? "text-[#8A5A00]" : "text-[#0B6B3F]"}`}>{kataJam}</p>}
          {galatBlok}
          {tombol(pindahKeKosong ? "Ya, pindahkan" : "Ya, tukar", () => void jalankan({ aksi: "pindah", dari: konf.dari, ke: konf.ke, harap_dari: harapNomor(a), harap_ke: harapNomor(b) }, [konf.dari, konf.ke]))}
        </Modal>
      );
    }

    if (konf.jenis === "pasang") {
      const f = semuaCadangan(k).find((x) => x.id === konf.fotoId);
      const n = nomorDi(konf.slot);
      if (!f || !n) return null;
      const sesudah = f.tahan ? nilai : nilaiJam(pasangIsi(isiNomor, konf.slot, { fotoId: f.id, ms: Date.parse(f.diambil_at) }));
      const kataJam = f.tahan ? null : kalimatJam(nilai, sesudah, "dipasang");
      return (
        <Modal judul="Apakah Anda yakin memasang foto cadangan ini?" idJudul="judul-konf-pasang" sibuk={sibuk} onBatal={tutupKonf}>
          <div className="mt-3 flex items-start gap-1.5">
            <KartuModal fotoId={f.id} judul="Foto cadangan" sub={f.dari !== undefined ? `${jamIso(f.diambil_at)} WIB · ${labelDariRekan(f.dari)}` : `${jamIso(f.diambil_at)} WIB`} />
            <span className="mt-8 flex-none text-xl font-extrabold text-[#0F2A52]" aria-label="menggantikan">⇄</span>
            <KartuModal fotoId={n.foto?.id ?? null} judul={`Foto ${n.slot}`} sub={n.terisi ? `${peran(n.slot)} · ${n.foto ? jamIso(n.foto.diambil_at) : "tanpa jam"}` : peran(n.slot)} kosong={!n.terisi} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#1B2B4B]">
            {f.tahan
              ? `Nomor ${n.slot} (“${peran(n.slot)}”) dipesan untuk foto ini dan baru tercatat setelah diperiksa PML/admin.`
              : n.terisi
                ? `Foto di nomor ${n.slot} akan pindah ke cadangan. Foto cadangan ini menjadi “${peran(n.slot)}” (nomor ${n.slot}).`
                : `Foto cadangan ini akan mengisi nomor ${n.slot} (“${peran(n.slot)}”).`}
          </p>
          {kataJam && <p className={`mt-1.5 text-[13px] font-semibold leading-relaxed ${sesudah.bentrok.length ? "text-[#8A5A00]" : "text-[#0B6B3F]"}`}>{kataJam}</p>}
          {galatBlok}
          {tombol("Ya, pasang", () => void jalankan({ aksi: "pasang", foto_id: f.id, slot: n.slot, harap_isi: harapNomor(n) }, [n.slot], f.tahan ? `Nomor ${n.slot} dipesan untuk foto ini.` : "Urutan foto diperbarui"))}
        </Modal>
      );
    }

    // urutkan sesuai jam
    let cur = isiNomor;
    const pasangan: string[] = [];
    for (const [x, y] of rencana.langkah) {
      const mx = cur.find((c) => c.slot === x)?.ms;
      const my = cur.find((c) => c.slot === y)?.ms;
      pasangan.push(`Foto ${x} (${mx != null ? jamWib(mx) : "-"}) ⇄ foto ${y} (${my != null ? jamWib(my) : "-"})`);
      cur = tukarIsi(cur, x, y);
    }
    const sesudah = nilaiJam(rencana.akhir);
    const kataJam = kalimatJam(nilai, sesudah, "diurutkan");
    return (
      <Modal judul="Apakah Anda yakin mengurutkan foto sesuai jam?" idJudul="judul-konf-urut" sibuk={sibuk} onBatal={tutupKonf}>
        <p className="mt-2 text-[13px] leading-relaxed text-[#3C4C68]">Foto Kamera SIGAP diurutkan dari jam terawal ke terakhir pada nomor yang sama. Jam yang sama tetap pada urutan lama.</p>
        <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-[#55657D]">Yang bertukar</div>
        <ul className="mt-1 flex flex-col gap-1">
          {pasangan.map((p, i) => (
            <li key={i} className="rounded-lg bg-[#F7F9FD] px-2.5 py-2 text-[13px] font-semibold text-[#0F2A52]">{p}</li>
          ))}
        </ul>
        <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-[#55657D]">Urutan sesudahnya</div>
        <ol className="mt-1 flex flex-col gap-0.5 text-[13px] text-[#1B2B4B]">
          {rencana.akhir.map((x) => (
            <li key={x.slot}>
              <b>Nomor {x.slot}</b> · {peran(x.slot)} · {x.ms != null ? `${jamWib(x.ms)} WIB` : "unggahan manual"}
            </li>
          ))}
        </ol>
        {kataJam && <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#0B6B3F]">{kataJam}</p>}
        {galatBlok}
        {tombol("Ya, urutkan", () => void jalankan({ aksi: "urutkan", harap_langkah: rencana.langkah }, rencana.berubah.map((u) => u.slot), "Foto diurutkan sesuai jam"))}
      </Modal>
    );
  }

  // ---------- penampil foto layar penuh ----------
  function LembarLihat() {
    if (lihat === null || !k || posLihat < 0) return null;
    const g = galeri[posLihat];
    const f = g.foto;
    const n = g.slot !== null ? nomorDi(g.slot) : null;
    const judul = g.slot !== null ? `Foto ${g.slot} · ${peranRingkas(jenis, g.slot)}` : `Foto cadangan ${g.huruf}`;
    const terkait = g.slot !== null ? nilai.bentrok.filter((b) => b.kecil === g.slot || b.besar === g.slot) : [];
    const lokasi = f && typeof f.lat === "number" && typeof f.lng === "number" ? { lat: f.lat, lng: f.lng } : null;
    const adaSebelum = posLihat > 0;
    const adaSesudah = posLihat < galeri.length - 1;
    const panah = "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-[26px] font-bold leading-none text-white disabled:hidden";
    return (
      <Lapisan kelas="flex-col !bg-black !p-0 !pb-0 !pt-0">
        <div role="dialog" aria-modal="true" aria-label={judul} className="flex h-full w-full flex-col" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-2 px-2 pb-2 text-white">
            <button type="button" onClick={() => setLihat(null)} aria-label="Tutup foto" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-[20px] font-bold">
              ✕
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold leading-tight">{judul}</p>
              <p className="truncate text-[11.5px] leading-tight text-white/70">{f ? `${jamIso(f.diambil_at)} WIB${f.dari !== undefined ? ` · ${labelDariRekan(f.dari)}` : ""}` : "Unggahan manual"}</p>
            </div>
            <span className="shrink-0 pr-1 text-[12.5px] font-bold text-white/80">{posLihat + 1}/{galeri.length}</span>
          </div>

          <div
            className="relative min-h-0 flex-1 touch-pan-y select-none"
            onTouchStart={(e) => {
              const t = e.touches[0];
              sentuh.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const m = sentuh.current;
              sentuh.current = null;
              const t = e.changedTouches[0];
              if (!m || !t) return;
              const dx = t.clientX - m.x;
              const dy = t.clientY - m.y;
              if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) geserLihat(dx < 0 ? 1 : -1);
            }}
          >
            {f ? <Gambar id={f.id} kelas="h-full w-full object-contain" alt={judul} ukuran="penuh" /> : <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white/80">Unggahan manual (tidak ada gambar dari kamera)</div>}
            <button type="button" onClick={() => geserLihat(-1)} disabled={!adaSebelum} aria-label="Foto sebelumnya" className={`${panah} left-2`}>‹</button>
            <button type="button" onClick={() => geserLihat(1)} disabled={!adaSesudah} aria-label="Foto berikutnya" className={`${panah} right-2`}>›</button>
          </div>

          <div className="max-h-[42vh] shrink-0 overflow-y-auto rounded-t-2xl bg-white px-4 pb-3 pt-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <p className="text-[12.5px] text-[#55657D]">
              {g.slot !== null ? `${etiket[g.slot - 1] ?? ""} · ` : "Tersimpan, belum bernomor · "}
              {lokasi ? (
                <a href={`https://www.google.com/maps?q=${lokasi.lat},${lokasi.lng}`} target="_blank" rel="noopener noreferrer" className="font-bold text-[#1F5FBF] underline">Buka lokasi di peta</a>
              ) : (
                "Lokasi tidak tercatat"
              )}
            </p>
            {g.ditahan && <p className="mt-1.5 rounded-lg bg-[#EEF2F7] px-2.5 py-1.5 text-[12px] font-semibold text-[#1B2B4B]">Menunggu diperiksa PML/admin.</p>}
            {terkait.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-[#FFF4D6] px-2.5 py-2 text-[12.5px] font-semibold text-[#5E4300]">
                <IkonPeringatan kelas="mt-0.5 h-4 w-4 flex-none" />
                <div>{alasanBentrok(terkait, isiNomor).baris.map((t) => <p key={t}>{t}</p>)}</div>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {/* (27 Okt 2026) bagikan foto resmi (ber-cap) ke WhatsApp / Story, lengkap dengan keterangan dan tautan verifikasi */}
              {f && <BagikanWa ringkas fotoId={f.id} kode={f.kode} diambil_at={f.diambil_at} />}
              {boleh && g.slot !== null && n?.terisi && (
                <button type="button" disabled={!bisaUbah} onClick={() => { setLihat(null); setModeUbah(true); setPilih({ tipe: "slot", slot: g.slot as number }); }} className={TOMBOL_UTAMA}>
                  Ganti urutan foto ini
                </button>
              )}
              {boleh && g.slot === null && f && (
                <button type="button" disabled={!bisaUbah} onClick={() => { setLihat(null); setModeUbah(true); setPilih({ tipe: "cadangan", id: f.id }); }} className={TOMBOL_UTAMA}>
                  Pasang ke nomor…
                </button>
              )}
              {g.slot !== null && n?.terisi && bisaKamera && (
                <div>
                  <Link href={`/sigap/foto?kegiatan=${kegiatanId}&nomor=${g.slot}`} className="flex min-h-[48px] w-full items-center justify-center whitespace-nowrap rounded-xl border-2 border-[#C9D3E6] bg-white px-3 text-sm font-bold text-[#0F2A52]">
                    Ambil ulang foto
                  </Link>
                  <p className="mt-1 text-center text-[11.5px] text-[#55657D]">Foto lama tersimpan sebagai cadangan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Lapisan>
    );
  }

  /** Ubin foto persegi seragam (nomor maupun cadangan). Gambar diisi absolut supaya foto tegak/landscape tidak mengubah tinggi ubin. */
  function ubin(o: { badge: string; terisi: boolean; cadangan?: boolean; fotoId: number | null; judul: string; sub: string; kosongTeks: string; dipilih: boolean; masalah: boolean; nyala: boolean; label: string; onKlik: () => void }) {
    const batas = o.nyala ? "border-[#1AA37A] ring-4 ring-[#BFEBD9] motion-safe:animate-pulse" : o.dipilih ? "border-[#0F2A52] ring-4 ring-[#BFD0F0]" : o.masalah ? "border-[#F2B632]" : o.terisi ? "border-[#C9D3E6]" : "border-dashed border-[#C9D3E6]";
    return (
      <button type="button" onClick={o.onKlik} aria-pressed={modeUbah ? o.dipilih : undefined} aria-label={o.label} className={`flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition ${batas}`}>
        <span className={`relative block aspect-square w-full overflow-hidden ${o.terisi ? "bg-[#EEF2F7]" : "bg-[#F7F9FD]"}`}>
          {o.fotoId !== null ? (
            <Gambar id={o.fotoId} kelas={`absolute inset-0 h-full w-full object-cover ${o.terisi ? "" : "opacity-50"}`} alt={o.judul} />
          ) : (
            <span className="absolute inset-0 flex items-end justify-center px-1 pb-1.5 text-center text-[11px] font-bold text-[#8A6200]">{o.kosongTeks}</span>
          )}
          <span className={`absolute left-1 top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-extrabold ${o.cadangan ? "bg-[#F2B632] text-[#3D2B00]" : o.terisi ? "bg-[#0F2A52] text-white" : "bg-white text-[#0F2A52] ring-1 ring-[#C9D3E6]"}`}>{o.badge}</span>
          {o.masalah && (
            <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow" title="Urutan jam terbalik">
              <IkonPeringatan kelas="h-4 w-4" />
            </span>
          )}
        </span>
        <span className="block px-1.5 pb-1.5 pt-1">
          {/* break-normal: kata tidak pernah dipecah di tengah ("Berangk/at"); frasa panjang turun ke baris berikut di antara kata */}
          <span className="block break-normal text-[11.5px] font-extrabold leading-tight text-[#0F2A52]">{o.judul}</span>
          <span className="mt-0.5 block text-[11px] leading-tight text-[#3C4C68]">{o.sub}</span>
        </span>
      </button>
    );
  }

  const dipilihSlot = pilih?.tipe === "slot" ? pilih.slot : null;
  const dipilihCadangan = pilih?.tipe === "cadangan" ? semuaCadangan(k).find((f) => f.id === pilih.id) ?? null : null;
  const daftarCadangan = semuaCadangan(k);

  return (
    <section className={`flex flex-col gap-2.5 ${polos ? "" : "rounded-2xl border border-[#C9D3E6] bg-white p-3"} ${rapat ? "[&>*:not(ol)]:mx-2 min-[640px]:[&>*:not(ol)]:mx-0" : ""}`} aria-label="Nomor foto Kamera SIGAP">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-[#0F2A52]">Nomor foto {k.nomor.filter((n) => n.terisi).length}/{k.jumlah}</div>
            <p className={`mt-0.5 text-[12.5px] font-semibold leading-snug ${pilih ? "text-[#0F2A52]" : "text-[#1B2B4B]"}`} aria-live="polite">
              {!boleh || !modeUbah
                ? "Ketuk foto untuk melihatnya lebih besar."
                : dipilihSlot !== null
                  ? `Foto ${dipilihSlot} dipilih. Pilih foto yang mau ditukar.`
                  : dipilihCadangan
                    ? "Foto cadangan dipilih. Ketuk nomor tujuannya di kisi."
                    : "Ganti urutan aktif: ketuk dua foto untuk menukarnya."}
            </p>
          </div>
          {boleh && (
            <button
              type="button"
              onClick={() => aturUbah(!modeUbah)}
              disabled={sibuk}
              aria-pressed={modeUbah}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-xl px-3 text-[13px] font-extrabold disabled:opacity-50 ${modeUbah ? "bg-[#0F2A52] text-white" : "border-2 border-[#C9D3E6] bg-white text-[#0F2A52]"}`}
            >
              {modeUbah ? "Selesai" : "⇅ Ganti urutan"}
            </button>
          )}
        </div>
        {k.susulan && otomatis && <p className="mt-0.5 text-[11.5px] leading-snug text-[#3C4C68]">Foto Kamera SIGAP tanggal ini disusun otomatis ke nomor yang masih kosong.</p>}
        <details className="mt-1 text-[11.5px] leading-relaxed text-[#3C4C68]">
          <summary className="cursor-pointer select-none py-1.5 font-bold text-[#1F5FBF]">Lihat panduan</summary>
          <ul className="list-disc space-y-1 pl-4">
            <li>Ketuk foto untuk membukanya selebar layar. Geser ke kiri atau kanan, atau ketuk ‹ ›, untuk foto lainnya.</li>
            <li>Untuk menukar urutan, tekan Ganti urutan dulu. Lalu ketuk satu foto dan foto lain; Anda diminta konfirmasi sebelum urutan berubah. Ketuk foto yang sama lagi untuk membatalkan pilihan.</li>
            <li>Tanda ⚠ berarti urutan jam foto tidak sesuai nomornya. Alasannya tertulis di bawah kisi; tukar boleh tetap dilakukan.</li>
            <li>Foto cadangan tetap tersimpan. Tekan Ganti urutan, ketuk salah satu, lalu ketuk nomor tujuannya.</li>
            {bisaKamera && <li>Salah foto? Buka foto itu lalu ketuk Ambil ulang foto. Foto lama tersimpan sebagai cadangan.</li>}
          </ul>
        </details>
      </div>

      {pesan && <div role="status" className="rounded-lg bg-[#E3F6EC] px-3 py-2 text-xs font-semibold leading-relaxed text-[#0B6B3F]">{pesan}</div>}
      {petunjuk && <div role="status" className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs font-semibold leading-relaxed text-[#1B2B4B]">{petunjuk}</div>}
      {galat && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div>}
      {!k.boleh && k.alasan_tutup && <div className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs text-[#5E4300]">{k.alasan_tutup}</div>}
      {k.boleh && k.lampau && typeof k.sisa_hari === "number" && (
        <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">
          Hari ini sudah lewat, tetapi nomor foto masih bisa diatur {k.sisa_hari === 0 ? "sampai akhir hari ini" : `${k.sisa_hari} hari lagi`}. Sesudah itu terkunci.
        </div>
      )}

      <ol className={`grid grid-cols-3 ${rapat ? "gap-1 min-[640px]:gap-2" : "gap-2"}`}>
        {k.nomor.map((n) => {
          const f = n.foto ?? n.ditahan ?? null;
          const masalah = bermasalah.has(n.slot);
          return (
            <li key={n.slot} className="h-full min-w-0">
              {ubin({
                badge: String(n.slot),
                terisi: n.terisi,
                fotoId: f?.id ?? null,
                judul: peranRingkas(jenis, n.slot),
                sub: n.terisi ? (n.foto ? `${jamIso(n.foto.diambil_at)} WIB` : "Manual") : n.ditahan ? `${jamIso(n.ditahan.diambil_at)} · dipesan` : "\u00a0",
                kosongTeks: n.terisi ? "Unggahan manual" : "Kosong",
                dipilih: dipilihSlot === n.slot,
                masalah,
                nyala: kilat.includes(n.slot),
                label: `Foto ${n.slot}, ${peranRingkas(jenis, n.slot)}, ${n.terisi ? subNomor(n) : n.ditahan ? "dipesan, menunggu diperiksa" : "kosong"}${masalah ? ", urutan jam terbalik" : ""}`,
                onKlik: () => ketukSlot(n.slot),
              })}
            </li>
          );
        })}
      </ol>

      {pilih && (
        <div className="flex gap-2">
          {dipilihSlot !== null && (
            <button type="button" onClick={() => setLihat(`s${dipilihSlot}`)} className="min-h-[44px] flex-1 whitespace-nowrap rounded-lg border-2 border-[#C9D3E6] bg-white px-2 text-[13px] font-bold text-[#0F2A52]">Lihat besar</button>
          )}
          <button type="button" onClick={() => setPilih(null)} className="min-h-[44px] flex-1 whitespace-nowrap rounded-lg border-2 border-[#C9D3E6] bg-white px-2 text-[13px] font-bold text-[#0F2A52]">Batal pilih</button>
        </div>
      )}

      {alasan.baris.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#5E4300]">
          <IkonPeringatan kelas="mt-0.5 h-4 w-4 flex-none" />
          <div>
            {alasan.baris.map((t) => (
              <p key={t}>{t}</p>
            ))}
            {alasan.sisa > 0 && <p>+{alasan.sisa} lagi</p>}
          </div>
        </div>
      )}

      {boleh && nilai.jumlahBerjam >= 2 && (
        <div>
          <button type="button" disabled={!bisaUbah || rencana.langkah.length === 0} onClick={() => { setGalatModal(null); setKonf({ jenis: "urut" }); }} className={TOMBOL_SEKUNDER}>
            Urutkan sesuai jam
          </button>
          {rencana.langkah.length === 0 && <p className="mt-1 text-center text-[11.5px] text-[#55657D]">Foto sudah berurutan sesuai jam.</p>}
        </div>
      )}

      {daftarCadangan.length > 0 && (
        <>
          <div className="text-[13px] font-extrabold text-[#0F2A52]">Foto cadangan ({daftarCadangan.length})</div>
          {/* petunjuk disorot: saat Ganti urutan aktif, langkah yang sedang berlaku diberi latar kuning (1 = pilih foto, 2 = pilih nomor tujuan) */}
          <div role="note" className="rounded-lg border border-[#BFD0F0] bg-[#EAF1FF] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#0F2A52]">
            {boleh ? (
              <>
                Tersimpan, belum bernomor. Untuk memasang ke sebuah nomor, tekan Ganti urutan.{" "}
                {modeUbah && (
                  <>
                    <mark className={`rounded px-1 font-extrabold text-[#0F2A52] ${dipilihCadangan ? "bg-transparent" : "bg-[#FFE08A]"}`}>1. Ketuk satu foto</mark>, lalu{" "}
                    <mark className={`rounded px-1 font-extrabold text-[#0F2A52] ${dipilihCadangan ? "bg-[#FFE08A]" : "bg-transparent"}`}>2. ketuk nomor tujuannya</mark> di kisi.
                  </>
                )}
              </>
            ) : (
              "Tersimpan, belum bernomor."
            )}
            {(k.cadangan_rekan ?? []).length > 0 && (
              <>
                {" "}Foto berlabel “dari …” dikirim rekan dan tergeser dari nomornya; dipasang kembali hanya oleh ketukan Anda, tidak ikut susun otomatis.
              </>
            )}
          </div>
          <ol className={`grid grid-cols-3 ${rapat ? "gap-1 min-[640px]:gap-2" : "gap-2"}`}>
            {daftarCadangan.map((f, urutan) => {
              const huruf = String.fromCharCode(65 + (urutan % 26));
              return (
                <li key={f.id} className="h-full min-w-0">
                  {ubin({
                    badge: huruf,
                    terisi: true,
                    cadangan: true,
                    fotoId: f.id,
                    judul: `Cadangan ${huruf}`,
                    sub: subCadangan(f, jamIso(f.diambil_at)),
                    kosongTeks: "",
                    dipilih: dipilihCadangan?.id === f.id,
                    masalah: false,
                    nyala: false,
                    label: `Foto cadangan ${huruf}, ${jamIso(f.diambil_at)}${f.dari !== undefined ? `, ${labelDariRekan(f.dari)}` : ""}`,
                    onKlik: () => ketukCadangan(f.id),
                  })}
                </li>
              );
            })}
          </ol>
          {bisaUbah && modeUbah && k.kosong.length > 0 && k.cadangan.length > 0 && (
            <button type="button" onClick={() => void isi()} disabled={sibuk} className={TOMBOL_UTAMA}>
              {sibuk ? "Menyusun…" : "Isi nomor kosong otomatis"}
            </button>
          )}
        </>
      )}

      {ModalKonfirmasi()}
      {LembarLihat()}
    </section>
  );
}
