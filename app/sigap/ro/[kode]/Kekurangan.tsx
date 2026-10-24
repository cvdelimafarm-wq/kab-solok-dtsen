"use client";

// app/sigap/ro/[kode]/Kekurangan.tsx
//
// (24 Okt 2026) Tab Kekurangan RAB: daftar catatan + formulir catat, ubah, tarik. Tombol hanya tampil bila akun berwenang (kewenangan
// kek_catat: ketua tim dan admin RO untuk RO sendiri); yang memutuskan tetap basis data. Logika isian: lib/keu/kekurangan.ts.

import { useEffect, useMemo, useState } from "react";
import { argsCatat, argsTarik, argsUbah, bentukIsian, periksaKekurangan, PRIORITAS, type IsianKekurangan } from "@/lib/keu/kekurangan";
import { angka, rupiah, STATUS_KEK, urlBaca } from "@/lib/keu/ro";
import { argsPutuskan, awalKeputusan, LABEL_PUTUSAN, periksaKeputusan, type Keputusan, type Putusan } from "@/lib/keu/revisi";
import { aksiKeu, useAnggaranRo, useBacaKeu, useBoleh, useKirim } from "../useKeu";

const kartu = "rounded-[20px] bg-white p-4 shadow-[0_4px_16px_rgba(15,42,82,0.08)]";
const kolom = "box-border min-h-[44px] w-full rounded-[12px] border-[1.5px] border-[#C5D0E2] bg-[#F8FBFF] px-3 text-[14px] font-semibold text-[#0F2A52]";
const label = "mb-1 block text-[12px] font-bold text-[#44546F]";
const tombol = "min-h-[44px] rounded-[12px] px-4 text-[13.5px] font-extrabold disabled:opacity-50";

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
    <section className={`${kartu} space-y-3`}>
      <h3 className="text-[14px] font-extrabold text-[#0F2A52]">{baru ? "Catat kekurangan RAB" : "Ubah catatan"}</h3>
      <Bidang nilai={v} ubah={(p) => setV((x) => ({ ...x, ...p }))} akunPilihan={akunPilihan} baru={baru} />
      {(pesan.length > 0 || galat) && (
        <ul className="space-y-1 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]" role="alert">
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
    <div className="mt-2 space-y-2 rounded-[14px] bg-[#F5F8FE] p-3">
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
    <section className={`${kartu} space-y-3 border-l-4 border-[#1F5FD1]`} aria-labelledby="judul-putus">
      <h3 id="judul-putus" className="text-[14px] font-extrabold text-[#0F2A52]">Tambahan pagu {rupiah(jumlahTambahan)} menunggu keputusan</h3>
      <p className="text-[12.5px] text-[#5B6B84]">Putuskan semua catatan sekaligus: penuhi, tunda, atau tolak (tolak wajib alasan). Awalnya terisi saran sistem menurut prioritas lalu tanggal catat; Bapak/Ibu yang memutuskan. Sisa tambahan menjadi dana penggenap.</p>
      {!daftar && <div className="h-16 animate-pulse rounded-[12px] bg-[#EEF2F7]" aria-busy="true" />}
      {daftar && (
        <ul className="space-y-2">
          {terbuka.map((k) => {
            const d = daftar.find((x) => x.id === k.id);
            if (!d) return null;
            return (
              <li key={k.id} className="rounded-[12px] bg-[#F5F8FE] p-3">
                <p className="break-words text-[13px] font-bold text-[#0F2A52]">{k.uraian}</p>
                <p className="text-[12px] text-[#6B7A93]">{rupiah(k.jumlah)}{k.prioritas_nama ? ` · ${k.prioritas_nama}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Keputusan untuk ${k.uraian}`}>
                  {(["penuhi", "tunda", "tolak"] as Putusan[]).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={d.keputusan === p} onClick={() => ubah(k.id, { keputusan: p })}
                      className={`min-h-[44px] flex-1 rounded-[12px] px-3 text-[13px] font-extrabold ${d.keputusan === p ? "bg-[#1F5FD1] text-white" : "border-[1.5px] border-[#C5D0E2] bg-white text-[#44546F]"}`}>{LABEL_PUTUSAN[p]}</button>
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
        <ul role="alert" className="space-y-1 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
          {[...salah, ...(galat ? [galat] : [])].map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      <button type="button" disabled={mengirim || !daftar} onClick={() => void simpan()} className={`${tombol} w-full bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan..." : "Simpan keputusan"}</button>
    </section>
  );
}

export function TabKekurangan({ kode }: { kode: string }) {
  const kek = useBacaKeu<Kek>(urlBaca("keu_v_kekurangan", { ro_kode: kode }, { urut: "prioritas_urut", batas: 2000, kolom: ["id", "akun_kode", "uraian", "jumlah", "prioritas_kode", "prioritas_nama", "prioritas_urut", "alasan", "status", "terbuka", "kali_ditunda", "alasan_putus"] }));
  const boleh = useBoleh("kek_catat", kode);
  const ang = useAnggaranRo(kode);
  const akunPilihan = useMemo(() => [...new Set((ang.anggaran ?? []).flatMap((k) => k.akun.map((a) => a.akun)))].sort(), [ang.anggaran]);
  const [mode, setMode] = useState<{ jenis: "baru" } | { jenis: "ubah" | "tarik"; id: number } | null>(null);
  const sesudah = async () => { await kek.muat(); };

  if (kek.galat) return <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kek.galat}</p>;
  if (!kek.baris) return <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />;
  const terbuka = kek.baris.filter((k) => k.terbuka);
  const jumlah = terbuka.reduce((a, k) => a + Number(k.jumlah), 0);
  return (
    <div className="space-y-2.5">
      {kek.terpotong && <p className="rounded-[14px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-bold text-[#8A6200]">Data terlalu banyak sehingga hanya sebagian yang ditampilkan.</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-[#0F2A52]">{terbuka.length} catatan terbuka · {rupiah(jumlah)}</p>
        {boleh && mode === null && <button type="button" onClick={() => setMode({ jenis: "baru" })} className={`${tombol} bg-[#1F5FD1] text-white`}>Catat kekurangan</button>}
      </div>
      <PanelPutus kode={kode} terbuka={terbuka} sesudah={sesudah} />
      {mode?.jenis === "baru" && <Formulir ro={kode} akunPilihan={akunPilihan} awal={bentukIsian()} tutup={() => setMode(null)} sesudah={sesudah} />}
      {kek.baris.length === 0 && <p className={`${kartu} text-[13.5px] text-[#5B6B84]`}>Belum ada catatan kekurangan RAB untuk RO ini.{boleh ? "" : " Hanya ketua tim dan admin RO yang dapat mencatat."}</p>}
      <ul className="space-y-2.5">
        {kek.baris.map((k) => (
          <li key={k.id} className={`${kartu} ${k.terbuka ? "" : "opacity-70"}`}>
            {mode?.jenis === "ubah" && mode.id === k.id ? (
              <Formulir ro={kode} akunPilihan={akunPilihan} tandaId={k.id} lama={k} awal={{ akun_kode: k.akun_kode, uraian: k.uraian, jumlah: String(Math.round(Number(k.jumlah))), prioritas: k.prioritas_kode, alasan: k.alasan ?? "" }} tutup={() => setMode(null)} sesudah={sesudah} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-[13.5px] font-bold leading-snug text-[#0F2A52]">{k.uraian}</p>
                  <span className="flex-none rounded-full bg-[#EEF2F7] px-2.5 py-1 text-[11px] font-extrabold text-[#44546F]">{STATUS_KEK[k.status] ?? k.status}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-[#6B7A93]">Akun {k.akun_kode} · {rupiah(k.jumlah)}{k.prioritas_nama ? ` · ${k.prioritas_nama}` : ""}{Number(k.kali_ditunda) > 0 ? ` · ditunda ${angka(Number(k.kali_ditunda))}×` : ""}</p>
                {k.alasan && <p className="mt-1 break-words text-[12.5px] text-[#44546F]">{k.alasan}</p>}
                {!k.terbuka && k.alasan_putus && <p className="mt-1 break-words text-[12.5px] text-[#6B7A93]">Keputusan: {k.alasan_putus}</p>}
                {boleh && k.terbuka && mode === null && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setMode({ jenis: "ubah", id: k.id })} className={`${tombol} bg-[#E6EFFD] text-[#1F4EA8]`}>Ubah</button>
                    <button type="button" onClick={() => setMode({ jenis: "tarik", id: k.id })} className={`${tombol} bg-[#FDE8E8] text-[#9B1C23]`}>Tarik</button>
                  </div>
                )}
                {mode?.jenis === "tarik" && mode.id === k.id && <Tarik id={k.id} tutup={() => setMode(null)} sesudah={sesudah} />}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
