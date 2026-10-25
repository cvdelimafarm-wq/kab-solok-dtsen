"use client";

// app/sigap/revisi/status/page.tsx
//
// (25 Okt 2026, tahap 20) Papan 5 mockup: "Siklus status, peran, dan riwayat".
//  - Posisi sebuah jadwal revisi pada deret tahap (POK: 4 tahap; DIPA: 5 tahap termasuk Diajukan dan Hasil resmi).
//  - Tindakan yang tersedia untuk akun ini, dengan isian nomor, tanggal, dan catatan. Semua lewat keu_jadwal_langkah; PPK (kewenangan jadwal).
//  - (25 Okt 2026) Sahkan mewajibkan melampirkan PDF POK resmi dari SPAN. PDF dibaca di perangkat (tanpa unggah berkas), pagu tiap akun per RO
//    dibandingkan dengan kertas kerja jadwal ini; beda = peringatan + tautan ke kertas kerja (tidak memblokir). Yang dicatat: nama berkas,
//    sidik jari, dan hasil cek, di kolom catatan riwayat.
//  - "Siapa boleh apa" dibaca dari master peran dan kewenangan.
//  - Riwayat tahap dari keu_v_jadwal_riwayat (baris awal = keadaan saat pencatatan dimulai).
// Logika murni: lib/keu/status.ts. Alamat: /sigap/revisi/status?jadwal=<id>.

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, tglPanjang } from "@/lib/keu/revisi";
import {
  argsLangkah, barisRiwayat, catatanSahDenganPdf, kartuTahap, keteranganJalur, labelDokumen, matriksBoleh, periksaLampiranPok, periksaLangkah, perluLampiranPok,
  posisiJadwal, teksKosongTindakan, tindakanTersedia, type KewPeran, type Peran, type RiwayatJadwal, type TindakanLangkah,
} from "@/lib/keu/status";
import { bandingPaguAkun, paguDariPdf } from "@/lib/keu/cekPagu";
import type { BerkasPdf } from "@/lib/keu/pok";
import { berkasUtuh } from "@/lib/keu/rkks";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { useBacaKeu, useBoleh, useKirim } from "../../ro/useKeu";
import { caps, Catatan, Chip, Galat, HalamanKeu, judulKartu, kartu, kolom, Kosong, label, Memuat, tombolAktif, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import KartuCekPagu, { useSisiSistem } from "../CekPaguAkun";
import { bacaBerkasPok } from "../pok/pdf";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; buka: string; tutup: string; ulang: string; status: string };
type PeranBaca = Peran & { aktif?: boolean };

const hariIniIso = (): string => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // WIB
const th = "px-2.5 py-2 text-left text-[11.5px] font-semibold text-[#5B6B84]";
const td = "px-2.5 py-2 align-top";
const SARING: { kode: string; nama: string }[] = [
  { kode: "", nama: "Semua jenis" }, { kode: "pok", nama: "Revisi POK" }, { kode: "administrasi", nama: "Administrasi" },
  { kode: "dipa_djpb", nama: "DIPA jalur DJPb" }, { kode: "dipa_dja", nama: "DIPA jalur DJA" },
];

