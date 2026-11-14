"use client";

// app/sigap/pelatihan/monitoring/SalinStatusWa.tsx
//
// (14 Nov 2026) Templat monitoring pemahaman, K7: salin status pengisian untuk WA. Hanya status pengisian tiap tahapan (tanpa nilai, soal,
// jawaban, atau nama orang). Gambar tabel (tahapan, terisi, sudah, belum) digambar di kanvas; teks pengantar tetap dari lib/statusPengisianWa.ts.
// Tombol: salin gambar dan teks, salin teks, bagikan ke WhatsApp, simpan gambar.

import { useEffect, useMemo, useRef, useState } from "react";
import { Pesan } from "../../admin/ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { LABEL_TAHAPAN_WA, hitungStatusWa, tahapanTersediaWa, teksPengantarWa, type BarisStatusWa, type KodeTahapanWa } from "@/lib/statusPengisianWa";

function gambarTabel(c: HTMLCanvasElement, judul: string, sub: string, total: number, tahapan: ReturnType<typeof hitungStatusWa>["tahapan"]) {
  const W = 720;
  const barisH = 48;
  const atas = 104;
  const H = atas + barisH * (tahapan.length + 1) + 28;
  const r = 2;
  c.width = W * r;
  c.height = H * r;
  const g = c.getContext("2d");
  if (!g) return;
  g.scale(r, r);
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#0F2A52";
  g.font = "800 22px 'Plus Jakarta Sans', Arial, sans-serif";
  g.fillText(judul, 24, 40);
  g.fillStyle = "#55657D";
  g.font = "500 15px 'Plus Jakarta Sans', Arial, sans-serif";
  g.fillText(sub, 24, 66);
  g.fillText(`${total} orang`, 24, 88);
  const kolom = [24, 330, 450, 580];
  const kepala = ["Tahapan", "Terisi", "Sudah", "Belum"];
  g.fillStyle = "#F3F6FB";
  g.fillRect(16, atas, W - 32, barisH);
  g.fillStyle = "#1B2B4B";
  g.font = "800 16px 'Plus Jakarta Sans', Arial, sans-serif";
  kepala.forEach((h, i) => g.fillText(h, kolom[i], atas + 30));
  tahapan.forEach((t, i) => {
    const y = atas + barisH * (i + 1);
    g.strokeStyle = "#E3E8EE";
    g.beginPath();
    g.moveTo(16, y);
    g.lineTo(W - 16, y);
    g.stroke();
    g.font = "600 16px 'Plus Jakarta Sans', Arial, sans-serif";
    g.fillStyle = "#1B2B4B";
    g.fillText(t.label, kolom[0], y + 30);
    g.fillText(t.terisi, kolom[1], y + 30);
    g.fillStyle = "#13794B";
    g.fillText(String(t.sudah), kolom[2], y + 30);
    g.fillStyle = t.belum > 0 ? "#B42329" : "#8794A8";
    g.font = "800 16px 'Plus Jakarta Sans', Arial, sans-serif";
    g.fillText(String(t.belum), kolom[3], y + 30);
  });
  g.fillStyle = "#8794A8";
  g.font = "500 12px 'Plus Jakarta Sans', Arial, sans-serif";
  g.fillText("SIGAP · BPS Kabupaten Solok", 24, H - 10);
}

export default function SalinStatusWa({ baris, kegiatan, kegiatanId }: { baris: BarisStatusWa[]; kegiatan: string; kegiatanId: number | null }) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className="min-h-[38px] rounded-full bg-[#1E8E4E] px-3.5 text-[12.5px] font-extrabold text-white">
        Salin status untuk WA
      </button>
      {buka && <Lembar baris={baris} kegiatan={kegiatan} kegiatanId={kegiatanId} onTutup={() => setBuka(false)} />}
    </>
  );
}

