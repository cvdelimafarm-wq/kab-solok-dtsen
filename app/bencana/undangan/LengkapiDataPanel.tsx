"use client";

import { useCallback, useEffect, useState } from "react";

// (4 Okt 2026) Panel "Lengkapi Data Anda" untuk halaman tawaran menginap --
// pertanyaan yang SAMA dgn konfirmasi reguler (/bencana/konfirmasi/[token]),
// tetapi hanya menampilkan kolom yang BENAR-BENAR masih kosong di data petugas
// (yang sudah terisi / sudah disampaikan tidak ditanyakan lagi). Memakai API
// reguler (GET/PATCH /api/bencana/konfirmasi/<token petugas>), jadi aturan
// validasinya otomatis sama. Kalau semua data sudah lengkap, panel tidak tampil.

type Data = {
  no_hp: string | null;
  lokasi_status: "riil" | "perkiraan_nagari" | "tanpa_data";
  umur: number | null;
  jenis_kelamin: "Lk" | "Pr" | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  bisa_mengendarai_motor: boolean | null;
  punya_kendaraan_bermotor: boolean | null;
  status_kepegawaian: "organik" | "mitra";
};

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
const JUDUL_KARTU = "text-[17px] font-extrabold text-[#13213A]";
const INPUT_TEKS = "rounded-lg border border-[#D5DDE8] bg-white px-3 py-2 text-sm outline-none focus:border-[#0F3D7A]";

function Radio2({ nama, nilai, set }: { nama: string; nilai: "" | "ya" | "tidak"; set: (v: "ya" | "tidak") => void }) {
  return (
    <div className="flex gap-3">
      {(["ya", "tidak"] as const).map((v) => (
        <label key={v} className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input type="radio" name={nama} checked={nilai === v} onChange={() => set(v)} />
          {v === "ya" ? "Ya" : "Tidak"}
        </label>
      ))}
    </div>
  );
}

