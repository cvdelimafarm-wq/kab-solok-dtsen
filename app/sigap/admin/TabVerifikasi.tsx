"use client";

// app/sigap/admin/TabVerifikasi.tsx
//
// (5 Okt 2026) Tab ✅ Verifikasi & Kunci -- mockup-sigap-admin layar 5 (permintaan user):
//  - Tabel per petugas: hari dibayar · kelompok, nominal Rupiah, kelengkapan 6 dokumen (chip), status.
//  - Pratinjau SPJ (PDF dari /api/sigap/admin/dokumen, dibuka di tab baru), Verifikasi & Kunci (konfirmasi),
//    Buka kunci (bila boleh_buka, alasan wajib).
//  - Peringatan bila belum_selesai (masih ada hari kerja mendatang).

import IkonMenu from "@/app/portal/IkonMenu";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aksi, ambil, ambilBlob, bukaBlob, pesanGalat, rentangPendek, rupiah, SesiBerakhir, waktuWib } from "./api";
import { bagiBatch, namaZip, ringkasanMassal, unikanNama, type HasilMassal } from "@/lib/sigapUnduhMassal";
import { BTN, BTN_G, BTN_O, BTN_R, Chip, INPUT, KartuAngka, Kartu, Memuat, Pesan, TabelKartu, TD, TH } from "./ui";

type Dok = { surat_tugas: boolean; kwitansi: boolean; visum: boolean; laporan: boolean; dokumentasi: boolean; surat_pernyataan: boolean };
type Row = {
  penugasan_id: number;
  nama: string;
  peran: string;
  hari_kerja: number;
  hari_dibayar: number;
  kelompok: { mulai: string; selesai: string; jumlah_hari: number }[];
  nominal: number;
  dokumen: Dok;
  belum_selesai: boolean;
  /** (10 Okt 2026) semua hari kerja lengkap menurut aturan kegiatan */
  semua_lengkap?: boolean;
  dikunci_at: string | null;
  dikunci_oleh: string | null;
};
type Data = { rows: Row[]; boleh_kelola: boolean; boleh_buka: boolean };

const NAMA_DOK: [keyof Dok, string][] = [
  ["surat_tugas", "ST"],
  ["kwitansi", "Kwitansi"],
  ["visum", "Visum"],
  ["laporan", "Laporan"],
  ["dokumentasi", "Dokumentasi"],
  ["surat_pernyataan", "S. Pernyataan"],
];
const jmlDok = (d: Dok) => NAMA_DOK.filter(([k]) => d[k]).length;
/** (10 Okt 2026) siap dikunci: belum dikunci, hari kerja selesai, ada hari dibayar, dan 6/6 dokumen ATAU semua hari kerja lengkap
 *  (kegiatan tanpa laporan harian, mis. pelatihan, tidak pernah punya chip Laporan). */
const siapKunci = (r: Row) => !r.dikunci_at && !r.belum_selesai && r.hari_dibayar > 0 && (jmlDok(r.dokumen) === 6 || !!r.semua_lengkap);

