"use client";

// app/sigap/pelatihan/kelola/suratUndangan.tsx
//
// (9 Nov 2026) Kartu "Surat undangan" di Kelola Pelatihan > Komunikasi > Undangan & tampilan. Satu surat AKTIF per kelas (PDF yang terbit di luar SIGAP +
// nomor, tanggal, perihal wajib). Mengunggah lagi = surat lama menjadi riwayat dengan alasan. Surat aktif menjadi lampiran Laporan Pelatihan dan
// Laporan Pelatihan Instruktur, dan memenuhi butir Kesiapan "Undangan bernomor". API: /api/sigap/pelatihan/administrasi/surat.
// Catatan: nomor surat luar tetap dicatat di Arsip & penomoran (Catat nomor luar) supaya urutan nomor tidak bentrok.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";

const URL_SURAT = "/api/sigap/pelatihan/administrasi/surat";
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (t: string) => (t ? `${Number(t.slice(8, 10))} ${BLN[Number(t.slice(5, 7)) - 1] ?? ""} ${t.slice(0, 4)}` : "");

type Surat = { id: number; kelas: number; nomor: string; tanggal: string; perihal: string; dibuat_oleh: string | null; dibuat_at: string; diganti_at: string | null; alasan_ganti: string | null };
type Data = { tersedia: boolean; aktif: Surat | null; riwayat: Surat[]; url_aktif: string | null; boleh_kelola: boolean };
type Ringkas = { kelas: number[]; boleh_kelola: boolean };

