"use client";

// app/portal/PengaturanAwal.tsx
//
// (8 Okt 2026) "Siapkan SIGAP di HP": permintaan user -- setelah aplikasi terpasang, pengguna cukup MENCENTANG lalu mengetuk satu tombol,
// dan HP otomatis menanyakan izin Notifikasi dan Lokasi (GPS saat aplikasi dipakai). NOTIFIKASI WAJIB (permintaan user): selama belum aktif,
// modal ini tidak bisa ditutup. Lokasi tetap pilihan (boleh "Nanti saja" 24 jam). Hanya di aplikasi terpasang di HP, dipasang di Beranda portal
// dan Kerangka halaman pelatihan. Tidak memblokir bila notifikasi memang tidak bisa dipakai (kunci VAPID server belum diisi / browser tak mendukung).
// Izin yang sudah ditolak tidak bisa ditanyakan ulang oleh HP: ditunjukkan cara membukanya, dan status diperiksa ulang otomatis saat pengguna
// kembali ke aplikasi. Bila gagal karena masalah teknis (bukan penolakan), muncul "Lewati sementara" (sesi ini saja) agar tidak terkunci selamanya.
// Lokasi hanya DIMINTA izinnya di sini -- tidak dibaca, tidak dikirim, tidak dilacak; koordinat baru dibaca saat presensi.

import { useCallback, useEffect, useState } from "react";
import { modeAplikasi, perangkatSeluler } from "@/lib/sigapGerbangApp";
import { aktifkanPush, bacaStatusPush, type StatusPush } from "./pushKlien";

const KUNCI_NANTI = "sigap_awal_nanti";
const KUNCI_LOKASI_DITANYA = "sigap_lokasi_ditanya";
const KUNCI_LEWATI = "sigap_awal_lewati"; // sessionStorage: lewati sementara bila notifikasi gagal secara teknis
const NANTI_MS = 24 * 3_600_000;

type Izin = "perlu" | "aktif" | "diblokir" | "tidak_ada";

const nantiAktif = (): boolean => {
  try {
    const t = Number(localStorage.getItem(KUNCI_NANTI) ?? 0);
    return t > 0 && Date.now() - t < NANTI_MS;
  } catch {
    return false;
  }
};

async function bacaIzinLokasi(): Promise<Izin> {
  if (!("geolocation" in navigator)) return "tidak_ada";
  try {
    const s = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (s) return s.state === "granted" ? "aktif" : s.state === "denied" ? "diblokir" : "perlu";
  } catch {
    /* Permissions API tidak mendukung geolokasi di browser ini: pakai catatan lokal */
  }
  try {
    return localStorage.getItem(KUNCI_LOKASI_DITANYA) ? "aktif" : "perlu";
  } catch {
    return "perlu";
  }
}

/** Memicu pertanyaan izin lokasi bawaan HP. Hasil lokasinya dibuang. */
function mintaIzinLokasi(): Promise<"aktif" | "diblokir" | "gagal"> {
  return new Promise((selesai) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        try {
          localStorage.setItem(KUNCI_LOKASI_DITANYA, "1");
        } catch {
          /* abaikan */
        }
        selesai("aktif");
      },
      (e) => {
        try {
          localStorage.setItem(KUNCI_LOKASI_DITANYA, "1");
        } catch {
          /* abaikan */
        }
        selesai(e.code === 1 ? "diblokir" : "gagal");
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 }
    );
  });
}

