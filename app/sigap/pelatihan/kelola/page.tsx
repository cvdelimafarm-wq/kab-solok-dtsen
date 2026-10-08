"use client";

// app/sigap/pelatihan/kelola/page.tsx
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan -- tab "Soal & Jadwal" (unduh template Excel, unggah soal, atur jadwal
// buka/durasi/tutup) dan tab "Monitoring" (statistik, per peserta, analisis per soal, ekspor Excel; segar tiap
// 10 detik; sub-tab Presensi & Transport Lokal ada di ./kehadiran.tsx). Izin menu `pelatihan.kelola`: lihat = monitoring, kelola = soal & jadwal. Mockup disetujui user.
// (8 Okt 2026) Tab "Administrasi" (./administrasi.tsx): SPJ translok per kelas, daftar hadir & laporan; izin menu `pelatihan.administrasi`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAFTAR_JENIS_TES, HEADER_TEMPLATE, LABEL_JENIS_TES, MAKS_SOAL, PETUNJUK_TEMPLATE, bacaBarisSoal, barisTemplate, type JenisTes, type SoalLengkap } from "@/lib/sigapTes";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import { formatSisa, useJamServer } from "../komponen";
import Administrasi from "./administrasi";
import KuisLive from "./kuis";
import { MonitoringAkses, MonitoringPresensi, MonitoringTranslok, PengaturanPresensiKartu } from "./kehadiran";
import { PanelSkemaNilai, SkemaNilaiMandiri, useSkemaNilai } from "./skemaNilai";
import { LABEL_DASAR_KUIS, SKEMA_BAWAAN as SKEMA_BAWAAN_KLIEN, hitungAkhir, ringkasSkema, type HasilAkhir } from "@/lib/sigapNilaiHitung";
import { BarFilterMonitoring, OPSI_JENIS, OPSI_KELAS, OPSI_PERAN, ThKontrol, lolosDasar, sortKolom, urutkan, useFilterMon, type Opsi } from "./monitorKit";

type TesRingkas = { id: number; jenis: JenisTes; judul: string; buka_at: string; tutup_at: string; durasi_menit: number; aktif: boolean; jumlah_soal: number; jumlah_sesi: number };
type Ringkas = { nama: string; sekarang: string; boleh_kelola: boolean; tes: TesRingkas[] };

type StatusPes = "belum_mulai" | "mengerjakan" | "selesai" | "terlewat" | "soal_belum_ada" | "nonaktif" | "belum_buka" | "buka";
type CelTes = { status: StatusPes; mulai_at: string | null; selesai_at: string | null; batas_at: string | null; terjawab: number; skor: number | null; benar: number | null; total: number | null; jawab?: Record<string, string> | null };
type Peserta = { akun_id: number; nama: string; jenis_akun: string; peran: string; kelas: number | null; tes: Partial<Record<JenisTes, CelTes>> };
type Stat = { peserta: number; sudah_mulai: number; mengerjakan: number; selesai: number; belum_mulai: number; rata_skor: number | null; tertinggi: number | null; terendah: number | null };
type Analisis = { nomor: number; teks: string; kunci: string; bobot: number; menjawab: number; benar: number; persen_benar: number | null; sebaran: Record<string, number> };
type Monitor = { sekarang: string; tes: TesRingkas[]; peserta: Peserta[]; statistik: Partial<Record<JenisTes, Stat>>; analisis: Partial<Record<JenisTes, Analisis[]>> };

const URL_ADMIN = "/api/sigap/pelatihan/admin";
const pad = (n: number) => String(n).padStart(2, "0");
/** ISO -> "YYYY-MM-DDTHH:mm" waktu WIB (nilai input datetime-local). */
const keInputWib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
/** "YYYY-MM-DDTHH:mm" (WIB) -> epoch ms. */
const dariInputWib = (s: string) => new Date(`${s}:00+07:00`).getTime();
const tambahMenit = (s: string, m: number) => keInputWib(new Date(dariInputWib(s) + m * 60_000).toISOString());

type TabK = "soal" | "monitoring" | "kuis" | "administrasi";

export default function KelolaPelatihan() {
  const [tab, setTab] = useState<TabK>("soal");
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      setRingkas(await fetchJson<Ringkas>(`${URL_ADMIN}?bagian=ringkas`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    muat();
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "monitoring" || t === "kuis" || t === "administrasi") setTab(t);
    } catch {
      /* abaikan */
    }
  }, [muat]);

  return (
    <Bingkai<TabK>
      aktif="pelatihan_kelola"
      kecil="SIGAP · Kelola Pelatihan"
      jejak={["Pelatihan", "Kelola"]}
      judul="Kelola Pelatihan"
      sub="Soal, jadwal, kuis live & monitoring · Pelatihan PSP Pascabencana 2026"
      tab={[
        { kode: "soal", label: "Soal & Jadwal" },
        { kode: "kuis", label: "🎮 Adu Sigap" },
        { kode: "monitoring", label: "Monitoring" },
        { kode: "administrasi", label: "🗂 Administrasi" },
      ]}
      aktifTab={tab}
      onTab={setTab}
    >
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!ringkas && !galat && <Memuat />}
      {ringkas && tab === "soal" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {DAFTAR_JENIS_TES.map((j) => {
            const t = ringkas.tes.find((x) => x.jenis === j);
            return t ? <KartuSoal key={j} tes={t} bisaKelola={ringkas.boleh_kelola} setelahSimpan={muat} /> : null;
          })}
          <div className="lg:col-span-2">
            <SkemaNilaiMandiri asal="soal" />
          </div>
          <div className="lg:col-span-2">
            <PengaturanPresensiKartu />
          </div>
        </div>
      )}
      {ringkas && tab === "kuis" && <KuisLive bisaKelolaAwal={ringkas.boleh_kelola} />}
      {ringkas && tab === "monitoring" && <MonitoringBagian />}
      {ringkas && tab === "administrasi" && <Administrasi />}
    </Bingkai>
  );
}

