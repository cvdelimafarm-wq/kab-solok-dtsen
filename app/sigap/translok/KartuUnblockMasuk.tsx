"use client";

// (3 Nov 2026) Kartu di tab Hari ini untuk PML / Korwil / Supervisor (dan admin translok):
//  - "Pengajuan unblock" dari bawahan yang diblokir: Setujui / Tolak
//  - "Kelola blokir": blokir sementara seorang bawahan, atau buka blokirnya langsung
// Tidak tampil bila pemanggil tidak punya bawahan.

import { useCallback, useEffect, useMemo, useState } from "react";
import { labelPeran, umurTeks, type PermintaanTampil, type StatusBlokir } from "@/lib/translokBlokir";

type Bawahan = { akun_id: number; nama: string; peran: string; status: StatusBlokir | null };
type Jawab = { bisa_kelola: boolean; semua: boolean; permintaan: PermintaanTampil[]; bawahan: Bawahan[] };

const CHIP: Record<string, string> = {
  diajukan: "bg-amber-100 text-amber-900",
  blokir: "bg-red-100 text-red-800",
  dibuka: "bg-emerald-100 text-emerald-800",
};
const TEKS: Record<string, string> = { diajukan: "Mengajukan", blokir: "Diblokir", dibuka: "Dibuka" };

