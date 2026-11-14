"use client";

// app/sigap/delego/tinjau/page.tsx
//
// (1 Nov 2026) Tinjau laporan anggota tim. Ketua Tim menyetujui, meminta revisi (alasan minimal 5 huruf), atau menyanggah laporan yang tidak benar (alasan minimal 20 huruf);
// sanggahan diteruskan ke Kepala yang meminta klarifikasi pegawai (hak jawab 2 hari kerja) dan memutuskan. Usulan pekerjaan pegawai juga disetujui atau ditolak di sini.
// (14 Nov 2026, Fase 4a) Menyetujui laporan sekaligus menilai mutu (kualitas, kedisiplinan; ketepatan waktu otomatis): poin diakui = poin x faktor
// pengakuan (keu_dlg_tinjau_mutu). Penanda kewajaran tampil di kartu; peninjau tetap memutuskan.

import Link from "next/link";
import { useEffect, useState } from "react";
import { angka, awalMinggu, tambahHari, tglPendek } from "@/lib/delego/hitung";
import { rentangMinggu, susunRekap } from "@/lib/delego/rekap";
import { MIN_HURUF, galatKeputusan, lewatBatasTinjau, sisaHariJawab, type KeputusanTinjau } from "@/lib/delego/tinjau";
import { teksJenisInisiatif } from "@/lib/delego/inisiatif";
import { SETELAN_MUTU_AWAL, SKALA_MUTU, MUTU_WAJIB_ALASAN, faktorAkui, galatMutu, nilaiTepat, poinDiakui, tandaKewajaran, type SetelanMutu } from "@/lib/delego/mutu";
import type { LaporanTinjau, Sanggah, UsulanMenunggu } from "@/lib/delego/tipe";
import { DaftarBukti } from "../BuktiFoto";
import { DaftarEskalasi, useJumlahEskalasi } from "../Eskalasi";
import TombolSinkron from "../TombolSinkron";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { useBahan, useKirim, useRekap, useTinjauBahan } from "../data";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, Peringatan, fmt } from "../ui";

type Tab = "antrean" | "usulan" | "revisi" | "sanggah" | "belum";

function PilihNilai({ label, nilai, ubah }: { label: string; nilai: number | null; ubah: (n: number) => void }) {
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-semibold text-[#14212B]">{label}</div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {SKALA_MUTU.map((x) => (
          <button
            key={x.nilai}
            type="button"
            role="radio"
            aria-checked={nilai === x.nilai}
            title={x.teks}
            onClick={() => ubah(x.nilai)}
            className={`min-h-[40px] rounded-lg border text-[14px] font-semibold ${nilai === x.nilai ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white text-[#14212B]"}`}
          >
            {x.nilai}
          </button>
        ))}
      </div>
      <div className="mt-0.5 text-[11.5px] text-[#3B4A57]">{nilai ? SKALA_MUTU[nilai - 1].teks : "1 sangat kurang · 5 sangat baik"}</div>
    </div>
  );
}

function PanelMutu({ l, setelan, kirim, tutup }: { l: LaporanTinjau; setelan: SetelanMutu; kirim: ReturnType<typeof useKirim>; tutup: () => void }) {
  const [kualitas, setKualitas] = useState<number | null>(null);
  const [disiplin, setDisiplin] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const terlambat = !!l.terlambat;
  const poin = angka(l.poin);
  const faktor = kualitas && disiplin ? faktorAkui(setelan, kualitas, disiplin, terlambat) : null;
  const g = galatMutu(kualitas, disiplin, alasan);
  const wajibAlasan = (kualitas !== null && kualitas < MUTU_WAJIB_ALASAN) || (disiplin !== null && disiplin < MUTU_WAJIB_ALASAN);
  return (
    <div className="space-y-2.5 rounded-lg bg-[#F1F7F6] p-3">
      <div className="text-[13px] font-semibold text-[#0B524C]">Nilai mutu laporan ini</div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <PilihNilai label={`Kualitas hasil (bobot ${setelan.w_kualitas}%)`} nilai={kualitas} ubah={setKualitas} />
        <PilihNilai label={`Kedisiplinan (bobot ${setelan.w_disiplin}%)`} nilai={disiplin} ubah={setDisiplin} />
      </div>
      <div className="text-[12.5px] text-[#3B4A57]">
        Ketepatan waktu (bobot {setelan.w_tepat}%): <b>{terlambat ? `terlambat, dihitung ${fmt(nilaiTepat(true, setelan) * 100, 0)}%` : "tepat waktu, 100%"}</b> (otomatis dari waktu kirim).
      </div>
      <div className={`rounded-lg px-3 py-2 text-[13px] ${faktor === null ? "bg-white text-[#3B4A57]" : "bg-white text-[#0B524C]"}`}>
        {faktor === null ? (
          <>Poin laporan {fmt(poin, 2)}. Pilih kedua nilai untuk melihat poin diakui.</>
        ) : (
          <>
            Faktor pengakuan <b>{fmt(faktor, 2)}</b> · poin diakui <b>{fmt(poinDiakui(poin, faktor), 2)}</b> dari {fmt(poin, 2)} poin laporan.
          </>
        )}
      </div>
      <Medan label={wajibAlasan ? "Alasan (wajib, nilai di bawah 3)" : "Catatan untuk pegawai (boleh kosong)"}>
        <textarea className={KELAS.isian} rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={1000} />
      </Medan>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={KELAS.tombolKecilUtama}
          disabled={kirim.mengirim || !!g}
          onClick={async () => {
            const ok = await kirim.kirim("keu_dlg_tinjau_mutu", { p_laporan: l.id, p_kualitas: kualitas, p_disiplin: disiplin, p_alasan: alasan.trim() });
            if (ok) tutup();
          }}
        >
          Setujui dengan nilai ini
        </button>
        <button type="button" className={KELAS.tombolKecil} onClick={tutup}>
          Batal
        </button>
      </div>
      {g && (kualitas !== null || disiplin !== null) && <div className="text-[12.5px] text-[#8A4605]">{g}</div>}
    </div>
  );
}

