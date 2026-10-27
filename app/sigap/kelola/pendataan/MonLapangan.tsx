"use client";

// app/sigap/kelola/pendataan/MonLapangan.tsx  (isi halaman /sigap/kelola/lapangan; 23 Okt 2026 dipindah ke komponen agar bisa disematkan di tab Pemeriksaan Kelola Pendataan)
//
// (11 Okt 2026) Monitoring Lapangan -- permintaan user (mockup: Mockup_Monitoring_Lapangan.html). Khusus pemegang izin bencana.admin.
// Satu baris = satu petugas (PML/PPL) pada satu tanggal; SEMUA petugas berwilayah tampil tiap tanggal, termasuk yang belum ada hasil.
// Hanya jumlah yang ditampilkan (tanpa nama KK). Agregat = kumulatif orang itu sampai tanggal baris, tidak terpengaruh saringan tanggal.

import { useEffect, useMemo, useRef, useState } from "react";
import TombolKembali from "@/app/components/TombolKembali";
import { useRouter } from "next/navigation";
import { bacaSesi } from "@/app/portal/sesi";
import { useData } from "@/app/portal/dataBersama";
import type { AturanIsian } from "@/lib/sigap";
import {
  LABEL_PERAN,
  LABEL_STATUS_LAPANGAN,
  LABEL_STATUS_TRANSLOK,
  SARINGAN_AWAL,
  agregatAkhir,
  alasanAnomali,
  daftarTim,
  geserTanggal,
  jumlahAgregat,
  jumlahBerhasil,
  hariQc,
  kkDihitung,
  qcDihitung,
  ringkas,
  satuanBaris,
  saring,
  statusLapangan,
  statusTranslok,
  urutkan,
  type BarisLapangan,
  type KunciUrut,
  type SaringanLapangan,
  type StatusTranslok,
} from "@/lib/lapangan";

type Data = { sekarang: string; hari_ini: string; aturan: AturanIsian; kegiatan: { id: number; nama: string } | null; baris: BarisLapangan[] };
type Cepat = "hari" | "kemarin" | "3hari" | "semua" | "kustom";

