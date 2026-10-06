"use client";

// app/sigap/admin/Beranda.tsx
//
// (6 Okt 2026) Beranda backoffice SIGAP -- saran desain widescreen user: sapaan sesuai jam WIB, baris
// "<peran> · n hal perlu tindakan hari ini", 4 kartu angka (data nyata dari GET bagian=beranda, TANPA
// angka contoh Pagu/Realisasi -- modul RAB/POK belum ada), lalu 2 kolom "Perlu tindakan" + "Akses cepat".

import Link from "next/link";
import { pesanGalat, rentangPendek, tglPanjang } from "./api";
import type { KodeTabAdmin } from "./Shell";
import { Memuat, Pesan } from "./ui";

export type KegiatanBeranda = {
  id: number;
  nama: string;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  periode_kosong: boolean;
  petugas: number;
  st_tanpa_nomor: number;
  st_tanpa_file: number;
  belum_pilih: number;
  kerja_hari_ini: number;
  lengkap_hari_ini: number;
  terlewat: number;
  siap_kunci: number;
  terkunci: number;
  boleh: { monitoring: boolean; penugasan: boolean; kegiatan: boolean; verifikasi: boolean; izin: boolean };
};
export type DataBeranda = { hari_ini: string; kegiatan: KegiatanBeranda[] };

type Tingkat = "mendesak" | "peringatan" | "info";
export type Tindakan = { id: string; kegId: number; kegNama: string; teks: string; chip: string; tingkat: Tingkat; tab: Exclude<KodeTabAdmin, "beranda">; ket?: string };

/** "Perlu tindakan" dibangkitkan per kegiatan bila angkanya > 0 dan sesuai izin `boleh`. */
export function daftarTindakan(d: DataBeranda | null): Tindakan[] {
  if (!d) return [];
  const out: Tindakan[] = [];
  const urut: Record<Tingkat, number> = { mendesak: 0, peringatan: 1, info: 2 };
  for (const k of d.kegiatan) {
    const berjalan = !!k.tanggal_mulai && k.tanggal_mulai <= d.hari_ini;
    const dasar = { kegId: k.id, kegNama: k.nama };
    if (k.periode_kosong && k.boleh.kegiatan) out.push({ ...dasar, id: `${k.id}-periode`, teks: "Periode kegiatan belum diisi", chip: "belum diisi", tingkat: "peringatan", tab: "kegiatan" });
    if (k.st_tanpa_nomor > 0 && k.boleh.penugasan)
      out.push({ ...dasar, id: `${k.id}-st`, teks: "Surat Tugas belum ada nomor", chip: `${k.st_tanpa_nomor} petugas`, tingkat: berjalan ? "mendesak" : "peringatan", tab: "penugasan", ket: berjalan ? "kegiatan sudah berjalan" : undefined });
    if (k.st_tanpa_file > 0 && k.boleh.penugasan) out.push({ ...dasar, id: `${k.id}-stfile`, teks: "PDF Surat Tugas belum diunggah", chip: `${k.st_tanpa_file} petugas`, tingkat: "peringatan", tab: "penugasan" });
    if (k.belum_pilih > 0 && k.boleh.monitoring)
      out.push({ ...dasar, id: `${k.id}-pilih`, teks: "Petugas belum memilih hari kerja", chip: `${k.belum_pilih} petugas`, tingkat: berjalan ? "mendesak" : "peringatan", tab: "monitoring" });
    if (k.terlewat > 0 && k.boleh.monitoring)
      out.push({ ...dasar, id: `${k.id}-terlewat`, teks: "Hari kerja terlewat", chip: `${k.terlewat} hari`, tingkat: "mendesak", tab: "monitoring", ket: k.boleh.izin ? "bisa beri izin susulan" : "tidak masuk Kwitansi" });
    if (k.siap_kunci > 0 && k.boleh.verifikasi) out.push({ ...dasar, id: `${k.id}-kunci`, teks: "SPJ siap dikunci", chip: `${k.siap_kunci} petugas`, tingkat: "info", tab: "verifikasi" });
  }
  return out.sort((a, b) => urut[a.tingkat] - urut[b.tingkat]);
}

const WARNA_CHIP: Record<Tingkat, string> = {
  mendesak: "bg-red-50 text-red-700",
  peringatan: "bg-amber-50 text-amber-800",
  info: "bg-[#E3EEFB] text-[#1F6FD1]",
};
const TITIK: Record<Tingkat, string> = { mendesak: "bg-red-500", peringatan: "bg-amber-400", info: "bg-[#1F6FD1]" };

