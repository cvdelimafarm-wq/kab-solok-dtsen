"use client";

// app/sigap/foto/SusunFoto.tsx
//
// (21 Okt 2026) Panel "Nomor foto" per hari untuk kegiatan bermode Kamera SIGAP.
//  - Menampilkan 5 nomor (terisi/kosong) beserta foto Kamera SIGAP-nya, dan foto CADANGAN (sudah terkirim tetapi belum bernomor atau tergeser).
//  - `otomatis` (dipakai pada hari izin susulan): begitu panel terbuka, foto cadangan LANGSUNG disusun ke nomor yang masih kosong
//    (urut waktu; bila foto lebih banyak dari nomor kosong, dipilih yang sepadan lalu sisanya jadi cadangan). Tidak pernah menimpa nomor terisi.
// (23 Okt 2026) TAMPILAN DAN ALUR BARU (aturan penomoran, penyimpanan foto, foto cadangan, dan SPJ TIDAK berubah):
//  - Kisi lima nomor (3 + 2): thumbnail, nomor, peran, jam. Cara lama (chip "Pindah ke nomor", tombol lebar "Ganti foto N") dihapus.
//  - TUKAR URUTAN: ketuk foto A, ketuk foto B -> modal konfirmasi -> "Ya, tukar". Hasilnya selalu tukar (atau pindah ke nomor kosong),
//    tidak pernah menimpa. Tidak ada perubahan urutan tanpa konfirmasi; ketuk di luar modal tidak mengonfirmasi dan tidak membatalkan.
//  - Peringatan ⚠ HANYA soal urutan jam (lib/sigapUrutanFoto.ts), selalu disertai alasan satu kalimat di bawah kisi. Lencana kepercayaan
//    (Wajar/Perlu perhatian) tidak lagi tampil di sini; kriterianya tetap dipakai di tempat lain (PeriksaFoto, Foto saya, SPJ).
//  - "Urutkan sesuai jam" dengan pratinjau; foto cadangan dipasang lewat alur yang sama (ketuk cadangan, ketuk nomor, konfirmasi).
//  - Lembar detail foto: foto besar, jam, lokasi, "Ambil ulang foto" (foto lama tersimpan sebagai cadangan) dan "Tukar dengan…".
// Tidak ada penghapusan foto di sini.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ambilFotoUrl, ambilJson, type GalatFoto } from "./klien";
import { labelFoto } from "@/lib/sigapLabelFoto";
import type { Kepercayaan } from "@/lib/sigapFoto";
import { alasanBentrok, jamWib, kalimatJam, nilaiJam, pasangIsi, peranRingkas, rencanaUrutJam, slotBermasalah, tukarIsi, type IsiNomor } from "@/lib/sigapUrutanFoto";

type FotoRingkas = { id: number; kode: string; kepercayaan: Kepercayaan; diambil_at: string; lat?: number | null; lng?: number | null; tahan?: boolean };
type Nomor = { slot: number; terisi: boolean; sumber: string | null; susulan: boolean; foto: FotoRingkas | null; ditahan?: FotoRingkas | null };
type Keadaan = { boleh: boolean; susulan: boolean; lampau?: boolean; sisa_hari?: number | null; alasan_tutup: string | null; jumlah: number; nomor: Nomor[]; kosong: number[]; saran: number | null; ditahan?: number[]; cadangan: FotoRingkas[] };
type HasilIsi = { ditempatkan: { foto_id: number; slot: number }[]; ditahan?: { foto_id: number; slot: number }[]; cadangan: number; gagal?: { foto_id: number; error: string }[] };

type Pilih = { tipe: "slot"; slot: number } | { tipe: "cadangan"; id: number } | null;
type Konf = { jenis: "tukar"; dari: number; ke: number } | { jenis: "pasang"; fotoId: number; slot: number } | { jenis: "urut" };
type GalatModal = { teks: string; muatUlang: boolean };
/** Isi sebuah nomor seperti dilihat petugas; dikirim sebagai `harap_*` agar server menolak bila layar sudah usang. */
type Harap = "kosong" | "manual" | number;

// (23 Okt 2026) tanggal hari ini (WIB) di sisi klien: kamera hanya bisa memotret SEKARANG, jadi "Ambil ulang foto" hanya untuk hari ini
const hariIniWibKlien = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const jamIso = (iso: string) => jamWib(Date.parse(iso));
const harapNomor = (n: Nomor): Harap => (!n.terisi ? "kosong" : n.foto ? n.foto.id : "manual");

