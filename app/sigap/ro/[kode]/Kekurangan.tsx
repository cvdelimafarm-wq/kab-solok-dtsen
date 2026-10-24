"use client";

// app/sigap/ro/[kode]/Kekurangan.tsx
//
// (24-25 Okt 2026) Tab Kekurangan RAB, urutan mengikuti papan 15: KPI, 1. Daftar catatan (dengan kolom Dicatat), 2. Catat kekurangan baru,
// 3. Kesempatan saat ada tambahan pagu (meter + keputusan ketua tim), Riwayat keputusan, Aturan K1-K6. Tombol hanya tampil bila akun
// berwenang (kek_catat / kek_putus); yang memutuskan tetap basis data. Logika: lib/keu/kekurangan.ts.

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { argsCatat, argsTarik, argsTerapkan, argsUbah, bentukIsian, peristiwaKekurangan, periksaKekurangan, pilihanDariSaran, PRIORITAS, ringkasPutus, type IsianKekurangan, type PilihanPutus } from "@/lib/keu/kekurangan";
import { angka, rupiah, STATUS_KEK, urlBaca } from "@/lib/keu/ro";
import { LABEL_PUTUSAN, tglPanjang, type Putusan, type WarnaChip } from "@/lib/keu/revisi";
import { waktuWib } from "@/lib/keu/status";
import { aksiKeu, useAnggaranRo, useBacaKeu, useBoleh, useKirim } from "../useKeu";
import { Chip, Galat, judulKartu, kartu, kisi, kolom, Kpi, label, Memuat, Potong, tombol, tombolAktif, tombolKecil, tombolUtama } from "../../keu-ui";


type Kek = { id: number; akun_kode: string; uraian: string; jumlah: number | string; prioritas_kode: string; prioritas_nama: string | null; alasan: string | null; status: string; terbuka: boolean; kali_ditunda: number | string | null; alasan_putus: string | null; dicatat_oleh: number | string | null; dicatat_at: string | null; diputus_oleh: number | string | null; diputus_at: string | null };

