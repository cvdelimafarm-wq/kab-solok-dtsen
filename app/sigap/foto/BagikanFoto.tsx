"use client";

// app/sigap/foto/BagikanFoto.tsx
//
// (19 Okt 2026) Memilih siapa yang ikut di-tag pada foto: rekan satu tim (dari penugasan/alokasi yang sama) dan petugas/pegawai lain di luar tim.
// Tag tidak langsung masuk: penerima menyetujui, memilih kegiatan & nomor fotonya sendiri. Di luar tim ditandai "perlu disetujui".

import { useEffect, useRef, useState } from "react";
import { ambilJson } from "./klien";
import { MAKS_TAG } from "@/lib/sigapFoto";

export type TagPilihan = { akun_id: number; nama: string; luar_tim: boolean; slot_usulan: number | null };
type Rekan = { akun_id: number; nama: string; jenis: string; peran_di_tim: string | null };
type Cari = { akun_id: number; nama: string; jenis: string };

// (26 Okt 2026) `kecuali` = akun yang sudah di-tag pada foto ini (dipakai saat membagikan foto yang sudah terkirim); `maks` = sisa kuota tag foto itu.
export default function BagikanFoto({ kegiatanId, jumlahNomor, nilai, onUbah, kecuali = [], maks = MAKS_TAG }: { kegiatanId: number; jumlahNomor: number; nilai: TagPilihan[]; onUbah: (n: TagPilihan[]) => void; kecuali?: number[]; maks?: number }) {
  const [rekan, setRekan] = useState<Rekan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cariBuka, setCariBuka] = useState(false);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Cari[]>([]);
  const [mencari, setMencari] = useState(false);
  const jeda = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let batal = false;
    ambilJson<{ rekan: Rekan[] }>(`/api/sigap/foto/rekan?kegiatan_id=${kegiatanId}`)
      .then((d) => !batal && setRekan(d.rekan))
      .catch((e: Error) => !batal && (setGalat(e.message), setRekan([])));
    return () => {
      batal = true;
    };
  }, [kegiatanId]);

  useEffect(() => {
    if (jeda.current) clearTimeout(jeda.current);
    if (q.trim().length < 2) {
      setHasil([]);
      return;
    }
    jeda.current = setTimeout(() => {
      setMencari(true);
      ambilJson<{ luar_tim: Cari[] }>(`/api/sigap/foto/rekan?kegiatan_id=${kegiatanId}&q=${encodeURIComponent(q.trim())}`)
        .then((d) => setHasil(d.luar_tim))
        .catch(() => setHasil([]))
        .finally(() => setMencari(false));
    }, 350);
    return () => {
      if (jeda.current) clearTimeout(jeda.current);
    };
  }, [q, kegiatanId]);

  const dipilih = (id: number) => nilai.some((n) => n.akun_id === id);
  const penuh = nilai.length >= maks;

  function ganti(id: number, nama: string, luar: boolean) {
    if (dipilih(id)) onUbah(nilai.filter((n) => n.akun_id !== id));
    else if (!penuh) onUbah([...nilai, { akun_id: id, nama, luar_tim: luar, slot_usulan: null }]);
  }
  function setNomor(id: number, s: number | null) {
    onUbah(nilai.map((n) => (n.akun_id === id ? { ...n, slot_usulan: s } : n)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-bold text-[#0F2A52]">Bagikan ke rekan</div>
      <p className="text-xs leading-relaxed text-[#3C4C68]">Rekan menerima di aplikasinya, lalu memilih sendiri nomor fotonya. Nomor di bawah hanya usulan.</p>

      {rekan === null && <div className="text-sm text-[#3C4C68]">Memuat rekan tim…</div>}
      {galat && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div>}
      {rekan !== null && rekan.length === 0 && !galat && (
        <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Belum ada rekan tim yang tercatat untuk kegiatan ini. Gunakan “Tambah petugas lain”.</div>
      )}

      <ul className="flex flex-col gap-2">
        {(rekan ?? []).filter((r) => !kecuali.includes(r.akun_id)).map((r) => (
          <li key={r.akun_id}>
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-[#C9D3E6] bg-white px-3 py-2">
              <input type="checkbox" className="h-5 w-5 accent-[#0F2A52]" checked={dipilih(r.akun_id)} disabled={!dipilih(r.akun_id) && penuh} onChange={() => ganti(r.akun_id, r.nama, false)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#0F2A52]">{r.nama}</span>
                <span className="block text-xs text-[#3C4C68]">{r.peran_di_tim ? r.peran_di_tim.toUpperCase() : r.jenis} · satu tim</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {!cariBuka ? (
        <button type="button" onClick={() => setCariBuka(true)} className="min-h-[44px] rounded-xl border border-dashed border-[#0F2A52] px-3 text-sm font-bold text-[#0F2A52]">
          + Tambah petugas lain (di luar tim)
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-[#C9D3E6] bg-[#F7F9FD] p-3">
          <label className="text-xs font-bold text-[#0F2A52]" htmlFor="cari-luar">Cari nama petugas atau pegawai</label>
          <input id="cari-luar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik minimal 2 huruf" className="min-h-[44px] rounded-lg border border-[#C9D3E6] bg-white px-3 text-sm" autoComplete="off" />
          {mencari && <div className="text-xs text-[#3C4C68]">Mencari…</div>}
          <ul className="flex flex-col gap-2">
            {hasil.filter((c) => !kecuali.includes(c.akun_id)).map((c) => (
              <li key={c.akun_id}>
                <button type="button" onClick={() => ganti(c.akun_id, c.nama, true)} aria-pressed={dipilih(c.akun_id)} className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${dipilih(c.akun_id) ? "border-[#0F2A52] bg-[#E8EEF8]" : "border-[#C9D3E6] bg-white"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#0F2A52]">{c.nama}</span>
                    <span className="block text-xs text-[#3C4C68]">{c.jenis}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[#FFF4D6] px-2 py-1 text-[11px] font-bold text-[#8A6200]">Di luar tim · perlu disetujui</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nilai.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-[#0F2A52]">Dipilih ({nilai.length}/{maks})</div>
          {nilai.map((n) => (
            <div key={n.akun_id} className="flex items-center gap-2 rounded-xl bg-[#E8EEF8] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F2A52]">{n.nama}{n.luar_tim ? " (di luar tim)" : ""}</span>
              <label className="sr-only" htmlFor={`nomor-${n.akun_id}`}>Usulan nomor foto untuk {n.nama}</label>
              <select id={`nomor-${n.akun_id}`} value={n.slot_usulan ?? ""} onChange={(e) => setNomor(n.akun_id, e.target.value ? Number(e.target.value) : null)} className="min-h-[40px] rounded-lg border border-[#C9D3E6] bg-white px-2 text-sm">
                <option value="">Nomor bebas</option>
                {Array.from({ length: jumlahNomor }, (_, i) => i + 1).map((k) => (
                  <option key={k} value={k}>Foto {k}</option>
                ))}
              </select>
              <button type="button" onClick={() => ganti(n.akun_id, n.nama, n.luar_tim)} aria-label={`Batalkan ${n.nama}`} className="min-h-[40px] min-w-[40px] rounded-lg text-lg font-bold text-[#9B1C23]">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
