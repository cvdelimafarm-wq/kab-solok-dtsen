"use client";

// app/sigap/pelatihan/kartuKelas.tsx
//
// (1 Nov 2026) Kartu "Kelas Anda" di halaman Langkah peserta: mode (daring/luring/hybrid), jadwal, tempat, dan apa artinya bagi presensi.
// Data dari perencanaan (identifikasi lanjutan yang tertaut ke kegiatan). Tidak tampil bila belum tertaut. API: /api/sigap/pelatihan/kelas.

import { useEffect, useState } from "react";
import { fetchJson, urlPelatihan } from "../admin/api";
import { Chip, Kartu } from "../admin/ui";
import { rentangTanggal, type AturanMode, type CaraKelas, type KelasInfo } from "@/lib/sigapKelasIdent";

type Jawab = { tersedia: boolean; tersambung: boolean; peran?: string; cara?: CaraKelas; kelas?: KelasInfo | null; kandidat?: KelasInfo[]; aturan?: AturanMode | null };

const WARNA = { Daring: "navy", Luring: "ok", Hybrid: "wait" } as const;

export default function KartuKelas() {
  const [d, setD] = useState<Jawab | null>(null);
  useEffect(() => {
    let batal = false;
    fetchJson<Jawab>(urlPelatihan("/api/sigap/pelatihan/kelas"))
      .then((r) => !batal && setD(r))
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);
  if (!d?.tersedia || !d.tersambung) return null;

  if (!d.kelas) {
    return (
      <Kartu judul="🏫 Kelas Anda" ket="Pembagian kelas belum final">
        <p className="text-[13px] text-[#5B6B84]">
          {d.cara === "tidak_pasti" ? "Panitia belum menetapkan Anda ke salah satu kelas. Pilihan kelas untuk peran Anda:" : "Belum ada kelas yang memuat peran Anda pada perencanaan. Hubungi panitia."}
        </p>
        {(d.kandidat ?? []).length > 0 && (
          <ul className="mt-1.5 space-y-1 text-[13px] text-[#0F2A52]">
            {(d.kandidat ?? []).map((k) => (
              <li key={k.id}>
                <strong>{k.nama}</strong> · {k.metode || "bentuk belum diisi"} · {rentangTanggal(k.mulai, k.selesai)}
              </li>
            ))}
          </ul>
        )}
      </Kartu>
    );
  }
  const k = d.kelas;
  const a = d.aturan;
  return (
    <Kartu
      judul="🏫 Kelas Anda"
      ket={`${k.nama} · ${rentangTanggal(k.mulai, k.selesai)}${k.hari > 1 ? ` (${k.hari} hari)` : ""}`}
      kanan={k.metode ? <Chip w={WARNA[k.metode]}>{k.metode}</Chip> : <Chip w="mut">Bentuk belum diisi</Chip>}
    >
      {k.lokasi && <p className="text-[13px] font-semibold text-[#0F2A52]">📍 {k.lokasi}</p>}
      {a ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-[#44546F]">
          {a.petunjuk.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-[#5B6B84]">Bentuk kelas (daring atau luring) belum ditetapkan panitia.</p>
      )}
      {d.cara === "otomatis" && <p className="mt-2 text-[12px] text-[#7B8794]">Kelas ini satu-satunya yang memuat peran Anda.</p>}
    </Kartu>
  );
}
