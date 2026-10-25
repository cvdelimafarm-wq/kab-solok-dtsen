"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/Pengecualian.tsx
//
// (25 Okt 2026, tahap 30) Kartu keputusan KPA (perubahan sesudah H-15 dan pengecualian kebijakan atau rangkap) dan kartu "dibaca modul hilir".
// Hanya tampilan; aturan tombol di lib/keu/notifikasi.ts dan ditegakkan basis data (berkas 20261025zh).

import { useState } from "react";
import { Catatan, Chip, judulKartu, kartu, kolom, label as kelasLabel, tombolBahaya, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { ID_LJ } from "@/lib/keu/lanjutan";
import type { AcuanModul } from "@/lib/keu/acuan";
import { aksiPengecualian, LABEL_STATUS_PENGECUALIAN, NAMA_JENIS_PENGECUALIAN, type BarisPengecualian } from "@/lib/keu/notifikasi";
import { Poin } from "../../Kontrol";

const waktu = (iso: string): string => {
  try { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)); } catch { return iso; }
};

export function KartuPengecualian(p: {
  baris: BarisPengecualian[]; kpa: boolean; susun: boolean; akun: number | null; peringatan: string[];
  mengirim: boolean; galat: string | null;
  onAjukan: (jenis: "kebijakan" | "rangkap", objek: string, alasan: string) => Promise<boolean>;
  onPutus: (id: number, setuju: boolean, catatan: string) => Promise<boolean>;
  onTarik: (id: number) => Promise<boolean>;
}) {
  const [jenis, setJenis] = useState<"kebijakan" | "rangkap">("kebijakan");
  const [pilih, setPilih] = useState("");
  const [bebas, setBebas] = useState("");
  const [alasan, setAlasan] = useState("");
  const [catatan, setCatatan] = useState<Record<number, string>>({});
  const objek = (pilih === "" ? bebas : pilih).trim();
  const menunggu = p.baris.filter((b) => b.status === "diajukan").length;
  const bisaAjukan = p.susun && objek.length >= 3 && alasan.trim().length >= 10 && !p.mengirim;

  return (
    <section id={ID_LJ.pengecualian} className={`${kartu} flex scroll-mt-20 flex-col gap-3`} aria-labelledby="h-lj-pengecualian">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="h-lj-pengecualian" className={`${judulKartu} m-0`}>Keputusan KPA</h2>
        {menunggu > 0 ? <Chip warna="kuning">{menunggu} menunggu</Chip> : <Chip warna="hijau">Tidak ada yang menunggu</Chip>}
      </header>
      <Catatan>
        Perubahan sesudah H-15 otomatis meminta keputusan KPA; keputusannya dicatat dan <strong>tidak menahan</strong> pemakaian versi oleh modul lain, lalu menjadi bahan evaluasi.
        Pelanggaran kebijakan atau rangkap jabatan yang disengaja diajukan sebagai pengecualian dengan alasan.
      </Catatan>
      {p.baris.length === 0 && <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada keputusan atau pengajuan.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {p.baris.map((b) => {
          const st = LABEL_STATUS_PENGECUALIAN[b.status];
          const aksi = aksiPengecualian(b, p.kpa, p.akun);
          return (
            <li key={b.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <Chip warna={st.nada}>{st.teks}</Chip>
                <span className="font-semibold text-[#0F2A52]">{NAMA_JENIS_PENGECUALIAN[b.jenis]}</span>
                {b.otomatis && <span className="rounded bg-[#EEF2F7] px-1.5 text-[11px] font-semibold text-[#44546F]">otomatis</span>}
                <span className="ml-auto text-[11.5px] text-[#5B6B84]">{b.diajukan_oleh_nama ?? "-"} · {waktu(b.diajukan_at)}</span>
              </div>
              <p className="m-0 text-[#1B2B4B] [overflow-wrap:anywhere]">{b.objek}</p>
              {b.alasan && <p className="m-0 text-[#44546F] [overflow-wrap:anywhere]">Alasan: {b.alasan}</p>}
              {b.diputus_at && <p className="m-0 text-[#44546F]">Diputus {b.diputus_oleh_nama ?? "KPA"} · {waktu(b.diputus_at)}{b.catatan_putusan ? `: ${b.catatan_putusan}` : ""}</p>}
              {aksi.includes("putus") && (
                <div className="flex flex-col gap-2">
                  <label className="block">
                    <span className={kelasLabel}>Catatan keputusan (wajib bila menolak, minimal 5 huruf)</span>
                    <input className={kolom} maxLength={300} value={catatan[b.id] ?? ""} onChange={(e) => setCatatan((c) => ({ ...c, [b.id]: e.target.value }))} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={tombolUtama} disabled={p.mengirim} onClick={() => void p.onPutus(b.id, true, catatan[b.id] ?? "")}>Setujui</button>
                    <button type="button" className={tombolBahaya} disabled={p.mengirim || (catatan[b.id] ?? "").trim().length < 5} onClick={() => void p.onPutus(b.id, false, catatan[b.id] ?? "")}>Tolak</button>
                  </div>
                </div>
              )}
              {aksi.includes("tarik") && <div><button type="button" className={tombolKecil} disabled={p.mengirim} onClick={() => void p.onTarik(b.id)}>Tarik pengajuan</button></div>}
            </li>
          );
        })}
      </ul>
      {p.susun && (
        <div className="flex flex-col gap-2.5 border-t border-[#EEF2F7] pt-3">
          <h3 className="m-0 text-[13.5px] font-bold text-[#0F2A52]">Ajukan pengecualian</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Jenis pengecualian">
            {(["kebijakan", "rangkap"] as const).map((j) => (
              <button key={j} type="button" role="radio" aria-checked={jenis === j} className={jenis === j ? "min-h-[40px] rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 text-[13px] font-semibold text-[#1F5FD1]" : tombolKecil} onClick={() => setJenis(j)}>{NAMA_JENIS_PENGECUALIAN[j]}</button>
            ))}
          </div>
          <label className="block">
            <span className={kelasLabel}>Hal yang dikecualikan</span>
            <select className={kolom} value={pilih} onChange={(e) => setPilih(e.target.value)}>
              <option value="">(tulis sendiri)</option>
              {p.peringatan.map((w) => <option key={w} value={w}>{w.length > 110 ? `${w.slice(0, 107)}…` : w}</option>)}
            </select>
          </label>
          {pilih === "" && (
            <label className="block">
              <span className={kelasLabel}>Uraian</span>
              <input className={kolom} maxLength={300} value={bebas} onChange={(e) => setBebas(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className={kelasLabel}>Alasan (minimal 10 huruf)</span>
            <textarea className={`${kolom} min-h-[64px] py-2`} rows={2} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
          </label>
          <div>
            <button
              type="button" className={tombolUtama} disabled={!bisaAjukan}
              onClick={() => void p.onAjukan(jenis, objek, alasan.trim()).then((ok) => { if (ok) { setPilih(""); setBebas(""); setAlasan(""); } })}
            >Ajukan ke KPA</button>
          </div>
        </div>
      )}
      {p.galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{p.galat}</p>}
    </section>
  );
}

export function KartuAcuan({ modul }: { modul: AcuanModul[] }) {
  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-lj-acuan">
      <h2 id="h-lj-acuan" className={`${judulKartu} m-0`}>Dibaca modul hilir</h2>
      <p className="m-0 text-[12.5px] text-[#44546F]">Ringkasan apa yang akan diambil modul lain dari identifikasi ini, dan dari versi yang mana.</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {modul.map((m) => (
          <li key={m.modul} className="flex min-w-0 flex-col gap-1 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[13.5px] text-[#0F2A52]">{m.modul}</strong>
              <Chip warna={m.siap ? "hijau" : "abu"}>{m.siap ? "Siap dibaca" : "Menunggu"}</Chip>
            </div>
            <span className="text-[11.5px] text-[#5B6B84]">Dari: {m.dari}</span>
            <Poin butir={m.butir} />
          </li>
        ))}
      </ul>
    </section>
  );
}
