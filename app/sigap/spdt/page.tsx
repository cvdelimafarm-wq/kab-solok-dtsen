"use client";

// app/sigap/spdt/page.tsx
//
// (16 Okt 2026) Lembar Pendataan SPDT NTP 2026 (mockup disetujui user). LEMBAR BANTU: nama KK, koordinat, navigasi -- tanpa status pendataan dan
// tanpa umpan balik petugas. Tab: PPL = Peta | Daftar KK (hanya KK wilayah tugasnya); PML = Monitoring | Peta | Daftar KK (KK semua PPL-nya);
// Supervisor = Monitoring (terbuka lebih dulu) | QC (hasil QC Pemahaman, baca saja) | Peta | Daftar KK (seluruh wilayah) | Dokumen.
// (30 Okt 2026) Tab Dokumen: PML mengunggah PDF scan hasil pemeriksaan; Supervisor mengunduhnya (PPL tidak punya tab ini). Tampilan mengikuti Lembar Pendataan bencana (header navy + tab bersegmen).

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TombolKembali from "@/app/components/TombolKembali";
import { buatProyeksi, warnaIndeks } from "@/lib/pendataan";
import { LABEL_PERAN, daftarPpl, jarakM, judulKata, saringKk, type KkSpdt } from "@/lib/spdtNtp";
import { kunciPetaSpdt } from "@/lib/petaDasar";
import KontrolPetaDasar from "../pendataan/KontrolPetaDasar";
import { useDasarTim } from "../pendataan/useDasar";
import type { StatusDasar } from "../pendataan/PetaDasar";
import { useKkSpdt } from "./useSpdt";
import Ik from "./Ik";
import PetaSpdt, { PANDANG_AWAL, type Pandang } from "./PetaSpdt";
import DaftarSpdt from "./DaftarSpdt";
import MonitoringSpdt from "./MonitoringSpdt";
import QcSpdt from "./QcSpdt";
import DokumenPml from "./DokumenPml";
import DokumenSupervisor from "./DokumenSupervisor";
import KartuKkSpdt from "./KartuKkSpdt";

// (21 Okt 2026) Peta jalan di bawah titik KK: komponen/penarik data yang sama dengan Lembar Pendataan bencana (pustaka peta dimuat hanya saat tab Peta memakainya).
const PetaDasar = dynamic(() => import("../pendataan/PetaDasar"), { ssr: false });

type Tab = "mon" | "qc" | "peta" | "daftar" | "dokumen";
const LABEL_TAB: Record<Tab, string> = { mon: "Monitoring", qc: "QC", peta: "Peta", daftar: "Daftar KK", dokumen: "Dokumen" };
const SELECT = "h-11 min-w-0 flex-1 rounded-[12px] border border-[#DCE5F2] bg-white px-2.5 text-[13px] font-semibold text-[#0F2A52] outline-none";

