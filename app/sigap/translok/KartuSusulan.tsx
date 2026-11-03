"use client";

// app/sigap/translok/KartuSusulan.tsx
//
// (3 Nov 2026) Satu kartu di tab Hari ini untuk "Ajukan susulan":
//   - PENYETUJU (2 tingkat atasan terdekat / admin translok): "Pengajuan susulan" dari bawahan -> Setujui / Tolak.
//   - PETUGAS: tombol "Ajukan susulan" (lembar bawah) + riwayat pengajuannya (menunggu / disetujui + sisa jendela / ditolak + catatan).
// Satu kali ambil data untuk keduanya. Saat pengajuan milik sendiri berubah menjadi disetujui, halaman diminta memuat ulang (hari kerja dan izin baru muncul).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { labelPeran, umurTeks } from "@/lib/translokBlokir";
import { JENDELA_SUSULAN_JAM, MAKS_CATATAN_SUSULAN, statusTampil, tanggalIndo, type BarisSusulan } from "@/lib/translokSusulan";
import LembarSusulan from "./LembarSusulan";

type Masuk = BarisSusulan & { nama: string; peran: string | null };
type Jawab = { saya: BarisSusulan[]; masuk: Masuk[] };

const NADA: Record<string, string> = {
  emas: "bg-amber-100 text-amber-900",
  hijau: "bg-emerald-100 text-emerald-900",
  merah: "bg-red-100 text-red-800",
  abu: "bg-slate-100 text-slate-700",
};

