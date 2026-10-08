"use client";

// app/sigap/pelatihan/kelola/kehadiran.tsx
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan -- pengaturan titik presensi, monitoring presensi, monitoring Transport Lokal.
// Mockup disetujui user (presensi radius 300 m dari Mami Hotel; jam 06.00-18.00; sekali saja; presensi manual panitia).

import { useCallback, useEffect, useMemo, useState } from "react";
import { LABEL_SLOT_FOTO, MAKS_SESI, bagiFoto, sesiBawaan, teksJarak, type AturanSesi, type PengaturanPresensi } from "@/lib/sigapPresensi";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import ResetPin from "../../admin/ResetPin";
import { BarFilterMonitoring, OPSI_JENIS, OPSI_KELAS, OPSI_PERAN, ThKontrol, lolosDasar, sortKolom, urutkan, useFilterMon } from "./monitorKit";

const URL_KEHADIRAN = "/api/sigap/pelatihan/admin/kehadiran";
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const waktuHari = (tgl: string) => `${Number(tgl.slice(8, 10))} ${BLN[Number(tgl.slice(5, 7)) - 1]} ${tgl.slice(0, 4)}`;
const jamWib = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

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
type RespPengaturan = { sekarang: string; boleh_kelola: boolean; pengaturan: PengaturanPresensi | null; bawaan?: boolean };

type TitikForm = { nama: string; lat: string; lng: string; radius: string };
const TITIK_KOSONG: TitikForm = { nama: "", lat: "", lng: "", radius: "300" };

