"use client";

// app/sigap/lokasi-saya/page.tsx
//
// (31 Okt 2026) Layar Mitra melengkapi lokasi rumah: tujuan kartu emas "perlu lokasi" di Beranda dan tautan di halaman seleksi.
// Hanya bagian yang masih kosong yang diminta (titik rumah lewat GPS, kecamatan); yang sudah tercatat ditampilkan saja. Aturan dan batas: lib/lokasiMitra.ts.
// Konfirmasi sebaris (bukan modal). Setelah tersimpan, tombol kembali ke halaman asal (?kembali=, hanya jalur internal).

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { bacaSesi } from "@/app/sigap/admin/api";
import { bacaPosisi, GalatBacaLokasi, pesanGalatLokasi, type PosisiGps } from "@/lib/lokasiGalat";
import { AKURASI_BAIK_M, MAKS_AKURASI_SIMPAN_M, tautanPeta, tujuanKembali } from "@/lib/lokasiMitra";

type Data = {
  nama: string;
  kecamatan: string | null;
  nagari: string | null;
  titik: { lat: number; lng: number; terverifikasi: boolean; mandiri: boolean } | null;
  perlu: { titik: boolean; kecamatan: boolean };
  pilihan_kecamatan: string[];
};

const kartu = "rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const tombol = "inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] bg-[#1F5FD1] px-4 text-[14.5px] font-bold text-white disabled:opacity-50";
const tombolPutih = "inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] border border-[#CBD6E6] bg-white px-4 text-[14.5px] font-bold text-[#1B2B4B] disabled:opacity-50";

export default function HalamanLokasiSaya() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [posisi, setPosisi] = useState<PosisiGps | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [kecamatan, setKecamatan] = useState("");
  const [yakin, setYakin] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const [kembali, setKembali] = useState<string>("/");

  const muat = useCallback(async () => {
    try {
      setD(await apiPortal<Data>("/api/sigap/lokasi-saya"));
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat lokasi.");
    }
  }, []);

  useEffect(() => {
    const k = tujuanKembali(new URLSearchParams(window.location.search).get("kembali"));
    if (k) setKembali(k);
    if (!bacaSesi()) {
      window.location.replace(`/?lanjut=${encodeURIComponent(`/sigap/lokasi-saya${k ? `?kembali=${encodeURIComponent(k)}` : ""}`)}`);
      return;
    }
    void muat();
  }, [muat]);

  async function ambilLokasi() {
    setMembaca(true);
    setGalat(null);
    setYakin(false);
    try {
      setPosisi(await bacaPosisi(navigator.geolocation));
    } catch (e) {
      setPosisi(null);
      setGalat(pesanGalatLokasi(e instanceof GalatBacaLokasi ? e.jenis : "tak_dikenal"));
    } finally {
      setMembaca(false);
    }
  }

  async function simpan() {
    if (!d) return;
    setSibuk(true);
    setGalat(null);
    try {
      await apiPortal("/api/sigap/lokasi-saya", {
        method: "POST",
        body: JSON.stringify({
          ...(d.perlu.titik && posisi ? { lat: posisi.lat, lng: posisi.lng, akurasi: posisi.akurasi } : {}),
          ...(d.perlu.kecamatan ? { kecamatan } : {}),
        }),
      });
      setSelesai(true);
      setYakin(false);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan lokasi.");
      setYakin(false);
    } finally {
      setSibuk(false);
    }
  }

  const perluTitik = !!d?.perlu.titik;
  const perluKec = !!d?.perlu.kecamatan;
  const akurasiKasar = !!posisi && posisi.akurasi > MAKS_AKURASI_SIMPAN_M;
  const siap = (!perluTitik || (!!posisi && !akurasiKasar)) && (!perluKec || kecamatan !== "");
  const lengkap = !!d && !perluTitik && !perluKec;

  return (
    <main className="min-h-screen bg-[#EEF2F8] px-4 pb-16 pt-6 text-[#14202E]">
      <div className="mx-auto max-w-[560px] space-y-3">
        <a href={kembali} className="text-[13px] font-bold text-[#1F5FD1]">← Kembali</a>
        {galat && <p role="alert" className="rounded-[14px] bg-[#FDE8E8] px-3.5 py-3 text-[13.5px] text-[#B42329]">{galat}</p>}
        {!d && !galat && <p className="py-10 text-center text-[14px] text-[#55657D]">Memuat…</p>}

        {d && (
          <>
            <section className={kartu}>
              <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#7B8794]">Lokasi rumah</p>
              <h1 className="mt-1 text-[19px] font-extrabold text-[#0F2A52]">Lengkapi lokasi Anda</h1>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#55657D]">
                Lokasi dipakai untuk memeriksa syarat domisili dan jarak pada seleksi petugas. Lokasi hanya dibaca saat Anda mengetuk tombol di bawah, tidak dilacak.
              </p>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2"><dt className="font-semibold text-[#6B7A90]">Nama</dt><dd className="text-right font-bold">{d.nama}</dd></div>
                <div className="flex justify-between gap-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2"><dt className="font-semibold text-[#6B7A90]">Kecamatan</dt><dd className="text-right font-bold">{d.kecamatan ?? <span className="text-[#8A6200]">belum tercatat</span>}</dd></div>
                <div className="flex justify-between gap-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2"><dt className="font-semibold text-[#6B7A90]">Nagari</dt><dd className="text-right font-bold">{d.nagari ?? <span className="font-normal text-[#6B7A90]">belum tercatat (diatur admin)</span>}</dd></div>
                <div className="flex justify-between gap-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2">
                  <dt className="font-semibold text-[#6B7A90]">Titik rumah</dt>
                  <dd className="text-right font-bold">
                    {d.titik ? (
                      <>
                        <span className="text-[#13794B]">{d.titik.terverifikasi ? "terverifikasi" : "tercatat"}</span>{" "}
                        <a href={tautanPeta(d.titik.lat, d.titik.lng)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F5FD1] underline">lihat peta</a>
                      </>
                    ) : (
                      <span className="text-[#8A6200]">belum ada</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {selesai && lengkap && (
              <section className={`${kartu} space-y-3`}>
                <p role="status" className="rounded-[12px] bg-[#E3F6EC] px-3 py-2.5 text-[13.5px] font-semibold text-[#13794B]">Lokasi Anda tersimpan. Terima kasih.</p>
                <a href={kembali} className={tombol}>{kembali === "/" ? "Ke Beranda" : "Lanjut"}</a>
              </section>
            )}

            {lengkap && !selesai && (
              <section className={`${kartu} space-y-3`}>
                <p className="rounded-[12px] bg-[#E3F6EC] px-3 py-2.5 text-[13.5px] text-[#13794B]">Lokasi Anda sudah lengkap. Bila ada yang keliru dan perlu diubah, hubungi admin.</p>
                <a href={kembali} className={tombolPutih}>Kembali</a>
              </section>
            )}

            {(perluTitik || perluKec) && (
              <section className={`${kartu} space-y-3`}>
                {perluTitik && (
                  <div className="space-y-2">
                    <h2 className="text-[16px] font-extrabold text-[#0F2A52]">1. Titik rumah</h2>
                    <p className="text-[13px] leading-relaxed text-[#44546F]">
                      Lakukan <b>saat Anda berada di rumah</b>, di tempat terbuka dengan Lokasi/GPS HP menyala. Saat HP bertanya, pilih <b>Izinkan</b>.
                    </p>
                    <button type="button" className={posisi ? tombolPutih : tombol} disabled={membaca || sibuk} onClick={() => void ambilLokasi()}>
                      {membaca ? "Membaca lokasi…" : posisi ? "Ambil ulang lokasi" : "Ambil lokasi saya"}
                    </button>
                    {membaca && <p role="status" className="text-[12.5px] font-semibold text-[#1F5FD1]">Menunggu GPS, bisa sampai setengah menit…</p>}
                    {posisi && (
                      <div className="rounded-[12px] bg-[#F5F8FE] px-3 py-2.5 text-[13px]">
                        <p className="font-bold text-[#0F2A52]">{posisi.lat.toFixed(6)}, {posisi.lng.toFixed(6)}</p>
                        <p className={akurasiKasar ? "text-[#B42329]" : posisi.akurasi > AKURASI_BAIK_M ? "text-[#8A6200]" : "text-[#13794B]"}>
                          Akurasi ±{Math.round(posisi.akurasi)} m
                          {akurasiKasar ? ` — terlalu kasar (maksimal ${MAKS_AKURASI_SIMPAN_M} m). Pindah ke tempat terbuka lalu ambil ulang.` : posisi.akurasi > AKURASI_BAIK_M ? " — cukup, tetapi lebih baik diulang di tempat terbuka." : " — baik."}
                        </p>
                        <a href={tautanPeta(posisi.lat, posisi.lng)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-[#1F5FD1] underline">Periksa di peta</a>
                      </div>
                    )}
                  </div>
                )}

                {perluKec && (
                  <div className="space-y-2">
                    <h2 className="text-[16px] font-extrabold text-[#0F2A52]">{perluTitik ? "2. " : ""}Kecamatan tempat tinggal</h2>
                    <label className="block">
                      <span className="sr-only">Kecamatan tempat tinggal</span>
                      <select value={kecamatan} onChange={(e) => { setKecamatan(e.target.value); setYakin(false); }} className="min-h-[46px] w-full rounded-[14px] border border-[#CBD6E6] bg-white px-3 text-[14.5px]">
                        <option value="">Pilih kecamatan…</option>
                        {d.pilihan_kecamatan.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </label>
                  </div>
                )}

                {!yakin ? (
                  <button type="button" className={tombol} disabled={!siap || sibuk} onClick={() => setYakin(true)}>
                    Simpan lokasi
                  </button>
                ) : (
                  <div className="space-y-2 rounded-[12px] bg-[#FFF4D6] p-3">
                    <p className="text-[13px] leading-relaxed text-[#6B4C00]">
                      {perluTitik ? "Pastikan Anda sekarang berada di rumah. " : ""}Setelah tersimpan, data ini <b>tidak dapat diubah sendiri</b>; perubahan harus lewat admin.
                    </p>
                    <button type="button" className={tombol} disabled={sibuk} onClick={() => void simpan()}>{sibuk ? "Menyimpan…" : "Ya, simpan"}</button>
                    <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => setYakin(false)}>Batal</button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
