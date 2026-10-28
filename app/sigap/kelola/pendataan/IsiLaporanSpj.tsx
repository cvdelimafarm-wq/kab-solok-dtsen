"use client";

// app/sigap/kelola/pendataan/IsiLaporanSpj.tsx
//
// (28 Okt 2026) Kelola Pendataan > Persiapan > "Isi laporan SPJ": data apa yang dilampirkan pada Laporan Perjalanan Dinas di tiap level (PPL, PML, korwil) --
// data identifikasi, data pendataan, data QC, jarak rumah, lokasi, kendala -- serta judul/uraian laporan dan nama variabel identifikasi. Per kegiatan, supaya survei
// lain bisa memakai isi laporan berbeda. Blok hanya tampil di PDF bila ADA datanya pada tanggal laporan itu.
// Data: /api/portal/pendataan/laporan-isi (izin bencana.admin: lihat / kelola). Aturan: lib/sigapLaporanIsi.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN, BTN_O, BTN_R, BTN_T, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { teksLaporan } from "@/lib/sigapLaporanPeran";
import {
  BATAS_LAPORAN, KATALOG, KELOMPOK_URUT, KET_PENANDA, KONFIG_LAPORAN_BAWAAN, LABEL_PERAN_LAPORAN, PENANDA, PERAN_LAPORAN, galatLaporan, lampiranUntuk, rapikanLaporan, salinLaporanBawaan,
  type KodeLampiran, type KonfigLaporan, type KonfigPeranLaporan, type PeranLaporan, type VariabelIdentifikasi,
} from "@/lib/sigapLaporanIsi";

const API = "/api/portal/pendataan/laporan-isi";

