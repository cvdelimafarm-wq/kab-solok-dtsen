"use client";

// app/sigap/realisasi/Skor.tsx
//
// (25 Okt 2026) Papan 12 bagian 3: skor kualitas RAB per RO. Semua pengguna dapat melihat skor semua RO (ketentuan 24 Okt 2026). Skor untuk pembinaan,
// bukan sanksi. Pilih satu RO untuk melihat rencana penarikan (RAB sah) dibandingkan realisasi bulanan. Rumus tetap di view keu_v_skor_ro.

import { useMemo, useState } from "react";
import { bobotDariRow, ambangDariRow, type SkorRo, type SkorRow } from "@/lib/keu/master";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { barisSkor, nilaiSkor, persenBobot, rincianBulanan, WARNA_KATEGORI } from "@/lib/keu/skor";
import { useBacaKeu } from "../ro/useKeu";
import { Chip, Galat, judulKartu, kartu, Memuat, tombolKecil } from "../keu-ui";

type SkorView = SkorRo & { tahun: number; sampai_bulan: number | string; ada_rab_sah: boolean };
type RoMaster = { kode: string; nama: string };

function Rincian({ kode, nama, tahun, sampai }: { kode: string; nama: string; tahun: number; sampai: number }) {
  const rab = useBacaKeu<{ rab_id: number; status: string }>(urlBaca("keu_v_rab_ringkas", { ro_kode: kode }, { batas: 20, kolom: ["rab_id", "status"] }));
  const rabSah = rab.baris?.find((r) => r.status === "disetujui")?.rab_id ?? null;
  const jadwal = useBacaKeu<{ bulan: number; nilai: number | string }>(rabSah !== null ? urlBaca("keu_v_rab_jadwal_item", { rab_id: rabSah }, { batas: 5000, kolom: ["bulan", "nilai"] }) : null);
  const real = useBacaKeu<{ bulan: number; realisasi_bulan: number | string }>(urlBaca("keu_v_realisasi_bulan", { ro_kode: kode, tahun }, { batas: 5000, kolom: ["bulan", "realisasi_bulan"] }));
  const galat = rab.galat ?? jadwal.galat ?? real.galat;
  const baris = useMemo(() => (real.baris && (rabSah === null || jadwal.baris) ? rincianBulanan(jadwal.baris ?? [], real.baris, sampai) : null), [jadwal.baris, real.baris, rabSah, sampai]);
  const maks = Math.max(1, ...(baris ?? []).flatMap((b) => [b.rencana, b.real]));
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
      <h3 className="text-[14px] font-bold text-[#0F2A52]">RO {kode}: rencana penarikan dibandingkan realisasi bulanan{sampai > 0 ? ` (Jan sampai ${["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][Math.min(12, sampai)]})` : ""}</h3>
      <p className="text-[12.5px] text-[#5B6B84]">{nama}</p>
      {galat && <Galat pesan={galat} />}
      {!galat && !baris && <Memuat tinggi="h-24" />}
      {baris && rabSah === null && <p className="text-[12.5px] text-[#8A6200]">RO ini belum punya RAB sah, jadi rencana penarikan dianggap nol dan skor penarikan, volume, dan cakupan bernilai 0.</p>}
      {baris && baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada realisasi yang diterima, sehingga skor penarikan belum dapat dihitung.</p>}
      {baris && baris.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-[12px] text-[#44546F]" aria-hidden>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#1F5FD1]" />Rencana (RAB)</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#2E8B57]" />Realisasi</span>
          </div>
          <div className="flex h-[120px] items-end gap-2 overflow-x-auto border-b border-[#C5D0E2] pb-0.5" role="img" aria-label="Rencana dan realisasi per bulan; angka lengkap pada tabel di bawah">
            {baris.map((b) => (
              <div key={b.bulan} className="flex min-w-[34px] flex-1 flex-col items-center gap-1">
                <div className="flex h-[100px] items-end gap-[3px]">
                  <span className="w-3 rounded-t-[3px] bg-[#1F5FD1]" style={{ height: `${Math.max(2, (b.rencana / maks) * 100)}%` }} />
                  <span className="w-3 rounded-t-[3px] bg-[#2E8B57]" style={{ height: `${Math.max(2, (b.real / maks) * 100)}%` }} />
                </div>
                <span className="text-[11px] text-[#6B7A93]">{b.nama}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#DCE3EE] bg-white">
            <table className="w-full min-w-[420px] text-left text-[12.5px]">
              <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Bulan</th><th className="px-2.5 py-2 text-right">Rencana (RAB)</th><th className="px-2.5 py-2 text-right">Realisasi</th><th className="px-2.5 py-2 text-right">Selisih</th></tr></thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.bulan} className="border-t border-[#EEF2F7]">
                    <td className="px-2.5 py-1.5">{b.nama}</td>
                    <td className="px-2.5 py-1.5 text-right">{angka(b.rencana)}</td>
                    <td className="px-2.5 py-1.5 text-right">{angka(b.real)}</td>
                    <td className={`px-2.5 py-1.5 text-right font-semibold ${b.selisih === 0 ? "text-[#44546F]" : b.selisih > 0 ? "text-[#8A6200]" : "text-[#1F5FD1]"}`}>{b.selisih > 0 ? "+" : ""}{angka(b.selisih)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[#5B6B84]">Selisih positif berarti realisasi lebih besar dari rencana bulan itu; negatif berarti kurang. Total rencana {rupiah(baris.reduce((a, b) => a + b.rencana, 0))}, total realisasi {rupiah(baris.reduce((a, b) => a + b.real, 0))}.</p>
        </>
      )}
    </div>
  );
}

export default function BagianSkor() {
  const skor = useBacaKeu<SkorView>(urlBaca("keu_v_skor_ro", {}, { batas: 200 }));
  const ro = useBacaKeu<RoMaster>(urlBaca("keu_ro", { aktif: "true" }, { batas: 500, kolom: ["kode", "nama"] }));
  const master = useBacaKeu<SkorRow>(urlBaca("keu_master_skor", { id: 1 }, { batas: 1 }));
  const [pilih, setPilih] = useState<string | null>(null);
  const galat = skor.galat ?? ro.galat ?? master.galat;
  const m = master.baris?.[0];
  const bobot = m ? bobotDariRow(m) : null;
  const ambang = m ? ambangDariRow(m) : null;
  const baris = useMemo(() => (skor.baris && ro.baris && bobot && ambang ? barisSkor(skor.baris, ro.baris, bobot, ambang) : null), [skor.baris, ro.baris, bobot, ambang]);
  const persen = bobot ? persenBobot(bobot) : null;
  const sampai = Number(skor.baris?.[0]?.sampai_bulan ?? 0);
  const tahun = Number(skor.baris?.[0]?.tahun ?? new Date().getFullYear());
  const terpilih = baris?.find((b) => b.ro_kode === pilih) ?? null;

  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-skor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="judul-skor" className={judulKartu}>3. Skor kualitas RAB per RO</h2>
        <span className="text-[12px] text-[#5B6B84]">Pembinaan, bukan sanksi</span>
      </div>
      <p className="text-[12.5px] text-[#5B6B84]">Skor menilai kualitas perencanaan, bukan kinerja orangnya. Bobot hanya dapat diubah PPK. Skor semua RO dapat dilihat semua pengguna: PPK, bendahara, ketua tim, tata usaha, KPA, dan lainnya. Rumus masih sementara dan menunggu keputusan PPK.</p>
      {persen && (
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          {([["Ketepatan rencana penarikan", persen.penarikan], ["Ketepatan volume", persen.volume], ["Cakupan RAB", persen.cakupan], ["Disiplin revisi", persen.disiplin]] as const).map(([k, v]) => (
            <span key={k} className="rounded-full bg-[#EEF2F7] px-2.5 py-1 font-semibold text-[#44546F]">{k} {v}%</span>
          ))}
        </div>
      )}
      {galat && <Galat pesan={galat} />}
      {!galat && !baris && <Memuat tinggi="h-32" />}
      {baris && baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Pengguna ini tidak memiliki RO yang dinilai.</p>}
      {baris && baris.length > 0 && (
        <div className="max-h-[460px] overflow-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-[#EEF3FB] text-[#44546F]">
              <tr><th className="px-2.5 py-2">RO</th><th className="px-2.5 py-2 text-right">Skor</th><th className="px-2.5 py-2">Penilaian</th><th className="px-2.5 py-2 text-right">Penarikan</th><th className="px-2.5 py-2 text-right">Volume</th><th className="px-2.5 py-2 text-right">Cakupan RAB</th><th className="px-2.5 py-2 text-right">Disiplin revisi</th><th className="px-2.5 py-2"><span className="sr-only">Rincian</span></th></tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.ro_kode} className={`border-t border-[#EEF2F7] align-top ${pilih === b.ro_kode ? "bg-[#F5F8FE]" : ""}`}>
                  <td className="break-words px-2.5 py-2"><b className="font-mono text-[#0F2A52]">{b.ro_kode}</b><div className="text-[11.5px] text-[#5B6B84]">{b.nama}</div></td>
                  <td className="px-2.5 py-2 text-right text-[15px] font-extrabold text-[#0F2A52]">{nilaiSkor(b.skor)}</td>
                  <td className="px-2.5 py-2">{b.skor === null ? "-" : <Chip warna={WARNA_KATEGORI[b.label] ?? "abu"}>{b.label}</Chip>}</td>
                  <td className="px-2.5 py-2 text-right">{nilaiSkor(b.penarikan)}</td>
                  <td className="px-2.5 py-2 text-right">{nilaiSkor(b.volume)}</td>
                  <td className="px-2.5 py-2 text-right">{nilaiSkor(b.cakupan)}</td>
                  <td className="px-2.5 py-2 text-right">{nilaiSkor(b.disiplin)}</td>
                  <td className="px-2.5 py-2 text-right"><button type="button" aria-pressed={pilih === b.ro_kode} onClick={() => setPilih(pilih === b.ro_kode ? null : b.ro_kode)} className={tombolKecil}>{pilih === b.ro_kode ? "Tutup" : "Rincian"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {terpilih && <Rincian key={terpilih.ro_kode} kode={terpilih.ro_kode} nama={terpilih.nama} tahun={tahun} sampai={sampai} />}
      <p className="text-[12px] leading-snug text-[#5B6B84]">
        <b className="text-[#0F2A52]">Cara hitung:</b> penarikan = 100 × (1 − jumlah selisih mutlak bulanan ÷ jumlah nilai terbesar rencana atau realisasi tiap bulan), sampai bulan data realisasi terakhir{sampai > 0 ? ` (bulan ke-${sampai})` : ""}. Volume = 100 × (1 − jumlah selisih volume RAB dengan POK ÷ jumlah terbesar) pada item yang belum selesai. Cakupan = porsi pagu RO yang sudah berRAB. Disiplin = porsi usulan revisi RO yang disetujui pada jadwal yang sudah ditutup. Skor = rata-rata komponen berbobot; komponen yang belum dapat dinilai tidak ikut dihitung.
      </p>
    </section>
  );
}
