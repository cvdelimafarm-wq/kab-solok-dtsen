"use client";

// app/sigap/delego/monitor/page.tsx
//
// (1 Nov 2026) Monitoring Kepala: tiga angka capaian per pegawai (mandiri, terverifikasi Ketua Tim, disanggah/dikoreksi), antrean tinjau per Ketua Tim,
// hambatan, usulan yang menunggu, dan sanggahan. Kepala meminta klarifikasi (pegawai berhak menjawab 2 hari kerja) lalu memutuskan benar, sebagian, atau salah.

import Link from "next/link";
import { useMemo, useState } from "react";
import { angka, awalBulan, awalMinggu, tglPendek } from "@/lib/delego/hitung";
import { MIN_HURUF, TEKS_KETERANGAN, angkaCapaian, galatPutusan, keteranganCapaian, rasioSanggahDitolak, ringkasMonitor, sisaHariJawab } from "@/lib/delego/tinjau";
import type { PutusanSanggah, SanggahMonitor } from "@/lib/delego/tipe";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import TabelInisiatif from "../TabelInisiatif";
import { useEskalasiBahan, useInisiatifRekap, useKirim, useMonitor } from "../data";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, Peringatan, Statistik, fmt } from "../ui";

function PutusSanggah({ s, hari, pemutus, kirim }: { s: SanggahMonitor; hari: string; pemutus: boolean; kirim: ReturnType<typeof useKirim> }) {
  const [putusan, setPutusan] = useState<PutusanSanggah>("benar");
  const [poin, setPoin] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bina, setBina] = useState(false);
  const sisa = sisaHariJawab(s.batas_jawab, hari);
  const poinLaporan = angka(s.poin);
  const g = galatPutusan(putusan, poinLaporan, poin, catatan);
  const bolehPutus = pemutus && (s.status === "menunggu_putusan" || (s.status === "menunggu_jawab" && sisa < 0));
  return (
    <div className={`${KELAS.kartu} space-y-2`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[14.5px] font-semibold">{s.judul}</div>
          <div className="text-[12.5px] text-[#3B4A57]">
            {s.penerima_nama} · laporan {tglPendek(s.tanggal)} · {fmt(poinLaporan, 1)} poin · disanggah {s.pengaju_nama}, {tglPendek(s.diajukan_at.slice(0, 10))}
          </div>
        </div>
        <Lencana nada={s.status === "diputus" ? "hijau" : s.status === "menunggu_putusan" ? "biru" : "amber"}>
          {s.status === "menunggu_jawab" ? (sisa >= 0 ? `Menunggu jawaban pegawai, sisa ${sisa} hari` : "Batas jawab lewat") : s.status === "menunggu_putusan" ? "Menunggu putusan" : `Diputus: ${s.putusan}`}
        </Lencana>
      </div>
      {s.uraian && <p className="m-0 text-[13.5px] leading-snug"><b>Laporan pegawai:</b> {s.uraian}</p>}
      <p className="m-0 text-[13.5px] leading-snug"><b>Alasan sanggahan:</b> {s.alasan}</p>
      {s.jawaban ? <p className="m-0 text-[13.5px] leading-snug"><b>Jawaban pegawai:</b> {s.jawaban}</p> : s.status !== "diputus" && <p className="m-0 text-[13px] text-[#8A4605]">Pegawai belum menjawab.</p>}
      {s.status === "diputus" && (
        <p className="m-0 text-[13.5px] leading-snug">
          <b>Putusan:</b> {s.putusan}, poin diakui {fmt(angka(s.poin_diakui), 1)}. {s.catatan_putusan}
        </p>
      )}
      {bolehPutus && (
        <div className="space-y-2 rounded-lg bg-[#F1F7F6] p-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Putusan">
            {(["benar", "sebagian", "salah"] as PutusanSanggah[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={putusan === p}
                onClick={() => setPutusan(p)}
                className={`min-h-[38px] rounded-lg border px-3 text-[13.5px] font-semibold ${putusan === p ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white"}`}
              >
                {p === "benar" ? "Laporan pegawai benar" : p === "sebagian" ? "Benar sebagian" : "Laporan tidak benar"}
              </button>
            ))}
          </div>
          {putusan === "sebagian" && (
            <Medan label={`Poin yang diakui (0 sampai kurang dari ${fmt(poinLaporan, 2)})`}>
              <input className={KELAS.isian} inputMode="decimal" value={poin} onChange={(e) => setPoin(e.target.value)} />
            </Medan>
          )}
          <Medan label="Catatan putusan" bantu={`Minimal ${MIN_HURUF.putusan} huruf. Dibaca pegawai dan Ketua Tim.`}>
            <textarea className={KELAS.isian} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </Medan>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={bina} onChange={(e) => setBina(e.target.checked)} /> Catat pembinaan langkah 1 untuk pegawai
          </label>
          {g && catatan.length > 0 && <div className="text-[12.5px] text-[#8A4605]">{g}</div>}
          <button
            type="button"
            className={KELAS.tombolKecilUtama}
            disabled={kirim.mengirim || !!g}
            onClick={() => void kirim.kirim("keu_dlg_sanggah_putus", { p_sanggah: s.id, p_putusan: putusan, p_poin: putusan === "sebagian" ? angka(poin.replace(",", ".")) : null, p_catatan: catatan.trim(), p_pembinaan: bina })}
          >
            Putuskan
          </button>
        </div>
      )}
    </div>
  );
}

