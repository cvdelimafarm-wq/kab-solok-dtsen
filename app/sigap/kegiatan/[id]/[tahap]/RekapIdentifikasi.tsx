"use client";

// app/sigap/kegiatan/[id]/[tahap]/RekapIdentifikasi.tsx
//
// (11 Okt 2026) Tombol melayang di pojok kanan bawah tahap Pendataan (terlihat PML dan PPL): rekap seluruh hasil identifikasi, ekspor Excel,
// dan salin gambar per nagari atau per kecamatan -- permintaan user. Yang tampil HANYA Sub SLS dan statusnya (terdampak / tidak terdampak / belum diidentifikasi).
// Tampilan "Per PML" = monitoring target dan realisasi identifikasi tiap PML (permintaan user, 11 Okt 2026).
// (13 Okt 2026) Tiap Sub SLS menampilkan siapa yang mengidentifikasi ("oleh X +N lainnya", diketuk -> rincian petugas) dan tombol "Sanggah"
// (untuk Sub SLS "tidak terdampak" yang nyatanya terdampak): log penyanggah tampil, PML bersangkutan/admin dapat menanggapi, semua pihak terkait dinotifikasi push.
// Sub SLS yang belum diidentifikasi ikut tampil (abu-abu) -- permintaan user; cakupannya SLS yang sudah dialokasikan ke PML. Data diambil saat lembar dibuka (selalu terbaru).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import {
  LABEL_STATUS_REKAP,
  barisExcel,
  barisExcelPerNagari,
  barisExcelPml,
  kelompokkan,
  namaBerkasRekap,
  periksaBarisPmlJadi,
  periksaBarisRekap,
  persenRealisasi,
  rapikanNama,
  ringkasPml,
  ringkasRekap,
  sanggahTerbuka,
  susunBarisTampilan,
  teksPetugas,
  urutPetugas,
  urutkanPml,
  bersihkanTeksSanggah,
  MAKS_TEKS_SANGGAH,
  MIN_ALASAN_SANGGAH,
  MIN_TANGGAPAN_SANGGAH,
  type BarisPml,
  type BarisRekap,
  type SanggahRekap,
  type TingkatRekap,
  type UrutPml,
} from "@/lib/rekapIdentifikasi";
import { buatGambarPml, buatGambarRekap } from "./gambarRekap";

type Data = { sekarang: string; baris: BarisRekap[]; pml: BarisPml[] };
type Mode = TingkatRekap | "pml" | "sanggah";

const wibTeks = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", ":") + " WIB" : "";
const CHIP_SANGGAH: Record<SanggahRekap["status"], { teks: string; kelas: string }> = {
  terbuka: { teks: "Menunggu tanggapan", kelas: "bg-[#FFF1D6] text-[#8A5A00]" },
  dikoreksi: { teks: "Sudah dikoreksi", kelas: "bg-[#E3F6EC] text-[#13794B]" },
  tetap: { teks: "Hasil dipertahankan", kelas: "bg-[#ECEFF4] text-[#55657D]" },
};

