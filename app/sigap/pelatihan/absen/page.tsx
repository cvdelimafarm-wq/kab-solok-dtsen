"use client";

// app/sigap/pelatihan/absen/page.tsx
//
// (2 Nov 2026) Tab "Absen peserta" untuk PANITIA dan INSTRUKTUR (menggantikan tab Pelatihan). Rancangan: rancangan-absen-kedatangan-jendela-30-menit-2nov.
// Chip Datang (hanya hari pertama; kedatangan peserta mandiri lewat GPS, pengelola dapat mencentang manual dengan alasan) · Sesi 1..n.
// "Mulai presensi" membuka lembar pilih sesi (sesi dengan jam rencana terdekat disarankan; keputusan tetap di pengelola) dan metode (centang / kode / radar GPS).
// Presensi sesi habis OTOMATIS setelah jendela (bawaan 30 menit, dihitung di server); membuka kembali hanya atas inisiatif pengelola.
// Data: GET/POST /api/sigap/pelatihan/absen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, pesanGalat } from "../../admin/api";
import { BTN, BTN_O, BTN_R, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Kerangka } from "../komponen";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { NAMA_METODE, SEMUA_METODE, teksSisa, type MetodeAbsen } from "@/lib/sigapAbsen";

type Sesi = {
  no: number; label: string; jam: string; sudah_dimulai: boolean;
  sesi: { id: number; metode: MetodeAbsen[]; kode: string | null; status: string; keadaan: "dibuka" | "habis" | "ditutup"; dibuka_at: string; tutup_at: string; sisa_detik: number; radius_m: number } | null;
};
type Hadir = { sesi_id: number; akun_id: number; metode: MetodeAbsen; diterima: boolean; manual: boolean; jarak_m: number | null; alasan: string | null; at: string };
type Datang = { akun_id: number; at: string; manual: boolean; terlambat: boolean; jarak_m: number | null };
type Data = {
  tersedia: boolean; jenis: "panitia" | "instruktur"; tanggal: string; hari_ini: string; hari: string[]; kedatangan_berlaku: boolean;
  atur: { sesi: { no: number; label: string; jam: string }[]; jendela_menit: number; radius_m: number };
  kelas_pilihan: number[]; kelas: number | null; kelas_terkunci: boolean; sesi: Sesi[]; disarankan: number | null;
  peserta: { akun_id: number; nama: string; kelas: number | null }[]; datang: Datang[]; hadir: Hadir[]; boleh_atur: boolean; sekarang: number;
};

const jam = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":");
const tglPendek = (t: string) => t.split("-").reverse().slice(0, 2).join("/");
const KUNCI_METODE = "sigap_absen_metode";

function Chip({ teks, nada }: { teks: string; nada: "ok" | "wait" | "bad" | "mut" }) {
  const w = nada === "ok" ? "bg-[#E3F6EC] text-[#13794B]" : nada === "wait" ? "bg-[#FFF4D6] text-[#8A6200]" : nada === "bad" ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#EEF2F7] text-[#6B7A90]";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${w}`}>{teks}</span>;
}

function bacaMetodeTersimpan(): MetodeAbsen[] {
  try {
    const x = JSON.parse(localStorage.getItem(KUNCI_METODE) ?? "null");
    if (Array.isArray(x)) {
      const ok = x.filter((m): m is MetodeAbsen => SEMUA_METODE.includes(m));
      if (ok.length) return ok;
    }
  } catch {
    /* abaikan */
  }
  return ["centang", "kode"];
}