function Isi() {
  const q = useSearchParams();
  const router = useRouter();

  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 200, kolom: ["id", "tahun", "jenis", "judul", "buka", "tutup", "ulang", "status"] }));
  const peran = useBacaKeu<PeranBaca>(urlBaca("keu_master_peran", {}, { urut: "urut", batas: 100, kolom: ["kode", "nama", "urut", "aktif"] }));
  const kewPeran = useBacaKeu<KewPeran>(urlBaca("keu_master_kewenangan_peran", {}, { batas: 500, kolom: ["kewenangan_kode", "peran_kode"] }));
  const boleh = useBoleh("jadwal", null);

  const [jenisSaring, setJenisSaring] = useState<string>("");
  const semua = jadwal.baris ?? [];
  const daftar = useMemo(() => semua.filter((j) => !jenisSaring || j.jenis === jenisSaring), [semua, jenisSaring]);
  const jidQ = Number(q.get("jadwal")) || null;
  const jd = daftar.find((j) => j.id === jidQ) ?? daftar[0] ?? null;
  const jid = jd?.id ?? null;

  const riwayat = useBacaKeu<RiwayatJadwal>(jid !== null ? urlBaca("keu_v_jadwal_riwayat", { jadwal_id: jid }, { urut: "id", batas: 500 }) : null);

  const [nomor, setNomor] = useState("");
  const [tgl, setTgl] = useState("");
  const [cat, setCat] = useState("");
  const [pesan, setPesan] = useState("");
  const [aksiTerakhir, setAksiTerakhir] = useState<TindakanLangkah["aksi"] | null>(null);
  const [berkas, setBerkas] = useState<BerkasPdf | null>(null);
  const [galatBaca, setGalatBaca] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const inputBerkas = useRef<HTMLInputElement>(null);

  const sesudah = useCallback(async () => { await riwayat.muat(); await jadwal.muat(); }, [riwayat, jadwal]);
  const { kirim, mengirim, galat: galatKirim, hapusGalat } = useKirim(sesudah);

  const rw = riwayat.baris ?? [];
  const posisi = useMemo(() => (jd ? posisiJadwal(jd.jenis, jd.status, rw) : null), [jd, rw]);
  const kartuT = useMemo(() => (jd && posisi ? kartuTahap(jd.jenis, jd.status, posisi) : []), [jd, posisi]);
  const tindakan = useMemo(
    () => (jd && posisi ? tindakanTersedia(jd.jenis, jd.status, posisi.sub, jd.tutup, hariIniIso(), Boolean(jd.ulang), boleh === true) : []),
    [jd, posisi, boleh],
  );
  const butuhDokumen = tindakan.some((x) => x.perluDokumen);
  const butuhLampiran = tindakan.some(perluLampiranPok);
  const sumberKk = useMemo(() => ({ jenis: "kertas" as const, jadwalId: jid ?? 0 }), [jid]);
  const sisiKk = useSisiSistem(sumberKk, butuhLampiran && jid !== null && berkas !== null);
  const cek = useMemo(
    () => (berkas && sisiKk.sistem ? bandingPaguAkun(paguDariPdf(berkas.hasil.baris), sisiKk.sistem, { lingkup: "irisan" }) : null),
    [berkas, sisiKk.sistem],
  );
  const lab = labelDokumen(jd?.jenis ?? "pok", tindakan.find((x) => x.perluDokumen)?.aksi ?? null);
  const baris = useMemo(() => (jd ? barisRiwayat(rw, jd.jenis) : []), [jd, rw]);
  const matriks = useMemo(() => {
    const aktif = (peran.baris ?? []).filter((p) => p.aktif !== false);
    return matriksBoleh(aktif, kewPeran.baris ?? []);
  }, [peran.baris, kewPeran.baris]);

  const ke = (id: number | null) => router.replace(`/sigap/revisi/status${id ? `?jadwal=${id}` : ""}`, { scroll: false });
  const kosongkanBerkas = () => { setBerkas(null); setGalatBaca(null); if (inputBerkas.current) inputBerkas.current.value = ""; };
  const ganti = (id: number) => { setNomor(""); setTgl(""); setCat(""); setPesan(""); kosongkanBerkas(); hapusGalat(); ke(id); };

  async function pilihBerkas(f: File | undefined) {
    setBerkas(null); setGalatBaca(null); setPesan(""); hapusGalat();
    if (!f) return;
    setMembaca(true);
    try { setBerkas(await bacaBerkasPok(f)); }
    catch (e) { setGalatBaca(e instanceof Error ? e.message : "Berkas tidak dapat dibaca."); }
    finally { setMembaca(false); }
  }

  const jalan = async (t: TindakanLangkah) => {
    if (jid === null) return;
    hapusGalat();
    const g = [...periksaLangkah(t, nomor, tgl), ...periksaLampiranPok(t, berkas ? { utuh: berkasUtuh(berkas.hasil), nBaris: berkas.hasil.baris.length } : null)];
    if (g.length) { setPesan(g[0]); return; }
    setPesan("");
    setAksiTerakhir(t.aksi);
    // Pagu yang berbeda hanya peringatan; cek dicatat pada catatan riwayat bersama nama dan sidik jari berkas.
    const catatan = perluLampiranPok(t) && berkas ? catatanSahDenganPdf(berkas, cek, cat) : cat;
    if (await kirim("keu_jadwal_langkah", argsLangkah(jid, t.aksi, nomor, tgl, catatan))) { setNomor(""); setTgl(""); setCat(""); kosongkanBerkas(); }
  };

  const galat = jadwal.galat ?? riwayat.galat ?? peran.galat ?? kewPeran.galat;
  const memuat = !jadwal.baris;

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "Status dan riwayat" }]}
      induk="/sigap/revisi"
      labelKembali="Jadwal revisi"
      judul="Siklus status, peran, dan riwayat"
      sub={jd ? <>Kertas kerja #{jd.id}: {jd.judul} · {LABEL_JENIS_JADWAL[jd.jenis] ?? jd.jenis} · {LABEL_STATUS_JADWAL[jd.status] ?? jd.status}</> : undefined}
    >
      <Galat pesan={galat} />
      {memuat && !galat && <Memuat />}

      {!memuat && (
        <>
          <section className={`${kartu} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={judulKartu}>Posisi sekarang{posisi && jd && (jd.jenis === "dipa_djpb" || jd.jenis === "dipa_dja") ? `: versi ${posisi.versi}` : ""}</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${caps} mr-1`}>Jenis revisi</span>
                {SARING.map((s) => (
                  <button key={s.kode} type="button" aria-pressed={s.kode === jenisSaring} onClick={() => { setJenisSaring(s.kode); }}
                    className={`${s.kode === jenisSaring ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>{s.nama}</button>
                ))}
              </div>
            </div>

            {daftar.length > 0 ? (
              <div className="max-w-[640px]">
                <label className={label} htmlFor="pilih-jadwal-status">Kertas kerja (jadwal revisi)</label>
                <select id="pilih-jadwal-status" className={kolom} value={jid ?? ""} onChange={(e) => ganti(Number(e.target.value))}>
                  {daftar.map((j) => <option key={j.id} value={j.id}>#{j.id} · {j.judul} · {LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis} · {LABEL_STATUS_JADWAL[j.status] ?? j.status}</option>)}
                </select>
              </div>
            ) : <Kosong teks={semua.length === 0 ? "Belum ada jadwal revisi." : "Tidak ada jadwal untuk jenis ini."} />}

            {jd && posisi && (
              <>
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
                  {kartuT.map((k) => (
                    <div key={k.no} className={`flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 ${k.aktif ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DCE3EE] bg-white"}`}>
                      <span className={caps}>{k.no}</span>
                      <h3 className="text-[14px] font-bold text-[#0F2A52]">{k.nama}</h3>
                      <span><Chip warna={k.warna}>{k.label}</Chip></span>
                    </div>
                  ))}
                </div>
                <p className="max-w-[110ch] text-[12px] text-[#5B6B84]">
                  {posisi.dilewati ? "Jadwal ini dilewati; tidak ada tahap yang berjalan. " : ""}{keteranganJalur(jd.jenis)}
                </p>
                <p className="text-[12px] text-[#5B6B84]">Jendela usulan {tglPanjang(jd.buka)} sampai {tglPanjang(jd.tutup)}. Setelah Diterapkan, perubahan lanjutan pada DIPA selalu menjadi versi usulan berikutnya, bukan menimpa yang lama.</p>
              </>
            )}
          </section>

          {jd && posisi && (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
              <section className={`${kartu} flex min-w-0 flex-col gap-3`}>
                <h2 className={judulKartu}>Tindakan yang tersedia</h2>
                <p className="text-[12px] text-[#5B6B84]">Dicatat atas nama akun yang sedang masuk. Sistem tidak menyimpulkan hasil: PPK mencatat dari surat atau dokumen resmi.</p>
                {boleh === false && <Catatan>Hanya PPK (kewenangan jadwal) yang dapat mencatat tindakan. Akun ini hanya melihat.</Catatan>}
                {tindakan.length > 0 && (
                  <>
                    {butuhDokumen && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><label className={label} htmlFor="st-nomor">{lab.nomor}</label><input id="st-nomor" className={kolom} maxLength={120} placeholder={lab.contoh} value={nomor} onChange={(e) => setNomor(e.target.value)} /></div>
                        <div><label className={label} htmlFor="st-tgl">{lab.tanggal}</label><input id="st-tgl" type="date" className={kolom} value={tgl} onChange={(e) => setTgl(e.target.value)} /></div>
                      </div>
                    )}
                    {butuhLampiran && (
                      <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F7F9FD] p-3">
                        <label className={label} htmlFor="st-pdf">PDF POK resmi dari SPAN (wajib, maksimum 40 MB)</label>
                        <input
                          id="st-pdf" ref={inputBerkas} type="file" accept=".pdf,application/pdf" onChange={(e) => void pilihBerkas(e.target.files?.[0])}
                          className="block w-full text-[13px] file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-[#1F5FD1] file:px-3 file:text-[13px] file:font-semibold file:text-white"
                        />
                        <p className="text-[12px] text-[#5B6B84]">Pengesahan yang sebenarnya dilakukan di SPAN dengan acuan kertas kerja. Lampiran ini mengunci kesesuaian: sistem membaca PDF di perangkat ini (tidak dikirim utuh) dan memeriksa apakah pagu tiap akun per RO sama dengan kertas kerja ini.</p>
                        {membaca && <p className="text-[13px] font-bold text-[#44546F]" aria-live="polite">Membaca PDF...</p>}
                        {galatBaca && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatBaca}</p>}
                        {berkas && (
                          <>
                            <p className="break-words text-[12.5px] text-[#44546F]">
                              <b>{berkas.nama}</b> · {angka(berkas.hasil.baris.length)} baris · jumlah {rupiah(berkas.hasil.total)} · sidik jari {berkas.hash.slice(0, 12)}
                            </p>
                            {!berkasUtuh(berkas.hasil) && (
                              <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">
                                PDF belum lolos pemeriksaan jumlah ({berkas.hasil.tidakCocok.length} ketidakcocokan){berkas.hasil.baris.length === 0 ? " dan tidak ada baris terbaca" : ""}. Gunakan PDF asli Rincian Kertas Kerja Satker.
                              </p>
                            )}
                            {berkasUtuh(berkas.hasil) && (
                              <KartuCekPagu
                                hasil={cek} memuat={sisiKk.memuat} galat={sisiKk.galat} terpotong={sisiKk.terpotong}
                                namaResmi="PDF POK resmi" namaSistem="kertas kerja jadwal ini" jadwalId={jid} judul="Cek pagu: PDF POK resmi dan kertas kerja"
                              />
                            )}
                            {berkasUtuh(berkas.hasil) && cek && !cek.sama && cek.baris.length > 0 && (
                              <p className="text-[12.5px] font-semibold text-[#6B4E00]">Pagu berbeda hanya peringatan: Sahkan tetap dapat dilanjutkan. Karena yang berlaku adalah POK resmi, sebaiknya kertas kerja diubah dahulu lewat tombol &ldquo;Buka kertas kerja&rdquo; di atas (kertas kerja tetap dapat diubah sampai Sah).</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <div><label className={label} htmlFor="st-cat">Catatan (opsional)</label><input id="st-cat" className={kolom} maxLength={300} value={cat} onChange={(e) => setCat(e.target.value)} /></div>
                    <div className="flex flex-wrap gap-2">
                      {tindakan.map((t) => (
                        <button key={t.aksi} type="button" disabled={mengirim} onClick={() => void jalan(t)} className={t.berbahaya ? tombolBahaya : t.utama ? tombolUtama : tombolKecil}>
                          {mengirim && aksiTerakhir === t.aksi ? "Menyimpan..." : t.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {tindakan.length === 0 && boleh !== false && <p className="text-[12.5px] text-[#5B6B84]">{teksKosongTindakan(boleh === true, jd.status, posisi)}</p>}
                {pesan && <Catatan>{pesan}</Catatan>}
                <Galat pesan={galatKirim} />
                {posisi.sah && (
                  <Link href={`/sigap/revisi/versi?tab=versi&jadwal=${jd.id}`} className="w-fit rounded-lg bg-[#1F5FD1] px-3.5 py-2 text-[13px] font-semibold text-white no-underline">Cek ulang pagu di halaman Versi POK</Link>
                )}
              </section>

              <section className={`${kartu} flex min-w-0 flex-col gap-3`}>
                <h2 className={judulKartu}>Siapa boleh apa</h2>
                {!peran.baris || !kewPeran.baris ? <Memuat tinggi="h-24" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-[#F4F7FB]"><th className={th}>Tindakan</th>{matriks.kolom.map((p) => <th key={p.kode} className={th}>{p.nama}</th>)}</tr>
                      </thead>
                      <tbody>
                        {matriks.baris.map((b) => (
                          <tr key={b.tindakan} className="border-t border-[#E7ECF4]">
                            <td className={td}>{b.tindakan}</td>
                            {b.sel.map((ya, i) => <td key={matriks.kolom[i].kode} className={`${td} ${ya ? "font-semibold text-[#14653A]" : "text-[#8A97AD]"}`}>{ya ? "Ya" : "Tidak"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[12px] text-[#5B6B84]">Tabel ini dibaca dari master peran dan kewenangan, jadi ikut berubah bila master diubah. Kewenangan juga dapat diberikan per orang di luar peran.</p>
              </section>
            </div>
          )}

          {jd && (
            <section className={`${kartu} flex flex-col gap-3`}>
              <h2 className={judulKartu}>Riwayat</h2>
              {riwayat.baris === null && !riwayat.galat ? <Memuat tinggi="h-24" /> : baris.length === 0 ? <Kosong teks="Belum ada riwayat untuk jadwal ini." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-[13px]">
                    <thead><tr className="bg-[#F4F7FB]"><th className={th}>Waktu</th><th className={th}>Pelaku</th><th className={th}>Tindakan</th><th className={th}>Status</th><th className={th}>Nomor dan tanggal (surat, keputusan PPK, atau nota)</th><th className={th}>Catatan</th></tr></thead>
                    <tbody>
                      {baris.map((r) => (
                        <tr key={r.id} className="border-t border-[#E7ECF4]">
                          <td className={`${td} whitespace-nowrap font-mono text-[12px] text-[#44546F]`}>{r.waktu}</td>
                          <td className={td}>{r.peran}</td>
                          <td className={`${td} font-semibold`}>{r.aksi}</td>
                          <td className={td}><Chip warna={r.warna}>{r.label}</Chip></td>
                          <td className={td}>{r.surat}</td>
                          <td className={`${td} text-[#5B6B84]`}>{r.catatan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[12px] text-[#5B6B84]">Riwayat hanya bertambah. Perpindahan sebelum pencatatan ini dimulai tidak dapat dipetakan ke jadwal, sehingga tiap jadwal diawali baris &ldquo;Status saat pencatatan riwayat dimulai&rdquo;.</p>
            </section>
          )}
        </>
      )}
    </HalamanKeu>
  );
}

export default function HalamanStatus() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
