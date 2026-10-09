"use client";

// app/sigap/pelatihan/kelola/rapat.tsx
//
// (9 Okt 2026) Kelola Pelatihan > tab "Rapat Zoom": atur rapat (tanggal, jam, tautan, passcode, token hadir, sasaran) dan pantau kehadiran.
// Permintaan user: panel admin di Kelola; hadir sah bila petugas mengetik token. Tanpa hapus permanen: rapat dimatikan lewat "Aktif".
// Catat hadir manual wajib beralasan (tercatat di audit). Rekap dapat diunduh (CSV, terbuka di Excel).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Rapat } from "@/lib/sigapRapat";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";

const URL_API = "/api/sigap/rapat/admin";
const keInputWib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
const jamWib = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

type Baris = { akun_id: number; nama: string; peran: string; hadir_at: string | null; sumber: string | null; alasan: string | null };
type Data = { boleh_kelola: boolean; sekarang: string; daftar: Rapat[]; rekap: { rapat_id: number; baris: Baris[] } | null };

type Form = {
  id: number | null;
  judul: string;
  mulai_at: string;
  selesai_at: string;
  tautan: string;
  meeting_id: string;
  passcode: string;
  token: string;
  buka_menit: string;
  tutup_menit: string;
  sasaran_peran: "semua" | "ppl" | "pml";
  aktif: boolean;
};

const bentukDari = (r: Rapat): Form => ({
  id: r.id, judul: r.judul, mulai_at: keInputWib(r.mulai_at), selesai_at: keInputWib(r.selesai_at), tautan: r.tautan ?? "", meeting_id: r.meeting_id ?? "", passcode: r.passcode ?? "",
  token: r.token, buka_menit: String(r.buka_menit), tutup_menit: String(r.tutup_menit), sasaran_peran: r.sasaran_peran, aktif: r.aktif,
});
const FORM_BARU: Form = { id: null, judul: "Rapat Persiapan Pendataan", mulai_at: "", selesai_at: "", tautan: "", meeting_id: "", passcode: "", token: "psp2026", buka_menit: "15", tutup_menit: "30", sasaran_peran: "semua", aktif: false };

function statusRapat(r: Rapat, sk: number): { w: "ok" | "wait" | "mut"; teks: string } {
  if (!r.aktif) return { w: "mut", teks: "Nonaktif" };
  const buka = new Date(r.mulai_at).getTime() - r.buka_menit * 60_000;
  const tutup = new Date(r.selesai_at).getTime() + r.tutup_menit * 60_000;
  if (sk < buka) return { w: "wait", teks: "Terjadwal" };
  if (sk >= tutup) return { w: "mut", teks: "Selesai" };
  return { w: "ok", teks: "Presensi dibuka" };
}

