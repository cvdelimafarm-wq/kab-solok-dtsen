"use client";

// app/sigap/pelatihan/kelola/tampilan.tsx
//
// (2 Nov 2026) Tab "Persiapan" di Kelola Pelatihan: (1) tampilan peserta (OTOMATIS bawaan: lima tab selama pelatihan belum selesai; dapat dipaksa baru / lama),
// (2) ketentuan undangan, (3) pengaturan Absen peserta (sesi, jendela, radius), (4) aturan nilai dan kelulusan (versi lama / baru). Setiap setelan diberi penanda Bawaan / Diubah.
// API: /api/sigap/pelatihan/ketentuan, /api/sigap/pelatihan/absen (aksi "atur") dan /api/sigap/pelatihan/nilai (aksi "simpan_aturan").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, BTN_R, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { LABEL_GAYA, MAKS_BUTIR, MAKS_PANJANG_BUTIR, butirBergaya, terapkanGaya, type GayaTeks } from "@/lib/ketentuanPelatihan";
import { TeksBaris } from "../TeksBaris";
import { lupakanBenderaTab } from "../TabPelatihan";
import { LABEL_VERSI, type VersiAturan } from "@/lib/sigapAturanTes";
import { JENDELA_MENIT_BAWAAN, RADIUS_RADAR_BAWAAN_M, SESI_BAWAAN, type SesiRencana } from "@/lib/sigapAbsen";
import { ChipSetelan } from "./GrupTab";

type Data = {
  kegiatan_id: number;
  tab_baru: boolean;
  tab_pengaturan: boolean | null;
  otomatis: boolean;
  kegiatan_selesai: boolean;
  ketentuan: { butir: string[]; versi: number; diubah: boolean };
  boleh_kelola: boolean;
};

const PILIHAN: { nilai: boolean | null; label: string; ket: string }[] = [
  { nilai: null, label: "Otomatis", ket: "Lima tab selama pelatihan belum selesai; pelatihan yang sudah selesai tetap tampilan Langkah lama." },
  { nilai: true, label: "Selalu lima tab", ket: "Peserta selalu melihat Hari ini · Instrumen · Pelatihan · Kamera · Monitoring." },
  { nilai: false, label: "Selalu Langkah lama", ket: "Peserta melihat daftar Langkah pelatihan seperti sebelumnya." },
];

type AturAbsen = { sesi: SesiRencana[]; jendela_menit: number; radius_m: number };
const sama = (a: AturAbsen, b: AturAbsen) => JSON.stringify(a) === JSON.stringify(b);
const BAWAAN_ABSEN: AturAbsen = { sesi: SESI_BAWAAN.map((x) => ({ ...x })), jendela_menit: JENDELA_MENIT_BAWAAN, radius_m: RADIUS_RADAR_BAWAAN_M };

