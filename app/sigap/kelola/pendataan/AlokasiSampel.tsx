"use client";

// app/sigap/kelola/pendataan/AlokasiSampel.tsx
//
// (30 Okt 2026) Alokasi sampel per SLS (strategi sampel_sls: Sakernas, Seruti, IMK) -- tab 1 · Persiapan Kelola Pendataan. Admin mengunggah templat Excel
// (Kode Wilayah, Nama Responden, Nama Anggota Ruta Lain, Status Sampel Utama/Cadangan, Latitude, Longitude, Nama PPL, Nama PML), memeriksa PRATINJAU
// (baris bermasalah, pencocokan nama PPL/PML ke petugas yang sudah ditugaskan, peringatan alokasi), lalu menyimpan. Unggah ulang MENGGANTIKAN alokasi aktif.
// Juga: tabel alokasi per PPL/SLS, daftar penggantian sampel (admin bisa membatalkan), pengaturan (target per SLS, maks SLS per PPL, PPL boleh ganti), riwayat.
// Pembacaan Excel di peramban; pemeriksaan dan penyimpanan di server (lib/portal/sampel.ts, tabel migrasi 20261030g).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import {
  API_SAMPEL_ADMIN, MAKS_BARIS_SAMPEL, PETUNJUK_TEMPLAT, kelompokPpl, kodeSlsPendek, templatSampel, type DataSampelAdmin, type KonfigSampel, type SampelRow,
} from "@/lib/sampelSls";
import type { PratinjauSampel } from "@/lib/portal/sampel";
import { BTN, BTN_O, BTN_R, BTN_T, Chip, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
type Berkas = { nama: string; baris: Record<string, unknown>[] };
type Info = { jenis: "ok" | "galat" | "info" | "peringatan"; teks: string };

async function unduhTemplat() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templatSampel());
  ws["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, "Templat");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Petunjuk"], ...PETUNJUK_TEMPLAT.map((t) => [t])]), "Petunjuk");
  XLSX.writeFile(wb, "templat_alokasi_sampel.xlsx");
}

async function bacaBerkas(file: File): Promise<Berkas> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const nama = wb.SheetNames.find((n) => n.toLowerCase() !== "petunjuk") ?? wb.SheetNames[0];
  if (!nama) throw new Error("Berkas tidak berisi lembar.");
  const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: false });
  return { nama: file.name, baris };
}

