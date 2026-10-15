"use client";

// app/portal/ModalPengingat.tsx
//
// (15 Okt 2026) Modal pengingat dinamis -- "apa yang belum dilengkapi" (foto, laporan, lembar, izin susulan) langsung di Beranda, dengan tombol yang
// membuka TEPAT bagian itu. Aturan (sekali per kekurangan, tunda 2 jam, maks 3/hari, hilang bila lengkap) ada di lib/sigapPengingat.ts.
// Isi diambil dari daftar kekurangan yang sama dengan kartu Beranda (/api/portal/kegiatan), jadi tidak bertentangan dengan kartu.
// Tidak muncul: mode simulasi ("masuk sebagai"), ada hasil menunggu terkirim (antrean offline), atau dialog lain sedang terbuka
// (presensi rapat, foto panitia, pengumuman, ganti PIN) -- ditunggu sampai tertutup.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "./dataBersama";
import { useAntrean } from "./antreanKirim";
import { modeSimulasi } from "./simulasi";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import { tglPendekKek, type Kekurangan } from "@/lib/sigapKekurangan";
import { catatTampil, masihKurang, pilihPengingat, segarkanKeadaan, type KeadaanPengingat } from "@/lib/sigapPengingat";

const KUNCI = "sigap_pengingat_v1";
const ID_MODAL = "modal-pengingat-dinamis";
const nada = {
  merah: { pita: "bg-[#B42329]", tombol: "bg-[#B42329] text-white", lencana: "bg-white/20 text-white" },
  emas: { pita: "bg-[#1E2A47]", tombol: "bg-[#E0A526] text-[#1E2A47]", lencana: "bg-[#E0A526] text-[#1E2A47]" },
  biru: { pita: "bg-[#1F5FD1]", tombol: "bg-[#1F5FD1] text-white", lencana: "bg-white/20 text-white" },
} as const;

function bacaKeadaan(kunci: string): KeadaanPengingat {
  try {
    return segarkanKeadaan(JSON.parse(localStorage.getItem(kunci) ?? "null"), Date.now());
  } catch {
    return segarkanKeadaan(null, Date.now());
  }
}
function simpanKeadaan(kunci: string, k: KeadaanPengingat) {
  try {
    localStorage.setItem(kunci, JSON.stringify(k));
  } catch {
    /* penyimpanan penuh/diblokir: modal tetap tampil sekali di sesi ini */
  }
}

/** Ada dialog lain (selain milik kita) yang sedang terbuka? */
function adaDialogLain(): boolean {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.id !== ID_MODAL && !el.closest(`#${ID_MODAL}`));
}

