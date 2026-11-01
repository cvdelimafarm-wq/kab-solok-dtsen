"use client";

// app/sigap/delego/tinjau/page.tsx
//
// (1 Nov 2026) Tinjau laporan anggota tim. Ketua Tim menyetujui, meminta revisi (alasan minimal 5 huruf), atau menyanggah laporan yang tidak benar (alasan minimal 20 huruf);
// sanggahan diteruskan ke Kepala yang meminta klarifikasi pegawai (hak jawab 2 hari kerja) dan memutuskan. Usulan pekerjaan pegawai juga disetujui atau ditolak di sini.

import Link from "next/link";
import { useEffect, useState } from "react";
import { angka, awalMinggu, tambahHari, tglPendek } from "@/lib/delego/hitung";
import { rentangMinggu, susunRekap } from "@/lib/delego/rekap";
import { MIN_HURUF, galatKeputusan, lewatBatasTinjau, sisaHariJawab, type KeputusanTinjau } from "@/lib/delego/tinjau";
import type { LaporanTinjau, Sanggah, UsulanMenunggu } from "@/lib/delego/tipe";
import { DaftarBukti } from "../BuktiFoto";
import TombolSinkron from "../TombolSinkron";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { useBahan, useKirim, useRekap, useTinjauBahan } from "../data";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, Peringatan, fmt } from "../ui";

type Tab = "antrean" | "usulan" | "revisi" | "sanggah";

