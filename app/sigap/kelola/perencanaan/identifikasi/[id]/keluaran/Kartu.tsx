"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/keluaran/Kartu.tsx
//
// (28 Okt 2026) Tampilan tiga keluaran RAB per survei: kebutuhan dana (Bendahara), rencana pembayaran (PPK dan TU), permintaan pengadaan (PBJ), dan panel tanda terima.
// Semuanya penyajian dari IsiKeluaran (lib/keu/keluaran.ts), baik pratinjau dari RAB sekarang maupun paket tersimpan.

import { useState } from "react";
import { Chip } from "@/app/sigap/keu-ui";
import { judulKartu, kartu, kolom, label, tombol } from "@/app/sigap/keu-ui";
import {
  KOLOM_SPEK, LABEL_BAGIAN, MAKS_BARANG, bersihkanSpek, type BagianKeluaran, type BarangSpek, type BarisTanda, type ButirKeluaran, type Dana, type Bayar, type Spek,
} from "@/lib/keu/keluaran";
import { NAMA_BULAN } from "@/lib/keu/rab";
import { rupiah } from "@/lib/keu/ro";

const tgl = (t: string | null): string => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : "-");
const bulanTeks = (b: number): string => NAMA_BULAN[b - 1] ?? `Bulan ${b}`;
const bulanYm = (ym: string): string => `${NAMA_BULAN[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)} ${ym.slice(0, 4)}`;
const teksAngka = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

