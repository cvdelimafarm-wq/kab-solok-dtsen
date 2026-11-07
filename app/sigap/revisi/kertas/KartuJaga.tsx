"use client";

// app/sigap/revisi/kertas/KartuJaga.tsx
//
// (7 Nov 2026, tahap 4b) Kartu "Batas revisi ini": aturan penjagaan menurut jenis jadwal yang ditetapkan PPK, neraca satker (selisih pagu per KRO, total
// satker, 524xxx), temuan merah/kuning dari basis data (keu_v_kk_jaga, yang juga memblokir penerapan jadwal), dan catatan transfer antar satker untuk revisi
// DJPb/DJA (hanya PPK). Seluruh kertas kerja jadwal dihitung, bukan satu KRO. Logika teks: lib/keu/penjagaanRevisi.ts. SQL: 20261107k_keu_jaga_revisi.sql.

import { useMemo, useState } from "react";
import { batasRevisi, NAMA_JENIS_JAGA, type JenisRevisi } from "@/lib/keu/penjagaanRevisi";
import { bacaAngka, LABEL_TINGKAT, n, WARNA_TINGKAT } from "@/lib/keu/kk";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { caps, Catatan, Chip, judulKartu, kartu, Memuat, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu, useBacaKeu, useKirim } from "../../ro/useKeu";

type Temuan = { jadwal_id: number; kode: string; tingkat: string; objek: string | null; pesan: string; nilai: number | string | null };
type NeracaRow = { jadwal_id: number; kro: string; semula: number | string; menjadi: number | string; selisih: number | string; semula524: number | string; menjadi524: number | string };
type Transfer = { id: number; jadwal_id: number; arah: "masuk" | "keluar"; satker: string; nilai: number | string; catatan: string; batal: boolean };
type InfoJaga = { jadwal_id: number; jenis: string; jaga_total_tetap: boolean };

const JENIS_SAH: readonly string[] = ["pok", "administrasi", "dipa_djpb", "dipa_dja"];
const sel = (v: number): string => (Math.abs(v) < 1 ? "0" : `${v > 0 ? "+" : "-"}${rupiah(Math.abs(v))}`);

