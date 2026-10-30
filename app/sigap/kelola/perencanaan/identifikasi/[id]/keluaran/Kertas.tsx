"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/keluaran/Kertas.tsx
//
// (28 Okt 2026) Kertas A4 "Permintaan pengadaan" satu butir untuk dicetak dari peramban (cetak -> simpan sebagai PDF). Hanya penyajian isi paket; nilai di sini
// perkiraan menurut RAB (metode dan nilai pengadaan ditetapkan PPK atau pejabat pengadaan; cek aturan).

import { useEffect } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { createPortal } from "react-dom";
import { KOLOM_SPEK, type ButirKeluaran, type IdentitasKeluaran } from "@/lib/keu/keluaran";
import { rupiah } from "@/lib/keu/ro";
import { tombol } from "@/app/sigap/keu-ui";

const tgl = (t: string | null): string => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : "-");

export function Kertas({ butir, survei, ver, onTutup }: { butir: ButirKeluaran; survei: IdentitasKeluaran; ver: number | null; onTutup: () => void }) {
  useTutupDenganBack(true, onTutup); // (31 Okt 2026) Back HP menutup lapisan ini
  useEffect(() => {
    const judul = document.title;
    document.title = `Permintaan pengadaan - ${butir.uraian}`.slice(0, 80);
    const tutupEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", tutupEsc);
    return () => { document.title = judul; window.removeEventListener("keydown", tutupEsc); };
  }, [butir.uraian, onTutup]);
  if (typeof document === "undefined") return null;
  const kol = KOLOM_SPEK[butir.jenis].filter((k) => butir.spek.isi[k.kunci]);
  return createPortal(
    <div id="kertas-cetak" className="fixed inset-0 z-[100] overflow-auto bg-[#E9EDF4] p-3 print:static print:overflow-visible print:bg-white print:p-0" role="dialog" aria-modal="true" aria-label="Pratinjau permintaan pengadaan">
      <style>{`
        @media print {
          body > *:not(#kertas-cetak) { display: none !important; }
          #kertas-cetak { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
          #kertas-cetak .tanpa-cetak { display: none !important; }
          #kertas-cetak .lembar { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; }
          @page { size: A4; margin: 18mm 16mm; }
        }
      `}</style>
      <div className="tanpa-cetak mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-[#44546F]">Pratinjau. Tekan Cetak lalu pilih &quot;Simpan sebagai PDF&quot; bila perlu berkas.</p>
        <div className="flex gap-2">
          <button type="button" className={`${tombol} bg-[#0F2A52] text-white`} onClick={() => window.print()}>Cetak / PDF</button>
          <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={onTutup}>Tutup</button>
        </div>
      </div>
      <article className="lembar mx-auto box-border w-full max-w-[210mm] bg-white p-[14mm] text-[11.5pt] leading-snug text-black shadow-md">
        <header className="mb-4 border-b-2 border-black pb-2 text-center">
          <p className="text-[10.5pt] font-semibold uppercase">Badan Pusat Statistik Kabupaten Solok</p>
          <h1 className="mt-1 text-[14pt] font-bold uppercase">Permintaan Pengadaan {butir.jenis === "Perlengkapan" ? "Barang" : "Barang/Jasa"}</h1>
          <p className="text-[10.5pt]">{survei.identNama} · RO {survei.roKode} · Tahun {survei.tahun}</p>
          <p className="text-[9.5pt] text-[#333]">Dari RAB nomor {survei.rabNomor || "-"}{ver !== null ? ` · paket keluaran versi ${ver}` : " · pratinjau (belum diajukan)"}</p>
        </header>
        <table className="mb-3 w-full border-collapse text-[11pt]">
          <tbody>
            {([
              ["Butir", butir.uraian], ["Jenis", butir.jenis], ["Akun belanja", butir.akun],
              ["Perkiraan nilai (RAB)", butir.nilaiRab !== null ? `${rupiah(butir.nilaiRab)}${butir.perkiraan ? " (perkiraan)" : ""}` : butir.digabung ? "Digabung dengan butir lain" : "Belum ada rincian RAB"],
              ["Dibutuhkan", butir.butuhMulai ? `${tgl(butir.butuhMulai)}${butir.butuhSelesai && butir.butuhSelesai !== butir.butuhMulai ? ` s.d. ${tgl(butir.butuhSelesai)}` : ""}` : "-"],
              ["Tempat", butir.tempat || "-"], ["Paket", butir.paket || "-"],
            ] as [string, string][]).map(([k, v]) => (
              <tr key={k} className="align-top"><td className="w-[38mm] border border-black px-2 py-1 font-semibold">{k}</td><td className="border border-black px-2 py-1">{v}</td></tr>
            ))}
          </tbody>
        </table>
        {kol.length > 0 && (
          <>
            <h2 className="mb-1 text-[11.5pt] font-bold">Spesifikasi</h2>
            <table className="mb-3 w-full border-collapse text-[11pt]"><tbody>
              {kol.map((k) => <tr key={k.kunci} className="align-top"><td className="w-[38mm] border border-black px-2 py-1 font-semibold">{k.label}</td><td className="border border-black px-2 py-1">{butir.spek.isi[k.kunci]}</td></tr>)}
            </tbody></table>
          </>
        )}
        {butir.spek.barang.length > 0 && (
          <>
            <h2 className="mb-1 text-[11.5pt] font-bold">Rincian barang</h2>
            <table className="mb-3 w-full border-collapse text-[10.5pt]">
              <thead><tr className="bg-[#EEE]"><th className="w-[8mm] border border-black px-1 py-1">No</th><th className="border border-black px-2 py-1 text-left">Nama barang</th><th className="w-[28mm] border border-black px-2 py-1">Jumlah</th><th className="border border-black px-2 py-1 text-left">Spesifikasi</th></tr></thead>
              <tbody>{butir.spek.barang.map((x, i) => (
                <tr key={i} className="align-top"><td className="border border-black px-1 py-1 text-center">{i + 1}</td><td className="border border-black px-2 py-1">{x.nama}</td><td className="border border-black px-2 py-1 text-center">{x.jumlah} {x.satuan}</td><td className="border border-black px-2 py-1">{x.spesifikasi}</td></tr>
              ))}</tbody>
            </table>
          </>
        )}
        {butir.spek.catatan && <p className="mb-3"><span className="font-semibold">Catatan:</span> {butir.spek.catatan}</p>}
        {butir.perlu.length > 0 && <p className="mb-3 text-[10.5pt]"><span className="font-semibold">Masih perlu dilengkapi:</span> {butir.perlu.join("; ")}.</p>}
        <p className="mb-6 text-[9.5pt] italic text-[#333]">Nilai dan metode pengadaan ditetapkan PPK atau pejabat pengadaan; angka di atas hanya perkiraan menurut RAB (cek aturan).</p>
        <div className="grid grid-cols-2 gap-8 text-center text-[11pt]">
          <div><p>Pemohon</p><div className="h-20" /><p className="border-t border-black pt-1">(.......................................)</p></div>
          <div><p>Penerima permintaan (PBJ)</p><div className="h-20" /><p className="border-t border-black pt-1">(.......................................)</p></div>
        </div>
      </article>
    </div>,
    document.body,
  );
}
