"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/AngkaRujukan.tsx
//
// (14 Nov 2026, Fase 3) Kartu ANGKA RUJUKAN: dua belas angka yang dibaca lebih dari satu layar, satu sumber (lib/keu/rujukan.ts). Hanya baca.
// Hari dibayar dibaca dari RAB survei (keu_rab_survei_draf) dan dibandingkan dengan batas hari kerja penugasan; perubahan dilakukan di RAB survei
// (modal pembaruan), bukan di sini. Pembaruan terakhir dari keu_v_rujukan_pembaruan.

import { useMemo, useState } from "react";
import { Chip, judulKartu, kartu } from "@/app/sigap/keu-ui";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";
import { urlBaca } from "@/lib/keu/ro";
import { NAMA_PERAN, normalisasiLanjutan, type IsiLanjutan, type KodePeran } from "@/lib/keu/lanjutan";
import { angkaRujukan, bandingHariPenugasan, hariDibayarPerPeran, teksBatas, type BarisPenugasanRujukan } from "@/lib/keu/rujukan";

type Versi = { id: number; ver: number; status: string; waktu: string; isi?: unknown };
type Draf = { rab_id: number; ident_id: number; isi: { hari?: Record<string, string> } | null };
type Riwayat = { id: number; kunci: string; asal: string; tujuan: string; jumlah_terdampak: number; baru: { peran?: string; maks_hari?: number | null } | null; oleh_nama: string | null; at: string };
const isian = "h-8 w-full min-w-0 rounded-md border border-[#C9D6EA] bg-white px-1.5 text-[12px]";

