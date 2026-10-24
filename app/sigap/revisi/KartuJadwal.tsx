"use client";

// app/sigap/revisi/KartuJadwal.tsx
//
// (24 Okt 2026) Satu baris jadwal pada papan 11: chip jenis dan status, jendela usulan, hitungan usulan, tombol aksi PPK,
// daftar usulan RO (dengan "Tidak ikut paket"), dan formulir pernyataan sah. Yang memutuskan tetap basis data.

import { useState } from "react";
import {
  aksiJadwalTersedia, argsJadwalAksi, labelNomorSah, LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, LABEL_STATUS_USULAN, periksaSah, petunjukSah,
  SIAPA_USULAN, tglPanjang, tidakIkutPaket, WARNA_CHIP_JENIS, WARNA_CHIP_STATUS_JADWAL, WARNA_CHIP_STATUS_USULAN, type AksiJadwal,
} from "@/lib/keu/revisi";
import { angka, urlBaca } from "@/lib/keu/ro";
import { useBacaKeu, useKirim } from "../ro/useKeu";
import { caps, Catatan, Chip, Galat, kolom, label, tombolBahaya, tombolKecil, tombolUtama } from "../keu-ui";

export type Jadwal = {
  jadwal_id: number; tahun: number; jenis: string; judul: string; buka: string; tutup: string; status: string;
  n_usulan: number | string; n_disetujui: number | string; n_proses: number | string; n_draf: number | string;
  ulang?: string; catatan?: string;
};
export type Sah = { jadwal_id: number; versi_sistem: number | string; nomor_dokumen: string; tanggal_dokumen: string };
type Usulan = { id: number; ro_kode: string; status: string; catatan: string };

