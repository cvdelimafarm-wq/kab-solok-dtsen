"use client";

// app/sigap/kelola/pendataan/Laporan.tsx
//
// (30 Okt 2026) Tab "8 · Laporan" Kelola Pendataan: Laporan Sementara PSP Pascabencana yang angkanya diambil langsung dari database SIGAP.
// Panel "Susunan dan isi laporan": centang bab, centang tiap isi bab (uraian, tabel, grafik), pilih kolom/urutan lampiran nilai per petugas,
// tulis catatan penyusun per bab, judul dan penyusun. Pilihan disimpan di peramban ini (localStorage, per perangkat). Pratinjau di layar mengikuti
// pilihan; tombol Unduh Word membuat .docx asli dengan daftar isi dan nomor halaman otomatis, Cetak / PDF memakai jendela cetak peramban.
// Seluruh isi disusun oleh lib/laporanSementara.ts (layar, cetak) dan lib/laporanDocx.ts (Word). Hanya-baca terhadap data.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import {
  API_LAPORAN, OPSI_AWAL, babTampil, bacaDataLaporan, bacaOpsi, elemenTampil, fmtAngka, htmlLaporan, kelompokkanElemen, namaBerkasLaporan, paragrafDariTeks, panjangBatang, susunLaporan, tanggalWib,
  type BatangLaporan, type DataLaporan, type Elemen, type KolomNilai, type OpsiLaporan, type PeranNilai, type TabelLaporan, type UrutNilai,
} from "@/lib/laporanSementara";
import { buatDocx } from "@/lib/laporanDocx";
import { BTN, BTN_O, Kartu } from "../../admin/ui";

const KUNCI_OPSI = "sigap.laporan.opsi.v1";

const KOLOM: { kode: keyof KolomNilai; label: string }[] = [
  { kode: "kelas", label: "Kelas" },
  { kode: "hadir", label: "Kehadiran" },
  { kode: "pretest", label: "Nilai pretest" },
  { kode: "posttest", label: "Nilai posttest" },
  { kode: "qc", label: "Nilai QC" },
  { kode: "percobaan", label: "Jumlah percobaan QC" },
];
const URUTAN: { kode: UrutNilai; label: string }[] = [
  { kode: "peran", label: "PML dulu, lalu PPL (abjad)" },
  { kode: "nama", label: "Abjad nama" },
  { kode: "posttest", label: "Nilai posttest tertinggi" },
  { kode: "qc", label: "Nilai QC tertinggi" },
];

const INPUT = "w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] text-[#1E2B3F] focus:border-[#1F5FD1] focus:outline-none";

