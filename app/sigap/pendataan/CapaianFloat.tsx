"use client";

// app/sigap/pendataan/CapaianFloat.tsx
//
// (15 Okt 2026) Tombol float "Capaian hari ini" di Lembar Pendataan -- permintaan user (mockup disetujui): pil putih berbingkai biru bertumpuk
// DI ATAS tombol "+ Keluarga baru", menampilkan cincin persentase dan x / y poin. Diketuk -> lembar bawah dengan dua tab:
// "Hari ini" (rincian poin, kekurangan menjadi hutang) dan "Realisasi O-K" (O-K yang akan dibayar, hutang berjalan).
// Hanya PPL Pendataan Pascabencana (API memberi { ada: false } untuk akun lain -> tidak tampil). Tanpa rupiah.
// Sumber: /api/portal/pendataan/capaian lewat simpanan bersama (tampil seketika, diperbarui di belakang; ikut segar setelah menandai KK).
// Tombol "Ajukan permohonan update laporan terlewat" BELUM ada (alur permintaan izin susulan dari PPL belum dibangun).

import { useEffect, useState } from "react";
import { useData } from "@/app/portal/dataBersama";
import { formatAngka, teksPersen, teksXY, type CapaianHari, type DataCapaian } from "@/lib/skorKinerja";

const PATH_CAPAIAN = "/api/portal/pendataan/capaian";
type Aktif = Extract<DataCapaian, { ada: true }>;

const KETERANGAN_JARAK: Record<CapaianHari["metode"], string | null> = {
  jalan: "Jarak jalan dari rumah ke Sub SLS yang didata, pergi-pulang.",
  perkiraan: "Jarak perkiraan (garis lurus × 1,3) karena peta jalan belum tersedia; bisa sedikit berbeda dari jarak jalan.",
  tanpa_rumah: "Titik rumah Anda belum tercatat, jadi poin jarak belum dihitung. Hubungi admin untuk melengkapinya.",
  tanpa_titik: "Belum ada koordinat KK di Sub SLS yang didata, jadi poin jarak belum dihitung.",
  tidak_ada: null,
};

function Cincin({ persen, warna }: { persen: number; warna: string }) {
  const keliling = 2 * Math.PI * 16;
  const isi = (Math.min(Math.max(persen, 0), 100) / 100) * keliling;
  return (
    <svg className="h-[38px] w-[38px] flex-none" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="#DDE5F0" strokeWidth="5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke={warna} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${isi} ${keliling}`} transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" style={{ font: "800 10px system-ui", fill: "#0F2A52" }}>
        {Math.min(persen, 999)}%
      </text>
    </svg>
  );
}

