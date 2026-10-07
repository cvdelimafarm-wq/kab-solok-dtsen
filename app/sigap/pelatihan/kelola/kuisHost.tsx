"use client";

// app/sigap/pelatihan/kelola/kuisHost.tsx
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan > Kuis Live -- LAYAR HOST (diproyeksikan ke layar besar).
// Satu layar penuh yang mengikuti keadaan ruang dari server: lobi -> soal (hitung mundur) -> jawaban (kunci + sebaran
// + peringkat sementara) -> podium. Admin memegang tombol "Lanjut" (juga tombol panah kanan / spasi).
// Polling ~1 dtk; jam dari server (offset), bukan jam perangkat.

import { useCallback, useEffect, useRef, useState } from "react";
import { WARNA_OPSI } from "@/lib/sigapKuis";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { efek, hentikanMusik, putarMusik, setSuaraAktif } from "../kuisSuara";

const KUNCI_SUARA_HOST = "sigap_kuis_suara_host";

export const URL_KUIS_ADMIN = "/api/sigap/pelatihan/kuis/admin";

export type OpsiK = { kode: string; teks: string };
export type BarisPapanK = { akun_id: number; nama: string; poin: number; benar: number; menjawab: number; rata_waktu_ms: number | null; peringkat: number };
export type KeadaanHost = {
  ada?: boolean;
  sekarang: string;
  boleh_kelola?: boolean;
  ruang: { id: number; kuis_id: number; judul: string; status: "lobi" | "soal" | "jawaban" | "selesai"; soal_ke: number; total: number; versi: number; mulai_at: string | null; batas_at: string | null; dibuka_at: string; selesai_at: string | null };
  soal: { nomor: number; teks: string; opsi: OpsiK[]; detik: number; kunci: string | null } | null;
  jumlah_peserta: number;
  peserta?: string[];
  menjawab: number;
  sebaran: { jumlah: Record<string, number>; benar: number; total: number } | null;
  papan: BarisPapanK[];
  ada_soal_berikut: boolean;
};