export default function KartuUnblockMasuk({ token, kegiatanId }: { token: string; kegiatanId: number }) {
  const [d, setD] = useState<Jawab | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tolakId, setTolakId] = useState<number | null>(null);
  const [catatan, setCatatan] = useState("");
  const [kelola, setKelola] = useState(false);
  const [cari, setCari] = useState("");
  const [blokirId, setBlokirId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [, setDetik] = useState(0);

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/blokir?kegiatan=${kegiatanId}`, { cache: "no-store" });
      if (!res.ok) return;
      setD((await res.json()) as Jawab);
    } catch {
      /* pertahankan data terakhir */
    }
  }, [token, kegiatanId]);

  useEffect(() => { void muat(); }, [muat]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") { void muat(); setDetik((x) => x + 1); } }, 30_000);
    const v = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [muat]);

  async function kirim(kunci: string, badan: Record<string, unknown>) {
    setSibuk(kunci);
    setGalat(null);
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/blokir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(badan) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setGalat(j.error ?? "Gagal. Coba lagi.");
      else { setTolakId(null); setCatatan(""); setBlokirId(null); setAlasan(""); }
      await muat();
    } catch {
      setGalat("Tidak ada koneksi. Coba lagi.");
    } finally {
      setSibuk(null);
    }
  }

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (d?.bawahan ?? []).filter((b) => !q || b.nama.toLowerCase().includes(q));
  }, [d, cari]);

  if (!d || !d.bisa_kelola || (d.bawahan.length === 0 && d.permintaan.length === 0)) return null;
  const sekarang = Date.now();
  const diblokir = d.bawahan.filter((b) => b.status === "blokir" || b.status === "diajukan").length;

  return (
    <section aria-label="Blokir dan unblock translok" className={`rounded-2xl border bg-white p-3.5 shadow-sm ${d.permintaan.length ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[14.5px] font-extrabold text-[#13213A]">Pengajuan unblock translok</h2>
        {d.permintaan.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[12px] font-extrabold text-white">{d.permintaan.length}</span>}
      </div>

      {galat && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">{galat}</p>}

      {d.permintaan.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-slate-600">Tidak ada pengajuan yang menunggu.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {d.permintaan.map((p) => (
            <li key={p.id} className="rounded-xl bg-amber-50 p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-extrabold text-[#13213A]">{p.nama}</span>
                <span className="text-[11.5px] font-bold text-slate-500">{labelPeran(p.peran)}</span>
                <span className="ml-auto text-[11.5px] text-slate-500">{umurTeks(p.diajukan_at, sekarang)}</span>
              </div>
              {p.alasan && <p className="mt-1 text-[13px] leading-snug text-[#3B4A63]">“{p.alasan}”</p>}
              {tolakId === p.id ? (
                <div className="mt-2">
                  <input
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    maxLength={300}
                    placeholder="Alasan penolakan (opsional)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={sibuk !== null} onClick={() => kirim(`tolak${p.id}`, { aksi: "tolak", id: p.id, catatan })} className="min-h-[40px] flex-1 rounded-lg bg-red-700 text-[13.5px] font-extrabold text-white disabled:opacity-50">
                      {sibuk === `tolak${p.id}` ? "Menolak…" : "Tolak"}
                    </button>
                    <button type="button" onClick={() => { setTolakId(null); setCatatan(""); }} className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-[13.5px] font-bold text-slate-600">Batal</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={sibuk !== null} onClick={() => kirim(`setuju${p.id}`, { aksi: "setujui", id: p.id })} className="min-h-[40px] flex-1 rounded-lg bg-emerald-700 text-[13.5px] font-extrabold text-white disabled:opacity-50">
                    {sibuk === `setuju${p.id}` ? "Menyetujui…" : "Setujui"}
                  </button>
                  <button type="button" disabled={sibuk !== null} onClick={() => { setTolakId(p.id); setCatatan(""); }} className="min-h-[40px] flex-1 rounded-lg border border-red-300 bg-white text-[13.5px] font-extrabold text-red-700 disabled:opacity-50">Tolak</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" aria-expanded={kelola} onClick={() => setKelola((x) => !x)} className="mt-3 flex min-h-[40px] w-full items-center justify-between rounded-lg bg-slate-100 px-3 text-[13.5px] font-bold text-[#13213A]">
        <span>Kelola blokir tim ({d.bawahan.length}{diblokir ? ` · ${diblokir} diblokir` : ""})</span>
        <span aria-hidden="true">{kelola ? "▴" : "▾"}</span>
      </button>

      {kelola && (
        <div className="mt-2">
          {d.bawahan.length > 8 && (
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama" aria-label="Cari nama petugas" className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px]" />
          )}
          <ul className="divide-y divide-slate-100">
            {tampil.map((b) => (
              <li key={b.akun_id} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#13213A]">{b.nama}</span>
                  <span className="text-[11px] font-bold text-slate-500">{labelPeran(b.peran)}</span>
                  {b.status && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[b.status]}`}>{TEKS[b.status]}</span>}
                  {b.status === "blokir" || b.status === "diajukan" ? (
                    <button type="button" disabled={sibuk !== null} onClick={() => kirim(`buka${b.akun_id}`, { aksi: "buka", kegiatan_id: kegiatanId, akun_id: b.akun_id })} className="min-h-[36px] rounded-lg border border-emerald-300 px-3 text-[12.5px] font-extrabold text-emerald-800 disabled:opacity-50">
                      {sibuk === `buka${b.akun_id}` ? "…" : "Buka"}
                    </button>
                  ) : (
                    <button type="button" disabled={sibuk !== null} onClick={() => { setBlokirId(blokirId === b.akun_id ? null : b.akun_id); setAlasan(""); }} className="min-h-[36px] rounded-lg border border-red-300 px-3 text-[12.5px] font-extrabold text-red-700 disabled:opacity-50">
                      Blokir
                    </button>
                  )}
                </div>
                {blokirId === b.akun_id && (
                  <div className="mt-2 flex gap-2">
                    <input value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={500} placeholder="Alasan blokir (opsional)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[13.5px]" />
                    <button type="button" disabled={sibuk !== null} onClick={() => kirim(`blokir${b.akun_id}`, { aksi: "blokir", kegiatan_id: kegiatanId, akun_id: b.akun_id, alasan })} className="min-h-[40px] rounded-lg bg-red-700 px-4 text-[13.5px] font-extrabold text-white disabled:opacity-50">
                      {sibuk === `blokir${b.akun_id}` ? "…" : "Blokir"}
                    </button>
                  </div>
                )}
              </li>
            ))}
            {tampil.length === 0 && <li className="py-3 text-center text-[13px] text-slate-500">Tidak ada nama yang cocok.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
