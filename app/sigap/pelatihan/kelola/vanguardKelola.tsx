"use client";

// app/sigap/pelatihan/kelola/vanguardKelola.tsx
//
// (2 Nov 2026) Kelola Pelatihan > Persiapan > Vanguard: tempat MENYALAKAN Vanguard untuk pelatihan ini dan pintu ke dasbor + pengaturannya
// (level dibuka, jadwal buka/tutup, maksimal percobaan, mode). Dulu tidak ada tempatnya di Kelola Pelatihan. API: /api/sigap/pelatihan/vanguard.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import { alamatDasbor } from "@/lib/vanguard/navigasi";
import { LABEL_MODE_VANGUARD, MODE_VANGUARD, adalahTanggalSah, tambahHari, tentukanTenggat, type AturanVanguard, type ModeVanguard } from "@/lib/runtutanVanguard";
import { teksModeVanguard } from "@/lib/vanguardPelatihan";
import { PILIHAN_VANGUARD, pilihanDari, teksSumberVanguard, type KeadaanVanguardKelola, type PilihanVanguard } from "@/lib/vanguardPelatihan";

export default function VanguardKelola() {
  const [d, setD] = useState<KeadaanVanguardKelola | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pilih, setPilih] = useState<PilihanVanguard>("ikut");
  const [sibuk, setSibuk] = useState(false);
  const [dari, setDari] = useState("/");
  const [at, setAt] = useState<AturanVanguard | null>(null);
  const [tg, setTg] = useState(""); // (2 Nov 2026) tenggat eksplisit: hari terakhir sesi dihitung ("" = ikut tanggal buka Pretest)

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<KeadaanVanguardKelola>("/api/sigap/pelatihan/vanguard");
      setD(r);
      setPilih(pilihanDari(r.centang));
      setAt(r.aturan);
      setTg(r.tenggat_atur ?? "");
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    setDari(`${window.location.pathname}${window.location.search}`);
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const berubah = pilih !== pilihanDari(d.centang);
  const atBerubah = !!at && (at.mode !== d.aturan.mode || at.hari_berturut !== d.aturan.hari_berturut || at.sesi_min_per_hari !== d.aturan.sesi_min_per_hari || at.nilai_minimal !== d.aturan.nilai_minimal || tg !== (d.tenggat_atur ?? ""));
  const tgEfektif = tentukanTenggat(adalahTanggalSah(tg) ? tg : null, d.tanggal_pretest);
  const batasMulai = tgEfektif.acuan && at ? tambahHari(tgEfektif.acuan, -at.hari_berturut) : null;
  const tglTeks = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  async function simpanAturan() {
    if (!at) return;
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      const r = await fetchJson<KeadaanVanguardKelola>("/api/sigap/pelatihan/vanguard", { method: "POST", body: JSON.stringify({ aturan: at, tenggat: adalahTanggalSah(tg) ? tg : null }) });
      setD(r);
      setAt(r.aturan);
      setTg(r.tenggat_atur ?? "");
      setOk("Aturan latihan Vanguard disimpan.");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }
  const angka = (v: string, min: number, maks: number, lama: number) => {
    if (v === "") return lama;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(maks, Math.max(min, n)) : lama;
  };

  async function simpan() {
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      const nilai = PILIHAN_VANGUARD.find((x) => x.kode === pilih)!.nilai;
      const r = await fetchJson<KeadaanVanguardKelola>("/api/sigap/pelatihan/vanguard", { method: "POST", body: JSON.stringify({ menyala: nilai }) });
      setD(r);
      setPilih(pilihanDari(r.centang));
      setOk(r.menyala ? "Vanguard menyala untuk pelatihan ini." : "Vanguard tidak menyala untuk pelatihan ini.");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && <Pesan jenis="ok" onTutup={() => setOk(null)}>{ok}</Pesan>}
      <Kartu judul="Vanguard (simulasi pengisian kuesioner)" kanan={<Chip w={d.menyala ? "ok" : "mut"}>{d.menyala ? "✓ Menyala" : "Tidak menyala"}</Chip>}>
        <p className="mb-3 text-[13px] leading-relaxed text-[#55657D]">
          Peserta berlatih mengisi kuesioner pada kartu Vanguard di tab Hari ini; percobaan dan kesalahan tercatat untuk BPS. {teksSumberVanguard(d.sumber)}
          {d.percobaan > 0 ? ` Sudah ada ${d.percobaan} percobaan tercatat.` : ""}
        </p>
        <fieldset className="m-0 space-y-2 border-0 p-0" disabled={!d.boleh_kelola || sibuk}>
          <legend className="sr-only">Penyalaan Vanguard</legend>
          {PILIHAN_VANGUARD.map((p) => (
            <label key={p.kode} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${pilih === p.kode ? "border-[#1F5FD1] bg-[#F3F7FF]" : "border-[#DDE6F3] bg-white"}`}>
              <input type="radio" name="vanguard" className="mt-1" checked={pilih === p.kode} onChange={() => setPilih(p.kode)} />
              <span>
                <span className="block text-[13.5px] font-extrabold text-[#0F2A52]">{p.label}</span>
                <span className="block text-[12.5px] text-[#6B7A90]">{p.ket}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {d.boleh_kelola ? (
            <button type="button" className={BTN} disabled={!berubah || sibuk} onClick={() => void simpan()}>
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
          ) : (
            <span className="text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat. Mengubah memerlukan izin kelola pelatihan.</span>
          )}
          {d.menyala && !berubah && (
            <Link href={alamatDasbor({ kegiatan: d.kegiatan_id, dari })} className="inline-flex min-h-[40px] items-center rounded-full bg-[#5B34C9] px-4 text-[13px] font-extrabold text-white">
              Buka dasbor dan pengaturan →
            </Link>
          )}
        </div>
        {d.menyala && (
          <p className="mt-2.5 text-[12px] text-[#6B7A90]">
            Di dasbor: skor dan kesalahan per peserta, level yang dibuka, jadwal buka/tutup, maksimal percobaan, dan mode latihan/ujian. Aturan &quot;wajib N hari berturut-turut&quot; yang mengunci Pretest diatur di kartu berikutnya.
          </p>
        )}
      </Kartu>

      {at && (
        <Kartu judul="Aturan latihan: berapa hari berturut-turut" kanan={<Chip w={d.aturan.mode === "wajib" ? "ok" : "mut"}>{LABEL_MODE_VANGUARD[d.aturan.mode]}</Chip>}>
          <p className="mb-3 text-[13px] leading-relaxed text-[#55657D]">
            Petugas berlatih Vanguard beberapa hari <b>berturut-turut</b> (hari kalender WIB; satu hari terlewat atau akhir pekan memutus runtutan dan hitungan mulai dari awal). Satu sesi = satu latihan yang diselesaikan; berapa pun nilainya
            selama memenuhi nilai minimal di bawah.
          </p>
          <fieldset className="m-0 space-y-2 border-0 p-0" disabled={!d.boleh_kelola || sibuk}>
            <legend className="sr-only">Mode aturan Vanguard</legend>
            {MODE_VANGUARD.map((m: ModeVanguard) => (
              <label key={m} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${at.mode === m ? "border-[#1F5FD1] bg-[#F3F7FF]" : "border-[#DDE6F3] bg-white"}`}>
                <input type="radio" name="mode-vanguard" className="mt-1" checked={at.mode === m} onChange={() => setAt({ ...at, mode: m })} />
                <span>
                  <span className="block text-[13.5px] font-extrabold text-[#0F2A52]">{LABEL_MODE_VANGUARD[m]}</span>
                  <span className="block text-[12.5px] text-[#6B7A90]">{teksModeVanguard[m]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label className="block text-[12.5px] font-semibold text-[#34455F]">
              Hari berturut-turut
              <input type="number" inputMode="numeric" min={1} max={14} className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-3 text-[14px]" value={at.hari_berturut} disabled={!d.boleh_kelola || sibuk} onChange={(e) => setAt({ ...at, hari_berturut: angka(e.target.value, 1, 14, at.hari_berturut) })} />
            </label>
            <label className="block text-[12.5px] font-semibold text-[#34455F]">
              Sesi minimal per hari
              <input type="number" inputMode="numeric" min={1} max={10} className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-3 text-[14px]" value={at.sesi_min_per_hari} disabled={!d.boleh_kelola || sibuk} onChange={(e) => setAt({ ...at, sesi_min_per_hari: angka(e.target.value, 1, 10, at.sesi_min_per_hari) })} />
            </label>
            <label className="block text-[12.5px] font-semibold text-[#34455F]">
              Nilai minimal (0 = berapa pun)
              <input type="number" inputMode="numeric" min={0} max={100} className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-3 text-[14px]" value={at.nilai_minimal} disabled={!d.boleh_kelola || sibuk} onChange={(e) => setAt({ ...at, nilai_minimal: angka(e.target.value, 0, 100, at.nilai_minimal) })} />
            </label>
          </div>
          {at.mode !== "tidak_ada" && (
            <div className="mt-3">
              <label className="block text-[12.5px] font-semibold text-[#34455F]">
                Tenggat: hari terakhir latihan masih dihitung
                <input type="date" className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-3 text-[14px] sm:w-64" value={tg} disabled={!d.boleh_kelola || sibuk} onChange={(e) => setTg(e.target.value)} />
              </label>
              <p className="mt-1 text-[12px] text-[#6B7A90]">
                Contoh: ketentuan &quot;2 s.d. 8 November&quot; berarti tenggat 8 November. Kosongkan untuk memakai sehari sebelum Pretest dibuka.
                {tg !== "" && (
                  <>
                    {" "}
                    <button type="button" className="font-bold text-[#1F5FD1] underline" disabled={!d.boleh_kelola || sibuk} onClick={() => setTg("")}>Hapus tenggat</button>
                  </>
                )}
              </p>
            </div>
          )}
          {at.mode !== "tidak_ada" && (
            <div className="mt-3 rounded-xl border border-[#D8CCF5] bg-[#F5F0FF] px-3 py-2.5 text-[13px] text-[#3B1F8F]">
              {tgEfektif.tenggat && batasMulai ? (
                <>
                  Tenggat latihan: <b>{tglTeks(tgEfektif.tenggat)}</b> ({tgEfektif.sumber === "atur" ? "diatur di sini" : "sehari sebelum Pretest dibuka"}). Batas mulai latihan: <b>{tglTeks(batasMulai)}</b> (lewat itu, petugas tidak sempat menuntaskan {at.hari_berturut} hari berturut-turut, kecuali PJ membuka kunci atau menggeser jadwal).
                  {d.tanggal_pretest && tgEfektif.sumber === "atur" && tgEfektif.tenggat >= d.tanggal_pretest && <> Perhatian: Pretest dibuka {tglTeks(d.tanggal_pretest)}, tidak sesudah tenggat ini.</>}
                </>
              ) : (
                <>Tenggat belum bisa dihitung: isi tenggat di atas atau jadwalkan Pretest di Soal &amp; Jadwal.</>
              )}
            </div>
          )}
          {at.mode === "wajib" && (
            <p className="mt-2 text-[12.5px] text-[#34455F]">
              Pengingat otomatis: push ke petugas yang hari itu belum berlatih pukul 07.00 dan 16.00 WIB (runtutan belum mulai, hampir terputus, terputus, hari terakhir mulai, batas terlewat). Di tab Hari ini muncul pengingat dan ucapan saat tuntas. Panitia dikabari sekali sehari pukul 16.00 bila ada peserta yang tidak sempat tuntas.
            </p>
          )}
          {at.mode !== "tidak_ada" && !d.menyala && <p className="mt-2 text-[12.5px] font-semibold text-[#8A4B00]">Vanguard belum menyala untuk pelatihan ini (pilihan di atas), jadi aturan ini belum berlaku. Nyalakan dulu.</p>}
          {at.mode === "wajib" && !d.blokir_tahap && (
            <p className="mt-2 text-[12.5px] font-semibold text-[#8A4B00]">Pengunciannya belum bekerja karena &quot;Blokir antar tahapan&quot; mati. Nyalakan di Persiapan &gt; Pengaturan &gt; Aturan nilai, kelulusan, dan urutan tahapan.</p>
          )}
          {d.ringkas && at.mode !== "tidak_ada" && (
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Tuntas", d.ringkas.tuntas],
                ["Berjalan", d.ringkas.berjalan],
                ["Belum mulai", d.ringkas.belum_mulai],
                ["Terputus", d.ringkas.terputus],
                ["Lewat batas", d.ringkas.lewat_batas],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl border border-[#DDE6F3] bg-white px-3 py-2">
                  <dt className="text-[11.5px] font-semibold text-[#6B7A90]">{k}</dt>
                  <dd className="m-0 text-[18px] font-extrabold text-[#0F2A52]">
                    {v}
                    <span className="text-[12px] font-semibold text-[#6B7A90]"> / {d.ringkas!.total}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {d.boleh_kelola && (
            <div className="mt-3">
              <button type="button" className={BTN} disabled={!atBerubah || sibuk} onClick={() => void simpanAturan()}>
                {sibuk ? "Menyimpan…" : "Simpan aturan"}
              </button>
            </div>
          )}
        </Kartu>
      )}
    </div>
  );
}
