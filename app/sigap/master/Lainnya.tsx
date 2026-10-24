"use client";

// app/sigap/master/Lainnya.tsx
//
// (24 Okt 2026, tahap 14) Master lainnya (papan 14): kewenangan (matriks tindakan x peran, baca saja), dokumen kelengkapan (tanda "dapat dibuat SIGAP"),
// tim/peran/status, riwayat perubahan master, dan aturan master. Mengubah dokumen = kewenangan "master" (Admin, PPK).

import { useMemo, useState } from "react";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, LABEL_STATUS_USULAN } from "@/lib/keu/revisi";
import {
  dokumenKelompok, kelompokDokumen, NAMA_PERAN_PENDEK, ringkasRiwayat, susunKewenangan,
  type AkunMaster, type DokMaster, type Kewenangan, type KewenanganPeran, type PeranMaster, type RiwayatRow,
} from "@/lib/keu/master";
import { Catatan, Chip, Galat, judulKartu, kartu, tombolAktif, tombolKecil } from "../keu-ui";
import { tulisKeuKlien, useKirim } from "../ro/useKeu";

type Sesudah = () => Promise<void>;
const TH = "px-2.5 py-2";
const TABEL = "overflow-x-auto rounded-lg border border-[#DCE3EE]";
const THEAD = "bg-[#EEF3FB] text-[#44546F]";