const PER_HAMAN = 50;
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (t: string) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`;
const GAYA_TRANSLOK: Record<StatusTranslok, string> = {
  lengkap: "bg-[#E3F6EC] text-[#0B6B3F]",
  sebagian: "bg-[#FFF4D6] text-[#8A6200]",
  anomali: "bg-[#FDE8E8] text-[#9B1C23]",
  tidak_ada: "bg-[#EEF2F7] text-[#6B7A90]",
};
const sel = "min-h-[40px] w-full rounded-[10px] border border-[#D9E3F2] bg-white px-2.5 text-[13px] text-[#1B2B4B]";

export default function MonLapangan({ tertanam = false }: { tertanam?: boolean }) {
  const router = useRouter();
  // (27 Okt 2026) Data lewat simpanan bersama (dataBersama.ts): dibuka lagi = langsung tampil dari simpanan lalu diperbarui di belakang (sebelumnya selalu menunggu server).
  const dl = useData<Data>("/api/portal/lapangan");
  const data = dl.data;
  const galat = !data && dl.galat && dl.galat !== "SESI_BERAKHIR" ? dl.galat : null;
  const [s, setS] = useState<SaringanLapangan>(SARINGAN_AWAL);
  const [cepat, setCepat] = useState<Cepat>("hari");
  const [urut, setUrut] = useState<{ kunci: KunciUrut; turun: boolean }>({ kunci: "tanggal", turun: true });
  const [halaman, setHalaman] = useState(1);
  const [mengekspor, setMengekspor] = useState(false);
  const awal = useRef(true); // saringan tanggal bawaan hanya diterapkan sekali

  useEffect(() => {
    if (!bacaSesi() || dl.galat === "SESI_BERAKHIR") router.replace("/");
  }, [dl.galat, router]);

  // saringan tanggal bawaan = hari ini WIB (hanya sekali, supaya tidak menimpa pilihan user saat penyegaran otomatis). Dipakai tanggal HP, bukan hari_ini
  // dari data: data simpanan bisa dari kemarin, dan saringan tidak boleh terkunci pada tanggal itu atau menampilkan semua hari sesaat.
  useEffect(() => {
    if (!data || !awal.current) return;
    awal.current = false;
    const kini = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    setS((x) => ({ ...x, dari: kini, sampai: kini }));
  }, [data]);

  const aturan = data?.aturan;
  const semua = data?.baris ?? [];
  const tim = useMemo(() => daftarTim(semua), [semua]);
  const tersaring = useMemo(() => (aturan ? saring(semua, s, aturan) : []), [semua, s, aturan]);
  const tertata = useMemo(() => urutkan(tersaring, urut.kunci, urut.turun), [tersaring, urut]);
  const ringk = useMemo(() => (aturan ? ringkas(tersaring, aturan) : null), [tersaring, aturan]);
  const agr = useMemo(() => agregatAkhir(tersaring), [tersaring]);
  const jmlHari = data ? Math.max(1, Math.ceil(tertata.length / PER_HAMAN)) : 1;
  const hal = Math.min(halaman, jmlHari);
  const potong = tertata.slice((hal - 1) * PER_HAMAN, hal * PER_HAMAN);

  function ubah(p: Partial<SaringanLapangan>, k?: Cepat) {
    setS((x) => ({ ...x, ...p }));
    setHalaman(1);
    if (k) setCepat(k);
    else if ("dari" in p || "sampai" in p) setCepat("kustom");
  }
  function pilihCepat(k: Cepat) {
    if (!data) return;
    const h = data.hari_ini;
    if (k === "hari") ubah({ dari: h, sampai: h }, k);
    else if (k === "kemarin") ubah({ dari: geserTanggal(h, -1), sampai: geserTanggal(h, -1) }, k);
    else if (k === "3hari") ubah({ dari: geserTanggal(h, -2), sampai: h }, k);
    else ubah({ dari: null, sampai: null }, k);
  }
  function urutPada(kunci: KunciUrut) {
    setUrut((u) => (u.kunci === kunci ? { kunci, turun: !u.turun } : { kunci, turun: kunci === "nama" ? false : true }));
    setHalaman(1);
  }
  const panah = (kunci: KunciUrut) => (urut.kunci === kunci ? (urut.turun ? " ▾" : " ▴") : "");

  async function ekspor() {
    if (!aturan || mengekspor) return;
    setMengekspor(true);
    try {
      const XLSX = await import("xlsx");
      const baris = tertata.map((b) => ({
        Tanggal: b.tanggal,
        Nama: b.nama,
        Peran: LABEL_PERAN[b.peran],
        "Tim (PML)": b.pml_nama ?? "",
        "Status lapangan": LABEL_STATUS_LAPANGAN[statusLapangan(b)],
        "Sub SLS diidentifikasi": b.peran === "pml" ? b.sub_idf : "",
        "KK berhasil (terdampak + tidak terdampak)": b.peran === "pml" ? "" : kkDihitung(b),
        "Lembar QC lengkap (korwil)": qcDihitung(b) || (hariQc(b) ? 0 : ""),
        "KK tidak ditemukan": b.peran === "pml" || hariQc(b) ? "" : b.kk_tdk_ditemukan,
        "KK ditandai PML (tidak dihitung)": b.peran === "pml" ? b.kk_berhasil : "",
        "Agregat s.d. tanggal ini": jumlahAgregat(b),
        "Satuan agregat": satuanBaris(b),
        "Hari kerja": b.hari_kerja ? "Ya" : "Tidak",
        Laporan: b.ada_laporan ? "Ada" : "Tidak",
        "Foto (slot)": b.jumlah_foto,
        "Status translok": LABEL_STATUS_TRANSLOK[statusTranslok(b, aturan)],
        Keterangan: alasanAnomali(b, aturan),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris), "Monitoring Lapangan");
      XLSX.writeFile(wb, `monitoring-lapangan-${s.dari ?? "awal"}_${s.sampai ?? "kini"}.xlsx`);
    } finally {
      setMengekspor(false);
    }
  }

  const chip = (k: Cepat, teks: string) => (
    <button key={k} type="button" onClick={() => pilihCepat(k)} aria-pressed={cepat === k} className={`min-h-[40px] rounded-full px-3.5 text-[12.5px] font-extrabold ${cepat === k ? "bg-[#0F2A52] text-white" : "bg-white text-[#55657D] shadow-[0_2px_6px_rgba(15,42,82,.08)]"}`}>
      {teks}
    </button>
  );
  const kartu = "rounded-[16px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
  const kolom = "grid grid-cols-[84px_minmax(150px,1.3fr)_64px_minmax(110px,1fr)_130px_84px_84px_96px_64px_64px_56px_104px] items-center gap-x-3";
  const th = "text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]";

  return (
    <div className={tertanam ? "text-[#1B2B4B]" : "min-h-screen bg-[#F5F8FE] px-4 py-6 text-[#1B2B4B]"}>
      <div className={tertanam ? "" : "mx-auto max-w-[1280px]"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {!tertanam && (
              <>
                <TombolKembali tema="terang" induk="/sigap/kelola/pendataan?tab=pemeriksaan" />
                <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]">Kelola · Pendataan Pascabencana</p>
                <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.4px] text-[#0F2A52]">Monitoring Lapangan</h1>
              </>
            )}
            <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-[#55657D]">Hasil identifikasi (PML), pendataan (PPL), dan status translok per petugas per tanggal. Semua petugas berwilayah tampil di setiap tanggal, termasuk yang belum ada hasil.</p>
          </div>
          <button type="button" onClick={ekspor} disabled={!aturan || mengekspor || tertata.length === 0} className="inline-flex h-11 items-center rounded-[12px] bg-[#1F5FD1] px-5 text-[13.5px] font-extrabold text-white disabled:bg-[#A9BCD8]">
            {mengekspor ? "Menyiapkan…" : "Unduh Excel"}
          </button>
        </div>

        {galat && <p className="mt-4 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!data && !galat && <div className="mt-5 h-48 animate-pulse rounded-[18px] bg-white" aria-busy="true" />}

        {data && aturan && ringk && (
          <>
            <div className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <label className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Peran
                  <select className={`${sel} mt-1`} value={s.peran} onChange={(e) => ubah({ peran: e.target.value as SaringanLapangan["peran"] })}>
                    <option value="semua">Semua</option>
                    <option value="pml">PML</option>
                    <option value="ppl">PPL</option>
                    <option value="korwil">Korwil</option>
                  </select>
                </label>
                <label className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Tim (PML)
                  <select className={`${sel} mt-1`} value={s.pml_id ?? ""} onChange={(e) => ubah({ pml_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Semua tim</option>
                    {tim.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nama}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Nama
                  <input className={`${sel} mt-1`} type="search" placeholder="Cari nama petugas atau PML" value={s.cari} onChange={(e) => ubah({ cari: e.target.value })} />
                </label>
                <label className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Dari tanggal
                  <input className={`${sel} mt-1`} type="date" value={s.dari ?? ""} max={s.sampai ?? data.hari_ini} onChange={(e) => ubah({ dari: e.target.value || null })} />
                </label>
                <label className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Sampai tanggal
                  <input className={`${sel} mt-1`} type="date" value={s.sampai ?? ""} min={s.dari ?? undefined} max={data.hari_ini} onChange={(e) => ubah({ sampai: e.target.value || null })} />
                </label>
                <label className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Status lapangan
                  <select className={`${sel} mt-1`} value={s.lapangan} onChange={(e) => ubah({ lapangan: e.target.value as SaringanLapangan["lapangan"] })}>
                    <option value="semua">Semua</option>
                    <option value="identifikasi">Ada identifikasi</option>
                    <option value="pendataan">Ada pendataan</option>
                    <option value="qc">Ada Quality Check</option>
                    <option value="belum">Belum ada hasil</option>
                  </select>
                </label>
                <label className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                  Status translok
                  <select className={`${sel} mt-1`} value={s.translok} onChange={(e) => ubah({ translok: e.target.value as SaringanLapangan["translok"] })}>
                    <option value="semua">Semua</option>
                    {(Object.keys(LABEL_STATUS_TRANSLOK) as StatusTranslok[]).map((k) => (
                      <option key={k} value={k}>
                        {LABEL_STATUS_TRANSLOK[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chip("hari", "Hari ini")}
                {chip("kemarin", "Kemarin")}
                {chip("3hari", "3 hari")}
                {chip("semua", "Semua")}
                <button type="button" onClick={() => { setS({ ...SARINGAN_AWAL }); setCepat("semua"); setHalaman(1); }} className="ml-auto min-h-[40px] px-2 text-[12.5px] font-bold text-[#1F5FD1]">
                  Atur ulang
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className={kartu}>
                <span className="text-[12px] text-[#55657D]">Petugas aktif (ada hasil)</span>
                <b className="mt-1 block text-[26px] text-[#0F2A52]">
                  {ringk.orang_berhasil} <span className="text-[14px] font-bold text-[#6B7A90]">dari {ringk.orang}</span>
                </b>
                <small className="mt-1 block text-[11.5px] text-[#6B7A90]">{ringk.belum_ada_hasil} baris belum ada hasil</small>
              </div>
              <div className={kartu}>
                <span className="text-[12px] text-[#55657D]">Sub SLS diidentifikasi</span>
                <b className="mt-1 block text-[26px] text-[#0F2A52]">{fmt(ringk.sub_idf)}</b>
                <small className="mt-1 block text-[11.5px] text-[#6B7A90]">agregat PML s.d. akhir rentang: {fmt(agr.sub)}</small>
              </div>
              <div className={kartu}>
                <span className="text-[12px] text-[#55657D]">KK berhasil didata</span>
                <b className="mt-1 block text-[26px] text-[#0F2A52]">{fmt(ringk.kk_berhasil)}</b>
                <small className="mt-1 block text-[11.5px] text-[#6B7A90]">
                  agregat PPL s.d. akhir rentang: {fmt(agr.kk)}
                  {ringk.kk_tdk_ditemukan > 0 && ` · ${fmt(ringk.kk_tdk_ditemukan)} tidak ditemukan`}
                  {ringk.kk_oleh_pml > 0 && ` · ${fmt(ringk.kk_oleh_pml)} KK ditandai PML (tidak dihitung)`}
                  {(ringk.qc_lengkap > 0 || agr.qc > 0) && ` · korwil: ${fmt(ringk.qc_lengkap)} lembar QC lengkap (agregat ${fmt(agr.qc)})`}
                </small>
              </div>
              <div className={ringk.translok.anomali > 0 ? "rounded-[16px] bg-[#FDE8E8] p-4" : kartu}>
                <span className="text-[12px] text-[#55657D]">Translok lengkap / anomali</span>
                <b className="mt-1 block text-[26px] text-[#0F2A52]">
                  {ringk.translok.lengkap} <span className="text-[14px] font-bold text-[#6B7A90]">/</span> <span className={ringk.translok.anomali > 0 ? "text-[#9B1C23]" : ""}>{ringk.translok.anomali}</span>
                </b>
                <small className="mt-1 block text-[11.5px] text-[#6B7A90]">sebagian {ringk.translok.sebagian} · tanpa klaim {ringk.translok.tidak_ada}</small>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
              <div className="min-w-[1180px]">
                <div className={`${kolom} border-b border-[#EEF2F7] bg-[#F7FAFE] px-5 py-2.5`}>
                  <button type="button" className={`${th} text-left`} onClick={() => urutPada("tanggal")}>Tanggal{panah("tanggal")}</button>
                  <button type="button" className={`${th} text-left`} onClick={() => urutPada("nama")}>Nama{panah("nama")}</button>
                  <span className={th}>Peran</span>
                  <span className={th}>Tim (PML)</span>
                  <span className={th}>Status lapangan</span>
                  <button type="button" className={`${th} text-right`} onClick={() => urutPada("berhasil")}>Sub SLS idf.{panah("berhasil")}</button>
                  <span className={`${th} text-right`}>KK berhasil</span>
                  <button type="button" className={`${th} text-right`} onClick={() => urutPada("agregat")}>Agregat{panah("agregat")}</button>
                  <span className={`${th} text-center`}>Hari kerja</span>
                  <span className={`${th} text-center`}>Laporan</span>
                  <span className={`${th} text-right`}>Foto</span>
                  <span className={th}>Translok</span>
                </div>
                {potong.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-[#6B7A90]">Tidak ada baris pada saringan ini.</p>}
                {potong.map((b) => {
                  const sl = statusLapangan(b);
                  const st = statusTranslok(b, aturan);
                  return (
                    <div key={`${b.akun_id}-${b.tanggal}`} className={`${kolom} min-h-[44px] border-b border-[#EEF2F7] px-5 py-1.5 text-[13px]`}>
                      <span className="text-[#55657D]">{tgl(b.tanggal)}</span>
                      <span className="truncate font-bold text-[#0F2A52]" title={b.nama}>{b.nama}</span>
                      <span className="text-[11.5px] font-extrabold text-[#55657D]">{LABEL_PERAN[b.peran]}</span>
                      <span className="truncate text-[#55657D]" title={b.pml_nama ?? ""}>{b.pml_nama ?? "–"}</span>
                      <span className={`text-[12.5px] font-bold ${sl === "belum" ? "text-[#8A97AB]" : sl === "identifikasi" ? "text-[#12618F]" : "text-[#13794B]"}`}>{LABEL_STATUS_LAPANGAN[sl]}</span>
                      <span className="text-right font-extrabold text-[#0F2A52]">{b.peran === "pml" ? (b.sub_idf || "–") : "–"}</span>
                      <span className="text-right font-extrabold text-[#0F2A52]" title={b.peran === "pml" && b.kk_berhasil > 0 ? `PML menandai ${b.kk_berhasil} KK di Lembar Pendataan (tidak dihitung di sini)` : hariQc(b) ? "Korwil: jumlah lembar Quality Check yang lengkap pada tanggal ini" : undefined}>
                        {hariQc(b) ? (b.kk_berhasil || "–") : (kkDihitung(b) || "–")}
                        {hariQc(b) && b.kk_berhasil > 0 && <small className="block text-[10.5px] font-semibold text-[#8A97AB]">lembar QC</small>}
                        {b.peran !== "pml" && !hariQc(b) && b.kk_tdk_ditemukan > 0 && <small className="block text-[10.5px] font-semibold text-[#8A97AB]">+{b.kk_tdk_ditemukan} tdk ditemukan</small>}
                      </span>
                      <span className="text-right text-[#55657D]" title={`Kumulatif ${satuanBaris(b)} sampai ${b.tanggal}`}>
                        {fmt(jumlahAgregat(b))} <small className="text-[10.5px] text-[#8A97AB]">{satuanBaris(b)}</small>
                      </span>
                      <span className={`text-center font-extrabold ${b.hari_kerja ? "text-[#13794B]" : "text-[#C5CFDF]"}`}>{b.hari_kerja ? "✓" : "✗"}</span>
                      <span className={`text-center font-extrabold ${b.ada_laporan ? "text-[#13794B]" : "text-[#C5CFDF]"}`}>{b.ada_laporan ? "✓" : "✗"}</span>
                      <span className={`text-right ${b.jumlah_foto >= aturan.jumlah_foto ? "font-extrabold text-[#13794B]" : "text-[#55657D]"}`}>{b.jumlah_foto}/{aturan.jumlah_foto}</span>
                      <span>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${GAYA_TRANSLOK[st]}`} title={alasanAnomali(b, aturan) || undefined}>
                          {LABEL_STATUS_TRANSLOK[st]}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#55657D]">
              <span>
                {fmt(tertata.length)} baris · halaman {hal} dari {jmlHari}
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={hal <= 1} onClick={() => setHalaman(hal - 1)} className="min-h-[40px] rounded-full bg-white px-4 font-extrabold text-[#0F2A52] shadow-[0_2px_6px_rgba(15,42,82,.08)] disabled:opacity-40">‹ Sebelumnya</button>
                <button type="button" disabled={hal >= jmlHari} onClick={() => setHalaman(hal + 1)} className="min-h-[40px] rounded-full bg-white px-4 font-extrabold text-[#0F2A52] shadow-[0_2px_6px_rgba(15,42,82,.08)] disabled:opacity-40">Berikutnya ›</button>
              </span>
            </div>

            <div className="mt-4 rounded-[16px] bg-white p-4 text-[12.5px] leading-snug text-[#55657D] shadow-[0_8px_22px_rgba(15,42,82,.06)]">
              <b className="text-[#0F2A52]">Cara membaca.</b> <b>Sub SLS diidentifikasi</b> (PML): Sub SLS yang hasilnya diisi PML pada tanggal itu. <b>KK berhasil</b> (PPL dan korwil; penandaan KK oleh PML tidak dihitung): KK dengan hasil terdampak atau tidak terdampak pada tanggal itu; &quot;tidak ditemukan&quot; tidak dihitung. <b>Agregat</b>: jumlah kumulatif orang itu dari awal sampai tanggal baris, tidak terpengaruh saringan tanggal. <b>Translok</b> ({data.kegiatan?.nama ?? "kegiatan Pendataan"}): hari kerja dipilih, laporan harian{aturan.wajib_laporan ? "" : " (tidak wajib)"}, dan {aturan.jumlah_foto} foto. <b>Lengkap</b> = hari kerja + hasil + laporan + foto sesuai aturan; <b>Sebagian</b> = hari kerja dan hasil ada tetapi laporan/foto belum lengkap; <b>Anomali</b> = ada hasil, laporan, atau foto tanpa hari kerja, atau hari kerja tanpa hasil lapangan (hari berjalan bisa tampil anomali sementara hasil belum masuk); <b>Tidak ada klaim</b> = tidak ada hari kerja dan tidak ada hasil. Penandaan di HP yang belum terkirim belum masuk hitungan. <b>Korwil</b> = pegawai organik (selain PML organik) yang mengoordinasi wilayah; hari kerja tanpa hasil lapangan tidak dianggap anomali bagi korwil. Sejak 27 Okt 2026 hasil korwil = <b>lembar Quality Check yang lengkap</b> (satuan &quot;lembar QC&quot;), bukan KK; sebelum tanggal itu tetap KK pendataan. Hanya jumlah yang ditampilkan; nama KK tidak muncul di halaman ini.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
