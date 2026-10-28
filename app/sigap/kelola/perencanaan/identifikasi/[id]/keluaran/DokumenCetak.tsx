"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/keluaran/DokumenCetak.tsx
//
// (29 Okt 2026) Kartu "Dokumen cetak" pada halaman keluaran: laporan rencana pelaksanaan untuk Kepala, kebutuhan administrasi untuk PJ administrasi, dan KAK terbaru.
// Semuanya dibentuk dari data TERBARU (RAB berlaku, identifikasi lanjutan) setiap kali dibuka; tidak ada yang disimpan di basis data. Hanya teks manual KAK yang
// diingat di peramban ini (per identifikasi). Penyusun: lib/keu/dokumenLanjutan.ts. Cetak: window.print (Simpan sebagai PDF).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Catatan, Chip, judulKartu, kartu, kolom, label, tombol } from "@/app/sigap/keu-ui";
import {
  bacaTeksKak, kakBelumDiisi, KAK_KOSONG, perhatianLaporan, susunKak, susunKebutuhanAdministrasi, susunLaporanKepala, type Dokumen, type KonteksLanjutan, type Tabel, type TeksKak,
} from "@/lib/keu/dokumenLanjutan";

const simpanKunci = (identId: number): string => `sigap.kak.${identId}`;
function bacaSimpanan(identId: number): TeksKak {
  try { const t = typeof window === "undefined" ? null : window.localStorage.getItem(simpanKunci(identId)); return bacaTeksKak(t ? JSON.parse(t) : null); } catch { return KAK_KOSONG; }
}

