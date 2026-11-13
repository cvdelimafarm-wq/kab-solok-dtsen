"use client";
// app/sigap/pelatihan/tes/[jenis]/TesTanpaSinyal.tsx
//
// (14 Nov 2026, luring 3b-2 s.d. 3b-4; keputusan Iqbal 14 Nov) Pretest/posttest dikerjakan TANPA SINYAL:
//  * soal sudah ada di HP (paket tersandi, diunduh otomatis sejak H-1); dibuka dengan SANDI A yang dibacakan instruktur;
//  * waktu menurut jam HP (durasi penuh sejak dibuka); tiap ketukan langsung tersimpan di HP;
//  * Kirim / waktu habis -> jawaban dikirim otomatis saat ada sinyal (paling lambat 24 jam sesudah waktu habis);
//  * sesudah kirim: soal dan jawaban sendiri bisa dibuka lagi di HP; nilai dan pembahasan dari server begitu ada sinyal (pola lama);
//  * wajib 100 dan percobaan terakhir belum 100: boleh mengulang tanpa sinyal (nilainya dihitung server saat sinkron).
// Kunci jawaban TIDAK pernah ada di HP.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi } from "../../../admin/api";
import { BTN_O, Kartu, Pesan } from "../../../admin/ui";
import { formatSisa, jamWib } from "../../komponen";
import { tandaPemilik } from "@/lib/luringSimpan";
import { bacaPaketLengkap } from "@/lib/paketLuringSimpan";
import { BATAS_TERTAHAN_JAM, bukaSandi, rapikanSandi, type IsiPaketSoal } from "@/lib/sigapTesLuring";
import { bacaRingkasTes, bacaSesiLuring, bolehMulaiLuring, buangSesiLuring, buatSesiLuring, pilihJawaban, selesaikan, simpanSesiLuring, sisaMs, type SesiLuring } from "@/lib/sesiLuring";
import { kirimSesiLuringTertunda } from "../../paketLuring";

const HIJAU = "#13794B";
const MERAH = "#B42329";

/** Ada sesi tanpa sinyal yang sedang dikerjakan atau belum terkirim? (halaman tes menampilkan komponen ini menggantikan isi biasa) */
export function adaSesiLuringAktif(jenis: string): boolean {
  if (typeof window === "undefined") return false;
  const s = bacaSesiLuring(localStorage, jenis, tandaPemilik(bacaSesi()));
  return !!s && (s.selesai_hp_ms === null || (s.kotor && !s.galat_kirim));
}

