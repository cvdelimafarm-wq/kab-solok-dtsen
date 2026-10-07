"use client";

// app/sigap/pelatihan/kuis/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan > Kuis Live -- layar main di HP peserta (gaya Kahoot).
// Peserta bergabung otomatis dari akun SIGAP (tanpa kode/nama panggilan). Admin memegang tombol Lanjut di layar host.
// Polling ringan ~1,5 dtk (hanya status ruang); keadaan pribadi (sudah menjawab? poin, peringkat) diambil sekali setiap
// ganti fase (versi ruang berubah). Hitung mundur memakai jam server (offset), jawaban dinilai server.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WARNA_OPSI } from "@/lib/sigapKuis";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir } from "../../admin/api";

const URL_KUIS = "/api/sigap/pelatihan/kuis";

type Status = "lobi" | "soal" | "jawaban" | "selesai";
type Saya = { gabung: boolean; jawaban?: { pilihan: string; benar: boolean; poin: number; waktu_ms: number } | null; total_poin?: number; benar?: number; menjawab?: number; peringkat?: number | null; jumlah_peserta?: number; selisih_ke_atas?: number | null };
type Keadaan = {
  ada: boolean;
  sekarang: string;
  ruang: { id: number; judul: string; status: Status; soal_ke: number; total: number; versi: number; mulai_at: string | null; batas_at: string | null };
  soal: { nomor: number; teks: string; opsi: { kode: string; teks: string }[]; detik: number; kunci: string | null } | null;
  saya?: Saya;
  papan?: { nama: string; poin: number; peringkat: number }[];
};

