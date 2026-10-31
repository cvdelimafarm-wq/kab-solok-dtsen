"use client";

// app/sigap/spdt/QcSpdt.tsx
//
// (29 Okt 2026) Tab "QC" untuk Supervisor SPDT NTP (BACA SAJA). Tampilan di dalamnya:
//  - Tim: hasil per PML (PPL yang KK-nya di dua PML tampil di kedua PML) + soal yang paling sering salah.
//  - Petugas: daftar semua peserta dengan jumlah percobaan dan pergerakan nilai (P1 → Pn); penyaring peran/status/PML/nama. Status modal/push tidak ditampilkan.
//  - Matriks: baris = soal, kolom = petugas (sama dengan Hasil QC di Lembar Supervisi Pasca Bencana).
//  - Infografis: infografis hasil QC + tabel yang sama dengan Kelola Pendataan (InfografisQc, TabelQc); ketuk batang = tabel tersaring.
//    (31 Okt 2026) Menggantikan tampilan "Monitoring" (modal wajib dan push) yang tidak dipakai Supervisor. Periode: per tanggal, rentang tanggal, semua periode (seperti Kelola).
// (31 Okt 2026) Disamakan dan dipadatkan dengan tab QC Pasca Bencana (app/portal/qc/QcBersama.tsx):
//  - kartu ringkasan = saringan: "Sudah mengisi" -> tampilkan yang belum mengisi, "Lulus" -> tampilkan yang belum lulus (lib/sigapQcSaring.ts); berlaku di Tim, Petugas, Matriks;
//  - chip "Semua / Belum mengisi / Belum lulus" dan opsi status yang sama di daftar Petugas dihapus (duplikat kartu);
//  - rincian petugas dan soal dibuka di lembar bawah (satu baris per orang), Back HP menutupnya.
// Data: /api/portal/spdt-qc. Aturan penyaringan/penyusunan ada di lib/sigapQcMonitor.ts (diuji). Warna selalu disertai teks.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { labelStatusPpl, type QcRekapTim } from "@/lib/sigapQc";
import { bacaPmlSendiri, saringPetugas, type HitunganPeran, type PetugasQc, type SaringPetugas } from "@/lib/sigapQcMonitor";
import { API_SPDT_QC, jamWib, judulKata, type HasilQcSpdt } from "@/lib/spdtNtp";
import { SARINGAN_AWAL, susunHasil, type HasilQc } from "@/lib/korwilHasilQc";
import { LABEL_KARTU, ketukKartu, lolosKartuPetugas, type KartuQc } from "@/lib/sigapQcSaring";
import Ik from "./Ik";
import InfografisQc from "@/app/sigap/kelola/pendataan/InfografisQc";
import TabelQc from "@/app/sigap/kelola/pendataan/TabelQc";
import RekapRentangQc from "@/app/sigap/kelola/pendataan/RekapRentangQc";
import RekapSemuaQc from "@/app/sigap/kelola/pendataan/RekapSemuaQc";
import PeriodeQc, { hariIniWib, type ModePeriode, type Rentang } from "@/app/sigap/kelola/pendataan/PeriodeQc";
import { jumlahKolomNilai, susunBarisQc, type BarisQc, type FokusQc } from "@/lib/sigapQcTabel";
import { Pergerakan } from "@/app/sigap/kelola/pendataan/BatangQc";
import { rentangTerakhir } from "@/lib/sigapQcRentang";
import { IsiRincianQc } from "@/app/portal/qc/RincianQc";
import { BarisSaring, IsiSoal, KartuSaring, LembarBawah, MatriksQc } from "@/app/portal/qc/QcBersama";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
function tglPendek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const h = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[h]}, ${d} ${BULAN[m - 1]}`;
}

type Lihat = "infografis" | "tim" | "petugas" | "matriks";
const LABEL_LIHAT: Record<Lihat, string> = { infografis: "Infografis", tim: "Tim", petugas: "Petugas", matriks: "Matriks" };
type Lembar = { jenis: "petugas"; akun: number } | { jenis: "soal"; soal: string; akun: number | null };
const SELECT = "h-10 min-w-0 flex-1 rounded-[10px] border border-[#DCE5F2] bg-white px-2 text-[12.5px] font-semibold text-[#0F2A52] outline-none";
const CHIP_ON = "border-[#1F5FD1] bg-[#1F5FD1] text-white";
const CHIP_OFF = "border-[#C9D6EC] bg-white text-[#0F2A52]";
const BARIS = "flex min-h-[44px] w-full items-center gap-2 px-3 text-left";

// "Belum mengisi" / "Belum lulus" sudah menjadi kartu di atas, jadi tidak diulang di sini (hemat satu pilihan, tidak ada dua jalan ke hasil yang sama).
const STATUS_OPSI: [SaringPetugas["status"], string][] = [
  ["semua", "Semua status"],
  ["lulus", "Lulus"],
];

/** "PML 2/15 · PPL 0/40": angka dipisah per peran supaya tidak tercampur. */
function Rinci({ pml, ppl, ambil }: { pml: HitunganPeran; ppl: HitunganPeran; ambil: (h: HitunganPeran) => number }) {
  return (
    <span className="tabular-nums">
      PML {ambil(pml)}/{pml.peserta} · PPL {ambil(ppl)}/{ppl.peserta}
    </span>
  );
}

const warnaStatus = (percobaan: number, lulus: boolean) => (percobaan === 0 ? "text-[#B42329]" : lulus ? "text-[#13794B]" : "text-[#8A4B08]");

export default function QcSpdt({ aktif }: { aktif: boolean }) {
  const [d, setD] = useState<HasilQcSpdt | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState<string | null>(null);
  const [lihat, setLihat] = useState<Lihat>("infografis");
  const [mode, setMode] = useState<ModePeriode>("hari");
  const [rentangPilih, setRentangPilih] = useState<Rentang | null>(null);
  const [fokus, setFokusState] = useState<FokusQc | null>(null);
  const [kartu, setKartu] = useState<KartuQc | null>(null);
  const [f, setF] = useState<SaringPetugas>({ peran: "semua", status: "semua", pml: "semua", cari: "" });
  const [muatUlang, setMuatUlang] = useState(false);
  const [hanyaSalah, setHanyaSalah] = useState(true);
  const [lembar, setLembar] = useState<Lembar | null>(null);

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

  const kolomQc = useMemo(() => jumlahKolomNilai(d?.maks_percobaan ?? 4, d?.rincian), [d]);
  const barisQc = useMemo(() => (d ? susunBarisQc(d.rekap, d.rincian, kolomQc) : []), [d, kolomQc]);
  // kartu ringkasan (belum mengisi / belum lulus) juga menyaring tabel di tampilan Infografis; batang infografis tetap menghitung semua petugas
  const barisPeta = useMemo(() => new Map(barisQc.map((b) => [b.akun_id, b])), [barisQc]);
  const barisTabel = useMemo(() => barisQc.filter((b) => lolosKartuPetugas(kartu, b)), [barisQc, kartu]);
  // ketuk batang infografis = tabel di bawahnya tersaring ke orang-orang itu, lalu layar bergulir ke tabel
  const setFokus = useCallback((f: FokusQc | null) => {
    setFokusState(f);
    if (f) setTimeout(() => document.getElementById("tabel-qc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);
  const tutup = useCallback(() => setLembar(null), []);
  const ketuk = useCallback((k: KartuQc) => setKartu((s) => ketukKartu(s, k)), []);
  const peta = useMemo(() => new Map((d?.petugas ?? []).map((p) => [p.akun_id, p])), [d]);
  const lolos = useCallback((x: { percobaan: number; lulus: boolean }) => lolosKartuPetugas(kartu, x), [kartu]);

  const tim = useMemo(() => {
    if (!d) return [];
    return d.rekap
      .map((t) => {
        const ps = bacaPmlSendiri(t.pml_sendiri);
        return { ...t, ppl: t.ppl.filter(lolos), pmlTampil: kartu === null || lolos({ percobaan: ps?.percobaan ?? 0, lulus: !!ps?.lulus }) };
      })
      .filter((t) => kartu === null || t.ppl.length > 0 || (t.pml_akun_id != null && t.pmlTampil));
  }, [d, kartu, lolos]);
  const daftarPml = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of d?.petugas ?? []) {
      if (p.peran === "pml") m.set(p.akun_id, p.nama);
      else if (p.pml_akun_id != null && p.pml_nama) m.set(p.pml_akun_id, p.pml_nama);
    }
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "id"));
  }, [d]);
  const petugas = useMemo(() => (d ? saringPetugas(d.petugas, f).filter(lolos) : []), [d, f, lolos]);

  // Matriks: bahan mentah hari itu disusun oleh penyusun yang sama dengan Pasca Bencana; kartu menyaring KOLOM (petugas).
  const hasilMat = useMemo<HasilQc | null>(() => {
    if (!d?.mentah) return null;
    const h = susunHasil(d.mentah.anggota, d.mentah.percobaan, d.mentah.soal, { ...SARINGAN_AWAL, mode: "pertama" });
    if (kartu === null) return h;
    const ok = (p: { akun_id: number }) => {
      const x = peta.get(p.akun_id);
      return x ? lolos(x) : false;
    };
    return { ...h, tim: h.tim.map((t) => ({ ...t, petugas: t.petugas.filter(ok) })).filter((t) => t.petugas.length > 0), matriks: { ...h.matriks, kolom: h.matriks.kolom.filter(ok) } };
  }, [d, kartu, peta, lolos]);
  const barisSemua = useMemo(() => (d?.mentah ? susunHasil(d.mentah.anggota, d.mentah.percobaan, d.mentah.soal, SARINGAN_AWAL) : null), [d]);

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
  const hariIni = d.hari_berlaku ?? hariIniWib(d.sekarang);
  const rentang = rentangPilih ?? rentangTerakhir(hariIni, 7);
  const bukaHariDari = (t: string) => {
    setTanggal(t);
    setMode("hari");
  };
  const m = d.monitoring;
  const belum = m.peserta - m.sudah_mengisi;
  const pm = m.per_peran.pml;
  const pp = m.per_peran.ppl;
  const adaSaringAtas = f.peran !== "semua" || f.status !== "semua" || f.pml !== "semua" || f.cari !== "";
  const jumlahTampil = lihat === "infografis" ? barisTabel.length : lihat === "petugas" ? petugas.length : lihat === "matriks" ? (hasilMat?.matriks.kolom.length ?? 0) : tim.reduce((a, t) => a + t.ppl.length + (t.pml_akun_id != null && t.pmlTampil ? 1 : 0), 0);
  const kolomLembar = barisSemua?.matriks.kolom ?? [];
  const barisSoal = lembar?.jenis === "soal" && barisSemua ? barisSemua.matriks.baris.find((b) => b.soal.id === lembar.soal) ?? null : null;
  const namaLembar = lembar ? judulKata(peta.get(lembar.akun ?? -1)?.nama ?? kolomLembar.find((p) => p.akun_id === lembar.akun)?.nama ?? "") : "";
  const bukaSoal = barisSemua ? (soal: string) => setLembar({ jenis: "soal", soal, akun: null }) : null;

  return (
    <section className="flex flex-col gap-2 px-2.5 pb-24 pt-2">
      {hariPilih.length === 0 ? (
        <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">{d.aktif ? "Belum ada soal QC yang dirilis." : "QC Pemahaman SPDT NTP belum diaktifkan."}</p>
      ) : (
        <>
          {mode === "hari" ? (
            <div className="-mx-2.5 flex gap-1.5 overflow-x-auto px-2.5 pb-0.5" role="tablist" aria-label="Pilih hari QC">
              {hariPilih.map((t) => (
                <button key={t} type="button" role="tab" aria-selected={d.hari === t} onClick={() => setTanggal(t)} className={`h-9 flex-none whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${d.hari === t ? CHIP_ON : CHIP_OFF}`}>
                  {tglPendek(t)}
                  {t === d.hari_berlaku ? " · hari ini" : ""}
                </button>
              ))}
              <button type="button" onClick={() => setMode("rentang")} className="h-9 flex-none whitespace-nowrap rounded-full border-[1.5px] border-dashed border-[#1F5FD1] bg-white px-3 text-[12.5px] font-bold text-[#1F5FD1]">
                Rentang tanggal
              </button>
              <button type="button" onClick={() => setMode("semua")} className="h-9 flex-none whitespace-nowrap rounded-full border-[1.5px] border-dashed border-[#1F5FD1] bg-white px-3 text-[12.5px] font-bold text-[#1F5FD1]">
                Semua periode
              </button>
            </div>
          ) : (
            <PeriodeQc mode={mode} onMode={setMode} hari={d.hari} hariAda={d.hari_ada} hariBerlaku={d.hari_berlaku} sekarang={d.sekarang} sibuk={muatUlang} onHari={(t) => setTanggal(t)} rentang={rentang} onRentang={setRentangPilih} />
          )}
          {mode === "rentang" && <RekapRentangQc kegiatanId={d.kegiatan_id} api={API_SPDT_QC} rentang={rentang} onBukaHari={bukaHariDari} />}
          {mode === "semua" && <RekapSemuaQc kegiatanId={d.kegiatan_id} api={API_SPDT_QC} onBukaHari={bukaHariDari} />}
          {mode === "hari" && (
            <>
          <KartuSaring
            item={[
              { kunci: "isi", angka: `${m.sudah_mengisi}/${m.peserta}`, label: "Sudah mengisi", sub: <Rinci pml={pm} ppl={pp} ambil={(h) => h.sudah_mengisi} />, aktif: kartu === "belum_mengisi", petunjuk: "Ketuk untuk menampilkan yang belum mengisi.", onKlik: () => ketuk("belum_mengisi") },
              { kunci: "lulus", angka: String(m.lulus), label: d.nilai_lulus >= 100 ? "Lulus (nilai 100)" : `Lulus (≥ ${d.nilai_lulus})`, sub: <Rinci pml={pm} ppl={pp} ambil={(h) => h.lulus} />, aktif: kartu === "belum_lulus", petunjuk: "Ketuk untuk menampilkan yang belum lulus.", onKlik: () => ketuk("belum_lulus") },
              { kunci: "belum", angka: String(belum), label: "Belum mengisi", peringatan: belum > 0, sub: <Rinci pml={pm} ppl={pp} ambil={(h) => h.peserta - h.sudah_mengisi} />, aktif: kartu === "belum_mengisi", petunjuk: "Ketuk untuk menampilkan yang belum mengisi.", onKlik: () => ketuk("belum_mengisi") },
            ]}
          />
          {kartu && <BarisSaring teks={LABEL_KARTU[kartu]} jumlah={jumlahTampil} onLepas={() => setKartu(null)} />}

          <div role="tablist" aria-label="Tampilan QC" className="flex gap-[3px] rounded-[12px] bg-[#E3EAF6] p-[3px]">
            {(Object.keys(LABEL_LIHAT) as Lihat[])
              .filter((k) => k !== "matriks" || d.mentah)
              .map((k) => (
                <button key={k} type="button" role="tab" aria-selected={lihat === k} onClick={() => setLihat(k)} className={`grid h-9 flex-1 place-items-center rounded-[9px] text-[12.5px] font-bold ${lihat === k ? "bg-white text-[#0F2A52]" : "text-[#44546F]"}`}>
                  {LABEL_LIHAT[k]}
                </button>
              ))}
          </div>
          <div className="-mt-0.5 flex items-center justify-between gap-2 px-1">
            <p className="min-w-0 text-[11.5px] leading-tight text-[#6B7A90]">
              {d.hari ? `${tglPendek(d.hari)} · ${d.jumlah_soal} soal` : "Belum ada hari QC"}
              {d.rilis_at && ` · rilis ${jamWib(d.rilis_at)}`} · diperbarui {jamWib(d.sekarang)} WIB
            </p>
            <button type="button" onClick={() => void muat(tanggal)} aria-label="Muat ulang hasil QC" className="grid h-9 w-9 flex-none place-items-center rounded-full text-[#1F5FD1] active:bg-[#E3EAF6]">
              <Ik n="segar" className={`h-[17px] w-[17px] ${muatUlang ? "animate-spin" : ""}`} />
            </button>
          </div>
          {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
          {d.hari === d.hari_berlaku && !d.hari_berlaku_terbentuk && (
            <p className="rounded-[14px] border-l-4 border-[#E3A33B] bg-[#FFF9ED] px-3 py-2 text-[12.5px] leading-snug text-[#6B4410]">
              Soal hari ini belum diundi. Soal terbentuk otomatis ketika penjadwal berjalan atau petugas pertama membuka soal.
            </p>
          )}

          {lihat === "tim" && (
            <>
              {tim.length === 0 && <p className="rounded-[16px] bg-white px-4 py-6 text-center text-[13.5px] text-[#55657D]">{d.rekap.length === 0 ? "Belum ada soal yang dirilis pada hari ini." : "Tidak ada petugas yang cocok dengan penyaring ini."}</p>}
              {tim.map((t) => (
                <div key={t.pml_akun_id} className="overflow-hidden rounded-[14px] border border-[#D9E2F1] bg-white">
                  <div className="flex items-center justify-between gap-2 bg-[#F5F8FE] px-3 py-1.5">
                    <b className="min-w-0 truncate text-[13.5px] text-[#0F2A52]">{t.pml_akun_id === 0 ? "PPL tanpa PML" : `Tim ${judulKata(t.pml_nama)}`}</b>
                    <span className="flex-none text-[11.5px] font-semibold text-[#55657D]">
                      {t.sudah}/{t.jumlah_ppl} mengisi · rata-rata awal {t.rata_awal ?? "-"}
                    </span>
                  </div>
                  <ul className="divide-y divide-[#EEF2F7]">
                    {t.pml_akun_id != null && t.pmlTampil && (
                      <li>
                        {(() => {
                          const ps = bacaPmlSendiri(t.pml_sendiri);
                          const sudah = !!ps && ps.percobaan > 0;
                          return (
                            <button type="button" disabled={!sudah} onClick={() => setLembar({ jenis: "petugas", akun: t.pml_akun_id as number })} className={`${BARIS} disabled:cursor-default`}>
                              <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${sudah ? "text-[#1F5FD1]" : "text-[#0F2A52]"}`}>
                                {judulKata(t.pml_nama)} <span className="text-[10.5px] font-extrabold text-[#6B7A90]">PML</span>
                              </span>
                              <span className={`flex-none text-right text-[12px] font-semibold ${warnaStatus(ps?.percobaan ?? 0, !!ps?.lulus)}`}>{sudah ? labelStatusPpl(ps, d.maks_percobaan, d.nilai_lulus) : "Belum mengisi"}</span>
                              {sudah && <span aria-hidden className="flex-none text-[11px] text-[#6B7A90]">›</span>}
                            </button>
                          );
                        })()}
                      </li>
                    )}
                    {t.ppl.map((x) => (
                      <li key={`${t.pml_akun_id}-${x.akun_id}`}>
                        <button type="button" disabled={x.percobaan === 0} onClick={() => setLembar({ jenis: "petugas", akun: x.akun_id })} className={`${BARIS} disabled:cursor-default`}>
                          <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${x.percobaan > 0 ? "text-[#1F5FD1]" : "text-[#0F2A52]"}`}>
                            {judulKata(x.nama)} <span className="text-[10.5px] font-extrabold text-[#6B7A90]">PPL</span>
                          </span>
                          <span className={`flex-none text-right text-[12px] font-semibold ${warnaStatus(x.percobaan, x.lulus)}`}>
                            {x.terlambat ? "Terlambat · " : ""}
                            {labelStatusPpl(x, d.maks_percobaan, d.nilai_lulus)}
                          </span>
                          {x.percobaan > 0 && <span aria-hidden className="flex-none text-[11px] text-[#6B7A90]">›</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {t.salah.length > 0 && (
                    <details className="border-t border-[#EEF2F7]">
                      <summary className="flex min-h-[40px] cursor-pointer list-none items-center px-3 text-[12.5px] font-bold text-[#B42329]">Soal yang dijawab salah, percobaan pertama ({t.salah.length}) ▾</summary>
                      <ul className="divide-y divide-[#F3E3E1] bg-[#FFF8F7]">
                        {[...t.salah]
                          .sort((a, b) => b.jumlah - a.jumlah)
                          .map((s) => (
                            <li key={s.soal_id}>
                              <button type="button" disabled={!bukaSoal || !barisSemua?.matriks.baris.some((b) => b.soal.id === s.soal_id)} onClick={() => bukaSoal?.(s.soal_id)} className={`${BARIS} !min-h-[40px] py-1 disabled:cursor-default`}>
                                <span className="flex-none rounded-full bg-[#FDE8E8] px-2 py-0.5 text-[11px] font-extrabold text-[#B42329]">{s.jumlah}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12.5px] font-semibold text-[#1B2B4B]">{s.pertanyaan}</span>
                                  <span className="block truncate text-[11px] text-[#55657D]">{s.nama.map(judulKata).join(", ")}</span>
                                </span>
                              </button>
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
                <select aria-label="Peran" value={f.peran} onChange={(e) => setF({ ...f, peran: e.target.value as SaringPetugas["peran"] })} className={SELECT}>
                  <option value="semua">PML &amp; PPL</option>
                  <option value="pml">Hanya PML</option>
                  <option value="ppl">Hanya PPL</option>
                </select>
                <select aria-label="Tim PML" value={f.pml === "semua" ? "" : String(f.pml)} onChange={(e) => setF({ ...f, pml: e.target.value ? Number(e.target.value) : "semua" })} className={SELECT}>
                  <option value="">Semua tim</option>
                  {daftarPml.map(([id, nama]) => (
                    <option key={id} value={id}>
                      {judulKata(nama)}
                    </option>
                  ))}
                </select>
                <select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SaringPetugas["status"] })} className={SELECT}>
                  {STATUS_OPSI.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="search" aria-label="Cari nama" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} placeholder="Cari nama…" className={`${SELECT} placeholder:font-normal placeholder:text-[#8A97AB]`} />
                <span className="flex-none text-[12px] font-semibold tabular-nums text-[#55657D]">
                  {petugas.length}/{d.petugas.length}
                </span>
                {adaSaringAtas && (
                  <button type="button" onClick={() => setF({ peran: "semua", status: "semua", pml: "semua", cari: "" })} className="min-h-[40px] flex-none px-1 text-[12px] font-bold text-[#1F5FD1]">
                    Hapus
                  </button>
                )}
              </div>
              {petugas.length === 0 && <p className="rounded-[16px] bg-white px-4 py-6 text-center text-[13.5px] text-[#55657D]">Tidak ada petugas yang cocok dengan penyaring ini.</p>}
              <ul className="divide-y divide-[#EEF2F7] overflow-hidden rounded-[14px] border border-[#D9E2F1] bg-white">
                {petugas.map((p) => (
                  <BarisPetugas key={p.akun_id} p={p} d={d} baris={barisPeta.get(p.akun_id)} onBuka={() => setLembar({ jenis: "petugas", akun: p.akun_id })} />
                ))}
              </ul>
            </>
          )}

          {lihat === "matriks" && hasilMat && (
            <>
              {hasilMat.ringkas.terjawab === 0 ? (
                <p className="rounded-[16px] bg-white px-4 py-6 text-center text-[13.5px] text-[#55657D]">Belum ada jawaban pada hari ini.</p>
              ) : (
                <MatriksQc
                  hasil={hasilMat}
                  hanyaSalah={hanyaSalah}
                  onHanyaSalah={setHanyaSalah}
                  aktif={lembar?.jenis === "soal" ? { soal: lembar.soal, akun: lembar.akun } : null}
                  onSoal={(soal) => setLembar({ jenis: "soal", soal, akun: null })}
                  onSel={(soal, akun) => setLembar({ jenis: "soal", soal, akun })}
                  onKolom={(akun) => setLembar({ jenis: "petugas", akun })}
                />
              )}
              <p className="px-1 text-[11px] text-[#6B7A90]">Matriks memakai percobaan pertama tiap petugas pada hari ini.</p>
            </>
          )}

          {lihat === "infografis" && (
            <>
              {d.rekap.length === 0 ? (
                <p className="rounded-[16px] bg-white px-4 py-6 text-center text-[13.5px] text-[#55657D]">Belum ada soal yang dirilis pada hari ini.</p>
              ) : (
                <>
                  <InfografisQc baris={barisQc} rekap={d.rekap} rincian={d.rincian} nilaiLulus={d.nilai_lulus} kolom={kolomQc} onFokus={setFokus} />
                  <TabelQc baris={barisTabel} kolom={kolomQc} rincian={d.rincian} nilaiLulus={d.nilai_lulus} fokus={fokus} onHapusFokus={() => setFokusState(null)} />
                </>
              )}
            </>
          )}
            </>
          )}
          <p className="px-1 text-[11.5px] leading-snug text-[#6B7A90]">Tampilan ini hanya untuk melihat hasil. Soal dan jadwal QC diatur di Kelola Pendataan (QC Pemahaman).</p>
        </>
      )}

      {lembar?.jenis === "petugas" && (
        <LembarBawah judul={`Rincian ${namaLembar || "petugas"}`} onTutup={tutup}>
          <IsiRincianQc akunId={lembar.akun} rincian={d.rincian} />
        </LembarBawah>
      )}
      {barisSoal && barisSemua && (
        <LembarBawah judul={`Soal ${barisSoal.soal.id}${lembar?.jenis === "soal" && lembar.akun != null ? ` · ${namaLembar}` : ""}`} onTutup={tutup}>
          <IsiSoal baris={barisSoal} kolom={kolomLembar} sorotAkun={lembar?.jenis === "soal" ? lembar.akun : null} />
        </LembarBawah>
      )}
    </section>
  );
}

