"use client";

// app/sigap/kelola/perencanaan/identifikasi/Formulir.tsx
//
// (25 Okt 2026) Formulir Identifikasi survei, bagian A-E (dari mockup Version 7; 28 Okt 2026 Instrumen pendataan digabung ke A). Murni tampilan terkendali: seluruh perhitungan memakai
// lib/keu/identifikasi.ts. `mati` = formulir terkunci (menunggu persetujuan, sudah sah, atau akun tanpa hak menyusun).

import { useMemo, type ReactNode } from "react";
import { kisi, kolom, tombolKecil } from "@/app/sigap/keu-ui";
import {
  JABATAN_TIM, JENIS_PERIODE, NAMA_BULAN, NAMA_PERIODE, PANJANG_PERIODE, PERAN_DEF, adaPendataan, adaPeriode, adalahAdhoc, daftarPeriode, hitungJadwal,
  jendelaPola, kecualiAktif, periodeTurunan, ringkasPetugas, selisihHari, tanggalSesi, tglIndo,
  type Form, type Instrumen, type PeranId, type StatusPetugas, type TempatSesi,
} from "@/lib/keu/identifikasi";
import { Angka, Bagian, Cat, Centang, FixPerk, Isian, Pilihan, TglRentang, YaTidak } from "./Kontrol";
import { BarisRelatif } from "./Relatif";
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

const BENTUK = ["Daring", "Luring", "Hybrid"] as const;
const MEDIA = ["Apel pagi", "Tatap muka", "Zoom"] as const;
const TEMPAT_PILIH = ["Kantor", "Hotel dalam kota", "Hotel luar kota", "Lokasi lain"] as const;
const STATUS = ["Organik", "Mitra", "Organik dan mitra"] as const;
const STATUS_SUP = ["Organik", "Organik dan mitra"] as const;

