"use client";

import { useEffect, useMemo, useState } from "react";

// (4 Okt 2026) Formulir "Lengkapi Data" di halaman Undangan. Alur:
//   1) Petugas MEMILIH NAMA dari dropdown (hanya nama yg sudah ada di data).
//   2) Formulir hanya menampilkan isian yang MASIH KOSONG utk nama itu
//      (server menghitungnya: GET /api/bencana/undangan/daftar?k=...), ditambah
//      NIK + email + tanggal lahir utk memastikan yang mengisi adalah orangnya.
//   3) Lokasi rumah diambil dgn SATU tombol (Geolocation API browser).
// Cadangan: "Nama saya tidak ada di daftar" -> pendaftar baru (isian lengkap).

type StatusKolom = "benar" | "salah" | "belum_ada" | "belum_dicek";
type Kolom = Record<"nama" | "nik" | "email" | "tanggal_lahir", StatusKolom>;
type YaTidak = "" | "ya" | "tidak";
type Opsi = { k: string; n: string; d: string };
type Butuh = {
  no_hp: boolean;
  lokasi: boolean;
  jenis_kelamin: boolean;
  pendidikan: boolean;
  pekerjaan: boolean;
  bisa_mengendarai_motor: boolean;
  punya_kendaraan_bermotor: boolean;
  punya_hp_android: boolean;
  pernah_capi: boolean;
  alamat: boolean;
};

const SEMUA_BUTUH: Butuh = {
  no_hp: true,
  lokasi: true,
  jenis_kelamin: true,
  pendidikan: true,
  pekerjaan: true,
  bisa_mengendarai_motor: true,
  punya_kendaraan_bermotor: true,
  punya_hp_android: true,
  pernah_capi: true,
  alamat: true,
};

const KECAMATAN = [
  "Bukit Sundi",
  "Danau Kembar",
  "Gunung Talang",
  "Hiliran Gumanti",
  "IX Koto Sungai Lasi",
  "Junjung Sirih",
  "Kubung",
  "Lembah Gumanti",
  "Lembang Jaya",
  "Pantai Cermin",
  "Payung Sekaki",
  "Tigo Lurah",
  "X Koto Diatas",
  "X Koto Singkarak",
];
const PENDIDIKAN = [
  "Tamat SD/Sederajat",
  "Tamat SMP/Sederajat",
  "Tamat SMA/Sederajat",
  "Tamat D1/D2/D3",
  "Tamat D4/S1",
  "Tamat S2",
  "Tamat S3",
];
const PEKERJAAN = [
  "Wiraswasta",
  "Mengurus Rumah Tangga",
  "Pelajar / Mahasiswa",
  "Kader PKK / Karang Taruna / Kader Lainnya",
  "Pegawai / Guru Honorer",
  "Aparat Desa / Kelurahan",
  "Lainnya",
];
const KEGIATAN = ["PES SE2026", "SITASI 2026", "SPDT NTP 2026", "GC Mix Method", "SKSPPI/SKLNPT/SKTNP/SKNP"];

