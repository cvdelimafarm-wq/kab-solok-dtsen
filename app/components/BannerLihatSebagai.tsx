"use client";

// (10 Okt 2026) Spanduk tetap "Anda melihat sebagai <nama>" selama akun super berada di mode "masuk sebagai" -- supaya jelas bahwa
// semua yang terlihat & dilakukan adalah atas nama akun lain. Tombol: "Ganti akun" (pilih akun lain) dan "Kembali ke akun saya".
// Aktif hanya bila localStorage memuat penanda mode (sigap_lihat_sebagai) DAN sesi asli akun super (sigap_sesi_asli).

import { useEffect, useState } from "react";
import PilihSebagai, { type HasilSebagai } from "@/app/portal/PilihSebagai";
import { bacaLihatSebagai, bacaSesiAsli, kembaliKeAkunSaya, mulaiLihatSebagai, type LihatSebagai } from "@/app/portal/sesi";

const TINGGI = 36;

export default function BannerLihatSebagai() {
  const [info, setInfo] = useState<LihatSebagai | null>(null);
  const [ganti, setGanti] = useState(false);

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
        <span className="min-w-0 truncate">👁 Melihat sebagai <b>{info.nama}</b> · aksi tersimpan atas nama akun ini</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setGanti(true)} className="rounded-md bg-white/15 px-2 py-1 text-[12px] font-bold hover:bg-white/25">Ganti</button>
          <button type="button" onClick={kembali} className="rounded-md bg-white px-2 py-1 text-[12px] font-bold text-[#B45309] hover:bg-[#FFF4E5]">Kembali ke akun saya</button>
        </span>
      </div>
      {ganti && asli && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
          <PilihSebagai sesi={asli} namaSaya={info.aktor || "Akun saya"} onPilih={pilih} onBatal={() => setGanti(false)} />
        </div>
      )}
    </>
  );
}
