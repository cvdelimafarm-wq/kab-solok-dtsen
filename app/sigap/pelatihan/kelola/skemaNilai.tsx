"use client";

// app/sigap/pelatihan/kelola/skemaNilai.tsx
//
// (8 Okt 2026) Skema nilai akhir peserta pelatihan: centang komponen (Pretest / Posttest / Kuis Adu Sigap) + bobot.
// Panel yang SAMA tampil di dua tempat (Soal & Jadwal dan Monitoring); skemanya satu (tabel sigap_pelatihan_nilai_skema)
// dan otomatis dipakai tab Administrasi serta Laporan Pelatihan. API: /api/sigap/pelatihan/nilai.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN_G, BTN_O, Chip, INPUT, Kartu, Pesan } from "../../admin/ui";
import { KET_TAMBAHAN, KOMPONEN, KOMPONEN_TAMBAHAN, LABEL_DASAR_KUIS, LABEL_KOMPONEN, LABEL_TAMBAHAN, SKEMA_BAWAAN, kanonik, lulusAkhirDari, ringkasSkema, tambahanDari, validasiSkema, type DasarKuis, type KomponenTambahan, type KuisNilai, type SkemaNilai } from "@/lib/sigapNilaiHitung";

const URL_NILAI = "/api/sigap/pelatihan/nilai";

export type DataNilai = {
  skema: SkemaNilai;
  tersimpan: boolean;
  boleh_ubah: boolean;
  kuis: Record<string, KuisNilai>;
  /** Hanya ada bila skema memakai Kedisiplinan / Sikap (31 Okt 2026). */
  disiplin?: Record<string, number | null>;
  sikap?: Record<string, number>;
  sikap_tersedia?: boolean;
};
export type PakaiSkemaNilai = ReturnType<typeof useSkemaNilai>;

/** Ambil skema + nilai kuis. `interval` ms untuk segar otomatis (0 = sekali saja). */
export function useSkemaNilai(interval = 0) {
  const [data, setData] = useState<DataNilai | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<DataNilai>(URL_NILAI));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    muat();
    if (!interval) return;
    const t = setInterval(muat, interval);
    return () => clearInterval(t);
  }, [muat, interval]);
  const simpan = useCallback(async (skema: SkemaNilai) => {
    const d = await fetchJson<DataNilai>(URL_NILAI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "simpan_skema", skema }) });
    setData(d);
  }, []);
  /** Simpan nilai sikap (0-100, null = hapus) beberapa peserta sekaligus. */
  const simpanSikap = useCallback(async (item: { akun_id: number; nilai: number | null }[]) => {
    const d = await fetchJson<DataNilai>(URL_NILAI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "simpan_sikap", item }) });
    setData(d);
  }, []);
  return { data, galat, muat, simpan, simpanSikap };
}

const SAMA = (a: SkemaNilai, b: SkemaNilai) => JSON.stringify(kanonik(a)) === JSON.stringify(kanonik(b));

