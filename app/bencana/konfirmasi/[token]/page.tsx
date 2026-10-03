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
  // (3 Okt 2026) true kalau estimasi 0 di atas BUKAN krn benar2 nol KK
  // terdampak, tapi krn mitra blm mengisi indikator dampak KK saat
  // Identifikasi Jorong -- lihat komentar route.ts.
  kk_terdampak_belum_lengkap: boolean;
};

type KonfirmasiInfo = {
  nama: string;
  status_kepegawaian: "organik" | "mitra";
  pendaftaran_bencana_konfirmasi: boolean;
  status_kontak_pendaftaran_bencana: "diterima" | "menolak" | null;
  catatan_penolakan_pendaftaran_bencana: string | null;
  jadwal_pelatihan_dipilih: string | null;
  wilayah_kerja: WilayahKerjaRow[];
  // (3 Okt 2026) dipakai utk section "📝 Lengkapi Data Anda" -- lihat komentar
  // panjang di route.ts. FE hanya menampilkan field yg BENAR2 kosong,
  // berbeda per petugas ("tergantung orangnya" -- permintaan user).
  no_hp: string | null;
  lokasi_status: "riil" | "perkiraan_nagari" | "tanpa_data";
  umur: number | null;
  jenis_kelamin: "Lk" | "Pr" | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  bisa_mengendarai_motor: boolean | null;
  punya_kendaraan_bermotor: boolean | null;
};

const PILIHAN_JADWAL = ["7 Oktober 2026", "8 Oktober 2026"];