function KartuLaporan({ l, kirim }: { l: LaporanTinjau; kirim: ReturnType<typeof useKirim> }) {
  const [mode, setMode] = useState<KeputusanTinjau | null>(null);
  const [alasan, setAlasan] = useState("");
  const g = mode ? galatKeputusan(mode, alasan) : null;
  const jumlah = l.jumlah !== null && l.jumlah !== undefined ? `${fmt(angka(l.jumlah), 1)} ${l.satuan}` : null;
  return (
    <div className={`${KELAS.kartu} space-y-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">{l.judul}</div>
          <div className="text-[12.5px] text-[#3B4A57]">
            {l.penerima_nama} · {l.kegiatan_nama ?? l.ro_kode} · laporan {tglPendek(l.tanggal)}
            {l.mewakili ? " · diwakili" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lewatBatasTinjau(l.hk_lewat) && <Lencana nada="amber">Lewat {l.hk_lewat} hari kerja</Lencana>}
          <Lencana nada="biru">{fmt(angka(l.poin), 1)} poin</Lencana>
        </div>
      </div>
      <div className="text-[13px] text-[#3B4A57]">
        {jumlah ? `${jumlah} · ` : ""}
        target {fmt(angka(l.target_harian), 1)} per hari
        {l.menit_nyata ? ` · jam kerja nyata ${l.menit_nyata} menit` : ""}
      </div>
      {l.uraian && <p className="m-0 whitespace-pre-line text-[14px] leading-relaxed">{l.uraian}</p>}
      {l.kendala && (
        <p className="m-0 text-[13.5px] leading-snug">
          <b>Kendala:</b> {l.kendala}
        </p>
      )}
      <DaftarBukti bukti={l.bukti} ukuran={64} />
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim} onClick={() => void kirim.kirim("keu_dlg_tinjau", { p_laporan: l.id, p_putusan: "setuju" })}>
            Setujui
          </button>
          <button type="button" className={KELAS.tombolKecil} onClick={() => setMode("tolak")}>
            Minta revisi
          </button>
          <button type="button" className={KELAS.tombolKecil} onClick={() => setMode("sanggah")}>
            Sanggah ke Kepala
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg bg-[#F1F7F6] p-3">
          <Medan
            label={mode === "tolak" ? "Apa yang perlu diperbaiki?" : "Mengapa laporan ini tidak benar?"}
            bantu={mode === "sanggah" ? `Diteruskan ke Kepala. Pegawai berhak menjawab dalam 2 hari kerja. Minimal ${MIN_HURUF.sanggah} huruf.` : `Minimal ${MIN_HURUF.tolak} huruf. Pegawai mengirim ulang setelah memperbaiki.`}
          >
            <textarea className={KELAS.isian} rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
          </Medan>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={KELAS.tombolKecilUtama}
              disabled={kirim.mengirim || !!g}
              onClick={async () => {
                const ok = await kirim.kirim("keu_dlg_tinjau", { p_laporan: l.id, p_putusan: mode, p_alasan: alasan.trim(), p_bukti: [] });
                if (ok) {
                  setMode(null);
                  setAlasan("");
                }
              }}
            >
              {mode === "tolak" ? "Kirim permintaan revisi" : "Kirim sanggahan"}
            </button>
            <button type="button" className={KELAS.tombolKecil} onClick={() => setMode(null)}>
              Batal
            </button>
          </div>
          {g && alasan.length > 0 && <div className="text-[12.5px] text-[#8A4605]">{g}</div>}
        </div>
      )}
    </div>
  );
}

type Dampak = { sebelum: number; sesudah: number; kapasitas: number };

function KartuUsulan({ u, kirim, dampak }: { u: UsulanMenunggu; kirim: ReturnType<typeof useKirim>; dampak: Dampak | null }) {
  const pps0 = angka(u.poin_per_satuan);
  const vol0 = pps0 > 0 ? angka(u.target_total) / pps0 : 0;
  const [vol, setVol] = useState(String(Math.round(vol0 * 100) / 100));
  const [pps, setPps] = useState(String(pps0));
  const [tenggat, setTenggat] = useState(u.tenggat);
  const [alasan, setAlasan] = useState("");
  const berubah = angka(vol.replace(",", ".")) !== Math.round(vol0 * 100) / 100 || angka(pps.replace(",", ".")) !== pps0 || tenggat !== u.tenggat;
  const total = Math.round(angka(vol.replace(",", ".")) * angka(pps.replace(",", ".")) * 100) / 100;
  return (
    <div className={`${KELAS.kartu} space-y-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">{u.judul}</div>
          <div className="text-[12.5px] text-[#3B4A57]">
            Usulan {u.penerima_nama} · {u.kegiatan_nama ?? "Pekerjaan kantor"} · {tglPendek(u.mulai)} sampai {tglPendek(u.tenggat)}
          </div>
        </div>
        {lewatBatasTinjau(u.hk_lewat) && <Lencana nada="amber">Lewat {u.hk_lewat} hari kerja</Lencana>}
      </div>
      {u.uraian && <p className="m-0 text-[14px] leading-relaxed">{u.uraian}</p>}
      {u.skor_alasan && <p className="m-0 text-[13.5px] leading-snug"><b>Alasan skor:</b> {u.skor_alasan}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Medan label={`Volume (${u.satuan})`}>
          <input className={KELAS.isian} inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} />
        </Medan>
        <Medan label="Skor per satuan">
          <input className={KELAS.isian} inputMode="decimal" value={pps} onChange={(e) => setPps(e.target.value)} />
        </Medan>
        <Medan label="Tenggat">
          <input type="date" className={KELAS.isian} value={tenggat} onChange={(e) => setTenggat(e.target.value)} />
        </Medan>
      </div>
      <div className="text-[13px] text-[#3B4A57]">Total {fmt(total, 1)} poin.</div>
      {dampak && (
        <div className={`rounded-lg px-3 py-2 text-[13px] leading-snug ${dampak.sesudah > 100 ? "bg-[#FBE9E9] text-[#9B2C2C]" : "bg-[#F1F7F6] text-[#0B524C]"}`}>
          Beban {u.penerima_nama} pada {tglPendek(u.mulai)} sampai {tglPendek(u.tenggat)}: <b>{dampak.sebelum}%</b> sekarang, <b>{Math.round(dampak.sebelum + (total / Math.max(dampak.kapasitas, 1)) * 100)}%</b> bila usulan ini disetujui.
          {dampak.sesudah > 100 ? " Melebihi kapasitas; pertimbangkan mengubah volume atau tenggat." : ""}
        </div>
      )}
      <Medan label={berubah ? "Alasan perubahan (wajib)" : "Alasan (wajib bila menolak)"}>
        <input className={KELAS.isian} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} />
      </Medan>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={KELAS.tombolKecilUtama}
          disabled={kirim.mengirim || total <= 0 || (berubah && alasan.trim().length < MIN_HURUF.skorUbah)}
          onClick={() =>
            void kirim.kirim("keu_dlg_usul_putus", {
              p_id: u.id,
              p_putusan: "setuju",
              p_data: berubah ? { volume: angka(vol.replace(",", ".")), poin_per_satuan: angka(pps.replace(",", ".")), tenggat } : null,
              p_alasan: alasan.trim(),
            })
          }
        >
          {berubah ? "Setujui dengan perubahan" : "Setujui"}
        </button>
        <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim || alasan.trim().length < MIN_HURUF.usulanTolak} onClick={() => void kirim.kirim("keu_dlg_usul_putus", { p_id: u.id, p_putusan: "tolak", p_alasan: alasan.trim() })}>
          Tolak
        </button>
      </div>
    </div>
  );
}

