"use client";

// app/sigap/pelatihan/RingkasanPengelola.tsx
//
// (3 Nov 2026) Isi tab "Hari ini" bagi akun yang BUKAN peserta (instruktur, panitia, atasan): sebelumnya hanya pesan "Akun Anda bukan peserta" lalu kosong.
// Sekarang: sapaan sesuai peran, angka jalannya pelatihan (data Monitoring lewat simpanan bersama, jadi langsung tampil bila tab Monitoring pernah dibuka),
// catatan yang perlu ditindaklanjuti, dan tautan ke Monitoring / Kelola Pelatihan. Tab Absen, Instrumen, dan Kamera ada di bilah bawah.

import Link from "next/link";
import { Kartu, Memuat } from "../admin/ui";
import { useDataPel } from "./dataPel";
import { SAPAAN_PENGELOLA, catatanPerhatian, persen, type JenisPengguna, type RingkasanMon } from "@/lib/ringkasanPengelola";

type Penolak = { akun_id: number; nama: string; alasan: string | null };
type Mon = { jenis: JenisPengguna; ringkas: string; ringkasan: RingkasanMon; penolak?: Penolak[] };

function Angka({ label, nilai, dari }: { label: string; nilai: number; dari: number }) {
  const p = persen(nilai, dari);
  const warna = p >= 100 ? "bg-[#19A463]" : p > 0 ? "bg-[#1F5FD1]" : "bg-[#CBD6E6]";
  return (
    <div className="rounded-xl border border-[#E3EAF4] bg-[#F8FAFE] p-2.5">
      <b className="block text-[19px] font-extrabold leading-tight text-[#0F2A52]">
        {nilai}
        <span className="text-[12px] font-semibold text-[#6B7A90]">/{dari}</span>
      </b>
      <span className="block text-[11.5px] leading-tight text-[#5B6B84]">{label}</span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#E1E9F6]" role="progressbar" aria-valuemin={0} aria-valuemax={dari} aria-valuenow={nilai} aria-label={`${label}: ${nilai} dari ${dari}`}>
        <span className={`block h-full rounded-full ${warna}`} style={{ width: `${p}%` }} />
      </span>
    </div>
  );
}

export default function RingkasanPengelola({ bolehKelola }: { bolehKelola: boolean }) {
  const { data: m, galat } = useDataPel<Mon>("/api/sigap/pelatihan/monitoring");
  const sapa = SAPAAN_PENGELOLA[m?.jenis ?? "instruktur"];
  const r = m?.ringkasan;
  const catatan = r ? catatanPerhatian(r) : [];
  return (
    <Kartu judul={sapa.judul} ket={m?.ringkas}>
      <p className="m-0 text-[13px] leading-relaxed text-[#3B4A60]">
        {sapa.ket} Undangan pribadi hanya untuk peserta, jadi tidak ditampilkan di sini.
      </p>
      {!m && !galat && <Memuat />}
      {!m && galat && <p className="mt-3 text-[12.5px] text-[#B42329]">Ringkasan belum bisa dimuat. Buka tab Monitoring untuk melihat rincian.</p>}
      {r && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Angka label="Sudah hadir" nilai={r.hadir} dari={r.total} />
            <Angka label="Menerima undangan" nilai={r.undangan_terima} dari={r.total} />
            <Angka label="Pretest selesai" nilai={r.pretest_selesai} dari={r.total} />
            <Angka label="Posttest selesai" nilai={r.posttest_selesai} dari={r.total} />
          </div>
          {catatan.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {catatan.map((c) => (
                <p key={c.teks} className={`m-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${c.nada === "bad" ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>{c.teks}</p>
              ))}
            </div>
          ) : (
            r.total > 0 && <p className="m-0 mt-3 rounded-lg bg-[#E3F6EC] px-3 py-1.5 text-[12.5px] font-semibold text-[#13794B]">Tidak ada yang perlu ditindaklanjuti sekarang.</p>
          )}
        </>
      )}
      {m && (m.penolak?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">
          <b className="block">Menolak undangan dan sudah dikeluarkan ({m.penolak!.length})</b>
          <ul className="m-0 mt-1 list-disc space-y-0.5 pl-4">
            {m.penolak!.slice(0, 20).map((x) => (
              <li key={x.akun_id}>
                {x.nama}
                {x.alasan ? <span className="text-[#9A3A40]"> · {x.alasan}</span> : null}
              </li>
            ))}
          </ul>
          {m.penolak!.length > 20 && <p className="m-0 mt-1">… dan {m.penolak!.length - 20} lainnya.</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-bold">
        <Link href="/sigap/pelatihan/monitoring" className="text-[#1F5FD1] underline">Buka Monitoring</Link>
        {bolehKelola && <Link href="/sigap/kelola/pelatihan" className="text-[#1F5FD1] underline">Buka Kelola Pelatihan</Link>}
      </div>
    </Kartu>
  );
}
