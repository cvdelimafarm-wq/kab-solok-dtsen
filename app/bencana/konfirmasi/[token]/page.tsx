"use client";

import { useEffect, useState, use as usePromise } from "react";

// ------------------------------------------------------------------------
// Halaman publik (tanpa login): "Konfirmasi Kesediaan Ikut Pendataan
// Bencana" utk mitra/petugas yg SUDAH di-plot ke Sub SLS di tab "Alokasi
// Petugas" (Langkah 4). Diakses lewat link unik per petugas
// (/bencana/konfirmasi/<token>), dibagikan lewat tombol "📋 Salin Link
// Konfirmasi" pada kartu "Mitra Perlu Dihubungi" di admin.
//
// Isi halaman (permintaan user): salam + nama petugas, jadwal pelatihan
// (pilih 7/8 Okt 2026 di Mami Hotel Kota Solok), info kuesioner & instrumen
// (FASIH Mobile), target pendataan, perkiraan wilayah kerja (otomatis dari
// Sub SLS yg SUDAH diplot resmi ke petugas ini), jadwal pendataan
// (10-31 Okt 2026), lalu tombol Bersedia/Tidak Bersedia.
//
// Pola & gaya SAMA dgn /bencana/lokasi/[token] (halaman publik token lain
// yg sudah ada di proyek ini) -- supaya konsisten utk mitra yg mungkin
// membuka kedua link ini.
// ------------------------------------------------------------------------

type WilayahKerjaRow = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk_total: number;
  kk_terdampak_estimasi: number;
};

type KonfirmasiInfo = {
  nama: string;
  pendaftaran_bencana_konfirmasi: boolean;
  status_kontak_pendaftaran_bencana: "diterima" | "menolak" | null;
  catatan_penolakan_pendaftaran_bencana: string | null;
  jadwal_pelatihan_dipilih: string | null;
  wilayah_kerja: WilayahKerjaRow[];
};

const PILIHAN_JADWAL = ["7 Oktober 2026", "8 Oktober 2026"];

