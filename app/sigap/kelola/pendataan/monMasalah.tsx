"use client";

// app/sigap/kelola/pendataan/monMasalah.tsx
// (11 Nov 2026) Bagian tampilan bersama monitoring untuk HP: papan "Perlu tindakan" (siapa bermasalah, apa masalahnya, ke mana menyelesaikan)
// dan grafik batang capaian. Murni tampilan; angkanya dihitung pemanggil.

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { ubahCache, useData } from "@/app/portal/dataBersama";
import { API_TINDAK_LANJUT, LABEL_STATUS_TINDAK, MAKS_CATATAN_TINDAK, statusEfektif, type BarisTindak, type DataTindak, type StatusTindak, type SumberTindak } from "@/lib/tindakLanjut";

/** Tautan ke tab Kelola Pendataan tempat masalah diselesaikan. */
export const KE_NOTIFIKASI = "/sigap/kelola/pendataan?tab=siaran&sub=manual";
export const KE_VERIFIKASI_TRANSLOK = "/sigap/kelola/pendataan?tab=administrasi&sub=verifikasi";
export const KE_ALOKASI_TIM = "/sigap/kelola/pendataan?tab=tim";

export type AksiMasalah = { teks: string; href?: string; klik?: () => void };
export type Masalah = {
  /** penanda stabil objek, format "jenis:id" (mis. "akun:12", "ppl:5"); dipakai menyimpan status tindak lanjut */
  kunci: string;
  nama: string;
  /** unit/wilayah tempat masalah terjadi (tim, peran) */
  sub?: string;
  /** 3 = kritis (merah), 2 = perhatian (kuning), 1 = info (abu) */
  berat: 1 | 2 | 3;
  /** jenis masalah singkat, mis. "Anomali translok" */
  jenis: string;
  /** uraian masalah */
  masalah: string;
  /** tanda stabil untuk status "Selesai": bila berubah (masalah baru), status selesai dianggap kambuh. Tidak boleh memuat angka yang ikut saringan. */
  tanda: string;
  /** seberapa besar dampaknya */
  dampak?: string;
  /** siapa yang menindaklanjuti */
  pj: string;
  aksi: AksiMasalah[];
};

const GAYA: Record<1 | 2 | 3, { garis: string; chip: string; label: string }> = {
  3: { garis: "border-l-[#B42329]", chip: "bg-[#FDE8E8] text-[#9B1C23]", label: "Kritis" },
  2: { garis: "border-l-[#D99A00]", chip: "bg-[#FFF4D6] text-[#8A6200]", label: "Perhatian" },
  1: { garis: "border-l-[#9AA8BC]", chip: "bg-[#EEF2F7] text-[#55657D]", label: "Info" },
};
const tombolAksi = "inline-flex min-h-[40px] items-center rounded-full bg-[#E4ECFA] px-3.5 text-[12.5px] font-extrabold text-[#0F2A52] active:bg-[#D3E0F6]";
const URUT_STATUS: StatusTindak[] = ["belum", "proses", "selesai"];

/** Simpanan status tindak lanjut per sumber (lapangan / progres); dibagi antar admin lewat API. */
function useTindak(sumber: SumberTindak) {
  const path = `${API_TINDAK_LANJUT}?sumber=${sumber}`;
  const d = useData<DataTindak>(path);
  const [galat, setGalat] = useState<string | null>(null);
  const peta = useMemo(() => new Map((d.data?.baris ?? []).map((b) => [b.kunci, b])), [d.data]);
  async function simpan(kunci: string, status: StatusTindak, catatan: string, masalah: string) {
    setGalat(null);
    try {
      const r = await apiPortal<{ baris: BarisTindak | null }>(API_TINDAK_LANJUT, { method: "POST", body: JSON.stringify({ sumber, kunci, status, catatan, masalah }) });
      ubahCache<DataTindak>(path, (x) => ({ ...x, baris: [...x.baris.filter((b) => b.kunci !== kunci), ...(r.baris ? [r.baris] : [])] }));
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan status.");
    }
  }
  return { peta, bisaUbah: d.data?.bisa_ubah ?? false, siap: !!d.data, galat: galat ?? (!d.data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null), simpan };
}