function BarisSanggah({ s, hari }: { s: Sanggah; hari: string }) {
  const sisa = sisaHariJawab(s.batas_jawab, hari);
  return (
    <div className={`${KELAS.kartu} space-y-1.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[14.5px] font-semibold">{s.judul}</div>
        <Lencana nada={s.status === "diputus" ? "hijau" : s.status === "menunggu_putusan" ? "biru" : "amber"}>
          {s.status === "menunggu_jawab" ? `Menunggu jawaban pegawai${sisa >= 0 ? ` (sisa ${sisa} hari)` : " (batas lewat)"}` : s.status === "menunggu_putusan" ? "Menunggu putusan Kepala" : `Diputus: ${s.putusan}`}
        </Lencana>
      </div>
      <div className="text-[12.5px] text-[#3B4A57]">
        {s.penerima_nama} · laporan {tglPendek(s.tanggal)} · {fmt(angka(s.poin), 1)} poin
      </div>
      <p className="m-0 text-[13.5px] leading-snug"><b>Sanggahan:</b> {s.alasan}</p>
      {s.jawaban && <p className="m-0 text-[13.5px] leading-snug"><b>Jawaban pegawai:</b> {s.jawaban}</p>}
      {s.catatan_putusan && <p className="m-0 text-[13.5px] leading-snug"><b>Putusan:</b> {s.catatan_putusan}</p>}
    </div>
  );
}

export default function Tinjau() {
  const { hari } = useKonteksDelego();
  const b = useTinjauBahan();
  const kirim = useKirim(b.muat);
  const [tab, setTab] = useState<Tab>("antrean");
  const [dipilih, setDipilih] = useState(false);
  const d = b.data;
  const { manajer } = useKonteksDelego();
  const bahanTim = useBahan({ aktif: manajer });
  const mg = rentangMinggu(awalMinggu(hari));
  const rekap = useRekap(mg.dari, tambahHari(mg.dari, 55), manajer);
  const dampakDari = (u: UsulanMenunggu): Dampak | null => {
    if (!rekap.data || !bahanTim.data) return null;
    const dari = u.mulai < mg.dari ? mg.dari : u.mulai;
    const sampai = u.tenggat > tambahHari(mg.dari, 55) ? tambahHari(mg.dari, 55) : u.tenggat;
    if (sampai < dari) return null;
    const orang = rekap.data.orang.filter((o) => o.akun === u.penerima_akun);
    if (orang.length === 0) return null;
    const h = susunRekap({ orang, delegasi: bahanTim.data.delegasi, lapangan: rekap.data.lapangan, ketersediaan: rekap.data.ketersediaan, dari, sampai });
    const br = h.baris[0];
    if (!br || br.kapasitas <= 0) return null;
    const sebelum = Math.round((br.total / br.kapasitas) * 100);
    const tambah = (angka(u.target_total) / br.kapasitas) * 100;
    return { sebelum, sesudah: Math.round(sebelum + tambah), kapasitas: br.kapasitas };
  };
  // tab pertama yang berisi dipilih otomatis (sekali) supaya Ketua Tim tidak membuka tab kosong padahal ada yang menunggu
  useEffect(() => {
    if (!d || dipilih) return;
    setDipilih(true);
    if (d.antrean.length > 0) setTab("antrean");
    else if (d.usulan.length > 0) setTab("usulan");
    else if (d.revisi.length > 0) setTab("revisi");
    else if (d.sanggah.length > 0) setTab("sanggah");
  }, [d, dipilih]);
  const tabs: { k: Tab; t: string; n: number }[] = [
    { k: "antrean", t: "Menunggu tinjau", n: d?.antrean.length ?? 0 },
    { k: "usulan", t: "Usulan pegawai", n: d?.usulan.length ?? 0 },
    { k: "revisi", t: "Perlu revisi", n: d?.revisi.length ?? 0 },
    { k: "sanggah", t: "Sanggahan", n: d?.sanggah.length ?? 0 },
  ];
  return (
    <Halaman judul="Tinjau laporan tim" sub="Setujui laporan, minta revisi, atau sanggah ke Kepala. Laporan yang belum ditinjau lebih dari 3 hari kerja ditandai." kanan={d && (d.beri || d.pemutus) ? <TombolSinkron sesudah={b.muat} /> : undefined}>
      {b.memuat && !d && <Memuat />}
      {b.galat && !d && <Galat>{b.galat}</Galat>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {d && !d.beri && !d.pemutus && <Info>Halaman ini untuk Ketua Tim dan Kepala. Laporan Anda sendiri dapat dilihat di Delegasi saya.</Info>}
      {d && (
        <>
          <div role="tablist" className="flex gap-2 overflow-x-auto">
            {tabs.map((x) => (
              <button
                key={x.k}
                type="button"
                role="tab"
                aria-selected={tab === x.k}
                onClick={() => { setTab(x.k); setDipilih(true); }}
                className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-semibold ${tab === x.k ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white text-[#14212B]"}`}
              >
                {x.t} ({x.n})
              </button>
            ))}
          </div>
          {tab === "antrean" && (d.antrean.length === 0 ? <Kosong>Tidak ada laporan yang menunggu tinjau.</Kosong> : <div className="space-y-3">{d.antrean.map((l) => <KartuLaporan key={l.id} l={l} kirim={kirim} />)}</div>)}
          {tab === "usulan" && (d.usulan.length === 0 ? <Kosong>Tidak ada usulan pekerjaan yang menunggu.</Kosong> : <div className="space-y-3">{d.usulan.map((u) => <KartuUsulan key={u.id} u={u} kirim={kirim} dampak={dampakDari(u)} />)}</div>)}
          {tab === "revisi" &&
            (d.revisi.length === 0 ? (
              <Kosong>Tidak ada laporan yang sedang menunggu perbaikan pegawai.</Kosong>
            ) : (
              <div className="space-y-3">
                <Info>Laporan berikut sudah dikembalikan ke pegawai. Setelah pegawai mengirim ulang, laporan kembali ke antrean tinjau.</Info>
                {d.revisi.map((l) => (
                  <Kartu key={l.id}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="text-[14.5px] font-semibold">{l.judul}</div>
                        <div className="text-[12.5px] text-[#3B4A57]">{l.penerima_nama} · {tglPendek(l.tanggal)}</div>
                      </div>
                      <Lencana nada="amber">Perlu revisi</Lencana>
                    </div>
                    <p className="m-0 mt-1 text-[13.5px]"><b>Catatan:</b> {l.tinjau_alasan}</p>
                  </Kartu>
                ))}
              </div>
            ))}
          {tab === "sanggah" &&
            (d.sanggah.length === 0 ? (
              <Kosong>Belum ada sanggahan.</Kosong>
            ) : (
              <div className="space-y-3">
                {d.pemutus && d.sanggah.some((s) => s.status === "menunggu_putusan") && (
                  <Peringatan>
                    Ada sanggahan yang menunggu putusan Anda. Putuskan di <Link href="/sigap/delego/monitor" className="font-semibold underline">Monitoring Kepala</Link>.
                  </Peringatan>
                )}
                {d.sanggah.map((s) => <BarisSanggah key={s.id} s={s} hari={hari} />)}
              </div>
            ))}
        </>
      )}
    </Halaman>
  );
}
