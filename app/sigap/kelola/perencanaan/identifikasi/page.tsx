"use client";

// app/sigap/kelola/perencanaan/identifikasi/page.tsx
//
// (25 Okt 2026) Daftar survei yang diidentifikasi (tahap awal GSBPM). Semua pegawai organik boleh melihat; menyusun, mengirim, dan menyetujui mengikuti
// hak (ketua tim, admin RO, PPK; persetujuan PPK dan Tata Usaha paralel, KPA terakhir) yang ditegakkan basis data.

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat, judulKartu, kartu, kolom, label, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu } from "@/app/sigap/ro/useKeu";
import { awalForm, normalisasi } from "@/lib/keu/identifikasi";
import { barisH15, labelStatus, type UpdTercatat } from "@/lib/keu/identifikasiHilir";
import { hariIniWib, useDaftarIdent, useDaftarRo, type BarisDaftar } from "./useIdent";

const URUT_STATUS: Record<string, number> = { menunggu_ketua: 0, menunggu_setuju: 0, draf: 1, revisi: 1, sah: 2, dibatalkan: 3 };

function jatuhTempo(b: BarisDaftar, hariIni: string): number {
  if (!b.form_sah) return 0;
  const f = normalisasi(b.form_sah);
  return barisH15(f, b.tahun, (b.upd ?? null) as Record<string, UpdTercatat> | null, hariIni).filter((x) => x.status.startsWith("Jatuh tempo") || x.status === "Terlambat").length;
}

function Isi() {
  const router = useRouter();
  const daftar = useDaftarIdent();
  const ros = useDaftarRo();
  const [roFilter, setRoFilter] = useState("");
  const [roBaru, setRoBaru] = useState("");
  const [namaBaru, setNamaBaru] = useState("");
  const [membuat, setMembuat] = useState(false);
  const [galatBuat, setGalatBuat] = useState<string | null>(null);
  const hariIni = hariIniWib();

  const roAktif = (ros.baris ?? []).filter((r) => r.aktif);
  const namaRo = useMemo(() => new Map((ros.baris ?? []).map((r) => [r.kode, r.nama])), [ros.baris]);
  const baris = useMemo(
    () => (daftar.baris ?? []).filter((b) => b.status !== "dibatalkan" && (!roFilter || b.ro_kode === roFilter))
      .sort((a, b) => (URUT_STATUS[a.status] ?? 9) - (URUT_STATUS[b.status] ?? 9) || a.ro_kode.localeCompare(b.ro_kode) || a.nama.localeCompare(b.nama)),
    [daftar.baris, roFilter],
  );

  async function buat() {
    setGalatBuat(null);
    const nama = namaBaru.trim();
    if (!roBaru) return setGalatBuat("Pilih RO untuk survei ini.");
    if (nama.length < 3) return setGalatBuat("Nama survei minimal 3 huruf.");
    setMembuat(true);
    const form = { ...awalForm(), nama };
    const r = await aksiKeu<number | string>("keu_ident_buat", { p_ro: roBaru, p_form: form });
    setMembuat(false);
    if (!r.ok) return setGalatBuat(r.pesan);
    const id = Number(r.data);
    await daftar.muat();
    if (Number.isFinite(id)) router.push(`/sigap/kelola/perencanaan/identifikasi/${id}`);
  }

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Identifikasi survei"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei"]}
      judul="Identifikasi survei"
      sub="Jawab sekali di sini. Jadwal, petugas, kebutuhan anggaran, agenda Delego, evaluasi, dan rekrutmen mengikuti jawaban yang sudah disahkan (identifikasi awal, lalu versi terupdate)."
      kembali={{ induk: "/sigap", label: "Beranda SIGAP" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        <Galat pesan={daftar.galat ?? ros.galat} />
        <Catatan>
          <ul className="m-0 list-disc space-y-1 pl-5">
            <li>Identifikasi dikirim oleh ketua tim, admin RO, atau PPK.</li>
            <li>PPK dan Tata Usaha menyetujui secara paralel, lalu KPA mengesahkan.</li>
            <li>Semua identifikasi wajib selesai paling lambat H-15.</li>
            <li>Perubahan sesudah disahkan lewat pengajuan revisi yang disetujui seperti identifikasi awal.</li>
            <li>Revisi yang dikirim sesudah H-15 cukup disetujui KPA dan dicatat untuk evaluasi.</li>
            <li>Templat susunan tim dan batas anggaran mengikuti <Link href="/sigap/kelola/perencanaan/kebijakan" className="font-semibold text-[#1F5FD1] underline decoration-dotted underline-offset-[3px]">lembar kebijakan manajemen tim →</Link></li>
          </ul>
        </Catatan>

        <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="h-baru">
          <h2 id="h-baru" className={`${judulKartu} m-0`}>Survei baru</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            <div>
              <label htmlFor="ro-baru" className={label}>Rincian Output (RO)</label>
              <select id="ro-baru" className={kolom} value={roBaru} onChange={(e) => setRoBaru(e.target.value)}>
                <option value="">Pilih RO…</option>
                {roAktif.map((r) => <option key={r.kode} value={r.kode}>{r.kode} {r.nama.slice(0, 60)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nama-baru" className={label}>Nama survei</label>
              <input id="nama-baru" className={kolom} value={namaBaru} maxLength={150} onChange={(e) => setNamaBaru(e.target.value)} placeholder="mis. Seruti Triwulan I 2026" />
            </div>
            <div className="flex items-end"><button type="button" className={tombolUtama} disabled={membuat} onClick={() => void buat()}>{membuat ? "Membuat…" : "Buat draf"}</button></div>
          </div>
          <Galat pesan={galatBuat} />
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="h-daftar">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="h-daftar" className={`${judulKartu} m-0`}>Daftar survei</h2>
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="ro-filter" className="text-[12px] text-[#5B6B84]">Saring RO</label>
              <select id="ro-filter" className={`${kolom} !w-auto max-w-full`} value={roFilter} onChange={(e) => setRoFilter(e.target.value)}>
                <option value="">Semua RO</option>
                {roAktif.map((r) => <option key={r.kode} value={r.kode}>{r.kode}</option>)}
              </select>
            </div>
          </div>
          {!daftar.baris && !daftar.galat && <Memuat />}
          {daftar.baris && baris.length === 0 && <Kosong teks="Belum ada survei yang diidentifikasi. Buat draf pertama di atas." />}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {baris.map((b) => {
              const st = labelStatus({ ...b, kembali_oleh: null, catatan_kembali: "" });
              const nTempo = jatuhTempo(b, hariIni);
              return (
                <li key={b.id}>
                  <Link href={`/sigap/kelola/perencanaan/identifikasi/${b.id}`} className={`${kartu} flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-[#F7F9FC]`}>
                    <strong className="min-w-0 flex-1 text-[14.5px] text-[#0F2A52] [overflow-wrap:anywhere]">{b.nama}</strong>
                    <span className="text-[12.5px] text-[#5B6B84]">{b.ro_kode} {namaRo.get(b.ro_kode)?.slice(0, 40) ?? ""}</span>
                    <Chip warna={st.nada}>{st.teks}</Chip>
                    {nTempo > 0 && <Chip warna="kuning">{nTempo} periode perlu ditegaskan (H-15)</Chip>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Bingkai>
  );
}

export default function HalamanDaftarIdentifikasi() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
