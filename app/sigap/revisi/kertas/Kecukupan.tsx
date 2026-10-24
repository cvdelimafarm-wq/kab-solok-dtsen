"use client";

// app/sigap/revisi/kertas/Kecukupan.tsx
//
// (24 Okt 2026, tahap 4n) Panel "Kecukupan KRO terhadap RAB" papan 1 mockup: status sekarang (Semula) dan usulan (Menjadi) per kelompok belanja,
// faktor kebutuhan dan toleransi dari Master (hanya dibaca di sini), kategori prioritas, serta ringkasan buku selisih untuk nota atau surat.
// Hanya membaca. Logika murni: lib/keu/kecukupan.ts.

import { useMemo } from "react";
import { rupiah } from "@/lib/keu/ro";
import { LABEL_JENIS_JADWAL } from "@/lib/keu/revisi";
import type { BarisBuku, PrioritasMaster } from "@/lib/keu/matriks";
import type { BarisRabKro } from "@/lib/keu/rabKro";
import { dasarKebutuhan, FAKTOR_BAWAAN, hitungKecukupan, LABEL_KECUKUPAN, TOLERANSI_BAWAAN, teksCakupan, teksFaktor, WARNA_STATUS_KECUKUPAN } from "@/lib/keu/kecukupan";
import { Catatan, Chip, judulKartu, kartu } from "../../keu-ui";

export type ParamMaster = { kode: string; nilai: number | string };
const angkaParam = (p: ParamMaster[], kode: string, bawaan: number): number => { const v = Number(p.find((x) => x.kode === kode)?.nilai); return Number.isFinite(v) && v > 0 ? v : bawaan; };
const koma = (v: number) => String(v).replace(".", ",");
const NAMA_KEL_BUKU: Record<string, string> = { "51": "Pegawai (51)", "524": "Perjalanan dinas (524)", "52L": "Barang dan jasa (52 selain 524)", "53": "Modal (53)" };

