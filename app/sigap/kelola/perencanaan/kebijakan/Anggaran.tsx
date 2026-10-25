"use client";

// app/sigap/kelola/perencanaan/kebijakan/Anggaran.tsx
//
// (25 Okt 2026, tahap 28) Kebijakan anggaran pada lembar kebijakan: 22 parameter biaya dan batas. Setiap parameter punya nilai ATURAN (batas dari peraturan
// atau juknis pusat) dan nilai KEBIJAKAN (kesepakatan rapat awal tahun; sama atau lebih ketat dari aturan). Hanya tampilan dan penyuntingan.

import { ID_BAGIAN, labelNilai, nilaiPersen, type IsiKebijakan, type Param } from "@/lib/keu/kebijakan";
import { Chip, kolom } from "@/app/sigap/keu-ui";
import { Bagian, Isian, Poin, YaTidak } from "../identifikasi/Kontrol";
import type { UbahIsi } from "./Susunan";

function IsianAngka({ nilai, onUbah, mati, nama, min, maks, bolehTanpaBatas }: {
  nilai: number | null; onUbah: (v: number | null) => void; mati: boolean; nama: string; min?: number; maks?: number; bolehTanpaBatas: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="decimal" aria-label={nama} className={kolom} value={nilai === null ? "" : nilai} min={min} max={maks} disabled={mati || nilai === null}
        placeholder={nilai === null ? "Tanpa batas" : undefined}
        onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) onUbah(n); }}
      />
      {bolehTanpaBatas && (
        <label className="flex flex-none items-center gap-1 text-[12px] text-[#44546F]">
          <input type="checkbox" className="h-4 w-4 accent-[#1F5FD1]" checked={nilai === null} disabled={mati} onChange={(e) => onUbah(e.target.checked ? null : 0)} />
          Tanpa batas
        </label>
      )}
    </div>
  );
}

