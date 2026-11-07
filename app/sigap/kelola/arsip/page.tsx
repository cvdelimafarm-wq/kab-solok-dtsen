"use client";

// app/sigap/kelola/arsip/page.tsx
//
// (7 Nov 2026) Menu Arsip: penomoran surat. Dasar: Peraturan BPS 1/2023 Pasal 63-65 (lihat lib/arsip/nomor.ts).
//   Buku nomor  : semua nomor yang pernah diambil/dicatat, nomor terlewat, urutan kembar pada data lama, pembatalan (nomor tidak dipakai ulang).
//   Ambil nomor : mengambil nomor untuk surat yang dibuat di luar SIGAP, dan mencatat nomor yang sudah terbit di luar SIGAP.
//   Pengaturan  : kode unit, nomor terakhir per register, pola nomor per jenis dokumen, kode klasifikasi arsip, kode arsip per kegiatan.
// Nomor ST translok dan dokumen lanjutan identifikasi diambil langsung dari halaman masing-masing (lihat /api/sigap/arsip/ambil).

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu, type ItemTab } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import { ringkasRentang } from "@/lib/arsip/nomor";
import { aksiA, ambilA, hariIniWib, NAMA_SUMBER, type BarisNomor, type DataBuku, type DataPengaturan, type DataRingkas } from "./api";
import Ambil from "./Ambil";
import Pengaturan from "./Pengaturan";

type Tab = "buku" | "ambil" | "pengaturan";
const TAB: ItemTab<Tab>[] = [
  { kode: "buku", label: "Buku nomor" },
  { kode: "ambil", label: "Ambil / catat nomor" },
  { kode: "pengaturan", label: "Pengaturan" },
];

