"use client";

// app/sigap/delego/skor/page.tsx
//
// (1 Nov 2026) Katalog skor beban kerja dalam satu menu. Pekerjaan yang belum punya skor dapat diajukan; saat skor diketik muncul peringatan bila berbeda jauh
// dari pekerjaan bersatuan sama (wajib beralasan). Ketua Tim menyetujui, mengubah skor (beralasan), atau menolak. Skor bersifat subjektif tetapi terbuka.

import { useMemo, useState } from "react";
import { angka } from "@/lib/delego/hitung";
import { bandingSkor, galatAlasanSkor, kalibrasi, type KertasKerja } from "@/lib/delego/skor";
import { menitDariPoin } from "@/lib/delego/teknis";
import { MIN_HURUF } from "@/lib/delego/tinjau";
import type { JenisSkor, StatusSkor } from "@/lib/delego/tipe";
import { aksiKeu, useKalibrasi, useKatalogSkor, useKirim } from "../data";
import KertasKerjaPanel, { type HasilKertasPakai } from "../KertasKerja";
import { KELAS } from "../merek";
import type { Nada } from "../merek";
import Link from "next/link";
import { useKonteksDelego } from "../konteks";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, Peringatan, fmt } from "../ui";

const NADA: Record<StatusSkor, Nada> = { usulan: "biru", disetujui: "hijau", ditolak: "merah" };
const TEKS: Record<StatusSkor, string> = { usulan: "Menunggu putusan", disetujui: "Disetujui", ditolak: "Ditolak" };

function BarisUsulan({ j, kirim }: { j: JenisSkor; kirim: ReturnType<typeof useKirim> }) {
  const [poin, setPoin] = useState(String(angka(j.poin_per_satuan)));
  const [alasan, setAlasan] = useState("");
  const berubah = angka(poin.replace(",", ".")) !== angka(j.poin_per_satuan);
  const perluAlasan = berubah && alasan.trim().length < MIN_HURUF.skorUbah;
  return (
    <div className="space-y-2 rounded-lg border border-[#D5DCE2] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[14.5px] font-semibold">{j.nama}</div>
          <div className="text-[12.5px] text-[#3B4A57]">
            Diusulkan {j.diusulkan_nama ?? "pegawai"} · {fmt(angka(j.poin_per_satuan), 1)} poin per {j.satuan} (sekitar {fmt(menitDariPoin(angka(j.poin_per_satuan)), 0)} menit)
          </div>
          {j.skor_alasan && <div className="mt-1 text-[13px] leading-snug">Alasan pengusul: {j.skor_alasan}</div>}
        </div>
        <Lencana nada="biru">Menunggu putusan</Lencana>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
        <Medan label="Skor akhir">
          <input className={KELAS.isian} inputMode="decimal" value={poin} onChange={(e) => setPoin(e.target.value)} />
        </Medan>
        <Medan label={berubah ? "Alasan mengubah skor / menolak" : "Alasan (wajib bila menolak)"}>
          <input className={KELAS.isian} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} />
        </Medan>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={KELAS.tombolKecilUtama}
          disabled={kirim.mengirim || perluAlasan || !(angka(poin.replace(",", ".")) > 0)}
          onClick={() => void kirim.kirim("keu_dlg_skor_putus", { p_id: j.id, p_putusan: "setuju", p_poin: angka(poin.replace(",", ".")), p_alasan: alasan.trim() })}
        >
          {berubah ? "Setujui dengan skor ini" : "Setujui"}
        </button>
        <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim || alasan.trim().length < MIN_HURUF.usulanTolak} onClick={() => void kirim.kirim("keu_dlg_skor_putus", { p_id: j.id, p_putusan: "tolak", p_alasan: alasan.trim() })}>
          Tolak
        </button>
      </div>
    </div>
  );
}

