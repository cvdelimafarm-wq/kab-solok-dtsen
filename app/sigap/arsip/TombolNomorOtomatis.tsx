"use client";

// app/sigap/arsip/TombolNomorOtomatis.tsx
//
// (7 Nov 2026) Tombol "Nomor otomatis" untuk dokumen yang dibuat di dalam SIGAP: surat tugas translok (halaman Penugasan) dan dokumen turunan
// identifikasi lanjutan (undangan, surat pengantar ke nagari, surat tugas). Memanggil POST /api/sigap/arsip/ambil dengan izin yang sama dengan mengurus dokumen itu.
// Idempoten: dokumen yang sama selalu mendapat nomor yang sama selama nomornya belum dibatalkan di menu Arsip.
//
// Kode klasifikasi arsip mengikuti Perka BPS 99/2018 dan dipilih menurut ISI surat (pokok masalah), bukan menurut kegiatan: mis. surat tugas pelatihan petugas
// memakai VS.220, surat tugas pengumpulan data VS.330. Karena itu pemilih kode selalu tampil untuk pola nomor yang memuat {kka}.
//
// Pemakaian:
//   Penugasan : <TombolNomorOtomatis badan={{ untuk: "st", penugasan_id: id, tanggal }} jenisArsip="st" onNomor={setNomor} />
//   Lanjutan  : <TombolNomorOtomatis badan={{ untuk: "lanjutan", ident, jenis: "pengantar", kunci, tanggal }} jenisArsip={JENIS_ARSIP_LANJUTAN.pengantar} onNomor={...} />

import { useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../admin/api";
import { BTN_O } from "../admin/ui";
import PilihKodeArsip, { kodeTerpilihSah, type OpsiFungsi, type OpsiKode } from "./PilihKodeArsip";

type Pilihan = { kode: OpsiKode[]; fungsi: OpsiFungsi[]; sering: string[]; jenis: { kode: string; nama: string; kka_bawaan: string | null; format: string }[] };

export default function TombolNomorOtomatis({ badan, jenisArsip, bolehUbah = true, onNomor }: {
  /** Isi permintaan ke /api/sigap/arsip/ambil (tanpa kka; kka ditambahkan dari pemilih). */
  badan: Record<string, unknown>;
  /** Kode jenis arsip yang dipakai (st, undangan, pengantar_nagari, ...), untuk mengetahui apakah polanya memuat {kka}. */
  jenisArsip: string;
  bolehUbah?: boolean;
  onNomor: (nomor: string) => void;
}) {
  const [pilihan, setPilihan] = useState<Pilihan | null>(null);
  const [kka, setKka] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!bolehUbah) return;
    let batal = false;
    fetchJson<Pilihan>("/api/sigap/arsip/ambil")
      .then((p) => { if (!batal) setPilihan(p); })
      .catch((e) => { if (!batal && !(e instanceof SesiBerakhir)) setGalat(pesanGalat(e)); });
    return () => { batal = true; };
  }, [bolehUbah]);

  if (!bolehUbah) return null;
  const j = pilihan?.jenis.find((x) => x.kode === jenisArsip) ?? null;
  const pakaiKka = !!j && j.format.includes("{kka}");
  const kkaEfektif = kka.trim().toUpperCase() || j?.kka_bawaan || "";
  const siap = !!pilihan && (!pakaiKka || (!!kkaEfektif && kodeTerpilihSah(pilihan.kode, kkaEfektif)));

  async function ambil() {
    setSibuk(true);
    setGalat(null);
    setInfo(null);
    try {
      const r = await fetchJson<{ nomor: string; sudah_ada: boolean }>("/api/sigap/arsip/ambil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...badan, kka: pakaiKka ? kkaEfektif || undefined : undefined }),
      });
      onNomor(r.nomor);
      setInfo(r.sudah_ada ? "Dokumen ini sudah punya nomor; nomor yang sama dipakai." : "Nomor diambil dan tercatat di menu Arsip.");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {pakaiKka && pilihan && (
        <PilihKodeArsip kode={pilihan.kode} fungsi={pilihan.fungsi} sering={pilihan.sering} nilai={kka} onUbah={setKka} bawaan={j?.kka_bawaan ?? null} wajib={!j?.kka_bawaan} />
      )}
      <div>
        <button type="button" className={BTN_O} disabled={sibuk || !siap} onClick={() => void ambil()} title="Ambil nomor berikutnya dari buku nomor (menu Arsip)">
          {sibuk ? "Mengambil…" : "Nomor otomatis"}
        </button>
      </div>
      {galat && <span role="alert" className="text-[12px] font-semibold text-[#B42329]">{galat}</span>}
      {info && <span className="text-[12px] text-[#13794B]">{info}</span>}
    </div>
  );
}
