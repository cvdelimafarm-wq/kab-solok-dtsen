"use client";

// app/sigap/pelatihan/kelola/kehadiran.tsx
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan -- pengaturan titik presensi, monitoring presensi, monitoring Transport Lokal.
// Mockup disetujui user (presensi radius 300 m dari Mami Hotel; jam 06.00-18.00; sekali saja; presensi manual panitia).

import { useCallback, useEffect, useMemo, useState } from "react";
import { LABEL_SLOT_FOTO, teksJarak, type PengaturanPresensi } from "@/lib/sigapPresensi";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";

const URL_KEHADIRAN = "/api/sigap/pelatihan/admin/kehadiran";
const jamWib = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const keInputWib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16);

/** Polling data admin tiap `ms` (segar otomatis). */
function usePolling<T>(url: string, ms = 10_000) {
  const [data, setData] = useState<T | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<T>(url));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [url]);
  useEffect(() => {
    muat();
    const t = setInterval(muat, ms);
    return () => clearInterval(t);
  }, [muat, ms]);
  return { data, galat, muat };
}

// ======================================================================
// Pengaturan presensi (tab Soal & Jadwal)
// ======================================================================
type RespPengaturan = { sekarang: string; boleh_kelola: boolean; pengaturan: PengaturanPresensi | null };

export function PengaturanPresensiKartu() {
  const [d, setD] = useState<RespPengaturan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("300");
  const [akurasi, setAkurasi] = useState("100");
  const [buka, setBuka] = useState("");
  const [tutup, setTutup] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const isi = (p: PengaturanPresensi) => {
    setLat(String(p.lat));
    setLng(String(p.lng));
    setRadius(String(p.radius_m));
    setAkurasi(String(p.akurasi_maks_m));
    setBuka(keInputWib(p.buka_at));
    setTutup(keInputWib(p.tutup_at));
  };
  useEffect(() => {
    fetchJson<RespPengaturan>(`${URL_KEHADIRAN}?bagian=pengaturan`)
      .then((r) => {
        setD(r);
        if (r.pengaturan) isi(r.pengaturan);
      })
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, []);

  function pakaiLokasiSaya() {
    setPesan(null);
    if (!("geolocation" in navigator)) return setPesan({ jenis: "galat", teks: "Browser ini tidak mendukung lokasi." });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(String(p.coords.latitude));
        setLng(String(p.coords.longitude));
        setPesan({ jenis: "ok", teks: `Titik diisi dari lokasi Anda (akurasi ±${Math.round(p.coords.accuracy)} m). Tekan Simpan untuk memakainya.` });
      },
      () => setPesan({ jenis: "galat", teks: "Lokasi tidak terbaca. Izinkan lokasi pada browser." }),
      { enableHighAccuracy: true, timeout: 20_000 }
    );
  }

  async function simpan() {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson(URL_KEHADIRAN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "atur_presensi", lat: Number(lat.replace(",", ".")), lng: Number(lng.replace(",", ".")), radius_m: Number(radius), akurasi_maks_m: Number(akurasi), buka_at: buka, tutup_at: tutup }),
      });
      setPesan({ jenis: "ok", teks: "Pengaturan presensi tersimpan." });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!d) return <Memuat />;
  const bisa = d.boleh_kelola;
  const peta = lat && lng ? `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}` : null;
  return (
    <Kartu judul="Presensi di lokasi pelatihan" ket={d.pengaturan?.tempat ?? ""}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Lintang (latitude)
          <input className={`${INPUT} mt-0.5 w-full`} value={lat} onChange={(e) => setLat(e.target.value)} disabled={!bisa} inputMode="decimal" />
        </label>
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Bujur (longitude)
          <input className={`${INPUT} mt-0.5 w-full`} value={lng} onChange={(e) => setLng(e.target.value)} disabled={!bisa} inputMode="decimal" />
        </label>
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Radius (meter)
          <input className={`${INPUT} mt-0.5 w-full`} value={radius} onChange={(e) => setRadius(e.target.value)} disabled={!bisa} inputMode="numeric" />
        </label>
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Presensi dibuka (WIB)
          <input type="datetime-local" className={`${INPUT} mt-0.5 w-full`} value={buka} onChange={(e) => setBuka(e.target.value)} disabled={!bisa} />
        </label>
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Presensi ditutup (WIB)
          <input type="datetime-local" className={`${INPUT} mt-0.5 w-full`} value={tutup} onChange={(e) => setTutup(e.target.value)} disabled={!bisa} />
        </label>
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Akurasi GPS maks. (meter)
          <input className={`${INPUT} mt-0.5 w-full`} value={akurasi} onChange={(e) => setAkurasi(e.target.value)} disabled={!bisa} inputMode="numeric" />
        </label>
      </div>
      <p className="mt-2 text-[12px] text-[#7B8794]">
        Peserta hanya bisa presensi bila berada dalam radius dari titik ini dan sinyal GPS-nya cukup akurat. Presensi sekali saja per peserta.{" "}
        {peta && (
          <a href={peta} target="_blank" rel="noreferrer" className="font-semibold text-[#1F6FD1] underline">
            Lihat titik di Google Maps
          </a>
        )}
      </p>
      {pesan && <div className="mt-2"><Pesan jenis={pesan.jenis}>{pesan.teks}</Pesan></div>}
      {bisa && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={pakaiLokasiSaya}>
            📍 Pakai lokasi saya sekarang
          </button>
          <button type="button" className={BTN} onClick={simpan} disabled={sibuk}>
            {sibuk ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      )}
    </Kartu>
  );
}

