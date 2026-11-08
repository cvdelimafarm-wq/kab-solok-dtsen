"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/KartuUsulanSampel.tsx
//
// (8 Nov 2026, D4) Usulan jumlah petugas per peran dan jumlah sampel (beban tugas) dari sampel kegiatan yang tertaut. Hanya USULAN: tidak menimpa apa pun
// sebelum "Terapkan"; batas beban per PPL dan jumlah PPL per PML diisi pengguna (tidak ditebak). Aturan hitung: lib/keu/usulanSampel.ts.

import { useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { kolom, tombolKecil } from "@/app/sigap/keu-ui";
import { BEBAN_KOSONG, type IsiLanjutan } from "@/lib/keu/lanjutan";
import { jumlahSlot } from "@/lib/keu/selisihLanjutan";
import { periksaParam, ringkasSumber, terapkanUsulan, usulanPeran, type SumberSampel } from "@/lib/keu/usulanSampel";
import type { Ubah } from "./Isian";

export function KartuUsulanSampel({ identId, isi, ubah, mati }: { identId: number; isi: IsiLanjutan; ubah: Ubah; mati: boolean }) {
  const [sumber, setSumber] = useState<SumberSampel | null>(null);
  useEffect(() => {
    let batal = false;
    apiPortal<SumberSampel>(`/api/sigap/keu/usulan-sampel?ident=${identId}`)
      .then((s) => { if (!batal) setSumber(s); })
      .catch(() => { if (!batal) setSumber(null); }); // usulan hanya bantuan; kegagalan tidak mengganggu isian
    return () => { batal = true; };
  }, [identId]);
  return sumber ? <PanelUsulanSampel sumber={sumber} isi={isi} ubah={ubah} mati={mati} /> : null;
}

/** Bagian tampilan dan hitungan (tanpa pengambilan data) supaya bisa diuji. */
export function PanelUsulanSampel({ sumber, isi, ubah, mati }: { sumber: SumberSampel; isi: IsiLanjutan; ubah: Ubah; mati: boolean }) {
  const [unit, setUnit] = useState("");
  const [rasio, setRasio] = useState("");
  const [beban, setBeban] = useState(true);
  const [info, setInfo] = useState<string[] | null>(null);

  const param = useMemo(() => periksaParam({ unitPerPpl: unit, pplPerPml: rasio }), [unit, rasio]);
  const ada = sumber.model !== null && sumber.unit > 0;
  const usul = useMemo(() => (ada && param.ok ? usulanPeran(sumber, param.nilai) : null), [sumber, ada, param]);

  const satuan = sumber.satuan;
  const terapkan = () => {
    if (!usul) return;
    const h = terapkanUsulan(
      { ppl: isi.peran.ppl, pml: isi.peran.pml },
      usul,
      { ppl: { org: jumlahSlot(isi, "ppl", "Organik"), mit: jumlahSlot(isi, "ppl", "Mitra") }, pml: { org: jumlahSlot(isi, "pml", "Organik"), mit: jumlahSlot(isi, "pml", "Mitra") } },
      { beban },
    );
    ubah((g) => {
      if (h.ppl) { g.peran.ppl.nOrg = h.ppl.nOrg; g.peran.ppl.nMit = h.ppl.nMit; }
      if (h.pml) { g.peran.pml.nOrg = h.pml.nOrg; g.peran.pml.nMit = h.pml.nMit; }
      if (h.sampel !== null) g.beban = { ...(g.beban ?? BEBAN_KOSONG), sampel: h.sampel, dataMitra: Math.min((g.beban ?? BEBAN_KOSONG).dataMitra, h.sampel), periksaMitra: Math.min((g.beban ?? BEBAN_KOSONG).periksaMitra, h.sampel) };
    });
    setInfo([`Usulan diterapkan: PPL ${usul.ppl}, PML ${usul.pml}${h.sampel !== null ? `, sampel ${h.sampel}` : ""}. Jumlah organik tidak diubah; selisih dengan identifikasi awal tampil di kolom Awal.`, ...h.catatan]);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#CFE0F7] bg-[#F4F8FE] p-3 text-[13px] text-[#34455F]" aria-label="Usulan dari sampel kegiatan" data-testid="usulan-sampel">
      <strong className="text-[13.5px] text-[#0F2A52]">Usulan dari sampel kegiatan</strong>
      <span>{ringkasSumber(sumber)}</span>
      {ada && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#44546F]">Batas {satuan} per PPL
              <input aria-label={`Batas ${satuan} per PPL`} inputMode="numeric" className={`${kolom} w-28 text-right tabular-nums`} placeholder="isi" value={unit} disabled={mati} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#44546F]">PPL per PML
              <input aria-label="PPL per PML" inputMode="numeric" className={`${kolom} w-28 text-right tabular-nums`} placeholder="isi" value={rasio} disabled={mati} onChange={(e) => setRasio(e.target.value)} />
            </label>
          </div>
          {(unit !== "" || rasio !== "") && !param.ok && <span className="text-[#8A6200]">{param.pesan}</span>}
          {usul && (
            <>
              <span className="font-semibold text-[#0F2A52]" data-testid="usulan-hasil">Usulan: PPL {usul.ppl}, PML {usul.pml}{usul.sampel > 0 ? `, sampel ${usul.sampel}` : ""}.</span>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" checked={beban} disabled={mati || usul.sampel === 0} onChange={(e) => setBeban(e.target.checked)} />
                Isi juga &quot;Jumlah sampel&quot; pada Beban tugas lapangan
              </label>
              <div>
                <button type="button" className={tombolKecil} disabled={mati} onClick={terapkan}>Terapkan usulan</button>
              </div>
            </>
          )}
        </>
      )}
      {info && <ul className="m-0 list-disc pl-5 text-[12.5px]">{info.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      <span className="text-[12px] text-[#5B6B84]">Sistem hanya mengusulkan. Bagian organik tidak diubah; Mitra diisi sisanya. Tekan Simpan untuk menyimpan.</span>
    </div>
  );
}