export default function KartuJaga({ jadwal, jenis, status, bolehJadwal }: { jadwal: number; jenis: string; status: string; bolehJadwal: boolean }) {
  const sah = JENIS_SAH.includes(jenis);
  const dipa = jenis === "dipa_djpb" || jenis === "dipa_dja";
  const jaga = useBacaKeu<Temuan>(sah ? urlBaca("keu_v_kk_jaga", { jadwal_id: jadwal }, { batas: 200 }) : null);
  const neraca = useBacaKeu<NeracaRow>(sah ? urlBaca("keu_v_kk_neraca_kro", { jadwal_id: jadwal }, { urut: "kro", batas: 200 }) : null);
  const transfer = useBacaKeu<Transfer>(sah && dipa ? urlBaca("keu_revisi_transfer", { jadwal_id: jadwal }, { urut: "id", batas: 100 }) : null);
  const info = useBacaKeu<InfoJaga>(sah && dipa ? urlBaca("keu_v_jaga_jadwal", { jadwal_id: jadwal }, { batas: 1 }) : null);
  const segarkan = async () => { await Promise.all([jaga.muat(), neraca.muat(), transfer.muat(), info.muat()]); };
  const { kirim, jalankan, mengirim, galat } = useKirim(segarkan);

  const [arah, setArah] = useState<"masuk" | "keluar">("masuk");
  const [satker, setSatker] = useState("");
  const [nilai, setNilai] = useState("");
  const [catatan, setCatatan] = useState("");
  const [batalId, setBatalId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");

  const baris = neraca.baris ?? [];
  const total = useMemo(() => {
    const t = { semula: 0, menjadi: 0, s524: 0, m524: 0 };
    for (const r of baris) { t.semula += n(r.semula); t.menjadi += n(r.menjadi); t.s524 += n(r.semula524); t.m524 += n(r.menjadi524); }
    return t;
  }, [baris]);
  const aktif = (transfer.baris ?? []).filter((x) => !x.batal);
  const masuk = aktif.filter((x) => x.arah === "masuk").reduce((s, x) => s + n(x.nilai), 0);
  const keluar = aktif.filter((x) => x.arah === "keluar").reduce((s, x) => s + n(x.nilai), 0);
  const temuan = jaga.baris ?? [];
  const merah = temuan.filter((x) => x.tingkat === "merah").length;
  const kuning = temuan.filter((x) => x.tingkat === "kuning").length;
  const belumSql = jaga.galat !== null;
  const terbuka = status === "terjadwal" || status === "dibuka" || status === "terkumpul";
  const jagaTetap = info.baris?.[0]?.jaga_total_tetap === true;

  if (!sah) return null;
  const nilaiAngka = bacaAngka(nilai);
  const bisaCatat = bolehJadwal && terbuka && !mengirim && satker.trim().length >= 3 && nilaiAngka !== null && nilaiAngka > 0 && Number.isInteger(nilaiAngka);

  return (
    <section className={`${kartu} flex flex-col gap-2.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Batas revisi ini ({NAMA_JENIS_JAGA[jenis as JenisRevisi]})</h2>
        {!belumSql && jaga.baris && (
          <div className="flex flex-wrap gap-1.5">
            <Chip warna={merah > 0 ? "merah" : "hijau"}>{merah} merah</Chip><Chip warna={kuning > 0 ? "kuning" : "abu"}>{kuning} kuning</Chip>
          </div>
        )}
      </div>
      <ul className="list-disc pl-5 text-[12.5px] text-[#44546F]">{batasRevisi(jenis as JenisRevisi).map((t) => <li key={t}>{t}</li>)}</ul>

      {belumSql && <Catatan>Penjagaan belum aktif di basis data (SQL 20261107k belum dijalankan). Aturan di atas baru berupa panduan.</Catatan>}
      {!belumSql && (jaga.memuat || neraca.memuat) && <Memuat />}

      {!belumSql && jaga.baris && (
        <>
          {merah > 0 ? <Chip warna="merah">Ada temuan merah: penerapan jadwal ditolak sistem sampai selesai</Chip> : <Chip warna="hijau">Tidak ada temuan merah penjagaan</Chip>}
          {temuan.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {temuan.map((x, i) => (
                <li key={`${x.kode}-${x.objek}-${i}`} className="flex flex-wrap items-start gap-2 text-[13px] text-[#1B2B4B]">
                  <Chip warna={WARNA_TINGKAT[x.tingkat] ?? "abu"}>{x.kode} · {LABEL_TINGKAT[x.tingkat] ?? x.tingkat}</Chip><span className="min-w-0 flex-1 break-words">{x.pesan}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!belumSql && baris.length > 0 && (
        <div className="overflow-x-auto">
          <div className={caps}>Neraca satker (seluruh KRO)</div>
          <table className="mt-1 w-full border-collapse text-[12.5px]">
            <thead><tr className="text-left text-[#5B6B84]"><th className="py-1 pr-3">KRO</th><th className="pr-3 text-right">Semula</th><th className="pr-3 text-right">Menjadi</th><th className="pr-3 text-right">Selisih</th><th className="text-right">Selisih 524xxx</th></tr></thead>
            <tbody>
              {baris.map((r) => (
                <tr key={r.kro} className="border-t border-[#E6ECF5]">
                  <td className="py-1 pr-3 font-mono">{r.kro}</td><td className="pr-3 text-right">{rupiah(n(r.semula))}</td><td className="pr-3 text-right">{rupiah(n(r.menjadi))}</td>
                  <td className="pr-3 text-right">{sel(n(r.selisih))}</td><td className="text-right">{sel(n(r.menjadi524) - n(r.semula524))}</td>
                </tr>
              ))}
              <tr className="border-t border-[#C9D5E6] font-semibold">
                <td className="py-1 pr-3">Satker</td><td className="pr-3 text-right">{rupiah(total.semula)}</td><td className="pr-3 text-right">{rupiah(total.menjadi)}</td>
                <td className="pr-3 text-right">{sel(total.menjadi - total.semula)}</td><td className="text-right">{sel(total.m524 - total.s524)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!belumSql && dipa && (
        <div className="flex flex-col gap-2 rounded-xl border border-[#DDE6F3] bg-[#F9FBFE] p-3">
          <div className={caps}>Transfer antar satker (cukup dicatat)</div>
          <p className="text-[12.5px] text-[#5B6B84]">Tambahan dari satker lain (masuk) dan pelepasan ke satker lain (keluar): nama satker dan nilai saja, tanpa lampiran wajib. Selisih pagu seluruh KRO harus sama dengan transfer bersih (masuk dikurangi keluar).</p>
          {aktif.length === 0 && <p className="text-[12.5px] text-[#5B6B84]">Belum ada transfer tercatat.</p>}
          <ul className="flex flex-col gap-1.5">
            {aktif.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <Chip warna={x.arah === "masuk" ? "hijau" : "kuning"}>{x.arah === "masuk" ? "Masuk" : "Keluar"}</Chip>
                <span className="font-semibold">{x.satker}</span><span>{rupiah(n(x.nilai))}</span>{x.catatan && <span className="text-[#5B6B84]">· {x.catatan}</span>}
                {bolehJadwal && terbuka && (batalId === x.id ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <input className="rounded border border-[#C9D5E6] px-2 py-1 text-[12.5px]" placeholder="Alasan (min. 5 huruf)" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
                    <button type="button" className={tombolKecil} disabled={mengirim || alasan.trim().length < 5} onClick={() => void jalankan(async () => { const r = await aksiKeu("keu_transfer_batal", { p_id: x.id, p_alasan: alasan.trim() }); if (r.ok) { setBatalId(null); setAlasan(""); } return r; })}>Ya, batalkan</button>
                    <button type="button" className={tombolKecil} onClick={() => { setBatalId(null); setAlasan(""); }}>Tidak</button>
                  </span>
                ) : <button type="button" className={tombolKecil} onClick={() => setBatalId(x.id)}>Batalkan</button>)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 text-[12.5px] text-[#44546F]"><span>Masuk: <b>{rupiah(masuk)}</b></span><span>Keluar: <b>{rupiah(keluar)}</b></span><span>Bersih: <b>{sel(masuk - keluar)}</b></span></div>
          <label className="flex items-start gap-2 text-[12.5px] font-semibold text-[#44546F]">
            <input type="checkbox" className="mt-0.5" checked={jagaTetap} disabled={!bolehJadwal || !terbuka || mengirim} onChange={(e) => void kirim("keu_jaga_total_set", { p_jadwal: jadwal, p_tetap: e.target.checked })} />
            <span>Jaga total pagu satker tetap <span className="font-normal">(transfer bersih harus nol)</span></span>
          </label>
          {bolehJadwal && terbuka && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">Arah
                <select className="rounded border border-[#C9D5E6] px-2 py-1.5 text-[13px]" value={arah} onChange={(e) => setArah(e.target.value === "keluar" ? "keluar" : "masuk")}><option value="masuk">Masuk (tambahan)</option><option value="keluar">Keluar (pelepasan)</option></select></label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">Satker
                <input className="rounded border border-[#C9D5E6] px-2 py-1.5 text-[13px]" value={satker} onChange={(e) => setSatker(e.target.value)} placeholder="Nama satker" /></label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">Nilai (Rp)
                <input className="w-36 rounded border border-[#C9D5E6] px-2 py-1.5 text-[13px]" inputMode="numeric" value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="500.000" /></label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">Catatan
                <input className="rounded border border-[#C9D5E6] px-2 py-1.5 text-[13px]" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="opsional" /></label>
              <button type="button" className={tombolUtama} disabled={!bisaCatat} onClick={() => void jalankan(async () => {
                const r = await aksiKeu("keu_transfer_catat", { p_jadwal: jadwal, p_arah: arah, p_satker: satker.trim(), p_nilai: nilaiAngka, p_catatan: catatan.trim() });
                if (r.ok) { setSatker(""); setNilai(""); setCatatan(""); }
                return r;
              })}>Catat transfer</button>
            </div>
          )}
          {!bolehJadwal && <p className="text-[12px] text-[#7A8AA3]">Hanya PPK yang mencatat transfer antar satker dan mengatur penjagaan total pagu.</p>}
          {galat && <p className="text-[12.5px] font-semibold text-[#B42329]">{galat}</p>}
        </div>
      )}
    </section>
  );
}
