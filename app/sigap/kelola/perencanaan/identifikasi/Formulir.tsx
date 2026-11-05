"use client";

// app/sigap/kelola/perencanaan/identifikasi/Formulir.tsx
//
// (25 Okt 2026) Formulir Identifikasi survei, bagian A-E (dari mockup Version 7; 28 Okt 2026 Instrumen pendataan digabung ke A). Murni tampilan terkendali: seluruh perhitungan memakai
// lib/keu/identifikasi.ts. `mati` = formulir terkunci (menunggu persetujuan, sudah sah, atau akun tanpa hak menyusun).

import { useMemo, useState } from "react";
import { kisi, kolom, tombolKecil } from "@/app/sigap/keu-ui";
import {
  JENIS_PERIODE,
  NAMA_BULAN,
  NAMA_PERIODE,
  PANJANG_PERIODE,
  adaPendataan,
  adaPeriode,
  adalahAdhoc,
  daftarPeriode,
  hitungJadwal,
  jendelaPeriode,
  jendelaPola,
  kecualiAktif,
  ringkasPetugas,
  selisihHari,
  tglIndo,
  type Form,
  type Instrumen,
} from "@/lib/keu/identifikasi";
import { Angka, Bagian, Cat, Centang, FixPerk, Isian, Pilihan, Tgl, TglRentang, YaTidak } from "./Kontrol";
import { BarisRelatif } from "./Relatif";
import { TabelJadwalTahap, TabelPeran, TabelRapat, TabelSesi, KartuHonorTim, type BarisTahap } from "./TabelAwal";
import { mingguDariTanggal, mingguKe, namaBulan, namaHari, akhirBulanDari, polaDariTanggal, tanggalLengkap } from "@/lib/keu/waktu";
import { keteranganHari } from "@/lib/keu/tanggalDurasi";

export type OpsiRujukan = { nama: string; ro: string; sah: boolean };
export type PropsFormulir = {
  f: Form;
  ubah: (fn: (g: Form) => void) => void;
  tahun: number;
  mati: boolean;
  pa: string;
  setPa: (p: string) => void;
  rujukan: OpsiRujukan[];
};