export default function HalamanSpdt() {
  const { data, galat, memuat } = useKkSpdt();
  const [tab, setTab] = useState<Tab | null>(null);
  const [pplF, setPplF] = useState<number | null>(null);
  const [jorongF, setJorongF] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<"nama" | "dekat">("nama");
  const [saya, setSaya] = useState<{ lat: number; lng: number } | null>(null);
  const [infoLokasi, setInfoLokasi] = useState<string | null>(null);
  const [terpilihId, setTerpilihId] = useState<number | null>(null);
  const [pandang, setPandang] = useState<Pandang>(PANDANG_AWAL);
  const [statusDasar, setStatusDasar] = useState<StatusDasar | null>(null);
  const [alasanDasar, setAlasanDasar] = useState<string | null>(null);


  const peran = data?.peran ?? null;
  // (29 Okt 2026) tab QC (hasil QC Pemahaman, baca saja) hanya untuk Supervisor
  const tabs: Tab[] = peran === "ppl" ? ["peta", "daftar"] : peran === "supervisor" ? ["mon", "qc", "peta", "daftar", "dokumen"] : ["mon", "peta", "daftar", "dokumen"];
  const tabAktif: Tab = tab && tabs.includes(tab) ? tab : tabs[0];
  const semuaKk: KkSpdt[] = useMemo(() => data?.kk ?? [], [data]);

  const ppl = useMemo(() => daftarPpl(semuaKk), [semuaKk]);
  const indeksPpl = useMemo(() => new Map(ppl.map((p) => [p.akun_id, p.indeks])), [ppl]);
  const jorongOpsi = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of semuaKk) m.set(`${k.nagari}|${k.jorong}`, `${judulKata(k.jorong)} · ${judulKata(k.nagari)}`);
    return Array.from(m, ([v, t]) => ({ v, t })).sort((a, b) => a.t.localeCompare(b.t));
  }, [semuaKk]);
  const indeksJorong = useMemo(() => new Map(jorongOpsi.map((j, i) => [j.v, i])), [jorongOpsi]);

  const kkPeta = useMemo(() => saringKk(semuaKk, { ppl: pplF, jorong: jorongF, cari: "" }), [semuaKk, pplF, jorongF]);
  const kkDaftar = useMemo(() => saringKk(semuaKk, { ppl: pplF, jorong: jorongF, cari }), [semuaKk, pplF, jorongF, cari]);
  const proj = useMemo(() => buatProyeksi(kkPeta.map((k) => ({ lat: k.lat, lng: k.lng })), 360, 440), [kkPeta]);
  // peta jalan per peran: PPL = KK miliknya, PML = KK tim, Supervisor = seluruh wilayah (berkas dibuat `potong-peta.mjs --spdt`). Tanpa berkas = kanvas titik seperti sebelumnya.
  const dasar = useDasarTim(kunciPetaSpdt(peran, semuaKk), tabAktif === "peta");
  const pakaiDasar = !!proj && dasar.lapisan === "jalan" && !!dasar.sumber && statusDasar !== "gagal";
  const kunciDasar = !dasar.sumber ? "" : dasar.sumber.tipe === "blob" ? `b:${dasar.sumber.nama}:${dasar.sumber.blob.size}` : `o:${dasar.sumber.url}`;
  useEffect(() => {
    setStatusDasar(null);
  }, [kunciDasar]);
  const warnaOleh = peran === "ppl" ? "jorong" : "ppl";
  const indeksWarna = (k: KkSpdt) => (warnaOleh === "jorong" ? (indeksJorong.get(`${k.nagari}|${k.jorong}`) ?? 0) : (indeksPpl.get(k.ppl_akun_id ?? -1) ?? 0));

  // saring berubah -> peta menyesuaikan ulang ke titik yang tampil
  useEffect(() => setPandang(PANDANG_AWAL), [pplF, jorongF]);
  // PPL/jorong yang dipilih hilang dari daftar (mis. data diperbarui) -> kembali ke semua
  useEffect(() => {
    if (pplF != null && !ppl.some((p) => p.akun_id === pplF)) setPplF(null);
    if (jorongF && !jorongOpsi.some((j) => j.v === jorongF)) setJorongF(null);
  }, [ppl, jorongOpsi, pplF, jorongF]);

  const jarak = useMemo(() => (saya ? new Map(semuaKk.map((k) => [k.id, jarakM(saya, k)])) : null), [saya, semuaKk]);
  const kkTerpilih = terpilihId != null ? (semuaKk.find((k) => k.id === terpilihId) ?? null) : null;

  function cariPosisi() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setInfoLokasi("Perangkat ini tidak bisa membaca lokasi.");
      return;
    }
    setInfoLokasi("Membaca lokasi…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setSaya({ lat: p.coords.latitude, lng: p.coords.longitude });
        setInfoLokasi(null);
      },
      () => setInfoLokasi("Lokasi tidak terbaca. Izinkan akses lokasi di pengaturan peramban lalu coba lagi."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  }
  function gantiUrut() {
    if (urut === "nama") {
      if (saya) setUrut("dekat");
      else {
        cariPosisi();
        setUrut("dekat");
      }
    } else setUrut("nama");
  }

  const tabKhusus = tabAktif === "mon" || tabAktif === "qc" || tabAktif === "dokumen"; // tab tanpa penyaring/peta KK
  const adaFilter = !!data && !tabKhusus;
  const tampilPpl = peran !== "ppl";

  return (
    <main className="flex min-h-[calc(100dvh_-_var(--tinggi-banner,0px))] flex-col bg-[#F2F6FC] text-[#1B2B4B]">
      <header className="flex-none bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-3 pb-2.5 pt-2 text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16.5px] font-extrabold leading-[1.15]">Lembar Pendataan</h1>
              <p className="truncate text-[11.5px] text-[#A9BCD8]">{peran ? `SPDT NTP 2026 · ${LABEL_PERAN[peran]}` : "SPDT NTP 2026"}</p>
            </div>
            {data && (
              <div className="flex-none text-right">
                <div className="text-[15px] font-extrabold leading-[1.1]">{semuaKk.length}</div>
                <div className="text-[10.5px] text-[#A9BCD8]">KK sasaran</div>
              </div>
            )}
          </div>
          {data && (
            <div role="tablist" aria-label="Tampilan" className="flex gap-[3px] rounded-[12px] bg-white/10 p-[3px]">
              {tabs.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tabAktif === k} onClick={() => setTab(k)} className={`grid h-11 flex-1 place-items-center rounded-[9px] font-bold ${tabs.length > 4 ? "px-0.5 text-[12px]" : "text-[13.5px]"} ${tabAktif === k ? "bg-white text-[#0F2A52]" : "text-[#D3E0F5]"}`}>
                  {LABEL_TAB[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        {galat && <p className="m-2.5 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!data && !galat && memuat && (
          <div className="m-2.5 rounded-[18px] bg-white p-4" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}

        {data && semuaKk.length === 0 && !tabKhusus && (
          <p className="m-2.5 rounded-[18px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">Belum ada KK yang ditugaskan kepada Anda di SPDT NTP. Hubungi Supervisor bila ini keliru.</p>
        )}

        {/* penyaring: PPL (PML/Supervisor) dan Jorong */}
        {adaFilter && semuaKk.length > 0 && (ppl.length > 1 || jorongOpsi.length > 1) && (
          <div className="flex gap-1.5 px-2.5 pt-2">
            {ppl.length > 1 && (
              <label className="flex min-w-0 flex-1">
                <span className="sr-only">Saring PPL</span>
                <select value={pplF ?? ""} onChange={(e) => setPplF(e.target.value ? Number(e.target.value) : null)} className={SELECT}>
                  <option value="">Semua PPL ({ppl.length})</option>
                  {ppl.map((p) => (
                    <option key={p.akun_id} value={p.akun_id}>
                      {judulKata(p.nama)} · {p.jumlah}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {jorongOpsi.length > 1 && (
              <label className="flex min-w-0 flex-1">
                <span className="sr-only">Saring Jorong</span>
                <select value={jorongF ?? ""} onChange={(e) => setJorongF(e.target.value || null)} className={SELECT}>
                  <option value="">Semua Jorong ({jorongOpsi.length})</option>
                  {jorongOpsi.map((j) => (
                    <option key={j.v} value={j.v}>
                      {j.t}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {adaFilter && infoLokasi && <p className="mx-2.5 mt-1.5 rounded-[10px] bg-[#EAF1FC] px-3 py-1.5 text-[12px] text-[#1A4590]">{infoLokasi}</p>}

        {data && tabAktif === "mon" && peran !== "ppl" && <MonitoringSpdt aktif />}
        {data && tabAktif === "qc" && peran === "supervisor" && <QcSpdt aktif />}
        {data && tabAktif === "dokumen" && peran === "pml" && <DokumenPml />}
        {data && tabAktif === "dokumen" && peran === "supervisor" && <DokumenSupervisor />}

        {data && tabAktif === "peta" && semuaKk.length > 0 && (
          <section className="relative m-2.5 min-h-[360px] flex-1 overflow-hidden rounded-[18px] border border-[#DDE3D6] bg-[#EEF2F7]">
            {proj && kkPeta.length > 0 ? (
              <>
                {pakaiDasar && dasar.sumber && <PetaDasar proj={proj} pandang={pandang} sumber={dasar.sumber} onStatus={(s, a) => { setStatusDasar(s); setAlasanDasar(a ?? null); }} />}
                <div className="absolute inset-0">
                  <PetaSpdt kk={kkPeta} proj={proj} warnaIndeksKk={indeksWarna} pandang={pandang} setPandang={(f) => setPandang(f)} terpilih={terpilihId} onPilih={setTerpilihId} saya={saya} tanpaLatar={pakaiDasar && statusDasar === "siap"} />
                </div>
                <KontrolPetaDasar dasar={dasar} status={statusDasar} alasan={alasanDasar} />
                <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_4px_12px_rgba(15,42,82,.15)]">
                  <button type="button" aria-label="Perbesar" onClick={() => setPandang((p) => ({ ...p, z: Math.min(12, p.z * 1.6) }))} className="grid h-11 w-11 place-items-center border-b border-[#EEF2F7] text-[#0F2A52] active:bg-[#F1F5FC]">
                    <Ik n="tambah" />
                  </button>
                  <button type="button" aria-label="Perkecil" onClick={() => setPandang((p) => ({ ...p, z: Math.max(1, p.z / 1.6) }))} className="grid h-11 w-11 place-items-center border-b border-[#EEF2F7] text-[#0F2A52] active:bg-[#F1F5FC]">
                    <Ik n="kurang" />
                  </button>
                  <button type="button" aria-label="Tampilkan semua" onClick={() => setPandang(PANDANG_AWAL)} className="grid h-11 w-11 place-items-center text-[#0F2A52] active:bg-[#F1F5FC]">
                    <Ik n="semua" />
                  </button>
                </div>
                <button type="button" aria-label="Tampilkan posisi saya" onClick={cariPosisi} className="absolute right-2.5 top-[150px] grid h-11 w-11 place-items-center rounded-[12px] bg-white text-[#1F5FD1] shadow-[0_4px_12px_rgba(15,42,82,.15)] active:bg-[#F1F5FC]">
                  <Ik n="lokasi" />
                </button>
                <div className="absolute bottom-2.5 left-2.5 flex max-w-[190px] flex-col gap-0.5 rounded-[10px] bg-white/[.93] px-2.5 py-1.5 text-[11px] font-bold text-[#44546F]">
                  <span>
                    {kkPeta.length} KK · Warna = {warnaOleh === "ppl" ? "PPL" : "Jorong"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#5B6B84]">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="#D98E04" strokeWidth="1.6" strokeDasharray="3 2.4" /></svg>
                    GPS kurang akurat (&gt; 50 m)
                  </span>
                  {pplF != null && <span className="font-semibold" style={{ color: warnaIndeks(indeksPpl.get(pplF) ?? 0) }}>{judulKata(ppl.find((p) => p.akun_id === pplF)?.nama ?? "")}</span>}
                </div>
              </>
            ) : (
              <p className="p-6 text-center text-[13px] text-[#55657D]">Tidak ada titik yang cocok dengan penyaring ini.</p>
            )}
          </section>
        )}

        {data && tabAktif === "daftar" && semuaKk.length > 0 && (
          <DaftarSpdt kk={kkDaftar} jarak={jarak} urut={urut === "dekat" && jarak ? "dekat" : "nama"} onUrut={gantiUrut} cari={cari} onCari={setCari} onPilih={setTerpilihId} terpilih={terpilihId} tampilPpl={tampilPpl} />
        )}
      </div>

      {kkTerpilih && !tabKhusus && <KartuKkSpdt kk={kkTerpilih} jarak={jarak?.get(kkTerpilih.id) ?? null} tampilPpl={tampilPpl} onTutup={() => setTerpilihId(null)} />}
    </main>
  );
}
