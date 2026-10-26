"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/gap/KartuDelego.tsx
//
// (26 Okt 2026) Kartu "Delegasi pada survei ini" di halaman Gap: kenyataan pembagian tugas dari Delego (progres, hutang poin, lapor hari ini,
// identifikasi berubah) dibaca lewat keu_dlg_bahan(p_ident). Hanya tampilan: tidak ikut menghitung temuan Gap dan tidak memblokir apa pun.
// Hak melihat ditegakkan basis data (yang tidak berwenang melihat daftar kosong).

import Link from "next/link";
import { useMemo } from "react";
import { Chip } from "@/app/sigap/keu-ui";
import { useBahan, useHakDelegasi } from "@/app/sigap/delego/data";
import { aturLibur, bulat, identBerubah, ringkasHariIni, statusLaporanHariIni } from "@/lib/delego/hitung";
import { NAMA_PERAN, NAMA_STATUS } from "@/lib/delego/tipe";
import { Bagian } from "../../Kontrol";

const fmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

export function KartuDelego({ identId, jam }: { identId: number; jam: number }) {
  const hak = useHakDelegasi();
  const bahan = useBahan({ ident: identId });
  const hari = bahan.data?.hari_ini ?? hak.data?.hari_ini ?? "";

  const baris = useMemo(() => {
    if (!bahan.data || !hari) return null;
    aturLibur(hak.data?.libur ?? []);
    const aktif = bahan.data.delegasi.filter((d) => d.status === "baru" || d.status === "berjalan" || d.status === "ditunda");
    const rinci = aktif.map((d) => ({ d, r: ringkasHariIni(d, bahan.data!.laporan, hari), st: statusLaporanHariIni(d, bahan.data!.laporan, hari, jam) }));
    return {
      rinci,
      hutang: rinci.reduce((s, x) => s + x.r.hutangKemarin, 0),
      sudah: rinci.filter((x) => x.st === "sudah").length,
      wajib: rinci.filter((x) => x.st === "sudah" || x.st === "belum" || x.st === "perlu_pengingat").length,
      berubah: rinci.filter((x) => identBerubah(x.d)).length,
      selesai: bahan.data.delegasi.filter((d) => d.status === "selesai").length,
    };
  }, [bahan.data, hak.data, hari, jam]);

  return (
    <Bagian huruf="C" judul="Delegasi pada survei ini" id="gap-delego">
      {(bahan.memuat || hak.memuat) && !bahan.data && <p className="m-0 text-[13px] text-[#5B6B84]">Memuat delegasi...</p>}
      {bahan.galat && !bahan.data && <p className="m-0 text-[13px] text-[#B42329]">{bahan.galat}</p>}
      {baris && baris.rinci.length === 0 && (
        <p className="m-0 text-[13px] text-[#5B6B84]">
          Belum ada delegasi aktif untuk survei ini (atau Anda tidak berwenang melihatnya).{" "}
          <Link href="/sigap/delego/buat" className="font-semibold text-[#1F5FD1] underline">Buat delegasi →</Link>
        </p>
      )}
      {baris && baris.rinci.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip warna="biru">{baris.rinci.length} delegasi aktif</Chip>
            <Chip warna={baris.sudah === baris.wajib ? "hijau" : "kuning"}>{baris.sudah} dari {baris.wajib} sudah lapor hari ini</Chip>
            <Chip warna={baris.hutang > 0 ? "kuning" : "hijau"}>Hutang {fmt(bulat(baris.hutang))} poin</Chip>
            {baris.berubah > 0 && <Chip warna="merah">{baris.berubah} perlu ditinjau (identifikasi berubah)</Chip>}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {baris.rinci.map(({ d, r }) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#DCE3EE] px-3 py-2 text-[13px]">
                <Link href={`/sigap/delego/papan?buka=${d.id}`} className="min-w-0 flex-1 basis-[200px] font-semibold text-[#1F5FD1] underline decoration-dotted underline-offset-[3px]">{d.judul}</Link>
                <span className="text-[#44546F]">{d.penerima_nama} · {NAMA_PERAN[d.peran_penerima]}</span>
                <span className="tabular-nums text-[#0F2A52]">{r.persenSelesai}%</span>
                {r.hutangKemarin > 0 && <span className="font-semibold tabular-nums text-[#8A6200]">hutang {fmt(bulat(r.hutangKemarin))}</span>}
                {d.status === "ditunda" && <span className="text-[#5B6B84]">{NAMA_STATUS[d.status]}</span>}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] text-[#5B6B84]">{baris.selesai > 0 ? `${baris.selesai} delegasi lain sudah selesai. ` : ""}Hutang poin dihitung dari target harian dan laporan (kalender libur berlaku). Rincian dan tindakan ada di <Link href="/sigap/delego/papan" className="font-semibold text-[#1F5FD1] underline">Delego</Link>.</p>
        </>
      )}
    </Bagian>
  );
}
