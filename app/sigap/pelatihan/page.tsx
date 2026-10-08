"use client";

// app/sigap/pelatihan/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- tab "Langkah": urutan 1-6 yang harus dilakukan peserta sampai pelatihan selesai.
// Pretest & Posttest menyatu di dalam langkahnya (tidak ada kartu terpisah, supaya tidak dobel). Waktu mengikuti
// jam server. Mockup v2 disetujui user.
//
// Langkah: 1 baca undangan · 2 pelajari instrumen · 3 pretest · 4 hadiri pelatihan · (5 Kuis Live, tambahan: hanya tampil bila admin
// sudah membuat kuis; tidak dihitung dalam progres) · foto Transport Lokal 1-3 · posttest · foto Transport Lokal 4-5 (sejak 8 Okt 2026, boleh dicicil).
// Status: selesai (hijau) / sekarang (biru; jendela tes terbuka atau langkah yang bisa dikerjakan) /
//         berikutnya (biru; langkah pertama yang belum selesai) / menyusul (abu) / terlewat (merah).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LABEL_SLOT_FOTO, bagiFoto, keadaanHari, namaTitik, teksJarak, titikTerdekat } from "@/lib/sigapPresensi";
import { kunciSudahLihat, type PengumumanPeserta } from "@/lib/sigapPengumuman";
import { daftarTerlewat } from "@/lib/sigapTerlewat";
import AktifkanNotifikasi from "@/app/portal/AktifkanNotifikasi";
import { LABEL_JENIS_TES } from "@/lib/sigapTes";
import { Chip, Kartu, Memuat, Pesan } from "../admin/ui";
import { fetchJson, pesanGalat, waktuWib } from "../admin/api";
import { Kerangka, formatSisa, jamWib, peranLabel, useHub, useSaatLewat, type Hub, type TesHub } from "./komponen";
import { ModalPengumuman } from "./pengumumanUi";

type Gaya = "done" | "now" | "wait" | "miss";

// (7 Okt 2026) Permintaan user: tanggal pada "Langkah Anda" harus jelas -- hari ini atau besok.
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** Tanggal kalender WIB (yyyy-mm-dd) dari epoch ms. */
const tglWib = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
/** "Besok · Kamis, 8 Oktober 2026" (+ pita warna). `tglIso` = yyyy-mm-dd (WIB). */
function LabelHari({ tglIso, nowMs, jam }: { tglIso: string; nowMs: number; jam?: string }) {
  const selisih = Math.round((Date.parse(`${tglIso}T00:00:00Z`) - Date.parse(`${tglWib(nowMs)}T00:00:00Z`)) / 86_400_000);
  const d = new Date(`${tglIso}T00:00:00Z`);
  const teks = `${NAMA_HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${NAMA_BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const pita =
    selisih === 0
      ? { t: "HARI INI", c: "bg-[#13794B] text-white" }
      : selisih === 1
        ? { t: "BESOK", c: "bg-[#F4B400] text-[#0F2A52]" }
        : selisih === -1
          ? { t: "KEMARIN", c: "bg-[#8895A7] text-white" }
          : selisih > 1
            ? { t: `${selisih} HARI LAGI`, c: "bg-[#1F5FD1] text-white" }
            : { t: "SUDAH LEWAT", c: "bg-[#8895A7] text-white" };
  return (
    <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-[#0F2A52]">
      <span className={`rounded-[7px] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide ${pita.c}`}>{pita.t}</span>
      <span>
        {teks}
        {jam ? ` · ${jam}` : ""}
      </span>
    </p>
  );
}

/** Ikon garis ala mockup identitas SIGAP (22 px, stroke 1.8). */
function Ikon({ n, className = "h-[22px] w-[22px]" }: { n: "lonceng" | "info" | "centang" | "daftar" | "awas"; className?: string }) {
  const d: Record<string, React.ReactNode> = {
    lonceng: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    centang: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.8 2.8L16 9.5" />
      </>
    ),
    daftar: (
      <>
        <path d="M10 6h10M10 12h10M10 18h10" />
        <path d="m3.5 6 1.5 1.5L7.5 5" />
        <path d="m3.5 12 1.5 1.5L7.5 11" />
        <circle cx="5" cy="18" r="1.6" />
      </>
    ),
    awas: (
      <>
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v5M12 17.5h.01" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`} aria-hidden>
      {d[n]}
    </svg>
  );
}

const TOMBOL = "mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] px-4 py-2.5 text-[14px] font-extrabold transition sm:w-auto";
const TOMBOL_O = `${TOMBOL} border border-[#CBD6E6] bg-white text-[#1B2B4B] hover:bg-[#F5F8FE]`;

/** Jam mulai & selesai pelatihan (ms epoch) dari tanggal_iso + "pukul" undangan, mis. "08.00–16.00 WIB". */
function jendelaPelatihan(u: Hub["undangan"]): { mulai: number; selesai: number } {
  const m = String(u.pukul).match(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/);
  const [h1, m1, h2, m2] = m ? [m[1], m[2], m[3], m[4]] : ["8", "00", "16", "00"];
  const at = (h: string, mm: string) => new Date(`${u.tanggal_iso}T${h.padStart(2, "0")}:${mm}:00+07:00`).getTime();
  return { mulai: at(h1, m1), selesai: at(h2, m2) };
}

