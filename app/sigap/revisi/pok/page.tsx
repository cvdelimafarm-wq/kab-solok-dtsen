"use client";

// app/sigap/revisi/pok/page.tsx
//
// (24 Okt 2026) Papan 12 dan 6 mockup: unggah PDF POK resmi (Rincian Kertas Kerja Satker) hasil revisi, cocokkan dengan POK sistem, lalu terima
// (menjadi versi POK berlaku) atau tolak. PDF dibaca DI PERAMBAN (pdf.js, tanpa unggah berkas ke server); yang dikirim hanya baris tabelnya setelah
// jumlahnya diperiksa (rincian = akun = ... = program = ALOKASI). Hak (kewenangan `pok_pdf`, PPK) ditegakkan basis data; semua pegawai organik boleh melihat.

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  argsUnggahBaru, argsUnggahIsi, kesiapanTerima, LABEL_STATUS_UNGGAH, periksaAlasanTolak, periksaIsianUnggah, tahunUnggah, unggahKosong,
  type BerkasPdf, type IsianUnggah, type KeputusanUnggah, type PokBerlaku, type RingkasUnggah, type UnggahPok,
} from "@/lib/keu/pok";
import { berkasUtuh } from "@/lib/keu/rkks";
import { LABEL_JENIS_JADWAL, tglPanjang } from "@/lib/keu/revisi";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { aksiKeu, useBacaKeu, useBoleh, useKirim } from "../../ro/useKeu";
import { Catatan, Chip, Galat, HalamanKeu, judulKartu, kartu, kisi, kolom, Kpi, label, Memuat, Tenang, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import Banding from "./Banding";
import { bacaBerkasPok } from "./pdf";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string };

const WARNA_STATUS: Record<string, "kuning" | "hijau" | "abu"> = { diunggah: "kuning", diterima: "hijau", ditolak: "abu" };
const tgl = (s: string | null) => (s ? tglPanjang(s.slice(0, 10)) : "-");

