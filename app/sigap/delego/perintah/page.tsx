"use client";

// app/sigap/delego/perintah/page.tsx
//
// (2 Nov 2026) Perintah langsung dari Kepala atau Ketua Tim, termasuk rapat dan koordinasi: dikelompokkan terpisah dari delegasi survei, boleh di dalam kegiatan survei
// (tertaut kegiatan) atau di luar kegiatan (Pekerjaan tim). Formulir sengaja ringkas: apa, kapan, siapa. Di balik layar memakai keu_dlg_buat lalu
// keu_dlg_atur_urusan (kelas perintah, kegiatan tertaut, cara tutup). Beban tiap penerima pada hari itu ditampilkan sebelum dikirim.

import Link from "next/link";
import { useMemo, useState } from "react";
import { angka, hariKe, tglPendek } from "@/lib/delego/hitung";
import { susunRekap } from "@/lib/delego/rekap";
import { menitDariPoin } from "@/lib/delego/teknis";
import { aksiKeu, useBahan, useKatalogSkor, useKirim, useRekap } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import PemilihPenerima, { type Pilihan } from "../PemilihPenerima";
import { Galat, Halaman, Info, Kartu, Medan, Peringatan, fmt } from "../ui";

type Lokasi = "luar" | "dalam";

export default function Perintah() {
  const { hak, hari, pemberi, manajer, bolehBeri } = useKonteksDelego();
  const kat = useKatalogSkor();
  const bahan = useBahan({ aktif: manajer });
  const kirim = useKirim(async () => {});
  const kelompok = (hak.kelompok ?? []).filter((k) => k.aktif && (hak.beri_kelompok ?? []).includes(k.kode));
  const jenisSiap = (hak.jenis ?? []).filter((j) => j.aktif);
  const jenisRapat = jenisSiap.find((j) => /rapat/i.test(j.nama)) ?? jenisSiap[0];

  const [lokasi, setLokasi] = useState<Lokasi>("luar");
  const [kegiatanId, setKegiatanId] = useState("");
  const [kelompokKode, setKelompokKode] = useState("");
  const [jenisId, setJenisId] = useState("");
  const [judul, setJudul] = useState("");
  const [uraian, setUraian] = useState("");
  const [tanggal, setTanggal] = useState(hari);
  const [jam, setJam] = useState("");
  const [jumlah, setJumlah] = useState("1");
  const [tinjau, setTinjau] = useState(false);
  const [pilih, setPilih] = useState<Pilihan[]>([]);
  const [sukses, setSukses] = useState<string | null>(null);

  const kegiatanBoleh = (kat.data?.kegiatan ?? []).filter((k) => bolehBeri(k.ro_kode));
  const kegiatan = kegiatanBoleh.find((k) => String(k.id) === kegiatanId) ?? null;
  const kelompokPakai = kelompokKode || kelompok[0]?.kode || "";
  const ro = lokasi === "dalam" ? kegiatan?.ro_kode ?? "" : kelompokPakai;
  const jenis = jenisSiap.find((j) => String(j.id) === (jenisId || String(jenisRapat?.id ?? ""))) ?? null;
  const jumlahAngka = Number(jumlah.replace(",", "."));
  const poin = jenis && jumlahAngka > 0 ? Math.round(angka(jenis.poin_per_satuan) * jumlahAngka * 100) / 100 : 0;

  // beban tiap penerima pada hari itu (delegasi + lapangan + pelatihan + ketersediaan), sebelum dan sesudah perintah ini
  const rekap = useRekap(tanggal, tanggal, manajer && !!tanggal);
  const bebanHari = (akun: number) => {
    if (!rekap.data || !bahan.data || !tanggal) return null;
    const orang = rekap.data.orang.filter((o) => o.akun === akun);
    if (orang.length === 0) return null;
    const nama: Record<number, string> = {};
    for (const l of rekap.data.lapangan) nama[l.kegiatan_id] = l.kegiatan;
    const h = susunRekap({ orang, delegasi: bahan.data.delegasi, lapangan: rekap.data.lapangan, ketersediaan: rekap.data.ketersediaan, dari: tanggal, sampai: tanggal, namaKegiatan: nama });
    const s = h.baris[0]?.sel[0];
    if (!s) return null;
    const kap = s.kapasitas > 0 ? s.kapasitas : 75;
    return { sebelum: Math.round((s.poin / kap) * 100), sesudah: Math.round(((s.poin + poin) / kap) * 100), libur: s.libur, tidakTersedia: s.kategori === "tidak_tersedia", lembur: s.lembur };
  };

  const kurang = [
    !jenis ? "jenis perintah" : null,
    judul.trim().length < 3 ? "isi perintah (min. 3 huruf)" : null,
    lokasi === "dalam" && !kegiatan ? "kegiatan survei" : null,
    lokasi === "luar" && !kelompokPakai ? "kelompok pekerjaan tim" : null,
    !(jumlahAngka > 0) ? "jumlah" : null,
    !tanggal || tanggal < hari ? "tanggal (hari ini atau sesudahnya)" : null,
    jam && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jam) ? "jam (HH:MM)" : null,
    pilih.length === 0 ? "penerima" : null,
  ].filter(Boolean) as string[];

  async function simpan() {
    if (kurang.length > 0 || !jenis) return;
    setSukses(null);
    const ok = await kirim.jalankan(async () => {
      const res = await aksiKeu<{ dibuat: number[] }>("keu_dlg_buat", {
        p_data: {
          ...(lokasi === "dalam" ? { ro_kode: ro } : { kelompok: kelompokPakai }),
          judul: judul.trim(),
          uraian: uraian.trim(),
          bobot: 1,
          mulai: tanggal,
          tenggat: tanggal,
          hari_kerja: [hariKe(tanggal)],
          ...(jam ? { tenggat_jam: jam } : {}),
          jenis_id: jenis.id,
          jumlah: jumlahAngka,
          perlu_hasil: false,
          perlu_tinjau: false,
          langkah: [],
          penerima: pilih.map((p) => ({ akun: p.akun, peran: p.peran, pj_bidang: "" })),
        },
      });
      if (!res.ok) return res;
      for (const id of res.data.dibuat ?? []) {
        const r2 = await aksiKeu("keu_dlg_atur_urusan", { p_id: id, p_data: { kelas: "perintah", mode_tutup: tinjau ? "tinjau" : "ringan", ...(lokasi === "dalam" && kegiatan ? { kegiatan_id: kegiatan.id } : {}) } });
        if (!r2.ok) return r2;
      }
      return res;
    });
    if (ok) {
      setSukses(`Perintah terkirim ke ${pilih.length} orang untuk ${tglPendek(tanggal)}${jam ? ` pukul ${jam}` : ""}. Mereka mendapat notifikasi dan perintah ini muncul di Pekerjaan saya.`);
      setJudul("");
      setUraian("");
      setJam("");
      setPilih([]);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (!pemberi) {
    return (
      <Halaman judul="Perintah langsung">
        <Info>Perintah langsung hanya dapat diberikan oleh Kepala atau Ketua Tim.</Info>
      </Halaman>
    );
  }

  return (
    <Halaman judul="Perintah langsung" sub="Rapat, koordinasi, dan tugas dari Kepala atau Ketua Tim, di dalam atau di luar kegiatan survei. Cukup tiga hal: apa, kapan, siapa.">
      {sukses && <Info>{sukses}</Info>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <Kartu judul="1. Apa perintahnya">
            <div className="space-y-3">
              <Medan label="Perintah ini berada">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lokasi perintah">
                  {([["luar", "Di luar kegiatan survei"], ["dalam", "Di dalam kegiatan survei"]] as const).map(([k, t]) => (
                    <button key={k} type="button" role="radio" aria-checked={lokasi === k} onClick={() => { setLokasi(k); setPilih([]); }} className={`min-h-[40px] rounded-lg border px-3 text-[13.5px] font-semibold ${lokasi === k ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white"}`}>{t}</button>
                  ))}
                </div>
              </Medan>
              {lokasi === "dalam" ? (
                <Medan label="Kegiatan survei" bantu="Perintah akan terhitung di rekap kegiatan itu.">
                  <select className={KELAS.isian} value={kegiatanId} onChange={(e) => { setKegiatanId(e.target.value); setPilih([]); }}>
                    <option value="">Pilih kegiatan</option>
                    {kegiatanBoleh.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                  </select>
                </Medan>
              ) : kelompok.length > 1 ? (
                <Medan label="Kelompok pekerjaan tim">
                  <select className={KELAS.isian} value={kelompokPakai} onChange={(e) => { setKelompokKode(e.target.value); setPilih([]); }}>
                    {kelompok.map((k) => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
                  </select>
                </Medan>
              ) : null}
              <Medan label="Jenis perintah" bantu={jenis ? `${fmt(angka(jenis.poin_per_satuan), 1)} poin per ${jenis.satuan} (sekitar ${fmt(menitDariPoin(angka(jenis.poin_per_satuan)), 0)} menit). Skor diatur di Katalog skor.` : undefined}>
                <select className={KELAS.isian} value={jenisId || String(jenisRapat?.id ?? "")} onChange={(e) => setJenisId(e.target.value)}>
                  {jenisSiap.map((j) => <option key={j.id} value={j.id}>{j.nama}</option>)}
                </select>
              </Medan>
              <Medan label="Isi perintah" bantu="Tulis singkat dan jelas, mis. Rapat koordinasi persiapan Seruti, ruang rapat lantai 2.">
                <input className={KELAS.isian} maxLength={200} value={judul} onChange={(e) => setJudul(e.target.value)} />
              </Medan>
              <Medan label="Keterangan tambahan (opsional)">
                <textarea className={KELAS.isian} rows={2} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} />
              </Medan>
            </div>
          </Kartu>

          <Kartu judul="2. Kapan">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Medan label="Tanggal"><input type="date" className={KELAS.isian} min={hari} value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></Medan>
              <Medan label="Jam (opsional, WIB)"><input type="time" className={KELAS.isian} value={jam} onChange={(e) => setJam(e.target.value)} /></Medan>
              <Medan label={jenis ? `Jumlah (${jenis.satuan})` : "Jumlah"}><input className={KELAS.isian} inputMode="decimal" value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></Medan>
            </div>
            <label className="mt-3 flex items-start gap-2 text-[13.5px]">
              <input type="checkbox" className="mt-1" checked={tinjau} onChange={(e) => setTinjau(e.target.checked)} />
              <span>Laporan perlu ditinjau Ketua Tim. <span className="text-[#3B4A57]">Biarkan kosong untuk rapat dan urusan kecil: cukup penerima menandai sudah dilaksanakan.</span></span>
            </label>
          </Kartu>

          <Kartu judul={`3. Siapa${pilih.length ? ` (${pilih.length})` : ""}`}>
            {ro ? (
              <PemilihPenerima
                ro={ro}
                ident={null}
                pilih={pilih}
                setPilih={setPilih}
                tampilPj={false}
                infoBeban={(akun) => {
                  const b = bebanHari(akun);
                  if (!b) return null;
                  if (b.tidakTersedia) return <p className="m-0 mt-1.5 text-[12.5px] font-semibold text-[#9B2C2C]">Tidak tersedia pada {tglPendek(tanggal)} (cuti, izin, sakit, atau dinas luar).</p>;
                  return (
                    <p className={`m-0 mt-1.5 text-[12.5px] ${b.sesudah > 100 ? "font-semibold text-[#9B2C2C]" : "text-[#3B4A57]"}`}>
                      Beban {tglPendek(tanggal)}: {b.sebelum}% → {b.sesudah}%{b.sesudah > 100 ? " (melebihi kapasitas)" : ""}{b.libur ? ` · ${b.libur}` : ""}
                    </p>
                  );
                }}
              />
            ) : (
              <p className="m-0 text-[13.5px] text-[#3B4A57]">Pilih {lokasi === "dalam" ? "kegiatan survei" : "kelompok pekerjaan tim"} dulu agar daftar penerima muncul.</p>
            )}
          </Kartu>

          {kurang.length > 0 && <Peringatan>Belum lengkap: {kurang.join(", ")}.</Peringatan>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || kurang.length > 0} onClick={() => void simpan()}>
              {kirim.mengirim ? "Mengirim..." : `Kirim perintah${pilih.length ? ` ke ${pilih.length} orang` : ""}`}
            </button>
            <Link href="/sigap/delego/buat" className={KELAS.tombolSekunder}>Delegasi survei (form lengkap)</Link>
          </div>
        </div>

        <aside className="space-y-3">
          <Kartu judul="Ringkasan">
            <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px]">
              <li>Kelompok: <b>Perintah langsung</b>, {lokasi === "dalam" ? `di dalam ${kegiatan?.nama ?? "kegiatan survei"}` : "di luar kegiatan survei"}</li>
              <li>Tanggal: <b>{tanggal ? tglPendek(tanggal) : "-"}</b>{jam ? ` pukul ${jam}` : ""}</li>
              <li>Skor: <b>{fmt(poin, 1)} poin</b> per penerima{poin > 0 ? ` (sekitar ${fmt(menitDariPoin(poin), 0)} menit)` : ""}</li>
              <li>Penutupan: <b>{tinjau ? "ditinjau Ketua Tim" : "ringan, tanpa tinjau"}</b></li>
            </ul>
          </Kartu>
          <Info>Perintah muncul di Pekerjaan saya milik penerima, ikut dihitung di Beban kerja, dan tertaut ke kegiatan bila dipilih di dalam kegiatan survei.</Info>
        </aside>
      </div>
    </Halaman>
  );
}
