"use client";

// app/sigap/kelola/pendataan/KuesionerQc.tsx
//
// (27 Okt 2026) Cabang "Kuesioner supervisi" pada tab QC Kelola Pendataan: kuesioner quality check yang dipakai di halaman Lembar Supervisi (korwil/admin).
// Dua objek: Petugas (PML/PPL) dan Keluarga (KK). Diunggah dari berkas Excel "Kuesioner QC Korwil" (lembar "Kuesioner QC" + "Kriteria Penilaian"; templat
// bisa diunduh). Berkas dibaca dan diperiksa di layar sebelum disimpan; server memeriksa ulang. Tiap unggahan = VERSI baru (versi lama tersimpan dan bisa
// diberlakukan lagi; tidak ada yang dihapus). Data: /api/portal/qc/kuesioner/admin (izin bencana.admin: lihat / kelola). Aturan baca: lib/sigapQcKuesioner.ts.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN, BTN_O, BTN_T, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import {
  CONTOH_STRUKTUR,
  JENIS_SOAL,
  NAMA_LEMBAR_KRITERIA,
  NAMA_LEMBAR_KUESIONER,
  OBJEK_KUESIONER,
  bacaKuesioner,
  hitungStruktur,
  tulisLembar,
  type GalatBaris,
  type ObjekKuesioner,
  type StrukturKuesioner,
} from "@/lib/sigapQcKuesioner";

const API = "/api/portal/qc/kuesioner/admin";

type Aktif = { id: number; objek: ObjekKuesioner; versi: number; judul: string; struktur: StrukturKuesioner };
type Versi = { id: number; objek: ObjekKuesioner; versi: number; aktif: boolean; judul: string; berkas_nama: string | null; jumlah_aspek: number; jumlah_soal: number; dibuat_oleh: string | null; dibuat_at: string; jumlah_lembar: number };
type Rekap = { kelompok: number | null; objek: ObjekKuesioner; jumlah: number; baik: number; cukup: number; pembinaan: number; terakhir: string | null };
type Data = { boleh_kelola: boolean; aktif: Record<ObjekKuesioner, Aktif | null>; riwayat: Versi[]; rekap: Rekap[] };

type Calon = { objek: ObjekKuesioner; berkas: string; kuesioner: unknown[][]; kriteria: unknown[][]; struktur: StrukturKuesioner; galat: GalatBaris[] };

const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const labelObjek = (o: ObjekKuesioner) => OBJEK_KUESIONER.find((x) => x.kode === o)?.label ?? o;
const labelJenis = (j: string) => JENIS_SOAL.find((x) => x.kode === j)?.label ?? j;
function tgl(iso: string): string {
  const w = new Date(Date.parse(iso) + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(w.getUTCDate())}/${p(w.getUTCMonth() + 1)}/${w.getUTCFullYear()} ${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}

async function unduhTemplat(objek: ObjekKuesioner) {
  const XLSX = await import("xlsx");
  const l = tulisLembar(CONTOH_STRUKTUR);
  const wb = XLSX.utils.book_new();
  const w1 = XLSX.utils.aoa_to_sheet(l.kuesioner);
  w1["!cols"] = [{ wch: 8 }, { wch: 8 }, { wch: 70 }, { wch: 50 }];
  const w2 = XLSX.utils.aoa_to_sheet(l.kriteria);
  w2["!cols"] = [{ wch: 8 }, { wch: 70 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, w1, NAMA_LEMBAR_KUESIONER);
  XLSX.utils.book_append_sheet(wb, w2, NAMA_LEMBAR_KRITERIA);
  XLSX.writeFile(wb, `templat_kuesioner_qc_${objek}.xlsx`);
}

async function bacaBerkas(file: File): Promise<{ kuesioner: unknown[][]; kriteria: unknown[][] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const cari = (kata: string) => wb.SheetNames.find((s) => s.toLowerCase().includes(kata));
  const ambil = (nama: string | undefined): unknown[][] => (nama ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nama], { header: 1, defval: "", raw: false }) : []);
  const k = cari("kuesioner") ?? wb.SheetNames[0];
  if (!k) throw new Error("Berkas tidak punya lembar.");
  return { kuesioner: ambil(k), kriteria: ambil(cari("kriteria")) };
}

