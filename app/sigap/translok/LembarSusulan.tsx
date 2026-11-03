"use client";

// app/sigap/translok/LembarSusulan.tsx
//
// (3 Nov 2026) Lembar bawah "Ajukan susulan": petugas memilih tanggal lampau yang terlewat, menulis alasan, lalu mengirim ke 2 atasan terdekat.
// Daftar tanggal berasal dari server (aturan sama dengan POST ajukan), jadi yang tampil hanya yang memang bisa diajukan.
// Back HP menutup lembar ini (useTutupDenganBack).

import { useEffect, useMemo, useState } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { JENDELA_SUSULAN_JAM, MAKS_ALASAN_SUSULAN, MIN_ALASAN_SUSULAN, tanggalIndo } from "@/lib/translokSusulan";

type Kandidat = { tanggal: string; ok: boolean; mode?: "tambah" | "lengkapi"; pesan?: string };

export default function LembarSusulan({
  token, penugasanId, kegiatanNama, tanggalAwal, lengkapDiKlien, onTutup, onTerkirim,
}: {
  token: string;
  penugasanId: number;
  kegiatanNama: string;
  /** tanggal yang langsung terpilih (mis. dari kartu hari terlewat) */
  tanggalAwal?: string;
  /** tanggal yang di layar sudah dinilai lengkap (termasuk laporan "dianggap"): tidak ditawarkan */
  lengkapDiKlien?: readonly string[];
  onTutup: () => void;
  onTerkirim: () => void;
}) {
  useTutupDenganBack(true, onTutup);
  const [daftar, setDaftar] = useState<Kandidat[] | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [pilih, setPilih] = useState<string | null>(tanggalAwal ?? null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<{ penyetuju: number } | null>(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/susulan?penugasan=${penugasanId}&kandidat=1`, { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { kandidat?: Kandidat[]; error?: string };
        if (batal) return;
        if (!res.ok) setGalatMuat(j.error ?? "Gagal memuat daftar tanggal.");
        else setDaftar(j.kandidat ?? []);
      } catch {
        if (!batal) setGalatMuat("Tidak ada koneksi. Coba lagi.");
      }
    })();
    return () => { batal = true; };
  }, [token, penugasanId]);

  const lengkap = useMemo(() => new Set(lengkapDiKlien ?? []), [lengkapDiKlien]);
  const bisa = useMemo(() => (daftar ?? []).filter((k) => k.ok && !lengkap.has(k.tanggal)), [daftar, lengkap]);
  const dipilih = pilih ? bisa.find((k) => k.tanggal === pilih) ?? null : null;
  const alasanPanjang = alasan.trim().length;
  const alasanCukup = alasanPanjang >= MIN_ALASAN_SUSULAN;

  async function kirim() {
    if (!dipilih || !alasanCukup || sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/susulan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "ajukan", penugasan_id: penugasanId, tanggal: dipilih.tanggal, alasan }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; penyetuju?: number };
      if (!res.ok) { setGalat(j.error ?? "Gagal mengirim. Coba lagi."); return; }
      setSelesai({ penyetuju: j.penyetuju ?? 0 });
      onTerkirim();
    } catch {
      setGalat("Tidak ada koneksi. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="judul-susulan" onClick={onTutup}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2 bg-[#0F3D7A] px-5 py-4 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">{kegiatanNama}</p>
            <h2 id="judul-susulan" className="text-[18px] font-extrabold leading-tight">Ajukan susulan</h2>
          </div>
          <button type="button" onClick={onTutup} aria-label="Tutup" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-[18px] font-bold">×</button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4 text-[#13213A]">
          {selesai ? (
            <div role="status" className="rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-900">
              <p className="text-[15px] font-extrabold">✓ Pengajuan terkirim</p>
              <p className="mt-1 text-[13px] leading-snug">
                {selesai.penyetuju > 0
                  ? `Atasan Anda (${selesai.penyetuju} orang) sudah diberi tahu. Begitu disetujui, Anda punya ${JENDELA_SUSULAN_JAM} jam untuk melengkapi foto dan laporan tanggal itu.`
                  : "Belum ada atasan terdaftar untuk Anda, sehingga yang dapat menyetujui hanya admin translok. Hubungi admin agar pengajuan diproses."}
              </p>
              <button type="button" onClick={onTutup} className="mt-3 min-h-[44px] w-full rounded-xl bg-emerald-700 text-[14px] font-extrabold text-white">Selesai</button>
            </div>
          ) : (
            <>
              <p className="text-[13px] leading-snug text-[#3B4A63]">
                Untuk hari lampau yang terlewat. Setelah disetujui atasan, tanggal itu dibuka {JENDELA_SUSULAN_JAM} jam: foto lewat unggah, laporan lewat formulir. Bila lengkap dalam jendela itu, hari tersebut ikut dibayar penuh.
              </p>

              {galatMuat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">{galatMuat}</p>}
              {!daftar && !galatMuat && <p className="py-4 text-center text-[13px] text-slate-500">Memuat tanggal…</p>}

              {daftar && bisa.length === 0 && (
                <p className="rounded-xl bg-slate-100 px-3 py-3 text-[13px] leading-snug text-slate-700">
                  Tidak ada tanggal yang dapat disusulkan. Hari ini dan hari mendatang bisa langsung dipilih atau diisi tanpa susulan. Bila ada hari lampau yang tidak muncul, kemungkinan sudah lengkap, sedang menunggu persetujuan, atau di luar periode.
                </p>
              )}

              {bisa.length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 text-[12.5px] font-extrabold text-[#13213A]">Pilih tanggal</legend>
                  <div className="max-h-[34vh] space-y-1.5 overflow-y-auto pr-0.5">
                    {bisa.map((k) => {
                      const aktif = pilih === k.tanggal;
                      return (
                        <button
                          key={k.tanggal}
                          type="button"
                          aria-pressed={aktif}
                          onClick={() => setPilih(aktif ? null : k.tanggal)}
                          className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${aktif ? "border-[#0F3D7A] bg-[#EAF1FC]" : "border-slate-200 bg-white"}`}
                        >
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-black ${aktif ? "border-[#0F3D7A] bg-[#0F3D7A] text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-extrabold">{tanggalIndo(k.tanggal)}</span>
                            <span className="block text-[12px] text-slate-600">{k.mode === "tambah" ? "Belum dipilih sebagai hari kerja: ditambahkan bila disetujui" : "Hari kerja Anda yang terlewat: dibuka untuk dilengkapi"}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {dipilih && (
                <div>
                  <label htmlFor="alasan-susulan" className="mb-1 block text-[12.5px] font-extrabold">Alasan (apa yang terlewat dan mengapa)</label>
                  <textarea
                    id="alasan-susulan"
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    maxLength={MAKS_ALASAN_SUSULAN}
                    rows={3}
                    placeholder="Contoh: HP rusak seharian, foto tidak sempat terkirim"
                    className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-[#0F3D7A]"
                  />
                  <p className={`mt-0.5 text-[11.5px] ${alasanCukup ? "text-slate-500" : "text-amber-700"}`}>{alasanCukup ? `${alasanPanjang}/${MAKS_ALASAN_SUSULAN}` : `Minimal ${MIN_ALASAN_SUSULAN} huruf (${alasanPanjang})`}</p>
                </div>
              )}

              {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">{galat}</p>}

              <button
                type="button"
                disabled={!dipilih || !alasanCukup || sibuk}
                onClick={kirim}
                className="min-h-[48px] w-full rounded-xl bg-[#0F3D7A] text-[14.5px] font-extrabold text-white disabled:opacity-40"
              >
                {sibuk ? "Mengirim…" : dipilih ? `Kirim pengajuan ${tanggalIndo(dipilih.tanggal)}` : "Pilih tanggal dulu"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
