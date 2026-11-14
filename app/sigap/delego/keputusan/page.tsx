"use client";

// app/sigap/delego/keputusan/page.tsx
//
// (14 Nov 2026, Fase 7) Ruang keputusan (keu_ruang_keputusan), juga untuk HP Kepala: sinyal dari modul yang sudah ada.
// (14 Nov 2026, keputusan tercatat, SQL 20261114v) Tiap butir sinyal dapat DIPUTUSKAN di sini: pilihan + alasan tertulis, sekaligus butir kerja
// Delego bila perlu, lalu dievaluasi apakah sinyalnya hilang. Sistem menyarankan pilihan; pemutus memilih. Untuk Kepala dan pemberi delegasi.

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import KepalaKolom from "../../admin/KepalaKolom";
import { nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import { tglPendek } from "@/lib/delego/hitung";
import { BATAS_ISI, urutSinyal, type BahanKeputusan, type IsiSinyal, type Sinyal } from "@/lib/delego/meja";
import {
  argsKeputusan, galatKeputusan, ISIAN_KEPUTUSAN_KOSONG, judulButirBawaan, MIN_ALASAN, PILIHAN_SARAN, statusKeputusan, TEKS_EVALUASI,
  type BahanKeputusanTercatat, type HasilEvaluasi, type IsianKeputusan, type Keputusan, type RingkasKeputusan,
} from "@/lib/delego/keputusan";
import { useBacaFungsi, useKirim } from "../data";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Lencana, Medan, Memuat, Statistik } from "../ui";

type Kirim = ReturnType<typeof useKirim>;
type Sasaran = { kode: string; judul: string; kunci: string; teks: string; sub: string; ident_id?: number | null };

const ALUR = ["Sinyal", "Usulan sistem", "Pemutus", "Keputusan tercatat", "Menjadi pekerjaan", "Dievaluasi"];

function LencanaKeputusan({ k }: { k: RingkasKeputusan | null | undefined }) {
  const st = statusKeputusan(k ?? null);
  if (!k || !st) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Lencana nada={st.nada}>{st.teks}</Lencana>
      <span className="text-[12px] text-[#3B4A57]">{k.pilihan} · {k.pemutus}</span>
    </span>
  );
}

