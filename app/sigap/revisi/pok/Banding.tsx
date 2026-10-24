"use client";

// app/sigap/revisi/pok/Banding.tsx
//
// (24 Okt 2026) Hasil pencocokan satu unggahan PDF POK dengan POK sistem yang berlaku (keu_v_pok_banding): hanya baris yang berselisih
// (berubah, baru, hilang, dipadankan) dibaca; yang sama cukup dihitung di ringkasan. Dikelompokkan per RO. PPK dapat memadankan baris 'baru'
// dengan baris 'hilang' pada RO yang sama (uraian berganti nama) supaya nomor item, RAB, dan realisasinya tidak putus.

import { useMemo, useState } from "react";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import {
  bandingRo, calonPadan, LABEL_BANDING, ringkasPerRo, WARNA_BANDING, type BarisBanding, type RingkasUnggah,
} from "@/lib/keu/pok";
import { useBacaKeu, useKirim } from "../../ro/useKeu";
import { Chip, Galat, Memuat, Potong, tombolBahaya, tombolKecil } from "../../keu-ui";

const STATUS_SELISIH = ["berubah", "baru", "hilang", "dipadankan"];
const n = (x: number | string | null | undefined) => (x === null || x === undefined ? 0 : Number(x));
const selisihTeks = (x: number | string | null) => {
  const v = n(x);
  return v === 0 ? "-" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`;
};

export default function Banding({ unggahId, boleh, namaRo, ringkas, muatUlang }: {
  unggahId: number; boleh: boolean; namaRo: Map<string, string>; ringkas: RingkasUnggah | null; muatUlang: () => Promise<void>;
}) {
  const data = useBacaKeu<BarisBanding>(urlBaca("keu_v_pok_banding", { unggah_id: unggahId, status: STATUS_SELISIH }, { batas: 5000 }));
  const muat = async () => { await Promise.all([data.muat(), muatUlang()]); };
  const { kirim, mengirim, galat, hapusGalat } = useKirim(muat);
  const [buka, setBuka] = useState<string | null>(null);

  const ringkasRo = useMemo(() => ringkasPerRo(data.baris ?? []).filter((r) => r.beda), [data.baris]);

  if (data.galat) return <Galat pesan={data.galat} />;
  if (!data.baris) return <Memuat tinggi="h-20" />;
  if (ringkasRo.length === 0) {
    return <p className="text-[13px] font-semibold text-[#14653A]">Tidak ada selisih: seluruh {angka(ringkas?.n_baris)} baris PDF sama dengan POK sistem yang berlaku.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {data.terpotong && <Potong />}
      <Galat pesan={galat} />
      <p className="text-[12.5px] text-[#5B6B84]">{ringkasRo.length} RO berselisih. Pilih RO untuk melihat barisnya. {boleh && "Baris baru yang sebenarnya hanya berganti nama dapat dipadankan dengan baris lama supaya RAB dan realisasinya tidak putus."}</p>
      <ul className="flex flex-col gap-2">
        {ringkasRo.map((r) => {
          const terbuka = buka === r.ro;
          return (
            <li key={r.ro} className="rounded-lg border border-[#DCE3EE] bg-white">
              <button type="button" aria-expanded={terbuka} onClick={() => { hapusGalat(); setBuka(terbuka ? null : r.ro); }}
                className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left">
                <span className="min-w-0">
                  <span className="block text-[13px] font-extrabold text-[#0F2A52]">{r.ro}</span>
                  <span className="block truncate text-[12px] text-[#5B6B84]">{namaRo.get(r.ro) ?? "RO belum terdaftar di sistem"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {r.berubah > 0 && <Chip warna="kuning">{r.berubah} berubah</Chip>}
                  {r.baru > 0 && <Chip warna="hijau">{r.baru} baru</Chip>}
                  {r.hilang > 0 && <Chip warna="merah">{r.hilang} hilang</Chip>}
                  {r.dipadankan > 0 && <Chip warna="biru">{r.dipadankan} dipadankan</Chip>}
                  {r.diLuarUsulan > 0 && <Chip warna="ungu">{r.diLuarUsulan} di luar usulan</Chip>}
                  <b className={`min-w-[84px] text-right text-[13px] ${r.selisih === 0 ? "text-[#5B6B84]" : r.selisih > 0 ? "text-[#14653A]" : "text-[#B42329]"}`}>{selisihTeks(r.selisih)}</b>
                </span>
              </button>
              {terbuka && <PanelRo ro={r.ro} semua={data.baris ?? []} boleh={boleh} mengirim={mengirim} kirim={kirim} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PanelRo({ ro, semua, boleh, mengirim, kirim }: {
  ro: string; semua: BarisBanding[]; boleh: boolean; mengirim: boolean; kirim: (f: string, a: Record<string, unknown>) => Promise<boolean>;
}) {
  const baris = useMemo(() => bandingRo(semua, ro), [semua, ro]);
  const hilangId = useMemo(() => baris.filter((b) => b.status === "hilang" && b.detail_id !== null).map((b) => Number(b.detail_id)).slice(0, 50), [baris]); // batas daftar-nilai gerbang baca = 50
  const kunci = useBacaKeu<{ id: number; kunci_stabil: string }>(hilangId.length ? urlBaca("keu_pok_detail", { id: hilangId }, { batas: 1000, kolom: ["id", "kunci_stabil"] }) : null);
  const kunciPer = useMemo(() => new Map((kunci.baris ?? []).map((k) => [Number(k.id), k.kunci_stabil])), [kunci.baris]);
  const [pilih, setPilih] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto border-t border-[#EEF2F7]">
      <table className="w-full min-w-[820px] text-left text-[12px]">
        <thead className="bg-[#EEF3FB] text-[#44546F]">
          <tr><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Akun</th><th className="px-2 py-1.5">Uraian</th><th className="px-2 py-1.5 text-right">POK sistem</th><th className="px-2 py-1.5 text-right">PDF resmi</th><th className="px-2 py-1.5 text-right">Selisih</th><th className="px-2 py-1.5">Aksi</th></tr>
        </thead>
        <tbody>
          {baris.map((b, i) => {
            const st = b.status;
            const id = b.baris_id ?? -(i + 1);
            const calon = st === "baru" && pilih === id ? calonPadan(b, semua).slice(0, 6) : [];
            return (
              <tr key={`${st}-${b.baris_id ?? "x"}-${b.detail_id ?? "y"}-${i}`} className="border-t border-[#EEF2F7] align-top">
                <td className="px-2 py-1.5"><Chip warna={WARNA_BANDING[st]}>{LABEL_BANDING[st]}</Chip>{b.di_luar_usulan && <div className="mt-1 text-[11px] font-bold text-[#6B3FA0]">di luar usulan</div>}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-semibold">{b.akun_kode}</td>
                <td className="px-2 py-1.5">
                  {st === "berubah" || st === "dipadankan" ? (
                    <>
                      <div>{b.uraian_baru}</div>
                      {b.uraian_lama !== b.uraian_baru && <div className="text-[#7A5252] line-through">{b.uraian_lama}</div>}
                      <div className="text-[#5B6B84]">vol {n(b.vol_lama)} → {n(b.vol_baru)} · harga {angka(b.harga_lama)} → {angka(b.harga_baru)}</div>
                    </>
                  ) : <div>{st === "baru" ? b.uraian_baru : b.uraian_lama}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">{b.jumlah_lama === null ? "-" : rupiah(b.jumlah_lama)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">{b.jumlah_baru === null ? "-" : rupiah(b.jumlah_baru)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold">{selisihTeks(b.selisih)}</td>
                <td className="min-w-[180px] px-2 py-1.5">
                  {boleh && st === "baru" && b.baris_id !== null && (
                    pilih === id ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[11.5px] font-semibold text-[#44546F]">Padankan dengan baris lama:</div>
                        {calon.length === 0 && <div className="text-[11.5px] text-[#5B6B84]">Tidak ada baris hilang pada RO ini.</div>}
                        {calon.map((c) => {
                          const k = kunciPer.get(Number(c.baris.detail_id));
                          return (
                            <button key={c.baris.detail_id} type="button" disabled={mengirim || !k}
                              title={k ? undefined : "Kunci baris lama belum termuat"}
                              onClick={async () => { if (k && await kirim("keu_pok_unggah_padankan", { p_baris: b.baris_id, p_kunci_lama: k })) setPilih(null); }}
                              className={`${tombolKecil} !min-h-[44px] text-left`}>
                              <span className="block text-[12px]">{c.baris.uraian_lama}</span>
                              <span className="block text-[11px] font-normal text-[#5B6B84]">{c.baris.akun_kode} · {rupiah(c.baris.jumlah_lama)} · kemiripan {Math.round(Math.min(1, c.skor) * 100)}%</span>
                            </button>
                          );
                        })}
                        <button type="button" className={tombolKecil} onClick={() => setPilih(null)}>Tutup</button>
                      </div>
                    ) : hilangId.length > 0 ? <button type="button" className={tombolKecil} onClick={() => setPilih(id)}>Padankan...</button> : null
                  )}
                  {boleh && st === "dipadankan" && b.baris_id !== null && (
                    <button type="button" disabled={mengirim} className={tombolBahaya} onClick={() => void kirim("keu_pok_unggah_lepas_padan", { p_baris: b.baris_id })}>Lepas padanan</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