const KARTU = "rounded-[14px] bg-white p-4 shadow-sm";
const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-[#13213A] outline-none focus:border-[#0F3D7A] focus:ring-2 focus:ring-[#0F3D7A]/20";
const LABEL = "mb-1 block text-[13px] font-bold text-slate-700";
const JUDUL_BAGIAN = "text-[12px] font-extrabold uppercase tracking-wide text-[#0F3D7A]";
const LABEL_KOLOM: Record<keyof Kolom, string> = { nama: "Nama", nik: "NIK", email: "Email", tanggal_lahir: "Tanggal lahir" };

function YaTidakInput({ nama, nilai, set }: { nama: string; nilai: YaTidak; set: (v: YaTidak) => void }) {
  return (
    <div className="flex gap-2">
      {(["ya", "tidak"] as const).map((v) => (
        <label
          key={v}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[14px] font-bold ${
            nilai === v ? "border-[#0F3D7A] bg-[#0F3D7A] text-white" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          <input type="radio" name={nama} className="sr-only" checked={nilai === v} onChange={() => set(v)} />
          {v === "ya" ? "Ya" : "Tidak"}
        </label>
      ))}
    </div>
  );
}

function sederhana(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export default function DaftarLengkapiForm({
  pilihanAwal = "",
  nikAwal = "",
  emailAwal = "",
  tglAwal = "",
  pesan,
  onSelesai,
  onTutup,
  onLewati,
}: {
  /** Kunci nama yg sudah diketahui (mis. "p:12" setelah lolos verifikasi) -> dropdown langsung terpilih. */
  pilihanAwal?: string;
  nikAwal?: string;
  emailAwal?: string;
  tglAwal?: string;
  /** Pesan pembuka (mis. "Identitas Anda terverifikasi, tetapi ... belum lengkap"). */
  pesan?: string;
  onSelesai: (json: { nama: string; path: string | null }) => void;
  onTutup: () => void;
  /** Kalau diisi, tampil tombol "Lewati, buka undangan". */
  onLewati?: () => void;
}) {
  // ---- pemilihan nama ----
  const [daftar, setDaftar] = useState<Opsi[] | null>(null);
  const [daftarError, setDaftarError] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [pilihan, setPilihan] = useState(pilihanAwal);
  const [namaBaru, setNamaBaru] = useState("");
  const [butuh, setButuh] = useState<Butuh | null>(null);
  const [butuhBusy, setButuhBusy] = useState(false);

  // ---- isian ----
  const [nik, setNik] = useState(nikAwal);
  const [email, setEmail] = useState(emailAwal);
  const [tgl, setTgl] = useState(tglAwal);
  const [hp, setHp] = useState("");
  const [kecPilih, setKecPilih] = useState("");
  const [kecLain, setKecLain] = useState("");
  const [nagari, setNagari] = useState("");
  const [detail, setDetail] = useState("");
  const [lokasi, setLokasi] = useState<{ lat: number; lng: number; akurasi: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [jk, setJk] = useState<"" | "Lk" | "Pr">("");
  const [pendidikan, setPendidikan] = useState("");
  const [pekerjaan, setPekerjaan] = useState("");
  const [motor, setMotor] = useState<YaTidak>("");
  const [punyaMotor, setPunyaMotor] = useState<YaTidak>("");
  const [android, setAndroid] = useState<YaTidak>("");
  const [capi, setCapi] = useState<YaTidak>("");
  const [kegiatan, setKegiatan] = useState<string[]>([]);
  const [kegiatanLain, setKegiatanLain] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kolom, setKolom] = useState<Kolom | null>(null);
  const [sisa, setSisa] = useState<number | null>(null);
  const [selesaiTanpaPath, setSelesaiTanpaPath] = useState<{ nama: string; mode: string } | null>(null);

  // Muat daftar nama sekali.
  useEffect(() => {
    let batal = false;
    fetch("/api/bencana/undangan/daftar")
      .then((r) => r.json())
      .then((j) => {
        if (batal) return;
        if (Array.isArray(j?.pilihan)) setDaftar(j.pilihan as Opsi[]);
        else setDaftarError((j?.error as string) ?? "Daftar nama gagal dimuat.");
      })
      .catch(() => !batal && setDaftarError("Daftar nama gagal dimuat. Periksa koneksi internet."));
    return () => {
      batal = true;
    };
  }, []);

  // Setiap nama dipilih -> minta server menghitung isian yg masih kosong.
  useEffect(() => {
    setButuh(null);
    setError(null);
    setKolom(null);
    if (!pilihan) return;
    if (pilihan === "baru") {
      setButuh(SEMUA_BUTUH);
      return;
    }
    let batal = false;
    setButuhBusy(true);
    fetch(`/api/bencana/undangan/daftar?k=${encodeURIComponent(pilihan)}`)
      .then((r) => r.json())
      .then((j) => {
        if (batal) return;
        if (j?.butuh) setButuh(j.butuh as Butuh);
        else setError((j?.error as string) ?? "Data tidak dapat dimuat.");
      })
      .catch(() => !batal && setError("Gagal menghubungi server. Periksa koneksi internet."))
      .finally(() => !batal && setButuhBusy(false));
    return () => {
      batal = true;
    };
  }, [pilihan]);

  const hasilCari = useMemo(() => {
    if (!daftar) return [];
    const q = sederhana(cari);
    const terpilih = daftar.find((o) => o.k === pilihan);
    const saring = q ? daftar.filter((o) => sederhana(o.n).includes(q)) : daftar;
    const potong = saring.slice(0, 80);
    return terpilih && !potong.some((o) => o.k === terpilih.k) ? [terpilih, ...potong] : potong;
  }, [daftar, cari, pilihan]);

  function ambilLokasi() {
    setGpsError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Perangkat/peramban ini tidak mendukung lokasi.");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLokasi({ lat: pos.coords.latitude, lng: pos.coords.longitude, akurasi: Math.round(pos.coords.accuracy) });
        setGpsBusy(false);
      },
      (err) => {
        setGpsBusy(false);
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan peramban lalu tekan tombol lagi."
            : "Lokasi belum berhasil didapat. Pastikan GPS aktif, pindah ke tempat terbuka, lalu coba lagi."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function toggleKegiatan(k: string) {
    setKegiatan((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setKolom(null);
    setSisa(null);
    if (!pilihan || !butuh) return setError("Pilih nama Anda dari daftar terlebih dahulu.");
    const kec = kecPilih === "__lain" ? kecLain.trim() : kecPilih;
    if (butuh.alamat && !kec) return setError("Pilih kecamatan tempat tinggal Anda.");
    if (butuh.lokasi && !lokasi) return setError("Lokasi rumah belum dipilih. Tekan tombol “Ambil lokasi saya”.");
    if (butuh.jenis_kelamin && !jk) return setError("Pilih jenis kelamin.");
    if (
      (butuh.bisa_mengendarai_motor && !motor) ||
      (butuh.punya_kendaraan_bermotor && !punyaMotor) ||
      (butuh.punya_hp_android && !android) ||
      (butuh.pernah_capi && !capi)
    ) {
      return setError("Jawab semua pertanyaan Ya/Tidak.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/bencana/undangan/daftar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pilihan,
          nama: namaBaru,
          nik,
          email,
          tanggal_lahir: tgl,
          no_hp: hp,
          alamat_kecamatan: kec,
          alamat_nagari: nagari,
          alamat_detail: detail,
          lat: lokasi?.lat ?? null,
          lng: lokasi?.lng ?? null,
          jenis_kelamin: jk,
          pendidikan,
          pekerjaan,
          bisa_mengendarai_motor: motor ? motor === "ya" : null,
          punya_kendaraan_bermotor: punyaMotor ? punyaMotor === "ya" : null,
          punya_hp_android: android ? android === "ya" : null,
          pernah_capi: capi ? capi === "ya" : null,
          kegiatan_lain: [...kegiatan, ...(kegiatanLain.trim() ? [kegiatanLain.trim()] : [])],
          website,
        }),
      });
      const json = await res.json();
      if (json?.kolom) setKolom(json.kolom as Kolom);
      if (typeof json?.sisa_percobaan === "number") setSisa(json.sisa_percobaan);
      if (json?.ok) {
        if (json.path) onSelesai({ nama: json.nama as string, path: json.path as string });
        else setSelesaiTanpaPath({ nama: (json.nama as string) || namaBaru, mode: json.mode as string });
      } else if (json?.error) {
        setError(json.error as string);
      } else if (json?.kolom) {
        setError("Ada data yang belum cocok dengan data kami. Periksa kolom bertanda merah.");
      }
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  if (selesaiTanpaPath) {
    return (
      <div className={`${KARTU} border border-emerald-300`}>
        <div className="text-[17px] font-extrabold text-[#13213A]">Terima kasih, {selesaiTanpaPath.nama}</div>
        <p className="mt-1 text-[14px] text-slate-700">
          {selesaiTanpaPath.mode === "baru"
            ? "Data Anda sudah tercatat sebagai calon petugas pendataan bencana. Admin BPS Kabupaten Solok akan memeriksanya dan menghubungi Anda melalui WhatsApp."
            : "Data Anda sudah dilengkapi. Saat ini belum ada undangan atau penempatan yang perlu Anda konfirmasi; silakan tunggu informasi dari admin."}
        </p>
        <button type="button" onClick={onTutup} className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-[14px] font-bold text-slate-700">
          Tutup
        </button>
      </div>
    );
  }

  const adaSalah = kolom ? Object.values(kolom).includes("salah") : false;
  const baru = pilihan === "baru";
  const adaYangKosong = butuh ? Object.values(butuh).some(Boolean) : false;

  return (
    <form onSubmit={kirim} className={`${KARTU} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-extrabold text-[#13213A]">Lengkapi Data</div>
          <p className="mt-0.5 text-[13px] text-slate-600">
            Pilih nama Anda, lalu lengkapi isian yang masih kosong. Data dipakai untuk menentukan wilayah tugas yang paling dekat dari rumah Anda.
          </p>
        </div>
        <button type="button" onClick={onTutup} className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-bold text-slate-500">
          Tutup
        </button>
      </div>

      {pesan && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">{pesan}</div>}

      {/* honeypot -- disembunyikan dari manusia */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {/* ---------- 1. pilih nama ---------- */}
      <section className="space-y-2">
        <div className={JUDUL_BAGIAN}>1. Pilih nama Anda</div>
        {daftarError && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-[13px] text-red-800">{daftarError}</div>}
        {!daftar && !daftarError && <div className="text-[13px] text-slate-500">Memuat daftar nama…</div>}
        {daftar && (
          <>
            <input
              className={INPUT}
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Ketik untuk mencari nama…"
              autoComplete="off"
            />
            <select className={INPUT} value={pilihan} onChange={(e) => setPilihan(e.target.value)} required>
              <option value="">
                {cari && hasilCari.length === 0 ? "Tidak ada nama yang cocok" : `Pilih nama… (${hasilCari.length}${daftar.length > hasilCari.length ? " dari " + daftar.length : ""})`}
              </option>
              {hasilCari.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.n}
                  {o.d ? ` — ${o.d}` : ""}
                </option>
              ))}
              <option value="baru">Nama saya tidak ada di daftar</option>
            </select>
          </>
        )}
        {baru && (
          <div>
            <label className={LABEL}>Nama lengkap (pendaftar baru)</label>
            <input className={INPUT} value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} autoComplete="off" required />
            <p className="mt-1 text-[12px] text-slate-500">Pastikan nama Anda benar-benar tidak ada di dropdown. Pendaftar baru akan ditinjau admin.</p>
          </div>
        )}
        {butuhBusy && <div className="text-[13px] text-slate-500">Memeriksa data Anda…</div>}
      </section>

      {butuh && (
        <>
          {/* ---------- 2. identitas (verifikasi) ---------- */}
          <section className="space-y-3">
            <div className={JUDUL_BAGIAN}>2. Pastikan ini Anda</div>
            <div>
              <label className={LABEL}>NIK (16 digit)</label>
              <input
                className={INPUT}
                value={nik}
                onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
                inputMode="numeric"
                placeholder="16 digit angka"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label className={LABEL}>Tanggal lahir</label>
              <input className={INPUT} type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} required />
            </div>
            <div>
              <label className={LABEL}>Alamat email</label>
              <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            </div>
          </section>

          {/* ---------- 3. yang masih kosong ---------- */}
          <section className="space-y-3">
            <div className={JUDUL_BAGIAN}>3. Lengkapi data</div>
            {!baru && !adaYangKosong && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[13px] text-emerald-900">
                Data Anda sudah lengkap. Cukup tekan tombol di bawah untuk membuka undangan.
              </div>
            )}

            {butuh.no_hp && (
              <div>
                <label className={LABEL}>No HP / WhatsApp</label>
                <input className={INPUT} value={hp} onChange={(e) => setHp(e.target.value)} inputMode="tel" placeholder="0812xxxxxxxx" autoComplete="off" required />
              </div>
            )}

            {butuh.jenis_kelamin && (
              <div>
                <label className={LABEL}>Jenis kelamin</label>
                <div className="flex gap-2">
                  {(["Lk", "Pr"] as const).map((v) => (
                    <label
                      key={v}
                      className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-[14px] font-bold ${
                        jk === v ? "border-[#0F3D7A] bg-[#0F3D7A] text-white" : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <input type="radio" name="jk" className="sr-only" checked={jk === v} onChange={() => setJk(v)} />
                      {v === "Lk" ? "Laki-laki" : "Perempuan"}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {butuh.alamat && (
              <>
                <div>
                  <label className={LABEL}>Kecamatan</label>
                  <select className={INPUT} value={kecPilih} onChange={(e) => setKecPilih(e.target.value)} required>
                    <option value="">Pilih kecamatan…</option>
                    {KECAMATAN.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                    <option value="__lain">Lainnya (di luar daftar)</option>
                  </select>
                  {kecPilih === "__lain" && (
                    <input className={`${INPUT} mt-2`} value={kecLain} onChange={(e) => setKecLain(e.target.value)} placeholder="Tulis nama kecamatan" required />
                  )}
                </div>
                <div>
                  <label className={LABEL}>Nagari / Desa</label>
                  <input className={INPUT} value={nagari} onChange={(e) => setNagari(e.target.value)} placeholder="Nagari/desa tempat tinggal" autoComplete="off" required />
                </div>
              </>
            )}

            {butuh.lokasi && (
              <>
                <div>
                  <label className={LABEL}>Jorong / alamat (opsional)</label>
                  <input className={INPUT} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Nama jorong, RT/RW, atau patokan" autoComplete="off" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[13px] font-bold text-slate-700">Titik koordinat rumah</div>
                  <p className="mt-0.5 text-[12px] text-slate-600">Berdirilah di rumah Anda, lalu tekan tombol. Tidak perlu mengetik koordinat.</p>
                  <button
                    type="button"
                    onClick={ambilLokasi}
                    disabled={gpsBusy}
                    className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-[14px] font-extrabold text-white disabled:opacity-60"
                  >
                    {gpsBusy ? "Mengambil lokasi…" : lokasi ? "Ambil ulang lokasi saya" : "Ambil lokasi saya"}
                  </button>
                  {lokasi && (
                    <div className="mt-2 text-[13px] text-emerald-800">
                      ✓ Lokasi tersimpan ({lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)}), akurasi ± {lokasi.akurasi} m.{" "}
                      <a className="font-bold underline" href={`https://www.google.com/maps?q=${lokasi.lat},${lokasi.lng}`} target="_blank" rel="noreferrer">
                        Lihat di peta
                      </a>
                      {lokasi.akurasi > 200 && <div className="mt-1 text-amber-700">Akurasi kurang baik; sebaiknya ambil ulang di tempat terbuka.</div>}
                    </div>
                  )}
                  {gpsError && <div className="mt-2 text-[13px] text-red-700">{gpsError}</div>}
                </div>
              </>
            )}

            {butuh.pendidikan && (
              <div>
                <label className={LABEL}>Pendidikan terakhir</label>
                <select className={INPUT} value={pendidikan} onChange={(e) => setPendidikan(e.target.value)} required>
                  <option value="">Pilih…</option>
                  {PENDIDIKAN.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            {butuh.pekerjaan && (
              <div>
                <label className={LABEL}>Pekerjaan utama</label>
                <select className={INPUT} value={pekerjaan} onChange={(e) => setPekerjaan(e.target.value)} required>
                  <option value="">Pilih…</option>
                  {PEKERJAAN.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            {butuh.bisa_mengendarai_motor && (
              <div>
                <label className={LABEL}>Bisa mengendarai sepeda motor?</label>
                <YaTidakInput nama="motor" nilai={motor} set={setMotor} />
              </div>
            )}
            {butuh.punya_kendaraan_bermotor && (
              <div>
                <label className={LABEL}>Punya kendaraan bermotor sendiri?</label>
                <YaTidakInput nama="punyamotor" nilai={punyaMotor} set={setPunyaMotor} />
              </div>
            )}
            {butuh.punya_hp_android && (
              <div>
                <label className={LABEL}>Punya HP Android?</label>
                <YaTidakInput nama="android" nilai={android} set={setAndroid} />
              </div>
            )}
            {butuh.pernah_capi && (
              <div>
                <label className={LABEL}>Pernah mendata dengan aplikasi (CAPI/FASIH)?</label>
                <YaTidakInput nama="capi" nilai={capi} set={setCapi} />
              </div>
            )}

            <div>
              <label className={LABEL}>Sedang/akan terlibat kegiatan BPS lain? (opsional)</label>
              <div className="flex flex-wrap gap-2">
                {KEGIATAN.map((k) => (
                  <label
                    key={k}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-bold ${
                      kegiatan.includes(k) ? "border-[#0F3D7A] bg-[#0F3D7A] text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <input type="checkbox" className="sr-only" checked={kegiatan.includes(k)} onChange={() => toggleKegiatan(k)} />
                    {k}
                  </label>
                ))}
              </div>
              <input className={`${INPUT} mt-2`} value={kegiatanLain} onChange={(e) => setKegiatanLain(e.target.value)} placeholder="Kegiatan lain (tulis nama kegiatan)" />
            </div>
          </section>
        </>
      )}

      {kolom && (
        <div className="space-y-1.5 rounded-xl border border-slate-200 p-3">
          <div className="text-[14px] font-extrabold text-[#13213A]">{adaSalah ? "Ada data yang belum cocok" : "Data cocok"}</div>
          {(Object.keys(LABEL_KOLOM) as (keyof Kolom)[]).map((k) => (
            <div
              key={k}
              className={`rounded-lg px-3 py-1.5 text-[13px] ${
                kolom[k] === "salah" ? "bg-red-50 text-red-800" : kolom[k] === "benar" ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"
              }`}
            >
              <b>{LABEL_KOLOM[k]}</b>:{" "}
              {kolom[k] === "salah" ? "tidak cocok dengan data kami, periksa kembali" : kolom[k] === "benar" ? "cocok" : "belum ada data pembanding, isian Anda disimpan"}
            </div>
          ))}
          {adaSalah && sisa !== null && (
            <p className="pt-1 text-[12px] text-slate-700">
              Sisa percobaan: <b className={sisa <= 1 ? "text-red-700" : ""}>{sisa}</b>. Jika salah terus, akses dikunci sementara.
            </p>
          )}
        </div>
      )}

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[14px] text-red-800">{error}</div>}

      {butuh && (
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#0F3D7A] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-60">
          {busy ? "Menyimpan…" : "Simpan & Lanjutkan"}
        </button>
      )}
      {onLewati && (
        <button type="button" onClick={onLewati} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-[14px] font-bold text-slate-700">
          Lewati, buka undangan
        </button>
      )}
      <p className="text-[12px] text-slate-500">Data hanya dipakai BPS Kabupaten Solok untuk keperluan penugasan pendataan pasca bencana.</p>
    </form>
  );
}
