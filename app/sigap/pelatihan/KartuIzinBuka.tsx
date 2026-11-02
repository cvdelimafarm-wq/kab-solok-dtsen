"use client";

// app/sigap/pelatihan/KartuIzinBuka.tsx
//
// (2 Nov 2026) Kartu "Permintaan buka kunci (n)" di tab Hari ini untuk panitia dan instruktur (rancangan 5.6, keputusan 20): petugas yang terkunci dan
// mengajukan buka kunci muncul di sini; satu ketukan Setujui / Tolak. Instruktur hanya melihat peserta kelasnya, panitia semua kelas. Bukan pengelola
// atau tidak ada permintaan -> tidak menggambar apa pun. Disegarkan tiap 30 detik selama halaman terlihat. Izin berlaku sampai 23.59 WIB hari itu.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat } from "../admin/api";
import { BTN, BTN_O, Pesan } from "../admin/ui";

type Permintaan = { id: number; akun_id: number; nama: string; kelas: number | null; tahap: string; alasan: string | null; dibuat_at: string };
type Data = { pengelola: boolean; kelas: number | null; menunggu: Permintaan[] };

const NAMA_TAHAP: Record<string, string> = { pretest: "Pretest", posttest: "Posttest" };

function jamWib(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function KartuIzinBuka() {
  const [d, setD] = useState<Data | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(() => {
    fetchJson<Data>("/api/sigap/pelatihan/izin-buka")
      .then((r) => setD(r))
      .catch(() => undefined); // gagal baca: kartu tidak tampil; tidak mengganggu halaman
  }, []);
  useEffect(() => {
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 30_000);
    return () => clearInterval(a);
  }, [muat]);

  async function putuskan(id: number, setuju: boolean) {
    setSibuk(id);
    setGalat(null);
    try {
      await fetchJson("/api/sigap/pelatihan/izin-buka", { method: "POST", body: JSON.stringify({ aksi: "putuskan", id, setuju }) });
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
      muat();
    }
  }

  if (!d || !d.pengelola || d.menunggu.length === 0) return null;
  return (
    <section className="rounded-[18px] border border-[#F4D78A] bg-[#FFFBEF] p-4" aria-label="Permintaan buka kunci">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Permintaan buka kunci</h2>
        <span className="rounded-full bg-[#FFF4D6] px-2.5 py-0.5 text-[11.5px] font-bold text-[#8A6200]">{d.menunggu.length}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-[#5B6B84]">Disetujui = tes dibuka untuk orang itu sampai 23.59 WIB hari ini.</p>
      {galat && (
        <div className="mt-2">
          <Pesan jenis="galat">{galat}</Pesan>
        </div>
      )}
      <ul className="mt-2 divide-y divide-[#F1E2B5]">
        {d.menunggu.map((p) => (
          <li key={p.id} className="py-2.5">
            <p className="text-[13.5px]">
              <b>{p.nama}</b>
              {p.kelas !== null ? <span className="text-[#6B7A90]"> · Kelas {p.kelas}</span> : null}
              <span className="text-[#6B7A90]"> · {NAMA_TAHAP[p.tahap] ?? p.tahap}</span>
              {p.dibuat_at && <span className="text-[#6B7A90]"> · {jamWib(p.dibuat_at)} WIB</span>}
            </p>
            {p.alasan && <p className="mt-0.5 text-[12.5px] text-[#3B4A60]">“{p.alasan}”</p>}
            <div className="mt-2 flex gap-2">
              <button type="button" className={BTN} disabled={sibuk === p.id} onClick={() => putuskan(p.id, true)}>
                Setujui
              </button>
              <button type="button" className={BTN_O} disabled={sibuk === p.id} onClick={() => putuskan(p.id, false)}>
                Tolak
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