const tglTeks = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const tglKode = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** sebaris = tombol ikut alur halaman (PPL, 19 Okt 2026: tidak lagi melayang menutupi tugas); default = melayang di kanan bawah (PML). */
export default function RekapIdentifikasi({ sebaris = false }: { sebaris?: boolean } = {}) {
  const [buka, setBuka] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [mode, setMode] = useState<Mode>("nagari");
  const [urutPml, setUrutPml] = useState<UrutPml>("terendah");
  const tingkat: TingkatRekap = mode === "pml" || mode === "sanggah" ? "nagari" : mode;
  const [kunci, setKunci] = useState<string>("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<"gambar" | "excel" | null>(null);
  const tombolTutup = useRef<HTMLButtonElement | null>(null);
  // (13 Okt 2026) rincian Sub SLS (petugas + sanggahan) dan formulir sanggah/tanggapan
  const [detail, setDetail] = useState<string | null>(null);
  const [formSanggah, setFormSanggah] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [tanggap, setTanggap] = useState<{ id: number; teks: string } | null>(null);
  const [kirim, setKirim] = useState(false);
  const [pesanDetail, setPesanDetail] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  // notifikasi sanggahan membuka rekap langsung di daftar sanggahan (?rekap=sanggah)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("rekap") === "sanggah") {
      setMode("sanggah");
      setBuka(true);
    }
  }, []);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return;
    setMemuat(true);
    try {
      const d = await apiPortal<{ sekarang: string; baris: unknown; pml?: unknown }>("/api/portal/identifikasi/rekap");
      setData({ sekarang: d.sekarang, baris: periksaBarisRekap(d.baris), pml: periksaBarisPmlJadi(d.pml) });
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal memuat rekap. Periksa sambungan lalu coba lagi.");
    } finally {
      setMemuat(false);
    }
  }, []);

  // data selalu diambil ulang saat lembar dibuka supaya terbaru
  useEffect(() => {
    if (buka) {
      setPesan(null);
      muat();
    }
  }, [buka, muat]);

  useEffect(() => {
    if (!buka) return;
    tombolTutup.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detail) tutupDetail();
      else setBuka(false);
    };
    document.addEventListener("keydown", esc);
    const awal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = awal;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, detail]);

  const baris = data?.baris ?? [];
  const pml = data?.pml ?? [];
  const pmlUrut = useMemo(() => urutkanPml(pml.filter((b) => b.target > 0 || b.target_pendamping > 0), urutPml), [pml, urutPml]);
  const ringPml = useMemo(() => ringkasPml(pml), [pml]);
  const ringkas = useMemo(() => ringkasRekap(baris), [baris]);
  const kelompok = useMemo(() => kelompokkan(baris, tingkat), [baris, tingkat]);
  const terpilih = kelompok.find((k) => k.kunci === kunci) ?? kelompok[0] ?? null;
  const tampilan = useMemo(() => (terpilih ? susunBarisTampilan(terpilih, tingkat) : []), [terpilih, tingkat]);
  const adaSanggah = useMemo(
    () =>
      baris
        .filter((b) => (b.sanggah_total ?? 0) > 0)
        .sort((a, b) => sanggahTerbuka(b) - sanggahTerbuka(a) || String(b.sanggah?.[0]?.waktu ?? "").localeCompare(String(a.sanggah?.[0]?.waktu ?? ""))),
    [baris]
  );
  const jumlahTerbuka = useMemo(() => baris.reduce((a, b) => a + sanggahTerbuka(b), 0), [baris]);
  const bukaDetail = baris.find((b) => b.idsubsls === detail) ?? null;

  function tutupDetail() {
    setDetail(null);
    setFormSanggah(false);
    setAlasan("");
    setTanggap(null);
    setPesanDetail(null);
  }

  async function kirimAksi(isi: Record<string, unknown>, sukses: string) {
    if (kirim) return;
    setKirim(true);
    setPesanDetail(null);
    try {
      await apiPortal("/api/portal/identifikasi/sanggah", { method: "POST", body: JSON.stringify({ ...isi, url: window.location.pathname }) });
      setPesanDetail({ jenis: "ok", teks: sukses });
      setFormSanggah(false);
      setAlasan("");
      setTanggap(null);
      await muat();
    } catch (e) {
      setPesanDetail({ jenis: "galat", teks: e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim. Periksa sambungan lalu coba lagi." });
    } finally {
      setKirim(false);
    }
  }

  async function salinGambar() {
    if (!data || sibuk) return;
    if (mode === "pml" ? pmlUrut.length === 0 : !terpilih) return;
    setSibuk("gambar");
    setPesan(null);
    const nama = mode === "pml" || !terpilih ? `target-realisasi-identifikasi-per-pml-${tglKode(data.sekarang)}.png` : `${namaBerkasRekap(terpilih, tingkat, tglKode(data.sekarang))}.png`;
    const pembuat = mode === "pml" || !terpilih ? buatGambarPml(pml, urutPml, tglTeks(data.sekarang)) : buatGambarRekap(terpilih, tingkat, tglTeks(data.sekarang));
    try {
      // Promise diberikan langsung ke ClipboardItem supaya tetap dalam satu ketukan (dibutuhkan Safari)
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pembuat })]);
        setPesan("Gambar disalin. Tempelkan di WhatsApp atau dokumen.");
        return;
      }
      throw new Error("tanpa-clipboard");
    } catch {
      try {
        const blob = await pembuat;
        const berkas = new File([blob], nama, { type: "image/png" });
        if (navigator.canShare?.({ files: [berkas] })) {
          try {
            await navigator.share({ files: [berkas], title: nama });
            setPesan("Gambar dibagikan.");
            return;
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return;
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nama;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setPesan("Peramban ini tidak bisa menyalin gambar, jadi gambar diunduh.");
      } catch (e) {
        setPesan(e instanceof Error ? e.message : "Gagal membuat gambar.");
      }
    } finally {
      setSibuk(null);
    }
  }

  async function unduhExcel() {
    if (!data || sibuk || baris.length === 0) return;
    setSibuk("excel");
    setPesan(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisExcel(baris)), "Rekap Sub SLS");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisExcelPerNagari(baris)), "Per Nagari");
      if (pml.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisExcelPml(pml)), "Target-Realisasi PML");
      XLSX.writeFile(wb, `rekap-identifikasi-${tglKode(data.sekarang)}.xlsx`);
      setPesan("Excel diunduh.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal membuat Excel.");
    } finally {
      setSibuk(null);
    }
  }

  const segmen = (k: Mode, teks: string) => (
    <button
      key={k}
      type="button"
      onClick={() => {
        setMode(k);
        setKunci("");
        setPesan(null);
      }}
      aria-pressed={mode === k}
      className={`min-h-[44px] flex-1 rounded-full px-1 text-[12.5px] font-extrabold ${mode === k ? "bg-[#0F2A52] text-white" : "text-[#55657D]"}`}
    >
      {teks}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        aria-haspopup="dialog"
        className={sebaris
          ? "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] bg-white px-5 text-[14px] font-extrabold text-[#1F5FD1] shadow-[0_8px_22px_rgba(15,42,82,.08)] active:bg-[#EAF1FC]"
          : "fixed right-4 z-40 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#1F5FD1] px-5 text-[14px] font-extrabold text-white shadow-[0_10px_26px_rgba(31,95,209,.45)] active:bg-[#184EAF]"}
        style={sebaris ? undefined : { bottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M4 10h16M10 4v16" />
        </svg>
        Rekap identifikasi
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/55 sm:items-center" onClick={() => setBuka(false)}>
          <div role="dialog" aria-modal="true" aria-label="Rekap hasil identifikasi" className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-t-[26px] bg-[#F5F8FE] shadow-[0_-12px_40px_rgba(15,42,82,.3)] sm:rounded-[26px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-5 pb-2 pt-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Rekap hasil identifikasi</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-[#55657D]">
                  {data ? `${ringkas.total} Sub SLS · ${ringkas.terdampak} terdampak · ${ringkas.tidak} tidak terdampak · ${ringkas.belum} belum · ${ringkas.nagari} nagari` : "Memuat…"}
                </p>
              </div>
              <button ref={tombolTutup} type="button" onClick={() => setBuka(false)} aria-label="Tutup" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-[#0F2A52] shadow-[0_2px_8px_rgba(15,42,82,.12)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-5">
              {galat && (
                <p className="mb-3 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
                  {galat}{" "}
                  <button type="button" onClick={muat} className="font-extrabold underline">
                    Coba lagi
                  </button>
                </p>
              )}
              {memuat && !data && <div className="h-40 animate-pulse rounded-[18px] bg-white" aria-busy="true" />}

              {data && baris.length === 0 && !galat && <p className="rounded-[18px] bg-white px-4 py-8 text-center text-[13.5px] text-[#5B6B84]">Belum ada Sub SLS yang dialokasikan untuk diidentifikasi.</p>}

              {data && baris.length > 0 && (
                <>
                  <div className="flex gap-1 rounded-full bg-white p-1 shadow-[0_2px_8px_rgba(15,42,82,.08)]" role="group" aria-label="Tingkat rekap">
                    {segmen("nagari", "Nagari")}
                    {segmen("kecamatan", "Kecamatan")}
                    {segmen("pml", "Per PML")}
                    {segmen("sanggah", jumlahTerbuka > 0 ? `Sanggah (${jumlahTerbuka})` : "Sanggah")}
                  </div>

                  {mode === "pml" && (
                    <div className="mt-3">
                      <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                        <div className="flex items-baseline justify-between gap-2">
                          <b className="text-[15px] text-[#0F2A52]">Target &amp; realisasi identifikasi</b>
                          <span className="text-[20px] font-extrabold text-[#1F5FD1]">{ringPml.persen}%</span>
                        </div>
                        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#E6ECF5]" role="progressbar" aria-valuenow={ringPml.persen} aria-valuemin={0} aria-valuemax={100} aria-label="Realisasi identifikasi seluruh PML">
                          <div className="h-full rounded-full bg-[#1F5FD1]" style={{ width: `${ringPml.persen}%` }} />
                        </div>
                        <p className="mt-2 text-[12.5px] leading-snug text-[#55657D]">
                          {ringPml.realisasi} dari {ringPml.target} Sub SLS sudah diidentifikasi · {ringPml.belum} belum · {ringPml.selesai} dari {ringPml.pml} PML selesai
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Urutkan</span>
                        <div className="flex gap-1 rounded-full bg-white p-1 shadow-[0_2px_8px_rgba(15,42,82,.08)]" role="group" aria-label="Urutan PML">
                          {(["terendah", "nama"] as UrutPml[]).map((u) => (
                            <button key={u} type="button" aria-pressed={urutPml === u} onClick={() => setUrutPml(u)} className={`min-h-[36px] rounded-full px-3.5 text-[12.5px] font-extrabold ${urutPml === u ? "bg-[#0F2A52] text-white" : "text-[#55657D]"}`}>
                              {u === "terendah" ? "Terendah dulu" : "Nama"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <ul className="mt-2.5 overflow-hidden rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                        {pmlUrut.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-[#5B6B84]">Data target per PML belum tersedia.</li>}
                        {pmlUrut.map((b) => {
                          const p = persenRealisasi(b.realisasi, b.target);
                          return (
                            <li key={b.id} className="border-t border-[#EEF2F7] px-4 py-2.5 first:border-t-0">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 truncate text-[14px] font-bold text-[#1B2B4B]">{rapikanNama(b.nama)}</span>
                                <span className={`flex-none text-[13.5px] font-extrabold ${p >= 100 ? "text-[#13794B]" : b.target > 0 && b.realisasi === 0 ? "text-[#B42329]" : "text-[#0F2A52]"}`}>
                                  {b.target > 0 ? `${b.realisasi}/${b.target} · ${p}%` : "–"}
                                </span>
                              </div>
                              {b.target > 0 && (
                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#E6ECF5]">
                                  <div className={`h-full rounded-full ${p >= 100 ? "bg-[#13794B]" : "bg-[#1F5FD1]"}`} style={{ width: `${p}%` }} />
                                </div>
                              )}
                              <p className="mt-1 text-[11.5px] text-[#6B7A90]">
                                {b.target > 0 ? `${b.terdampak} terdampak · ${b.tidak} tidak terdampak · ${b.target - b.realisasi} belum` : "Tidak menjadi pelaksana"}
                                {b.target_pendamping > 0 && ` · pendamping ${b.realisasi_pendamping}/${b.target_pendamping}`}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {mode === "sanggah" && (
                    <div className="mt-3">
                      <p className="rounded-[14px] bg-white px-3.5 py-2.5 text-[12.5px] leading-snug text-[#55657D] shadow-[0_2px_8px_rgba(15,42,82,.08)]">
                        Sanggahan = Sub SLS dinyatakan <b>tidak terdampak</b> padahal nyatanya terdampak. Untuk menyanggah, ketuk Sub SLS (status Tidak terdampak) di tab Nagari atau Kecamatan, lalu ketuk <b>Sanggah</b>.
                      </p>
                      <ul className="mt-2.5 overflow-hidden rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                        {adaSanggah.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-[#5B6B84]">Belum ada sanggahan.</li>}
                        {adaSanggah.map((b) => (
                          <li key={b.idsubsls} className="border-t border-[#EEF2F7] first:border-t-0">
                            <button type="button" onClick={() => setDetail(b.idsubsls)} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left">
                              <span className="min-w-0">
                                <span className="block truncate text-[13.5px] font-bold text-[#1B2B4B]">{`${rapikanNama(b.sls)} · ${b.sub_sls}`}</span>
                                <span className="block truncate text-[11.5px] text-[#6B7A90]">{`${rapikanNama(b.nagari)} · ${b.sanggah_total} sanggahan`}</span>
                              </span>
                              <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${sanggahTerbuka(b) > 0 ? "bg-[#FFF1D6] text-[#8A5A00]" : "bg-[#ECEFF4] text-[#55657D]"}`}>{sanggahTerbuka(b) > 0 ? `${sanggahTerbuka(b)} terbuka` : "Selesai"}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(mode === "nagari" || mode === "kecamatan") && (
                  <label className="mt-3 block text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                    {tingkat === "nagari" ? "Pilih nagari" : "Pilih kecamatan"}
                    <select value={terpilih?.kunci ?? ""} onChange={(e) => setKunci(e.target.value)} className="mt-1 min-h-[46px] w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 text-[14px] font-bold text-[#0F2A52]">
                      {kelompok.map((k) => (
                        <option key={k.kunci} value={k.kunci}>
                          {tingkat === "nagari" ? `${rapikanNama(k.judul)} · ${rapikanNama(k.induk ?? "")}` : rapikanNama(k.judul)} ({k.baris.length})
                        </option>
                      ))}
                    </select>
                  </label>
                  )}

                  {(mode === "nagari" || mode === "kecamatan") && terpilih && (
                    <div className="mt-3 overflow-hidden rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                      <div className="border-b border-[#EEF2F7] px-4 py-3">
                        <b className="block text-[15px] text-[#0F2A52]">{tingkat === "nagari" ? `Nagari ${rapikanNama(terpilih.judul)}` : `Kecamatan ${rapikanNama(terpilih.judul)}`}</b>
                        <small className="text-[12px] text-[#55657D]">
                          {terpilih.baris.length} Sub SLS · {terpilih.terdampak} terdampak · {terpilih.tidak} tidak terdampak · {terpilih.belum} belum
                        </small>
                      </div>
                      <ul className="max-h-[38vh] overflow-y-auto">
                        {tampilan.map((b, i) =>
                          b.jenis === "bagian" ? (
                            <li key={`b${i}`} className="flex items-center justify-between bg-[#EAF1FC] px-4 py-1.5 text-[12px] font-extrabold text-[#0F2A52]">
                              <span>{b.teks}</span>
                              <span className="font-semibold text-[#6B7A90]">
                                {b.terdampak} terdampak · {b.tidak} tidak · {b.belum} belum
                              </span>
                            </li>
                          ) : (
                            <li key={`i${i}`} className="border-t border-[#EEF2F7]">
                              {(() => {
                                const x = b.baris;
                                const oleh = teksPetugas(x.petugas);
                                const bisaDiketuk = (x.petugas?.length ?? 0) > 0 || (x.sanggah_total ?? 0) > 0;
                                const terbuka = sanggahTerbuka(x);
                                const isi = (
                                  <>
                                    <span className="min-w-0">
                                      <span className="block truncate text-[13.5px] font-semibold text-[#1B2B4B]">{b.teks}</span>
                                      {oleh && (
                                        <span className={`block truncate text-[11.5px] ${(x.petugas?.length ?? 0) > 1 ? "font-bold text-[#1F5FD1] underline decoration-dotted underline-offset-2" : "text-[#6B7A90]"}`}>
                                          oleh {oleh}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex flex-none flex-col items-end gap-1">
                                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${x.status === "tidak_terdampak" ? "bg-[#E3F0FA] text-[#12618F]" : x.status === "belum" ? "bg-[#ECEFF4] text-[#55657D]" : "bg-[#E3F6EC] text-[#13794B]"}`}>{LABEL_STATUS_REKAP[x.status]}</span>
                                      {terbuka > 0 && <span className="rounded-full bg-[#FFF1D6] px-2 py-0.5 text-[10.5px] font-extrabold text-[#8A5A00]">Disanggah{terbuka > 1 ? ` (${terbuka})` : ""}</span>}
                                    </span>
                                  </>
                                );
                                return bisaDiketuk ? (
                                  <button type="button" onClick={() => setDetail(x.idsubsls)} className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-1.5 text-left" aria-label={`Rincian ${b.teks}`}>
                                    {isi}
                                  </button>
                                ) : (
                                  <div className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-1.5">{isi}</div>
                                );
                              })()}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {mode !== "sanggah" && (
                      <button type="button" onClick={salinGambar} disabled={(mode === "pml" ? pmlUrut.length === 0 : !terpilih) || sibuk !== null} className="min-h-[50px] rounded-[14px] bg-[#1F5FD1] px-3 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
                        {sibuk === "gambar" ? "Membuat gambar…" : "Salin gambar"}
                      </button>
                    )}
                    <button type="button" onClick={unduhExcel} disabled={sibuk !== null} className={`min-h-[50px] rounded-[14px] ${mode === "sanggah" ? "col-span-2 " : ""}bg-[#0F2A52] px-3 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]`}>
                      {sibuk === "excel" ? "Menyiapkan…" : "Unduh Excel (semua)"}
                    </button>
                  </div>
                  <p aria-live="polite" className="mt-2 min-h-[18px] text-[12.5px] font-semibold text-[#13794B]">
                    {pesan}
                  </p>
                  <p className="text-[11.5px] leading-snug text-[#6B7A90]">{mode === "pml" ? "Target = Sub SLS pada SLS yang dialokasikan ke PML sebagai pelaksana; realisasi = yang sudah diidentifikasi. Pendamping dihitung terpisah agar tidak ganda. " : mode === "sanggah" ? "" : "Gambar hanya memuat nagari/kecamatan yang dipilih. Ketuk Sub SLS untuk melihat siapa yang mengidentifikasi dan menyanggah. "}Excel memuat seluruh Sub SLS pada SLS yang sudah dialokasikan, termasuk yang belum diidentifikasi.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {buka && bukaDetail && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0F2A52]/55 sm:items-center" onClick={tutupDetail}>
          <div role="dialog" aria-modal="true" aria-label={`Rincian ${bukaDetail.sls} ${bukaDetail.sub_sls}`} className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-[26px] bg-[#F5F8FE] shadow-[0_-12px_40px_rgba(15,42,82,.3)] sm:rounded-[26px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-5 pb-2 pt-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-extrabold text-[#0F2A52]">{`${rapikanNama(bukaDetail.sls)} · ${bukaDetail.sub_sls}`}</h3>
                <p className="mt-0.5 text-[12px] text-[#55657D]">{`Nagari ${rapikanNama(bukaDetail.nagari)} · Kec. ${rapikanNama(bukaDetail.kecamatan)} · ${LABEL_STATUS_REKAP[bukaDetail.status]}`}</p>
              </div>
              <button type="button" onClick={tutupDetail} aria-label="Tutup rincian" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-[#0F2A52] shadow-[0_2px_8px_rgba(15,42,82,.12)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Diidentifikasi oleh</p>
              <ul className="mt-1.5 overflow-hidden rounded-[16px] bg-white shadow-[0_6px_18px_rgba(15,42,82,.08)]">
                {(bukaDetail.petugas ?? []).length === 0 && <li className="px-4 py-3 text-[13px] text-[#5B6B84]">Belum ada catatan petugas.</li>}
                {urutPetugas(bukaDetail.petugas ?? []).map((p) => (
                  <li key={p.akun_id} className="flex items-center justify-between gap-3 border-t border-[#EEF2F7] px-4 py-2.5 first:border-t-0">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold text-[#1B2B4B]">{p.nama}</span>
                      <span className="block text-[11.5px] text-[#6B7A90]">{`${p.n > 1 ? `${p.n}× simpan · ` : ""}terakhir ${wibTeks(p.waktu) || "–"}`}</span>
                    </span>
                    {p.terakhir && <span className="flex-none rounded-full bg-[#E3F6EC] px-2.5 py-0.5 text-[11px] font-extrabold text-[#13794B]">Hasil berlaku</span>}
                  </li>
                ))}
              </ul>
              {(bukaDetail.petugas ?? []).length > 1 && <p className="mt-1.5 text-[11.5px] leading-snug text-[#6B7A90]">Lebih dari satu petugas pernah menyimpan Sub SLS ini; hasil yang berlaku adalah simpanan terakhir.</p>}

              <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">{`Sanggahan${(bukaDetail.sanggah_total ?? 0) > 0 ? ` (${bukaDetail.sanggah_total})` : ""}`}</p>
              {(bukaDetail.sanggah_total ?? 0) === 0 && <p className="mt-1.5 rounded-[16px] bg-white px-4 py-3 text-[13px] text-[#5B6B84] shadow-[0_6px_18px_rgba(15,42,82,.08)]">Belum ada sanggahan.</p>}
              {(bukaDetail.sanggah ?? []).length > 0 && (
                <ul className="mt-1.5 space-y-2">
                  {(bukaDetail.sanggah ?? []).map((g) => (
                    <li key={g.id} className="rounded-[16px] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(15,42,82,.08)]">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-[13.5px] font-bold text-[#1B2B4B]">{g.nama}</span>
                        <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${CHIP_SANGGAH[g.status].kelas}`}>{CHIP_SANGGAH[g.status].teks}</span>
                      </div>
                      <p className="text-[11.5px] text-[#6B7A90]">{wibTeks(g.waktu)}</p>
                      <p className="mt-1.5 whitespace-pre-line break-words text-[13.5px] leading-snug text-[#1B2B4B]">{g.alasan}</p>
                      {g.tanggapan && (
                        <div className="mt-2 rounded-[12px] bg-[#F1F5FB] px-3 py-2">
                          <p className="text-[11.5px] font-bold text-[#55657D]">{`Ditanggapi ${g.oleh ?? ""} · ${wibTeks(g.waktu_tanggapan)}`}</p>
                          <p className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-snug text-[#1B2B4B]">{g.tanggapan}</p>
                        </div>
                      )}
                      {g.status === "dikoreksi" && <p className="mt-2 text-[11.5px] text-[#13794B]">Sub SLS sudah diidentifikasi ulang sebagai terdampak setelah sanggahan ini.</p>}
                      {g.status === "terbuka" && bukaDetail.dapat_tanggapi && (
                        tanggap?.id === g.id ? (
                          <div className="mt-2">
                            <label className="block text-[11.5px] font-bold text-[#55657D]">
                              Tanggapan (hasil tetap tidak terdampak)
                              <textarea value={tanggap.teks} onChange={(e) => setTanggap({ id: g.id, teks: e.target.value.slice(0, MAKS_TEKS_SANGGAH) })} rows={3} className="mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B]" />
                            </label>
                            <div className="mt-1.5 grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => setTanggap(null)} className="min-h-[44px] rounded-[12px] bg-[#E6ECF5] text-[13px] font-extrabold text-[#0F2A52]">
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={kirim || !bersihkanTeksSanggah(tanggap.teks, MIN_TANGGAPAN_SANGGAH, "Tanggapan").ok}
                                onClick={() => kirimAksi({ aksi: "tanggapi", id: g.id, tanggapan: tanggap.teks }, "Tanggapan terkirim. Penyanggah diberi tahu.")}
                                className="min-h-[44px] rounded-[12px] bg-[#0F2A52] text-[13px] font-extrabold text-white disabled:bg-[#A9BCD8]"
                              >
                                {kirim ? "Mengirim…" : "Kirim tanggapan"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setTanggap({ id: g.id, teks: "" })} className="mt-2 min-h-[44px] w-full rounded-[12px] bg-[#EAF1FC] text-[13px] font-extrabold text-[#1F5FD1]">
                            Tanggapi (hasil tetap)
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {(bukaDetail.sanggah ?? []).length < (bukaDetail.sanggah_total ?? 0) && (
                <p className="mt-1.5 text-[11.5px] leading-snug text-[#6B7A90]">{`${(bukaDetail.sanggah_total ?? 0) - (bukaDetail.sanggah ?? []).length} sanggahan lain hanya terlihat oleh admin, PML bersangkutan, dan petugas yang mengidentifikasi.`}</p>
              )}
              {bukaDetail.dapat_tanggapi && <p className="mt-1.5 text-[11.5px] leading-snug text-[#6B7A90]">Bila memang terdampak, perbaiki lewat halaman identifikasi; sanggahan otomatis ditandai &ldquo;Sudah dikoreksi&rdquo;.</p>}

              {bukaDetail.status === "tidak_terdampak" && (
                <div className="mt-4">
                  {!formSanggah ? (
                    <button type="button" onClick={() => { setFormSanggah(true); setPesanDetail(null); }} className="min-h-[50px] w-full rounded-[14px] bg-[#B45309] px-3 text-[14px] font-extrabold text-white active:bg-[#92400E]">
                      Sanggah: nyatanya terdampak
                    </button>
                  ) : (
                    <div className="rounded-[16px] bg-white p-3.5 shadow-[0_6px_18px_rgba(15,42,82,.08)]">
                      <label className="block text-[12px] font-bold text-[#55657D]">
                        Alasan / bukti di lapangan
                        <textarea value={alasan} onChange={(e) => setAlasan(e.target.value.slice(0, MAKS_TEKS_SANGGAH))} rows={4} placeholder="Contoh: Rumah di RT 02 terendam banjir bandang, 6 KK mengungsi." className="mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B]" />
                      </label>
                      <p className="mt-1 text-[11.5px] leading-snug text-[#6B7A90]">{`${alasan.trim().length}/${MAKS_TEKS_SANGGAH} (minimal ${MIN_ALASAN_SANGGAH}). Nama Anda tercatat sebagai penyanggah, dan petugas pengidentifikasi, PML bersangkutan, serta admin menerima notifikasi.`}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setFormSanggah(false); setAlasan(""); }} className="min-h-[46px] rounded-[12px] bg-[#E6ECF5] text-[13.5px] font-extrabold text-[#0F2A52]">
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={kirim || !bersihkanTeksSanggah(alasan, MIN_ALASAN_SANGGAH, "Alasan").ok}
                          onClick={() => kirimAksi({ aksi: "buat", idsubsls: bukaDetail.idsubsls, alasan }, "Sanggahan terkirim dan dicatat. PML, petugas pengidentifikasi, dan admin diberi tahu.")}
                          className="min-h-[46px] rounded-[12px] bg-[#B45309] text-[13.5px] font-extrabold text-white disabled:bg-[#D9B48A]"
                        >
                          {kirim ? "Mengirim…" : "Kirim sanggahan"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p aria-live="polite" className={`mt-2 min-h-[18px] text-[12.5px] font-semibold ${pesanDetail?.jenis === "galat" ? "text-[#B42329]" : "text-[#13794B]"}`}>
                {pesanDetail?.teks}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
