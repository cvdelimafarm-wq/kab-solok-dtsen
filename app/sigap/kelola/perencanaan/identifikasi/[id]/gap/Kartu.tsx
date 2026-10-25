"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/gap/Kartu.tsx
//
// (25 Okt 2026, tahap 32) Kartu halaman Gap: temuan saat ini, perbandingan rencana dan kenyataan, penyimpanan (peringatan berjalan / laporan akhir), dan versi
// tersimpan beserta tanggapan. Hanya tampilan; aturan di lib/keu/gap.ts, hak ditegakkan basis data. Temuan tidak memblokir apa pun.

import Link from "next/link";
import { useState } from "react";
import { Catatan, Chip, kolom, label, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { hitungTingkat, LABEL_TINGKAT, NAMA_JENIS_GAP, NAMA_KATEGORI, TINGKAT, urutkanTemuan, type RingkasGap, type Temuan } from "@/lib/keu/gap";
import { Bagian, Poin } from "../../Kontrol";
import type { StatusTanggapan, TanggapanGap, VersiGap } from "./useGap";

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const waktu = (iso: string): string => {
  try { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)); } catch { return iso; }
};
const galatKotak = (g: string | null) => (g ? <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{g}</p> : null);
export const NAMA_TANGGAPAN: Record<StatusTanggapan, string> = { diterima: "Diterima", dijelaskan: "Dijelaskan", ditindaklanjuti: "Ditindaklanjuti" };

