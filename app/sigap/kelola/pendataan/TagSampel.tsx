"use client";

// app/sigap/kelola/pendataan/TagSampel.tsx
//
// (7 Nov 2026) Tag sampel stage 2 + JENDELA RILIS 24 jam (tahap A2) -- tab 1 · Persiapan Kelola Pendataan, di bawah "Alokasi per Sub SLS".
// Ketua/Wakil (izin kelola kegiatan) membuka jendela: selama 24 jam PPL menandai sampel utama/cadangan di HP; sesudah itu daftar DIKUNCI dan PPL hanya mengisi hasil
// pendataan. Ketua juga dapat menutup lebih awal, membuka kembali (alasan wajib, tercatat), dan menandai massal lewat templat Excel (daftar KK sub SLS beralokasi,
// kolom Peran Sampel). Semua aturan ditegakkan di basis data (migrasi 20261107f); layar ini menampilkan status, progres, dan pratinjau unggahan.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_ALOKASI_ADMIN, kodeSubslsPendek } from "@/lib/alokasiWilayah";
import { API_TAG_ADMIN, KOLOM_TEMPLAT_TAG, MAKS_BARIS_TAG, PETUNJUK_TEMPLAT_TAG, formatSisa, selisihJam, sisaDetik, statusEfektif, templatTag, type BarisTemplatTag, type ModeTag } from "@/lib/tagSampel";
import type { DataTagAdmin, HasilImporTag, PratinjauTag } from "@/lib/portal/tagSampel";
import { BTN, BTN_O, Chip, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type Berkas = { nama: string; baris: Record<string, unknown>[] };
type Info = { jenis: "ok" | "galat" | "info" | "peringatan"; teks: string };

async function bacaBerkas(file: File): Promise<Berkas> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const nama = wb.SheetNames.find((n) => n.toLowerCase() !== "petunjuk") ?? wb.SheetNames[0];
  if (!nama) throw new Error("Berkas tidak berisi lembar.");
  const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: false });
  return { nama: file.name, baris };
}

