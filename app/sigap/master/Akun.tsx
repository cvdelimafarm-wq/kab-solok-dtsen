"use client";

// app/sigap/master/Akun.tsx
//
// (24 Okt 2026, tahap 14) Master akun belanja dan master satuan (papan 14). Penjaga basis data: hanya Admin Aplikasi dan PPK yang boleh mengubah (kewenangan
// "master"); tombol ubah hanya muncul bagi mereka. Tidak ada hapus: akun yang pernah dipakai hanya dinonaktifkan. Logika murni: lib/keu/master.ts.

import { useMemo, useState } from "react";
import { angka } from "@/lib/keu/ro";
import {
  aliasPerSatuan, argsAkunBaru, NAMA_KELOMPOK_PENDEK, pakaiSatuan, periksaAkunBaru, periksaSatuanBaru, teksSatuanRagu,
  type AkunMaster, type AliasSatuan, type PakaiAkun, type SatuanMaster,
} from "@/lib/keu/master";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, label, tombolAktif, tombolKecil, tombolUtama } from "../keu-ui";
import { tulisKeuKlien, useKirim } from "../ro/useKeu";

export type PolaMaster = { kode: string; nama: string };
export type KelompokMaster = { kode: string; nama: string };

export function BagianAkun({ akun, pola, pakai, boleh, sesudah }: { akun: AkunMaster[]; pola: PolaMaster[]; pakai: PakaiAkun; boleh: boolean; sesudah: () => Promise<void> }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const [kel, setKel] = useState("");
  const [kd, setKd] = useState("");
  const [nm, setNm] = useState("");
  const daftar = useMemo(() => akun.filter((a) => !kel || a.kelompok_kode === kel), [akun, kel]);
  const g = periksaAkunBaru(kd, nm, akun.map((a) => a.kode));
  const polaNama = new Map(pola.map((p) => [p.kode, p.nama]));
  const namaKel: Record<string, string> = { "51": "Belanja pegawai", "524": "Perjalanan dinas", "52L": "Belanja barang lain", "53": "Belanja modal" };
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div>
        <h2 className={judulKartu}>Master akun belanja</h2>
        <p className="text-[12.5px] text-[#5B6B84]">{daftar.length} akun; ubah pola atau status lewat kolomnya. Kelompok belanja ditentukan dari tiga digit pertama kode, dan pola dokumen awalnya dari kelompok. Akun yang sudah dipakai tidak dapat dihapus, hanya dinonaktifkan; item POK lama tetap tampil.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(NAMA_KELOMPOK_PENDEK).map(([k, n]) => <button key={k} type="button" className={kel === k ? tombolAktif : tombolKecil} onClick={() => setKel(k)}>{n}</button>)}
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[860px] text-left text-[12.5px]">
          <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Akun</th><th className="px-2.5 py-2">Nama</th><th className="px-2.5 py-2">Kelompok belanja</th><th className="px-2.5 py-2">Pola dokumen</th><th className="px-2.5 py-2 text-right">Item POK</th><th className="px-2.5 py-2 text-right">Nilai POK (Rp)</th><th className="px-2.5 py-2">Status</th></tr></thead>
          <tbody>{daftar.map((a) => (
            <tr key={a.kode} className="border-t border-[#EEF2F7] align-top">
              <td className="px-2.5 py-2 font-mono font-semibold">{a.kode}</td>
              <td className="px-2.5 py-2">{a.nama}</td>
              <td className="px-2.5 py-2">{namaKel[a.kelompok_kode] ?? a.kelompok_kode}</td>
              <td className="px-2.5 py-2">
                {boleh ? (
                  <select aria-label={`Pola dokumen akun ${a.kode}`} className={`${kolom} !min-h-[34px] !w-auto max-w-full`} value={a.pola_kode} disabled={mengirim} onChange={(e) => void jalankan(() => tulisKeuKlien("keu_master_akun", "update", { pola_kode: e.target.value }, { kode: a.kode }))}>
                    {pola.map((p) => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
                  </select>
                ) : polaNama.get(a.pola_kode) ?? a.pola_kode}
              </td>
              <td className="px-2.5 py-2 text-right font-mono">{angka(pakai.get(a.kode)?.n ?? 0)}</td>
              <td className="px-2.5 py-2 text-right font-mono">{angka(pakai.get(a.kode)?.nilai ?? 0)}</td>
              <td className="px-2.5 py-2">
                {boleh ? (
                  <button type="button" disabled={mengirim} className={a.aktif ? tombolAktif : tombolKecil} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_akun", "update", { aktif: !a.aktif }, { kode: a.kode }))}>{a.aktif ? "Aktif" : "Nonaktif"}</button>
                ) : <Chip warna={a.aktif ? "hijau" : "abu"}>{a.aktif ? "Aktif" : "Nonaktif"}</Chip>}
                {!a.aktif && (pakai.get(a.kode)?.n ?? 0) > 0 && <p className="mt-1 text-[11px] text-[#7A8AA3]">{pakai.get(a.kode)!.n} item POK yang memakainya tetap tampil.</p>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {boleh && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
          <h3 className="text-[14px] font-bold text-[#0F2A52]">Tambah akun baru</h3>
          <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto] sm:items-end">
            <div><label className={label} htmlFor="ak-kd">Kode akun (6 angka, mulai 51, 52, atau 53)</label><input id="ak-kd" inputMode="numeric" className={kolom} value={kd} onChange={(e) => setKd(e.target.value)} /></div>
            <div><label className={label} htmlFor="ak-nm">Nama akun</label><input id="ak-nm" className={kolom} value={nm} onChange={(e) => setNm(e.target.value)} /></div>
            <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_akun", "insert", argsAkunBaru(kd, nm))).then((ok) => { if (ok) { setKd(""); setNm(""); } })}>Tambah akun</button>
          </div>
          {(kd || nm) && <Galat pesan={g} />}
        </div>
      )}
      <Galat pesan={galat} />
      {!boleh && <Catatan>Anda hanya dapat melihat master. Yang dapat mengubah: Admin Aplikasi dan PPK.</Catatan>}
    </section>
  );
}

export function BagianSatuan({ satuan, alias, satuanPok, boleh, sesudah }: { satuan: SatuanMaster[]; alias: AliasSatuan[]; satuanPok: (string | null)[]; boleh: boolean; sesudah: () => Promise<void> }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const pakai = useMemo(() => pakaiSatuan(satuanPok, satuan, alias), [satuanPok, satuan, alias]);
  const al = useMemo(() => aliasPerSatuan(alias), [alias]);
  const [kd, setKd] = useState("");
  const [ar, setAr] = useState("");
  const [al1, setAl1] = useState("");
  const [al2, setAl2] = useState("");
  const [sunting, setSunting] = useState<{ kode: string; arti: string } | null>(null);
  const g = periksaSatuanBaru(kd, ar, satuan.map((s) => s.kode));
  const urutan = [...satuan].sort((a, b) => a.urut - b.urut);
  const galatAlias = al1.trim() && al2 ? (alias.some((a) => a.alias.toUpperCase() === al1.trim().toUpperCase()) ? ["Penulisan itu sudah terdaftar sebagai alias."] : []) : [];
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Master satuan</h2>
        <Chip warna={satuan.some((s) => !s.pasti) ? "kuning" : "hijau"}>{teksSatuanRagu(satuan)}</Chip>
      </div>
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">POK menuliskan satuan dengan banyak ragam (mis. OK, O-K; OB, O-B; Dok, DOK). Master menyatukannya ke satu kode baku, supaya volume antar RO dan antar revisi dapat dibandingkan dan skor volume tidak salah hitung. Satuan yang artinya belum dikonfirmasi ditandai kuning.</p>
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Kode baku</th><th className="px-2.5 py-2">Arti</th><th className="px-2.5 py-2">Penulisan di POK</th><th className="px-2.5 py-2 text-right">Baris POK</th><th className="px-2.5 py-2">Arti</th></tr></thead>
          <tbody>{urutan.map((s) => (
            <tr key={s.kode} className="border-t border-[#EEF2F7] align-top">
              <td className="px-2.5 py-2 font-mono font-semibold">{s.kode}</td>
              <td className="px-2.5 py-2">
                {sunting?.kode === s.kode ? (
                  <div className="flex flex-wrap gap-1.5">
                    <input aria-label={`Arti ${s.kode}`} className={`${kolom} !min-h-[34px] !w-auto min-w-[200px]`} value={sunting.arti} onChange={(e) => setSunting({ kode: s.kode, arti: e.target.value })} />
                    <button type="button" disabled={mengirim || sunting.arti.trim().length < 3} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_satuan", "update", { arti: sunting.arti.trim() }, { kode: s.kode })).then((ok) => { if (ok) setSunting(null); })}>Simpan</button>
                    <button type="button" className={tombolKecil} onClick={() => setSunting(null)}>Batal</button>
                  </div>
                ) : (
                  <span>{s.arti}{boleh && <button type="button" className="ml-2 text-[11.5px] font-semibold text-[#1F5FD1] underline" onClick={() => setSunting({ kode: s.kode, arti: s.arti })}>ubah</button>}</span>
                )}
              </td>
              <td className="px-2.5 py-2 font-mono text-[11.5px]">{(al.get(s.kode) ?? []).join(", ") || "-"}</td>
              <td className="px-2.5 py-2 text-right font-mono">{angka(pakai.get(s.kode) ?? 0)}</td>
              <td className="px-2.5 py-2">
                {boleh ? <button type="button" disabled={mengirim} className={s.pasti ? tombolAktif : tombolKecil} title="Tandai arti sudah dikonfirmasi atau perlu dikonfirmasi" onClick={() => void jalankan(() => tulisKeuKlien("keu_master_satuan", "update", { pasti: !s.pasti }, { kode: s.kode }))}>{s.pasti ? "Umum" : "Perlu dikonfirmasi"}</button> : <Chip warna={s.pasti ? "hijau" : "kuning"}>{s.pasti ? "Umum" : "Perlu dikonfirmasi"}</Chip>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {boleh && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
            <h3 className="text-[14px] font-bold text-[#0F2A52]">Tambah satuan baku</h3>
            <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-end">
              <div><label className={label} htmlFor="sa-kd">Kode</label><input id="sa-kd" className={kolom} value={kd} onChange={(e) => setKd(e.target.value)} /></div>
              <div><label className={label} htmlFor="sa-ar">Arti</label><input id="sa-ar" className={kolom} value={ar} onChange={(e) => setAr(e.target.value)} /></div>
              <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_satuan", "insert", { kode: kd.trim().toUpperCase(), arti: ar.trim(), pasti: false, urut: Math.max(0, ...satuan.map((s) => s.urut)) + 1, aktif: true })).then((ok) => { if (ok) { setKd(""); setAr(""); } })}>Tambah</button>
            </div>
            {(kd || ar) && <Galat pesan={g} />}
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
            <h3 className="text-[14px] font-bold text-[#0F2A52]">Tambah penulisan (alias) di POK</h3>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div><label className={label} htmlFor="sa-al">Penulisan di POK</label><input id="sa-al" className={kolom} value={al1} onChange={(e) => setAl1(e.target.value)} /></div>
              <div><label className={label} htmlFor="sa-ak">Kode baku</label><select id="sa-ak" className={kolom} value={al2} onChange={(e) => setAl2(e.target.value)}><option value="">Pilih…</option>{urutan.map((s) => <option key={s.kode} value={s.kode}>{s.kode}</option>)}</select></div>
              <button type="button" disabled={mengirim || !al1.trim() || !al2 || galatAlias.length > 0} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_master_satuan_alias", "insert", { alias: al1.trim(), satuan_kode: al2 })).then((ok) => { if (ok) { setAl1(""); setAl2(""); } })}>Tambah</button>
            </div>
            <Galat pesan={galatAlias} />
          </div>
        </div>
      )}
      <Galat pesan={galat} />
      <p className="text-[11.5px] text-[#7A8AA3]">Total nilai POK tidak dipengaruhi master satuan. Perubahan arti berlaku ke depan dan dicatat di riwayat master.</p>
    </section>
  );
}
