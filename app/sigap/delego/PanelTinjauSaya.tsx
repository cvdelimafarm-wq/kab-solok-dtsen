"use client";

// app/sigap/delego/PanelTinjauSaya.tsx
//
// (1 Nov 2026) Panel di Delegasi saya untuk alur tinjau dari sisi pegawai: sanggahan yang menunggu jawaban (hak jawab 2 hari kerja), laporan yang perlu direvisi,
// usulan pekerjaan dan usulan skor saya, serta penanda "terhalang" pada sebuah tugas.

import { teksMutu } from "@/lib/delego/mutu";
import Link from "next/link";
import { useState } from "react";
import { angka, tglPendek } from "@/lib/delego/hitung";
import { MIN_HURUF, galatJawaban, sisaHariJawab } from "@/lib/delego/tinjau";
import { useKonteksDelego } from "./konteks";
import { KELAS } from "./merek";
import { useKirim, useTinjauBahan } from "./data";
import { Galat, Kartu, Lencana, Medan, fmt } from "./ui";

export function TandaTerhalang({ id, oleh, muat }: { id: number; oleh?: string | null; muat: () => Promise<void> }) {
  const kirim = useKirim(muat);
  const [teks, setTeks] = useState(oleh ?? "");
  return (
    <div className="space-y-1.5 rounded-lg bg-[#FCEFDD] p-3">
      <Medan label={oleh ? `Terhalang: ${oleh}` : "Pekerjaan ini menunggu pihak lain?"} bantu="Tulis siapa atau apa yang ditunggu (mis. PPK, Bendahara, hotel). Kepala dapat melihat hambatan ini.">
        <input className={KELAS.isian} value={teks} onChange={(e) => setTeks(e.target.value)} maxLength={80} placeholder="Mis. menunggu revisi PPK" />
      </Medan>
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      <div className="flex gap-2">
        <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim || teks.trim().length < 3} onClick={() => void kirim.kirim("keu_dlg_terhalang", { p_id: id, p_oleh: teks.trim() })}>
          {oleh ? "Perbarui" : "Tandai terhalang"}
        </button>
        {oleh && (
          <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim} onClick={() => void kirim.kirim("keu_dlg_terhalang", { p_id: id, p_oleh: "" })}>
            Hapus tanda
          </button>
        )}
      </div>
    </div>
  );
}

function JawabSanggah({ id, alasan, judul, batas, hari, kirim }: { id: number; alasan: string; judul: string; batas: string; hari: string; kirim: ReturnType<typeof useKirim> }) {
  const [jawaban, setJawaban] = useState("");
  const g = galatJawaban(jawaban);
  const sisa = sisaHariJawab(batas, hari);
  return (
    <div className="space-y-2 rounded-lg border border-[#E3A9A9] bg-[#FBE9E9] p-3">
      <div className="text-[14px] font-semibold text-[#9B2C2C]">Laporan Anda disanggah: {judul}</div>
      <p className="m-0 text-[13.5px] leading-snug"><b>Alasan:</b> {alasan}</p>
      <p className="m-0 text-[12.5px] text-[#6B3A04]">{sisa >= 0 ? `Anda berhak menjawab sampai ${tglPendek(batas)} (sisa ${sisa} hari).` : "Batas menjawab sudah lewat; Kepala dapat memutuskan."}</p>
      <Medan label="Jawaban Anda" bantu={`Minimal ${MIN_HURUF.jawaban} huruf. Dibaca Kepala sebelum memutuskan.`}>
        <textarea className={KELAS.isian} rows={3} value={jawaban} onChange={(e) => setJawaban(e.target.value)} />
      </Medan>
      <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim || !!g} onClick={() => void kirim.kirim("keu_dlg_sanggah_jawab", { p_sanggah: id, p_jawaban: jawaban.trim(), p_bukti: [] })}>
        Kirim jawaban
      </button>
    </div>
  );
}

