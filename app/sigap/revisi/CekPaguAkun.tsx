"use client";

// app/sigap/revisi/CekPaguAkun.tsx
//
// (25 Okt 2026) Pemeriksaan kesamaan PAGU PER AKUN PER RO (lib/keu/cekPagu.ts). Dipakai halaman Realisasi (laporan GLP039 vs POK),
// dan halaman lain yang membandingkan POK dengan kertas kerja. Hanya PERINGATAN: bila beda, pengguna diarahkan ke kertas kerja RO
// yang bersangkutan karena yang seharusnya dipakai adalah POK resmi. Tidak ada padanan baris dan tidak ada keputusan per baris.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  barisBermasalah, bandingPaguAkun, LABEL_STATUS_CEK, paguDariKertasKerja, paguDariPok, ringkasCek, tautanKertasKerja,
  type HasilCekPagu, type OpsiCek, type PaguAkun, type StatusCek,
} from "@/lib/keu/cekPagu";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { useBacaKeu } from "../ro/useKeu";
import { Chip, Galat, judulKartu, kartu, Memuat, Potong, tombolKecil } from "../keu-ui";

export type SumberSistem = { jenis: "pok" } | { jenis: "kertas"; jadwalId: number };

/** Pagu per RO+akun pada sisi sistem: POK berlaku (keu_v_adm_lembar) atau kolom Menjadi satu kertas kerja (keu_v_kk_baris). */
export function useSisiSistem(sumber: SumberSistem, aktif = true) {
  const pok = useBacaKeu<{ ro_kode: string; akun_kode: string; jumlah: number | string }>(
    aktif && sumber.jenis === "pok" ? urlBaca("keu_v_adm_lembar", {}, { batas: 20000, kolom: ["ro_kode", "akun_kode", "jumlah"] }) : null,
  );
  const kk = useBacaKeu<{ ro_kode: string; akun_menjadi: string; jumlah_menjadi: number | string | null }>(
    aktif && sumber.jenis === "kertas" ? urlBaca("keu_v_kk_baris", { jadwal_id: sumber.jadwalId }, { batas: 20000, kolom: ["ro_kode", "akun_menjadi", "jumlah_menjadi"] }) : null,
  );
  const sumberAktif = sumber.jenis === "pok" ? pok : kk;
  const sistem = useMemo<PaguAkun[] | null>(() => {
    if (sumber.jenis === "pok") return pok.baris ? paguDariPok(pok.baris) : null;
    return kk.baris ? paguDariKertasKerja(kk.baris) : null;
  }, [sumber.jenis, pok.baris, kk.baris]);
  return { sistem, memuat: aktif && !sumberAktif.galat && sistem === null, galat: aktif ? sumberAktif.galat : null, terpotong: aktif && sumberAktif.terpotong };
}

/** Status ringkas untuk penunjuk langkah. */
export function statusCek(resmi: PaguAkun[] | null, sistem: PaguAkun[] | null, galat: string | null, opsi?: OpsiCek): { status: "belum" | "memuat" | "sama" | "beda" | "tak_ada"; hasil: HasilCekPagu | null } {
  if (!resmi || resmi.length === 0) return { status: "belum", hasil: null };
  if (galat) return { status: "tak_ada", hasil: null };
  if (!sistem) return { status: "memuat", hasil: null };
  const hasil = bandingPaguAkun(resmi, sistem, opsi);
  if (hasil.baris.length === 0) return { status: "tak_ada", hasil };
  return { status: hasil.sama ? "sama" : "beda", hasil };
}

const WARNA_STATUS: Record<StatusCek, "hijau" | "kuning" | "merah" | "abu"> = { sama: "hijau", beda: "kuning", hanya_resmi: "merah", hanya_sistem: "merah" };
const BATAS_BARIS = 60;

