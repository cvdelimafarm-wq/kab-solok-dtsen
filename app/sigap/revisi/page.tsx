"use client";

// app/sigap/revisi/page.tsx
//
// (24 Okt 2026) Jadwal dan pengesahan revisi (PPK), mengikuti papan 11 mockup: penjelasan singkat, tiga kartu ringkas (POK sistem yang berlaku,
// pengingat tenggat Pasal 175, riwayat versi), daftar jadwal dengan usulan RO dan pernyataan sah, tambah jadwal, siklus J1 sampai J5.
// Di bawahnya tambahan pagu resmi. Semua orang organik boleh melihat; tombol hanya untuk akun berwenang (kewenangan `jadwal` dan `sahkan`),
// dan yang memutuskan tetap basis data. Logika murni: lib/keu/revisi.ts.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DAFTAR_JENIS, dataJadwalBaru, jadwalKosong, periksaJadwalBaru, ringkasPok, statusTenggat, tglPanjang, type IsianJadwal, type PokDasar,
} from "@/lib/keu/revisi";
import { urlBaca } from "@/lib/keu/ro";
import { tulisKeuKlien, useBacaKeu, useBoleh, useKirim } from "../ro/useKeu";
import KartuJadwal, { type Jadwal, type Sah } from "./KartuJadwal";
import BagianTambahan, { type Tambahan } from "./Tambahan";
import { caps, Catatan, Chip, Galat, HalamanKeu, kartu, kolom, label, Tenang, tombolAktif, tombolKecil, tombolUtama } from "../keu-ui";

type Tenggat = { kode: string; nama: string; tanggal: string; sisa_hari: number | string | null };
type PokVersi = { id: number; nomor_pok: string; tanggal_efektif: string | null };
type JadwalCatatan = { id: number; ulang: string; catatan: string };

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SIKLUS: { no: string; judul: string; isi: string }[] = [
  { no: "J1", judul: "Terjadwal", isi: "Dibuat PPK atau bawaan tanggal 10. Belum menerima usulan." },
  { no: "J2", judul: "Dibuka", isi: "Ketua tim dan admin RO mengajukan usulan; persetujuan berjalan per RO." },
  { no: "J3", judul: "Dikumpulkan", isi: "Jendela ditutup. Hanya usulan berstatus Disetujui yang ikut paket." },
  { no: "J4", judul: "Diterapkan", isi: "Paket menjadi kertas kerja satker. Jalur DJPb dan DJA dilanjutkan ke surat usulan." },
  { no: "J5", judul: "Sah", isi: "PPK mencatat dokumen dasar. Status POK sistem naik versi; PDF resmi diunggah dan dicocokkan." },
];

