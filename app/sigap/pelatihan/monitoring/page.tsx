"use client";

// app/sigap/pelatihan/monitoring/page.tsx
//
// (2 Nov 2026) Tab "Monitoring" pelatihan: progres menurut hierarki (panitia: semua; instruktur: kelasnya; korwil/PML/PPL: dirinya dan bawahan).
// Data: GET /api/sigap/pelatihan/monitoring. Tahap ini menampilkan undangan, pretest, posttest, dan kehadiran; progres Vanguard dan instrumen menyusul.
// (2 Nov 2026) Aturan nilai versi 2: skor = nilai percobaan pertama; ditambah nilai akhir dan flag kelulusan (lulus bila lebih dari ambang; hanya penanda untuk laporan).
// (2 Nov 2026) Blokir tahapan: chip "Terkunci" (selesaikan X dulu) dan status izin per orang; panitia / instruktur dapat "Buka kunci" (pilih tahapan + alasan; berlaku sampai 23.59 hari itu).

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat } from "../../admin/api";
import { BTN, BTN_O, Kartu, Memuat, Pesan } from "../../admin/ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { ALASAN_CEPAT, LABEL_STATUS_IZIN, MAKS_ALASAN_IZIN, type StatusIzin } from "@/lib/sigapTahapan";
import { Kerangka } from "../komponen";
import { LABEL_PERAN_PELATIHAN, type PeranPelatihan } from "@/lib/hierarkiPelatihan";
import { LABEL_KELULUSAN, type StatusKelulusan } from "@/lib/sigapAturanTes";

type Tes = { status: "belum" | "mengerjakan" | "selesai"; skor: number | null };
type Kunci = { tahap: "pretest" | "posttest"; oleh_label: string; pesan: string };
type Baris = {
  akun_id: number; nama: string; peran: PeranPelatihan; kedalaman: number; diri: boolean; kelas: number | null; undangan: "belum" | "terima" | "tolak"; pretest: Tes; posttest: Tes; hadir: boolean;
  nilai_akhir?: number | null; kelulusan?: StatusKelulusan;
  kunci: Kunci[];
  izin: { pretest: StatusIzin | null; posttest: StatusIzin | null };
  /** Materi wajib (video / tautan): null = tidak ada materi wajib atau SQL belum dijalankan. `manual` = peserta menekan "Saya sudah menonton" (bukan hasil pelacakan). */
  materi?: { belum: number; manual: boolean } | null;
};
type Data = {
  jenis: "peserta" | "instruktur" | "panitia";
  ringkas: string;
  hierarki_tersedia: boolean;
  aturan_versi?: 1 | 2;
  blokir_tahap?: boolean;
  boleh_buka_kunci?: boolean;
  baris: Baris[];
  ringkasan: { total: number; undangan_terima: number; undangan_tolak: number; pretest_selesai: number; posttest_selesai: number; hadir: number; terkunci?: number; izin_menunggu?: number; materi_wajib?: number; materi_belum?: number; kelulusan?: Record<StatusKelulusan, number> };
};

const JUDUL: Record<Data["jenis"], string> = { panitia: "Seluruh peserta", instruktur: "Peserta kelas Anda", peserta: "Anda dan tim Anda" };

function Chip({ teks, nada }: { teks: string; nada: "ok" | "wait" | "bad" | "mut" }) {
  const w = nada === "ok" ? "bg-[#E3F6EC] text-[#13794B]" : nada === "wait" ? "bg-[#FFF4D6] text-[#8A6200]" : nada === "bad" ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#EEF2F7] text-[#6B7A90]";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${w}`}>{teks}</span>;
}

function ChipTes({ t }: { t: Tes }) {
  if (t.status === "selesai") return <Chip teks={t.skor !== null ? `${Math.round(t.skor * 10) / 10}` : "Selesai"} nada="ok" />;
  if (t.status === "mengerjakan") return <Chip teks="Berjalan" nada="wait" />;
  return <Chip teks="Belum" nada="mut" />;
}

const NADA_LULUS: Record<StatusKelulusan, "ok" | "wait" | "bad" | "mut"> = { lulus: "ok", tidak_lulus: "bad", belum_lengkap: "wait", belum_dinilai: "mut" };