/** Isi langkah Pretest/Posttest (hitung mundur, tombol, skor). Berisi hook pemicu muat-ulang saat jam terlewati. */
function IsiTes({ t, sekarangMs, segarkan }: { t: TesHub; sekarangMs: () => number; segarkan: () => void }) {
  const now = sekarangMs();
  const sisaBuka = (new Date(t.buka_at).getTime() - now) / 1000;
  const sisaTutup = (new Date(t.tutup_at).getTime() - now) / 1000;
  const sisaBatas = t.sesi ? (new Date(t.sesi.batas_at).getTime() - now) / 1000 : 0;
  useSaatLewat(t.status === "belum_buka" ? t.buka_at : null, sekarangMs, segarkan, `${t.jenis}-buka`);
  useSaatLewat(t.status === "buka" ? t.tutup_at : null, sekarangMs, segarkan, `${t.jenis}-tutup`);
  useSaatLewat(t.status === "mengerjakan" && t.sesi ? t.sesi.batas_at : null, sekarangMs, segarkan, `${t.jenis}-batas`);
  useSaatLewat(t.status === "selesai" && t.hasil_tertunda ? t.tutup_at : null, sekarangMs, segarkan, `${t.jenis}-hasil`);

  const judul = LABEL_JENIS_TES[t.jenis];
  const href = `/sigap/pelatihan/tes/${t.jenis}`;
  const ket = "text-[13px] text-[#5B6B84]";
  const tgl = <LabelHari tglIso={tglWib(new Date(t.buka_at).getTime())} nowMs={now} jam={`${jamWib(t.buka_at)}–${jamWib(t.tutup_at)} WIB`} />;
  const isi = (() => {
  switch (t.status) {
    case "soal_belum_ada":
      return <p className={ket}>Soal akan dikirim panitia.</p>;
    case "belum_buka":
      return (
        <>
          <p className={ket}>
            {t.jumlah_soal} soal · {t.durasi_menit} menit sejak Mulai.
          </p>
          <p className="mt-1 text-[20px] font-extrabold tabular-nums text-[#0F2A52]">Dibuka dalam {formatSisa(sisaBuka)}</p>
          <button type="button" disabled className={`${TOMBOL} cursor-not-allowed bg-[#DDE6F3] text-[#6B7A90]`}>
            Belum dibuka
          </button>
        </>
      );
    case "buka":
      return (
        <>
          <p className={ket}>
            {t.jumlah_soal} soal · {t.durasi_menit} menit sejak Mulai. Yang terlambat mulai, waktunya berkurang.
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[#8A6200]">Sesi ditutup dalam {formatSisa(sisaTutup)}</p>
          <Link href={href} className={`${TOMBOL} bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]`}>
            Mulai {judul} →
          </Link>
        </>
      );
    case "mengerjakan":
      return (
        <>
          <p className={ket}>
            Terjawab {t.sesi?.terjawab ?? 0} dari {t.jumlah_soal} soal. Jawaban tersimpan otomatis.
          </p>
          <p className={`mt-1 text-[20px] font-extrabold tabular-nums ${sisaBatas < 60 ? "text-[#B42329]" : "text-[#0F2A52]"}`}>Sisa waktu {formatSisa(sisaBatas)}</p>
          <Link href={href} className={`${TOMBOL} bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]`}>
            Lanjutkan mengerjakan →
          </Link>
        </>
      );
    case "selesai":
      return t.hasil_tertunda ? (
        <>
          <p className={ket}>
            Jawaban tersimpan ({t.sesi?.terjawab ?? 0} dari {t.jumlah_soal} soal terjawab){(t.percobaan ?? 1) > 1 ? ` · percobaan ke-${t.percobaan}` : ""}.
          </p>
          <p className="mt-1 text-[12.5px] font-semibold text-[#8A6200]">
            Skor &amp; pembahasan tampil setelah sesi ditutup pukul {jamWib(t.tutup_at)} WIB ({formatSisa(sisaTutup)} lagi).
          </p>
          {t.bisa_ulang && (
            <>
              <p className="mt-1.5 text-[12.5px] text-[#5B6B84]">
                Boleh mengulang (percobaan ke-{t.percobaan} dari {t.ulang_maks}); nilai yang dipakai = skor tertinggi.
              </p>
              <Link href={href} className={`${TOMBOL} bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]`}>
                Ulangi {judul} →
              </Link>
            </>
          )}
        </>
      ) : (
        <>
          <p className={ket}>
            Skor <b className="text-[17px] text-[#0F2A52]">{t.skor ?? "–"}</b> · benar {t.benar ?? 0} dari {t.total ?? t.jumlah_soal} soal.
            {(t.percobaan ?? 1) > 1 && <span className="text-[12px] text-[#6B7A90]"> (tertinggi dari {t.percobaan} percobaan)</span>}
          </p>
          {t.bisa_ulang && (
            <Link href={href} className={`${TOMBOL} bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]`}>
              Ulangi {judul} →
            </Link>
          )}
          <Link href={href} className={TOMBOL_O}>
            Lihat pembahasan
          </Link>
        </>
      );
    case "terlewat":
      return <p className={ket}>Sesi sudah ditutup dan Anda belum mengerjakan.</p>;
    default:
      return <p className={ket}>Tes tidak aktif.</p>;
  }
  })();
  return (
    <>
      {tgl}
      {isi}
    </>
  );
}


/** (7 Okt 2026) Isi langkah Kuis Live (tambahan). Memantau status ruang tiap ~5 dtk supaya tombol Gabung muncul begitu admin membuka ruang. */
function IsiKuis({ k, segarkan }: { k: NonNullable<Hub["kuis"]>; segarkan: () => void }) {
  const [live, setLive] = useState<{ aktif: boolean; status: string | null; ruangId: number | null; judul: string | null } | null>(null);
  const tandaHub = useRef(`${k.ada_ruang_aktif}`);
  tandaHub.current = `${k.ada_ruang_aktif}`;
  const tandaLive = useRef("");
  useEffect(() => {
    let batal = false;
    let timer: ReturnType<typeof setTimeout>;
    async function putar() {
      try {
        if (!document.hidden) {
          const d = await fetchJson<{ ada: boolean; ruang?: { id: number; status: string; judul: string } }>(`/api/sigap/pelatihan/kuis?kelas=${k.kelas ?? 1}`);
          if (batal) return;
          const aktif = !!d.ada && !!d.ruang && d.ruang.status !== "selesai";
          setLive({ aktif, status: d.ruang?.status ?? null, ruangId: d.ruang?.id ?? null, judul: d.ruang?.judul ?? null });
          // ruang dibuka/ditutup di server -> segarkan hub sekali (sudah_gabung, pernah_ikut, dst.)
          const tanda = `${aktif}:${d.ruang?.id ?? ""}`;
          if (tanda !== tandaLive.current) {
            const pertama = tandaLive.current === "";
            tandaLive.current = tanda;
            if (!pertama || `${aktif}` !== tandaHub.current) segarkan();
          }
        }
      } catch {
        /* abaikan: dicoba lagi */
      }
      if (!batal) timer = setTimeout(putar, 5000);
    }
    putar();
    return () => {
      batal = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aktif = live ? live.aktif : k.ada_ruang_aktif;
  const status = live ? live.status : k.status;
  const judul = live?.judul ?? k.judul;
  const ket = "text-[13px] text-[#5B6B84]";
  if (aktif)
    return (
      <>
        <p className="text-[13px] font-semibold text-[#13794B]">{status === "lobi" ? "Adu Sigap dibuka — ayo bergabung!" : "Adu Sigap sedang berlangsung."}{judul ? ` · ${judul}` : ""}</p>
        <Link href={`/sigap/pelatihan/kuis?kelas=${k.kelas ?? 1}&gabung=1`} className={`${TOMBOL} w-full bg-[#0F2A52] text-white hover:bg-[#0A1E3D]`}>
          {k.sudah_gabung ? "🎮 Masuk kembali ke kuis →" : "🎮 Gabung kuis →"}
        </Link>
      </>
    );
  if (k.pernah_ikut)
    return (
      <>
        <p className={ket}>Anda sudah ikut kuis. Skor dicatat sebagai nilai tambahan.</p>
        <Link href={`/sigap/pelatihan/kuis?kelas=${k.kelas ?? 1}`} className="mt-1 inline-block text-[12px] font-semibold text-[#1F5FD1] underline">Lihat hasil</Link>
      </>
    );
  if (k.ada_ruang_selesai) return <p className={ket}>Kuis sudah selesai dan Anda belum tercatat ikut.</p>;
  return <p className={ket}>Kuis dibuka oleh pemandu saat sesi pelatihan. Tombol Gabung muncul otomatis di sini.</p>;
}

/**
 * Isi langkah Presensi: baca lokasi HP, tampilkan jarak ke lokasi pelatihan, tombol aktif bila dalam radius & jam sesi.
 * (8 Okt 2026) Presensi per sesi (1-3 sesi per hari, diatur panitia). Peringatan lokasi hanya untuk sesi yang SEDANG DIBUKA dan
 * belum tercatat; begitu semua sesi hari ini tercatat, peringatan/tombol/pembacaan GPS padam dan diganti ringkasan hijau.
 */
function IsiPresensi({ pres, nowMs, tempat, segarkan }: { pres: NonNullable<Hub["presensi"]>; nowMs: number; tempat: string; segarkan: () => void }) {
  const peng = pres.pengaturan;
  const kead = keadaanHari(pres.hari, nowMs);
  const aktif = kead.aktif;
  const aktifKunci = aktif?.kunci ?? null;
  const banyak = kead.total > 1;
  const [pos, setPos] = useState<{ lat: number; lng: number; akurasi: number } | null>(null);
  const [gpsGalat, setGpsGalat] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [kirim, setKirim] = useState(false);
  const [galatKirim, setGalatKirim] = useState<string | null>(null);

  const baca = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsGalat("Perangkat/browser ini tidak mendukung lokasi (GPS).");
      return;
    }
    setMembaca(true);
    setGpsGalat(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy });
        setMembaca(false);
      },
      (e) => {
        setMembaca(false);
        setPos(null);
        setGpsGalat(
          e.code === 1
            ? "Izin lokasi ditolak. Izinkan lokasi untuk situs ini di pengaturan browser/HP, lalu tekan Segarkan lokasi."
            : e.code === 3
              ? "Lokasi terlalu lama terbaca. Pindah ke area terbuka lalu tekan Segarkan lokasi."
              : "Lokasi tidak terbaca. Aktifkan GPS/lokasi di HP lalu tekan Segarkan lokasi."
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    );
  }, []);

  // baca lokasi otomatis sekali tiap sesi yang sedang dibuka & belum tercatat (sesi lengkap -> tidak membaca lokasi sama sekali)
  const sudahBaca = useRef<string | null>(null);
  useEffect(() => {
    if (!aktifKunci || sudahBaca.current === aktifKunci) return;
    sudahBaca.current = aktifKunci;
    setPos(null);
    setGalatKirim(null);
    baca();
  }, [aktifKunci, baca]);

  async function presensi() {
    if (!pos || !aktifKunci) return;
    setKirim(true);
    setGalatKirim(null);
    try {
      await fetchJson("/api/sigap/pelatihan/presensi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pos, sesi: aktifKunci }) });
      segarkan();
    } catch (e) {
      setGalatKirim(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  const ket = "text-[13px] text-[#5B6B84]";
  // (7 Okt 2026) bisa lebih dari satu titik (Mami Hotel / Ully Hotel Solok): peserta cukup berada di salah satunya
  const lokasiTeks = peng.titik.length ? namaTitik(peng.titik) : tempat;
  const radiusTeks = [...new Set(peng.titik.map((t) => t.radius_m))].map((r) => `${r} m`).join(" / ") || "—";

  // ringkasan sesi (hanya bila > 1 sesi per hari): ✓ Pagi 07.12 · ● Sore (dibuka) · ○ Malam 15.00
  const ringkasSesi = banyak && (
    <p className="mb-1.5 flex flex-wrap gap-1">
      {kead.sesi.map((x) => {
        const gaya = x.status === "selesai" ? "bg-[#E3F6EC] text-[#13794B]" : x.status === "terbuka" ? "bg-[#E6EEFC] text-[#0F2A52]" : x.status === "terlewat" ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#EEF2F7] text-[#6B7A90]";
        const ikon = x.status === "selesai" ? "✓" : x.status === "terbuka" ? "●" : x.status === "terlewat" ? "✕" : "○";
        const teks = x.status === "selesai" ? `${x.at ? jamWib(x.at) : "–"} WIB` : x.status === "terbuka" ? `sampai ${jamWib(x.tutup_at)}` : x.status === "terlewat" ? "terlewat" : `${jamWib(x.buka_at)}–${jamWib(x.tutup_at)}`;
        return (
          <span key={x.kunci} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${gaya}`}>
            {ikon} {x.nama} · {teks}
          </span>
        );
      })}
    </p>
  );

  // semua sesi hari ini tercatat -> tidak ada peringatan lokasi, tidak ada tombol
  if (kead.lengkap) {
    const x = kead.sesi[0];
    return (
      <>
        {ringkasSesi}
        <p className="text-[13px] font-semibold text-[#13794B]">
          {banyak
            ? `✓ Presensi hari ini lengkap (${kead.selesai} dari ${kead.total} sesi).`
            : `✓ Presensi tercatat pukul ${x.at ? jamWib(x.at) : "–"} WIB${x.manual ? " (dicatat panitia)" : x.jarak_m != null ? ` · ${teksJarak(x.jarak_m)} dari ${x.titik_nama ?? tempat}` : ""}.`}
        </p>
        <p className={ket}>{banyak ? "Terima kasih. Bila ada kendala, hubungi panitia." : "Presensi hanya sekali. Bila ada kendala, hubungi panitia."}</p>
      </>
    );
  }

  // tidak ada sesi yang sedang dibuka
  if (!aktif) {
    const b = kead.berikutnya;
    return (
      <>
        {ringkasSesi}
        {b ? (
          <>
            {kead.selesai > 0 && <p className="mb-1 text-[13px] font-semibold text-[#13794B]">✓ {kead.selesai} dari {kead.total} presensi hari ini sudah tercatat.</p>}
            <p className={ket}>
              {banyak ? `Presensi ${b.nama} dibuka` : "Presensi dibuka"} pukul {jamWib(b.buka_at)} WIB. Tombol aktif otomatis saat jam dibuka; Anda harus berada dalam radius {radiusTeks} dari {lokasiTeks}.
            </p>
            <button type="button" disabled className={`${TOMBOL} cursor-not-allowed bg-[#DDE6F3] text-[#6B7A90]`}>
              Belum dibuka
            </button>
          </>
        ) : (
          <p className="text-[13px] font-semibold text-[#B42329]">
            {banyak ? `Presensi ${kead.sesi.filter((x) => x.status === "terlewat").map((x) => x.nama).join(", ")} sudah ditutup dan belum tercatat untuk Anda.` : `Presensi sudah ditutup (pukul ${jamWib(kead.sesi[0].tutup_at)} WIB) dan belum tercatat untuk Anda.`} Hubungi panitia.
          </p>
        )}
      </>
    );
  }

  const dekat = pos ? titikTerdekat(pos, peng.titik) : null;
  const jarak = dekat?.jarak_m ?? null;
  const akurasiBuruk = !!pos && pos.akurasi > peng.akurasi_maks_m;
  const dalam = !!dekat && dekat.dalam && !akurasiBuruk;
  return (
    <>
      {ringkasSesi}
      <p className={ket}>
        Harus berada dalam radius {radiusTeks} dari {lokasiTeks}. {banyak ? `Presensi ${aktif.nama} dibuka` : "Presensi dibuka"} sampai pukul {jamWib(aktif.tutup_at)} WIB.
      </p>
      {membaca && <p className="mt-1 text-[13px] font-semibold text-[#5B6B84]">Membaca lokasi Anda…</p>}
      {gpsGalat && <p className="mt-1 text-[13px] font-semibold text-[#8A6200]">{gpsGalat}</p>}
      {pos && jarak != null && !membaca && (
        <p className={`mt-1 text-[13px] font-semibold ${dalam ? "text-[#13794B]" : "text-[#B42329]"}`}>
          {akurasiBuruk
            ? `Sinyal GPS lemah (±${Math.round(pos.akurasi)} m, maksimal ±${peng.akurasi_maks_m} m). Pindah ke area terbuka lalu segarkan lokasi.`
            : dalam
              ? `Anda berada ${teksJarak(jarak)} dari ${dekat!.titik.nama} — di dalam radius. (akurasi ±${Math.round(pos.akurasi)} m)`
              : `Anda berada ${teksJarak(jarak)} dari ${dekat!.titik.nama} (titik terdekat) — di luar radius ${dekat!.titik.radius_m} m. Datanglah ke lokasi lalu segarkan lokasi.`}
        </p>
      )}
      {galatKirim && <p className="mt-1 text-[13px] font-semibold text-[#B42329]">{galatKirim}</p>}
      <button
        type="button"
        disabled={!dalam || kirim || membaca}
        onClick={presensi}
        className={`${TOMBOL} ${dalam && !kirim && !membaca ? "bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]" : "cursor-not-allowed bg-[#DDE6F3] text-[#6B7A90]"}`}
      >
        {kirim ? "Mencatat…" : dalam ? (banyak ? `✓ Presensi ${aktif.nama} sekarang` : "✓ Presensi sekarang") : "Presensi (belum di dalam radius)"}
      </button>
      <button type="button" onClick={baca} disabled={membaca} className="mt-1.5 text-[12.5px] font-semibold text-[#1F5FD1] underline disabled:opacity-50">
        ↻ Segarkan lokasi
      </button>
    </>
  );
}

/** (7 Okt 2026) Modal "Yeay": muncul sekali untuk tiap langkah yang baru selesai, lalu menunjuk langkah berikutnya. */
type Rayakan = { selesai: { no: number; judul: string }[]; berikut: { kode: string; no: number; judul: string } | null; semua: boolean };
function ModalSelesai({ r, tutup, lanjut }: { r: Rayakan; tutup: () => void; lanjut: (kode: string) => void }) {
  const tombol = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    tombol.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && tutup();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [tutup]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={tutup}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-selesai" className="w-full max-w-sm rounded-[22px] bg-white p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[44px] leading-none" aria-hidden>
          🎉
        </div>
        <h2 id="judul-selesai" className="mt-2 text-[20px] font-extrabold text-[#0F2A52]">
          Yeay! {r.semua ? "Semua tahapan selesai" : "Tahapan selesai"}
        </h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#1B2B4B]">
          Kamu sudah menyelesaikan tahapan{r.selesai.length > 1 ? ":" : ""}
        </p>
        <ul className="mt-1.5 space-y-1">
          {r.selesai.map((x) => (
            <li key={x.no} className="rounded-lg bg-[#E3F6EC] px-3 py-1.5 text-[14px] font-bold text-[#13794B]">
              ✓ {x.no}. {x.judul}
            </li>
          ))}
        </ul>
        {r.berikut ? (
          <>
            <p className="mt-3 text-[13.5px] text-[#5B6B84]">
              Selanjutnya: <b className="text-[#1B2B4B]">{r.berikut.no}. {r.berikut.judul}</b>
            </p>
            <button ref={tombol} type="button" onClick={() => lanjut(r.berikut!.kode)} className="mt-3 w-full rounded-[13px] bg-[#1F5FD1] px-4 py-3 text-[14.5px] font-extrabold text-white hover:bg-[#1A4FB8]">
              Lanjut ke langkah berikutnya →
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13.5px] text-[#5B6B84]">{r.semua ? "Terima kasih, seluruh langkah pelatihan sudah kamu selesaikan." : "Langkah lain menyusul sesuai jadwal."}</p>
            <button ref={tombol} type="button" onClick={tutup} className="mt-3 w-full rounded-[13px] bg-[#1F5FD1] px-4 py-3 text-[14.5px] font-extrabold text-white hover:bg-[#1A4FB8]">
              Tutup
            </button>
          </>
        )}
        {r.berikut && (
          <button type="button" onClick={tutup} className="mt-2 w-full rounded-[13px] border border-[#CBD6E6] bg-white px-4 py-2.5 text-[14px] font-bold text-[#1B2B4B] hover:bg-[#F5F8FE]">
            Tutup
          </button>
        )}
      </div>
    </div>
  );
}

const KUNCI_RAYAKAN = "sigap_pel_rayakan_";
const bacaRayakan = (id: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KUNCI_RAYAKAN + id) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const simpanRayakan = (id: string, kode: string[]) => {
  try {
    localStorage.setItem(KUNCI_RAYAKAN + id, JSON.stringify(kode));
  } catch {
    /* penyimpanan browser diblokir: abaikan, modal bisa muncul lagi saat dibuka ulang */
  }
};

/** (7 Okt 2026) Pemandu Langkah: satu kotak ringkas di atas daftar langkah -- apresiasi untuk yang sudah selesai + pengingat/arahan langkah berikutnya. */
type Pemandu = { nada: "ok" | "ingat" | "info"; ikon: string; judul: string; teks?: string; aksi?: { label: string; href?: string; kode?: string }; terima?: string; catatan?: string; tertinggal?: string };
const TERIMA: Record<string, string> = {
  undangan: "Undangan sudah dibaca",
  instrumen: "Instrumen sudah dipelajari",
  pretest: "Pretest sudah dikerjakan",
  hadir: "Presensi sudah tercatat",
  kuis: "Adu Sigap sudah diikuti",
  posttest: "Posttest sudah dikerjakan",
  foto_awal: "Foto sebelum posttest sudah terunggah",
  foto_akhir: "Semua foto Transport Lokal sudah terunggah",
};
function susunPemandu(langkah: Langkah[], data: Hub, nowMs: number, mulaiMs: number): Pemandu | null {
  if (!langkah.length) return null;
  const tes = (k: string) => data.tes.find((t) => t.jenis === k);
  const L = data.langkah;
  const no = (kode: string) => langkah.findIndex((l) => l.kode === kode) + 1;
  // (7 Okt 2026) Kuis Live = langkah tambahan: tidak menentukan "semua selesai"/langkah berikutnya, tapi bila ruang sedang dibuka diingatkan paling atas.
  const wajib = langkah.filter((l) => !l.tambahan);
  const kuisAktif = data.kuis?.ada_ruang_aktif ? data.kuis : null;
  // Apresiasi singkat: langkah selesai terakhir (urutan terjauh).
  let idxTerakhir = -1;
  wajib.forEach((l, i) => l.selesai && (idxTerakhir = i));
  const terima = idxTerakhir >= 0 && !wajib.every((l) => l.selesai) ? `${TERIMA[wajib[idxTerakhir].kode] ?? wajib[idxTerakhir].judul} — terima kasih.` : undefined;
  const terlewat = wajib.filter((l) => l.terlewat).map((l) => l.judul.replace(/^Kerjakan /, ""));
  const catatan = terlewat.length ? `Terlewat: ${terlewat.join(", ")}. Hubungi panitia bila ada kendala.` : undefined;

  if (kuisAktif)
    return {
      nada: "ingat",
      ikon: "🎮",
      judul: kuisAktif.sudah_gabung ? "Adu Sigap sedang berlangsung" : "Adu Sigap dibuka — ayo bergabung!",
      teks: kuisAktif.sudah_gabung ? "Anda sudah bergabung. Kembali ke layar kuis bila tertutup." : "Tekan Gabung; kuis dipimpin admin di layar depan dan dijawab dari HP Anda.",
      aksi: { label: kuisAktif.sudah_gabung ? "Masuk kembali ke kuis →" : "Gabung kuis →", href: `/sigap/pelatihan/kuis?kelas=${kuisAktif.kelas ?? 1}&gabung=1` },
      terima,
      catatan,
    };

  if (wajib.every((l) => l.selesai))
    return { nada: "ok", ikon: "🎉", judul: "Semua langkah sudah selesai", teks: "Terima kasih telah mengikuti pelatihan dengan baik. Tidak ada lagi yang perlu dikerjakan di sini." };

  // Prioritas: langkah berbatas waktu yang sedang terbuka (tes/presensi), baru langkah pertama yang belum selesai.
  const waktuTerbuka = wajib.find((l) => !l.selesai && !l.terlewat && l.bisaSekarang && ["pretest", "hadir", "posttest"].includes(l.kode));
  const f = waktuTerbuka ?? wajib.find((l) => !l.selesai && !l.terlewat);
  if (!f) return { nada: "info", ikon: "ℹ️", judul: "Tidak ada langkah yang menunggu", teks: "Langkah lainnya sudah selesai atau terlewat.", terima, catatan };
  const n = no(f.kode);
  // Langkah awal yang masih kosong, padahal langkah berbatas waktu sudah di depan mata: ingatkan pelan-pelan.
  const kosong = langkah.slice(0, n - 1).filter((l) => !l.tambahan && !l.selesai && !l.terlewat && l.bisaSekarang).map((l) => `${langkah.indexOf(l) + 1}. ${l.judul}`);
  const hasil = ((): Pemandu | null => {
  switch (f.kode) {
    case "undangan":
      return { nada: "ingat", ikon: "🔔", judul: `Mulai dari langkah ${n}: baca undangan`, teks: "Kelas, jam, dan pakaian pelatihan ada di sana. Cukup dibuka sekali.", aksi: { label: "Buka Undangan →", href: "/sigap/pelatihan/undangan" }, terima, catatan };
    case "instrumen":
      return { nada: "ingat", ikon: "🔔", judul: `Langkah ${n}: pelajari instrumen`, teks: "Unduh kuesioner dan buku pedoman agar siap saat pretest.", aksi: { label: "Buka Instrumen →", href: "/sigap/pelatihan/instrumen" }, terima, catatan };
    case "pretest":
    case "posttest": {
      const t = tes(f.kode);
      const nama = f.kode === "pretest" ? "Pretest" : "Posttest";
      if (!t || t.status === "soal_belum_ada") return { nada: "info", ikon: "ℹ️", judul: `Langkah ${n}: ${nama} menyusul`, teks: "Soal akan dikirim panitia.", terima, catatan };
      if (t.status === "belum_buka") {
        const sisa = (new Date(t.buka_at).getTime() - nowMs) / 1000;
        return { nada: "info", ikon: "ℹ️", judul: `Langkah ${n}: ${nama} dibuka ${waktuWib(t.buka_at)}`, teks: `Dibuka dalam ${formatSisa(sisa)}. ${t.jumlah_soal} soal · ${t.durasi_menit} menit sejak Mulai.`, terima, catatan };
      }
      if (t.status === "mengerjakan") return { nada: "ingat", ikon: "🔔", judul: `${nama} sedang Anda kerjakan`, teks: "Jawaban tersimpan otomatis. Lanjutkan sebelum waktu habis.", aksi: { label: "Lanjutkan mengerjakan →", href: `/sigap/pelatihan/tes/${t.jenis}` }, terima, catatan };
      return { nada: "ingat", ikon: "🔔", judul: `Langkah ${n}: ${nama} sedang dibuka`, teks: `Sesi ditutup dalam ${formatSisa((new Date(t.tutup_at).getTime() - nowMs) / 1000)}. ${t.jumlah_soal} soal · ${t.durasi_menit} menit sejak Mulai.`, aksi: { label: `Mulai ${nama} →`, href: `/sigap/pelatihan/tes/${t.jenis}` }, terima, catatan };
    }
    case "hadir": {
      if (!data.presensi) return { nada: "info", ikon: "ℹ️", judul: `Langkah ${n}: presensi menyusul`, teks: "Panitia belum mengatur presensi.", terima, catatan };
      // (8 Okt 2026) per sesi: pandu ke sesi yang sedang dibuka, atau tunjukkan jam sesi berikutnya
      const kh = keadaanHari(data.presensi.hari, nowMs);
      const banyak = kh.total > 1;
      if (kh.aktif) return { nada: "ingat", ikon: "🔔", judul: `Langkah ${n}: presensi ${banyak ? `${kh.aktif.nama} ` : ""}sudah dibuka`, teks: `Lakukan presensi setelah tiba di lokasi, sampai pukul ${jamWib(kh.aktif.tutup_at)} WIB. Aktifkan lokasi (GPS) di HP.`, aksi: { label: "Ke langkah presensi ↓", kode: "hadir" }, terima, catatan };
      if (kh.berikutnya) return { nada: "info", ikon: "ℹ️", judul: `Langkah ${n}: presensi ${banyak ? `${kh.berikutnya.nama} ` : ""}dibuka ${waktuWib(kh.berikutnya.buka_at)}`, teks: "Presensi dilakukan di lokasi pelatihan dengan lokasi HP aktif.", terima, catatan };
      return { nada: "info", ikon: "ℹ️", judul: `Langkah ${n}: presensi sudah ditutup`, teks: "Hubungi panitia bila presensi Anda belum tercatat.", terima, catatan };
    }
    case "foto_awal":
    case "foto_akhir": {
      const total = L?.foto_total ?? 5;
      const { awal, akhir } = bagiFoto(total);
      const rentang = f.kode === "foto_awal" ? awal : akhir;
      const ada = rentang.filter((sl) => L?.slot.includes(sl)).length;
      const sebelum = f.kode === "foto_awal";
      const nama = sebelum ? "foto sebelum posttest" : "foto sesudah posttest";
      if (nowMs < mulaiMs && ada === 0) return { nada: "info", ikon: "ℹ️", judul: `Langkah ${n}: ${nama}`, teks: `Unggah ${rentang.length} foto (${rentang.map((sl) => (LABEL_SLOT_FOTO[sl - 1] ?? `Foto ${sl}`).toLowerCase()).join(", ")}) pada hari pelatihan; boleh satu per satu, batas 23.59 WIB di hari yang sama.`, terima, catatan };
      return {
        nada: "ingat",
        ikon: "🔔",
        judul: `Langkah ${n}: ${sebelum ? "unggah" : "lengkapi"} ${nama}`,
        teks: ada > 0 ? `Baru ${ada} dari ${rentang.length} foto. Lengkapi sebelum 23.59 WIB hari ini.` : `Unggah ${rentang.length} foto (${rentang.map((sl) => (LABEL_SLOT_FOTO[sl - 1] ?? `Foto ${sl}`).toLowerCase()).join(", ")}); boleh satu per satu.`,
        aksi: data.token_translok ? { label: "Buka Transport Lokal →", href: `/sigap/translok/${data.token_translok}` } : undefined,
        terima,
        catatan,
      };
    }
    default:
      return null;
  }
  })();
  if (hasil && kosong.length) hasil.tertinggal = `Masih menunggu: ${kosong.join(" · ")}.`;
  return hasil;
}

/** (8 Okt 2026) Peringatan merah: ada kegiatan pelatihan yang waktunya sudah ditutup dan belum dikerjakan -> pelatihan tidak lengkap. */
function PeringatanTerlewat({ daftar }: { daftar: string[] }) {
  if (daftar.length === 0) return null;
  return (
    <div role="alert" className="rounded-[18px] border border-[#F2B8BA] bg-[#FDE8E8] px-4 py-3.5 text-[#7A1D22] shadow-[0_8px_22px_rgba(15,42,82,.06)]">
      <p className="flex items-start gap-2.5 text-[14.5px] font-extrabold leading-snug text-[#B42329]">
        <Ikon n="awas" className="mt-px h-5 w-5" />
        <span>Ada kegiatan pelatihan yang terlewat</span>
      </p>
      <p className="mt-1.5 pl-[30px] text-[13px] leading-relaxed">
        Waktunya sudah ditutup, sehingga <b>kegiatan pelatihan Anda tidak lengkap</b>. Yang terlewat:
      </p>
      <ul className="mt-1 list-disc pl-12 text-[13px] font-semibold">
        {daftar.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="mt-1.5 pl-[30px] text-[12.5px] leading-relaxed">Bila ada kendala (sinyal, lokasi HP, atau lainnya), segera hubungi panitia agar dapat ditinjau.</p>
    </div>
  );
}

function KotakPemandu({ p, ke }: { p: Pemandu; ke: (kode: string) => void }) {
  // (8 Okt 2026) Mengikuti mockup "Tugas utama": kartu putih, petak ikon bergradasi biru, satu tombol biru penuh di bawah.
  const label = p.nada === "ok" ? "SELESAI" : p.nada === "ingat" ? "LANGKAH BERIKUTNYA" : "INFO";
  const ikon = p.nada === "ok" ? "centang" : p.nada === "ingat" ? "lonceng" : "info";
  const petak = p.nada === "ok" ? "bg-[#13794B]" : p.nada === "ingat" ? "bg-gradient-to-br from-[#3B78E0] to-[#1A4590]" : "bg-gradient-to-br from-[#5B6B84] to-[#3A4A66]";
  const tombol = "mt-3 inline-flex min-h-[46px] w-full items-center justify-center rounded-[13px] bg-[#1F5FD1] px-4 text-[14.5px] font-extrabold text-white transition hover:bg-[#1A4FB8]";
  return (
    <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.1)]" role="status">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-extrabold tracking-[0.16em] text-[#B8860B]">{label}</span>
      </div>
      {p.terima && <p className="mt-1.5 text-[12.5px] font-bold text-[#13794B]">✓ {p.terima}</p>}
      <div className="mt-2.5 flex items-start gap-3">
        <span className={`grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] text-white ${petak}`}>
          <Ikon n={ikon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-extrabold leading-snug text-[#0F2A52]">{p.judul}</p>
          {p.teks && <p className="mt-1 text-[12.5px] leading-relaxed text-[#5B6B84]">{p.teks}</p>}
        </div>
      </div>
      {p.aksi &&
        (p.aksi.href ? (
          <Link href={p.aksi.href} className={tombol}>
            {p.aksi.label}
          </Link>
        ) : (
          <button type="button" onClick={() => ke(p.aksi!.kode!)} className={tombol}>
            {p.aksi.label}
          </button>
        ))}
      {p.tertinggal && <p className="mt-2.5 text-[12px] font-semibold text-[#5B6B84]">{p.tertinggal}</p>}
      {p.catatan && <p className="mt-2 text-[12px] font-semibold text-[#B42329]">{p.catatan}</p>}
    </section>
  );
}

type Langkah = { kode: string; judul: string; selesai: boolean; terlewat: boolean; bisaSekarang: boolean; badan: React.ReactNode; /** langkah tambahan: tidak dihitung dalam progres & "semua selesai" */ tambahan?: boolean; /** (8 Okt 2026) punya tombol yang bisa ditekan: jangan diredupkan walau statusnya "Menyusul" */ tombolAktif?: boolean; /** (8 Okt 2026) paksa diredupkan (mis. langkah foto di luar hari pelatihan) */ redup?: boolean };

export default function HalamanPelatihan() {
  const { data, galat, muat, jam } = useHub(30_000);
  const router = useRouter();
  // (8 Okt 2026) Modal pengumuman dari panitia (Kelola Pelatihan > Pengumuman): antrian berurutan, ditentukan SEKALI saat data pertama
  // tiba (supaya muat-ulang otomatis tiap 30 dtk tidak mengacak). Modal "sekali" yang sudah ditutup dicatat di browser.
  const [antrianPeng, setAntrianPeng] = useState<PengumumanPeserta[] | null>(null);
  const [posPeng, setPosPeng] = useState(0);
  const [rayakan, setRayakan] = useState<Rayakan | null>(null);
  const tutupRayakan = useCallback(() => setRayakan(null), []);
  const lanjutRayakan = useCallback((kode: string) => {
    setRayakan(null);
    setTimeout(() => document.getElementById(`langkah-${kode}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, []);
  const now = jam.sekarang();
  // (7 Okt 2026) /sigap/pelatihan = tab Langkah bagi peserta. Pengelola yang bukan peserta langsung dibawa ke Kelola Pelatihan.
  useEffect(() => {
    if (data && !data.peserta && data.boleh_lihat_kelola) router.replace("/sigap/pelatihan/kelola");
  }, [data, router]);
  const u = data?.undangan;
  const peserta = data?.peserta ?? null;

  let langkah: Langkah[] = [];
  if (data && peserta && u) {
    const { mulai } = jendelaPelatihan(u);
    // (8 Okt 2026) langkah foto "menyala" hanya pada HARI pelatihan (00.00-23.59 WIB); di luar itu diredupkan
    const awalHari = new Date(`${u.tanggal_iso}T00:00:00+07:00`).getTime();
    const hariPelatihan = now >= awalHari && now < awalHari + 24 * 3_600_000;
    const pre = data.tes.find((t) => t.jenis === "pretest");
    const post = data.tes.find((t) => t.jenis === "posttest");
    const L = data.langkah;
    const tes = (t: TesHub | undefined, judul: string, kode: string): Langkah => ({
      kode,
      judul,
      selesai: t?.status === "selesai",
      terlewat: t?.status === "terlewat",
      bisaSekarang: t?.status === "buka" || t?.status === "mengerjakan",
      badan: t ? <IsiTes t={t} sekarangMs={jam.sekarang} segarkan={muat} /> : <p className="text-[13px] text-[#5B6B84]">Belum dijadwalkan panitia.</p>,
    });
    const tautan = (href: string, label: string, selesai: boolean) =>
      selesai ? (
        <Link href={href} className="mt-1 inline-block text-[12px] font-semibold text-[#1F5FD1] underline">
          Buka kembali
        </Link>
      ) : (
        <Link href={href} className={TOMBOL_O}>
          {label}
        </Link>
      );
    const fotoTotal = L?.foto_total ?? 5;
    const { awal: slotAwal, akhir: slotAkhir } = bagiFoto(fotoTotal);
    /** Satu langkah foto (cicil satu per satu): daftar slot yang jadi tanggung jawab langkah ini. */
    const langkahFoto = (kode: "foto_awal" | "foto_akhir", slotIni: number[], judul: string, petunjuk: string): Langkah => {
      const ada = slotIni.filter((sl) => L?.slot.includes(sl)).length;
      const selesai = slotIni.length > 0 && ada >= slotIni.length;
      return {
        kode,
        judul,
        selesai,
        terlewat: false,
        bisaSekarang: now >= mulai,
        tombolAktif: hariPelatihan && !!data.token_translok,
        redup: !hariPelatihan,
        badan: (
          <>
            <LabelHari tglIso={u.tanggal_iso} nowMs={now} jam="unggah sampai 23.59 WIB" />
            {L && (
              <p className="mb-1 flex flex-wrap gap-1">
                {slotIni.map((sl) => {
                  const sudah = L.slot.includes(sl);
                  return (
                    <span key={sl} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${sudah ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#EEF2F7] text-[#6B7A90]"}`}>
                      {sudah ? "✓" : "○"} {LABEL_SLOT_FOTO[sl - 1] ?? `Foto ${sl}`}
                    </span>
                  );
                })}
              </p>
            )}
            <p className="text-[13px] text-[#5B6B84]">
              {selesai ? `Semua ${slotIni.length} foto sudah terunggah.` : ada > 0 ? `Baru ${ada} dari ${slotIni.length} foto terunggah. Lengkapi yang kurang sebelum 23.59 WIB di hari yang sama.` : petunjuk}
            </p>
            {/* (8 Okt 2026) Tombol navigasi ke tempat unggah SELALU ada (juga sebelum hari pelatihan) -- permintaan user */}
            {data.token_translok &&
              (selesai ? (
                <a href={`/sigap/translok/${data.token_translok}`} className="mt-1 inline-block text-[12px] font-semibold text-[#1F5FD1] underline">
                  Buka kembali
                </a>
              ) : (
                <a href={`/sigap/translok/${data.token_translok}`} className={`${TOMBOL} bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]`}>
                  {ada > 0 ? `Lengkapi foto yang kurang (${slotIni.length - ada}) →` : "Buka Transport Lokal →"}
                </a>
              ))}
          </>
        ),
      };
    };
    langkah = [
      {
        kode: "undangan",
        judul: "Baca undangan",
        selesai: !!L?.undangan_dibuka,
        terlewat: false,
        bisaSekarang: true,
        badan: (
          <>
            <p className="text-[13px] text-[#5B6B84]">Kelas, jam, dan pakaian.</p>
            {tautan("/sigap/pelatihan/undangan", "Buka Undangan", !!L?.undangan_dibuka)}
          </>
        ),
      },
      {
        kode: "instrumen",
        judul: "Pelajari instrumen",
        selesai: !!L?.instrumen_diunduh,
        terlewat: false,
        bisaSekarang: true,
        badan: (
          <>
            <p className="text-[13px] text-[#5B6B84]">Kuesioner &amp; buku pedoman.</p>
            {tautan("/sigap/pelatihan/instrumen", "Buka Instrumen", !!L?.instrumen_diunduh)}
          </>
        ),
      },
      tes(pre, "Kerjakan Pretest", "pretest"),
      {
        kode: "hadir",
        judul: "Presensi di lokasi pelatihan",
        selesai: !!data.presensi?.sudah,
        // (8 Okt 2026) per sesi: terlewat = ada sesi hari ini yang lewat tanpa tercatat & tidak ada sesi lain yang masih bisa; sekarang = ada sesi dibuka
        terlewat: !!data.presensi && !keadaanHari(data.presensi.hari, now).lengkap && !keadaanHari(data.presensi.hari, now).aktif && !keadaanHari(data.presensi.hari, now).berikutnya,
        bisaSekarang: !!data.presensi && !!keadaanHari(data.presensi.hari, now).aktif,
        badan: (
          <>
            <LabelHari tglIso={u.tanggal_iso} nowMs={now} jam={`pelatihan ${u.pukul}`} />
            {data.presensi ? (
              <IsiPresensi pres={data.presensi} nowMs={now} tempat={data.presensi.pengaturan.tempat ?? u.tempat} segarkan={muat} />
            ) : (
              <p className="text-[13px] text-[#5B6B84]">{u.tempat}. Presensi belum diatur panitia.</p>
            )}
          </>
        ),
      },
      ...(data.kuis
        ? [
            {
              kode: "kuis",
              judul: "Ikuti Adu Sigap",
              selesai: data.kuis.pernah_ikut,
              terlewat: !data.kuis.pernah_ikut && data.kuis.ada_ruang_selesai && !data.kuis.ada_ruang_aktif,
              bisaSekarang: data.kuis.ada_ruang_aktif,
              tambahan: true,
              badan: <IsiKuis k={data.kuis} segarkan={muat} />,
            } as Langkah,
          ]
        : []),
      ...(slotAwal.length ? [langkahFoto("foto_awal", slotAwal, `Unggah ${slotAwal.length} foto sebelum Posttest`, "Boleh satu per satu: unggah yang sudah ada, lengkapi yang kurang sebelum 23.59 WIB di hari yang sama.")] : []),
      tes(post, "Kerjakan Posttest", "posttest"),
      ...(slotAkhir.length ? [langkahFoto("foto_akhir", slotAkhir, `Unggah ${slotAkhir.length} foto sesudah Posttest`, "Boleh satu per satu; unggah setelah posttest selesai, sebelum 23.59 WIB di hari yang sama.")] : []),
    ];
  }

  // status tiap langkah: selesai / terlewat / sekarang (bisa dikerjakan) / berikutnya (pertama yg belum selesai) / menyusul
  const pertama = langkah.findIndex((l) => !l.selesai && !l.terlewat && !l.tambahan);
  const gaya: { g: Gaya; chip: string }[] = langkah.map((l, i) => {
    if (l.selesai) return { g: "done", chip: "Selesai" };
    if (l.terlewat) return { g: "miss", chip: "Terlewat" };
    if (l.bisaSekarang) return { g: "now", chip: "Sekarang" };
    if (i === pertama) return { g: "now", chip: "Berikutnya" };
    return { g: "wait", chip: "Menyusul" };
  });
  const wajib = langkah.filter((l) => !l.tambahan);
  const nSelesai = wajib.filter((l) => l.selesai).length;
  const pemandu = data && peserta && u ? susunPemandu(langkah, data, now, jendelaPelatihan(u).mulai) : null;
  const terlewatDaftar = data && peserta ? daftarTerlewat(langkah, data.presensi ? keadaanHari(data.presensi.hari, now).sesi : null) : [];

  // (7 Okt 2026) Modal "Yeay": langkah yang baru selesai (belum pernah dirayakan di browser ini) dirayakan sekali.
  const kunciSelesai = langkah.filter((l) => l.selesai).map((l) => l.kode).join(",");
  const idPeserta = peserta ? String(peserta.penugasan_id) : "";
  const langkahRef = useRef(langkah);
  langkahRef.current = langkah;
  useEffect(() => {
    if (!idPeserta || !kunciSelesai) return;
    const sudah = bacaRayakan(idPeserta);
    const baru = kunciSelesai.split(",").filter((k) => !sudah.includes(k));
    if (!baru.length) return;
    const semuaLangkah = langkahRef.current;
    const nomor = (k: string) => semuaLangkah.findIndex((l) => l.kode === k) + 1;
    const idxBerikut = semuaLangkah.findIndex((l) => !l.selesai && !l.terlewat && !l.tambahan);
    simpanRayakan(idPeserta, [...sudah, ...baru]);
    setRayakan({
      selesai: baru.map((k) => ({ no: nomor(k), judul: semuaLangkah[nomor(k) - 1].judul })),
      berikut: idxBerikut >= 0 ? { kode: semuaLangkah[idxBerikut].kode, no: idxBerikut + 1, judul: semuaLangkah[idxBerikut].judul } : null,
      semua: semuaLangkah.filter((l) => !l.tambahan).every((l) => l.selesai),
    });
  }, [kunciSelesai, idPeserta]);

  useEffect(() => {
    if (antrianPeng !== null || !data || !idPeserta) return;
    const sudahLihat = (p: PengumumanPeserta) => {
      try {
        return localStorage.getItem(kunciSudahLihat(idPeserta, p)) === "1";
      } catch {
        return false; // penyimpanan diblokir: tampilkan saja
      }
    };
    setAntrianPeng((data.pengumuman ?? []).filter((p) => p.frekuensi === "tiap" || !sudahLihat(p)));
  }, [antrianPeng, data, idPeserta]);
  const modalPeng = antrianPeng && posPeng < antrianPeng.length ? antrianPeng[posPeng] : null;
  const lanjutPeng = useCallback(() => {
    if (!antrianPeng) return;
    const p = antrianPeng[posPeng];
    if (p && p.frekuensi === "sekali") {
      try {
        localStorage.setItem(kunciSudahLihat(idPeserta, p), "1");
      } catch {
        /* abaikan */
      }
    }
    setPosPeng((x) => x + 1);
  }, [antrianPeng, posPeng, idPeserta]);

  const warnaBulat: Record<Gaya, string> = {
    done: "bg-[#19A463] text-white",
    now: "bg-[#1F5FD1] text-white shadow-[0_0_0_4px_#DCE8FB]",
    miss: "bg-[#B42329] text-white",
    wait: "bg-[#E1E9F6] text-[#5B6B84]",
  };
  const chipW: Record<Gaya, "ok" | "navy" | "bad" | undefined> = { done: "ok", now: "navy", miss: "bad", wait: undefined };

  return (
    <Kerangka
      aktif="pelatihan"
      nama={data?.nama}
      judul="Langkah Pelatihan"
      sub={u ? `${u.hari_tanggal} · ${u.tempat}${peserta ? ` · ${peserta.kelas ? `Kelas ${peserta.kelas}` : "Kelas menyusul"} (${peranLabel(peserta.peran)})` : ""}` : "Pelatihan PSP Pascabencana 2026"}
    >
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!data && !galat && <Memuat />}
      {data && !peserta && (
        <Pesan jenis="info">
          Akun Anda tidak terdaftar sebagai peserta Pelatihan PSP Pascabencana 2026, jadi langkah pelatihan, pretest, dan posttest tidak tersedia untuk Anda.{" "}
          {data.boleh_lihat_kelola && (
            <Link href="/sigap/pelatihan/kelola" className="font-bold text-[#1F5FD1] underline">
              Buka Kelola Pelatihan
            </Link>
          )}
        </Pesan>
      )}
      {data && peserta && (
        <>
          {modalPeng && antrianPeng && <ModalPengumuman key={modalPeng.id} d={modalPeng} posisi={posPeng + 1} jumlah={antrianPeng.length} lanjut={lanjutPeng} />}
          {antrianPeng !== null && !modalPeng && rayakan && <ModalSelesai r={rayakan} tutup={tutupRayakan} lanjut={lanjutRayakan} />}
          <PeringatanTerlewat daftar={terlewatDaftar} />
          <AktifkanNotifikasi />
          {pemandu && <KotakPemandu p={pemandu} ke={lanjutRayakan} />}
          <Kartu
            judul={
              <span className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#EAF1FC] text-[#1F5FD1]">
                  <Ikon n="daftar" className="h-5 w-5" />
                </span>
                Langkah Anda
              </span>
            }
            kanan={
              <span className="flex flex-wrap items-center gap-1.5">
                {/* (8 Okt 2026) nomor tahapan: "Langkah x dari n" (permintaan user, struktur 3 layer) */}
                {nSelesai < wajib.length && <Chip w="navy">Langkah {pertama >= 0 ? pertama + 1 : langkah.length} dari {langkah.length}</Chip>}
                <Chip w={nSelesai === wajib.length ? "ok" : "wait"}>{nSelesai} dari {wajib.length} selesai</Chip>
              </span>
            }
          >
            <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${Math.max(1, wajib.length)}, minmax(0, 1fr))` }} role="img" aria-label={`${nSelesai} dari ${wajib.length} langkah selesai`}>
              {wajib.map((l) => (
                <span key={l.kode} className={`h-1.5 rounded-[3px] ${l.selesai ? "bg-[#19A463]" : l.terlewat ? "bg-[#E5484D]" : l.bisaSekarang ? "bg-[#1F5FD1]" : "bg-[#E1E9F6]"}`} />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-[#6B7A90]">Sekarang: {waktuWib(new Date(now).toISOString())}</p>
            <ol className="mt-3">
              {langkah.map((l, i) => {
                const { g, chip } = gaya[i];
                return (
                  <li key={l.kode} id={`langkah-${l.kode}`} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < langkah.length - 1 && <span className={`absolute left-[14px] top-8 bottom-0 w-0.5 ${g === "done" ? "bg-[#19A463]" : "bg-[#E1E9F6]"}`} aria-hidden />}
                    <span className={`z-[1] flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${warnaBulat[g]}`}>
                      {i + 1}
                    </span>
                    <div className={`min-w-0 flex-1 ${g === "now" ? "-mt-1.5 rounded-[14px] border border-[#D6E4FA] bg-[#F5F8FE] p-3" : ""} ${l.redup || (g === "wait" && !l.tombolAktif) ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-extrabold text-[#0F2A52]">
                        {l.judul} <Chip w={chipW[g]}>{chip}</Chip>
                      </div>
                      <div className="mt-0.5">{l.badan}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Kartu>
          <div className="rounded-[14px] border border-[#DDE6F3] bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-[#5B6B84]">
            Waktu mengikuti jam server. Skor &amp; pembahasan tampil setelah sesi tes ditutup; sebelum itu hanya tampil &ldquo;jawaban tersimpan&rdquo;.
          </div>
        </>
      )}
    </Kerangka>
  );
}