type Keg = { id: number; nama: string; tersimpan: boolean; diubah_oleh: string | null; diubah_at: string | null };
type Data = { boleh_kelola: boolean; tabel_ada: boolean; kegiatan: Keg[]; konfig: Record<string, KonfigLaporan> };

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const LABEL = "block text-[11.5px] font-bold text-[#52627A]";
function tgl(iso: string): string {
  const w = new Date(Date.parse(iso) + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(w.getUTCDate())}/${p(w.getUTCMonth() + 1)}/${w.getUTCFullYear()} ${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}

const SATUAN_CONTOH: Record<PeranLaporan, string> = { ppl: "KK", pml: "KK", korwil: "lembar QC" };

export default function IsiLaporanSpj() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [kid, setKid] = useState<number>(1);
  const [peran, setPeran] = useState<PeranLaporan>("ppl");
  const [draf, setDraf] = useState<KonfigLaporan>(salinLaporanBawaan());
  const [asal, setAsal] = useState<string>(JSON.stringify(KONFIG_LAPORAN_BAWAAN));
  const [sibuk, setSibuk] = useState(false);
  const [konfirmasiBawaan, setKonfirmasiBawaan] = useState(false);

  const muat = useCallback(async () => {
    try {
      setD(await apiPortal<Data>(API));
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    if (!d) return;
    const k = d.konfig[String(kid)] ?? KONFIG_LAPORAN_BAWAAN;
    setDraf(salin(k));
    setAsal(JSON.stringify(k));
    setKonfirmasiBawaan(false);
  }, [d, kid]);

  const kegiatan = d?.kegiatan.find((k) => k.id === kid) ?? null;
  const galatDraf = useMemo(() => galatLaporan(draf), [draf]);
  const berubah = JSON.stringify(draf) !== asal;
  const bolehKelola = !!d?.boleh_kelola;
  const bolehSimpan = bolehKelola && !!d?.tabel_ada;
  const kp = draf.peran[peran];

  const ubahPeran = (p: Partial<KonfigPeranLaporan>) => setDraf((x) => ({ ...x, peran: { ...x.peran, [peran]: { ...x.peran[peran], ...p } } }));
  const ubahLampiran = (k: KodeLampiran, v: boolean) => ubahPeran({ lampiran: { ...kp.lampiran, [k]: v } });
  const ubahVariabel = (kolom: string, p: Partial<VariabelIdentifikasi>) => setDraf((x) => ({ ...x, identifikasi: x.identifikasi.map((v) => (v.kolom === kolom ? { ...v, ...p } : v)) }));

  async function simpan(konfig: KonfigLaporan | null) {
    setSibuk(true);
    setInfo(null);
    setGalat(null);
    try {
      await apiPortal(API, { method: "POST", body: JSON.stringify({ kegiatan_id: kid, konfig: konfig ? rapikanLaporan(konfig) : null }) });
      setInfo(konfig ? "Pengaturan tersimpan. Berlaku pada PDF Laporan SPJ yang dibuat berikutnya (berkas SPJ yang sudah dikunci tidak berubah)." : "Dikembalikan ke isi laporan bawaan.");
      await muat();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
      setKonfirmasiBawaan(false);
    }
  }

  // contoh teks (hanya tampilan): jenis templat = level; kegiatan Pascabencana
  const contoh = useMemo(
    () =>
      teksLaporan({
        jenis: peran,
        kegiatanNama: kegiatan?.nama ?? "Kegiatan",
        namaPetugas: "Budi Santoso",
        labelJabatan: `${LABEL_PERAN_LAPORAN[peran]} ${kegiatan?.nama ?? ""}`.trim(),
        tanggalTeks: "Selasa, 13 Oktober 2026",
        satuan: SATUAN_CONTOH[peran],
        jumlahRealisasi: 25,
        jumlahLokasi: 2,
        wilayah: "Nagari Contoh, Kecamatan Contoh",
        aktivitas: { identifikasi: false, pengawasan: peran === "pml", qc: peran === "korwil" },
        ganti: { judul: kp.judul, uraian: kp.uraian },
      }),
    [peran, kegiatan?.nama, kp.judul, kp.uraian]
  );

  if (!d && !galat) return <Memuat />;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}

      {d && (
        <Kartu
          judul="Isi laporan SPJ"
          ket="Data yang dilampirkan pada Laporan Perjalanan Dinas di tiap level, serta judul dan uraiannya. Diatur per kegiatan."
          kanan={kegiatan ? kegiatan.tersimpan ? <Chip w="ok">Diatur khusus</Chip> : <Chip w="mut">Isi bawaan</Chip> : undefined}
        >
          {!d.tabel_ada && (
            <Pesan jenis="peringatan">
              Tabel pengaturan belum dibuat, jadi perubahan belum bisa disimpan. Jalankan dulu SQL <b>20261028c_laporan_isi.sql</b> di basis data. Tampilan di bawah memakai isi bawaan.
            </Pesan>
          )}
          {!bolehKelola && <Pesan jenis="info">Anda dapat melihat saja. Mengubah pengaturan memerlukan izin kelola pendataan.</Pesan>}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[220px]">
              <span className={LABEL}>Kegiatan</span>
              <select value={kid} onChange={(e) => setKid(Number(e.target.value))} className={`${INPUT} mt-0.5 w-full`}>
                {d.kegiatan.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                    {k.tersimpan ? " · diatur khusus" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div role="tablist" aria-label="Level laporan" className="flex gap-1 rounded-lg bg-[#F5F8FE] p-1">
              {PERAN_LAPORAN.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={peran === p}
                  onClick={() => setPeran(p)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-extrabold ${peran === p ? "bg-[#0F2A52] text-white" : "text-[#52627A] hover:bg-white"}`}
                >
                  {LABEL_PERAN_LAPORAN[p]}
                </button>
              ))}
            </div>
          </div>
          {kegiatan?.diubah_at && (
            <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">
              Terakhir diubah {tgl(kegiatan.diubah_at)}
              {kegiatan.diubah_oleh ? ` oleh ${kegiatan.diubah_oleh}` : ""}.
            </p>
          )}
          <p className="mt-2 rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12px] leading-snug text-[#52627A]">
            Blok data hanya muncul pada tanggal yang <b>ada datanya</b>. Contoh PML: pada hari identifikasi laporan memuat hasil identifikasi; pada hari PPL mendata laporan memuat hasil pendataan tim. Semua angka diambil
            dari catatan lapangan yang sudah ada, tanpa angka baru.
          </p>
        </Kartu>
      )}

      {d && (
        <>
          <Kartu judul={`Data yang dilampirkan · ${LABEL_PERAN_LAPORAN[peran]}`} ket="Centang data yang ingin ditampilkan di laporan harian level ini.">
            <fieldset disabled={!bolehKelola} className="space-y-3">
              {KELOMPOK_URUT.map((kel) => {
                const isi = lampiranUntuk(peran).filter((k) => KATALOG[k].kelompok === kel);
                if (isi.length === 0) return null;
                return (
                  <div key={kel} className="rounded-lg border border-[#DDE6F3] bg-white p-3">
                    <p className="mb-1.5 text-[12.5px] font-extrabold text-[#0F2A52]">{kel}</p>
                    <div className="space-y-2">
                      {isi.map((k) => (
                        <label key={k} className="flex items-start gap-2">
                          <input type="checkbox" checked={kp.lampiran[k]} onChange={(e) => ubahLampiran(k, e.target.checked)} className="mt-0.5 h-4 w-4" />
                          <span>
                            <span className="text-[13px] font-bold text-[#0F2A52]">{KATALOG[k].label}</span>
                            <span className="block text-[11.5px] leading-snug text-[#6B7A90]">{KATALOG[k].ket}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </fieldset>
          </Kartu>

          {peran === "pml" && kp.lampiran.identifikasi && (
            <Kartu judul="Variabel identifikasi" ket="Nama dan pilihan variabel yang dijumlahkan pada blok hasil identifikasi (diisi PML di Lembar Identifikasi).">
              <fieldset disabled={!bolehKelola} className="grid gap-2 sm:grid-cols-2">
                {draf.identifikasi.map((v) => (
                  <label key={v.kolom} className="flex items-center gap-2 rounded-lg border border-[#DDE6F3] bg-white px-2.5 py-1.5">
                    <input type="checkbox" checked={v.aktif} onChange={(e) => ubahVariabel(v.kolom, { aktif: e.target.checked })} className="h-4 w-4" aria-label={`Tampilkan ${v.label}`} />
                    <input type="text" value={v.label} maxLength={BATAS_LAPORAN.labelVariabel + 20} onChange={(e) => ubahVariabel(v.kolom, { label: e.target.value })} className={`${INPUT} w-full`} aria-label={`Nama untuk ${v.kolom}`} />
                  </label>
                ))}
              </fieldset>
            </Kartu>
          )}

          <Kartu judul={`Judul dan uraian · ${LABEL_PERAN_LAPORAN[peran]}`} ket="Kosongkan untuk memakai teks bawaan. Teks bawaan menyesuaikan kegiatan hari itu menurut data.">
            <fieldset disabled={!bolehKelola} className="space-y-3">
              <label className="block">
                <span className={LABEL}>Judul laporan (maksimal {BATAS_LAPORAN.judul} karakter)</span>
                <input type="text" value={kp.judul} maxLength={BATAS_LAPORAN.judul + 20} onChange={(e) => ubahPeran({ judul: e.target.value })} placeholder="Bawaan" className={`${INPUT} mt-0.5 w-full`} />
              </label>
              <label className="block">
                <span className={LABEL}>Uraian (satu paragraf per baris, maksimal {BATAS_LAPORAN.uraian} karakter)</span>
                <textarea value={kp.uraian} rows={4} maxLength={BATAS_LAPORAN.uraian + 50} onChange={(e) => ubahPeran({ uraian: e.target.value })} placeholder="Bawaan" className={`${INPUT} mt-0.5 w-full`} />
              </label>
              <p className="text-[11.5px] leading-snug text-[#6B7A90]">
                Penanda yang bisa dipakai:{" "}
                {PENANDA.map((p) => (
                  <span key={p} title={KET_PENANDA[p]} className="mr-1 inline-block rounded bg-[#EEF3FB] px-1.5 py-[1px] font-mono text-[11px] text-[#0F2A52]">{`{${p}}`}</span>
                ))}
              </p>
              <div className="rounded-lg bg-[#F5F8FE] px-3 py-2">
                <p className="text-[11.5px] font-bold text-[#52627A]">Contoh teks laporan (data contoh)</p>
                <p className="mt-1 text-[13px] font-extrabold text-[#0F2A52]">{contoh.judul}</p>
                {contoh.paragraf.map((p, i) => (
                  <p key={i} className="mt-1 text-[12.5px] leading-snug text-[#33415C]">
                    {p}
                  </p>
                ))}
              </div>
            </fieldset>
          </Kartu>

          {galatDraf.length > 0 && (
            <Pesan jenis="peringatan">
              <p className="font-bold">Belum bisa disimpan:</p>
              <ul className="mt-1 list-disc pl-4">
                {galatDraf.slice(0, 8).map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </Pesan>
          )}

          {bolehKelola && (
            <div className="sticky bottom-2 z-[2] flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] bg-white/95 px-3 py-2 shadow-[0_6px_18px_rgba(15,42,82,.12)]">
              <button type="button" className={BTN} disabled={sibuk || !berubah || galatDraf.length > 0 || !bolehSimpan} onClick={() => void simpan(draf)}>
                {sibuk ? "Menyimpan…" : "Simpan isi laporan"}
              </button>
              <button type="button" className={BTN_T} disabled={sibuk || !berubah} onClick={() => setDraf(salin(d.konfig[String(kid)] ?? KONFIG_LAPORAN_BAWAAN))}>
                Batalkan perubahan
              </button>
              <button type="button" className={BTN_O} disabled={sibuk} onClick={() => setDraf(salinLaporanBawaan())} title="Mengisi isian dengan isi bawaan; belum disimpan sampai Anda menekan Simpan">
                Isi dengan bawaan
              </button>
              {kegiatan?.tersimpan &&
                (konfirmasiBawaan ? (
                  <>
                    <button type="button" className={BTN_R} disabled={sibuk} onClick={() => void simpan(null)}>
                      Ya, kembalikan ke bawaan
                    </button>
                    <button type="button" className={BTN_T} onClick={() => setKonfirmasiBawaan(false)}>
                      Tidak
                    </button>
                  </>
                ) : (
                  <button type="button" className={BTN_T} disabled={sibuk} onClick={() => setKonfirmasiBawaan(true)}>
                    Kembalikan ke bawaan
                  </button>
                ))}
              {berubah && <span className="text-[11.5px] font-bold text-[#8A6200]">Ada perubahan yang belum disimpan.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
