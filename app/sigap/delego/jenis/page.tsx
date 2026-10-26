"use client";

// app/sigap/delego/jenis/page.tsx
//
// (26 Okt 2026, tahap 39) Katalog pekerjaan: jenis pekerjaan teknis kantor beserta ukuran poin tetap per satuan, dan kelompok "Pekerjaan tim" (asal pekerjaan
// non-RO). Semua pegawai dapat melihat; hanya pemberi delegasi tingkat tim (Ketua Tim) yang dapat menambah atau mengubah. Poin yang diubah hanya berlaku untuk
// delegasi BARU: delegasi yang sudah dibuat menyimpan salinan poin saat dibuat, sehingga skor dan hutang masa lalu tidak bergeser.
// Angka poin pada seed awal adalah USULAN (kapasitas 70 poin = 7,5 jam), silakan disesuaikan oleh Ketua Tim.

import { useState } from "react";
import { angka } from "@/lib/delego/hitung";
import { bacaBarisLangkah, jenisKeForm, periksaJenis, teksDurasi, type FormJenis } from "@/lib/delego/teknis";
import type { JenisPekerjaan } from "@/lib/delego/tipe";
import { useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Peringatan, fmt } from "../ui";

const FORM_KOSONG: FormJenis = { kode: "", nama: "", satuan: "", poin: "", uraian: "", perluHasil: true, perluTinjau: false, langkah: "", urut: "50" };

