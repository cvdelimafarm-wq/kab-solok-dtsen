"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/evaluasi/page.tsx
//
// (14 Nov 2026, Fase 6) Tahap 8 alur identifikasi survei: Bayar dan evaluasi.
//  A Rapor survei: SPK terbit, hari kerja sah, daftar bayar, Delego, penilaian 360 (keu_ident_evaluasi_bahan).
//  B Daftar bayar dari hari kerja yang sah per kegiatan tertaut (keu_daftar_bayar), unduh CSV.
//  C Pembayaran tercermin: catatan pembayaran yang sudah tampak di unggahan realisasi SAKTI (keu_pembayaran_cocok_bahan), ditandai sekaligus.
//  D Pelajaran, kalibrasi, tindak lanjut (keu_ident_evaluasi_simpan).
//  E Salin untuk survei berikutnya (keu_ident_salin) menjadi draf identifikasi baru.
// Hanya membaca dan menyarankan; pembayaran dan revisi tetap dicatat di layar masing-masing.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { NavAlur, PenunjukAlur } from "@/app/sigap/kelola/AlurKelola";
import { alurIdentifikasi, posisiAlur } from "@/lib/alurKelola";
import { Catatan, Galat, Kosong, Kpi, Memuat, kolom, label, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { useBacaFungsi } from "@/app/sigap/delego/data";
import { galatSalin, kalimatRapor, persen, ringkasBayar, type BahanEvaluasi } from "@/lib/keu/bayarEvaluasi";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { useIdent } from "../../useIdent";
import { Bagian } from "../../Kontrol";
import TabelBayar from "./TabelBayar";

const rp = (x: number | string) => `Rp${Number(x).toLocaleString("id-ID")}`;

type Cocok = { boleh: boolean; baris: { id: number; pok_kunci: string; jumlah: number | string; tanggal: string; nomor_ref: string | null; dicatat_kunci: number | string; real_sd: number | string | null; sampai: string | null; cocok: boolean }[] };

function KartuCocok({ ro }: { ro: string }) {
  const c = useBacaFungsi<Cocok>("keu_pembayaran_cocok_bahan", { p_ro: ro }, { simpan: false });
  const kirim = useKirim(c.muat);
  const [pesan, setPesan] = useState<string | null>(null);
  const d = c.data;
  const cocok = d?.baris.filter((b) => b.cocok) ?? [];
  return (
    <Bagian huruf="C" judul="Pembayaran tercermin di realisasi">
      {c.galat && <Galat pesan={c.galat} />}
      {!d ? <Memuat tinggi="h-16" /> : d.baris.length === 0 ? (
        <p className="m-0 text-[13px] text-[#5B6B84]">Tidak ada catatan pembayaran berstatus Dicatat pada RO {ro}. Catatan pembayaran dibuat di ruang RO, tab Pembayaran.</p>
      ) : (
        <>
          <p className="m-0 text-[13px] text-[#44546F]">
            {cocok.length} dari {d.baris.length} catatan sudah tampak di unggahan realisasi SAKTI (realisasi s.d. untuk kunci POK yang sama tidak kurang dari jumlah dicatat).
          </p>
          <ul className="m-0 list-none space-y-1 p-0 text-[12.5px]">
            {d.baris.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 border-b border-[#EEF2F7] py-1">
                <span className="min-w-0 break-words">{b.tanggal} · {b.nomor_ref || "tanpa nomor"} · {rp(b.jumlah)}</span>
                <span className={b.cocok ? "font-semibold text-[#14653A]" : "text-[#8A6200]"}>{b.cocok ? "Cocok dengan SAKTI" : b.real_sd === null ? "Belum ada di SAKTI" : `SAKTI ${rp(b.real_sd)}`}</span>
              </li>
            ))}
          </ul>
          {d.boleh && cocok.length > 0 && (
            <button type="button" className={tombolUtama} disabled={kirim.mengirim} onClick={async () => {
              const ok = await kirim.jalankan(() => aksiKeu<{ ditandai: number }>("keu_pembayaran_tandai_cocok", { p_ro: ro }));
              if (ok) setPesan(`${cocok.length} catatan ditandai tercermin.`);
            }}>Tandai {cocok.length} catatan tercermin</button>
          )}
          {kirim.galat && <Galat pesan={kirim.galat} />}
          {pesan && <Catatan>{pesan}</Catatan>}
        </>
      )}
    </Bagian>
  );
}

