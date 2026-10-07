"use client";

// app/sigap/pelatihan/kuis/page.tsx
//
// (7-8 Okt 2026) SIGAP > Pelatihan > Adu Sigap -- layar main di HP peserta (gaya Kahoot), satu ruang per KELAS.
// Peserta bergabung otomatis dari akun SIGAP (tanpa kode/nama panggilan) ke ruang kelasnya. Inda/instruktur (tanpa kelas)
// memilih kelas dulu. Pemandu memegang Start/Pause/Lanjut di layar host; tombol layar penuh & review jawaban + penjelasan tersedia.
// Polling ringan ~1,5 dtk (hanya status ruang); keadaan pribadi (sudah menjawab? poin, peringkat) diambil sekali setiap
// ganti fase (versi ruang berubah). Hitung mundur memakai jam server (offset), jawaban dinilai server.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { warnaPosisi } from "@/lib/sigapKuis";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir } from "../../admin/api";
import { efek, setSuaraAktif } from "../kuisSuara";

const KUNCI_SUARA_HP = "sigap_kuis_suara_hp";

const URL_KUIS = "/api/sigap/pelatihan/kuis";

type Status = "lobi" | "soal" | "jawaban" | "selesai";
type Saya = { gabung: boolean; jawaban?: { pilihan: string; benar: boolean; poin: number; waktu_ms: number } | null; total_poin?: number; benar?: number; menjawab?: number; peringkat?: number | null; jumlah_peserta?: number; selisih_ke_atas?: number | null };
type Keadaan = {
  ada: boolean;
  kelas?: number;
  sekarang: string;
  ruang: { id: number; kelas: number; judul: string; status: Status; soal_ke: number; total: number; versi: number; mulai_at: string | null; batas_at: string | null; dijeda: boolean; sisa_ms: number | null; lanjut_at: string | null; jadwal_at: string | null };
  pengaturan: { papan_live_hp: boolean; bonus_kecepatan: boolean; lanjut_otomatis: boolean; gabung_terlambat: boolean };
  soal: { nomor: number; teks: string; opsi: { kode: string; teks: string }[]; detik: number; kunci: string | null; penjelasan: string | null } | null;
  saya?: Saya;
  papan?: { nama: string; poin: number; peringkat: number }[];
};
type Butir = { urutan: number; nomor: number; teks: string; topik: string | null; opsi: { kode: string; teks: string }[]; kunci: string; penjelasan: string | null; pilihan: string | null; benar: boolean; poin: number; persen_benar: number | null };
type Review = { ruang: { id: number; kelas: number; judul: string; status: Status; total: number }; butir: Butir[] };
type RuangKelas = { kelas: number; ada: boolean; status: Status | null; judul: string | null };

const mmss = (detik: number) => {
  const d = Math.max(0, Math.ceil(detik));
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
};

