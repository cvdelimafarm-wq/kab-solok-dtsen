"use client";

// app/sigap/pelatihan/AbsenPeserta.tsx
//
// (2 Nov 2026) Sisi PESERTA dari Absen peserta, dipasang di tab Hari ini:
//  - Kartu KEDATANGAN (hanya hari pertama pelatihan): satu ketukan, GPS dinilai server terhadap titik pelatihan (mesin presensi yang sudah ada).
//  - Kartu dan modal ABSEN SESI saat pengelola memulai presensi: ketik kode, atau "Konfirmasi lokasi" (radar), atau menunggu dicentang. Hitung mundur mengikuti
//    jendela 30 menit; sesudahnya modal padam dan kode / lokasi ditolak server.
// Data: GET /api/sigap/pelatihan/absen?sebagai=peserta (disegarkan berkala); POST kode / lokasi; kedatangan memakai POST /api/sigap/pelatihan/presensi.
// Bukan peserta atau SQL belum dijalankan -> tidak menggambar apa pun.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, pesanGalat } from "../admin/api";
import { BTN, BTN_O, Pesan } from "../admin/ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { KODE_PANJANG, teksSisa, type MetodeAbsen } from "@/lib/sigapAbsen";

type SesiTerbuka = { id: number; no: number; label: string; metode: MetodeAbsen[]; tutup_at: string; sisa_detik: number; radius_m: number; sudah_hadir: boolean; di_luar_radar: boolean };
type Data = {
  kedatangan: { berlaku: boolean; sudah: boolean; at: string | null; manual: boolean; terlambat: boolean };
  sesi_terbuka: SesiTerbuka[];
  sekarang: number;
};

const jam = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":");

function ambilPosisi(): Promise<{ lat: number; lng: number; akurasi: number }> {
  return new Promise((ok, gagal) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return gagal(new Error("Peramban ini tidak mendukung lokasi."));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }),
      () => gagal(new Error("Lokasi tidak terbaca. Aktifkan lokasi (GPS) dan izinkan peramban, lalu coba lagi.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

function ModalAbsen({ s, selisih, onTutup, onSelesai }: { s: SesiTerbuka; selisih: number; onTutup: () => void; onSelesai: () => void }) {
  const [kode, setKode] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [, ketuk] = useState(0);
  useTutupDenganBack(true, onTutup);
  useEffect(() => {
    const a = setInterval(() => ketuk((x) => x + 1), 1000);
    return () => clearInterval(a);
  }, []);
  const sisa = Math.max(0, Math.ceil((Date.parse(s.tutup_at) - (Date.now() + selisih)) / 1000));
  const habis = sisa <= 0;
  const pakaiKode = s.metode.includes("kode");
  const pakaiRadar = s.metode.includes("radar");

  async function kirim(badan: Record<string, unknown>) {
    setSibuk(true);
    setGalat(null);
    try {
      await fetchJson("/api/sigap/pelatihan/absen", { method: "POST", body: JSON.stringify({ sesi_id: s.id, ...badan }) });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }
  async function lokasi() {
    setSibuk(true);
    setGalat(null);
    try {
      const p = await ambilPosisi();
      await fetchJson("/api/sigap/pelatihan/absen", { method: "POST", body: JSON.stringify({ aksi: "lokasi", sesi_id: s.id, ...p }) });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/50 sm:items-center" role="dialog" aria-modal="true" aria-label={`Absensi ${s.label}`} onClick={onTutup}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Absensi {s.label} dibuka</h2>
        <p className="mt-1 text-[13px] text-[#44546F]">
          {habis ? "Waktu absen sudah habis. Hubungi panitia atau instruktur." : <>Waktu tersisa <b className="tabular-nums text-[#0F2A52]">{teksSisa(sisa)}</b></>}
        </p>
        {!habis && pakaiKode && (
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (kode.length === KODE_PANJANG) void kirim({ aksi: "kode", kode }); }}>
            <label htmlFor="kode-absen" className="text-[13px] font-semibold">Kode dari panitia atau instruktur</label>
            <input id="kode-absen" value={kode} onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, KODE_PANJANG))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
              className="mt-1 w-full rounded-xl border border-[#CBD6E6] px-3 py-3 text-center text-[28px] font-extrabold tracking-[0.25em] tabular-nums" placeholder="••••••" />
            <button type="submit" className={`${BTN} mt-2 w-full`} disabled={sibuk || kode.length !== KODE_PANJANG}>{sibuk ? "Memeriksa…" : "Kirim kode"}</button>
          </form>
        )}
        {!habis && pakaiRadar && (
          <div className="mt-4">
            <button type="button" className={`${pakaiKode ? BTN_O : BTN} w-full`} onClick={lokasi} disabled={sibuk}>{sibuk ? "Membaca lokasi…" : "Konfirmasi lokasi"}</button>
            <p className="mt-1 text-[12px] text-[#6B7A90]">Berdirilah dalam {s.radius_m} m dari panitia atau instruktur, dengan GPS aktif.</p>
            {s.di_luar_radar && <p className="mt-1 text-[12.5px] font-semibold text-[#B42329]">Lokasi Anda terakhir tercatat di luar radius. Dekati panitia lalu konfirmasi lagi.</p>}
          </div>
        )}
        {!habis && !pakaiKode && !pakaiRadar && <p className="mt-4 rounded-xl bg-[#F3F6FB] p-3 text-[13.5px] text-[#44546F]">Tunggu panitia atau instruktur mencentang kehadiran Anda.</p>}
        {galat && <div className="mt-3"><Pesan jenis="galat">{galat}</Pesan></div>}
        <div className="mt-4 flex justify-end"><button type="button" className={BTN_O} onClick={onTutup}>Tutup</button></div>
      </div>
    </div>
  );
}