function BarisStatus({ m, st, kambuh, rec, bisaUbah, simpan }: { m: Masalah; st: StatusTindak; kambuh: boolean; rec?: BarisTindak; bisaUbah: boolean; simpan: (s: StatusTindak, catatan: string) => void }) {
  const [catatan, setCatatan] = useState(rec?.catatan ?? "");
  return (
    <div className="mt-2.5 border-t border-[#EEF2F7] pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[10px] bg-[#EEF2F7] p-[3px]" role="group" aria-label={`Status tindak lanjut ${m.nama}`}>
          {URUT_STATUS.map((x) => (
            <button key={x} type="button" disabled={!bisaUbah} onClick={() => st !== x && simpan(x, catatan)} aria-pressed={st === x} className={`min-h-[36px] rounded-[8px] px-2.5 text-[12px] font-extrabold disabled:cursor-default ${st === x ? (x === "selesai" ? "bg-[#19A463] text-white" : x === "proses" ? "bg-[#1F5FD1] text-white" : "bg-white text-[#0F2A52] shadow-[0_1px_4px_rgba(15,42,82,.15)]") : "text-[#55657D]"}`}>
              {LABEL_STATUS_TINDAK[x]}
            </button>
          ))}
        </div>
        {kambuh && <span className="rounded-full bg-[#FDE8E8] px-2 py-0.5 text-[11px] font-extrabold text-[#9B1C23]">Muncul lagi setelah selesai</span>}
      </div>
      {st !== "belum" && (
        <div className="mt-2">
          {bisaUbah ? (
            <input value={catatan} maxLength={MAKS_CATATAN_TINDAK} onChange={(e) => setCatatan(e.target.value)} onBlur={() => catatan !== (rec?.catatan ?? "") && simpan(st, catatan)} placeholder="Catatan tindak lanjut (opsional)" className="min-h-[40px] w-full rounded-[10px] border border-[#D9E3F2] px-2.5 text-[12.5px]" />
          ) : (
            rec?.catatan && <p className="text-[12px] text-[#55657D]">Catatan: {rec.catatan}</p>
          )}
          {rec && <p className="mt-1 text-[11px] text-[#8A97AB]">{rec.nama_oleh ?? "Admin"} · {new Date(rec.diubah_pada).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}</p>}
        </div>
      )}
    </div>
  );
}