async function unduhDaftar(kegiatanId: number, baris: BarisTemplatTag[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templatTag(baris));
  ws["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 22 }, { wch: 14 }];
  ws["!autofilter"] = { ref: `A1:${String.fromCharCode(64 + KOLOM_TEMPLAT_TAG.length)}${baris.length + 1}` };
  XLSX.utils.book_append_sheet(wb, ws, "Daftar KK");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Petunjuk"], ...PETUNJUK_TEMPLAT_TAG.map((t) => [t])]), "Petunjuk");
  XLSX.writeFile(wb, `tag_sampel_kegiatan_${kegiatanId}.xlsx`);
}

export default function TagSampel({ kegiatanId, nama }: { kegiatanId: number; nama: string }) {
  const [data, setData] = useState<DataTagAdmin | null>(null);
  const [selisih, setSelisih] = useState(0);
  const [sekarang, setSekarang] = useState(() => Date.now());
  const [galatMuat, setGalatMuat] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [sibuk, setSibuk] = useState("");
  const [bukaUlang, setBukaUlang] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [cadangan, setCadangan] = useState("");
  const [mode, setMode] = useState<ModeTag>("tambah");
  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauTag | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    try {
      const d = await apiPortal<DataTagAdmin>(`${API_TAG_ADMIN}?k=${kegiatanId}`);
      setData(d);
      setSelisih(selisihJam(d.jendela.sekarang));
      setCadangan((c) => (c === "" ? String(d.konfig.cadangan_per_sls) : c));
      setGalatMuat("");
    } catch (e) {
      setGalatMuat(e instanceof Error ? e.message : "Tag sampel belum bisa dimuat.");
    }
  }, [kegiatanId]);

  useEffect(() => {
    setData(null);
    setBerkas(null);
    setPratinjau(null);
    setInfo(null);
    setCadangan("");
    void muat();
  }, [muat]);

  useEffect(() => {
    const t = setInterval(() => setSekarang(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const status = data ? statusEfektif(data.jendela, selisih, sekarang) : "belum";
  const sisa = data ? sisaDetik(data.jendela, selisih, sekarang) : 0;
  const kelola = data?.boleh_kelola === true && data.siap;
  const dengan = data?.konfig.dengan_updating !== false;

  const perPpl = useMemo(() => {
    const m = new Map<string, { ppl: string; sub: DataTagAdmin["progres"] }>();
    for (const p of data?.progres ?? []) {
      const k = p.ppl_nama ?? "Belum ada PPL";
      const g = m.get(k) ?? { ppl: k, sub: [] };
      g.sub.push(p);
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => a.ppl.localeCompare(b.ppl));
  }, [data]);

  async function kirim(body: Record<string, unknown>, url = API_TAG_ADMIN) {
    return apiPortal<Record<string, unknown>>(url, { method: "POST", body: JSON.stringify({ k: kegiatanId, ...body }) });
  }

  async function buka() {
    setSibuk("buka");
    setInfo(null);
    try {
      const r = (await kirim({ aksi: "buka", alasan })) as { buka_kembali?: boolean };
      setInfo({ jenis: "ok", teks: r.buka_kembali ? "Jendela dibuka kembali selama 24 jam. Alasan tercatat." : "Jendela rilis dibuka selama 24 jam. Petugas dapat menandai sampel di HP." });
      setBukaUlang(false);
      setAlasan("");
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Jendela gagal dibuka." });
    } finally {
      setSibuk("");
    }
  }

  async function tutup() {
    if (!window.confirm("Tutup jendela rilis sekarang? Daftar sampel langsung dikunci; PPL hanya dapat mengisi hasil pendataan.")) return;
    setSibuk("tutup");
    setInfo(null);
    try {
      await kirim({ aksi: "tutup" });
      setInfo({ jenis: "ok", teks: "Jendela ditutup. Daftar sampel dikunci." });
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Jendela gagal ditutup." });
    } finally {
      setSibuk("");
    }
  }

  async function simpanCadangan() {
    if (!data) return;
    setSibuk("cad");
    setInfo(null);
    try {
      await kirim({ aksi: "model", dengan_updating: data.konfig.dengan_updating, cadangan_per_sls: Number(cadangan) }, API_ALOKASI_ADMIN);
      setInfo({ jenis: "ok", teks: Number(cadangan) > 0 ? `Jatah cadangan: ${Number(cadangan)} per sub SLS.` : "Kegiatan ini tanpa sampel cadangan." });
      setCadangan("");
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Jatah cadangan gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  async function unduh() {
    setSibuk("unduh");
    setInfo(null);
    try {
      const r = await apiPortal<{ baris: BarisTemplatTag[] }>(`${API_TAG_ADMIN}?k=${kegiatanId}&templat=1`);
      if (r.baris.length === 0) throw new Error("Belum ada KK pada sub SLS beralokasi.");
      if (r.baris.length > MAKS_BARIS_TAG) throw new Error(`Daftar memuat ${fmt(r.baris.length)} baris, melebihi batas ${fmt(MAKS_BARIS_TAG)}.`);
      await unduhDaftar(kegiatanId, r.baris);
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Daftar KK gagal diunduh." });
    } finally {
      setSibuk("");
    }
  }

  const hitung = (b: Berkas, m: ModeTag) => kirim({ aksi: "pratinjau", baris: b.baris, mode: m }) as unknown as Promise<PratinjauTag>;

  async function pilihBerkas(file: File | undefined) {
    if (!file) return;
    setSibuk("baca");
    setInfo(null);
    setPratinjau(null);
    try {
      const b = await bacaBerkas(file);
      if (b.baris.length > MAKS_BARIS_TAG) throw new Error(`Berkas memuat ${fmt(b.baris.length)} baris; batas satu unggahan ${fmt(MAKS_BARIS_TAG)}.`);
      setBerkas(b);
      setPratinjau(await hitung(b, mode));
    } catch (e) {
      setBerkas(null);
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Berkas tidak terbaca." });
    } finally {
      setSibuk("");
      if (input.current) input.current.value = "";
    }
  }

  async function ubahMode(m: ModeTag) {
    setMode(m);
    if (!berkas) return;
    setSibuk("baca");
    try {
      setPratinjau(await hitung(berkas, m));
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Pratinjau gagal dihitung ulang." });
    } finally {
      setSibuk("");
    }
  }

  async function simpanBerkas() {
    if (!berkas || !pratinjau) return;
    setSibuk("simpan");
    setInfo(null);
    try {
      const r = (await kirim({ aksi: "impor", baris: berkas.baris, mode, nama_berkas: berkas.nama })) as unknown as HasilImporTag;
      setInfo({ jenis: "ok", teks: `Tag tersimpan: ${fmt(r.ditambah)} baru, ${fmt(r.diganti)} diganti peran, ${fmt(r.dilepas)} dilepas, ${fmt(r.sama)} sudah sama.` });
      setBerkas(null);
      setPratinjau(null);
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Tag gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  const warna = status === "terbuka" ? "ok" : status === "terkunci" ? "mut" : "wait";

  return (
    <Kartu
      judul="Tag Sampel Stage 2 · Jendela Rilis"
      ket={`Penandaan sampel utama dan cadangan ${nama}. Ketua/Wakil membuka jendela 24 jam; selama itu PPL menandai KK di HP. Sesudah tutup, daftar dikunci dan PPL hanya mengisi hasil pendataan. ${dengan ? "Dengan updating: buka jendela setelah updating riil selesai." : "Tanpa updating: jendela dapat langsung dibuka."}`}
      kanan={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_O} disabled={!kelola || sibuk !== "" || !data || data.progres.length === 0} onClick={() => void unduh()}>
            {sibuk === "unduh" ? "Menyiapkan…" : "Unduh daftar KK (Excel)"}
          </button>
          <button type="button" className={BTN} disabled={!kelola || sibuk !== "" || status === "terkunci"} onClick={() => input.current?.click()}>
            {sibuk === "baca" ? "Membaca…" : "Pilih berkas tag…"}
          </button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void pilihBerkas(e.target.files?.[0])} />
        </div>
      }
    >
      {!data && !galatMuat && <Memuat />}
      {galatMuat && <Pesan>{galatMuat}</Pesan>}
      {data && !data.siap && <Pesan jenis="info">Penandaan sampel belum aktif di basis data (migrasi 20261107f belum dijalankan).</Pesan>}
      {data && data.siap && !data.boleh_kelola && <Pesan jenis="info">Anda hanya dapat melihat progres; membuka jendela dan mengunggah memerlukan akses kelola.</Pesan>}
      {info && <Pesan jenis={info.jenis}>{info.teks}</Pesan>}

      {data && data.siap && (
        <>
          <div className="mt-3 rounded-xl border border-[#DDE6F3] bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip w={warna}>{status === "terbuka" ? "Jendela terbuka" : status === "terkunci" ? "Terkunci" : "Belum dibuka"}</Chip>
              {status === "terbuka" && (
                <span className="text-[13px] font-semibold text-[#13794B]">
                  Sisa {formatSisa(sisa)} · tutup otomatis {data.jendela.batas_at ? waktu(data.jendela.batas_at) : ""} WIB
                </span>
              )}
              {status === "terkunci" && data.jendela.ditutup_at && <span className="text-[12.5px] text-[#55657D]">Dikunci sejak {waktu(data.jendela.ditutup_at)} WIB</span>}
              {data.jendela.dibuka_oleh && status !== "belum" && <span className="text-[12px] text-[#55657D]">dibuka {data.jendela.dibuka_oleh}{data.jendela.buka_kembali && data.jendela.alasan ? ` (buka kembali: ${data.jendela.alasan})` : ""}</span>}
            </div>
            {data.progres.length === 0 && <p className="mt-2 text-[12.5px] text-[#8A6200]">Belum ada alokasi sub SLS. Unggah alokasi di kartu di atas sebelum membuka jendela.</p>}
            {kelola && data.progres.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-start gap-2">
                {status === "belum" && (
                  <button type="button" className={BTN} disabled={sibuk !== ""} onClick={() => void buka()}>
                    {sibuk === "buka" ? "Membuka…" : "Buka penandaan 24 jam"}
                  </button>
                )}
                {status === "terbuka" && (
                  <button type="button" className={BTN_O} disabled={sibuk !== ""} onClick={() => void tutup()}>
                    {sibuk === "tutup" ? "Menutup…" : "Tutup sekarang"}
                  </button>
                )}
                {status === "terkunci" && !bukaUlang && (
                  <button type="button" className={BTN_O} disabled={sibuk !== ""} onClick={() => setBukaUlang(true)}>
                    Buka kembali…
                  </button>
                )}
                {status === "terkunci" && bukaUlang && (
                  <div className="w-full max-w-md space-y-2">
                    <label className="block text-[12.5px] font-semibold text-[#1B2B4B]">
                      Alasan membuka kembali (wajib, tercatat)
                      <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2} maxLength={500} className="mt-1 w-full rounded-lg border border-[#CBD6E6] px-2.5 py-1.5 text-[13px]" placeholder="Contoh: dua PPL belum sempat menandai sampel" />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" className={BTN} disabled={sibuk !== "" || alasan.trim().length < 5} onClick={() => void buka()}>
                        {sibuk === "buka" ? "Membuka…" : "Buka 24 jam"}
                      </button>
                      <button type="button" className={BTN_O} disabled={sibuk !== ""} onClick={() => { setBukaUlang(false); setAlasan(""); }}>
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#DDE6F3] bg-white p-3">
            <label className="text-[12.5px] font-semibold text-[#1B2B4B]">
              Cadangan per sub SLS
              <input type="number" min={0} max={100} value={cadangan} onChange={(e) => setCadangan(e.target.value)} disabled={!kelola || sibuk !== ""} className="mt-1 block w-24 rounded-lg border border-[#CBD6E6] px-2.5 py-1.5 text-[13px]" />
            </label>
            <button type="button" className={BTN_O} disabled={!kelola || sibuk !== "" || cadangan === "" || Number(cadangan) === data.konfig.cadangan_per_sls} onClick={() => void simpanCadangan()}>
              {sibuk === "cad" ? "Menyimpan…" : "Simpan jatah"}
            </button>
            <p className="min-w-[200px] flex-1 text-[12px] text-[#55657D]">0 = tanpa cadangan. Target utama per sub SLS mengikuti kolom Jumlah KK Sampel Stage 2 pada alokasi. Jatah cadangan berbeda tiap survei.</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
            <Chip w="navy">{fmt(data.total.subsls)} sub SLS</Chip>
            <Chip w="ok">{fmt(data.total.utama)} / {fmt(data.total.target)} sampel utama</Chip>
            <Chip w="navy">{fmt(data.total.cadangan)} cadangan</Chip>
            <Chip w="navy">{fmt(data.total.selesai_ditag)} sub SLS utama lengkap</Chip>
            {data.total.didata > 0 && <Chip w="ok">{fmt(data.total.didata)} didata</Chip>}
          </div>
        </>
      )}

      {pratinjau && berkas && (
        <div className="mt-4 rounded-xl border border-[#CBD6E6] bg-[#F9FBFF] p-3.5">
          <p className="text-[13.5px] font-bold text-[#1B2B4B]">Pratinjau: {berkas.nama}</p>
          <fieldset className="mt-2 grid gap-2 sm:grid-cols-2" disabled={sibuk !== ""}>
            {([["tambah", "Tambah (aman)", "Menambah tag baru; KK yang sudah bertag dengan peran berbeda dianggap konflik dan ditolak."], ["ganti", "Ganti", "Sub SLS yang ada di berkas disamakan dengan berkas: tag lain di sub SLS itu dilepas (riwayat tetap)."]] as const).map(([k, judul, ket]) => (
              <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-[12.5px] ${mode === k ? "border-[#12305E] bg-white" : "border-[#DDE6F3] bg-white"}`}>
                <input type="radio" name={`modetag-${kegiatanId}`} className="mt-0.5 h-4 w-4 accent-[#12305E]" checked={mode === k} onChange={() => void ubahMode(k)} />
                <span>
                  <b className="text-[#1B2B4B]">{judul}</b>
                  <span className="mt-0.5 block text-[#55657D]">{ket}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-2 text-[12.5px] text-[#55657D]">
            {fmt(pratinjau.ringkas.dibaca)} baris dibaca · {fmt(pratinjau.ringkas.sampel)} KK bertanda sampel di {fmt(pratinjau.ringkas.subsls)} sub SLS · {fmt(pratinjau.ringkas.baru)} baru · {fmt(pratinjau.ringkas.sama)} sudah sama · {fmt(pratinjau.ringkas.ganti_peran)} ganti peran · {fmt(pratinjau.ringkas.dilepas)} dilepas
          </p>
          {pratinjau.alasan_tolak && <div className="mt-2"><Pesan jenis="peringatan">{pratinjau.alasan_tolak}</Pesan></div>}
          {pratinjau.galat.length > 0 && (
            <div className="mt-2">
              <Pesan>{fmt(pratinjau.galat.length)} masalah, tag belum bisa disimpan. Perbaiki di Excel lalu pilih berkas lagi.</Pesan>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-[12.5px] text-[#B42329]">
                {pratinjau.galat.map((g, i) => (
                  <li key={i}>{g.baris > 0 ? `Baris ${g.baris}: ` : ""}{g.pesan}</li>
                ))}
              </ul>
            </div>
          )}
          {pratinjau.peringatan.length > 0 && (
            <details className="mt-2" open={pratinjau.peringatan.length <= 6}>
              <summary className="cursor-pointer text-[12.5px] font-semibold text-[#8A6200]">{fmt(pratinjau.peringatan.length)} peringatan (tidak menghalangi simpan)</summary>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-[12.5px] text-[#8A6200]">
                {pratinjau.peringatan.map((g, i) => (
                  <li key={i}>{g.pesan}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" className={BTN} disabled={!pratinjau.bisa_simpan || sibuk !== ""} onClick={() => void simpanBerkas()}>
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan tag"}
            </button>
            <button type="button" className={BTN_O} disabled={sibuk !== ""} onClick={() => { setBerkas(null); setPratinjau(null); }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {data && data.siap && perPpl.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Progres per PPL</p>
          {perPpl.map((g) => {
            const u = g.sub.reduce((s, p) => s + p.utama, 0);
            const t = g.sub.reduce((s, p) => s + p.target, 0);
            return (
              <details key={g.ppl} className="rounded-xl border border-[#DDE6F3] bg-white">
                <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-[#1B2B4B]">
                  {g.ppl} <span className="font-normal text-[#55657D]">· {g.sub.length} sub SLS · utama {fmt(u)}/{fmt(t)}</span>
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full min-w-[520px] text-left text-[12.5px]">
                    <thead>
                      <tr>
                        <th className={TH}>Sub SLS</th>
                        <th className={TH}>NKS</th>
                        <th className={TH}>Nagari · Jorong</th>
                        <th className={TH}>Utama</th>
                        <th className={TH}>Cadangan</th>
                        <th className={TH}>Hasil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.sub.map((p) => (
                        <tr key={p.idsubsls}>
                          <td className={`${TD} font-mono`} title={p.idsubsls}>{kodeSubslsPendek(p.idsubsls)}</td>
                          <td className={TD}>{p.nks ?? "-"}</td>
                          <td className={TD}>{p.nagari} · {p.sls}</td>
                          <td className={TD}>{p.utama}/{p.target}</td>
                          <td className={TD}>{data.konfig.cadangan_per_sls > 0 ? `${p.cad}/${data.konfig.cadangan_per_sls}` : "-"}</td>
                          <td className={TD}>{p.didata + p.menolak + p.tidak_ditemukan > 0 ? `${p.didata} didata · ${p.menolak} menolak · ${p.tidak_ditemukan} tdk ditemukan` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {data && data.siap && data.riwayat.length > 0 && (
        <details className="mt-3 text-[12.5px]">
          <summary className="cursor-pointer font-semibold text-[#12305E]">Riwayat jendela ({data.riwayat.length})</summary>
          <ul className="mt-1 space-y-0.5 text-[#55657D]">
            {data.riwayat.map((r) => (
              <li key={r.id}>
                {waktu(r.dibuka_at)} → {waktu(r.ditutup_awal_at ?? r.ditutup_at)} WIB · {r.dibuka_oleh ?? "-"}
                {r.ditutup_awal_at ? ` · ditutup lebih awal${r.ditutup_oleh ? ` oleh ${r.ditutup_oleh}` : ""}` : ""}
                {r.buka_kembali ? ` · buka kembali: ${r.alasan ?? "-"}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Kartu>
  );
}
