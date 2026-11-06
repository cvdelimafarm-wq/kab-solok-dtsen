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
import { NAMA_LEVEL, URUTAN_LEVEL } from "@/lib/vanguard/kasus/daftar";
import { inputWibKeIso, isoKeInputWib, levelDibuka, type Pengaturan, type StatusJadwal } from "@/lib/vanguard/pengaturan";
import type { JenisKesalahan, Tingkat } from "@/lib/vanguard/tipe";
import SelectCari from "@/app/components/SelectCari";

type Daftar = { id: number; nama: string; jenis: string; menyala: boolean; percobaan: number }[];
type PengaturanJadwal = Pengaturan & { status: StatusJadwal };
type Muat = { kegiatan: { id: number; nama: string; jenis: string }; dasbor: DataDasbor; terpotong: boolean; pengaturan: PengaturanJadwal; boleh_kelola: boolean };

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

const NAMA_STATUS: Record<StatusJadwal, string> = { belum_buka: "belum dibuka", buka: "dibuka", tutup: "sudah ditutup" };
const inputKelas = "min-h-[44px] w-full rounded-[10px] border border-[#CBD6E6] bg-white px-3 text-[14px] text-[#0F2A52] disabled:bg-[#F1F4F9]";

function FormPengaturan({ kegiatanId, awal, bolehKelola, onTersimpan }: { kegiatanId: number; awal: PengaturanJadwal; bolehKelola: boolean; onTersimpan: (p: PengaturanJadwal) => void }) {
  const [mode, setMode] = useState<"latihan" | "uji">(awal.mode);
  const [level, setLevel] = useState<string[]>(levelDibuka(awal));
  const [lulus, setLulus] = useState(awal.nilai_lulus === null ? "" : String(awal.nilai_lulus));
  const [maks, setMaks] = useState(awal.maks_percobaan === null ? "" : String(awal.maks_percobaan));
  const [buka, setBuka] = useState(isoKeInputWib(awal.buka_at));
  const [tutup, setTutup] = useState(isoKeInputWib(awal.tutup_at));
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  async function simpan() {
    setSibuk(true); setPesan(null);
    try {
      const r = await apiPortal<{ pengaturan: PengaturanJadwal }>("/api/sigap/vanguard/admin", {
        method: "POST",
        body: JSON.stringify({ kegiatan: kegiatanId, pengaturan: { mode, level_dibuka: level, nilai_lulus: lulus.trim() === "" ? null : Number(lulus), maks_percobaan: maks.trim() === "" ? null : Number(maks), buka_at: inputWibKeIso(buka), tutup_at: inputWibKeIso(tutup) } }),
      });
      onTersimpan(r.pengaturan);
      setPesan({ jenis: "ok", teks: "Pengaturan tersimpan. Berlaku untuk percobaan berikutnya." });
    } catch (e) {
      setPesan({ jenis: "galat", teks: e instanceof Error ? e.message : "Gagal menyimpan." });
    } finally { setSibuk(false); }
  }
  const semua = level.length === URUTAN_LEVEL.length;
  return (
    <div className="mt-2">
      <p className="text-[12.5px] text-[#55657D]">Status jadwal sekarang: <b>{NAMA_STATUS[awal.status]}</b>{awal.mode === "uji" ? <> · mode <b>uji</b>{awal.status === "buka" ? " sedang berlangsung" : ""}</> : null}. Pengaturan hanya berlaku untuk latihan yang dicatat pada kegiatan ini; simulasi bebas dari Beranda tidak terpengaruh.</p>
      <fieldset className="mt-3" disabled={!bolehKelola || sibuk}>
        <legend className="text-[12.5px] font-bold text-[#44546F]">Mode</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {([["latihan", "Latihan", "Petugas boleh memakai petunjuk, melihat kunci dan pembahasan. Hasil dicatat."], ["uji", "Uji", "Server yang menilai. Tanpa petunjuk, kunci, atau pembahasan; hanya benar atau salah. Hasil dicatat dan menentukan kelulusan."]] as const).map(([k, nama, ket]) => (
            <label key={k} className={`flex min-h-[44px] cursor-pointer items-start gap-2 rounded-[10px] border px-3 py-2 text-[13px] ${mode === k ? "border-[#5B34C9] bg-[#F5F0FF]" : "border-[#DCE3EE]"}`}>
              <input type="radio" name="mode-vanguard" className="mt-1" checked={mode === k} onChange={() => setMode(k)} />
              <span><b>{nama}</b><span className="block text-[12px] text-[#55657D]">{ket}</span></span>
            </label>
          ))}
        </div>
        {mode === "uji" && <p className="mt-1 text-[11.5px] text-[#6B4C00]">Uji hanya berlaku selama jadwal buka (atur waktu buka dan tutup di bawah). Selama uji, peserta kegiatan ini tidak dapat melihat kunci kasus pada level yang diuji, juga lewat simulasi bebas di Beranda.</p>}
        <div className="mt-3 text-[12.5px] font-bold text-[#44546F]">Level kasus yang dibuka</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {URUTAN_LEVEL.map((l) => (
            <label key={l} className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#DCE3EE] px-3 text-[13px] text-[#0F2A52]">
              <input type="checkbox" checked={level.includes(l)} onChange={(e) => setLevel((x) => (e.target.checked ? [...x, l] : x.filter((y) => y !== l)))} />
              <span><b>{l}</b> · {NAMA_LEVEL[l]}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11.5px] text-[#6B7A90]">{semua ? "Semua level terbuka." : level.length === 0 ? "Pilih minimal satu level." : `${level.length} dari ${URUTAN_LEVEL.length} level terbuka.`}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-[12.5px] font-bold text-[#44546F]">Nilai lulus (% kasus yang harus benar)
            <input className={`${inputKelas} mt-1`} inputMode="numeric" placeholder="kosong = tanpa batas lulus" value={lulus} onChange={(e) => setLulus(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
          <label className="text-[12.5px] font-bold text-[#44546F]">Batas percobaan per kasus (1 sampai 200)
            <input className={`${inputKelas} mt-1`} inputMode="numeric" placeholder="kosong = 200" value={maks} onChange={(e) => setMaks(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
          <label className="text-[12.5px] font-bold text-[#44546F]">Dibuka mulai (WIB)
            <input type="datetime-local" className={`${inputKelas} mt-1`} value={buka} onChange={(e) => setBuka(e.target.value)} />
          </label>
          <label className="text-[12.5px] font-bold text-[#44546F]">Ditutup pada (WIB)
            <input type="datetime-local" className={`${inputKelas} mt-1`} value={tutup} onChange={(e) => setTutup(e.target.value)} />
          </label>
        </div>
      </fieldset>
      {bolehKelola && (
        <button type="button" disabled={sibuk} onClick={() => { setMode("uji"); setLulus("70"); setMaks("3"); }} className="mt-3 mr-2 min-h-[44px] rounded-[12px] border border-[#5B34C9] bg-white px-4 text-[13px] font-extrabold text-[#5B34C9] disabled:opacity-60">Terapkan aturan standar (uji, lulus 70, maks 3 percobaan)</button>
      )}
      {bolehKelola ? (
        <button type="button" disabled={sibuk || level.length === 0} onClick={simpan} className="mt-3 min-h-[44px] rounded-[12px] bg-[#5B34C9] px-4 text-[13px] font-extrabold text-white disabled:opacity-60">{sibuk ? "Menyimpan…" : "Simpan pengaturan"}</button>
      ) : <p className="mt-3 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat pengaturan ini (izin kelola diperlukan untuk mengubah).</p>}
      {pesan && <p role={pesan.jenis === "galat" ? "alert" : "status"} className={`mt-2 text-[12.5px] ${pesan.jenis === "galat" ? "text-[#7A1D22]" : "text-[#0F5C38]"}`}>{pesan.teks}</p>}
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
        <SelectCari value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className="min-h-[40px] rounded-[10px] border border-[#CBD6E6] bg-white px-2 text-[13px] text-[#0F2A52]">
          <option value="nama">Nama</option><option value="fatal">Kesalahan fatal terbanyak</option><option value="percobaan">Percobaan terbanyak</option><option value="benar">Kasus benar terbanyak</option>
        </SelectCari>
      </label>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <caption className="sr-only">Ringkasan per petugas</caption>
          <thead><tr className="text-left text-[#44546F]">
            {["Nama", "Percobaan", "Kasus benar / dikerjakan", "Benar di percobaan pertama", "Kelemahan utama", "Fatal", "Hasil", "Kalkulator"].map((h) => <th key={h} scope="col" className="px-2 py-1 font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {baris.map((p) => (
              <tr key={p.akun_id} className="border-t border-[#EEF2F7] align-top">
                <th scope="row" className="px-2 py-1.5 text-left font-semibold text-[#0F2A52]">{p.nama}{p.peran && <span className="ml-1 font-normal uppercase text-[#6B7A90]">{p.peran}</span>}</th>
                <td className="px-2 py-1.5 tabular-nums">{p.percobaan}</td>
                <td className="px-2 py-1.5 tabular-nums">{p.kasusBenar} / {p.kasusDikerjakan}</td>
                <td className="px-2 py-1.5 tabular-nums">{p.kasusDikerjakan ? `${p.persenBenarPertama}%` : "–"}</td>
                <td className="px-2 py-1.5">{p.kelemahan ? <>{LABEL_JENIS[p.kelemahan.jenis]} <span className="text-[#6B7A90]">({p.kelemahan.jumlah}×)</span></> : <span className="text-[#6B7A90]">{p.percobaan ? "tidak ada" : "belum mencoba"}</span>}</td>
                <td className="px-2 py-1.5 font-bold tabular-nums">{p.fatal > 0 ? <span className="text-[#7A1D22]">⚠ {p.fatal}</span> : 0}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.hasil === "tanpa_batas" ? <span className="text-[#6B7A90]">–</span>
                    : p.hasil === "lulus" ? <b className="text-[#0F5C38]">✓ Lulus <span className="font-normal text-[#6B7A90]">({p.persenBenar}%)</span></b>
                    : p.hasil === "tidak_lulus" ? <span><b className="text-[#7A1D22]">✗ Tidak lulus</b> <span className="text-[#6B7A90]">({p.persenBenar}%)</span><span className="block text-[11.5px] font-bold text-[#8A5A00]">Pendampingan khusus</span></span>
                    : <span>Belum final <span className="text-[#6B7A90]">({p.persenBenar}%)</span></span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{p.kalkulator}×</td>
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
          {(() => {
            const keDaftar = `/sigap/vanguard/dasbor${kembali !== "/" ? `?dari=${encodeURIComponent(kembali)}` : ""}`;
            const kelas = "inline-flex min-h-[44px] items-center rounded-full bg-white/15 px-4 text-[13px] font-bold";
            // Datang dari layar Kelola (?dari=): tombol utama kembali ke sana; "Semua kegiatan" tetap tersedia sebagai tautan kedua.
            if (idPilih === null) return <Link href={kembali} className={kelas}>← Kembali</Link>;
            if (kembali !== "/") return <div className="flex flex-col gap-1"><Link href={kembali} className={kelas}>← Kembali</Link><Link href={keDaftar} className="px-2 text-[11.5px] font-bold text-[#D9CFF8] underline">Semua kegiatan</Link></div>;
            return <Link href={keDaftar} className={kelas}>← Semua kegiatan</Link>;
          })()}
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

            <section className={kartu} aria-label="Pengaturan Vanguard">
              <div className={judulBagian}>PENGATURAN VANGUARD KEGIATAN INI</div>
              <FormPengaturan key={d.kegiatan.id} kegiatanId={d.kegiatan.id} awal={d.pengaturan} bolehKelola={d.boleh_kelola} onTersimpan={(p) => setD((m) => (m ? { ...m, pengaturan: p } : m))} />
            </section>

            <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Ubin judul="PETUGAS MENCOBA" nilai={`${x.ringkasan.mencoba} / ${x.ringkasan.peserta}`} ket={`${x.ringkasan.persenMencoba}% dari peserta`} />
              <Ubin judul="PERCOBAAN" nilai={String(x.ringkasan.percobaan)} ket={`${x.ringkasan.rataPercobaanPerKasus} per kasus per petugas`} />
              <Ubin judul="BENAR TANPA PETUNJUK" nilai={`${x.ringkasan.persenBenarTanpaPetunjuk}%`} ket="dari kasus yang akhirnya benar" />
              <Ubin judul="RATA-RATA BINTANG" nilai={`${x.ringkasan.rataBintang} / 3`} ket="kasus yang benar" />
              <Ubin judul="WAKTU MEDIAN" nilai={durasi(x.ringkasan.medianDurasiDtk)} ket="per percobaan" />
              <Ubin judul="KESALAHAN FATAL" nilai={String(x.ringkasan.kesalahanFatal)} ket={`dari ${x.ringkasan.kesalahanTotal} kesalahan tercatat`} />
              {x.ringkasan.lulus !== null && <Ubin judul="LULUS" nilai={`${x.ringkasan.lulus} / ${x.ringkasan.peserta}`} ket={`${x.ringkasan.persenLulus}% peserta; batas ${d.pengaturan.nilai_lulus}% kasus benar`} />}
              {x.ringkasan.tidakLulus !== null && <Ubin judul="TIDAK LULUS (FINAL)" nilai={String(x.ringkasan.tidakLulus)} ket="percobaan habis; tetap mendata dengan pendampingan khusus" />}
              {x.ringkasan.belumFinal !== null && <Ubin judul="BELUM FINAL" nilai={String(x.ringkasan.belumFinal)} ket="belum lulus dan masih ada percobaan, atau belum mulai" />}
              <Ubin judul="PEMAKAIAN KALKULATOR" nilai={`${x.ringkasan.kalkulatorTotal}×`} ket={`${x.ringkasan.kalkulatorPetugas} petugas memakainya`} />
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
