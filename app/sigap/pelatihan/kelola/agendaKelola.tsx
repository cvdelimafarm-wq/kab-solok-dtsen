"use client";

// app/sigap/pelatihan/kelola/agendaKelola.tsx
//
// (9 Nov 2026) Kelola Pelatihan > Hari H > Agenda sesi: panitia mengatur sesi tes mana yang DIMULAI INSTRUKTUR, per kelas.
// Tombol Mulai/Selesai tetap milik instruktur kelas (kartu "Agenda sesi kelas Anda" di Hari ini). Di sini hanya: aktifkan/lepas dan atur jendela mulai.
// Data: GET/POST /api/sigap/pelatihan/agenda/kelola. Tabel belum ada = petunjuk SQL.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { LABEL_STATUS_AGENDA, type StatusAgenda } from "@/lib/sigapAgenda";

const URL_AGENDA = "/api/sigap/pelatihan/agenda/kelola";

type Data = {
  ada_tabel: boolean;
  boleh_kelola: boolean;
  sekarang: string;
  jendela_bawaan: number;
  kelas: { nomor: number; nama: string; instruktur: { akun_id: number; nama: string }[] }[];
  tes: { id: number; jenis: string; judul: string; jumlah_soal: number; durasi_menit: number }[];
  sesi: { id: number; tes_id: number; kelas: number; jendela_menit: number; status: StatusAgenda; mulai_at: string | null; tutup_at: string | null }[];
  belum_diatur: { jenis: string; kelas: number }[];
};

const WARNA_STATUS: Record<StatusAgenda, "wait" | "ok" | "mut"> = { menunggu: "wait", berjalan: "ok", selesai: "mut" };
const namaTes = (jenis: string, judul: string) => (jenis === "pretest" ? "Pretest" : jenis === "posttest" ? "Posttest" : judul);

