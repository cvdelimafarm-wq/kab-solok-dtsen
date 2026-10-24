"use client";

// app/sigap/revisi/pok/Banding.tsx
//
// (24 Okt 2026, papan 6) Hasil pencocokan satu unggahan POK resmi dengan POK sistem DAN dengan usulan (kolom Menjadi kertas kerja) lewat kunci baris
// (keu_v_pok_banding_rinci): satu tabel datar dengan penyaring berhitungan (perlu keputusan, semua, sama, berubah, baru, hilang, dipadankan, di luar usulan),
// kolom Catatan (mengapa baris itu berstatus demikian) dan Keputusan operator. Baris sama, baru, dan hilang yang sesuai usulan diterima otomatis; baris berubah
// dan baris di luar usulan menunggu keputusan PPK ("Pakai angka berkas" atau "Tandai ditanyakan"). Sistem tidak menebak mana yang benar. PPK juga dapat
// memadankan baris 'baru' dengan baris 'hilang' pada RO yang sama (uraian berganti nama) supaya nomor item, RAB, dan realisasinya tidak putus.

import { useMemo, useState } from "react";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import {
  argsTandai, argsTandaiSemua, calonPadan, catatanBaris, cocokSaringan, hitungSaringan, LABEL_BANDING, LABEL_SARINGAN, selisihUsulan, teksKeputusan,
  URUTAN_SARINGAN, WARNA_BANDING, type BarisRinci, type KeputusanUnggah, type RingkasUnggah, type Saringan,
} from "@/lib/keu/pok";
import { aksiKeu, useBacaKeu, useKirim } from "../../ro/useKeu";
import { Chip, Galat, Memuat, Potong, tombolAktif, tombolBahaya, tombolKecil } from "../../keu-ui";

const n = (x: number | string | null | undefined) => (x === null || x === undefined ? 0 : Number(x));
const selisihTeks = (x: number | null) => (x === null || x === 0 ? "-" : `${x > 0 ? "+" : "-"}${angka(Math.abs(x))}`);
const NAMA_KOLOM = ["Kunci baris", "Uraian", "RO", "POK sistem", "Usulan (Menjadi)", "Berkas", "Selisih", "Hasil", "Catatan", "Keputusan operator"];
const HALAMAN = 150;

