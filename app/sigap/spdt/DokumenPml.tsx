"use client";

// app/sigap/spdt/DokumenPml.tsx
//
// (30 Okt 2026) Tab "Dokumen" untuk PML SPDT NTP: unggah PDF scan hasil pemeriksaan; Supervisor mengunduhnya di tab yang sama. Hanya milik SPDT NTP
// (Pendataan Pascabencana tidak memakai fitur ini). Unggah lewat /api/portal/spdt-dokumen; isi PDF yang sama tidak tercatat dua kali, jadi aman diulang
// bila sinyal putus. Dokumen bisa "ditarik" dari daftar (berkas tetap tersimpan di server).

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { MAKS_BYTE_DOKUMEN, MAKS_JUDUL, MAKS_KETERANGAN, labelUkuran, labelWilayah, periksaUkuranDokumen, type DokumenPeriksa } from "@/lib/dokumenPeriksa";
import { API_SPDT_DOKUMEN } from "@/lib/spdtNtp";

const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const waktuWib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":") + " WIB";
const tanggalHariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const KOTAK = "mt-1 min-h-[44px] w-full rounded-[10px] border border-[#DCE5F2] bg-white px-2.5 text-[14px] text-[#1B2B4B] outline-none";

export default function DokumenPml() {
  const [daftar, setDaftar] = useState<DokumenPeriksa[] | null>(null);
  const [wilayah, setWilayah] = useState<string[]>([]);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [pilihWilayah, setPilihWilayah] = useState("");
  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [mengunggah, setMengunggah] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [tarikId, setTarikId] = useState<number | null>(null);
  const [sibukId, setSibukId] = useState<number | null>(null);
  const masukan = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    setGalatMuat(null);
    try {
      const r = await apiPortal<{ dokumen: DokumenPeriksa[]; wilayah: string[] }>(API_SPDT_DOKUMEN);
      setDaftar(r.dokumen);
      setWilayah(r.wilayah ?? []);
    } catch (e) {
      setGalatMuat(pesanGalat(e));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

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
      form.set("wilayah", pilihWilayah);
      form.set("tanggal_periksa", tanggal);
      const res = await fetch(API_SPDT_DOKUMEN, { method: "POST", body: form, headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; duplikat?: boolean; error?: string };
      if (res.status === 401) throw new Error("Sesi berakhir. Silakan masuk kembali.");
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Gagal mengunggah (${res.status}).`);
      setPesan({ jenis: "ok", teks: j.duplikat ? "Dokumen ini sudah pernah diunggah, tidak dicatat dua kali." : "Dokumen terunggah. Supervisor dapat mengunduhnya." });
      setBerkas(null);
      setJudul("");
      setKeterangan("");
      setPilihWilayah("");
      if (masukan.current) masukan.current.value = "";
      await muat();
    } catch (e) {
      setPesan({ jenis: "galat", teks: e instanceof TypeError ? "Tidak ada sambungan. Coba lagi saat sinyal ada." : pesanGalat(e) });
    } finally {
      setMengunggah(false);
    }
  };

  const unduh = async (d: DokumenPeriksa) => {
    setSibukId(d.id);
    setPesan(null);
    try {
      const r = await apiPortal<{ url: string }>(`${API_SPDT_DOKUMEN}?unduh=${d.id}`);
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
      await apiPortal(API_SPDT_DOKUMEN, { method: "POST", body: JSON.stringify({ aksi: "tarik", id: d.id }) });
      setTarikId(null);
      setPesan({ jenis: "ok", teks: "Dokumen ditarik dari daftar." });
      await muat();
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibukId(null);
    }
  };

  return (
    <div className="space-y-2.5 p-2.5">
      <section className="rounded-[18px] bg-white p-4 shadow-[0_6px_18px_rgba(15,42,82,.08)]" aria-label="Unggah dokumen hasil pemeriksaan">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Unggah hasil pemeriksaan</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-[#55657D]">
          Scan dokumen hasil pemeriksaan menjadi satu berkas PDF (maks {labelUkuran(MAKS_BYTE_DOKUMEN)}), lalu unggah di sini. Supervisor SPDT NTP dapat mengunduhnya.
        </p>
        <div className="mt-3 space-y-2.5">
          <label className="block text-[12px] font-bold text-[#0F2A52]">
            Berkas PDF
            <input
              ref={masukan}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => pilihBerkas(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-[13px] text-[#1B2B4B] file:mr-3 file:min-h-[44px] file:rounded-[10px] file:border-0 file:bg-[#1F5FD1] file:px-3.5 file:text-[13px] file:font-bold file:text-white"
            />
          </label>
          {berkas && <p className="break-all text-[12px] text-[#55657D]">{berkas.name} · {labelUkuran(berkas.size)}</p>}
          <label className="block text-[12px] font-bold text-[#0F2A52]">
            Judul <span className="font-normal text-[#6B7A90]">(kosong = nama berkas)</span>
            <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={MAKS_JUDUL} placeholder="mis. Hasil pemeriksaan Jorong Kayu Aro" className={KOTAK} />
          </label>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block text-[12px] font-bold text-[#0F2A52]">
              Jorong <span className="font-normal text-[#6B7A90]">(opsional)</span>
              <select value={pilihWilayah} onChange={(e) => setPilihWilayah(e.target.value)} className={KOTAK}>
                <option value="">Semua / tidak spesifik</option>
                {wilayah.map((w) => <option key={w} value={w}>{labelWilayah(w)}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-bold text-[#0F2A52]">
              Tanggal pemeriksaan
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={KOTAK} />
            </label>
          </div>
          <label className="block text-[12px] font-bold text-[#0F2A52]">
            Keterangan <span className="font-normal text-[#6B7A90]">(opsional)</span>
            <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} maxLength={MAKS_KETERANGAN} rows={2} className="mt-1 w-full rounded-[10px] border border-[#DCE5F2] bg-white px-2.5 py-2 text-[14px] text-[#1B2B4B] outline-none" />
          </label>
          <button type="button" onClick={unggah} disabled={!berkas || mengunggah} className="min-h-[48px] w-full rounded-[12px] bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:opacity-50">
            {mengunggah ? "Mengunggah…" : "Unggah dokumen"}
          </button>
        </div>
        {pesan && (
          <p role={pesan.jenis === "galat" ? "alert" : "status"} className={`mt-3 rounded-[12px] border-l-4 px-3 py-2 text-[13px] ${pesan.jenis === "ok" ? "border-[#13794B] bg-[#E3F6EC] text-[#0F5C39]" : "border-[#B42329] bg-[#FDE8E8] text-[#7A1D22]"}`}>{pesan.teks}</p>
        )}
      </section>

      <section className="rounded-[18px] bg-white p-4 shadow-[0_6px_18px_rgba(15,42,82,.08)]" aria-label="Dokumen yang sudah diunggah">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Dokumen saya{daftar ? ` (${daftar.length})` : ""}</h2>
        {galatMuat && (
          <p role="alert" className="mt-2 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
            {galatMuat} <button type="button" onClick={() => void muat()} className="font-bold underline">Coba lagi</button>
          </p>
        )}
        {!daftar && !galatMuat && <div className="mt-3 h-16 animate-pulse rounded bg-[#EEF2F7]" aria-busy="true" />}
        {daftar && daftar.length === 0 && <p className="mt-2 text-[13px] text-[#55657D]">Belum ada dokumen terunggah.</p>}
        {daftar && daftar.length > 0 && (
          <ul className="mt-1 divide-y divide-[#E8EDF5]">
            {daftar.map((d) => (
              <li key={d.id} className="py-2.5">
                <b className="block break-words text-[13.5px] text-[#0F2A52]">{d.judul}</b>
                <span className="block text-[12px] text-[#55657D]">
                  {waktuWib(d.diunggah_at)} · {labelUkuran(d.ukuran_byte)}
                  {d.tanggal_periksa ? ` · periksa ${d.tanggal_periksa}` : ""}
                  {d.wilayah ? ` · ${labelWilayah(d.wilayah)}` : ""}
                </span>
                {d.keterangan && <span className="block break-words text-[12px] text-[#6B7A90]">{d.keterangan}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void unduh(d)} disabled={sibukId === d.id} className="min-h-[40px] rounded-[10px] border border-[#CBD6E6] bg-white px-3.5 text-[12.5px] font-bold text-[#1B2B4B] disabled:opacity-50">Unduh</button>
                  {tarikId === d.id ? (
                    <>
                      <button type="button" onClick={() => void tarik(d)} disabled={sibukId === d.id} className="min-h-[40px] rounded-[10px] bg-[#B42329] px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50">Ya, tarik</button>
                      <button type="button" onClick={() => setTarikId(null)} className="min-h-[40px] rounded-[10px] border border-[#CBD6E6] bg-white px-3.5 text-[12.5px] font-bold text-[#1B2B4B]">Batal</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setTarikId(d.id)} className="min-h-[40px] rounded-[10px] px-2.5 text-[12.5px] font-bold text-[#B42329]">Tarik</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
