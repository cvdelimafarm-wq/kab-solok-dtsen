"use client";

// app/sigap/kontrak/[id]/page.tsx
//
// (6 Okt 2026) Halaman pengisian data satu paket kontrak -- permintaan user: "upayakan semaksimalnya bisa
// diisi otomatis agar tidak banyak klik, user hanya verifikasi dan edit jika perlu, generate pdf/word
// dipecah sesuai nama dokumen".
//   1. Data inti (nama, nomor urut, tanggal mulai, durasi, penyedia, pembanding, MAK, item & harga)
//   2. Verifikasi hasil otomatis (nomor, tanggal, hari, terbilang, nilai, pejabat). Setiap kolom bisa
//      ditimpa; kolom yg ditimpa ditandai kuning + tombol ↺ kembali ke otomatis.
//   3. Unduh Word per dokumen / ZIP / gabungan, dan PDF (bila server punya LibreOffice).
// Tersimpan otomatis (±1,5 dtk setelah berhenti mengetik). Perhitungan memakai lib/kontrak/isi (sama
// persis dgn yg dipakai server saat membuat dokumen).

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir, tglPanjang } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import Bingkai from "../Bingkai";
import { aksiK, ambilK, unduhBerkas } from "../api";
import { PanelRujukan } from "../../pedia/komponen";
import { DAFTAR_DOKUMEN, DOK_TANGGAL, FIELD_MAK, FIELD_MASTER, JADWAL, angka, hitung, rp, terbilang, type Isian, type ItemIsian, type Penyedia } from "@/lib/kontrak/isi";

type PenyediaDb = Penyedia & { id: number };
type Paket = { id: number; tahun: number; nomor_urut: number | null; nama: string; status: string; penyedia_id: number | null; isian: Isian; timpa: Record<string, string> };
type Data = { kelola: boolean; paket: Paket; master: Record<string, string>; penyedia: PenyediaDb[] };

const LABEL = "text-[11.5px] font-bold text-[#4D5B6B]";