export default function Formulir(p: PropsFormulir) {
  const { f, ubah, tahun, mati, pa, setPa, rujukan } = p;
  const lst = daftarPeriode(f);
  const paSah = lst.includes(pa) ? pa : lst[0];
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <BagianA f={f} ubah={ubah} tahun={tahun} mati={mati} pa={paSah} setPa={setPa} lst={lst} />
      <BagianB f={f} ubah={ubah} tahun={tahun} mati={mati} pa={paSah} rujukan={rujukan} />
      <BagianC f={f} ubah={ubah} mati={mati} />
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

/** Kartu satu tahap pada jadwal: nomor, nama, hasil tanggal, penanda Perkiraan/Fix (radio), dan isian di dalamnya. */
function KartuTahap({ id, no, nama, hasil, aktif = true, perkEfektif, perkSendiri, onPerk, mati, toggle, catatan, children }: {
  id: string; no: number; nama: string; hasil: string; aktif?: boolean; perkEfektif: boolean; perkSendiri: boolean; onPerk: (perk: boolean) => void; mati: boolean;
  toggle?: ReactNode; catatan?: string; children?: ReactNode;
}) {
  const ikut = aktif && perkEfektif && !perkSendiri;
  const warna = !aktif ? "border-l-[#C5D0E2] bg-white" : perkEfektif ? "border-l-[#C98A00] bg-[#FFFBEF]" : "border-l-[#2E9E63] bg-[#F5FBF7]";
  return (
    <div id={id} className={`scroll-mt-20 flex flex-col gap-2.5 rounded-lg border border-l-4 border-[#DCE3EE] p-3 ${warna}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F2A52] text-[12px] font-extrabold text-white" aria-hidden="true">{no}</span>
        <strong className="text-[14.5px] text-[#0F2A52]">{nama}</strong>
        {toggle}
        {aktif && <div className="ml-auto"><FixPerk nama={`Jadwal ${nama}`} perk={perkSendiri} mati={mati} onPilih={onPerk} /></div>}
      </div>
      {aktif && (
        <>
          <p className="m-0 text-[14px] font-bold text-[#0F2A52]">{hasil}</p>
          {ikut && <p className="m-0 text-[12px] font-semibold text-[#8A6200]">Masih perkiraan karena tahap sebelumnya masih perkiraan.</p>}
          {catatan && <p className="m-0 text-[12.5px] text-[#44546F]">{catatan}</p>}
          {children}
        </>
      )}
    </div>
  );
}

function BagianA({ f, ubah, tahun, mati, pa, setPa, lst }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati"> & { pa: string; setPa: (p: string) => void; lst: string[] }) {
  const pend = adaPendataan(f);
  const adaKe = adaPeriode(f);
  const opsKe = NAMA_PERIODE[f.periode];
  const LEN = PANJANG_PERIODE[f.periode];
  const first = lst[0];
  const banyak = lst.length > 1;
  const J = f.jend;
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
  const wPola = jendelaPola(f, pa, tahun);
  const barisPola = (sisi: "mulai" | "selesai") => {
    const m = sisi === "mulai";
    const jenis = m ? J.mj : J.sj;
    const bln = m ? J.mb : J.sb;
    const n = m ? J.mn : J.sn;
    const ubahCara = (v: string) => setJend(m ? (v === "tgl" ? { mj: "tgl", mn: 1 } : { mj: "akhir", mn: 7 }) : (v === "tgl" ? { sj: "tgl", sn: 15 } : { sj: "akhir", sn: 0 }));
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="w-14 shrink-0 text-[13px] font-bold text-[#0F2A52]">{m ? "Mulai" : "Selesai"}</span>
          <select aria-label={`Cara hari ${sisi}`} className={pilihSel} value={jenis} disabled={mati} onChange={(e) => ubahCara(e.target.value)}>
            <option value="tgl">tanggal tertentu</option>
            <option value="akhir">{m ? "N hari terakhir bulan" : "akhir bulan"}</option>
          </select>
          {(jenis === "tgl" || m) && <div className="w-[84px]"><Angka nama={`Hari ${sisi}`} nilai={n} min={1} maks={31} mati={mati} onUbah={(v) => setJend(m ? { mn: v } : { sn: v })} /></div>}
          <span className="text-[13px] text-[#44546F]">di bulan ke-</span>
          <div className="w-[84px]"><Angka nama={`Bulan ${sisi}`} nilai={bln + 1} min={1} maks={25} mati={mati} onUbah={(v) => setJend(m ? { mb: v - 1 } : { sb: v - 1 })} /></div>
          <span className="rounded-md border border-[#CFE6D8] bg-white px-2 py-1 text-[12.5px] font-bold text-[#14653A]">→ {tglIndo(m ? wPola.mulai : wPola.selesai)}{banyak ? ` (${pa})` : ""}</span>
        </div>
        <span className="pl-16 text-[12px] text-[#5B6B84]">{bulanTeks(bln)}</span>
      </div>
    );
  };
  const dasar = adaKe ? (
    <div className="flex flex-col gap-3">
      {PRESET.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-[#44546F]">Pola umum (ketuk untuk mengisi otomatis):</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pola umum">
            {PRESET.map(([l, q]) => (
              <button key={l} type="button" disabled={mati} aria-pressed={samaPola(q)} onClick={() => setJend(q)}
                className={`min-h-[40px] rounded-md border px-3 text-[13px] font-semibold ${samaPola(q) ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {barisPola("mulai")}
      {barisPola("selesai")}
      <ul className="m-0 list-none space-y-0.5 p-0 text-[12.5px] text-[#44546F]" aria-label="Hasil pola tiap periode">
        {lst.slice(0, 4).map((P) => { const w = jendelaPola(f, P, tahun); return <li key={P}>{P}: {tglIndo(w.mulai)} s.d. {tglIndo(w.selesai)}{keteranganHari(w.mulai, w.selesai)}</li>; })}
        {lst.length > 4 && <li>… dan {lst.length - 4} periode lain</li>}
      </ul>
    </div>
  ) : (
    <div className={kisi}>
      <TglRentang nama="Jadwal" judulMulai="Mulai" judulSelesai="Selesai" mulai={f.tunggal.mulai} selesai={f.tunggal.selesai} mati={mati} onUbah={(r) => ubah((g) => { g.tunggal.mulai = r.mulai; g.tunggal.selesai = r.selesai; })} />
    </div>
  );

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

        {pend && (
          <KartuTahap id="tahap-updating" no={1} nama="Updating" mati={mati} hasil={ringkasHasil(jp.updating)} aktif={f.adaUpdating} perkEfektif={!!jp.updating?.perk} perkSendiri={f.rel.updating.perk} onPerk={(v) => setRel("updating", { perk: v })}
            toggle={<Centang aktif={f.adaUpdating} mati={mati} onUbah={() => ubah((g) => { g.adaUpdating = !g.adaUpdating; })}>Ada updating</Centang>}>
            <BarisRelatif tahap="Updating" acuan="pendataan" rel={f.rel.updating} mulai={jp.updating?.mulai} selesai={jp.updating?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("updating", p)} />
          </KartuTahap>
        )}

        {pend && (
          <KartuTahap id="tahap-pendataan" no={2} nama="Pendataan lapangan" mati={mati} hasil={ringkasHasil(jp.pendataan)} perkEfektif={!!jp.pendataan?.perk} perkSendiri={adaKe ? !!J.perk : !!f.tunggal.perk}
            onPerk={(v) => (adaKe ? setJend({ perk: v }) : ubah((g) => { g.tunggal.perk = v; }))}
            catatan={adaKe ? (kecualiAktif(f, pa) ? "Periode ini memakai pengecualian (lihat bagian Pengecualian di bawah)." : "Mengikuti pola jendela di bawah, berlaku untuk semua periode yang dicentang.") : undefined}>
            {dasar}
          </KartuTahap>
        )}

        <KartuTahap id="tahap-pengolahan" no={pend ? 3 : 1} nama="Pengolahan" mati={mati} hasil={ringkasHasil(jp.pengolahan)} perkEfektif={!!jp.pengolahan?.perk} perkSendiri={pend ? f.rel.pengolahan.perk : adaKe ? !!J.perk : !!f.tunggal.perk}
          onPerk={(v) => (pend ? setRel("pengolahan", { perk: v }) : adaKe ? setJend({ perk: v }) : ubah((g) => { g.tunggal.perk = v; }))}
          catatan={pend ? "Bawaannya sama dengan jadwal pendataan (0 hari dari mulai dan selesai pendataan). Ubah selisihnya bila pengolahan berbeda." : "Tanpa pendataan: pengolahan memakai jadwal dasar di bawah."}>
          {pend ? (
            <>
              <BarisRelatif tahap="Pengolahan" acuan="pendataan" rel={f.rel.pengolahan} mulai={jp.pengolahan?.mulai} selesai={jp.pengolahan?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("pengolahan", p)} />
              <div><button type="button" className={tombolKecil} disabled={mati} onClick={() => setRel("pengolahan", { aM: "mulai", dM: 0, aS: "selesai", dS: 0 })}>Samakan dengan jadwal pendataan</button></div>
            </>
          ) : dasar}
        </KartuTahap>

        <KartuTahap id="tahap-pasca" no={pend ? 4 : 2} nama="Pasca pengolahan" mati={mati} hasil={ringkasHasil(jp.pasca)} perkEfektif={!!jp.pasca?.perk} perkSendiri={f.rel.pasca.perk} onPerk={(v) => setRel("pasca", { perk: v })}>
          <BarisRelatif tahap="Pasca pengolahan" acuan="pengolahan" rel={f.rel.pasca} mulai={jp.pasca?.mulai} selesai={jp.pasca?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("pasca", p)} />
        </KartuTahap>

        <KartuTahap id="tahap-diseminasi" no={pend ? 5 : 3} nama="Diseminasi" mati={mati} hasil={ringkasHasil(jp.diseminasi)} aktif={f.adaDiseminasi} perkEfektif={!!jp.diseminasi?.perk} perkSendiri={f.rel.diseminasi.perk} onPerk={(v) => setRel("diseminasi", { perk: v })}
          toggle={<Centang aktif={f.adaDiseminasi} mati={mati} onUbah={() => ubah((g) => { g.adaDiseminasi = !g.adaDiseminasi; })}>Ada diseminasi</Centang>}>
          <BarisRelatif tahap="Diseminasi" acuan="pasca pengolahan" rel={f.rel.diseminasi} mulai={jp.diseminasi?.mulai} selesai={jp.diseminasi?.selesai} ringkas="" mati={mati} onUbah={(p) => setRel("diseminasi", p)} />
        </KartuTahap>
      </div>

      {adaKe && banyak && <PengecualianPeriode f={f} ubah={ubah} tahun={tahun} mati={mati} lst={lst} />}
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
  const turunan = periodeTurunan(f, pa, tahun);
  const first = daftarPeriode(f)[0];
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
        (["briefing", "pelatihan"] as const).map((id) => {
          const s = f.sesi[id];
          const nama = id === "briefing" ? "Briefing" : "Pelatihan";
          const t = tanggalSesi(f, id, pa, tahun);
          const luring = s.bentuk === "Luring"; const daring = s.bentuk === "Daring"; const hybrid = s.bentuk === "Hybrid";
          const setT = (patch: Partial<{ mulai: string; selesai: string }>) => ubah((g) => { const lama = g.sesi[id].tgl[pa]; g.sesi[id].tgl[pa] = { mulai: lama?.mulai ?? "", selesai: lama?.selesai ?? "", ...patch }; });
          return (
            <div key={id} className="flex flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[14px] text-[#0F2A52]">{nama}</strong>
                <Centang aktif={s.on} mati={mati} onUbah={() => ubah((g) => { g.sesi[id].on = !g.sesi[id].on; })}>Ada {nama.toLowerCase()}</Centang>
              </div>
              {s.on && (
                <>
                  <Isian judul="Bentuk"><Pilihan nama={`Bentuk ${nama}`} nilai={s.bentuk as string} opsi={BENTUK as readonly string[]} mati={mati} onPilih={(v) => ubah((g) => { g.sesi[id].bentuk = v as typeof BENTUK[number]; })} /></Isian>
                  {(luring || hybrid) && <Isian judul="Tempat" ket="Hotel = paket meeting fullday atau fullboard (524114 dalam kota, 524119 luar kota). Kantor atau lokasi lain = konsumsi tanpa paket (521211).">
                    <Pilihan nama={`Tempat ${nama}`} nilai={s.tempat as string} opsi={TEMPAT_PILIH as readonly string[]} mati={mati} onPilih={(v) => ubah((g) => { g.sesi[id].tempat = v as TempatSesi; })} />
                  </Isian>}
                  {turunan ? (
                    <Cat>Tanggal {nama.toLowerCase()} {pa}: {tglIndo(t.mulai)} s.d. {tglIndo(t.selesai)}. Diturunkan dari periode acuan {first}, digeser mengikuti tanggal mulai pendataan {pa}.</Cat>
                  ) : (
                    <div className={kisi}>
                      <TglRentang nama={nama} judulMulai={`Tanggal mulai${daftarPeriode(f).length > 1 ? ` · ${pa}` : ""}`} judulSelesai="Tanggal selesai" mulai={t.mulai} selesai={t.selesai} mati={mati} onUbah={(r) => setT({ mulai: r.mulai, selesai: r.selesai })} />
                    </div>
                  )}
                  {(daring || hybrid) && <Isian judul="Biaya pulsa peserta (mitra)?"><YaTidak nama={`${nama} pulsa`} nilai={s.pulsa} mati={mati} onPilih={(v) => ubah((g) => { g.sesi[id].pulsa = v; })} /></Isian>}
                  {id === "pelatihan" && (luring || hybrid) && <Isian judul="Perlengkapan pelatihan?"><YaTidak nama={`${nama} perlengkapan`} nilai={s.perl} mati={mati} onPilih={(v) => ubah((g) => { g.sesi[id].perl = v; })} /></Isian>}
                  <Isian judul="Pengajar atau narasumber eksternal?"><YaTidak nama={`${nama} pengajar`} nilai={s.pengajar} mati={mati} onPilih={(v) => ubah((g) => { g.sesi[id].pengajar = v; })} /></Isian>
                  {luring && <Cat>Bentuk Luring: pulsa tidak ditanya (bernilai Tidak).</Cat>}
                  {daring && <Cat>Bentuk Daring: tempat dan perlengkapan tidak ditanya.</Cat>}
                  {(luring || hybrid) && <Cat>Konsumsi atau paket hanya dihitung bila ada petugas mitra. Perlengkapan hanya untuk pelatihan (bukan briefing), baik ada maupun tanpa mitra.</Cat>}
                  {(daring || hybrid) && <Cat>Pulsa peserta hanya dihitung bila ada petugas mitra.</Cat>}
                </>
              )}
            </div>
          );
        })
      )}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// C. Rapat (Instrumen pendataan kini di bagian A: KartuInstrumen)
// ---------------------------------------------------------------------------------------------------------------------
function BagianC({ f, ubah, mati }: Pick<PropsFormulir, "f" | "ubah" | "mati">) {
  return (
    <Bagian huruf="C" judul="Rapat" gsbpm="Manajemen dan GSBPM 8" id="bagian-c">
      {(["persiapan", "pelaksanaan", "evaluasi"] as const).map((id) => {
        const r = f.rapat[id];
        const wajib = id === "evaluasi";
        const on = wajib || r.on;
        return (
          <div key={id} className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[14px] text-[#0F2A52]">Rapat {id}</strong>
              {wajib ? <span className="rounded-full bg-[#EEF2F7] px-2.5 py-[2px] text-[11.5px] font-semibold text-[#44546F]">Wajib</span>
                : <Centang aktif={r.on} mati={mati} onUbah={() => ubah((g) => { g.rapat[id].on = !g.rapat[id].on; })}>Ada rapat {id}</Centang>}
            </div>
            {on && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Media rapat ${id}`}>
                {MEDIA.map((m) => <Centang key={m} aktif={r.media.includes(m)} mati={mati} onUbah={() => ubah((g) => { const a = g.rapat[id].media; g.rapat[id].media = a.includes(m) ? a.filter((x) => x !== m) : [...a, m]; })}>{m}</Centang>)}
              </div>
            )}
            {on && r.media.includes("Tatap muka") && <Cat>Konsumsi rapat {id} dihitung bila rapat luring (tatap muka) dan ada petugas mitra pada peran lapangan.</Cat>}
          </div>
        );
      })}
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
  const papi = f.instrumen === "PAPI";
  const rp = ringkasPetugas(f);
  const adhoc = adalahAdhoc(f);
  if (!pend && !adhoc) return (
    <Bagian huruf="D" judul="Organisasi pendataan lapangan" gsbpm="GSBPM 4.3, bukan pelatihan" id="bagian-d"><Cat>Tanpa pendataan: bagian ini tidak ditanya.</Cat></Bagian>
  );
  const setP = (id: PeranId, patch: Partial<Form["peran"]["ppl"]>) => ubah((g) => { Object.assign(g.peran[id], patch); });
  return (
    <Bagian huruf="D" judul="Organisasi pendataan lapangan" gsbpm="GSBPM 4.3, bukan pelatihan" id="bagian-d">
      {pend && PERAN_DEF.map((d) => {
        const p = f.peran[d.id];
        const terkunci = d.id === "entri" && !papi;
        const adaOrg = p.status === "Organik" || p.status === "Organik dan mitra";
        const adaMit = p.status === "Mitra" || p.status === "Organik dan mitra";
        const honor = d.honor === "pilih" ? p.honor : false;
        return (
          <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[14px] text-[#0F2A52]">{d.nama}</strong>
              <Centang aktif={p.on && !terkunci} mati={mati || terkunci} onUbah={() => setP(d.id, { on: !p.on })}>Dipakai</Centang>
              {terkunci && <span className="text-[12.5px] text-[#5B6B84]">Petugas entri hanya untuk instrumen PAPI.</span>}
            </div>
            {p.on && !terkunci && (
              <>
                <Isian judul="Status petugas" ket={d.id === "supervisor" ? "Supervisor: Organik, atau Organik dan mitra." : undefined}>
                  <Pilihan nama={`Status ${d.nama}`} nilai={p.status as string} opsi={(d.id === "supervisor" ? STATUS_SUP : STATUS) as readonly string[]} mati={mati} onPilih={(v) => setP(d.id, { status: v as StatusPetugas })} />
                </Isian>
                <div className={kisi}>
                  {adaOrg && <Isian judul={`Jumlah ${d.nama} organik`}><Angka nama={`Jumlah ${d.nama} organik`} nilai={p.nOrg} min={0} mati={mati} onUbah={(v) => setP(d.id, { nOrg: v })} /></Isian>}
                  {adaMit && <Isian judul={`Jumlah ${d.nama} mitra`}><Angka nama={`Jumlah ${d.nama} mitra`} nilai={p.nMit} min={0} mati={mati} onUbah={(v) => setP(d.id, { nMit: v })} /></Isian>}
                </div>
                <Isian judul="Jumlah petugas ini"><FixPerk nama={`Jumlah ${d.nama}`} perk={p.perk} mati={mati} onPilih={(v) => setP(d.id, { perk: v })} /></Isian>
                {d.translok === "pilih" && <Isian judul="Translok?" ket="Semua peran ditanya. Rencana boleh tidak direalisasi; selisihnya dicatat saat evaluasi."><YaTidak nama={`Translok ${d.nama}`} nilai={p.translok} mati={mati} onPilih={(v) => setP(d.id, { translok: v })} /></Isian>}
                {d.honor === "pilih" && <Isian judul="Honorarium?"><YaTidak nama={`Honor ${d.nama}`} nilai={p.honor} mati={mati} onPilih={(v) => setP(d.id, { honor: v })} /></Isian>}
                {honor && p.status === "Organik" && (
                  <Isian judul="Dasar honorarium organik (SK atau juknis)" ket="Honorarium untuk petugas organik perlu dasar tertulis.">
                    <input className={kolom} value={p.dasar} maxLength={200} disabled={mati} onChange={(e) => setP(d.id, { dasar: e.target.value })} aria-label={`Dasar honor ${d.nama}`} placeholder="mis. Juknis honor organik 2026" />
                  </Isian>
                )}
              </>
            )}
          </div>
        );
      })}
      {pend && <Cat>Total petugas: {rp.total} (organik {rp.totOrg}, mitra {rp.totMit}). {rp.perkPeran.length > 0 ? `${rp.perkPeran.length} peran masih perkiraan.` : "Semua fix."}</Cat>}

      {adhoc && (
        <div className="flex flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
          <strong className="text-[14px] text-[#0F2A52]">Honor anggota tim (kegiatan Ad-hoc)</strong>
          <Isian judul="Ada honor untuk anggota tim?"><YaTidak nama="Honor tim" nilai={f.tim.honor} mati={mati} onPilih={(v) => ubah((g) => { g.tim.honor = v; })} /></Isian>
          {f.tim.honor && (
            <Isian judul="Yang menerima honor" ket="Centang jabatan tim yang menerima honor.">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jabatan tim penerima honor">
                {JABATAN_TIM.map((j) => <Centang key={j.id} aktif={f.tim[j.id]} mati={mati} onUbah={() => ubah((g) => { g.tim[j.id] = !g.tim[j.id]; })}>{j.nama}</Centang>)}
              </div>
            </Isian>
          )}
        </div>
      )}
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

