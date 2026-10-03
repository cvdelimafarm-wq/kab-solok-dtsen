"use client";

import { useEffect, useState, use as usePromise } from "react";

// ------------------------------------------------------------------------
// Halaman publik (tanpa login): "Konfirmasi Kesediaan Menginap" -- tawaran
// KHUSUS ke mitra yang rumahnya agak jauh dari klaster yang kekurangan
// petugas, dengan skema BERSEDIA MENGINAP di lokasi pendataan. Diakses
// lewat link unik PER KANDIDAT PER TAWARAN
// (/bencana/menginap/<token-kandidat>), dibuat admin lewat kartu "Tawaran
// Menginap" di tab Alokasi Petugas.
//
// Beda dgn /bencana/konfirmasi/[token] (1 wilayah kerja yg SUDAH diplot
// resmi ke 1 petugas) -- ini TAWARAN, bisa dikirim ke beberapa mitra
// sekaligus utk 1 kebutuhan, dan BELUM berarti kandidat ini akan diplot --
// admin yang menentukan sesudah melihat siapa yang bersedia.
// ------------------------------------------------------------------------

type MenginapInfo = {
  nama: string;
  kecamatan: string;
  nagari: string | null;
  keterangan: string;
  status: "bersedia" | "tidak_bersedia" | null;
  catatan: string | null;
  dijawab_pada: string | null;
};

export default function KonfirmasiMenginapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);

  const [info, setInfo] = useState<MenginapInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubahJawaban, setUbahJawaban] = useState(false);
  const [modeTolak, setModeTolak] = useState(false);
  const [alasanTolak, setAlasanTolak] = useState("");

  async function muat() {
    try {
      const res = await fetch(`/api/bencana/menginap/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json?.error ?? "Link tidak valid.");
      } else {
        setInfo(json.data);
      }
    } catch {
      setLoadError("Gagal memuat data. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function kirimJawaban(bersedia: boolean) {
    if (!bersedia && !alasanTolak.trim()) {
      setError("Mohon isi alasan tidak bersedia.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bencana/menginap/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bersedia ? { bersedia: true } : { bersedia: false, alasan: alasanTolak.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Gagal mengirim jawaban.");
      } else {
        setUbahJawaban(false);
        setModeTolak(false);
        await muat();
      }
    } catch {
      setError("Gagal mengirim jawaban. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
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
        <p className="rounded-md bg-rust-100 px-4 py-3 text-rust-700">{loadError ?? "Link tidak ditemukan."}</p>
      </main>
    );
  }

  const sudahJawab = info.status !== null;
  const tampilkanForm = !sudahJawab || ubahJawaban;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-10">
      <p className="text-sm font-medium text-orange-400">BPS Kabupaten Solok</p>
      <h1 className="mt-1 text-xl font-semibold text-orange-900">Tawaran Pendataan dengan Skema Menginap</h1>
      <p className="mt-3 text-sm text-ink/70">
        Halo <span className="font-semibold text-ink">{info.nama}</span>, wilayah pendataan bencana di{" "}
        <b>
          Kecamatan {info.kecamatan}
          {info.nagari ? `, Nagari ${info.nagari}` : ""}
        </b>{" "}
        saat ini masih kekurangan petugas yang rumahnya dekat. Kami menawarkan Anda untuk ikut mendata di sana dengan
        skema <b>MENGINAP di lokasi pendataan</b> selama masa tugas, karena jaraknya cukup jauh dari rumah Anda.
      </p>

      {sudahJawab && !ubahJawaban && (
        <div
          className={`mt-5 rounded-md border px-4 py-3 text-sm ${
            info.status === "bersedia"
              ? "border-moss-200 bg-moss-50 text-moss-700"
              : "border-rust-200 bg-rust-50 text-rust-700"
          }`}
        >
          {info.status === "bersedia" ? (
            <>✓ Anda sudah mengonfirmasi <b>BERSEDIA</b> menginap untuk tawaran ini.</>
          ) : (
            <>
              Anda sudah mengonfirmasi <b>TIDAK BERSEDIA</b> menginap untuk tawaran ini.
              {info.catatan && <> Alasan: &ldquo;{info.catatan}&rdquo;</>}
            </>
          )}
          <button
            type="button"
            onClick={() => setUbahJawaban(true)}
            className="mt-2 block text-xs font-medium text-ink/60 underline hover:text-ink/80"
          >
            Ubah jawaban
          </button>
        </div>
      )}

      <section className="mt-6 flex flex-col gap-4 text-sm">
        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">📍 Keterangan Kebutuhan</h2>
          <p className="mt-1.5 whitespace-pre-line text-ink/80">{info.keterangan}</p>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">🏕️ Yang Perlu Diketahui</h2>
          <p className="mt-1.5 text-ink/80">
            Tawaran ini BELUM berarti Anda pasti diplot ke wilayah tersebut -- ini hanya mengecek dulu siapa yang
            bersedia dengan skema menginap. Mitra lain mungkin juga ditawari untuk kebutuhan yang sama. Admin akan
            menghubungi Anda lebih lanjut soal detail jadwal, lokasi menginap, dan wilayah kerja pasti kalau Anda
            menyatakan bersedia.
          </p>
          <p className="mt-2 text-ink/80">
            Kalau Anda bersedia TAPI hanya mau kalau ditemani rekan lain (biar tidak sendirian), silakan sampaikan itu
            saat admin menghubungi Anda -- kami bisa coba carikan rekan yang juga ditawari skema ini.
          </p>
        </div>
      </section>

      {tampilkanForm && (
        <section className="mt-6 rounded-md border border-orange-200 bg-orange-50/40 p-4">
          <h2 className="text-sm font-semibold text-orange-900">Konfirmasi Kesediaan Menginap</h2>

          {!modeTolak ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => kirimJawaban(true)}
                className="flex-1 rounded-md bg-moss-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-700 disabled:opacity-50"
              >
                {busy ? "Mengirim..." : "✅ Saya Bersedia Menginap"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setModeTolak(true)}
                className="flex-1 rounded-md border border-rust-200 bg-white px-4 py-3 text-sm font-semibold text-rust-700 transition hover:bg-rust-50 disabled:opacity-50"
              >
                ❌ Saya Tidak Bersedia
              </button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-xs font-medium text-ink/70">Mohon isi alasan tidak bersedia:</p>
              <textarea
                value={alasanTolak}
                onChange={(e) => setAlasanTolak(e.target.value)}
                rows={3}
                placeholder="Alasan (wajib diisi)..."
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-rust-400"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => kirimJawaban(false)}
                  className="rounded-md bg-rust-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rust-700 disabled:opacity-50"
                >
                  {busy ? "Mengirim..." : "Kirim"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModeTolak(false)}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink/70 hover:bg-gray-50"
                >
                  Batal
                </button>
              </div>
            </>
          )}

          {error && <p className="mt-3 text-xs text-rust-700">{error}</p>}
        </section>
      )}

      <p className="mt-6 text-center text-[11px] text-ink/50">
        Ada pertanyaan? Hubungi Korwil/PML pembimbing Anda atau admin BPS Kabupaten Solok.
      </p>
    </main>
  );
}
