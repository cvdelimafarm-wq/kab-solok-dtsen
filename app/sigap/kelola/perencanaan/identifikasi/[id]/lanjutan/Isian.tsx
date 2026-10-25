"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/Isian.tsx
//
// (25 Okt 2026, tahap 29) Kartu isian Identifikasi lanjutan: wilayah tugas, kelas, jumlah per peran, dan daftar petugas.
// Hanya tampilan; aturan (pemeriksa, status Draf atau Final) ada di lib/keu/lanjutan.ts dan basis data.

import type { Dispatch } from "react";
import { kolom, label as kelasLabel, tombolBahaya, tombolKecil } from "@/app/sigap/keu-ui";
import { JABATAN } from "@/lib/keu/kebijakan";
import {
  idBaru, ID_LJ, KODE_PERAN, METODE_KELAS, NAMA_PERAN, NAMA_SUMBER, PAKET_KELAS, TEMPAT_KELAS, hariKelas, jumlahPetugas, pesertaKelas,
  type IsiLanjutan, type KodePeran, type Kelas, type Petugas,
} from "@/lib/keu/lanjutan";
import { daftarPeriode, type Form } from "@/lib/keu/identifikasi";
import { Angka, Bagian, Cat, Centang, FixPerk, Isian, Pilihan, Tgl } from "../../Kontrol";

export type Ubah = (fn: (g: IsiLanjutan) => void) => void;
type Props = { isi: IsiLanjutan; ubah: Ubah; mati: boolean };

const opsiKolom = (v: string, set: (s: string) => void, mati: boolean, nama: string, opsi: readonly string[], kosong = "(belum dipilih)") => (
  <select aria-label={nama} className={kolom} value={v} disabled={mati} onChange={(e) => set(e.target.value)}>
    {opsi.map((o) => <option key={o || "kosong"} value={o}>{o === "" ? kosong : o}</option>)}
  </select>
);

