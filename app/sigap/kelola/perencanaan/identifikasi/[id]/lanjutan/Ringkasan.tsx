"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/Ringkasan.tsx
//
// (25 Okt 2026, tahap 29) Kartu pendukung Identifikasi lanjutan: status dan peringatan, rincian kebutuhan dan biaya, daftar dokumen turunan, dan riwayat versi.

import Link from "next/link";
import { Catatan, Chip, judulKartu, kartu, kolom, tombolUtama } from "@/app/sigap/keu-ui";
import {
  ID_LJ, jumlahRincian, labelStatusLanjutan, NAMA_DOKUMEN, tujuanLanjutan, type BarisRincian, type JenisDokumen, type StatusLanjutan,
} from "@/lib/keu/lanjutan";
import { daftarKunci } from "@/lib/keu/lanjutanDokumen";
import type { IsiLanjutan } from "@/lib/keu/lanjutan";
import { Bagian, Poin, Tautan } from "../../Kontrol";
import type { BarisDokumen, VersiLanjutan } from "./useLanjutan";

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const waktu = (iso: string): string => {
  try { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)); } catch { return iso; }
};

// ---------------------------------------------------------------------------------------------------------------------
export function KartuStatusLj(p: {
  status: StatusLanjutan; ada: boolean; ver: number | null; pascaH15: boolean; dirty: boolean;
  alasanDraf: string[]; peringatan: string[]; alasan: string; setAlasan: (s: string) => void; wajibAlasan: boolean;
  bisa: boolean; mengirim: boolean; galat: string | null; onSimpan: () => void; syaratKurang: string[]; dikecualikan?: Set<string>;
}) {
  const st = labelStatusLanjutan(p.status);
  return (
    <section id={ID_LJ.status} className={`${kartu} flex scroll-mt-20 flex-col gap-3`} aria-labelledby="h-lj-status">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="h-lj-status" className={`${judulKartu} m-0`}>Status identifikasi lanjutan</h2>
        <Chip warna={st.nada}>{st.teks}</Chip>
        {p.ada ? <Chip warna="biru">Versi {p.ver}</Chip> : <Chip warna="abu">Belum disimpan</Chip>}
        {p.pascaH15 && <Chip warna="merah">Diubah sesudah H-15</Chip>}
        {p.dirty && <Chip warna="kuning">Ada perubahan belum disimpan</Chip>}
      </header>
      {p.alasanDraf.length > 0 ? (
        <div>
          <p className="m-0 mb-1 text-[12.5px] font-semibold text-[#44546F]">Masih Draf karena:</p>
          <Poin butir={p.alasanDraf.map((a) => <Tautan key={a} ke={tujuanLanjutan(a)}>{a}</Tautan>)} />
        </div>
      ) : (
        <p className="m-0 text-[13px] text-[#14653A]">Semua isian Fix dan nama petugas lengkap. Dokumen turunan dapat diterbitkan.</p>
      )}
      {p.peringatan.length > 0 && (
        <Catatan>
          <p className="m-0 mb-1 font-semibold">Peringatan terhadap identifikasi awal dan lembar kebijakan (tidak memblokir penyimpanan):</p>
          <Poin kelas="!text-[#5C4300]" butir={p.peringatan.map((w) => <span key={w}><Tautan ke={tujuanLanjutan(w)}>{w}</Tautan>{p.dikecualikan?.has(w) && <span className="ml-1.5 rounded bg-[#E6F6EC] px-1.5 text-[11px] font-semibold text-[#14653A]">dikecualikan KPA</span>}</span>)} />
        </Catatan>
      )}
      {p.wajibAlasan && (
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Alasan perubahan sesudah H-15 (wajib, minimal 10 huruf)</span>
          <textarea className={`${kolom} min-h-[64px] py-2`} rows={2} maxLength={500} value={p.alasan} onChange={(e) => p.setAlasan(e.target.value)} />
        </label>
      )}
      {p.syaratKurang.length > 0 && <Poin butir={p.syaratKurang} />}
      {p.galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{p.galat}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tombolUtama} disabled={!p.bisa || p.mengirim || !p.dirty && p.ada || p.syaratKurang.length > 0} onClick={p.onSimpan}>
          {p.mengirim ? "Menyimpan…" : p.ada ? "Simpan identifikasi lanjutan" : "Simpan versi pertama"}
        </button>
        {!p.bisa && <span className="text-[12.5px] text-[#5B6B84]">Menyusun hanya untuk ketua tim, admin RO, atau PPK RO ini.</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuRincian({ baris, adaLembar }: { baris: BarisRincian[]; adaLembar: boolean }) {
  const j = jumlahRincian(baris);
  return (
    <Bagian huruf="5" judul="Rincian kebutuhan dan biaya" id={ID_LJ.rincian}>
      <Catatan>
        Angka di sini hanya perkiraan kebutuhan dan <strong>belum sah</strong>; tarif mengikuti lembar kebijakan yang berlaku
        {adaLembar ? "" : " (belum ada lembar yang berlaku, sehingga tarif kosong)"}. Baris tanpa jumlah menunggu data tarif atau jumlah hari.
      </Catatan>
      {baris.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada kebutuhan yang dapat dirinci.</p> : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.04em] text-[#5B6B84]">
                <th className="py-1.5 pr-2">Uraian</th><th className="py-1.5 pr-2">Akun</th><th className="py-1.5 pr-2 text-right">Volume</th>
                <th className="py-1.5 pr-2 text-right">Tarif</th><th className="py-1.5 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b, i) => (
                <tr key={i} className="border-t border-[#EEF2F7] align-top">
                  <td className="py-1.5 pr-2">
                    <span className="text-[#0F2A52]">{b.uraian}</span>{b.perk && <span className="ml-1.5 rounded bg-[#FFF4D6] px-1 text-[11px] font-semibold text-[#8A6200]">≈</span>}
                    {b.catatan && <span className="block text-[11.5px] text-[#5B6B84]">{b.catatan}</span>}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{b.akun}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{b.volume === null ? "—" : `${b.volume.toLocaleString("id-ID")} ${b.satuan}`}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{b.tarif === null ? "—" : rp(b.tarif)}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.jumlah === null ? "—" : rp(b.jumlah)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 text-[12.5px] text-[#44546F]">Terhitung {j.terhitung} baris senilai <strong>{rp(j.total)}</strong>; {j.belum} baris belum dapat dihitung.</p>
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuDokumen({ identId, isi, dokumen, final }: { identId: number; isi: IsiLanjutan; dokumen: BarisDokumen[]; final: boolean }) {
  const jenis: JenisDokumen[] = ["undangan", "pengantar", "tugas"];
  return (
    <Bagian huruf="6" judul="Dokumen turunan" id={ID_LJ.dokumen}>
      <Catatan>
        Dokumen berstatus <strong>konsep</strong> selama lanjutan masih Draf. Nomor surat diisi manual dan penandatangan dipilih per dokumen; format baku surat kantor
        masih konsep dan dapat disesuaikan.{!final && " Penerbitan menunggu status Final."}
      </Catatan>
      {jenis.map((j) => {
        const daftar = daftarKunci(j, isi);
        return (
          <div key={j} className="min-w-0">
            <h3 className="m-0 mb-1.5 text-[13.5px] font-bold text-[#0F2A52]">{NAMA_DOKUMEN[j]} <span className="font-normal text-[#5B6B84]">({daftar.length})</span></h3>
            {daftar.length === 0 ? <p className="m-0 text-[12.5px] text-[#5B6B84]">{j === "undangan" ? "Belum ada kelas." : "Belum ada petugas."}</p> : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {daftar.map((d) => {
                  const rec = dokumen.find((x) => x.jenis === j && x.kunci === d.kunci);
                  return (
                    <li key={d.kunci} className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-[#EEF2F7] px-2.5 py-1.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 break-words text-[#1B2B4B]">{d.label}</span>
                      {rec ? <Chip warna={rec.status === "terbit" ? "hijau" : "kuning"}>{rec.status === "terbit" ? `Terbit ${rec.nomor}` : "Konsep"}</Chip> : <Chip warna="abu">Belum dibuat</Chip>}
                      <Link
                        className="rounded-md border border-[#C5D0E2] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-[#1F5FD1] hover:bg-[#EEF2F7]"
                        href={`/sigap/kelola/perencanaan/identifikasi/${identId}/lanjutan/dokumen?jenis=${j}&kunci=${encodeURIComponent(d.kunci)}`}
                      >Buka</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuVersiLj({ versi }: { versi: VersiLanjutan[] }) {
  return (
    <section id={ID_LJ.riwayat} className={`${kartu} flex scroll-mt-20 flex-col gap-2`} aria-labelledby="h-lj-versi">
      <h2 id="h-lj-versi" className={`${judulKartu} m-0`}>Riwayat versi</h2>
      {versi.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada versi tersimpan.</p> : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {versi.map((v) => (
            <li key={v.id} className="rounded-md border border-[#EEF2F7] px-2.5 py-1.5 text-[12.5px] text-[#1B2B4B]">
              <div className="flex flex-wrap items-center gap-2">
                <strong>Versi {v.ver}</strong><Chip warna={v.status === "final" ? "hijau" : "kuning"}>{v.status === "final" ? "Final" : "Draf"}</Chip>
                {v.pasca_h15 && <Chip warna="merah">Sesudah H-15</Chip>}
                <span className="ml-auto text-[11.5px] text-[#5B6B84]">{v.oleh_nama ?? "—"} · {waktu(v.waktu)}</span>
              </div>
              {v.alasan && <p className="m-0 mt-1 text-[12px] text-[#44546F]">{v.alasan}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
