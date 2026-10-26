"use client";

// app/sigap/delego/Detail.tsx
//
// (26 Okt 2026) Panel rincian satu delegasi (dari Papan): progres, laporan, tanggapan. Pemberi dapat mengubah isian, status, dan menanggapi.
// Perubahan lewat keu_dlg_ubah / keu_dlg_tanggapi; hak ditegakkan basis data.

import Link from "next/link";
import { useEffect, useState } from "react";
import { angka, bulat, identBerubah, namaLibur, ringkasHariIni, targetPenuh, tglPendek } from "@/lib/delego/hitung";
import { NAMA_PERAN, NAMA_STATUS, type BahanTim, type Delegasi, type StatusDelegasi } from "@/lib/delego/tipe";
import { useKirim } from "./data";
import { DaftarBukti } from "./BuktiFoto";
import { KELAS } from "./merek";
import { Batang, Galat, Info, Kartu, Lencana, Medan, NADA_STATUS, Peringatan, fmt } from "./ui";

const STATUS: StatusDelegasi[] = ["baru", "berjalan", "ditunda", "selesai", "batal"];

export default function Detail({ d, b, bolehUbah, hari, tutup, muat }: { d: Delegasi; b: BahanTim; bolehUbah: boolean; hari: string; tutup: () => void; muat: () => Promise<void> }) {
  const r = ringkasHariIni(d, b.laporan, hari);
  const penuh = targetPenuh(d);
  const laporan = b.laporan.filter((l) => l.delegasi_id === d.id);
  const tanggapan = b.tanggapan.filter((t) => t.delegasi_id === d.id);

  const [judul, setJudul] = useState(d.judul);
  const [uraian, setUraian] = useState(d.uraian);
  const [pj, setPj] = useState(d.pj_bidang);
  const [harian, setHarian] = useState(String(angka(d.target_harian)));
  const [total, setTotal] = useState(d.target_total === null ? "" : String(angka(d.target_total)));
  const [bobot, setBobot] = useState(String(d.bobot));
  const [tenggat, setTenggat] = useState(d.tenggat);
  const [status, setStatus] = useState<StatusDelegasi>(d.status);
  const [alasan, setAlasan] = useState(d.alasan);
  const [isi, setIsi] = useState("");
  const [lap, setLap] = useState("");
  const [tMulai, setTMulai] = useState("");
  const [tBaru, setTBaru] = useState("");
  const [tAlasan, setTAlasan] = useState("");
  const kirim = useKirim(muat);
  const berubah = identBerubah(d);
  const riwayat = [...(d.riwayat_target ?? [])].sort((a, z) => a.berlaku_mulai.localeCompare(z.berlaku_mulai));
  const dasarIdent = d.ident_id ? `/sigap/kelola/perencanaan/identifikasi/${d.ident_id}` : null;

  useEffect(() => {
    // data segar dari basis data menggantikan isian formulir
    setJudul(d.judul); setUraian(d.uraian); setPj(d.pj_bidang); setHarian(String(angka(d.target_harian)));
    setTotal(d.target_total === null ? "" : String(angka(d.target_total))); setBobot(String(d.bobot)); setTenggat(d.tenggat); setStatus(d.status); setAlasan(d.alasan);
  }, [d.ver]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && tutup();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [tutup]);

  const simpan = () =>
    kirim.kirim("keu_dlg_ubah", {
      p_id: d.id,
      p_data: { judul, uraian, pj_bidang: pj, target_harian: harian, target_total: total.trim() === "" ? null : total, bobot, tenggat, status, alasan },
    });
  const aturTarget = async () => {
    const ok = await kirim.kirim("keu_dlg_target_atur", { p_id: d.id, p_mulai: tMulai, p_target: tBaru, p_alasan: tAlasan });
    if (ok) {
      setTMulai("");
      setTBaru("");
      setTAlasan("");
    }
  };
  const tinjau = () => kirim.kirim("keu_dlg_tinjau_ident", { p_id: d.id });
  const tanggapi = async () => {
    if (!isi.trim()) return;
    const ok = await kirim.kirim("keu_dlg_tanggapi", { p_delegasi: d.id, p_isi: isi.trim(), ...(lap ? { p_laporan: Number(lap) } : {}) });
    if (ok) {
      setIsi("");
      setLap("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 lg:items-stretch" role="dialog" aria-modal="true" aria-label={`Rincian delegasi ${d.judul}`} onMouseDown={(e) => e.target === e.currentTarget && tutup()}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-[#F3F5F7] p-4 lg:max-h-none lg:w-[560px] lg:rounded-none lg:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[18px] font-bold leading-snug">{d.judul}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[#3B4A57]">
              <Lencana nada={NADA_STATUS[d.status]}>{NAMA_STATUS[d.status]}</Lencana>
              <span>{d.penerima_nama} · {NAMA_PERAN[d.peran_penerima]}{d.pj_bidang ? ` · PJ ${d.pj_bidang}` : ""}</span>
            </div>
          </div>
          <button type="button" className={KELAS.tombolKecil} onClick={tutup} aria-label="Tutup">Tutup</button>
        </div>

        <div className="space-y-3">
          {berubah && (
            <Peringatan>
              <b>Identifikasi berubah.</b> Versi identifikasi naik dari {d.ident_ver} ke {d.ident_ver_kini} sejak delegasi ini dibuat atau terakhir ditinjau. Periksa apakah target, tenggat, atau penerima masih sesuai.
              <div className="mt-2 flex flex-wrap gap-2">
                {dasarIdent && <Link href={dasarIdent} className={KELAS.tombolKecil}>Buka identifikasi</Link>}
                {bolehUbah && <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim} onClick={() => void tinjau()}>Tandai sudah ditinjau</button>}
              </div>
            </Peringatan>
          )}
          <Kartu>
            <div className="flex justify-between text-[13.5px]"><span>{fmt(r.poinTotal, 1)} dari {fmt(penuh, 1)} {d.satuan}</span><b>{r.persenSelesai}%</b></div>
            <div className="mt-1.5"><Batang persen={r.persenSelesai} /></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#3B4A57]">
              <span>{tglPendek(d.mulai)} sampai {tglPendek(d.tenggat)}</span>
              <span>Target {fmt(angka(d.target_harian), 1)}/hari kerja</span>
              <span>Bobot {d.bobot}</span>
              <span>Dari {d.dari_nama ?? "-"}</span>
              {r.hutangKemarin > 0 && <b className="text-[#8A4605]">Hutang {fmt(bulat(r.hutangKemarin), 1)}</b>}
            </div>
            {d.uraian && <p className="m-0 mt-2 whitespace-pre-line text-[13.5px] leading-snug">{d.uraian}</p>}
            {dasarIdent && (
              <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                <Link href={dasarIdent} className="font-semibold text-[#0B524C] underline">Identifikasi</Link>
                <Link href={`${dasarIdent}/gap`} className="font-semibold text-[#0B524C] underline">Gap</Link>
                <Link href={`${dasarIdent}/lanjutan`} className="font-semibold text-[#0B524C] underline">Lanjutan</Link>
              </div>
            )}
          </Kartu>

          <Kartu judul="Laporan (35 hari)">
            {laporan.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada laporan.</p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {laporan.map((l) => (
                  <li key={l.id} className="text-[13px]">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{tglPendek(l.tanggal)} {l.terlambat && <Lencana nada="amber">Terlambat</Lencana>} {l.mewakili && <Lencana nada="biru">Diwakili</Lencana>}</span>
                      <b>{fmt(angka(l.poin), 1)}</b>
                    </div>
                    {l.uraian && <div className="text-[#33404B]">{l.uraian}</div>}
                    {l.kendala && <div className="text-[#8A4605]">Kendala: {l.kendala}</div>}
                    <DaftarBukti bukti={l.bukti} ukuran={64} />
                  </li>
                ))}
              </ul>
            )}
          </Kartu>

          {(riwayat.length > 1 || bolehUbah) && (d.status === "baru" || d.status === "berjalan" || d.status === "ditunda") && (
            <Kartu judul="Target harian per tanggal">
              {riwayat.length > 0 ? (
                <ul className="m-0 mb-3 list-none space-y-1 p-0 text-[13px]">
                  {riwayat.map((x) => (
                    <li key={x.berlaku_mulai} className="flex flex-wrap justify-between gap-2">
                      <span>Mulai {tglPendek(x.berlaku_mulai.slice(0, 10))}{x.alasan ? ` · ${x.alasan}` : ""}</span>
                      <b>{fmt(angka(x.target_harian), 1)}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mb-3 text-[13px] text-[#3B4A57]">Target tetap {fmt(angka(d.target_harian), 1)} per hari kerja sejak awal.</p>
              )}
              {bolehUbah && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Medan label="Berlaku mulai"><input type="date" min={hari} max={d.tenggat} className={KELAS.isian} value={tMulai} onChange={(e) => setTMulai(e.target.value)} /></Medan>
                    <Medan label="Target baru"><input type="number" min={0} step="any" className={KELAS.isian} value={tBaru} onChange={(e) => setTBaru(e.target.value)} /></Medan>
                  </div>
                  {tMulai && namaLibur(tMulai) && <Info>Tanggal itu libur ({namaLibur(tMulai)}); target mulai berlaku pada hari kerja berikutnya.</Info>}
                  <Medan label="Alasan (minimal 5 huruf)"><input className={KELAS.isian} maxLength={300} value={tAlasan} onChange={(e) => setTAlasan(e.target.value)} placeholder="mis. sebagian pekerjaan beralih ke rekan" /></Medan>
                  <button type="button" className={KELAS.tombolSekunder} disabled={kirim.mengirim || !tMulai || tBaru === "" || tAlasan.trim().length < 5} onClick={() => void aturTarget()}>Terapkan target baru</button>
                  <p className="m-0 text-[12px] text-[#3B4A57]">Tidak berlaku surut: hari sebelum tanggal berlaku tetap memakai target lama, jadi hutang dan skor masa lalu tidak berubah. Penerima mendapat notifikasi.</p>
                </div>
              )}
            </Kartu>
          )}

          <Kartu judul="Tanggapan">
            {tanggapan.length > 0 && (
              <ul className="m-0 mb-3 list-none space-y-2 p-0">
                {tanggapan.map((t) => (
                  <li key={t.id} className="rounded-lg bg-[#F1F7F6] px-3 py-2 text-[13px]">
                    <div className="text-[12px] font-semibold text-[#0B524C]">{t.dari_nama ?? "Pemberi"} · {tglPendek(t.dibuat_at.slice(0, 10))}</div>
                    {t.isi}
                  </li>
                ))}
              </ul>
            )}
            {bolehUbah ? (
              <div className="space-y-2">
                <textarea className={KELAS.isian} rows={2} maxLength={500} value={isi} onChange={(e) => setIsi(e.target.value)} placeholder="Tulis tanggapan untuk penerima" aria-label="Tanggapan" />
                <div className="flex flex-wrap gap-2">
                  <select className={`${KELAS.isian} !w-auto`} value={lap} onChange={(e) => setLap(e.target.value)} aria-label="Terkait laporan">
                    <option value="">Umum (tanpa laporan)</option>
                    {laporan.map((l) => (<option key={l.id} value={l.id}>Laporan {tglPendek(l.tanggal)}</option>))}
                  </select>
                  <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || !isi.trim()} onClick={() => void tanggapi()}>Kirim tanggapan</button>
                </div>
              </div>
            ) : tanggapan.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada tanggapan.</p>
            ) : null}
          </Kartu>

          {bolehUbah && (
            <Kartu judul="Ubah delegasi">
              <div className="space-y-3">
                <Medan label="Judul"><input className={KELAS.isian} value={judul} maxLength={200} onChange={(e) => setJudul(e.target.value)} /></Medan>
                <Medan label="Petunjuk"><textarea className={KELAS.isian} rows={3} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} /></Medan>
                <div className="grid grid-cols-2 gap-3">
                  <Medan label="Target harian" bantu="Berlaku mulai hari ini, tidak surut. Untuk tanggal lain pakai kartu Target harian per tanggal."><input type="number" min={0} step="any" className={KELAS.isian} value={harian} onChange={(e) => setHarian(e.target.value)} /></Medan>
                  <Medan label="Target total (opsional)"><input type="number" min={0} step="any" className={KELAS.isian} value={total} onChange={(e) => setTotal(e.target.value)} /></Medan>
                  <Medan label="Bobot (1-5)"><input type="number" min={1} max={5} className={KELAS.isian} value={bobot} onChange={(e) => setBobot(e.target.value)} /></Medan>
                  <Medan label="Tenggat"><input type="date" min={d.mulai} className={KELAS.isian} value={tenggat} onChange={(e) => setTenggat(e.target.value)} /></Medan>
                </div>
                <Medan label="PJ bidang (opsional)"><input className={KELAS.isian} value={pj} maxLength={80} onChange={(e) => setPj(e.target.value)} placeholder="mis. kualitas data" /></Medan>
                <Medan label="Status">
                  <select className={KELAS.isian} value={status} onChange={(e) => setStatus(e.target.value as StatusDelegasi)}>
                    {STATUS.map((s) => (<option key={s} value={s}>{NAMA_STATUS[s]}</option>))}
                  </select>
                </Medan>
                {(status === "ditunda" || status === "batal") && (
                  <Medan label="Alasan (wajib, minimal 5 huruf)"><input className={KELAS.isian} value={alasan} maxLength={300} onChange={(e) => setAlasan(e.target.value)} /></Medan>
                )}
                {kirim.galat && <Galat>{kirim.galat}</Galat>}
                <button type="button" className={`${KELAS.tombolUtama} w-full`} disabled={kirim.mengirim} onClick={() => void simpan()}>{kirim.mengirim ? "Menyimpan..." : "Simpan perubahan"}</button>
                <p className="m-0 text-[12px] text-[#3B4A57]">Penerima tidak dapat diganti; buat delegasi baru untuk memindahkan tugas. Penerima mendapat notifikasi setiap perubahan.</p>
              </div>
            </Kartu>
          )}
        </div>
      </div>
    </div>
  );
}
