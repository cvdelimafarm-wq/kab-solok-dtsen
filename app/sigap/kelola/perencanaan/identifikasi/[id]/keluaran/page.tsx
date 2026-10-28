"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/keluaran/page.tsx
//
// (28 Okt 2026) Keluaran RAB per survei: kebutuhan dana (Bendahara), rencana pembayaran (PPK dan TU), permintaan pengadaan (PBJ). Pratinjau dibentuk dari RAB yang
// berlaku; "Ajukan keluaran" membekukannya sebagai paket berversi (keu_keluaran) dan memberi tahu penerima. Penerima menandai Diterima atau mengajukan pertanyaan.
// Hanya penyajian: tidak ada pencairan, pemesanan, atau persetujuan di sini. Logika murni: lib/keu/keluaran.ts. Tulis: keu_keluaran_ajukan/tandai/spek_simpan.

import { Suspense, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat, kartu, kolom, label, tombol } from "@/app/sigap/keu-ui";
import { normalisasi } from "@/lib/keu/identifikasi";
import { awalLanjutan, jadwalPendataan, normalisasiLanjutan, rincianBiaya } from "@/lib/keu/lanjutan";
import type { KonteksLanjutan } from "@/lib/keu/dokumenLanjutan";
import { BAGIAN, LABEL_BAGIAN, type ButirKeluaran, type IdentitasKeluaran, type Spek } from "@/lib/keu/keluaran";
import { susunPengadaan } from "@/lib/keu/pengadaan";
import { rupiah } from "@/lib/keu/ro";
import LencanaNotif from "../../../notifikasi/LencanaNotif";
import { useIdent } from "../../useIdent";
import { useLanjutan } from "../lanjutan/useLanjutan";
import { KartuBagian, PanelTanda, TampilBayar, TampilDana, TampilPengadaan } from "./Kartu";
import { KartuDokumenCetak } from "./DokumenCetak";
import { Kertas } from "./Kertas";
import { useKeluaran, type BahanKeluaran } from "./useKeluaran";

const waktu = (t: string): string => {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d);
};
const STATUS_SURVEI = { draf: "Draf", siap: "Siap diajukan" } as const;

