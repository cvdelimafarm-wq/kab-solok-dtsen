"use client";

// app/sigap/pelatihan/kartuKuisPra.tsx
//
// (31 Okt 2026) Kartu "Kuis pra pelatihan" di halaman Langkah peserta. Mengambil statusnya sendiri; tidak tampil bila kuis pra belum diaktifkan panitia atau akun bukan peserta.

import { useEffect, useState } from "react";
import { fetchJson, urlPelatihan } from "../admin/api";
import { Chip, Kartu } from "../admin/ui";
import type { StatusKuisPra } from "@/lib/sigapKuisPra";

type Ringkas = { tersedia: boolean; pengaturan?: { jumlah_soal: number; nilai_lulus: number }; status?: StatusKuisPra };

export default function KartuKuisPra() {
  const [d, setD] = useState<Ringkas | null>(null);
  useEffect(() => {
    let batal = false;
    fetchJson<Ringkas>(urlPelatihan("/api/sigap/kuis-pra"))
      .then((r) => !batal && setD(r))
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);
  if (!d?.tersedia || !d.status || d.status.status === "nonaktif") return null;
  const s = d.status;
  const aksi = s.status === "bisa_mulai" || s.status === "lanjut";
  return (
    <Kartu
      judul="🧠 Kuis pra pelatihan"
      ket={`${d.pengaturan?.jumlah_soal ?? ""} soal sesuai temuan anomali Anda · nilai lulus ${d.pengaturan?.nilai_lulus ?? ""}`}
      kanan={<Chip w={s.status === "lulus" ? "ok" : s.status === "habis" ? "bad" : s.status === "belum_buka" || s.status === "ditutup" ? "mut" : "wait"}>{s.status === "lulus" ? "Lulus" : s.status === "habis" ? "Kesempatan habis" : s.status === "belum_buka" ? "Belum dibuka" : s.status === "ditutup" ? "Ditutup" : s.status === "lanjut" ? "Sedang mengerjakan" : "Siap dikerjakan"}</Chip>}
    >
      <p className="text-[13px] text-[#5B6B84]">{s.terbaik !== null ? `Nilai terbaik Anda: ${s.terbaik}.` : "Kerjakan sebelum pelatihan agar kesalahan lapangan yang sama tidak terulang."}</p>
      <a href="/sigap/pelatihan/kuis-pra" className={`mt-2 inline-block text-[13px] font-bold ${aksi ? "text-[#1F6FD1]" : "text-[#55657D]"}`}>
        {aksi ? (s.status === "lanjut" ? "Lanjutkan kuis →" : "Kerjakan kuis →") : "Lihat hasil →"}
      </a>
    </Kartu>
  );
}
