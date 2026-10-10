"use client";

// app/sigap/kegiatan/[id]/page.tsx
//
// (8 Okt 2026) Layer 2 struktur 3 layer (mockup disetujui user): tahapan bernomor satu kegiatan. Kartu "Kerjakan sekarang" ditempel di atas,
// langkah dikelompokkan Persiapan / Pelaksanaan / Penyelesaian dengan keterangan "Langkah x dari n"; kelompok yang sudah selesai diringkas.
// Untuk Transport Lokal (adapter lib/portal/kegiatan.ts; id "translok-<penugasan>").
// (9 Okt 2026) Id lain = kegiatan INDUK (mis. "pascabencana") -> garis waktu tahap (./Induk.tsx). Transport Lokal yang dibuka dari sebuah tahap
// membawa ?dari=<halaman tahap> supaya tombol kembali pulang ke tahap itu, bukan ke Beranda.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { Cincin } from "@/app/portal/CincinKegiatan";
import { keAtas } from "@/app/portal/navigasi";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { KELOMPOK_URUT, langkahKe, type KelompokLangkah, type LangkahKegiatan, type RingkasKegiatan, type StatusLangkah } from "@/lib/sigapKegiatan";
import { sisaTeks } from "@/lib/sigapTugasUtama";
import HalamanInduk from "./Induk";

