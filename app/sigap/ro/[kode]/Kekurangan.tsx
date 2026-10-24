"use client";

// app/sigap/ro/[kode]/Kekurangan.tsx
//
// (24 Okt 2026) Tab Kekurangan RAB: daftar catatan + formulir catat, ubah, tarik. Tombol hanya tampil bila akun berwenang (kewenangan
// kek_catat: ketua tim dan admin RO untuk RO sendiri); yang memutuskan tetap basis data. Logika isian: lib/keu/kekurangan.ts.

import { Fragment, useEffect, useMemo, useState } from "react";
import { argsCatat, argsTarik, argsUbah, bentukIsian, periksaKekurangan, PRIORITAS, type IsianKekurangan } from "@/lib/keu/kekurangan";
import { angka, rupiah, STATUS_KEK, urlBaca } from "@/lib/keu/ro";
import { argsPutuskan, awalKeputusan, LABEL_PUTUSAN, periksaKeputusan, type Keputusan, type Putusan } from "@/lib/keu/revisi";
import { aksiKeu, useAnggaranRo, useBacaKeu, useBoleh, useKirim } from "../useKeu";
import { Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kpi, label, Memuat, Potong, tombol, tombolAktif, tombolKecil, tombolUtama } from "../../keu-ui";
import type { WarnaChip } from "@/lib/keu/revisi";


type Kek = { id: number; akun_kode: string; uraian: string; jumlah: number | string; prioritas_kode: string; prioritas_nama: string | null; alasan: string | null; status: string; terbuka: boolean; kali_ditunda: number | string | null; alasan_putus: string | null };

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

