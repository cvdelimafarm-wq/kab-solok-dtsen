"use client";

// app/sigap/sampel/page.tsx
//
// (30 Okt 2026) Sampel per SLS di HP petugas (Sakernas, Seruti, IMK). Alamat: /sigap/sampel?k=<kegiatan>.
// PPL: SLS miliknya -> sampel utama (nama responden, anggota ruta lain, Arahkan/Peta) + cadangan; "Ganti dengan cadangan" mengikuti aturan server.
// PML: hanya-baca, dikelompokkan per PPL -> SLS dengan rekap. Tampilan mengikuti Lembar Pendataan (header navy + tab bersegmen).

import { useEffect, useMemo, useState } from "react";
import TombolKembali from "@/app/components/TombolKembali";
import { kelompokPpl, kelompokSls, rekapSampel, type SampelRow } from "@/lib/sampelSls";
import { useSampelSaya } from "./useSampel";
import KartuSls from "./KartuSls";
import SheetGanti from "./SheetGanti";

function Angka({ nilai, label }: { nilai: number; label: string }) {
  return (
    <div className="flex-1 rounded-[12px] bg-white px-2 py-2 text-center shadow-[0_3px_10px_rgba(15,42,82,.06)]">
      <div className="text-[18px] font-extrabold leading-none text-[#0F2A52]">{nilai}</div>
      <div className="mt-1 text-[10.5px] font-semibold text-[#6B7A90]">{label}</div>
    </div>
  );
}

export default function HalamanSampel() {
  const [kegiatan, setKegiatan] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    try {
      const n = Number(new URLSearchParams(window.location.search).get("k"));
      setKegiatan(Number.isInteger(n) && n > 0 ? n : null);
    } catch {
      setKegiatan(null);
    }
  }, []);

  const { data, galat, luring, memuat, muat, ganti, batal } = useSampelSaya(kegiatan ?? null);
  const [diganti, setDiganti] = useState<SampelRow | null>(null);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const rows = data?.sampel ?? [];
  const grupSls = useMemo(() => kelompokSls(rows), [rows]);
  const grupPpl = useMemo(() => kelompokPpl(rows), [rows]);
  const rekap = useMemo(() => rekapSampel(rows), [rows]);
  const peran = data?.peran ?? null;
  const bisaGanti = peran === "ppl" && !!data?.konfig.boleh_ganti;

  async function batalkan(cadangan: SampelRow) {
    if (sibuk) return;
    if (!window.confirm(`Batalkan penggantian? ${cadangan.menggantikan_id ? "Sampel utama kembali dipakai." : ""}`)) return;
    setSibuk(true);
    setPesan("");
    try {
      await batal(cadangan.id);
      setPesan("Penggantian dibatalkan.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Penggantian gagal dibatalkan.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh_-_var(--tinggi-banner,0px))] flex-col bg-[#F2F6FC] text-[#1B2B4B]">
      <header className="flex-none bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-3 pb-3 pt-2 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16.5px] font-extrabold leading-[1.15]">Sampel per SLS</h1>
            <p className="truncate text-[11.5px] text-[#A9BCD8]">{data ? `${data.kegiatan.nama} · ${peran === "pml" ? "PML" : "PPL"}` : "Memuat…"}</p>
          </div>
          <button type="button" onClick={() => void muat()} disabled={memuat} className="min-h-[44px] flex-none rounded-[12px] bg-white/15 px-3 text-[12.5px] font-bold text-white active:bg-white/25 disabled:opacity-60">
            {memuat ? "Memuat…" : "Muat ulang"}
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-2.5 px-2.5 pb-8 pt-2.5">
        {kegiatan === null && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">Alamat halaman tidak lengkap (kegiatan tidak disebutkan). Buka dari menu tahap.</p>}
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {luring && <p className="rounded-[14px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold text-[#8A6200]">Tidak tersambung. Menampilkan data terakhir yang tersimpan di HP; penggantian sampel butuh sinyal.</p>}
        {pesan && (
          <p role="status" className="rounded-[14px] bg-[#E8F6EE] px-3 py-2 text-[13px] font-semibold text-[#13794B]">
            {pesan}
          </p>
        )}
        {!data && !galat && kegiatan !== null && (
          <div className="rounded-[18px] bg-white p-4" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}

        {data && (
          <>
            <div className="flex gap-2">
              {peran === "pml" && <Angka nilai={rekap.ppl} label="PPL" />}
              <Angka nilai={rekap.sls} label="SLS" />
              <Angka nilai={rekap.utama} label="Sampel utama" />
              <Angka nilai={rekap.diganti} label="Diganti" />
            </div>

            {rows.length === 0 && <p className="rounded-[18px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">Belum ada sampel yang dialokasikan kepada Anda pada kegiatan ini. Hubungi admin kegiatan bila ini keliru.</p>}

            {peran === "ppl" && grupSls.map((g, i) => <KartuSls key={`${g.ppl_akun_id}-${g.kode_sls}`} grup={g} semua={rows} bisaGanti={bisaGanti} tampilPpl={false} terbukaAwal={grupSls.length <= 2 || i === 0} onGanti={setDiganti} onBatal={(c) => void batalkan(c)} />)}

            {peran === "pml" &&
              grupPpl.map((p) => (
                <section key={p.ppl_akun_id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2 px-1 pt-1">
                    <h2 className="min-w-0 truncate text-[14px] font-extrabold text-[#0F2A52]">{p.ppl_nama}</h2>
                    <span className="flex-none text-[11.5px] font-semibold text-[#55657D]">
                      {p.sls.length} SLS · {p.utama} sampel{p.diganti > 0 ? ` · ${p.diganti} diganti` : ""}
                    </span>
                  </div>
                  {p.sls.map((g) => (
                    <KartuSls key={`${g.ppl_akun_id}-${g.kode_sls}`} grup={g} semua={rows} bisaGanti={false} tampilPpl={false} terbukaAwal={false} onGanti={() => {}} onBatal={() => {}} />
                  ))}
                </section>
              ))}
          </>
        )}
      </div>

      {diganti && (
        <SheetGanti
          utama={diganti}
          semua={rows}
          onTutup={() => setDiganti(null)}
          onSimpan={async (cadanganId, alasan) => {
            await ganti(diganti.id, cadanganId, alasan);
            setDiganti(null);
            setPesan("Penggantian tersimpan.");
          }}
        />
      )}
    </main>
  );
}
