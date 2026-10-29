"use client";

// app/portal/qc/QcGerbang.tsx
//
// (26 Okt 2026) QC Pemahaman Petugas -- GERBANG pemblokir untuk PML dan PPL Pendataan Pascabencana. Dipasang sekali di app/layout.tsx, jadi berlaku di
// seluruh halaman portal/SIGAP. Selama petugas WAJIB mengisi (soal hari ini belum diisi, atau nilai belum 100 dan masih ada sisa ulangan) layar tertutup
// modal tanpa tombol tutup. Urutan layar:
//   1. (PML) rekap tim kemarin: nilai PPL + soal yang salah + ajakan briefing ulang; harus dicentang "akan briefing" lalu Lanjut
//   2. pengantar -> soal satu per satu (kata kunci disorot) -> kirim
//   3. hasil: nilai, benar/salah tiap soal, jawaban benar, pembahasan (kata kunci disorot). Nilai < 100 dan masih ada sisa ulangan: tombol
//      satu-satunya "Ulangi sekarang"; jika 100 atau kesempatan habis: "Selesai".
// Keputusan wajib/tidak ada di server (sigap_qc_status), bukan di sini. Gagal memuat = diam (jangan mengunci aplikasi karena galat jaringan/server).
// Tidak tampil pada mode "masuk sebagai" (simulasi). Status diperiksa tiap 60 detik, saat aplikasi dibuka lagi, dan saat kembali online.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { modeSimulasi } from "@/app/portal/simulasi";
import { kalimatHasil, teksSisaWaktu, type QcButirTinjau, type QcRekapTim, type QcSetSoal, type QcTinjau } from "@/lib/sigapQc";
import { teksTunda } from "@/lib/sigapQcTunda";
import Sorot from "./Sorot";
import RekapPml from "./RekapPml";

type Status = {
  aktif: boolean;
  /** (29 Okt 2026) QC per kegiatan: kegiatan yang sedang diminta dan aturannya */
  kegiatan_id?: number;
  kegiatan_nama?: string;
  nilai_lulus?: number;
  wajib_ulang?: boolean;
  peran?: "pml" | "ppl";
  tanggal?: string;
  lewat_batas?: boolean;
  susulan?: boolean;
  perlu?: boolean;
  percobaan?: number;
  maks_percobaan?: number;
  sisa_ulang?: number;
  skor_terbaik?: number;
  batas_at?: string;
  ppl_belum?: string[];
  /** (28 Okt 2026) saat tunda pengingat berakhir (ditampilkan hanya bila masih di masa depan) */
  tunda_sampai?: string | null;
};
type Rekap = { ada: boolean; tanggal?: string; kegiatan_id?: number; tim?: QcRekapTim };
type Jawaban = Record<string, "A" | "B" | "C" | "D">;
type Layar = "pengantar" | "soal" | "hasil";

const POLA_MS = 60_000;

