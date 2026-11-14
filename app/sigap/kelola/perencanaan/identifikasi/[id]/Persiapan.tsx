"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/Persiapan.tsx
//
// (1 Nov 2026, keputusan user) Tahap 5 "Persiapan pelatihan" dan tahap 6 "Persiapan pendataan" (sebelum 6 Nov 2026: tahap 4 dan 5) pada alur Identifikasi survei. Halaman ini MENARIK data dari
// identifikasi (formulir awal yang sah) dan merangkumnya; rinciannya kelak dikerjakan di menu Pelatihan dan menu Pendataan, yang membaca data dari sini.
// Hanya-baca: tidak ada yang ditulis, tidak ada yang memblokir. Logika ringkasan dan daftar periksa: lib/keu/persiapanHilir.ts.

import { useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat, judulKartu, kartu } from "@/app/sigap/keu-ui";
import { NavAlur, PenunjukAlur } from "@/app/sigap/kelola/AlurKelola";
import { alurIdentifikasi, posisiAlur } from "@/lib/alurKelola";
import { normalisasi, tglIndo } from "@/lib/keu/identifikasi";
import { NAMA_FUNGSI } from "@/lib/keu/pelaksanaan";
import { peringatanDariPeriksa, periksaPelatihan, periksaPendataan, ringkasPelatihan, ringkasPendataan, type PeriksaButir, type RingkasPeran } from "@/lib/keu/persiapanHilir";
import LencanaNotif from "../../notifikasi/LencanaNotif";
import { useIdent } from "../useIdent";
import { usePelaksanaan } from "./pelaksanaan/usePelaksanaan";
import type { BarisLanjutan } from "./lanjutan/useLanjutan";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";
import { urlBaca } from "@/lib/keu/ro";
import { normalisasiLanjutan } from "@/lib/keu/lanjutan";
import { keadaanButir, LABEL_BUTIR, WAKTU_BELAJAR, type BarisBelajar } from "@/lib/belajarAturan";
import LembarKomponen from "./LembarKomponen";
import AngkaRujukan from "./AngkaRujukan"; // (14 Nov 2026, Fase 3)

const LINK = "font-semibold text-[#1F5FD1] underline";

