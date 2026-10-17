"use client";

// app/sigap/kelola/pendataan/KirimSatu.tsx
//
// (17 Okt 2026) Kirim notifikasi push ke SATU petugas pendataan (mis. mengajak PML mencoba menu baru) -- permintaan user.
// Berbeda dengan Siaran: tanpa modal, tidak ke semua petugas. Pengiriman dua langkah (Kirim -> Ya, kirim) agar tidak terkirim tak sengaja.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH } from "@/lib/sigapPushUtil";

type Petugas = { akun_id: number; nama: string; peran: string; perangkat: number };
type Hasil = { ok: boolean; nama: string; perangkat: number; terkirim: number; gagal: number };

const AWAL = {
  judul: "Silakan coba menu Kolam wilayah",
  isi: "Menu Kolam wilayah sudah dibuka untuk Anda. Buka Lembar Pendataan, ketuk tombol ungu Kolam wilayah, lalu pilih Sub SLS tambahan (maksimal 2 sekali kirim). Mohon dicoba dan kabari hasilnya.",
  url: "/sigap/pendataan",
};

const labelPeran = (p: string) => (p === "pml" ? "PML" : p === "ppl" ? "PPL" : p === "korwil" ? "Korwil" : p);

export default function KirimSatu() {
  const [daftar, setDaftar] = useState<Petugas[] | null>(null);
  const [boleh, setBoleh] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [akunId, setAkunId] = useState<number | null>(null);
  const [judul, setJudul] = useState(AWAL.judul);
  const [isi, setIsi] = useState(AWAL.isi);
  const [url, setUrl] = useState(AWAL.url);
  const [yakin, setYakin] = useState(false);
  const [kirim, setKirim] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await apiPortal<{ petugas: Petugas[] }>("/api/portal/siaran-petugas?petugas=1");
      setDaftar(r.petugas);
      setAkunId((a) => a ?? r.petugas.find((p) => p.peran === "pml" && /hariston/i.test(p.nama))?.akun_id ?? null);
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal memuat daftar petugas.");
    }
  }, []);
  useEffect(() => {
    void muat();
    // hak kirim ditentukan server (403 saat mengirim); ringkasan siaran memberi tahu bila hanya boleh melihat
    apiPortal<{ boleh_kirim: boolean }>("/api/portal/siaran-petugas?ringkas=1")
      .then((r) => setBoleh(!!r.boleh_kirim))
      .catch(() => undefined);
  }, [muat]);

  const dipilih = daftar?.find((p) => p.akun_id === akunId) ?? null;
  const sah = akunId !== null && judul.trim().length > 0 && isi.trim().length > 0;

  async function kirimSekarang() {
    if (kirim || akunId === null) return;
    setKirim(true);
    setGalat(null);
    setHasil(null);
    try {
      const h = await apiPortal<Hasil>("/api/portal/siaran-petugas", { method: "POST", body: JSON.stringify({ aksi: "kirim_satu", akun_id: akunId, judul, isi, url }) });
      setHasil(h);
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim. Periksa sambungan lalu coba lagi.");
    } finally {
      setYakin(false);
      setKirim(false);
    }
  }

  const kolom = "mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B]";

  return (
    <section className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Kirim notifikasi ke satu petugas</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-[#55657D]">Notifikasi push hanya ke perangkat petugas yang dipilih (mis. mengajak mencoba menu baru). Tanpa modal dan tidak masuk riwayat siaran. Hanya petugas pendataan yang bertugas yang bisa dipilih.</p>
      {galat && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

      <label className="mt-3 block text-[12px] font-bold text-[#55657D]">
        Penerima
        <select value={akunId ?? ""} onChange={(e) => { setAkunId(e.target.value ? Number(e.target.value) : null); setYakin(false); setHasil(null); }} className={`${kolom} min-h-[44px]`} disabled={!daftar}>
          <option value="">{daftar ? "Pilih petugas…" : "Memuat…"}</option>
          {(daftar ?? []).map((p) => (
            <option key={p.akun_id} value={p.akun_id}>
              {p.nama} · {labelPeran(p.peran)} · {p.perangkat > 0 ? `${p.perangkat} perangkat` : "belum aktifkan notifikasi"}
            </option>
          ))}
        </select>
      </label>
      {dipilih && dipilih.perangkat === 0 && <p className="mt-1.5 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12px] font-semibold text-[#6B4A0E]">Petugas ini belum mengaktifkan notifikasi di HP-nya, jadi tidak ada yang akan menerima. Minta beliau menekan &quot;Aktifkan notifikasi&quot; di Beranda.</p>}

      <label className="mt-3 block text-[12px] font-bold text-[#55657D]">
        Judul ({judul.length}/{MAKS_JUDUL_PUSH})
        <input value={judul} maxLength={MAKS_JUDUL_PUSH} onChange={(e) => setJudul(e.target.value)} className={kolom} />
      </label>
      <label className="mt-2 block text-[12px] font-bold text-[#55657D]">
        Isi ({isi.length}/{MAKS_ISI_PUSH})
        <textarea value={isi} maxLength={MAKS_ISI_PUSH} rows={4} onChange={(e) => setIsi(e.target.value)} className={kolom} />
      </label>
      <label className="mt-2 block text-[12px] font-bold text-[#55657D]">
        Tujuan saat diketuk (halaman SIGAP, diawali /)
        <input value={url} maxLength={200} onChange={(e) => setUrl(e.target.value)} className={kolom} />
      </label>

      {boleh ? (
        !yakin ? (
          <button type="button" disabled={!sah || kirim} onClick={() => { setYakin(true); setHasil(null); }} className="mt-4 min-h-[50px] w-full rounded-[14px] bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
            Kirim…
          </button>
        ) : (
          <div className="mt-4 rounded-[14px] border border-[#F2D58A] bg-[#FFF6E0] p-3">
            <p className="text-[13px] font-bold text-[#6B4A0E]">Kirim notifikasi ini ke {dipilih?.nama ?? "petugas terpilih"} sekarang? Tidak bisa ditarik kembali.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setYakin(false)} className="min-h-[46px] rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#0F2A52] shadow-sm">
                Batal
              </button>
              <button type="button" disabled={kirim} onClick={() => void kirimSekarang()} className="min-h-[46px] rounded-[12px] bg-[#13794B] text-[13.5px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                {kirim ? "Mengirim…" : "Ya, kirim"}
              </button>
            </div>
          </div>
        )
      ) : (
        <p className="mt-4 text-[12.5px] text-[#6B7A90]">Akun ini hanya boleh melihat; mengirim butuh izin kelola pendataan.</p>
      )}

      {hasil && (
        <p role="status" className={`mt-3 rounded-[12px] px-3 py-2 text-[13px] font-semibold ${hasil.terkirim > 0 ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#6B4A0E]"}`}>
          {hasil.perangkat === 0
            ? `${hasil.nama} belum mengaktifkan notifikasi, jadi tidak ada yang terkirim.`
            : `Terkirim ke ${hasil.terkirim} dari ${hasil.perangkat} perangkat ${hasil.nama}${hasil.gagal ? ` (${hasil.gagal} gagal)` : ""}.`}
        </p>
      )}
    </section>
  );
}