export default function PanelTinjauSaya() {
  const { hak, hari } = useKonteksDelego();
  const b = useTinjauBahan();
  const kirim = useKirim(b.muat);
  const d = b.data;
  if (!d) return null;
  const akun = hak.akun.id;
  const sanggah = d.sanggah.filter((s) => s.penerima_akun === akun && s.status === "menunggu_jawab");
  const revisi = d.saya.laporan.filter((l) => l.tinjau_status === "ditolak");
  const usulan = d.saya.usulan.filter((u) => u.status === "usulan" || u.status === "batal");
  const skor = d.saya.skor.filter((x) => x.skor_status !== "disetujui");
  // (14 Nov 2026, Fase 4a) laporan yang poinnya diakui sebagian karena mutu (faktor < 1), paling baru dulu
  const mutu = d.saya.laporan.filter((l) => l.tinjau_status === "disetujui" && l.faktor_akui !== null && l.faktor_akui !== undefined && angka(l.faktor_akui) < 1).slice(0, 5);
  if (sanggah.length + revisi.length + usulan.length + skor.length + mutu.length === 0) return null;
  return (
    <div className="space-y-3">
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {sanggah.map((s) => <JawabSanggah key={s.id} id={s.id} alasan={s.alasan} judul={s.judul} batas={s.batas_jawab} hari={hari} kirim={kirim} />)}
      {revisi.length > 0 && (
        <Kartu judul={`Laporan perlu revisi (${revisi.length})`}>
          <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
            {revisi.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">Laporan {tglPendek(l.tanggal)} · {fmt(angka(l.poin), 1)} poin</div>
                  <div className="text-[13px] leading-snug text-[#6B3A04]">{l.tinjau_alasan}</div>
                </div>
                <Link href={`/sigap/delego/lapor?delegasi=${l.delegasi_id}`} className={KELAS.tombolKecilUtama}>Perbaiki</Link>
              </li>
            ))}
          </ul>
        </Kartu>
      )}
      {mutu.length > 0 && (
        <Kartu judul="Poin diakui sebagian (nilai mutu)">
          <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
            {mutu.map((l) => (
              <li key={l.id} className="min-w-0">
                <div className="font-semibold">
                  Laporan {tglPendek(l.tanggal)} · {fmt(angka(l.poin_diakui), 2)} dari {fmt(angka(l.poin), 2)} poin
                </div>
                <div className="text-[12.5px] text-[#3B4A57]">{teksMutu(l)}</div>
                {l.tinjau_alasan && <div className="text-[13px] leading-snug text-[#6B3A04]">{l.tinjau_alasan}</div>}
              </li>
            ))}
          </ul>
        </Kartu>
      )}
      {usulan.length > 0 && (
        <Kartu judul="Usulan pekerjaan saya">
          <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
            {usulan.map((u) => (
              <li key={u.id} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{u.judul}</div>
                  <div className="text-[12.5px] text-[#3B4A57]">{u.kegiatan_nama ?? "Pekerjaan kantor"} · {fmt(angka(u.target_total), 1)} poin{u.status === "batal" && u.alasan ? ` · ${u.alasan}` : ""}</div>
                </div>
                <Lencana nada={u.status === "usulan" ? "biru" : "merah"}>{u.status === "usulan" ? "Menunggu Ketua Tim" : "Ditolak"}</Lencana>
              </li>
            ))}
          </ul>
        </Kartu>
      )}
      {skor.length > 0 && (
        <Kartu judul="Usulan skor saya">
          <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
            {skor.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{x.nama}</div>
                  <div className="text-[12.5px] text-[#3B4A57]">{fmt(angka(x.poin_per_satuan), 1)} poin per {x.satuan}</div>
                </div>
                <Lencana nada={x.skor_status === "usulan" ? "biru" : "merah"}>{x.skor_status === "usulan" ? "Menunggu putusan" : "Ditolak"}</Lencana>
              </li>
            ))}
          </ul>
        </Kartu>
      )}
    </div>
  );
}
