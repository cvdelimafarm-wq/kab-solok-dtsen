"use client";

// app/sigap/pelatihan/instrumen/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan > tab "Instrumen": kuesioner, buku pedoman, dan PPT materi pelatihan yang dapat diunduh peserta.
// (2 Nov 2026) Unggah dipindah ke Kelola Pelatihan > Persiapan > Instrumen (halaman ini hanya untuk membuka). Berkas boleh lebih dari satu per jenis.
// Berkas yang pernah diunduh disimpan di HP: lain kali langsung terbuka tanpa unduh ulang (lib/berkasLokal.ts), dan kartunya menunjukkan statusnya.

import Link from "next/link";
import { useEffect, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir, tglSedang } from "../../admin/api";
import { useDataPel } from "../dataPel";
import { BTN, BTN_G, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Kerangka } from "../komponen";
import BagianMateri from "./BagianMateri"; // (2 Nov 2026) Tahap C: video + tautan wajib dilacak
import { JudulIkon } from "./IkonInstrumen"; // (2 Nov 2026) ikon SVG menggantikan emoji
import { unduhBerkas } from "./unduhBerkas";
import { idBerkasTersimpan } from "@/lib/berkasLokal";
import { GRUP_BERKAS, ukuranTeks, type BerkasInstrumen } from "@/lib/instrumenBerkas";

type Daftar = { boleh_kelola: boolean; berkas: BerkasInstrumen[] };

const URL_INSTRUMEN = "/api/sigap/pelatihan/instrumen";
const TAUTAN_KELOLA = "/sigap/kelola/pelatihan?tab=persiapan&sub=instrumen";

export default function HalamanInstrumen() {
  // (3 Nov 2026) Daftar berkas lewat simpanan bersama (dataPel.ts): pindah ke tab ini langsung menampilkan daftar terakhir, lalu diperbarui di belakang.
  const { data, galat: galatMuat } = useDataPel<Daftar>(URL_INSTRUMEN);
  const [galatLain, setGalatLain] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [diHp, setDiHp] = useState<Set<number>>(new Set());
  const galat = galatLain ?? (data ? null : galatMuat); // gagal memperbarui di belakang tidak mengganggu daftar yang sudah tampil
  const setGalat = setGalatLain;

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void idBerkasTersimpan().then(setDiHp);
  }, []);

  async function buka(b: BerkasInstrumen) {
    setSibuk(b.id);
    setGalat(null);
    setInfo(null);
    try {
      const h = await unduhBerkas(b);
      setDiHp(await idBerkasTersimpan());
      if (!h.dibuka) setInfo(`Browser memblokir tab baru. Ketuk "Buka" sekali lagi${h.tersimpan ? " (berkas sudah tersimpan di HP)" : ""}.`);
      else if (h.dari === "server" && !h.tersimpan) setInfo("Berkas dibuka, tetapi tidak dapat disimpan di HP ini; lain kali akan diunduh lagi.");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  const semuaKosong = !!data && data.berkas.length === 0;

  return (
    <Kerangka aktif="instrumen" judul="Instrumen Pelatihan" sub="Video, tautan, kuesioner, buku pedoman, dan PPT materi" langkah="instrumen">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="info" onTutup={() => setInfo(null)}>{info}</Pesan>}
      <BagianMateri />
      {!data && !galat && <Memuat />}
      {data && data.boleh_kelola && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#CBD6E6] bg-[#F5F8FE] px-3 py-2 text-[13px] text-[#34455F]">
          <span>{semuaKosong ? "Belum ada berkas yang diunggah." : "Mengunggah atau menyembunyikan berkas dilakukan di Kelola Pelatihan."}</span>
          <Link href={TAUTAN_KELOLA} className="inline-flex min-h-[40px] items-center rounded-full bg-[#1F5FD1] px-4 text-[13px] font-extrabold text-white">
            Unggah di Kelola Pelatihan →
          </Link>
        </div>
      )}
      {data &&
        GRUP_BERKAS.map((g) => {
          const daftar = data.berkas.filter((b) => b.jenis === g.jenis);
          return (
            <Kartu
              key={g.jenis}
              judul={<JudulIkon kunci={g.jenis} teks={g.judul} />}
              ket={g.ket}
              kanan={<Chip w={daftar.length > 0 ? "ok" : "mut"}>{daftar.length > 0 ? `${daftar.length} berkas` : "Belum diunggah"}</Chip>}
            >
              {daftar.length === 0 ? (
                <p className="rounded-lg bg-[#F6F8FB] px-3 py-2.5 text-[13px] text-[#6B7A90]">{g.kosong}</p>
              ) : (
                <ul className="space-y-2">
                  {daftar.map((b) => {
                    const tersimpan = diHp.has(b.id);
                    return (
                      <li key={b.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${tersimpan ? "border-[#BFE5D0] bg-[#F5FBF8]" : "border-[#DDE6F3]"}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold leading-snug">{b.judul}</p>
                          <p className="text-[11.5px] text-[#6B7A90]">
                            {b.nama_file}
                            {b.ukuran ? ` · ${ukuranTeks(b.ukuran)}` : ""} · diunggah {tglSedang(b.diunggah_at)}
                          </p>
                          <p className="mt-1">
                            <Chip w={tersimpan ? "ok" : "mut"}>{tersimpan ? "✓ Sudah diunduh · tersimpan di HP" : "Belum diunduh"}</Chip>
                          </p>
                        </div>
                        {/* (3 Nov 2026) dua keadaan dibedakan jelas: biru "Unduh" (belum ada di HP) dan hijau "Buka" (sudah tersimpan, langsung terbuka tanpa unduh) */}
                        <button type="button" className={`${tersimpan ? BTN_G : BTN} min-h-[44px] min-w-[112px] !px-4 !text-[14px] !font-extrabold`} disabled={sibuk === b.id} onClick={() => void buka(b)}>
                          {sibuk === b.id ? "Menyiapkan…" : tersimpan ? "↗ Buka" : "⬇ Unduh"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Kartu>
          );
        })}
    </Kerangka>
  );
}
