"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/pelaksanaan/BlokSamakan.tsx
//
// (7 Nov 2026) "Samakan dengan lanjutan" di bawah tabel usulan penugasan: peran yang berbeda, nama yang sudah dicoret, dan nama yang ditugaskan kembali.
// Penerapan memperbarui penugasan lalu merapikan hierarki pelatihan dan Tim kegiatan itu. Surat tugas yang memuat peran lama hanya dilaporkan.
// Pembanding murni: lib/keu/samakanPenugasan.ts; server: app/api/sigap/keu/samakan-penugasan/route.ts.

import { useCallback, useEffect, useState } from "react";
import { Catatan, Chip, tombolUtama } from "@/app/sigap/keu-ui";
import { apiPortal } from "@/app/portal/sesi";
import { LABEL_AKSI, kalimatSelisih, type SelisihPenugasan } from "@/lib/keu/samakanPenugasan";

type Data = { selisih: SelisihPenugasan[]; peringatan: string[]; final: boolean; lanjutan_ver: number | null; boleh_terapkan: boolean };
type Hasil = { diterapkan: number; dilewati: number; tanpa_atasan: string[]; surat_perlu_terbit: { nama: string; nomor_st: string | null; peran_tertera: string | null }[] };

const kunci = (s: SelisihPenugasan) => `${s.akun_id}:${s.aksi}`;
const NADA: Record<SelisihPenugasan["aksi"], "kuning" | "hijau" | "merah"> = { ubah_peran: "kuning", aktifkan: "hijau", cabut: "merah" };

export default function BlokSamakan({ identId, kegiatanId, versi, onBerubah }: { identId: number; kegiatanId: number; versi: number; onBerubah?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [mengirim, setMengirim] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await apiPortal<Data>(`/api/sigap/keu/samakan-penugasan?ident=${identId}&kegiatan=${kegiatanId}`);
      setD(r);
      setGalat(null);
      setDipilih(new Set(r.selisih.filter((s) => s.bisa).map(kunci))); // semua yang bisa diterapkan tercentang; pengguna meninjau sebelum menekan tombol
    } catch (e) {
      setD(null);
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Sesi berakhir. Silakan masuk kembali.");
    }
  }, [identId, kegiatanId]);
  useEffect(() => setHasil(null), [kegiatanId]); // pesan hasil hanya dihapus saat kegiatan lain dipilih, bukan saat daftar dimuat ulang sesudah menerapkan
  useEffect(() => {
    void muat();
  }, [muat, versi]);

  const ubah = (k: string) => setDipilih((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function terapkan() {
    if (!d) return;
    const pilihan = d.selisih.filter((s) => s.bisa && dipilih.has(kunci(s))).map((s) => ({ akun_id: s.akun_id, aksi: s.aksi }));
    if (pilihan.length === 0) return;
    setMengirim(true);
    setGalat(null);
    try {
      const r = await apiPortal<Hasil>("/api/sigap/keu/samakan-penugasan", { method: "POST", body: JSON.stringify({ ident: identId, kegiatan: kegiatanId, pilihan }) });
      setHasil(r);
      await muat();
      onBerubah?.();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menerapkan.");
    } finally {
      setMengirim(false);
    }
  }

  if (galat && !d) return <Catatan>Perbandingan dengan penugasan sekarang belum dapat dimuat: {galat}</Catatan>;
  if (!d) return null;
  const terpilih = d.selisih.filter((s) => s.bisa && dipilih.has(kunci(s))).length;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3" aria-label="Samakan dengan lanjutan">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">Samakan dengan lanjutan</h3>
        {d.selisih.length === 0 ? <Chip warna="hijau">Sudah sama</Chip> : <Chip warna="kuning">{d.selisih.length} selisih</Chip>}
      </div>
      <p className="m-0 text-[12.5px] leading-snug text-[#44546F]">
        Bagian di atas hanya menambah petugas baru. Di sini perubahan lain pada lanjutan ikut diterapkan: peran yang berubah, nama yang dicoret (penugasan dinonaktifkan, bukan dihapus), dan nama yang ditugaskan kembali.
        Hierarki pelatihan dan Tim kegiatan ini ikut dirapikan.
      </p>
      {d.peringatan.map((t) => <Catatan key={t}>{t}</Catatan>)}
      {d.selisih.length > 0 && (
        <>
          {!d.final && <Catatan>Identifikasi lanjutan masih Draf. Selisih dapat dilihat, tetapi diterapkan hanya sesudah lanjutan Final.</Catatan>}
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {d.selisih.map((s) => (
              <li key={kunci(s)} className="flex min-w-0 flex-wrap items-start gap-2 border-b border-[#EEF2F7] pb-1.5 text-[12.5px] last:border-b-0">
                {d.boleh_terapkan && d.final && s.bisa ? <input type="checkbox" aria-label={`${LABEL_AKSI[s.aksi]} ${s.nama}`} checked={dipilih.has(kunci(s))} disabled={mengirim} onChange={() => ubah(kunci(s))} /> : <span aria-hidden className="text-[#8FA3C2]">—</span>}
                <span className="min-w-0 flex-1">
                  <b className="text-[#0F2A52]">{s.nama}</b> <Chip warna={NADA[s.aksi]}>{LABEL_AKSI[s.aksi]}</Chip>
                  <span className="ml-1 text-[#44546F]">{kalimatSelisih(s)}</span>
                  {s.catatan && <span className="block text-[11.5px] text-[#B42329]">{s.catatan}</span>}
                  {s.surat.length > 0 && <span className="block text-[11.5px] text-[#8A6200]">Surat tugas {s.surat.map((x) => `${x.nomor_st ?? "tanpa nomor"} (memuat ${x.peran_tertera ?? "peran lama"})`).join(", ")} perlu diterbitkan ulang.</span>}
                </span>
              </li>
            ))}
          </ul>
          {d.boleh_terapkan && d.final ? (
            <div>
              <button type="button" className={tombolUtama} disabled={mengirim || terpilih === 0} onClick={() => void terapkan()}>{mengirim ? "Menerapkan…" : `Terapkan ${terpilih} perubahan`}</button>
            </div>
          ) : d.final ? <p className="m-0 text-[12.5px] text-[#5B6B84]">Menerapkan hanya untuk yang berhak menyusun identifikasi RO ini dan mengelola penugasan kegiatan ini.</p> : null}
        </>
      )}
      {galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
      {hasil && (
        <div role="status" className="flex flex-col gap-1 rounded-lg border-l-4 border-[#2E9E63] bg-[#E6F6EC] px-3 py-2 text-[13px] text-[#14653A]">
          <span>{hasil.diterapkan} perubahan diterapkan{hasil.dilewati > 0 ? `, ${hasil.dilewati} dilewati` : ""}.</span>
          {hasil.tanpa_atasan.length > 0 && <span>Atasan dikosongkan untuk: {hasil.tanpa_atasan.join(", ")}. Atur atasan barunya di Kelola Pelatihan &gt; Hierarki.</span>}
          {hasil.surat_perlu_terbit.length > 0 && <span>{hasil.surat_perlu_terbit.length} surat tugas memuat peran lama dan perlu diterbitkan ulang.</span>}
        </div>
      )}
    </div>
  );
}
