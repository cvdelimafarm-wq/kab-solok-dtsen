"use client";

// app/sigap/foto/KameraSigap.tsx
//
// (19 Okt 2026) Kamera SIGAP dalam aplikasi. Tidak ada kolom ketik waktu/koordinat dan tidak ada pilihan dari galeri:
//  - waktu: token dari server saat kamera dibuka + jam monotonik HP (performance.now) sampai tombol potret ditekan;
//  - koordinat: GPS HP (enableHighAccuracy) -- akurasi > 100 m ditolak server;
//  - cap (logo, waktu, koordinat, nama, kegiatan, kode, QR) dicetak SERVER ke gambar.
// Tanpa sinyal: foto disimpan di IndexedDB dan terkirim otomatis saat ada sinyal.

import { useCallback, useEffect, useRef, useState } from "react";
import BagikanFoto, { type TagPilihan } from "./BagikanFoto";
import { ambilJson, kirimMultipart, type GalatFoto } from "./klien";
import { daftarAntrean, formDariItem, lepasAntrean, perbaruiAntrean, tambahAntrean, type ItemAntrean } from "./antreanFoto";
import { bacaSesi, pemilikSesi } from "@/app/portal/sesi";
import { MAKS_AKURASI_M, LABEL_KEPERCAYAAN, LABEL_ALASAN, type Kepercayaan } from "@/lib/sigapFoto";

type Pos = { lat: number; lng: number; akurasi: number; mono: number };
type Hasil = { ok: true; sudah?: boolean; foto: { id: number; kode: string; kepercayaan: Kepercayaan; alasan: string[] }; penempatan: { ok?: boolean; status?: string; error?: string } | null; ditahan: boolean; jumlah_tag: number };

const NOMOR = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default function KameraSigap({ kegiatanId, namaKegiatan, jumlahNomor, onSelesai }: { kegiatanId: number; namaKegiatan: string; jumlahNomor: number; onSelesai?: () => void }) {
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

  // Kamera + GPS
  useEffect(() => {
    let hidup = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setGalatKamera("Peramban ini tidak mendukung kamera dalam aplikasi.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!hidup) return s.getTracks().forEach((t) => t.stop());
        aliranRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setGalatKamera(e instanceof Error && e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera pada pengaturan peramban, lalu buka lagi." : "Kamera tidak dapat dibuka.");
      }
    })();
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
      hidup = false;
      clearInterval(timer);
      window.removeEventListener("online", online);
      aliranRef.current?.getTracks().forEach((t) => t.stop());
      if (gpsRef.current !== null) navigator.geolocation.clearWatch(gpsRef.current);
    };
  }, [muatToken, hitungAntre, kirimAntrean]);

  useEffect(() => () => { if (jepretan) URL.revokeObjectURL(jepretan.url); }, [jepretan]);

  const akurasiOk = !!posisi && posisi.akurasi <= MAKS_AKURASI_M;

  async function potret() {
    const v = videoRef.current;
    if (!v || !posisi || !v.videoWidth) return;
    const mono = performance.now();
    const wall = Date.now();
    const kanvas = document.createElement("canvas");
    kanvas.width = v.videoWidth;
    kanvas.height = v.videoHeight;
    kanvas.getContext("2d")?.drawImage(v, 0, 0);
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
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-6">
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
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {galatKamera ? (
              <div role="alert" className="p-6 text-sm text-white">{galatKamera}</div>
            ) : (
              <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" aria-label="Pratinjau kamera" />
            )}
            <div className={`absolute left-2 top-2 rounded-full px-3 py-1 text-xs font-bold ${akurasiOk ? "bg-[#1E8E4E] text-white" : "bg-[#B7791F] text-white"}`} role="status">
              {posisi ? `GPS ±${Math.round(posisi.akurasi)} m${akurasiOk ? "" : " (terlalu kasar)"}` : galatGps ?? "Mencari lokasi…"}
            </div>
          </div>
          {galatGps && posisi === null && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galatGps}</div>}
          <button type="button" onClick={() => void potret()} disabled={!akurasiOk || !!galatKamera} className="min-h-[56px] rounded-2xl bg-[#0F2A52] text-base font-extrabold text-white disabled:opacity-40">
            Potret
          </button>
          <p className="px-1 text-xs leading-relaxed text-[#3C4C68]">Waktu dan lokasi diambil otomatis dari sistem dan dicetak di foto bersama logo SIGAP, kode, dan QR. Tidak bisa diketik atau dipilih dari galeri.</p>
        </>
      )}

      {jepretan && (
        <>
          <div className="overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={jepretan.url} alt="Hasil potret (cap dibubuhkan server saat dikirim)" className="max-h-[50vh] w-full object-contain" />
          </div>
          <p className="px-1 text-xs text-[#3C4C68]">Cap (logo, waktu, koordinat, kode, QR) dibubuhkan server setelah terkirim.</p>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-bold text-[#0F2A52]">Untuk nomor foto Anda</legend>
            <div className="flex flex-wrap gap-2">
              {NOMOR(jumlahNomor).map((n) => (
                <button key={n} type="button" aria-pressed={nomor === n} onClick={() => setNomor(nomor === n ? null : n)} className={`min-h-[48px] min-w-[48px] rounded-xl border-2 px-3 text-sm font-extrabold ${nomor === n ? "border-[#0F2A52] bg-[#0F2A52] text-white" : "border-[#C9D3E6] bg-white text-[#0F2A52]"}`}>
                  {n}
                </button>
              ))}
              <button type="button" aria-pressed={nomor === null} onClick={() => setNomor(null)} className={`min-h-[48px] rounded-xl border-2 px-3 text-sm font-bold ${nomor === null ? "border-[#0F2A52] bg-[#E8EEF8] text-[#0F2A52]" : "border-[#C9D3E6] bg-white text-[#3C4C68]"}`}>
                Hanya untuk rekan
              </button>
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
              <button type="button" onClick={ulang} disabled={mengirim} className="min-h-[52px] flex-1 rounded-2xl border-2 border-[#C9D3E6] text-sm font-bold text-[#0F2A52] disabled:opacity-50">Ulangi</button>
              <button type="button" onClick={() => void kirim()} disabled={mengirim} className="min-h-[52px] flex-[2] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-50">
                {mengirim ? "Mengirim…" : "Kirim"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
