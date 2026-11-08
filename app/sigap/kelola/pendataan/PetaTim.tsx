"use client";

// app/sigap/kelola/pendataan/PetaTim.tsx
//
// (8 Nov 2026, E2) Status peta dasar jalan per tim untuk survei model 1 (alokasi per sub SLS) -- tab 1 · Persiapan Kelola Pendataan, di bawah "Alokasi per Sub SLS".
// Membandingkan alokasi aktif (siapa memegang sub SLS mana) dengan manifest peta di Storage: berkas belum ada, sudah sesuai, atau usang (alokasi berubah sejak dipotong).
// Berkas dipotong di LAPTOP admin (scripts/peta/potong-peta.mjs --kegiatan=ID); kartu ini hanya menampilkan status dan perintahnya. Tidak ada penulisan data.
// Dimuat saat tombol ditekan supaya halaman Persiapan tidak menambah permintaan tiap dibuka.

import { useCallback, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { ambilManifestDasar } from "@/app/portal/petaDasarOffline";
import { API_ALOKASI_ADMIN, type DataAlokasiAdmin } from "@/lib/alokasiWilayah";
import { labelUkuran, type ManifestDasar } from "@/lib/petaDasar";
import { LABEL_PERAN_PETA, kelompokPetaKegiatan, type KelompokPeta, perintahPeta, perintahPerkiraanPeta, rekapPeta, statusPetaTim, type StatusPeta } from "@/lib/petaKegiatan";
import { BTN_O, Chip, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const CHIP_STATUS: Record<StatusPeta, { w: "ok" | "wait" | "bad" | "mut"; teks: string; title: string }> = {
  ada: { w: "ok", teks: "sesuai", title: "Berkas ada dan dipotong dari alokasi yang sama dengan sekarang." },
  usang: { w: "wait", teks: "usang", title: "Alokasi berubah sejak berkas dipotong; potong ulang supaya peta mengikuti wilayah terbaru." },
  belum: { w: "bad", teks: "belum ada", title: "Belum ada berkas; petugas tetap melihat batas sub SLS tanpa peta jalan." },
  lama: { w: "mut", teks: "tanpa catatan", title: "Berkas dipotong sebelum catatan alokasi ada, jadi tidak bisa dibandingkan. Potong ulang bila ragu." },
};

async function salin(teks: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    return false;
  }
}

export default function PetaTim({ kegiatanId, nama }: { kegiatanId: number; nama: string }) {
  const [data, setData] = useState<DataAlokasiAdmin | null>(null);
  const [manifest, setManifest] = useState<ManifestDasar | null>(null);
  const [dariJaringan, setDariJaringan] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const periksa = useCallback(async () => {
    setSibuk(true);
    setGalat("");
    try {
      const [alokasi, mf] = await Promise.all([apiPortal<DataAlokasiAdmin>(`${API_ALOKASI_ADMIN}?k=${kegiatanId}`), ambilManifestDasar()]);
      setData(alokasi);
      setManifest(mf.manifest);
      setDariJaringan(mf.dariJaringan);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Status peta belum bisa dimuat.");
    } finally {
      setSibuk(false);
    }
  }, [kegiatanId]);

  const kelompok = useMemo(() => (data ? kelompokPetaKegiatan(data.wilayah, kegiatanId) : []), [data, kegiatanId]);

  const adaAlokasi = data != null && data.siap && kelompok.length > 0;

  return (
    <Kartu
      judul="Peta dasar tim"
      ket={`Peta jalan di bawah batas sub SLS pada HP petugas ${nama}. Berkas dipotong di laptop admin; kartu ini menunjukkan mana yang belum ada atau sudah usang karena alokasi berubah.`}
      kanan={
        <button type="button" className={BTN_O} disabled={sibuk} onClick={() => void periksa()}>
          {sibuk ? "Memeriksa…" : data ? "Periksa ulang" : "Periksa status peta"}
        </button>
      }
    >
      {sibuk && !data && <Memuat />}
      {galat && <Pesan>{galat}</Pesan>}
      {data && !data.siap && <Pesan jenis="info">Alokasi sub SLS belum aktif di basis data, jadi belum ada wilayah untuk dipetakan.</Pesan>}
      {data && data.siap && kelompok.length === 0 && <Pesan jenis="info">Belum ada alokasi sub SLS aktif untuk kegiatan ini. Unggah alokasi dulu di kartu di atas.</Pesan>}
      {data && !dariJaringan && <Pesan jenis="peringatan">Daftar peta di Storage tidak terjangkau sekarang; yang tampil adalah catatan terakhir yang tersimpan di perangkat ini dan bisa sudah berubah.</Pesan>}

      {adaAlokasi && <HasilPetaTim kegiatanId={kegiatanId} kelompok={kelompok} manifest={manifest} />}
    </Kartu>
  );
}

/** Isi kartu setelah data dimuat (dipisah supaya bisa diuji tanpa jaringan). */
export function HasilPetaTim({ kegiatanId, kelompok, manifest }: { kegiatanId: number; kelompok: readonly KelompokPeta[]; manifest: ManifestDasar | null }) {
  const [disalin, setDisalin] = useState("");
  const rekap = useMemo(() => rekapPeta(manifest, kelompok), [manifest, kelompok]);
  const perluTindakan = rekap.usang + rekap.belum + rekap.lama;

  async function tekanSalin(kunci: string, teks: string) {
    const ok = await salin(teks);
    setDisalin(ok ? kunci : "");
    if (ok) setTimeout(() => setDisalin((s) => (s === kunci ? "" : s)), 2500);
  }

  return (
    <>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip w="navy">{fmt(rekap.total)} berkas diperlukan</Chip>
            <Chip w="ok">{fmt(rekap.ada)} sesuai</Chip>
            {rekap.usang > 0 && <Chip w="wait">{fmt(rekap.usang)} usang</Chip>}
            {rekap.belum > 0 && <Chip w="bad">{fmt(rekap.belum)} belum ada</Chip>}
            {rekap.lama > 0 && <Chip w="mut">{fmt(rekap.lama)} tanpa catatan</Chip>}
            {rekap.byte > 0 && <Chip w="mut">{labelUkuran(rekap.byte)} terunggah</Chip>}
          </div>

          {perluTindakan === 0 ? (
            <div className="mt-2">
              <Pesan jenis="ok">Semua peta tim sesuai dengan alokasi sekarang.</Pesan>
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-[#DDE6F3] bg-[#F7F9FD] px-3 py-2.5 text-[12.5px] text-[#33445F]">
              <div className="font-bold text-[#0F2A52]">Cara membuat atau memperbarui (di laptop, dari folder proyek)</div>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>
                  Perkiraan ukuran dulu, tanpa mengunduh:
                  <PerintahBaris kunci="perkiraan" teks={perintahPerkiraanPeta(kegiatanId)} disalin={disalin} onSalin={tekanSalin} />
                </li>
                <li>
                  Potong dan unggah semua berkas kegiatan ini:
                  <PerintahBaris kunci="semua" teks={perintahPeta(kegiatanId)} disalin={disalin} onSalin={tekanSalin} />
                </li>
              </ol>
              <div className="mt-1.5 text-[#6B7A90]">
                Berkas Korwil/Supervisor (seluruh wilayah) paling besar; bila melebihi batas unggah 50 MB tambahkan <code>--tanpa-semua</code>. Memotong hanya yang usang atau belum ada: pakai perintah per baris di tabel.
              </div>
            </div>
          )}

          <div className="mt-3 overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>Peran</th>
                  <th className={TH}>Nama</th>
                  <th className={TH}>Sub SLS</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Ukuran</th>
                  <th className={TH}>Perintah</th>
                </tr>
              </thead>
              <tbody>
                {kelompok.map((k) => {
                  const st = statusPetaTim(manifest, k);
                  const c = CHIP_STATUS[st.status];
                  const perintah = perintahPeta(kegiatanId, k.kunci);
                  return (
                    <tr key={k.kunci}>
                      <td className={TD}>{k.peran === "semua" ? "Korwil/Supervisor" : LABEL_PERAN_PETA[k.peran]}</td>
                      <td className={TD}>{k.peran === "semua" ? "Seluruh wilayah" : k.nama}</td>
                      <td className={TD}>{fmt(k.subsls.length)}</td>
                      <td className={TD}>
                        <Chip w={c.w} title={c.title}>
                          {c.teks}
                        </Chip>
                      </td>
                      <td className={TD}>{st.ukuran > 0 ? labelUkuran(st.ukuran) : "-"}</td>
                      <td className={TD}>
                        {st.status === "ada" ? (
                          <span className="text-[#6B7A90]">-</span>
                        ) : (
                          <button type="button" className="text-[12px] font-bold text-[#1F5FD1] underline" onClick={() => void tekanSalin(String(k.kunci), perintah)}>
                            {disalin === String(k.kunci) ? "Disalin" : "Salin perintah"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
    </>
  );
}

function PerintahBaris({ kunci, teks, disalin, onSalin }: { kunci: string; teks: string; disalin: string; onSalin: (kunci: string, teks: string) => void | Promise<void> }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-2">
      <code className="break-all rounded bg-white px-2 py-1 text-[12px] text-[#0F2A52]">{teks}</code>
      <button type="button" className="text-[12px] font-bold text-[#1F5FD1] underline" onClick={() => void onSalin(kunci, teks)}>
        {disalin === kunci ? "Disalin" : "Salin"}
      </button>
    </div>
  );
}