export default function KonfirmasiKesediaanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);

  const [info, setInfo] = useState<KonfirmasiInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubahJawaban, setUbahJawaban] = useState(false);

  const [jadwalPilihan, setJadwalPilihan] = useState<string>("");
  const [alasanTolak, setAlasanTolak] = useState("");
  const [modeTolak, setModeTolak] = useState(false);

  async function muat() {
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json?.error ?? "Link tidak valid.");
      } else {
        setInfo(json.data);
        setJadwalPilihan(json.data.jadwal_pelatihan_dipilih ?? "");
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
    if (bersedia && !jadwalPilihan) {
      setError("Mohon pilih jadwal pelatihan (7 atau 8 Oktober 2026) dulu.");
      return;
    }
    if (!bersedia && !alasanTolak.trim()) {
      setError("Mohon isi alasan tidak bersedia.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          bersedia ? { bersedia: true, jadwal_pelatihan: jadwalPilihan } : { bersedia: false, alasan: alasanTolak.trim() }
        ),
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

  const sudahJawab = info.status_kontak_pendaftaran_bencana !== null;
  const tampilkanForm = !sudahJawab || ubahJawaban;
  const totalKkTerdampak = info.wilayah_kerja.reduce((n, r) => n + r.kk_terdampak_estimasi, 0);

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-10">
      <p className="text-sm font-medium text-orange-400">BPS Kabupaten Solok</p>
      <h1 className="mt-1 text-xl font-semibold text-orange-900">Konfirmasi Kesediaan Ikut Pendataan Bencana</h1>
      <p className="mt-3 text-sm text-ink/70">
        Halo <span className="font-semibold text-ink">{info.nama}</span>, berikut tawaran untuk ikut serta sebagai
        petugas pendataan pasca bencana hidrometeorologi. Mohon baca informasinya, lalu konfirmasi kesediaan Anda di
        bagian bawah.
      </p>

      {sudahJawab && !ubahJawaban && (
        <div
          className={`mt-5 rounded-md border px-4 py-3 text-sm ${
            info.status_kontak_pendaftaran_bencana === "diterima"
              ? "border-moss-200 bg-moss-50 text-moss-700"
              : "border-rust-200 bg-rust-50 text-rust-700"
          }`}
        >
          {info.status_kontak_pendaftaran_bencana === "diterima" ? (
            <>
              ✓ Anda sudah mengonfirmasi <b>BERSEDIA</b> ikut pendataan ini, jadwal pelatihan{" "}
              <b>{info.jadwal_pelatihan_dipilih}</b>.
            </>
          ) : (
            <>
              Anda sudah mengonfirmasi <b>TIDAK BERSEDIA</b> ikut pendataan ini.
              {info.catatan_penolakan_pendaftaran_bencana && (
                <> Alasan: &ldquo;{info.catatan_penolakan_pendaftaran_bencana}&rdquo;</>
              )}
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">📅 Jadwal Pelatihan</h2>
          <p className="mt-1.5 text-ink/80">
            1 hari, bertempat di <b>Mami Hotel Kota Solok</b>, pada tanggal <b>7 atau 8 Oktober 2026</b>, pukul{" "}
            <b>08.00 – 17.00 WIB</b>. Silakan pilih salah satu tanggal saat konfirmasi kesediaan di bawah.
          </p>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">🎯 Target & Instrumen Pendataan</h2>
          <p className="mt-1.5 text-ink/80">
            Target pendataan adalah <b>seluruh KK yang terdampak bencana hidrometeorologi tahun 2025 lalu</b> di
            wilayah kerja yang ditugaskan. Pendataan dilakukan menggunakan instrumen <b>FASIH Mobile</b>. Contoh
            kuesioner akan dibagikan pada saat pelatihan.
          </p>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">📍 Perkiraan Wilayah Kerja</h2>
          {info.wilayah_kerja.length === 0 ? (
            <p className="mt-1.5 text-ink/60">
              Wilayah kerja Anda belum ditetapkan admin. Informasi ini akan diperbarui begitu wilayah kerja sudah
              diplot.
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-ink/70">
                {info.wilayah_kerja.length} Sub SLS, perkiraan total {totalKkTerdampak.toLocaleString("id-ID")} KK
                terdampak:
              </p>
              <div className="mt-2 overflow-x-auto rounded-md border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-ink/50">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Kecamatan</th>
                      <th className="px-2 py-1.5 font-medium">Nagari</th>
                      <th className="px-2 py-1.5 font-medium">Jorong</th>
                      <th className="px-2 py-1.5 text-right font-medium">KK Total</th>
                      <th className="px-2 py-1.5 text-right font-medium">Perkiraan KK Terdampak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.wilayah_kerja.map((r) => (
                      <tr key={r.idsubsls} className="border-t border-line">
                        <td className="px-2 py-1.5">{r.kecamatan}</td>
                        <td className="px-2 py-1.5">{r.nagari}</td>
                        <td className="px-2 py-1.5">{r.sls}</td>
                        <td className="px-2 py-1.5 text-right">{r.kk_total.toLocaleString("id-ID")}</td>
                        <td className="px-2 py-1.5 text-right">{r.kk_terdampak_estimasi.toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">🗓️ Jadwal Pendataan</h2>
          <p className="mt-1.5 text-ink/80">
            Pendataan lapangan dilaksanakan pada tanggal <b>10 – 31 Oktober 2026</b>.
          </p>
        </div>
      </section>

      {tampilkanForm && (
        <section className="mt-6 rounded-md border border-orange-200 bg-orange-50/40 p-4">
          <h2 className="text-sm font-semibold text-orange-900">Konfirmasi Kesediaan</h2>

          {!modeTolak ? (
            <>
              <div className="mt-3">
                <p className="text-xs font-medium text-ink/70">Pilih jadwal pelatihan:</p>
                <div className="mt-1.5 flex gap-3">
                  {PILIHAN_JADWAL.map((j) => (
                    <label key={j} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="jadwal"
                        checked={jadwalPilihan === j}
                        onChange={() => setJadwalPilihan(j)}
                      />
                      {j}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => kirimJawaban(true)}
                  className="flex-1 rounded-md bg-moss-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-700 disabled:opacity-50"
                >
                  {busy ? "Mengirim..." : "✅ Saya Bersedia"}
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
            </>
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