/** Panel pengaturan skema. `asal` = tempat panel dipasang (hanya untuk keterangan). */
export function PanelSkemaNilai({ nilai, asal }: { nilai: PakaiSkemaNilai; asal: "soal" | "monitoring" }) {
  const { data, galat } = nilai;
  const dasar = data?.skema ?? SKEMA_BAWAAN;
  const [draf, setDraf] = useState<SkemaNilai>(dasar);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const kunci = JSON.stringify(dasar);
  useEffect(() => {
    setDraf(dasar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  if (!data) return galat ? <Pesan jenis="galat">{galat}</Pesan> : null;
  const bisaUbah = data.boleh_ubah;
  const valid = validasiSkema(draf);
  const berubah = !SAMA(draf, dasar);
  const tam = tambahanDari(draf);
  const la = lulusAkhirDari(draf);
  const total = KOMPONEN.filter((k) => draf.pakai[k]).reduce((a, k) => a + (Number(draf.bobot[k]) || 0), 0) + KOMPONEN_TAMBAHAN.filter((k) => tam[k].pakai).reduce((a, k) => a + (Number(tam[k].bobot) || 0), 0);

  const ubahPakai = (k: (typeof KOMPONEN)[number], v: boolean) => setDraf((d) => ({ ...d, pakai: { ...d.pakai, [k]: v } }));
  const ubahBobot = (k: (typeof KOMPONEN)[number], v: string) => setDraf((d) => ({ ...d, bobot: { ...d.bobot, [k]: v === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(v)))) } }));

  const ubahPakaiTam = (k: KomponenTambahan, v: boolean) => setDraf((d) => ({ ...d, tambahan: { ...tambahanDari(d), [k]: { ...tambahanDari(d)[k], pakai: v } } }));
  const ubahBobotTam = (k: KomponenTambahan, v: string) => setDraf((d) => ({ ...d, tambahan: { ...tambahanDari(d), [k]: { ...tambahanDari(d)[k], bobot: v === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(v)))) } } }));
  const ubahLulus = (p: Partial<{ wajib: boolean; nilai: number }>) => setDraf((d) => ({ ...d, lulus_akhir: { ...lulusAkhirDari(d), ...p } }));

  async function simpan() {
    if (!valid.ok) return;
    setSibuk(true);
    setPesan(null);
    try {
      await nilai.simpan(valid.skema);
      setPesan({ jenis: "ok", teks: "Skema nilai akhir tersimpan. Monitoring, Administrasi, dan Laporan Pelatihan memakai skema ini." });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Kartu
      judul="🎯 Skema nilai akhir"
      ket={`${ringkasSkema(dasar)}${data.tersimpan ? "" : " · skema bawaan (belum disimpan)"}`}
      kanan={data.tersimpan ? <Chip w="ok">tersimpan</Chip> : <Chip w="wait">bawaan</Chip>}
    >
      <p className="mb-2 text-[12px] text-[#55657D]">
        Centang komponen yang diperhitungkan lalu isi bobotnya (total 100%). Kedisiplinan dihitung otomatis dari presensi; Sikap diisi panitia di tab Monitoring.{" "}
        {asal === "soal" ? "Pengaturan yang sama juga ada di Monitoring › Pretest & Posttest." : "Pengaturan yang sama juga ada di Soal & Jadwal."} Skema ini otomatis dipakai tab Administrasi dan Laporan Pelatihan.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {KOMPONEN.map((k) => (
          <div key={k} className={`rounded-xl border px-3 py-2 transition ${draf.pakai[k] ? "border-[#1F6FD1] bg-[#E3EEFB]" : "border-[#E3E8EE] bg-white"}`}>
            <label className="flex items-center gap-2 text-[13px] font-bold">
              <input type="checkbox" checked={draf.pakai[k]} disabled={!bisaUbah} onChange={(e) => ubahPakai(k, e.target.checked)} />
              {LABEL_KOMPONEN[k]}
            </label>
            <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#55657D]">
              Bobot
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                className={`${INPUT} w-[72px] text-right tabular-nums`}
                value={draf.pakai[k] ? String(draf.bobot[k]) : ""}
                placeholder="–"
                disabled={!bisaUbah || !draf.pakai[k]}
                onChange={(e) => ubahBobot(k, e.target.value)}
                aria-label={`Bobot ${LABEL_KOMPONEN[k]} (persen)`}
              />
              %
            </label>
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {KOMPONEN_TAMBAHAN.map((k) => (
          <div key={k} className={`rounded-xl border px-3 py-2 transition ${tam[k].pakai ? "border-[#1F6FD1] bg-[#E3EEFB]" : "border-[#E3E8EE] bg-white"}`}>
            <label className="flex items-center gap-2 text-[13px] font-bold">
              <input type="checkbox" checked={tam[k].pakai} disabled={!bisaUbah} onChange={(e) => ubahPakaiTam(k, e.target.checked)} />
              {LABEL_TAMBAHAN[k]}
            </label>
            <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#55657D]">
              Bobot
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                className={`${INPUT} w-[72px] text-right tabular-nums`}
                value={tam[k].pakai ? String(tam[k].bobot) : ""}
                placeholder="–"
                disabled={!bisaUbah || !tam[k].pakai}
                onChange={(e) => ubahBobotTam(k, e.target.value)}
                aria-label={`Bobot ${LABEL_TAMBAHAN[k]} (persen)`}
              />
              %
            </label>
            <p className="mt-1 text-[11px] leading-snug text-[#7B8794]">{KET_TAMBAHAN[k]}</p>
          </div>
        ))}
        <div className={`rounded-xl border px-3 py-2 transition ${la.wajib ? "border-[#1F6FD1] bg-[#E3EEFB]" : "border-[#E3E8EE] bg-white"}`}>
          <label className="flex items-center gap-2 text-[13px] font-bold">
            <input type="checkbox" checked={la.wajib} disabled={!bisaUbah} onChange={(e) => ubahLulus({ wajib: e.target.checked })} />
            Wajib lulus nilai akhir
          </label>
          <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#55657D]">
            Nilai akhir minimal
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="decimal"
              className={`${INPUT} w-[72px] text-right tabular-nums`}
              value={la.wajib ? String(la.nilai) : ""}
              placeholder="–"
              disabled={!bisaUbah || !la.wajib}
              onChange={(e) => ubahLulus({ nilai: e.target.value === "" ? 0 : Math.max(0, Math.min(100, Number(e.target.value))) })}
              aria-label="Nilai akhir minimal agar lulus"
            />
          </label>
          <p className="mt-1 text-[11px] leading-snug text-[#7B8794]">Berdampingan dengan wajib lulus per tes; keduanya bisa dipakai bersamaan.</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className={`flex items-center gap-1.5 text-[12.5px] ${draf.pakai.kuis ? "" : "opacity-50"}`}>
          Nilai kuis dari
          <select className={INPUT} value={draf.dasar_kuis} disabled={!bisaUbah || !draf.pakai.kuis} onChange={(e) => setDraf((d) => ({ ...d, dasar_kuis: e.target.value as DasarKuis }))}>
            {(Object.keys(LABEL_DASAR_KUIS) as DasarKuis[]).map((x) => (
              <option key={x} value={x}>{LABEL_DASAR_KUIS[x]}</option>
            ))}
          </select>
        </label>
        <span className={`text-[12.5px] font-bold tabular-nums ${total === 100 ? "text-[#1E7A4C]" : "text-[#B5352D]"}`}>Total bobot: {total}%{total === 100 ? " ✓" : " (harus 100%)"}</span>
        {bisaUbah && (
          <span className="ml-auto flex gap-1.5">
            {berubah && (
              <button type="button" className={BTN_O} onClick={() => setDraf(dasar)} disabled={sibuk}>
                Batal ubah
              </button>
            )}
            <button type="button" className={BTN_G} onClick={simpan} disabled={sibuk || !berubah || !valid.ok} title={!valid.ok ? valid.error : undefined}>
              {sibuk ? "Menyimpan…" : "Simpan skema"}
            </button>
          </span>
        )}
      </div>
      {!valid.ok && berubah && <p className="mt-1 text-[12px] text-[#B5352D]">{valid.error}</p>}
      <p className="mt-1.5 text-[11.5px] leading-snug text-[#7B8794]">
        Kuis memakai ruang Adu Sigap yang sudah selesai dan terakhir diikuti peserta. Komponen terpilih yang belum punya nilai dihitung 0 dan ditandai “belum lengkap”. Pretest/Posttest memakai skor sesi yang selesai.
        {!bisaUbah && " Anda hanya dapat melihat skema ini."}
      </p>
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}
    </Kartu>
  );
}

/** Versi mandiri (memuat datanya sendiri) -- dipasang di Soal & Jadwal. */
export function SkemaNilaiMandiri({ asal }: { asal: "soal" | "monitoring" }) {
  const nilai = useSkemaNilai(0);
  return <PanelSkemaNilai nilai={nilai} asal={asal} />;
}

/** Kolom Sikap di Monitoring: input 0-100, tersimpan saat meninggalkan kotak (kosong = hapus). */
export function InputSikap({ akunId, nilai, boleh, tersedia, simpan }: { akunId: number; nilai: number | null; boleh: boolean; tersedia: boolean; simpan: PakaiSkemaNilai["simpanSikap"] }) {
  const awal = nilai == null ? "" : String(nilai);
  const [isi, setIsi] = useState(awal);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => setIsi(awal), [awal]);
  if (!boleh || !tersedia) return <span className="tabular-nums text-[#55657D]" title={!tersedia ? "Jalankan SQL 20261031m dahulu" : undefined}>{nilai ?? "—"}</span>;
  async function kirim() {
    if (isi === awal) return;
    const v = isi.trim() === "" ? null : Number(isi);
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > 100)) {
      setGalat("0–100, bilangan bulat");
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      await simpan([{ akun_id: akunId, nilai: v }]);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      setIsi(awal);
    } finally {
      setSibuk(false);
    }
  }
  return (
    <span className="inline-flex flex-col">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        inputMode="numeric"
        className={`${INPUT} w-[64px] text-right tabular-nums`}
        value={isi}
        placeholder="–"
        disabled={sibuk}
        onChange={(e) => setIsi(e.target.value)}
        onBlur={kirim}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label="Nilai sikap (0–100)"
      />
      {galat && <span className="text-[10.5px] text-[#B5352D]">{galat}</span>}
    </span>
  );
}
