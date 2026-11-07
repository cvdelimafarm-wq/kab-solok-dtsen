"use client";

// app/sigap/ro/[kode]/RencanaTindakan.tsx
//
// (7 Nov 2026, langkah 2 rancangan Kebutuhan dan revisi) Rencana tindakan per butir yang Lebih atau Kurang, dengan neraca RO. Ini NIAT: tidak mengubah POK
// maupun RAB; kelak mengisi kertas kerja revisi. Disimpan langsung setiap pilihan (tabel keu_niat_butir, skema-sql/20261107c_niat_butir.sql). Hanya yang
// berwenang kek_catat (ketua tim dan admin RO) dapat mengubah; yang lain melihat pilihan saja. Logika murni di lib/keu/niat.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import {
  bacaJumlah, butuhJumlah, hitungNeraca, isiSimpan, jumlahSah, kalimatRencana, LABEL_NIAT, niatUntuk, normalisasiNiat, PENJELAS_NIAT, susunRencana, tampilJumlah,
  type BarisNiat, type BarisRencana, type Niat,
} from "@/lib/keu/niat";
import type { SelItem } from "@/lib/keu/pokTata";
import { Chip, judulKartu, kartu, kisi, Kpi, tombolAktif, tombolKecil } from "../../keu-ui";
import { tulisKeuKlien, useBacaKeu, useBoleh } from "../useKeu";

const KOLOM = ["ro_kode", "pok_kunci", "niat", "jumlah", "catatan"];

function KotakJumlah({ nilai, besar, nonaktif, idKotak, onSimpan }: { nilai: number; besar: number; nonaktif: boolean; idKotak: string; onSimpan: (n: number) => void }) {
  const [teks, setTeks] = useState(tampilJumlah(nilai));
  useEffect(() => { setTeks(tampilJumlah(nilai)); }, [nilai]);
  const selesai = () => {
    const n = bacaJumlah(teks);
    const sah = jumlahSah("lepas", n, besar).jumlah;
    setTeks(tampilJumlah(sah));
    if (sah !== nilai) onSimpan(sah);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={idKotak} className="text-[12px] font-semibold text-[#5B6B84]">Jumlah (Rp)</label>
      <input
        id={idKotak} inputMode="numeric" autoComplete="off" disabled={nonaktif} value={teks}
        onChange={(e) => setTeks(e.target.value.replace(/[^\d.]/g, ""))} onBlur={selesai} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className="box-border min-h-[40px] w-[150px] rounded-md border border-[#C5D0E2] bg-white px-2.5 text-right text-[14px] tabular-nums text-[#0F2A52] disabled:opacity-60 focus:outline-2 focus:outline-[#1F5FD1]"
      />
      <button type="button" disabled={nonaktif || nilai === besar} className={tombolKecil} onClick={() => onSimpan(besar)}>Seluruhnya ({angka(besar)})</button>
    </div>
  );
}

function BarisTindakan({ r, bisa, sibuk, onPilih, onJumlah }: { r: BarisRencana; bisa: boolean; sibuk: boolean; onPilih: (n: Niat) => void; onJumlah: (n: number) => void }) {
  const lebih = r.golongan === "lebih";
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-white p-3" aria-busy={sibuk}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-[13px] text-[#1B2B4B]"><span className="font-mono text-[#5B6B84]">{r.akun.slice(0, 6)}</span> {r.uraian}</span>
        <Chip warna={lebih ? "biru" : "merah"}>{lebih ? "Lebih" : "Kurang"} {angka(r.besar)}</Chip>
      </div>
      <div role="group" aria-label={`Rencana untuk ${r.uraian}`} className="flex flex-wrap gap-1.5">
        {niatUntuk(r.golongan).map((n) => (
          <button key={n} type="button" aria-pressed={r.niat === n} disabled={!bisa || sibuk} className={r.niat === n ? tombolAktif : tombolKecil} onClick={() => { if (r.niat !== n) onPilih(n); }}>
            {LABEL_NIAT[n]}
          </button>
        ))}
      </div>
      {butuhJumlah(r.niat) && <KotakJumlah nilai={r.jumlah} besar={r.besar} nonaktif={!bisa || sibuk} idKotak={`niat-${r.detail_id}`} onSimpan={onJumlah} />}
      <p className="m-0 text-[12px] text-[#5B6B84]">
        {PENJELAS_NIAT[r.niat]}{r.bawaan ? " (pilihan bawaan)" : ""}{r.disesuaikan ? ` Jumlah disesuaikan karena ${lebih ? "kelebihan" : "kekurangan"} butir ini berubah.` : ""}
      </p>
    </li>
  );
}

