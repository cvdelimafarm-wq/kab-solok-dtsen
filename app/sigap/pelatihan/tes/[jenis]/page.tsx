"use client";

// app/sigap/pelatihan/tes/[jenis]/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- pengerjaan pretest/posttest.
// Aturan (pilihan user): hitung mundur per orang (15 menit sejak Mulai) + batas tutup sesi; jawaban
// tersimpan otomatis; sesudah kirim hanya "jawaban tersimpan" sampai sesi ditutup, lalu skor + pembahasan.
// Navigasi soal (permintaan user): MERAH = belum terisi, HIJAU = sudah diisi, kotak bergaris = soal yang dibuka.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LABEL_JENIS_TES, jenisTesValid, type JenisTes } from "@/lib/sigapTes";
import type { KeadaanTes } from "@/lib/sigapTesDb";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, tglPanjang } from "../../../admin/api";
import { BTN, BTN_O, Chip, Kartu, Memuat, Pesan } from "../../../admin/ui";
import { Kerangka, formatSisa, jamWib, useJamServer, useSaatLewat } from "../../komponen";

type Keadaan = KeadaanTes;

const WARNA_HIJAU = "#13794B";
const WARNA_MERAH = "#B42329";

export default function HalamanTes() {
  const params = useParams<{ jenis: string }>();
  const jenis = params?.jenis;
  const valid = jenisTesValid(jenis);
  if (!valid) return <Kerangka aktif="pelatihan" judul="Tes tidak dikenal"><Pesan jenis="galat">Jenis tes tidak dikenal.</Pesan></Kerangka>;
  return <IsiTes jenis={jenis as JenisTes} />;
}