export default function Formulir(p: PropsFormulir) {
  const { f, ubah, tahun, mati, pa, setPa, rujukan } = p;
  const lst = daftarPeriode(f);
  const paSah = lst.includes(pa) ? pa : lst[0];
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <BagianA f={f} ubah={ubah} tahun={tahun} mati={mati} pa={paSah} setPa={setPa} lst={lst} />
      <BagianB f={f} ubah={ubah} tahun={tahun} mati={mati} pa={paSah} rujukan={rujukan} />
      <BagianC f={f} ubah={ubah} tahun={tahun} mati={mati} pa={paSah} />
      <BagianE f={f} ubah={ubah} mati={mati} />
      <BagianFGH f={f} ubah={ubah} mati={mati} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A. Survei dan jadwal
// ---------------------------------------------------------------------------------------------------------------------
const pilihSel = "box-border min-h-[40px] rounded-md border border-[#C5D0E2] bg-white px-2 text-[13.5px] font-semibold text-[#0F2A52] focus:outline-2 focus:outline-[#1F5FD1] disabled:opacity-60";
const ringkasHasil = (x: { mulai: string; selesai: string } | undefined): string => (x && x.mulai ? `${tglIndo(x.mulai)} s.d. ${tglIndo(x.selesai)}${keteranganHari(x.mulai, x.selesai)}` : "Belum dapat dihitung");

function BagianA({ f, ubah, tahun, mati, pa, setPa, lst }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati"> & { pa: string; setPa: (p: string) => void; lst: string[] }) {
  const pend = adaPendataan(f);
  const adaKe = adaPeriode(f);
  const opsKe = NAMA_PERIODE[f.periode];
  const LEN = PANJANG_PERIODE[f.periode];
  const first = lst[0];
  const banyak = lst.length > 1;
  const J = f.jend;
  const [modeIsi, setModeIsi] = useState<{ mulai: "Tanggal" | "Minggu"; selesai: "Tanggal" | "Minggu" }>({ mulai: "Tanggal", selesai: "Tanggal" });
  const [salahTgl, setSalahTgl] = useState<{ mulai: string; selesai: string }>({ mulai: "", selesai: "" });
  const jp = useMemo(() => hitungJadwal(f, pa, tahun), [f, pa, tahun]);

  const setJend = (patch: Partial<Form["jend"]>) => ubah((g) => { Object.assign(g.jend, patch); });
  const semua = opsKe.length > 0 && f.keList.length === opsKe.length;
  const bulanTeks = (off: number) => {
    const awal = NAMA_PERIODE[f.periode].indexOf(first) * LEN;
    const nm = first && awal >= 0 ? NAMA_BULAN[(awal + off) % 12] : "";
    const contoh = nm ? ` (${nm} untuk ${first})` : "";
    if (LEN === 1) return (off === 0 ? "bulan periode" : `${off} bulan setelah periode`) + contoh;
    return (off < LEN ? `bulan ke-${off + 1} periode` : `${off - LEN + 1} bulan setelah periode`) + contoh;
  };
  const PRESET: [string, Partial<Form["jend"]>][] = [];
  if (LEN !== 12) {
    if (LEN === 1) PRESET.push(["7 hari terakhir bulan periode", { mb: 0, mj: "akhir", mn: 7, sb: 0, sj: "akhir", sn: 0 }]);
    PRESET.push([LEN === 1 ? "Tanggal 1–15 bulan periode" : "Tanggal 1–15 bulan pertama periode", { mb: 0, mj: "tgl", mn: 1, sb: 0, sj: "tgl", sn: 15 }]);
    PRESET.push(["Tanggal 1–15 bulan setelah periode", { mb: LEN, mj: "tgl", mn: 1, sb: LEN, sj: "tgl", sn: 15 }]);
    PRESET.push([LEN === 1 ? "Seluruh bulan periode" : "Seluruh bulan terakhir periode", { mb: LEN - 1, mj: "tgl", mn: 1, sb: LEN - 1, sj: "akhir", sn: 0 }]);
    PRESET.push([LEN === 1 ? "Seluruh bulan berikutnya" : "Seluruh periode berikutnya", { mb: LEN, mj: "tgl", mn: 1, sb: 2 * LEN - 1, sj: "akhir", sn: 0 }]);
  }
  // (2 Nov 2026) "Tanpa pola": tiap periode yang dicentang diberi jadwal sendiri (lewat mekanisme pengecualian), jadi tanggal bebas diisi tanpa terikat pola bulan ke-n.
  const ALASAN_TANPA_POLA = "Tanpa pola: jadwal tiap periode diisi sendiri.";
  const tanpaPola = adaKe && lst.length > 0 && lst.every((P) => !!kecualiAktif(f, P));
  const adaKecuali = adaKe && lst.some((P) => !!kecualiAktif(f, P));
  const aturTanpaPola = () => ubah((g) => {
    if (tanpaPola) { for (const P of lst) delete g.kecuali[P]; return; }
    for (const P of lst) {
      if (g.kecuali[P]?.on) continue;
      const w = jendelaPola(f, P, tahun);
      g.kecuali[P] = { on: true, mulai: w.mulai, selesai: w.selesai, alasan: ALASAN_TANPA_POLA, perk: false };
    }
  });
  const samaPola = (q: Partial<Form["jend"]>) => J.mb === q.mb && J.sb === q.sb && J.mj === q.mj && J.sj === q.sj && J.mn === q.mn && (J.sj === "akhir" || J.sn === q.sn);

  const gantiJenis = (jenis: Form["periode"]) => ubah((g) => {
    g.periode = jenis;
    g.keList = NAMA_PERIODE[jenis].length ? [NAMA_PERIODE[jenis][0]] : [];
    for (const k of Object.keys(g.kecuali)) if (!g.keList.includes(k)) delete g.kecuali[k];
  });
  const togglePeriode = (l: string) => ubah((g) => {
    const s = g.keList.includes(l) ? g.keList.filter((x) => x !== l) : [...g.keList, l];
    g.keList = NAMA_PERIODE[g.periode].filter((x) => s.includes(x));
    for (const k of Object.keys(g.kecuali)) if (!g.keList.includes(k)) delete g.kecuali[k];
  });
  const setRel = (k: "updating" | "pengolahan" | "pasca" | "diseminasi", patch: Partial<Form["rel"]["updating"]>) => ubah((g) => { Object.assign(g.rel[k], patch); });

  // Jadwal dasar (pola jendela bila ada periode, atau jadwal tunggal): dipakai Pendataan, atau Pengolahan bila tanpa pendataan.
  const wPola = jendelaPeriode(f, pa, tahun);
  const barisPola = (sisi: "mulai" | "selesai") => {
    const m = sisi === "mulai";
    // (2 Nov 2026) Bila periode acuan memakai pengecualian ("Tanpa pola" atau tanggal di luar pola), semua isian di sini mengubah pengecualian itu
    // (tanggal mutlak). Pilihan "akhir bulan" milik pola jadi tidak berlaku, supaya tidak ada dua sumber yang saling bertentangan.
    const kcF = first ? kecualiAktif(f, first) : null;
    const akhir = !kcF && (m ? J.mj : J.sj) === "akhir";
    const bln = m ? J.mb : J.sb;
    const n = m ? J.mn : J.sn;
    const awal = first ? NAMA_PERIODE[f.periode].indexOf(first) * LEN : -1;
    const ac = first ? jendelaPeriode(f, first, tahun) : null;
    const tglAcuan = ac ? (m ? ac.mulai : ac.selesai) : "";
    const mg = mingguDariTanggal(tglAcuan);
    const mode = modeIsi[sisi];
    // Tanggal kalender pada periode acuan diterjemahkan menjadi pola (bulan ke-n periode + hari) yang berlaku untuk semua periode.
    // (2 Nov 2026) Tanggal di luar jangkauan pola (sebelum awal periode atau lebih dari 25 bulan sesudahnya) TIDAK ditolak: hanya diberi peringatan,
    // lalu disimpan sebagai jadwal khusus periode acuan (pengecualian dengan tanggal mutlak) karena improvisasi sepanjang tahun lazim terjadi.
    // Bila periode acuan sudah memakai pengecualian (mis. "Tanpa pola"), tanggal selalu langsung mengisi pengecualian itu.
    const pasang = (d: string) => {
      const p = polaDariTanggal(d, awal, tahun);
      const kc = first ? kecualiAktif(f, first) : null;
      if (p && !kc) {
        setSalahTgl((x) => ({ ...x, [sisi]: "" }));
        setJend(m ? { mb: p.bulanKe, mj: "tgl", mn: p.hari } : { sb: p.bulanKe, sj: "tgl", sn: p.hari });
        return;
      }
      if (!first || !tanggalLengkap(d)) return;
      setSalahTgl((x) => ({ ...x, [sisi]: kc ? "" : `Peringatan: tanggal ini di luar jangkauan pola (awal periode ${first} sampai 25 bulan sesudahnya), jadi disimpan sebagai jadwal khusus ${first}. Pastikan sudah benar; bisa dikembalikan lewat "Kembali ke pola".` }));
      ubah((g) => {
        const w = jendelaPeriode(f, first, tahun);
        const e = g.kecuali[first]?.on ? g.kecuali[first] : { on: true, mulai: w.mulai, selesai: w.selesai, alasan: "", perk: false };
        e[m ? "mulai" : "selesai"] = d;
        if (!String(e.alasan || "").trim()) e.alasan = "Di luar jangkauan pola; jadwal diisi manual.";
        g.kecuali[first] = e;
      });
    };
    const pasangMinggu = (b: number, k: number) => { const w = mingguKe(tahun, b, k); pasang(m ? w.mulai : w.selesai); };
    const namaBln = (off: number) => { const t = awal + off; return `${NAMA_BULAN[t % 12]}${t >= 12 ? ` ${tahun + Math.floor(t / 12)}` : ""}`; };
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-[#E3E9F2] bg-[#FAFBFD] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-[13px] font-bold text-[#0F2A52]">{m ? "Mulai" : "Selesai"}</span>
          {!akhir && <Pilihan nama={`Cara mengisi ${sisi}`} nilai={mode} opsi={["Tanggal", "Minggu"] as const} mati={mati} onPilih={(v) => setModeIsi((x) => ({ ...x, [sisi]: v }))} />}
          {kcF ? (!m && tglAcuan && <button type="button" disabled={mati} className={tombolKecil} onClick={() => pasang(akhirBulanDari(tglAcuan))}>Pindah ke akhir bulan</button>) : <Centang aktif={akhir} mati={mati} onUbah={() => setJend(m ? (akhir ? { mj: "tgl", mn: 1 } : { mj: "akhir", mn: 7 }) : (akhir ? { sj: "tgl", sn: 15 } : { sj: "akhir", sn: 0 }))}>{m ? "Hitung dari akhir bulan" : "Akhir bulan"}</Centang>}
        </div>
        {akhir ? (
          <div className="flex flex-wrap items-center gap-2">
            {m && <><div className="w-[84px]"><Angka nama="Jumlah hari terakhir" nilai={n} min={1} maks={31} mati={mati} onUbah={(v) => setJend({ mn: v })} /></div><span className="text-[13px] text-[#44546F]">hari terakhir</span></>}
            <span className="text-[13px] text-[#44546F]">bulan</span>
            <select aria-label={`Bulan ${sisi}`} className={pilihSel} value={bln} disabled={mati} onChange={(e) => setJend(m ? { mb: Number(e.target.value) } : { sb: Number(e.target.value) })}>
              {Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{awal >= 0 ? namaBln(i) : `bulan ke-${i + 1}`}</option>)}
            </select>
          </div>
        ) : mode === "Tanggal" ? (
          <div className="w-[200px]"><Tgl nama={`Tanggal ${sisi} (periode acuan ${first})`} nilai={tglAcuan} mati={mati} onUbah={(v) => { if (v) pasang(v); }} /></div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={`Bulan ${sisi}`} className={pilihSel} value={mg ? mg.bulan : ""} disabled={mati} onChange={(e) => pasangMinggu(Number(e.target.value), mg?.minggu ?? 1)}>
              {!mg && <option value="">Pilih bulan…</option>}
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{namaBulan(i)}</option>)}
            </select>
            <select aria-label={`Minggu ke- ${sisi}`} className={pilihSel} value={mg ? mg.minggu : 1} disabled={mati || !mg} onChange={(e) => mg && pasangMinggu(mg.bulan, Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>Minggu ke-{k}</option>)}
            </select>
          </div>
        )}
        {salahTgl[sisi] && <span role="status" className="rounded-md border border-[#F2D58A] bg-[#FFF8E6] px-2 py-1 text-[12px] font-semibold text-[#8A5A00]">{salahTgl[sisi]}</span>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md border border-[#CFE6D8] bg-white px-2 py-1 text-[12.5px] font-bold text-[#14653A]">→ {tglIndo(m ? wPola.mulai : wPola.selesai)}{banyak ? ` (${pa})` : ""}</span>
          <span className="text-[12px] text-[#5B6B84]">
            {akhir ? bulanTeks(bln)
              : mode === "Tanggal" ? (mg ? `${namaHari(tglAcuan)}, setara minggu ke-${mg.minggu} ${namaBulan(mg.bulan)}` : "")
              : `${m ? "Senin" : "Jumat"}, ${tglIndo(tglAcuan)}`}
          </span>
        </div>
      </div>
    );
  };
  const dasar = adaKe ? (
    <div className="flex flex-col gap-3">
      {(PRESET.length > 0 || adaKe) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-[#44546F]">Pola umum (ketuk untuk mengisi otomatis):</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pola umum">
            {PRESET.map(([l, q]) => (
              <button key={l} type="button" disabled={mati} aria-pressed={!tanpaPola && samaPola(q)} onClick={() => { if (tanpaPola) aturTanpaPola(); setJend(q); }}
                className={`min-h-[40px] rounded-md border px-3 text-[13px] font-semibold ${!tanpaPola && samaPola(q) ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}>{l}</button>
            ))}
            <button type="button" disabled={mati} aria-pressed={tanpaPola} onClick={aturTanpaPola}
              className={`min-h-[40px] rounded-md border px-3 text-[13px] font-semibold ${tanpaPola ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}>Tanpa pola (isi tanggal tiap periode sendiri)</button>
          </div>
        </div>
      )}
      {banyak && <span className="text-[12.5px] text-[#44546F]">Isi tanggal untuk periode acuan <b>{first}</b>. Periode lain memakai pola yang sama (bulan ke-n sejak awal periode, tanggal yang sama).</span>}
      {barisPola("mulai")}
      {barisPola("selesai")}
      <ul className="m-0 list-none space-y-0.5 p-0 text-[12.5px] text-[#44546F]" aria-label="Hasil pola tiap periode">
        {lst.slice(0, 4).map((P) => { const w = jendelaPeriode(f, P, tahun); return <li key={P}>{P}{kecualiAktif(f, P) ? " (jadwal khusus)" : ""}: {tglIndo(w.mulai)} s.d. {tglIndo(w.selesai)}{keteranganHari(w.mulai, w.selesai)}</li>; })}
        {lst.length > 4 && <li>… dan {lst.length - 4} periode lain</li>}
      </ul>
    </div>
  ) : (
    <div className={kisi}>
      <TglRentang nama="Jadwal" judulMulai="Mulai" judulSelesai="Selesai" mulai={f.tunggal.mulai} selesai={f.tunggal.selesai} mati={mati} onUbah={(r) => ubah((g) => { g.tunggal.mulai = r.mulai; g.tunggal.selesai = r.selesai; })} />
    </div>
  );

  // (5 Nov 2026) Jadwal tahap sebagai tabel: tiap tahap satu baris; isian lengkapnya dibuka lewat tombol Ubah pada baris.
  const barisTahap: BarisTahap[] = [];
  if (pend) {
    barisTahap.push({
      id: "tahap-updating", no: 1, nama: "Updating", acuan: "Pendataan lapangan", aktif: f.adaUpdating, bolehTiada: true,
      onAda: () => ubah((g) => { g.adaUpdating = !g.adaUpdating; }),
      mulai: jp.updating?.mulai, selesai: jp.updating?.selesai, perkEfektif: !!jp.updating?.perk, perkSendiri: f.rel.updating.perk, onPerk: (v) => setRel("updating", { perk: v }),
      isi: <BarisRelatif tahap="Updating" acuan="pendataan" rel={f.rel.updating} mulai={jp.updating?.mulai} selesai={jp.updating?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("updating", p)} />,
    });
    barisTahap.push({
      id: "tahap-pendataan", no: 2, nama: "Pendataan lapangan", acuan: adaKe ? "Pola jendela periode" : "Jadwal tunggal", aktif: true,
      mulai: jp.pendataan?.mulai, selesai: jp.pendataan?.selesai, perkEfektif: !!jp.pendataan?.perk, perkSendiri: adaKe ? !!J.perk : !!f.tunggal.perk,
      onPerk: (v) => (adaKe ? setJend({ perk: v }) : ubah((g) => { g.tunggal.perk = v; })),
      catatan: adaKe ? (kecualiAktif(f, pa) ? "Periode ini memakai pengecualian (lihat bagian Pengecualian di bawah)." : "Mengikuti pola jendela di bawah, berlaku untuk semua periode yang dicentang.") : undefined,
      isi: dasar,
    });
  }
  barisTahap.push({
    id: "tahap-pengolahan", no: pend ? 3 : 1, nama: "Pengolahan", acuan: pend ? "Pendataan lapangan" : "Jadwal dasar", aktif: true,
    mulai: jp.pengolahan?.mulai, selesai: jp.pengolahan?.selesai, perkEfektif: !!jp.pengolahan?.perk, perkSendiri: pend ? f.rel.pengolahan.perk : adaKe ? !!J.perk : !!f.tunggal.perk,
    onPerk: (v) => (pend ? setRel("pengolahan", { perk: v }) : adaKe ? setJend({ perk: v }) : ubah((g) => { g.tunggal.perk = v; })),
    catatan: pend ? "Bawaannya sama dengan jadwal pendataan (0 hari dari mulai dan selesai pendataan). Ubah selisihnya bila pengolahan berbeda." : "Tanpa pendataan: pengolahan memakai jadwal dasar di bawah.",
    isi: pend ? (
      <>
        <BarisRelatif tahap="Pengolahan" acuan="pendataan" rel={f.rel.pengolahan} mulai={jp.pengolahan?.mulai} selesai={jp.pengolahan?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("pengolahan", p)} />
        <div><button type="button" className={tombolKecil} disabled={mati} onClick={() => setRel("pengolahan", { aM: "mulai", dM: 0, aS: "selesai", dS: 0 })}>Samakan dengan jadwal pendataan</button></div>
      </>
    ) : dasar,
  });
  barisTahap.push({
    id: "tahap-pasca", no: pend ? 4 : 2, nama: "Pasca pengolahan", acuan: "Pengolahan", aktif: true,
    mulai: jp.pasca?.mulai, selesai: jp.pasca?.selesai, perkEfektif: !!jp.pasca?.perk, perkSendiri: f.rel.pasca.perk, onPerk: (v) => setRel("pasca", { perk: v }),
    isi: <BarisRelatif tahap="Pasca pengolahan" acuan="pengolahan" rel={f.rel.pasca} mulai={jp.pasca?.mulai} selesai={jp.pasca?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("pasca", p)} />,
  });
  barisTahap.push({
    id: "tahap-diseminasi", no: pend ? 5 : 3, nama: "Diseminasi", acuan: "Pasca pengolahan", aktif: f.adaDiseminasi, bolehTiada: true,
    onAda: () => ubah((g) => { g.adaDiseminasi = !g.adaDiseminasi; }),
    mulai: jp.diseminasi?.mulai, selesai: jp.diseminasi?.selesai, perkEfektif: !!jp.diseminasi?.perk, perkSendiri: f.rel.diseminasi.perk, onPerk: (v) => setRel("diseminasi", { perk: v }),
    isi: <BarisRelatif tahap="Diseminasi" acuan="pasca pengolahan" rel={f.rel.diseminasi} mulai={jp.diseminasi?.mulai} selesai={jp.diseminasi?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("diseminasi", p)} />,
  });

  return (
    <Bagian huruf="A" judul="Survei dan jadwal" gsbpm="GSBPM Manajemen" id="bagian-a">
      <Isian judul="Nama survei">
        <input className={kolom} value={f.nama} maxLength={150} disabled={mati} onChange={(e) => ubah((g) => { g.nama = e.target.value; })} placeholder="mis. Seruti Triwulan I 2026" />
      </Isian>

      <Isian judul="Jenis periode" ket={f.periode === "Ad-hoc" ? "Ad-hoc: satu periode dalam setahun, jendela pendataan diisi seperti Tahunan (bulan ke-berapa dan tanggal berapa). Cocok untuk kegiatan yang tidak berulang." : undefined}>
        <Pilihan nama="Jenis periode" nilai={f.periode} opsi={JENIS_PERIODE} mati={mati} onPilih={gantiJenis} />
      </Isian>

      {adaKe && opsKe.length > 1 && (
        <Isian judul="Periode yang diidentifikasi">
          <div className="flex flex-wrap gap-1.5">
            {opsKe.map((l) => <Centang key={l} aktif={f.keList.includes(l)} mati={mati} onUbah={() => togglePeriode(l)}>{l}</Centang>)}
            <button type="button" className={tombolKecil} disabled={mati} onClick={() => ubah((g) => { g.keList = semua ? [] : NAMA_PERIODE[g.periode].slice(); })}>{semua ? "Hapus semua centang" : "Centang semua"}</button>
          </div>
        </Isian>
      )}

      <KartuInstrumen f={f} ubah={ubah} mati={mati} />

      <div id="jadwal-tahap" className="scroll-mt-20 flex flex-col gap-3 rounded-xl border border-[#C5D0E2] bg-white p-3">
        <div>
          <h3 className="m-0 text-[15px] font-extrabold text-[#0F2A52]">Jadwal tahap kegiatan{banyak ? ` · ${pa}` : ""}</h3>
          <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#44546F]">Isi dari atas ke bawah. Tahap sesudah pendataan dihitung dari tahap sebelumnya, jadi cukup atur selisih harinya. Semua tanggal bawaannya <b>Perkiraan</b>; pilih <b>Fix</b> bila sudah pasti.</p>
        </div>

        {banyak && (
          <div role="tablist" aria-label="Periode yang dipratinjau" className="flex flex-wrap gap-1.5">
            {lst.map((P) => (
              <button key={P} type="button" role="tab" aria-selected={P === pa} onClick={() => setPa(P)}
                className={`min-h-[40px] rounded-md border px-3 text-[13px] font-semibold ${P === pa ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}>{P}</button>
            ))}
          </div>
        )}

        <TabelJadwalTahap baris={barisTahap} mati={mati} bukaAwal={[pend ? "tahap-pendataan" : "tahap-pengolahan"]} />
      </div>

      {adaKe && (banyak || adaKecuali) && <PengecualianPeriode f={f} ubah={ubah} tahun={tahun} mati={mati} lst={lst} />}
    </Bagian>
  );
}

function PengecualianPeriode({ f, ubah, tahun, mati, lst }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati"> & { lst: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">Jendela tiap periode dan pengecualian</h3>
      <p className="m-0 text-[12.5px] text-[#44546F]">Semua periode mengikuti pola di atas. Bila satu periode jadwalnya berbeda (mis. libur panjang), buat pengecualian dan tulis alasannya.</p>
      {lst.map((P) => {
        const w = jendelaPola(f, P, tahun);
        const e = kecualiAktif(f, P);
        const geser = e && w.mulai && e.mulai ? selisihHari(e.mulai, w.mulai) : 0;
        const setE = (patch: Partial<NonNullable<typeof e>>) => ubah((g) => { Object.assign(g.kecuali[P], patch); });
        return (
          <div key={P} className={`rounded-lg border border-[#DCE3EE] p-3 ${e ? "bg-[#FFFBEF]" : "bg-white"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[14px] text-[#0F2A52]">{P}</strong>
              <span className="text-[12.5px] text-[#44546F]">Pola: {tglIndo(w.mulai)} s.d. {tglIndo(w.selesai)}</span>
              {!e && <button type="button" className={`${tombolKecil} ml-auto`} disabled={mati} onClick={() => ubah((g) => { g.kecuali[P] = { on: true, mulai: w.mulai, selesai: w.selesai, alasan: "", perk: false }; })}>Buat pengecualian</button>}
              {e && <button type="button" className={`${tombolKecil} ml-auto`} disabled={mati} onClick={() => ubah((g) => { delete g.kecuali[P]; })}>Kembali ke pola</button>}
            </div>
            {e && (
              <div className="mt-2 flex flex-col gap-2">
                <div className={kisi}>
                  <TglRentang nama={P} judulMulai={`${P} mulai`} judulSelesai={`${P} selesai`} mulai={e.mulai} selesai={e.selesai} mati={mati} onUbah={(r) => setE({ mulai: r.mulai, selesai: r.selesai })} />
                </div>
                <Isian judul="Alasan pengecualian" ket={`Bergeser ${geser > 0 ? "+" : ""}${geser} hari pada tanggal mulai dibanding pola.`}>
                  <input className={kolom} value={e.alasan} maxLength={200} disabled={mati} onChange={(ev) => setE({ alasan: ev.target.value })} aria-label={`Alasan pengecualian ${P}`} />
                </Isian>
                <FixPerk nama={`Pengecualian ${P}`} perk={e.perk} mati={mati} onPilih={(v) => setE({ perk: v })} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// B. Pelatihan dan briefing
// ---------------------------------------------------------------------------------------------------------------------
function BagianB({ f, ubah, tahun, mati, pa, rujukan }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati" | "rujukan"> & { pa: string }) {
  const lainnya = rujukan.filter((r) => r.nama.trim().toLowerCase() !== f.nama.trim().toLowerCase());
  return (
    <Bagian huruf="B" judul="Pelatihan dan briefing" gsbpm="GSBPM 4.2" id="bagian-b">
      <Isian judul="Pelatihan dan briefing digabung dengan survei lain?">
        <YaTidak nama="Berbagi pelatihan" nilai={f.berbagi} mati={mati} onPilih={(v) => ubah((g) => { g.berbagi = v; if (!v) g.rujukan = ""; })} />
      </Isian>
      {f.berbagi ? (
        <>
          <Isian judul="Survei yang dirujuk">
            <select className={kolom} value={f.rujukan} disabled={mati} onChange={(e) => ubah((g) => { g.rujukan = e.target.value; })} aria-label="Survei yang dirujuk">
              <option value="">Pilih survei…</option>
              {lainnya.map((r) => <option key={`${r.ro}|${r.nama}`} value={r.nama}>{r.nama} · {r.ro}{r.sah ? "" : " · belum sah"}</option>)}
              {f.rujukan && !lainnya.some((r) => r.nama === f.rujukan) && <option value={f.rujukan}>{f.rujukan}</option>}
            </select>
          </Isian>
          <Cat>Pelatihan dan briefing mengikuti {f.rujukan || "survei yang dipilih di atas"}. Pertanyaan sesi tidak ditanya di sini dan tidak menambah kebutuhan anggaran survei ini.</Cat>
        </>
      ) : (
        <TabelSesi f={f} ubah={ubah} tahun={tahun} mati={mati} pa={pa} />
      )}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// C. Rapat (Instrumen pendataan kini di bagian A: KartuInstrumen)
// ---------------------------------------------------------------------------------------------------------------------
function BagianC({ f, ubah, tahun, mati, pa }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati"> & { pa: string }) {
  return (
    <Bagian huruf="C" judul="Rapat" gsbpm="Manajemen dan GSBPM 8" id="bagian-c">
      <TabelRapat f={f} ubah={ubah} tahun={tahun} mati={mati} pa={pa} />
    </Bagian>
  );
}

/**
 * Instrumen pendataan (dulu bagian D). (28 Okt 2026) Dipindah ke bagian A, tepat sesudah jadwal pendataan lapangan, supaya jawabannya
 * menjadi dasar pertanyaan sesudahnya (tahap, petugas, pulsa). Anchor "bagian-instrumen" menggantikan "bagian-d" lama.
 */
function KartuInstrumen({ f, ubah, mati }: Pick<PropsFormulir, "f" | "ubah" | "mati">) {
  const anyPulsa = !f.berbagi && (["briefing", "pelatihan"] as const).some((id) => f.sesi[id].on && (f.sesi[id].bentuk === "Daring" || f.sesi[id].bentuk === "Hybrid") && f.sesi[id].pulsa);
  const kunciPulsa = f.instrumen === "FASIH" && anyPulsa;
  return (
    <div id="bagian-instrumen" className="scroll-mt-20 flex flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
      <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">Instrumen pendataan <span className="text-[12px] font-normal text-[#5B6B84]">· GSBPM 4.3</span></h3>
      <Pilihan nama="Instrumen" nilai={f.instrumen} opsi={["Tanpa pendataan", "FASIH", "PAPI"] as readonly Instrumen[]} mati={mati} onPilih={(v) => ubah((g) => { g.instrumen = v; if (v !== "PAPI") g.peran.entri.on = false; })} />
      {f.instrumen === "Tanpa pendataan" && <Cat>Tanpa pendataan: bagian D (organisasi pendataan lapangan) tidak ditanya dan tahap Pendataan tidak aktif.</Cat>}
      {f.instrumen === "PAPI" && <Isian judul="Dokumen PAPI dicetak di kabupaten?"><YaTidak nama="Cetak PAPI" nilai={f.cetakPapi} mati={mati} onPilih={(v) => ubah((g) => { g.cetakPapi = v; })} /></Isian>}
      {f.instrumen === "FASIH" && (
        <Isian judul="Pulsa untuk petugas lapangan?" ket={kunciPulsa ? "Pulsa sudah dibiayai lewat sesi pelatihan atau briefing, jadi tidak diminta lagi di sini." : undefined}>
          <YaTidak nama="Pulsa petugas lapangan" nilai={kunciPulsa ? false : f.pulsaLap} mati={mati || kunciPulsa} onPilih={(v) => ubah((g) => { g.pulsaLap = v; })} />
        </Isian>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// D. Organisasi pendataan lapangan (+ honor tim bila Ad-hoc); dulu bagian E
// ---------------------------------------------------------------------------------------------------------------------
function BagianE({ f, ubah, mati }: Pick<PropsFormulir, "f" | "ubah" | "mati">) {
  const pend = adaPendataan(f);
  const rp = ringkasPetugas(f);
  const adhoc = adalahAdhoc(f);
  if (!pend && !adhoc) return (
    <Bagian huruf="D" judul="Organisasi pendataan lapangan" gsbpm="GSBPM 4.3, bukan pelatihan" id="bagian-d"><Cat>Tanpa pendataan: bagian ini tidak ditanya.</Cat></Bagian>
  );
  return (
    <Bagian huruf="D" judul="Organisasi pendataan lapangan" gsbpm="GSBPM 4.3, bukan pelatihan" id="bagian-d">
      {pend && <TabelPeran f={f} ubah={ubah} mati={mati} />}
      {pend && <Cat>Total petugas: {rp.total} (organik {rp.totOrg}, mitra {rp.totMit}). {rp.perkPeran.length > 0 ? `${rp.perkPeran.length} peran masih perkiraan.` : "Semua fix."}</Cat>}

      {adhoc && <KartuHonorTim f={f} ubah={ubah} mati={mati} />}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// E. Konsultasi teknis, rekonsiliasi, diseminasi (dulu bagian F)
// ---------------------------------------------------------------------------------------------------------------------
function BagianFGH({ f, ubah, mati }: Pick<PropsFormulir, "f" | "ubah" | "mati">) {
  return (
    <Bagian huruf="E" judul="Konsultasi teknis, rekonsiliasi data, dan diseminasi" gsbpm="GSBPM 6 dan 7" id="bagian-e">
      <Isian judul="Ada konsultasi teknis?"><YaTidak nama="Konsultasi teknis" nilai={f.konsultasi} mati={mati} onPilih={(v) => ubah((g) => { g.konsultasi = v; })} /></Isian>
      {f.konsultasi && <Isian judul="Cara konsultasi"><Pilihan nama="Cara konsultasi" nilai={f.cara as string} opsi={["Tatap muka (perjalanan dinas)", "Daring"] as readonly string[]} mati={mati} onPilih={(v) => ubah((g) => { g.cara = v as Form["cara"]; })} /></Isian>}
      <Isian judul="Ada rekonsiliasi data?"><YaTidak nama="Rekonsiliasi data" nilai={f.rekon} mati={mati} onPilih={(v) => ubah((g) => { g.rekon = v; })} /></Isian>
      {!f.adaDiseminasi ? <Cat>Tanpa diseminasi (dipilih pada jadwal bagian A): pertanyaan diseminasi tidak ditanya dan tidak ada belanja diseminasi.</Cat> : (
        <>
          <Isian judul="Cetak buku publikasi?"><YaTidak nama="Cetak buku" nilai={f.cetakBuku} mati={mati} onPilih={(v) => ubah((g) => { g.cetakBuku = v; if (!v) g.cetakKab = false; })} /></Isian>
          {f.cetakBuku && <Isian judul="Buku dicetak di kabupaten?" ket="Dicetak di kabupaten = belanja barang persediaan (521811)."><YaTidak nama="Cetak di kabupaten" nilai={f.cetakKab} mati={mati} onPilih={(v) => ubah((g) => { g.cetakKab = v; })} /></Isian>}
          <Cat>Rilis dan spanduk tidak ada di kabupaten/kota, sehingga tidak ditanya.</Cat>
        </>
      )}
    </Bagian>
  );
}

