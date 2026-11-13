"use client";

// app/sigap/kelola/master/PoinBeban.tsx
//
// (13 Nov 2026, keputusan C) Master > tab "Poin beban kerja": SUMBER UTAMA poin per satuan menurut jenis pekerjaan × survei (skala kapasitas 100 poin/hari).
// Matriks (sel = poin berlaku + huruf sumber), rincian sel dengan kolom sumber berdampingan (data awal, input manual, usul pegawai, riwayat, poin berlaku,
// sumber), persetujuan perubahan > ambang, riwayat perubahan, pengaturan angka usul, dan daftar survei. Hitungan ada di basis data (keu_poin_hitung,
// SQL 20261113c); semua tulis lewat fungsi keu_poin_* di gerbang keu (hak: pemberi delegasi tingkat tim). Logika tampilan: lib/keu/poinBeban.ts.

import { useMemo, useState } from "react";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, label, Memuat, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { urlBaca } from "@/lib/keu/ro";
import { useBacaKeu, useBoleh, useKirim } from "@/app/sigap/ro/useKeu";
import {
  angkaAtauNull, fmtPoin, HURUF_SUMBER, LABEL_STATUS_RIWAYAT, LABEL_SUMBER, perHariDariPoin, persenUbah, poinDariPerHari, susunMatriks,
  type AturPoin, type BarisSelPoin, type JenisPoin, type RiwayatPoin, type SurveiPoin,
} from "@/lib/keu/poinBeban";

