"use client";

// app/sigap/kelola/pendataan/MonPoin.tsx
//
// (19 Okt 2026) Variabel "Poin kinerja per hari" di tab Monitoring: matriks petugas x tanggal (mulai 15 Okt), target minimal 45 poin per hari.
// Poin = 5 x KK terdampak + 1 x KK tidak terdampak + 1 poin per km (maks 15). Jarak realisasi memakai OSRM; bila belum selesai dihitung, tampil perkiraan (≈).

import { useMemo, useState } from "react";
import { ATURAN, kelasPoin, matriksPoin, tglPendek, type BarisPoin, type DataKinerja, type KelasPoin, type SelPoin } from "@/lib/monitorKinerja";
import { Catatan, Kpi, fmt, fmt2, label, sel, td, tdAngka, th, tombol } from "./monUi";

type Urut = "bawaan" | "rata_rendah" | "total" | "hutang";
const GAYA: Record<KelasPoin, string> = {
  penuh: "bg-[#E3F6EC] text-[#0B6B3F]",
  sedang: "bg-[#FFF4D6] text-[#8A6200]",
  rendah: "bg-[#FDE8E8] text-[#9B1C23]",
  kosong: "bg-[#EEF2F7] text-[#8A97AB]",
};

function Sel({ s }: { s: SelPoin }) {
  if (!s.ada) return <span className="inline-block min-w-[52px] rounded-[8px] bg-[#EEF2F7] px-2 py-1 text-center text-[12px] text-[#8A97AB]">–</span>;
  return (
    <span className={`inline-block min-w-[52px] rounded-[8px] px-2 py-1 text-center leading-tight ${GAYA[kelasPoin(s.persen)]}`} title={`${s.kk} KK · ${fmt2(s.km)} km${s.metode === "perkiraan" ? " (perkiraan)" : ""}`}>
      <b className="block text-[13px] tabular-nums">
        {s.metode === "perkiraan" ? "≈" : ""}
        {fmt2(s.poin)}
      </b>
      <small className="block text-[10.5px] opacity-80">{s.persen}%</small>
    </span>
  );
}