/** Lembar bawah "Mulai presensi": pilih sesi (disarankan = jam rencana terdekat) dan metode. */
function LembarMulai({ d, onTutup, onMulai, sibuk }: { d: Data; onTutup: () => void; onMulai: (no: number, metode: MetodeAbsen[]) => void; sibuk: boolean }) {
  const [no, setNo] = useState<number>(d.disarankan ?? d.sesi[0]?.no ?? 1);
  const [metode, setMetode] = useState<MetodeAbsen[]>(() => bacaMetodeTersimpan());
  useTutupDenganBack(true, onTutup);
  const ganti = (m: MetodeAbsen) => setMetode((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));
  const tambah = Math.max(0, ...d.sesi.map((s) => s.no)) + 1;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Mulai presensi" onClick={onTutup}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Mulai presensi</h2>
        <p className="mt-1 text-[12.5px] text-[#6B7A90]">Pilih sesi. Jam hanya acuan; kapan dimulai keputusan Anda. Presensi dibuka {d.atur.jendela_menit} menit lalu habis otomatis.</p>
        <div role="radiogroup" aria-label="Pilih sesi" className="mt-3 space-y-1.5">
          {d.sesi.map((s) => (
            <button key={s.no} type="button" role="radio" aria-checked={no === s.no} onClick={() => setNo(s.no)}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[14px] ${no === s.no ? "border-[#1F5FD1] bg-[#E3EEFF]" : "border-[#D5DEEC] bg-white"}`}>
              <b>{s.label}</b>
              {s.jam && <span className="text-[12.5px] text-[#6B7A90]">± {s.jam}</span>}
              <span className="ml-auto flex gap-1.5">
                {d.disarankan === s.no && <Chip teks="disarankan" nada="ok" />}
                {s.sudah_dimulai && <Chip teks="sudah dilaksanakan" nada="mut" />}
              </span>
            </button>
          ))}
          {d.sesi.length < 12 && (
            <button type="button" role="radio" aria-checked={no === tambah} onClick={() => setNo(tambah)} className={`w-full rounded-xl border border-dashed px-3 py-2.5 text-left text-[13.5px] font-semibold ${no === tambah ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#B8C6DD] text-[#44546F]"}`}>
              + Sesi {tambah} (tambahan)
            </button>
          )}
        </div>
        <fieldset className="mt-4">
          <legend className="text-[13px] font-bold text-[#0F2A52]">Metode absen (boleh lebih dari satu)</legend>
          <div className="mt-1.5 space-y-1">
            {SEMUA_METODE.map((m) => (
              <label key={m} className="flex items-center gap-2.5 text-[14px]">
                <input type="checkbox" checked={metode.includes(m)} onChange={() => ganti(m)} className="h-5 w-5 accent-[#1F5FD1]" />
                <span>{NAMA_METODE[m]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="button" className={BTN} disabled={sibuk || metode.length === 0} onClick={() => onMulai(no, metode)}>
            {sibuk ? "Membuka…" : `Mulai: buka ${d.atur.jendela_menit} menit`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HalamanAbsen() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState<string | null>(null);
  const [kelas, setKelas] = useState<number | null>(null);
  const [chip, setChip] = useState<"datang" | number | null>(null);
  const [lembar, setLembar] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [saring, setSaring] = useState(false);
  const [bukaAlasan, setBukaAlasan] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [selisih, setSelisih] = useState(0); // jam server - jam HP
  const [, ketuk] = useState(0);
  const [gps, setGps] = useState<"mati" | "aktif" | "galat">("mati");
  const refId = useRef<number | null>(null);

  const muat = useCallback(async () => {
    const q = new URLSearchParams();
    if (tanggal) q.set("tanggal", tanggal);
    if (kelas !== null) q.set("kelas", String(kelas));
    try {
      const r = await fetchJson<Data>(`/api/sigap/pelatihan/absen?${q}`);
      setD(r);
      setSelisih(r.sekarang - Date.now());
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, [tanggal, kelas]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const adaTerbuka = !!d?.sesi.some((s) => s.sesi?.keadaan === "dibuka" && s.sesi.sisa_detik > 0);
  useEffect(() => {
    const a = setInterval(() => document.visibilityState === "visible" && void muat(), adaTerbuka ? 5000 : 20000);
    return () => clearInterval(a);
  }, [muat, adaTerbuka]);
  useEffect(() => {
    const a = setInterval(() => ketuk((x) => x + 1), 1000);
    return () => clearInterval(a);
  }, []);

  // pilihan awal: Datang di hari pertama, selain itu sesi yang sedang dibuka, selain itu sesi pertama
  useEffect(() => {
    if (!d || chip !== null) return;
    const buka = d.sesi.find((s) => s.sesi?.keadaan === "dibuka");
    setChip(buka ? buka.no : d.kedatangan_berlaku ? "datang" : d.sesi[0]?.no ?? null);
    if (tanggal === null) setTanggal(d.tanggal);
    if (kelas === null && d.kelas !== null) setKelas(d.kelas);
  }, [d, chip, tanggal, kelas]);

  async function kirim(badan: Record<string, unknown>, sukses?: string): Promise<boolean> {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson("/api/sigap/pelatihan/absen", { method: "POST", body: JSON.stringify(badan) });
      if (sukses) setPesan(sukses);
      await muat();
      return true;
    } catch (e) {
      setGalat(pesanGalat(e));
      return false;
    } finally {
      setSibuk(false);
    }
  }

  const sekarang = Date.now() + selisih;
  const aktif = d?.sesi.find((s) => s.no === chip) ?? null;
  const sesi = aktif?.sesi ?? null;
  const sisa = sesi ? Math.max(0, Math.ceil((Date.parse(sesi.tutup_at) - sekarang) / 1000)) : 0;
  const terbuka = !!sesi && sesi.keadaan === "dibuka" && sisa > 0;
  const habis = !!sesi && !terbuka;

  // radar: kirim posisi pengelola tiap ±10 detik selama sesi terbuka dan metode radar aktif
  const radarAktif = terbuka && !!sesi?.metode.includes("radar");
  useEffect(() => {
    if (!radarAktif || gps !== "aktif" || !sesi || typeof navigator === "undefined" || !navigator.geolocation) return;
    let terakhir = 0;
    refId.current = navigator.geolocation.watchPosition(
      (p) => {
        const t = Date.now();
        if (t - terakhir < 9000) return;
        terakhir = t;
        void fetchJson("/api/sigap/pelatihan/absen", { method: "POST", body: JSON.stringify({ aksi: "posisi", sesi_id: sesi.id, lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }) }).catch(() => undefined);
      },
      () => setGps("galat"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => {
      if (refId.current !== null) navigator.geolocation.clearWatch(refId.current);
      refId.current = null;
    };
  }, [radarAktif, gps, sesi]);
  useEffect(() => {
    if (!radarAktif) setGps("mati");
  }, [radarAktif]);

  const hadirSesi = useMemo(() => new Map((d?.hadir ?? []).filter((h) => sesi && h.sesi_id === sesi.id).map((h) => [h.akun_id, h])), [d, sesi]);
  const datangPeta = useMemo(() => new Map((d?.datang ?? []).map((x) => [x.akun_id, x])), [d]);

  const butuhKelas = !!d && d.kelas === null && d.kelas_pilihan.length > 1;

  return (
    <Kerangka aktif="absen" judul="Absen peserta" sub={d ? (d.jenis === "instruktur" ? "Kelas Anda" : d.kelas !== null ? `Kelas ${d.kelas}` : "Semua kelas") : undefined}>
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {pesan && <Pesan jenis="ok" onTutup={() => setPesan(null)}>{pesan}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && !d.tersedia && <Pesan jenis="peringatan">Absen sesi belum aktif di basis data (SQL 20261102zk belum dijalankan). Kedatangan tetap dapat dilihat.</Pesan>}
      {d && (
        <>
          {(d.hari.length > 1 || d.kelas_pilihan.length > 1) && (
            <div className="flex flex-wrap items-center gap-2">
              {d.hari.length > 1 && (
                <div role="tablist" aria-label="Hari pelatihan" className="flex flex-wrap gap-1.5">
                  {d.hari.map((h) => (
                    <button key={h} type="button" role="tab" aria-selected={h === d.tanggal} onClick={() => { setTanggal(h); setChip(null); }}
                      className={`min-h-[34px] rounded-md border px-2.5 text-[12.5px] font-semibold ${h === d.tanggal ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>{tglPendek(h)}</button>
                  ))}
                </div>
              )}
              {d.kelas_pilihan.length > 1 && !d.kelas_terkunci && (
                <div role="tablist" aria-label="Kelas" className="flex flex-wrap gap-1.5">
                  {d.kelas_pilihan.map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={k === d.kelas} onClick={() => { setKelas(k); setChip(null); }}
                      className={`min-h-[34px] rounded-md border px-2.5 text-[12.5px] font-semibold ${k === d.kelas ? "border-[#7A4FC9] bg-[#7A4FC9] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>Kelas {k}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {butuhKelas ? (
            <Pesan jenis="info">Absen berjalan per kelas. Pilih kelas di atas.</Pesan>
          ) : (
            <>
              <div role="tablist" aria-label="Datang dan sesi" className="flex gap-1.5 overflow-x-auto pb-1">
                {d.kedatangan_berlaku && (
                  <button type="button" role="tab" aria-selected={chip === "datang"} onClick={() => setChip("datang")}
                    className={`min-h-[38px] shrink-0 rounded-full border px-3.5 text-[13px] font-bold ${chip === "datang" ? "border-[#13794B] bg-[#13794B] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>Datang</button>
                )}
                {d.sesi.map((s) => {
                  const terbukaS = s.sesi?.keadaan === "dibuka" && Date.parse(s.sesi.tutup_at) > sekarang;
                  return (
                    <button key={s.no} type="button" role="tab" aria-selected={chip === s.no} onClick={() => setChip(s.no)}
                      className={`min-h-[38px] shrink-0 rounded-full border px-3.5 text-[13px] font-bold ${chip === s.no ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>
                      {s.label}{terbukaS && <span aria-label="sedang dibuka" className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#2BB673] align-middle" />}
                    </button>
                  );
                })}
              </div>

              {/* ---------- DATANG ---------- */}
              {chip === "datang" && d.kedatangan_berlaku && (
                <Kartu judul="Kedatangan hari pertama" ket={`${d.datang.length} dari ${d.peserta.length} sudah datang`}>
                  <p className="mb-2 text-[12.5px] text-[#6B7A90]">Peserta mencatat kedatangan sendiri lewat GPS titik pelatihan, terbuka sepanjang hari ini. Bagi yang GPS-nya meleset, centang manual dengan alasan.</p>
                  <ul className="divide-y divide-[#EDF0F4]">
                    {d.peserta.map((p) => {
                      const x = datangPeta.get(p.akun_id);
                      return (
                        <li key={p.akun_id} className="py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <b className="text-[13.5px]">{p.nama}</b>
                            {x ? <Chip teks={`Datang ${jam(x.at)}${x.manual ? " · manual" : ""}`} nada={x.terlambat ? "wait" : "ok"} /> : <Chip teks="Belum" nada="mut" />}
                            {x?.terlambat && <Chip teks="terlambat" nada="wait" />}
                            <span className="ml-auto">
                              {!x && <button type="button" className={BTN_O} disabled={sibuk} onClick={() => { setBukaAlasan(p.akun_id); setAlasan(""); }}>Centang manual</button>}
                              {x?.manual && <button type="button" className={BTN_O} disabled={sibuk} onClick={() => void kirim({ aksi: "datang", akun_id: p.akun_id, hadir: false, tanggal: d.tanggal })}>Batalkan</button>}
                            </span>
                          </div>
                          {bukaAlasan === p.akun_id && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <input className={`${INPUT} min-w-0 flex-1`} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} placeholder="Alasan (mis. GPS meleset di dalam gedung)" aria-label={`Alasan centang manual ${p.nama}`} />
                              <button type="button" className={BTN} disabled={sibuk || alasan.trim().length < 3} onClick={async () => { if (await kirim({ aksi: "datang", akun_id: p.akun_id, hadir: true, alasan, tanggal: d.tanggal })) setBukaAlasan(null); }}>Simpan</button>
                              <button type="button" className={BTN_O} onClick={() => setBukaAlasan(null)}>Batal</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Kartu>
              )}

              {/* ---------- SESI ---------- */}
              {aktif && chip !== "datang" && (
                <>
                  <Kartu judul={aktif.label} ket={aktif.jam ? `Rencana ± ${aktif.jam}` : undefined}>
                    {!sesi && (
                      <div className="space-y-2">
                        <p className="text-[13px] text-[#44546F]">Presensi belum dimulai. Kartu ini berpindah ke sesi yang Anda mulai; jam hanya acuan.</p>
                        <button type="button" className={BTN} disabled={sibuk || d.tanggal !== d.hari_ini || !d.tersedia} onClick={() => setLembar(true)}>Mulai presensi</button>
                        {d.tanggal !== d.hari_ini && <p className="text-[12px] text-[#8A6200]">Presensi hanya dapat dimulai pada hari ini.</p>}
                      </div>
                    )}
                    {sesi && terbuka && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip teks="Dibuka" nada="ok" />
                          <span className="text-[13px] text-[#44546F]">Habis dalam</span>
                          <b className="text-[20px] tabular-nums text-[#0F2A52]" aria-live="off">{teksSisa(sisa)}</b>
                          <button type="button" className={`${BTN_R} ml-auto`} disabled={sibuk} onClick={() => void kirim({ aksi: "tutup", sesi_id: sesi.id }, "Presensi ditutup.")}>Tutup sekarang</button>
                        </div>
                        {sesi.metode.includes("kode") && sesi.kode && (
                          <div className="rounded-2xl bg-[#0F2A52] px-4 py-3 text-center text-white">
                            <span className="text-[12px] text-blue-100">Kode absen (tetap selama sesi)</span>
                            <b className="mt-1 block text-[38px] font-extrabold leading-none tracking-[0.18em] tabular-nums" aria-label={`Kode absen ${sesi.kode.split("").join(" ")}`}>{sesi.kode}</b>
                          </div>
                        )}
                        {sesi.metode.includes("radar") && (
                          <div className="rounded-xl border border-[#D5DEEC] bg-[#F7FAFF] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <b className="text-[13.5px] text-[#0F2A52]">Radar {sesi.radius_m} m</b>
                              {gps === "aktif" ? <Chip teks="posisi Anda dikirim" nada="ok" /> : <Chip teks="belum aktif" nada="wait" />}
                              {gps !== "aktif" && <button type="button" className={`${BTN} ml-auto`} onClick={() => setGps("aktif")}>Aktifkan radar</button>}
                            </div>
                            {gps === "galat" && <p className="mt-1.5 text-[12.5px] text-[#B42329]">Lokasi tidak terbaca. Izinkan lokasi pada peramban lalu aktifkan lagi.</p>}
                            <p className="mt-1.5 text-[12px] text-[#6B7A90]">Tetap di tempat selama radar dipakai. Peserta mengetuk “Konfirmasi lokasi” di HP mereka.</p>
                          </div>
                        )}
                      </div>
                    )}
                    {sesi && habis && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip teks={sesi.keadaan === "ditutup" ? "Ditutup" : "Waktu habis"} nada="mut" />
                          <span className="text-[13px] text-[#44546F]">Dibuka {jam(sesi.dibuka_at)}</span>
                        </div>
                        <p className="text-[12.5px] text-[#6B7A90]">Kode dan konfirmasi lokasi sudah ditolak. Anda dapat membuka kembali {d.atur.jendela_menit} menit atau mencentang manual di bawah.</p>
                        <button type="button" className={BTN} disabled={sibuk || d.tanggal !== d.hari_ini} onClick={() => setLembar(true)}>Buka kembali</button>
                      </div>
                    )}
                  </Kartu>

                  {sesi && sesi.metode.includes("radar") && <RingkasanRadar d={d} sesiId={sesi.id} hadir={hadirSesi} />}

                  <Kartu judul="Daftar hadir" ket={`${[...hadirSesi.values()].filter((h) => h.diterima).length} dari ${d.peserta.length} hadir`}
                    kanan={<label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={saring} onChange={(e) => setSaring(e.target.checked)} className="h-4 w-4 accent-[#1F5FD1]" />Belum hadir saja</label>}>
                    {!sesi ? (
                      <p className="text-[13px] text-[#6B7A90]">Daftar hadir muncul setelah presensi sesi dimulai.</p>
                    ) : (
                      <ul className="divide-y divide-[#EDF0F4]">
                        {d.peserta.filter((p) => !saring || !hadirSesi.get(p.akun_id)?.diterima).map((p) => {
                          const h = hadirSesi.get(p.akun_id);
                          const hadir = !!h?.diterima;
                          return (
                            <li key={p.akun_id} className="flex flex-wrap items-center gap-2 py-2.5">
                              <b className="text-[13.5px]">{p.nama}</b>
                              {hadir ? <Chip teks={`Hadir · ${h!.manual ? "dicentang" : NAMA_METODE[h!.metode].toLowerCase()}`} nada="ok" /> : h?.metode === "radar" ? <Chip teks={`Di luar radar${h.jarak_m !== null ? ` · ${h.jarak_m} m` : ""}`} nada="bad" /> : <Chip teks="Belum" nada="mut" />}
                              <button type="button" className={`${hadir ? BTN_O : BTN} ml-auto`} disabled={sibuk}
                                onClick={() => void kirim({ aksi: "centang", sesi_id: sesi.id, akun_id: p.akun_id, hadir: !hadir, alasan: terbuka ? null : "Dicentang setelah waktu absen habis" })}>
                                {hadir ? "Batalkan" : "Centang"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Kartu>
                </>
              )}
            </>
          )}
        </>
      )}
      {d && lembar && (
        <LembarMulai
          d={d}
          sibuk={sibuk}
          onTutup={() => setLembar(false)}
          onMulai={async (no, metode) => {
            try {
              localStorage.setItem(KUNCI_METODE, JSON.stringify(metode));
            } catch {
              /* abaikan */
            }
            const ok = await kirim({ aksi: "mulai", tanggal: d.hari_ini, no, kelas: d.kelas, metode }, `Presensi ${d.sesi.find((s) => s.no === no)?.label ?? `Sesi ${no}`} dibuka.`);
            if (ok) {
              setLembar(false);
              setChip(no);
            }
          }}
        />
      )}
    </Kerangka>
  );
}

/** Ikon radar: angka masuk dan belum melapor; hanya yang di luar radar tampil dengan nama dan jarak. */
function RingkasanRadar({ d, sesiId, hadir }: { d: Data; sesiId: number; hadir: Map<number, Hadir> }) {
  const luar = d.peserta.filter((p) => { const h = hadir.get(p.akun_id); return h && !h.diterima && h.metode === "radar"; });
  const masuk = d.peserta.filter((p) => hadir.get(p.akun_id)?.diterima).length;
  const belum = d.peserta.filter((p) => !hadir.has(p.akun_id)).length;
  return (
    <Kartu judul="Radar GPS" ket={`sesi #${sesiId}`}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[#E3F6EC] p-2"><b className="block text-[20px] text-[#13794B]">{masuk}</b><span className="text-[11.5px] text-[#13794B]">sudah masuk</span></div>
        <div className="rounded-xl bg-[#FDE8E8] p-2"><b className="block text-[20px] text-[#B42329]">{luar.length}</b><span className="text-[11.5px] text-[#B42329]">di luar radar</span></div>
        <div className="rounded-xl bg-[#EEF2F7] p-2"><b className="block text-[20px] text-[#44546F]">{belum}</b><span className="text-[11.5px] text-[#44546F]">belum melapor</span></div>
      </div>
      {luar.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px]">
          {luar.map((p) => <li key={p.akun_id} className="flex justify-between gap-2"><span>{p.nama}</span><b className="text-[#B42329]">{hadir.get(p.akun_id)?.jarak_m ?? "?"} m</b></li>)}
        </ul>
      )}
    </Kartu>
  );
}
