"use client";

// app/sigap/kelola/pendataan/PenilaianSeleksi.tsx
//
// (31 Okt 2026) Paket 4 seleksi: kertas kerja penilaian (variabel berbobot), tes seleksi, papan peringkat per wilayah, penetapan, pengumuman,
// naikkan cadangan, dan penugasan otomatis. Dipasang di bawah daftar pendaftar pada Seleksi.tsx untuk seleksi yang sudah dibuka.
// Aturan hitung: lib/seleksiNilai.ts. Data: /api/sigap/seleksi-nilai.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { LABEL_SUMBER, MAKS_VARIABEL, VARIABEL_BAWAAN, type InputVariabel, type SumberVariabel } from "@/lib/seleksiNilai";
import type { Papan } from "@/lib/portal/seleksiPapan";

type Data = {
  tabel_siap: boolean;
  boleh_kelola?: boolean;
  seleksi?: {
    id: number; nama: string; status: string; peringkat_level: string; tampil_nilai: boolean; jadwal_tutup: string | null;
    tes: { aktif: boolean; buka: string | null; tutup: string | null; durasi: number };
    info_pelatihan: string | null; ditetapkan_at: string | null; diumumkan_at: string | null; konfirmasi_batas: string | null;
  };
  papan?: Papan;
};

const judul = "text-[13.5px] font-extrabold text-[#0F2A52]";
const ket = "mt-1 text-[12.5px] leading-snug text-[#55657D]";
const kolom = "w-full rounded-[10px] border border-[#D9E3F2] bg-white px-2.5 py-1.5 text-[13px] text-[#1B2B4B] disabled:bg-slate-100";
const tombol = "inline-flex min-h-[38px] items-center justify-center rounded-[12px] bg-[#1F5FD1] px-3.5 text-[13px] font-bold text-white disabled:opacity-50";
const tombolPutih = "inline-flex min-h-[38px] items-center justify-center rounded-[12px] border border-[#CBD6E6] bg-white px-3.5 text-[13px] font-bold text-[#1B2B4B] disabled:opacity-50";
const blok = "rounded-[14px] border border-[#DDE6F3] p-3";

