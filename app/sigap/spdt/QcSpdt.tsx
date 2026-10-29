"use client";

// app/sigap/spdt/QcSpdt.tsx
//
// (29 Okt 2026) Tab "QC" untuk Supervisor SPDT NTP (BACA SAJA). Tiga tampilan di dalamnya:
//  - Tim: hasil per PML (PPL yang KK-nya di dua PML tampil di kedua PML) + soal yang paling sering salah.
//  - Petugas: daftar semua peserta dengan percobaan, nilai, status push dan modal; penyaring peran/status/PML/nama.
//  - Monitoring: apakah modal wajib sudah sampai ke petugas (sudah membuka SIGAP sejak soal dirilis) dan apakah push masuk.
// Data: /api/portal/spdt-qc. Aturan penyaringan/penyusunan ada di lib/sigapQcMonitor.ts (diuji). Warna selalu disertai teks.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { labelStatusPpl, type QcRekapTim } from "@/lib/sigapQc";
import { bacaPmlSendiri, saringPetugas, type HitunganPeran, type PetugasQc, type SaringPetugas } from "@/lib/sigapQcMonitor";
import { API_SPDT_QC, jamWib, judulKata, type HasilQcSpdt } from "@/lib/spdtNtp";
import Ik from "./Ik";
import RincianQcPetugas from "@/app/portal/qc/RincianQc";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
function tglPendek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const h = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[h]}, ${d} ${BULAN[m - 1]}`;
}

type Lihat = "tim" | "petugas" | "monitoring";
const LABEL_LIHAT: Record<Lihat, string> = { tim: "Tim", petugas: "Petugas", monitoring: "Monitoring" };
const SELECT = "h-11 min-w-0 flex-1 rounded-[12px] border border-[#DCE5F2] bg-white px-2.5 text-[13px] font-semibold text-[#0F2A52] outline-none";
const CHIP_ON = "border-[#1F5FD1] bg-[#1F5FD1] text-white";
const CHIP_OFF = "border-[#C9D6EC] bg-white text-[#0F2A52]";

const STATUS_OPSI: [SaringPetugas["status"], string][] = [
  ["semua", "Semua status"],
  ["belum_mengisi", "Belum mengisi"],
  ["belum_lulus", "Belum lulus"],
  ["lulus", "Lulus"],
  ["modal_belum", "Modal belum sampai"],
  ["tanpa_push", "Tanpa push aktif"],
  ["push_belum_dikirim", "Push rilis belum tercatat"],
];

/** "PML 2/15 · PPL 0/40": angka dipisah per peran supaya tidak tercampur. */
function Rinci({ pml, ppl, ambil }: { pml: HitunganPeran; ppl: HitunganPeran; ambil: (h: HitunganPeran) => number }) {
  return (
    <span className="tabular-nums">
      PML {ambil(pml)}/{pml.peserta} · PPL {ambil(ppl)}/{ppl.peserta}
    </span>
  );
}

function Bilah({ n, dari, warna = "#1F5FD1" }: { n: number; dari: number; warna?: string }) {
  const p = dari > 0 ? Math.min(1, n / dari) : 0;
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E8F0]" role="img" aria-label={`${n} dari ${dari}`}>
      <div className="h-full rounded-full" style={{ width: `${Math.round(p * 100)}%`, background: warna }} />
    </div>
  );
}

export default function QcSpdt({ aktif }: { aktif: boolean }) {
  const [d, setD] = useState<HasilQcSpdt | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState<string | null>(null);
  const [lihat, setLihat] = useState<Lihat>("tim");
  const [saring, setSaring] = useState<"semua" | "belum" | "belum_lulus">("semua");
  const [f, setF] = useState<SaringPetugas>({ peran: "semua", status: "semua", pml: "semua", cari: "" });
  const [muatUlang, setMuatUlang] = useState(false);

  const muat = useCallback(async (tgl: string | null) => {
    setMuatUlang(true);
    try {
      const h = await apiPortal<HasilQcSpdt>(tgl ? `${API_SPDT_QC}?tanggal=${tgl}` : API_SPDT_QC);
      setD(h);
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat hasil QC.");
    } finally {
      setMuatUlang(false);
    }
  }, []);
  useEffect(() => {
    if (aktif) void muat(tanggal);
  }, [aktif, tanggal, muat]);

  const tim = useMemo(() => {
    if (!d) return [];
    const lolos = (x: QcRekapTim["ppl"][number]) => (saring === "belum" ? x.percobaan === 0 : saring === "belum_lulus" ? !x.lulus : true);
    return d.rekap.map((t) => ({ ...t, ppl: t.ppl.filter(lolos) })).filter((t) => saring === "semua" || t.ppl.length > 0);
  }, [d, saring]);
  const daftarPml = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of d?.petugas ?? []) {
      if (p.peran === "pml") m.set(p.akun_id, p.nama);
      else if (p.pml_akun_id != null && p.pml_nama) m.set(p.pml_akun_id, p.pml_nama);
    }
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "id"));
  }, [d]);
  const petugas = useMemo(() => (d ? saringPetugas(d.petugas, f) : []), [d, f]);

  if (galat && !d) return <p className="m-2.5 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>;
  if (!d)
    return (
      <div className="m-2.5 rounded-[18px] bg-white p-4" aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-16 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );

  // hari yang bisa dipilih: yang sudah terbentuk + hari berlaku (walau belum terbentuk)
  const hariPilih = d.hari_berlaku && !d.hari_ada.includes(d.hari_berlaku) ? [d.hari_berlaku, ...d.hari_ada] : d.hari_ada;
  const m = d.monitoring;
  const belum = m.peserta - m.sudah_mengisi;
  const pm = m.per_peran.pml;
  const pp = m.per_peran.ppl;
  const KPI = [
    { n: `${m.sudah_mengisi}/${m.peserta}`, t: "sudah mengisi", k: "", sub: <Rinci pml={pm} ppl={pp} ambil={(h) => h.sudah_mengisi} /> },
    { n: String(m.lulus), t: d.nilai_lulus >= 100 ? "lulus (nilai 100)" : `lulus (≥ ${d.nilai_lulus})`, k: "", sub: <Rinci pml={pm} ppl={pp} ambil={(h) => h.lulus} /> },
    { n: String(belum), t: "belum mengisi", k: belum > 0 ? "warn" : "", sub: <Rinci pml={pm} ppl={pp} ambil={(h) => h.peserta - h.sudah_mengisi} /> },
  ];

  return (
    <section className="flex flex-col gap-2.5 px-2.5 pb-24 pt-2.5">
      {hariPilih.length === 0 ? (
        <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">{d.aktif ? "Belum ada soal QC yang dirilis." : "QC Pemahaman SPDT NTP belum diaktifkan."}</p>
      ) : (
        <>
          <div className="-mx-2.5 flex gap-2 overflow-x-auto px-2.5 pb-0.5" role="tablist" aria-label="Pilih hari QC">
            {hariPilih.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={d.hari === t} onClick={() => setTanggal(t)} className={`h-11 flex-none whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${d.hari === t ? CHIP_ON : CHIP_OFF}`}>
                {tglPendek(t)}
                {t === d.hari_berlaku ? " · hari ini" : ""}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {KPI.map((x) => (
              <div key={x.t} className={`flex-1 rounded-[14px] border px-3 py-2 ${x.k === "warn" ? "border-[#E3A33B] bg-[#FFF9ED]" : "border-[#D9E2F1] bg-white"}`}>
                <b className={`block text-[21px] font-extrabold leading-tight tabular-nums ${x.k === "warn" ? "text-[#8A4B08]" : "text-[#0F2A52]"}`}>{x.n}</b>
                <span className="text-[11.5px] font-semibold text-[#55657D]">{x.t}</span>
                <span className="mt-0.5 block text-[10.5px] leading-tight text-[#6B7A90]">{x.sub}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Tampilan QC" className="flex flex-1 gap-[3px] rounded-[12px] bg-[#E3EAF6] p-[3px]">
              {(Object.keys(LABEL_LIHAT) as Lihat[]).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={lihat === k} onClick={() => setLihat(k)} className={`grid h-10 flex-1 place-items-center rounded-[9px] text-[13px] font-bold ${lihat === k ? "bg-white text-[#0F2A52]" : "text-[#44546F]"}`}>
                  {LABEL_LIHAT[k]}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void muat(tanggal)} aria-label="Muat ulang hasil QC" className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[#C9D6EC] bg-white text-[#1F5FD1] active:bg-[#F1F5FC]">
              <Ik n="segar" className={`h-[18px] w-[18px] ${muatUlang ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="-mt-1 px-1 text-[11.5px] text-[#6B7A90]">
            {d.hari ? `${tglPendek(d.hari)} · ${d.jumlah_soal} soal` : "Belum ada hari QC"}
            {d.rilis_at && ` · rilis ${jamWib(d.rilis_at)} WIB`} · diperbarui {jamWib(d.sekarang)} WIB
          </p>
          {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
          {d.hari === d.hari_berlaku && !d.hari_berlaku_terbentuk && (
            <p className="rounded-[14px] border-l-4 border-[#E3A33B] bg-[#FFF9ED] px-3 py-2 text-[12.5px] leading-snug text-[#6B4410]">
              Soal hari ini belum diundi. Soal terbentuk otomatis ketika penjadwal berjalan atau petugas pertama membuka soal.
            </p>
          )}

          {lihat === "tim" && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {(["semua", "belum", "belum_lulus"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={saring === k} onClick={() => setSaring(k)} className={`h-11 flex-none whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${saring === k ? CHIP_ON : CHIP_OFF}`}>
                    {k === "semua" ? "Semua" : k === "belum" ? "Belum mengisi" : "Belum lulus"}
                  </button>
                ))}
              </div>
              {tim.length === 0 && <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] text-[#55657D]">{d.rekap.length === 0 ? "Belum ada soal yang dirilis pada hari ini." : "Tidak ada petugas yang cocok dengan penyaring ini."}</p>}
              {tim.map((t) => (
                <div key={t.pml_akun_id}>
                  <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    <b className="min-w-0 truncate text-[14px] text-[#0F2A52]">{t.pml_akun_id === 0 ? "PPL tanpa PML" : `PML ${judulKata(t.pml_nama)}`}</b>
                    <span className="flex-none text-[12px] font-semibold text-[#55657D]">
                      {t.sudah}/{t.jumlah_ppl} mengisi · rata-rata awal {t.rata_awal ?? "-"}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {t.pml_akun_id != null && (
                      <li className="rounded-[14px] border border-[#C9D6EC] bg-[#F5F8FE] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <b className="min-w-0 truncate text-[14px] text-[#0F2A52]">PML · {judulKata(t.pml_nama)}</b>
                          {(() => {
                            const ps = bacaPmlSendiri(t.pml_sendiri);
                            const sudah = !!ps && ps.percobaan > 0;
                            return (
                              <span className={`flex-none text-right text-[12px] font-semibold ${!sudah ? "text-[#B42329]" : ps.lulus ? "text-[#13794B]" : "text-[#8A4B08]"}`}>
                                {sudah ? labelStatusPpl(ps, d.maks_percobaan, d.nilai_lulus) : "Belum mengisi"}
                              </span>
                            );
                          })()}
                        </div>
                        <RincianQcPetugas akunId={t.pml_akun_id} rincian={d.rincian} className="mt-1.5" />
                      </li>
                    )}
                    {t.ppl.map((x) => (
                      <li key={`${t.pml_akun_id}-${x.akun_id}`} className="rounded-[14px] border border-[#D9E2F1] bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <b className="min-w-0 truncate text-[14px] text-[#0F2A52]">{judulKata(x.nama)}</b>
                          <span className={`flex-none text-right text-[12px] font-semibold ${x.percobaan === 0 ? "text-[#B42329]" : x.lulus ? "text-[#13794B]" : "text-[#8A4B08]"}`}>
                            {x.terlambat ? "Terlambat · " : ""}
                            {labelStatusPpl(x, d.maks_percobaan, d.nilai_lulus)}
                          </span>
                        </div>
                        <RincianQcPetugas akunId={x.akun_id} rincian={d.rincian} className="mt-1.5" />
                      </li>
                    ))}
                  </ul>
                  {t.salah.length > 0 && (
                    <details className="mt-1.5 rounded-[14px] bg-[#FFF8F7] px-3 py-2">
                      <summary className="cursor-pointer text-[12.5px] font-bold text-[#B42329]">Soal yang dijawab salah pada percobaan pertama ({t.salah.length})</summary>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] text-[#1B2B4B]">
                        {[...t.salah]
                          .sort((a, b) => b.jumlah - a.jumlah)
                          .map((s) => (
                            <li key={s.soal_id}>
                              {s.pertanyaan} <b>({s.jumlah})</b>
                              <span className="block text-[11.5px] text-[#55657D]">{s.nama.map(judulKata).join(", ")}</span>
                            </li>
                          ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </>
          )}

          {lihat === "petugas" && (
            <>
              <div className="flex gap-1.5">
                <label className="flex min-w-0 flex-1">
                  <span className="sr-only">Peran</span>
                  <select value={f.peran} onChange={(e) => setF({ ...f, peran: e.target.value as SaringPetugas["peran"] })} className={SELECT}>
                    <option value="semua">PML &amp; PPL</option>
                    <option value="pml">Hanya PML</option>
                    <option value="ppl">Hanya PPL</option>
                  </select>
                </label>
                <label className="flex min-w-0 flex-1">
                  <span className="sr-only">Tim PML</span>
                  <select value={f.pml === "semua" ? "" : String(f.pml)} onChange={(e) => setF({ ...f, pml: e.target.value ? Number(e.target.value) : "semua" })} className={SELECT}>
                    <option value="">Semua tim</option>
                    {daftarPml.map(([id, nama]) => (
                      <option key={id} value={id}>
                        {judulKata(nama)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-1.5">
                <label className="flex min-w-0 flex-1">
                  <span className="sr-only">Status</span>
                  <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SaringPetugas["status"] })} className={SELECT}>
                    {STATUS_OPSI.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1">
                  <span className="sr-only">Cari nama</span>
                  <input type="search" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} placeholder="Cari nama…" className={`${SELECT} placeholder:font-normal placeholder:text-[#8A97AB]`} />
                </label>
              </div>
              <p className="px-1 text-[12px] font-semibold text-[#55657D]">
                {petugas.length} dari {d.petugas.length} petugas
                {(f.peran !== "semua" || f.status !== "semua" || f.pml !== "semua" || f.cari) && (
                  <button type="button" onClick={() => setF({ peran: "semua", status: "semua", pml: "semua", cari: "" })} className="ml-2 font-bold text-[#1F5FD1] underline">
                    Hapus penyaring
                  </button>
                )}
              </p>
              {petugas.length === 0 && <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] text-[#55657D]">Tidak ada petugas yang cocok dengan penyaring ini.</p>}
              <ul className="space-y-1.5">
                {petugas.map((p) => (
                  <BarisPetugas key={p.akun_id} p={p} d={d} />
                ))}
              </ul>
            </>
          )}

          {lihat === "monitoring" && (
            <>
              {m.peringatan_penjadwal && (
                <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] leading-snug text-[#7A1D22]">
                  Jam rilis sudah lewat lebih dari 15 menit tetapi belum ada catatan push rilis. Penjadwal (cron) kemungkinan belum berjalan, jadi petugas baru melihat soal ketika membuka SIGAP sendiri.
                </p>
              )}
              <div className="rounded-[16px] border border-[#D9E2F1] bg-white px-3.5 py-3">
                <h3 className="text-[13.5px] font-extrabold text-[#0F2A52]">Modal wajib menjawab soal</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-[#55657D]">Modal muncul begitu petugas membuka SIGAP setelah soal dirilis dan memblokir layar sampai lulus.</p>
                <div className="mt-2 text-[13px]">
                  <div className="flex justify-between">
                    <span>Sudah muncul (membuka SIGAP / menjawab / menunda)</span>
                    <b className="tabular-nums">
                      {m.modal_sampai}/{m.peserta}
                    </b>
                  </div>
                  <Bilah n={m.modal_sampai} dari={m.peserta} />
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">
                    <Rinci pml={pm} ppl={pp} ambil={(h) => h.modal_sampai} />
                  </p>
                  <div className="mt-2 flex justify-between">
                    <span>Sudah mengisi</span>
                    <b className="tabular-nums">
                      {m.sudah_mengisi}/{m.peserta}
                    </b>
                  </div>
                  <Bilah n={m.sudah_mengisi} dari={m.peserta} warna="#13794B" />
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">
                    <Rinci pml={pm} ppl={pp} ambil={(h) => h.sudah_mengisi} />
                  </p>
                  <p className="mt-2 text-[12px] text-[#55657D]">
                    Belum membuka SIGAP sejak rilis: <b className={m.belum_buka > 0 ? "text-[#B42329]" : "text-[#13794B]"}>{m.belum_buka} petugas</b> (PML {pm.belum_buka} · PPL {pp.belum_buka}). Yang menekan &ldquo;ingatkan lagi&rdquo;: {m.tunda}.
                  </p>
                </div>
              </div>
              <div className="rounded-[16px] border border-[#D9E2F1] bg-white px-3.5 py-3">
                <h3 className="text-[13.5px] font-extrabold text-[#0F2A52]">Push notifikasi</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-[#55657D]">&ldquo;Tercatat dikirim&rdquo; = dicatat penjadwal sebelum mengirim; belum tentu sudah dibuka petugas.</p>
                <div className="mt-2 text-[13px]">
                  <div className="flex justify-between">
                    <span>Punya perangkat dengan push aktif</span>
                    <b className="tabular-nums">
                      {m.push_aktif}/{m.peserta}
                    </b>
                  </div>
                  <Bilah n={m.push_aktif} dari={m.peserta} />
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">
                    <Rinci pml={pm} ppl={pp} ambil={(h) => h.push_aktif} />
                  </p>
                  <div className="mt-2 flex justify-between">
                    <span>Push rilis tercatat dikirim</span>
                    <b className={`tabular-nums ${m.push_rilis_dikirim === 0 ? "text-[#B42329]" : ""}`}>
                      {m.push_rilis_dikirim}/{m.peserta}
                    </b>
                  </div>
                  <Bilah n={m.push_rilis_dikirim} dari={m.peserta} warna={m.push_rilis_dikirim === 0 ? "#B42329" : "#1F5FD1"} />
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">
                    <Rinci pml={pm} ppl={pp} ambil={(h) => h.push_rilis_dikirim} />
                  </p>
                  <div className="mt-2 flex justify-between">
                    <span>Pernah dikirimi pengingat</span>
                    <b className="tabular-nums">
                      {m.push_ingat_dikirim}/{m.peserta}
                    </b>
                  </div>
                  <Bilah n={m.push_ingat_dikirim} dari={m.peserta} />
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">
                    <Rinci pml={pm} ppl={pp} ambil={(h) => h.push_ingat_dikirim} />
                  </p>
                  <p className="mt-2 text-[12px] text-[#55657D]">
                    Penjadwal: <b className={m.penjadwal_terdeteksi ? "text-[#13794B]" : "text-[#B42329]"}>{m.penjadwal_terdeteksi ? "terdeteksi berjalan hari ini" : "belum ada catatan pengiriman hari ini"}</b>.
                  </p>
                </div>
              </div>
              <p className="rounded-[14px] border border-dashed border-[#C9D6EC] bg-white/60 px-3 py-2.5 text-[12px] leading-snug text-[#55657D]">
                Petugas tertentu yang belum kena modal atau push dapat disaring di tampilan Petugas (status &ldquo;Modal belum sampai&rdquo;, &ldquo;Tanpa push aktif&rdquo;, &ldquo;Push rilis belum tercatat&rdquo;).
              </p>
            </>
          )}
          <p className="rounded-[14px] border border-dashed border-[#C9D6EC] bg-white/60 px-3 py-2.5 text-[12px] leading-snug text-[#55657D]">Tampilan ini hanya untuk melihat hasil. Soal dan jadwal QC diatur di Kelola Pendataan (QC Pemahaman).</p>
        </>
      )}
    </section>
  );
}

function BarisPetugas({ p, d }: { p: PetugasQc; d: HasilQcSpdt }) {
  const status = p.percobaan === 0 ? "Belum mengisi" : labelStatusPpl({ percobaan: p.percobaan, lulus: p.lulus, skor_terbaik: p.skor_terbaik }, d.maks_percobaan, d.nilai_lulus);
  const warna = p.percobaan === 0 ? "text-[#B42329]" : p.lulus ? "text-[#13794B]" : "text-[#8A4B08]";
  return (
    <li className="rounded-[14px] border border-[#D9E2F1] bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="block truncate text-[14px] text-[#0F2A52]">{judulKata(p.nama)}</b>
          <span className="text-[11.5px] text-[#6B7A90]">{p.peran === "pml" ? "PML" : p.pml_nama ? `PPL · PML ${judulKata(p.pml_nama)}` : "PPL · tanpa PML"}</span>
        </div>
        <span className={`flex-none text-right text-[12px] font-semibold ${warna}`}>{p.terlambat ? "Terlambat · " : ""}{status}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[#55657D]">
        <span>
          Percobaan <b className="tabular-nums text-[#0F2A52]">{p.percobaan}</b>
        </span>
        <span>
          Nilai awal <b className="tabular-nums text-[#0F2A52]">{p.skor_awal ?? "-"}</b>
        </span>
        <span>
          Terbaik <b className="tabular-nums text-[#0F2A52]">{p.skor_terbaik ?? "-"}</b>
        </span>
        {p.selesai_at && <span>terakhir {jamWib(p.selesai_at)}</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
        <span className={p.modal_sampai ? "text-[#13794B]" : "text-[#B42329]"}>{p.modal_sampai ? `Modal sampai${p.buka_at ? ` · buka ${jamWib(p.buka_at)}` : ""}` : "Modal belum sampai"}</span>
        <span className={p.perangkat > 0 && !p.push_bermasalah ? "text-[#13794B]" : "text-[#B42329]"}>{p.perangkat === 0 ? "Tanpa push aktif" : p.push_bermasalah ? "Push gagal berulang" : `Push aktif (${p.perangkat})`}</span>
        <span className={p.push_rilis_at ? "text-[#13794B]" : "text-[#8A4B08]"}>{p.push_rilis_at ? `Rilis terkirim ${jamWib(p.push_rilis_at)}` : "Rilis belum tercatat"}</span>
        {p.push_ingat > 0 && <span className="text-[#55657D]">{p.push_ingat}× pengingat</span>}
      </div>
      <RincianQcPetugas akunId={p.akun_id} rincian={d.rincian} className="mt-2" />
    </li>
  );
}
