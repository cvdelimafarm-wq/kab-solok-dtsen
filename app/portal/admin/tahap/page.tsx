"use client";

// app/portal/admin/tahap/page.tsx
//
// (9 Okt 2026) Admin Aplikasi mengatur tahap proses bisnis per kegiatan induk (mockup 5 disetujui user): urutan tahap, nama, uraian,
// isi (modul yang tampil di halaman kerja tahap itu) dan aturan buka. Tahap yang dibuang tidak dihapus -- hanya dinonaktifkan.
// Data: GET/POST /api/portal/admin/tahap.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiPortal, bacaSesi } from "../../sesi";
import { NAMA_MODUL, periksaTahapAdmin, type BukaMode } from "@/lib/sigapTahap";

type InfoInduk = { kode: string; nama: string; pendek: string; ikon: string; kegiatan_ids: number[]; urutan: number; aktif: boolean };
type BarisTahap = { induk_kode: string; kode: string; urutan: number; nama: string; uraian: string | null; isi: string[]; buka_mode: BukaMode; buka_tanggal: string | null; aktif: boolean };
type Kegiatan = { id: number; nama: string; jenis?: string | null };
type Data = { induk: InfoInduk[]; tahap: BarisTahap[]; kegiatan: Kegiatan[] };
type Edit = { kode: string; baru: boolean; nama: string; uraian: string; isi: string[]; buka_mode: BukaMode; buka_tanggal: string; aktif: boolean };

const KARTU = "rounded-xl border border-[#E3E8EE] bg-white";
const INPUT = "w-full rounded-lg border border-[#CBD6E6] bg-white px-3 py-2 text-[14px] text-[#14202E] outline-none focus:border-[#1F6FD1]";
const TOMBOL = "inline-flex min-h-[36px] items-center justify-center rounded-lg px-3 text-[13px] font-semibold disabled:opacity-40";

const ATURAN: { v: BukaMode; label: string }[] = [
  { v: "langsung", label: "Langsung terbuka" },
  { v: "setelah_sebelumnya", label: "Setelah tahap sebelumnya selesai" },
  { v: "tanggal", label: "Mulai tanggal tertentu" },
];

function kodeDariNama(nama: string, dipakai: Set<string>): string {
  const dasar = nama.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "tahap";
  let k = dasar.length >= 2 ? dasar : `${dasar}_t`;
  let n = 2;
  while (dipakai.has(k)) k = `${dasar.slice(0, 26)}_${n++}`;
  return k;
}

