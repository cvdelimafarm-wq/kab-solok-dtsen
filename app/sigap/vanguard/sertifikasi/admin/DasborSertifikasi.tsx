"use client";

// app/sigap/vanguard/sertifikasi/admin/DasborSertifikasi.tsx
//
// (1 Nov 2026) VANGUARD V7i: tampilan dasbor Sertifikasi. Data dari GET /api/sigap/vanguard/sertifikasi/admin (angka dihitung di lib/vanguard/sertifikasi/dasbor.ts). Hanya baca.
// Satu warna (ungu Vanguard); angka selalu tertulis (bukan hanya warna). Sertifikat adalah kepemilikan petugas dan belum berdampak ke penilaian atau penugasan.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import { LABEL_JENIS } from "@/lib/vanguard/dasbor";
import type { DasborSertifikasi } from "@/lib/vanguard/sertifikasi/dasbor";
import { NAMA_TINGKAT } from "@/lib/vanguard/sertifikasi/skor";
import type { JenisKesalahan } from "@/lib/vanguard/tipe";

const UNGU = "#5B34C9";
const kartu = "rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const judulBagian = "text-[11px] font-extrabold tracking-[0.14em] text-[#6B7A90]";
const LABEL_JENIS_K: Record<string, string> = { salah_rincian: "Rincian salah", salah_sumber: "Kolom pembelian/pemberian tertukar", banyaknya_meleset: "Banyaknya meleset", nama_lainnya: "Nama/satuan 'lainnya'", salah_art: "Anggota (ART) salah", kode_sumber: "Kode sumber perolehan" };
const labelJenis = (j: string) => LABEL_JENIS_K[j] ?? LABEL_JENIS[j as JenisKesalahan] ?? j;
type UsulanAdmin = { id: number; nama: string; judul: string; cerita: string; jawaban: string | null; blok: string | null; status: string; catatan_admin: string | null; dibuat_at: string; ditinjau_at: string | null };
const LABEL_STATUS: Record<string, string> = { baru: "Menunggu tinjauan", diterima: "Diterima", ditolak: "Belum dapat dipakai", dikerjakan: "Sedang dijadikan soal" };
const LABEL_SEGAR: Record<string, string> = { segar: "Segar", segera: "Segera disegarkan", perlu: "Perlu disegarkan" };
const tgl = (iso: string) => (iso ? new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }) : "–");