function Panel({ bahan }: { bahan: BahanKeluaran }) {
  const [pilih, setPilih] = useState<number | "pratinjau" | null>(null);
  const [catatan, setCatatan] = useState("");
  const [cetak, setCetak] = useState<ButirKeluaran | null>(null);
  const k = useKeluaran(bahan, pilih);
  const lihatPaket = k.pakai !== null && k.tersimpan !== null;
  const isi = lihatPaket ? k.tersimpan : k.pratinjau;
  const terbaruDibuka = k.pakai !== null && k.terbaru !== null && k.pakai.id === k.terbaru.id;

  const identitas: IdentitasKeluaran | null = isi ? isi.survei : null;
  const tanggal = useMemo(() => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date()), []);
  const konteks = useMemo<KonteksLanjutan | null>(() => (k.pratinjau ? {
    identitas: { nama: bahan.ident.nama, roKode: bahan.ident.ro_kode, tahun: bahan.ident.tahun, identVer: bahan.ident.ver }, jenisPeriode: bahan.jenisPeriode, isi: bahan.isi,
    jendela: bahan.periode, rincian: bahan.rincian, keluaran: k.pratinjau, statusSurvei: k.statusSurvei, paketVer: k.paketVer, dok: k.dok, polaAkun: k.polaAkun, tanggalCetak: tanggal,
  } : null), [k.pratinjau, k.statusSurvei, k.paketVer, k.dok, k.polaAkun, bahan, tanggal]);
  const simpan = async (b: ButirKeluaran, spek: Spek) => { await k.simpanSpek(b.id, b.jenis, spek); };

  if (k.belumTersedia) return <Catatan>Fitur keluaran belum aktif di basis data (berkas SQL 20261028h_keu_keluaran belum dijalankan).</Catatan>;
  if (!k.siap) return <Memuat tinggi="h-48" />;
  if (!k.rab) return <Kosong teks="RO ini belum punya RAB, jadi keluaran belum dapat disusun." />;

  return (
    <div className="flex flex-col gap-3.5">
      <Galat pesan={k.galat ?? k.galatKirim} />
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
        <Chip warna="biru">RAB nomor {String(k.rab.nomor ?? "-")} · {k.rab.status}</Chip>
        <Chip warna={k.statusSurvei === "siap" ? "hijau" : "kuning"}>RAB per survei: {STATUS_SURVEI[k.statusSurvei]}</Chip>
        <Link href={`/sigap/ro/${bahan.ident.ro_kode}?tab=rab`} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Buka RAB per survei →</Link>
      </div>

      <section className={`${kartu} space-y-3`} aria-label="Versi keluaran">
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!lihatPaket} className={`${tombol} ${!lihatPaket ? "bg-[#0F2A52] text-white" : "bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]"}`} onClick={() => setPilih("pratinjau")}>Pratinjau (RAB sekarang)</button>
          {k.paket.map((p) => (
            <button key={p.id} type="button" aria-pressed={k.pakai?.id === p.id} className={`${tombol} ${k.pakai?.id === p.id ? "bg-[#0F2A52] text-white" : "bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]"}`} onClick={() => setPilih(p.id)}>
              Versi {p.ver} · {waktu(p.dibuat_at)}
            </button>
          ))}
        </div>
        {lihatPaket && k.pakai ? (
          <p className="text-[12.5px] text-[#44546F]">
            Paket versi {k.pakai.ver}, diajukan {waktu(k.pakai.dibuat_at)}{k.pakai.dibuat_oleh_nama ? ` oleh ${k.pakai.dibuat_oleh_nama}` : ""}. Isinya beku; perubahan RAB tidak mengubahnya. Total {rupiah(Number(k.pakai.total))}.
            {k.pakai.catatan ? ` Catatan: ${k.pakai.catatan}` : ""}
            {terbaruDibuka && k.berubah === true ? " RAB atau spesifikasi sudah berubah sejak paket ini; ajukan ulang dari Pratinjau bila perlu." : ""}
          </p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-[12.5px] text-[#44546F]">Pratinjau dari RAB yang berlaku sekarang. Belum dikirim ke siapa pun sebelum Anda mengajukan.</p>
            {k.hambatan.length > 0 && <Catatan>{k.hambatan.join(" ")}</Catatan>}
            <div>
              <label className={label} htmlFor="catatan-ajukan">Catatan pengajuan (opsional)</label>
              <textarea id="catatan-ajukan" className={`${kolom} min-h-[56px]`} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            </div>
            <button type="button" disabled={k.mengirim || k.hambatan.length > 0} className={`${tombol} bg-[#1F5FD1] text-white`}
              onClick={async () => { if (await k.ajukan(catatan)) { setCatatan(""); setPilih(null); } }}>
              {k.mengirim ? "Mengajukan…" : k.paket.length > 0 ? "Ajukan ulang sebagai versi baru" : "Ajukan keluaran"}
            </button>
            <p className="text-[12px] text-[#6B7A93]">Pengajuan membekukan isi sebagai versi baru dan memberi tahu Bendahara, PPK, TU, dan PBJ. Bila isinya sama dengan versi terakhir, tidak ada versi baru.</p>
          </div>
        )}
      </section>

      {isi && identitas && (
        <>
          {BAGIAN.map((bag) => {
            const L = LABEL_BAGIAN[bag];
            return (
              <KartuBagian key={bag} judul={L.judul} penerima={L.penerima}>
                {bag === "dana" && <TampilDana dana={isi.dana} />}
                {bag === "bayar" && <TampilBayar bayar={isi.bayar} />}
                {bag === "pengadaan" && (
                  <TampilPengadaan butir={isi.pengadaan} bisaSunting={!lihatPaket} sibuk={k.mengirim} onSimpanSpek={simpan} onCetak={setCetak} />
                )}
                {lihatPaket && k.pakai && <PanelTanda bagian={bag} tanda={k.tanda.get(bag)} bisa={terbaruDibuka} sibuk={k.mengirim} onTandai={(b, s, c) => { void k.tandai(b, s, c); }} />}
              </KartuBagian>
            );
          })}
          {isi.n === 0 && <Catatan>Belum ada rincian RAB yang berasal dari survei ini.</Catatan>}
        </>
      )}
      <KartuDokumenCetak identId={bahan.ident.id} k={konteks} tanggal={tanggal} siap={k.dokSiap} />
      {cetak && identitas && <Kertas butir={cetak} survei={identitas} ver={lihatPaket && k.pakai ? k.pakai.ver : null} onTutup={() => setCetak(null)} />}
    </div>
  );
}

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const isi = useMemo(() => (lj.row ? normalisasiLanjutan(lj.row.isi) : formSah && row ? awalLanjutan(formSah, row.tahun) : null), [lj.row, formSah, row]);
  const upd = useMemo(() => ((row?.upd ?? null) as Record<string, { mulai: string; selesai: string }> | null), [row]);
  const periode = useMemo(() => (formSah && row ? jadwalPendataan(formSah, row.tahun, upd) : []), [formSah, row, upd]);
  const rincian = useMemo(() => (isi && formSah ? rincianBiaya(isi, formSah, lj.lembar?.isi ?? null) : []), [isi, formSah, lj.lembar]);
  const butirDasar = useMemo(() => (isi && formSah && row ? susunPengadaan(isi, formSah, row.tahun, upd, periode, rincian) : []), [isi, formSah, row, upd, periode, rincian]);
  const bahan = useMemo<BahanKeluaran | null>(
    () => (row && isi ? { ident: { id: row.id, ro_kode: row.ro_kode, nama: row.nama, tahun: row.tahun, ver: row.ver }, isi, rincian, periode, butirDasar, lembar: lj.lembar?.isi ?? null, jenisPeriode: formSah?.periode ?? "" } : null),
    [row, isi, rincian, periode, butirDasar, lj.lembar, formSah],
  );

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Keluaran RAB"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Keluaran RAB"]}
      judul={row ? <>Keluaran RAB: {row.nama}</> : "Keluaran RAB"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      kembali={{ induk: id ? `/sigap/kelola/perencanaan/identifikasi/${id}/kebutuhan` : "/sigap/kelola/perencanaan/identifikasi", label: "Rekrutmen dan pengadaan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? lj.galat} />
        {(ident.memuat || lj.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Keluaran dapat disusun sesudah identifikasi awal disahkan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; keluaran tidak dapat diajukan.</Catatan>}
        {bahan && formSah && !lj.memuat && <Panel bahan={bahan} />}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanKeluaran() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
