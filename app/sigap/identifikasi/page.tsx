"use client";

// app/sigap/identifikasi/page.tsx
//
// (10 Okt 2026) Lembar Identifikasi SLS -- daftar Sub SLS yang dibagikan ke PML sebagai pelaksana atau pendamping (pembagian terpisah dari plotting PPL;
// satu SLS utuh dipegang 1 PML terdekat, tanggung jawab tetap berdua; hasil dipakai bersama) (mockup disetujui user). Per baris: KK tinggal, perkiraan terdampak awal,
// hasil identifikasi. Sub SLS yang dinyatakan TIDAK TERDAMPAK diberi warna & tulisan "Aman" (permintaan user). Ikon peta di sebelah nama nagari
// membuka peta WA (desa) & peta SLS. Mulai berlaku 10 Okt 2026 (tahap Pendataan).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { keAtas } from "@/app/portal/navigasi";
import { keadaanSub, kodeDesa, type SubIdentifikasi } from "@/lib/identifikasi";
import PetaSheet, { IkonPeta } from "./PetaSheet";
import { dariAman, tampilAwal, useIdentifikasi } from "./useIdentifikasi";

type Saring = "semua" | "belum" | "terdampak" | "tidak";

function Penanda({ s }: { s: SubIdentifikasi }) {
  const k = keadaanSub(s);
  if (k === "belum") return <span className="h-[18px] w-[18px] flex-none rounded-full border-[1.5px] border-[#C5D0E2] bg-white" aria-label="Belum diisi" />;
  const warna = k === "tidak_terdampak" ? "bg-[#2B8FD6]" : "bg-[#19A463]";
  return (
    <span className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full ${warna}`} aria-label={k === "tidak_terdampak" ? "Tidak terdampak" : "Sudah disimpan"}>
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </span>
  );
}

export default function DaftarIdentifikasi() {
  const router = useRouter();
  const { data, galat } = useIdentifikasi();
  const [dari, setDari] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");
  const [peta, setPeta] = useState<string | null>(null); // kode desa yang petanya dibuka
  useEffect(() => setDari(dariAman()), []);

  const sufiks = dari ? `?dari=${encodeURIComponent(dari)}` : "";
  const ringkas = data?.ringkas;
  const persen = ringkas && ringkas.total ? Math.round((ringkas.terisi / ringkas.total) * 100) : 0;

  const hitung = useMemo(() => {
    const h = { semua: 0, belum: 0, terdampak: 0, tidak: 0 };
    for (const s of data?.sub ?? []) {
      h.semua++;
      const k = keadaanSub(s);
      if (k === "belum") h.belum++;
      else if (k === "terdampak") h.terdampak++;
      else h.tidak++;
    }
    return h;
  }, [data]);

  // kelompok per desa/nagari (kode desa 10 digit), urutan mengikuti data (sudah urut kecamatan, nagari, SLS)
  const kelompok = useMemo(() => {
    const peta_ = new Map<string, { kode: string; judul: string; nagari: string; baris: SubIdentifikasi[]; semua: SubIdentifikasi[] }>();
    for (const s of data?.sub ?? []) {
      const kode = kodeDesa(s.idsubsls);
      const g = peta_.get(kode) ?? { kode, judul: `${s.kecamatan} · ${s.nagari}`, nagari: s.nagari, baris: [], semua: [] };
      g.semua.push(s);
      const k = keadaanSub(s);
      if (saring === "semua" || (saring === "belum" && k === "belum") || (saring === "terdampak" && k === "terdampak") || (saring === "tidak" && k === "tidak_terdampak")) g.baris.push(s);
      peta_.set(kode, g);
    }
    return Array.from(peta_.values()).filter((g) => g.baris.length > 0);
  }, [data, saring]);

  const grupPeta = peta ? (data?.sub ?? []).filter((s) => kodeDesa(s.idsubsls) === peta) : [];
  const chip = (k: Saring, teks: string, n: number) => (
    <button key={k} type="button" onClick={() => setSaring(k)} aria-pressed={saring === k} className={`min-h-[40px] flex-none rounded-full px-3.5 text-[12px] font-extrabold ${saring === k ? "bg-[#0F2A52] text-white" : "bg-white text-[#55657D] shadow-[0_2px_6px_rgba(15,42,82,.08)]"}`}>
      {teks} {n}
    </button>
  );

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-[74px] pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <button type="button" onClick={() => keAtas(router, dari ?? "/")} aria-label="Kembali" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/15 active:bg-white/25">
            <IkonMenu n="kembali" className="h-5 w-5 text-white" />
          </button>
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">Pendataan Pascabencana · Pendataan</span>
        </div>
        <div className="relative mx-auto mt-3 max-w-xl">
          <h1 className="text-[21px] font-extrabold leading-tight tracking-[-0.3px]">Lembar Identifikasi SLS</h1>
          <p className="mt-1.5 text-[12.5px] leading-snug text-[#A9BCD8]">
            {data ? `${data.pml.nama} · PML. ` : ""}Lengkapi hasil identifikasi Sub SLS yang dibagikan kepada Anda (sebagai pelaksana atau pendamping), lalu tekan Simpan.
          </p>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-[52px] max-w-xl space-y-3 px-3.5">
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!data && !galat && (
          <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-16 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}

        {data && ringkas && (
          <>
            <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
              <div className="flex items-baseline justify-between">
                <b className="text-[13px] text-[#55657D]">Progres identifikasi</b>
                <b className="text-[13px] text-[#0F2A52]">
                  {ringkas.terisi} dari {ringkas.total} Sub SLS
                </b>
              </div>
              <div role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E3E8F0]">
                <div className="h-full rounded-full bg-[#19A463]" style={{ width: `${persen}%` }} />
              </div>
              <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[12px] bg-[#F1F6FE] px-1 py-2">
                  <b className="block text-[17px] text-[#0F2A52]">{ringkas.total}</b>
                  <span className="text-[10.5px] text-[#55657D]">Sub SLS</span>
                </div>
                <div className="rounded-[12px] bg-[#FFF4D6] px-1 py-2">
                  <b className="block text-[17px] text-[#8A6200]">{ringkas.awal}</b>
                  <span className="text-[10.5px] text-[#8A6200]">Terdampak awal</span>
                </div>
                <div className="rounded-[12px] bg-[#E3F6EC] px-1 py-2">
                  <b className="block text-[17px] text-[#13794B]">{ringkas.hasil}</b>
                  <span className="text-[10.5px] text-[#13794B]">Terdampak hasil</span>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-[#55657D]">
                Mulai 10 Oktober 2026. "Terdampak awal" dan "hasil" dijumlahkan dari Sub SLS yang sudah disimpan{ringkas.tidak_terdampak > 0 ? ` (${ringkas.tidak_terdampak} di antaranya dinyatakan tidak terdampak)` : ""}.
              </p>
            </section>

            {ringkas.total === 0 ? (
              <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">Belum ada Sub SLS identifikasi yang dibagikan kepada Anda.</p>
            ) : (
              <>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Saring daftar">
                  {chip("semua", "Semua", hitung.semua)}
                  {chip("belum", "Belum", hitung.belum)}
                  {chip("terdampak", "Terdampak", hitung.terdampak)}
                  {chip("tidak", "Tidak terdampak", hitung.tidak)}
                </div>

                <section className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                  <div className="grid grid-cols-[minmax(0,1fr)_44px_52px_60px] items-end gap-x-1.5 border-b border-[#EEF2F7] bg-[#F7FAFE] px-3.5 py-2 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                    <span>Sub SLS</span>
                    <span className="text-right">KK</span>
                    <span className="text-right">Awal</span>
                    <span className="text-right">Hasil</span>
                  </div>
                  {kelompok.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-[#6B7A90]">Tidak ada Sub SLS pada saringan ini.</p>}
                  {kelompok.map((g) => (
                    <div key={g.kode}>
                      <div className="flex items-center justify-between gap-2 border-b border-[#EEF2F7] bg-[#F1F6FE] py-1 pl-3.5 pr-1.5">
                        <span className="min-w-0 break-words text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-[#0F3D7A]">{g.judul}</span>
                        <button type="button" onClick={() => setPeta(g.kode)} aria-label={`Lihat peta ${g.nagari}`} className="grid h-11 w-11 flex-none place-items-center rounded-full text-[#1F5FD1] active:bg-[#D3E0F5]">
                          <IkonPeta />
                        </button>
                      </div>
                      {g.baris.map((s) => {
                        const k = keadaanSub(s);
                        return (
                          <Link
                            key={s.idsubsls}
                            href={`/sigap/identifikasi/${encodeURIComponent(s.idsubsls)}${sufiks}`}
                            className={`grid min-h-[50px] grid-cols-[minmax(0,1fr)_44px_52px_60px] items-center gap-x-1.5 border-b border-[#EEF2F7] px-3.5 py-1.5 active:bg-[#EAF1FC] ${k === "tidak_terdampak" ? "bg-[#EAF5FD]" : ""}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Penanda s={s} />
                              <span className="min-w-0 text-[12.5px] leading-tight text-[#0F2A52]">
                                <b className="block break-words">{s.sls}</b>
                                <span className="text-[11px] text-[#6B7A90]">
                                  Sub {s.sub_sls}
                                  {s.peran === "pendamping" && <b className="ml-1.5 rounded bg-[#FFF4D6] px-1.5 py-px text-[10px] text-[#8A6200]">Pendamping</b>}
                                  {k === "tidak_terdampak" && <b className="ml-1.5 rounded bg-[#CDE7F9] px-1.5 py-px text-[10px] text-[#12618F]">Tidak terdampak</b>}
                                </span>
                              </span>
                            </span>
                            <span className="text-right text-[12.5px] font-bold text-[#0F2A52]">{Math.round(s.kk)}</span>
                            <span className="text-right text-[12.5px] font-bold text-[#8A6200]">{tampilAwal(s.kk_awal)}</span>
                            <span className={`text-right text-[12.5px] font-extrabold ${k === "belum" ? "text-[#A5B3C7]" : k === "tidak_terdampak" ? "text-[#12618F]" : "text-[#13794B]"}`}>
                              {k === "belum" ? "–" : k === "tidak_terdampak" ? "Aman" : s.hasil?.kk_terdampak}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                  <p className="px-3.5 py-2.5 text-[11px] leading-snug text-[#6B7A90]">
                    KK = jumlah KK yang tinggal di Sub SLS. Awal = perkiraan KK terdampak dari data awal. Hasil = KK terdampak hasil identifikasi Anda. Lingkaran hijau = sudah disimpan, biru = dinyatakan tidak terdampak. Tag "Pendamping" = SLS ini dipegang PML lain sebagai pelaksana dan Anda ikut bertanggung jawab; hasil dipakai bersama. Ketuk baris untuk mengisi; ikon peta di samping nama nagari membuka peta WA & SLS.
                  </p>
                </section>
              </>
            )}
          </>
        )}
      </div>

      <PetaSheet
        buka={!!peta}
        onTutup={() => setPeta(null)}
        judul={grupPeta[0] ? `Nagari ${grupPeta[0].nagari}` : "Peta"}
        desa={peta}
        subs={grupPeta.map((s) => ({ idsubsls: s.idsubsls, nama: s.sls, sub: s.sub_sls }))}
      />
    </main>
  );
}
