"use client";

// (3 Nov 2026) Modal yang menutup halaman translok petugas yang sedang diblokir sementara oleh atasan/admin.
// "Ajukan unblock" mengirim permintaan ke PML / Korwil / Supervisor (muncul di tab Hari ini mereka). Halaman terbuka otomatis begitu disetujui.

import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_ALASAN, MAKS_ALASAN, type TeksModal } from "@/lib/translokBlokir";

type Saya = { status: "blokir" | "diajukan"; modal: TeksModal | null } | null;

export default function ModalBlokirTranslok({ token, kegiatanId, onBuka, onKeluar }: { token: string; kegiatanId: number; onBuka: () => void; onKeluar?: () => void }) {
  const [saya, setSaya] = useState<Saya>(null);
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const pernahBlokir = useRef(false);
  const kotak = useRef<HTMLTextAreaElement | null>(null);

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/blokir?kegiatan=${kegiatanId}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { saya: Saya };
      setSaya(j.saya);
      if (j.saya) pernahBlokir.current = true;
      else if (pernahBlokir.current) {
        pernahBlokir.current = false;
        onBuka(); // baru saja dibuka: muat ulang data halaman
      }
    } catch {
      /* jaringan putus: pertahankan tampilan terakhir */
    }
  }, [token, kegiatanId, onBuka]);

  useEffect(() => {
    void muat();
  }, [muat]);

  // Selama menunggu persetujuan, cek berkala + saat aplikasi kembali dibuka.
  useEffect(() => {
    if (!saya) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void muat(); }, 15_000);
    const v = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [saya, muat]);

  useEffect(() => {
    if (saya?.modal?.boleh_ajukan) kotak.current?.focus();
  }, [saya?.modal?.boleh_ajukan]);

  async function ajukan() {
    setKirim(true);
    setGalat(null);
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/blokir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "ajukan", kegiatan_id: kegiatanId, alasan }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setGalat(j.error ?? "Gagal mengirim pengajuan. Coba lagi.");
      else { setAlasan(""); await muat(); }
    } catch {
      setGalat("Tidak ada koneksi. Coba lagi.");
    } finally {
      setKirim(false);
    }
  }

  if (!saya || !saya.modal) return null;
  const m = saya.modal;
  const merah = m.nada === "merah";
  const cukup = alasan.trim().length >= MIN_ALASAN;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0B1B33]/85 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="judul-blokir">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${merah ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} aria-hidden="true">
          {merah ? "⛔" : "⏳"}
        </div>
        <h2 id="judul-blokir" className="text-[18px] font-extrabold text-[#13213A]">{m.judul}</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#3B4A63]">{m.isi}</p>

        {m.boleh_ajukan ? (
          <>
            <label htmlFor="alasan-unblock" className="mt-4 block text-[13px] font-bold text-[#13213A]">Alasan meminta dibuka</label>
            <textarea
              id="alasan-unblock"
              ref={kotak}
              value={alasan}
              maxLength={MAKS_ALASAN}
              rows={3}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Contoh: laporan kemarin sudah saya lengkapi."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-[#0F3D7A] focus:ring-2 focus:ring-[#0F3D7A]/20"
            />
            {galat && <p role="alert" className="mt-2 text-[13px] font-semibold text-red-700">{galat}</p>}
            <button
              type="button"
              disabled={!cukup || kirim}
              onClick={ajukan}
              className="mt-3 min-h-[46px] w-full rounded-xl bg-[#0F3D7A] text-[15px] font-extrabold text-white disabled:opacity-50"
            >
              {kirim ? "Mengirim…" : "Ajukan unblock"}
            </button>
          </>
        ) : (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-900">
            Halaman ini terbuka otomatis setelah pengajuan disetujui. Anda boleh menutup aplikasi; notifikasi akan dikirim.
          </p>
        )}
        {onKeluar && (
          <button type="button" onClick={onKeluar} className="mt-3 w-full py-2 text-[13px] font-bold text-slate-500 underline">
            Keluar
          </button>
        )}
      </div>
    </div>
  );
}