/**
 * Satu baris per petugas: nama + status, lalu jumlah percobaan dan PERGERAKAN NILAI (P1 → P2 …, batang mini, selisih). Status modal/push tidak ditampilkan
 * (tidak dipakai Supervisor di HP). Rincian soal yang salah dibuka di lembar bawah.
 */
function BarisPetugas({ p, d, baris, onBuka }: { p: PetugasQc; d: HasilQcSpdt; baris: BarisQc | undefined; onBuka: () => void }) {
  const status = p.percobaan === 0 ? "Belum mengisi" : labelStatusPpl({ percobaan: p.percobaan, lulus: p.lulus, skor_terbaik: p.skor_terbaik }, d.maks_percobaan, d.nilai_lulus);
  const peran = p.peran === "pml" ? "PML" : "PPL";
  const nilai = baris?.nilai ?? (p.skor_awal != null ? [p.skor_awal, ...(p.percobaan > 1 && p.skor_terbaik != null ? [p.skor_terbaik] : [])] : []);
  const rantai = nilai.filter((n): n is number => n != null);
  return (
    <li>
      <button type="button" onClick={onBuka} className="flex min-h-[56px] w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13px] text-[#0F2A52]">
            {judulKata(p.nama)} <span className="text-[10.5px] font-extrabold text-[#6B7A90]">{peran}</span>
            {p.peran === "ppl" && <span className="ml-1 text-[11px] font-normal text-[#6B7A90]">{p.pml_nama ? `· ${judulKata(p.pml_nama)}` : "· tanpa PML"}</span>}
          </b>
          <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[#55657D]">
            <span className="flex-none tabular-nums">
              <b className="text-[#0F2A52]">{p.percobaan}×</b> mencoba
            </span>
            {rantai.length > 0 && (
              <>
                <span className="min-w-0 truncate font-semibold tabular-nums text-[#0F2A52]">{rantai.join(" → ")}</span>
                {rantai.length > 1 && <Pergerakan nilai={nilai} nilaiLulus={d.nilai_lulus} />}
              </>
            )}
          </span>
        </span>
        <span className={`flex-none text-right text-[12px] font-semibold ${warnaStatus(p.percobaan, p.lulus)}`}>
          {p.terlambat ? "Terlambat · " : ""}
          {status}
        </span>
        <span aria-hidden className="flex-none text-[11px] text-[#6B7A90]">›</span>
      </button>
    </li>
  );
}