export default function KartuSuratUndangan() {
  const [kelasDaftar, setKelasDaftar] = useState<number[] | null>(null);
  const [kelas, setKelas] = useState<number>(0);
  const [d, setD] = useState<Data | null>(null);
  const [form, setForm] = useState({ nomor: "", tanggal: "", perihal: "", alasan: "" });
  const [berkas, setBerkas] = useState<File | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [kunciInput, setKunciInput] = useState(0);

  useEffect(() => {
    if (!bacaSesi()) return;
    fetchJson<Ringkas>("/api/sigap/pelatihan/administrasi?bagian=ringkas")
      .then((r) => {
        setKelasDaftar(r.kelas);
        setKelas((k) => k || r.kelas[0] || 0);
      })
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
        setKelasDaftar([]);
      });
  }, []);

  const muat = useCallback(async () => {
    if (!kelas) return;
    try {
      setD(await fetchJson<Data>(`${URL_SURAT}?kelas=${kelas}`));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }, [kelas]);
  useEffect(() => {
    setD(null);
    void muat();
  }, [muat]);

  async function unggah() {
    const s = bacaSesi();
    if (!s || !berkas) return;
    setSibuk(true);
    setPesan(null);
    try {
      const fd = new FormData();
      fd.append("kelas", String(kelas));
      fd.append("nomor", form.nomor);
      fd.append("tanggal", form.tanggal);
      fd.append("perihal", form.perihal);
      fd.append("alasan", form.alasan);
      fd.append("file", berkas);
      const res = await fetch(urlPelatihan(URL_SURAT), { method: "POST", headers: { Authorization: `Bearer ${s}` }, body: fd });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Gagal mengunggah (${res.status}).`);
      setForm({ nomor: "", tanggal: "", perihal: "", alasan: "" });
      setBerkas(null);
      setKunciInput((n) => n + 1);
      setPesan({ jenis: "ok", teks: "Surat undangan tersimpan dan menjadi lampiran laporan kelas ini." });
      await muat();
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  async function bukaRiwayat(id: number) {
    try {
      const r = await fetchJson<{ url: string }>(`${URL_SURAT}?kelas=${kelas}&id=${id}`);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  if (kelasDaftar === null) return <Kartu judul="Surat undangan"><Memuat /></Kartu>;
  if (kelasDaftar.length === 0) return <Kartu judul="Surat undangan"><p className="text-[13px] text-[#6B7A90]">Anda belum ditetapkan pada kelas mana pun.</p></Kartu>;

  const bisa = d?.boleh_kelola === true;
  const ganti = !!d?.aktif;
  const siap = !!berkas && form.nomor.trim() && form.tanggal && form.perihal.trim() && (!ganti || form.alasan.trim());

  return (
    <Kartu judul="Surat undangan" ket="Satu surat aktif per kelas. Menjadi lampiran Laporan Pelatihan dan Laporan Instruktur.">
      {kelasDaftar.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {kelasDaftar.map((k) => (
            <button key={k} type="button" className={k === kelas ? BTN : BTN_O} onClick={() => setKelas(k)}>
              Kelas {k}
            </button>
          ))}
        </div>
      )}
      {pesan && (
        <div className="mb-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}
      {!d ? (
        <Memuat />
      ) : !d.tersedia ? (
        <Pesan jenis="info">Tabel surat undangan belum dipasang (SQL 20261109c_pelatihan_surat_undangan.sql belum dijalankan).</Pesan>
      ) : (
        <div className="space-y-3">
          {d.aktif ? (
            <div className="rounded-xl border border-[#BFE3CF] bg-[#EEF8F2] p-3 text-[13px] text-[#1B2B4B]">
              <p className="font-bold text-[#1E7A4C]">✓ Kelas {kelas}: surat undangan aktif</p>
              <p className="mt-1"><b>{d.aktif.nomor}</b> · {tgl(d.aktif.tanggal)}</p>
              <p className="text-[#55657D]">{d.aktif.perihal}</p>
              <p className="mt-1 text-[12px] text-[#6B7A90]">Diunggah {d.aktif.dibuat_oleh ?? "-"}</p>
              {d.url_aktif && (
                <a className={`${BTN_O} mt-2`} href={d.url_aktif} target="_blank" rel="noopener noreferrer">
                  Buka PDF
                </a>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-[#F1D9A6] bg-[#FFF8E8] p-3 text-[13px] font-semibold text-[#8A6200]">Kelas {kelas}: belum ada surat undangan.</p>
          )}

          {bisa && (
            <div className="space-y-2 border-t border-[#EDF0F4] pt-3">
              <b className="text-[13px]">{ganti ? "Ganti surat undangan" : "Unggah surat undangan"}</b>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={INPUT} placeholder="Nomor surat (wajib)" maxLength={80} value={form.nomor} onChange={(e) => setForm({ ...form, nomor: e.target.value })} />
                <input className={INPUT} type="date" aria-label="Tanggal surat" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
              </div>
              <input className={`${INPUT} w-full`} placeholder="Perihal (wajib)" maxLength={200} value={form.perihal} onChange={(e) => setForm({ ...form, perihal: e.target.value })} />
              {ganti && <input className={`${INPUT} w-full`} placeholder="Alasan penggantian (wajib)" maxLength={200} value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })} />}
              <input key={kunciInput} type="file" accept="application/pdf,.pdf" className="block w-full text-[12.5px]" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
              <p className="text-[12px] text-[#6B7A90]">PDF maksimal 10 MB. Nomor surat luar tetap dicatat di Arsip &amp; penomoran (Catat nomor luar) agar urutan nomor tidak bentrok.</p>
              <button type="button" className={BTN} disabled={sibuk || !siap} onClick={unggah}>
                {sibuk ? "Mengunggah…" : ganti ? "⬆ Ganti surat" : "⬆ Unggah surat"}
              </button>
            </div>
          )}

          {d.riwayat.length > 0 && (
            <details className="border-t border-[#EDF0F4] pt-2 text-[12.5px]">
              <summary className="cursor-pointer font-semibold text-[#55657D]">Riwayat surat sebelumnya ({d.riwayat.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {d.riwayat.map((r) => (
                  <li key={r.id} className="rounded-lg bg-[#F8FAFC] p-2">
                    <b>{r.nomor}</b> · {tgl(r.tanggal)} · {r.perihal}
                    <span className="block text-[#6B7A90]">Diganti{r.diganti_at ? ` ${tgl(r.diganti_at.slice(0, 10))}` : ""}{r.alasan_ganti ? `: ${r.alasan_ganti}` : ""}</span>
                    <button type="button" className="mt-1 font-semibold text-[#1F5FD1] underline" onClick={() => bukaRiwayat(r.id)}>
                      Buka PDF
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Kartu>
  );
}
