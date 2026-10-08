"use client";

// app/sigap/pelatihan/kelola/kuisLive.tsx
//
// (8 Okt 2026) Adu Sigap > Pantau Live: keempat kelas sekaligus (status, soal ke-N, yang sudah menjawab, 5 besar live) dengan
// kendali cepat Pause/Lanjutkan, Lanjut, Stop. Polling ~2 dtk; tidak aktif saat layar host dibuka.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import { URL_KUIS_ADMIN } from "./kuisHost";
import { LABEL_STATUS, kirim, type StatusR } from "./kuisBersama";
import { labelKelas } from "@/lib/sigapKuis";

type RuangLive = {
  id: number;
  kuis_id: number;
  kelas: number;
  judul: string;
  status: StatusR;
  soal_ke: number;
  total: number;
  versi: number;
  dijeda: boolean;
  jumlah_peserta: number;
  menjawab: number;
  rata_poin: number | null;
  jadwal_at: string | null;
  papan: { nama: string; nama_tampil: string; poin: number; benar: number; peringkat: number }[];
};
type KelasLive = { kelas: number; kuis_id: number | null; kuis_judul: string | null; jumlah_soal: number; anggota: number; terjadwal: string | null; ruang: RuangLive | null };
type LiveData = { sekarang: string; boleh_kelola: boolean; kelas: KelasLive[] };

export function PantauLive({ bisaKelola, aktif, bukaHost, keTab }: { bisaKelola: boolean; aktif: boolean; bukaHost: (ruangId: number) => void; keTab: () => void }) {
  const [d, setD] = useState<LiveData | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [stopId, setStopId] = useState<number | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const jalan = useRef(false);

  const muat = useCallback(async () => {
    if (jalan.current) return;
    jalan.current = true;
    try {
      setD(await fetchJson<LiveData>(`${URL_KUIS_ADMIN}?bagian=live`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      jalan.current = false;
    }
  }, []);
  useEffect(() => {
    if (!aktif) return;
    void muat();
    const t = setInterval(muat, 2000);
    return () => clearInterval(t);
  }, [muat, aktif]);

  async function perintah(r: RuangLive, aksi: "jeda" | "lanjutkan" | "lanjut" | "akhiri") {
    setSibuk(r.id);
    setPesan(null);
    try {
      await kirim({ aksi, ruang_id: r.id, ...(aksi === "lanjut" ? { versi: r.versi } : {}) });
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan(pesanGalat(e));
    } finally {
      setSibuk(null);
      setStopId(null);
    }
  }

  if (galat && !d) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!d) return <Memuat />;
  const adaAktif = d.kelas.some((k) => k.ruang && k.ruang.status !== "selesai");

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {pesan && <Pesan jenis="galat" onTutup={() => setPesan(null)}>{pesan}</Pesan>}
      {!adaAktif && (
        <Pesan jenis="info">
          Belum ada kelas yang sedang bermain. Atur dan buka ruang dari tab <button type="button" className="font-bold text-[#46178F] underline" onClick={keTab}>Pengaturan Kelas</button>.
        </Pesan>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {d.kelas.map((k) => {
          const r = k.ruang;
          const berjalan = !!r && r.status !== "selesai";
          const pct = r && r.total ? Math.round(((r.status === "jawaban" || r.status === "selesai" ? r.soal_ke : Math.max(0, r.soal_ke - 1)) / r.total) * 100) : 0;
          return (
            <Kartu key={k.kelas} judul={`${labelKelas(k.kelas)}`} ket={k.kuis_judul ?? "belum memilih kuis"} kanan={r ? <Chip w={berjalan ? (r.dijeda ? "wait" : "ok") : "mut"}>{r.dijeda ? "⏸ Dijeda" : LABEL_STATUS[r.status].split(" · ")[0]}</Chip> : <Chip>tidak ada ruang</Chip>}>
              {!r ? (
                <p className="text-[13px] text-[#7B8794]">
                  {k.kuis_id === null ? "Kelas ini belum diatur." : `${k.jumlah_soal} soal terpilih · ${k.anggota} peserta.`}
                  {k.terjadwal && <> Jadwal mulai tersimpan.</>}
                </p>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[12.5px] font-semibold">
                      <span>{r.status === "lobi" ? "Lobi" : `Soal ${r.soal_ke} / ${r.total}`}</span>
                      <span className="tabular-nums text-[#55657D]">👥 {r.jumlah_peserta}/{k.anggota}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#EDE3FA]">
                      <div className="h-full rounded-full bg-[#6B2FC0] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {r.status === "soal" && (
                    <div>
                      <div className="mb-1 flex justify-between text-[12.5px] font-semibold">
                        <span>✋ Sudah menjawab</span>
                        <span className="tabular-nums">{r.menjawab}/{r.jumlah_peserta}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#FBEFD6]">
                        <div className="h-full rounded-full bg-[#E0A800] transition-all" style={{ width: `${r.jumlah_peserta ? Math.round((r.menjawab / r.jumlah_peserta) * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {r.papan.length > 0 && (
                    <ol className="space-y-1" aria-label={`Papan skor live ${labelKelas(k.kelas)}`}>
                      {r.papan.slice(0, 5).map((p) => (
                        <li key={`${p.peringkat}-${p.nama}`} className="flex items-center gap-2 rounded-lg bg-[#F8FAFC] px-2.5 py-1 text-[12.5px]">
                          <b className="w-5 text-[#6B2FC0]">{p.peringkat}</b>
                          <span className="min-w-0 flex-1 truncate font-semibold" title={p.nama}>{p.nama}</span>
                          <span className="tabular-nums text-[#55657D]">{p.benar} benar</span>
                          <b className="w-[52px] text-right tabular-nums">{p.poin}</b>
                        </li>
                      ))}
                    </ol>
                  )}
                  {r.rata_poin !== null && <p className="text-[11.5px] text-[#7B8794]">Rata-rata poin {r.rata_poin}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={BTN_G} onClick={() => bukaHost(r.id)}>🖥 {berjalan ? "Layar host" : "Podium & review"}</button>
                    {bisaKelola && berjalan && (
                      <>
                        {(r.status === "soal" || r.status === "jawaban") && (
                          <button type="button" className={BTN_O} disabled={sibuk === r.id} onClick={() => perintah(r, r.dijeda ? "lanjutkan" : "jeda")}>{r.dijeda ? "▶ Lanjutkan" : "⏸ Pause"}</button>
                        )}
                        <button type="button" className={BTN} disabled={sibuk === r.id} onClick={() => perintah(r, "lanjut")}>{r.status === "lobi" ? "▶ Start" : r.status === "soal" ? "⏭ Tampilkan jawaban" : "⏭ Lanjut"}</button>
                        {stopId === r.id ? (
                          <>
                            <button type="button" className={BTN_R} disabled={sibuk === r.id} onClick={() => perintah(r, "akhiri")}>Ya, stop</button>
                            <button type="button" className={BTN_O} onClick={() => setStopId(null)}>Batal</button>
                          </>
                        ) : (
                          <button type="button" className={BTN_R} onClick={() => setStopId(r.id)}>⏹ Stop</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </Kartu>
          );
        })}
      </div>
    </div>
  );
}
