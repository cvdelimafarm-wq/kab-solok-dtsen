"use client";

// (10 Okt 2026) Spanduk tetap "Anda melihat sebagai <nama>" selama akun super berada di mode "masuk sebagai" -- supaya jelas bahwa
// semua yang terlihat adalah tampilan akun lain. Tombol: "Ganti" (pilih akun lain) dan "Kembali ke akun saya".
// Aktif hanya bila localStorage memuat penanda mode (sigap_lihat_sebagai), sesi asli akun super (sigap_sesi_asli), dan sesi akun yang dilihat masih sah.
// (11 Okt 2026) Mode ini kini SIMULASI (app/portal/simulasi.ts): boleh mengisi/unggah/simpan, tetapi tidak ada yang dikirim ke server --
// keputusan user. Teks spanduk diseragamkan ("Simulasi · tidak ada data yang dikirim"; dulu "aksi tersimpan atas nama akun ini" bertentangan
// dengan halaman identifikasi). Tiap penulisan yang ditahan tampil sebentar sebagai catatan kecil di bawah spanduk.
// (11 Okt 2026) "Ganti" dulu diam bila sesi asli sudah habis; kini menampilkan pesan dan tombol masuk lagi.

import { useEffect, useState } from "react";
import PilihSebagai, { type HasilSebagai } from "@/app/portal/PilihSebagai";
import { bacaLihatSebagai, bacaSesiAsli, kembaliKeAkunSaya, mulaiLihatSebagai, type LihatSebagai } from "@/app/portal/sesi";
import { EVENT_SIMULASI } from "@/app/portal/simulasi"; // memasang penahan penulisan sejak modul dimuat

const TINGGI = 36;

export default function BannerLihatSebagai() {
  const [info, setInfo] = useState<LihatSebagai | null>(null);
  const [ganti, setGanti] = useState(false);
  const [catatan, setCatatan] = useState<string | null>(null);

  useEffect(() => {
    const baca = () => setInfo(bacaLihatSebagai());
    baca();
    window.addEventListener("storage", baca);
    return () => window.removeEventListener("storage", baca);
  }, []);

  useEffect(() => {
    if (!info) return;
    const lama = document.body.style.paddingTop;
    document.body.style.paddingTop = `${TINGGI}px`;
    return () => {
      document.body.style.paddingTop = lama;
    };
  }, [info]);

  // catatan "Simulasi: tidak dikirim" setiap ada penulisan yang ditahan
  useEffect(() => {
    if (!info) return;
    let pewaktu: ReturnType<typeof setTimeout> | null = null;
    const f = () => {
      setCatatan("Simulasi: tersimpan di layar ini saja, tidak dikirim ke server.");
      if (pewaktu) clearTimeout(pewaktu);
      pewaktu = setTimeout(() => setCatatan(null), 3500);
    };
    window.addEventListener(EVENT_SIMULASI, f);
    return () => {
      window.removeEventListener(EVENT_SIMULASI, f);
      if (pewaktu) clearTimeout(pewaktu);
    };
  }, [info]);

  if (!info) return null;

  function kembali() {
    kembaliKeAkunSaya();
    window.location.replace("/");
  }

  function pilih(h: HasilSebagai) {
    if (h.sendiri) return kembali();
    const asli = bacaSesiAsli();
    if (!asli) return kembali();
    mulaiLihatSebagai({ sesi: asli, sampai: "" }, { sesi: h.sesi, sampai: h.sampai, token: h.token, id: h.id, nama: h.nama, aktor: h.aktor });
    window.location.replace("/");
  }

  const asli = bacaSesiAsli();

  return (
    <>
      <div role="status" className="fixed inset-x-0 top-0 z-[10000] flex items-center justify-between gap-2 bg-[#B45309] px-3 text-[12.5px] font-semibold text-white shadow-md" style={{ height: TINGGI }}>
        <span className="min-w-0 truncate">👁 Melihat sebagai <b>{info.nama}</b> · simulasi, tidak ada data yang dikirim</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setGanti(true)} className="rounded-md bg-white/15 px-2 py-1 text-[12px] font-bold hover:bg-white/25">Ganti</button>
          <button type="button" onClick={kembali} className="rounded-md bg-white px-2 py-1 text-[12px] font-bold text-[#B45309] hover:bg-[#FFF4E5]">Kembali ke akun saya</button>
        </span>
      </div>
      {catatan && (
        <div role="status" className="fixed inset-x-0 z-[10000] mx-auto w-fit max-w-[92vw] rounded-b-[12px] bg-[#7C3A06] px-3 py-1.5 text-center text-[12px] font-semibold text-white shadow-md" style={{ top: TINGGI }}>
          {catatan}
        </div>
      )}
      {ganti && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
          {asli ? (
            <PilihSebagai sesi={asli} namaSaya={info.aktor || "Akun saya"} onPilih={pilih} onBatal={() => setGanti(false)} />
          ) : (
            <div className="w-full max-w-sm rounded-[16px] bg-white p-4 text-[13.5px] text-[#1B2B4B] shadow-xl">
              <b className="block text-[15px]">Sesi akun Anda sudah berakhir</b>
              <p className="mt-1 text-[#4D5B6B]">Untuk mengganti akun yang dilihat, masuk lagi dengan akun Anda.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setGanti(false)} className="min-h-[40px] rounded-lg border border-[#CDD5DE] px-4 font-semibold text-[#4D5B6B]">Tutup</button>
                <button type="button" onClick={kembali} className="min-h-[40px] rounded-lg bg-[#1F5FD1] px-4 font-bold text-white">Masuk lagi</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
