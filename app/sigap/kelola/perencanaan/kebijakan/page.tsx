"use client";

// app/sigap/kelola/perencanaan/kebijakan/page.tsx
//
// (25 Okt 2026, tahap 28) Lembar kebijakan manajemen tim: templat susunan tim (S1-S9) dan kebijakan anggaran sebagai data. Satu lembar per tahun,
// disepakati pada rapat awal tahun, disahkan paralel oleh semua ketua tim aktif + PPK + KPA, lalu terkunci. Semua pegawai organik boleh melihat;
// menyusun dan mengesahkan mengikuti hak yang ditegakkan basis data (keu_kebijakan_*). Rancangan: Skema Lengkap V1 bagian 5-7.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat, judulKartu, kartu, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import {
  ID_BAGIAN, aksiTersedia, isiPredefined, kanonik, labelStatus, periksaIsi, pilihLembar, ringkasPengesahan, tujuanGalat,
  type AksiLembar, type IsiKebijakan,
} from "@/lib/keu/kebijakan";
import { Poin, Tautan, loncat } from "../identifikasi/Kontrol";
import { hariIniWib } from "../identifikasi/useIdent";
import { Anggaran } from "./Anggaran";
import { Pengesahan, Riwayat, type MetaRapat } from "./Pengesahan";
import { Kompetensi, Rangkap, Susunan } from "./Susunan";
import { useDaftarVersi, useHakKebijakan, useLembar } from "./useKebijakan";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const META_KOSONG: MetaRapat = { tgl: "", nomor: "", tujuan: "" };

const LOMPAT: { id: string; teks: string }[] = [
  { id: ID_BAGIAN.pengesahan, teks: "Status dan pengesahan" },
  { id: ID_BAGIAN.susunan, teks: "Susunan tim" },
  { id: ID_BAGIAN.rangkap, teks: "Rangkap jabatan" },
  { id: ID_BAGIAN.kompetensi, teks: "Kompetensi" },
  { id: ID_BAGIAN.anggaran, teks: "Kebijakan anggaran" },
  { id: ID_BAGIAN.riwayat, teks: "Riwayat" },
];