function KartuPelajaran({ b, muat }: { b: BahanEvaluasi; muat: () => Promise<void> }) {
  const [f, setF] = useState({ pelajaran: b.evaluasi?.pelajaran ?? "", kalibrasi: b.evaluasi?.kalibrasi ?? "", tindak_lanjut: b.evaluasi?.tindak_lanjut ?? "" });
  useEffect(() => setF({ pelajaran: b.evaluasi?.pelajaran ?? "", kalibrasi: b.evaluasi?.kalibrasi ?? "", tindak_lanjut: b.evaluasi?.tindak_lanjut ?? "" }), [b.evaluasi]);
  const kirim = useKirim(muat);
  const mati = !b.boleh_ubah;
  const isian = (k: keyof typeof f, judul: string, bantu: string) => (
    <div>
      <label className={label} htmlFor={`ev-${k}`}>{judul}</label>
      <textarea id={`ev-${k}`} className={`${kolom} min-h-[84px] py-2`} value={f[k]} disabled={mati} maxLength={4000} placeholder={bantu} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <Bagian huruf="D" judul="Pelajaran dan kalibrasi">
      {isian("pelajaran", "Pelajaran", "Apa yang berjalan baik dan apa yang perlu diubah pada survei berikutnya.")}
      {isian("kalibrasi", "Kalibrasi", "Standar per hari, poin, jumlah hari dibayar, atau jumlah petugas yang perlu disesuaikan.")}
      {isian("tindak_lanjut", "Tindak lanjut", "Siapa mengerjakan apa sebelum survei berikutnya.")}
      {b.evaluasi && <p className="m-0 text-[12px] text-[#5B6B84]">Terakhir disimpan {new Date(b.evaluasi.disimpan_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}{b.evaluasi.disimpan_nama ? ` oleh ${b.evaluasi.disimpan_nama}` : ""}.</p>}
      {!mati && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tombolUtama} disabled={kirim.mengirim} onClick={() => void kirim.jalankan(() => aksiKeu("keu_ident_evaluasi_simpan", { p_ident: b.ident.id, p_pelajaran: f.pelajaran, p_kalibrasi: f.kalibrasi, p_tindak_lanjut: f.tindak_lanjut }))}>Simpan evaluasi</button>
        </div>
      )}
      {mati && <p className="m-0 text-[12px] text-[#5B6B84]">Hanya ketua tim RO ini atau Kepala yang dapat mengubah.</p>}
      {kirim.galat && <Galat pesan={kirim.galat} />}
    </Bagian>
  );
}

