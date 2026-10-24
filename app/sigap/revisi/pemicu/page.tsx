"use client";

// app/sigap/revisi/pemicu/page.tsx
//
// (25 Okt 2026, tahap 22) Papan 3 mockup: pemicu P-01 sampai P-08 per baris, tingkat pergeseran 1 sampai 5, dan simulator contoh isian yang
// menghitung tingkat tertinggi lalu menyarankan jenis revisi. Contoh adalah ILUSTRASI (angka rekaan). Tenggat pengingat dibaca dari master waktu.
// Hanya saran: operator boleh memilih lain dan sistem hanya menandai. Logika murni: lib/keu/pemicu.ts.

import { useMemo, useState } from "react";
import { tglPanjang } from "@/lib/keu/revisi";
import { angka, urlBaca } from "@/lib/keu/ro";
import {
  JALUR_TINGKAT, jum, jumM, KODE_TENGGAT, META_CONTOH, NAMA_JENIS, NAMA_PEMICU, pemicuBaris, saranDari, SKENARIO, tabelPemicu, TINGKAT,
} from "@/lib/keu/pemicu";
import { useBacaKeu } from "../../ro/useKeu";
import { Chip, Galat, HalamanKeu, judulKartu, kartu, Tenang, tombolAktif, tombolKecil } from "../../keu-ui";

type Tenggat = { kode: string; nama: string; tanggal: string; sisa_hari: number | string | null };
const tanda = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "") + angka(Math.abs(n));
const WARNA_JENIS = { pok: "hijau", administrasi: "abu", dipa_djpb: "ungu", dipa_dja: "kuning" } as const;