export function PapanMasalah({ judul, sumber, daftar, kosong, awal = 4 }: { judul: string; sumber: SumberTindak; daftar: Masalah[]; kosong: string; awal?: number }) {
  const t = useTindak(sumber);
  const [semua, setSemua] = useState(false);
  const [tab, setTab] = useState<StatusTindak>("belum");
  const [berat, setBerat] = useState<0 | 1 | 2 | 3>(0);
  const lengkap = useMemo(() => daftar.map((m) => ({ m, ...statusEfektif(t.peta.get(m.kunci), m.tanda), rec: t.peta.get(m.kunci) })), [daftar, t.peta]);
  const jumlah = { belum: 0, proses: 0, selesai: 0 } as Record<StatusTindak, number>;
  for (const x of lengkap) jumlah[x.status]++;
  const urut = lengkap.filter((x) => x.status === tab && (berat === 0 || x.m.berat === berat)).sort((a, b) => b.m.berat - a.m.berat || a.m.nama.localeCompare(b.m.nama));
  const tampil = semua ? urut : urut.slice(0, awal);
  const kritis = lengkap.filter((x) => x.status === "belum" && x.m.berat === 3).length;
  return (
    <section className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4" aria-label={judul}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
        {jumlah.belum > 0 && <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${kritis > 0 ? "bg-[#FDE8E8] text-[#9B1C23]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>{jumlah.belum} belum ditangani{kritis > 0 ? ` · ${kritis} kritis` : ""}</span>}
      </div>
      {daftar.length === 0 ? (
        <p className="mt-2 rounded-[12px] bg-[#E8F6EE] px-3 py-2.5 text-[13px] text-[#0B6B3F]">{kosong}</p>
      ) : (
        <>
          <div className="mt-2.5 flex rounded-[12px] bg-[#EEF2F7] p-[3px]" role="tablist">
            {URUT_STATUS.map((x) => (
              <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => { setTab(x); setSemua(false); }} className={`min-h-[40px] flex-1 rounded-[9px] px-1 text-[12px] font-extrabold ${tab === x ? "bg-white text-[#0F2A52] shadow-[0_1px_5px_rgba(15,42,82,.12)]" : "text-[#55657D]"}`}>
                {LABEL_STATUS_TINDAK[x]} <span className="tabular-nums">({jumlah[x]})</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Saring tingkat">
            {([[0, "Semua"], [3, "Kritis"], [2, "Perhatian"], [1, "Info"]] as [0 | 1 | 2 | 3, string][]).map(([k, n]) => (
              <button key={k} type="button" onClick={() => { setBerat(k); setSemua(false); }} aria-pressed={berat === k} className={`min-h-[34px] rounded-full px-3 text-[12px] font-extrabold ${berat === k ? "bg-[#0F2A52] text-white" : "bg-[#F5F8FE] text-[#55657D]"}`}>
                {n}
              </button>
            ))}
          </div>
          {t.galat && <p className="mt-2 rounded-[10px] bg-[#FDE8E8] px-3 py-2 text-[12px] text-[#7A1D22]">{t.galat}</p>}
          {!t.siap && !t.galat && <p className="mt-2 text-[12px] text-[#6B7A90]">Memuat status tindak lanjut…</p>}
          {urut.length === 0 && <p className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-3 text-center text-[12.5px] text-[#6B7A90]">Tidak ada masalah berstatus “{LABEL_STATUS_TINDAK[tab]}”{berat ? " pada tingkat ini" : ""}.</p>}
          <ul className="mt-2.5 space-y-2">
            {tampil.map(({ m, status, kambuh, rec }) => (
              <li key={m.kunci} className={`rounded-[12px] border border-[#E8EDF5] border-l-[5px] bg-white p-3 ${GAYA[m.berat].garis}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block break-words text-[14px] leading-tight text-[#0F2A52]">{m.nama}</b>
                    {m.sub && <span className="text-[11.5px] text-[#6B7A90]">{m.sub}</span>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${GAYA[m.berat].chip}`}>{GAYA[m.berat].label}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-[#1B2B4B]"><b>{m.jenis}.</b> {m.masalah}</p>
                <dl className="mt-1.5 space-y-0.5 text-[11.5px] text-[#55657D]">
                  {m.dampak && (
                    <div className="flex gap-1.5"><dt className="shrink-0 font-bold">Dampak:</dt><dd>{m.dampak}</dd></div>
                  )}
                  <div className="flex gap-1.5"><dt className="shrink-0 font-bold">Tindak lanjut oleh:</dt><dd>{m.pj}</dd></div>
                </dl>
                {m.aksi.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.aksi.map((a) =>
                      a.href ? (
                        <Link key={a.teks} href={a.href} className={tombolAksi}>{a.teks} ›</Link>
                      ) : (
                        <button key={a.teks} type="button" onClick={a.klik} className={tombolAksi}>{a.teks}</button>
                      ),
                    )}
                  </div>
                )}
                <BarisStatus key={`${m.kunci}-${status}`} m={m} st={status} kambuh={kambuh} rec={rec} bisaUbah={t.bisaUbah} simpan={(s, c) => void t.simpan(m.kunci, s, c, m.tanda)} />
              </li>
            ))}
          </ul>
          {urut.length > awal && (
            <button type="button" onClick={() => setSemua((x) => !x)} className="mt-2.5 min-h-[40px] w-full rounded-[10px] bg-[#F5F8FE] text-[12.5px] font-extrabold text-[#1F5FD1]">
              {semua ? "Tampilkan lebih sedikit" : `Tampilkan semua ${urut.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export type BatangItem = { kunci: string; label: string; sub?: string; persen: number; ket: string; klik?: () => void };

/** Grafik batang mendatar: urut dari capaian terendah. Garis putus-putus = target 100%. */
export function BatangCapaian({ judul, item, awal = 8, catatan }: { judul: string; item: BatangItem[]; awal?: number; catatan?: string }) {
  const [semua, setSemua] = useState(false);
  const urut = [...item].sort((a, b) => a.persen - b.persen || a.label.localeCompare(b.label));
  const tampil = semua ? urut : urut.slice(0, awal);
  if (item.length === 0) return null;
  return (
    <section className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4" aria-label={judul}>
      <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
      {catatan && <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">{catatan}</p>}
      <ul className="mt-3 space-y-2">
        {tampil.map((b) => {
          const warna = b.persen >= 100 ? "bg-[#19A463]" : b.persen >= 50 ? "bg-[#1F5FD1]" : "bg-[#D99A00]";
          const isi = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-bold text-[#0F2A52]">{b.label}</span>
                <b className="shrink-0 text-[12.5px] tabular-nums text-[#0F2A52]">{b.persen}%</b>
              </div>
              <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-[#EEF2F7]" role="img" aria-label={`${b.label}: ${b.persen}% dari target`}>
                <div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, b.persen)}%` }} />
              </div>
              <span className="text-[11px] text-[#6B7A90]">{b.sub ? `${b.sub} · ` : ""}{b.ket}</span>
            </>
          );
          return (
            <li key={b.kunci}>
              {b.klik ? (
                <button type="button" onClick={b.klik} className="block w-full rounded-[10px] px-1 py-1 text-left active:bg-[#F5F8FE]">
                  {isi}
                </button>
              ) : (
                <div className="px-1 py-1">{isi}</div>
              )}
            </li>
          );
        })}
      </ul>
      {item.length > awal && (
        <button type="button" onClick={() => setSemua((x) => !x)} className="mt-2 min-h-[40px] w-full rounded-[10px] bg-[#F5F8FE] text-[12.5px] font-extrabold text-[#1F5FD1]">
          {semua ? "Tampilkan lebih sedikit" : `Tampilkan semua ${item.length}`}
        </button>
      )}
    </section>
  );
}

export type SegmenHari = { kunci: string; label: string; bagian: { n: number; warna: string; nama: string }[]; klik?: () => void };

/** Batang bertumpuk per baris (mis. status translok per tanggal). */
export function TumpukHarian({ judul, baris, legenda, catatan }: { judul: string; baris: SegmenHari[]; legenda: { nama: string; warna: string }[]; catatan?: string }) {
  if (baris.length === 0) return null;
  return (
    <section className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4" aria-label={judul}>
      <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
      {catatan && <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">{catatan}</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {legenda.map((l) => (
          <span key={l.nama} className="inline-flex items-center gap-1.5 text-[11.5px] text-[#55657D]">
            <i className={`inline-block h-2.5 w-2.5 rounded-sm ${l.warna}`} />
            {l.nama}
          </span>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {baris.map((b) => {
          const total = b.bagian.reduce((a, x) => a + x.n, 0);
          const isi = (
            <div className="flex items-center gap-2">
              <span className="w-[54px] shrink-0 text-[12px] font-bold text-[#55657D]">{b.label}</span>
              <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-[#EEF2F7]" role="img" aria-label={`${b.label}: ${b.bagian.map((x) => `${x.nama} ${x.n}`).join(", ")}`}>
                {b.bagian.filter((x) => x.n > 0).map((x) => (
                  <div key={x.nama} className={`${x.warna} flex items-center justify-center text-[10px] font-extrabold text-white`} style={{ width: `${total > 0 ? (x.n / total) * 100 : 0}%` }} title={`${x.nama}: ${x.n}`}>
                    {total > 0 && x.n / total >= 0.12 ? x.n : ""}
                  </div>
                ))}
              </div>
              <span className="w-8 shrink-0 text-right text-[11.5px] tabular-nums text-[#6B7A90]">{total}</span>
            </div>
          );
          return (
            <li key={b.kunci}>
              {b.klik ? (
                <button type="button" onClick={b.klik} className="block min-h-[32px] w-full rounded-[8px] text-left active:bg-[#F5F8FE]">
                  {isi}
                </button>
              ) : (
                isi
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
