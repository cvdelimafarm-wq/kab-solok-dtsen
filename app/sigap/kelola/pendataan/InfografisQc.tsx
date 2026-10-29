"use client";

// app/sigap/kelola/pendataan/InfografisQc.tsx
//
// (29 Okt 2026) Infografis hasil QC Pemahaman (menggantikan kartu "Siapa yang belum mengaktifkan notifikasi"). Empat tab:
//   Ringkasan (status lulus / belum lulus / belum mengisi, sebaran nilai awal, sebaran jumlah percobaan) · Soal (soal paling sering salah,
//   pilihan jawaban yang dipilih, siapa yang salah) · Tim (nilai awal dan rata-rata salah per tim PML) · Petugas (yang salahnya terbanyak).
// Setiap batang bisa diketuk: tabel di bawahnya langsung terfilter ke orang-orang itu (onFokus). Murni SVG-less (div) agar ringan di HP.
// Angka diambil dari lib/sigapQcInfo.ts (diuji). "Salah" = percobaan PERTAMA tiap petugas.

import { useMemo, useState } from "react";
import { petugasPalingSalah, ringkasStatus, ringkasTim, sebaranNilaiAwal, sebaranPercobaan, soalPalingSalah, type TempatSebaran } from "@/lib/sigapQcInfo";
import type { QcRekapTim } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";
import type { BarisQc, FokusQc } from "@/lib/sigapQcTabel";

type Tab = "ringkasan" | "soal" | "tim" | "petugas";
const TAB: { id: Tab; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "soal", label: "Soal" },
  { id: "tim", label: "Tim" },
  { id: "petugas", label: "Petugas" },
];

const WARNA = { ok: "#13794B", wait: "#C98A00", bad: "#B42329", mut: "#8A97AB", navy: "#1F4FA8" } as const;
const fmt = (n: number | null, d = 1) => (n == null ? "-" : String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ","));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const potong = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const JEPIT2 = "[display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden";