function Gambar({ id, kelas, alt }: { id: number; kelas: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    let batal = false;
    let u: string | null = null;
    setUrl(null);
    setGagal(false);
    ambilFotoUrl(id)
      .then((x) => {
        if (batal) URL.revokeObjectURL(x);
        else {
          u = x;
          setUrl(x);
        }
      })
      .catch(() => !batal && setGagal(true));
    return () => {
      batal = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (gagal) return <div className={`flex items-center justify-center bg-[#EEF2F7] px-1 text-center text-[10.5px] font-semibold text-[#55657D] ${kelas}`}>Foto belum termuat</div>;
  if (!url) return <div className={`animate-pulse bg-[#EEF2F7] ${kelas}`} aria-label="Memuat foto" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={kelas} />;
}

function IkonPeringatan({ kelas = "h-4 w-4" }: { kelas?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={kelas} aria-hidden="true" focusable="false">
      <path d="M10 2.2 18.6 17H1.4L10 2.2Z" fill="#F2B632" stroke="#8A6200" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 7.6v4.2" stroke="#3D2B00" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1" fill="#3D2B00" />
    </svg>
  );
}

/**
 * (23 Okt 2026) Lapisan penuh layar dipasang LANGSUNG di <body> (portal), bukan di dalam halaman. Bila dirender di dalam halaman, lapisan ini
 * terjebak di konteks susunan induknya dan tampil DI BAWAH bilah navigasi bawah (Hari Ini / Hari Kerja / Arsip, z-30), sehingga tombol "Batal"
 * tertutup dan tidak bisa diketuk. z-[100] memastikan di atas bilah navigasi mana pun; ruang bawah mengikuti area aman HP (gestur/tombol sistem).
 */
function Lapisan({ children, kelas, onKlik }: { children: ReactNode; kelas: string; onKlik?: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`fixed inset-0 z-[100] flex justify-center bg-black/50 ${kelas}`} role="presentation" onClick={onKlik} style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      {children}
    </div>,
    document.body
  );
}

/** Jendela konfirmasi. Ketuk di luar jendela TIDAK mengonfirmasi dan TIDAK menutup; hanya tombol Batal (atau Esc) yang menutup. */
function Modal({ judul, idJudul, sibuk, onBatal, children }: { judul: string; idJudul: string; sibuk: boolean; onBatal: () => void; children: ReactNode }) {
  const kotak = useRef<HTMLDivElement>(null);
  useEffect(() => {
    kotak.current?.focus(); // fokus ke jendela (bukan ke tombol), supaya Enter tidak langsung mengonfirmasi
  }, []);
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sibuk) onBatal();
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [sibuk, onBatal]);
  return (
    <Lapisan kelas="items-center px-3">
      <div ref={kotak} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={idJudul} className="max-h-full w-full max-w-sm self-center overflow-y-auto rounded-2xl bg-white p-4 shadow-xl outline-none">
        <h2 id={idJudul} className="text-base font-extrabold leading-snug text-[#0F2A52]">{judul}</h2>
        {children}
      </div>
    </Lapisan>
  );
}

