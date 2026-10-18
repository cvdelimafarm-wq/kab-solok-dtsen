"use client";

// app/sigap/kelola/pendataan/MonTransport.tsx
//
// (19 Okt 2026) Variabel "Transport lokal" di tab Monitoring: jumlah hari menurut kelengkapan per orang (Lengkap / Sebagian / Kosong, Anomali kolom terpisah).
// Definisi: lihat kelasHari di lib/monitorKinerja.ts. Hanya-baca; penilaian laporan & foto memakai aturan yang sama dengan Monitoring Lapangan.

import { useMemo, useState } from "react";
import { persenLengkap, susunTransport, tglPendek, type BarisTransport, type DataKinerja, geser } from "@/lib/monitorKinerja";
import { Catatan, Kartu, Kpi, Persen, fmt, label, sel, td, tdAngka, th, tombol } from "./monUi";

type Rekap = "ppl" | "pml" | "tim";
type Urut = "bawaan" | "rendah" | "kosong";
type Cepat = "semua" | "hari" | "3hari" | "kustom";

const Pil = ({ n, gaya }: { n: number; gaya: "ok" | "warn" | "bad" | "gr" }) => {
  const c = gaya === "ok" ? "bg-[#E3F6EC] text-[#0B6B3F]" : gaya === "warn" ? "bg-[#FFF4D6] text-[#8A6200]" : gaya === "bad" ? "bg-[#FDE8E8] text-[#9B1C23]" : "bg-[#EEF2F7] text-[#6B7A90]";
  return <span className={`inline-block min-w-[26px] rounded-full px-2 py-0.5 text-center text-[12px] font-extrabold tabular-nums ${c}`}>{n}</span>;
};