const keInput = (iso: string | null): string => (iso ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16) : "");
const dariInput = (v: string): string | null => (v ? new Date(`${v}:00+07:00`).toISOString() : null);
const waktu = (iso: string | null): string => (iso ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") + " WIB" : "–");
const LABEL_HASIL: Record<string, string> = { lulus: "Lulus", cadangan: "Cadangan", tidak: "Tidak lulus" };
const WARNA_HASIL: Record<string, string> = { lulus: "bg-[#E3F6EC] text-[#13794B]", cadangan: "bg-[#FFF4D6] text-[#8A6200]", tidak: "bg-[#F1F3F7] text-[#5B6B84]" };

export default function PenilaianSeleksi({ seleksiId }: { seleksiId: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [variabel, setVariabel] = useState<InputVariabel[]>([]);
  const [nilai, setNilai] = useState<Record<string, string>>({}); // "variabelId:akunId" -> teks yang diubah
  const [tes, setTes] = useState({ aktif: false, buka: "", tutup: "", durasi: "30", soal: "" });
  const [umum, setUmum] = useState({ info: "", batas: "" });

  const muat = useCallback(async () => {
    try {
      const r = await apiPortal<Data>(`/api/sigap/seleksi-nilai?id=${seleksiId}`);
      setD(r);
      setGalat(null);
      if (r.papan) setVariabel(r.papan.variabel.map((v) => ({ kode: v.kode, nama: v.nama, sumber: v.sumber, bobot: v.bobot })));
      if (r.seleksi) {
        setTes((t) => ({ ...t, aktif: r.seleksi!.tes.aktif, buka: keInput(r.seleksi!.tes.buka), tutup: keInput(r.seleksi!.tes.tutup), durasi: String(r.seleksi!.tes.durasi) }));
        setUmum({ info: r.seleksi.info_pelatihan ?? "", batas: keInput(r.seleksi.konfirmasi_batas) });
      }
      setNilai({});
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat penilaian.");
    }
  }, [seleksiId]);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function kirim<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T | null> {
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      return await apiPortal<T>("/api/sigap/seleksi-nilai", { method: "POST", body: JSON.stringify({ id: seleksiId, ...body }) });
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memproses.");
      return null;
    } finally {
      setSibuk(false);
    }
  }

  const s = d?.seleksi;
  const papan = d?.papan;
  const diumumkan = !!s?.diumumkan_at;
  const ditetapkan = !!s?.ditetapkan_at;
  const kelola = d?.boleh_kelola === true;
  const totalBobot = variabel.reduce((t, v) => t + (Number(v.bobot) || 0), 0);
  const adaManual = papan?.variabel.some((v) => v.sumber === "manual") ?? false;
  const jumlahUbah = Object.keys(nilai).length;
  const hitungHasil = useMemo(() => {
    const b = papan?.baris ?? [];
    const per = (h: string) => b.filter((x) => (ditetapkan ? x.hasil : x.usulan) === h).length;
    return { lulus: per("lulus"), cadangan: per("cadangan"), tidak: per("tidak") };
  }, [papan, ditetapkan]);

  if (!d && !galat) return <div className={blok}><p className={ket}>Memuat penilaian…</p></div>;
  if (d && !d.tabel_siap) return <div className={blok}><p className="rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">Tabel penilaian belum dibuat (SQL 20261031i_seleksi_nilai.sql).</p></div>;

  async function simpanVariabel() {
    const r = await kirim({ aksi: "simpan_variabel", variabel });
    if (r) {
      setOk("Variabel penilaian tersimpan.");
      await muat();
    }
  }

  async function simpanNilai() {
    if (!papan) return;
    const peVar = new Map<number, { akun_id: number; nilai: string }[]>();
    for (const [k, teks] of Object.entries(nilai)) {
      const [vId, aId] = k.split(":").map(Number);
      peVar.set(vId, [...(peVar.get(vId) ?? []), { akun_id: aId, nilai: teks.trim().replace(",", ".") }]);
    }
    for (const [variabel_id, daftar] of peVar) {
      const r = await kirim({ aksi: "isi_nilai", variabel_id, nilai: daftar });
      if (!r) return;
    }
    setOk("Nilai tersimpan.");
    await muat();
  }

  async function simpanTes() {
    const r = await kirim<{ jumlah_soal: number }>({ aksi: "simpan_tes", aktif: tes.aktif, buka: dariInput(tes.buka), tutup: dariInput(tes.tutup), durasi: Number(tes.durasi), soal_teks: tes.soal });
    if (r) {
      setOk(`Tes tersimpan (${r.jumlah_soal} soal).`);
      setTes((t) => ({ ...t, soal: "" }));
      await muat();
    }
  }

  async function tetapkan() {
    if (!window.confirm("Tetapkan hasil dari skor dan peringkat saat ini? Anda masih dapat menetapkan ulang sebelum diumumkan.")) return;
    const r = await kirim<{ lulus: number; cadangan: number; tidak: number }>({ aksi: "tetapkan" });
    if (r) {
      setOk(`Hasil ditetapkan: ${r.lulus} lulus, ${r.cadangan} cadangan, ${r.tidak} tidak lulus.`);
      await muat();
    }
  }

  async function umumkan() {
    if (!window.confirm("Umumkan hasil? Semua pendaftar menerima notifikasi sesuai hasilnya, dan variabel/nilai tidak dapat diubah lagi.")) return;
    const r = await kirim<{ ringkas: Record<string, { sasaran: number; terkirim: number; tanpa_push: number }> }>({ aksi: "umumkan", info_pelatihan: umum.info, konfirmasi_batas: dariInput(umum.batas) });
    if (r) {
      const t = Object.entries(r.ringkas).map(([h, x]) => `${LABEL_HASIL[h]} ${x.sasaran} (tanpa notifikasi ${x.tanpa_push})`).join(", ");
      setOk(`Hasil diumumkan: ${t}.`);
      await muat();
    }
  }

  async function naikkan(akunId: number, nama: string) {
    if (!window.confirm(`Naikkan ${nama} dari cadangan menjadi lulus? Yang bersangkutan menerima notifikasi.`)) return;
    const r = await kirim<{ tanpa_push: boolean }>({ aksi: "naikkan_cadangan", akun_id: akunId });
    if (r) {
      setOk(r.tanpa_push ? `${nama} dinaikkan (belum berlangganan notifikasi; hubungi langsung).` : `${nama} dinaikkan menjadi lulus.`);
      await muat();
    }
  }

  async function tugaskan() {
    const r = await kirim<{ ditambahkan: number; sudah_ada: number; gagal: number }>({ aksi: "tugaskan" });
    if (r) {
      setOk(`Penugasan: ${r.ditambahkan} ditambahkan, ${r.sudah_ada} sudah ada, ${r.gagal} gagal.`);
      await muat();
    }
  }

  return (
    <div className={`${blok} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className={`${judul} mr-auto`}>Penilaian, peringkat & pengumuman</h4>
        {ditetapkan && <span className="rounded-[9px] bg-[#E6EEFC] px-2 py-[3px] text-[11px] font-bold text-[#1F5FD1]">Ditetapkan {waktu(s?.ditetapkan_at ?? null)}</span>}
        {diumumkan && <span className="rounded-[9px] bg-[#E3F6EC] px-2 py-[3px] text-[11px] font-bold text-[#13794B]">Diumumkan {waktu(s?.diumumkan_at ?? null)}</span>}
        <button type="button" className={tombolPutih} onClick={() => void muat()} disabled={sibuk}>Muat ulang</button>
      </div>
      {galat && <p role="alert" className="rounded-[10px] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#B42329]">{galat}</p>}
      {ok && <p className="rounded-[10px] bg-[#E3F6EC] px-3 py-2 text-[12.5px] text-[#13794B]">{ok}</p>}

      {/* ---- Variabel penilaian */}
      <div className={blok}>
        <h5 className={judul}>1 · Kertas kerja penilaian</h5>
        <p className={ket}>Skor akhir = rata-rata berbobot nilai tiap variabel (0-100). Nilai yang belum ada dihitung 0 dan ditandai.</p>
        {variabel.length === 0 && kelola && !diumumkan && (
          <button type="button" className={`${tombolPutih} mt-2`} onClick={() => setVariabel(VARIABEL_BAWAAN.map((v) => ({ ...v })))}>Pakai variabel bawaan (tes 40, rekam jejak 40, kedekatan 20)</button>
        )}
        {variabel.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {variabel.map((v, i) => (
              <div key={v.kode + i} className="flex flex-wrap items-center gap-2">
                <input aria-label="Nama variabel" className={`${kolom} min-w-[160px] flex-1`} value={v.nama} disabled={!kelola || diumumkan || v.sumber !== "manual"} onChange={(e) => setVariabel(variabel.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
                <span className="text-[11.5px] text-[#6B7A90]">{LABEL_SUMBER[v.sumber as SumberVariabel]}</span>
                <label className="flex items-center gap-1 text-[12px] text-[#44546F]">
                  Bobot
                  <input aria-label={`Bobot ${v.nama}`} type="number" min={1} max={100} className={`${kolom} w-[76px]`} value={v.bobot} disabled={!kelola || diumumkan} onChange={(e) => setVariabel(variabel.map((x, j) => (j === i ? { ...x, bobot: Number(e.target.value) } : x)))} />
                </label>
                {kelola && !diumumkan && <button type="button" className="text-[12px] font-bold text-[#B42329]" onClick={() => setVariabel(variabel.filter((_, j) => j !== i))}>Hapus</button>}
              </div>
            ))}
            <p className="text-[12px] text-[#55657D]">Total bobot {totalBobot} (dinormalkan otomatis).</p>
          </div>
        )}
        {kelola && !diumumkan && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={tombolPutih} disabled={variabel.length >= MAKS_VARIABEL} onClick={() => setVariabel([...variabel, { kode: "", nama: "", sumber: "manual", bobot: 10 }])}>+ Variabel kustom (diisi PJ)</button>
            <button type="button" className={tombol} disabled={sibuk || variabel.length === 0} onClick={() => void simpanVariabel()}>Simpan variabel</button>
          </div>
        )}
      </div>

      {/* ---- Tes */}
      <div className={blok}>
        <h5 className={judul}>2 · Tes seleksi</h5>
        <p className={ket}>{papan ? `${papan.tes.jumlah_soal} soal tersimpan · ${papan.tes.selesai} pendaftar sudah selesai mengerjakan.` : ""} Dikerjakan Mitra di halaman seleksi, satu kali, dinilai otomatis.</p>
        {kelola && !diumumkan ? (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#44546F]"><input type="checkbox" checked={tes.aktif} onChange={(e) => setTes({ ...tes, aktif: e.target.checked })} /> Aktifkan tes</label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-[12px] font-semibold text-[#44546F]">Buka (WIB)<input type="datetime-local" className={kolom} value={tes.buka} onChange={(e) => setTes({ ...tes, buka: e.target.value })} /></label>
              <label className="text-[12px] font-semibold text-[#44546F]">Tutup (WIB)<input type="datetime-local" className={kolom} value={tes.tutup} onChange={(e) => setTes({ ...tes, tutup: e.target.value })} /></label>
              <label className="text-[12px] font-semibold text-[#44546F]">Durasi (menit)<input type="number" min={1} max={240} className={kolom} value={tes.durasi} onChange={(e) => setTes({ ...tes, durasi: e.target.value })} /></label>
            </div>
            <label className="block text-[12px] font-semibold text-[#44546F]">
              Soal (tempel dari Excel: No, Soal, A, B, C, D, E, Kunci, Bobot; kosongkan bila tidak mengganti soal)
              <textarea className={`${kolom} mt-1 font-mono text-[12px]`} rows={4} value={tes.soal} onChange={(e) => setTes({ ...tes, soal: e.target.value })} placeholder={"1\tIbu kota Indonesia?\tJakarta\tBandung\t\t\t\tA\t1"} />
            </label>
            <button type="button" className={tombol} disabled={sibuk} onClick={() => void simpanTes()}>Simpan tes</button>
          </div>
        ) : (
          <p className={ket}>{s?.tes.aktif ? `Dibuka ${waktu(s.tes.buka)} sampai ${waktu(s.tes.tutup)}, ${s.tes.durasi} menit.` : "Tes tidak dipakai."}</p>
        )}
      </div>

      {/* ---- Papan */}
      <div className={blok}>
        <h5 className={judul}>3 · Papan peringkat</h5>
        {papan?.catatan_level && <p className="mt-1 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">{papan.catatan_level}</p>}
        {papan && (
          <>
            <p className={ket}>
              Peringkat per <b>{papan.level}</b>. Sisa kebutuhan: PPL {papan.sisa.ppl}, PML {papan.sisa.pml}. Pendaftar {papan.baris.length}:{" "}
              {hitungHasil.lulus} lulus · {hitungHasil.cadangan} cadangan · {hitungHasil.tidak} tidak {ditetapkan ? "(tersimpan)" : "(usulan, belum ditetapkan)"}.
            </p>
            {papan.kuota.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {papan.kuota.map((k) => (
                  <span key={`${k.grup}|${k.peran}`} className={`rounded-[9px] px-2 py-[3px] text-[11px] font-bold ${k.kuota === 0 ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#EEF2F7] text-[#44546F]"}`}>
                    {k.grup} · {k.peran.toUpperCase()}: kuota {k.kuota}, mendaftar {k.pendaftar}
                  </span>
                ))}
              </div>
            )}
            {papan.baris.length === 0 ? (
              <p className={ket}>Belum ada pendaftar.</p>
            ) : (
              <div className="mt-2 max-h-[420px] overflow-auto rounded-[12px] border border-[#EEF2F7]">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-[#F5F8FE] text-left text-[#5B6B84]">
                    <tr>
                      <th className="px-2 py-1.5">Wilayah</th><th className="px-2 py-1.5">Peran</th><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Nama</th>
                      {papan.variabel.map((v) => <th key={v.id} className="whitespace-nowrap px-2 py-1.5" title={LABEL_SUMBER[v.sumber]}>{v.nama} ({v.bobot})</th>)}
                      <th className="px-2 py-1.5">Skor</th><th className="px-2 py-1.5">Hasil</th><th className="px-2 py-1.5">Konfirmasi</th><th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {papan.baris.map((b) => {
                      const hasil = ditetapkan ? b.hasil : b.usulan;
                      return (
                        <tr key={b.akun_id} className="border-t border-[#EEF2F7]">
                          <td className="whitespace-nowrap px-2 py-1.5">{b.grup}</td>
                          <td className="px-2 py-1.5">{b.peran.toUpperCase()}</td>
                          <td className="px-2 py-1.5">{b.peringkat}</td>
                          <td className="px-2 py-1.5 font-semibold" title={b.kelayakan === "memenuhi" ? undefined : `Kelayakan: ${b.kelayakan}`}>{b.nama}</td>
                          {papan.variabel.map((v) => {
                            const kunci = `${v.id}:${b.akun_id}`;
                            const asli = b.nilai[String(v.id)];
                            if (v.sumber === "manual" && kelola && !diumumkan) {
                              return (
                                <td key={v.id} className="px-2 py-1">
                                  <input aria-label={`${v.nama} ${b.nama}`} className={`${kolom} w-[70px]`} inputMode="decimal" value={kunci in nilai ? nilai[kunci] : asli ?? ""} onChange={(e) => setNilai({ ...nilai, [kunci]: e.target.value })} />
                                </td>
                              );
                            }
                            return <td key={v.id} className={`px-2 py-1.5 ${asli === null ? "text-[#B42329]" : ""}`}>{asli === null ? "kosong" : asli}</td>;
                          })}
                          <td className="px-2 py-1.5 font-extrabold">{b.skor}{b.kosong > 0 && <span className="ml-1 text-[11px] font-bold text-[#B42329]" title="Ada nilai variabel yang kosong">!</span>}</td>
                          <td className="px-2 py-1.5">{hasil && <span className={`rounded-[9px] px-2 py-[3px] text-[11px] font-bold ${WARNA_HASIL[hasil]}`}>{LABEL_HASIL[hasil]}</span>}</td>
                          <td className="px-2 py-1.5 text-[11.5px]">{b.konfirmasi === "bersedia" ? (b.ditugaskan ? "Bersedia · ditugaskan" : "Bersedia") : b.konfirmasi === "menolak" ? "Menolak" : "–"}</td>
                          <td className="px-2 py-1.5">{kelola && diumumkan && b.hasil === "cadangan" && <button type="button" className="whitespace-nowrap text-[12px] font-bold text-[#1F5FD1]" onClick={() => void naikkan(b.akun_id, b.nama)}>Naikkan</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {kelola && !diumumkan && adaManual && (
              <div className="mt-2"><button type="button" className={tombol} disabled={sibuk || jumlahUbah === 0} onClick={() => void simpanNilai()}>Simpan nilai manual{jumlahUbah ? ` (${jumlahUbah})` : ""}</button></div>
            )}
          </>
        )}
      </div>

      {/* ---- Penetapan & pengumuman */}
      {kelola && (
        <div className={blok}>
          <h5 className={judul}>4 · Penetapan & pengumuman</h5>
          {s?.status === "dibuka" && <p className={ket}>Tutup pendaftaran terlebih dahulu untuk menetapkan hasil.</p>}
          {s?.status === "ditutup" && !diumumkan && (
            <div className="mt-2 space-y-2">
              <button type="button" className={tombolPutih} disabled={sibuk || !papan || papan.baris.length === 0 || papan.variabel.length === 0} onClick={() => void tetapkan()}>{ditetapkan ? "Tetapkan ulang hasil" : "Tetapkan hasil"}</button>
              {ditetapkan && (
                <div className="space-y-2 rounded-[12px] bg-[#F9FBFE] p-2.5">
                  <label className="block text-[12px] font-semibold text-[#44546F]">Info jadwal pelatihan / pesan untuk yang lulus (opsional)
                    <textarea className={`${kolom} mt-1`} rows={2} maxLength={500} value={umum.info} onChange={(e) => setUmum({ ...umum, info: e.target.value })} placeholder="Contoh: Pelatihan 10 November 2026, 08.00 WIB di Aula BPS Kab. Solok." />
                  </label>
                  <label className="block text-[12px] font-semibold text-[#44546F]">Batas konfirmasi kesediaan (WIB, opsional)
                    <input type="datetime-local" className={kolom} value={umum.batas} onChange={(e) => setUmum({ ...umum, batas: e.target.value })} />
                  </label>
                  <button type="button" className={tombol} disabled={sibuk} onClick={() => void umumkan()}>Umumkan hasil & kirim notifikasi</button>
                </div>
              )}
            </div>
          )}
          {diumumkan && (
            <div className="mt-2 space-y-2">
              <p className={ket}>Peserta lulus yang menyatakan bersedia otomatis masuk penugasan kegiatan. Bila ada yang gagal atau terlewat, jalankan ulang:</p>
              <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => void tugaskan()}>Masukkan yang bersedia ke penugasan</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