export default function Skor() {
  const kat = useKatalogSkor();
  const kirim = useKirim(kat.muat);
  const d = kat.data;
  const kal = useKalibrasi(!!d?.boleh_putus);
  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [satuan, setSatuan] = useState("");
  const [skor, setSkor] = useState("");
  const [uraian, setUraian] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kertas, setKertas] = useState<KertasKerja | null>(null);
  const [bukaKertas, setBukaKertas] = useState(false);
  const { pemberi } = useKonteksDelego();
  const [kirimBaru, setKirimBaru] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const pps = angka(skor.replace(",", "."));
  const banding = useMemo(() => (d ? bandingSkor(d.jenis, satuan, pps) : null), [d, satuan, pps]);
  const galatAlasan = banding ? galatAlasanSkor(banding, alasan) : null;
  const siap = nama.trim().length >= 3 && satuan.trim() !== "" && pps > 0 && !galatAlasan;

  const pakaiKertas = (h: HasilKertasPakai) => {
    setKertas(h.kertas);
    setSkor(String(h.skor));
    if (!satuan.trim()) setSatuan(h.satuan);
  };

  async function ajukan() {
    setKirimBaru(true);
    setGalat(null);
    setOk(null);
    const r = await aksiKeu("keu_dlg_skor_ajukan", {
      p_data: { nama: nama.trim(), satuan: satuan.trim(), poin_per_satuan: pps, uraian: uraian.trim(), skor_alasan: alasan.trim(), ...(kertas ? { kertas_kerja: kertas } : {}) },
    });
    setKirimBaru(false);
    if (!r.ok) {
      setGalat(r.pesan);
      return;
    }
    setOk("Usulan skor terkirim. Ketua Tim akan memutuskan; pekerjaan ini dapat dipakai setelah disetujui.");
    setNama("");
    setSatuan("");
    setSkor("");
    setUraian("");
    setAlasan("");
    setKertas(null);
    setBuka(false);
    await kat.muat();
  }

  const siapPakai = d?.jenis.filter((j) => j.skor_status === "disetujui" && j.aktif) ?? [];
  const usulan = d?.jenis.filter((j) => j.skor_status === "usulan") ?? [];
  const ditolak = d?.jenis.filter((j) => j.skor_status === "ditolak") ?? [];

  return (
    <Halaman
      judul="Katalog skor beban kerja"
      sub={`1 poin setara sekitar ${fmt(menitDariPoin(1), 0)} menit kerja. Skor bersifat subjektif tetapi terbuka dan dapat ditinjau.`}
      kanan={
        <button type="button" className={KELAS.tombolUtama} onClick={() => setBuka((b) => !b)}>
          {buka ? "Tutup form" : "Ajukan pekerjaan atau skor baru"}
        </button>
      }
    >
      <Info>Mulai 16 Nov 2026 skor di katalog ini (skala 75 poin per hari) hanya menjadi data awal. Delegasi baru memakai poin per satuan dari <Link href="/sigap/kelola/master?tab=poin" className="font-semibold underline">Master &gt; Poin beban kerja</Link> (skala 100 poin per hari, berbeda per survei).</Info>
      {pemberi && (
        <p className="m-0 text-[13px] text-[#3B4A57]">
          Untuk mengatur langkah bawaan, kewajiban hasil kerja, dan tinjau per jenis pekerjaan, buka <Link href="/sigap/delego/jenis" className="font-semibold text-[#0F6B63] underline">Pengaturan jenis pekerjaan</Link>.
        </p>
      )}
      {kat.memuat && !d && <Memuat />}
      {kat.galat && !d && <Galat>{kat.galat}</Galat>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {ok && <Info>{ok}</Info>}
      {buka && (
        <Kartu judul="Ajukan pekerjaan atau skor baru">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Medan label="Nama pekerjaan">
                  <input className={KELAS.isian} value={nama} onChange={(e) => setNama(e.target.value)} maxLength={80} placeholder="Mis. Memeriksa dokumen Seruti" />
                </Medan>
              </div>
              <Medan label="Satuan">
                <input className={KELAS.isian} value={satuan} onChange={(e) => setSatuan(e.target.value)} maxLength={30} placeholder="dokumen" />
              </Medan>
              <Medan label="Skor per satuan (poin)">
                <input className={KELAS.isian} inputMode="decimal" value={skor} onChange={(e) => setSkor(e.target.value)} />
              </Medan>
              <Medan label="Uraian singkat">
                <input className={KELAS.isian} value={uraian} onChange={(e) => setUraian(e.target.value)} maxLength={300} />
              </Medan>
            </div>
            {banding && pps > 0 && satuan.trim() !== "" && (
              <div className="space-y-2">
                {banding.peringatan ? <Peringatan>{banding.pesan}</Peringatan> : <Info>{banding.pesan}</Info>}
                {banding.setara.length > 0 && (
                  <div className="text-[12.5px] text-[#3B4A57]">
                    Pekerjaan lain bersatuan sama: {banding.setara.map((s) => `${s.nama} (${fmt(s.poin, 1)} poin, sekitar ${fmt(s.menit, 0)} menit)`).join("; ")}
                  </div>
                )}
                {banding.setaraLain.length > 0 && (
                  <div className="text-[12.5px] text-[#3B4A57]">
                    Beban sebanding pada satuan lain: {banding.setaraLain.map((s) => `${s.nama} (${fmt(s.poin, 1)} poin per ${s.satuan})`).join("; ")}
                  </div>
                )}
                {banding.perluAlasan && (
                  <Medan label="Alasan skor" bantu={galatAlasan ?? undefined}>
                    <textarea className={KELAS.isian} rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} />
                  </Medan>
                )}
              </div>
            )}
            <div>
              <button type="button" className={KELAS.tombolKecil} aria-expanded={bukaKertas} onClick={() => setBukaKertas((b) => !b)}>
                {bukaKertas ? "Tutup kertas kerja" : "Bantu hitung skor dengan kertas kerja"}
              </button>
            </div>
            {bukaKertas && <KertasKerjaPanel onPakai={(h) => { pakaiKertas(h); setBukaKertas(false); }} />}
            {kertas && <Info>Skor di atas dihitung dari kertas kerja dan akan disimpan bersama usulan agar Ketua Tim dapat memeriksa dasar hitungnya.</Info>}
            {galat && <Galat>{galat}</Galat>}
            {!siap && (
              <p className="m-0 text-[12.5px] text-[#8A4605]">
                Belum lengkap:{" "}
                {[nama.trim().length < 3 ? "nama pekerjaan (min. 3 huruf)" : null, satuan.trim() === "" ? "satuan" : null, !(pps > 0) ? "skor per satuan" : null, galatAlasan ? "alasan skor" : null].filter(Boolean).join(", ")}.
              </p>
            )}
            <button type="button" className={KELAS.tombolUtama} disabled={!siap || kirimBaru} onClick={() => void ajukan()}>
              {kirimBaru ? "Mengirim..." : "Kirim usulan ke Ketua Tim"}
            </button>
          </div>
        </Kartu>
      )}

      {d && d.boleh_putus && (
        <Kartu judul={`Menunggu putusan Anda (${usulan.length})`}>
          {usulan.length === 0 ? <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada usulan skor yang menunggu.</p> : <div className="space-y-3">{usulan.map((j) => <BarisUsulan key={j.id} j={j} kirim={kirim} />)}</div>}
        </Kartu>
      )}
      {d && !d.boleh_putus && usulan.length > 0 && (
        <Kartu judul={`Usulan skor yang menunggu Ketua Tim (${usulan.length})`}>
          <ul className="m-0 list-none space-y-1 p-0 text-[13.5px]">
            {usulan.map((j) => (
              <li key={j.id}>
                {j.nama} · {fmt(angka(j.poin_per_satuan), 1)} poin per {j.satuan}
              </li>
            ))}
          </ul>
        </Kartu>
      )}

      {d && (
        <Kartu judul={`Skor yang berlaku (${siapPakai.length})`}>
          {siapPakai.length === 0 ? (
            <Kosong>Belum ada pekerjaan bersatuan yang disetujui.</Kosong>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-[#D5DCE2] text-[12.5px] text-[#3B4A57]">
                    <th className="py-1.5 pr-3 font-semibold">Pekerjaan</th>
                    <th className="py-1.5 pr-3 font-semibold">Satuan</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Poin</th>
                    <th className="py-1.5 text-right font-semibold">Menit</th>
                  </tr>
                </thead>
                <tbody>
                  {siapPakai.map((j) => (
                    <tr key={j.id} className="border-b border-[#EEF1F4]">
                      <td className="py-1.5 pr-3">
                        <div className="font-semibold">{j.nama}</div>
                        {j.uraian && <div className="text-[12.5px] text-[#3B4A57]">{j.uraian}</div>}
                      </td>
                      <td className="py-1.5 pr-3">{j.satuan}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold">{fmt(angka(j.poin_per_satuan), 1)}</td>
                      <td className="py-1.5 text-right">{fmt(menitDariPoin(angka(j.poin_per_satuan)), 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>
      )}
      {d && d.boleh_putus && kal.data && (
        <Kartu judul="Kalibrasi dari waktu nyata">
          {kal.data.jenis.length === 0 ? (
            <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada laporan yang mengisi jam kerja nyata. Pegawai dapat mengisinya (opsional) di form Lapor harian; setelah beberapa laporan terkumpul, skor yang menyimpang lebih dari 25% ditandai di sini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-[#D5DCE2] text-[12.5px] text-[#3B4A57]">
                    <th className="py-1.5 pr-3 font-semibold">Pekerjaan</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Laporan</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Skor (menit)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Nyata (rata-rata)</th>
                    <th className="py-1.5 font-semibold">Penilaian</th>
                  </tr>
                </thead>
                <tbody>
                  {kal.data.jenis.map((j) => {
                    const perkiraan = menitDariPoin(angka(j.poin_per_satuan));
                    const h = kalibrasi(perkiraan, j.menit.map((m) => angka(m)));
                    const cukup = h.n >= 3;
                    return (
                      <tr key={j.id} className="border-b border-[#EEF1F4]">
                        <td className="py-1.5 pr-3 font-semibold">{j.nama} <span className="font-normal text-[#3B4A57]">per {j.satuan}</span></td>
                        <td className="py-1.5 pr-3 text-right">{h.n}</td>
                        <td className="py-1.5 pr-3 text-right">{fmt(perkiraan, 0)}</td>
                        <td className="py-1.5 pr-3 text-right">{h.rata === null ? "-" : fmt(h.rata, 0)}</td>
                        <td className="py-1.5">
                          {!cukup ? <Lencana nada="abu">Data belum cukup (min. 3)</Lencana> : h.menyimpang ? <Lencana nada="amber">{(h.selisih ?? 0) > 0 ? "Skor kerendahan" : "Skor ketinggian"} ({fmt(Math.abs((h.selisih ?? 0) * 100), 0)}%)</Lencana> : <Lencana nada="hijau">Wajar</Lencana>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="m-0 mt-2 text-[12.5px] text-[#3B4A57]">Hanya penanda. Skor tidak berubah otomatis; Ketua Tim yang menilai apakah perlu ditinjau ulang.</p>
        </Kartu>
      )}
      {ditolak.length > 0 && (
        <Kartu judul={`Ditolak (${ditolak.length})`}>
          <ul className="m-0 list-none space-y-1 p-0 text-[13px] text-[#3B4A57]">
            {ditolak.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#14212B]">{j.nama}</span>
                <Lencana nada={NADA.ditolak}>{TEKS.ditolak}</Lencana>
                <span>{j.skor_alasan}</span>
              </li>
            ))}
          </ul>
        </Kartu>
      )}
    </Halaman>
  );
}
