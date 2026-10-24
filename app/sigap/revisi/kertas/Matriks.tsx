"use client";

// app/sigap/revisi/kertas/Matriks.tsx
//
// (24 Okt 2026) Matriks kertas kerja satu KRO (papan 1 mockup): hierarki RO > Komponen > Akun > Item dalam satu kisi 15 kolom
// SEMULA | MENJADI | PERUBAHAN | KETERSEDIAAN, dengan cari, filter nilai, dan urut per kolom, kotak centang dan bilah aksi massal,
// kolom Menjadi yang dapat diketik (rumus =18*2 diterima), serta rincian RAB per item. Logika murni: lib/keu/matriks.ts.
// Menulis: keu_tulis (keu_kk_baris, keu_rab_item) dan fungsi keu_kk_* lewat gerbang; hak dan aturan ditegakkan basis data.

import { useEffect, useMemo, useState } from "react";
import { angka } from "@/lib/keu/ro";
import { LABEL_PEMICU, n } from "@/lib/keu/kk";
import {
  adaSaring, aksiMassal, idDalam, KOLOM, hitungRumus, keadaanPilih, nilaiBeda, putarUrut, ratakan, ubahPilih,
  type BarisMx, type IdKolom, type Saring, type Simpul, type Urut,
} from "@/lib/keu/matriks";
import { Catatan, Galat, tombolBahaya, tombolKecil } from "../../keu-ui";
import { aksiKeu, tulisKeuKlien } from "../../ro/useKeu";

export type RincianRab = { baris_id: number; item_id: number; ket: string | null; volume: number | string; satuan: string | null; harga_satuan: number | string; jumlah: number | string };

const GRID = "grid [grid-template-columns:150px_minmax(260px,1fr)_62px_54px_92px_108px_66px_58px_92px_108px_104px_58px_94px_94px_56px]";
const LEBAR = "min-w-[1360px]";
const fmtJ = (v: number) => (v === 0 ? "0" : angka(v));
const fmtD = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`);
const warnaD = (v: number, gelap = false) => (v > 0 ? (gelap ? "text-[#8FE0B6]" : "text-[#0B6B3F]") : v < 0 ? (gelap ? "text-[#FFB4A8]" : "text-[#9B1C23]") : "");

// latar kolom menurut mockup: Semula biru muda, Menjadi hijau muda
const latarKolom = (i: number): string => (i >= 2 && i <= 5 ? "bg-[#EEF4FD]" : i >= 6 && i <= 9 ? "bg-[#EAF6EF]" : "");

// ---------------------------------------------------------------- sel yang dapat diketik
function SelEdit({ nilai, aria, aktif, ubah, onSimpan }: { nilai: number; aria: string; aktif: boolean; ubah: boolean; onSimpan: (v: number) => Promise<string | null> }) {
  const [t, setT] = useState(String(nilai));
  const [kerja, setKerja] = useState(false);
  const [salah, setSalah] = useState<string | null>(null);
  useEffect(() => { setT(String(nilai)); setSalah(null); }, [nilai]);
  if (!aktif) return <span className="px-1">{fmtJ(nilai)}</span>;
  const simpan = async () => {
    if (t.trim() === String(nilai)) return;
    const v = hitungRumus(t);
    if (v === null || v < 0) { setSalah("Isi angka 0 atau lebih, atau rumus seperti =18*2."); return; }
    if (v === nilai) { setT(String(nilai)); return; }
    setKerja(true); setSalah(null);
    const g = await onSimpan(v);
    setKerja(false);
    if (g) { setSalah(g); setT(String(nilai)); }
  };
  return (
    <input
      aria-label={aria} title={salah ?? "Ketik angka atau rumus (mis. =18*2), lalu Enter"} inputMode="decimal" value={t} disabled={kerja}
      onChange={(e) => setT(e.target.value)} onBlur={() => void simpan()} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setT(String(nilai)); setSalah(null); } }}
      className={`h-[24px] w-full min-w-0 rounded border px-1 text-right font-mono text-[12px] tabular-nums focus:outline-2 focus:outline-[#1F5FD1] ${salah ? "border-[#B42329] bg-[#FDE8E8]" : ubah ? "border-[#E2B84A] bg-[#FFF3C4]" : "border-[#C5D0E2] bg-white"} ${kerja ? "opacity-50" : ""}`}
    />
  );
}