export default function MonTransport({ data }: { data: DataKinerja }) {
  const [rekap, setRekap] = useState<Rekap>("ppl");
  const [pml, setPml] = useState<number | null>(null);
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<Urut>("bawaan");
  const [cepat, setCepat] = useState<Cepat>("semua");
  const [dari, setDari] = useState<string>("");
  const [sampai, setSampai] = useState<string>("");

  function pilih(c: Cepat) {
    setCepat(c);
    if (c === "semua") (setDari(""), setSampai(""));
    else if (c === "hari") (setDari(data.hari_ini), setSampai(data.hari_ini));
    else if (c === "3hari") (setDari(geser(data.hari_ini, -2)), setSampai(data.hari_ini));
  }

  const hasil = useMemo(() => susunTransport(data.orang, dari || null, sampai || null), [data, dari, sampai]);
  const timList = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of data.orang) if (o.pml_id != null && o.pml_nama) m.set(o.pml_id, o.pml_nama);
    return [...m.entries()].map(([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [data]);

  const q = cari.toLowerCase().replace(/\s+/g, " ").trim();
  const cocok = (b: BarisTransport) => (pml == null || b.pml_id === pml) && (!q || b.nama.toLowerCase().includes(q) || (b.pml_nama ?? "").toLowerCase().includes(q));

  // baris yang tampil menurut rekap
  const tampil = useMemo(() => {
    let baris: BarisTransport[];
    if (rekap === "ppl") baris = hasil.baris.filter((b) => (b.peran === "ppl" || b.peran === "korwil") && cocok(b));
    else if (rekap === "pml") baris = hasil.baris.filter((b) => b.peran === "pml" && cocok(b));
    else {
      // tim = PML + PPL di bawahnya (korwil tidak punya tim)
      const m = new Map<number, BarisTransport>();
      for (const b of hasil.baris) {
        if (b.peran === "korwil" || b.pml_id == null) continue;
        let t = m.get(b.pml_id);
        if (!t) m.set(b.pml_id, (t = { akun_id: b.pml_id, nama: b.pml_nama ?? `Tim ${b.pml_id}`, peran: "pml", pml_id: b.pml_id, pml_nama: b.pml_nama, hari_kerja: 0, lengkap: 0, sebagian: 0, kosong: 0, anomali: 0, tanggal_kosong: [], tanggal_sebagian: [], tanggal_anomali: [] }));
        t.hari_kerja += b.hari_kerja;
        t.lengkap += b.lengkap;
        t.sebagian += b.sebagian;
        t.kosong += b.kosong;
        t.anomali += b.anomali;
      }
      baris = [...m.values()].filter(cocok);
    }
    const rasio = (b: BarisTransport) => (b.hari_kerja > 0 ? b.lengkap / b.hari_kerja : 1);
    if (urut === "rendah") return [...baris].sort((a, b) => rasio(a) - rasio(b) || b.kosong - a.kosong || a.nama.localeCompare(b.nama));
    if (urut === "kosong") return [...baris].sort((a, b) => b.kosong - a.kosong || a.nama.localeCompare(b.nama));
    return [...baris].sort((a, b) => (a.pml_nama ?? "~").localeCompare(b.pml_nama ?? "~") || a.nama.localeCompare(b.nama));
  }, [hasil, rekap, pml, q, urut]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useMemo(() => {
    const r = { hari_kerja: 0, lengkap: 0, sebagian: 0, kosong: 0, anomali: 0 };
    for (const b of tampil) {
      r.hari_kerja += b.hari_kerja;
      r.lengkap += b.lengkap;
      r.sebagian += b.sebagian;
      r.kosong += b.kosong;
      r.anomali += b.anomali;
    }
    return r;
  }, [tampil]);

  async function unduh() {
    const XLSX = await import("xlsx");
    const baris = tampil.map((b) => ({ [rekap === "tim" ? "Tim (PML)" : rekap === "pml" ? "PML" : "Petugas"]: b.nama, Tim: b.pml_nama ?? "-", "Hari kerja dipilih": b.hari_kerja, Lengkap: b.lengkap, Sebagian: b.sebagian, Kosong: b.kosong, Anomali: b.anomali, "% lengkap": persenLengkap(b), "Tanggal kosong": b.tanggal_kosong.join(", "), "Tanggal anomali": b.tanggal_anomali.join(", ") }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris), "Transport lokal");
    XLSX.writeFile(wb, `monitoring-transport-${rekap}-${data.hari_ini}.xlsx`);
  }

  const tanggalTeks = (ts: string[]) => (ts.length ? ts.map(tglPendek).join(", ") : "");
  const peranTeks = (b: BarisTransport) => (b.peran === "korwil" ? "Korwil" : b.pml_nama ? `Tim ${b.pml_nama}` : "—");

  return (
    <section className="mt-4">
      <div className={`${"rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4"}`}>
        <div className="grid grid-cols-2 items-end gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">Rekap menurut</span>
            <div className="flex rounded-[12px] bg-[#EEF2F7] p-[3px]">
              {(["ppl", "pml", "tim"] as Rekap[]).map((r) => (
                <button key={r} type="button" onClick={() => setRekap(r)} className={`h-10 flex-1 rounded-[9px] px-3.5 text-[13px] font-extrabold sm:h-9 sm:flex-none ${rekap === r ? "bg-white text-[#0F2A52] shadow-[0_1px_5px_rgba(15,42,82,.12)]" : "text-[#55657D]"}`}>
                  {r === "ppl" ? "PPL" : r === "pml" ? "PML" : "Tim"}
                </button>
              ))}
            </div>
          </div>
          <label className={label}>
            Tim (PML)
            <select value={pml ?? ""} onChange={(e) => setPml(e.target.value ? Number(e.target.value) : null)} className={`${sel} font-normal normal-case tracking-normal sm:min-w-[170px]`}>
              <option value="">Semua tim</option>
              {timList.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nama}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Cari nama
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama petugas" className={`${sel} font-normal normal-case tracking-normal sm:min-w-[150px]`} />
          </label>
          <label className={label}>
            Urutkan
            <select value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className={`${sel} font-normal normal-case tracking-normal sm:min-w-[170px]`}>
              <option value="bawaan">Tim lalu nama</option>
              <option value="rendah">% lengkap terendah</option>
              <option value="kosong">Kosong terbanyak</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">Tanggal</span>
            <div className="flex rounded-[12px] bg-[#EEF2F7] p-[3px]">
              {([["semua", "Semua"], ["hari", "Hari ini"], ["3hari", "3 hari"]] as [Cepat, string][]).map(([k, n]) => (
                <button key={k} type="button" onClick={() => pilih(k)} className={`h-10 flex-1 rounded-[9px] px-2.5 text-[12.5px] font-extrabold sm:h-9 sm:flex-none ${cepat === k ? "bg-white text-[#0F2A52] shadow-[0_1px_5px_rgba(15,42,82,.12)]" : "text-[#55657D]"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className={label}>
            Dari
            <input type="date" value={dari} min={data.mulai_kegiatan} max={data.hari_ini} onChange={(e) => (setDari(e.target.value), setCepat("kustom"))} className={`${sel} font-normal normal-case tracking-normal`} />
          </label>
          <label className={label}>
            Sampai
            <input type="date" value={sampai} min={data.mulai_kegiatan} max={data.hari_ini} onChange={(e) => (setSampai(e.target.value), setCepat("kustom"))} className={`${sel} font-normal normal-case tracking-normal`} />
          </label>
          <button type="button" onClick={() => void unduh()} className={`${tombol} col-span-2 sm:col-span-1`}>
            Unduh Excel
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Transport lokal — jumlah hari menurut kelengkapan ({rekap === "ppl" ? "PPL" : rekap === "pml" ? "PML" : "tim"})</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          <Kpi judul="Hari lengkap" nilai={fmt(t.lengkap)} catatan={`dari ${fmt(t.hari_kerja)} hari kerja dipilih`} />
          <Kpi judul="Hari sebagian" nilai={fmt(t.sebagian)} />
          <Kpi judul="Hari kosong" nilai={fmt(t.kosong)} gaya={t.kosong > 0 ? "bahaya" : undefined} catatan="laporan & foto belum ada" />
          <Kpi judul="Anomali" nilai={fmt(t.anomali)} catatan="ada hasil, hari kerja tak dipilih" />
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-[14px] border border-[#E8EDF5] md:block">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10`}>{rekap === "tim" ? "Tim (PML)" : rekap === "pml" ? "PML" : "Petugas"}</th>
                <th className={th}>Tim</th>
                <th className={`${th} text-right`}>Hari kerja dipilih</th>
                <th className={`${th} text-right`}>Lengkap</th>
                <th className={`${th} text-right`}>Sebagian</th>
                <th className={`${th} text-right`}>Kosong</th>
                <th className={`${th} text-right`}>Anomali</th>
                <th className={th}>% lengkap</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((b) => (
                <tr key={`${b.peran}-${b.akun_id}`}>
                  <td className={`${td} sticky left-0 bg-white font-bold`}>{b.nama}</td>
                  <td className={td}>{peranTeks(b)}</td>
                  <td className={tdAngka}>{b.hari_kerja}</td>
                  <td className={tdAngka}>
                    <Pil n={b.lengkap} gaya="ok" />
                  </td>
                  <td className={tdAngka}>
                    <Pil n={b.sebagian} gaya={b.sebagian ? "warn" : "gr"} />
                  </td>
                  <td className={tdAngka} title={tanggalTeks(b.tanggal_kosong)}>
                    <Pil n={b.kosong} gaya={b.kosong ? "bad" : "gr"} />
                  </td>
                  <td className={tdAngka} title={tanggalTeks(b.tanggal_anomali)}>
                    <Pil n={b.anomali} gaya="gr" />
                  </td>
                  <td className={td}>
                    <Persen nilai={persenLengkap(b)} />
                  </td>
                </tr>
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td className={td} colSpan={8}>
                    Tidak ada data yang cocok dengan saringan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-2.5 md:hidden">
          {tampil.map((b) => (
            <Kartu
              key={`${b.peran}-${b.akun_id}`}
              judul={b.nama}
              sub={`${peranTeks(b)} · ${b.hari_kerja} hari kerja dipilih`}
              nilai={b.hari_kerja > 0 ? persenLengkap(b) : null}
              etiket="Hari lengkap"
              utama={[["Lengkap", String(b.lengkap)], ["Sebagian", String(b.sebagian)], ["Kosong", String(b.kosong)], ["Anomali", String(b.anomali)]]}
              lain={[]}
              anak={
                (b.tanggal_kosong.length > 0 || b.tanggal_anomali.length > 0) && (
                  <p className="mt-2 text-[11.5px] leading-snug text-[#55657D]">
                    {b.tanggal_kosong.length > 0 && (
                      <span className="block">
                        Kosong: <b className="text-[#9B1C23]">{tanggalTeks(b.tanggal_kosong)}</b>
                      </span>
                    )}
                    {b.tanggal_anomali.length > 0 && (
                      <span className="block">
                        Anomali: <b>{tanggalTeks(b.tanggal_anomali)}</b>
                      </span>
                    )}
                  </p>
                )
              }
            />
          ))}
          {tampil.length === 0 && <p className="rounded-[12px] bg-[#F5F8FE] p-3 text-[13px] text-[#55657D]">Tidak ada data yang cocok dengan saringan.</p>}
        </div>

        <Catatan judul="Cara membaca angka">
          <p>
            <b>Lengkap</b> = hari kerja dipilih, ada hasil lapangan, dan laporan + foto memenuhi aturan kegiatan. <b>Sebagian</b> = hari kerja dipilih, tetapi hasil atau laporan/foto belum penuh. <b>Kosong</b> = hari kerja dipilih, tetapi laporan dan foto belum ada sama sekali.
          </p>
          <p>
            <b>Anomali</b> (kolom terpisah) = ada hasil, laporan, atau foto pada tanggal yang tidak dipilih sebagai hari kerja. Korwil belum memilih hari kerja di SIGAP sehingga hanya muncul bila ada anomali.
          </p>
          <p>Hari ini masih bisa dilengkapi sampai pukul 23.59 WIB, jadi angka hari ini dapat berubah. Penilaian memakai aturan yang sama dengan Monitoring Lapangan.</p>
        </Catatan>
      </div>
    </section>
  );
}
