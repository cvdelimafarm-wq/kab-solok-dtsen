"use client";

// app/sigap/master/Anggaran.tsx
//
// (24 Okt 2026, tahap 14) Master anggaran (papan 14): struktur mata anggaran, kelompok + komponen + prioritas + parameter kecukupan, waktu, dan skor RAB.
// Hak mengubah ditegakkan basis data (keu_jaga: master = Admin/PPK, bobot = PPK); tombol ubah hanya muncul bagi yang berhak. Tanpa hapus.

import { useMemo, useState } from "react";
import { angka } from "@/lib/keu/ro";
import {
  argsSkor, argsWaktu, komaDariAngka, periksaFaktor, periksaSkor, periksaToleransi, periksaWaktu, persenDariPecahan, pratinjauSkor, ringkasKelompok,
  teksTanggal, teksTotalBobot, waktuBertanggal,
  type AkunMaster, type PakaiAkun, type SkorRo, type SkorRow, type WaktuMaster,
} from "@/lib/keu/master";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, label, tombolAktif, tombolKecil, tombolUtama } from "../keu-ui";
import { tulisKeuKlien, useKirim } from "../ro/useKeu";

type Sesudah = () => Promise<void>;
const TH = "px-2.5 py-2";
const TABEL = "overflow-x-auto rounded-lg border border-[#DCE3EE]";
const THEAD = "bg-[#EEF3FB] text-[#44546F]";

// ---------------------------------------------------------------- struktur
export type LevelStruktur = { kode: string; no: number; nama: string; istilah_sakti: string; contoh: string | null; format_ket: string | null; induk_kode: string | null; pengusul: string; tampil: boolean };
const PENGUSUL: Record<string, string> = { tim: "Tim kegiatan", ppk: "PPK", pusat: "Pusat (ditetapkan DJA)" };

