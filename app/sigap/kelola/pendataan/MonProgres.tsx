"use client";

// app/sigap/kelola/pendataan/MonProgres.tsx
//
// (18 Okt 2026) Tab "Monitoring" di Kelola Pendataan -- permintaan user (mockup: mockup-tab-monitoring-pendataan.html). Hanya-baca.
// Variabel "Progres petugas" (rekap menurut PPL / PML / Tim). Pemilih variabel ada di Monitoring.tsx.
// Aturan hitung: lihat lib/pendataanMonitor.ts (target tim = KK semua Sub SLS aktif; target PPL = target tim dibagi rata).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { berhasil, persen, saringPpl, saringTim, type DataMonitoringPendataan, type Hitung3 } from "@/lib/pendataanMonitor";
import { Kartu, Kpi, Persen, fmt, fmt1, jam, sel, td, tdAngka, th } from "./monUi";

type Rekap = "ppl" | "pml" | "tim";
type Urut = "bawaan" | "rendah" | "tinggi";
const jumlah = (hs: Hitung3[]): Hitung3 => hs.reduce((a, h) => ({ terdampak: a.terdampak + h.terdampak, tidak_terdampak: a.tidak_terdampak + h.tidak_terdampak, tidak_ditemukan: a.tidak_ditemukan + h.tidak_ditemukan }), { terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 });

