"use client";

// app/sigap/pelatihan/kelola/kuis.tsx
//
// (7-8 Okt 2026) SIGAP > Kelola Pelatihan > tab "Adu Sigap" (kuis live gaya Kahoot), satu ruang per KELAS (1-4), boleh paralel.
// Sub-tab: Pengaturan Kelas (soal, jalannya kuis, tampilan, jadwal; buka ruang) | Pantau Live | Bank Kuis | Riwayat & Rekap.
// Layar host (./kuisHost.tsx) dikendalikan admin: Start/Lanjut, Pause, Restart, Stop; peserta bermain dari HP lewat
// SIGAP › Pelatihan › Langkah › Adu Sigap.
// Izin menu `pelatihan.kelola`: lihat = layar host, pantau & rekap; kelola = bank soal, pengaturan kelas & kendali ruang.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BarisTab, Memuat, Pesan } from "../../admin/ui";
import { LayarHost, URL_KUIS_ADMIN } from "./kuisHost";
import { type Daftar } from "./kuisBersama";
import { PengaturanKelas } from "./kuisKelas";
import { PantauLive } from "./kuisLive";
import { BankKuis } from "./kuisBank";
import { Riwayat } from "./kuisRekap";

type SubTab = "kelas" | "live" | "bank" | "riwayat";
const TAB_SUB: { kode: SubTab; label: string }[] = [
  { kode: "kelas", label: "⚙ Pengaturan Kelas" },
  { kode: "live", label: "📡 Pantau Live" },
  { kode: "bank", label: "📚 Bank Kuis" },
  { kode: "riwayat", label: "🏆 Riwayat & Rekap" },
];

export default function KuisLive({ bisaKelolaAwal }: { bisaKelolaAwal?: boolean }) {
  const [data, setData] = useState<Daftar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [host, setHost] = useState<number | null>(null);
  const [rekap, setRekap] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [sub, setSub] = useState<SubTab>("kelas");

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Daftar>(`${URL_KUIS_ADMIN}?bagian=daftar`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat();
    if (host !== null) return; // layar host berjalan: daftar tidak perlu disegarkan
    const t = setInterval(muat, 8000);
    return () => clearInterval(t);
  }, [muat, host]);

  const bisaKelola = data?.boleh_kelola ?? bisaKelolaAwal ?? false;

  async function aksi(fn: () => Promise<unknown>, ok?: string) {
    setSibuk(true);
    setPesan(null);
    try {
      await fn();
      if (ok) setPesan({ jenis: "ok", teks: ok });
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  const nAktif = data.ruang.filter((r) => r.status !== "selesai").length;

  return (
    <div className="space-y-3">
      {host !== null && (
        <LayarHost
          ruangId={host}
          bisaKelola={bisaKelola}
          onTutup={() => {
            setHost(null);
            muat();
          }}
        />
      )}
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {pesan && <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>}

      <Pesan jenis="info">
        <b>Adu Sigap</b> = kuis live bergaya Kahoot, <b>satu ruang per kelas</b> dan boleh berjalan paralel{nAktif > 0 ? ` (sekarang ${nAktif} ruang aktif)` : ""}. Atur soal & pengaturan tiap kelas, buka ruang, lalu pegang layar host (<b>Start · Pause · Restart · Stop</b>); peserta menjawab dari HP lewat <b>SIGAP › Pelatihan › Langkah › Adu Sigap</b> (otomatis dari akun). Skor dicatat sebagai <b>nilai tambahan</b>, tidak mengubah pretest/posttest.
      </Pesan>

      <BarisTab tab={TAB_SUB} aktif={sub} onPilih={setSub} />

      {sub === "kelas" && <PengaturanKelas data={data} bisaKelola={bisaKelola} sibuk={sibuk} aksi={aksi} bukaHost={setHost} />}
      {sub === "live" && <PantauLive bisaKelola={bisaKelola} aktif={host === null} bukaHost={setHost} keTab={() => setSub("kelas")} />}
      {sub === "bank" && <BankKuis data={data} bisaKelola={bisaKelola} sibuk={sibuk} aksi={aksi} />}
      {sub === "riwayat" && <Riwayat data={data} bisaKelola={bisaKelola} sibuk={sibuk} aksi={aksi} bukaHost={setHost} bukaRekap={setRekap} rekapAktif={rekap} tutupRekap={() => setRekap(null)} />}
    </div>
  );
}