function useTick(ms: number) {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export default function KuisPeserta() {
  const [ringan, setRingan] = useState<Keadaan | null>(null);
  const [detail, setDetail] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  const [dipilih, setDipilih] = useState<{ nomor: number; kode: string } | null>(null);
  const offset = useRef(0);
  const versiDetail = useRef("");
  const otoGabung = useRef(false);
  useTick(250);

  const ambilDetail = useCallback(async () => {
    try {
      const d = await fetchJson<Keadaan>(`${URL_KUIS}?detail=1`);
      offset.current = new Date(d.sekarang).getTime() - Date.now();
      setDetail(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    try {
      otoGabung.current = new URLSearchParams(window.location.search).get("gabung") === "1";
    } catch {
      /* abaikan */
    }
    let batal = false;
    let timer: ReturnType<typeof setTimeout>;
    async function putar() {
      try {
        if (!document.hidden) {
          const d = await fetchJson<Keadaan>(URL_KUIS);
          if (batal) return;
          offset.current = new Date(d.sekarang).getTime() - Date.now();
          setRingan(d);
          setGalat(null);
          const v = d.ada ? `${d.ruang.id}:${d.ruang.versi}` : "";
          if (v && v !== versiDetail.current) {
            versiDetail.current = v;
            await ambilDetail();
          }
        }
      } catch (e) {
        if (!batal && !(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      }
      if (!batal) timer = setTimeout(putar, 1500);
    }
    putar();
    const lihat = () => {
      if (!document.hidden) versiDetail.current = ""; // kembali dari tab lain: segarkan keadaan pribadi
    };
    document.addEventListener("visibilitychange", lihat);
    return () => {
      batal = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", lihat);
    };
  }, [ambilDetail]);

  async function gabung() {
    setKirim(true);
    setGalatAksi(null);
    try {
      await fetchJson(URL_KUIS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "gabung" }) });
      versiDetail.current = "";
      await ambilDetail();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalatAksi(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  // ?gabung=1 (dari tombol "Gabung" di Langkah): masuk otomatis sekali
  useEffect(() => {
    if (!otoGabung.current || !detail?.saya || !detail.ada) return;
    otoGabung.current = false;
    if (!detail.saya.gabung && detail.ruang.status !== "selesai") void gabung();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function jawab(nomor: number, kode: string) {
    if (!ringan?.ada || kirim || dipilih?.nomor === nomor) return;
    setKirim(true);
    setGalatAksi(null);
    setDipilih({ nomor, kode });
    try {
      navigator.vibrate?.(30);
    } catch {
      /* abaikan */
    }
    try {
      await fetchJson(URL_KUIS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "jawab", ruang_id: ringan.ruang.id, nomor, pilihan: kode }) });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) {
        setGalatAksi(pesanGalat(e));
        setDipilih(null);
        versiDetail.current = ""; // sinkron ulang
      }
    } finally {
      setKirim(false);
    }
  }

  const jam = () => Date.now() + offset.current;
  const r = ringan?.ruang;
  // keadaan pribadi hanya dipakai bila versinya sama dengan versi ruang terbaru
  const saya: Saya | null = detail?.ruang && r && detail.ruang.id === r.id && detail.ruang.versi === r.versi ? (detail.saya ?? null) : null;
  const papan = saya ? (detail?.papan ?? []) : [];
  const soal = ringan?.soal ?? null;
  const sisa = r?.status === "soal" && r.batas_at ? Math.max(0, (new Date(r.batas_at).getTime() - jam()) / 1000) : 0;
  const pilihanSaya = soal && dipilih?.nomor === soal.nomor ? dipilih.kode : (saya?.jawaban?.pilihan ?? null);

  const kartu = "mx-auto w-full max-w-md rounded-2xl bg-white p-5 text-center text-[#14202E] shadow-xl";
  let isi: React.ReactNode;

  if (!ringan && !galat) {
    isi = <p className="m-auto text-[16px] font-bold">Memuat…</p>;
  } else if (ringan && !ringan.ada) {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>🎮</p>
        <p className="mt-1 text-[17px] font-extrabold">Belum ada kuis yang dibuka</p>
        <p className="mt-1 text-[13.5px] text-[#55657D]">Tunggu admin membuka kuis. Halaman ini akan berubah otomatis.</p>
      </div>
    );
  } else if (r && saya && !saya.gabung && r.status !== "selesai") {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>🎮</p>
        <p className="mt-1 text-[19px] font-extrabold">{r.judul}</p>
        <p className="mt-1 text-[13.5px] text-[#55657D]">{r.status === "lobi" ? `${r.total} soal · pastikan HP siap, lalu tekan Gabung.` : "Kuis sudah berjalan. Gabung sekarang, Anda ikut mulai soal berikutnya."}</p>
        <button type="button" disabled={kirim} onClick={gabung} className="mt-4 w-full rounded-xl bg-[#1E7A4C] px-4 py-3.5 text-[17px] font-extrabold text-white shadow hover:bg-[#17623C] disabled:opacity-60">
          {kirim ? "Bergabung…" : "Gabung kuis"}
        </button>
      </div>
    );
  } else if (r && !saya) {
    isi = <p className="m-auto text-[16px] font-bold">Memuat…</p>;
  } else if (r && saya && !saya.gabung && r.status === "selesai") {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>🏁</p>
        <p className="mt-1 text-[17px] font-extrabold">Kuis sudah selesai</p>
        <p className="mt-1 text-[13.5px] text-[#55657D]">Anda tidak ikut pada kuis “{r.judul}”.</p>
      </div>
    );
  } else if (r && saya && r.status === "lobi") {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>✅</p>
        <p className="mt-1 text-[19px] font-extrabold">Anda sudah bergabung</p>
        <p className="mt-1 text-[14px] text-[#55657D]">{r.judul} · {r.total} soal</p>
        <p className="mt-3 text-[13.5px] font-semibold text-[#9A6200]">Menunggu admin memulai kuis… jangan tutup halaman ini.</p>
      </div>
    );
  } else if (r && saya && r.status === "soal" && soal) {
    const sudah = !!pilihanSaya;
    const habis = sisa <= 0;
    isi = (
      <div className="flex flex-1 flex-col">
        <div className="h-2 overflow-hidden rounded-full bg-white/25" aria-hidden>
          <div className="h-full rounded-full bg-[#FFD02B]" style={{ width: `${Math.min(100, (sisa / Math.max(1, soal.detik)) * 100)}%`, transition: "width 250ms linear" }} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[24px] font-extrabold tabular-nums text-[#46178F]" aria-label="Sisa waktu (detik)">{Math.ceil(sisa)}</div>
          <p className="flex-1 rounded-xl bg-white px-3.5 py-3 text-[17px] font-extrabold leading-snug text-[#14202E]">{soal.teks}</p>
        </div>
        {sudah ? (
          <div className="m-auto text-center">
            <p className="text-[44px]" aria-hidden>✓</p>
            <p className="text-[20px] font-extrabold">Jawaban terkirim</p>
            <p className="mt-1 text-[14px] text-white/85">Anda memilih <b>{pilihanSaya}</b>. Menunggu waktu habis / peserta lain…</p>
          </div>
        ) : habis ? (
          <div className="m-auto text-center">
            <p className="text-[44px]" aria-hidden>⏱</p>
            <p className="text-[20px] font-extrabold">Waktu habis</p>
            <p className="mt-1 text-[14px] text-white/85">Menunggu hasil…</p>
          </div>
        ) : (
          <div className="mt-3 grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2" style={{ gridAutoRows: "minmax(72px, 1fr)" }}>
            {soal.opsi.map((o) => {
              const w = WARNA_OPSI[o.kode] ?? WARNA_OPSI.A;
              return (
                <button key={o.kode} type="button" disabled={kirim} onClick={() => jawab(soal.nomor, o.kode)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-[17px] font-extrabold text-white shadow active:scale-[0.98] disabled:opacity-70" style={{ background: w.bg }}>
                  <span className="text-[26px] leading-none" aria-hidden>{w.simbol}</span>
                  <span className="min-w-0 flex-1 break-words">{o.teks}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (r && saya && r.status === "jawaban" && soal) {
    const j = saya.jawaban ?? null;
    const benar = !!j?.benar;
    const kunciTeks = soal.opsi.find((o) => o.kode === soal.kunci);
    isi = (
      <div className="m-auto w-full max-w-md space-y-3">
        <div className={`${kartu} ${benar ? "!bg-[#DDF3E6]" : !j ? "!bg-[#FFF1CC]" : "!bg-[#FBE5E2]"}`}>
          <p className="text-[44px]" aria-hidden>{benar ? "🎉" : !j ? "⏱" : "😕"}</p>
          <p className={`mt-1 text-[22px] font-extrabold ${benar ? "text-[#17623C]" : !j ? "text-[#9A6200]" : "text-[#B5352D]"}`}>{benar ? "Benar!" : !j ? "Tidak menjawab" : "Kurang tepat"}</p>
          {benar && <p className="text-[18px] font-extrabold tabular-nums text-[#17623C]">+{j?.poin} poin</p>}
          <p className="mt-2 text-[13.5px] text-[#14202E]">Jawaban benar: <b>{soal.kunci}. {kunciTeks?.teks}</b></p>
        </div>
        <div className="rounded-2xl bg-white/15 px-4 py-3 text-center">
          <p className="text-[13px] font-semibold text-white/85">Poin Anda</p>
          <p className="text-[30px] font-extrabold tabular-nums">{saya.total_poin ?? 0}</p>
          {saya.peringkat != null && (
            <p className="text-[14px] font-bold">
              Peringkat {saya.peringkat} dari {saya.jumlah_peserta}
              {saya.selisih_ke_atas != null && saya.selisih_ke_atas > 0 ? ` · kurang ${saya.selisih_ke_atas} poin untuk naik` : ""}
            </p>
          )}
        </div>
        {papan.length > 0 && (
          <ol className="space-y-1">
            {papan.slice(0, 5).map((p, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-[13.5px] font-bold">
                <span className="w-5 shrink-0 text-[#FFD02B]">{p.peringkat}</span>
                <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                <span className="tabular-nums">{p.poin}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-center text-[12.5px] text-white/75">Menunggu admin melanjutkan ke soal berikutnya…</p>
      </div>
    );
  } else if (r && saya && r.status === "selesai") {
    isi = (
      <div className="m-auto w-full max-w-md space-y-3">
        <div className={kartu}>
          <p className="text-[44px]" aria-hidden>{saya.peringkat != null && saya.peringkat <= 3 ? ["🥇", "🥈", "🥉"][saya.peringkat - 1] : "🏁"}</p>
          <p className="mt-1 text-[20px] font-extrabold">Kuis selesai!</p>
          <p className="text-[14px] text-[#55657D]">{r.judul}</p>
          <p className="mt-3 text-[34px] font-extrabold tabular-nums text-[#46178F]">{saya.total_poin ?? 0}<span className="ml-1 text-[14px] font-bold text-[#55657D]">poin</span></p>
          <p className="text-[14px] font-bold">Peringkat {saya.peringkat ?? "–"} dari {saya.jumlah_peserta ?? "–"}</p>
          <p className="mt-0.5 text-[13px] text-[#55657D]">Benar {saya.benar ?? 0} dari {r.total} soal</p>
          <p className="mt-2 text-[12px] text-[#7B8794]">Skor kuis dicatat sebagai nilai tambahan.</p>
        </div>
        {papan.length > 0 && (
          <ol className="space-y-1">
            {papan.slice(0, 5).map((p, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-[13.5px] font-bold">
                <span className="w-5 shrink-0 text-[#FFD02B]">{p.peringkat}</span>
                <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                <span className="tabular-nums">{p.poin}</span>
              </li>
            ))}
          </ol>
        )}
        <Link href="/sigap/pelatihan" className="block rounded-xl bg-[#FFD02B] px-4 py-3 text-center text-[15px] font-extrabold text-[#2B0F55]">← Kembali ke Langkah</Link>
      </div>
    );
  } else {
    isi = <p className="m-auto text-[16px] font-bold">Memuat…</p>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#46178F] px-3 pb-6 pt-3 text-white" style={{ minHeight: "100dvh" }}>
      <div className="mx-auto mb-3 flex w-full max-w-3xl items-center gap-2">
        <Link href="/sigap/pelatihan" className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-bold hover:bg-white/25">← Langkah</Link>
        {r && <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-white/90">{r.judul}</span>}
        {r && r.status !== "lobi" && r.soal_ke > 0 && <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-bold tabular-nums">{r.soal_ke}/{r.total}</span>}
        {saya?.gabung && <span className="shrink-0 rounded-full bg-[#FFD02B] px-3 py-1 text-[12.5px] font-extrabold tabular-nums text-[#2B0F55]">⭐ {saya.total_poin ?? 0}</span>}
      </div>
      {galat && <p className="mx-auto mb-2 w-full max-w-3xl rounded-lg bg-[#E21B3C] px-3 py-2 text-[13px] font-semibold">{galat}</p>}
      {galatAksi && <p className="mx-auto mb-2 w-full max-w-3xl rounded-lg bg-[#E21B3C] px-3 py-2 text-[13px] font-semibold">{galatAksi}</p>}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">{isi}</div>
    </div>
  );
}