function Tabel({ t }: { t: TabelLaporan }) {
  return (
    <div className="mt-3 overflow-x-auto">
      {t.judul && <p className="mb-1 text-[12.5px] font-bold text-[#0F2A52]">{t.judul}</p>}
      <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
        <thead>
          <tr>
            {t.kepala.map((h, i) => (
              <th key={i} className={`border border-[#CBD5E1] bg-[#E8EEF7] px-2 py-1.5 font-bold text-[#0F2A52] ${t.rata[i] === "n" ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.baris.map((b, r) => (
            <tr key={r}>
              {b.map((c, i) => (
                <td key={i} className={`border border-[#E3E8EE] px-2 py-1 ${t.rata[i] === "n" ? "text-right tabular-nums" : "text-left"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {t.jumlah && (
            <tr>
              {t.jumlah.map((c, i) => (
                <td key={i} className={`border border-[#CBD5E1] bg-[#F6F8FB] px-2 py-1 font-bold ${t.rata[i] === "n" ? "text-right tabular-nums" : "text-left"}`}>
                  {c}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Batang({ b }: { b: BatangLaporan }) {
  const maks = Math.max(1, ...b.data.map((x) => x.nilai));
  return (
    <figure className="mt-3" aria-label={b.judul}>
      <figcaption className="mb-1 text-[12.5px] font-bold text-[#0F2A52]">{b.judul}</figcaption>
      <div className="flex h-[130px] items-end gap-1.5 rounded-lg border border-[#E3E8EE] bg-[#F6F8FB] px-2 pb-1 pt-4">
        {b.data.map((x, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${x.label}: ${fmtAngka(x.nilai)} ${b.satuan}`}>
            <span className="mb-0.5 text-[10px] tabular-nums text-[#55657D]">{fmtAngka(x.nilai)}</span>
            <div className="w-full rounded-t bg-[#1F5FD1]" style={{ height: `${Math.max(2, (panjangBatang(x.nilai, maks, 100) / 100) * 85)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 px-2">
        {b.data.map((x, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center text-[10px] text-[#55657D]">
            {x.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

function ElemenLayar({ e }: { e: Exclude<Elemen, { jenis: "butir" }> }) {
  if (e.jenis === "paragraf")
    return <p className="mb-2 text-[13.5px] leading-relaxed text-[#1E2B3F]">{e.teks}</p>;
  if (e.jenis === "tabel") return <Tabel t={e.tabel} />;
  if (e.jenis === "batang") return <Batang b={e.batang} />;
  return (
    <div className="my-2 rounded-r-lg border-l-4 border-[#1F5FD1] bg-[#F3F6FA] px-3 py-2">
      <p className="text-[12px] font-bold text-[#0F2A52]">Catatan penyusun</p>
      {paragrafDariTeks(e.teks).map((p, i) => (
        <p key={i} className="mt-1 text-[13px] leading-relaxed text-[#1E2B3F]">
          {p}
        </p>
      ))}
    </div>
  );
}

function Cek({ nilai, onUbah, children, redup }: { nilai: boolean; onUbah: (v: boolean) => void; children: React.ReactNode; redup?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 text-[13px] ${redup ? "text-[#6B7A90]" : "text-[#1E2B3F]"}`}>
      <input type="checkbox" checked={nilai} onChange={(e) => onUbah(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1F5FD1]" />
      <span>{children}</span>
    </label>
  );
}

export default function Laporan() {
  const [data, setData] = useState<DataLaporan | null>(null);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [menyusun, setMenyusun] = useState(false);
  const [opsi, setOpsi] = useState<OpsiLaporan>(OPSI_AWAL);
  const [opsiSiap, setOpsiSiap] = useState(false);

  // pilihan tersimpan di peramban (boleh gagal: mode privat / penyimpanan diblokir)
  useEffect(() => {
    try {
      const mentah = window.localStorage.getItem(KUNCI_OPSI);
      if (mentah) setOpsi(bacaOpsi(JSON.parse(mentah)));
    } catch {
      /* tanpa penyimpanan: pakai bawaan */
    }
    setOpsiSiap(true);
  }, []);
  useEffect(() => {
    if (!opsiSiap) return;
    try {
      window.localStorage.setItem(KUNCI_OPSI, JSON.stringify(opsi));
    } catch {
      /* abaikan */
    }
  }, [opsi, opsiSiap]);

  const muat = useCallback(async (segar: boolean) => {
    setMemuat(true);
    setGalat("");
    try {
      const mentah = await apiPortal<unknown>(`${API_LAPORAN}${segar ? "?segar=1" : ""}`);
      setData(bacaDataLaporan(mentah));
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Laporan belum bisa dimuat.");
    } finally {
      setMemuat(false);
    }
  }, []);
  useEffect(() => {
    void muat(false);
  }, [muat]);

  const laporan = useMemo(() => (data ? susunLaporan(data, opsi) : null), [data, opsi]);

  const ubah = (patch: Partial<OpsiLaporan>) => setOpsi((o) => ({ ...o, ...patch }));
  const setBab = (kode: string, v: boolean) => setOpsi((o) => ({ ...o, bab: { ...o.bab, [kode]: v } }));
  const setElemen = (id: string, v: boolean) => setOpsi((o) => ({ ...o, elemen: { ...o.elemen, [id]: v } }));
  const setCatatan = (kode: string, v: string) => setOpsi((o) => ({ ...o, catatan: { ...o.catatan, [kode]: v } }));
  const setKolom = (k: keyof KolomNilai, v: boolean) => setOpsi((o) => ({ ...o, kolomNilai: { ...o.kolomNilai, [k]: v } }));

  async function unduh() {
    if (!laporan || !data) return;
    setMenyusun(true);
    setGalat("");
    try {
      const blob = (await buatDocx(laporan, opsi, "blob")) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = namaBerkasLaporan(laporan, tanggalWib(data.dibuat_at));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setGalat(e instanceof Error ? `Berkas Word gagal dibuat: ${e.message}` : "Berkas Word gagal dibuat.");
    } finally {
      setMenyusun(false);
    }
  }

  function cetak() {
    if (!laporan) return;
    const w = window.open("", "_blank");
    if (!w) {
      setGalat("Jendela cetak diblokir peramban. Izinkan pop-up untuk situs ini, atau pakai Unduh Word.");
      return;
    }
    w.document.open();
    w.document.write(htmlLaporan(laporan, opsi));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <div className="space-y-3">
      <Kartu
        judul="Laporan Sementara"
        ket="Disusun otomatis dari database SIGAP setiap dibuka. Atur isi di panel bawah; uraian penilaian ditambahkan lewat catatan penyusun atau di Word."
        kanan={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void muat(true)} disabled={memuat} className={BTN_O}>
              {memuat ? "Memuat…" : "Segarkan"}
            </button>
            <button type="button" onClick={cetak} disabled={!laporan || laporan.bagian.length === 0} className={BTN_O}>
              Cetak / PDF
            </button>
            <button type="button" onClick={() => void unduh()} disabled={!laporan || laporan.bagian.length === 0 || menyusun} className={BTN}>
              {menyusun ? "Menyusun…" : "Unduh Word"}
            </button>
          </div>
        }
      >
        {galat && <p className="rounded-lg border border-[#F0C9C9] bg-[#FDF3F3] px-3 py-2 text-[13px] text-[#9B1C1C]">{galat}</p>}
        {!laporan && !galat && <p className="text-[13px] text-[#55657D]">Memuat angka laporan…</p>}
        {laporan && (
          <p className="text-[12.5px] text-[#55657D]">
            {laporan.judul} · {laporan.subjudul}
          </p>
        )}
        {laporan && (
          <p className="mt-1 text-[12px] text-[#6B7A90]">
            Berkas Word memuat daftar isi dan nomor halaman otomatis. Saat dibuka, Word menanyakan “perbarui field” — jawab Ya agar nomor halaman di daftar isi terisi.
          </p>
        )}
      </Kartu>

      {laporan && (
        <details open className="rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
          <summary className="cursor-pointer select-none px-4 py-3 text-[14px] font-bold text-[#0F2A52]">Susunan dan isi laporan</summary>
          <div className="space-y-4 border-t border-[#E3E8EE] px-4 pb-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-bold text-[#55657D]">
                Judul laporan
                <input className={`${INPUT} mt-1 font-normal`} value={opsi.judul} maxLength={200} placeholder="Kosong = judul bawaan" onChange={(e) => ubah({ judul: e.target.value })} />
              </label>
              <label className="block text-[12px] font-bold text-[#55657D]">
                Disusun oleh
                <input className={`${INPUT} mt-1 font-normal`} value={opsi.penyusun} maxLength={200} placeholder="Nama atau tim penyusun (opsional)" onChange={(e) => ubah({ penyusun: e.target.value })} />
              </label>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Bab yang ditampilkan</p>
              <ul className="space-y-3">
                {laporan.semua.map((b) => {
                  const aktif = babTampil(opsi, b.kode);
                  const bernomor = laporan.bagian.find((x) => x.kode === b.kode);
                  return (
                    <li key={b.kode} className="rounded-lg border border-[#DDE6F3] p-3">
                      <Cek nilai={aktif} onUbah={(v) => setBab(b.kode, v)}>
                        <span className="font-bold text-[#0F2A52]">{bernomor?.judulTampil ?? b.judul}</span>
                        {!aktif && <span className="ml-2 text-[12px] text-[#6B7A90]">(tidak ditampilkan)</span>}
                      </Cek>
                      {aktif && (
                        <div className="mt-2 space-y-2 pl-6">
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {b.elemen.map((e) => (
                              <Cek key={e.id} nilai={elemenTampil(opsi, e)} onUbah={(v) => setElemen(e.id, v)} redup={!elemenTampil(opsi, e)}>
                                {e.label}
                                {e.ikutBab && !(e.id in opsi.elemen) ? <span className="text-[11.5px] text-[#6B7A90]"> (ikut bab)</span> : null}
                              </Cek>
                            ))}
                          </div>
                          {b.kode === "lampiranNilai" && (
                            <div className="space-y-2 rounded-lg bg-[#F6F8FB] p-2.5">
                              <p className="text-[12px] font-bold text-[#55657D]">Kolom nilai yang dicetak</p>
                              <div className="grid gap-1.5 sm:grid-cols-3">
                                {KOLOM.map((k) => (
                                  <Cek key={k.kode} nilai={opsi.kolomNilai[k.kode]} onUbah={(v) => setKolom(k.kode, v)}>
                                    {k.label}
                                  </Cek>
                                ))}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="block text-[12px] font-bold text-[#55657D]">
                                  Urutan
                                  <select className={`${INPUT} mt-1 font-normal`} value={opsi.urutNilai} onChange={(e) => ubah({ urutNilai: e.target.value as UrutNilai })}>
                                    {URUTAN.map((u) => (
                                      <option key={u.kode} value={u.kode}>
                                        {u.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block text-[12px] font-bold text-[#55657D]">
                                  Petugas
                                  <select className={`${INPUT} mt-1 font-normal`} value={opsi.peranNilai} onChange={(e) => ubah({ peranNilai: e.target.value as PeranNilai })}>
                                    <option value="semua">PML dan PPL</option>
                                    <option value="pml">Hanya PML</option>
                                    <option value="ppl">Hanya PPL</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          )}
                          <label className="block text-[12px] font-bold text-[#55657D]">
                            Catatan penyusun untuk bab ini
                            <textarea
                              className={`${INPUT} mt-1 min-h-[56px] font-normal`}
                              value={opsi.catatan[b.kode] ?? ""}
                              maxLength={5000}
                              placeholder="Opsional. Tampil di akhir bab; baris kosong memisah paragraf."
                              onChange={(e) => setCatatan(b.kode, e.target.value)}
                            />
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Berkas Word</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Cek nilai={opsi.daftarIsi} onUbah={(v) => ubah({ daftarIsi: v })}>
                  Daftar isi otomatis
                </Cek>
                <Cek nilai={opsi.nomorHalaman} onUbah={(v) => ubah({ nomorHalaman: v })}>
                  Nomor halaman otomatis (“Halaman X dari Y”)
                </Cek>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-[#6B7A90]">Pilihan tersimpan di peramban ini dan dipakai lagi saat laporan dibuka berikutnya.</p>
              <button type="button" onClick={() => setOpsi(OPSI_AWAL)} className={BTN_O}>
                Setel ulang susunan
              </button>
            </div>
          </div>
        </details>
      )}

      {laporan && laporan.bagian.length === 0 && (
        <Kartu>
          <p className="text-[13px] text-[#55657D]">Belum ada bab yang dicentang. Centang minimal satu bab pada panel “Susunan dan isi laporan”.</p>
        </Kartu>
      )}

      {laporan?.bagian.map((b) => (
        <Kartu key={b.kode} judul={b.judulTampil ?? b.judul}>
          {kelompokkanElemen(b.elemen).map((k, i) =>
            k.jenis === "butir" ? (
              <ul key={i} className="mb-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-[#1E2B3F]">
                {k.butir.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ) : (
              <ElemenLayar key={i} e={k.elemen} />
            ),
          )}
          {b.sumber && <p className="mt-3 text-[11.5px] italic text-[#6B7A90]">Sumber: {b.sumber}</p>}
        </Kartu>
      ))}
    </div>
  );
}
