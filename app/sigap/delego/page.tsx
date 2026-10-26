"use client";

// app/sigap/delego/page.tsx
//
// (26 Okt 2026) Beranda tim Delego: ringkasan hari ini, hal yang perlu perhatian (saran, bukan keputusan), laporan terbaru, beban teratas.
// Akun tanpa peran tim dialihkan ke Delegasi saya.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { angka, bebanPerOrang, ringkasHariIni, ringkasTim, tglPendek, tindakanDisarankan } from "@/lib/delego/hitung";
import { NAMA_PERAN } from "@/lib/delego/tipe";
import { useBahan } from "./data";
import { useKonteksDelego } from "./konteks";
import { KELAS } from "./merek";
import { PilihRo, saringRo, useFilterRo } from "./tim";
import { Batang, Galat, Halaman, Kartu, Kosong, Lencana, Memuat, Statistik, fmt } from "./ui";

export default function BerandaTim() {
  const { hari, jam, manajer, pemberi } = useKonteksDelego();
  const router = useRouter();
  useEffect(() => {
    if (!manajer) router.replace("/sigap/delego/saya");
  }, [manajer, router]);
  const f = useFilterRo();
  const b = useBahan({ aktif: manajer });
  const delegasi = saringRo(b.data, f.ro);
  const laporan = useMemo(() => (b.data ? b.data.laporan.filter((l) => delegasi.some((d) => d.id === l.delegasi_id)) : []), [b.data, delegasi]);

  const tim = b.data ? ringkasTim(delegasi, laporan, hari, jam) : null;
  const perhatian = useMemo(
    () =>
      delegasi
        .map((d) => ({ d, t: tindakanDisarankan(d, laporan, hari, jam), r: ringkasHariIni(d, laporan, hari) }))
        .filter((x) => x.t.length > 0)
        .sort((a, c) => c.t.length - a.t.length || c.r.hutangKemarin - a.r.hutangKemarin)
        .slice(0, 8),
    [delegasi, laporan, hari, jam],
  );
  const beban = useMemo(() => bebanPerOrang(delegasi, hari).slice(0, 6), [delegasi, hari]);
  const terbaru = laporan.slice(0, 8);

  if (!manajer) return null;
  return (
    <Halaman
      judul="Beranda tim"
      sub={`Ringkasan ${tglPendek(hari)}`}
      kanan={
        <>
          <PilihRo {...f} />
          {pemberi && <Link href="/sigap/delego/buat" className={KELAS.tombolUtama}>Buat delegasi</Link>}
        </>
      }
    >
      {b.memuat && !b.data && <Memuat />}
      {b.galat && !b.data && <Galat>{b.galat}</Galat>}
      {b.data && delegasi.length === 0 && (
        <Kosong>
          Belum ada delegasi{f.ro ? ` pada RO ${f.ro}` : ""}.{" "}
          {pemberi ? <Link href="/sigap/delego/buat" className="font-semibold text-[#0F6B63] underline">Buat delegasi pertama</Link> : "Pemberi delegasi akan mengisinya."}
        </Kosong>
      )}
      {tim && delegasi.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Statistik label="Delegasi aktif" nilai={tim.aktif} />
            <Statistik label="Sudah lapor hari ini" nilai={`${tim.sudahLapor}/${tim.sudahLapor + tim.belumLapor}`} ket="dari yang wajib lapor" />
            <Statistik label="Belum lapor" nilai={tim.belumLapor} ket={tim.perluPengingat > 0 ? `${tim.perluPengingat} lewat jam pengingat` : "belum lewat jam pengingat"} nada={tim.perluPengingat > 0 ? "amber" : "biasa"} />
            <Statistik label="Hutang poin" nilai={fmt(tim.hutangTotal)} ket={tim.perluCatatan > 0 ? `${tim.perluCatatan} perlu catatan lisan` : "tidak ada yang melewati ambang"} nada={tim.perluCatatan > 0 ? "amber" : "biasa"} />
            <Statistik label="Beban berlebih" nilai={tim.berlebih} ket="orang di atas 100% minggu ini" nada={tim.berlebih > 0 ? "merah" : "biasa"} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Kartu judul="Perlu perhatian" kanan={<span className="text-[12.5px] text-[#3B4A57]">Saran sistem, Anda yang memutuskan</span>}>
              {perhatian.length === 0 ? (
                <p className="m-0 text-[14px] text-[#3B4A57]">Tidak ada yang perlu ditindaklanjuti saat ini.</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-[#EEF1F4] p-0">
                  {perhatian.map(({ d, t, r }) => (
                    <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[14.5px] font-semibold">{d.penerima_nama} <span className="text-[12.5px] font-normal text-[#3B4A57]">· {NAMA_PERAN[d.peran_penerima]}</span></div>
                        <div className="truncate text-[13px] text-[#3B4A57]">{d.judul}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {t.map((x, i) => (
                            <Lencana key={i} nada={x.jenis === "catatan_lisan" ? "amber" : "biru"}>{x.alasan}</Lencana>
                          ))}
                          {r.hutangKemarin > 0 && <Lencana nada="abu">Hutang {fmt(r.hutangKemarin, 0)}</Lencana>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link href={`/sigap/delego/laporan?buka=${d.id}`} className={KELAS.tombolKecil}>Tanggapi</Link>
                        {pemberi && <Link href={`/sigap/delego/pembinaan?penerima=${d.penerima_akun}&ro=${encodeURIComponent(d.ro_kode)}&delegasi=${d.id}`} className={KELAS.tombolKecil}>Catat pembinaan</Link>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>

            <div className="space-y-4">
              <Kartu judul="Beban minggu ini" kanan={<Link href="/sigap/delego/beban" className="text-[12.5px] font-semibold text-[#0F6B63] hover:underline">Lihat semua</Link>}>
                <ul className="m-0 list-none space-y-2.5 p-0">
                  {beban.map((o) => (
                    <li key={o.akun} className="space-y-1">
                      <div className="flex justify-between text-[13px]">
                        <span className="truncate">{o.nama}</span>
                        <span className={`font-semibold ${o.kategori === "berlebih" ? "text-[#9B2C2C]" : ""}`}>{o.persen}%</span>
                      </div>
                      <Batang persen={Math.min(o.persen, 100)} nada={o.kategori === "berlebih" ? "merah" : o.kategori === "ringan" ? "amber" : "hijau"} />
                    </li>
                  ))}
                </ul>
              </Kartu>
              <Kartu judul="Laporan terbaru" kanan={<Link href="/sigap/delego/laporan" className="text-[12.5px] font-semibold text-[#0F6B63] hover:underline">Laporan tim</Link>}>
                {terbaru.length === 0 ? (
                  <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada laporan.</p>
                ) : (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {terbaru.map((l) => {
                      const d = delegasi.find((x) => x.id === l.delegasi_id);
                      return (
                        <li key={l.id} className="flex items-start justify-between gap-2 text-[13px]">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{d?.penerima_nama ?? "?"}</span>
                            <span className="block truncate text-[12px] text-[#3B4A57]">{tglPendek(l.tanggal)} · {d?.judul}</span>
                          </span>
                          <span className="whitespace-nowrap font-bold">{fmt(angka(l.poin), 1)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Kartu>
            </div>
          </div>
        </>
      )}
    </Halaman>
  );
}
