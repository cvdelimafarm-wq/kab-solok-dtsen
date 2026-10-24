"use client";

// app/sigap/ro/[kode]/Kertas.tsx
//
// (24 Okt 2026) Tab "Kertas kerja" pada ruang kerja satu RO: ringkasan kertas kerja RO ini untuk jadwal yang dibuka, lalu pintu ke halaman matriks KRO
// (/sigap/revisi/kertas), tempat seluruh pekerjaan Semula/Menjadi dilakukan (papan 1 mockup berskala KRO). Kolom Semula, Menjadi, Booked, Realisasi,
// pemeriksaan R-xx, kecukupan, dan geseran ada di halaman itu. Logika murni: lib/keu/kk.ts dan lib/keu/matriks.ts.

import Link from "next/link";
import { useMemo } from "react";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL } from "@/lib/keu/revisi";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { n } from "@/lib/keu/kk";
import { kroDariRo } from "@/lib/keu/matriks";
import { Chip, Galat, judulKartu, kartu, kisi, Kosong, Kpi, Memuat, tombolUtama } from "../../keu-ui";
import { useBacaKeu } from "../useKeu";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string };
type Ringkas = { jadwal_id: number; ro_kode: string; total_semula: number | string; total_menjadi: number | string; selisih: number | string; n_berubah: number | string; n_baru: number | string; n_penggenap: number | string };
type PeriksaR = { merah: number | string; kuning: number | string; info: number | string; hijau: number | string };

export function TabKertas({ kode }: { kode: string }) {
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 100, kolom: ["id", "tahun", "jenis", "judul", "status"] }));
  const terbuka = useMemo(() => (jadwal.baris ?? []).filter((j) => j.status === "dibuka" || j.status === "terkumpul"), [jadwal.baris]);
  const j = terbuka[0] ?? null;
  const ringkas = useBacaKeu<Ringkas>(j ? urlBaca("keu_v_kk_ringkas", { jadwal_id: j.id, ro_kode: kode }, { batas: 1 }) : null);
  const periksa = useBacaKeu<PeriksaR>(j ? urlBaca("keu_v_kk_periksa_ringkas", { jadwal_id: j.id }, { batas: 1 }) : null);
  const r = ringkas.baris?.[0] ?? null;
  const p = periksa.baris?.[0] ?? null;
  const kro = kroDariRo(kode);
  const tautan = j ? `/sigap/revisi/kertas?jadwal=${j.id}${kro ? `&kro=${encodeURIComponent(kro)}` : ""}&ro=${encodeURIComponent(kode)}&dari=${encodeURIComponent(`/sigap/ro/${encodeURIComponent(kode)}?tab=kertas`)}` : "/sigap/revisi";

  if (jadwal.galat) return <Galat pesan={jadwal.galat} />;
  if (!jadwal.baris) return <Memuat />;
  if (!j) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className={`${kartu} flex flex-col gap-1`}><h2 className={judulKartu}>Kertas kerja revisi (Semula / Menjadi)</h2>
          <p className="text-[12.5px] text-[#5B6B84]">Kertas kerja hanya tersedia saat ada jadwal revisi yang dibuka atau terkumpul.</p></div>
        <Kosong teks="Belum ada jadwal revisi yang dibuka. PPK membuka jendela usulan lewat halaman Jadwal revisi." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-2.5`}>
        <h2 className={judulKartu}>Kertas kerja revisi (Semula / Menjadi)</h2>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold text-[#0F2A52]">{j.judul}</span>
          <Chip warna="biru">{LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis}</Chip>
          <Chip warna={j.status === "dibuka" ? "hijau" : "kuning"}>{LABEL_STATUS_JADWAL[j.status] ?? j.status}</Chip>
        </div>
        <p className="text-[12.5px] text-[#5B6B84]">Pekerjaan kertas kerja dilakukan di halaman matriks KRO{kro ? ` ${kro}` : ""}: seluruh RO dalam satu KRO tampil bersama dengan kolom Semula, Menjadi, Booked, dan Realisasi, lengkap dengan pemeriksaan, kecukupan RAB, dan geseran.</p>
        <Link href={tautan} className={`${tombolUtama} inline-flex items-center self-start no-underline`}>Buka matriks KRO{kro ? ` ${kro}` : ""}</Link>
      </section>
      {ringkas.baris && !r && <Kosong teks={'Kertas kerja RO ini belum dimuat. Buka matriks KRO lalu klik "Muat baris POK".'} />}
      {r && (
        <div className={kisi}>
          <Kpi label="Jumlah Semula" nilai={rupiah(n(r.total_semula))} />
          <Kpi label="Jumlah Menjadi" nilai={rupiah(n(r.total_menjadi))} sub={`${n(r.n_berubah)} baris berubah`} />
          <Kpi label="Selisih" nilai={rupiah(n(r.selisih))} warna={n(r.selisih) === 0 ? "hj" : "mr"} />
          <Kpi label="Item baru / penggenap" nilai={`${n(r.n_baru)} / ${n(r.n_penggenap)}`} />
        </div>
      )}
      {p && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="text-[#5B6B84]">Pemeriksaan seluruh jadwal:</span>
          <Chip warna="merah">{n(p.merah)} merah</Chip><Chip warna="kuning">{n(p.kuning)} kuning</Chip><Chip warna="hijau">{n(p.hijau)} hijau</Chip><Chip warna="biru">{n(p.info)} info</Chip>
        </div>
      )}
    </div>
  );
}
