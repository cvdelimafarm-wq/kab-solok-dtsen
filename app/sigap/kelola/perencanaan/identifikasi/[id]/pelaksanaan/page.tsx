"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/pelaksanaan/page.tsx
//
// (25 Okt 2026, tahap 31) Pelaksanaan: menautkan identifikasi ke kegiatan SIGAP, menerapkan usulan penugasan dari identifikasi lanjutan Final, memantau laporan
// harian dan jadwal, bahan evaluasi, serta kesiapan Bendahara. Semua peringatan tidak memblokir. Data: tampilan keu_v_ident_kegiatan, keu_v_kegiatan_calon, dan fungsi
// keu_pelaksanaan_bahan, keu_usulan_penugasan (baca); keu_ident_kegiatan_tautkan/lepas dan keu_usulan_terapkan (tulis, hak ditegakkan basis data).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { normalisasi } from "@/lib/keu/identifikasi";
import { jadwalPendataan, normalisasiLanjutan, rincianBiaya } from "@/lib/keu/lanjutan";
import { kesiapanBiaya, kesiapanPencairan, normalisasiHasilTerap, type FungsiKegiatan, type HasilTerap } from "@/lib/keu/pelaksanaan";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { hariIniWib, useIdent } from "../../useIdent";
import { loncat } from "../../Kontrol";
import { useLanjutan } from "../lanjutan/useLanjutan";
import { KartuBendahara, KartuEvaluasi, KartuLaporan, KartuTautan, KartuUsulan } from "./Kartu";
import { usePelaksanaan } from "./usePelaksanaan";

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);
  const pl = usePelaksanaan(id);
  const [versi, setVersi] = useState(0);
  const [hasil, setHasil] = useState<HasilTerap | null>(null);
  const muatSemua = useCallback(async () => { await Promise.all([ident.muatSemua(), lj.muatSemua(), pl.muatSemua()]); setVersi((v) => v + 1); }, [ident, lj, pl]);
  const kirim = useKirim(muatSemua);

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const tersimpan = lj.row;
  const isi = useMemo(() => (tersimpan ? normalisasiLanjutan(tersimpan.isi) : null), [tersimpan]);
  const hariIni = hariIniWib();
  const terkunci = !row || row.ver < 1 || row.status === "dibatalkan";
  const bisa = ident.hak.susun && !terkunci;

  const jadwal = useMemo(
    () => (formSah && row ? jadwalPendataan(formSah, row.tahun, (row.upd ?? null) as Record<string, { mulai: string; selesai: string }> | null) : []),
    [formSah, row],
  );
  const rincian = useMemo(() => (isi && formSah ? rincianBiaya(isi, formSah, lj.lembar?.isi ?? null) : []), [isi, formSah, lj.lembar]);
  const biaya = useMemo(() => (pl.bahan ? kesiapanBiaya(rincian, pl.bahan.realisasi, pl.bahan.realisasi_sampai) : null), [rincian, pl.bahan]);
  const syarat = useMemo(() => kesiapanPencairan({
    isi, status: tersimpan?.status ?? null, kebijakanVer: tersimpan?.kebijakan_ver ?? lj.lembar?.ver ?? null, kegiatanTertaut: pl.tertaut.length,
    penugasanSigap: (pl.bahan?.kegiatan ?? []).reduce((s, k) => s + k.petugas.filter((t) => t.aktif).length, 0),
    suratTerbit: lj.dokumen.filter((d) => d.jenis === "tugas" && d.status === "terbit").length,
    biaya: biaya ? { adaLaporan: biaya.adaLaporan, kurang: biaya.kurang } : null,
  }), [isi, tersimpan, lj.lembar, lj.dokumen, pl.tertaut, pl.bahan, biaya]);

  const tautkan = useCallback((kegiatanId: number, fungsi: FungsiKegiatan, catatan: string) => kirim.jalankan(() => aksiKeu("keu_ident_kegiatan_tautkan", {
    p_ident: id, p_kegiatan: kegiatanId, p_fungsi: fungsi, ...(catatan ? { p_catatan: catatan } : {}),
  })), [id, kirim]);
  const lepas = useCallback((kegiatanId: number) => kirim.jalankan(() => aksiKeu("keu_ident_kegiatan_lepas", { p_ident: id, p_kegiatan: kegiatanId })), [id, kirim]);
  const terapkan = useCallback(async (kegiatanId: number, kode: string[]) => {
    setHasil(null);
    let h: HasilTerap | null = null;
    const ok = await kirim.jalankan(async () => {
      const r = await aksiKeu<unknown>("keu_usulan_terapkan", { p_ident: id, p_kegiatan: kegiatanId, p_kode: kode });
      if (r.ok) h = normalisasiHasilTerap(r.data);
      return r;
    });
    if (ok) setHasil(h);
    return ok;
  }, [id, kirim]);

  // alamat dengan #kartu (mis. dari halaman Gap): menggulir ke kartu itu sekali, sesudah isi halaman muncul
  const sudahLoncat = useRef(false);
  const tampil = !!row && !!formSah && !pl.memuat;
  useEffect(() => {
    if (!tampil || sudahLoncat.current || typeof window === "undefined") return;
    const h = window.location.hash.replace(/^#/, "");
    if (!/^pl-[a-z]+$/.test(h)) return;
    sudahLoncat.current = true;
    window.setTimeout(() => { loncat(h); }, 150);
  }, [tampil]);

  const ro = row?.ro_kode ?? "";
  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Pelaksanaan"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Pelaksanaan"]}
      judul={row ? <>Pelaksanaan: {row.nama}</> : "Pelaksanaan"}
      sub={row ? <>RO {ro} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      kembali={{ induk: id ? `/sigap/kelola/perencanaan/identifikasi/${id}/lanjutan` : "/sigap/kelola/perencanaan/identifikasi", label: "Identifikasi lanjutan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? lj.galat ?? pl.galat} />
        {(ident.memuat || lj.memuat || pl.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Pelaksanaan dapat dipantau sesudah identifikasi awal disahkan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; halaman hanya dapat dibaca.</Catatan>}
        {row && !tersimpan && !lj.memuat && row.ver >= 1 && (
          <Catatan>Identifikasi lanjutan belum disimpan. <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/lanjutan`} className="font-semibold text-[#1F5FD1] underline">Susun identifikasi lanjutan →</Link></Catatan>
        )}
        {row && formSah && !pl.memuat && (
          <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <KartuTautan tertaut={pl.tertaut} calon={pl.calon} bisa={bisa} mengirim={kirim.mengirim} galat={kirim.galat} onTautkan={tautkan} onLepas={lepas} />
              <KartuUsulan
                identId={row.id} tertaut={pl.tertaut} bisa={bisa} final={tersimpan?.status === "final"} ada={!!tersimpan} versi={versi}
                mengirim={kirim.mengirim} galat={null} hasil={hasil} onTerapkan={terapkan}
              />
              <KartuLaporan kegiatan={pl.bahan?.kegiatan ?? []} jadwal={jadwal} hariIni={hariIni} />
            </div>
            <div className="flex min-w-0 flex-col gap-3.5 xl:sticky xl:top-[68px] xl:max-h-[calc(100vh-84px)] xl:overflow-y-auto xl:pr-1 xl:[scrollbar-width:thin]">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
                <Chip warna={tersimpan?.status === "final" ? "hijau" : "kuning"}>{tersimpan ? `Lanjutan ${tersimpan.status === "final" ? "Final" : "Draf"} v${tersimpan.ver}` : "Lanjutan belum ada"}</Chip>
                <Chip warna="biru">{pl.tertaut.length} kegiatan tertaut</Chip>
                <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/gap`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Gap rencana dan pelaksanaan →</Link>
                <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/kebutuhan`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Rekrutmen dan pengadaan →</Link>
              </div>
              <KartuEvaluasi form={formSah} kegiatan={pl.bahan?.kegiatan ?? []} hariIni={hariIni} />
              <KartuBendahara baris={biaya?.baris ?? []} adaLaporan={biaya?.adaLaporan ?? false} sampai={pl.bahan?.realisasi_sampai ?? null} syarat={syarat} />
            </div>
          </div>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanPelaksanaan() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
