"use client";

// app/sigap/kelola/perencanaan/identifikasi/Formulir.tsx
//
// (25 Okt 2026) Formulir Identifikasi survei, bagian A-E (dari mockup Version 7; 28 Okt 2026 Instrumen pendataan digabung ke A). Murni tampilan terkendali: seluruh perhitungan memakai
// lib/keu/identifikasi.ts. `mati` = formulir terkunci (menunggu persetujuan, sudah sah, atau akun tanpa hak menyusun).

import { useMemo, useState } from "react";
import { kolom, tombolKecil } from "@/app/sigap/keu-ui";
import {
  JENIS_PERIODE,
  NAMA_PERIODE,
  adaPendataan,
  adaPeriode,
  adalahAdhoc,
  daftarPeriode,
  hitungJadwal,
  jadwalValid,
  jendelaPeriode,
  kecualiAktif,
  ringkasPetugas,
  tglIndo,
  type Form,
  type Instrumen,
} from "@/lib/keu/identifikasi";
import { Bagian, Cat, Centang, Isian, Pilihan, YaTidak } from "./Kontrol";
import { PerkKecil, TabelJadwalTahap, TabelPeran, TabelRapat, TabelSesi, KartuHonorTim, type BarisTahap } from "./TabelAwal";
import { jumlahHariAntara } from "@/lib/keu/tanggalDurasi";
import { ALASAN_KHUSUS, putusanPendataan, relDariTanggal, relSamaDenganAcuan, relSudahSama, terapkanTanggalPendataan } from "@/lib/keu/isianTanggal";
import SelectCari from "@/app/components/SelectCari";

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
/** Tahap acuan tiap tahap turunan (kembaran ANC di lib/keu/identifikasi.ts). */
const ACUAN_TAHAP = { updating: "pendataan", pengolahan: "pendataan", pasca: "pengolahan", diseminasi: "pasca" } as const;
type KunciRel = keyof typeof ACUAN_TAHAP;