export default function ModalPengingat({ akunKey }: { akunKey: string }) {
  const router = useRouter();
  const dKeg = useData<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan");
  const { menunggu } = useAntrean();
  const [tampil, setTampil] = useState<Kekurangan | null>(null);
  const kunci = `${KUNCI}:${akunKey || "anon"}`;
  const daftarRef = useRef<Kekurangan[]>([]);
  const tertahanLuar = menunggu.length > 0;

  const daftar: Kekurangan[] = (dKeg.data?.kegiatan ?? []).flatMap((k) => k.kekurangan ?? []);
  daftarRef.current = daftar;

  const periksa = useCallback(() => {
    const semua = daftarRef.current;
    // sedang tampil: hilang sendiri bila sudah lengkap
    setTampil((now) => (now && !masihKurang(semua, now) ? null : now));
  }, []);

  // pilih & tampilkan: tiap 3 detik (menunggu dialog lain tertutup), mulai 3 detik setelah Beranda terbuka
  useEffect(() => {
    if (!dKeg.data) return;
    const jalan = () => {
      if (tampil) return;
      const nowMs = Date.now();
      const tertahan = tertahanLuar || modeSimulasi() || adaDialogLain();
      const keadaan = bacaKeadaan(kunci);
      const pilih = pilihPengingat(daftarRef.current, keadaan, nowMs, tertahan);
      if (!pilih) return;
      simpanKeadaan(kunci, catatTampil(keadaan, pilih, nowMs));
      setTampil(pilih);
    };
    const awal = setTimeout(jalan, 3000);
    const b = setInterval(jalan, 3000);
    return () => {
      clearTimeout(awal);
      clearInterval(b);
    };
  }, [dKeg.data, tampil, tertahanLuar, kunci]);

  useEffect(periksa, [dKeg.data, periksa]);

  // sedang tampil lalu ada hasil menunggu terkirim / mode simulasi: tutup tanpa catatan tambahan
  useEffect(() => {
    if (tampil && (tertahanLuar || modeSimulasi())) setTampil(null);
  }, [tampil, tertahanLuar]);

  useEffect(() => {
    if (!tampil) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTampil(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [tampil]);

  if (!tampil) return null;
  const n = nada[tampil.nada] ?? nada.emas;
  const buka = () => {
    const href = tampil.href;
    setTampil(null);
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0B1530]/60 p-0 sm:items-center sm:p-4" onClick={() => setTampil(null)}>
      <div
        id={ID_MODAL}
        role="dialog"
        aria-modal="true"
        aria-label={tampil.judul}
        className="max-h-full w-full max-w-sm overflow-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${n.pita} px-5 pb-4 pt-4 text-white`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] font-extrabold tracking-wide text-white/85">{tampil.label}</span>
            {tampil.lencana && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${n.lencana}`}>{tampil.lencana.teks}</span>}
          </div>
          <h2 className="mt-2 text-[18px] font-extrabold leading-snug">{tampil.judul}</h2>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-[14px] leading-relaxed text-[#1E2A47]">{tampil.uraian}</p>
          {/* (15 Okt 2026) Perbaiki administrasi: daftar hari kerja + checklist; tombol "tgl ... tidak bekerja" membuka konfirmasi di menu perbaikan */}
          {tampil.jenis === "perbaikan" && tampil.hari && tampil.hari.length > 0 && (
            <ul className="divide-y divide-[#E3E8EE] rounded-xl border border-[#E3E8EE]" aria-label="Hari kerja yang perlu dilengkapi">
              {tampil.hari.map((h) => (
                <li key={h.tanggal} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-extrabold text-[#1E2A47]">{tglPendekKek(h.tanggal)}</p>
                    <p className="mt-0.5 flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${h.laporan ? "bg-[#FDE8E8] text-[#9B1C23]" : "bg-[#E3F6EC] text-[#0B6B3F]"}`}>{h.laporan ? "Laporan ✗" : "Laporan ✓"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${h.foto >= h.fotoTotal ? "bg-[#E3F6EC] text-[#0B6B3F]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>{`Foto ${h.foto}/${h.fotoTotal}`}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const dasar = tampil.href;
                      setTampil(null);
                      router.push(`${dasar}${dasar.includes("?") ? "&" : "?"}tidak=${h.tanggal}`);
                    }}
                    className="flex-none rounded-lg border border-[#CBD6E6] px-2.5 py-1.5 text-[12px] font-bold text-[#1E2A47]"
                  >
                    {`Tgl ${Number(h.tanggal.slice(8))} tidak bekerja`}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tampil.progres && tampil.progres.total > 0 && (
            <div className="flex gap-1" role="img" aria-label={`${tampil.progres.selesai} dari ${tampil.progres.total}`}>
              {Array.from({ length: tampil.progres.total }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < tampil.progres!.selesai ? "bg-[#1B8F5A]" : "bg-[#E3E8EE]"}`} />
              ))}
            </div>
          )}
          <button type="button" onClick={buka} className={`min-h-[46px] w-full rounded-xl px-4 text-[15px] font-extrabold shadow-sm active:scale-[0.99] ${n.tombol}`}>
            {tampil.aksi}
          </button>
          {tampil.sekunder &&
            (tampil.sekunder.luar ? (
              <a href={tampil.sekunder.href} target="_blank" rel="noopener noreferrer" onClick={() => setTampil(null)} className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#CBD6E6] px-4 text-[14px] font-bold text-[#1E2A47]">
                {tampil.sekunder.teks}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const h = tampil.sekunder!.href;
                  setTampil(null);
                  router.push(h);
                }}
                className="min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-4 text-[14px] font-bold text-[#1E2A47]"
              >
                {tampil.sekunder.teks}
              </button>
            ))}
          <button type="button" onClick={() => setTampil(null)} className="min-h-[40px] w-full text-[13.5px] font-bold text-[#5B6B84]">
            Nanti, ingatkan 2 jam lagi
          </button>
        </div>
      </div>
    </div>
  );
}
