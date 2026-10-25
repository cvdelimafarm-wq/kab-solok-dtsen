"use client";

// app/sigap/kelola/perencanaan/kebijakan/Pengesahan.tsx
//
// (25 Okt 2026, tahap 28) Kartu status, hasil rapat, pengesah paralel, dan tombol alur pada lembar kebijakan.
// Tombol hanya tampil bila hak dan statusnya cocok; yang memutuskan tetap fungsi keu_kebijakan_aksi di basis data.

import {
  ID_BAGIAN, kalimatMenunggu, labelPeran, labelStatus, ringkasPengesahan,
  type AksiLembar, type BarisLembar, type BarisPengesah, type RiwayatLembar,
} from "@/lib/keu/kebijakan";
import { Chip, Galat, kolom, tombolBahaya, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { Bagian, Isian, Poin } from "../identifikasi/Kontrol";

const waktu = (s: string | null): string => {
  if (!s) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(s));
  } catch { return s; }
};

export type MetaRapat = { tgl: string; nomor: string; tujuan: string };

export function Pengesahan({ row, pengesah, meta, ubahMeta, bisaUbah, kotor, aksi, catatan, setCatatan, onAksi, mengirim, galat, hariIni }: {
  row: BarisLembar; pengesah: BarisPengesah[]; meta: MetaRapat; ubahMeta: (m: MetaRapat) => void; bisaUbah: boolean; kotor: boolean;
  aksi: AksiLembar[]; catatan: string; setCatatan: (s: string) => void; onAksi: (a: AksiLembar) => void; mengirim: boolean; galat: string | null; hariIni: string;
}) {
  const st = labelStatus(row.status);
  const r = ringkasPengesahan(pengesah);
  const aktif = pengesah.filter((x) => x.aktif);
  const perluCatatan = aksi.some((a) => a === "kembalikan" || a === "batal" || a === "revisi");
  const kelengkapan: string[] = [];
  if (row.status === "draf") {
    if (!meta.tgl) kelengkapan.push("Tanggal rapat awal tahun belum diisi.");
    if (meta.nomor.trim().length < 3) kelengkapan.push("Nomor notulen atau SK rapat belum diisi.");
    if (meta.tujuan.trim().length < 10) kelengkapan.push("Tujuan mutu belum diisi (minimal 10 huruf).");
    if (kotor) kelengkapan.push("Ada perubahan yang belum disimpan; simpan dahulu sebelum mengajukan.");
  }
  return (
    <Bagian huruf="A" judul="Status, hasil rapat, dan pengesahan" gsbpm={`Lembar kebijakan ${row.tahun} · versi ${row.ver}`} id={ID_BAGIAN.pengesahan}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip warna={st.nada}>{st.teks}</Chip>
        {row.predefined && row.status !== "arsip" && <Chip warna="kuning">Angka awal dari Excel · belum dibahas rapat</Chip>}
        {row.berlaku_at && row.status === "berlaku" && <span className="text-[12.5px] text-[#44546F]">Berlaku sejak {waktu(row.berlaku_at)}</span>}
        {row.arsip_at && row.status === "arsip" && <span className="text-[12.5px] text-[#44546F]">Diarsipkan {waktu(row.arsip_at)}</span>}
      </div>

      <Poin butir={
        row.status === "draf" ? [
          "Draf boleh diubah bebas oleh PPK, Perencanaan, atau Admin Aplikasi.",
          "Isi tanggal rapat, nomor notulen atau SK, dan tujuan mutu dari rapat awal tahun, lalu simpan dan ajukan.",
          ...(row.alasan_revisi ? [`Alasan revisi: ${row.alasan_revisi}`] : []),
          ...(row.catatan_kembali ? [`Dikembalikan oleh ${row.kembali_oleh ?? "pengesah"} (${waktu(row.kembali_at)}): ${row.catatan_kembali}`] : []),
        ] : row.status === "menunggu" ? [
          "Disahkan paralel: semua ketua tim aktif, PPK, dan Kepala (KPA). Satu akun yang memegang beberapa peran cukup menyetujui sekali.",
          r.lengkap ? "Semua syarat pengesahan terpenuhi." : `Masih menunggu: ${kalimatMenunggu(r.menunggu)}.`,
          "Pengesah dapat mengembalikan lembar ke penyusun dengan catatan; pengesahan yang sudah masuk direset.",
        ] : row.status === "berlaku" ? [
          "Lembar ini berlaku dan terkunci; isinya tidak dapat diubah langsung.",
          "Perubahan dilakukan lewat revisi: membuat versi baru yang disahkan ulang, sedangkan versi ini tetap berlaku sampai versi baru disahkan.",
        ] : row.status === "dibatalkan" ? [
          "Versi ini dibatalkan dan hanya dapat dibaca; riwayat tindakannya tetap tersimpan.",
          "Nomor versi tidak dipakai ulang. Untuk menyusun lagi, buat lembar baru dari versi yang berlaku atau dari angka predefined.",
        ] : [
          "Versi ini sudah diarsipkan karena digantikan versi yang lebih baru, dan hanya dapat dibaca.",
        ]
      } />

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
        <Isian judul="Tanggal rapat awal tahun">
          <input type="date" className={kolom} aria-label="Tanggal rapat" value={meta.tgl} max={hariIni} disabled={!bisaUbah} onChange={(e) => ubahMeta({ ...meta, tgl: e.target.value })} />
        </Isian>
        <Isian judul="Nomor notulen atau SK">
          <input className={kolom} aria-label="Nomor notulen atau SK" value={meta.nomor} maxLength={120} disabled={!bisaUbah} placeholder="mis. Notulen 01/BPS-1303/2026" onChange={(e) => ubahMeta({ ...meta, nomor: e.target.value })} />
        </Isian>
      </div>
      <Isian judul="Tujuan mutu (apa yang dijaga oleh kebijakan ini)">
        <textarea className={`${kolom} min-h-[72px] py-2`} aria-label="Tujuan mutu" value={meta.tujuan} maxLength={600} disabled={!bisaUbah} onChange={(e) => ubahMeta({ ...meta, tujuan: e.target.value })} />
      </Isian>

      {(row.status === "menunggu" || row.status === "berlaku" || row.status === "arsip") && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-[#5B6B84]">Pengesah (dibekukan saat diajukan)</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {aktif.map((x) => (
              <li key={`${x.peran_kode}-${x.akun_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-[#EEF2F7] px-2.5 py-1.5 text-[13px]">
                <span className="font-semibold text-[#0F2A52]">{x.akun_nama ?? `Akun ${x.akun_id}`}</span>
                <span className="text-[12px] text-[#5B6B84]">{labelPeran(x.peran_kode)}</span>
                <span className="ml-auto"><Chip warna={x.setuju_at ? "hijau" : "kuning"}>{x.setuju_at ? `Setuju · ${waktu(x.setuju_at)}` : "Menunggu"}</Chip></span>
              </li>
            ))}
            {aktif.length === 0 && <li className="text-[12.5px] text-[#5B6B84]">Daftar pengesah dibekukan saat lembar diajukan.</li>}
          </ul>
        </div>
      )}

      {kelengkapan.length > 0 && <Poin butir={kelengkapan} kelas="!text-[#8A6200]" />}
      <Galat pesan={galat} />

      {aksi.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[#EEF2F7] pt-3">
          {(perluCatatan || aksi.includes("setuju")) && (
            <Isian judul={aksi.includes("revisi") ? "Alasan revisi (minimal 10 huruf)" : "Catatan (wajib untuk mengembalikan atau membatalkan; minimal 5 huruf)"}>
              <textarea className={`${kolom} min-h-[56px] py-2`} aria-label="Catatan aksi" value={catatan} maxLength={400} onChange={(e) => setCatatan(e.target.value)} />
            </Isian>
          )}
          <div className="flex flex-wrap gap-2">
            {aksi.includes("simpan") && <button type="button" className={tombolKecil} disabled={mengirim || !kotor} onClick={() => onAksi("simpan")}>Simpan perubahan</button>}
            {aksi.includes("ajukan") && <button type="button" className={tombolUtama} disabled={mengirim || kotor || kelengkapan.length > 0} onClick={() => onAksi("ajukan")}>Ajukan untuk disahkan</button>}
            {aksi.includes("setuju") && <button type="button" className={tombolUtama} disabled={mengirim} onClick={() => onAksi("setuju")}>Setujui</button>}
            {aksi.includes("kembalikan") && <button type="button" className={tombolKecil} disabled={mengirim || catatan.trim().length < 5} onClick={() => onAksi("kembalikan")}>Kembalikan ke penyusun</button>}
            {aksi.includes("tarik") && <button type="button" className={tombolKecil} disabled={mengirim} onClick={() => onAksi("tarik")}>Tarik kembali</button>}
            {aksi.includes("batal") && <button type="button" className={tombolBahaya} disabled={mengirim || catatan.trim().length < 5} onClick={() => onAksi("batal")}>Batalkan draf</button>}
            {aksi.includes("revisi") && <button type="button" className={tombolKecil} disabled={mengirim || catatan.trim().length < 10} onClick={() => onAksi("revisi")}>Buka revisi (versi baru)</button>}
          </div>
        </div>
      )}
    </Bagian>
  );
}

const NAMA_AKSI: Record<string, string> = {
  buat: "Dibuat", ajukan: "Diajukan", setuju: "Menyetujui", kembalikan: "Dikembalikan", tarik: "Ditarik", batal: "Dibatalkan",
};

export function Riwayat({ riwayat }: { riwayat: RiwayatLembar[] }) {
  return (
    <Bagian huruf="F" judul="Riwayat" gsbpm="Jejak tiap tindakan pada versi ini" id={ID_BAGIAN.riwayat}>
      {riwayat.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada riwayat.</p> : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {riwayat.map((x) => (
            <li key={x.id} className="rounded-md border border-[#EEF2F7] px-2.5 py-1.5 text-[13px]">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <strong className="text-[#0F2A52]">{NAMA_AKSI[x.aksi] ?? x.aksi}</strong>
                <span className="text-[12px] text-[#5B6B84]">{x.oleh_nama ?? "—"} · {waktu(x.waktu)}</span>
              </div>
              {x.catatan && <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#44546F]">{x.catatan}</p>}
            </li>
          ))}
        </ul>
      )}
    </Bagian>
  );
}
