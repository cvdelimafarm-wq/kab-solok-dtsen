"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/TabelLanjutan.tsx
//
// (5 Nov 2026) Identifikasi lanjutan sebagai TABEL: kelas, jumlah petugas per peran, dan daftar petugas. Tiap judul kolom punya tombol saring.
// Hanya tampilan; aturan pengurangan petugas ada di lib/keu/selisihLanjutan.ts (murni, diuji):
//   * Hapus nama   = mengosongkan slot (slot tetap ada, kembali "menyusul", jabatan dilepas);
//   * Hapus alokasi = hanya pada slot kosong; mengurangi jumlah per peran satu;
//   * Mengetik jumlah per peran lebih kecil dari jumlah slot ditolak dan diarahkan ke slot.
// (6 Nov 2026) Jabatan dalam tim tidak lagi dicentang di sini: kolom Jabatan hanya menampilkan; pengaturannya ada di langkah "3 · Susunan tim kerja" (tim/page.tsx).
// Kartu isian lama (Isian.tsx: KartuKelas, KartuPeran, KartuPetugas) tetap ada; halaman ini tidak lagi memakainya.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { kolom, tombolBahaya, tombolKecil } from "@/app/sigap/keu-ui";
import {
  BEBAN_KOSONG, ID_LJ, KODE_PERAN, MAKS_SAMPEL, NAMA_PERAN, NAMA_SUMBER, SATUAN_BEBAN, awalLanjutan, bebanOrganik, hariKelas, jumlahPetugas, pesertaKelas,
  type IsiLanjutan, type SatuanBeban, type Kelas, type KodePeran, type Petugas,
} from "@/lib/keu/lanjutan";
import { daftarPeriode, type Form } from "@/lib/keu/identifikasi";
import { kelasAwal, samakanDenganAwal, tambahDariAwal, tautkanKelas } from "@/lib/keu/tautAwal";
import { cariAkunUnik, namaTerpakaiPeran, type CalonNama } from "@/lib/keu/pilihNama";
import {
  bolehTurunkanJumlah, hapusAlokasi, hapusNama, jumlahBernama, jumlahSlot, selisihDariAwal, slotKosong, teksJabatan, teksSelisihPeran, type StatusPetugas,
} from "@/lib/keu/selisihLanjutan";
import { idBaru } from "@/lib/keu/lanjutan";
import { bersihkanRibuan, tampilRibuan } from "@/lib/keu/rabPerSurvei";
import PilihNama from "../../PilihNama";
import ImporPetugas from "./ImporPetugas";
import { Bagian, Cat } from "../../Kontrol";
import { KelasSatu, lengkapiKerangka, type Ubah } from "./Isian";
import { TabelSaring, type Kol } from "../../TabelSaring";
import SelectCari from "@/app/components/SelectCari";

const Pesan = ({ children }: { children: ReactNode }) => (
  <div role="status" className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] leading-snug text-[#6B4D00]">{children}</div>
);
const Kotak = ({ aktif, onUbah, mati, nama }: { aktif: boolean; onUbah: (v: boolean) => void; mati: boolean; nama: string }) => (
  <input type="checkbox" aria-label={nama} className="h-5 w-5 accent-[#1F5FD1]" checked={aktif} disabled={mati} onChange={(e) => onUbah(e.target.checked)} />
);
const ya = (b: boolean): string => (b ? "Ya" : "Tidak");

