"use client";

// app/sigap/delego/beban/page.tsx
//
// (26 Okt 2026) Beban kerja mingguan per orang (sasaran 80-100%) dan saran pemerataan. Hanya saran: pemberi yang memutuskan dan memindahkan tugas
// dengan mengubah/menambah delegasi. Kapasitas 60 poin per hari kerja, 5 hari per minggu (cek aturan).

import Link from "next/link";
import { useMemo, useState } from "react";
import { bebanDelegasiMinggu, bebanPerOrang, HARI_KERJA_MINGGU, KAPASITAS_HARIAN, SASARAN_BEBAN, usulPemerataan } from "@/lib/delego/hitung";
import { NAMA_PERAN } from "@/lib/delego/tipe";
import { useBahan, useCalon } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { PilihRo, saringRo, useFilterRo } from "../tim";
import { Batang, Galat, Halaman, Info, Kartu, Kosong, Lencana, Memuat, fmt } from "../ui";

export default function Beban() {
  const { hari, hak, pemberi } = useKonteksDelego();
  const f = useFilterRo();
  const b = useBahan();
  const roCalon = pemberi ? (f.ro && hak.beri_ro.includes(f.ro) ? f.ro : hak.beri_ro[0] ?? null) : null;
  const calon = useCalon(roCalon, null, "");
  const [buka, setBuka] = useState<number | null>(null);

  const delegasi = saringRo(b.data, f.ro);
  const orang = useMemo(() => bebanPerOrang(delegasi, hari, calon.data?.organik ?? []), [delegasi, hari, calon.data]);
  const saran = useMemo(() => usulPemerataan(orang, delegasi, hari), [orang, delegasi, hari]);
  const skala = Math.max(150, ...orang.map((o) => o.persen));

  return (
    <Halaman judul="Beban kerja" sub={`Minggu ini · kapasitas ${KAPASITAS_HARIAN} poin × ${HARI_KERJA_MINGGU} hari kerja = ${KAPASITAS_HARIAN * HARI_KERJA_MINGGU} poin per orang`} kanan={<PilihRo {...f} />}>
      <Info>Sasaran beban {SASARAN_BEBAN.min}–{SASARAN_BEBAN.max}% per orang per minggu. Angka ini bahan pertimbangan; keputusan memindahkan tugas ada pada pemberi delegasi.</Info>
      {b.memuat && !b.data && <Memuat />}
      {b.galat && !b.data && <Galat>{b.galat}</Galat>}
      {b.data && orang.length === 0 && <Kosong>Belum ada delegasi yang berjalan.</Kosong>}
      {b.data && orang.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Kartu judul={`Per orang (${orang.length})`}>
            <ul className="m-0 list-none divide-y divide-[#EEF1F4] p-0">
              {orang.map((o) => {
                const milik = delegasi.filter((d) => d.penerima_akun === o.akun && bebanDelegasiMinggu(d, hari) > 0);
                return (
                  <li key={o.akun} className="py-2.5">
                    <button type="button" className="block w-full text-left" onClick={() => setBuka(buka === o.akun ? null : o.akun)} aria-expanded={buka === o.akun}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-semibold">{o.nama} {o.jenis === "mitra" && <span className="text-[12px] font-normal text-[#3B4A57]">· mitra</span>}</span>
                        <span className="flex items-center gap-2">
                          <Lencana nada={o.kategori === "berlebih" ? "merah" : o.kategori === "sasaran" ? "hijau" : "abu"}>{o.kategori === "berlebih" ? "Berlebih" : o.kategori === "sasaran" ? "Sesuai sasaran" : "Longgar"}</Lencana>
                          <span className="w-12 text-right text-[14px] font-bold">{o.persen}%</span>
                        </span>
                      </div>
                      <div className="relative mt-1.5">
                        <Batang persen={(o.persen / skala) * 100} nada={o.kategori === "berlebih" ? "merah" : o.kategori === "ringan" ? "amber" : "hijau"} tinggi={10} />
                        <span className="pointer-events-none absolute inset-y-0 w-px bg-[#14212B]/50" style={{ left: `${(SASARAN_BEBAN.min / skala) * 100}%` }} aria-hidden />
                        <span className="pointer-events-none absolute inset-y-0 w-px bg-[#14212B]/70" style={{ left: `${(SASARAN_BEBAN.max / skala) * 100}%` }} aria-hidden />
                      </div>
                      <div className="mt-1 text-[12px] text-[#3B4A57]">{fmt(o.beban, 0)} poin dari {fmt(o.kapasitas, 0)} · {o.jumlahDelegasi} delegasi</div>
                    </button>
                    {buka === o.akun && (
                      <ul className="m-0 mt-2 list-none space-y-1 rounded-lg bg-[#F1F7F6] p-3 text-[13px]">
                        {milik.length === 0 && <li>Tidak ada delegasi berjalan minggu ini.</li>}
                        {milik.map((d) => (
                          <li key={d.id} className="flex justify-between gap-2">
                            <Link href={`/sigap/delego/papan?buka=${d.id}`} className="truncate text-[#0B524C] underline">{d.judul}</Link>
                            <span className="whitespace-nowrap">{NAMA_PERAN[d.peran_penerima]} · {fmt(bebanDelegasiMinggu(d, hari), 0)} poin</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="m-0 mt-2 text-[12px] text-[#3B4A57]">Garis tipis menandai {SASARAN_BEBAN.min}% dan {SASARAN_BEBAN.max}%.{pemberi ? " Pegawai organik tanpa delegasi ikut ditampilkan sebagai penampung potensial." : ""}</p>
          </Kartu>

          <Kartu judul="Saran pemerataan">
            {saran.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada saran: tidak ada yang melebihi {SASARAN_BEBAN.max}%, atau tidak ada penampung yang cukup longgar.</p>
            ) : (
              <ul className="m-0 list-none space-y-3 p-0">
                {saran.map((s) => (
                  <li key={s.delegasiId} className="space-y-1 text-[13.5px]">
                    <div>Pindahkan <b>{s.judul}</b> ({fmt(s.poinMinggu, 0)} poin/minggu)</div>
                    <div className="text-[#3B4A57]">dari {s.dariNama} ({s.sesudahDari}% sesudahnya) ke {s.keNama} ({s.sesudahKe}% sesudahnya)</div>
                    <Link href={`/sigap/delego/papan?buka=${s.delegasiId}`} className={KELAS.tombolKecil}>Buka delegasi</Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 mt-3 text-[12px] text-[#3B4A57]">Untuk memindahkan: tandai delegasi lama selesai atau batal dengan alasan, lalu buat delegasi baru untuk penampung.</p>
          </Kartu>
        </div>
      )}
    </Halaman>
  );
}