export default function AlokasiSampel({ kegiatanId, nama }: { kegiatanId: number; nama: string }) {
  const [data, setData] = useState<DataSampelAdmin | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauSampel | null>(null);
  const [sibuk, setSibuk] = useState<"" | "baca" | "simpan" | "konfig">("");
  const [info, setInfo] = useState<Info | null>(null);
  const [paksa, setPaksa] = useState(false);
  const [konfig, setKonfig] = useState<KonfigSampel | null>(null);
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    try {
      const d = await apiPortal<DataSampelAdmin>(`${API_SAMPEL_ADMIN}?k=${kegiatanId}`);
      setData(d);
      setKonfig(d.konfig);
      setGalatMuat("");
    } catch (e) {
      setGalatMuat(e instanceof Error ? e.message : "Alokasi sampel belum bisa dimuat.");
    }
  }, [kegiatanId]);

  useEffect(() => {
    setData(null);
    setBerkas(null);
    setPratinjau(null);
    setInfo(null);
    setPaksa(false);
    void muat();
  }, [muat]);

  const kelola = data?.boleh_kelola === true && data.siap;
  const grup = useMemo(() => (data ? kelompokPpl(data.sampel) : []), [data]);
  const diganti = useMemo(() => (data ? data.sampel.filter((r) => r.status === "cadangan" && r.menggantikan_id != null) : []), [data]);
  const peta = useMemo(() => new Map((data?.sampel ?? []).map((r) => [r.id, r])), [data]);

  async function pilihBerkas(file: File | undefined) {
    if (!file) return;
    setSibuk("baca");
    setInfo(null);
    setPratinjau(null);
    setPaksa(false);
    try {
      const b = await bacaBerkas(file);
      if (b.baris.length > MAKS_BARIS_SAMPEL) throw new Error(`Berkas memuat ${fmt(b.baris.length)} baris; batas satu unggahan ${fmt(MAKS_BARIS_SAMPEL)}.`);
      setBerkas(b);
      setPratinjau(await apiPortal<PratinjauSampel>(API_SAMPEL_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "pratinjau", k: kegiatanId, baris: b.baris }) }));
    } catch (e) {
      setBerkas(null);
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Berkas tidak terbaca." });
    } finally {
      setSibuk("");
      if (input.current) input.current.value = "";
    }
  }

  async function simpan() {
    if (!berkas || !pratinjau) return;
    setSibuk("simpan");
    setInfo(null);
    try {
      const r = await apiPortal<{ jumlah: number; utama: number; cadangan: number }>(API_SAMPEL_ADMIN, {
        method: "POST",
        body: JSON.stringify({ aksi: "impor", k: kegiatanId, baris: berkas.baris, nama_berkas: berkas.nama, paksa }),
      });
      setInfo({ jenis: "ok", teks: `Alokasi tersimpan: ${fmt(r.jumlah)} sampel (${fmt(r.utama)} utama, ${fmt(r.cadangan)} cadangan).` });
      setBerkas(null);
      setPratinjau(null);
      setPaksa(false);
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Alokasi gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  async function simpanKonfig() {
    if (!konfig) return;
    setSibuk("konfig");
    setInfo(null);
    try {
      await apiPortal(API_SAMPEL_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "konfig", k: kegiatanId, konfig }) });
      setInfo({ jenis: "ok", teks: "Pengaturan tersimpan." });
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Pengaturan gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  async function batalGanti(r: SampelRow) {
    if (!window.confirm(`Batalkan penggantian: ${peta.get(r.menggantikan_id ?? 0)?.nama_responden ?? "sampel utama"} kembali dipakai, ${r.nama_responden} kembali cadangan?`)) return;
    setInfo(null);
    try {
      await apiPortal(API_SAMPEL_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "batal_ganti", k: kegiatanId, cadangan_id: r.id }) });
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Pembatalan gagal." });
    }
  }

  const alihBuka = (kunci: string) =>
    setBuka((s) => {
      const n = new Set(s);
      if (n.has(kunci)) n.delete(kunci);
      else n.add(kunci);
      return n;
    });

  const konfigBerubah = !!data && !!konfig && (konfig.target_per_sls !== data.konfig.target_per_sls || konfig.maks_sls_per_ppl !== data.konfig.maks_sls_per_ppl || konfig.boleh_ganti !== data.konfig.boleh_ganti);
  const perluPaksa = (pratinjau?.ada_pengganti ?? 0) > 0;

  return (
    <Kartu
      judul="Alokasi sampel per SLS"
      ket={`Alokasi sampel ${nama}: tiap PPL mendapat SLS dan sampelnya dari templat Excel (format mengikuti unggahan FASIH). Petugas melihatnya di HP.`}
      kanan={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={() => void unduhTemplat()}>
            Unduh templat Excel
          </button>
          <button type="button" className={BTN} disabled={!kelola || sibuk !== ""} onClick={() => input.current?.click()}>
            {sibuk === "baca" ? "Membaca…" : "Pilih berkas Excel…"}
          </button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void pilihBerkas(e.target.files?.[0])} />
        </div>
      }
    >
      {!data && !galatMuat && <Memuat />}
      {galatMuat && <Pesan>{galatMuat}</Pesan>}
      {data && !data.siap && <Pesan jenis="info">Penyimpanan alokasi belum aktif di basis data (migrasi 20261030g belum dijalankan).</Pesan>}
      {data && data.siap && !data.boleh_kelola && <Pesan jenis="info">Anda hanya dapat melihat alokasi; mengunggah memerlukan akses kelola.</Pesan>}
      {data && data.siap && data.petugas.ppl === 0 && <Pesan jenis="peringatan">Belum ada PPL yang ditugaskan pada kegiatan ini. Nama PPL/PML pada Excel dicocokkan ke penugasan, jadi tambahkan petugas di tab 2 · Tim &amp; Surat Tugas dahulu.</Pesan>}
      {info && <Pesan jenis={info.jenis}>{info.teks}</Pesan>}

      {data && data.siap && (
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
          <Chip w="navy">{fmt(data.rekap.sls)} SLS</Chip>
          <Chip w="navy">{fmt(data.rekap.ppl)} PPL</Chip>
          <Chip w="navy">{fmt(data.rekap.pml)} PML</Chip>
          <Chip w="ok">{fmt(data.rekap.utama)} sampel utama</Chip>
          <Chip w="mut">{fmt(data.rekap.cadangan)} cadangan</Chip>
          {data.rekap.diganti > 0 && <Chip w="wait">{fmt(data.rekap.diganti)} diganti · sisa cadangan {fmt(data.rekap.cadangan_tersisa)}</Chip>}
          {data.rekap.utama > 0 && <Chip w="mut">{fmt(data.rekap.berkoordinat)} berkoordinat</Chip>}
        </div>
      )}

      {pratinjau && berkas && (
        <div className="mt-4 rounded-xl border border-[#CBD6E6] bg-[#F9FBFF] p-3.5">
          <p className="text-[13.5px] font-bold text-[#1B2B4B]">Pratinjau: {berkas.nama}</p>
          <p className="mt-0.5 text-[12.5px] text-[#55657D]">
            {fmt(pratinjau.baris_berkas)} baris dibaca{pratinjau.dilewati > 0 ? `, ${fmt(pratinjau.dilewati)} kosong dilewati` : ""} · {fmt(pratinjau.rekap.utama)} utama, {fmt(pratinjau.rekap.cadangan)} cadangan ·{" "}
            {fmt(pratinjau.rekap.sls)} SLS · {fmt(pratinjau.rekap.ppl)} PPL · {fmt(pratinjau.rekap.pml)} PML
          </p>

          {pratinjau.galat_total > 0 && (
            <div className="mt-2">
              <Pesan>
                {fmt(pratinjau.galat_total)} baris bermasalah, alokasi belum bisa disimpan. Perbaiki di Excel lalu pilih berkas lagi.
              </Pesan>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-[12.5px] text-[#B42329]">
                {pratinjau.galat.map((g, i) => (
                  <li key={i}>
                    {g.baris > 0 ? `Baris ${g.baris}: ` : ""}
                    {g.pesan}
                  </li>
                ))}
                {pratinjau.galat_total > pratinjau.galat.length && <li>… dan {fmt(pratinjau.galat_total - pratinjau.galat.length)} baris lain.</li>}
              </ul>
            </div>
          )}

          {pratinjau.peringatan_total > 0 && (
            <details className="mt-2 text-[12.5px] text-[#8A6200]">
              <summary className="cursor-pointer font-semibold">{fmt(pratinjau.peringatan_total)} peringatan baris (tetap disimpan)</summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                {pratinjau.peringatan.map((g, i) => (
                  <li key={i}>
                    Baris {g.baris}: {g.pesan}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {pratinjau.alokasi.length > 0 && (
            <div className="mt-2">
              <Pesan jenis="peringatan">Periksa alokasi sebelum menyimpan (tidak menghalangi penyimpanan):</Pesan>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#8A6200]">
                {pratinjau.alokasi.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-2" open={pratinjau.pemetaan.some((p) => !p.akun_id || p.mirip)}>
            <summary className="cursor-pointer text-[12.5px] font-semibold text-[#1B2B4B]">Pencocokan nama petugas ({fmt(pratinjau.pemetaan.length)})</summary>
            <div className="mt-1 max-h-60 overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <th className={TH}>Peran</th>
                    <th className={TH}>Nama di Excel</th>
                    <th className={TH}>Akun SIGAP</th>
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.pemetaan.map((p, i) => (
                    <tr key={i}>
                      <td className={TD}>{p.peran.toUpperCase()}</td>
                      <td className={TD}>{p.nama_excel}</td>
                      <td className={TD}>
                        {p.akun_id ? (
                          <>
                            {p.nama_akun} {p.mirip && <Chip w="wait">mirip, periksa</Chip>}
                          </>
                        ) : (
                          <span className="text-[#B42329]">{p.pesan}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="mt-2">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-[#1B2B4B]">Ringkasan per PPL ({fmt(pratinjau.ringkas_ppl.length)})</summary>
            <div className="mt-1 max-h-60 overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <th className={TH}>PPL</th>
                    <th className={TH}>PML</th>
                    <th className={TH}>SLS</th>
                    <th className={TH}>Utama</th>
                    <th className={TH}>Cadangan</th>
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.ringkas_ppl.map((p, i) => (
                    <tr key={i}>
                      <td className={TD}>{p.ppl_nama}</td>
                      <td className={TD}>{p.pml_nama}</td>
                      <td className={TD}>{p.sls}</td>
                      <td className={TD}>{p.utama}</td>
                      <td className={TD}>{p.cadangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {pratinjau.jumlah_lama > 0 && (
            <p className="mt-2 text-[12.5px] text-[#55657D]">Menyimpan akan menggantikan {fmt(pratinjau.jumlah_lama)} sampel aktif sekarang (riwayatnya tetap tercatat).</p>
          )}
          {perluPaksa && (
            <label className="mt-2 flex items-start gap-2 text-[12.5px] text-[#B42329]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B42329]" checked={paksa} onChange={(e) => setPaksa(e.target.checked)} />
              <span>
                Sudah ada {fmt(pratinjau.ada_pengganti)} penggantian sampel yang ditandai PPL. Unggah ulang akan menghapus tanda itu. Centang bila memang ingin mengganti alokasi.
              </span>
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={!pratinjau.bisa_simpan || !kelola || sibuk !== "" || (perluPaksa && !paksa)} onClick={() => void simpan()}>
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan alokasi"}
            </button>
            <button
              type="button"
              className={BTN_O}
              disabled={sibuk !== ""}
              onClick={() => {
                setBerkas(null);
                setPratinjau(null);
                setPaksa(false);
              }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {data && data.siap && grup.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Alokasi saat ini</p>
          <div className="space-y-1.5">
            {grup.map((p) => (
              <details key={p.ppl_akun_id} className="rounded-lg border border-[#DDE6F3] bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
                  <b className="font-bold text-[#1B2B4B]">{p.ppl_nama}</b>
                  <span className="text-[#6B7A90]">PML {p.pml_nama}</span>
                  <span className="text-[#55657D]">
                    {p.sls.length} SLS · {p.utama} utama · {p.cadangan} cadangan{p.diganti > 0 ? ` · ${p.diganti} diganti` : ""}
                  </span>
                </summary>
                <div className="space-y-1 border-t border-[#EEF2F7] px-3 py-2">
                  {p.sls.map((s) => {
                    const kunci = `${s.kode_sls}|${s.ppl_akun_id}`;
                    const terbuka = buka.has(kunci);
                    return (
                      <div key={kunci}>
                        <button type="button" className={`${BTN_T} !min-h-[36px] w-full justify-start !px-1 text-left`} onClick={() => alihBuka(kunci)} aria-expanded={terbuka}>
                          <span className="font-mono text-[12.5px]">{s.kode_sls}</span>
                          <span className="ml-2 font-normal text-[#55657D]">
                            {s.utama.length} utama · {s.cadangan.length} cadangan{s.diganti > 0 ? ` · ${s.diganti} diganti` : ""} {terbuka ? "▴" : "▾"}
                          </span>
                        </button>
                        {terbuka && (
                          <ul className="mb-1 ml-2 space-y-0.5 border-l-2 border-[#DDE6F3] pl-3 text-[12.5px] text-[#1E2B3F]">
                            {[...s.utama, ...s.cadangan].map((r) => (
                              <li key={r.id}>
                                <Chip w={r.status === "utama" ? "ok" : "mut"}>{r.status === "utama" ? "Utama" : "Cadangan"}</Chip> {r.nama_responden}
                                {r.anggota_lain ? <span className="text-[#6B7A90]"> · {r.anggota_lain}</span> : null}
                                {r.pengganti && <span className="text-[#8A6200]"> · diganti {r.pengganti.nama_responden}</span>}
                                {r.menggantikan && <span className="text-[#8A6200]"> · pengganti {r.menggantikan.nama_responden}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {data && data.siap && diganti.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Penggantian sampel ({diganti.length})</p>
          <div className="overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>SLS</th>
                  <th className={TH}>PPL</th>
                  <th className={TH}>Sampel utama</th>
                  <th className={TH}>Diganti cadangan</th>
                  <th className={TH}>Alasan</th>
                  <th className={TH}>Waktu</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {diganti.map((r) => (
                  <tr key={r.id}>
                    <td className={`${TD} font-mono`}>{kodeSlsPendek(r.kode_sls)}</td>
                    <td className={TD}>{r.ppl_nama}</td>
                    <td className={TD}>{peta.get(r.menggantikan_id ?? 0)?.nama_responden ?? "-"}</td>
                    <td className={TD}>{r.nama_responden}</td>
                    <td className={TD}>{r.alasan ?? "-"}</td>
                    <td className={TD}>{r.diganti_at ? waktu(r.diganti_at) : "-"}</td>
                    <td className={TD}>
                      {kelola && (
                        <button type="button" className={BTN_R} onClick={() => void batalGanti(r)}>
                          Batalkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.siap && konfig && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Pengaturan alokasi</p>
          <div className="flex flex-wrap items-end gap-4 text-[13px]">
            <label className="block">
              <span className="block text-[12px] text-[#55657D]">Sampel utama per SLS</span>
              <input
                type="number"
                min={1}
                max={100}
                className="mt-1 w-24 rounded-lg border border-[#CBD5E1] px-2 py-1.5"
                value={konfig.target_per_sls}
                disabled={!kelola}
                onChange={(e) => setKonfig({ ...konfig, target_per_sls: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] text-[#55657D]">Maksimum SLS per PPL</span>
              <input
                type="number"
                min={1}
                max={50}
                className="mt-1 w-24 rounded-lg border border-[#CBD5E1] px-2 py-1.5"
                value={konfig.maks_sls_per_ppl}
                disabled={!kelola}
                onChange={(e) => setKonfig({ ...konfig, maks_sls_per_ppl: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-2 pb-1.5">
              <input type="checkbox" className="h-4 w-4 accent-[#1F5FD1]" checked={konfig.boleh_ganti} disabled={!kelola} onChange={(e) => setKonfig({ ...konfig, boleh_ganti: e.target.checked })} />
              <span>PPL boleh menandai sampel diganti cadangan</span>
            </label>
            <button type="button" className={BTN} disabled={!kelola || !konfigBerubah || sibuk !== ""} onClick={() => void simpanKonfig()}>
              {sibuk === "konfig" ? "Menyimpan…" : "Simpan pengaturan"}
            </button>
          </div>
          <p className="mt-1 text-[12px] text-[#6B7A90]">Target dan maksimum dipakai untuk peringatan saat pratinjau; tidak menolak berkas.</p>
        </div>
      )}

      {data && data.siap && data.riwayat.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Riwayat unggahan ({data.riwayat.length})</summary>
          <div className="mt-1.5 overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>Waktu</th>
                  <th className={TH}>Berkas</th>
                  <th className={TH}>Oleh</th>
                  <th className={TH}>Sampel</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.riwayat.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>{waktu(r.diunggah_at)}</td>
                    <td className={TD}>{r.nama_berkas ?? "-"}</td>
                    <td className={TD}>{r.oleh ?? "-"}</td>
                    <td className={TD}>
                      {fmt(r.jumlah)} ({fmt(r.utama)} utama, {fmt(r.cadangan)} cadangan)
                    </td>
                    <td className={TD}>{r.aktif ? <Chip w="ok">aktif</Chip> : <Chip w="mut">diganti</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Kartu>
  );
}
