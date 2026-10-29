"use client";

// app/sigap/pendataan/DokumenPeriksa.tsx
//
// (29 Okt 2026) Khusus PML: unggah PDF scan dokumen hasil pemeriksaan dari Lembar Pendataan. Admin/supervisor mengunduhnya di Kelola Pendataan > QC >
// Dokumen pemeriksaan. Daftar baru dimuat saat kartu dibuka (tidak menambah permintaan berkala). Unggah lewat /api/portal/pendataan/dokumen;
// isi PDF yang sama tidak tercatat dua kali, jadi aman diulang bila sinyal putus. Dokumen bisa "ditarik" (berkas tetap tersimpan di server).

import { useCallback, useRef, useState } from "react";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { MAKS_BYTE_DOKUMEN, MAKS_JUDUL, MAKS_KETERANGAN, labelUkuran, periksaUkuranDokumen, type DokumenPeriksa } from "@/lib/dokumenPeriksa";
import type { SubTim } from "@/lib/pendataan";

const API = "/api/portal/pendataan/dokumen";
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

const waktuWib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":") + " WIB";
const tanggalHariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const namaSub = (s: SubTim) => `${s.nagari} · SLS ${s.sls} Sub ${s.sub_sls}`;

export default function DokumenPeriksa({ sub }: { sub: SubTim[] }) {
  const [buka, setBuka] = useState(false);
  const [daftar, setDaftar] = useState<DokumenPeriksa[] | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [idsubsls, setIdsubsls] = useState("");
  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [mengunggah, setMengunggah] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [tarikId, setTarikId] = useState<number | null>(null);
  const [sibukId, setSibukId] = useState<number | null>(null);
  const masukan = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    setGalatMuat(null);
    try {
      const r = await apiPortal<{ dokumen: DokumenPeriksa[] }>(API);
      setDaftar(r.dokumen);
    } catch (e) {
      setGalatMuat(pesanGalat(e));
    }
  }, []);

  const toggle = () => {
    const baru = !buka;
    setBuka(baru);
    if (baru && daftar === null) void muat();
  };

  const pilihBerkas = (f: File | null) => {
    setPesan(null);
    if (!f) return setBerkas(null);
    const salah = periksaUkuranDokumen(f.size);
    if (salah) {
      setBerkas(null);
      setPesan({ jenis: "galat", teks: salah });
      if (masukan.current) masukan.current.value = "";
      return;
    }
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setBerkas(null);
      setPesan({ jenis: "galat", teks: "Pilih berkas PDF hasil scan." });
      if (masukan.current) masukan.current.value = "";
      return;
    }
    setBerkas(f);
  };

  const unggah = async () => {
    if (!berkas || mengunggah) return;
    setMengunggah(true);
    setPesan(null);
    try {
      const sesi = bacaSesi();
      const form = new FormData();
      form.set("berkas", berkas);
      form.set("judul", judul);
      form.set("keterangan", keterangan);
      form.set("idsubsls", idsubsls);
      form.set("tanggal_periksa", tanggal);
      const res = await fetch(API, { method: "POST", body: form, headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; duplikat?: boolean; error?: string };
      if (res.status === 401) throw new Error("Sesi berakhir. Silakan masuk kembali.");
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Gagal mengunggah (${res.status}).`);
      setPesan({ jenis: "ok", teks: j.duplikat ? "Dokumen ini sudah pernah diunggah, tidak dicatat dua kali." : "Dokumen terunggah. Admin dapat mengunduhnya di menu QC." });
      setBerkas(null);
      setJudul("");
      setKeterangan("");
      setIdsubsls("");
      if (masukan.current) masukan.current.value = "";
      await muat();
    } catch (e) {
      const teks = e instanceof TypeError ? "Tidak ada sambungan. Coba lagi saat sinyal ada." : pesanGalat(e);
      setPesan({ jenis: "galat", teks });
    } finally {
      setMengunggah(false);
    }
  };

  const unduh = async (d: DokumenPeriksa) => {
    setSibukId(d.id);
    setPesan(null);
    try {
      const r = await apiPortal<{ url: string }>(`${API}?unduh=${d.id}`);
      window.location.href = r.url;
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibukId(null);
    }
  };

  const tarik = async (d: DokumenPeriksa) => {
    setSibukId(d.id);
    setPesan(null);
    try {
      await apiPortal(API, { method: "POST", body: JSON.stringify({ aksi: "tarik", id: d.id }) });
      setTarikId(null);
      setPesan({ jenis: "ok", teks: "Dokumen ditarik dari daftar." });
      await muat();
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibukId(null);
    }
  };

  const subNama = (id: string | null) => {
    const s = id ? sub.find((x) => x.idsubsls === id) : null;
    return s ? namaSub(s) : id;
  };

  return (
    <section className="overflow-hidden rounded-[20px] bg-white shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-label="Dokumen hasil pemeriksaan">
      <button type="button" onClick={toggle} aria-expanded={buka} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] text-[#0F2A52]">Dokumen hasil pemeriksaan</b>
          <small className="block text-[12px] text-[#55657D]">
            {daftar === null ? "Unggah PDF scan hasil pemeriksaan untuk admin." : daftar.length === 0 ? "Belum ada dokumen terunggah." : `${daftar.length} dokumen terunggah.`}
          </small>
        </span>
        <span aria-hidden className="text-[18px] font-bold text-[#6B7A90]">{buka ? "−" : "+"}</span>
      </button>

      {buka && (
        <div className="space-y-3 border-t border-[#E8EDF5] px-4 pb-4 pt-3">
          <p className="text-[12.5px] leading-snug text-[#0F2A52]">
            Khusus PML. Scan dokumen hasil pemeriksaan menjadi satu berkas PDF (maks {labelUkuran(MAKS_BYTE_DOKUMEN)}), lalu unggah di sini. Admin dan supervisor dapat mengunduhnya di menu Kelola Pendataan, tab QC.
          </p>

          <div className="space-y-2 rounded-[14px] bg-[#F5F8FE] p-3">
            <label className="block text-[12px] font-bold text-[#0F2A52]">
              Berkas PDF
              <input
                ref={masukan}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => pilihBerkas(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-[13px] text-[#1B2B4B] file:mr-3 file:min-h-[40px] file:rounded-lg file:border-0 file:bg-[#1F5FD1] file:px-3 file:text-[13px] file:font-semibold file:text-white"
              />
            </label>
            {berkas && <p className="text-[12px] text-[#55657D]">{berkas.name} · {labelUkuran(berkas.size)}</p>}
            <label className="block text-[12px] font-bold text-[#0F2A52]">
              Judul <span className="font-normal text-[#6B7A90]">(kosong = nama berkas)</span>
              <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={MAKS_JUDUL} placeholder="mis. Hasil pemeriksaan SLS 01" className="mt-1 min-h-[42px] w-full rounded-lg border border-[#DDE6F3] bg-white px-2.5 text-[14px] text-[#1B2B4B]" />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[12px] font-bold text-[#0F2A52]">
                Sub SLS <span className="font-normal text-[#6B7A90]">(opsional)</span>
                <select value={idsubsls} onChange={(e) => setIdsubsls(e.target.value)} className="mt-1 min-h-[42px] w-full rounded-lg border border-[#DDE6F3] bg-white px-2 text-[14px] text-[#1B2B4B]">
                  <option value="">Semua / tidak spesifik</option>
                  {sub.map((s) => <option key={s.idsubsls} value={s.idsubsls}>{namaSub(s)}</option>)}
                </select>
              </label>
              <label className="block text-[12px] font-bold text-[#0F2A52]">
                Tanggal pemeriksaan
                <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="mt-1 min-h-[42px] w-full rounded-lg border border-[#DDE6F3] bg-white px-2.5 text-[14px] text-[#1B2B4B]" />
              </label>
            </div>
            <label className="block text-[12px] font-bold text-[#0F2A52]">
              Keterangan <span className="font-normal text-[#6B7A90]">(opsional)</span>
              <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} maxLength={MAKS_KETERANGAN} rows={2} className="mt-1 w-full rounded-lg border border-[#DDE6F3] bg-white px-2.5 py-2 text-[14px] text-[#1B2B4B]" />
            </label>
            <button type="button" onClick={unggah} disabled={!berkas || mengunggah} className="min-h-[46px] w-full rounded-xl bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:opacity-50">
              {mengunggah ? "Mengunggah…" : "Unggah dokumen"}
            </button>
          </div>

          {pesan && (
            <p role={pesan.jenis === "galat" ? "alert" : "status"} className={`rounded-[12px] border-l-4 px-3 py-2 text-[13px] ${pesan.jenis === "ok" ? "border-[#13794B] bg-[#E3F6EC] text-[#0F5C39]" : "border-[#B42329] bg-[#FDE8E8] text-[#7A1D22]"}`}>{pesan.teks}</p>
          )}
          {galatMuat && <p role="alert" className="rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatMuat} <button type="button" onClick={() => void muat()} className="font-bold underline">Coba lagi</button></p>}

          {daftar && daftar.length > 0 && (
            <ul className="divide-y divide-[#E8EDF5]">
              {daftar.map((d) => (
                <li key={d.id} className="py-2.5">
                  <b className="block break-words text-[13.5px] text-[#0F2A52]">{d.judul}</b>
                  <span className="block text-[12px] text-[#55657D]">
                    {waktuWib(d.diunggah_at)} · {labelUkuran(d.ukuran_byte)}
                    {d.tanggal_periksa ? ` · periksa ${d.tanggal_periksa}` : ""}
                    {d.idsubsls ? ` · ${subNama(d.idsubsls)}` : ""}
                  </span>
                  {d.keterangan && <span className="block break-words text-[12px] text-[#6B7A90]">{d.keterangan}</span>}
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void unduh(d)} disabled={sibukId === d.id} className="min-h-[38px] rounded-lg border border-[#CBD6E6] bg-white px-3 text-[12.5px] font-bold text-[#1B2B4B] disabled:opacity-50">Unduh</button>
                    {tarikId === d.id ? (
                      <>
                        <button type="button" onClick={() => void tarik(d)} disabled={sibukId === d.id} className="min-h-[38px] rounded-lg bg-[#B42329] px-3 text-[12.5px] font-bold text-white disabled:opacity-50">Ya, tarik</button>
                        <button type="button" onClick={() => setTarikId(null)} className="min-h-[38px] rounded-lg border border-[#CBD6E6] bg-white px-3 text-[12.5px] font-bold text-[#1B2B4B]">Batal</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setTarikId(d.id)} className="min-h-[38px] rounded-lg px-2 text-[12.5px] font-bold text-[#B42329]">Tarik</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
