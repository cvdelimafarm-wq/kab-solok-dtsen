"use client";

// app/sigap/revisi/kertas/Geseran.tsx
//
// (24 Okt 2026) Tahap 4l: tombol dan panel "Turunkan item yang boleh ditunda", "Terapkan RAB dalam batas pagu" (Usulan geseran minimal, Mode Pagu Tetap),
// dan "Terapkan RAB penuh (Revisi DIPA)" pada halaman Kertas Kerja per KRO (papan 1 mockup). Panel hanya MENYUSUN rencana (lib/keu/geseranMinimal.ts)
// dan menampilkannya; tidak ada yang ditulis sebelum tombol Terapkan ditekan. Penulisan: keu_tulis keu_kk_baris (volume/harga Menjadi),
// penggenap baru (argsPenggenap), dan catatan keu_kk_geseran. RAB tidak pernah diubah. Hak dan aturan ditegakkan basis data.

import { useMemo, useState } from "react";
import { argsPenggenap } from "@/lib/keu/kk";
import {
  OPSI_GESERAN_AWAL, periksaRencana, rencanakanGeseran, rencanakanRabPenuh, type OpsiGeseran,
} from "@/lib/keu/geseranMinimal";
import type { BarisRabRow } from "@/lib/keu/rab";
import type { BarisMx, PrioritasMaster } from "@/lib/keu/matriks";
import type { BarisRabKro } from "@/lib/keu/rabKro";
import { angka, rupiah } from "@/lib/keu/ro";
import { Catatan, Chip, Galat, judulKartu, kartu, tombolKecil, tombolUtama } from "../../keu-ui";
import { tulisKeuKlien } from "../../ro/useKeu";

type Mode = null | "geser" | "tunda" | "penuh";
const NAMA_KEL: Record<string, string> = { "51": "51 Pegawai", "524": "524 Perjalanan dinas", "52L": "52 Barang/jasa", "53": "53 Modal" };

