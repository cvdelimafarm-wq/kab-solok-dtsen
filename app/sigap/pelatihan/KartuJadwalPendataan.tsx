"use client";

// app/sigap/pelatihan/KartuJadwalPendataan.tsx
//
// (3 Nov 2026) Kartu "Jadwal Anda" di tab Hari ini: linimasa visual (gaya Gantt) jadwal PELATIHAN dan PENDATAAN LAPANGAN dari sudut pandang PPL / PML.
// Isi: hitung mundur agenda berikutnya, tahapan (Pelatihan -> Pendataan -> Selesai), sumbu tanggal dengan akhir pekan diarsir dan penanda Hari ini,
// batang pelatihan (biru) dan pendataan (hijau; bergaris = Perkiraan), satu kalimat fokus sesuai peran, serta rincian tanggal lengkap.
// Sumber: jawaban /ketentuan -> jadwal_pelatihan (kegiatan) dan jadwal_pendataan (Identifikasi survei). Tanpa data apa pun = tidak menggambar.

import { useEffect, useMemo, useRef, useState } from "react";
import { hariWib } from "@/lib/vanguardAnjuran";
import type { JadwalPendataanKartu } from "@/lib/jadwalPendataanTampil";
import { susunLinimasa, type Lajur, type StatusAgenda } from "@/lib/linimasaJadwal";

const KOLOM_MAKS = 30; // px per hari (lebar penuh)
const KOLOM_MIN = 11; // di bawah ini sumbu digulir mendatar
const TINGGI_BATANG = 22;
const LEBAR_RENTANG_MIN = 150; // perkiraan lebar teks keterangan batang

const CHIP: Record<StatusAgenda, string> = {
  belum: "bg-[#E3EEFF] text-[#1F5FD1]",
  berjalan: "bg-[#E3F6EC] text-[#13794B]",
  selesai: "bg-[#EEF2F7] text-[#55657D]",
};
const WARNA_JENIS = {
  pelatihan: { isi: "#1F5FD1", gelap: "#0F2A52", pudar: "#CFE0FA" },
  pendataan: { isi: "#19A463", gelap: "#0E7A4A", pudar: "#CDEBDC" },
} as const;

function Batang({ l, kolom }: { l: Lajur; kolom: number }) {
  const w = WARNA_JENIS[l.jenis];
  const lebar = Math.max(10, l.panjang * kolom - 2);
  const selesaiPersen = l.status === "selesai" ? 100 : l.status === "berjalan" ? l.persen : 0;
  // Perkiraan: garis-garis miring; pasti: warna penuh
  const latar = l.perkiraan ? `repeating-linear-gradient(135deg, ${w.pudar} 0 5px, #FFFFFF 5px 10px)` : w.pudar;
  return (
    <div
      className="relative overflow-hidden rounded-md"
      style={{ width: lebar, height: TINGGI_BATANG, background: latar, border: `${l.perkiraan ? "1.5px dashed" : "1.5px solid"} ${w.isi}` }}
      title={`${l.label}: ${l.rentangPendek}${l.perkiraan ? " (perkiraan)" : ""}`}
    >
      <span className="absolute inset-y-0 left-0" style={{ width: `${selesaiPersen}%`, background: w.isi, opacity: l.perkiraan ? 0.55 : 0.9 }} />
    </div>
  );
}

