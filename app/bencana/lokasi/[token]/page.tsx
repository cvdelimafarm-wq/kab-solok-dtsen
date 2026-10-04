"use client";

import { useEffect, useState, use as usePromise } from "react";
import BrandBps from "@/app/components/BrandBps";

// ------------------------------------------------------------------------
// Halaman publik (tanpa login): "Tetapkan Lokasi Rumah Saya" utk petugas
// Alokasi Petugas Pasca Bencana. Diakses lewat link unik per petugas
// (/bencana/lokasi/<token>), dibagikan mis. lewat WA oleh Korwil/admin.
//
// Sekali ditekan, koordinat GPS asli (dari Geolocation API browser)
// disimpan ke bencana_petugas.lat/lng dgn lokasi_status='riil'. Ini dipakai
// utk menghitung skor jarak (1 poin per 5 KM) ke wilayah kerja yg
// dialokasikan -- lihat tab "Alokasi Petugas" di /bencana.
//
// TIDAK ada perkiraan titik-tengah-nagari (Tier 2): petugas yang belum
// menekan tombol ini akan berstatus lokasi "tanpa_data" (skor jarak = 0,
// tanpa penalti/bonus) sampai mereka menetapkan lokasi sendiri.
// ------------------------------------------------------------------------

type PetugasInfo = {
  nama: string;
  status_kepegawaian: string;
  aktif: boolean;
  lokasi_status: "riil" | "perkiraan_nagari" | "tanpa_data";
  lokasi_diperbarui_at: string | null;
};

export default function LokasiPetugasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);

  const [info, setInfo] = useState<PetugasInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bencana/lokasi/${token}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Link tidak valid.");
        } else {
          setInfo(json.data);
        }
      } catch {
        if (!cancelled) setLoadError("Gagal memuat data. Periksa koneksi internet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleTetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setStatus("Browser ini tidak mendukung deteksi lokasi GPS.");
      return;
    }
    setBusy(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/bencana/lokasi/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const json = await res.json();
          if (!res.ok) {
            setStatus(json?.error ?? "Gagal menyimpan lokasi.");
          } else {
            setDone(true);
            setStatus(null);
          }
        } catch {
          setStatus("Gagal menyimpan lokasi. Periksa koneksi internet, lalu coba lagi.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("Izin lokasi ditolak. Aktifkan izin lokasi utk browser ini, lalu coba lagi.");
        } else {
          setStatus("Gagal mendeteksi lokasi GPS. Pastikan GPS aktif, lalu coba lagi.");
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-ink/60">Memuat...</p>
      </main>
    );
  }

  if (loadError || !info) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
        <p className="rounded-md bg-rust-100 px-4 py-3 text-rust-700">
          {loadError ?? "Link tidak ditemukan."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
      <BrandBps className="justify-center text-sm font-medium text-orange-400" ukuran={40} />
      <h1 className="mt-1 text-xl font-semibold text-orange-900">Tetapkan Lokasi Rumah</h1>
      <p className="mt-3 text-sm text-ink/70">
        Halo <span className="font-semibold text-ink">{info.nama}</span>, mohon tekan tombol di bawah
        untuk membagikan lokasi rumah Anda saat ini. Lokasi ini dipakai untuk menghitung jarak ke
        wilayah tugas pendataan pasca bencana, supaya pembagian wilayah kerja antar petugas bisa lebih
        adil.
      </p>

      {done || info.lokasi_status === "riil" ? (
        <div className="mt-6 rounded-md border border-moss-200 bg-moss-50 px-4 py-3 text-sm text-moss-700">
          ✓ Lokasi rumah Anda sudah tercatat
          {info.lokasi_diperbarui_at && !done ? (
            <> (terakhir diperbarui {new Date(info.lokasi_diperbarui_at).toLocaleString("id-ID")})</>
          ) : null}
          . Anda boleh menekan tombol di bawah lagi kalau lokasi rumah berubah.
        </div>
      ) : (
        <p className="mt-6 rounded-md border border-rust-100 bg-rust-100/40 px-4 py-3 text-xs text-rust-700">
          Lokasi rumah Anda belum tercatat. Mohon tekan tombol di bawah.
        </p>
      )}

      <button
        type="button"
        onClick={handleTetapkanLokasi}
        disabled={busy}
        className="mt-6 rounded-md bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
      >
        {busy ? "Mendeteksi lokasi..." : "📍 Tetapkan Lokasi Rumah Saya"}
      </button>

      {status && <p className="mt-3 text-xs text-rust-700">{status}</p>}

      <p className="mt-6 text-[11px] text-ink/50">
        Pastikan GPS/lokasi perangkat Anda aktif dan browser diberi izin mengakses lokasi. Data lokasi
        hanya digunakan untuk keperluan pembagian wilayah kerja tim BPS Kabupaten Solok.
      </p>
    </main>
  );
}
