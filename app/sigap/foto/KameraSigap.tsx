"use client";

// app/sigap/foto/KameraSigap.tsx
//
// (19 Okt 2026) Kamera SIGAP dalam aplikasi. Tidak ada kolom ketik waktu/koordinat dan tidak ada pilihan dari galeri:
//  - waktu: token dari server saat kamera dibuka + jam monotonik HP (performance.now) sampai tombol potret ditekan;
//  - koordinat: GPS HP (enableHighAccuracy) -- akurasi > 100 m ditolak server;
//  - cap (logo, waktu, koordinat, nama, kegiatan, kode, QR) dicetak SERVER ke gambar.
// Tanpa sinyal: foto disimpan di IndexedDB dan terkirim otomatis saat ada sinyal.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BagikanFoto, { type TagPilihan } from "./BagikanFoto";
import { ambilJson, kirimMultipart, type GalatFoto } from "./klien";
import { daftarAntrean, formDariItem, lepasAntrean, perbaruiAntrean, tambahAntrean, type ItemAntrean } from "./antreanFoto";
import { bacaSesi, pemilikSesi } from "@/app/portal/sesi";
import { MAKS_AKURASI_M, LABEL_KEPERCAYAAN, LABEL_ALASAN, SLOT_BERLOKASI, teksKoordinat, teksWaktuWib, type Kepercayaan } from "@/lib/sigapFoto";
import { labelFoto } from "@/lib/sigapLabelFoto";
import { useTombolKembali } from "./useTombolKembali";

type Pos = { lat: number; lng: number; akurasi: number; mono: number };
type Hasil = { ok: true; sudah?: boolean; foto: { id: number; kode: string; kepercayaan: Kepercayaan; alasan: string[] }; penempatan: { ok?: boolean; status?: string; error?: string } | null; ditahan: boolean; jumlah_tag: number };
type Hadap = "environment" | "user";