export default function QcGerbang() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [rekapTutup, setRekapTutup] = useState<string | null>(null);
  const [menutupRekap, setMenutupRekap] = useState(false);
  const [layar, setLayar] = useState<Layar>("pengantar");
  const [set, setSet] = useState<QcSetSoal | null>(null);
  const [jawaban, setJawaban] = useState<Jawaban>({});
  const [no, setNo] = useState(0);
  const [hasil, setHasil] = useState<QcTinjau | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState<"salah" | "semua">("salah");
  const [menunda, setMenunda] = useState(false);
  const [, setTik] = useState(0);
  const kotak = useRef<HTMLDivElement>(null);
  const sedangMuat = useRef(false);

  const muat = useCallback(async () => {
    if (sedangMuat.current) return;
    if (!bacaSesi() || modeSimulasi()) {
      setStatus(null);
      setRekap(null);
      return;
    }
    sedangMuat.current = true;
    try {
      const d = await apiPortal<{ status: Status; rekap: Rekap }>("/api/portal/qc");
      setStatus(d.status);
      setRekap(d.rekap);
    } catch {
      /* jaringan/server bermasalah: pertahankan keadaan terakhir, jangan mengunci */
    } finally {
      sedangMuat.current = false;
    }
  }, []);

  useEffect(() => {
    void muat();
    const b = setInterval(() => {
      if (document.visibilityState === "visible") void muat();
      setTik((x) => x + 1); // segarkan hitung mundur
    }, POLA_MS);
    const lihat = () => document.visibilityState === "visible" && void muat();
    document.addEventListener("visibilitychange", lihat);
    window.addEventListener("online", lihat);
    window.addEventListener("focus", lihat);
    return () => {
      clearInterval(b);
      document.removeEventListener("visibilitychange", lihat);
      window.removeEventListener("online", lihat);
      window.removeEventListener("focus", lihat);
    };
  }, [muat]);

  const bukaRekap = !!rekap?.ada && !!rekap.tim && rekap.tanggal !== rekapTutup && !hasil;
  const wajib = !!status?.aktif && !!status.perlu;
  const tampil = !!hasil || bukaRekap || wajib;

  // kunci gulir halaman di belakang modal
  useEffect(() => {
    if (!tampil) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [tampil]);

  // layar baru -> fokus ke awal modal dan gulir ke atas
  useEffect(() => {
    if (tampil) {
      kotak.current?.scrollTo({ top: 0 });
      kotak.current?.focus();
    }
  }, [tampil, layar, no]);

  const mulai = useCallback(async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const d = await apiPortal<QcSetSoal>("/api/portal/qc?soal=1");
      setSet(d);
      setJawaban({});
      setNo(0);
      setHasil(null);
      setLayar("soal");
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat soal.");
      void muat();
    } finally {
      setSibuk(false);
    }
  }, [muat]);

  const kirim = useCallback(async () => {
    if (!set) return;
    setSibuk(true);
    setGalat(null);
    try {
      const d = await apiPortal<QcTinjau>("/api/portal/qc", { method: "POST", body: JSON.stringify({ aksi: "jawab", jawaban }) });
      setHasil(d);
      setSaring(d.lulus ? "semua" : "salah");
      setLayar("hasil");
      void muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengirim jawaban.");
    } finally {
      setSibuk(false);
    }
  }, [set, jawaban, muat]);

  const selesai = useCallback(() => {
    setHasil(null);
    setSet(null);
    setLayar("pengantar");
    setGalat(null);
    void muat();
  }, [muat]);

  // (28 Okt 2026) "Ingatkan lagi 2 jam": hanya menunda notifikasi pengingat; modal ini tetap wajib sampai nilai 100.
  const tunda = useCallback(async () => {
    setMenunda(true);
    setGalat(null);
    try {
      const d = await apiPortal<{ sampai?: string }>("/api/portal/qc", { method: "POST", body: JSON.stringify({ aksi: "tunda" }) });
      if (d?.sampai) setStatus((s) => (s ? { ...s, tunda_sampai: d.sampai } : s));
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menunda pengingat. Coba lagi.");
    } finally {
      setMenunda(false);
    }
  }, []);

  const tutupRekap = useCallback(async () => {
    const tgl = rekap?.tanggal;
    if (!tgl) return;
    setMenutupRekap(true);
    setGalat(null);
    try {
      await apiPortal("/api/portal/qc", { method: "POST", body: JSON.stringify({ aksi: "rekap_baca", tanggal: tgl, kegiatan_id: rekap?.kegiatan_id }) });
      setRekapTutup(tgl);
      void muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan. Coba lagi.");
    } finally {
      setMenutupRekap(false);
    }
  }, [rekap, muat]);

  if (!tampil) return null;

  // ---------------------------------------------------------------- rekap PML (mendahului isian)
  if (bukaRekap && rekap?.tim && rekap.tanggal) {
    return <RekapPml tanggal={rekap.tanggal} tim={rekap.tim} maks={status?.maks_percobaan ?? 4} menutup={menutupRekap} galat={galat} onTutup={tutupRekap} />;
  }

  const sisaMenit = status?.batas_at ? Math.ceil((Date.parse(status.batas_at) - Date.now()) / 60000) : 0;
  const susulan = !!status?.susulan;
  const info = teksSisaWaktu({ lewatBatas: !!status?.lewat_batas, sisaMenit }, susulan);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-[#0B1530]/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <div
        ref={kotak}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-qc"
        className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl outline-none sm:max-h-[94dvh] sm:rounded-2xl"
      >
        {layar === "pengantar" && !hasil && (
          <Pengantar status={status} info={info} susulan={susulan} lewat={!!status?.lewat_batas} sibuk={sibuk} galat={galat} onMulai={mulai} menunda={menunda} onTunda={tunda} />
        )}
        {layar === "soal" && set && (
          <Soal set={set} jawaban={jawaban} no={no} sibuk={sibuk} galat={galat} onMuatUlang={mulai} onPilih={(id, k) => setJawaban((j) => ({ ...j, [id]: k }))} onNo={setNo} onKirim={kirim} />
        )}
        {layar === "hasil" && hasil && (
          <Hasil hasil={hasil} status={status} saring={saring} onSaring={setSaring} sibuk={sibuk} galat={galat} onUlang={mulai} onSelesai={selesai} />
        )}
      </div>
    </div>
  );
}