export function RencanaTindakan({ kode, item, baru }: { kode: string; item: SelItem[]; baru: number }) {
  const baca = useBacaKeu<Record<string, unknown>>(urlBaca("keu_niat_butir", { ro_kode: kode }, { batas: 2000, kolom: KOLOM }));
  const boleh = useBoleh("kek_catat", kode);
  const [lokal, setLokal] = useState<Map<string, BarisNiat>>(new Map());
  const [sibuk, setSibuk] = useState<Set<string>>(new Set());
  const [galat, setGalat] = useState<string | null>(null);

  const tersimpan = useMemo(() => normalisasiNiat(baca.baris ?? []), [baca.baris]);
  const gabung = useMemo(() => { const m = new Map(tersimpan); lokal.forEach((v, k) => m.set(k, v)); return m; }, [tersimpan, lokal]);
  const rencana = useMemo(() => susunRencana(item, gabung), [item, gabung]);
  const neraca = useMemo(() => hitungNeraca(rencana, baru), [rencana, baru]);

  const tersimpanRef = useRef(tersimpan); tersimpanRef.current = tersimpan;
  const muatRef = useRef(baca.muat); muatRef.current = baca.muat;

  const simpan = useCallback(async (r: BarisRencana, niat: Niat, jumlah: number | null) => {
    const sah = jumlahSah(niat, jumlah, r.besar).jumlah;
    const isi = isiSimpan(kode, r.kunci, niat, sah, r.catatan);
    setLokal((m) => new Map(m).set(r.kunci, { pok_kunci: r.kunci, niat, jumlah: isi.jumlah as number | null, catatan: r.catatan }));
    setSibuk((s) => new Set(s).add(r.kunci));
    setGalat(null);
    const kunci = { ro_kode: kode, pok_kunci: r.kunci };
    const { ro_kode: _a, pok_kunci: _b, ...ubah } = isi;
    const ada = tersimpanRef.current.has(r.kunci);
    let h = ada ? await tulisKeuKlien("keu_niat_butir", "update", ubah, kunci) : await tulisKeuKlien("keu_niat_butir", "insert", isi);
    if (!h.ok && !ada) h = await tulisKeuKlien("keu_niat_butir", "update", ubah, kunci); // baris sudah dibuat rekan
    if (!h.ok) setGalat(h.pesan);
    await muatRef.current();
    setLokal((m) => { const n = new Map(m); n.delete(r.kunci); return n; });
    setSibuk((s) => { const n = new Set(s); n.delete(r.kunci); return n; });
  }, [kode]);

  if (rencana.length === 0 && baru <= 0) return null;

  // tabel belum ada (SQL 20261107c belum dijalankan) = galat baca
  if (baca.galat) {
    return (
      <section className={`${kartu} flex flex-col gap-1`} aria-label="Rencana tindakan">
        <h2 className={judulKartu}>Rencana tindakan per butir</h2>
        <p className="m-0 rounded-md bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">Rencana tindakan belum dapat disimpan karena tabelnya belum tersedia di basis data (berkas 20261107c_niat_butir.sql belum dijalankan).</p>
      </section>
    );
  }

  const bisa = boleh === true;
  const warnaPagu = neraca.status === "tetap" ? "hj" : "kn";
  const kurang = rencana.filter((r) => r.golongan === "kurang");
  const lebih = rencana.filter((r) => r.golongan === "lebih");
  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-label="Rencana tindakan">
      <div className="flex flex-col gap-1">
        <h2 className={judulKartu}>Rencana tindakan per butir</h2>
        <p className="m-0 text-[12.5px] text-[#5B6B84]">
          Catatan rencana sebelum jendela revisi dibuka; tidak mengubah POK maupun RAB. Setiap pilihan tersimpan langsung dan dipakai kelak untuk mengisi kertas kerja revisi.
          {boleh === false ? " Hanya ketua tim dan admin RO yang dapat mengubah rencana." : ""}
        </p>
      </div>
      <div className={kisi}>
        <Kpi label="Dilepas (donor)" nilai={rupiah(neraca.lepas)} sub={`${angka(rencana.filter((r) => r.niat === "lepas").length)} butir`} />
        <Kpi label="Dibutuhkan sumber" nilai={rupiah(neraca.kebutuhanSumber)} sub={`tambal ${rupiah(neraca.tambal)} · tambahan ${rupiah(neraca.tambahan)}${neraca.baru > 0 ? ` · item baru ${rupiah(neraca.baru)}` : ""}`} />
        <Kpi
          label="Perubahan pagu RO" nilai={`${neraca.perubahanPagu > 0 ? "+" : ""}${rupiah(neraca.perubahanPagu)}`} warna={warnaPagu}
          sub={neraca.status === "tetap" ? "pagu RO tetap" : neraca.status === "naik" ? "pagu RO perlu naik" : "dana dilepas melebihi yang dipakai"}
        />
      </div>
      <p className="m-0 text-[13px] text-[#1B2B4B]"><span className="font-semibold">Neraca rencana: </span>{kalimatRencana(neraca)}</p>
      {galat && <p role="alert" className="m-0 rounded-md bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#9B1C23]">Tidak tersimpan: {galat}</p>}
      {kurang.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-bold text-[#0F2A52]">Butir kurang ({angka(kurang.length)})</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {kurang.map((r) => <BarisTindakan key={r.kunci} r={r} bisa={bisa} sibuk={sibuk.has(r.kunci)} onPilih={(n) => void simpan(r, n, butuhJumlah(r.niat) ? r.jumlah : null)} onJumlah={(n) => void simpan(r, r.niat, n)} />)}
          </ul>
        </div>
      )}
      {lebih.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-bold text-[#0F2A52]">Butir berlebih ({angka(lebih.length)})</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lebih.map((r) => <BarisTindakan key={r.kunci} r={r} bisa={bisa} sibuk={sibuk.has(r.kunci)} onPilih={(n) => void simpan(r, n, butuhJumlah(r.niat) ? r.jumlah : null)} onJumlah={(n) => void simpan(r, r.niat, n)} />)}
          </ul>
        </div>
      )}
      {neraca.baru > 0 && <p className="m-0 text-[12px] text-[#5B6B84]">Item baru di RAB ({rupiah(neraca.baru)}) dihitung sebagai kebutuhan sumber karena tidak punya pagu di POK.</p>}
    </section>
  );
}