export default function HalamanRevisi() {
  const ringkas = useBacaKeu<Jadwal>(urlBaca("keu_v_revisi_ringkas", {}, { urut: "buka", batas: 200 }));
  const catatanJadwal = useBacaKeu<JadwalCatatan>(urlBaca("keu_revisi_jadwal", {}, { urut: "buka", batas: 200, kolom: ["id", "ulang", "catatan"] }));
  const sah = useBacaKeu<Sah>(urlBaca("keu_revisi_sah", {}, { batas: 200, kolom: ["jadwal_id", "versi_sistem", "nomor_dokumen", "tanggal_dokumen"] }));
  const tambahan = useBacaKeu<Tambahan>(urlBaca("keu_v_tambahan_pagu", {}, { urut: "-id", batas: 200, kolom: ["id", "ro_kode", "jumlah", "jalur", "nomor_dokumen", "tanggal_dokumen", "status", "dipenuhi_total", "sisa_penggenap", "alasan_batal"] }));
  const tenggat = useBacaKeu<Tenggat>(urlBaca("keu_v_tenggat", {}, { urut: "tanggal", batas: 20 }));
  const pok = useBacaKeu<PokVersi>(urlBaca("keu_pok_versi", { status: "berlaku" }, { urut: "-id", batas: 1, kolom: ["id", "nomor_pok", "tanggal_efektif"] }));
  const tahunAda = useBacaKeu<{ tahun: number }>(urlBaca("keu_tahun_anggaran", {}, { urut: "tahun", batas: 20, kolom: ["tahun"] }));
  const ro = useBacaKeu<{ kode: string; nama: string }>(urlBaca("keu_ro", {}, { urut: "kode", batas: 500, kolom: ["kode", "nama"] }));
  const bolehJadwal = useBoleh("jadwal", null) === true;
  const bolehSahkan = useBoleh("sahkan", null) === true;
  const muatSemua = async () => { await Promise.all([ringkas.muat(), catatanJadwal.muat(), sah.muat(), tambahan.muat()]); };
  const { kirim, jalankan, mengirim, galat: galatKirim } = useKirim(muatSemua);

  const tahunTerdaftar = useMemo(() => (tahunAda.baris ?? []).map((t) => Number(t.tahun)), [tahunAda.baris]);
  const [tahunPilih, setTahunPilih] = useState<string>("");
  const tahunBawaan = tahunPilih || String(tahunTerdaftar.includes(new Date().getFullYear()) ? new Date().getFullYear() : (tahunTerdaftar[0] ?? new Date().getFullYear()));
  const [pilih, setPilih] = useState<number | null | undefined>(undefined);
  const [baru, setBaru] = useState<IsianJadwal>(jadwalKosong());
  const [salahBaru, setSalahBaru] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);

  const jadwal: Jadwal[] = useMemo(() => {
    const cat = new Map((catatanJadwal.baris ?? []).map((c) => [Number(c.id), c]));
    return (ringkas.baris ?? []).map((j) => ({ ...j, ulang: cat.get(Number(j.jadwal_id))?.ulang ?? "", catatan: cat.get(Number(j.jadwal_id))?.catatan ?? "" }));
  }, [ringkas.baris, catatanJadwal.baris]);
  const sahPer = useMemo(() => new Map((sah.baris ?? []).map((s) => [Number(s.jadwal_id), s])), [sah.baris]);
  const namaRo = useMemo(() => new Map((ro.baris ?? []).map((r) => [r.kode, r.nama.replace(" (contoh)", "")])), [ro.baris]);
  const judulPer = useMemo(() => new Map(jadwal.map((j) => [Number(j.jadwal_id), j.judul])), [jadwal]);
  const dasar: PokDasar = pok.baris && pok.baris[0] ? { nomor_pok: pok.baris[0].nomor_pok, tanggal_efektif: pok.baris[0].tanggal_efektif } : null;
  const ringkasPokKini = useMemo(() => ringkasPok(sah.baris ?? [], judulPer, dasar), [sah.baris, judulPer, dasar]);
  // bawaan: jadwal pertama yang sedang Dibuka terlihat terbuka usulannya
  const terbukaId = pilih === undefined ? (jadwal.find((j) => j.status === "dibuka")?.jadwal_id ?? null) : pilih;

  const tambahJadwal = async () => {
    const g = periksaJadwalBaru(baru, tahunTerdaftar);
    setSalahBaru(g); setPesan(null);
    if (g.length) return;
    if (await jalankan(() => tulisKeuKlien("keu_revisi_jadwal", "insert", dataJadwalBaru(baru)))) {
      setBaru(jadwalKosong());
      setPesan("Jadwal ditambahkan dengan status Terjadwal.");
    }
  };
  const buatBawaan = async () => {
    setPesan(null);
    const dari = Number(tahunBawaan) === new Date().getFullYear() ? new Date().getMonth() + 1 : 1; // tahun berjalan: mulai bulan ini
    if (await kirim("keu_jadwal_bulanan", { p_tahun: Number(tahunBawaan), p_dari: dari, p_hari: 10 })) setPesan(`Jadwal Revisi POK tanggal 10 untuk ${tahunBawaan} (mulai ${NAMA_BULAN[dari - 1]}) diperiksa dan dibuat. Jadwal yang sudah ada tidak ditimpa; PPK dapat membuka atau melewati tiap bulan.`);
  };

  return (
    <HalamanKeu jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran" }, { t: "Jadwal dan pengesahan" }]} judul="Jadwal revisi dan pengesahan oleh PPK">
        <Tenang>
          PPK menentukan <b>kapan</b> kertas kerja revisi dibuka dan <b>jenisnya</b> (POK, DIPA jalur DJPb, DIPA jalur DJA, atau Administrasi). Untuk Revisi POK tersedia jadwal bawaan tiap tanggal 10; PPK dapat merealisasikan atau melewatinya. Usulan hanya dapat diajukan selama jendela terbuka. Setelah diterapkan, <b>PPK menyatakan revisi sah</b> dan status POK sistem ikut terbarui. Tenggat Pasal 175 hanya menjadi pengingat, tidak mengunci tombol.
        </Tenang>
        <div className="flex flex-wrap gap-2">
          <Link href="/sigap/revisi/kertas" className={`${tombolUtama} inline-flex items-center no-underline`}>Buka Kertas kerja revisi (matriks per KRO)</Link>
          <Link href="/sigap/revisi/peta" className={`${tombolKecil} inline-flex items-center no-underline`}>Peta KRO Satker (kecukupan seluruh KRO)</Link>
          <Link href="/sigap/revisi/versi" className={`${tombolKecil} inline-flex items-center no-underline`}>Versi, RPD, dan dampak sesudah revisi</Link>
          <Link href="/sigap/revisi/lampiran" className={`${tombolKecil} inline-flex items-center no-underline`}>Lampiran, tenggat, dan draf surat usulan</Link>
          <Link href="/sigap/revisi/status" className={`${tombolKecil} inline-flex items-center no-underline`}>Status, peran, dan riwayat jadwal</Link>
          <Link href="/sigap/master" className={`${tombolKecil} inline-flex items-center no-underline`}>Master data (akun, satuan, waktu, skor)</Link>
          <Link href="/sigap/struktur" className={`${tombolKecil} inline-flex items-center no-underline`}>Tambah level mata anggaran (usulan struktur)</Link>
        </div>

        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          <div className={`${kartu} flex flex-col gap-2`}>
            <div className={caps}>POK sistem yang berlaku</div>
            {sah.baris && pok.baris ? (
              <div className="flex flex-col">
                <span className="text-[22px] font-extrabold leading-tight text-[#0F2A52]">{ringkasPokKini.label}</span>
                <span className="text-[12.5px] text-[#5B6B84]">{ringkasPokKini.ket}</span>
              </div>
            ) : <div className="h-12 animate-pulse rounded-lg bg-[#EEF2F7]" aria-busy="true" />}
            <div className="text-[12px] text-[#5B6B84]">Setelah revisi sah, PDF POK resmi dari SAKTI diunggah dan dicocokkan dengan POK sistem.</div>
            <Link href="/sigap/revisi/pok" className={`${tombolKecil} inline-flex items-center self-start no-underline`}>Unggah dan cocokkan PDF POK resmi</Link>
            <Galat pesan={sah.galat ?? pok.galat} />
          </div>

          <div className={`${kartu} flex flex-col gap-2`}>
            <div className={caps}>Pengingat tenggat Pasal 175 (hari ini {tglPanjang(new Date().toISOString().slice(0, 10))})</div>
            {!tenggat.baris && !tenggat.galat && <div className="h-12 animate-pulse rounded-lg bg-[#EEF2F7]" aria-busy="true" />}
            {tenggat.baris && tenggat.baris.length === 0 && <div className="text-[12.5px] text-[#5B6B84]">Belum ada tenggat yang diatur.</div>}
            {(tenggat.baris ?? []).map((t) => {
              const s = statusTenggat(t.sisa_hari);
              return (
                <div key={t.kode} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span>{t.nama.replace(/^Tenggat /, "")}</span>
                  <Chip warna={s.warna}>{tglPanjang(t.tanggal)}{s.teks ? `, ${s.teks}` : ""}</Chip>
                </div>
              );
            })}
            <Galat pesan={tenggat.galat} />
            <div className="text-[12px] text-[#5B6B84]">Bila jatuh pada hari libur, tanggal dimajukan ke hari kerja terakhir sebelumnya (dihitung sistem, tidak ditampilkan di sini).</div>
          </div>

          <div className={`${kartu} flex flex-col gap-2`}>
            <div className={caps}>Riwayat versi POK sistem</div>
            {ringkasPokKini.riwayat.map((v) => (
              <div key={v.label} className="rounded-r-md border-l-[3px] border-[#9DD3B8] bg-white px-2.5 py-0.5 text-[12.5px]">
                <b>{v.label}</b>
                <div className="text-[12px] text-[#5B6B84]">{v.ket}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${kartu} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-bold text-[#0F2A52]">Daftar jadwal</h2>
            {bolehJadwal && (
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="bln-th">Tahun anggaran</label>
                <select id="bln-th" className={`${kolom} !w-auto`} value={tahunBawaan} onChange={(e) => setTahunPilih(e.target.value)}>
                  {(tahunTerdaftar.length ? tahunTerdaftar : [Number(tahunBawaan)]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" disabled={mengirim} className={tombolKecil} onClick={() => void buatBawaan()}>Buat jadwal bawaan Revisi POK tanggal 10 ({tahunBawaan})</button>
              </div>
            )}
          </div>
          {!bolehJadwal && <Catatan>Hanya PPK yang dapat membuka, menutup, merealisasikan, atau melewati jadwal, dan menyatakan revisi sah. Usulan RO diajukan selama jadwal berstatus Dibuka.</Catatan>}
          <Galat pesan={ringkas.galat} />
          <Galat pesan={galatKirim} />
          {ringkas.memuat && !ringkas.baris && <div className="h-24 animate-pulse rounded-lg bg-[#EEF2F7]" aria-busy="true" />}
          {ringkas.baris && ringkas.baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada jadwal revisi.{bolehJadwal ? " Buat jadwal bawaan atau tambahkan jadwal di bawah." : ""}</p>}
          {jadwal.map((j) => (
            <KartuJadwal
              key={j.jadwal_id} j={j} sah={sahPer.get(Number(j.jadwal_id))} namaRo={namaRo} terbuka={terbukaId === j.jadwal_id}
              ubahTerbuka={() => setPilih(terbukaId === j.jadwal_id ? null : j.jadwal_id)} bolehJadwal={bolehJadwal} bolehSahkan={bolehSahkan} sesudah={muatSemua}
            />
          ))}
          {pesan && <Tenang>{pesan}</Tenang>}
        </div>

        <div className={`${kartu} flex flex-col gap-3`}>
          <h2 className="text-[16px] font-bold text-[#0F2A52]">Tambah jadwal</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-[#5B6B84]">Jenis</span>
            {DAFTAR_JENIS.map((k) => (
              <button key={k.kode} type="button" aria-pressed={baru.jenis === k.kode} className={baru.jenis === k.kode ? tombolAktif : tombolKecil} onClick={() => setBaru({ ...baru, jenis: k.kode })}>{k.nama}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <div><label className={label} htmlFor="jd">Judul</label><input id="jd" className={kolom} maxLength={120} value={baru.judul} onChange={(e) => setBaru({ ...baru, judul: e.target.value })} /></div>
            <div><label className={label} htmlFor="jb">Jendela dibuka</label><input id="jb" type="date" className={kolom} value={baru.buka} onChange={(e) => setBaru({ ...baru, buka: e.target.value })} /></div>
            <div><label className={label} htmlFor="jt">Jendela ditutup</label><input id="jt" type="date" className={kolom} value={baru.tutup} onChange={(e) => setBaru({ ...baru, tutup: e.target.value })} /></div>
          </div>
          <Galat pesan={salahBaru} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!bolehJadwal || mengirim} className={tombolUtama} onClick={() => void tambahJadwal()}>Tambah jadwal</button>
            <span className="text-[12px] text-[#5B6B84]">{bolehJadwal ? "Jadwal baru berstatus Terjadwal; PPK membukanya dari daftar di atas." : "Hanya PPK."}</span>
          </div>
        </div>

        <BagianTambahan jadwal={jadwal} daftar={tambahan.baris} galatBaca={tambahan.galat} bolehSahkan={bolehSahkan} sesudah={muatSemua} />

        <div className={`${kartu} flex flex-col gap-3`}>
          <h2 className="text-[16px] font-bold text-[#0F2A52]">Siklus satu jadwal</h2>
          <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
            {SIKLUS.map((s) => (
              <li key={s.no} className="flex flex-col gap-1 rounded-lg border border-[#E8EDF5] bg-[#F9FBFE] p-3">
                <span className="w-fit rounded bg-[#E3EEFF] px-1.5 text-[11px] font-bold text-[#1F5FD1]">{s.no}</span>
                <h3 className="text-[13.5px] font-bold text-[#0F2A52]">{s.judul}</h3>
                <p className="text-[12px] leading-snug text-[#5B6B84]">{s.isi}</p>
              </li>
            ))}
          </ol>
          <div className="text-[12px] text-[#5B6B84]">Dilewati adalah akhir sah untuk jadwal tanpa usulan; dapat dipulihkan selama jendela belum lewat.</div>
        </div>
    </HalamanKeu>
  );
}
