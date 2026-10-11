"use client";

// app/sigap/kelola/pendataan/page.tsx
//
// (11 Okt 2026) Unggah daftar KK sasaran Pendataan keroyokan PPL/PML -- hanya pemegang izin bencana.admin (level kelola). Permintaan user.
// Alur: pilih berkas -> diperiksa di peramban ini -> unggah bertahap (500 baris per kiriman; baris bermasalah dilaporkan, yang lain tetap masuk) -> riwayat.
// Dua jenis berkas: (1) EKSPOR FASIH-SM "1303 - Pendataan" (CSV/Excel): disaring otomatis -- hanya Sub SLS sampel (daftar awal) dan Keberadaan_Keluarga
// 1 Ditemukan, 2 Baru, 5 Tidak dapat ditemui sampai akhir pendataan, 6 Keluarga khusus; hanya kolom yang dibutuhkan lembar yang dikirim (NIK, Nomor KK,
// tanggal lahir, pendapatan, dan kondisi rumah dibuang di sini, tidak pernah sampai ke server); ID penugasan jadi kunci: unggah ulang MEMPERBARUI, tidak menggandakan.
// (2) Templat Excel/CSV buatan sendiri (Kode Sub SLS, Nama KK, ...).
// Pembatalan bersifat lunak (tidak menghapus) dan hanya bila belum ada KK dari unggahan itu yang didata.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { LABEL_KEBERADAAN, MAKS_BARIS_UNGGAH, adalahFasih, bacaCsvFasih, periksaBarisKk, petakanBarisExcel, petakanBarisFasih, type BarisKk } from "@/lib/pendataan";
import { tglJam } from "../../identifikasi/useIdentifikasi";

type Batch = { id: number; nama_berkas: string | null; diunggah_at: string; oleh: string | null; diterima: number; ditolak: number; aktif: number; sudah_didata: number; dibatalkan_at: string | null };
type Data = { sekarang: string; kegiatan_id: number; batch: Batch[]; total_aktif: number; total_didata: number; sampel: string[] };
type Tolak = { no: number; pesan: string };
type Periksa = {
  nama: string;
  fasih: boolean;
  sah: { no: number; data: BarisKk }[];
  salah: Tolak[];
  /** dilewati karena status keberadaan (kode -> jumlah) */
  statusLewat: Record<number, number>;
  bukanSampel: number;
  kosong: number;
  sub: number;
  bertitik: number;
  peringatan: number;
  total: number;
};

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Ringkasan penyaringan di peramban yang ikut disimpan pada riwayat unggahan (angka saja). */
function catatanPeriksa(p: Periksa, diperbarui: number, sama: number): Record<string, number> {
  const c: Record<string, number> = { baris_berkas: p.total, bukan_sampel: p.bukanSampel, diperbarui, sama, koordinat_diabaikan: p.peringatan };
  for (const [k, v] of Object.entries(p.statusLewat)) c[`lewat_status_${k === "-1" ? "lain" : k}`] = v;
  return c;
}

