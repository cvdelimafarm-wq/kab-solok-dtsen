"use client";

// app/sigap/pelatihan/monitoring/PemahamanTes.tsx
//
// (14 Nov 2026) Templat monitoring pemahaman, langkah 3: mode Hari H (K2) dan Evaluasi (K1 laptop / K3 HP) untuk pretest dan posttest,
// dengan lembar rincian soal (K4) dan rincian peserta (K5). Semua angka dari GET /api/sigap/pelatihan/pemahaman (hitungPemahamanTes, satu sumber).
// Hak lihat ditegakkan server: daftar ini hanya berisi orang dalam cakupan pemantau. Semua daftar berbentuk tabel dengan kepala kolom
// (cari, urut, saring per kolom). Di HP tabel digulir di dalam kartunya sendiri; halaman tidak bergeser ke samping.

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, pesanGalat, urlPelatihan } from "../../admin/api";
import { Kartu, Memuat, Pesan } from "../../admin/ui";
import KepalaKolom from "@/app/sigap/admin/KepalaKolom";
import { nilaiBeda, putarUrut, terapkanTabel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import type { HasilPemahamanTes, OrangTes, SoalTesHasil } from "@/lib/pemahamanTes";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { htmlLaporan, lembarExcel, ringkasanOtomatis, type KonteksLaporan } from "@/lib/laporanPemahaman";

type Jawab = { kegiatan_id: number; kegiatan_nama?: string; jenis: string; tes: { judul: string; buka_at: string | null; tutup_at: string | null; aktif: boolean } | null; sekarang: string; cakupan: string; pemahaman: HasilPemahamanTes | null };
type Mode = "hari_h" | "evaluasi" | "laporan";
type Jenis = "pretest" | "posttest";

const WARNA = { ok: "#13794B", wait: "#B7791F", bad: "#B42329", mut: "#8794A8" } as const;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : String(Math.round(n * 10) / 10).replace(".", ","));
const LABEL_STATUS: Record<OrangTes["status"], string> = { belum: "Belum mulai", mengerjakan: "Mengerjakan", selesai: "Selesai", terlewat: "Waktu habis" };

// ---------------------------------------------------------------- tabel standar (kepala kolom: cari, urut, saring)
// (14 Nov 2026) Masukan Ketua Tim: kolom terlalu lebar; di HP tanpa tombol saring di kolom. HP (< 640 px): kepala hanya label yang bisa
// diketuk untuk mengurutkan (▲/▼), sel rapat. Laptop: KepalaKolom dengan lebar minimal sesuai isi (angka sempit, teks sedang).
function useHp(): boolean {
  const [hp, setHp] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const ubah = () => setHp(m.matches);
    ubah();
    m.addEventListener("change", ubah);
    return () => m.removeEventListener("change", ubah);
  }, []);
  return hp;
}
type Kolom<T> = { id: string; label: string; nilai: (b: T) => string | number; sel?: (b: T) => React.ReactNode; angka?: boolean; kanan?: boolean };

