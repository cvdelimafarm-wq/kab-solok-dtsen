"use client";

// app/sigap/kelola/pendataan/AlokasiWilayah.tsx
//
// (7 Nov 2026) Alokasi per SUB SLS (lapis 2 rancangan sampel lintas survei) -- tab 1 · Persiapan Kelola Pendataan, di atas "Alokasi sampel per SLS".
// ID wilayah = kode Sub SLS 16 digit; NKS hanya penanda. Admin memilih MODEL 1: dengan updating (updating riil, lalu tag sampel) atau tanpa updating
// (langsung tag sampel utama dan cadangan), mengunggah templat Excel (Kecamatan, Nagari, Jorong, Kode Sub SLS, NKS, Jumlah KK Sampel Stage 2, PPL, PML, Korwil,
// Supervisor), memeriksa PRATINJAU (kode vs master wilayah, pencocokan petugas, susunan tim, KK master), lalu menyimpan. Unggah ulang MENGGANTIKAN alokasi aktif.
// Pembacaan Excel di peramban; pemeriksaan dan penyimpanan di server (lib/portal/alokasiWilayah.ts, migrasi 20261107e).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_ALOKASI_ADMIN, LABEL_MODEL, MAKS_BARIS_ALOKASI, PETUNJUK_TEMPLAT_ALOKASI, kodeSubslsPendek, templatAlokasi, type DataAlokasiAdmin, type WilayahAlokasi } from "@/lib/alokasiWilayah";
import type { HasilImporAlokasi, PratinjauAlokasi } from "@/lib/portal/alokasiWilayah";
import { LABEL_PERAN_TIM } from "@/lib/timSampel";
import { BTN, BTN_O, Chip, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
type Berkas = { nama: string; baris: Record<string, unknown>[] };
type Info = { jenis: "ok" | "galat" | "info" | "peringatan"; teks: string };

async function unduhTemplat() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templatAlokasi());
  // kolom Kode Sub SLS (D) sebagai teks: contoh 16 digit tidak boleh jadi notasi ilmiah
  for (const sel of Object.keys(ws)) if (/^D\d+$/.test(sel) && sel !== "D1") (ws[sel] as { t: string }).t = "s";
  ws["!cols"] = [{ wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, "Templat");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Petunjuk"], ...PETUNJUK_TEMPLAT_ALOKASI.map((t) => [t])]), "Petunjuk");
  XLSX.writeFile(wb, "templat_alokasi_subsls.xlsx");
}

async function bacaBerkas(file: File): Promise<Berkas> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const nama = wb.SheetNames.find((n) => n.toLowerCase() !== "petunjuk") ?? wb.SheetNames[0];
  if (!nama) throw new Error("Berkas tidak berisi lembar.");
  // raw:false -> teks seperti tampil di Excel; kode 16 digit yang tersimpan sebagai angka akan terbaca ilmiah dan ditolak server dengan petunjuk
  const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: false });
  return { nama: file.name, baris };
}

