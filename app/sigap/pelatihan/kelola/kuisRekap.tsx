"use client";

// app/sigap/pelatihan/kelola/kuisRekap.tsx
//
// (7-8 Okt 2026) Adu Sigap > Riwayat & Rekap: daftar sesi selesai (semua kelas) + rekap per peserta & per soal (kunci, penjelasan)
// + ekspor Excel. Rekap satu ruang = satu kelas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import { URL_KUIS_ADMIN } from "./kuisHost";
import { kirim, type AksiFn, type Daftar } from "./kuisBersama";

export function Riwayat({ data, bisaKelola, sibuk, aksi, bukaHost, bukaRekap, rekapAktif, tutupRekap }: { data: Daftar; bisaKelola: boolean; sibuk: boolean; aksi: AksiFn; bukaHost: (ruangId: number) => void; bukaRekap: (ruangId: number) => void; rekapAktif: number | null; tutupRekap: () => void }) {
  const [hapusRuang, setHapusRuang] = useState<number | null>(null);
  const riwayat = data.ruang.filter((r) => r.status === "selesai");
  const judulKuis = (id: number) => data.kuis.find((k) => k.id === id)?.judul ?? "Kuis";
  return (
    <>
      <Kartu judul="Riwayat & rekap" ket={`${riwayat.length} sesi kuis selesai`}>
        {riwayat.length === 0 ? (
          <p className="text-[13px] text-[#7B8794]">Belum ada kuis yang selesai dimainkan.</p>
        ) : (
          <TabelKartu className="!shadow-none">
            <thead>
              <tr>
                <th className={TH}>Kelas</th>
                <th className={TH}>Kuis</th>
                <th className={TH}>Dimulai (WIB)</th>
                <th className={TH}>Peserta</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id}>
                  <td className={`${TD} font-bold`}>Kelas {r.kelas}</td>
                  <td className={`${TD} font-semibold`}>{judulKuis(r.kuis_id)}</td>
                  <td className={TD}>{waktuWib(r.dibuka_at)}</td>
                  <td className={`${TD} tabular-nums`}>{r.jumlah_peserta}</td>
                  <td className={`${TD} text-right`}>
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      <button type="button" className={BTN} onClick={() => bukaRekap(r.id)}>Rekap</button>
                      <button type="button" className={BTN_O} onClick={() => bukaHost(r.id)}>Podium & review</button>
                      {bisaKelola &&
                        (hapusRuang === r.id ? (
                          <>
                            <button type="button" className={BTN_R} disabled={sibuk} onClick={() => { setHapusRuang(null); if (rekapAktif === r.id) tutupRekap(); aksi(() => kirim({ aksi: "hapus_ruang", ruang_id: r.id }), "Riwayat dihapus."); }}>Ya, hapus</button>
                            <button type="button" className={BTN_O} onClick={() => setHapusRuang(null)}>Batal</button>
                          </>
                        ) : (
                          <button type="button" className={BTN_R} onClick={() => setHapusRuang(r.id)}>Hapus</button>
                        ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TabelKartu>
        )}
      </Kartu>
      {rekapAktif !== null && <Rekap ruangId={rekapAktif} onTutup={tutupRekap} />}
    </>
  );
}

// ======================================================================
// Rekap satu ruang
// ======================================================================
type RekapPeserta = { akun_id: number; nama: string; jenis_akun: string; peran: string; kelas: number | null; ikut: boolean; poin: number | null; benar: number | null; menjawab: number | null; rata_waktu_ms: number | null; peringkat: number | null };
type RekapSoal = { nomor: number; teks: string; topik: string | null; penjelasan: string | null; kunci: string; detik: number; menjawab: number; benar: number; persen_benar: number | null; sebaran: Record<string, number> };
type RekapData = { sekarang: string; ruang: { id: number; kelas: number; judul: string; status: string; dibuka_at: string; selesai_at: string | null }; jumlah_soal: number; peserta: RekapPeserta[]; soal: RekapSoal[] };

export function Rekap({ ruangId, onTutup }: { ruangId: number; onTutup: () => void }) {
  const [d, setD] = useState<RekapData | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [jenis, setJenis] = useState("");
  const [kelas, setKelas] = useState("");
  const [tampil, setTampil] = useState<"ikut" | "semua" | "tidak">("ikut");
  const [cari, setCari] = useState("");

  const muat = useCallback(async () => {
    try {
      setD(await fetchJson<RekapData>(`${URL_KUIS_ADMIN}?bagian=rekap&ruang_id=${ruangId}`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [ruangId]);
  useEffect(() => {
    setD(null);
    muat();
  }, [muat]);

  const baris = useMemo(
    () =>
      (d?.peserta ?? []).filter((p) => {
        if (tampil === "ikut" && !p.ikut) return false;
        if (tampil === "tidak" && p.ikut) return false;
        if (jenis && p.jenis_akun !== jenis) return false;
        if (kelas && String(p.kelas ?? "") !== kelas) return false;
        if (cari && !p.nama.toLowerCase().includes(cari.toLowerCase())) return false;
        return true;
      }),
    [d, jenis, kelas, tampil, cari]
  );

  async function ekspor() {
    if (!d) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const aoa: (string | number)[][] = [["Peringkat", "Nama", "Jenis", "Kelas", "Peran", "Ikut kuis", "Poin", "Benar", "Dijawab", "Jumlah soal", "% benar", "Rata-rata waktu jawab (dtk)"]];
    baris.forEach((p) =>
      aoa.push([p.peringkat ?? "", p.nama, p.jenis_akun === "organik" ? "Organik" : "Mitra", p.kelas ?? "", p.peran.toUpperCase(), p.ikut ? "Ya" : "Tidak", p.poin ?? "", p.benar ?? "", p.menjawab ?? "", d.jumlah_soal, p.benar != null && d.jumlah_soal ? Math.round((p.benar / d.jumlah_soal) * 1000) / 10 : "", p.rata_waktu_ms != null ? Math.round(p.rata_waktu_ms / 100) / 10 : ""])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, "Peserta");
    const wa = XLSX.utils.aoa_to_sheet([["Soal", "Teks", "Topik", "Kunci", "Detik", "Menjawab", "Benar", "% benar", "Sebaran jawaban", "Penjelasan"], ...d.soal.map((s) => [s.nomor, s.teks, s.topik ?? "", s.kunci, s.detik, s.menjawab, s.benar, s.persen_benar ?? "", Object.entries(s.sebaran).map(([k, n]) => `${k}:${n}`).join("  "), s.penjelasan ?? ""])]);
    wa["!cols"] = [{ wch: 6 }, { wch: 70 }, { wch: 20 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 28 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wa, "Per soal");
    XLSX.writeFile(wb, `Rekap_Adu_Sigap_Kelas${d.ruang.kelas}_${d.ruang.judul.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kuis"}_${new Date().toISOString().slice(0, 10)}${jenis || kelas || cari || tampil !== "ikut" ? "_filter" : ""}.xlsx`);
  }

  const fmt = (n: number | null | undefined) => (n == null ? "—" : String(n).replace(".", ","));
  const nIkut = d?.peserta.filter((p) => p.ikut).length ?? 0;
  const rata = nIkut ? Math.round(((d?.peserta.filter((p) => p.ikut).reduce((a, p) => a + (p.poin ?? 0), 0) ?? 0) / nIkut) * 10) / 10 : null;

  return (
    <Kartu
      judul={`Rekap: ${d?.ruang.judul ?? "…"}${d ? ` · Kelas ${d.ruang.kelas}` : ""}`}
      ket={d ? `${nIkut} peserta ikut · rata-rata poin ${fmt(rata)} · ${d.jumlah_soal} soal` : undefined}
      kanan={
        <span className="flex gap-1.5">
          <button type="button" className={BTN_O} onClick={muat}>↻ Segarkan</button>
          <button type="button" className={BTN_O} onClick={ekspor} disabled={!d}>⬇ Ekspor Excel</button>
          <button type="button" className={BTN_O} onClick={onTutup}>✕ Tutup</button>
        </span>
      }
    >
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter rekap">
            <select className={INPUT} value={tampil} onChange={(e) => setTampil(e.target.value as "ikut" | "semua" | "tidak")} aria-label="Keikutsertaan">
              <option value="ikut">Yang ikut kuis</option>
              <option value="tidak">Belum/tidak ikut</option>
              <option value="semua">Semua peserta pelatihan</option>
            </select>
            <select className={INPUT} value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Filter jenis">
              <option value="">Organik & Mitra</option>
              <option value="organik">Organik</option>
              <option value="mitra">Mitra</option>
            </select>
            <select className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
              <option value="">Semua kelas</option>
              {[1, 2, 3, 4].map((k) => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>
            <input className={`${INPUT} min-w-[150px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari nama" />
          </div>
          <TabelKartu className="!shadow-none">
            <thead>
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Nama</th>
                <th className={TH}>Kls</th>
                <th className={TH}>Peran</th>
                <th className={TH}>Jenis</th>
                <th className={TH}>Poin</th>
                <th className={TH}>Benar</th>
                <th className={TH}>Rata waktu</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((p) => (
                <tr key={p.akun_id}>
                  <td className={`${TD} font-bold tabular-nums`}>{p.peringkat ?? "–"}</td>
                  <td className={`${TD} font-semibold`}>{p.nama}</td>
                  <td className={TD}>{p.kelas ?? "–"}</td>
                  <td className={TD}>{p.peran ? p.peran.toUpperCase() : "–"}</td>
                  <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
                  <td className={`${TD} font-bold tabular-nums`}>{p.ikut ? p.poin : <Chip>tidak ikut</Chip>}</td>
                  <td className={`${TD} tabular-nums`}>{p.ikut ? `${p.benar}/${d.jumlah_soal}` : "—"}</td>
                  <td className={`${TD} tabular-nums`}>{p.rata_waktu_ms != null ? `${fmt(Math.round(p.rata_waktu_ms / 100) / 10)} dtk` : "—"}</td>
                </tr>
              ))}
              {baris.length === 0 && (
                <tr>
                  <td className={`${TD} text-center text-[#7B8794]`} colSpan={8}>Tidak ada peserta yang cocok.</td>
                </tr>
              )}
            </tbody>
          </TabelKartu>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Per soal</p>
            <div className="space-y-1.5">
              {d.soal.map((s) => (
                <div key={s.nomor} className="rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <b className="w-7 shrink-0">{s.nomor}.</b>
                    <span className="min-w-0 flex-1 truncate" title={s.teks}>{s.teks}</span>
                    <span className="shrink-0 font-bold tabular-nums">{s.persen_benar == null ? "—" : `${fmt(s.persen_benar)}%`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E8EE]">
                    <div className="h-full rounded-full" style={{ width: `${s.persen_benar ?? 0}%`, background: (s.persen_benar ?? 0) < 50 ? "#C0392B" : "#1E7A4C" }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#7B8794]">{s.topik ? `${s.topik} · ` : ""}Kunci {s.kunci} · sebaran {Object.entries(s.sebaran).map(([k, n]) => `${k}:${n}`).join("  ")} · {s.menjawab} menjawab</p>
                  {s.penjelasan && <p className="mt-0.5 text-[11.5px] italic text-[#55657D]">💡 {s.penjelasan}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Kartu>
  );
}
