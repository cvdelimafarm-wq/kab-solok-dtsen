"use client";

// app/components/PitaLuring.tsx
//
// (14 Nov 2026, luring tingkat 1; docs/luring-aturan.md L11) Pita kecil di atas layar saat HP tanpa sinyal: halaman tetap terbuka (kerangka tersimpan,
// service worker L10) dan pengguna diberi tahu bahwa data terbaru dan menyimpan butuh sinyal, serta kapan terakhir tersambung. Tidak pernah layar kosong.

import { useEffect, useState } from "react";
import { catatDaring, teksTerakhir, terakhirDaring } from "@/app/portal/luring";

export default function PitaLuring() {
  const [luring, setLuring] = useState(false);
  const [terakhir, setTerakhir] = useState<number | null>(null);
  useEffect(() => {
    const perbarui = () => {
      const off = typeof navigator !== "undefined" && navigator.onLine === false;
      if (!off) catatDaring();
      setLuring(off);
      setTerakhir(terakhirDaring());
    };
    perbarui();
    window.addEventListener("online", perbarui);
    window.addEventListener("offline", perbarui);
    return () => {
      window.removeEventListener("online", perbarui);
      window.removeEventListener("offline", perbarui);
    };
  }, []);
  if (!luring) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-[2147483000] bg-[#5C3D00] px-3 py-1.5 text-center text-[12.5px] font-semibold leading-snug text-white shadow">
      Tanpa sinyal{terakhir ? ` · terakhir tersambung ${teksTerakhir(terakhir)}` : ""}. Halaman dari simpanan HP; data terbaru dan menyimpan butuh sinyal.
    </div>
  );
}
