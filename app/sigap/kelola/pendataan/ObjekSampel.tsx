"use client";

// app/sigap/kelola/pendataan/ObjekSampel.tsx
//
// (8 Nov 2026, D1+D2) Daftar objek sampel model 2/3: unduh templat menurut PROFIL, unggah Excel, PRATINJAU (pembacaan baris, kode/nama wilayah vs master, pencocokan petugas,
// susunan tim), simpan; ringkasan daftar aktif dan hasil per PPL. Unggah ulang MENGGANTIKAN daftar aktif. Pembacaan Excel di peramban; pemeriksaan dan penyimpanan di server
// (lib/portal/sampelObjek.ts, migrasi 20261108a). Dipasang oleh ModelSampel hanya setelah profil tersimpan.

import { useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_OBJEK_ADMIN, MAKS_BARIS_OBJEK, kolomProfil, petunjukTemplatObjek, ringkasProfil, templatObjek, type DataObjekAdmin } from "@/lib/sampelObjek";
import type { HasilImporObjek, PratinjauObjek } from "@/lib/portal/sampelObjek";
import { LABEL_PERAN_TIM } from "@/lib/timSampel";
import { BTN, BTN_O, Chip, Kartu, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
type Berkas = { nama: string; baris: Record<string, unknown>[] };
type Info = { jenis: "ok" | "galat" | "info" | "peringatan"; teks: string };

const huruf = (i: number) => String.fromCharCode(65 + i);

async function unduhTemplat(profil: NonNullable<DataObjekAdmin["profil"]>, namaKegiatan: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templatObjek(profil));
  const kol = kolomProfil(profil);
  // kolom wilayah sebagai teks: kode panjang tidak boleh menjadi notasi ilmiah
  kol.forEach((k, i) => {
    if (k.kunci === "kecamatan" || k.kunci === "nagari" || k.kunci === "sls" || k.kunci === "sub_sls") {
      for (const sel of Object.keys(ws)) if (new RegExp(`^${huruf(i)}\\d+$`).test(sel) && sel !== `${huruf(i)}1`) (ws[sel] as { t: string }).t = "s";
    }
  });
  ws["!cols"] = kol.map((k) => ({ wch: Math.max(14, k.judul.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, "Templat");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Petunjuk"], ...petunjukTemplatObjek(profil).map((t) => [t])]), "Petunjuk");
  XLSX.writeFile(wb, `templat_sampel_${namaKegiatan.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30) || "kegiatan"}.xlsx`);
}

async function bacaBerkas(file: File): Promise<Berkas> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const nama = wb.SheetNames.find((n) => n.toLowerCase() !== "petunjuk") ?? wb.SheetNames[0];
  if (!nama) throw new Error("Berkas tidak berisi lembar.");
  const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: false });
  return { nama: file.name, baris };
}

