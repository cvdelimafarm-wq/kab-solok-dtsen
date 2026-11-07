"use client";

// app/sigap/arsip/TombolNomorOtomatis.tsx
//
// (7 Nov 2026) Tombol "Nomor otomatis" untuk dokumen turunan identifikasi lanjutan (undangan, surat pengantar ke nagari, surat tugas).
// Memanggil POST /api/sigap/arsip/ambil { untuk:"lanjutan" } dengan izin yang sama dengan menyusun/menyetujui dokumen itu (ketua tim, admin RO, PPK, TU RO).
// Idempoten: dokumen yang sama selalu mendapat nomor yang sama selama nomornya belum dibatalkan di menu Arsip.
// Bila jenis dokumen tidak punya kode arsip bawaan (mis. surat pengantar ke nagari), tombol meminta kode arsip lebih dulu.
//
// Pemakaian di halaman dokumen lanjutan (ganti isian "Nomor surat (diisi manual)"):
//   <TombolNomorOtomatis ident={identId} jenis="pengantar" kunci={kunciDokumen} tanggal={tanggalSurat} bolehUbah={bolehUbah} onNomor={(n) => setNomorSurat(n)} />

import { useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../admin/api";
import { BTN_O, INPUT } from "../admin/ui";
import { JENIS_ARSIP_LANJUTAN } from "@/lib/arsip/nomor";

type Pilihan = { kode: { kode: string; nama: string }[]; jenis: { kode: string; nama: string; kka_bawaan: string | null; format: string }[] };

export default function TombolNomorOtomatis({ ident, jenis, kunci, tanggal, bolehUbah = true, onNomor }: {
  ident: number;
  jenis: keyof typeof JENIS_ARSIP_LANJUTAN;
  /** Pengenal dokumen yang stabil (mis. id kelas/nagari/penugasan) agar satu dokumen tidak mengambil dua nomor. */
  kunci: string;
  /** Tanggal surat (YYYY-MM-DD); kosong = hari ini. Tahun nomor mengikuti tanggal ini. */
  tanggal?: string | null;
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
  const jenisArsip = pilihan?.jenis.find((j) => j.kode === JENIS_ARSIP_LANJUTAN[jenis]) ?? null;
  const perluPilihKka = !!jenisArsip && jenisArsip.format.includes("{kka}") && !jenisArsip.kka_bawaan;

  async function ambil() {
    setSibuk(true);
    setGalat(null);
    setInfo(null);
    try {
      const r = await fetchJson<{ nomor: string; sudah_ada: boolean }>("/api/sigap/arsip/ambil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ untuk: "lanjutan", ident, jenis, kunci, tanggal: tanggal || undefined, kka: kka || undefined }),
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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {perluPilihKka && (
          <select aria-label="Kode arsip" className={INPUT} value={kka} onChange={(e) => setKka(e.target.value)}>
            <option value="">Pilih kode arsip…</option>
            {pilihan?.kode.map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}
          </select>
        )}
        <button type="button" className={BTN_O} disabled={sibuk || !pilihan || (perluPilihKka && !kka)} onClick={() => void ambil()} title="Ambil nomor berikutnya dari buku nomor (menu Arsip)">
          {sibuk ? "Mengambil…" : "Nomor otomatis"}
        </button>
      </div>
      {galat && <span role="alert" className="text-[12px] font-semibold text-[#B42329]">{galat}</span>}
      {info && <span className="text-[12px] text-[#13794B]">{info}</span>}
    </div>
  );
}