// ------------------------------------------------------------ 1. dana
export function TampilDana({ dana }: { dana: Dana }) {
  return (
    <div className="space-y-3 text-[13px] text-[#1B2B4B]">
      <p className="text-[14px] font-bold text-[#0F2A52]">Total kebutuhan {rupiah(dana.total)}</p>
      {dana.bulan.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left text-[12.5px]">
            <caption className="pb-1 text-left text-[12px] font-semibold text-[#5B6B84]">Per bulan dan minggu cair</caption>
            <tbody>
              {dana.bulan.map((b) => (
                <tr key={b.bulan} className="border-t border-[#E3E9F2] align-top">
                  <td className="py-1.5 pr-3 font-semibold">{bulanTeks(b.bulan)}</td>
                  <td className="py-1.5 pr-3 text-[#5B6B84]">{b.minggu.map((m) => `minggu ${m.minggu}: ${rupiah(m.total)}`).join("; ")}</td>
                  <td className="py-1.5 text-right font-semibold">{rupiah(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-1.5">
        {dana.akun.map((a) => (
          <details key={a.akun} className="rounded-lg border border-[#DCE3EE] bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 font-semibold">
              <span className="min-w-0 break-words">Akun {a.akun}{a.nama ? ` · ${a.nama}` : ""}</span>
              <span>{rupiah(a.total)}</span>
            </summary>
            <div className="space-y-1.5 border-t border-[#E3E9F2] px-3 py-2">
              {a.item.map((i) => (
                <details key={i.itemId} className="rounded-md bg-[#F5F8FE]">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 break-words">{i.uraian || "(item tanpa nama)"}</span>
                    <span className="font-semibold">{rupiah(i.total)}</span>
                  </summary>
                  <ul className="space-y-1 px-2.5 pb-2 text-[12.5px] text-[#44546F]">
                    {i.rincian.map((r, n) => (
                      <li key={n} className="flex flex-wrap justify-between gap-x-3">
                        <span className="min-w-0 break-words">{r.ket} · {teksAngka(r.volume)} {r.satuan} × {rupiah(r.harga)} · cair {bulanTeks(r.bulan)} minggu {r.minggu}</span>
                        <span className="font-semibold">{rupiah(r.jumlah)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 2. bayar
export function TampilBayar({ bayar }: { bayar: Bayar }) {
  return (
    <div className="space-y-3 text-[13px] text-[#1B2B4B]">
      <p className="text-[12.5px] text-[#5B6B84]">
        Tenggat dihitung dari hari terakhir kegiatan: SPJ {bayar.hariSpj} hari kerja, pembayaran {bayar.hariBayar === null ? "tanpa batas menurut lembar kebijakan" : `${bayar.hariBayar} hari kerja`} (cek aturan; tenggat resmi ditetapkan PPK).
      </p>
      {bayar.perBulan.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {bayar.perBulan.map((b) => <li key={b.bulan} className="rounded-lg bg-[#EAF1FC] px-3 py-1.5 text-[12.5px]"><span className="font-semibold">{bulanYm(b.bulan)}</span>: {rupiah(b.total)} ({b.n} rincian)</li>)}
        </ul>
      )}
      {bayar.tanpaTanggal > 0 && (
        <p role="status" className="rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
          {bayar.tanpaTanggal} rincian ({rupiah(bayar.totalTanpaTanggal)}) belum punya tanggal kegiatan, jadi tenggatnya belum dapat dihitung. Lengkapi tanggal pada identifikasi lanjutan.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="text-[11.5px] uppercase tracking-wide text-[#6B7A93]">
              <th className="py-1 pr-2 font-semibold">Rincian</th><th className="py-1 pr-2 font-semibold">Kegiatan selesai</th><th className="py-1 pr-2 font-semibold">Tenggat SPJ</th>
              <th className="py-1 pr-2 font-semibold">Tenggat bayar</th><th className="py-1 text-right font-semibold">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {bayar.rincian.map((r, n) => (
              <tr key={n} className="border-t border-[#E3E9F2] align-top">
                <td className="py-1.5 pr-2"><span className="break-words">{r.ket}</span> <span className="text-[#6B7A93]">· akun {r.akun}</span></td>
                <td className="py-1.5 pr-2">{tgl(r.selesai)}</td><td className="py-1.5 pr-2">{tgl(r.tenggatSpj)}</td><td className="py-1.5 pr-2 font-semibold">{tgl(r.tenggatBayar)}</td>
                <td className="py-1.5 text-right font-semibold">{rupiah(r.jumlah)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 3. pengadaan
function FormSpek({ b, sibuk, onSimpan }: { b: ButirKeluaran; sibuk: boolean; onSimpan: (butir: ButirKeluaran, spek: Spek) => void }) {
  const [isi, setIsi] = useState<Record<string, string>>(b.spek.isi);
  const [barang, setBarang] = useState<BarangSpek[]>(b.spek.barang);
  const [catatan, setCatatan] = useState(b.spek.catatan);
  const id = (s: string) => `spek-${b.id}-${s}`.replace(/[^\w-]/g, "_");
  const ubahBarang = (i: number, p: Partial<BarangSpek>) => setBarang((a) => a.map((x, n) => (n === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-2.5 rounded-lg border border-[#DCE3EE] bg-white p-3">
      <p className={label}>Spesifikasi untuk PBJ</p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))]">
        {KOLOM_SPEK[b.jenis].map((k) => (
          <div key={k.kunci} className={k.tipe === "panjang" ? "col-span-full" : ""}>
            <label className={label} htmlFor={id(k.kunci)}>{k.label}{k.wajib ? " *" : ""}</label>
            {k.tipe === "pilih" ? (
              <select id={id(k.kunci)} className={kolom} value={isi[k.kunci] ?? ""} onChange={(e) => setIsi((a) => ({ ...a, [k.kunci]: e.target.value }))}>
                <option value="">Pilih…</option>
                {(k.pilihan ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : k.tipe === "panjang" ? (
              <textarea id={id(k.kunci)} className={`${kolom} min-h-[64px]`} maxLength={800} value={isi[k.kunci] ?? ""} onChange={(e) => setIsi((a) => ({ ...a, [k.kunci]: e.target.value }))} />
            ) : (
              <input id={id(k.kunci)} className={kolom} inputMode={k.tipe === "angka" ? "decimal" : undefined} maxLength={300} value={isi[k.kunci] ?? ""}
                onChange={(e) => setIsi((a) => ({ ...a, [k.kunci]: k.tipe === "angka" ? e.target.value.replace(/[^\d.,]/g, "") : e.target.value }))} />
            )}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className={label}>Rincian barang{b.jenis === "Perlengkapan" ? " *" : " (opsional)"}</p>
        {barang.map((x, i) => (
          <div key={i} className="grid gap-2 rounded-md bg-[#F5F8FE] p-2 [grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr))]">
            <input aria-label={`Nama barang ${i + 1}`} placeholder="Nama barang" className={`${kolom} col-span-2`} maxLength={120} value={x.nama} onChange={(e) => ubahBarang(i, { nama: e.target.value })} />
            <input aria-label={`Jumlah barang ${i + 1}`} placeholder="Jumlah" className={kolom} inputMode="decimal" maxLength={20} value={x.jumlah} onChange={(e) => ubahBarang(i, { jumlah: e.target.value.replace(/[^\d.,]/g, "") })} />
            <input aria-label={`Satuan barang ${i + 1}`} placeholder="Satuan" className={kolom} maxLength={20} value={x.satuan} onChange={(e) => ubahBarang(i, { satuan: e.target.value })} />
            <input aria-label={`Spesifikasi barang ${i + 1}`} placeholder="Spesifikasi (merek, ukuran, warna, …)" className={`${kolom} col-span-full`} maxLength={800} value={x.spesifikasi} onChange={(e) => ubahBarang(i, { spesifikasi: e.target.value })} />
            <button type="button" className={`${tombol} bg-white text-[#9B1C23] ring-1 ring-[#E3B6BA]`} onClick={() => setBarang((a) => a.filter((_, n) => n !== i))}>Hapus baris</button>
          </div>
        ))}
        {barang.length < MAKS_BARANG && (
          <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => setBarang((a) => [...a, { nama: "", jumlah: "", satuan: "", spesifikasi: "" }])}>Tambah barang</button>
        )}
      </div>
      <div>
        <label className={label} htmlFor={id("cat")}>Catatan untuk PBJ</label>
        <textarea id={id("cat")} className={`${kolom} min-h-[56px]`} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </div>
      <p className="text-[12px] text-[#6B7A93]">Lampiran PDF atau Excel belum tersedia; sebutkan nama berkas lampiran pada catatan dan serahkan lewat PBJ.</p>
      <button type="button" disabled={sibuk} className={`${tombol} bg-[#1F5FD1] text-white`} onClick={() => onSimpan(b, bersihkanSpek(b.jenis, { isi, barang, catatan }))}>{sibuk ? "Menyimpan…" : "Simpan spesifikasi"}</button>
    </div>
  );
}

function RingkasSpek({ b }: { b: ButirKeluaran }) {
  const kol = KOLOM_SPEK[b.jenis].filter((k) => b.spek.isi[k.kunci]);
  if (kol.length === 0 && b.spek.barang.length === 0 && !b.spek.catatan) return <p className="text-[12.5px] text-[#6B7A93]">Spesifikasi belum diisi.</p>;
  return (
    <div className="space-y-1.5 text-[12.5px] text-[#44546F]">
      {kol.length > 0 && <ul className="grid gap-x-4 gap-y-0.5 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">{kol.map((k) => <li key={k.kunci}><span className="text-[#6B7A93]">{k.label}:</span> {b.spek.isi[k.kunci]}</li>)}</ul>}
      {b.spek.barang.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">{b.spek.barang.map((x, i) => <li key={i}>{x.nama}{x.jumlah ? ` · ${x.jumlah} ${x.satuan}` : ""}{x.spesifikasi ? ` · ${x.spesifikasi}` : ""}</li>)}</ul>
      )}
      {b.spek.catatan && <p><span className="text-[#6B7A93]">Catatan:</span> {b.spek.catatan}</p>}
    </div>
  );
}

export function TampilPengadaan({ butir, bisaSunting, sibuk, onSimpanSpek, onCetak }: {
  butir: ButirKeluaran[]; bisaSunting: boolean; sibuk: boolean; onSimpanSpek?: (butir: ButirKeluaran, spek: Spek) => void; onCetak: (butir: ButirKeluaran) => void;
}) {
  const [buka, setBuka] = useState<string | null>(null);
  if (butir.length === 0) return <p className="text-[13px] text-[#6B7A93]">Identifikasi ini tidak memuat barang atau jasa yang perlu diadakan.</p>;
  return (
    <ul className="space-y-2.5 text-[13px] text-[#1B2B4B]">
      {butir.map((b) => (
        <li key={b.id} className="space-y-2 rounded-lg bg-[#F5F8FE] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-words text-[13px] font-bold leading-snug text-[#0F2A52]">{b.uraian}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip warna="biru">{b.jenis}</Chip>
              <Chip warna="abu">Akun {b.akun}</Chip>
              {b.perkiraan && <Chip warna="kuning">Perkiraan</Chip>}
              {b.kurangSpek.length > 0 && <Chip warna="kuning">Spesifikasi kurang</Chip>}
            </div>
          </div>
          <p className="text-[12.5px] text-[#44546F]">
            {b.nilaiRab !== null ? <>Nilai menurut RAB <span className="font-semibold text-[#0F2A52]">{rupiah(b.nilaiRab)}</span> ({teksAngka(b.volumeRab ?? 0)} {b.satuan}).</> : b.digabung ? "Rincian RAB butir ini digabung dengan butir lain; nilai tidak dibagi." : "Belum ada rincian RAB yang cocok dengan butir ini."}
            {b.butuhMulai ? ` Dibutuhkan ${tgl(b.butuhMulai)}${b.butuhSelesai && b.butuhSelesai !== b.butuhMulai ? ` s.d. ${tgl(b.butuhSelesai)}` : ""}.` : ""}
            {b.tempat ? ` Tempat: ${b.tempat}.` : ""}{b.paket ? ` Paket: ${b.paket}.` : ""}
          </p>
          {b.perlu.length > 0 && <p className="text-[12px] text-[#7A5A00]">Masih perlu: {b.perlu.join("; ")}.</p>}
          {bisaSunting && buka === b.id && onSimpanSpek ? (
            <FormSpek b={b} sibuk={sibuk} onSimpan={(x, s) => { onSimpanSpek(x, s); setBuka(null); }} />
          ) : (
            <RingkasSpek b={b} />
          )}
          {b.kurangSpek.length > 0 && <p className="text-[12px] text-[#7A5A00]">Belum lengkap: {b.kurangSpek.join("; ")}.</p>}
          <div className="flex flex-wrap gap-2">
            {bisaSunting && buka !== b.id && <button type="button" className={`${tombol} bg-[#1F5FD1] text-white`} onClick={() => setBuka(b.id)}>Isi spesifikasi</button>}
            {bisaSunting && buka === b.id && <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => setBuka(null)}>Tutup formulir</button>}
            <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => onCetak(b)}>Cetak permintaan (PDF)</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ tanda terima
export function PanelTanda({ bagian, tanda, bisa, sibuk, onTandai }: {
  bagian: BagianKeluaran; tanda: BarisTanda | undefined; bisa: boolean; sibuk: boolean; onTandai: (bagian: BagianKeluaran, status: "diterima" | "ditanyakan", catatan: string) => void;
}) {
  const [tanya, setTanya] = useState(false);
  const [teks, setTeks] = useState("");
  const L = LABEL_BAGIAN[bagian];
  return (
    <div className="space-y-2 rounded-lg border border-[#DCE3EE] bg-white p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#0F2A52]">Untuk {L.penerima}:</span>
        {!tanda ? <Chip warna="abu">Belum ditanggapi</Chip> : tanda.status === "diterima" ? <Chip warna="hijau">Diterima{tanda.oleh_nama ? ` oleh ${tanda.oleh_nama}` : ""}</Chip> : <Chip warna="kuning">Ditanyakan{tanda.oleh_nama ? ` oleh ${tanda.oleh_nama}` : ""}</Chip>}
      </div>
      {tanda?.status === "ditanyakan" && tanda.catatan && <p className="rounded-md bg-[#FFF8E6] px-2.5 py-1.5 text-[12.5px] text-[#5C4300]">{tanda.catatan}</p>}
      {bisa && (
        <div className="space-y-2">
          {tanya ? (
            <>
              <label className={label} htmlFor={`tanda-${bagian}`}>Pertanyaan atau hal yang perlu diperbaiki</label>
              <textarea id={`tanda-${bagian}`} className={`${kolom} min-h-[64px]`} maxLength={300} value={teks} onChange={(e) => setTeks(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={sibuk || teks.trim().length < 5} className={`${tombol} bg-[#C98A00] text-white`} onClick={() => { onTandai(bagian, "ditanyakan", teks.trim()); setTanya(false); setTeks(""); }}>Kirim pertanyaan</button>
                <button type="button" className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => setTanya(false)}>Batal</button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={sibuk || tanda?.status === "diterima"} className={`${tombol} bg-[#0F2A52] text-white`} onClick={() => onTandai(bagian, "diterima", "")}>Tandai diterima</button>
              <button type="button" disabled={sibuk} className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => setTanya(true)}>Ajukan pertanyaan</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function KartuBagian({ judul, penerima, children }: { judul: string; penerima: string; children: React.ReactNode }) {
  return (
    <section className={`${kartu} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={judulKartu}>{judul}</h2>
        <span className="text-[12px] font-semibold text-[#6B7A93]">untuk {penerima}</span>
      </div>
      {children}
    </section>
  );
}
