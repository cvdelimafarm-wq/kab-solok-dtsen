"use client";

// app/sigap/kelola/umpan-balik/penilaian360/page.tsx
//
// (10 Nov 2026) Pemantau Penilaian 360 antaranggota tim (Pendataan Bencana) di SIGAP Kelola: rekap rata-rata per orang dan daftar yang belum selesai menilai.
// Data: GET /api/sigap/penilaian360?kegiatan=ID&rekap=1 (izin bencana.admin tingkat lihat). Penilaian bersifat rahasia: halaman ini hanya menampilkan
// rata-rata per orang, tidak menampilkan siapa menilai siapa dan tidak menampilkan catatan.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../../../admin/api";
import Bingkai from "../../../kontrak/Bingkai";
import { ambilJson } from "../../../foto/klien";
import { KRITERIA, type PeranTim, type Skor } from "@/lib/penilaian360";

const KEGIATAN_PENDATAAN = 1;
const NAMA_PERAN: Record<PeranTim, string> = { kortim: "Ketua tim", pml: "PML", ppl: "PPL" };

type Rekap = {
  rekap: { akun_id: number; nama: string; peran: PeranTim | null; kelompok: number | null; penilai: number; rata: number; per: Skor }[];
  belum: { akun_id: number; nama: string; kelompok: number | null; sisa: number }[];
  jumlahOrang: number;
};

export default function PemantauPenilaian360() {
  const [data, setData] = useState<Rekap | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [dilarang, setDilarang] = useState(false);

  const muat = useCallback(async () => {
    try {
      setData(await ambilJson<Rekap>(`/api/sigap/penilaian360?kegiatan=${KEGIATAN_PENDATAAN}&rekap=1`));
      setGalat(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "SESI_BERAKHIR") return keMasuk();
      if ((e as { status?: number }).status === 403) return setDilarang(true);
      setGalat(m || "Gagal memuat rekap.");
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void muat();
  }, [muat]);

  const sudah = data ? data.jumlahOrang - data.belum.length : 0;

  return (
    <Bingkai
      aktif="umpan_balik"
      kecil="SIGAP · Penilaian 360"
      jejak={["Pengelolaan", "Umpan balik pengguna", "Penilaian 360"]}
      judul="Penilaian 360 antaranggota tim"
      sub="Pendataan Bencana · rata-rata per orang dan kemajuan penilaian"
      kembali={{ induk: "/sigap/kelola/umpan-balik" }}
    >
      {dilarang ? (
        <p className="rounded-xl bg-white px-4 py-6 text-center text-[13.5px] text-[#4D5B6B]">Halaman ini hanya untuk pengelola Pendataan Bencana.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p className="m-0 text-[13px] text-[#55657D]">
              {data ? <><b className="text-[#0F2A52]">{sudah}</b> dari {data.jumlahOrang} orang sudah selesai menilai rekan satu timnya.</> : "Memuat…"}
            </p>
            <button type="button" onClick={() => void muat()} className="ml-auto min-h-[38px] px-2 text-[12.5px] font-bold text-[#1F5FD1]">
              Muat ulang
            </button>
          </div>
          {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{galat}</p>}
          {data && (
            <>
              <section className="rounded-2xl border border-[#E3E8EE] bg-white p-3.5">
                <b className="text-[14px] text-[#0F2A52]">Rata-rata per orang (skala 1–5)</b>
                <p className="m-0 mt-0.5 text-[12px] text-[#6B7A90]">n = jumlah penilai. Rahasia: tidak ada daftar siapa menilai siapa dan tidak ada catatan di halaman ini.</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[#55657D]">
                        <th className="p-1.5">Nama</th>
                        <th className="p-1.5">Peran</th>
                        <th className="p-1.5">Kel</th>
                        <th className="p-1.5">n</th>
                        {KRITERIA.map((k) => <th key={k.kode} className="p-1.5" title={k.tanya}>{k.label}</th>)}
                        <th className="p-1.5">Rata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rekap.map((r) => (
                        <tr key={r.akun_id} className="border-t border-[#EEF3FA]">
                          <td className="p-1.5 font-bold text-[#12315F]">{r.nama}</td>
                          <td className="p-1.5">{r.peran ? NAMA_PERAN[r.peran] : "—"}</td>
                          <td className="p-1.5">{r.kelompok ?? "Semua"}</td>
                          <td className="p-1.5">{r.penilai}</td>
                          {KRITERIA.map((k) => <td key={k.kode} className="p-1.5">{r.per[k.kode]}</td>)}
                          <td className="p-1.5 font-extrabold">{r.rata}</td>
                        </tr>
                      ))}
                      {data.rekap.length === 0 && <tr><td colSpan={5 + KRITERIA.length} className="p-2 text-[#6B7A90]">Belum ada penilaian masuk.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="rounded-2xl border border-[#E3E8EE] bg-white p-3.5">
                <b className="text-[14px] text-[#0F2A52]">Belum selesai menilai ({data.belum.length} orang)</b>
                {data.belum.length === 0 ? (
                  <p className="m-0 mt-1 text-[12.5px] text-[#13794B]">Semua anggota sudah selesai menilai.</p>
                ) : (
                  <ul className="m-0 mt-1.5 list-none p-0 text-[12.5px] text-[#4D5B6B]">
                    {data.belum.map((b) => (
                      <li key={b.akun_id} className="py-0.5">
                        <b className="text-[#12315F]">{b.nama}</b> · {b.kelompok ? `Kelompok ${b.kelompok}` : "Lintas kelompok"} · sisa {b.sisa} rekan
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </Bingkai>
  );
}