// ---------------------------------------------------------------- kepala kolom
function KepalaKolom({ id, label, angka: ang, saring, setSaring, urut, setUrut, baris, kanan }: {
  id: IdKolom; label: string; angka: boolean; saring: Saring; setSaring: (s: Saring) => void; urut: Urut; setUrut: (u: Urut) => void; baris: BarisMx[]; kanan: boolean;
}) {
  const [buka, setBuka] = useState<null | "q" | "f">(null);
  const f = saring[id] ?? { q: "", pilih: [] };
  const opsi = useMemo(() => (buka === "f" ? nilaiBeda(baris, id).slice(0, 60) : []), [buka, baris, id]);
  const set = (x: { q: string; pilih: string[] }) => setSaring({ ...saring, [id]: x });
  const aktifQ = f.q.trim() !== "", aktifF = f.pilih.length > 0, aktifU = urut?.kolom === id;
  const ikon = (on: boolean) => `inline-flex h-[18px] w-[18px] items-center justify-center rounded text-[11px] leading-none ${on ? "bg-[#1F5FD1] text-white" : "text-[#5B6B84] hover:bg-[#DCE6F5]"}`;
  return (
    <div className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11.5px] font-semibold ${ang ? "" : ""}`}>
      <span className="truncate">{label}{aktifU ? (urut?.arah === "naik" ? " ▲" : " ▼") : ""}</span>
      <span className="flex items-center gap-0.5">
        <button type="button" aria-label={`Cari di kolom ${label}`} title={`Cari di kolom ${label}`} className={ikon(aktifQ)} onClick={() => setBuka(buka === "q" ? null : "q")}>⌕</button>
        <button type="button" aria-label={`Urutkan kolom ${label}`} title={`Urutkan kolom ${label}`} className={ikon(aktifU)} onClick={() => setUrut(putarUrut(urut, id))}>⇅</button>
        <button type="button" aria-label={`Filter kolom ${label}`} title={`Filter kolom ${label}`} className={ikon(aktifF)} onClick={() => setBuka(buka === "f" ? null : "f")}>▾</button>
      </span>
      {buka === "q" && (
        <div className={`absolute top-full z-30 flex w-56 flex-col gap-1.5 rounded-lg border border-[#C5D0E2] bg-white p-2 text-left font-normal shadow-lg ${kanan ? "right-0" : "left-0"}`}>
          <input autoFocus aria-label="Cari" placeholder={`Cari di ${label}…`} value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} className="h-8 rounded border border-[#C5D0E2] px-2 text-[12.5px]" />
          <button type="button" className={`${tombolKecil} !min-h-[30px] !text-[12px]`} onClick={() => { set({ ...f, q: "" }); setBuka(null); }}>Hapus pencarian</button>
        </div>
      )}
      {buka === "f" && (
        <div className={`absolute top-full z-30 flex max-h-64 w-60 flex-col gap-1 overflow-auto rounded-lg border border-[#C5D0E2] bg-white p-2 text-left font-normal shadow-lg ${kanan ? "right-0" : "left-0"}`}>
          {opsi.map((o) => {
            const on = f.pilih.includes(o);
            return (
              <label key={o} className="flex min-h-[26px] cursor-pointer items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={on} onChange={() => set({ ...f, pilih: on ? f.pilih.filter((x) => x !== o) : [...f.pilih, o] })} />
                <span className="truncate">{o === "" ? "(kosong)" : o}</span>
              </label>
            );
          })}
          <button type="button" className={`${tombolKecil} !min-h-[30px] !text-[12px]`} onClick={() => { set({ ...f, pilih: [] }); setBuka(null); }}>Hapus filter</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- matriks
export default function Matriks({ pohon, semua, namaRo, bisaUbah, rincian, sesudah, onGanti, onTambah }: {
  pohon: Simpul[]; semua: BarisMx[]; namaRo: Map<string, string>; bisaUbah: (ro: string) => boolean; rincian: Map<number, RincianRab[]>;
  sesudah: () => Promise<void>; onGanti: (b: BarisMx) => void; onTambah: (d: { ro: string; komponen: string; akun: string }) => void;
}) {
  const [tutup, setTutup] = useState<Set<string>>(new Set());
  const [saring, setSaring] = useState<Saring>({});
  const [urut, setUrut] = useState<Urut>(null);
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [hanya, setHanya] = useState(false);
  const [tampilRab, setTampilRab] = useState<Set<number>>(new Set());
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // pilihan yang barisnya sudah tidak ada (mis. dihapus) dibuang
  useEffect(() => { const ada = new Set(semua.map((b) => b.id)); setPilih((p) => { const baru = new Set([...p].filter((i) => ada.has(i))); return baru.size === p.size ? p : baru; }); }, [semua]);

  const daftar = useMemo(() => ratakan(pohon, tutup, saring, urut, hanya ? pilih : null), [pohon, tutup, saring, urut, hanya, pilih]);
  const tampil = useMemo(() => daftar.filter((x) => x.tipe === "item").map((x) => (x.tipe === "item" ? x.b : null)).filter((b): b is BarisMx => b !== null), [daftar]);
  const idTampil = useMemo(() => tampil.map((b) => b.id), [tampil]);
  const dipilih = useMemo(() => semua.filter((b) => pilih.has(b.id)), [semua, pilih]);
  const aksi = useMemo(() => aksiMassal(dipilih), [dipilih]);
  const semuaBisaUbah = dipilih.every((b) => bisaUbah(b.ro_kode));
  const keadaanSemua = keadaanPilih(idTampil, pilih);

  const alih = (k: string) => setTutup((t) => { const b = new Set(t); if (b.has(k)) b.delete(k); else b.add(k); return b; });
  const kerja = async (langkah: () => Promise<string | null>) => {
    setSibuk(true); setGalat(null);
    const g = await langkah();
    if (g) setGalat(g);
    await sesudah();
    setSibuk(false);
  };
  const simpanSel = (b: BarisMx, kolom: "vol_menjadi" | "harga_menjadi") => async (v: number): Promise<string | null> => {
    const r = await tulisKeuKlien("keu_kk_baris", "update", { [kolom]: v }, { id: b.id });
    if (r.ok) await sesudah();
    return r.ok ? null : r.pesan;
  };
  const kosongkan = (b: BarisMx) => kerja(async () => { const r = await tulisKeuKlien("keu_kk_baris", "update", { vol_menjadi: 0 }, { id: b.id }); return r.ok ? null : r.pesan; });
  const hapus = (b: BarisMx) => kerja(async () => { const r = await aksiKeu("keu_kk_hapus_baris", { p_baris: b.id }); return r.ok ? null : r.pesan; });
  const batalPindah = () => kerja(async () => {
    // pasangan terbaru lebih dulu supaya urutan pengembalian volume benar
    for (const b of [...dipilih].sort((a, c) => c.id - a.id)) { const r = await aksiKeu("keu_kk_hapus_baris", { p_baris: b.id }); if (!r.ok) return r.pesan; }
    setPilih(new Set());
    return null;
  });
  const tandaiSelesai = (nilai: boolean) => kerja(async () => {
    const ids = [...new Set(dipilih.map((b) => b.rab_item_id).filter((x): x is number => x !== null))];
    for (const id of ids) { const r = await tulisKeuKlien("keu_rab_item", "update", { selesai: nilai }, { id }); if (!r.ok) return r.pesan; }
    return null;
  });
  const alihTampilRab = () => setTampilRab((s) => { const b = new Set(s); const ids = dipilih.filter((x) => x.rab_item_id !== null).map((x) => x.id); const semuaAda = ids.every((i) => b.has(i)); for (const i of ids) { if (semuaAda) b.delete(i); else b.add(i); } return b; });

  const cekSemua = (nyala: boolean) => setPilih((p) => ubahPilih(p, idTampil, nyala));
  const kepala = (mulai: number, selesai: number) => KOLOM.slice(mulai, selesai);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={tombolKecil} onClick={() => setTutup(new Set(pohon.map((r) => r.kunci)))}>Ciutkan sampai RO</button>
        <button type="button" className={tombolKecil} onClick={() => setTutup(new Set())}>Buka semua</button>
        <button type="button" className={tombolKecil} disabled={!adaSaring(saring) && urut === null} onClick={() => { setSaring({}); setUrut(null); }}>Hapus filter dan urutan kolom</button>
        <span className="text-[12px] text-[#5B6B84]">{tampil.length} dari {semua.length} baris tampil. Kolom Menjadi dapat diketik langsung; rumus sederhana seperti =18*2 diterima.</span>
      </div>

      {dipilih.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#1F5FD1] bg-[#EAF1FC] px-3 py-2 text-[12.5px]">
          <b className="text-[#0F2A52]">{dipilih.length} dipilih</b>
          <span className="text-[#44546F]">Rp {angka(dipilih.reduce((s, b) => s + n(b.jumlah_menjadi), 0))} (Menjadi)</span>
          {aksi.ganti && <button type="button" disabled={sibuk || !semuaBisaUbah} className={`${tombolKecil} !min-h-[32px]`} onClick={() => onGanti(dipilih[0])}>Ganti akun</button>}
          {aksi.batalPindah && <button type="button" disabled={sibuk || !semuaBisaUbah} className={`${tombolKecil} !min-h-[32px]`} onClick={() => void batalPindah()}>Batalkan pindah akun</button>}
          {aksi.tambahDiAkun && <button type="button" disabled={sibuk || !semuaBisaUbah} className={`${tombolKecil} !min-h-[32px]`} onClick={() => onTambah(aksi.tambahDiAkun!)}>Tambah item di akun {aksi.tambahDiAkun.akun}</button>}
          {aksi.selesai && <button type="button" disabled={sibuk} className={`${tombolKecil} !min-h-[32px]`} onClick={() => void tandaiSelesai(true)}>Tandai selesai</button>}
          {aksi.bukaKembali && <button type="button" disabled={sibuk} className={`${tombolKecil} !min-h-[32px]`} onClick={() => void tandaiSelesai(false)}>Buka kembali</button>}
          {aksi.tampilRab && <button type="button" className={`${tombolKecil} !min-h-[32px]`} onClick={alihTampilRab}>Tampilkan RAB</button>}
          <button type="button" className={`${tombolKecil} !min-h-[32px] ${hanya ? "!border-[#1F5FD1] !bg-[#E3EEFF] !text-[#1F5FD1]" : ""}`} onClick={() => setHanya(!hanya)}>Hanya yang dipilih</button>
          <button type="button" className={`${tombolKecil} !min-h-[32px]`} onClick={() => { setPilih(new Set()); setHanya(false); }}>Bersihkan pilihan</button>
        </div>
      ) : (
        <div className="text-[12px] text-[#5B6B84]">Centang baris, akun, atau RO untuk menampilkan aksi di sini: ganti akun, tambah item, tandai selesai, tampilkan RAB, dan lainnya.</div>
      )}
      <Galat pesan={galat} />

      <div className="max-h-[78vh] overflow-auto rounded-xl border border-[#C5D0E2] bg-white">
        <div className={LEBAR}>
          {/* kepala kelompok */}
          <div className={`sticky top-0 z-20 ${GRID} bg-[#E8EEF8] text-[11px] font-bold tracking-wide text-[#1B2B4B]`}>
            <div /><div />
            <div className="col-span-4 border-b-[3px] border-[#2F6FD0] py-1 text-center text-[#1B4B99]">SEMULA (POK berlaku)</div>
            <div className="col-span-4 border-b-[3px] border-[#13794B] py-1 text-center text-[#0B5A38]">MENJADI (usulan)</div>
            <div className="col-span-2 py-1 text-center">PERUBAHAN</div>
            <div className="col-span-3 py-1 text-center">KETERSEDIAAN</div>
          </div>
          {/* kepala kolom */}
          <div className={`sticky top-[27px] z-20 ${GRID} border-b border-[#C5D0E2] bg-[#E8EEF8]`}>
            {kepala(0, 15).map((k, i) => (
              <div key={`${k.id}`} className="relative">
                {i === 0 && (
                  <label className="absolute left-1 top-1 z-10 flex h-[20px] items-center"><input type="checkbox" aria-label="Pilih semua baris yang tampil" checked={keadaanSemua === "penuh"} ref={(el) => { if (el) el.indeterminate = keadaanSemua === "sebagian"; }} onChange={(e) => cekSemua(e.target.checked)} /></label>
                )}
                <KepalaKolom id={k.id} label={k.label} angka={k.angka} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} baris={semua} kanan={i >= 10} />
              </div>
            ))}
          </div>

          {daftar.length === 0 && <div className="p-4 text-[13px] text-[#5B6B84]">Tidak ada baris yang cocok dengan filter.</div>}

          {daftar.map((x) => {
            if (x.tipe !== "item") {
              const s = x.simpul;
              const ids = idDalam(s, saring);
              const kp = keadaanPilih(ids, pilih);
              const ro = s.jenis === "ro", kom = s.jenis === "komp";
              const gelap = ro;
              const lat = ro ? "bg-[#1F3B63] text-white" : kom ? "bg-[#D4E2F6] text-[#12315E]" : "bg-[#FFEFC2] text-[#3B2A00] border-t border-[#E2B84A]";
              const bar = ro ? "" : kom ? "shadow-[inset_4px_0_0_#2F6FD0]" : "shadow-[inset_5px_0_0_#C98A00]";
              const teksJudul = ro ? (namaRo.get(s.ro) ?? "") : kom ? `Komponen ${s.komponen}` : "";
              return (
                <div key={s.kunci} className={`${GRID} ${lat} text-[12.5px] font-semibold`}>
                  <div className={`flex items-center gap-1 px-1.5 py-1 ${bar}`} style={{ paddingLeft: 6 + x.kedalaman * 12 }}>
                    <input type="checkbox" aria-label={`Pilih ${s.label}`} checked={kp === "penuh"} ref={(el) => { if (el) el.indeterminate = kp === "sebagian"; }} onChange={(e) => setPilih((p) => ubahPilih(p, ids, e.target.checked))} />
                    <button type="button" aria-label={x.tutup ? "Buka" : "Ciutkan"} aria-expanded={!x.tutup} className="h-5 w-5 rounded text-[11px] hover:bg-black/10" onClick={() => alih(s.kunci)}>{x.tutup ? "▶" : "▼"}</button>
                    <span className="font-mono">{s.label}</span>
                  </div>
                  <div className="flex min-w-0 items-center truncate px-1.5">{teksJudul}{s.jenis === "akun" && <span className="font-normal opacity-80">{s.item.length} baris</span>}</div>
                  <div className="col-span-3" />
                  <div className="flex items-center justify-end px-1.5 font-mono tabular-nums">{fmtJ(s.semula)}</div>
                  <div className="col-span-3" />
                  <div className="flex items-center justify-end px-1.5 font-mono tabular-nums">{fmtJ(s.menjadi)}</div>
                  <div className={`flex items-center justify-end px-1.5 font-mono tabular-nums ${warnaD(s.selisih, gelap)}`}>{fmtD(s.selisih)}</div>
                  <div />
                  <div className="flex items-center justify-end px-1.5 font-mono tabular-nums">{s.booked ? fmtJ(s.booked) : ""}</div>
                  <div className="flex items-center justify-end px-1.5 font-mono tabular-nums">{s.real ? fmtJ(s.real) : ""}</div>
                  <div />
                </div>
              );
            }
            const b = x.b;
            const bisa = bisaUbah(b.ro_kode);
            const d = n(b.selisih);
            const ubahVol = n(b.vol_menjadi) !== n(b.vol_semula) && b.detail_id !== null, ubahHarga = n(b.harga_menjadi) !== n(b.harga_semula) && b.detail_id !== null;
            const baru = b.detail_id === null;
            const bgBaris = b.penggenap ? "bg-[#FFFBEB]" : b.pindah_dari !== null ? "bg-[#F3EEFB]" : baru ? "bg-[#E5F6EC]" : "bg-white";
            const rinci = tampilRab.has(b.id) ? (rincian.get(b.rab_item_id ?? -1) ?? []) : null;
            return (
              <div key={b.id}>
                <div className={`${GRID} ${bgBaris} border-t border-[#EEF2F7] text-[12px]`}>
                  <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ paddingLeft: 6 + x.kedalaman * 12 }}>
                    <input type="checkbox" aria-label={`Pilih ${b.uraian_menjadi ?? b.uraian_semula ?? "baris"}`} checked={pilih.has(b.id)} onChange={(e) => setPilih((p) => ubahPilih(p, [b.id], e.target.checked))} />
                    <span className="truncate font-mono text-[11.5px] text-[#44546F]">{b.nomor ?? (b.penggenap ? "penggenap" : baru ? "baru" : "")}</span>
                  </div>
                  <div className="flex min-w-0 flex-col justify-center px-1.5 py-0.5">
                    <span className="break-words font-semibold text-[#0F2A52]">{b.uraian_menjadi ?? b.uraian_semula}</span>
                    {b.uraian_semula && b.uraian_menjadi && b.uraian_semula !== b.uraian_menjadi && <span className="text-[11px] text-[#7A8AA3]">semula: {b.uraian_semula}</span>}
                    {b.akun_semula && b.akun_semula !== b.akun_menjadi && <span className="text-[11px] text-[#6B3FA0]">pindahan dari akun {b.akun_semula}</span>}
                    {b.pindah_ke !== null && <span className="text-[11px] text-[#6B3FA0]">dipindah ke akun lain (pasangan)</span>}
                    {b.penggenap && <span className="text-[11px] font-semibold text-[#8A6200]">Dana penggenap</span>}
                    {bisa && (
                      <span className="flex gap-2 text-[11px]">
                        {!baru && b.pindah_ke === null && n(b.vol_menjadi) > 0 && <button type="button" disabled={sibuk} className="text-[#1B4B99] underline-offset-2 hover:underline" onClick={() => void kosongkan(b)}>Kosongkan</button>}
                        {baru && <button type="button" disabled={sibuk} className={`${tombolBahaya} !min-h-0 !border-0 !bg-transparent !p-0 !text-[11px] hover:underline`} onClick={() => void hapus(b)}>Hapus</button>}
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center justify-end px-1.5 font-mono tabular-nums ${latarKolom(2)}`}>{baru ? "—" : angka(b.vol_semula)}</div>
                  <div className={`flex items-center px-1.5 ${latarKolom(3)}`}>{baru ? "" : b.sat_semula}</div>
                  <div className={`flex items-center justify-end px-1.5 font-mono tabular-nums ${latarKolom(4)}`}>{baru ? "" : fmtJ(n(b.harga_semula))}</div>
                  <div className={`flex items-center justify-end px-1.5 font-mono tabular-nums ${latarKolom(5)}`}>{baru ? "" : fmtJ(n(b.jumlah_semula))}</div>
                  <div className={`flex items-center px-0.5 ${latarKolom(6)}`}><SelEdit nilai={n(b.vol_menjadi)} aria={`Volume menjadi ${b.uraian_menjadi ?? ""}`} aktif={bisa && !sibuk} ubah={ubahVol} onSimpan={simpanSel(b, "vol_menjadi")} /></div>
                  <div className={`flex items-center px-1.5 ${latarKolom(7)}`}>{b.sat_menjadi}</div>
                  <div className={`flex items-center px-0.5 ${latarKolom(8)}`}><SelEdit nilai={n(b.harga_menjadi)} aria={`Harga satuan menjadi ${b.uraian_menjadi ?? ""}`} aktif={bisa && !sibuk} ubah={ubahHarga} onSimpan={simpanSel(b, "harga_menjadi")} /></div>
                  <div className={`flex items-center justify-end px-1.5 font-mono font-semibold tabular-nums text-[#0B5A38] ${latarKolom(9)} ${d !== 0 ? "!bg-[#FFF3C4]" : ""}`}>{fmtJ(n(b.jumlah_menjadi))}</div>
                  <div className={`flex items-center justify-end px-1.5 font-mono font-semibold tabular-nums ${warnaD(d)}`}>{fmtD(d)}</div>
                  <div className="flex items-center px-1">{b.pemicu && <span title={LABEL_PEMICU[b.pemicu] ?? ""} className="rounded bg-[#E4EEFB] px-1.5 text-[11px] font-semibold text-[#1B4B99]">{b.pemicu}</span>}</div>
                  <div className="flex items-center justify-end px-1.5 font-mono tabular-nums text-[#44546F]">{b.booked ? fmtJ(b.booked) : ""}</div>
                  <div className="flex items-center justify-end px-1.5 font-mono tabular-nums text-[#44546F]">{b.real ? fmtJ(b.real) : ""}</div>
                  <div className="flex items-center justify-center">{b.kurang > 0 && <span title={`Menjadi di bawah Booked + Realisasi: kurang Rp ${angka(b.kurang)} (R-06)`} className="rounded-full bg-[#FDE7E4] px-1.5 text-[11px] font-bold text-[#8E1B10]">!</span>}</div>
                </div>
                {rinci !== null && (
                  <div className="bg-[#E5F6EC] px-3 py-1.5 text-[11.5px] text-[#0B4D2E] shadow-[inset_5px_0_0_#13794B]" style={{ paddingLeft: 56 }}>
                    {rinci.length === 0 ? "Item ini belum punya rincian RAB." : (
                      <table className="w-full max-w-[760px] text-left"><thead><tr className="text-[#0B4D2E]"><th className="py-0.5 font-semibold">Rincian RAB</th><th className="w-14 text-right font-semibold">Vol</th><th className="w-14 px-2 font-semibold">Sat</th><th className="w-24 text-right font-semibold">Harga</th><th className="w-28 text-right font-semibold">Jumlah</th></tr></thead>
                        <tbody>{rinci.map((r) => <tr key={r.baris_id} className="border-t border-[#BFE3CE]"><td className="py-0.5">{r.ket ?? ""}</td><td className="text-right font-mono">{angka(r.volume)}</td><td className="px-2">{r.satuan}</td><td className="text-right font-mono">{angka(r.harga_satuan)}</td><td className="text-right font-mono">{angka(r.jumlah)}</td></tr>)}
                          <tr className="border-t border-[#BFE3CE] font-semibold"><td colSpan={4} className="py-0.5 text-right">Jumlah RAB</td><td className="text-right font-mono">{angka(rinci.reduce((s, r) => s + n(r.jumlah), 0))}</td></tr></tbody></table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-[#44546F]">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-3.5 w-3.5 rounded-sm bg-[#FFF3C4] ring-1 ring-[#E2B84A]" />Kuning: sel yang berubah</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-3.5 w-3.5 rounded-sm bg-[#E5F6EC] ring-1 ring-[#BFE3CE]" />Hijau: baris baru</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-3.5 w-3.5 rounded-sm bg-[#F3EEFB] ring-1 ring-[#CBB8E8]" />Ungu: pasangan akun/redaksi</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-3.5 w-3.5 rounded-sm bg-[#FFFBEB] ring-1 ring-[#E2B84A]" />Dana penggenap</span>
      </div>
      {semua.length > 0 && !dipilih.every((b) => bisaUbah(b.ro_kode)) && dipilih.length > 0 && <Catatan>Sebagian baris terpilih berada pada RO yang tidak dapat Anda ubah pada jadwal ini.</Catatan>}
    </div>
  );
}