// ======================================================================
// Soal & Jadwal
// ======================================================================
function KartuSoal({ tes, bisaKelola, setelahSimpan }: { tes: TesRingkas; bisaKelola: boolean; setelahSimpan: () => void }) {
  const label = LABEL_JENIS_TES[tes.jenis];
  const [buka, setBuka] = useState(keInputWib(tes.buka_at));
  const [durasi, setDurasi] = useState(String(tes.durasi_menit));
  const [tutup, setTutup] = useState(keInputWib(tes.tutup_at));
  const [aktif, setAktif] = useState(tes.aktif);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pratinjau, setPratinjau] = useState<{ soal: SoalLengkap[]; galat: string[]; nama: string } | null>(null);
  const [tersimpan, setTersimpan] = useState<SoalLengkap[] | null>(null);
  const [lihat, setLihat] = useState(false);
  const berkas = useRef<HTMLInputElement>(null);

  const kunciJadwal = `${tes.buka_at}|${tes.tutup_at}|${tes.durasi_menit}|${tes.aktif}`;
  useEffect(() => {
    setBuka(keInputWib(tes.buka_at));
    setTutup(keInputWib(tes.tutup_at));
    setDurasi(String(tes.durasi_menit));
    setAktif(tes.aktif);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciJadwal]);

  const terkunci = tes.jumlah_sesi > 0;

  async function muatTersimpan() {
    try {
      const d = await fetchJson<{ soal: SoalLengkap[] }>(`${URL_ADMIN}?bagian=soal&jenis=${tes.jenis}`);
      setTersimpan(d.soal);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  async function simpanJadwal() {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson(URL_ADMIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "atur_jadwal", jenis: tes.jenis, buka_at: buka, tutup_at: tutup, durasi_menit: Number(durasi), aktif }),
      });
      setPesan({ jenis: "ok", teks: "Jadwal tersimpan." });
      setelahSimpan();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  async function unduhTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(barisTemplate());
    ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Soal");
    const wp = XLSX.utils.aoa_to_sheet(PETUNJUK_TEMPLATE.map((t) => [t]));
    wp["!cols"] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");
    XLSX.writeFile(wb, `Template_Soal_${label}_Pelatihan_PSP.xlsx`);
  }

  async function bacaBerkas(f: File | undefined) {
    if (!f) return;
    setPesan(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nama = wb.SheetNames.find((n) => n.toLowerCase() === "soal") ?? wb.SheetNames[0];
      const baris = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nama], { header: 1, defval: "", blankrows: false });
      const h = bacaBarisSoal(baris);
      setPratinjau({ ...h, nama: f.name });
    } catch {
      setPesan({ jenis: "galat", teks: "Berkas tidak dapat dibaca. Gunakan template .xlsx yang diunduh dari halaman ini." });
    } finally {
      if (berkas.current) berkas.current.value = "";
    }
  }

  async function simpanSoal() {
    if (!pratinjau || pratinjau.galat.length > 0) return;
    setSibuk(true);
    setPesan(null);
    try {
      const r = await fetchJson<{ jumlah_soal: number }>(URL_ADMIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "simpan_soal", jenis: tes.jenis, soal: pratinjau.soal }),
      });
      setPesan({ jenis: "ok", teks: `${r.jumlah_soal} soal ${label} tersimpan.` });
      setPratinjau(null);
      setTersimpan(null);
      setelahSimpan();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Kartu
      judul={label}
      ket={tes.jumlah_soal > 0 ? `${tes.jumlah_soal} soal` : "belum ada soal"}
      kanan={terkunci ? <Chip w="wait">{tes.jumlah_sesi} peserta sudah memulai</Chip> : tes.jumlah_soal > 0 ? <Chip w="ok">Siap</Chip> : <Chip w="bad">Soal kosong</Chip>}
    >
      {/* Jadwal */}
      <div className="grid grid-cols-2 gap-2.5">
        <label className="col-span-2 text-[12px] text-[#7B8794] sm:col-span-1">
          Dibuka (WIB)
          <input type="datetime-local" className={`${INPUT} mt-0.5 w-full`} value={buka} disabled={!bisaKelola} onChange={(e) => { setBuka(e.target.value); if (e.target.value && Number(durasi) > 0) setTutup(tambahMenit(e.target.value, Number(durasi))); }} />
        </label>
        <label className="text-[12px] text-[#7B8794]">
          Durasi (menit)
          <input type="number" min={1} max={240} className={`${INPUT} mt-0.5 w-full`} value={durasi} disabled={!bisaKelola} onChange={(e) => { setDurasi(e.target.value); if (buka && Number(e.target.value) > 0) setTutup(tambahMenit(buka, Number(e.target.value))); }} />
        </label>
        <label className="col-span-2 text-[12px] text-[#7B8794] sm:col-span-1">
          Ditutup otomatis (WIB)
          <input type="datetime-local" className={`${INPUT} mt-0.5 w-full`} value={tutup} disabled={!bisaKelola} onChange={(e) => setTutup(e.target.value)} />
        </label>
        <label className="col-span-2 flex items-center gap-2 pt-4 text-[12.5px] sm:col-span-1">
          <input type="checkbox" checked={aktif} disabled={!bisaKelola} onChange={(e) => setAktif(e.target.checked)} /> Tes aktif (tampil bagi peserta)
        </label>
      </div>
      <p className="mt-1.5 text-[11.5px] text-[#7B8794]">
        Peserta bisa mulai antara jam buka dan jam tutup; waktunya {durasi || "…"} menit per orang tetapi tidak melewati jam tutup. Saat ini tersimpan: {waktuWib(tes.buka_at)} – {waktuWib(tes.tutup_at)}.
      </p>
      {bisaKelola && (
        <button type="button" className={`${BTN} mt-2`} disabled={sibuk} onClick={simpanJadwal}>
          Simpan jadwal
        </button>
      )}

      {/* Soal */}
      <div className="mt-4 border-t border-[#EDF0F4] pt-3">
        <p className="text-[13px] font-semibold">Soal {label}</p>
        <p className="text-[12px] text-[#7B8794]">
          Format kolom: {HEADER_TEMPLATE.join(" · ")}. Kunci = huruf jawaban benar; E dan Bobot opsional (maks. {MAKS_SOAL} soal).
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={unduhTemplate}>
            ⬇ Unduh template Excel
          </button>
          {bisaKelola && (
            <>
              <button type="button" className={BTN} disabled={terkunci || sibuk} onClick={() => berkas.current?.click()} title={terkunci ? "Soal terkunci: sudah ada peserta yang memulai" : undefined}>
                ⬆ Unggah soal (.xlsx)
              </button>
              <input ref={berkas} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => bacaBerkas(e.target.files?.[0])} />
            </>
          )}
          {bisaKelola && tes.jumlah_soal > 0 && (
            <button
              type="button"
              className={BTN_O}
              onClick={() => {
                setLihat((v) => !v);
                if (!tersimpan) muatTersimpan();
              }}
            >
              {lihat ? "Sembunyikan soal tersimpan" : "Lihat soal tersimpan"}
            </button>
          )}
        </div>
        {terkunci && <p className="mt-1.5 text-[12px] font-semibold text-[#9A6200]">Soal tidak dapat diganti lagi karena sudah ada peserta yang memulai {label}.</p>}
        {pesan && (
          <div className="mt-2">
            <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
          </div>
        )}

        {pratinjau && (
          <div className="mt-3 rounded-xl border border-[#CDD5DE] p-2.5">
            <p className="text-[12.5px] font-semibold">Pratinjau: {pratinjau.nama}</p>
            {pratinjau.galat.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#7F241E]">
                {pratinjau.galat.slice(0, 30).map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
                {pratinjau.galat.length > 30 && <li>… dan {pratinjau.galat.length - 30} kesalahan lain.</li>}
              </ul>
            ) : (
              <p className="mt-1 text-[12.5px] text-[#0E5E4E]">{pratinjau.soal.length} soal terbaca dengan benar. Simpan akan menimpa soal {label} yang ada.</p>
            )}
            {pratinjau.soal.length > 0 && <DaftarSoal soal={pratinjau.soal} />}
            <div className="mt-2 flex gap-2">
              <button type="button" className={BTN_G} disabled={sibuk || pratinjau.galat.length > 0} onClick={simpanSoal}>
                Simpan {pratinjau.soal.length} soal
              </button>
              <button type="button" className={BTN_O} onClick={() => setPratinjau(null)}>
                Batal
              </button>
            </div>
          </div>
        )}
        {lihat && tersimpan && !pratinjau && (
          <div className="mt-3 rounded-xl border border-[#E3E8EE] p-2.5">
            <DaftarSoal soal={tersimpan} />
          </div>
        )}
      </div>
    </Kartu>
  );
}