// (3 Okt 2026) SAMA persis dgn whitelist di route.ts -- lihat komentar di
// sana soal alasan nilai2 ini yg dipilih (konsisten dgn data rekrutmen mitra
// yg sudah ada).
const PILIHAN_PENDIDIKAN = [
  "Tamat SD/Sederajat",
  "Tamat SMP/Sederajat",
  "Tamat SMA/Sederajat",
  "Tamat D1/D2/D3",
  "Tamat D4/S1",
  "Tamat S2",
  "Tamat S3",
];
const PILIHAN_PEKERJAAN = [
  "Wiraswasta",
  "Mengurus Rumah Tangga",
  "Pelajar / Mahasiswa",
  "Kader PKK / Karang Taruna / Kader Lainnya",
  "Pegawai / Guru Honorer",
  "Aparat Desa / Kelurahan",
  "Lainnya",
];

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

  // ---- "📝 Lengkapi Data Anda" (3 Okt 2026) -----------------------------
  // Lokasi rumah (GPS) punya alur sendiri (sama pola dgn /bencana/lokasi/
  // [token]) krn perlu trigger Geolocation API browser, terpisah dari
  // field teks/pilihan lain yg disimpan lewat satu tombol "Simpan".
  const [lokasiBusy, setLokasiBusy] = useState(false);
  const [lokasiPesan, setLokasiPesan] = useState<string | null>(null);

  const [noHpInput, setNoHpInput] = useState("");
  const [umurInput, setUmurInput] = useState("");
  const [jkInput, setJkInput] = useState<"" | "Lk" | "Pr">("");
  const [pendidikanInput, setPendidikanInput] = useState("");
  const [pekerjaanInput, setPekerjaanInput] = useState("");
  const [motorInput, setMotorInput] = useState<"" | "ya" | "tidak">("");
  const [kendaraanInput, setKendaraanInput] = useState<"" | "ya" | "tidak">("");
  const [lengkapiBusy, setLengkapiBusy] = useState(false);
  const [lengkapiError, setLengkapiError] = useState<string | null>(null);

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

  function handleTetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setLokasiPesan("Browser ini tidak mendukung deteksi lokasi GPS.");
      return;
    }
    setLokasiBusy(true);
    setLokasiPesan(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/bencana/konfirmasi/${token}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const json = await res.json();
          if (!res.ok) {
            setLokasiPesan(json?.error ?? "Gagal menyimpan lokasi.");
          } else {
            await muat();
          }
        } catch {
          setLokasiPesan("Gagal menyimpan lokasi. Periksa koneksi internet, lalu coba lagi.");
        } finally {
          setLokasiBusy(false);
        }
      },
      (err) => {
        setLokasiBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLokasiPesan("Izin lokasi ditolak. Aktifkan izin lokasi utk browser ini, lalu coba lagi.");
        } else {
          setLokasiPesan("Gagal mendeteksi lokasi GPS. Pastikan GPS aktif, lalu coba lagi.");
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function simpanLengkapiData() {
    const body: Record<string, unknown> = {};
    if (noHpInput.trim()) body.no_hp = noHpInput.trim();
    if (umurInput.trim()) body.umur = Number(umurInput);
    if (jkInput) body.jenis_kelamin = jkInput;
    if (pendidikanInput) body.pendidikan = pendidikanInput;
    if (pekerjaanInput) body.pekerjaan = pekerjaanInput;
    if (motorInput) body.bisa_mengendarai_motor = motorInput === "ya";
    if (kendaraanInput) body.punya_kendaraan_bermotor = kendaraanInput === "ya";

    if (Object.keys(body).length === 0) {
      setLengkapiError("Isi dulu salah satu kolom di atas sebelum menyimpan.");
      return;
    }

    setLengkapiBusy(true);
    setLengkapiError(null);
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setLengkapiError(json?.error ?? "Gagal menyimpan data.");
      } else {
        setNoHpInput("");
        setUmurInput("");
        setJkInput("");
        setPendidikanInput("");
        setPekerjaanInput("");
        setMotorInput("");
        setKendaraanInput("");
        await muat();
      }
    } catch {
      setLengkapiError("Gagal menyimpan data. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setLengkapiBusy(false);
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
  const adaYangBelumLengkap = info.wilayah_kerja.some((r) => r.kk_terdampak_belum_lengkap);

  // ---- "📝 Lengkapi Data Anda" -- cuma tawarkan field yg BENAR2 kosong,
  // beda per petugas ("tergantung orangnya"). Field demografi (umur, jenis
  // kelamin, pendidikan, pekerjaan, kendaraan) hanya ditawarkan utk mitra --
  // utk petugas organik (BPS) field2 ini memang bukan bagian data yg
  // dikumpulkan saat rekrutmen (lihat komentar route.ts), bukan "kosong".
  const isMitra = info.status_kepegawaian === "mitra";
  const perluLokasi = info.lokasi_status !== "riil";
  const perluNoHp = !info.no_hp;
  const perluUmur = isMitra && info.umur == null;
  const perluJk = isMitra && !info.jenis_kelamin;
  const perluPendidikan = isMitra && !info.pendidikan;
  const perluPekerjaan = isMitra && !info.pekerjaan;
  const perluMotor = isMitra && info.bisa_mengendarai_motor == null;
  const perluKendaraan = isMitra && info.punya_kendaraan_bermotor == null;
  const perluFormTeks = perluNoHp || perluUmur || perluJk || perluPendidikan || perluPekerjaan || perluMotor || perluKendaraan;
  const adaDataBelumLengkap = perluLokasi || perluFormTeks;

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
                terdampak
                {adaYangBelumLengkap && " (sebagian data perkiraan belum lengkap, lihat tabel di bawah)"}:
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
                        <td className="px-2 py-1.5 text-right">
                          {r.kk_terdampak_belum_lengkap ? (
                            <span className="italic text-ink/40" title="Mitra belum mengisi perkiraan jumlah KK terdampak untuk Jorong ini saat identifikasi.">
                              Data belum lengkap
                            </span>
                          ) : (
                            r.kk_terdampak_estimasi.toLocaleString("id-ID")
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {adaYangBelumLengkap && (
                <p className="mt-1.5 text-[11px] text-ink/50">
                  &ldquo;Data belum lengkap&rdquo; artinya wilayah ini sudah tercatat terdampak, tapi mitra yang
                  melakukan identifikasi belum mengisi perkiraan jumlah KK terdampak -- bukan berarti wilayah ini
                  tidak ada KK terdampak.
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">🗓️ Jadwal Pendataan</h2>
          <p className="mt-1.5 text-ink/80">
            Pendataan lapangan dilaksanakan pada tanggal <b>10 – 31 Oktober 2026</b>.
          </p>
        </div>

        {adaDataBelumLengkap && (
          <div className="rounded-md border border-orange-200 bg-orange-50/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-orange-800">📝 Lengkapi Data Anda</h2>
            <p className="mt-1.5 text-ink/70">
              Beberapa data diri Anda di catatan kami masih kosong. Mohon dilengkapi dulu sebelum konfirmasi
              kesediaan di bawah.
            </p>

            {perluLokasi && (
              <div className="mt-3 rounded-md border border-line bg-white p-3">
                <p className="text-xs font-medium text-ink/70">📍 Lokasi rumah Anda belum tercatat.</p>
                <p className="mt-1 text-[11px] text-ink/50">
                  Dipakai untuk menghitung jarak ke wilayah tugas, supaya pembagian wilayah kerja antar petugas lebih
                  adil.
                </p>
                <button
                  type="button"
                  onClick={handleTetapkanLokasi}
                  disabled={lokasiBusy}
                  className="mt-2 rounded-md bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
                >
                  {lokasiBusy ? "Mendeteksi lokasi..." : "📍 Tetapkan Lokasi Rumah Saya"}
                </button>
                {lokasiPesan && <p className="mt-2 text-[11px] text-rust-700">{lokasiPesan}</p>}
              </div>
            )}

            {perluFormTeks && (
              <div className="mt-3 rounded-md border border-line bg-white p-3">
                <div className="flex flex-col gap-3">
                  {perluNoHp && (
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">No HP / WhatsApp</span>
                      <input
                        type="tel"
                        value={noHpInput}
                        onChange={(e) => setNoHpInput(e.target.value)}
                        placeholder="08xx-xxxx-xxxx"
                        className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-orange-400"
                      />
                    </label>
                  )}
                  {perluUmur && (
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">Umur</span>
                      <input
                        type="number"
                        min={15}
                        max={90}
                        value={umurInput}
                        onChange={(e) => setUmurInput(e.target.value)}
                        placeholder="Umur (tahun)"
                        className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-orange-400"
                      />
                    </label>
                  )}
                  {perluJk && (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">Jenis Kelamin</span>
                      <div className="flex gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input type="radio" name="jk" checked={jkInput === "Lk"} onChange={() => setJkInput("Lk")} />
                          Laki-laki
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input type="radio" name="jk" checked={jkInput === "Pr"} onChange={() => setJkInput("Pr")} />
                          Perempuan
                        </label>
                      </div>
                    </div>
                  )}
                  {perluPendidikan && (
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">Pendidikan Terakhir</span>
                      <select
                        value={pendidikanInput}
                        onChange={(e) => setPendidikanInput(e.target.value)}
                        className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-orange-400"
                      >
                        <option value="">Pilih pendidikan...</option>
                        {PILIHAN_PENDIDIKAN.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {perluPekerjaan && (
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">Pekerjaan</span>
                      <select
                        value={pekerjaanInput}
                        onChange={(e) => setPekerjaanInput(e.target.value)}
                        className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-orange-400"
                      >
                        <option value="">Pilih pekerjaan...</option>
                        {PILIHAN_PEKERJAAN.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {perluMotor && (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">Bisa mengendarai sepeda motor?</span>
                      <div className="flex gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            name="motor"
                            checked={motorInput === "ya"}
                            onChange={() => setMotorInput("ya")}
                          />
                          Ya
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            name="motor"
                            checked={motorInput === "tidak"}
                            onChange={() => setMotorInput("tidak")}
                          />
                          Tidak
                        </label>
                      </div>
                    </div>
                  )}
                  {perluKendaraan && (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink/70">Punya kendaraan bermotor sendiri?</span>
                      <div className="flex gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            name="kendaraan"
                            checked={kendaraanInput === "ya"}
                            onChange={() => setKendaraanInput("ya")}
                          />
                          Ya
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            name="kendaraan"
                            checked={kendaraanInput === "tidak"}
                            onChange={() => setKendaraanInput("tidak")}
                          />
                          Tidak
                        </label>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={simpanLengkapiData}
                    disabled={lengkapiBusy}
                    className="mt-1 self-start rounded-md bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    {lengkapiBusy ? "Menyimpan..." : "💾 Simpan Data"}
                  </button>
                  {lengkapiError && <p className="text-[11px] text-rust-700">{lengkapiError}</p>}
                </div>
              </div>
            )}
          </div>
        )}
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
