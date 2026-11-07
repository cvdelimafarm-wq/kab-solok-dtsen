"use client";

// app/sigap/kelola/master/WilayahPeta.tsx
//
// (7 Nov 2026, tahap C1) Master > Wilayah dan Peta: satu baris per sub SLS dengan kolom status (gambar peta, batas/shapefile, daftar KK, survei tahun berjalan),
// ringkasan cakupan, penyaring, dan daftar usulan pembaruan master dari lapangan (penggantian sampel). Hanya baca; unggah shapefile dan pembaruan KK menyusul.
// Data: GET /api/portal/master/wilayah (lib/portal/masterWilayah.ts, SQL 20261107h). Logika murni: lib/masterWilayah.ts.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import {
  API_MASTER_WILAYAH, DAFTAR_SARING, LABEL_ALASAN_USUL, LABEL_STATUS_KK, SARING_AWAL, daftarKecamatan, peringatanMaster, rekapMaster, saringBaris, statusKk,
  type BarisMaster, type DataMasterWilayah, type KunciSaring, type SaringMaster,
} from "@/lib/masterWilayah";
import { BTN_O, Chip, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const tgl = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }) : "—");
const HALAMAN = 100;
const kodePendek = (k: string) => `…${k.slice(-6)}`;

export default function WilayahPeta() {
  const [data, setData] = useState<DataMasterWilayah | null>(null);
  const [galat, setGalat] = useState("");
  const [saring, setSaring] = useState<SaringMaster>(SARING_AWAL);
  const [halaman, setHalaman] = useState(0);
  const [buka, setBuka] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await apiPortal<DataMasterWilayah>(API_MASTER_WILAYAH));
      setGalat("");
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Master wilayah belum bisa dimuat.");
    }
  }, []);
  useEffect(() => { void muat(); }, [muat]);

  const kecamatan = useMemo(() => (data ? daftarKecamatan(data.baris) : []), [data]);
  const rekap = useMemo(() => (data ? rekapMaster(data.baris) : null), [data]);
  const tampil = useMemo(() => (data ? saringBaris(data.baris, saring) : []), [data, saring]);
  const jumlahHalaman = Math.max(1, Math.ceil(tampil.length / HALAMAN));
  const hal = Math.min(halaman, jumlahHalaman - 1);
  const potong = tampil.slice(hal * HALAMAN, hal * HALAMAN + HALAMAN);
  const peringatan = useMemo(() => (data && rekap ? peringatanMaster(rekap, data.batas) : []), [data, rekap]);

  const ubah = (s: Partial<SaringMaster>) => { setSaring((x) => ({ ...x, ...s })); setHalaman(0); };
  const alih = (k: KunciSaring) => ubah({ kunci: saring.kunci.includes(k) ? saring.kunci.filter((x) => x !== k) : [...saring.kunci, k] });

  return (
    <div className="flex flex-col gap-3.5">
      {!data && !galat && <Memuat />}
      {galat && <Pesan>{galat}</Pesan>}
      {data && !data.siap && <Pesan jenis="info">Tampilan status wilayah belum aktif di basis data (SQL 20261107h belum dijalankan).</Pesan>}

      {data && data.siap && rekap && (
        <>
          <Kartu judul="Ringkasan cakupan" ket={`Master wilayah se-Kab. Solok · survei tahun ${data.tahun}`}>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Chip w="navy">{fmt(rekap.sub_sls)} sub SLS</Chip>
              <Chip w={rekap.tanpa_kk > 0 ? "wait" : "ok"}>{fmt(rekap.dengan_kk)} punya KK · {fmt(rekap.total_kk)} KK</Chip>
              <Chip w="mut">{fmt(rekap.dengan_gambar)} punya gambar peta</Chip>
              {rekap.dengan_batas !== null && <Chip w={rekap.dengan_batas < rekap.sub_sls ? "wait" : "ok"}>{fmt(rekap.dengan_batas)} punya batas{data.batas.versi ? ` (versi ${data.batas.versi}${data.batas.sumber === "unggahan" ? ", unggahan" : data.batas.sumber === "bawaan" ? ", bawaan" : ""})` : ""}</Chip>}
              <Chip w="navy">{fmt(rekap.dipakai_survei)} dipakai survei</Chip>
              {rekap.multi_survei > 0 && <Chip w="wait">{fmt(rekap.multi_survei)} dipakai lebih dari 1 survei</Chip>}
            </div>
            {data.kegiatan_tahun.length > 0 && (
              <p className="m-0 mt-2 text-[12.5px] text-[#44546F]">
                Survei beralokasi: {data.kegiatan_tahun.map((k) => `${k.nama} (${fmt(k.sub_sls)} sub SLS)`).join("; ")}.
              </p>
            )}
            {peringatan.map((p) => <p key={p} className="m-0 mt-1.5 text-[12.5px] font-semibold text-[#8A5A00]">{p}</p>)}
          </Kartu>

          <Kartu judul="Wilayah dan peta" ket="Satu baris per sub SLS. Klik baris untuk melihat survei yang memakainya.">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select aria-label="Kecamatan" className="rounded-[8px] border border-[#CBD6E6] bg-white px-2.5 py-1.5 text-[13px]" value={saring.kecamatan} onChange={(e) => ubah({ kecamatan: e.target.value })}>
                <option value="">Semua kecamatan</option>
                {kecamatan.map((k) => <option key={k.kd_kec} value={k.kd_kec}>{k.nama} ({fmt(k.sub_sls)})</option>)}
              </select>
              <input
                aria-label="Cari wilayah" type="search" placeholder="Cari kecamatan, nagari, SLS, atau kode" className="min-w-[200px] flex-1 rounded-[8px] border border-[#CBD6E6] px-2.5 py-1.5 text-[13px]"
                value={saring.cari} onChange={(e) => ubah({ cari: e.target.value })}
              />
              {(saring.kecamatan || saring.cari || saring.kunci.length > 0) && <button type="button" className={BTN_O} onClick={() => { setSaring(SARING_AWAL); setHalaman(0); }}>Atur ulang</button>}
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {DAFTAR_SARING.map((s) => {
                const aktif = saring.kunci.includes(s.kunci);
                return (
                  <button
                    key={s.kunci} type="button" aria-pressed={aktif} onClick={() => alih(s.kunci)}
                    className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${aktif ? "border-[#1F5FD1] bg-[#E9F0FB] text-[#0F3D7A]" : "border-[#CBD6E6] bg-white text-[#44546F]"}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="m-0 mb-2 text-[12.5px] text-[#44546F]">{fmt(tampil.length)} dari {fmt(data.baris.length)} sub SLS</p>
            <div className="max-h-[560px] overflow-auto rounded-[10px] border border-[#D9E3F2]">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={TH}>Kecamatan</th><th className={TH}>Nagari</th><th className={TH}>SLS</th><th className={TH}>Sub SLS</th>
                    <th className={TH}>Peta</th><th className={TH}>Batas</th><th className={TH}>Daftar KK</th><th className={TH}>Survei</th>
                  </tr>
                </thead>
                <tbody>
                  {potong.map((b) => <Baris key={b.idsubsls} b={b} sekarang={data.sekarang} terbuka={buka === b.idsubsls} onKlik={() => setBuka(buka === b.idsubsls ? null : b.idsubsls)} />)}
                  {potong.length === 0 && <tr><td className={TD} colSpan={8}>Tidak ada sub SLS yang cocok dengan saringan.</td></tr>}
                </tbody>
              </table>
            </div>
            {jumlahHalaman > 1 && (
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[12.5px]">
                <button type="button" className={BTN_O} disabled={hal === 0} onClick={() => setHalaman(hal - 1)}>Sebelumnya</button>
                <span>Halaman {hal + 1} dari {jumlahHalaman}</span>
                <button type="button" className={BTN_O} disabled={hal >= jumlahHalaman - 1} onClick={() => setHalaman(hal + 1)}>Berikutnya</button>
              </div>
            )}
          </Kartu>

          <Kartu judul="Usulan pembaruan master dari lapangan" ket="Dari penggantian sampel yang ditandai (setelan Sinkron ke master = usulan). Peninjauan dan pembaruan KK master menyusul.">
            {data.usulan.length === 0 ? (
              <p className="m-0 text-[13px] text-[#44546F]">Belum ada usulan.</p>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded-[10px] border border-[#D9E3F2]">
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr><th className={TH}>Diajukan</th><th className={TH}>Kegiatan</th><th className={TH}>Wilayah</th><th className={TH}>KK</th><th className={TH}>Alasan</th><th className={TH}>Status</th></tr></thead>
                  <tbody>
                    {data.usulan.map((u) => (
                      <tr key={u.id}>
                        <td className={TD}>{tgl(u.diajukan_at)}{u.diajukan_nama ? <><br /><span className="text-[11.5px] text-[#5B6B84]">{u.diajukan_nama}</span></> : null}</td>
                        <td className={TD}>{u.kegiatan}</td>
                        <td className={TD}>{u.nagari || "—"}{u.kecamatan ? <><br /><span className="text-[11.5px] text-[#5B6B84]">{u.kecamatan} · {kodePendek(u.idsubsls)}</span></> : null}</td>
                        <td className={TD}>{u.nama_kk || "—"}</td>
                        <td className={TD}>{LABEL_ALASAN_USUL[u.alasan] ?? u.alasan}</td>
                        <td className={TD}><Chip w={u.status === "disetujui" ? "ok" : "wait"}>{u.status === "disetujui" ? "Disetujui PML" : "Menunggu PML"}</Chip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Kartu>
        </>
      )}
    </div>
  );
}

export function Baris({ b, sekarang, terbuka, onKlik }: { b: BarisMaster; sekarang: string; terbuka: boolean; onKlik: () => void }) {
  const kk = statusKk(b, sekarang);
  return (
    <Fragment>
      <tr className="cursor-pointer hover:bg-[#F5F8FE]" onClick={onKlik} aria-expanded={terbuka}>
        <td className={TD}>{b.kecamatan}</td>
        <td className={`${TD} font-semibold`}>{b.nagari}</td>
        <td className={TD}>{b.sls}</td>
        <td className={TD} title={b.idsubsls}>{b.sub_sls} <span className="text-[11.5px] text-[#5B6B84]">{kodePendek(b.idsubsls)}</span></td>
        <td className={TD}>{b.gambar_peta > 0 ? <Chip w="ok">{b.gambar_peta} gambar</Chip> : <Chip w="mut">Belum</Chip>}</td>
        <td className={TD}>{b.batas === null ? <Chip w="mut">?</Chip> : b.batas ? <Chip w="ok">Ada</Chip> : <Chip w="wait">Tidak ada</Chip>}</td>
        <td className={TD}><Chip w={kk === "belum" ? "wait" : "ok"}>{LABEL_STATUS_KK[kk]}</Chip>{b.jumlah_kk > 0 && <span className="ml-1.5 text-[12px] text-[#5B6B84]">{fmt(b.jumlah_kk)} KK · {tgl(b.kk_terbaru)}</span>}</td>
        <td className={TD}>{b.jumlah_survei > 0 ? <Chip w="navy">{b.jumlah_survei} survei</Chip> : <span className="text-[#5B6B84]">—</span>}</td>
      </tr>
      {terbuka && (
        <tr>
          <td className={`${TD} bg-[#F9FBFF]`} colSpan={8}>
            <p className="m-0 mb-1 text-[12px] text-[#5B6B84]">Kode sub SLS: <span className="font-mono">{b.idsubsls}</span></p>
            {b.daftar_survei.length === 0 ? (
              <p className="m-0 text-[13px] text-[#44546F]">Belum dipakai survei tahun ini.</p>
            ) : (
              <ul className="m-0 list-none p-0 text-[13px]">
                {b.daftar_survei.map((s) => (
                  <li key={s.kegiatan_id} className="py-0.5">
                    <b>{s.kegiatan}</b>
                    {s.nks ? ` · NKS ${s.nks}` : ""}
                    {s.target != null ? ` · target ${s.target}` : ""}
                    {` · PPL ${s.ppl ?? "belum ditetapkan"} · PML ${s.pml ?? "belum ditetapkan"}`}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