function BagianA({ f, ubah, tahun, mati, pa, setPa, lst }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati"> & { pa: string; setPa: (p: string) => void; lst: string[] }) {
  const pend = adaPendataan(f);
  const adaKe = adaPeriode(f);
  const opsKe = NAMA_PERIODE[f.periode];
  const first = lst[0];
  const banyak = lst.length > 1;
  const J = f.jend;
  const jp = useMemo(() => hitungJadwal(f, pa, tahun), [f, pa, tahun]);
  // Pesan sesaat per tahap (mis. tanggal terlalu jauh dari tahap acuan, atau di luar jangkauan pola); hilang begitu tanggal berikutnya sah.
  const [catatanTgl, setCatatanTgl] = useState<Record<string, string>>({});
  const setCat = (k: string, v: string) => setCatatanTgl((x) => ((x[k] ?? "") === v ? x : { ...x, [k]: v }));

  const semua = opsKe.length > 0 && f.keList.length === opsKe.length;
  const adaKecuali = adaKe && lst.some((P) => !!kecualiAktif(f, P));

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
  const setRel = (k: KunciRel, patch: Partial<Form["rel"]["updating"]>) => ubah((g) => { Object.assign(g.rel[k], patch); });

  // (6 Nov 2026) Tanggal diisi langsung pada barisnya. Pendataan (atau Pengolahan bila tanpa pendataan) disimpan sebagai pola/pengecualian/jadwal tunggal,
  // tahap lain sebagai selisih hari terhadap tahap acuannya; keduanya diurus lib/keu/isianTanggal.ts.
  const aturDasar = (sisi: "mulai" | "selesai", d: string) => {
    const k = putusanPendataan(f, pa, sisi, d, tahun);
    setCat("dasar", k.aksi === "khusus" && k.luarPola ? "Tanggal ini di luar jangkauan pola (sebelum awal periode atau lebih dari 24 bulan sesudahnya), jadi disimpan sebagai jadwal khusus periode ini." : "");
    ubah((g) => { terapkanTanggalPendataan(g, pa, sisi, d, tahun); });
  };
  const aturRel = (k: KunciRel, sisi: "mulai" | "selesai", d: string) => {
    const h = relDariTanggal(f.rel[k], jp[ACUAN_TAHAP[k]], sisi, d);
    if ("galat" in h) { setCat(k, h.galat); return; }
    setCat(k, "");
    setRel(k, h.patch);
  };

  // Perkiraan/Fix jadwal dasar: milik pengecualian bila periode ini punya pengecualian, selain itu milik pola atau jadwal tunggal.
  const eIni = adaKe ? kecualiAktif(f, pa) : null;
  const perkDasar = eIni ? !!eIni.perk : adaKe ? !!J.perk : !!f.tunggal.perk;
  const setPerkDasar = (v: boolean) => ubah((g) => {
    if (adaKe) { const e = g.kecuali[pa]; if (e?.on) e.perk = v; else g.jend.perk = v; } else g.tunggal.perk = v;
  });
  const acuanDasar = !adaKe ? "Jadwal tunggal" : eIni ? "Jadwal khusus" : pa === first ? (banyak ? "Pola semua periode" : "Pola periode") : `Ikut pola ${first}`;
  const rinciPeriode = adaKe && (banyak || adaKecuali) ? <JadwalPeriode f={f} ubah={ubah} tahun={tahun} mati={mati} lst={lst} pa={pa} /> : undefined;

  // (5 Nov 2026) Jadwal tahap sebagai tabel: tiap tahap satu baris. (6 Nov 2026) Tanggal mulai dan selesai diisi langsung di baris.
  const barisTahap: BarisTahap[] = [];
  if (pend) {
    barisTahap.push({
      id: "tahap-updating", no: 1, nama: "Updating", acuan: "Pendataan lapangan", aktif: f.adaUpdating, bolehTiada: true,
      onAda: () => ubah((g) => { g.adaUpdating = !g.adaUpdating; }),
      mulai: jp.updating?.mulai, selesai: jp.updating?.selesai, perkEfektif: !!jp.updating?.perk, perkSendiri: f.rel.updating.perk, onPerk: (v) => setRel("updating", { perk: v }),
      onMulai: (d) => aturRel("updating", "mulai", d), onSelesai: (d) => aturRel("updating", "selesai", d),
    });
    barisTahap.push({
      id: "tahap-pendataan", no: 2, nama: "Pendataan lapangan", acuan: acuanDasar, aktif: true,
      mulai: jp.pendataan?.mulai, selesai: jp.pendataan?.selesai, perkEfektif: !!jp.pendataan?.perk, perkSendiri: perkDasar, onPerk: setPerkDasar,
      onMulai: (d) => aturDasar("mulai", d), onSelesai: (d) => aturDasar("selesai", d),
      catatan: banyak ? `Daftar jadwal tiap periode. Tanggal yang diisi pada ${first} berlaku untuk semua periode; mengubah periode lain menjadikannya jadwal khusus.` : undefined,
      isi: rinciPeriode, labelIsi: "Per periode",
    });
  }
  barisTahap.push({
    id: "tahap-pengolahan", no: pend ? 3 : 1, nama: "Pengolahan", acuan: pend ? "Pendataan lapangan" : acuanDasar, aktif: true,
    mulai: jp.pengolahan?.mulai, selesai: jp.pengolahan?.selesai, perkEfektif: !!jp.pengolahan?.perk, perkSendiri: pend ? f.rel.pengolahan.perk : perkDasar,
    onPerk: (v) => (pend ? setRel("pengolahan", { perk: v }) : setPerkDasar(v)),
    onMulai: (d) => (pend ? aturRel("pengolahan", "mulai", d) : aturDasar("mulai", d)),
    onSelesai: (d) => (pend ? aturRel("pengolahan", "selesai", d) : aturDasar("selesai", d)),
    aksi: pend && !relSudahSama(f.rel.pengolahan) && !mati ? <button type="button" className={tombolKecil} onClick={() => setRel("pengolahan", relSamaDenganAcuan())}>Samakan dengan pendataan</button> : undefined,
    catatan: !pend && banyak ? `Daftar jadwal tiap periode. Tanggal yang diisi pada ${first} berlaku untuk semua periode; mengubah periode lain menjadikannya jadwal khusus.` : undefined,
    isi: pend ? undefined : rinciPeriode, labelIsi: "Per periode",
  });
  barisTahap.push({
    id: "tahap-pasca", no: pend ? 4 : 2, nama: "Pasca pengolahan", acuan: "Pengolahan", aktif: true,
    mulai: jp.pasca?.mulai, selesai: jp.pasca?.selesai, perkEfektif: !!jp.pasca?.perk, perkSendiri: f.rel.pasca.perk, onPerk: (v) => setRel("pasca", { perk: v }),
    onMulai: (d) => aturRel("pasca", "mulai", d), onSelesai: (d) => aturRel("pasca", "selesai", d),
  });
  barisTahap.push({
    id: "tahap-diseminasi", no: pend ? 5 : 3, nama: "Diseminasi", acuan: "Pasca pengolahan", aktif: f.adaDiseminasi, bolehTiada: true,
    onAda: () => ubah((g) => { g.adaDiseminasi = !g.adaDiseminasi; }),
    mulai: jp.diseminasi?.mulai, selesai: jp.diseminasi?.selesai, perkEfektif: !!jp.diseminasi?.perk, perkSendiri: f.rel.diseminasi.perk, onPerk: (v) => setRel("diseminasi", { perk: v }),
    onMulai: (d) => aturRel("diseminasi", "mulai", d), onSelesai: (d) => aturRel("diseminasi", "selesai", d),
  });
  const masalahJadwal = jadwalValid(f, pa, tahun).masalah;
  const pesanSesaat = Object.values(catatanTgl).filter(Boolean);

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
          <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#44546F]">Isi tanggal mulai dan selesai langsung di tiap baris. Tahap sesudah pendataan ikut bergeser bila tahap acuannya berubah. Semua tanggal bawaannya <b>Perkiraan</b>; pilih <b>Fix</b> bila sudah pasti.</p>
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

        {(masalahJadwal.length > 0 || pesanSesaat.length > 0) && (
          <ul role="alert" className="m-0 flex list-none flex-col gap-1 p-0">
            {pesanSesaat.map((m) => <li key={m} className="rounded-md border border-[#F2D58A] bg-[#FFF8E6] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#8A5A00]">{m}</li>)}
            {masalahJadwal.map((m) => <li key={m} className="rounded-md bg-[#FDE8E8] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#9B1C23]">{m}</li>)}
          </ul>
        )}
      </div>
    </Bagian>
  );
}