export default function KuesionerQc() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [calon, setCalon] = useState<Calon | null>(null);
  const [judul, setJudul] = useState("");
  const [sibuk, setSibuk] = useState(false);

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

  async function pilihBerkas(objek: ObjekKuesioner, file: File | undefined) {
    setInfo(null);
    setGalat(null);
    setCalon(null);
    if (!file) return;
    try {
      const { kuesioner, kriteria } = await bacaBerkas(file);
      const h = bacaKuesioner(kuesioner, kriteria);
      setCalon({ objek, berkas: file.name, kuesioner, kriteria, struktur: h.struktur, galat: h.galat });
      setJudul(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setGalat(`Berkas tidak bisa dibaca: ${pesanGalat(e)}`);
    }
  }

  async function simpan() {
    if (!calon || calon.galat.length > 0) return;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await apiPortal<{ versi: number; aspek: number; soal: number }>(API, { method: "POST", body: JSON.stringify({ aksi: "unggah", objek: calon.objek, judul, berkas: calon.berkas, kuesioner: calon.kuesioner, kriteria: calon.kriteria }) });
      setInfo(`Kuesioner ${labelObjek(calon.objek)} versi ${r.versi} tersimpan dan berlaku (${r.aspek} aspek, ${r.soal} pertanyaan).`);
      setCalon(null);
      await muat();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  async function aktifkan(v: Versi) {
    setSibuk(true);
    setInfo(null);
    setGalat(null);
    try {
      await apiPortal(API, { method: "POST", body: JSON.stringify({ aksi: "aktifkan", id: v.id }) });
      setInfo(`Versi ${v.versi} kuesioner ${labelObjek(v.objek)} kini berlaku.`);
      await muat();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}
      {d && !d.boleh_kelola && <Pesan jenis="info">Anda dapat melihat saja. Mengunggah kuesioner memerlukan izin kelola pendataan.</Pesan>}

      {d &&
        OBJEK_KUESIONER.map((o) => {
          const a = d.aktif[o.kode];
          const riwayat = d.riwayat.filter((v) => v.objek === o.kode);
          const sedangCalon = calon?.objek === o.kode ? calon : null;
          return (
            <Kartu key={o.kode} judul={`Kuesioner ${o.label}`} ket={o.ket} kanan={a ? <Chip w="ok">Versi {a.versi} berlaku</Chip> : <Chip w="wait">Belum diunggah</Chip>}>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN_O} onClick={() => void unduhTemplat(o.kode)}>
                  Unduh templat Excel
                </button>
                {d.boleh_kelola && (
                  <label className={`${BTN} cursor-pointer ${sibuk ? "pointer-events-none opacity-50" : ""}`}>
                    Unggah Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void pilihBerkas(o.kode, f);
                      }}
                    />
                  </label>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-[#6B7A90]">
                Berkas berisi dua lembar: &quot;{NAMA_LEMBAR_KUESIONER}&quot; (aspek QC-1, QC-2, ... dan pertanyaannya) serta &quot;{NAMA_LEMBAR_KRITERIA}&quot; (nilai tiap pilihan jawaban dan kunci jawaban).
              </p>

              {sedangCalon && (
                <div className="mt-3 space-y-2 rounded-lg border border-[#DDE6F3] bg-[#F8FAFC] p-3">
                  <p className="text-[13px] font-bold text-[#0F2A52]">Pratinjau: {sedangCalon.berkas}</p>
                  {sedangCalon.galat.length > 0 ? (
                    <>
                      <Pesan jenis="galat">
                        <p className="font-bold">Berkas belum bisa disimpan. Perbaiki lalu unggah lagi:</p>
                        <ul className="mt-1 list-disc pl-4">
                          {sedangCalon.galat.slice(0, 30).map((g, i) => (
                            <li key={i}>
                              {g.lembar ? `${g.lembar}, ` : ""}
                              {g.baris > 0 ? `baris ${g.baris}: ` : ""}
                              {g.pesan}
                            </li>
                          ))}
                        </ul>
                      </Pesan>
                      <button type="button" className={BTN_T} onClick={() => setCalon(null)}>
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[12.5px] text-[#52627A]">
                        {hitungStruktur(sedangCalon.struktur).aspek} aspek dan {hitungStruktur(sedangCalon.struktur).soal} pertanyaan terbaca. Menyimpan membuat versi baru dan menggantikan versi yang berlaku sekarang
                        {a ? ` (versi ${a.versi} tetap tersimpan)` : ""}.
                      </p>
                      <RincianStruktur struktur={sedangCalon.struktur} />
                      <div className="flex flex-wrap items-center gap-2">
                        <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={120} placeholder="Judul kuesioner (opsional)" className="min-w-[200px] flex-1 rounded-lg border border-[#DDE6F3] bg-white px-2.5 py-1.5 text-[13px]" />
                        <button type="button" className={BTN} disabled={sibuk} onClick={() => void simpan()}>
                          {sibuk ? "Menyimpan…" : "Simpan sebagai versi baru"}
                        </button>
                        <button type="button" className={BTN_T} onClick={() => setCalon(null)}>
                          Batal
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {a && !sedangCalon && (
                <details className="mt-3 rounded-lg border border-[#DDE6F3] px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-bold text-[#0F2A52]">
                    Isi kuesioner yang berlaku ({hitungStruktur(a.struktur).aspek} aspek, {hitungStruktur(a.struktur).soal} pertanyaan){a.judul ? ` · ${a.judul}` : ""}
                  </summary>
                  <div className="mt-2">
                    <RincianStruktur struktur={a.struktur} />
                  </div>
                </details>
              )}

              {riwayat.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[12px] font-bold text-[#6B7A90]">Riwayat versi</p>
                  <ul className="divide-y divide-[#EEF2F7] text-[12.5px]">
                    {riwayat.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 py-1.5">
                        <b>Versi {v.versi}</b>
                        {v.aktif && <Chip w="ok">Berlaku</Chip>}
                        <span className="text-[#52627A]">
                          {v.jumlah_aspek} aspek · {v.jumlah_soal} pertanyaan · {v.berkas_nama ?? "tanpa nama berkas"} · {v.dibuat_oleh ?? "-"} · {tgl(v.dibuat_at)} · {v.jumlah_lembar} lembar terisi
                        </span>
                        <div className="flex-1" />
                        {!v.aktif && d.boleh_kelola && (
                          <button type="button" className={BTN_T} disabled={sibuk} onClick={() => void aktifkan(v)}>
                            Berlakukan lagi
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Kartu>
          );
        })}

      {d && (
        <Kartu judul="Lembar yang sudah diisi" ket="Per kelompok, dari halaman Lembar Supervisi.">
          {d.rekap.length === 0 ? (
            <p className="text-[13px] text-[#6B7A90]">Belum ada lembar yang diisi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-[#5B6B84]">
                    <th className="py-1.5 pr-3">Kelompok</th>
                    <th className="py-1.5 pr-3">Objek</th>
                    <th className="py-1.5 pr-3">Lembar</th>
                    <th className="py-1.5 pr-3">Baik</th>
                    <th className="py-1.5 pr-3">Cukup</th>
                    <th className="py-1.5 pr-3">Perlu pembinaan</th>
                    <th className="py-1.5">Terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rekap.map((r, i) => (
                    <tr key={i} className="border-t border-[#EEF2F7]">
                      <td className="py-1.5 pr-3">{r.kelompok ?? "-"}</td>
                      <td className="py-1.5 pr-3">{labelObjek(r.objek)}</td>
                      <td className="py-1.5 pr-3">{r.jumlah}</td>
                      <td className="py-1.5 pr-3">{r.baik}</td>
                      <td className="py-1.5 pr-3">{r.cukup}</td>
                      <td className="py-1.5 pr-3">{r.pembinaan}</td>
                      <td className="py-1.5">{r.terakhir ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>
      )}
    </div>
  );
}

function RincianStruktur({ struktur }: { struktur: StrukturKuesioner }) {
  return (
    <div className="max-h-[420px] space-y-2 overflow-auto rounded-lg border border-[#DDE6F3] bg-white p-2">
      {struktur.aspek.map((a) => (
        <div key={a.kode}>
          <p className="text-[12.5px] font-extrabold text-[#0F2A52]">
            {a.kode} · {a.judul} <span className="font-semibold text-[#6B7A90]">(untuk: {a.untuk || "PML & PPL"})</span>
          </p>
          <ul className="mt-1 space-y-1">
            {a.soal.map((s) => (
              <li key={s.no} className="text-[12px] text-[#1B2B4B]">
                <b>{s.no}</b> <span className="text-[#6B7A90]">[{labelJenis(s.jenis)}]</span> {s.teks}
                {s.opsi.length > 0 && <div className="text-[11.5px] text-[#6B7A90]">{s.opsi.map((o) => `${o.teks} (${o.nilai})`).join(" · ")}</div>}
                {s.kunci && <div className="text-[11.5px] italic text-[#13794B]">Kunci: {s.kunci}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
