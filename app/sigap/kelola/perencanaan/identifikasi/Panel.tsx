"use client";

// app/sigap/kelola/perencanaan/identifikasi/Panel.tsx
//
// (25 Okt 2026) Kartu-kartu pendamping formulir Identifikasi survei: Pengesahan (kirim, persetujuan berurutan PPK -> Tata Usaha -> KPA, revisi),
// Hasil identifikasi, Kematangan (Fix/Perkiraan), Pembaruan periode H-15, Anggaran terhadap POK RO, serta turunan hilir (agenda Delego, evaluasi,
// rekrutmen). Murni tampilan: aturan di lib/keu/identifikasi*.ts dan fungsi keu_ident_* basis data.

import { useState } from "react";
import { angka } from "@/lib/keu/ro";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, tombolBahaya, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import {
  TAHAP, adaPendataan, adaPeriode, daftarPeriode, tglIndo, type Beda, type Butir, type Form,
} from "@/lib/keu/identifikasi";
import {
  agendaPeriode, barisH15, cocokkanPok, evaluasiDari, labelStatus, langkahTampil, namaVersi, paketUntukAkun, periksaGeser, rekrutmenDari, siapaMenunggu,
  type AksiIdent, type AnggaranAkun, type BarisIdent, type BarisPok, type RiwayatIdent, type UpdTercatat,
} from "@/lib/keu/identifikasiHilir";
import { kebutuhan } from "@/lib/keu/identifikasi";
import { Cat } from "./Kontrol";

const NADA_LANGKAH = { abu: "border-[#DCE3EE] bg-white text-[#44546F]", hijau: "border-[#2E9E63] bg-[#E6F6EC] text-[#14653A]", kuning: "border-[#C98A00] bg-[#FFF4D6] text-[#8A6200]", merah: "border-[#B42329] bg-[#FDE8E8] text-[#B42329]", biru: "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" } as const;
const WAKTU = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const waktu = (s: string) => { try { return WAKTU.format(new Date(s)); } catch { return s; } };

export const LABEL_AKSI: Record<string, string> = {
  buat: "Dibuat", kirim: "Dikirim", setuju_ketua: "Disetujui ketua tim", setujui: "Disetujui", kembalikan: "Dikembalikan", tarik: "Ditarik kembali",
  ajukan_revisi: "Revisi diajukan", batal_revisi: "Revisi dibatalkan", batal: "Dibatalkan", h15: "Penegasan tanggal H-15",
};