function Bidang({ nilai, ubah, akunPilihan, baru }: { nilai: IsianKekurangan; ubah: (p: Partial<IsianKekurangan>) => void; akunPilihan: string[]; baru: boolean }) {
  const lainnya = nilai.akun_kode !== "" && !akunPilihan.includes(nilai.akun_kode);
  const [bebas, setBebas] = useState(lainnya);
  return (
    <div className="space-y-3">
      {baru && (
        <div>
          <label className={label} htmlFor="kek-akun">Akun anggaran</label>
          <select id="kek-akun" className={kolom} value={bebas ? "__lain" : nilai.akun_kode} onChange={(e) => { if (e.target.value === "__lain") { setBebas(true); ubah({ akun_kode: "" }); } else { setBebas(false); ubah({ akun_kode: e.target.value }); } }}>
            <option value="">Pilih akun</option>
            {akunPilihan.map((a) => <option key={a} value={a}>{a}</option>)}
            <option value="__lain">Akun lain (ketik sendiri)</option>
          </select>
          {bebas && <input className={`${kolom} mt-2`} inputMode="numeric" maxLength={6} placeholder="6 angka, mis. 521211" value={nilai.akun_kode} onChange={(e) => ubah({ akun_kode: e.target.value.replace(/\D/g, "").slice(0, 6) })} aria-label="Kode akun" />}
        </div>
      )}
      <div>
        <label className={label} htmlFor="kek-uraian">Uraian kebutuhan</label>
        <input id="kek-uraian" className={kolom} maxLength={200} value={nilai.uraian} onChange={(e) => ubah({ uraian: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="kek-jumlah">Jumlah (Rp)</label>
          <input id="kek-jumlah" className={kolom} inputMode="numeric" value={nilai.jumlah} onChange={(e) => ubah({ jumlah: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} />
        </div>
        <div>
          <label className={label} htmlFor="kek-prioritas">Prioritas</label>
          <select id="kek-prioritas" className={kolom} value={nilai.prioritas} onChange={(e) => ubah({ prioritas: e.target.value })}>
            <option value="">Pilih</option>
            {PRIORITAS.map((p) => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="kek-alasan">Alasan</label>
        <textarea id="kek-alasan" className={`${kolom} py-2`} rows={3} maxLength={500} value={nilai.alasan} onChange={(e) => ubah({ alasan: e.target.value })} />
      </div>
    </div>
  );
}

function Formulir({ ro, akunPilihan, awal, tandaId, lama, tutup, sesudah, tetap }: { ro: string; akunPilihan: string[]; awal: IsianKekurangan; tandaId?: number; lama?: Kek; tutup: () => void; sesudah: () => Promise<void>; tetap?: boolean }) {
  const [v, setV] = useState<IsianKekurangan>(awal);
  const [pesan, setPesan] = useState<string[]>([]);
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const baru = tandaId === undefined;
  const simpan = async () => {
    const g = periksaKekurangan(v, { baru });
    setPesan(g);
    if (g.length) return;
    let ok: boolean;
    if (baru) ok = await kirim("keu_kekurangan_catat", argsCatat(ro, v));
    else {
      const a = argsUbah(tandaId, { uraian: lama!.uraian, jumlah: lama!.jumlah, prioritas_kode: lama!.prioritas_kode, alasan: lama!.alasan ?? "" }, v);
      if (!a) { setPesan(["Tidak ada yang diubah."]); return; }
      ok = await kirim("keu_kekurangan_ubah", a);
    }
    if (ok) tutup();
  };
  return (
    <section className={tetap ? "space-y-3" : "space-y-3 rounded-lg border border-[#B7CDF5] bg-[#F7FAFE] p-3"}>
      {!tetap && <h3 className="text-[14px] font-bold text-[#0F2A52]">{baru ? "Catat kekurangan RAB" : "Ubah catatan"}</h3>}
      <Bidang nilai={v} ubah={(p) => setV((x) => ({ ...x, ...p }))} akunPilihan={akunPilihan} baru={baru} />
      {(pesan.length > 0 || galat) && (
        <ul className="space-y-1 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]" role="alert">
          {[...pesan, ...(galat ? [galat] : [])].map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={simpan} disabled={mengirim} className={`${tombol} flex-1 bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan…" : tetap ? "Catat kekurangan" : "Simpan"}</button>
        {!tetap && <button type="button" onClick={tutup} disabled={mengirim} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>}
      </div>
    </section>
  );
}

function Tarik({ id, tutup, sesudah }: { id: number; tutup: () => void; sesudah: () => Promise<void> }) {
  const [alasan, setAlasan] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const tarik = async () => {
    const a = argsTarik(id, alasan);
    if ("galat" in a) { setPesan(a.galat); return; }
    setPesan(null);
    if (await kirim("keu_kekurangan_tarik", a.args)) tutup();
  };
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-[#F5F8FE] p-3">
      <label className={label} htmlFor={`tarik-${id}`}>Alasan menarik catatan ini</label>
      <textarea id={`tarik-${id}`} className={`${kolom} py-2`} rows={2} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
      {(pesan || galat) && <p className="text-[13px] text-[#7A1D22]" role="alert">{pesan ?? galat}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={tarik} disabled={mengirim} className={`${tombol} flex-1 bg-[#B42329] text-white`}>{mengirim ? "Menarik…" : "Tarik catatan"}</button>
        <button type="button" onClick={tutup} disabled={mengirim} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>
      </div>
    </div>
  );
}


type RingkasKek = { tambahan_terbuka_id: number | string | null; tambahan_terbuka_jumlah: number | string | null };
type TambahanRo = { id: number; jumlah: number | string; jalur: string; nomor_dokumen: string; tanggal_dokumen: string };
type Saran = { kekurangan_id: number | string; saran: string };
type Orang = { akun_id: number | string | null; akun_nama: string | null };

const WARNA_STATUS_KEK: Record<string, WarnaChip> = { tercatat: "biru", ditunda: "kuning", dipenuhi: "hijau", ditolak: "merah", ditarik: "abu" };
const WARNA_PRIORITAS: Record<string, WarnaChip> = { inti: "merah", penting: "kuning", tunda: "abu" };
const WARNA_SARAN: Record<string, WarnaChip> = { penuhi: "hijau", tunda: "kuning", tolak: "merah" };
const FILTER_STATUS: { kode: string; nama: string }[] = [{ kode: "", nama: "Semua" }, { kode: "tercatat", nama: "Tercatat" }, { kode: "ditunda", nama: "Ditunda" }, { kode: "dipenuhi", nama: "Dipenuhi" }, { kode: "ditolak", nama: "Ditolak" }, { kode: "ditarik", nama: "Ditarik" }];
const tanggalSaja = (iso: string | null | undefined) => (iso ? waktuWib(iso).split(",")[0] : "-");

function Meter({ label: l, nilai, warna }: { label: string; nilai: string; warna?: "mr" | "hj" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-[#F5F8FE] p-3">
      <span className="text-[11.5px] font-semibold text-[#5B6B84]">{l}</span>
      <span className={`break-words text-[18px] font-extrabold ${warna === "mr" ? "text-[#B42329]" : warna === "hj" ? "text-[#14653A]" : "text-[#0F2A52]"}`}>{nilai}</span>
    </div>
  );
}

/** Bagian 3: keputusan atas SEMUA catatan terbuka saat ada tambahan pagu resmi terbuka. Saran sistem hanya titik awal; ketua tim memutuskan. */
function Kesempatan({ kode, terbuka, sesudah }: { kode: string; terbuka: Kek[]; sesudah: () => Promise<void> }) {
  const ringkas = useBacaKeu<RingkasKek>(urlBaca("keu_v_kekurangan_ro", { ro_kode: kode }, { batas: 1, kolom: ["tambahan_terbuka_id", "tambahan_terbuka_jumlah"] }));
  const tid = ringkas.baris?.[0]?.tambahan_terbuka_id ?? null;
  const tambahan = Number(ringkas.baris?.[0]?.tambahan_terbuka_jumlah ?? 0);
  const info = useBacaKeu<TambahanRo>(tid !== null ? urlBaca("keu_v_tambahan_pagu", { id: Number(tid) }, { batas: 1, kolom: ["id", "jumlah", "jalur", "nomor_dokumen", "tanggal_dokumen"] }) : null);
  const bolehPutus = useBoleh("kek_putus", kode) === true;
  const bolehPpk = useBoleh("sahkan", null) === true;
  const [saran, setSaran] = useState<Saran[] | null>(null);
  const [pilih, setPilih] = useState<PilihanPutus>({});
  const [alasan, setAlasan] = useState<Record<number, string>>({});
  const { kirim, mengirim, galat } = useKirim(async () => { setPilih({}); setAlasan({}); await ringkas.muat(); await sesudah(); });
  const idKunci = terbuka.map((k) => k.id).join(",");

  useEffect(() => {
    setSaran(null);
    if (tid === null) return;
    let hidup = true;
    void aksiKeu<Saran[]>("keu_kekurangan_saran", { p_tambahan: Number(tid) }).then((r) => { if (hidup) setSaran(r.ok && Array.isArray(r.data) ? r.data : []); });
    return () => { hidup = false; };
  }, [tid, idKunci]);

  const peta = useMemo(() => new Map((saran ?? []).map((s) => [Number(s.kekurangan_id), s.saran])), [saran]);
  const hitung = useMemo(() => ringkasPutus(terbuka.map((k) => ({ id: k.id, uraian: k.uraian, jumlah: k.jumlah })), pilih, alasan, tambahan), [terbuka, pilih, alasan, tambahan]);
  const t = info.baris?.[0];
  const terapkan = async () => { if (hitung.siap && tid !== null) await kirim("keu_kekurangan_putuskan", argsTerapkan(Number(tid), hitung.daftar)); };

  return (
    <div className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>3. Kesempatan saat ada tambahan pagu</h2>
        <span className="text-[12px] text-[#5B6B84]">PPK mencatat tambahan; ketua tim RO memutuskan</span>
      </div>
      <p className="text-[12.5px] text-[#5B6B84]">Tambahan pagu dicatat setelah Revisi DIPA jalur DJA atau DJPb dinyatakan sah. Sistem hanya menyarankan urutan berdasarkan prioritas lalu tanggal catat; keputusan tetap di ketua tim.</p>
      <div className="rounded-lg bg-[#F5F8FE] p-3 text-[12.5px] text-[#44546F]">
        <b className="text-[#0F2A52]">Catat tambahan pagu resmi (PPK)</b>
        {bolehPpk
          ? <p className="mt-1">Tambahan pagu dicatat PPK di halaman <Link href="/sigap/revisi" className="font-semibold text-[#1F5FD1] underline">Revisi anggaran</Link> (bagian Tambahan pagu), lengkap dengan jalur, nomor, dan tanggal dokumen.</p>
          : <p className="mt-1">Hanya PPK yang mencatat tambahan pagu. Bila RO ini sudah mendapat tambahan, kesempatan memutuskan muncul di bawah.</p>}
      </div>
      {ringkas.galat && <Galat pesan={ringkas.galat} />}
      {!ringkas.galat && tid === null && ringkas.baris && <p className="text-[13px] text-[#5B6B84]">Belum ada tambahan pagu terbuka untuk RO ini. Catatan yang terbuka tetap tersimpan sampai ada tambahan.</p>}
      {tid !== null && (
        <>
          <div className="rounded-lg border-l-4 border-[#1F5FD1] bg-[#F7FAFE] px-3 py-2 text-[13px] text-[#0F2A52]">
            <b>Kesempatan terbuka: RO {kode}</b>
            <p className="mt-0.5 text-[12.5px] text-[#44546F]">{t ? `Revisi DIPA jalur ${t.jalur === "dja" ? "DJA" : "DJPb"}, ${t.nomor_dokumen}, ${tglPanjang(t.tanggal_dokumen)}.` : "Memuat dasar tambahan…"}</p>
          </div>
          <div className={kisi}>
            <Meter label="Tambahan pagu" nilai={rupiah(tambahan)} />
            <Meter label="Dipenuhi menurut pilihan" nilai={rupiah(hitung.dipenuhi)} warna="hj" />
            <Meter label="Sisa tambahan" nilai={rupiah(hitung.sisa)} warna={hitung.sisa < 0 ? "mr" : undefined} />
            <Meter label="Belum diputuskan" nilai={angka(hitung.belum)} />
          </div>
          {!bolehPutus && <p className="text-[12.5px] text-[#5B6B84]">Yang memutuskan adalah ketua tim RO ini. Pengguna ini hanya melihat.</p>}
          {terbuka.length === 0 && <p className="text-[13px] text-[#5B6B84]">Tidak ada catatan terbuka untuk diputuskan; seluruh tambahan akan menjadi dana penggenap RO.</p>}
          {terbuka.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
              <table className="w-full min-w-[820px] text-left text-[12.5px]">
                <thead className="bg-[#EEF3FB] text-[#44546F]">
                  <tr><th className="px-2.5 py-2">Akun dan uraian</th><th className="px-2.5 py-2 text-right">Jumlah (Rp)</th><th className="px-2.5 py-2">Prioritas</th><th className="px-2.5 py-2">Saran sistem</th><th className="px-2.5 py-2">Keputusan ketua tim</th><th className="px-2.5 py-2">Alasan bila ditolak</th></tr>
                </thead>
                <tbody>
                  {terbuka.map((k) => {
                    const p = pilih[k.id];
                    const sr = saran === null ? null : (peta.get(k.id) ?? "tunda");
                    return (
                      <tr key={k.id} className="border-t border-[#EEF2F7] align-top">
                        <td className="break-words px-2.5 py-2"><b className="font-mono text-[#0F2A52]">{k.akun_kode}</b> {k.uraian}<div className="mt-1"><Chip warna={WARNA_STATUS_KEK[k.status] ?? "abu"}>{STATUS_KEK[k.status] ?? k.status}</Chip></div></td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{angka(k.jumlah)}</td>
                        <td className="px-2.5 py-2">{k.prioritas_nama ? <Chip warna={WARNA_PRIORITAS[k.prioritas_kode] ?? "abu"}>{k.prioritas_nama}</Chip> : "-"}</td>
                        <td className="px-2.5 py-2">{sr ? <Chip warna={WARNA_SARAN[sr] ?? "abu"}>{LABEL_PUTUSAN[sr as Putusan] ?? sr}</Chip> : "…"}</td>
                        <td className="px-2.5 py-2">
                          {bolehPutus ? (
                            <div className="flex gap-1" role="radiogroup" aria-label={`Keputusan untuk ${k.uraian}`}>
                              {(["penuhi", "tunda", "tolak"] as Putusan[]).map((x) => (
                                <button key={x} type="button" role="radio" aria-checked={p === x} onClick={() => setPilih((o) => ({ ...o, [k.id]: x }))}
                                  className={`min-h-[36px] rounded-md px-2.5 text-[12.5px] font-semibold ${p === x ? "bg-[#1F5FD1] text-white" : "border-[1.5px] border-[#C5D0E2] bg-white text-[#44546F]"}`}>{LABEL_PUTUSAN[x]}</button>
                              ))}
                            </div>
                          ) : <span className="text-[#6B7A93]">{p ? LABEL_PUTUSAN[p] : "Belum diputuskan"}</span>}
                        </td>
                        <td className="px-2.5 py-2">
                          <input aria-label={`Alasan menolak ${k.uraian}`} className={kolom} maxLength={300} disabled={!bolehPutus || p !== "tolak"} placeholder={p === "tolak" ? "Wajib, minimal 5 huruf" : "-"}
                            value={alasan[k.id] ?? ""} onChange={(e) => setAlasan((o) => ({ ...o, [k.id]: e.target.value }))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {bolehPutus && terbuka.length > 0 && (
            <>
              {(hitung.belum === 0 ? hitung.galat.length > 0 : hitung.sisa < 0) && <Galat pesan={hitung.galat} />}
              {galat && <Galat pesan={galat} />}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={tombolKecil} disabled={saran === null || mengirim} onClick={() => setPilih(pilihanDariSaran(terbuka.map((k) => k.id), saran ?? []))}>Pakai saran sistem</button>
                <button type="button" className={tombolUtama} disabled={!hitung.siap || mengirim} onClick={() => void terapkan()}>{mengirim ? "Menerapkan…" : "Terapkan keputusan"}</button>
              </div>
            </>
          )}
          <p className="text-[12px] leading-snug text-[#5B6B84]">Setelah diterapkan: yang dipenuhi menjadi baris resmi di RAB pada pagu baru; yang ditunda tetap tercatat untuk tambahan berikutnya; yang ditolak diarsipkan dengan alasan. Sisa tambahan yang tidak terpakai ditampung sebagai dana penggenap RO, sehingga pagu RO tetap tepat sesuai pagu resmi.</p>
        </>
      )}
    </div>
  );
}

export function TabKekurangan({ kode }: { kode: string }) {
  const kek = useBacaKeu<Kek>(urlBaca("keu_v_kekurangan", { ro_kode: kode }, { urut: "prioritas_urut", batas: 2000, kolom: ["id", "akun_kode", "uraian", "jumlah", "prioritas_kode", "prioritas_nama", "prioritas_urut", "alasan", "status", "terbuka", "kali_ditunda", "alasan_putus", "dicatat_oleh", "dicatat_at", "diputus_oleh", "diputus_at"] }));
  const orang = useBacaKeu<Orang>(urlBaca("keu_v_penugasan_ro", { ro_kode: kode }, { batas: 200, kolom: ["akun_id", "akun_nama"] }));
  const boleh = useBoleh("kek_catat", kode);
  const ang = useAnggaranRo(kode);
  const akunPilihan = useMemo(() => [...new Set((ang.anggaran ?? []).flatMap((k) => k.akun.map((a) => a.akun)))].sort(), [ang.anggaran]);
  const nama = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of orang.baris ?? []) if (o.akun_id != null && o.akun_nama) m.set(Number(o.akun_id), o.akun_nama);
    return (id: number | string | null | undefined) => (id == null ? "Sistem" : (m.get(Number(id)) ?? "Pengguna lain"));
  }, [orang.baris]);
  const [mode, setMode] = useState<{ jenis: "ubah" | "tarik"; id: number } | null>(null);
  const [kunciBaru, setKunciBaru] = useState(0);
  const [saring, setSaring] = useState("");
  const sesudah = async () => { await kek.muat(); };
  const riwayat = useMemo(() => peristiwaKekurangan(kek.baris ?? []), [kek.baris]);

  if (kek.galat) return <Galat pesan={kek.galat} />;
  if (!kek.baris) return <Memuat tinggi="h-40" />;
  const terbuka = kek.baris.filter((k) => k.terbuka);
  const jumlahDi = (st: string) => kek.baris!.filter((k) => k.status === st).reduce((a, k) => a + Number(k.jumlah), 0);
  const nDi = (st: string) => kek.baris!.filter((k) => k.status === st).length;
  const tampil = kek.baris.filter((k) => !saring || k.status === saring);
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${kartu} flex flex-col gap-1`}>
        <h2 className={judulKartu}>Catatan kekurangan RAB yang belum ada anggaran resminya</h2>
        <p className="text-[12.5px] text-[#5B6B84]"><b className="text-[#0F2A52]">Aturan.</b> Dana penggenap tidak boleh minus dan tiap RO harus tepat sampai pagu resmi, jadi kebutuhan RAB yang melebihi pagu tidak ditulis ke POK. Kebutuhan itu dicatat di sini supaya tidak hilang. Ketika pusat menambah pagu lewat Revisi DIPA jalur DJA atau DJPb dan PPK mencatatnya, ketua tim RO diberi kesempatan memutuskan tiap catatan: penuhi, tunda, atau tolak.</p>
      </div>
      {kek.terpotong && <Potong />}
      <div className={kisi}>
        <Kpi label="Tercatat, belum diputuskan" nilai={angka(nDi("tercatat"))} sub={rupiah(jumlahDi("tercatat"))} />
        <Kpi label="Ditunda" nilai={angka(nDi("ditunda"))} sub={`${rupiah(jumlahDi("ditunda"))}; muncul lagi saat ada tambahan pagu`} warna="kn" />
        <Kpi label="Dipenuhi" nilai={angka(nDi("dipenuhi"))} sub={rupiah(jumlahDi("dipenuhi"))} warna="hj" />
        <Kpi label="Ditolak" nilai={angka(nDi("ditolak"))} sub={`${rupiah(jumlahDi("ditolak"))}; diarsipkan dengan alasan`} />
      </div>

      <div className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>1. Daftar catatan kekurangan</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[#5B6B84]">Status</span>
          {FILTER_STATUS.map((f) => <button key={f.kode} type="button" aria-pressed={saring === f.kode} onClick={() => setSaring(f.kode)} className={saring === f.kode ? tombolAktif : tombolKecil}>{f.nama}</button>)}
        </div>
        {kek.baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada catatan kekurangan RAB untuk RO ini.{boleh ? "" : " Hanya ketua tim dan admin RO yang dapat mencatat."}</p>}
        {kek.baris.length > 0 && tampil.length === 0 && <p className="text-[13px] text-[#5B6B84]">Tidak ada catatan untuk pilihan ini. Pengguna hanya melihat RO yang menjadi kewenangannya; PPK, KPA, dan bendahara melihat semua.</p>}
        {tampil.length > 0 && (
          <div className="max-h-[460px] overflow-auto rounded-lg border border-[#DCE3EE]">
            <table className="w-full min-w-[900px] text-left text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-[#EEF3FB] text-[#44546F]">
                <tr><th className="px-2.5 py-2">Akun dan uraian</th><th className="px-2.5 py-2 text-right">Jumlah (Rp)</th><th className="px-2.5 py-2">Prioritas</th><th className="px-2.5 py-2">Dicatat</th><th className="px-2.5 py-2">Alasan</th><th className="px-2.5 py-2">Status</th><th className="px-2.5 py-2">Keputusan</th></tr>
              </thead>
              <tbody>
                {tampil.map((k) => (
                  <Fragment key={k.id}>
                  <tr className={`border-t border-[#EEF2F7] align-top ${k.terbuka ? "" : "opacity-70"}`}>
                    {mode?.jenis === "ubah" && mode.id === k.id ? (
                      <td colSpan={7} className="px-2.5 py-2.5">
                        <Formulir ro={kode} akunPilihan={akunPilihan} tandaId={k.id} lama={k} awal={{ akun_kode: k.akun_kode, uraian: k.uraian, jumlah: String(Math.round(Number(k.jumlah))), prioritas: k.prioritas_kode, alasan: k.alasan ?? "" }} tutup={() => setMode(null)} sesudah={sesudah} />
                      </td>
                    ) : (
                      <>
                        <td className="break-words px-2.5 py-2"><b className="font-mono text-[#0F2A52]">{k.akun_kode}</b> {k.uraian}</td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{angka(k.jumlah)}</td>
                        <td className="px-2.5 py-2">{k.prioritas_nama ? <Chip warna={WARNA_PRIORITAS[k.prioritas_kode] ?? "abu"}>{k.prioritas_nama}</Chip> : "-"}</td>
                        <td className="px-2.5 py-2"><span className="whitespace-nowrap">{tanggalSaja(k.dicatat_at)}</span><div className="text-[11.5px] text-[#5B6B84]">{nama(k.dicatat_oleh)}</div></td>
                        <td className="break-words px-2.5 py-2 text-[#5B6B84]">{k.alasan ?? "-"}</td>
                        <td className="px-2.5 py-2"><Chip warna={WARNA_STATUS_KEK[k.status] ?? "abu"}>{STATUS_KEK[k.status] ?? k.status}</Chip>{Number(k.kali_ditunda) > 0 && <div className="mt-1 text-[11.5px] text-[#5B6B84]">ditunda {angka(Number(k.kali_ditunda))}×</div>}</td>
                        <td className="px-2.5 py-2">
                          {!k.terbuka && (
                            <div className="text-[#5B6B84]">
                              {k.diputus_at && <span className="whitespace-nowrap">{tanggalSaja(k.diputus_at)}, {nama(k.diputus_oleh)}</span>}
                              {k.alasan_putus && <p className="break-words">{k.alasan_putus}</p>}
                            </div>
                          )}
                          {k.terbuka && !(boleh && mode === null) && <span className="text-[#6B7A93]">Menunggu tambahan pagu</span>}
                          {boleh && k.terbuka && mode === null && (
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => setMode({ jenis: "ubah", id: k.id })} className={tombolKecil}>Ubah</button>
                              <button type="button" onClick={() => setMode({ jenis: "tarik", id: k.id })} className={`${tombolKecil} text-[#7A1D22]`}>Tarik</button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  {mode?.jenis === "tarik" && mode.id === k.id && (
                    <tr className="bg-[#FFF7F7]"><td colSpan={7} className="px-2.5 py-2.5"><Tarik id={k.id} tutup={() => setMode(null)} sesudah={sesudah} /></td></tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>2. Catat kekurangan baru</h2>
          <span className="text-[12px] text-[#5B6B84]">Hanya ketua tim dan admin RO, untuk RO sendiri (anggota tim tidak mencatat)</span>
        </div>
        {boleh === true
          ? <Formulir key={kunciBaru} tetap ro={kode} akunPilihan={akunPilihan} awal={bentukIsian()} tutup={() => setKunciBaru((n) => n + 1)} sesudah={sesudah} />
          : <p className="text-[13px] text-[#5B6B84]">{boleh === null ? "Memeriksa hak akses…" : "Akun ini tidak berwenang mencatat kekurangan untuk RO ini. Catatan dibuat oleh ketua tim atau admin RO."}</p>}
      </div>

      <Kesempatan kode={kode} terbuka={terbuka} sesudah={sesudah} />

      <div className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>Riwayat keputusan</h2>
        {riwayat.length === 0
          ? <p className="text-[13px] text-[#5B6B84]">Belum ada. Setiap pencatatan dan keputusan atas catatan kekurangan tercatat dengan siapa dan kapan.</p>
          : (
            <ul className="max-h-[320px] divide-y divide-[#EEF2F7] overflow-auto rounded-lg border border-[#E8EDF5]">
              {riwayat.map((e, i) => (
                <li key={`${e.waktu}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 break-words text-[#1B2B4B]"><b>{nama(e.akun)}</b> {e.teks}</span>
                  <span className="whitespace-nowrap text-[11.5px] text-[#6B7A93]">{waktuWib(e.waktu)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>

      <div className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>Aturan catatan kekurangan</h2>
        <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {[
            ["K1", "Tidak ada minus", "RAB yang melebihi pagu tidak masuk POK dan tidak ditutup dengan dana penggenap minus. Kelebihan dicatat di sini."],
            ["K2", "Penggenap tepat pagu", "Jumlah tiap RO setelah revisi harus sama dengan pagu resmi; baris penggenap menutup selisihnya tanpa nilai negatif."],
            ["K3", "Kesempatan hanya saat ada tambahan resmi", "Dibuka PPK setelah revisi DJA atau DJPb sah, hanya untuk RO yang pagunya bertambah."],
            ["K4", "Ketua tim memutuskan", "Penuhi, tunda, atau tolak. Tolak wajib beralasan. Total yang dipenuhi tidak boleh melebihi tambahan."],
            ["K5", "Tunda tidak hilang", "Catatan yang ditunda muncul lagi pada tambahan pagu berikutnya. Tidak ada yang kedaluwarsa sendiri."],
            ["K6", "Terlihat sesuai RO", "Ketua tim dan admin RO melihat RO sendiri; PPK, KPA, dan bendahara melihat semua. KPA menerima ringkasan sebagai laporan."],
          ].map(([no, j, t]) => (
            <li key={no} className="flex flex-col gap-1 rounded-lg border border-[#E8EDF5] bg-[#F9FBFE] p-3">
              <span className="w-fit rounded bg-[#E3EEFF] px-1.5 text-[11px] font-bold text-[#1F5FD1]">{no}</span>
              <h3 className="text-[13px] font-bold text-[#0F2A52]">{j}</h3>
              <p className="text-[12px] leading-snug text-[#5B6B84]">{t}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
