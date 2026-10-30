"use client";

// app/sigap/korwil/KorwilHasilQc.tsx
//
// (27 Okt 2026) Lembar Supervisi > Hasil QC Pemahaman. HANYA-BACA. Jawaban QC Pemahaman petugas (PML & PPL) satu kelompok, dua tampilan:
//  * Per tim: skor tiap petugas; ketuk petugas = rincian pilihan pertama, kedua, ... sampai benar; soal yang dijawab salah;
//  * Matriks: baris = soal, kolom = petugas (dikelompokkan per tim); sel ✓ benar, ✕ salah (huruf = jawaban yang dipilih), – belum.
// (31 Okt 2026) Dipadatkan dan disamakan dengan tab QC SPDT NTP (app/portal/qc/QcBersama.tsx):
//  * saringan tim / petugas / tanggal dalam SATU baris, dua pilihan segmen dalam satu baris;
//  * kartu ringkasan = saringan: "Sudah mengisi" -> tampilkan yang belum mengisi, "Benar" -> tampilkan yang masih ada jawaban salah (lib/sigapQcSaring.ts);
//  * ketuk soal / sel / nama petugas membuka lembar bawah (bukan blok di dasar halaman yang tidak terlihat); Back HP menutupnya.
// Data: /api/portal/qc/hasil; hitungan: lib/korwilHasilQc.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/app/portal/dataBersama";
import { namaSingkatTampil } from "@/lib/namaTampil";
import { BarisSaring, IsiPetugas, IsiSoal, KOTAK, KartuSaring, LembarBawah, MatriksQc, SELECT_PADAT, Segmen, pct, tglPendek, warnaPersen } from "@/app/portal/qc/QcBersama";
import { LABEL_KARTU_HASIL, ketukKartu, lolosKartuHasil, type KartuQc } from "@/lib/sigapQcSaring";
import {
  SARINGAN_AWAL,
  opsiSaringan,
  rincianPetugas,
  susunHasil,
  type AnggotaHasil,
  type HasilQc,
  type PercobaanMentah,
  type Saringan,
  type SoalMentah,
} from "@/lib/korwilHasilQc";

type Data = { kelompok: number; sekarang: string; anggota: AnggotaHasil[]; percobaan: PercobaanMentah[]; soal: SoalMentah[] };
type Tampilan = "tim" | "matriks";
type Lembar = { jenis: "soal"; soal: string; akun: number | null } | { jenis: "petugas"; akun: number };

