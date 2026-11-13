"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/tim/StatusKursi.tsx
//
// (14 Nov 2026, Fase 2a) Kartu "Status kursi" di langkah 3 Susunan tim kerja (mockup F3). Dibaca dari identifikasi lanjutan versi HILIR
// (versi yang dipakai modul lain) dan penugasan SIGAP pada kegiatan tertaut (keu_v_ident_kursi_tugas). Hanya baca; status dihitung lib/keu/kursi.ts.
// Tabel padat; tiap kolom punya saringan; HP 360 bergulir di dalam kotak tabel, bukan halaman.

import { useMemo, useState } from "react";
import { Chip, judulKartu, kartu } from "@/app/sigap/keu-ui";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";
import { urlBaca } from "@/lib/keu/ro";
import type { IsiLanjutan } from "@/lib/keu/lanjutan";
import { kalimatKursi, LABEL_STATUS_KURSI, susunKursi, type BarisTugasKursi, type StatusKursi as Status } from "@/lib/keu/kursi";

const WARNA: Record<Status, "hijau" | "kuning" | "abu"> = { final: "hijau", sementara: "kuning", rencana: "abu" };
const isian = "h-8 w-full min-w-0 rounded-md border border-[#C9D6EA] bg-white px-1.5 text-[12px]";

export default function StatusKursi({ identId, isiHilir, verHilir, statusHilir }: { identId: number; isiHilir: IsiLanjutan | null; verHilir: number | null; statusHilir: string | null }) {
  const tugas = useBacaKeu<BarisTugasKursi>(urlBaca("keu_v_ident_kursi_tugas", { ident_id: identId }, { batas: 2000 }));
  const rekap = useMemo(() => susunKursi(isiHilir, statusHilir === "final", tugas.baris ?? []), [isiHilir, statusHilir, tugas.baris]);
  const [sPeran, setSPeran] = useState("");
  const [sNama, setSNama] = useState("");
  const [sStatus, setSStatus] = useState("");
  const [sTugas, setSTugas] = useState("");

  const baris = useMemo(() => {
    if (!rekap) return [];
    const out: { peran: string; nama: string; jenis: string; status: Status; tugas: string; st: boolean }[] = [];
    for (const r of rekap.peran) {
      for (const o of r.orang) {
        const t = o.ditugaskan.length === 0 ? "Belum" : o.ditugaskan.map((d) => (d.fungsi === "pelatihan" ? "Pelatihan" : "Pendataan")).join(" + ");
        out.push({ peran: r.nama, nama: o.petugas.nama.trim() || "(belum bernama)", jenis: o.petugas.status, status: o.status, tugas: t, st: o.ditugaskan.some((d) => d.ada_st) });
      }
      for (let i = 0; i < Math.max(0, r.kursi - r.orang.length); i++) out.push({ peran: r.nama, nama: "(belum bernama)", jenis: "", status: "rencana", tugas: "Belum", st: false });
    }
    const q = sNama.trim().toLowerCase();
    return out.filter((b) => (!sPeran || b.peran === sPeran) && (!q || b.nama.toLowerCase().includes(q)) && (!sStatus || b.status === sStatus) && (!sTugas || (sTugas === "belum" ? b.tugas === "Belum" : b.tugas !== "Belum")));
  }, [rekap, sPeran, sNama, sStatus, sTugas]);

  if (!rekap) return null;
  return (
    <section className={kartu} aria-label="Status kursi">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`m-0 ${judulKartu}`}>Status kursi</h2>
        <span className="text-[12px] text-[#5B6B84]">lanjutan versi {verHilir ?? "-"} ({statusHilir === "final" ? "Final" : "Draf"}) · {kalimatKursi(rekap)}</span>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-[#44546F]">
        Rencana = jumlah saja. Sementara = nama diusulkan, belum disahkan. Final = disahkan; baru di sini surat tugas, butir kerja, dan pembayaran boleh memakai nama itu.
        Ditugaskan = sudah punya penugasan SIGAP dengan peran yang sama pada kegiatan tertaut.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rekap.peran.map((r) => (
          <div key={r.peran} className="rounded-lg border border-[#E1E7EF] px-2.5 py-2">
            <div className="flex items-center justify-between gap-1.5">
              <b className="text-[13px]">{r.nama}</b>
              <Chip warna={WARNA[r.status]}>{LABEL_STATUS_KURSI[r.status]}</Chip>
            </div>
            <div className="mt-0.5 text-[12px] text-[#44546F]">{r.terisi}/{r.kursi} bernama · {r.ditugaskan} ditugaskan{r.denganSt > 0 ? ` · ${r.denganSt} ber-ST` : ""}</div>
          </div>
        ))}
      </div>
      {rekap.tanpaPeran > 0 && <p className="m-0 mt-2 text-[12px] text-[#5B6B84]">{rekap.tanpaPeran} orang hanya memegang jabatan tim (tanpa peran lapangan); tidak dihitung sebagai kursi.</p>}
      <div className="mt-2.5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#F7F9FC] text-[11px] uppercase tracking-wide text-[#5B6B84]">
              <th className="px-2 py-1.5">Peran</th><th className="px-2 py-1.5">Nama</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Ditugaskan</th>
            </tr>
            <tr>
              <th className="px-1 py-1"><select aria-label="Saring peran" className={isian} value={sPeran} onChange={(e) => setSPeran(e.target.value)}><option value="">Semua</option>{rekap.peran.map((r) => <option key={r.peran} value={r.nama}>{r.nama}</option>)}</select></th>
              <th className="px-1 py-1"><input aria-label="Saring nama" className={isian} value={sNama} onChange={(e) => setSNama(e.target.value)} placeholder="Cari nama" /></th>
              <th className="px-1 py-1"><select aria-label="Saring status" className={isian} value={sStatus} onChange={(e) => setSStatus(e.target.value)}><option value="">Semua</option><option value="final">Final</option><option value="sementara">Sementara</option><option value="rencana">Rencana</option></select></th>
              <th className="px-1 py-1"><select aria-label="Saring penugasan" className={isian} value={sTugas} onChange={(e) => setSTugas(e.target.value)}><option value="">Semua</option><option value="ya">Sudah</option><option value="belum">Belum</option></select></th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} className="border-t border-[#EEF2F6] align-top">
                <td className="px-2 py-1.5 font-semibold">{b.peran}</td>
                <td className="px-2 py-1.5">{b.nama}{b.jenis ? <span className="text-[#5B6B84]"> · {b.jenis}</span> : null}</td>
                <td className="px-2 py-1.5"><Chip warna={WARNA[b.status]}>{LABEL_STATUS_KURSI[b.status]}</Chip></td>
                <td className="px-2 py-1.5">{b.tugas}{b.st ? <span className="text-[#5B6B84]"> · ST</span> : null}</td>
              </tr>
            ))}
            {baris.length === 0 && <tr><td colSpan={4} className="px-2 py-3 text-center text-[#5B6B84]">Tidak ada baris yang cocok dengan saringan.</td></tr>}
          </tbody>
        </table>
      </div>
      {tugas.galat && <p className="m-0 mt-2 text-[12px] text-[#7A1D22]">Penugasan belum terbaca: {tugas.galat}</p>}
    </section>
  );
}
