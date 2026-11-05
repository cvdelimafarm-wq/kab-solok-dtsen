"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/tim/page.tsx
//
// (6 Nov 2026, Tahap 3) Langkah "3 · Susunan tim kerja": jabatan dalam tim (ketua, wakil, penanggung jawab, Inda, Innas) dipilih dari DAFTAR PETUGAS identifikasi lanjutan,
// bukan lagi dicentang pada kartu tiap petugas. Tidak ada migrasi data: jabatan tetap tersimpan di dalam isi identifikasi lanjutan (petugas[].jabatan), sehingga
// seluruh aturan yang sudah ada (peringatan minimal per strata, batas rangkap, Hapus nama melepas jabatan, dokumen turunan, riwayat versi) tetap berlaku.
// Halaman ini hanya mengubah jabatan; simpan lewat keu_lanjutan_simpan yang sama dengan halaman lanjutan (dialog dampak, penanda versi dipakai hilir, alasan sesudah H-15).
// Rangkap dihitung otomatis dari jabatan yang dipegang tiap petugas dan dibandingkan dengan lembar kebijakan yang berlaku.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { NavAlur, PenunjukAlur } from "@/app/sigap/kelola/AlurKelola";
import { alurIdentifikasi, posisiAlur } from "@/lib/alurKelola";
import { Catatan, Chip, Galat, Kosong, Memuat, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { normalisasi, sesudahH15, tanggalH15, tglIndo } from "@/lib/keu/identifikasi";
import { normalisasiLanjutan, type IsiLanjutan } from "@/lib/keu/lanjutan";
import { KODE_JABATAN, type KodeJabatan } from "@/lib/keu/kebijakan";
import { dampakSelisih, slotKosong } from "@/lib/keu/selisihLanjutan";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { hariIniWib, useIdent } from "../../useIdent";
import { SusunanTim } from "./TabelTim";
import { ModalKeluar, ModalTerapkan, type PilihanSimpan } from "../lanjutan/ModalTerapkan";
import { useLanjutan } from "../lanjutan/useLanjutan";

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
  const [revisi, setRevisi] = useState(false);
  const [modal, setModal] = useState<"simpan" | null>(null);
  const [keluarKe, setKeluarKe] = useState<string | null>(null);
  const dimuat = useRef<string | null>(null);

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const tersimpan = lj.row;
  const lembar = lj.lembar?.isi ?? null;

  useEffect(() => {
    if (!row || lj.memuat || dirty) return;
    if (!tersimpan) { setIsi(null); return; }
    const tanda = `${tersimpan.id}|${tersimpan.diubah_at}`;
    if (dimuat.current === tanda) return;
    dimuat.current = tanda;
    setIsi(normalisasiLanjutan(tersimpan.isi));
  }, [row, tersimpan, lj.memuat, dirty]);

  const ubah = useCallback((fn: (g: IsiLanjutan) => void) => {
    setIsi((prev) => {
      if (!prev) return prev;
      const g = JSON.parse(JSON.stringify(prev)) as IsiLanjutan;
      fn(g);
      return g;
    });
    setDirty(true);
  }, []);
  // satu-satunya perubahan di halaman ini: jabatan satu petugas (urutan jabatan dijaga sama dengan daftar JABATAN)
  const setJabatan = (pid: string, kode: KodeJabatan, pegang: boolean) => ubah((g) => {
    const x = g.petugas.find((e) => e.id === pid);
    if (!x || slotKosong(x)) return;
    const s = new Set<KodeJabatan>(x.jabatan);
    if (pegang) s.add(kode); else s.delete(kode);
    x.jabatan = KODE_JABATAN.filter((k) => s.has(k));
  });

  const pasca = !!(row && formSah && sesudahH15(formSah, row.tahun, hariIniWib()));
  const h15 = row && formSah ? tanggalH15(formSah, row.tahun) : null;
  const wajibAlasan = !!(pasca && tersimpan?.status === "final" && dirty);
  const terkunci = !row || row.ver < 1 || row.status === "dibatalkan";
  const bolehSusun = ident.hak.susun && !terkunci;
  const modeUbah = bolehSusun && revisi && !!tersimpan;
  const matiForm = !modeUbah || kirim.mengirim;
  const pinAda = lj.pinAda;
  const rowHilir = lj.rowHilir;
  const hilirIsi = useMemo(() => (rowHilir ? normalisasiLanjutan(rowHilir.isi) : null), [rowHilir]);
  const dampak = useMemo(() => (dirty && isi && hilirIsi ? dampakSelisih(hilirIsi, isi, formSah, lembar) : []), [dirty, isi, hilirIsi, formSah, lembar]);
  const adaDialog = !!tersimpan && (dampak.length > 0 || pinAda || wajibAlasan);

  const simpan = useCallback(async (terapkan: boolean, alasanP: string): Promise<boolean> => {
    if (!isi || !row || !tersimpan) return false;
    const ok = await kirim.jalankan(() => aksiKeu("keu_lanjutan_simpan", {
      p_ident: row.id, p_isi: isi, ...(alasanP ? { p_alasan: alasanP } : {}), p_diubah: tersimpan.diubah_at, ...(terapkan ? {} : { p_terapkan: false }),
    }));
    if (ok) { setDirty(false); dimuat.current = null; setRevisi(false); setModal(null); }
    return ok;
  }, [isi, row, tersimpan, kirim]);
  const klikSimpan = () => { if (adaDialog) { kirim.hapusGalat(); setModal("simpan"); } else void simpan(true, ""); };
  const batalRevisi = () => { setDirty(false); dimuat.current = null; setRevisi(false); kirim.hapusGalat(); };
  const jalankanModal = (pil: PilihanSimpan, al: string) => { void simpan(pil === "terapkan", al); };

  // peringatan meninggalkan halaman saat ada perubahan belum disimpan (sama dengan halaman identifikasi lanjutan)
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

  const posisiAlurIni = id === null ? null : posisiAlur(alurIdentifikasi(id), "tim");
  const dasar = id ? `/sigap/kelola/perencanaan/identifikasi/${id}` : "/sigap/kelola/perencanaan/identifikasi";
  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Susunan tim kerja"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Susunan tim kerja"]}
      judul={row ? <>Susunan tim kerja: {row.nama}</> : "Susunan tim kerja"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      atas={<PenunjukAlur posisi={posisiAlurIni} nama="Alur identifikasi survei" />}
      bawah={<NavAlur posisi={posisiAlurIni} />}
      kembali={{ induk: id ? `${dasar}/lanjutan` : "/sigap/kelola/perencanaan/identifikasi", label: "Identifikasi lanjutan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? lj.galat} />
        {(ident.memuat || lj.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Susunan tim dapat diatur sesudah identifikasi awal disahkan dan identifikasi lanjutan disimpan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; susunan tim hanya dapat dibaca.</Catatan>}
        {row && row.ver >= 1 && row.status !== "dibatalkan" && !lj.memuat && !tersimpan && (
          <Catatan>
            Daftar petugas belum ada. Simpan identifikasi lanjutan (langkah 2) terlebih dahulu, lalu atur susunan tim di sini.{" "}
            <Link href={`${dasar}/lanjutan`} className="font-semibold text-[#1F5FD1] underline">Buka identifikasi lanjutan</Link>
          </Catatan>
        )}
        {row && formSah && h15 && tersimpan && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
            <Chip warna={pasca ? "merah" : "biru"}>{pasca ? "Sudah lewat H-15" : "Sebelum H-15"}</Chip>
            <span>H-15 jatuh pada {tglIndo(h15)}. {pasca ? "Mengubah susunan tim pada lanjutan Final sekarang wajib beralasan." : "Sebaiknya susunan tim ditetapkan sebelum tanggal ini."}</span>
          </div>
        )}
        {isi && tersimpan && (
          <>
            <SusunanTim isi={isi} lembar={lembar} lembarSiap={lj.lembarSiap} versi={tersimpan.ver} verHilir={pinAda && rowHilir ? rowHilir.ver : null} mati={matiForm} setJabatan={setJabatan} hrefLanjutan={`${dasar}/lanjutan`} />
          </>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
        {row && isi && tersimpan && row.ver >= 1 && row.status !== "dibatalkan" && (
          <div role="region" aria-label="Bilah simpan" className="sticky bottom-3 z-30 flex flex-col gap-1.5 rounded-xl border border-[#DCE3EE] bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
            {!modal && kirim.galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kirim.galat}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-[#1B2B4B]" role="status">
                {dirty
                  ? <><i aria-hidden className="h-2.5 w-2.5 flex-none rounded-full bg-[#E8890C]" /><strong>Ada perubahan belum disimpan</strong></>
                  : modeUbah ? <span>Mode revisi · belum ada perubahan</span> : <span>Mode baca · versi {tersimpan.ver}</span>}
                {dirty && dampak.length > 0 && <span className="text-[12.5px] text-[#5B6B84]">· berdampak pada {dampak.length} area modul hilir</span>}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {!modeUbah && bolehSusun && <button type="button" className={tombolUtama} onClick={() => setRevisi(true)}>Revisi</button>}
                {modeUbah && <button type="button" className={tombolKecil} disabled={kirim.mengirim} onClick={batalRevisi}>Batal revisi</button>}
                {modeUbah && (
                  <button type="button" className={tombolUtama} disabled={kirim.mengirim || !dirty} onClick={klikSimpan}>
                    {kirim.mengirim ? "Menyimpan…" : adaDialog ? "Simpan…" : "Simpan"}
                  </button>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
      {modal && tersimpan && (
        <ModalTerapkan
          mode="simpan" dampak={dampak} verHilir={rowHilir?.ver ?? null} verTerbaru={tersimpan.ver} pinAda={pinAda} pasca={pasca} wajibDasar={wajibAlasan}
          mengirim={kirim.mengirim} galat={kirim.galat} alasanAwal="" onBatal={() => setModal(null)} onJalan={jalankanModal}
        />
      )}
      {keluarKe && <ModalKeluar onTetap={() => setKeluarKe(null)} onKeluar={() => { const ke = keluarKe; setKeluarKe(null); setDirty(false); router.push(ke); }} />}
    </Bingkai>
  );
}

export default function HalamanTim() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
