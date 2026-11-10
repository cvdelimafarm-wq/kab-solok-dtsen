"use client";

// app/sigap/kelola/umpan-balik/page.tsx
//
// (10 Nov 2026) SIGAP Kelola > Umpan balik pengguna: satu tempat memantau SEMUA fitur yang mengumpulkan umpan balik dari pengguna (masukan, penilaian
// antarrekan, usulan kasus, dan fitur baru yang didaftarkan di lib/umpanBalik.ts). Daftar kartu dibangun dari registri lewat /api/sigap/kelola/umpan-balik;
// fitur baru tidak mungkin ketinggalan (dijaga lib/__tests__/umpanBalikMonitoring.test.ts).

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../../admin/api";
import Bingkai from "../../kontrak/Bingkai";
import { ambilJson } from "../../foto/klien";

type Cuplikan = { nama: string; teks: string; waktu: string };
type Sumber = {
  kode: string;
  nama: string;
  ket: string;
  alamat: string;
  galat?: true;
  total?: number;
  menunggu?: number | null;
  terakhir?: string | null;
  cuplikan?: Cuplikan[];
};

const tgl = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—";

export default function KelolaUmpanBalik() {
  const [sumber, setSumber] = useState<Sumber[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [dilarang, setDilarang] = useState(false);

  const muat = useCallback(async () => {
    try {
      const d = await ambilJson<{ sumber: Sumber[] }>("/api/sigap/kelola/umpan-balik");
      setSumber(d.sumber);
      setGalat(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "SESI_BERAKHIR") return keMasuk();
      if ((e as { status?: number }).status === 403) return setDilarang(true);
      setGalat(m || "Gagal memuat umpan balik.");
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void muat();
  }, [muat]);

  const menungguSemua = (sumber ?? []).reduce((a, s) => a + (s.menunggu ?? 0), 0);

  return (
    <Bingkai
      aktif="umpan_balik"
      kecil="SIGAP · Umpan balik pengguna"
      jejak={["Pengelolaan", "Umpan balik pengguna"]}
      judul="Umpan balik pengguna"
      sub="Pantauan semua fitur yang mengumpulkan masukan, penilaian, atau usulan dari pengguna"
      kembali={{ induk: "/" }}
    >
      {dilarang ? (
        <p className="rounded-xl bg-white px-4 py-6 text-center text-[13.5px] text-[#4D5B6B]">Halaman ini hanya untuk pengelola yang berwenang.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p className="m-0 text-[13px] text-[#55657D]">
              {sumber ? (menungguSemua > 0 ? <><b className="text-[#9A6200]">{menungguSemua}</b> butir menunggu tindak lanjut.</> : "Tidak ada yang menunggu tindak lanjut.") : "Memuat…"}
            </p>
            <button type="button" onClick={() => void muat()} className="ml-auto min-h-[38px] px-2 text-[12.5px] font-bold text-[#1F5FD1]">
              Muat ulang
            </button>
          </div>
          {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{galat}</p>}
          <ul className="space-y-2.5">
            {(sumber ?? []).map((s) => (
              <li key={s.kode} className="rounded-2xl border border-[#E3E8EE] bg-white p-3.5">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block text-[14.5px] text-[#0F2A52]">{s.nama}</b>
                    <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#55657D]">{s.ket}</p>
                  </div>
                  <Link href={s.alamat} className="min-h-[38px] rounded-lg bg-[#1F5FD1] px-3.5 py-2 text-[13px] font-bold text-white">
                    Buka pemantau
                  </Link>
                </div>
                {s.galat ? (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">Gagal memuat angka sumber ini (tabel belum siap atau galat basis data).</p>
                ) : (
                  <>
                    <div className="mt-2.5 flex flex-wrap gap-2 text-[12.5px]">
                      <span className="rounded-full bg-[#EEF1F5] px-2.5 py-1 font-bold text-[#4D5B6B]">Masuk: {s.total ?? 0}</span>
                      {s.menunggu !== null && s.menunggu !== undefined && (
                        <span className={`rounded-full px-2.5 py-1 font-bold ${s.menunggu > 0 ? "bg-[#FBEFD6] text-[#9A6200]" : "bg-[#E3F6EC] text-[#13794B]"}`}>Menunggu: {s.menunggu}</span>
                      )}
                      <span className="rounded-full bg-[#EEF1F5] px-2.5 py-1 font-bold text-[#4D5B6B]">Terakhir: {tgl(s.terakhir)}</span>
                    </div>
                    {(s.cuplikan ?? []).length > 0 && (
                      <ul className="m-0 mt-2.5 list-none space-y-1 border-t border-[#EEF1F6] p-0 pt-2 text-[12.5px] text-[#4D5B6B]">
                        {(s.cuplikan ?? []).map((c, i) => (
                          <li key={i} className="leading-snug">
                            <b className="text-[#0F2A52]">{c.nama}</b> · {c.teks} <span className="text-[#7B8794]">({tgl(c.waktu)})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {sumber && sumber.length === 0 && <p className="rounded-xl bg-white px-4 py-6 text-center text-[13.5px] text-[#6B7A90]">Belum ada sumber umpan balik yang dapat Anda lihat.</p>}
        </>
      )}
    </Bingkai>
  );
}