function TabelPeran({ peran, kosong }: { peran: RingkasPeran[]; kosong: string }) {
  if (peran.length === 0) return <p className="m-0 text-[13px] text-[#5B6B84]">{kosong}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] font-bold uppercase tracking-[.3px] text-[#5B6B84]">
            <th className="py-1.5 pr-3">Peran</th>
            <th className="py-1.5 pr-3 text-right">Organik</th>
            <th className="py-1.5 pr-3 text-right">Mitra</th>
            <th className="py-1.5 pr-3 text-right">Jumlah</th>
            <th className="py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {peran.map((p) => (
            <tr key={p.id} className="border-t border-[#EEF1F6]">
              <td className="py-1.5 pr-3 font-semibold text-[#0F2A52]">{p.nama}</td>
              <td className="py-1.5 pr-3 text-right">{p.organik}</td>
              <td className="py-1.5 pr-3 text-right">{p.mitra}</td>
              <td className="py-1.5 pr-3 text-right font-bold">{p.jumlah}</td>
              <td className="py-1.5 text-[#44546F]">{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Periksa({ butir }: { butir: PeriksaButir[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {butir.map((b) => (
        <li key={b.kode} className="flex items-start gap-2 text-[13px] text-[#1B2B4B]">
          <Chip warna={b.beres ? "hijau" : "kuning"}>{b.beres ? "Beres" : "Belum"}</Chip>
          <span className="min-w-0">
            {b.teks}
            {!b.beres && b.catatan ? <span className="text-[#5B6B84]"> — {b.catatan}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Bagian({ judul, ket, children }: { judul: string; ket?: string; children: ReactNode }) {
  return (
    <section className={`${kartu} flex flex-col gap-2.5`}>
      <div>
        <h2 className={`${judulKartu} m-0`}>{judul}</h2>
        {ket && <p className="m-0 mt-0.5 text-[12.5px] text-[#5B6B84]">{ket}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Persiapan({ jenis }: { jenis: "pelatihan" | "pendataan" }) {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const ident = useIdent(id);
  const pl = usePelaksanaan(id);
  const row = ident.row;
  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const pelatihan = jenis === "pelatihan";
  // (13 Nov 2026, Fase 0 butir 3) jumlah petugas dari identifikasi lanjutan versi Final (versi yang dipakai hilir); formulir awal hanya cadangan.
  // Hanya satu bacaan ringan (bukan useLanjutan yang ikut memuat daftar mitra); aturan versi hilir sama dengan useLanjutan.rowHilir.
  const ljBaca = useBacaKeu<BarisLanjutan>(id ? urlBaca("keu_v_ident_lanjutan", { ident_id: id }, { batas: 1 }) : null);
  const ljRow = ljBaca.baris?.[0] ?? null;
  const ljHilir = useMemo(() => (ljRow && ljRow.ver_hilir != null && ljRow.isi_hilir != null ? { ver: ljRow.ver_hilir, status: ljRow.status_hilir ?? ljRow.status, isi: ljRow.isi_hilir } : ljRow), [ljRow]);
  const lanjutanFinal = useMemo(() => (ljHilir && ljHilir.status === "final" ? normalisasiLanjutan(ljHilir.isi) : null), [ljHilir]);
  const sumberPeran = lanjutanFinal && ljHilir ? `identifikasi lanjutan versi ${ljHilir.ver} (Final)` : "identifikasi awal (lanjutan belum Final)";

  // (13 Nov 2026, B) aturan belajar dan mutu dari sumber tunggal (kegiatan tertaut), hanya baca
  const belajar = useBacaKeu<BarisBelajar & { ident_id: number; kegiatan_nama: string }>(id ? urlBaca("keu_v_ident_belajar", { ident_id: id }, { batas: 200 }) : null);
  const waktuIni = jenis === "pelatihan" ? ["pra_pelatihan", "saat_pelatihan"] : ["saat_pendataan"];
  const belajarIni = (belajar.baris ?? []).filter((b) => waktuIni.includes(b.waktu));

  const ringPel = useMemo(() => (formSah ? ringkasPelatihan(formSah, lanjutanFinal) : null), [formSah, lanjutanFinal]);
  const ringDat = useMemo(
    () => (formSah && row ? ringkasPendataan(formSah, row.tahun, (row.upd ?? null) as Record<string, { mulai: string; selesai: string }> | null, lanjutanFinal) : null),
    [formSah, row, lanjutanFinal],
  );
  const fungsi = pelatihan ? "pelatihan" : "pendataan";
  const tertautFungsi = useMemo(() => pl.tertaut.filter((t) => t.fungsi === fungsi), [pl.tertaut, fungsi]);
  const butir = useMemo<PeriksaButir[]>(() => {
    if (pelatihan) return ringPel ? periksaPelatihan(ringPel, pl.tertaut) : [];
    return ringDat ? periksaPendataan(ringDat, pl.tertaut) : [];
  }, [pelatihan, ringPel, ringDat, pl.tertaut]);

  const posisi = id === null ? null : posisiAlur(alurIdentifikasi(id), jenis);
  const siap = !!row && !!formSah && !pl.memuat && (ljBaca.baris !== null || ljBaca.galat !== null || id === null);
  const dasar = id === null ? "/sigap/kelola/perencanaan/identifikasi" : `/sigap/kelola/perencanaan/identifikasi/${id}`;
  const menu = pelatihan ? { href: "/sigap/kelola/pelatihan", nama: "Pelatihan" } : { href: "/sigap/kelola/pendataan", nama: "Pendataan" };
  const judulHalaman = pelatihan ? "Persiapan pelatihan" : "Persiapan pendataan";

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil={`SIGAP · ${judulHalaman}`}
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", judulHalaman]}
      judul={row ? <>{judulHalaman}: {row.nama}</> : judulHalaman}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      atas={<PenunjukAlur posisi={posisi} nama="Alur identifikasi survei" />}
      bawah={<NavAlur posisi={posisi} peringatan={siap ? peringatanDariPeriksa(butir) : null} />}
      kembali={{ induk: pelatihan ? `${dasar}/kebutuhan` : `${dasar}/pelatihan`, label: pelatihan ? "Rekrutmen dan pengadaan" : "Persiapan pelatihan" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={ident.galat ?? pl.galat} />
        {(ident.memuat || pl.memuat) && <Memuat tinggi="h-48" />}
        {row && row.ver < 1 && !ident.memuat && <Catatan>Identifikasi awal belum disahkan. Ringkasan ini terisi sesudah identifikasi awal disahkan.</Catatan>}
        {row && row.status === "dibatalkan" && <Catatan>Identifikasi ini dibatalkan; halaman hanya dapat dibaca.</Catatan>}

        {siap && (
          <>
            <Catatan>
              Tahap ini hanya merangkum data dari identifikasi. Rinciannya dikerjakan di menu <b>{menu.nama}</b>, dan menu itu menarik datanya dari sini.{" "}
              <Link href={menu.href} className={LINK}>Buka menu {menu.nama} →</Link>
            </Catatan>

            {pelatihan && ringPel && (
              <>
                <Bagian judul="Sesi yang direncanakan" ket="Briefing dan pelatihan menurut identifikasi awal.">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {ringPel.sesi.map((s) => (
                      <div key={s.kode} className="rounded-lg border border-[#DCE3EE] bg-[#F7F9FD] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <b className="text-[14px] text-[#0F2A52]">{s.nama}</b>
                          <Chip warna={s.aktif ? "hijau" : "abu"}>{s.aktif ? "Direncanakan" : "Tidak ada"}</Chip>
                        </div>
                        {s.aktif && (
                          <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                            <dt className="text-[#5B6B84]">Bentuk</dt><dd className="m-0">{s.bentuk}</dd>
                            <dt className="text-[#5B6B84]">Tempat</dt><dd className="m-0">{s.tempat}</dd>
                            <dt className="text-[#5B6B84]">Instruktur</dt>
                            <dd className="m-0">
                              {s.pengajar ? `${s.instruktur.jumlah} orang · ${s.instruktur.level || "level belum dipilih"} · ${s.instruktur.jam} jam` : "tanpa honor pengajar"}
                              {s.pengajar && !s.instruktur.lengkap ? <span className="text-[#8A6200]"> (belum lengkap)</span> : null}
                            </dd>
                          </dl>
                        )}
                      </div>
                    ))}
                  </div>
                </Bagian>
                <Bagian judul="Peserta menurut peran" ket={`Total ${ringPel.totalPeserta} petugas, menurut ${sumberPeran}.`}>
                  <TabelPeran peran={ringPel.peran} kosong="Belum ada peran yang dinyalakan pada identifikasi." />
                </Bagian>
              </>
            )}

            {!pelatihan && ringDat && (
              <>
                <Bagian judul="Instrumen dan jadwal pendataan">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Chip warna={ringDat.ada ? "biru" : "abu"}>{ringDat.instrumen}</Chip>
                    {ringDat.ada && ringDat.cetakPapi && <Chip warna="kuning">Cetak kuesioner PAPI</Chip>}
                    <Chip warna={ringDat.rapatPersiapan ? "hijau" : "abu"}>{ringDat.rapatPersiapan ? "Ada rapat persiapan" : "Tanpa rapat persiapan"}</Chip>
                  </div>
                  {ringDat.ada ? (
                    ringDat.jadwal.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[320px] border-collapse text-[13px]">
                          <thead>
                            <tr className="text-left text-[11.5px] font-bold uppercase tracking-[.3px] text-[#5B6B84]">
                              <th className="py-1.5 pr-3">Periode</th>
                              <th className="py-1.5 pr-3">Mulai</th>
                              <th className="py-1.5">Selesai</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ringDat.jadwal.map((j) => (
                              <tr key={j.periode} className="border-t border-[#EEF1F6]">
                                <td className="py-1.5 pr-3 font-semibold text-[#0F2A52]">{j.periode}</td>
                                <td className="py-1.5 pr-3">{tglIndo(j.mulai)}</td>
                                <td className="py-1.5">{tglIndo(j.selesai)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="m-0 text-[13px] text-[#5B6B84]">Jadwal pendataan belum terhitung.</p>
                    )
                  ) : (
                    <p className="m-0 text-[13px] text-[#5B6B84]">Identifikasi menyatakan tanpa pendataan.</p>
                  )}
                </Bagian>
                {ringDat.ada && (
                  <Bagian judul="Petugas lapangan menurut peran" ket={`Total ${ringDat.totalLapangan} petugas, menurut ${sumberPeran}. Penugasan diisi di halaman Pelaksanaan.`}>
                    <TabelPeran peran={ringDat.lapangan} kosong="Belum ada peran lapangan yang dinyalakan pada identifikasi." />
                  </Bagian>
                )}
              </>
            )}

            <Bagian judul="Kegiatan belajar dan mutu" ket="Aturan per waktu dari kegiatan tertaut (sumber tunggal; diatur di Kelola Pelatihan > Materi & Penilaian > Belajar dan mutu, atau Kelola Pendataan > Persiapan).">
              {belajarIni.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada aturan untuk waktu ini.</p> : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {WAKTU_BELAJAR.filter((w) => waktuIni.includes(w.kode)).flatMap((w) => belajarIni.filter((b) => b.waktu === w.kode).map((b) => {
                    const k = keadaanButir(b);
                    return (
                      <li key={`${b.kegiatan_id}-${b.waktu}-${b.butir}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <Chip warna={k.warna}>{k.teks}</Chip>
                        <span className="min-w-0"><b className="text-[#0F2A52]">{w.label}:</b> {LABEL_BUTIR[b.butir]}{b.tenggat ? ` · tenggat ${tglIndo(b.tenggat)}` : ""}
                          {b.batal_at && <span className="text-[#7A1D22]"> — {b.batal_alasan}</span>}</span>
                      </li>
                    );
                  }))}
                </ul>
              )}
            </Bagian>

            {/* (14 Nov 2026, Fase 2d) lembar komponen teknis, dibaca dari pengaturan Kelola yang sama */}
            {id !== null && <LembarKomponen identId={id} fungsi={fungsi} belajar={belajar.baris ?? []} />}

            {/* (14 Nov 2026, Fase 3) angka rujukan satu sumber; hari dibayar dibandingkan dengan batas hari kerja penugasan */}
            {id !== null && !pelatihan && (
              <AngkaRujukan
                identId={id}
                isi={lanjutanFinal}
                ver={ljHilir?.ver ?? null}
                status={ljHilir?.status ?? null}
                tanggal={ringDat?.jadwal.length ? ringDat.jadwal.map((j) => `${j.periode}: ${tglIndo(j.mulai)} s.d. ${tglIndo(j.selesai)}`).join(" · ") : undefined}
                pulsaCetak={formSah ? [formSah.pulsaLap ? "pulsa lapangan" : null, formSah.cetakPapi ? "cetak PAPI di kabupaten" : null].filter(Boolean).join(", ") || "tidak ada" : undefined}
              />
            )}

            <Bagian judul={`Kegiatan SIGAP tertaut (${NAMA_FUNGSI[fungsi]})`} ket="Kegiatan di SIGAP yang menjalankan tahap ini; ditautkan di halaman Pelaksanaan.">
              {tertautFungsi.length === 0 ? (
                <Kosong teks="Belum ada kegiatan yang ditautkan untuk fungsi ini." />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {tertautFungsi.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DCE3EE] px-3 py-2 text-[13px]">
                      <span className="min-w-0">
                        <b className="text-[#0F2A52]">{t.nama}</b> <span className="text-[#5B6B84]">· {t.kode}</span>
                      </span>
                      <Chip warna={t.n_penugasan > 0 ? "hijau" : "kuning"}>{t.n_penugasan} penugasan</Chip>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 text-[12.5px]">
                <Link href={`${dasar}/pelaksanaan`} className={LINK}>Tautkan kegiatan dan terapkan usulan penugasan (halaman Pelaksanaan) →</Link>
              </p>
            </Bagian>

            <Bagian judul="Daftar periksa tahap ini" ket="Saran saja; tidak menghalangi Anda lanjut ke tahap berikutnya.">
              <Periksa butir={butir} />
            </Bagian>
          </>
        )}
        {!ident.memuat && !row && id !== null && !ident.galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}
