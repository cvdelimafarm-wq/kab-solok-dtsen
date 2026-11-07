"use client";

// app/sigap/sampel/WilayahSaya.tsx
//
// (7 Nov 2026) "Wilayah saya": sub SLS yang dialokasikan kepada PPL (atau semua PPL bawahan PML), lengkap dengan NKS (penanda), target sampel, dan daftar KK master
// sub SLS itu (nama, anggota ruta lain, patokan, Arahkan/Peta). Hanya-baca; penandaan sampel menyusul pada tahap berikutnya. Mengikuti gaya KartuSls.

import { useEffect, useMemo, useState } from "react";
import { LABEL_MODEL, kodeSubslsPendek, type DataAlokasiSaya, type KkMaster, type WilayahAlokasi } from "@/lib/alokasiWilayah";
import { tautanLihatSampel, tautanPetaSampel } from "@/lib/sampelSls";

function BarisKk({ k, no }: { k: KkMaster; no: number }) {
  return (
    <li className="flex items-start gap-2.5 border-t border-[#EEF2F7] px-3 py-2.5 first:border-t-0">
      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-[#EEF2F7] text-[11px] font-bold text-[#44546F]">{no}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-snug text-[#0F2A52]">{k.nama_kk}</p>
        {k.anggota_lain && <p className="text-[12px] leading-snug text-[#55657D]">Anggota ruta lain: {k.anggota_lain}</p>}
        {k.patokan && <p className="text-[12px] leading-snug text-[#55657D]">Patokan: {k.patokan}</p>}
        {k.lat != null && k.lng != null && (
          <span className="mt-1.5 flex gap-1.5">
            <a href={tautanPetaSampel(k.lat, k.lng)} target="_blank" rel="noopener noreferrer" className="grid min-h-[40px] place-items-center rounded-[10px] bg-[#EAF1FC] px-3 text-[12.5px] font-bold text-[#1F5FD1] active:bg-[#DCE8FB]" aria-label={`Arahkan ke ${k.nama_kk}`}>
              Arahkan
            </a>
            <a href={tautanLihatSampel(k.lat, k.lng)} target="_blank" rel="noopener noreferrer" className="grid min-h-[40px] place-items-center rounded-[10px] border border-[#DCE5F2] bg-white px-3 text-[12.5px] font-bold text-[#44546F] active:bg-[#F1F5FC]" aria-label={`Lihat peta ${k.nama_kk}`}>
              Peta
            </a>
          </span>
        )}
      </div>
    </li>
  );
}

function KartuWilayah({ w, tampilPpl, terbukaAwal, muatKk }: { w: WilayahAlokasi; tampilPpl: boolean; terbukaAwal: boolean; muatKk: (id: string) => Promise<{ kk: KkMaster[]; salinan: boolean }> }) {
  const [buka, setBuka] = useState(terbukaAwal);
  const [kk, setKk] = useState<KkMaster[] | null>(null);
  const [salinan, setSalinan] = useState(false);
  const [galat, setGalat] = useState("");
  const [cari, setCari] = useState("");

  useEffect(() => {
    if (!buka || kk !== null) return;
    let batal = false;
    muatKk(w.idsubsls)
      .then((r) => {
        if (batal) return;
        setKk(r.kk);
        setSalinan(r.salinan);
        setGalat("");
      })
      .catch((e) => {
        if (!batal) setGalat(e instanceof Error ? e.message : "Daftar KK belum bisa dimuat.");
      });
    return () => {
      batal = true;
    };
  }, [buka, kk, w.idsubsls, muatKk]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (kk ?? []).filter((k) => !q || k.nama_kk.toLowerCase().includes(q) || (k.anggota_lain ?? "").toLowerCase().includes(q));
  }, [kk, cari]);

  return (
    <section className="overflow-hidden rounded-[18px] bg-white shadow-[0_6px_18px_rgba(15,42,82,.07)]">
      <button type="button" onClick={() => setBuka((b) => !b)} aria-expanded={buka} className="flex w-full items-center gap-2 px-3.5 py-3 text-left active:bg-[#F7FAFF]">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#6B7A90]">
            Sub SLS{w.nks ? ` · NKS ${w.nks}` : ""}
            {tampilPpl && w.ppl_nama ? ` · ${w.ppl_nama}` : ""}
          </p>
          <p className="break-all font-mono text-[13.5px] font-bold text-[#0F2A52]" title={w.idsubsls}>
            {kodeSubslsPendek(w.idsubsls)}
          </p>
          <p className="mt-0.5 text-[12px] text-[#55657D]">
            {w.nagari} · {w.sls}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#44546F]">
            Target {w.target} sampel · {w.jumlah_kk > 0 ? `${w.jumlah_kk} KK di daftar` : "daftar KK belum ada"}
          </p>
        </div>
        <span aria-hidden="true" className="flex-none text-[#6B7A90]">
          {buka ? "▴" : "▾"}
        </span>
      </button>
      {buka && (
        <div className="border-t border-[#EEF2F7]">
          {salinan && <p className="bg-[#FFF4D6] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#8A6200]">Tidak tersambung. Menampilkan salinan terakhir di HP.</p>}
          {galat && <p className="px-3.5 py-3 text-[13px] text-[#7A1D22]">{galat}</p>}
          {!galat && kk === null && <p className="px-3.5 py-3 text-[13px] text-[#55657D]" aria-busy="true">Memuat daftar KK…</p>}
          {kk !== null && kk.length === 0 && <p className="px-3.5 py-3 text-[13px] text-[#55657D]">Daftar KK sub SLS ini belum ada di master. Hubungi admin kegiatan.</p>}
          {kk !== null && kk.length > 0 && (
            <>
              {kk.length > 12 && (
                <div className="px-3 pt-2.5">
                  <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama KK…" aria-label="Cari nama KK" className="min-h-[44px] w-full rounded-[12px] border border-[#DCE5F2] bg-[#F7FAFF] px-3 text-[14px] text-[#0F2A52] outline-none focus:border-[#1F5FD1]" />
                </div>
              )}
              <ol>
                {tampil.map((k, i) => (
                  <BarisKk key={k.id} k={k} no={i + 1} />
                ))}
                {tampil.length === 0 && <li className="px-3.5 py-3 text-[13px] text-[#55657D]">Tidak ada KK yang cocok dengan pencarian.</li>}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function WilayahSaya({
  data,
  muatKk,
  luring,
}: {
  data: DataAlokasiSaya;
  muatKk: (id: string) => Promise<{ kk: KkMaster[]; salinan: boolean }>;
  luring: boolean;
}) {
  const peran = data.peran;
  const model = data.konfig.dengan_updating ? "dengan" : "tanpa";
  const grup = useMemo(() => {
    const m = new Map<number, { nama: string; sub: WilayahAlokasi[] }>();
    for (const w of data.wilayah) {
      const id = w.ppl_akun_id ?? 0;
      const g = m.get(id) ?? { nama: w.ppl_nama ?? "PPL", sub: [] };
      g.sub.push(w);
      m.set(id, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].nama.localeCompare(b[1].nama));
  }, [data.wilayah]);
  const totalTarget = data.wilayah.reduce((s, w) => s + w.target, 0);
  if (data.wilayah.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Wilayah saya">
      <div className="px-1 pt-1">
        <h2 className="text-[14px] font-extrabold text-[#0F2A52]">Wilayah {peran === "pml" ? "PPL saya" : "saya"}</h2>
        <p className="text-[11.5px] font-semibold text-[#55657D]">
          {data.wilayah.length} sub SLS · target {totalTarget} sampel · {LABEL_MODEL[model].judul.toLowerCase()}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-[#55657D]">{model === "dengan" ? "Lakukan updating di FASIH lebih dulu; penandaan sampel dibuka setelah updating." : "Tanpa updating: sampel utama dan cadangan langsung ditandai dari daftar KK ini."}</p>
        {luring && <p className="mt-1 rounded-[10px] bg-[#FFF4D6] px-2.5 py-1.5 text-[12px] font-semibold text-[#8A6200]">Tidak tersambung. Menampilkan data terakhir yang tersimpan di HP.</p>}
      </div>
      {peran === "ppl" && data.wilayah.map((w, i) => <KartuWilayah key={w.id} w={w} tampilPpl={false} terbukaAwal={data.wilayah.length <= 2 && i === 0} muatKk={muatKk} />)}
      {peran === "pml" &&
        grup.map(([id, g]) => (
          <div key={id} className="space-y-2">
            <p className="px-1 pt-1 text-[13px] font-extrabold text-[#0F2A52]">{g.nama}</p>
            {g.sub.map((w) => (
              <KartuWilayah key={w.id} w={w} tampilPpl={false} terbukaAwal={false} muatKk={muatKk} />
            ))}
          </div>
        ))}
    </section>
  );
}
