"use client";

// app/sigap/ro/[kode]/HariPenugasan.tsx
//
// (14 Nov 2026, Fase 3) MODAL PEMBARUAN arah RAB -> penugasan untuk angka rujukan HARI DIBAYAR (lib/keu/rujukan.ts).
// Hari dibayar per peran di RAB survei dibandingkan dengan batas hari kerja penugasan (sigap_penugasan.maks_hari) pada kegiatan pendataan yang tertaut.
// Beda -> "Samakan penugasan" membuka modal: nilai lama -> baru, jumlah orang, layar terdampak; Terapkan memanggil keu_rujukan_terapkan_hari (tercatat di
// keu_rujukan_riwayat). "Biarkan berbeda" tidak mengubah apa pun (selisih tetap tampil di sini dan di kartu Angka rujukan identifikasi).

import { useMemo, useState } from "react";
import { Chip, tombolKecil, tombolUtama } from "../../keu-ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { aksiKeu, useBacaKeu } from "../useKeu";
import { urlBaca } from "@/lib/keu/ro";
import { NAMA_PERAN } from "@/lib/keu/lanjutan";
import { bandingHariPenugasan, hariDibayarPerPeran, teksBatas, type BarisPenugasanRujukan, type SelisihHari } from "@/lib/keu/rujukan";

export default function HariPenugasan({ identId, hariTeks, editable }: { identId: number; hariTeks: Record<string, string>; editable: boolean }) {
  const pen = useBacaKeu<BarisPenugasanRujukan>(urlBaca("keu_v_rujukan_penugasan", { ident_id: identId }, { batas: 200 }));
  const hari = useMemo(() => hariDibayarPerPeran(hariTeks), [hariTeks]);
  const selisih = useMemo(() => bandingHariPenugasan(hari, pen.baris ?? []), [hari, pen.baris]);
  const [buka, setBuka] = useState<SelisihHari | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  useTutupDenganBack(buka !== null, () => !sibuk && setBuka(null)); // Back HP = Biarkan berbeda

  if (pen.memuat && !pen.baris) return null;
  if (selisih.length === 0) {
    const adaPendataan = (pen.baris ?? []).some((p) => p.fungsi === "pendataan");
    return (
      <p className="rounded-lg border border-[#DDE6F3] bg-white px-3 py-2 text-[12.5px] text-[#5B6B84]">
        {adaPendataan ? "Isi hari dibayar translok untuk membandingkannya dengan batas hari kerja penugasan." : "Kegiatan pendataan belum tertaut ke identifikasi ini; batas hari kerja penugasan belum bisa dibandingkan."}
      </p>
    );
  }

  async function terapkan(s: SelisihHari) {
    setSibuk(true);
    setPesan(null);
    const r = await aksiKeu<{ ok: boolean; diubah: number }>("keu_rujukan_terapkan_hari", { p_ident: identId, p_kegiatan: s.kegiatan_id, p_peran: s.peran, p_hari: s.hariRab, p_kunci: s.kunci });
    setSibuk(false);
    setBuka(null);
    if (!r.ok) return setPesan({ ok: false, teks: r.pesan });
    setPesan({ ok: true, teks: `Batas hari kerja ${NAMA_PERAN[s.peran]} pada ${s.kegiatan_nama} kini ${s.hariRab} hari (${r.data?.diubah ?? 0} penugasan diperbarui).` });
    await pen.muat();
  }

  const beda = selisih.filter((s) => !s.sama).length;
  return (
    <div className="rounded-xl border border-[#C5D1E6] bg-white p-3">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[#44546F]">Hari dibayar dan batas hari kerja penugasan</p>
      <p className="mt-0.5 text-[12.5px] text-[#5B6B84]">
        Satu angka rujukan untuk tiga layar: RAB ini, kuota hari kerja di Transport lokal, dan kartu Angka rujukan identifikasi.{" "}
        {beda > 0 ? <b className="text-[#8A6200]">{beda} peran berbeda.</b> : <b className="text-[#13794B]">Semua sama.</b>}
      </p>
      <div className="relative mt-2 w-full min-w-0 max-w-full overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#F7F9FC] text-[11px] uppercase tracking-wide text-[#5B6B84]">
              <th className="px-2 py-1.5">Peran · kegiatan</th>
              <th className="px-2 py-1.5 text-right">Hari dibayar (RAB)</th>
              <th className="px-2 py-1.5 text-right">Batas penugasan</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5"><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {selisih.map((s) => (
              <tr key={`${s.kegiatan_id}-${s.peran}-${s.periode}`} className="border-t border-[#EEF2F6] align-top">
                <td className="px-2 py-1.5"><b>{NAMA_PERAN[s.peran]}</b> <span className="text-[#5B6B84]">· {s.kegiatan_nama} · {s.n} orang</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{s.hariRab} hari</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{teksBatas(s.penugasan)}</td>
                <td className="px-2 py-1.5">
                  <Chip warna={s.sama ? "hijau" : "kuning"}>{s.sama ? "Sama" : "Berbeda"}</Chip>
                  {s.lebih.orang > 0 && <span className="mt-0.5 block text-[11.5px] font-semibold text-[#9B1C23]">{s.lebih.orang} orang sudah memilih lebih dari {s.hariRab} hari (sampai {s.lebih.maksDipilih})</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {!s.sama && editable && (
                    <button type="button" className={tombolKecil} onClick={() => setBuka(s)}>
                      Samakan…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pesan && <p className={`mt-2 text-[12.5px] font-semibold ${pesan.ok ? "text-[#13794B]" : "text-[#9B1C23]"}`}>{pesan.teks}</p>}
      {buka && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Data rujukan berubah" onClick={() => !sibuk && setBuka(null)}>
          <div className="w-full max-w-md rounded-t-[18px] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-[18px]" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-extrabold text-[#0F2A52]">Data rujukan berubah</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#44546F]">
              Hari dibayar <b>{NAMA_PERAN[buka.peran]}</b> di RAB survei: <b>{buka.hariRab} hari</b>. Batas hari kerja penugasan pada <b>{buka.kegiatan_nama}</b> sekarang: <b>{teksBatas(buka.penugasan)}</b>.
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#44546F]">
              <li>Transport lokal: kuota hari kerja {buka.n} orang menjadi {buka.hariRab} hari (hari yang sudah dipilih tidak dihapus).</li>
              {buka.lebih.orang > 0 && (
                <li className="font-semibold text-[#9B1C23]">
                  {buka.lebih.orang} orang sudah memilih lebih dari {buka.hariRab} hari (sampai {buka.lebih.maksDipilih}). Hari mereka tetap ada dan bisa melebihi RAB; putuskan: naikkan hari dibayar di RAB, atau minta mereka melepas hari di menu Hari kerja.
                </li>
              )}
              <li>Kartu Angka rujukan identifikasi ikut menampilkan angka ini.</li>
              <li>RAB tidak berubah (sumbernya di sini).</li>
            </ul>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" className={tombolUtama} disabled={sibuk} onClick={() => void terapkan(buka)}>
                {sibuk ? "Menerapkan…" : `Terapkan ke ${buka.n} penugasan`}
              </button>
              <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => setBuka(null)}>
                Biarkan berbeda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