export default function HalamanPokResmi() {
  const berlaku = useBacaKeu<PokBerlaku>(urlBaca("keu_pok_versi", { status: "berlaku" }, { urut: "-id", batas: 1, kolom: ["id", "tahun", "nomor_revisi", "nomor_pok", "tanggal_efektif"] }));
  const unggah = useBacaKeu<UnggahPok>(urlBaca("keu_pok_unggah", {}, { urut: "-id", batas: 50, kolom: ["id", "tahun", "nomor_revisi", "jadwal_id", "nama_berkas", "hash_berkas", "nomor_pok", "tanggal_efektif", "status", "versi_id", "alasan_tolak", "dibuat_at"] }));
  const ringkas = useBacaKeu<RingkasUnggah>(urlBaca("keu_v_pok_unggah_ringkas", {}, { urut: "-unggah_id", batas: 50 }));
  const keputusan = useBacaKeu<KeputusanUnggah>(urlBaca("keu_v_pok_unggah_keputusan", {}, { urut: "-unggah_id", batas: 50 }));
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 200, kolom: ["id", "tahun", "jenis", "judul", "status"] }));
  const ro = useBacaKeu<{ kode: string; nama: string }>(urlBaca("keu_ro", {}, { urut: "kode", batas: 500, kolom: ["kode", "nama"] }));
  const boleh = useBoleh("pok_pdf", null);

  const muatSemua = async () => { await Promise.all([berlaku.muat(), unggah.muat(), ringkas.muat(), keputusan.muat()]); };
  const { kirim, jalankan, mengirim, galat: galatKirim, hapusGalat } = useKirim(muatSemua);

  const pokBerlaku = berlaku.baris?.[0] ?? null;
  const namaRo = useMemo(() => new Map((ro.baris ?? []).map((r) => [r.kode, r.nama.replace(" (contoh)", "")])), [ro.baris]);
  const ringkasPer = useMemo(() => new Map((ringkas.baris ?? []).map((r) => [Number(r.unggah_id), r])), [ringkas.baris]);
  const keputusanPer = useMemo(() => new Map((keputusan.baris ?? []).map((k) => [Number(k.unggah_id), k])), [keputusan.baris]);
  const jadwalPer = useMemo(() => new Map((jadwal.baris ?? []).map((j) => [Number(j.id), j])), [jadwal.baris]);
  const menunggu = (unggah.baris ?? []).filter((u) => u.status === "diunggah");
  const totalBerlaku = ringkas.baris?.[0] ? Number(ringkas.baris[0].total_berlaku) : null;

  const [b, setB] = useState<BerkasPdf | null>(null);
  const [galatBaca, setGalatBaca] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [isian, setIsian] = useState<IsianUnggah>(unggahKosong(null));
  const [revisiDiubah, setRevisiDiubah] = useState(false);
  const [berhasil, setBerhasil] = useState<string | null>(null);
  const [lihatGalat, setLihatGalat] = useState(false);
  const inputBerkas = useRef<HTMLInputElement>(null);

  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [aksi, setAksi] = useState<{ id: number; jenis: "terima" | "tolak"; alasan: string } | null>(null);

  const nomorBawaan = String((pokBerlaku?.nomor_revisi ?? 0) + 1);
  const isianKini: IsianUnggah = revisiDiubah ? isian : { ...isian, nomorRevisi: nomorBawaan };
  const tahunDiharapkan = pokBerlaku?.tahun ?? null;
  const sudahAda = b ? (unggah.baris ?? []).find((u) => u.hash_berkas === b.hash && u.status !== "ditolak") ?? null : null;
  const salah = periksaIsianUnggah(b, isianKini, pokBerlaku, tahunDiharapkan);
  const jadwalPilihan = (jadwal.baris ?? []).filter((j) => (j.status === "diterapkan" || j.status === "sah") && (tahunDiharapkan === null || Number(j.tahun) === tahunDiharapkan));

  async function pilih(f: File | undefined) {
    setB(null); setGalatBaca(null); setBerhasil(null); hapusGalat(); setLihatGalat(false);
    if (!f) return;
    setMembaca(true);
    try { setB(await bacaBerkasPok(f)); }
    catch (e) { setGalatBaca(e instanceof Error ? e.message : "Berkas tidak dapat dibaca."); }
    finally { setMembaca(false); }
  }
  function ubah(p: Partial<IsianUnggah>) {
    if ("nomorRevisi" in p) setRevisiDiubah(true);
    setIsian({ ...isianKini, ...p });
  }

  async function kirimUnggahan() {
    if (!b || salah.length || sudahAda) return;
    setBerhasil(null);
    const ok = await jalankan(async () => {
      const r = await aksiKeu<number>("keu_pok_unggah_baru", argsUnggahBaru(tahunUnggah(isianKini, pokBerlaku), isianKini, b));
      if (!r.ok) return r;
      const isi = await aksiKeu("keu_pok_unggah_isi", argsUnggahIsi(Number(r.data), b.hasil.baris));
      return isi.ok ? isi : { ok: false as const, pesan: `Unggahan ${r.data} tercatat tetapi isinya gagal dikirim (${isi.pesan}). Tolak unggahan itu pada daftar di bawah, lalu unggah ulang.` };
    });
    if (ok) {
      setBerhasil(`PDF diterima untuk dicocokkan: ${angka(b.hasil.baris.length)} baris. Periksa pencocokannya di bawah, lalu terima atau tolak.`);
      setB(null); setRevisiDiubah(false); setIsian(unggahKosong(null));
      if (inputBerkas.current) inputBerkas.current.value = "";
    }
  }

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "POK resmi" }]}
      judul="POK resmi (PDF) dan pencocokan"
      induk="/sigap/revisi"
      labelKembali="Jadwal dan pengesahan"
    >
      <Tenang>
        Setelah revisi disahkan, <b>PPK mengunggah PDF Rincian Kertas Kerja Satker</b> dari SAKTI. Berkas dibaca di perangkat (tidak dikirim utuh); sistem memeriksa jumlahnya, mencocokkannya dengan POK sistem per RO dan akun, lalu menandai baris yang berubah, baru, atau hilang. Setelah <b>diterima</b>, PDF itu menjadi versi POK yang berlaku. Semua pegawai organik dapat melihat hasilnya.
      </Tenang>

      <div className={kisi}>
        <Kpi label="POK sistem berlaku" nilai={pokBerlaku ? `Revisi ${pokBerlaku.nomor_revisi}` : "-"} sub={pokBerlaku ? `${pokBerlaku.nomor_pok ?? "tanpa nomor"} · efektif ${tgl(pokBerlaku.tanggal_efektif)}` : berlaku.galat ?? "belum ada"} />
        <Kpi label="Total pagu POK berlaku" nilai={totalBerlaku !== null ? rupiah(totalBerlaku) : "-"} sub="pembanding unggahan" />
        <Kpi label="Menunggu keputusan" nilai={angka(menunggu.length)} warna={menunggu.length ? "kn" : undefined} sub="unggahan belum diterima/ditolak" />
      </div>

      {boleh === true && (
        <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-unggah">
          <h2 id="judul-unggah" className={judulKartu}>Unggah PDF POK resmi</h2>
          <p className="text-[12.5px] text-[#5B6B84]">Gunakan PDF asli &ldquo;Rincian Kertas Kerja Satker&rdquo; (bukan hasil pindai atau foto). Nomor revisi harus lebih besar dari POK berlaku. Unggahan hanya mencatat; POK baru berlaku setelah Bapak menekan Terima.</p>
          <label htmlFor="berkas-pok" className={label}>Berkas PDF (maksimum 40 MB)</label>
          <input
            id="berkas-pok" ref={inputBerkas} type="file" accept=".pdf,application/pdf" onChange={(e) => void pilih(e.target.files?.[0])}
            className="block w-full text-[13px] file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-[#1F5FD1] file:px-3 file:text-[13px] file:font-semibold file:text-white"
          />
          {membaca && <p className="text-[13px] font-bold text-[#44546F]" aria-live="polite">Membaca PDF... (berkas besar dapat memerlukan beberapa detik)</p>}
          {galatBaca && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatBaca}</p>}

          {b && (
            <div className="flex flex-col gap-3">
              <dl className="grid gap-x-3 gap-y-1.5 text-[12.5px] [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
                <div><dt className="text-[#6B7A93]">Baris rincian</dt><dd className="font-extrabold text-[#0F2A52]">{angka(b.hasil.baris.length)} baris · {angka(new Set(b.hasil.baris.map((x) => `${x.keg_kode}.${x.kro_kode}.${x.ro_sub}`)).size)} RO</dd></div>
                <div><dt className="text-[#6B7A93]">Jumlah seluruh rincian</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(b.hasil.total)}</dd></div>
                <div><dt className="text-[#6B7A93]">ALOKASI pada kepala halaman</dt><dd className={`font-extrabold ${b.hasil.alokasi === b.hasil.total ? "text-[#14653A]" : "text-[#B42329]"}`}>{b.hasil.alokasi === null ? "tidak terbaca" : rupiah(b.hasil.alokasi)}</dd></div>
                <div><dt className="text-[#6B7A93]">Halaman · ukuran</dt><dd className="font-bold text-[#0F2A52]">{angka(b.hasil.nHalaman)} hal. · {angka(Math.round(b.ukuran / 1024))} KB</dd></div>
              </dl>

              {berkasUtuh(b.hasil) ? (
                <p className="rounded-md border-l-4 border-[#1F8A4C] bg-[#E6F6EC] px-3 py-2 text-[12.5px] font-bold text-[#14653A]">
                  Jumlah konsisten di semua tingkat (rincian, akun, komponen, RO, KRO, kegiatan, program) dan sama dengan ALOKASI.
                </p>
              ) : (
                <div role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">
                  <p className="font-extrabold">PDF belum lolos pemeriksaan jumlah ({b.hasil.tidakCocok.length} ketidakcocokan){b.hasil.baris.length === 0 ? " dan tidak ada baris terbaca" : ""}:</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {(lihatGalat ? b.hasil.tidakCocok : b.hasil.tidakCocok.slice(0, 6)).map((g) => (
                      <li key={`${g.tingkat}-${g.kode}-${g.tertulis}`}>{g.tingkat} {g.kode}: tertulis {angka(g.tertulis)}, dihitung {angka(g.dihitung)}</li>
                    ))}
                  </ul>
                  {b.hasil.tidakCocok.length > 6 && <button type="button" className="mt-1 font-bold underline" onClick={() => setLihatGalat((x) => !x)}>{lihatGalat ? "Ringkas" : `Tampilkan semua (${b.hasil.tidakCocok.length})`}</button>}
                </div>
              )}
              {(b.hasil.peringatan.length > 0 || b.hasil.hargaTidakCocok > 0) && (
                <div className="rounded-md border-l-4 border-[#B8860B] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#6B4E00]">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {b.hasil.peringatan.slice(0, 5).map((g) => <li key={g}>{g}</li>)}
                    {b.hasil.hargaTidakCocok > 0 && <li>{b.hasil.hargaTidakCocok} rincian memiliki volume × harga yang tidak persis sama dengan jumlah (pembulatan SAKTI). Yang dipakai adalah jumlah pada PDF.</li>}
                  </ul>
                </div>
              )}

              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
                <div>
                  <label className={label} htmlFor="no-revisi">Nomor revisi POK</label>
                  <input id="no-revisi" inputMode="numeric" className={kolom} value={isianKini.nomorRevisi} onChange={(e) => ubah({ nomorRevisi: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A93]">POK berlaku: revisi {pokBerlaku?.nomor_revisi ?? "-"}</p>
                </div>
                <div>
                  <label className={label} htmlFor="no-pok">Nomor POK / DIPA (opsional)</label>
                  <input id="no-pok" className={kolom} maxLength={60} value={isianKini.nomorPok} onChange={(e) => ubah({ nomorPok: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor="tgl-efektif">Tanggal efektif</label>
                  <input id="tgl-efektif" type="date" className={kolom} value={isianKini.tanggal} onChange={(e) => ubah({ tanggal: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor="jadwal-dasar">Jadwal revisi dasar (opsional)</label>
                  <select id="jadwal-dasar" className={kolom} value={isianKini.jadwal} onChange={(e) => ubah({ jadwal: e.target.value })}>
                    <option value="">Tanpa jadwal</option>
                    {jadwalPilihan.map((j) => <option key={j.id} value={j.id}>{j.judul} ({LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis})</option>)}
                  </select>
                  <p className="mt-0.5 text-[11.5px] text-[#6B7A93]">Hanya jadwal yang sudah diterapkan atau sah. Revisi POK/administrasi mewajibkan total pagu tidak berubah.</p>
                </div>
              </div>

              {sudahAda && <p className="text-[12.5px] font-bold text-[#8A6200]">Berkas yang sama sudah diunggah (unggahan #{sudahAda.id}, {LABEL_STATUS_UNGGAH[sudahAda.status] ?? sudahAda.status}). Tolak unggahan itu bila ingin mengunggah ulang.</p>}
              {salah.length > 0 && b.hasil.baris.length > 0 && berkasUtuh(b.hasil) && (
                <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] font-semibold text-[#8A6200]">{salah.map((s) => <li key={s}>{s}</li>)}</ul>
              )}
              <button type="button" disabled={mengirim || salah.length > 0 || !!sudahAda} onClick={() => void kirimUnggahan()} className={`${tombolUtama} w-full sm:w-auto`}>
                {mengirim ? "Mengirim..." : "Kirim untuk dicocokkan"}
              </button>
            </div>
          )}
          {galatKirim && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatKirim}</p>}
          {berhasil && <p role="status" className="rounded-md border-l-4 border-[#1F8A4C] bg-[#E6F6EC] px-3 py-2 text-[13px] font-bold text-[#14653A]">{berhasil}</p>}
        </section>
      )}
      {boleh === false && <Catatan>Mengunggah, menerima, dan menolak POK resmi hanya untuk PPK. Halaman ini menampilkan unggahan dan hasil pencocokannya untuk dilihat.</Catatan>}

      <section aria-labelledby="judul-daftar" className={`${kartu} flex flex-col gap-3`}>
        <h2 id="judul-daftar" className={judulKartu}>Unggahan POK resmi</h2>
        <Galat pesan={unggah.galat} />
        {unggah.memuat && <Memuat tinggi="h-24" />}
        {unggah.baris && unggah.baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada PDF POK resmi yang diunggah.</p>}
        <ul className="flex flex-col gap-3">
          {(unggah.baris ?? []).map((u) => {
            const r = ringkasPer.get(Number(u.id)) ?? null;
            const kp = keputusanPer.get(Number(u.id)) ?? null;
            const j = u.jadwal_id ? jadwalPer.get(Number(u.jadwal_id)) : undefined;
            const terbukaIni = terbuka === u.id;
            const kes = u.status === "diunggah" ? kesiapanTerima(r, Number(r?.n_baris ?? 0), j?.jenis ?? null, kp) : null;
            return (
              <li key={u.id} className="rounded-lg border border-[#DCE3EE] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[14px] text-[#0F2A52]">Revisi {u.nomor_revisi}</b>
                      <Chip warna={WARNA_STATUS[u.status] ?? "abu"}>{LABEL_STATUS_UNGGAH[u.status] ?? u.status}</Chip>
                      <span className="text-[12px] text-[#5B6B84]">#{u.id} · diunggah {tgl(u.dibuat_at)}</span>
                    </div>
                    <div className="break-words text-[12.5px] text-[#5B6B84]">{u.nama_berkas}{u.nomor_pok ? ` · ${u.nomor_pok}` : ""} · efektif {tgl(u.tanggal_efektif)}{j ? ` · dasar: ${j.judul}` : ""}</div>
                    {u.status === "ditolak" && u.alasan_tolak && <div className="mt-0.5 text-[12.5px] text-[#7A1D22]">Alasan penolakan: {u.alasan_tolak}</div>}
                    {u.status === "diterima" && <div className="mt-0.5 text-[12.5px] text-[#14653A]">Menjadi versi POK sistem #{u.versi_id}.</div>}
                  </div>
                  {u.status === "diunggah" && (
                    <button type="button" className={tombolKecil} aria-expanded={terbukaIni} onClick={() => setTerbuka(terbukaIni ? null : u.id)}>{terbukaIni ? "Sembunyikan pencocokan" : "Lihat pencocokan"}</button>
                  )}
                </div>

                {r && u.status === "diunggah" && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip warna="abu">{angka(r.n_baris)} baris · {rupiah(r.total_unggah)}</Chip>
                    <Chip warna="abu">{angka(r.n_sama)} sama</Chip>
                    {Number(r.n_berubah) > 0 && <Chip warna="kuning">{angka(r.n_berubah)} berubah</Chip>}
                    {Number(r.n_baru) > 0 && <Chip warna="hijau">{angka(r.n_baru)} baru</Chip>}
                    {Number(r.n_hilang) > 0 && <Chip warna="merah">{angka(r.n_hilang)} hilang</Chip>}
                    {Number(r.n_dipadankan) > 0 && <Chip warna="biru">{angka(r.n_dipadankan)} dipadankan</Chip>}
                    {Number(r.n_ro_tak_terdaftar) > 0 && <Chip warna="merah">{angka(r.n_ro_tak_terdaftar)} baris RO belum terdaftar</Chip>}
                    {kp && Number(kp.n_di_luar_usulan) > 0 && <Chip warna="ungu">{angka(kp.n_di_luar_usulan)} di luar usulan</Chip>}
                    {kp && Number(kp.n_menunggu) > 0 && <Chip warna="kuning">{angka(kp.n_menunggu)} menunggu keputusan</Chip>}
                    {kp && Number(kp.n_ditanyakan) > 0 && <Chip warna="merah">{angka(kp.n_ditanyakan)} ditanyakan</Chip>}
                  </div>
                )}

                {terbukaIni && u.status === "diunggah" && (
                  <div className="mt-3 border-t border-[#EEF2F7] pt-3">
                    <Banding unggahId={u.id} boleh={boleh === true} namaRo={namaRo} ringkas={r} keputusan={kp} muatUlang={muatSemua} />
                  </div>
                )}

                {boleh === true && u.status === "diunggah" && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-[#EEF2F7] pt-3">
                    {aksi?.id === u.id && aksi.jenis === "terima" && kes && (
                      <div className="flex flex-col gap-2 rounded-md bg-[#F4F8FF] p-3">
                        <p className="text-[13px] font-bold text-[#0F2A52]">Berlakukan PDF ini sebagai POK sistem revisi {u.nomor_revisi}?</p>
                        <p className="text-[12.5px] text-[#44546F]">Tindakan ini membuat versi POK baru dan menggantikan versi yang berlaku. Nomor item mengikuti baris yang dipadankan. Tidak dapat dibatalkan dari sini.</p>
                        {kes.peringatan.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-[#8A6200]">{kes.peringatan.map((p) => <li key={p}>{p}</li>)}</ul>}
                        <div className="flex gap-2">
                          <button type="button" disabled={mengirim} className={tombolUtama} onClick={async () => { if (await kirim("keu_pok_unggah_terima", { p_unggah: u.id })) { setAksi(null); setTerbuka(null); } }}>{mengirim ? "Memproses..." : "Ya, berlakukan"}</button>
                          <button type="button" className={tombolKecil} onClick={() => setAksi(null)}>Kembali</button>
                        </div>
                      </div>
                    )}
                    {aksi?.id === u.id && aksi.jenis === "tolak" && (
                      <div className="flex max-w-[480px] flex-col gap-2">
                        <label className={label} htmlFor={`tolak-${u.id}`}>Alasan penolakan (minimal 5 huruf)</label>
                        <textarea id={`tolak-${u.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={aksi.alasan} onChange={(e) => setAksi({ id: u.id, jenis: "tolak", alasan: e.target.value })} />
                        <div className="flex gap-2">
                          <button type="button" disabled={mengirim || periksaAlasanTolak(aksi.alasan) !== null} className={tombolBahaya}
                            onClick={async () => { if (await kirim("keu_pok_unggah_tolak", { p_unggah: u.id, p_alasan: aksi.alasan.trim() })) { setAksi(null); setTerbuka(null); } }}>Tolak unggahan</button>
                          <button type="button" className={tombolKecil} onClick={() => setAksi(null)}>Kembali</button>
                        </div>
                      </div>
                    )}
                    {aksi?.id !== u.id && (
                      <p className="text-[12.5px] text-[#44546F]"><b>Jadikan POK semula yang baru.</b> Baris yang sama, baru, dan hilang diterima otomatis bila sesuai usulan. Baris berubah dan baris di luar usulan menunggu keputusan operator; sistem tidak menebak mana yang benar. Setelah diterima, hasil penetapan ini menjadi kolom Semula untuk revisi berikutnya dan masuk ke daftar versi berurutan.</p>
                    )}
                    {aksi?.id !== u.id && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" disabled={mengirim || !!kes?.blok} className={tombolUtama} onClick={() => { hapusGalat(); setAksi({ id: u.id, jenis: "terima", alasan: "" }); }}>Simpan sebagai POK semula berikutnya...</button>
                        <button type="button" disabled={mengirim} className={tombolBahaya} onClick={() => { hapusGalat(); setAksi({ id: u.id, jenis: "tolak", alasan: "" }); }}>Tolak...</button>
                        {kes?.blok && <span className="text-[12.5px] font-semibold text-[#8A6200]">{kes.blok}</span>}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {galatKirim && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatKirim}</p>}
        <p className="text-[12px] text-[#5B6B84]">Riwayat versi POK sistem dan dampaknya ada pada <Link href="/sigap/revisi" className="font-semibold text-[#1F5FD1] underline">Jadwal dan pengesahan</Link>.</p>
      </section>
    </HalamanKeu>
  );
}
