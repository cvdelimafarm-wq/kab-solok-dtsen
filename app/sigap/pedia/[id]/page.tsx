"use client";

// app/sigap/pedia/[id]/page.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- halaman detail entri (mode baca pegawai) -- permintaan user: pertanyaan,
// jawaban, kesimpulan, dasar hukum (dgn status regulasi), entri terkait. Bukti asli hanya utk pengelola.

import Link from "next/link";
import { use as usePromise, useEffect, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, Memuat, Pesan } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import { ambilP } from "../api";
import { BadgeSifat, BadgeTinjau, BlokTeks, DasarHukum, KartuEntri, type Detail } from "../komponen";
import { JENIS_FILE, KANAL, STATUS, tanggalIndo, waktuWibPanjang } from "@/lib/pedia/umum";

export default function DetailPedia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [d, setD] = useState<Detail | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    ambilP<Detail>({ bagian: "detail", id })
      .then(setD)
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, [id]);

  const e = d?.entri;
  return (
    <Bingkai
      aktif="pedia"
      kecil="SIGAP · SIGAP PEDIA"
      jejak={["SIGAP PEDIA", e?.nomor_registrasi ?? "…"]}
      judul={e?.judul ?? "Memuat…"}
      sub={e ? `${e.nomor_registrasi} · ${d?.kategori ? `${d.kategori.kode} ${d.kategori.nama}` : ""}` : undefined}
      kanan={(gelap) => (
        <>
          <Link href="/sigap/pedia" className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN_O}>
            ← SIGAP PEDIA
          </Link>
          {d?.kelola && (
            <Link href={`/sigap/kelola/pedia/${id}`} className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN}>
              Kelola & bukti
            </Link>
          )}
        </>
      )}
    >
      {galat && <Pesan>{galat}</Pesan>}
      {!d || !e ? (
        !galat && <Memuat />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            {d.digantikan_oleh.length > 0 && (
              <Pesan jenis="peringatan">
                Entri ini sudah <b>digantikan oleh</b>{" "}
                {d.digantikan_oleh.map((g) => (
                  <Link key={g.id} href={`/sigap/pedia/${g.id}`} className="font-semibold underline">
                    {g.nomor_registrasi}
                  </Link>
                ))}
                . Gunakan entri terbaru sebagai rujukan.
              </Pesan>
            )}
            {e.status === "dibatalkan" && <Pesan>Entri ini dibatalkan: {e.dibatalkan_alasan}</Pesan>}
            {e.perlu_ditinjau && (
              <Pesan jenis="galat">
                <b>Perlu ditinjau.</b> {e.alasan_tinjau ?? "Regulasi rujukan berubah/dicabut."} Pastikan jawaban masih berlaku sebelum dipakai.
              </Pesan>
            )}
            <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <BadgeSifat sifat={e.sifat} />
                <Chip w={STATUS[e.status]?.w ?? "mut"}>{STATUS[e.status]?.label ?? e.status}</Chip>
                {e.perlu_ditinjau && <BadgeTinjau alasan={e.alasan_tinjau} />}
              </div>
              <h1 className="mt-2 text-[19px] font-bold leading-snug lg:hidden">{e.judul}</h1>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-[#7B8794]">Kanal</dt>
                  <dd>
                    {KANAL[e.kanal] ?? e.kanal}
                    {e.kanal_lain ? ` — ${e.kanal_lain}` : ""}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-[#7B8794]">No. tiket/surat</dt>
                  <dd className="font-mono">{e.nomor_tiket ?? "–"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-[#7B8794]">Diajukan</dt>
                  <dd>{tanggalIndo(e.tgl_diajukan)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-[#7B8794]">Dijawab</dt>
                  <dd>{tanggalIndo(e.tgl_dijawab)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-[#7B8794]">Kategori</dt>
                  <dd>
                    {d.induk ? `${d.induk.kode} › ` : ""}
                    {d.kategori ? `${d.kategori.kode} ${d.kategori.nama}` : "–"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-[#7B8794]">Penanya / tim</dt>
                  <dd>
                    {e.penanya_nama ?? "–"}
                    {e.tim ? ` / ${e.tim}` : ""}
                  </dd>
                </div>
                {(e.nota_dinas_srikandi || e.keputusan_ppk) && (
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="w-32 shrink-0 text-[#7B8794]">Tindak lanjut</dt>
                    <dd>
                      {e.nota_dinas_srikandi ? `Nota Dinas ${e.nota_dinas_srikandi}` : ""}
                      {e.keputusan_ppk ? ` · Keputusan PPK ${e.keputusan_ppk}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <BlokTeks judul="Kesimpulan praktis" isi={e.kesimpulan} sorot />
            <BlokTeks judul="Pertanyaan" isi={e.pertanyaan} />
            <BlokTeks judul="Jawaban" isi={e.jawaban} />
            <DasarHukum regulasi={d.regulasi} />
          </div>
          <aside className="space-y-3">
            {d.tag.length > 0 && (
              <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
                <h2 className="text-[13px] font-semibold text-[#4D5B6B]">Tag</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {d.tag.map((t) => (
                    <Link key={t} href={`/sigap/pedia?tag=${encodeURIComponent(t)}`} className="rounded-full bg-[#F3F5F8] px-2.5 py-0.5 text-[12px] text-[#4D5B6B] hover:bg-[#E3EEFB] hover:text-[#1F6FD1]">
                      #{t}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
              <h2 className="text-[13px] font-semibold text-[#4D5B6B]">Bukti tersimpan</h2>
              {d.file.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-[#7B8794]">Belum ada file bukti.</p>
              ) : (
                <ul className="mt-1.5 space-y-1 text-[12.5px]">
                  {d.file.map((f) => (
                    <li key={String(f.id)} className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate" title={String(f.nama_asli)}>
                        {JENIS_FILE[String(f.jenis)]?.split(" (")[0] ?? String(f.jenis)}
                      </span>
                      {f.tsa_status === "ok" ? <Chip w="ok">Timestamp ✔</Chip> : <Chip w="wait">Timestamp tertunda</Chip>}
                      {(f.status ?? (f.dkim as { status?: string } | null)?.status) ? (
                        <Chip w={(f.status ?? (f.dkim as { status?: string }).status) === "pass" ? "ok" : "bad"}>DKIM {(String(f.status ?? (f.dkim as { status?: string }).status)).toUpperCase()}</Chip>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {!d.kelola && <p className="mt-2 text-[11.5px] text-[#7B8794]">File asli hanya dapat diunduh pengelola (Admin Anggaran).</p>}
            </section>
            {d.tautan.length > 0 && (
              <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
                <h2 className="text-[13px] font-semibold text-[#4D5B6B]">Terkait kegiatan / SPJ</h2>
                <ul className="mt-1.5 space-y-1 text-[12.5px]">
                  {d.tautan.map((t) => (
                    <li key={t.id}>{t.href ? <Link href={t.href} className="text-[#1F6FD1] hover:underline">{t.label}</Link> : t.label}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4 text-[12px] text-[#7B8794]">
              Dicatat {waktuWibPanjang(e.dibuat_at)}
              {e.dibuat_oleh ? ` oleh ${e.dibuat_oleh}` : ""}.
              {e.difinalkan_at && ` Difinalkan ${waktuWibPanjang(e.difinalkan_at)}${e.difinalkan_oleh ? ` oleh ${e.difinalkan_oleh}` : ""}.`}
              {d.menggantikan && (
                <>
                  {" "}
                  Menggantikan{" "}
                  <Link href={`/sigap/pedia/${d.menggantikan.id}`} className="text-[#1F6FD1] underline">
                    {d.menggantikan.nomor_registrasi}
                  </Link>
                  .
                </>
              )}
            </section>
          </aside>
          {d.terkait.length > 0 && (
            <section className="space-y-2.5 lg:col-span-2">
              <h2 className="text-[15px] font-semibold">Entri terkait</h2>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {d.terkait.map((t) => (
                  <KartuEntri key={t.id} e={t} href={`/sigap/pedia/${t.id}`} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Bingkai>
  );
}
