"use client";

// app/sigap/revisi/buku/page.tsx
//
// (25 Okt 2026, tahap 23) Buku selisih seluruh Satker: catatan kekurangan RAB yang masih terbuka dari semua RO, dikelompokkan per kelompok belanja,
// prioritas, dan RO (papan 15 tingkat Satker). Hanya baca; mencatat dan memutuskan tetap di tab Kekurangan RAB tiap RO. Logika: lib/keu/bukuselisih.ts.

import Link from "next/link";
import { useMemo, useState } from "react";
import { KELOMPOK_BUKU, ringkasBuku, type CatatanKek } from "@/lib/keu/bukuselisih";
import { angka, rupiah, STATUS_KEK, urlBaca } from "@/lib/keu/ro";
import { useBacaKeu } from "../../ro/useKeu";
import { Chip, Galat, HalamanKeu, judulKartu, kartu, kisi, Kosong, Kpi, Memuat, Potong, Tenang, tombolAktif, tombolKecil } from "../../keu-ui";

const KOLOM = ["id", "ro_kode", "kro_kode", "akun_kode", "kelompok_kode", "uraian", "jumlah", "prioritas_kode", "prioritas_nama", "prioritas_urut", "status", "terbuka", "kali_ditunda"];
const WARNA = { inti: "merah", penting: "kuning", tunda: "abu" } as const;

export default function Halaman() {
  const [kelompok, setKelompok] = useState("");
  const [prioritas, setPrioritas] = useState("");
  const data = useBacaKeu<CatatanKek>(urlBaca("keu_v_kekurangan", {}, { urut: "prioritas_urut", batas: 2000, kolom: KOLOM }));
  const semua = useMemo(() => (data.baris ? ringkasBuku(data.baris) : null), [data.baris]);
  const r = useMemo(() => (data.baris ? ringkasBuku(data.baris, { kelompok, prioritas }) : null), [data.baris, kelompok, prioritas]);

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "Buku selisih Satker" }]}
      judul="Buku selisih seluruh Satker" induk="/sigap/revisi" labelKembali="Jadwal revisi"
      sub="Kekurangan RAB yang masih terbuka dari semua RO. Mencatat dan memutuskan dilakukan di tab Kekurangan RAB tiap RO."
    >
      <Tenang>Angka di sini adalah catatan kekurangan yang dibuat ketua tim atau admin RO (papan 15). Selisih turunan RAB dikurangi POK per KRO ada di <Link href="/sigap/revisi/peta" className="font-semibold text-[#1F5FD1] underline">Peta KRO Satker</Link>. Keputusan PPK atas kekurangan pagu KRO dibuat di papan itu, bukan di sini.</Tenang>
      <Galat pesan={data.galat} />
      {data.memuat && <Memuat />}
      {semua && r && (
        <>
          <div className={kisi}>
            <Kpi label="Kekurangan terbuka" nilai={rupiah(semua.total)} sub={`${angka(semua.nCatatan)} catatan`} warna={semua.total > 0 ? "mr" : "hj"} />
            <Kpi label="RO yang punya catatan" nilai={angka(semua.nRo)} />
            <Kpi label="Pernah ditunda" nilai={angka(semua.nDitunda)} sub="catatan terbuka" warna={semua.nDitunda > 0 ? "kn" : undefined} />
            <Kpi label="Prioritas Inti" nilai={rupiah(semua.perPrioritas.find((p) => p.kode === "inti")?.jumlah ?? 0)} sub="didahulukan" />
          </div>

          <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="buku-saring">
            <h2 id="buku-saring" className={judulKartu}>Per kelompok belanja</h2>
            <div className={kisi}>
              {semua.perKelompok.map((k) => (
                <button key={k.kode} type="button" aria-pressed={kelompok === k.kode} onClick={() => setKelompok(kelompok === k.kode ? "" : k.kode)} className={`${kelompok === k.kode ? tombolAktif : tombolKecil} !h-auto !min-h-[64px] flex-col items-start py-2 text-left`}>
                  <span className="text-[12px]">{k.nama}</span>
                  <span className="text-[15px] font-extrabold">{rupiah(k.jumlah)}</span>
                  <span className="text-[11.5px] font-normal opacity-80">{k.n} catatan</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-[#5B6B84]">Prioritas:</span>
              <button type="button" aria-pressed={prioritas === ""} onClick={() => setPrioritas("")} className={prioritas === "" ? tombolAktif : tombolKecil}>Semua</button>
              {semua.perPrioritas.map((p) => (
                <button key={p.kode} type="button" aria-pressed={prioritas === p.kode} onClick={() => setPrioritas(prioritas === p.kode ? "" : p.kode)} className={prioritas === p.kode ? tombolAktif : tombolKecil}>{p.nama} ({p.n})</button>
              ))}
              {(kelompok || prioritas) && <button type="button" onClick={() => { setKelompok(""); setPrioritas(""); }} className={tombolKecil}>Hapus penyaring</button>}
            </div>
          </section>

          <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="buku-ro">
            <h2 id="buku-ro" className={judulKartu}>Per RO <span className="text-[13px] font-normal text-[#5B6B84]">({r.nRo} RO, {rupiah(r.total)})</span></h2>
            {data.terpotong && <Potong />}
            {r.perRo.length === 0 && <Kosong teks={semua.nCatatan === 0 ? "Belum ada kekurangan RAB yang tercatat terbuka." : "Tidak ada catatan yang cocok dengan penyaring."} />}
            {r.perRo.map((x) => (
              <div key={x.ro} className="min-w-0 rounded-lg border border-[#DCE3EE]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF2F7] bg-[#F7F9FD] px-3 py-2">
                  <Link href={`/sigap/ro/${encodeURIComponent(x.ro)}?tab=kekurangan&dari=${encodeURIComponent("/sigap/revisi/buku")}`} className="font-mono text-[13.5px] font-bold text-[#1F5FD1]">{x.ro}</Link>
                  <span className="text-[13px] font-semibold text-[#0F2A52]">{rupiah(x.jumlah)} <span className="font-normal text-[#5B6B84]">({x.n} catatan{x.inti > 0 ? `, Inti ${rupiah(x.inti)}` : ""})</span></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[12.5px]">
                    <thead className="text-[#44546F]"><tr><th className="px-3 py-1.5">Akun</th><th className="px-3 py-1.5">Uraian</th><th className="px-3 py-1.5">Kel.</th><th className="px-3 py-1.5">Prioritas</th><th className="px-3 py-1.5">Status</th><th className="px-3 py-1.5 text-right">Jumlah</th></tr></thead>
                    <tbody>
                      {x.baris.map((b) => (
                        <tr key={b.id} className="border-t border-[#EEF2F7] align-top">
                          <td className="px-3 py-1.5 font-mono">{b.akun_kode}</td>
                          <td className="px-3 py-1.5">{b.uraian}</td>
                          <td className="px-3 py-1.5">{KELOMPOK_BUKU.find((k) => k.kode === b.kelompok_kode)?.kode ?? "-"}</td>
                          <td className="px-3 py-1.5"><Chip warna={WARNA[b.prioritas_kode as keyof typeof WARNA] ?? "abu"}>{b.prioritas_nama ?? b.prioritas_kode}</Chip></td>
                          <td className="px-3 py-1.5">{STATUS_KEK[b.status] ?? b.status}{Number(b.kali_ditunda) > 0 ? ` (ditunda ${Number(b.kali_ditunda)}x)` : ""}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">{angka(b.jumlah)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </HalamanKeu>
  );
}