function KartuModal({ fotoId, judul, sub, kosong }: { fotoId: number | null; judul: string; sub: string; kosong?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className={`aspect-square w-full overflow-hidden rounded-xl ${kosong ? "flex items-center justify-center border-2 border-dashed border-[#C9D3E6] bg-white text-xs font-bold text-[#8A6200]" : "bg-[#EEF2F7]"}`}>
        {kosong ? "Kosong" : fotoId !== null ? <Gambar id={fotoId} kelas="h-full w-full object-cover" alt={judul} /> : <div className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-semibold text-[#55657D]">Unggahan manual</div>}
      </div>
      <div className="mt-1 text-[13px] font-extrabold leading-tight text-[#0F2A52]">{judul}</div>
      <div className="text-[11.5px] leading-tight text-[#3C4C68]">{sub}</div>
    </div>
  );
}

const TOMBOL_UTAMA = "min-h-[48px] w-full whitespace-nowrap rounded-xl bg-[#0F2A52] px-3 text-sm font-extrabold text-white disabled:opacity-50";
const TOMBOL_SEKUNDER = "min-h-[48px] w-full whitespace-nowrap rounded-xl border-2 border-[#C9D3E6] bg-white px-3 text-sm font-bold text-[#0F2A52] disabled:opacity-50";

function pesanGalat(e: unknown): GalatModal {
  const g = e as GalatFoto;
  const asli = e instanceof Error ? e.message : "";
  if (g?.status === undefined) return { teks: "Tidak ada sambungan internet. Urutan foto tidak diubah. Coba lagi setelah ada sinyal.", muatUlang: false };
  if (g.status === 401) return { teks: "Sesi Anda berakhir. Masuk ulang, lalu coba lagi. Urutan foto tidak diubah.", muatUlang: false };
  const teks = /tidak diubah/i.test(asli) ? asli : `${asli || "Gagal menyimpan."} Urutan foto tidak diubah.`;
  return { teks, muatUlang: g.status === 409 };
}

export default function SusunFoto({
  kegiatanId,
  tanggal,
  jenis = null,
  otomatis = false,
  polos = false,
  onBerubah,
}: {
  kegiatanId: number;
  tanggal: string;
  jenis?: string | null;
  otomatis?: boolean;
  /** (24 Okt 2026) true bila sudah berada di dalam kartu pembungkus: tanpa bingkai dan jarak sendiri, supaya kisi foto tidak menyempit (kartu bersarang) */
  polos?: boolean;
  onBerubah?: () => void | Promise<void>;
}) {
  const [k, setK] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [petunjuk, setPetunjuk] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pilih, setPilih] = useState<Pilih>(null);
  const [konf, setKonf] = useState<Konf | null>(null);
  const [galatModal, setGalatModal] = useState<GalatModal | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [kilat, setKilat] = useState<number[]>([]);
  const sudahOtomatis = useRef(false);
  const penjedaKilat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etiket = labelFoto(jenis);

  const muat = useCallback(async () => {
    try {
      const d = await ambilJson<Keadaan>(`/api/sigap/foto/susun?kegiatan=${kegiatanId}&tanggal=${tanggal}`);
      setK(d);
      setGalat(null);
      return d;
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat nomor foto.");
      return null;
    }
  }, [kegiatanId, tanggal]);

  const kabari = useCallback(() => {
    void Promise.resolve(onBerubah?.()).catch(() => undefined);
  }, [onBerubah]);

  async function kirimAksi(badan: Record<string, unknown>) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw Object.assign(new Error("Tidak ada sambungan."), { status: undefined });
    return ambilJson<Record<string, unknown>>("/api/sigap/foto/susun", { method: "POST", body: { kegiatan_id: kegiatanId, tanggal, ...badan } });
  }

  function nyalakanKilat(slot: number[]) {
    setKilat(slot);
    if (penjedaKilat.current) clearTimeout(penjedaKilat.current);
    penjedaKilat.current = setTimeout(() => setKilat([]), 1600);
  }
  useEffect(() => () => { if (penjedaKilat.current) clearTimeout(penjedaKilat.current); }, []);

  async function isi() {
    setSibuk(true);
    setGalat(null);
    setPetunjuk(null);
    try {
      const r = (await kirimAksi({ aksi: "isi" })) as unknown as HasilIsi;
      const tahan = r.ditahan ?? [];
      if (r.ditempatkan.length || tahan.length) {
        const urut = [...r.ditempatkan].sort((a, b) => a.slot - b.slot).map((x) => x.slot).join(", ");
        const urutTahan = [...tahan].sort((a, b) => a.slot - b.slot).map((x) => x.slot).join(", ");
        setPesan(
          `${r.ditempatkan.length ? `${r.ditempatkan.length} foto Kamera SIGAP otomatis mengisi nomor ${urut}.` : ""}${tahan.length ? ` ${tahan.length} foto menunggu diperiksa PML/admin dan nomornya (${urutTahan}) dipesan dulu.` : ""}${r.cadangan ? ` ${r.cadangan} foto lain disimpan sebagai foto cadangan.` : ""} Bila tidak sesuai, ketuk dua foto untuk menukar urutannya.`.trim()
        );
        kabari();
      } else if (r.gagal?.length) setGalat("Sebagian foto belum bisa dipasang. Coba lagi atau pasang manual.");
      else setPesan(null);
    } catch (e) {
      setGalat(pesanGalat(e).teks);
    } finally {
      await muat();
      setSibuk(false);
    }
  }

  /** Jalankan satu perubahan urutan SETELAH dikonfirmasi. Gagal (offline/konflik) -> pesan di jendela, tampilan urutan tidak diubah. */
  async function jalankan(badan: Record<string, unknown>, slotKilat: number[], sukses = "Urutan foto diperbarui") {
    setSibuk(true);
    setGalatModal(null);
    setGalat(null);
    setPetunjuk(null);
    try {
      const r = await kirimAksi(badan);
      kabari();
      await muat();
      setKonf(null);
      setPilih(null);
      setDetail(null);
      if (r.status === "sudah_urut") setPesan("Urutan foto sudah sesuai jam.");
      else {
        setPesan(sukses);
        nyalakanKilat(slotKilat);
      }
    } catch (e) {
      setGalatModal(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  useEffect(() => {
    let batal = false;
    (async () => {
      const d = await muat();
      if (batal || !d || !otomatis || sudahOtomatis.current) return;
      if (d.boleh && d.cadangan.length > 0 && d.kosong.length > 0) {
        sudahOtomatis.current = true; // satu kali per pembukaan panel; sesudahnya petugas yang mengatur
        await isi();
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muat, otomatis]);

  // pilihan yang sudah tidak berlaku setelah data dimuat ulang (mis. foto pindah dari HP lain) dibatalkan
  useEffect(() => {
    if (!k || !pilih) return;
    if (pilih.tipe === "slot" && !k.nomor.find((n) => n.slot === pilih.slot)?.terisi) setPilih(null);
    if (pilih.tipe === "cadangan" && !k.cadangan.some((f) => f.id === pilih.id)) setPilih(null);
  }, [k, pilih]);

  const isiNomor = useMemo<IsiNomor[]>(
    () => (k ? k.nomor.filter((n) => n.terisi).map((n) => ({ slot: n.slot, fotoId: n.foto?.id ?? null, ms: n.foto ? Date.parse(n.foto.diambil_at) : null })) : []),
    [k]
  );
  const nilai = useMemo(() => nilaiJam(isiNomor), [isiNomor]);
  const bermasalah = useMemo(() => slotBermasalah(nilai.bentrok), [nilai]);
  const alasan = useMemo(() => alasanBentrok(nilai.bentrok, isiNomor), [nilai, isiNomor]);
  const rencana = useMemo(() => rencanaUrutJam(isiNomor), [isiNomor]);

  if (!k) return galat ? <div role="alert" className="rounded-xl bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div> : <div className="h-24 animate-pulse rounded-2xl bg-[#EEF2F7]" aria-label="Memuat nomor foto" />;
  if (k.nomor.every((n) => !n.terisi) && k.cadangan.length === 0 && !k.boleh) return null;

  const boleh = k.boleh;
  const bisaUbah = boleh && !sibuk;
  const bisaKamera = bisaUbah && !k.susulan && tanggal === hariIniWibKlien();
  const nomorDi = (slot: number) => k.nomor.find((n) => n.slot === slot);
  const fotoNomor = (n: Nomor | undefined) => n?.foto ?? null;
  const subNomor = (n: Nomor) => (n.foto ? `${jamIso(n.foto.diambil_at)} WIB` : n.terisi ? "Unggahan manual" : "Kosong");

  function ketukSlot(slot: number) {
    const n = nomorDi(slot);
    if (!n) return;
    setPesan(null);
    setPetunjuk(null);
    if (!boleh) {
      if (n.terisi) setDetail(slot); // hari ditutup: hanya melihat
      return;
    }
    if (sibuk) return;
    if (!pilih) {
      if (!n.terisi) {
        setPetunjuk(`Nomor ${slot} masih kosong. Ketuk dulu foto cadangan atau foto lain, lalu ketuk nomor ini.`);
        return;
      }
      setPilih({ tipe: "slot", slot });
      return;
    }
    if (pilih.tipe === "slot") {
      if (pilih.slot === slot) setPilih(null); // ketuk lagi = batal
      else setKonf({ jenis: "tukar", dari: pilih.slot, ke: slot });
      return;
    }
    siapPasang(pilih.id, slot);
  }

  function ketukCadangan(id: number) {
    if (!boleh || sibuk) return;
    setPesan(null);
    setPetunjuk(null);
    if (!pilih || pilih.tipe === "cadangan") {
      setPilih(pilih && pilih.tipe === "cadangan" && pilih.id === id ? null : { tipe: "cadangan", id });
      return;
    }
    siapPasang(id, pilih.slot);
  }

  function siapPasang(fotoId: number, slot: number) {
    const f = k?.cadangan.find((x) => x.id === fotoId);
    const n = nomorDi(slot);
    if (!f || !n) return;
    if (n.terisi && !n.foto) {
      setPetunjuk(`Nomor ${slot} berisi unggahan manual dan tidak bisa digantikan foto cadangan dari sini. Pilih nomor lain.`);
      return;
    }
    if (f.tahan && n.terisi) {
      setPetunjuk("Foto yang menunggu diperiksa PML/admin hanya bisa dipesankan ke nomor yang masih kosong.");
      return;
    }
    setKonf({ jenis: "pasang", fotoId, slot });
  }

  function tutupKonf() {
    if (sibuk) return;
    const muatUlang = galatModal?.muatUlang;
    setKonf(null);
    setGalatModal(null);
    if (muatUlang) {
      setPilih(null);
      void muat();
    }
  }

  // ---------- isi jendela konfirmasi ----------
  function ModalKonfirmasi() {
    if (!konf || !k) return null;
    const peran = (s: number) => peranRingkas(jenis, s);
    const galatBlok = galatModal ? (
      <div role="alert" className="mt-3 rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs font-semibold leading-relaxed text-[#9B1C23]">{galatModal.teks}</div>
    ) : null;
    const tombol = (labelYa: string, onYa: () => void) => (
      <div className="mt-4 flex flex-col gap-2">
        {galatModal?.muatUlang ? (
          <button type="button" onClick={tutupKonf} className={TOMBOL_UTAMA}>Tutup dan muat ulang</button>
        ) : (
          <>
            <button type="button" disabled={sibuk} onClick={onYa} className={TOMBOL_UTAMA}>{sibuk ? "Menyimpan…" : labelYa}</button>
            <button type="button" disabled={sibuk} onClick={tutupKonf} className={TOMBOL_SEKUNDER}>Batal</button>
          </>
        )}
      </div>
    );

    if (konf.jenis === "tukar") {
      const a = nomorDi(konf.dari);
      const b = nomorDi(konf.ke);
      if (!a || !b) return null;
      const sesudah = nilaiJam(tukarIsi(isiNomor, konf.dari, konf.ke));
      const kataJam = kalimatJam(nilai, sesudah, b.terisi ? "ditukar" : "dipindah");
      const pindahKeKosong = !b.terisi;
      return (
        <Modal judul={pindahKeKosong ? `Apakah Anda yakin memindahkan foto ${konf.dari} ke nomor ${konf.ke}?` : "Apakah Anda yakin mengubah urutan 2 foto ini?"} idJudul="judul-konf-tukar" sibuk={sibuk} onBatal={tutupKonf}>
          <div className="mt-3 flex items-start gap-1.5">
            <KartuModal fotoId={a.foto?.id ?? null} judul={`Foto ${a.slot}`} sub={`${peran(a.slot)} · ${a.foto ? jamIso(a.foto.diambil_at) : "tanpa jam"}`} />
            <span className="mt-8 flex-none text-xl font-extrabold text-[#0F2A52]" aria-label="ditukar dengan">⇄</span>
            <KartuModal fotoId={b.foto?.id ?? null} judul={`Foto ${b.slot}`} sub={b.terisi ? `${peran(b.slot)} · ${b.foto ? jamIso(b.foto.diambil_at) : "tanpa jam"}` : peran(b.slot)} kosong={pindahKeKosong} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#1B2B4B]">
            {pindahKeKosong
              ? `Foto ${a.slot} akan pindah ke nomor ${b.slot} dan menjadi “${peran(b.slot)}”. Nomor ${a.slot} menjadi kosong.`
              : `Foto ${a.slot} akan menjadi “${peran(b.slot)}” (nomor ${b.slot}), foto ${b.slot} menjadi “${peran(a.slot)}” (nomor ${a.slot}).`}
          </p>
          {kataJam && <p className={`mt-1.5 text-[13px] font-semibold leading-relaxed ${sesudah.bentrok.length ? "text-[#8A5A00]" : "text-[#0B6B3F]"}`}>{kataJam}</p>}
          {galatBlok}
          {tombol(pindahKeKosong ? "Ya, pindahkan" : "Ya, tukar", () => void jalankan({ aksi: "pindah", dari: konf.dari, ke: konf.ke, harap_dari: harapNomor(a), harap_ke: harapNomor(b) }, [konf.dari, konf.ke]))}
        </Modal>
      );
    }

    if (konf.jenis === "pasang") {
      const f = k.cadangan.find((x) => x.id === konf.fotoId);
      const n = nomorDi(konf.slot);
      if (!f || !n) return null;
      const sesudah = f.tahan ? nilai : nilaiJam(pasangIsi(isiNomor, konf.slot, { fotoId: f.id, ms: Date.parse(f.diambil_at) }));
      const kataJam = f.tahan ? null : kalimatJam(nilai, sesudah, "dipasang");
      return (
        <Modal judul="Apakah Anda yakin memasang foto cadangan ini?" idJudul="judul-konf-pasang" sibuk={sibuk} onBatal={tutupKonf}>
          <div className="mt-3 flex items-start gap-1.5">
            <KartuModal fotoId={f.id} judul="Foto cadangan" sub={`${jamIso(f.diambil_at)} WIB`} />
            <span className="mt-8 flex-none text-xl font-extrabold text-[#0F2A52]" aria-label="menggantikan">⇄</span>
            <KartuModal fotoId={n.foto?.id ?? null} judul={`Foto ${n.slot}`} sub={n.terisi ? `${peran(n.slot)} · ${n.foto ? jamIso(n.foto.diambil_at) : "tanpa jam"}` : peran(n.slot)} kosong={!n.terisi} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#1B2B4B]">
            {f.tahan
              ? `Nomor ${n.slot} (“${peran(n.slot)}”) dipesan untuk foto ini dan baru tercatat setelah diperiksa PML/admin.`
              : n.terisi
                ? `Foto di nomor ${n.slot} akan pindah ke cadangan. Foto cadangan ini menjadi “${peran(n.slot)}” (nomor ${n.slot}).`
                : `Foto cadangan ini akan mengisi nomor ${n.slot} (“${peran(n.slot)}”).`}
          </p>
          {kataJam && <p className={`mt-1.5 text-[13px] font-semibold leading-relaxed ${sesudah.bentrok.length ? "text-[#8A5A00]" : "text-[#0B6B3F]"}`}>{kataJam}</p>}
          {galatBlok}
          {tombol("Ya, pasang", () => void jalankan({ aksi: "pasang", foto_id: f.id, slot: n.slot, harap_isi: harapNomor(n) }, [n.slot], f.tahan ? `Nomor ${n.slot} dipesan untuk foto ini.` : "Urutan foto diperbarui"))}
        </Modal>
      );
    }

    // urutkan sesuai jam
    let cur = isiNomor;
    const pasangan: string[] = [];
    for (const [x, y] of rencana.langkah) {
      const mx = cur.find((c) => c.slot === x)?.ms;
      const my = cur.find((c) => c.slot === y)?.ms;
      pasangan.push(`Foto ${x} (${mx != null ? jamWib(mx) : "-"}) ⇄ foto ${y} (${my != null ? jamWib(my) : "-"})`);
      cur = tukarIsi(cur, x, y);
    }
    const sesudah = nilaiJam(rencana.akhir);
    const kataJam = kalimatJam(nilai, sesudah, "diurutkan");
    return (
      <Modal judul="Apakah Anda yakin mengurutkan foto sesuai jam?" idJudul="judul-konf-urut" sibuk={sibuk} onBatal={tutupKonf}>
        <p className="mt-2 text-[13px] leading-relaxed text-[#3C4C68]">Foto Kamera SIGAP diurutkan dari jam terawal ke terakhir pada nomor yang sama. Jam yang sama tetap pada urutan lama.</p>
        <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-[#55657D]">Yang bertukar</div>
        <ul className="mt-1 flex flex-col gap-1">
          {pasangan.map((p, i) => (
            <li key={i} className="rounded-lg bg-[#F7F9FD] px-2.5 py-2 text-[13px] font-semibold text-[#0F2A52]">{p}</li>
          ))}
        </ul>
        <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-[#55657D]">Urutan sesudahnya</div>
        <ol className="mt-1 flex flex-col gap-0.5 text-[13px] text-[#1B2B4B]">
          {rencana.akhir.map((x) => (
            <li key={x.slot}>
              <b>Nomor {x.slot}</b> · {peran(x.slot)} · {x.ms != null ? `${jamWib(x.ms)} WIB` : "unggahan manual"}
            </li>
          ))}
        </ol>
        {kataJam && <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#0B6B3F]">{kataJam}</p>}
        {galatBlok}
        {tombol("Ya, urutkan", () => void jalankan({ aksi: "urutkan", harap_langkah: rencana.langkah }, rencana.berubah.map((u) => u.slot), "Foto diurutkan sesuai jam"))}
      </Modal>
    );
  }

  // ---------- lembar detail satu foto ----------
  function LembarDetail() {
    if (detail === null || !k) return null;
    const n = nomorDi(detail);
    if (!n) return null;
    const f = fotoNomor(n);
    const terkait = nilai.bentrok.filter((b) => b.kecil === n.slot || b.besar === n.slot);
    const lokasi = f && typeof f.lat === "number" && typeof f.lng === "number" ? { lat: f.lat, lng: f.lng } : null;
    return (
      <Lapisan kelas="items-end px-3" onKlik={() => setDetail(null)}>
        <div role="dialog" aria-modal="true" aria-labelledby="judul-detail-foto" onClick={(e) => e.stopPropagation()} className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
          <h2 id="judul-detail-foto" className="text-base font-extrabold text-[#0F2A52]">Foto {n.slot} · {peranRingkas(jenis, n.slot)}</h2>
          <p className="text-[12px] text-[#55657D]">{etiket[n.slot - 1] ?? ""}</p>
          <div className="mt-3 overflow-hidden rounded-xl bg-[#EEF2F7]">
            {f ? <Gambar id={f.id} kelas="max-h-[48vh] w-full object-contain" alt={`Foto ${n.slot}`} /> : <div className="flex h-32 items-center justify-center text-sm font-semibold text-[#55657D]">Unggahan manual</div>}
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] text-[#1B2B4B]">
            <dt className="font-bold text-[#55657D]">Jam</dt>
            <dd>{f ? `${jamIso(f.diambil_at)} WIB · Kamera SIGAP` : "Tidak tercatat (unggahan manual)"}</dd>
            <dt className="font-bold text-[#55657D]">Lokasi</dt>
            <dd>
              {lokasi ? (
                <>
                  {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)}
                  <a href={`https://www.google.com/maps?q=${lokasi.lat},${lokasi.lng}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center font-bold text-[#1F5FBF] underline">Buka di peta</a>
                </>
              ) : (
                "Tidak tercatat"
              )}
            </dd>
          </dl>
          {terkait.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-[#FFF4D6] px-2.5 py-2 text-[12.5px] font-semibold text-[#5E4300]">
              <IkonPeringatan kelas="mt-0.5 h-4 w-4 flex-none" />
              <div>{alasanBentrok(terkait, isiNomor).baris.map((t) => <p key={t}>{t}</p>)}</div>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {boleh && (
              <button type="button" disabled={!bisaUbah} onClick={() => { setDetail(null); setPilih({ tipe: "slot", slot: n.slot }); }} className={TOMBOL_UTAMA}>
                Tukar dengan…
              </button>
            )}
            {n.terisi && bisaKamera && (
              <div>
                <Link href={`/sigap/foto?kegiatan=${kegiatanId}&nomor=${n.slot}`} className="flex min-h-[48px] w-full items-center justify-center whitespace-nowrap rounded-xl border-2 border-[#C9D3E6] bg-white px-3 text-sm font-bold text-[#0F2A52]">
                  Ambil ulang foto
                </Link>
                <p className="mt-1 text-center text-[11.5px] text-[#55657D]">Foto lama tersimpan sebagai cadangan.</p>
              </div>
            )}
            <button type="button" onClick={() => setDetail(null)} className={TOMBOL_SEKUNDER}>Tutup</button>
          </div>
        </div>
      </Lapisan>
    );
  }

  const dipilihSlot = pilih?.tipe === "slot" ? pilih.slot : null;
  const dipilihCadangan = pilih?.tipe === "cadangan" ? k.cadangan.find((f) => f.id === pilih.id) ?? null : null;

  return (
    <section className={`flex flex-col gap-2.5 ${polos ? "" : "rounded-2xl border border-[#C9D3E6] bg-white p-3"}`} aria-label="Nomor foto Kamera SIGAP">
      <div>
        <div className="text-sm font-extrabold text-[#0F2A52]">Nomor foto {k.nomor.filter((n) => n.terisi).length}/{k.jumlah}</div>
        {boleh && (
          <p className={`mt-0.5 min-h-[2.6em] text-[12.5px] font-semibold leading-snug ${pilih ? "text-[#0F2A52]" : "text-[#1B2B4B]"}`} aria-live="polite">
            {dipilihSlot !== null ? `Foto ${dipilihSlot} dipilih. Pilih foto yang mau ditukar.` : dipilihCadangan ? "Foto cadangan dipilih. Ketuk nomor tujuannya di kisi." : "Ketuk dua foto untuk menukar urutannya."}
          </p>
        )}
        {k.susulan && otomatis && <p className="mt-0.5 text-[11.5px] leading-snug text-[#3C4C68]">Foto Kamera SIGAP tanggal ini disusun otomatis ke nomor yang masih kosong.</p>}
        <details className="mt-1 text-[11.5px] leading-relaxed text-[#3C4C68]">
          <summary className="cursor-pointer select-none py-1.5 font-bold text-[#1F5FBF]">Lihat panduan</summary>
          <ul className="list-disc space-y-1 pl-4">
            <li>Ketuk satu foto, lalu ketuk foto lain. Anda akan diminta konfirmasi sebelum urutan berubah.</li>
            <li>Ketuk foto yang sama sekali lagi untuk membatalkan pilihan. “Detail foto” ada pada kotak pilihan di atas kisi.</li>
            <li>Tanda ⚠ berarti urutan jam foto tidak sesuai nomornya. Alasannya tertulis di bawah kisi; tukar boleh tetap dilakukan.</li>
            <li>Foto cadangan tetap tersimpan. Ketuk salah satu, lalu ketuk nomor tujuannya.</li>
            {bisaKamera && <li>Salah foto? Buka Detail foto lalu ketuk Ambil ulang foto. Foto lama tersimpan sebagai cadangan.</li>}
          </ul>
        </details>
      </div>

      {pesan && <div role="status" className="rounded-lg bg-[#E3F6EC] px-3 py-2 text-xs font-semibold leading-relaxed text-[#0B6B3F]">{pesan}</div>}
      {petunjuk && <div role="status" className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs font-semibold leading-relaxed text-[#1B2B4B]">{petunjuk}</div>}
      {galat && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div>}
      {!k.boleh && k.alasan_tutup && <div className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs text-[#5E4300]">{k.alasan_tutup}</div>}
      {k.boleh && k.lampau && typeof k.sisa_hari === "number" && (
        <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">
          Hari ini sudah lewat, tetapi nomor foto masih bisa diatur {k.sisa_hari === 0 ? "sampai akhir hari ini" : `${k.sisa_hari} hari lagi`}. Sesudah itu terkunci.
        </div>
      )}

      <ol className="grid grid-cols-3 gap-2">
        {k.nomor.map((n) => {
          const f = n.foto ?? n.ditahan ?? null;
          const dipilihIni = dipilihSlot === n.slot;
          const masalah = bermasalah.has(n.slot);
          const nyala = kilat.includes(n.slot);
          const batas = nyala ? "border-[#1AA37A] ring-4 ring-[#BFEBD9] motion-safe:animate-pulse" : dipilihIni ? "border-[#0F2A52] ring-4 ring-[#BFD0F0]" : masalah ? "border-[#F2B632]" : n.terisi ? "border-[#C9D3E6]" : "border-dashed border-[#C9D3E6]";
          return (
            <li key={n.slot} className="h-full min-w-0">
              <button
                type="button"
                onClick={() => ketukSlot(n.slot)}
                aria-pressed={dipilihIni}
                aria-label={`Foto ${n.slot}, ${peranRingkas(jenis, n.slot)}, ${n.terisi ? subNomor(n) : n.ditahan ? "dipesan, menunggu diperiksa" : "kosong"}${masalah ? ", urutan jam terbalik" : ""}`}
                className={`flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition ${batas}`}
              >
                {/* 4:3: foto landscape (cap kartu kiri-bawah) tampil hampir utuh dan kartu lebih pendek; tinggi semua kartu sama */}
                <span className={`relative block aspect-[4/3] w-full ${n.terisi ? "bg-[#EEF2F7]" : "bg-[#F7F9FD]"}`}>
                  {f ? (
                    <Gambar id={f.id} kelas={`h-full w-full object-cover ${n.terisi ? "" : "opacity-50"}`} alt={`Foto ${n.slot}`} />
                  ) : (
                    <span className="flex h-full w-full items-end justify-center px-1 pb-1.5 text-center text-[11px] font-bold text-[#8A6200]">{n.terisi ? "Unggahan manual" : "Kosong"}</span>
                  )}
                  <span className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${n.terisi ? "bg-[#0F2A52] text-white" : "bg-white text-[#0F2A52] ring-1 ring-[#C9D3E6]"}`}>{n.slot}</span>
                  {masalah && (
                    <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow" title="Urutan jam terbalik">
                      <IkonPeringatan kelas="h-4 w-4" />
                    </span>
                  )}
                </span>
                <span className="block px-1.5 pb-1.5 pt-1">
                  {/* break-normal: kata tidak pernah dipecah di tengah ("Berangk/at"); frasa panjang turun ke baris berikut di antara kata */}
                  <span className="block break-normal text-[11.5px] font-extrabold leading-tight text-[#0F2A52]">{peranRingkas(jenis, n.slot)}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-[#3C4C68]">
                    {n.terisi ? (n.foto ? `${jamIso(n.foto.diambil_at)} WIB` : "Manual") : n.ditahan ? `${jamIso(n.ditahan.diambil_at)} · dipesan` : "\u00a0"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {pilih && (
        <div className="flex gap-2">
          {dipilihSlot !== null && (
            <button type="button" onClick={() => setDetail(dipilihSlot)} className="min-h-[44px] flex-1 whitespace-nowrap rounded-lg border-2 border-[#C9D3E6] bg-white px-2 text-[13px] font-bold text-[#0F2A52]">Detail foto</button>
          )}
          <button type="button" onClick={() => setPilih(null)} className="min-h-[44px] flex-1 whitespace-nowrap rounded-lg border-2 border-[#C9D3E6] bg-white px-2 text-[13px] font-bold text-[#0F2A52]">Batal pilih</button>
        </div>
      )}

      {alasan.baris.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#5E4300]">
          <IkonPeringatan kelas="mt-0.5 h-4 w-4 flex-none" />
          <div>
            {alasan.baris.map((t) => (
              <p key={t}>{t}</p>
            ))}
            {alasan.sisa > 0 && <p>+{alasan.sisa} lagi</p>}
          </div>
        </div>
      )}

      {boleh && nilai.jumlahBerjam >= 2 && (
        <div>
          <button type="button" disabled={!bisaUbah || rencana.langkah.length === 0} onClick={() => { setGalatModal(null); setKonf({ jenis: "urut" }); }} className={TOMBOL_SEKUNDER}>
            Urutkan sesuai jam
          </button>
          {rencana.langkah.length === 0 && <p className="mt-1 text-center text-[11.5px] text-[#55657D]">Foto sudah berurutan sesuai jam.</p>}
        </div>
      )}

      {k.cadangan.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-extrabold text-[#0F2A52]">Foto cadangan ({k.cadangan.length})</div>
          <p className="text-[11.5px] leading-snug text-[#3C4C68]">Tersimpan, belum bernomor. Ketuk satu foto, lalu nomor tujuannya.</p>
          {k.cadangan.map((f, urutan) => {
            const dipilihIni = dipilihCadangan?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                disabled={!boleh}
                onClick={() => ketukCadangan(f.id)}
                aria-pressed={dipilihIni}
                aria-label={`Foto cadangan ${jamIso(f.diambil_at)}`}
                className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border-2 bg-white px-2 py-1.5 text-left ${dipilihIni ? "border-[#0F2A52] ring-4 ring-[#BFD0F0]" : "border-[#C9D3E6]"}`}
              >
                <Gambar id={f.id} kelas="h-11 w-14 flex-none rounded-lg object-cover" alt={`Foto cadangan ${String.fromCharCode(65 + (urutan % 26))}`} />
                <span className="min-w-0 flex-1">
                  {/* huruf pembeda (A, B, ...) supaya dua foto dengan jam sama tidak tampak kembar */}
                  <span className="block text-[13px] font-bold text-[#0F2A52]">Cadangan {String.fromCharCode(65 + (urutan % 26))} · {jamIso(f.diambil_at)} WIB</span>
                  {dipilihIni && <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug text-[#0F2A52]">Dipilih. Ketuk nomor tujuannya di kisi di atas.</span>}
                  {f.tahan && <span className="mt-0.5 block text-[11px] leading-snug text-[#3C4C68]">Menunggu diperiksa PML/admin; nomornya dipesan dulu, baru tercatat setelah diperiksa.</span>}
                </span>
              </button>
            );
          })}
          {bisaUbah && k.kosong.length > 0 && (
            <button type="button" onClick={() => void isi()} disabled={sibuk} className={TOMBOL_UTAMA}>
              {sibuk ? "Menyusun…" : "Isi nomor kosong otomatis"}
            </button>
          )}
        </div>
      )}

      {ModalKonfirmasi()}
      {LembarDetail()}
    </section>
  );
}
