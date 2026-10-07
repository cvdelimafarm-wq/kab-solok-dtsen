"use client";

// app/sigap/pelatihan/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- tab "Pelatihan": kartu Pretest & Posttest (jam buka, hitung mundur,
// mulai/lanjutkan, hasil). Waktu mengikuti jam server. Mockup disetujui user.

import Link from "next/link";
import { LABEL_JENIS_TES } from "@/lib/sigapTes";
import { Chip, Kartu, Memuat, Pesan } from "../admin/ui";
import { waktuWib } from "../admin/api";
import { Kerangka, formatSisa, jamWib, useHub, useSaatLewat, type TesHub } from "./komponen";

function KartuTes({ t, sekarangMs, segarkan }: { t: TesHub; sekarangMs: () => number; segarkan: () => void }) {
  const now = sekarangMs();
  const sisaBuka = (new Date(t.buka_at).getTime() - now) / 1000;
  const sisaTutup = (new Date(t.tutup_at).getTime() - now) / 1000;
  const sisaBatas = t.sesi ? (new Date(t.sesi.batas_at).getTime() - now) / 1000 : 0;
  // muat ulang saat jam buka / jam tutup / batas pengerjaan terlewati
  useSaatLewat(t.status === "belum_buka" ? t.buka_at : null, sekarangMs, segarkan, `${t.jenis}-buka`);
  useSaatLewat(t.status === "buka" ? t.tutup_at : null, sekarangMs, segarkan, `${t.jenis}-tutup`);
  useSaatLewat(t.status === "mengerjakan" && t.sesi ? t.sesi.batas_at : null, sekarangMs, segarkan, `${t.jenis}-batas`);
  useSaatLewat(t.status === "selesai" && t.hasil_tertunda ? t.tutup_at : null, sekarangMs, segarkan, `${t.jenis}-hasil`);

  const judul = LABEL_JENIS_TES[t.jenis];
  const href = `/sigap/pelatihan/tes/${t.jenis}`;
  const tombol = "mt-3 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-[14.5px] font-extrabold shadow-sm transition";

  let chip = <Chip>Belum dibuka</Chip>;
  let badan: React.ReactNode = null;
  switch (t.status) {
    case "soal_belum_ada":
      chip = <Chip w="wait">Soal belum tersedia</Chip>;
      badan = <p className="text-[13px] text-[#55657D]">Soal akan dikirim panitia. Halaman ini otomatis terbuka pada pukul {jamWib(t.buka_at)} WIB bila soal sudah ada.</p>;
      break;
    case "belum_buka":
      badan = (
        <>
          <p className="text-[13px] text-[#55657D]">Terbuka otomatis pukul {jamWib(t.buka_at)} WIB. Durasi {t.durasi_menit} menit sejak Anda menekan Mulai.</p>
          <p className="mt-2 text-[22px] font-extrabold tabular-nums text-[#0F3D7A]">Dibuka dalam {formatSisa(sisaBuka)}</p>
          <button type="button" disabled className={`${tombol} cursor-not-allowed bg-[#E3E8EE] text-[#7B8794]`}>
            Belum dibuka
          </button>
        </>
      );
      break;
    case "buka":
      chip = <Chip w="ok">Sedang dibuka</Chip>;
      badan = (
        <>
          <p className="text-[13px] text-[#55657D]">
            {t.jumlah_soal} soal · durasi {t.durasi_menit} menit. Sesi ditutup pukul {jamWib(t.tutup_at)} WIB — yang terlambat mulai waktunya berkurang.
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[#9A6200]">Sesi ditutup dalam {formatSisa(sisaTutup)}</p>
          <Link href={href} className={`${tombol} bg-[#1E7A4C] text-white hover:bg-[#17623C]`}>
            Mulai {judul} →
          </Link>
        </>
      );
      break;
    case "mengerjakan":
      chip = <Chip w="navy">Sedang dikerjakan</Chip>;
      badan = (
        <>
          <p className="text-[13px] text-[#55657D]">
            Terjawab {t.sesi?.terjawab ?? 0} dari {t.jumlah_soal} soal. Jawaban tersimpan otomatis.
          </p>
          <p className={`mt-1 text-[22px] font-extrabold tabular-nums ${sisaBatas < 60 ? "text-[#C0392B]" : "text-[#0F3D7A]"}`}>Sisa waktu {formatSisa(sisaBatas)}</p>
          <Link href={href} className={`${tombol} bg-[#1F6FD1] text-white hover:bg-[#1A5DB0]`}>
            Lanjutkan mengerjakan →
          </Link>
        </>
      );
      break;
    case "selesai":
      chip = <Chip w="ok">Selesai</Chip>;
      badan = t.hasil_tertunda ? (
        <>
          <p className="text-[13px] text-[#55657D]">Jawaban Anda tersimpan ({t.sesi?.terjawab ?? 0} dari {t.jumlah_soal} soal terjawab).</p>
          <p className="mt-1 text-[13px] font-semibold text-[#9A6200]">Skor &amp; pembahasan tampil setelah sesi ditutup pukul {jamWib(t.tutup_at)} WIB ({formatSisa(sisaTutup)} lagi).</p>
        </>
      ) : (
        <>
          <p className="text-[13px] text-[#55657D]">
            Skor <b className="text-[18px] text-[#0F3D7A]">{t.skor ?? "–"}</b> · benar {t.benar ?? 0} dari {t.total ?? t.jumlah_soal} soal.
          </p>
          <Link href={href} className={`${tombol} border border-[#CDD5DE] bg-white text-[#14202E] hover:bg-[#F8FAFC]`}>
            Lihat pembahasan
          </Link>
        </>
      );
      break;
    case "terlewat":
      chip = <Chip w="bad">Terlewat</Chip>;
      badan = <p className="text-[13px] text-[#55657D]">Sesi {judul} sudah ditutup pukul {jamWib(t.tutup_at)} WIB dan Anda belum mengerjakannya.</p>;
      break;
    default:
      badan = <p className="text-[13px] text-[#55657D]">Tes tidak aktif.</p>;
  }
  return (
    <Kartu
      judul={
        <span className="flex items-center gap-2">
          {judul} <span className="text-[12px] font-semibold text-[#7B8794]">dibuka {jamWib(t.buka_at)}</span>
        </span>
      }
      kanan={chip}
    >
      {badan}
    </Kartu>
  );
}

export default function HalamanPelatihan() {
  const { data, galat, muat, jam } = useHub(30_000);
  return (
    <Kerangka aktif="pelatihan" nama={data?.nama} judul="Pretest & Posttest" sub={data ? `${data.undangan.hari_tanggal} · ${data.undangan.tempat}` : "Pelatihan PSP Pascabencana 2026"}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!data && !galat && <Memuat />}
      {data && !data.peserta && (
        <Pesan jenis="info">
          Akun Anda tidak terdaftar sebagai peserta Pelatihan PSP Pascabencana 2026, jadi pretest &amp; posttest tidak tersedia untuk Anda.{" "}
          {data.boleh_lihat_kelola && (
            <Link href="/sigap/pelatihan/kelola" className="font-bold text-[#1F6FD1] underline">
              Buka Kelola Pelatihan
            </Link>
          )}
        </Pesan>
      )}
      {data && data.peserta && (
        <>
          {data.tes.length === 0 && <Pesan jenis="info">Belum ada tes yang dijadwalkan.</Pesan>}
          {data.tes.map((t) => (
            <KartuTes key={t.jenis} t={t} sekarangMs={jam.sekarang} segarkan={muat} />
          ))}
          <div className="rounded-xl border border-[#E3E8EE] bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-[#55657D]">
            Waktu mengikuti jam server ({waktuWib(new Date(jam.sekarang()).toISOString())}). Setelah sesi ditutup akan tampil skor dan soal benar/salah beserta kunci jawaban; sebelum ditutup hanya
            tampil &ldquo;jawaban tersimpan&rdquo;.
          </div>
        </>
      )}
    </Kerangka>
  );
}