const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function UsulanRo({ jadwal, namaRo, bolehSahkan, sesudah }: { jadwal: Jadwal; namaRo: Map<string, string>; bolehSahkan: boolean; sesudah: () => Promise<void> }) {
  const u = useBacaKeu<Usulan>(urlBaca("keu_revisi_usulan", { jadwal_id: jadwal.jadwal_id }, { urut: "ro_kode", batas: 500, kolom: ["id", "ro_kode", "status", "catatan"] }));
  const { kirim, mengirim, galat, hapusGalat } = useKirim(async () => { await u.muat(); await sesudah(); });
  const [kembali, setKembali] = useState<{ id: number; catatan: string } | null>(null);
  return (
    <div className="flex flex-col gap-1.5 border-t border-[#E8EDF5] pt-2.5">
      <div className={caps}>Usulan RO pada jadwal ini</div>
      {u.galat && <Galat pesan={u.galat} />}
      <Galat pesan={galat} />
      {!u.baris && !u.galat && <div className="h-10 animate-pulse rounded-lg bg-[#EEF2F7]" aria-busy="true" />}
      {u.baris && u.baris.length === 0 && <div className="text-[12.5px] text-[#5B6B84]">Belum ada usulan RO.</div>}
      {(u.baris ?? []).map((x) => (
        <div key={x.id} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 text-[13px]">
              <a href={`/sigap/ro/${encodeURIComponent(x.ro_kode)}?tab=rab`} className="font-mono font-semibold text-[#1F5FD1]">{x.ro_kode}</a>{" "}
              <span className="text-[12px] text-[#5B6B84]">{(namaRo.get(x.ro_kode) ?? "").slice(0, 40)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-[#5B6B84]">{SIAPA_USULAN[x.status] ?? ""}</span>
              <Chip warna={WARNA_CHIP_STATUS_USULAN[x.status] ?? "abu"}>{LABEL_STATUS_USULAN[x.status] ?? x.status}</Chip>
              {tidakIkutPaket(jadwal.status, x.status) && <Chip warna="merah">Tidak ikut paket</Chip>}
            </span>
          </div>
          {x.status === "dikembalikan" && x.catatan && <p className="text-[12px] text-[#5B6B84]">Catatan: {x.catatan}</p>}
          {bolehSahkan && x.status === "menunggu_ppk" && (
            kembali?.id === x.id ? (
              <div className="space-y-2 rounded-lg bg-[#F5F8FE] p-2.5">
                <label className={label} htmlFor={`kb-${x.id}`}>Alasan mengembalikan (minimal 5 huruf)</label>
                <textarea id={`kb-${x.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={kembali.catatan} onChange={(e) => setKembali({ id: x.id, catatan: e.target.value })} />
                <div className="flex gap-2">
                  <button type="button" disabled={mengirim || kembali.catatan.trim().length < 5} className={tombolBahaya} onClick={async () => { if (await kirim("keu_usulan_aksi", { p_usulan: x.id, p_aksi: "kembalikan", p_catatan: kembali.catatan.trim() })) setKembali(null); }}>Kembalikan</button>
                  <button type="button" className={tombolKecil} onClick={() => setKembali(null)}>Batal</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" disabled={mengirim} className={tombolUtama} onClick={() => void kirim("keu_usulan_aksi", { p_usulan: x.id, p_aksi: "sahkan" })}>Sahkan usulan</button>
                <button type="button" disabled={mengirim} className={tombolBahaya} onClick={() => { hapusGalat(); setKembali({ id: x.id, catatan: "" }); }}>Kembalikan</button>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

export default function KartuJadwal({ j, sah, namaRo, terbuka, ubahTerbuka, bolehJadwal, bolehSahkan, sesudah }: {
  j: Jadwal; sah: Sah | undefined; namaRo: Map<string, string>; terbuka: boolean; ubahTerbuka: () => void;
  bolehJadwal: boolean; bolehSahkan: boolean; sesudah: () => Promise<void>;
}) {
  const { kirim, mengirim, galat, hapusGalat } = useKirim(sesudah);
  const [dok, setDok] = useState<{ nomor: string; tanggal: string } | null>(null);
  const [salah, setSalah] = useState<string[]>([]);
  const aksi = bolehJadwal ? aksiJadwalTersedia(j.status, j.tutup, hariIni(), Boolean(j.ulang)) : [];
  const nUsulan = Number(j.n_usulan) || 0;

  const jalankan = async (a: AksiJadwal) => {
    hapusGalat(); setSalah([]);
    if (a === "sah") { setDok(dok ?? { nomor: "", tanggal: "" }); return; }
    await kirim("keu_jadwal_aksi", argsJadwalAksi(j.jadwal_id, a));
  };
  const kirimSah = async () => {
    if (!dok) return;
    const g = periksaSah(dok.nomor, dok.tanggal);
    setSalah(g);
    if (g.length) return;
    if (await kirim("keu_jadwal_aksi", argsJadwalAksi(j.jadwal_id, "sah", dok))) setDok(null);
  };

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 ${terbuka ? "border-[#B7CDF5] bg-[#F7FAFE]" : "border-[#DCE3EE] bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip warna={WARNA_CHIP_JENIS[j.jenis] ?? "abu"}>{LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis}</Chip>
          <b className="min-w-0 break-words text-[14px] text-[#0F2A52]">{j.judul}</b>
        </div>
        <Chip warna={WARNA_CHIP_STATUS_JADWAL[j.status] ?? "abu"}>{LABEL_STATUS_JADWAL[j.status] ?? j.status}</Chip>
      </div>
      <div className="text-[12px] text-[#5B6B84]">
        Jendela usulan {tglPanjang(j.buka)} sampai {tglPanjang(j.tutup)}{j.ulang ? ` (berulang, ${j.ulang})` : ""}.{j.catatan ? ` ${j.catatan}` : ""}
      </div>
      {sah && <p className="rounded-lg bg-[#D9F0E3] px-3 py-1.5 text-[12.5px] font-semibold text-[#0F5A32]">Sah versi {sah.versi_sistem}: {sah.nomor_dokumen} ({tglPanjang(sah.tanggal_dokumen)})</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {nUsulan > 0 && (
          <>
            <Chip warna="hijau">{angka(j.n_disetujui)} disetujui</Chip>
            <Chip warna="kuning">{angka(j.n_proses)} dalam proses</Chip>
            <Chip warna="abu">{angka(j.n_draf)} draf atau dikembalikan</Chip>
          </>
        )}
        <button type="button" className={tombolKecil} aria-expanded={terbuka} onClick={ubahTerbuka}>{terbuka ? "Sembunyikan usulan" : "Lihat usulan RO"}</button>
        {!dok && aksi.map((a) => (
          <button key={a.aksi} type="button" disabled={mengirim} onClick={() => void jalankan(a.aksi)} className={a.berbahaya ? tombolBahaya : tombolUtama}>{a.label}</button>
        ))}
      </div>
      <Galat pesan={galat} />

      {terbuka && <UsulanRo jadwal={j} namaRo={namaRo} bolehSahkan={bolehSahkan} sesudah={sesudah} />}

      {dok && (
        <div className="flex flex-col gap-2 border-t border-[#E8EDF5] pt-2.5">
          <div className={caps}>Pernyataan sah oleh PPK</div>
          <div className="text-[12.5px] text-[#5B6B84]">{petunjukSah(j.jenis)}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label} htmlFor={`dn-${j.jadwal_id}`}>{labelNomorSah(j.jenis)}</label><input id={`dn-${j.jadwal_id}`} className={kolom} maxLength={120} placeholder="mis. S-123/KW.03/2026" value={dok.nomor} onChange={(e) => setDok({ ...dok, nomor: e.target.value })} /></div>
            <div><label className={label} htmlFor={`dt-${j.jadwal_id}`}>Tanggal dokumen</label><input id={`dt-${j.jadwal_id}`} type="date" className={kolom} value={dok.tanggal} onChange={(e) => setDok({ ...dok, tanggal: e.target.value })} /></div>
          </div>
          {salah.length > 0 && <Catatan>Sistem tidak menyimpulkan sah dari sendirinya; PPK mencatat dari dokumen resmi. {salah.join(" ")}</Catatan>}
          <div className="flex gap-2">
            <button type="button" disabled={mengirim} onClick={() => void kirimSah()} className={tombolUtama}>{mengirim ? "Menyimpan..." : "Nyatakan sah"}</button>
            <button type="button" className={tombolKecil} onClick={() => { setDok(null); setSalah([]); }}>Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}