function sapaan() {
  const jam = new Date(Date.now() + 7 * 3_600_000).getUTCHours(); // WIB
  if (jam >= 4 && jam < 11) return "Selamat pagi";
  if (jam >= 11 && jam < 15) return "Selamat siang";
  if (jam >= 15 && jam < 18) return "Selamat sore";
  return "Selamat malam";
}

export default function Beranda({
  data,
  galat,
  onMuatUlang,
  nama,
  peran,
  hariIni,
  kegIdSekarang,
  onBuka,
  bolehAkses,
  bolehBuatKegiatan,
  onKegiatanBaru,
}: {
  data: DataBeranda | null;
  galat: unknown;
  onMuatUlang: () => void;
  nama: string;
  peran: string[];
  hariIni: string;
  kegIdSekarang: number | null;
  onBuka: (kegId: number, tab: Exclude<KodeTabAdmin, "beranda">) => void;
  bolehAkses: boolean;
  bolehBuatKegiatan: boolean;
  onKegiatanBaru: () => void;
}) {
  const tindakan = daftarTindakan(data);
  const keg = data?.kegiatan ?? [];
  const jml = (f: (k: KegiatanBeranda) => number) => keg.reduce((s, k) => s + f(k), 0);
  const petugas = jml((k) => k.petugas);
  const kerja = jml((k) => k.kerja_hari_ini);
  const lengkap = jml((k) => k.lengkap_hari_ini);
  const terkunci = jml((k) => k.terkunci);

  /** Kegiatan tujuan akses cepat: kegiatan terpilih bila diizinkan, selain itu kegiatan pertama yg diizinkan. */
  const kegUntuk = (izin: keyof KegiatanBeranda["boleh"]) => keg.find((k) => k.id === kegIdSekarang && k.boleh[izin]) ?? keg.find((k) => k.boleh[izin]) ?? null;
  const kPen = kegUntuk("penugasan");
  const kTarif = kegUntuk("kegiatan");

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[17px] font-extrabold leading-tight lg:text-[16px]">
          {sapaan()}, {nama}
        </h1>
        <p className="mt-0.5 text-[12.5px] text-[#4D5B6B]">
          {peran.length ? peran.join(", ") : "Pengguna SIGAP"} ·{" "}
          {!data ? "menghitung…" : tindakan.length === 0 ? "tidak ada yang perlu tindakan hari ini" : `${tindakan.length} hal perlu tindakan hari ini`}
          <span className="text-[#7B8794]"> · {tglPanjang(data?.hari_ini ?? hariIni)}</span>
        </p>
      </div>

      {galat != null && !data ? (
        <Pesan onTutup={onMuatUlang}>{pesanGalat(galat)} Tutup untuk mencoba lagi.</Pesan>
      ) : !data ? (
        <Memuat teks="Menghitung ringkasan…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <Angka label="Kegiatan aktif" nilai={keg.length} ket={keg.length ? `${keg.filter((k) => k.tanggal_mulai && k.tanggal_mulai <= data.hari_ini).length} sudah berjalan` : "belum ada"} />
            <Angka label="Petugas aktif" nilai={petugas} ket={`${jml((k) => k.belum_pilih)} belum pilih hari kerja`} />
            <Angka label="Lengkap hari ini" nilai={`${lengkap} / ${kerja}`} ket={kerja ? `${Math.round((lengkap / kerja) * 100)}% hari kerja hari ini` : "tidak ada hari kerja hari ini"} />
            <Angka label="SPJ terkunci" nilai={`${terkunci} / ${petugas}`} ket={`${jml((k) => k.siap_kunci)} siap dikunci`} />
            <div className="col-span-2 rounded-2xl border border-dashed border-[#D5DCE7] bg-white/50 p-3.5 lg:col-span-1 lg:rounded-xl">
              <p className="text-[11px] font-bold text-[#7B8794]">Pagu &amp; realisasi</p>
              <p className="mt-1 text-[12px] font-semibold leading-snug text-[#7B8794]">Menunggu modul RAB/POK</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="rounded-2xl bg-white p-4 shadow-sm lg:rounded-xl lg:border lg:border-[#E3E8EE] lg:shadow-none">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-[13.5px] font-extrabold">Perlu tindakan</h2>
                {tindakan.length > 0 && <span className="rounded-full bg-[#F3F5F8] px-2 py-0.5 text-[11px] font-bold text-[#4D5B6B]">{tindakan.length}</span>}
                <div className="flex-1" />
                <button type="button" onClick={onMuatUlang} className="text-[11.5px] font-semibold text-[#1F6FD1] hover:underline">
                  Muat ulang
                </button>
              </div>
              {tindakan.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-[#7B8794]">Semua beres — tidak ada yang perlu ditindaklanjuti. 🎉</p>
              ) : (
                <ul>
                  {tindakan.map((t) => (
                    <li key={t.id} className="[&:first-child>button]:border-t-0">
                      <button
                        type="button"
                        onClick={() => onBuka(t.kegId, t.tab)}
                        className="group flex w-full items-center gap-2.5 border-t border-[#EDF0F4] py-2 text-left text-[12.5px] hover:bg-[#F8FAFC]"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${TITIK[t.tingkat]}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{t.teks}</span>
                          <span className="text-[#7B8794]"> · {t.kegNama}</span>
                          {t.ket && <span className="block text-[11px] text-[#7B8794]">{t.ket}</span>}
                        </span>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${WARNA_CHIP[t.tingkat]}`}>
                          <span className="sr-only">{t.tingkat}: </span>
                          {t.chip}
                        </span>
                        <span className="shrink-0 text-[#CDD5DE] group-hover:text-[#1F6FD1]" aria-hidden>
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm lg:rounded-xl lg:border lg:border-[#E3E8EE] lg:shadow-none">
              <h2 className="mb-1 text-[13.5px] font-extrabold">Akses cepat</h2>
              <ul className="text-[12.5px]">
                {kPen && <BarisCepat ikon="＋" label="Tambah penugasan" ket={kPen.nama} onClick={() => onBuka(kPen.id, "penugasan")} />}
                {kPen && <BarisCepat ikon="⬆" label="Unggah PDF Surat Tugas" ket={kPen.nama} onClick={() => onBuka(kPen.id, "penugasan")} />}
                {kTarif && <BarisCepat ikon="⚙" label="Atur tarif" ket={kTarif.nama} onClick={() => onBuka(kTarif.id, "kegiatan")} />}
                {bolehAkses && <BarisCepat ikon="🔐" label="Kelola peran & akses" href="/sigap/akses" />}
                {bolehBuatKegiatan && <BarisCepat ikon="✚" label="Kegiatan baru" onClick={onKegiatanBaru} />}
                {!kPen && !kTarif && !bolehAkses && !bolehBuatKegiatan && <li className="py-4 text-[12px] text-[#7B8794]">Belum ada aksi yang tersedia untuk peran Anda.</li>}
              </ul>
              {keg.length > 0 && (
                <>
                  <h3 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-[#7B8794]">Kegiatan aktif</h3>
                  <ul className="text-[12px]">
                    {keg.map((k) => (
                      <li key={k.id} className="flex items-center gap-2 border-t border-[#EDF0F4] py-1.5 first:border-t-0">
                        <span className="min-w-0 flex-1 truncate font-semibold" title={k.nama}>
                          {k.nama}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#7B8794]">{k.periode_kosong ? "periode belum diisi" : rentangPendek(k.tanggal_mulai, k.tanggal_selesai)}</span>
                        {k.boleh.monitoring && (
                          <button type="button" onClick={() => onBuka(k.id, "monitoring")} className="shrink-0 text-[11px] font-bold text-[#1F6FD1] hover:underline">
                            Pantau
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Angka({ label, nilai, ket }: { label: string; nilai: React.ReactNode; ket?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-sm lg:rounded-xl lg:border lg:border-[#E3E8EE] lg:shadow-none">
      <p className="text-[11px] font-bold text-[#7B8794]">{label}</p>
      <p className="mt-0.5 text-[20px] font-extrabold leading-tight lg:text-[19px]">{nilai}</p>
      {ket && <p className="text-[11px] text-[#7B8794]">{ket}</p>}
    </div>
  );
}

function BarisCepat({ ikon, label, ket, onClick, href }: { ikon: string; label: string; ket?: string; onClick?: () => void; href?: string }) {
  const isi = (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E3EEFB] text-[12px] text-[#1F6FD1]" aria-hidden>
        {ikon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{label}</span>
        {ket && <span className="block truncate text-[11px] text-[#7B8794]">{ket}</span>}
      </span>
      <span className="text-[#CDD5DE]" aria-hidden>
        ›
      </span>
    </>
  );
  const kelas = "flex w-full items-center gap-2.5 border-t border-[#EDF0F4] py-2 text-left hover:bg-[#F8FAFC]";
  return (
    <li className="[&:first-child>*]:border-t-0">
      {href ? (
        <Link href={href} className={kelas}>
          {isi}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={kelas}>
          {isi}
        </button>
      )}
    </li>
  );
}
