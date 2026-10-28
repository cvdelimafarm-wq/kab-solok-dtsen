"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/page.tsx
//
// (25 Okt 2026, tahap 29) Identifikasi lanjutan: mengubah perkiraan identifikasi awal menjadi data Fix (kelas, jumlah dan nama petugas, jabatan, sumber mitra,
// translok dan penginapan), lengkap dengan peringatan terhadap lembar kebijakan, rincian kebutuhan, dan dokumen turunan. Data dibaca lewat gerbang baca
// (keu_v_ident_lanjutan*), ditulis lewat keu_lanjutan_simpan (hak ditegakkan basis data). Aturan: lib/keu/lanjutan.ts.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { normalisasi, sesudahH15, tanggalH15, tglIndo } from "@/lib/keu/identifikasi";
import { alasanDraf, awalLanjutan, normalisasiLanjutan, peringatanLanjutan, periksaLanjutan, rincianBiaya, statusLanjutan, type IsiLanjutan } from "@/lib/keu/lanjutan";
import { ringkasAcuan } from "@/lib/keu/acuan";
import { peringatanDikecualikan } from "@/lib/keu/notifikasi";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { hariIniWib, useIdent } from "../../useIdent";
import { KartuAcuan, KartuPengecualian } from "./Pengecualian";
import { KartuKelas, KartuPeran, KartuPetugas, KartuWilayah } from "./Isian";
import { KartuDokumen, KartuRincian, KartuStatusLj, KartuVersiLj } from "./Ringkasan";
import { useLanjutan } from "./useLanjutan";

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);
  const muatSemua = useCallback(async () => { await Promise.all([ident.muatSemua(), lj.muatSemua()]); }, [ident, lj]);
  const kirim = useKirim(muatSemua);

  const [isi, setIsi] = useState<IsiLanjutan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [alasan, setAlasan] = useState("");
  const dimuat = useRef<string | null>(null);

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const tahun = row?.tahun ?? new Date().getFullYear();
  const tersimpan = lj.row;

  // isi lokal diambil dari basis data bila belum ada suntingan lokal; hanya saat baris benar-benar berganti. Tanpa baris tersimpan: diturunkan dari identifikasi awal.
  useEffect(() => {
    if (!row || !formSah || lj.memuat || dirty) return;
    const tanda = tersimpan ? `${tersimpan.id}|${tersimpan.diubah_at}` : `baru|${row.id}|${row.ver}`;
    if (dimuat.current === tanda) return;
    dimuat.current = tanda;
    setIsi(tersimpan ? normalisasiLanjutan(tersimpan.isi) : awalLanjutan(formSah, row.tahun));
    setAlasan("");
  }, [row, formSah, tersimpan, lj.memuat, dirty]);

  const ubah = useCallback((fn: (g: IsiLanjutan) => void) => {
    setIsi((prev) => {
      if (!prev) return prev;
      const g = JSON.parse(JSON.stringify(prev)) as IsiLanjutan;
      fn(g);
      return g;
    });
    setDirty(true);
  }, []);

  const galatIsi = useMemo(() => (isi ? periksaLanjutan(isi) : []), [isi]);
  const status = useMemo(() => (isi && galatIsi.length === 0 ? statusLanjutan(isi) : "draf"), [isi, galatIsi]);
  const sebabDraf = useMemo(() => (isi && galatIsi.length === 0 ? alasanDraf(isi) : []), [isi, galatIsi]);
  const dasarUsang = !!(row && tersimpan && tersimpan.ident_ver !== row.ver);
  const peringatan = useMemo(
    () => (isi ? peringatanLanjutan(isi, { lembar: lj.lembar?.isi ?? null, dasarUsang, form: formSah }) : []),
    [isi, lj.lembar, dasarUsang, formSah],
  );
  const rincian = useMemo(() => (isi ? rincianBiaya(isi, formSah, lj.lembar?.isi ?? null) : []), [isi, formSah, lj.lembar]);

  const pasca = !!(row && formSah && sesudahH15(formSah, row.tahun, hariIniWib()));
  const h15 = row && formSah ? tanggalH15(formSah, row.tahun) : null;
  const wajibAlasan = !!(pasca && tersimpan?.status === "final" && dirty);
  const syaratKurang: string[] = [];
  if (galatIsi.length > 0) syaratKurang.push(...galatIsi.slice(0, 5), ...(galatIsi.length > 5 ? [`dan ${galatIsi.length - 5} masalah lain`] : []));
  if (wajibAlasan && alasan.trim().length < 10) syaratKurang.push("Alasan perubahan sesudah H-15 wajib diisi (minimal 10 huruf).");

  const dikecualikan = useMemo(() => peringatanDikecualikan(peringatan, lj.pengecualian), [peringatan, lj.pengecualian]);
  const acuan = useMemo(
    () => (formSah && row ? ringkasAcuan({
      form: formSah, tahun: row.tahun, upd: (row.upd ?? null) as Record<string, { mulai: string; selesai: string }> | null,
      isi: tersimpan ? normalisasiLanjutan(tersimpan.isi) : null, ver: tersimpan?.ver ?? null, status: tersimpan?.status ?? null,
      lembar: lj.lembar?.isi ?? null, kebijakanVer: tersimpan?.kebijakan_ver ?? lj.lembar?.ver ?? null,
    }) : []),
    [formSah, row, tersimpan, lj.lembar],
  );

  const terkunci = !row || row.ver < 1 || row.status === "dibatalkan";
  const bolehSusun = ident.hak.susun && !terkunci;

  const simpan = useCallback(async () => {
    if (!isi || !row) return;
    const ok = await kirim.jalankan(() => aksiKeu("keu_lanjutan_simpan", {
      p_ident: row.id, p_isi: isi, ...(alasan.trim() ? { p_alasan: alasan.trim() } : {}), ...(tersimpan ? { p_diubah: tersimpan.diubah_at } : {}),
    }));
    if (ok) { setDirty(false); setAlasan(""); dimuat.current = null; }
  }, [isi, row, alasan, tersimpan, kirim]);

  const ajukan = useCallback(async (jenis: "kebijakan" | "rangkap", objek: string, alasanP: string) => {
    if (!row) return false;
    return kirim.jalankan(() => aksiKeu("keu_pengecualian_ajukan", { p_ident: row.id, p_jenis: jenis, p_objek: objek, p_alasan: alasanP }));
  }, [row, kirim]);
  const putus = useCallback((pid: number, setuju: boolean, catatan: string) => kirim.jalankan(() => aksiKeu("keu_pengecualian_putus", { p_id: pid, p_setuju: setuju, ...(catatan.trim() ? { p_catatan: catatan.trim() } : {}) })), [kirim]);
  const tarik = useCallback((pid: number) => kirim.jalankan(() => aksiKeu("keu_pengecualian_tarik", { p_id: pid })), [kirim]);

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Identifikasi lanjutan"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Lanjutan"]}
      judul={row ? <>Identifikasi lanjutan: {row.nama}</> : "Identifikasi lanjutan"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      kembali={{ induk: id ? `/sigap/kelola/perencanaan/identifikasi/${id}` : "/sigap/kelola/perencanaan/identifikasi", label: "Identifikasi awal" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? lj.galat} />
        {(ident.memuat || lj.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Identifikasi lanjutan dapat diisi sesudah identifikasi awal disahkan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; lanjutan hanya dapat dibaca.</Catatan>}
        {row && row.ver >= 1 && row.status !== "dibatalkan" && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
            <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/pelaksanaan`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Pelaksanaan: tautan kegiatan, penugasan, laporan, Bendahara →</Link>
            <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/kebutuhan`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Rekrutmen mitra dan draf pengadaan →</Link>
          </div>
        )}
        {row && formSah && h15 && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
            <Chip warna={pasca ? "merah" : "biru"}>{pasca ? "Sudah lewat H-15" : "Sebelum H-15"}</Chip>
            <span>H-15 jatuh pada {tglIndo(h15)}. {pasca ? "Perubahan pada lanjutan Final sekarang wajib beralasan dan ditandai untuk evaluasi." : "Sebaiknya identifikasi lanjutan Final sebelum tanggal ini."}</span>
          </div>
        )}
        {row && formSah && isi && (
          <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <KartuWilayah isi={isi} ubah={ubah} mati={!bolehSusun || kirim.mengirim} />
              <KartuKelas isi={isi} ubah={ubah} mati={!bolehSusun || kirim.mengirim} form={formSah} />
              <KartuPeran isi={isi} ubah={ubah} mati={!bolehSusun || kirim.mengirim} />
              <KartuPetugas isi={isi} ubah={ubah} mati={!bolehSusun || kirim.mengirim} />
            </div>
            <div className="flex min-w-0 flex-col gap-3.5 xl:sticky xl:top-[68px] xl:max-h-[calc(100vh-84px)] xl:overflow-y-auto xl:pr-1 xl:[scrollbar-width:thin]">
              <KartuStatusLj
                status={status} ada={!!tersimpan} ver={tersimpan?.ver ?? null} pascaH15={!!tersimpan?.pasca_h15} dirty={dirty}
                alasanDraf={sebabDraf} peringatan={peringatan} alasan={alasan} setAlasan={(s) => { setAlasan(s); }} wajibAlasan={wajibAlasan}
                bisa={bolehSusun} mengirim={kirim.mengirim} galat={kirim.galat} onSimpan={() => void simpan()} syaratKurang={syaratKurang} dikecualikan={dikecualikan}
              />
              <KartuRincian baris={rincian} adaLembar={!!lj.lembar} />
              {tersimpan
                ? <KartuDokumen identId={row.id} isi={normalisasiLanjutan(tersimpan.isi)} dokumen={lj.dokumen} final={tersimpan.status === "final"} />
                : <Catatan>Dokumen turunan (undangan, surat pengantar nagari, surat tugas atau SPK) tersedia setelah versi pertama disimpan.</Catatan>}
              {tersimpan && (
                <KartuPengecualian
                  baris={lj.pengecualian} kpa={ident.hak.kpa} susun={bolehSusun} akun={ident.hak.akun ?? null} peringatan={peringatan}
                  mengirim={kirim.mengirim} galat={kirim.galat} onAjukan={ajukan} onPutus={putus} onTarik={tarik}
                />
              )}
              <KartuAcuan modul={acuan} />
              <KartuVersiLj versi={lj.versi} />
            </div>
          </div>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanLanjutan() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