// ---------------------------------------------------------------------------------------------------------------------
export function KartuWilayah({ isi, ubah, mati }: Props) {
  return (
    <Bagian huruf="1" judul="Wilayah tugas" id={ID_LJ.wilayah}>
      <Isian judul="Nagari atau wilayah tujuan surat pengantar" ket="Satu nagari atau wilayah per baris. Dipakai sebagai alamat surat pengantar kegiatan ke nagari.">
        <textarea
          aria-label="Wilayah tugas" className={`${kolom} min-h-[84px] py-2`} rows={4} maxLength={2000} disabled={mati} value={isi.wilayah}
          onChange={(e) => ubah((g) => { g.wilayah = e.target.value; })}
        />
      </Isian>
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuKelas({ isi, ubah, mati, form }: Props & { form: Form | null }) {
  const periode = form ? daftarPeriode(form) : [];
  const tambah = (sesi: "briefing" | "pelatihan") => ubah((g) => {
    const id = idBaru("k", g.kelas.map((k) => k.id));
    g.kelas.push({
      id, nama: sesi === "briefing" ? "Briefing" : "Pelatihan", sesi, periode: periode[0] ?? "", metode: "", tempat: "", lokasi: "", paket: "", oh: 0, mulai: "", selesai: "",
      untuk: KODE_PERAN.filter((k) => g.peran[k].on), fix: false,
    });
  });
  return (
    <Bagian huruf="2" judul="Kelas briefing dan pelatihan" id={ID_LJ.kelas}>
      {isi.kelas.length === 0 && <Cat>Belum ada kelas. Tambahkan kelas briefing atau pelatihan; setiap kelas yang sudah pasti ditandai Fix.</Cat>}
      {isi.kelas.map((k, i) => <KelasSatu key={k.id} k={k} i={i} isi={isi} ubah={ubah} mati={mati} periode={periode} />)}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tombolKecil} disabled={mati || isi.kelas.length >= 60} onClick={() => tambah("briefing")}>+ Kelas briefing</button>
        <button type="button" className={tombolKecil} disabled={mati || isi.kelas.length >= 60} onClick={() => tambah("pelatihan")}>+ Kelas pelatihan</button>
      </div>
    </Bagian>
  );
}

function KelasSatu({ k, i, isi, ubah, mati, periode }: { k: Kelas; i: number; isi: IsiLanjutan; ubah: Ubah; mati: boolean; periode: string[] }) {
  const set = <T extends keyof Kelas>(f: T, v: Kelas[T]) => ubah((g) => { const x = g.kelas.find((e) => e.id === k.id); if (x) x[f] = v; });
  const luring = k.metode === "Luring" || k.metode === "Hybrid";
  const hotel = k.tempat === "Hotel dalam kota" || k.tempat === "Hotel luar kota";
  const hari = hariKelas(k.mulai, k.selesai);
  const peserta = pesertaKelas(isi, k);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13.5px] text-[#0F2A52]">Kelas {i + 1}</strong>
        <span className="rounded-full bg-[#EEF2F7] px-2 py-[1px] text-[11.5px] font-semibold text-[#44546F]">{k.sesi === "briefing" ? "Briefing" : "Pelatihan"}</span>
        <span className="text-[12.5px] text-[#5B6B84]">Peserta {peserta} orang{hari > 0 ? ` · ${hari} hari` : ""}</span>
        <button type="button" className={`${tombolBahaya} ml-auto`} disabled={mati} onClick={() => ubah((g) => { g.kelas = g.kelas.filter((e) => e.id !== k.id); })}>Hapus kelas</button>
      </div>
      <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        <Isian judul="Nama kelas"><input aria-label={`Nama kelas ${i + 1}`} className={kolom} maxLength={120} disabled={mati} value={k.nama} onChange={(e) => set("nama", e.target.value)} /></Isian>
        {periode.length > 0 && (
          <Isian judul="Periode">{opsiKolom(k.periode, (s) => set("periode", s), mati, `Periode kelas ${i + 1}`, ["", ...periode], "(tidak terkait periode)")}</Isian>
        )}
        <Isian judul="Metode">{opsiKolom(k.metode, (s) => set("metode", s as Kelas["metode"]), mati, `Metode kelas ${i + 1}`, METODE_KELAS)}</Isian>
        {luring && <Isian judul="Tempat">{opsiKolom(k.tempat, (s) => set("tempat", s as Kelas["tempat"]), mati, `Tempat kelas ${i + 1}`, TEMPAT_KELAS)}</Isian>}
        {luring && k.tempat !== "" && (
          <Isian judul="Nama dan alamat tempat" ket="Dipakai pada undangan.">
            <input aria-label={`Lokasi kelas ${i + 1}`} className={kolom} maxLength={200} disabled={mati} value={k.lokasi} onChange={(e) => set("lokasi", e.target.value)} />
          </Isian>
        )}
        {hotel && <Isian judul="Paket hotel">{opsiKolom(k.paket, (s) => set("paket", s as Kelas["paket"]), mati, `Paket kelas ${i + 1}`, PAKET_KELAS)}</Isian>}
        <Isian judul="Tanggal mulai"><Tgl nama={`Mulai kelas ${i + 1}`} nilai={k.mulai} mati={mati} onUbah={(v) => set("mulai", v)} /></Isian>
        <Isian judul="Tanggal selesai"><Tgl nama={`Selesai kelas ${i + 1}`} nilai={k.selesai} min={k.mulai || undefined} mati={mati} onUbah={(v) => set("selesai", v)} /></Isian>
        <Isian judul="Jumlah OH (hari)" ket="Orang-hari per peserta."><Angka nama={`OH kelas ${i + 1}`} nilai={k.oh} maks={60} mati={mati} onUbah={(v) => set("oh", v)} /></Isian>
      </div>
      <div>
        <span className={kelasLabel}>Peserta</span>
        <div className="flex flex-wrap gap-1.5">
          {KODE_PERAN.map((p) => (
            <Centang key={p} aktif={k.untuk.includes(p)} mati={mati} onUbah={() => set("untuk", k.untuk.includes(p) ? k.untuk.filter((x) => x !== p) : KODE_PERAN.filter((x) => x === p || k.untuk.includes(x)))}>{NAMA_PERAN[p]}</Centang>
          ))}
        </div>
      </div>
      <Isian judul="Kematangan kelas"><FixPerk perk={!k.fix} nama={`Kelas ${i + 1}`} mati={mati} onPilih={(perk) => set("fix", !perk)} /></Isian>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuPeran({ isi, ubah, mati }: Props) {
  return (
    <Bagian huruf="3" judul="Jumlah petugas per peran" id={ID_LJ.peran}>
      <Cat>Jumlah di sini harus sama dengan jumlah petugas bernama pada kartu berikutnya sebelum data dapat berstatus Final.</Cat>
      {KODE_PERAN.map((k) => <PeranSatu key={k} kode={k} isi={isi} ubah={ubah} mati={mati} />)}
    </Bagian>
  );
}

function PeranSatu({ kode, isi, ubah, mati }: { kode: KodePeran } & Props) {
  const x = isi.peran[kode];
  const set = <T extends keyof typeof x>(f: T, v: (typeof x)[T]) => ubah((g) => { g.peran[kode][f] = v; });
  const org = isi.petugas.filter((p) => p.peran === kode && p.status === "Organik").length;
  const mit = isi.petugas.filter((p) => p.peran === kode && p.status === "Mitra").length;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13.5px] text-[#0F2A52]">{NAMA_PERAN[kode]}</strong>
        <Centang aktif={x.on} mati={mati} onUbah={() => set("on", !x.on)}>Dipakai pada survei ini</Centang>
        {x.on && <span className="text-[12.5px] text-[#5B6B84]">Tercatat bernama: {org} organik, {mit} mitra</span>}
      </div>
      {x.on && (
        <>
          <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
            <Isian judul="Organik"><Angka nama={`Organik ${NAMA_PERAN[kode]}`} nilai={x.nOrg} maks={10000} mati={mati} onUbah={(v) => set("nOrg", v)} /></Isian>
            <Isian judul="Mitra"><Angka nama={`Mitra ${NAMA_PERAN[kode]}`} nilai={x.nMit} maks={10000} mati={mati} onUbah={(v) => set("nMit", v)} /></Isian>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Centang aktif={x.translok} mati={mati} onUbah={() => set("translok", !x.translok)}>Translok</Centang>
            <Centang aktif={x.penginapan} mati={mati} onUbah={() => set("penginapan", !x.penginapan)}>Penginapan</Centang>
          </div>
          <Isian judul="Kematangan jumlah"><FixPerk perk={!x.fix} nama={`Jumlah ${NAMA_PERAN[kode]}`} mati={mati} onPilih={(perk) => set("fix", !perk)} /></Isian>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
/** Menambah petugas "menyusul" sampai jumlahnya sama dengan angka per peran. */
export function lengkapiKerangka(g: IsiLanjutan): number {
  let n = 0;
  for (const k of KODE_PERAN) {
    const x = g.peran[k];
    if (!x.on) continue;
    for (const [status, target] of [["Organik", x.nOrg], ["Mitra", x.nMit]] as const) {
      let ada = g.petugas.filter((p) => p.peran === k && p.status === status).length;
      while (ada < target) {
        g.petugas.push({ id: idBaru("p", g.petugas.map((p) => p.id)), nama: "", menyusul: true, peran: k, status, sumber: status === "Mitra" ? "kepka" : "", baru: false, jabatan: [] });
        ada += 1; n += 1;
      }
    }
  }
  return n;
}

export function KartuPetugas({ isi, ubah, mati }: Props) {
  const j = jumlahPetugas(isi);
  return (
    <Bagian huruf="4" judul="Daftar petugas" id={ID_LJ.petugas}>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
        <span>{j.total} petugas: {j.organik} organik, {j.mitra} mitra</span>
        {j.menyusul > 0 && <span className="rounded-full bg-[#FFF4D6] px-2 py-[1px] font-semibold text-[#8A6200]">{j.menyusul} nama menyusul</span>}
        {j.baru > 0 && <span>{j.baru} petugas baru</span>}
      </div>
      <Cat>Nama yang belum diketahui cukup ditandai menyusul. Data tetap Draf sampai semua nama terisi.</Cat>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tombolKecil} disabled={mati} onClick={() => ubah((g) => { lengkapiKerangka(g); })}>Buat baris sesuai jumlah per peran</button>
        <button type="button" className={tombolKecil} disabled={mati || isi.petugas.length >= 3000} onClick={() => ubah((g) => { g.petugas.push({ id: idBaru("p", g.petugas.map((p) => p.id)), nama: "", menyusul: true, peran: "", status: "Organik", sumber: "", baru: false, jabatan: [] }); })}>+ Petugas</button>
      </div>
      {isi.petugas.length === 0 && <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada petugas.</p>}
      <div className="flex min-w-0 flex-col gap-2">
        {isi.petugas.map((p, i) => <PetugasSatu key={p.id} p={p} i={i} ubah={ubah} mati={mati} />)}
      </div>
    </Bagian>
  );
}

function PetugasSatu({ p, i, ubah, mati }: { p: Petugas; i: number; ubah: Ubah; mati: boolean }) {
  const set = (fn: (x: Petugas) => void) => ubah((g) => { const x = g.petugas.find((e) => e.id === p.id); if (x) fn(x); });
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
      <div className="grid min-w-0 items-end gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
        <Isian judul={`Nama petugas ${i + 1}`}>
          <input
            aria-label={`Nama petugas ${i + 1}`} className={kolom} maxLength={120} disabled={mati || p.menyusul} value={p.nama} placeholder={p.menyusul ? "(nama menyusul)" : ""}
            onChange={(e) => set((x) => { x.nama = e.target.value; })}
          />
        </Isian>
        <Isian judul="Peran">
          <select aria-label={`Peran petugas ${i + 1}`} className={kolom} disabled={mati} value={p.peran} onChange={(e) => set((x) => { x.peran = e.target.value as Petugas["peran"]; })}>
            <option value="">(belum dipilih)</option>
            {KODE_PERAN.map((k) => <option key={k} value={k}>{NAMA_PERAN[k]}</option>)}
          </select>
        </Isian>
        <Isian judul="Status">
          <Pilihan nama={`Status petugas ${i + 1}`} nilai={p.status} opsi={["Organik", "Mitra"] as const} mati={mati} onPilih={(v) => set((x) => { x.status = v; x.sumber = v === "Mitra" ? (x.sumber || "kepka") : ""; })} />
        </Isian>
        {p.status === "Mitra" && (
          <Isian judul="Sumber mitra">
            <select aria-label={`Sumber mitra ${i + 1}`} className={kolom} disabled={mati} value={p.sumber} onChange={(e) => set((x) => { x.sumber = e.target.value as Petugas["sumber"]; })}>
              {(["kepka", "seleksi"] as const).map((s) => <option key={s} value={s}>{NAMA_SUMBER[s]}</option>)}
            </select>
          </Isian>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Centang aktif={p.menyusul} mati={mati} onUbah={() => set((x) => { x.menyusul = !x.menyusul; if (x.menyusul) x.nama = ""; })}>Nama menyusul</Centang>
        <Centang aktif={p.baru} mati={mati} onUbah={() => set((x) => { x.baru = !x.baru; })}>Petugas baru</Centang>
        <button type="button" className={`${tombolBahaya} ml-auto`} disabled={mati} onClick={() => ubah((g) => { g.petugas = g.petugas.filter((e) => e.id !== p.id); })}>Hapus</button>
      </div>
      <div>
        <span className={kelasLabel}>Jabatan dalam tim</span>
        <div className="flex flex-wrap gap-1.5">
          {JABATAN.map((jb) => (
            <Centang key={jb.k} aktif={p.jabatan.includes(jb.k)} mati={mati} onUbah={() => set((x) => { x.jabatan = x.jabatan.includes(jb.k) ? x.jabatan.filter((y) => y !== jb.k) : JABATAN.map((q) => q.k).filter((q) => q === jb.k || x.jabatan.includes(q)); })}>{jb.nama}</Centang>
          ))}
        </div>
      </div>
    </div>
  );
}