export default function KartuSusulan({
  token, penugasanId, kegiatanNama, bolehAjukan, lengkapDiKlien, onBerubah,
}: {
  token: string;
  penugasanId: number;
  kegiatanNama: string;
  /** false bila SPJ dikunci, kegiatan arsip, atau pelatihan: tombol ajukan tidak ditampilkan */
  bolehAjukan: boolean;
  lengkapDiKlien: readonly string[];
  onBerubah: () => Promise<void> | void;
}) {
  const [d, setD] = useState<Jawab | null>(null);
  const [lembar, setLembar] = useState(false);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tolakId, setTolakId] = useState<number | null>(null);
  const [catatan, setCatatan] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [, setDetik] = useState(0);
  const statusLama = useRef<Map<number, string>>(new Map());

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/susulan?penugasan=${penugasanId}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as Jawab;
      // pengajuan milik sendiri yang baru berubah menjadi disetujui: muat ulang halaman (hari kerja dan izin baru muncul)
      let baruDisetujui = false;
      for (const b of j.saya) {
        const lama = statusLama.current.get(b.id);
        if (lama === "diajukan" && b.status === "disetujui") baruDisetujui = true;
        statusLama.current.set(b.id, b.status);
      }
      setD(j);
      if (baruDisetujui) void onBerubah();
    } catch {
      /* pertahankan data terakhir */
    }
  }, [token, penugasanId, onBerubah]);

  useEffect(() => { void muat(); }, [muat]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") { void muat(); setDetik((x) => x + 1); } }, 30_000);
    const v = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [muat]);

  async function kirim(kunci: string, badan: Record<string, unknown>, sukses?: string) {
    setSibuk(kunci);
    setGalat(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/susulan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(badan) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setGalat(j.error ?? "Gagal. Coba lagi.");
      else { setTolakId(null); setCatatan(""); if (sukses) setInfo(sukses); }
      await muat();
    } catch {
      setGalat("Tidak ada koneksi. Coba lagi.");
    } finally {
      setSibuk(null);
    }
  }

  const sekarang = Date.now();
  const saya = useMemo(() => (d?.saya ?? []).slice(0, 4), [d]);
  const masuk = d?.masuk ?? [];

  if (!d && !bolehAjukan) return null;
  if (d && !bolehAjukan && saya.length === 0 && masuk.length === 0) return null;

  return (
    <>
      <section aria-label="Susulan translok" className={`rounded-2xl border bg-white p-3.5 shadow-sm ${masuk.length ? "border-amber-300" : "border-slate-200"}`}>
        {masuk.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-[14.5px] font-extrabold text-[#13213A]">Pengajuan susulan</h2>
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[12px] font-extrabold text-white">{masuk.length}</span>
            </div>
            <ul className="mt-2 space-y-2">
              {masuk.map((p) => (
                <li key={p.id} className="rounded-xl bg-amber-50 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-extrabold text-[#13213A]">{p.nama}</span>
                    <span className="text-[11.5px] font-bold text-slate-500">{labelPeran(p.peran)}</span>
                    <span className="ml-auto text-[11.5px] text-slate-500">{umurTeks(p.diajukan_at, sekarang)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] font-bold text-[#0F3D7A]">{tanggalIndo(p.tanggal)}</p>
                  <p className="text-[12px] text-slate-600">{p.mode === "tambah" ? "Belum dipilih sebagai hari kerja: akan ditambahkan" : "Hari kerjanya sudah ada: dibuka untuk dilengkapi"}</p>
                  {p.alasan && <p className="mt-1 text-[13px] leading-snug text-[#3B4A63]">“{p.alasan}”</p>}
                  {tolakId === p.id ? (
                    <div className="mt-2">
                      <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={MAKS_CATATAN_SUSULAN} placeholder="Alasan penolakan (opsional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px]" />
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={sibuk !== null} onClick={() => kirim(`tolak${p.id}`, { aksi: "tolak", id: p.id, catatan })} className="min-h-[40px] flex-1 rounded-lg bg-red-700 text-[13.5px] font-extrabold text-white disabled:opacity-50">
                          {sibuk === `tolak${p.id}` ? "Menolak…" : "Tolak"}
                        </button>
                        <button type="button" onClick={() => { setTolakId(null); setCatatan(""); }} className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-[13.5px] font-bold text-slate-600">Batal</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={sibuk !== null} onClick={() => kirim(`setuju${p.id}`, { aksi: "setujui", id: p.id }, `Disetujui. ${p.nama.split(",")[0]} punya ${JENDELA_SUSULAN_JAM} jam untuk melengkapi.`)} className="min-h-[40px] flex-1 rounded-lg bg-emerald-700 text-[13.5px] font-extrabold text-white disabled:opacity-50">
                        {sibuk === `setuju${p.id}` ? "Menyetujui…" : "Setujui"}
                      </button>
                      <button type="button" disabled={sibuk !== null} onClick={() => { setTolakId(p.id); setCatatan(""); }} className="min-h-[40px] flex-1 rounded-lg border border-red-300 bg-white text-[13.5px] font-extrabold text-red-700 disabled:opacity-50">Tolak</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {galat && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">{galat}</p>}
        {info && <p role="status" className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-900">{info}</p>}

        {(saya.length > 0 || bolehAjukan) && (
          <div>
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-[14px] font-extrabold text-[#13213A]">{saya.length > 0 ? "Susulan saya" : "Ada hari yang terlewat?"}</h2>
              {bolehAjukan && (
                <button type="button" onClick={() => { setInfo(null); setLembar(true); }} className="min-h-[38px] rounded-lg bg-[#0F3D7A] px-3.5 text-[13px] font-extrabold text-white">
                  Ajukan susulan
                </button>
              )}
            </div>
            {saya.length === 0 && <p className="mt-1 text-[12.5px] leading-snug text-slate-600">Foto atau laporan terlewat, atau hari kerja belum sempat dipilih? Ajukan ke atasan. Bila disetujui, tanggalnya dibuka {JENDELA_SUSULAN_JAM} jam.</p>}
            {saya.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {saya.map((b) => {
                  const st = statusTampil(b, sekarang);
                  return (
                    <li key={b.id} className="rounded-xl border border-slate-200 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-[#13213A]">{tanggalIndo(b.tanggal)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${NADA[st.nada]}`}>{b.status === "diajukan" ? "Menunggu" : b.status === "disetujui" ? (st.aktif ? "Dibuka" : "Selesai") : b.status === "ditolak" ? "Ditolak" : "Batal"}</span>
                      </div>
                      <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{st.label}</p>
                      {b.status === "diajukan" && (
                        <button type="button" disabled={sibuk !== null} onClick={() => kirim(`batal${b.id}`, { aksi: "batal", id: b.id })} className="mt-1.5 min-h-[34px] rounded-lg border border-slate-300 px-3 text-[12.5px] font-bold text-slate-600 disabled:opacity-50">
                          {sibuk === `batal${b.id}` ? "Membatalkan…" : "Batalkan pengajuan"}
                        </button>
                      )}
                      {st.aktif && (
                        <a href={`${typeof window !== "undefined" ? window.location.pathname : ""}?p=${penugasanId}&tab=hari_ini&tgl=${b.tanggal}&fokus=foto`} className="mt-1.5 inline-flex min-h-[40px] items-center rounded-lg bg-emerald-700 px-4 text-[13px] font-extrabold text-white">
                          Lengkapi sekarang
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {lembar && (
        <LembarSusulan
          token={token}
          penugasanId={penugasanId}
          kegiatanNama={kegiatanNama}
          lengkapDiKlien={lengkapDiKlien}
          onTutup={() => setLembar(false)}
          onTerkirim={() => { void muat(); }}
        />
      )}
    </>
  );
}