export function PengaturanPresensiKartu() {
  const [d, setD] = useState<RespPengaturan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  // (7 Okt 2026) daftar titik presensi (1-5): diterima bila dalam radius SALAH SATU titik
  const [titik, setTitik] = useState<TitikForm[]>([{ ...TITIK_KOSONG }]);
  const [akurasi, setAkurasi] = useState("100");
  // (8 Okt 2026) jumlah presensi per hari (1-3 sesi) + jam tiap sesi; berlaku di setiap hari kegiatan
  const [sesi, setSesi] = useState<AturanSesi[]>(sesiBawaan(1));
  const [hari, setHari] = useState<string[]>([]);
  const [bawaan, setBawaan] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const isi = (p: PengaturanPresensi) => {
    setTitik(p.titik.length ? p.titik.map((t) => ({ nama: t.nama, lat: String(t.lat), lng: String(t.lng), radius: String(t.radius_m) })) : [{ ...TITIK_KOSONG }]);
    setAkurasi(String(p.akurasi_maks_m));
    setSesi(p.sesi?.length ? p.sesi.map((x) => ({ ...x })) : sesiBawaan(1));
    setHari(p.hari ?? []);
  };
  useEffect(() => {
    fetchJson<RespPengaturan>(`${URL_KEHADIRAN}?bagian=pengaturan`)
      .then((r) => {
        setD(r);
        setBawaan(!!r.bawaan);
        if (r.pengaturan) isi(r.pengaturan);
      })
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, []);

  const ubah = (i: number, k: keyof TitikForm, v: string) => setTitik((a) => a.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const ubahSesi = (i: number, k: keyof AturanSesi, v: string) => setSesi((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  // ganti jumlah sesi: isian awal menyesuaikan (Pagi/Sore, dst.); jam masih bisa diubah
  const aturJumlahSesi = (n: number) => setSesi((a) => (a.length === n ? a : sesiBawaan(n)));

  function pakaiLokasiSaya(i: number) {
    setPesan(null);
    if (!("geolocation" in navigator)) return setPesan({ jenis: "galat", teks: "Browser ini tidak mendukung lokasi." });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setTitik((a) => a.map((t, j) => (j === i ? { ...t, lat: String(p.coords.latitude), lng: String(p.coords.longitude) } : t)));
        setPesan({ jenis: "ok", teks: `Titik ${i + 1} diisi dari lokasi Anda (akurasi ±${Math.round(p.coords.accuracy)} m). Tekan Simpan untuk memakainya.` });
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
        body: JSON.stringify({
          aksi: "atur_presensi",
          titik: titik.map((t) => ({ nama: t.nama, lat: t.lat.trim() === "" ? null : Number(t.lat.replace(",", ".")), lng: t.lng.trim() === "" ? null : Number(t.lng.replace(",", ".")), radius_m: Number(t.radius) })),
          akurasi_maks_m: Number(akurasi),
          sesi,
        }),
      });
      setBawaan(false);
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
  return (
    <Kartu judul="Presensi di lokasi pelatihan" ket={`${titik.length} titik lokasi · peserta cukup berada di salah satunya`}>
      <div className="space-y-2.5">
        {titik.map((t, i) => {
          const peta = t.lat && t.lng ? `https://www.google.com/maps?q=${encodeURIComponent(`${t.lat},${t.lng}`)}` : null;
          return (
            <div key={i} className="rounded-xl border border-[#E3E8EE] bg-[#F9FAFC] p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-extrabold text-[#0F3D7A]">Titik {i + 1}</span>
                <span className="flex flex-wrap items-center gap-2 text-[12px]">
                  {peta && (
                    <a href={peta} target="_blank" rel="noreferrer" className="font-semibold text-[#1F6FD1] underline">
                      Lihat di Google Maps
                    </a>
                  )}
                  {bisa && (
                    <button type="button" className="font-semibold text-[#1F6FD1] underline" onClick={() => pakaiLokasiSaya(i)}>
                      📍 Pakai lokasi saya
                    </button>
                  )}
                  {bisa && titik.length > 1 && (
                    <button type="button" className="font-semibold text-[#C0392B] underline" onClick={() => setTitik((a) => a.filter((_, j) => j !== i))}>
                      Hapus titik
                    </button>
                  )}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-4">
                  Nama lokasi
                  <input className={`${INPUT} mt-0.5 w-full`} value={t.nama} onChange={(e) => ubah(i, "nama", e.target.value)} disabled={!bisa} placeholder="mis. Ully Hotel Solok" />
                </label>
                <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-2">
                  Lintang (latitude)
                  <input className={`${INPUT} mt-0.5 w-full`} value={t.lat} onChange={(e) => ubah(i, "lat", e.target.value)} disabled={!bisa} inputMode="decimal" />
                </label>
                <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-1">
                  Bujur (longitude)
                  <input className={`${INPUT} mt-0.5 w-full`} value={t.lng} onChange={(e) => ubah(i, "lng", e.target.value)} disabled={!bisa} inputMode="decimal" />
                </label>
                <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-1">
                  Radius (meter)
                  <input className={`${INPUT} mt-0.5 w-full`} value={t.radius} onChange={(e) => ubah(i, "radius", e.target.value)} disabled={!bisa} inputMode="numeric" />
                </label>
              </div>
            </div>
          );
        })}
        {bisa && titik.length < 5 && (
          <button type="button" className={BTN_O} onClick={() => setTitik((a) => [...a, { ...TITIK_KOSONG }])}>
            ＋ Tambah titik lokasi
          </button>
        )}
      </div>
      <div className="mt-3 rounded-xl border border-[#E3E8EE] bg-[#F9FAFC] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] font-extrabold text-[#0F3D7A]">Presensi per hari</span>
          <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#55657D]">
            Jumlah presensi per hari
            <select className={INPUT} value={sesi.length} disabled={!bisa} onChange={(e) => aturJumlahSesi(Number(e.target.value))} aria-label="Jumlah presensi per hari">
              {Array.from({ length: MAKS_SESI }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}× per hari</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 space-y-2">
          {sesi.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-6">
              {sesi.length > 1 ? (
                <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-2">
                  Nama sesi {i + 1}
                  <input className={`${INPUT} mt-0.5 w-full`} value={x.nama} onChange={(e) => ubahSesi(i, "nama", e.target.value)} disabled={!bisa} placeholder="mis. Pagi" maxLength={30} />
                </label>
              ) : (
                <div className="text-[11.5px] font-bold text-[#55657D] sm:col-span-2">
                  Sesi
                  <p className="mt-0.5 py-1.5 text-[13px] font-semibold text-[#14202E]">Presensi (sekali per hari)</p>
                </div>
              )}
              <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-2">
                Dibuka (WIB)
                <input type="time" className={`${INPUT} mt-0.5 w-full`} value={x.buka} onChange={(e) => ubahSesi(i, "buka", e.target.value)} disabled={!bisa} />
              </label>
              <label className="text-[11.5px] font-bold text-[#55657D] sm:col-span-2">
                Ditutup (WIB)
                <input type="time" className={`${INPUT} mt-0.5 w-full`} value={x.tutup} onChange={(e) => ubahSesi(i, "tutup", e.target.value)} disabled={!bisa} />
              </label>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[#7B8794]">
          Berlaku di setiap hari kegiatan{hari.length ? ` (${hari.length === 1 ? waktuHari(hari[0]) : `${waktuHari(hari[0])} s.d. ${waktuHari(hari[hari.length - 1])}, ${hari.length} hari`})` : ""}. Peringatan lokasi di HP peserta hanya muncul untuk sesi yang sedang dibuka, dan hilang setelah semua sesi hari itu tercatat.
        </p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-[11.5px] font-bold text-[#55657D]">
          Akurasi GPS maks. (meter)
          <input className={`${INPUT} mt-0.5 w-full`} value={akurasi} onChange={(e) => setAkurasi(e.target.value)} disabled={!bisa} inputMode="numeric" />
        </label>
      </div>
      <p className="mt-2 text-[12px] text-[#7B8794]">
        Peserta bisa presensi bila berada dalam radius salah satu titik di atas dan sinyal GPS-nya cukup akurat. Satu presensi per peserta per sesi. Bila jumlah atau jam sesi diubah setelah ada peserta presensi, presensi yang sudah tercatat tetap menjadi sesi 1.
      </p>
      {bawaan && <div className="mt-2"><Pesan jenis="ok">Pengaturan ini masih isian bawaan (1× per hari, 06.00–18.00 WIB{titik.some((t) => t.nama) ? ", lokasi disalin dari pelatihan sebelumnya" : ""}). Periksa lalu tekan Simpan agar dipakai peserta.</Pesan></div>}
      {pesan && <div className="mt-2"><Pesan jenis={pesan.jenis}>{pesan.teks}</Pesan></div>}
      {bisa && (
        <div className="mt-3 flex flex-wrap gap-2">
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
  jenis_akun: string;
  peran: string;
  kelas: number | null;
  /** hadir = semua sesi hari ini tercatat; sebagian = sebagian sesi; ditolak = hanya percobaan ditolak; belum */
  status: "hadir" | "sebagian" | "ditolak" | "belum";
  sesi: { no: number; nama: string; buka_at: string; tutup_at: string; hadir: boolean; at: string | null; jarak_m: number | null; titik_nama: string | null; manual: boolean; alasan: string | null; dicatat_oleh: string | null }[];
  hadir_n: number;
  at: string | null;
  jarak_m: number | null;
  titik_nama: string | null;
  manual: boolean;
  alasan: string | null;
  dicatat_oleh: string | null;
  percobaan: number;
  percobaan_terakhir_at: string | null;
  percobaan_jarak_m: number | null;
  percobaan_alasan: string | null;
};
type RespPresensi = { sekarang: string; boleh_kelola: boolean; pengaturan: PengaturanPresensi | null; tanggal: string | null; sesi_hari: { no: number; nama: string; buka_at: string; tutup_at: string }[]; stat: { peserta: number; hadir: number; sebagian: number; ditolak: number; belum: number }; peserta: PresensiPes[] };

export function MonitoringPresensi() {
  const { data, galat, muat } = usePolling<RespPresensi>(`${URL_KEHADIRAN}?bagian=presensi`);
  const f = useFilterMon();
  const [buka, setBuka] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sesiManual, setSesiManual] = useState<number | null>(null); // (8 Okt 2026) sesi yang dicatat manual (null = sesi pertama yang belum tercatat)
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  // dasar = lolos Jenis/Kelas/Peran/Nama (dipakai kartu, yang memerinci menurut status); baris = dasar + status + urutan
  const dasar = useMemo(() => (data?.peserta ?? []).filter((p) => lolosDasar(f, p)), [data, f.jenis, f.kelas, f.peran, f.cari]); // eslint-disable-line react-hooks/exhaustive-deps
  const baris = useMemo(
    () =>
      urutkan(
        dasar.filter((p) => !f.status.size || f.status.has(p.status)),
        f.urut,
        { nama: (p) => p.nama, kelas: (p) => p.kelas, peran: (p) => p.peran, jenis: (p) => p.jenis_akun, presensi: (p) => (p.status === "hadir" ? 0 : p.status === "sebagian" ? 1 : p.status === "ditolak" ? 2 : 3), jarak: (p) => (p.status === "hadir" ? p.jarak_m : p.percobaan_jarak_m) }
      ),
    [dasar, f.status, f.urut]
  );

  async function catatManual(akunId: number) {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson(URL_KEHADIRAN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "presensi_manual", akun_id: akunId, alasan, sesi: sesiManual != null && data?.tanggal ? `${data.tanggal}#${sesiManual}` : undefined }) });
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
    // (8 Okt 2026) satu kolom waktu per sesi presensi hari ini
    const namaSesi = data.sesi_hari.map((x) => (data.sesi_hari.length > 1 ? x.nama : "Waktu presensi"));
    const aoa: (string | number)[][] = [["No", "Nama", "Kelas", "Peran", "Status", ...namaSesi.map((n) => `${n} (WIB)`), "Lokasi", "Jarak (m)", "Cara", "Alasan/keterangan", "Percobaan ditolak"]];
    baris.forEach((p, i) =>
      aoa.push([
        i + 1,
        p.nama,
        p.kelas ?? "",
        p.peran.toUpperCase(),
        p.status === "hadir" ? "Hadir" : p.status === "sebagian" ? `Sebagian (${p.hadir_n} dari ${data.sesi_hari.length})` : p.status === "ditolak" ? "Ditolak (belum hadir)" : "Belum",
        ...data.sesi_hari.map((x) => {
          const t = p.sesi.find((y) => y.no === x.no);
          return t?.at ? waktuWib(t.at) : "";
        }),
        p.titik_nama ?? "",
        p.jarak_m != null ? Math.round(p.jarak_m) : "",
        p.hadir_n > 0 ? (p.manual ? `Manual (${p.dicatat_oleh ?? ""})` : "Aplikasi") : "",
        p.alasan ?? "",
        p.percobaan,
      ])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 7 }, { wch: 7 }, { wch: 22 }, ...data.sesi_hari.map(() => ({ wch: 20 })), { wch: 20 }, { wch: 10 }, { wch: 28 }, { wch: 36 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presensi");
    XLSX.writeFile(wb, `Presensi_Pelatihan_PSP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  // kartu mengikuti filter Jenis/Kelas/Peran/Nama (tanpa status, karena kartu memerinci status)
  const st = { peserta: dasar.length, hadir: dasar.filter((p) => p.status === "hadir").length, sebagian: dasar.filter((p) => p.status === "sebagian").length, ditolak: dasar.filter((p) => p.status === "ditolak").length, belum: dasar.filter((p) => p.status === "belum").length };
  const banyakSesi = data.sesi_hari.length > 1;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <BarFilterMonitoring
        f={f}
        total={baris.length}
        semua={data.peserta.length}
        statusOpsi={[
          { nilai: "hadir", label: banyakSesi ? "Lengkap" : "Sudah presensi" },
          ...(banyakSesi ? [{ nilai: "sebagian", label: "Sebagian" }] : []),
          { nilai: "ditolak", label: "Ditolak" },
          { nilai: "belum", label: "Belum mencoba" },
        ]}
        catatan="Kartu mengikuti filter jenis, kelas, peran & nama."
      />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={st.peserta} ket={f.adaFilter ? `dari ${data.peserta.length}` : undefined} />
        <KartuAngka label={banyakSesi ? "Presensi lengkap" : "Sudah presensi"} nilai={st.hadir} ket={`${st.peserta ? Math.round((st.hadir / st.peserta) * 100) : 0}%`} warna="#1E7A4C" />
        <KartuAngka label={banyakSesi ? "Belum lengkap" : "Belum presensi"} nilai={st.belum + st.ditolak + st.sebagian} ket={banyakSesi && st.sebagian ? `${st.sebagian} sebagian` : undefined} warna="#9A6200" />
        <KartuAngka label="Ditolak (di luar radius/GPS)" nilai={st.ditolak} warna="#C0392B" />
      </div>
      <Kartu
        judul="Presensi per peserta"
        ket={`${baris.length} dari ${data.peserta.length} · segar otomatis tiap 10 detik${data.pengaturan ? ` · ${data.pengaturan.titik.map((t) => `${t.nama} ${t.radius_m} m`).join(" / ")}` : ""}`}
        kanan={
          <button type="button" className={BTN_O} onClick={ekspor}>
            ⬇ Ekspor Excel
          </button>
        }
      >
        {pesan && <div className="mb-2"><Pesan jenis="galat">{pesan}</Pesan></div>}
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <ThKontrol label="Nama" search={{ value: f.cari, onChange: f.setCari, placeholder: "Cari nama..." }} sort={sortKolom(f, "nama")} />
              <ThKontrol label="Kls" filter={{ options: OPSI_KELAS, selected: f.kelas, onApply: f.setKelas }} sort={sortKolom(f, "kelas")} />
              <ThKontrol label="Peran" filter={{ options: OPSI_PERAN, selected: f.peran, onApply: f.setPeran }} sort={sortKolom(f, "peran")} />
              <ThKontrol label="Jenis" filter={{ options: OPSI_JENIS, selected: f.jenis, onApply: f.setJenis }} sort={sortKolom(f, "jenis")} />
              <ThKontrol
                label="Presensi"
                filter={{ options: [{ nilai: "hadir", label: banyakSesi ? "Lengkap" : "Sudah presensi" }, ...(banyakSesi ? [{ nilai: "sebagian", label: "Sebagian" }] : []), { nilai: "ditolak", label: "Ditolak" }, { nilai: "belum", label: "Belum mencoba" }], selected: f.status, onApply: f.setStatus }}
                sort={sortKolom(f, "presensi")}
              />
              <ThKontrol label="Jarak" sort={sortKolom(f, "jarak")} />
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
                  <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
                  <td className={TD}>
                    {banyakSesi && p.hadir_n > 0 ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {p.sesi.map((x) => (
                          <Chip key={x.no} w={x.hadir ? "ok" : "wait"}>
                            {x.nama} {x.hadir && x.at ? jamWib(x.at) : "–"}
                            {x.hadir && x.manual ? " (manual)" : ""}
                          </Chip>
                        ))}
                      </span>
                    ) : p.status === "hadir" ? (
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
                  <td className={`${TD} tabular-nums`}>{p.hadir_n > 0 ? (p.jarak_m != null ? `${teksJarak(p.jarak_m)}${p.titik_nama ? ` · ${p.titik_nama}` : ""}` : "–") : p.percobaan_jarak_m != null ? teksJarak(p.percobaan_jarak_m) : "–"}</td>
                  {data.boleh_kelola && (
                    <td className={TD}>
                      {p.status !== "hadir" && (
                        <button type="button" className={BTN_G} onClick={() => { setBuka(buka === p.akun_id ? null : p.akun_id); setAlasan(""); setPesan(null); setSesiManual(null); }}>
                          Catat manual
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {buka === p.akun_id && (
                  <tr>
                    <td className={TD} colSpan={7}>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.sesi.filter((x) => !x.hadir).length > 1 && (
                          <select className={INPUT} value={sesiManual ?? ""} onChange={(e) => setSesiManual(e.target.value === "" ? null : Number(e.target.value))} aria-label="Sesi presensi yang dicatat">
                            <option value="">Sesi yang sedang dibuka / berikutnya</option>
                            {p.sesi.filter((x) => !x.hadir).map((x) => (
                              <option key={x.no} value={x.no}>{x.nama} ({jamWib(x.buka_at)}–{jamWib(x.tutup_at)})</option>
                            ))}
                          </select>
                        )}
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
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={7}>
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
type TranslokPes = { akun_id: number; penugasan_id: number; nama: string; jenis_akun: string; peran: string; kelas: number | null; slot: number[]; terakhir_at: string | null };
type RespTranslok = { sekarang: string; tanggal: string; foto_total: number; stat: { peserta: number; lengkap: number; sebagian: number; belum: number }; peserta: TranslokPes[] };
type FotoAda = { slot: number; url: string | null; diunggah_at: string; susulan: boolean };

const OPSI_STATUS_TRANSLOK = [
  { nilai: "lengkap", label: "Lengkap" },
  { nilai: "sebagian", label: "Sebagian" },
  { nilai: "belum", label: "Belum unggah" },
  { nilai: "awal_kurang", label: "Foto sebelum posttest belum lengkap" },
  { nilai: "akhir_kurang", label: "Foto sesudah posttest belum lengkap" },
];

export function MonitoringTranslok() {
  const { data, galat } = usePolling<RespTranslok>(`${URL_KEHADIRAN}?bagian=translok`, 15_000);
  const f = useFilterMon();
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [foto, setFoto] = useState<FotoAda[] | null>(null);
  const [galatFoto, setGalatFoto] = useState<string | null>(null);

  const kategori = (p: TranslokPes, total: number) => (p.slot.length >= total ? "lengkap" : p.slot.length === 0 ? "belum" : "sebagian");
  // (8 Okt 2026) foto dibagi: 3 sebelum posttest, sisanya sesudah posttest
  const bagi = (p: TranslokPes, total: number) => {
    const { awal, akhir } = bagiFoto(total);
    return { awal: awal.filter((x) => p.slot.includes(x)).length, nAwal: awal.length, akhir: akhir.filter((x) => p.slot.includes(x)).length, nAkhir: akhir.length };
  };
  const cocokStatus = (p: TranslokPes, total: number) => {
    if (!f.status.size) return true;
    const b = bagi(p, total);
    return [...f.status].some((v) => (v === "awal_kurang" ? b.awal < b.nAwal : v === "akhir_kurang" ? b.akhir < b.nAkhir : kategori(p, total) === v));
  };
  // dasar = Jenis/Kelas/Peran/Nama (kartu memerinci status); baris = dasar + status + urutan
  const dasar = useMemo(() => (data?.peserta ?? []).filter((p) => lolosDasar(f, p)), [data, f.jenis, f.kelas, f.peran, f.cari]); // eslint-disable-line react-hooks/exhaustive-deps
  const baris = useMemo(() => {
    if (!data) return [];
    const total = data.foto_total;
    return urutkan(
      dasar.filter((p) => cocokStatus(p, total)),
      f.urut,
      { nama: (p) => p.nama, kelas: (p) => p.kelas, peran: (p) => p.peran, jenis: (p) => p.jenis_akun, foto: (p) => p.slot.length, awal: (p) => bagi(p, total).awal, akhir: (p) => bagi(p, total).akhir, status: (p) => p.slot.length, terakhir: (p) => p.terakhir_at }
    );
  }, [data, dasar, f.status, f.urut]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const kepala = ["No", "Nama", "Jenis", "Kelas", "Peran", "Jumlah foto", "Foto sebelum posttest", "Foto sesudah posttest", ...Array.from({ length: data.foto_total }, (_, i) => LABEL_SLOT_FOTO[i] ?? `Foto ${i + 1}`), "Status", "Terakhir unggah (WIB)"];
    const aoa: (string | number)[][] = [kepala];
    baris.forEach((p, i) =>
      aoa.push([i + 1, p.nama, p.jenis_akun === "organik" ? "Organik" : "Mitra", p.kelas ?? "", p.peran.toUpperCase(), p.slot.length, `${bagi(p, data.foto_total).awal}/${bagi(p, data.foto_total).nAwal}`, `${bagi(p, data.foto_total).akhir}/${bagi(p, data.foto_total).nAkhir}`, ...Array.from({ length: data.foto_total }, (_, k) => (p.slot.includes(k + 1) ? "ada" : "")), kategori(p, data.foto_total), p.terakhir_at ? waktuWib(p.terakhir_at) : ""])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, ...Array.from({ length: data.foto_total }, () => ({ wch: 13 })), { wch: 11 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transport Lokal");
    XLSX.writeFile(wb, `Translok_Pelatihan_PSP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  const stK = { peserta: dasar.length, lengkap: dasar.filter((p) => kategori(p, data.foto_total) === "lengkap").length, belum: dasar.filter((p) => kategori(p, data.foto_total) === "belum").length, sebagian: 0 };
  stK.sebagian = stK.peserta - stK.lengkap - stK.belum;
  const st = stK;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <BarFilterMonitoring
        f={f}
        total={baris.length}
        semua={data.peserta.length}
        statusOpsi={OPSI_STATUS_TRANSLOK}
        catatan="Kartu mengikuti filter jenis, kelas, peran & nama."
      />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={st.peserta} ket={f.adaFilter ? `dari ${data.peserta.length}` : undefined} />
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
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <ThKontrol label="Nama" search={{ value: f.cari, onChange: f.setCari, placeholder: "Cari nama..." }} sort={sortKolom(f, "nama")} />
              <ThKontrol label="Kls" filter={{ options: OPSI_KELAS, selected: f.kelas, onApply: f.setKelas }} sort={sortKolom(f, "kelas")} />
              <ThKontrol label="Peran" filter={{ options: OPSI_PERAN, selected: f.peran, onApply: f.setPeran }} sort={sortKolom(f, "peran")} />
              <ThKontrol label="Jenis" filter={{ options: OPSI_JENIS, selected: f.jenis, onApply: f.setJenis }} sort={sortKolom(f, "jenis")} />
              <ThKontrol label="Foto (sebelum | sesudah posttest)" sort={sortKolom(f, "foto")} />
              <ThKontrol label="Status" filter={{ options: OPSI_STATUS_TRANSLOK, selected: f.status, onApply: f.setStatus }} sort={sortKolom(f, "status")} />
              <ThKontrol label="Terakhir" sort={sortKolom(f, "terakhir")} />
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
                    <td className={TD}>{p.peran.toUpperCase()}</td>
                    <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-0.5" title={`${p.slot.length} dari ${data.foto_total}: sebelum posttest ${bagi(p, data.foto_total).awal}/${bagi(p, data.foto_total).nAwal}, sesudah posttest ${bagi(p, data.foto_total).akhir}/${bagi(p, data.foto_total).nAkhir}`}>
                        {Array.from({ length: data.foto_total }, (_, i) => (
                          <i key={i} className={`inline-block h-3 w-3 rounded-[3px] ${i + 1 === bagiFoto(data.foto_total).awal.length + 1 ? "ml-1.5" : ""} ${p.slot.includes(i + 1) ? "bg-[#1E7A4C]" : "bg-[#E3E8EE]"}`} />
                        ))}
                        <span className="ml-1.5 text-[11.5px] tabular-nums text-[#55657D]">{bagi(p, data.foto_total).awal}/{bagi(p, data.foto_total).nAwal} | {bagi(p, data.foto_total).akhir}/{bagi(p, data.foto_total).nAkhir}</span>
                      </span>
                    </td>
                    <td className={TD}>
                      {k === "lengkap" ? <Chip w="ok">lengkap</Chip> : k === "belum" ? <Chip w="bad">belum unggah</Chip> : <Chip w="wait">kurang: {kurang.map((s) => (LABEL_SLOT_FOTO[s - 1] ?? `Foto ${s}`).toLowerCase()).join(", ")}</Chip>}
                    </td>
                    <td className={`${TD} tabular-nums`}>{p.terakhir_at ? `${jamWib(p.terakhir_at)}` : "–"}</td>
                  </tr>
                  {terbuka === p.penugasan_id && (
                    <tr>
                      <td className={TD} colSpan={7}>
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
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={7}>
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
  jenis_akun: string;
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

const OPSI_STATUS_AKSES = [
  { nilai: "belum", label: "Belum akses" },
  { nilai: "belum_masuk", label: "Belum pernah login" },
  { nilai: "sudah", label: "Sudah akses" },
];

export function MonitoringAkses() {
  const { data, galat } = usePolling<RespAkses>(`${URL_KEHADIRAN}?bagian=akses`);
  const f = useFilterMon(["belum"]); // bawaan: yang belum akses
  const [salin, setSalin] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState<{ id: number; nama: string; hp: string | null } | null>(null); // (7 Okt 2026) dialog Reset PIN

  // dasar = Jenis/Kelas/Peran/Nama/Kecamatan (kartu memerinci status); baris = dasar + status + urutan
  const dasar = useMemo(
    () => (data?.peserta ?? []).filter((p) => lolosDasar(f, p) && (!(f.kolom.kecamatan?.size) || f.kolom.kecamatan.has(p.kecamatan ?? "–"))),
    [data, f.jenis, f.kelas, f.peran, f.cari, f.kolom] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const baris = useMemo(
    () =>
      urutkan(
        dasar.filter((p) => !f.status.size || [...f.status].some((v) => (v === "belum" ? !p.akses_pertama_at : v === "belum_masuk" ? !p.akses_pertama_at && !p.terakhir_masuk_at : !!p.akses_pertama_at))),
        f.urut,
        { nama: (p) => p.nama, kelas: (p) => p.kelas, peran: (p) => p.peran, jenis: (p) => p.jenis_akun, kecamatan: (p) => p.kecamatan, akses: (p) => p.akses_pertama_at, login: (p) => p.terakhir_masuk_at }
      ),
    [dasar, f.status, f.urut]
  );
  const opsiKecamatan = useMemo(() => [...new Set((data?.peserta ?? []).map((p) => p.kecamatan ?? "–"))].sort((a, b) => a.localeCompare(b, "id")), [data]);

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
  const st = { peserta: dasar.length, sudah: dasar.filter((p) => p.akses_pertama_at).length, belum: dasar.filter((p) => !p.akses_pertama_at).length, belum_pernah_masuk: dasar.filter((p) => !p.akses_pertama_at && !p.terakhir_masuk_at).length };
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <BarFilterMonitoring
        f={f}
        total={baris.length}
        semua={data.peserta.length}
        statusOpsi={OPSI_STATUS_AKSES}
        statusSemua="Semua akses"
        statusLabel="Filter akses"
        catatan="Kartu mengikuti filter jenis, kelas, peran, kecamatan & nama."
      />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Peserta" nilai={st.peserta} ket={f.adaFilter ? `dari ${data.peserta.length}` : undefined} />
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
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <ThKontrol label="Nama" search={{ value: f.cari, onChange: f.setCari, placeholder: "Cari nama..." }} sort={sortKolom(f, "nama")} />
              <ThKontrol label="Kls" filter={{ options: OPSI_KELAS, selected: f.kelas, onApply: f.setKelas }} sort={sortKolom(f, "kelas")} />
              <ThKontrol label="Peran" filter={{ options: OPSI_PERAN, selected: f.peran, onApply: f.setPeran }} sort={sortKolom(f, "peran")} />
              <ThKontrol label="Jenis" filter={{ options: OPSI_JENIS, selected: f.jenis, onApply: f.setJenis }} sort={sortKolom(f, "jenis")} />
              <ThKontrol label="Kecamatan" filter={{ options: opsiKecamatan, selected: f.kolom.kecamatan ?? new Set<string>(), onApply: (v) => f.setKolom("kecamatan", v) }} sort={sortKolom(f, "kecamatan")} />
              <ThKontrol label="Akses pelatihan" filter={{ options: OPSI_STATUS_AKSES, selected: f.status, onApply: f.setStatus }} sort={sortKolom(f, "akses")} />
              <ThKontrol label="Login terakhir" sort={sortKolom(f, "login")} />
              {data.boleh_lihat_kontak && <th className={TH}>Kontak</th>}
              {data.boleh_lihat_kontak && <th className={TH}>PIN</th>}
            </tr>
          </thead>
          <tbody>
            {baris.map((p) => (
              <tr key={p.akun_id}>
                <td className={`${TD} font-semibold`}>{p.nama}</td>
                <td className={TD}>{p.kelas ?? "–"}</td>
                <td className={TD}>{p.peran.toUpperCase()}</td>
                <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
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
                {data.boleh_lihat_kontak && (
                  <td className={TD}>
                    <button type="button" className={BTN_G} onClick={() => setResetPin({ id: p.akun_id, nama: p.nama, hp: p.hp })}>
                      🔑 Reset PIN
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {baris.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#7B8794]`} colSpan={9}>
                  {f.status.size === 1 && f.status.has("belum") && dasar.length > 0 ? "Semua peserta sudah mengakses halaman Pelatihan. 🎉" : "Tidak ada peserta yang cocok dengan filter."}
                </td>
              </tr>
            )}
          </tbody>
        </TabelKartu>
      </Kartu>
      {resetPin && <ResetPin url={URL_KEHADIRAN} akunId={resetPin.id} nama={resetPin.nama} hp={resetPin.hp} tutup={() => setResetPin(null)} />}
    </div>
  );
}