function Baris({ judul, rumus, nilai, tebal }: { judul: string; rumus?: string; nilai: string; tebal?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 border-t border-[#E4EBF5] py-2 text-[13.5px] first:border-t-0 ${tebal ? "font-extrabold text-[#0F2A52]" : "text-[#1B2B4B]"}`}>
      <span>
        {judul}
        {rumus && <span className="block text-[12.5px] font-normal text-[#5B6B84]">{rumus}</span>}
      </span>
      <b className="whitespace-nowrap">{nilai}</b>
    </div>
  );
}

function TabHariIni({ d }: { d: Aktif }) {
  const h = d.hari_ini;
  const a = d.aturan;
  const lebih = h.persen >= 100;
  const ket = KETERANGAN_JARAK[h.metode];
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-[34px] font-extrabold leading-none text-[#0F2A52]">{formatAngka(h.total)}</span>
        <span className="text-[19px] font-bold text-[#5B6B84]">/ {formatAngka(h.target)}</span>
        <span className="text-[13px] text-[#5B6B84]">poin</span>
        <span className={`ml-auto rounded-full px-3 py-0.5 text-[16px] font-extrabold ${lebih ? "bg-[#E3F5EA] text-[#13794B]" : "bg-[#FFF1D6] text-[#9A5B00]"}`}>{teksPersen(h.total, h.target)}</span>
      </div>
      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-[#DDE5F0]" role="progressbar" aria-valuemin={0} aria-valuemax={h.target} aria-valuenow={Math.min(h.total, h.target)} aria-label="Poin hari ini terhadap target">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (h.total / h.target) * 100)}%`, background: lebih ? "#13794B" : "#1F5FD1" }} />
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-[#5B6B84]">
        <span>0</span>
        <span>{h.kurang > 0 ? `Kurang ${formatAngka(h.kurang)} poin` : "Target hari ini tercapai"}</span>
        <span>{formatAngka(h.target)}</span>
      </div>

      <div className="mt-2">
        <Baris judul="KK terdampak" rumus={`${h.terdampak} KK × ${a.poinTerdampak} poin`} nilai={`${formatAngka(h.poin_terdampak)} poin`} />
        <Baris judul="KK tidak terdampak" rumus={`${h.tidak_terdampak} KK × ${a.poinTidakTerdampak} poin`} nilai={`${formatAngka(h.poin_tidak_terdampak)} poin`} />
        <Baris judul="Jarak tempuh" rumus={`${formatAngka(h.km)} km × ${a.poinPerKm} poin (maks. ${a.maksPoinJarak} poin)`} nilai={`${formatAngka(h.poin_jarak)} poin`} />
        <Baris judul="Total hari ini" nilai={teksXY(h.total, h.target)} tebal />
      </div>
      {ket && <p className="mt-2 text-[12.5px] leading-snug text-[#5B6B84]">{ket}</p>}

      {d.bobot_berlaku && d.hutang_sebelumnya > 0 && (
        <p className="mt-2.5 rounded-[12px] bg-[#FFF1D6] px-3 py-2 text-[12.5px] text-[#9A5B00]">Hutang hari sebelumnya {formatAngka(d.hutang_sebelumnya)} poin: poin hari ini menutupnya lebih dulu.</p>
      )}
      {d.bobot_berlaku && h.kurang > 0 && (
        <p className="mt-2.5 rounded-[12px] bg-[#FFF1D6] px-3 py-2 text-[12.5px] text-[#9A5B00]">Kurang {formatAngka(h.kurang)} poin menjadi hutang. Poin besok menutup hutang ini lebih dulu.</p>
      )}
      {!d.bobot_berlaku && <p className="mt-2.5 rounded-[12px] bg-[#E6EDFB] px-3 py-2 text-[12.5px] text-[#1F4FBF]">Penilaian poin berlaku mulai 15 Okt 2026. Sebelum itu hari kerja lengkap dihitung penuh.</p>}
    </div>
  );
}

function TabRealisasi({ d }: { d: Aktif }) {
  const r = d.realisasi;
  const a = d.aturan;
  const hariIni = d.hari_ini.tanggal;
  const hariBobot = r.rincian.filter((x) => x.aturan === "bobot" && x.lengkap);
  const poinHariIni = r.rincian.find((x) => x.tanggal === hariIni);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap text-[32px] font-extrabold leading-none text-[#13794B]">{r.ok_dibayar} O-K</span>
        <span className="text-[13px] leading-snug text-[#5B6B84]">
          yang akan dibayar
          <br />
          (pecahan dibulatkan ke bawah)
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-1.5">
        <span className="text-[26px] font-extrabold leading-none text-[#0F2A52]">{formatAngka(r.ok_terkumpul)}</span>
        <span className="text-[16px] font-bold text-[#5B6B84]">/ {r.hari_dihitung}</span>
        <span className="text-[13px] text-[#5B6B84]">O-K dari {r.hari_dihitung} hari kerja</span>
        <span className="ml-auto rounded-full bg-[#FFF1D6] px-3 py-0.5 text-[14px] font-extrabold text-[#9A5B00]">{teksPersen(r.ok_terkumpul, r.hari_dihitung)}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#DDE5F0]">
        <div className="h-full rounded-full bg-[#1F5FD1]" style={{ width: `${r.hari_dihitung > 0 ? Math.min(100, (r.ok_terkumpul / r.hari_dihitung) * 100) : 0}%` }} />
      </div>
      <div className="mt-2">
        <Baris judul={`Sampai 14 Okt (dihitung penuh)`} nilai={`${r.ok_lama} / ${r.ok_lama} O-K`} />
        <Baris
          judul="Mulai 15 Okt (sesuai bobot)"
          rumus={poinHariIni && poinHariIni.aturan === "bobot" ? `Hari ini ${teksXY(poinHariIni.poin, a.targetHarian)} poin` : undefined}
          nilai={`${formatAngka(r.ok_bobot)} / ${hariBobot.length} O-K`}
        />
        <Baris judul="Hutang berjalan" nilai={r.hutang_poin > 0 ? `${formatAngka(r.hutang_poin)} poin` : "tidak ada"} />
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-[#5B6B84]">
        {formatAngka(a.targetHarian)} poin = 1 O-K. Capaian di atas 100% pada satu hari tidak menambah pembayaran. Hari yang belum lengkap (laporan atau foto) belum dihitung.
      </p>
    </div>
  );
}

/** Tombol mengambang di kiri bawah (sebaris dengan "+ Keluarga baru" di kanan). */
export default function CapaianFloat() {
  const { data } = useData<DataCapaian>(PATH_CAPAIAN);
  const [buka, setBuka] = useState(false);
  const [tab, setTab] = useState<"hari" | "realisasi">("hari");

  useEffect(() => {
    if (!buka) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuka(false);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [buka]);

  if (!data || !data.ada) return null;
  const h = data.hari_ini;
  const tercapai = h.persen >= 100;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTab("hari");
          setBuka(true);
        }}
        aria-label={`Capaian hari ini ${formatAngka(h.total)} dari ${formatAngka(h.target)} poin, ${teksPersen(h.total, h.target)}`}
        className="fixed bottom-6 left-4 z-20 flex h-[52px] items-center gap-2 rounded-full border-[1.5px] border-[#1F5FD1] bg-white pl-2 pr-4 text-left text-[#0F2A52] shadow-[0_8px_22px_rgba(15,42,82,.25)] active:bg-[#F2F6FD]"
      >
        <Cincin persen={h.persen} warna={tercapai ? "#13794B" : "#B7791F"} />
        <span className="leading-tight">
          <small className="block text-[11px] font-semibold text-[#5B6B84]">Capaian hari ini</small>
          <b className="block text-[14.5px] font-extrabold">{teksXY(h.total, h.target)} poin</b>
        </span>
      </button>

      {buka && (
        <div className="fixed inset-0 z-40 bg-[#0F2A52]/55" onClick={() => setBuka(false)}>
          <div role="dialog" aria-modal="true" aria-label="Capaian saya" className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-xl overflow-y-auto rounded-t-[24px] bg-white px-4 pb-6 pt-2" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#D9E3F2]" />
            <button type="button" onClick={() => setBuka(false)} aria-label="Tutup" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-[22px] text-[#6B7A90]">
              ×
            </button>
            <h2 className="pr-10 text-[16px] font-extrabold text-[#0F2A52]">Capaian saya</h2>
            <p className="mb-2 text-[12.5px] text-[#5B6B84]">{tab === "hari" ? `Hari ini · target minimal ${formatAngka(data.aturan.targetHarian)} poin` : `Sejak awal kegiatan · ${formatAngka(data.aturan.targetHarian)} poin = 1 O-K`}</p>
            <div className="mb-3 grid grid-cols-2 rounded-[12px] bg-[#EEF3FA] p-[3px]" role="tablist">
              {(
                [
                  ["hari", "Hari ini"],
                  ["realisasi", "Realisasi O-K"],
                ] as const
              ).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`min-h-[40px] rounded-[10px] text-[13px] font-bold ${tab === k ? "bg-white text-[#0F2A52] shadow-[0_1px_4px_rgba(15,42,82,.15)]" : "text-[#5B6B84]"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "hari" ? <TabHariIni d={data} /> : <TabRealisasi d={data} />}
          </div>
        </div>
      )}
    </>
  );
}
