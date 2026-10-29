"use client";

// app/sigap/delego/ringkasan/page.tsx
//
// (29 Okt 2026) Ringkasan bulanan ukuran keberhasilan: manajemen & strategi, pembinaan pegawai, kemudahan kerja.
// Hanya pemberi delegasi semua RO. Cetak/simpan PDF lewat dialog cetak peramban; CSV untuk Excel.
// Rincian per pegawai tampil di layar, tetapi ikut tercetak/terunduh hanya bila dicentang (bersifat internal).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { bacaSesi } from "@/app/portal/sesi";
import { awalBulan, geserBulan, kelompokBidang, namaBulan, ringkasanKeCsv, teksNilai, type IsiRingkasan } from "@/lib/delego/ringkasan";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Galat, Halaman, Kartu, Kosong, Memuat, Peringatan, fmt } from "../ui";

export default function RingkasanBulanan() {
  const router = useRouter();
  const { hak, hari } = useKonteksDelego();
  const bulanIni = awalBulan(hari);
  const [bulan, setBulan] = useState(bulanIni);
  const [isi, setIsi] = useState<IsiRingkasan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [denganPegawai, setDenganPegawai] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const sesi = bacaSesi();
      const res = await fetch(`/api/sigap/delego/ringkasan?bulan=${bulan.slice(0, 7)}`, { headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
      const j = (await res.json().catch(() => ({}))) as { data?: IsiRingkasan; error?: string };
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      if (!res.ok || !j.data) {
        setIsi(null);
        setGalat(j.error ?? `Gagal memuat (${res.status}).`);
      } else setIsi(j.data);
    } catch {
      setIsi(null);
      setGalat("Tidak dapat terhubung. Periksa sambungan lalu coba lagi.");
    } finally {
      setMemuat(false);
    }
  }, [bulan, router]);

  useEffect(() => {
    if (hak.semua) void muat();
  }, [hak.semua, muat]);

  const unduhCsv = () => {
    if (!isi) return;
    const url = URL.createObjectURL(new Blob([ringkasanKeCsv(isi, denganPegawai)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ringkasan-delego-${bulan.slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!hak.semua) {
    return (
      <Halaman judul="Ringkasan bulanan">
        <Peringatan>Halaman ini hanya untuk pemberi delegasi semua RO.</Peringatan>
      </Halaman>
    );
  }

  const kelompok = isi ? kelompokBidang(isi.ringkasan) : [];
  return (
    <Halaman
      judul="Ringkasan bulanan"
      sub={`Ukuran keberhasilan manajemen, ${namaBulan(bulan)}`}
      kanan={
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" className={KELAS.tombolSekunder} onClick={() => setBulan(geserBulan(bulan, -1))}>← Sebelumnya</button>
          <span className="min-w-[110px] text-center text-[14px] font-semibold">{namaBulan(bulan)}</span>
          <button type="button" className={KELAS.tombolSekunder} disabled={bulan >= bulanIni} onClick={() => setBulan(geserBulan(bulan, 1))}>Berikutnya →</button>
        </div>
      }
    >
      {memuat && !isi && <Memuat />}
      {galat && <Galat>{galat}</Galat>}
      {isi && (
        <>
          <div className="hidden print:block">
            <p className="m-0 text-[13px]">BPS Kabupaten Solok · Delego</p>
            <p className="m-0 text-[16px] font-bold">Ringkasan keberhasilan manajemen, {namaBulan(bulan)}</p>
          </div>
          {kelompok.map((g) => (
            <Kartu key={g.bidang} judul={g.bidang} className="break-inside-avoid">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-[#D5DCE2] text-[12.5px] text-[#3B4A57]">
                      <th className="py-1.5 pr-2 font-semibold">Ukuran</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Nilai</th>
                      <th className="py-1.5 pl-2 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.baris.map((r) => (
                      <tr key={r.kode} className="border-b border-[#EEF1F4] align-top">
                        <td className="py-1.5 pr-2"><span className="text-[#3B4A57]">{r.kode}</span> {r.ukuran}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-[#0B524C]">{teksNilai(r.nilai, r.satuan)} {r.satuan !== "%" && r.nilai !== null && <span className="font-normal text-[#3B4A57]">{r.satuan}</span>}</td>
                        <td className="py-1.5 pl-2 text-[12.5px] text-[#3B4A57]">{r.keterangan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Kartu>
          ))}
          <div className={denganPegawai ? "" : "print:hidden"}>
            <Kartu judul="Rincian per pegawai (internal)">
              {isi.pegawai.length === 0 ? (
                <Kosong>Belum ada delegasi, laporan, atau penilaian pada bulan ini.</Kosong>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-[13.5px]">
                    <thead>
                      <tr className="border-b border-[#D5DCE2] text-[12.5px] text-[#3B4A57]">
                        <th className="py-1.5 pr-2 font-semibold">Nama</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Delegasi</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Selesai</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Laporan</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Terlambat</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Poin</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Kualitas</th>
                        <th className="py-1.5 pl-2 text-right font-semibold">Kepatuhan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isi.pegawai.map((p) => (
                        <tr key={p.akun_id} className="border-b border-[#EEF1F4]">
                          <td className="py-1.5 pr-2">{p.nama}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.delegasi)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.selesai)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.laporan)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.terlambat)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.poin, 1)}</td>
                          <td className="px-2 py-1.5 text-right">{teksNilai(p.kualitas, "skor")}</td>
                          <td className="py-1.5 pl-2 text-right">{teksNilai(p.kepatuhan, "skor")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Kartu>
          </div>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <button type="button" className={KELAS.tombolUtama} onClick={() => window.print()}>Cetak / simpan PDF</button>
            <button type="button" className={KELAS.tombolSekunder} onClick={unduhCsv}>Unduh CSV</button>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" className="h-4 w-4 accent-[#0F6B63]" checked={denganPegawai} onChange={(e) => setDenganPegawai(e.target.checked)} />
              Sertakan rincian per pegawai saat dicetak atau diunduh
            </label>
          </div>
          <p className="m-0 text-[12.5px] text-[#3B4A57] print:hidden">Angka dihitung otomatis dari data Delego dan pelatihan pada bulan terpilih. Bulan yang baru berjalan masih berubah sampai akhir bulan.</p>
        </>
      )}
    </Halaman>
  );
}
