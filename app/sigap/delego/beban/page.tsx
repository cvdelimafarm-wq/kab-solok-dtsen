"use client";

// app/sigap/delego/beban/page.tsx
//
// (26 Okt 2026) Beban kerja mingguan per orang (sasaran 80-100%) dan saran pemerataan. Hanya saran: pemberi yang memutuskan dan memindahkan tugas
// dengan mengubah/menambah delegasi. Kapasitas 70 poin per hari kerja (berlaku 26 Okt 2026), 5 hari per minggu (cek aturan).
// (26 Okt 2026) Tabel beban per hari (Senin-Jumat; Sabtu/Minggu bila ada) dan tombol "Terapkan usulan": memindahkan delegasi lewat keu_dlg_pindah
// (delegasi lama ditutup selesai dengan tenggat kemarin, delegasi baru untuk penampung mulai hari ini). Tanpa dialog konfirmasi (keputusan pengguna).

import Link from "next/link";
import { useMemo, useState } from "react";
import { bebanDelegasiMinggu, bebanPerOrang, HARI_KERJA_MINGGU, KAPASITAS_HARIAN, matriksBebanHarian, SASARAN_BEBAN, tglPendek, usulPemerataan, type UsulanPemerataan } from "@/lib/delego/hitung";
import { NAMA_PERAN } from "@/lib/delego/tipe";
import { gradienLegenda, warnaBeban } from "@/lib/delego/warna";
import { useBahan, useCalon, useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { PilihRo, saringRo, useFilterRo } from "../tim";
import { Batang, Galat, Halaman, Info, Kartu, Kosong, Lencana, Memuat, fmt } from "../ui";

/** Persentase beban yang dipetakan ke warna paling jenuh pada skala. */
const PUNCAK_SKALA = 150;

export default function Beban() {
  const { hari, hak, pemberi, bolehBeri } = useKonteksDelego();
  const f = useFilterRo();
  const b = useBahan();
  const roCalon = pemberi ? (f.ro && hak.beri_ro.includes(f.ro) ? f.ro : hak.beri_ro[0] ?? null) : null;
  const calon = useCalon(roCalon, null, "");
  const [buka, setBuka] = useState<number | null>(null);

  const delegasi = saringRo(b.data, f.ro);
  const orang = useMemo(() => bebanPerOrang(delegasi, hari, calon.data?.organik ?? []), [delegasi, hari, calon.data]);
  const saran = useMemo(() => usulPemerataan(orang, delegasi, hari), [orang, delegasi, hari]);
  const skala = Math.max(150, ...orang.map((o) => o.persen));
  const tabel = useMemo(() => matriksBebanHarian(orang, delegasi, hari), [orang, delegasi, hari]);
  const kolom = tabel.adaAkhirPekan ? 7 : 5;
  const kirim = useKirim(b.muat);
  const [selesai, setSelesai] = useState<string | null>(null);

  async function terapkan(s: UsulanPemerataan) {
    setSelesai(null);
    const ok = await kirim.kirim("keu_dlg_pindah", { p_id: s.delegasiId, p_ke: s.keAkun, p_ver: s.ver });
    if (ok) setSelesai(`"${s.judul}" dipindahkan dari ${s.dariNama} ke ${s.keNama} mulai hari ini. Delegasi lama ditutup selesai (tenggat kemarin, laporannya tetap tersimpan); keduanya sudah diberi tahu. Bila keliru, ubah atau tambah delegasi lewat Papan.`);
  }

  return (
    <Halaman judul="Beban kerja" sub={`Minggu ini · kapasitas ${KAPASITAS_HARIAN} poin × ${HARI_KERJA_MINGGU} hari kerja = ${KAPASITAS_HARIAN * HARI_KERJA_MINGGU} poin per orang`} kanan={<PilihRo {...f} />}>
      <Info>Sasaran beban {SASARAN_BEBAN.min}–{SASARAN_BEBAN.max}% per orang per minggu. Angka ini bahan pertimbangan; keputusan memindahkan tugas ada pada pemberi delegasi.</Info>
      {b.memuat && !b.data && <Memuat />}
      {b.galat && !b.data && <Galat>{b.galat}</Galat>}
      {b.data && orang.length === 0 && <Kosong>Belum ada delegasi yang berjalan.</Kosong>}
      {selesai && <Info>{selesai}</Info>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {b.data && orang.length > 0 && (
        <Kartu judul="Beban per hari" kanan={<span className="text-[12px] text-[#3B4A57]">% dari {KAPASITAS_HARIAN} poin/hari</span>}>
          <div className="overflow-x-auto" role="table" aria-label="Beban per orang per hari minggu ini">
            <div className="grid min-w-[250px] items-center gap-[3px] text-center text-[12px]" style={{ gridTemplateColumns: `minmax(72px,1fr) repeat(${kolom}, minmax(30px,46px))` }} role="row">
              <div className="text-left text-[12px] font-semibold text-[#3B4A57]" role="columnheader">Nama</div>
              {tabel.tanggal.slice(0, kolom).map((t) => (
                <div key={t} role="columnheader" className={`rounded-md py-0.5 leading-tight ${t === hari ? "bg-[#0F6B63] font-bold text-white" : "font-semibold text-[#3B4A57]"}`} title={tglPendek(t)}>
                  {tglPendek(t).split(" ")[0]}
                  <span className="block text-[11px] font-normal">{Number(t.slice(8, 10))}</span>
                </div>
              ))}
              {tabel.baris.map((o) => (
                <div key={o.akun} className="contents" role="row">
                  <div className="truncate pr-1 text-left text-[13px] font-semibold text-[#14212B]" role="rowheader" title={o.nama}>{o.nama}</div>
                  {o.sel.slice(0, kolom).map((c) => {
                    const w = c.kategori === "kosong" ? null : warnaBeban(c.persen, SASARAN_BEBAN.min, SASARAN_BEBAN.max, PUNCAK_SKALA);
                    return (
                      <div
                        key={c.tanggal}
                        role="cell"
                        title={`${tglPendek(c.tanggal)}: ${fmt(c.poin, 0)} poin (${c.persen}%)`}
                        className={`rounded-md py-1.5 text-[12.5px] ${w ? "font-bold" : "bg-[#F3F5F7] font-normal text-[#7A8793]"} ${c.tanggal === hari ? "ring-2 ring-[#0F6B63]" : ""}`}
                        style={w ? { backgroundColor: w.latar, color: w.teks } : undefined}
                      >
                        {w ? c.persen : "·"}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3" aria-label="Skala warna beban">
            <div className="h-3 w-full rounded-full border border-[#D5DCE2]" style={{ backgroundImage: gradienLegenda(SASARAN_BEBAN.min, SASARAN_BEBAN.max, PUNCAK_SKALA) }} />
            <div className="relative mt-1 h-4 text-[11.5px] text-[#3B4A57]">
              <span className="absolute left-0">0%</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${(SASARAN_BEBAN.min / PUNCAK_SKALA) * 100}%` }}>{SASARAN_BEBAN.min}%</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${(SASARAN_BEBAN.max / PUNCAK_SKALA) * 100}%` }}>{SASARAN_BEBAN.max}%</span>
              <span className="absolute right-0">{PUNCAK_SKALA}%+</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-[#3B4A57]">
              <span><b className="text-[#1D3F6B]">Biru</b>: longgar (&lt;{SASARAN_BEBAN.min}%)</span>
              <span><b className="text-[#0B524C]">Hijau</b>: sesuai sasaran ({SASARAN_BEBAN.min}–{SASARAN_BEBAN.max}%)</span>
              <span><b className="text-[#9B2C2C]">Kuning ke merah</b>: berlebih (&gt;{SASARAN_BEBAN.max}%)</span>
              <span>· tidak ada beban</span>
            </div>
          </div>
        </Kartu>
      )}
      {b.data && orang.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
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
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {bolehBeri(s.roKode) ? (
                        <button type="button" onClick={() => void terapkan(s)} disabled={kirim.mengirim} className={KELAS.tombolKecilUtama}>
                          {kirim.mengirim ? "Menerapkan..." : "Terapkan usulan"}
                        </button>
                      ) : (
                        <span className="text-[12px] text-[#3B4A57]">Hanya pemberi delegasi RO ini yang dapat menerapkan.</span>
                      )}
                      <Link href={`/sigap/delego/papan?buka=${s.delegasiId}`} className={KELAS.tombolKecil}>Buka delegasi</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 mt-3 text-[12px] text-[#3B4A57]">Terapkan usulan: delegasi lama ditutup selesai (tenggat kemarin, laporan tetap tersimpan) dan delegasi baru untuk penampung mulai hari ini; keduanya diberi tahu. Tanpa dialog konfirmasi, jadi periksa nama dan angka sebelum mengetuk.</p>
          </Kartu>
        </div>
      )}
    </Halaman>
  );
}
