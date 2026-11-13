"use client";

// app/sigap/delego/beban/Terpadu.tsx
//
// (1 Nov 2026) Matriks beban TERPADU lintas kegiatan: seluruh pekerjaan pegawai (delegasi dari semua kegiatan dan pekerjaan kantor, penugasan lapangan,
// pelatihan, dan ketersediaan) dalam satu matriks per hari. Usulan yang belum disetujui hanya muncul sebagai bayangan (tidak membebani). Saringan kegiatan
// menyempitkan matriks ke satu kegiatan atau pekerjaan kantor; ringkasan per kegiatan menunjukkan ke mana waktu seseorang tersedot.

import { useEffect, useMemo, useRef, useState } from "react";
import { awalBulan, awalMinggu, tambahHari, tglPendek } from "@/lib/delego/hitung";
import { NAMA_KANTOR, rentangMinggu, susunRekap, type BarisRekap, type SaringanKegiatan, type SelRekap } from "@/lib/delego/rekap";
import { gradienLegenda, warnaBeban } from "@/lib/delego/warna";
import TombolSinkron from "../TombolSinkron";
import { useBahan, useRekap } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Batang, Galat, Info, Kartu, Kosong, Lencana, Memuat, fmt } from "../ui";
import SelectCari from "@/app/components/SelectCari";

const PUNCAK = 150;
const SASARAN = { min: 80, max: 100 } as const;
type Rentang = "pekan" | "bulan";

function hariDalamBulan(awal: string): string {
  const [y, m] = awal.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return akhir;
}

