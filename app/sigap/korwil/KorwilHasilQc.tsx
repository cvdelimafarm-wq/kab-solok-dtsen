"use client";

// app/sigap/korwil/KorwilHasilQc.tsx
//
// (27 Okt 2026) Lembar Supervisi > Hasil QC Pemahaman. HANYA-BACA. Jawaban QC Pemahaman petugas (PML & PPL) satu kelompok, dua tampilan:
//  * Per tim: skor tiap petugas + soal yang dijawab salah (siapa yang salah dan jawaban yang dipilih, kunci, penjelasan);
//  * Ketuk nama petugas: rincian per soal berisi pilihan pertama, kedua, ketiga ... sampai benar (semua percobaan petugas itu);
//  * Matriks: baris = soal, kolom = petugas (dikelompokkan per tim); sel ✓ benar, ✕ salah (huruf = jawaban yang dipilih), – belum.
// Saringan: tim, petugas, tanggal, dan percobaan yang dihitung (pertama / terakhir). Data: /api/portal/qc/hasil; hitungan: lib/korwilHasilQc.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { namaSingkatTampil } from "@/lib/namaTampil";
import {
  SARINGAN_AWAL,
  opsiSaringan,
  rincianPetugas,
  susunHasil,
  teksJawaban,
  type AnggotaHasil,
  type PercobaanMentah,
  type Saringan,
  type SoalMentah,
  type SoalSalah,
  type RincianPetugas,
} from "@/lib/korwilHasilQc";

type Data = { kelompok: number; sekarang: string; anggota: AnggotaHasil[]; percobaan: PercobaanMentah[]; soal: SoalMentah[] };
type Tampilan = "tim" | "matriks";