export default function Monitor() {
  const { hari } = useKonteksDelego();
  const [rentang, setRentang] = useState<"bulan" | "pekan">("bulan");
  const dari = rentang === "bulan" ? awalBulan(hari) : awalMinggu(hari);
  const m = useMonitor(dari, hari);
  const kirim = useKirim(m.muat);
  const d = m.data;
  const r = useMemo(() => (d ? ringkasMonitor(d) : null), [d]);
  const capaian = useMemo(() => (d ? d.capaian.map(angkaCapaian).sort((a, b) => b.selisih - a.selisih) : []), [d]);
  const terbuka = d?.sanggah.filter((s) => s.status !== "diputus") ?? [];
  const selesai = d?.sanggah.filter((s) => s.status === "diputus") ?? [];
  // (14 Nov 2026, Fase 4b) butir lewat tenggat: ukuran selesai Fase 4 = tidak ada yang lewat batas jawab
  const esk = useEskalasiBahan();
  // (14 Nov 2026, Fase 4c) hitungan inisiatif bulan berjalan
  const ini = useInisiatifRekap();

  return (
    <Halaman
      judul="Monitoring Kepala"
      sub={d ? `${tglPendek(d.dari)} sampai ${tglPendek(d.sampai)}` : undefined}
      kanan={
        <div className="flex gap-2" role="group" aria-label="Rentang">
          {(["pekan", "bulan"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={rentang === k} onClick={() => setRentang(k)} className={`min-h-[38px] rounded-full border px-3.5 text-[13.5px] font-semibold ${rentang === k ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white"}`}>
              {k === "bulan" ? "Bulan ini" : "Pekan ini"}
            </button>
          ))}
        </div>
      }
    >
      {m.memuat && !d && <Memuat />}
      {m.galat && !d && <Galat>{m.galat}</Galat>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {d && r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Statistik label="Selesai tepat waktu" nilai={r.tepatPersen === null ? "-" : `${r.tepatPersen}%`} ket={`${d.tepat_waktu.tepat} dari ${d.tepat_waktu.selesai} butir`} nada={r.tepatPersen !== null && r.tepatPersen < 70 ? "amber" : "biasa"} />
            <Statistik label="Menunggu tinjau" nilai={r.menungguTinjau} ket={r.lewat3 > 0 ? `${r.lewat3} lewat 3 hari kerja` : "Tidak ada yang tertunda"} nada={r.lewat3 > 0 ? "amber" : "biasa"} />
            <Statistik label="Sanggahan terbuka" nilai={r.sanggahTerbuka} ket={`${r.sanggahMenungguPutusan} menunggu putusan`} nada={r.sanggahMenungguPutusan > 0 ? "amber" : "biasa"} />
            <Statistik label="Usulan menunggu" nilai={r.usulanMenunggu} ket={r.usulanLewat3 > 0 ? `${r.usulanLewat3} lewat 3 hari kerja` : undefined} nada={r.usulanLewat3 > 0 ? "amber" : "biasa"} />
            <Statistik label="Terhalang" nilai={r.terhalang} ket="butir yang menunggu pihak lain" nada={r.terhalang > 0 ? "amber" : "biasa"} />
            <Statistik
              label="Lewat tenggat"
              nilai={esk.data ? esk.data.ringkas.terbuka : "-"}
              ket={esk.data ? (esk.data.ringkas.lewat_jawab > 0 ? `${esk.data.ringkas.lewat_jawab} lewat batas jawab · ${esk.data.ringkas.naik_kepala} naik ke Kepala` : "Semua sudah dijawab tepat waktu") : undefined}
              nada={esk.data && (esk.data.ringkas.lewat_jawab > 0 || esk.data.ringkas.naik_kepala > 0) ? "amber" : "biasa"}
            />
          </div>
          {esk.data && esk.data.ringkas.naik_kepala > 0 && (
            <Peringatan>
              {esk.data.ringkas.naik_kepala} pekerjaan lewat tenggat naik ke Kepala karena belum dijawab Ketua Tim. Jawab di <Link href="/sigap/delego/tinjau" className="font-semibold underline">Tinjau, tab Belum selesai</Link>.
            </Peringatan>
          )}

          <Info>
            Hutang poin, keterlambatan lapor, dan saran tindak lanjut per pegawai ada di <Link href="/sigap/delego" className="font-semibold underline">Beranda tim</Link>; beban semua pekerjaan per hari ada di <Link href="/sigap/delego/beban" className="font-semibold underline">Beban kerja</Link>.
          </Info>

          {ini.data && ini.data.pegawai.length > 0 && (
            <Kartu judul={`Inisiatif pegawai ${tglPendek(ini.data.dari)} sampai ${tglPendek(ini.data.sampai)}`}>
              <TabelInisiatif baris={ini.data.pegawai} />
            </Kartu>
          )}

          <Kartu judul="Capaian per pegawai">
            {capaian.length === 0 ? (
              <Kosong>Belum ada laporan pada rentang ini.</Kosong>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-[#D5DCE2] text-[12.5px] text-[#3B4A57]">
                      <th className="py-1.5 pr-3 font-semibold">Pegawai</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Dilaporkan</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Terverifikasi</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Belum ditinjau</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Disanggah</th>
                      <th className="py-1.5 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capaian.map((c) => {
                      const k = TEKS_KETERANGAN[keteranganCapaian(c)];
                      return (
                        <tr key={c.akun} className="border-b border-[#EEF1F4]">
                          <td className="py-1.5 pr-3 font-semibold">{c.nama}</td>
                          <td className="py-1.5 pr-3 text-right">{fmt(c.mandiri, 1)}</td>
                          <td className="py-1.5 pr-3 text-right">{fmt(c.terverifikasi, 1)}</td>
                          <td className="py-1.5 pr-3 text-right">{fmt(c.belum, 1)}</td>
                          <td className="py-1.5 pr-3 text-right">{fmt(c.disanggah, 1)}</td>
                          <td className="py-1.5"><Lencana nada={k.nada}>{k.teks}</Lencana></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="m-0 mt-2 text-[12.5px] text-[#3B4A57]">Dilaporkan = poin yang dikirim pegawai. Terverifikasi = yang sudah disetujui Ketua Tim atau diputus Kepala. Selisih besar bukan tuduhan; periksa sebabnya di Sanggahan.</p>
          </Kartu>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Kartu judul="Antrean tinjau per Ketua Tim">
              {d.peninjau.length === 0 ? (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada antrean.</p>
              ) : (
                <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
                  {d.peninjau.map((p) => {
                    const rasio = rasioSanggahDitolak(p.sanggah_diajukan, p.sanggah_ditolak);
                    return (
                      <li key={p.akun} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{p.nama}</span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Lencana nada={p.lewat3 > 0 ? "amber" : "abu"}>{p.menunggu} menunggu{p.lewat3 > 0 ? `, ${p.lewat3} lewat` : ""}</Lencana>
                          {rasio !== null && <span className="text-[12.5px] text-[#3B4A57]">sanggahan ditolak {rasio}% ({p.sanggah_ditolak}/{p.sanggah_diajukan})</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Kartu>
            <Kartu judul="Hambatan (terhalang)">
              {d.terhalang.length === 0 ? (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada butir yang ditandai terhalang.</p>
              ) : (
                <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px]">
                  {d.terhalang.map((t) => (
                    <li key={t.oleh} className="flex justify-between gap-3">
                      <span>{t.oleh}</span>
                      <b>{t.jumlah} butir</b>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          </div>

          <Kartu judul={`Sanggahan yang perlu ditangani (${terbuka.length})`}>
            {terbuka.length === 0 ? <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada sanggahan terbuka.</p> : <div className="space-y-3">{terbuka.map((s) => <PutusSanggah key={s.id} s={s} hari={hari} pemutus={d.pemutus} kirim={kirim} />)}</div>}
            {!d.pemutus && terbuka.length > 0 && <div className="mt-3"><Info>Putusan sanggahan hanya dapat dibuat Kepala.</Info></div>}
          </Kartu>
          {selesai.length > 0 && (
            <Kartu judul={`Sanggahan yang sudah diputus (${selesai.length})`}>
              <div className="space-y-3">{selesai.map((s) => <PutusSanggah key={s.id} s={s} hari={hari} pemutus={d.pemutus} kirim={kirim} />)}</div>
            </Kartu>
          )}
        </>
      )}
    </Halaman>
  );
}