function DaftarSoal({ soal }: { soal: SoalLengkap[] }) {
  return (
    <ol className="mt-2 max-h-[340px] space-y-2 overflow-y-auto pr-1">
      {soal.map((s) => (
        <li key={s.nomor} className="rounded-lg bg-[#F8FAFC] px-2.5 py-2 text-[12.5px]">
          <p className="font-semibold">
            {s.nomor}. {s.teks} <span className="font-normal text-[#7B8794]">(bobot {s.bobot})</span>
          </p>
          <ul className="mt-0.5">
            {s.opsi.map((o) => (
              <li key={o.kode} className={o.kode === s.kunci ? "font-bold text-[#0E5E4E]" : "text-[#55657D]"}>
                {o.kode}. {o.teks} {o.kode === s.kunci && "✔"}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// ======================================================================
// Monitoring
// ======================================================================
const LABEL_PES: Record<string, string> = { belum_mulai: "belum mulai", mengerjakan: "mengerjakan", selesai: "selesai", terlewat: "terlewat", soal_belum_ada: "soal kosong", nonaktif: "nonaktif", belum_buka: "belum mulai", buka: "belum mulai" };

function ChipStatus({ c, jam }: { c: CelTes | undefined; jam: () => number }) {
  if (!c) return <span className="text-[#7B8794]">—</span>;
  if (c.status === "selesai")
    return (
      <span className="flex items-center gap-1.5">
        <b className="tabular-nums">{c.skor ?? "–"}</b>
        <Chip w="ok">selesai</Chip>
      </span>
    );
  if (c.status === "mengerjakan") {
    const sisa = c.batas_at ? (new Date(c.batas_at).getTime() - jam()) / 1000 : 0;
    return (
      <span className="flex items-center gap-1.5">
        <Chip w="navy">mengerjakan</Chip>
        <span className="text-[11.5px] tabular-nums text-[#55657D]">
          {c.terjawab} jwb · {formatSisa(sisa)}
        </span>
      </span>
    );
  }
  if (c.status === "terlewat") return <Chip w="bad">terlewat</Chip>;
  return <Chip>{LABEL_PES[c.status] ?? c.status}</Chip>;
}

type SubMon = "tes" | "akses" | "presensi" | "translok";
function MonitoringBagian() {
  const [sub, setSub] = useState<SubMon>("tes");
  const item: { k: SubMon; label: string }[] = [
    { k: "tes", label: "📝 Pretest & Posttest" },
    { k: "akses", label: "🚪 Akses Pelatihan" },
    { k: "presensi", label: "📍 Presensi" },
    { k: "translok", label: "🛵 Transport Lokal" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {item.map((x) => (
          <button
            key={x.k}
            type="button"
            role="tab"
            aria-selected={sub === x.k}
            onClick={() => setSub(x.k)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${sub === x.k ? "bg-[#0F3D7A] text-white" : "bg-white text-[#55657D] ring-1 ring-[#CDD5DE] hover:bg-[#F8FAFC]"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {sub === "akses" && <MonitoringAkses />}
      {sub === "tes" && <Monitoring />}
      {sub === "presensi" && <MonitoringPresensi />}
      {sub === "translok" && <MonitoringTranslok />}
    </div>
  );
}

const STATUS_FILTER: Record<string, string> = { belum_mulai: "belum mulai", mengerjakan: "sedang mengerjakan", selesai: "selesai", terlewat: "terlewat" };
/** Opsi status gabungan Pretest & Posttest ("<tes>:<status>"), dipakai bar filter; per tes dipakai judul kolom. */
const opsiStatusTes = (j: JenisTes): Opsi[] => Object.entries(STATUS_FILTER).map(([k, v]) => ({ nilai: `${j}:${k}`, label: v }));
const OPSI_STATUS_TES: Opsi[] = DAFTAR_JENIS_TES.flatMap((j) => Object.entries(STATUS_FILTER).map(([k, v]) => ({ nilai: `${j}:${k}`, label: `${LABEL_JENIS_TES[j]}: ${v}`, grup: LABEL_JENIS_TES[j] })));
const normStatusTes = (s0: string | undefined) => (!s0 || s0 === "belum_buka" || s0 === "buka" || s0 === "soal_belum_ada" ? "belum_mulai" : s0);

type PesertaMon = Monitor["peserta"][number];
/** Nilai akhir satu peserta dari skema + hasil kuis (API nilai) + skor tes (data monitoring). */
function nilaiPeserta(p: PesertaMon, d: ReturnType<typeof useSkemaNilai>["data"]): HasilAkhir {
  const skor = (j: JenisTes) => (p.tes[j]?.status === "selesai" ? (p.tes[j]?.skor ?? null) : null);
  const kuis = d?.kuis[String(p.akun_id)] ?? null;
  return hitungAkhir(d?.skema ?? SKEMA_BAWAAN_KLIEN, { pretest: skor("pretest"), posttest: skor("posttest"), kuis });
}

function Monitoring() {
  const [data, setData] = useState<Monitor | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const f = useFilterMon();
  const [jenisAnalisis, setJenisAnalisis] = useState<JenisTes>("pretest");
  const jam = useJamServer();
  const { setujukan, sekarang } = jam;
  const nilai = useSkemaNilai(30_000); // (8 Okt 2026) skema nilai akhir + hasil kuis

  const muat = useCallback(async () => {
    try {
      const d = await fetchJson<Monitor>(`${URL_ADMIN}?bagian=monitoring`);
      setujukan(d.sekarang);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [setujukan]);
  useEffect(() => {
    muat();
    const t = setInterval(muat, 10_000);
    return () => clearInterval(t);
  }, [muat]);

  const baris = useMemo(() => {
    if (!data) return [];
    // status: nilai "<tes>:<status>"; dalam satu tes boleh beberapa status (atau), antar tes harus cocok semua (dan)
    const perTes = new Map<string, Set<string>>();
    f.status.forEach((v) => {
      const [j, st] = v.split(":");
      perTes.set(j, (perTes.get(j) ?? new Set()).add(st));
    });
    const lolos = data.peserta.filter((p) => {
      if (!lolosDasar(f, p)) return false;
      for (const [j, sts] of perTes) if (!sts.has(normStatusTes(p.tes[j as JenisTes]?.status))) return false;
      return true;
    });
    const akhirDari = (p: Monitor["peserta"][number]) => nilaiPeserta(p, nilai.data);
    const naik = (p: Monitor["peserta"][number]) => (p.tes.pretest?.skor != null && p.tes.posttest?.skor != null ? p.tes.posttest.skor - p.tes.pretest.skor : null);
    return urutkan(lolos, f.urut, { nama: (p) => p.nama, kelas: (p) => p.kelas, peran: (p) => p.peran, jenis: (p) => p.jenis_akun, pretest: (p) => p.tes.pretest?.skor, posttest: (p) => p.tes.posttest?.skor, naik, kuis: (p) => akhirDari(p).komponen.kuis, akhir: (p) => akhirDari(p).akhir });
  }, [data, nilai.data, f.jenis, f.kelas, f.peran, f.status, f.cari, f.urut]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Analisis per soal: kerangka soal dari server, angkanya dihitung ulang dari jawaban peserta yang lolos filter. */
  function analisisUntuk(j: JenisTes): Analisis[] {
    const selesai = baris.filter((p) => p.tes[j]?.status === "selesai");
    return (data?.analisis[j] ?? []).map((a) => {
      const sebaran: Record<string, number> = {};
      Object.keys(a.sebaran).forEach((k) => (sebaran[k] = 0));
      let menjawab = 0;
      let benar = 0;
      for (const p of selesai) {
        const x = p.tes[j]?.jawab?.[String(a.nomor)];
        if (x) {
          menjawab++;
          sebaran[x] = (sebaran[x] ?? 0) + 1;
          if (x === a.kunci) benar++;
        }
      }
      return { ...a, menjawab, benar, sebaran, persen_benar: selesai.length ? Math.round((benar / selesai.length) * 1000) / 10 : null };
    });
  }

  async function ekspor() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const aoa: (string | number)[][] = [["No", "Nama", "Jenis", "Kelas", "Peran", "Pretest status", "Pretest skor", "Pretest benar", "Pretest mulai (WIB)", "Pretest selesai (WIB)", "Posttest status", "Posttest skor", "Posttest benar", "Posttest mulai (WIB)", "Posttest selesai (WIB)", "Kenaikan (post-pre)", "Kuis nilai", "Kuis benar", "Kuis poin", "Nilai akhir", "Nilai akhir lengkap?"]];
    baris.forEach((p, i) => {
      const a = p.tes.pretest;
      const b = p.tes.posttest;
      aoa.push([
        i + 1,
        p.nama,
        p.jenis_akun === "organik" ? "Organik" : "Mitra",
        p.kelas ?? "",
        p.peran.toUpperCase(),
        a ? (LABEL_PES[a.status] ?? a.status) : "",
        a?.skor ?? "",
        a?.benar != null ? `${a.benar}/${a.total}` : "",
        a?.mulai_at ? waktuWib(a.mulai_at) : "",
        a?.selesai_at ? waktuWib(a.selesai_at) : "",
        b ? (LABEL_PES[b.status] ?? b.status) : "",
        b?.skor ?? "",
        b?.benar != null ? `${b.benar}/${b.total}` : "",
        b?.mulai_at ? waktuWib(b.mulai_at) : "",
        b?.selesai_at ? waktuWib(b.selesai_at) : "",
        a?.skor != null && b?.skor != null ? Math.round((b.skor - a.skor) * 100) / 100 : "",
        ...(() => {
          const nl = nilaiPeserta(p, nilai.data);
          const kz = nilai.data?.kuis[String(p.akun_id)] ?? null;
          return [nl.komponen.kuis ?? "", kz ? `${kz.benar}/${kz.total_soal}` : "", kz ? kz.poin : "", nl.akhir ?? "", nl.akhir == null ? "" : nl.lengkap ? "ya" : "belum"];
        })(),
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 20 }, { wch: 20 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Peserta");
    {
      const sk = nilai.data?.skema ?? SKEMA_BAWAAN_KLIEN;
      const wsk = XLSX.utils.aoa_to_sheet([
        ["Skema nilai akhir", ringkasSkema(sk)],
        ["Nilai kuis dari", LABEL_DASAR_KUIS[sk.dasar_kuis]],
        ["Komponen kosong", "dihitung 0 (kolom 'Nilai akhir lengkap?' = belum)"],
      ]);
      wsk["!cols"] = [{ wch: 20 }, { wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsk, "Skema Nilai");
    }
    for (const j of DAFTAR_JENIS_TES) {
      const an = analisisUntuk(j);
      const wa = XLSX.utils.aoa_to_sheet([["Soal", "Teks", "Kunci", "Menjawab", "Benar", "% benar"], ...an.map((a) => [a.nomor, a.teks, a.kunci, a.menjawab, a.benar, a.persen_benar ?? ""])]);
      wa["!cols"] = [{ wch: 6 }, { wch: 70 }, { wch: 7 }, { wch: 10 }, { wch: 8 }, { wch: 9 }];
      XLSX.utils.book_append_sheet(wb, wa, `Analisis ${LABEL_JENIS_TES[j]}`);
    }
    XLSX.writeFile(wb, `Monitoring_Pelatihan_PSP_${new Date().toISOString().slice(0, 10)}${f.adaFilter ? "_filter" : ""}.xlsx`);
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  // Semua kartu di halaman ini dihitung dari `baris` (peserta yang lolos SEMUA filter), bukan dari angka server.
  const hitung = (j: JenisTes) => {
    const sel = baris.filter((p) => p.tes[j]?.status === "selesai");
    const skor = sel.map((p) => p.tes[j]?.skor).filter((x): x is number => x != null);
    const mengerjakan = baris.filter((p) => p.tes[j]?.status === "mengerjakan").length;
    return {
      selesai: sel.length,
      mengerjakan,
      belum: baris.length - sel.length - mengerjakan,
      terlewat: baris.filter((p) => p.tes[j]?.status === "terlewat").length,
      rata: skor.length ? Math.round((skor.reduce((x, y) => x + y, 0) / skor.length) * 100) / 100 : null,
    };
  };
  const pre = hitung("pretest");
  const post = hitung("posttest");
  const total = baris.length;
  const semua = data.peserta.length;
  const persen = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const adaFilter = f.adaFilter;
  const analisis = analisisUntuk(jenisAnalisis);
  const selesaiAnalisis = baris.filter((p) => p.tes[jenisAnalisis]?.status === "selesai").length;
  const urut = [...analisis].filter((a) => a.persen_benar !== null).sort((a, b) => (a.persen_benar ?? 0) - (b.persen_benar ?? 0));
  const terendah = urut[0];
  const tertinggi = urut[urut.length - 1];
  const fmt = (n: number | null | undefined) => (n == null ? "—" : String(n).replace(".", ","));
  const hasilNilai = baris.map((p) => nilaiPeserta(p, nilai.data));
  const rata2 = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return { n: v.length, rata: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null };
  };
  const rataKuis = rata2(hasilNilai.map((h) => h.komponen.kuis));
  const rataAkhir = { ...rata2(hasilNilai.map((h) => h.akhir)), lengkap: hasilNilai.filter((h) => h.akhir != null && h.lengkap).length };

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}

      <PanelSkemaNilai nilai={nilai} asal="monitoring" />

      <BarFilterMonitoring f={f} total={total} semua={semua} statusOpsi={OPSI_STATUS_TES} catatan="Kartu & tabel di bawah hanya menghitung peserta ini." />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={total} ket={adaFilter ? `dari ${semua}` : undefined} />
        <KartuAngka label="Pretest selesai" nilai={pre.selesai} ket={`${persen(pre.selesai)}%`} warna="#1E7A4C" />
        <KartuAngka label="Sedang mengerjakan" nilai={pre.mengerjakan + post.mengerjakan} ket={`pre ${pre.mengerjakan} · post ${post.mengerjakan}`} warna="#1F6FD1" />
        <KartuAngka label="Pretest belum mulai" nilai={pre.belum} ket={pre.terlewat > 0 ? `${pre.terlewat} terlewat` : undefined} warna="#9A6200" />
        <KartuAngka label="Rata-rata pretest" nilai={fmt(pre.rata)} ket={`${pre.selesai} peserta`} />
        <KartuAngka label="Rata-rata posttest" nilai={fmt(post.rata)} ket={`selesai ${persen(post.selesai)}% (${post.selesai})`} />
        <KartuAngka label="Rata-rata kuis" nilai={fmt(rataKuis.rata)} ket={`${rataKuis.n} peserta ikut`} warna="#C2570C" />
        <KartuAngka label="Rata-rata nilai akhir" nilai={fmt(rataAkhir.rata)} ket={`${rataAkhir.n} peserta · ${rataAkhir.lengkap} lengkap`} warna="#0F3D7A" />
      </div>

      <Kartu
        judul="Per peserta"
        ket={`${baris.length} dari ${data.peserta.length} · segar otomatis tiap 10 detik`}
        kanan={
          <button type="button" className={BTN_O} onClick={ekspor}>
            ⬇ Ekspor Excel{adaFilter ? " (sesuai filter)" : ""}
          </button>
        }
      >
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <ThKontrol label="Nama" search={{ value: f.cari, onChange: f.setCari, placeholder: "Cari nama..." }} sort={sortKolom(f, "nama")} />
              <ThKontrol label="Kls" filter={{ options: OPSI_KELAS, selected: f.kelas, onApply: f.setKelas }} sort={sortKolom(f, "kelas")} />
              <ThKontrol label="Peran" filter={{ options: OPSI_PERAN, selected: f.peran, onApply: f.setPeran }} sort={sortKolom(f, "peran")} />
              <ThKontrol label="Jenis" filter={{ options: OPSI_JENIS, selected: f.jenis, onApply: f.setJenis }} sort={sortKolom(f, "jenis")} />
              <ThKontrol label="Pretest" filter={{ options: opsiStatusTes("pretest"), selected: new Set([...f.status].filter((v) => v.startsWith("pretest:"))), onApply: (v) => f.setStatus(new Set([...[...f.status].filter((x) => !x.startsWith("pretest:")), ...v])) }} sort={sortKolom(f, "pretest")} />
              <ThKontrol label="Posttest" filter={{ options: opsiStatusTes("posttest"), selected: new Set([...f.status].filter((v) => v.startsWith("posttest:"))), onApply: (v) => f.setStatus(new Set([...[...f.status].filter((x) => !x.startsWith("posttest:")), ...v])) }} sort={sortKolom(f, "posttest")} />
              <ThKontrol label="Naik" sort={sortKolom(f, "naik")} />
              <ThKontrol label="Kuis" sort={sortKolom(f, "kuis")} />
              <ThKontrol label="Nilai akhir" sort={sortKolom(f, "akhir")} />
            </tr>
          </thead>
          <tbody>
            {baris.map((p) => {
              const a = p.tes.pretest?.skor;
              const b = p.tes.posttest?.skor;
              const naik = a != null && b != null ? Math.round((b - a) * 100) / 100 : null;
              const nl = nilaiPeserta(p, nilai.data);
              const kz = nilai.data?.kuis[String(p.akun_id)] ?? null;
              return (
                <tr key={p.akun_id}>
                  <td className={`${TD} font-semibold`}>{p.nama}</td>
                  <td className={TD}>{p.kelas ?? "–"}</td>
                  <td className={TD}>{p.peran.toUpperCase()}</td>
                  <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
                  <td className={TD}><ChipStatus c={p.tes.pretest} jam={sekarang} /></td>
                  <td className={TD}><ChipStatus c={p.tes.posttest} jam={sekarang} /></td>
                  <td className={`${TD} tabular-nums ${naik != null ? (naik >= 0 ? "text-[#1E7A4C]" : "text-[#C0392B]") : "text-[#7B8794]"}`}>{naik != null ? `${naik > 0 ? "+" : ""}${fmt(naik)}` : "—"}</td>
                  <td className={TD}>
                    {kz ? (
                      <span title={`${kz.benar}/${kz.total_soal} benar · ${kz.poin.toLocaleString("id-ID")} poin`}>
                        <b className="tabular-nums">{fmt(nl.komponen.kuis)}</b>
                        <span className="ml-1 text-[11px] text-[#7B8794]">{kz.benar}/{kz.total_soal}</span>
                      </span>
                    ) : (
                      <span className="text-[#7B8794]">—</span>
                    )}
                  </td>
                  <td className={TD}>
                    {nl.akhir != null ? (
                      <span className="flex items-center gap-1.5">
                        <b className="tabular-nums text-[#0F3D7A]">{fmt(nl.akhir)}</b>
                        {!nl.lengkap && <Chip w="wait" title="Ada komponen terpilih yang belum punya nilai (dihitung 0)">belum lengkap</Chip>}
                      </span>
                    ) : (
                      <span className="text-[#7B8794]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {baris.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={9}>Tidak ada peserta yang cocok dengan filter.</td>
              </tr>
            )}
          </tbody>
        </TabelKartu>
      </Kartu>

      <Kartu
        judul="Analisis per soal"
        ket={`berdasarkan ${selesaiAnalisis} peserta yang sudah selesai${adaFilter ? " (sesuai filter)" : ""}`}
        kanan={
          <select className={INPUT} value={jenisAnalisis} onChange={(e) => setJenisAnalisis(e.target.value as JenisTes)} aria-label="Pilih tes">
            {DAFTAR_JENIS_TES.map((j) => (
              <option key={j} value={j}>{LABEL_JENIS_TES[j]}</option>
            ))}
          </select>
        }
      >
        {analisis.length === 0 ? (
          <p className="text-[13px] text-[#7B8794]">Belum ada soal.</p>
        ) : (
          <>
            {terendah && tertinggi && (
              <p className="mb-2 text-[12.5px] text-[#55657D]">
                Soal {terendah.nomor} paling sulit (benar {fmt(terendah.persen_benar)}%) · Soal {tertinggi.nomor} paling mudah (benar {fmt(tertinggi.persen_benar)}%).
              </p>
            )}
            <div className="space-y-1.5">
              {analisis.map((a) => (
                <div key={a.nomor} className="rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <b className="w-7 shrink-0">{a.nomor}.</b>
                    <span className="min-w-0 flex-1 truncate" title={a.teks}>{a.teks}</span>
                    <span className="shrink-0 font-bold tabular-nums">{a.persen_benar == null ? "—" : `${fmt(a.persen_benar)}%`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E8EE]">
                    <div className="h-full rounded-full" style={{ width: `${a.persen_benar ?? 0}%`, background: (a.persen_benar ?? 0) < 50 ? "#C0392B" : "#1E7A4C" }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#7B8794]">
                    Kunci {a.kunci} · sebaran {Object.entries(a.sebaran).map(([k, n]) => `${k}:${n}`).join("  ")} · {a.menjawab} menjawab
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Kartu>
    </div>
  );
}