// ---------------------------------------------------------------------------------------------------------------------
export function KartuTemuanSaatIni({ identId, temuan }: { identId: number; temuan: Temuan[] }) {
  const h = hitungTingkat(temuan);
  const urut = urutkanTemuan(temuan);
  return (
    <Bagian huruf="A" judul="Temuan saat ini" id="gap-temuan">
      <div className="flex flex-wrap items-center gap-2">
        {TINGKAT.map((t) => <Chip key={t} warna={LABEL_TINGKAT[t].nada}>{h[t]} {LABEL_TINGKAT[t].teks.toLowerCase()}</Chip>)}
      </div>
      <Catatan>Temuan dihitung langsung dari rencana pada identifikasi lanjutan dibanding penugasan, laporan harian, jadwal, dan sisa pagu di SIGAP saat halaman dibuka. Temuan <strong>tidak memblokir</strong> apa pun; yang keras hanya diberitahukan ke PPK sesudah disimpan.</Catatan>
      {urut.length === 0 ? <p className="m-0 text-[13px] text-[#14653A]">Tidak ada selisih antara rencana dan pelaksanaan yang terdeteksi.</p> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {urut.map((t) => (
            <li key={t.kunci} className="flex flex-wrap items-start gap-2 rounded-lg border border-[#DCE3EE] px-3 py-2">
              <Chip warna={LABEL_TINGKAT[t.tingkat].nada}>{LABEL_TINGKAT[t.tingkat].teks}</Chip>
              <span className="rounded-full bg-[#EEF2F7] px-2 py-[2px] text-[11.5px] font-semibold text-[#44546F]">{NAMA_KATEGORI[t.kategori]}</span>
              <p className="m-0 min-w-0 flex-1 basis-[240px] text-[13px] leading-snug text-[#1B2B4B]">{t.pesan}</p>
              {t.tuju && <Link href={`/sigap/kelola/perencanaan/identifikasi/${identId}/pelaksanaan#${t.tuju}`} className="text-[12.5px] font-semibold text-[#1F5FD1] underline decoration-dotted underline-offset-[3px]">Buka kartunya →</Link>}
            </li>
          ))}
        </ul>
      )}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuBanding({ r }: { r: RingkasGap }) {
  return (
    <Bagian huruf="B" judul="Rencana dibanding kenyataan" id="gap-banding">
      {r.peran.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada peran lapangan yang dibandingkan.</p> : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12.5px]">
            <thead><tr className="border-b border-[#DCE3EE] text-[#5B6B84]"><th className="py-1.5 pr-2 font-semibold">Peran</th><th className="pr-2 text-right font-semibold">Rencana</th><th className="pr-2 text-right font-semibold">Ditugaskan</th><th className="text-right font-semibold">Selisih</th></tr></thead>
            <tbody>
              {r.peran.map((p) => (
                <tr key={p.peran} className="border-b border-[#EEF2F7]">
                  <td className="py-1.5 pr-2 text-[#0F2A52]">{p.nama}</td>
                  <td className="pr-2 text-right tabular-nums">{p.rencana}</td>
                  <td className="pr-2 text-right tabular-nums">{p.aktual}</td>
                  <td className={`text-right tabular-nums ${p.aktual < p.rencana ? "font-semibold text-[#B42329]" : p.aktual > p.rencana ? "font-semibold text-[#8A6200]" : "text-[#14653A]"}`}>{p.aktual - p.rencana > 0 ? "+" : ""}{p.aktual - p.rencana}</td>
                </tr>
              ))}
              <tr className="font-semibold text-[#0F2A52]"><td className="pt-1.5">Jumlah</td><td className="text-right tabular-nums">{r.petugasRencana}</td><td className="text-right tabular-nums">{r.petugasAktual}</td><td className="text-right tabular-nums">{r.petugasAktual - r.petugasRencana > 0 ? "+" : ""}{r.petugasAktual - r.petugasRencana}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      <Poin butir={[
        `${r.kegiatan} kegiatan tertaut, ${r.kegiatanBerakhir} di antaranya sudah berakhir.`,
        `Hari kerja dipilih ${r.hariKerja}, laporan harian masuk ${r.laporan}.`,
        `Kebutuhan biaya terhitung ${rp(r.kebutuhan)}${r.sisaPagu !== null ? `; sisa pagu pada akun terkait ${rp(r.sisaPagu)}` : "; laporan realisasi belum ada"}.`,
        `${r.rapatEvaluasi} rapat evaluasi tercatat.`,
      ]} />
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuSimpanGap(p: {
  bisa: boolean; mengirim: boolean; galat: string | null; sama: { berjalan: number | null; akhir: number | null }; layakAkhir: { layak: boolean; alasan: string };
  onSimpan: (jenis: "berjalan" | "akhir") => Promise<boolean>; pesan: string | null;
}) {
  return (
    <Bagian huruf="C" judul="Simpan" id="gap-simpan">
      <Catatan>Menyimpan membuat versi baru yang tidak dapat diubah. Peringatan pelaksanaan boleh disimpan berkali-kali selama berjalan; laporan Gap akhir disusun sesudah seluruh kegiatan tertaut berakhir. PPK diberi tahu bila ada temuan keras yang baru.</Catatan>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tombolUtama} disabled={!p.bisa || p.mengirim || p.sama.berjalan !== null} onClick={() => void p.onSimpan("berjalan")}>{p.mengirim ? "Menyimpan…" : "Simpan peringatan pelaksanaan"}</button>
        <button type="button" className={tombolKecil} disabled={!p.bisa || p.mengirim || !p.layakAkhir.layak || p.sama.akhir !== null} onClick={() => void p.onSimpan("akhir")}>Simpan laporan Gap akhir</button>
      </div>
      {p.sama.berjalan !== null && <p className="m-0 text-[12.5px] text-[#5B6B84]">Temuan saat ini sama dengan versi {p.sama.berjalan} (peringatan); tidak perlu disimpan lagi.</p>}
      {!p.layakAkhir.layak && <p className="m-0 text-[12.5px] text-[#5B6B84]">Laporan akhir belum dapat disimpan: {p.layakAkhir.alasan}</p>}
      {p.layakAkhir.layak && p.sama.akhir !== null && <p className="m-0 text-[12.5px] text-[#5B6B84]">Temuan saat ini sama dengan laporan akhir versi {p.sama.akhir}.</p>}
      {!p.bisa && <p className="m-0 text-[12.5px] text-[#5B6B84]">Menyimpan hanya untuk ketua tim, admin RO, PPK, atau KPA.</p>}
      {p.pesan && <p role="status" className="m-0 rounded-lg border-l-4 border-[#2E9E63] bg-[#E6F6EC] px-3 py-2 text-[13px] text-[#14653A]">{p.pesan}</p>}
      {galatKotak(p.galat)}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function BarisTemuanTersimpan(p: {
  t: Temuan; tanggapan: TanggapanGap | undefined; bisa: boolean; mengirim: boolean; onTanggapi: (kunci: string, status: StatusTanggapan, catatan: string) => Promise<boolean>;
}) {
  const [buka, setBuka] = useState(false);
  const [status, setStatus] = useState<StatusTanggapan>(p.tanggapan?.status ?? "diterima");
  const [catatan, setCatatan] = useState(p.tanggapan?.catatan ?? "");
  const wajib = status !== "diterima";
  const kurang = wajib && catatan.trim().length < 10;
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-[#DCE3EE] px-3 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <Chip warna={LABEL_TINGKAT[p.t.tingkat].nada}>{LABEL_TINGKAT[p.t.tingkat].teks}</Chip>
        <p className="m-0 min-w-0 flex-1 basis-[240px] text-[13px] leading-snug text-[#1B2B4B]">{p.t.pesan}</p>
        {p.tanggapan ? <Chip warna="hijau">{NAMA_TANGGAPAN[p.tanggapan.status]}</Chip> : <Chip warna="abu">Belum ditanggapi</Chip>}
        {p.bisa && <button type="button" className={tombolKecil} onClick={() => setBuka((b) => !b)} aria-expanded={buka}>{buka ? "Tutup" : p.tanggapan ? "Ubah tanggapan" : "Tanggapi"}</button>}
      </div>
      {p.tanggapan && <p className="m-0 text-[12px] text-[#5B6B84]">{p.tanggapan.oleh_nama ?? "-"}, {waktu(p.tanggapan.at)}{p.tanggapan.catatan ? ` — ${p.tanggapan.catatan}` : ""}</p>}
      {buka && (
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="block min-w-0"><span className={label}>Tanggapan</span>
            <select className={kolom} value={status} onChange={(e) => setStatus(e.target.value as StatusTanggapan)}>
              {(Object.keys(NAMA_TANGGAPAN) as StatusTanggapan[]).map((s) => <option key={s} value={s}>{NAMA_TANGGAPAN[s]}</option>)}
            </select>
          </label>
          <label className="block min-w-0"><span className={label}>{wajib ? "Penjelasan atau tindak lanjut (wajib, minimal 10 huruf)" : "Catatan (opsional)"}</span>
            <input className={kolom} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <button type="button" className={tombolUtama} disabled={p.mengirim || kurang} onClick={() => void p.onTanggapi(p.t.kunci, status, catatan.trim()).then((ok) => { if (ok) setBuka(false); })}>{p.mengirim ? "Menyimpan…" : "Simpan tanggapan"}</button>
          </div>
        </div>
      )}
    </li>
  );
}

export function KartuVersiGap(p: {
  versi: VersiGap[]; tanggapan: TanggapanGap[]; bisa: boolean; mengirim: boolean; galat: string | null;
  onTanggapi: (gapId: number, kunci: string, status: StatusTanggapan, catatan: string) => Promise<boolean>;
}) {
  const [pilih, setPilih] = useState<number | null>(null);
  const aktif = p.versi.find((v) => v.id === pilih) ?? p.versi[0] ?? null;
  return (
    <Bagian huruf="D" judul="Versi tersimpan dan tanggapan" id="gap-versi">
      {p.versi.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada versi tersimpan.</p> : (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Versi laporan Gap">
            {p.versi.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={aktif?.id === v.id} onClick={() => setPilih(v.id)}
                className={`min-h-[40px] rounded-md border px-3 text-[13px] font-semibold ${aktif?.id === v.id ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>
                v{v.ver} · {v.jenis === "akhir" ? "Akhir" : "Berjalan"}{v.n_keras > 0 ? ` · ${v.n_keras} keras` : ""}
              </button>
            ))}
          </div>
          {aktif && (
            <div className="flex min-w-0 flex-col gap-2">
              <p className="m-0 text-[12.5px] text-[#5B6B84]">{NAMA_JENIS_GAP[aktif.jenis]} versi {aktif.ver}, disimpan {aktif.dibuat_oleh_nama ?? "-"} pada {waktu(aktif.dibuat_at)}{aktif.lanjutan_ver ? `, berdasar lanjutan v${aktif.lanjutan_ver}` : ""}. {aktif.n_keras} keras, {aktif.n_sedang} perlu perhatian, {aktif.n_info} informasi.</p>
              {aktif.temuan.length === 0 ? <p className="m-0 text-[13px] text-[#14653A]">Versi ini mencatat tidak ada temuan.</p> : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {urutkanTemuan(aktif.temuan).map((t) => (
                    <BarisTemuanTersimpan key={`${aktif.id}-${t.kunci}`} t={t} tanggapan={p.tanggapan.find((x) => x.gap_id === aktif.id && x.kunci === t.kunci)} bisa={p.bisa} mengirim={p.mengirim}
                      onTanggapi={(k, s, c) => p.onTanggapi(aktif.id, k, s, c)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {galatKotak(p.galat)}
    </Bagian>
  );
}