const th = "px-2 py-1.5 text-left text-[11.5px] font-bold text-[#44546F]";
const td = "px-2 py-1.5 align-top";
const waktu = (s: string | null) => (s ? new Date(s).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");

function Kotak({ judul, nilai, ket, sorot }: { judul: string; nilai: string; ket?: string; sorot?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${sorot ? "border-[#1F5FD1] bg-[#E3EEFF]" : "border-[#DCE3EE] bg-[#F7F9FD]"}`}>
      <div className="text-[11px] font-semibold text-[#5B6B84]">{judul}</div>
      <div className="text-[17px] font-extrabold leading-tight text-[#0F2A52]">{nilai}</div>
      {ket && <div className="text-[11px] leading-snug text-[#5B6B84]">{ket}</div>}
    </div>
  );
}

function Rincian({ s, jenis, survei, boleh, kapasitas, onSelesai }: {
  s: BarisSelPoin | null; jenis: JenisPoin; survei: SurveiPoin; boleh: boolean; kapasitas: number; onSelesai: () => Promise<void>;
}) {
  const riw = useBacaKeu<RiwayatPoin>(s ? urlBaca("keu_v_poin_perubahan", { sel_id: s.id }, { urut: "-id", batas: 100 }) : null);
  const muat = async () => { await Promise.all([onSelesai(), riw.muat()]); };
  const { kirim, mengirim, galat } = useKirim(muat);
  const [mode, setMode] = useState<"poin" | "hari">("poin");
  const [isian, setIsian] = useState(s?.manual != null ? String(s.manual).replace(".", ",") : "");
  const [timpa, setTimpa] = useState(!!s?.manual_timpa);
  const [alasan, setAlasan] = useState("");
  const [tolak, setTolak] = useState("");
  const [saringStatus, setSaringStatus] = useState("");
  const angka = Number(isian.replace(/\./g, "").replace(",", "."));
  const poinIsian = !isian.trim() || !Number.isFinite(angka) || angka <= 0 ? null : mode === "poin" ? Math.round(angka * 100) / 100 : poinDariPerHari(angka, kapasitas);
  const berlaku = angkaAtauNull(s?.poin_berlaku);
  const ubah = persenUbah(berlaku, poinIsian);
  const simpan = (hapus: boolean) => kirim("keu_poin_manual_simpan", { p_jenis: jenis.id, p_survei: survei.id, p_poin: hapus ? null : poinIsian, p_timpa: hapus ? false : timpa, p_alasan: alasan.trim() });
  const riwayat = (riw.baris ?? []).filter((r) => !saringStatus || r.status === saringStatus);

  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-label={`Rincian poin ${jenis.nama} – ${survei.nama}`}>
      <div>
        <h3 className={`${judulKartu} m-0`}>{jenis.nama} · {survei.nama}</h3>
        <p className="m-0 text-[12.5px] text-[#5B6B84]">Poin per {jenis.satuan}. {berlaku ? `Standar ${fmtPoin(perHariDariPoin(berlaku, kapasitas))} ${jenis.satuan} per hari (${kapasitas} poin).` : "Belum ada poin berlaku."}</p>
      </div>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(140px,100%),1fr))]">
        <Kotak judul="Data awal" nilai={fmtPoin(s?.awal)} ket={s?.awal_ket || undefined} sorot={s?.sumber_berlaku === "awal"} />
        <Kotak judul="Input manual" nilai={fmtPoin(s?.manual)} ket={s?.manual != null ? `${s.manual_timpa ? "menimpa sumber lain · " : ""}${s.manual_alasan}` : undefined} sorot={s?.sumber_berlaku === "manual"} />
        <Kotak judul="Usul pegawai" nilai={fmtPoin(s?.usul_poin)} ket={`${s?.usul_n ?? 0} pengusul${s?.usul_pencilan ? `, ${s.usul_pencilan} pencilan dibuang` : ""}`} sorot={s?.sumber_berlaku === "usul" || s?.sumber_berlaku === "gabungan"} />
        <Kotak judul="Riwayat" nilai={fmtPoin(s?.riwayat_poin)} ket={`${s?.riwayat_n ?? 0} laporan dari ${s?.riwayat_orang ?? 0} orang`} sorot={s?.sumber_berlaku === "riwayat" || s?.sumber_berlaku === "gabungan"} />
        <Kotak judul="Poin berlaku" nilai={fmtPoin(s?.poin_berlaku)} ket={s?.berlaku_at ? `sejak ${waktu(s.berlaku_at)}` : undefined} sorot />
        <Kotak judul="Sumber berlaku" nilai={s?.sumber_berlaku ? LABEL_SUMBER[s.sumber_berlaku] : "–"} ket={s?.kandidat && s.kandidat !== String(s.poin_berlaku) ? `hitungan terbaru ${fmtPoin(s.kandidat)} (${s.sumber_kandidat ? LABEL_SUMBER[s.sumber_kandidat] : "-"})` : undefined} />
      </div>

      {s?.menunggu_id && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#F0C36D] bg-[#FFF8E6] px-3 py-2">
          <p className="m-0 text-[13px] text-[#1B2B4B]">
            <b>Menunggu persetujuan:</b> {fmtPoin(s.poin_berlaku)} → <b>{fmtPoin(s.menunggu_poin)}</b> ({s.menunggu_sumber ? LABEL_SUMBER[s.menunggu_sumber] : "-"}; berubah {persenUbah(berlaku, angkaAtauNull(s.menunggu_poin)) ?? "-"}%), diajukan {s.menunggu_oleh_nama ?? "sistem"}.
            Poin baru hanya berlaku untuk delegasi baru.
          </p>
          {boleh && (
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" className={tombolUtama} disabled={mengirim} onClick={() => void kirim("keu_poin_putus", { p_riwayat: s.menunggu_id, p_setuju: true })}>Setujui</button>
              <label className="block min-w-[180px] flex-1"><span className={label}>Alasan menolak</span><input className={kolom} maxLength={300} value={tolak} onChange={(e) => setTolak(e.target.value)} /></label>
              <button type="button" className={tombolKecil} disabled={mengirim || tolak.trim().length < 5} onClick={() => void kirim("keu_poin_putus", { p_riwayat: s.menunggu_id, p_setuju: false, p_catatan: tolak.trim() })}>Tolak</button>
            </div>
          )}
        </div>
      )}

      {boleh ? (
        <div className="grid gap-2.5 border-t border-[#E6ECF5] pt-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={label}>Input manual</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cara mengisi">
              <button type="button" className={mode === "poin" ? tombolUtama : tombolKecil} onClick={() => setMode("poin")}>Poin per {jenis.satuan}</button>
              <button type="button" className={mode === "hari" ? tombolUtama : tombolKecil} onClick={() => setMode("hari")}>{jenis.satuan} per hari</button>
            </div>
          </div>
          <label className="block min-w-0"><span className={label}>{mode === "poin" ? `Poin per ${jenis.satuan}` : `Jumlah ${jenis.satuan} per hari`}</span>
            <input className={kolom} inputMode="decimal" value={isian} onChange={(e) => setIsian(e.target.value)} placeholder={mode === "poin" ? "mis. 8,33" : "mis. 12"} />
          </label>
          <div className="flex min-w-0 items-end text-[12.5px] text-[#44546F]">
            {poinIsian !== null ? <span>= <b>{fmtPoin(poinIsian)}</b> poin per {jenis.satuan} ({fmtPoin(perHariDariPoin(poinIsian, kapasitas))} per hari){ubah !== null ? ` · berubah ${ubah}%` : ""}</span> : <span>Isi angka lebih dari 0.</span>}
          </div>
          <label className="flex min-h-[40px] items-center gap-2 text-[13px] sm:col-span-2">
            <input type="checkbox" checked={timpa} onChange={(e) => setTimpa(e.target.checked)} className="h-4 w-4" />
            Menimpa riwayat dan usul pegawai (wajib beralasan)
          </label>
          <label className="block min-w-0 sm:col-span-2"><span className={label}>Alasan (wajib, min. 5 huruf)</span>
            <input className={kolom} maxLength={300} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" className={tombolUtama} disabled={mengirim || poinIsian === null || alasan.trim().length < 5} onClick={() => void simpan(false)}>Simpan input manual</button>
            {s?.manual != null && <button type="button" className={tombolKecil} disabled={mengirim || alasan.trim().length < 5} onClick={() => void simpan(true)}>Hapus input manual</button>}
          </div>
          <p className="m-0 text-[12px] text-[#5B6B84] sm:col-span-2">Perubahan lebih dari ambang (bawaan 25%) menunggu persetujuan pemberi delegasi lain. Poin baru hanya berlaku untuk delegasi baru.</p>
        </div>
      ) : <p className="m-0 text-[12.5px] text-[#5B6B84]">Mengubah poin hanya untuk pemberi delegasi tingkat tim.</p>}
      <Galat pesan={galat} />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="m-0 text-[13.5px] font-bold text-[#0F2A52]">Riwayat perubahan</h4>
          <select className={`${kolom} !w-auto`} aria-label="Saring status riwayat" value={saringStatus} onChange={(e) => setSaringStatus(e.target.value)}>
            <option value="">Semua status</option>
            {(Object.keys(LABEL_STATUS_RIWAYAT) as RiwayatPoin["status"][]).map((k) => <option key={k} value={k}>{LABEL_STATUS_RIWAYAT[k]}</option>)}
          </select>
        </div>
        {riwayat.length === 0 ? <p className="m-0 text-[12.5px] text-[#5B6B84]">Belum ada riwayat.</p> : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
            {riwayat.map((r) => (
              <li key={r.id} className="rounded-md bg-[#F5F8FE] px-2.5 py-1.5">
                <b>{fmtPoin(r.poin_lama)} → {fmtPoin(r.poin_baru)}</b> · {LABEL_SUMBER[r.sumber as keyof typeof LABEL_SUMBER] ?? r.sumber} · {LABEL_STATUS_RIWAYAT[r.status]}
                <span className="text-[#5B6B84]"> · {waktu(r.diajukan_at)}{r.diajukan_oleh_nama ? ` · ${r.diajukan_oleh_nama}` : ""}</span>
                {r.alasan && <span className="block text-[#44546F]">{r.alasan}</span>}
                {r.catatan_putus && <span className="block text-[#7A1D22]">Diputus {r.diputus_oleh_nama ?? ""}: {r.catatan_putus}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function PoinBeban() {
  const sel = useBacaKeu<BarisSelPoin>(urlBaca("keu_v_poin_sel", {}, { batas: 2000 }));
  const jenis = useBacaKeu<JenisPoin>(urlBaca("keu_v_poin_jenis", {}, { urut: "urut", batas: 500 }));
  const survei = useBacaKeu<SurveiPoin>(urlBaca("keu_v_poin_survei", {}, { urut: "urut", batas: 200 }));
  const atur = useBacaKeu<AturPoin>(urlBaca("keu_v_poin_atur", {}, { urut: "kunci", batas: 50 }));
  const boleh = useBoleh("delegasi_beri", null) === true;
  const muatSemua = async () => { await Promise.all([sel.muat(), jenis.muat(), survei.muat(), atur.muat()]); };
  const { kirim, mengirim, galat } = useKirim(muatSemua);
  const [saring, setSaring] = useState("");
  const [surveiPilih, setSurveiPilih] = useState<number | null>(null);
  const [pilih, setPilih] = useState<{ jenis: number; survei: number } | null>(null);
  const [nilaiAtur, setNilaiAtur] = useState<Record<string, string>>({});
  const [baru, setBaru] = useState({ kode: "", nama: "", pola: "" });

  const kapasitas = angkaAtauNull(atur.baris?.find((a) => a.kunci === "kapasitas")?.nilai) ?? 100;
  const m = useMemo(() => susunMatriks(jenis.baris ?? [], survei.baris ?? [], sel.baris ?? [], saring, surveiPilih), [jenis.baris, survei.baris, sel.baris, saring, surveiPilih]);
  const nMenunggu = (sel.baris ?? []).filter((x) => x.menunggu_id).length;
  const jPilih = pilih ? (jenis.baris ?? []).find((j) => j.id === pilih.jenis) ?? null : null;
  const sPilih = pilih ? (survei.baris ?? []).find((s) => s.id === pilih.survei) ?? null : null;
  const selPilih = pilih ? (sel.baris ?? []).find((x) => x.jenis_id === pilih.jenis && x.survei_id === pilih.survei) ?? null : null;
  const galatBaca = sel.galat ?? jenis.galat ?? survei.galat ?? atur.galat;

  if (galatBaca) return <Galat pesan={galatBaca} />;
  if (!sel.baris || !jenis.baris || !survei.baris || !atur.baris) return <Memuat />;

  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-2.5`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className={`${judulKartu} m-0`}>Poin beban kerja</h2>
            <p className="m-0 text-[12.5px] text-[#5B6B84]">Sumber utama poin per satuan menurut jenis pekerjaan dan survei. {kapasitas} poin = satu hari kerja penuh. Ketuk sel untuk melihat sumber dan mengubahnya.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {nMenunggu > 0 && <Chip warna="kuning">{nMenunggu} menunggu persetujuan</Chip>}
            {boleh && <button type="button" className={tombolKecil} disabled={mengirim} onClick={() => void kirim("keu_poin_hitung_ulang", {})}>Hitung ulang dari sumber terbaru</button>}
          </div>
        </div>
        <Catatan>
          Urutan sumber: riwayat (min. laporan dan orang menurut pengaturan), lalu usul pegawai, lalu input manual, lalu data awal; input manual yang dicentang &quot;menimpa&quot; selalu dipakai.
          Huruf di sel: A data awal, M manual, U usul, R riwayat, G riwayat + usul; titik kuning = menunggu persetujuan. Katalog Delego masih memakai skala 75 sampai kapasitas Delego dipindah ke 100.
        </Catatan>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block min-w-0"><span className={label}>Saring jenis pekerjaan</span><input className={kolom} value={saring} onChange={(e) => setSaring(e.target.value)} placeholder="mis. periksa" /></label>
          <label className="block min-w-0"><span className={label}>Saring survei</span>
            <select className={kolom} value={surveiPilih ?? ""} onChange={(e) => setSurveiPilih(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Semua survei</option>
              {(survei.baris ?? []).filter((s) => s.aktif).map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full border-collapse text-[12.5px]" aria-label="Matriks poin per satuan: jenis pekerjaan × survei">
            <thead className="bg-[#EEF3FB]">
              <tr>
                <th className={`${th} sticky left-0 z-[1] min-w-[120px] bg-[#EEF3FB]`}>Jenis pekerjaan</th>
                {m.kolom.map((k) => <th key={k.id} className={`${th} min-w-[64px] text-center`}>{k.nama}</th>)}
              </tr>
            </thead>
            <tbody>
              {m.baris.map((b) => (
                <tr key={b.jenis.id} className="border-t border-[#EEF1F6]">
                  <th scope="row" className={`${td} sticky left-0 z-[1] bg-white text-left font-semibold text-[#0F2A52]`}>
                    {b.jenis.nama}<span className="block text-[11px] font-normal text-[#5B6B84]">per {b.jenis.satuan}</span>
                  </th>
                  {m.kolom.map((k) => {
                    const x = b.sel.get(k.id);
                    const aktif = pilih?.jenis === b.jenis.id && pilih.survei === k.id;
                    return (
                      <td key={k.id} className="px-1 py-1 text-center">
                        <button type="button" onClick={() => setPilih(aktif ? null : { jenis: b.jenis.id, survei: k.id })} aria-pressed={aktif}
                          title={x ? `${fmtPoin(x.poin_berlaku)} poin · ${x.sumber_berlaku ? LABEL_SUMBER[x.sumber_berlaku] : "-"}` : "Belum diisi"}
                          className={`relative min-h-[40px] w-full rounded-md px-1 text-[13px] ${aktif ? "bg-[#1F5FD1] font-bold text-white" : x?.poin_berlaku != null ? "bg-[#F3F7FD] font-bold text-[#0F2A52] hover:bg-[#E3EEFF]" : "text-[#8A97AD] hover:bg-[#F3F7FD]"}`}>
                          {x?.poin_berlaku != null ? fmtPoin(x.poin_berlaku) : "–"}
                          {x?.sumber_berlaku && <span className={`ml-0.5 align-super text-[9.5px] font-semibold ${aktif ? "text-white" : "text-[#5B6B84]"}`}>{HURUF_SUMBER[x.sumber_berlaku]}</span>}
                          {x?.menunggu_id && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#E0A100]" aria-label="menunggu persetujuan" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {m.baris.length === 0 && <tr><td className={td} colSpan={m.kolom.length + 1}>Tidak ada jenis pekerjaan yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
        <Galat pesan={galat} />
      </section>

      {pilih && jPilih && sPilih && (
        <Rincian key={`${pilih.jenis}-${pilih.survei}-${selPilih?.id ?? "baru"}`} s={selPilih} jenis={jPilih} survei={sPilih} boleh={boleh} kapasitas={kapasitas} onSelesai={muatSemua} />
      )}

      <section className={`${kartu} flex flex-col gap-2`}>
        <h3 className={`${judulKartu} m-0`}>Pengaturan hitungan</h3>
        <p className="m-0 text-[12.5px] text-[#5B6B84]">Angka usul yang menunggu keputusan dan dapat diubah. Perubahan baru dipakai saat dihitung ulang.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead><tr className="bg-[#EEF3FB]"><th className={th}>Pengaturan</th><th className={`${th} text-right`}>Nilai</th><th className={th}>Diubah</th></tr></thead>
            <tbody>
              {(atur.baris ?? []).map((a) => (
                <tr key={a.kunci} className="border-t border-[#EEF1F6]">
                  <td className={td}><b className="text-[#0F2A52]">{a.kunci}</b><span className="block text-[#5B6B84]">{a.ket}</span></td>
                  <td className={`${td} text-right`}>
                    {boleh ? (
                      <div className="flex justify-end gap-1">
                        <input className={`${kolom} !w-[78px] text-right`} inputMode="decimal" aria-label={`Nilai ${a.kunci}`} value={nilaiAtur[a.kunci] ?? String(a.nilai).replace(".", ",")} onChange={(e) => setNilaiAtur({ ...nilaiAtur, [a.kunci]: e.target.value })} />
                        <button type="button" className={tombolKecil} disabled={mengirim || nilaiAtur[a.kunci] === undefined} onClick={() => void kirim("keu_poin_atur_simpan", { p_kunci: a.kunci, p_nilai: Number((nilaiAtur[a.kunci] ?? "").replace(",", ".")) }).then((ok) => { if (ok) { const n = { ...nilaiAtur }; delete n[a.kunci]; setNilaiAtur(n); } })}>Simpan</button>
                      </div>
                    ) : <b>{fmtPoin(a.nilai)}</b>}
                  </td>
                  <td className={`${td} text-[#5B6B84]`}>{a.diubah_oleh_nama ? `${a.diubah_oleh_nama}, ${waktu(a.diubah_at)}` : "nilai bawaan"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${kartu} flex flex-col gap-2`}>
        <h3 className={`${judulKartu} m-0`}>Survei pada matriks</h3>
        <p className="m-0 text-[12.5px] text-[#5B6B84]">Pola dipakai mengenali survei dari nama kegiatan, identifikasi, atau judul delegasi (riwayat dan usul pegawai). Tanpa pola = Umum.</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
          {(survei.baris ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 border-t border-[#EEF1F6] pt-1">
              <b className="text-[#0F2A52]">{s.nama}</b><span className="font-mono text-[11.5px] text-[#5B6B84]">{s.kode}</span>
              {s.pola && <span className="break-all font-mono text-[11.5px] text-[#44546F]">/{s.pola}/</span>}
              {!s.aktif && <Chip warna="abu">Nonaktif</Chip>}
            </li>
          ))}
        </ul>
        {boleh && (
          <div className="grid gap-2 border-t border-[#E6ECF5] pt-2 sm:grid-cols-3">
            <label className="block min-w-0"><span className={label}>Kode (huruf kecil)</span><input className={kolom} value={baru.kode} onChange={(e) => setBaru({ ...baru, kode: e.target.value })} placeholder="mis. vhts" /></label>
            <label className="block min-w-0"><span className={label}>Nama</span><input className={kolom} value={baru.nama} onChange={(e) => setBaru({ ...baru, nama: e.target.value })} /></label>
            <label className="block min-w-0"><span className={label}>Pola (opsional)</span><input className={kolom} value={baru.pola} onChange={(e) => setBaru({ ...baru, pola: e.target.value })} placeholder="mis. vhts|harga" /></label>
            <div className="sm:col-span-3">
              <button type="button" className={tombolUtama} disabled={mengirim || baru.kode.trim().length < 2 || baru.nama.trim().length < 2}
                onClick={() => void kirim("keu_poin_survei_simpan", { p_data: { kode: baru.kode.trim(), nama: baru.nama.trim(), pola: baru.pola.trim(), urut: 100 } }).then((ok) => { if (ok) setBaru({ kode: "", nama: "", pola: "" }); })}>
                Tambah survei
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