export default function RapatKelola() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form>(FORM_BARU);
  const [pilihId, setPilihId] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [saring, setSaring] = useState<"semua" | "hadir" | "belum">("semua");
  const [manual, setManual] = useState<{ akun_id: number; alasan: string } | null>(null);

  const muat = useCallback(async (rapatId?: number | null, isiForm = false) => {
    try {
      const d = await fetchJson<Data>(`${URL_API}${rapatId ? `?rapat_id=${rapatId}` : ""}`);
      setData(d);
      setGalat(null);
      if (d.rekap) setPilihId(d.rekap.rapat_id);
      if (isiForm) {
        const r = d.daftar.find((x) => x.id === (rapatId ?? d.rekap?.rapat_id));
        if (r) setForm(bentukDari(r));
      }
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat(undefined, true);
    const t = setInterval(() => document.visibilityState === "visible" && muat(pilihId), 15_000);
    return () => clearInterval(t);
  }, [muat]); // eslint-disable-line react-hooks/exhaustive-deps

  const ubah = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const kirim = (body: unknown) => fetchJson<Record<string, unknown>>(URL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function simpan() {
    setSibuk(true);
    setPesan(null);
    try {
      const r = (await kirim({ aksi: "simpan", ...form, buka_menit: Number(form.buka_menit), tutup_menit: Number(form.tutup_menit) })) as { id: number };
      setPesan({ jenis: "ok", teks: form.aktif ? "Tersimpan. Modal tampil di aplikasi petugas sesuai jadwal." : "Tersimpan (nonaktif: belum tampil bagi petugas)." });
      await muat(r.id, true);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  async function hidupMati(r: Rapat, aktif: boolean) {
    try {
      await kirim({ aksi: "aktif", id: r.id, aktif });
      await muat(pilihId, form.id === r.id);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  async function catatManual() {
    if (!manual || !pilihId) return;
    try {
      await kirim({ aksi: "manual", rapat_id: pilihId, akun_id: manual.akun_id, alasan: manual.alasan });
      setManual(null);
      await muat(pilihId);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  const baris = data?.rekap?.baris ?? [];
  const nHadir = baris.filter((b) => b.hadir_at).length;
  const tampil = useMemo(() => baris.filter((b) => (saring === "semua" ? true : saring === "hadir" ? !!b.hadir_at : !b.hadir_at)), [baris, saring]);

  function unduh() {
    const r = data?.daftar.find((x) => x.id === pilihId);
    const sel = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const isi = [["No", "Nama", "Peran", "Status", "Waktu hadir (WIB)", "Sumber", "Alasan manual"].map(sel).join(",")]
      .concat(baris.map((b, i) => [i + 1, b.nama, b.peran.toUpperCase(), b.hadir_at ? "Hadir" : "Belum hadir", b.hadir_at ? jamWib(b.hadir_at) : "", b.sumber ?? "", b.alasan ?? ""].map(sel).join(",")))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + isi], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Presensi_${(r?.judul ?? "Rapat").replace(/[^\w]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!data) return galat ? <Pesan jenis="galat">{galat}</Pesan> : <Memuat />;
  const sk = new Date(data.sekarang).getTime();
  const bisa = data.boleh_kelola;
  const lbl = "block text-[12px] font-semibold text-[#5B6B84]";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Kartu judul="Daftar rapat" ket="Rapat aktif tampil sebagai modal di aplikasi petugas (PPL & PML)">
          {galat && <Pesan jenis="galat">{galat}</Pesan>}
          <div className="space-y-1.5">
            {data.daftar.length === 0 && <p className="text-[12.5px] text-[#7B8794]">Belum ada rapat.</p>}
            {data.daftar.map((r) => {
              const st = statusRapat(r, sk);
              return (
                <div key={r.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${pilihId === r.id ? "border-[#1F6FD1] bg-[#F3F8FF]" : "border-[#E3E8EE] bg-white"}`}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setForm(bentukDari(r)); setPilihId(r.id); setPesan(null); muat(r.id); }}>
                    <div className="truncate text-[13px] font-semibold">{r.judul}</div>
                    <div className="text-[11.5px] text-[#7B8794]">{jamWib(r.mulai_at)} – {jamWib(r.selesai_at)} WIB</div>
                  </button>
                  <Chip w={st.w}>{st.teks}</Chip>
                  {bisa && (
                    <button type="button" className={`${BTN_O} !px-2 !py-0.5`} onClick={() => hidupMati(r, !r.aktif)}>
                      {r.aktif ? "Matikan" : "Aktifkan"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {bisa && (
            <button type="button" className={`${BTN_O} mt-2`} onClick={() => { setForm(FORM_BARU); setPesan(null); }}>
              + Rapat baru
            </button>
          )}
        </Kartu>

        <Kartu judul={form.id ? "Atur rapat" : "Rapat baru"} ket="Waktu dalam WIB. Token hanya terlihat oleh admin; petugas mengetiknya sendiri.">
          <fieldset disabled={!bisa || sibuk} className="space-y-2.5">
            <div>
              <label className={lbl}>Judul rapat</label>
              <input className={INPUT} value={form.judul} onChange={(e) => ubah("judul", e.target.value)} maxLength={160} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Mulai (WIB)</label>
                <input type="datetime-local" className={INPUT} value={form.mulai_at} onChange={(e) => ubah("mulai_at", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Selesai (WIB)</label>
                <input type="datetime-local" className={INPUT} value={form.selesai_at} onChange={(e) => ubah("selesai_at", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={lbl}>Tautan Zoom (https://…)</label>
              <input className={INPUT} value={form.tautan} onChange={(e) => ubah("tautan", e.target.value)} placeholder="https://us02web.zoom.us/j/…" inputMode="url" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>ID rapat</label>
                <input className={INPUT} value={form.meeting_id} onChange={(e) => ubah("meeting_id", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Passcode</label>
                <input className={INPUT} value={form.passcode} onChange={(e) => ubah("passcode", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={lbl}>Token hadir</label>
                <input className={INPUT} value={form.token} onChange={(e) => ubah("token", e.target.value)} maxLength={40} />
              </div>
              <div>
                <label className={lbl}>Buka (mnt sebelum)</label>
                <input type="number" min={0} max={720} className={INPUT} value={form.buka_menit} onChange={(e) => ubah("buka_menit", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Tutup (mnt sesudah)</label>
                <input type="number" min={0} max={720} className={INPUT} value={form.tutup_menit} onChange={(e) => ubah("tutup_menit", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Sasaran</label>
                <select className={INPUT} value={form.sasaran_peran} onChange={(e) => ubah("sasaran_peran", e.target.value as Form["sasaran_peran"])}>
                  <option value="semua">PPL + PML</option>
                  <option value="ppl">PPL saja</option>
                  <option value="pml">PML saja</option>
                </select>
              </div>
              <label className="mt-5 flex items-center gap-2 text-[13px] font-semibold">
                <input type="checkbox" checked={form.aktif} onChange={(e) => ubah("aktif", e.target.checked)} /> Aktif (tampil di petugas)
              </label>
            </div>
          </fieldset>
          {pesan && <Pesan jenis={pesan.jenis}>{pesan.teks}</Pesan>}
          {bisa && (
            <button type="button" className={`${BTN} mt-2`} disabled={sibuk} onClick={simpan}>
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
          )}
        </Kartu>
      </div>

      <Kartu
        judul="Rekap kehadiran"
        ket={`${nHadir} hadir dari ${baris.length} sasaran · segar tiap 15 detik`}
        kanan={
          <button type="button" className={BTN_O} onClick={unduh} disabled={!baris.length}>
            Unduh (Excel/CSV)
          </button>
        }
      >
        <div className="mb-2 flex gap-1.5">
          {(["semua", "hadir", "belum"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setSaring(k)} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${saring === k ? "border-[#1E2A47] bg-[#1E2A47] text-white" : "border-[#CBD6E6] bg-white text-[#1E2A47]"}`}>
              {k === "semua" ? `Semua (${baris.length})` : k === "hadir" ? `Hadir (${nHadir})` : `Belum (${baris.length - nHadir})`}
            </button>
          ))}
        </div>
        <TabelKartu className="!shadow-none">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={TH}>No</th>
                <th className={TH}>Nama</th>
                <th className={TH}>Peran</th>
                <th className={TH}>Status</th>
                <th className={TH}>Waktu</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((b, i) => (
                <tr key={b.akun_id}>
                  <td className={`${TD} tabular-nums`}>{i + 1}</td>
                  <td className={TD}>{b.nama}</td>
                  <td className={TD}>{b.peran.toUpperCase()}</td>
                  <td className={TD}>
                    {b.hadir_at ? <Chip w="ok">{b.sumber === "manual" ? "Hadir (manual)" : "Hadir"}</Chip> : <Chip w="mut">Belum</Chip>}
                  </td>
                  <td className={`${TD} tabular-nums`} title={b.alasan ?? ""}>{b.hadir_at ? jamWib(b.hadir_at) : "—"}</td>
                  <td className={TD}>
                    {bisa && !b.hadir_at &&
                      (manual?.akun_id === b.akun_id ? (
                        <span className="flex items-center gap-1">
                          <input className={`${INPUT} !py-1`} placeholder="Alasan (wajib)" value={manual.alasan} onChange={(e) => setManual({ akun_id: b.akun_id, alasan: e.target.value })} />
                          <button type="button" className={`${BTN} !px-2 !py-1`} onClick={catatManual} disabled={manual.alasan.trim().length < 3}>OK</button>
                          <button type="button" className={`${BTN_O} !px-2 !py-1`} onClick={() => setManual(null)}>Batal</button>
                        </span>
                      ) : (
                        <button type="button" className={`${BTN_O} !px-2 !py-0.5`} onClick={() => setManual({ akun_id: b.akun_id, alasan: "" })}>Catat hadir</button>
                      ))}
                  </td>
                </tr>
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td className={`${TD} text-[#7B8794]`} colSpan={6}>Tidak ada data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </TabelKartu>
      </Kartu>
    </div>
  );
}