export default function DasborSertifikasiHalaman() {
  const q = useSearchParams();
  const tujuan = useMemo(() => { const d = q.get("dari"); return d ? tujuanAman(d) : "/sigap/vanguard"; }, [q]);
  const [data, setData] = useState<{ dasbor: DasborSertifikasi; terpotong: boolean } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [unduhGalat, setUnduhGalat] = useState<string | null>(null);
  const [usulan, setUsulan] = useState<UsulanAdmin[] | null>(null);
  const [usulGalat, setUsulGalat] = useState<string | null>(null);
  const [catatan, setCatatan] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    apiPortal<{ dasbor: DasborSertifikasi; terpotong: boolean }>("/api/sigap/vanguard/sertifikasi/admin").then(setData).catch((e) => { if (e instanceof Error && e.message === "SESI_BERAKHIR") return; setGalat(e instanceof Error ? e.message : "Gagal memuat."); });
  }, []);

  const muatUsulan = useCallback(async () => {
    try { const r = await apiPortal<{ usulan: UsulanAdmin[] }>("/api/sigap/vanguard/usulan?semua=1"); setUsulan(r.usulan); setUsulGalat(null); } catch (e) { if (e instanceof Error && e.message === "SESI_BERAKHIR") return; setUsulGalat(e instanceof Error ? e.message : "Gagal memuat usulan."); }
  }, []);
  useEffect(() => { void muatUsulan(); }, [muatUsulan]);
  const tinjau = async (id: number, status: "diterima" | "ditolak" | "dikerjakan") => {
    setUsulGalat(null);
    try { await apiPortal("/api/sigap/vanguard/usulan", { method: "PATCH", body: JSON.stringify({ id, status, catatan: catatan[id] ?? "" }) }); await muatUsulan(); }
    catch (e) { if (e instanceof Error && e.message === "SESI_BERAKHIR") return; setUsulGalat(e instanceof Error ? e.message : "Gagal menyimpan tinjauan."); }
  };
  const unduh = useCallback(async () => {
    setUnduhGalat(null);
    try {
      const s = bacaSesi();
      const res = await fetch("/api/sigap/vanguard/sertifikasi/admin?format=csv", { headers: s ? { Authorization: `Bearer ${s}` } : {} });
      if (!res.ok) throw new Error("Gagal mengunduh.");
      const blob = await res.blob();
      const nama = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "vanguard_sertifikasi.csv";
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    } catch (e) { setUnduhGalat(e instanceof Error ? e.message : "Gagal mengunduh."); }
  }, []);

  const d = data?.dasbor;
  const maks = d ? Math.max(1, ...Object.values(d.ringkasan.sebaran)) : 1;

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-16 pt-5 text-[#0F2A52]">
      <div className="flex items-center justify-between gap-3">
        <div><div className={judulBagian}>VANGUARD · BPS KABUPATEN SOLOK</div><h1 className="text-[22px] font-extrabold">Dasbor Sertifikasi</h1></div>
        <Link href={tujuan} className="inline-flex min-h-[44px] items-center rounded-full bg-[#EDE8FB] px-4 text-[13px] font-bold" style={{ color: UNGU }}>Kembali</Link>
      </div>
      {galat && <p role="alert" className="mt-4 rounded-[12px] bg-[#FDE8E8] p-3 text-[13px] text-[#7A1D22]">{galat}</p>}
      {!d && !galat && <p className="mt-6 text-[14px] text-[#55657D]">Memuat…</p>}
      {d && (
        <>
          <p className="mt-2 text-[13px] text-[#55657D]">Sertifikat adalah kepemilikan kemampuan petugas dan belum berdampak ke penilaian atau penugasan apa pun.{data?.terpotong ? " Data dipotong pada batas baris; angka dapat kurang." : ""}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className={kartu}><div className={judulBagian}>BERSERTIFIKAT</div><div className="mt-1 text-[28px] font-extrabold leading-none">{d.ringkasan.petugasBersertifikat}</div><div className="mt-1 text-[12px] text-[#55657D]">dari {d.ringkasan.petugasAktif} petugas yang pernah mencoba</div></div>
            <div className={kartu}><div className={judulBagian}>RATA-RATA SKOR</div><div className="mt-1 text-[28px] font-extrabold leading-none">{d.ringkasan.rataSkor ?? "–"}</div><div className="mt-1 text-[12px] text-[#55657D]">{d.ringkasan.ujianSertifikasiSelesai} sertifikasi selesai</div></div>
            <div className={kartu}><div className={judulBagian}>PEMBINAAN SELESAI</div><div className="mt-1 text-[28px] font-extrabold leading-none">{d.ringkasan.latihanSelesai + d.ringkasan.harianSelesai + d.ringkasan.tantanganSelesai}</div><div className="mt-1 text-[12px] text-[#55657D]">{d.ringkasan.harianSelesai} harian · {d.ringkasan.tantanganSelesai} tantangan · {d.ringkasan.latihanSelesai} latihan</div></div>
            <div className={kartu}><div className={judulBagian}>PERLU DISEGARKAN</div><div className="mt-1 text-[28px] font-extrabold leading-none">{d.ringkasan.perluDisegarkan}</div><div className="mt-1 text-[12px] text-[#55657D]">sertifikat lebih dari 90 hari</div></div>
            <div className={kartu}><button type="button" onClick={() => void unduh()} className="min-h-[44px] w-full rounded-[12px] px-3 text-[13px] font-extrabold text-white" style={{ background: UNGU }}>Unduh daftar (CSV)</button>{unduhGalat && <div role="alert" className="mt-1 text-[12px] text-[#7A1D22]">{unduhGalat}</div>}</div>
          </div>

          <section className={`${kartu} mt-4`} aria-label="Sebaran tingkat">
            <div className={judulBagian}>SEBARAN TINGKAT (TERTINGGI PER PETUGAS)</div>
            <ul className="mt-2 space-y-2.5">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]"><span>{"★".repeat(n)} <b>{NAMA_TINGKAT[n]}</b></span><span className="font-bold tabular-nums">{d.ringkasan.sebaran[n]} petugas</span></div>
                  <div className="mt-1 h-2 rounded-full bg-[#E9E4F8]" aria-hidden><div className="h-2 rounded-full" style={{ width: `${(d.ringkasan.sebaran[n] / maks) * 100}%`, background: UNGU }} /></div>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${kartu} mt-4`} aria-label="Daftar petugas">
            <div className={judulBagian}>PETUGAS</div>
            {d.petugas.length === 0 ? <p className="mt-2 text-[13px] text-[#55657D]">Belum ada yang mencoba.</p> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[680px] text-[13px]">
                  <thead><tr className="text-left text-[11px] text-[#6B7A90]"><th className="py-1 pr-2">Nama</th><th className="pr-2">Tingkat</th><th className="pr-2 text-right">Skor</th><th className="pr-2 text-right">Sertifikasi</th><th className="pr-2 text-right">Harian</th><th className="pr-2 text-right">Rangkaian</th><th className="pr-2">Kesegaran</th><th>Terakhir</th></tr></thead>
                  <tbody>
                    {d.petugas.map((p) => (
                      <tr key={p.akun} className="border-t border-[#EEF2F7]"><td className="py-1.5 pr-2 font-semibold">{p.nama}</td><td className="pr-2">{p.tingkat === null ? "Belum" : <>{"★".repeat(p.tingkat)} {NAMA_TINGKAT[p.tingkat]}</>}</td><td className="pr-2 text-right tabular-nums">{p.skor ?? "–"}</td><td className="pr-2 text-right tabular-nums">{p.sertifikasi}</td><td className="pr-2 text-right tabular-nums">{p.harian}</td><td className="pr-2 text-right tabular-nums">{p.streak}</td><td className="pr-2">{p.kesegaran ? LABEL_SEGAR[p.kesegaran] : "–"}</td><td>{tgl(p.terakhir)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${kartu} mt-4`} aria-label="Butir tersulit">
            <div className={judulBagian}>BUTIR TERSULIT (RATA POIN TERENDAH)</div>
            {d.butirTersulit.length === 0 ? <p className="mt-2 text-[13px] text-[#55657D]">Belum ada jawaban.</p> : (
              <ul className="mt-2 space-y-1.5">{d.butirTersulit.slice(0, 10).map((b) => <li key={b.kasus} className="flex justify-between gap-3 text-[13px]"><span><b>{b.kasus}</b> · {b.dijawab} jawaban</span><span className="tabular-nums">rata {b.rataPoin} poin · {b.persenBenar}% benar</span></li>)}</ul>
            )}
          </section>

          <section className={`${kartu} mt-4`} aria-label="Kesalahan teratas">
            <div className={judulBagian}>KESALAHAN TERBANYAK</div>
            {d.kesalahanTeratas.length === 0 ? <p className="mt-2 text-[13px] text-[#55657D]">Belum ada kesalahan tercatat.</p> : (
              <ul className="mt-2 space-y-1.5">{d.kesalahanTeratas.map((k) => <li key={`${k.jenis}${k.tingkat}`} className="flex justify-between gap-3 text-[13px]"><span>{labelJenis(k.jenis)} · <i>{k.tingkat === "fatal" ? "fatal" : k.tingkat === "berat" ? "berat" : "ringan"}</i></span><span className="font-bold tabular-nums">{k.jumlah}</span></li>)}</ul>
            )}
          </section>
          <section className={`${kartu} mt-4`} aria-label="Usulan kasus">
            <div className={judulBagian}>USULAN KASUS DARI PETUGAS</div>
            {usulGalat && <p role="alert" className="mt-2 rounded-[12px] bg-[#FDE8E8] p-2 text-[12.5px] text-[#7A1D22]">{usulGalat}</p>}
            {usulan && usulan.length === 0 && <p className="mt-2 text-[13px] text-[#55657D]">Belum ada usulan.</p>}
            <ul className="mt-2 space-y-3">
              {(usulan ?? []).map((u) => (
                <li key={u.id} className="rounded-[12px] border border-[#EEF2F7] p-3 text-[13px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><b>{u.judul}</b><span className="text-[11px] font-bold" style={{ color: UNGU }}>{LABEL_STATUS[u.status] ?? u.status}</span></div>
                  <div className="text-[11.5px] text-[#6B7A90]">{u.nama} · {tgl(u.dibuat_at)}{u.blok ? ` · ${u.blok}` : ""}</div>
                  <p className="mt-1 whitespace-pre-wrap">{u.cerita}</p>
                  {u.jawaban && <p className="mt-1 whitespace-pre-wrap text-[#44546F]"><b>Usul pencatatan:</b> {u.jawaban}</p>}
                  {u.catatan_admin && <p className="mt-1 text-[#44546F]"><b>Catatan:</b> {u.catatan_admin}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input aria-label="Catatan tinjauan" className="min-h-[40px] min-w-0 flex-1 rounded-[10px] border border-[#CBD5E1] px-2 text-[13px]" maxLength={600} placeholder="Catatan untuk pengusul (boleh kosong)" value={catatan[u.id] ?? ""} onChange={(e) => setCatatan({ ...catatan, [u.id]: e.target.value })} />
                    {(["diterima", "dikerjakan", "ditolak"] as const).map((st) => <button key={st} type="button" onClick={() => void tinjau(u.id, st)} className="min-h-[40px] rounded-[10px] bg-[#EDE8FB] px-3 text-[12.5px] font-bold" style={{ color: UNGU }}>{st === "diterima" ? "Terima" : st === "dikerjakan" ? "Dikerjakan" : "Tolak"}</button>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