export default function AngkaRujukan({ identId, isi, ver, status, tanggal, pulsaCetak }: { identId: number; isi: IsiLanjutan | null; ver: number | null; status: string | null; tanggal?: string; pulsaCetak?: string }) {
  const draf = useBacaKeu<Draf>(urlBaca("keu_rab_survei_draf", { ident_id: identId }, { batas: 10 }));
  const pen = useBacaKeu<BarisPenugasanRujukan>(urlBaca("keu_v_rujukan_penugasan", { ident_id: identId }, { batas: 200 }));
  const riw = useBacaKeu<Riwayat>(urlBaca("keu_v_rujukan_pembaruan", { ident_id: identId }, { batas: 5, urut: "-at" }));
  const hari = useMemo(() => hariDibayarPerPeran(Object.assign({}, ...(draf.baris ?? []).map((d) => d.isi?.hari ?? {}))), [draf.baris]);
  const selisih = useMemo(() => bandingHariPenugasan(hari, pen.baris ?? []), [hari, pen.baris]);
  const angka = useMemo(() => angkaRujukan(isi, hari, { ver, status, tanggal, pulsaCetak }), [isi, hari, ver, status, tanggal, pulsaCetak]);
  // (Fase 3) angka terkunci per versi: bandingkan dengan versi lanjutan sebelumnya (isi tiap versi tersimpan, tidak pernah ditimpa)
  const versi = useBacaKeu<Versi>(urlBaca("keu_v_ident_lanjutan_versi", { ident_id: identId }, { batas: 40, urut: "-ver", kolom: ["id", "ver", "status", "waktu"] }));
  const [pilihVer, setPilihVer] = useState<number | null>(null);
  const isiVer = useBacaKeu<Versi>(pilihVer === null ? null : urlBaca("keu_v_ident_lanjutan_versi", { ident_id: identId, ver: pilihVer }, { batas: 1, kolom: ["id", "ver", "status", "waktu", "isi"] }));
  const angkaVer = useMemo(() => {
    const b = isiVer.baris?.[0];
    return pilihVer !== null && b?.isi ? angkaRujukan(normalisasiLanjutan(b.isi), hari, { ver: b.ver, status: b.status, tanggal, pulsaCetak }) : null;
  }, [isiVer.baris, pilihVer, hari, tanggal, pulsaCetak]);
  const nilaiVer = useMemo(() => new Map((angkaVer ?? []).map((a) => [a.kode, a.nilai])), [angkaVer]);
  const pilihanVer = (versi.baris ?? []).filter((v) => v.ver !== ver);
  const [cari, setCari] = useState("");
  const tampil = angka.filter((a) => !cari.trim() || `${a.kode} ${a.label} ${a.nilai} ${a.dipakai}`.toLowerCase().includes(cari.trim().toLowerCase()));
  const beda = selisih.filter((s) => !s.sama);
  const lebih = selisih.filter((s) => s.lebih.orang > 0);

  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-label="Angka rujukan">
      <div>
        <h2 className={`${judulKartu} m-0`}>Angka rujukan</h2>
        <p className="m-0 mt-0.5 text-[12.5px] text-[#5B6B84]">
          Angka yang dibaca lebih dari satu layar; diambil dari satu sumber, terkunci per versi identifikasi. Ubah di sumbernya: identifikasi lanjutan, atau hari dibayar di RAB survei.
        </p>
      </div>
      {beda.length > 0 && (
        <p className="m-0 rounded-lg border border-[#F0D48A] bg-[#FFF6DD] px-3 py-2 text-[12.5px] leading-snug text-[#5C3D00]">
          Hari dibayar di RAB berbeda dengan batas hari kerja penugasan:{" "}
          {beda.map((s) => `${NAMA_PERAN[s.peran as KodePeran]} ${s.hariRab} hari vs ${teksBatas(s.penugasan)} (${s.kegiatan_nama})`).join("; ")}. Samakan lewat RAB survei (bagian hari dibayar).
        </p>
      )}
      {lebih.length > 0 && (
        <p className="m-0 rounded-lg border border-[#F3C9CB] bg-[#FFF5F5] px-3 py-2 text-[12.5px] leading-snug text-[#7A1D22]">
          Hari kerja yang sudah dipilih melebihi hari dibayar RAB:{" "}
          {lebih.map((s) => `${s.lebih.orang} ${NAMA_PERAN[s.peran as KodePeran]} (sampai ${s.lebih.maksDipilih} hari, RAB ${s.hariRab})`).join("; ")}. Putuskan: naikkan hari dibayar di RAB, atau minta petugas melepas hari di menu Hari kerja.
        </p>
      )}
      {pilihanVer.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
          Bandingkan dengan versi
          <select className="min-h-[34px] rounded-md border border-[#C5D0E2] bg-white px-2 text-[12.5px]" value={pilihVer ?? ""} onChange={(e) => setPilihVer(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">— tidak —</option>
            {pilihanVer.map((v) => <option key={v.id} value={v.ver}>v{v.ver} · {v.status === "final" ? "Final" : "Draf"} · {new Date(v.waktu).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</option>)}
          </select>
          {angkaVer && <span className="text-[12px] text-[#6B7A90]">Baris yang berubah ditandai kuning.</span>}
        </label>
      )}
      <div className="relative w-full min-w-0 max-w-full overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#F7F9FC] text-[11px] uppercase tracking-wide text-[#5B6B84]">
              <th className="px-2 py-1.5">Angka</th>
              <th className="px-2 py-1.5">Nilai</th>
              {angkaVer && <th className="px-2 py-1.5">v{pilihVer}</th>}
              <th className="px-2 py-1.5">Sumber</th>
              <th className="px-2 py-1.5">Dibaca oleh</th>
            </tr>
            <tr>
              <th className="px-1 py-1" colSpan={angkaVer ? 5 : 4}>
                <input aria-label="Saring angka rujukan" className={isian} value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari angka, nilai, atau layar" />
              </th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((a) => (
              <tr key={a.kode} className={`border-t border-[#EEF2F6] align-top ${angkaVer && nilaiVer.get(a.kode) !== a.nilai ? "bg-[#FFF8E1]" : ""}`}>
                <td className="px-2 py-1.5"><span className="text-[#5B6B84]">{a.kode}</span> <b>{a.label}</b></td>
                <td className="px-2 py-1.5 font-semibold">{a.nilai}{a.kode === "R06" && selisih.length > 0 && <> <Chip warna={beda.length ? "kuning" : "hijau"}>{beda.length ? "beda dgn penugasan" : "sama dgn penugasan"}</Chip></>}</td>
                {angkaVer && <td className="px-2 py-1.5 text-[#44546F]">{nilaiVer.get(a.kode) ?? "—"}</td>}
                <td className="px-2 py-1.5 text-[#44546F]">{a.sumber}</td>
                <td className="px-2 py-1.5 text-[#44546F]">{a.dipakai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(riw.baris ?? []).length > 0 && (
        <div className="text-[12px] text-[#5B6B84]">
          <p className="m-0 font-semibold text-[#44546F]">Pembaruan terakhir</p>
          <ul className="m-0 mt-0.5 list-disc pl-5">
            {(riw.baris ?? []).map((r) => (
              <li key={r.id}>
                {new Date(r.at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.asal === "rab" ? "dari RAB" : r.asal} ke {r.tujuan}:{" "}
                {r.baru?.peran ? `${NAMA_PERAN[r.baru.peran as KodePeran] ?? r.baru.peran} ${r.baru.maks_hari ?? "tanpa batas"} hari` : r.kunci} ({r.jumlah_terdampak} diubah{r.oleh_nama ? `, oleh ${r.oleh_nama}` : ""})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