function TabelCetak({ t }: { t: Tabel }) {
  return (
    <table className="mb-3 w-full border-collapse text-[10pt]">
      <thead><tr className="bg-[#EEE]">{t.kolom.map((k, i) => <th key={i} className={`border border-black px-1.5 py-1 font-semibold ${t.kanan?.includes(i) ? "text-right" : "text-left"}`}>{k}</th>)}</tr></thead>
      <tbody>
        {t.baris.map((b, n) => (
          <tr key={n} className="align-top [break-inside:avoid]">{b.map((c, i) => <td key={i} className={`whitespace-pre-wrap border border-black px-1.5 py-1 ${t.kanan?.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function KertasDokumen({ d, tanggal, onTutup }: { d: Dokumen; tanggal: string; onTutup: () => void }) {
  useEffect(() => {
    const judul = document.title;
    document.title = `${d.judul} - ${d.subjudul}`.slice(0, 90);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", esc);
    return () => { document.title = judul; window.removeEventListener("keydown", esc); };
  }, [d.judul, d.subjudul, onTutup]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div id="kertas-cetak" className="fixed inset-0 z-[100] overflow-auto bg-[#E9EDF4] p-3 print:static print:overflow-visible print:bg-white print:p-0" role="dialog" aria-modal="true" aria-label={`Pratinjau ${d.judul}`}>
      <style>{`
        @media print {
          body > *:not(#kertas-cetak) { display: none !important; }
          #kertas-cetak { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
          #kertas-cetak .tanpa-cetak { display: none !important; }
          #kertas-cetak .lembar { box-shadow: none !important; margin: 0 !important; width: auto !important; max-width: none !important; padding: 0 !important; }
          #kertas-cetak .halaman-baru { break-before: page; }
          @page { size: A4; margin: 16mm 14mm; }
        }
      `}</style>
      <div className="tanpa-cetak mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-[#44546F]">Pratinjau data terbaru. Tekan Cetak lalu pilih &quot;Simpan sebagai PDF&quot; bila perlu berkas.</p>
        <div className="flex gap-2">
          <button type="button" className={`${tombol} bg-[#0F2A52] text-white`} onClick={() => window.print()}>Cetak / PDF</button>
          <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={onTutup}>Tutup</button>
        </div>
      </div>
      <article className="lembar mx-auto box-border w-full max-w-[210mm] bg-white p-[14mm] text-[10.5pt] leading-snug text-black shadow-md">
        <header className="mb-4 border-b-2 border-black pb-2 text-center">
          <p className="text-[10pt] font-semibold uppercase">Badan Pusat Statistik Kabupaten Solok</p>
          <h1 className="mt-1 text-[14pt] font-bold uppercase">{d.judul}</h1>
          <p className="text-[10.5pt]">{d.subjudul}</p>
          <p className="text-[9pt] text-[#333]">Dicetak {tanggal}</p>
        </header>
        {d.blok.map((b, i) => (
          <section key={i} className={`mb-3 ${b.halamanBaru ? "halaman-baru" : ""}`}>
            {b.judul && <h2 className="mb-1 text-[11pt] font-bold">{b.judul}</h2>}
            {b.teks?.map((p, n) => <p key={n} className={`mb-1.5 ${b.manual ? "italic text-[#7A5A00]" : ""}`}>{p}</p>)}
            {b.daftar && <ul className="mb-2 list-disc space-y-0.5 pl-5">{b.daftar.map((x, n) => <li key={n}>{x}</li>)}</ul>}
            {b.tabel?.map((t, n) => <TabelCetak key={n} t={t} />)}
          </section>
        ))}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center [break-inside:avoid]">
          {d.tandaTangan.map((s, i) => (
            <div key={i}><p>{s.jabatan}</p><div className="h-20" /><p className="border-t border-black pt-1">{s.nama ? s.nama : "(.......................................)"}</p></div>
          ))}
        </div>
      </article>
    </div>,
    document.body,
  );
}

type Jenis = "laporan" | "administrasi" | "kak";

export function KartuDokumenCetak({ identId, k, tanggal, siap }: { identId: number; k: KonteksLanjutan | null; tanggal: string; siap: boolean }) {
  const [teks, setTeks] = useState<TeksKak>(KAK_KOSONG);
  const [buka, setBuka] = useState<Jenis | null>(null);
  const [sunting, setSunting] = useState(false);
  useEffect(() => { setTeks(bacaSimpanan(identId)); }, [identId]);
  const ubah = (p: Partial<TeksKak>) => {
    setTeks((a) => {
      const baru = { ...a, ...p };
      try { window.localStorage.setItem(simpanKunci(identId), JSON.stringify(baru)); } catch { /* simpanan peramban tidak wajib */ }
      return baru;
    });
  };
  const dokumen = useMemo<Dokumen | null>(() => {
    if (!k || !buka) return null;
    return buka === "laporan" ? susunLaporanKepala(k) : buka === "administrasi" ? susunKebutuhanAdministrasi(k) : susunKak(k, teks);
  }, [k, buka, teks]);
  const perhatian = useMemo(() => (k ? perhatianLaporan(k) : []), [k]);
  const kurang = kakBelumDiisi(teks);
  const BAGIAN_KAK: [keyof TeksKak, string][] = [["latar", "Latar belakang"], ["tujuan", "Maksud dan tujuan"], ["dasar", "Dasar hukum"], ["keluaran", "Keluaran"], ["penutup", "Penutup"]];

  return (
    <section className={`${kartu} space-y-3`} aria-label="Dokumen cetak">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={judulKartu}>Dokumen cetak</h2>
        <span className="text-[12px] font-semibold text-[#6B7A93]">selalu dari data terbaru</span>
      </div>
      <p className="text-[12.5px] text-[#44546F]">Dibentuk ulang setiap dibuka dari RAB yang berlaku dan identifikasi lanjutan; tidak tersimpan dan tidak dikirim ke siapa pun.</p>
      {!siap && <Catatan>Menunggu data RAB dan master dokumen…</Catatan>}
      {k && perhatian.length > 0 && <p className="text-[12.5px] text-[#7A5A00]">{perhatian.length} hal perlu diperhatikan; ringkasnya tercantum pada laporan untuk Kepala.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!k} className={`${tombol} bg-[#0F2A52] text-white`} onClick={() => setBuka("laporan")}>Laporan untuk Kepala</button>
        <button type="button" disabled={!k} className={`${tombol} bg-[#0F2A52] text-white`} onClick={() => setBuka("administrasi")}>Kebutuhan administrasi (PJ administrasi)</button>
        <button type="button" disabled={!k} className={`${tombol} bg-[#0F2A52] text-white`} onClick={() => setBuka("kak")}>KAK terbaru</button>
      </div>
      <div className="space-y-2 rounded-lg bg-[#F5F8FE] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-[#0F2A52]">Teks KAK yang diisi manual</p>
          <div className="flex items-center gap-2">
            {kurang.length > 0 ? <Chip warna="kuning">{kurang.length} bagian kosong</Chip> : <Chip warna="hijau">Lengkap</Chip>}
            <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => setSunting((v) => !v)}>{sunting ? "Tutup" : "Isi atau ubah"}</button>
          </div>
        </div>
        {sunting && (
          <div className="space-y-2">
            {BAGIAN_KAK.map(([kunci, nama]) => (
              <div key={kunci}>
                <label className={label} htmlFor={`kak-${kunci}`}>{nama}</label>
                <textarea id={`kak-${kunci}`} className={`${kolom} min-h-[72px]`} maxLength={4000} value={teks[kunci]} onChange={(e) => ubah({ [kunci]: e.target.value })} />
              </div>
            ))}
            <p className="text-[12px] text-[#6B7A93]">Teks ini hanya diingat di peramban ini (belum di basis data); salin ke tempat lain bila perlu dipakai di perangkat berbeda.</p>
          </div>
        )}
      </div>
      {dokumen && <KertasDokumen d={dokumen} tanggal={tanggal} onTutup={() => setBuka(null)} />}
    </section>
  );
}
