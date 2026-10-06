"use client";

// app/sigap/pedia/kelola/page.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- penatausahaan (khusus pengelola) -- permintaan user:
//   Tab Buku register : tabel entri + filter (tahun, kategori, kanal, status, perlu ditinjau, tautan SPJ/kegiatan)
//                       + badge DKIM & Timestamp + ekspor Excel/CSV + Paket Bukti per kegiatan/SPJ.
//   Tab Rekap         : per kategori/kanal/tahun/status, "diajukan" > 14 hari, perlu ditinjau, TSA tertunda,
//                       status rantai audit.
//   Tab Master data   : kategori & sub-kategori, regulasi (status diubah/dicabut -> entri ditandai), tag.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Memuat, Pesan, TD, TH, type ItemTab } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import { aksiP, ambilP, unduhBiner, type Kartu } from "../api";
import { BadgeTinjau } from "../komponen";
import { JENIS_REGULASI, KANAL, STATUS, tanggalIndo } from "@/lib/pedia/umum";

type Tab = "register" | "rekap" | "master";
const TAB: ItemTab<Tab>[] = [
  { kode: "register", label: "Buku register" },
  { kode: "rekap", label: "Rekap" },
  { kode: "master", label: "Master data" },
];
type Kat = { id: number; kode: string; nama: string; induk_id: number | null; deskripsi: string | null; urutan: number; aktif: boolean; dipakai?: number };
type BarisReg = Kartu & { bukti: { file: number; tsa_ok: number; tsa_pending: number; dkim_pass: number; dkim_lain: number } };

export default function KelolaPedia() {
  const [tab, setTab] = useState<Tab>("register");
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TAB.some((x) => x.kode === t)) setTab(t);
  }, []);
  return (
    <Bingkai
      aktif="pedia_kelola"
      kecil="SIGAP PEDIA · Penatausahaan"
      jejak={["SIGAP PEDIA", "Register & arsip bukti"]}
      judul="Register & arsip bukti"
      sub="Penatausahaan konsultasi resmi: nomor registrasi, bukti asli ber-SHA-256 & timestamp, verifikasi, Paket Bukti untuk Inspektorat."
      kanan={(gelap) => (
        <Link href="/sigap/pedia/kelola/baru" className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN}>
          + Entri baru
        </Link>
      )}
      tab={TAB}
      aktifTab={tab}
      onTab={(t) => {
        setTab(t);
        const u = new URL(window.location.href);
        u.searchParams.set("tab", t);
        window.history.replaceState(null, "", u.toString());
      }}
    >
      {tab === "register" ? <Register /> : tab === "rekap" ? <Rekap /> : <Master />}
    </Bingkai>
  );
}

