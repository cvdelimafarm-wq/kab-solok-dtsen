"use client";

// (7 Okt 2026) Portal satu login -- form masuk tunggal (permintaan user: "buat portal login hanya 1 saja di depan").
//  - Nama lengkap + PIN 4 digit  -> akun SIGAP (pegawai, mitra, petugas bencana/penyisiran).
//  - Nomor HP + PIN 6 digit      -> operator Wali Nagari (Usulan DTSEN, akun Supabase lama) di form yg sama.

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { emailFromPhone, normalizePhone } from "@/lib/phone";
import { simpanSesi, tujuanLanjut } from "./sesi";

const INPUT = "h-12 w-full rounded-lg border border-[#CDD5DE] bg-white px-3.5 text-[15px] text-[#14202E] outline-none transition focus:border-[#1F6FD1] focus:ring-4 focus:ring-[#1F6FD1]/10";

function tampakNomorHp(s: string): boolean {
  return /^[0-9+\-\s]{9,}$/.test(s.trim());
}

export default function Masuk({ onMasuk }: { onMasuk: () => void }) {
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeHp = tampakNomorHp(id);
  // (7 Okt 2026) Masuk dgn PIN sementara (hasil reset admin): wajib membuat PIN baru sebelum sesi disimpan.
  const [ganti, setGanti] = useState<{ sesi: string; sampai: string; token: string } | null>(null);
  const [pinBaru, setPinBaru] = useState("");
  const [pinBaru2, setPinBaru2] = useState("");

  function selesai(x: { sesi: string; sampai: string; token: string }) {
    simpanSesi(x);
    const lanjut = tujuanLanjut();
    // /dashboard (DTSEN) butuh login nomor HP -> jangan diteruskan dari sesi nama + PIN.
    if (lanjut && lanjut !== "/" && !lanjut.startsWith("/dashboard")) window.location.replace(lanjut);
    else onMasuk();
  }

  async function simpanPinBaru(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pinBaru)) return setError("PIN baru harus 4 digit angka.");
    if (pinBaru === pin) return setError("PIN baru harus berbeda dari PIN sementara.");
    if (pinBaru !== pinBaru2) return setError("Kedua PIN baru tidak sama.");
    if (!ganti) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sigap/masuk", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ganti.sesi}` }, body: JSON.stringify({ aksi: "ganti_pin", pin_lama: pin, pin: pinBaru }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) return setError(j.error ?? "Gagal menyimpan PIN baru.");
      selesai(ganti);
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!id.trim()) return setError("Isi nama lengkap atau nomor HP.");
    setBusy(true);
    try {
      if (modeHp) {
        // Operator Wali Nagari (DTSEN): akun Supabase, PIN 6 digit.
        const supabase = createClient();
        const { error: err } = await supabase.auth.signInWithPassword({ email: emailFromPhone(normalizePhone(id)), password: pin });
        if (err) return setError("Nomor HP atau PIN salah. Coba lagi.");
        const { data: auth } = await supabase.auth.getUser();
        const { data: profil } = auth.user ? await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle() : { data: null };
        window.location.replace(tujuanLanjut() ?? (profil?.role === "operator_nagari" ? "/dashboard" : "/"));
        return;
      }
      if (!/^\d{4}$/.test(pin)) return setError("PIN harus 4 digit angka.");
      const res = await fetch("/api/sigap/masuk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "masuk", nama: id.trim(), pin }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok || !j.sesi) {
        const sisa = typeof j.sisa_percobaan === "number" ? ` Sisa percobaan: ${j.sisa_percobaan}.` : "";
        return setError((j.error ?? "Gagal masuk.") + sisa);
      }
      if (j.ganti_pin) {
        setGanti({ sesi: j.sesi, sampai: j.sampai, token: j.token });
        return;
      }
      selesai({ sesi: j.sesi, sampai: j.sampai, token: j.token });
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-wrap bg-[#F3F5F8] text-[#14202E]">
      <section className="flex flex-[1_1_520px] flex-col justify-between gap-10 bg-[#0E2A47] px-8 py-10 text-white sm:px-16 sm:py-14">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 grid-cols-2 gap-[3px] rounded-[10px] bg-white p-[9px]">
            <span className="rounded-sm bg-[#2D7DD2]" />
            <span className="rounded-sm bg-[#5BB04B]" />
            <span className="rounded-sm bg-[#F29D1F]" />
            <span className="rounded-sm bg-[#2D7DD2] opacity-50" />
          </div>
          <div className="text-[15px] font-bold italic leading-tight tracking-wide">
            BADAN PUSAT STATISTIK
            <br />
            KABUPATEN SOLOK
          </div>
        </div>
        <div className="max-w-[460px]">
          <p className="mb-2.5 text-[13px] font-semibold tracking-[0.14em] text-[#D9971F]">PORTAL KERJA</p>
          <h1 className="text-[30px] font-bold leading-tight sm:text-[38px]">Satu akun untuk semua aplikasi kerja</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#C9D6E6]">
            Masuk sekali. Menu yang tampil mengikuti peran Anda dan periode kegiatan yang sedang berjalan — transport lokal, pendataan bencana, penyisiran, DTSEN, SIGAP, dan lainnya.
          </p>
        </div>
        <ul className="hidden flex-col gap-2.5 text-[13.5px] text-[#C9D6E6] sm:flex">
          <li className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-[#3DBB98]" />Petugas &amp; mitra: menu tugas aktif + arsip SPJ</li>
          <li className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-[#5C9DEB]" />Pegawai: SIGAP PEDIA, kegiatan tim, administrasi</li>
          <li className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-[#D9971F]" />Admin: pengelolaan sesuai aplikasi yang dipegang</li>
        </ul>
      </section>

      <section className="flex flex-[1_1_420px] items-center justify-center px-4 py-12">
        {ganti ? (
          <form onSubmit={simpanPinBaru} className="flex w-full max-w-[400px] flex-col gap-[18px] rounded-[14px] border border-[#E3E8EE] bg-white p-8">
            <div>
              <h2 className="text-[22px] font-bold">Buat PIN baru</h2>
              <p className="mt-1 text-[13.5px] text-[#4D5B6B]">Anda masuk dengan PIN sementara. Buat PIN 4 digit milik Anda sendiri untuk melanjutkan.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin-baru" className="text-[13px] font-semibold text-[#4D5B6B]">PIN baru</label>
              <input id="pin-baru" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} className={`${INPUT} text-[18px] tracking-[0.4em]`} value={pinBaru} onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin-baru2" className="text-[13px] font-semibold text-[#4D5B6B]">Ulangi PIN baru</label>
              <input id="pin-baru2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} className={`${INPUT} text-[18px] tracking-[0.4em]`} value={pinBaru2} onChange={(e) => setPinBaru2(e.target.value.replace(/\D/g, ""))} />
            </div>
            {error && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]">{error}</p>}
            <button type="submit" disabled={busy} className="h-12 rounded-lg bg-[#1E7A4C] text-[15px] font-semibold text-white transition hover:bg-[#17623C] disabled:opacity-60">
              {busy ? "Menyimpan..." : "Simpan PIN & Masuk"}
            </button>
          </form>
        ) : (
        <form onSubmit={kirim} className="flex w-full max-w-[400px] flex-col gap-[18px] rounded-[14px] border border-[#E3E8EE] bg-white p-8">
          <div>
            <h2 className="text-[22px] font-bold">Masuk</h2>
            <p className="mt-1 text-[13.5px] text-[#4D5B6B]">Gunakan nama lengkap dan PIN 4 digit Anda.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="id-masuk" className="text-[13px] font-semibold text-[#4D5B6B]">Nama lengkap</label>
            <input id="id-masuk" className={INPUT} value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" placeholder="Nama sesuai daftar petugas/pegawai" />
            <span className="text-xs text-[#7B8794]">
              {modeHp ? "Terbaca sebagai nomor HP — masuk sebagai operator Wali Nagari (PIN 6 digit)." : "Operator Wali Nagari: ketik nomor HP di kolom ini."}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin-masuk" className="text-[13px] font-semibold text-[#4D5B6B]">PIN</label>
            <input
              id="pin-masuk"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={modeHp ? 6 : 4}
              className={`${INPUT} text-[18px] tracking-[0.4em]`}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {error && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]">{error}</p>}
          <button type="submit" disabled={busy} className="h-12 rounded-lg bg-[#1F6FD1] text-[15px] font-semibold text-white transition hover:bg-[#1A5DB0] disabled:opacity-60">
            {busy ? "Memproses..." : "Masuk"}
          </button>
          <div className="flex justify-between text-[13px]">
            <Link href={modeHp ? "/atur-pin" : "/sigap/masuk?mode=daftar"} className="text-[#1F6FD1] hover:text-[#1A5DB0]">Belum punya PIN? Buat PIN</Link>
            {modeHp ? (
              <span className="text-[#7B8794]" title="PIN operator Wali Nagari direset oleh admin">Lupa PIN? Hubungi admin</span>
            ) : (
              <Link href="/sigap/masuk?mode=lupa" className="text-[#1F6FD1] hover:text-[#1A5DB0]">Lupa PIN?</Link>
            )}
          </div>
          <p className="border-t border-[#E3E8EE] pt-3.5 text-xs leading-relaxed text-[#7B8794]">
            Operator Wali Nagari (Usulan DTSEN) masuk di sini dengan nomor HP. Tautan undangan lama (bencana, penyisiran) masih berlaku selama masa transisi.
          </p>
        </form>
        )}
      </section>
    </div>
  );
}