export function PanelKecukupan({ baris, kro, param, prioritas, buku, jenisJadwal }: { baris: BarisRabKro[]; kro: string; param: ParamMaster[]; prioritas: PrioritasMaster[]; buku: BarisBuku[]; jenisJadwal: string }) {
  const faktor = angkaParam(param, "faktor_kebutuhan", FAKTOR_BAWAAN), toleransi = angkaParam(param, "toleransi_cukup", TOLERANSI_BAWAAN);
  const h = useMemo(() => hitungKecukupan(baris, faktor, toleransi), [baris, faktor, toleransi]);
  const pokTanpaRab = useMemo(() => baris.filter((b) => b.rab === null).reduce((s, b) => s + b.pok, 0), [baris]);
  const dipa = jenisJadwal.startsWith("dipa");
  const totalBuku = buku.reduce((s, b) => s + b.kurang, 0);
  const perKel = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of buku) m.set(b.kelompok, (m.get(b.kelompok) ?? 0) + b.kurang);
    return [...m.entries()];
  }, [buku]);
  const dasar = useMemo(() => dasarKebutuhan(kro, h, faktor, toleransi), [kro, h, faktor, toleransi]);
  return (
    <section className={`${kartu} flex flex-col gap-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[80ch]">
          <h2 className={judulKartu}>Kecukupan KRO terhadap RAB · {kro}</h2>
          <p className="text-[12.5px] text-[#5B6B84]">POK adalah angka resmi dan satu-satunya yang direvisi. RAB hanya acuan kebutuhan: dibaca, tidak pernah ditulis ke POK. Dihitung per KRO dan per kelompok belanja: 51, 524xxx (perjalanan dinas), 52xxxx selain 524, dan 53. Revisi POK tidak boleh melintasi kelompok itu, jadi kelebihan di satu kelompok tidak dapat menutup kekurangan di kelompok lain.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5B6B84]">
          <span>RAB menutup</span><span className="rounded-md border border-[#DCE3EE] bg-[#F5F8FE] px-2 py-1 font-mono font-semibold text-[#0F2A52]">{koma(faktor)}</span><span>dari kebutuhan riil (kebutuhan = RAB ÷ faktor)</span>
          <span>Toleransi Cukup ±</span><span className="rounded-md border border-[#DCE3EE] bg-[#F5F8FE] px-2 py-1 font-mono font-semibold text-[#0F2A52]">{Math.round(toleransi * 100)}%</span>
        </div>
      </div>
      <p className="text-[12px] text-[#7A8AA3]">{teksFaktor(faktor)} Nilai faktor dan toleransi berlaku untuk seluruh kantor dan diatur di Master data.</p>
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[1080px] text-left text-[12.5px]">
          <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>
            <th className="px-2.5 py-2">Kelompok</th><th className="px-2.5 py-2 text-right">Item ber-RAB</th><th className="px-2.5 py-2 text-right">POK sekarang</th><th className="px-2.5 py-2 text-right">RAB</th><th className="px-2.5 py-2 text-right">Kebutuhan riil</th>
            <th className="px-2.5 py-2">Status sekarang</th><th className="px-2.5 py-2 text-right">POK usulan (Menjadi)</th><th className="px-2.5 py-2">Status usulan</th><th className="px-2.5 py-2">Keterangan sesudah revisi</th>
          </tr></thead>
          <tbody>{h.map((a, i) => (
            <tr key={a.kode} className={`border-t border-[#EEF2F7] align-top ${i === 0 ? "bg-[#F5F8FE] font-semibold" : ""}`}>
              <td className="px-2.5 py-2 font-semibold">{a.nama}</td>
              <td className="px-2.5 py-2 text-right font-mono">{a.nAda} dari {a.nItem}</td>
              <td className="px-2.5 py-2 text-right font-mono">{rupiah(a.p0)}</td><td className="px-2.5 py-2 text-right font-mono">{rupiah(a.r)}</td><td className="px-2.5 py-2 text-right font-mono">{rupiah(a.k)}</td>
              <td className="px-2.5 py-2"><Chip warna={WARNA_STATUS_KECUKUPAN[a.st0]}>{LABEL_KECUKUPAN[a.st0]}</Chip></td>
              <td className="px-2.5 py-2 text-right font-mono">{rupiah(a.p1)}</td>
              <td className="px-2.5 py-2"><Chip warna={WARNA_STATUS_KECUKUPAN[a.st1]}>{LABEL_KECUKUPAN[a.st1]}</Chip></td>
              <td className="min-w-[220px] px-2.5 py-2 text-[12px] font-normal text-[#44546F]">{a.ket}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[12px]">
        <Chip warna="merah">Kurang: POK &lt; RAB</Chip><Chip warna="kuning">Tipis: RAB ≤ POK &lt; kebutuhan</Chip><Chip warna="hijau">Cukup: kebutuhan ≤ POK ≤ kebutuhan + toleransi</Chip><Chip warna="biru">Lebih: ada sisa riil</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#5B6B84]">
        <span>Kategori prioritas (atas dipenuhi lebih dulu):</span>
        {prioritas.length === 0 ? <span>belum ada</span> : prioritas.map((p) => <Chip key={p.kode} warna="ungu">{p.nama}</Chip>)}
        <span className="text-[#7A8AA3]">Urutan dan nama diatur di Master data; pilihan per item di tab RAB.</span>
      </div>
      <p className="text-[12px] text-[#7A8AA3]">{teksCakupan(h[0], pokTanpaRab)}</p>
      {totalBuku > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[13px] font-semibold text-[#0F2A52]">Buku selisih: kebutuhan belum terdanai</span><Chip warna="merah">{rupiah(totalBuku)}</Chip></div>
          <p className="text-[12.5px] text-[#44546F]">
            {dipa
              ? "Revisi DIPA: kekurangan pagu per KRO tidak ditutup sendiri oleh operator. Daftarnya diteruskan ke PPK, yang memutuskan menerima semua usulan, menerima sebagian, atau menunda. Yang diterima menjadi bahan usulan Revisi DIPA (R-01); yang ditunda tetap tercatat di sini."
              : "Revisi POK: dana tidak dapat ditambah dan tidak dapat melintasi kelompok belanja. Satu-satunya pilihan menutup kekurangan adalah menurunkan volume item yang boleh ditunda; kekurangan yang tersisa tetap tercatat di sini, jadi RAB tidak perlu dibuat ulang."}
          </p>
          <div className="flex flex-wrap gap-1.5">{perKel.map(([k, v]) => <Chip key={k} warna="abu">{NAMA_KEL_BUKU[k] ?? k}: {rupiah(v)}</Chip>)}</div>
          {dipa && (
            <div className="rounded-md border border-[#DCE3EE] bg-white px-2.5 py-1.5 text-[12.5px]">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">Diteruskan ke PPK ({LABEL_JENIS_JADWAL[jenisJadwal] ?? "Revisi DIPA"})</div>
              Kekurangan pagu KRO terhadap RAB {rupiah(totalBuku)} masuk daftar PPK dan menunggu keputusan (terima semua, terima sebagian, atau tunda) pada kartu keputusan di bawah.
            </div>
          )}
        </div>
      )}
      <Catatan><b>Dasar tertulis untuk nota atau surat:</b> {dasar}</Catatan>
    </section>
  );
}
