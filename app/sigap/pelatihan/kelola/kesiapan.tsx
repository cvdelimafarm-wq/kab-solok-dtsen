"use client";

// app/sigap/pelatihan/kelola/kesiapan.tsx
//
// (8 Nov 2026) Kartu Kesiapan: satu tempat untuk melihat apakah pelatihan siap, dengan tombol "Perbaiki" ke tempat yang tepat.
// Data: GET /api/sigap/pelatihan/admin?bagian=kesiapan (hanya baca; hitungan di lib/sigapKesiapan.ts). Butir WAJIB menentukan lencana Siap.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN_O, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import type { Butir, HasilKesiapan, StatusButir } from "@/lib/sigapKesiapan";

const URL_ADMIN = "/api/sigap/pelatihan/admin";

const TITIK: Record<StatusButir, { teks: string; kelas: string; label: string }> = {
  ok: { teks: "✓", kelas: "bg-[#E3F6EC] text-[#13794B]", label: "Siap" },
  kuning: { teks: "!", kelas: "bg-[#FFF4D6] text-[#8A6200]", label: "Perlu perhatian" },
  merah: { teks: "!", kelas: "bg-[#FDE8E8] text-[#B42329]", label: "Mendesak" },
  info: { teks: "i", kelas: "bg-[#EEF2F7] text-[#5B6B84]", label: "Informasi" },
};

function teksWaktu(h: HasilKesiapan): string {
  if (h.hariKe === null) return "Tanggal pelatihan belum diisi";
  if (h.berakhir) return "Pelatihan sudah selesai";
  if (h.hariKe > 1) return `Pelatihan mulai ${h.hariKe} hari lagi (H-${h.hariKe})`;
  if (h.hariKe === 1) return "Pelatihan mulai besok (H-1)";
  if (h.hariKe === 0) return "Pelatihan berlangsung hari ini";
  return "Pelatihan sudah dimulai";
}

function BarisButir({ b, onBuka }: { b: Butir; onBuka: (tab: string, sub?: string) => void }) {
  const t = TITIK[b.status];
  const perluPerbaiki = b.status === "kuning" || b.status === "merah";
  return (
    <li className="rounded-lg border border-[#EDF0F4] bg-white px-3 py-2">
      <div className="flex items-start gap-2.5">
        <span aria-label={t.label} title={t.label} className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${t.kelas}`}>{t.teks}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-[#0F2A52]">
            {b.judul}
            {b.wajib && <span className="ml-1.5 text-[10.5px] font-semibold text-[#6B7A90]">wajib</span>}
          </div>
          <div className="text-[12.5px] text-[#44546F]">{b.ringkas}</div>
          {b.rincian.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[12px] font-semibold text-[#1F5FD1]">Lihat rincian ({b.rincian.length})</summary>
              <ul className="m-0 mt-1 list-disc pl-5 text-[12px] text-[#55657D]">
                {b.rincian.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </details>
          )}
        </div>
        {perluPerbaiki && <button type="button" className={`${BTN_O} shrink-0`} onClick={() => onBuka(b.tab, b.sub)}>Perbaiki</button>}
      </div>
    </li>
  );
}

export default function KesiapanKartu({ onBuka }: { onBuka: (tab: string, sub?: string) => void }) {
  const [h, setH] = useState<HasilKesiapan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setH(await fetchJson<HasilKesiapan>(`${URL_ADMIN}?bagian=kesiapan`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);

  if (galat && !h) return <Kartu judul="Kesiapan pelatihan"><Pesan onTutup={() => setGalat(null)}>{galat}</Pesan></Kartu>;
  if (!h) return <Kartu judul="Kesiapan pelatihan"><Memuat /></Kartu>;

  const wajib = h.butir.filter((b) => b.wajib);
  const lain = h.butir.filter((b) => !b.wajib);
  const lencana = h.siap ? <Chip w="ok">Siap</Chip> : h.mendesak ? <Chip w="bad">Belum siap · mendesak</Chip> : h.berakhir ? <Chip w="mut">Tidak lengkap · sudah selesai</Chip> : <Chip w="wait">Belum siap</Chip>;

  return (
    <Kartu
      judul="✅ Kesiapan pelatihan"
      ket={`${h.wajibOk} dari ${h.wajibTotal} butir wajib siap · ${teksWaktu(h)}`}
      kanan={<div className="flex items-center gap-2">{lencana}<button type="button" className={BTN_O} disabled={memuat} onClick={() => void muat()}>{memuat ? "Memuat…" : "Muat ulang"}</button></div>}
    >
      {galat && <div className="mb-2"><Pesan onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
      <p className="mb-2 text-[12px] text-[#6B7A90]">
        Lencana Siap dihitung dari butir wajib; butir lain bersifat perhatian. Mulai H-3, butir wajib yang belum siap berubah merah. Kesiapan hanya membaca data, tidak mengubah apa pun.
      </p>
      <div className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-[#55657D]">Butir wajib</div>
      <ul className="m-0 mb-3 grid list-none gap-1.5 p-0">{wajib.map((b) => <BarisButir key={b.kode} b={b} onBuka={onBuka} />)}</ul>
      <div className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-[#55657D]">Butir perhatian</div>
      <ul className="m-0 grid list-none gap-1.5 p-0">{lain.map((b) => <BarisButir key={b.kode} b={b} onBuka={onBuka} />)}</ul>
    </Kartu>
  );
}