export default function AturTahapPage() {
  const [data, setData] = useState<Data | null>(null);
  const [kode, setKode] = useState<string | null>(null);
  const kodeRef = useRef<string | null>(null); // kegiatan yang sedang dipilih, dibaca saat muat ulang
  kodeRef.current = kode;
  const [daftar, setDaftar] = useState<Edit[]>([]);
  const [kotor, setKotor] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const isiDari = useCallback((d: Data, k: string) => {
    setDaftar(
      d.tahap
        .filter((t) => t.induk_kode === k)
        .sort((a, b) => a.urutan - b.urutan)
        .map((t) => ({ kode: t.kode, baru: false, nama: t.nama, uraian: t.uraian ?? "", isi: t.isi ?? [], buka_mode: t.buka_mode, buka_tanggal: t.buka_tanggal ?? "", aktif: t.aktif }))
    );
    setKotor(false);
  }, []);

  const muat = useCallback(async () => {
    if (!bacaSesi()) {
      window.location.replace(`/?lanjut=${encodeURIComponent("/portal/admin/tahap")}`);
      return;
    }
    try {
      const d = await apiPortal<Data>("/api/portal/admin/tahap");
      setData(d);
      const sebelumnya = kodeRef.current;
      const pilih = sebelumnya && d.induk.some((i) => i.kode === sebelumnya) ? sebelumnya : (d.induk[0]?.kode ?? null);
      setKode(pilih);
      if (pilih) isiDari(d, pilih);
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return window.location.replace(`/?lanjut=${encodeURIComponent("/portal/admin/tahap")}`);
      setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [isiDari]);

  useEffect(() => {
    muat();
  }, [muat]);

  const induk = data?.induk.find((i) => i.kode === kode) ?? null;
  const namaKeg = useMemo(() => new Map((data?.kegiatan ?? []).map((k) => [k.id, k.nama])), [data]);
  const modulTersedia = useMemo(() => {
    const dasar = ["konfirmasi", "pelatihan", "wilayah_tim"];
    return [...dasar, ...(induk?.kegiatan_ids ?? []).map((id) => `translok:${id}`)];
  }, [induk]);

  const ubah = (i: number, p: Partial<Edit>) => {
    setDaftar((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setKotor(true);
    setPesan(null);
  };
  const geser = (i: number, arah: -1 | 1) => {
    setDaftar((d) => {
      const j = i + arah;
      if (j < 0 || j >= d.length) return d;
      const c = [...d];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setKotor(true);
    setPesan(null);
  };
  const tambah = () => {
    setDaftar((d) => [...d, { kode: kodeDariNama("tahap baru", new Set(d.map((x) => x.kode))), baru: true, nama: "", uraian: "", isi: [], buka_mode: "langsung", buka_tanggal: "", aktif: true }]);
    setKotor(true);
  };
  const centang = (i: number, m: string, on: boolean) => ubah(i, { isi: on ? [...daftar[i].isi, m] : daftar[i].isi.filter((x) => x !== m) });

  async function simpan() {
    if (!induk) return;
    setGalat(null);
    setPesan(null);
    // kode tahap baru diturunkan dari namanya
    const dipakai = new Set(daftar.filter((x) => !x.baru).map((x) => x.kode));
    const kirim = daftar.map((x) => {
      if (!x.baru) return x;
      const k = kodeDariNama(x.nama, dipakai);
      dipakai.add(k);
      return { ...x, kode: k };
    });
    for (const x of kirim) {
      const err = periksaTahapAdmin({ kode: x.kode, nama: x.nama, isi: x.isi, buka_mode: x.buka_mode, buka_tanggal: x.buka_tanggal || null }, induk.kegiatan_ids);
      if (err) return setGalat(err);
    }
    setSibuk(true);
    try {
      await apiPortal("/api/portal/admin/tahap", {
        method: "POST",
        body: JSON.stringify({
          induk_kode: induk.kode,
          tahap: kirim.map((x) => ({ kode: x.kode, nama: x.nama.trim(), uraian: x.uraian.trim(), isi: x.isi, buka_mode: x.buka_mode, buka_tanggal: x.buka_mode === "tanggal" ? x.buka_tanggal : null, aktif: x.aktif })),
        }),
      });
      setPesan("Tahap tersimpan. Perubahan tampil di aplikasi petugas pada pemuatan berikutnya.");
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F3F5F8] pb-24 text-[#14202E]">
      <header className="bg-[#0E2A47] px-4 py-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Link href="/portal/admin" className="text-[13px] text-[#C9D6E6] hover:text-white">← Admin Aplikasi</Link>
          <span className="text-[12.5px] font-bold italic tracking-wide">BPS KABUPATEN SOLOK</span>
        </div>
        <div className="mx-auto mt-4 max-w-4xl">
          <p className="text-[12.5px] text-[#C9D6E6]">Admin Aplikasi</p>
          <h1 className="text-[24px] font-bold">Atur tahap kegiatan</h1>
          <p className="mt-1 text-[13px] text-[#C9D6E6]">Proses bisnis tiap kegiatan: urutan tahap, isinya, dan kapan dibuka.</p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-4xl space-y-4 px-4">
        {galat && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]">{galat}</p>}
        {pesan && <p className="rounded-lg border-l-4 border-[#1E7A5E] bg-[#E3F4EE] px-3 py-2 text-[13px] text-[#14532D]">{pesan}</p>}
        {!data && !galat && <p className="text-[13.5px] text-[#7B8794]">Memuat…</p>}

        {data && (
          <div className="flex flex-wrap gap-2">
            {data.induk.map((i) => (
              <button
                key={i.kode}
                type="button"
                disabled={kotor && i.kode !== kode}
                onClick={() => {
                  setKode(i.kode);
                  isiDari(data, i.kode);
                  setPesan(null);
                  setGalat(null);
                }}
                className={`${TOMBOL} border ${i.kode === kode ? "border-[#0F2A52] bg-[#0F2A52] text-white" : "border-[#CBD6E6] bg-white text-[#14202E]"}`}
              >
                {i.nama}
                {!i.aktif && " (nonaktif)"}
              </button>
            ))}
            {kotor && <span className="self-center text-[12px] text-[#8A5A0B]">Simpan atau batalkan dulu sebelum pindah kegiatan.</span>}
          </div>
        )}

        {induk && (
          <>
            <p className="text-[13px] text-[#4D5B6B]">
              {induk.nama} · Transport Lokal tersedia dari kegiatan anggaran:{" "}
              {induk.kegiatan_ids.length ? induk.kegiatan_ids.map((id) => namaKeg.get(id) ?? `kegiatan ${id}`).join(", ") : "-"}
            </p>

            <ol className="space-y-3">
              {daftar.map((x, i) => (
                <li key={x.kode + i} className={`${KARTU} p-4 ${x.aktif ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#0F2A52] text-[14px] font-extrabold text-white">{i + 1}</span>
                    <input value={x.nama} onChange={(e) => ubah(i, { nama: e.target.value })} placeholder="Nama tahap (mis. Pelatihan)" maxLength={60} className={`${INPUT} font-bold`} aria-label={`Nama tahap ${i + 1}`} />
                    <button type="button" onClick={() => geser(i, -1)} disabled={i === 0} className={`${TOMBOL} border border-[#CBD6E6] bg-white`} aria-label="Naikkan">↑</button>
                    <button type="button" onClick={() => geser(i, 1)} disabled={i === daftar.length - 1} className={`${TOMBOL} border border-[#CBD6E6] bg-white`} aria-label="Turunkan">↓</button>
                  </div>
                  <input value={x.uraian} onChange={(e) => ubah(i, { uraian: e.target.value })} placeholder="Uraian singkat (opsional)" maxLength={200} className={`${INPUT} mt-2`} aria-label="Uraian" />

                  <fieldset className="mt-3">
                    <legend className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#7B8794]">Isi tahap</legend>
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                      {modulTersedia.map((m) => (
                        <label key={m} className="flex items-center gap-2 rounded-lg border border-[#E3E8EE] px-3 py-2 text-[13.5px]">
                          <input type="checkbox" checked={x.isi.includes(m)} onChange={(e) => centang(i, m, e.target.checked)} className="h-4 w-4" />
                          {NAMA_MODUL(m, m.startsWith("translok:") ? namaKeg.get(Number(m.slice(9))) : undefined)}
                        </label>
                      ))}
                    </div>
                    {x.isi.length === 0 && <p className="mt-1 text-[12px] text-[#7B8794]">Belum ada isi: tahap tampil sebagai &ldquo;Belum ada isi&rdquo;.</p>}
                  </fieldset>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#7B8794]">
                      Aturan buka
                      <select value={x.buka_mode} onChange={(e) => ubah(i, { buka_mode: e.target.value as BukaMode })} className={`${INPUT} mt-1 normal-case tracking-normal`}>
                        {ATURAN.map((a) => (
                          <option key={a.v} value={a.v}>{a.label}</option>
                        ))}
                      </select>
                    </label>
                    {x.buka_mode === "tanggal" && (
                      <label className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#7B8794]">
                        Tanggal buka (WIB)
                        <input type="date" value={x.buka_tanggal} onChange={(e) => ubah(i, { buka_tanggal: e.target.value })} className={`${INPUT} mt-1`} />
                      </label>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[13.5px]">
                      <input type="checkbox" checked={x.aktif} onChange={(e) => ubah(i, { aktif: e.target.checked })} className="h-4 w-4" />
                      Tahap aktif (tampil di aplikasi petugas)
                    </label>
                    {x.baru && (
                      <button type="button" onClick={() => { setDaftar((d) => d.filter((_, j) => j !== i)); setKotor(true); }} className={`${TOMBOL} text-[#B42329] hover:bg-[#FDECEA]`}>Batal tambah</button>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <button type="button" onClick={tambah} disabled={daftar.length >= 12} className={`${TOMBOL} w-full border-2 border-dashed border-[#9DB4D8] bg-white text-[#1F6FD1]`}>
              + Tambah tahap
            </button>
            <p className="text-[12px] leading-snug text-[#7B8794]">Tahap tidak pernah dihapus permanen: matikan &ldquo;Tahap aktif&rdquo; bila tidak dipakai lagi. Tahap yang berisi modul yang tidak berlaku bagi seorang petugas otomatis tidak tampil bagi petugas itu.</p>
          </>
        )}
      </div>

      {induk && kotor && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E3E8EE] bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-end gap-2">
            <button type="button" onClick={() => data && kode && isiDari(data, kode)} disabled={sibuk} className={`${TOMBOL} border border-[#CBD6E6] bg-white`}>Batalkan perubahan</button>
            <button type="button" onClick={simpan} disabled={sibuk} className={`${TOMBOL} bg-[#1F6FD1] text-white`}>{sibuk ? "Menyimpan…" : "Simpan tahap"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
