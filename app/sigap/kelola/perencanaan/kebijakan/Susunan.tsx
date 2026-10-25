"use client";

// app/sigap/kelola/perencanaan/kebijakan/Susunan.tsx
//
// (25 Okt 2026, tahap 28) Templat susunan tim pada lembar kebijakan: jumlah minimal per jabatan menurut strata (S1-S9), batas jabatan per orang,
// matriks rangkap, dan syarat kompetensi. Hanya tampilan dan penyuntingan; aturan pemeriksa ada di lib/keu/kebijakan.ts dan basis data.

import {
  ID_BAGIAN, JABATAN, KODE_STRATA, ketStrata, rentangStrata, totalMinimal,
  type IsiKebijakan, type KodeJabatan, type KodeStrata,
} from "@/lib/keu/kebijakan";
import { Bagian, Cat, Isian, Poin, YaTidak } from "../identifikasi/Kontrol";
import { kolom } from "@/app/sigap/keu-ui";

export type UbahIsi = (fn: (draft: IsiKebijakan) => void) => void;

const sel = "box-border h-8 w-full min-w-[3.1rem] rounded border border-[#C5D0E2] bg-white px-1 text-center text-[13px] text-[#0F2A52] disabled:bg-[#F3F6FA] disabled:text-[#44546F] focus:outline-2 focus:outline-[#1F5FD1]";
const th = "border-b border-[#DCE3EE] bg-[#F3F6FA] px-1.5 py-1.5 text-center text-[11.5px] font-bold text-[#44546F]";
const tdJudul = "sticky left-0 z-[1] min-w-[11rem] border-b border-[#EEF2F7] bg-white px-2 py-1 text-left text-[12.5px] font-semibold text-[#1B2B4B]";
const td = "border-b border-[#EEF2F7] px-1 py-1 text-center";

function Num({ nilai, onUbah, mati, nama, min = 0, maks = 1000, kosongBolehNull = false }: {
  nilai: number | null; onUbah: (v: number | null) => void; mati: boolean; nama: string; min?: number; maks?: number; kosongBolehNull?: boolean;
}) {
  return (
    <input
      type="number" inputMode="numeric" aria-label={nama} className={sel} value={nilai === null ? "" : nilai} min={min} max={maks} disabled={mati}
      placeholder={kosongBolehNull ? "—" : undefined}
      onChange={(e) => {
        if (e.target.value === "") { if (kosongBolehNull) onUbah(null); return; }
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onUbah(Math.min(maks, Math.max(min, Math.trunc(n))));
      }}
    />
  );
}