const BULAT: Record<StatusLangkah, string> = {
  selesai: "bg-[#E3F6EC] text-[#13794B] border-[1.5px] border-[#BFE6D0]",
  mendesak: "bg-[#F4B400] text-[#0F2A52] shadow-[0_4px_10px_rgba(244,180,0,.4)]",
  perlu: "bg-[#FFF4D6] text-[#8A6200]",
  sekarang: "bg-[#0F2A52] text-[#F4B400]",
  berjalan: "bg-white text-[#1F5FD1] border-2 border-[#1F5FD1]",
  menunggu: "bg-white text-[#8B99AE] border-[1.5px] border-dashed border-[#C5D0E2]",
  terkunci: "bg-white text-[#8B99AE] border-[1.5px] border-dashed border-[#C5D0E2]",
};
const LATAR: Partial<Record<StatusLangkah, string>> = { sekarang: "bg-[#F1F6FE]", mendesak: "bg-[#FFF3F3]", perlu: "bg-[#FFFBEF]" };
const CHIP: Record<StatusLangkah, { teks: string; kelas: string }> = {
  selesai: { teks: "Selesai", kelas: "text-[#13794B]" },
  mendesak: { teks: "Mendesak", kelas: "bg-[#FDE8E8] text-[#B42329]" },
  perlu: { teks: "Perlu dilengkapi", kelas: "bg-[#FFF4D6] text-[#8A6200]" },
  sekarang: { teks: "Sekarang", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  berjalan: { teks: "Berjalan", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  menunggu: { teks: "Menunggu", kelas: "text-[#8B99AE]" },
  terkunci: { teks: "Terkunci", kelas: "text-[#8B99AE]" },
};

function BarisLangkah({ l }: { l: LangkahKegiatan }) {
  const [pesan, setPesan] = useState(false);
  const kunciHari = !!l.pesanKunci; // (10 Okt 2026) terkunci di luar hari kerja: tampil terkunci, ketukan memunculkan pesan
  const c = kunciHari ? CHIP.terkunci : CHIP[l.status];
  const bisa = !kunciHari && !!l.href && l.status !== "terkunci";
  const redup = l.status === "terkunci" || l.status === "menunggu" || kunciHari;
  const isi = (
    <>
      <span className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[13px] font-extrabold ${BULAT[l.status]}`}>{l.no}</span>
      <span className="min-w-0 flex-1">
        <b className={`block text-[13.5px] ${redup ? "text-[#8B99AE]" : "text-[#0F2A52]"}`}>{l.judul}</b>
        <small className="block text-[11.5px] leading-snug text-[#6B7A90]">{l.ket}</small>
      </span>
      <span className={`flex flex-none items-center gap-1 rounded-[9px] text-[11px] font-bold ${l.status === "selesai" || l.status === "menunggu" || l.status === "terkunci" ? "" : "px-2 py-[3px]"} ${c.kelas}`}>
        {l.status === "selesai" && <IkonMenu n="tanda" className="h-3 w-3" />}
        {(l.status === "terkunci" || kunciHari) && <IkonMenu n="kunci" className="h-3 w-3" />}
        {c.teks}
      </span>
      {bisa && <IkonMenu n="panah" className="h-4 w-4 text-[#A5B3C7]" />}
    </>
  );
  const kelas = `flex min-h-[52px] items-center gap-[11px] border-b border-[#EEF2F7] px-3.5 py-2.5 last:border-b-0 ${LATAR[l.status] ?? ""}`;
  if (kunciHari)
    return (
      <div className="border-b border-[#EEF2F7] last:border-b-0">
        <button type="button" onClick={() => setPesan((v) => !v)} aria-expanded={pesan} className={`${kelas} w-full border-b-0 text-left transition active:bg-[#EAF1FC]`}>
          {isi}
        </button>
        {pesan && (
          <p role="alert" className="mx-3.5 mb-2.5 rounded-[12px] border-l-4 border-[#F4B400] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold leading-snug text-[#6B4A00]">
            {l.pesanKunci}
          </p>
        )}
      </div>
    );
  return bisa ? (
    <Link href={l.href!} className={`${kelas} transition active:bg-[#EAF1FC]`}>
      {isi}
    </Link>
  ) : (
    <div className={kelas}>{isi}</div>
  );
}

/** Tujuan "kembali" dari ?dari= -- hanya jalur internal /sigap/ (cegah pengalihan ke luar). */
function tujuanDari(x: string | null): string | null {
  if (!x || x.length > 100 || !x.startsWith("/sigap/") || x.includes("//") || x.includes("..") || x.includes("\\")) return null;
  return x;
}

export default function HalamanKegiatan() {
  const { id } = useParams<{ id: string }>();
  if (!id.startsWith("translok-")) return <HalamanInduk kode={id} />;
  return <HalamanTranslok id={id} />;
}

function HalamanTranslok({ id }: { id: string }) {
  const router = useRouter();
  // dibaca dari alamat setelah tampil (tanpa useSearchParams -> tak perlu batas Suspense)
  const [dari, setDari] = useState<string | null>(null);
  useEffect(() => {
    setDari(tujuanDari(new URLSearchParams(window.location.search).get("dari")));
  }, []);
  const [k, setK] = useState<RingkasKegiatan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [, setTik] = useState(0);
  const [buka, setBuka] = useState<Record<string, boolean>>({});

  const muat = useCallback(async () => {
    if (!bacaSesi()) return router.replace("/");
    try {
      const d = await apiPortal<{ sekarang: string; kegiatan: RingkasKegiatan[] }>(`/api/portal/kegiatan?id=${encodeURIComponent(id)}`);
      setOffset(Date.parse(d.sekarang) - Date.now());
      setK(d.kegiatan[0] ?? null);
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [id, router]);

  useEffect(() => {
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 45_000);
    const b = setInterval(() => setTik((x) => x + 1), 30_000);
    const c = () => document.visibilityState === "visible" && muat();
    document.addEventListener("visibilitychange", c);
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener("visibilitychange", c);
    };
  }, [muat]);

  const nowMs = Date.now() + offset;
  const langkah = useMemo(() => k?.langkah ?? [], [k]);
  const { ke, total } = langkahKe(langkah);
  const sekarang = useMemo(() => {
    const urut: StatusLangkah[] = ["mendesak", "perlu", "sekarang"];
    for (const st of urut) {
      const l = langkah.find((x) => x.status === st);
      if (l) return l;
    }
    return null;
  }, [langkah]);
  const semuaSelesai = langkah.length > 0 && langkah.every((l) => l.status === "selesai");

  const kelompok = KELOMPOK_URUT.map((nama) => ({ nama, isi: langkah.filter((l) => l.kelompok === nama) })).filter((g) => g.isi.length > 0);
  const adaYangBelum = langkah.some((l) => l.status !== "selesai");
  const ringkas = (g: { nama: KelompokLangkah; isi: LangkahKegiatan[] }) => !buka[g.nama] && adaYangBelum && g.isi.every((l) => l.status === "selesai");

  const sisa = sekarang?.batas ? (Date.parse(sekarang.batas) - nowMs) / 1000 : null;

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-[62px] pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <button type="button" onClick={() => keAtas(router, dari ?? "/")} aria-label={dari ? "Kembali ke tahap" : "Kembali ke Beranda"} className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/15 active:bg-white/25">
            <IkonMenu n="kembali" className="h-5 w-5 text-white" />
          </button>
          <span className="text-[12.5px] font-bold text-[#D3E0F5]">{dari ? "Tahap kegiatan" : "Beranda · Kegiatan saya"}</span>
        </div>
        <div className="relative mx-auto mt-3 flex max-w-xl items-center gap-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.3px]">{k?.judul ?? "Kegiatan"}</h1>
            {k && total > 0 && <p className="mt-1.5 text-[12px] text-[#A9BCD8]">Langkah {ke} dari {total}</p>}
          </div>
          {k && (
            <span className="relative grid flex-none place-items-center">
              <Cincin k={k} ukuran={70} gelap />
              <span className="absolute text-center leading-none">
                <b className="block text-[16px]">{k.selesai}/{k.total}</b>
                <span className="mt-0.5 block text-[8.5px] text-[#A9BCD8]">selesai</span>
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-[44px] max-w-xl space-y-4 px-3.5">
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!k && !galat && (
          <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-10 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}

        {k && sekarang && (
          <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-label="Kerjakan sekarang">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-extrabold tracking-[0.16em] text-[#B8860B]">KERJAKAN SEKARANG</span>
              {sisa != null && sisa > 0 && (
                <span className={`ml-auto rounded-[9px] px-2 py-[3px] text-[11px] font-bold ${sekarang.status === "mendesak" ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>sisa {sisaTeks(sisa)}</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] bg-[#F4B400] text-[#0F2A52] shadow-[0_6px_14px_rgba(244,180,0,.35)]">
                <IkonMenu n={sekarang.kode === "harian" ? "kamera" : k.ikon} className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-extrabold leading-snug text-[#0F2A52]">{sekarang.judul}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-[#6B7A90]">Langkah {sekarang.no} · {sekarang.ket}</p>
              </div>
            </div>
            {sekarang.href && (
              <Link href={sekarang.href} className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center rounded-[13px] bg-[#1F5FD1] px-4 text-[14.5px] font-extrabold text-white transition hover:bg-[#1A4FB8]">
                {sekarang.aksi ?? "Lanjutkan"}
              </Link>
            )}
          </section>
        )}
        {k && !sekarang && semuaSelesai && (
          <section className="flex items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
            <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] bg-[#E3F6EC] text-[#13794B]">
              <IkonMenu n="centang" className="h-6 w-6" />
            </span>
            <p className="text-[15px] font-extrabold text-[#0F2A52]">Semua langkah selesai</p>
          </section>
        )}

        {k && langkah.length > 0 && (
          <section aria-label="Tahapan">
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Tahapan</h2>
              <span className="rounded-[9px] bg-[#E6EEFC] px-2 py-[3px] text-[11px] font-bold text-[#1F5FD1]">Langkah {ke} dari {total}</span>
            </div>
            <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
              {kelompok.map((g) => {
                const nomor = g.isi.map((l) => l.no);
                const selesai = g.isi.filter((l) => l.status === "selesai").length;
                if (ringkas(g)) {
                  return (
                    <button key={g.nama} type="button" onClick={() => setBuka((b) => ({ ...b, [g.nama]: true }))} className="flex min-h-[52px] w-full items-center gap-[11px] border-b border-[#EEF2F7] px-3.5 py-2.5 text-left last:border-b-0">
                      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[#E3F6EC] text-[#13794B]">
                        <IkonMenu n="tanda" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-[13.5px] text-[#0F2A52]">{g.nama} · langkah {nomor[0]}{nomor.length > 1 ? `–${nomor[nomor.length - 1]}` : ""}</b>
                        <small className="block text-[11.5px] text-[#6B7A90]">{g.isi.map((l) => l.judul).join(", ")}</small>
                      </span>
                      <span className="text-[11px] font-bold text-[#13794B]">{selesai}/{g.isi.length}</span>
                      <IkonMenu n="panah" className="h-4 w-4 rotate-90 text-[#A5B3C7]" />
                    </button>
                  );
                }
                return (
                  <div key={g.nama}>
                    <div className="flex items-center border-b border-[#EEF2F7] bg-[#F7FAFE] px-3.5 pb-1.5 pt-2">
                      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.15em] text-[#6B7A90]">{g.nama}</span>
                      <span className="ml-auto text-[11px] font-bold text-[#6B7A90]">{selesai}/{g.isi.length}</span>
                    </div>
                    {g.isi.map((l) => (
                      <BarisLangkah key={l.kode} l={l} />
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="mt-2.5 px-1 text-[11.5px] leading-relaxed text-[#6B7A90]">Ketuk satu langkah untuk membuka halaman kerjanya. Langkah bergembok terbuka otomatis setelah langkah sebelumnya selesai.</p>
          </section>
        )}
      </div>
    </main>
  );
}
