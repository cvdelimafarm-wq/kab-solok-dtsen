"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/tim/DrafDelegasi.tsx
//
// (14 Nov 2026, Fase 2b) Kartu "Draf delegasi per kursi" (mockup A6) di bawah Status kursi. Usulan butir kerja untuk pegawai ORGANIK (termasuk PPPK)
// di kursi Final, dihitung basis data (keu_dlg_draf_kursi, hanya baca). Mitra tidak masuk Delego (keputusan Iqbal 13 Nov).
// "Buat delegasi" memakai keu_dlg_buat yang sama dengan layar Buat delegasi (hak RO, pemicu skala 100, jejak), lalu menautkan kegiatan
// (keu_dlg_atur_urusan, kelas lapangan). Keputusan 13 Nov: butir ini MENGGANTIKAN blok hari lapangan kegiatan yang sama di matriks beban.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip, judulKartu, kartu, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useBacaFungsi } from "@/app/sigap/delego/data";
import { NAMA_PERAN, type KodePeran } from "@/lib/keu/lanjutan";
import { labelSumberPoin } from "@/lib/delego/skala";

type Butir = {
  fungsi: string; kegiatan_id: number; kegiatan_nama: string; akun_id: number; nama: string; peran: string;
  jenis_id: number | null; jenis_nama: string | null; satuan: string | null; jumlah: number | null; resep: string; judul: string;
  mulai: string; tenggat: string; poin_per_satuan: number | null; poin_sumber: string | null; sudah_delegasi_id: number | null; siap_buat: boolean;
};
type Draf = { siap: boolean; alasan: string; ident_ver?: number; ro_kode?: string; butir: Butir[] };

const fmt = (n: number, d = 1) => n.toLocaleString("id-ID", { maximumFractionDigits: d });
const namaPeran = (p: string) => (NAMA_PERAN as Record<string, string>)[p as KodePeran] ?? (p ? p[0].toUpperCase() + p.slice(1) : "-");
const isian = "h-8 w-full min-w-0 rounded-md border border-[#C9D6EA] bg-white px-1.5 text-[12px]";