export default function AgendaKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [jendela, setJendela] = useState<Record<string, string>>({});

  const muat = useCallback(async () => {
    try {
      setD(await fetchJson<Data>(URL_AGENDA));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    void muat();
    const t = setInterval(() => void muat(), 15_000); // status Mulai/Selesai berubah dari HP instruktur
    return () => clearInterval(t);
  }, [muat]);

  async function kirim(isi: Record<string, unknown>, pesanOk: string) {
    setSibuk(true);
    setOk(null);
    try {
      setD(await fetchJson<Data>(URL_AGENDA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isi) }));
      setGalat(null);
      setOk(pesanOk);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!d.ada_tabel) {
    return <Pesan jenis="peringatan">Tabel agenda belum dibuat. Jalankan SQL 20261109a_agenda_sesi.sql di Supabase, lalu muat ulang halaman ini.</Pesan>;
  }

  const kunci = (tesId: number, kelas: number) => `${tesId}-${kelas}`;
  const tesBersoal = d.tes.filter((t) => t.jumlah_soal > 0);
  const bisa = d.boleh_kelola;
  const jumlahBelum = d.belum_diatur.length;

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && <Pesan jenis="ok" onTutup={() => setOk(null)}>{ok}</Pesan>}

      <Kartu
        judul="Agenda sesi: tes dimulai instruktur"
        ket="Tes yang diatur di sini baru bisa dikerjakan setelah instruktur kelasnya menekan Mulai. Jam buka di pengaturan Tes tidak lagi dipakai untuk tes itu."
        kanan={
          bisa && jumlahBelum > 0 ? (
            <button
              type="button"
              className={BTN}
              disabled={sibuk}
              onClick={() => {
                if (window.confirm(`Atur ${jumlahBelum} sesi (semua kelas x Pretest/Posttest yang belum diatur) agar dimulai instruktur, jendela ${d.jendela_bawaan} menit?`)) {
                  void kirim({ aksi: "pasang_semua" }, "Semua sesi diatur dimulai instruktur.");
                }
              }}
            >
              Atur semua dimulai instruktur
            </button>
          ) : undefined
        }
      >
        {tesBersoal.length === 0 && <Pesan jenis="info">Belum ada tes yang punya soal. Unggah soal di Materi &amp; Penilaian lebih dulu.</Pesan>}
        {d.kelas.length === 0 && <Pesan jenis="info">Belum ada kelas. Tambahkan peserta atau kelas di Peserta &amp; Kelas.</Pesan>}
        {jumlahBelum === 0 && tesBersoal.length > 0 && d.kelas.length > 0 && <p className="m-0 text-[12.5px] font-semibold text-[#13794B]">Semua sesi sudah diatur dimulai instruktur.</p>}
        {jumlahBelum > 0 && <p className="m-0 text-[12.5px] text-[#8A6200]">{jumlahBelum} sesi belum diatur: tes itu terbuka menurut jadwal biasa, bukan menunggu instruktur.</p>}
      </Kartu>

      {d.kelas.map((k) => {
        const tanpaInstruktur = k.instruktur.length === 0;
        return (
          <Kartu
            key={k.nomor}
            judul={k.nama}
            ket={tanpaInstruktur ? undefined : `Instruktur: ${k.instruktur.map((i) => i.nama).join(", ")}`}
            kanan={tanpaInstruktur ? <Chip w="bad" title="Tanpa instruktur, tes di kelas ini tidak ada yang bisa memulai">Belum ada instruktur</Chip> : undefined}
          >
            <ul className="m-0 list-none space-y-2 p-0">
              {tesBersoal.map((t) => {
                const s = d.sesi.find((x) => x.tes_id === t.id && x.kelas === k.nomor);
                const kk = kunci(t.id, k.nomor);
                const nilai = jendela[kk] ?? String(s?.jendela_menit ?? d.jendela_bawaan);
                const sudahMulai = !!s?.mulai_at;
                return (
                  <li key={t.id} className="rounded-lg border border-[#EDF0F4] bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-[#0F2A52]">{namaTes(t.jenis, t.judul)}</span>
                      <span className="text-[12px] text-[#6B7A90]">{t.jumlah_soal} soal · {t.durasi_menit} menit</span>
                      {s ? <Chip w={WARNA_STATUS[s.status]}>{LABEL_STATUS_AGENDA[s.status]}</Chip> : <Chip w="mut">Jadwal biasa</Chip>}
                    </div>
                    {s?.mulai_at && (
                      <div className="mt-1 text-[12px] text-[#55657D]">
                        Dimulai {waktuWib(s.mulai_at)}
                        {s.tutup_at && s.status === "berjalan" ? `; peserta masih bisa mulai sampai ${waktuWib(s.tutup_at)}` : ""}
                      </div>
                    )}
                    {bisa && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-[12px] text-[#44546F]">
                          Jendela mulai
                          <input
                            className={`${INPUT} w-[70px]`}
                            inputMode="numeric"
                            value={nilai}
                            onChange={(e) => setJendela((j) => ({ ...j, [kk]: e.target.value.replace(/[^0-9]/g, "") }))}
                            aria-label={`Jendela mulai ${namaTes(t.jenis, t.judul)} ${k.nama} (menit)`}
                          />
                          menit
                        </label>
                        <button type="button" className={s ? BTN_O : BTN} disabled={sibuk} onClick={() => void kirim({ aksi: "atur", tes_id: t.id, kelas: k.nomor, jendela_menit: nilai }, s ? "Jendela diperbarui." : "Sesi diatur dimulai instruktur.")}>
                          {s ? "Simpan jendela" : "Atur dimulai instruktur"}
                        </button>
                        {s && !sudahMulai && (
                          <button
                            type="button"
                            className={BTN_R}
                            disabled={sibuk}
                            onClick={() => {
                              if (window.confirm(`Kembalikan ${namaTes(t.jenis, t.judul)} ${k.nama} ke jadwal biasa (tidak lagi menunggu instruktur)?`)) {
                                void kirim({ aksi: "lepas", tes_id: t.id, kelas: k.nomor }, "Sesi dikembalikan ke jadwal biasa.");
                              }
                            }}
                          >
                            Lepas
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Kartu>
        );
      })}
      <p className="m-0 text-[11.5px] text-[#6B7A90]">
        Jendela mulai = berapa menit sejak instruktur menekan Mulai peserta masih boleh memulai. Setiap peserta mendapat waktu pengerjaan penuh kapan pun ia mulai di dalam jendela; yang terlambat tidak diperpanjang.
      </p>
    </div>
  );
}
