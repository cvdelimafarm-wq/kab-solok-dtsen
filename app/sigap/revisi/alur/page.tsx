// app/sigap/revisi/alur/page.tsx
//
// (25 Okt 2026, tahap 22) Papan 2 mockup: alur kertas kerja sebelum, saat, dan sesudah revisi (butir GSBPM F1-06). Halaman keterangan (tanpa
// data dari basis data): teks bersumber lib/keu/alur.ts, tiap langkah ditautkan ke halaman SIGAP yang mengerjakannya. Contoh KRO 2903.BMA.
// (25 Okt 2026) Ditambah bagian D: alur impor realisasi (POK hanya diimpor di awal tahun).

import Link from "next/link";
import type { ReactNode } from "react";
import {
  CABANG_DIPA, CABANG_POK, HASIL_B4, KURANG_AWAL, KURANG_UMUM, PENUTUP, REALISASI, REALISASI_CATATAN, SAAT, SAAT_CATATAN, SEBELUM, SESUDAH, TAUTAN_LANGKAH, TENGGAT_CATATAN, type Langkah,
} from "@/lib/keu/alur";
import { Chip, HalamanKeu, judulKartu, kartu, Tenang } from "../../keu-ui";

function Kartu({ l }: { l: Langkah }) {
  const tautan = TAUTAN_LANGKAH[l.no];
  return (
    <li className="flex min-w-0 gap-3 rounded-lg border border-[#DCE3EE] bg-white p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#E3EEFF] text-[12px] font-bold text-[#1F5FD1]">{l.no}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-[#0F2A52]">{l.judul}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#44546F]">{l.isi}</p>
        {tautan && (
          <Link href={tautan.href} className="mt-1.5 inline-block text-[12.5px] font-semibold text-[#1F5FD1] underline">
            Buka: {tautan.teks}
          </Link>
        )}
      </div>
    </li>
  );
}

function Daftar({ langkah }: { langkah: Langkah[] }) {
  return <ol className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">{langkah.map((l) => <Kartu key={l.no} l={l} />)}</ol>;
}

function Bagian({ id, judul, status, children }: { id: string; judul: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={id} className={judulKartu}>{judul}</h2>
        {status}
      </div>
      {children}
    </section>
  );
}

export default function Halaman() {
  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "Alur kertas kerja" }]}
      judul="Alur kertas kerja: sebelum, saat, dan sesudah revisi" induk="/sigap/revisi" labelKembali="Jadwal revisi"
      sub="Urutan kerja satu kertas kerja revisi dari POK semula sampai pengesahan, dan alur impor realisasi sepanjang tahun. Contoh KRO 2903.BMA."
    >
      <div className="flex flex-wrap gap-2"><Chip warna="biru">GSBPM F1-06</Chip><Chip warna="abu">Contoh KRO 2903.BMA</Chip></div>
      <Tenang>Halaman ini keterangan alur. Pekerjaan sebenarnya dilakukan di halaman yang ditautkan pada tiap langkah. Sistem menyarankan dan menandai; keputusan tetap pada operator, PPK, dan pejabat berwenang.</Tenang>

      <Bagian id="alur-a" judul="A. Sebelum revisi" status={<Chip warna="abu">Status: Draf</Chip>}>
        <Daftar langkah={SEBELUM} />
      </Bagian>

      <Bagian id="alur-k" judul="A+. Bila anggaran kurang" status={<Chip warna="kuning">Bercabang menurut jenis revisi</Chip>}>
        <Tenang>{KURANG_UMUM}</Tenang>
        <Daftar langkah={KURANG_AWAL} />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
          {[CABANG_POK, CABANG_DIPA].map((c) => (
            <div key={c.judul} className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F7F9FD] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-bold text-[#0F2A52]">{c.judul}</h3>
                <Chip warna={c === CABANG_POK ? "hijau" : "ungu"}>{c.sub}</Chip>
              </div>
              <ol className="m-0 grid list-none gap-2 p-0">{c.langkah.map((l) => <Kartu key={l.no} l={l} />)}</ol>
            </div>
          ))}
        </div>
      </Bagian>

      <Bagian id="alur-b" judul="B. Saat revisi" status={<Chip warna="biru">Status: Diterapkan sampai Hasil</Chip>}>
        <Tenang>{SAAT_CATATAN}</Tenang>
        <Daftar langkah={SAAT} />
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#44546F]">
          <span className="font-semibold">Hasil B4:</span>
          {HASIL_B4.map((h) => <Chip key={h} warna={h === "Disahkan" ? "hijau" : h === "Ditolak" ? "merah" : "kuning"}>{h}</Chip>)}
        </div>
        <p className="m-0 text-[13px] leading-relaxed text-[#5B6B84]">{TENGGAT_CATATAN}</p>
      </Bagian>

      <Bagian id="alur-c" judul="C. Sesudah revisi" status={<Chip warna="hijau">Status: Disahkan</Chip>}>
        <Daftar langkah={SESUDAH} />
      </Bagian>

      <Bagian id="alur-d" judul="D. Impor realisasi sepanjang tahun" status={<Chip warna="biru">Laporan GLP039</Chip>}>
        <Tenang>{REALISASI_CATATAN}</Tenang>
        <Daftar langkah={REALISASI} />
      </Bagian>

      <p className="m-0 text-[12.5px] text-[#5B6B84]">{PENUTUP}</p>
    </HalamanKeu>
  );
}