export default function TabVerifikasi({ kegiatanId }: { kegiatanId: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [fStatus, setFStatus] = useState<"" | "belum" | "siap" | "dikunci">("");
  const [busy, setBusy] = useState<number | null>(null);
  const [bukaId, setBukaId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [massal, setMassal] = useState<{ selesai: number; total: number; gagal: string[] } | null>(null);
  // (23 Okt 2026) unduh massal paket SPJ (ZIP): progres + tombol batal
  const [unduh, setUnduh] = useState<{ selesai: number; total: number; nama: string } | null>(null);
  const batalUnduh = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await ambil<Data>("verifikasi", { kegiatan_id: kegiatanId }));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [kegiatanId]);
  useEffect(() => {
    muat();
  }, [muat]);

  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (q && !r.nama.toLowerCase().includes(q)) return false;
      if (fStatus === "dikunci") return !!r.dikunci_at;
      if (fStatus === "siap") return siapKunci(r);
      if (fStatus === "belum") return !r.dikunci_at;
      return true;
    });
  }, [data, cari, fStatus]);

  async function pratinjau(r: Row) {
    setGalat(null);
    try {
      await bukaBlob(`/api/sigap/admin/dokumen?penugasan_id=${r.penugasan_id}`);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(`Pratinjau SPJ ${r.nama}: ${pesanGalat(e)}`);
    }
  }

  async function kunci(r: Row) {
    const peringatan: string[] = [];
    if (r.belum_selesai) peringatan.push("• Masih ada hari kerja mendatang/hari ini — SPJ belum selesai.");
    const kurang = NAMA_DOK.filter(([k]) => !r.dokumen[k]).map(([, n]) => n);
    if (kurang.length) peringatan.push(`• Dokumen belum lengkap: ${kurang.join(", ")}.`);
    const teks =
      `Verifikasi & kunci SPJ ${r.nama} (${r.peran.toUpperCase()})?\n` +
      `${r.hari_dibayar} hari dibayar · ${rupiah(r.nominal)}\n\n` +
      (peringatan.length ? `PERHATIAN:\n${peringatan.join("\n")}\n\n` : "") +
      "Setelah dikunci, PDF Kwitansi/Visum/Surat Pernyataan dibekukan dan petugas tidak bisa mengubah data.";
    if (!window.confirm(teks)) return;
    setBusy(r.penugasan_id);
    setGalat(null);
    try {
      const res = await aksi<{ ok: boolean; beku: unknown }>("kunci", { penugasan_id: r.penugasan_id });
      const bekuGalat = res.beku && typeof res.beku === "object" && "error" in (res.beku as Record<string, unknown>) ? String((res.beku as { error: unknown }).error) : null;
      setOk(`SPJ ${r.nama} dikunci.${bekuGalat ? ` Catatan: PDF belum berhasil dibekukan (${bekuGalat}).` : ""}`);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(null);
    }
  }

  // (10 Okt 2026) "Kunci semua yang lengkap" -- permintaan user: kunci SPJ seluruh petugas yang sudah lengkap.
  // Satu per satu lewat aksi "kunci" yang sama (PDF dibekukan per petugas), dengan progres; gagal dicatat, tidak menghentikan yang lain.
  async function kunciMassal() {
    const daftar = (data?.rows ?? []).filter(siapKunci);
    if (daftar.length === 0) return;
    const total = daftar.reduce((a, r) => a + r.nominal, 0);
    if (!window.confirm(`Verifikasi & kunci SPJ ${daftar.length} petugas yang sudah lengkap?\nTotal ${rupiah(total)}.\n\nPDF Kwitansi/Visum/Surat Pernyataan dibekukan dan petugas tidak bisa mengubah data. Proses berjalan satu per satu, jangan tutup halaman ini.`)) return;
    setGalat(null);
    setOk(null);
    const gagal: string[] = [];
    setMassal({ selesai: 0, total: daftar.length, gagal });
    for (let i = 0; i < daftar.length; i++) {
      const r = daftar[i];
      setBusy(r.penugasan_id);
      try {
        const res = await aksi<{ ok: boolean; beku: unknown }>("kunci", { penugasan_id: r.penugasan_id });
        if (res.beku && typeof res.beku === "object" && "error" in (res.beku as Record<string, unknown>)) gagal.push(`${r.nama} (dikunci, PDF belum dibekukan)`);
      } catch (e) {
        if (e instanceof SesiBerakhir) return;
        gagal.push(`${r.nama}: ${pesanGalat(e)}`);
      }
      setMassal({ selesai: i + 1, total: daftar.length, gagal: [...gagal] });
    }
    setBusy(null);
    setOk(`${daftar.length - gagal.filter((g) => !g.includes("(dikunci")).length} dari ${daftar.length} SPJ dikunci.`);
    if (gagal.length) setGalat(`Perlu dicek: ${gagal.join("; ")}`);
    setMassal(null);
    await muat();
  }

  // (23 Okt 2026) "Unduh paket SPJ (ZIP)" -- permintaan user: paket SPJ semua petugas sekaligus. Dijalankan dari browser: PDF gabungan tiap petugas
  // diambil SATU per satu lewat route yang sudah ada (/api/sigap/admin/dokumen), lalu disusun menjadi ZIP (maks. MAKS_PER_ZIP petugas per ZIP).
  // Yang dipaketkan = petugas yang sedang tampil (ikut saringan status & pencarian) dan punya hari dibayar. Gagal satu petugas tidak menghentikan yang lain.
  async function unduhMassal() {
    const daftar = rows.filter((r) => r.hari_dibayar > 0);
    if (daftar.length === 0) return setGalat("Tidak ada petugas dengan hari dibayar pada daftar yang sedang tampil.");
    const batch = bagiBatch(daftar);
    const info = batch.length > 1 ? `\n\nDibagi menjadi ${batch.length} berkas ZIP (maksimal ${batch[0].length} petugas per ZIP); browser bisa meminta izin mengunduh beberapa berkas.` : "";
    if (!window.confirm(`Unduh paket SPJ ${daftar.length} petugas yang sedang tampil sebagai ZIP?\n\nSetiap petugas satu PDF gabungan (semua jenis dokumen). Proses berjalan satu per satu dan bisa memakan beberapa menit; jangan tutup halaman ini.${info}`)) return;
    setGalat(null);
    setOk(null);
    batalUnduh.current = false;
    const hasil: HasilMassal = { berhasil: [], dilewati: [], dibatalkan: false };
    let selesai = 0;
    setUnduh({ selesai: 0, total: daftar.length, nama: "" });
    try {
      const { default: JSZip } = await import("jszip");
      const tgl = new Date().toISOString().slice(0, 10);
      for (let b = 0; b < batch.length; b++) {
        const zip = new JSZip();
        const dipakai = new Set<string>();
        let isi = 0;
        for (const r of batch[b]) {
          if (batalUnduh.current) {
            hasil.dibatalkan = true;
            break;
          }
          setUnduh({ selesai, total: daftar.length, nama: r.nama });
          try {
            const f = await ambilBlob(`/api/sigap/admin/dokumen?penugasan_id=${r.penugasan_id}&format=gabungan&unduh=1`);
            zip.file(unikanNama(f.namaFile || `SPJ_${r.nama}.pdf`, dipakai), f.blob);
            hasil.berhasil.push(r.nama);
            isi++;
          } catch (e) {
            if (e instanceof SesiBerakhir) return;
            hasil.dilewati.push({ nama: r.nama, alasan: pesanGalat(e) });
          }
          selesai++;
        }
        if (isi > 0) {
          const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }); // PDF sudah terkompres
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = namaZip(`kegiatan-${kegiatanId}`, tgl, b + 1, batch.length);
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
        if (hasil.dibatalkan) break;
      }
    } catch (e) {
      setGalat(`Unduh massal terhenti: ${pesanGalat(e)}`);
      return;
    } finally {
      setUnduh(null);
    }
    const teks = ringkasanMassal(hasil, daftar.length);
    if (hasil.dilewati.length > 0 || hasil.berhasil.length === 0) setGalat(teks);
    else setOk(teks);
  }

  async function bukaKunci(r: Row) {
    if (alasan.trim().length < 5) return setGalat("Alasan membuka kunci wajib diisi (minimal 5 karakter).");
    setBusy(r.penugasan_id);
    setGalat(null);
    try {
      await aksi("buka_kunci", { penugasan_id: r.penugasan_id, alasan: alasan.trim() });
      setOk(`Kunci SPJ ${r.nama} dibuka.`);
      setBukaId(null);
      setAlasan("");
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(null);
    }
  }

  if (galat && !data) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!data) return <Memuat />;
  const total = data.rows.reduce((a, r) => a + r.nominal, 0);
  const nKunci = data.rows.filter((r) => r.dikunci_at).length;
  const nSiap = data.rows.filter(siapKunci).length;
  const nBerjalan = data.rows.filter((r) => !r.dikunci_at && r.belum_selesai).length;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
      )}
      {data.boleh_kelola && (nSiap > 0 || massal) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C9E7D6] bg-[#F1FAF5] px-3 py-2.5">
          <span className="flex-1 text-[13px] text-[#0F6340]">
            {massal ? `Mengunci ${massal.selesai}/${massal.total}…` : `${nSiap} petugas sudah lengkap & siap dikunci.`}
          </span>
          <button type="button" className={BTN_G} onClick={kunciMassal} disabled={!!massal || busy !== null}>
            {massal ? "Sedang mengunci…" : `🔒 Kunci semua yang lengkap (${nSiap})`}
          </button>
        </div>
      )}
      {unduh && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C9D9F0] bg-[#F2F7FE] px-3 py-2.5">
          <span className="min-w-0 flex-1 text-[13px] text-[#1F4E8C]">
            Menyusun paket SPJ {Math.min(unduh.selesai + 1, unduh.total)}/{unduh.total}
            {unduh.nama ? ` · ${unduh.nama}` : ""}… jangan tutup halaman ini.
          </span>
          <button type="button" className={BTN_O} onClick={() => (batalUnduh.current = true)}>
            Batalkan
          </button>
        </div>
      )}
      {!data.boleh_kelola && <Pesan jenis="info">Mode lihat saja — Anda bisa melihat &amp; mempratinjau SPJ, tetapi tidak bisa mengunci.</Pesan>}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KartuAngka label="Total nominal" nilai={rupiah(total)} ket={`${data.rows.length} petugas aktif`} />
        <KartuAngka label="Siap dikunci" nilai={nSiap} ket="6/6 dokumen, hari kerja selesai" warna="#047857" />
        <KartuAngka label="Masih berjalan" nilai={nBerjalan} ket="ada hari kerja mendatang" warna="#B45309" />
        <KartuAngka label="Sudah dikunci" nilai={nKunci} ket="PDF dibekukan" warna="#6D28D9" />
      </div>

      <Kartu
        judul="SPJ per petugas"
        ket="Kunci = PDF Kwitansi/Visum/Surat Pernyataan dibekukan & disimpan sekali. Buka kunci tercatat di riwayat."
        kanan={
          <div className="flex flex-wrap items-center gap-2">
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className={INPUT} aria-label="Filter status">
              <option value="">Semua status</option>
              <option value="belum">Belum dikunci</option>
              <option value="siap">Siap dikunci</option>
              <option value="dikunci">Sudah dikunci</option>
            </select>
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama…" className={`${INPUT} w-40`} />
            <button type="button" className={BTN_O} onClick={unduhMassal} disabled={!!unduh || !!massal || busy !== null || rows.every((r) => r.hari_dibayar <= 0)} title="PDF gabungan semua dokumen tiap petugas yang sedang tampil, dalam ZIP">
              {unduh ? "Menyusun ZIP…" : `⬇ Paket SPJ (ZIP) · ${rows.filter((r) => r.hari_dibayar > 0).length}`}
            </button>
          </div>
        }
      />

      <TabelKartu>
        <thead>
          <tr>
            {["Petugas", "Hari dibayar", "Nominal", "Dokumen", "Status", ""].map((h, i) => (
              <th key={i} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className={`${TD} py-8 text-center text-[#7B8794]`}>
                Tidak ada petugas yang cocok.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const n = jmlDok(r.dokumen);
            const dikunci = !!r.dikunci_at;
            return (
              <Fragment key={r.penugasan_id}>
                <tr className={dikunci ? "bg-violet-50/40" : ""}>
                  <td className={TD}>
                    <b>{r.nama}</b> <span className="text-[#7B8794]">· {r.peran.toUpperCase()}</span>
                  </td>
                  <td className={TD}>
                    <span className="whitespace-nowrap font-semibold">
                      {r.hari_dibayar} hari{r.kelompok.length > 1 ? ` · ${r.kelompok.length} kelompok` : ""}
                    </span>
                    <span className="block text-[11px] text-[#7B8794]">
                      {r.kelompok.length ? r.kelompok.map((k) => rentangPendek(k.mulai, k.selesai)).join("; ") : "–"}
                      {r.hari_kerja > r.hari_dibayar ? ` · ${r.hari_kerja - r.hari_dibayar} hari tidak dibayar` : ""}
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap font-bold`}>{rupiah(r.nominal)}</td>
                  <td className={TD}>
                    <div className="flex max-w-[330px] flex-wrap gap-1">
                      <Chip w={n === 6 ? "ok" : "wait"}>{n}/6</Chip>
                      {NAMA_DOK.map(([k, nm]) => (
                        <Chip key={k} w={r.dokumen[k] ? "ok" : "bad"} title={r.dokumen[k] ? `${nm} tersedia` : `${nm} belum`}>
                          {r.dokumen[k] ? "✓" : "✗"} {nm}
                        </Chip>
                      ))}
                    </div>
                  </td>
                  <td className={TD}>
                    {dikunci ? (
                      <span title={r.dikunci_oleh ? `oleh ${r.dikunci_oleh}` : undefined}>
                        <Chip w="vio">🔒 dikunci {waktuWib(r.dikunci_at).replace(/ \d{4} .*/, "")}</Chip>
                        {r.dikunci_oleh && <span className="block text-[10.5px] text-[#7B8794]">oleh {r.dikunci_oleh}</span>}
                      </span>
                    ) : r.belum_selesai ? (
                      <Chip w="wait">masih berjalan</Chip>
                    ) : siapKunci(r) ? (
                      <Chip w="ok">siap dikunci</Chip>
                    ) : (
                      <Chip w="bad">belum lengkap</Chip>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className={BTN_O} onClick={() => pratinjau(r)}>
                        Pratinjau SPJ
                      </button>
                      {!dikunci && data.boleh_kelola && (
                        <button type="button" className={BTN_G} onClick={() => kunci(r)} disabled={busy !== null || r.hari_dibayar === 0} title={r.hari_dibayar === 0 ? "Belum ada hari dibayar" : undefined}>
                          {busy === r.penugasan_id ? "Mengunci…" : "Verifikasi & Kunci"}
                        </button>
                      )}
                      {dikunci && data.boleh_buka && (
                        <button
                          type="button"
                          className={BTN_R}
                          onClick={() => {
                            setBukaId(bukaId === r.penugasan_id ? null : r.penugasan_id);
                            setAlasan("");
                          }}
                        >
                          Buka kunci
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {r.belum_selesai && !dikunci && data.boleh_kelola && (
                  <tr>
                    <td colSpan={6} className="px-3 pb-2 pt-0 text-[11px] text-amber-800">
                      <IkonMenu n="awas" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Masih ada hari kerja hari ini/mendatang — sebaiknya kunci setelah semua hari kerja selesai.
                    </td>
                  </tr>
                )}
                {bukaId === r.penugasan_id && (
                  <tr>
                    <td colSpan={6} className="border-t border-[#EDF0F4] bg-red-50/50 px-3 py-2.5">
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          bukaKunci(r);
                        }}
                      >
                        <span className="text-[12px] font-bold text-red-800">Buka kunci SPJ {r.nama}:</span>
                        <input value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Alasan (wajib, tercatat di riwayat)" className={`${INPUT} min-w-[220px] flex-1`} autoFocus maxLength={300} />
                        <button type="submit" className={BTN} disabled={busy !== null || alasan.trim().length < 5}>
                          {busy === r.penugasan_id ? "Membuka…" : "Buka kunci"}
                        </button>
                        <button type="button" className={BTN_O} onClick={() => setBukaId(null)}>
                          Batal
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TabelKartu>
    </div>
  );
}
