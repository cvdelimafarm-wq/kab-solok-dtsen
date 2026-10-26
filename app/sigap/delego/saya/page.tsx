"use client";

// app/sigap/delego/saya/page.tsx
//
// (26 Okt 2026) Delegasi saya (HP-first): kewajiban lapor hari ini, tugas, hutang poin, beban, tanggapan. Untuk PML ditambah mitra yang boleh dilaporkan mewakili.

import Link from "next/link";
import { useState } from "react";
import { angka, bebanPerOrang, bulat, jamWib, ringkasHariIni, statusLaporanHariIni, targetPenuh, tglPendek } from "@/lib/delego/hitung";
import { NAMA_PERAN, NAMA_STATUS, type BahanSaya, type Delegasi } from "@/lib/delego/tipe";
import { useKonteksDelego } from "../konteks";
import { DaftarBukti } from "../BuktiFoto";
import { KELAS } from "../merek";
import { Batang, Galat, Halaman, Info, Kartu, Kosong, Lencana, Memuat, NADA_STATUS, Peringatan, fmt } from "../ui";
import { useKirim, useSaya } from "../data";

const aktifSaja = (d: Delegasi) => d.status === "baru" || d.status === "berjalan" || d.status === "ditunda";

function KartuTugas({ d, s, terima, sibuk }: { d: Delegasi; s: BahanSaya; terima: (id: number) => void; sibuk: boolean }) {
  const [buka, setBuka] = useState(false);
  const r = ringkasHariIni(d, s.laporan, s.hari_ini);
  const penuh = targetPenuh(d);
  const riwayat = s.laporan.filter((l) => l.delegasi_id === d.id).slice(0, 5);
  const tanggapan = s.tanggapan.filter((t) => t.delegasi_id === d.id).slice(0, 3);
  return (
    <div className={`${KELAS.kartu} space-y-2.5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15.5px] font-semibold leading-snug">{d.judul}</div>
          <div className="mt-0.5 text-[12.5px] text-[#3B4A57]">
            {NAMA_PERAN[d.peran_penerima]}
            {d.pj_bidang ? ` · PJ ${d.pj_bidang}` : ""}
          </div>
        </div>
        <Lencana nada={NADA_STATUS[d.status]}>{NAMA_STATUS[d.status]}</Lencana>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-[13px] text-[#3B4A57]">
          <span>
            {fmt(r.poinTotal, 1)} dari {fmt(penuh, 1)} {d.satuan}
          </span>
          <span className="font-semibold text-[#14212B]">{r.persenSelesai}%</span>
        </div>
        <Batang persen={r.persenSelesai} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#3B4A57]">
        <span>Dari {d.dari_nama ?? "pemberi delegasi"}</span>
        <span>Tenggat {tglPendek(d.tenggat)}</span>
        <span>Bobot {d.bobot}</span>
        {r.hutangKemarin > 0 && <span className="font-semibold text-[#8A4605]">Hutang {fmt(bulat(r.hutangKemarin), 1)}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {d.status === "baru" && (
          <button type="button" className={KELAS.tombolUtama} disabled={sibuk} onClick={() => terima(d.id)}>
            Terima delegasi
          </button>
        )}
        <button type="button" className={`${KELAS.tombolSekunder} flex-1`} onClick={() => setBuka((b) => !b)} aria-expanded={buka}>
          {buka ? "Tutup petunjuk dan riwayat" : "Lihat petunjuk dan riwayat"}
        </button>
      </div>
      {buka && (
        <div className="space-y-3 border-t border-[#E3E8EE] pt-3 text-[13.5px]">
          {d.uraian ? <p className="m-0 whitespace-pre-line leading-relaxed">{d.uraian}</p> : <p className="m-0 text-[#3B4A57]">Tidak ada petunjuk tertulis.</p>}
          <div className="text-[12.5px] text-[#3B4A57]">
            Target {fmt(angka(d.target_harian), 1)} {d.satuan} per hari kerja, {tglPendek(d.mulai)} sampai {tglPendek(d.tenggat)}.
          </div>
          {riwayat.length > 0 && (
            <ul className="m-0 list-none space-y-1 p-0">
              {riwayat.map((l) => (
                <li key={l.id} className="text-[13px]">
                  <div className="flex justify-between gap-2">
                    <span>{tglPendek(l.tanggal)}{l.mewakili ? " · diwakili" : ""}{l.terlambat ? " · terlambat" : ""}</span>
                    <span className="font-semibold">{fmt(angka(l.poin), 1)}</span>
                  </div>
                  <DaftarBukti bukti={l.bukti} ukuran={56} />
                </li>
              ))}
            </ul>
          )}
          {tanggapan.map((t) => (
            <div key={t.id} className="rounded-lg bg-[#F1F7F6] px-3 py-2">
              <div className="text-[12px] font-semibold text-[#0B524C]">{t.dari_nama ?? "Pemberi"} · {tglPendek(t.dibuat_at.slice(0, 10))}</div>
              <div className="mt-0.5 leading-snug">{t.isi}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Saya() {
  const { hari, jam } = useKonteksDelego();
  const s = useSaya();
  const kirim = useKirim(s.muat);
  const d = s.data;
  const mitra = d?.akun.jenis === "mitra";

  const aktif = d ? d.delegasi.filter(aktifSaja) : [];
  const lain = d ? d.delegasi.filter((x) => !aktifSaja(x)) : [];
  const wajib = d ? aktif.filter((x) => ["belum", "perlu_pengingat"].includes(statusLaporanHariIni(x, d.laporan, hari, jam))) : [];
  const sudah = d ? aktif.filter((x) => statusLaporanHariIni(x, d.laporan, hari, jam) === "sudah") : [];
  const targetHariIni = wajib.reduce((t, x) => t + ringkasHariIni(x, d?.laporan ?? [], hari).sisaHariIni, 0);
  const hutang = d ? aktif.reduce((t, x) => t + ringkasHariIni(x, d.laporan, hari).hutangKemarin, 0) : 0;
  const beban = d ? bebanPerOrang(aktif, hari)[0] : undefined;
  const sisaJam = Math.max(0, Math.floor(24 - (jam || jamWib(new Date()))));
  const tambahan = Math.max(5, Math.ceil(hutang / 3 / 5) * 5);

  return (
    <Halaman judul={mitra ? "Tugas dan skor saya" : "Delegasi saya"} sub={d ? `${d.akun.nama} · ${tglPendek(hari)}` : undefined}>
      {s.memuat && !d && <Memuat />}
      {s.galat && !d && <Galat>{s.galat}</Galat>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {d && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            {aktif.length === 0 ? (
              <Kosong>Belum ada delegasi untuk Anda. Pemberi delegasi akan mengirim tugas ke sini dan Anda mendapat notifikasi.</Kosong>
            ) : wajib.length > 0 ? (
              <div className="space-y-2 rounded-xl border-2 border-[#0F6B63] bg-white p-4">
                <div className="text-[15px] font-bold">{wajib.length === 1 ? "Laporan hari ini belum dikirim" : `${wajib.length} laporan hari ini belum dikirim`}</div>
                <div className="text-[14px] leading-snug text-[#33404B]">
                  Batas 23:59 WIB, sisa sekitar {sisaJam} jam. Target hari ini {fmt(targetHariIni, 1)} poin{hutang > 0 ? `; hutang berjalan ${fmt(bulat(hutang), 1)} poin` : ""}.
                </div>
                <Link href="/sigap/delego/lapor" className={`${KELAS.tombolUtama} w-full`}>
                  Isi laporan hari ini
                </Link>
              </div>
            ) : sudah.length > 0 ? (
              <Info>Semua laporan hari ini sudah terkirim. Terima kasih. Laporan masih bisa diperbaiki sampai pukul 23:59 WIB.</Info>
            ) : (
              <Info>Hari ini bukan hari kerja untuk delegasi Anda, jadi tidak ada laporan yang perlu dikirim.</Info>
            )}

            {beban && beban.persen > 100 && (
              <Peringatan>Beban minggu ini {beban.persen}%. Bila terlalu berat, tulis di kolom kendala agar Ketua Tim dapat meratakan.</Peringatan>
            )}
            {hutang > 0 && (
              <Peringatan>
                <b>Hutang target {fmt(bulat(hutang), 1)} poin.</b> Bisa dikejar dengan tambahan {tambahan} poin per hari selama tiga hari kerja. Bila ada kendala, tulis di laporan.
              </Peringatan>
            )}

            {aktif.length > 0 && <div className={KELAS.labelKecil}>Tugas saya ({aktif.length})</div>}
            {aktif.map((x) => (
              <KartuTugas key={x.id} d={x} s={d} sibuk={kirim.mengirim} terima={(id) => void kirim.kirim("keu_dlg_terima", { p_id: id })} />
            ))}

            {d.diwakili.length > 0 && (
              <>
                <div className={`${KELAS.labelKecil} mt-2`}>Mitra yang boleh saya laporkan ({d.diwakili.length})</div>
                <Kartu>
                  <p className="m-0 mb-2 text-[13px] text-[#3B4A57]">Sebagai PML, Anda dapat melapor mewakili mitra yang tidak memegang ponsel. Laporan ditandai &quot;diwakili&quot;.</p>
                  <ul className="m-0 list-none space-y-2 p-0">
                    {d.diwakili.map((x) => {
                      const st = statusLaporanHariIni(x, d.laporan_diwakili, hari, jam);
                      return (
                        <li key={x.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold">{x.penerima_nama}</div>
                            <div className="truncate text-[12.5px] text-[#3B4A57]">{x.judul}</div>
                          </div>
                          {st === "sudah" ? <Lencana nada="hijau">Sudah lapor</Lencana> : <Link href={`/sigap/delego/lapor?delegasi=${x.id}`} className={KELAS.tombolKecilUtama}>Lapor</Link>}
                        </li>
                      );
                    })}
                  </ul>
                </Kartu>
              </>
            )}

            {lain.length > 0 && (
              <>
                <div className={`${KELAS.labelKecil} mt-2`}>Selesai atau dihentikan</div>
                {lain.map((x) => (
                  <Kartu key={x.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px]">{x.judul}</span>
                      <Lencana nada={NADA_STATUS[x.status]}>{NAMA_STATUS[x.status]}</Lencana>
                    </div>
                  </Kartu>
                ))}
              </>
            )}
          </div>

          <aside className="space-y-3">
            {mitra && (
              <Kartu judul="SPK saya">
                <p className="m-0 text-[13px] leading-relaxed text-[#3B4A57]">Imbalan dan ketentuan lengkap mengikuti dokumen SPK dari PPK (cek aturan). Delego hanya mencatat pekerjaan dan laporan harian.</p>
              </Kartu>
            )}
            <Kartu judul="Tanggapan terbaru">
              {d.tanggapan.length === 0 ? (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada tanggapan.</p>
              ) : (
                <ul className="m-0 list-none space-y-3 p-0">
                  {d.tanggapan.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <div className="flex justify-between text-[12.5px] text-[#3B4A57]">
                        <span className="font-semibold text-[#14212B]">{t.dari_nama ?? "Pemberi"}</span>
                        <span>{tglPendek(t.dibuat_at.slice(0, 10))}</span>
                      </div>
                      <div className="text-[14px] leading-snug">{t.isi}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
            {d.penghargaan.length > 0 && (
              <Kartu judul="Penghargaan">
                <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
                  {d.penghargaan.slice(0, 3).map((h) => (
                    <li key={h.id}>
                      <b>{tglPendek(h.dibuat_at.slice(0, 10))}</b> · {h.alasan}
                    </li>
                  ))}
                </ul>
              </Kartu>
            )}
          </aside>
        </div>
      )}
    </Halaman>
  );
}