function KartuSalin({ b }: { b: BahanEvaluasi }) {
  const [nama, setNama] = useState("");
  const [baru, setBaru] = useState<number | null>(null);
  const kirim = useKirim(async () => {});
  const g = galatSalin(nama, b.ident.nama);
  return (
    <Bagian huruf="E" judul="Salin untuk survei berikutnya">
      <p className="m-0 text-[13px] text-[#44546F]">Isian identifikasi awal disalin menjadi draf baru pada RO {b.ident.ro_kode}. Tanggal, jumlah, dan nama petugas tetap perlu diperiksa pada draf baru.</p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label className={label} htmlFor="salin-nama">Nama survei baru</label>
          <input id="salin-nama" className={kolom} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Mis. Seruti Triwulan I 2027" maxLength={200} />
        </div>
        <button type="button" className={tombolKecil} disabled={kirim.mengirim || !!g} onClick={async () => {
          await kirim.jalankan(async () => {
            const r = await aksiKeu<number>("keu_ident_salin", { p_ident: b.ident.id, p_nama: nama.trim() });
            if (r.ok) setBaru(Number(r.data));
            return r;
          });
        }}>Buat draf salinan</button>
      </div>
      {g && nama && <p className="m-0 text-[12px] text-[#8A6200]">{g}</p>}
      {kirim.galat && <Galat pesan={kirim.galat} />}
      {baru && <Catatan>Draf baru dibuat. <Link href={`/sigap/kelola/perencanaan/identifikasi/${baru}`} className="font-semibold text-[#1F5FD1] underline">Buka draf identifikasi →</Link></Catatan>}
    </Bagian>
  );
}

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const row = ident.row;
  const ev = useBacaFungsi<BahanEvaluasi>("keu_ident_evaluasi_bahan", id ? { p_ident: id } : null);
  const b = ev.data;
  const rb = b ? ringkasBayar(b.bayar) : null;
  const posisiAlurIni = id === null ? null : posisiAlur(alurIdentifikasi(id), "evaluasi");
  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Bayar dan evaluasi"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Bayar dan evaluasi"]}
      judul={row ? <>Bayar dan evaluasi: {row.nama}</> : "Bayar dan evaluasi"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      atas={<PenunjukAlur posisi={posisiAlurIni} nama="Alur identifikasi survei" />}
      bawah={<NavAlur posisi={posisiAlurIni} />}
      kembali={{ induk: id ? `/sigap/kelola/perencanaan/identifikasi/${id}/gap` : "/sigap/kelola/perencanaan/identifikasi", label: "Gap pelaksanaan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? ev.galat} />
        {(ident.memuat || (ev.memuat && !b)) && <Memuat tinggi="h-48" />}
        {b && rb && (
          <>
            <Bagian huruf="A" judul="Rapor survei">
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
                <Kpi label="SPK terbit" nilai={`${b.spk.terbit}/${b.spk.mitra}`} sub="mitra pada lanjutan" warna={b.spk.mitra > 0 && b.spk.terbit < b.spk.mitra ? "kn" : "hj"} />
                <Kpi label="Hari kerja sah" nilai={`${rb.hariSah}/${rb.hariRencana}`} sub={rb.hariRencana > 0 ? `${persen(rb.hariSah, rb.hariRencana)}% dari terjadwal` : "belum ada hari kerja"} warna={rb.belumSah > 0 ? "kn" : undefined} />
                <Kpi label="Daftar bayar" nilai={rp(rb.total)} sub={`rencana ${rp(rb.totalRencana)}`} />
                <Kpi label="Pembayaran dicatat (RO)" nilai={rp(b.bayar.dicatat_ro)} sub="tab Pembayaran ruang RO" />
                <Kpi label="Butir Delego" nilai={b.delego && b.delego.butir > 0 ? `${b.delego.selesai}/${b.delego.butir}` : "-"} sub={b.delego && b.delego.butir > 0 ? `${b.delego.lewat_tenggat} pernah lewat tenggat` : "belum ada butir survei ini"} />
              </div>
              <ul className="m-0 list-disc space-y-0.5 pl-5 text-[13px] text-[#44546F]">
                {kalimatRapor(b).map((k) => <li key={k}>{k}</li>)}
              </ul>
            </Bagian>
            <Bagian huruf="B" judul="Daftar bayar dari hari kerja yang sah">
              {b.bayar.kegiatan.length === 0 ? (
                <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada kegiatan yang ditautkan. Tautkan di tahap Pelaksanaan.</p>
              ) : b.bayar.kegiatan.map((k) => <TabelBayar key={k.kegiatan_id} k={k} />)}
              <p className="m-0 text-[12px] text-[#5B6B84]">Daftar bayar adalah saran dari data lapangan. Pembayaran dicatat oleh PJ Administrasi di ruang RO, tab Pembayaran.</p>
            </Bagian>
            <KartuCocok ro={b.ident.ro_kode} />
            <KartuPelajaran b={b} muat={ev.muat} />
            <KartuSalin b={b} />
          </>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanEvaluasi() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
