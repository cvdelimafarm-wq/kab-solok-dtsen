"use client";

// app/sigap/pelatihan/monitoring/SalinStatusWa.tsx
//
// (14 Nov 2026) Templat monitoring pemahaman, K7: salin status pengisian untuk WA. Hanya status pengisian tiap tahapan (tanpa nilai, soal,
// atau jawaban); sejak 15.46 gambar memuat nama peserta (tabel nama × tahapan, putusan Ketua Tim). Gambar tabel (tahapan, terisi, sudah, belum) digambar di kanvas; teks pengantar tetap dari lib/statusPengisianWa.ts.
// Tombol: salin gambar dan teks, salin teks, bagikan ke WhatsApp, simpan gambar.

import { useEffect, useMemo, useRef, useState } from "react";
import { Pesan } from "../../admin/ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { LABEL_PENDEK_WA, LABEL_TAHAPAN_WA, hitungStatusWa, tabelNamaWa, tahapanTersediaWa, teksPengantarWa, type BarisStatusWa, type KodeTahapanWa } from "@/lib/statusPengisianWa";

// (14 Nov 2026, 15.46) Putusan Ketua Tim: gambar memuat nama peserta. Susunan: judul, tabel nama × tahapan dengan ✓ (sudah) / ✗ (belum),
// dan baris REKAP paling bawah (sudah/total tiap tahapan, putusan 15.48). Nilai, soal, dan jawaban tetap tidak ikut.
function potongTeks(g: CanvasRenderingContext2D, t: string, maks: number): string {
  if (g.measureText(t).width <= maks) return t;
  let s = t;
  while (s.length > 1 && g.measureText(`${s}…`).width > maks) s = s.slice(0, -1);
  return `${s}…`;
}

function gambarTabel(c: HTMLCanvasElement, judul: string, sub: string, total: number, tahapan: ReturnType<typeof hitungStatusWa>["tahapan"], nama: ReturnType<typeof tabelNamaWa>, label: string[]) {
  const W = 720;
  const barisH = 34;
  const font = "'Plus Jakarta Sans', Arial, sans-serif";
  const atas = 84;
  const H = atas + barisH * (nama.length + 2) + 30;
  const r = 2;
  c.width = W * r;
  c.height = H * r;
  const g = c.getContext("2d");
  if (!g) return;
  g.scale(r, r);
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#0F2A52";
  g.font = `800 21px ${font}`;
  g.fillText(potongTeks(g, judul, W - 48), 24, 38);
  g.fillStyle = "#55657D";
  g.font = `500 14px ${font}`;
  g.fillText(`${sub} · ${total} orang`, 24, 62);
  // tabel nama × tahapan
  const xNama = 24;
  const lebarNama = label.length > 4 ? 270 : 320;
  const lebarKol = (W - 24 - xNama - lebarNama) / Math.max(1, label.length);
  g.fillStyle = "#F3F6FB";
  g.fillRect(16, atas, W - 32, barisH);
  g.fillStyle = "#1B2B4B";
  g.font = `800 14px ${font}`;
  g.fillText("Nama", xNama, atas + 22);
  label.forEach((l, i) => {
    const x = xNama + lebarNama + lebarKol * i + lebarKol / 2;
    g.textAlign = "center";
    g.fillText(l, x, atas + 22);
    g.textAlign = "left";
  });
  nama.forEach((o, i) => {
    const y = atas + barisH * (i + 1);
    if (i % 2 === 1) {
      g.fillStyle = "#FAFBFD";
      g.fillRect(16, y, W - 32, barisH);
    }
    g.strokeStyle = "#E3E8EE";
    g.beginPath();
    g.moveTo(16, y);
    g.lineTo(W - 16, y);
    g.stroke();
    g.fillStyle = "#1B2B4B";
    g.font = `600 14px ${font}`;
    g.fillText(potongTeks(g, `${i + 1}. ${o.nama}`, lebarNama - 10), xNama, y + 22);
    g.font = `800 16px ${font}`;
    o.sudah.forEach((v, j) => {
      g.fillStyle = v ? "#13794B" : "#B42329";
      g.textAlign = "center";
      g.fillText(v ? "✓" : "✗", xNama + lebarNama + lebarKol * j + lebarKol / 2, y + 23);
      g.textAlign = "left";
    });
  });
  // baris rekap paling bawah: sudah/total tiap tahapan
  const yRekap = atas + barisH * (nama.length + 1);
  g.fillStyle = "#E8EEF8";
  g.fillRect(16, yRekap, W - 32, barisH);
  g.strokeStyle = "#0F2A52";
  g.beginPath();
  g.moveTo(16, yRekap);
  g.lineTo(W - 16, yRekap);
  g.stroke();
  g.fillStyle = "#0F2A52";
  g.font = `800 14px ${font}`;
  g.fillText(`Rekap sudah (dari ${total})`, xNama, yRekap + 22);
  tahapan.forEach((t, j) => {
    g.fillStyle = t.belum > 0 ? "#B42329" : "#13794B";
    g.textAlign = "center";
    g.fillText(`${t.sudah}/${total}`, xNama + lebarNama + lebarKol * j + lebarKol / 2, yRekap + 22);
    g.textAlign = "left";
  });
  g.fillStyle = "#8794A8";
  g.font = `500 12px ${font}`;
  g.fillText("✓ sudah · ✗ belum · SIGAP · BPS Kabupaten Solok", 24, H - 10);
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
  const dipilih = useMemo(() => tersedia.filter((t) => pilih.includes(t)), [pilih, tersedia]);
  const status = useMemo(() => hitungStatusWa(baris, kelas, dipilih), [baris, kelas, dipilih]);
  const tabelNama = useMemo(() => tabelNamaWa(baris, kelas, dipilih), [baris, kelas, dipilih]);
  const tautan = typeof window !== "undefined" ? `${window.location.origin}/sigap/pelatihan${kegiatanId ? `?kegiatan=${kegiatanId}` : ""}` : "";
  const teks = teksPengantarWa({ kegiatan, kelas, waktu, tautan });
  const sub = `${kelas === null ? "Semua kelas" : `Kelas ${kelas}`} · ${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(waktu)} WIB`;

  useEffect(() => {
    const c = kanvas.current ?? document.createElement("canvas");
    kanvas.current = c;
    gambarTabel(c, `Status pengisian · ${kegiatan}`, sub, status.total, status.tahapan, tabelNama, dipilih.map((k) => LABEL_PENDEK_WA[k]));
    setGambarUrl(c.toDataURL("image/png"));
  }, [kegiatan, sub, status, tabelNama, dipilih]);

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
        <p className="m-0 mb-2 text-[12px] text-[#55657D]">Gambar berisi nama peserta dan status tiap tahapan (✓ sudah, ✗ belum). Nilai, soal, dan jawaban tidak ikut.</p>
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
