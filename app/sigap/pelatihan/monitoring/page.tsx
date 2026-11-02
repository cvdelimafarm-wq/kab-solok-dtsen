"use client";

// app/sigap/pelatihan/monitoring/page.tsx
//
// (2 Nov 2026) Tab "Monitoring" pelatihan: progres menurut hierarki (panitia: semua; instruktur: kelasnya; korwil/PML/PPL: dirinya dan bawahan).
// Data: GET /api/sigap/pelatihan/monitoring. Tahap ini menampilkan undangan, pretest, posttest, dan kehadiran; progres Vanguard dan instrumen menyusul.
// (2 Nov 2026) Aturan nilai versi 2: skor = nilai percobaan pertama; ditambah nilai akhir dan flag kelulusan (lulus bila lebih dari ambang; hanya penanda untuk laporan).

import { useEffect, useState } from "react";
import { fetchJson, pesanGalat } from "../../admin/api";
import { Kartu, Memuat, Pesan } from "../../admin/ui";
import { Kerangka } from "../komponen";
import { LABEL_PERAN_PELATIHAN, type PeranPelatihan } from "@/lib/hierarkiPelatihan";
import { LABEL_KELULUSAN, type StatusKelulusan } from "@/lib/sigapAturanTes";

type Tes = { status: "belum" | "mengerjakan" | "selesai"; skor: number | null };
type Baris = { akun_id: number; nama: string; peran: PeranPelatihan; kedalaman: number; diri: boolean; kelas: number | null; undangan: "belum" | "terima" | "tolak"; pretest: Tes; posttest: Tes; hadir: boolean; nilai_akhir?: number | null; kelulusan?: StatusKelulusan };
type Data = {
  jenis: "peserta" | "instruktur" | "panitia";
  ringkas: string;
  hierarki_tersedia: boolean;
  aturan_versi?: 1 | 2;
  baris: Baris[];
  ringkasan: { total: number; undangan_terima: number; undangan_tolak: number; pretest_selesai: number; posttest_selesai: number; hadir: number; kelulusan?: Record<StatusKelulusan, number> };
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

  useEffect(() => {
    let batal = false;
    const muat = () =>
      fetchJson<Data>("/api/sigap/pelatihan/monitoring")
        .then((r) => {
          if (batal) return;
          setD(r);
          setGalat(null);
        })
        .catch((e) => !batal && setGalat(pesanGalat(e)));
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 60_000);
    return () => {
      batal = true;
      clearInterval(a);
    };
  }, []);

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
            {r.kelulusan && (
              <p className="mt-2 text-[12.5px] text-[#3B4A60]">
                Kelulusan (nilai akhir lebih dari ambang, hanya penanda untuk laporan): <b className="text-[#13794B]">{r.kelulusan.lulus} lulus</b> · <b className="text-[#B42329]">{r.kelulusan.tidak_lulus} tidak lulus</b> · {r.kelulusan.belum_lengkap} belum lengkap · {r.kelulusan.belum_dinilai} belum dinilai.
              </p>
            )}
          </Kartu>
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
                      {b.kelulusan && (
                        <>
                          <span className="ml-1">Nilai akhir</span>
                          <Chip teks={b.nilai_akhir != null ? `${Math.round(b.nilai_akhir * 10) / 10}` : "—"} nada={b.nilai_akhir != null ? "ok" : "mut"} />
                          <Chip teks={LABEL_KELULUSAN[b.kelulusan]} nada={NADA_LULUS[b.kelulusan]} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Kartu>
        </>
      )}
    </Kerangka>
  );
}
