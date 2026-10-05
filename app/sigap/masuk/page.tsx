"use client";

import { useEffect, useState } from "react";
import BrandBps from "@/app/components/BrandBps";

// (5 Okt 2026) Masuk petugas SIGAP Transport Lokal: nama + PIN akun undangan.
// Belum punya PIN -> verifikasi nama + NIK + email + tanggal lahir, lalu buat PIN di sini.
// Sesi = token petugas disimpan di localStorage (dicoba-tangkap) supaya HP tidak perlu login ulang.

const INPUT =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15px] text-[#13213A] outline-none transition focus:border-[#0F3D7A] focus:ring-4 focus:ring-[#0F3D7A]/10";
const KUNCI_SESI = "sigap_token"; // (5 Okt 2026) token akun SIGAP (bukan token petugas bencana lagi)

type StatusKolom = "benar" | "salah" | "belum_ada" | "belum_dicek";

export default function SigapMasuk() {
  const [mode, setMode] = useState<"masuk" | "daftar">("masuk");
  const [nama, setNama] = useState("");
  const [pin, setPin] = useState("");
  const [nik, setNik] = useState("");
  const [email, setEmail] = useState("");
  const [tgl, setTgl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kolom, setKolom] = useState<Record<string, StatusKolom> | null>(null);
  const [tokenDaftar, setTokenDaftar] = useState<string | null>(null);
  const [pinBaru, setPinBaru] = useState("");
  const [pinBaru2, setPinBaru2] = useState("");

  // (5 Okt 2026) Satu pintu: sesudah masuk diarahkan ke portal SIGAP (menu sesuai peran) atau ke ?lanjut=.
  function tujuan(): string {
    try {
      const l = new URLSearchParams(window.location.search).get("lanjut");
      if (l && l.startsWith("/sigap")) return l;
    } catch {
      /* abaikan */
    }
    return "/sigap";
  }

  useEffect(() => {
    try {
      const sampai = localStorage.getItem("sigap_sesi_sampai");
      if (localStorage.getItem("sigap_sesi") && sampai && Date.parse(sampai) > Date.now()) window.location.replace(tujuan());
    } catch {
      /* penyimpanan tidak tersedia */
    }
  }, []);

  function lanjut(token: string, sesi?: string, sampai?: string) {
    try {
      localStorage.setItem(KUNCI_SESI, token);
      if (sesi && sampai) {
        localStorage.setItem("sigap_sesi", sesi);
        localStorage.setItem("sigap_sesi_sampai", sampai);
      }
    } catch {
      /* abaikan */
    }
    window.location.replace(sesi ? tujuan() : `/sigap/translok/${token}`);
  }

  async function kirim(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sigap/masuk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      return { res, json };
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi internet.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    const r = await kirim({ aksi: "masuk", nama, pin });
    if (!r) return;
    if (r.json?.ok && r.json.token) return lanjut(r.json.token, r.json.sesi, r.json.sampai);
    setError(
      (r.json?.error as string) ?? "Gagal masuk." + (typeof r.json?.sisa_percobaan === "number" ? ` Sisa percobaan: ${r.json.sisa_percobaan}.` : "")
    );
  }

  async function verifikasi(e: React.FormEvent) {
    e.preventDefault();
    setKolom(null);
    const r = await kirim({ aksi: "verifikasi", nama, nik, email, tanggal_lahir: tgl });
    if (!r) return;
    if (r.json?.kolom) setKolom(r.json.kolom);
    if (r.json?.ok) {
      if (r.json.punya_pin) {
        setMode("masuk");
        setError("Data cocok dan Anda sudah punya PIN. Silakan masuk dengan nama + PIN.");
      } else setTokenDaftar(r.json.token as string);
    } else if (r.json?.error) setError(r.json.error as string);
    else if (r.json?.kolom) setError(`Ada data yang tidak cocok.${typeof r.json?.sisa_percobaan === "number" ? ` Sisa percobaan: ${r.json.sisa_percobaan}.` : ""}`);
  }

  async function buatPin(e: React.FormEvent) {
    e.preventDefault();
    if (pinBaru !== pinBaru2) return setError("Kedua PIN tidak sama.");
    const r = await kirim({ aksi: "buat_pin", token: tokenDaftar, pin: pinBaru });
    if (!r) return;
    if (r.json?.ok) return lanjut(tokenDaftar as string, r.json.sesi, r.json.sampai);
    setError((r.json?.error as string) ?? "Gagal membuat PIN.");
  }

  const labelKolom: Record<string, string> = { nama: "Nama", nik: "NIK", email: "Email", tanggal_lahir: "Tanggal lahir" };

  return (
    <main className="min-h-screen bg-[#EEF2F8] text-[#13213A]">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0F3D7A] via-[#123B70] to-[#1E2A47] px-5 pb-16 pt-6 text-white">
        <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
        <div aria-hidden className="absolute -bottom-24 right-10 h-48 w-48 rounded-full bg-[#F5B841]/10" />
        <div className="relative mx-auto max-w-md">
          <BrandBps className="text-blue-100" teksClassName="text-[11.5px] font-bold uppercase leading-tight tracking-wider" ukuran={28} kotakPutih />
          <p className="mt-6 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F5B841]">SIGAP · Masuk</p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight">Masuk ke SIGAP</h1>
          <p className="mt-1.5 text-[14px] text-blue-100">Petugas, admin anggaran, PJ kegiatan &amp; bendahara — satu pintu, menu sesuai peran</p>
        </div>
      </div>

      {/* (6 Okt 2026) relative z-10: tab "Sudah/Belum punya PIN" sebelumnya tertutup header -- laporan user */}
      <div className="relative z-10 mx-auto -mt-10 max-w-md space-y-3 px-4 pb-10">
        {!tokenDaftar && (
          <div className="flex rounded-2xl bg-white p-1 shadow-sm">
            {(["masuk", "daftar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setKolom(null);
                }}
                className={`flex-1 rounded-xl px-3 py-2.5 text-[14px] font-bold transition ${mode === m ? "bg-[#0F3D7A] text-white shadow" : "text-slate-600"}`}
              >
                {m === "masuk" ? "Sudah punya PIN" : "Belum punya PIN"}
              </button>
            ))}
          </div>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13.5px] font-medium text-red-800">{error}</p>}

        {tokenDaftar ? (
          <form onSubmit={buatPin} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-[16px] font-extrabold">Data terverifikasi ✓</p>
            <p className="text-[13.5px] text-slate-600">Buat PIN 4 angka. PIN ini dipakai setiap kali masuk SIGAP (dan undangan petugas).</p>
            <input className={INPUT} inputMode="numeric" maxLength={4} value={pinBaru} onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, ""))} placeholder="PIN baru (4 angka)" required />
            <input className={INPUT} inputMode="numeric" maxLength={4} value={pinBaru2} onChange={(e) => setPinBaru2(e.target.value.replace(/\D/g, ""))} placeholder="Ulangi PIN" required />
            <button disabled={busy} className="w-full rounded-xl bg-[#1E7A4C] py-3.5 text-[15px] font-extrabold text-white shadow disabled:opacity-60">
              {busy ? "Menyimpan…" : "Simpan PIN & Masuk"}
            </button>
          </form>
        ) : mode === "masuk" ? (
          <form onSubmit={masuk} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">Nama lengkap</label>
              <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Sesuai data petugas" autoComplete="name" required />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">PIN</label>
              <input className={`${INPUT} tracking-[0.5em]`} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" required />
            </div>
            <button disabled={busy} className="w-full rounded-xl bg-[#0F3D7A] py-3.5 text-[15px] font-extrabold text-white shadow disabled:opacity-60">
              {busy ? "Memeriksa…" : "Masuk"}
            </button>
            <p className="text-center text-[12px] text-slate-500">Lupa PIN? Hubungi admin anggaran BPS Kabupaten Solok.</p>
          </form>
        ) : (
          <form onSubmit={verifikasi} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-[13.5px] text-slate-600">Isi data diri untuk memastikan yang masuk adalah Anda sendiri, lalu buat PIN.</p>
            <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama lengkap" required />
            <input className={INPUT} inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))} placeholder="NIK (16 digit)" required />
            <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-700">Tanggal lahir</label>
              <input className={INPUT} type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} required />
            </div>
            {kolom && (
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(kolom).map(([k, s]) => (
                  <span
                    key={k}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
                      s === "benar" ? "bg-emerald-50 text-emerald-800" : s === "salah" ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    {s === "benar" ? "✓" : s === "salah" ? "✕" : "–"} {labelKolom[k] ?? k}
                  </span>
                ))}
              </div>
            )}
            <button disabled={busy} className="w-full rounded-xl bg-[#0F3D7A] py-3.5 text-[15px] font-extrabold text-white shadow disabled:opacity-60">
              {busy ? "Memeriksa…" : "Verifikasi"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
