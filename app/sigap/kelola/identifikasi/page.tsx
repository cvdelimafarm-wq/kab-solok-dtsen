"use client";

// app/sigap/kelola/identifikasi/page.tsx
//
// (10 Okt 2026) Monitoring Lembar Identifikasi SLS seluruh PML (mockup disetujui user) -- hanya pemegang izin bencana.admin
// (Admin Bencana, Pengelola PSP, Admin Aplikasi). Progres terendah dulu; baris PML bisa dibuka untuk melihat Sub SLS-nya satu per satu.
// Progres tiap PML = SLS yang dipegang sebagai PELAKSANA (sekat unik, total tidak ganda); peran pendamping ditampilkan terpisah (hasil dipakai bersama).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { JENIS_DAMPAK, JENIS_LAMA, keadaanSub, type RingkasIdentifikasi, type SubIdentifikasi } from "@/lib/identifikasi";
import { tampilAwal, tglJam } from "../../identifikasi/useIdentifikasi";

type Baris = { id: number; nama: string; sls: number; ringkas: RingkasIdentifikasi; pendamping: { sls: number; total: number; terisi: number }; terakhir: string | null; sub: SubIdentifikasi[] };
type Data = { sekarang: string; pml: Baris[]; status: { selesai: number; berjalan: number; belum: number; tanpa_wilayah: number }; total: RingkasIdentifikasi };
type Saring = "semua" | "belum" | "berjalan" | "selesai";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const keadaanPml = (b: Baris): Saring | "tanpa" => (b.ringkas.total === 0 ? "tanpa" : b.ringkas.terisi === 0 ? "belum" : b.ringkas.terisi >= b.ringkas.total ? "selesai" : "berjalan");

