"use client";

// app/sigap/pelatihan/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- tab "Langkah": urutan 1-6 yang harus dilakukan peserta sampai pelatihan selesai.
// Pretest & Posttest menyatu di dalam langkahnya (tidak ada kartu terpisah, supaya tidak dobel). Waktu mengikuti
// jam server. Mockup v2 disetujui user.
//
// Langkah: 1 baca undangan · 2 pelajari instrumen · 3 pretest · 4 hadiri pelatihan · 5 posttest · 6 foto Transport Lokal.
// Status: selesai (hijau) / sekarang (biru; jendela tes terbuka atau langkah yang bisa dikerjakan) /
//         berikutnya (biru; langkah pertama yang belum selesai) / menyusul (abu) / terlewat (merah).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LABEL_SLOT_FOTO, namaTitik, teksJarak, titikTerdekat } from "@/lib/sigapPresensi";
import { LABEL_JENIS_TES, PEMUKAAN } from "@/lib/sigapTes";
import { Chip, Kartu, Memuat, Pesan } from "../admin/ui";
import { fetchJson, pesanGalat, waktuWib } from "../admin/api";
import { Kerangka, formatSisa, jamWib, peranLabel, useHub, useSaatLewat, type Hub, type TesHub } from "./komponen";

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
      ? { t: "HARI INI", c: "bg-[#1E7A4C] text-white" }
      : selisih === 1
        ? { t: "BESOK", c: "bg-[#D9971F] text-white" }
        : selisih === -1
          ? { t: "KEMARIN", c: "bg-[#8895A7] text-white" }
          : selisih > 1
            ? { t: `${selisih} HARI LAGI`, c: "bg-[#1F6FD1] text-white" }
            : { t: "SUDAH LEWAT", c: "bg-[#8895A7] text-white" };
  return (
    <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-[#0F3D7A]">
      <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide ${pita.c}`}>{pita.t}</span>
      <span>
        {teks}
        {jam ? ` · ${jam}` : ""}
      </span>
    </p>
  );
}

const TOMBOL = "mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-[13.5px] font-extrabold shadow-sm transition";
const TOMBOL_O = `${TOMBOL} border border-[#CDD5DE] bg-white text-[#14202E] hover:bg-[#F8FAFC]`;

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
  const ket = "text-[13px] text-[#55657D]";
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
          <p className="mt-1 text-[20px] font-extrabold tabular-nums text-[#0F3D7A]">Dibuka dalam {formatSisa(sisaBuka)}</p>
          <button type="button" disabled className={`${TOMBOL} cursor-not-allowed bg-[#E3E8EE] text-[#7B8794]`}>
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
          <p className="mt-1 text-[13px] font-semibold text-[#9A6200]">Sesi ditutup dalam {formatSisa(sisaTutup)}</p>
          <Link href={href} className={`${TOMBOL} bg-[#1E7A4C] text-white hover:bg-[#17623C]`}>
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
          <p className={`mt-1 text-[20px] font-extrabold tabular-nums ${sisaBatas < 60 ? "text-[#C0392B]" : "text-[#0F3D7A]"}`}>Sisa waktu {formatSisa(sisaBatas)}</p>
          <Link href={href} className={`${TOMBOL} bg-[#1F6FD1] text-white hover:bg-[#1A5DB0]`}>
            Lanjutkan mengerjakan →
          </Link>
        </>
      );
    case "selesai":
      return t.hasil_tertunda ? (
        <>
          <p className={ket}>
            Jawaban tersimpan ({t.sesi?.terjawab ?? 0} dari {t.jumlah_soal} soal terjawab).
          </p>
          <p className="mt-1 text-[12.5px] font-semibold text-[#9A6200]">
            Skor &amp; pembahasan tampil setelah sesi ditutup pukul {jamWib(t.tutup_at)} WIB ({formatSisa(sisaTutup)} lagi).
          </p>
        </>
      ) : (
        <>
          <p className={ket}>
            Skor <b className="text-[17px] text-[#0F3D7A]">{t.skor ?? "–"}</b> · benar {t.benar ?? 0} dari {t.total ?? t.jumlah_soal} soal.
          </p>
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


/** Isi langkah Presensi: baca lokasi HP, tampilkan jarak ke lokasi pelatihan, tombol aktif bila dalam radius & jam presensi. */
function IsiPresensi({ pres, nowMs, tempat, segarkan }: { pres: NonNullable<Hub["presensi"]>; nowMs: number; tempat: string; segarkan: () => void }) {
  const peng = pres.pengaturan;
  const buka = new Date(peng.buka_at).getTime();
  const tutup = new Date(peng.tutup_at).getTime();
  const dalamJam = nowMs >= buka && nowMs < tutup;
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

  // baca lokasi otomatis sekali saat presensi sedang dibuka & belum presensi
  const sudahBaca = useRef(false);
  useEffect(() => {
    if (pres.sudah || !dalamJam || sudahBaca.current) return;
    sudahBaca.current = true;
    baca();
  }, [pres.sudah, dalamJam, baca]);

  async function presensi() {
    if (!pos) return;
    setKirim(true);
    setGalatKirim(null);
    try {
      await fetchJson("/api/sigap/pelatihan/presensi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pos) });
      segarkan();
    } catch (e) {
      setGalatKirim(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  const ket = "text-[13px] text-[#55657D]";
  // (7 Okt 2026) bisa lebih dari satu titik (Mami Hotel / Ully Hotel Solok): peserta cukup berada di salah satunya
  const lokasiTeks = peng.titik.length ? namaTitik(peng.titik) : tempat;
  const radiusTeks = [...new Set(peng.titik.map((t) => t.radius_m))].map((r) => `${r} m`).join(" / ") || "—";
  if (pres.sudah)
    return (
      <>
        <p className="text-[13px] font-semibold text-[#17623C]">
          ✓ Presensi tercatat pukul {pres.at ? jamWib(pres.at) : "–"} WIB{pres.manual ? " (dicatat panitia)" : pres.jarak_m != null ? ` · ${teksJarak(pres.jarak_m)} dari ${pres.titik_nama ?? tempat}` : ""}.
        </p>
        <p className={ket}>Presensi hanya sekali. Bila ada kendala, hubungi panitia.</p>
      </>
    );
  if (nowMs < buka)
    return (
      <>
        <p className={ket}>Presensi dibuka pukul {jamWib(peng.buka_at)} WIB. Tombol aktif otomatis saat jam dibuka; Anda harus berada dalam radius {radiusTeks} dari {lokasiTeks}.</p>
        <button type="button" disabled className={`${TOMBOL} cursor-not-allowed bg-[#E3E8EE] text-[#7B8794]`}>
          Belum dibuka
        </button>
      </>
    );
  if (nowMs >= tutup)
    return <p className="text-[13px] font-semibold text-[#C0392B]">Presensi sudah ditutup (pukul {jamWib(peng.tutup_at)} WIB) dan belum tercatat untuk Anda. Hubungi panitia.</p>;

  const dekat = pos ? titikTerdekat(pos, peng.titik) : null;
  const jarak = dekat?.jarak_m ?? null;
  const akurasiBuruk = !!pos && pos.akurasi > peng.akurasi_maks_m;
  const dalam = !!dekat && dekat.dalam && !akurasiBuruk;
  return (
    <>
      <p className={ket}>
        Harus berada dalam radius {radiusTeks} dari {lokasiTeks}. Presensi dibuka sampai pukul {jamWib(peng.tutup_at)} WIB.
      </p>
      {membaca && <p className="mt-1 text-[13px] font-semibold text-[#55657D]">Membaca lokasi Anda…</p>}
      {gpsGalat && <p className="mt-1 text-[13px] font-semibold text-[#9A6200]">{gpsGalat}</p>}
      {pos && jarak != null && !membaca && (
        <p className={`mt-1 text-[13px] font-semibold ${dalam ? "text-[#17623C]" : "text-[#C0392B]"}`}>
          {akurasiBuruk
            ? `Sinyal GPS lemah (±${Math.round(pos.akurasi)} m, maksimal ±${peng.akurasi_maks_m} m). Pindah ke area terbuka lalu segarkan lokasi.`
            : dalam
              ? `Anda berada ${teksJarak(jarak)} dari ${dekat!.titik.nama} — di dalam radius. (akurasi ±${Math.round(pos.akurasi)} m)`
              : `Anda berada ${teksJarak(jarak)} dari ${dekat!.titik.nama} (titik terdekat) — di luar radius ${dekat!.titik.radius_m} m. Datanglah ke lokasi lalu segarkan lokasi.`}
        </p>
      )}
      {galatKirim && <p className="mt-1 text-[13px] font-semibold text-[#C0392B]">{galatKirim}</p>}
      <button
        type="button"
        disabled={!dalam || kirim || membaca}
        onClick={presensi}
        className={`${TOMBOL} w-full ${dalam && !kirim && !membaca ? "bg-[#1E7A4C] text-white hover:bg-[#17623C]" : "cursor-not-allowed bg-[#E3E8EE] text-[#7B8794]"}`}
      >
        {kirim ? "Mencatat…" : dalam ? "✓ Presensi sekarang" : "Presensi (belum di dalam radius)"}
      </button>
      <button type="button" onClick={baca} disabled={membaca} className="mt-1.5 text-[12.5px] font-semibold text-[#1F6FD1] underline disabled:opacity-50">
        ↻ Segarkan lokasi
      </button>
    </>
  );
}

/** (7 Okt 2026) Modal PERHATIAN: tampil setiap peserta membuka halaman Langkah (lokasi pembukaan berbeda dari tempat pelatihan). */
function ModalPerhatian({ tutup }: { tutup: () => void }) {
  const tombol = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    tombol.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && tutup();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [tutup]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={tutup}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-perhatian" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF1CC] text-[20px]" aria-hidden>
            ⚠️
          </span>
          <h2 id="judul-perhatian" className="text-[18px] font-extrabold tracking-wide text-[#9A6200]">
            PERHATIAN
          </h2>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-[#14202E]">
          <b>Pembukaan pelatihan dilakukan di {PEMUKAAN.tempat}</b>
          <span className="text-[#55657D]"> ({PEMUKAAN.jarak}).</span>
        </p>
        <a href={PEMUKAAN.maps} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1F6FD1] px-4 py-3 text-[14.5px] font-extrabold text-white shadow-sm hover:bg-[#1A5DB0]">
          📍 Klik untuk buka Google Maps
        </a>
        <button ref={tombol} type="button" onClick={tutup} className="mt-2 w-full rounded-xl border border-[#CDD5DE] bg-white px-4 py-2.5 text-[14px] font-bold text-[#14202E] hover:bg-[#F8FAFC]">
          Saya mengerti
        </button>
      </div>
    </div>
  );
}

type Langkah = { kode: string; judul: string; selesai: boolean; terlewat: boolean; bisaSekarang: boolean; badan: React.ReactNode };

export default function HalamanPelatihan() {
  const { data, galat, muat, jam } = useHub(30_000);
  const router = useRouter();
  const [perhatian, setPerhatian] = useState(true); // tampil tiap halaman ini dibuka (khusus peserta)
  const tutupPerhatian = useCallback(() => setPerhatian(false), []);
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
    const pre = data.tes.find((t) => t.jenis === "pretest");
    const post = data.tes.find((t) => t.jenis === "posttest");
    const L = data.langkah;
    const tes = (t: TesHub | undefined, judul: string, kode: string): Langkah => ({
      kode,
      judul,
      selesai: t?.status === "selesai",
      terlewat: t?.status === "terlewat",
      bisaSekarang: t?.status === "buka" || t?.status === "mengerjakan",
      badan: t ? <IsiTes t={t} sekarangMs={jam.sekarang} segarkan={muat} /> : <p className="text-[13px] text-[#55657D]">Belum dijadwalkan panitia.</p>,
    });
    const tautan = (href: string, label: string, selesai: boolean) =>
      selesai ? (
        <Link href={href} className="mt-1 inline-block text-[12px] font-semibold text-[#1F6FD1] underline">
          Buka kembali
        </Link>
      ) : (
        <Link href={href} className={TOMBOL_O}>
          {label}
        </Link>
      );
    const fotoSelesai = (L?.foto ?? 0) >= (L?.foto_total ?? 5);
    langkah = [
      {
        kode: "undangan",
        judul: "Baca undangan",
        selesai: !!L?.undangan_dibuka,
        terlewat: false,
        bisaSekarang: true,
        badan: (
          <>
            <p className="text-[13px] text-[#55657D]">Kelas, jam, dan pakaian.</p>
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
            <p className="text-[13px] text-[#55657D]">Kuesioner &amp; buku pedoman.</p>
            {tautan("/sigap/pelatihan/instrumen", "Buka Instrumen", !!L?.instrumen_diunduh)}
          </>
        ),
      },
      tes(pre, "Kerjakan Pretest", "pretest"),
      {
        kode: "hadir",
        judul: "Presensi di lokasi pelatihan",
        selesai: !!data.presensi?.sudah,
        terlewat: !data.presensi?.sudah && !!data.presensi && now >= new Date(data.presensi.pengaturan.tutup_at).getTime(),
        bisaSekarang: !!data.presensi && !data.presensi.sudah && now >= new Date(data.presensi.pengaturan.buka_at).getTime() && now < new Date(data.presensi.pengaturan.tutup_at).getTime(),
        badan: (
          <>
            <LabelHari tglIso={u.tanggal_iso} nowMs={now} jam={`pelatihan ${u.pukul}`} />
            {data.presensi ? (
              <IsiPresensi pres={data.presensi} nowMs={now} tempat={data.presensi.pengaturan.tempat ?? u.tempat} segarkan={muat} />
            ) : (
              <p className="text-[13px] text-[#55657D]">{u.tempat}. Presensi belum diatur panitia.</p>
            )}
          </>
        ),
      },
      tes(post, "Kerjakan Posttest", "posttest"),
      {
        kode: "foto",
        judul: `Unggah ${L?.foto_total ?? 5} foto Transport Lokal`,
        selesai: fotoSelesai,
        terlewat: false,
        bisaSekarang: now >= mulai,
        badan: (
          <>
            <LabelHari tglIso={u.tanggal_iso} nowMs={now} jam="unggah sampai 23.59 WIB" />
            {L && (
              <p className="mb-1 flex flex-wrap gap-1">
                {Array.from({ length: L.foto_total }, (_, i) => i + 1).map((sl) => {
                  const ada = L.slot.includes(sl);
                  return (
                    <span key={sl} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${ada ? "bg-[#DDF3E6] text-[#17623C]" : "bg-[#EEF1F5] text-[#7B8794]"}`}>
                      {ada ? "✓" : "○"} {LABEL_SLOT_FOTO[sl - 1] ?? `Foto ${sl}`}
                    </span>
                  );
                })}
              </p>
            )}
            <p className="text-[13px] text-[#55657D]">
              {fotoSelesai
                ? `Semua ${L?.foto_total} foto sudah terunggah.`
                : L && L.foto > 0
                  ? `Baru ${L.foto} dari ${L.foto_total} foto terunggah. Lengkapi yang kurang sebelum 23.59 WIB di hari yang sama.`
                  : "Boleh bertahap: unggah yang sudah ada, lalu lengkapi yang kurang sebelum 23.59 WIB di hari yang sama."}
            </p>
            {data.token_translok &&
              (now >= mulai || (L?.foto ?? 0) > 0) &&
              (fotoSelesai ? (
                <a href={`/sigap/translok/${data.token_translok}`} className="mt-1 inline-block text-[12px] font-semibold text-[#1F6FD1] underline">
                  Buka kembali
                </a>
              ) : (
                <a href={`/sigap/translok/${data.token_translok}`} className={`${TOMBOL} bg-[#1F6FD1] text-white hover:bg-[#1A5DB0]`}>
                  {L && L.foto > 0 ? `Lengkapi foto yang kurang (${L.foto_total - L.foto}) →` : "Buka Transport Lokal →"}
                </a>
              ))}
          </>
        ),
      },
    ];
  }

  // status tiap langkah: selesai / terlewat / sekarang (bisa dikerjakan) / berikutnya (pertama yg belum selesai) / menyusul
  const pertama = langkah.findIndex((l) => !l.selesai && !l.terlewat);
  const gaya: { g: Gaya; chip: string }[] = langkah.map((l, i) => {
    if (l.selesai) return { g: "done", chip: "Selesai" };
    if (l.terlewat) return { g: "miss", chip: "Terlewat" };
    if (l.bisaSekarang) return { g: "now", chip: "Sekarang" };
    if (i === pertama) return { g: "now", chip: "Berikutnya" };
    return { g: "wait", chip: "Menyusul" };
  });
  const nSelesai = gaya.filter((x) => x.g === "done").length;

  const warnaBulat: Record<Gaya, string> = {
    done: "bg-[#1E7A4C] text-white",
    now: "bg-[#1F6FD1] text-white shadow-[0_0_0_4px_#D6E6FB]",
    miss: "bg-[#C0392B] text-white",
    wait: "bg-[#E3E8EE] text-[#55657D]",
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
            <Link href="/sigap/pelatihan/kelola" className="font-bold text-[#1F6FD1] underline">
              Buka Kelola Pelatihan
            </Link>
          )}
        </Pesan>
      )}
      {data && peserta && (
        <>
          {perhatian && <ModalPerhatian tutup={tutupPerhatian} />}
          <Kartu judul="Langkah Anda" kanan={<span className="text-[12px] font-semibold text-[#55657D]">{nSelesai} dari {langkah.length} selesai</span>}>
            <div className="h-2 overflow-hidden rounded-full bg-[#E3E8EE]">
              <div className="h-full rounded-full bg-[#1E7A4C] transition-all" style={{ width: `${(nSelesai / Math.max(1, langkah.length)) * 100}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-[#7B8794]">Sekarang: {waktuWib(new Date(now).toISOString())}</p>
            <ol className="mt-3">
              {langkah.map((l, i) => {
                const { g, chip } = gaya[i];
                return (
                  <li key={l.kode} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < langkah.length - 1 && <span className={`absolute left-[14px] top-8 bottom-0 w-0.5 ${g === "done" ? "bg-[#1E7A4C]" : "bg-[#E3E8EE]"}`} aria-hidden />}
                    <span className={`z-[1] flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${warnaBulat[g]}`}>
                      {g === "done" ? "✓" : g === "miss" ? "!" : i + 1}
                    </span>
                    <div className={`min-w-0 flex-1 ${g === "now" ? "-mt-1.5 rounded-xl border border-[#BBD4F5] bg-[#F3F8FF] p-2.5" : ""} ${g === "wait" ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-bold">
                        {l.judul} <Chip w={chipW[g]}>{chip}</Chip>
                      </div>
                      <div className="mt-0.5">{l.badan}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Kartu>
          <div className="rounded-xl border border-[#E3E8EE] bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-[#55657D]">
            Waktu mengikuti jam server. Skor &amp; pembahasan tampil setelah sesi tes ditutup; sebelum itu hanya tampil &ldquo;jawaban tersimpan&rdquo;.
          </div>
        </>
      )}
    </Kerangka>
  );
}