export function BagianStruktur({ level, jumlah, boleh, sesudah }: { level: LevelStruktur[]; jumlah: Map<string, number>; boleh: boolean; sesudah: Sesudah }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const urut = [...level].sort((a, b) => a.no - b.no);
  const sub = level.find((l) => l.kode === "subkomp");
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Struktur mata anggaran</h2>
        <Chip warna="biru">Penambahan level: papan Struktur level</Chip>
      </div>
      {sub && (
        <div className="flex flex-wrap items-center gap-2.5">
          {boleh ? (
            <button type="button" disabled={mengirim} className={sub.tampil ? tombolAktif : tombolKecil} onClick={() => void jalankan(() => tulisKeuKlien("keu_struktur_level", "update", { tampil: !sub.tampil }, { kode: "subkomp" }))}>
              Subkomponen: {sub.tampil ? "ditampilkan" : "disembunyikan"}
            </button>
          ) : <Chip warna={sub.tampil ? "hijau" : "abu"}>Subkomponen {sub.tampil ? "ditampilkan" : "disembunyikan"}</Chip>}
          <span className="text-[12.5px] text-[#5B6B84]">{sub.tampil ? "Subkomponen muncul sebagai tingkat tersendiri di Anggaran RO dan Kertas Kerja." : "Subkomponen tidak muncul sebagai tingkat tersendiri; item tetap di bawah komponennya."}</span>
        </div>
      )}
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Level mengikuti judul Laporan Ketersediaan Dana Detail. Jumlah dihitung dari POK yang berlaku; kodenya berasal dari POK resmi, bukan dikarang SIGAP. Menambah level dilakukan lewat Kertas Kerja Revisi dan menjadi aktif setelah POK resmi terbit.</p>
      <div className={TABEL}>
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead className={THEAD}><tr><th className={TH}>Level</th><th className={TH}>Sebutan di laporan SAKTI</th><th className={TH}>Bentuk kode</th><th className={`${TH} text-right`}>Jumlah di POK</th><th className={TH}>Yang mengusulkan</th></tr></thead>
          <tbody>{urut.map((l) => (
            <tr key={l.kode} className="border-t border-[#EEF2F7] align-top">
              <td className={`${TH} font-semibold`}>{l.no}. {l.nama}</td>
              <td className={TH}>{l.istilah_sakti}</td>
              <td className={`${TH} text-[11.5px] text-[#5B6B84]`}>{l.format_ket ?? l.contoh ?? "-"}</td>
              <td className={`${TH} text-right font-mono`}>{angka(jumlah.get(l.kode) ?? 0)}</td>
              <td className={`${TH} text-[11.5px]`}>{PENGUSUL[l.pengusul] ?? l.pengusul}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Galat pesan={galat} />
    </section>
  );
}

// ---------------------------------------------------------------- kelompok, komponen, prioritas, parameter
export type KelompokBelanja = { kode: string; nama: string; urut: number };
export type Prioritas = { kode: string; nama: string; warna: string; urut: number };
export type ParamRow = { kode: string; nilai: number | string; ket: string | null };
const WARNA_PRIO: Record<string, "merah" | "kuning" | "hijau" | "biru" | "abu" | "ungu"> = { merah: "merah", kuning: "kuning", hijau: "hijau", biru: "biru", abu: "abu", ungu: "ungu" };

export function BagianKelompok({ kelompok, akun, pakai, komponen, prioritas, param, boleh, sesudah }: {
  kelompok: KelompokBelanja[]; akun: AkunMaster[]; pakai: PakaiAkun; komponen: { kode: string; nama: string }[]; prioritas: Prioritas[]; param: ParamRow[]; boleh: boolean; sesudah: Sesudah;
}) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const ring = useMemo(() => ringkasKelompok([...kelompok].sort((a, b) => a.urut - b.urut), akun, pakai), [kelompok, akun, pakai]);
  const pF = param.find((p) => p.kode === "faktor_kebutuhan");
  const pT = param.find((p) => p.kode === "toleransi_cukup");
  const [f, setF] = useState(pF ? komaDariAngka(Number(pF.nilai)) : "");
  const [t, setT] = useState(pT ? persenDariPecahan(Number(pT.nilai)) : "");
  const cf = periksaFaktor(f), ct = periksaToleransi(t);
  const berubahF = pF !== undefined && cf.nilai !== null && cf.nilai !== Number(pF.nilai);
  const berubahT = pT !== undefined && ct.nilai !== null && ct.nilai !== Number(pT.nilai);
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <h2 className={judulKartu}>Kelompok belanja, komponen, dan prioritas</h2>
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Kelompok belanja menentukan siapa boleh memberi dan menerima dana dalam revisi (R-16): 524xxx hanya dengan 524xxx, 52xxxx lain hanya dengan 52xxxx lain. Dana penggenap hanya menutup kekurangan di kelompok yang sama dan tidak boleh minus (R-17).</p>
      <div className={TABEL}>
        <table className="w-full min-w-[700px] text-left text-[12.5px]">
          <thead className={THEAD}><tr><th className={TH}>Kelompok</th><th className={TH}>Nama</th><th className={`${TH} text-right`}>Akun</th><th className={`${TH} text-right`}>Nilai POK (Rp)</th><th className={TH}>Aturan geser</th></tr></thead>
          <tbody>{ring.map((r) => (
            <tr key={r.kode} className="border-t border-[#EEF2F7]">
              <td className={`${TH} font-mono font-semibold`}>{r.kode}</td><td className={TH}>{r.nama}</td>
              <td className={`${TH} text-right font-mono`}>{angka(r.nAkun)}</td><td className={`${TH} text-right font-mono`}>{angka(r.nilai)}</td>
              <td className={`${TH} text-[11.5px] text-[#5B6B84]`}>{r.aturan}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Komponen ({komponen.length})</h3>
          <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
            {komponen.map((k) => <div key={k.kode} className="flex gap-2 text-[12.5px]"><span className="w-[44px] flex-none font-mono font-semibold">{k.kode}</span><span>{k.nama}</span></div>)}
            {komponen.length === 0 && <span className="text-[12.5px] text-[#5B6B84]">Belum ada komponen pada POK berlaku.</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Kategori prioritas item (urutan penerima dana)</h3>
          {[...prioritas].sort((a, b) => a.urut - b.urut).map((p) => (
            <div key={p.kode} className="flex items-center gap-2"><Chip warna={WARNA_PRIO[p.warna] ?? "abu"}>{p.nama}</Chip><span className="text-[12px] text-[#5B6B84]">urutan {p.urut}</span></div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
        <h3 className="text-[14px] font-bold text-[#0F2A52]">Parameter kecukupan RAB terhadap POK</h3>
        <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Kebutuhan KRO (K) dihitung dari RAB: item belum selesai dibagi faktor kebutuhan, ditambah item selesai. POK disebut Cukup bila berada antara K dan K ditambah toleransi; di atasnya Lebih, di bawahnya Kurang. Dipakai Peta KRO Satker dan Kertas Kerja.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className={label} htmlFor="pr-f">Faktor kebutuhan (0,5 sampai 1,0)</label><input id="pr-f" inputMode="decimal" disabled={!boleh} className={kolom} value={f} onChange={(e) => setF(e.target.value)} /></div>
          <div><label className={label} htmlFor="pr-t">Toleransi Cukup (persen)</label><input id="pr-t" inputMode="decimal" disabled={!boleh} className={kolom} value={t} onChange={(e) => setT(e.target.value)} /></div>
          {boleh && (
            <button type="button" disabled={mengirim || (!berubahF && !berubahT)} className={tombolUtama} onClick={() => void jalankan(async () => {
              if (berubahF) { const r = await tulisKeuKlien("keu_master_param", "update", { nilai: cf.nilai }, { kode: "faktor_kebutuhan" }); if (!r.ok) return r; }
              return berubahT ? tulisKeuKlien("keu_master_param", "update", { nilai: ct.nilai }, { kode: "toleransi_cukup" }) : { ok: true as const, data: null };
            })}>Simpan parameter</button>
          )}
        </div>
        {(berubahF || berubahT || f !== (pF ? komaDariAngka(Number(pF.nilai)) : "") || t !== (pT ? persenDariPecahan(Number(pT.nilai)) : "")) && <Galat pesan={[...cf.galat, ...ct.galat]} />}
        <p className="text-[11.5px] text-[#7A8AA3]">Nilai berlaku saat ini: faktor {pF ? komaDariAngka(Number(pF.nilai)) : "-"}, toleransi {pT ? `${persenDariPecahan(Number(pT.nilai))} persen` : "-"}. Perubahan berlaku ke depan dan dicatat di riwayat master.</p>
      </div>
      <Galat pesan={galat} />
      {!boleh && <Catatan>Anda hanya dapat melihat master. Yang dapat mengubah: Admin Aplikasi dan PPK.</Catatan>}
    </section>
  );
}

// ---------------------------------------------------------------- waktu
const TERKUNCI = new Set(["profil_penarikan", "tahun_anggaran", "masa_penugasan"]);

function BarisWaktu({ w, boleh, mengirim, simpan }: { w: WaktuMaster; boleh: boolean; mengirim: boolean; simpan: (args: Record<string, unknown>) => Promise<boolean> }) {
  const [sunting, setSunting] = useState<string | null>(null);
  const bertanggal = waktuBertanggal(w);
  const bisa = boleh && (bertanggal || !TERKUNCI.has(w.kode));
  const g = sunting === null ? [] : periksaWaktu(w, sunting);
  return (
    <tr className="border-t border-[#EEF2F7] align-top">
      <td className={`${TH} font-semibold`}>{w.nama}</td>
      <td className={TH}>
        {sunting === null ? (
          <span>{bertanggal && w.nilai_tanggal ? teksTanggal(w.nilai_tanggal) : w.nilai}{bisa && <button type="button" className="ml-2 text-[11.5px] font-semibold text-[#1F5FD1] underline" onClick={() => setSunting(bertanggal ? (w.nilai_tanggal ?? "") : w.nilai)}>ubah</button>}</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              <input aria-label={`Nilai ${w.nama}`} type={bertanggal ? "date" : "text"} className={`${kolom} !min-h-[34px] !w-auto min-w-[200px]`} value={sunting} onChange={(e) => setSunting(e.target.value)} />
              <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void simpan({ kode: w.kode, ...argsWaktu(w, sunting) }).then((ok) => { if (ok) setSunting(null); })}>Simpan</button>
              <button type="button" className={tombolKecil} onClick={() => setSunting(null)}>Batal</button>
            </div>
            <Galat pesan={g} />
          </div>
        )}
      </td>
      <td className={`${TH} text-[11.5px] text-[#5B6B84]`}>{w.ket}{boleh && !bisa && " (diatur dari tempat lain)"}</td>
    </tr>
  );
}

export function BagianWaktu({ waktu, boleh, sesudah }: { waktu: WaktuMaster[]; boleh: boolean; sesudah: Sesudah }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const urut = [...waktu].sort((a, b) => a.urut - b.urut);
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <h2 className={judulKartu}>Master waktu</h2>
      <div className={TABEL}>
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead className={THEAD}><tr><th className={TH}>Pengaturan</th><th className={TH}>Nilai</th><th className={TH}>Keterangan</th></tr></thead>
          <tbody>{urut.map((w) => (
            <BarisWaktu key={`${w.kode}|${w.nilai}|${w.nilai_tanggal ?? ""}`} w={w} boleh={boleh} mengirim={mengirim}
              simpan={(args) => { const { kode, ...data } = args; return jalankan(() => tulisKeuKlien("keu_master_waktu", "update", data, { kode })); }} />
          ))}</tbody>
        </table>
      </div>
      <Galat pesan={galat} />
      <p className="text-[12.5px] text-[#5B6B84]">Tenggat adalah pengingat, tidak mengunci. Jadwal revisi tiap bulan dibuat PPK di Jadwal revisi dengan nilai bawaan dari sini. Tahun anggaran, profil penarikan, dan masa penugasan dibaca langsung oleh bagian lain sehingga tidak diubah dari tabel ini.</p>
      {!boleh && <Catatan>Anda hanya dapat melihat master. Yang dapat mengubah: Admin Aplikasi dan PPK.</Catatan>}
    </section>
  );
}

// ---------------------------------------------------------------- skor RAB
const WARNA_LABEL: Record<string, "hijau" | "kuning" | "merah" | "abu"> = { Baik: "hijau", Cukup: "kuning", "Perlu pembinaan": "merah", "-": "abu" };
const nilaiSkor = (v: number | null) => (v === null ? "-" : String(Math.round(v * 10) / 10).replace(".", ","));

export function BagianSkor({ skor, hasil, namaRo, boleh, sesudah }: { skor: SkorRow; hasil: SkorRo[]; namaRo: Map<string, string>; boleh: boolean; sesudah: Sesudah }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const [b, setB] = useState({ penarikan: String(skor.bobot_penarikan), volume: String(skor.bobot_volume), cakupan: String(skor.bobot_cakupan), disiplin: String(skor.bobot_disiplin) });
  const [a, setA] = useState({ baik: String(skor.ambang_baik), cukup: String(skor.ambang_cukup) });
  const bobot = { penarikan: Number(b.penarikan), volume: Number(b.volume), cakupan: Number(b.cakupan), disiplin: Number(b.disiplin) };
  const ambang = { baik: Number(a.baik), cukup: Number(a.cukup) };
  const adaIsi = Object.values(b).every((x) => x.trim() !== "") && Object.values(a).every((x) => x.trim() !== "");
  const g = adaIsi ? periksaSkor(bobot, ambang) : ["Semua bobot dan ambang harus diisi."];
  const asli = { penarikan: Number(skor.bobot_penarikan), volume: Number(skor.bobot_volume), cakupan: Number(skor.bobot_cakupan), disiplin: Number(skor.bobot_disiplin) };
  const berubah = adaIsi && (bobot.penarikan !== asli.penarikan || bobot.volume !== asli.volume || bobot.cakupan !== asli.cakupan || bobot.disiplin !== asli.disiplin || ambang.baik !== Number(skor.ambang_baik) || ambang.cukup !== Number(skor.ambang_cukup));
  const pratinjau = useMemo(() => (g.length === 0 ? pratinjauSkor(hasil, bobot, ambang) : null), [hasil, g.length, b, a]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (id: string, teks: string, nilai: string, ubah: (v: string) => void) => (
    <div><label className={label} htmlFor={id}>{teks}</label><input id={id} inputMode="numeric" disabled={!boleh} className={kolom} value={nilai} onChange={(e) => ubah(e.target.value)} /></div>
  );
  const baris = (h: ReturnType<typeof pratinjauSkor>["tertinggi"][number]) => (
    <tr key={h.ro_kode} className="border-t border-[#EEF2F7]">
      <td className={TH}><span className="font-mono font-semibold">{h.ro_kode}</span> <span className="text-[11.5px] text-[#5B6B84]">{namaRo.get(h.ro_kode) ?? ""}</span></td>
      <td className={`${TH} text-right font-mono`}>{nilaiSkor(h.penarikan)}</td><td className={`${TH} text-right font-mono`}>{nilaiSkor(h.volume)}</td>
      <td className={`${TH} text-right font-mono`}>{nilaiSkor(h.cakupan)}</td><td className={`${TH} text-right font-mono`}>{nilaiSkor(h.disiplin)}</td>
      <td className={`${TH} text-right font-mono font-semibold`}>{nilaiSkor(h.skor)}</td><td className={TH}><Chip warna={WARNA_LABEL[h.label] ?? "abu"}>{h.label}</Chip></td>
    </tr>
  );
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Skor kualitas RAB: bobot dan ambang</h2>
        <Chip warna="biru">{boleh ? "PPK dapat mengubah" : "Hanya PPK yang mengubah"}</Chip>
      </div>
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Skor dilihat semua pengguna dan bersifat pembinaan. Papan skor RAB membaca bobot dan ambang dari sini. Yang ditetapkan di sini hanya cara menimbangnya; komponen yang belum dapat dinilai (tanda "-") tidak ikut menimbang.</p>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {field("sb1", "Bobot ketepatan rencana penarikan", b.penarikan, (v) => setB({ ...b, penarikan: v }))}
        {field("sb2", "Bobot ketepatan volume", b.volume, (v) => setB({ ...b, volume: v }))}
        {field("sb3", "Bobot cakupan RAB", b.cakupan, (v) => setB({ ...b, cakupan: v }))}
        {field("sb4", "Bobot disiplin revisi", b.disiplin, (v) => setB({ ...b, disiplin: v }))}
      </div>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {field("sa1", "Skor minimal untuk Baik", a.baik, (v) => setA({ ...a, baik: v }))}
        {field("sa2", "Skor minimal untuk Cukup", a.cukup, (v) => setA({ ...a, cukup: v }))}
        <p className="self-end pb-2 text-[12px] text-[#5B6B84] sm:col-span-2">{g.length === 0 ? teksTotalBobot(bobot, boleh) : ""}</p>
      </div>
      {boleh && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={mengirim || g.length > 0 || !berubah} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_skor", "update", argsSkor(bobot, ambang), { id: skor.id }))}>Simpan bobot dan ambang</button>
          {berubah && <button type="button" className={tombolKecil} onClick={() => { setB({ penarikan: String(skor.bobot_penarikan), volume: String(skor.bobot_volume), cakupan: String(skor.bobot_cakupan), disiplin: String(skor.bobot_disiplin) }); setA({ baik: String(skor.ambang_baik), cukup: String(skor.ambang_cukup) }); }}>Kembalikan</button>}
        </div>
      )}
      {(berubah || g.length > 0) && <Galat pesan={g} />}
      <Galat pesan={galat} />
      <h3 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Pratinjau: tiga RO tertinggi dan tiga terendah (dengan isian di atas)</h3>
      {pratinjau && pratinjau.tertinggi.length > 0 ? (
        <div className={TABEL}>
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead className={THEAD}><tr><th className={TH}>RO</th><th className={`${TH} text-right`}>Penarikan</th><th className={`${TH} text-right`}>Volume</th><th className={`${TH} text-right`}>Cakupan</th><th className={`${TH} text-right`}>Disiplin</th><th className={`${TH} text-right`}>Skor</th><th className={TH}>Label</th></tr></thead>
            <tbody>{pratinjau.tertinggi.map(baris)}{pratinjau.terendah.length > 0 && <tr><td colSpan={7} className="bg-[#F4F7FC] px-2.5 py-1 text-[11px] font-semibold text-[#5B6B84]">Terendah</td></tr>}{pratinjau.terendah.map(baris)}</tbody>
          </table>
        </div>
      ) : <p className="text-[12.5px] text-[#5B6B84]">{g.length > 0 ? "Pratinjau muncul setelah isian sah." : "Belum ada RO yang dapat dinilai."}</p>}
      {!boleh && <Catatan>Hanya PPK yang mengubah bobot dan ambang (kewenangan "Mengubah bobot skor RAB").</Catatan>}
    </section>
  );
}