export default function MonitoringIdentifikasi() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");
  const [buka, setBuka] = useState<number | null>(null);
  const [mengekspor, setMengekspor] = useState(false);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return router.replace("/");
    try {
      setData(await apiPortal<Data>("/api/portal/identifikasi/monitoring"));
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [router]);

  useEffect(() => {
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 60_000);
    return () => clearInterval(a);
  }, [muat]);

  const tampil = useMemo(() => (data?.pml ?? []).filter((b) => saring === "semua" || keadaanPml(b) === saring), [data, saring]);

  async function ekspor() {
    if (!data || mengekspor) return;
    setMengekspor(true);
    try {
      const XLSX = await import("xlsx");
      const ringkas = data.pml.map((b) => ({
        PML: b.nama,
        "SLS (pelaksana)": b.sls,
        "Sub SLS (pelaksana)": b.ringkas.total,
        Terisi: b.ringkas.terisi,
        "Tidak terdampak": b.ringkas.tidak_terdampak,
        "Sub SLS didampingi": b.pendamping.total,
        "Didampingi, terisi": b.pendamping.terisi,
        "Progres pelaksana (%)": b.ringkas.total ? Math.round((b.ringkas.terisi / b.ringkas.total) * 100) : 0,
        "KK terdampak awal (Sub SLS terisi)": b.ringkas.awal,
        "KK terdampak hasil": b.ringkas.hasil,
        "Terakhir disimpan": b.terakhir ? tglJam(b.terakhir) : "",
      }));
      const rinci = data.pml.flatMap((b) =>
        b.sub.map((s) => {
          const h = s.hasil;
          const baris: Record<string, string | number> = {
            PML: b.nama,
            Peran: s.peran === "pelaksana" ? "Pelaksana" : "Pendamping",
            "PML rekan": s.rekan ?? "",
            Kecamatan: s.kecamatan,
            Nagari: s.nagari,
            SLS: s.sls,
            "Sub SLS": s.sub_sls,
            "ID Sub SLS": s.idsubsls,
            "KK tinggal": Math.round(s.kk),
            "Terdampak awal": Math.round(s.kk_awal),
            Status: { belum: "Belum diisi", terdampak: "Terdampak", tidak_terdampak: "Tidak terdampak" }[keadaanSub(s)],
            "KK terdampak hasil": h ? h.kk_terdampak : "",
          };
          for (const j of [...JENIS_DAMPAK, ...JENIS_LAMA]) baris[j.label] = h ? h[j.kunci] : "";
          baris["Keterangan Lainnya"] = h?.lainnya_ket ?? "";
          baris["Catatan"] = h?.catatan ?? "";
          baris["Diisi oleh"] = h?.oleh ?? "";
          baris["Terakhir disimpan"] = h ? tglJam(h.diperbarui_at) : "";
          return baris;
        })
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ringkas), "Ringkasan PML");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rinci), "Per Sub SLS");
      XLSX.writeFile(wb, `identifikasi-sls-${new Date(data.sekarang).toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setMengekspor(false);
    }
  }

  const t = data?.total;
  const persen = t && t.total ? Math.round((t.terisi / t.total) * 100) : 0;
  const chip = (k: Saring, teks: string, n: number) => (
    <button key={k} type="button" onClick={() => setSaring(k)} aria-pressed={saring === k} className={`min-h-[40px] rounded-full px-3.5 text-[12.5px] font-extrabold ${saring === k ? "bg-[#0F2A52] text-white" : "bg-white text-[#55657D] shadow-[0_2px_6px_rgba(15,42,82,.08)]"}`}>
      {teks} {n}
    </button>
  );

  return (
    <main className="min-h-screen bg-[#F5F8FE] px-4 py-6 text-[#1B2B4B]">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/" className="text-[12px] font-bold text-[#1F5FD1]">
              ‹ Beranda
            </Link>
            <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]">Kelola · Pendataan Pascabencana</p>
            <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.4px] text-[#0F2A52]">Monitoring Identifikasi SLS</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-[#55657D]">Progres pengisian Lembar Identifikasi SLS oleh seluruh PML, mulai 10 Oktober 2026, atas pembagian per SLS (pelaksana terdekat + pendamping) di nagari terdampak. Ketuk baris PML untuk melihat Sub SLS-nya satu per satu.</p>
          </div>
          <button type="button" onClick={ekspor} disabled={!data || mengekspor} className="inline-flex h-11 items-center rounded-[12px] bg-[#1F5FD1] px-5 text-[13.5px] font-extrabold text-white disabled:bg-[#A9BCD8]">
            {mengekspor ? "Menyiapkan…" : "Ekspor Excel"}
          </button>
        </div>

        {galat && <p className="mt-4 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!data && !galat && <div className="mt-5 h-40 animate-pulse rounded-[18px] bg-white" aria-busy="true" />}

        {data && t && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-[16px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                <span className="text-[12px] text-[#55657D]">Sub SLS terisi</span>
                <b className="mt-1 block text-[26px] text-[#0F2A52]">
                  {t.terisi} <span className="text-[14px] font-bold text-[#6B7A90]">dari {t.total}</span>
                </b>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E3E8F0]">
                  <div className="h-full bg-[#19A463]" style={{ width: `${persen}%` }} />
                </div>
                {t.tidak_terdampak > 0 && <small className="mt-1.5 block text-[11.5px] text-[#12618F]">{t.tidak_terdampak} dinyatakan tidak terdampak</small>}
              </div>
              <div className="rounded-[16px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
                <span className="text-[12px] text-[#55657D]">PML selesai / berjalan / belum</span>
                <b className="mt-1 block text-[26px] text-[#0F2A52]">
                  {data.status.selesai} / {data.status.berjalan} / {data.status.belum}
                </b>
                {data.status.tanpa_wilayah > 0 && <small className="mt-1.5 block text-[11.5px] text-[#6B7A90]">{data.status.tanpa_wilayah} PML belum kebagian SLS</small>}
              </div>
              <div className="rounded-[16px] bg-[#FFF4D6] p-4">
                <span className="text-[12px] text-[#8A6200]">KK terdampak awal (Sub SLS terisi)</span>
                <b className="mt-1 block text-[26px] text-[#8A6200]">{fmt(t.awal)}</b>
              </div>
              <div className="rounded-[16px] bg-[#E3F6EC] p-4">
                <span className="text-[12px] text-[#13794B]">KK terdampak hasil identifikasi</span>
                <b className="mt-1 block text-[26px] text-[#13794B]">{fmt(t.hasil)}</b>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {chip("semua", "Semua", data.pml.length)}
              {chip("belum", "Belum mulai", data.status.belum)}
              {chip("berjalan", "Berjalan", data.status.berjalan)}
              {chip("selesai", "Selesai", data.status.selesai)}
              <span className="ml-auto text-[12px] text-[#6B7A90]">Urut: progres terendah dulu</span>
            </div>

            <div className="mt-3 overflow-x-auto rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
              <div className="min-w-[960px]">
                <div className="grid grid-cols-[200px_56px_minmax(180px,1fr)_84px_84px_84px_96px_120px] items-end gap-x-3 border-b border-[#EEF2F7] bg-[#F7FAFE] px-5 py-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]">
                  <span>PML</span>
                  <span className="text-right">SLS</span>
                  <span>Progres Sub SLS</span>
                  <span className="text-right">Tdk terdampak</span>
                  <span className="text-right">Awal</span>
                  <span className="text-right">Hasil</span>
                  <span className="text-right">Pendamping</span>
                  <span className="text-right">Terakhir disimpan</span>
                </div>
                {tampil.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-[#6B7A90]">Tidak ada PML pada saringan ini.</p>}
                {tampil.map((b) => {
                  const k = keadaanPml(b);
                  const p = b.ringkas.total ? Math.round((b.ringkas.terisi / b.ringkas.total) * 100) : 0;
                  const terbuka = buka === b.id;
                  return (
                    <div key={b.id} className="border-b border-[#EEF2F7]">
                      <button type="button" onClick={() => setBuka(terbuka ? null : b.id)} aria-expanded={terbuka} className="grid min-h-[44px] w-full grid-cols-[200px_56px_minmax(180px,1fr)_84px_84px_84px_96px_120px] items-center gap-x-3 px-5 py-1 text-left active:bg-[#EAF1FC]">
                        <span className="text-[13px] font-bold text-[#0F2A52]">
                          <span className="mr-1 text-[#A5B3C7]">{terbuka ? "▾" : "▸"}</span>
                          {b.nama}
                        </span>
                        <span className="text-right text-[13px] text-[#55657D]">{b.sls || "–"}</span>
                        <span className="flex items-center gap-2.5">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#E3E8F0]">
                            <span className="block h-full" style={{ width: `${p}%`, background: k === "selesai" ? "#19A463" : k === "belum" || k === "tanpa" ? "#C5D0E2" : "#1F5FD1" }} />
                          </span>
                          <span className="w-[104px] text-[12.5px] font-bold text-[#0F2A52]">{k === "tanpa" ? "Belum kebagian SLS" : `${b.ringkas.terisi} / ${b.ringkas.total} · ${p}%`}</span>
                        </span>
                        <span className="text-right text-[13px] font-bold text-[#12618F]">{b.ringkas.tidak_terdampak || "–"}</span>
                        <span className="text-right text-[13px] font-bold text-[#8A6200]">{b.ringkas.terisi ? fmt(b.ringkas.awal) : "–"}</span>
                        <span className="text-right text-[13px] font-extrabold text-[#13794B]">{b.ringkas.terisi ? fmt(b.ringkas.hasil) : "–"}</span>
                        <span className="text-right text-[12px] text-[#55657D]">{b.pendamping.total ? `${b.pendamping.terisi}/${b.pendamping.total}` : "–"}</span>
                        <span className="text-right text-[12px] text-[#6B7A90]">{b.terakhir ? tglJam(b.terakhir) : "–"}</span>
                      </button>
                      {terbuka && (
                        <div className="bg-[#F7FAFE] px-5 pb-3 pt-1">
                          {b.sub.length === 0 ? (
                            <p className="py-3 text-[12.5px] text-[#6B7A90]">Belum ada SLS yang dibagikan ke PML ini.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[820px] text-[12px]">
                                <thead>
                                  <tr className="text-left text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">
                                    <th className="py-1.5 pr-2">Sub SLS</th>
                                    <th className="px-1">Peran</th>
                                    <th className="px-1 text-right">KK</th>
                                    <th className="px-1 text-right">Awal</th>
                                    <th className="px-1">Status</th>
                                    <th className="px-1 text-right">Total hasil</th>
                                    <th className="px-1">Rincian</th>
                                    <th className="pl-2">Catatan</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.sub.map((s) => {
                                    const kd = keadaanSub(s);
                                    const h = s.hasil;
                                    const rincian = h ? [...JENIS_DAMPAK, ...JENIS_LAMA].filter((j) => h[j.kunci] > 0).map((j) => `${j.label} ${h[j.kunci]}${j.kunci === "lainnya" && h.lainnya_ket ? ` (${h.lainnya_ket})` : ""}`).join(" · ") : "";
                                    return (
                                      <tr key={s.idsubsls} className={`border-t border-[#E3EAF5] align-top ${kd === "tidak_terdampak" ? "bg-[#EAF5FD]" : ""}`}>
                                        <td className="py-1.5 pr-2 font-bold text-[#0F2A52]">
                                          {s.sls} · Sub {s.sub_sls}
                                          <span className="block text-[10.5px] font-semibold text-[#6B7A90]">
                                            {s.nagari}, {s.kecamatan}
                                          </span>
                                        </td>
                                        <td className="px-1 font-bold text-[#55657D]">{s.peran === "pelaksana" ? "Pelaksana" : "Pendamping"}</td>
                                        <td className="px-1 text-right">{Math.round(s.kk)}</td>
                                        <td className="px-1 text-right text-[#8A6200]">{tampilAwal(s.kk_awal)}</td>
                                        <td className="px-1 font-bold">
                                          {kd === "belum" ? <span className="text-[#8A97AB]">Belum diisi</span> : kd === "tidak_terdampak" ? <span className="text-[#12618F]">Tidak terdampak</span> : <span className="text-[#13794B]">Terdampak</span>}
                                        </td>
                                        <td className="px-1 text-right font-extrabold text-[#13794B]">{h ? h.kk_terdampak : "–"}</td>
                                        <td className="px-1 text-[#1B2B4B]">{rincian || "–"}</td>
                                        <td className="pl-2 text-[#55657D]">
                                          {h?.catatan || "–"}
                                          {h?.oleh && <span className="block text-[10.5px] text-[#8A97AB]">diisi {h.oleh}</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-snug text-[#55657D]">"Awal" dan "Hasil" hanya menjumlahkan Sub SLS yang sudah terisi supaya sebanding. Kolom Pendamping = Sub SLS yang didampingi PML itu (terisi/total, oleh siapa pun karena hasil dipakai bersama). PML hanya melihat progres miliknya sendiri di Lembar Identifikasi SLS.</p>
          </>
        )}
      </div>
    </main>
  );
}
