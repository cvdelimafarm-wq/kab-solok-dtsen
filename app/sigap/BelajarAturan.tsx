"use client";

// app/sigap/BelajarAturan.tsx
//
// (13 Nov 2026, keputusan B, mockup A4b) Kartu "Kegiatan belajar dan mutu": satu sumber aturan per waktu (pra pelatihan, saat pelatihan, saat pendataan).
// Tiap butir: centang dipakai, wajib, tenggat, memblokir tahap, catatan; pembatalan wajib beralasan (siapa dan kapan dicatat). Dipakai di Kelola Pelatihan
// (Materi & Penilaian > Belajar dan mutu) dan Kelola Pendataan (tab 1 · Persiapan). API: /api/portal/kegiatan/belajar. Logika: lib/belajarAturan.ts.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { keadaanButir, LABEL_BUTIR, WAKTU_BELAJAR, type BarisBelajar, type WaktuBelajar } from "@/lib/belajarAturan";

type Data = { kegiatan: { id: number; nama: string; jenis: string | null }; waktu: WaktuBelajar[]; butir: BarisBelajar[]; boleh_kelola: boolean };
const WARNA = { hijau: "bg-[#E3F6EC] text-[#0B6B3F]", kuning: "bg-[#FFF4D6] text-[#8A6200]", merah: "bg-[#FDE8E8] text-[#9B1C23]", abu: "bg-[#EEF1F6] text-[#5B6B84]" };
const masukan = "box-border min-h-[40px] w-full rounded-md border border-[#C5D0E2] bg-white px-2.5 text-[14px] text-[#0F2A52]";
const tombol = "min-h-[40px] rounded-md border px-3 text-[13px] font-semibold disabled:opacity-50";
const tgl = (s: string | null) => (s ? new Date(s).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function Butir({ b, boleh, sibuk, simpan, batal }: {
  b: BarisBelajar; boleh: boolean; sibuk: boolean;
  simpan: (b: BarisBelajar) => Promise<boolean>; batal: (b: BarisBelajar, aksi: "batal" | "pulihkan", alasan: string) => Promise<boolean>;
}) {
  const [isi, setIsi] = useState(b);
  const [alasan, setAlasan] = useState("");
  const [bukaBatal, setBukaBatal] = useState(false);
  useEffect(() => { setIsi(b); }, [b]);
  const k = keadaanButir(b);
  const berubah = isi.aktif !== b.aktif || isi.wajib !== b.wajib || (isi.tenggat ?? "") !== (b.tenggat ?? "") || isi.blokir !== b.blokir || isi.catatan !== b.catatan;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-[13.5px] font-semibold text-[#0F2A52]">
          <input type="checkbox" className="h-4 w-4 shrink-0" checked={isi.aktif} disabled={!boleh || sibuk || !!b.batal_at} onChange={(e) => setIsi({ ...isi, aktif: e.target.checked, wajib: e.target.checked && isi.wajib, blokir: e.target.checked && isi.blokir })} />
          <span className="min-w-0">{LABEL_BUTIR[b.butir]}</span>
        </label>
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${WARNA[k.warna]}`}>{k.teks}</span>
      </div>
      {b.batal_at && (
        <p className="m-0 rounded-md bg-[#FDE8E8] px-2.5 py-1.5 text-[12.5px] text-[#7A1D22]">
          Dibatalkan {tgl(b.batal_at)}{b.batal_oleh ? ` oleh ${b.batal_oleh}` : ""}: {b.batal_alasan}
        </p>
      )}
      {isi.aktif && !b.batal_at && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex min-h-[40px] items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4" checked={isi.wajib} disabled={!boleh || sibuk} onChange={(e) => setIsi({ ...isi, wajib: e.target.checked })} />Wajib</label>
          <label className="flex min-h-[40px] items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4" checked={isi.blokir} disabled={!boleh || sibuk} onChange={(e) => setIsi({ ...isi, blokir: e.target.checked })} />Memblokir tahap berikutnya</label>
          <label className="block min-w-0"><span className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Tenggat</span>
            <input type="date" className={masukan} value={isi.tenggat ?? ""} disabled={!boleh || sibuk} onChange={(e) => setIsi({ ...isi, tenggat: e.target.value || null })} />
          </label>
        </div>
      )}
      {(isi.aktif || isi.catatan) && (
        <label className="block min-w-0"><span className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Catatan</span>
          <input className={masukan} maxLength={300} value={isi.catatan} disabled={!boleh || sibuk} onChange={(e) => setIsi({ ...isi, catatan: e.target.value })} />
        </label>
      )}
      {boleh && (
        <div className="flex flex-wrap gap-2">
          {berubah && <button type="button" className={`${tombol} border-[#1F5FD1] bg-[#1F5FD1] text-white`} disabled={sibuk} onClick={() => void simpan(isi)}>Simpan</button>}
          {berubah && <button type="button" className={`${tombol} border-[#C5D0E2] bg-white text-[#1B2B4B]`} disabled={sibuk} onClick={() => setIsi(b)}>Batal ubah</button>}
          {!berubah && b.id && b.aktif && !b.batal_at && !bukaBatal && <button type="button" className={`${tombol} border-[#C5D0E2] bg-white text-[#7A1D22]`} disabled={sibuk} onClick={() => setBukaBatal(true)}>Batalkan butir ini</button>}
          {!berubah && b.batal_at && <button type="button" className={`${tombol} border-[#C5D0E2] bg-white text-[#1B2B4B]`} disabled={sibuk} onClick={() => void batal(b, "pulihkan", "")}>Pulihkan</button>}
        </div>
      )}
      {bukaBatal && (
        <div className="flex flex-col gap-2 rounded-md bg-[#FFF8F8] px-2.5 py-2">
          <label className="block min-w-0"><span className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Alasan pembatalan (wajib, min. 5 huruf)</span>
            <input className={masukan} maxLength={300} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. sinyal buruk dan aplikasi bermasalah" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${tombol} border-[#9B1C23] bg-[#9B1C23] text-white`} disabled={sibuk || alasan.trim().length < 5} onClick={() => void batal(b, "batal", alasan.trim()).then((ok) => { if (ok) { setBukaBatal(false); setAlasan(""); } })}>Simpan pembatalan</button>
            <button type="button" className={`${tombol} border-[#C5D0E2] bg-white text-[#1B2B4B]`} onClick={() => setBukaBatal(false)}>Tutup</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function BelajarAturan({ kegiatanId }: { kegiatanId?: number | null }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const url = `/api/portal/kegiatan/belajar${kegiatanId ? `?k=${kegiatanId}` : ""}`;
  const muat = useCallback(async () => {
    try { setD(await apiPortal<Data>(url)); setGalat(null); } catch (e) { setGalat(e instanceof Error ? e.message : "Aturan belajar belum bisa dimuat."); }
  }, [url]);
  useEffect(() => { void muat(); }, [muat]);

  const kirim = async (method: "PUT" | "POST", body: Record<string, unknown>): Promise<boolean> => {
    if (!d) return false;
    setSibuk(true); setGalat(null);
    try {
      setD(await apiPortal<Data>("/api/portal/kegiatan/belajar", { method, body: JSON.stringify({ kegiatan_id: d.kegiatan.id, ...body }) }));
      return true;
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
      return false;
    } finally { setSibuk(false); }
  };
  const simpan = (b: BarisBelajar) => kirim("PUT", { waktu: b.waktu, butir: b.butir, aktif: b.aktif, wajib: b.wajib, tenggat: b.tenggat, blokir: b.blokir, catatan: b.catatan });
  const batal = (b: BarisBelajar, aksi: "batal" | "pulihkan", alasan: string) => kirim("POST", { waktu: b.waktu, butir: b.butir, aksi, alasan });

  return (
    <section className="min-w-0 rounded-xl border border-[#DCE3EE] bg-white p-4" aria-label="Kegiatan belajar dan mutu">
      <h2 className="m-0 text-[16px] font-bold text-[#0F2A52]">Kegiatan belajar dan mutu</h2>
      <p className="m-0 mt-0.5 text-[12.5px] text-[#5B6B84]">
        Satu sumber aturan untuk {d ? <b>{d.kegiatan.nama}</b> : "kegiatan ini"}. Centang butir yang dipakai, lalu atur wajib, tenggat, dan blokir tahap. Pengaturan Vanguard lama ikut otomatis.
        Pembatalan mencatat alasan, siapa, dan kapan.
      </p>
      {galat && <p role="alert" className="m-0 mt-2 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
      {!d && !galat && <div className="mt-2 h-32 animate-pulse rounded-xl bg-[#F3F6FA]" aria-busy="true" />}
      {d && (
        <div className="mt-3 flex flex-col gap-3">
          {WAKTU_BELAJAR.filter((w) => d.waktu.includes(w.kode)).map((w) => (
            <div key={w.kode} className="flex flex-col gap-2">
              <h3 className="m-0 text-[13.5px] font-bold uppercase tracking-[.3px] text-[#44546F]">{w.label}</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {d.butir.filter((b) => b.waktu === w.kode).map((b) => <Butir key={`${b.waktu}-${b.butir}`} b={b} boleh={d.boleh_kelola} sibuk={sibuk} simpan={simpan} batal={batal} />)}
              </ul>
            </div>
          ))}
          {!d.boleh_kelola && <p className="m-0 text-[12.5px] text-[#5B6B84]">Anda hanya dapat melihat aturan ini.</p>}
        </div>
      )}
    </section>
  );
}
