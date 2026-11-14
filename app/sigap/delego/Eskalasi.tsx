"use client";

// app/sigap/delego/Eskalasi.tsx
//
// (14 Nov 2026, Fase 4b) Pekerjaan lewat tenggat yang belum tuntas.
//  * PanelEskalasiSaya (Delegasi saya): penerima wajib menjelaskan; jawaban pimpinan sampai di sini.
//  * DaftarEskalasi (Tinjau, tab "Belum selesai"): pemberi/Ketua Tim menjawab (perpanjang, alihkan, kurangi target, batalkan,
//    tetap dengan bantuan); yang tidak dijawab naik ke Kepala. Sistem menyarankan, manusia memutuskan.

import { useState } from "react";
import { angka, tglPendek } from "@/lib/delego/hitung";
import {
  MIN_JELAS, PILIHAN_JAWABAN, SETELAN_ESKALASI_AWAL, TEKS_STATUS_ESKALASI, argsJawab, galatJawab, saranBina, sisaJamJelas, teksJawaban,
  type BahanEskalasi, type ButirEskalasi, type IsianJawab,
} from "@/lib/delego/eskalasi";
import PemilihPenerima, { type Pilihan } from "./PemilihPenerima";
import { KELAS } from "./merek";
import { useEskalasiBahan, useKirim } from "./data";
import { Galat, Info, Kosong, Lencana, Medan, Peringatan, fmt } from "./ui";

function JelaskanButir({ b, kirim }: { b: ButirEskalasi; kirim: ReturnType<typeof useKirim> }) {
  const [isi, setIsi] = useState("");
  const sisa = sisaJamJelas(b.batas_jelas_at);
  return (
    <div className="space-y-2 rounded-lg border border-[#F0C987] bg-[#FFF4E5] p-3">
      <div className="text-[14px] font-semibold text-[#8A4605]">Pekerjaan belum selesai: {b.judul}</div>
      <div className="text-[12.5px] text-[#6B3A04]">
        Tenggat {tglPendek(b.tenggat)} sudah lewat. {sisa >= 0 ? `Jelaskan dalam ${sisa} jam lagi.` : "Batas penjelasan sudah lewat; tetap jelaskan agar pimpinan dapat menjawab."}
      </div>
      <Medan label="Mengapa belum selesai, dan apa yang Anda perlukan?" bantu={`Minimal ${MIN_JELAS} huruf. Dibaca Ketua Tim sebelum menjawab.`}>
        <textarea className={KELAS.isian} rows={3} value={isi} onChange={(e) => setIsi(e.target.value)} maxLength={1000} />
      </Medan>
      <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim || isi.trim().length < MIN_JELAS} onClick={() => void kirim.kirim("keu_dlg_eskalasi_jelaskan", { p_id: b.id, p_isi: isi.trim() })}>
        Kirim penjelasan
      </button>
    </div>
  );
}