function useTick(ms: number) {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export default function KuisPeserta() {
  const [kelas, setKelas] = useState<number | null>(null);
  const [perluPilih, setPerluPilih] = useState(false);
  const [daftarKelas, setDaftarKelas] = useState<RuangKelas[] | null>(null);
  const [ringan, setRingan] = useState<Keadaan | null>(null);
  const [detail, setDetail] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  const [dipilih, setDipilih] = useState<{ nomor: number; kode: string } | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [lihatReview, setLihatReview] = useState(false);
  const [penuh, setPenuh] = useState(false);
  const [bisaPenuh, setBisaPenuh] = useState(false);
  const offset = useRef(0);
  const versiDetail = useRef("");
  const otoGabung = useRef(false);
  const [suara, setSuara] = useState(false); // efek suara di HP: default MATI (ruangan pelatihan), diingat di browser
  const bunyiTerakhir = useRef("");
  useTick(250);

  const qKelas = kelas !== null ? `kelas=${kelas}&` : "";

  const ambilDetail = useCallback(async () => {
    try {
      const d = await fetchJson<Keadaan>(`${URL_KUIS}?${qKelas}detail=1`);
      offset.current = new Date(d.sekarang).getTime() - Date.now();
      setDetail(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [qKelas]);

  function pilihKelas(k: number) {
    setKelas(k);
    setPerluPilih(false);
    setRingan(null);
    setDetail(null);
    setReview(null);
    setLihatReview(false);
    versiDetail.current = "";
    try {
      sessionStorage.setItem("sigap_kuis_kelas", String(k));
      const u = new URL(window.location.href);
      u.searchParams.set("kelas", String(k));
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* abaikan */
    }
  }

  // tentukan kelas: dari ?kelas=, atau (peserta berkelas) dari server; inda/instruktur memilih sendiri
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    let urlKelas: number | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      otoGabung.current = q.get("gabung") === "1";
      const k = Number(q.get("kelas") ?? sessionStorage.getItem("sigap_kuis_kelas"));
      if (Number.isInteger(k) && k >= 1 && k <= 4) {
        urlKelas = k;
        setKelas(k); // tampil cepat; peserta berkelas tetap dikoreksi server di bawah
      }
    } catch {
      /* abaikan */
    }
    let batal = false;
    fetchJson<Keadaan>(`${URL_KUIS}?detail=1${urlKelas ? `&kelas=${urlKelas}` : ""}`)
      .then((d) => {
        if (batal) return;
        const k = d.kelas ?? d.ruang?.kelas;
        if (k) setKelas(k);
      })
      .catch((e) => {
        if (batal || e instanceof SesiBerakhir) return;
        const pesan = pesanGalat(e);
        if (/Kelas belum dipilih/i.test(pesan)) setPerluPilih(true);
        else setGalat(pesan);
      });
    return () => {
      batal = true;
    };
  }, []);

  // daftar ruang aktif utk pemilih kelas
  useEffect(() => {
    if (!perluPilih) return;
    let batal = false;
    let timer: ReturnType<typeof setTimeout>;
    async function putar() {
      try {
        const d = await fetchJson<{ ruang: RuangKelas[] }>(`${URL_KUIS}?daftar=1`);
        if (!batal) setDaftarKelas(d.ruang);
      } catch {
        /* abaikan */
      }
      if (!batal) timer = setTimeout(putar, 3000);
    }
    putar();
    return () => {
      batal = true;
      clearTimeout(timer);
    };
  }, [perluPilih]);

  useEffect(() => {
    if (kelas === null) return;
    let batal = false;
    let timer: ReturnType<typeof setTimeout>;
    async function putar() {
      try {
        if (!document.hidden) {
          const d = await fetchJson<Keadaan>(`${URL_KUIS}?kelas=${kelas}`);
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
  }, [kelas, ambilDetail]);

  async function gabung() {
    setKirim(true);
    setGalatAksi(null);
    try {
      await fetchJson(URL_KUIS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "gabung", kelas }) });
      versiDetail.current = "";
      await ambilDetail();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalatAksi(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  // ?gabung=1 (dari tombol "Gabung" di Langkah / admin): masuk otomatis sekali
  useEffect(() => {
    if (!otoGabung.current || !detail?.saya || !detail.ada) return;
    otoGabung.current = false;
    if (!detail.saya.gabung && detail.ruang.status !== "selesai") void gabung();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  useEffect(() => {
    try {
      if (localStorage.getItem(KUNCI_SUARA_HP) === "1") {
        setSuara(true);
        setSuaraAktif(true);
      }
    } catch {
      /* abaikan */
    }
    setBisaPenuh(typeof document !== "undefined" && !!document.fullscreenEnabled);
    const f = () => setPenuh(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  function ubahSuara() {
    const v = !suara;
    setSuara(v);
    setSuaraAktif(v);
    if (v) efek("klik");
    try {
      localStorage.setItem(KUNCI_SUARA_HP, v ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }
  function layarPenuh() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function bukaReview() {
    setLihatReview(true);
    setReview(null);
    try {
      setReview(await fetchJson<Review>(`${URL_KUIS}?${qKelas}review=1`));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) {
        setGalatAksi(pesanGalat(e));
        setLihatReview(false);
      }
    }
  }

  async function jawab(nomor: number, kode: string) {
    if (!ringan?.ada || kirim || dipilih?.nomor === nomor || ringan.ruang.dijeda) return;
    efek("klik");
    setKirim(true);
    setGalatAksi(null);
    setDipilih({ nomor, kode });
    try {
      navigator.vibrate?.(30);
    } catch {
      /* abaikan */
    }
    try {
      await fetchJson(URL_KUIS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "jawab", kelas, ruang_id: ringan.ruang.id, nomor, pilihan: kode }) });
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

  // Restart/ruang baru: buang pilihan lokal lama (nomor soal bisa sama persis dengan putaran sebelumnya).
  // Di fase jawaban/lobi/selesai pilihan resmi sudah ada di server (saya.jawaban), jadi salinan lokal tak diperlukan lagi.
  const statusRuangSaya = ringan?.ada ? ringan.ruang.status : null;
  const idRuang = ringan?.ada ? ringan.ruang.id : null;
  const adaJawabanServer = !!saya?.jawaban;
  useEffect(() => {
    if (statusRuangSaya === "lobi" || statusRuangSaya === "selesai" || (statusRuangSaya === "jawaban" && adaJawabanServer)) setDipilih(null);
  }, [statusRuangSaya, idRuang, adaJawabanServer]);

  const papan = saya ? (detail?.papan ?? []) : [];
  const soal = ringan?.soal ?? null;
  const dijeda = !!r?.dijeda;
  const sisa = r?.status === "soal" ? (dijeda ? (r.sisa_ms ?? 0) / 1000 : r.batas_at ? Math.max(0, (new Date(r.batas_at).getTime() - jam()) / 1000) : 0) : 0;
  const sisaLanjut = r?.status === "jawaban" && !dijeda && r.lanjut_at ? Math.max(0, (new Date(r.lanjut_at).getTime() - jam()) / 1000) : null;
  const sisaJadwal = r?.status === "lobi" && r.jadwal_at ? (new Date(r.jadwal_at).getTime() - jam()) / 1000 : null;
  const pilihanSaya = soal && dipilih?.nomor === soal.nomor ? dipilih.kode : (saya?.jawaban?.pilihan ?? null);
  const papanBoleh = ringan?.pengaturan?.papan_live_hp !== false;

  // efek suara per fase (sekali per versi ruang, setelah keadaan pribadi siap)
  const statusRuang = r?.status;
  const adaSaya = !!saya?.gabung;
  const benarSaya = saya?.jawaban?.benar;
  const adaJawaban = !!saya?.jawaban;
  const peringkatSaya = saya?.peringkat ?? null;
  useEffect(() => {
    if (!r || !adaSaya) return;
    const kunci = `${r.id}:${r.versi}`;
    if (bunyiTerakhir.current === kunci) return;
    if (statusRuang === "jawaban") {
      bunyiTerakhir.current = kunci;
      efek(adaJawaban ? (benarSaya ? "benar" : "salah") : "habis");
    } else if (statusRuang === "selesai") {
      bunyiTerakhir.current = kunci;
      efek(peringkatSaya != null && peringkatSaya <= 3 ? "fanfare" : "selesai");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.versi, statusRuang, adaSaya, adaJawaban, benarSaya, peringkatSaya]);

  const kartu = "mx-auto w-full max-w-md rounded-2xl bg-white p-5 text-center text-[#14202E] shadow-xl";
  let isi: React.ReactNode;

  if (perluPilih) {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>🎮</p>
        <p className="mt-1 text-[18px] font-extrabold">Pilih kelas yang ingin Anda ikuti</p>
        <p className="mt-1 text-[13px] text-[#55657D]">Akun Anda tidak terdaftar di satu kelas (inda/instruktur), jadi pilih ruang yang sedang dibuka.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((k) => {
            const x = daftarKelas?.find((d) => d.kelas === k);
            return (
              <button key={k} type="button" onClick={() => pilihKelas(k)} className={`rounded-xl border px-3 py-3 text-[15px] font-extrabold ${x?.ada ? "border-[#46178F] bg-[#F1EAFB] text-[#46178F]" : "border-[#CDD5DE] bg-white text-[#7B8794]"}`}>
                Kelas {k}
                <span className="block text-[11.5px] font-semibold">{x?.ada ? `● ${x.status === "lobi" ? "lobi terbuka" : "sedang berjalan"}` : "belum dibuka"}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if (kelas === null && !galat) {
    isi = <p className="m-auto text-[16px] font-bold">Memuat…</p>;
  } else if (!ringan && !galat) {
    isi = <p className="m-auto text-[16px] font-bold">Memuat…</p>;
  } else if (ringan && !ringan.ada) {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>🎮</p>
        <p className="mt-1 text-[17px] font-extrabold">Belum ada kuis yang dibuka untuk Kelas {kelas}</p>
        <p className="mt-1 text-[13.5px] text-[#55657D]">Tunggu pemandu membuka kuis. Halaman ini akan berubah otomatis.</p>
      </div>
    );
  } else if (r && lihatReview) {
    isi = (
      <div className="mx-auto w-full max-w-md space-y-3">
        <button type="button" onClick={() => setLihatReview(false)} className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold hover:bg-white/25">← Kembali</button>
        <p className="text-[18px] font-extrabold">📖 Review jawaban & penjelasan</p>
        {!review && <p className="text-[14px] font-semibold">Memuat…</p>}
        {review?.butir.length === 0 && <p className="text-[14px] text-white/85">Belum ada soal yang jawabannya dibuka.</p>}
        {review?.butir.map((b) => (
          <div key={b.nomor} className="rounded-2xl bg-white p-3.5 text-[#14202E] shadow">
            <div className="flex items-center gap-2 text-[12px] font-bold">
              <span className="rounded-full bg-[#F1EAFB] px-2 py-0.5 text-[#46178F]">Soal {b.urutan}</span>
              {b.topik && <span className="rounded-full bg-[#EDF0F4] px-2 py-0.5 text-[#4D5B6B]">{b.topik}</span>}
              <span className={`ml-auto rounded-full px-2 py-0.5 ${b.pilihan === null ? "bg-[#FBEFD6] text-[#9A6200]" : b.benar ? "bg-[#DFF2EC] text-[#12816A]" : "bg-[#FBE5E2] text-[#B5352D]"}`}>{b.pilihan === null ? "Tidak menjawab" : b.benar ? `Benar +${b.poin}` : "Kurang tepat"}</span>
            </div>
            <p className="mt-2 text-[15px] font-extrabold leading-snug">{b.teks}</p>
            <ul className="mt-2 space-y-1">
              {b.opsi.map((o, i) => {
                const w = warnaPosisi(i);
                const kunci = o.kode === b.kunci;
                const saya = o.kode === b.pilihan;
                return (
                  <li key={o.kode} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold ${kunci ? "bg-[#DFF2EC] text-[#0E5E4E]" : saya ? "bg-[#FBE5E2] text-[#7F241E]" : "bg-[#F8FAFC] text-[#55657D]"}`}>
                    <span style={{ color: w.bg }} aria-hidden>{w.simbol}</span>
                    <span className="min-w-0 flex-1">{o.teks}</span>
                    {kunci && <span aria-label="Jawaban benar">✔</span>}
                    {saya && !kunci && <span aria-label="Jawaban Anda">✖</span>}
                    {saya && kunci && <span className="text-[11px]">(Anda)</span>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 rounded-lg bg-[#FFF8E1] px-2.5 py-2 text-[13px] leading-snug text-[#4D3B00]">💡 {b.penjelasan ?? "Belum ada penjelasan untuk soal ini."}</p>
            {b.persen_benar != null && <p className="mt-1 text-[11.5px] text-[#7B8794]">{b.persen_benar}% peserta menjawab benar</p>}
          </div>
        ))}
      </div>
    );
  } else if (r && saya && !saya.gabung && r.status !== "selesai") {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>🎮</p>
        <p className="mt-1 inline-block rounded-full bg-[#FFD02B] px-3 py-0.5 text-[12px] font-extrabold tracking-widest text-[#2B0F55]">⚡ ADU SIGAP · KELAS {r.kelas}</p>
        <p className="mt-1 text-[19px] font-extrabold">{r.judul}</p>
        <p className="mt-1 text-[13.5px] text-[#55657D]">{r.status === "lobi" ? `${r.total} soal · pastikan HP siap, lalu tekan Gabung.` : ringan?.pengaturan?.gabung_terlambat === false ? "Kuis sudah berjalan dan tidak menerima peserta baru." : "Kuis sudah berjalan. Gabung sekarang, Anda ikut mulai soal berikutnya."}</p>
        <button type="button" disabled={kirim || (r.status !== "lobi" && ringan?.pengaturan?.gabung_terlambat === false)} onClick={gabung} className="mt-4 w-full rounded-xl bg-[#1E7A4C] px-4 py-3.5 text-[17px] font-extrabold text-white shadow hover:bg-[#17623C] disabled:opacity-60">
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
        <p className="mt-1 text-[13.5px] text-[#55657D]">Anda tidak ikut pada kuis “{r.judul}” (Kelas {r.kelas}).</p>
      </div>
    );
  } else if (r && saya && r.status === "lobi") {
    isi = (
      <div className={`${kartu} m-auto`}>
        <p className="text-[40px]" aria-hidden>✅</p>
        <p className="mt-1 text-[19px] font-extrabold">Anda sudah bergabung</p>
        <p className="mt-1 text-[14px] text-[#55657D]">{r.judul} · Kelas {r.kelas} · {r.total} soal</p>
        {sisaJadwal !== null && sisaJadwal > 0 && <p className="mt-2 text-[15px] font-extrabold tabular-nums text-[#46178F]">Jadwal mulai dalam {mmss(sisaJadwal)}</p>}
        <p className="mt-3 text-[13.5px] font-semibold text-[#9A6200]">Menunggu pemandu memulai kuis… jangan tutup halaman ini.</p>
      </div>
    );
  } else if (r && saya && r.status === "soal" && soal) {
    const sudah = !!pilihanSaya;
    const habis = sisa <= 0 && !dijeda;
    isi = (
      <div className="flex flex-1 flex-col">
        <div className="h-2 overflow-hidden rounded-full bg-white/25" aria-hidden>
          <div className="h-full rounded-full bg-[#FFD02B]" style={{ width: `${Math.min(100, (sisa / Math.max(1, soal.detik)) * 100)}%`, transition: "width 250ms linear" }} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[24px] font-extrabold tabular-nums text-[#46178F]" aria-label="Sisa waktu (detik)">{Math.ceil(sisa)}</div>
          <p className="flex-1 rounded-xl bg-white px-3.5 py-3 text-[17px] font-extrabold leading-snug text-[#14202E]">{soal.teks}</p>
        </div>
        {dijeda ? (
          <div className="m-auto text-center">
            <p className="text-[44px]" aria-hidden>⏸</p>
            <p className="text-[20px] font-extrabold">Kuis dijeda</p>
            <p className="mt-1 text-[14px] text-white/85">{sudah ? `Jawaban Anda (${pilihanSaya}) sudah tercatat. ` : ""}Waktu berhenti sementara — tunggu pemandu melanjutkan.</p>
          </div>
        ) : sudah ? (
          <div className="m-auto text-center">
            <p className="text-[44px]" aria-hidden>✓</p>
            <p className="text-[20px] font-extrabold">Jawaban terkirim</p>
            <p className="mt-1 text-[14px] text-white/85">Anda memilih <b>{soal.opsi.find((o) => o.kode === pilihanSaya)?.teks ?? pilihanSaya}</b>. Menunggu waktu habis / peserta lain…</p>
          </div>
        ) : habis ? (
          <div className="m-auto text-center">
            <p className="text-[44px]" aria-hidden>⏱</p>
            <p className="text-[20px] font-extrabold">Waktu habis</p>
            <p className="mt-1 text-[14px] text-white/85">Menunggu hasil…</p>
          </div>
        ) : (
          <div className="mt-3 grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2" style={{ gridAutoRows: "minmax(72px, 1fr)" }}>
            {soal.opsi.map((o, i) => {
              const w = warnaPosisi(i);
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
          <p className="mt-2 text-[13.5px] text-[#14202E]">Jawaban benar: <b>{kunciTeks?.teks ?? soal.kunci}</b></p>
          {soal.penjelasan && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-left text-[13px] leading-snug text-[#14202E]">💡 {soal.penjelasan}</p>}
        </div>
        <div className="rounded-2xl bg-white/15 px-4 py-3 text-center">
          <p className="text-[13px] font-semibold text-white/85">Poin Anda</p>
          <p className="text-[30px] font-extrabold tabular-nums">{saya.total_poin ?? 0}</p>
          {saya.peringkat != null && (
            <p className="text-[14px] font-bold">
              Peringkat {saya.peringkat} dari {saya.jumlah_peserta}
              {papanBoleh && saya.selisih_ke_atas != null && saya.selisih_ke_atas > 0 ? ` · kurang ${saya.selisih_ke_atas} poin untuk naik` : ""}
            </p>
          )}
        </div>
        {papanBoleh && papan.length > 0 && (
          <ol className="space-y-1" aria-label="Papan skor live">
            {papan.slice(0, 5).map((p, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-[13.5px] font-bold">
                <span className="w-5 shrink-0 text-[#FFD02B]">{p.peringkat}</span>
                <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                <span className="tabular-nums">{p.poin}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-center text-[12.5px] text-white/75">
          {dijeda ? "⏸ Kuis dijeda — menunggu pemandu melanjutkan…" : sisaLanjut !== null ? `Soal berikutnya dalam ${Math.ceil(sisaLanjut)} dtk…` : "Menunggu pemandu melanjutkan ke soal berikutnya…"}
        </p>
        {r.soal_ke > 1 || soal ? (
          <button type="button" onClick={bukaReview} className="w-full rounded-xl bg-white/15 px-4 py-2.5 text-[14px] font-bold hover:bg-white/25">📖 Review jawaban & penjelasan sejauh ini</button>
        ) : null}
      </div>
    );
  } else if (r && saya && r.status === "selesai") {
    isi = (
      <div className="m-auto w-full max-w-md space-y-3">
        <div className={kartu}>
          <p className="text-[44px]" aria-hidden>{saya.peringkat != null && saya.peringkat <= 3 ? ["🥇", "🥈", "🥉"][saya.peringkat - 1] : "🏁"}</p>
          <p className="mt-1 text-[20px] font-extrabold">Kuis selesai!</p>
          <p className="text-[14px] text-[#55657D]">{r.judul} · Kelas {r.kelas}</p>
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
        <button type="button" onClick={bukaReview} className="w-full rounded-xl bg-white px-4 py-3 text-[15px] font-extrabold text-[#46178F]">📖 Review jawaban & penjelasan</button>
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
        {kelas !== null && <span className="shrink-0 rounded-full bg-[#FFD02B] px-2.5 py-1 text-[12px] font-extrabold text-[#2B0F55]">Kelas {kelas}</span>}
        {r && <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-white/90">{r.judul}</span>}
        {r && r.status !== "lobi" && r.soal_ke > 0 && <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-bold tabular-nums">{r.soal_ke}/{r.total}</span>}
        {bisaPenuh && (
          <button type="button" onClick={layarPenuh} aria-pressed={penuh} title="Layar penuh" className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[12.5px] font-bold hover:bg-white/25">{penuh ? "⤢" : "⛶"}</button>
        )}
        <button type="button" onClick={ubahSuara} aria-pressed={suara} title="Efek suara" className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[12.5px] font-bold hover:bg-white/25">{suara ? "🔊" : "🔇"}</button>
        {saya?.gabung && <span className="shrink-0 rounded-full bg-[#FFD02B] px-3 py-1 text-[12.5px] font-extrabold tabular-nums text-[#2B0F55]">⭐ {saya.total_poin ?? 0}</span>}
      </div>
      {dijeda && r?.status !== "lobi" && <p className="mx-auto mb-2 w-full max-w-3xl rounded-lg bg-[#FFD02B] px-3 py-2 text-center text-[13px] font-extrabold text-[#2B0F55]" role="status">⏸ Kuis dijeda oleh pemandu</p>}
      {galat && <p className="mx-auto mb-2 w-full max-w-3xl rounded-lg bg-[#E21B3C] px-3 py-2 text-[13px] font-semibold">{galat}</p>}
      {galatAksi && <p className="mx-auto mb-2 w-full max-w-3xl rounded-lg bg-[#E21B3C] px-3 py-2 text-[13px] font-semibold">{galatAksi}</p>}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">{isi}</div>
    </div>
  );
}
