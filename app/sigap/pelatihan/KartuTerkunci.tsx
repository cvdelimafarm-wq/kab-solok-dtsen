"use client";

// app/sigap/pelatihan/KartuTerkunci.tsx
//
// (2 Nov 2026) Kartu "Terkunci" untuk Pretest / Posttest yang terhalang tahapan sebelumnya (blokir tahapan, rancangan 5.5) dan permintaan buka kunci (5.6).
// Dipakai di halaman Langkah (IsiTes) dan di halaman tes. Tombol "Minta buka kunci" hanya bila pelatihan mengaktifkan pengajuan; status permintaan
// (menunggu / ditolak) tampil di kartu ini, tanpa kartu tambahan di Hari ini petugas.

import { useEffect, useState } from "react";
import { fetchJson, pesanGalat } from "../admin/api";
import { BTN, BTN_O, Pesan } from "../admin/ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { ALASAN_CEPAT, MAKS_ALASAN_IZIN, teksKartuTerkunci, type StatusIzin } from "@/lib/sigapTahapan";

export type KunciTes = {
  oleh: string;
  oleh_label: string;
  pesan: string;
  izin: { status: StatusIzin; alasan: string | null; berlaku_sampai: string | null } | null;
  boleh_minta: boolean;
};

function ModalMinta({ jenis, onTutup, onSelesai }: { jenis: "pretest" | "posttest"; onTutup: () => void; onSelesai: () => void }) {
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  useTutupDenganBack(true, onTutup); // Back HP menutup modal (penjaga Back, lib/__tests__/sigapBackGuard.test.ts)
  useEffect(() => {
    const tombol = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", tombol);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tombol);
      document.body.style.overflow = lama;
    };
  }, [onTutup]);

  async function kirimMinta() {
    setKirim(true);
    setGalat(null);
    try {
      await fetchJson("/api/sigap/pelatihan/izin-buka", { method: "POST", body: JSON.stringify({ aksi: "minta", tahap: jenis, alasan }) });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Minta buka kunci" onClick={onTutup}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Minta buka kunci {jenis === "pretest" ? "Pretest" : "Posttest"}</h2>
        <p className="mt-1 text-[13px] text-[#5B6B84]">Permintaan dikirim ke panitia dan instruktur kelas Anda. Bila disetujui, tes dibuka untuk Anda sampai 23.59 WIB hari ini.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALASAN_CEPAT.map((a) => (
            <button key={a} type="button" onClick={() => setAlasan(a === "Lainnya" ? "" : a)} className={`min-h-[36px] rounded-full border px-3 text-[12.5px] font-semibold ${alasan === a ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#CBD6E6] text-[#3B4A60]"}`}>
              {a}
            </button>
          ))}
        </div>
        <label htmlFor="alasan-minta" className="mt-3 block text-[13px] font-semibold">
          Alasan
        </label>
        <textarea id="alasan-minta" value={alasan} maxLength={MAKS_ALASAN_IZIN} onChange={(e) => setAlasan(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[#CBD6E6] p-2.5 text-[14px]" placeholder="Tulis alasan singkat" />
        {galat && (
          <div className="mt-3">
            <Pesan jenis="galat">{galat}</Pesan>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup} disabled={kirim}>
            Batal
          </button>
          <button type="button" className={BTN} onClick={kirimMinta} disabled={kirim || alasan.trim().length < 3}>
            {kirim ? "Mengirim…" : "Kirim permintaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KartuTerkunci({ jenis, kunci, onSelesai }: { jenis: "pretest" | "posttest"; kunci: KunciTes; onSelesai: () => void }) {
  const [minta, setMinta] = useState(false);
  const teks = teksKartuTerkunci(kunci, kunci.izin, kunci.boleh_minta);
  const menunggu = kunci.izin?.status === "menunggu";
  return (
    <>
      <div className={`rounded-xl border p-3 ${menunggu ? "border-[#F4D78A] bg-[#FFFBEF]" : "border-[#DDE6F3] bg-[#F3F6FB]"}`} role="status">
        <p className="flex items-center gap-1.5 text-[14px] font-extrabold text-[#0F2A52]">
          <span aria-hidden>🔒</span> {teks.judul}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#3B4A60]">{teks.ket}</p>
        {kunci.izin?.alasan && kunci.izin.status !== "disetujui" && <p className="mt-1 text-[12px] text-[#6B7A90]">Alasan Anda: “{kunci.izin.alasan}”</p>}
        {teks.tombolMinta && (
          <button type="button" onClick={() => setMinta(true)} className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] border border-[#CBD6E6] bg-white px-4 py-2.5 text-[14px] font-extrabold text-[#1B2B4B] hover:bg-[#F5F8FE] sm:w-auto">
            Minta buka kunci
          </button>
        )}
      </div>
      {minta && (
        <ModalMinta
          jenis={jenis}
          onTutup={() => setMinta(false)}
          onSelesai={() => {
            setMinta(false);
            onSelesai();
          }}
        />
      )}
    </>
  );
}