// ====================================================================== pengantar
function Pengantar({ status, info, susulan, lewat, sibuk, galat, onMulai, menunda, onTunda }: { status: Status | null; info: string; susulan: boolean; lewat: boolean; sibuk: boolean; galat: string | null; onMulai: () => void; menunda: boolean; onTunda: () => void }) {
  const n = (status?.percobaan ?? 0) + 1;
  const maks = status?.maks_percobaan ?? 4;
  const mengulang = (status?.percobaan ?? 0) > 0;
  const infoTunda = teksTunda(status?.tunda_sampai, Date.now());
  const nilai = status?.nilai_lulus ?? 100;
  const wajibUlang = status?.wajib_ulang !== false;
  return (
    <>
      <div className={`${lewat || susulan ? "bg-[#B42329]" : "bg-[#1E2A47]"} px-5 pb-4 pt-5 text-white`}>
        <p className="text-[11.5px] font-extrabold tracking-wide text-white/85">
          QC PEMAHAMAN PETUGAS{status?.kegiatan_nama ? ` · ${status.kegiatan_nama.toUpperCase()}` : ""} · WAJIB DIISI
        </p>
        <h2 id="judul-qc" className="mt-1.5 text-[19px] font-extrabold leading-snug">
          {mengulang ? `Ulangi sampai ${nilai >= 100 ? "nilai 100" : `nilai ${nilai} ke atas`}` : "Isi dulu sebelum melanjutkan pekerjaan"}
        </h2>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-[14.5px] leading-relaxed text-[#1B2B4B]">
          {mengulang
            ? `Nilai terbaik Anda ${status?.skor_terbaik ?? 0}. Soal akan diacak ulang dan Anda bisa melihat pembahasan setelah menjawab.`
            : "Jawab semua soal pemahaman materi pendataan. Setelah menjawab Anda bisa melihat jawaban yang benar dan pembahasannya."}
        </p>
        <ul className="space-y-1.5 text-[13.5px] text-[#1B2B4B]">
          <li className="rounded-lg bg-[#EEF3FB] px-3 py-2">
            Percobaan <b>ke-{n}</b> dari {maks}
            {(status?.sisa_ulang ?? 0) > 0 ? ` · sisa ${status?.sisa_ulang} kesempatan` : ""}
          </li>
          <li className={`rounded-lg px-3 py-2 ${lewat ? "bg-[#FDE8E8] text-[#9B1C23]" : "bg-[#FFF4D6] text-[#6F5000]"}`}>{info}</li>
          <li className="rounded-lg bg-[#EEF3FB] px-3 py-2">
            {!wajibUlang
              ? `Satu kali kesempatan. Nilai ${nilai >= 100 ? "100" : `${nilai} ke atas`} dinyatakan lulus.`
              : nilai >= 100
                ? "Nilai harus 100. Bila belum, Anda wajib mengulang selama masih ada kesempatan."
                : `Nilai harus ${nilai} ke atas. Bila belum, Anda wajib mengulang selama masih ada kesempatan.`}
          </li>
        </ul>
        {status?.peran === "pml" && (status.ppl_belum?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-[#F0C4BF] bg-[#FFF8F7] p-3">
            <p className="text-[13.5px] font-extrabold text-[#B42329]">{status.ppl_belum?.length} PPL Anda belum mengisi</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[#1B2B4B]">{status.ppl_belum?.join(", ")}. Setelah mengisi, segera ingatkan mereka lewat grup atau telepon.</p>
          </div>
        )}
        {galat && <p className="text-[13px] font-bold text-[#B42329]">{galat}</p>}
        <button type="button" onClick={onMulai} disabled={sibuk} className="min-h-[50px] w-full rounded-xl bg-[#1F5FD1] px-4 text-[16px] font-extrabold text-white shadow-sm disabled:opacity-60">
          {sibuk ? "Memuat soal…" : mengulang ? "Mulai ulangan" : "Mulai"}
        </button>
        <button type="button" onClick={onTunda} disabled={sibuk || menunda} className="min-h-[44px] w-full rounded-xl border border-[#C9D4E8] bg-white px-4 text-[14.5px] font-bold text-[#1B2B4B] disabled:opacity-60">
          {menunda ? "Menyimpan…" : "Ingatkan lagi 2 jam"}
        </button>
        <p className="text-center text-[12.5px] leading-snug text-[#5B6B85]">{infoTunda ? `${infoTunda} ` : ""}Ini hanya menunda notifikasi pengingat; soal tetap wajib diisi.</p>
      </div>
    </>
  );
}

// ====================================================================== soal satu per satu
function Soal({
  set,
  jawaban,
  no,
  sibuk,
  galat,
  onMuatUlang,
  onPilih,
  onNo,
  onKirim,
}: {
  set: QcSetSoal;
  jawaban: Jawaban;
  no: number;
  sibuk: boolean;
  galat: string | null;
  onMuatUlang: () => void;
  onPilih: (id: string, k: "A" | "B" | "C" | "D") => void;
  onNo: (n: number) => void;
  onKirim: () => void;
}) {
  const s = set.soal[no];
  const terjawab = set.soal.filter((x) => jawaban[x.id]).length;
  const semua = terjawab === set.soal.length;
  const akhir = no === set.soal.length - 1;
  if (!s) return null;
  return (
    <>
      <div className="sticky top-0 z-10 bg-[#1E2A47] px-5 pb-3 pt-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <p id="judul-qc" className="text-[11.5px] font-extrabold tracking-wide text-white/85">
            QC PEMAHAMAN · PERCOBAAN {set.ke}/{set.maks_percobaan}
          </p>
          <p className="text-[12.5px] font-extrabold text-[#E0A526]">
            Soal {no + 1} dari {set.soal.length}
          </p>
        </div>
        <div className="mt-2 flex gap-1" role="img" aria-label={`${terjawab} dari ${set.soal.length} soal terjawab`}>
          {set.soal.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => onNo(i)}
              aria-label={`Ke soal ${i + 1}${jawaban[x.id] ? " (sudah dijawab)" : ""}`}
              className={`h-2 flex-1 rounded-full ${i === no ? "bg-white" : jawaban[x.id] ? "bg-[#4FC38A]" : "bg-white/25"}`}
            />
          ))}
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-[11.5px] font-extrabold uppercase tracking-wide text-[#5B6B84]">{s.judul_paket}</p>
        <h3 className="text-[16.5px] font-extrabold leading-snug text-[#0F2A52]">
          <Sorot teks={s.pertanyaan} kata={s.kata_kunci} />
        </h3>
        <div role="radiogroup" aria-label="Pilihan jawaban" className="space-y-2">
          {s.opsi.map((o, i) => {
            const pilih = jawaban[s.id] === o.kode;
            return (
              <button
                key={o.kode}
                type="button"
                role="radio"
                aria-checked={pilih}
                onClick={() => onPilih(s.id, o.kode)}
                className={`flex min-h-[52px] w-full items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-[14.5px] leading-snug transition ${pilih ? "border-[#1F5FD1] bg-[#E6EEFC] text-[#0F2A52]" : "border-[#DDE6F3] bg-white text-[#1B2B4B] active:bg-[#F5F8FE]"}`}
              >
                <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-extrabold ${pilih ? "bg-[#1F5FD1] text-white" : "bg-[#EEF2F7] text-[#5B6B84]"}`}>{String.fromCharCode(65 + i)}</span>
                <span>
                  <Sorot teks={o.teks} kata={s.kata_kunci} />
                </span>
              </button>
            );
          })}
        </div>
        {galat && (
          <div className="rounded-xl border border-[#F0C4BF] bg-[#FFF8F7] p-3">
            <p className="text-[13px] font-bold text-[#B42329]">{galat}</p>
            <button type="button" onClick={onMuatUlang} disabled={sibuk} className="mt-2 min-h-[44px] w-full rounded-lg border border-[#CBD6E6] bg-white px-3 text-[13.5px] font-bold text-[#1B2B4B] disabled:opacity-50">
              Muat ulang soal (jawaban di layar ini dikosongkan)
            </button>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={no === 0 || sibuk} onClick={() => onNo(no - 1)} className="min-h-[48px] flex-1 rounded-xl border border-[#CBD6E6] px-4 text-[14.5px] font-bold text-[#1B2B4B] disabled:opacity-40">
            Sebelumnya
          </button>
          {akhir ? (
            <button type="button" disabled={!semua || sibuk} onClick={onKirim} className="min-h-[48px] flex-[1.4] rounded-xl bg-[#13794B] px-4 text-[14.5px] font-extrabold text-white disabled:opacity-50">
              {sibuk ? "Mengirim…" : semua ? "Kirim jawaban" : `Jawab semua (${terjawab}/${set.soal.length})`}
            </button>
          ) : (
            <button type="button" disabled={!jawaban[s.id]} onClick={() => onNo(no + 1)} className="min-h-[48px] flex-[1.4] rounded-xl bg-[#1F5FD1] px-4 text-[14.5px] font-extrabold text-white disabled:opacity-50">
              Berikutnya
            </button>
          )}
        </div>
        {akhir && !semua && <p className="text-[12.5px] text-[#5B6B84]">Ketuk garis di atas untuk kembali ke soal yang belum dijawab.</p>}
      </div>
    </>
  );
}

// ====================================================================== hasil + pembahasan
function Hasil({
  hasil,
  status,
  saring,
  onSaring,
  sibuk,
  galat,
  onUlang,
  onSelesai,
}: {
  hasil: QcTinjau;
  status: Status | null;
  saring: "salah" | "semua";
  onSaring: (s: "salah" | "semua") => void;
  sibuk: boolean;
  galat: string | null;
  onUlang: () => void;
  onSelesai: () => void;
}) {
  const daftar = saring === "salah" ? hasil.tinjau.filter((t) => !t.benar) : hasil.tinjau;
  const salahN = hasil.tinjau.filter((t) => !t.benar).length;
  return (
    <>
      <div className={`${hasil.lulus ? "bg-[#13794B]" : hasil.perlu_ulang ? "bg-[#B42329]" : "bg-[#8A6200]"} px-5 pb-4 pt-5 text-white`}>
        <p className="text-[11.5px] font-extrabold tracking-wide text-white/85">
          HASIL · PERCOBAAN {hasil.ke}
          {hasil.terlambat ? " · TERLAMBAT" : ""}
        </p>
        <div className="mt-1 flex items-end gap-3">
          <span id="judul-qc" className="text-[44px] font-extrabold leading-none">
            {hasil.skor}
          </span>
          <span className="pb-1 text-[14px] font-bold text-white/90">
            {hasil.benar} dari {hasil.jumlah} benar
          </span>
        </div>
        <p className="mt-1.5 text-[14px] font-bold leading-snug">{kalimatHasil(hasil)}</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {status?.peran === "pml" && (status.ppl_belum?.length ?? 0) > 0 && (
          <p className="rounded-xl border border-[#F0C4BF] bg-[#FFF8F7] p-3 text-[13px] leading-snug text-[#1B2B4B]">
            <b className="text-[#B42329]">{status.ppl_belum?.length} PPL Anda belum mengisi:</b> {status.ppl_belum?.join(", ")}. Segera ingatkan mereka.
          </p>
        )}
        {salahN > 0 && (
          <div role="tablist" aria-label="Tampilkan" className="flex gap-2">
            {(["salah", "semua"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={saring === k}
                onClick={() => onSaring(k)}
                className={`min-h-[40px] rounded-full px-4 text-[13px] font-bold ${saring === k ? "bg-[#0F2A52] text-white" : "border border-[#DDE6F3] bg-white text-[#55657D]"}`}
              >
                {k === "salah" ? `Yang salah (${salahN})` : `Semua (${hasil.jumlah})`}
              </button>
            ))}
          </div>
        )}
        <ol className="space-y-3">
          {daftar.map((t) => (
            <Butir key={t.id} t={t} nomor={hasil.tinjau.indexOf(t) + 1} />
          ))}
        </ol>
        {galat && <p className="text-[13px] font-bold text-[#B42329]">{galat}</p>}
      </div>
      <div className="sticky bottom-0 mt-auto border-t border-[#E3E8EE] bg-white px-5 py-3.5">
        {hasil.perlu_ulang ? (
          <>
            <button type="button" onClick={onUlang} disabled={sibuk} className="min-h-[50px] w-full rounded-xl bg-[#B42329] px-4 text-[15.5px] font-extrabold text-white shadow-sm disabled:opacity-60">
              {sibuk ? "Memuat soal…" : `Ulangi sekarang (sisa ${hasil.sisa_ulang} kali)`}
            </button>
            <p className="mt-1.5 text-center text-[12.5px] text-[#5B6B84]">Pelajari pembahasan di atas dulu, lalu ulangi. Soal diacak ulang.</p>
          </>
        ) : (
          <button type="button" onClick={onSelesai} className="min-h-[50px] w-full rounded-xl bg-[#1F5FD1] px-4 text-[15.5px] font-extrabold text-white shadow-sm">
            Selesai
          </button>
        )}
      </div>
    </>
  );
}

function Butir({ t, nomor }: { t: QcButirTinjau; nomor: number }) {
  return (
    <li className={`rounded-xl border-2 p-3.5 ${t.benar ? "border-[#BFE5D0] bg-[#F5FBF8]" : "border-[#F0C4BF] bg-[#FFF8F7]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-[#5B6B84]">
          Soal {nomor} · {t.judul_paket}
        </span>
        <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${t.benar ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FDE8E8] text-[#B42329]"}`}>{t.benar ? "Benar" : "Salah"}</span>
      </div>
      <p className="mt-1.5 text-[14.5px] font-bold leading-snug text-[#0F2A52]">
        <Sorot teks={t.pertanyaan} kata={t.kata_kunci} />
      </p>
      <ul className="mt-2 space-y-1.5">
        {t.opsi.map((o) => {
          const kunci = o.kode === t.kunci;
          const dipilih = o.kode === t.jawaban;
          const gaya = kunci ? "border-[#13794B] bg-[#E3F6EC]" : dipilih ? "border-[#B42329] bg-[#FDE8E8]" : "border-[#E3E8EE] bg-white";
          return (
            <li key={o.kode} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[13.5px] leading-snug text-[#1B2B4B] ${gaya}`}>
              <span aria-hidden className="mt-px w-4 flex-none text-center font-extrabold">
                {kunci ? "✓" : dipilih ? "✗" : ""}
              </span>
              <span className="min-w-0">
                <Sorot teks={o.teks} kata={t.kata_kunci} />
                {kunci && <b className="ml-1.5 text-[11.5px] text-[#13794B]">Jawaban benar</b>}
                {dipilih && !kunci && <b className="ml-1.5 text-[11.5px] text-[#B42329]">Jawaban Anda</b>}
                {dipilih && kunci && <b className="ml-1.5 text-[11.5px] text-[#13794B]">· pilihan Anda</b>}
              </span>
            </li>
          );
        })}
      </ul>
      {t.penjelasan && (
        <div className="mt-2.5 rounded-lg bg-white/80 px-3 py-2.5">
          <p className="text-[11.5px] font-extrabold uppercase tracking-wide text-[#1F5FD1]">Pembahasan</p>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-[#1B2B4B]">
            <Sorot teks={t.penjelasan} kata={t.kata_kunci} />
          </p>
        </div>
      )}
    </li>
  );
}