export default function AlokasiWilayah({ kegiatanId, nama }: { kegiatanId: number; nama: string }) {
  const [data, setData] = useState<DataAlokasiAdmin | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauAlokasi | null>(null);
  const [sibuk, setSibuk] = useState<"" | "baca" | "simpan" | "model">("");
  const [info, setInfo] = useState<Info | null>(null);
  const [otomatis, setOtomatis] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    try {
      setData(await apiPortal<DataAlokasiAdmin>(`${API_ALOKASI_ADMIN}?k=${kegiatanId}`));
      setGalatMuat("");
    } catch (e) {
      setGalatMuat(e instanceof Error ? e.message : "Alokasi sub SLS belum bisa dimuat.");
    }
  }, [kegiatanId]);

  useEffect(() => {
    setData(null);
    setBerkas(null);
    setPratinjau(null);
    setInfo(null);
    void muat();
  }, [muat]);

  const kelola = data?.boleh_kelola === true && data.siap;
  const perPpl = useMemo(() => {
    const m = new Map<string, { kunci: string; ppl: string; pml: string; sub: WilayahAlokasi[] }>();
    for (const w of data?.wilayah ?? []) {
      const kunci = w.ppl_akun_id != null ? String(w.ppl_akun_id) : "tanpa";
      const g = m.get(kunci) ?? { kunci, ppl: w.ppl_nama ?? "Belum ada PPL", pml: w.pml_nama ?? "", sub: [] };
      g.sub.push(w);
      m.set(kunci, g);
    }
    return Array.from(m.values()).sort((a, b) => (a.kunci === "tanpa" ? 1 : b.kunci === "tanpa" ? -1 : a.ppl.localeCompare(b.ppl)));
  }, [data]);

  const hitung = (b: Berkas, oto: boolean) => apiPortal<PratinjauAlokasi>(API_ALOKASI_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "pratinjau", k: kegiatanId, baris: b.baris, otomatis: oto }) });

  async function pilihBerkas(file: File | undefined) {
    if (!file) return;
    setSibuk("baca");
    setInfo(null);
    setPratinjau(null);
    try {
      const b = await bacaBerkas(file);
      if (b.baris.length > MAKS_BARIS_ALOKASI) throw new Error(`Berkas memuat ${fmt(b.baris.length)} baris; batas satu unggahan ${fmt(MAKS_BARIS_ALOKASI)}.`);
      setBerkas(b);
      setPratinjau(await hitung(b, otomatis));
    } catch (e) {
      setBerkas(null);
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Berkas tidak terbaca." });
    } finally {
      setSibuk("");
      if (input.current) input.current.value = "";
    }
  }

  async function ubahOtomatis(nilai: boolean) {
    setOtomatis(nilai);
    if (!berkas) return;
    setSibuk("baca");
    try {
      setPratinjau(await hitung(berkas, nilai));
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Pratinjau gagal dihitung ulang." });
    } finally {
      setSibuk("");
    }
  }

  async function simpan() {
    if (!berkas || !pratinjau) return;
    setSibuk("simpan");
    setInfo(null);
    try {
      const r = await apiPortal<HasilImporAlokasi>(API_ALOKASI_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "impor", k: kegiatanId, baris: berkas.baris, nama_berkas: berkas.nama, otomatis }) });
      const tambahan = r.tim > 0 ? ` Susunan tim tersimpan (${fmt(r.tim)} orang), ${fmt(r.penugasan_baru)} ditugaskan baru.` : "";
      setInfo({ jenis: "ok", teks: `Alokasi tersimpan: ${fmt(r.jumlah)} sub SLS (${fmt(r.dengan_petugas)} sudah berpetugas).${tambahan}` });
      setBerkas(null);
      setPratinjau(null);
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Alokasi gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  async function ubahModel(denganUpdating: boolean) {
    if (!data || data.konfig.dengan_updating === denganUpdating) return;
    setSibuk("model");
    setInfo(null);
    try {
      await apiPortal(API_ALOKASI_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "model", k: kegiatanId, dengan_updating: denganUpdating }) });
      setInfo({ jenis: "ok", teks: denganUpdating ? "Model: dengan updating." : "Model: tanpa updating (langsung tag sampel utama dan cadangan)." });
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Pilihan model gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  const modelAktif = data?.konfig.dengan_updating === false ? "tanpa" : "dengan";

  return (
    <Kartu
      judul="Alokasi per Sub SLS"
      ket={`Alokasi wilayah ${nama}: kode Sub SLS 16 digit menentukan wilayah (peta batas dan daftar KK master ikut otomatis); NKS hanya penanda. Berkas yang sama menetapkan PPL, PML, korwil, dan supervisor. Petugas melihatnya di HP.`}
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
      {data && !data.siap && <Pesan jenis="info">Alokasi sub SLS belum aktif di basis data (migrasi 20261107e belum dijalankan).</Pesan>}
      {data && data.siap && !data.boleh_kelola && <Pesan jenis="info">Anda hanya dapat melihat alokasi; mengunggah memerlukan akses kelola.</Pesan>}
      {info && <Pesan jenis={info.jenis}>{info.teks}</Pesan>}

      {data && data.siap && (
        <fieldset className="mt-3 rounded-xl border border-[#DDE6F3] p-3" disabled={!kelola || sibuk !== ""}>
          <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Model 1 · pilihan updating</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["dengan", "tanpa"] as const).map((k) => (
              <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-[12.5px] ${modelAktif === k ? "border-[#12305E] bg-[#F2F6FC]" : "border-[#DDE6F3] bg-white"}`}>
                <input type="radio" name={`model-${kegiatanId}`} className="mt-0.5 h-4 w-4 accent-[#12305E]" checked={modelAktif === k} onChange={() => void ubahModel(k === "dengan")} />
                <span>
                  <b className="text-[#1B2B4B]">{LABEL_MODEL[k].judul}</b>
                  <span className="mt-0.5 block text-[#55657D]">{LABEL_MODEL[k].ket}</span>
                </span>
              </label>
            ))}
          </div>
          {modelAktif === "tanpa" && <p className="mt-2 text-[12px] text-[#8A6200]">Tanpa updating, daftar KK master dipakai apa adanya. Pastikan master sub SLS terkait cukup mutakhir sebelum sampel ditandai.</p>}
        </fieldset>
      )}

      {data && data.siap && kelola && (
        <label className="mt-3 flex items-start gap-2 text-[12.5px] text-[#1B2B4B]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#12305E]" checked={otomatis} disabled={sibuk !== ""} onChange={(e) => void ubahOtomatis(e.target.checked)} />
          <span>
            <b>Tugaskan otomatis</b> petugas yang namanya ada di berkas tetapi belum ditugaskan pada kegiatan ini, dan simpan susunan atasannya (PPL &rarr; PML &rarr; korwil &rarr; supervisor). Tanpa centang, nama hanya dicocokkan ke petugas yang sudah ditugaskan di tab Tim.
          </span>
        </label>
      )}

      {data && data.siap && (
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
          <Chip w="navy">{fmt(data.rekap.subsls)} sub SLS</Chip>
          <Chip w="navy">{fmt(data.rekap.nks)} NKS</Chip>
          <Chip w="navy">{fmt(data.rekap.ppl)} PPL</Chip>
          <Chip w="navy">{fmt(data.rekap.pml)} PML</Chip>
          <Chip w="ok">{fmt(data.rekap.target_total)} target sampel</Chip>
          {data.rekap.tanpa_petugas > 0 && <Chip w="wait">{fmt(data.rekap.tanpa_petugas)} belum berpetugas</Chip>}
        </div>
      )}

      {pratinjau && berkas && (
        <div className="mt-4 rounded-xl border border-[#CBD6E6] bg-[#F9FBFF] p-3.5">
          <p className="text-[13.5px] font-bold text-[#1B2B4B]">Pratinjau: {berkas.nama}</p>
          <p className="mt-0.5 text-[12.5px] text-[#55657D]">
            {fmt(pratinjau.baris_berkas)} baris dibaca{pratinjau.dilewati > 0 ? `, ${fmt(pratinjau.dilewati)} kosong dilewati` : ""} · {fmt(pratinjau.rekap.subsls)} sub SLS · {fmt(pratinjau.rekap.nks)} NKS ·{" "}
            {fmt(pratinjau.rekap.ppl)} PPL · {fmt(pratinjau.rekap.pml)} PML · target {fmt(pratinjau.rekap.target_total)}
          </p>

          <div className="mt-2 rounded-lg border border-[#DDE6F3] bg-white p-2.5 text-[12.5px] text-[#1B2B4B]">
            <p className="font-semibold">Susunan tim dari berkas</p>
            <p className="mt-0.5 text-[#55657D]">
              {(["supervisor", "korwil", "pml", "ppl"] as const).map((p) => `${fmt(pratinjau.tim.ringkas.per_peran[p])} ${LABEL_PERAN_TIM[p]}`).join(" · ")} · {fmt(pratinjau.tim.ringkas.ada_atasan)} punya atasan
            </p>
            {pratinjau.otomatis ? (
              pratinjau.tim.baru_total > 0 ? (
                <details className="mt-1" open={pratinjau.tim.baru_total <= 12}>
                  <summary className="cursor-pointer font-semibold text-[#12305E]">{fmt(pratinjau.tim.baru_total)} petugas akan ditugaskan baru saat disimpan</summary>
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5">
                    {pratinjau.tim.baru.map((b, i) => (
                      <li key={i}>
                        {b.nama} <span className="text-[#55657D]">({LABEL_PERAN_TIM[b.peran]})</span>
                      </li>
                    ))}
                    {pratinjau.tim.baru_total > pratinjau.tim.baru.length && <li>… dan {fmt(pratinjau.tim.baru_total - pratinjau.tim.baru.length)} lainnya.</li>}
                  </ul>
                </details>
              ) : (
                <p className="mt-1 text-[#11502B]">{pratinjau.rekap.ppl > 0 ? "Semua petugas pada berkas sudah ditugaskan pada kegiatan ini." : "Berkas belum memuat petugas (alokasi dini)."}</p>
              )
            ) : (
              <p className="mt-1 text-[#55657D]">Penugasan tidak ditambah (pilihan &ldquo;Tugaskan otomatis&rdquo; mati); hanya susunan atasan dan alokasi yang disimpan.</p>
            )}
            {pratinjau.tim.peringatan.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[#8A6200]">
                {pratinjau.tim.peringatan.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>

          {pratinjau.galat_total > 0 && (
            <div className="mt-2">
              <Pesan>{fmt(pratinjau.galat_total)} baris bermasalah, alokasi belum bisa disimpan. Perbaiki di Excel lalu pilih berkas lagi.</Pesan>
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

          {(pratinjau.pemetaan.length > 0 || pratinjau.tim.pemetaan_atasan.length > 0) && (
            <details className="mt-2" open={[...pratinjau.pemetaan, ...pratinjau.tim.pemetaan_atasan].some((p) => !p.akun_id || p.mirip)}>
              <summary className="cursor-pointer text-[12.5px] font-semibold text-[#1B2B4B]">Pencocokan nama petugas ({fmt(pratinjau.pemetaan.length + pratinjau.tim.pemetaan_atasan.length)})</summary>
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
                    {[...pratinjau.pemetaan, ...pratinjau.tim.pemetaan_atasan].map((p, i) => (
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
          )}

          {pratinjau.ringkas_ppl.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-[#1B2B4B]">Ringkasan per PPL ({fmt(pratinjau.ringkas_ppl.length)})</summary>
              <div className="mt-1 max-h-60 overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr>
                      <th className={TH}>PPL</th>
                      <th className={TH}>PML</th>
                      <th className={TH}>Sub SLS</th>
                      <th className={TH}>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pratinjau.ringkas_ppl.map((p, i) => (
                      <tr key={i}>
                        <td className={TD}>{p.ppl_nama}</td>
                        <td className={TD}>{p.pml_nama}</td>
                        <td className={TD}>{p.subsls}</td>
                        <td className={TD}>{p.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {pratinjau.jumlah_lama > 0 && <p className="mt-2 text-[12.5px] text-[#55657D]">Menyimpan akan menggantikan {fmt(pratinjau.jumlah_lama)} sub SLS aktif sekarang (riwayatnya tetap tercatat).</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={!pratinjau.bisa_simpan || !kelola || sibuk !== ""} onClick={() => void simpan()}>
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan alokasi"}
            </button>
            <button type="button" className={BTN_O} disabled={sibuk !== ""} onClick={() => { setBerkas(null); setPratinjau(null); }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {data && data.siap && perPpl.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Alokasi saat ini</p>
          <div className="space-y-1.5">
            {perPpl.map((g) => (
              <details key={g.kunci} className="rounded-lg border border-[#DDE6F3] bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
                  <b className="font-bold text-[#1B2B4B]">{g.ppl}</b>
                  {g.pml && <span className="text-[#6B7A90]">PML {g.pml}</span>}
                  <span className="text-[#55657D]">
                    {g.sub.length} sub SLS · target {g.sub.reduce((s, w) => s + w.target, 0)}
                  </span>
                </summary>
                <ul className="space-y-1 border-t border-[#EEF2F7] px-3 py-2 text-[12.5px] text-[#1E2B3F]">
                  {g.sub.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-[12.5px]" title={w.idsubsls}>{kodeSubslsPendek(w.idsubsls)}</span>
                      <span>
                        {w.nagari} · {w.sls}
                      </span>
                      {w.nks && <Chip w="mut">NKS {w.nks}</Chip>}
                      <span className="text-[#55657D]">target {w.target}</span>
                      {w.jumlah_kk === 0 ? <Chip w="wait">belum ada KK master</Chip> : <span className="text-[#55657D]">{fmt(w.jumlah_kk)} KK master</span>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
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
                  <th className={TH}>Sub SLS</th>
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
                      {fmt(r.jumlah)} ({fmt(r.dengan_petugas)} berpetugas)
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
