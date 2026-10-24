"use client";

// app/sigap/revisi/lampiran/page.tsx
//
// (25 Okt 2026, tahap 19) Papan 4 mockup: "Lampiran per jenis revisi, tenggat, dan draf surat".
//  - Tenggat Pasal 175 per jenis, dengan hari acuan yang dapat diganti (pengingat saja).
//  - Lampiran untuk jenis terpilih: sifat (wajib, bila berlaku, tidak diperlukan) dan status belum/sudah ada per kertas kerja. PPK (kewenangan `jadwal`)
//    yang mencatat; yang lain hanya melihat. Pencatatan lewat keu_kk_lampiran_set.
//  - Draf isi surat usulan dari baris kertas kerja dan lampiran (draf, bukan dokumen resmi), dapat disalin.
// Logika murni: lib/keu/lampiran.ts. Alamat: /sigap/revisi/lampiran?jadwal=<id>&jenis=<jenis>.

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  adalahJenis, argsLampiran, CHIP_SIFAT, CHIP_TENGGAT, hariAcuanCepat, hitungTenggat, JENIS_SURAT, KODE_WAKTU, LABEL_SIFAT, LABEL_TENGGAT, lampiranUntuk, NAMA_JENIS,
  rekapLampiran, ringkasSurat, susunSurat, URUTAN_JENIS, type BarisSurat, type CatatanLampiran, type JenisRevisi, type MasterLampiran,
} from "@/lib/keu/lampiran";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, tglPanjang } from "@/lib/keu/revisi";
import { urlBaca } from "@/lib/keu/ro";
import { aksiKeu, useBacaKeu, useBoleh, useKirim } from "../../ro/useKeu";
import { caps, Catatan, Chip, Galat, HalamanKeu, judulKartu, kartu, kolom, Kosong, label, Memuat, tombolAktif, tombolKecil } from "../../keu-ui";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string };
type Waktu = { kode: string; nilai_tanggal: string | null; nilai: string };

const hariIniIso = (): string => {
  const d = new Date(Date.now() + 7 * 3600 * 1000); // WIB
  return d.toISOString().slice(0, 10);
};
const th = "px-2.5 py-2 text-left text-[11.5px] font-semibold text-[#5B6B84]";
const td = "px-2.5 py-2 align-top";

