"use client";

// app/sigap/akses/DaftarPegawai.tsx
//
// (31 Okt 2026) Tabel "Daftar pegawai organik" di tab Pengguna: kolom sesuai daftar kepegawaian (NIP lama/baru, jabatan, status, JK, tanggal lahir,
// usia, TMT, masa kerja, email) ditambah Kecamatan | Nagari domisili di sebelah nama dan Kecamatan kantor di ujung data, lalu kolom Reset PIN.
// Data dan hitungan usia/masa kerja: /api/sigap/pengguna (lib/pegawaiOrganik.ts). NIP disamarkan kecuali "Tampilkan NIP lengkap" (izin kelola, tercatat di audit).

import { useMemo, useState } from "react";
import { BTN_O, Chip, INPUT, Kartu, TabelKartu, TD, TH } from "../admin/ui";
import { saringPegawai, type BarisPegawai, type RingkasPegawai, type SaringanPegawai } from "@/lib/pegawaiOrganik";

type Props = {
  baris: BarisPegawai[];
  ringkasan: RingkasPegawai;
  memuat: boolean;
  bolehKelola: boolean;
  nipPenuh: boolean;
  onAlihNip: () => void;
  onMuat: () => void;
  onResetPin: (akunId: number, nama: string) => void;
};

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "–" : v);

export default function DaftarPegawai({ baris, ringkasan, memuat, bolehKelola, nipPenuh, onAlihNip, onMuat, onResetPin }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<NonNullable<SaringanPegawai["status"]>>("semua");
  const terlihat = useMemo(() => saringPegawai(baris, { q, status }), [baris, q, status]);

  return (
    <Kartu
      judul="Daftar pegawai organik"
      ket={`${ringkasan.daftar} pegawai di daftar · ${ringkasan.punya_akun} punya akun SIGAP · ${ringkasan.tanpa_akun} belum punya akun · ${ringkasan.akun_di_luar_daftar} akun di luar daftar${memuat ? " · memuat…" : ""}`}
      kanan={
        <div className="flex flex-wrap gap-2">
          {bolehKelola && (
            <button type="button" className={BTN_O} onClick={onAlihNip} disabled={memuat}>
              {nipPenuh ? "Samarkan NIP" : "Tampilkan NIP lengkap"}
            </button>
          )}
          <button type="button" className={BTN_O} onClick={onMuat} disabled={memuat}>
            Muat ulang
          </button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input aria-label="Cari pegawai" className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama, jabatan, email, wilayah…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Saring status" className={INPUT} value={status} onChange={(e) => setStatus(e.target.value as NonNullable<SaringanPegawai["status"]>)}>
          <option value="semua">Semua ({baris.length})</option>
          <option value="PNS">PNS ({ringkasan.pns})</option>
          <option value="PPPK">PPPK ({ringkasan.pppk})</option>
          <option value="tanpa_akun">Belum punya akun ({ringkasan.tanpa_akun})</option>
          <option value="luar_daftar">Akun di luar daftar ({ringkasan.akun_di_luar_daftar})</option>
        </select>
      </div>

      <TabelKartu className="!shadow-none">
        <thead>
          <tr>
            <th className={TH}>No</th>
            <th className={TH}>Nama Lengkap</th>
            <th className={TH}>Domisili (Kecamatan | Nagari)</th>
            <th className={TH}>NIP Lama</th>
            <th className={TH}>NIP Baru</th>
            <th className={TH}>Kelompok/Jabatan</th>
            <th className={TH}>Status</th>
            <th className={TH}>Jenis Kelamin</th>
            <th className={TH}>Tanggal Lahir</th>
            <th className={TH}>Usia</th>
            <th className={TH}>TMT Pengangkatan</th>
            <th className={TH}>Masa Kerja (thn)</th>
            <th className={TH}>Email</th>
            <th className={TH}>Kecamatan Kantor</th>
            <th className={TH}>PIN</th>
          </tr>
        </thead>
        <tbody>
          {terlihat.map((b) => (
            <tr key={`${b.no}-${b.nama}`} className={b.akun_aktif === false ? "opacity-60" : ""}>
              <td className={TD}>{b.no}</td>
              <td className={`${TD} font-semibold text-[#1B2B4B]`}>
                {b.nama}
                {b.dalam_daftar && b.akun_id === null && <span className="ml-1.5"><Chip w="wait">Belum punya akun</Chip></span>}
                {!b.dalam_daftar && <span className="ml-1.5"><Chip w="mut">Di luar daftar</Chip></span>}
                {b.akun_aktif === false && <span className="ml-1.5 text-[11px] font-bold text-[#B42329]">nonaktif</span>}
              </td>
              <td className={`${TD} whitespace-nowrap`}>
                {b.domisili_kecamatan || b.domisili_nagari ? `${b.domisili_kecamatan ?? "–"} | ${b.domisili_nagari ?? "–"}` : "–"}
              </td>
              <td className={`${TD} font-mono text-[12px]`}>{dash(b.nip_lama)}</td>
              <td className={`${TD} font-mono text-[12px]`}>{dash(b.nip_baru)}</td>
              <td className={TD}>{dash(b.jabatan)}</td>
              <td className={TD}>{dash(b.status)}</td>
              <td className={`${TD} whitespace-nowrap`}>{b.jenis_kelamin === "L" ? "Laki-laki" : b.jenis_kelamin === "P" ? "Perempuan" : "–"}</td>
              <td className={`${TD} whitespace-nowrap`}>{dash(b.tanggal_lahir)}</td>
              <td className={TD}>{dash(b.usia)}</td>
              <td className={`${TD} whitespace-nowrap`}>{dash(b.tmt_teks)}</td>
              <td className={TD}>{dash(b.masa_kerja)}</td>
              <td className={`${TD} text-[12px]`}>{dash(b.email)}</td>
              <td className={`${TD} whitespace-nowrap`}>{dash(b.kantor_kecamatan)}</td>
              <td className={TD}>
                {b.akun_id !== null && bolehKelola ? (
                  <button type="button" className={`${BTN_O} whitespace-nowrap`} onClick={() => onResetPin(b.akun_id as number, b.nama)}>
                    🔑 Reset PIN
                  </button>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          ))}
          {terlihat.length === 0 && (
            <tr>
              <td className={`${TD} text-center text-[#6B7A90]`} colSpan={15}>
                {memuat ? "Memuat…" : "Tidak ada pegawai yang cocok dengan saringan."}
              </td>
            </tr>
          )}
        </tbody>
      </TabelKartu>
      <p className="mt-3 text-[12px] text-[#6B7A90]">
        Usia dan masa kerja dihitung otomatis dari tanggal lahir dan TMT. Domisili memakai isian profil, bila kosong memakai kecamatan pada akun; nagari diisi dari profil.
      </p>
    </Kartu>
  );
}