export default function KartuJadwalPendataan({
  jadwal,
  pelatihan,
  peran,
}: {
  jadwal: JadwalPendataanKartu | null | undefined;
  /** jadwal kegiatan pelatihan (tanggal ISO); selesai kosong = satu hari */
  pelatihan?: { mulai: string; selesai?: string | null } | null;
  peran?: string | null;
}) {
  // tanggal diambil di sisi klien (zona WIB) supaya tidak berbeda dengan HTML dari server
  const [hariIni, setHariIni] = useState<string | null>(null);
  useEffect(() => {
    setHariIni(hariWib(Date.now()));
  }, []);
  const lm = useMemo(
    () => (hariIni ? susunLinimasa({ hariIni, pelatihan: pelatihan ?? null, pendataan: jadwal?.periode ?? [], peran: peran ?? null }) : null),
    [hariIni, pelatihan, jadwal, peran],
  );
  const gulir = useRef<HTMLDivElement>(null);
  const [lebarWadah, setLebarWadah] = useState(0);
  const adaLm = !!lm;
  useEffect(() => {
    // ukur lebar wadah (ikut berubah saat layar diputar) supaya seluruh rentang muat tanpa digulir bila memungkinkan
    const el = gulir.current;
    if (!el) return;
    const ukur = () => setLebarWadah(el.clientWidth);
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, [adaLm]);
  const n = lm?.hari.length ?? 0;
  const lebarKolom = n > 0 && lebarWadah > 0 ? Math.max(KOLOM_MIN, Math.min(KOLOM_MAKS, Math.floor(lebarWadah / n))) : KOLOM_MAKS;
  useEffect(() => {
    // bila perlu digulir, tampilkan penanda Hari ini (sepertiga dari kiri)
    const el = gulir.current;
    if (!el || !lm || lm.indeksHariIni < 0 || lebarKolom * n <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, lm.indeksHariIni * lebarKolom - el.clientWidth / 3);
  }, [lm, lebarKolom, n]);
  if (!lm) return null;
  const kolom = `repeat(${n}, ${lebarKolom}px)`;
  const lebarTotal = Math.max(n * lebarKolom, lebarWadah);
  const rapat = lebarKolom < 22; // kolom sempit: angka hanya pada hari penting
  const penting = new Set<string>([lm.hari[lm.indeksHariIni]?.tgl ?? "", ...lm.lajur.flatMap((l) => [l.mulai, l.selesai])]);
  // kolom sempit: angka hanya pada hari ini (didahulukan), hari Senin, tanggal 1, dan akhir agenda; tidak pernah dua angka bersebelahan
  const tampilAngka: boolean[] = lm.hari.map((h) => !rapat || h.hariIni);
  if (rapat) {
    const calon = new Set<string>([...lm.lajur.map((l) => l.selesai)]);
    lm.hari.forEach((h, i) => {
      if (tampilAngka[i] || !(h.huruf === "Sen" || h.angka === 1 || calon.has(h.tgl))) return;
      if (tampilAngka[i - 1] || tampilAngka[i + 1]) return;
      tampilAngka[i] = true;
    });
  }
  const hero = lm.berikutnya;
  const heroWarna = hero.jenis === "berjalan" ? "from-[#0E7A4A] to-[#19A463]" : hero.jenis === "belum" ? "from-[#0F2A52] to-[#1F5FD1]" : "from-[#55657D] to-[#7C8BA1]";
  const adaPerkiraan = lm.lajur.some((l) => l.perkiraan);

  return (
    <section id="langkah-pendataan" aria-label="Jadwal Anda" className="scroll-mt-24 overflow-hidden rounded-[18px] border border-[#DDE6F3] bg-white shadow-[0_8px_22px_rgba(15,42,82,.07)]">
      {/* kepala: hitung mundur */}
      <div className={`flex items-center gap-3 bg-gradient-to-r ${heroWarna} px-4 py-3 text-white`}>
        <div className="min-w-[64px] text-center">
          <div className="text-[30px] font-black leading-none">{hero.angka}</div>
          {hero.satuan && <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide opacity-90">{hero.satuan}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] font-bold uppercase tracking-wider opacity-80">Jadwal Anda{lm.peranTeks ? ` · ${lm.peranTeks.split(" · ")[0]}` : ""}</p>
          <p className="m-0 mt-0.5 text-[15px] font-extrabold leading-tight">{hero.judul}</p>
          <p className="m-0 mt-0.5 text-[12.5px] opacity-90">{hero.ket}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* tahapan */}
        <ol className="m-0 flex list-none items-center gap-1 p-0" aria-label="Tahapan">
          {lm.fase.map((f, i) => (
            <li key={f.kunci} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className={`flex h-[22px] min-w-0 flex-1 items-center justify-center rounded-full px-2 text-[11px] font-extrabold ${
                  f.status === "selesai" ? "bg-[#E3F6EC] text-[#13794B]" : f.status === "berjalan" ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#55657D]"
                }`}
              >
                <span className="truncate">
                  {f.status === "selesai" ? "✓ " : ""}
                  {f.label}
                </span>
              </span>
              {i < lm.fase.length - 1 && <span aria-hidden className="text-[11px] text-[#9AA7BA]">›</span>}
            </li>
          ))}
        </ol>

        {/* sumbu tanggal + batang */}
        <div ref={gulir} className="overflow-x-auto rounded-xl border border-[#E3EAF5] bg-[#FBFCFE]" role="img" aria-label={`Linimasa jadwal. ${lm.lajur.map((l) => `${l.label} ${l.rentangPendek}`).join("; ")}`}>
          <div className="relative" style={{ width: lebarTotal }}>
            {/* latar: akhir pekan + hari ini */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: kolom }} aria-hidden>
              {lm.hari.map((h) => (
                <span key={h.tgl} className={h.hariIni ? "bg-[#FFF1C2]" : h.akhirPekan ? "bg-[#F0F3F8]" : ""} />
              ))}
            </div>
            {/* bulan */}
            <div className="relative grid" style={{ gridTemplateColumns: kolom }}>
              {lm.bulan.map((b) => (
                <span key={b.nama} className="truncate border-l border-[#D9E2F0] px-1.5 pt-1 text-[10.5px] font-extrabold uppercase tracking-wide text-[#55657D]" style={{ gridColumn: `span ${b.kolom}` }}>
                  {b.kolom >= 4 ? b.nama : ""}
                </span>
              ))}
            </div>
            {/* hari */}
            <div className="relative grid" style={{ gridTemplateColumns: kolom }}>
              {lm.hari.map((h, i) => {
                return (
                  <span key={h.tgl} className="flex flex-col items-center py-0.5 leading-none">
                    {!rapat && <span className={`text-[9.5px] font-bold ${h.akhirPekan ? "text-[#C0392B]" : "text-[#8A97AC]"}`}>{h.huruf}</span>}
                    <span
                      className={`mt-0.5 whitespace-nowrap font-extrabold ${rapat ? "text-[10px]" : "text-[12px]"} ${h.hariIni ? "rounded-full bg-[#E0A100] px-1 py-0.5 text-white" : h.akhirPekan ? "text-[#C0392B]" : penting.has(h.tgl) ? "text-[#0F2A52]" : "text-[#8A97AC]"}`}
                    >
                      {tampilAngka[i] ? h.angka : "·"}
                    </span>
                  </span>
                );
              })}
            </div>
            {/* lajur: keterangan di atas batang, sejajar awal batang (rata kanan bila hampir keluar tepi) */}
            <div className="relative space-y-1 pb-2.5 pt-1.5">
              {lm.lajur.map((l) => {
                const kiri = l.mulaiIdx * lebarKolom;
                const lebarBatang = l.panjang * lebarKolom;
                const rataKanan = kiri + LEBAR_RENTANG_MIN > lebarTotal;
                const warna = WARNA_JENIS[l.jenis];
                return (
                  <div key={l.kunci}>
                    <div className="relative h-[15px] whitespace-nowrap text-[11px] font-extrabold leading-[15px]" style={{ color: warna.gelap }}>
                      <span className="absolute" style={rataKanan ? { right: Math.max(0, lebarTotal - (kiri + lebarBatang)) + 2 } : { left: kiri + 2 }}>
                        {l.label} · {l.rentangPendek}
                        {l.perkiraan ? " (perkiraan)" : ""}
                      </span>
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: kolom }}>
                      <div style={{ gridColumn: `${l.mulaiIdx + 1} / span ${l.panjang}`, paddingLeft: 1 }}>
                        <Batang l={l} kolom={lebarKolom} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[11px] font-semibold text-[#55657D]" aria-label="Keterangan">
          <li className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: WARNA_JENIS.pelatihan.isi }} /> Pelatihan</li>
          <li className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: WARNA_JENIS.pendataan.isi }} /> Pendataan lapangan</li>
          {adaPerkiraan && <li className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-[#55657D]" style={{ background: "repeating-linear-gradient(135deg,#CDEBDC 0 4px,#fff 4px 8px)" }} /> Perkiraan</li>}
          <li className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm bg-[#FFF1C2]" /> Hari ini</li>
          <li className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm bg-[#F0F3F8]" /> Akhir pekan</li>
        </ul>

        {/* fokus peran */}
        <p className="m-0 rounded-xl bg-[#F3F7FF] px-3 py-2 text-[13px] leading-snug text-[#0F2A52]">
          <b className="font-extrabold">Fokus Anda: </b>
          {lm.fokus}
        </p>

        {/* rincian tanggal */}
        <ul className="m-0 list-none space-y-2 p-0">
          {lm.lajur.map((l) => (
            <li key={l.kunci} className="rounded-xl border-l-4 bg-[#F8FAFE] px-3 py-2" style={{ borderLeftColor: WARNA_JENIS[l.jenis].isi }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-[13px] font-extrabold text-[#0F2A52]">{l.label}</b>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${CHIP[l.status]}`}>{l.ket}</span>
                {l.jenis === "pendataan" && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${l.perkiraan ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#E3F6EC] text-[#13794B]"}`}>{l.perkiraan ? "Perkiraan" : "Tanggal pasti"}</span>
                )}
              </div>
              <p className="m-0 mt-1 text-[12.5px] leading-snug text-[#0F2A52]">
                {l.mulai === l.selesai ? l.mulaiTeks : `${l.mulaiTeks} – ${l.selesaiTeks}`}
                <span className="text-[#6B7A90]"> · {l.hari} hari</span>
              </p>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[11.5px] leading-snug text-[#6B7A90]">
          Pelatihan: jadwal kegiatan. Pendataan: Identifikasi survei{jadwal?.sumber ? ` ${jadwal.sumber}` : ""}. {adaPerkiraan ? "Perkiraan dapat berubah; ikuti pembaruan dari PJ." : ""}
        </p>
      </div>
    </section>
  );
}