export default function MonProgres() {
  const router = useRouter();
  const [data, setData] = useState<DataMonitoringPendataan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [rekap, setRekap] = useState<Rekap>("ppl");
  const [pml, setPml] = useState<number | null>(null);
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<Urut>("bawaan");
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(
    async (segar = false) => {
      if (!bacaSesi()) return router.replace("/");
      setMemuat(true);
      try {
        setData(await apiPortal<DataMonitoringPendataan>(`/api/portal/pendataan/monitoring${segar ? "?segar=1" : ""}`));
        setGalat(null);
      } catch (e) {
        if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
        setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      } finally {
        setMemuat(false);
      }
    },
    [router],
  );
  useEffect(() => {
    void muat();
    const a = setInterval(() => document.visibilityState === "visible" && void muat(), 60_000);
    return () => clearInterval(a);
  }, [muat]);

  // urutan capaian (terendah / tertinggi dulu) membantu memantau di layar kecil; "bawaan" = menurut tim lalu nama
  const rasio = (b: number, t: number) => (t > 0 ? b / t : 0);
  const ppl = useMemo(() => {
    const d = data ? saringPpl(data.ppl, pml, cari) : [];
    if (urut === "bawaan") return d;
    const k = (p: (typeof d)[number]) => rasio(berhasil(p.hasil), p.target);
    return [...d].sort((a, b) => (urut === "rendah" ? k(a) - k(b) : k(b) - k(a)) || a.nama.localeCompare(b.nama));
  }, [data, pml, cari, urut]);
  const tim = useMemo(() => {
    const d = data ? saringTim(data.tim, pml, cari) : [];
    if (urut === "bawaan") return d;
    const k = (t: (typeof d)[number]) => rasio(berhasil(t.hasil), t.kk_target);
    return [...d].sort((a, b) => (urut === "rendah" ? k(a) - k(b) : k(b) - k(a)) || a.pml_nama.localeCompare(b.pml_nama));
  }, [data, pml, cari, urut]);
  const adaSaringan = pml != null || cari.trim() !== "";

  // angka ringkas mengikuti tabel yang tampil; tanpa saringan memakai jumlah keseluruhan (Sub SLS bersama dihitung sekali)
  const ringkas = useMemo(() => {
    if (!data) return null;
    if (rekap === "ppl") {
      const h = jumlah(ppl.map((p) => p.hasil));
      return { h, target: ppl.reduce((a, p) => a + p.target, 0), catat: "target PPL = KK tim dibagi rata (bilangan bulat)" };
    }
    if (!adaSaringan) return { h: data.total.hasil, target: data.total.kk_target, catat: "Sub SLS bersama dihitung sekali" };
    return { h: jumlah(tim.map((t) => t.hasil)), target: tim.reduce((a, t) => a + t.kk_target, 0), catat: "jumlah tim yang tampil" };
  }, [data, rekap, ppl, tim, adaSaringan]);

  async function unduh() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const baris =
      rekap === "ppl"
        ? ppl.map((p) => ({ Tim: p.pml_nama ?? "-", PPL: p.nama, Target: Math.round(p.target * 10) / 10, "KK terdampak": p.hasil.terdampak, "KK tidak terdampak": p.hasil.tidak_terdampak, "KK didata": berhasil(p.hasil), "Capaian (%)": persen(berhasil(p.hasil), p.target), "Tidak ditemukan": p.hasil.tidak_ditemukan, Sisa: Math.max(0, Math.round(p.target - berhasil(p.hasil))) }))
        : rekap === "tim"
          ? tim.map((t) => ({ PML: t.pml_nama, PPL: t.ppl, "Sub SLS": t.sub, "Target tim": t.kk_target, "Target per PPL": Math.round(t.target_per_ppl * 10) / 10, "KK terdampak": t.hasil.terdampak, "KK tidak terdampak": t.hasil.tidak_terdampak, "KK didata": berhasil(t.hasil), "Capaian (%)": persen(berhasil(t.hasil), t.kk_target), "Tidak ditemukan": t.hasil.tidak_ditemukan, Sisa: Math.max(0, t.kk_target - berhasil(t.hasil)) }))
          : tim.map((t) => ({ PML: t.pml_nama, PPL: t.ppl, "Sub SLS": t.sub, "Sub SLS identifikasi ditugaskan": t.idf_ditugaskan ?? "", "Sub SLS identifikasi selesai": t.idf_selesai ?? "", "KK ditandai PML (info)": t.oleh_lain, "KK tim didata": berhasil(t.hasil) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris), `Progres ${rekap.toUpperCase()}`);
    XLSX.writeFile(wb, `monitoring-pendataan-${rekap}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <section className="mt-5">
      <div className="rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <div className="grid grid-cols-2 items-end gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">Rekap menurut</span>
            <div className="flex rounded-[12px] bg-[#EEF2F7] p-[3px]">
              {(["ppl", "pml", "tim"] as Rekap[]).map((r) => (
                <button key={r} type="button" onClick={() => setRekap(r)} className={`h-10 flex-1 rounded-[9px] px-3.5 text-[13px] font-extrabold sm:h-9 sm:flex-none ${rekap === r ? "bg-white text-[#0F2A52] shadow-[0_1px_5px_rgba(15,42,82,.12)]" : "text-[#55657D]"}`}>
                  {r === "ppl" ? "PPL" : r === "pml" ? "PML" : "Tim"}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">
            Tim (PML)
            <select value={pml ?? ""} onChange={(e) => setPml(e.target.value ? Number(e.target.value) : null)} className={`${sel} w-full min-h-[44px] font-normal normal-case tracking-normal sm:min-h-[40px] sm:min-w-[170px]`}>
              <option value="">Semua tim</option>
              {(data?.tim ?? []).map((t) => (
                <option key={t.pml_id} value={t.pml_id}>
                  {t.pml_nama}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">
            Cari nama
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama petugas" className={`${sel} w-full min-h-[44px] font-normal normal-case tracking-normal sm:min-h-[40px] sm:min-w-[150px]`} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">
            Urutkan
            <select value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className={`${sel} w-full min-h-[44px] font-normal normal-case tracking-normal sm:min-h-[40px] sm:min-w-[160px]`}>
              <option value="bawaan">Tim lalu nama</option>
              <option value="rendah">Capaian terendah</option>
              <option value="tinggi">Capaian tertinggi</option>
            </select>
          </label>
          <div className="col-span-2 grid grid-cols-2 gap-2.5 sm:contents">
            <button type="button" onClick={() => void unduh()} disabled={!data} className="min-h-[44px] rounded-[10px] bg-[#E4ECFA] px-4 text-[13px] font-extrabold text-[#0F2A52] disabled:opacity-50 sm:min-h-[40px]">
            Unduh Excel
          </button>
          <button type="button" onClick={() => void muat(true)} disabled={memuat} className="min-h-[44px] rounded-[10px] bg-[#E4ECFA] px-4 text-[13px] font-extrabold text-[#0F2A52] disabled:opacity-50 sm:min-h-[40px]">
            {memuat ? "Memuat…" : "Segarkan"}
          </button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[#55657D]">
          Hanya-baca. Angka dari sumber yang sama dengan Lembar Pendataan. Segar otomatis tiap 1 menit{data ? ` · data pukul ${jam(data.sekarang)} WIB` : ""}.
        </p>
      </div>

      {galat && <p className="mt-4 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
      {!data && !galat && <p className="mt-4 text-[13px] text-[#55657D]">Memuat data monitoring…</p>}

      {data && ringkas && (
        <div className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
          <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Progres petugas — rekap per {rekap === "ppl" ? "PPL" : rekap === "pml" ? "PML" : "tim"}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            <Kpi lebar judul="Capaian terhadap target" nilai={`${persen(berhasil(ringkas.h), ringkas.target)}%`} catatan={`target ${fmt(ringkas.target)} KK · ${ringkas.catat}`} />
            <Kpi judul="KK berhasil didata (terdampak + tidak)" nilai={fmt(berhasil(ringkas.h))} />
            <Kpi judul="KK terdampak" nilai={fmt(ringkas.h.terdampak)} />
            <Kpi judul="KK tidak terdampak" nilai={fmt(ringkas.h.tidak_terdampak)} />
            <Kpi judul="Tidak ditemukan" nilai={fmt(ringkas.h.tidak_ditemukan)} catatan="tidak dihitung berhasil" />
          </div>

          <div className="mt-4 hidden overflow-x-auto rounded-[14px] border border-[#E8EDF5] md:block">
            {rekap === "ppl" && (
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} sticky left-0 z-10`}>PPL</th>
                    <th className={th}>Tim (PML)</th>
                    <th className={`${th} text-right`}>Target</th>
                    <th className={`${th} text-right`}>Terdampak</th>
                    <th className={`${th} text-right`}>Tidak terdampak</th>
                    <th className={`${th} text-right`}>Berhasil didata</th>
                    <th className={th}>Capaian</th>
                    <th className={`${th} text-right`}>Tdk ditemukan</th>
                    <th className={`${th} text-right`}>Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {ppl.map((p) => {
                    const b = berhasil(p.hasil);
                    return (
                      <tr key={p.petugas_id}>
                        <td className={`${td} sticky left-0 bg-white font-bold`}>{p.nama}</td>
                        <td className={td}>{p.pml_nama ?? "—"}</td>
                        <td className={tdAngka}>{fmt(p.target)}</td>
                        <td className={tdAngka}>{fmt(p.hasil.terdampak)}</td>
                        <td className={tdAngka}>{fmt(p.hasil.tidak_terdampak)}</td>
                        <td className={`${tdAngka} font-bold`}>{fmt(b)}</td>
                        <td className={td}>
                          <Persen nilai={persen(b, p.target)} />
                        </td>
                        <td className={tdAngka}>{fmt(p.hasil.tidak_ditemukan)}</td>
                        <td className={tdAngka}>{fmt(Math.max(0, p.target - b))}</td>
                      </tr>
                    );
                  })}
                  {ppl.length === 0 && (
                    <tr>
                      <td className={td} colSpan={9}>
                        Tidak ada PPL yang cocok dengan saringan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {rekap === "tim" && (
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} sticky left-0 z-10`}>Tim (PML)</th>
                    <th className={`${th} text-right`}>PPL</th>
                    <th className={`${th} text-right`}>Sub SLS</th>
                    <th className={`${th} text-right`}>Target tim</th>
                    <th className={`${th} text-right`}>Target/PPL</th>
                    <th className={`${th} text-right`}>Terdampak</th>
                    <th className={`${th} text-right`}>Tidak terdampak</th>
                    <th className={`${th} text-right`}>Berhasil didata</th>
                    <th className={th}>Capaian</th>
                    <th className={`${th} text-right`}>Tdk ditemukan</th>
                    <th className={`${th} text-right`}>Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {tim.map((t) => {
                    const b = berhasil(t.hasil);
                    return (
                      <tr key={t.pml_id}>
                        <td className={`${td} sticky left-0 bg-white font-bold`}>{t.pml_nama}</td>
                        <td className={tdAngka}>{t.ppl}</td>
                        <td className={tdAngka}>
                          {t.sub}
                          {t.sub_nonaktif > 0 && <span className="ml-1 text-[11px] text-[#6B7A90]">(+{t.sub_nonaktif} beku)</span>}
                        </td>
                        <td className={tdAngka}>{fmt(t.kk_target)}</td>
                        <td className={tdAngka}>{fmt1(t.target_per_ppl)}</td>
                        <td className={tdAngka}>{fmt(t.hasil.terdampak)}</td>
                        <td className={tdAngka}>{fmt(t.hasil.tidak_terdampak)}</td>
                        <td className={`${tdAngka} font-bold`}>{fmt(b)}</td>
                        <td className={td}>
                          <Persen nilai={persen(b, t.kk_target)} />
                        </td>
                        <td className={tdAngka}>{fmt(t.hasil.tidak_ditemukan)}</td>
                        <td className={tdAngka}>{fmt(Math.max(0, t.kk_target - b))}</td>
                      </tr>
                    );
                  })}
                  {tim.length === 0 && (
                    <tr>
                      <td className={td} colSpan={11}>
                        Tidak ada tim yang cocok dengan saringan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {rekap === "pml" && (
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} sticky left-0 z-10`}>PML</th>
                    <th className={`${th} text-right`}>PPL</th>
                    <th className={`${th} text-right`}>Sub SLS</th>
                    <th className={`${th} text-right`}>Identifikasi: ditugaskan</th>
                    <th className={`${th} text-right`}>Selesai</th>
                    <th className={th}>Capaian identifikasi</th>
                    <th className={`${th} text-right`}>KK ditandai PML (info)</th>
                  </tr>
                </thead>
                <tbody>
                  {tim.map((t) => (
                    <tr key={t.pml_id}>
                      <td className={`${td} sticky left-0 bg-white font-bold`}>{t.pml_nama}</td>
                      <td className={tdAngka}>{t.ppl}</td>
                      <td className={tdAngka}>{t.sub}</td>
                      <td className={tdAngka}>{t.idf_ditugaskan == null ? "—" : fmt(t.idf_ditugaskan)}</td>
                      <td className={tdAngka}>{t.idf_selesai == null ? "—" : fmt(t.idf_selesai)}</td>
                      <td className={td}>{t.idf_ditugaskan == null || t.idf_selesai == null ? "—" : <Persen nilai={persen(t.idf_selesai, t.idf_ditugaskan)} />}</td>
                      <td className={tdAngka}>{fmt(t.oleh_lain)}</td>
                    </tr>
                  ))}
                  {tim.length === 0 && (
                    <tr>
                      <td className={td} colSpan={7}>
                        Tidak ada PML yang cocok dengan saringan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Tampilan HP (< 768px): satu kartu per baris, tanpa gulir samping */}
          <div className="mt-4 space-y-2.5 md:hidden">
            {rekap === "ppl" &&
              ppl.map((p) => (
                <Kartu key={p.petugas_id} judul={p.nama} sub={p.pml_nama ? `Tim ${p.pml_nama}` : "Belum masuk tim"} nilai={persen(berhasil(p.hasil), p.target)} utama={[["Terdampak", fmt(p.hasil.terdampak)], ["Tidak terdampak", fmt(p.hasil.tidak_terdampak)], ["Didata", fmt(berhasil(p.hasil))]]} lain={[["Target", fmt(p.target)], ["Sisa", fmt(Math.max(0, p.target - berhasil(p.hasil)))], ["Tdk ditemukan", fmt(p.hasil.tidak_ditemukan)]]} />
              ))}
            {rekap === "tim" &&
              tim.map((t) => (
                <Kartu key={t.pml_id} judul={t.pml_nama} sub={`${t.ppl} PPL · ${t.sub} Sub SLS${t.sub_nonaktif > 0 ? ` (+${t.sub_nonaktif} beku)` : ""}`} nilai={persen(berhasil(t.hasil), t.kk_target)} utama={[["Terdampak", fmt(t.hasil.terdampak)], ["Tidak terdampak", fmt(t.hasil.tidak_terdampak)], ["Didata", fmt(berhasil(t.hasil))]]} lain={[["Target tim", fmt(t.kk_target)], ["Target/PPL", fmt1(t.target_per_ppl)], ["Sisa", fmt(Math.max(0, t.kk_target - berhasil(t.hasil)))], ["Tdk ditemukan", fmt(t.hasil.tidak_ditemukan)]]} />
              ))}
            {rekap === "pml" &&
              tim.map((t) => (
                <Kartu
                  key={t.pml_id}
                  judul={t.pml_nama}
                  sub={`${t.ppl} PPL · ${t.sub} Sub SLS`}
                  nilai={t.idf_ditugaskan == null || t.idf_selesai == null ? null : persen(t.idf_selesai, t.idf_ditugaskan)}
                  etiket="Identifikasi Sub SLS"
                  utama={[["Ditugaskan", t.idf_ditugaskan == null ? "—" : fmt(t.idf_ditugaskan)], ["Selesai", t.idf_selesai == null ? "—" : fmt(t.idf_selesai)], ["KK ditandai PML", fmt(t.oleh_lain)]]}
                  lain={[]}
                />
              ))}
            {(rekap === "ppl" ? ppl.length : tim.length) === 0 && <p className="rounded-[12px] bg-[#F5F8FE] p-3 text-[13px] text-[#55657D]">Tidak ada data yang cocok dengan saringan.</p>}
          </div>

          <details className="mt-3 text-[12px] leading-snug text-[#55657D]" open={false}>
            <summary className="cursor-pointer text-[12.5px] font-extrabold text-[#1F5FD1]">Cara membaca angka</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>Target tim</b> = seluruh KK di Sub SLS plotting tim (termasuk yang diajukan dari Kolam wilayah), tanpa Sub SLS yang dibekukan. <b>Target per PPL</b> = target tim dibagi rata ke PPL tim dalam bilangan bulat (sisa pembagian diberikan satu-satu menurut urutan nama, jadi jumlahnya sama dengan target tim); kolom rata-rata tim tetap berupa pecahan.
            </li>
            <li>
              <b>Berhasil didata</b> = KK terdampak + tidak terdampak yang ditandai PPL itu. <b>Tidak ditemukan</b> ditampilkan terpisah. KK yang ditandai PML tidak dihitung pada PPL maupun tim (hanya info pada rekap PML).
            </li>
            <li>Sub SLS yang dipakai bersama dua tim dimuat pada target masing-masing tim, tetapi dihitung sekali pada jumlah keseluruhan.</li>
          </ul>
          </details>
        </div>
      )}
    </section>
  );
}