export default function Banding({ unggahId, boleh, namaRo, ringkas, keputusan, muatUlang }: {
  unggahId: number; boleh: boolean; namaRo: Map<string, string>; ringkas: RingkasUnggah | null; keputusan: KeputusanUnggah | null; muatUlang: () => Promise<void>;
}) {
  const data = useBacaKeu<BarisRinci>(urlBaca("keu_v_pok_banding_rinci", { unggah_id: unggahId }, { batas: 5000 }));
  const muat = async () => { await Promise.all([data.muat(), muatUlang()]); };
  const { kirim, jalankan, mengirim, galat, hapusGalat } = useKirim(muat);
  const [saringan, setSaringan] = useState<Saringan | null>(null);
  const [ro, setRo] = useState("");
  const [tampil, setTampil] = useState(HALAMAN);
  const [pilih, setPilih] = useState<string | null>(null);

  const baris = data.baris;
  const adaUsulan = useMemo(() => (baris ?? []).some((b) => b.jadwal_id !== null && b.jadwal_id !== undefined), [baris]);
  const hitung = useMemo(() => hitungSaringan(baris ?? []), [baris]);
  const aktif: Saringan = saringan ?? (hitung.perlu > 0 ? "perlu" : "semua");
  const daftarRo = useMemo(() => [...new Set((baris ?? []).filter((b) => cocokSaringan(b, aktif)).map((b) => b.ro_kode))].sort(), [baris, aktif]);
  const terpilih = useMemo(() => {
    const urutan = { berubah: 0, baru: 1, hilang: 2, dipadankan: 3, sama: 4 } as const;
    return (baris ?? [])
      .filter((b) => cocokSaringan(b, aktif) && (!ro || b.ro_kode === ro))
      .sort((a, b) => a.ro_kode.localeCompare(b.ro_kode) || urutan[a.status] - urutan[b.status] || a.akun_kode.localeCompare(b.akun_kode));
  }, [baris, aktif, ro]);

  if (data.galat) return <Galat pesan={data.galat} />;
  if (!baris) return <Memuat tinggi="h-20" />;

  const menunggu = n(keputusan?.n_menunggu);
  const ubahSaringan = (s: Saringan) => { setSaringan(s); setRo(""); setTampil(HALAMAN); setPilih(null); hapusGalat(); };

  return (
    <div className="flex flex-col gap-2.5">
      {data.terpotong && <Potong />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Penyaring hasil pencocokan">
          {URUTAN_SARINGAN.filter((s) => s !== "luar" || adaUsulan).map((s) => (
            <button key={s} type="button" aria-pressed={aktif === s} className={`${aktif === s ? tombolAktif : tombolKecil} !min-h-[36px]`} onClick={() => ubahSaringan(s)}>{LABEL_SARINGAN[s]} ({angka(hitung[s])})</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-[#44546F]">RO
          <select value={ro} onChange={(e) => { setRo(e.target.value); setTampil(HALAMAN); setPilih(null); }} className="min-h-[36px] rounded-md border border-[#C9D4E5] bg-white px-2 text-[12.5px]">
            <option value="">Semua RO ({daftarRo.length})</option>
            {daftarRo.map((k) => <option key={k} value={k}>{k} {namaRo.get(k) ? `· ${namaRo.get(k)!.slice(0, 40)}` : ""}</option>)}
          </select>
        </label>
      </div>
      {!adaUsulan && <p className="text-[12px] text-[#5B6B84]">Unggahan ini tidak punya jadwal revisi dasar, jadi tidak ada usulan pembanding: semua selisih terhadap POK sistem menunggu keputusan operator.</p>}
      <p className="text-[12px] text-[#5B6B84]">Baris sama, baru, dan hilang yang sesuai usulan diterima otomatis. Baris berubah dan baris di luar usulan menunggu keputusan operator. Sistem tidak menebak mana yang benar.</p>
      <Galat pesan={galat} />

      {boleh && menunggu > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={mengirim} className={tombolKecil} onClick={() => void jalankan(() => aksiKeu("keu_pok_unggah_tandai_semua", argsTandaiSemua(unggahId)))}>
            Pakai angka berkas untuk semua yang menunggu ({angka(menunggu)})
          </button>
          <span className="text-[12px] text-[#5B6B84]">Baris yang ditandai ditanyakan tidak ikut. Setiap tanda dapat diubah sebelum unggahan diterima.</span>
        </div>
      )}

      {terpilih.length === 0 ? (
        <p className="text-[13px] font-semibold text-[#14653A]">
          {aktif === "perlu" ? "Tidak ada baris yang menunggu keputusan." : "Tidak ada baris pada penyaring ini."}
          {" "}{n(ringkas?.n_baris) > 0 && `Unggahan memuat ${angka(ringkas?.n_baris)} baris.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[1080px] border-collapse text-left text-[12px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]">
              <tr>{NAMA_KOLOM.filter((k) => adaUsulan || k !== "Usulan (Menjadi)").map((k) => <th key={k} className={`px-2 py-1.5 font-bold ${["POK sistem", "Usulan (Menjadi)", "Berkas", "Selisih"].includes(k) ? "text-right" : ""}`}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {terpilih.slice(0, tampil).map((b, i) => (
                <Baris key={`${b.status}-${b.baris_id ?? "x"}-${b.detail_id ?? "y"}-${i}`} b={b} adaUsulan={adaUsulan} boleh={boleh} mengirim={mengirim} kirim={kirim}
                  semua={baris} pilih={pilih} setPilih={setPilih} unggahId={unggahId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {terpilih.length > tampil && (
        <button type="button" className={`${tombolKecil} self-start`} onClick={() => setTampil((t) => t + HALAMAN)}>Tampilkan {angka(Math.min(HALAMAN, terpilih.length - tampil))} baris lagi (dari {angka(terpilih.length - tampil)} tersisa)</button>
      )}
    </div>
  );
}

function Baris({ b, adaUsulan, boleh, mengirim, kirim, semua, pilih, setPilih, unggahId }: {
  b: BarisRinci; adaUsulan: boolean; boleh: boolean; mengirim: boolean; kirim: (f: string, a: Record<string, unknown>) => Promise<boolean>;
  semua: BarisRinci[]; pilih: string | null; setPilih: (v: string | null) => void; unggahId: number;
}) {
  const st = b.status;
  const id = b.kunci ?? `${st}-${b.baris_id ?? b.detail_id}`;
  const calon = st === "baru" && pilih === id ? calonPadan(b, semua).slice(0, 6) : [];
  const adaHilang = semua.some((h) => h.status === "hilang" && h.ro_kode === b.ro_kode);
  const dU = adaUsulan ? selisihUsulan(b) : null;
  const selisih = dU !== null ? dU : adaUsulan && st !== "hilang" ? null : n(b.selisih);
  const uraian = st === "baru" ? b.uraian_baru : st === "hilang" ? b.uraian_lama : b.uraian_baru;
  const perluPutus = st !== "sama" && !b.otomatis;
  const bolehPutus = boleh && st !== "sama" && st !== "dipadankan" && b.kunci !== null && (perluPutus || b.tanda !== "belum");

  return (
    <tr className="border-t border-[#E7ECF4] align-top">
      <td className="max-w-[210px] break-words px-2 py-1.5 font-mono text-[11px] text-[#5B6B84]">{b.kunci ?? "-"}</td>
      <td className="min-w-[200px] px-2 py-1.5">
        <div>{uraian}</div>
        {(st === "berubah" || st === "dipadankan") && b.uraian_lama !== b.uraian_baru && <div className="text-[#7A5252] line-through">{b.uraian_lama}</div>}
        {(st === "berubah" || st === "dipadankan") && <div className="text-[#5B6B84]">vol {n(b.vol_lama)} → {n(b.vol_baru)} · harga {angka(b.harga_lama)} → {angka(b.harga_baru)}</div>}
        <div className="text-[11px] text-[#6B7A93]">akun {b.akun_kode}</div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px]">{b.ro_kode}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right">{b.jumlah_lama === null ? "-" : rupiah(b.jumlah_lama)}</td>
      {adaUsulan && <td className="whitespace-nowrap px-2 py-1.5 text-right">{b.jumlah_usulan === null ? "-" : rupiah(b.jumlah_usulan)}</td>}
      <td className="whitespace-nowrap px-2 py-1.5 text-right">{b.jumlah_baru === null ? "-" : rupiah(b.jumlah_baru)}</td>
      <td className={`whitespace-nowrap px-2 py-1.5 text-right font-bold ${selisih ? (selisih < 0 ? "text-[#B45309]" : "text-[#14653A]") : "text-[#5B6B84]"}`}>{selisihTeks(selisih)}</td>
      <td className="px-2 py-1.5">
        <Chip warna={WARNA_BANDING[st]}>{LABEL_BANDING[st]}</Chip>
        {b.sesuai_usulan === false && <div className="mt-1 text-[11px] font-bold text-[#6B3FA0]">di luar usulan</div>}
      </td>
      <td className="min-w-[170px] px-2 py-1.5 text-[#44546F]">{catatanBaris(b)}{b.tanda_catatan ? <div className="text-[#5B6B84]">“{b.tanda_catatan}”</div> : null}</td>
      <td className="min-w-[200px] px-2 py-1.5">
        {bolehPutus ? (
          <div className="flex flex-col items-start gap-1">
            {b.tanda !== "belum" && <span className="text-[12px] font-semibold text-[#44546F]">{teksKeputusan(b)}</span>}
            <div className="flex flex-wrap gap-1">
              {b.tanda !== "pakai" && <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[36px]`} onClick={() => void kirim("keu_pok_unggah_tandai", argsTandai(unggahId, b.kunci!, "pakai"))}>Pakai angka berkas</button>}
              {b.tanda !== "ditanyakan" && <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[36px]`} onClick={() => void kirim("keu_pok_unggah_tandai", argsTandai(unggahId, b.kunci!, "ditanyakan"))}>Tandai ditanyakan</button>}
              {b.tanda !== "belum" && <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[36px]`} onClick={() => void kirim("keu_pok_unggah_tandai", argsTandai(unggahId, b.kunci!, "belum"))}>Batalkan tanda</button>}
            </div>
          </div>
        ) : <span className="text-[12px] text-[#5B6B84]">{teksKeputusan(b)}</span>}

        {boleh && st === "baru" && b.baris_id !== null && adaHilang && (
          pilih === id ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="text-[11.5px] font-semibold text-[#44546F]">Padankan dengan baris lama:</div>
              {calon.length === 0 && <div className="text-[11.5px] text-[#5B6B84]">Tidak ada baris hilang pada RO ini.</div>}
              {calon.map((c) => {
                const k = (c.baris as BarisRinci).kunci;
                return (
                  <button key={c.baris.detail_id} type="button" disabled={mengirim || !k} onClick={async () => { if (k && await kirim("keu_pok_unggah_padankan", { p_baris: b.baris_id, p_kunci_lama: k })) setPilih(null); }}
                    className={`${tombolKecil} !min-h-[44px] text-left`}>
                    <span className="block text-[12px]">{c.baris.uraian_lama}</span>
                    <span className="block text-[11px] font-normal text-[#5B6B84]">{c.baris.akun_kode} · {rupiah(c.baris.jumlah_lama)} · kemiripan {Math.round(Math.min(1, c.skor) * 100)}%</span>
                  </button>
                );
              })}
              <button type="button" className={tombolKecil} onClick={() => setPilih(null)}>Tutup</button>
            </div>
          ) : <button type="button" className={`${tombolKecil} mt-1.5 !min-h-[36px]`} onClick={() => setPilih(id)}>Padankan dengan baris lama...</button>
        )}
        {boleh && st === "dipadankan" && b.baris_id !== null && (
          <button type="button" disabled={mengirim} className={`${tombolBahaya} mt-1.5`} onClick={() => void kirim("keu_pok_unggah_lepas_padan", { p_baris: b.baris_id })}>Lepas padanan</button>
        )}
      </td>
    </tr>
  );
}
