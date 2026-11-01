"use client";

// app/sigap/delego/KertasKerja.tsx
//
// (1 Nov 2026) Kertas kerja perhitungan beban: membantu mengusulkan skor yang masuk akal dari parameter yang bisa diperkirakan (halaman, persen terisi,
// pertanyaan per halaman atau per sel isian, detik per pertanyaan, dst). Hasilnya hanya USULAN skor; pengusul dan Ketua Tim tetap yang memutuskan.
// Nilai bawaan adalah angka ilustrasi yang belum dikalibrasi (lib/delego/skor.ts).

import { useMemo, useState } from "react";
import { BAWAAN_KERTAS, JENIS_KERTAS, NAMA_KERTAS, SATUAN_KERTAS, bacaKertas, hitungKertas, type JenisKertas, type KertasKerja } from "@/lib/delego/skor";
import { KELAS } from "./merek";
import { Galat, Info, Medan, fmt } from "./ui";

type Isian = { kunci: string; label: string; bantu?: string; satuan?: string };
const ISIAN: Record<JenisKertas, Isian[]> = {
  dokumen: [
    { kunci: "halaman", label: "Jumlah halaman dokumen" },
    { kunci: "persenIsi", label: "Persen halaman yang terisi", satuan: "%" },
    { kunci: "pertanyaan", label: "Pertanyaan atau sel isian per halaman terisi", bantu: "Hitung per sel isian, bukan per pertanyaan induk." },
    { kunci: "detik", label: "Detik memeriksa satu pertanyaan", satuan: "detik" },
    { kunci: "tambahan", label: "Tambahan administrasi dan tindak lanjut", satuan: "%" },
  ],
  keuangan: [
    { kunci: "baris", label: "Jumlah baris transaksi" },
    { kunci: "menitBaris", label: "Menit memeriksa satu baris", satuan: "menit" },
    { kunci: "persenTelusur", label: "Persen baris yang ditelusuri ke bukti", satuan: "%" },
    { kunci: "menitTelusur", label: "Menit menelusuri satu baris", satuan: "menit" },
    { kunci: "tambahan", label: "Tambahan administrasi dan tindak lanjut", satuan: "%" },
  ],
  register: [
    { kunci: "record", label: "Jumlah record di register" },
    { kunci: "persenSampel", label: "Persen record yang diperiksa (sampel)", satuan: "%" },
    { kunci: "menitRecord", label: "Menit memeriksa satu record", satuan: "menit" },
    { kunci: "persenTemuan", label: "Persen record yang ada temuannya", satuan: "%" },
    { kunci: "menitTindak", label: "Menit menindaklanjuti satu temuan", satuan: "menit" },
    { kunci: "tambahan", label: "Tambahan administrasi dan tindak lanjut", satuan: "%" },
  ],
  peta: [
    { kunci: "sls", label: "Jumlah SLS dalam satu peta" },
    { kunci: "menitSls", label: "Menit memeriksa satu SLS", satuan: "menit" },
    { kunci: "persenVerifikasi", label: "Persen SLS yang diverifikasi lapangan atau citra", satuan: "%" },
    { kunci: "menitVerifikasi", label: "Menit memverifikasi satu SLS", satuan: "menit" },
    { kunci: "tambahan", label: "Tambahan administrasi dan tindak lanjut", satuan: "%" },
  ],
  susun: [
    { kunci: "halaman", label: "Jumlah halaman yang disusun" },
    { kunci: "menitHalaman", label: "Menit menyusun satu halaman", satuan: "menit" },
    { kunci: "revisi", label: "Jumlah putaran revisi" },
    { kunci: "tambahan", label: "Tambahan administrasi", satuan: "%" },
  ],
  tetap: [
    { kunci: "durasi", label: "Durasi acara", satuan: "menit" },
    { kunci: "persiapan", label: "Persiapan", satuan: "menit" },
    { kunci: "perjalanan", label: "Perjalanan pergi dan pulang", satuan: "menit" },
  ],
};

export type HasilKertasPakai = { kertas: KertasKerja; skor: number; satuan: string };

export default function KertasKerjaPanel({ awal, onPakai }: { awal?: unknown; onPakai: (h: HasilKertasPakai) => void }) {
  const dasar = bacaKertas(awal);
  const [jenis, setJenis] = useState<JenisKertas>(dasar?.jenis ?? "dokumen");
  const [nilai, setNilai] = useState<Record<string, string>>(() => {
    const k = (dasar ?? BAWAAN_KERTAS.dokumen) as unknown as Record<string, unknown>;
    const o: Record<string, string> = {};
    for (const [a, b] of Object.entries(k)) if (a !== "jenis") o[a] = String(b);
    return o;
  });

  const ganti = (j: JenisKertas) => {
    setJenis(j);
    const k = BAWAAN_KERTAS[j] as unknown as Record<string, unknown>;
    const o: Record<string, string> = {};
    for (const [a, b] of Object.entries(k)) if (a !== "jenis") o[a] = String(b);
    setNilai(o);
  };

  const kertas = useMemo(() => {
    const k: Record<string, unknown> = { jenis };
    for (const i of ISIAN[jenis]) {
      const n = Number(String(nilai[i.kunci] ?? "").replace(",", "."));
      k[i.kunci] = Number.isFinite(n) ? n : Number.NaN;
    }
    return k as unknown as KertasKerja;
  }, [jenis, nilai]);
  const hasil = useMemo(() => hitungKertas(kertas), [kertas]);

  return (
    <div className="space-y-3 rounded-xl border border-[#9CC5BF] bg-[#F7FBFA] p-3">
      <div className="text-[14px] font-bold text-[#0B524C]">Kertas kerja perhitungan beban</div>
      <Medan label="Jenis pekerjaan">
        <select className={KELAS.isian} value={jenis} onChange={(e) => ganti(e.target.value as JenisKertas)}>
          {JENIS_KERTAS.map((j) => (
            <option key={j} value={j}>
              {NAMA_KERTAS[j]}
            </option>
          ))}
        </select>
      </Medan>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ISIAN[jenis].map((i) => (
          <Medan key={i.kunci} label={i.satuan ? `${i.label} (${i.satuan})` : i.label} bantu={i.bantu}>
            <input className={KELAS.isian} inputMode="decimal" value={nilai[i.kunci] ?? ""} onChange={(e) => setNilai((x) => ({ ...x, [i.kunci]: e.target.value }))} />
          </Medan>
        ))}
      </div>
      {hasil.galat ? (
        <Galat>{hasil.galat}</Galat>
      ) : (
        <div className="space-y-2">
          <ul className="m-0 list-none space-y-0.5 p-0 text-[13px]">
            {hasil.rincian.map((r) => (
              <li key={r.label} className="flex justify-between gap-3">
                <span className="text-[#3B4A57]">{r.label}</span>
                <b>{r.nilai}</b>
              </li>
            ))}
          </ul>
          <Info>
            Perkiraan {fmt(hasil.menit, 0)} menit per satuan, usulan skor <b>{fmt(hasil.skorUsul, 1)} poin</b> per {SATUAN_KERTAS[jenis]}. Angka bawaan hanya ilustrasi; sesuaikan dengan pengalaman Anda.
          </Info>
          <button type="button" className={KELAS.tombolKecilUtama} onClick={() => onPakai({ kertas, skor: hasil.skorUsul, satuan: SATUAN_KERTAS[jenis] })}>
            Pakai skor ini
          </button>
        </div>
      )}
    </div>
  );
}