function KartuLaporan({ l, kirim, setelan }: { l: LaporanTinjau; kirim: ReturnType<typeof useKirim>; setelan: SetelanMutu }) {
  const [mode, setMode] = useState<KeputusanTinjau | null>(null);
  const [alasan, setAlasan] = useState("");
  const g = mode && mode !== "setuju" ? galatKeputusan(mode, alasan) : null;
  const tanda = tandaKewajaran(l, setelan);
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
        <div className="flex flex-wrap items-center gap-2">
          {lewatBatasTinjau(l.hk_lewat) && <Lencana nada="amber">Lewat {l.hk_lewat} hari kerja</Lencana>}
          {l.terlambat && <Lencana nada="amber">Dikirim terlambat</Lencana>}
          <Lencana nada="biru">{fmt(angka(l.poin), 1)} poin</Lencana>
        </div>
      </div>
      {tanda.length > 0 && (
        <div className="rounded-lg bg-[#FFF4E5] px-3 py-2 text-[12.5px] leading-snug text-[#8A4605]">
          <b>Periksa kewajaran:</b>
          <ul className="m-0 mt-0.5 list-disc pl-4">
            {tanda.map((t) => <li key={t.kode}>{t.teks}</li>)}
          </ul>
        </div>
      )}
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
      {mode === "setuju" ? (
        <PanelMutu l={l} setelan={setelan} kirim={kirim} tutup={() => setMode(null)} />
      ) : mode === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim} onClick={() => setMode("setuju")}>
            Setujui dan nilai mutu
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
      {u.inisiatif_jenis && (
        <div className="rounded-lg bg-[#EEF4FF] px-3 py-2 text-[13px] leading-snug text-[#1F3A68]">
          <div className="font-semibold">Inisiatif: {teksJenisInisiatif(u.inisiatif_jenis)}</div>
          {u.inisiatif_alasan && <div><b>Alasan:</b> {u.inisiatif_alasan}</div>}
          {u.inisiatif_manfaat && <div><b>Manfaat:</b> {u.inisiatif_manfaat}</div>}
          <div className="mt-0.5 text-[12px]">Inisiatif yang disetujui dihitung sebagai nilai tambah pegawai. Menolak wajib beralasan.</div>
        </div>
      )}
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
  const nBelum = useJumlahEskalasi(!!d && (d.beri || d.pemutus));
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
    else if (nBelum > 0) setTab("belum");
  }, [d, dipilih, nBelum]);
  const tabs: { k: Tab; t: string; n: number }[] = [
    { k: "antrean", t: "Menunggu tinjau", n: d?.antrean.length ?? 0 },
    { k: "usulan", t: "Usulan pegawai", n: d?.usulan.length ?? 0 },
    { k: "revisi", t: "Perlu revisi", n: d?.revisi.length ?? 0 },
    { k: "sanggah", t: "Sanggahan", n: d?.sanggah.length ?? 0 },
    { k: "belum", t: "Belum selesai", n: nBelum },
  ];
  return (
    <Halaman judul="Tinjau laporan tim" sub="Setujui laporan sambil menilai mutunya, minta revisi, atau sanggah ke Kepala. Poin diakui = poin laporan × faktor pengakuan. Laporan yang belum ditinjau lebih dari 3 hari kerja ditandai." kanan={d && (d.beri || d.pemutus) ? <TombolSinkron sesudah={b.muat} /> : undefined}>
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
          {tab === "antrean" && (d.antrean.length === 0 ? <Kosong>Tidak ada laporan yang menunggu tinjau.</Kosong> : <div className="space-y-3">{d.antrean.map((l) => <KartuLaporan key={l.id} l={l} kirim={kirim} setelan={d.mutu_setelan ?? SETELAN_MUTU_AWAL} />)}</div>)}
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
          {tab === "belum" && <DaftarEskalasi />}
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