/** Panel pegawai di Delegasi saya. Tidak menampilkan apa pun bila tidak ada butir lewat tenggat. */
export function PanelEskalasiSaya() {
  const e = useEskalasiBahan();
  const kirim = useKirim(e.muat);
  const d = e.data;
  if (!d || d.saya.length === 0) return null;
  const terbuka = d.saya.filter((b) => !b.ditutup_at);
  const dijawab = d.saya.filter((b) => b.ditutup_at && b.ditutup_karena === "dijawab").slice(0, 5);
  return (
    <div className="space-y-3">
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {terbuka.map((b) =>
        b.dijelaskan_at ? (
          <div key={b.id} className={`${KELAS.kartu} space-y-1`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[14px] font-semibold">{b.judul}</div>
              <Lencana nada={TEKS_STATUS_ESKALASI[b.status].nada}>{TEKS_STATUS_ESKALASI[b.status].teks}</Lencana>
            </div>
            <div className="text-[12.5px] text-[#3B4A57]">
              Lewat tenggat {tglPendek(b.tenggat)} · penjelasan terkirim{b.batas_jawab ? ` · pimpinan menjawab paling lambat ${tglPendek(b.batas_jawab)}` : ""}
            </div>
            <p className="m-0 text-[13px] leading-snug text-[#3B4A57]"><b>Penjelasan Anda:</b> {b.penjelasan}</p>
          </div>
        ) : (
          <JelaskanButir key={b.id} b={b} kirim={kirim} />
        ),
      )}
      {dijawab.length > 0 && (
        <div className={`${KELAS.kartu} space-y-2`}>
          <div className="text-[14px] font-semibold">Jawaban pimpinan</div>
          <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
            {dijawab.map((b) => (
              <li key={b.id}>
                <div className="font-semibold">{b.judul}</div>
                <div className="text-[13px] text-[#0B524C]">{teksJawaban(b, tglPendek)}.</div>
                {b.catatan && <div className="text-[12.5px] leading-snug text-[#3B4A57]">{b.dijawab_nama ? `${b.dijawab_nama}: ` : ""}{b.catatan}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const ISIAN_KOSONG: IsianJawab = { putusan: null, catatan: "", tenggat: "", target: "", ke: null };

function FormJawab({ b, hari, kirim, tutup }: { b: ButirEskalasi; hari: string; kirim: ReturnType<typeof useKirim>; tutup: () => void }) {
  const [f, setF] = useState<IsianJawab>(ISIAN_KOSONG);
  const [pilih, setPilih] = useState<Pilihan[]>([]);
  const isian: IsianJawab = { ...f, ke: pilih[0]?.akun ?? null };
  const g = galatJawab(isian, hari);
  const perluTenggat = f.putusan === "perpanjang" || f.putusan === "alihkan" || f.putusan === "kurangi";
  return (
    <div className="space-y-2.5 rounded-lg bg-[#F1F7F6] p-3">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Jawaban">
        {PILIHAN_JAWABAN.map((p) => (
          <button
            key={p.k}
            type="button"
            role="radio"
            aria-checked={f.putusan === p.k}
            onClick={() => setF({ ...f, putusan: p.k })}
            className={`rounded-lg border px-3 py-2 text-left ${f.putusan === p.k ? "border-[#0F6B63] bg-white ring-2 ring-[#0F6B63]" : "border-[#BCC6CE] bg-white"}`}
          >
            <div className="text-[13.5px] font-semibold text-[#14212B]">{p.teks}</div>
            <div className="text-[12px] leading-snug text-[#3B4A57]">{p.bantu}</div>
          </button>
        ))}
      </div>
      {f.putusan === "alihkan" && (
        <div className="space-y-1">
          <div className="text-[12.5px] font-semibold">Penerima baru</div>
          <PemilihPenerima ro={b.ro_kode} ident={null} pilih={pilih.slice(0, 1)} setPilih={(x) => setPilih((lama) => (typeof x === "function" ? x(lama) : x).slice(-1))} tampilPj={false} tampilPeran={false} />
        </div>
      )}
      {(perluTenggat || f.putusan === "kurangi") && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {perluTenggat && (
            <Medan label={f.putusan === "perpanjang" ? "Tenggat baru (wajib)" : "Tenggat baru (boleh kosong)"}>
              <input type="date" className={KELAS.isian} min={hari} value={f.tenggat} onChange={(e) => setF({ ...f, tenggat: e.target.value })} />
            </Medan>
          )}
          {f.putusan === "kurangi" && (
            <Medan label={`Target total baru (poin; sekarang ${fmt(angka(b.target_total), 1)})`}>
              <input className={KELAS.isian} inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
            </Medan>
          )}
        </div>
      )}
      <Medan label="Catatan untuk pegawai (wajib)" bantu="Minimal 10 huruf. Dikirim ke pegawai bersama jawaban.">
        <textarea className={KELAS.isian} rows={2} value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} maxLength={1000} />
      </Medan>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={KELAS.tombolKecilUtama}
          disabled={kirim.mengirim || !!g}
          onClick={async () => {
            const ok = await kirim.kirim("keu_dlg_eskalasi_jawab", argsJawab(b.id, isian));
            if (ok) tutup();
          }}
        >
          Kirim jawaban
        </button>
        <button type="button" className={KELAS.tombolKecil} onClick={tutup}>
          Batal
        </button>
      </div>
      {g && f.putusan && <div className="text-[12.5px] text-[#8A4605]">{g}</div>}
    </div>
  );
}

function KartuButir({ b, d, kirim }: { b: ButirEskalasi; d: BahanEskalasi; kirim: ReturnType<typeof useKirim> }) {
  const [buka, setBuka] = useState(false);
  const st = TEKS_STATUS_ESKALASI[b.status];
  const setelan = d.setelan ?? SETELAN_ESKALASI_AWAL;
  return (
    <div className={`${KELAS.kartu} space-y-2`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">{b.judul}</div>
          <div className="text-[12.5px] text-[#3B4A57]">
            {b.penerima_nama} · {b.kegiatan_nama ?? b.ro_kode} · tenggat {tglPendek(b.tenggat)} · {b.hk_sejak} hari kerja sejak lewat
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {b.lewat_jawab && !b.ditutup_at && <Lencana nada="merah">Batas jawab lewat</Lencana>}
          <Lencana nada={st.nada}>{b.ditutup_at && b.ditutup_karena !== "dijawab" ? (b.ditutup_karena === "tuntas" ? "Tuntas" : "Ditutup") : st.teks}</Lencana>
        </div>
      </div>
      <div className="text-[13px] text-[#3B4A57]">
        Dilaporkan {fmt(angka(b.poin_lapor), 1)} dari {fmt(angka(b.target_total), 1)} poin
        {b.batas_jawab && !b.ditutup_at ? ` · jawab paling lambat ${tglPendek(b.batas_jawab)}` : ""}
      </div>
      {b.penjelasan ? (
        <p className="m-0 text-[13.5px] leading-snug"><b>Penjelasan:</b> {b.penjelasan}</p>
      ) : (
        !b.ditutup_at && <p className="m-0 text-[13px] text-[#8A4605]">Belum ada penjelasan dari penerima.</p>
      )}
      {saranBina(b.n_lewat_30, setelan) && !b.ditutup_at && (
        <div className="rounded-lg bg-[#FBE9E9] px-3 py-2 text-[12.5px] leading-snug text-[#9B2C2C]">
          {b.penerima_nama} lewat tenggat {b.n_lewat_30} kali dalam 30 hari. Saran: pertimbangkan pembinaan langkah 2 (bukan otomatis).
        </div>
      )}
      {b.ditutup_at && b.ditutup_karena === "dijawab" && (
        <p className="m-0 text-[13px] text-[#0B524C]">
          <b>{teksJawaban(b, tglPendek)}.</b> {b.catatan}
          {b.dijawab_nama ? ` (${b.dijawab_nama})` : ""}
        </p>
      )}
      {!b.ditutup_at &&
        (buka ? (
          <FormJawab b={b} hari={d.hari_ini} kirim={kirim} tutup={() => setBuka(false)} />
        ) : (
          <button type="button" className={KELAS.tombolKecilUtama} onClick={() => setBuka(true)}>
            Jawab
          </button>
        ))}
    </div>
  );
}

/** Tab "Belum selesai" di Tinjau. `jumlah` dipakai untuk label tab. */
export function useJumlahEskalasi(aktif: boolean): number {
  const e = useEskalasiBahan(aktif);
  return e.data ? e.data.pimpinan.filter((b) => !b.ditutup_at).length : 0;
}

export function DaftarEskalasi() {
  const e = useEskalasiBahan();
  const kirim = useKirim(e.muat);
  const d = e.data;
  if (!d) return e.galat ? <Galat>{e.galat}</Galat> : null;
  const terbuka = d.pimpinan.filter((b) => !b.ditutup_at);
  const selesai = d.pimpinan.filter((b) => b.ditutup_at);
  const s = d.setelan ?? SETELAN_ESKALASI_AWAL;
  return (
    <div className="space-y-3">
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {d.ringkas.lewat_jawab > 0 ? (
        <Peringatan>{d.ringkas.lewat_jawab} butir lewat batas jawab. Jawab sekarang; yang dibiarkan naik ke Kepala setelah {s.hk_kepala} hari kerja.</Peringatan>
      ) : (
        <Info>
          Butir yang lewat tenggat: penerima menjelaskan dalam {s.jam_jelas} jam, pimpinan menjawab paling lambat {s.hk_jawab} hari kerja, dan setelah {s.hk_kepala} hari kerja tanpa jawaban butir naik ke Kepala.
        </Info>
      )}
      {terbuka.length === 0 ? <Kosong>Tidak ada pekerjaan lewat tenggat yang menunggu jawaban.</Kosong> : terbuka.map((b) => <KartuButir key={b.id} b={b} d={d} kirim={kirim} />)}
      {selesai.length > 0 && (
        <details className="rounded-lg border border-[#D5DDE3] bg-white px-3 py-2">
          <summary className="cursor-pointer text-[13.5px] font-semibold">Sudah dijawab atau ditutup, 14 hari terakhir ({selesai.length})</summary>
          <div className="mt-2 space-y-2">{selesai.map((b) => <KartuButir key={b.id} b={b} d={d} kirim={kirim} />)}</div>
        </details>
      )}
    </div>
  );
}