// ======================================================================
// Monitoring presensi
// ======================================================================
type PresensiPes = {
  akun_id: number;
  nama: string;
  peran: string;
  kelas: number | null;
  status: "hadir" | "ditolak" | "belum";
  at: string | null;
  jarak_m: number | null;
  manual: boolean;
  alasan: string | null;
  dicatat_oleh: string | null;
  percobaan: number;
  percobaan_terakhir_at: string | null;
  percobaan_jarak_m: number | null;
  percobaan_alasan: string | null;
};
type RespPresensi = { sekarang: string; boleh_kelola: boolean; pengaturan: PengaturanPresensi | null; stat: { peserta: number; hadir: number; ditolak: number; belum: number }; peserta: PresensiPes[] };

export function MonitoringPresensi() {
  const { data, galat, muat } = usePolling<RespPresensi>(`${URL_KEHADIRAN}?bagian=presensi`);
  const [kelas, setKelas] = useState("");
  const [peran, setPeran] = useState("");
  const [status, setStatus] = useState("");
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const baris = useMemo(
    () =>
      (data?.peserta ?? []).filter((p) => (!kelas || String(p.kelas ?? "") === kelas) && (!peran || p.peran === peran) && (!status || p.status === status) && (!cari || p.nama.toLowerCase().includes(cari.toLowerCase()))),
    [data, kelas, peran, status, cari]
  );

  async function catatManual(akunId: number) {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson(URL_KEHADIRAN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "presensi_manual", akun_id: akunId, alasan }) });
      setBuka(null);
      setAlasan("");
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  async function ekspor() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [["No", "Nama", "Kelas", "Peran", "Status", "Waktu presensi (WIB)", "Jarak (m)", "Cara", "Alasan/keterangan", "Percobaan ditolak"]];
    baris.forEach((p, i) =>
      aoa.push([i + 1, p.nama, p.kelas ?? "", p.peran.toUpperCase(), p.status === "hadir" ? "Hadir" : p.status === "ditolak" ? "Ditolak (belum hadir)" : "Belum", p.at ? waktuWib(p.at) : "", p.jarak_m != null ? Math.round(p.jarak_m) : "", p.status === "hadir" ? (p.manual ? `Manual (${p.dicatat_oleh ?? ""})` : "Aplikasi") : "", p.alasan ?? "", p.percobaan])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 7 }, { wch: 7 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 28 }, { wch: 36 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presensi");
    XLSX.writeFile(wb, `Presensi_Pelatihan_PSP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  const st = data.stat;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={st.peserta} />
        <KartuAngka label="Sudah presensi" nilai={st.hadir} ket={`${st.peserta ? Math.round((st.hadir / st.peserta) * 100) : 0}%`} warna="#1E7A4C" />
        <KartuAngka label="Belum presensi" nilai={st.belum + st.ditolak} warna="#9A6200" />
        <KartuAngka label="Ditolak (di luar radius/GPS)" nilai={st.ditolak} warna="#C0392B" />
      </div>
      <Kartu
        judul="Presensi per peserta"
        ket={`${baris.length} dari ${data.peserta.length} · segar otomatis tiap 10 detik${data.pengaturan ? ` · radius ${data.pengaturan.radius_m} m` : ""}`}
        kanan={
          <button type="button" className={BTN_O} onClick={ekspor}>
            ⬇ Ekspor Excel
          </button>
        }
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <select className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </select>
          <select className={INPUT} value={peran} onChange={(e) => setPeran(e.target.value)} aria-label="Filter peran">
            <option value="">Semua peran</option>
            <option value="pml">PML</option>
            <option value="ppl">PPL</option>
          </select>
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            <option value="">Semua status</option>
            <option value="hadir">Sudah presensi</option>
            <option value="ditolak">Ditolak</option>
            <option value="belum">Belum mencoba</option>
          </select>
          <input className={`${INPUT} min-w-[160px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        {pesan && <div className="mb-2"><Pesan jenis="galat">{pesan}</Pesan></div>}
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Kls</th>
              <th className={TH}>Peran</th>
              <th className={TH}>Presensi</th>
              <th className={TH}>Jarak</th>
              {data.boleh_kelola && <th className={TH}></th>}
            </tr>
          </thead>
          <tbody>
            {baris.map((p) => (
              <FragmentBaris key={p.akun_id}>
                <tr>
                  <td className={`${TD} font-semibold`}>{p.nama}</td>
                  <td className={TD}>{p.kelas ?? "–"}</td>
                  <td className={TD}>{p.peran.toUpperCase()}</td>
                  <td className={TD}>
                    {p.status === "hadir" ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Chip w="ok">{p.at ? jamWib(p.at) : "–"} WIB</Chip>
                        {p.manual && <Chip w="wait">manual</Chip>}
                      </span>
                    ) : p.status === "ditolak" ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Chip w="bad">ditolak {p.percobaan_terakhir_at ? jamWib(p.percobaan_terakhir_at) : ""}</Chip>
                        <span className="text-[11.5px] text-[#7B8794]">{p.percobaan_alasan}{p.percobaan > 1 ? ` · ${p.percobaan}×` : ""}</span>
                      </span>
                    ) : (
                      <Chip w="wait">belum presensi</Chip>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums`}>{p.status === "hadir" ? (p.jarak_m != null ? teksJarak(p.jarak_m) : "–") : p.percobaan_jarak_m != null ? teksJarak(p.percobaan_jarak_m) : "–"}</td>
                  {data.boleh_kelola && (
                    <td className={TD}>
                      {p.status !== "hadir" && (
                        <button type="button" className={BTN_G} onClick={() => { setBuka(buka === p.akun_id ? null : p.akun_id); setAlasan(""); setPesan(null); }}>
                          Catat manual
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {buka === p.akun_id && (
                  <tr>
                    <td className={TD} colSpan={6}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className={`${INPUT} min-w-[220px] flex-1`} placeholder="Alasan wajib (mis. GPS tidak terbaca)" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
                        <button type="button" className={BTN} disabled={sibuk || alasan.trim().length < 5} onClick={() => catatManual(p.akun_id)}>
                          {sibuk ? "Menyimpan…" : "Catat hadir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </FragmentBaris>
            ))}
            {baris.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={6}>
                  Tidak ada peserta yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </TabelKartu>
      </Kartu>
    </div>
  );
}

function FragmentBaris({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ======================================================================
// Monitoring Transport Lokal
// ======================================================================
type TranslokPes = { akun_id: number; penugasan_id: number; nama: string; peran: string; kelas: number | null; slot: number[]; terakhir_at: string | null };
type RespTranslok = { sekarang: string; tanggal: string; foto_total: number; stat: { peserta: number; lengkap: number; sebagian: number; belum: number }; peserta: TranslokPes[] };
type FotoAda = { slot: number; url: string | null; diunggah_at: string; susulan: boolean };

export function MonitoringTranslok() {
  const { data, galat } = usePolling<RespTranslok>(`${URL_KEHADIRAN}?bagian=translok`, 15_000);
  const [kelas, setKelas] = useState("");
  const [peran, setPeran] = useState("");
  const [status, setStatus] = useState("");
  const [cari, setCari] = useState("");
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [foto, setFoto] = useState<FotoAda[] | null>(null);
  const [galatFoto, setGalatFoto] = useState<string | null>(null);

  const kategori = (p: TranslokPes, total: number) => (p.slot.length >= total ? "lengkap" : p.slot.length === 0 ? "belum" : "sebagian");
  const baris = useMemo(() => {
    if (!data) return [];
    return data.peserta.filter((p) => (!kelas || String(p.kelas ?? "") === kelas) && (!peran || p.peran === peran) && (!status || kategori(p, data.foto_total) === status) && (!cari || p.nama.toLowerCase().includes(cari.toLowerCase())));
  }, [data, kelas, peran, status, cari]);

  async function bukaFoto(p: TranslokPes) {
    if (terbuka === p.penugasan_id) return setTerbuka(null);
    setTerbuka(p.penugasan_id);
    setFoto(null);
    setGalatFoto(null);
    try {
      const r = await fetchJson<{ foto: FotoAda[] }>(`${URL_KEHADIRAN}?bagian=foto&penugasan_id=${p.penugasan_id}`);
      setFoto(r.foto);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalatFoto(pesanGalat(e));
    }
  }

  async function ekspor() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const kepala = ["No", "Nama", "Kelas", "Peran", "Jumlah foto", ...Array.from({ length: data.foto_total }, (_, i) => LABEL_SLOT_FOTO[i] ?? `Foto ${i + 1}`), "Status", "Terakhir unggah (WIB)"];
    const aoa: (string | number)[][] = [kepala];
    baris.forEach((p, i) =>
      aoa.push([i + 1, p.nama, p.kelas ?? "", p.peran.toUpperCase(), p.slot.length, ...Array.from({ length: data.foto_total }, (_, k) => (p.slot.includes(k + 1) ? "ada" : "")), kategori(p, data.foto_total), p.terakhir_at ? waktuWib(p.terakhir_at) : ""])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 7 }, { wch: 7 }, { wch: 11 }, ...Array.from({ length: data.foto_total }, () => ({ wch: 13 })), { wch: 11 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transport Lokal");
    XLSX.writeFile(wb, `Translok_Pelatihan_PSP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  const st = data.stat;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={st.peserta} />
        <KartuAngka label={`Foto lengkap (${data.foto_total}/${data.foto_total})`} nilai={st.lengkap} warna="#1E7A4C" />
        <KartuAngka label="Sebagian" nilai={st.sebagian} warna="#9A6200" />
        <KartuAngka label="Belum unggah" nilai={st.belum} warna="#C0392B" />
      </div>
      <Kartu
        judul="Foto Transport Lokal per peserta"
        ket={`hari pelatihan ${data.tanggal} · segar otomatis tiap 15 detik`}
        kanan={
          <button type="button" className={BTN_O} onClick={ekspor}>
            ⬇ Ekspor Excel
          </button>
        }
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <select className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </select>
          <select className={INPUT} value={peran} onChange={(e) => setPeran(e.target.value)} aria-label="Filter peran">
            <option value="">Semua peran</option>
            <option value="pml">PML</option>
            <option value="ppl">PPL</option>
          </select>
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            <option value="">Semua status</option>
            <option value="lengkap">Lengkap</option>
            <option value="sebagian">Sebagian</option>
            <option value="belum">Belum unggah</option>
          </select>
          <input className={`${INPUT} min-w-[160px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Kls</th>
              <th className={TH}>Foto</th>
              <th className={TH}>Status</th>
              <th className={TH}>Terakhir</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((p) => {
              const k = kategori(p, data.foto_total);
              const kurang = Array.from({ length: data.foto_total }, (_, i) => i + 1).filter((s) => !p.slot.includes(s));
              return (
                <FragmentBaris key={p.penugasan_id}>
                  <tr className="cursor-pointer hover:bg-[#F8FAFC]" onClick={() => bukaFoto(p)}>
                    <td className={`${TD} font-semibold`}>{p.nama}</td>
                    <td className={TD}>{p.kelas ?? "–"}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-0.5" title={`${p.slot.length} dari ${data.foto_total}`}>
                        {Array.from({ length: data.foto_total }, (_, i) => (
                          <i key={i} className={`inline-block h-3 w-3 rounded-[3px] ${p.slot.includes(i + 1) ? "bg-[#1E7A4C]" : "bg-[#E3E8EE]"}`} />
                        ))}
                        <span className="ml-1.5 text-[11.5px] tabular-nums text-[#55657D]">{p.slot.length}/{data.foto_total}</span>
                      </span>
                    </td>
                    <td className={TD}>
                      {k === "lengkap" ? <Chip w="ok">lengkap</Chip> : k === "belum" ? <Chip w="bad">belum unggah</Chip> : <Chip w="wait">kurang: {kurang.map((s) => (LABEL_SLOT_FOTO[s - 1] ?? `Foto ${s}`).toLowerCase()).join(", ")}</Chip>}
                    </td>
                    <td className={`${TD} tabular-nums`}>{p.terakhir_at ? `${jamWib(p.terakhir_at)}` : "–"}</td>
                  </tr>
                  {terbuka === p.penugasan_id && (
                    <tr>
                      <td className={TD} colSpan={5}>
                        {galatFoto && <Pesan jenis="galat">{galatFoto}</Pesan>}
                        {!foto && !galatFoto && <Memuat />}
                        {foto && foto.length === 0 && <p className="text-[12.5px] text-[#7B8794]">Belum ada foto.</p>}
                        {foto && foto.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            {foto.map((f) => (
                              <a key={f.slot} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-[#E3E8EE] bg-slate-900">
                                {f.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.url} alt={`Foto ${f.slot}`} className="aspect-[4/3] w-full object-cover" />}
                                <p className="bg-white px-1.5 py-1 text-[11px] font-semibold text-[#14202E]">
                                  {f.slot}. {LABEL_SLOT_FOTO[f.slot - 1] ?? `Foto ${f.slot}`} · {jamWib(f.diunggah_at)}
                                  {f.susulan ? " · susulan" : ""}
                                </p>
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentBaris>
              );
            })}
            {baris.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={5}>
                  Tidak ada peserta yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </TabelKartu>
      </Kartu>
    </div>
  );
}

// ======================================================================
// Monitoring akses pelatihan (siapa yang belum membuka halaman Pelatihan)
// ======================================================================
type AksesPes = {
  akun_id: number;
  nama: string;
  peran: string;
  kelas: number | null;
  kecamatan: string | null;
  akun_dibuat: boolean;
  terakhir_masuk_at: string | null;
  akses_pertama_at: string | null;
  undangan_dibuka: boolean;
  hp: string | null;
};
type RespAkses = { sekarang: string; boleh_lihat_kontak: boolean; stat: { peserta: number; sudah: number; belum: number; belum_pernah_masuk: number }; peserta: AksesPes[] };

/** Nomor HP -> tautan WhatsApp (628…). Hanya membuka WhatsApp; pesan dikirim sendiri oleh pengelola. */
const tautanWa = (hp: string) => {
  const d = hp.replace(/\D/g, "");
  const n = d.startsWith("0") ? `62${d.slice(1)}` : d.startsWith("62") ? d : `62${d}`;
  return `https://wa.me/${n}`;
};
const tglJam = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function MonitoringAkses() {
  const { data, galat } = usePolling<RespAkses>(`${URL_KEHADIRAN}?bagian=akses`);
  const [kelas, setKelas] = useState("");
  const [peran, setPeran] = useState("");
  const [status, setStatus] = useState("belum");
  const [cari, setCari] = useState("");
  const [salin, setSalin] = useState<string | null>(null);

  const baris = useMemo(
    () =>
      (data?.peserta ?? []).filter(
        (p) =>
          (!kelas || String(p.kelas ?? "") === kelas) &&
          (!peran || p.peran === peran) &&
          (!status || (status === "belum" ? !p.akses_pertama_at : status === "belum_masuk" ? !p.akses_pertama_at && !p.terakhir_masuk_at : !!p.akses_pertama_at)) &&
          (!cari || p.nama.toLowerCase().includes(cari.toLowerCase()))
      ),
    [data, kelas, peran, status, cari]
  );

  async function salinDaftar() {
    const teks = baris.map((p, i) => `${i + 1}. ${p.nama} (Kelas ${p.kelas ?? "-"}, ${p.peran.toUpperCase()})`).join("\n");
    try {
      await navigator.clipboard.writeText(teks);
      setSalin(`${baris.length} nama tersalin.`);
    } catch {
      setSalin("Gagal menyalin; gunakan Ekspor Excel.");
    }
    setTimeout(() => setSalin(null), 3000);
  }

  async function ekspor() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [["No", "Nama", "Kelas", "Peran", "Kecamatan", "Akses pelatihan", "Akses pertama (WIB)", "Undangan dibuka", "Login terakhir (WIB)", "Akun dibuat", ...(data.boleh_lihat_kontak ? ["No. HP"] : [])]];
    baris.forEach((p, i) =>
      aoa.push([i + 1, p.nama, p.kelas ?? "", p.peran.toUpperCase(), p.kecamatan ?? "", p.akses_pertama_at ? "sudah" : "belum", p.akses_pertama_at ? waktuWib(p.akses_pertama_at) : "", p.undangan_dibuka ? "ya" : "tidak", p.terakhir_masuk_at ? waktuWib(p.terakhir_masuk_at) : "belum pernah", p.akun_dibuat ? "ya" : "belum", ...(data.boleh_lihat_kontak ? [p.hp ?? ""] : [])])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 7 }, { wch: 7 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 11 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Akses pelatihan");
    XLSX.writeFile(wb, `Akses_Pelatihan_PSP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  const st = data.stat;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={st.peserta} />
        <KartuAngka label="Sudah akses" nilai={st.sudah} ket={`${st.peserta ? Math.round((st.sudah / st.peserta) * 100) : 0}%`} warna="#1E7A4C" />
        <KartuAngka label="Belum akses" nilai={st.belum} warna="#C0392B" />
        <KartuAngka label="Belum pernah login" nilai={st.belum_pernah_masuk} ket="belum masuk SIGAP sama sekali" warna="#9A6200" />
      </div>
      <Kartu
        judul="Akses halaman Pelatihan"
        ket={`${baris.length} dari ${data.peserta.length} · segar otomatis tiap 10 detik`}
        kanan={
          <span className="flex flex-wrap gap-1.5">
            <button type="button" className={BTN_O} onClick={salinDaftar}>
              📋 Salin nama
            </button>
            <button type="button" className={BTN_O} onClick={ekspor}>
              ⬇ Ekspor Excel
            </button>
          </span>
        }
      >
        {salin && <p className="mb-2 text-[12.5px] font-semibold text-[#17623C]">{salin}</p>}
        <div className="mb-2 flex flex-wrap gap-2">
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter akses">
            <option value="belum">Belum akses</option>
            <option value="belum_masuk">Belum pernah login</option>
            <option value="sudah">Sudah akses</option>
            <option value="">Semua</option>
          </select>
          <select className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </select>
          <select className={INPUT} value={peran} onChange={(e) => setPeran(e.target.value)} aria-label="Filter peran">
            <option value="">Semua peran</option>
            <option value="pml">PML</option>
            <option value="ppl">PPL</option>
          </select>
          <input className={`${INPUT} min-w-[160px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Kls</th>
              <th className={TH}>Peran</th>
              <th className={TH}>Kecamatan</th>
              <th className={TH}>Akses pelatihan</th>
              <th className={TH}>Login terakhir</th>
              {data.boleh_lihat_kontak && <th className={TH}>Kontak</th>}
            </tr>
          </thead>
          <tbody>
            {baris.map((p) => (
              <tr key={p.akun_id}>
                <td className={`${TD} font-semibold`}>{p.nama}</td>
                <td className={TD}>{p.kelas ?? "–"}</td>
                <td className={TD}>{p.peran.toUpperCase()}</td>
                <td className={TD}>{p.kecamatan ?? "–"}</td>
                <td className={TD}>
                  {p.akses_pertama_at ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Chip w="ok">sudah</Chip>
                      <span className="text-[11.5px] tabular-nums text-[#55657D]">{tglJam(p.akses_pertama_at)}</span>
                    </span>
                  ) : (
                    <Chip w="bad">belum akses</Chip>
                  )}
                </td>
                <td className={`${TD} text-[12px]`}>
                  {p.terakhir_masuk_at ? <span className="tabular-nums">{tglJam(p.terakhir_masuk_at)}</span> : <Chip w="wait">belum pernah login</Chip>}
                </td>
                {data.boleh_lihat_kontak && (
                  <td className={TD}>
                    {p.hp ? (
                      <a href={tautanWa(p.hp)} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-[#1F6FD1] underline" title="Buka WhatsApp (pesan dikirim manual)">
                        {p.hp}
                      </a>
                    ) : (
                      <span className="text-[#7B8794]">–</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {baris.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={7}>
                  {status === "belum" ? "Semua peserta sudah mengakses halaman Pelatihan. 🎉" : "Tidak ada peserta yang cocok dengan filter."}
                </td>
              </tr>
            )}
          </tbody>
        </TabelKartu>
      </Kartu>
    </div>
  );
}