export default function Katalog() {
  const { hak, muatHak } = useKonteksDelego();
  const bolehKelola = hak.semua;
  const jenis = hak.jenis ?? [];
  const kelompok = hak.kelompok ?? [];
  const [edit, setEdit] = useState<{ id: number | null; aktif: boolean } | null>(null);
  const [f, setF] = useState<FormJenis>(FORM_KOSONG);
  const [kode, setKode] = useState("");
  const [namaKel, setNamaKel] = useState("");
  const kirimJenis = useKirim(muatHak);
  const kirimKel = useKirim(muatHak);

  const baru = () => {
    setF(FORM_KOSONG);
    setEdit({ id: null, aktif: true });
  };
  const ubah = (j: JenisPekerjaan) => {
    setF(jenisKeForm(j));
    setEdit({ id: j.id, aktif: j.aktif });
  };
  const galat = edit ? periksaJenis(f, edit.id === null) : [];

  const simpan = async () => {
    if (!edit || galat.length > 0) return;
    const ok = await kirimJenis.kirim("keu_dlg_jenis_simpan", {
      p_data: {
        ...(edit.id !== null ? { id: edit.id } : { kode: f.kode.trim() }),
        nama: f.nama.trim(), satuan: f.satuan.trim(), poin_per_satuan: f.poin.replace(",", "."), uraian: f.uraian.trim(),
        perlu_hasil: f.perluHasil, perlu_tinjau: f.perluTinjau, langkah_bawaan: bacaBarisLangkah(f.langkah, 12).langkah,
        urut: f.urut.trim() === "" ? 50 : Number(f.urut), aktif: edit.aktif,
      },
    });
    if (ok) setEdit(null);
  };
  const aktifkan = (j: JenisPekerjaan, aktif: boolean) => void kirimJenis.kirim("keu_dlg_jenis_simpan", { p_data: { id: j.id, aktif } });

  const kodeKelompok = kode.trim().toUpperCase();
  const kodeSah = /^TIM-[A-Z0-9-]{2,30}$/.test(kodeKelompok);
  const tambahKelompok = async () => {
    if (!kodeSah || namaKel.trim().length < 3) return;
    const ok = await kirimKel.kirim("keu_dlg_kelompok_simpan", { p_data: { kode: kodeKelompok, nama: namaKel.trim() } });
    if (ok) {
      setKode("");
      setNamaKel("");
    }
  };

  return (
    <Halaman
      judul="Katalog pekerjaan"
      sub="Jenis pekerjaan teknis kantor dan ukuran poinnya"
      kanan={bolehKelola && !edit ? <button type="button" className={KELAS.tombolUtama} onClick={baru}>Tambah jenis</button> : undefined}
    >
      <Info>
        Ukuran beban memakai <b>poin tetap per satuan</b>. Kapasitas satu orang 70 poin per hari kerja (7,5 jam), jadi 1 poin kira-kira 6 menit. Mengubah poin hanya
        berlaku untuk delegasi yang dibuat sesudahnya.
      </Info>
      {!bolehKelola && <Peringatan>Hanya Ketua Tim (pemberi delegasi tingkat tim) yang dapat mengubah katalog. Anda dapat melihatnya.</Peringatan>}

      {edit && bolehKelola && (
        <Kartu judul={edit.id === null ? "Jenis pekerjaan baru" : "Ubah jenis pekerjaan"}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {edit.id === null && (
                <Medan label="Kode" bantu="Huruf kecil, angka, garis bawah; tidak dapat diubah lagi.">
                  <input className={KELAS.isian} maxLength={30} value={f.kode} onChange={(e) => setF({ ...f, kode: e.target.value })} placeholder="mis. periksa_dokumen" />
                </Medan>
              )}
              <Medan label="Nama"><input className={KELAS.isian} maxLength={80} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Memeriksa dokumen" /></Medan>
              <Medan label="Satuan"><input className={KELAS.isian} maxLength={30} value={f.satuan} onChange={(e) => setF({ ...f, satuan: e.target.value })} placeholder="dokumen" /></Medan>
              <Medan label="Poin per satuan" bantu={Number(f.poin.replace(",", ".")) > 0 ? `Sekitar ${teksDurasi(Number(f.poin.replace(",", ".")))} per ${f.satuan || "satuan"}.` : "70 poin = 1 hari kerja."}>
                <input className={KELAS.isian} inputMode="decimal" value={f.poin} onChange={(e) => setF({ ...f, poin: e.target.value })} placeholder="9" />
              </Medan>
              <Medan label="Urutan tampil"><input className={KELAS.isian} inputMode="numeric" value={f.urut} onChange={(e) => setF({ ...f, urut: e.target.value })} /></Medan>
            </div>
            <Medan label="Keterangan singkat (opsional)"><input className={KELAS.isian} maxLength={300} value={f.uraian} onChange={(e) => setF({ ...f, uraian: e.target.value })} /></Medan>
            <label className="flex min-h-[40px] cursor-pointer items-start gap-2.5 text-[14px]">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0F6B63]" checked={f.perluHasil} onChange={(e) => setF({ ...f, perluHasil: e.target.checked, perluTinjau: e.target.checked ? f.perluTinjau : false })} />
              <span>Penerima menyerahkan hasil kerja</span>
            </label>
            <label className={`flex min-h-[40px] items-start gap-2.5 text-[14px] ${f.perluHasil ? "cursor-pointer" : "opacity-50"}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0F6B63]" checked={f.perluTinjau} disabled={!f.perluHasil} onChange={(e) => setF({ ...f, perluTinjau: e.target.checked })} />
              <span>Hasil ditinjau pemberi (diterima atau revisi)</span>
            </label>
            {edit.id !== null && (
              <label className="flex min-h-[40px] cursor-pointer items-start gap-2.5 text-[14px]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0F6B63]" checked={edit.aktif} onChange={(e) => setEdit({ ...edit, aktif: e.target.checked })} />
                <span>Aktif (jenis nonaktif tidak muncul saat membuat delegasi baru)</span>
              </label>
            )}
            <Medan label="Langkah bawaan (satu per baris, opsional)" bantu="Disalin sebagai daftar langkah setiap delegasi baru berjenis ini; dapat diubah per delegasi.">
              <textarea className={KELAS.isian} rows={4} value={f.langkah} onChange={(e) => setF({ ...f, langkah: e.target.value })} />
            </Medan>
            {galat.length > 0 && <Peringatan><ul className="m-0 list-disc pl-5">{galat.map((g) => <li key={g}>{g}</li>)}</ul></Peringatan>}
            {kirimJenis.galat && <Galat>{kirimJenis.galat}</Galat>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={KELAS.tombolUtama} disabled={kirimJenis.mengirim || galat.length > 0} onClick={() => void simpan()}>{kirimJenis.mengirim ? "Menyimpan..." : "Simpan jenis"}</button>
              <button type="button" className={KELAS.tombolSekunder} disabled={kirimJenis.mengirim} onClick={() => setEdit(null)}>Batal</button>
            </div>
          </div>
        </Kartu>
      )}

      {jenis.length === 0 ? (
        <Kosong>Katalog belum berisi jenis pekerjaan.</Kosong>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {jenis.map((j) => (
            <div key={j.id} className={`${KELAS.kartu} space-y-2 ${j.aktif ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{j.nama}</div>
                  <div className="mt-0.5 text-[13px] text-[#3B4A57]">
                    <b>{fmt(angka(j.poin_per_satuan), 1)} poin</b> per {j.satuan} · sekitar {teksDurasi(angka(j.poin_per_satuan))}
                  </div>
                </div>
                {!j.aktif && <Lencana nada="abu">Nonaktif</Lencana>}
              </div>
              {j.uraian && <p className="m-0 text-[13px] leading-snug text-[#33404B]">{j.uraian}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Lencana nada={j.perlu_hasil ? "hijau" : "abu"}>{j.perlu_hasil ? "Ada hasil kerja" : "Tanpa hasil kerja"}</Lencana>
                {j.perlu_tinjau && <Lencana nada="biru">Ditinjau</Lencana>}
                {(j.langkah_bawaan ?? []).length > 0 && <Lencana nada="abu">{j.langkah_bawaan.length} langkah bawaan</Lencana>}
              </div>
              {bolehKelola && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={KELAS.tombolKecil} disabled={!!edit || kirimJenis.mengirim} onClick={() => ubah(j)}>Ubah</button>
                  <button type="button" className={KELAS.tombolKecil} disabled={kirimJenis.mengirim} onClick={() => aktifkan(j, !j.aktif)}>{j.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!edit && kirimJenis.galat && <Galat>{kirimJenis.galat}</Galat>}

      <Kartu judul="Pekerjaan tim">
        <p className="m-0 mb-3 text-[13.5px] text-[#33404B]">Kelompok untuk pekerjaan teknis kantor yang tidak melekat pada satu RO. Dipakai sebagai asal delegasi pada menu Buat delegasi.</p>
        {kelompok.length === 0 ? (
          <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada kelompok.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {kelompok.map((k) => (
              <li key={k.kode} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <span><b>{k.nama}</b> <span className="text-[12.5px] text-[#3B4A57]">· {k.kode}</span></span>
                <span className="flex items-center gap-2">
                  {!k.aktif && <Lencana nada="abu">Nonaktif</Lencana>}
                  {bolehKelola && (
                    <button type="button" className={KELAS.tombolKecil} disabled={kirimKel.mengirim} onClick={() => void kirimKel.kirim("keu_dlg_kelompok_simpan", { p_data: { kode: k.kode, nama: k.nama, aktif: !k.aktif } })}>
                      {k.aktif ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {bolehKelola && (
          <div className="mt-4 space-y-2 border-t border-[#E3E8EE] pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Medan label="Kode kelompok baru" bantu="Berawalan TIM-, mis. TIM-IPDS."><input className={KELAS.isian} maxLength={34} value={kode} onChange={(e) => setKode(e.target.value)} placeholder="TIM-IPDS" /></Medan>
              <Medan label="Nama"><input className={KELAS.isian} maxLength={80} value={namaKel} onChange={(e) => setNamaKel(e.target.value)} placeholder="Tim Integrasi Pengolahan dan Diseminasi" /></Medan>
            </div>
            {kode.trim() !== "" && !kodeSah && <Peringatan>Kode berawalan TIM- lalu 2 sampai 30 huruf besar, angka, atau tanda hubung.</Peringatan>}
            {kirimKel.galat && <Galat>{kirimKel.galat}</Galat>}
            <button type="button" className={KELAS.tombolSekunder} disabled={kirimKel.mengirim || !kodeSah || namaKel.trim().length < 3} onClick={() => void tambahKelompok()}>Tambah kelompok</button>
          </div>
        )}
      </Kartu>
    </Halaman>
  );
}
