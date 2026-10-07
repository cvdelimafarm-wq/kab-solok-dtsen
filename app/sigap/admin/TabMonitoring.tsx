"use client";

// app/sigap/admin/TabMonitoring.tsx
//
// (5 Okt 2026) Tab 📈 Monitoring -- mockup-sigap-admin layar 2 (permintaan user):
//  - 4 kartu ringkas, matriks harian per petugas (lengkap hijau, sebagian/hari ini kuning, terlewat merah,
//    rencana abu bergaris, kosong = bukan hari kerja), filter kecamatan tujuan / peran / cari nama.
//  - Klik baris -> detail daftar tanggal & status.
//  - Bila boleh_izin: form "Beri izin upload susulan" + tombol cepat per baris yg punya tanggal terlewat.
// (6 Okt 2026) Permintaan user: "untuk monitoring bisa dibuat dalam bentuk tabel, kemudian untuk monitoring
//  umumnya bisa dibuat grafik di atas":
//  - Filter dipindah ke satu baris di atas grafik & tabel (keduanya mengikuti filter).
//  - Grafik ringkasan (./GrafikMonitoring): tren harian bertumpuk + kepatuhan per kecamatan tujuan ST.
//  - Tampilan utama = tabel per petugas (kolom bisa diurutkan); matriks harian lama tetap tersedia lewat
//    toggle "Tabel | Matriks harian" (default Tabel, pilihan diingat per browser).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ambil, aksi, bulanSingkat, hariSingkat, pesanGalat, SesiBerakhir, tglAngka, tglPanjang, tglPendek, waktuWib, type KegiatanRingkas } from "./api";
import { BTN, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TabelKartu, TD, TH } from "./ui";
import GrafikMonitoring from "./GrafikMonitoring";

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
  no_hp?: string | null;
};
type Data = {
  tanggal: string[];
  hari_ini: string;
  ringkas: { petugas: number; pml: number; belum_pilih: number; kerja_hari_ini: number; lengkap_hari_ini: number; terlewat: number };
  rows: Row[];
  boleh_izin: boolean;
};

const BERGARIS = { backgroundImage: "repeating-linear-gradient(135deg, #E3E8EE 0 3px, #F8FAFC 3px 6px)" };
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
  const ket =
    s === "lengkap"
      ? "lengkap"
      : s === "sebagian"
        ? "sebagian / hari ini"
        : s === "terlewat"
          ? izin
            ? "terlewat · izin susulan diberikan"
            : "terlewat"
          : s === "rencana"
            ? "rencana"
            : "bukan hari kerja";
  return <span title={`${tglPanjang(t)}: ${ket}`} className={`inline-block h-[18px] w-[18px] rounded-[4px] ${kelas}`} style={s === "rencana" ? BERGARIS : undefined} />;
}

