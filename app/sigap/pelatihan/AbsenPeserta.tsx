"use client";

// app/sigap/pelatihan/AbsenPeserta.tsx
//
// (2 Nov 2026) Sisi PESERTA dari Absen peserta, dipasang di tab Hari ini:
//  - Kartu KEDATANGAN (hanya hari pertama pelatihan): satu ketukan, GPS dinilai server terhadap titik pelatihan (mesin presensi yang sudah ada).
//  - Kartu dan modal ABSEN SESI saat pengelola memulai presensi: ketik kode, atau "Konfirmasi lokasi" (radar), atau menunggu dicentang. Hitung mundur mengikuti
//    jendela 30 menit; sesudahnya modal padam dan kode / lokasi ditolak server.
// Data: GET /api/sigap/pelatihan/absen?sebagai=peserta (disegarkan berkala); POST kode / lokasi; kedatangan memakai POST /api/sigap/pelatihan/presensi.
// Bukan peserta atau SQL belum dijalankan -> tidak menggambar apa pun.

import { useEffect, useRef, useState } from "react";
import { fetchJson, pesanGalat } from "../admin/api";
import { useAbsenSaya, type SesiHari, type SesiTerbuka } from "./absenSaya"; // (3 Nov 2026) data dibagi dengan lajur ikon langkah
import { BTN, BTN_O, Pesan } from "../admin/ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { KODE_PANJANG, teksSisa, type MetodeAbsen } from "@/lib/sigapAbsen";

type Sesi = SesiTerbuka;

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

function ModalAbsen({ s, selisih, onTutup, onSelesai }: { s: Sesi; selisih: number; onTutup: () => void; onSelesai: () => void }) {
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

const KEADAAN_TEKS: Record<SesiHari["keadaan"], string> = { dibuka: "Dibuka", habis: "Waktu habis", ditutup: "Ditutup" };

export default function AbsenPeserta() {
  const { data: d, ada, selisih, muat } = useAbsenSaya();
  const [modal, setModal] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const sudahDibuka = useRef(new Set<number>());
  const [, ketuk] = useState(0);
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
  // (3 Nov 2026) Kartu Presensi sesi SELALU tampil (dulu hanya saat panitia membuka sesi, sehingga peserta mengira fiturnya tidak ada): daftar sesi hari ini dengan statusnya.
  const sesiHari: SesiHari[] = d.sesi_hari ?? terbuka.map((s) => ({ id: s.id, no: s.no, label: s.label, jam: null, keadaan: "dibuka" as const, tutup_at: s.tutup_at, sudah_hadir: s.sudah_hadir }));
  const hadirN = sesiHari.filter((s) => s.sudah_hadir).length;
  const punyaTerbuka = perluIsi.length > 0;
  return (
    <>
      {d.kedatangan.berlaku && (
        <section id="langkah-hadir" className={`rounded-[18px] border p-4 ${d.kedatangan.sudah ? "border-[#BFE5D0] bg-[#F3FBF7]" : "border-[#F4D78A] bg-[#FFFBEF]"}`} aria-label="Kedatangan">
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
      <section id="langkah-sesi" className={`rounded-[18px] border p-4 ${punyaTerbuka ? "border-[#B9D2FB] bg-[#F3F8FF]" : sesiHari.length > 0 && hadirN === sesiHari.length ? "border-[#BFE5D0] bg-[#F3FBF7]" : "border-[#DDE6F3] bg-white"}`} aria-label="Presensi sesi">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Presensi sesi</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${punyaTerbuka ? "bg-[#E3EEFF] text-[#1F5FD1]" : sesiHari.length > 0 && hadirN === sesiHari.length ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#EEF2F7] text-[#6B7A90]"}`}>
            {punyaTerbuka ? "Sedang dibuka" : sesiHari.length === 0 ? "Belum ada sesi dibuka" : `${hadirN}/${sesiHari.length} sesi hadir`}
          </span>
        </div>
        {sesiHari.length === 0 ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#5B6B84]">Panitia atau instruktur membuka presensi di tiap sesi (jendela 30 menit). Saat dibuka, pop-up muncul di sini untuk mengisi kode atau konfirmasi lokasi.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {sesiHari.map((s) => {
              const sisa = Math.max(0, Math.ceil((Date.parse(s.tutup_at) - sekarang) / 1000));
              const buka = s.keadaan === "dibuka" && sisa > 0;
              const terbukaPeserta = terbuka.find((t) => t.id === s.id);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E3EAF4] bg-white px-3 py-2">
                  <span className="min-w-0 flex-1 text-[13.5px] font-bold text-[#0F2A52]">
                    {s.label}
                    {s.jam ? <span className="ml-1.5 text-[12px] font-semibold text-[#6B7A90]">{s.jam}</span> : null}
                  </span>
                  {s.sudah_hadir ? (
                    <span className="rounded-full bg-[#E3F6EC] px-2.5 py-0.5 text-[11.5px] font-bold text-[#13794B]">✓ Hadir</span>
                  ) : buka ? (
                    <>
                      <span className="rounded-full bg-[#E3EEFF] px-2.5 py-0.5 text-[11.5px] font-bold text-[#1F5FD1]">Habis dalam {teksSisa(sisa)}</span>
                      {terbukaPeserta && <button type="button" className={`${BTN} !mt-0 !min-h-[40px] !px-3 !py-1.5 !text-[13px]`} onClick={() => setModal(s.id)}>Isi absen</button>}
                    </>
                  ) : (
                    <span className="rounded-full bg-[#FDE8E8] px-2.5 py-0.5 text-[11.5px] font-bold text-[#B42329]">{KEADAAN_TEKS[s.keadaan === "dibuka" ? "habis" : s.keadaan]} · belum tercatat</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
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
