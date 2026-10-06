"use client";

// app/sigap/admin/TabVerifikasi.tsx
//
// (5 Okt 2026) Tab ✅ Verifikasi & Kunci -- mockup-sigap-admin layar 5 (permintaan user):
//  - Tabel per petugas: hari dibayar · kelompok, nominal Rupiah, kelengkapan 6 dokumen (chip), status.
//  - Pratinjau SPJ (PDF dari /api/sigap/admin/dokumen, dibuka di tab baru), Verifikasi & Kunci (konfirmasi),
//    Buka kunci (bila boleh_buka, alasan wajib).
//  - Peringatan bila belum_selesai (masih ada hari kerja mendatang).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { aksi, ambil, bukaBlob, pesanGalat, rentangPendek, rupiah, SesiBerakhir, waktuWib } from "./api";
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

export default function TabVerifikasi({ kegiatanId }: { kegiatanId: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [fStatus, setFStatus] = useState<"" | "belum" | "siap" | "dikunci">("");
  const [busy, setBusy] = useState<number | null>(null);
  const [bukaId, setBukaId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");

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
      if (fStatus === "siap") return !r.dikunci_at && !r.belum_selesai && jmlDok(r.dokumen) === 6;
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
  const nSiap = data.rows.filter((r) => !r.dikunci_at && !r.belum_selesai && jmlDok(r.dokumen) === 6).length;
  const nBerjalan = data.rows.filter((r) => !r.dikunci_at && r.belum_selesai).length;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
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
                    ) : n === 6 ? (
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
                      ⚠️ Masih ada hari kerja hari ini/mendatang — sebaiknya kunci setelah semua hari kerja selesai.
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
