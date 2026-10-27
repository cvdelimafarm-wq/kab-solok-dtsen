"use client";

// app/sigap/foto/KameraSigap.tsx
//
// (19 Okt 2026) Kamera SIGAP dalam aplikasi. Tidak ada kolom ketik waktu/koordinat dan tidak ada pilihan dari galeri:
//  - waktu: token dari server saat kamera dibuka + jam monotonik HP (performance.now) sampai tombol potret ditekan;
//  - koordinat: GPS HP (enableHighAccuracy) -- akurasi > 5000 m ditolak server; 300-5000 m diterima berpenanda "perlu diperiksa";
//  - cap (logo, waktu, koordinat, nama, kegiatan, kode, QR) dicetak SERVER ke gambar.
// Tanpa sinyal: foto disimpan di IndexedDB dan terkirim otomatis saat ada sinyal.
//
// (21 Okt 2026) Nomor foto OTOMATIS + pengaman "lupa Kirim":
//  - nomor yang dipilihkan = nomor kosong terkecil hari ini (foto pertama = 1 saat berangkat, kedua = 2, dst; lihat lib/sigapFotoSusun.ts); petugas
//    cukup mengetuk nomor lain bila tidak sesuai;
//  - begitu dipotret, foto langsung disimpan sebagai DRAF di HP (IndexedDB) dan detaknya diperbarui selama pratinjau terbuka: tombol Back, pindah
//    aplikasi, atau aplikasi tertutup TIDAK membuang foto (menjadi antrean yang terkirim sendiri); hanya "Buang & ulangi" yang membuang;
//  - hitung mundur 10 detik mengirim otomatis dengan nomor yang dipilihkan; mengetuk nomor/Bagikan/"Ubah dulu" menghentikannya.
// (27 Okt 2026) NOMOR DIPILIH DULU, BARU KAMERA (permintaan user): sebelum kamera terbuka, petugas memilih "Foto ini untuk nomor berapa?" (bawaan = nomor
// kosong berikutnya). Nomor kosong -> jepretan berikutnya masuk nomor itu (tetap bisa diubah di pratinjau); nomor terisi -> mode ambil ulang seperti
// tombol "Ganti foto"; "Lewati" = cara lama (nomor dipilih sesudah memotret). Kamera baru dinyalakan sesudah pilihan, dan tetap menyala selama
// layar ini dipakai memotret beberapa foto. Datang dari tombol "Ganti foto" (?nomor=N) langsung ke kamera karena nomornya sudah pasti.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import BagikanFoto, { type TagPilihan } from "./BagikanFoto";
import BagikanWa from "./BagikanWa";
import { ambilJson, kirimMultipart, type GalatFoto } from "./klien";
import { tandaBasi } from "@/app/portal/dataBersama";
import { teksProgresKirim } from "@/lib/sigapFotoCache";
import { daftarAntrean, formDariItem, lepasAntrean, perbaruiAntrean, tambahAntrean, type ItemAntrean } from "./antreanFoto";
import { drafMasihBaru, kirimSemuaAntrean } from "./kirimAntrean";
import { bacaSesi, pemilikSesi } from "@/app/portal/sesi";
import { MAKS_AKURASI_M, MAKS_AKURASI_DISPENSASI_M, TUNGGU_AKURASI_KASAR_DTK, UMUR_TOKEN_MS, LABEL_KEPERCAYAAN, LABEL_ALASAN, labelFotoTanpaSinyal, SLOT_BERLOKASI, MAKS_TAG, teksKoordinat, teksWaktuWib, type Kepercayaan } from "@/lib/sigapFoto";
import { labelFoto } from "@/lib/sigapLabelFoto";
import { nomorBerikutnya } from "@/lib/sigapFotoSusun";
import { arahDariGravitasi, bacaBelajarPeta, catatKoreksi, kuartalAkhir, kuartalDasarKamera, kunciKondisi, matriksKuartal, type ArahHp, type BelajarPeta } from "@/lib/sigapFotoPutar";
import { jamWib } from "@/lib/sigapUrutanFoto";
import { useTombolKembali } from "./useTombolKembali";
import { ambilTokenPaket, siapkanPaket } from "./paketOffline";

type Pos = { lat: number; lng: number; akurasi: number; mono: number };
type Hasil = { ok: true; sudah?: boolean; foto: { id: number; kode: string; kepercayaan: Kepercayaan; alasan: string[]; diambil_at?: string; diterima_at?: string | null }; penempatan: { ok?: boolean; status?: string; error?: string } | null; ditahan: boolean; jumlah_tag: number };
type Hadap = "environment" | "user";

const NOMOR = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
// (27 Okt 2026) Jaga-jaga petugas lupa menekan "Arah sudah benar, kirim": foto terkirim sendiri sesudah sekian detik (hanya bila nomor dipilihkan sistem/petugas
// sebelum memotret; mode ambil ulang tidak pernah kirim otomatis). Memutar foto menghentikan hitungan lalu memulainya lagi dari awal.
const DETIK_KIRIM_OTOMATIS = 30;
const tglWib = (ms = Date.now()) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

type Jepretan = { blob: Blob; url: string; pos: Pos; token: string | null; mono: number | null; wall: number | null; waktuHp: number; umurPosisi: number; dibuatMs: number;
  /** (26 Okt 2026) kondisi saat memotret (kunci belajar, mis. "s1" = HP miring kiri), keadaan sensor/layar untuk diagnosa, dan total putar manual petugas (searah jarum jam, kelipatan 90 derajat) */
  kunci: string; diag: Record<string, unknown>; kuartal: number };

function itemDari(j: Jepretan, kegiatanId: number, slot: number | null, tag: TagPilihan[]): ItemAntrean {
  return {
    akun_id: pemilikSesi(),
    dibuat_ms: j.dibuatMs,
    blob: j.blob,
    kegiatan_id: kegiatanId,
    token: j.token,
    elapsed_mono_ms: j.mono,
    elapsed_wall_ms: j.wall,
    waktu_hp: j.waktuHp,
    lat: j.pos.lat,
    lng: j.pos.lng,
    akurasi: j.pos.akurasi,
    posisi_umur_ms: j.umurPosisi,
    slot,
    tag: tag.map((t) => ({ akun_id: t.akun_id, slot_usulan: t.slot_usulan })),
  };
}

/**
 * (20 Okt 2026) DRAFT tampilan cap di layar sebelum kirim: logo, waktu, koordinat, nama, kegiatan. Hanya gambaran -- cap RESMI dicetak server
 * (lib/sigapFotoCap.ts; waktu resmi dari server, kode dan QR baru ada setelah terkirim). Ukuran mengikuti lebar foto (satuan cqw = lebar/100),
 * tata letak meniru server (satuan server u = lebar/1080).
 */
