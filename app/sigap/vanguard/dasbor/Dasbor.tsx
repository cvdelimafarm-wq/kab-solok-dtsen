"use client";

// app/sigap/vanguard/dasbor/Dasbor.tsx
//
// (1 Nov 2026) VANGUARD V3a: tampilan dasbor. Data dari GET /api/sigap/vanguard/admin (angka dihitung di lib/vanguard/dasbor.ts). Satu warna (ungu Vanguard) untuk besaran;
// angka SELALU tertulis (bukan hanya warna), tingkat kesalahan memakai kata dan ikon. Peta panas adalah tabel, jadi tampilan tabel sudah tersedia.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { DAFTAR_JENIS, LABEL_JENIS, LABEL_TINGKAT, type BarisHeat, type BarisPetugas, type BarisTersering, type Dasbor as DataDasbor } from "@/lib/vanguard/dasbor";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import type { JenisKesalahan, Tingkat } from "@/lib/vanguard/tipe";

type Daftar = { id: number; nama: string; jenis: string; menyala: boolean; percobaan: number }[];
type Muat = { kegiatan: { id: number; nama: string; jenis: string }; dasbor: DataDasbor; terpotong: boolean };

const UNGU = "#5B34C9";
const kartu = "rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const judulBagian = "text-[11px] font-extrabold tracking-[0.14em] text-[#6B7A90]";
const SINGKAT: Record<JenisKesalahan, string> = {
  konversi_seminggu: "÷ minggu", konversi_sebulan: "÷ bulan", salah_letak: "Salah letak", harus_kosong: "Harus kosong", jebakan: "Jebakan",
  kontrol_vii: "Kontrol VII", diskrepansi: "Diskrepansi", alternatif: "Salah konsep", belum_diisi: "Kosong", angka_meleset: "Meleset",
};
const durasi = (dtk: number): string => (dtk >= 60 ? `${Math.floor(dtk / 60)} mnt ${dtk % 60} dtk` : `${dtk} dtk`);
const tglPendek = (iso: string): string => iso.split("-").reverse().slice(0, 2).join("/");

function Tingkat({ t }: { t: Tingkat }) {
  const gaya = t === "fatal" ? "bg-[#FDE8E8] text-[#7A1D22]" : t === "berat" ? "bg-[#FFF2CC] text-[#6B4C00]" : "bg-[#EEF2F7] text-[#44546F]";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[11px] font-bold ${gaya}`}>{t === "fatal" ? <span aria-hidden>⚠</span> : null}{LABEL_TINGKAT[t]}</span>;
}

function Ubin({ judul, nilai, ket }: { judul: string; nilai: string; ket?: string }) {
  return (
    <div className={kartu}>
      <div className={judulBagian}>{judul}</div>
      <div className="mt-1 text-[28px] font-extrabold leading-none text-[#0F2A52]">{nilai}</div>
      {ket && <div className="mt-1 text-[12px] leading-snug text-[#55657D]">{ket}</div>}
    </div>
  );
}

function Batang({ baris, kosong }: { baris: BarisTersering[]; kosong: string }) {
  const maks = Math.max(1, ...baris.map((b) => b.jumlah));
  if (baris.length === 0) return <p className="mt-2 text-[13px] text-[#55657D]">{kosong}</p>;
  return (
    <ul className="mt-2 space-y-2.5">
      {baris.map((b) => (
        <li key={b.kunci}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 flex-1 text-[#0F2A52]">{b.label}{b.tingkat && <> <Tingkat t={b.tingkat} /></>}</span>
            <span className="flex-none font-bold tabular-nums text-[#0F2A52]">{b.jumlah}<span className="ml-1 font-normal text-[#6B7A90]">· {b.petugas} petugas</span></span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[#E9E4F8]" aria-hidden><div className="h-2 rounded-full" style={{ width: `${(b.jumlah / maks) * 100}%`, background: UNGU }} /></div>
        </li>
      ))}
    </ul>
  );
}

function PetaPanas({ heat }: { heat: BarisHeat[] }) {
  const maks = Math.max(1, ...heat.flatMap((h) => Object.values(h.per).map((x) => x ?? 0)));
  if (heat.length === 0) return <p className="mt-2 text-[13px] text-[#55657D]">Belum ada kesalahan tercatat.</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <caption className="sr-only">Jumlah kesalahan per kasus dan jenis kesalahan</caption>
        <thead>
          <tr><th scope="col" className="sticky left-0 bg-white px-2 py-1 text-left font-bold text-[#44546F]">Kasus</th>
            {DAFTAR_JENIS.map((j) => <th key={j} scope="col" className="px-1 py-1 text-center font-bold text-[#44546F]" title={LABEL_JENIS[j]}>{SINGKAT[j]}</th>)}
            <th scope="col" className="px-2 py-1 text-right font-bold text-[#44546F]">Jumlah</th></tr>
        </thead>
        <tbody>
          {heat.map((h) => (
            <tr key={h.kasus} className="border-t border-[#EEF2F7]">
              <th scope="row" className="sticky left-0 bg-white px-2 py-1 text-left font-semibold text-[#0F2A52]"><span className="font-mono">{h.kasus}</span> <span className="font-normal text-[#55657D]">{h.judul}</span></th>
              {DAFTAR_JENIS.map((j) => {
                const n = h.per[j] ?? 0;
                const a = n === 0 ? 0 : 0.15 + 0.85 * (n / maks);
                return <td key={j} className="px-1 py-1 text-center tabular-nums" style={{ background: n ? `rgba(91,52,201,${a.toFixed(2)})` : undefined, color: a > 0.5 ? "#fff" : "#0F2A52", fontWeight: n ? 700 : 400 }}>{n || "–"}</td>;
              })}
              <td className="px-2 py-1 text-right font-bold tabular-nums text-[#0F2A52]">{h.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Urut = "nama" | "fatal" | "percobaan" | "benar";
function TabelPetugas({ petugas }: { petugas: BarisPetugas[] }) {
  const [urut, setUrut] = useState<Urut>("nama");
  const baris = useMemo(() => {
    const a = [...petugas];
    if (urut === "fatal") a.sort((x, y) => y.fatal - x.fatal || x.nama.localeCompare(y.nama, "id"));
    else if (urut === "percobaan") a.sort((x, y) => y.percobaan - x.percobaan || x.nama.localeCompare(y.nama, "id"));
    else if (urut === "benar") a.sort((x, y) => y.kasusBenar - x.kasusBenar || x.nama.localeCompare(y.nama, "id"));
    return a;
  }, [petugas, urut]);
  return (
    <>
      <label className="mt-2 flex items-center gap-2 text-[12.5px] text-[#44546F]">Urutkan
        <select value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className="min-h-[40px] rounded-[10px] border border-[#CBD6E6] bg-white px-2 text-[13px] text-[#0F2A52]">
          <option value="nama">Nama</option><option value="fatal">Kesalahan fatal terbanyak</option><option value="percobaan">Percobaan terbanyak</option><option value="benar">Kasus benar terbanyak</option>
        </select>
      </label>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <caption className="sr-only">Ringkasan per petugas</caption>
          <thead><tr className="text-left text-[#44546F]">
            {["Nama", "Percobaan", "Kasus benar / dikerjakan", "Benar di percobaan pertama", "Kelemahan utama", "Fatal"].map((h) => <th key={h} scope="col" className="px-2 py-1 font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {baris.map((p) => (
              <tr key={p.akun_id} className="border-t border-[#EEF2F7] align-top">
                <th scope="row" className="px-2 py-1.5 text-left font-semibold text-[#0F2A52]">{p.nama}{p.peran && <span className="ml-1 font-normal uppercase text-[#6B7A90]">{p.peran}</span>}</th>
                <td className="px-2 py-1.5 tabular-nums">{p.percobaan}</td>
                <td className="px-2 py-1.5 tabular-nums">{p.kasusBenar} / {p.kasusDikerjakan}</td>
                <td className="px-2 py-1.5 tabular-nums">{p.kasusDikerjakan ? `${p.persenBenarPertama}%` : "–"}</td>
                <td className="px-2 py-1.5">{p.kelemahan ? <>{LABEL_JENIS[p.kelemahan.jenis]} <span className="text-[#6B7A90]">({p.kelemahan.jumlah}×)</span></> : <span className="text-[#6B7A90]">{p.percobaan ? "tidak ada" : "belum mencoba"}</span>}</td>
                <td className="px-2 py-1.5 font-bold tabular-nums">{p.fatal > 0 ? <span className="text-[#7A1D22]">⚠ {p.fatal}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Dasbor() {
  const q = useSearchParams();
  const idPilih = useMemo(() => { const v = q.get("kegiatan"); return v && /^\d{1,9}$/.test(v) ? Number(v) : null; }, [q]);
  const kembali = useMemo(() => tujuanAman(q.get("dari")), [q]);
  const [daftar, setDaftar] = useState<Daftar | null>(null);
  const [d, setD] = useState<Muat | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [unduhGalat, setUnduhGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    let batal = false;
    setMemuat(true); setGalat(null);
    (async () => {
      try {
        if (idPilih === null) { const r = await apiPortal<{ daftar: Daftar }>("/api/sigap/vanguard/admin"); if (!batal) { setDaftar(r.daftar); setD(null); } }
        else { const r = await apiPortal<Muat>(`/api/sigap/vanguard/admin?kegiatan=${idPilih}`); if (!batal) setD(r); }
      } catch (e) {
        if (batal || (e instanceof Error && e.message === "SESI_BERAKHIR")) return;
        setGalat(e instanceof Error ? e.message : "Gagal memuat dasbor.");
      } finally { if (!batal) setMemuat(false); }
    })();
    return () => { batal = true; };
  }, [idPilih]);

  const unduh = useCallback(async (bagian: "skor" | "kesalahan") => {
    if (idPilih === null) return;
    setUnduhGalat(null);
    try {
      const s = bacaSesi();
      const res = await fetch(`/api/sigap/vanguard/admin?kegiatan=${idPilih}&format=csv&bagian=${bagian}`, { headers: s ? { Authorization: `Bearer ${s}` } : {} });
      if (!res.ok) throw new Error("Gagal mengunduh.");
      const blob = await res.blob();
      const nama = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `vanguard_${bagian}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setUnduhGalat(e instanceof Error ? e.message : "Gagal mengunduh."); }
  }, [idPilih]);

  const x = d?.dasbor;
  return (
    <main className="min-h-screen bg-[#EEF2F8] pb-10">
      <header className="bg-gradient-to-br from-[#2A1763] to-[#5B34C9] px-4 pb-14 pt-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href={idPilih === null ? kembali : `/sigap/vanguard/dasbor${kembali !== "/" ? `?dari=${encodeURIComponent(kembali)}` : ""}`} className="inline-flex min-h-[44px] items-center rounded-full bg-white/15 px-4 text-[13px] font-bold">{idPilih === null ? "← Kembali" : "← Semua kegiatan"}</Link>
          <div className="min-w-0 flex-1"><div className="text-[10.5px] font-extrabold tracking-[0.14em] text-[#D9CFF8]">VANGUARD · BPS KABUPATEN SOLOK</div><h1 className="text-[20px] font-extrabold leading-tight">Dasbor kesalahan pengisian</h1></div>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-9 max-w-3xl space-y-4 px-3.5">
        {galat && <div role="alert" className="rounded-[14px] border border-[#F2B8B5] bg-[#FDE8E8] p-3 text-[13.5px] text-[#7A1D22]">{galat}</div>}
        {memuat && !galat && <div className={kartu} aria-busy="true"><div className="h-3 w-40 animate-pulse rounded bg-[#E6EDF8]" /></div>}

        {!memuat && !galat && idPilih === null && daftar && (
          <section className={kartu} aria-label="Pilih kegiatan">
            <div className={judulBagian}>PILIH KEGIATAN</div>
            {daftar.length === 0 ? <p className="mt-2 text-[13px] text-[#55657D]">Belum ada kegiatan yang menyalakan Vanguard atau yang punya percobaan, atau Anda belum punya izin melihatnya.</p> : (
              <ul className="mt-2 space-y-2">
                {daftar.map((k) => (
                  <li key={k.id}><Link href={`/sigap/vanguard/dasbor?kegiatan=${k.id}${kembali !== "/" ? `&dari=${encodeURIComponent(kembali)}` : ""}`} className="flex min-h-[52px] items-center gap-3 rounded-[14px] border border-[#DCE3EE] px-3 py-2">
                    <span className="min-w-0 flex-1"><b className="block text-[14.5px] text-[#0F2A52]">{k.nama}</b><span className="text-[12px] text-[#55657D]">{k.jenis} · {k.percobaan} percobaan · Vanguard {k.menyala ? "menyala" : "tidak menyala"}</span></span>
                    <span aria-hidden className="text-[20px] text-[#A5B3C7]">›</span></Link></li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!memuat && !galat && d && x && (
          <>
            <section className={kartu}>
              <div className={judulBagian}>KEGIATAN</div>
              <b className="block text-[17px] text-[#0F2A52]">{d.kegiatan.nama}</b>
              {d.terpotong && <p role="status" className="mt-2 rounded-[10px] bg-[#FFF2CC] px-3 py-2 text-[12.5px] text-[#6B4C00]">Data melebihi 50.000 baris; angka di bawah dihitung dari 50.000 baris pertama.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => unduh("skor")} className="min-h-[44px] rounded-[12px] bg-[#5B34C9] px-4 text-[13px] font-extrabold text-white">Unduh skor per petugas (CSV)</button>
                <button type="button" onClick={() => unduh("kesalahan")} className="min-h-[44px] rounded-[12px] border border-[#5B34C9] bg-white px-4 text-[13px] font-extrabold text-[#5B34C9]">Unduh rincian kesalahan (CSV)</button>
              </div>
              {unduhGalat && <p role="alert" className="mt-2 text-[12.5px] text-[#7A1D22]">{unduhGalat}</p>}
            </section>

            <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Ubin judul="PETUGAS MENCOBA" nilai={`${x.ringkasan.mencoba} / ${x.ringkasan.peserta}`} ket={`${x.ringkasan.persenMencoba}% dari peserta`} />
              <Ubin judul="PERCOBAAN" nilai={String(x.ringkasan.percobaan)} ket={`${x.ringkasan.rataPercobaanPerKasus} per kasus per petugas`} />
              <Ubin judul="BENAR TANPA PETUNJUK" nilai={`${x.ringkasan.persenBenarTanpaPetunjuk}%`} ket="dari kasus yang akhirnya benar" />
              <Ubin judul="RATA-RATA BINTANG" nilai={`${x.ringkasan.rataBintang} / 3`} ket="kasus yang benar" />
              <Ubin judul="WAKTU MEDIAN" nilai={durasi(x.ringkasan.medianDurasiDtk)} ket="per percobaan" />
              <Ubin judul="KESALAHAN FATAL" nilai={String(x.ringkasan.kesalahanFatal)} ket={`dari ${x.ringkasan.kesalahanTotal} kesalahan tercatat`} />
            </section>

            <section className={kartu} aria-label="Kesalahan paling sering">
              <div className={judulBagian}>JENIS KESALAHAN PALING SERING</div>
              <Batang baris={x.jenis} kosong="Belum ada kesalahan tercatat." />
              <div className={`${judulBagian} mt-5`}>HANYA YANG FATAL</div>
              <Batang baris={x.jenisFatal} kosong="Tidak ada kesalahan fatal." />
            </section>

            <section className={kartu} aria-label="Kotak dan kasus tersulit">
              <div className={judulBagian}>10 KOTAK PALING SERING SALAH</div>
              <Batang baris={x.sel} kosong="Belum ada data." />
              <div className={`${judulBagian} mt-5`}>10 KASUS DENGAN PERCOBAAN SALAH TERBANYAK</div>
              <Batang baris={x.kasus} kosong="Belum ada data." />
            </section>

            <section className={kartu} aria-label="Peta panas"><div className={judulBagian}>PETA PANAS · KASUS × JENIS KESALAHAN (20 TERATAS)</div><PetaPanas heat={x.heat} /></section>

            <section className={kartu} aria-label="Perkembangan">
              <div className={judulBagian}>PERKEMBANGAN KEMAMPUAN</div>
              <dl className="mt-2 grid grid-cols-3 gap-3 text-center">
                <div><dd className="text-[22px] font-extrabold text-[#0F2A52]">{x.perkembangan.persenBenarPercobaanPertama}%</dd><dt className="text-[11.5px] text-[#55657D]">benar di percobaan pertama</dt></div>
                <div><dd className="text-[22px] font-extrabold text-[#0F2A52]">{x.perkembangan.persenAkhirnyaBenar}%</dd><dt className="text-[11.5px] text-[#55657D]">akhirnya benar</dt></div>
                <div><dd className="text-[22px] font-extrabold text-[#0F2A52]">{x.perkembangan.rataPercobaanSampaiBenar}</dd><dt className="text-[11.5px] text-[#55657D]">percobaan sampai benar</dt></div>
              </dl>
              <p className="mt-1 text-center text-[11.5px] text-[#6B7A90]">dari {x.perkembangan.pasangan} pasangan petugas × kasus</p>
              {x.perHari.length > 0 && (
                <>
                  <div className={`${judulBagian} mt-4`}>PERCOBAAN PER HARI (30 HARI TERAKHIR)</div>
                  <ul className="mt-2 space-y-1.5">
                    {x.perHari.map((h) => { const maks = Math.max(1, ...x.perHari.map((y) => y.percobaan)); return (
                      <li key={h.tgl} className="flex items-center gap-2 text-[12.5px]"><span className="w-12 flex-none tabular-nums text-[#44546F]">{tglPendek(h.tgl)}</span>
                        <span className="h-2 flex-1 rounded-full bg-[#E9E4F8]" aria-hidden><span className="block h-2 rounded-full" style={{ width: `${(h.percobaan / maks) * 100}%`, background: UNGU }} /></span>
                        <span className="w-28 flex-none text-right tabular-nums text-[#0F2A52]">{h.percobaan} <span className="text-[#6B7A90]">({h.benar} benar)</span></span></li>); })}
                  </ul>
                </>
              )}
            </section>

            <section className={kartu} aria-label="Per petugas"><div className={judulBagian}>PER PETUGAS</div><TabelPetugas petugas={x.petugas} /></section>
          </>
        )}
      </div>
    </main>
  );
}