/** Pengaturan Absen peserta: daftar sesi (label + jam rencana), jendela absen, radius radar. */
function KartuAturAbsen({ bisa }: { bisa: boolean }) {
  const [asal, setAsal] = useState<AturAbsen | null>(null);
  const [f, setF] = useState<AturAbsen>(BAWAAN_ABSEN);
  const [ada, setAda] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<{ atur: AturAbsen; tersedia?: boolean }>(urlPelatihan("/api/sigap/pelatihan/absen"));
      setAsal(r.atur);
      setF(r.atur);
      setAda(r.tersedia !== false);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  async function simpan(isi: AturAbsen, pesan: string) {
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      await fetchJson(urlPelatihan("/api/sigap/pelatihan/absen"), { method: "POST", body: JSON.stringify({ aksi: "atur", ...isi }) });
      setOk(pesan);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (!asal && !galat) return <Memuat />;
  const diubah = !!asal && !sama(asal, BAWAAN_ABSEN);
  const berubah = !!asal && !sama(asal, f);
  const ubahSesi = (i: number, k: "label" | "jam", v: string) => setF((x) => ({ ...x, sesi: x.sesi.map((r, j) => (j === i ? { ...r, [k]: k === "label" ? v.slice(0, 40) : v } : r)) }));
  const tambah = () =>
    setF((x) => {
      const terpakai = new Set(x.sesi.map((r) => r.no));
      let no = 1;
      while (terpakai.has(no)) no++;
      return no > 12 ? x : { ...x, sesi: [...x.sesi, { no, label: `Sesi ${no}`, jam: "08:00" }].sort((a, b) => a.no - b.no) };
    });

  return (
    <Kartu judul="Absen peserta" kanan={<ChipSetelan diubah={diubah} teksBawaan="Bawaan · 4 sesi, 30 menit, 25 m" teksDiubah="Diubah" />}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}
      {!ada && <Pesan jenis="info">Fitur Absen peserta belum aktif di basis data (SQL 20261102zk belum dijalankan). Pengaturan di sini baru dapat disimpan setelah itu.</Pesan>}
      <p className="text-[12.5px] text-[#6B7A90]">
        Daftar sesi hanya saran: pengelola tetap memulai sesi kapan saja dari tab Absen peserta. Jendela absen adalah lama sesi terbuka sejak dimulai; radius dipakai metode radar.
      </p>
      <ol className="mt-2 space-y-2">
        {f.sesi.map((r, i) => (
          <li key={r.no} className="flex flex-wrap items-center gap-1.5">
            <span className="w-5 text-right text-[12px] text-[#6B7A90]">{r.no}.</span>
            <input value={r.label} onChange={(e) => ubahSesi(i, "label", e.target.value)} disabled={!bisa} className={`${INPUT} min-w-0 flex-1`} aria-label={`Nama sesi ${r.no}`} />
            <input type="time" value={r.jam} onChange={(e) => ubahSesi(i, "jam", e.target.value)} disabled={!bisa} className={`${INPUT} w-[7.5rem]`} aria-label={`Jam rencana sesi ${r.no}`} />
            {bisa && f.sesi.length > 1 && (
              <button type="button" className={BTN_R} onClick={() => setF((x) => ({ ...x, sesi: x.sesi.filter((_, j) => j !== i) }))} aria-label={`Hapus sesi ${r.no}`}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[13px]">
          <span className="font-semibold">Jendela absen (menit)</span>
          <input type="number" inputMode="numeric" min={5} max={240} value={f.jendela_menit} onChange={(e) => setF((x) => ({ ...x, jendela_menit: Number(e.target.value) }))} disabled={!bisa} className={`${INPUT} mt-1 w-full`} />
        </label>
        <label className="text-[13px]">
          <span className="font-semibold">Radius radar (meter)</span>
          <input type="number" inputMode="numeric" min={10} max={500} value={f.radius_m} onChange={(e) => setF((x) => ({ ...x, radius_m: Number(e.target.value) }))} disabled={!bisa} className={`${INPUT} mt-1 w-full`} />
        </label>
      </div>
      {bisa && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={tambah} disabled={f.sesi.length >= 12}>
            + Tambah sesi
          </button>
          <button type="button" className={BTN} onClick={() => simpan(f, "Pengaturan absen disimpan.")} disabled={sibuk || !berubah || !ada}>
            {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
          </button>
          {diubah && (
            <button type="button" className={BTN_O} onClick={() => simpan(BAWAAN_ABSEN, "Pengaturan absen dikembalikan ke bawaan.")} disabled={sibuk || !ada}>
              Kembalikan ke bawaan
            </button>
          )}
        </div>
      )}
    </Kartu>
  );
}

type AturanKeg = { versi: VersiAturan; blokir_tahap: boolean; izin_ajukan: boolean; eksplisit: boolean };

/** Aturan nilai & kelulusan: versi 1 (lama: nilai tertinggi, lulus bila >= ambang) atau 2 (baru: nilai percobaan pertama, lulus bila > ambang; hanya flag). */
function KartuAturanNilai({ bisa }: { bisa: boolean }) {
  const [a, setA] = useState<AturanKeg | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<{ aturan?: AturanKeg }>(urlPelatihan("/api/sigap/pelatihan/nilai"));
      setA(r.aturan ?? { versi: 1, blokir_tahap: false, izin_ajukan: false, eksplisit: false });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  /** Simpan satu perubahan; dua setelan lain dibawa apa adanya (server menyimpan ketiganya sekaligus). */
  async function simpan(ubah: Partial<Pick<AturanKeg, "versi" | "blokir_tahap" | "izin_ajukan">>, pesanOk: string) {
    if (!a) return;
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      const aturan = { versi: a.versi, blokir_tahap: a.blokir_tahap, izin_ajukan: a.izin_ajukan, ...ubah };
      await fetchJson(urlPelatihan("/api/sigap/pelatihan/nilai"), { method: "POST", body: JSON.stringify({ aksi: "simpan_aturan", aturan }) });
      setOk(pesanOk);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  async function pilih(versi: VersiAturan) {
    if (!a || a.versi === versi) return;
    await simpan({ versi }, versi === 2 ? "Aturan baru berlaku: nilai percobaan pertama, lulus bila lebih dari ambang." : "Aturan lama berlaku: nilai tertinggi, lulus bila memenuhi ambang.");
  }

  if (!a && !galat) return <Memuat />;
  if (!a) return <Pesan jenis="galat">{galat}</Pesan>;
  return (
    <Kartu judul="Aturan nilai, kelulusan, dan urutan tahapan" kanan={<ChipSetelan diubah={a.eksplisit} teksBawaan={`Bawaan · ${a.versi === 2 ? "aturan baru" : "aturan lama"}`} teksDiubah={`Diubah · ${a.versi === 2 ? "aturan baru" : "aturan lama"}`} />}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}
      <div role="radiogroup" aria-label="Aturan nilai" className="grid gap-2 sm:grid-cols-2">
        {([2, 1] as VersiAturan[]).map((v) => {
          const aktif = a.versi === v;
          return (
            <button key={v} type="button" role="radio" aria-checked={aktif} disabled={!bisa || sibuk} onClick={() => void pilih(v)} className={`rounded-xl border p-3 text-left disabled:opacity-60 ${aktif ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DDE6F3] bg-white hover:bg-[#F8FAFC]"}`}>
              <b className="block text-[13.5px] text-[#0F2A52]">
                {aktif ? "● " : "○ "}
                {v === 2 ? "Aturan baru (disarankan untuk kegiatan baru)" : "Aturan lama"}
              </b>
              <span className="mt-0.5 block text-[12px] text-[#6B7A90]">{LABEL_VERSI[v]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12.5px] text-[#6B7A90]">
        Kelulusan hanya penanda untuk laporan ke pimpinan; tidak memblokir pendataan. Mengubah aturan mengubah cara nilai dihitung untuk semua peserta kegiatan ini, termasuk yang sudah mengerjakan. Pelatihan PSP Pascabencana tetap aturan lama bila tidak diubah.
        Ambang kelulusan nilai akhir diatur di Soal &amp; Jadwal (skema nilai), bawaan 70. Pengulangan sampai 100 diatur per tes di Soal &amp; Jadwal (centang &quot;Wajib 100&quot;).
      </p>
      <fieldset className="mt-3 border-t border-[#EDF0F4] pt-3">
        <legend className="text-[13.5px] font-extrabold text-[#0F2A52]">Urutan tahapan</legend>
        <label className="mt-1.5 flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#1F5FD1]" checked={a.blokir_tahap} disabled={!bisa || sibuk} onChange={(e) => void simpan({ blokir_tahap: e.target.checked }, e.target.checked ? "Urutan tahapan dinyalakan: Posttest menunggu Pretest dan Kuis selesai." : "Urutan tahapan dimatikan: semua tes terbuka sesuai jadwal.")} />
          <span>
            <b>Tahapan yang belum selesai mengunci tahapan berikutnya</b>
            <span className="block text-[12px] text-[#6B7A90]">Pretest → Kuis Adu Sigap → Posttest. Tes &quot;Wajib 100&quot; baru dianggap selesai di nilai 100. Kuis tidak dikunci (dikerjakan bersama di kelas) tetapi ikut menentukan kapan Posttest terbuka. Video dan Vanguard ikut terhubung setelah fiturnya jadi.</span>
          </span>
        </label>
        <label className="mt-2.5 flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#1F5FD1]" checked={a.izin_ajukan} disabled={!bisa || sibuk} onChange={(e) => void simpan({ izin_ajukan: e.target.checked }, e.target.checked ? "Petugas kini dapat meminta buka kunci; permintaan muncul di Hari ini panitia dan instruktur." : "Pengajuan buka kunci dimatikan; panitia dan instruktur tetap dapat membukanya dari Monitoring.")} />
          <span>
            <b>Petugas boleh meminta buka kunci</b>
            <span className="block text-[12px] text-[#6B7A90]">Tombol &quot;Minta buka kunci&quot; muncul pada tes yang terkunci; permintaan tampil sebagai kartu di tab Hari ini panitia dan instruktur kelas itu. Izin berlaku sampai 23.59 WIB hari yang sama.</span>
          </span>
        </label>
        {a.blokir_tahap && !a.izin_ajukan && <p className="mt-2 text-[12px] text-[#8A6200]">Pengajuan dimatikan: petugas yang terkunci harus menghubungi panitia / instruktur, yang membuka kunci dari Monitoring.</p>}
      </fieldset>
    </Kartu>
  );
}


export default function PersiapanKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [butir, setButir] = useState<string[]>([]);
  const [simpanTab, setSimpanTab] = useState(false);
  const [simpanButir, setSimpanButir] = useState(false);
  // gaya teks butir (tebal, miring, garis bawah, sorot): butir yang sedang dipilih kursornya + pesan penolakan bila gaya tidak dapat diterapkan
  const refButir = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [fokus, setFokus] = useState(-1);
  const [infoGaya, setInfoGaya] = useState("");

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>(urlPelatihan("/api/sigap/pelatihan/ketentuan"));
      setD(r);
      setButir(r.ketentuan.butir);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  const berubah = useMemo(() => !!d && JSON.stringify(butir.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean)) !== JSON.stringify(d.ketentuan.butir), [d, butir]);

  async function kirim(isi: { butir?: string[]; tab_baru?: boolean | null }, pesan: string, tandai: (b: boolean) => void) {
    tandai(true);
    setGalat(null);
    setOk(null);
    try {
      await fetchJson(urlPelatihan("/api/sigap/pelatihan/ketentuan"), { method: "POST", body: JSON.stringify({ aksi: "simpan", ...isi }) });
      setOk(pesan);
      lupakanBenderaTab();
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      tandai(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const bisa = d.boleh_kelola;
  const ubah = (i: number, v: string) => setButir((b) => b.map((x, j) => (j === i ? v.slice(0, MAKS_PANJANG_BUTIR) : x)));
  const gayaKe = (i: number, gaya: GayaTeks) => {
    const ta = refButir.current[i];
    if (!ta || i < 0 || i >= butir.length) return;
    const h = terapkanGaya(butir[i] ?? "", ta.selectionStart, ta.selectionEnd, gaya, MAKS_PANJANG_BUTIR);
    setInfoGaya(h.pesan ?? "");
    if (h.pesan) return;
    setButir((b) => b.map((x, j) => (j === i ? h.teks : x)));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(h.awal, h.akhir);
    });
  };
  const aktifGaya = fokus >= 0 && fokus < butir.length ? fokus : -1;
  const geser = (i: number, arah: -1 | 1) =>
    setButir((b) => {
      const j = i + arah;
      if (j < 0 || j >= b.length) return b;
      const c = [...b];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const butirTerisi = d.ketentuan.butir.length > 0;

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}

      <Kartu
        judul="Tampilan peserta"
        kanan={<ChipSetelan diubah={!d.otomatis} teksBawaan="Bawaan · otomatis" teksDiubah={d.tab_pengaturan ? "Diubah · selalu lima tab" : "Diubah · selalu Langkah lama"} />}
      >
        <p className="text-[13px] text-[#3B4A60]">
          Saat ini peserta melihat <b>{d.tab_baru ? "tampilan lima tab" : "tampilan Langkah lama"}</b>
          {d.otomatis ? (d.kegiatan_selesai ? " (otomatis: pelatihan ini sudah selesai)." : " (otomatis: pelatihan ini belum selesai).") : " (diatur manual)."}
        </p>
        <div role="radiogroup" aria-label="Tampilan peserta" className="mt-2 grid gap-2 sm:grid-cols-3">
          {PILIHAN.map((p) => {
            const aktif = d.tab_pengaturan === p.nilai;
            return (
              <button
                key={String(p.nilai)}
                type="button"
                role="radio"
                aria-checked={aktif}
                disabled={!bisa || simpanTab}
                onClick={() => !aktif && kirim({ tab_baru: p.nilai }, p.nilai === null ? "Kembali ke otomatis." : p.nilai ? "Tampilan lima tab dipaksa menyala." : "Tampilan Langkah lama dipaksa.", setSimpanTab)}
                className={`rounded-xl border p-3 text-left disabled:opacity-60 ${aktif ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DDE6F3] bg-white hover:bg-[#F8FAFC]"}`}
              >
                <b className="block text-[13.5px] text-[#0F2A52]">
                  {aktif ? "● " : "○ "}
                  {p.label}
                  {p.nilai === null ? " (disarankan)" : ""}
                </b>
                <span className="mt-0.5 block text-[12px] text-[#6B7A90]">{p.ket}</span>
              </button>
            );
          })}
        </div>
        {!bisa && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat; mengubah memerlukan izin kelola pelatihan.</p>}
      </Kartu>

      <Kartu judul="Ketentuan undangan" ket={`versi ${d.ketentuan.versi}`} kanan={<ChipSetelan diubah={butirTerisi} teksDiubah={`Diubah · ${d.ketentuan.butir.length} butir`} teksBawaan="Bawaan · belum ada butir" />}>
        <p className="text-[12.5px] text-[#6B7A90]">
          Waktu dan tempat diambil otomatis dari data undangan. Butir di bawah tampil di modal ketentuan peserta. Mengubah butir menaikkan versi; peserta yang sudah menerima hanya diberi tahu, tanpa persetujuan ulang.
        </p>
        {bisa && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#F3F6FB] p-2" role="toolbar" aria-label="Gaya teks butir">
            <span className="text-[12px] text-[#6B7A90]">Pilih kata di dalam butir, lalu klik:</span>
            {(["tebal", "miring", "garis", "sorot"] as GayaTeks[]).map((g) => (
              <button
                key={g}
                type="button"
                className={BTN_O}
                disabled={aktifGaya < 0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => gayaKe(aktifGaya, g)}
                aria-label={LABEL_GAYA[g]}
                title={g === "tebal" ? "Tebal (Ctrl+B)" : g === "miring" ? "Miring (Ctrl+I)" : g === "garis" ? "Garis bawah (Ctrl+U)" : "Sorot"}
              >
                {g === "tebal" && <b>B</b>}
                {g === "miring" && <i>I</i>}
                {g === "garis" && <u>U</u>}
                {g === "sorot" && <mark style={{ background: "#FFE680", padding: "0 3px", borderRadius: 3 }}>Sorot</mark>}
              </button>
            ))}
            <span className="text-[11.5px] text-[#6B7A90]">Klik lagi pada kata yang sama untuk mencabut. Satu kata hanya satu gaya.</span>
            {infoGaya && <span className="w-full text-[12px] font-semibold text-[#8A6200]">{infoGaya}</span>}
          </div>
        )}
        <ol className="mt-2 space-y-2">
          {butir.map((b, i) => (
            <li key={i}>
              <div className="flex items-start gap-1.5">
              <span className="mt-2 w-5 text-right text-[12px] text-[#6B7A90]">{i + 1}.</span>
              <textarea
                ref={(el) => {
                  refButir.current[i] = el;
                }}
                value={b}
                onChange={(e) => {
                  setInfoGaya("");
                  ubah(i, e.target.value);
                }}
                onFocus={() => setFokus(i)}
                onKeyDown={(e) => {
                  // Ctrl/Cmd + B, I, U = tebal, miring, garis bawah (Ctrl+U biasanya "lihat sumber" peramban, jadi dicegah di kotak ini)
                  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
                  const gaya: GayaTeks | null = e.key === "b" || e.key === "B" ? "tebal" : e.key === "i" || e.key === "I" ? "miring" : e.key === "u" || e.key === "U" ? "garis" : null;
                  if (!gaya) return;
                  e.preventDefault();
                  gayaKe(i, gaya);
                }}
                rows={2}
                disabled={!bisa}
                className={`${INPUT} min-w-0 flex-1`}
                aria-label={`Butir ketentuan ${i + 1}`}
              />
              {bisa && (
                <span className="flex flex-col gap-1">
                  <button type="button" className={BTN_O} onClick={() => geser(i, -1)} disabled={i === 0} aria-label="Naikkan">
                    ↑
                  </button>
                  <button type="button" className={BTN_O} onClick={() => geser(i, 1)} disabled={i === butir.length - 1} aria-label="Turunkan">
                    ↓
                  </button>
                </span>
              )}
              {bisa && (
                <button type="button" className={BTN_R} onClick={() => setButir((x) => x.filter((_, j) => j !== i))} aria-label="Hapus butir">
                  ✕
                </button>
              )}
              </div>
              {butirBergaya(b) && (
                <p className="ml-6 mt-1 text-[12.5px] text-[#3B4A60]">
                  <span className="text-[#6B7A90]">Tampil bagi peserta: </span>
                  <TeksBaris teks={b} />
                </p>
              )}
            </li>
          ))}
          {butir.length === 0 && <li className="text-[12.5px] text-[#6B7A90]">Belum ada butir ketentuan (bawaan).</li>}
        </ol>
        {bisa && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN_O} onClick={() => setButir((b) => [...b, ""])} disabled={butir.length >= MAKS_BUTIR}>
              + Tambah butir
            </button>
            <button type="button" className={BTN} onClick={() => kirim({ butir }, "Ketentuan disimpan.", setSimpanButir)} disabled={simpanButir || !berubah}>
              {simpanButir ? "Menyimpan…" : "Simpan ketentuan"}
            </button>
            {butirTerisi && (
              <button type="button" className={BTN_O} onClick={() => kirim({ butir: [] }, "Ketentuan dikembalikan ke bawaan (tanpa butir).", setSimpanButir)} disabled={simpanButir}>
                Kembalikan ke bawaan
              </button>
            )}
          </div>
        )}
      </Kartu>

      <KartuAturAbsen bisa={bisa} />
      <KartuAturanNilai bisa={bisa} />
    </div>
  );
}