function PratinjauCap({ url, waktuMs, pos, nama, peran, kegiatan }: { url: string; waktuMs: number; pos: Pos; nama: string; peran: string; kegiatan: string }) {
  // (21 Okt 2026) Foto landscape: satuan skala mengikuti sisi PENDEK foto (server: min(lebar, tinggi)/1080) supaya cap tidak membesar pada foto lebar.
  const [rasio, setRasio] = useState(1);
  const u = (px: number) => `${((px * 100 * rasio) / 1080).toFixed(3)}cqw`;
  const f = (px: number) => `max(8px, ${u(px)})`;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black" style={{ containerType: "inline-size" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Hasil potret dengan draft cap" className="block h-auto w-full" onLoad={(e) => { const g = e.currentTarget; if (g.naturalWidth > 0 && g.naturalHeight > 0) setRasio(Math.min(1, g.naturalHeight / g.naturalWidth)); }} />
      <span className="absolute left-2 top-2 rounded-full bg-[#F2B632] px-2.5 py-1 text-[10.5px] font-extrabold tracking-wide text-[#3B2A00]">DRAFT CAP</span>
      <div className="absolute inset-x-0 bottom-0 flex items-start text-left" style={{ background: "rgba(10,26,51,.74)", padding: u(22), gap: u(16) }} aria-hidden="true">
        <div className="flex shrink-0 items-center justify-center bg-white" style={{ width: u(86), height: u(86), borderRadius: u(16) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sigap-logo-cap.png" alt="" style={{ width: u(72), height: u(72), objectFit: "contain" }} />
        </div>
        <div className="min-w-0 flex-1" style={{ display: "flex", flexDirection: "column", gap: u(4) }}>
          <b style={{ fontSize: f(27), lineHeight: 1.2, color: "#fff" }}>{teksWaktuWib(waktuMs)}</b>
          <span style={{ fontSize: f(23), lineHeight: 1.2, color: "#F2B632" }}>{teksKoordinat(pos.lat, pos.lng, pos.akurasi)}</span>
          <b style={{ fontSize: f(22), lineHeight: 1.2, color: "#fff" }}>{nama ? `${nama} · ${peran}` : peran}</b>
          <span style={{ fontSize: f(20), lineHeight: 1.2, color: "#C5D0E4" }}>{kegiatan}</span>
        </div>
        <div className="flex shrink-0 flex-col items-center bg-white text-center" style={{ width: u(166), padding: u(8), borderRadius: u(10), gap: u(4) }}>
          <div className="flex w-full items-center justify-center border border-dashed border-[#9FB0CC]" style={{ aspectRatio: "1 / 1", fontSize: f(22), color: "#5B6B84", fontWeight: 700 }}>QR</div>
          <span style={{ fontSize: f(13), color: "#5B6B84", lineHeight: 1.15 }}>kode &amp; QR dari server</span>
        </div>
      </div>
    </div>
  );
}

export default function KameraSigap({
  kegiatanId,
  namaKegiatan,
  jumlahNomor,
  namaSaya = "",
  peran = "",
  jenis = null,
  nomorGanti = null,
  onSelesai,
}: {
  kegiatanId: number;
  namaKegiatan: string;
  jumlahNomor: number;
  namaSaya?: string;
  peran?: string;
  jenis?: string | null;
  /** (23 Okt 2026) tombol "Ganti foto": jepretan berikutnya otomatis memakai nomor ini dan menggantikan foto lamanya (foto lama jadi cadangan) */
  nomorGanti?: number | null;
  onSelesai?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const aliranRef = useRef<MediaStream | null>(null);
  const gpsRef = useRef<number | null>(null);
  const tokenRef = useRef<{ token: string; mono: number; wall: number } | null>(null);
  const [posisi, setPosisi] = useState<Pos | null>(null);
  const [galatKamera, setGalatKamera] = useState<string | null>(null);
  const [galatGps, setGalatGps] = useState<string | null>(null);
  const [jepretan, setJepretan] = useState<Jepretan | null>(null);
  const [nomor, setNomor] = useState<number | null>(null);
  const [ganti, setGanti] = useState<number | null>(() => (nomorGanti !== null && Number.isInteger(nomorGanti) && nomorGanti >= 1 && nomorGanti <= jumlahNomor ? nomorGanti : null)); // mode ganti foto: nomor yang akan digantikan
  // (27 Okt 2026) langkah "pilih nomor dulu": awalSiap = pilihan nomor untuk jepretan berikutnya sudah dibuat (atau dilewati); nomorAwal = nomor KOSONG yang dipilih
  const [awalSiap, setAwalSiap] = useState<boolean>(() => nomorGanti !== null && Number.isInteger(nomorGanti) && nomorGanti >= 1 && nomorGanti <= jumlahNomor);
  const [nomorAwal, setNomorAwal] = useState<number | null>(null);
  const [pilihAwal, setPilihAwal] = useState<number | null>(null); // sorotan di layar pilih nomor (null = ikuti saran)
  const [kameraMulai, setKameraMulai] = useState<boolean>(() => nomorGanti !== null && Number.isInteger(nomorGanti) && nomorGanti >= 1 && nomorGanti <= jumlahNomor); // kamera tidak dinyalakan sebelum nomor dipilih
  const [nomorOtomatis, setNomorOtomatis] = useState(false); // nomor dipilihkan sistem (belum diubah petugas)
  const [hitung, setHitung] = useState<number | null>(null); // detik menuju kirim otomatis; null = tidak aktif
  const [arahOk, setArahOk] = useState(false); // langkah 1 "Periksa arah foto" sudah dikonfirmasi petugas (sebelum nomor, bagikan, dan Kirim)
  const [terisiServer, setTerisiServer] = useState<number[]>([]); // nomor hari ini yang sudah terisi di server
  const [terisiAntre, setTerisiAntre] = useState<number[]>([]); // nomor hari ini yang foto-nya masih antre di HP ini
  const [ditahanServer, setDitahanServer] = useState<number[]>([]); // nomor hari ini yang dipesan foto kuning/merah yang menunggu diperiksa (tag 'ditahan')
  const [konfirmasiTanpaNomor, setKonfirmasiTanpaNomor] = useState(false); // (22 Okt 2026) foto hanya dibagikan ke rekan, nomor sendiri kosong -> minta konfirmasi
  const [konfirmasiGanti, setKonfirmasiGanti] = useState<number | null>(null); // nomor terisi yang hendak diganti (menunggu modal "Yakin?")
  const [rapi, setRapi] = useState<{ cadangan: number; kosong: number[]; href: string } | null>(null); // foto terkirim yang belum bernomor + tautan ke kartu hari
  const drafIdRef = useRef<number | null>(null);
  const [tag, setTag] = useState<TagPilihan[]>([]);
  const [bagikan, setBagikan] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [progres, setProgres] = useState<number | null>(null); // (27 Okt 2026) bagian foto yang sudah terunggah (0..1); null = belum diketahui
  const [pesan, setPesan] = useState<{ jenis: "ok" | "info" | "galat"; teks: string } | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // (27 Okt 2026) Alur sesudah terkirim: popup "Foto ke-n berhasil terkirim", lalu tanya "Bagikan ke rekan?" (Ya = pilih rekan, Tidak = lanjut memotret).
  const [popupKirim, setPopupKirim] = useState<{ judul: string; sub: string | null } | null>(null);
  const [bagiLangkah, setBagiLangkah] = useState<"tanya" | "pilih">("tanya");
  const [tagBagi, setTagBagi] = useState<TagPilihan[]>([]);
  const [sibukBagi, setSibukBagi] = useState(false);
  const [pesanBagi, setPesanBagi] = useState<string | null>(null);
  const [bagiN, setBagiN] = useState<number | null>(null); // jumlah rekan yang sudah diajak (null = belum membagikan)
  const [antre, setAntre] = useState(0);
  const [hadap, setHadap] = useState<Hadap>("environment"); // kamera belakang dulu; tombol Putar kamera untuk depan
  const [banyakKamera, setBanyakKamera] = useState<boolean | null>(null); // null = belum diketahui (tombol tetap tampil)
  // (21 Okt 2026) Landscape otomatis ala kamera cap waktu: aplikasi tetap terkunci tegak, arah HP dibaca dari sensor gerak (gravitasi).
  // miring: 0 = HP tegak; 1 = HP diputar ke kiri (atas HP ke kiri); -1 = HP diputar ke kanan. Tidak bergantung pada putar otomatis (auto-rotate) di HP.
  // (26 Okt 2026) 2 = HP terbalik (atas HP ke bawah), seperti kamera biasa yang mengenali empat arah.
  const [miring, setMiring] = useState<ArahHp>(0);
  // Belajar per HP dan per kondisi (HP miring kiri/kanan/terbalik, atau layar sendiri landscape): bila petugas berulang kali memutar 180 derajat foto yang
  // sudah diputar otomatis pada kondisi itu, kondisi itu diberi tambahan putaran 180 derajat di HP ini (lib/sigapFotoPutar.ts).
  const belajarRef = useRef<BelajarPeta>({});
  const belajarDicatatRef = useRef<number | null>(null);
  const kunciBelajar = () => `sigap-foto-belajar2:${pemilikSesi()}`;
  useEffect(() => {
    try {
      belajarRef.current = bacaBelajarPeta(localStorage.getItem(kunciBelajar()));
    } catch {
      /* penyimpanan tidak tersedia: pakai bawaan */
    }
  }, []);
  function catatBelajar(j: Jepretan) {
    if (belajarDicatatRef.current === j.dibuatMs) return;
    belajarDicatatRef.current = j.dibuatMs;
    const b = catatKoreksi(belajarRef.current, j.kunci, j.kuartal);
    belajarRef.current = b;
    try {
      localStorage.setItem(kunciBelajar(), JSON.stringify(b));
    } catch {
      /* abaikan */
    }
  }
  /** Diagnosa orientasi (tanpa foto): kondisi HP, putaran otomatis, dan koreksi petugas -> catatan audit, untuk memastikan arah putar di tiap merek HP. Gagal = diabaikan. */
  function laporOrientasi(fotoId: number, j: Jepretan) {
    void ambilJson("/api/sigap/foto/orientasi", { method: "POST", body: { foto_id: fotoId, diag: { ...j.diag, kuartal_manual: j.kuartal % 4 } } }).catch(() => undefined);
  }
  // (27 Okt 2026) Kamera tegak layar penuh (tanpa scroll: tombol Potret selalu terlihat). true = petugas menutupnya untuk melihat panduan GPS, kabar, dan tab lain.
  const [penuhTutup, setPenuhTutup] = useState(false);
  const [layarLebar, setLayarLebar] = useState(false); // layar sendiri sudah landscape (peramban biasa dengan putar otomatis): tidak perlu diputar manual
  const izinGerakRef = useRef(false);
  const gerakAdaRef = useRef(false);
  const diagRef = useRef<{ sumber: string; n: number; x: number; y: number }>({ sumber: "-", n: 0, x: 0, y: 0 });
  const [diag, setDiag] = useState("");

  const muatToken = useCallback(async () => {
    const mono = performance.now();
    const wall = Date.now();
    try {
      const d = await ambilJson<{ token: string }>("/api/sigap/foto/token");
      tokenRef.current = { token: d.token, mono, wall };
      void siapkanPaket(); // (23 Okt 2026) ada sinyal: sekalian pastikan paket token untuk kerja tanpa sinyal masih segar
    } catch {
      // tanpa sinyal: foto tetap bisa diambil; server menandainya "waktu belum terverifikasi" (kuning)
    }
  }, []);

  const hitungAntre = useCallback(async () => {
    try {
      const a = await daftarAntrean();
      const saya = pemilikSesi();
      // draf yang pratinjaunya terbuka bukan "antre"; foto yang sedang dipratinjau sendiri (id draf) tidak boleh menghitung nomornya sebagai "sudah terisi"
      const milik = a.filter((x) => x.akun_id === saya && !drafMasihBaru(x) && !(drafIdRef.current !== null && x.id === drafIdRef.current));
      setAntre(milik.length);
      const hariIni = tglWib();
      setTerisiAntre(milik.filter((x) => x.kegiatan_id === kegiatanId && x.slot !== null && tglWib(x.dibuat_ms) === hariIni && !x.galat_terakhir).map((x) => x.slot as number));
    } catch {
      setAntre(0);
      setTerisiAntre([]);
    }
  }, [kegiatanId]);

  const muatTerisi = useCallback(async () => {
    try {
      const d = await ambilJson<{ nomor: { slot: number; terisi: boolean }[]; kosong: number[]; ditahan?: number[]; cadangan: unknown[]; href_kerja: string }>(`/api/sigap/foto/susun?kegiatan=${kegiatanId}&tanggal=${tglWib()}`);
      setTerisiServer(d.nomor.filter((n) => n.terisi).map((n) => n.slot));
      setDitahanServer(d.ditahan ?? []);
      setRapi({ cadangan: d.cadangan.length, kosong: d.kosong, href: d.href_kerja });
    } catch {
      /* tanpa sinyal: saran nomor memakai antrean HP saja */
    }
  }, [kegiatanId]);

  const kirimAntrean = useCallback(
    async (paksa = false) => {
      await kirimSemuaAntrean({ paksa });
      tandaBasi("/api/sigap/foto"); // (27 Okt 2026) antrean mungkin baru terkirim: daftar "Foto saya" diperbarui saat dibuka
      void hitungAntre();
      void muatTerisi();
    },
    [hitungAntre, muatTerisi]
  );

  // Arah layar (bila layar sendiri berputar, sensor tidak dipakai)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: landscape)");
    const baca = () => setLayarLebar(mq.matches);
    baca();
    mq.addEventListener?.("change", baca);
    return () => mq.removeEventListener?.("change", baca);
  }, []);

  // Sensor arah HP: gaya berat pada sumbu x/y. Tegak: y ~ +9,8 (Android); diputar ke kiri: x ~ +9,8; ke kanan: x ~ -9,8 (iOS bertanda terbalik).
  // Dihaluskan, dengan ambang + histeresis supaya tidak bolak-balik; HP rebah di meja mempertahankan arah terakhir.
  // Sumber berurutan: devicemotion; bila tidak ada kabar dalam 1,5 dtk -> deviceorientation (beta/gamma) dan Accelerometer (Generic Sensor API).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    let sx = 0;
    let sy = 0;
    let awal = true;
    const terapkan = (gx: number, gy: number, sumber: string) => {
      if (awal) {
        sx = gx;
        sy = gy;
        awal = false;
      } else {
        sx = sx * 0.8 + gx * 0.2;
        sy = sy * 0.8 + gy * 0.2;
      }
      diagRef.current = { sumber, n: diagRef.current.n + 1, x: sx, y: sy };
      setMiring((p) => arahDariGravitasi(sx, sy, p)); // empat arah, dengan histeresis (lib/sigapFotoPutar.ts)
    };
    const onGerak = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || typeof g.x !== "number" || typeof g.y !== "number") return;
      gerakAdaRef.current = true;
      terapkan(ios ? -g.x : g.x, ios ? -g.y : g.y, "devicemotion");
    };
    const onArah = (e: DeviceOrientationEvent) => {
      if (gerakAdaRef.current || typeof e.beta !== "number" || typeof e.gamma !== "number") return;
      const be = (e.beta * Math.PI) / 180;
      const ga = (e.gamma * Math.PI) / 180;
      terapkan(-9.8 * Math.sin(ga), 9.8 * Math.cos(ga) * Math.sin(be), "deviceorientation");
    };
    window.addEventListener("devicemotion", onGerak);
    let sensorAcc: { stop?: () => void } | null = null;
    const timer = setTimeout(() => {
      if (gerakAdaRef.current) return;
      window.addEventListener("deviceorientation", onArah);
      try {
        const Acc = (window as unknown as { Accelerometer?: new (o: { frequency: number }) => { x: number | null; y: number | null; start: () => void; stop: () => void; addEventListener: (n: string, f: () => void) => void } }).Accelerometer;
        if (Acc) {
          const a = new Acc({ frequency: 10 });
          a.addEventListener("reading", () => {
            if (gerakAdaRef.current || diagRef.current.sumber === "deviceorientation" || a.x == null || a.y == null) return;
            terapkan(a.x, a.y, "accelerometer");
          });
          a.start();
          sensorAcc = a;
        }
      } catch {
        /* tidak diizinkan: abaikan */
      }
    }, 1500);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("devicemotion", onGerak);
      window.removeEventListener("deviceorientation", onArah);
      try {
        sensorAcc?.stop?.();
      } catch {
        /* abaikan */
      }
    };
  }, []);

  // Baris diagnosa kecil (sementara) di bawah pratinjau: versi kode, sumber sensor, arah layar, ukuran bingkai kamera
  useEffect(() => {
    const t = setInterval(() => {
      const v = videoRef.current;
      const d = diagRef.current;
      const tipe = typeof screen !== "undefined" ? screen.orientation?.type ?? "?" : "?";
      setDiag(`v5 · sensor ${d.n ? `${d.sumber} (${d.n}) x=${d.x.toFixed(1)} y=${d.y.toFixed(1)}` : "tidak ada kabar"} · layar ${tipe} · bingkai ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0}${Object.values(belajarRef.current).some((b) => b.balik) ? " · arah dikoreksi" : ""}`);
    }, 700);
    return () => clearInterval(t);
  }, []);

  // iOS 13+ meminta izin sensor gerak lewat ketukan pengguna (Android tidak perlu)
  function mintaIzinGerak() {
    if (izinGerakRef.current) return;
    izinGerakRef.current = true;
    const D = (typeof DeviceMotionEvent !== "undefined" ? DeviceMotionEvent : undefined) as unknown as { requestPermission?: () => Promise<string> } | undefined;
    D?.requestPermission?.().catch(() => undefined);
  }

  // Kamera (diulang saat depan/belakang diganti)
  useEffect(() => {
    if (!kameraMulai) return; // (27 Okt 2026) tunggu petugas memilih nomor foto dulu
    let hidup = true;
    setGalatKamera(null);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setGalatKamera("Peramban ini tidak mendukung kamera dalam aplikasi.");
        return;
      }
      aliranRef.current?.getTracks().forEach((t) => t.stop()); // lepas kamera lama dulu (beberapa HP tidak boleh dua kamera sekaligus)
      aliranRef.current = null;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: hadap }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!hidup) return s.getTracks().forEach((t) => t.stop());
        aliranRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
        navigator.mediaDevices
          .enumerateDevices()
          .then((d) => hidup && setBanyakKamera(d.filter((x) => x.kind === "videoinput").length > 1))
          .catch(() => undefined);
      } catch (e) {
        setGalatKamera(e instanceof Error && e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera pada pengaturan peramban, lalu buka lagi." : "Kamera tidak dapat dibuka.");
      }
    })();
    return () => {
      hidup = false;
      aliranRef.current?.getTracks().forEach((t) => t.stop());
      aliranRef.current = null;
    };
  }, [hadap, kameraMulai]);

  // Setelah "Ulangi"/"Foto lagi" elemen video dibuat ulang: sambungkan lagi ke aliran kamera yang masih menyala
  // (juga saat tampilan landscape penuh layar dibuka/ditutup: elemen video berpindah tempat)
  const putar: ArahHp = layarLebar ? 0 : miring;
  // Tampilan landscape penuh layar hanya untuk HP miring ke samping; HP terbalik (2) tetap memakai tata letak biasa.
  const landPenuh = (putar === 1 || putar === -1) && !galatKamera;
  // (27 Okt 2026) HP tegak: kamera layar penuh. Bingkai 3:4 di dalam halaman setinggi >1.100 px sehingga tombol Potret terdorong keluar layar (harus di-scroll).
  const tegakPenuh = !landPenuh && !galatKamera && !penuhTutup;
  useEffect(() => {
    const v = videoRef.current;
    if (!jepretan && v && aliranRef.current && v.srcObject !== aliranRef.current) {
      v.srcObject = aliranRef.current;
      void v.play().catch(() => undefined);
    }
  }, [jepretan, landPenuh, tegakPenuh, awalSiap]);
  // layar penuh tegak aktif: halaman di belakangnya tidak boleh ikut tergulir
  const kunciGulir = tegakPenuh && !jepretan && awalSiap;
  useEffect(() => {
    if (!kunciGulir) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [kunciGulir]);

  // GPS, token waktu, dan antrean tanpa sinyal
  useEffect(() => {
    if (!navigator.geolocation) setGalatGps("Peramban ini tidak mendukung lokasi.");
    else {
      gpsRef.current = navigator.geolocation.watchPosition(
        (p) => {
          setGalatGps(null);
          setPosisi({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy, mono: performance.now() });
        },
        (e) => setGalatGps(e.code === 1 ? "Izin lokasi ditolak. Izinkan lokasi agar foto bisa diambil." : "Lokasi belum terbaca."),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
      );
    }
    void muatToken();
    void hitungAntre();
    void muatTerisi();
    void kirimAntrean();
    const timer = setInterval(() => void muatToken(), 20 * 60_000);
    const online = () => {
      void siapkanPaket();
      void kirimAntrean();
    };
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      if (gpsRef.current !== null) navigator.geolocation.clearWatch(gpsRef.current);
    };
  }, [muatToken, hitungAntre, muatTerisi, kirimAntrean]);

  useEffect(() => () => { if (jepretan) URL.revokeObjectURL(jepretan.url); }, [jepretan]);

  const akurasiOk = !!posisi && posisi.akurasi <= MAKS_AKURASI_M;
  // (21 Okt 2026) Dispensasi akurasi: 300-5000 m boleh dipotret setelah menunggu + panduan; foto ditandai "perlu diperiksa" oleh server (kuning). Di atas 5000 m tetap tidak bisa.
  const akurasiKasar = !!posisi && posisi.akurasi > MAKS_AKURASI_M && posisi.akurasi <= MAKS_AKURASI_DISPENSASI_M;
  const akurasiBuruk = !!posisi && posisi.akurasi > MAKS_AKURASI_DISPENSASI_M;
  const [detikKasar, setDetikKasar] = useState(0);
  useEffect(() => {
    if (!akurasiKasar) {
      setDetikKasar(0);
      return;
    }
    const mulai = Date.now();
    const t = setInterval(() => setDetikKasar(Math.floor((Date.now() - mulai) / 1000)), 1000);
    return () => clearInterval(t);
  }, [akurasiKasar]);
  const sisaTunggu = Math.max(0, TUNGGU_AKURASI_KASAR_DTK - detikKasar);
  const siapPotret = akurasiOk || (akurasiKasar && sisaTunggu === 0);
  const etiket = labelFoto(jenis);
  const terisiSemuaNomor = useMemo(() => new Set([...terisiServer, ...terisiAntre]), [terisiServer, terisiAntre]);
  // nomor yang sudah dipesan foto kuning/merah (menunggu diperiksa) juga dilewati saat memilih nomor otomatis: foto tetap bernomor tahapannya
  const dipesanSemua = useMemo(() => new Set([...terisiSemuaNomor, ...ditahanServer]), [terisiSemuaNomor, ditahanServer]);
  const saran = nomorBerikutnya(dipesanSemua, jumlahNomor); // null = semua nomor hari ini sudah terisi/dipesan
  // Foto minimal punya nomor sendiri atau dibagikan ke rekan. Bila semua nomor hari ini sudah terisi, foto boleh dikirim tanpa nomor sebagai CADANGAN.
  const adaTujuan = nomor !== null || tag.length > 0 || saran === null;
  // (22 Okt 2026) Foto dibagikan ke rekan SAJA padahal masih ada nomor kosong milik sendiri: foto tidak mengisi nomor petugas (tag miliknya "menunggu"),
  // sehingga tak masuk lampiran dokumentasi (kasus Widya Elvera & Puspita Putri). Kirim diminta konfirmasi dulu.
  const tanpaNomorSendiri = nomor === null && tag.length > 0 && saran !== null;

  async function potret() {
    const v = videoRef.current;
    if (!v || !posisi || !v.videoWidth || !siapPotret) return;
    const mono = performance.now();
    const wall = Date.now();
    const kanvas = document.createElement("canvas");
    const ctx = kanvas.getContext("2d");
    // HP dipegang miring tetapi layar terkunci tegak: bingkai kamera tetap tegak, jadi diputar 90 derajat agar foto jadi landscape dan atasnya benar.
    // (24 Okt 2026) PERBAIKAN foto landscape terbalik 180 derajat: arah putar sebelumnya tertukar (HP ke kiri diputar searah jarum jam, ke kanan
    // berlawanan). Kini memakai lib/sigapFotoPutar.ts (diuji): HP ke kiri -> sisi kanan bingkai jadi atas; HP ke kanan -> sisi kiri bingkai jadi atas.
    // (26 Okt 2026) Empat arah seperti kamera biasa: tegak, kiri, kanan, dan TERBALIK (180 derajat), ditambah koreksi hasil belajar per HP dan per kondisi.
    const sudutLayar = typeof screen !== "undefined" ? screen.orientation?.angle ?? 0 : 0;
    const kunci = kunciKondisi(layarLebar, sudutLayar, miring, hadap === "user");
    const kuartalDasar = layarLebar ? 0 : kuartalDasarKamera(miring, hadap === "user");
    const kuartalOtomatis = kuartalAkhir(kuartalDasar, belajarRef.current, kunci);
    let kuartalDipakai = 0;
    if (kuartalOtomatis === 2 || (kuartalOtomatis !== 0 && v.videoHeight > v.videoWidth)) {
      const r = matriksKuartal(kuartalOtomatis as 1 | 2 | 3, v.videoWidth, v.videoHeight);
      kanvas.width = r.lebar;
      kanvas.height = r.tinggi;
      ctx?.setTransform(r.m[0], r.m[1], r.m[2], r.m[3], r.m[4], r.m[5]);
      kuartalDipakai = kuartalOtomatis;
    } else {
      kanvas.width = v.videoWidth;
      kanvas.height = v.videoHeight;
    }
    ctx?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => kanvas.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) return setPesan({ jenis: "galat", teks: "Gagal mengambil gambar. Coba lagi." });
    // (23 Okt 2026) Token online (hijau) dipakai bila masih segar; token sekali pakai, jadi langsung dilepas (sebelumnya dipakai ulang oleh foto
    // berikutnya saat tanpa sinyal -> ditolak server "token_terpakai"). Tanpa token segar -> satu token dari PAKET HP (foto tanpa sinyal, kuning).
    const t = tokenRef.current;
    const umurToken = t ? mono - t.mono : null;
    let wTok: { token: string | null; mono: number | null; wall: number | null } = { token: null, mono: null, wall: null };
    if (t && umurToken !== null && umurToken >= 0 && umurToken <= UMUR_TOKEN_MS) {
      wTok = { token: t.token, mono: umurToken, wall: wall - t.wall };
      tokenRef.current = null;
    } else {
      const pk = ambilTokenPaket();
      if (pk) wTok = { token: pk.token, mono: pk.mono, wall: pk.wall };
    }
    const j: Jepretan = {
      blob,
      url: URL.createObjectURL(blob),
      pos: { ...posisi, mono: posisi.mono },
      token: wTok.token,
      mono: wTok.mono,
      wall: wTok.wall,
      waktuHp: wall,
      umurPosisi: Math.max(0, mono - posisi.mono),
      dibuatMs: wall,
      kunci,
      kuartal: 0,
      diag: {
        kunci, miring, layar_lebar: layarLebar, sudut_layar: sudutLayar, tipe_layar: typeof screen !== "undefined" ? screen.orientation?.type ?? null : null,
        bingkai: [v.videoWidth, v.videoHeight], hadap, sensor: [Number(diagRef.current.x.toFixed(1)), Number(diagRef.current.y.toFixed(1))], sumber: diagRef.current.sumber,
        kuartal_dasar: kuartalDasar, kuartal_dipakai: kuartalDipakai, balik: !!belajarRef.current[kunci]?.balik,
      },
    };
    // Pengaman: simpan sebagai DRAF di HP sebelum pratinjau tampil, supaya foto tidak hilang bila Kirim terlupa
    drafIdRef.current = null;
    const tujuanAwal = ganti ?? nomorAwal ?? saran; // (27 Okt 2026) nomor pilihan petugas sebelum memotret didahulukan dari saran sistem
    try {
      drafIdRef.current = (await tambahAntrean({ ...itemDari(j, kegiatanId, tujuanAwal, []), draf: true, jantung_ms: Date.now() })) as number;
    } catch {
      /* IndexedDB tidak tersedia (mis. mode pribadi): tetap bisa dikirim lewat tombol */
    }
    // mode ganti foto: nomor yang dituju sudah pasti (pilihan petugas), tanpa hitung mundur: petugas memeriksa pratinjau lalu menekan Kirim
    const tujuan = tujuanAwal;
    setNomor(tujuan);
    setNomorOtomatis(ganti === null && tujuan !== null);
    setHitung(ganti === null && tujuan !== null ? DETIK_KIRIM_OTOMATIS : null); // kirim otomatis jaga-jaga lupa menekan kirim (tidak untuk mode ambil ulang)
    setArahOk(false);
    setJepretan(j);
    setPesan(null);
    setHasil(null);
    void muatToken(); // token baru untuk jepretan berikutnya (token lama sekali pakai)
  }

  /**
   * (26 Okt 2026) Putar foto di pratinjau sebelum Kirim (k x 90 derajat searah jarum jam). Jaring pengaman bila arah HP salah dibaca: foto yang sudah
   * diputar ikut tersimpan sebagai draf di HP, dan hitung mundur kirim otomatis dihentikan supaya petugas sempat memeriksa hasilnya.
   */
  async function putarFoto(k: 1 | 2 | 3) {
    if (!jepretan || mengirim || hasil) return;
    setHitung(null);
    try {
      const bmp = await createImageBitmap(jepretan.blob);
      const r = matriksKuartal(k, bmp.width, bmp.height);
      const kv = document.createElement("canvas");
      kv.width = r.lebar;
      kv.height = r.tinggi;
      const c = kv.getContext("2d");
      if (!c) throw new Error("kanvas");
      c.setTransform(r.m[0], r.m[1], r.m[2], r.m[3], r.m[4], r.m[5]);
      c.drawImage(bmp, 0, 0);
      bmp.close?.();
      const blob = await new Promise<Blob | null>((ok) => kv.toBlob(ok, "image/jpeg", 0.9));
      if (!blob) throw new Error("blob");
      const url = URL.createObjectURL(blob);
      setJepretan((p) => (p ? { ...p, blob, url, kuartal: (p.kuartal + k) % 4 } : p)); // url lama dilepas oleh efek pada jepretan
      if (nomorOtomatis && nomor !== null) setHitung(DETIK_KIRIM_OTOMATIS); // sudah memeriksa arah: hitungan jaga-jaga mulai lagi dari awal
    } catch {
      setPesan({ jenis: "galat", teks: "Foto tidak dapat diputar. Coba lagi, atau pakai Buang & ulangi." });
    }
  }

  /** Menutup pratinjau TANPA menyentuh draf di HP (draf tetap milik antrean). */
  function tutupPratinjau() {
    if (jepretan) URL.revokeObjectURL(jepretan.url);
    setJepretan(null);
    setNomor(null);
    setKonfirmasiGanti(null);
    setNomorOtomatis(false);
    setHitung(null);
    setArahOk(false);
    setTag([]);
    setBagikan(false);
    setHasil(null);
    setPopupKirim(null);
    setBagiLangkah("tanya");
    setTagBagi([]);
    setPesanBagi(null);
    setBagiN(null);
    setGanti(null); // keluar dari pratinjau (kirim/antre/kembali) = mode ganti selesai; hanya "Buang & ulangi" yang mempertahankannya (lihat ulang())
    // (27 Okt 2026) foto berikutnya: pilih nomornya dulu lagi (bawaan = nomor kosong berikutnya); kamera tetap menyala
    setAwalSiap(false);
    setNomorAwal(null);
    setPilihAwal(null);
  }

  async function lepasDraf() {
    const id = drafIdRef.current;
    drafIdRef.current = null;
    if (id !== null) await lepasAntrean(id).catch(() => undefined);
  }

  /** Simpan/perbarui draf di HP. draf=false = sudah menjadi antrean biasa (terkirim otomatis oleh kirimSemuaAntrean). */
  const simpanDraf = useCallback(
    async (j: Jepretan, n: number | null, t: TagPilihan[], draf: boolean) => {
      const id = drafIdRef.current;
      if (id === null) return;
      try {
        await perbaruiAntrean({ ...itemDari(j, kegiatanId, n, t), id, draf, jantung_ms: Date.now() });
      } catch {
        /* abaikan */
      }
    },
    [kegiatanId]
  );

  /** "Buang & ulangi": satu-satunya jalan yang MEMBUANG foto. */
  function ulang() {
    const g = ganti;
    const n = hasil ? null : nomor; // "Buang & ulangi" (belum terkirim) memotret ulang untuk nomor yang sama; "Foto lagi" (sudah terkirim) memilih nomor baru
    void lepasDraf();
    tutupPratinjau();
    setGanti(g); // memotret ulang untuk nomor yang sama
    if (g !== null || n !== null) {
      setNomorAwal(g === null ? n : null);
      setAwalSiap(true);
    }
    setPesan(null);
  }

  // Back = kembali ke layar kamera (bukan keluar ke beranda). Foto yang belum dikirim TIDAK dibuang: disimpan ke antrean dan terkirim otomatis.
  useTombolKembali(!!jepretan, () => {
    if (mengirim) return false; // jangan batalkan pratinjau saat foto sedang dikirim
    if (jepretan && !hasil) {
      void simpanDraf(jepretan, nomor, tag, false).then(() => kirimAntrean());
      setPesan({ jenis: "info", teks: "Foto belum Anda kirim, jadi disimpan di HP dan dikirim otomatis. Untuk membuang foto, pakai Buang & ulangi." });
    }
    drafIdRef.current = null;
    tutupPratinjau();
  });

  // Draf diperbarui tiap nomor/rekan berubah dan tiap 20 detik (detak: tanda pratinjau masih terbuka)
  useEffect(() => {
    if (!jepretan || hasil) return;
    void simpanDraf(jepretan, nomor, tag, true);
    const t = setInterval(() => void simpanDraf(jepretan, nomor, tag, true), 20_000);
    return () => clearInterval(t);
  }, [jepretan, nomor, tag, hasil, simpanDraf]);

  // Pindah aplikasi / layar mati / tab ditutup saat pratinjau terbuka: foto langsung dilepas ke antrean (tidak hilang), dan ada peringatan tutup
  useEffect(() => {
    if (!jepretan || hasil) return;
    const sembunyi = () => void simpanDraf(jepretan, nomor, tag, document.visibilityState !== "hidden");
    const tutup = () => void simpanDraf(jepretan, nomor, tag, false);
    const cegah = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", sembunyi);
    window.addEventListener("pagehide", tutup);
    window.addEventListener("beforeunload", cegah);
    return () => {
      document.removeEventListener("visibilitychange", sembunyi);
      window.removeEventListener("pagehide", tutup);
      window.removeEventListener("beforeunload", cegah);
    };
  }, [jepretan, nomor, tag, hasil, simpanDraf]);

  // Layar ditinggalkan lewat navigasi dalam aplikasi (komponen dilepas) saat pratinjau terbuka: foto menjadi antrean dan langsung dikirim
  const keadaanRef = useRef({ jepretan, nomor, tag, hasil });
  keadaanRef.current = { jepretan, nomor, tag, hasil };
  useEffect(
    () => () => {
      const { jepretan: j, nomor: n, tag: t, hasil: h } = keadaanRef.current;
      if (j && !h) void simpanDraf(j, n, t, false).then(() => kirimSemuaAntrean());
    },
    [simpanDraf]
  );

  // Hitung mundur kirim otomatis
  useEffect(() => {
    if (hitung === null || !jepretan || mengirim || hasil) return;
    if (hitung <= 0) {
      setHitung(null);
      if (adaTujuan) {
        setArahOk(true); // bila gagal, layar cadangan (nomor + Kirim) yang tampil
        void kirim();
      }
      return;
    }
    const t = setTimeout(() => setHitung((h) => (h === null ? null : h - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitung, jepretan, mengirim, hasil]);

  // Popup "berhasil terkirim" tertutup sendiri setelah 3,5 detik (atau diketuk)
  useEffect(() => {
    if (!popupKirim) return;
    const t = setTimeout(() => setPopupKirim(null), 3500);
    return () => clearTimeout(t);
  }, [popupKirim]);

  async function kirim() {
    if (!jepretan) return;
    setHitung(null);
    const item: ItemAntrean = itemDari(jepretan, kegiatanId, nomor, tag);
    setMengirim(true);
    setProgres(0);
    setPesan(null);
    try {
      let persenTerakhir = -1;
      const r = await kirimMultipart<Hasil>("/api/sigap/foto", formDariItem(item), (b) => {
        const p = Math.floor(b * 100);
        if (p !== persenTerakhir) {
          persenTerakhir = p;
          setProgres(b);
        }
      });
      if (r.simulasi) {
        setPesan({ jenis: "info", teks: "Mode simulasi (masuk sebagai akun lain): foto TIDAK dikirim." });
      } else {
        await lepasDraf(); // sudah di server; draf di HP tidak diperlukan lagi
        tandaBasi("/api/sigap/foto"); // (27 Okt 2026) foto baru: daftar "Foto saya" yang tersimpan diperbarui di belakang saat dibuka
        catatBelajar(jepretan);
        laporOrientasi(r.data.foto.id, jepretan);
        setHasil(r.data);
        setGanti(null); // penggantian sudah terkirim: jepretan berikutnya kembali memakai nomor berikutnya
        setPesan(null);
        setBagiLangkah("tanya");
        setTagBagi([]);
        setPesanBagi(null);
        setBagiN(null);
        setPopupKirim({
          judul: r.data.sudah ? "Foto ini sudah tercatat sebelumnya" : nomor !== null ? `Foto ke-${nomor} berhasil terkirim` : "Foto berhasil terkirim",
          sub: r.data.ditahan ? "Menunggu diperiksa PML/admin sebelum tercatat di nomor foto." : nomor === null ? "Disimpan sebagai foto cadangan." : null,
        });
        if (nomor !== null) setTerisiServer((p) => Array.from(new Set([...p, nomor]))); // langsung maju ke nomor berikutnya; muatTerisi meluruskan bila ditahan
        void muatTerisi();
        onSelesai?.();
      }
    } catch (e) {
      const g = e as GalatFoto;
      if (g.message === "SESI_BERAKHIR") {
        setPesan({ jenis: "galat", teks: "Sesi berakhir. Masuk kembali; foto Anda masih tersimpan di HP ini dan akan terkirim setelah masuk." });
      } else if (g.status === undefined) {
        await simpanDraf(jepretan, nomor, tag, false); // draf menjadi antrean biasa
        catatBelajar(jepretan);
        drafIdRef.current = null;
        void hitungAntre();
        setPesan({ jenis: "info", teks: `Tidak ada sinyal. Foto tersimpan di HP ini (dipotret ${jamWib(jepretan.waktuHp)}) dan terkirim otomatis saat ada sinyal.` });
        tutupPratinjau();
      } else {
        setPesan({ jenis: "galat", teks: g.message });
      }
    } finally {
      setMengirim(false);
      setProgres(null);
    }
  }

  /** (27 Okt 2026) Foto sudah terkirim: ajak rekan yang dipilih (foto tidak dikirim ulang; rekan memilih nomor fotonya sendiri). */
  async function bagiKeRekan() {
    if (!hasil || tagBagi.length === 0 || sibukBagi) return;
    setSibukBagi(true);
    setPesanBagi(null);
    try {
      const r = await ambilJson<{ ok: boolean; simulasi?: boolean; ditambah?: number }>("/api/sigap/foto/tag", {
        method: "POST",
        body: { foto_id: hasil.foto.id, tag: tagBagi.map((t) => ({ akun_id: t.akun_id, slot_usulan: t.slot_usulan })) },
      });
      if (r.simulasi) {
        setPesanBagi("Mode simulasi (masuk sebagai akun lain): ajakan TIDAK dikirim.");
      } else {
        setBagiN(r.ditambah ?? 0);
        setPopupKirim({
          judul: r.ditambah ? `Ajakan terkirim ke ${r.ditambah} orang` : "Semua yang dipilih sudah pernah diajak",
          sub: r.ditambah ? "Rekan memilih nomor fotonya sendiri." : null,
        });
      }
    } catch (e) {
      const g = e as GalatFoto;
      setPesanBagi(g.message === "SESI_BERAKHIR" ? "Sesi berakhir. Masuk kembali, lalu bagikan lewat Foto saya." : g.message);
    } finally {
      setSibukBagi(false);
    }
  }

  /** (27 Okt 2026) Lanjut ke kamera dengan nomor pilihan petugas. Nomor terisi = mode ambil ulang (foto lama jadi cadangan); nomor kosong = jepretan berikutnya masuk nomor itu. */
  function mulaiDenganNomor() {
    const n = pilihAwal ?? saran;
    mintaIzinGerak();
    if (n !== null && terisiSemuaNomor.has(n)) {
      setGanti(n);
      setNomorAwal(null);
    } else {
      setGanti(null);
      setNomorAwal(n);
    }
    setKameraMulai(true);
    setAwalSiap(true);
  }
  /** Cara lama: kamera dibuka tanpa nomor; nomor dipilih sesudah memotret (bawaan = nomor kosong berikutnya). */
  function lewatiPilihNomor() {
    mintaIzinGerak();
    setGanti(null);
    setNomorAwal(null);
    setKameraMulai(true);
    setAwalSiap(true);
  }

  if (!bacaSesi()) return <div className="p-4 text-sm">Sesi tidak ditemukan. Masuk dulu.</div>;

  // (27 Okt 2026) keterangan ringkas untuk kamera layar penuh: nomor yang akan dipotret (sama dengan tujuanAwal di potret())
  const nomorTarget = ganti ?? nomorAwal ?? saran;
  const ketNomor = (n: number) => `Foto ${n}${etiket[n - 1] ? ` · ${etiket[n - 1]}` : ""}`;
  const labelTarget = ganti !== null ? `Ambil ulang ${ketNomor(ganti)}` : nomorTarget !== null ? ketNomor(nomorTarget) : "Foto cadangan";
  const ketGps = !posisi
    ? galatGps ?? "Mencari lokasi…"
    : akurasiBuruk
      ? `Akurasi GPS ±${Math.round(posisi.akurasi)} m terlalu kasar. Foto belum bisa diambil.`
      : akurasiKasar && sisaTunggu > 0
        ? `Menunggu GPS lebih akurat… ${sisaTunggu} dtk`
        : akurasiKasar
          ? "Akurasi GPS kasar: foto akan diperiksa PML/admin."
          : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-6 landscape:max-w-xl" onPointerDown={mintaIzinGerak}>
      <div className="px-1">
        <div className="text-xs font-bold tracking-wide text-[#8A6200]">KAMERA SIGAP</div>
        <div className="text-base font-extrabold text-[#0F2A52]">{namaKegiatan}</div>
      </div>

      {antre > 0 && (
        <div role="status" className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs font-semibold text-[#5E4300]">
          {antre} foto menunggu terkirim dari HP ini (terkirim sendiri saat ada sinyal). <button type="button" onClick={() => void kirimAntrean(true)} className="underline">Kirim sekarang</button>
        </div>
      )}

      {rapi && rapi.cadangan > 0 && rapi.kosong.length > 0 && !(jepretan && !hasil) && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border-2 border-[#F2B632] bg-[#FFF4D6] px-3 py-2.5">
          <div className="text-[13px] font-extrabold text-[#5E4300]">Nomor foto hari ini belum lengkap</div>
          <p className="text-xs leading-relaxed text-[#5E4300]">
            {rapi.cadangan} foto cadangan Anda sudah terkirim tetapi belum menempati nomor, sementara nomor {rapi.kosong.join(", ")} masih kosong. Pasang fotonya ke nomor yang sesuai.
          </p>
          <Link href={rapi.href} className="flex min-h-[48px] items-center justify-center rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white">Tukar urutan foto</Link>
        </div>
      )}

      {!jepretan && pesan && (
        <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-xs font-semibold ${pesan.jenis === "ok" ? "bg-[#E3F6EC] text-[#0B6B3F]" : pesan.jenis === "info" ? "bg-[#FFF4D6] text-[#5E4300]" : "bg-[#FDE8E8] text-[#9B1C23]"}`}>
          {pesan.teks}
        </div>
      )}

      {!jepretan && ganti !== null && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border-2 border-[#B7791F] bg-[#FFF4D6] px-3 py-2.5">
          <div className="text-[13px] font-extrabold text-[#5E4300]">Mode ambil ulang foto: Foto {ganti} · {etiket[ganti - 1] ?? ""}</div>
          <p className="text-xs leading-relaxed text-[#5E4300]">Foto yang Anda potret berikutnya akan menggantikan <b>Foto {ganti}</b> saja. Foto lama tidak dihapus, hanya menjadi cadangan.</p>
          <button type="button" onClick={() => setGanti(null)} className="min-h-[40px] self-start rounded-full bg-white px-4 text-[12.5px] font-extrabold text-[#5E4300] shadow-sm">Batal ambil ulang</button>
        </div>
      )}

      {!jepretan && awalSiap && ganti === null && nomorAwal !== null && (
        <div role="status" className="flex items-center gap-3 rounded-xl border-2 border-[#0F2A52] bg-[#E8EEF8] px-3 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F2A52] text-sm font-extrabold text-white" aria-hidden="true">{nomorAwal}</span>
          <span className="min-w-0 flex-1 text-[12.5px] font-extrabold leading-tight text-[#0F2A52]">Memotret untuk Foto {nomorAwal}{etiket[nomorAwal - 1] ? ` · ${etiket[nomorAwal - 1]}` : ""}</span>
          <button type="button" onClick={() => { setPilihAwal(nomorAwal); setAwalSiap(false); }} className="min-h-[40px] shrink-0 rounded-full border-2 border-[#0F2A52] bg-white px-3 text-xs font-bold text-[#0F2A52]">Ubah nomor</button>
        </div>
      )}

      {!jepretan && awalSiap && (
        <div className="flex items-center gap-2 rounded-xl border border-[#C9D3E6] bg-white px-3 py-2" aria-label="Nomor foto hari ini">
          <div className="flex gap-1.5">
            {NOMOR(jumlahNomor).map((n) => {
              const penuh = terisiSemuaNomor.has(n);
              return (
                <span key={n} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${penuh ? "bg-[#1E8E4E] text-white" : n === saran ? "border-2 border-[#0F2A52] bg-white text-[#0F2A52]" : "bg-[#EEF2F7] text-[#5B6B84]"}`}>
                  {penuh ? "✓" : n}
                </span>
              );
            })}
          </div>
          <span className="min-w-0 flex-1 text-[11.5px] font-semibold leading-tight text-[#3C4C68]">
            {saran !== null ? `Berikutnya: Foto ${saran} · ${etiket[saran - 1] ?? ""}` : "Semua nomor hari ini sudah terisi"}
          </span>
        </div>
      )}

      {!jepretan && !awalSiap && (
        <section className="flex flex-col gap-2" aria-label="Pilih nomor foto sebelum memotret">
          <h2 className="text-sm font-bold text-[#0F2A52]">Foto ini untuk nomor berapa?</h2>
          <p className="text-xs leading-relaxed text-[#3C4C68]">
            {saran === null
              ? `Semua ${jumlahNomor} nomor hari ini sudah terisi. Ketuk sebuah nomor untuk mengambil ulang fotonya (foto lama tetap tersimpan sebagai foto cadangan), atau lanjut ke kamera untuk foto cadangan.`
              : `Tiap hari tugas ada ${jumlahNomor} foto dokumentasi dengan keperluan berbeda. Pilih dulu keperluan foto ini, baru kamera dibuka. Sudah dipilihkan Foto ${saran} sesuai urutan foto hari ini.`}
          </p>
          <div className="flex flex-col gap-2" role="group" aria-label="Nomor foto">
            {NOMOR(jumlahNomor).map((n) => {
              const aktifPilih = (pilihAwal ?? saran) === n;
              const terisi = terisiSemuaNomor.has(n);
              const dipesan = !terisi && ditahanServer.includes(n);
              const lokasi = (SLOT_BERLOKASI as readonly number[]).includes(n);
              const gaya = aktifPilih ? (terisi ? "border-[#B7791F] bg-[#FFF4D6]" : "border-[#0F2A52] bg-[#E8EEF8]") : terisi ? "border-[#E1E6EF] bg-[#F3F5F9]" : "border-[#C9D3E6] bg-white";
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={aktifPilih}
                  onClick={() => setPilihAwal(n)}
                  className={`flex min-h-[56px] items-center gap-3 rounded-xl border-2 px-3 text-left ${gaya}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${aktifPilih ? (terisi ? "bg-[#B7791F] text-white" : "bg-[#0F2A52] text-white") : terisi ? "bg-[#DDEFE5] text-[#1E8E4E]" : "bg-[#EEF2F7] text-[#0F2A52]"}`}>{terisi && !aktifPilih ? "✓" : n}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${terisi && !aktifPilih ? "text-[#7A879C]" : "text-[#0F2A52]"}`}>{etiket[n - 1] ?? `Foto ${n}`}</span>
                    {lokasi && !terisi && <span className="block text-[11px] text-[#5B6B84]">Diambil di wilayah tugas</span>}
                    {dipesan && <span className="block text-[11px] font-semibold text-[#8A6200]">Sudah dipesan foto yang menunggu diperiksa PML/admin</span>}
                    {terisi && !aktifPilih && <span className="block text-[11px] font-semibold text-[#1E8E4E]">Sudah terisi · ketuk bila ingin mengambil ulang</span>}
                    {terisi && aktifPilih && <span className="block text-[11px] font-semibold text-[#8A6200]">Foto {n} sudah terisi. Foto baru MENGGANTIKAN Foto {n} saja; foto lamanya tidak dihapus, hanya menjadi cadangan.</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={mulaiDenganNomor} className="min-h-[56px] rounded-2xl bg-[#0F2A52] px-3 text-base font-extrabold text-white">
            {(pilihAwal ?? saran) === null
              ? "Lanjut ke kamera (foto cadangan)"
              : terisiSemuaNomor.has((pilihAwal ?? saran) as number)
              ? `Ambil ulang Foto ${(pilihAwal ?? saran) as number}, buka kamera`
              : `Lanjut ke kamera untuk Foto ${(pilihAwal ?? saran) as number}`}
          </button>
          <button type="button" onClick={lewatiPilihNomor} className="min-h-[44px] rounded-xl text-sm font-semibold text-[#3C4C68]">Lewati, pilih nomor sesudah memotret</button>
          {galatGps && posisi === null && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galatGps}</div>}
        </section>
      )}

      {!jepretan && awalSiap && (
        <>
          {landPenuh ? (
            createPortal(
              <div className="fixed inset-0 z-[10000] bg-black" data-kamera-landscape="1">
                {/* Bingkai kamera apa adanya (tegak terhadap layar = benar secara fisik); bentuk 9:16 sama dengan foto yang dipotret (diputar jadi 16:9) */}
                <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-contain ${hadap === "user" ? "-scale-x-100" : ""}`} aria-label="Pratinjau kamera" />
                {/* Panggung kontrol diputar searah HP supaya tulisan dan tombol terbaca tegak oleh pengguna */}
                <div
                  className="pointer-events-none absolute left-0 top-0"
                  style={{ width: "100dvh", height: "100vw", transformOrigin: "top left", transform: putar === 1 ? "rotate(90deg) translateY(-100%)" : "rotate(-90deg) translateX(-100%)" }}
                >
                  <div className={`pointer-events-auto absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${akurasiOk ? "bg-[#1E8E4E] text-white" : "bg-[#B7791F] text-white"}`} role="status">
                    {posisi ? `GPS ±${Math.round(posisi.akurasi)} m${akurasiOk ? "" : " (kasar)"}` : galatGps ?? "Mencari lokasi…"}
                  </div>
                  {banyakKamera !== false && (
                    <button
                      type="button"
                      onClick={() => setHadap((h) => (h === "environment" ? "user" : "environment"))}
                      aria-label={hadap === "environment" ? "Ganti ke kamera depan" : "Ganti ke kamera belakang"}
                      className="pointer-events-auto absolute left-3 top-14 flex min-h-[40px] items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-bold text-white active:bg-black/75"
                    >
                      {hadap === "environment" ? "Kamera depan" : "Kamera belakang"}
                    </button>
                  )}
                  {diag && <div className="pointer-events-none absolute bottom-2 left-3 right-24 text-[10px] leading-snug text-white/70">{diag}</div>}
                  <button
                    type="button"
                    onClick={() => void potret()}
                    disabled={!siapPotret}
                    aria-label="Potret"
                    className="pointer-events-auto absolute right-5 top-1/2 flex h-[72px] w-[72px] -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-white/25 disabled:opacity-40"
                  >
                    <span className="h-[52px] w-[52px] rounded-full bg-white" />
                  </button>
                </div>
              </div>,
              document.body
            )
          ) : tegakPenuh ? (
            createPortal(
              <div className="fixed inset-0 z-[10000] flex touch-none select-none flex-col overscroll-contain bg-black text-white" data-kamera-tegak="1">
                {/* Seluruh bingkai yang akan dipotret terlihat (object-contain); foto selalu diambil dari bingkai penuh, bukan dari potongan di layar */}
                <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-contain ${hadap === "user" ? "-scale-x-100" : ""}`} aria-label="Pratinjau kamera" />
                <div className="relative z-10 flex items-start gap-2 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-3 pb-8" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
                  <button type="button" onClick={() => setPenuhTutup(true)} aria-label="Tutup layar penuh kamera" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 text-[20px] font-bold leading-none active:bg-black/75">
                    ✕
                  </button>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className={`inline-block max-w-full truncate rounded-full px-3 py-1 text-[13px] font-extrabold ${ganti !== null ? "bg-[#B7791F]" : "bg-[#0F2A52]/90"}`}>{labelTarget}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${akurasiOk ? "bg-[#1E8E4E]" : "bg-[#B7791F]"}`} role="status">
                        {posisi ? `GPS ±${Math.round(posisi.akurasi)} m${akurasiOk ? "" : " (kasar)"}` : galatGps ?? "Mencari lokasi…"}
                      </span>
                      {antre > 0 && <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[11.5px] font-semibold">{antre} foto menunggu terkirim</span>}
                    </div>
                  </div>
                  {banyakKamera !== false && (
                    <button
                      type="button"
                      onClick={() => setHadap((h) => (h === "environment" ? "user" : "environment"))}
                      aria-label={hadap === "environment" ? "Ganti ke kamera depan" : "Ganti ke kamera belakang"}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 active:bg-black/75"
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
                        <path d="M3 21v-5h5" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex-1" />
                {pesan && (
                  <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`relative z-10 mx-3 mb-2 rounded-lg px-3 py-2 text-xs font-semibold ${pesan.jenis === "ok" ? "bg-[#E3F6EC] text-[#0B6B3F]" : pesan.jenis === "info" ? "bg-[#FFF4D6] text-[#5E4300]" : "bg-[#FDE8E8] text-[#9B1C23]"}`}>
                    {pesan.teks}
                  </div>
                )}
                <div className="relative z-10 flex flex-col items-center gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pt-10" style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
                  <div className="flex items-center gap-1.5" aria-label="Nomor foto hari ini">
                    {NOMOR(jumlahNomor).map((n) => {
                      const penuh = terisiSemuaNomor.has(n);
                      const tujuan = n === nomorTarget;
                      return (
                        <span key={n} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${tujuan ? "border-2 border-white bg-white text-[#0F2A52]" : penuh ? "bg-[#1E8E4E] text-white" : "bg-white/25 text-white"}`}>
                          {penuh && !tujuan ? "✓" : n}
                        </span>
                      );
                    })}
                  </div>
                  {ketGps && (
                    <p className="text-center text-[12px] font-semibold leading-snug text-white/90">
                      {ketGps}
                      {posisi && !akurasiOk && (
                        <>
                          {" "}
                          <button type="button" onClick={() => setPenuhTutup(true)} className="underline">
                            Cara memperbaiki
                          </button>
                        </>
                      )}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void potret()}
                    disabled={!siapPotret || !!galatKamera}
                    aria-label="Potret"
                    className="flex h-[78px] w-[78px] items-center justify-center rounded-full border-4 border-white bg-white/25 active:scale-95 disabled:opacity-40"
                  >
                    <span className="h-[58px] w-[58px] rounded-full bg-white" />
                  </button>
                </div>
              </div>,
              document.body
            )
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-black">
              {galatKamera ? (
                <div role="alert" className="p-6 text-sm text-white">{galatKamera}</div>
              ) : (
                <video ref={videoRef} playsInline muted className={`aspect-[3/4] w-full object-cover landscape:aspect-video ${hadap === "user" ? "-scale-x-100" : ""}`} aria-label="Pratinjau kamera" />
              )}
              {banyakKamera !== false && (
                <button
                  type="button"
                  onClick={() => setHadap((h) => (h === "environment" ? "user" : "environment"))}
                  aria-label={hadap === "environment" ? "Ganti ke kamera depan" : "Ganti ke kamera belakang"}
                  className="absolute right-2 top-2 flex min-h-[40px] items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-bold text-white active:bg-black/75"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  {hadap === "environment" ? "Kamera depan" : "Kamera belakang"}
                </button>
              )}
              <div className={`absolute left-2 top-2 rounded-full px-3 py-1 text-xs font-bold ${akurasiOk ? "bg-[#1E8E4E] text-white" : "bg-[#B7791F] text-white"}`} role="status">
                {posisi ? `GPS ±${Math.round(posisi.akurasi)} m${akurasiOk ? "" : " (kasar)"}` : galatGps ?? "Mencari lokasi…"}
              </div>
              {!galatKamera && !landPenuh && (
                <button type="button" onClick={() => setPenuhTutup(false)} className="absolute bottom-2 right-2 flex min-h-[40px] items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-bold text-white active:bg-black/80">
                  Layar penuh
                </button>
              )}
            </div>
          )}
          {galatGps && posisi === null && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galatGps}</div>}
          {posisi && !akurasiOk && (
            <div role="status" className="rounded-lg bg-[#FFF4D6] px-3 py-2.5 text-xs leading-relaxed text-[#5E4300]">
              <b>Akurasi GPS ±{Math.round(posisi.akurasi)} m{akurasiBuruk ? " — terlalu kasar" : ""}.</b> Agar lebih akurat:
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Pindah ke tempat terbuka (bukan di bawah atap atau di dalam bangunan), lalu tunggu beberapa saat.</li>
                <li>Aktifkan <b>lokasi tepat</b>: Pengaturan → Aplikasi → SIGAP (atau Chrome) → Izin → Lokasi → Gunakan lokasi tepat.</li>
                <li>Aktifkan <b>Akurasi Lokasi Google</b>: Pengaturan → Lokasi → Layanan lokasi.</li>
              </ol>
              {akurasiBuruk ? (
                <p className="mt-1.5 font-semibold">Foto belum bisa diambil sampai akurasi lebih baik dari 5.000 m.</p>
              ) : (
                <p className="mt-1.5 font-semibold">Bila akurasi tetap kasar, foto tetap bisa diambil setelah {TUNGGU_AKURASI_KASAR_DTK} detik dan akan ditandai untuk diperiksa PML/admin.</p>
              )}
            </div>
          )}
          <button type="button" onClick={() => void potret()} disabled={!siapPotret || !!galatKamera} className="min-h-[56px] rounded-2xl bg-[#0F2A52] text-base font-extrabold text-white disabled:opacity-40">
            {akurasiKasar && sisaTunggu > 0 ? `Menunggu GPS lebih akurat… ${sisaTunggu} dtk` : akurasiKasar ? "Potret (akurasi kasar, akan diperiksa)" : "Potret"}
          </button>
          <p className="px-1 text-xs leading-relaxed text-[#3C4C68]">Waktu dan lokasi diambil otomatis dari sistem dan dicetak di foto bersama logo SIGAP, kode, dan QR. Tidak bisa diketik atau dipilih dari galeri.</p>
          {diag && <p className="px-1 text-[10px] leading-snug text-[#8592A8]">{diag}</p>}
        </>
      )}

      {jepretan && (
        <>
          <PratinjauCap url={jepretan.url} waktuMs={jepretan.waktuHp} pos={jepretan.pos} nama={namaSaya} peran={peran.toUpperCase()} kegiatan={namaKegiatan} />
          {popupKirim && (
            <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-6" role="presentation" onClick={() => setPopupKirim(null)}>
              <div role="status" aria-live="polite" className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E3F6EC] text-3xl font-extrabold text-[#1E8E4E]" aria-hidden="true">✓</div>
                <h2 className="mt-3 text-base font-extrabold text-[#0F2A52]">{popupKirim.judul}</h2>
                {popupKirim.sub && <p className="mt-1 text-sm leading-snug text-[#3C4C68]">{popupKirim.sub}</p>}
                <button type="button" onClick={() => setPopupKirim(null)} className="mt-4 min-h-[44px] w-full rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white">OK</button>
              </div>
            </div>
          )}
          {!hasil && !arahOk && (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-[#0F2A52] bg-[#F4F7FC] p-3" role="group" aria-label="Langkah 1: periksa arah foto">
              <div className="text-sm font-extrabold text-[#0F2A52]">Langkah 1 · Periksa arah foto</div>
              <p className="text-xs leading-relaxed text-[#3C4C68]">Orang, bangunan, dan tulisan di foto harus tegak. Bila foto terbalik atau miring, ketuk Putar sampai tegak. Cap resmi dicetak sesudah Kirim dan mengikuti arah akhir foto ini.</p>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Putar foto">
                <button type="button" onClick={() => void putarFoto(3)} disabled={mengirim} className="min-h-[48px] rounded-xl border-2 border-[#C9D3E6] bg-white text-sm font-bold text-[#0F2A52] disabled:opacity-50">↺ Putar kiri</button>
                <button type="button" onClick={() => void putarFoto(2)} disabled={mengirim} className="min-h-[48px] rounded-xl border-2 border-[#C9D3E6] bg-white text-sm font-bold text-[#0F2A52] disabled:opacity-50">Putar 180°</button>
                <button type="button" onClick={() => void putarFoto(1)} disabled={mengirim} className="min-h-[48px] rounded-xl border-2 border-[#C9D3E6] bg-white text-sm font-bold text-[#0F2A52] disabled:opacity-50">Putar kanan ↻</button>
              </div>
              <button
                type="button"
                onClick={() => { setArahOk(true); void kirim(); }}
                disabled={mengirim}
                className="min-h-[52px] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-50"
              >
                {mengirim ? teksProgresKirim(progres) : "Arah sudah benar, kirim"}
              </button>
              {hitung !== null && !mengirim && (
                <div role="status" className="flex items-center gap-3 rounded-xl bg-[#E8EEF8] px-3 py-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#0F2A52] text-sm font-extrabold text-white" aria-hidden="true">{hitung}</span>
                  <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-[#0F2A52]">Bila tidak ada tindakan, terkirim otomatis sebagai Foto {nomor} dalam {hitung} detik. Foto sudah aman tersimpan di HP.</span>
                  <button type="button" onClick={() => setHitung(null)} className="min-h-[40px] flex-none rounded-lg border-2 border-[#0F2A52] px-3 text-xs font-bold text-[#0F2A52]">Tunda</button>
                </div>
              )}
              <button type="button" onClick={ulang} disabled={mengirim} className="min-h-[44px] rounded-xl text-sm font-semibold text-[#3C4C68] disabled:opacity-50">Buang &amp; ulangi</button>
              <p className="px-1 text-[11.5px] leading-snug text-[#3C4C68]">Foto sudah tersimpan di HP ini. Bila layar ini ditinggalkan sebelum Kirim, foto tetap terkirim otomatis dengan arah seperti yang tampak sekarang.</p>
            </div>
          )}
          {!hasil && arahOk && (
            <button type="button" onClick={() => { setHitung(null); setArahOk(false); }} disabled={mengirim} className="min-h-[44px] rounded-xl border-2 border-[#C9D3E6] bg-white text-sm font-bold text-[#0F2A52] disabled:opacity-50">
              Periksa arah foto lagi (putar)
            </button>
          )}
          {arahOk && !hasil && (
            <>
          <p className="px-1 text-xs leading-relaxed text-[#3C4C68]">Ini draft tampilan cap. Cap resmi dicetak server saat Kirim: jam resmi mengikuti server, lalu ditambah nama lokasi, kode, dan QR.</p>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-bold text-[#0F2A52]">Foto ini untuk nomor berapa?</legend>
            <p className="text-xs leading-relaxed text-[#3C4C68]">
              {ganti !== null && nomor === ganti
                ? `Mode ambil ulang foto: foto ini akan menggantikan Foto ${ganti} saja. Periksa pratinjau, lalu tekan Kirim. Foto lama tidak dihapus, hanya menjadi cadangan.`
                : nomorOtomatis && nomor !== null && nomorAwal === nomor
                ? `Sesuai pilihan Anda sebelum memotret: Foto ${nomor}. Ketuk nomor lain bila foto ini untuk keperluan yang berbeda.`
                : nomorOtomatis && nomor !== null
                ? `Sudah dipilihkan Foto ${nomor} sesuai urutan foto hari ini. Ketuk nomor lain bila foto ini untuk keperluan yang berbeda.`
                : saran === null
                ? `Semua ${jumlahNomor} nomor hari ini sudah terisi. Foto ini akan disimpan sebagai cadangan; atau ketuk sebuah nomor untuk mengambil ulang fotonya (foto lama tetap tersimpan sebagai foto cadangan).`
                : `Tiap hari tugas ada ${jumlahNomor} foto dokumentasi dengan keperluan berbeda. Pilih keperluan foto ini.`}
            </p>
            <div className="flex flex-col gap-2" role="group" aria-label="Nomor foto">
              {NOMOR(jumlahNomor).map((n) => {
                const pilih = nomor === n;
                const lokasi = (SLOT_BERLOKASI as readonly number[]).includes(n);
                // (21 Okt 2026) Nomor yang sudah berisi foto "padam" (abu-abu + centang) supaya petugas langsung melihat mana yang masih perlu.
                // Tetap bisa diketuk untuk MENGGANTI (foto lama jadi cadangan); ketuk lagi = batal ganti.
                const terisi = terisiSemuaNomor.has(n);
                const dipesan = !terisi && ditahanServer.includes(n);
                const gaya = pilih
                  ? terisi ? "border-[#B7791F] bg-[#FFF4D6]" : "border-[#0F2A52] bg-[#E8EEF8]"
                  : terisi ? "border-[#E1E6EF] bg-[#F3F5F9]" : "border-[#C9D3E6] bg-white";
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={pilih}
                    disabled={mengirim}
                    aria-label={terisi ? `Nomor ${n} sudah terisi. ${pilih ? "Foto ini akan menggantikannya; ketuk lagi untuk membatalkan." : "Ketuk untuk mengambil ulang foto."}` : undefined}
                    onClick={() => {
                      setHitung(null); // petugas mengatur sendiri: hentikan kirim otomatis
                      setNomorOtomatis(false);
                      if (terisi && !pilih) {
                        setKonfirmasiGanti(n); // nomor sudah berisi foto: minta konfirmasi dulu
                        return;
                      }
                      setNomor(pilih ? null : n);
                    }}
                    className={`flex min-h-[52px] items-center gap-3 rounded-xl border-2 px-3 text-left ${gaya}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${pilih ? (terisi ? "bg-[#B7791F] text-white" : "bg-[#0F2A52] text-white") : terisi ? "bg-[#DDEFE5] text-[#1E8E4E]" : "bg-[#EEF2F7] text-[#0F2A52]"}`}>{terisi && !pilih ? "✓" : n}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-bold ${terisi && !pilih ? "text-[#7A879C]" : "text-[#0F2A52]"}`}>{etiket[n - 1] ?? `Foto ${n}`}</span>
                      {lokasi && !terisi && <span className="block text-[11px] text-[#5B6B84]">Diambil di wilayah tugas</span>}
                      {dipesan && <span className="block text-[11px] font-semibold text-[#8A6200]">Sudah dipesan foto yang menunggu diperiksa PML/admin</span>}
                      {terisi && !pilih && <span className="block text-[11px] font-semibold text-[#1E8E4E]">Sudah terisi · ketuk bila ingin mengambil ulang</span>}
                      {terisi && pilih && <span className="block text-[11px] font-semibold text-[#8A6200]">Foto {n} sudah terisi. Bila dikirim, foto ini MENGGANTIKAN Foto {n} saja; foto lamanya tidak dihapus, hanya menjadi cadangan · ketuk lagi untuk batal</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {konfirmasiGanti !== null && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="presentation" onClick={() => setKonfirmasiGanti(null)}>
              <div role="alertdialog" aria-modal="true" aria-labelledby="judul-ganti" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h2 id="judul-ganti" className="text-base font-extrabold text-[#0F2A52]">Yakin mengambil ulang Foto {konfirmasiGanti}?</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#3C4C68]">
                  Nomor {konfirmasiGanti} ({etiket[konfirmasiGanti - 1] ?? `Foto ${konfirmasiGanti}`}) sudah berisi foto. Bila diambil ulang, foto yang lama tidak dihapus: ia menjadi foto cadangan dan bisa dipasang kembali lewat kartu hari.
                </p>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setKonfirmasiGanti(null)} className="min-h-[48px] flex-1 rounded-xl border-2 border-[#C9D3E6] text-sm font-bold text-[#0F2A52]">Batal</button>
                  <button
                    type="button"
                    onClick={() => {
                      setNomor(konfirmasiGanti);
                      setKonfirmasiGanti(null);
                    }}
                    className="min-h-[48px] flex-[1.4] rounded-xl bg-[#B7791F] text-sm font-extrabold text-white"
                  >
                    Ya, ambil ulang Foto {konfirmasiGanti}
                  </button>
                </div>
              </div>
            </div>
          )}

          {konfirmasiTanpaNomor && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="presentation" onClick={() => setKonfirmasiTanpaNomor(false)}>
              <div role="alertdialog" aria-modal="true" aria-labelledby="judul-tanpa-nomor" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h2 id="judul-tanpa-nomor" className="text-base font-extrabold text-[#0F2A52]">Foto ini belum masuk nomor Anda</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#3C4C68]">
                  Foto hanya dibagikan ke {tag.length} rekan. Nomor Anda sendiri (mis. Foto {saran}{saran !== null && etiket[saran - 1] ? ` · ${etiket[saran - 1]}` : ""}) masih kosong dan tidak terisi oleh foto ini, sehingga belum tampil di lampiran dokumentasi Anda.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#3C4C68]">Bila foto ini juga bukti kegiatan Anda, pilih nomor sendiri. Bila hanya untuk rekan, kirim saja; Anda masih bisa menempatkannya nanti lewat Foto saya &gt; Menunggu.</p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setKonfirmasiTanpaNomor(false);
                      setNomor(saran);
                      setNomorOtomatis(true);
                    }}
                    className="min-h-[48px] rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white"
                  >
                    Pakai Foto {saran} untuk saya juga
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setKonfirmasiTanpaNomor(false);
                      void kirim();
                    }}
                    className="min-h-[48px] rounded-xl border-2 border-[#C9D3E6] text-sm font-bold text-[#0F2A52]"
                  >
                    Kirim ke rekan saja
                  </button>
                  <button type="button" onClick={() => setKonfirmasiTanpaNomor(false)} className="min-h-[44px] rounded-xl text-sm font-semibold text-[#3C4C68]">Kembali</button>
                </div>
              </div>
            </div>
          )}

          <button type="button" onClick={() => { setHitung(null); setBagikan((b) => !b); }} aria-expanded={bagikan} className="min-h-[48px] rounded-xl border-2 border-[#0F2A52] text-sm font-bold text-[#0F2A52]">
            {bagikan ? "Sembunyikan pilihan rekan" : tag.length ? `Bagikan ke rekan (${tag.length})` : "Bagikan ke rekan"}
          </button>
          {bagikan && <BagikanFoto kegiatanId={kegiatanId} jumlahNomor={jumlahNomor} nilai={tag} onUbah={setTag} />}

          {pesan && (
            <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${pesan.jenis === "ok" ? "bg-[#E3F6EC] text-[#0B6B3F]" : pesan.jenis === "info" ? "bg-[#FFF4D6] text-[#5E4300]" : "bg-[#FDE8E8] text-[#9B1C23]"}`}>
              {pesan.teks}
            </div>
          )}

          {tanpaNomorSendiri && <p className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs font-semibold leading-snug text-[#5E4300]">Foto ini dibagikan ke rekan saja dan belum mengisi nomor Anda sendiri. Pilih nomor di atas bila foto ini juga untuk Anda.</p>}

          {!adaTujuan && <p className="px-1 text-xs font-semibold text-[#8A6200]">Pilih nomor foto di atas, atau pilih rekan lewat Bagikan ke rekan, lalu Kirim.</p>}

          {hitung !== null && !mengirim && (
            <div role="status" className="flex items-center gap-3 rounded-xl bg-[#E8EEF8] px-3 py-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#0F2A52] text-sm font-extrabold text-white" aria-hidden="true">{hitung}</span>
              <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-[#0F2A52]">Terkirim otomatis sebagai Foto {nomor} dalam {hitung} detik. Foto sudah aman tersimpan di HP.</span>
              <button type="button" onClick={() => setHitung(null)} className="min-h-[40px] flex-none rounded-lg border-2 border-[#0F2A52] px-3 text-xs font-bold text-[#0F2A52]">Ubah dulu</button>
            </div>
          )}
          {hitung === null && !mengirim && <p className="px-1 text-[11.5px] leading-snug text-[#3C4C68]">Foto sudah tersimpan di HP ini. Bila Kirim terlewat, foto tetap terkirim otomatis saat Anda keluar dari layar ini atau membuka aplikasi lagi.</p>}

            <div className="flex gap-2">
              <button type="button" onClick={ulang} disabled={mengirim} className="min-h-[52px] flex-1 rounded-2xl border-2 border-[#C9D3E6] text-sm font-bold text-[#0F2A52] disabled:opacity-50">Buang &amp; ulangi</button>
              <button type="button" onClick={() => (tanpaNomorSendiri ? setKonfirmasiTanpaNomor(true) : void kirim())} disabled={mengirim || !adaTujuan} className="min-h-[52px] flex-[2] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-50">
                {mengirim ? teksProgresKirim(progres) : nomor !== null ? `Kirim sebagai Foto ${nomor}` : tag.length === 0 && saran === null ? "Kirim sebagai cadangan" : "Kirim"}
              </button>
            </div>
            {mengirim && (
              <div role="progressbar" aria-label="Kemajuan unggah foto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progres ?? 0) * 100)} className="h-1.5 w-full overflow-hidden rounded-full bg-[#DCE4F2]">
                <div className={`h-full rounded-full bg-[#0F2A52] transition-[width] duration-200 ${progres !== null && progres >= 1 ? "animate-pulse" : ""}`} style={{ width: `${Math.round((progres ?? 0) * 100)}%` }} />
              </div>
            )}
            </>
          )}
          {hasil && (
            <div className="flex flex-col gap-3" role="group" aria-label="Foto sudah terkirim">
              <div className="flex flex-col gap-2 rounded-xl border border-[#C9D3E6] bg-white p-3">
                <div className="text-sm font-extrabold text-[#1E8E4E]">✓ {nomor !== null ? `Foto ${nomor}${etiket[nomor - 1] ? ` · ${etiket[nomor - 1]}` : ""} sudah terkirim` : "Foto sudah terkirim"}</div>
                <div className="text-sm font-bold text-[#0F2A52]">Kode {hasil.foto.kode}</div>
                <div className="text-xs text-[#3C4C68]">Tingkat kepercayaan: <b>{LABEL_KEPERCAYAAN[hasil.foto.kepercayaan]}</b></div>
                {labelFotoTanpaSinyal(hasil.foto.alasan, hasil.foto.diambil_at, hasil.foto.diterima_at) && <div className="text-xs font-semibold text-[#5E4300]">{labelFotoTanpaSinyal(hasil.foto.alasan, hasil.foto.diambil_at, hasil.foto.diterima_at)}</div>}
                {hasil.foto.alasan.length > 0 && <ul className="list-disc pl-5 text-xs text-[#3C4C68]">{hasil.foto.alasan.map((a) => <li key={a}>{LABEL_ALASAN[a] ?? a}</li>)}</ul>}
                {hasil.ditahan && <div className="text-xs font-semibold text-[#8A6200]">{hasil.penempatan?.status === "ditahan" && nomor !== null ? `Foto ini sudah ditandai untuk Foto ${nomor} (${etiket[nomor - 1] ?? ""}). Nomornya tercatat resmi setelah PML atau admin memeriksa.` : "Foto ditahan sampai PML atau admin memeriksa. Belum tercatat di nomor foto."}</div>}
                {hasil.penempatan && hasil.penempatan.ok === false && <div className="text-xs text-[#9B1C23]">Belum masuk nomor foto: {hasil.penempatan.error}</div>}
                <p className="text-[11.5px] leading-snug text-[#55657D]">Salah nomor? Buka kartu hari (atau menu perbaikan), lalu ketuk dua foto untuk menukar urutannya.</p>
              </div>

              <BagikanWa fotoId={hasil.foto.id} kode={hasil.foto.kode} diambil_at={hasil.foto.diambil_at ?? null} kegiatan={namaKegiatan} />

              {bagiN !== null ? (
                <>
                  <div role="status" className="rounded-xl bg-[#E3F6EC] px-3 py-2.5 text-sm font-semibold text-[#0B6B3F]">
                    {bagiN > 0 ? `Ajakan terkirim ke ${bagiN} rekan. Mereka memilih nomor fotonya sendiri.` : "Semua rekan yang dipilih sudah pernah diajak."}
                  </div>
                  <button type="button" onClick={ulang} className="min-h-[52px] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white">Foto lagi</button>
                </>
              ) : MAKS_TAG - tag.length <= 0 ? (
                <button type="button" onClick={ulang} className="min-h-[52px] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white">Foto lagi</button>
              ) : bagiLangkah === "tanya" ? (
                <div className="flex flex-col gap-2 rounded-xl border-2 border-[#0F2A52] bg-[#F4F7FC] p-3" role="group" aria-label="Bagikan foto ke rekan">
                  <div className="text-sm font-extrabold text-[#0F2A52]">Bagikan foto ini ke rekan?</div>
                  <p className="text-xs leading-relaxed text-[#3C4C68]">Foto tidak dikirim ulang. Rekan hanya menerima ajakan dan memilih sendiri nomor fotonya.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={ulang} className="min-h-[52px] rounded-2xl border-2 border-[#C9D3E6] bg-white text-sm font-extrabold text-[#0F2A52]">Tidak</button>
                    <button type="button" onClick={() => setBagiLangkah("pilih")} className="min-h-[52px] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white">Ya, pilih rekan</button>
                  </div>
                  <p className="px-1 text-[11.5px] leading-snug text-[#55657D]">Tidak = lanjut memotret. Anda masih bisa membagikannya nanti lewat Foto saya (sampai akhir hari sesudah tanggal foto).</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border-2 border-[#0F2A52] bg-[#F4F7FC] p-3">
                  <BagikanFoto kegiatanId={kegiatanId} jumlahNomor={jumlahNomor} nilai={tagBagi} onUbah={setTagBagi} kecuali={tag.map((t) => t.akun_id)} maks={Math.max(0, MAKS_TAG - tag.length)} />
                  {pesanBagi && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{pesanBagi}</div>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setBagiLangkah("tanya"); setTagBagi([]); setPesanBagi(null); }} disabled={sibukBagi} className="min-h-[52px] flex-1 rounded-2xl border-2 border-[#C9D3E6] bg-white text-sm font-bold text-[#0F2A52] disabled:opacity-50">Kembali</button>
                    <button type="button" onClick={() => void bagiKeRekan()} disabled={sibukBagi || tagBagi.length === 0} className="min-h-[52px] flex-[2] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-40">
                      {sibukBagi ? "Mengirim…" : tagBagi.length ? `Kirim ajakan ke ${tagBagi.length} orang` : "Pilih rekan dulu"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