export function Susunan({ isi, ubah, mati }: { isi: IsiKebijakan; ubah: UbahIsi; mati: boolean }) {
  return (
    <Bagian huruf="B" judul="Templat susunan tim" gsbpm="Jumlah minimal per jabatan menurut jumlah petugas" id={ID_BAGIAN.susunan}>
      <Poin butir={[
        "Setiap strata (S1–S9) menentukan jumlah minimal tiap jabatan dan batas jabatan yang boleh dipegang satu orang.",
        "Angka awal berasal dari Excel pematangan dan baru sah setelah lembar disahkan.",
        "Rentang jumlah petugas harus menyambung: batas bawah strata berikutnya otomatis mengikuti batas atas strata sebelumnya.",
        "Inda dan innas hanya sebutan, dapat dijabat pegawai internal, dan minimalnya 0.",
        "Jumlah PPL per PML tidak diatur kabupaten; mengikuti pusat untuk setiap kegiatan.",
      ]} />
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">Templat susunan tim menurut strata</caption>
          <thead>
            <tr>
              <th scope="col" className={`${th} sticky left-0 z-[2] text-left`}>Strata</th>
              {isi.strata.map((s) => <th key={s.k} scope="col" className={th}>{s.k}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={tdJudul}>Jumlah petugas (sampai)</th>
              {isi.strata.map((s, i) => (
                <td key={s.k} className={td}>
                  {s.sampai === null ? (
                    <span className="text-[12px] text-[#5B6B84]">di atas {s.dari - 1}</span>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[11px] text-[#5B6B84]">{s.dari}–</span>
                      <Num nilai={s.sampai} mati={mati} nama={`Batas atas jumlah petugas ${s.k}`} min={s.dari} maks={100000}
                        onUbah={(v) => ubah((d) => { d.strata[i].sampai = v ?? d.strata[i].dari; if (d.strata[i + 1]) d.strata[i + 1].dari = (d.strata[i].sampai as number) + 1; })} />
                    </div>
                  )}
                </td>
              ))}
            </tr>
            {JABATAN.map((j) => (
              <tr key={j.k}>
                <th scope="row" className={tdJudul}>{j.nama}</th>
                {KODE_STRATA.map((s) => (
                  <td key={s} className={td}>
                    <Num nilai={isi.minimal[s][j.k]} mati={mati} nama={`Minimal ${j.nama} pada ${s}`} min={j.k === "ketua" ? 1 : 0}
                      onUbah={(v) => ubah((d) => { d.minimal[s][j.k] = v ?? 0; })} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className={`${tdJudul} text-[#14653A]`}>Total minimal</th>
              {KODE_STRATA.map((s) => <td key={s} className={`${td} font-bold text-[#14653A]`}>{totalMinimal(isi, s)}</td>)}
            </tr>
            <tr>
              <th scope="row" className={tdJudul}>Maks. jabatan per orang</th>
              {isi.strata.map((s, i) => (
                <td key={s.k} className={td}>
                  <Num nilai={s.maks_jabatan} mati={mati} nama={`Maksimal jabatan per orang ${s.k}`} min={1} maks={10} onUbah={(v) => ubah((d) => { d.strata[i].maks_jabatan = v ?? 1; })} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={tdJudul}>Batas % petugas baru</th>
              {isi.strata.map((s, i) => (
                <td key={s.k} className={td}>
                  <Num nilai={s.persen_baru} mati={mati} nama={`Batas persen petugas baru ${s.k}`} min={0} maks={100} kosongBolehNull onUbah={(v) => ubah((d) => { d.strata[i].persen_baru = v; })} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={tdJudul}>Sasaran pengembangan</th>
              {isi.strata.map((s, i) => (
                <td key={s.k} className={td}>
                  <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" aria-label={`${s.k} boleh menjadi sasaran pengembangan kompetensi`} checked={s.pengembangan} disabled={mati}
                    onChange={() => ubah((d) => { d.strata[i].pengembangan = !d.strata[i].pengembangan; })} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <details className="rounded-lg border border-[#DCE3EE] bg-[#F9FBFD] px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-[#0F2A52]">Keterangan otomatis per strata (dibangkitkan dari angka di atas)</summary>
        <div className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {KODE_STRATA.map((s) => {
            const st = isi.strata.find((x) => x.k === s);
            return (
              <div key={s} className="min-w-0">
                <p className="m-0 mb-1 text-[12.5px] font-bold text-[#0F2A52]">{s}{st ? ` · ${rentangStrata(st)}` : ""}</p>
                <Poin butir={ketStrata(isi, s).slice(1)} />
              </div>
            );
          })}
        </div>
      </details>
    </Bagian>
  );
}

export function Rangkap({ isi, ubah, mati }: { isi: IsiKebijakan; ubah: UbahIsi; mati: boolean }) {
  function balik(s: KodeStrata, j: KodeJabatan) {
    ubah((d) => {
      const a = d.rangkap[s];
      d.rangkap[s] = a.includes(j) ? a.filter((x) => x !== j) : [...a, j];
    });
  }
  return (
    <Bagian huruf="C" judul="Matriks rangkap jabatan" gsbpm="Jabatan yang boleh dirangkap satu orang" id={ID_BAGIAN.rangkap}>
      <Poin butir={[
        "Tanda centang berarti jabatan itu boleh dirangkap oleh satu orang pada strata tersebut.",
        "Banyaknya jabatan per orang tetap dibatasi angka “Maks. jabatan per orang” pada templat susunan tim.",
        "Rangkap yang melebihi matriks membutuhkan izin pengecualian dan dicatat sebagai bahan evaluasi (peringatan pelaksanaan menyusul pada tahap berikutnya).",
      ]} />
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">Matriks rangkap jabatan menurut strata</caption>
          <thead>
            <tr>
              <th scope="col" className={`${th} sticky left-0 z-[2] text-left`}>Jabatan</th>
              {KODE_STRATA.map((s) => <th key={s} scope="col" className={th}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {JABATAN.map((j) => (
              <tr key={j.k}>
                <th scope="row" className={tdJudul}>{j.nama}</th>
                {KODE_STRATA.map((s) => (
                  <td key={s} className={td}>
                    <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" aria-label={`${j.nama} boleh dirangkap pada ${s}`} checked={isi.rangkap[s].includes(j.k)} disabled={mati} onChange={() => balik(s, j.k)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bagian>
  );
}

export function Kompetensi({ isi, ubah, mati }: { isi: IsiKebijakan; ubah: UbahIsi; mati: boolean }) {
  const k = isi.kompetensi;
  return (
    <Bagian huruf="D" judul="Syarat kompetensi petugas" gsbpm="Berlaku untuk seluruh strata" id={ID_BAGIAN.kompetensi}>
      <Poin butir={[
        "Petugas wajib mampu memvalidasi aplikasi desktop, memperoleh nilai pelatihan di atas batas minimal, dan nilai seleksi (bila ada) di atas batas minimal.",
        "Penanda petugas baru diisi manual oleh ketua tim; tidak ada sumber data pengalaman otomatis.",
        "Tim berukuran sama dengan atau lebih besar dari ambang ketat dianggap ketat: strata S4 ke atas tidak boleh menjadi tempat uji coba.",
      ]} />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        <Isian judul="Nilai pelatihan minimal">
          <input type="number" className={kolom} aria-label="Nilai pelatihan minimal" min={0} max={100} value={k.nilai_pelatihan_min} disabled={mati}
            onChange={(e) => ubah((d) => { d.kompetensi.nilai_pelatihan_min = Number(e.target.value); })} />
        </Isian>
        <Isian judul="Nilai seleksi minimal (bila ada seleksi)">
          <input type="number" className={kolom} aria-label="Nilai seleksi minimal" min={0} max={100} value={k.nilai_seleksi_min} disabled={mati}
            onChange={(e) => ubah((d) => { d.kompetensi.nilai_seleksi_min = Number(e.target.value); })} />
        </Isian>
        <Isian judul="Ambang tim ketat (jumlah petugas)">
          <input type="number" className={kolom} aria-label="Ambang tim ketat" min={1} value={k.ambang_ketat} disabled={mati}
            onChange={(e) => ubah((d) => { d.kompetensi.ambang_ketat = Math.trunc(Number(e.target.value)); })} />
        </Isian>
        <Isian judul="Wajib mampu validasi aplikasi desktop">
          <YaTidak nama="Wajib mampu validasi aplikasi desktop" nilai={k.validasi_desktop} mati={mati} onPilih={(v) => ubah((d) => { d.kompetensi.validasi_desktop = v; })} />
        </Isian>
      </div>
      <Cat>Ambang dan nilai dapat digeser pada rapat awal tahun melalui lembar ini.</Cat>
    </Bagian>
  );
}
