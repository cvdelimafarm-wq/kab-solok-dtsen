"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/dokumen/page.tsx
//
// (25 Okt 2026, tahap 29) Dokumen turunan identifikasi lanjutan (undangan per kelas, surat pengantar nagari, surat tugas atau SPK per petugas).
// Alamat: ?jenis=undangan|pengantar|tugas&kunci=<kode>. Nomor surat diisi manual dan penandatangan dipilih per dokumen. Dokumen berstatus konsep
// (tanda air) sampai diterbitkan; penerbitan hanya bila lanjutan Final. Susunan surat bersifat konsep karena format baku kantor belum ditetapkan.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, label as kelasLabel, Kosong, Memuat, tombolBahaya, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { normalisasi } from "@/lib/keu/identifikasi";
import { NAMA_DOKUMEN, normalisasiLanjutan, type JenisDokumen } from "@/lib/keu/lanjutan";
import { bangunDokumen, type KonteksDokumen } from "@/lib/keu/lanjutanDokumen";
import { useIdent } from "../../../useIdent";
import { useLanjutan } from "../useLanjutan";
import { Kertas } from "./Kertas";

const JENIS: readonly JenisDokumen[] = ["undangan", "pengantar", "tugas"];
const JABATAN_BAWAAN: Record<string, string> = { KETUA: "Ketua Tim", PPK: "Pejabat Pembuat Komitmen", KPA: "Kepala BPS Kabupaten Solok", TU: "Tata Usaha" };
const NAMA_PERAN_TTD: Record<string, string> = { KETUA: "Ketua tim", PPK: "PPK", KPA: "Kepala (KPA)", TU: "Tata Usaha" };

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const q = useSearchParams();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const jenisQ = q.get("jenis") ?? "";
  const jenis = (JENIS as readonly string[]).includes(jenisQ) ? (jenisQ as JenisDokumen) : null;
  const kunci = q.get("kunci") ?? "";

  const ident = useIdent(id);
  const row = ident.row;
  const lj = useLanjutan(id, row?.tahun ?? null, row?.ro_kode ?? null);
  const muat = useCallback(async () => { await lj.muatSemua(); }, [lj]);
  const kirim = useKirim(muat);
  const tersimpan = lj.row;
  const rec = useMemo(() => lj.dokumen.find((d) => d.jenis === jenis && d.kunci === kunci) ?? null, [lj.dokumen, jenis, kunci]);

  const [nomor, setNomor] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [ttdAkun, setTtdAkun] = useState<number | null>(null);
  const [jabatan, setJabatan] = useState("");
  const [alasanCabut, setAlasanCabut] = useState("");
  const [diubah, setDiubah] = useState(false);

  // isian diambil dari dokumen tersimpan bila belum ada suntingan lokal
  useEffect(() => {
    if (diubah) return;
    setNomor(rec?.nomor ?? "");
    setTanggal(rec?.tanggal ?? "");
    setTtdAkun(rec?.ttd_akun ?? null);
    setJabatan(rec?.ttd_jabatan ?? "");
  }, [rec, diubah]);

  const terbit = rec?.status === "terbit";
  const calon = lj.calon;
  const dipilih = calon.find((c) => c.akun_id === ttdAkun) ?? null;
  const namaTtd = dipilih?.akun_nama ?? rec?.ttd_nama ?? "";

  const formSah = useMemo(() => (row && row.ver >= 1 && row.form_sah ? normalisasi(row.form_sah) : null), [row]);
  const isi = useMemo(() => (tersimpan ? normalisasiLanjutan(tersimpan.isi) : null), [tersimpan]);
  const dok = useMemo(() => {
    if (!row || !formSah || !isi || !tersimpan || !jenis) return null;
    const ktx: KonteksDokumen = { namaSurvei: row.nama, tahun: row.tahun, isi, form: formSah, upd: (row.upd ?? null) as KonteksDokumen["upd"], status: tersimpan.status };
    return bangunDokumen(jenis, kunci, ktx, { nomor, tanggal, ttd: ttdAkun !== null && namaTtd ? { nama: namaTtd, jabatan } : null, terbit });
  }, [row, formSah, isi, tersimpan, jenis, kunci, nomor, tanggal, ttdAkun, namaTtd, jabatan, terbit]);

  const kurang: string[] = [];
  if (nomor.trim().length < 3) kurang.push("Nomor surat belum diisi (minimal 3 huruf).");
  if (!tanggal) kurang.push("Tanggal surat belum diisi.");
  if (ttdAkun === null) kurang.push("Penandatangan belum dipilih.");
  if (jabatan.trim().length < 3) kurang.push("Jabatan penandatangan belum diisi.");
  const hambatan = dok?.hambatan ?? [];

  const args = (aksi: "simpan" | "terbit" | "cabut") => ({
    p_ident: id, p_jenis: jenis, p_kunci: kunci, p_aksi: aksi,
    ...(aksi === "cabut" ? { p_catatan: alasanCabut.trim() } : { p_nomor: nomor.trim(), ...(tanggal ? { p_tanggal: tanggal } : {}), ...(ttdAkun !== null ? { p_ttd_akun: ttdAkun } : {}), p_ttd_jabatan: jabatan.trim() }),
  });
  const lakukan = useCallback(async (aksi: "simpan" | "terbit" | "cabut") => {
    const ok = await kirim.jalankan(() => aksiKeu("keu_ident_dokumen_simpan", args(aksi)));
    if (ok) { setDiubah(false); setAlasanCabut(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kirim, id, jenis, kunci, nomor, tanggal, ttdAkun, jabatan, alasanCabut]);

  const bolehUrus = (ident.hak.susun || ident.hak.tu) && !!row && row.status !== "dibatalkan";
  const induk = id ? `/sigap/kelola/perencanaan/identifikasi/${id}/lanjutan` : "/sigap/kelola/perencanaan/identifikasi";
  const siap = !ident.memuat && !lj.memuat;

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Dokumen identifikasi"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei", "Dokumen"]}
      judul={jenis ? NAMA_DOKUMEN[jenis] : "Dokumen identifikasi"}
      sub={row ? <>{row.nama} · RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kembali={{ induk, label: "Identifikasi lanjutan" }}
    >
      <style>{`@media print { body * { visibility: hidden !important; } #kertas, #kertas * { visibility: visible !important; } #kertas { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; margin: 0 !important; } }`}</style>
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        <Galat pesan={ident.galat ?? lj.galat} />
        {!siap && <Memuat tinggi="h-48" />}
        {siap && (!jenis || !kunci) && <Kosong teks="Alamat dokumen tidak lengkap. Buka dokumen dari kartu Dokumen turunan." />}
        {siap && jenis && kunci && !tersimpan && <Kosong teks="Identifikasi lanjutan belum disimpan; dokumen belum dapat dibuat." />}
        {siap && jenis && kunci && tersimpan && !dok && <Kosong teks="Dokumen ini tidak ditemukan pada identifikasi lanjutan (kelas atau petugas mungkin sudah dihapus)." />}
        {dok && tersimpan && (
          <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <section className={`${kartu} flex flex-col gap-3 print:hidden`} aria-labelledby="h-dok">
              <header className="flex flex-wrap items-center gap-2">
                <h2 id="h-dok" className={`${judulKartu} m-0`}>Nomor dan penandatangan</h2>
                <Chip warna={terbit ? "hijau" : "kuning"}>{terbit ? "Terbit" : "Konsep"}</Chip>
              </header>
              {terbit && <Catatan>Dokumen sudah terbit pada lanjutan versi {rec?.lanjutan_ver}. Untuk mengubahnya, cabut dahulu (alasan wajib).</Catatan>}
              <label className="block">
                <span className={kelasLabel}>Nomor surat (diisi manual)</span>
                <input className={kolom} maxLength={80} disabled={terbit || !bolehUrus} value={nomor} onChange={(e) => { setNomor(e.target.value); setDiubah(true); }} />
              </label>
              <label className="block">
                <span className={kelasLabel}>Tanggal surat</span>
                <input type="date" className={kolom} disabled={terbit || !bolehUrus} value={tanggal} onChange={(e) => { setTanggal(e.target.value); setDiubah(true); }} />
              </label>
              <label className="block">
                <span className={kelasLabel}>Penandatangan</span>
                <select
                  className={kolom} disabled={terbit || !bolehUrus} value={ttdAkun ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    setTtdAkun(v); setDiubah(true);
                    const c = calon.find((x) => x.akun_id === v);
                    if (c && jabatan.trim() === "") setJabatan(JABATAN_BAWAAN[c.peran_kode] ?? "");
                  }}
                >
                  <option value="">(belum dipilih)</option>
                  {calon.map((c) => <option key={`${c.akun_id}-${c.peran_kode}`} value={c.akun_id}>{c.akun_nama} · {NAMA_PERAN_TTD[c.peran_kode] ?? c.peran_kode}</option>)}
                  {ttdAkun !== null && !dipilih && <option value={ttdAkun}>{rec?.ttd_nama || `Akun ${ttdAkun}`}</option>}
                </select>
              </label>
              <label className="block">
                <span className={kelasLabel}>Jabatan pada surat</span>
                <input className={kolom} maxLength={120} disabled={terbit || !bolehUrus} value={jabatan} onChange={(e) => { setJabatan(e.target.value); setDiubah(true); }} />
              </label>
              {!terbit && kurang.length > 0 && <ul className="m-0 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#5C4300]">{kurang.map((k) => <li key={k}>{k}</li>)}</ul>}
              {!terbit && hambatan.length > 0 && (
                <Catatan><p className="m-0 mb-1 font-semibold">Belum dapat diterbitkan:</p><ul className="m-0 list-disc space-y-0.5 pl-5">{hambatan.map((h) => <li key={h}>{h}</li>)}</ul></Catatan>
              )}
              {kirim.galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kirim.galat}</p>}
              {!bolehUrus && <p className="m-0 text-[12.5px] text-[#5B6B84]">Mengurus dokumen hanya untuk ketua tim, admin RO, PPK, atau Tata Usaha RO ini.</p>}
              {bolehUrus && !terbit && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={tombolKecil} disabled={kirim.mengirim || !diubah} onClick={() => void lakukan("simpan")}>Simpan konsep</button>
                  <button type="button" className={tombolUtama} disabled={kirim.mengirim || kurang.length > 0 || hambatan.length > 0 || diubah} title={diubah ? "Simpan konsep dahulu" : undefined} onClick={() => void lakukan("terbit")}>Terbitkan</button>
                </div>
              )}
              {bolehUrus && terbit && (
                <div className="flex flex-col gap-2">
                  <label className="block">
                    <span className={kelasLabel}>Alasan pencabutan (minimal 5 huruf)</span>
                    <input className={kolom} maxLength={300} value={alasanCabut} onChange={(e) => setAlasanCabut(e.target.value)} />
                  </label>
                  <button type="button" className={tombolBahaya} disabled={kirim.mengirim || alasanCabut.trim().length < 5} onClick={() => void lakukan("cabut")}>Cabut penerbitan</button>
                </div>
              )}
              <button type="button" className={tombolKecil} onClick={() => window.print()}>Cetak atau simpan sebagai PDF</button>
            </section>
            <Kertas dok={dok} />
          </div>
        )}
      </div>
    </Bingkai>
  );
}

export default function HalamanDokumen() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
