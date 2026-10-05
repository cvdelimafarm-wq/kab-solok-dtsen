"use client";

// app/sigap/admin/TabMonitoring.tsx
//
// (5 Okt 2026) Tab 📈 Monitoring -- mockup-sigap-admin layar 2 (permintaan user):
//  - 4 kartu ringkas, matriks harian per petugas (lengkap hijau, sebagian/hari ini kuning, terlewat merah,
//    rencana abu bergaris, kosong = bukan hari kerja), filter kecamatan tujuan / peran / cari nama.
//  - Klik baris -> detail daftar tanggal & status.
//  - Bila boleh_izin: form "Beri izin upload susulan" + tombol cepat per baris yg punya tanggal terlewat.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ambil, aksi, bulanSingkat, hariSingkat, pesanGalat, SesiBerakhir, tglAngka, tglPanjang, tglPendek, waktuWib, type KegiatanRingkas } from "./api";
import { BTN, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TabelKartu, TD, TH } from "./ui";

type Status = "lengkap" | "sebagian" | "terlewat" | "rencana";
type Row = {
  penugasan_id: number;
  nama: string;
  peran: string;
  tujuan: string[];
  hari_kerja: number;
  maks: number | null;
  lengkap: number;
  status: Record<string, Status>;
  terlewat: string[];
  izin: string[];
  dikunci: boolean;
};
type Data = {
  tanggal: string[];
  hari_ini: string;
  ringkas: { petugas: number; pml: number; belum_pilih: number; kerja_hari_ini: number; lengkap_hari_ini: number; terlewat: number };
  rows: Row[];
  boleh_izin: boolean;
};

const BERGARIS = { backgroundImage: "repeating-linear-gradient(135deg, #E3E8F0 0 3px, #F6F8FB 3px 6px)" };
function Sel({ s, izin, t }: { s: Status | undefined; izin: boolean; t: string }) {
  const kelas =
    s === "lengkap"
      ? "bg-emerald-600"
      : s === "sebagian"
        ? "bg-amber-400"
        : s === "terlewat"
          ? `bg-red-400 ${izin ? "ring-2 ring-violet-500 ring-offset-1" : ""}`
          : s === "rencana"
            ? "border border-slate-200"
            : "bg-slate-100";
  const ket = s === "lengkap" ? "lengkap" : s === "sebagian" ? "sebagian / hari ini" : s === "terlewat" ? (izin ? "terlewat · izin susulan diberikan" : "terlewat") : s === "rencana" ? "rencana" : "bukan hari kerja";
  return <span title={`${tglPanjang(t)}: ${ket}`} className={`inline-block h-[18px] w-[18px] rounded-[4px] ${kelas}`} style={s === "rencana" ? BERGARIS : undefined} />;
}

const LABEL_STATUS: Record<Status, { teks: string; w: "ok" | "wait" | "bad" | "mut" }> = {
  lengkap: { teks: "lengkap", w: "ok" },
  sebagian: { teks: "sebagian / hari ini", w: "wait" },
  terlewat: { teks: "terlewat", w: "bad" },
  rencana: { teks: "rencana", w: "mut" },
};