function Lembar({ baris, kegiatan, kegiatanId, onTutup }: { baris: BarisStatusWa[]; kegiatan: string; kegiatanId: number | null; onTutup: () => void }) {
  useTutupDenganBack(true, onTutup);
  const kelasAda = useMemo(() => [...new Set(baris.map((b) => b.kelas).filter((k): k is number => k !== null))].sort((a, b) => a - b), [baris]);
  const [kelas, setKelas] = useState<number | null>(kelasAda.length === 1 ? kelasAda[0] : null);
  const tersedia = useMemo(() => tahapanTersediaWa(baris), [baris]);
  const [pilih, setPilih] = useState<KodeTahapanWa[]>(tersedia);
  const [waktu] = useState(() => new Date());
  const [pesan, setPesan] = useState<{ jenis: "info" | "galat"; teks: string } | null>(null);
  const kanvas = useRef<HTMLCanvasElement | null>(null);
  const [gambarUrl, setGambarUrl] = useState<string | null>(null);
  const status = useMemo(() => hitungStatusWa(baris, kelas, tersedia.filter((t) => pilih.includes(t))), [baris, kelas, pilih, tersedia]);
  const tautan = typeof window !== "undefined" ? `${window.location.origin}/sigap/pelatihan${kegiatanId ? `?kegiatan=${kegiatanId}` : ""}` : "";
  const teks = teksPengantarWa({ kegiatan, kelas, waktu, tautan });
  const sub = `${kelas === null ? "Semua kelas" : `Kelas ${kelas}`} · ${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(waktu)} WIB`;

  useEffect(() => {
    const c = kanvas.current ?? document.createElement("canvas");
    kanvas.current = c;
    gambarTabel(c, `Status pengisian · ${kegiatan}`.slice(0, 60), sub, status.total, status.tahapan);
    setGambarUrl(c.toDataURL("image/png"));
  }, [kegiatan, sub, status]);

  const blobGambar = () => new Promise<Blob | null>((res) => (kanvas.current ? kanvas.current.toBlob((b) => res(b), "image/png") : res(null)));
  const ok = (t: string) => setPesan({ jenis: "info", teks: t });
  const gagal = (t: string) => setPesan({ jenis: "galat", teks: t });

  async function salinKeduanya() {
    try {
      const b = await blobGambar();
      if (!b || typeof ClipboardItem === "undefined") throw new Error("x");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": b, "text/plain": new Blob([teks], { type: "text/plain" }) })]);
      ok("Gambar dan teks tersalin. Tempel di WhatsApp.");
    } catch {
      gagal("Peramban ini belum bisa menyalin gambar. Pakai Bagikan ke WhatsApp atau Simpan gambar, lalu Salin teks.");
    }
  }
  async function salinTeks() {
    try {
      await navigator.clipboard.writeText(teks);
      ok("Teks tersalin.");
    } catch {
      gagal("Teks belum dapat disalin.");
    }
  }
  async function bagikan() {
    const b = await blobGambar();
    const berkas = b ? new File([b], "status-pengisian.png", { type: "image/png" }) : null;
    try {
      if (berkas && navigator.canShare?.({ files: [berkas] })) {
        await navigator.share({ files: [berkas], text: teks });
        return;
      }
    } catch {
      return; // dibatalkan pengguna
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(teks)}`, "_blank", "noopener");
  }
  function simpan() {
    if (!gambarUrl) return;
    const a = document.createElement("a");
    a.href = gambarUrl;
    a.download = "status-pengisian.png";
    a.click();
  }
  const ubah = (k: KodeTahapanWa) => setPilih((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const chip = (aktif: boolean) => `min-h-[34px] rounded-full px-3 text-[12.5px] font-bold ${aktif ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Salin status pengisian untuk WA" onClick={onTutup}>
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-t-[20px] bg-white p-4 sm:rounded-[20px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <b className="text-[15px] text-[#0F2A52]">Salin status pengisian untuk WA</b>
          <button type="button" onClick={onTutup} className="min-h-[40px] min-w-[40px] rounded-full bg-[#EEF2F8] font-bold" aria-label="Tutup">
            ✕
          </button>
        </div>
        <p className="m-0 mb-2 text-[12px] text-[#55657D]">Hanya status pengisian tiap tahapan. Nilai, soal, jawaban, dan nama tidak ikut.</p>
        {kelasAda.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Pilih kelas">
            <button type="button" aria-pressed={kelas === null} onClick={() => setKelas(null)} className={chip(kelas === null)}>
              Semua kelas
            </button>
            {kelasAda.map((k) => (
              <button key={k} type="button" aria-pressed={kelas === k} onClick={() => setKelas(k)} className={chip(kelas === k)}>
                Kelas {k}
              </button>
            ))}
          </div>
        )}
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Pilih tahapan">
          {tersedia.map((k) => (
            <button key={k} type="button" aria-pressed={pilih.includes(k)} onClick={() => ubah(k)} className={chip(pilih.includes(k))}>
              {LABEL_TAHAPAN_WA[k]}
            </button>
          ))}
        </div>
        {gambarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gambarUrl} alt="Gambar tabel status pengisian" className="block w-full rounded-lg border border-[#DDE6F3]" />
        )}
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#F5F8FC] p-2.5 font-sans text-[12.5px] text-[#1B2B4B]">{teks}</pre>
        {pesan && <Pesan jenis={pesan.jenis}>{pesan.teks}</Pesan>}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void salinKeduanya()} className="min-h-[44px] rounded-xl bg-[#0F2A52] text-[13px] font-extrabold text-white">
            Salin gambar dan teks
          </button>
          <button type="button" onClick={() => void salinTeks()} className="min-h-[44px] rounded-xl border-2 border-[#0F2A52] text-[13px] font-extrabold text-[#0F2A52]">
            Salin teks
          </button>
          <button type="button" onClick={() => void bagikan()} className="min-h-[44px] rounded-xl bg-[#1E8E4E] text-[13px] font-extrabold text-white">
            Bagikan ke WhatsApp
          </button>
          <button type="button" onClick={simpan} className="min-h-[44px] rounded-xl border-2 border-[#0F2A52] text-[13px] font-extrabold text-[#0F2A52]">
            Simpan gambar
          </button>
        </div>
      </div>
    </div>
  );
}
