"use client";

// app/sigap/pelatihan/pulsa.tsx
//
// (8 Okt 2026) Pop-up WAJIB konfirmasi nomor HP untuk pengisian pulsa (peserta pelatihan) + kartu status yang menonjol.
// Nomor HP asli ditampilkan; peserta boleh memakai nomor lain KHUSUS pulsa (nomor HP asli di data tidak berubah).
// Dipasang di Kerangka (komponen.tsx) sehingga muncul di semua halaman peserta pelatihan sampai dikonfirmasi.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat } from "../admin/api";
import { tampilHp } from "@/lib/sigapPulsa";

type Status = { peserta: boolean; asli?: string | null; pulsa?: string | null; diubah?: boolean; dikonfirmasi_at?: string | null };

export function PulsaPeserta() {
  const [st, setSt] = useState<Status | null>(null);
  const [buka, setBuka] = useState(false); // pop-up dibuka manual (Ubah nomor) setelah terkonfirmasi
  const [mode, setMode] = useState<"pilih" | "lain">("pilih");
  const [nomor, setNomor] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      setSt(await fetchJson<Status>("/api/sigap/pelatihan/pulsa"));
    } catch {
      setSt(null); // gagal memuat -> jangan memblokir peserta
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  if (!st || !st.peserta) return null;
  const sudah = Boolean(st.pulsa);
  const tampil = !sudah || buka;
  const adaAsli = Boolean(st.asli);
  const modeLain = mode === "lain" || !adaAsli;

  const kirim = async (isi: Record<string, unknown>) => {
    setSibuk(true);
    setGalat(null);
    try {
      const d = await fetchJson<Status>("/api/sigap/pelatihan/pulsa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isi) });
      setSt({ ...d, peserta: true });
      setBuka(false);
      setMode("pilih");
      setNomor("");
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  };

  const bukaUbah = () => {
    setGalat(null);
    setNomor(st.pulsa ?? "");
    setMode("lain");
    setBuka(true);
  };

  return (
    <>
      {/* Kartu status yang menonjol (selalu tampil di atas halaman peserta) */}
      <section className="rounded-2xl border-2 border-[#F58220] bg-[#FFF4E8] p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            📱
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[#B45309]">Pengisian pulsa</p>
            {sudah ? (
              <p className="text-[14px] font-bold text-[#14202E]">
                {tampilHp(st.pulsa)} <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ terkonfirmasi</span>
                {st.diubah && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">nomor khusus pulsa</span>}
              </p>
            ) : (
              <p className="text-[13px] font-semibold text-[#9A3412]">Nomor pulsa belum dikonfirmasi</p>
            )}
          </div>
          <button type="button" onClick={bukaUbah} className="shrink-0 rounded-full bg-[#F58220] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#E0731A]">
            {sudah ? "Ubah" : "Isi sekarang"}
          </button>
        </div>
      </section>

      {tampil && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="judul-pulsa">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="rounded-t-3xl bg-gradient-to-r from-[#F58220] to-[#FB9B3F] px-5 py-4 text-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/85">Pelatihan PSP Pascabencana 2026</p>
              <h2 id="judul-pulsa" className="text-[18px] font-extrabold leading-tight">
                📱 Nomor HP untuk pengisian pulsa
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-[#14202E]">
              {!modeLain && adaAsli ? (
                <>
                  <p className="text-[13.5px] leading-relaxed">Pulsa akan diisi ke nomor HP Anda yang tercatat. Mohon periksa, apakah nomor ini benar dan aktif?</p>
                  <div className="rounded-2xl border border-[#F58220]/40 bg-[#FFF4E8] py-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B45309]">Nomor HP Anda</p>
                    <p className="mt-1 font-mono text-[26px] font-extrabold tracking-wide">{tampilHp(st.asli)}</p>
                  </div>
                  {galat && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{galat}</p>}
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => kirim({ aksi: "konfirmasi" })}
                    className="w-full rounded-xl bg-[#F58220] py-3 text-[14.5px] font-bold text-white hover:bg-[#E0731A] disabled:opacity-60"
                  >
                    {sibuk ? "Menyimpan…" : "✓ Ya, nomor ini benar"}
                  </button>
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => {
                      setGalat(null);
                      setNomor("");
                      setMode("lain");
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-[13.5px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Pakai nomor lain untuk pulsa
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[13.5px] leading-relaxed">
                    {adaAsli ? "Masukkan nomor HP lain yang ingin diisi pulsa." : "Nomor HP Anda belum tercatat. Masukkan nomor aktif yang akan diisi pulsa."}{" "}
                    <span className="text-slate-500">Nomor ini hanya dipakai untuk pengisian pulsa; data nomor HP Anda yang lain tidak berubah.</span>
                  </p>
                  {adaAsli && (
                    <p className="text-[12px] text-slate-500">
                      Nomor tercatat: <b className="font-mono text-slate-700">{tampilHp(st.asli)}</b>
                    </p>
                  )}
                  <label className="block text-[12px] font-semibold text-slate-600" htmlFor="no-pulsa">
                    Nomor HP untuk pulsa
                  </label>
                  <input
                    id="no-pulsa"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={nomor}
                    onChange={(e) => setNomor(e.target.value)}
                    placeholder="08xx xxxx xxxx"
                    className="w-full rounded-xl border-2 border-slate-300 px-3 py-3 font-mono text-[20px] font-bold tracking-wide outline-none focus:border-[#F58220]"
                  />
                  {galat && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{galat}</p>}
                  <button
                    type="button"
                    disabled={sibuk || nomor.replace(/\D/g, "").length < 9}
                    onClick={() => kirim({ aksi: "simpan", nomor })}
                    className="w-full rounded-xl bg-[#F58220] py-3 text-[14.5px] font-bold text-white hover:bg-[#E0731A] disabled:opacity-50"
                  >
                    {sibuk ? "Menyimpan…" : "Simpan nomor pulsa"}
                  </button>
                  {adaAsli && (
                    <button type="button" disabled={sibuk} onClick={() => { setGalat(null); setMode("pilih"); }} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-[13.5px] font-semibold text-slate-700 hover:bg-slate-50">
                      ← Kembali ke nomor tercatat
                    </button>
                  )}
                </>
              )}
              {sudah && (
                <button type="button" onClick={() => setBuka(false)} className="w-full py-1 text-[12.5px] font-semibold text-slate-500 hover:text-slate-700">
                  Tutup (tetap pakai {tampilHp(st.pulsa)})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