const NOMOR = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

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
  onSelesai,
}: {
  kegiatanId: number;
  namaKegiatan: string;
  jumlahNomor: number;
  namaSaya?: string;
  peran?: string;
  jenis?: string | null;
  onSelesai?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const aliranRef = useRef<MediaStream | null>(null);
  const gpsRef = useRef<number | null>(null);
  const tokenRef = useRef<{ token: string; mono: number; wall: number } | null>(null);
  const [posisi, setPosisi] = useState<Pos | null>(null);
  const [galatKamera, setGalatKamera] = useState<string | null>(null);
  const [galatGps, setGalatGps] = useState<string | null>(null);
  const [jepretan, setJepretan] = useState<{ blob: Blob; url: string; pos: Pos; token: string | null; mono: number | null; wall: number | null; waktuHp: number; umurPosisi: number } | null>(null);
  const [nomor, setNomor] = useState<number | null>(null);
  const [tag, setTag] = useState<TagPilihan[]>([]);
  const [bagikan, setBagikan] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "info" | "galat"; teks: string } | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [antre, setAntre] = useState(0);
  const [hadap, setHadap] = useState<Hadap>("environment"); // kamera belakang dulu; tombol Putar kamera untuk depan
  const [banyakKamera, setBanyakKamera] = useState<boolean | null>(null); // null = belum diketahui (tombol tetap tampil)
  // (21 Okt 2026) Landscape otomatis ala kamera cap waktu: aplikasi tetap terkunci tegak, arah HP dibaca dari sensor gerak (gravitasi).
  // miring: 0 = HP tegak; 1 = HP diputar ke kiri (atas HP ke kiri); -1 = HP diputar ke kanan. Tidak bergantung pada putar otomatis (auto-rotate) di HP.
  const [miring, setMiring] = useState<0 | 1 | -1>(0);
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
    } catch {
      // tanpa sinyal: foto tetap bisa diambil; server menandainya "waktu belum terverifikasi" (kuning)
    }
  }, []);

  const hitungAntre = useCallback(async () => {
    try {
      const a = await daftarAntrean();
      const saya = pemilikSesi();
      setAntre(a.filter((x) => x.akun_id === saya).length);
    } catch {
      setAntre(0);
    }
  }, []);

  const kirimAntrean = useCallback(async () => {
    const saya = pemilikSesi();
    let a: ItemAntrean[] = [];
    try {
      a = (await daftarAntrean()).filter((x) => x.akun_id === saya);
    } catch {
      return;
    }
    for (const x of a) {
      try {
        const r = await kirimMultipart<Hasil>("/api/sigap/foto", formDariItem(x));
        if (r.simulasi) break;
        if (x.id !== undefined) await lepasAntrean(x.id);
      } catch (e) {
        const g = e as GalatFoto;
        if (g.status === undefined) break; // masih tanpa sinyal
        if (g.status === 409 || g.status === 403 || g.status === 422 || g.status === 400) {
          // ditolak permanen oleh server: simpan alasan agar terlihat, jangan diulang terus
          if (x.id !== undefined) await perbaruiAntrean({ ...x, galat_terakhir: g.message });
        }
      }
    }
    void hitungAntre();
  }, [hitungAntre]);

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
      const ax = Math.abs(sx);
      const ay = Math.abs(sy);
      if (ax > 6.5 && ax > ay + 2) setMiring(sx > 0 ? 1 : -1);
      else if (ay > 6.5 && ay > ax + 2) setMiring(0);
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
      setDiag(`v3 · sensor ${d.n ? `${d.sumber} (${d.n}) x=${d.x.toFixed(1)} y=${d.y.toFixed(1)}` : "tidak ada kabar"} · layar ${tipe} · bingkai ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0}`);
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
  }, [hadap]);

  // Setelah "Ulangi"/"Foto lagi" elemen video dibuat ulang: sambungkan lagi ke aliran kamera yang masih menyala
  // (juga saat tampilan landscape penuh layar dibuka/ditutup: elemen video berpindah tempat)
  const putar: 0 | 1 | -1 = layarLebar ? 0 : miring;
  const landPenuh = putar !== 0 && !galatKamera;
  useEffect(() => {
    const v = videoRef.current;
    if (!jepretan && v && aliranRef.current && v.srcObject !== aliranRef.current) {
      v.srcObject = aliranRef.current;
      void v.play().catch(() => undefined);
    }
  }, [jepretan, landPenuh]);

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
    void kirimAntrean();
    const timer = setInterval(() => void muatToken(), 20 * 60_000);
    const online = () => void kirimAntrean();
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      if (gpsRef.current !== null) navigator.geolocation.clearWatch(gpsRef.current);
    };
  }, [muatToken, hitungAntre, kirimAntrean]);

  useEffect(() => () => { if (jepretan) URL.revokeObjectURL(jepretan.url); }, [jepretan]);

  const akurasiOk = !!posisi && posisi.akurasi <= MAKS_AKURASI_M;
  const etiket = labelFoto(jenis);
  const adaTujuan = nomor !== null || tag.length > 0; // tanpa tombol "Hanya untuk rekan": foto minimal punya nomor sendiri atau dibagikan ke rekan

  async function potret() {
    const v = videoRef.current;
    if (!v || !posisi || !v.videoWidth) return;
    const mono = performance.now();
    const wall = Date.now();
    const kanvas = document.createElement("canvas");
    const ctx = kanvas.getContext("2d");
    // HP dipegang miring tetapi layar terkunci tegak: bingkai kamera tetap tegak, jadi diputar 90 derajat agar foto jadi landscape dan atasnya benar
    if (putar !== 0 && v.videoHeight > v.videoWidth) {
      kanvas.width = v.videoHeight;
      kanvas.height = v.videoWidth;
      if (putar === 1) {
        ctx?.translate(kanvas.width, 0);
        ctx?.rotate(Math.PI / 2);
      } else {
        ctx?.translate(0, kanvas.height);
        ctx?.rotate(-Math.PI / 2);
      }
    } else {
      kanvas.width = v.videoWidth;
      kanvas.height = v.videoHeight;
    }
    ctx?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => kanvas.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) return setPesan({ jenis: "galat", teks: "Gagal mengambil gambar. Coba lagi." });
    const t = tokenRef.current;
    const umurToken = t ? mono - t.mono : null;
    setJepretan({
      blob,
      url: URL.createObjectURL(blob),
      pos: { ...posisi, mono: posisi.mono },
      token: t && umurToken !== null && umurToken >= 0 ? t.token : null,
      mono: t && umurToken !== null ? umurToken : null,
      wall: t ? wall - t.wall : null,
      waktuHp: wall,
      umurPosisi: Math.max(0, mono - posisi.mono),
    });
    setPesan(null);
    setHasil(null);
    void muatToken(); // token baru untuk jepretan berikutnya (token lama sekali pakai)
  }

  function ulang() {
    if (jepretan) URL.revokeObjectURL(jepretan.url);
    setJepretan(null);
    setNomor(null);
    setTag([]);
    setBagikan(false);
    setPesan(null);
    setHasil(null);
  }

  // Back = kembali ke layar kamera (bukan keluar ke beranda) selama pratinjau/hasil foto terbuka
  useTombolKembali(!!jepretan, () => {
    if (mengirim) return false; // jangan batalkan pratinjau saat foto sedang dikirim
    ulang();
  });

  async function kirim() {
    if (!jepretan) return;
    const item: ItemAntrean = {
      akun_id: pemilikSesi(),
      dibuat_ms: Date.now(),
      blob: jepretan.blob,
      kegiatan_id: kegiatanId,
      token: jepretan.token,
      elapsed_mono_ms: jepretan.mono,
      elapsed_wall_ms: jepretan.wall,
      waktu_hp: jepretan.waktuHp,
      lat: jepretan.pos.lat,
      lng: jepretan.pos.lng,
      akurasi: jepretan.pos.akurasi,
      posisi_umur_ms: jepretan.umurPosisi,
      slot: nomor,
      tag: tag.map((t) => ({ akun_id: t.akun_id, slot_usulan: t.slot_usulan })),
    };
    setMengirim(true);
    setPesan(null);
    try {
      const r = await kirimMultipart<Hasil>("/api/sigap/foto", formDariItem(item));
      if (r.simulasi) {
        setPesan({ jenis: "info", teks: "Mode simulasi (masuk sebagai akun lain): foto TIDAK dikirim." });
      } else {
        setHasil(r.data);
        setPesan({ jenis: "ok", teks: r.data.sudah ? "Foto ini sudah tercatat sebelumnya." : "Foto terkirim." });
        onSelesai?.();
      }
    } catch (e) {
      const g = e as GalatFoto;
      if (g.message === "SESI_BERAKHIR") {
        setPesan({ jenis: "galat", teks: "Sesi berakhir. Masuk kembali; foto Anda belum dikirim." });
      } else if (g.status === undefined) {
        await tambahAntrean(item);
        void hitungAntre();
        setPesan({ jenis: "info", teks: "Tidak ada sinyal. Foto tersimpan di HP ini dan terkirim otomatis saat ada sinyal." });
        setJepretan(null);
      } else {
        setPesan({ jenis: "galat", teks: g.message });
      }
    } finally {
      setMengirim(false);
    }
  }

  if (!bacaSesi()) return <div className="p-4 text-sm">Sesi tidak ditemukan. Masuk dulu.</div>;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-6 landscape:max-w-xl" onPointerDown={mintaIzinGerak}>
      <div className="px-1">
        <div className="text-xs font-bold tracking-wide text-[#8A6200]">KAMERA SIGAP</div>
        <div className="text-base font-extrabold text-[#0F2A52]">{namaKegiatan}</div>
      </div>

      {antre > 0 && (
        <div role="status" className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs font-semibold text-[#5E4300]">
          {antre} foto menunggu terkirim. <button type="button" onClick={() => void kirimAntrean()} className="underline">Kirim sekarang</button>
        </div>
      )}

      {!jepretan && (
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
                    {posisi ? `GPS ±${Math.round(posisi.akurasi)} m${akurasiOk ? "" : " (terlalu kasar)"}` : galatGps ?? "Mencari lokasi…"}
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
                    disabled={!akurasiOk}
                    aria-label="Potret"
                    className="pointer-events-auto absolute right-5 top-1/2 flex h-[72px] w-[72px] -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-white/25 disabled:opacity-40"
                  >
                    <span className="h-[52px] w-[52px] rounded-full bg-white" />
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
                {posisi ? `GPS ±${Math.round(posisi.akurasi)} m${akurasiOk ? "" : " (terlalu kasar)"}` : galatGps ?? "Mencari lokasi…"}
              </div>
            </div>
          )}
          {galatGps && posisi === null && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galatGps}</div>}
          <button type="button" onClick={() => void potret()} disabled={!akurasiOk || !!galatKamera} className="min-h-[56px] rounded-2xl bg-[#0F2A52] text-base font-extrabold text-white disabled:opacity-40">
            Potret
          </button>
          <p className="px-1 text-xs leading-relaxed text-[#3C4C68]">Waktu dan lokasi diambil otomatis dari sistem dan dicetak di foto bersama logo SIGAP, kode, dan QR. Tidak bisa diketik atau dipilih dari galeri.</p>
          {diag && <p className="px-1 text-[10px] leading-snug text-[#8592A8]">{diag}</p>}
        </>
      )}

      {jepretan && (
        <>
          <PratinjauCap url={jepretan.url} waktuMs={jepretan.waktuHp} pos={jepretan.pos} nama={namaSaya} peran={peran.toUpperCase()} kegiatan={namaKegiatan} />
          <p className="px-1 text-xs leading-relaxed text-[#3C4C68]">Ini draft tampilan cap. Cap resmi dicetak server saat Kirim: jam resmi mengikuti server, lalu ditambah nama lokasi, kode, dan QR.</p>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-bold text-[#0F2A52]">Foto ini untuk nomor berapa?</legend>
            <p className="text-xs leading-relaxed text-[#3C4C68]">
              Tiap hari tugas ada {jumlahNomor} foto dokumentasi dengan keperluan berbeda. Pilih keperluan foto ini; satu nomor diisi satu foto per hari kerja.
            </p>
            <div className="flex flex-col gap-2" role="group" aria-label="Nomor foto">
              {NOMOR(jumlahNomor).map((n) => {
                const pilih = nomor === n;
                const lokasi = (SLOT_BERLOKASI as readonly number[]).includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={pilih}
                    onClick={() => setNomor(pilih ? null : n)}
                    className={`flex min-h-[52px] items-center gap-3 rounded-xl border-2 px-3 text-left ${pilih ? "border-[#0F2A52] bg-[#E8EEF8]" : "border-[#C9D3E6] bg-white"}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${pilih ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#0F2A52]"}`}>{n}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#0F2A52]">{etiket[n - 1] ?? `Foto ${n}`}</span>
                      {lokasi && <span className="block text-[11px] text-[#5B6B84]">Diambil di wilayah tugas</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[#3C4C68]">Setelah foto diterima sebagai nomor foto, nomor tidak bisa diubah sendiri. Pilih dengan teliti.</p>
          </fieldset>

          <button type="button" onClick={() => setBagikan((b) => !b)} aria-expanded={bagikan} className="min-h-[48px] rounded-xl border-2 border-[#0F2A52] text-sm font-bold text-[#0F2A52]">
            {bagikan ? "Sembunyikan pilihan rekan" : tag.length ? `Bagikan ke rekan (${tag.length})` : "Bagikan ke rekan"}
          </button>
          {bagikan && <BagikanFoto kegiatanId={kegiatanId} jumlahNomor={jumlahNomor} nilai={tag} onUbah={setTag} />}

          {pesan && (
            <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${pesan.jenis === "ok" ? "bg-[#E3F6EC] text-[#0B6B3F]" : pesan.jenis === "info" ? "bg-[#FFF4D6] text-[#5E4300]" : "bg-[#FDE8E8] text-[#9B1C23]"}`}>
              {pesan.teks}
            </div>
          )}

          {!hasil && !adaTujuan && <p className="px-1 text-xs font-semibold text-[#8A6200]">Pilih nomor foto di atas, atau pilih rekan lewat Bagikan ke rekan, lalu Kirim.</p>}

          {hasil ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#C9D3E6] bg-white p-3">
              <div className="text-sm font-bold text-[#0F2A52]">Kode {hasil.foto.kode}</div>
              <div className="text-xs text-[#3C4C68]">Tingkat kepercayaan: <b>{LABEL_KEPERCAYAAN[hasil.foto.kepercayaan]}</b></div>
              {hasil.foto.alasan.length > 0 && <ul className="list-disc pl-5 text-xs text-[#3C4C68]">{hasil.foto.alasan.map((a) => <li key={a}>{LABEL_ALASAN[a] ?? a}</li>)}</ul>}
              {hasil.ditahan && <div className="text-xs font-semibold text-[#8A6200]">Foto ditahan sampai PML atau admin memeriksa. Belum tercatat di nomor foto.</div>}
              {hasil.penempatan && hasil.penempatan.ok === false && <div className="text-xs text-[#9B1C23]">Belum masuk nomor foto: {hasil.penempatan.error}</div>}
              <button type="button" onClick={ulang} className="min-h-[48px] rounded-xl bg-[#0F2A52] text-sm font-bold text-white">Foto lagi</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={ulang} disabled={mengirim} className="min-h-[52px] flex-1 rounded-2xl border-2 border-[#C9D3E6] text-sm font-bold text-[#0F2A52] disabled:opacity-50">Ulangi foto</button>
              <button type="button" onClick={() => void kirim()} disabled={mengirim || !adaTujuan} className="min-h-[52px] flex-[2] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-50">
                {mengirim ? "Mengirim…" : "Kirim"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