/** Satu batang horizontal yang bisa diketuk. */
function Batang({ label, sub, nilai, maks, warna, kanan, aktif, onKlik, penanda, deskripsi }: { label: string; sub?: string; nilai: number; maks: number; warna: string; kanan: React.ReactNode; aktif?: boolean; onKlik?: () => void; penanda?: number; deskripsi: string }) {
  const lebar = maks > 0 ? Math.max(nilai > 0 ? 2 : 0, Math.min(100, (nilai / maks) * 100)) : 0;
  const isi = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[12.5px] font-semibold leading-snug text-[#1B2B4B] ${JEPIT2}`}>{label}</span>
        {sub && <span className="block truncate text-[11.5px] text-[#6B7A90]">{sub}</span>}
        <span className="relative mt-1 block h-[10px] rounded-full bg-[#EEF2F8]" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${lebar}%`, background: warna }} />
          {penanda != null && <span className="absolute -top-[3px] h-[16px] w-[2px] rounded bg-[#0F2A52]" style={{ left: `${Math.min(100, penanda)}%` }} />}
        </span>
      </span>
      <span className="w-[74px] flex-none text-right text-[12px] font-bold leading-tight tabular-nums text-[#0F2A52]">{kanan}</span>
    </>
  );
  const kelas = `flex w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left ${aktif ? "border-[#7FA2E0] bg-[#F1F6FE]" : "border-[#E3E8EE] bg-white"}`;
  return onKlik ? (
    <button type="button" onClick={onKlik} aria-pressed={aktif} aria-label={deskripsi} className={`${kelas} active:bg-[#F1F6FE]`}>
      {isi}
    </button>
  ) : (
    <div className={kelas} role="img" aria-label={deskripsi}>
      {isi}
    </div>
  );
}

function Judul({ judul, ket }: { judul: string; ket?: string }) {
  return (
    <div className="mb-1.5">
      <p className="text-[13px] font-extrabold text-[#0F2A52]">{judul}</p>
      {ket && <p className="text-[11.5px] leading-snug text-[#6B7A90]">{ket}</p>}
    </div>
  );
}

function Kolom({ data, onFokus, judulFokus }: { data: TempatSebaran[]; onFokus: (f: FokusQc) => void; judulFokus: (t: TempatSebaran) => string }) {
  const maks = Math.max(1, ...data.map((d) => d.jumlah));
  return (
    <div className="flex items-end gap-1.5" role="group">
      {data.map((d) => (
        <button
          key={d.label}
          type="button"
          disabled={d.jumlah === 0}
          onClick={() => onFokus({ judul: judulFokus(d), akun: d.akunIds })}
          aria-label={`${d.label}: ${d.jumlah} orang`}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md px-0.5 pb-0.5 pt-1 enabled:active:bg-[#F1F6FE] disabled:cursor-default"
        >
          <span className="text-[12px] font-bold tabular-nums text-[#0F2A52]">{d.jumlah}</span>
          <span className="w-full max-w-[34px] rounded-t-[5px]" style={{ height: `${Math.max(d.jumlah > 0 ? 4 : 1, (d.jumlah / maks) * 84)}px`, background: d.jumlah > 0 ? WARNA[d.nada] : "#D5DCE8" }} aria-hidden />
          <span className="text-center text-[10.5px] font-semibold leading-tight text-[#55657D]">{d.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function InfografisQc({ baris, rekap, rincian, nilaiLulus, kolom, onFokus }: { baris: BarisQc[]; rekap: QcRekapTim[]; rincian: RincianQc | undefined; nilaiLulus: number; kolom: number; onFokus: (f: FokusQc) => void }) {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [soalBuka, setSoalBuka] = useState<string | null>(null);
  const [semuaSoal, setSemuaSoal] = useState(false);
  const [semuaPetugas, setSemuaPetugas] = useState(false);
  const [urutTim, setUrutTim] = useState<"salah" | "nilai">("salah");

  const status = useMemo(() => ringkasStatus(baris), [baris]);
  const sudahMengisi = status.total - status.belum.length;
  const soal = useMemo(() => soalPalingSalah(baris, rekap, rincian), [baris, rekap, rincian]);
  const tim = useMemo(() => {
    const t = ringkasTim(rekap, rincian);
    return [...t].sort((a, b) =>
      urutTim === "salah"
        ? (b.rataSalah ?? -1) - (a.rataSalah ?? -1) || (a.rataAwal ?? 101) - (b.rataAwal ?? 101)
        : (a.rataAwal ?? 101) - (b.rataAwal ?? 101) || (b.rataSalah ?? -1) - (a.rataSalah ?? -1),
    );
  }, [rekap, rincian, urutTim]);
  const petugas = useMemo(() => petugasPalingSalah(baris, rincian, 60), [baris, rincian]);
  const nilaiAwal = useMemo(() => sebaranNilaiAwal(baris), [baris]);
  const percobaan = useMemo(() => sebaranPercobaan(baris, kolom), [baris, kolom]);

  const soalTampil = semuaSoal ? soal : soal.slice(0, 8);
  const petugasTampil = semuaPetugas ? petugas : petugas.slice(0, 10);
  const maksSoal = Math.max(1, ...soal.map((s) => s.jumlah));
  const maksSalahPetugas = Math.max(1, ...petugas.map((p) => p.jumlahSoal || p.salah));
  const maksPercobaan = Math.max(1, ...percobaan.map((p) => p.jumlah));

  const segmen = [
    { id: "lulus", label: "Lulus", ids: status.lulus, warna: WARNA.ok },
    { id: "belum_lulus", label: "Belum lulus", ids: status.belumLulus, warna: WARNA.wait },
    { id: "belum", label: "Belum mengisi", ids: status.belum, warna: WARNA.bad },
  ];

  return (
    <section className="rounded-[16px] border border-[#DDE6F3] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,42,82,.06)]" aria-label="Infografis hasil QC Pemahaman">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[15px] text-[#0F2A52]">Infografis hasil QC</b>
        <span className="text-[12px] text-[#6B7A90]">Ketuk batang untuk menyaring tabel di bawah</span>
      </div>

      <div className="mt-2.5 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Pilih tampilan infografis">
        {TAB.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`min-h-[38px] flex-none rounded-full px-4 text-[13px] font-extrabold ${tab === t.id ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3" role="tabpanel">
        {tab === "ringkasan" && (
          <div className="space-y-4">
            {status.total === 0 ? (
              <p className="text-[13px] text-[#55657D]">Belum ada peserta.</p>
            ) : (
              <>
                <div>
                  <Judul judul="Status peserta" ket={`${status.total} orang (PML dan PPL) · rata-rata nilai awal ${fmt(status.rataAwal)} → nilai terbaik ${fmt(status.rataTerbaik)}`} />
                  <div className="flex h-[26px] gap-[2px] overflow-hidden rounded-full" role="group" aria-label="Komposisi status">
                    {segmen
                      .filter((s) => s.ids.length > 0)
                      .map((s) => (
                        <button key={s.id} type="button" onClick={() => onFokus({ judul: s.label, akun: s.ids })} style={{ width: `${(s.ids.length / status.total) * 100}%`, background: s.warna }} className="min-w-[8px] text-[11.5px] font-extrabold text-white active:opacity-80" aria-label={`${s.label}: ${s.ids.length} orang`}>
                          {s.ids.length / status.total > 0.09 ? s.ids.length : ""}
                        </button>
                      ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {segmen.map((s) => (
                      <button key={s.id} type="button" disabled={s.ids.length === 0} onClick={() => onFokus({ judul: s.label, akun: s.ids })} className="inline-flex min-h-[32px] items-center gap-1.5 text-[12.5px] text-[#1B2B4B] enabled:active:underline disabled:opacity-50">
                        <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: s.warna }} aria-hidden />
                        {s.label} <b className="tabular-nums">{s.ids.length}</b> <span className="text-[#6B7A90]">({pct(s.ids.length, status.total)}%)</span>
                      </button>
                    ))}
                    {status.terlambat.length > 0 && (
                      <button type="button" onClick={() => onFokus({ judul: "Terlambat mengisi", akun: status.terlambat })} className="inline-flex min-h-[32px] items-center gap-1.5 text-[12.5px] text-[#6F5000] active:underline">
                        ⏱ Terlambat <b className="tabular-nums">{status.terlambat.length}</b>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Judul judul="Sebaran nilai percobaan pertama" ket="Berapa orang di tiap rentang nilai" />
                    <Kolom data={nilaiAwal} onFokus={onFokus} judulFokus={(t) => `Nilai awal ${t.label}`} />
                  </div>
                  <div>
                    <Judul judul="Sebaran jumlah percobaan" ket="Berapa kali tiap orang sudah mencoba" />
                    <div className="space-y-1.5">
                      {percobaan.map((p) => (
                        <Batang key={p.label} label={p.label} nilai={p.jumlah} maks={maksPercobaan} warna={p.nada === "bad" ? WARNA.bad : WARNA.navy} kanan={`${p.jumlah} orang`} deskripsi={`${p.label}: ${p.jumlah} orang`} onKlik={p.jumlah > 0 ? () => onFokus({ judul: p.label, akun: p.akunIds }) : undefined} />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "soal" && (
          <div>
            <Judul judul="Soal yang paling sering salah" ket={`Percobaan pertama · dari ${sudahMengisi} orang yang sudah mengisi · ketuk soal untuk melihat siapa yang salah dan jawaban yang dipilih`} />
            {soal.length === 0 ? (
              <p className="text-[13px] text-[#55657D]">Belum ada jawaban salah yang tercatat.</p>
            ) : (
              <div className="space-y-1.5">
                {soalTampil.map((s, i) => {
                  const buka = soalBuka === s.soal_id;
                  return (
                    <div key={s.soal_id}>
                      <Batang
                        label={`${i + 1}. ${s.pertanyaan}`}
                        nilai={s.jumlah}
                        maks={maksSoal}
                        warna={WARNA.bad}
                        kanan={
                          <>
                            {s.jumlah} orang
                            <span className="block text-[11px] font-semibold text-[#6B7A90]">{pct(s.jumlah, sudahMengisi)}%</span>
                          </>
                        }
                        aktif={buka}
                        onKlik={() => setSoalBuka(buka ? null : s.soal_id)}
                        deskripsi={`Soal ${i + 1}, ${s.jumlah} orang salah. ${buka ? "Tutup rincian" : "Buka rincian"}`}
                      />
                      {buka && (
                        <div className="mt-1 rounded-[12px] border border-[#E3E8EE] bg-[#FBFCFE] px-3 py-2.5">
                          <p className="text-[12.5px] font-semibold leading-snug text-[#1B2B4B]">{s.pertanyaan}</p>
                          {s.pilihan.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-[11.5px] font-bold text-[#55657D]">Jawaban yang dipilih oleh yang salah</p>
                              {s.pilihan.map((o) => (
                                <div key={o.huruf} className="flex items-center gap-2 text-[12px]">
                                  <b className={`w-5 flex-none text-center ${o.benar ? "text-[#13794B]" : "text-[#1B2B4B]"}`}>{o.huruf}</b>
                                  <span className="relative block h-[8px] w-[72px] flex-none rounded-full bg-[#EEF2F8]" aria-hidden>
                                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.jumlah ? (o.jumlah / s.jumlah) * 100 : 0}%`, background: o.benar ? WARNA.ok : WARNA.bad }} />
                                  </span>
                                  <span className="w-5 flex-none text-right font-bold tabular-nums text-[#0F2A52]">{o.jumlah}</span>
                                  <span className={`min-w-0 flex-1 truncate ${o.benar ? "font-semibold text-[#13794B]" : "text-[#55657D]"}`}>
                                    {o.teks}
                                    {o.benar ? " (jawaban benar)" : ""}
                                  </span>
                                </div>
                              ))}
                              {s.tidakTerjawab > 0 && <p className="text-[12px] text-[#55657D]">Tidak terjawab: <b>{s.tidakTerjawab}</b> orang</p>}
                            </div>
                          )}
                          <p className="mt-2 text-[11.5px] font-bold text-[#55657D]">Yang salah ({s.orang.length})</p>
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#1B2B4B]">
                            {s.orang.map((o, k) => (
                              <span key={`${o.akun_id}-${k}`}>
                                {k > 0 && ", "}
                                {o.nama}
                                {o.dipilih ? <span className="text-[#9B1C23]"> ({o.dipilih})</span> : ""}
                              </span>
                            ))}
                          </p>
                          <button type="button" onClick={() => onFokus({ judul: `Salah soal "${potong(s.pertanyaan, 50)}"`, akun: s.orang.map((o) => o.akun_id).filter((x) => x > 0), nama: s.orang.map((o) => o.nama) })} className="mt-2 min-h-[38px] rounded-full bg-[#0F2A52] px-4 text-[12.5px] font-extrabold text-white active:opacity-80">
                            Lihat {s.orang.length} orang ini di tabel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {soal.length > 8 && (
                  <button type="button" onClick={() => setSemuaSoal((v) => !v)} className="min-h-[38px] w-full rounded-[12px] bg-[#EEF2F8] text-[12.5px] font-extrabold text-[#1F4FA8]">
                    {semuaSoal ? "Tampilkan 8 teratas saja" : `Tampilkan semua ${soal.length} soal`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "tim" && (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Judul judul="Perbandingan tim (per PML)" ket={`Batang = rata-rata nilai percobaan pertama (0–100); garis tegak = batas lulus ${nilaiLulus}`} />
              <label className="mb-1.5 flex items-center gap-1.5 text-[12px] text-[#55657D]">
                Urut
                <select value={urutTim} onChange={(e) => setUrutTim(e.target.value as "salah" | "nilai")} className="min-h-[34px] rounded-md border border-[#CBD5E3] bg-white px-1.5 text-[12px] text-[#1B2B4B]">
                  <option value="salah">Rata-rata salah terbanyak</option>
                  <option value="nilai">Nilai awal terendah</option>
                </select>
              </label>
            </div>
            {tim.length === 0 ? (
              <p className="text-[13px] text-[#55657D]">Belum ada tim.</p>
            ) : (
              <div className="space-y-1.5">
                {tim.map((t) => (
                  <Batang
                    key={t.kunci}
                    label={t.pml}
                    sub={`${t.sudah}/${t.jumlahPpl} PPL sudah mengisi · ${t.lulus} lulus${t.rataSalah != null ? ` · salah ${fmt(t.rataSalah)} soal/orang` : ""}`}
                    nilai={t.rataAwal ?? 0}
                    maks={100}
                    penanda={nilaiLulus}
                    warna={t.rataAwal == null ? "#D5DCE8" : t.rataAwal >= nilaiLulus ? WARNA.ok : WARNA.navy}
                    kanan={t.rataAwal == null ? "belum ada" : fmt(t.rataAwal)}
                    onKlik={() => onFokus({ judul: `Tim ${t.pml}`, akun: t.akunIds })}
                    deskripsi={`Tim ${t.pml}: rata-rata nilai awal ${t.rataAwal ?? "belum ada"}. Tampilkan tim ini di tabel`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "petugas" && (
          <div>
            <Judul judul="Petugas dengan salah terbanyak" ket="Percobaan pertama · batang = jumlah soal yang salah · ketuk nama untuk menyaring tabel ke orang itu" />
            {petugas.length === 0 ? (
              <p className="text-[13px] text-[#55657D]">Belum ada petugas dengan jawaban salah.</p>
            ) : (
              <div className="space-y-1.5">
                {petugasTampil.map((p, i) => (
                  <Batang
                    key={p.akun_id}
                    label={`${i + 1}. ${p.nama}`}
                    sub={`${p.peran}${p.pml ? ` · PML ${p.pml}` : ""} · nilai awal ${p.skorAwal}${p.lulus ? " · sudah lulus" : ""}`}
                    nilai={p.salah}
                    maks={maksSalahPetugas}
                    warna={WARNA.bad}
                    kanan={`${p.salah} salah`}
                    onKlik={() => onFokus({ judul: p.nama, akun: [p.akun_id] })}
                    deskripsi={`${p.nama}: ${p.salah} soal salah. Tampilkan di tabel`}
                  />
                ))}
                {petugas.length > 10 && (
                  <button type="button" onClick={() => setSemuaPetugas((v) => !v)} className="min-h-[38px] w-full rounded-[12px] bg-[#EEF2F8] text-[12.5px] font-extrabold text-[#1F4FA8]">
                    {semuaPetugas ? "Tampilkan 10 teratas saja" : `Tampilkan semua ${petugas.length} petugas`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
