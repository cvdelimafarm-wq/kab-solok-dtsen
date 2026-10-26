"use client";

// app/sigap/delego/papan/page.tsx
//
// (26 Okt 2026) Papan delegasi: kolom per status; kartu menampilkan penerima, progres, tenggat, status lapor hari ini, dan hutang. Klik kartu membuka rincian.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { bulat, ringkasHariIni, statusLaporanHariIni, tglPendek } from "@/lib/delego/hitung";
import { NAMA_PERAN, NAMA_STATUS, type Delegasi, type StatusDelegasi } from "@/lib/delego/tipe";
import { useBahan } from "../data";
import Detail from "../Detail";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { PilihRo, saringRo, useFilterRo } from "../tim";
import { Batang, Galat, Halaman, Kosong, Lencana, Memuat, NADA_STATUS, fmt } from "../ui";

const KOLOM: StatusDelegasi[] = ["baru", "berjalan", "ditunda", "selesai"];

export default function Papan() {
  const { hari, jam, pemberi, bolehBeri } = useKonteksDelego();
  const q = useSearchParams();
  const f = useFilterRo();
  const b = useBahan();
  const [cari, setCari] = useState("");
  const [peran, setPeran] = useState("");
  const [tampilBatal, setTampilBatal] = useState(false);
  const [buka, setBuka] = useState<number | null>(null);

  useEffect(() => {
    const id = Number(q?.get("buka") ?? "");
    if (Number.isInteger(id) && id > 0) setBuka(id);
  }, [q]);

  const semua = saringRo(b.data, f.ro);
  const daftar = useMemo(
    () => semua.filter((d) => (!peran || d.peran_penerima === peran) && (!cari.trim() || `${d.judul} ${d.penerima_nama}`.toLowerCase().includes(cari.trim().toLowerCase()))),
    [semua, peran, cari],
  );
  const terbuka = buka !== null && b.data ? b.data.delegasi.find((d) => d.id === buka) ?? null : null;

  const kartu = (d: Delegasi) => {
    const r = ringkasHariIni(d, b.data?.laporan ?? [], hari);
    const st = statusLaporanHariIni(d, b.data?.laporan ?? [], hari, jam);
    return (
      <button key={d.id} type="button" onClick={() => setBuka(d.id)} className="w-full rounded-xl border border-[#D5DCE2] bg-white p-3 text-left transition-colors hover:border-[#0F6B63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6B63]">
        <div className="text-[14px] font-semibold leading-snug">{d.judul}</div>
        <div className="mt-1 text-[12.5px] text-[#3B4A57]">{d.penerima_nama} · {NAMA_PERAN[d.peran_penerima]}</div>
        <div className="mt-2"><Batang persen={r.persenSelesai} tinggi={6} /></div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#3B4A57]">
          <span>{r.persenSelesai}%</span>
          <span>· tenggat {tglPendek(d.tenggat)}</span>
          {st === "sudah" && <Lencana nada="hijau">Sudah lapor</Lencana>}
          {st === "belum" && <Lencana nada="abu">Belum lapor</Lencana>}
          {st === "perlu_pengingat" && <Lencana nada="amber">Belum lapor</Lencana>}
          {r.hutangKemarin > 0 && <Lencana nada="amber">Hutang {fmt(bulat(r.hutangKemarin), 0)}</Lencana>}
        </div>
      </button>
    );
  };

  return (
    <Halaman
      judul="Papan delegasi"
      sub={b.data ? `${daftar.length} delegasi` : undefined}
      kanan={
        <>
          <PilihRo {...f} />
          {pemberi && <Link href="/sigap/delego/buat" className={KELAS.tombolUtama}>Buat delegasi</Link>}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <input className={`${KELAS.isian} !w-auto min-w-[220px] flex-1`} placeholder="Cari tugas atau nama" aria-label="Cari" value={cari} onChange={(e) => setCari(e.target.value)} />
        <select className={`${KELAS.isian} !w-auto`} value={peran} onChange={(e) => setPeran(e.target.value)} aria-label="Saring peran">
          <option value="">Semua peran</option>
          {(Object.keys(NAMA_PERAN) as (keyof typeof NAMA_PERAN)[]).map((p) => (<option key={p} value={p}>{NAMA_PERAN[p]}</option>))}
        </select>
        <label className="inline-flex min-h-[44px] items-center gap-2 text-[13.5px]"><input type="checkbox" checked={tampilBatal} onChange={(e) => setTampilBatal(e.target.checked)} /> Tampilkan yang batal</label>
      </div>
      {b.memuat && !b.data && <Memuat />}
      {b.galat && !b.data && <Galat>{b.galat}</Galat>}
      {b.data && daftar.length === 0 && <Kosong>Tidak ada delegasi yang cocok.</Kosong>}
      {b.data && daftar.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {KOLOM.map((s) => {
            const isi = daftar.filter((d) => d.status === s);
            return (
              <section key={s} className="space-y-2" aria-label={NAMA_STATUS[s]}>
                <div className="flex items-center justify-between px-1">
                  <Lencana nada={NADA_STATUS[s]}>{NAMA_STATUS[s]}</Lencana>
                  <span className="text-[12.5px] font-semibold text-[#3B4A57]">{isi.length}</span>
                </div>
                {isi.length === 0 ? <div className="rounded-xl border border-dashed border-[#BCC6CE] px-3 py-5 text-center text-[12.5px] text-[#6B7783]">Kosong</div> : isi.map(kartu)}
              </section>
            );
          })}
          {tampilBatal && (
            <section className="space-y-2 md:col-span-2 xl:col-span-4" aria-label="Batal">
              <Lencana nada="merah">Batal</Lencana>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{daftar.filter((d) => d.status === "batal").map(kartu)}</div>
            </section>
          )}
        </div>
      )}
      {terbuka && b.data && <Detail d={terbuka} b={b.data} hari={hari} bolehUbah={bolehBeri(terbuka.ro_kode)} tutup={() => setBuka(null)} muat={b.muat} />}
    </Halaman>
  );
}
