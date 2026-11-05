"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/page.tsx
//
// (5 Nov 2026) Kelas, jumlah per peran, dan daftar petugas berbentuk tabel (TabelLanjutan.tsx); mode baca dengan tombol Revisi, bilah simpan menempel, dialog
// "Simpan dan terapkan / Simpan saja" (ModalTerapkan.tsx; penanda versi dipakai hilir, SQL 20261105a), dan peringatan saat meninggalkan halaman.
// (25 Okt 2026, tahap 29) Identifikasi lanjutan: mengubah perkiraan identifikasi awal menjadi data Fix (kelas, jumlah dan nama petugas, jabatan, sumber mitra,
// translok dan penginapan), lengkap dengan peringatan terhadap lembar kebijakan, rincian kebutuhan, dan dokumen turunan. Data dibaca lewat gerbang baca
// (keu_v_ident_lanjutan*), ditulis lewat keu_lanjutan_simpan (hak ditegakkan basis data). Aturan: lib/keu/lanjutan.ts.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { NavAlur, PenunjukAlur } from "@/app/sigap/kelola/AlurKelola";
import { alurIdentifikasi, posisiAlur } from "@/lib/alurKelola";
import { Catatan, Chip, Galat, Kosong, Memuat, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { normalisasi, sesudahH15, tanggalH15, tglIndo } from "@/lib/keu/identifikasi";
import { alasanDraf, awalLanjutan, normalisasiLanjutan, peringatanLanjutan, periksaLanjutan, rincianBiaya, statusLanjutan, type IsiLanjutan } from "@/lib/keu/lanjutan";
import { ringkasAcuan } from "@/lib/keu/acuan";
import { dampakSelisih } from "@/lib/keu/selisihLanjutan";
import { peringatanDikecualikan } from "@/lib/keu/notifikasi";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { hariIniWib, useIdent } from "../../useIdent";
import { KartuAcuan, KartuPengecualian } from "./Pengecualian";
import { KartuWilayah } from "./Isian";
import { TabelKelas, TabelPeran, TabelPetugas } from "./TabelLanjutan";
import { DaftarDampak, ModalKeluar, ModalTerapkan, type PilihanSimpan } from "./ModalTerapkan";
import { KartuDokumen, KartuRincian, KartuStatusLj, KartuVersiLj } from "./Ringkasan";
import { useLanjutan } from "./useLanjutan";

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const router = useRouter();
  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);
  const muatSemua = useCallback(async () => { await Promise.all([ident.muatSemua(), lj.muatSemua()]); }, [ident, lj]);
  const kirim = useKirim(muatSemua);

  const [isi, setIsi] = useState<IsiLanjutan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [alasan, setAlasan] = useState("");
  const dimuat = useRef<string | null>(null);
  const [revisi, setRevisi] = useState(false); // mode ubah untuk lanjutan yang sudah tersimpan; yang belum tersimpan langsung dapat diisi
  const [modal, setModal] = useState<"simpan" | "terapkan" | null>(null);
  const [keluarKe, setKeluarKe] = useState<string | null>(null);

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

  const modeUbah = bolehSusun && (revisi || !tersimpan);
  const matiForm = !modeUbah || kirim.mengirim;
  const pinAda = lj.pinAda;
  const rowHilir = lj.rowHilir;
  const tugasTerbit = useMemo(() => new Set(lj.dokumen.filter((d) => d.jenis === "tugas" && d.status === "terbit").map((d) => d.kunci)), [lj.dokumen]);

  // Dampak = selisih antara versi yang kini dipakai hilir (penanda, atau versi terbaru bila tanpa penanda) dan rancangan di layar.
  const hilirIsi = useMemo(() => (rowHilir ? normalisasiLanjutan(rowHilir.isi) : null), [rowHilir]);
  const dampak = useMemo(() => (dirty && isi && hilirIsi ? dampakSelisih(hilirIsi, isi, formSah, lj.lembar?.isi ?? null) : []), [dirty, isi, hilirIsi, formSah, lj.lembar]);
  const dampakTerapkan = useMemo(
    () => (pinAda && hilirIsi && tersimpan ? dampakSelisih(hilirIsi, normalisasiLanjutan(tersimpan.isi), formSah, lj.lembar?.isi ?? null) : []),
    [pinAda, hilirIsi, tersimpan, formSah, lj.lembar],
  );

  const simpan = useCallback(async (terapkan: boolean, alasanP: string): Promise<boolean> => {
    if (!isi || !row) return false;
    // p_terapkan hanya dikirim untuk "Simpan saja": penyimpanan biasa tetap berjalan bila SQL 20261105a belum dijalankan
    const ok = await kirim.jalankan(() => aksiKeu("keu_lanjutan_simpan", {
      p_ident: row.id, p_isi: isi, ...(alasanP ? { p_alasan: alasanP } : {}), ...(tersimpan ? { p_diubah: tersimpan.diubah_at } : {}), ...(terapkan ? {} : { p_terapkan: false }),
    }));
    if (ok) { setDirty(false); setAlasan(""); dimuat.current = null; setRevisi(false); setModal(null); }
    return ok;
  }, [isi, row, tersimpan, kirim]);

  const terapkanHilir = useCallback(async (alasanP: string): Promise<boolean> => {
    if (!row) return false;
    const ok = await kirim.jalankan(() => aksiKeu("keu_lanjutan_terapkan", { p_ident: row.id, ...(alasanP ? { p_alasan: alasanP } : {}) }));
    if (ok) setModal(null);
    return ok;
  }, [row, kirim]);

  // Tombol berlabel "Simpan…" (titik tiga) hanya bila dialog akan muncul; tanpa dialog, klik langsung menyimpan dan labelnya "Simpan".
  const adaDialog = !!tersimpan && (dampak.length > 0 || pinAda || wajibAlasan);
  const klikSimpan = () => {
    if (!tersimpan) { void simpan(true, ""); return; }
    if (adaDialog) { kirim.hapusGalat(); setModal("simpan"); } else void simpan(true, "");
  };
  const batalRevisi = () => { setDirty(false); setAlasan(""); dimuat.current = null; setRevisi(false); kirim.hapusGalat(); };
  const jalankanModal = (pil: PilihanSimpan, al: string) => { if (modal === "simpan") void simpan(pil === "terapkan", al); else void terapkanHilir(al); };

  // Peringatan meninggalkan halaman saat ada perubahan belum disimpan: tutup/muat ulang tab lewat peramban, pindah halaman lewat dialog sendiri.
  useEffect(() => {
    if (!dirty) return;
    const sebelumTutup = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const klik = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target instanceof Element ? e.target.closest("a[href]") : null) as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault(); e.stopPropagation();
      setKeluarKe(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("beforeunload", sebelumTutup);
    document.addEventListener("click", klik, true);
    return () => { window.removeEventListener("beforeunload", sebelumTutup); document.removeEventListener("click", klik, true); };
  }, [dirty]);

  const ajukan = useCallback(async (jenis: "kebijakan" | "rangkap", objek: string, alasanP: string) => {
    if (!row) return false;
    return kirim.jalankan(() => aksiKeu("keu_pengecualian_ajukan", { p_ident: row.id, p_jenis: jenis, p_objek: objek, p_alasan: alasanP }));
  }, [row, kirim]);
  const putus = useCallback((pid: number, setuju: boolean, catatan: string) => kirim.jalankan(() => aksiKeu("keu_pengecualian_putus", { p_id: pid, p_setuju: setuju, ...(catatan.trim() ? { p_catatan: catatan.trim() } : {}) })), [kirim]);
  const tarik = useCallback((pid: number) => kirim.jalankan(() => aksiKeu("keu_pengecualian_tarik", { p_id: pid })), [kirim]);

  // (1 Nov 2026) penunjuk tahap + Sebelumnya/Berikutnya alur Identifikasi survei (lib/alurKelola.ts)
  const posisiAlurIni = id === null ? null : posisiAlur(alurIdentifikasi(id), "lanjutan");
  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Identifikasi lanjutan"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Lanjutan"]}
      judul={row ? <>Identifikasi lanjutan: {row.nama}</> : "Identifikasi lanjutan"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      atas={<PenunjukAlur posisi={posisiAlurIni} nama="Alur identifikasi survei" />}
      bawah={<NavAlur posisi={posisiAlurIni} />}
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
            <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/tim`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Susunan tim kerja →</Link>
            <Link href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/kebutuhan`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Rekrutmen mitra dan draf pengadaan →</Link>
          </div>
        )}
        {row && formSah && h15 && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
            <Chip warna={pasca ? "merah" : "biru"}>{pasca ? "Sudah lewat H-15" : "Sebelum H-15"}</Chip>
            <span>H-15 jatuh pada {tglIndo(h15)}. {pasca ? "Perubahan pada lanjutan Final sekarang wajib beralasan dan ditandai untuk evaluasi." : "Sebaiknya identifikasi lanjutan Final sebelum tanggal ini."}</span>
          </div>
        )}
        {row && tersimpan && pinAda && rowHilir && (
          <Catatan>
            <p className="m-0 font-semibold">Modul hilir masih memakai versi {rowHilir.ver}; versi terbaru adalah {tersimpan.ver}.</p>
            <p className="m-0 mt-0.5 text-[12.5px]">Usulan penugasan, Delego, kebutuhan rekrutmen, pelaksanaan, dan kelas pelatihan belum mengikuti perubahan terbaru.</p>
            <div className="mt-2"><DaftarDampak dampak={dampakTerapkan} /></div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className={tombolUtama} disabled={!bolehSusun || dirty || kirim.mengirim} onClick={() => { kirim.hapusGalat(); setModal("terapkan"); }}>Terapkan versi {tersimpan.ver} ke modul hilir</button>
              {dirty && <span className="text-[12.5px]">Simpan atau batalkan revisi terlebih dahulu.</span>}
            </div>
          </Catatan>
        )}
        {row && formSah && isi && (
          <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <KartuWilayah isi={isi} ubah={ubah} mati={matiForm} />
              <TabelKelas isi={isi} ubah={ubah} mati={matiForm} form={formSah} organik={lj.organik} tahun={tahun} />
              <TabelPeran isi={isi} ubah={ubah} mati={matiForm} form={formSah} tahun={tahun} />
              <TabelPetugas isi={isi} ubah={ubah} mati={matiForm} organik={lj.organik} mitra={lj.mitra} galatDaftar={lj.daftarNamaGalat} tugasTerbit={tugasTerbit} hrefTim={`/sigap/kelola/perencanaan/identifikasi/${row.id}/tim`} />
            </div>
            <div className="flex min-w-0 flex-col gap-3.5 xl:sticky xl:top-[68px] xl:max-h-[calc(100vh-84px)] xl:overflow-y-auto xl:pr-1 xl:[scrollbar-width:thin]">
              <KartuStatusLj
                status={status} ada={!!tersimpan} ver={tersimpan?.ver ?? null} pascaH15={!!tersimpan?.pasca_h15} dirty={dirty}
                alasanDraf={sebabDraf} peringatan={peringatan} alasan={alasan} setAlasan={(s) => { setAlasan(s); }} wajibAlasan={wajibAlasan}
                bisa={bolehSusun} mengirim={kirim.mengirim} galat={kirim.galat} onSimpan={klikSimpan} syaratKurang={syaratKurang} dikecualikan={dikecualikan} tanpaSimpan hrefTim={`/sigap/kelola/perencanaan/identifikasi/${row.id}/tim`}
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
        {row && formSah && isi && row.ver >= 1 && row.status !== "dibatalkan" && (
          <div role="region" aria-label="Bilah simpan" className="sticky bottom-3 z-30 flex flex-col gap-1.5 rounded-xl border border-[#DCE3EE] bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
            {!modal && kirim.galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kirim.galat}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-[#1B2B4B]" role="status">
                {dirty
                  ? <><i aria-hidden className="h-2.5 w-2.5 flex-none rounded-full bg-[#E8890C]" /><strong>Ada perubahan belum disimpan</strong></>
                  : modeUbah && tersimpan ? <span>Mode revisi · belum ada perubahan</span>
                    : tersimpan ? <span>Mode baca · versi {tersimpan.ver}{pinAda && rowHilir ? ` (hilir memakai versi ${rowHilir.ver})` : ""}</span>
                      : <span>Belum disimpan</span>}
                {dirty && dampak.length > 0 && <span className="text-[12.5px] text-[#5B6B84]">· berdampak pada {dampak.length} area modul hilir</span>}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {!modeUbah && bolehSusun && tersimpan && <button type="button" className={tombolUtama} onClick={() => setRevisi(true)}>Revisi</button>}
                {modeUbah && tersimpan && <button type="button" className={tombolKecil} disabled={kirim.mengirim} onClick={batalRevisi}>Batal revisi</button>}
                {modeUbah && (
                  <button
                    type="button" className={tombolUtama} disabled={!bolehSusun || kirim.mengirim || (!!tersimpan && !dirty) || galatIsi.length > 0}
                    title={galatIsi.length > 0 ? "Isian belum sah; lihat kartu Status" : undefined} onClick={klikSimpan}
                  >{kirim.mengirim ? "Menyimpan…" : tersimpan ? (adaDialog ? "Simpan…" : "Simpan") : "Simpan versi pertama"}</button>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
      {modal && tersimpan && (
        <ModalTerapkan
          mode={modal} dampak={modal === "simpan" ? dampak : dampakTerapkan} verHilir={rowHilir?.ver ?? null} verTerbaru={tersimpan.ver} pinAda={pinAda} pasca={pasca} wajibDasar={wajibAlasan}
          mengirim={kirim.mengirim} galat={kirim.galat} alasanAwal={alasan} onBatal={() => setModal(null)} onJalan={jalankanModal}
        />
      )}
      {keluarKe && <ModalKeluar onTetap={() => setKeluarKe(null)} onKeluar={() => { const ke = keluarKe; setKeluarKe(null); setDirty(false); router.push(ke); }} />}
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