function Centang({ nyala, terkunci, onUbah, id, judul, ket, label }: { nyala: boolean; terkunci: boolean; onUbah: () => void; id: string; judul: string; ket: string; label?: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 rounded-[14px] border p-3 ${nyala ? "border-[#BBD2F7] bg-[#F5F8FE]" : "border-[#DDE6F3] bg-white"} ${terkunci ? "opacity-90" : "cursor-pointer"}`}>
      <input id={id} type="checkbox" checked={nyala} disabled={terkunci} onChange={onUbah} className="mt-0.5 h-[22px] w-[22px] flex-none accent-[#1F5FD1]" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-extrabold text-[#0F2A52]">
          {judul}
          {label}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[#5B6B84]">{ket}</span>
      </span>
    </label>
  );
}

const lencana = (teks: string, warna: string) => <span className={`rounded-[9px] px-2 py-[3px] text-[11px] font-bold ${warna}`}>{teks}</span>;

export default function PengaturanAwal() {
  const [tampil, setTampil] = useState(false);
  const [notif, setNotif] = useState<Izin>("tidak_ada");
  const [lokasi, setLokasi] = useState<Izin>("tidak_ada");
  const [pilihLokasi, setPilihLokasi] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const [catatan, setCatatan] = useState<string | null>(null);
  const [teknis, setTeknis] = useState(false); // gagal karena masalah teknis (bukan ditolak): boleh dilewati sementara

  const periksa = useCallback(async () => {
    const ua = navigator.userAgent;
    if (!perangkatSeluler(ua, navigator.maxTouchPoints)) return;
    const terpasang = modeAplikasi({
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      fullscreenAtauMinimal: window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: minimal-ui)").matches,
      iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
      referrer: document.referrer,
    });
    if (!terpasang) return;
    try {
      if (sessionStorage.getItem(KUNCI_LEWATI) === "1") return;
    } catch {
      /* abaikan */
    }
    const [p, l] = await Promise.all([bacaStatusPush(), bacaIzinLokasi()]);
    const dariPush = (s: StatusPush): Izin => (s === "aktif" ? "aktif" : s === "belum_aktif" ? "perlu" : s === "diblokir" ? "diblokir" : "tidak_ada");
    const n = dariPush(p.status);
    setNotif(n);
    setLokasi(l);
    const notifWajib = n === "perlu" || n === "diblokir";
    const lokasiTawar = l === "perlu" && !nantiAktif();
    setTampil(notifWajib || lokasiTawar);
    if (!notifWajib) setSelesai(false);
  }, []);

  useEffect(() => {
    periksa();
    // kembali dari Pengaturan HP -> periksa lagi supaya modal hilang sendiri begitu izin sudah dibuka
    const balik = () => document.visibilityState === "visible" && periksa();
    document.addEventListener("visibilitychange", balik);
    window.addEventListener("focus", balik);
    return () => {
      document.removeEventListener("visibilitychange", balik);
      window.removeEventListener("focus", balik);
    };
  }, [periksa]);

  async function aktifkan() {
    setSibuk(true);
    setCatatan(null);
    setTeknis(false);
    const sisa: string[] = [];
    // Notifikasi dulu (butuh gerakan pengguna), lalu lokasi.
    if (notif === "perlu") {
      const r = await aktifkanPush();
      if (r.ok) setNotif("aktif");
      else {
        const s = await bacaStatusPush();
        if (s.status === "diblokir") setNotif("diblokir");
        else {
          setNotif("perlu");
          setTeknis(true);
        }
        sisa.push(r.pesan ?? "Notifikasi belum aktif.");
      }
    }
    if (pilihLokasi && lokasi === "perlu") {
      const h = await mintaIzinLokasi();
      if (h === "aktif") setLokasi("aktif");
      else if (h === "diblokir") {
        setLokasi("diblokir");
        sisa.push("Izin lokasi ditolak.");
      } else {
        setLokasi(await bacaIzinLokasi());
        sisa.push("Lokasi belum terbaca. Pastikan GPS/Lokasi HP menyala.");
      }
    }
    setSibuk(false);
    if (sisa.length === 0) {
      setSelesai(true);
      setTimeout(() => setTampil(false), 1600);
    } else setCatatan(sisa.join(" "));
  }

  async function periksaUlang() {
    setSibuk(true);
    setCatatan(null);
    await periksa();
    setSibuk(false);
  }

  function nanti() {
    try {
      localStorage.setItem(KUNCI_NANTI, String(Date.now()));
    } catch {
      /* abaikan */
    }
    setTampil(false);
  }

  function lewati() {
    try {
      sessionStorage.setItem(KUNCI_LEWATI, "1");
    } catch {
      /* abaikan */
    }
    setTampil(false);
  }

  if (!tampil) return null;

  const notifWajib = notif === "perlu" || notif === "diblokir";
  const stateLencana = (i: Izin) => (i === "aktif" ? lencana("Sudah aktif", "bg-[#E3F6EC] text-[#13794B]") : i === "diblokir" ? lencana("Diblokir", "bg-[#FDE8E8] text-[#B42329]") : null);
  const tombolUtama = "mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-[#1F5FD1] px-4 text-[15px] font-extrabold text-white transition hover:bg-[#1A4FB8] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="judul-awal" className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[22px] bg-white p-5 text-[#1B2B4B] shadow-2xl">
        <h2 id="judul-awal" className="text-[19px] font-extrabold leading-tight text-[#0F2A52]">
          {notifWajib ? "Aktifkan notifikasi untuk melanjutkan" : "Siapkan SIGAP di HP Anda"}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5B6B84]">
          {notifWajib ? (
            <>
              Notifikasi <b className="text-[#0F2A52]">wajib aktif</b> agar pengingat pelatihan, tes, dan presensi sampai ke HP Anda walau aplikasi ditutup. Ketuk <b>Aktifkan</b>, lalu pilih <b>Izinkan</b> saat HP bertanya. Cukup sekali.
            </>
          ) : (
            <>
              Centang yang Anda butuhkan, lalu ketuk <b>Aktifkan</b>. HP akan menanyakan izin; pilih <b>Izinkan</b>. Cukup sekali.
            </>
          )}
        </p>

        <div className="mt-3.5 space-y-2.5">
          {notif !== "tidak_ada" && (
            <Centang
              id="awal-notif"
              nyala
              terkunci
              onUbah={() => {}}
              judul="Notifikasi"
              ket="Pengingat jadwal pelatihan, tes, dan presensi, bahkan saat aplikasi ditutup."
              label={notif === "aktif" ? stateLencana(notif) : lencana("Wajib", "bg-[#FFF4D6] text-[#8A6200]")}
            />
          )}
          {lokasi !== "tidak_ada" && (
            <Centang
              id="awal-lokasi"
              nyala={lokasi === "aktif" || pilihLokasi}
              terkunci={lokasi !== "perlu" || sibuk}
              onUbah={() => setPilihLokasi((x) => !x)}
              judul="Lokasi (GPS)"
              ket="Hanya dipakai saat Anda presensi di lokasi pelatihan. Tidak dilacak di latar belakang."
              label={stateLencana(lokasi)}
            />
          )}
        </div>

        {lokasi === "perlu" && pilihLokasi && (
          <p className="mt-3 rounded-[12px] bg-[#F5F8FE] p-2.5 text-[12.5px] leading-relaxed text-[#5B6B84]">
            Saat HP menanyakan lokasi, pilih <b className="text-[#0F2A52]">Saat aplikasi digunakan</b> (atau <b className="text-[#0F2A52]">Izinkan</b>). Pastikan Lokasi/GPS HP menyala.
          </p>
        )}
        {(notif === "diblokir" || lokasi === "diblokir") && (
          <p className="mt-3 rounded-[12px] bg-[#FFF8E6] p-2.5 text-[12.5px] leading-relaxed text-[#6B4C00]">
            Izin yang sudah diblokir tidak bisa ditanyakan lagi oleh HP. Buka <b>Pengaturan HP → Aplikasi → SIGAP → Notifikasi</b> (dan <b>Izin → Lokasi</b>), ubah menjadi Izinkan, lalu kembali ke SIGAP. Halaman ini otomatis memeriksa ulang.
          </p>
        )}
        {catatan && (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold text-[#B42329]">
            {catatan}
          </p>
        )}
        {selesai && (
          <p role="status" className="mt-3 text-[13.5px] font-extrabold text-[#13794B]">
            Siap! SIGAP sudah diatur di HP Anda.
          </p>
        )}

        {notif === "diblokir" ? (
          <button type="button" onClick={periksaUlang} disabled={sibuk} className={tombolUtama}>
            {sibuk ? "Memeriksa…" : "Saya sudah mengizinkan, periksa lagi"}
          </button>
        ) : (
          <button type="button" onClick={aktifkan} disabled={sibuk || selesai || (notif !== "perlu" && !(pilihLokasi && lokasi === "perlu"))} className={tombolUtama}>
            {sibuk ? "Memproses…" : notif === "perlu" ? "Aktifkan" : "Aktifkan lokasi"}
          </button>
        )}

        {/* Notifikasi wajib: tidak ada "Nanti saja". Hanya bila lokasi satu-satunya yang tersisa, atau gagal teknis. */}
        {!notifWajib && (
          <button type="button" onClick={nanti} disabled={sibuk} className="mt-1.5 w-full py-2 text-[13px] font-semibold text-[#5B6B84] underline underline-offset-2 disabled:opacity-60">
            {selesai ? "Tutup" : "Nanti saja"}
          </button>
        )}
        {notifWajib && teknis && (
          <button type="button" onClick={lewati} disabled={sibuk} className="mt-1.5 w-full py-2 text-[12.5px] font-semibold text-[#5B6B84] underline underline-offset-2 disabled:opacity-60">
            Ada kendala teknis? Lewati sementara
          </button>
        )}
      </div>
    </div>
  );
}