// (6 Okt 2026) Pengingat petugas -- desain user (tombol "Ingatkan"). Keputusan user: TIDAK dikirim otomatis;
// tombol membuka WhatsApp dgn pesan siap kirim (admin menekan kirim sendiri), atau menyalin pesan bila
// nomor HP tidak ada di master.
function perluDiingatkan(r: Row, hariIni: string): boolean {
  if (r.dikunci) return false;
  return r.hari_kerja === 0 || r.status[hariIni] === "sebagian" || r.terlewat.some((t) => !r.izin.includes(t));
}
function pesanPengingat(r: Row, hariIni: string, namaKegiatan: string): string {
  const poin: string[] = [];
  if (r.hari_kerja === 0) poin.push("- Hari kerja belum dipilih. Mohon pilih hari kerja di SIGAP.");
  if (r.status[hariIni] === "sebagian") poin.push(`- Isian & dokumentasi hari ini (${tglPanjang(hariIni)}) belum lengkap. Mohon dilengkapi sebelum pukul 23.59 WIB.`);
  const lewat = r.terlewat.filter((t) => !r.izin.includes(t));
  if (lewat.length) poin.push(`- ${lewat.length} hari kerja terlewat (${lewat.map((t) => tglPendek(t)).join(", ")}). Hari yang tidak lengkap tidak dibayarkan; hubungi admin bila ada kendala.`);
  const asal = typeof window !== "undefined" ? window.location.origin : "";
  return `Yth. ${r.nama},\n\nPengingat SIGAP (transport lokal ${namaKegiatan}):\n${poin.join("\n")}\n\nMasuk: ${asal}/sigap/masuk\n\nTerima kasih.\n— Admin Anggaran BPS Kabupaten Solok`;
}
function nomorWa(hp: string): string {
  let d = hp.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

const LABEL_STATUS: Record<Status, { teks: string; w: "ok" | "wait" | "bad" | "mut" }> = {
  lengkap: { teks: "lengkap", w: "ok" },
  sebagian: { teks: "sebagian / hari ini", w: "wait" },
  terlewat: { teks: "terlewat", w: "bad" },
  rencana: { teks: "rencana", w: "mut" },
};

// (6 Okt 2026) Kolom tabel monitoring yang bisa diurutkan -- permintaan user.
type Kolom = "nama" | "peran" | "tujuan" | "hari" | "lengkap" | "sebagian" | "terlewat" | "persen" | "hari_ini" | "izin";
type Metrik = { sebagian: number; dasar: number; persen: number | null; hariIni: Status | undefined };
const URUT_HARI_INI: Record<string, number> = { terlewat: 0, sebagian: 1, rencana: 2, lengkap: 3, "": 4 };
const KUNCI_TAMPILAN = "sigap_admin_monitoring_tampilan";

/** % kepatuhan = hari lengkap / hari kerja yang sudah lewat atau hari ini (status selain "rencana"). */
function metrik(r: Row, hariIni: string): Metrik {
  let sebagian = 0,
    dasar = 0;
  for (const v of Object.values(r.status)) {
    if (v === "sebagian") sebagian++;
    if (v !== "rencana") dasar++;
  }
  return { sebagian, dasar, persen: dasar ? r.lengkap / dasar : null, hariIni: r.status[hariIni] };
}

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
  const [toast, setToast] = useState<string | null>(null);
  const [diingatkan, setDiingatkan] = useState<Set<number>>(new Set());
  // (6 Okt 2026) tampilan tabel/matriks + urutan kolom
  const [tampilan, setTampilan] = useState<"tabel" | "matriks">("tabel");
  const [urut, setUrut] = useState<{ kol: Kolom; naik: boolean }>({ kol: "nama", naik: true });
  useEffect(() => {
    try {
      if (localStorage.getItem(KUNCI_TAMPILAN) === "matriks") setTampilan("matriks");
    } catch {
      /* abaikan */
    }
  }, []);
  function gantiTampilan(t: "tabel" | "matriks") {
    setTampilan(t);
    try {
      localStorage.setItem(KUNCI_TAMPILAN, t);
    } catch {
      /* abaikan */
    }
  }

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
  const metrikRow = useMemo(() => new Map((data?.rows ?? []).map((r) => [r.penugasan_id, metrik(r, data?.hari_ini ?? hariIni)])), [data, hariIni]);
  const rowsUrut = useMemo(() => {
    const kali = urut.naik ? 1 : -1;
    const nilai = (r: Row): number | string => {
      const mt = metrikRow.get(r.penugasan_id)!;
      switch (urut.kol) {
        case "nama":
          return r.nama.toLowerCase();
        case "peran":
          return r.peran;
        case "tujuan":
          return (r.tujuan[0] ?? "~").toLowerCase();
        case "hari":
          return r.hari_kerja;
        case "lengkap":
          return r.lengkap;
        case "sebagian":
          return mt.sebagian;
        case "terlewat":
          return r.terlewat.length;
        case "persen":
          return mt.persen ?? -1;
        case "hari_ini":
          return URUT_HARI_INI[mt.hariIni ?? ""];
        case "izin":
          return r.izin.length;
      }
    };
    return [...rows].sort((a, b) => {
      const x = nilai(a),
        y = nilai(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c * kali || a.nama.localeCompare(b.nama);
    });
  }, [rows, urut, metrikRow]);
  function klikUrut(kol: Kolom) {
    // kolom angka dimulai dari terbesar; teks dari A-Z
    setUrut((u) => (u.kol === kol ? { kol, naik: !u.naik } : { kol, naik: kol === "nama" || kol === "peran" || kol === "tujuan" || kol === "hari_ini" }));
  }
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

  // (6 Okt 2026) "Ingatkan": buka WhatsApp dgn pesan siap kirim, atau salin pesan bila tak ada nomor HP.
  async function ingatkan(r: Row) {
    if (!data) return;
    const teks = pesanPengingat(r, data.hari_ini, kegiatan?.nama ?? "");
    if (r.no_hp) {
      window.open(`https://wa.me/${nomorWa(r.no_hp)}?text=${encodeURIComponent(teks)}`, "_blank", "noopener");
      setToast(`WhatsApp dibuka untuk ${r.nama} — periksa lalu tekan kirim.`);
    } else {
      try {
        await navigator.clipboard.writeText(teks);
        setToast(`Nomor HP ${r.nama} tidak ada di master. Pesan disalin — tempel di WhatsApp/grup.`);
      } catch {
        setToast(`Nomor HP ${r.nama} tidak ada di master dan pesan tidak bisa disalin otomatis.`);
      }
    }
    setDiingatkan((x) => new Set(x).add(r.penugasan_id));
    setTimeout(() => setToast(null), 4000);
  }
  async function salinSemua(daftar: Row[]) {
    if (!data || !daftar.length) return;
    const teks = daftar.map((r) => pesanPengingat(r, data.hari_ini, kegiatan?.nama ?? "")).join("\n\n────────\n\n");
    try {
      await navigator.clipboard.writeText(teks);
      setToast(`Pesan pengingat untuk ${daftar.length} petugas disalin.`);
    } catch {
      setToast("Pesan tidak bisa disalin otomatis di browser ini.");
    }
    setTimeout(() => setToast(null), 4000);
  }

  if (galat && !data) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!data) return <Memuat />;
  const rk = data.ringkas;
  const perluIngat = rows.filter((r) => perluDiingatkan(r, data.hari_ini));
  const nKolMatriks = 6 + (data.boleh_izin ? 1 : 0);
  const nKolTabel = 11;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#14202E] px-4 py-2.5 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
      {perluIngat.length > 0 && (
        <Pesan jenis="galat">
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              <b>{perluIngat.length} petugas perlu diingatkan</b> (belum pilih hari kerja, laporan hari ini belum lengkap, atau ada hari terlewat).
            </span>
            <button type="button" className={BTN_O} onClick={() => salinSemua(perluIngat)}>
              Salin pesan pengingat
            </button>
          </span>
        </Pesan>
      )}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Petugas aktif" nilai={rk.petugas} ket={`${rk.pml} PML · ${rk.petugas - rk.pml} lainnya`} />
        <KartuAngka label="Sudah pilih hari kerja" nilai={rk.petugas - rk.belum_pilih} ket={`${rk.belum_pilih} belum`} />
        <KartuAngka label="Hari ini lengkap" nilai={`${rk.lengkap_hari_ini} / ${rk.kerja_hari_ini}`} ket="isian + foto sesuai aturan kegiatan" warna="#047857" />
        <KartuAngka label="Hari terlewat (total)" nilai={rk.terlewat} ket="tidak masuk Kwitansi" warna="#B91C1C" />
      </div>

      {/* (6 Okt 2026) Filter satu baris di atas grafik & tabel -- keduanya mengikuti filter. */}
      <Kartu className="!py-3">
        <div className="flex flex-wrap items-center gap-2">
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
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#4D5B6B]">
            <input type="checkbox" checked={penuh} onChange={(e) => setPenuh(e.target.checked)} disabled={!kegiatan?.tanggal_mulai || !kegiatan?.tanggal_selesai} />
            Seluruh periode (termasuk rencana)
          </label>
          <div className="flex-1" />
          <span className="text-[11.5px] text-[#7B8794]">
            {rows.length} dari {data.rows.length} petugas
          </span>
        </div>
      </Kartu>

      <GrafikMonitoring tanggal={data.tanggal} hariIni={data.hari_ini} rows={rows} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <h3 className="text-[14px] font-extrabold">{tampilan === "tabel" ? "Tabel monitoring petugas" : "Matriks harian"}</h3>
        {tampilan === "matriks" && (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] font-semibold text-[#7B8794]">
            <Sel s="lengkap" izin={false} t={hariIni} /> lengkap <Sel s="sebagian" izin={false} t={hariIni} /> sebagian/hari ini <Sel s="terlewat" izin={false} t={hariIni} /> terlewat{" "}
            <Sel s="terlewat" izin t={hariIni} /> terlewat + izin <Sel s="rencana" izin={false} t={hariIni} /> rencana <Sel s={undefined} izin={false} t={hariIni} /> bukan hari kerja
          </span>
        )}
        {tampilan === "tabel" && <span className="text-[11.5px] text-[#7B8794]">klik judul kolom untuk mengurutkan · klik baris untuk detail</span>}
        <div className="flex-1" />
        <div role="tablist" aria-label="Pilih tampilan" className="inline-flex rounded-lg border border-[#D5DCE7] bg-white p-0.5 text-[12px] font-bold">
          {(["tabel", "matriks"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tampilan === t}
              onClick={() => gantiTampilan(t)}
              className={`rounded-md px-3 py-1 transition ${tampilan === t ? "bg-[#1F6FD1] text-white" : "text-[#4D5B6B] hover:text-[#1F6FD1]"}`}
            >
              {t === "tabel" ? "Tabel" : "Matriks harian"}
            </button>
          ))}
        </div>
      </div>

      {tampilan === "tabel" ? (
        <TabelKartu>
          <thead>
            <tr>
              <ThUrut urut={urut} onUrut={klikUrut} kol="nama">
                Petugas
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="peran">
                Peran
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="tujuan">
                Tujuan
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="hari" kanan title="Hari kerja dipilih / maksimum">
                Hari kerja
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="lengkap" kanan>
                Lengkap
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="sebagian" kanan title="Hari ini, laporan/foto belum lengkap">
                Sebagian
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="terlewat" kanan>
                Terlewat
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="persen" kanan title="Hari lengkap dari hari kerja yang sudah lewat / hari ini">
                % patuh
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="hari_ini">
                Hari ini
              </ThUrut>
              <ThUrut urut={urut} onUrut={klikUrut} kol="izin" kanan title="Izin upload susulan yang masih berlaku">
                Izin
              </ThUrut>
              <th className={TH}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rowsUrut.length === 0 && (
              <tr>
                <td colSpan={nKolTabel} className={`${TD} py-8 text-center text-[#7B8794]`}>
                  Tidak ada petugas yang cocok dengan filter.
                </td>
              </tr>
            )}
            {rowsUrut.map((r) => {
              const terbuka = buka === r.penugasan_id;
              const tglIzinBerikut = r.terlewat.find((t) => !r.izin.includes(t));
              const mt = metrikRow.get(r.penugasan_id)!;
              const pct = mt.persen == null ? null : Math.round(mt.persen * 100);
              return (
                <Fragment key={r.penugasan_id}>
                  <tr onClick={() => setBuka(terbuka ? null : r.penugasan_id)} className={`cursor-pointer hover:bg-[#F8FAFC] ${terbuka ? "bg-[#F8FAFC]" : ""}`}>
                    <td className={`${TD} whitespace-nowrap font-bold`}>
                      <span className="mr-1 text-[10px] text-[#7B8794]">{terbuka ? "▾" : "▸"}</span>
                      {r.nama}
                      {r.dikunci && (
                        <span className="ml-1" title="SPJ dikunci">
                          🔒
                        </span>
                      )}
                    </td>
                    <td className={TD}>{r.peran.toUpperCase()}</td>
                    <td className={`${TD} max-w-[150px] truncate`} title={r.tujuan.join(", ")}>
                      {r.tujuan.join(", ") || "–"}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>
                      {r.hari_kerja === 0 ? (
                        <Chip w="wait">belum pilih</Chip>
                      ) : r.maks ? (
                        `${r.hari_kerja} / ${r.maks}`
                      ) : (
                        <>
                          {r.hari_kerja} <span className="text-[11px] text-[#7B8794]">/ tanpa batas</span>
                        </>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{r.lengkap}</td>
                    <td className={`${TD} text-right tabular-nums`}>{mt.sebagian || <span className="text-[#CDD5DE]">0</span>}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {r.terlewat.length ? <span className="font-bold text-red-700">{r.terlewat.length}</span> : <span className="text-[#CDD5DE]">0</span>}
                    </td>
                    <td className={`${TD} text-right`}>
                      {pct == null ? (
                        <span className="text-[#CDD5DE]">–</span>
                      ) : (
                        <span className="inline-flex items-center justify-end gap-1.5" title={`${r.lengkap} dari ${mt.dasar} hari kerja s.d. hari ini lengkap`}>
                          <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-[#F3F5F8] sm:inline-block" aria-hidden>
                            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? "#059669" : pct >= 50 ? "#FBBF24" : "#EF4444" }} />
                          </span>
                          <b className="tabular-nums">{pct}%</b>
                        </span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {mt.hariIni ? (
                        <Chip w={LABEL_STATUS[mt.hariIni].w}>{mt.hariIni === "sebagian" ? "belum lengkap" : LABEL_STATUS[mt.hariIni].teks}</Chip>
                      ) : (
                        <span className="text-[11.5px] text-[#7B8794]">bukan hari kerja</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>{r.izin.length ? <Chip w="vio">{r.izin.length} aktif</Chip> : <span className="text-[#CDD5DE]">–</span>}</td>
                    <td className={`${TD} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {perluDiingatkan(r, data.hari_ini) && (
                          <button
                            type="button"
                            onClick={() => ingatkan(r)}
                            className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-[7px] border px-2.5 text-[12px] ${diingatkan.has(r.penugasan_id) ? "border-[#DFF2EC] text-[#12816A]" : "border-[#CDD5DE] bg-white hover:bg-[#F8FAFC]"}`}
                            title={r.no_hp ? `Buka WhatsApp ke ${r.no_hp} dengan pesan siap kirim` : "Nomor HP tidak ada — pesan akan disalin"}
                          >
                            {diingatkan.has(r.penugasan_id) ? "✓ Diingatkan" : r.no_hp ? "Ingatkan" : "Salin pesan"}
                          </button>
                        )}
                        {/* izin susulan cepat bila ada tanggal terlewat; selain itu tombol Detail (baris juga bisa diklik) */}
                        {data.boleh_izin && tglIzinBerikut ? (
                          <button
                            type="button"
                            className={`${BTN} whitespace-nowrap !px-2 !py-1 !text-[11.5px]`}
                            onClick={() => pilihIzin(r, tglIzinBerikut)}
                            title={`Beri izin susulan untuk ${tglPanjang(tglIzinBerikut)}`}
                          >
                            Izin {tglPendek(tglIzinBerikut)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="px-1 text-[11.5px] font-bold text-[#1F6FD1] hover:underline"
                            onClick={() => setBuka(terbuka ? null : r.penugasan_id)}
                            aria-expanded={terbuka}
                          >
                            {terbuka ? "Tutup" : "Detail"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {terbuka && <BarisDetail r={r} nKol={nKolTabel} bolehIzin={data.boleh_izin} onIzin={(t) => pilihIzin(r, t)} />}
                </Fragment>
              );
            })}
          </tbody>
        </TabelKartu>
      ) : (
        <TabelKartu>
          <thead>
            <tr>
              <th className={`${TH} sticky left-0 z-10`}>Petugas</th>
              <th className={TH}>Peran</th>
              <th className={TH}>Tujuan ST</th>
              <th className={TH}>
                <div className="flex gap-[3px]">
                  {data.tanggal.map((t, i) => (
                    <span key={t} className={`flex w-[18px] flex-col items-center leading-none ${t === data.hari_ini ? "text-[#1F6FD1]" : ""}`} title={tglPanjang(t)}>
                      <span className="text-[8.5px] font-bold text-[#7B8794]">{i === 0 || tglAngka(t) === 1 ? bulanSingkat(t) : hariSingkat(t).slice(0, 2)}</span>
                      <span className={`text-[10.5px] ${t === data.hari_ini ? "rounded bg-[#D9971F] px-0.5 text-[#0E2A47]" : ""}`}>{tglAngka(t)}</span>
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
                <td colSpan={nKolMatriks} className={`${TD} py-8 text-center text-[#7B8794]`}>
                  Tidak ada petugas yang cocok dengan filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const terbuka = buka === r.penugasan_id;
              const tglIzinBerikut = r.terlewat.find((t) => !r.izin.includes(t));
              return (
                <Fragment key={r.penugasan_id}>
                  <tr onClick={() => setBuka(terbuka ? null : r.penugasan_id)} className={`cursor-pointer hover:bg-[#F8FAFC] ${terbuka ? "bg-[#F8FAFC]" : ""}`}>
                    <td className={`${TD} sticky left-0 z-10 bg-white font-bold`}>
                      <span className="mr-1 text-[10px] text-[#7B8794]">{terbuka ? "▾" : "▸"}</span>
                      {r.nama}
                      {r.dikunci && (
                        <span className="ml-1" title="SPJ dikunci">
                          🔒
                        </span>
                      )}
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
                    <td className={`${TD} whitespace-nowrap`}>{r.hari_kerja === 0 ? <Chip w="wait">belum pilih</Chip> : `${r.hari_kerja} / ${r.maks ?? "–"}`}</td>
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
                  {terbuka && <BarisDetail r={r} nKol={nKolMatriks} bolehIzin={data.boleh_izin} onIzin={(t) => pilihIzin(r, t)} />}
                </Fragment>
              );
            })}
          </tbody>
        </TabelKartu>
      )}

      {data.boleh_izin && (
        <div ref={formRef}>
          <Kartu judul="Beri izin upload susulan" ket="Riwayat izin tercatat: siapa memberi, kapan, alasan.">
            {punyaTerlewat.length === 0 ? (
              <p className="text-[12.5px] text-[#7B8794]">Tidak ada petugas dengan tanggal terlewat. 🎉</p>
            ) : (
              <form onSubmit={beriIzin} className="flex flex-wrap items-center gap-2">
                <select
                  value={izPen}
                  onChange={(e) => {
                    const id = Number(e.target.value) || "";
                    setIzPen(id);
                    const r = punyaTerlewat.find((x) => x.penugasan_id === id);
                    setIzTgl(r ? (r.terlewat.find((t) => !r.izin.includes(t)) ?? r.terlewat[0] ?? "") : "");
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

function ThUrut({
  kol,
  children,
  kanan = false,
  title,
  urut,
  onUrut,
}: {
  kol: Kolom;
  children: React.ReactNode;
  kanan?: boolean;
  title?: string;
  urut: { kol: Kolom; naik: boolean };
  onUrut: (k: Kolom) => void;
}) {
  const aktif = urut.kol === kol;
  return (
    <th className={`${TH} ${kanan ? "text-right" : ""}`} aria-sort={aktif ? (urut.naik ? "ascending" : "descending") : "none"} title={title}>
      <button type="button" onClick={() => onUrut(kol)} className={`inline-flex items-center gap-1 hover:text-[#1F6FD1] ${aktif ? "text-[#1F6FD1]" : ""}`}>
        {children}
        <span aria-hidden className={`text-[9px] ${aktif ? "" : "opacity-30"}`}>
          {aktif ? (urut.naik ? "▲" : "▼") : "▲▼"}
        </span>
      </button>
    </th>
  );
}

function BarisDetail({ r, nKol, bolehIzin, onIzin }: { r: Row; nKol: number; bolehIzin: boolean; onIzin: (t: string) => void }) {
  const tgl = Object.keys(r.status).sort();
  return (
    <tr>
      <td colSpan={nKol} className="border-t border-[#EDF0F4] bg-[#F8FAFC] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <b>{r.nama}</b>
          <span className="text-[#7B8794]">
            · {r.peran.toUpperCase()} · tujuan {r.tujuan.join(", ") || "–"} · {r.hari_kerja} hari kerja{r.maks ? ` (maks ${r.maks})` : " (tanpa batas)"}
          </span>
        </div>
        {tgl.length === 0 ? (
          <p className="mt-2 text-[12px] text-[#7B8794]">Petugas belum memilih hari kerja.</p>
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
                    <button type="button" onClick={() => onIzin(t)} className="text-[11px] font-bold text-[#1F6FD1] underline">
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