const KOTAK = "rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const SELECT = "h-[44px] w-full rounded-[12px] border border-[#CBD6E6] bg-white px-3 text-[14px] text-[#1B2B4B]";
const tglPendek = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const pct = (x: number | null) => (x == null ? "—" : `${x}%`);
const warnaPersen = (x: number | null) => (x == null ? "bg-[#EEF2F7] text-[#5B6B84]" : x >= 80 ? "bg-[#E3F6EC] text-[#13794B]" : x >= 60 ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#FDE8E8] text-[#B42329]");

function Segmen<T extends string>({ nilai, pilihan, onPilih, label }: { nilai: T; pilihan: [T, string][]; onPilih: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[12px] bg-[#EEF2F7] p-1">
      {pilihan.map(([k, t]) => (
        <button key={k} type="button" aria-pressed={nilai === k} onClick={() => onPilih(k)} className={`min-h-[40px] rounded-[9px] px-2 text-[12.5px] font-extrabold ${nilai === k ? "bg-white text-[#0F2A52] shadow-sm" : "text-[#52627A]"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

function DetailSoal({ s, pilih }: { s: SoalSalah; pilih?: boolean }) {
  return (
    <details className="rounded-[12px] border border-[#E1E8F3] bg-[#FAFCFF]" open={pilih}>
      <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5">
        <span className="mt-0.5 flex-none rounded-full bg-[#FDE8E8] px-2 py-0.5 text-[11px] font-extrabold text-[#B42329]">
          {s.jumlahSalah} salah
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#1B2B4B]">
          <span className="mr-1 text-[11px] font-extrabold text-[#6B7A90]">{s.soal.id}</span>
          {s.soal.pertanyaan}
        </span>
      </summary>
      <div className="space-y-2 border-t border-[#E1E8F3] px-3 py-2.5 text-[12.5px] leading-snug">
        <p className="text-[#13794B]">
          <b>Kunci:</b> {teksJawaban(s.soal, s.soal.kunci || null)}
        </p>
        <ul className="space-y-1">
          {s.penjawab.map((p) => (
            <li key={p.akun_id} className="text-[#7A1D22]">
              <b>{namaSingkatTampil(p.nama)}</b> <span className="text-[#6B7A90]">({p.peran.toUpperCase()}, {tglPendek(p.tanggal)})</span> memilih {teksJawaban(s.soal, p.pilih)}
            </li>
          ))}
        </ul>
        {s.soal.penjelasan && (
          <p className="rounded-[10px] bg-[#EEF4FF] px-2.5 py-2 text-[#1B2B4B]">
            <b>Penjelasan:</b> {s.soal.penjelasan}
          </p>
        )}
      </div>
    </details>
  );
}

function RincianKartu({ r, nama, soalSemua, setSoalSemua, onTutup }: { r: RincianPetugas; nama: string; soalSemua: boolean; setSoalSemua: (v: boolean) => void; onTutup: () => void }) {
  const daftar = soalSemua ? r.soal : r.soal.filter((s) => s.pernahSalah);
  return (
    <div className="space-y-2 rounded-[12px] bg-[#F5F8FD] p-3 text-[12.5px] leading-snug" aria-label={`Rincian jawaban ${nama}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-extrabold text-[#0F2A52]">
          Rincian {nama} <span className="font-semibold text-[#6B7A90]">· {r.percobaan} percobaan · {r.pernahSalah} soal pernah salah{r.belumBenar > 0 ? ` · ${r.belumBenar} belum benar` : ""}</span>
        </p>
        <button type="button" onClick={onTutup} className="min-h-[44px] flex-none px-1 text-[12px] font-extrabold text-[#1F5FD1]">
          Tutup
        </button>
      </div>
      <label className="flex min-h-[44px] items-center gap-2 font-bold text-[#52627A]">
        <input type="checkbox" className="h-5 w-5" checked={!soalSemua} onChange={(e) => setSoalSemua(!e.target.checked)} />
        Hanya soal yang pernah salah
      </label>
      {daftar.length === 0 && <p className="font-bold text-[#13794B]">{r.soal.length === 0 ? "Belum ada jawaban." : "Semua soal langsung benar pada pilihan pertama."}</p>}
      {daftar.map((s) => (
        <div key={s.soal.id} className="rounded-[10px] border border-[#E1E8F3] bg-white px-3 py-2">
          <p className="font-bold text-[#1B2B4B]">
            <span className="mr-1 text-[11px] font-extrabold text-[#6B7A90]">{s.soal.id}</span>
            {s.soal.pertanyaan}
          </p>
          <ol className="mt-1 space-y-0.5">
            {s.upaya.map((u) => (
              <li key={u.ke} className={u.benar ? "text-[#13794B]" : "text-[#7A1D22]"}>
                <b>Pilihan {u.ke}:</b> {teksJawaban(s.soal, u.pilih)} {u.benar ? "✓ benar" : "✕ salah"}{" "}
                <span className="text-[11px] text-[#6B7A90]">({tglPendek(u.tanggal)}, percobaan ke-{u.percobaanKe})</span>
              </li>
            ))}
          </ol>
          {!s.akhirBenar && <p className="mt-0.5 text-[11.5px] font-bold text-[#B42329]">Belum menjawab benar.</p>}
          {!s.akhirBenar && s.soal.kunci && <p className="text-[11.5px] text-[#13794B]">Kunci: {teksJawaban(s.soal, s.soal.kunci)}</p>}
        </div>
      ))}
    </div>
  );
}

export default function KorwilHasilQc({ kelompok }: { kelompok: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sar, setSar] = useState<Saringan>(SARINGAN_AWAL);
  const [tampil, setTampil] = useState<Tampilan>("tim");
  const [hanyaSalah, setHanyaSalah] = useState(true);
  const [sorot, setSorot] = useState<{ soal: string; akun: number | null } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [lihat, setLihat] = useState<number | null>(null); // petugas yang rinciannya dibuka
  const [soalSemua, setSoalSemua] = useState(false);

  const muat = useCallback(async () => {
    setSibuk(true);
    try {
      const r = await apiPortal<Data>(`/api/portal/qc/hasil?kelompok=${kelompok}`);
      setD(r);
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }, [kelompok]);

  useEffect(() => {
    setD(null);
    setSar(SARINGAN_AWAL);
    setSorot(null);
    setLihat(null);
    void muat();
  }, [kelompok, muat]);

  const opsi = useMemo(() => (d ? opsiSaringan(d.anggota, d.percobaan) : null), [d]);
  const h = useMemo(() => (d ? susunHasil(d.anggota, d.percobaan, d.soal, sar) : null), [d, sar]);
  const rincian = useMemo(() => (d && lihat != null ? rincianPetugas(lihat, d.percobaan, d.soal) : null), [d, lihat]);
  const petugasPilihan = useMemo(() => (opsi ? opsi.petugas.filter((p) => sar.tim == null || p.tim === sar.tim) : []), [opsi, sar.tim]);

  if (galat && !d) return <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>;
  if (!d || !h || !opsi) {
    return (
      <div className={KOTAK} aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );
  }

  const R = h.ringkas;
  const barisMatriks = hanyaSalah ? h.matriks.baris.filter((b) => b.jumlahSalah > 0) : h.matriks.baris;
  const kolomPerTim = h.tim.map((t) => ({ nama: t.nama, kolom: t.petugas }));
  const detail = sorot ? h.matriks.baris.find((b) => b.soal.id === sorot.soal) : null;

  return (
    <div className="space-y-3">
      <section className={`${KOTAK} space-y-3`} aria-label="Saringan">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[12px] font-bold text-[#52627A]">
            Tim (PML)
            <select className={`${SELECT} mt-1`} value={sar.tim ?? ""} onChange={(e) => setSar({ ...sar, tim: e.target.value || null, petugas: null })}>
              <option value="">Semua tim</option>
              {opsi.tim.map((t) => (
                <option key={t} value={t}>
                  {namaSingkatTampil(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-bold text-[#52627A]">
            Petugas
            <select className={`${SELECT} mt-1`} value={sar.petugas ?? ""} onChange={(e) => setSar({ ...sar, petugas: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Semua petugas</option>
              {petugasPilihan.map((p) => (
                <option key={p.akun_id} value={p.akun_id}>
                  {namaSingkatTampil(p.nama)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[12px] font-bold text-[#52627A]">
          Tanggal
          <select className={`${SELECT} mt-1`} value={sar.tanggal ?? ""} onChange={(e) => setSar({ ...sar, tanggal: e.target.value || null })}>
            <option value="">Semua tanggal</option>
            {opsi.tanggal.map((t) => (
              <option key={t} value={t}>
                {tglPendek(t)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="mb-1 text-[12px] font-bold text-[#52627A]">Percobaan yang dihitung (satu per petugas per hari)</p>
          <Segmen label="Percobaan yang dihitung" nilai={sar.mode} onPilih={(v) => setSar({ ...sar, mode: v })} pilihan={[["pertama", "Pertama"], ["terakhir", "Terakhir"]]} />
        </div>
        <Segmen label="Tampilan" nilai={tampil} onPilih={setTampil} pilihan={[["tim", "Per tim"], ["matriks", "Matriks soal × petugas"]]} />
      </section>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          [`${R.sudahMengisi}/${R.petugas}`, "Sudah mengisi"],
          [pct(R.persen), "Benar"],
          [String(R.salah), "Jawaban salah"],
          [String(R.belumMengisi), "Belum mengisi"],
        ].map(([a, b]) => (
          <div key={b} className="rounded-[14px] bg-white px-1 py-2.5 shadow-[0_2px_8px_rgba(15,42,82,.08)]">
            <b className="block text-[17px] text-[#0F2A52]">{a}</b>
            <small className="text-[10.5px] leading-tight text-[#6B7A90]">{b}</small>
          </div>
        ))}
      </div>

      {R.petugas === 0 && <p className={`${KOTAK} text-[13px] text-[#52627A]`}>Tidak ada petugas yang cocok dengan saringan.</p>}
      {R.petugas > 0 && R.sudahMengisi === 0 && <p className={`${KOTAK} text-[13px] text-[#52627A]`}>Belum ada jawaban QC Pemahaman{sar.tanggal ? ` pada ${tglPendek(sar.tanggal)}` : ""}.</p>}

      {tampil === "tim" &&
        h.tim.map((t) => (
          <section key={t.nama} className={`${KOTAK} space-y-3`} aria-label={`Tim ${t.nama}`}>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-[#0F2A52]">Tim {namaSingkatTampil(t.nama)}</h3>
              <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${warnaPersen(t.persen)}`}>{pct(t.persen)} benar</span>
            </div>
            <ul className="divide-y divide-[#EEF2F7]">
              {t.petugas.map((p) => (
                <li key={p.akun_id} className="py-1">
                  <button
                    type="button"
                    disabled={p.terjawab === 0}
                    aria-expanded={lihat === p.akun_id}
                    onClick={() => setLihat(lihat === p.akun_id ? null : p.akun_id)}
                    className="flex min-h-[44px] w-full items-center gap-2 text-left text-[13px] disabled:cursor-default"
                  >
                    <span className={`min-w-0 flex-1 truncate font-bold ${p.terjawab > 0 ? "text-[#1F5FD1] underline decoration-dotted underline-offset-2" : "text-[#1B2B4B]"}`}>
                      {namaSingkatTampil(p.nama)} <span className="text-[11px] font-extrabold text-[#6B7A90]">{p.peran.toUpperCase()}</span>
                    </span>
                    {p.terjawab === 0 ? (
                      <span className="flex-none rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11.5px] font-bold text-[#5B6B84]">Belum mengisi</span>
                    ) : (
                      <>
                        <span className="flex-none text-[11.5px] text-[#6B7A90]">
                          {p.salah} salah / {p.terjawab}
                        </span>
                        <span className={`flex-none rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${warnaPersen(p.persen)}`}>{pct(p.persen)}</span>
                        <span aria-hidden className="flex-none text-[11px] text-[#6B7A90]">{lihat === p.akun_id ? "▲" : "▼"}</span>
                      </>
                    )}
                  </button>
                  {lihat === p.akun_id && rincian && <RincianKartu r={rincian} nama={namaSingkatTampil(p.nama)} soalSemua={soalSemua} setSoalSemua={setSoalSemua} onTutup={() => setLihat(null)} />}
                </li>
              ))}
            </ul>
            {t.soalSalah.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[12px] font-extrabold text-[#52627A]">Soal yang dijawab salah ({t.soalSalah.length})</p>
                {t.soalSalah.map((s) => (
                  <DetailSoal key={s.soal.id} s={s} />
                ))}
              </div>
            ) : (
              t.terjawab > 0 && <p className="text-[12.5px] font-bold text-[#13794B]">Tidak ada jawaban salah.</p>
            )}
          </section>
        ))}

      {tampil === "matriks" && R.terjawab > 0 && (
        <section className={`${KOTAK} space-y-3 !px-0`} aria-label="Matriks soal dan petugas">
          <div className="flex items-center justify-between gap-2 px-4">
            <label className="flex min-h-[44px] items-center gap-2 text-[12.5px] font-bold text-[#52627A]">
              <input type="checkbox" className="h-5 w-5" checked={hanyaSalah} onChange={(e) => setHanyaSalah(e.target.checked)} />
              Hanya soal yang ada salahnya
            </label>
            <span className="flex-none text-[11.5px] text-[#6B7A90]">{barisMatriks.length} soal</span>
          </div>
          {barisMatriks.length === 0 ? (
            <p className="px-4 text-[12.5px] font-bold text-[#13794B]">Tidak ada jawaban salah.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0 text-center text-[12px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[128px] bg-white" />
                    {kolomPerTim.map((t) => (
                      <th key={t.nama} colSpan={t.kolom.length} className="border-b border-l border-[#E1E8F3] bg-[#EEF4FF] px-1 py-1 text-[11px] font-extrabold text-[#0F2A52]">
                        Tim {namaSingkatTampil(t.nama)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-3 py-1 text-left text-[11px] font-extrabold text-[#6B7A90]">Soal</th>
                    {h.matriks.kolom.map((p) => (
                      <th key={p.akun_id} className="w-[52px] min-w-[52px] border-l border-[#E1E8F3] px-0.5 py-1 align-bottom text-[10.5px] font-bold leading-tight text-[#1B2B4B]">
                        <button type="button" disabled={p.terjawab === 0} onClick={() => setLihat(lihat === p.akun_id ? null : p.akun_id)} className={`block w-full text-center ${p.terjawab > 0 ? "text-[#1F5FD1] underline decoration-dotted" : ""}`}>
                          <span className="line-clamp-2 break-words">{namaSingkatTampil(p.nama)}</span>
                          <span className="block text-[9.5px] font-extrabold text-[#6B7A90]">{p.peran.toUpperCase()}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {barisMatriks.map((b) => (
                    <tr key={b.soal.id}>
                      <th scope="row" className="sticky left-0 z-10 min-w-[128px] max-w-[128px] border-t border-[#EEF2F7] bg-white px-3 py-1.5 text-left align-top">
                        <button type="button" onClick={() => setSorot({ soal: b.soal.id, akun: null })} className="block w-full text-left">
                          <span className="block text-[11px] font-extrabold text-[#0F2A52]">
                            {b.soal.id} <span className="font-bold text-[#B42329]">· {b.jumlahSalah} salah</span>
                          </span>
                          <span className="line-clamp-2 text-[11px] font-normal leading-tight text-[#52627A]">{b.soal.pertanyaan}</span>
                        </button>
                      </th>
                      {h.matriks.kolom.map((p) => {
                        const c = b.sel[p.akun_id];
                        const aktif = sorot?.soal === b.soal.id && sorot.akun === p.akun_id;
                        const gaya = !c ? "bg-[#F4F6FA] text-[#9AA7BA]" : c.status === "benar" ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FDE8E8] text-[#B42329]";
                        return (
                          <td key={p.akun_id} className="border-l border-t border-[#EEF2F7] p-0.5">
                            <button
                              type="button"
                              disabled={!c}
                              aria-label={`${p.nama}, ${b.soal.id}: ${!c ? "belum" : c.status === "benar" ? "benar" : `salah, memilih ${c.pilih ?? "?"}`}`}
                              onClick={() => setSorot({ soal: b.soal.id, akun: p.akun_id })}
                              className={`h-[40px] w-full rounded-[8px] text-[13px] font-extrabold ${gaya} ${aktif ? "ring-2 ring-[#1F5FD1]" : ""}`}
                            >
                              {!c ? "–" : c.status === "benar" ? "✓" : `✕${c.pilih ?? ""}`}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detail && (
            <div className="mx-4 space-y-1.5 rounded-[12px] bg-[#F5F8FD] p-3 text-[12.5px] leading-snug">
              <p className="font-bold text-[#1B2B4B]">
                <span className="mr-1 text-[11px] font-extrabold text-[#6B7A90]">{detail.soal.id}</span>
                {detail.soal.pertanyaan}
              </p>
              <p className="text-[#13794B]">
                <b>Kunci:</b> {teksJawaban(detail.soal, detail.soal.kunci || null)}
              </p>
              {(() => {
                const daftar = h.matriks.kolom.filter((p) => detail.sel[p.akun_id] && (sorot?.akun == null || sorot.akun === p.akun_id));
                return daftar.map((p) => {
                  const c = detail.sel[p.akun_id]!;
                  return (
                    <p key={p.akun_id} className={c.status === "salah" ? "text-[#7A1D22]" : "text-[#52627A]"}>
                      <b>{namaSingkatTampil(p.nama)}</b> ({p.peran.toUpperCase()}, {tglPendek(c.tanggal)}): {c.status === "benar" ? "benar" : `salah, memilih ${teksJawaban(detail.soal, c.pilih)}`}
                    </p>
                  );
                });
              })()}
              {detail.soal.penjelasan && (
                <p className="rounded-[10px] bg-[#EEF4FF] px-2.5 py-2 text-[#1B2B4B]">
                  <b>Penjelasan:</b> {detail.soal.penjelasan}
                </p>
              )}
              <button type="button" onClick={() => setSorot(null)} className="min-h-[44px] text-[12px] font-extrabold text-[#1F5FD1]">
                Tutup rincian
              </button>
            </div>
          )}
          {rincian && lihat != null && (
            <div className="mx-4">
              <RincianKartu r={rincian} nama={namaSingkatTampil(h.matriks.kolom.find((p) => p.akun_id === lihat)?.nama ?? "petugas")} soalSemua={soalSemua} setSoalSemua={setSoalSemua} onTutup={() => setLihat(null)} />
            </div>
          )}
          <p className="px-4 text-[11px] text-[#6B7A90]">✓ benar · ✕ salah (huruf = jawaban yang dipilih) · – belum dijawab. Ketuk sel, soal, atau nama petugas untuk rincian.</p>
        </section>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11.5px] text-[#6B7A90]">Data per {tglPendek(new Date(Date.parse(d.sekarang) + 7 * 3_600_000).toISOString().slice(0, 10))}. Hanya-baca.</p>
        <button type="button" onClick={() => void muat()} disabled={sibuk} className="min-h-[44px] rounded-full px-3 text-[12px] font-extrabold text-[#1F5FD1] disabled:opacity-50">
          {sibuk ? "Memuat…" : "Muat ulang"}
        </button>
      </div>
      {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
    </div>
  );
}