// ======================================================================== Register
function Register() {
  const [data, setData] = useState<{ entri: BarisReg[]; kategori: Kat[]; tahun: number[] } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [f, setF] = useState({ tahun: "", kategori: "", kanal: "", status: "", tinjau: false, tautan_jenis: "", tautan_ref: "" });
  const [cari, setCari] = useState("");
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("tautan_jenis")) setF((x) => ({ ...x, tautan_jenis: p.get("tautan_jenis") ?? "", tautan_ref: p.get("tautan_ref") ?? "" }));
  }, []);

  const muat = useCallback(async () => {
    try {
      setData(await ambilP({ bagian: "register", ...f, tinjau: f.tinjau ? "1" : "" }));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [f]);
  useEffect(() => {
    muat();
  }, [muat]);

  const induk = (data?.kategori ?? []).filter((k) => !k.induk_id);
  const q = cari.trim().toLowerCase();
  const tampil = (data?.entri ?? []).filter((e) => !q || `${e.nomor_registrasi} ${e.judul} ${e.nomor_tiket ?? ""} ${e.tag.join(" ")}`.toLowerCase().includes(q));
  const qs = new URLSearchParams(Object.entries({ tahun: f.tahun, kategori: f.kategori, kanal: f.kanal, status: f.status }).filter(([, v]) => v) as [string, string][]).toString();

  async function ekspor(format: "xlsx" | "csv") {
    setSibuk(true);
    try {
      await unduhBiner(`/api/sigap/pedia/register?format=${format}&${qs}`, `Register_SIGAP_PEDIA.${format}`);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }
  async function paketTautan() {
    setSibuk(true);
    try {
      await unduhBiner(`/api/sigap/pedia/paket?jenis=${f.tautan_jenis}&ref=${f.tautan_ref}`, "PaketBukti.zip");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <>
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {f.tautan_jenis && (
        <Pesan jenis="info">
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Menampilkan entri yang tertaut ke <b>{f.tautan_jenis}</b> #{f.tautan_ref}.
            </span>
            <button type="button" className={BTN} disabled={sibuk || !tampil.length} onClick={paketTautan}>
              Paket Bukti semua entri (ZIP)
            </button>
            <button type="button" className={BTN_O} onClick={() => setF((x) => ({ ...x, tautan_jenis: "", tautan_ref: "" }))}>
              Hapus saringan
            </button>
          </span>
        </Pesan>
      )}
      <section className="overflow-hidden rounded-[10px] border border-[#E3E8EE] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E3E8EE] px-[18px] py-3.5">
          <h2 className="mr-auto text-[15px] font-semibold">Buku register</h2>
          <select value={f.tahun} onChange={(e) => setF({ ...f, tahun: e.target.value })} className={`${INPUT} h-[34px]`} aria-label="Tahun">
            <option value="">Semua tahun</option>
            {(data?.tahun ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value })} className={`${INPUT} h-[34px] max-w-[220px]`} aria-label="Kategori">
            <option value="">Semua kategori</option>
            {induk.map((k) => (
              <optgroup key={k.id} label={`${k.kode} ${k.nama}`}>
                <option value={k.kode}>
                  {k.kode} (semua sub)
                </option>
                {(data?.kategori ?? [])
                  .filter((s) => s.induk_id === k.id)
                  .map((s) => (
                    <option key={s.id} value={s.kode}>
                      {s.kode} {s.nama}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <select value={f.kanal} onChange={(e) => setF({ ...f, kanal: e.target.value })} className={`${INPUT} h-[34px]`} aria-label="Kanal">
            <option value="">Semua kanal</option>
            {Object.entries(KANAL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={`${INPUT} h-[34px]`} aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-[#4D5B6B]">
            <input type="checkbox" checked={f.tinjau} onChange={(e) => setF({ ...f, tinjau: e.target.checked })} /> perlu ditinjau
          </label>
          <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nomor / judul / tiket" className={`${INPUT} h-[34px] w-full sm:w-[200px]`} />
          <button type="button" className={BTN_O} disabled={sibuk} onClick={() => ekspor("xlsx")}>
            Ekspor Excel
          </button>
          <button type="button" className={BTN_O} disabled={sibuk} onClick={() => ekspor("csv")}>
            CSV
          </button>
        </div>
        {!data ? (
          <Memuat />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Nomor registrasi</th>
                  <th className={TH}>Tanggal</th>
                  <th className={TH}>Kategori</th>
                  <th className={TH}>Kanal · tiket</th>
                  <th className={TH}>Judul</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>DKIM</th>
                  <th className={TH}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((e) => (
                  <tr key={e.id} tabIndex={0} onClick={() => (window.location.href = `/sigap/pedia/kelola/${e.id}`)} onKeyDown={(x) => x.key === "Enter" && (window.location.href = `/sigap/pedia/kelola/${e.id}`)} className="cursor-pointer hover:bg-[#F8FAFC]">
                    <td className={`${TD} whitespace-nowrap font-mono text-[12.5px] font-semibold`}>{e.nomor_registrasi}</td>
                    <td className={`${TD} whitespace-nowrap text-[12px]`}>
                      <div>{e.tgl_diajukan ? `↑ ${tanggalIndo(e.tgl_diajukan)}` : "–"}</div>
                      <div className="text-[#7B8794]">{e.tgl_dijawab ? `↓ ${tanggalIndo(e.tgl_dijawab)}` : ""}</div>
                    </td>
                    <td className={`${TD} text-[12px]`}>{e.kategori ? `${e.kategori.kode} ${e.kategori.nama}` : "–"}</td>
                    <td className={`${TD} text-[12px]`}>
                      <div>{KANAL[e.kanal] ?? e.kanal}</div>
                      <div className="font-mono text-[#7B8794]">{e.nomor_tiket ?? ""}</div>
                    </td>
                    <td className={`${TD} max-w-[360px]`}>
                      <div className="line-clamp-2 font-semibold">{e.judul}</div>
                      {e.perlu_ditinjau && <BadgeTinjau alasan={e.alasan_tinjau} />}
                    </td>
                    <td className={TD}>
                      <Chip w={STATUS[e.status]?.w ?? "mut"}>{STATUS[e.status]?.label ?? e.status}</Chip>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {e.bukti.dkim_pass + e.bukti.dkim_lain === 0 ? (
                        <span className="text-[#CDD5DE]">–</span>
                      ) : e.bukti.dkim_lain === 0 ? (
                        <Chip w="ok">✔ {e.bukti.dkim_pass}</Chip>
                      ) : (
                        <Chip w="bad">✘ {e.bukti.dkim_lain}</Chip>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {e.bukti.file === 0 ? <span className="text-[12px] text-[#7B8794]">belum ada file</span> : e.bukti.tsa_pending ? <Chip w="wait">{e.bukti.tsa_pending} pending</Chip> : <Chip w="ok">✔ {e.bukti.tsa_ok}</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tampil.length === 0 && <div className="px-[18px] py-10 text-center text-[#4D5B6B]">Belum ada entri yang cocok.</div>}
          </div>
        )}
        <div className="flex justify-between border-t border-[#E3E8EE] px-[18px] py-2.5 text-[12.5px] text-[#7B8794]">
          <span>
            Menampilkan {tampil.length} dari {data?.entri.length ?? 0} entri
          </span>
          <span>Klik baris untuk membuka detail & bukti</span>
        </div>
      </section>
    </>
  );
}

// ======================================================================== Rekap
type DataRekap = {
  total: number;
  per_kategori: [string, number][];
  per_kanal: [string, number][];
  per_tahun: [string, number][];
  per_status: [string, number][];
  diajukan_lama: Kartu[];
  perlu_ditinjau: Kartu[];
  tsa_pending: number;
  tsa_dicoba_ulang: { id: number; ok: boolean }[];
  rantai_audit: { utuh: boolean; id?: number; masalah?: string };
};

function Batang({ judul, data, label }: { judul: string; data: [string, number][]; label?: (k: string) => string }) {
  const maks = Math.max(1, ...data.map((d) => d[1]));
  return (
    <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
      <h3 className="text-[14px] font-semibold">{judul}</h3>
      {data.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-[#7B8794]">Belum ada data.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {data.map(([k, n]) => (
            <li key={k} className="text-[12.5px]">
              <div className="flex justify-between gap-2">
                <span className="truncate">{label ? label(k) : k}</span>
                <b className="tabular-nums">{n}</b>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-[#EDF0F4]">
                <div className="h-full rounded-full bg-[#1F6FD1]" style={{ width: `${(n / maks) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Rekap() {
  const [d, setD] = useState<DataRekap | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    ambilP<DataRekap>({ bagian: "rekap" })
      .then(setD)
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, []);
  if (galat) return <Pesan>{galat}</Pesan>;
  if (!d) return <Memuat />;
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Entri aktif", String(d.total), ""],
          ["Diajukan > 14 hari", String(d.diajukan_lama.length), d.diajukan_lama.length ? "#B5352D" : ""],
          ["Perlu ditinjau", String(d.perlu_ditinjau.length), d.perlu_ditinjau.length ? "#B5352D" : ""],
          ["Timestamp tertunda", String(d.tsa_pending), d.tsa_pending ? "#9A6200" : ""],
        ].map(([l, n, w]) => (
          <div key={l} className="rounded-[10px] border border-[#E3E8EE] bg-white p-3.5">
            <p className="text-[12px] text-[#7B8794]">{l}</p>
            <p className="text-[22px] font-bold" style={w ? { color: w } : undefined}>
              {n}
            </p>
          </div>
        ))}
      </div>
      <Pesan jenis={d.rantai_audit.utuh ? "ok" : "galat"}>
        Rantai hash audit log: {d.rantai_audit.utuh ? "utuh (tidak ada baris yang hilang/diubah)." : `PUTUS di baris #${d.rantai_audit.id} — ${d.rantai_audit.masalah}`}
        {d.tsa_dicoba_ulang.length > 0 && ` · Coba ulang timestamp otomatis: ${d.tsa_dicoba_ulang.filter((x) => x.ok).length}/${d.tsa_dicoba_ulang.length} berhasil.`}
      </Pesan>
      <div className="grid gap-3 lg:grid-cols-4">
        <Batang judul="Per kategori" data={d.per_kategori} />
        <Batang judul="Per kanal" data={d.per_kanal} label={(k) => KANAL[k] ?? k} />
        <Batang judul="Per tahun" data={d.per_tahun} />
        <Batang judul="Per status" data={d.per_status} label={(k) => STATUS[k]?.label ?? k} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[
          ["Diajukan lebih dari 14 hari belum dijawab", d.diajukan_lama],
          ["Perlu ditinjau", d.perlu_ditinjau],
        ].map(([judul, daftar]) => (
          <section key={judul as string} className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
            <h3 className="text-[14px] font-semibold">{judul as string}</h3>
            {(daftar as Kartu[]).length === 0 ? (
              <p className="mt-1 text-[12.5px] text-[#7B8794]">Tidak ada.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#EDF0F4]">
                {(daftar as Kartu[]).map((e) => (
                  <li key={e.id} className="py-1.5 text-[13px]">
                    <Link href={`/sigap/pedia/kelola/${e.id}`} className="hover:text-[#1F6FD1]">
                      <span className="font-mono text-[12px] text-[#7B8794]">{e.nomor_registrasi}</span> <span className="font-semibold">{e.judul}</span>
                    </Link>
                    <div className="text-[11.5px] text-[#7B8794]">{e.perlu_ditinjau ? e.alasan_tinjau : `diajukan ${tanggalIndo(e.tgl_diajukan ?? e.dibuat_at)}`}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ======================================================================== Master
type Reg = { id: number; jenis: string; nomor: string; tahun: number; judul: string | null; status: string; diubah_oleh_teks: string | null; catatan: string | null; dipakai: number };

function Master() {
  const [d, setD] = useState<{ kategori: Kat[]; regulasi: Reg[]; tag: { id: number; nama: string; dipakai: number }[] } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [kat, setKat] = useState<Partial<Kat> | null>(null);
  const [reg, setReg] = useState<Partial<Reg> | null>(null);
  const muat = useCallback(async () => {
    try {
      setD(await ambilP({ bagian: "master" }));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);
  const induk = useMemo(() => (d?.kategori ?? []).filter((k) => !k.induk_id), [d]);

  async function simpanKat() {
    try {
      await aksiP("kategori_simpan", { kategori: kat });
      setKat(null);
      setInfo("Kategori tersimpan.");
      muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }
  async function simpanReg() {
    if (reg?.id && reg.status && reg.status !== "berlaku" && reg.dipakai && !confirm(`Mengubah status menjadi "${reg.status}" akan menandai ${reg.dipakai} entri sebagai PERLU DITINJAU. Lanjutkan?`)) return;
    try {
      const r = await aksiP<{ entri_ditandai: number }>("regulasi_simpan", { regulasi: reg });
      setReg(null);
      setInfo(`Regulasi tersimpan.${r.entri_ditandai ? ` ${r.entri_ditandai} entri ditandai perlu ditinjau.` : ""}`);
      muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }

  if (!d) return galat ? <Pesan>{galat}</Pesan> : <Memuat />;
  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && (
        <Pesan jenis="ok" onTutup={() => setInfo(null)}>
          {info}
        </Pesan>
      )}

      {/* Kategori */}
      <section className="overflow-hidden rounded-[10px] border border-[#E3E8EE] bg-white">
        <div className="flex items-center gap-2 border-b border-[#E3E8EE] px-4 py-3">
          <h2 className="mr-auto text-[15px] font-semibold">Kategori & sub-kategori</h2>
          <button type="button" className={BTN} onClick={() => setKat({ kode: "", nama: "", induk_id: null, urutan: 0, aktif: true })}>
            + Kategori
          </button>
        </div>
        {kat && (
          <div className="grid gap-2 border-b border-[#E3E8EE] bg-[#F8FAFC] px-4 py-3 sm:grid-cols-6">
            <select value={kat.induk_id ?? ""} onChange={(e) => setKat({ ...kat, induk_id: e.target.value ? Number(e.target.value) : null })} className={`${INPUT} sm:col-span-2`}>
              <option value="">(kategori induk)</option>
              {induk.map((k) => (
                <option key={k.id} value={k.id}>
                  sub dari {k.kode} {k.nama}
                </option>
              ))}
            </select>
            <input value={kat.kode ?? ""} onChange={(e) => setKat({ ...kat, kode: e.target.value })} placeholder="Kode (mis. PD.05)" className={INPUT} />
            <input value={kat.nama ?? ""} onChange={(e) => setKat({ ...kat, nama: e.target.value })} placeholder="Nama" className={`${INPUT} sm:col-span-2`} />
            <input type="number" value={kat.urutan ?? 0} onChange={(e) => setKat({ ...kat, urutan: Number(e.target.value) })} placeholder="Urutan" className={INPUT} />
            <input value={kat.deskripsi ?? ""} onChange={(e) => setKat({ ...kat, deskripsi: e.target.value })} placeholder="Deskripsi (opsional)" className={`${INPUT} sm:col-span-4`} />
            <label className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" checked={kat.aktif !== false} onChange={(e) => setKat({ ...kat, aktif: e.target.checked })} /> aktif
            </label>
            <div className="flex gap-2">
              <button type="button" className={BTN} onClick={simpanKat}>
                Simpan
              </button>
              <button type="button" className={BTN_O} onClick={() => setKat(null)}>
                Batal
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-x-6 gap-y-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {induk.map((k) => (
            <div key={k.id}>
              <button type="button" className={`text-left text-[13.5px] font-semibold hover:text-[#1F6FD1] ${k.aktif ? "" : "text-[#7B8794] line-through"}`} onClick={() => setKat(k)}>
                {k.kode} {k.nama} <span className="text-[11.5px] font-normal text-[#7B8794]">({k.dipakai ?? 0})</span>
              </button>
              <ul className="mt-1 space-y-0.5 border-l border-[#E3E8EE] pl-2.5">
                {d.kategori
                  .filter((s) => s.induk_id === k.id)
                  .map((s) => (
                    <li key={s.id}>
                      <button type="button" className={`text-left text-[12.5px] hover:text-[#1F6FD1] ${s.aktif ? "text-[#4D5B6B]" : "text-[#9AA5B8] line-through"}`} onClick={() => setKat(s)}>
                        <span className="font-mono text-[11.5px]">{s.kode}</span> {s.nama} <span className="text-[11px] text-[#7B8794]">({s.dipakai ?? 0})</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="px-4 pb-3 text-[11.5px] text-[#7B8794]">Kategori yang sudah dipakai tidak bisa dihapus — nonaktifkan saja (hilangkan centang “aktif”).</p>
      </section>

      {/* Regulasi */}
      <section className="overflow-hidden rounded-[10px] border border-[#E3E8EE] bg-white">
        <div className="flex items-center gap-2 border-b border-[#E3E8EE] px-4 py-3">
          <h2 className="mr-auto text-[15px] font-semibold">Master regulasi</h2>
          <button type="button" className={BTN} onClick={() => setReg({ jenis: "PMK", nomor: "", tahun: new Date().getFullYear(), status: "berlaku" })}>
            + Regulasi
          </button>
        </div>
        {reg && (
          <div className="grid gap-2 border-b border-[#E3E8EE] bg-[#F8FAFC] px-4 py-3 sm:grid-cols-6">
            <select value={reg.jenis} onChange={(e) => setReg({ ...reg, jenis: e.target.value })} className={INPUT}>
              {JENIS_REGULASI.map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
            <input value={reg.nomor ?? ""} onChange={(e) => setReg({ ...reg, nomor: e.target.value })} placeholder="Nomor (mis. 113/PMK.05/2012)" className={`${INPUT} sm:col-span-2`} />
            <input type="number" value={reg.tahun ?? ""} onChange={(e) => setReg({ ...reg, tahun: Number(e.target.value) })} placeholder="Tahun" className={INPUT} />
            <select value={reg.status} onChange={(e) => setReg({ ...reg, status: e.target.value })} className={INPUT}>
              <option value="berlaku">berlaku</option>
              <option value="diubah">diubah</option>
              <option value="dicabut">dicabut</option>
            </select>
            <input value={reg.diubah_oleh_teks ?? ""} onChange={(e) => setReg({ ...reg, diubah_oleh_teks: e.target.value })} placeholder="Diubah/dicabut oleh…" className={INPUT} />
            <input value={reg.judul ?? ""} onChange={(e) => setReg({ ...reg, judul: e.target.value })} placeholder="Judul" className={`${INPUT} sm:col-span-4`} />
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" className={BTN} onClick={simpanReg}>
                Simpan
              </button>
              <button type="button" className={BTN_O} onClick={() => setReg(null)}>
                Batal
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Jenis</th>
                <th className={TH}>Nomor</th>
                <th className={TH}>Tahun</th>
                <th className={TH}>Judul</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Dirujuk</th>
              </tr>
            </thead>
            <tbody>
              {d.regulasi.map((r) => (
                <tr key={r.id} onClick={() => setReg(r)} className="cursor-pointer hover:bg-[#F8FAFC]">
                  <td className={TD}>{r.jenis}</td>
                  <td className={`${TD} font-semibold`}>{r.nomor}</td>
                  <td className={TD}>{r.tahun}</td>
                  <td className={`${TD} max-w-[360px] text-[12.5px]`}>{r.judul ?? <span className="text-[#9AA5B8]">(judul belum diisi)</span>}</td>
                  <td className={TD}>
                    <Chip w={r.status === "berlaku" ? "ok" : r.status === "diubah" ? "wait" : "bad"}>
                      {r.status}
                      {r.diubah_oleh_teks ? ` · ${r.diubah_oleh_teks}` : ""}
                    </Chip>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{r.dipakai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11.5px] text-[#7B8794]">Mengubah status menjadi “diubah”/“dicabut” otomatis menandai semua entri yang merujuknya sebagai perlu ditinjau.</p>
      </section>

      {/* Tag */}
      <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
        <h2 className="text-[15px] font-semibold">Tag ({d.tag.length})</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.tag.length === 0 && <span className="text-[12.5px] text-[#7B8794]">Belum ada tag — tag dibuat saat mengisi entri.</span>}
          {d.tag.map((t) => (
            <Link key={t.id} href={`/sigap/pedia?tag=${encodeURIComponent(t.nama)}`} className="rounded-full bg-[#F3F5F8] px-2.5 py-0.5 text-[12px] text-[#4D5B6B] hover:bg-[#E3EEFB]">
              #{t.nama} <span className="text-[#7B8794]">{t.dipakai}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
