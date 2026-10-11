"use client";

// app/sigap/kegiatan/[id]/[tahap]/RekapIdentifikasi.tsx
//
// (11 Okt 2026) Tombol melayang di pojok kanan bawah tahap Pendataan (terlihat PML dan PPL): rekap seluruh hasil identifikasi, ekspor Excel,
// dan salin gambar per nagari atau per kecamatan -- permintaan user. Yang tampil HANYA Sub SLS dan statusnya (terdampak / tidak terdampak / belum diidentifikasi).
// Sub SLS yang belum diidentifikasi ikut tampil (abu-abu) -- permintaan user; cakupannya SLS yang sudah dialokasikan ke PML. Data diambil saat lembar dibuka (selalu terbaru).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import {
  LABEL_STATUS_REKAP,
  barisExcel,
  barisExcelPerNagari,
  kelompokkan,
  namaBerkasRekap,
  periksaBarisRekap,
  rapikanNama,
  ringkasRekap,
  susunBarisGambar,
  type BarisRekap,
  type TingkatRekap,
} from "@/lib/rekapIdentifikasi";
import { buatGambarRekap } from "./gambarRekap";

type Data = { sekarang: string; baris: BarisRekap[] };

const tglTeks = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const tglKode = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export default function RekapIdentifikasi() {
  const [buka, setBuka] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [tingkat, setTingkat] = useState<TingkatRekap>("nagari");
  const [kunci, setKunci] = useState<string>("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<"gambar" | "excel" | null>(null);
  const tombolTutup = useRef<HTMLButtonElement | null>(null);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return;
    setMemuat(true);
    try {
      const d = await apiPortal<{ sekarang: string; baris: unknown }>("/api/portal/identifikasi/rekap");
      setData({ sekarang: d.sekarang, baris: periksaBarisRekap(d.baris) });
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
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    document.addEventListener("keydown", esc);
    const awal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = awal;
    };
  }, [buka]);

  const baris = data?.baris ?? [];
  const ringkas = useMemo(() => ringkasRekap(baris), [baris]);
  const kelompok = useMemo(() => kelompokkan(baris, tingkat), [baris, tingkat]);
  const terpilih = kelompok.find((k) => k.kunci === kunci) ?? kelompok[0] ?? null;
  const tampilan = useMemo(() => (terpilih ? susunBarisGambar(terpilih, tingkat) : []), [terpilih, tingkat]);

  async function salinGambar() {
    if (!terpilih || !data || sibuk) return;
    setSibuk("gambar");
    setPesan(null);
    const nama = `${namaBerkasRekap(terpilih, tingkat, tglKode(data.sekarang))}.png`;
    const pembuat = buatGambarRekap(terpilih, tingkat, tglTeks(data.sekarang));
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
      XLSX.writeFile(wb, `rekap-identifikasi-${tglKode(data.sekarang)}.xlsx`);
      setPesan("Excel diunduh.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal membuat Excel.");
    } finally {
      setSibuk(null);
    }
  }

  const segmen = (k: TingkatRekap, teks: string) => (
    <button
      key={k}
      type="button"
      onClick={() => {
        setTingkat(k);
        setKunci("");
      }}
      aria-pressed={tingkat === k}
      className={`min-h-[44px] flex-1 rounded-full text-[13px] font-extrabold ${tingkat === k ? "bg-[#0F2A52] text-white" : "text-[#55657D]"}`}
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
        className="fixed right-4 z-40 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#1F5FD1] px-5 text-[14px] font-extrabold text-white shadow-[0_10px_26px_rgba(31,95,209,.45)] active:bg-[#184EAF]"
        style={{ bottom: "max(16px, env(safe-area-inset-bottom))" }}
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
                    {segmen("nagari", "Per nagari")}
                    {segmen("kecamatan", "Per kecamatan")}
                  </div>

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

                  {terpilih && (
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
                            <li key={`i${i}`} className="flex min-h-[40px] items-center justify-between gap-3 border-t border-[#EEF2F7] px-4 py-1.5 text-[13.5px]">
                              <span className="min-w-0 truncate font-semibold text-[#1B2B4B]">{b.teks}</span>
                              <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${b.status === "tidak_terdampak" ? "bg-[#E3F0FA] text-[#12618F]" : b.status === "belum" ? "bg-[#ECEFF4] text-[#55657D]" : "bg-[#E3F6EC] text-[#13794B]"}`}>{LABEL_STATUS_REKAP[b.status]}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <button type="button" onClick={salinGambar} disabled={!terpilih || sibuk !== null} className="min-h-[50px] rounded-[14px] bg-[#1F5FD1] px-3 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
                      {sibuk === "gambar" ? "Membuat gambar…" : "Salin gambar"}
                    </button>
                    <button type="button" onClick={unduhExcel} disabled={sibuk !== null} className="min-h-[50px] rounded-[14px] bg-[#0F2A52] px-3 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
                      {sibuk === "excel" ? "Menyiapkan…" : "Unduh Excel (semua)"}
                    </button>
                  </div>
                  <p aria-live="polite" className="mt-2 min-h-[18px] text-[12.5px] font-semibold text-[#13794B]">
                    {pesan}
                  </p>
                  <p className="text-[11.5px] leading-snug text-[#6B7A90]">Gambar hanya memuat nagari/kecamatan yang dipilih. Excel memuat seluruh Sub SLS pada SLS yang sudah dialokasikan, termasuk yang belum diidentifikasi.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
