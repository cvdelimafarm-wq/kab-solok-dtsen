"use client";

// app/sigap/pelatihan/kelola/roleplayKelola.tsx
//
// (8 Nov 2026) Kelola Pelatihan > Persiapan > Vanguard: centang "Roleplay bareng kelas". Bawaan MATI; langkah 8 "Roleplaying by Vanguard", kartu Hari ini, dan layar roleplay
// baru ada bila dicentang DAN Vanguard menyala. API: /api/sigap/pelatihan/roleplay.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { Chip, Kartu, Memuat, Pesan } from "../../admin/ui";

type Keadaan = { kegiatan_id: number; aktif: boolean; vanguard_menyala: boolean; boleh_kelola: boolean; jumlah_roleplay: number };

export default function RoleplayKelola() {
  const [d, setD] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    try {
      setD(await fetchJson<Keadaan>("/api/sigap/pelatihan/roleplay"));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  async function ubah(aktif: boolean) {
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      const r = await fetchJson<Keadaan>("/api/sigap/pelatihan/roleplay", { method: "POST", body: JSON.stringify({ aktif }) });
      setD(r);
      setOk(r.aktif ? "Roleplay aktif untuk pelatihan ini." : "Roleplay dimatikan untuk pelatihan ini.");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && <Pesan jenis="ok" onTutup={() => setOk(null)}>{ok}</Pesan>}
      <Kartu judul="Roleplay bareng kelas (Vanguard)" kanan={<Chip w={d.aktif ? "ok" : "mut"}>{d.aktif ? "✓ Aktif" : "Tidak aktif"}</Chip>}>
        <p className="mb-3 text-[13px] leading-relaxed text-[#55657D]">
          Peserta mewawancarai satu responden peran di kelas, lalu semua peserta mengisi jawaban yang sama di Vanguard masing-masing (Blok IV.1, V, VI, VII). Instruktur menekan Periksa, melihat pemetaan jawaban,
          dan menandai jawaban yang benar. Poin roleplay <b>tidak masuk</b> nilai pelatihan, bintang, atau sertifikasi.
        </p>
        <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${d.aktif ? "border-[#1F5FD1] bg-[#F3F7FF]" : "border-[#DDE6F3] bg-white"}`}>
          <input type="checkbox" className="mt-1 h-5 w-5" checked={d.aktif} disabled={!d.boleh_kelola || sibuk} onChange={(e) => void ubah(e.target.checked)} />
          <span>
            <span className="block text-[13.5px] font-extrabold text-[#0F2A52]">Aktifkan Roleplaying by Vanguard di pelatihan ini</span>
            <span className="block text-[12.5px] text-[#6B7A90]">Bila tidak dicentang, langkah 8, kartu Hari ini, dan layar roleplay tidak ada. Instruktur kelas dan panitia dapat membuka dan menandai.</span>
          </span>
        </label>
        {d.aktif && !d.vanguard_menyala && <p className="mt-2 text-[12.5px] font-semibold text-[#8A4B00]">Vanguard belum menyala di pelatihan ini, jadi roleplay belum tampil. Nyalakan Vanguard di kartu di atas.</p>}
        {!d.boleh_kelola && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat. Mengubah memerlukan izin kelola pelatihan.</p>}
        {d.jumlah_roleplay > 0 && <p className="mt-2 text-[12px] text-[#6B7A90]">Sudah ada {d.jumlah_roleplay} roleplay tercatat di pelatihan ini.</p>}
      </Kartu>
    </div>
  );
}