export default function UnggahPendataan() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [periksa, setPeriksa] = useState<Periksa | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [progres, setProgres] = useState<{ kirim: number; dari: number } | null>(null);
  const [hasil, setHasil] = useState<{ diterima: number; diperbarui: number; sama: number; ditolak: Tolak[] } | null>(null);
  const [konfirmBatal, setKonfirmBatal] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const berkas = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return router.replace("/");
    try {
      setData(await apiPortal<Data>("/api/portal/pendataan/unggah"));
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [router]);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function pilihBerkas(f: File | undefined) {
    if (!f) return;
    setMembaca(true);
    setHasil(null);
    setPeriksa(null);
    setGalat(null);
    try {
      // CSV dibaca sendiri (ekspor FASIH-SM bukan CSV baku); Excel lewat pustaka xlsx
      let judul: string[];
      let baris: Record<string, unknown>[];
      if (/\.csv$/i.test(f.name)) {
        const r = bacaCsvFasih(await f.text());
        judul = r.judul;
        baris = r.baris;
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: true });
        const nama = wb.SheetNames.find((n) => n.toLowerCase().includes("daftar kk")) ?? wb.SheetNames[0];
        baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: true });
        judul = baris.length ? Object.keys(baris[0]) : [];
      }
      const fasih = adalahFasih(judul);
      const sampel = data?.sampel?.length ? new Set(data.sampel) : null;
      const sah: Periksa["sah"] = [];
      const salah: Tolak[] = [];
      const statusLewat: Record<number, number> = {};
      let kosong = 0;
      let bukanSampel = 0;
      let peringatan = 0;
      baris.forEach((r, i) => {
        const no = i + 2; // baris 1 = judul kolom
        if (Object.values(r).every((v) => String(v ?? "").trim() === "")) {
          kosong++;
          return;
        }
        let mentah: Record<string, unknown>;
        if (fasih) {
          const h = petakanBarisFasih(r);
          if (h.jenis === "lewati") {
            const k = h.keberadaan ?? -1;
            statusLewat[k] = (statusLewat[k] ?? 0) + 1;
            return;
          }
          if (h.jenis === "salah") {
            salah.push({ no, pesan: h.pesan });
            return;
          }
          if (h.peringatan) peringatan++;
          mentah = h.mentah;
        } else mentah = petakanBarisExcel(r);
        const c = periksaBarisKk(mentah);
        if (!c.ok) {
          salah.push({ no, pesan: c.pesan });
          return;
        }
        if (sampel && !sampel.has(c.baris.idsubsls)) {
          bukanSampel++;
          return;
        }
        sah.push({ no, data: c.baris });
      });
      setPeriksa({
        nama: f.name,
        fasih,
        sah,
        salah,
        statusLewat,
        bukanSampel,
        kosong,
        sub: new Set(sah.map((s) => s.data.idsubsls)).size,
        bertitik: sah.filter((s) => s.data.lat !== null).length,
        peringatan,
        total: baris.length - kosong,
      });
    } catch (e) {
      setGalat(e instanceof Error ? `Berkas tidak terbaca: ${e.message}` : "Berkas tidak terbaca.");
    } finally {
      setMembaca(false);
      if (berkas.current) berkas.current.value = "";
    }
  }

  async function unggah() {
    if (!periksa || periksa.sah.length === 0 || sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const { batch_id } = await apiPortal<{ batch_id: number }>("/api/portal/pendataan/unggah", { method: "POST", body: JSON.stringify({ aksi: "mulai", nama_berkas: periksa.nama }) });
      const ditolak: Tolak[] = [...periksa.salah];
      let diterima = 0;
      let diperbarui = 0;
      let sama = 0;
      setProgres({ kirim: 0, dari: periksa.sah.length });
      for (let i = 0; i < periksa.sah.length; i += MAKS_BARIS_UNGGAH) {
        const bagian = periksa.sah.slice(i, i + MAKS_BARIS_UNGGAH);
        const r = await apiPortal<{ diterima: number; diperbarui: number; sama: number; ditolak: Tolak[] }>("/api/portal/pendataan/unggah", { method: "POST", body: JSON.stringify({ aksi: "baris", batch_id, baris: bagian }) });
        diterima += r.diterima;
        diperbarui += r.diperbarui;
        sama += r.sama;
        ditolak.push(...r.ditolak);
        setProgres({ kirim: Math.min(i + MAKS_BARIS_UNGGAH, periksa.sah.length), dari: periksa.sah.length });
      }
      ditolak.sort((a, b) => a.no - b.no);
      await apiPortal("/api/portal/pendataan/unggah", { method: "POST", body: JSON.stringify({ aksi: "selesai", batch_id, ditolak, catatan: catatanPeriksa(periksa, diperbarui, sama) }) });
      setHasil({ diterima, diperbarui, sama, ditolak });
      setPeriksa(null);
      await muat();
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      setGalat((e instanceof Error ? e.message : "Gagal mengunggah.") + " Bagian yang sudah masuk tetap tersimpan; cek riwayat di bawah sebelum mengunggah ulang (baris kembar otomatis dilewati).");
      await muat();
    } finally {
      setProgres(null);
      setSibuk(false);
    }
  }

  async function batalkan(id: number) {
    setSibuk(true);
    try {
      await apiPortal("/api/portal/pendataan/unggah", { method: "POST", body: JSON.stringify({ aksi: "batalkan", batch_id: id }) });
      setKonfirmBatal(null);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal membatalkan.");
    } finally {
      setSibuk(false);
    }
  }

  async function unduhTolak(tolak: Tolak[]) {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tolak.map((t) => ({ "Baris di Excel": t.no, Alasan: t.pesan }))), "Baris ditolak");
    XLSX.writeFile(wb, "daftar-kk-baris-ditolak.xlsx");
  }

  const ringkasSalah = useMemo(() => periksa?.salah.slice(0, 15) ?? [], [periksa]);

  return (
    <main className="min-h-screen bg-[#F5F8FE] px-4 py-6 text-[#1B2B4B]">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-[12px] font-bold text-[#1F5FD1]">
          ‹ Beranda
        </Link>
        <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]">Kelola · Pendataan Pascabencana</p>
        <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.4px] text-[#0F2A52]">Unggah Daftar KK Pendataan</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-[#55657D]">
          Daftar KK sasaran per Sub SLS. Setelah diunggah, seluruh anggota tim (PML dan semua PPL) di Sub SLS itu melihat daftarnya di Lembar Pendataan. Berkas yang diterima: <b>ekspor FASIH-SM &quot;1303 - Pendataan&quot;</b> (CSV/Excel; disaring otomatis ke Sub SLS sampel dan status keberadaan 1, 2, 5, 6; NIK, Nomor KK, dan pendapatan tidak ikut dikirim) atau templat Excel/CSV (kode Sub SLS teks 16 digit, koordinat desimal).
        </p>

        {galat && <p className="mt-4 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

        {data && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
              <span className="text-[12px] text-[#55657D]">KK dalam daftar</span>
              <b className="mt-1 block text-[26px] text-[#0F2A52]">{fmt(data.total_aktif)}</b>
            </div>
            <div className="rounded-[16px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
              <span className="text-[12px] text-[#55657D]">Sudah didata</span>
              <b className="mt-1 block text-[26px] text-[#0F2A52]">
                {fmt(data.total_didata)} <span className="text-[14px] font-bold text-[#6B7A90]">{data.total_aktif ? `(${Math.round((data.total_didata / data.total_aktif) * 100)}%)` : ""}</span>
              </b>
            </div>
          </div>
        )}

        <section className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
          <h2 className="text-[15px] font-extrabold text-[#0F2A52]">1. Pilih berkas</h2>
          <p className="mt-1 text-[12.5px] text-[#55657D]">Unggah ulang berkas FASIH yang lebih baru aman: KK yang sama (ID penugasan sama) hanya diperbarui, hasil pendataan tidak tersentuh.</p>
          <input ref={berkas} type="file" accept=".xlsx,.xls,.csv" className="sr-only" id="berkas-kk" onChange={(e) => void pilihBerkas(e.target.files?.[0])} />
          <label htmlFor="berkas-kk" className={`mt-3 inline-flex h-11 cursor-pointer items-center rounded-[12px] px-5 text-[13.5px] font-extrabold text-white ${membaca || sibuk ? "bg-[#A9BCD8]" : "bg-[#1F5FD1]"}`}>
            {membaca ? "Membaca berkas…" : "Pilih berkas Excel/CSV"}
          </label>

          {periksa && (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] font-bold text-[#0F2A52]">{periksa.nama}</p>
              <p className="text-[12px] text-[#55657D]">
                Jenis berkas: <b>{periksa.fasih ? "ekspor FASIH-SM" : "templat"}</b> · {fmt(periksa.total)} baris terbaca
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kotak judul="Akan diunggah" nilai={fmt(periksa.sah.length)} warna="#19A463" />
                <Kotak judul="Bermasalah" nilai={fmt(periksa.salah.length)} warna={periksa.salah.length ? "#B42329" : "#6B7A90"} />
                <Kotak judul="Sub SLS" nilai={fmt(periksa.sub)} warna="#0F2A52" />
                <Kotak judul="Punya koordinat" nilai={periksa.sah.length ? `${Math.round((periksa.bertitik / periksa.sah.length) * 100)}%` : "-"} warna="#0F2A52" />
              </div>
              {(Object.keys(periksa.statusLewat).length > 0 || periksa.bukanSampel > 0) && (
                <div className="rounded-[12px] bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#52627A]">
                  <b className="text-[#0F2A52]">Disaring otomatis (tidak diunggah)</b>
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(periksa.statusLewat).map(([k, n]) => (
                      <li key={k}>
                        {fmt(n)} baris berstatus keberadaan {k === "-1" ? "lain" : `${k} (${LABEL_KEBERADAAN[Number(k)] ?? "lain"})`}
                      </li>
                    ))}
                    {periksa.bukanSampel > 0 && <li>{fmt(periksa.bukanSampel)} baris di Sub SLS yang bukan sampel (di luar daftar awal)</li>}
                  </ul>
                </div>
              )}
              {periksa.peringatan > 0 && <p className="rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#6B4A00]">{fmt(periksa.peringatan)} KK punya koordinat rusak atau di luar Kab. Solok: tetap diunggah tanpa titik.</p>}
              {periksa.sah.length > 0 && periksa.bertitik < periksa.sah.length && (
                <p className="rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#6B4A00]">{fmt(periksa.sah.length - periksa.bertitik)} KK tanpa koordinat: tetap muncul di daftar, tetapi tidak tampil di peta.</p>
              )}
              {ringkasSalah.length > 0 && (
                <div className="rounded-[12px] border border-[#F2C9CB] bg-[#FFF7F7] p-3">
                  <b className="text-[12.5px] text-[#7A1D22]">Baris bermasalah (tidak ikut diunggah)</b>
                  <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-[#7A1D22]">
                    {ringkasSalah.map((t) => (
                      <li key={t.no}>
                        Baris {t.no}: {t.pesan}
                      </li>
                    ))}
                  </ul>
                  {periksa.salah.length > ringkasSalah.length && <p className="mt-1 text-[12px] text-[#7A1D22]">…dan {fmt(periksa.salah.length - ringkasSalah.length)} baris lain.</p>}
                  <button type="button" onClick={() => void unduhTolak(periksa.salah)} className="mt-2 min-h-[36px] rounded-full bg-white px-3 text-[12px] font-extrabold text-[#7A1D22] shadow-[0_2px_6px_rgba(15,42,82,.08)]">
                    Unduh daftar masalah
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={sibuk || periksa.sah.length === 0} onClick={() => void unggah()} className="h-11 rounded-[12px] bg-[#19A463] px-5 text-[13.5px] font-extrabold text-white disabled:bg-[#A9BCD8]">
                  {sibuk ? "Mengunggah…" : `Unggah ${fmt(periksa.sah.length)} KK`}
                </button>
                {progres && (
                  <span className="text-[12.5px] text-[#55657D]">
                    {fmt(progres.kirim)} dari {fmt(progres.dari)} baris terkirim
                  </span>
                )}
              </div>
            </div>
          )}

          {hasil && (
            <div className="mt-4 rounded-[12px] bg-[#E8F6EE] p-3 text-[13px] text-[#14532D]">
              <b>{fmt(hasil.diterima)} KK baru masuk daftar.</b>
              {hasil.diperbarui > 0 ? ` ${fmt(hasil.diperbarui)} KK diperbarui datanya.` : ""}
              {hasil.sama > 0 ? ` ${fmt(hasil.sama)} KK sudah ada dan tidak berubah.` : ""} {hasil.ditolak.length > 0 ? `${fmt(hasil.ditolak.length)} baris tidak masuk (kode tidak dikenal, kembar, atau tidak sah).` : "Tidak ada baris yang ditolak."}
              {hasil.ditolak.length > 0 && (
                <button type="button" onClick={() => void unduhTolak(hasil.ditolak)} className="ml-2 min-h-[36px] rounded-full bg-white px-3 text-[12px] font-extrabold text-[#14532D]">
                  Unduh daftar yang ditolak
                </button>
              )}
            </div>
          )}
        </section>

        <section className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
          <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Riwayat unggahan</h2>
          {!data && !galat && <div className="mt-3 h-24 animate-pulse rounded-[12px] bg-[#F1F4FA]" aria-busy="true" />}
          {data && data.batch.length === 0 && <p className="mt-2 text-[13px] text-[#55657D]">Belum ada unggahan.</p>}
          <ul className="mt-2 divide-y divide-[#E8EDF5]">
            {data?.batch.map((b) => (
              <li key={b.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block truncate text-[13.5px] text-[#0F2A52]">{b.nama_berkas ?? `Unggahan ${b.id}`}</b>
                    <span className="text-[12px] text-[#6B7A90]">
                      {tglJam(b.diunggah_at)} · {b.oleh ?? "-"}
                    </span>
                  </div>
                  {b.dibatalkan_at ? (
                    <span className="rounded-full bg-[#E3E8F0] px-2.5 py-1 text-[11.5px] font-extrabold text-[#55657D]">Dibatalkan</span>
                  ) : konfirmBatal === b.id ? (
                    <span className="flex items-center gap-2">
                      <button type="button" disabled={sibuk} onClick={() => void batalkan(b.id)} className="min-h-[36px] rounded-full bg-[#B42329] px-3 text-[12px] font-extrabold text-white disabled:opacity-60">
                        Ya, batalkan
                      </button>
                      <button type="button" onClick={() => setKonfirmBatal(null)} className="min-h-[36px] rounded-full bg-[#E3E8F0] px-3 text-[12px] font-extrabold text-[#55657D]">
                        Tidak
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={b.sudah_didata > 0}
                      onClick={() => setKonfirmBatal(b.id)}
                      title={b.sudah_didata > 0 ? "Sudah ada KK yang didata" : undefined}
                      className="min-h-[36px] rounded-full bg-white px-3 text-[12px] font-extrabold text-[#B42329] shadow-[0_2px_6px_rgba(15,42,82,.08)] disabled:text-[#A9B4C4]"
                    >
                      Batalkan unggahan
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] text-[#55657D]">
                  {fmt(b.diterima)} masuk · {fmt(b.ditolak)} ditolak · {fmt(b.sudah_didata)} sudah didata
                  {b.dibatalkan_at ? " · daftar dinonaktifkan (data tidak dihapus)" : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Kotak({ judul, nilai, warna }: { judul: string; nilai: string; warna: string }) {
  return (
    <div className="rounded-[12px] bg-[#F5F8FE] p-3">
      <span className="text-[11.5px] text-[#55657D]">{judul}</span>
      <b className="mt-0.5 block text-[20px]" style={{ color: warna }}>
        {nilai}
      </b>
    </div>
  );
}