function Isi() {
  const q = useSearchParams();
  const router = useRouter();

  const waktu = useBacaKeu<Waktu>(urlBaca("keu_master_waktu", {}, { batas: 100, kolom: ["kode", "nilai", "nilai_tanggal"] }));
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 200, kolom: ["id", "tahun", "jenis", "judul", "status"] }));
  const master = useBacaKeu<MasterLampiran>(urlBaca("keu_master_lampiran", {}, { urut: "urut", batas: 100 }));
  const daftarJadwal = jadwal.baris ?? [];
  const jidQ = Number(q.get("jadwal")) || null;
  const jd = daftarJadwal.find((j) => j.id === jidQ) ?? daftarJadwal[0] ?? null;
  const jid = jd?.id ?? null;
  const jenisQ = q.get("jenis");
  const jenis: JenisRevisi = adalahJenis(jenisQ) ? jenisQ : adalahJenis(jd?.jenis) ? (jd!.jenis as JenisRevisi) : "pok";

  const catatan = useBacaKeu<CatatanLampiran>(jid !== null ? urlBaca("keu_kk_lampiran", { jadwal_id: jid }, { batas: 100 }) : null);
  const kk = useBacaKeu<BarisSurat & { id: number }>(jid !== null ? urlBaca("keu_v_kk_baris", { jadwal_id: jid }, { urut: "id", batas: 5000, kolom: ["id", "ro_kode", "jumlah_semula", "jumlah_menjadi", "baru"] }) : null);
  const boleh = useBoleh("jadwal", null);

  const muat = useCallback(async () => { await catatan.muat(); }, [catatan]);
  const { jalankan, mengirim, galat: galatKirim, hapusGalat } = useKirim(muat);

  const tahun = jd?.tahun ?? Number(waktu.baris?.find((w) => w.kode === "tahun_anggaran")?.nilai) ?? new Date().getFullYear();
  const [hari, setHari] = useState<string>(hariIniIso());
  const tanggalBatas = (j: JenisRevisi) => waktu.baris?.find((w) => w.kode === KODE_WAKTU[j])?.nilai_tanggal ?? null;
  const tenggat = useMemo(() => URUTAN_JENIS.map((j) => hitungTenggat(j, tanggalBatas(j), hari)), [waktu.baris, hari]); // eslint-disable-line react-hooks/exhaustive-deps
  const cepat = useMemo(() => hariAcuanCepat(Number.isFinite(tahun) ? tahun : new Date().getFullYear()), [tahun]);

  const lampiran = useMemo(() => lampiranUntuk(master.baris ?? [], catatan.baris ?? [], jenis), [master.baris, catatan.baris, jenis]);
  const rekap = useMemo(() => rekapLampiran(lampiran), [lampiran]);

  const [kro, setKro] = useState<string>("");
  const baris = kk.baris ?? [];
  const daftarKro = useMemo(() => {
    const s = new Set<string>();
    for (const b of baris) if (Number(b.jumlah_semula) !== Number(b.jumlah_menjadi) || b.baru) s.add(/^\d{4}\.[A-Z]{3}\.[A-Z0-9]{3}$/.test(b.ro_kode) ? b.ro_kode.slice(0, 8) : b.ro_kode);
    return [...s].sort();
  }, [baris]);
  const kroPakai = kro && daftarKro.includes(kro) ? kro : "";
  const ringkas = useMemo(() => ringkasSurat(baris, kroPakai || null), [baris, kroPakai]);
  const surat = useMemo(() => susunSurat(jenis, ringkas, lampiran, kroPakai ? `KRO ${kroPakai}` : "seluruh baris kertas kerja yang sudah dimuat"), [jenis, ringkas, lampiran, kroPakai]);
  const [tersalin, setTersalin] = useState(false);

  const ke = (p: { jadwal?: number | null; jenis?: JenisRevisi }) => {
    const j = p.jadwal !== undefined ? p.jadwal : jid;
    const t = p.jenis ?? jenis;
    router.replace(`/sigap/revisi/lampiran?${j ? `jadwal=${j}&` : ""}jenis=${t}`, { scroll: false });
  };
  const salin = async () => {
    try { await navigator.clipboard.writeText(surat); setTersalin(true); setTimeout(() => setTersalin(false), 2000); } catch { setTersalin(false); }
  };

  const galat = waktu.galat ?? jadwal.galat ?? master.galat ?? catatan.galat ?? kk.galat;
  const memuat = !waktu.baris || !jadwal.baris || !master.baris;

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "Lampiran, tenggat, draf surat" }]}
      induk="/sigap/revisi"
      labelKembali="Jadwal revisi"
      judul="Lampiran per jenis revisi, tenggat, dan draf surat"
      sub={jd ? <>Kertas kerja #{jd.id}: {jd.judul} · {LABEL_JENIS_JADWAL[jd.jenis] ?? jd.jenis} · {LABEL_STATUS_JADWAL[jd.status] ?? jd.status}</> : undefined}
    >
      <Galat pesan={galat} />
      {memuat && !galat && <Memuat />}

      {!memuat && (
        <>
          <section className={`${kartu} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={judulKartu}>Tenggat Pasal 175</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${caps} mr-1`}>Hari acuan</span>
                <button type="button" onClick={() => setHari(hariIniIso())} className={`${hari === hariIniIso() ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>Hari ini ({tglPanjang(hariIniIso()).replace(/ \d{4}$/, "")})</button>
                {cepat.map((c) => <button key={c.iso} type="button" onClick={() => setHari(c.iso)} className={`${hari === c.iso ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>{c.nama}</button>)}
                <input type="date" aria-label="Hari acuan" value={hari} onChange={(e) => e.target.value && setHari(e.target.value)} className={`${kolom} !min-h-[32px] !w-auto !text-[12px]`} />
              </div>
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
              {tenggat.map((t) => (
                <button key={t.jenis} type="button" onClick={() => ke({ jenis: t.jenis })} aria-pressed={t.jenis === jenis}
                  className={`flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-left ${t.jenis === jenis ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DCE3EE] bg-white"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14px] font-bold text-[#0F2A52]">{NAMA_JENIS[t.jenis]}</h3>
                    {t.ada && <Chip warna={CHIP_TENGGAT[t.warna]}>{LABEL_TENGGAT[t.warna]}</Chip>}
                  </div>
                  {t.ada ? (
                    <>
                      <div className="text-[16px] font-bold text-[#0F2A52]">{tglPanjang(t.efektif)}{t.lunak ? " (batas lunak)" : ""}</div>
                      <p className="text-[12.5px] text-[#44546F]">{t.sisa < 0 ? "Sudah lewat batas." : `Sisa ${t.sisa} hari kerja dari ${tglPanjang(hari)}.`}</p>
                      <p className="text-[12px] text-[#5B6B84]">{t.ayat}</p>
                      {t.catatan && <p className="text-[12px] text-[#5B6B84]">{t.catatan.replace(/Batas (\d{4}-\d{2}-\d{2})/, (_m, d: string) => `Batas ${tglPanjang(d)}`)}</p>}
                    </>
                  ) : <p className="text-[12.5px] text-[#8A6200]">{t.catatan}</p>}
                </button>
              ))}
            </div>
            <p className="max-w-[110ch] text-[12px] text-[#5B6B84]">Pengingat saja, tidak ada yang dikunci. Hari acuan dapat diganti untuk melihat perubahan warna: aman, mendekati (10 hari kerja atau kurang), mendesak (3 hari kerja atau kurang), lewat. Tanggal batas diambil dari master data waktu, dan yang jatuh pada akhir pekan atau libur dimajukan ke hari kerja terakhir sebelumnya. Daftar libur nasional yang dikenal baru untuk akhir 2026.</p>
          </section>

          <section className={`${kartu} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={judulKartu}>Lampiran untuk jenis terpilih</h2>
              <div className="flex flex-wrap gap-1.5">
                {URUTAN_JENIS.map((j) => <button key={j} type="button" onClick={() => ke({ jenis: j })} className={`${j === jenis ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>{NAMA_JENIS[j]}</button>)}
              </div>
            </div>
            {daftarJadwal.length > 0 && (
              <div className="max-w-[560px]">
                <label className={label} htmlFor="pilih-jadwal-lampiran">Kertas kerja yang dicatat kelengkapannya</label>
                <select id="pilih-jadwal-lampiran" className={kolom} value={jid ?? ""} onChange={(e) => ke({ jadwal: Number(e.target.value) })}>
                  {daftarJadwal.map((j) => <option key={j.id} value={j.id}>#{j.id} · {j.judul} · {LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis} · {LABEL_STATUS_JADWAL[j.status] ?? j.status}</option>)}
                </select>
              </div>
            )}
            {daftarJadwal.length === 0 && <Kosong teks="Belum ada jadwal revisi, jadi kelengkapan lampiran belum bisa dicatat." />}
            <div className="flex flex-wrap items-center gap-2">
              <Chip warna={rekap.warna}>{rekap.teks}</Chip>
              <span className="text-[12px] text-[#5B6B84]">Kanwil mengembalikan usulan yang lampirannya belum lengkap, sehingga kelengkapan ditandai sebelum diajukan.</span>
            </div>
            {boleh === false && <Catatan>Hanya PPK (kewenangan membuka dan membuat jadwal revisi) yang dapat mencatat kelengkapan lampiran. Akun ini hanya melihat.</Catatan>}
            <Galat pesan={galatKirim} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-[13px]">
                <thead><tr className="bg-[#F4F7FB]"><th className={th}>Kode</th><th className={th}>Lampiran</th><th className={th}>Ketentuan pada jenis ini</th><th className={th}>Sifat</th><th className={th}>Dasar</th><th className={th}>Status</th></tr></thead>
                <tbody>
                  {lampiran.map((l) => (
                    <tr key={l.kode} className="border-t border-[#E7ECF4]">
                      <td className={`${td} font-mono text-[12px] text-[#44546F]`}>{l.kode}</td>
                      <td className={`${td} font-semibold`}>{l.uraian}</td>
                      <td className={`${td} text-[#5B6B84]`}>{l.ket}</td>
                      <td className={td}><Chip warna={CHIP_SIFAT[l.sifat]}>{LABEL_SIFAT[l.sifat]}</Chip></td>
                      <td className={`${td} text-[12px] text-[#5B6B84]`}>{l.dasar}</td>
                      <td className={td}>
                        {l.bisa && jid !== null && (
                          <button type="button" disabled={mengirim || boleh !== true} aria-pressed={l.ada} className={`${l.ada ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}
                            onClick={() => { hapusGalat(); void jalankan(() => aksiKeu("keu_kk_lampiran_set", argsLampiran(jid, l.kode, !l.ada, l.nomor, l.tanggal, l.catatan))); }}>
                            {l.ada ? "Sudah ada" : "Belum ada"}
                          </button>
                        )}
                        {l.ada && l.nomor && <div className="mt-1 text-[11.5px] text-[#5B6B84]">{l.nomor}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-[#5B6B84]">Yang dicatat hanya status kelengkapan. Berkas aslinya diarsipkan KPA (L12).</p>
          </section>

          <section className={`${kartu} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={judulKartu}>Draf isi surat usulan</h2>
              <div className="flex flex-wrap items-center gap-2">
                {daftarKro.length > 0 && (
                  <select aria-label="Cakupan KRO" className={`${kolom} !min-h-[32px] !w-auto !text-[12px]`} value={kroPakai} onChange={(e) => setKro(e.target.value)}>
                    <option value="">Seluruh baris yang berubah</option>
                    {daftarKro.map((k) => <option key={k} value={k}>KRO {k}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => void salin()} className={`${tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>{tersalin ? "Tersalin" : "Salin draf"}</button>
                <Chip warna="abu">Draf, bukan dokumen resmi</Chip>
              </div>
            </div>
            <p className="text-[12px] text-[#5B6B84]">Disusun dari kertas kerja dan jenis terpilih ({JENIS_SURAT[jenis]}). Nomor, tanggal, nama pejabat, dan format resmi diisi atau disesuaikan operator. Angka hanya mencakup RO yang kertas kerjanya sudah dimuat.</p>
            {kk.baris === null && jid !== null ? <Memuat tinggi="h-24" /> : (
              <pre className="whitespace-pre-wrap break-words rounded-md border border-[#DCE3EE] bg-white px-4 py-3.5 font-sans text-[13px] leading-relaxed text-[#1B2B4B]">{surat}</pre>
            )}
          </section>
        </>
      )}
    </HalamanKeu>
  );
}

export default function HalamanLampiran() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