export function AksiRabPagu({ jadwal, jenisJadwal, baris, rab, rincian, prioritas, bisaUbah, namaAkun, sesudah }: {
  jadwal: number; jenisJadwal: string; baris: BarisMx[]; rab: BarisRabKro[] | null; rincian: Map<number, BarisRabRow[]>; prioritas: PrioritasMaster[];
  bisaUbah: (ro: string) => boolean; namaAkun: Map<string, string>; sesudah: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [opsi, setOpsi] = useState<OpsiGeseran>(OPSI_GESERAN_AWAL);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);
  const modeTetap = jenisJadwal === "pok" || jenisJadwal === "administrasi";
  const dapat = useMemo(() => baris.filter((b) => bisaUbah(b.ro_kode)), [baris, bisaUbah]);
  const urut = useMemo(() => new Map(prioritas.map((p) => [p.kode, Number(p.urut)])), [prioritas]);
  const opsiAktif: OpsiGeseran = mode === "tunda" ? { ...opsi, turunkanTunda: true } : opsi;
  const rg = useMemo(() => (mode === "geser" || mode === "tunda") && rab ? rencanakanGeseran(dapat, rab, urut, opsiAktif) : null, [mode, dapat, rab, urut, opsiAktif]);
  const rp = useMemo(() => (mode === "penuh" && rab ? rencanakanRabPenuh(dapat, rab, rincian) : null), [mode, dapat, rab, rincian]);
  const tidakSeimbang = rg ? periksaRencana(rg) : [];

  const tutup = () => { setMode(null); setGalat(null); };
  const buka = (m: Mode) => { setMode(m); setGalat(null); setSelesai(null); };

  const terapkanGeseran = async () => {
    if (!rg || tidakSeimbang.length) return;
    setSibuk(true); setGalat(null);
    let g: string | null = null;
    for (const p of rg.perubahan) {
      const data = p.peran === "penggenap" ? { harga_menjadi: p.hargaKe } : { vol_menjadi: p.volKe };
      const r = await tulisKeuKlien("keu_kk_baris", "update", data, { id: p.id });
      if (!r.ok) { g = `${p.uraian}: ${r.pesan}`; break; }
    }
    if (!g) for (const x of rg.penggenapBaru) {
      const r = await tulisKeuKlien("keu_kk_baris", "insert", argsPenggenap(jadwal, x.ro, x.komponen, x.akun, namaAkun.get(x.akun), x.jumlah));
      if (!r.ok) { g = `Dana penggenap ${x.ro}: ${r.pesan}`; break; }
    }
    if (!g) for (const a of rg.aliran) {
      if (a.penerimaId === null) continue;
      const r = await tulisKeuKlien("keu_kk_geseran", "insert", { jadwal_id: jadwal, donor_id: a.donorId, penerima_id: a.penerimaId, jumlah: a.jumlah, catatan: "Usulan geseran minimal" });
      if (!r.ok) { g = `Catatan geseran: ${r.pesan}`; break; }
    }
    await sesudah();
    setSibuk(false);
    if (g) setGalat(g); else { setSelesai(`Geseran diterapkan: ${rupiah(rg.dipindah)} dipindah pada ${new Set(rg.perubahan.map((p) => p.ro)).size} RO.`); setMode(null); }
  };

  const terapkanPenuh = async () => {
    if (!rp) return;
    setSibuk(true); setGalat(null);
    let g: string | null = null;
    for (const u of rp.ubah) {
      const r = await tulisKeuKlien("keu_kk_baris", "update", { vol_menjadi: u.volKe, harga_menjadi: u.hargaKe }, { id: u.id });
      if (!r.ok) { g = `${u.uraian}: ${r.pesan}`; break; }
    }
    await sesudah();
    setSibuk(false);
    if (g) setGalat(g); else { setSelesai(`RAB penuh diterapkan pada ${rp.ubah.length} item; selisih total ${rp.selisihTotal >= 0 ? "+" : "-"}${rupiah(Math.abs(rp.selisihTotal))}.`); setMode(null); }
  };

  const adaRab = rab !== null;
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modeTetap && <button type="button" disabled={!adaRab || sibuk} className={mode === "tunda" ? tombolUtama : tombolKecil} title="Hanya Revisi POK: bila dana penggenap dan kelebihan tidak cukup, turunkan volume item yang boleh ditunda; selisih tetap dicatat di Buku selisih." onClick={() => buka(mode === "tunda" ? null : "tunda")}>Turunkan item yang boleh ditunda</button>}
        <button type="button" disabled={!adaRab || sibuk} className={mode === "geser" ? tombolUtama : `${tombolKecil} !border-[#1F5FD1] !text-[#1F5FD1]`} title="Mode Pagu Tetap: memindahkan dana seperlunya di dalam RO dan kelompok belanja yang sama (524xxx hanya dengan 524xxx, 52xxxx lain hanya dengan 52xxxx lain). RAB hanya dibaca." onClick={() => buka(mode === "geser" ? null : "geser")}>Terapkan RAB dalam batas pagu</button>
        <button type="button" disabled={!adaRab || sibuk} className={mode === "penuh" ? tombolUtama : tombolKecil} title="Mode Revisi DIPA: seluruh RAB masuk ke kolom Menjadi; selisih total menjadi perubahan pagu." onClick={() => buka(mode === "penuh" ? null : "penuh")}>Terapkan RAB penuh (Revisi DIPA)</button>
        <span className="text-[12px] text-[#5B6B84]">Kolom Menjadi dapat diketik langsung, rumus sederhana seperti =18*2 diterima. RAB tidak pernah diubah oleh tombol ini.</span>
      </div>
      {selesai && <Catatan>{selesai}</Catatan>}

      {(mode === "geser" || mode === "tunda") && rg && (
        <section className={`${kartu} flex flex-col gap-2.5 border-[#1F5FD1]`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={judulKartu}>Usulan geseran minimal (Mode Pagu Tetap)</h3>
            <button type="button" className={tombolKecil} onClick={tutup}>Batal</button>
          </div>
          <p className="text-[12.5px] text-[#44546F]">Urutan penerima: menurut kategori prioritas yang diatur kantor (bawaan Inti, Penting, Dapat ditunda). Sumber diambil dari Dana penggenap dan item selesai dulu, lalu yang berlebih terbesar, tanpa turun di bawah RAB-nya maupun Booked + Realisasi (R-06). Item tanpa RAB tidak dijadikan donor kecuali dicentang. Hanya dana dalam RO dan kelompok yang sama yang dipindah (51, 524xxx, 52xxxx selain 524, 53).</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={opsi.tanpaRab} onChange={(e) => setOpsi({ ...opsi, tanpaRab: e.target.checked })} />Item yang belum punya RAB boleh menjadi donor (sampai Booked + Realisasi)</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={opsiAktif.turunkanTunda} disabled={mode === "tunda"} onChange={(e) => setOpsi({ ...opsi, turunkanTunda: e.target.checked })} />Turunkan volume item yang boleh ditunda untuk menutup sisa kekurangan (selisih tetap dicatat)</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={opsi.tampungPenggenap} onChange={(e) => setOpsi({ ...opsi, tampungPenggenap: e.target.checked })} />Tampung sisa di atas RAB ke baris Dana penggenap per akun (akun 524: Perjalanan dinas Kabupaten; akun 52 lain: nama akun + Kabupaten)</label>
          </div>
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            <Chip warna="biru">Kekurangan sekarang {rupiah(rg.kekuranganAwal)}</Chip>
            <Chip warna={rg.kekuranganSesudah === 0 ? "hijau" : "kuning"}>Sesudah geseran {rupiah(rg.kekuranganSesudah)}</Chip>
            <Chip warna="abu">Dipindah {rupiah(rg.dipindah)}</Chip>
          </div>
          {rg.aliran.length === 0 ? (
            <p className="text-[13px] text-[#5B6B84]">Tidak ada yang perlu dipindah: tidak ada item ber-RAB yang POK-nya kurang, atau tidak ada donor yang tersedia.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
              <table className="w-full min-w-[760px] text-left text-[12.5px]">
                <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">RO</th><th className="px-2.5 py-2">Kel.</th><th className="px-2.5 py-2">Dari (donor)</th><th className="px-2.5 py-2">Ke (penerima)</th><th className="px-2.5 py-2 text-right">Jumlah</th></tr></thead>
                <tbody>{rg.aliran.map((a, i) => (
                  <tr key={i} className="border-t border-[#EEF2F7]"><td className="px-2.5 py-1.5 font-mono text-[11.5px]">{a.ro.slice(-3)}</td><td className="px-2.5 py-1.5">{NAMA_KEL[a.kelompok] ?? a.kelompok}</td><td className="px-2.5 py-1.5">{a.donorUraian}</td><td className="px-2.5 py-1.5">{a.penerimaUraian}</td><td className="px-2.5 py-1.5 text-right font-mono font-semibold">{angka(a.jumlah)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {rg.perubahan.length > 0 && (
            <details className="text-[12.5px]"><summary className="cursor-pointer font-semibold text-[#0F2A52]">Perubahan pada kolom Menjadi ({rg.perubahan.length} baris{rg.penggenapBaru.length ? `, ${rg.penggenapBaru.length} Dana penggenap baru` : ""})</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {rg.perubahan.map((p) => <li key={p.id}>{p.uraian}: {p.peran === "penggenap" ? `harga ${angka(p.hargaDari)} → ${angka(p.hargaKe)}` : `volume ${angka(p.volDari)} → ${angka(p.volKe)}`} (jumlah {angka(p.jumlahDari)} → {angka(p.jumlahKe)})</li>)}
                {rg.penggenapBaru.map((x, i) => <li key={`pg${i}`}>Dana penggenap baru RO {x.ro.slice(-3)} akun {x.akun}: {angka(x.jumlah)}</li>)}
              </ul>
            </details>
          )}
          {rg.dilewati.length > 0 && <Catatan>{rg.dilewati.map((d, i) => <span key={i} className="block">RO {d.ro.slice(-3)} {NAMA_KEL[d.kelompok] ?? d.kelompok}: {d.alasan}</span>)}</Catatan>}
          {tidakSeimbang.length > 0 && <Galat pesan={tidakSeimbang} />}
          <Galat pesan={galat} />
          <div className="flex gap-2">
            <button type="button" disabled={sibuk || rg.perubahan.length === 0 || tidakSeimbang.length > 0} className={tombolUtama} onClick={() => void terapkanGeseran()}>{sibuk ? "Menerapkan…" : "Terapkan geseran"}</button>
            <button type="button" disabled={sibuk} className={tombolKecil} onClick={tutup}>Batal</button>
          </div>
        </section>
      )}

      {mode === "penuh" && rp && (
        <section className={`${kartu} flex flex-col gap-2.5 border-[#1F5FD1]`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={judulKartu}>Terapkan RAB penuh (Revisi DIPA)</h3>
            <button type="button" className={tombolKecil} onClick={tutup}>Batal</button>
          </div>
          <p className="text-[12.5px] text-[#44546F]">Seluruh RAB masuk ke kolom Menjadi; selisih total menjadi perubahan pagu. Pada jadwal Revisi POK atau administrasi, pagu RO dan KRO harus tetap, sehingga pemeriksaan R-01, R-05, dan R-16 akan merah; pakailah hanya untuk Revisi DIPA.</p>
          {jenisJadwal !== "dipa_djpb" && jenisJadwal !== "dipa_dja" && <Catatan>Jadwal ini bukan Revisi DIPA. Pagu akan berubah sebesar selisih di bawah dan ditandai merah pada pemeriksaan sampai Anda mengembalikannya (Kembali ke semula).</Catatan>}
          {rp.ubah.length === 0 ? <p className="text-[13px] text-[#5B6B84]">Tidak ada item yang perlu diubah: RAB sudah sama dengan POK Menjadi, atau belum ada RAB.</p> : (
            <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
              <table className="w-full min-w-[760px] text-left text-[12.5px]">
                <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">RO</th><th className="px-2.5 py-2">Item</th><th className="px-2.5 py-2 text-right">Volume</th><th className="px-2.5 py-2 text-right">Harga</th><th className="px-2.5 py-2 text-right">Jumlah sekarang</th><th className="px-2.5 py-2 text-right">Jumlah RAB</th></tr></thead>
                <tbody>{rp.ubah.map((u) => (
                  <tr key={u.id} className="border-t border-[#EEF2F7]"><td className="px-2.5 py-1.5 font-mono text-[11.5px]">{u.ro.slice(-3)}</td><td className="px-2.5 py-1.5">{u.uraian}</td><td className="px-2.5 py-1.5 text-right font-mono">{angka(u.volDari)} → {angka(u.volKe)}</td><td className="px-2.5 py-1.5 text-right font-mono">{angka(u.hargaDari)} → {angka(u.hargaKe)}</td><td className="px-2.5 py-1.5 text-right font-mono">{angka(u.jumlahDari)}</td><td className="px-2.5 py-1.5 text-right font-mono font-semibold">{angka(u.jumlahKe)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="text-[12.5px] font-semibold text-[#0F2A52]">Selisih total pagu: {rp.selisihTotal >= 0 ? "+" : "-"}{rupiah(Math.abs(rp.selisihTotal))}</p>
          {rp.dilewati.length > 0 && <Catatan>{rp.dilewati.map((d) => <span key={d.id} className="block">{d.uraian}: {d.alasan}</span>)}</Catatan>}
          <Galat pesan={galat} />
          <div className="flex gap-2">
            <button type="button" disabled={sibuk || rp.ubah.length === 0} className={tombolUtama} onClick={() => void terapkanPenuh()}>{sibuk ? "Menerapkan…" : "Terapkan RAB penuh"}</button>
            <button type="button" disabled={sibuk} className={tombolKecil} onClick={tutup}>Batal</button>
          </div>
        </section>
      )}
    </div>
  );
}
