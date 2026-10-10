"use client";

// (7 Okt 2026) Portal satu login -- form masuk tunggal (permintaan user: "buat portal login hanya 1 saja di depan").
//  - Nama lengkap + PIN 4 digit  -> akun SIGAP (pegawai, mitra, petugas bencana/penyisiran).
//  - Nomor HP + PIN 6 digit      -> operator Wali Nagari (Usulan DTSEN, akun Supabase lama) di form yg sama.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { emailFromPhone, normalizePhone } from "@/lib/phone";
import { MIN_HURUF_CARI, pesanGalatMasuk, type Saran } from "@/lib/sigapMasukNama";
import GantiPinCepat from "./GantiPinCepat";
import PilihSebagai, { type HasilSebagai } from "./PilihSebagai";
import { hapusLihatSebagai, mulaiLihatSebagai, simpanSesi, tujuanLanjut } from "./sesi";

const INPUT = "h-12 w-full rounded-lg border border-[#CDD5DE] bg-white px-3.5 text-[15px] text-[#14202E] outline-none transition focus:border-[#1F5FD1] focus:ring-4 focus:ring-[#1F5FD1]/10";

function tampakNomorHp(s: string): boolean {
  return /^[0-9+\-\s]{9,}$/.test(s.trim());
}

/** Tebalkan bagian nama yang cocok dengan teks yang diketik. */
function Sorot({ nama, q }: { nama: string; q: string }) {
  const k = q.trim().toLowerCase();
  const i = k ? nama.toLowerCase().indexOf(k) : -1;
  if (i < 0) return <>{nama}</>;
  return (
    <>
      {nama.slice(0, i)}
      <mark className="rounded-sm bg-[#FFE680] px-0.5 text-inherit">{nama.slice(i, i + k.length)}</mark>
      {nama.slice(i + k.length)}
    </>
  );
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
  // (8 Okt 2026) Saran nama saat mengetik (typeahead): memilih saran = masuk ke akun itu (akun_id), bukan mencocokkan teks.
  const [pilih, setPilih] = useState<{ id: number; nama: string } | null>(null);
  const [saran, setSaran] = useState<Saran[]>([]);
  const [bukaSaran, setBukaSaran] = useState(false);
  const [aktifIdx, setAktifIdx] = useState(-1);
  const [mencari, setMencari] = useState(false);
  const [selesaiCari, setSelesaiCari] = useState<string | null>(null); // teks yang hasilnya sudah tampil
  // (8 Okt 2026) Masuk dengan PIN awal 1303: tawarkan ganti PIN cepat sebelum masuk ke beranda.
  const [awal, setAwal] = useState<{ sesi: string; sampai: string; token: string } | null>(null);
  // (10 Okt 2026) Akun super (M. Iqbal Hadi): sesudah PIN benar, tanya "masuk sebagai siapa" (uji tampilan PPL/PML).
  const [sebagai, setSebagai] = useState<{ sesi: string; sampai: string; token: string; nama: string } | null>(null);
  const refPin = useRef<HTMLInputElement>(null);
  const refNama = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = id.trim();
    if (pilih || modeHp || q.replace(/[^A-Za-z0-9]/g, "").length < MIN_HURUF_CARI) {
      setSaran([]);
      setBukaSaran(false);
      setMencari(false);
      setSelesaiCari(null);
      return;
    }
    const ctrl = new AbortController();
    setMencari(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/sigap/masuk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "cari_nama", q }), signal: ctrl.signal });
        const j = await res.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        setSaran(res.ok && Array.isArray(j.saran) ? j.saran : []);
        setSelesaiCari(res.ok ? q : null);
        setAktifIdx(-1);
        setBukaSaran(res.ok);
      } catch {
        /* dibatalkan / offline: abaikan, galat tampil saat menekan Masuk */
      } finally {
        if (!ctrl.signal.aborted) setMencari(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [id, pilih, modeHp]);

  function ambil(s: Saran) {
    setPilih({ id: s.id, nama: s.nama });
    setId(s.nama);
    setBukaSaran(false);
    setSaran([]);
    setError(null);
    setTimeout(() => refPin.current?.focus(), 0);
  }

  function gantiNama() {
    setPilih(null);
    setId("");
    setError(null);
    setTimeout(() => refNama.current?.focus(), 0);
  }

  function selesai(x: { sesi: string; sampai: string; token: string }) {
    hapusLihatSebagai(); // (11 Okt 2026) login biasa: buang sisa mode "masuk sebagai" (sesi asli lama, spanduk)
    simpanSesi(x);
    const lanjut = tujuanLanjut();
    // /dashboard (DTSEN) butuh login nomor HP -> jangan diteruskan dari sesi nama + PIN.
    if (lanjut && lanjut !== "/" && !lanjut.startsWith("/dashboard")) window.location.replace(lanjut);
    else onMasuk();
  }

  function pilihSebagai(asli: { sesi: string; sampai: string; token: string }, h: HasilSebagai) {
    if (h.sendiri) return selesai(asli); // akun sendiri: alur masuk biasa
    hapusLihatSebagai(); // (11 Okt 2026) login baru akun super: sesi asli yang tersimpan diganti dengan sesi yang baru ini
    mulaiLihatSebagai(asli, { sesi: h.sesi, sampai: h.sampai, token: h.token, id: h.id, nama: h.nama, aktor: h.aktor });
    window.location.replace("/"); // muat ulang penuh supaya semua tampilan memakai akun yang dipilih
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
    if (!id.trim()) return setError(pesanGalatMasuk("nama_kosong"));
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
      if (!/^\d{4}$/.test(pin)) return setError(pin.length === 0 ? "PIN belum diisi. Ketik 4 digit PIN Anda." : `PIN harus 4 digit angka (baru ${pin.length} digit).`);
      const res = await fetch("/api/sigap/masuk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "masuk", nama: pilih ? pilih.nama : id.trim(), akun_id: pilih?.id, pin }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok || !j.sesi) {
        if (j.kode === "nama_ambigu" && Array.isArray(j.saran)) {
          setSaran(j.saran);
          setSelesaiCari(id.trim());
          setAktifIdx(-1);
          setBukaSaran(true);
          refNama.current?.focus();
        }
        return setError(j.error ?? `Gagal masuk (kode ${res.status}). Server sedang bermasalah, coba lagi sebentar lagi.`);
      }
      if (j.ganti_pin) {
        setGanti({ sesi: j.sesi, sampai: j.sampai, token: j.token });
        return;
      }
      if (j.super) {
        setSebagai({ sesi: j.sesi, sampai: j.sampai, token: j.token, nama: typeof j.nama === "string" ? j.nama : "Akun saya" });
        return;
      }
      if (j.saran_ganti_pin) {
        setAwal({ sesi: j.sesi, sampai: j.sampai, token: j.token });
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
      <section className="flex flex-[1_1_520px] flex-col justify-between gap-10 bg-gradient-to-b from-[#1A4590] to-[#0F2A52] px-8 py-10 text-white sm:px-16 sm:py-14">
        <div className="flex items-center gap-3.5">
          {/* logo selalu di atas latar putih (ubin putih di atas latar biru) */}
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sigap-logo.png" alt="Logo SIGAP" width={48} height={46} className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <div className="text-[22px] font-extrabold tracking-wide">SIGAP</div>
            <div className="text-[12.5px] text-[#C9D6E6]">Sistem Integrasi Kegiatan BPS</div>
            <div className="text-[11px] italic text-[#9FB4CF]">BPS Kabupaten Solok</div>
          </div>
        </div>
        <div className="max-w-[460px]">
          <p className="mb-2.5 text-[13px] font-semibold tracking-[0.14em] text-[#F4B400]">PORTAL KERJA</p>
          <h1 className="text-[30px] font-bold leading-tight sm:text-[38px]">Satu akun untuk semua kegiatan BPS</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#C9D6E6]">
            Masuk sekali. Menu yang tampil mengikuti peran Anda dan periode kegiatan yang sedang berjalan — transport lokal, pendataan bencana, penyisiran, DTSEN, SIGAP, dan lainnya.
          </p>
        </div>
        <ul className="hidden flex-col gap-2.5 text-[13.5px] text-[#C9D6E6] sm:flex">
          <li className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-[#3DBB98]" />Petugas &amp; mitra: menu tugas aktif + arsip SPJ</li>
          <li className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-[#5C9DEB]" />Pegawai: SIGAP PEDIA, kegiatan tim, administrasi</li>
          <li className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-[#F4B400]" />Admin: pengelolaan sesuai aplikasi yang dipegang</li>
        </ul>
      </section>

      <section className="flex flex-[1_1_420px] items-center justify-center px-4 py-12">
        {sebagai ? (
          <PilihSebagai sesi={sebagai.sesi} namaSaya={sebagai.nama} onPilih={(h) => pilihSebagai({ sesi: sebagai.sesi, sampai: sebagai.sampai, token: sebagai.token }, h)} />
        ) : awal ? (
          <GantiPinCepat sesi={awal.sesi} onSelesai={() => selesai(awal)} onNanti={() => selesai(awal)} />
        ) : ganti ? (
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
            <p className="mt-1 text-[13.5px] text-[#4D5B6B]">Ketik nama Anda, pilih dari saran, lalu isi PIN 4 digit.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="id-masuk" className="text-[13px] font-semibold text-[#4D5B6B]">Nama lengkap</label>
            {pilih ? (
              <div className="flex h-12 items-center gap-2 rounded-lg border border-[#BFE3D0] bg-[#E6F4EC] px-3.5 text-[15px] font-semibold text-[#17623C]">
                <span aria-hidden>✓</span>
                <span className="min-w-0 flex-1 truncate">{pilih.nama}</span>
                <button type="button" onClick={gantiNama} className="text-[13px] font-bold underline underline-offset-2">Ganti</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={refNama}
                  id="id-masuk"
                  className={INPUT}
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (!bukaSaran || saran.length === 0) return;
                    if (e.key === "ArrowDown") {
                      setAktifIdx((i) => (i + 1) % saran.length);
                      e.preventDefault();
                    } else if (e.key === "ArrowUp") {
                      setAktifIdx((i) => (i - 1 + saran.length) % saran.length);
                      e.preventDefault();
                    } else if (e.key === "Enter" && aktifIdx >= 0) {
                      ambil(saran[aktifIdx]);
                      e.preventDefault();
                    } else if (e.key === "Escape") {
                      setBukaSaran(false);
                    }
                  }}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={bukaSaran}
                  aria-controls="daftar-saran-nama"
                  aria-autocomplete="list"
                  placeholder="Ketik 3 huruf nama Anda, lalu pilih"
                />
                {bukaSaran && !modeHp && (
                  <div id="daftar-saran-nama" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-[#CDD5DE] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                    {saran.length === 0 ? (
                      <p className="px-3.5 py-3 text-[13px] text-[#7B8794]">Tidak ada nama yang cocok. Periksa ejaan, atau coba ketik bagian lain dari nama Anda.</p>
                    ) : (
                      saran.map((x, i) => (
                        <button
                          key={x.id}
                          type="button"
                          role="option"
                          aria-selected={i === aktifIdx}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => ambil(x)}
                          className={`block w-full border-b border-[#F0F3F7] px-3.5 py-2.5 text-left text-[14.5px] last:border-b-0 hover:bg-[#F3F8FF] ${i === aktifIdx ? "bg-[#F3F8FF]" : "bg-white"}`}
                        >
                          <Sorot nama={x.nama} q={selesaiCari ?? id} />
                          <small className="block text-[11.5px] text-[#7B8794]">{x.ket}</small>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <span className="text-xs text-[#7B8794]">
              {modeHp
                ? "Terbaca sebagai nomor HP — masuk sebagai operator Wali Nagari (PIN 6 digit)."
                : pilih
                  ? "Nama dipilih dari daftar. Ketuk \"Ganti\" bila bukan Anda."
                  : mencari
                    ? "Mencari nama…"
                    : "Operator Wali Nagari: ketik nomor HP di kolom ini."}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin-masuk" className="text-[13px] font-semibold text-[#4D5B6B]">PIN</label>
            <input
              ref={refPin}
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
          <button type="submit" disabled={busy} className="h-12 rounded-lg bg-[#1F5FD1] text-[15px] font-semibold text-white transition hover:bg-[#1A50B5] disabled:opacity-60">
            {busy ? "Memproses..." : "Masuk"}
          </button>
          <div className="flex justify-between text-[13px]">
            <Link href={modeHp ? "/atur-pin" : "/sigap/masuk?mode=daftar"} className="text-[#1F5FD1] hover:text-[#1A50B5]">Belum punya PIN? Buat PIN</Link>
            {modeHp ? (
              <span className="text-[#7B8794]" title="PIN operator Wali Nagari direset oleh admin">Lupa PIN? Hubungi admin</span>
            ) : (
              <Link href="/sigap/masuk?mode=lupa" className="text-[#1F5FD1] hover:text-[#1A50B5]">Lupa PIN?</Link>
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
