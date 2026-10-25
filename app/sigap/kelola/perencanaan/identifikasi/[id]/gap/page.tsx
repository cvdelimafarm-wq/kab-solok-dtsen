"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/gap/page.tsx
//
// (25 Okt 2026, tahap 32) Peringatan pelaksanaan dan laporan Gap: rencana pada identifikasi lanjutan dibanding kenyataan di SIGAP (penugasan, laporan harian, jadwal,
// pagu, evaluasi). Temuan dihitung di sini (lib/keu/gap.ts) dari bahan yang dibaca lewat keu_pelaksanaan_bahan, disimpan berversi lewat keu_gap_simpan, dan
// ditanggapi lewat keu_gap_tanggapi. Tidak memblokir apa pun; temuan keras baru diberitahukan ke PPK.

import { Suspense, useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { normalisasi } from "@/lib/keu/identifikasi";
import { jadwalPendataan, normalisasiLanjutan, rincianBiaya } from "@/lib/keu/lanjutan";
import { hitungGap, layakLaporanAkhir, ringkasGap, sidikTemuan, type JenisGap, type MasukanGap } from "@/lib/keu/gap";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { hariIniWib, useIdent } from "../../useIdent";
import { useLanjutan } from "../lanjutan/useLanjutan";
import { usePelaksanaan } from "../pelaksanaan/usePelaksanaan";
import { KartuBanding, KartuSimpanGap, KartuTemuanSaatIni, KartuVersiGap } from "./Kartu";
import { useGap, type StatusTanggapan } from "./useGap";

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);
  const pl = usePelaksanaan(id);
  const gap = useGap(id);
  const muatSemua = useCallback(async () => { await Promise.all([ident.muatSemua(), lj.muatSemua(), pl.muatSemua(), gap.muatSemua()]); }, [ident, lj, pl, gap]);
  const kirim = useKirim(muatSemua);
  const [pesan, setPesan] = useState<string | null>(null);

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const tersimpan = lj.row;
  const isi = useMemo(() => (tersimpan ? normalisasiLanjutan(tersimpan.isi) : null), [tersimpan]);
  const hariIni = hariIniWib();
  const terkunci = !row || row.ver < 1 || row.status === "dibatalkan";
  const bisa = (ident.hak.susun || ident.hak.ppk || ident.hak.kpa) && !terkunci && !!tersimpan;

  const masukan = useMemo<MasukanGap | null>(() => {
    if (!row || !formSah) return null;
    const jadwal = jadwalPendataan(formSah, row.tahun, (row.upd ?? null) as Record<string, { mulai: string; selesai: string }> | null);
    return {
      form: formSah, isi, pascaH15: !!tersimpan?.pasca_h15, bahan: pl.bahan, jadwal, hariIni,
      rincian: isi ? rincianBiaya(isi, formSah, lj.lembar?.isi ?? null) : [],
    };
  }, [row, formSah, isi, tersimpan, pl.bahan, lj.lembar, hariIni]);
  const siap = !!masukan && !!pl.bahan && !pl.memuat && !lj.memuat;
  const temuan = useMemo(() => (masukan && siap ? hitungGap(masukan) : []), [masukan, siap]);
  const ringkas = useMemo(() => (masukan ? ringkasGap(masukan) : null), [masukan]);
  const layakAkhir = useMemo(() => layakLaporanAkhir(pl.bahan, hariIni), [pl.bahan, hariIni]);

  const terbaru = gap.versi[0] ?? null;
  const sidik = useMemo(() => sidikTemuan(temuan), [temuan]);
  const sama = useMemo(() => {
    const cocok = (j: JenisGap) => (terbaru && terbaru.jenis === j && sidikTemuan(terbaru.temuan) === sidik ? terbaru.ver : null);
    return { berjalan: cocok("berjalan"), akhir: cocok("akhir") };
  }, [terbaru, sidik]);

  const simpan = useCallback(async (jenis: JenisGap) => {
    setPesan(null);
    let hasil: { ver: number; baru_keras: number; tanpa_perubahan: boolean } | null = null;
    const ok = await kirim.jalankan(async () => {
      const r = await aksiKeu<{ ver: number; baru_keras: number; tanpa_perubahan: boolean }>("keu_gap_simpan", {
        p_ident: id, p_jenis: jenis, p_temuan: temuan, p_ringkas: ringkas ?? {},
      });
      if (r.ok) hasil = r.data;
      return r;
    });
    if (ok && hasil) {
      const h = hasil as { ver: number; baru_keras: number; tanpa_perubahan: boolean };
      setPesan(h.tanpa_perubahan ? `Tidak ada perubahan dari versi ${h.ver}.` : `Versi ${h.ver} tersimpan.${h.baru_keras > 0 ? ` PPK diberi tahu ${h.baru_keras} temuan keras baru.` : ""}`);
    }
    return ok;
  }, [id, temuan, ringkas, kirim]);

  const tanggapi = useCallback((gapId: number, kunci: string, status: StatusTanggapan, catatan: string) =>
    kirim.jalankan(() => aksiKeu("keu_gap_tanggapi", { p_gap: gapId, p_kunci: kunci, p_status: status, ...(catatan ? { p_catatan: catatan } : {}) })), [kirim]);

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Gap pelaksanaan"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Gap pelaksanaan"]}
      judul={row ? <>Gap pelaksanaan: {row.nama}</> : "Gap pelaksanaan"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      kembali={{ induk: id ? `/sigap/kelola/perencanaan/identifikasi/${id}/pelaksanaan` : "/sigap/kelola/perencanaan/identifikasi", label: "Pelaksanaan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? lj.galat ?? pl.galat ?? gap.galat} />
        {(ident.memuat || lj.memuat || pl.memuat || gap.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Gap dapat dilihat sesudah identifikasi awal disahkan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; halaman hanya dapat dibaca.</Catatan>}
        {row && !tersimpan && !lj.memuat && row.ver >= 1 && (
          <Catatan>Identifikasi lanjutan belum disimpan, jadi rencana belum dapat dibandingkan. <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/lanjutan`} className="font-semibold text-[#1F5FD1] underline">Susun identifikasi lanjutan →</Link></Catatan>
        )}
        {row && formSah && siap && ringkas && !gap.memuat && (
          <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <KartuTemuanSaatIni identId={row.id} temuan={temuan} />
              <KartuVersiGap versi={gap.versi} tanggapan={gap.tanggapan} bisa={bisa} mengirim={kirim.mengirim} galat={null} onTanggapi={tanggapi} />
            </div>
            <div className="flex min-w-0 flex-col gap-3.5 xl:sticky xl:top-[68px]">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
                <Chip warna="biru">{pl.tertaut.length} kegiatan tertaut</Chip>
                {terbaru ? <Chip warna={terbaru.n_keras > 0 ? "merah" : "hijau"}>Terakhir disimpan: v{terbaru.ver}</Chip> : <Chip warna="abu">Belum ada versi tersimpan</Chip>}
              </div>
              <KartuBanding r={ringkas} />
              <KartuSimpanGap bisa={bisa} mengirim={kirim.mengirim} galat={kirim.galat} sama={sama} layakAkhir={layakAkhir} onSimpan={simpan} pesan={pesan} />
            </div>
          </div>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanGap() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
