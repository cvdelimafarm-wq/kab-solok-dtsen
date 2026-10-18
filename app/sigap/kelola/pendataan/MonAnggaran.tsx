"use client";

// app/sigap/kelola/pendataan/MonAnggaran.tsx
//
// (19 Okt 2026) Variabel "Perkiraan kebutuhan anggaran" di tab Monitoring: realisasi sampai saat halaman dibuka, perkiraan sisa kebutuhan, dan perkiraan sisa hari
// penyelesaian (dua versi). Semua angka PERKIRAAN pemantauan, bukan angka pembayaran. Perhitungan: perkiraanAnggaran di lib/monitorKinerja.ts.

import { useMemo, useState } from "react";
import { LABEL_LAJU, LABEL_POLA, PARAM_AWAL, perkiraanAnggaran, rupiah, tglPendek, type BarisAnggaran, type DasarLaju, type DataKinerja, type ParamAnggaran, type PolaKerja } from "@/lib/monitorKinerja";
import { Catatan, Kartu, Kpi, fmt, fmt1, jam, label, sel, td, tdAngka, th, tombol } from "./monUi";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tglPanjang = (t: string) => `${HARI[new Date(`${t}T00:00:00Z`).getUTCDay()]}, ${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
const LABEL_PERAN = { ppl: "PPL", pml: "PML", korwil: "Korwil" } as const;

export default function MonAnggaran({ data }: { data: DataKinerja }) {
  const [p, setP] = useState<ParamAnggaran>(PARAM_AWAL);
  const r = useMemo(() => perkiraanAnggaran(data, p), [data, p]);
  const [lihat, setLihat] = useState<"semua" | "ppl" | "pml">("semua");
  const baris = useMemo(() => r.baris.filter((b) => lihat === "semua" || (lihat === "ppl" ? b.peran === "ppl" : b.peran !== "ppl")), [r, lihat]);

  async function unduh() {
    const XLSX = await import("xlsx");
    const ringkas = [
      { Keterangan: "Posisi per", Nilai: r.posisi },
      { Keterangan: "Tarif per O-K (PPL)", Nilai: r.tarif.ppl },
      { Keterangan: "Realisasi (O-K)", Nilai: r.realisasi.ok },
      { Keterangan: "Realisasi (Rp)", Nilai: r.realisasi.rupiah },
      { Keterangan: "Perkiraan sisa (O-K)", Nilai: r.sisa.ok },
      { Keterangan: "Perkiraan sisa (Rp)", Nilai: r.sisa.rupiah },
      { Keterangan: "Total perkiraan (O-K)", Nilai: r.total.ok },
      { Keterangan: "Total perkiraan (Rp)", Nilai: r.total.rupiah },
      { Keterangan: "Sisa hari kerja (dibagi rata)", Nilai: r.hari.dibagi_rata ?? "" },
      { Keterangan: "Sisa hari kerja (tiap PPL tuntaskan sendiri)", Nilai: r.hari.tuntas_sendiri ?? "" },
      { Keterangan: "Dasar laju", Nilai: LABEL_LAJU[p.laju] },
      { Keterangan: "Hari kerja", Nilai: LABEL_POLA[p.pola] },
      { Keterangan: "Sertakan PML & korwil", Nilai: p.sertakanPmlKorwil ? "ya" : "tidak" },
    ];
    const rinci = r.baris.map((b) => ({ Petugas: b.nama, Peran: LABEL_PERAN[b.peran], Tim: b.pml_nama ?? "-", "Realisasi O-K": b.realisasi_ok, "Hutang (poin)": b.hutang, "Sisa KK": b.sisa_kk, "Laju poin KK/hari": b.laju, "Sisa hari kerja": b.sisa_hari ?? "", "Perkiraan sisa O-K": b.sisa_ok }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ringkas), "Ringkasan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rinci), "Per petugas");
    XLSX.writeFile(wb, `perkiraan-anggaran-transport-${data.hari_ini}.xlsx`);
  }

  const h = r.hari;
  const kuotaTeks = r.total.persen_kuota != null && r.total.kuota != null ? `${r.total.persen_kuota}% dari kuota ${fmt(r.total.kuota)} O-K` : "kuota belum diisi";
  const selesaiTeks = (t: string | null) => (t ? `selesai ±${tglPendek(t)}` : "tidak dapat dihitung");

  return (
    <section className="mt-4">
      <div className="rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <div className="grid grid-cols-2 items-end gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
          <label className={`${label} col-span-2`}>
            Dasar laju harian
            <select value={p.laju} onChange={(e) => setP({ ...p, laju: e.target.value as DasarLaju })} className={`${sel} font-normal normal-case tracking-normal sm:min-w-[260px]`}>
              {(Object.keys(LABEL_LAJU) as DasarLaju[]).map((k) => (
                <option key={k} value={k}>
                  {LABEL_LAJU[k]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Hari kerja
            <select value={p.pola} onChange={(e) => setP({ ...p, pola: e.target.value as PolaKerja })} className={`${sel} font-normal normal-case tracking-normal sm:min-w-[160px]`}>
              {(Object.keys(LABEL_POLA) as PolaKerja[]).map((k) => (
                <option key={k} value={k}>
                  {LABEL_POLA[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex min-h-[44px] items-center gap-2 text-[13px] text-[#1B2B4B] sm:col-span-1 sm:min-h-[40px]">
            <input type="checkbox" checked={p.sertakanPmlKorwil} onChange={(e) => setP({ ...p, sertakanPmlKorwil: e.target.checked })} className="h-5 w-5 accent-[#1F5FD1]" />
            Sertakan PML &amp; korwil
          </label>
          <button type="button" onClick={() => void unduh()} className={`${tombol} col-span-2 sm:col-span-1`}>
            Unduh Excel
          </button>
        </div>
        {data.tertunda > 0 && <p className="mt-2 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12px] text-[#6B4A0E]">Jarak jalan {fmt(data.tertunda)} rute sedang dihitung; realisasi sementara memakai perkiraan jarak dan akan diperbarui otomatis.</p>}
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Perkiraan kebutuhan anggaran transport lokal — sampai pekerjaan selesai</h2>
        <p className="mt-1.5 text-[12px] leading-snug text-[#55657D]">
          Posisi per <b>{tglPanjang(data.hari_ini)} {jam(r.posisi)} WIB</b>. Tarif {rupiah(r.tarif.ppl)} per O-K (1 O-K = 45 poin). Periode kegiatan {tglPendek(data.mulai_kegiatan)} – {tglPendek(h.batas)} {h.batas.slice(0, 4)} (+ {data.tenggang_hari} hari tenggang).
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          <Kpi judul="① Realisasi sampai saat ini" nilai={`${fmt(r.realisasi.ok)} O-K`} catatan={rupiah(r.realisasi.rupiah)} />
          <Kpi judul="② Perkiraan sisa kebutuhan" nilai={`${fmt(r.sisa.ok)} O-K`} catatan={rupiah(r.sisa.rupiah)} />
          <Kpi judul="Total perkiraan (① + ②)" nilai={`${fmt(r.total.ok)} O-K`} catatan={`${rupiah(r.total.rupiah)} · ${kuotaTeks}`} lebar />
          <Kpi judul="③ Sisa hari kerja (dibagi rata antar PPL)" nilai={h.dibagi_rata == null ? "—" : `${fmt(h.dibagi_rata)} hari`} catatan={`${selesaiTeks(h.selesai_dibagi_rata)}${h.lewat_batas_dibagi_rata ? " — melewati batas" : ""}`} gaya={h.lewat_batas_dibagi_rata ? "bahaya" : undefined} />
          <Kpi judul="③ Bila tiap PPL tuntaskan porsinya sendiri" nilai={h.tuntas_sendiri == null ? "—" : `${fmt(h.tuntas_sendiri)} hari`} catatan={`${selesaiTeks(h.selesai_tuntas_sendiri)}${h.lewat_batas_tuntas_sendiri ? ` — melewati batas ${tglPendek(h.batas)}` : ""}`} gaya={h.lewat_batas_tuntas_sendiri ? "bahaya" : undefined} />
        </div>
        <p className="mt-2 text-[11.5px] text-[#6B7A90]">
          Batas kegiatan {tglPendek(h.batas)} {h.batas.slice(0, 4)}; dengan tenggang {tglPendek(h.batas_tenggang)}. Asumsi: rata-rata {fmt1(r.asumsi.poin_per_kk)} poin per KK, laju rata-rata {fmt1(r.asumsi.laju_rata)} poin KK per hari kerja
          {r.asumsi.ppl_laju_pengganti > 0 ? `, ${r.asumsi.ppl_laju_pengganti} PPL belum punya riwayat (dipakai laju rata-rata)` : ""}.
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-extrabold text-[#0F2A52]">Rincian per petugas</h3>
          <div className="flex rounded-[10px] bg-[#EEF2F7] p-[3px]">
            {([["semua", "Semua"], ["ppl", "PPL"], ["pml", "PML & korwil"]] as ["semua" | "ppl" | "pml", string][]).map(([k, n]) => (
              <button key={k} type="button" onClick={() => setLihat(k)} className={`h-9 rounded-[8px] px-3 text-[12.5px] font-extrabold ${lihat === k ? "bg-white text-[#0F2A52] shadow-[0_1px_5px_rgba(15,42,82,.12)]" : "text-[#55657D]"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 hidden overflow-x-auto rounded-[14px] border border-[#E8EDF5] md:block">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10`}>Petugas</th>
                <th className={th}>Peran / Tim</th>
                <th className={`${th} text-right`}>Realisasi (O-K)</th>
                <th className={`${th} text-right`}>Hutang (poin)</th>
                <th className={`${th} text-right`}>Sisa KK</th>
                <th className={`${th} text-right`}>Laju poin KK/hari</th>
                <th className={`${th} text-right`}>Sisa hari</th>
                <th className={`${th} text-right`}>Sisa O-K</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={`${b.peran}-${b.akun_id}`}>
                  <td className={`${td} sticky left-0 bg-white font-bold`}>{b.nama}</td>
                  <td className={td}>
                    {LABEL_PERAN[b.peran]}
                    {b.pml_nama ? ` · ${b.pml_nama}` : ""}
                  </td>
                  <td className={tdAngka}>{fmt(b.realisasi_ok)}</td>
                  <td className={tdAngka}>{b.peran === "ppl" ? fmt1(b.hutang) : "—"}</td>
                  <td className={tdAngka}>{b.peran === "ppl" ? fmt(b.sisa_kk) : "—"}</td>
                  <td className={tdAngka}>{b.peran === "ppl" ? fmt1(b.laju) : "—"}</td>
                  <td className={tdAngka}>{b.sisa_hari == null ? "—" : fmt(b.sisa_hari)}</td>
                  <td className={`${tdAngka} font-bold`}>{fmt1(b.sisa_ok)}</td>
                </tr>
              ))}
              {baris.length === 0 && (
                <tr>
                  <td className={td} colSpan={8}>
                    Tidak ada data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 space-y-2.5 md:hidden">
          {baris.map((b) => (
            <KartuAnggaran key={`${b.peran}-${b.akun_id}`} b={b} />
          ))}
        </div>

        <Catatan judul="Cara hitung">
          <p>
            <b>Realisasi</b> = O-K menurut aturan poin (45 poin = 1 O-K; hanya hari kerja lengkap laporan &amp; foto; kekurangan menjadi hutang yang ditutup poin hari berikutnya; maksimal 1 O-K per hari; pecahan dibulatkan ke bawah; sebelum 15 Okt tiap hari lengkap dihitung penuh). Hari ini dianggap lengkap sementara. PML dan korwil: tiap hari kerja lengkap = 1 O-K.
          </p>
          <p>
            <b>Sisa poin</b> = KK belum didata di porsi petugas × rata-rata poin per KK + perkiraan jarak per hari (2 × 1,3 × garis lurus rumah ke pusat KK tersisa, maksimal 15 poin). <b>Sisa kebutuhan</b> = sisa poin ÷ 45 × tarif (batas bawah: mengandaikan semua hari lengkap laporan &amp; foto). PML mengikuti sisa hari timnya.
          </p>
          <p>
            <b>Sisa hari</b> = sisa poin KK ÷ laju poin KK harian ({LABEL_LAJU[p.laju].toLowerCase()}), dihitung menurut hari kerja {LABEL_POLA[p.pola].toLowerCase()}. “Dibagi rata” = seluruh sisa poin dibagi jumlah laju semua PPL (kerja keroyokan); “tuntaskan sendiri” = PPL paling lambat menentukan. Semua angka adalah <b>perkiraan</b> yang berubah mengikuti laju terbaru; bukan angka pembayaran.
          </p>
        </Catatan>
      </div>
    </section>
  );
}

function KartuAnggaran({ b }: { b: BarisAnggaran }) {
  const ppl = b.peran === "ppl";
  return (
    <Kartu
      judul={b.nama}
      sub={`${LABEL_PERAN[b.peran]}${b.pml_nama ? ` · ${b.pml_nama}` : ""}`}
      nilai={null}
      utama={[["Realisasi O-K", fmt(b.realisasi_ok)], ["Sisa hari", b.sisa_hari == null ? "—" : fmt(b.sisa_hari)], ["Sisa O-K", fmt1(b.sisa_ok)]]}
      lain={ppl ? [["Sisa KK", fmt(b.sisa_kk)], ["Laju", `${fmt1(b.laju)} poin/hari`], ["Hutang", `${fmt1(b.hutang)} poin`]] : []}
    />
  );
}