export default function Terpadu() {
  const { hari, pemberi } = useKonteksDelego();
  const [rentang, setRentang] = useState<Rentang>("pekan");
  const [geser, setGeser] = useState(0);
  const [kegiatan, setKegiatan] = useState<string>("semua");
  const [pilih, setPilih] = useState<{ akun: number; tanggal: string } | null>(null);

  const { dari, sampai } = useMemo(() => {
    if (rentang === "pekan") {
      const aw = tambahHari(awalMinggu(hari), geser * 7);
      return rentangMinggu(aw);
    }
    const [y, m] = awalBulan(hari).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + geser, 1)).toISOString().slice(0, 10);
    return { dari: d, sampai: hariDalamBulan(d) };
  }, [rentang, geser, hari]);

  const rekap = useRekap(dari, sampai);
  const bahan = useBahan();
  const saringan: SaringanKegiatan = kegiatan === "semua" ? null : kegiatan === "kantor" ? "kantor" : Number(kegiatan);

  const nama = useMemo(() => {
    const o: Record<number, string> = {};
    for (const l of rekap.data?.lapangan ?? []) o[l.kegiatan_id] = l.kegiatan;
    return o;
  }, [rekap.data]);

  const hasil = useMemo(() => {
    if (!rekap.data || !bahan.data) return null;
    return susunRekap({ orang: rekap.data.orang.filter((o) => o.jenis === "organik"), delegasi: bahan.data.delegasi, lapangan: rekap.data.lapangan, ketersediaan: rekap.data.ketersediaan, dari, sampai, namaKegiatan: nama, kegiatan: saringan });
  }, [rekap.data, bahan.data, dari, sampai, nama, saringan]);
  // daftar kegiatan untuk saringan diambil tanpa saringan supaya pilihan tidak menyusut sendiri
  const semuaKegiatan = useMemo(() => {
    if (!rekap.data || !bahan.data) return [];
    return susunRekap({ orang: rekap.data.orang, delegasi: bahan.data.delegasi, lapangan: rekap.data.lapangan, ketersediaan: rekap.data.ketersediaan, dari, sampai, namaKegiatan: nama, kegiatan: null }).kegiatan;
  }, [rekap.data, bahan.data, dari, sampai, nama]);

  // (13 Nov 2026, Fase 0) gulir kolom hari ini ke tampilan bila matriks lebih lebar dari layar (HP, tampilan bulan)
  const wadah = useRef<HTMLDivElement | null>(null);
  const kolomHariIni = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const w = wadah.current; const k = kolomHariIni.current;
    if (!w || !k || w.scrollWidth <= w.clientWidth) return;
    const kiri = k.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft - w.clientWidth / 2 + k.offsetWidth / 2;
    w.scrollLeft = Math.max(0, kiri);
  }, [hasil, rentang]);

  const terpilih: { baris: BarisRekap; sel: SelRekap } | null = useMemo(() => {
    if (!pilih || !hasil) return null;
    const baris = hasil.baris.find((b) => b.akun === pilih.akun);
    const sel = baris?.sel.find((s) => s.tanggal === pilih.tanggal);
    return baris && sel ? { baris, sel } : null;
  }, [pilih, hasil]);

  const judulRentang = rentang === "pekan" ? `${tglPendek(dari)} sampai ${tglPendek(sampai)}` : new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dari}T00:00:00Z`));
  const lebar = hasil ? hasil.tanggal.length : 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" role="group" aria-label="Rentang">
          {(["pekan", "bulan"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={rentang === k} onClick={() => { setRentang(k); setGeser(0); setPilih(null); }} className={`min-h-[38px] rounded-full border px-3.5 text-[13.5px] font-semibold ${rentang === k ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white"}`}>
              {k === "pekan" ? "Pekan" : "Bulan"}
            </button>
          ))}
        </div>
        <button type="button" className={KELAS.tombolKecil} onClick={() => setGeser((g) => g - 1)} aria-label="Sebelumnya">‹</button>
        <span className="min-w-[170px] text-center text-[14px] font-semibold">{judulRentang}</span>
        <button type="button" className={KELAS.tombolKecil} onClick={() => setGeser((g) => g + 1)} aria-label="Berikutnya">›</button>
        {geser !== 0 && <button type="button" className={KELAS.tombolKecil} onClick={() => setGeser(0)}>Hari ini</button>}
        {pemberi && <TombolSinkron sesudah={async () => { await bahan.muat(); await rekap.muat(); }} />}
        <SelectCari aria-label="Saring kegiatan" className={`${KELAS.isian} !w-auto min-w-[200px]`} value={kegiatan} onChange={(e) => { setKegiatan(e.target.value); setPilih(null); }}>
          <option value="semua">Semua kegiatan (rekap)</option>
          {semuaKegiatan.map((k) => (
            <option key={String(k.id)} value={k.id === null ? "kantor" : String(k.id)}>{k.id === null ? NAMA_KANTOR : k.nama}</option>
          ))}
        </SelectCari>
      </div>

      {(rekap.memuat || bahan.memuat) && !hasil && <Memuat />}
      {(rekap.galat || bahan.galat) && !hasil && <Galat>{rekap.galat ?? bahan.galat}</Galat>}
      {hasil && hasil.baris.length === 0 && <Kosong>Belum ada pegawai atau pekerjaan pada rentang ini.</Kosong>}
      {hasil && hasil.baris.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className={KELAS.kartu}><div className="text-[12.5px] text-[#3B4A57]">Pegawai</div><div className="text-[24px] font-bold">{hasil.ringkas.jumlah}</div></div>
            <div className={KELAS.kartu}><div className="text-[12.5px] text-[#3B4A57]">Sesuai sasaran</div><div className="text-[24px] font-bold text-[#0B524C]">{hasil.ringkas.sasaran}</div></div>
            <div className={KELAS.kartu}><div className="text-[12.5px] text-[#3B4A57]">Berlebih</div><div className="text-[24px] font-bold text-[#9B2C2C]">{hasil.ringkas.berlebih}</div></div>
            <div className={KELAS.kartu}><div className="text-[12.5px] text-[#3B4A57]">Longgar atau kosong</div><div className="text-[24px] font-bold text-[#1D3F6B]">{hasil.ringkas.ringan}</div></div>
            <div className={KELAS.kartu}><div className="text-[12.5px] text-[#3B4A57]">Kerja di akhir pekan atau libur</div><div className={`text-[24px] font-bold ${hasil.ringkas.lembur > 0 ? "text-[#8A4605]" : ""}`}>{hasil.ringkas.lembur}</div></div>
          </div>

          <Kartu judul="Beban per hari" kanan={<span className="text-[12px] text-[#3B4A57]">% dari kapasitas hari itu. Garis putus-putus: usulan belum disetujui.</span>}>
            {/* (13 Nov 2026, Fase 0 butir 7) Di HP 360 kolom hari ini (Jumat/akhir pekan) terpotong karena lebar minimal 420px dan kolom nama 110px.
                Kini pekan muat di 360 (nama 64px, hari 28px), grid diberi ruang 3px agar cincin hari ini tidak terpotong, dan kolom hari ini digulir ke tampilan. */}
            <div ref={wadah} className="overflow-x-auto">
              <div className="grid items-center gap-[2px] p-[3px] text-center text-[12px]" style={{ gridTemplateColumns: `minmax(64px,150px) repeat(${lebar}, minmax(28px, 1fr))`, minWidth: 70 + lebar * 30 }}>
                <div className="text-left font-semibold text-[#3B4A57]">Nama</div>
                {hasil.tanggal.map((t) => (
                  <div key={t} ref={t === hari ? kolomHariIni : undefined} title={tglPendek(t)} className={`rounded-md py-0.5 leading-tight ${t === hari ? "bg-[#0F6B63] font-bold text-white" : "font-semibold text-[#3B4A57]"}`}>
                    {rentang === "pekan" ? tglPendek(t).split(" ")[0] : ""}
                    <span className="block text-[11px] font-normal">{Number(t.slice(8, 10))}</span>
                  </div>
                ))}
                {hasil.baris.map((o) => (
                  <div key={o.akun} className="contents">
                    <div className="truncate pr-1 text-left text-[13px] font-semibold" title={`${o.nama}: ${o.persen}% (${fmt(o.total, 0)} dari ${fmt(o.kapasitas, 0)} poin)`}>{o.nama}</div>
                    {o.sel.map((c) => {
                      const w = c.kategori === "kosong" || c.kategori === "tidak_tersedia" ? null : warnaBeban(c.persen, SASARAN.min, SASARAN.max, PUNCAK);
                      const pilihIni = pilih?.akun === o.akun && pilih.tanggal === c.tanggal;
                      return (
                        <button
                          key={c.tanggal}
                          type="button"
                          onClick={() => setPilih(pilihIni ? null : { akun: o.akun, tanggal: c.tanggal })}
                          title={`${tglPendek(c.tanggal)}: ${fmt(c.poin, 0)} poin (${c.persen}%)${c.libur ? ` · ${c.libur}` : ""}${c.bayangan > 0 ? ` · usulan ${fmt(c.bayangan, 0)} poin` : ""}`}
                          className={`rounded-md py-1.5 text-[12px] ${w ? "font-bold" : c.kategori === "tidak_tersedia" ? "bg-[#E1E6EA] font-semibold text-[#3B4A57]" : "bg-[#F3F5F7] text-[#7A8793]"} ${c.tanggal === hari ? "ring-2 ring-[#0F6B63]" : ""} ${c.lembur ? "underline decoration-2 underline-offset-2" : ""} ${pilihIni ? "outline outline-2 outline-[#14212B]" : ""} ${c.bayangan > 0 ? "border border-dashed border-[#1D3F6B]" : "border border-transparent"}`}
                          style={w ? { backgroundColor: w.latar, color: w.teks } : undefined}
                        >
                          {c.kategori === "tidak_tersedia" ? (c.ketersediaan?.jenis === "cuti" ? "C" : c.ketersediaan?.jenis === "sakit" ? "S" : c.ketersediaan?.jenis === "dinas_luar" ? "DL" : "I") : w ? (c.persen === 999 ? "!" : rentang === "bulan" ? Math.round(c.persen / 10) * 10 : c.persen) : c.libur ? "L" : "·"}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="h-3 w-full rounded-full border border-[#D5DCE2]" style={{ backgroundImage: gradienLegenda(SASARAN.min, SASARAN.max, PUNCAK) }} />
              <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-[#3B4A57]">
                <span>0%</span><span>{SASARAN.min}% sampai {SASARAN.max}% = sasaran</span><span>{PUNCAK}%+</span>
                <span>C cuti · S sakit · I izin · DL dinas luar · L libur · <u>garis bawah</u> = akhir pekan atau libur yang dikerjakan</span>
              </div>
            </div>
            <p className="m-0 mt-2 text-[12.5px] text-[#3B4A57]">Aturan hitung: hari lapangan dan pelatihan dihitung satu hari penuh (sebesar kapasitas hari itu), ditambah delegasi yang jatuh di hari yang sama. Akhir pekan atau libur yang dikerjakan juga dihitung hari penuh dan diberi garis bawah (satu hari lapangan = 100%); jumlah orangnya tampil di ringkasan. Akhir pekan tanpa pekerjaan berkapasitas 0. Usulan yang belum disetujui tidak ikut dihitung.</p>
          </Kartu>

          {terpilih && (
            <Kartu judul={`${terpilih.baris.nama} · ${tglPendek(terpilih.sel.tanggal)}`} kanan={<button type="button" className={KELAS.tombolKecil} onClick={() => setPilih(null)}>Tutup</button>}>
              <div className="mb-2 text-[13.5px] text-[#3B4A57]">
                {fmt(terpilih.sel.poin, 1)} poin dari kapasitas {fmt(terpilih.sel.kapasitas, 0)} ({terpilih.sel.persen === 999 ? "tanpa kapasitas" : `${terpilih.sel.persen}%`})
                {terpilih.sel.libur ? ` · ${terpilih.sel.libur}` : ""}{terpilih.sel.lembur ? " · hari non-kerja yang dikerjakan" : ""}
                {terpilih.sel.ketersediaan ? ` · ${terpilih.sel.ketersediaan.jenis}${terpilih.sel.ketersediaan.status === "diajukan" ? " (diajukan)" : ""}` : ""}
              </div>
              {terpilih.sel.rincian.length === 0 ? <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada pekerjaan tercatat pada hari ini.</p> : (
                <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px]">
                  {terpilih.sel.rincian.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{r.judul ?? r.kegiatan}</b>{r.judul ? <span className="text-[#3B4A57]"> · {r.kegiatan}</span> : null}</span>
                      <span className="flex items-center gap-2"><Lencana nada={r.sumber === "delegasi" ? "hijau" : r.sumber === "pelatihan" ? "amber" : "biru"}>{r.sumber === "delegasi" ? "Delegasi" : r.sumber === "pelatihan" ? "Pelatihan" : "Lapangan"}</Lencana><b>{fmt(r.poin, 1)}</b></span>
                    </li>
                  ))}
                </ul>
              )}
              {terpilih.sel.bayangan > 0 && <div className="mt-2"><Info>Ditambah usulan belum disetujui sekitar {fmt(terpilih.sel.bayangan, 1)} poin (tidak termasuk di atas).</Info></div>}
            </Kartu>
          )}

          <Kartu judul="Rekap per pegawai dan kegiatan">
            <ul className="m-0 list-none divide-y divide-[#EEF1F4] p-0">
              {hasil.baris.map((o) => (
                <li key={o.akun} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold">{o.nama}</span>
                    <span className="flex items-center gap-2">
                      <Lencana nada={o.kategori === "berlebih" ? "merah" : o.kategori === "sasaran" ? "hijau" : o.kategori === "tidak_tersedia" ? "abu" : "biru"}>
                        {o.kategori === "berlebih" ? "Berlebih" : o.kategori === "sasaran" ? "Sesuai sasaran" : o.kategori === "tidak_tersedia" ? "Tidak tersedia" : "Longgar"}
                      </Lencana>
                      <span className="w-14 text-right text-[14px] font-bold">{o.persen === 999 ? "-" : `${o.persen}%`}</span>
                    </span>
                  </div>
                  <div className="mt-1.5"><Batang persen={o.persen === 999 ? 100 : (o.persen / PUNCAK) * 100} nada={o.kategori === "berlebih" ? "merah" : o.kategori === "ringan" || o.kategori === "kosong" ? "amber" : "hijau"} tinggi={9} /></div>
                  <div className="mt-1 text-[12px] text-[#3B4A57]">
                    {fmt(o.total, 0)} poin dari kapasitas {fmt(o.kapasitas, 0)}
                    {o.bayangan > 0 ? ` · usulan belum disetujui ${fmt(o.bayangan, 0)}` : ""}
                  </div>
                  {o.perKegiatan.length > 0 && (
                    <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
                      {o.perKegiatan.map((k) => <li key={String(k.kegiatanId)}><Lencana nada={k.kegiatanId === null ? "abu" : "hijau"}>{k.kegiatan}: {fmt(k.poin, 0)}</Lencana></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Kartu>
        </>
      )}
    </div>
  );
}
