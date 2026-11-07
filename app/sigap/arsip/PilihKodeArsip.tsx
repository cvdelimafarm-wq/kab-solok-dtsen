"use client";

// app/sigap/arsip/PilihKodeArsip.tsx
//
// (7 Nov 2026) Pemilih kode klasifikasi arsip menurut Lampiran Perka BPS 99/2018. Kode ditentukan oleh isi surat (pokok masalah), bukan oleh kegiatan:
// mis. VS.220 Pelatihan Petugas, VS.330 Pengumpulan Data, KU.330 Belanja Jasa, KP.650 Surat Perintah Dinas/Surat Tugas.
// Cara pakai: ketik sebagian kode atau uraian, atau tekan salah satu kode yang sering dipakai.

import { useId, useMemo } from "react";
import { INPUT } from "../admin/ui";

export type OpsiKode = { kode: string; nama: string; fungsi?: string | null };
export type OpsiFungsi = { kode: string; nama: string };

export default function PilihKodeArsip({ kode, fungsi = [], sering = [], nilai, onUbah, bawaan = null, wajib = false, label = "Kode arsip" }: {
  kode: OpsiKode[];
  fungsi?: OpsiFungsi[];
  sering?: string[];
  nilai: string;
  onUbah: (v: string) => void;
  /** Kode yang dipakai bila kolom dikosongkan (kode bawaan jenis dokumen). */
  bawaan?: string | null;
  wajib?: boolean;
  label?: string;
}) {
  const id = useId();
  const peta = useMemo(() => new Map(kode.map((k) => [k.kode, k])), [kode]);
  const namaFungsi = useMemo(() => new Map(fungsi.map((f) => [f.kode, f.nama])), [fungsi]);
  const v = nilai.trim().toUpperCase();
  const cocok = v ? peta.get(v) ?? null : null;
  const asing = !!v && !cocok;
  const cepat = sering.map((k) => peta.get(k)).filter((k): k is OpsiKode => !!k);
  const keterangan = (k: OpsiKode) => `${k.nama}${k.fungsi && namaFungsi.get(k.fungsi) ? ` (${namaFungsi.get(k.fungsi)})` : ""}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-i`} className="flex flex-col gap-0.5 text-[12px] font-bold text-[#5B6B84]">
        {label} (Perka BPS 99/2018){wajib ? " *" : ""}
        <input
          id={`${id}-i`}
          list={`${id}-l`}
          className={`${INPUT} font-mono`}
          value={nilai}
          maxLength={40}
          autoComplete="off"
          placeholder={bawaan ? `Kosong = ${bawaan}` : "Ketik kode atau uraian, mis. VS.220 atau pelatihan petugas"}
          onChange={(e) => {
            const t = e.target.value;
            onUbah(/^[A-Za-z]{2}\.\d{0,3}$/.test(t) ? t.toUpperCase() : t);
          }}
        />
      </label>
      <datalist id={`${id}-l`}>
        {kode.map((k) => <option key={k.kode} value={k.kode} label={keterangan(k)} />)}
      </datalist>
      {cepat.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#5B6B84]">
          <span>Sering dipakai:</span>
          {cepat.map((k) => (
            <button key={k.kode} type="button" title={k.nama} onClick={() => onUbah(k.kode)} className={`rounded-md border px-1.5 py-0.5 font-mono text-[11.5px] font-semibold ${v === k.kode ? "border-[#1F5FD1] bg-[#EAF1FD] text-[#1F5FD1]" : "border-[#D5DDEA] bg-white text-[#1B2B4B]"}`}>
              {k.kode} <span className="font-sans font-normal">{k.nama}</span>
            </button>
          ))}
        </div>
      )}
      {cocok && <span className="text-[11.5px] text-[#13794B]">{cocok.kode} · {keterangan(cocok)}</span>}
      {asing && <span role="alert" className="text-[11.5px] font-semibold text-[#B42329]">Kode tidak ada di daftar Perka BPS 99/2018. Pilih dari daftar yang muncul saat mengetik.</span>}
    </div>
  );
}

/** true bila nilai kosong atau kode yang dipilih ada di daftar. */
export const kodeTerpilihSah = (kode: OpsiKode[], nilai: string): boolean => !nilai.trim() || kode.some((k) => k.kode === nilai.trim().toUpperCase());