/** Buka kunci langsung oleh panitia / instruktur: pilih tahapan + alasan. Izin berlaku sampai 23.59 WIB hari ini, hanya untuk orang ini. */
function ModalBukaKunci({ b, onTutup, onSelesai }: { b: Baris; onTutup: () => void; onSelesai: () => void }) {
  const awal: "pretest" | "posttest" = b.kunci[0]?.tahap ?? (b.pretest.status !== "selesai" ? "pretest" : "posttest");
  const [tahap, setTahap] = useState<"pretest" | "posttest">(awal);
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  useTutupDenganBack(true, onTutup); // Back HP menutup modal (penjaga Back, lib/__tests__/sigapBackGuard.test.ts)
  useEffect(() => {
    const tombol = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", tombol);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tombol);
      document.body.style.overflow = lama;
    };
  }, [onTutup]);

  async function simpan() {
    setKirim(true);
    setGalat(null);
    try {
      await fetchJson("/api/sigap/pelatihan/izin-buka", { method: "POST", body: JSON.stringify({ aksi: "buka", akun_id: b.akun_id, tahap, alasan }) });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  const kunciIni = b.kunci.find((k) => k.tahap === tahap);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/50 sm:items-center" role="dialog" aria-modal="true" aria-label={`Buka kunci ${b.nama}`} onClick={onTutup}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Buka kunci</h2>
        <p className="mt-1 text-[13.5px] text-[#3B4A60]">
          <b>{b.nama}</b>
          {b.kelas !== null ? ` · Kelas ${b.kelas}` : ""}
        </p>
        <fieldset className="mt-3">
          <legend className="text-[13px] font-semibold">Tahapan yang dibuka</legend>
          <div className="mt-1.5 flex gap-2">
            {(["pretest", "posttest"] as const).map((t) => (
              <label key={t} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-[14px] font-bold ${tahap === t ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#CBD6E6] text-[#3B4A60]"}`}>
                <input type="radio" name="tahap-buka" className="sr-only" checked={tahap === t} onChange={() => setTahap(t)} />
                {t === "pretest" ? "Pretest" : "Posttest"}
              </label>
            ))}
          </div>
          {kunciIni && <p className="mt-1.5 text-[12.5px] text-[#8A6200]">Saat ini terkunci: {kunciIni.pesan}</p>}
        </fieldset>
        <div className="mt-3">
          <label htmlFor="alasan-buka" className="text-[13px] font-semibold">
            Alasan
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ALASAN_CEPAT.map((a) => (
              <button key={a} type="button" onClick={() => setAlasan(a === "Lainnya" ? "" : a)} className={`min-h-[36px] rounded-full border px-3 text-[12.5px] font-semibold ${alasan === a ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#CBD6E6] text-[#3B4A60]"}`}>
                {a}
              </button>
            ))}
          </div>
          <textarea id="alasan-buka" value={alasan} maxLength={MAKS_ALASAN_IZIN} onChange={(e) => setAlasan(e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-[#CBD6E6] p-2.5 text-[14px]" placeholder="Tulis alasan singkat" />
        </div>
        <p className="mt-2 text-[12px] text-[#6B7A90]">Berlaku sampai 23.59 WIB hari ini, hanya untuk orang ini. Tes dibuka untuknya walau jendela tes sudah lewat.</p>
        {galat && (
          <div className="mt-3">
            <Pesan jenis="galat">{galat}</Pesan>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup} disabled={kirim}>
            Batal
          </button>
          <button type="button" className={BTN} onClick={simpan} disabled={kirim || alasan.trim().length < 3}>
            {kirim ? "Menyimpan…" : "Buka kunci"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Angka({ label, nilai, dari }: { label: string; nilai: number; dari: number }) {
  return (
    <div className="rounded-xl bg-[#F3F6FB] p-2.5 text-center">
      <b className="block text-[18px] font-extrabold text-[#0F2A52]">
        {nilai}
        <span className="text-[12px] font-semibold text-[#6B7A90]">/{dari}</span>
      </b>
      <span className="text-[11.5px] text-[#6B7A90]">{label}</span>
    </div>
  );
}

export default function HalamanMonitoring() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState<Baris | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const muat = useCallback(() => fetchJson<Data>("/api/sigap/pelatihan/monitoring").then((r) => {
    setD(r);
    setGalat(null);
  }).catch((e) => setGalat(pesanGalat(e))), []);

  useEffect(() => {
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 60_000);
    return () => clearInterval(a);
  }, [muat]);

  const r = d?.ringkasan;
  return (
    <Kerangka aktif="monitoring" judul="Monitoring" sub={d ? `${JUDUL[d.jenis]} · ${d.ringkas}` : undefined}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && r && (
        <>
          {!d.hierarki_tersedia && d.jenis !== "peserta" && (
            <Pesan jenis="peringatan">Hierarki atasan–bawahan belum disusun, jadi daftar tampil rata. Susun atau salin dari data PSP di Kelola Pelatihan.</Pesan>
          )}
          <Kartu judul="Ringkasan" ket={`${r.total} orang`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Angka label="Menerima undangan" nilai={r.undangan_terima} dari={r.total} />
              <Angka label="Pretest selesai" nilai={r.pretest_selesai} dari={r.total} />
              <Angka label="Posttest selesai" nilai={r.posttest_selesai} dari={r.total} />
              <Angka label="Sudah hadir" nilai={r.hadir} dari={r.total} />
            </div>
            {r.undangan_tolak > 0 && <p className="mt-2 text-[12.5px] text-[#B42329]">{r.undangan_tolak} orang menolak undangan.</p>}
            {(r.materi_wajib ?? 0) > 0 && (
              <p className="mt-2 text-[12.5px] text-[#3B4A60]">
                Materi wajib ({r.materi_wajib} video / tautan): <b className={(r.materi_belum ?? 0) > 0 ? "text-[#8A6200]" : "text-[#13794B]"}>{r.materi_belum ?? 0} orang belum menuntaskan</b>.
              </p>
            )}
            {(r.terkunci ?? 0) > 0 && (
              <p className="mt-2 text-[12.5px] font-semibold text-[#8A6200]">
                {r.terkunci} orang terkunci menunggu tahapan sebelumnya{(r.izin_menunggu ?? 0) > 0 ? ` · ${r.izin_menunggu} permintaan buka kunci menunggu` : ""}.
              </p>
            )}
            {r.kelulusan && (
              <p className="mt-2 text-[12.5px] text-[#3B4A60]">
                Kelulusan (nilai akhir lebih dari ambang, hanya penanda untuk laporan): <b className="text-[#13794B]">{r.kelulusan.lulus} lulus</b> · <b className="text-[#B42329]">{r.kelulusan.tidak_lulus} tidak lulus</b> · {r.kelulusan.belum_lengkap} belum lengkap · {r.kelulusan.belum_dinilai} belum dinilai.
              </p>
            )}
          </Kartu>
          {ok && <Pesan jenis="info">{ok}</Pesan>}
          <Kartu judul="Progres per orang">
            {d.baris.length === 0 ? (
              <p className="text-[13px] text-[#6B7A90]">Belum ada peserta dalam cakupan Anda.</p>
            ) : (
              <ul className="divide-y divide-[#EDF0F4]">
                {d.baris.map((b) => (
                  <li key={b.akun_id} className="py-2.5" style={{ paddingLeft: Math.min(b.kedalaman, 3) * 14 }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[13.5px]">{b.nama}</b>
                      <span className="rounded bg-[#E3EEFF] px-1.5 py-0.5 text-[10.5px] font-bold text-[#1F5FD1]">{LABEL_PERAN_PELATIHAN[b.peran]}</span>
                      {b.diri && <span className="text-[11px] font-semibold text-[#6B7A90]">(Anda)</span>}
                      {b.kelas !== null && <span className="text-[11px] text-[#6B7A90]">Kelas {b.kelas}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#6B7A90]">
                      <span>Undangan</span>
                      <Chip teks={b.undangan === "terima" ? "Diterima" : b.undangan === "tolak" ? "Ditolak" : "Belum"} nada={b.undangan === "terima" ? "ok" : b.undangan === "tolak" ? "bad" : "mut"} />
                      <span className="ml-1">Pretest</span>
                      <ChipTes t={b.pretest} />
                      <span className="ml-1">Posttest</span>
                      <ChipTes t={b.posttest} />
                      <span className="ml-1">Hadir</span>
                      <Chip teks={b.hadir ? "Ya" : "Belum"} nada={b.hadir ? "ok" : "mut"} />
                      {b.materi && (
                        <>
                          <span className="ml-1">Materi wajib</span>
                          <Chip teks={b.materi.belum === 0 ? "Tuntas" : `${b.materi.belum} belum`} nada={b.materi.belum === 0 ? "ok" : "wait"} />
                          {b.materi.manual && <Chip teks="ditandai manual" nada="mut" />}
                        </>
                      )}
                      {b.kunci.map((k) => (
                        <Chip key={k.tahap} teks={`${k.tahap === "pretest" ? "Pretest" : "Posttest"} terkunci · ${k.pesan.replace(/\.$/, "")}`} nada="wait" />
                      ))}
                      {(["pretest", "posttest"] as const).map((t) =>
                        b.izin[t] ? <Chip key={`izin-${t}`} teks={`${t === "pretest" ? "Pretest" : "Posttest"}: ${LABEL_STATUS_IZIN[b.izin[t]!]}`} nada={b.izin[t] === "disetujui" ? "ok" : b.izin[t] === "ditolak" ? "bad" : "wait"} /> : null
                      )}
                      {b.kelulusan && (
                        <>
                          <span className="ml-1">Nilai akhir</span>
                          <Chip teks={b.nilai_akhir != null ? `${Math.round(b.nilai_akhir * 10) / 10}` : "—"} nada={b.nilai_akhir != null ? "ok" : "mut"} />
                          <Chip teks={LABEL_KELULUSAN[b.kelulusan]} nada={NADA_LULUS[b.kelulusan]} />
                        </>
                      )}
                    </div>
                    {d.boleh_buka_kunci && (b.pretest.status !== "selesai" || b.posttest.status !== "selesai") && (
                      <button type="button" onClick={() => { setOk(null); setBuka(b); }} className="mt-1.5 min-h-[36px] rounded-lg border border-[#CBD6E6] px-3 text-[12.5px] font-bold text-[#1F5FD1] active:bg-[#F5F8FE]">
                        {b.kunci.length > 0 || b.izin.pretest === "menunggu" || b.izin.posttest === "menunggu" ? "Buka kunci" : "Buka akses tes"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Kartu>
        </>
      )}
      {buka && (
        <ModalBukaKunci
          b={buka}
          onTutup={() => setBuka(null)}
          onSelesai={() => {
            setOk(`Kunci dibuka untuk ${buka.nama}. Berlaku sampai 23.59 WIB hari ini.`);
            setBuka(null);
            void muat();
          }}
        />
      )}
    </Kerangka>
  );
}