function Tabel<T>({ baris, kolom, kunci, kosong, onBaris, label }: { baris: T[]; kolom: Kolom<T>[]; kunci: (b: T) => string | number; kosong: string; onBaris?: (b: T) => void; label: string }) {
  const [saring, setSaring] = useState<Saring<string>>({});
  const [urut, setUrut] = useState<Urut<string>>(null);
  const hp = useHp();
  const nilai = useCallback((b: T, k: string) => kolom.find((c) => c.id === k)?.nilai(b) ?? "", [kolom]);
  const tampil = useMemo(() => terapkanTabel(baris, saring, urut, nilai), [baris, saring, urut, nilai]);
  if (baris.length === 0) return <p className="m-0 text-[13px] text-[#6B7A90]">{kosong}</p>;
  return (
    <div className="-mx-1 max-h-[440px] overflow-auto px-1" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-[1] bg-[#F3F6FB]">
          <tr>
            {kolom.map((c) => (
              <th key={c.id} className={`border-b border-[#DDE6F3] ${hp ? "px-1.5" : "px-2"} py-1.5 text-left font-bold text-[#1B2B4B] ${c.kanan ? "text-right" : ""}`}>
                {hp ? (
                  <button type="button" onClick={() => setUrut(putarUrut(urut, c.id))} className="whitespace-nowrap text-[12px] font-bold" aria-label={`Urutkan kolom ${c.label}`}>
                    {c.label}
                    {urut?.kolom === c.id ? (urut.arah === "naik" ? " ▲" : " ▼") : ""}
                  </button>
                ) : (
                  <KepalaKolom id={c.id} label={c.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(baris, c.id, nilai, !!c.angka)} minW={c.angka || c.kanan ? "min-w-[5rem]" : c.id === "nama" || c.id === "soal" || c.id === "keadaan" || c.id === "saran" ? "min-w-[7.5rem]" : "min-w-[6rem]"} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tampil.map((b) => (
            <tr key={kunci(b)} onClick={onBaris ? () => onBaris(b) : undefined} onKeyDown={onBaris ? (e) => (e.key === "Enter" || e.key === " ") && onBaris(b) : undefined} tabIndex={onBaris ? 0 : undefined} className={`border-b border-[#EEF2F7] ${onBaris ? "cursor-pointer hover:bg-[#F7FAFF] focus:bg-[#EEF4FF] focus:outline-none" : ""}`}>
              {kolom.map((c) => (
                <td key={c.id} className={`${hp ? "px-1.5" : "px-2"} py-1.5 align-top ${c.kanan ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  {c.sel ? c.sel(b) : String(c.nilai(b))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tampil.length === 0 && <p className="m-0 py-2 text-[12.5px] text-[#6B7A90]">Tidak ada baris yang cocok dengan saringan kolom.</p>}
    </div>
  );
}

const Potong = ({ teks, lebar = "max-w-[7.5rem] sm:max-w-[15rem]" }: { teks: string; lebar?: string }) => (
  <span className={`block truncate ${lebar}`} title={teks}>
    {teks}
  </span>
);

function Angka({ label, nilai, ket, nada, aktif, onKlik }: { label: string; nilai: string; ket?: string; nada?: keyof typeof WARNA; aktif?: boolean; onKlik?: () => void }) {
  const isi = (
    <>
      <span className="block text-[11.5px] font-bold uppercase tracking-[.3px] text-[#6B7A90]">{label}</span>
      <span className="block text-[22px] font-extrabold tabular-nums" style={{ color: nada ? WARNA[nada] : "#0F2A52" }}>
        {nilai}
      </span>
      {ket && <span className="block text-[11.5px] text-[#55657D]">{ket}</span>}
    </>
  );
  return onKlik ? (
    <button type="button" onClick={onKlik} aria-pressed={aktif} className={`h-full rounded-[12px] border px-3 py-2 text-left ${aktif ? "border-[#1F5FD1] bg-[#EEF4FF]" : "border-[#DDE6F3] bg-white"} active:opacity-80`}>
      {isi}
      <span className="mt-0.5 block text-[11px] text-[#1F5FD1]">{aktif ? "Ketuk lagi untuk melepas" : "Ketuk untuk menyaring ›"}</span>
    </button>
  ) : (
    <div className="h-full rounded-[12px] border border-[#DDE6F3] bg-white px-3 py-2">{isi}</div>
  );
}

function Bilah({ pct, nada }: { pct: number; nada: keyof typeof WARNA }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[8px] w-[64px] overflow-hidden rounded-full bg-[#E6EDF8]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: WARNA[nada] }} />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

// ---------------------------------------------------------------- lembar rincian (K4 soal, K5 peserta)
function Lembar({ judul, onTutup, children }: { judul: string; onTutup: () => void; children: React.ReactNode }) {
  useTutupDenganBack(true, onTutup);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={judul} onClick={onTutup}>
      <div className="max-h-[88vh] w-full max-w-[640px] overflow-y-auto rounded-t-[20px] bg-white p-4 sm:rounded-[20px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <b className="text-[15px] text-[#0F2A52]">{judul}</b>
          <button type="button" onClick={onTutup} className="min-h-[40px] min-w-[40px] rounded-full bg-[#EEF2F8] text-[15px] font-bold" aria-label="Tutup">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RincianSoal({ s, orang, onTutup }: { s: SoalTesHasil; orang: OrangTes[]; onTutup: () => void }) {
  const peta = new Map(orang.map((o) => [o.akun_id, o]));
  const maks = Math.max(1, ...s.pilihan.map((p) => p.jumlah));
  return (
    <Lembar judul={`Soal ${s.nomor}${s.topik ? ` · ${s.topik}` : ""}`} onTutup={onTutup}>
      <p className="m-0 text-[13.5px] leading-relaxed text-[#1B2B4B]">{s.teks}</p>
      {s.perlu_diperiksa && <Pesan jenis="peringatan">Pilihan {s.keliru_terbanyak?.kode} dipilih lebih banyak daripada kunci. Periksa teks soal atau kuncinya.</Pesan>}
      <ul className="mt-2 space-y-1.5">
        {s.pilihan.map((p) => (
          <li key={p.kode} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${p.kunci ? "bg-[#E7F5EE]" : "bg-[#F5F8FC]"}`}>
            <span className="flex items-start justify-between gap-2">
              <span>
                <b>{p.kode}.</b> {p.teks} {p.kunci && <b className="text-[#13794B]">· kunci</b>}
              </span>
              <b className="tabular-nums">{p.jumlah}</b>
            </span>
            <span className="mt-1 block h-[6px] overflow-hidden rounded-full bg-white">
              <span className="block h-full rounded-full" style={{ width: `${(p.jumlah / maks) * 100}%`, background: p.kunci ? WARNA.ok : WARNA.bad }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-[12.5px] text-[#55657D]">
        {s.menjawab} menjawab · {s.benar} benar · {s.salah} salah{s.lama_median_detik !== null ? ` · lama tengah ${Math.round(s.lama_median_detik)} detik` : ""}
      </p>
      <b className="mt-3 block text-[13px] text-[#0F2A52]">Yang salah ({s.salah_akun.length})</b>
      <Tabel
        label={`Yang salah soal ${s.nomor}`}
        baris={s.salah_akun.map((id) => peta.get(id)).filter((o): o is OrangTes => !!o)}
        kunci={(o) => o.akun_id}
        kosong="Tidak ada yang salah."
        kolom={[
          { id: "nama", label: "Nama", nilai: (o) => o.nama, sel: (o) => <Potong teks={o.nama} /> },
          { id: "jawab", label: "Jawaban", nilai: (o) => o.jawaban[String(s.nomor)] ?? "-" },
          { id: "tim", label: "Tim", nilai: (o) => o.tim ?? "-" },
        ]}
      />
    </Lembar>
  );
}

function RincianPeserta({ o, soal, onTutup }: { o: OrangTes; soal: SoalTesHasil[]; onTutup: () => void }) {
  const salah = soal.filter((s) => o.jawaban[String(s.nomor)] && o.jawaban[String(s.nomor)] !== s.kunci);
  const cepat = o.status === "selesai" && o.lama_menit !== null && soal.length > 0 && o.lama_menit * 60 < soal.length * 10;
  return (
    <Lembar judul={o.nama} onTutup={onTutup}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Angka label="Nilai pertama" nilai={fmt(o.nilai)} nada={o.status !== "selesai" ? "mut" : o.lulus ? "ok" : "bad"} />
        <Angka label="Terbaik" nilai={fmt(o.terbaik)} ket={`${o.percobaan} percobaan`} />
        <Angka label="Lama" nilai={o.lama_menit === null ? "–" : `${o.lama_menit} mnt`} />
        <Angka label={o.pembanding !== null ? "Dari pretest" : "Status"} nilai={o.pembanding !== null ? `${o.naik !== null && o.naik > 0 ? "+" : ""}${fmt(o.naik)}` : LABEL_STATUS[o.status]} ket={o.pembanding !== null ? `pretest ${fmt(o.pembanding)}` : undefined} />
      </div>
      {cepat && <Pesan jenis="peringatan">Selesai sangat cepat (kurang dari 10 detik per soal). Periksa apakah soal benar-benar dibaca.</Pesan>}
      {o.status === "mengerjakan" && (
        <p className="m-0 mt-2 text-[12.5px] text-[#55657D]">
          Sedang mengerjakan soal {o.soal_sekarang ?? "-"} · {o.dijawab} dari {soal.length} dijawab · {o.macet ? `macet ${o.menit_diam} menit` : "lancar"}
        </p>
      )}
      <b className="mt-3 block text-[13px] text-[#0F2A52]">Soal yang salah pada percobaan pertama ({salah.length})</b>
      <Tabel
        label={`Soal salah ${o.nama}`}
        baris={salah}
        kunci={(s) => s.nomor}
        kosong={o.status === "selesai" ? "Semua soal benar pada percobaan pertama." : "Belum ada jawaban percobaan pertama."}
        kolom={[
          { id: "no", label: "No", nilai: (s) => s.nomor, angka: true, kanan: true },
          { id: "soal", label: "Soal", nilai: (s) => s.teks, sel: (s) => <Potong teks={s.teks} lebar="max-w-[7.5rem] sm:max-w-[13rem]" /> },
          { id: "jawab", label: "Jawaban", nilai: (s) => o.jawaban[String(s.nomor)] ?? "-" },
          { id: "kunci", label: "Kunci", nilai: (s) => s.kunci },
          { id: "lama", label: "Lama (dtk)", nilai: (s) => o.lama_soal[String(s.nomor)] ?? "", angka: true, kanan: true },
        ]}
      />
    </Lembar>
  );
}

// ---------------------------------------------------------------- komponen utama
export default function PemahamanTes() {
  const [mode, setMode] = useState<Mode>("hari_h");
  const [jenis, setJenis] = useState<Jenis>("pretest");
  const [d, setD] = useState<Jawab | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [soalBuka, setSoalBuka] = useState<SoalTesHasil | null>(null);
  const [orangBuka, setOrangBuka] = useState<OrangTes | null>(null);
  const [saringStatus, setSaringStatus] = useState<OrangTes["status"] | "macet" | "lulus" | "belum_lulus" | null>(null);
  const [rentang, setRentang] = useState<string | null>(null);
  const [semuaGerak, setSemuaGerak] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Jawab>(urlPelatihan(`/api/sigap/pelatihan/pemahaman?jenis=${jenis}`));
      setD(r);
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, [jenis]);
  useEffect(() => {
    setD(null);
    void muat();
  }, [muat]);
  // Hari H: segar otomatis tiap 20 detik saat layar terlihat
  useEffect(() => {
    if (mode !== "hari_h") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void muat();
    }, 20_000);
    return () => clearInterval(t);
  }, [mode, muat]);

  const p = d?.pemahaman ?? null;
  const orangTampil = useMemo(() => {
    if (!p) return [];
    let xs = p.orang;
    if (saringStatus === "macet") xs = xs.filter((o) => o.macet);
    else if (saringStatus === "lulus") xs = xs.filter((o) => o.status === "selesai" && o.lulus);
    else if (saringStatus === "belum_lulus") xs = xs.filter((o) => o.status === "selesai" && !o.lulus);
    else if (saringStatus) xs = xs.filter((o) => o.status === saringStatus);
    if (rentang) {
      const ids = new Set(p.sebaran.find((s) => s.label === rentang)?.akun_ids ?? []);
      xs = xs.filter((o) => ids.has(o.akun_id));
    }
    return xs;
  }, [p, saringStatus, rentang]);
  const ketuk = (s: typeof saringStatus) => setSaringStatus((x) => (x === s ? null : s));

  const pilihMode = (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Mode monitoring pemahaman" className="flex gap-[3px] rounded-[12px] bg-[#E3EAF6] p-[3px]">
        {(
          [
            ["hari_h", "Hari H"],
            ["evaluasi", "Evaluasi"],
            ["laporan", "Laporan"],
          ] as [Mode, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`min-h-[38px] rounded-[10px] px-4 text-[13px] font-extrabold ${mode === k ? "bg-white text-[#0F2A52] shadow-sm" : "text-[#3C4C68]"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Pilih tes">
        {(["pretest", "posttest"] as Jenis[]).map((j) => (
          <button key={j} type="button" aria-pressed={jenis === j} onClick={() => setJenis(j)} className={`min-h-[36px] rounded-full px-3.5 text-[12.5px] font-bold ${jenis === j ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>
            {j === "pretest" ? "Pretest" : "Posttest"}
          </button>
        ))}
      </div>
    </div>
  );

  const chipSaring = (saringStatus || rentang) && (
    <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Saringan aktif">
      {saringStatus && (
        <button type="button" onClick={() => setSaringStatus(null)} className="min-h-[32px] rounded-full bg-[#1F5FD1] px-3 text-[12px] font-bold text-white">
          {saringStatus === "macet" ? "Macet" : saringStatus === "lulus" ? "Lulus" : saringStatus === "belum_lulus" ? "Belum lulus" : LABEL_STATUS[saringStatus]} ✕
        </button>
      )}
      {rentang && (
        <button type="button" onClick={() => setRentang(null)} className="min-h-[32px] rounded-full bg-[#1F5FD1] px-3 text-[12px] font-bold text-white">
          Nilai {rentang} ✕
        </button>
      )}
    </div>
  );

  return (
    <Kartu judul="Pemahaman peserta" ket={d ? `${d.tes?.judul ?? (jenis === "pretest" ? "Pretest" : "Posttest")} · ${d.cakupan}` : undefined}>
      {pilihMode}
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && !p && <p className="m-0 text-[13px] text-[#6B7A90]">{jenis === "pretest" ? "Pretest" : "Posttest"} belum dibuat untuk pelatihan ini.</p>}
      {p && p.ringkas.peserta === 0 && <p className="m-0 text-[13px] text-[#6B7A90]">Belum ada peserta dalam cakupan Anda.</p>}
      {p && p.ringkas.peserta > 0 && (
        <>
          {chipSaring}
          {mode === "laporan" && d ? (
            <Laporan p={p} k={{ kegiatan: d.kegiatan_nama ?? "Pelatihan", tes: d.tes?.judul ?? (jenis === "pretest" ? "Pretest" : "Posttest"), cakupan: d.cakupan, dibuat: new Date(d.sekarang) }} />
          ) : mode === "hari_h" ? (
            <div className="space-y-3">
              <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-4">
                <Angka label="Selesai" nilai={`${p.ringkas.selesai}/${p.ringkas.peserta}`} nada="ok" aktif={saringStatus === "selesai"} onKlik={() => ketuk("selesai")} />
                <Angka label="Mengerjakan" nilai={String(p.ringkas.mengerjakan)} aktif={saringStatus === "mengerjakan"} onKlik={() => ketuk("mengerjakan")} />
                <Angka label="Belum mulai" nilai={String(p.ringkas.belum)} nada={p.ringkas.belum ? "bad" : "mut"} aktif={saringStatus === "belum"} onKlik={() => ketuk("belum")} />
                <Angka label="Macet" nilai={String(p.ringkas.macet)} nada={p.ringkas.macet ? "wait" : "mut"} ket={p.ringkas.terlewat ? `${p.ringkas.terlewat} waktu habis` : undefined} aktif={saringStatus === "macet"} onKlik={() => ketuk("macet")} />
              </div>
              <div>
                <b className="text-[13.5px] text-[#0F2A52]">Peserta ({orangTampil.length})</b> <span className="text-[11.5px] text-[#6B7A90]">· ketuk baris untuk rincian · diperbarui tiap 20 detik</span>
                <Tabel
                  label="Peserta Hari H"
                  baris={orangTampil}
                  kunci={(o) => o.akun_id}
                  kosong="Tidak ada peserta pada saringan ini."
                  onBaris={setOrangBuka}
                  kolom={[
                    { id: "nama", label: "Nama", nilai: (o) => o.nama, sel: (o) => <Potong teks={o.nama} lebar="max-w-[7.5rem] sm:max-w-[10rem]" /> },
                    { id: "status", label: "Status", nilai: (o) => (o.macet ? "Macet" : LABEL_STATUS[o.status]) },
                    { id: "maju", label: "Kemajuan", nilai: (o) => o.kemajuan_pct, angka: true, sel: (o) => <Bilah pct={o.status === "selesai" ? 100 : o.kemajuan_pct} nada={o.macet ? "wait" : o.status === "selesai" ? "ok" : "mut"} /> },
                    { id: "soal", label: "Soal", nilai: (o) => o.soal_sekarang ?? "", angka: true, kanan: true },
                    { id: "lama", label: "Lama (mnt)", nilai: (o) => o.lama_menit ?? "", angka: true, kanan: true },
                    { id: "nilai", label: "Nilai", nilai: (o) => o.nilai ?? "", angka: true, kanan: true, sel: (o) => <span style={{ color: o.nilai === null ? WARNA.mut : o.lulus ? WARNA.ok : WARNA.bad }}>{fmt(o.nilai)}</span> },
                  ]}
                />
              </div>
              <div>
                <b className="text-[13.5px] text-[#0F2A52]">Soal paling banyak salah</b> <span className="text-[11.5px] text-[#6B7A90]">· Bahas = buka rincian soal</span>
                <Tabel
                  label="Soal paling banyak salah"
                  baris={p.soal.filter((s) => s.salah > 0).sort((a, b) => b.salah - a.salah)}
                  kunci={(s) => s.nomor}
                  kosong={p.ringkas.selesai ? "Belum ada soal yang salah." : "Belum ada yang selesai."}
                  kolom={[
                    { id: "no", label: "No", nilai: (s) => s.nomor, angka: true, kanan: true },
                    { id: "soal", label: "Soal", nilai: (s) => s.teks, sel: (s) => <Potong teks={s.teks} lebar="max-w-[7.5rem] sm:max-w-[11rem]" /> },
                    { id: "salah", label: "Salah", nilai: (s) => s.salah, angka: true, kanan: true },
                    { id: "keliru", label: "Pilihan keliru", nilai: (s) => (s.keliru_terbanyak ? `${s.keliru_terbanyak.kode} (${s.keliru_terbanyak.jumlah})` : "-") },
                    {
                      id: "bahas",
                      label: "Bahas",
                      nilai: () => "",
                      sel: (s) => (
                        <button type="button" onClick={() => setSoalBuka(s)} className="min-h-[32px] rounded-full bg-[#0F2A52] px-3 text-[12px] font-bold text-white">
                          Bahas
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
              <TabelIngat p={p} onBuka={(id) => setOrangBuka(p.orang.find((o) => o.akun_id === id) ?? null)} />
            </div>
          ) : (
            <Evaluasi p={p} orangTampil={orangTampil} ketuk={ketuk} saringStatus={saringStatus} rentang={rentang} setRentang={setRentang} semuaGerak={semuaGerak} setSemuaGerak={setSemuaGerak} onSoal={setSoalBuka} onOrang={setOrangBuka} />
          )}
          <details className="mt-3 rounded-lg bg-[#F5F8FC] px-3 py-1.5 text-[12px] text-[#3C4C68]">
            <summary className="min-h-[32px] cursor-pointer font-bold text-[#0F2A52]">Definisi angka</summary>
            <ul className="mb-1.5 list-disc space-y-0.5 pl-4">
              <li>{p.definisi.nilai}</li>
              <li>{p.definisi.lulus}</li>
              <li>{p.definisi.macet}</li>
              <li>{p.definisi.perlu_diperiksa}</li>
              <li>Yang tampil hanya peserta dalam cakupan Anda; persen soal dihitung dari mereka yang menjawab.</li>
            </ul>
          </details>
        </>
      )}
      {soalBuka && p && <RincianSoal s={soalBuka} orang={p.orang} onTutup={() => setSoalBuka(null)} />}
      {orangBuka && p && <RincianPeserta o={orangBuka} soal={p.soal} onTutup={() => setOrangBuka(null)} />}
    </Kartu>
  );
}

function TabelIngat({ p, onBuka }: { p: HasilPemahamanTes; onBuka: (id: number) => void }) {
  return (
    <div>
      <b className="text-[13.5px] text-[#0F2A52]">Perlu diingatkan ({p.perlu_diingatkan.length})</b>
      <Tabel
        label="Perlu diingatkan"
        baris={p.perlu_diingatkan}
        kunci={(x) => x.akun_id}
        kosong="Tidak ada yang perlu diingatkan."
        onBaris={(x) => onBuka(x.akun_id)}
        kolom={[
          { id: "nama", label: "Nama", nilai: (x) => x.nama, sel: (x) => <Potong teks={x.nama} lebar="max-w-[7.5rem] sm:max-w-[10rem]" /> },
          { id: "keadaan", label: "Keadaan", nilai: (x) => x.keadaan },
          { id: "saran", label: "Saran", nilai: (x) => x.saran },
        ]}
      />
    </div>
  );
}

function Evaluasi({
  p,
  orangTampil,
  ketuk,
  saringStatus,
  rentang,
  setRentang,
  semuaGerak,
  setSemuaGerak,
  onSoal,
  onOrang,
}: {
  p: HasilPemahamanTes;
  orangTampil: OrangTes[];
  ketuk: (s: OrangTes["status"] | "macet" | "lulus" | "belum_lulus") => void;
  saringStatus: string | null;
  rentang: string | null;
  setRentang: (r: string | null) => void;
  semuaGerak: boolean;
  setSemuaGerak: (b: boolean) => void;
  onSoal: (s: SoalTesHasil) => void;
  onOrang: (o: OrangTes) => void;
}) {
  const r = p.ringkas;
  const maksSebaran = Math.max(1, ...p.sebaran.map((s) => s.jumlah));
  const tim = useMemo(() => {
    const per = new Map<string, OrangTes[]>();
    for (const o of p.orang) per.set(o.tim ?? "Tanpa tim", [...(per.get(o.tim ?? "Tanpa tim") ?? []), o]);
    return [...per.entries()].map(([nama, xs]) => {
      const sel = xs.filter((o) => o.status === "selesai");
      const nilai = sel.map((o) => o.nilai).filter((x): x is number => x !== null);
      return { nama, peserta: xs.length, selesai: sel.length, lulus: sel.filter((o) => o.lulus).length, rata: nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 10) / 10 : null };
    });
  }, [p]);
  const gerak = useMemo(() => {
    const xs = p.orang.filter((o) => o.naik !== null).sort((a, b) => (b.naik ?? 0) - (a.naik ?? 0));
    if (semuaGerak || xs.length <= 30) return xs;
    return [...xs.slice(0, 15), ...xs.slice(-15)];
  }, [p, semuaGerak]);
  const jumlahGerak = p.orang.filter((o) => o.naik !== null).length;
  const banyakSoal = p.soal.length >= 40;
  const soalMatriks = useMemo(() => {
    const xs = banyakSoal ? p.soal.filter((s) => s.salah > 0) : [...p.soal];
    return banyakSoal ? xs.sort((a, b) => b.salah - a.salah) : xs;
  }, [p, banyakSoal]);
  const selesai = orangTampil.filter((o) => o.status === "selesai");
  const kecil = r.peserta < 10;
  return (
    <div className="space-y-3">
      <div className="grid auto-rows-fr grid-cols-2 gap-2 lg:grid-cols-4">
        <Angka label="Selesai" nilai={`${r.selesai}/${r.peserta}`} ket={kecil ? undefined : `${r.peserta ? Math.round((r.selesai / r.peserta) * 100) : 0}%`} nada="ok" aktif={saringStatus === "selesai"} onKlik={() => ketuk("selesai")} />
        <Angka label="Lulus" nilai={String(r.lulus)} ket={`batas ${p.nilai_lulus}${kecil ? "" : ` · ${r.selesai ? Math.round((r.lulus / r.selesai) * 100) : 0}% dari yang selesai`}`} nada="ok" aktif={saringStatus === "lulus"} onKlik={() => ketuk("lulus")} />
        <Angka label="Rata-rata nilai" nilai={fmt(r.rata)} ket="nilai percobaan pertama" />
        <Angka label="Belum lulus" nilai={String(r.belum_lulus)} nada={r.belum_lulus ? "bad" : "mut"} aktif={saringStatus === "belum_lulus"} onKlik={() => ketuk("belum_lulus")} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
          <b className="text-[13.5px] text-[#0F2A52]">Sebaran nilai</b> <span className="text-[11.5px] text-[#6B7A90]">· ketuk batang untuk menyaring</span>
          <div className="mt-2 space-y-1.5">
            {p.sebaran.map((s) => (
              <button key={s.label} type="button" disabled={s.jumlah === 0} aria-pressed={rentang === s.label} onClick={() => setRentang(rentang === s.label ? null : s.label)} className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12.5px] enabled:active:opacity-70 disabled:opacity-50 ${rentang === s.label ? "bg-[#EEF4FF]" : ""}`}>
                <span className="w-[86px] flex-none">{s.label}</span>
                <span className="h-[14px] flex-1 overflow-hidden rounded bg-[#EEF2F7]">
                  <span className="block h-full rounded" style={{ width: `${(s.jumlah / maksSebaran) * 100}%`, background: WARNA[s.nada] }} />
                </span>
                <b className="w-[28px] flex-none text-right tabular-nums">{s.jumlah}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
          <b className="text-[13.5px] text-[#0F2A52]">Per tim</b>
          <Tabel
            label="Per tim"
            baris={tim}
            kunci={(t) => t.nama}
            kosong="Belum ada tim."
            kolom={[
              { id: "tim", label: "Tim", nilai: (t) => t.nama, sel: (t) => <Potong teks={t.nama} lebar="max-w-[7.5rem] sm:max-w-[9rem]" /> },
              { id: "peserta", label: "Orang", nilai: (t) => t.peserta, angka: true, kanan: true },
              { id: "selesai", label: "Selesai", nilai: (t) => t.selesai, angka: true, kanan: true },
              { id: "lulus", label: "Lulus", nilai: (t) => t.lulus, angka: true, kanan: true },
              { id: "rata", label: "Rata", nilai: (t) => t.rata ?? "", angka: true, kanan: true, sel: (t) => fmt(t.rata) },
            ]}
          />
        </div>
      </div>

      {p.ada_pembanding && (
        <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
          <b className="text-[13.5px] text-[#0F2A52]">Pergerakan dari pretest</b>{" "}
          <span className="text-[11.5px] text-[#6B7A90]">· {jumlahGerak > 30 && !semuaGerak ? "15 teratas dan 15 terbawah" : `${jumlahGerak} orang`} · ketuk baris untuk rincian</span>
          <Tabel
            label="Pergerakan per orang"
            baris={gerak}
            kunci={(o) => o.akun_id}
            kosong="Belum ada yang mengerjakan pretest dan posttest."
            onBaris={onOrang}
            kolom={[
              { id: "nama", label: "Nama", nilai: (o) => o.nama, sel: (o) => <Potong teks={o.nama} lebar="max-w-[7.5rem] sm:max-w-[10rem]" /> },
              { id: "pre", label: "Pretest", nilai: (o) => o.pembanding ?? "", angka: true, kanan: true, sel: (o) => fmt(o.pembanding) },
              { id: "post", label: "Posttest", nilai: (o) => o.nilai ?? "", angka: true, kanan: true, sel: (o) => fmt(o.nilai) },
              { id: "naik", label: "Naik", nilai: (o) => o.naik ?? "", angka: true, kanan: true, sel: (o) => <b style={{ color: (o.naik ?? 0) > 0 ? WARNA.ok : (o.naik ?? 0) < 0 ? WARNA.bad : WARNA.mut }}>{(o.naik ?? 0) > 0 ? "+" : ""}{fmt(o.naik)}</b> },
            ]}
          />
          {jumlahGerak > 30 && (
            <button type="button" onClick={() => setSemuaGerak(!semuaGerak)} className="mt-1.5 min-h-[36px] text-[12.5px] font-bold text-[#1F5FD1]">
              {semuaGerak ? "Tampilkan 15 teratas dan terbawah" : `Lihat semua (${jumlahGerak})`}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
          <b className="text-[13.5px] text-[#0F2A52]">Soal paling banyak salah</b> <span className="text-[11.5px] text-[#6B7A90]">· ketuk baris untuk rincian</span>
          <Tabel
            label="Soal paling banyak salah (evaluasi)"
            baris={p.soal.filter((s) => s.salah > 0).sort((a, b) => b.salah - a.salah)}
            kunci={(s) => s.nomor}
            kosong={r.selesai ? "Belum ada soal yang salah." : "Belum ada yang selesai."}
            onBaris={onSoal}
            kolom={[
              { id: "no", label: "No", nilai: (s) => s.nomor, angka: true, kanan: true },
              { id: "soal", label: "Soal", nilai: (s) => s.teks, sel: (s) => <Potong teks={s.teks} lebar="max-w-[7.5rem] sm:max-w-[11rem]" /> },
              { id: "benar", label: "% benar", nilai: (s) => s.pct_benar ?? "", angka: true, kanan: true },
              { id: "kunci", label: "Kunci", nilai: (s) => s.kunci },
              { id: "keliru", label: "Keliru terbanyak", nilai: (s) => (s.keliru_terbanyak ? `${s.keliru_terbanyak.kode} (${s.keliru_terbanyak.jumlah})` : "-") },
              { id: "periksa", label: "Periksa", nilai: (s) => (s.perlu_diperiksa ? "Perlu diperiksa" : ""), sel: (s) => (s.perlu_diperiksa ? <b className="text-[#B42329]">Perlu diperiksa</b> : "") },
            ]}
          />
        </div>
        {p.topik.length > 0 && (
          <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
            <b className="text-[13.5px] text-[#0F2A52]">Topik terlemah</b>
            <Tabel
              label="Topik terlemah"
              baris={p.topik}
              kunci={(t) => t.topik}
              kosong="-"
              kolom={[
                { id: "topik", label: "Topik", nilai: (t) => t.topik, sel: (t) => <Potong teks={t.topik} lebar="max-w-[7.5rem] sm:max-w-[12rem]" /> },
                { id: "soal", label: "Soal", nilai: (t) => t.soal, angka: true, kanan: true },
                { id: "benar", label: "% benar", nilai: (t) => t.pct_benar ?? "", angka: true, kanan: true, sel: (t) => <b style={{ color: (t.pct_benar ?? 100) < 70 ? WARNA.bad : (t.pct_benar ?? 100) < 85 ? WARNA.wait : WARNA.ok }}>{t.pct_benar ?? "–"}</b> },
              ]}
            />
          </div>
        )}
      </div>

      {selesai.length > 0 && soalMatriks.length > 0 && (
        <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
          <b className="text-[13.5px] text-[#0F2A52]">Matriks soal × peserta</b>{" "}
          <span className="text-[11.5px] text-[#6B7A90]">· {banyakSoal ? "hanya soal yang ada salahnya, urut dari paling banyak salah" : "semua soal"} · huruf = pilihan keliru · ketuk sel untuk rincian soal</span>
          <div className="mt-1.5 max-h-[420px] overflow-auto" role="region" aria-label="Matriks soal x peserta" tabIndex={0}>
            <table className="border-collapse text-[11.5px]">
              <thead className="sticky top-0 z-[2] bg-[#F3F6FB]">
                <tr>
                  <th className="sticky left-0 z-[3] min-w-[8rem] bg-[#F3F6FB] px-2 py-1 text-left">Peserta</th>
                  {soalMatriks.map((s) => (
                    <th key={s.nomor} className="min-w-[28px] px-1 py-1 text-center">
                      <button type="button" onClick={() => onSoal(s)} className="font-bold text-[#1F5FD1]" aria-label={`Rincian soal ${s.nomor}`}>
                        {s.nomor}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selesai.map((o) => (
                  <tr key={o.akun_id} className="border-b border-[#EEF2F7]">
                    <th className="sticky left-0 z-[1] max-w-[10rem] truncate bg-white px-2 py-1 text-left font-semibold" title={o.nama}>
                      <button type="button" onClick={() => onOrang(o)} className="truncate text-left">
                        {o.nama}
                      </button>
                    </th>
                    {soalMatriks.map((s) => {
                      const j = o.jawaban[String(s.nomor)];
                      const ok = j === s.kunci;
                      return (
                        <td key={s.nomor} className="p-[1px] text-center">
                          <button type="button" onClick={() => onSoal(s)} className="h-[24px] w-[26px] rounded-[4px] font-bold" style={{ background: !j ? "#EEF2F7" : ok ? "#D7F0E3" : "#FADADB", color: ok ? WARNA.ok : WARNA.bad }} aria-label={`${o.nama} soal ${s.nomor}: ${!j ? "kosong" : ok ? "benar" : `salah, memilih ${j}`}`}>
                            {!j ? "·" : ok ? "✓" : j}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TabelIngat p={p} onBuka={(id) => { const o = p.orang.find((x) => x.akun_id === id); if (o) onOrang(o); }} />
    </div>
  );
}

// ---------------------------------------------------------------- Laporan (K6): satu sumber hitung yang sama; unduh Excel dan cetak / PDF
function Laporan({ p, k }: { p: HasilPemahamanTes; k: KonteksLaporan }) {
  const [galat, setGalat] = useState<string | null>(null);
  const html = useMemo(() => htmlLaporan(p, k), [p, k]);
  const namaBerkas = `Laporan_pemahaman_${k.tes}_${k.kegiatan}`.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 90);
  async function unduhExcel() {
    setGalat(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const l of lembarExcel(p, k)) {
        const ws = XLSX.utils.aoa_to_sheet(l.baris);
        ws["!cols"] = l.lebar.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, l.nama);
      }
      XLSX.writeFile(wb, `${namaBerkas}.xlsx`);
    } catch {
      setGalat("Berkas Excel belum dapat dibuat. Coba lagi.");
    }
  }
  function cetak() {
    const w = window.open("", "_blank");
    if (!w) return setGalat("Jendela cetak diblokir peramban. Izinkan pop-up untuk SIGAP lalu coba lagi.");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void unduhExcel()} className="min-h-[42px] rounded-xl border-2 border-[#0F2A52] bg-white px-4 text-[13px] font-extrabold text-[#0F2A52]">
          ⬇ Unduh Excel
        </button>
        <button type="button" onClick={cetak} className="min-h-[42px] rounded-xl bg-[#0F2A52] px-4 text-[13px] font-extrabold text-white">
          Cetak / PDF
        </button>
        <span className="self-center text-[11.5px] text-[#6B7A90]">PDF: pilih &quot;Simpan sebagai PDF&quot; di jendela cetak.</span>
      </div>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <div className="min-w-0 rounded-[12px] border border-[#DDE6F3] p-2.5">
        <b className="text-[13.5px] text-[#0F2A52]">Ringkasan otomatis</b>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-[#1B2B4B]">
          {ringkasanOtomatis(p).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 overflow-hidden rounded-[12px] border border-[#DDE6F3]">
        <p className="m-0 border-b border-[#DDE6F3] bg-[#F3F6FB] px-2.5 py-1.5 text-[12px] font-bold text-[#0F2A52]">Pratinjau lembar cetak</p>
        <iframe title="Pratinjau laporan pemahaman" srcDoc={html} className="block h-[640px] w-full bg-white" sandbox="" />
      </div>
    </div>
  );
}