function FormKeputusan({ s, b, kirim, tutup }: { s: Sasaran; b: BahanKeputusanTercatat; kirim: Kirim; tutup: () => void }) {
  const [f, setF] = useState<IsianKeputusan>(ISIAN_KEPUTUSAN_KOSONG);
  const adaIdent = !!s.ident_id;
  const g = galatKeputusan(f, b.hari_ini, adaIdent);
  const saran = PILIHAN_SARAN[s.kode] ?? [];
  const idDaftar = `saran-${s.kunci.replace(/[^a-z0-9]/gi, "-")}`;
  const ubah = (x: Partial<IsianKeputusan>) => setF((lama) => ({ ...lama, ...x }));
  return (
    <div className="mt-2 space-y-2.5 rounded-lg bg-[#F1F7F6] p-3">
      {saran.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Pilihan yang disarankan">
          {saran.map((p) => (
            <button key={p} type="button" aria-pressed={f.pilihan === p} onClick={() => ubah({ pilihan: p, judulButir: f.judulButir || judulButirBawaan(p, s.teks) })}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] font-semibold ${f.pilihan === p ? "border-[#0F6B63] bg-white ring-2 ring-[#0F6B63]" : "border-[#BCC6CE] bg-white"}`}>
              {p}
            </button>
          ))}
        </div>
      )}
      <Medan label="Pilihan yang diambil" bantu="Pilih dari saran atau tulis sendiri.">
        <input className={KELAS.isian} list={idDaftar} value={f.pilihan} maxLength={300} onChange={(e) => ubah({ pilihan: e.target.value })} />
        <datalist id={idDaftar}>{saran.map((p) => <option key={p} value={p} />)}</datalist>
      </Medan>
      <Medan label="Alasan (wajib)" bantu={`Minimal ${MIN_ALASAN} huruf. Tercatat bersama nama Anda dan waktu keputusan.`}>
        <textarea className={KELAS.isian} rows={2} value={f.alasan} maxLength={1000} onChange={(e) => ubah({ alasan: e.target.value })} />
      </Medan>
      <label className="flex items-center gap-2 text-[13.5px] font-semibold">
        <input type="checkbox" checked={f.butir} onChange={(e) => ubah({ butir: e.target.checked, judulButir: f.judulButir || judulButirBawaan(f.pilihan, s.teks) })} />
        Terbitkan butir kerja di Delego
      </label>
      {f.butir && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Medan label="Penerima">
            <select className={KELAS.isian} value={f.penerima ?? ""} onChange={(e) => ubah({ penerima: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Pilih pegawai</option>
              {b.organik.map((o) => <option key={o.akun_id} value={o.akun_id}>{o.nama}</option>)}
            </select>
          </Medan>
          <Medan label="Tenggat">
            <input type="date" className={KELAS.isian} min={b.hari_ini} value={f.tenggat} onChange={(e) => ubah({ tenggat: e.target.value })} />
          </Medan>
          <Medan label="Judul butir kerja">
            <input className={KELAS.isian} value={f.judulButir} maxLength={200} onChange={(e) => ubah({ judulButir: e.target.value })} />
          </Medan>
          <Medan label="Beban harian (poin)" bantu="Kapasitas harian 100 poin.">
            <input className={KELAS.isian} inputMode="decimal" value={f.targetHarian} onChange={(e) => ubah({ targetHarian: e.target.value })} />
          </Medan>
          {!adaIdent && (
            <Medan label="Pekerjaan tim" bantu={b.kelompok.length === 0 ? "Belum ada pekerjaan tim yang boleh Anda delegasikan." : undefined}>
              <select className={KELAS.isian} value={f.kelompok} onChange={(e) => ubah({ kelompok: e.target.value })}>
                <option value="">Pilih pekerjaan tim</option>
                {b.kelompok.map((k) => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
              </select>
            </Medan>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim || !!g}
          onClick={async () => { if (await kirim.kirim("keu_keputusan_catat", argsKeputusan(s, f))) tutup(); }}>
          Catat keputusan
        </button>
        <button type="button" className={KELAS.tombolKecil} onClick={tutup}>Batal</button>
        {g && (f.pilihan || f.alasan) && <span className="text-[12.5px] text-[#8A4605]">{g}</span>}
      </div>
    </div>
  );
}

function ButirSinyal({ s, x, b, kirim, bolehPutus }: { s: Sinyal; x: IsiSinyal; b: BahanKeputusanTercatat | null; kirim: Kirim; bolehPutus: boolean }) {
  const [buka, setBuka] = useState(false);
  const bisa = bolehPutus && !!b && !!x.kunci;
  return (
    <li className="min-w-0 border-b border-[#EEF2F5] pb-1.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="min-w-0">
          {x.tautan ? <Link href={x.tautan} className="font-semibold text-[#0F6B63] underline">{x.teks}</Link> : <span className="font-semibold">{x.teks}</span>}
          <span className="text-[#3B4A57]"> · {x.sub}</span>
        </span>
        {bisa && !x.keputusan && !buka && <button type="button" className={KELAS.tombolKecil} onClick={() => setBuka(true)}>Putuskan</button>}
      </div>
      {x.keputusan && <div className="mt-1"><LencanaKeputusan k={x.keputusan} /></div>}
      {buka && b && x.kunci && (
        <FormKeputusan s={{ kode: s.kode, judul: s.judul, kunci: x.kunci, teks: x.teks, sub: x.sub, ident_id: x.ident_id ?? null }} b={b} kirim={kirim} tutup={() => setBuka(false)} />
      )}
    </li>
  );
}

function KartuSinyal({ s, b, kirim, bolehPutus }: { s: Sinyal; b: BahanKeputusanTercatat | null; kirim: Kirim; bolehPutus: boolean }) {
  const [semua, setSemua] = useState(false);
  const [buka, setBuka] = useState(false);
  const isi = semua ? s.isi : s.isi.slice(0, BATAS_ISI);
  const putusSekaligus = !!s.kunci && s.jumlah > 0;
  return (
    <div className={`${KELAS.kartu} space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={s.tautan} className="text-[15px] font-semibold text-[#14212B] hover:underline">{s.judul}</Link>
        <Lencana nada={s.jumlah > 0 ? s.nada : "hijau"}>{s.jumlah > 0 ? s.jumlah : "Aman"}</Lencana>
      </div>
      {putusSekaligus && (
        <div className="flex flex-wrap items-center gap-2">
          {s.keputusan ? <LencanaKeputusan k={s.keputusan} /> : bolehPutus && b && !buka && <button type="button" className={KELAS.tombolKecil} onClick={() => setBuka(true)}>Putuskan untuk semua</button>}
        </div>
      )}
      {buka && b && s.kunci && (
        <FormKeputusan s={{ kode: s.kode, judul: s.judul, kunci: s.kunci, teks: s.judul, sub: `${s.jumlah} pegawai`, ident_id: null }} b={b} kirim={kirim} tutup={() => setBuka(false)} />
      )}
      {s.jumlah > 0 && (
        <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
          {isi.map((x, i) => putusSekaligus
            ? (
              <li key={`${s.kode}-${i}`} className="min-w-0"><span className="font-semibold">{x.teks}</span><span className="text-[#3B4A57]"> · {x.sub}</span></li>
            )
            : <ButirSinyal key={x.kunci ?? `${s.kode}-${i}`} s={s} x={x} b={b} kirim={kirim} bolehPutus={bolehPutus} />)}
        </ul>
      )}
      {s.isi.length > BATAS_ISI && (
        <button type="button" className={KELAS.tombolKecil} onClick={() => setSemua(!semua)}>{semua ? "Ringkas" : `Lihat semua (${s.isi.length})`}</button>
      )}
    </div>
  );
}

const JENIS: Record<string, string> = {
  naik_kepala: "Lewat tenggat", sanggah: "Sanggahan", gap_keras: "Gap", spk: "SPK", usulan: "Usulan", tanpa_catatan: "Pencatatan", lainnya: "Lainnya",
};
type K = "tanggal" | "jenis" | "perihal" | "pilihan" | "pemutus" | "butir" | "evaluasi";
const KOLOM: { id: K; label: string }[] = [
  { id: "tanggal", label: "Tanggal" }, { id: "jenis", label: "Jenis" }, { id: "perihal", label: "Perihal" }, { id: "pilihan", label: "Pilihan" },
  { id: "pemutus", label: "Pemutus" }, { id: "butir", label: "Butir kerja" }, { id: "evaluasi", label: "Evaluasi" },
];
const nilai: NilaiSel<Keputusan, K> = (k, id) =>
  id === "tanggal" ? k.diputus_at.slice(0, 10) : id === "jenis" ? (JENIS[k.sinyal_kode] ?? k.sinyal_kode) : id === "perihal" ? k.judul : id === "pilihan" ? k.pilihan
    : id === "pemutus" ? k.pemutus : id === "butir" ? (k.butir === 0 ? "tanpa butir" : `${k.butir_selesai}/${k.butir} selesai`) : (k.evaluasi_hasil ? TEKS_EVALUASI[k.evaluasi_hasil].teks : "belum");

function FormEvaluasi({ k, kirim, tutup }: { k: Keputusan; kirim: Kirim; tutup: () => void }) {
  const [hasil, setHasil] = useState<HasilEvaluasi | "">("");
  const [catatan, setCatatan] = useState("");
  const ok = !!hasil && catatan.trim().length >= MIN_ALASAN;
  return (
    <div className="space-y-2 rounded-lg bg-[#F1F7F6] p-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Hasil evaluasi">
        {(Object.keys(TEKS_EVALUASI) as HasilEvaluasi[]).map((h) => (
          <button key={h} type="button" role="radio" aria-checked={hasil === h} onClick={() => setHasil(h)}
            className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold ${hasil === h ? "border-[#0F6B63] bg-white ring-2 ring-[#0F6B63]" : "border-[#BCC6CE] bg-white"}`}>
            {TEKS_EVALUASI[h].teks}
          </button>
        ))}
      </div>
      <Medan label="Catatan evaluasi" bantu={`Minimal ${MIN_ALASAN} huruf: apa yang berhasil, apa yang perlu diubah.`}>
        <textarea className={KELAS.isian} rows={2} value={catatan} maxLength={1000} onChange={(e) => setCatatan(e.target.value)} />
      </Medan>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim || !ok}
          onClick={async () => { if (await kirim.kirim("keu_keputusan_evaluasi", { p_id: k.id, p_hasil: hasil, p_catatan: catatan.trim() })) tutup(); }}>
          Simpan evaluasi
        </button>
        <button type="button" className={KELAS.tombolKecil} onClick={tutup}>Batal</button>
      </div>
    </div>
  );
}

function TabelKeputusan({ baris, kirim }: { baris: Keputusan[]; kirim: Kirim }) {
  const [saring, setSaring] = useState<Saring<K>>({});
  const [urut, setUrut] = useState<Urut<K>>(null);
  const [buka, setBuka] = useState<number | null>(null);
  const tampil = useMemo(() => terapkanTabel(baris, saring, urut, nilai), [baris, saring, urut]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-[#D5DDE3] text-left text-[12px] text-[#3B4A57]">
            {KOLOM.map((k) => (
              <th key={k.id} className="px-1 py-1.5 font-semibold">
                <KepalaKolom id={k.id} label={k.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(baris, k.id, nilai, false)} />
              </th>
            ))}
            <th className="px-1 py-1.5" aria-label="Tindakan" />
          </tr>
        </thead>
        <tbody>
          {tampil.map((k) => (
            <Fragment key={k.id}>
              <tr className="border-b border-[#EEF2F5] align-top">
                <td className="whitespace-nowrap px-1 py-1.5">{tglPendek(k.diputus_at.slice(0, 10))}</td>
                <td className="px-1 py-1.5">{JENIS[k.sinyal_kode] ?? k.sinyal_kode}</td>
                <td className="px-1 py-1.5"><div className="font-semibold">{k.judul}</div><div className="text-[12px] text-[#3B4A57]">{k.alasan}</div></td>
                <td className="px-1 py-1.5">{k.pilihan}</td>
                <td className="px-1 py-1.5">{k.pemutus}</td>
                <td className="px-1 py-1.5">
                  {k.butir === 0 ? <span className="text-[#3B4A57]">tanpa butir</span> : k.butir_isi.map((d) => (
                    <div key={d.id} className="text-[12px]">{d.judul} · {d.penerima} · {d.status}</div>
                  ))}
                </td>
                <td className="px-1 py-1.5">
                  {k.evaluasi_hasil ? <><Lencana nada={TEKS_EVALUASI[k.evaluasi_hasil].nada}>{TEKS_EVALUASI[k.evaluasi_hasil].teks}</Lencana><div className="text-[12px] text-[#3B4A57]">{k.evaluasi_catatan}</div></> : <span className="text-[#3B4A57]">belum</span>}
                </td>
                <td className="px-1 py-1.5 text-right">
                  {buka !== k.id && <button type="button" className={KELAS.tombolKecil} onClick={() => setBuka(k.id)}>{k.evaluasi_hasil ? "Ubah evaluasi" : "Evaluasi"}</button>}
                </td>
              </tr>
              {buka === k.id && (
                <tr><td colSpan={8} className="px-1 py-2"><FormEvaluasi k={k} kirim={kirim} tutup={() => setBuka(null)} /></td></tr>
              )}
            </Fragment>
          ))}
          {tampil.length === 0 && (
            <tr><td colSpan={8} className="py-2 text-center text-[#3B4A57]">{baris.length === 0 ? "Belum ada keputusan tercatat." : "Tidak ada baris yang cocok dengan saringan."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RuangKeputusan() {
  const k = useBacaFungsi<BahanKeputusan>("keu_ruang_keputusan", {}, { simpan: false });
  const t = useBacaFungsi<BahanKeputusanTercatat>("keu_keputusan_bahan", {}, { simpan: false });
  const kirim = useKirim(async () => { await Promise.all([k.muat(), t.muat()]); });
  const d = k.data;
  const b = t.data;
  const menunggu = d ? d.sinyal.reduce((n, s) => n + (s.kunci ? (s.jumlah > 0 && !s.keputusan ? 1 : 0) : s.isi.filter((x) => x.kunci && !x.keputusan).length), 0) : 0;
  return (
    <Halaman judul="Ruang keputusan" sub="Sinyal dari semua modul menjadi keputusan yang tercatat dengan alasan, lalu menjadi pekerjaan dan dievaluasi.">
      {k.memuat && !d && <Memuat />}
      {k.galat && !d && <Galat>{k.galat}</Galat>}
      {d && (
        <>
          <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[12.5px]" aria-label="Alur keputusan">
            {ALUR.map((a, i) => (
              <li key={a} className="inline-flex items-center gap-1.5 rounded-full border border-[#D5DCE2] bg-white px-2.5 py-1">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0F2A52] text-[11px] font-bold text-white">{i + 1}</span>{a}
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Statistik label="Menunggu keputusan" nilai={menunggu} nada={menunggu > 0 ? "amber" : "biasa"} />
            <Statistik label="Diputuskan bulan ini" nilai={b?.ringkas.bulan_ini ?? "-"} />
            <Statistik label="Butir kerja belum selesai" nilai={b?.ringkas.tanpa_tindak_lanjut ?? "-"} ket="dari keputusan yang menerbitkan butir" />
            <Statistik label="Menunggu evaluasi" nilai={b?.ringkas.tunggu_evaluasi ?? "-"} ket="butir selesai atau tanpa butir" />
          </div>
          {kirim.galat && <Galat>{kirim.galat}</Galat>}
          {t.galat && !b && <Galat>{t.galat}</Galat>}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {urutSinyal(d.sinyal).map((s) => <KartuSinyal key={s.kode} s={s} b={b} kirim={kirim} bolehPutus={!!b} />)}
          </div>
          <Info>Sistem menyarankan pilihan; keputusan diambil pemutus dan wajib beralasan. Tindakan di layar asal (misalnya menerbitkan SPK atau menjawab sanggahan) tetap dilakukan di sana; keputusan di sini mencatat pilihan dan menugaskan tindak lanjutnya.</Info>
          <section className={`${KELAS.kartu} space-y-2`}>
            <h2 className="m-0 text-[15px] font-semibold text-[#14212B]">Keputusan tercatat</h2>
            {b ? <TabelKeputusan baris={b.keputusan} kirim={kirim} /> : <Memuat />}
          </section>
        </>
      )}
    </Halaman>
  );
}