export default function HalamanPaket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [isian, setIsian] = useState<Isian | null>(null);
  const [timpa, setTimpa] = useState<Record<string, string>>({});
  const [penyediaId, setPenyediaId] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [simpan, setSimpan] = useState<"tersimpan" | "menunggu" | "menyimpan" | "gagal">("tersimpan");
  const [unduh, setUnduh] = useState<string | null>(null);
  const kotor = useRef(false);
  const pertama = useRef(true);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    ambilK<Data>({ bagian: "paket", id })
      .then((d) => {
        setData(d);
        setIsian({ durasi_hari: 1, items: [], pembanding: [], ...d.paket.isian, tahun: d.paket.tahun, nomor_urut: d.paket.isian.nomor_urut ?? d.paket.nomor_urut ?? "" });
        setTimpa(d.paket.timpa ?? {});
        setPenyediaId(d.paket.penyedia_id);
      })
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, [id]);

  const kelola = !!data?.kelola;
  const penyedia = useMemo(() => data?.penyedia.find((p) => p.id === penyediaId) ?? null, [data, penyediaId]);
  const h = useMemo(() => (isian && data ? hitung(data.master, penyedia, isian, timpa) : null), [isian, data, penyedia, timpa]);

  // ---------- simpan otomatis
  const simpanSekarang = useCallback(async () => {
    if (!isian || !kelola) return;
    setSimpan("menyimpan");
    try {
      await aksiK("simpan_paket", { id: Number(id), isian, timpa, penyedia_id: penyediaId });
      kotor.current = false;
      setSimpan("tersimpan");
    } catch (e) {
      setSimpan("gagal");
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [id, isian, timpa, penyediaId, kelola]);
  useEffect(() => {
    if (!isian) return;
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    if (!kelola) return;
    kotor.current = true;
    setSimpan("menunggu");
    const t = setTimeout(simpanSekarang, 1500);
    return () => clearTimeout(t);
  }, [isian, timpa, penyediaId, kelola, simpanSekarang]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (kotor.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, []);

  if (galat && !data)
    return (
      <main className="p-6">
        <Pesan>{galat}</Pesan>
      </main>
    );
  if (!data || !isian || !h) return <Memuat />;

  const set = (k: string, v: unknown) => setIsian((x) => (x ? { ...x, [k]: v } : x));
  const items = (isian.items ?? []) as ItemIsian[];
  const setItem = (i: number, patch: Partial<ItemIsian>) => set("items", items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const pembanding = (isian.pembanding ?? []) as string[];
  const setTimpaK = (k: string, v: string) =>
    setTimpa((t) => {
      const n = { ...t };
      if (v === h.otomatis[k]) delete n[k];
      else n[k] = v;
      return n;
    });

  async function ambilBerkas(dok: string, format: "docx" | "pdf") {
    const kunci = `${dok}-${format}`;
    setUnduh(kunci);
    try {
      if (kotor.current) await simpanSekarang();
      await unduhBerkas(`/api/sigap/kontrak/${id}/unduh?dok=${dok}&format=${format}`);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setUnduh(null);
    }
  }

  const Bidang = ({ k, label, lebar, panjang }: { k: string; label?: string; lebar?: boolean; panjang?: boolean }) => (
    <KolomVerif k={k} label={label} lebar={lebar} panjang={panjang} nilai={h.nilai[k] ?? ""} otomatis={h.otomatis[k] ?? ""} ditimpa={k in timpa} kelola={kelola} onSet={setTimpaK} />
  );

  const nTimpa = Object.keys(timpa).length;
  const terpakai = new Set<string>([
    ...DOK_TANGGAL.flatMap((d) => [d.nomor, d.tanggal, d.hari, d.terbilang].filter(Boolean) as string[]),
    ...FIELD_MASTER.map((f) => f.k),
  ]);

  return (
    <Bingkai
      jejak={["Pengadaan & kontrak", `TA ${isian.tahun} · No ${isian.nomor_urut || "–"}`]}
      judul={isian.Nama_Kegiatan_Pengadaan || "Paket tanpa nama"}
      sub={
        <>
          <span className={simpan === "gagal" ? "text-[#B5352D]" : simpan === "tersimpan" ? "" : "text-[#9A6200]"}>
            {simpan === "tersimpan" ? "✓ Tersimpan otomatis" : simpan === "menyimpan" ? "Menyimpan…" : simpan === "menunggu" ? "Perubahan belum tersimpan…" : "⚠ Gagal menyimpan"}
          </span>
          {!kelola && " · mode lihat saja"}
          {nTimpa > 0 && ` · ${nTimpa} kolom diubah manual`}
        </>
      }
      kanan={(gelap) => (
        <Link href="/sigap/kelola/pengadaan" className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN_O}>
          ← Daftar paket
        </Link>
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}

          {/* 1. Data inti */}
          <Kartu judul="① Data inti paket" ket="hanya ini yang perlu diisi — sisanya otomatis">
            <div className="grid gap-2.5 sm:grid-cols-4">
              <label className="flex flex-col gap-1 sm:col-span-4">
                <span className={LABEL}>Nama kegiatan pengadaan</span>
                <textarea rows={2} value={String(isian.Nama_Kegiatan_Pengadaan ?? "")} disabled={!kelola} onChange={(e) => set("Nama_Kegiatan_Pengadaan", e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Nomor urut surat</span>
                <input type="number" value={String(isian.nomor_urut ?? "")} disabled={!kelola} onChange={(e) => set("nomor_urut", e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Tanggal mulai kerja (SPMK)</span>
                <input type="date" value={String(isian.tanggal_mulai ?? "")} disabled={!kelola} onChange={(e) => set("tanggal_mulai", e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Durasi pekerjaan (hari kalender)</span>
                <input type="number" min={1} value={String(isian.durasi_hari ?? 1)} disabled={!kelola} onChange={(e) => set("durasi_hari", e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Libur tambahan (opsional)</span>
                <input
                  placeholder="2026-10-20, 2026-10-21"
                  defaultValue={(isian.libur ?? []).join(", ")}
                  disabled={!kelola}
                  onBlur={(e) => set("libur", e.target.value.split(/[,\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))}
                  className={INPUT}
                  title="Tanggal libur nasional/cuti bersama yang harus dilewati saat menghitung jadwal mundur"
                />
              </label>
            </div>
            {Object.keys(h.jadwal).length > 0 && (
              <div className="mt-3 rounded-xl bg-[#F8FAFC] p-2.5 text-[12px]">
                <p className="mb-1 font-extrabold text-[#1F6FD1]">Jadwal otomatis (hari kerja mundur dari tanggal mulai)</p>
                <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {JADWAL.map((j) => (
                    <div key={j.kunci} className="flex justify-between gap-2">
                      <span className="text-[#4D5B6B]">{j.label}</span>
                      <span className="whitespace-nowrap font-semibold">{tglPanjang(h.jadwal[j.kunci])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Kartu>

          {/* 2. Penyedia */}
          <Kartu judul="② Penyedia & pembanding survei harga">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className={LABEL}>Penyedia terpilih (= Survei 1)</span>
                <select value={penyediaId ?? ""} disabled={!kelola} onChange={(e) => setPenyediaId(e.target.value ? Number(e.target.value) : null)} className={INPUT}>
                  <option value="">— pilih penyedia —</option>
                  {data.penyedia.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                      {p.kota ? ` · ${p.kota}` : ""}
                    </option>
                  ))}
                </select>
                {penyedia && (!penyedia.npwp || !penyedia.nama_pimpinan || !penyedia.nomor_rekening) && (
                  <span className="text-[11.5px] text-amber-700">
                    Data penyedia belum lengkap (NPWP/pimpinan/rekening). Lengkapi di{" "}
                    <Link href="/sigap/kelola/pengadaan" className="underline">
                      tab Penyedia
                    </Link>
                    .
                  </span>
                )}
              </label>
              {[0, 1].map((k) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className={LABEL}>Pembanding {k + 1} (Survei {k + 2}){k === 1 ? " — opsional" : ""}</span>
                  <input
                    list="daftar-penyedia"
                    value={pembanding[k] ?? ""}
                    disabled={!kelola}
                    onChange={(e) => {
                      const b = [...pembanding];
                      b[k] = e.target.value;
                      set("pembanding", b.slice(0, 2));
                    }}
                    className={INPUT}
                  />
                </label>
              ))}
              <datalist id="daftar-penyedia">
                {data.penyedia.filter((p) => p.id !== penyediaId).map((p) => (
                  <option key={p.id} value={p.nama} />
                ))}
              </datalist>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>No. surat penawaran (dari penyedia)</span>
                <input value={String(isian.Nomor_Surat_Penawaran ?? "")} disabled={!kelola} onChange={(e) => set("Nomor_Surat_Penawaran", e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>No. surat permohonan pembayaran</span>
                <input value={String(isian.Permohonan_Pembayaran ?? "")} disabled={!kelola} onChange={(e) => set("Permohonan_Pembayaran", e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>No. kuitansi (opsional)</span>
                <input value={String(isian.Nomor_Kuitansi ?? "")} disabled={!kelola} onChange={(e) => set("Nomor_Kuitansi", e.target.value)} className={INPUT} />
              </label>
            </div>
          </Kartu>

          {/* 3. MAK */}
          <Kartu judul="③ Anggaran (MAK)">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FIELD_MAK.map((f) => (
                <label key={f.k} className="flex flex-col gap-1">
                  <span className={LABEL}>{f.label}</span>
                  <input value={String(isian[f.k] ?? "")} disabled={!kelola} onChange={(e) => set(f.k, e.target.value)} className={INPUT} />
                </label>
              ))}
            </div>
          </Kartu>

          {/* 4. Item */}
          <Kartu
            judul="④ Item pekerjaan & harga"
            ket="HPS kosong = harga survei tertinggi · penawaran kosong = HPS · nego kosong = penawaran"
            kanan={
              kelola && (
                <button type="button" className={BTN_O} onClick={() => set("items", [...items, { uraian: "", volume: 1, satuan: "OH", harga_survei: [] }])}>
                  + Item
                </button>
              )
            }
          >
            {items.length === 0 && <p className="py-3 text-center text-[12.5px] text-[#7B8794]">Belum ada item. Klik “+ Item”.</p>}
            <div className="space-y-3">
              {items.map((it, i) => {
                const hi = h.items[i];
                return (
                  <div key={i} className="rounded-xl border border-[#E3E8EE] p-2.5">
                    <div className="grid gap-2 sm:grid-cols-[60px_minmax(0,1fr)_80px_80px_auto]">
                      <input value={it.no ?? ""} placeholder={hi?.no} disabled={!kelola} onChange={(e) => setItem(i, { no: e.target.value })} className={INPUT} title="No (kosong = I, II, III…)" />
                      <input value={it.uraian} placeholder="Uraian, mis. Fullday Meeting" disabled={!kelola} onChange={(e) => setItem(i, { uraian: e.target.value })} className={INPUT} />
                      <input type="number" value={String(it.volume ?? "")} placeholder="Vol" disabled={!kelola} onChange={(e) => setItem(i, { volume: e.target.value })} className={INPUT} />
                      <input value={it.satuan} placeholder="Satuan" disabled={!kelola} onChange={(e) => setItem(i, { satuan: e.target.value })} className={INPUT} />
                      {kelola && (
                        <button type="button" className="rounded-lg px-2 text-[12px] font-bold text-red-700 hover:bg-red-50" onClick={() => confirm("Hapus item ini dari paket?") && set("items", items.filter((_, j) => j !== i))}>
                          Hapus
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input value={it.keterangan ?? ""} placeholder="Keterangan, mis. 1 hari (tgl 14 Juli 2026)" disabled={!kelola} onChange={(e) => setItem(i, { keterangan: e.target.value })} className={INPUT} />
                      <textarea rows={2} value={it.spesifikasi ?? ""} placeholder="Spesifikasi (boleh beberapa baris)" disabled={!kelola} onChange={(e) => setItem(i, { spesifikasi: e.target.value })} className={INPUT} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                      {[0, 1, 2].map((k) => (
                        <label key={k} className="flex flex-col gap-0.5">
                          <span className="truncate text-[10.5px] font-bold text-[#7B8794]" title={h.nilai[`Nama_Survei_${k + 1}`]}>
                            Survei {k + 1}
                            {k === 0 ? " (penyedia)" : ""}
                          </span>
                          <input
                            inputMode="numeric"
                            value={it.harga_survei?.[k] ?? ""}
                            disabled={!kelola || (k === 2 && !pembanding[1]?.trim())}
                            onChange={(e) => {
                              const hs = [...(it.harga_survei ?? [])];
                              hs[k] = e.target.value;
                              setItem(i, { harga_survei: hs });
                            }}
                            className={INPUT}
                          />
                        </label>
                      ))}
                      {(["harga_hps", "harga_penawaran", "harga_nego"] as const).map((f) => (
                        <label key={f} className="flex flex-col gap-0.5">
                          <span className="text-[10.5px] font-bold text-[#7B8794]">{f === "harga_hps" ? "HPS" : f === "harga_penawaran" ? "Penawaran" : "Hasil nego"}</span>
                          <input inputMode="numeric" value={String(it[f] ?? "")} placeholder={hi?.[f]} disabled={!kelola} onChange={(e) => setItem(i, { [f]: e.target.value })} className={INPUT} />
                        </label>
                      ))}
                    </div>
                    {hi && (
                      <p className="mt-1.5 text-[11.5px] text-[#4D5B6B]">
                        Jumlah: HPS Rp{hi.jumlah_hps} · penawaran Rp{hi.jumlah_penawaran} · <b>nego Rp{hi.jumlah_nego}</b>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Kartu>

          {/* 5. Verifikasi */}
          <Kartu judul="⑤ Verifikasi hasil otomatis" ket="klik kolom untuk mengubah; ↺ = kembali ke otomatis">
            <h4 className="mb-1.5 mt-1 text-[12.5px] font-extrabold text-[#1F6FD1]">Nilai</h4>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Bidang k="Nilai_HPS" label="Nilai HPS (Rp)" />
              <Bidang k="Nilai_HPS_Terbilang" label="Terbilang HPS" />
              <Bidang k="Nilai_Penawaran" label="Nilai penawaran (Rp)" />
              <Bidang k="Nilai_Penawaran_Terbilang" label="Terbilang penawaran" />
              <Bidang k="Nilai_Nego" label="Nilai kontrak / hasil nego (Rp)" />
              <Bidang k="Nilai_Terbilang_Nego" label="Terbilang nilai kontrak" />
              <Bidang k="Selisih_Harga_Nego" label="Selisih penawaran − nego (Rp)" />
              <Bidang k="Jangka_Waktu_Hari" label="Jangka waktu pelaksanaan (hari)" />
            </div>

            <h4 className="mb-1.5 mt-4 text-[12.5px] font-extrabold text-[#1F6FD1]">Nomor & tanggal dokumen</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] text-[#7B8794]">
                    <th className="py-1 pr-2">Dokumen</th>
                    <th className="py-1 pr-2">Nomor</th>
                    <th className="py-1 pr-2">Tanggal</th>
                    <th className="py-1 pr-2">Hari</th>
                    <th className="py-1">Tanggal terbilang</th>
                  </tr>
                </thead>
                <tbody>
                  {DOK_TANGGAL.map((d) => (
                    <tr key={d.label} className="border-t border-[#EDF0F4] align-top">
                      <td className="py-1.5 pr-2 font-semibold">{d.label}</td>
                      <td className="py-1 pr-2">{d.nomor ? <Bidang k={d.nomor} /> : null}</td>
                      <td className="w-[140px] py-1 pr-2">{d.tanggal ? <Bidang k={d.tanggal} /> : null}</td>
                      <td className="w-[95px] py-1 pr-2">{d.hari ? <Bidang k={d.hari} /> : null}</td>
                      <td className="py-1">{d.terbilang ? <Bidang k={d.terbilang} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-[12.5px] font-extrabold text-[#1F6FD1]">Pejabat, kantor & ketentuan kontrak (dari Master TA {isian.tahun})</summary>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {FIELD_MASTER.map((f) => (
                  <Bidang key={f.k} k={f.k} label={f.label} lebar={f.k === "DIPA"} panjang={f.k === "DIPA"} />
                ))}
              </div>
            </details>
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] font-extrabold text-[#1F6FD1]">Semua isian lainnya</summary>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {Object.keys(h.nilai)
                  .filter((k) => !terpakai.has(k) && !k.startsWith("Nilai_") && k !== "Jangka_Waktu_Hari" && k !== "Selisih_Harga_Nego")
                  .sort()
                  .map((k) => (
                    <Bidang key={k} k={k} label={k.replace(/_/g, " ")} />
                  ))}
              </div>
            </details>
          </Kartu>
        </div>

        {/* Panel kanan: periksa + unduh */}
        <aside className="space-y-3 lg:sticky lg:top-[72px] lg:self-start">
          {/* (7 Okt 2026) Rujukan SIGAP PEDIA utk paket ini */}
          <PanelRujukan jenis="kontrak_paket" refId={Number(id)} />
          <Kartu judul="Periksa">
            {h.peringatan.length === 0 ? (
              <p className="text-[12.5px] font-semibold text-emerald-700">✓ Tidak ada temuan. Silakan verifikasi lalu unduh.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-amber-800">
                {h.peringatan.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 rounded-lg bg-[#F8FAFC] p-2 text-[12px]">
              <div className="flex justify-between">
                <span>HPS</span>
                <b>Rp{h.nilai.Nilai_HPS}</b>
              </div>
              <div className="flex justify-between">
                <span>Nilai kontrak</span>
                <b>Rp{h.nilai.Nilai_Nego}</b>
              </div>
              {angka(isian.Nilai_Pagu_Anggaran_Rp) > 0 && (
                <div className="flex justify-between">
                  <span>Pagu</span>
                  <b>Rp{rp(angka(isian.Nilai_Pagu_Anggaran_Rp))}</b>
                </div>
              )}
              <p className="mt-1 text-[11px] italic text-[#7B8794]">{terbilang(angka(h.nilai.Nilai_Nego))} rupiah</p>
            </div>
          </Kartu>
          <Kartu judul="Unduh dokumen" ket={`${DAFTAR_DOKUMEN.length} dokumen`}>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              <button type="button" className={BTN} disabled={!!unduh} onClick={() => ambilBerkas("zip", "docx")}>
                {unduh === "zip-docx" ? "Menyiapkan…" : "Semua Word (ZIP)"}
              </button>
              <button type="button" className={BTN_O} disabled={!!unduh} onClick={() => ambilBerkas("zip", "pdf")}>
                {unduh === "zip-pdf" ? "Menyiapkan…" : "Semua PDF (ZIP)"}
              </button>
              <button type="button" className={`${BTN_O} col-span-2`} disabled={!!unduh} onClick={() => ambilBerkas("semua", "docx")}>
                {unduh === "semua-docx" ? "Menyiapkan…" : "1 file Word gabungan"}
              </button>
            </div>
            <ul className="divide-y divide-[#EDF0F4] text-[12.5px]">
              {DAFTAR_DOKUMEN.map((d) => (
                <li key={d.kode} className="flex items-center gap-1.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate" title={d.nama}>
                    {d.nama}
                  </span>
                  <button type="button" disabled={!!unduh} onClick={() => ambilBerkas(d.kode, "docx")} className="rounded-md bg-[#E3EEFB] px-2 py-0.5 text-[11px] font-bold text-[#1F6FD1] hover:bg-[#CFE0F7] disabled:opacity-50">
                    {unduh === `${d.kode}-docx` ? "…" : "Word"}
                  </button>
                  <button type="button" disabled={!!unduh} onClick={() => ambilBerkas(d.kode, "pdf")} className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
                    {unduh === `${d.kode}-pdf` ? "…" : "PDF"}
                  </button>
                </li>
              ))}
            </ul>
          </Kartu>
        </aside>
      </div>
    </Bingkai>
  );
}

/** Kolom verifikasi: nilai otomatis, bisa ditimpa (disimpan saat kolom ditinggalkan). Komponen tingkat
 *  atas supaya fokus tidak hilang saat halaman dirender ulang oleh simpan otomatis. */
function KolomVerif({ k, label, lebar, panjang, nilai, otomatis, ditimpa, kelola, onSet }: { k: string; label?: string; lebar?: boolean; panjang?: boolean; nilai: string; otomatis: string; ditimpa: boolean; kelola: boolean; onSet: (k: string, v: string) => void }) {
  const kelas = `${INPUT} w-full ${ditimpa ? "border-amber-400 bg-amber-50" : !nilai ? "border-red-300 bg-red-50/40" : ""}`;
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${lebar ? "sm:col-span-2" : ""}`}>
      {label && (
        <span className={LABEL}>
          {label} {ditimpa && <Chip w="wait">diubah manual</Chip>}
        </span>
      )}
      <div className="flex gap-1">
        {panjang ? (
          <textarea rows={2} defaultValue={nilai} key={nilai} disabled={!kelola} onBlur={(e) => e.target.value !== nilai && onSet(k, e.target.value)} className={kelas} />
        ) : (
          <input defaultValue={nilai} key={nilai} disabled={!kelola} onBlur={(e) => e.target.value !== nilai && onSet(k, e.target.value)} className={kelas} />
        )}
        {ditimpa && kelola && (
          <button type="button" title={`Kembalikan ke otomatis: ${otomatis}`} className="shrink-0 rounded-lg border border-slate-300 px-2 text-[13px] hover:bg-slate-50" onClick={() => onSet(k, otomatis)}>
            ↺
          </button>
        )}
      </div>
    </label>
  );
}