export default function LengkapiDataPanel({ petugasToken }: { petugasToken: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [lokasiBusy, setLokasiBusy] = useState(false);
  const [lokasiPesan, setLokasiPesan] = useState<string | null>(null);
  const [noHp, setNoHp] = useState("");
  const [umur, setUmur] = useState("");
  const [jk, setJk] = useState<"" | "Lk" | "Pr">("");
  const [pendidikan, setPendidikan] = useState("");
  const [pekerjaan, setPekerjaan] = useState("");
  const [motor, setMotor] = useState<"" | "ya" | "tidak">("");
  const [kendaraan, setKendaraan] = useState<"" | "ya" | "tidak">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${petugasToken}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json.data as Data);
    } catch {
      /* panel opsional: gagal memuat = tidak tampil */
    }
  }, [petugasToken]);

  useEffect(() => {
    muat();
  }, [muat]);

  if (!data) return null;

  const mitra = data.status_kepegawaian === "mitra";
  const perluLokasi = data.lokasi_status !== "riil";
  const perluNoHp = !data.no_hp;
  const perluUmur = mitra && data.umur == null;
  const perluJk = mitra && !data.jenis_kelamin;
  const perluPendidikan = mitra && !data.pendidikan;
  const perluPekerjaan = mitra && !data.pekerjaan;
  const perluMotor = mitra && data.bisa_mengendarai_motor == null;
  const perluKendaraan = mitra && data.punya_kendaraan_bermotor == null;
  const perluForm = perluNoHp || perluUmur || perluJk || perluPendidikan || perluPekerjaan || perluMotor || perluKendaraan;
  if (!perluLokasi && !perluForm) return null;

  function tetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setLokasiPesan("Browser ini tidak mendukung deteksi lokasi GPS.");
      return;
    }
    setLokasiBusy(true);
    setLokasiPesan(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/bencana/konfirmasi/${petugasToken}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const json = await res.json();
          if (!res.ok) setLokasiPesan(json?.error ?? "Gagal menyimpan lokasi.");
          else await muat();
        } catch {
          setLokasiPesan("Gagal menyimpan lokasi. Periksa koneksi internet, lalu coba lagi.");
        } finally {
          setLokasiBusy(false);
        }
      },
      (err) => {
        setLokasiBusy(false);
        setLokasiPesan(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk browser ini, lalu coba lagi."
            : "Gagal mendeteksi lokasi GPS. Pastikan GPS aktif, lalu coba lagi."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function simpan() {
    const body: Record<string, unknown> = {};
    if (noHp.trim()) body.no_hp = noHp.trim();
    if (umur.trim()) body.umur = Number(umur);
    if (jk) body.jenis_kelamin = jk;
    if (pendidikan) body.pendidikan = pendidikan;
    if (pekerjaan) body.pekerjaan = pekerjaan;
    if (motor) body.bisa_mengendarai_motor = motor === "ya";
    if (kendaraan) body.punya_kendaraan_bermotor = kendaraan === "ya";
    if (Object.keys(body).length === 0) {
      setError("Isi dulu salah satu kolom di atas sebelum menyimpan.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${petugasToken}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setError(json?.error ?? "Gagal menyimpan data.");
      else {
        setNoHp("");
        setUmur("");
        setJk("");
        setPendidikan("");
        setPekerjaan("");
        setMotor("");
        setKendaraan("");
        await muat();
      }
    } catch {
      setError("Gagal menyimpan data. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#F3D9B5] bg-white p-4 shadow-sm">
      <h2 className={JUDUL_KARTU}>📝 Lengkapi Data Anda</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#44546C]">Beberapa data diri Anda di catatan kami masih kosong. Mohon dilengkapi.</p>

      {perluLokasi && (
        <div className="mt-3 rounded-[10px] bg-[#F6F8FB] p-3">
          <p className="text-xs font-bold text-[#33435C]">📍 Lokasi rumah Anda belum tercatat.</p>
          <p className="mt-1 text-[11px] text-[#55657D]">Dipakai untuk menghitung jarak ke wilayah tugas, supaya pembagian wilayah kerja antar petugas lebih adil.</p>
          <button
            type="button"
            onClick={tetapkanLokasi}
            disabled={lokasiBusy}
            className="mt-2 rounded-lg bg-[#0F3D7A] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0A2A55] disabled:opacity-50"
          >
            {lokasiBusy ? "Mendeteksi lokasi..." : "📍 Tetapkan Lokasi Rumah Saya"}
          </button>
          {lokasiPesan && <p className="mt-2 text-[11px] text-[#C0392B]">{lokasiPesan}</p>}
        </div>
      )}

      {perluForm && (
        <div className="mt-3 flex flex-col gap-3 rounded-[10px] bg-[#F6F8FB] p-3">
          {perluNoHp && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#33435C]">No HP / WhatsApp</span>
              <input type="tel" value={noHp} onChange={(e) => setNoHp(e.target.value)} placeholder="08xx-xxxx-xxxx" className={INPUT_TEKS} />
            </label>
          )}
          {perluUmur && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#33435C]">Umur</span>
              <input type="number" min={15} max={90} value={umur} onChange={(e) => setUmur(e.target.value)} placeholder="Umur (tahun)" className={INPUT_TEKS} />
            </label>
          )}
          {perluJk && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#33435C]">Jenis Kelamin</span>
              <div className="flex gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="radio" name="jk" checked={jk === "Lk"} onChange={() => setJk("Lk")} />
                  Laki-laki
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="radio" name="jk" checked={jk === "Pr"} onChange={() => setJk("Pr")} />
                  Perempuan
                </label>
              </div>
            </div>
          )}
          {perluPendidikan && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#33435C]">Pendidikan Terakhir</span>
              <select value={pendidikan} onChange={(e) => setPendidikan(e.target.value)} className={INPUT_TEKS}>
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
              <span className="font-bold text-[#33435C]">Pekerjaan</span>
              <select value={pekerjaan} onChange={(e) => setPekerjaan(e.target.value)} className={INPUT_TEKS}>
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
              <span className="font-bold text-[#33435C]">Bisa mengendarai sepeda motor?</span>
              <Radio2 nama="motor" nilai={motor} set={setMotor} />
            </div>
          )}
          {perluKendaraan && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#33435C]">Punya kendaraan bermotor sendiri?</span>
              <Radio2 nama="kendaraan" nilai={kendaraan} set={setKendaraan} />
            </div>
          )}
          <button
            type="button"
            onClick={simpan}
            disabled={busy}
            className="mt-1 self-start rounded-lg bg-[#0F3D7A] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0A2A55] disabled:opacity-50"
          >
            {busy ? "Menyimpan..." : "💾 Simpan Data"}
          </button>
          {error && <p className="text-[11px] text-[#C0392B]">{error}</p>}
        </div>
      )}
    </section>
  );
}