// ---------------------------------------------------------------- kewenangan
export function BagianKewenangan({ kew, kp, peran }: { kew: Kewenangan[]; kp: KewenanganPeran[]; peran: PeranMaster[] }) {
  const { peran: kol, baris } = useMemo(() => susunKewenangan(kew, kp, peran), [kew, kp, peran]);
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Master kewenangan</h2>
        <span className="text-[12px] text-[#5B6B84]">Hanya Admin Aplikasi yang dapat mengubah. Setiap perubahan dicatat.</span>
      </div>
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Satu tabel menjawab "siapa boleh melakukan apa". Penugasan per RO (ketua tim, admin RO, akses Administrasi) diatur di Penugasan peran. Tanda bintang berarti peran itu perlu diberi kewenangan lebih dulu (per RO).</p>
      <div className={TABEL}>
        <table className="w-full min-w-[960px] text-left text-[12.5px]">
          <thead className={THEAD}><tr><th className={TH}>Tindakan</th>{kol.map((p) => <th key={p.kode} className={`${TH} text-center`}>{NAMA_PERAN_PENDEK[p.kode] ?? p.nama}</th>)}</tr></thead>
          <tbody>{baris.map((r) => (
            <tr key={r.kode} className="border-t border-[#EEF2F7] align-top">
              <td className={TH}>{r.nama}<div className="text-[11px] text-[#7A8AA3]">{r.ket}</div></td>
              {r.sel.map((s) => (
                <td key={s.peran} className="px-2.5 py-2 text-center">
                  {s.ada ? <Chip warna={s.perluPemberian ? "kuning" : "hijau"}>{s.perluPemberian ? "Ya*" : "Ya"}</Chip> : <span className="text-[#9AA7BC]" aria-label="tidak">-</span>}
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Catatan>Matriks ini baru dapat dibaca di sini. Menambah atau mencabut kewenangan peran belum tersedia dari halaman: mencabut memerlukan fungsi khusus di basis data (tabel master tidak mengizinkan hapus), dan Admin Aplikasi tidak boleh hilang dari tindakan mengatur akses dan master (aturan M6).</Catatan>
    </section>
  );
}

// ---------------------------------------------------------------- dokumen kelengkapan
export function BagianDokumen({ dok, pola, akun, boleh, sesudah }: { dok: DokMaster[]; pola: { kode: string; nama: string }[]; akun: AkunMaster[]; boleh: boolean; sesudah: Sesudah }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const grup = useMemo(() => kelompokDokumen(dok, pola), [dok, pola]);
  const [pilih, setPilih] = useState<string>("");
  const kunci = pilih && grup.some((g) => g.kunci === pilih) ? pilih : (grup[0]?.kunci ?? "");
  const aktif = grup.find((g) => g.kunci === kunci);
  const baris = useMemo(() => dokumenKelompok(dok, kunci), [dok, kunci]);
  const nAkunPola = aktif?.sumber === "pola" ? akun.filter((a) => a.pola_kode === aktif.kode && a.aktif).length : 0;
  const polaGrup = grup.filter((g) => g.sumber === "pola");
  const lembarGrup = grup.filter((g) => g.sumber !== "pola");
  const tombolGrup = (g: (typeof grup)[number]) => <button key={g.kunci} type="button" className={g.kunci === kunci ? tombolAktif : tombolKecil} onClick={() => setPilih(g.kunci)}>{g.sumber === "pola" ? (pola.find((p) => p.kode === g.kode)?.nama ?? g.kode) : g.kode} <span className="text-[11px] opacity-70">{g.nGen}/{g.n}</span></button>;
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Dokumen kelengkapan: koreksi satu per satu</h2>
        <Chip warna={dok.length > 0 && dok.every((d) => d.gen) ? "kuning" : "hijau"}>{dok.filter((d) => d.gen).length} dari {dok.length} ditandai dapat dibuat SIGAP</Chip>
      </div>
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Tanda "dapat dibuat SIGAP" berarti templat, rekap, atau lembar pengantarnya dibuat oleh SIGAP; dokumen asli pihak ketiga (nota, tiket, foto, bukti bayar) tetap diunggah. Telusuri tiap pola atau lembar di bawah dan ubah tanda yang tidak tepat. Daftar lembar subject matter diperbarui lewat impor Excel; pola umum dipakai untuk akun yang tidak punya lembar. Dokumen yang sudah dibuat, diunggah, atau diverifikasi tidak berubah (aturan M3).</p>
      <div className="flex flex-wrap items-center gap-1.5"><span className="text-[12px] text-[#5B6B84]">Pola umum</span>{polaGrup.map(tombolGrup)}</div>
      <div className="flex flex-wrap items-center gap-1.5"><span className="text-[12px] text-[#5B6B84]">Lembar subject matter</span>{lembarGrup.map(tombolGrup)}</div>
      {aktif && <p className="text-[13px]"><b>{aktif.judul}</b>. {aktif.sumber === "pola" ? `Dipakai ${nAkunPola} akun aktif.` : "Dipakai item POK yang tercatat pada lembar ini."}</p>}
      <div className={TABEL}>
        <table className="w-full min-w-[900px] text-left text-[12.5px]">
          <thead className={THEAD}><tr><th className={`${TH} text-right`}>No</th><th className={TH}>Dokumen</th><th className={TH}>Seksi</th><th className={TH}>Pihak</th><th className={TH}>Keterangan</th><th className={TH}>Dapat dibuat SIGAP</th></tr></thead>
          <tbody>{baris.map((d) => (
            <tr key={d.id} className="border-t border-[#EEF2F7] align-top">
              <td className={`${TH} text-right font-mono`}>{d.no ?? ""}</td>
              <td className={TH}>{d.uraian}</td>
              <td className={`${TH} text-[11.5px] text-[#7A8AA3]`}>{[d.seksi_huruf, d.seksi_judul].filter(Boolean).join(". ") || "-"}</td>
              <td className={`${TH} text-[11.5px]`}>{(d.pihak ?? []).join(", ") || "-"}</td>
              <td className={`${TH} text-[11.5px] text-[#7A8AA3]`}>{d.ket ?? ""}</td>
              <td className={TH}>
                {boleh ? <button type="button" disabled={mengirim} className={d.gen ? tombolAktif : tombolKecil} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_dok", "update", { gen: !d.gen }, { id: d.id }))}>{d.gen ? "Dibuat SIGAP" : "Diunggah"}</button>
                  : <Chip warna={d.gen ? "biru" : "abu"}>{d.gen ? "Dibuat SIGAP" : "Diunggah"}</Chip>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Galat pesan={galat} />
      {!boleh && <Catatan>Anda hanya dapat melihat master. Yang dapat mengubah: Admin Aplikasi dan PPK.</Catatan>}
    </section>
  );
}

// ---------------------------------------------------------------- tim, peran, status
const WARNA_JADWAL: Record<string, "abu" | "hijau" | "kuning" | "biru" | "ungu"> = { terjadwal: "abu", dibuka: "hijau", terkumpul: "kuning", diterapkan: "biru", sah: "hijau", dilewati: "abu" };
const WARNA_USULAN: Record<string, "abu" | "hijau" | "kuning" | "biru" | "merah"> = { draf: "abu", menunggu_ketua: "kuning", menunggu_ppk: "kuning", disetujui: "hijau", dikembalikan: "merah" };
const STATUS_KEKURANGAN: { kode: string; nama: string; warna: "merah" | "kuning" | "hijau" | "abu" }[] = [
  { kode: "tercatat", nama: "Tercatat", warna: "merah" }, { kode: "ditunda", nama: "Ditunda", warna: "kuning" },
  { kode: "dipenuhi", nama: "Dipenuhi", warna: "hijau" }, { kode: "ditolak", nama: "Ditolak", warna: "abu" },
  { kode: "ditarik", nama: "Ditarik", warna: "abu" },
];

export function BagianLain({ peran }: { peran: PeranMaster[] }) {
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <h2 className={judulKartu}>Tim, peran, jenis revisi, dan status</h2>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Peran</h3>
          {[...peran].sort((a, b) => a.urut - b.urut).map((p) => (
            <div key={p.kode} className="rounded-lg border border-[#DCE3EE] bg-white px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold"><span>{p.nama}</span><span className="text-[11px] font-normal text-[#7A8AA3]">{p.lingkup === "ro" ? "per RO" : "seluruh satker"}{p.aktif ? "" : " (nonaktif)"}</span></div>
              <div className="text-[11.5px] text-[#5B6B84]">{p.ket}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Jenis revisi</h3>
          <div className="flex flex-wrap gap-1.5">{Object.entries(LABEL_JENIS_JADWAL).map(([k, v]) => <Chip key={k} warna="biru">{v}</Chip>)}</div>
          <h3 className="mt-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Status jadwal revisi</h3>
          <div className="flex flex-wrap gap-1.5">{Object.entries(LABEL_STATUS_JADWAL).map(([k, v]) => <Chip key={k} warna={WARNA_JADWAL[k] ?? "abu"}>{v}</Chip>)}</div>
          <h3 className="mt-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Status usulan RO</h3>
          <div className="flex flex-wrap gap-1.5">{Object.entries(LABEL_STATUS_USULAN).map(([k, v]) => <Chip key={k} warna={WARNA_USULAN[k] ?? "abu"}>{v}</Chip>)}</div>
          <h3 className="mt-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Status catatan kekurangan RAB</h3>
          <div className="flex flex-wrap gap-1.5">{STATUS_KEKURANGAN.map((s) => <Chip key={s.kode} warna={s.warna}>{s.nama}</Chip>)}</div>
        </div>
      </div>
      <p className="text-[12px] text-[#7A8AA3]">Tim kegiatan dan penugasan peran per RO diatur di Penugasan peran (tab Tim pada tiap RO), bukan di master.</p>
    </section>
  );
}

// ---------------------------------------------------------------- riwayat
const waktuId = (iso: string): string => {
  try { return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
};

export function BagianRiwayat({ riwayat, memuat }: { riwayat: RiwayatRow[] | null; memuat: boolean }) {
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Riwayat perubahan master</h2>
      {memuat ? <p className="text-[12.5px] text-[#5B6B84]">Memuat riwayat…</p>
        : !riwayat || riwayat.length === 0 ? <p className="text-[12.5px] text-[#5B6B84]">Belum ada perubahan. Setiap perubahan master mencatat siapa, apa, dan kapan.</p>
        : (
          <ul className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
            {riwayat.map((r) => (
              <li key={r.id} className="rounded-md border border-[#EEF2F7] bg-[#F9FBFE] px-2.5 py-1.5 text-[12.5px]">
                <b>{r.oleh_nama ?? "Sistem"}</b> {ringkasRiwayat(r)} <span className="text-[11px] text-[#7A8AA3]">· {waktuId(r.waktu)}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

// ---------------------------------------------------------------- aturan
const ATURAN: { no: string; judul: string; isi: string }[] = [
  { no: "M1", judul: "Satu sumber", isi: "Papan lain membaca akun, satuan, waktu, kewenangan, dan pola dari master, tanpa salinan." },
  { no: "M2", judul: "Nonaktifkan, jangan hapus", isi: "Master yang pernah dipakai hanya dinonaktifkan. Data lama tetap tampil." },
  { no: "M3", judul: "Perubahan berlaku ke depan", isi: "Dokumen yang sudah dibuat, diunggah, atau diverifikasi tidak berubah saat pola atau nama master berubah." },
  { no: "M4", judul: "Riwayat", isi: "Siapa mengubah apa dan kapan dicatat, seperti revisi anggaran." },
  { no: "M5", judul: "Akun dan satuan dari POK resmi", isi: "Impor POK mengusulkan akun atau satuan baru; Admin Aplikasi yang menetapkan kelompok, pola, dan arti, bukan ditebak sistem." },
  { no: "M6", judul: "Pembatas", isi: "Master kewenangan tidak dapat menghilangkan Admin Aplikasi dari tindakan mengatur akses dan master." },
];
export function AturanMaster() {
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Aturan master</h2>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {ATURAN.map((a) => (
          <div key={a.no} className="rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
            <span className="inline-block rounded bg-[#E3EEFF] px-1.5 py-0.5 text-[11px] font-bold text-[#1F5FD1]">{a.no}</span>
            <h3 className="mt-1 text-[13px] font-bold text-[#0F2A52]">{a.judul}</h3>
            <p className="text-[12px] text-[#5B6B84]">{a.isi}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