/**
 * (6 Nov 2026) Daftar jadwal pendataan tiap periode (menggantikan "Jendela tiap periode dan pengecualian"): satu tabel, satu baris per periode.
 * Tanggal diubah lewat baris Pendataan setelah memilih periodenya (tab di atas tabel jadwal tahap). Periode yang jadwalnya berbeda otomatis menjadi
 * "Jadwal khusus" dengan alasan yang terisi sendiri (boleh ditulis ulang); "Kembali ke pola" menghapus kekhususannya.
 */
function JadwalPeriode({ f, ubah, tahun, mati, lst, pa }: Pick<PropsFormulir, "f" | "ubah" | "tahun" | "mati"> & { lst: string[]; pa: string }) {
  const th = "py-1.5 pr-3 text-left text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#44546F]";
  const td = "py-1.5 pr-3 align-top text-[13px]";
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" aria-label="Jadwal pendataan tiap periode">
          <thead><tr className="border-b border-[#DCE3EE]">
            <th scope="col" className={th}>Periode</th><th scope="col" className={th}>Mulai</th><th scope="col" className={th}>Selesai</th><th scope="col" className={th}>Hari</th>
            <th scope="col" className={th}>Jadwal</th>
          </tr></thead>
          <tbody>
            {lst.map((P) => {
              const w = jendelaPeriode(f, P, tahun);
              const e = kecualiAktif(f, P);
              const setE = (patch: Partial<NonNullable<typeof e>>) => ubah((g) => { Object.assign(g.kecuali[P], patch); });
              return (
                <tr key={P} className={`border-b border-[#EEF2F7] ${e ? "bg-[#FFFBEF]" : P === pa ? "bg-[#F3F7FE]" : ""}`}>
                  <td className={`${td} font-bold text-[#0F2A52]`}>{P}{P === pa && <span className="ml-1.5 rounded bg-[#E3EEFF] px-1.5 text-[11px] font-semibold text-[#1F5FD1]">dipilih</span>}</td>
                  <td className={`${td} whitespace-nowrap font-semibold text-[#0F2A52]`}>{tglIndo(w.mulai)}</td>
                  <td className={`${td} whitespace-nowrap font-semibold text-[#0F2A52]`}>{tglIndo(w.selesai)}</td>
                  <td className={td}>{jumlahHariAntara(w.mulai, w.selesai) ?? "—"}</td>
                  <td className={`${td} min-w-[300px]`}>
                    {!e ? <span className="text-[#44546F]">Mengikuti pola</span> : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="whitespace-nowrap text-[#8A5A00]">Jadwal khusus</strong>
                          <div className="w-[120px] shrink-0"><PerkKecil perk={!!e.perk} mati={mati} nama={`Jadwal khusus ${P}`} onPilih={(v) => setE({ perk: v })} /></div>
                          {!mati && <button type="button" className={`${tombolKecil} whitespace-nowrap`} onClick={() => ubah((g) => { delete g.kecuali[P]; })}>Kembali ke pola</button>}
                        </div>
                        <input className={kolom} value={e.alasan} maxLength={200} disabled={mati} placeholder={ALASAN_KHUSUS} onChange={(ev) => setE({ alasan: ev.target.value })} aria-label={`Alasan jadwal khusus ${P}`} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[12px] text-[#5B6B84]">Pilih periode lewat tab di atas tabel, lalu ubah tanggalnya di baris Pendataan.</p>
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
            <SelectCari className={kolom} value={f.rujukan} disabled={mati} onChange={(e) => ubah((g) => { g.rujukan = e.target.value; })} aria-label="Survei yang dirujuk">
              <option value="">Pilih survei…</option>
              {lainnya.map((r) => <option key={`${r.ro}|${r.nama}`} value={r.nama}>{r.nama} · {r.ro}{r.sah ? "" : " · belum sah"}</option>)}
              {f.rujukan && !lainnya.some((r) => r.nama === f.rujukan) && <option value={f.rujukan}>{f.rujukan}</option>}
            </SelectCari>
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