// ---------------------------------------------------------------------------------------------------------------------
// Pengesahan
// ---------------------------------------------------------------------------------------------------------------------
export function KartuPengesahan(p: {
  row: BarisIdent; tersedia: AksiIdent[]; syarat: string[]; beda: Beda[]; dampak: string; nPerk: number;
  alasan: string; setAlasan: (s: string) => void; dirty: boolean; mengirim: boolean; galat: string | null; onAksi: (a: AksiIdent, catatan: string) => void; onSimpan: () => void;
}) {
  const { row, tersedia } = p;
  const [catatan, setCatatan] = useState("");
  const st = labelStatus(row);
  const langkah = langkahTampil(row);
  const perluCatatan = tersedia.includes("kembalikan") || tersedia.includes("batal");
  const catOk = catatan.trim().length >= 5;
  const revisi = row.status === "revisi";
  const aksi = (a: AksiIdent) => () => { p.onAksi(a, catatan.trim()); setCatatan(""); };
  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="h-pengesahan">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="h-pengesahan" className={`${judulKartu} m-0`}>Pengesahan identifikasi</h2>
        <Chip warna={st.nada}>{st.teks}</Chip>
      </header>
      <p className="m-0 text-[13px] text-[#44546F]">{st.ket}</p>
      <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label="Persetujuan: PPK dan Tata Usaha paralel, KPA terakhir">
        {langkah.map((l) => (
          <li key={l.no} className={`rounded-lg border px-2.5 py-2 ${NADA_LANGKAH[l.nada]}`}>
            <span className="block text-[11px] font-bold uppercase tracking-wide opacity-80">{l.no === 3 ? "Terakhir (pengesah)" : "Paralel"}</span>
            <strong className="block text-[13.5px]">{l.nama}</strong>
            <span className="block text-[12px]">{l.status}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 text-[12px] text-[#5B6B84]">PPK dan Tata Usaha menyetujui secara paralel (urutan bebas), lalu KPA mengesahkan. Revisi yang dikirim sesudah H-15 cukup disetujui KPA dan dicatat untuk evaluasi. Sebelum disahkan, modul lain (anggaran, Delego, evaluasi, rekrutmen) belum memakai identifikasi ini.</p>

      {revisi && (
        <div>
          <label htmlFor="alasan-revisi" className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Alasan revisi (minimal 10 huruf)</label>
          <textarea id="alasan-revisi" className={`${kolom} min-h-[72px] py-2`} value={p.alasan} maxLength={500} disabled={!tersedia.includes("simpan")} onChange={(e) => p.setAlasan(e.target.value)} />
        </div>
      )}
      {revisi && p.beda.length > 0 && (
        <div>
          <h3 className="m-0 mb-1 text-[13px] font-bold text-[#0F2A52]">Perubahan dibanding {namaVersi(row.ver).toLowerCase()}</h3>
          <ul className="m-0 space-y-0.5 pl-5 text-[12.5px] text-[#1B2B4B]">{p.beda.map((b) => <li key={b.path}>{b.t}</li>)}</ul>
          {p.dampak && <p className="mt-2 text-[12.5px] text-[#44546F]">{p.dampak}</p>}
        </div>
      )}
      {p.syarat.length > 0 && tersedia.includes("kirim") && <Catatan>{p.syarat.map((s) => <span key={s} className="block">{s}</span>)}</Catatan>}
      {perluCatatan && (
        <div>
          <label htmlFor="catatan-aksi" className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Catatan (wajib untuk mengembalikan atau membatalkan, minimal 5 huruf)</label>
          <input id="catatan-aksi" className={kolom} value={catatan} maxLength={300} onChange={(e) => setCatatan(e.target.value)} />
        </div>
      )}
      <Galat pesan={p.galat} />
      <div className="flex flex-wrap gap-2">
        {tersedia.includes("simpan") && <button type="button" className={tombolKecil} disabled={p.mengirim || !p.dirty} onClick={p.onSimpan}>{p.dirty ? "Simpan draf" : "Tersimpan"}</button>}
        {tersedia.includes("kirim") && (
          <button type="button" className={tombolUtama} disabled={p.mengirim || p.syarat.length > 0} onClick={aksi("kirim")}>
            {revisi ? "Kirim revisi untuk persetujuan" : "Kirim untuk persetujuan"}{p.nPerk > 0 ? ` (${p.nPerk} butir perkiraan)` : ""}
          </button>
        )}
        {tersedia.includes("setuju_ketua") && <button type="button" className={tombolUtama} disabled={p.mengirim} onClick={aksi("setuju_ketua")}>Setujui sebagai ketua tim</button>}
        {tersedia.includes("setujui") && <button type="button" className={tombolUtama} disabled={p.mengirim} onClick={aksi("setujui")}>Setujui ({siapaMenunggu(row)})</button>}
        {tersedia.includes("kembalikan") && <button type="button" className={tombolBahaya} disabled={p.mengirim || !catOk} onClick={aksi("kembalikan")}>Kembalikan</button>}
        {tersedia.includes("tarik") && <button type="button" className={tombolKecil} disabled={p.mengirim} onClick={aksi("tarik")}>Tarik kembali</button>}
        {tersedia.includes("ajukan_revisi") && <button type="button" className={tombolKecil} disabled={p.mengirim} onClick={aksi("ajukan_revisi")}>Ajukan revisi</button>}
        {tersedia.includes("batal_revisi") && <button type="button" className={tombolKecil} disabled={p.mengirim} onClick={aksi("batal_revisi")}>Batalkan revisi</button>}
        {tersedia.includes("batal") && <button type="button" className={tombolBahaya} disabled={p.mengirim || !catOk} onClick={aksi("batal")}>Batalkan survei</button>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Hasil identifikasi dan kematangan
// ---------------------------------------------------------------------------------------------------------------------
export function KartuHasil({ masalah, peringatan }: { masalah: string[]; peringatan: string[] }) {
  const warna = masalah.length > 0 ? "merah" : peringatan.length > 0 ? "kuning" : "hijau";
  const teks = masalah.length > 0 ? `${masalah.length} hal perlu dilengkapi` : peringatan.length > 0 ? `Lengkap, ${peringatan.length} peringatan` : "Lengkap";
  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-hasil">
      <header className="flex flex-wrap items-center gap-2"><h2 id="h-hasil" className={`${judulKartu} m-0`}>Hasil identifikasi</h2><Chip warna={warna}>{teks}</Chip></header>
      {masalah.length > 0 && <Galat pesan={masalah} />}
      {peringatan.length > 0 && <ul className="m-0 space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#5C4300]">{peringatan.map((x) => <li key={x} className="list-none">{x}</li>)}</ul>}
      {masalah.length === 0 && peringatan.length === 0 && <p className="m-0 text-[13px] text-[#44546F]">Semua isian wajib sudah lengkap.</p>}
    </section>
  );
}

export function KartuKematangan({ butir, nFix, nPerk }: { butir: Butir[]; nFix: number; nPerk: number }) {
  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-matang">
      <header className="flex flex-wrap items-center gap-2"><h2 id="h-matang" className={`${judulKartu} m-0`}>Kematangan data: Fix dan Perkiraan</h2><Chip warna={butir.length === 0 ? "abu" : nPerk > 0 ? "kuning" : "hijau"}>{nFix} Fix · {nPerk} Perkiraan</Chip></header>
      <div className="flex flex-wrap gap-1" aria-hidden>
        {butir.map((b) => <i key={b.t} title={`${b.t}: ${b.perk ? "Perkiraan" : "Fix"}`} className={`block h-3 w-8 rounded-sm ${b.perk ? "bg-[#E3C25B]" : "bg-[#2E9E63]"}`} />)}
      </div>
      {nPerk > 0 ? (
        <>
          <p className="m-0 text-[13px] text-[#44546F]">Butir yang masih perkiraan (boleh dikirim; tegaskan lewat revisi atau penegasan tanggal H-15):</p>
          <ul className="m-0 space-y-0.5 pl-5 text-[13px]">{butir.filter((b) => b.perk).map((b) => <li key={b.t}>{b.t}</li>)}</ul>
        </>
      ) : butir.length > 0 ? <p className="m-0 text-[13px] text-[#14653A]">Semua butir sudah Fix.</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pembaruan periode H-15
// ---------------------------------------------------------------------------------------------------------------------
export function KartuH15({ formSah, tahun, upd, hariIni, bisa, mengirim, galat, onSimpan }: {
  formSah: Form; tahun: number; upd: Record<string, UpdTercatat> | null; hariIni: string; bisa: boolean; mengirim: boolean; galat: string | null;
  onSimpan: (periode: string, mulai: string, selesai: string) => void;
}) {
  const baris = barisH15(formSah, tahun, upd, hariIni);
  const [edit, setEdit] = useState<Record<string, { mulai?: string; selesai?: string }>>({});
  if (baris.length === 0) return null;
  const nTempo = baris.filter((b) => b.status.startsWith("Jatuh tempo") || b.status === "Terlambat").length;
  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-h15">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="h-h15" className={`${judulKartu} m-0`}>Penegasan tanggal periode (H-15)</h2>
        <Chip warna={nTempo > 0 ? "kuning" : "hijau"}>{nTempo > 0 ? `${nTempo} periode perlu ditegaskan` : "Tidak ada yang jatuh tempo"}</Chip>
      </header>
      <p className="m-0 text-[12.5px] text-[#44546F]">Ketua tim atau admin RO menegaskan tanggal pendataan setiap periode paling lambat 15 hari sebelum mulai (Perkiraan menjadi Fix). Tanggal tidak dapat digeser di sini: perubahan tanggal lewat revisi identifikasi, disetujui PPK dan Tata Usaha lalu KPA; sesudah H-15 versi terakhir dianggap final dan perubahan cukup disetujui KPA dengan dicatat untuk evaluasi.</p>
      <Galat pesan={galat} />
      {baris.map((b) => {
        const e = edit[b.periode] ?? {};
        const mulai = e.mulai ?? b.efektif.mulai; const selesai = e.selesai ?? b.efektif.selesai;
        const g = periksaGeser({ mulai: b.asli.mulai, selesai: b.asli.selesai }, { mulai, selesai });
        const fix = !!b.upd || !b.asli.perk;
        return (
          <div key={b.periode} className={`rounded-lg border border-l-4 border-[#DCE3EE] p-3 ${fix ? "border-l-[#2E9E63]" : "border-l-[#C98A00]"}`}>
            <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px] text-[#0F2A52]">{b.periode}</strong><Chip warna={b.nada}>{b.status}</Chip><span className="text-[12px] font-semibold text-[#5B6B84]">{fix ? "Fix" : "≈ Perkiraan"}</span></div>
            <p className="my-1 text-[12.5px] text-[#44546F]">Menurut versi yang berlaku: {tglIndo(b.asli.mulai)} s.d. {tglIndo(b.asli.selesai)}. Batas penegasan (H-15): {tglIndo(b.h15)}.</p>
            {bisa && (
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
                <input type="date" aria-label={`Pendataan ${b.periode} mulai (diperbarui)`} className={kolom} value={mulai} onChange={(ev) => setEdit({ ...edit, [b.periode]: { ...e, mulai: ev.target.value } })} />
                <input type="date" aria-label={`Pendataan ${b.periode} selesai (diperbarui)`} className={kolom} value={selesai} min={mulai} onChange={(ev) => setEdit({ ...edit, [b.periode]: { ...e, selesai: ev.target.value } })} />
                <button type="button" className={tombolKecil} disabled={mengirim || g.salah || g.lewat} onClick={() => { onSimpan(b.periode, mulai, selesai); setEdit({ ...edit, [b.periode]: {} }); }}>{b.upd ? "Tegaskan lagi" : "Tegaskan tanggal (Fix)"}</button>
              </div>
            )}
            {bisa && (g.salah || g.lewat) && <p role="alert" className="mt-1 text-[12.5px] text-[#9B1C23]">{g.pesan}</p>}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Anggaran terhadap POK RO
// ---------------------------------------------------------------------------------------------------------------------
const WARNA_STATUS_AKUN = { ada: "hijau", paket_belum: "kuning", hilang: "kuning" } as const;

export function KartuAnggaran({ f, pok, memuat, galat, bisaPetakan, mengirim, onPetakan, ro }: {
  f: Form; pok: (BarisPok & { jumlah: number })[] | null; memuat: boolean; galat: string | null; bisaPetakan: boolean; mengirim: boolean;
  onPetakan: (kunci: string, paket: string[]) => void; ro: string;
}) {
  const need = kebutuhan(f);
  const [buka, setBuka] = useState(false);
  if (need.length === 0) {
    return (
      <section className={`${kartu} flex flex-col gap-2`} aria-labelledby="h-ang"><h2 id="h-ang" className={`${judulKartu} m-0`}>Anggaran: cek konsistensi dengan POK RO</h2><p className="m-0 text-[13px] text-[#44546F]">Jawaban saat ini tidak menimbulkan kebutuhan belanja.</p></section>
    );
  }
  const hasil: AnggaranAkun[] | null = pok ? cocokkanPok(need, pok) : null;
  const nPerlu = hasil ? hasil.filter((h) => h.perlu).length : 0;
  const akunDibutuhkan = new Set(need.map((n) => n.akun));
  const barisPetakan = (pok ?? []).filter((r) => akunDibutuhkan.has(r.akun) && paketUntukAkun(r.akun).length > 0);
  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-ang">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="h-ang" className={`${judulKartu} m-0`}>Anggaran: cek konsistensi dengan POK RO</h2>
        {hasil && <Chip warna={nPerlu === 0 ? "hijau" : "kuning"}>{nPerlu === 0 ? "Semua akun ada" : `${nPerlu} akun perlu tindak lanjut`}</Chip>}
      </header>
      <Galat pesan={galat} />
      {memuat && <p className="m-0 text-[13px] text-[#5B6B84]">Memuat POK RO {ro}…</p>}
      {hasil?.map((h) => (
        <div key={h.akun} className={`rounded-lg border border-l-4 border-[#DCE3EE] p-3 ${h.perlu ? "border-l-[#C98A00] bg-[#FFFBEF]" : "border-l-[#2E9E63]"}`}>
          <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px] text-[#0F2A52]">{h.akun}</strong><span className="text-[12.5px] text-[#44546F]">{h.nama}</span><Chip warna={WARNA_STATUS_AKUN[h.status]}>{h.label}</Chip></div>
          <p className="my-1 text-[12.5px] text-[#1B2B4B]">Dibutuhkan untuk: {h.alasan}</p>
          <p className="m-0 text-[12px] text-[#5B6B84]">Paket: {h.paket} · Jalur: {h.jalur}</p>
          <p className="my-1 text-[12.5px] text-[#44546F]">{h.ket}</p>
          {h.baris && <p className="m-0 text-[12px] text-[#5B6B84]">Baris POK: {h.baris}</p>}
          {h.saran && <p className="mt-1 text-[12.5px] text-[#1F5FD1]">{h.saran}</p>}
        </div>
      ))}
      {hasil && barisPetakan.length > 0 && (
        <div>
          <button type="button" className={tombolKecil} aria-expanded={buka} onClick={() => setBuka(!buka)}>{buka ? "Tutup pemetaan baris POK" : "Petakan baris POK RO ke paket belanja"}</button>
          {buka && (
            <div className="mt-2 flex flex-col gap-2">
              <Cat>Pemetaan berlaku untuk semua survei pada RO {ro}. Sistem hanya menyarankan; konfirmasi oleh ketua tim, admin RO, atau PPK.</Cat>
              {barisPetakan.map((r) => (
                <div key={r.kunci} className="rounded-lg border border-[#DCE3EE] p-2.5">
                  <p className="m-0 text-[13px] text-[#1B2B4B]"><strong>{r.akun}</strong> · {r.uraian} <span className="text-[#5B6B84]">(Rp {angka(r.jumlah)})</span></p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={`Paket untuk ${r.uraian}`}>
                    {paketUntukAkun(r.akun).map((k) => {
                      const on = r.paket.includes(k);
                      return (
                        <button key={k} type="button" role="checkbox" aria-checked={on} disabled={!bisaPetakan || mengirim}
                          className={`min-h-[36px] rounded-md border px-2.5 text-[12.5px] font-semibold disabled:opacity-60 ${on ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}
                          onClick={() => onPetakan(r.kunci, on ? r.paket.filter((x) => x !== k) : [...r.paket, k])}>{on ? "☑" : "☐"} {k}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!bisaPetakan && <p className="m-0 text-[12.5px] text-[#5B6B84]">Akun Anda tidak memiliki hak memetakan baris POK RO ini; hanya dapat melihat.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Turunan hilir: agenda Delego, evaluasi, rekrutmen
// ---------------------------------------------------------------------------------------------------------------------
const MARK = { fix: "border-l-[#2E9E63]", perk: "border-l-[#C98A00]", "": "border-l-[#C5D0E2]" } as const;

export function KartuHilir({ f, tahun, upd, sumber, pa, setPa }: { f: Form; tahun: number; upd: Record<string, UpdTercatat> | null; sumber: string; pa: string; setPa: (p: string) => void }) {
  const lst = daftarPeriode(f);
  const P = lst.includes(pa) ? pa : lst[0];
  const agenda = agendaPeriode(f, tahun, P, upd?.[P] ?? null);
  const rekrut = rekrutmenDari(f);
  const evaluasi = evaluasiDari(f);
  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="h-hilir">
      <header className="flex flex-wrap items-center gap-2"><h2 id="h-hilir" className={`${judulKartu} m-0`}>Delego, evaluasi, dan rekrutmen</h2><Chip warna="biru">{agenda.length} agenda</Chip></header>
      <p className="m-0 text-[12.5px] text-[#44546F]">{sumber}</p>
      {lst.length > 1 && (
        <div role="tablist" aria-label="Periode agenda" className="flex flex-wrap gap-1.5">
          {lst.map((q) => <button key={q} type="button" role="tab" aria-selected={q === P} onClick={() => setPa(q)} className={`min-h-[36px] rounded-md border px-2.5 text-[12.5px] font-semibold ${q === P ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>{q}</button>)}
        </div>
      )}
      <div>
        <h3 className="m-0 mb-1 text-[13px] font-bold text-[#0F2A52]">Agenda{lst.length > 1 ? ` · ${P}` : ""}</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">{agenda.map((a, i) => <li key={`${i}-${a.t}`} className={`border-l-4 bg-[#FAFBFD] px-2.5 py-1.5 text-[13px] text-[#1B2B4B] ${MARK[a.kelas]}`}>{a.t}</li>)}{agenda.length === 0 && <li className="text-[13px] text-[#5B6B84]">Belum ada agenda.</li>}</ul>
      </div>
      <div>
        <h3 className="m-0 mb-1 text-[13px] font-bold text-[#0F2A52]">Evaluasi</h3>
        <ul className="m-0 space-y-0.5 pl-5 text-[13px] text-[#1B2B4B]">{evaluasi.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <div>
        <h3 className="m-0 mb-1 text-[13px] font-bold text-[#0F2A52]">Rekrutmen</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">{rekrut.map((a, i) => <li key={`${i}-${a.t}`} className={`border-l-4 bg-[#FAFBFD] px-2.5 py-1.5 text-[13px] text-[#1B2B4B] ${MARK[a.kelas]}`}>{a.t}</li>)}</ul>
      </div>
      <div>
        <h3 className="m-0 mb-1 text-[13px] font-bold text-[#0F2A52]">Tahap yang aktif</h3>
        <ul className="m-0 flex flex-wrap gap-1.5 p-0">
          {TAHAP.map(([k, nama]) => {
            const ada = k === "updating" ? f.adaUpdating && adaPendataan(f) : k === "pendataan" ? adaPendataan(f) : k === "diseminasi" ? f.adaDiseminasi : true;
            return <li key={k} className="list-none"><Chip warna={ada ? "hijau" : "abu"}>{nama}</Chip></li>;
          })}
          {adaPeriode(f) && adaPendataan(f) && <li className="list-none"><Chip warna="hijau">Penegasan H-15</Chip></li>}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Riwayat
// ---------------------------------------------------------------------------------------------------------------------
export function KartuRiwayat({ riwayat }: { riwayat: RiwayatIdent[] }) {
  return (
    <section className={`${kartu} flex flex-col gap-2`} aria-labelledby="h-riwayat">
      <h2 id="h-riwayat" className={`${judulKartu} m-0`}>Riwayat</h2>
      {riwayat.length === 0 && <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada riwayat.</p>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {riwayat.slice(0, 12).map((r) => (
          <li key={r.id} className="border-l-4 border-l-[#C5D0E2] bg-[#FAFBFD] px-2.5 py-1.5 text-[12.5px] text-[#1B2B4B]">
            <strong>{LABEL_AKSI[r.aksi] ?? r.aksi}</strong>{r.oleh_nama ? ` oleh ${r.oleh_nama}` : ""} <span className="text-[#5B6B84]">· {waktu(r.waktu)}</span>
            {r.catatan && <span className="block text-[#44546F]">{r.catatan}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