export default function HalamanArsip() {
  const [tab, setTab] = useState<Tab>("buku");
  const [kelola, setKelola] = useState(false);
  const [tahun, setTahun] = useState(Number(hariIniWib().slice(0, 4)));
  const [peng, setPeng] = useState<DataPengaturan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [versi, setVersi] = useState(0); // naik bila ada nomor baru / perubahan, memuat ulang buku dan ringkasan

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TAB.some((x) => x.kode === t)) setTab(t);
  }, []);

  const muatPengaturan = useCallback(async () => {
    try {
      setPeng(await ambilA<DataPengaturan>({ bagian: "pengaturan" }));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => { void muatPengaturan(); }, [muatPengaturan]);

  const berubah = useCallback(() => { setVersi((v) => v + 1); void muatPengaturan(); }, [muatPengaturan]);

  return (
    <Bingkai
      aktif="arsip"
      kecil="SIGAP · Arsip"
      jejak={["SIGAP", "Pengelolaan", "Arsip & penomoran"]}
      judul="Arsip & penomoran surat"
      sub="Nomor surat diambil dari sistem menurut Peraturan BPS 1/2023 (Pasal 63-65): tidak bentrok, tidak dipakai ulang, tercatat di buku."
      tab={TAB}
      aktifTab={tab}
      onTab={(t) => {
        setTab(t);
        const u = new URL(window.location.href);
        u.searchParams.set("tab", t);
        window.history.replaceState(null, "", u.toString());
      }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
        {tab === "buku" && <Buku tahun={tahun} setTahun={setTahun} peng={peng} versi={versi} onKelola={setKelola} kelola={kelola} onUbah={berubah} />}
        {tab === "ambil" && (peng ? <Ambil peng={peng} onUbah={berubah} /> : <Memuat />)}
        {tab === "pengaturan" && (peng ? <Pengaturan peng={peng} tahun={tahun} onUbah={berubah} /> : <Memuat />)}
      </div>
    </Bingkai>
  );
}

// ======================================================================== Buku nomor
function Buku({ tahun, setTahun, peng, versi, kelola, onKelola, onUbah }: { tahun: number; setTahun: (t: number) => void; peng: DataPengaturan | null; versi: number; kelola: boolean; onKelola: (b: boolean) => void; onUbah: () => void }) {
  const [buku, setBuku] = useState<DataBuku | null>(null);
  const [ringkas, setRingkas] = useState<DataRingkas | null>(null);
  const [f, setF] = useState({ jenis: "", status: "", sumber: "", cari: "" });
  const [galat, setGalat] = useState<string | null>(null);
  const [batal, setBatal] = useState<{ id: number; alasan: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([
        ambilA<DataBuku>({ bagian: "buku", tahun, jenis: f.jenis, status: f.status, sumber: f.sumber, cari: f.cari }),
        ambilA<DataRingkas>({ bagian: "ringkas", tahun }),
      ]);
      setBuku(b);
      setRingkas(r);
      onKelola(b.boleh_kelola);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun, f.jenis, f.status, f.sumber, f.cari]);
  useEffect(() => {
    const t = setTimeout(() => void muat(), f.cari ? 300 : 0);
    return () => clearTimeout(t);
  }, [muat, versi, f.cari]);

  const namaJenis = useMemo(() => new Map((peng?.jenis ?? []).map((j) => [j.kode, j.nama])), [peng]);
  const namaReg = useMemo(() => new Map((peng?.register ?? []).map((r) => [r.kode, r.nama])), [peng]);
  const namaKeg = useMemo(() => new Map((peng?.kegiatan_semua ?? []).map((k) => [k.id, k.nama])), [peng]);
  const tahunPilihan = useMemo(() => Array.from(new Set([Number(hariIniWib().slice(0, 4)), tahun, ...(ringkas?.tahun_ada ?? [])])).sort((a, b) => b - a), [ringkas, tahun]);

  async function batalkan() {
    if (!batal) return;
    setSibuk(true);
    try {
      await aksiA("batalkan", { id: batal.id, alasan: batal.alasan });
      setBatal(null);
      onUbah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  const catat = ringkas?.counter.filter((c) => c.tahun === tahun) ?? [];
  return (
    <>
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {catat.length === 0 && ringkas && <KartuAngka label={`Tahun ${tahun}`} nilai="0" ket="Belum ada nomor tercatat" />}
        {catat.map((c) => {
          const celah = ringkas?.celah.find((x) => x.register === c.register);
          return (
            <KartuAngka key={c.register} label={namaReg.get(c.register) ?? c.register} nilai={c.terakhir} ket={celah && celah.total > 0 ? `${celah.total} nomor tidak tercatat` : "tanpa celah"} warna={celah && celah.total > 0 ? "#8A6200" : undefined} />
          );
        })}
      </div>

      {ringkas && ringkas.kembar.length > 0 && (
        <Pesan jenis="peringatan">
          Urutan kembar pada data lama (dipakai lebih dari sekali): {ringkas.kembar.map((k) => `${k.urut} → ${k.nomor.join(" dan ")}`).join("; ")}. Data lama tidak diubah; nomor baru dari sistem tidak akan mengulang.
        </Pesan>
      )}
      {ringkas && ringkas.celah.filter((c) => c.total > 0).map((c) => (
        <Pesan key={c.register} jenis="info">
          {namaReg.get(c.register) ?? c.register}: nomor {ringkasRentang(c.urut)}{c.total > c.urut.length ? ", dan seterusnya" : ""} belum tercatat di buku ({c.total} nomor). Bila surat dengan nomor itu memang terbit di luar SIGAP, catat lewat tab Ambil / catat nomor.
        </Pesan>
      ))}

      <Kartu judul="Buku nomor" ket="Nomor yang dibatalkan tetap tercatat dan tidak dipakai ulang.">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <select aria-label="Tahun" className={INPUT} value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>{tahunPilihan.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select aria-label="Jenis dokumen" className={INPUT} value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}><option value="">Semua jenis</option>{(peng?.jenis ?? []).map((j) => <option key={j.kode} value={j.kode}>{j.nama}</option>)}</select>
          <select aria-label="Status" className={INPUT} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Semua status</option><option value="terpakai">Terpakai</option><option value="batal">Dibatalkan</option></select>
          <select aria-label="Sumber" className={INPUT} value={f.sumber} onChange={(e) => setF({ ...f, sumber: e.target.value })}><option value="">Semua sumber</option>{Object.entries(NAMA_SUMBER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input aria-label="Cari nomor atau perihal" className={`${INPUT} min-w-[200px] flex-1`} placeholder="Cari nomor atau perihal" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} />
        </div>
        {!buku ? <Memuat /> : buku.baris.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada nomor untuk filter ini.</p> : (
          <TabelKartu>
            <thead><tr><th className={TH}>Nomor</th><th className={TH}>Jenis</th><th className={TH}>Tanggal</th><th className={TH}>Perihal</th><th className={TH}>Sumber</th><th className={TH}>Status</th><th className={TH}>Oleh</th>{kelola && <th className={TH} />}</tr></thead>
            <tbody>
              {buku.baris.map((b: BarisNomor) => (
                <tr key={b.id} className={b.status === "batal" ? "opacity-60" : undefined}>
                  <td className={`${TD} whitespace-nowrap font-semibold ${b.status === "batal" ? "line-through" : ""}`}>{b.nomor}</td>
                  <td className={TD}>{namaJenis.get(b.jenis) ?? b.jenis}</td>
                  <td className={`${TD} whitespace-nowrap`}>{b.tanggal}</td>
                  <td className={`${TD} max-w-[320px]`}>{b.perihal ?? "–"}{b.kegiatan_id ? <span className="block text-[11.5px] text-[#5B6B84]">{namaKeg.get(b.kegiatan_id) ?? `Kegiatan ${b.kegiatan_id}`}</span> : null}</td>
                  <td className={TD}><Chip w={b.sumber === "sistem" ? "navy" : b.sumber === "luar" ? "vio" : "mut"}>{NAMA_SUMBER[b.sumber] ?? b.sumber}</Chip></td>
                  <td className={TD}>{b.status === "batal" ? <Chip w="bad" title={b.alasan_batal ?? undefined}>Dibatalkan</Chip> : <Chip w="ok">Terpakai</Chip>}</td>
                  <td className={TD}>{b.dibuat_nama ?? "–"}</td>
                  {kelola && <td className={TD}>{b.status === "terpakai" && b.sumber !== "impor" && (batal?.id === b.id ? null : <button type="button" className={BTN_R} onClick={() => setBatal({ id: b.id, alasan: "" })}>Batalkan</button>)}</td>}
                </tr>
              ))}
            </tbody>
          </TabelKartu>
        )}
        {buku?.terpotong && <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">Hanya 500 baris pertama yang ditampilkan; persempit filter untuk melihat lainnya.</p>}
        {batal && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[#F0C4BF] bg-[#FDF3F2] p-3">
            <label className="flex min-w-[240px] flex-1 flex-col gap-0.5 text-[12px] font-bold text-[#7A1D22]">Alasan pembatalan (minimal 5 huruf)
              <input className={INPUT} value={batal.alasan} maxLength={300} onChange={(e) => setBatal({ ...batal, alasan: e.target.value })} />
            </label>
            <button type="button" className={BTN_R} disabled={sibuk || batal.alasan.trim().length < 5} onClick={() => void batalkan()}>{sibuk ? "Membatalkan…" : "Batalkan nomor ini"}</button>
            <button type="button" className={BTN_O} onClick={() => setBatal(null)}>Tidak jadi</button>
          </div>
        )}
      </Kartu>
    </>
  );
}