function IsiTes({ jenis }: { jenis: JenisTes }) {
  const label = LABEL_JENIS_TES[jenis];
  const url = `/api/sigap/pelatihan/tes/${jenis}`;
  const jam = useJamServer();
  const { setujukan, sekarang } = jam;
  const [k, setK] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [jawaban, setJawaban] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [simpan, setSimpan] = useState<"tersimpan" | "menyimpan" | "gagal">("tersimpan");
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [konfirmasiUlang, setKonfirmasiUlang] = useState(false);

  // ------------------------------------------------ muat keadaan
  const terapkan = useCallback(
    (d: Keadaan) => {
      setujukan(d.sekarang);
      setK(d);
      if (d.jawaban) setJawaban((lama) => (Object.keys(lama).length === 0 ? d.jawaban! : lama));
      setGalat(null);
    },
    [setujukan]
  );
  const muat = useCallback(async () => {
    try {
      terapkan(await fetchJson<Keadaan>(url));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [url, terapkan]);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    muat();
  }, [muat]);

  // ------------------------------------------------ autosave berantai (satu permintaan sekaligus)
  const jawabRef = useRef(jawaban);
  jawabRef.current = jawaban;
  const kotor = useRef(false);
  const terbang = useRef(false);
  const habis = useRef(false);

  const siram = useCallback(async () => {
    if (terbang.current) return;
    terbang.current = true;
    try {
      while (kotor.current) {
        kotor.current = false;
        setSimpan("menyimpan");
        await fetchJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "simpan", jawaban: jawabRef.current }) });
      }
      setSimpan("tersimpan");
    } catch (e) {
      if (e instanceof SesiBerakhir) return;
      kotor.current = true;
      setSimpan("gagal");
      // waktu habis di server: muat ulang agar tampil hasil/selesai
      if (/waktu pengerjaan sudah habis|sudah selesai/i.test(pesanGalat(e))) {
        kotor.current = false;
        habis.current = true;
        await muat();
      }
    } finally {
      terbang.current = false;
    }
  }, [url, muat]);

  // coba lagi tiap 5 detik bila ada perubahan belum tersimpan
  useEffect(() => {
    const t = setInterval(() => {
      if (kotor.current && !terbang.current && !habis.current) siram();
    }, 5000);
    return () => clearInterval(t);
  }, [siram]);

  function pilih(nomor: number, kode: string) {
    setJawaban((j) => {
      const baru = { ...j };
      if (baru[String(nomor)] === kode) delete baru[String(nomor)]; // klik lagi = batalkan
      else baru[String(nomor)] = kode;
      jawabRef.current = baru;
      return baru;
    });
    kotor.current = true;
    setSimpan("menyimpan");
    siram();
  }

  // ------------------------------------------------ aksi
  async function mulai() {
    setSibuk(true);
    setGalat(null);
    try {
      terapkan(await fetchJson<Keadaan>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "mulai" }) }));
      setIdx(0);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) {
        setGalat(pesanGalat(e));
        muat();
      }
    } finally {
      setSibuk(false);
    }
  }

  // (8 Okt 2026) Mengulang (posttest, bila panitia membuka kesempatan): percobaan lama diarsipkan di server, jawaban lokal dikosongkan.
  async function ulangi() {
    setSibuk(true);
    setGalat(null);
    setKonfirmasiUlang(false);
    try {
      const d = await fetchJson<Keadaan>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "ulang" }) });
      // kosongkan semua sisa keadaan percobaan sebelumnya SEBELUM menerapkan keadaan baru
      jawabRef.current = {};
      setJawaban({});
      kotor.current = false;
      habis.current = false;
      otomatisKirim.current = false;
      setSimpan("tersimpan");
      setIdx(0);
      terapkan(d);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) {
        setGalat(pesanGalat(e));
        muat();
      }
    } finally {
      setSibuk(false);
    }
  }

  const kirim = useCallback(
    async (otomatis = false) => {
      setSibuk(true);
      setKonfirmasi(false);
      try {
        // tunggu autosave yang sedang berjalan, lalu kirim jawaban terbaru sekaligus
        for (let i = 0; i < 20 && terbang.current; i++) await new Promise((r) => setTimeout(r, 100));
        kotor.current = false;
        terapkan(await fetchJson<Keadaan>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "kirim", jawaban: jawabRef.current }) }));
        habis.current = true;
      } catch (e) {
        if (!(e instanceof SesiBerakhir)) {
          if (otomatis) await muat();
          else setGalat(pesanGalat(e));
        }
      } finally {
        setSibuk(false);
      }
    },
    [url, terapkan, muat]
  );

  // ------------------------------------------------ waktu
  const status = k?.status;
  const sisaBatas = k?.sesi ? (new Date(k.sesi.batas_at).getTime() - sekarang()) / 1000 : 0;
  const mengerjakan = status === "mengerjakan";
  const otomatisKirim = useRef(false);
  useEffect(() => {
    if (mengerjakan && sisaBatas <= 0 && !otomatisKirim.current) {
      otomatisKirim.current = true;
      kirim(true); // waktu habis: kirim jawaban terakhir (server menilai yang tersimpan bila lewat toleransi)
    }
  });
  useSaatLewat(status === "belum_buka" && k ? k.tes.buka_at : null, sekarang, muat, `${jenis}-buka`);
  useSaatLewat(status === "buka" && k ? k.tes.tutup_at : null, sekarang, muat, `${jenis}-tutup`);
  useSaatLewat(status === "selesai" && k?.hasil_tertunda ? k.tes.tutup_at : null, sekarang, muat, `${jenis}-hasil`);

  // peringatan sebelum meninggalkan halaman saat mengerjakan
  useEffect(() => {
    if (!mengerjakan) return;
    const f = (e: BeforeUnloadEvent) => {
      if (kotor.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [mengerjakan]);

  // ------------------------------------------------ turunan
  const soal = k?.soal ?? [];
  const terisi = useMemo(() => soal.filter((s) => jawaban[String(s.nomor)]).length, [soal, jawaban]);
  const belum = soal.filter((s) => !jawaban[String(s.nomor)]).map((s) => s.nomor);
  const sekarangSoal = soal[Math.min(idx, Math.max(0, soal.length - 1))];

  const judul = `${label} Pelatihan PSP Pascabencana`;

  // ------------------------------------------------ tampilan
  if (!k)
    return (
      <Kerangka aktif="pelatihan" judul={judul}>
        {galat ? <Pesan jenis="galat">{galat}</Pesan> : <Memuat />}
        <Link href="/sigap/pelatihan" className={BTN_O}>← Kembali</Link>
      </Kerangka>
    );

  const sisaBuka = (new Date(k.tes.buka_at).getTime() - sekarang()) / 1000;
  const sisaTutup = (new Date(k.tes.tutup_at).getTime() - sekarang()) / 1000;
  const kartuUlang = k.bisa_ulang ? (
    <Kartu judul={`Kesempatan mengulang ${label}`}>
      <p className="text-[13px] leading-relaxed text-[#5B6B84]">
        Percobaan ke-{k.percobaan} dari maksimal {k.ulang_maks}. Anda boleh mengulang selama sesi masih terbuka (sampai pukul <b>{jamWib(k.tes.tutup_at)} WIB</b>, {formatSisa(sisaTutup)} lagi). Nilai yang dipakai adalah <b>skor tertinggi</b> dari semua percobaan, jadi mengulang tidak menurunkan nilai Anda.
      </p>
      <button type="button" className="mt-3 w-full rounded-xl bg-[#1F5FD1] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#1A4FB8] disabled:opacity-60" disabled={sibuk} onClick={() => setKonfirmasiUlang(true)}>
        Ulangi {label} →
      </button>
    </Kartu>
  ) : null;

  return (
    <Kerangka aktif="pelatihan" judul={k.tes.judul} sub={`${tglPanjang(new Date(new Date(k.tes.buka_at).getTime() + 7 * 3_600_000).toISOString().slice(0, 10))} · dibuka ${jamWib(k.tes.buka_at)} · ditutup ${jamWib(k.tes.tutup_at)} WIB`}>
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}

      {/* ------------------------------------------------ belum bisa dimulai */}
      {status === "soal_belum_ada" && <Pesan jenis="peringatan">Soal {label} belum tersedia. Halaman ini otomatis menyesuaikan setelah panitia mengunggah soal.</Pesan>}
      {status === "nonaktif" && <Pesan jenis="info">Tes ini sedang tidak aktif.</Pesan>}
      {status === "belum_buka" && (
        <Kartu judul={`${label} belum dibuka`}>
          <p className="text-[13px] text-[#5B6B84]">Terbuka otomatis pukul {jamWib(k.tes.buka_at)} WIB. Jangan tutup halaman ini; tombol Mulai muncul sendiri.</p>
          <p className="mt-2 text-[28px] font-extrabold tabular-nums text-[#0F2A52]">{formatSisa(sisaBuka)}</p>
        </Kartu>
      )}
      {status === "terlewat" && <Pesan jenis="galat">Sesi {label} sudah ditutup pukul {jamWib(k.tes.tutup_at)} WIB dan Anda belum mengerjakannya.</Pesan>}

      {/* ------------------------------------------------ siap mulai */}
      {status === "buka" && (
        <Kartu judul={`${label} · ${k.jumlah_soal} soal`}>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
            <li>Waktu mengerjakan <b>{Math.min(k.tes.durasi_menit, Math.max(0, Math.floor(sisaTutup / 60)))} menit</b> sejak Anda menekan Mulai (maksimal {k.tes.durasi_menit} menit, tidak melewati pukul {jamWib(k.tes.tutup_at)} WIB).</li>
            <li>Pilih satu jawaban per soal. Jawaban <b>tersimpan otomatis</b>; Anda dapat mengubahnya sebelum waktu habis.</li>
            <li>Waktu habis atau tombol Kirim ditekan: jawaban langsung dinilai. Skor &amp; pembahasan tampil setelah sesi ditutup.</li>
          </ul>
          <p className="mt-2 text-[13px] font-semibold text-[#8A6200]">Sesi ditutup dalam {formatSisa(sisaTutup)}.</p>
          <button type="button" onClick={mulai} disabled={sibuk} className="mt-3 w-full rounded-xl bg-[#13794B] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#13794B] disabled:opacity-60">
            {sibuk ? "Memulai…" : `Mulai ${label} →`}
          </button>
        </Kartu>
      )}

      {/* ------------------------------------------------ mengerjakan */}
      {mengerjakan && sekarangSoal && (
        <>
          <div className="sticky top-[49px] z-10 flex items-center justify-between gap-2 rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2 shadow-sm">
            <div className="text-[12.5px] text-[#5B6B84]">
              Soal <b className="text-[#1B2B4B]">{idx + 1}</b> dari {soal.length}
              <span className="ml-2">{simpan === "menyimpan" ? "Menyimpan…" : simpan === "gagal" ? <b className="text-[#B42329]">Gagal menyimpan, mencoba lagi…</b> : <span className="text-[#13794B]">✓ tersimpan</span>}</span>
            </div>
            <div className={`text-[20px] font-extrabold tabular-nums ${sisaBatas < 60 ? "text-[#B42329]" : "text-[#0F2A52]"}`} aria-label="Sisa waktu">
              ⏱ {formatSisa(sisaBatas)}
            </div>
          </div>

          <Kartu>
            <p className="text-[15px] font-semibold leading-relaxed">{sekarangSoal.teks}</p>
            <div className="mt-3 space-y-2" role="radiogroup" aria-label={`Pilihan jawaban soal ${sekarangSoal.nomor}`}>
              {sekarangSoal.opsi.map((o) => {
                const dipilih = jawaban[String(sekarangSoal.nomor)] === o.kode;
                return (
                  <button
                    key={o.kode}
                    type="button"
                    role="radio"
                    aria-checked={dipilih}
                    onClick={() => pilih(sekarangSoal.nomor, o.kode)}
                    className={`flex w-full items-start gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left text-[14px] transition ${
                      dipilih ? "border-[#1F5FD1] bg-[#E6EEFC] font-semibold" : "border-[#DDE6F3] bg-white hover:border-[#9DB9DE]"
                    }`}
                  >
                    <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${dipilih ? "bg-[#1F5FD1] text-white" : "bg-[#EDF0F4] text-[#4D5B6B]"}`}>{o.kode}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{o.teks}</span>
                  </button>
                );
              })}
            </div>
          </Kartu>

          <Kartu judul={`Navigasi soal — ${terisi} dari ${soal.length} terisi`}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Navigasi soal">
              {soal.map((s, i) => {
                const isi = !!jawaban[String(s.nomor)];
                const aktif = i === idx;
                return (
                  <button
                    key={s.nomor}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`Soal ${s.nomor}: ${isi ? "sudah diisi" : "belum diisi"}${aktif ? ", sedang dibuka" : ""}`}
                    aria-current={aktif ? "step" : undefined}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-extrabold text-white"
                    style={{ background: isi ? WARNA_HIJAU : WARNA_MERAH, outline: aktif ? "3px solid #0F2A52" : "none", outlineOffset: 2 }}
                  >
                    {s.nomor}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#5B6B84]">
              <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded" style={{ background: WARNA_HIJAU }} /> Sudah diisi</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded" style={{ background: WARNA_MERAH }} /> Belum diisi</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-white" style={{ outline: "2px solid #0F2A52" }} /> Soal yang sedang dibuka</span>
            </div>
          </Kartu>

          <div className="flex items-center gap-2">
            <button type="button" className={`${BTN_O} flex-1 !py-2.5`} disabled={idx <= 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              ← Sebelumnya
            </button>
            {idx < soal.length - 1 ? (
              <button type="button" className={`${BTN} flex-1 !py-2.5`} onClick={() => setIdx((i) => Math.min(soal.length - 1, i + 1))}>
                Berikutnya →
              </button>
            ) : (
              <button type="button" className="flex-1 rounded-lg bg-[#13794B] px-3 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#13794B]" onClick={() => setKonfirmasi(true)} disabled={sibuk}>
                Kirim Jawaban
              </button>
            )}
          </div>
          {idx < soal.length - 1 && (
            <button type="button" className="w-full rounded-lg border border-[#13794B] bg-white px-3 py-2 text-[12.5px] font-bold text-[#13794B] hover:bg-[#F1FAF5]" onClick={() => setKonfirmasi(true)} disabled={sibuk}>
              Kirim Jawaban
            </button>
          )}

          {konfirmasi && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Konfirmasi kirim jawaban">
              <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
                <p className="text-[16px] font-extrabold">Kirim jawaban sekarang?</p>
                {belum.length > 0 ? (
                  <p className="mt-1.5 text-[13px] text-[#7F241E]">
                    <b>{belum.length} soal belum diisi</b> (nomor {belum.slice(0, 20).join(", ")}
                    {belum.length > 20 ? ", …" : ""}). Soal kosong dianggap salah.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13px] text-[#0E5E4E]">Semua {soal.length} soal sudah diisi.</p>
                )}
                <p className="mt-1.5 text-[12.5px] text-[#5B6B84]">Setelah dikirim, jawaban tidak dapat diubah.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className={`${BTN_O} flex-1 !py-2.5`} onClick={() => setKonfirmasi(false)}>
                    Kembali
                  </button>
                  <button type="button" className="flex-1 rounded-lg bg-[#13794B] px-3 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#13794B] disabled:opacity-60" disabled={sibuk} onClick={() => kirim(false)}>
                    {belum.length > 0 ? "Tetap kirim" : "Ya, kirim"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------ selesai */}
      {status === "selesai" && k.hasil_tertunda && (
        <Kartu judul="Jawaban Anda tersimpan ✓">
          <p className="text-[13px] leading-relaxed text-[#5B6B84]">
            {k.sesi?.terjawab ?? 0} dari {k.jumlah_soal} soal terjawab. Skor dan pembahasan benar/salah tampil setelah sesi ditutup pukul <b>{jamWib(k.tes.tutup_at)} WIB</b>.
          </p>
          <p className="mt-2 text-[22px] font-extrabold tabular-nums text-[#0F2A52]">{formatSisa(sisaTutup)}</p>
          {k.percobaan > 1 && <p className="mt-1 text-[12.5px] text-[#5B6B84]">Ini percobaan ke-{k.percobaan}; skor tertinggi dari semua percobaan yang dipakai.</p>}
          <Link href="/sigap/pelatihan" className={`${BTN_O} mt-3`}>← Kembali ke Pelatihan</Link>
        </Kartu>
      )}
      {status === "selesai" && kartuUlang}
      {status === "selesai" && k.hasil && (
        <>
          <Kartu judul={`Hasil ${label}`} ket={`Sesi ditutup ${jamWib(k.tes.tutup_at)} WIB`}>
            <div className="flex items-end gap-5">
              <div>
                <p className="text-[12px] text-[#6B7A90]">Skor</p>
                <p className="text-[40px] font-extrabold leading-none text-[#0F2A52]">{k.hasil.skor}</p>
              </div>
              <div>
                <p className="text-[12px] text-[#6B7A90]">Benar</p>
                <p className="text-[22px] font-extrabold leading-none">{k.hasil.benar} / {k.hasil.total}</p>
              </div>
              {k.sesi?.selesai_at && (
                <div>
                  <p className="text-[12px] text-[#6B7A90]">Waktu</p>
                  <p className="text-[22px] font-extrabold leading-none tabular-nums">{formatSisa((new Date(k.sesi.selesai_at).getTime() - new Date(k.sesi.mulai_at).getTime()) / 1000)}</p>
                </div>
              )}
            </div>
            {k.percobaan > 1 && (
              <p className="mt-2 text-[12.5px] text-[#5B6B84]">
                Skor tertinggi dari {k.percobaan} percobaan (pembahasan di bawah dari percobaan ke-{k.hasil.dari_percobaan}).
              </p>
            )}
          </Kartu>
          {kartuUlang}
          <Kartu judul="Pembahasan">
            <ol className="space-y-2.5">
              {k.hasil.butir.map((b) => {
                const jawabO = b.opsi.find((o) => o.kode === b.jawab);
                const kunciO = b.opsi.find((o) => o.kode === b.kunci);
                return (
                  <li key={b.nomor} className={`rounded-xl border px-3 py-2.5 ${b.benar ? "border-[#BFE3D0] bg-[#F4FBF7]" : "border-[#F0C4BF] bg-[#FFF7F6]"}`}>
                    <div className="flex items-start gap-2">
                      <span className="mt-px text-[13px] font-extrabold">{b.nomor}.</span>
                      <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug">{b.teks}</p>
                      {b.benar ? <Chip w="ok">Benar ✔</Chip> : b.jawab ? <Chip w="bad">Salah ✖</Chip> : <Chip w="mut">Kosong</Chip>}
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-[#5B6B84]">
                      Jawaban Anda: <b className={b.benar ? "text-[#0E5E4E]" : "text-[#7F241E]"}>{b.jawab ? `${b.jawab}. ${jawabO?.teks ?? ""}` : "tidak diisi"}</b>
                    </p>
                    {!b.benar && (
                      <p className="text-[12.5px] text-[#5B6B84]">
                        Kunci: <b className="text-[#0E5E4E]">{b.kunci}. {kunciO?.teks ?? ""}</b>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </Kartu>
          <Link href="/sigap/pelatihan" className={BTN_O}>← Kembali ke Pelatihan</Link>
        </>
      )}
      {konfirmasiUlang && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <p className="text-[16px] font-extrabold">Ulangi {label} sekarang?</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-[#5B6B84]">
              <li>Waktu dan jawaban dimulai dari awal (percobaan ke-{k.percobaan + 1} dari {k.ulang_maks}).</li>
              <li>Jawaban percobaan sebelumnya tetap tersimpan; nilai yang dipakai = skor tertinggi dari semua percobaan.</li>
              <li>Waktu mengerjakan paling lama {k.tes.durasi_menit} menit dan tidak melewati pukul {jamWib(k.tes.tutup_at)} WIB.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className={`${BTN_O} flex-1 !py-2.5`} onClick={() => setKonfirmasiUlang(false)}>
                Batal
              </button>
              <button type="button" className="flex-1 rounded-lg bg-[#1F5FD1] px-3 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#1A4FB8] disabled:opacity-60" disabled={sibuk} onClick={ulangi}>
                {sibuk ? "Memulai…" : "Ya, ulangi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Kerangka>
  );
}