export default function TabMonitoring({ kegiatanId, kegiatan, hariIni }: { kegiatanId: number; kegiatan: KegiatanRingkas | null; hariIni: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [penuh, setPenuh] = useState(false); // false = s.d. hari ini; true = seluruh periode (termasuk rencana)
  const [fKec, setFKec] = useState("");
  const [fPeran, setFPeran] = useState("");
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<number | null>(null);
  // form izin susulan
  const [izPen, setIzPen] = useState<number | "">("");
  const [izTgl, setIzTgl] = useState("");
  const [izSampai, setIzSampai] = useState<"hari_ini" | "besok">("hari_ini");
  const [izAlasan, setIzAlasan] = useState("");
  const [izBusy, setIzBusy] = useState(false);
  const [izPesan, setIzPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const muat = useCallback(async () => {
    try {
      const param: Record<string, string | number | null> = { kegiatan_id: kegiatanId };
      if (penuh && kegiatan?.tanggal_mulai && kegiatan?.tanggal_selesai) {
        param.dari = kegiatan.tanggal_mulai;
        param.sampai = kegiatan.tanggal_selesai;
      }
      const d = await ambil<Data>("monitoring", param);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [kegiatanId, penuh, kegiatan?.tanggal_mulai, kegiatan?.tanggal_selesai]);
  useEffect(() => {
    muat();
  }, [muat]);

  const opsiKec = useMemo(() => Array.from(new Set((data?.rows ?? []).flatMap((r) => r.tujuan))).sort((a, b) => a.localeCompare(b)), [data]);
  const opsiPeran = useMemo(() => Array.from(new Set((data?.rows ?? []).map((r) => r.peran))).sort(), [data]);
  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => (!fKec || r.tujuan.includes(fKec)) && (!fPeran || r.peran === fPeran) && (!q || r.nama.toLowerCase().includes(q)));
  }, [data, fKec, fPeran, cari]);
  const punyaTerlewat = useMemo(() => (data?.rows ?? []).filter((r) => r.terlewat.length > 0), [data]);
  const rowIzin = data?.rows.find((r) => r.penugasan_id === izPen) ?? null;

  function pilihIzin(r: Row, tanggal?: string) {
    setIzPen(r.penugasan_id);
    setIzTgl(tanggal ?? r.terlewat.find((t) => !r.izin.includes(t)) ?? r.terlewat[0] ?? "");
    setIzPesan(null);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  }

  async function beriIzin(e: React.FormEvent) {
    e.preventDefault();
    if (!izPen || !izTgl) return setIzPesan({ jenis: "galat", teks: "Pilih petugas dan tanggal terlewat." });
    if (izAlasan.trim().length < 5) return setIzPesan({ jenis: "galat", teks: "Alasan wajib diisi (minimal 5 karakter)." });
    setIzBusy(true);
    setIzPesan(null);
    try {
      const res = await aksi<{ ok: boolean; berlaku_sampai: string }>("izin_susulan", { penugasan_id: izPen, tanggal: izTgl, sampai: izSampai, alasan: izAlasan.trim() });
      setIzPesan({ jenis: "ok", teks: `Izin susulan ${rowIzin?.nama ?? ""} untuk ${tglPanjang(izTgl)} diberikan, berlaku s.d. ${waktuWib(res.berlaku_sampai)}.` });
      setIzAlasan("");
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setIzPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setIzBusy(false);
    }
  }

  if (galat && !data) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!data) return <Memuat />;
  const rk = data.ringkas;
  const nKol = 6 + (data.boleh_izin ? 1 : 0);

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Petugas aktif" nilai={rk.petugas} ket={`${rk.pml} PML · ${rk.petugas - rk.pml} lainnya`} />
        <KartuAngka label="Sudah pilih hari kerja" nilai={rk.petugas - rk.belum_pilih} ket={`${rk.belum_pilih} belum`} />
        <KartuAngka label="Hari ini lengkap" nilai={`${rk.lengkap_hari_ini} / ${rk.kerja_hari_ini}`} ket="laporan + 5 foto" warna="#047857" />
        <KartuAngka label="Hari terlewat (total)" nilai={rk.terlewat} ket="tidak masuk Kwitansi" warna="#B91C1C" />
      </div>

      <Kartu
        judul="Matriks harian"
        ket={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <Sel s="lengkap" izin={false} t={hariIni} /> lengkap <Sel s="sebagian" izin={false} t={hariIni} /> sebagian/hari ini <Sel s="terlewat" izin={false} t={hariIni} /> terlewat{" "}
            <Sel s="terlewat" izin t={hariIni} /> terlewat + izin <Sel s="rencana" izin={false} t={hariIni} /> rencana <Sel s={undefined} izin={false} t={hariIni} /> bukan hari kerja
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={fKec} onChange={(e) => setFKec(e.target.value)} className={INPUT} aria-label="Filter kecamatan tujuan">
            <option value="">Semua kecamatan</option>
            {opsiKec.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <select value={fPeran} onChange={(e) => setFPeran(e.target.value)} className={INPUT} aria-label="Filter peran">
            <option value="">Semua peran</option>
            {opsiPeran.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama…" className={`${INPUT} min-w-[160px] flex-1 sm:flex-none`} />
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#55627A]">
            <input type="checkbox" checked={penuh} onChange={(e) => setPenuh(e.target.checked)} disabled={!kegiatan?.tanggal_mulai || !kegiatan?.tanggal_selesai} />
            Tampilkan seluruh periode (termasuk rencana)
          </label>
          <span className="text-[11.5px] text-[#6B7890]">
            {rows.length} dari {data.rows.length} petugas
          </span>
        </div>
      </Kartu>

      <TabelKartu>
        <thead>
          <tr>
            <th className={`${TH} sticky left-0 z-10`}>Petugas</th>
            <th className={TH}>Peran</th>
            <th className={TH}>Tujuan ST</th>
            <th className={TH}>
              <div className="flex gap-[3px]">
                {data.tanggal.map((t, i) => (
                  <span key={t} className={`flex w-[18px] flex-col items-center leading-none ${t === data.hari_ini ? "text-[#0F3D7A]" : ""}`} title={tglPanjang(t)}>
                    <span className="text-[8.5px] font-bold text-[#8592A8]">{i === 0 || tglAngka(t) === 1 ? bulanSingkat(t) : hariSingkat(t).slice(0, 2)}</span>
                    <span className={`text-[10.5px] ${t === data.hari_ini ? "rounded bg-[#F5B841] px-0.5 text-[#1E2A47]" : ""}`}>{tglAngka(t)}</span>
                  </span>
                ))}
                {data.tanggal.length === 0 && <span>Tanggal</span>}
              </div>
            </th>
            <th className={TH}>Hari kerja</th>
            <th className={TH}>Lengkap</th>
            {data.boleh_izin && <th className={TH}>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={nKol} className={`${TD} py-8 text-center text-[#6B7890]`}>
                Tidak ada petugas yang cocok dengan filter.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const terbuka = buka === r.penugasan_id;
            const tglIzinBerikut = r.terlewat.find((t) => !r.izin.includes(t));
            return (
              <Fragment key={r.penugasan_id}>
                <tr onClick={() => setBuka(terbuka ? null : r.penugasan_id)} className={`cursor-pointer hover:bg-[#F6F8FB] ${terbuka ? "bg-[#F6F8FB]" : ""}`}>
                  <td className={`${TD} sticky left-0 z-10 bg-white font-bold`}>
                    <span className="mr-1 text-[10px] text-[#8592A8]">{terbuka ? "▾" : "▸"}</span>
                    {r.nama}
                    {r.dikunci && <span className="ml-1" title="SPJ dikunci">🔒</span>}
                  </td>
                  <td className={TD}>{r.peran.toUpperCase()}</td>
                  <td className={`${TD} max-w-[180px] truncate`} title={r.tujuan.join(", ")}>
                    {r.tujuan.join(", ") || "–"}
                  </td>
                  <td className={TD}>
                    <div className="flex gap-[3px]">
                      {data.tanggal.map((t) => (
                        <Sel key={t} t={t} s={r.status[t]} izin={r.izin.includes(t)} />
                      ))}
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {r.hari_kerja === 0 ? <Chip w="wait">belum pilih</Chip> : `${r.hari_kerja} / ${r.maks ?? "–"}`}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {r.lengkap}
                    {r.terlewat.length > 0 && (
                      <span className="ml-1.5">
                        <Chip w="bad">{r.terlewat.length} terlewat</Chip>
                      </span>
                    )}
                  </td>
                  {data.boleh_izin && (
                    <td className={TD} onClick={(e) => e.stopPropagation()}>
                      {tglIzinBerikut ? (
                        <button type="button" className={`${BTN} whitespace-nowrap`} onClick={() => pilihIzin(r, tglIzinBerikut)}>
                          Izin susulan {tglPendek(tglIzinBerikut)}
                        </button>
                      ) : (
                        <button type="button" className={BTN_O} onClick={() => setBuka(terbuka ? null : r.penugasan_id)}>
                          Detail
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {terbuka && <BarisDetail r={r} nKol={nKol} bolehIzin={data.boleh_izin} onIzin={(t) => pilihIzin(r, t)} />}
              </Fragment>
            );
          })}
        </tbody>
      </TabelKartu>

      {data.boleh_izin && (
        <div ref={formRef}>
          <Kartu judul="Beri izin upload susulan" ket="Riwayat izin tercatat: siapa memberi, kapan, alasan.">
            {punyaTerlewat.length === 0 ? (
              <p className="text-[12.5px] text-[#6B7890]">Tidak ada petugas dengan tanggal terlewat. 🎉</p>
            ) : (
              <form onSubmit={beriIzin} className="flex flex-wrap items-center gap-2">
                <select
                  value={izPen}
                  onChange={(e) => {
                    const id = Number(e.target.value) || "";
                    setIzPen(id);
                    const r = punyaTerlewat.find((x) => x.penugasan_id === id);
                    setIzTgl(r ? r.terlewat.find((t) => !r.izin.includes(t)) ?? r.terlewat[0] ?? "" : "");
                  }}
                  className={`${INPUT} min-w-[200px]`}
                  aria-label="Petugas"
                >
                  <option value="">Pilih petugas…</option>
                  {punyaTerlewat.map((r) => (
                    <option key={r.penugasan_id} value={r.penugasan_id}>
                      {r.nama} · {r.peran.toUpperCase()} ({r.terlewat.length} terlewat)
                    </option>
                  ))}
                </select>
                <select value={izTgl} onChange={(e) => setIzTgl(e.target.value)} className={`${INPUT} min-w-[220px]`} disabled={!rowIzin} aria-label="Tanggal terlewat">
                  {!rowIzin && <option value="">Pilih tanggal…</option>}
                  {rowIzin?.terlewat.map((t) => (
                    <option key={t} value={t}>
                      {tglPanjang(t)} {rowIzin.izin.includes(t) ? "(izin sudah pernah diberi)" : "(terlewat)"}
                    </option>
                  ))}
                </select>
                <select value={izSampai} onChange={(e) => setIzSampai(e.target.value as "hari_ini" | "besok")} className={INPUT} aria-label="Berlaku sampai">
                  <option value="hari_ini">Berlaku s.d. hari ini 23:59 WIB</option>
                  <option value="besok">Berlaku s.d. besok 23:59 WIB</option>
                </select>
                <input value={izAlasan} onChange={(e) => setIzAlasan(e.target.value)} placeholder="Alasan (wajib)" className={`${INPUT} min-w-[180px] flex-1`} maxLength={300} />
                <button type="submit" className={BTN} disabled={izBusy || !izPen || !izTgl || izAlasan.trim().length < 5}>
                  {izBusy ? "Menyimpan…" : "Beri izin"}
                </button>
              </form>
            )}
            {izPesan && (
              <div className="mt-2">
                <Pesan jenis={izPesan.jenis} onTutup={() => setIzPesan(null)}>
                  {izPesan.teks}
                </Pesan>
              </div>
            )}
          </Kartu>
        </div>
      )}
    </div>
  );
}

function BarisDetail({ r, nKol, bolehIzin, onIzin }: { r: Row; nKol: number; bolehIzin: boolean; onIzin: (t: string) => void }) {
  const tgl = Object.keys(r.status).sort();
  return (
    <tr>
      <td colSpan={nKol} className="border-t border-[#EEF1F5] bg-[#F6F8FB] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <b>{r.nama}</b>
          <span className="text-[#6B7890]">
            · {r.peran.toUpperCase()} · tujuan {r.tujuan.join(", ") || "–"} · {r.hari_kerja} hari kerja{r.maks ? ` (maks ${r.maks})` : " (tanpa batas)"}
          </span>
        </div>
        {tgl.length === 0 ? (
          <p className="mt-2 text-[12px] text-[#6B7890]">Petugas belum memilih hari kerja.</p>
        ) : (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tgl.map((t) => {
              const s = r.status[t];
              const izin = r.izin.includes(t);
              return (
                <div key={t} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] shadow-sm">
                  <span className="flex-1">{tglPanjang(t)}</span>
                  <Chip w={LABEL_STATUS[s]?.w ?? "mut"}>{LABEL_STATUS[s]?.teks ?? s}</Chip>
                  {izin && <Chip w="vio">izin</Chip>}
                  {bolehIzin && s === "terlewat" && !izin && (
                    <button type="button" onClick={() => onIzin(t)} className="text-[11px] font-bold text-[#0F3D7A] underline">
                      beri izin
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}
