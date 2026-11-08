"use client";

// app/sigap/translok/KartuLengkapiAnggota.tsx
//
// (8 Nov 2026) Kartu di tab Hari ini untuk PML / Korwil / Supervisor / admin translok: melengkapi LAPORAN hari terlewat anggota (kegiatan Pascabencana)
// lewat form rincian SLS. Hanya tampil bila ada anggota dengan hari terlewat yang masih bisa dilengkapi (foto kurang paling banyak 2, laporan belum ada).
// Angka tidak dihitung sebagai poin kinerja. Server: app/api/sigap/translok/[token]/lengkapi/route.ts.

import { useCallback, useEffect, useState } from "react";
import SelectCari from "@/app/components/SelectCari";
import LengkapiLaporanSls from "@/app/sigap/translok/LengkapiLaporanSls";
import { labelPeran } from "@/lib/translokBlokir";

type Anggota = { penugasan_id: number; akun_id: number; nama: string; peran: string; hari: { tanggal: string; foto: number }[] };
type Master = { kecamatan: string; nagari: string; jorong: string };

const tglPendek = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export default function KartuLengkapiAnggota({ token, kegiatanId, master }: { token: string; kegiatanId: number; master: Master[] }) {
  const [anggota, setAnggota] = useState<Anggota[]>([]);
  const [buka, setBuka] = useState(false);
  const [pilihId, setPilihId] = useState<string>("");
  const [tanggal, setTanggal] = useState<string>("");
  const [selesai, setSelesai] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/lengkapi?kegiatan=${kegiatanId}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { anggota: Anggota[] };
      setAnggota(j.anggota ?? []);
    } catch {
      /* pertahankan data terakhir */
    }
  }, [token, kegiatanId]);
  useEffect(() => {
    void muat();
  }, [muat]);

  if (anggota.length === 0 && !selesai) return null;
  const terpilih = anggota.find((a) => String(a.penugasan_id) === pilihId) ?? null;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold">Lengkapi laporan anggota</p>
          <p className="text-[11.5px] text-[#6B7890]">{anggota.length} anggota punya hari terlewat yang laporannya belum ada (foto kurang paling banyak 2).</p>
        </div>
        <button type="button" onClick={() => { setBuka((v) => !v); setSelesai(null); }} className="min-h-[40px] rounded-xl border-2 border-[#0F3D7A] px-3 text-[13px] font-extrabold text-[#0F3D7A]">
          {buka ? "Tutup" : "Isi"}
        </button>
      </div>
      {selesai && <p className="mt-2 text-[12.5px] font-semibold text-emerald-700">✓ {selesai}</p>}
      {buka && (
        <div className="mt-3 space-y-3">
          <SelectCari
            className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px]"
            value={pilihId}
            onChange={(e) => { setPilihId(e.target.value); setTanggal(""); }}
            aria-label="Pilih anggota"
          >
            <option value="">Pilih anggota…</option>
            {anggota.map((a) => (
              <option key={a.penugasan_id} value={String(a.penugasan_id)}>{`${a.nama} · ${labelPeran(a.peran)} · ${a.hari.length} hari`}</option>
            ))}
          </SelectCari>
          {terpilih && (
            <div className="flex flex-wrap gap-1.5">
              {terpilih.hari.map((h) => (
                <button
                  key={h.tanggal}
                  type="button"
                  onClick={() => setTanggal(h.tanggal)}
                  className={`min-h-[40px] rounded-lg px-3 text-[12.5px] font-bold ${tanggal === h.tanggal ? "bg-[#0F3D7A] text-white" : "bg-red-100 text-red-800"}`}
                >
                  {tglPendek(h.tanggal)}
                </button>
              ))}
            </div>
          )}
          {terpilih && tanggal && (
            <LengkapiLaporanSls
              key={`${terpilih.penugasan_id}-${tanggal}`}
              token={token}
              penugasanId={terpilih.penugasan_id}
              tanggal={tanggal}
              master={master}
              peran={terpilih.peran}
              atasNama
              onTersimpan={async () => {
                setSelesai(`Laporan ${terpilih.nama} tanggal ${tglPendek(tanggal)} tersimpan.`);
                setTanggal("");
                setPilihId("");
                await muat();
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
