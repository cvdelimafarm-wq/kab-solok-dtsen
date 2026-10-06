"use client";

// (7 Okt 2026) Portal satu login -- halaman depan: belum masuk -> form masuk tunggal; sudah masuk -> beranda kartu.

import { useCallback, useEffect, useState } from "react";
import Beranda, { type InfoDtsen } from "./Beranda";
import Masuk from "./Masuk";
import { bacaSesi, tujuanLanjut } from "./sesi";

export default function PortalDepan({ dtsen }: { dtsen: InfoDtsen }) {
  const [tahap, setTahap] = useState<"cek" | "masuk" | "beranda">("cek");

  useEffect(() => {
    const ada = !!bacaSesi();
    const lanjut = tujuanLanjut();
    // /dashboard (DTSEN) butuh login nomor HP (akun Supabase), bukan sesi SIGAP -> tampilkan form masuk, cegah putaran redirect.
    const butuhDtsen = !!lanjut && lanjut.startsWith("/dashboard");
    if (lanjut && lanjut !== "/" && (butuhDtsen ? !!dtsen : ada)) {
      window.location.replace(lanjut);
      return;
    }
    if (butuhDtsen && !dtsen) {
      setTahap("masuk");
      return;
    }
    setTahap(ada || dtsen ? "beranda" : "masuk");
  }, [dtsen]);

  const keluar = useCallback(() => {
    // Sesudah keluar, muat ulang supaya status login DTSEN (cookie Supabase) ikut terbaca ulang di server.
    window.location.replace("/");
  }, []);

  if (tahap === "cek") return <main className="min-h-screen bg-[#F3F5F8]" />;
  if (tahap === "masuk") return <Masuk onMasuk={() => setTahap("beranda")} />;
  return <Beranda dtsen={dtsen} onKeluar={keluar} />;
}
