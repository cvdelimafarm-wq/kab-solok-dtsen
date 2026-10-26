"use client";

// app/sigap/delego/laporan/page.tsx
//
// (26 Okt 2026) Laporan tim per tanggal: siapa sudah lapor (tepat, terlambat, diwakili), siapa belum, kendala, dan tanggapan langsung.
// Data laporan tersedia 35 hari ke belakang. Menanggapi memakai keu_dlg_tanggapi (penerima mendapat notifikasi).

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { angka, hariKerjaTanggal, jamWib, JAM_PENGINGAT, namaLibur, tambahHari, tglPendek } from "@/lib/delego/hitung";
import { NAMA_PERAN, type Delegasi, type Laporan } from "@/lib/delego/tipe";
import { useBahan, useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { DaftarBukti } from "../BuktiFoto";
import { KELAS } from "../merek";
import { PilihRo, saringRo, useFilterRo } from "../tim";
import { Galat, Halaman, Kartu, Kosong, Lencana, Memuat, Statistik, fmt } from "../ui";
import type { Nada } from "../merek";

type Baris = { d: Delegasi; l: Laporan | null; status: string; nada: Nada };

export default function LaporanTim() {
  const { hari, jam, bolehBeri } = useKonteksDelego();
  const q = useSearchParams();
  const f = useFilterRo();
  const b = useBahan();
  const kirim = useKirim(b.muat);
  const [tanggal, setTanggal] = useState(hari);
  const [buka, setBuka] = useState<number | null>(null);
  const [isi, setIsi] = useState("");
  const awal = tambahHari(hari, -34);

  useEffect(() => {
    const t = q?.get("tanggal");
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && t >= awal && t <= hari) setTanggal(t);
    const id = Number(q?.get("buka") ?? "");
    if (Number.isInteger(id) && id > 0) setBuka(id);
  }, [q, awal, hari]);

  const baris = useMemo<Baris[]>(() => {
    if (!b.data) return [];
    const hasil: Baris[] = [];
    for (const d of saringRo(b.data, f.ro)) {
      const l = b.data.laporan.find((x) => x.delegasi_id === d.id && x.tanggal === tanggal) ?? null;
      const dalamMasa = tanggal >= d.mulai && tanggal <= d.tenggat;
      if (!l && (!dalamMasa || (d.status !== "baru" && d.status !== "berjalan"))) continue;
      if (l) hasil.push({ d, l, status: l.terlambat ? "Terlambat" : "Tepat waktu", nada: l.terlambat ? "amber" : "hijau" });
      else if (!hariKerjaTanggal(tanggal, d.hari_kerja)) hasil.push({ d, l, status: namaLibur(tanggal) ? "Libur (" + namaLibur(tanggal) + ")" : "Libur", nada: "abu" });
      else if (tanggal < hari) hasil.push({ d, l, status: "Tidak lapor", nada: "merah" });
      else hasil.push({ d, l, status: jam >= JAM_PENGINGAT ? "Belum (lewat pengingat)" : "Belum", nada: jam >= JAM_PENGINGAT ? "amber" : "abu" });
    }
    const urut = (x: Baris) => (x.status.startsWith("Tidak") ? 0 : x.status.startsWith("Belum") ? 1 : x.status === "Terlambat" ? 2 : x.status.startsWith("Libur") ? 4 : 3);
    return hasil.sort((a, c) => urut(a) - urut(c) || a.d.penerima_nama.localeCompare(c.d.penerima_nama));
  }, [b.data, f.ro, tanggal, hari, jam]);

  const hitung = (pre: string) => baris.filter((x) => x.status.startsWith(pre)).length;
  const tanggapi = async (x: Baris) => {
    if (!isi.trim()) return;
    const ok = await kirim.kirim("keu_dlg_tanggapi", { p_delegasi: x.d.id, p_isi: isi.trim(), ...(x.l ? { p_laporan: x.l.id } : {}) });
    if (ok) {
      setIsi("");
      setBuka(null);
    }
  };

  return (
    <Halaman judul="Laporan tim" sub={`${tglPendek(tanggal)}${tanggal === hari ? " (hari ini)" : ""}`} kanan={<PilihRo {...f} />}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={KELAS.tombolSekunder} disabled={tanggal <= awal} onClick={() => setTanggal(tambahHari(tanggal, -1))}>← Sebelumnya</button>
        <input type="date" aria-label="Tanggal" className={`${KELAS.isian} !w-auto`} value={tanggal} min={awal} max={hari} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
        <button type="button" className={KELAS.tombolSekunder} disabled={tanggal >= hari} onClick={() => setTanggal(tambahHari(tanggal, 1))}>Berikutnya →</button>
        {tanggal !== hari && <button type="button" className={KELAS.tombolKecil} onClick={() => setTanggal(hari)}>Hari ini</button>}
      </div>
      {b.memuat && !b.data && <Memuat />}
      {b.galat && !b.data && <Galat>{b.galat}</Galat>}
      {b.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Statistik label="Tepat waktu" nilai={hitung("Tepat")} />
            <Statistik label="Terlambat" nilai={hitung("Terlambat")} nada={hitung("Terlambat") > 0 ? "amber" : "biasa"} />
            <Statistik label="Belum atau tidak lapor" nilai={hitung("Belum") + hitung("Tidak")} nada={hitung("Tidak") > 0 ? "merah" : hitung("Belum") > 0 ? "amber" : "biasa"} />
            <Statistik label="Dilaporkan mewakili" nilai={baris.filter((x) => x.l?.mewakili).length} />
          </div>
          {baris.length === 0 ? (
            <Kosong>Tidak ada delegasi yang berlaku pada {tglPendek(tanggal)}.</Kosong>
          ) : (
            <div className="space-y-2">
              {baris.map((x) => (
                <Kartu key={x.d.id} className="!p-3">
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_110px_170px_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-semibold">{x.d.penerima_nama}</div>
                      <div className="text-[12.5px] text-[#3B4A57]">{NAMA_PERAN[x.d.peran_penerima]}{x.d.penerima_jenis === "mitra" ? " · mitra" : ""}</div>
                    </div>
                    <div className="min-w-0 text-[13.5px]">
                      <div className="truncate">{x.d.judul}</div>
                      {x.l?.kendala && <div className="text-[12.5px] text-[#8A4605]">Kendala: {x.l.kendala}</div>}
                      {x.l?.uraian && <div className="truncate text-[12.5px] text-[#3B4A57]">{x.l.uraian}</div>}
                      {x.l && <DaftarBukti bukti={x.l.bukti} ukuran={48} />}
                    </div>
                    <div className="text-[13px]">
                      <span className="font-bold">{x.l ? fmt(angka(x.l.poin), 1) : "–"}</span>
                      <span className="text-[#3B4A57]"> / {fmt(angka(x.d.target_harian), 0)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Lencana nada={x.nada}>{x.status}</Lencana>
                      {x.l?.mewakili && <Lencana nada="biru">Diwakili</Lencana>}
                    </div>
                    {bolehBeri(x.d.ro_kode) ? (
                      <button type="button" className={KELAS.tombolKecil} onClick={() => setBuka(buka === x.d.id ? null : x.d.id)} aria-expanded={buka === x.d.id}>Tanggapi</button>
                    ) : <span />}
                  </div>
                  {buka === x.d.id && (
                    <div className="mt-3 space-y-2 border-t border-[#E3E8EE] pt-3">
                      <textarea className={KELAS.isian} rows={2} maxLength={500} value={isi} onChange={(e) => setIsi(e.target.value)} placeholder={`Tanggapan untuk ${x.d.penerima_nama}`} aria-label="Tanggapan" />
                      {kirim.galat && <Galat>{kirim.galat}</Galat>}
                      <div className="flex gap-2">
                        <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || !isi.trim()} onClick={() => void tanggapi(x)}>Kirim</button>
                        <button type="button" className={KELAS.tombolSekunder} onClick={() => setBuka(null)}>Batal</button>
                      </div>
                    </div>
                  )}
                </Kartu>
              ))}
            </div>
          )}
          <p className="m-0 text-[12.5px] text-[#3B4A57]">Batas lapor 23:59 WIB; pengingat sistem pukul {JAM_PENGINGAT}:00. Jam saat ini {fmt(Math.floor(jam || jamWib(new Date())))}:00 WIB.</p>
        </>
      )}
    </Halaman>
  );
}
