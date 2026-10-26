"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/kebutuhan/page.tsx
//
// (26 Okt 2026, tahap 34) Kebutuhan hilir dari identifikasi: rekrutmen mitra dan draf pengadaan. Halaman ini hanya MEMBACA identifikasi lanjutan (atau perkiraan dari
// identifikasi awal bila lanjutan belum disimpan) dan lembar kebijakan yang berlaku; tidak ada yang tertulis, tidak ada yang memblokir. Data: keu_v_ident, keu_v_ident_lanjutan,
// keu_v_ident_dokumen, keu_v_kebijakan_berlaku (semua lewat gerbang baca). Aturan: lib/keu/rekrutmen.ts dan lib/keu/pengadaan.ts.
// (tahap 35) Satu-satunya yang tertulis: status pelacakan pengadaan per butir (keu_v_ident_pengadaan dibaca, keu_pengadaan_catat ditulis); tidak memblokir apa pun.

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat } from "@/app/sigap/keu-ui";
import { normalisasi } from "@/lib/keu/identifikasi";
import { awalLanjutan, jadwalPendataan, normalisasiLanjutan, rincianBiaya } from "@/lib/keu/lanjutan";
import { susunPengadaan } from "@/lib/keu/pengadaan";
import { ringkasRekrutmen } from "@/lib/keu/rekrutmen";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { hariIniWib, useIdent } from "../../useIdent";
import { loncat } from "../../Kontrol";
import { useLanjutan } from "../lanjutan/useLanjutan";
import { ID_KB, KartuPengadaan, KartuRekrutmen } from "./Kartu";
import { useStatusPengadaan } from "./useStatusPengadaan";

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);
  const sp = useStatusPengadaan(id);
  const hariIni = hariIniWib();

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const tersimpan = lj.row;
  const dariAwal = !tersimpan;
  const isi = useMemo(() => (tersimpan ? normalisasiLanjutan(tersimpan.isi) : formSah && row ? awalLanjutan(formSah, row.tahun) : null), [tersimpan, formSah, row]);
  const upd = useMemo(() => ((row?.upd ?? null) as Record<string, { mulai: string; selesai: string }> | null), [row]);
  const jadwal = useMemo(() => (formSah && row ? jadwalPendataan(formSah, row.tahun, upd) : []), [formSah, row, upd]);
  const rincian = useMemo(() => (isi && formSah ? rincianBiaya(isi, formSah, lj.lembar?.isi ?? null) : []), [isi, formSah, lj.lembar]);

  const rekrutmen = useMemo(() => (isi ? ringkasRekrutmen(isi, lj.dokumen, jadwal, hariIni) : null), [isi, lj.dokumen, jadwal, hariIni]);
  const pengadaan = useMemo(() => (isi && formSah && row ? susunPengadaan(isi, formSah, row.tahun, upd, jadwal, rincian) : []), [isi, formSah, row, upd, jadwal, rincian]);

  // alamat dengan #kartu (mis. dari kartu "Dibaca modul hilir"): menggulir ke kartu itu sekali, sesudah isi halaman muncul
  const sudahLoncat = useRef(false);
  const tampil = !!row && !!isi && !!rekrutmen && !ident.memuat && !lj.memuat;
  useEffect(() => {
    if (!tampil || sudahLoncat.current || typeof window === "undefined") return;
    const h = window.location.hash.replace(/^#/, "");
    if (h !== ID_KB.rekrutmen && h !== ID_KB.pengadaan) return;
    sudahLoncat.current = true;
    window.setTimeout(() => { loncat(h); }, 150);
  }, [tampil]);

  const ro = row?.ro_kode ?? "";
  const halamanIni = id ? `/sigap/kelola/perencanaan/identifikasi/${id}/kebutuhan` : "/sigap/kelola/perencanaan/identifikasi";
  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Rekrutmen dan pengadaan"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Rekrutmen dan pengadaan"]}
      judul={row ? <>Rekrutmen dan pengadaan: {row.nama}</> : "Rekrutmen dan pengadaan"}
      sub={row ? <>RO {ro} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      kembali={{ induk: id ? `/sigap/kelola/perencanaan/identifikasi/${id}/lanjutan` : "/sigap/kelola/perencanaan/identifikasi", label: "Identifikasi lanjutan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? lj.galat} />
        {(ident.memuat || lj.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Rekrutmen dan pengadaan dapat dibaca sesudah identifikasi awal disahkan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; halaman hanya dapat dibaca.</Catatan>}
        {row && formSah && !lj.memuat && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
              <Chip warna={tersimpan ? (tersimpan.status === "final" ? "hijau" : "kuning") : "abu"}>{tersimpan ? `Lanjutan ${tersimpan.status === "final" ? "Final" : "Draf"} v${tersimpan.ver}` : "Lanjutan belum disimpan"}</Chip>
              <Chip warna={lj.lembar ? "biru" : "abu"}>{lj.lembar ? `Lembar kebijakan versi ${lj.lembar.ver}` : "Belum ada lembar kebijakan berlaku"}</Chip>
              <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/lanjutan`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Identifikasi lanjutan →</Link>
            </div>
            {tersimpan && tersimpan.status !== "final" && <Catatan>Lanjutan masih Draf: ada isian Perkiraan atau nama petugas yang menyusul, jadi daftar di bawah dapat berubah.</Catatan>}
            {dariAwal && <Catatan>Identifikasi lanjutan belum disimpan. Daftar di bawah diturunkan dari identifikasi awal (semua kelas Perkiraan dan nama petugas menyusul); susun lanjutan agar menjadi data Fix.</Catatan>}
            {!lj.lembar && lj.lembarSiap && <Catatan>Belum ada lembar kebijakan yang berlaku, jadi tarif dan nilai pengadaan belum dapat dihitung.</Catatan>}
            {rekrutmen && isi && (
              <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <KartuRekrutmen identId={row.id} r={rekrutmen} dariAwal={dariAwal} />
                <KartuPengadaan identId={row.id} ro={ro} judul={row.nama} daftar={pengadaan} hariIni={hariIni} dariAwal={dariAwal} halamanIni={halamanIni} pelacakan={{ tersedia: sp.tersedia, peta: sp.peta, mengirim: sp.mengirim, galat: sp.galat, hapusGalat: sp.hapusGalat, catat: sp.catat }} />
              </div>
            )}
          </>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanKebutuhan() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
