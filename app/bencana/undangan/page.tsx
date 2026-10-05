"use client";

import { useState } from "react";
import BrandBps from "@/app/components/BrandBps";
import DaftarLengkapiForm from "./DaftarLengkapiForm";

// ------------------------------------------------------------------------
// (4 Okt 2026) Halaman publik "Undangan Konfirmasi Bersama" -- 1 link untuk
// WA grup, TANPA login. Dua cara masuk:
//   1) Pertama kali  : verifikasi NAMA + NIK + EMAIL + TANGGAL LAHIR. Hasil
//      ditampilkan per kolom (benar / salah / belum ada data pembanding) supaya
//      petugas tahu persis kolom mana yang keliru.
//   2) Sudah punya akun : NAMA + PIN 4 digit.
// Lolos -> diarahkan ke halaman konfirmasi biasa atau tawaran menginap
// (ditentukan server). Salah 5x -> terkunci 30 menit.
// ------------------------------------------------------------------------

type StatusKolom = "benar" | "salah" | "belum_ada" | "belum_dicek";
type Kolom = Record<"nama" | "nik" | "email" | "tanggal_lahir", StatusKolom>;

const KARTU = "rounded-[14px] bg-white p-4 shadow-sm";
const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[15px] text-[#13213A] outline-none focus:border-[#0F3D7A] focus:ring-2 focus:ring-[#0F3D7A]/20";

const LABEL_KOLOM: Record<keyof Kolom, string> = {
  nama: "Nama",
  nik: "NIK",
  email: "Email",
  tanggal_lahir: "Tanggal lahir",
};

function BarisStatus({ label, status }: { label: string; status: StatusKolom }) {
  const gaya: Record<StatusKolom, { kotak: string; teks: string; ikon: string }> = {
    benar: { kotak: "border-emerald-300 bg-emerald-50", teks: "Benar", ikon: "✓" },
    salah: { kotak: "border-red-300 bg-red-50", teks: "Salah, periksa kembali", ikon: "✕" },
    belum_ada: { kotak: "border-slate-300 bg-slate-50", teks: "Belum ada data pembanding, isian Anda disimpan", ikon: "–" },
    belum_dicek: { kotak: "border-slate-200 bg-slate-50", teks: "Belum diperiksa", ikon: "·" },
  };
  const g = gaya[status];
  const warnaIkon = status === "benar" ? "bg-emerald-600" : status === "salah" ? "bg-red-600" : "bg-slate-400";
  const warnaTeks = status === "benar" ? "text-emerald-800" : status === "salah" ? "text-red-800" : "text-slate-600";
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${g.kotak}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${warnaIkon}`}>
        {g.ikon}
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-bold text-[#13213A]">{label}</div>
        <div className={`text-[13px] ${warnaTeks}`}>{g.teks}</div>
      </div>
    </div>
  );
}

function formatWaktu(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function UndanganPage() {
  const [mode, setMode] = useState<"verifikasi" | "masuk">("verifikasi");
  const [nama, setNama] = useState("");
  const [nik, setNik] = useState("");
  const [email, setEmail] = useState("");
  const [tgl, setTgl] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kolom, setKolom] = useState<Kolom | null>(null);
  const [sisa, setSisa] = useState<number | null>(null);
  const [terkunciSampai, setTerkunciSampai] = useState<string | null>(null);
  // (5 Okt 2026) pesan = pesan pembatalan plotting dari server (mis. PPL NTP), ditampilkan kotak merah.
  const [berhasil, setBerhasil] = useState<{ nama: string; path: string | null; pesan?: string | null } | null>(null);
  // true begitu lolos verifikasi & sedang berpindah halaman: tombol TETAP terkunci
  // supaya petugas tidak menekan "Buka Undangan" lagi selagi halaman tujuan dimuat.
  const [pindah, setPindah] = useState(false);
  // (4 Okt 2026) Formulir "Daftar / Lengkapi Data" di bawah kartu login.
  const [bukaDaftar, setBukaDaftar] = useState(false);
  // Lolos verifikasi tetapi data belum lengkap: ditahan di sini supaya formulir Lengkapi Data tampil dulu.
  const [lengkapi, setLengkapi] = useState<{ nama: string; path: string | null; petugasId: number | null } | null>(null);

  function reset() {
    setError(null);
    setKolom(null);
    setSisa(null);
    setTerkunciSampai(null);
  }

  function selesai(json: { nama: string; path: string | null; pesan?: string | null }) {
    if (json.pesan) {
      setBerhasil({ nama: json.nama, path: null, pesan: json.pesan });
    } else if (json.path) {
      setBerhasil({ nama: json.nama, path: json.path });
      setPindah(true);
      window.location.replace(json.path);
    } else {
      setBerhasil({ nama: json.nama, path: null });
    }
  }

  async function kirimVerifikasi(e: React.FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      const res = await fetch("/api/bencana/undangan/verifikasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, nik, email, tanggal_lahir: tgl }),
      });
      const json = await res.json();
      if (json?.kolom) setKolom(json.kolom as Kolom);
      if (typeof json?.sisa_percobaan === "number") setSisa(json.sisa_percobaan);
      if (json?.terkunci_sampai) setTerkunciSampai(json.terkunci_sampai as string);
      if (json?.ok && json.perlu_lengkapi) {
        setLengkapi({ nama: json.nama as string, path: (json.path as string | null) ?? null, petugasId: typeof json.petugas_id === "number" ? json.petugas_id : null });
        setBukaDaftar(true);
      } else if (json?.ok) {
        selesai(json);
      } else if (json?.error) {
        setError(json.error as string);
      } else if (res.status === 429) {
        setError("Terlalu banyak percobaan yang salah.");
      }
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  async function kirimMasuk(e: React.FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      const res = await fetch("/api/bencana/undangan/masuk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, pin }),
      });
      const json = await res.json();
      if (typeof json?.sisa_percobaan === "number") setSisa(json.sisa_percobaan);
      if (json?.terkunci_sampai) setTerkunciSampai(json.terkunci_sampai as string);
      if (json?.ok) selesai(json);
      else setError((json?.error as string) ?? "Gagal masuk.");
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  const adaSalah = kolom ? Object.values(kolom).includes("salah") : false;

  return (
    <div className="min-h-screen bg-[#EEF2F8]">
      {pindah && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#EEF2F8]/95 px-6 text-center">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#0F3D7A]/20 border-t-[#0F3D7A]" />
          <p className="text-[16px] font-extrabold text-[#13213A]">Data terverifikasi{berhasil ? `, ${berhasil.nama}` : ""}</p>
          <p className="text-[14px] text-slate-600">Membuka undangan Anda…</p>
        </div>
      )}
      <div className="bg-[#0F3D7A] px-4 pb-6 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <BrandBps className="text-blue-200" teksClassName="text-[12px] font-bold uppercase leading-tight tracking-wider" ukuran={30} kotakPutih />
          <h1 className="mt-1 text-[22px] font-extrabold leading-tight">Undangan Konfirmasi Petugas Pendataan Bencana</h1>
          <p className="mt-1 text-[14px] text-blue-100">
            Masukkan data diri Anda untuk membuka undangan. Data ini hanya dipakai untuk memastikan bahwa yang membuka adalah Anda sendiri.
          </p>
        </div>
      </div>

      <div className="mx-auto -mt-3 max-w-md space-y-3 px-4 pb-10">
        <div className="flex rounded-xl bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setMode("verifikasi");
              reset();
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-[14px] font-bold ${mode === "verifikasi" ? "bg-[#0F3D7A] text-white" : "text-slate-600"}`}
          >
            Pertama kali
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("masuk");
              reset();
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-[14px] font-bold ${mode === "masuk" ? "bg-[#0F3D7A] text-white" : "text-slate-600"}`}
          >
            Sudah punya akun
          </button>
        </div>

        {berhasil && berhasil.pesan && (
          <div className={`${KARTU} border-2 border-red-300 bg-red-50`}>
            <div className="text-[16px] font-extrabold text-red-800">Halo, {berhasil.nama}</div>
            <p className="mt-1 text-[15px] font-semibold leading-relaxed text-red-900">{berhasil.pesan}</p>
          </div>
        )}

        {berhasil && !berhasil.path && !berhasil.pesan && (
          <div className={`${KARTU} border border-amber-300`}>
            <div className="text-[16px] font-extrabold text-[#13213A]">Halo, {berhasil.nama}</div>
            <p className="mt-1 text-[14px] text-slate-700">
              Data Anda sudah terverifikasi, tetapi saat ini belum ada undangan atau penempatan yang perlu Anda konfirmasi. Silakan tunggu informasi dari admin.
            </p>
          </div>
        )}

        {mode === "verifikasi" ? (
          <form onSubmit={kirimVerifikasi} className={`${KARTU} space-y-3`}>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">Nama lengkap</label>
              <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Sesuai data pendaftaran" autoComplete="off" required />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">NIK (16 digit)</label>
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
              <label className="mb-1 block text-[13px] font-bold text-slate-700">Alamat email</label>
              <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email yang didaftarkan" autoComplete="off" required />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">Tanggal lahir</label>
              <input className={INPUT} type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} required />
            </div>
            <button
              type="submit"
              disabled={busy || pindah}
              className="w-full rounded-lg bg-[#0F3D7A] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-60"
            >
              {pindah ? "Membuka undangan…" : busy ? "Memeriksa…" : "Buka Undangan"}
            </button>
          </form>
        ) : (
          <form onSubmit={kirimMasuk} className={`${KARTU} space-y-3`}>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">Nama lengkap</label>
              <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama saat membuat akun" autoComplete="off" required />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">PIN (4 digit)</label>
              <input
                className={INPUT}
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder="••••"
                autoComplete="off"
                required
              />
            </div>
            <button
              type="submit"
              disabled={busy || pindah}
              className="w-full rounded-lg bg-[#0F3D7A] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-60"
            >
              {pindah ? "Membuka undangan…" : busy ? "Memeriksa…" : "Masuk"}
            </button>
            <p className="text-[12px] text-slate-500">Lupa PIN? Hubungi admin BPS Kabupaten Solok.</p>
          </form>
        )}

        {!bukaDaftar ? (
          <button
            type="button"
            onClick={() => setBukaDaftar(true)}
            className="flex w-full items-center justify-between rounded-[14px] border border-dashed border-[#0F3D7A]/40 bg-white px-4 py-3 text-left shadow-sm"
          >
            <span>
              <span className="block text-[14px] font-extrabold text-[#0F3D7A]">Data belum lengkap?</span>
              <span className="block text-[12px] text-slate-600">Lengkapi Data (pilih nama, lokasi rumah, dll.)</span>
            </span>
            <span className="text-[18px] font-extrabold text-[#0F3D7A]">→</span>
          </button>
        ) : (
          <DaftarLengkapiForm
            pilihanAwal={lengkapi?.petugasId ? `p:${lengkapi.petugasId}` : ""}
            nikAwal={lengkapi ? nik : ""}
            emailAwal={lengkapi ? email : ""}
            tglAwal={lengkapi ? tgl : ""}
            pesan={
              lengkapi
                ? "Identitas Anda terverifikasi, tetapi ada data untuk analisis wilayah tugas yang belum lengkap (misalnya lokasi rumah). Mohon dilengkapi dulu; Anda juga bisa melewatinya."
                : undefined
            }
            onSelesai={selesai}
            onTutup={() => {
              setBukaDaftar(false);
              setLengkapi(null);
            }}
            onLewati={lengkapi ? () => selesai({ nama: lengkapi.nama, path: lengkapi.path }) : undefined}
          />
        )}

        {kolom && (
          <div className={`${KARTU} space-y-2`}>
            <div className="text-[15px] font-extrabold text-[#13213A]">
              {adaSalah ? "Ada data yang belum cocok" : "Data terverifikasi"}
            </div>
            {(Object.keys(LABEL_KOLOM) as (keyof Kolom)[]).map((k) => (
              <BarisStatus key={k} label={LABEL_KOLOM[k]} status={kolom[k]} />
            ))}
            {kolom.nama === "salah" && !bukaDaftar && (
              <p className="pt-1 text-[13px] text-slate-700">
                Nama tidak ditemukan? Gunakan tombol <b>“Data belum lengkap? Lengkapi Data”</b> di bawah, lalu pilih nama Anda dari daftar.
              </p>
            )}
            {adaSalah && sisa !== null && (
              <p className="pt-1 text-[13px] text-slate-700">
                Perbaiki kolom yang bertanda merah lalu coba lagi. Sisa percobaan:{" "}
                <b className={sisa <= 1 ? "text-red-700" : ""}>{sisa}</b>. Jika salah terus, akses dikunci sementara.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-[14px] border border-red-300 bg-red-50 p-3 text-[14px] text-red-800">
            {error}
            {terkunciSampai && (
              <div className="mt-1 text-[13px]">Dapat dicoba lagi sekitar pukul {formatWaktu(terkunciSampai)}.</div>
            )}
            {!terkunciSampai && sisa !== null && mode === "masuk" && (
              <div className="mt-1 text-[13px]">Sisa percobaan: {sisa}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
