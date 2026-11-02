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
import { PILIHAN_VANGUARD, pilihanDari, teksSumberVanguard, type KeadaanVanguardKelola, type PilihanVanguard } from "@/lib/vanguardPelatihan";

export default function VanguardKelola() {
  const [d, setD] = useState<KeadaanVanguardKelola | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pilih, setPilih] = useState<PilihanVanguard>("ikut");
  const [sibuk, setSibuk] = useState(false);
  const [dari, setDari] = useState("/");

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<KeadaanVanguardKelola>("/api/sigap/pelatihan/vanguard");
      setD(r);
      setPilih(pilihanDari(r.centang));
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
            Di dasbor: skor dan kesalahan per peserta, level yang dibuka, jadwal buka/tutup, maksimal percobaan, dan mode latihan/ujian. Aturan &quot;wajib 3 hari berturut-turut&quot; yang mengunci Pretest belum aktif (masih rancangan).
          </p>
        )}
      </Kartu>
    </div>
  );
}