export default function ObjekSampel({ kegiatanId, nama, data, muat }: { kegiatanId: number; nama: string; data: DataObjekAdmin; muat: () => Promise<void> }) {
  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauObjek | null>(null);
  const [sibuk, setSibuk] = useState<"" | "baca" | "simpan">("");
  const [info, setInfo] = useState<Info | null>(null);
  const [otomatis, setOtomatis] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const profil = data.profil;
  const kelola = data.boleh_kelola === true && data.siap && !!profil;
  const berwilayah = !!profil?.level;
  const persen = data.rekap.objek > 0 ? Math.round(((data.hasil.objek - data.hasil.belum) / data.hasil.objek) * 100) : 0;
  const kolom = useMemo(() => (profil ? kolomProfil(profil) : []), [profil]);

  const hitung = (b: Berkas, oto: boolean) => apiPortal<PratinjauObjek>(API_OBJEK_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "pratinjau", k: kegiatanId, baris: b.baris, otomatis: oto }) });

  async function pilihBerkas(file: File | undefined) {
    if (!file) return;
    setSibuk("baca");
    setInfo(null);
    setPratinjau(null);
    try {
      const b = await bacaBerkas(file);
      if (b.baris.length > MAKS_BARIS_OBJEK) throw new Error(`Berkas memuat ${fmt(b.baris.length)} baris; batas satu unggahan ${fmt(MAKS_BARIS_OBJEK)}.`);
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
      const r = await apiPortal<HasilImporObjek>(API_OBJEK_ADMIN, { method: "POST", body: JSON.stringify({ aksi: "impor", k: kegiatanId, baris: berkas.baris, nama_berkas: berkas.nama, otomatis }) });
      const tambahan = r.tim > 0 ? ` Susunan tim tersimpan (${fmt(r.tim)} orang), ${fmt(r.penugasan_baru)} ditugaskan baru.` : "";
      setInfo({ jenis: "ok", teks: `Daftar sampel tersimpan: ${fmt(r.jumlah)} baris (${fmt(r.jumlah_sampel)} sampel, ${fmt(r.dengan_petugas)} baris sudah berpetugas).${tambahan}` });
      setBerkas(null);
      setPratinjau(null);
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Daftar sampel gagal disimpan." });
    } finally {
      setSibuk("");
    }
  }

  if (!profil) return null;

  return (
    <Kartu
      judul="Daftar sampel"
      ket={`${ringkasProfil(profil)}. Kolom templat: ${kolom.map((k) => k.judul).join(", ")}. Berkas yang sama menetapkan petugas (alokasi dini boleh dikosongkan). Petugas melihatnya di HP dan mencatat hasil per sampel.`}
      kanan={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={() => void unduhTemplat(profil, nama)}>
            Unduh templat Excel
          </button>
          <button type="button" className={BTN} disabled={!kelola || sibuk !== ""} onClick={() => input.current?.click()}>
            {sibuk === "baca" ? "Membaca…" : "Pilih berkas Excel…"}
          </button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void pilihBerkas(e.target.files?.[0])} />
        </div>
      }
    >
      {!data.boleh_kelola && <Pesan jenis="info">Anda hanya dapat melihat daftar sampel; mengunggah memerlukan akses kelola.</Pesan>}
      {info && <Pesan jenis={info.jenis}>{info.teks}</Pesan>}

      {kelola && (
        <label className="mt-3 flex items-start gap-2 text-[12.5px] text-[#1B2B4B]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#12305E]" checked={otomatis} disabled={sibuk !== ""} onChange={(e) => void ubahOtomatis(e.target.checked)} />
          <span>
            <b>Tugaskan otomatis</b> petugas yang namanya ada di berkas tetapi belum ditugaskan pada kegiatan ini, dan simpan susunan atasannya. Tanpa centang, nama hanya dicocokkan ke petugas yang sudah ditugaskan di tab Tim.
          </span>
        </label>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
        <Chip w="navy">{fmt(data.rekap.objek)} baris</Chip>
        <Chip w="navy">{fmt(data.rekap.sampel)} sampel</Chip>
        {berwilayah && <Chip w="navy">{fmt(data.rekap.wilayah)} wilayah</Chip>}
        <Chip w="navy">{fmt(data.rekap.ppl)} PPL</Chip>
        <Chip w="navy">{fmt(data.rekap.pml)} PML</Chip>
        {data.tanpa_petugas > 0 && <Chip w="wait">{fmt(data.tanpa_petugas)} baris belum berpetugas</Chip>}
      </div>
      {data.rekap.objek > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
          <Chip w="ok">{fmt(data.hasil.didata)} didata ({fmt(data.hasil.sampel_didata)} sampel)</Chip>
          <Chip w="wait">{fmt(data.hasil.menolak)} menolak</Chip>
          <Chip w="wait">{fmt(data.hasil.tidak_ditemukan)} tidak ditemukan</Chip>
          <Chip w="mut">{fmt(data.hasil.belum)} belum dicatat</Chip>
          <span className="self-center text-[#55657D]">{persen}% sudah ada hasil</span>
        </div>
      )}

      {pratinjau && berkas && (
        <div className="mt-4 rounded-xl border border-[#CBD6E6] bg-[#F9FBFF] p-3.5">
          <p className="text-[13.5px] font-bold text-[#1B2B4B]">Pratinjau: {berkas.nama}</p>
          <p className="mt-0.5 text-[12.5px] text-[#55657D]">
            {fmt(pratinjau.baris_berkas)} baris dibaca{pratinjau.dilewati > 0 ? `, ${fmt(pratinjau.dilewati)} kosong dilewati` : ""} · {fmt(pratinjau.rekap.sampel)} sampel
            {berwilayah ? ` · ${fmt(pratinjau.rekap.wilayah)} wilayah` : ""} · {fmt(pratinjau.rekap.ppl)} PPL · {fmt(pratinjau.rekap.pml)} PML
            {pratinjau.rekap.tanpa_petugas > 0 ? ` · ${fmt(pratinjau.rekap.tanpa_petugas)} baris belum berpetugas` : ""}
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
              <p className="mt-1 text-[#55657D]">Penugasan tidak ditambah (pilihan &ldquo;Tugaskan otomatis&rdquo; mati); hanya susunan atasan dan daftar sampel yang disimpan.</p>
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
              <Pesan>{fmt(pratinjau.galat_total)} masalah pada berkas, daftar sampel belum bisa disimpan. Perbaiki di Excel lalu pilih berkas lagi.</Pesan>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-[12.5px] text-[#B42329]">
                {pratinjau.galat.map((g, i) => (
                  <li key={i}>
                    {g.baris > 0 ? `Baris ${g.baris}: ` : ""}
                    {g.pesan}
                  </li>
                ))}
                {pratinjau.galat_total > pratinjau.galat.length && <li>… dan {fmt(pratinjau.galat_total - pratinjau.galat.length)} lainnya.</li>}
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

          {pratinjau.catatan.length > 0 && (
            <div className="mt-2">
              <Pesan jenis="peringatan">Periksa sebelum menyimpan (tidak menghalangi penyimpanan):</Pesan>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#8A6200]">
                {pratinjau.catatan.map((a, i) => (
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
                      <th className={TH}>Baris</th>
                      <th className={TH}>Sampel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pratinjau.ringkas_ppl.map((p, i) => (
                      <tr key={i}>
                        <td className={TD}>{p.ppl_nama}</td>
                        <td className={TD}>{p.pml_nama}</td>
                        <td className={TD}>{fmt(p.objek)}</td>
                        <td className={TD}>{fmt(p.sampel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {pratinjau.jumlah_lama > 0 && <p className="mt-2 text-[12.5px] text-[#55657D]">Menyimpan akan menggantikan {fmt(pratinjau.jumlah_lama)} baris aktif sekarang (riwayat dan hasil lama tetap tercatat, tetapi tidak lagi tampil di HP petugas).</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={!pratinjau.bisa_simpan || !kelola || sibuk !== ""} onClick={() => void simpan()}>
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan daftar sampel"}
            </button>
            <button type="button" className={BTN_O} disabled={sibuk !== ""} onClick={() => { setBerkas(null); setPratinjau(null); }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {data.ringkas_ppl.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Per PPL saat ini</p>
          <div className="overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>PPL</th>
                  <th className={TH}>PML</th>
                  <th className={TH}>Baris</th>
                  <th className={TH}>Sampel</th>
                  <th className={TH}>Didata</th>
                  <th className={TH}>Menolak</th>
                  <th className={TH}>Tidak ditemukan</th>
                  <th className={TH}>Belum</th>
                </tr>
              </thead>
              <tbody>
                {data.ringkas_ppl.map((p) => (
                  <tr key={p.ppl_id}>
                    <td className={TD}>{p.ppl_nama}</td>
                    <td className={TD}>{p.pml_nama ?? "-"}</td>
                    <td className={TD}>{fmt(p.objek)}</td>
                    <td className={TD}>{fmt(p.sampel)}</td>
                    <td className={TD}>{fmt(p.didata)}{p.sampel_didata !== p.didata ? ` (${fmt(p.sampel_didata)} sampel)` : ""}</td>
                    <td className={TD}>{fmt(p.menolak)}</td>
                    <td className={TD}>{fmt(p.tidak_ditemukan)}</td>
                    <td className={TD}>{fmt(p.belum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.riwayat.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Riwayat unggahan ({data.riwayat.length})</summary>
          <div className="mt-1.5 overflow-auto rounded-lg border border-[#DDE6F3] bg-white">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>Waktu</th>
                  <th className={TH}>Berkas</th>
                  <th className={TH}>Oleh</th>
                  <th className={TH}>Baris</th>
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
                      {fmt(r.jumlah)} ({fmt(r.jumlah_sampel)} sampel, {fmt(r.dengan_petugas)} berpetugas)
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