export default function MonPoin({ data }: { data: DataKinerja }) {
  const [pml, setPml] = useState<number | null>(null);
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<Urut>("bawaan");
  const { baris, ringkas } = useMemo(() => matriksPoin(data), [data]);

  const timList = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of baris) if (b.pml_id != null && b.pml_nama) m.set(b.pml_id, b.pml_nama);
    return [...m.entries()].map(([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [baris]);

  const q = cari.toLowerCase().replace(/\s+/g, " ").trim();
  const tampil = useMemo(() => {
    const d = baris.filter((b) => (pml == null || b.pml_id === pml) && (!q || b.nama.toLowerCase().includes(q) || (b.pml_nama ?? "").toLowerCase().includes(q)));
    if (urut === "rata_rendah") return [...d].sort((a, b) => (a.hari_aktif ? a.rata : 9999) - (b.hari_aktif ? b.rata : 9999) || a.nama.localeCompare(b.nama));
    if (urut === "total") return [...d].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
    if (urut === "hutang") return [...d].sort((a, b) => b.hutang - a.hutang || a.nama.localeCompare(b.nama));
    return [...d].sort((a, b) => (a.pml_nama ?? "~").localeCompare(b.pml_nama ?? "~") || a.nama.localeCompare(b.nama));
  }, [baris, pml, q, urut]);

  const hariIni = ringkas.tanggal[ringkas.tanggal.length - 1];
  const adaPerkiraan = tampil.some((b) => b.perkiraan_jarak);

  async function unduh() {
    const XLSX = await import("xlsx");
    const rows = tampil.map((b) => {
      const r: Record<string, string | number> = { Petugas: b.nama, Tim: b.pml_nama ?? "-" };
      for (const s of b.sel) r[tglPendek(s.tanggal)] = s.ada ? s.poin : "";
      r["Total poin"] = b.total;
      r["Rata-rata poin/hari aktif"] = b.rata;
      r["Hari >= 45"] = b.hari_penuh;
      r["Hari ada kegiatan"] = b.hari_aktif;
      r["Kurang (hutang)"] = b.hutang;
      r["Jarak perkiraan"] = b.perkiraan_jarak ? "ya" : "tidak";
      return r;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Poin harian");
    XLSX.writeFile(wb, `monitoring-poin-harian-${data.hari_ini}.xlsx`);
  }

  return (
    <section className="mt-4">
      <div className="rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <div className="grid grid-cols-2 items-end gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
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
            <select value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className={`${sel} font-normal normal-case tracking-normal sm:min-w-[180px]`}>
              <option value="bawaan">Tim lalu nama</option>
              <option value="rata_rendah">Rata-rata poin terendah</option>
              <option value="total">Total poin tertinggi</option>
              <option value="hutang">Hutang terbesar</option>
            </select>
          </label>
          <button type="button" onClick={() => void unduh()} className={tombol}>
            Unduh Excel
          </button>
        </div>
        {data.tertunda > 0 && <p className="mt-2 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12px] text-[#6B4A0E]">Jarak jalan {fmt(data.tertunda)} rute sedang dihitung; sementara tampil perkiraan (≈). Halaman memuat ulang otomatis.</p>}
        {!data.osrm && <p className="mt-2 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12px] text-[#6B4A0E]">Layanan jarak jalan (OSRM) belum tersedia: seluruh jarak memakai perkiraan (garis lurus × 1,3).</p>}
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Poin capaian kinerja per hari — target minimal {ATURAN.targetHarian} poin</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          <Kpi judul={`PPL mencapai ≥ ${ATURAN.targetHarian} poin (${tglPendek(hariIni)})`} nilai={`${ringkas.penuh_hari_ini} dari ${ringkas.petugas}`} lebar />
          <Kpi judul="Rata-rata poin hari ini" nilai={fmt2(ringkas.rata_hari_ini)} catatan="yang ada kegiatan" />
          <Kpi judul={`Total poin sejak ${tglPendek(ringkas.tanggal[0])}`} nilai={fmt(ringkas.total)} />
          <Kpi judul="Total kurang (hutang)" nilai={fmt(ringkas.hutang)} gaya={ringkas.hutang > 0 ? "bahaya" : undefined} catatan="poin, hari kerja lengkap" lebar />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#55657D]">
          {([["penuh", "≥ 100%"], ["sedang", "60–99%"], ["rendah", "< 60%"], ["kosong", "tidak ada kegiatan"]] as [KelasPoin, string][]).map(([k, t]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className={`inline-block h-3 w-3 rounded-[4px] ${GAYA[k].split(" ")[0]}`} />
              {t}
            </span>
          ))}
          {adaPerkiraan && <span>≈ = jarak perkiraan</span>}
        </div>

        <div className="mt-3 hidden overflow-x-auto rounded-[14px] border border-[#E8EDF5] md:block">
          <table className="w-full border-collapse" style={{ minWidth: 420 + ringkas.tanggal.length * 70 }}>
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10`}>Petugas (PPL)</th>
                {ringkas.tanggal.map((t) => (
                  <th key={t} className={`${th} text-center`}>
                    {tglPendek(t)}
                  </th>
                ))}
                <th className={`${th} text-right`}>Total poin</th>
                <th className={`${th} text-right`}>Hari ≥ {ATURAN.targetHarian}</th>
                <th className={`${th} text-right`}>Kurang (hutang)</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((b) => (
                <tr key={b.akun_id}>
                  <td className={`${td} sticky left-0 bg-white font-bold`}>
                    {b.nama}
                    <small className="block text-[11px] font-normal text-[#6B7A90]">{b.peran === "korwil" ? "Korwil" : (b.pml_nama ?? "—")}</small>
                  </td>
                  {b.sel.map((s) => (
                    <td key={s.tanggal} className="border-t border-[#E8EDF5] px-1.5 py-1.5 text-center">
                      <Sel s={s} />
                    </td>
                  ))}
                  <td className={`${tdAngka} font-bold`}>{fmt2(b.total)}</td>
                  <td className={tdAngka}>
                    {b.hari_penuh} dari {b.hari_aktif}
                  </td>
                  <td className={`${tdAngka} font-extrabold ${b.hutang > 0 ? "text-[#9B1C23]" : ""}`}>{fmt2(b.hutang)}</td>
                </tr>
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td className={td} colSpan={ringkas.tanggal.length + 4}>
                    Tidak ada data yang cocok dengan saringan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-2.5 md:hidden">
          {tampil.map((b) => (
            <KartuPoin key={b.akun_id} b={b} />
          ))}
          {tampil.length === 0 && <p className="rounded-[12px] bg-[#F5F8FE] p-3 text-[13px] text-[#55657D]">Tidak ada data yang cocok dengan saringan.</p>}
        </div>

        <Catatan judul="Cara membaca angka">
          <p>
            Poin per hari = KK terdampak × {ATURAN.poinTerdampak} + KK tidak terdampak × {ATURAN.poinTidakTerdampak} + jarak {ATURAN.poinPerKm} poin per km (maksimal {ATURAN.maksPoinJarak} poin jarak, hanya bila ada KK didata hari itu). KK tidak ditemukan 0 poin. Tanggal KK = tanggal WIB hasil terkininya.
          </p>
          <p>
            Jarak = rute rumah → pusat tiap Sub SLS (urut waktu) → rumah, dihitung jalan lewat OSRM; bila belum tersedia tampil perkiraan (garis lurus × 1,3) dan ditandai ≈. Sel “–” = tidak ada KK yang ditandai pada hari itu.
          </p>
          <p>
            <b>Kurang (hutang)</b> = kekurangan poin kumulatif pada hari kerja lengkap sejak 15 Okt; poin hari berikutnya menutup hutang lebih dulu, kelebihan di atas {ATURAN.targetHarian} tidak menambah. Ini angka pemantauan, bukan pembayaran.
          </p>
        </Catatan>
      </div>
    </section>
  );
}

function KartuPoin({ b }: { b: BarisPoin }) {
  return (
    <article className="rounded-[14px] border border-[#E8EDF5] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-[14.5px] font-extrabold leading-tight text-[#0F2A52]">{b.nama}</h3>
          <p className="mt-0.5 text-[12px] text-[#55657D]">{b.peran === "korwil" ? "Korwil" : (b.pml_nama ?? "—")}</p>
        </div>
        <div className="shrink-0 text-right">
          <b className="block text-[18px] tabular-nums text-[#0F2A52]">{fmt2(b.total)}</b>
          <span className="text-[11px] text-[#6B7A90]">total poin</span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {b.sel.map((s) => (
          <div key={s.tanggal} className={`rounded-[8px] px-1.5 py-1 text-center leading-tight ${s.ada ? GAYA[kelasPoin(s.persen)] : GAYA.kosong}`}>
            <small className="block text-[10px] opacity-80">{tglPendek(s.tanggal)}</small>
            <b className="block text-[13px] tabular-nums">{s.ada ? `${s.metode === "perkiraan" ? "≈" : ""}${fmt2(s.poin)}` : "–"}</b>
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#55657D]">
        <span>
          Hari ≥ {ATURAN.targetHarian}{" "}
          <b className="text-[#1B2B4B]">
            {b.hari_penuh} dari {b.hari_aktif}
          </b>
        </span>
        <span>
          Rata-rata <b className="tabular-nums text-[#1B2B4B]">{fmt2(b.rata)}</b>
        </span>
        <span>
          Kurang <b className={`tabular-nums ${b.hutang > 0 ? "text-[#9B1C23]" : "text-[#1B2B4B]"}`}>{fmt2(b.hutang)}</b>
        </span>
      </p>
    </article>
  );
}