function Isi() {
  const daftar = useDaftarVersi();
  const { hak, siap } = useHakKebijakan();
  const [pilih, setPilih] = useState<number | null>(null);
  const versi = useMemo(() => daftar.baris ?? [], [daftar.baris]);
  const idAktif = pilih ?? (daftar.baris ? pilihLembar(versi, hak.susun) : null);
  const lembar = useLembar(idAktif);
  const row = lembar.row;

  const [isi, setIsi] = useState<IsiKebijakan | null>(null);
  const [meta, setMeta] = useState<MetaRapat>(META_KOSONG);
  const [catatan, setCatatan] = useState("");
  const hariIni = hariIniWib();

  useEffect(() => {
    if (!row) { setIsi(null); setMeta(META_KOSONG); return; }
    setIsi(salin(row.isi));
    setMeta({ tgl: row.tanggal_rapat ?? "", nomor: row.nomor_notulen, tujuan: row.tujuan });
    // diatur ulang hanya saat lembar berganti atau versi dari server berubah, bukan saat pengguna mengetik
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, row?.diubah_at]);

  const sesudah = useCallback(async () => { await Promise.all([daftar.muat(), lembar.muatSemua()]); }, [daftar, lembar]);
  const { jalankan, mengirim, galat: galatAksi, hapusGalat } = useKirim(sesudah);

  const bisaUbah = !!row && row.status === "draf" && hak.susun;
  const kotor = !!row && !!isi && (kanonik(isi) !== kanonik(row.isi) || meta.tgl !== (row.tanggal_rapat ?? "") || meta.nomor !== row.nomor_notulen || meta.tujuan !== row.tujuan);
  const hasil = useMemo(() => (isi ? periksaIsi(isi) : { galat: [], peringatan: [] }), [isi]);
  const aksi = row ? aksiTersedia(row, hak, lembar.pengesah) : [];
  const ringkas = ringkasPengesahan(lembar.pengesah);

  const ubah = useCallback((fn: (d: IsiKebijakan) => void) => {
    setIsi((lama) => { if (!lama) return lama; const baru = salin(lama); fn(baru); return baru; });
  }, []);

  async function buatPredefined() {
    hapusGalat();
    await jalankan(async () => {
      const r = await aksiKeu<number | string>("keu_kebijakan_buat", { p_isi: isiPredefined() });
      if (r.ok) setPilih(Number(r.data));
      return r;
    });
  }

  async function lakukan(a: AksiLembar) {
    if (!row || !isi) return;
    hapusGalat();
    const ok = await jalankan(async () => {
      if (a === "simpan") return aksiKeu("keu_kebijakan_simpan", { p_id: row.id, p_isi: isi, p_rapat: meta.tgl || null, p_nomor: meta.nomor, p_tujuan: meta.tujuan });
      if (a === "revisi") {
        const r = await aksiKeu<number | string>("keu_kebijakan_buat", { p_dari: row.id, p_alasan: catatan });
        if (r.ok) setPilih(Number(r.data));
        return r;
      }
      return aksiKeu("keu_kebijakan_aksi", { p_id: row.id, p_aksi: a, p_catatan: catatan });
    });
    if (ok && a !== "simpan") setCatatan("");
  }

  const semuaGalat = [...hasil.galat];
  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Kebijakan manajemen tim"
      jejak={["SIGAP", "Perencanaan", "Kebijakan manajemen tim"]}
      judul="Kebijakan manajemen tim"
      sub="Templat susunan tim (strata S1–S9) dan kebijakan anggaran disimpan sebagai data, disepakati pada rapat awal tahun, lalu dikunci. Identifikasi, rencana realisasi, dan evaluasi membaca lembar yang berlaku."
      kembali={{ induk: "/sigap/kelola/perencanaan/identifikasi", label: "Identifikasi survei" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        <Galat pesan={daftar.galat ?? lembar.galat} />
        <Catatan>
          <Poin butir={[
            "Satu lembar berlaku per tahun; versi lama diarsipkan, bukan dihapus.",
            "Angka awal berasal dari Excel pematangan dan berstatus draf (belum sah) sampai disahkan.",
            "Pengesahan paralel: semua ketua tim aktif, PPK, dan Kepala (KPA); lembar berlaku setelah semuanya menyetujui.",
            "Setelah berlaku, lembar terkunci; perubahan dilakukan lewat revisi yang membuat versi baru.",
            "Kebijakan boleh sama dengan atau lebih ketat dari aturan, tidak boleh melebihinya; pelanggaran tidak memblokir pekerjaan, hanya memunculkan peringatan.",
          ]} />
        </Catatan>

        {!daftar.baris && !daftar.galat && <Memuat />}

        {daftar.baris && versi.length === 0 && (
          <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="h-kosong">
            <h2 id="h-kosong" className={`${judulKartu} m-0`}>Belum ada lembar kebijakan tahun ini</h2>
            <Poin butir={[
              "Mulai dari angka predefined (Excel pematangan): 9 strata, 10 jabatan, matriks rangkap, syarat kompetensi, dan 21 parameter anggaran.",
              "Angka itu belum sah; bahas pada rapat awal tahun, ubah bila perlu, lalu ajukan untuk disahkan.",
            ]} />
            {siap && hak.susun
              ? <div><button type="button" className={tombolUtama} disabled={mengirim} onClick={() => void buatPredefined()}>{mengirim ? "Membuat…" : "Buat lembar dari angka predefined"}</button></div>
              : <Kosong teks="Hanya PPK, Perencanaan, atau Admin Aplikasi yang dapat membuat lembar pertama." />}
            <Galat pesan={galatAksi} />
          </section>
        )}

        {versi.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Versi lembar">
            <span className="text-[12px] font-semibold text-[#5B6B84]">Versi</span>
            {versi.filter((v) => v.status !== "dibatalkan").sort((a, b) => b.ver - a.ver).map((v) => {
              const st = labelStatus(v.status);
              const aktif = v.id === idAktif;
              return (
                <button key={v.id} type="button" aria-pressed={aktif} onClick={() => { setPilih(v.id); setCatatan(""); hapusGalat(); }}
                  className={`flex min-h-[40px] items-center gap-2 rounded-md border px-3 text-[13px] font-semibold ${aktif ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}>
                  v{v.ver} <Chip warna={st.nada}>{st.teks}</Chip>
                </button>
              );
            })}
            <span className="mx-1 hidden h-5 w-px bg-[#DCE3EE] sm:inline-block" aria-hidden />
            <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" aria-label="Loncat ke bagian">
              {LOMPAT.map((l) => (
                <button key={l.id} type="button" onClick={() => loncat(l.id)} className="cursor-pointer border-0 bg-transparent p-0 text-[#1F5FD1] underline decoration-dotted underline-offset-[3px] hover:decoration-solid">{l.teks}</button>
              ))}
            </nav>
          </div>
        )}

        {lembar.memuat && <Memuat tinggi="h-64" />}

        {row && isi && (
          <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <Pengesahan row={row} pengesah={lembar.pengesah} meta={meta} ubahMeta={setMeta} bisaUbah={bisaUbah} kotor={kotor}
                aksi={aksi} catatan={catatan} setCatatan={setCatatan} onAksi={(a) => void lakukan(a)} mengirim={mengirim} galat={galatAksi} hariIni={hariIni} />
              <Susunan isi={isi} ubah={ubah} mati={!bisaUbah} />
              <Rangkap isi={isi} ubah={ubah} mati={!bisaUbah} />
              <Kompetensi isi={isi} ubah={ubah} mati={!bisaUbah} />
              <Anggaran isi={isi} ubah={ubah} mati={!bisaUbah} />
              <Riwayat riwayat={lembar.riwayat} />
            </div>

            <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20" aria-label="Pemeriksaan lembar">
              <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-periksa">
                <h2 id="h-periksa" className={`${judulKartu} m-0`}>Pemeriksaan isi</h2>
                {semuaGalat.length > 0 ? (
                  <>
                    <p className="m-0 text-[12.5px] font-semibold text-[#B42329]">Perlu diperbaiki sebelum disimpan ({semuaGalat.length}):</p>
                    <Poin kelas="!text-[#7A1D22]" butir={semuaGalat.slice(0, 12).map((g, i) => <Tautan key={i} ke={tujuanGalat(g)}>{g}</Tautan>)} />
                    {semuaGalat.length > 12 && <p className="m-0 text-[12px] text-[#5B6B84]">…dan {semuaGalat.length - 12} lainnya.</p>}
                  </>
                ) : (
                  <p className="m-0 text-[12.5px] font-semibold text-[#14653A]">Isi lolos pemeriksaan.</p>
                )}
                {hasil.peringatan.length > 0 && (
                  <>
                    <p className="m-0 text-[12.5px] font-semibold text-[#8A6200]">Catatan (tidak menghalangi pengesahan):</p>
                    <Poin kelas="!text-[#5C4300]" butir={hasil.peringatan.map((g, i) => <Tautan key={i} ke={tujuanGalat(g)}>{g}</Tautan>)} />
                  </>
                )}
              </section>

              <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-syarat">
                <h2 id="h-syarat" className={`${judulKartu} m-0`}>Syarat berlaku</h2>
                <Poin butir={[
                  <Tautan key="a" ke={ID_BAGIAN.pengesahan}>Tanggal rapat, nomor notulen atau SK, dan tujuan mutu terisi</Tautan>,
                  <Tautan key="b" ke={ID_BAGIAN.pengesahan}>Semua ketua tim aktif menyetujui</Tautan>,
                  <Tautan key="c" ke={ID_BAGIAN.pengesahan}>PPK menyetujui</Tautan>,
                  <Tautan key="d" ke={ID_BAGIAN.pengesahan}>Kepala (KPA) menyetujui</Tautan>,
                ]} />
                {row.status === "menunggu" && (
                  <p className="m-0 text-[12.5px] text-[#44546F]">
                    {ringkas.lengkap ? "Semua syarat pengesahan terpenuhi." : `Menunggu: ${ringkas.menunggu.join("; ")}.`} ({ringkas.setuju}/{ringkas.total} persetujuan)
                  </p>
                )}
              </section>

              <section className={`${kartu} flex flex-col gap-2`} aria-labelledby="h-hak">
                <h2 id="h-hak" className={`${judulKartu} m-0`}>Peran Anda</h2>
                <Poin butir={[
                  hak.susun ? "Berwenang menyusun, mengajukan, dan membuka revisi." : "Tidak berwenang menyusun lembar (hanya melihat).",
                  hak.ketua || hak.ppk || hak.kpa
                    ? `Pengesah sebagai ${[hak.ketua && "ketua tim", hak.ppk && "PPK", hak.kpa && "KPA"].filter(Boolean).join(", ")}.`
                    : "Bukan pengesah lembar ini.",
                ]} />
                <Link href="/sigap/kelola/perencanaan/identifikasi" className="text-[12.5px] text-[#1F5FD1] underline decoration-dotted underline-offset-[3px]">Kembali ke daftar survei</Link>
              </section>
            </aside>
          </div>
        )}
      </div>
    </Bingkai>
  );
}

export default function HalamanKebijakanTim() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