/** Pemicu render tiap `ms` (utk hitung mundur yang mulus). */
function useTick(ms: number) {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function LayarHost({ ruangId, bisaKelola, onTutup }: { ruangId: number; bisaKelola: boolean; onTutup: () => void }) {
  const [d, setD] = useState<KeadaanHost | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [konfirmAkhiri, setKonfirmAkhiri] = useState(false);
  const offset = useRef(0);
  const akar = useRef<HTMLDivElement>(null);
  const sibukRef = useRef(false);
  const [suara, setSuara] = useState(true); // musik & efek layar host; bisa dibisukan (diingat di browser)
  const statusSebelum = useRef("");
  useTick(200);

  const terapkan = useCallback((x: KeadaanHost) => {
    offset.current = new Date(x.sekarang).getTime() - Date.now();
    setD(x);
    setGalat(null);
  }, []);
  const jam = () => Date.now() + offset.current;

  // polling berantai (tanpa tumpang tindih): ~1 dtk saat berjalan, 5 dtk bila sudah selesai
  const statusRef = useRef<string>("");
  statusRef.current = d?.ruang.status ?? "";
  useEffect(() => {
    let batal = false;
    let timer: ReturnType<typeof setTimeout>;
    async function putar() {
      try {
        if (!sibukRef.current) terapkan(await fetchJson<KeadaanHost>(`${URL_KUIS_ADMIN}?bagian=ruang&ruang_id=${ruangId}`));
      } catch (e) {
        if (!batal && !(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      }
      if (!batal) timer = setTimeout(putar, statusRef.current === "selesai" ? 5000 : 1000);
    }
    putar();
    return () => {
      batal = true;
      clearTimeout(timer);
    };
  }, [ruangId, terapkan]);

  async function kirim(body: Record<string, unknown>) {
    if (sibukRef.current) return;
    sibukRef.current = true;
    setSibuk(true);
    try {
      terapkan(await fetchJson<KeadaanHost>(URL_KUIS_ADMIN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      sibukRef.current = false;
      setSibuk(false);
    }
  }
  const lanjut = () => d && d.ruang.status !== "selesai" && kirim({ aksi: "lanjut", ruang_id: ruangId, versi: d.ruang.versi });
  const akhiri = () => {
    setKonfirmAkhiri(false);
    return kirim({ aksi: "akhiri", ruang_id: ruangId });
  };
  const lanjutRef = useRef(lanjut);
  lanjutRef.current = lanjut;

  // pintasan: panah kanan / spasi (hanya bila fokus tidak di tombol/isian)
  useEffect(() => {
    if (!bisaKelola) return;
    function tekan(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName)) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        void lanjutRef.current();
      }
    }
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [bisaKelola]);

  // kunci gulir halaman di belakang
  useEffect(() => {
    const awal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = awal;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  function layarPenuh() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else akar.current?.requestFullscreen?.().catch(() => {});
  }

  const r = d?.ruang;
  const sisaDetik = r?.status === "soal" && r.batas_at ? Math.max(0, (new Date(r.batas_at).getTime() - jam()) / 1000) : 0;
  const total = d?.soal?.detik ?? 0;
  // ---- musik & efek suara (disintesis di browser; lihat ../kuisSuara.ts) ----
  useEffect(() => {
    try {
      if (localStorage.getItem(KUNCI_SUARA_HOST) === "0") setSuara(false);
    } catch {
      /* abaikan */
    }
    return () => {
      hentikanMusik();
      setSuaraAktif(false);
    };
  }, []);
  const statusR = r?.status ?? "";
  useEffect(() => {
    setSuaraAktif(suara);
    if (!suara || !statusR) return;
    if (statusR === "lobi") putarMusik("lobi");
    else if (statusR === "soal") putarMusik("soal");
    else hentikanMusik();
  }, [suara, statusR, r?.soal_ke]);
  useEffect(() => {
    const sebelum = statusSebelum.current;
    statusSebelum.current = statusR;
    if (!sebelum || sebelum === statusR) return; // hanya saat perpindahan fase yang teramati
    if (sebelum === "soal" && statusR === "jawaban") efek("habis");
    if (statusR === "selesai") efek("fanfare");
  }, [statusR]);
  const detikBulat = Math.ceil(sisaDetik);
  useEffect(() => {
    if (statusR === "soal" && detikBulat >= 1 && detikBulat <= 5) efek("tik");
  }, [detikBulat, statusR]);
  function ubahSuara() {
    const v = !suara;
    setSuara(v);
    try {
      localStorage.setItem(KUNCI_SUARA_HOST, v ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }

  const labelLanjut = !r ? "" : r.status === "lobi" ? "Mulai kuis ▶" : r.status === "soal" ? "Tampilkan jawaban ▶" : d?.ada_soal_berikut ? "Soal berikutnya ▶" : "Selesai · lihat podium 🏆";

  return (
    <div ref={akar} className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#46178F] text-white" role="dialog" aria-label="Layar host Adu Sigap">
      {/* bilah atas */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
        <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold">{r?.judul ?? "Adu Sigap"}</span>
        {r && r.status !== "lobi" && r.soal_ke > 0 && <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold">Soal {r.soal_ke} / {r.total}</span>}
        <span className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold tabular-nums" title="Peserta bergabung">👥 {d?.jumlah_peserta ?? 0}</span>
          {r?.status === "soal" && <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold tabular-nums" title="Sudah menjawab">✋ {d?.menjawab ?? 0}/{d?.jumlah_peserta ?? 0}</span>}
          <button type="button" onClick={ubahSuara} className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold hover:bg-white/25" aria-pressed={suara} title="Musik & efek suara">{suara ? "🔊 Suara" : "🔇 Bisu"}</button>
          <button type="button" onClick={layarPenuh} className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold hover:bg-white/25">⛶ Layar penuh</button>
          <button type="button" onClick={onTutup} className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold hover:bg-white/25">✕ Tutup layar</button>
        </span>
      </div>

      {r?.status === "soal" && total > 0 && (
        <div className="mx-4 h-2 shrink-0 overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div className="h-full rounded-full bg-[#FFD02B]" style={{ width: `${Math.min(100, (sisaDetik / total) * 100)}%`, transition: "width 200ms linear" }} />
        </div>
      )}

      {galat && <p className="mx-4 mt-2 rounded-lg bg-[#E21B3C] px-3 py-2 text-[13px] font-semibold">{galat}</p>}
      {!d && !galat && <p className="m-auto text-[18px] font-bold">Memuat…</p>}

      {d && r && (
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-3">
          {r.status === "lobi" && <Lobi d={d} />}
          {(r.status === "soal" || r.status === "jawaban") && d.soal && <Soal d={d} sisa={sisaDetik} />}
          {r.status === "selesai" && <Podium papan={d.papan} />}
        </div>
      )}

      {/* kendali admin */}
      {d && r && bisaKelola && (
        <div className="sticky bottom-0 flex shrink-0 flex-wrap items-center justify-center gap-3 bg-black/25 px-4 py-3 backdrop-blur">
          {r.status !== "selesai" ? (
            <>
              <button type="button" disabled={sibuk} onClick={lanjut} className="rounded-xl bg-[#FFD02B] px-7 py-3 text-[18px] font-extrabold text-[#2B0F55] shadow-lg transition hover:brightness-95 disabled:opacity-60">
                {labelLanjut}
              </button>
              {konfirmAkhiri ? (
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  Akhiri kuis sekarang?
                  <button type="button" onClick={akhiri} className="rounded-lg bg-[#E21B3C] px-3 py-1.5 font-bold">Ya, akhiri</button>
                  <button type="button" onClick={() => setKonfirmAkhiri(false)} className="rounded-lg bg-white/20 px-3 py-1.5 font-bold">Batal</button>
                </span>
              ) : (
                <button type="button" onClick={() => setKonfirmAkhiri(true)} className="rounded-xl bg-white/15 px-4 py-2.5 text-[14px] font-bold hover:bg-white/25">Akhiri kuis</button>
              )}
              <span className="hidden text-[12px] text-white/70 lg:inline">Pintasan: → atau Spasi = lanjut</span>
            </>
          ) : (
            <button type="button" onClick={onTutup} className="rounded-xl bg-[#FFD02B] px-7 py-3 text-[18px] font-extrabold text-[#2B0F55]">Tutup layar · lihat rekap</button>
          )}
        </div>
      )}
    </div>
  );
}

function Lobi({ d }: { d: KeadaanHost }) {
  const alamat = typeof window === "undefined" ? "" : `${window.location.origin}/sigap/pelatihan`;
  return (
    <div className="m-auto w-full text-center">
      <p className="text-[clamp(1rem,2vw,1.4rem)] font-semibold text-white/80">Buka SIGAP di HP → Pelatihan → Langkah → Adu Sigap → Gabung</p>
      <p className="mt-1 text-[clamp(1rem,2.2vw,1.6rem)] font-bold text-[#FFD02B]">{alamat.replace(/^https?:\/\//, "")}</p>
      <p className="mt-5 inline-block rounded-full bg-[#FFD02B] px-4 py-1 text-[clamp(0.9rem,1.8vw,1.3rem)] font-extrabold tracking-widest text-[#2B0F55]">⚡ ADU SIGAP</p>
      <h1 className="mt-3 text-[clamp(2rem,6vw,4.5rem)] font-extrabold leading-tight">{d.ruang.judul}</h1>
      <p className="mt-2 text-[clamp(1rem,2vw,1.4rem)] text-white/80">{d.ruang.total} soal · menunggu peserta bergabung</p>
      <p className="mt-6 text-[clamp(2.5rem,8vw,6rem)] font-extrabold tabular-nums">{d.jumlah_peserta}</p>
      <p className="text-[clamp(0.9rem,1.6vw,1.2rem)] font-semibold text-white/80">peserta sudah bergabung</p>
      <div className="mx-auto mt-5 flex max-w-[1100px] flex-wrap justify-center gap-2">
        {(d.peserta ?? []).map((n, i) => (
          <span key={`${n}-${i}`} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[clamp(0.85rem,1.4vw,1.1rem)] font-bold">{n}</span>
        ))}
      </div>
    </div>
  );
}

function Soal({ d, sisa }: { d: KeadaanHost; sisa: number }) {
  const s = d.soal!;
  const jawaban = d.ruang.status === "jawaban";
  const sb = d.sebaran;
  const total = Math.max(1, sb?.total ?? 0);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-4">
        <div className="flex h-[clamp(64px,9vw,110px)] w-[clamp(64px,9vw,110px)] shrink-0 items-center justify-center rounded-full bg-white text-[clamp(1.6rem,4.5vw,3.4rem)] font-extrabold tabular-nums text-[#46178F]" aria-label="Sisa waktu (detik)">
          {jawaban ? "✔" : Math.ceil(sisa)}
        </div>
        <h2 className="flex-1 rounded-xl bg-white px-5 py-4 text-center text-[clamp(1.25rem,3.4vw,2.6rem)] font-extrabold leading-snug text-[#14202E]">{s.teks}</h2>
      </div>
      <div className={`mt-4 grid flex-1 gap-3 ${s.opsi.length > 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
        {s.opsi.map((o) => {
          const w = WARNA_OPSI[o.kode] ?? WARNA_OPSI.A;
          const benar = jawaban && s.kunci === o.kode;
          const n = sb?.jumlah[o.kode] ?? 0;
          return (
            <div key={o.kode} className={`relative flex min-h-[84px] items-center gap-3 overflow-hidden rounded-xl px-4 py-3 text-[clamp(1rem,2.4vw,2rem)] font-bold shadow ${benar ? "ring-4 ring-white" : ""} ${jawaban && !benar ? "opacity-35" : ""}`} style={{ background: w.bg }}>
              <span className="text-[1.3em] leading-none" aria-hidden>{w.simbol}</span>
              <span className="min-w-0 flex-1 break-words">{o.teks}</span>
              {jawaban && (
                <span className="flex shrink-0 flex-col items-end text-right leading-tight">
                  <span className="text-[1.3em] font-extrabold tabular-nums">{n}</span>
                  <span className="text-[0.55em] font-semibold tabular-nums opacity-90">{Math.round((n / total) * 100)}%</span>
                </span>
              )}
              {benar && <span className="shrink-0 text-[1.4em]" aria-label="Jawaban benar">✔</span>}
              {jawaban && <span className="absolute bottom-0 left-0 h-1.5 bg-white/70" style={{ width: `${(n / total) * 100}%` }} />}
            </div>
          );
        })}
      </div>
      {jawaban && (
        <div className="mt-4 rounded-xl bg-black/20 p-3">
          <p className="mb-1.5 text-[14px] font-bold text-white/85">
            Benar {sb?.benar ?? 0} dari {sb?.total ?? 0} yang menjawab · {d.jumlah_peserta - (sb?.total ?? 0) > 0 ? `${d.jumlah_peserta - (sb?.total ?? 0)} tidak menjawab` : "semua menjawab"}
          </p>
          <p className="mb-1 text-[13px] font-bold uppercase tracking-wide text-[#FFD02B]">Peringkat sementara</p>
          <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
            {d.papan.slice(0, 5).map((p) => (
              <li key={p.akun_id} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-[clamp(0.85rem,1.4vw,1.15rem)] font-bold">
                <span className="w-6 shrink-0 text-[#FFD02B]">{p.peringkat}</span>
                <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                <span className="shrink-0 tabular-nums">{p.poin}</span>
              </li>
            ))}
            {d.papan.length === 0 && <li className="text-[13px] text-white/70">Belum ada skor.</li>}
          </ol>
        </div>
      )}
    </div>
  );
}

function Podium({ papan }: { papan: BarisPapanK[] }) {
  const tiga = [papan.find((p) => p.peringkat === 2) ?? papan[1], papan[0], papan.find((p) => p.peringkat === 3) ?? papan[2]];
  const tinggi = ["h-[clamp(120px,22vh,220px)]", "h-[clamp(170px,32vh,320px)]", "h-[clamp(90px,16vh,170px)]"];
  const medali = ["🥈", "🥇", "🥉"];
  return (
    <div className="m-auto w-full">
      <h1 className="text-center text-[clamp(1.8rem,5vw,3.6rem)] font-extrabold">Podium 🏆</h1>
      {papan.length === 0 ? (
        <p className="mt-6 text-center text-[18px] text-white/80">Tidak ada peserta yang tercatat.</p>
      ) : (
        <>
          <div className="mx-auto mt-6 flex max-w-[900px] items-end justify-center gap-3">
            {tiga.map((p, i) =>
              p ? (
                <div key={p.akun_id} className="flex flex-1 flex-col items-center">
                  <p className="mb-1 text-[clamp(1rem,2.2vw,1.7rem)] font-extrabold">{medali[i]} {p.nama}</p>
                  <p className="mb-1 text-[clamp(0.9rem,1.6vw,1.2rem)] font-bold tabular-nums text-[#FFD02B]">{p.poin} poin</p>
                  <div className={`w-full rounded-t-xl bg-white/20 ${tinggi[i]} flex items-start justify-center pt-2 text-[clamp(1.6rem,4vw,3rem)] font-extrabold`}>{p.peringkat}</div>
                </div>
              ) : (
                <div key={i} className="flex-1" />
              )
            )}
          </div>
          {papan.length > 3 && (
            <ol className="mx-auto mt-6 grid max-w-[900px] gap-1.5 sm:grid-cols-2">
              {papan.slice(3, 20).map((p) => (
                <li key={p.akun_id} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[clamp(0.9rem,1.5vw,1.15rem)] font-bold">
                  <span className="w-7 shrink-0 text-[#FFD02B]">{p.peringkat}</span>
                  <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                  <span className="shrink-0 tabular-nums">{p.poin}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