export default function DrafDelegasi({ identId }: { identId: number }) {
  const draf = useBacaFungsi<Draf>("keu_dlg_draf_kursi", { p_ident: identId }, { simpan: false });
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [sedang, setSedang] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [sNama, setSNama] = useState("");
  const [sPeran, setSPeran] = useState("");
  const [sStatus, setSStatus] = useState("");

  const kunci = (b: Butir) => `${b.kegiatan_id}-${b.akun_id}-${b.jenis_id ?? 0}`;
  const butir = useMemo(() => draf.data?.butir ?? [], [draf.data]);
  const statusB = (b: Butir) => (b.sudah_delegasi_id ? "ada" : b.siap_buat ? "siap" : "tanpa");
  const tampil = useMemo(() => {
    const q = sNama.trim().toLowerCase();
    return butir.filter((b) => (!q || b.nama.toLowerCase().includes(q)) && (!sPeran || b.peran === sPeran) && (!sStatus || statusB(b) === sStatus));
  }, [butir, sNama, sPeran, sStatus]);
  const siap = butir.filter((b) => b.siap_buat);
  const peranAda = [...new Set(butir.map((b) => b.peran))];

  const buat = async () => {
    const daftar = siap.filter((b) => pilih.has(kunci(b)));
    if (daftar.length === 0) return;
    setSedang(true);
    setPesan(null);
    let berhasil = 0;
    const galat: string[] = [];
    for (const b of daftar) {
      const r = await aksiKeu<{ dibuat: number[] }>("keu_dlg_buat", {
        p_data: {
          ident_id: identId, judul: b.judul, uraian: `Draf dari kursi ${namaPeran(b.peran)} identifikasi versi ${draf.data?.ident_ver ?? "-"} (${b.resep}).`,
          bobot: 1, mulai: b.mulai, tenggat: b.tenggat, hari_kerja: [1, 2, 3, 4, 5], jenis_id: b.jenis_id, jumlah: b.jumlah,
          perlu_hasil: false, perlu_tinjau: false, langkah: [],
          penerima: [{ akun: b.akun_id, peran: b.peran === "pml" || b.peran === "ppl" ? b.peran : "pegawai", pj_bidang: "" }],
        },
      });
      if (!r.ok) { galat.push(`${b.nama}: ${r.pesan}`); continue; }
      for (const id of r.data.dibuat ?? []) {
        const r2 = await aksiKeu("keu_dlg_atur_urusan", { p_id: id, p_data: { kelas: "lapangan", kegiatan_id: b.kegiatan_id, mode_tutup: "tinjau" } });
        if (!r2.ok) galat.push(`${b.nama} (tautan kegiatan): ${r2.pesan}`);
      }
      berhasil++;
    }
    setSedang(false);
    setPilih(new Set());
    setPesan({ ok: galat.length === 0, teks: `${berhasil} delegasi dibuat.${galat.length ? ` Gagal: ${galat.join("; ")}` : ""}` });
    await draf.muat();
  };

  if (draf.memuat && !draf.data) return null;
  return (
    <section className={kartu} aria-label="Draf delegasi per kursi">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`m-0 ${judulKartu}`}>Draf delegasi per kursi</h2>
        <span className="text-[12px] text-[#5B6B84]">pegawai organik dan PPPK · mitra tidak masuk Delego</span>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-[#44546F]">
        Butir disusun dari kursi Final, alokasi wilayah, dan kelas identifikasi. Butir yang sudah dibuat menggantikan blok hari lapangan kegiatan yang sama di{" "}
        <Link href="/sigap/delego/beban" className="font-semibold text-[#1F5FD1] underline">Beban kerja</Link>. Poin per satuan dari Master &gt; Poin beban kerja (katalog skala 75 untuk delegasi yang mulai sebelum 16 Nov).
      </p>
      {draf.galat && <p className="m-0 mt-2 text-[12.5px] text-[#7A1D22]">{draf.galat}</p>}
      {draf.data && !draf.data.siap && <p className="m-0 mt-2 rounded-lg bg-[#FFF6DD] px-3 py-2 text-[12.5px] text-[#5C3D00]">{draf.data.alasan}</p>}
      {draf.data?.siap && butir.length === 0 && <p className="m-0 mt-2 text-[12.5px] text-[#5B6B84]">Tidak ada pegawai organik dengan penugasan pada kegiatan tertaut yang belum selesai.</p>}
      {butir.length > 0 && (
        <>
          <div className="relative mt-2.5 max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="bg-[#F7F9FC] text-[11px] uppercase tracking-wide text-[#5B6B84]">
                  <th className="w-8 px-2 py-1.5"><span className="sr-only">Pilih</span></th>
                  <th className="px-2 py-1.5">Pegawai</th><th className="px-2 py-1.5">Peran</th><th className="px-2 py-1.5">Butir</th><th className="px-2 py-1.5 text-right">Poin</th><th className="px-2 py-1.5">Status</th>
                </tr>
                <tr>
                  <th />
                  <th className="px-1 py-1"><input aria-label="Saring pegawai" className={isian} value={sNama} onChange={(e) => setSNama(e.target.value)} placeholder="Cari nama" /></th>
                  <th className="px-1 py-1"><select aria-label="Saring peran" className={isian} value={sPeran} onChange={(e) => setSPeran(e.target.value)}><option value="">Semua</option>{peranAda.map((p) => <option key={p} value={p}>{namaPeran(p)}</option>)}</select></th>
                  <th />
                  <th />
                  <th className="px-1 py-1"><select aria-label="Saring status" className={isian} value={sStatus} onChange={(e) => setSStatus(e.target.value)}><option value="">Semua</option><option value="siap">Siap dibuat</option><option value="ada">Sudah ada</option><option value="tanpa">Belum ada resep</option></select></th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((b) => {
                  const k = kunci(b);
                  const total = b.poin_per_satuan != null && b.jumlah != null ? Number(b.poin_per_satuan) * Number(b.jumlah) : null;
                  return (
                    <tr key={k} className="border-t border-[#EEF2F6] align-top">
                      <td className="px-2 py-1.5">
                        {b.siap_buat && (
                          <input type="checkbox" aria-label={`Pilih ${b.nama}`} className="h-4 w-4 accent-[#0F6B63]" checked={pilih.has(k)}
                            onChange={(e) => setPilih((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{b.nama}</td>
                      <td className="px-2 py-1.5">{namaPeran(b.peran)}<div className="text-[11.5px] text-[#5B6B84]">{b.fungsi === "pelatihan" ? "Pelatihan" : "Pendataan"}</div></td>
                      <td className="px-2 py-1.5">
                        {b.jenis_id ? <>{b.jenis_nama}: <b>{fmt(Number(b.jumlah ?? 0), 0)} {b.satuan}</b></> : <span className="text-[#5B6B84]">-</span>}
                        <div className="text-[11.5px] text-[#5B6B84]">{b.resep}{b.jenis_id ? ` · ${b.mulai.slice(8, 10)}/${b.mulai.slice(5, 7)}–${b.tenggat.slice(8, 10)}/${b.tenggat.slice(5, 7)}` : ""}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {total != null ? <><b>{fmt(total)}</b><div className="text-[11.5px] text-[#5B6B84]">{fmt(Number(b.poin_per_satuan), 2)}/{b.satuan} · {labelSumberPoin(b.poin_sumber) || b.poin_sumber}</div></> : "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        {b.sudah_delegasi_id ? <Chip warna="hijau">Sudah ada</Chip> : b.siap_buat ? <Chip warna="biru">Siap dibuat</Chip> : <Chip warna="abu">Belum ada resep</Chip>}
                      </td>
                    </tr>
                  );
                })}
                {tampil.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-[#5B6B84]">Tidak ada baris yang cocok dengan saringan.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" className={tombolKecil} disabled={sedang || siap.length === 0} onClick={() => setPilih(new Set(siap.map(kunci)))}>Pilih semua yang siap ({siap.length})</button>
            <button type="button" className={tombolUtama} disabled={sedang || pilih.size === 0} onClick={() => void buat()}>{sedang ? "Membuat…" : `Buat ${pilih.size} delegasi`}</button>
            {pesan && <span role="status" className={`text-[12.5px] ${pesan.ok ? "text-[#0B524C]" : "text-[#7A1D22]"}`}>{pesan.teks}</span>}
          </div>
        </>
      )}
    </section>
  );
}
