"use client";

import { useEffect, useState } from "react";
import { bacaSesi } from "@/app/sigap/admin/api";

// (9 Okt 2026) /sigap/kelola -- permintaan user: alamat pengelolaan diseragamkan menjadi /sigap/kelola/<modul>.
// Halaman induk ini langsung membuka modul kelola PERTAMA yang diizinkan untuk akun (keputusan user: "langsung ke
// modul pertama"); pindah modul lewat sidebar. Tanpa izin kelola apa pun -> kembali ke Beranda.

type Saya = {
  izin?: Record<string, { level: "lihat" | "kelola" }>;
  admin?: boolean;
  kontrak?: boolean;
  kelola_akses?: boolean;
  pelatihan_kelola?: boolean;
};

function modulPertama(s: Saya): string {
  const izin = s.izin ?? {};
  if (s.pelatihan_kelola) return "/sigap/kelola/pelatihan";
  if (s.admin) return "/sigap/kelola/translok";
  if (s.kontrak) return "/sigap/kelola/pengadaan";
  if (izin["pedia.kelola"]) return "/sigap/kelola/pedia";
  if (s.kelola_akses) return "/sigap/kelola/akses";
  if (izin["portal.kelola"]?.level === "kelola" || izin["translok.kegiatan"]?.level === "kelola") return "/sigap/kelola/aplikasi";
  return "/";
}

export default function KelolaInduk() {
  const [pesan, setPesan] = useState("Membuka halaman pengelolaan…");

  useEffect(() => {
    const sesi = bacaSesi();
    if (!sesi) {
      window.location.replace(`/?lanjut=${encodeURIComponent("/sigap/kelola")}`);
      return;
    }
    fetch("/api/sigap/saya", { headers: { Authorization: `Bearer ${sesi}` }, cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return window.location.replace(`/?lanjut=${encodeURIComponent("/sigap/kelola")}`);
        if (!r.ok) throw new Error();
        window.location.replace(modulPertama((await r.json()) as Saya));
      })
      .catch(() => setPesan("Gagal memuat menu pengelolaan. Periksa koneksi, lalu muat ulang halaman."));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEF2F8] px-4 text-[14px] text-[#55657D]">
      <p>{pesan}</p>
    </main>
  );
}