function KartuParam({ isi, x, i, ubah, mati }: { isi: IsiKebijakan; x: Param; i: number; ubah: UbahIsi; mati: boolean }) {
  const set = (fn: (p: Param) => void) => ubah((d) => fn(d.param[i]));
  const aturanAngka = typeof x.aturan === "number" ? x.aturan : null;
  const min = x.arah === "min" ? aturanAngka ?? undefined : 0;
  const maks = x.arah === "min" ? undefined : aturanAngka ?? undefined;
  const turunan = x.jenis === "persen" ? nilaiPersen(isi, x.k) : null;
  const acuan = x.acuan ? isi.param.find((q) => q.k === x.acuan) : undefined;
  return (
    <div id={`kb-par-${x.k}`} className="flex scroll-mt-24 flex-col gap-2.5 rounded-lg border border-[#DCE3EE] bg-white p-3 transition-shadow">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong className="text-[14px] text-[#0F2A52]">{x.nama}</strong>
        <span className="text-[11.5px] text-[#5B6B84]">{x.jenis === "angka" ? "Angka" : x.jenis === "persen" ? "Persen dari parameter lain" : x.jenis === "rujukan" ? "Tabel rujukan" : x.jenis === "dokumen" ? "Dokumen" : "Ya atau tidak"}{x.satuan ? ` · ${x.satuan}` : ""}</span>
      </div>
      {(x.jenis === "angka" || x.jenis === "persen") && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <Isian judul="Aturan (batas peraturan atau juknis)">
            <IsianAngka nilai={x.aturan as number | null} mati={mati} nama={`Aturan ${x.nama}`} min={0} maks={x.jenis === "persen" ? 100 : undefined} bolehTanpaBatas={x.jenis === "angka"}
              onUbah={(v) => set((p) => { p.aturan = v; if (v === null) p.kebijakan = null; })} />
          </Isian>
          <Isian judul={x.arah === "min" ? "Kebijakan kantor (tidak boleh di bawah aturan)" : "Kebijakan kantor (tidak boleh melebihi aturan)"}>
            <IsianAngka nilai={x.kebijakan as number | null} mati={mati} nama={`Kebijakan ${x.nama}`} min={min} maks={x.jenis === "persen" ? Math.min(100, maks ?? 100) : maks} bolehTanpaBatas={x.aturan === null}
              onUbah={(v) => set((p) => { p.kebijakan = v; })} />
          </Isian>
          <Isian judul="Dasar aturan (pasal atau juknis)">
            <input className={kolom} aria-label={`Dasar aturan ${x.nama}`} value={x.dasar} maxLength={200} disabled={mati} placeholder="mis. juknis pusat nomor … pasal …" onChange={(e) => set((p) => { p.dasar = e.target.value; })} />
          </Isian>
        </div>
      )}
      {x.jenis === "persen" && (
        <p className="m-0 text-[12.5px] text-[#44546F]">
          Setara {turunan === null ? "(belum dapat dihitung)" : labelNilai({ ...x, jenis: "angka", satuan: "Rp" }, turunan)}
          {acuan ? ` dari ${acuan.nama.toLowerCase()} (nilai kebijakan)` : ""}{x.riil ? ", ditambah biaya riil (at cost) yang dibuktikan bukti pengeluaran" : ""}.
        </p>
      )}
      {x.jenis === "yatidak" && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <Isian judul="Aturan">
            <YaTidak nama={`Aturan ${x.nama}`} nilai={x.aturan === true} mati={mati} onPilih={(v) => set((p) => { p.aturan = v; if (!v) p.kebijakan = false; })} />
          </Isian>
          <Isian judul="Kebijakan kantor (tidak boleh lebih longgar dari aturan)">
            <YaTidak nama={`Kebijakan ${x.nama}`} nilai={x.kebijakan === true} mati={mati || x.aturan === false} onPilih={(v) => set((p) => { p.kebijakan = v; })} />
          </Isian>
          <Isian judul="Dasar aturan (pasal atau juknis)">
            <input className={kolom} aria-label={`Dasar aturan ${x.nama}`} value={x.dasar} maxLength={200} disabled={mati} onChange={(e) => set((p) => { p.dasar = e.target.value; })} />
          </Isian>
        </div>
      )}
      {x.jenis === "rujukan" && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
          <Chip warna={x.berkas ? "hijau" : "kuning"}>{x.berkas ? `Tabel terunggah: ${x.berkas}` : "Tabel rujukan belum diunggah"}</Chip>
          <span>Rujukan: {x.rujukan}. Pengunggahan tabel menyusul sesudah berkasnya tersedia.</span>
        </div>
      )}
      {x.jenis === "dokumen" && (
        <Isian judul="Rujukan teks (tidak dihitung otomatis)">
          <input className={kolom} aria-label={`Rujukan ${x.nama}`} value={x.teks ?? ""} maxLength={200} disabled={mati} onChange={(e) => set((p) => { p.teks = e.target.value; })} />
        </Isian>
      )}
      {x.ket && <p className="m-0 text-[12px] leading-snug text-[#5B6B84]">{x.ket}</p>}
    </div>
  );
}

export function Anggaran({ isi, ubah, mati }: { isi: IsiKebijakan; ubah: UbahIsi; mati: boolean }) {
  const grup: string[] = [];
  for (const x of isi.param) if (!grup.includes(x.grup)) grup.push(x.grup);
  return (
    <Bagian huruf="E" judul="Kebijakan anggaran" gsbpm="22 parameter biaya dan batas" id={ID_BAGIAN.anggaran}>
      <Poin butir={[
        "Aturan adalah batas atas dari peraturan atau juknis pusat; melampauinya memicu peringatan keras (temuan Gap dan notifikasi PPK) pada tahap berikutnya.",
        "Kebijakan adalah kesepakatan rapat awal tahun: sama dengan atau lebih ketat dari aturan, tidak boleh melebihinya.",
        "Angka awal dari Excel dianggap batas aturan dan nilai kebijakan awal disamakan; rapat boleh menurunkannya.",
        "Dasar aturan (pasal atau juknis) diisi PPK; parameter bertanda “belum mencantumkan dasar” tetap dapat disahkan.",
        "Tabel rujukan (SBM penginapan, paket fullday/fullboard, matriks SK transport) diunggah menyusul bila berkasnya sudah tersedia.",
      ]} />
      {grup.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">{g}</h3>
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            {isi.param.map((x, i) => (x.grup === g ? <KartuParam key={x.k} isi={isi} x={x} i={i} ubah={ubah} mati={mati} /> : null))}
          </div>
        </div>
      ))}
    </Bagian>
  );
}