export default function KartuCekPagu({ hasil, memuat, galat, terpotong, namaResmi, namaSistem, jadwalId, namaRo, judul = "Cek pagu per akun per RO" }: {
  hasil: HasilCekPagu | null; memuat: boolean; galat: string | null; terpotong?: boolean;
  namaResmi: string; namaSistem: string; jadwalId?: number | null; namaRo?: Map<string, string>; judul?: string;
}) {
  const [semua, setSemua] = useState(false);
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const ro = hasil?.roBermasalah ?? [];
  const tampilRo = semua ? ro : ro.slice(0, 8);

  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-cek-pagu">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="judul-cek-pagu" className={judulKartu}>{judul}</h3>
        {hasil && hasil.baris.length > 0 && (hasil.sama ? <Chip warna="hijau">Sama</Chip> : <Chip warna="kuning">{angka(hasil.baris.length - hasil.nSama)} akun berbeda</Chip>)}
      </div>
      <p className="text-[12.5px] text-[#5B6B84]">
        Membandingkan <b>{namaResmi}</b> dengan <b>{namaSistem}</b>, hanya jumlah pagu tiap akun pada tiap RO (tidak sampai item). Ini pengecekan: bila berbeda, yang dipakai seharusnya POK resmi, jadi kertas kerja yang disesuaikan.
      </p>
      <Galat pesan={galat ? `Pembanding tidak dapat dimuat: ${galat}` : null} />
      {memuat && !galat && <Memuat tinggi="h-16" />}
      {terpotong && <Potong />}

      {hasil && hasil.baris.length === 0 && !memuat && (
        <p className="rounded-md border-l-4 border-[#6B7A93] bg-[#F3F6FA] px-3 py-2 text-[12.5px] text-[#44546F]">Tidak ada akun yang dapat dibandingkan ({namaResmi} dan {namaSistem} tidak memiliki RO yang sama).</p>
      )}
      {hasil && hasil.baris.length > 0 && (
        <>
          <p role="status" className={`rounded-md border-l-4 px-3 py-2 text-[12.5px] font-semibold ${hasil.sama ? "border-[#1F8A4C] bg-[#E6F6EC] text-[#14653A]" : "border-[#B8860B] bg-[#FFF4D6] text-[#6B4E00]"}`}>
            {ringkasCek(hasil, namaResmi, namaSistem)}{" "}
            {!hasil.sama && <>Total {namaResmi} {rupiah(hasil.totalResmi)}; total {namaSistem} {rupiah(hasil.totalSistem)} (selisih {hasil.selisihTotal > 0 ? "+" : ""}{angka(hasil.selisihTotal)}).</>}
          </p>
          {hasil.roTakDibandingkan.length > 0 && (
            <p className="text-[12px] text-[#6B7A93]">{angka(hasil.roTakDibandingkan.length)} RO tidak dibandingkan karena tidak ada di salah satu sisi.</p>
          )}

          {!hasil.sama && (
            <>
              <p className="text-[12.5px] font-bold text-[#6B4E00]">Ubah kertas kerja RO berikut agar sama dengan POK resmi:</p>
              <ul className="flex flex-col gap-2">
                {tampilRo.map((r) => {
                  const bb = barisBermasalah(hasil, r);
                  const selisih = bb.reduce((t, x) => t + x.selisih, 0);
                  const buka = terbuka === r;
                  return (
                    <li key={r} className="rounded-lg border border-[#E6D9A8] bg-[#FFFCF0] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <b className="text-[13px] text-[#0F2A52]">{r}</b>{namaRo?.get(r) ? <span className="text-[12.5px] text-[#5B6B84]"> · {namaRo.get(r)}</span> : null}
                          <div className="text-[12px] text-[#6B4E00]">{angka(bb.length)} akun tidak sama · selisih {selisih > 0 ? "+" : ""}{angka(selisih)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className={tombolKecil} aria-expanded={buka} onClick={() => setTerbuka(buka ? null : r)}>{buka ? "Sembunyikan akun" : "Lihat akun"}</button>
                          <Link href={tautanKertasKerja(r, jadwalId)} className="inline-flex min-h-[40px] items-center rounded-md border border-[#1F5FD1] bg-[#1F5FD1] px-3 text-[13px] font-semibold text-white no-underline">Buka kertas kerja</Link>
                        </div>
                      </div>
                      {buka && (
                        <div className="mt-2 overflow-x-auto rounded-md border border-[#EEE3B8] bg-white">
                          <table className="w-full min-w-[480px] text-left text-[12px]">
                            <thead className="bg-[#FFF4D6] text-[#6B4E00]"><tr><th className="px-2 py-1.5">Akun</th><th className="px-2 py-1.5 text-right">{namaResmi}</th><th className="px-2 py-1.5 text-right">{namaSistem}</th><th className="px-2 py-1.5 text-right">Selisih</th><th className="px-2 py-1.5">Keterangan</th></tr></thead>
                            <tbody>
                              {bb.slice(0, BATAS_BARIS).map((x) => (
                                <tr key={x.akun} className="border-t border-[#F2EBCB]">
                                  <td className="px-2 py-1 font-bold">{x.akun}</td>
                                  <td className="px-2 py-1 text-right">{angka(x.resmi)}</td>
                                  <td className="px-2 py-1 text-right">{angka(x.sistem)}</td>
                                  <td className="px-2 py-1 text-right font-semibold">{x.selisih > 0 ? "+" : ""}{angka(x.selisih)}</td>
                                  <td className="px-2 py-1"><Chip warna={WARNA_STATUS[x.status]}>{LABEL_STATUS_CEK[x.status]}</Chip></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {ro.length > 8 && <button type="button" className={`${tombolKecil} w-fit`} onClick={() => setSemua((x) => !x)}>{semua ? "Ringkas daftar RO" : `Tampilkan semua ${angka(ro.length)} RO`}</button>}
            </>
          )}
        </>
      )}
    </section>
  );
}