export default function TesTanpaSinyal<K>({ jenis, label, onDiterima, onMulai, mode }: { jenis: string; label: string; onDiterima: (keadaan: K) => void; onMulai?: () => void; mode: "aktif" | "tanpa_sinyal" }) {
  const pemilik = tandaPemilik(bacaSesi());
  const [sesi, setSesi] = useState<SesiLuring | null>(() => (typeof window === "undefined" ? null : bacaSesiLuring(localStorage, jenis, pemilik)));
  const paketL = useMemo(() => (typeof window === "undefined" ? null : bacaPaketLengkap(localStorage, jenis, pemilik)), [jenis, pemilik]);
  const ringkas = useMemo(() => (typeof window === "undefined" ? null : bacaRingkasTes(localStorage, jenis, pemilik)), [jenis, pemilik]);
  const [sandi, setSandi] = useState("");
  const [membuka, setMembuka] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [yakin, setYakin] = useState(false);
  const [tinjau, setTinjau] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const simpan = useCallback((s: SesiLuring) => {
    simpanSesiLuring(localStorage, s);
    setSesi(s);
  }, []);

  // jam berjalan + waktu habis = selesai otomatis
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (sesi && sesi.selesai_hp_ms === null && now >= sesi.batas_hp_ms) simpan(selesaikan(sesi, now));
  }, [now, sesi, simpan]);

  // kirim otomatis: saat dibuka, saat sinyal kembali, dan tiap 15 detik selama ada yang tertunda
  const coba = useCallback(async () => {
    const r = await kirimSesiLuringTertunda<K>(jenis);
    setSesi(bacaSesiLuring(localStorage, jenis, pemilik));
    if (r && "keadaan" in r) onDiterima(r.keadaan);
  }, [jenis, pemilik, onDiterima]);
  const tertunda = !!sesi && sesi.selesai_hp_ms !== null && sesi.kotor && !sesi.galat_kirim;
  useEffect(() => {
    if (!tertunda) return;
    void coba();
    const t = window.setInterval(() => void coba(), 15_000);
    window.addEventListener("online", coba);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", coba);
    };
  }, [tertunda, coba]);

  const izin = bolehMulaiLuring(ringkas, sesi && sesi.selesai_hp_ms !== null ? sesi : null);

  async function buka() {
    if (!paketL) return;
    setGalat(null);
    const { paket, selisihMs } = paketL;
    const jamServer = Date.now() + selisihMs;
    if (jamServer >= Date.parse(paket.tutup_at)) return setGalat(`Sesi ${label} sudah ditutup pukul ${jamWib(paket.tutup_at)} WIB.`);
    if (!paket.dimulai_instruktur && jamServer < Date.parse(paket.buka_at) - 5 * 60_000) return setGalat(`${label} baru dibuka pukul ${jamWib(paket.buka_at)} WIB.`);
    if (!izin.boleh) return setGalat(izin.alasan ?? "Tes tidak bisa dimulai tanpa sinyal.");
    setMembuka(true);
    try {
      // percobaan ulang dengan versi soal yang sama: pakai soal yang sudah terbuka di HP
      const isi: IsiPaketSoal | null = sesi && izin.ulang && sesi.versi === paket.versi ? { tes_id: sesi.tes_id, versi: sesi.versi, soal: sesi.soal } : await bukaSandi<IsiPaketSoal>(paket.tersandi, sandi);
      if (!isi) return setGalat("Sandi salah. Periksa lagi sandi yang dibacakan instruktur (huruf besar/kecil tidak berpengaruh).");
      buangSesiLuring(localStorage, jenis);
      simpan(buatSesiLuring(paket, isi, selisihMs, pemilik, Date.now(), izin.ulang));
      onMulai?.();
      setIdx(0);
      setTinjau(false);
    } finally {
      setMembuka(false);
    }
  }

  const kotakKuning = "m-0 rounded-xl border border-[#F0D48A] bg-[#FFF6DD] px-3.5 py-2 text-[12.5px] leading-snug text-[#5C3D00]";

  // ------------------------------------------------ sedang mengerjakan
  if (sesi && sesi.selesai_hp_ms === null) {
    const soal = sesi.soal;
    const s = soal[Math.min(idx, soal.length - 1)];
    const sisa = sisaMs(sesi, now) / 1000;
    const terisi = soal.filter((x) => sesi.jawaban[String(x.nomor)]).length;
    const belum = soal.filter((x) => !sesi.jawaban[String(x.nomor)]).map((x) => x.nomor);
    return (
      <>
        <p role="status" className={kotakKuning}>
          Mode tanpa sinyal{sesi.ulang ? " · percobaan ulang" : ""}: setiap jawaban langsung tersimpan di HP. Jawaban dikirim otomatis saat ada sinyal.
        </p>
        <div className="sticky top-[49px] z-10 flex items-center justify-between gap-2 rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2 shadow-sm">
          <div className="text-[12.5px] text-[#5B6B84]">
            Soal <b className="text-[#1B2B4B]">{idx + 1}</b> dari {soal.length} <span className="ml-1 text-[#13794B]">✓ di HP</span>
          </div>
          <div className={`text-[20px] font-extrabold tabular-nums ${sisa < 60 ? "text-[#B42329]" : "text-[#0F2A52]"}`} aria-label="Sisa waktu">
            ⏱ {formatSisa(sisa)}
          </div>
        </div>
        {s && (
          <Kartu>
            <p className="whitespace-pre-wrap text-[15px] font-semibold leading-relaxed">{s.teks}</p>
            <div className="mt-3 space-y-2" role="radiogroup" aria-label={`Pilihan jawaban soal ${s.nomor}`}>
              {s.opsi.map((o) => {
                const dipilih = sesi.jawaban[String(s.nomor)] === o.kode;
                return (
                  <button
                    key={o.kode}
                    type="button"
                    role="radio"
                    aria-checked={dipilih}
                    onClick={() => simpan(pilihJawaban(sesi, s.nomor, o.kode, Date.now()))}
                    className={`flex w-full items-start gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left text-[14px] transition ${dipilih ? "border-[#1F5FD1] bg-[#E6EEFC] font-semibold" : "border-[#DDE6F3] bg-white hover:border-[#9DB9DE]"}`}
                  >
                    <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${dipilih ? "bg-[#1F5FD1] text-white" : "bg-[#EDF0F4] text-[#4D5B6B]"}`}>{o.kode}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{o.teks}</span>
                  </button>
                );
              })}
            </div>
          </Kartu>
        )}
        <Kartu judul={`Navigasi soal — ${terisi} dari ${soal.length} terisi`}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Navigasi soal">
            {soal.map((x, i) => {
              const isi = !!sesi.jawaban[String(x.nomor)];
              return (
                <button
                  key={x.nomor}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`Soal ${x.nomor}: ${isi ? "sudah diisi" : "belum diisi"}`}
                  aria-current={i === idx ? "step" : undefined}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-extrabold text-white"
                  style={{ background: isi ? HIJAU : MERAH, outline: i === idx ? "3px solid #0F2A52" : "none", outlineOffset: 2 }}
                >
                  {x.nomor}
                </button>
              );
            })}
          </div>
        </Kartu>
        <div className="flex items-center gap-2">
          <button type="button" className={`${BTN_O} flex-1 !py-2.5`} disabled={idx <= 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
            ← Sebelumnya
          </button>
          {idx < soal.length - 1 ? (
            <button type="button" className={`${BTN_O} flex-1 !py-2.5`} onClick={() => setIdx((i) => Math.min(soal.length - 1, i + 1))}>
              Berikutnya →
            </button>
          ) : (
            <button type="button" className="flex-1 rounded-lg bg-[#13794B] px-3 py-2.5 text-[13px] font-extrabold text-white" onClick={() => setYakin(true)}>
              Kirim jawaban
            </button>
          )}
        </div>
        {yakin && (
          <Kartu judul="Kirim jawaban sekarang?">
            <p className="text-[13px] leading-relaxed text-[#5B6B84]">
              {belum.length ? <>Masih ada <b className="text-[#B42329]">{belum.length} soal kosong</b> (nomor {belum.join(", ")}). </> : "Semua soal sudah diisi. "}
              Sesudah dikirim, jawaban tidak bisa diubah. Jawaban tersimpan di HP dan dikirim otomatis saat ada sinyal.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" className={`${BTN_O} flex-1 !py-2.5`} onClick={() => setYakin(false)}>
                Batal
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-[#13794B] px-3 py-2.5 text-[13px] font-extrabold text-white"
                onClick={() => {
                  setYakin(false);
                  simpan(selesaikan(sesi, Date.now()));
                }}
              >
                Ya, kirim
              </button>
            </div>
          </Kartu>
        )}
      </>
    );
  }

  // ------------------------------------------------ sudah selesai di HP (menunggu sinyal / sudah terkirim)
  const blokSelesai = sesi && sesi.selesai_hp_ms !== null && (
    <>
      <Kartu judul={sesi.kotor ? (sesi.galat_kirim ? "Jawaban ditolak server" : "Jawaban tersimpan di HP") : "Jawaban sudah terkirim ✓"}>
        <p className="text-[13px] leading-relaxed text-[#5B6B84]">
          {sesi.galat_kirim ? (
            <>
              <b className="text-[#B42329]">{sesi.galat_kirim}</b> Jawaban tetap disimpan di HP ini. Hubungi panitia pelatihan.
            </>
          ) : sesi.kotor ? (
            <>
              {Object.keys(sesi.jawaban).length} dari {sesi.soal.length} soal terjawab. Jawaban dikirim otomatis begitu HP mendapat sinyal (paling lambat {BATAS_TERTAHAN_JAM} jam sesudah waktu habis, yaitu sebelum{" "}
              <b>{new Date(sesi.batas_hp_ms + sesi.selisih_ms + BATAS_TERTAHAN_JAM * 3_600_000).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB</b>). Jangan keluar dari akun sebelum terkirim.
            </>
          ) : (
            <>Nilai dan pembahasan tampil di halaman tes saat ada sinyal, sesuai aturan tes ini.</>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={`${BTN_O} !py-2.5`} onClick={() => setTinjau((t) => !t)}>
            {tinjau ? "Tutup soal dan jawaban" : "Lihat lagi soal dan jawaban saya"}
          </button>
          {sesi.kotor && !sesi.galat_kirim && (
            <button type="button" className={`${BTN_O} !py-2.5`} onClick={() => void coba()}>
              Coba kirim sekarang
            </button>
          )}
        </div>
      </Kartu>
      {tinjau && (
        <Kartu judul="Soal dan jawaban Anda">
          <ol className="space-y-3">
            {sesi.soal.map((x) => {
              const j = sesi.jawaban[String(x.nomor)];
              const o = x.opsi.find((p) => p.kode === j);
              return (
                <li key={x.nomor} className="border-b border-[#EDF0F4] pb-2 text-[13px] last:border-0">
                  <p className="whitespace-pre-wrap font-semibold text-[#1B2B4B]">
                    {x.nomor}. {x.teks}
                  </p>
                  <p className={`mt-1 ${o ? "text-[#1F5FD1]" : "text-[#B42329]"}`}>{o ? `Jawaban Anda: ${o.kode}. ${o.teks}` : "Tidak dijawab"}</p>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11.5px] text-[#6B7A90]">Kunci dan pembahasan tidak tersimpan di HP; tampil dari server saat ada sinyal.</p>
        </Kartu>
      )}
    </>
  );

  // ------------------------------------------------ pembuka (sandi)
  const bisaBuka = !!paketL && izin.boleh && (!sesi || sesi.selesai_hp_ms !== null);
  return (
    <>
      {mode === "tanpa_sinyal" && <p role="status" className={kotakKuning}>Tidak ada sinyal. Halaman ini dibuka dari simpanan HP.</p>}
      {blokSelesai}
      {!paketL && !sesi && (
        <Pesan jenis="peringatan">Soal {label} belum tersimpan di HP ini, jadi belum bisa dikerjakan tanpa sinyal. Cari sinyal lalu buka SIGAP Pelatihan; soal diunduh otomatis mulai H-1.</Pesan>
      )}
      {paketL && !izin.boleh && !sesi && izin.alasan && <Pesan jenis="info">{izin.alasan}</Pesan>}
      {bisaBuka && (
        <Kartu judul={izin.ulang ? `Ulangi ${label} tanpa sinyal` : `Kerjakan ${label} tanpa sinyal`}>
          <p className="text-[13px] leading-relaxed text-[#5B6B84]">
            Soal sudah tersimpan terkunci di HP ini ({paketL!.paket.jumlah_soal} soal · {paketL!.paket.durasi_menit} menit sejak dibuka). Ketik <b>sandi yang dibacakan instruktur</b>.
            {izin.ulang && " Tes ini wajib mencapai nilai 100; nilai percobaan ini dihitung server saat ada sinyal."}
          </p>
          {!(izin.ulang && sesi && sesi.versi === paketL!.paket.versi) && (
            <input
              value={sandi}
              onChange={(e) => setSandi(e.target.value)}
              placeholder="contoh: SAWAH-ELANG-475"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Sandi dari instruktur"
              className="mt-3 w-full rounded-xl border-2 border-[#CBD6E6] px-3.5 py-3 font-mono text-[17px] font-bold uppercase tracking-wider text-[#0F2A52] outline-none focus:border-[#1F5FD1]"
            />
          )}
          {galat && <p className="mt-2 text-[12.5px] font-semibold text-[#B42329]">{galat}</p>}
          <button
            type="button"
            disabled={membuka || (!rapikanSandi(sandi) && !(izin.ulang && sesi && sesi.versi === paketL!.paket.versi))}
            onClick={() => void buka()}
            className="mt-3 w-full rounded-xl bg-[#1F5FD1] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#1A4FB8] disabled:opacity-50"
          >
            {membuka ? "Membuka soal…" : izin.ulang ? `Ulangi ${label} →` : `Buka ${label} →`}
          </button>
          <p className="mt-2 text-[11.5px] leading-snug text-[#6B7A90]">Waktu dihitung menurut jam HP sejak soal dibuka. Jawaban dikirim otomatis saat ada sinyal, paling lambat {BATAS_TERTAHAN_JAM} jam sesudah waktu habis.</p>
        </Kartu>
      )}
    </>
  );
}