// ---------------------------------------------------------------------------------------------------------------------
// 2. Kelas
// ---------------------------------------------------------------------------------------------------------------------
export function TabelKelas({ isi, ubah, mati, form, organik, tahun }: { isi: IsiLanjutan; ubah: Ubah; mati: boolean; form: Form | null; organik?: readonly CalonNama[] | null; tahun?: number | null }) {
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set());
  const taut = tautkanKelas(isi, form, tahun ?? null);
  const periode = form ? daftarPeriode(form) : [];
  const tambah = (sesi: "briefing" | "pelatihan") => {
    ubah((g) => {
      g.kelas.push({
        id: idBaru("k", g.kelas.map((k) => k.id)), nama: sesi === "briefing" ? "Briefing" : "Pelatihan", sesi, periode: periode[0] ?? "", metode: "", tempat: "", lokasi: "", paket: "", oh: 0,
        mulai: "", selesai: "", untuk: KODE_PERAN.filter((k) => g.peran[k].on), fix: false,
      });
    });
  };
  const alih = (id: string) => setTerbuka((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  type R = { k: Kelas; i: number };
  const data: R[] = isi.kelas.map((k, i) => ({ k, i }));
  const statusTaut = (k: Kelas): string => { const t = taut.per[k.id]; return !t ? "—" : t.status === "sesuai" ? "Sesuai awal" : t.status === "menyimpang" ? "Menyimpang" : "Tambahan"; };
  const kols: Kol<R>[] = [
    { id: "no", judul: "No", jenis: "teks", nilai: (r) => String(r.i + 1), sel: (r) => r.i + 1, kelasTd: "w-10" },
    { id: "nama", judul: "Kelas", jenis: "teks", nilai: (r) => r.k.nama, sel: (r) => <strong className="text-[#0F2A52]">{r.k.nama || "(tanpa nama)"}</strong>, kelasTd: "min-w-[150px]" },
    { id: "sesi", judul: "Sesi", jenis: "pilih", nilai: (r) => (r.k.sesi === "briefing" ? "Briefing" : "Pelatihan"), sel: (r) => (r.k.sesi === "briefing" ? "Briefing" : "Pelatihan") },
    { id: "metode", judul: "Metode", jenis: "pilih", nilai: (r) => r.k.metode || "—", sel: (r) => r.k.metode || "—" },
    { id: "tempat", judul: "Tempat", jenis: "pilih", nilai: (r) => r.k.tempat || "—", sel: (r) => r.k.tempat || "—" },
    { id: "mulai", judul: "Mulai", jenis: "teks", nilai: (r) => r.k.mulai || "—", sel: (r) => r.k.mulai || "—", kelasTd: "whitespace-nowrap" },
    { id: "selesai", judul: "Selesai", jenis: "teks", nilai: (r) => r.k.selesai || "—", sel: (r) => r.k.selesai || "—", kelasTd: "whitespace-nowrap" },
    { id: "peserta", judul: "Peserta", jenis: "teks", nilai: (r) => String(pesertaKelas(isi, r.k)), sel: (r) => pesertaKelas(isi, r.k) },
    {
      id: "awal", judul: "Terhadap awal", jenis: "pilih", nilai: (r) => statusTaut(r.k),
      sel: (r) => {
        const t = taut.per[r.k.id];
        if (!t) return "—";
        return <span className={`rounded-full px-2 py-[1px] text-[11.5px] font-semibold ${t.status === "sesuai" ? "bg-[#E3F4E8] text-[#1B7A3E]" : t.status === "menyimpang" ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#EEF2F7] text-[#44546F]"}`}>{statusTaut(r.k)}</span>;
      },
    },
    { id: "fix", judul: "Kematangan", jenis: "pilih", nilai: (r) => (r.k.fix ? "Fix" : "Perkiraan"), sel: (r) => (r.k.fix ? "Fix" : "Perkiraan") },
    {
      id: "aksi", judul: "Rincian", jenis: "pilih", nilai: (r) => (terbuka.has(r.k.id) ? "Terbuka" : "Tertutup"),
      sel: (r) => <button type="button" aria-expanded={terbuka.has(r.k.id)} className={tombolKecil} onClick={() => alih(r.k.id)}>{terbuka.has(r.k.id) ? "Tutup" : mati ? "Lihat" : "Ubah"}</button>,
      lekat: true,
    },
  ];
  return (
    <Bagian huruf="2" judul="Kelas briefing dan pelatihan" id={ID_LJ.kelas}>
      {taut.hilang.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#6B4D00]">
          <span className="font-semibold">Kelas pada identifikasi awal yang belum ada di lanjutan:</span>
          {taut.hilang.map((p) => (
            <div key={`${p.sesi}|${p.periode}`} className="flex flex-wrap items-center gap-2">
              <span>{p.nama}{p.metode ? ` · ${p.metode}` : ""}{p.mulai ? ` · ${p.mulai}` : ""}</span>
              <button type="button" className={tombolKecil} disabled={mati} onClick={() => ubah((g) => { tambahDariAwal(g, p); })}>Tambahkan dari awal</button>
            </div>
          ))}
        </div>
      )}
      <Cat>Tabel ini ringkasan tiap kelas. Klik Ubah pada satu baris untuk membuka isian lengkapnya (jadwal, tempat, peserta, instruktur, kematangan).</Cat>
      <TabelSaring
        label="Kelas briefing dan pelatihan" kols={kols} data={data} kunci={(r) => r.k.id} kosong="Belum ada kelas. Tambahkan kelas briefing atau pelatihan; setiap kelas yang sudah pasti ditandai Fix."
        bawah={(r) => !terbuka.has(r.k.id) ? null : (
          <tr><td colSpan={kols.length} className="pb-3 pt-1">
            <KelasSatu
              k={r.k} i={r.i} isi={isi} ubah={ubah} mati={mati} periode={periode} organik={organik ?? null} taut={taut.per[r.k.id] ?? null}
              onSamakan={() => { const p = form && tahun != null ? kelasAwal(form, tahun, r.k) : undefined; if (p) ubah((g) => { const x = g.kelas.find((e) => e.id === r.k.id); if (x) samakanDenganAwal(x, p); }); }}
            />
          </td></tr>
        )}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tombolKecil} disabled={mati || isi.kelas.length >= 60} onClick={() => tambah("briefing")}>+ Kelas briefing</button>
        <button type="button" className={tombolKecil} disabled={mati || isi.kelas.length >= 60} onClick={() => tambah("pelatihan")}>+ Kelas pelatihan</button>
      </div>
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Jumlah petugas per peran
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Isian jumlah yang tidak boleh turun di bawah `minimal` (jumlah slot). Ketikan sementara yang masih kurang dari minimal ditahan (mis. "2" sebelum "20");
 * nilai yang sah langsung diteruskan; saat kolom ditinggalkan dengan nilai kurang, kolom dipulihkan dan `onTolak` dipanggil.
 */
function AngkaJumlah({ nilai, minimal, mati, nama, onUbah, onTolak }: { nilai: number; minimal: number; mati: boolean; nama: string; onUbah: (v: number) => void; onTolak: (n: number) => void }) {
  const [teks, setTeks] = useState(String(nilai));
  useEffect(() => { setTeks((t) => (parseInt(t, 10) === nilai ? t : String(nilai))); }, [nilai]);
  return (
    <input
      type="number" inputMode="numeric" aria-label={nama} className={`${kolom} w-20`} min={minimal} max={10000} value={teks} disabled={mati}
      onChange={(e) => { const t = e.target.value; setTeks(t); const n = parseInt(t, 10); if (!Number.isNaN(n) && n >= minimal && n <= 10000 && n !== nilai) onUbah(n); }}
      onBlur={() => { const n = parseInt(teks, 10); if (!Number.isNaN(n) && n < minimal) onTolak(n); if (Number.isNaN(n) || n < minimal || n > 10000) setTeks(String(nilai)); }}
    />
  );
}

export function TabelPeran({ isi, ubah, mati, form, tahun }: { isi: IsiLanjutan; ubah: Ubah; mati: boolean; form: Form | null; tahun: number | null }) {
  const [tolak, setTolak] = useState<string | null>(null);
  useEffect(() => { if (mati) setTolak(null); }, [mati]);
  const selisih = useMemo(() => selisihDariAwal(isi, form, tahun), [isi, form, tahun]);
  const awal = useMemo(() => (form && tahun !== null ? awalLanjutan(form, tahun) : null), [form, tahun]);
  const set = <F extends "on" | "nOrg" | "nMit" | "translok" | "penginapan" | "fix">(kode: KodePeran, f: F, v: IsiLanjutan["peran"][KodePeran][F]) => ubah((g) => { g.peran[kode][f] = v; });
  const jumlah = (kode: KodePeran, status: StatusPetugas, nama: string) => {
    const x = isi.peran[kode];
    const f = status === "Mitra" ? "nMit" : "nOrg";
    return (
      <AngkaJumlah
        nilai={x[f]} minimal={jumlahSlot(isi, kode, status)} mati={mati || !x.on} nama={`${status} ${nama}`}
        onUbah={(v) => { setTolak(null); set(kode, f, v); }}
        onTolak={(n) => setTolak(`Jumlah ${status.toLowerCase()} ${nama} tidak dapat diturunkan ke ${n}: masih ada ${jumlahSlot(isi, kode, status)} baris petugas. Kosongkan nama pada baris yang akan dikurangi, lalu klik Hapus alokasi pada baris itu (kartu Daftar petugas).`)}
      />
    );
  };
  type R = { kode: KodePeran };
  const data: R[] = KODE_PERAN.map((kode) => ({ kode }));
  const kols: Kol<R>[] = [
    { id: "peran", judul: "Peran", jenis: "pilih", nilai: (r) => NAMA_PERAN[r.kode], sel: (r) => <strong className="text-[#0F2A52]">{NAMA_PERAN[r.kode]}</strong>, kelasTd: "min-w-[110px]" },
    { id: "on", judul: "Dipakai", jenis: "pilih", nilai: (r) => ya(isi.peran[r.kode].on), sel: (r) => <Kotak aktif={isi.peran[r.kode].on} mati={mati} nama={`${NAMA_PERAN[r.kode]} dipakai pada survei ini`} onUbah={(v) => set(r.kode, "on", v)} /> },
    { id: "org", judul: "Organik", jenis: "teks", nilai: (r) => String(isi.peran[r.kode].nOrg), sel: (r) => jumlah(r.kode, "Organik", NAMA_PERAN[r.kode]) },
    { id: "mit", judul: "Mitra", jenis: "teks", nilai: (r) => String(isi.peran[r.kode].nMit), sel: (r) => jumlah(r.kode, "Mitra", NAMA_PERAN[r.kode]) },
    {
      id: "slot", judul: "Nama terisi", jenis: "teks",
      nilai: (r) => `${jumlahBernama(isi, r.kode, "Organik")}/${jumlahSlot(isi, r.kode, "Organik")} ${jumlahBernama(isi, r.kode, "Mitra")}/${jumlahSlot(isi, r.kode, "Mitra")}`,
      sel: (r) => {
        if (!isi.peran[r.kode].on) return "—";
        const x = isi.peran[r.kode];
        const org = [jumlahBernama(isi, r.kode, "Organik"), jumlahSlot(isi, r.kode, "Organik")];
        const mit = [jumlahBernama(isi, r.kode, "Mitra"), jumlahSlot(isi, r.kode, "Mitra")];
        const beda = org[1] !== x.nOrg || mit[1] !== x.nMit;
        return <span className={beda || org[0] < org[1] || mit[0] < mit[1] ? "text-[#8A6200]" : "text-[#14653A]"} title={beda ? "Jumlah baris belum sama dengan alokasi" : undefined}>Org {org[0]}/{org[1]} · Mit {mit[0]}/{mit[1]}{beda ? " ≠" : ""}</span>;
      },
      kelasTd: "min-w-[120px]",
    },
    {
      id: "awal", judul: "Awal", jenis: "teks",
      nilai: (r) => { const a = awal?.peran[r.kode]; return a?.on ? `${a.nOrg} ${a.nMit}` : "—"; },
      sel: (r) => {
        const a = awal?.peran[r.kode]; const x = isi.peran[r.kode];
        if (!a || !a.on) return "—";
        const sama = a.nOrg === (x.on ? x.nOrg : 0) && a.nMit === (x.on ? x.nMit : 0);
        return <span>{a.nOrg} org · {a.nMit} mit {sama ? <span className="ml-1 font-semibold text-[#1B7A3E]">✓</span> : <span className="ml-1 font-semibold text-[#8A6200]">≠</span>}</span>;
      },
      kelasTd: "min-w-[110px]",
    },
    { id: "translok", judul: "Translok", jenis: "pilih", nilai: (r) => ya(isi.peran[r.kode].translok), sel: (r) => <Kotak aktif={isi.peran[r.kode].translok} mati={mati || !isi.peran[r.kode].on} nama={`Translok ${NAMA_PERAN[r.kode]}`} onUbah={(v) => set(r.kode, "translok", v)} /> },
    { id: "inap", judul: "Penginapan", jenis: "pilih", nilai: (r) => ya(isi.peran[r.kode].penginapan), sel: (r) => <Kotak aktif={isi.peran[r.kode].penginapan} mati={mati || !isi.peran[r.kode].on} nama={`Penginapan ${NAMA_PERAN[r.kode]}`} onUbah={(v) => set(r.kode, "penginapan", v)} /> },
    {
      id: "fix", judul: "Kematangan", jenis: "pilih", nilai: (r) => (isi.peran[r.kode].fix ? "Fix" : "Perkiraan"),
      sel: (r) => (
        <SelectCari aria-label={`Kematangan jumlah ${NAMA_PERAN[r.kode]}`} className={`${kolom} w-28`} disabled={mati || !isi.peran[r.kode].on} value={isi.peran[r.kode].fix ? "fix" : "perk"} onChange={(e) => set(r.kode, "fix", e.target.value === "fix")}>
          <option value="perk">≈ Perkiraan</option><option value="fix">Fix</option>
        </SelectCari>
      ),
    },
  ];
  return (
    <Bagian huruf="3" judul="Jumlah petugas per peran" id={ID_LJ.peran}>
      <Cat>Jumlah di sini harus sama dengan jumlah petugas bernama pada kartu berikutnya sebelum data dapat berstatus Final. Menaikkan jumlah menambah kebutuhan baris (klik Buat baris sesuai jumlah). Menurunkan dilakukan dari kartu Daftar petugas: kosongkan nama, lalu Hapus alokasi. Nama terisi = baris bernama / jumlah baris; Awal = jumlah pada identifikasi awal (✓ sama, ≠ berbeda).</Cat>
      {selisih.length > 0 && (
        <Pesan>
          <strong>Berbeda dari identifikasi awal (perencanaan):</strong>
          <ul className="m-0 mt-1 list-disc pl-5">{selisih.map((s) => <li key={s.kode}>{teksSelisihPeran(s)}</li>)}</ul>
          <span className="mt-1 block">Saat disimpan, Anda dapat memilih Simpan saja atau Simpan dan terapkan ke alokasi, rekrutmen, anggaran, dan pengadaan.</span>
        </Pesan>
      )}
      {tolak && <Pesan>{tolak}</Pesan>}
      <TabelSaring label="Jumlah petugas per peran" kols={kols} data={data} kunci={(r) => r.kode} />
      {(isi.peran.pml.on || isi.peran.ppl.on) && <BebanTugasBlok isi={isi} ubah={ubah} mati={mati} />}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Beban tugas lapangan (dasar volume honor PML dan PPL mitra)
// ---------------------------------------------------------------------------------------------------------------------
function AngkaBeban({ nilai, maks, mati, nama, onUbah }: { nilai: number; maks: number; mati: boolean; nama: string; onUbah: (v: number) => void }) {
  return (
    <input
      aria-label={nama} inputMode="numeric" className={`${kolom} w-28 text-right tabular-nums`} disabled={mati} placeholder="0"
      value={nilai === 0 ? "" : tampilRibuan(String(nilai))}
      onChange={(e) => { const n = parseInt(bersihkanRibuan(e.target.value, false) || "0", 10); onUbah(Math.min(maks, Number.isNaN(n) ? 0 : n)); }}
    />
  );
}

function BebanTugasBlok({ isi, ubah, mati }: { isi: IsiLanjutan; ubah: Ubah; mati: boolean }) {
  const b = isi.beban ?? BEBAN_KOSONG;
  const org = bebanOrganik(b);
  const fmt = (n: number) => tampilRibuan(String(n));
  const set = (u: Partial<typeof b>) => ubah((g) => {
    const baru = { ...(g.beban ?? BEBAN_KOSONG), ...u };
    baru.dataMitra = Math.min(baru.dataMitra, baru.sampel);
    baru.periksaMitra = Math.min(baru.periksaMitra, baru.sampel);
    g.beban = baru;
  });
  const th = "px-2 py-1.5 text-left text-[11.5px] font-bold uppercase tracking-wide text-[#44546F]";
  const td = "px-2 py-1.5 align-middle";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3" aria-label="Beban tugas lapangan">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13.5px] text-[#0F2A52]">Beban tugas lapangan</strong>
        <span className="text-[12.5px] text-[#5B6B84]">Dasar volume honor mitra PML dan PPL di RAB</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#44546F]">Satuan
          <SelectCari aria-label="Satuan beban tugas" className={`${kolom} w-28`} disabled={mati} value={b.satuan} onChange={(e) => set({ satuan: e.target.value as SatuanBeban })}>
            {SATUAN_BEBAN.map((x) => <option key={x} value={x}>{x}</option>)}
          </SelectCari>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#44546F]">Jumlah sampel
          <AngkaBeban nilai={b.sampel} maks={MAKS_SAMPEL} mati={mati} nama="Jumlah sampel" onUbah={(v) => set({ sampel: v })} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-[13px]">
          <thead><tr className="bg-[#EEF2F8]"><th scope="col" className={th}>Pekerjaan</th><th scope="col" className={`${th} text-right`}>Mitra</th><th scope="col" className={`${th} text-right`}>Organik</th><th scope="col" className={`${th} text-right`}>Total</th></tr></thead>
          <tbody>
            <tr className="border-b border-[#E6ECF5]">
              <th scope="row" className={`${td} text-left font-semibold text-[#0F2A52]`}>Didata (PPL)</th>
              <td className={`${td} text-right`}><AngkaBeban nilai={b.dataMitra} maks={b.sampel} mati={mati || b.sampel === 0} nama="Jumlah didata mitra" onUbah={(v) => set({ dataMitra: v })} /></td>
              <td className={`${td} text-right tabular-nums`}>{fmt(org.data)}</td>
              <td className={`${td} text-right font-bold tabular-nums`}>{fmt(b.sampel)}</td>
            </tr>
            <tr>
              <th scope="row" className={`${td} text-left font-semibold text-[#0F2A52]`}>Diperiksa (PML)</th>
              <td className={`${td} text-right`}><AngkaBeban nilai={b.periksaMitra} maks={b.sampel} mati={mati || b.sampel === 0} nama="Jumlah diperiksa mitra" onUbah={(v) => set({ periksaMitra: v })} /></td>
              <td className={`${td} text-right tabular-nums`}>{fmt(org.periksa)}</td>
              <td className={`${td} text-right font-bold tabular-nums`}>{fmt(b.sampel)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Cat>Bagian organik terisi otomatis (sampel dikurangi bagian mitra). Honor pendataan hanya dibayarkan ke mitra, jadi volume honor PPL mitra = didata mitra dan honor PML mitra = diperiksa mitra.</Cat>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Daftar petugas
// ---------------------------------------------------------------------------------------------------------------------
type Props = { isi: IsiLanjutan; ubah: Ubah; mati: boolean };

export function TabelPetugas({ isi, ubah, mati, organik, mitra, galatDaftar, tugasTerbit, hrefTim }: Props & {
  organik?: readonly CalonNama[] | null; mitra?: readonly CalonNama[] | null; galatDaftar?: boolean; tugasTerbit?: ReadonlySet<string>;
  /** alamat langkah "3 · Susunan tim kerja" (jabatan diatur di sana, bukan di sini) */
  hrefTim?: string;
}) {
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => { if (mati) setInfo(null); }, [mati]);
  // setelah "+ Petugas": gulir ke baris baru (paling bawah) dan arahkan kursor ke kolom namanya
  const [fokusNo, setFokusNo] = useState<number | null>(null);
  useEffect(() => {
    if (fokusNo === null || isi.petugas.length < fokusNo) return;
    const el = document.querySelector<HTMLInputElement>(`input[aria-label="Nama petugas ${fokusNo}"]`);
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); }
    setFokusNo(null);
  }, [fokusNo, isi.petugas.length]);
  const j = jumlahPetugas(isi);
  const daftarUntuk = (p: Petugas): readonly CalonNama[] => (p.status === "Mitra" ? mitra : organik) ?? [];
  const bernama = isi.petugas.filter((p) => !slotKosong(p));
  const tertaut = bernama.filter((p) => p.akun !== undefined).length;
  const bisaOtomatis = bernama.filter((p) => p.akun === undefined && cariAkunUnik(daftarUntuk(p), p.nama) !== null).length;
  const set = (id: string, fn: (x: Petugas) => void) => ubah((g) => { const x = g.petugas.find((e) => e.id === id); if (x) fn(x); });
  const terkunci = (p: Petugas): boolean => !!tugasTerbit?.has(p.id);

  const hapusNm = (p: Petugas) => {
    if (terkunci(p)) { setInfo(`Nama ${p.nama} tidak dapat dihapus: surat tugas atau SPK-nya sudah terbit. Terbitkan perubahan lewat jalur revisi surat terlebih dahulu.`); return; }
    const lepas = [...p.jabatan];
    ubah((g) => { hapusNama(g, p.id); });
    setInfo(`Nama ${p.nama} dihapus; baris kembali kosong (menyusul)${lepas.length > 0 ? ` dan jabatan ${teksJabatan(lepas)} dilepas` : ""}. Klik Hapus alokasi pada baris itu bila jumlah ${p.peran ? NAMA_PERAN[p.peran] : "petugas"} ikut dikurangi.`);
  };
  const hapusAl = (p: Petugas) => {
    const peran = p.peran ? NAMA_PERAN[p.peran] : "baris tanpa peran";
    ubah((g) => { hapusAlokasi(g, p.id); });
    setInfo(`Alokasi dihapus: ${peran} ${p.peran ? p.status.toLowerCase() : ""} berkurang satu.`.replace("  ", " "));
  };

  type R = { p: Petugas; i: number };
  const data: R[] = isi.petugas.map((p, i) => ({ p, i }));
  const kols: Kol<R>[] = [
    { id: "no", judul: "No", jenis: "teks", nilai: (r) => String(r.i + 1), sel: (r) => r.i + 1, kelasTd: "w-10" },
    {
      id: "nama", judul: "Nama petugas", jenis: "teks", nilai: (r) => (slotKosong(r.p) ? "(menyusul)" : r.p.nama),
      sel: ({ p, i }) => (
        <PilihNama
          ariaLabel={`Nama petugas ${i + 1}`} nilai={p.nama} akun={p.akun ?? null} mati={mati} placeholder="(nama menyusul)"
          calon={p.status === "Mitra" ? (mitra ?? null) : (organik ?? null)} calonLain={p.status === "Mitra" ? (organik ?? null) : (mitra ?? null)} labelLain={p.status === "Mitra" ? "Organik" : "Mitra"} terpakai={namaTerpakaiPeran(isi.petugas, p)}
          onPilih={(n, akun) => {
            if (n.trim() === "") { if (!slotKosong(p)) hapusNm(p); return; }
            if (terkunci(p) && n !== p.nama) { setInfo(`Nama ${p.nama} tidak dapat diganti: surat tugas atau SPK-nya sudah terbit.`); return; }
            set(p.id, (x) => { x.nama = n; x.menyusul = false; if (akun !== undefined) x.akun = akun; else delete x.akun; });
          }}
        />
      ),
      kelasTd: "min-w-[200px]",
    },
    {
      id: "peran", judul: "Peran", jenis: "pilih", nilai: (r) => (r.p.peran ? NAMA_PERAN[r.p.peran] : "(belum dipilih)"),
      sel: ({ p, i }) => (
        <SelectCari aria-label={`Peran petugas ${i + 1}`} className={`${kolom} min-w-[128px]`} disabled={mati} value={p.peran} onChange={(e) => set(p.id, (x) => { x.peran = e.target.value as Petugas["peran"]; })}>
          <option value="">(belum dipilih)</option>
          {KODE_PERAN.map((k) => <option key={k} value={k}>{NAMA_PERAN[k]}</option>)}
        </SelectCari>
      ),
    },
    {
      id: "status", judul: "Status", jenis: "pilih", nilai: (r) => r.p.status,
      sel: ({ p, i }) => (
        <SelectCari
          aria-label={`Status petugas ${i + 1}`} className={`${kolom} min-w-[100px]`} disabled={mati} value={p.status}
          onChange={(e) => { const v = e.target.value as Petugas["status"]; set(p.id, (x) => { if (x.status !== v) delete x.akun; x.status = v; x.sumber = v === "Mitra" ? (x.sumber || "kepka") : ""; }); }}
        >
          <option value="Organik">Organik</option><option value="Mitra">Mitra</option>
        </SelectCari>
      ),
    },
    {
      id: "sumber", judul: "Sumber mitra", jenis: "pilih", nilai: (r) => (r.p.status === "Mitra" ? NAMA_SUMBER[r.p.sumber] ?? "—" : "—"),
      sel: ({ p, i }) => p.status !== "Mitra" ? "—" : (
        <SelectCari aria-label={`Sumber mitra ${i + 1}`} className={`${kolom} min-w-[130px]`} disabled={mati} value={p.sumber} onChange={(e) => set(p.id, (x) => { x.sumber = e.target.value as Petugas["sumber"]; })}>
          {(["kepka", "seleksi"] as const).map((s) => <option key={s} value={s}>{NAMA_SUMBER[s]}</option>)}
        </SelectCari>
      ),
    },
    { id: "baru", judul: "Baru", jenis: "pilih", nilai: (r) => ya(r.p.baru), sel: ({ p, i }) => <Kotak aktif={p.baru} mati={mati || slotKosong(p)} nama={`Petugas baru ${i + 1}`} onUbah={(v) => set(p.id, (x) => { x.baru = v; })} /> },
    {
      id: "jabatan", judul: "Jabatan", jenis: "teks", nilai: (r) => teksJabatan(r.p.jabatan) || "—",
      sel: ({ p }) => (
        <div className="flex min-w-[110px] flex-wrap items-center gap-1">
          {p.jabatan.length === 0 ? <span className="text-[#5B6B84]">—</span> : (
            <span title={teksJabatan(p.jabatan)} className="rounded-full bg-[#EEF2F7] px-2 py-[1px] text-[11.5px] font-semibold text-[#44546F]">
              {teksJabatan([p.jabatan[0]]).split(" (")[0]}{p.jabatan.length > 1 ? ` +${p.jabatan.length - 1}` : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "aksi", judul: "Aksi", jenis: "pilih", nilai: (r) => (slotKosong(r.p) ? "Slot kosong" : "Slot terisi"),
      sel: (r) => {
        const { p, i } = r;
        if (slotKosong(p)) return <button type="button" className={tombolBahaya} disabled={mati} aria-label={`Hapus alokasi baris ${i + 1}`} onClick={() => hapusAl(p)}>Hapus alokasi</button>;
        return (
          <div className="flex flex-col items-start gap-1">
            <button type="button" className={tombolKecil} disabled={mati || terkunci(p)} aria-label={`Hapus nama petugas ${i + 1}`} title={terkunci(p) ? "Surat tugas atau SPK sudah terbit" : undefined} onClick={() => hapusNm(p)}>Hapus nama</button>
            {terkunci(p) && <span className="text-[11.5px] font-semibold text-[#8A6200]">ST/SPK terbit</span>}
          </div>
        );
      },
      kelasTd: "min-w-[130px]", lekat: true,
    },
  ];
  return (
    <Bagian huruf="4" judul="Daftar petugas" id={ID_LJ.petugas}>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
        <span>{j.total} baris: {j.organik} organik, {j.mitra} mitra</span>
        {j.menyusul > 0 && <span className="rounded-full bg-[#FFF4D6] px-2 py-[1px] font-semibold text-[#8A6200]">{j.menyusul} nama menyusul</span>}
        {j.baru > 0 && <span>{j.baru} petugas baru</span>}
        {bernama.length > 0 && <span className={tertaut === bernama.length ? "font-semibold text-[#1B7A3E]" : "font-semibold text-[#8A6200]"}>{tertaut} dari {bernama.length} nama tertaut ke akun</span>}
      </div>
      <Cat>Pilih nama dari daftar agar tertaut ke akun SIGAP. Hapus nama mengosongkan baris (jabatannya ikut dilepas). Jabatan dalam tim (ketua, wakil, penanggung jawab) diatur pada langkah {hrefTim ? <Link href={hrefTim} className="font-semibold text-[#1F5FD1] underline">3 · Susunan tim kerja</Link> : "3 · Susunan tim kerja"}; kolom Jabatan di sini hanya menampilkan. Hanya baris kosong yang punya tombol Hapus alokasi, yang mengurangi jumlah per peran. Data tetap Draf sampai semua nama terisi.</Cat>
      {galatDaftar && <Cat>Daftar pegawai atau mitra belum dapat dimuat, jadi nama sementara diketik bebas dan belum tertaut ke akun. Muat ulang halaman; bila tetap sama, jalankan SQL 20261102a.</Cat>}
      {info && <Pesan>{info}</Pesan>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tombolKecil} disabled={mati} onClick={() => ubah((g) => { lengkapiKerangka(g); })}>Buat baris sesuai jumlah per peran</button>
        <button type="button" className={tombolKecil} disabled={mati || bisaOtomatis === 0} onClick={() => ubah((g) => { for (const p of g.petugas) { if (slotKosong(p) || p.akun !== undefined) continue; const a = cariAkunUnik(daftarUntuk(p), p.nama); if (a !== null) p.akun = a; } })}>Tautkan otomatis nama yang cocok ({bisaOtomatis})</button>
        <ImporPetugas isi={isi} ubah={ubah} mati={mati} organik={organik} mitra={mitra} onSelesai={setInfo} />
      </div>
      <TabelSaring
        label="Daftar petugas" kols={kols} data={data} kunci={(r) => r.p.id} kosong="Belum ada petugas."
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button" className={tombolKecil} disabled={mati || isi.petugas.length >= 3000}
          onClick={() => { setFokusNo(isi.petugas.length + 1); ubah((g) => { g.petugas.push({ id: idBaru("p", g.petugas.map((p) => p.id)), nama: "", menyusul: true, peran: "", status: "Organik", sumber: "", baru: false, jabatan: [] }); }); }}
        >+ Petugas</button>
        <span className="text-[12px] text-[#5B6B84]">Baris baru ditambahkan di bagian bawah tabel.</span>
      </div>
    </Bagian>
  );
}