export default function Halaman() {
  const [kode, setKode] = useState(SKENARIO[1].kode);
  const tenggat = useBacaKeu<Tenggat>(urlBaca("keu_v_tenggat", {}, { urut: "tanggal", batas: 20 }));
  const skenario = SKENARIO.find((s) => s.kode === kode) ?? SKENARIO[0];
  const saran = useMemo(() => saranDari(skenario.rows, META_CONTOH), [skenario]);
  const pemicu = useMemo(() => tabelPemicu(), []);
  const penaik = new Set(saran.penaik);
  const tgJenis = saran.jenis ? tenggat.baris?.find((t) => t.kode === KODE_TENGGAT[saran.jenis!]) : undefined;

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "Pemicu dan tingkat" }]}
      judul="Pemicu per baris dan tingkat pergeseran" induk="/sigap/revisi" labelKembali="Jadwal revisi"
      sub="Cara sistem menandai baris yang berubah dan menyarankan jenis revisi. Contoh di halaman ini adalah ilustrasi."
    >
      <Tenang>Setiap baris yang berubah pada kolom Menjadi ditandai satu pemicu. Tanda ini membantu operator dan pemeriksa membaca matriks; sistem tidak menilai benar atau salahnya. Angka dan baris pada contoh di bawah adalah <b>ILUSTRASI</b>; pada kertas kerja nyata, penandaan dibuat otomatis oleh basis data.</Tenang>

      <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-pemicu">
        <h2 id="judul-pemicu" className={judulKartu}>Pemicu P-01 sampai P-08</h2>
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]">
              <tr><th className="px-2.5 py-2">Kode</th><th className="px-2.5 py-2">Pemicu</th><th className="px-2.5 py-2">Kapan ditandai</th><th className="px-2.5 py-2">Contoh baris</th><th className="px-2.5 py-2 text-right">Semula</th><th className="px-2.5 py-2 text-right">Menjadi</th><th className="px-2.5 py-2 text-right">Selisih</th></tr>
            </thead>
            <tbody>
              {pemicu.map((p) => (
                <tr key={p.kode} className="border-t border-[#EEF2F7] align-top">
                  <td className="px-2.5 py-2"><span className="rounded bg-[#E3EEFF] px-1.5 text-[11px] font-bold text-[#1F5FD1]">{p.kode}</span></td>
                  <td className="px-2.5 py-2 font-semibold text-[#0F2A52]">{p.nama}</td>
                  <td className="px-2.5 py-2 text-[#5B6B84]">{p.kapan}</td>
                  <td className="px-2.5 py-2">{p.contoh}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right">{angka(p.semula)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right">{angka(p.menjadi)}</td>
                  <td className={`whitespace-nowrap px-2.5 py-2 text-right font-semibold ${p.menjadi === p.semula ? "text-[#44546F]" : p.menjadi > p.semula ? "text-[#14653A]" : "text-[#B42329]"}`}>{tanda(p.menjadi - p.semula)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-tingkat">
        <h2 id="judul-tingkat" className={judulKartu}>Tingkat pergeseran dan jenis revisi yang disarankan</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Pilih salah satu contoh isian. Sistem menghitung tingkat tertinggi yang tersentuh, lalu menyarankan jenis revisi. Saran dapat diganti operator.</p>
        <ol className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
          {TINGKAT.slice(1).map((nama, i) => (
            <li key={nama} className={`flex flex-col gap-0.5 rounded-lg border p-3 ${saran.tingkat === i + 1 ? "border-[#1F5FD1] bg-[#F5F8FE]" : "border-[#E8EDF5] bg-[#F9FBFE]"}`}>
              <span className="w-fit rounded bg-[#E3EEFF] px-1.5 text-[11px] font-bold text-[#1F5FD1]">{i + 1}</span>
              <b className="text-[13px] text-[#0F2A52]">{nama}</b>
              <span className="text-[12px] text-[#5B6B84]">{JALUR_TINGKAT[i + 1]}</span>
            </li>
          ))}
        </ol>
        <p className="text-[12.5px] text-[#5B6B84]">Dua hal menaikkan jenis tanpa melihat tingkat: pagu Satker berubah (jalur DJA) dan perubahan lintas jenis belanja, yaitu dua digit pertama akun (jalur DJPb).</p>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Contoh isian">
          {SKENARIO.map((s) => <button key={s.kode} type="button" aria-pressed={kode === s.kode} onClick={() => setKode(s.kode)} className={kode === s.kode ? tombolAktif : tombolKecil}>{s.nama}</button>)}
        </div>
        <p className="text-[12.5px] text-[#44546F]">{skenario.ket}</p>

        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]">
              <tr><th className="px-2.5 py-2">RO</th><th className="px-2.5 py-2">Akun dan uraian</th><th className="px-2.5 py-2 text-right">Semula</th><th className="px-2.5 py-2 text-right">Menjadi</th><th className="px-2.5 py-2 text-right">Selisih</th><th className="px-2.5 py-2">Pemicu</th><th className="px-2.5 py-2">Jalur</th></tr>
            </thead>
            <tbody>
              {skenario.rows.map((r) => {
                const p = pemicuBaris(skenario.rows, r);
                const a = jum(r), m = jumM(r);
                const berubah = p !== "";
                return (
                  <tr key={r.id} className={`border-t border-[#EEF2F7] align-top ${penaik.has(r.id) ? "bg-[#F6F1FD]" : ""}`}>
                    <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[12px] text-[#0F2A52]">{r.ro}</td>
                    <td className="px-2.5 py-2"><b className="font-mono text-[#0F2A52]">{r.akunM === r.akun ? r.akun : `${r.akun} → ${r.akunM}`}</b> {r.uraM === r.uraian ? r.uraian : `${r.uraian} → ${r.uraM}`}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right">{angka(a)}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right">{angka(m)}</td>
                    <td className={`whitespace-nowrap px-2.5 py-2 text-right font-semibold ${m === a ? "text-[#44546F]" : m > a ? "text-[#14653A]" : "text-[#B42329]"}`}>{tanda(m - a)}</td>
                    <td className="px-2.5 py-2">{berubah ? <span title={NAMA_PEMICU[p]} className="rounded bg-[#E3EEFF] px-1.5 text-[11px] font-bold text-[#1F5FD1]">{p}</span> : <span className="text-[#6B7A93]">-</span>}</td>
                    <td className="px-2.5 py-2 text-[12px]">{!berubah ? "-" : penaik.has(r.id) ? <span className="font-semibold text-[#5B3FA6]">Jalur lebih tinggi</span> : "Jalur POK"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border-l-4 border-[#1F5FD1] bg-[#F7FAFE] p-3" aria-live="polite">
          <h3 className="text-[14px] font-bold text-[#0F2A52]">Hasil untuk contoh terpilih</h3>
          <div className="flex flex-wrap items-center gap-2">
            {saran.jenis ? <Chip warna={WARNA_JENIS[saran.jenis]}>{NAMA_JENIS[saran.jenis]}</Chip> : <Chip warna="abu">Belum ada saran</Chip>}
            <span className="text-[13px] font-semibold text-[#0F2A52]">Tingkat {saran.tingkat}: {saran.tingkatNama}</span>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-[#44546F]">{saran.alasan.map((x) => <li key={x}>{x}</li>)}</ul>
          {saran.campuran && (
            <p className="rounded-md bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">Kertas kerja campuran: ada baris jalur lebih tinggi dan baris jalur POK. Disarankan dipisah menjadi dua usulan agar baris jalur POK tidak tertahan oleh jalur yang lebih tinggi.</p>
          )}
          <dl className="grid gap-x-4 gap-y-1 text-[12.5px] [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            <div><dt className="font-semibold text-[#5B6B84]">Baris yang mengikuti jalur lebih tinggi</dt><dd>{saran.penaik.length ? `${saran.penaik.length} baris (ungu pada tabel)` : "Tidak ada"}</dd></div>
            <div><dt className="font-semibold text-[#5B6B84]">Baris yang tetap jalur POK</dt><dd>{saran.pokSaja.length ? `${saran.pokSaja.length} baris` : "Tidak ada"}</dd></div>
            <div><dt className="font-semibold text-[#5B6B84]">Lampiran tambahan</dt><dd>{saran.lampiran.length ? saran.lampiran.join(", ") : "Tidak ada selain lampiran jenis revisi"}</dd></div>
            <div><dt className="font-semibold text-[#5B6B84]">Tenggat pengingat</dt><dd>{!saran.jenis ? "-" : tgJenis ? `${tglPanjang(tgJenis.tanggal)} (hanya pengingat; tidak mengunci tombol)` : tenggat.galat ? "Tidak dapat dimuat" : "Memuat…"}</dd></div>
          </dl>
          <Galat pesan={tenggat.galat} />
          <p className="text-[12px] text-[#5B6B84]">Pada kertas kerja nyata, data Program tidak tersedia, sehingga sistem tidak membedakan antar-Kegiatan dari antar-Program kecuali pagu Satker berubah (jalur DJA). Saran selalu dapat diganti operator.</p>
        </div>
      </section>
    </HalamanKeu>
  );
}