function Formulir({ ro, akunPilihan, awal, tandaId, lama, tutup, sesudah }: { ro: string; akunPilihan: string[]; awal: IsianKekurangan; tandaId?: number; lama?: Kek; tutup: () => void; sesudah: () => Promise<void> }) {
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
    <section className="space-y-3 rounded-lg border border-[#B7CDF5] bg-[#F7FAFE] p-3">
      <h3 className="text-[14px] font-bold text-[#0F2A52]">{baru ? "Catat kekurangan RAB" : "Ubah catatan"}</h3>
      <Bidang nilai={v} ubah={(p) => setV((x) => ({ ...x, ...p }))} akunPilihan={akunPilihan} baru={baru} />
      {(pesan.length > 0 || galat) && (
        <ul className="space-y-1 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]" role="alert">
          {[...pesan, ...(galat ? [galat] : [])].map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={simpan} disabled={mengirim} className={`${tombol} flex-1 bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" onClick={tutup} disabled={mengirim} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>
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

/** Ketua tim memutuskan SEMUA catatan terbuka sekaligus saat ada tambahan pagu resmi terbuka (K4-K6). Saran sistem hanya titik awal. */
function PanelPutus({ kode, terbuka, sesudah }: { kode: string; terbuka: Kek[]; sesudah: () => Promise<void> }) {
  const ringkas = useBacaKeu<RingkasKek>(urlBaca("keu_v_kekurangan_ro", { ro_kode: kode }, { batas: 1, kolom: ["tambahan_terbuka_id", "tambahan_terbuka_jumlah"] }));
  const boleh = useBoleh("kek_putus", kode);
  const tid = ringkas.baris?.[0]?.tambahan_terbuka_id ?? null;
  const jumlahTambahan = Number(ringkas.baris?.[0]?.tambahan_terbuka_jumlah ?? 0);
  const [daftar, setDaftar] = useState<Keputusan[] | null>(null);
  const [salah, setSalah] = useState<string[]>([]);
  const { kirim, mengirim, galat } = useKirim(async () => { await ringkas.muat(); await sesudah(); });
  const idKunci = terbuka.map((k) => k.id).join(",");

  useEffect(() => {
    if (!boleh || tid === null) return;
    let hidup = true;
    void aksiKeu<{ kekurangan_id: number | string; saran: string }[]>("keu_kekurangan_saran", { p_tambahan: Number(tid) }).then((r) => {
      if (hidup) setDaftar(awalKeputusan(terbuka.map((k) => k.id), r.ok && Array.isArray(r.data) ? r.data : []));
    });
    return () => { hidup = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boleh, tid, idKunci]);

  const jml = useMemo(() => new Map(terbuka.map((k) => [k.id, Number(k.jumlah)])), [terbuka]);
  if (!boleh || tid === null || terbuka.length === 0) return null;
  const hitung = daftar ? periksaKeputusan(daftar, jml, jumlahTambahan) : null;
  const ubah = (id: number, p: Partial<Keputusan>) => setDaftar((d) => (d ? d.map((x) => (x.id === id ? { ...x, ...p } : x)) : d));
  const simpan = async () => {
    if (!daftar || !hitung) return;
    setSalah(hitung.galat);
    if (hitung.galat.length) return;
    await kirim("keu_kekurangan_putuskan", argsPutuskan(Number(tid), daftar));
  };
  return (
    <section className={`${kartu} space-y-3 border-l-4 !border-l-[#1F5FD1]`} aria-labelledby="judul-putus">
      <h3 id="judul-putus" className="text-[14px] font-semibold text-[#0F2A52]">Tambahan pagu {rupiah(jumlahTambahan)} menunggu keputusan</h3>
      <p className="text-[12.5px] text-[#5B6B84]">Putuskan semua catatan sekaligus: penuhi, tunda, atau tolak (tolak wajib alasan). Awalnya terisi saran sistem menurut prioritas lalu tanggal catat; Bapak/Ibu yang memutuskan. Sisa tambahan menjadi dana penggenap.</p>
      {!daftar && <div className="h-16 animate-pulse rounded-md bg-[#EEF2F7]" aria-busy="true" />}
      {daftar && (
        <ul className="space-y-2">
          {terbuka.map((k) => {
            const d = daftar.find((x) => x.id === k.id);
            if (!d) return null;
            return (
              <li key={k.id} className="rounded-md bg-[#F5F8FE] p-3">
                <p className="break-words text-[13px] font-bold text-[#0F2A52]">{k.uraian}</p>
                <p className="text-[12px] text-[#6B7A93]">{rupiah(k.jumlah)}{k.prioritas_nama ? ` · ${k.prioritas_nama}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Keputusan untuk ${k.uraian}`}>
                  {(["penuhi", "tunda", "tolak"] as Putusan[]).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={d.keputusan === p} onClick={() => ubah(k.id, { keputusan: p })}
                      className={`min-h-[40px] flex-1 rounded-md px-3 text-[13px] font-semibold ${d.keputusan === p ? "bg-[#1F5FD1] text-white" : "border-[1.5px] border-[#C5D0E2] bg-white text-[#44546F]"}`}>{LABEL_PUTUSAN[p]}</button>
                  ))}
                </div>
                {d.keputusan === "tolak" && (
                  <div className="mt-2">
                    <label className={label} htmlFor={`pt-${k.id}`}>Alasan menolak</label>
                    <input id={`pt-${k.id}`} className={kolom} maxLength={300} value={d.alasan} onChange={(e) => ubah(k.id, { alasan: e.target.value })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hitung && <p className="text-[13px] font-bold text-[#0F2A52]">Dipenuhi {rupiah(hitung.dipenuhi)} · sisa jadi dana penggenap {rupiah(Math.max(0, hitung.sisa))}</p>}
      {(salah.length > 0 || galat) && (
        <ul role="alert" className="space-y-1 rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
          {[...salah, ...(galat ? [galat] : [])].map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      <button type="button" disabled={mengirim || !daftar} onClick={() => void simpan()} className={`${tombol} w-full bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan..." : "Simpan keputusan"}</button>
    </section>
  );
}

const WARNA_STATUS_KEK: Record<string, WarnaChip> = { tercatat: "biru", ditunda: "kuning", dipenuhi: "hijau", ditolak: "merah", ditarik: "abu" };
const WARNA_PRIORITAS: Record<string, WarnaChip> = { inti: "merah", penting: "kuning", tunda: "abu" };
const FILTER_STATUS: { kode: string; nama: string }[] = [{ kode: "", nama: "Semua" }, { kode: "tercatat", nama: "Tercatat" }, { kode: "ditunda", nama: "Ditunda" }, { kode: "dipenuhi", nama: "Dipenuhi" }, { kode: "ditolak", nama: "Ditolak" }, { kode: "ditarik", nama: "Ditarik" }];

export function TabKekurangan({ kode }: { kode: string }) {
  const kek = useBacaKeu<Kek>(urlBaca("keu_v_kekurangan", { ro_kode: kode }, { urut: "prioritas_urut", batas: 2000, kolom: ["id", "akun_kode", "uraian", "jumlah", "prioritas_kode", "prioritas_nama", "prioritas_urut", "alasan", "status", "terbuka", "kali_ditunda", "alasan_putus"] }));
  const boleh = useBoleh("kek_catat", kode);
  const ang = useAnggaranRo(kode);
  const akunPilihan = useMemo(() => [...new Set((ang.anggaran ?? []).flatMap((k) => k.akun.map((a) => a.akun)))].sort(), [ang.anggaran]);
  const [mode, setMode] = useState<{ jenis: "baru" } | { jenis: "ubah" | "tarik"; id: number } | null>(null);
  const [saring, setSaring] = useState("");
  const sesudah = async () => { await kek.muat(); };

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
        <p className="text-[12.5px] text-[#5B6B84]">Dana penggenap tidak boleh minus dan tiap RO harus tepat sampai pagu resmi, jadi kebutuhan RAB yang melebihi pagu tidak ditulis ke POK. Kebutuhan itu dicatat di sini. Saat pusat menambah pagu dan PPK mencatatnya, ketua tim memutuskan tiap catatan: penuhi, tunda, atau tolak.</p>
      </div>
      {kek.terpotong && <Potong />}
      <div className={kisi}>
        <Kpi label="Tercatat, belum diputuskan" nilai={angka(nDi("tercatat"))} sub={rupiah(jumlahDi("tercatat"))} />
        <Kpi label="Ditunda" nilai={angka(nDi("ditunda"))} sub={`${rupiah(jumlahDi("ditunda"))}; muncul lagi saat ada tambahan pagu`} warna="kn" />
        <Kpi label="Dipenuhi" nilai={angka(nDi("dipenuhi"))} sub={rupiah(jumlahDi("dipenuhi"))} warna="hj" />
        <Kpi label="Ditolak" nilai={angka(nDi("ditolak"))} sub={`${rupiah(jumlahDi("ditolak"))}; diarsipkan dengan alasan`} />
      </div>

      <PanelPutus kode={kode} terbuka={terbuka} sesudah={sesudah} />

      <div className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>1. Daftar catatan kekurangan</h2>
          {boleh && mode === null && <button type="button" onClick={() => setMode({ jenis: "baru" })} className={tombolUtama}>Catat kekurangan</button>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[#5B6B84]">Status</span>
          {FILTER_STATUS.map((f) => <button key={f.kode} type="button" aria-pressed={saring === f.kode} onClick={() => setSaring(f.kode)} className={saring === f.kode ? tombolAktif : tombolKecil}>{f.nama}</button>)}
        </div>
        {mode?.jenis === "baru" && <Formulir ro={kode} akunPilihan={akunPilihan} awal={bentukIsian()} tutup={() => setMode(null)} sesudah={sesudah} />}
        {kek.baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada catatan kekurangan RAB untuk RO ini.{boleh ? "" : " Hanya ketua tim dan admin RO yang dapat mencatat."}</p>}
        {kek.baris.length > 0 && tampil.length === 0 && <p className="text-[13px] text-[#5B6B84]">Tidak ada catatan untuk filter ini.</p>}
        {tampil.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
            <table className="w-full min-w-[820px] text-left text-[12.5px]">
              <thead className="bg-[#EEF3FB] text-[#44546F]">
                <tr><th className="px-2.5 py-2">Akun dan uraian</th><th className="px-2.5 py-2 text-right">Jumlah (Rp)</th><th className="px-2.5 py-2">Prioritas</th><th className="px-2.5 py-2">Alasan</th><th className="px-2.5 py-2">Status</th><th className="px-2.5 py-2">Keputusan dan aksi</th></tr>
              </thead>
              <tbody>
                {tampil.map((k) => (
                  <Fragment key={k.id}>
                  <tr className={`border-t border-[#EEF2F7] align-top ${k.terbuka ? "" : "opacity-70"}`}>
                    {mode?.jenis === "ubah" && mode.id === k.id ? (
                      <td colSpan={6} className="px-2.5 py-2.5">
                        <Formulir ro={kode} akunPilihan={akunPilihan} tandaId={k.id} lama={k} awal={{ akun_kode: k.akun_kode, uraian: k.uraian, jumlah: String(Math.round(Number(k.jumlah))), prioritas: k.prioritas_kode, alasan: k.alasan ?? "" }} tutup={() => setMode(null)} sesudah={sesudah} />
                      </td>
                    ) : (
                      <>
                        <td className="break-words px-2.5 py-2"><b className="font-mono text-[#0F2A52]">{k.akun_kode}</b> {k.uraian}</td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{angka(k.jumlah)}</td>
                        <td className="px-2.5 py-2">{k.prioritas_nama ? <Chip warna={WARNA_PRIORITAS[k.prioritas_kode] ?? "abu"}>{k.prioritas_nama}</Chip> : "-"}</td>
                        <td className="break-words px-2.5 py-2 text-[#5B6B84]">{k.alasan ?? "-"}</td>
                        <td className="px-2.5 py-2"><Chip warna={WARNA_STATUS_KEK[k.status] ?? "abu"}>{STATUS_KEK[k.status] ?? k.status}</Chip>{Number(k.kali_ditunda) > 0 && <div className="mt-1 text-[11.5px] text-[#5B6B84]">ditunda {angka(Number(k.kali_ditunda))}×</div>}</td>
                        <td className="px-2.5 py-2">
                          {!k.terbuka && k.alasan_putus && <p className="break-words text-[#5B6B84]">{k.alasan_putus}</p>}
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
                    <tr className="bg-[#FFF7F7]"><td colSpan={6} className="px-2.5 py-2.5"><Tarik id={k.id} tutup={() => setMode(null)} sesudah={sesudah} /></td></tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!boleh && <p className="text-[12px] text-[#5B6B84]">Mencatat kekurangan hanya untuk ketua tim dan admin RO pada RO ini (anggota tim tidak mencatat).</p>}
      </div>

      <div className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>Aturan catatan kekurangan</h2>
        <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {[
            ["K1", "Tidak ada minus", "RAB yang melebihi pagu tidak masuk POK dan tidak ditutup dengan dana penggenap minus. Kelebihan dicatat di sini."],
            ["K2", "Penggenap tepat pagu", "Jumlah tiap RO setelah revisi harus sama dengan pagu resmi; baris penggenap menutup selisihnya tanpa nilai negatif."],
            ["K3", "Kesempatan hanya saat ada tambahan resmi", "Dibuka PPK setelah revisi DJA atau DJPb sah, hanya untuk RO yang pagunya bertambah."],
            ["K4", "Ketua tim memutuskan", "Penuhi, tunda, atau tolak. Tolak wajib beralasan. Total yang dipenuhi tidak boleh melebihi tambahan."],
            ["K5", "Tunda tidak hilang", "Catatan yang ditunda muncul lagi pada tambahan pagu berikutnya."],
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
