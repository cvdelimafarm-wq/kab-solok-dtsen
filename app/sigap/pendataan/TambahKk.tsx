"use client";

// app/sigap/pendataan/TambahKk.tsx
//
// (14 Okt 2026) Tombol bulat "+" di pojok kanan bawah Lembar Pendataan untuk menambah keluarga baru (assignment baru) yang ditemui
// di lapangan tetapi tidak ada di daftar KK -- permintaan user. Keluarga baru langsung tercatat sebagai SUDAH DIDATA (terdampak /
// tidak terdampak) atas nama penambah, di Sub SLS yang sedang dibuka. Butuh sinyal (tidak lewat antrean offline) supaya nama kembar
// bisa diperiksa server. Nama kembar di Sub SLS yang sama -> ditanya dulu "tetap tambahkan?".

import { useState } from "react";
import { apiPortal, type GalatApi } from "@/app/portal/sesi";
import { muatData } from "@/app/portal/dataBersama";
import { API_PENDATAAN, pathKkSub, type SubTim } from "@/lib/pendataan";

type Hasil = "terdampak" | "tidak_terdampak";

function uuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function TambahKk({ sub, namaSub, onSelesai }: { sub: SubTim; namaSub: string; onSelesai: (pesan: string) => void }) {
  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [patokan, setPatokan] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; akurasi: number } | null>(null);
  const [cariPos, setCariPos] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kembar, setKembar] = useState(false);
  const [kunci, setKunci] = useState(uuid);

  function reset() {
    setNama("");
    setPatokan("");
    setHasil(null);
    setPos(null);
    setGalat(null);
    setKembar(false);
    setKunci(uuid());
  }
  function tutup() {
    if (sibuk) return;
    setBuka(false);
    reset();
  }

  function ambilLokasi() {
    if (!navigator.geolocation) return setGalat("Perangkat ini tidak punya GPS.");
    setCariPos(true);
    setGalat(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy });
        setCariPos(false);
      },
      () => {
        setCariPos(false);
        setGalat("Lokasi tidak bisa dibaca. Izinkan lokasi untuk aplikasi ini, atau simpan tanpa lokasi.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  async function simpan(paksa = false) {
    if (!nama.trim()) return setGalat("Nama kepala keluarga wajib diisi.");
    if (!hasil) return setGalat("Pilih hasil pendataan: terdampak atau tidak terdampak.");
    setSibuk(true);
    setGalat(null);
    try {
      await apiPortal(API_PENDATAAN, {
        method: "POST",
        body: JSON.stringify({ aksi: "tambah", idsubsls: sub.idsubsls, nama: nama.trim(), patokan: patokan.trim() || null, lat: pos?.lat ?? null, lng: pos?.lng ?? null, hasil, waktu: new Date().toISOString(), kunci, paksa }),
      });
      await Promise.allSettled([muatData(pathKkSub(sub.idsubsls)), muatData(API_PENDATAAN)]);
      onSelesai(`Keluarga baru "${nama.trim()}" ditambahkan dan tercatat ${hasil === "terdampak" ? "terdampak" : "tidak terdampak"}.`);
      setBuka(false);
      reset();
    } catch (e) {
      const g = e as GalatApi;
      if (g.status === 409) setKembar(true);
      else setGalat(g.message === "Failed to fetch" || /sambungan/i.test(g.message) ? "Tidak ada sinyal. Menambah keluarga baru butuh sinyal; coba lagi saat sinyal ada." : g.message);
    } finally {
      setSibuk(false);
    }
  }

  const input = "mt-1 w-full rounded-[12px] border border-[#CBD6E6] bg-white px-3 py-2.5 text-[14px] text-[#0F2A52] outline-none focus:border-[#1F5FD1]";

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        aria-label="Tambah keluarga baru"
        className="fixed bottom-6 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-[#1F5FD1] pl-4 pr-5 text-[14px] font-extrabold text-white shadow-[0_10px_26px_rgba(31,95,209,.45)] active:bg-[#1A4FB8]"
      >
        <span className="text-[26px] leading-none" aria-hidden>
          +
        </span>
        Keluarga baru
      </button>

      {buka && (
        <div className="fixed inset-0 z-40 bg-black/45" onClick={tutup}>
          <div role="dialog" aria-label="Tambah keluarga baru" className="absolute inset-x-0 bottom-0 mx-auto max-h-[90vh] max-w-xl overflow-y-auto rounded-t-[24px] bg-white px-4 pb-6 pt-2" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#D9E3F2]" />
            <button type="button" onClick={tutup} aria-label="Tutup" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-[22px] text-[#6B7A90]">
              ×
            </button>
            <h3 className="pr-10 text-[17px] font-extrabold text-[#0F2A52]">Tambah keluarga baru</h3>
            <p className="mt-0.5 text-[12.5px] text-[#6B7A90]">Untuk keluarga yang ditemui di lapangan tetapi tidak ada di daftar KK. Sub SLS: {namaSub}</p>

            <label className="mt-3 block text-[12px] font-bold text-[#52627A]">
              Nama kepala keluarga <span className="text-[#B42329]">*</span>
              <input className={input} value={nama} maxLength={150} onChange={(e) => { setNama(e.target.value); setKembar(false); }} placeholder="mis. SITI AMINAH" autoCapitalize="characters" />
            </label>
            <label className="mt-3 block text-[12px] font-bold text-[#52627A]">
              Patokan / alamat (boleh dikosongkan)
              <input className={input} value={patokan} maxLength={150} onChange={(e) => setPatokan(e.target.value)} placeholder="mis. depan masjid, rumah cat hijau" />
            </label>

            <span className="mt-3 block text-[12px] font-bold text-[#52627A]">
              Hasil pendataan <span className="text-[#B42329]">*</span>
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="group" aria-label="Hasil pendataan">
              {(
                [
                  ["terdampak", "Terdampak"],
                  ["tidak_terdampak", "Tidak terdampak"],
                ] as [Hasil, string][]
              ).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={hasil === k} onClick={() => setHasil(k)} className={`min-h-[48px] rounded-[14px] border-2 px-3 text-[13.5px] font-extrabold ${hasil === k ? "border-[#1F5FD1] bg-[#E3ECFB] text-[#0F2A52]" : "border-[#D9E3F2] bg-white text-[#52627A]"}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={ambilLokasi} disabled={cariPos} className="min-h-[42px] rounded-full bg-white px-3.5 text-[12.5px] font-extrabold text-[#1F5FD1] shadow-[0_2px_6px_rgba(15,42,82,.12)] disabled:opacity-60">
                {cariPos ? "Membaca lokasi…" : pos ? "Ambil ulang lokasi" : "📍 Ambil lokasi rumah ini"}
              </button>
              <span className="text-[12px] text-[#6B7A90]">{pos ? `Lokasi tersimpan (±${Math.round(pos.akurasi)} m)` : "Opsional, ambil saat berada di depan rumah"}</span>
            </div>

            {kembar && (
              <div className="mt-3 rounded-[12px] bg-[#FFF4D6] px-3 py-2.5 text-[12.5px] text-[#6B4A00]">
                Nama <b>{nama.trim()}</b> sudah ada di daftar Sub SLS ini. Pastikan ini keluarga yang berbeda (bukan KK yang sama).
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => simpan(true)} disabled={sibuk} className="min-h-[40px] rounded-full bg-[#8A6200] px-3.5 text-[12.5px] font-extrabold text-white disabled:opacity-60">
                    Ya, keluarga berbeda
                  </button>
                  <button type="button" onClick={() => setKembar(false)} className="min-h-[40px] rounded-full bg-white px-3.5 text-[12.5px] font-bold text-[#52627A]">
                    Batal
                  </button>
                </div>
              </div>
            )}
            {galat && <p className="mt-3 rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">{galat}</p>}

            <button type="button" onClick={() => simpan(false)} disabled={sibuk || kembar} className="mt-4 min-h-[50px] w-full rounded-[14px] bg-[#1F5FD1] text-[15px] font-extrabold text-white disabled:opacity-60">
              {sibuk ? "Menyimpan…" : "Simpan keluarga baru"}
            </button>
            <p className="mt-2 text-[11.5px] text-[#6B7A90]">Keluarga baru langsung tercatat sudah didata atas nama Anda dan terlihat oleh seluruh tim. Butuh sinyal.</p>
          </div>
        </div>
      )}
    </>
  );
}