export default function AbsenPeserta() {
  const [d, setD] = useState<Data | null>(null);
  const [ada, setAda] = useState(true);
  const [selisih, setSelisih] = useState(0);
  const [modal, setModal] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const sudahDibuka = useRef(new Set<number>());
  const [, ketuk] = useState(0);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>("/api/sigap/pelatihan/absen?sebagai=peserta");
      setD(r);
      setSelisih(r.sekarang - Date.now());
    } catch {
      setAda(false); // bukan peserta atau fitur belum aktif: diam
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);
  useEffect(() => {
    if (!ada) return;
    const a = setInterval(() => document.visibilityState === "visible" && void muat(), 10000);
    return () => clearInterval(a);
  }, [muat, ada]);
  useEffect(() => {
    const a = setInterval(() => ketuk((x) => x + 1), 1000);
    return () => clearInterval(a);
  }, []);

  const sekarang = Date.now() + selisih;
  const terbuka = (d?.sesi_terbuka ?? []).filter((s) => Date.parse(s.tutup_at) > sekarang);
  const perluIsi = terbuka.filter((s) => !s.sudah_hadir);

  // modal muncul sendiri sekali per sesi yang baru dibuka (juga bila aplikasi dibuka sesudahnya selama sesi dibuka)
  useEffect(() => {
    if (modal !== null) return;
    const baru = perluIsi.find((s) => !sudahDibuka.current.has(s.id));
    if (baru) {
      sudahDibuka.current.add(baru.id);
      setModal(baru.id);
    }
  }, [perluIsi, modal]);

  async function datang() {
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      const p = await ambilPosisi();
      await fetchJson("/api/sigap/pelatihan/presensi", { method: "POST", body: JSON.stringify(p) });
      setPesan("Kedatangan tercatat.");
      await muat();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (!ada || !d) return null;
  const sesiModal = terbuka.find((s) => s.id === modal) ?? null;
  return (
    <>
      {d.kedatangan.berlaku && (
        <section className={`rounded-[18px] border p-4 ${d.kedatangan.sudah ? "border-[#BFE5D0] bg-[#F3FBF7]" : "border-[#F4D78A] bg-[#FFFBEF]"}`} aria-label="Kedatangan">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Kedatangan hari pertama</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${d.kedatangan.sudah ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>
              {d.kedatangan.sudah ? `Tercatat ${d.kedatangan.at ? jam(d.kedatangan.at) : ""}${d.kedatangan.manual ? " · oleh panitia" : ""}` : "Belum tercatat"}
            </span>
          </div>
          {!d.kedatangan.sudah && (
            <>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#3B4A60]">Ketuk setelah tiba di lokasi pelatihan. GPS harus aktif; jarak dinilai terhadap titik pelatihan.</p>
              <button type="button" className={`${BTN} mt-3`} onClick={datang} disabled={sibuk}>{sibuk ? "Membaca lokasi…" : "Saya sudah tiba"}</button>
            </>
          )}
          {galat && <div className="mt-2"><Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
          {pesan && <div className="mt-2"><Pesan jenis="ok" onTutup={() => setPesan(null)}>{pesan}</Pesan></div>}
        </section>
      )}
      {terbuka.map((s) => (
        <section key={s.id} className={`rounded-[18px] border p-4 ${s.sudah_hadir ? "border-[#BFE5D0] bg-[#F3FBF7]" : "border-[#B9D2FB] bg-[#F3F8FF]"}`} aria-label={`Absensi ${s.label}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Absensi {s.label}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${s.sudah_hadir ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#E3EEFF] text-[#1F5FD1]"}`}>{s.sudah_hadir ? "Anda sudah hadir" : `Habis dalam ${teksSisa(Math.max(0, Math.ceil((Date.parse(s.tutup_at) - sekarang) / 1000)))}`}</span>
          </div>
          {!s.sudah_hadir && <button type="button" className={`${BTN} mt-3`} onClick={() => setModal(s.id)}>Isi absen sekarang</button>}
        </section>
      ))}
      {sesiModal && !sesiModal.sudah_hadir && (
        <ModalAbsen
          s={sesiModal}
          selisih={selisih}
          onTutup={() => setModal(null)}
          onSelesai={() => {
            setModal(null);
            void muat();
          }}
        />
      )}
    </>
  );
}