/** kelompok: pilihan di halaman Supervisi; null = kelompok bawaan akun (server yang menentukan, sama dengan Monitoring). */
export default function KorwilHasilQc({ kelompok }: { kelompok: number | null }) {
  // (27 Okt 2026) Data lewat simpanan bersama (dataBersama.ts): tampil seketika dari simpanan / hasil prefetch, diperbarui di belakang; tidak menunggu Monitoring.
  const hd = useData<Data>(`/api/portal/qc/hasil${kelompok ? `?kelompok=${kelompok}` : ""}`);
  const d = hd.data;
  const kelompokAktif = d?.kelompok ?? null;
  const galat = !d && hd.galat && hd.galat !== "SESI_BERAKHIR" ? hd.galat : null;
  const [sar, setSar] = useState<Saringan>(SARINGAN_AWAL);
  const [tampil, setTampil] = useState<Tampilan>("tim");
  const [hanyaSalah, setHanyaSalah] = useState(true);
  const [kartu, setKartu] = useState<KartuQc | null>(null);
  const [lembar, setLembar] = useState<Lembar | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // tombol "Muat ulang": paksa ambil dari server sekarang
  const muatUlang = hd.muat;
  const muat = useCallback(async () => {
    setSibuk(true);
    try {
      await muatUlang();
    } finally {
      setSibuk(false);
    }
  }, [muatUlang]);

  // ganti kelompok: saringan dan lembar mulai dari awal
  useEffect(() => {
    setSar(SARINGAN_AWAL);
    setKartu(null);
    setLembar(null);
  }, [kelompokAktif]);

  const tutup = useCallback(() => setLembar(null), []);
  const opsi = useMemo(() => (d ? opsiSaringan(d.anggota, d.percobaan) : null), [d]);
  const h = useMemo(() => (d ? susunHasil(d.anggota, d.percobaan, d.soal, sar) : null), [d, sar]);
  const petugasPilihan = useMemo(() => (opsi ? opsi.petugas.filter((p) => sar.tim == null || p.tim === sar.tim) : []), [opsi, sar.tim]);
  // Kartu hanya menyaring DAFTAR petugas (angka kartu tetap dari semua petugas yang cocok dengan saringan atas).
  const hf = useMemo<HasilQc | null>(() => {
    if (!h) return null;
    if (kartu === null) return h;
    const lolos = (p: { terjawab: number; salah: number }) => lolosKartuHasil(kartu, p);
    return {
      ...h,
      tim: h.tim.map((t) => ({ ...t, petugas: t.petugas.filter(lolos) })).filter((t) => t.petugas.length > 0),
      matriks: { ...h.matriks, kolom: h.matriks.kolom.filter(lolos) },
    };
  }, [h, kartu]);
  const rincian = useMemo(() => (d && lembar?.jenis === "petugas" ? rincianPetugas(lembar.akun, d.percobaan, d.soal) : null), [d, lembar]);

  if (galat && !d) return <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>;
  if (!d || !h || !hf || !opsi) {
    return (
      <div className={KOTAK} aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );
  }

  const R = h.ringkas;
  const semuaKolom = h.matriks.kolom;
  const jumlahTampil = hf.tim.reduce((a, t) => a + t.petugas.length, 0);
  const barisSoal = lembar?.jenis === "soal" ? h.matriks.baris.find((b) => b.soal.id === lembar.soal) ?? null : null;
  const petugasLembar = lembar ? semuaKolom.find((p) => p.akun_id === lembar.akun) ?? null : null;
  const aktifMatriks = lembar?.jenis === "soal" ? { soal: lembar.soal, akun: lembar.akun } : null;
  const ket = d.sekarang ? tglPendek(new Date(Date.parse(d.sekarang) + 7 * 3_600_000).toISOString().slice(0, 10)) : "";

  return (
    <div className="space-y-2">
      <section className={`${KOTAK} space-y-2`} aria-label="Saringan">
        <div className="grid grid-cols-3 gap-1.5">
          <select aria-label="Tim (PML)" className={SELECT_PADAT} value={sar.tim ?? ""} onChange={(e) => setSar({ ...sar, tim: e.target.value || null, petugas: null })}>
            <option value="">Semua tim</option>
            {opsi.tim.map((t) => (
              <option key={t} value={t}>
                {namaSingkatTampil(t)}
              </option>
            ))}
          </select>
          <select aria-label="Petugas" className={SELECT_PADAT} value={sar.petugas ?? ""} onChange={(e) => setSar({ ...sar, petugas: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Semua petugas</option>
            {petugasPilihan.map((p) => (
              <option key={p.akun_id} value={p.akun_id}>
                {namaSingkatTampil(p.nama)}
              </option>
            ))}
          </select>
          <select aria-label="Tanggal" className={SELECT_PADAT} value={sar.tanggal ?? ""} onChange={(e) => setSar({ ...sar, tanggal: e.target.value || null })}>
            <option value="">Semua tanggal</option>
            {opsi.tanggal.map((t) => (
              <option key={t} value={t}>
                {tglPendek(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Segmen label="Percobaan yang dihitung (satu per petugas per hari)" nilai={sar.mode} onPilih={(v) => setSar({ ...sar, mode: v })} pilihan={[["pertama", "Coba pertama"], ["terakhir", "Coba terakhir"]]} />
          <Segmen label="Tampilan" nilai={tampil} onPilih={setTampil} pilihan={[["tim", "Per tim"], ["matriks", "Matriks"]]} />
        </div>
      </section>

      <KartuSaring
        item={[
          { kunci: "isi", angka: `${R.sudahMengisi}/${R.petugas}`, label: "Sudah mengisi", aktif: kartu === "belum_mengisi", petunjuk: "Ketuk untuk menampilkan yang belum mengisi.", onKlik: () => setKartu(ketukKartu(kartu, "belum_mengisi")) },
          { kunci: "benar", angka: pct(R.persen), label: "Benar", sub: `${R.salah} jawaban salah`, aktif: kartu === "belum_lulus", petunjuk: "Ketuk untuk menampilkan yang masih ada jawaban salah.", onKlik: () => setKartu(ketukKartu(kartu, "belum_lulus")) },
          { kunci: "belum", angka: String(R.belumMengisi), label: "Belum mengisi", peringatan: R.belumMengisi > 0, aktif: kartu === "belum_mengisi", petunjuk: "Ketuk untuk menampilkan yang belum mengisi.", onKlik: () => setKartu(ketukKartu(kartu, "belum_mengisi")) },
        ]}
      />
      {kartu && <BarisSaring teks={LABEL_KARTU_HASIL[kartu]} jumlah={jumlahTampil} onLepas={() => setKartu(null)} />}

      {R.petugas === 0 && <p className={`${KOTAK} text-[13px] text-[#52627A]`}>Tidak ada petugas yang cocok dengan saringan.</p>}
      {R.petugas > 0 && R.sudahMengisi === 0 && <p className={`${KOTAK} text-[13px] text-[#52627A]`}>Belum ada jawaban QC Pemahaman{sar.tanggal ? ` pada ${tglPendek(sar.tanggal)}` : ""}.</p>}
      {kartu && jumlahTampil === 0 && R.petugas > 0 && <p className={`${KOTAK} text-[13px] font-bold text-[#13794B]`}>Tidak ada petugas yang {LABEL_KARTU_HASIL[kartu]}.</p>}

      {tampil === "tim" &&
        hf.tim.map((t) => (
          <section key={t.nama} className={`${KOTAK} !py-2`} aria-label={`Tim ${t.nama}`}>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-[#0F2A52]">Tim {namaSingkatTampil(t.nama)}</h3>
              <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${warnaPersen(t.persen)}`}>{pct(t.persen)} benar</span>
            </div>
            <ul className="divide-y divide-[#EEF2F7]">
              {t.petugas.map((p) => (
                <li key={p.akun_id}>
                  <button
                    type="button"
                    disabled={p.terjawab === 0}
                    onClick={() => setLembar({ jenis: "petugas", akun: p.akun_id })}
                    className="flex min-h-[40px] w-full items-center gap-2 text-left text-[13px] disabled:cursor-default"
                  >
                    <span className={`min-w-0 flex-1 truncate font-bold ${p.terjawab > 0 ? "text-[#1F5FD1]" : "text-[#1B2B4B]"}`}>
                      {namaSingkatTampil(p.nama)} <span className="text-[11px] font-extrabold text-[#6B7A90]">{p.peran.toUpperCase()}</span>
                    </span>
                    {p.terjawab === 0 ? (
                      <span className="flex-none rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11.5px] font-bold text-[#5B6B84]">Belum mengisi</span>
                    ) : (
                      <>
                        <span className="flex-none text-[11.5px] text-[#6B7A90]">
                          {p.salah} salah / {p.terjawab}
                        </span>
                        <span className={`flex-none rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${warnaPersen(p.persen)}`}>{pct(p.persen)}</span>
                        <span aria-hidden className="flex-none text-[11px] text-[#6B7A90]">›</span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {t.soalSalah.length > 0 ? (
              <details className="mt-1 border-t border-[#EEF2F7]">
                <summary className="flex min-h-[40px] cursor-pointer list-none items-center text-[12.5px] font-extrabold text-[#52627A]">Soal yang dijawab salah ({t.soalSalah.length}) ▾</summary>
                <ul className="divide-y divide-[#EEF2F7]">
                  {t.soalSalah.map((s) => (
                    <li key={s.soal.id}>
                      <button type="button" onClick={() => setLembar({ jenis: "soal", soal: s.soal.id, akun: null })} className="flex min-h-[40px] w-full items-center gap-2 text-left">
                        <span className="flex-none rounded-full bg-[#FDE8E8] px-2 py-0.5 text-[11px] font-extrabold text-[#B42329]">{s.jumlahSalah} salah</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#1B2B4B]">
                          <span className="mr-1 text-[11px] font-extrabold text-[#6B7A90]">{s.soal.id}</span>
                          {s.soal.pertanyaan}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              t.terjawab > 0 && <p className="border-t border-[#EEF2F7] pt-1.5 text-[12px] font-bold text-[#13794B]">Tidak ada jawaban salah.</p>
            )}
          </section>
        ))}

      {tampil === "matriks" && R.terjawab > 0 && (
        <MatriksQc
          hasil={hf}
          hanyaSalah={hanyaSalah}
          onHanyaSalah={setHanyaSalah}
          aktif={aktifMatriks}
          onSoal={(soal) => setLembar({ jenis: "soal", soal, akun: null })}
          onSel={(soal, akun) => setLembar({ jenis: "soal", soal, akun })}
          onKolom={(akun) => setLembar({ jenis: "petugas", akun })}
        />
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-[#6B7A90]">Data per {ket}. Hanya-baca.</p>
        <button type="button" onClick={() => void muat()} disabled={sibuk} className="min-h-[40px] rounded-full px-3 text-[12px] font-extrabold text-[#1F5FD1] disabled:opacity-50">
          {sibuk ? "Memuat…" : "Muat ulang"}
        </button>
      </div>
      {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

      {barisSoal && (
        <LembarBawah judul={`Soal ${barisSoal.soal.id}${petugasLembar ? ` · ${namaSingkatTampil(petugasLembar.nama)}` : ""}`} onTutup={tutup}>
          <IsiSoal baris={barisSoal} kolom={semuaKolom} sorotAkun={lembar?.jenis === "soal" ? lembar.akun : null} />
        </LembarBawah>
      )}
      {lembar?.jenis === "petugas" && rincian && (
        <LembarBawah judul={`Rincian ${petugasLembar ? namaSingkatTampil(petugasLembar.nama) : "petugas"}`} onTutup={tutup}>
          <IsiPetugas r={rincian} />
        </LembarBawah>
      )}
    </div>
  );
}
