"use client";

// app/sigap/delego/jadwal/page.tsx
//
// (1 Nov 2026) Pekerjaan saya: hari ini, minggu ini, bulan ini. Merangkum SEMUA pekerjaan pegawai dalam satu tempat: delegasi dari semua kegiatan dan pekerjaan
// kantor, penugasan lapangan, pelatihan, dan ketersediaan (cuti, izin, sakit, dinas luar), lengkap dengan beban per hari terhadap kapasitas.

import Link from "next/link";
import { useMemo, useState } from "react";
import { angka, awalBulan, awalMinggu, bebanDelegasiHari, tambahHari, targetHariIni, tglPendek } from "@/lib/delego/hitung";
import { rentangMinggu, susunRekap, type SelRekap } from "@/lib/delego/rekap";
import { TEKS_STATUS_BUTIR, statusButir } from "@/lib/delego/tinjau";
import { warnaBeban } from "@/lib/delego/warna";
import { useRekap, useSaya } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Batang, Galat, Halaman, Info, Kartu, Kosong, Lencana, Memuat, fmt } from "../ui";

type Rentang = "hari" | "pekan" | "bulan";

const akhirBulan = (awal: string) => {
  const [y, m] = awal.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function Rincian({ sel }: { sel: SelRekap }) {
  if (sel.rincian.length === 0) return <p className="m-0 text-[13px] text-[#3B4A57]">{sel.libur ? `Libur: ${sel.libur}.` : sel.ketersediaan ? `Tidak bertugas (${sel.ketersediaan.jenis}).` : "Tidak ada pekerjaan tercatat."}</p>;
  return (
    <ul className="m-0 list-none space-y-1 p-0 text-[13.5px]">
      {sel.rincian.map((r, i) => (
        <li key={i} className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <b>{r.judul ?? r.kegiatan}</b>
            {r.judul ? <span className="text-[#3B4A57]"> · {r.kegiatan}</span> : null}
          </span>
          <span className="flex items-center gap-2">
            <Lencana nada={r.sumber === "delegasi" ? "hijau" : r.sumber === "pelatihan" ? "amber" : "biru"}>{r.sumber === "delegasi" ? "Delegasi" : r.sumber === "pelatihan" ? "Pelatihan" : "Lapangan"}</Lencana>
            <b>{fmt(r.poin, 1)}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Jadwal() {
  const { hari } = useKonteksDelego();
  const [rentang, setRentang] = useState<Rentang>("hari");
  const [geser, setGeser] = useState(0);
  const [buka, setBuka] = useState<string | null>(null);

  const { dari, sampai } = useMemo(() => {
    if (rentang === "hari") return { dari: hari, sampai: hari };
    if (rentang === "pekan") return rentangMinggu(tambahHari(awalMinggu(hari), geser * 7));
    const [y, m] = awalBulan(hari).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + geser, 1)).toISOString().slice(0, 10);
    return { dari: d, sampai: akhirBulan(d) };
  }, [rentang, geser, hari]);

  const s = useSaya();
  const rekap = useRekap(dari, sampai);
  const d = s.data;
  const hasil = useMemo(() => {
    if (!d || !rekap.data) return null;
    const orang = [{ akun: d.akun.id, nama: d.akun.nama }];
    const nama: Record<number, string> = {};
    for (const l of rekap.data.lapangan) nama[l.kegiatan_id] = l.kegiatan;
    return susunRekap({ orang, delegasi: d.delegasi, lapangan: rekap.data.lapangan.filter((l) => l.akun === d.akun.id), ketersediaan: rekap.data.ketersediaan.filter((k) => k.akun === d.akun.id), dari, sampai, namaKegiatan: nama });
  }, [d, rekap.data, dari, sampai]);
  const baris = hasil?.baris[0];
  const hariIni = baris?.sel.find((x) => x.tanggal === hari);

  const aktif = d ? d.delegasi.filter((x) => x.status === "baru" || x.status === "berjalan") : [];
  const hariIniAda = aktif.filter((x) => bebanDelegasiHari(x, hari) > 0);
  const usulan = d ? d.delegasi.filter((x) => x.status === "usulan") : [];

  const judulRentang = rentang === "hari" ? tglPendek(hari) : rentang === "pekan" ? `${tglPendek(dari)} sampai ${tglPendek(sampai)}` : new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dari}T00:00:00Z`));
  const bukaSel = baris?.sel.find((x) => x.tanggal === buka) ?? null;

  return (
    <Halaman
      judul="Pekerjaan saya"
      sub={d ? `${d.akun.nama} · semua kegiatan dan pekerjaan kantor` : undefined}
      kanan={
        <div className="flex gap-2" role="group" aria-label="Rentang">
          {(["hari", "pekan", "bulan"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={rentang === k} onClick={() => { setRentang(k); setGeser(0); setBuka(null); }} className={`min-h-[38px] rounded-full border px-3.5 text-[13.5px] font-semibold ${rentang === k ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white"}`}>
              {k === "hari" ? "Hari ini" : k === "pekan" ? "Minggu ini" : "Bulan ini"}
            </button>
          ))}
        </div>
      }
    >
      {(s.memuat || rekap.memuat) && !hasil && <Memuat />}
      {(s.galat || rekap.galat) && !hasil && <Galat>{s.galat ?? rekap.galat}</Galat>}

      {rentang !== "hari" && (
        <div className="flex items-center gap-2">
          <button type="button" className={KELAS.tombolKecil} onClick={() => { setGeser((g) => g - 1); setBuka(null); }} aria-label="Sebelumnya">‹</button>
          <span className="min-w-[170px] text-center text-[14px] font-semibold">{judulRentang}</span>
          <button type="button" className={KELAS.tombolKecil} onClick={() => { setGeser((g) => g + 1); setBuka(null); }} aria-label="Berikutnya">›</button>
          {geser !== 0 && <button type="button" className={KELAS.tombolKecil} onClick={() => { setGeser(0); setBuka(null); }}>Kembali ke sekarang</button>}
        </div>
      )}

      {hasil && baris && rentang === "hari" && d && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            {hariIni?.libur && <Info>Hari ini libur: {hariIni.libur}.</Info>}
            {hariIni?.ketersediaan && <Info>Hari ini tercatat {hariIni.ketersediaan.jenis}{hariIni.ketersediaan.status === "diajukan" ? " (masih diajukan)" : ""}.</Info>}
            {hariIni && hariIni.rincian.filter((r) => r.sumber !== "delegasi").map((r, i) => (
              <Kartu key={i}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-semibold">{r.kegiatan}</div>
                    <div className="text-[12.5px] text-[#3B4A57]">{r.judul ?? (r.sumber === "pelatihan" ? "Pelatihan" : "Penugasan lapangan")} · satu hari penuh</div>
                  </div>
                  <Lencana nada={r.sumber === "pelatihan" ? "amber" : "biru"}>{r.sumber === "pelatihan" ? "Pelatihan" : "Lapangan"}</Lencana>
                </div>
              </Kartu>
            ))}
            {hariIniAda.length === 0 && (hariIni?.rincian.length ?? 0) === 0 && <Kosong>Tidak ada pekerjaan terjadwal hari ini.</Kosong>}
            {hariIniAda.map((x) => {
              const st = TEKS_STATUS_BUTIR[statusButir(x, d.laporan)];
              const sudah = d.laporan.some((l) => l.delegasi_id === x.id && l.tanggal === hari);
              return (
                <Kartu key={x.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold leading-snug">{x.judul}</div>
                      <div className="text-[12.5px] text-[#3B4A57]">
                        {x.kelas === "perintah" ? "Perintah langsung · " : ""}{x.kegiatan_id ? "Bertaut kegiatan tim" : x.kelompok_nama ?? "Pekerjaan kantor"} · target hari ini {fmt(targetHariIni(x, hari), 1)} {x.perlu_hasil || x.poin_per_satuan ? x.satuan : "poin"} · tenggat {tglPendek(x.tenggat)}
                      </div>
                    </div>
                    <Lencana nada={st.nada}>{st.teks}</Lencana>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Link href={`/sigap/delego/lapor?delegasi=${x.id}`} className={sudah ? KELAS.tombolKecil : KELAS.tombolKecilUtama}>{sudah ? "Perbarui laporan" : "Lapor"}</Link>
                    {x.terhalang_oleh && <span className="text-[12.5px] text-[#8A4605]">Terhalang: {x.terhalang_oleh}</span>}
                  </div>
                </Kartu>
              );
            })}
            {usulan.length > 0 && (
              <Kartu judul={`Usulan menunggu persetujuan (${usulan.length})`}>
                <ul className="m-0 list-none space-y-1 p-0 text-[13.5px]">{usulan.map((u) => <li key={u.id}>{u.judul} <span className="text-[#3B4A57]">· {fmt(angka(u.target_total), 1)} poin</span></li>)}</ul>
              </Kartu>
            )}
          </div>
          <aside className="space-y-3">
            <Kartu judul="Beban hari ini">
              {hariIni ? (
                <div className="space-y-2 text-[13.5px]">
                  <div className="flex justify-between"><span>Terisi</span><b>{fmt(hariIni.poin, 1)} dari {fmt(hariIni.kapasitas, 0)} poin</b></div>
                  <Batang persen={Math.min(100, hariIni.persen === 999 ? 100 : hariIni.persen)} nada={hariIni.persen > 100 ? "merah" : hariIni.persen >= 80 ? "hijau" : "amber"} />
                  <div className="text-[12.5px] text-[#3B4A57]">{hariIni.persen === 999 ? "Ada pekerjaan di hari tanpa kapasitas." : `${hariIni.persen}% dari kapasitas harian.`}{hariIni.rincian.some((r) => r.sumber !== "delegasi") ? " Hari lapangan atau pelatihan dihitung satu hari penuh; delegasi di hari yang sama menambah beban." : ""}{hariIni.bayangan > 0 ? ` Usulan belum disetujui: ${fmt(hariIni.bayangan, 1)} poin.` : ""}</div>
                </div>
              ) : (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada data hari ini.</p>
              )}
            </Kartu>
            <Kartu judul="Per kegiatan (hari ini)">
              {(hariIni?.rincian.length ?? 0) === 0 ? <p className="m-0 text-[13.5px] text-[#3B4A57]">Kosong.</p> : <Rincian sel={hariIni as SelRekap} />}
            </Kartu>
            <div className="flex flex-wrap gap-2">
              <Link href="/sigap/delego/catat" className={KELAS.tombolSekunder}>Catat pekerjaan</Link>
              <Link href="/sigap/delego/lapor" className={KELAS.tombolSekunder}>Lapor harian</Link>
            </div>
          </aside>
        </div>
      )}

      {hasil && baris && rentang === "pekan" && (
        <div className="space-y-2">
          {baris.sel.map((c) => {
            const w = c.kategori === "kosong" || c.kategori === "tidak_tersedia" ? null : warnaBeban(c.persen, 80, 100, 150);
            return (
              <Kartu key={c.tanggal} className={c.tanggal === hari ? "!border-[#0F6B63] !border-2" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[14.5px] font-semibold">{tglPendek(c.tanggal)}{c.libur ? <span className="font-normal text-[#3B4A57]"> · {c.libur}</span> : null}</div>
                  <div className="flex items-center gap-2">
                    {c.lembur && <Lencana nada="amber">Hari non-kerja dikerjakan</Lencana>}
                    {c.ketersediaan && <Lencana nada="abu">{c.ketersediaan.jenis}{c.ketersediaan.status === "diajukan" ? " (diajukan)" : ""}</Lencana>}
                    {c.kapasitas > 0 && <span className="rounded-md px-2 py-0.5 text-[13px] font-bold" style={w ? { backgroundColor: w.latar, color: w.teks } : { backgroundColor: "#F3F5F7", color: "#7A8793" }}>{c.persen === 999 ? "!" : `${c.persen}%`}</span>}
                  </div>
                </div>
                <div className="mt-2"><Rincian sel={c} /></div>
              </Kartu>
            );
          })}
        </div>
      )}

      {hasil && baris && rentang === "bulan" && (
        <>
          <Kartu judul={judulRentang}>
            <div className="grid grid-cols-7 gap-1 text-center text-[12px]">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => <div key={h} className="font-semibold text-[#3B4A57]">{h}</div>)}
              {Array.from({ length: (new Date(`${dari}T00:00:00Z`).getUTCDay() + 6) % 7 }).map((_, i) => <div key={`k${i}`} />)}
              {baris.sel.map((c) => {
                const w = c.kategori === "kosong" || c.kategori === "tidak_tersedia" ? null : warnaBeban(c.persen, 80, 100, 150);
                return (
                  <button
                    key={c.tanggal}
                    type="button"
                    onClick={() => setBuka(buka === c.tanggal ? null : c.tanggal)}
                    title={`${tglPendek(c.tanggal)}: ${fmt(c.poin, 0)} poin`}
                    className={`min-h-[44px] rounded-md p-1 text-[12px] ${w ? "font-bold" : c.libur ? "bg-[#FBE9E9] text-[#9B2C2C]" : c.kategori === "tidak_tersedia" ? "bg-[#E1E6EA] text-[#3B4A57]" : "bg-[#F3F5F7] text-[#7A8793]"} ${c.tanggal === hari ? "ring-2 ring-[#0F6B63]" : ""} ${c.lembur ? "underline decoration-2 underline-offset-2" : ""} ${buka === c.tanggal ? "outline outline-2 outline-[#14212B]" : ""}`}
                    style={w ? { backgroundColor: w.latar, color: w.teks } : undefined}
                  >
                    <span className="block text-[11px] font-normal opacity-80">{Number(c.tanggal.slice(8, 10))}</span>
                    {w ? (c.persen === 999 ? "!" : `${c.persen}%`) : c.libur ? "L" : c.kategori === "tidak_tersedia" ? "C" : "·"}
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-2 text-[12.5px] text-[#3B4A57]">Total bulan ini {fmt(baris.total, 0)} poin dari kapasitas {fmt(baris.kapasitas, 0)} ({baris.persen === 999 ? "-" : `${baris.persen}%`}).</p>
          </Kartu>
          {bukaSel && <Kartu judul={tglPendek(bukaSel.tanggal)}><Rincian sel={bukaSel} /></Kartu>}
          {baris.perKegiatan.length > 0 && (
            <Kartu judul="Per kegiatan bulan ini">
              <ul className="m-0 list-none space-y-1 p-0 text-[13.5px]">{baris.perKegiatan.map((k) => <li key={String(k.kegiatanId)} className="flex justify-between gap-3"><span>{k.kegiatan}</span><b>{fmt(k.poin, 0)} poin</b></li>)}</ul>
            </Kartu>
          )}
        </>
      )}
    </Halaman>
  );
}
