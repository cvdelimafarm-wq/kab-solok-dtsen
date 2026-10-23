"use client";

import { use as usePromise, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LogoSigap from "@/app/components/LogoSigap";
import { keAtas } from "@/app/portal/navigasi";
import { bacaLihatSebagai } from "@/app/portal/sesi";
import { useDetak } from "../../useDetak";
import { labelFoto } from "@/lib/sigapLabelFoto";
import FotoKegiatan from "@/app/sigap/foto/FotoKegiatan";
import { LABEL_SUMBER, bandingkanOtomatis, type RealisasiOtomatis, type SumberOtomatis } from "@/lib/realisasiOtomatis";
import { bagianKurang, ringkasKurang, tautanWaIzinSusulan } from "@/lib/sigapKekurangan";
import { JENIS_PER_HARI, pilihanTanggalUnduh } from "@/lib/sigapUnduh";
import { adaTautanKerja, bacaTautanKerja, tanpaTautanKerja, type BagianKerja } from "@/lib/sigapTautanKerja";
import { alamatLembarUtama } from "@/lib/sigapSubPrioritas";
import { arahSapuan, geserTanggal, kelompokDariTanggal, nilaiHariArsip, tanggalAwalArsip, type NadaArsip } from "@/lib/sigapArsipTanggal";

// ------------------------------------------------------------------------
// (5 Okt 2026) SIGAP · Transport Lokal -- halaman petugas GENERIK utk semua kegiatan
// (mockup-sigap-alur-petugas disetujui user).
//  - Login pertama: panduan Langkah 1-5 (data diri -> hari kerja -> laporan -> 5 foto -> arsip).
//  - Sesudahnya beranda 3 tab: Hari Ini · Hari Kerja · Arsip Dokumen.
//  - Kegiatan, peran, tarif, periode & maks hari diatur admin anggaran / PJ kegiatan (halaman ini hanya membaca).
//  - Hari kerja direncanakan di awal, boleh diubah s.d. hari H; tanggal lewat terkunci.
//  - Laporan & 5 foto hanya pada hari kerja, hari itu juga s.d. 23:59 WIB (kecuali izin susulan admin).
//  - Kwitansi/Visum/Surat Pernyataan dihitung dari hari kerja; hari lampau yg tidak lengkap tidak dibayar.
// ------------------------------------------------------------------------

type Lokasi = { kecamatan: string; nagari: string; jorong: string; idsubsls?: string | null };
type Foto = { slot: number; url: string | null; susulan: boolean; diunggah_at: string };
type Hari = {
  tanggal: string;
  realisasi: { lokasi: Lokasi[]; jumlah_realisasi: number; kendala: string | null; diperbarui_at: string } | null;
  foto: Foto[];
  // (11 Okt 2026) saran isian laporan dari identifikasi (PML) / pendataan (PPL, korwil)
  otomatis?: RealisasiOtomatis | null;
  // (12 Okt 2026) hari lampau tanpa laporan manual tetapi ada hasil identifikasi/pendataan: laporan dianggap sudah selesai
  laporan_dianggap?: boolean;
  kunci: "hari_ini" | "izin" | "terlewat" | "akan_datang";
  lengkap: boolean;
  izin_sampai: string | null;
};
type Kelompok = { mulai: string; selesai: string; jumlah_hari: number; tanggal: string[]; nominal: number };
type Pen = {
  id: number;
  // (7 Okt 2026) jenis kegiatan & aturan isian (pelatihan: tanpa laporan)
  kegiatan: { id: number; kode: string; nama: string; kode_anggaran: string | null; satuan_realisasi: string; jenis?: string; wajib_laporan?: boolean; jumlah_foto?: number };
  peran: string;
  // (11 Okt 2026) satuan angka laporan menurut peran (PML Pascabencana = Sub SLS) dan sumber isian otomatis
  satuan_laporan?: string;
  sumber_otomatis?: SumberOtomatis | null;
  label_jabatan: string;
  tarif: number;
  maks_hari: number | null;
  periode: { mulai: string | null; selesai: string | null };
  surat_tugas: { nomor: string; tanggal_st: string | null; tujuan: string[]; ada_file: boolean } | null;
  dikunci_at: string | null;
  // (7 Okt 2026) portal satu login: arsip = baca-saja (tgl selesai + masa tenggang lewat)
  status_periode?: "belum_diatur" | "akan_datang" | "aktif" | "tenggang" | "arsip";
  ditutup_pada?: string | null;
  hari_kerja: string[];
  hari: Hari[];
  kelompok: Kelompok[];
  tanggal_kegiatan_lain: string[];
};
type Data = {
  akun: {
    nama: string;
    jenis: string;
    identitas: { label: string; nilai: string | null };
    alamat_kecamatan: string | null;
    onboarding_selesai: boolean;
    domisili: { lat: number; lng: number; sumber: string | null } | null;
    verifikasi: { at: string; jarak_m: number | null; alasan: string | null } | null;
  };
  hari_ini: string;
  penugasan: Pen[];
  lokasi_opsi: { wilayah_tim: (Lokasi & { sub_sls: string })[]; master: Lokasi[] };
  kecamatan_opsi: string[];
  /** (14 Okt 2026) nomor WhatsApp admin anggaran (62...) untuk tombol "Minta izin susulan"; null = tombol tidak tampil */
  wa_admin?: string | null;
};
type Tab = "hari_ini" | "hari_kerja" | "arsip";

// (14 Okt 2026) Tautan dalam dari pengingat/kartu Beranda: ?tab=&tgl=&fokus= membuka tab, hari, dan bagian (laporan/foto) yang kurang, lalu menyorotnya
// sebentar. Konteks ini dibaca kartu hari (sorot, tombol WhatsApp izin susulan) dan daftar hari kerja (hari yang dibuka otomatis).
type FokusKerja = { tgl: string | null; bagian: BagianKerja | null };
const FokusCtx = createContext<{ fokus: FokusKerja | null; bukaTgl: string | null; waAdmin: string | null; namaPetugas: string | null }>({ fokus: null, bukaTgl: null, waAdmin: null, namaPetugas: null });
const SOROT = "rounded-2xl ring-4 ring-[#F5B841] ring-offset-2 ring-offset-[#EEF2F8] transition";

const JUMLAH_FOTO = 5;
/** (14 Okt 2026) batas angka laporan per hari; sama dengan penolakan di server (api/sigap/translok POST realisasi). */
const MAKS_JUMLAH = 500;
/** (7 Okt 2026) jumlah foto & wajib laporan mengikuti pengaturan kegiatan. */
const nFoto = (pen: Pen) => pen.kegiatan.jumlah_foto ?? JUMLAH_FOTO;
const wajibLaporan = (pen: Pen) => pen.kegiatan.wajib_laporan !== false;
// (6 Okt 2026) Jenis foto baku urut perjalanan -- permintaan user. (8 Okt 2026) Keterangan mengikuti jenis kegiatan (pelatihan beda): lib/sigapLabelFoto.ts.
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const KUNCI_SESI = "sigap_token";
const NAVY = "#0F3D7A";

const judul = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const tglObj = (iso: string) => new Date(`${iso}T00:00:00Z`);
function tglPanjang(iso: string) {
  const d = tglObj(iso);
  return `${["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN_PANJANG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const tglPendek = (iso: string) => `${tglObj(iso).getUTCDate()} ${BULAN[tglObj(iso).getUTCMonth()]}`;
function rentangPendek(a: string, b: string) {
  if (a === b) return tglPendek(a);
  const da = tglObj(a);
  const db = tglObj(b);
  return da.getUTCMonth() === db.getUTCMonth() ? `${da.getUTCDate()}–${tglPendek(b)}` : `${tglPendek(a)} – ${tglPendek(b)}`;
}
const rupiah = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
function rentang(mulai: string, selesai: string): string[] {
  const out: string[] = [];
  const d = tglObj(mulai);
  const akhir = tglObj(selesai);
  while (d <= akhir && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function kecilkanFoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const skala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * skala);
    c.height = Math.round(bmp.height * skala);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function sisaWaktu(hariIni: string): string {
  const ms = Math.max(0, new Date(`${hariIni}T23:59:59+07:00`).getTime() - Date.now());
  const j = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${String(j).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function kirimJson(token: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/sigap/translok/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? "Gagal menyimpan.");
  return json;
}

// ======================================================================
export default function SigapPetugas({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  useDetak({ token }, "transport lokal"); // (6 Okt 2026) log login & durasi
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [penId, setPenId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("hari_ini");
  const [unduhFab, setUnduhFab] = useState(false); // (6 Okt 2026) pintasan Unduh SPJ (tombol melayang)
  const [langkah, setLangkah] = useState<number | null>(null); // null = panduan tidak tampil
  // (21 Okt 2026) Verifikasi lokasi di langkah 1 baru saja berhasil (data belum dimuat ulang): membuka bar langkah di bawah panduan
  const [verifLokal, setVerifLokal] = useState(false);
  const [, setDetik] = useState(0);
  // (14 Okt 2026) true hanya bila server menjawab 404 "Sesi tidak valid" (token tidak dikenal): hanya itu yang menawarkan "Masuk kembali".
  const [sesiTidakSah, setSesiTidakSah] = useState(false);
  // (14 Okt 2026) tautan dalam dari pengingat/kartu Beranda (?tab=&tgl=&fokus=), diterapkan sekali setelah data siap
  const [fokus, setFokus] = useState<FokusKerja | null>(null);
  const [bukaTgl, setBukaTgl] = useState<string | null>(null);
  const tautanDiterapkan = useRef(false);
  // (23 Okt 2026) panduan login pertama diputuskan SEKALI saat data pertama masuk (muat ulang sesudah menyimpan tidak boleh memunculkannya)
  const panduanDiputuskan = useRef(false);

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/sigap/translok/${token}`, { cache: "no-store" });
      // (14 Okt 2026) jawaban 502/HTML tidak lagi menjadi layar galat mentah: dibaca aman, lalu dibedakan menurut status
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSesiTidakSah(res.status === 404);
        throw new Error(json?.error ?? (res.status >= 500 ? "Server sedang sibuk. Coba lagi sebentar lagi." : "Gagal memuat."));
      }
      setData(json as Data);
      setLoadError(null);
      setSesiTidakSah(false);
      // (23 Okt 2026) Panduan login pertama TIDAK menelan tautan dalam: bila alamat membawa ?tab=/?tgl=/?fokus= (mis. tombol "Rapikan nomor foto"
      // di Kamera SIGAP), langsung buka tujuannya. Panduan tetap bisa dibuka lewat "Lihat panduan lagi" dan tampil lagi pada kunjungan biasa.
      if (!panduanDiputuskan.current) {
        panduanDiputuskan.current = true;
        let adaTautan = false;
        try {
          adaTautan = adaTautanKerja(window.location.search);
        } catch {
          /* abaikan */
        }
        if (!adaTautan && !(json as Data).akun.onboarding_selesai) setLangkah((l) => (l === null ? 1 : l));
      }
    } catch (e) {
      // gagal sambung (TypeError dari fetch) = jaringan, bukan sesi habis
      setLoadError(e instanceof TypeError ? "Koneksi terputus. Periksa sinyal, lalu coba lagi." : e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [token]);
  useEffect(() => {
    muat();
    const t = setInterval(() => setDetik((d) => d + 1), 30_000);
    return () => clearInterval(t);
  }, [muat]);

  // (10 Okt 2026) Tautan dari kartu/tombol membawa ?p=<penugasan_id> supaya halaman langsung membuka KEGIATAN YANG DIMAKSUD
  // -- permintaan user: "saat pilih hari kerja (Translok Pendataan), kenapa malah masuk ke transportasi pelatihan? padahal pelatihan sudah selesai".
  // Sebelumnya tautan hanya berisi token sehingga halaman memilih sendiri (penugasan pertama) -> sering jatuh ke Pelatihan yang sudah lewat.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("p");
      if (p && /^\d+$/.test(p)) setPenId(Number(p));
    } catch {
      /* abaikan */
    }
  }, []);

  // Kegiatan aktif: pilihan petugas (?p= atau tab); lalu kegiatan yg hari ini adalah hari kerjanya;
  // lalu kegiatan yang periodenya masih AKTIF (bukan masa tenggang/arsip); terakhir penugasan pertama.
  const pen = useMemo(() => {
    if (!data) return null;
    return (
      data.penugasan.find((p) => p.id === penId) ??
      data.penugasan.find((p) => p.hari_kerja.includes(data.hari_ini)) ??
      data.penugasan.find((p) => p.status_periode === "aktif") ??
      data.penugasan[0] ??
      null
    );
  }, [data, penId]);

  // (14 Okt 2026) Terapkan tautan dalam sekali, setelah data siap dan panduan login pertama tidak sedang tampil:
  // buka tab/hari yang dituju, sorot bagian yang kurang, lalu bersihkan alamat (muat ulang halaman = tampilan biasa).
  useEffect(() => {
    if (!data || !pen || langkah !== null || tautanDiterapkan.current) return;
    tautanDiterapkan.current = true;
    try {
      const f = bacaTautanKerja(window.location.search, pen.hari.map((h) => h.tanggal), data.hari_ini);
      if (!f) return;
      setTab(f.tab);
      setBukaTgl(f.tgl);
      if (f.tgl) setFokus({ tgl: f.tgl, bagian: f.fokus });
      window.history.replaceState(window.history.state, "", tanpaTautanKerja(window.location.pathname, window.location.search));
    } catch {
      /* abaikan */
    }
  }, [data, pen, langkah]);
  // gulir ke bagian yang dituju (setelah tab tampil), sorot beberapa detik
  useEffect(() => {
    if (!fokus?.tgl) return;
    const id = fokus.bagian ? `bag-${fokus.bagian}-${fokus.tgl}` : `hari-${fokus.tgl}`;
    const t1 = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    const t2 = setTimeout(() => setFokus(null), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fokus]);
  const ctxFokus = useMemo(() => ({ fokus, bukaTgl, waAdmin: data?.wa_admin ?? null, namaPetugas: data?.akun.nama ?? null }), [fokus, bukaTgl, data]);

  function keluar() {
    try {
      localStorage.removeItem(KUNCI_SESI);
      localStorage.removeItem("sigap_sesi");
      localStorage.removeItem("sigap_sesi_sampai");
    } catch {
      /* abaikan */
    }
    window.location.replace("/"); // (7 Okt 2026) portal satu login
  }

  // (14 Okt 2026) Layar galat penuh HANYA bila belum ada data sama sekali atau sesi memang tidak sah. Galat sementara sesudah data tampil
  // (mis. sinyal putus tepat setelah menyimpan) menjadi spanduk kecil di atas halaman -- halaman tidak lagi hilang.
  if (loadError && (!data || sesiTidakSah))
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#EEF2F8] px-6 text-center">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</p>
        {!sesiTidakSah && (
          <button type="button" onClick={() => { setLoadError(null); muat(); }} className="rounded-xl bg-[#0F3D7A] px-5 py-3 text-sm font-extrabold text-white">
            Coba lagi
          </button>
        )}
        {sesiTidakSah ? (
          <button type="button" onClick={keluar} className="text-sm font-bold text-[#0F3D7A] underline">
            Masuk kembali
          </button>
        ) : (
          <button type="button" onClick={() => window.location.replace("/")} className="text-sm font-bold text-[#0F3D7A] underline">
            Ke Beranda
          </button>
        )}
      </main>
    );
  if (!data || !pen)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#EEF2F8]">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#0F3D7A]/20 border-t-[#0F3D7A]" />
      </main>
    );

  const namaDepan = judul(data.akun.nama.split(/\s+/)[0] ?? data.akun.nama);

  // ---------------- PANDUAN LOGIN PERTAMA ----------------
  if (langkah !== null) {
    const JUDUL = ["Cek data diri & kegiatan", "Pilih hari kerja", wajibLaporan(pen) ? "Laporan harian" : "Tanpa laporan", `Dokumentasi ${nFoto(pen)} foto`, "Arsip dokumen SPJ"];
    const lanjut = () => setLangkah((l) => (l ?? 1) + 1);
    const selesai = async () => {
      try {
        await kirimJson(token, { aksi: "profil", selesai_onboarding: true });
      } catch {
        /* tetap lanjut */
      }
      setLangkah(null);
      setTab("hari_ini");
      muat();
    };
    // (21 Okt 2026) Bar di bawah panduan: loncat ke langkah mana pun. Langkah 2-5 terbuka setelah lokasi terverifikasi; akun super yang sedang "Lihat sebagai"
    // (mode simulasi, tidak ada yang tersimpan) boleh meloncat tanpa verifikasi.
    const bebasLoncat = !!data.akun.verifikasi || verifLokal || bacaLihatSebagai() !== null;
    const pilihLangkah = (n: number) => {
      setLangkah(n);
      window.scrollTo({ top: 0 });
    };
    return (
      <main className="min-h-screen bg-[#EEF2F8] pb-28 text-[#13213A]">
        <Header
          kecil={`Langkah ${langkah} dari 5`}
          judulBesar={langkah === 1 ? `Selamat datang, ${namaDepan}` : JUDUL[langkah - 1]}
          sub={langkah === 1 ? "Panduan singkat sebelum mulai bekerja" : `${pen.kegiatan.nama} · ${pen.peran.toUpperCase()}`}
          onKeluar={keluar}
        >
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= langkah ? "bg-[#F5B841]" : "bg-white/25"}`} />
            ))}
          </div>
        </Header>
        <div className="relative z-10 mx-auto -mt-7 max-w-lg space-y-3 px-4">
          {langkah === 1 && <LangkahDataDiri token={token} data={data} onLanjut={async () => { await muat(); lanjut(); }} onTerverifikasi={() => setVerifLokal(true)} />}
          {langkah === 2 && (
            <>
              <PilihKegiatan data={data} pen={pen} onPilih={setPenId} />
              <KalenderHariKerja key={pen.id} token={token} pen={pen} hariIni={data.hari_ini} onTersimpan={muat} />
              <TombolLangkah onKembali={() => setLangkah(1)} onLanjut={lanjut} teks="Lanjut →" />
            </>
          )}
          {langkah === 3 && (
            <>
              {wajibLaporan(pen) ? (
                <>
                  <InfoLangkah
                    ikon="📝"
                    judul="Laporan diisi setiap hari kerja"
                    isi={`Pada setiap hari kerja, periksa lokasi, jumlah ${pen.satuan_laporan ?? pen.kegiatan.satuan_realisasi} dan kendala${pen.sumber_otomatis ? ` (lokasi dan jumlah terisi otomatis dari ${LABEL_SUMBER[pen.sumber_otomatis]} Anda, boleh diubah)` : ""}, lalu tekan Konfirmasi & simpan laporan (isian otomatis baru berlaku setelah Anda konfirmasi). Laporan PDF dibuat otomatis dari isian ini. Batas pengisian 23:59 WIB di hari yang sama.`}
                  />
                  <IsianHariIni token={token} data={data} pen={pen} onBerubah={muat} hanya="laporan" />
                </>
              ) : (
                // (7 Okt 2026) kegiatan tanpa laporan (mis. pelatihan) -- permintaan user
                <InfoLangkah ikon="ℹ️" judul="Kegiatan ini tanpa laporan harian" isi={`Untuk ${pen.kegiatan.nama} cukup unggah ${nFoto(pen)} foto dokumentasi pada hari kegiatan, paling lambat 23:59 WIB.`} />
              )}
              <TombolLangkah onKembali={() => setLangkah(2)} onLanjut={lanjut} teks="Lanjut →" />
            </>
          )}
          {langkah === 4 && (
            <>
              <Peringatan />
              <IsianHariIni token={token} data={data} pen={pen} onBerubah={muat} hanya="foto" />
              <TombolLangkah onKembali={() => setLangkah(3)} onLanjut={lanjut} teks="Lanjut →" />
            </>
          )}
          {langkah === 5 && (
            <>
              <InfoLangkah
                ikon="📁"
                judul="Semua dokumen SPJ ada di Arsip"
                isi="Kwitansi, Visum dan Surat Pernyataan Kendaraan Dinas dibuat otomatis dari hari kerja Anda dan ikut berubah bila hari kerja diubah. Surat Tugas diunggah admin anggaran. Laporan & Dokumentasi berasal dari isian harian Anda."
              />
              <ArsipDokumen token={token} data={data} pen={pen} onBerubah={muat} ringkasSaja />
              <TombolLangkah onKembali={() => setLangkah(4)} onLanjut={selesai} teks="Selesai, mulai bekerja ✓" hijau />
            </>
          )}
        </div>
        <NavLangkah
          langkah={langkah}
          bebas={bebasLoncat}
          onPilih={pilihLangkah}
          item={[
            { ikon: "👤", label: "Data diri" },
            { ikon: "🗓", label: "Hari kerja" },
            { ikon: wajibLaporan(pen) ? "📝" : "ℹ️", label: wajibLaporan(pen) ? "Laporan" : "Info" },
            { ikon: "📷", label: "Foto" },
            { ikon: "📁", label: "Arsip" },
          ]}
        />
      </main>
    );
  }

  // ---------------- BERANDA (3 TAB) ----------------
  return (
    <FokusCtx.Provider value={ctxFokus}>
    <main className="min-h-screen bg-[#EEF2F8] pb-44 text-[#13213A]">
      <Header
        kecil={tab === "hari_ini" ? "SIGAP · Transport Lokal" : tab === "hari_kerja" ? "Hari Kerja" : "Arsip Dokumen"}
        judulBesar={tab === "hari_ini" ? `Halo, ${namaDepan}` : tab === "hari_kerja" ? "Rencana hari kerja" : "SPJ Transport Lokal"}
        sub={tglPanjang(data.hari_ini)}
        onKeluar={keluar}
      >
        {data.penugasan.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto rounded-xl bg-white/10 p-1">
            {data.penugasan.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPenId(p.id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-[12.5px] font-bold ${p.id === pen.id ? "bg-white text-[#0F3D7A]" : "text-blue-100"}`}
              >
                {p.kegiatan.nama}
                {p.hari_kerja.includes(data.hari_ini) ? " •" : ""}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[12.5px] text-blue-200">{pen.label_jabatan}</p>
      </Header>

      <div className="relative z-10 mx-auto -mt-7 max-w-lg space-y-3 px-4">
        {loadError && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-900">
            <span className="flex-1">{loadError} Yang tampil adalah data terakhir.</span>
            <button type="button" onClick={() => { setLoadError(null); muat(); }} className="shrink-0 rounded-lg bg-[#0F3D7A] px-3 py-1.5 text-[12.5px] font-extrabold text-white">
              Coba lagi
            </button>
          </div>
        )}
        {pen.status_periode === "arsip" && !pen.dikunci_at && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] font-semibold text-slate-700">
            Kegiatan ini sudah ditutup{pen.ditutup_pada ? ` sejak ${pen.ditutup_pada}` : ""} dan menjadi arsip baca-saja. Bila perlu koreksi, hubungi PJ kegiatan atau admin anggaran.
          </p>
        )}
        {pen.status_periode === "tenggang" && pen.ditutup_pada && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-900">
            Kegiatan sudah selesai. Isian masih bisa dilengkapi s.d. {pen.ditutup_pada}, sesudah itu menjadi arsip baca-saja.
          </p>
        )}
        {pen.dikunci_at && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-900">
            ✓ SPJ kegiatan ini sudah diverifikasi &amp; dikunci admin. Data tidak dapat diubah lagi.
          </p>
        )}
        {tab === "hari_ini" && (
          <>
            <Ringkasan pen={pen} />
            <IsianHariIni token={token} data={data} pen={pen} onBerubah={muat} />
          </>
        )}
        {tab === "hari_kerja" && (
          <>
            <KalenderHariKerja key={pen.id} token={token} pen={pen} hariIni={data.hari_ini} onTersimpan={muat} />
            <DaftarHari token={token} data={data} pen={pen} onBerubah={muat} />
          </>
        )}
        {tab === "arsip" && <ArsipDokumen token={token} data={data} pen={pen} onBerubah={muat} />}
        <button type="button" onClick={() => setLangkah(1)} className="block w-full pt-1 text-center text-[12px] font-semibold text-[#55657D] underline">
          Lihat panduan lagi
        </button>
      </div>

      {/* ===== (6 Okt 2026) Tombol melayang pintasan Unduh SPJ -- permintaan user ===== */}
      {!unduhFab && <TombolUnduhMelayang onKlik={() => setUnduhFab(true)} />}
      {unduhFab && <LembarUnduh pen={pen} hariIni={data.hari_ini} onTutup={() => setUnduhFab(false)} />}

      {/* ===== NAVIGASI BAWAH ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E3E8F0] bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-lg">
          {(
            [
              ["hari_ini", "🏠", "Hari Ini"],
              ["hari_kerja", "🗓", "Hari Kerja"],
              ["arsip", "📁", "Arsip"],
            ] as [Tab, string, string][]
          ).map(([k, ikon, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                window.scrollTo({ top: 0 });
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 border-t-[3px] pb-2.5 pt-2 text-[11.5px] font-bold ${tab === k ? "border-[#F5B841] text-[#0F3D7A]" : "border-transparent text-[#8592A8]"}`}
            >
              <span className="text-[18px] leading-none">{ikon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
    </FokusCtx.Provider>
  );
}

// ======================================================================
function Header({ kecil, judulBesar, sub, onKeluar, children }: { kecil: string; judulBesar: string; sub?: string; onKeluar: () => void; children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-[#0F3D7A] via-[#123B70] to-[#1E2A47] px-5 pb-12 pt-5 text-white">
      <div aria-hidden className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/5" />
      <div aria-hidden className="absolute -bottom-24 right-10 h-48 w-48 rounded-full bg-[#F5B841]/10" />
      <div className="relative mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-2">
          <LogoSigap ukuran={34} />
          <button type="button" onClick={onKeluar} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20">
            Keluar
          </button>
        </div>
        {/* (8 Okt 2026) tombol kembali bertingkat: naik satu layer (Layer 2 kegiatan / Beranda), tidak menumpuk riwayat */}
        <button type="button" onClick={() => keAtas(router)} className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-white/10 pl-2 pr-3.5 text-[12.5px] font-semibold text-blue-50 active:bg-white/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="m15 6-6 6 6 6" />
          </svg>
          Kembali
        </button>
        <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F5B841]">{kecil}</p>
        <h1 className="mt-1 text-[23px] font-extrabold leading-tight">{judulBesar}</h1>
        {sub && <p className="mt-0.5 text-[13.5px] text-blue-100">{sub}</p>}
        {children}
      </div>
    </header>
  );
}

function Peringatan() {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-2xl border-2 border-[#F59E0B] bg-[#FEF3E2] px-3.5 py-3 text-[#7A3E06]">
      <span aria-hidden className="mt-0.5 text-lg leading-none">⚠️</span>
      <p className="text-[12.5px] font-extrabold uppercase leading-snug tracking-wide">
        Upload dokumentasi wajib dilakukan segera per hari (s.d. 23:59 WIB). Dokumentasi yang terlewat tidak dapat diupload kembali.
      </p>
    </div>
  );
}

function InfoLangkah({ ikon, judul: j, isi }: { ikon: string; judul: string; isi: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-white p-4 shadow-md">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8EEF8] text-[22px]">{ikon}</span>
      <div>
        <p className="text-[15px] font-extrabold">{j}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#55657D]">{isi}</p>
      </div>
    </div>
  );
}

// (21 Okt 2026) Bar navigasi bawah panduan: pintasan ke tiap langkah, langkah terakhir = Arsip.
function NavLangkah({ langkah, item, bebas, onPilih }: { langkah: number; item: { ikon: string; label: string }[]; bebas: boolean; onPilih: (n: number) => void }) {
  return (
    <nav aria-label="Langkah panduan" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E3E8F0] bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {!bebas && <p className="bg-amber-50 px-3 py-1 text-center text-[11px] font-semibold text-amber-900">Verifikasi lokasi di langkah 1 dulu untuk membuka langkah lainnya.</p>}
      <div className="mx-auto flex max-w-lg">
        {item.map((it, idx) => {
          const n = idx + 1;
          const kunci = n > 1 && !bebas;
          return (
            <button
              key={n}
              type="button"
              disabled={kunci}
              aria-current={langkah === n ? "step" : undefined}
              onClick={() => onPilih(n)}
              className={`flex flex-1 flex-col items-center gap-0.5 border-t-[3px] pb-2.5 pt-2 text-[11px] font-bold disabled:opacity-40 ${langkah === n ? "border-[#F5B841] text-[#0F3D7A]" : "border-transparent text-[#8592A8]"}`}
            >
              <span className="text-[18px] leading-none">{kunci ? "🔒" : it.ikon}</span>
              {it.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TombolLangkah({ onKembali, onLanjut, teks, hijau }: { onKembali: () => void; onLanjut: () => void; teks: string; hijau?: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="button" onClick={onKembali} className="rounded-xl border border-[#C9D6EA] bg-white px-4 py-3.5 text-[14px] font-bold text-[#0F3D7A]">
        ← Kembali
      </button>
      <button type="button" onClick={onLanjut} className={`flex-1 rounded-xl py-3.5 text-[15px] font-extrabold text-white shadow ${hijau ? "bg-[#1E7A4C]" : "bg-[#0F3D7A]"}`}>
        {teks}
      </button>
    </div>
  );
}

function PilihKegiatan({ data, pen, onPilih }: { data: Data; pen: Pen; onPilih: (id: number) => void }) {
  if (data.penugasan.length < 2) return null;
  return (
    <div className="rounded-2xl bg-white p-1 shadow-md">
      <div className="flex gap-1 overflow-x-auto">
        {data.penugasan.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPilih(p.id)}
            className={`shrink-0 flex-1 rounded-xl px-3 py-2.5 text-[12.5px] font-bold ${p.id === pen.id ? "bg-[#0F3D7A] text-white" : "text-slate-600"}`}
          >
            {p.kegiatan.nama}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Langkah 1 ----------------
function LangkahDataDiri({ token, data, onLanjut, onTerverifikasi }: { token: string; data: Data; onLanjut: () => Promise<void>; onTerverifikasi?: () => void }) {
  // (6 Okt 2026) Tempat tinggal TIDAK diisi ulang -- permintaan user: kecamatan & koordinat diambil dari master,
  // ditampilkan, lalu diverifikasi dgn lokasi HP saat ini. Selisih > 5 km -> alasan wajib.
  const dom = data.akun.domisili;
  const sudah = data.akun.verifikasi;
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; akurasi: number } | null>(null);
  const [gpsGagal, setGpsGagal] = useState<string | null>(null);
  const [jarak, setJarak] = useState<number | null>(sudah?.jarak_m ?? null);
  const [perluAlasan, setPerluAlasan] = useState(false);
  const [alasan, setAlasan] = useState(sudah?.alasan ?? "");
  const [ok, setOk] = useState(!!sudah);
  useEffect(() => {
    if (ok) onTerverifikasi?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  async function kirim(lokasi: { lat: number; lng: number; akurasi: number } | null, teksAlasan: string) {
    setBusy(true);
    setGalat(null);
    try {
      const res = await fetch(`/api/sigap/translok/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "verifikasi_domisili", ...(lokasi ?? {}), alasan: teksAlasan }),
      });
      const json = await res.json().catch(() => ({}));
      if (typeof json?.jarak_m === "number") setJarak(json.jarak_m);
      if (!res.ok) {
        if (json?.perlu_alasan) setPerluAlasan(true);
        throw new Error(json?.error ?? "Gagal menyimpan.");
      }
      setOk(true);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  function ambilLokasi() {
    setGalat(null);
    setGpsGagal(null);
    if (!("geolocation" in navigator)) {
      setGpsGagal("Perangkat tidak mendukung GPS.");
      setPerluAlasan(true);
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const l = { lat: pos.coords.latitude, lng: pos.coords.longitude, akurasi: Math.round(pos.coords.accuracy) };
        setGps(l);
        setBusy(false);
        kirim(l, alasan);
      },
      (err) => {
        setBusy(false);
        setGpsGagal(err.code === 1 ? "Izin lokasi ditolak. Izinkan lokasi di browser, lalu coba lagi." : "Lokasi tidak terbaca. Pastikan GPS aktif, lalu coba lagi.");
        setPerluAlasan(true);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  const km = jarak != null ? (jarak / 1000).toFixed(jarak < 10000 ? 1 : 0) : null;
  const jauh = jarak != null && jarak > 5000;
  const peta = dom
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${dom.lng - 0.01}%2C${dom.lat - 0.007}%2C${dom.lng + 0.01}%2C${dom.lat + 0.007}&layer=mapnik&marker=${dom.lat}%2C${dom.lng}`
    : null;

  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-md">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#6B7890]">Nama</p>
            <p className="text-[14px] font-extrabold">{data.akun.nama}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#6B7890]">{data.akun.identitas.label}</p>
            <p className="text-[14px] font-extrabold">{data.akun.identitas.nilai ?? "–"}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-bold text-[#6B7890]">Tempat tinggal terdaftar (tempat kedudukan)</p>
        <p className="text-[14px] font-extrabold">Kecamatan {data.akun.alamat_kecamatan ? judul(data.akun.alamat_kecamatan) : "–"}</p>
        {dom ? (
          <>
            <div className="mt-2 overflow-hidden rounded-xl border border-[#E3E8F0]">
              <iframe title="Peta tempat tinggal" src={peta as string} className="h-44 w-full" loading="lazy" />
            </div>
            <p className="mt-1 text-[11px] text-[#6B7890]">
              Koordinat {dom.lat.toFixed(5)}, {dom.lng.toFixed(5)}
              {dom.sumber ? ` · sumber: ${dom.sumber}` : ""} ·{" "}
              <a href={`https://www.google.com/maps?q=${dom.lat},${dom.lng}`} target="_blank" rel="noreferrer" className="font-semibold text-[#0F3D7A] underline">
                buka di Maps
              </a>
            </p>
          </>
        ) : (
          <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">Koordinat tempat tinggal belum ada di data. Lokasi HP Anda saat verifikasi akan dicatat sebagai tempat tinggal.</p>
        )}
        <p className="mt-1 text-[11.5px] text-[#6B7890]">Dipakai di Visum &amp; Surat Pernyataan Kendaraan Dinas. Bila data salah, hubungi admin anggaran.</p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-[14px] font-extrabold">Verifikasi lokasi</p>
        <p className="text-[12px] text-[#55657D]">Lakukan dari rumah. Lokasi HP dibandingkan dengan tempat tinggal terdaftar; bila berjarak lebih dari 5 km, tuliskan alasannya.</p>
        {ok && !galat ? (
          <p className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${jauh ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
            ✓ Terverifikasi{km != null ? ` · jarak ${km} km dari tempat tinggal terdaftar` : " · tanpa lokasi HP"}
            {jauh || jarak == null ? " · alasan tercatat" : ""}
          </p>
        ) : (
          <button type="button" disabled={busy} onClick={ambilLokasi} className="mt-2 w-full rounded-xl border-2 border-[#0F3D7A] bg-white py-2.5 text-[14px] font-extrabold text-[#0F3D7A] disabled:opacity-50">
            {busy ? "Membaca lokasi…" : "📍 Verifikasi dengan lokasi saya sekarang"}
          </button>
        )}
        {gps && km != null && !ok && <p className="mt-1.5 text-[12px] text-[#55657D]">Lokasi HP ±{gps.akurasi} m · jarak {km} km dari tempat tinggal terdaftar.</p>}
        {gpsGagal && <p className="mt-1.5 text-[12px] font-semibold text-red-700">⚠ {gpsGagal}</p>}
        {perluAlasan && !ok && (
          <div className="mt-2">
            <p className="text-[12px] font-bold text-red-800">{gpsGagal ? "Alasan lokasi tidak terbaca (wajib)" : `Alasan jarak ${km ?? "?"} km dari tempat tinggal (wajib)`}</p>
            <textarea
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={2}
              placeholder="Mis. sedang menginap di rumah orang tua; pindah domisili ke Nagari …"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-[13.5px] outline-none focus:border-[#0F3D7A]"
            />
            <button type="button" disabled={busy || alasan.trim().length < 5} onClick={() => kirim(gps, alasan)} className="mt-1.5 w-full rounded-xl bg-[#0F3D7A] py-2.5 text-[13.5px] font-extrabold text-white disabled:opacity-40">
              Kirim alasan
            </button>
          </div>
        )}
        {galat && !perluAlasan && <p className="mt-1.5 text-[12px] font-semibold text-red-700">⚠ {galat}</p>}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-[12px] font-bold text-[#6B7890]">Kegiatan yang ditugaskan kepada Anda</p>
        <div className="mt-1 divide-y divide-[#EEF1F5]">
          {data.penugasan.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8EEF8] text-[16px]">🗂</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-extrabold">{p.kegiatan.nama}</p>
                <p className="text-[11.5px] text-[#6B7890]">
                  {p.peran.toUpperCase()} · {p.periode.mulai && p.periode.selesai ? rentangPendek(p.periode.mulai, p.periode.selesai) : "periode belum ditetapkan"} ·{" "}
                  {p.maks_hari ? `maks ${p.maks_hari} hari` : "maks hari belum ditetapkan"} · {rupiah(p.tarif)}/hari
                </p>
                {p.surat_tugas && (
                  <p className="text-[11.5px] text-[#55657D]">
                    ST {p.surat_tugas.nomor} · Tujuan: {p.surat_tugas.tujuan.map(judul).join(", ") || "–"}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${p.surat_tugas ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {p.surat_tugas ? (p.surat_tugas.ada_file ? "ST ✓" : "ST (file menyusul)") : "ST menunggu"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11.5px] text-[#6B7890]">Diatur oleh admin anggaran / PJ kegiatan. Satu tanggal hanya untuk satu kegiatan.</p>
      </section>
      <button type="button" disabled={busy || !ok} onClick={() => onLanjut()} className="w-full rounded-xl bg-[#0F3D7A] py-3.5 text-[15px] font-extrabold text-white shadow disabled:opacity-50">
        {ok ? "Data sudah benar, lanjut →" : "Verifikasi lokasi dulu untuk lanjut"}
      </button>
    </>
  );
}

// ---------------- Ringkasan ----------------
// (10 Okt 2026) Kolom "Estimasi diterima" (nominal & "N hari sudah pasti") DIHAPUS dari ringkasan -- permintaan user. Ringkasan kini 2 kolom: Hari kerja & Hari lengkap.
function Ringkasan({ pen }: { pen: Pen }) {
  const lengkap = pen.hari.filter((h) => h.lengkap).length;
  return (
    <div className="grid grid-cols-2 rounded-2xl bg-white px-1 py-3.5 shadow-md">
      <div className="flex flex-col items-center border-r border-[#E4E9F0]">
        <span className="text-[10.5px] font-semibold text-[#55657D]">Hari kerja</span>
        <span className="text-[17px] font-extrabold">
          {pen.hari_kerja.length}
          {pen.maks_hari ? <span className="text-[12px] font-bold text-[#8592A8]">/{pen.maks_hari}</span> : null}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10.5px] font-semibold text-[#55657D]">Hari lengkap</span>
        <span className="text-[17px] font-extrabold">{lengkap}</span>
      </div>
    </div>
  );
}

// ---------------- Kalender hari kerja ----------------
function KalenderHariKerja({ token, pen, hariIni, onTersimpan }: { token: string; pen: Pen; hariIni: string; onTersimpan: () => Promise<void> }) {
  const [pilih, setPilih] = useState<Set<string>>(new Set(pen.hari_kerja));
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; ok: boolean } | null>(null);
  // (21 Okt 2026) Mode edit: sudah punya hari kerja -> kalender dikunci (hanya baca) sampai petugas menekan "Edit hari kerja"; belum punya -> langsung terbuka.
  const [edit, setEdit] = useState(pen.hari_kerja.length === 0);
  useEffect(() => setPilih(new Set(pen.hari_kerja)), [pen.hari_kerja]);

  if (!pen.periode.mulai || !pen.periode.selesai)
    return (
      <div className="rounded-2xl border-2 border-dashed border-[#C9D6EA] bg-white px-4 py-5 text-center shadow-sm">
        <p className="text-[15px] font-extrabold">Periode kegiatan belum ditetapkan</p>
        <p className="mt-1 text-[12.5px] text-[#55657D]">Admin anggaran / PJ kegiatan belum mengisi periode {pen.kegiatan.nama}. Hari kerja bisa dipilih setelah periode diisi.</p>
      </div>
    );

  const semua = rentang(pen.periode.mulai, pen.periode.selesai);
  const terisi = new Set(pen.hari.filter((h) => h.realisasi || h.foto.length > 0).map((h) => h.tanggal));
  const lengkapSet = new Set(pen.hari.filter((h) => h.lengkap).map((h) => h.tanggal));
  const lain = new Set(pen.tanggal_kegiatan_lain);
  const penuh = !!pen.maks_hari && pilih.size >= pen.maks_hari;
  const berubah = pilih.size !== pen.hari_kerja.length || pen.hari_kerja.some((t) => !pilih.has(t));
  const terkunci = !!pen.dikunci_at || pen.status_periode === "arsip";

  // Kelompokkan per bulan.
  const perBulan = new Map<string, string[]>();
  for (const t of semua) {
    const k = t.slice(0, 7);
    perBulan.set(k, [...(perBulan.get(k) ?? []), t]);
  }
  const kelompokPilihan = (() => {
    const urut = Array.from(pilih).sort();
    const out: { mulai: string; selesai: string; n: number }[] = [];
    for (const t of urut) {
      const a = out[out.length - 1];
      const d = tglObj(a?.selesai ?? "1970-01-01");
      d.setUTCDate(d.getUTCDate() + 1);
      if (a && d.toISOString().slice(0, 10) === t) {
        a.selesai = t;
        a.n += 1;
      } else out.push({ mulai: t, selesai: t, n: 1 });
    }
    return out;
  })();

  // (21 Okt 2026) Rincian ringkasan: terlewat = hari dipilih yang sudah lewat dan tidak lengkap (tidak dibayar; izin susulan masih dihitung potensi);
  // realisasi = hari dipilih yang lengkap; potensi = hari dipilih yang belum lengkap tetapi masih bisa dilengkapi (hari ini, mendatang, atau izin susulan).
  const izinSet = new Set(pen.hari.filter((h) => h.kunci === "izin").map((h) => h.tanggal));
  const nRealisasi = Array.from(pilih).filter((t) => lengkapSet.has(t)).length;
  const nTerlewat = Array.from(pilih).filter((t) => !lengkapSet.has(t) && t < hariIni && !izinSet.has(t)).length;
  const nPotensi = pilih.size - nRealisasi - nTerlewat;
  // Hari lewat yang masih dipilih dan TERLEWAT (belum lengkap = tidak dibayar, tidak sedang izin susulan) boleh dilepas dalam mode edit, walau isiannya baru sebagian
  // (21 Okt 2026, permintaan user: SPDT NTP juga). Isian sebagian tetap tersimpan; hanya hari kerjanya yang dilepas. Hari lengkap (dibayar) tetap terkunci.
  const bisaDilepasLewat = (t: string) => t < hariIni && pilih.has(t) && !lengkapSet.has(t) && !pen.hari.some((h) => h.tanggal === t && h.kunci === "izin");
  const bukaEdit = !terkunci && edit;

  function batalEdit() {
    setPilih(new Set(pen.hari_kerja));
    setPesan(null);
    setEdit(pen.hari_kerja.length === 0);
  }

  function ketuk(t: string) {
    if (terkunci || !edit || lain.has(t)) return;
    if (t < hariIni && !bisaDilepasLewat(t)) return;
    setPesan(null);
    setPilih((s) => {
      const n = new Set(s);
      if (n.has(t)) {
        if (terisi.has(t) && t >= hariIni) {
          setPesan({ teks: "Tanggal ini sudah berisi laporan/foto, tidak bisa dilepas.", ok: false });
          return s;
        }
        n.delete(t);
      } else {
        if (pen.maks_hari && n.size >= pen.maks_hari) {
          setPesan({ teks: `Kuota penuh: maksimal ${pen.maks_hari} hari.`, ok: false });
          return s;
        }
        n.add(t);
      }
      return n;
    });
  }

  async function simpan() {
    setBusy(true);
    setPesan(null);
    try {
      await kirimJson(token, { aksi: "hari_kerja", penugasan_id: pen.id, tanggal: Array.from(pilih) });
      await onTersimpan();
      setPesan({ teks: "Rencana hari kerja tersimpan. Kwitansi, Visum & Surat Pernyataan ikut diperbarui.", ok: true });
      setEdit(false);
    } catch (e) {
      setPesan({ teks: e instanceof Error ? e.message : "Gagal menyimpan.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold">Pilih hari kerja</p>
          <p className="text-[11.5px] text-[#6B7890]">Periode {rentangPendek(pen.periode.mulai, pen.periode.selesai)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${penuh ? "bg-emerald-50 text-emerald-800" : "bg-[#E8EEF8] text-[#0F3D7A]"}`}>
          {pilih.size}
          {pen.maks_hari ? ` / maks ${pen.maks_hari}` : ""} hari
        </span>
      </div>
      {!terkunci && !edit && (
        <button type="button" onClick={() => { setPesan(null); setEdit(true); }} className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[#0F3D7A] bg-white text-[14px] font-extrabold text-[#0F3D7A]">
          <span aria-hidden="true">✎</span> Edit hari kerja
        </button>
      )}
      {bukaEdit && pen.hari_kerja.length > 0 && (
        <p className="mt-2.5 rounded-xl bg-[#FFF6DD] px-3 py-2 text-[11.5px] leading-snug text-[#6B4A00]">
          Mode edit. Ketuk tanggal untuk memilih atau melepas. Hari terlewat yang belum lengkap (bingkai merah) boleh dilepas agar kuota kembali; isian sebagian tetap tersimpan tetapi tidak dibayar. Hari yang sudah lengkap tetap terkunci.
        </p>
      )}

      {Array.from(perBulan.entries()).map(([bulan, tgl]) => {
        const awal = tglObj(tgl[0]);
        const kosong = (awal.getUTCDay() + 6) % 7; // Senin = kolom pertama
        return (
          <div key={bulan} className="mt-3">
            <p className="mb-1.5 text-[13px] font-extrabold">
              {BULAN_PANJANG[awal.getUTCMonth()]} {awal.getUTCFullYear()}
            </p>
            <div className="grid grid-cols-7 gap-1 text-center">
              {["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"].map((h) => (
                <span key={h} className="text-[10px] font-bold text-[#8592A8]">
                  {h}
                </span>
              ))}
              {Array.from({ length: kosong }).map((_, i) => (
                <span key={`k${i}`} />
              ))}
              {tgl.map((t) => {
                const dipilih = pilih.has(t);
                const lewat = t < hariIni;
                const dipakaiLain = lain.has(t);
                const lepasLewat = bukaEdit && bisaDilepasLewat(t);
                let cls = "bg-[#F4F6FA] text-[#13213A]";
                if (dipakaiLain) cls = "bg-[#EEF1F5] text-[#B8C0CE] line-through";
                else if (dipilih && lengkapSet.has(t)) cls = "bg-[#1E7A4C] text-white";
                else if (dipilih && lewat) cls = "bg-red-100 text-red-800";
                else if (dipilih) cls = "bg-[#0F3D7A] text-white";
                else if (lewat) cls = "bg-transparent text-[#C3CAD6]";
                else if (penuh) cls = "bg-[#F4F6FA] text-[#B8C0CE]";
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={terkunci || !edit || dipakaiLain || (lewat && !lepasLewat)}
                    onClick={() => ketuk(t)}
                    className={`rounded-lg py-2 text-[13px] font-bold transition ${cls} ${t === hariIni ? "ring-2 ring-[#F5B841] ring-offset-1" : ""} ${lepasLewat ? "ring-2 ring-red-500" : ""}`}
                    title={dipakaiLain ? "Dipakai kegiatan lain" : lepasLewat ? "Hari terlewat (belum lengkap): ketuk untuk melepas" : undefined}
                  >
                    {tglObj(t).getUTCDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-[#6B7890]">
        <span className="font-bold text-[#0F3D7A]">■</span> dipilih · <span className="font-bold text-[#1E7A4C]">■</span> lengkap ·{" "}
        <span className="font-bold text-red-700">■</span> terlewat (tidak dibayar) · bingkai emas = hari ini · coret = kegiatan lain. Tanggal lewat terkunci, kecuali hari terlewat yang belum lengkap bisa dilepas lewat Edit hari kerja.
      </p>

      {kelompokPilihan.length > 0 && (
        <div className="mt-3 rounded-xl bg-[#F6F8FB] p-3">
          <p className="text-[11.5px] font-bold text-[#6B7890]">Kelompok tanggal (dasar Kwitansi, Visum &amp; Surat Pernyataan)</p>
          <ul className="mt-1 space-y-0.5 text-[13px]">
            {kelompokPilihan.map((k) => (
              <li key={k.mulai} className="flex justify-between">
                <span>• {rentangPendek(k.mulai, k.selesai)}</span>
                <span className="font-semibold text-[#55657D]">{k.n} hari</span>
              </li>
            ))}
          </ul>
          <dl className="mt-1.5 space-y-1 border-t border-[#E3E8F0] pt-1.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-[#55657D]">Jumlah hari kerja</dt>
              <dd className="font-semibold">{pilih.size} hari</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-red-700">Jumlah terlewat (tidak dibayar)</dt>
              <dd className="font-semibold text-red-700">{nTerlewat} hari</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#1E7A4C]">Jumlah realisasi (lengkap)</dt>
              <dd className="font-semibold text-[#1E7A4C]">{nRealisasi} hari · {rupiah(nRealisasi * pen.tarif)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#0F3D7A]">Jumlah potensi (belum lengkap)</dt>
              <dd className="font-semibold text-[#0F3D7A]">{nPotensi} hari · {rupiah(nPotensi * pen.tarif)}</dd>
            </div>
            <div className="flex justify-between border-t border-[#E3E8F0] pt-1.5">
              <dt className="font-bold text-[#13213A]">
                Total (realisasi + potensi)
                <span className="block text-[11px] font-normal text-[#6B7890]">{nRealisasi + nPotensi} hari × {rupiah(pen.tarif)}</span>
              </dt>
              <dd className="font-extrabold">{rupiah((nRealisasi + nPotensi) * pen.tarif)}</dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[10.5px] text-[#8592A8]">Estimasi. Hanya hari dengan {wajibLaporan(pen) ? "laporan + " : ""}{nFoto(pen)} foto lengkap yang dibayar.</p>
        </div>
      )}

      {pesan && <p className={`mt-2 text-[12.5px] font-semibold ${pesan.ok ? "text-emerald-700" : "text-red-700"}`}>{pesan.ok ? "✓ " : "⚠ "}{pesan.teks}</p>}
      {bukaEdit && (
        <div className="mt-3 flex gap-2">
          {pen.hari_kerja.length > 0 && (
            <button type="button" disabled={busy} onClick={batalEdit} className="min-h-[48px] flex-1 rounded-xl border border-[#C9D6EA] bg-white text-[14px] font-extrabold text-[#55657D] disabled:opacity-40">
              Batal
            </button>
          )}
          <button type="button" disabled={busy || !berubah} onClick={simpan} className="min-h-[48px] flex-[2] rounded-xl bg-[#0F3D7A] py-3 text-[14.5px] font-extrabold text-white shadow disabled:opacity-40">
            {busy ? "Menyimpan…" : berubah ? "Simpan rencana hari kerja" : "Tersimpan ✓"}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------- Isian hari ini (laporan + foto) ----------------
function IsianHariIni({ token, data, pen, onBerubah, hanya }: { token: string; data: Data; pen: Pen; onBerubah: () => Promise<void>; hanya?: "laporan" | "foto" }) {
  const hari = pen.hari.find((h) => h.tanggal === data.hari_ini) ?? null;
  const izin = pen.hari.filter((h) => h.kunci === "izin");
  const berikut = pen.hari_kerja.find((t) => t > data.hari_ini);
  if (!hari)
    return (
      <>
        <div className="rounded-2xl bg-white px-4 py-5 text-center shadow-sm">
          <p className="text-[28px]">🗓</p>
          <p className="text-[15px] font-extrabold">Hari ini bukan hari kerja {pen.kegiatan.nama}</p>
          <p className="mt-1 text-[12.5px] text-[#55657D]">
            {berikut ? `Hari kerja berikutnya: ${tglPanjang(berikut)}.` : "Belum ada hari kerja berikutnya. Atur di menu Hari Kerja."} Laporan &amp; foto diisi pada hari kerja itu sendiri.
          </p>
        </div>
        {izin.map((h) => (
          <KartuHari key={h.tanggal} token={token} data={data} pen={pen} hari={h} onBerubah={onBerubah} hanya={hanya} />
        ))}
      </>
    );
  return (
    <>
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-[11px] font-bold text-[#6B7890]">Sisa waktu upload hari ini</p>
          <p className="text-[12px] text-[#55657D]">batas 23:59 WIB</p>
        </div>
        <p className="text-[26px] font-extrabold tabular-nums text-[#A3261B]">{sisaWaktu(data.hari_ini)}</p>
      </div>
      <KartuHari token={token} data={data} pen={pen} hari={hari} onBerubah={onBerubah} hanya={hanya} />
      {izin.map((h) => (
        <KartuHari key={h.tanggal} token={token} data={data} pen={pen} hari={h} onBerubah={onBerubah} hanya={hanya} />
      ))}
    </>
  );
}

function KartuHari({ token, data, pen, hari, onBerubah, hanya }: { token: string; data: Data; pen: Pen; hari: Hari; onBerubah: () => Promise<void>; hanya?: "laporan" | "foto" }) {
  const boleh = !pen.dikunci_at && pen.status_periode !== "arsip" && (hari.kunci === "hari_ini" || hari.kunci === "izin");
  const { fokus, waAdmin, namaPetugas } = useContext(FokusCtx);
  const sorotLaporan = fokus?.tgl === hari.tanggal && fokus.bagian === "laporan";
  const sorotFoto = fokus?.tgl === hari.tanggal && fokus.bagian === "foto";
  // (14 Okt 2026) tombol WhatsApp ke admin dengan teks izin susulan terisi (hanya bila nomor admin diatur di server)
  const linkIzin =
    waAdmin && hari.kunci === "terlewat" && !hari.lengkap
      ? tautanWaIzinSusulan(waAdmin, {
          namaPetugas,
          namaKegiatan: pen.kegiatan.nama,
          tanggal: hari.tanggal,
          kurang: ringkasKurang(
            bagianKurang({ laporan: !!hari.realisasi, slot: hari.foto.map((f) => f.slot), dianggap: !!hari.laporan_dianggap }, { jenis: "pendataan", wajib_laporan: wajibLaporan(pen), jumlah_foto: nFoto(pen) }),
            { jenis: "pendataan", wajib_laporan: wajibLaporan(pen), jumlah_foto: nFoto(pen) }
          ),
        })
      : null;
  return (
    <>
      {hari.kunci !== "hari_ini" && (
        <div className="px-1 pt-1">
          <p className="text-[16px] font-extrabold">{tglPanjang(hari.tanggal)}</p>
          {hari.kunci === "izin" && hari.izin_sampai && (
            <p className="text-[12.5px] font-semibold text-violet-700">
              Izin upload susulan dari admin s.d.{" "}
              {new Date(hari.izin_sampai).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} WIB
            </p>
          )}
        </div>
      )}
      {hari.kunci === "terlewat" && !hari.lengkap && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <p className="text-[14px] font-extrabold">🔒 Batas waktu tanggal ini sudah lewat</p>
          <p className="mt-0.5 text-[12.5px]">Laporan dan dokumentasi tidak dapat diisi lagi, dan hari ini tidak masuk Kwitansi. Bila ada alasan kuat, hubungi admin anggaran untuk izin susulan.</p>
          {linkIzin && (
            <a href={linkIzin} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#1E7A4C] px-4 text-[13.5px] font-extrabold text-white">
              Minta izin susulan ke admin (WhatsApp)
            </a>
          )}
        </div>
      )}
      {hanya !== "foto" && wajibLaporan(pen) && hari.laporan_dianggap && hari.otomatis && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <p className="text-[14px] font-extrabold">✓ Laporan dianggap sudah selesai</p>
          <p className="mt-0.5 text-[12.5px]">
            Anda tidak mengisi laporan manual, tetapi ada {hari.otomatis.jumlah} {hari.otomatis.satuan} dari {LABEL_SUMBER[hari.otomatis.sumber]} Anda pada tanggal ini di {hari.otomatis.lokasi.length} jorong, sehingga laporan dihitung sudah dibuat. Tinggal pastikan dokumentasi foto lengkap.
          </p>
        </div>
      )}
      {hanya !== "foto" && wajibLaporan(pen) && (
        <div id={`bag-laporan-${hari.tanggal}`} className={sorotLaporan ? SOROT : undefined}>
          <FormRealisasi key={`r-${pen.id}-${hari.tanggal}`} token={token} pen={pen} hari={hari} boleh={boleh} opsi={data.lokasi_opsi} onTersimpan={onBerubah} />
        </div>
      )}
      {hanya !== "laporan" && (
        <div id={`bag-foto-${hari.tanggal}`} className={sorotFoto ? SOROT : undefined}>
          <FotoKegiatan kegiatanId={pen.kegiatan.id} susulan={hari.kunci === "izin"} lampau={hari.kunci === "terlewat"} tanggal={hari.tanggal} jenis={pen.kegiatan.jenis ?? null} onBerubah={onBerubah} fallback={<PanelFoto key={`f-${pen.id}-${hari.tanggal}`} token={token} pen={pen} hari={hari} boleh={boleh} onBerubah={onBerubah} />} />
        </div>
      )}
    </>
  );
}

// ---------------- Daftar hari kerja (tab Hari Kerja) ----------------
function DaftarHari({ token, data, pen, onBerubah }: { token: string; data: Data; pen: Pen; onBerubah: () => Promise<void> }) {
  // (14 Okt 2026) hari yang dituju tautan dalam (mis. dari pengingat "13 Okt belum lengkap") terbuka otomatis dan disorot
  const { bukaTgl, fokus } = useContext(FokusCtx);
  const [buka, setBuka] = useState<string | null>(bukaTgl);
  useEffect(() => {
    if (bukaTgl) setBuka(bukaTgl);
  }, [bukaTgl]);
  if (pen.hari.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-[15px] font-extrabold">Status per hari kerja</p>
      <div className="mt-1 divide-y divide-[#EEF1F5]">
        {pen.hari.map((h) => {
          const status = h.lengkap
            ? { t: "Lengkap ✓", c: "bg-emerald-50 text-emerald-800" }
            : h.kunci === "terlewat"
            ? { t: "Terlewat", c: "bg-red-50 text-red-800" }
            : h.kunci === "akan_datang"
            ? { t: "Rencana", c: "bg-slate-100 text-slate-600" }
            : { t: `${wajibLaporan(pen) ? `${h.realisasi || h.laporan_dianggap ? "Laporan ✓" : "Laporan –"} · ` : ""}${h.foto.length}/${nFoto(pen)} foto`, c: "bg-amber-50 text-amber-800" };
          const d = tglObj(h.tanggal);
          return (
            <div key={h.tanggal} id={`hari-${h.tanggal}`} className={fokus?.tgl === h.tanggal && !fokus.bagian ? SOROT : undefined}>
              <button type="button" onClick={() => setBuka((b) => (b === h.tanggal ? null : h.tanggal))} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="w-11 shrink-0 text-center">
                  <span className="block text-[10px] font-bold text-[#8592A8]">{HARI[d.getUTCDay()]}</span>
                  <span className="block text-[17px] font-extrabold leading-tight">{d.getUTCDate()}</span>
                </span>
                <span className="flex-1 text-[12.5px] text-[#55657D]">
                  {h.realisasi ? `${h.realisasi.jumlah_realisasi} ${pen.satuan_laporan ?? pen.kegiatan.satuan_realisasi} · ${h.realisasi.lokasi.map((l) => judul(l.jorong)).join(", ")}` : h.otomatis && wajibLaporan(pen) ? `${h.otomatis.jumlah} ${h.otomatis.satuan} dari ${LABEL_SUMBER[h.otomatis.sumber]} · ${h.laporan_dianggap ? "laporan dianggap selesai" : "belum disimpan"}` : BULAN_PANJANG[d.getUTCMonth()]}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${status.c}`}>{status.t}</span>
              </button>
              {buka === h.tanggal && h.kunci !== "akan_datang" && (
                <div className="space-y-3 pb-3">
                  <KartuHari token={token} data={data} pen={pen} hari={h} onBerubah={onBerubah} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- (23 Okt 2026) Arsip PER TANGGAL (tab Arsip) ----------------
// Satu kartu: deretan tanggal yang bisa digeser (usap kiri/kanan, tombol ‹ ›, atau ketuk tanggal), status tiap jenis dokumen pada tanggal itu,
// unduh khusus tanggal itu, dan "Lengkapi / perbaiki" (laporan + nomor foto) bila masih diizinkan. Hari lampau yang terkunci menampilkan alasannya
// (dan tombol WhatsApp izin susulan) lewat KartuHari/SusunFoto yang sudah ada -- aturan akses tidak diubah.
const NADA_ARSIP: Record<NadaArsip, { titik: string; chip: string }> = {
  hijau: { titik: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800" },
  kuning: { titik: "bg-amber-400", chip: "bg-amber-50 text-amber-800" },
  merah: { titik: "bg-red-500", chip: "bg-red-50 text-red-800" },
  abu: { titik: "bg-slate-300", chip: "bg-slate-100 text-slate-600" },
};

function ArsipPerTanggal({ token, data, pen, onBerubah }: { token: string; data: Data; pen: Pen; onBerubah: () => Promise<void> }) {
  const aturan = { wajibLaporan: wajibLaporan(pen), jumlahFoto: nFoto(pen) };
  const nilai = useMemo(
    () => new Map(pen.hari.map((h) => [h.tanggal, nilaiHariArsip({ tanggal: h.tanggal, kunci: h.kunci, lengkap: h.lengkap, laporan: !!h.realisasi, laporanDianggap: !!h.laporan_dianggap, jumlahFoto: h.foto.length }, aturan)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pen.hari, pen.kegiatan.wajib_laporan, pen.kegiatan.jumlah_foto]
  );
  const [saring, setSaring] = useState(false);
  const [tgl, setTgl] = useState<string | null>(() => tanggalAwalArsip(pen.hari.map((h) => h.tanggal), data.hari_ini));
  const [lengkapi, setLengkapi] = useState(false);
  const [unduhTgl, setUnduhTgl] = useState<string | null>(null);
  const jalur = useRef<HTMLDivElement>(null);
  const sentuh = useRef<{ x: number; y: number } | null>(null);

  const kurang = pen.hari.filter((h) => nilai.get(h.tanggal)?.kurang);
  const daftar = saring ? kurang : pen.hari;
  const tanggalDaftar = daftar.map((h) => h.tanggal);
  const hari = daftar.find((h) => h.tanggal === tgl) ?? daftar[0] ?? null;
  const tglAktif = hari?.tanggal ?? null;

  // tanggal terpilih selalu terlihat di deretan
  useEffect(() => {
    if (!tglAktif) return;
    const el = jalur.current?.querySelector<HTMLElement>(`[data-tgl="${tglAktif}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tglAktif]);

  const pindah = (arah: -1 | 1) => {
    if (!tglAktif) return;
    setTgl(geserTanggal(tanggalDaftar, tglAktif, arah));
    setLengkapi(false);
  };
  const pilih = (t: string) => {
    setTgl(t);
    setLengkapi(false);
  };

  if (pen.hari.length === 0)
    return (
      <section className="rounded-2xl bg-white p-4 shadow-md">
        <p className="text-[15px] font-extrabold">Arsip per tanggal</p>
        <p className="mt-1 text-[12.5px] text-[#55657D]">Belum ada hari kerja. Atur dulu di menu Hari Kerja; arsip tiap tanggal muncul di sini.</p>
      </section>
    );

  const n = hari ? nilai.get(hari.tanggal) : undefined;
  const kel = hari ? kelompokDariTanggal(pen.kelompok, hari.tanggal) : null;
  const d = hari ? tglObj(hari.tanggal) : null;
  const barisKel = (nama: string, ikon: string, rinci: string) => ({
    nama,
    ikon,
    s: kel ? `${rentangPendek(kel.mulai, kel.selesai)} · ${rinci}` : hari?.kunci === "akan_datang" ? "Dibuat setelah hari kerja berjalan" : "Hari ini tidak masuk (laporan/foto tidak lengkap)",
    ok: !!kel,
    chip: kel ? "Masuk" : hari?.kunci === "akan_datang" ? "Rencana" : "Tidak masuk",
  });
  const baris: { nama: string; ikon: string; s: string; ok: boolean; chip: string }[] = hari
    ? [
        {
          nama: "Surat Tugas",
          ikon: "📄",
          s: pen.surat_tugas ? `No. ${pen.surat_tugas.nomor} · berlaku seluruh penugasan` : "Diupload admin anggaran",
          ok: !!pen.surat_tugas?.ada_file,
          chip: pen.surat_tugas ? (pen.surat_tugas.ada_file ? "Tersedia" : "Menunggu file") : "Menunggu",
        },
        ...(aturan.wajibLaporan
          ? [
              {
                nama: "Laporan",
                ikon: "📝",
                s: hari.realisasi ? `${hari.realisasi.jumlah_realisasi} ${pen.satuan_laporan ?? pen.kegiatan.satuan_realisasi} · ${hari.realisasi.lokasi.map((l) => judul(l.jorong)).join(", ") || "–"}` : n?.laporan === "dianggap" ? "Dianggap selesai dari hasil lembar" : "Belum diisi",
                ok: n?.laporan === "ok" || n?.laporan === "dianggap",
                chip: n?.laporan === "ok" ? "Terisi" : n?.laporan === "dianggap" ? "Dianggap" : "Kurang",
              },
            ]
          : []),
        {
          nama: "Dokumentasi",
          ikon: "📸",
          s: `${hari.foto.length} dari ${aturan.jumlahFoto} nomor foto terisi`,
          ok: !!n?.foto.ok,
          chip: `${hari.foto.length}/${aturan.jumlahFoto}`,
        },
        { ...barisKel("Kwitansi", "🧾", kel ? rupiah(kel.nominal) : ""), },
        barisKel("Visum", "✈️", kel ? `${kel.tanggal.length} hari` : ""),
        barisKel("Surat Pernyataan Kendaraan Dinas", "🚗", kel ? `${kel.tanggal.length} hari` : ""),
      ]
    : [];

  return (
    <section className="rounded-2xl bg-white p-4 shadow-md">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[15px] font-extrabold">Arsip per tanggal</p>
        <span className="text-[11px] font-semibold text-[#6B7890]">{pen.hari.length - kurang.length - pen.hari.filter((h) => h.kunci === "akan_datang").length} lengkap · {kurang.length} perlu dilengkapi</span>
      </div>
      <p className="text-[11.5px] text-[#6B7890]">Usap ke kiri/kanan atau ketuk tanggal. Titik: hijau lengkap, kuning belum lengkap, merah terlewat, abu rencana.</p>

      <div className="mt-2.5 flex items-center gap-1">
        <button type="button" onClick={() => pindah(-1)} disabled={!tglAktif || tglAktif === tanggalDaftar[0]} aria-label="Tanggal sebelumnya" className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F5] text-[18px] font-extrabold text-[#0F3D7A] disabled:opacity-30">
          ‹
        </button>
        <div ref={jalur} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1" role="tablist" aria-label="Pilih tanggal">
          {daftar.length === 0 && <p className="px-2 py-2 text-[12.5px] font-semibold text-emerald-800">Semua tanggal sudah lengkap ✓</p>}
          {daftar.map((h) => {
            const dd = tglObj(h.tanggal);
            const on = h.tanggal === tglAktif;
            return (
              <button
                key={h.tanggal}
                type="button"
                role="tab"
                aria-selected={on}
                data-tgl={h.tanggal}
                onClick={() => pilih(h.tanggal)}
                className={`flex w-[52px] shrink-0 flex-col items-center rounded-xl border-2 px-1 py-1.5 ${on ? "border-[#0F3D7A] bg-[#E8EEF8]" : "border-transparent bg-[#F6F8FB]"}`}
              >
                <span className="text-[10px] font-bold text-[#8592A8]">{HARI[dd.getUTCDay()]}</span>
                <span className="text-[16px] font-extrabold leading-tight">{dd.getUTCDate()}</span>
                <span className="text-[9.5px] font-semibold text-[#8592A8]">{BULAN[dd.getUTCMonth()]}</span>
                <span className={`mt-1 h-2 w-2 rounded-full ${NADA_ARSIP[nilai.get(h.tanggal)?.nada ?? "abu"].titik}`} />
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => pindah(1)} disabled={!tglAktif || tglAktif === tanggalDaftar[tanggalDaftar.length - 1]} aria-label="Tanggal berikutnya" className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F5] text-[18px] font-extrabold text-[#0F3D7A] disabled:opacity-30">
          ›
        </button>
      </div>

      <button type="button" onClick={() => setSaring((v) => !v)} aria-pressed={saring} className={`mt-2 rounded-full px-3 py-1.5 text-[12px] font-bold ${saring ? "bg-[#0F3D7A] text-white" : "bg-[#EEF1F5] text-[#55657D]"}`}>
        Belum lengkap saja ({kurang.length})
      </button>

      {hari && d && n && (
        <div
          className="mt-3 rounded-2xl bg-[#F6F8FB] p-3.5"
          onTouchStart={(e) => {
            const t = e.touches[0];
            sentuh.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const a = sentuh.current;
            sentuh.current = null;
            const t = e.changedTouches[0];
            if (!a || !t) return;
            const arah = arahSapuan(t.clientX - a.x, t.clientY - a.y);
            if (arah !== 0) pindah(arah);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold">{tglPanjang(hari.tanggal)}</p>
              {hari.kunci === "izin" && hari.izin_sampai && <p className="text-[11.5px] font-semibold text-violet-700">Izin susulan dari admin s.d. {new Date(hari.izin_sampai).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} WIB</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${NADA_ARSIP[n.nada].chip}`}>{n.label}</span>
          </div>

          <div className="mt-1 divide-y divide-[#E3E8F0]">
            {baris.map((b) => (
              <div key={b.nama} className="flex items-center gap-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[15px]">{b.ikon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold">{b.nama}</p>
                  <p className="text-[11.5px] text-[#6B7890]">{b.s}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${b.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{b.chip}</span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setUnduhTgl(hari.tanggal)} className="min-h-[44px] flex-1 rounded-xl bg-[#0F3D7A] px-3 text-[13.5px] font-extrabold text-white">
              ⬇ Unduh tanggal ini
            </button>
            {hari.kunci !== "akan_datang" && (
              <button type="button" onClick={() => setLengkapi((v) => !v)} aria-expanded={lengkapi} className={`min-h-[44px] flex-1 rounded-xl border-2 px-3 text-[13.5px] font-extrabold ${n.kurang ? "border-[#B7791F] bg-[#FFF4D6] text-[#5E4300]" : "border-[#C9D3E6] bg-white text-[#0F3D7A]"}`}>
                {lengkapi ? "Tutup" : n.kurang ? "Lengkapi / perbaiki" : "Lihat laporan & foto"}
              </button>
            )}
          </div>
          {hari.kunci === "akan_datang" && <p className="mt-2 text-[11.5px] text-[#6B7890]">Hari ini baru rencana. Laporan dan foto diisi pada hari kerjanya.</p>}

          {lengkapi && hari.kunci !== "akan_datang" && (
            <div className="mt-3 space-y-3">
              <KartuHari key={`ar-${pen.id}-${hari.tanggal}`} token={token} data={data} pen={pen} hari={hari} onBerubah={onBerubah} />
            </div>
          )}
        </div>
      )}
      {unduhTgl && <LembarUnduh pen={pen} hariIni={data.hari_ini} tanggalAwal={unduhTgl} onTutup={() => setUnduhTgl(null)} />}
    </section>
  );
}

// ---------------- Arsip dokumen + Unduh SPJ ----------------
const JENIS_DOK = [
  { k: "surat_tugas", ikon: "📄", nama: "Surat Tugas" },
  { k: "kwitansi", ikon: "🧾", nama: "Kwitansi" },
  { k: "visum", ikon: "✈️", nama: "Visum" },
  { k: "laporan", ikon: "📝", nama: "Laporan" },
  { k: "dokumentasi", ikon: "📸", nama: "Dokumentasi" },
  { k: "surat_pernyataan", ikon: "🚗", nama: "Surat Pernyataan Kendaraan Dinas" },
] as const;

function ArsipDokumen({ token, data, pen, onBerubah, ringkasSaja = false }: { token: string; data: Data; pen: Pen; onBerubah: () => Promise<void>; ringkasSaja?: boolean }) {
  const [unduh, setUnduh] = useState(false);
  const nLaporan = pen.hari.filter((h) => h.realisasi).length;
  const nDok = pen.hari.filter((h) => h.foto.length >= nFoto(pen)).length;
  const terlewat = pen.hari.filter((h) => h.kunci === "terlewat" && !h.lengkap);
  const info: Record<string, { s: string; chip: string; ok: boolean }> = {
    surat_tugas: pen.surat_tugas
      ? { s: `No. ${pen.surat_tugas.nomor} · Tujuan ${pen.surat_tugas.tujuan.map(judul).join(", ") || "–"}`, chip: pen.surat_tugas.ada_file ? "Tersedia" : "Menunggu file", ok: pen.surat_tugas.ada_file }
      : { s: "Diupload admin anggaran", chip: "Menunggu", ok: false },
    kwitansi: { s: `${pen.kelompok.length} kelompok tanggal`, chip: `${pen.kelompok.length} dok`, ok: pen.kelompok.length > 0 },
    visum: { s: `${pen.kelompok.length} kelompok tanggal`, chip: `${pen.kelompok.length} dok`, ok: pen.kelompok.length > 0 },
    laporan: { s: `${nLaporan} hari terisi`, chip: `${nLaporan} dok`, ok: nLaporan > 0 },
    dokumentasi: { s: `${nDok} hari lengkap ${nFoto(pen)} foto`, chip: `${nDok} dok`, ok: nDok > 0 },
    surat_pernyataan: { s: `${pen.kelompok.length} kelompok tanggal`, chip: `${pen.kelompok.length} dok`, ok: pen.kelompok.length > 0 },
  };
  return (
    <>
      {!ringkasSaja && <ArsipPerTanggal token={token} data={data} pen={pen} onBerubah={onBerubah} />}
      <section className="rounded-2xl bg-white p-4 shadow-md">
        <div className="flex items-baseline justify-between">
          <div className="min-w-0">
            {!ringkasSaja && <p className="text-[11px] font-bold text-[#6B7890]">Ringkasan seluruh periode</p>}
            <p className="text-[15px] font-extrabold">{pen.kegiatan.nama}</p>
          </div>
          <span className="text-[11px] font-semibold text-[#6B7890]">{pen.peran.toUpperCase()}</span>
        </div>
        <div className="mt-1 divide-y divide-[#EEF1F5]">
          {JENIS_DOK.map((j) => (
            <div key={j.k} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8EEF8] text-[16px]">{j.ikon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold">{j.nama}</p>
                <p className="text-[11.5px] text-[#6B7890]">{info[j.k].s}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${info[j.k].ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{info[j.k].chip}</span>
            </div>
          ))}
        </div>
        {pen.kelompok.length > 0 && (
          <div className="mt-2 rounded-xl bg-[#F6F8FB] px-3 py-2 text-[12.5px]">
            <p className="text-[11px] font-bold text-[#6B7890]">Kwitansi / Visum / Surat Pernyataan</p>
            {pen.kelompok.map((k) => (
              <div key={k.mulai} className="flex justify-between">
                <span>{rentangPendek(k.mulai, k.selesai)} · {k.jumlah_hari} hari</span>
                <b>{rupiah(k.nominal)}</b>
              </div>
            ))}
          </div>
        )}
      </section>
      {terlewat.length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-red-800">
          {terlewat.map((h) => tglPendek(h.tanggal)).join(", ")} terlewat (laporan/foto tidak lengkap) — tidak masuk Kwitansi.
        </p>
      )}
      <button type="button" onClick={() => setUnduh(true)} className="w-full rounded-xl bg-[#0F3D7A] py-3.5 text-[15px] font-extrabold text-white shadow">
        ⬇ Unduh SPJ… <span className="font-semibold text-blue-200">(pilih tanggal &amp; jenis)</span>
      </button>
      {unduh && <LembarUnduh pen={pen} hariIni={data.hari_ini} onTutup={() => setUnduh(false)} />}
    </>
  );
}

// ======================================================================
// (6 Okt 2026) Tombol melayang "Unduh SPJ" yg bisa DIGESER dgn tekan-tahan -- permintaan user.
//  - Ketuk biasa = buka lembar Unduh SPJ.
//  - Tekan & tahan ±0,35 dtk (HP bergetar bila didukung) lalu geser = pindahkan tombol.
//  - Posisi diingat di perangkat (localStorage, dicoba-tangkap) & selalu dijaga tetap di dalam layar.
const KUNCI_POS_FAB = "sigap_fab_unduh_pos";
function TombolUnduhMelayang({ onKlik }: { onKlik: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [seret, setSeret] = useState(false);
  const st = useRef<{ timer: ReturnType<typeof setTimeout> | null; x0: number; y0: number; dx: number; dy: number; geser: boolean; batal: boolean }>({
    timer: null,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    geser: false,
    batal: false,
  });

  const jepit = useCallback((x: number, y: number) => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 150;
    const h = el?.offsetHeight ?? 48;
    const bawahAman = 72; // jangan menutupi navigasi bawah
    return {
      x: Math.min(Math.max(8, x), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, y), window.innerHeight - h - bawahAman),
    };
  }, []);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KUNCI_POS_FAB) ?? "null");
      if (v && typeof v.x === "number" && typeof v.y === "number") setPos(jepit(v.x, v.y));
    } catch {
      /* abaikan */
    }
    const ubah = () => setPos((p) => (p ? jepit(p.x, p.y) : p));
    window.addEventListener("resize", ubah);
    return () => window.removeEventListener("resize", ubah);
  }, [jepit]);

  function turun(e: React.PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const s = st.current;
    s.x0 = e.clientX;
    s.y0 = e.clientY;
    s.dx = e.clientX - r.left;
    s.dy = e.clientY - r.top;
    s.geser = false;
    s.batal = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.timer = setTimeout(() => {
      s.geser = true;
      setSeret(true);
      try {
        navigator.vibrate?.(25);
      } catch {
        /* abaikan */
      }
    }, 350);
  }
  function gerak(e: React.PointerEvent<HTMLButtonElement>) {
    const s = st.current;
    if (!s.geser) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 10) {
        s.batal = true; // bergerak sebelum tahan selesai -> bukan ketukan, bukan seret
        if (s.timer) clearTimeout(s.timer);
      }
      return;
    }
    setPos(jepit(e.clientX - s.dx, e.clientY - s.dy));
  }
  function naik() {
    const s = st.current;
    if (s.timer) clearTimeout(s.timer);
    if (s.geser) {
      setSeret(false);
      setPos((p) => {
        try {
          if (p) localStorage.setItem(KUNCI_POS_FAB, JSON.stringify(p));
        } catch {
          /* abaikan */
        }
        return p;
      });
    } else if (!s.batal) onKlik();
    s.geser = false;
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Unduh SPJ (tekan-tahan untuk memindahkan)"
      onPointerDown={turun}
      onPointerMove={gerak}
      onPointerUp={naik}
      onPointerCancel={() => {
        const s = st.current;
        if (s.timer) clearTimeout(s.timer);
        s.geser = false;
        setSeret(false);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onKlik();
        }
      }}
      className={`fixed z-30 flex select-none items-center gap-2 rounded-full bg-[#0F3D7A] py-3 pl-4 pr-5 text-[14px] font-extrabold text-white shadow-lg shadow-[#0F3D7A]/30 ring-4 ring-white/70 ${
        seret ? "scale-110 cursor-grabbing opacity-90" : "transition active:scale-95"
      }`}
      style={{
        touchAction: "none",
        WebkitTouchCallout: "none",
        ...(pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: "calc(76px + env(safe-area-inset-bottom))" }),
      }}
    >
      <span className="text-[17px] leading-none">{seret ? "✥" : "⬇"}</span> {seret ? "Geser…" : "Unduh SPJ"}
    </button>
  );
}

function LembarUnduh({ pen, hariIni, onTutup, tanggalAwal }: { pen: Pen; hariIni: string; onTutup: () => void; tanggalAwal?: string | null }) {
  // (20 Okt 2026) permintaan user: utamakan unduh TANGGAL HARI INI / HARI LENGKAP TERAKHIR (cepat, hanya Laporan & Dokumentasi hari itu);
  // rentang (Semua / kelompok tanggal) dipilih belakangan lewat "Pilih rentang lain".
  const pil = pilihanTanggalUnduh(pen.hari.map((h) => ({ tanggal: h.tanggal, lengkap: h.lengkap })), hariIni);
  // (23 Okt 2026) dibuka dari tab Arsip per tanggal: langsung memilih tanggal itu (bukan tanggal bawaan)
  const awal = tanggalAwal && pen.hari.some((h) => h.tanggal === tanggalAwal) ? tanggalAwal : pil.bawaan;
  const [tanggalPilih, setTanggalPilih] = useState<string | null>(awal);
  const [rentangPilih, setRentangPilih] = useState<string>("semua");
  const [bukaRentang, setBukaRentang] = useState<boolean>(awal === null);
  const perHari = tanggalPilih !== null;
  const jenisPerHari = JENIS_PER_HARI as readonly string[];
  const [jenis, setJenis] = useState<Set<string>>(new Set(awal ? jenisPerHari : JENIS_DOK.map((j) => j.k)));
  const [format, setFormat] = useState<"gabungan" | "zip">("gabungan");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  // (23 Okt 2026) Petugas boleh mengunduh SEMUA jenis SPJ. Surat Tugas, Kwitansi, Visum & Surat Pernyataan dibuat per kelompok tanggal, jadi
  // mencentangnya saat mode "Satu hari" memindahkan pilihan ke kelompok tanggal yang memuat hari itu (bukan lagi dinonaktifkan).
  const [pindahRentang, setPindahRentang] = useState<string | null>(null); // teks pemberitahuan setelah otomatis pindah ke rentang
  const keRentangDariHari = () => {
    const kel = tanggalPilih ? pen.kelompok.find((g) => tanggalPilih >= g.mulai && tanggalPilih <= g.selesai) : undefined;
    setRentangPilih(kel ? kel.mulai : "semua");
    setTanggalPilih(null);
    setBukaRentang(true);
    setPindahRentang(kel ? `rentang ${rentangPendek(kel.mulai, kel.selesai)}` : "semua tanggal");
  };
  const pilihHari = (t: string) => {
    setPindahRentang(null);
    setTanggalPilih(t);
    setJenis((s) => {
      const n = new Set(Array.from(s).filter((k) => jenisPerHari.includes(k)));
      return n.size ? n : new Set(jenisPerHari);
    });
  };
  const pilihRentang = (r: string) => {
    setPindahRentang(null);
    if (tanggalPilih !== null) setJenis(new Set(JENIS_DOK.map((j) => j.k)));
    setTanggalPilih(null);
    setRentangPilih(r);
  };
  // (5 Okt 2026) Unduh SPJ aktif -- permintaan user: memanggil /api/sigap/translok/<token>/dokumen,
  // hasil (PDF gabungan / ZIP) diunduh lewat object URL dgn nama file dari header Content-Disposition.
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [catatan, setCatatan] = useState<string[]>([]);
  const unduhSekarang = async () => {
    if (proses || jenis.size === 0) return;
    setProses(true);
    setGalat(null);
    setCatatan([]);
    try {
      // Token diambil dari URL halaman (/sigap/translok/<token>) supaya komponen lain tidak perlu diubah.
      const token = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() ?? "");
      const q = new URLSearchParams({
        penugasan_id: String(pen.id),
        jenis: JENIS_DOK.filter((j) => jenis.has(j.k)).map((j) => j.k).join(","),
        kelompok: perHari ? "semua" : rentangPilih,
        format,
      });
      if (tanggalPilih) q.set("tanggal", tanggalPilih);
      const res = await fetch(`/api/sigap/translok/${encodeURIComponent(token)}/dokumen?${q.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? `Gagal membuat dokumen (${res.status}).`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const mUtf = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const mAscii = /filename="([^"]+)"/i.exec(cd);
      const nama = mUtf ? decodeURIComponent(mUtf[1]) : mAscii ? mAscii[1] : format === "zip" ? "SPJ.zip" : "SPJ.pdf";
      try {
        const lewat = JSON.parse(decodeURIComponent(res.headers.get("x-spj-dilewati") ?? "%5B%5D"));
        if (Array.isArray(lewat)) setCatatan(lewat.map(String));
      } catch {
        // header opsional -- abaikan bila tidak terbaca
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengunduh.");
    } finally {
      setProses(false);
    }
  };
  const ubah = (k: string) => {
    if (perHari && !jenis.has(k) && !jenisPerHari.includes(k)) keRentangDariHari();
    setJenis((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };
  const CHIP = (on: boolean) => `rounded-full px-3 py-1.5 text-[12.5px] font-bold ${on ? "bg-[#0F3D7A] text-white" : "bg-[#EEF1F5] text-[#55657D]"}`;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onTutup}>
      <div ref={ref} tabIndex={-1} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#EEF2F8] p-4 pb-8 outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#C9D3E2]" />
        <div className="flex items-center justify-between">
          <p className="text-[17px] font-extrabold">Unduh SPJ</p>
          <button type="button" onClick={onTutup} className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#55657D]">
            Tutup
          </button>
        </div>
        <p className="text-[12px] text-[#6B7890]">{pen.kegiatan.nama} · {pen.peran.toUpperCase()}</p>

        <div className="mt-3 rounded-2xl bg-white p-3.5">
          <p className="text-[12px] font-bold text-[#6B7890]">1 · Tanggal</p>
          {(pil.hariIni || pil.terakhirLengkap || awal) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {awal && awal !== pil.hariIni && awal !== pil.terakhirLengkap && (
                <button type="button" className={CHIP(tanggalPilih === awal)} onClick={() => pilihHari(awal)}>
                  Tanggal · {tglPendek(awal)}
                </button>
              )}
              {pil.hariIni && (
                <button type="button" className={CHIP(tanggalPilih === pil.hariIni)} onClick={() => pilihHari(pil.hariIni as string)}>
                  Hari ini · {tglPendek(pil.hariIni)}
                  {!pil.hariIniLengkap && <span className="font-semibold opacity-80"> (belum lengkap)</span>}
                </button>
              )}
              {pil.terakhirLengkap && pil.terakhirLengkap !== pil.hariIni && (
                <button type="button" className={CHIP(tanggalPilih === pil.terakhirLengkap)} onClick={() => pilihHari(pil.terakhirLengkap as string)}>
                  Terakhir lengkap · {tglPendek(pil.terakhirLengkap)}
                </button>
              )}
            </div>
          )}
          {perHari && <p className="mt-1.5 text-[11px] text-[#8592A8]">Satu hari: Laporan &amp; Dokumentasi tanggal itu saja (cepat). Mencentang Surat Tugas, Kwitansi, Visum atau Surat Pernyataan otomatis berpindah ke rentang tanggalnya.</p>}
          {pindahRentang && <p className="mt-1.5 rounded-lg bg-[#FFF4D6] px-2.5 py-1.5 text-[11.5px] font-semibold leading-snug text-[#5E4300]">Surat Tugas, Kwitansi, Visum &amp; Surat Pernyataan dibuat per rentang, jadi pilihan tanggal berpindah ke {pindahRentang}. Laporan &amp; Dokumentasi ikut mencakup rentang itu. Mau satu hari saja? Pilih &quot;Hari ini&quot; lagi.</p>}
          <button type="button" onClick={() => setBukaRentang((v) => !v)} className="mt-2 text-[12px] font-bold text-[#0F3D7A]">
            {bukaRentang ? "Sembunyikan rentang ▴" : "Pilih rentang lain ▾"}
          </button>
          {bukaRentang && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={CHIP(!perHari && rentangPilih === "semua")} onClick={() => pilihRentang("semua")}>
                  Semua
                </button>
                {pen.kelompok.map((k) => (
                  <button key={k.mulai} type="button" className={CHIP(!perHari && rentangPilih === k.mulai)} onClick={() => pilihRentang(k.mulai)}>
                    {rentangPendek(k.mulai, k.selesai)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[#8592A8]">Kelompok tanggal = dasar Kwitansi, Visum &amp; Surat Pernyataan.</p>
            </>
          )}
        </div>

        <div className="mt-2.5 rounded-2xl bg-white p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-[#6B7890]">2 · Jenis dokumen</p>
            <button type="button" onClick={() => {
                const semua = JENIS_DOK.map((j) => j.k as string);
                if (jenis.size === semua.length) {
                  setJenis(new Set());
                  return;
                }
                if (perHari) keRentangDariHari();
                setJenis(new Set(semua));
              }}
              className="text-[11.5px] font-bold text-[#0F3D7A]"
            >
              {jenis.size === JENIS_DOK.length ? "Kosongkan" : "Pilih semua"}
            </button>
          </div>
          <div className="mt-1">
            {JENIS_DOK.map((j) => (
              <label key={j.k} className="flex items-center gap-2.5 py-1.5 text-[13.5px]">
                <input type="checkbox" checked={jenis.has(j.k)} onChange={() => ubah(j.k)} className="h-4 w-4 accent-[#0F3D7A]" />
                <span>
                  {j.ikon} {j.nama}
                  {perHari && !jenisPerHari.includes(j.k) && <span className="text-[11px] font-semibold text-[#8592A8]"> · per rentang</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-2.5 rounded-2xl bg-white p-3.5">
          <p className="text-[12px] font-bold text-[#6B7890]">3 · Format</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" className={CHIP(format === "gabungan")} onClick={() => setFormat("gabungan")}>
              1 PDF gabungan (siap cetak)
            </button>
            <button type="button" className={CHIP(format === "zip")} onClick={() => setFormat("zip")}>
              ZIP per file
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={unduhSekarang}
          disabled={proses || jenis.size === 0}
          className="mt-3 w-full rounded-xl bg-[#0F3D7A] py-3.5 text-[15px] font-extrabold text-white shadow disabled:opacity-50"
        >
          {proses ? "Menyiapkan dokumen…" : "⬇ Unduh"}
        </button>
        {proses && <p className="mt-1.5 text-center text-[11.5px] text-[#6B7890]">Dokumen sedang dirakit, mohon tunggu (dokumentasi foto bisa agak lama).</p>}
        {jenis.size === 0 && !proses && <p className="mt-1.5 text-center text-[11.5px] text-amber-700">Pilih minimal 1 jenis dokumen.</p>}
        {galat && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-800">{galat}</p>}
        {catatan.length > 0 && (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <p className="font-bold">Tidak ikut diunduh (data belum ada):</p>
            {catatan.slice(0, 8).map((c) => (
              <p key={c}>• {c}</p>
            ))}
            {catatan.length > 8 && <p>… dan {catatan.length - 8} lainnya</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================
function FormRealisasi({
  token,
  pen,
  hari,
  boleh,
  opsi,
  onTersimpan,
}: {
  token: string;
  pen: Pen;
  hari: Hari;
  boleh: boolean;
  opsi: Data["lokasi_opsi"];
  onTersimpan: () => Promise<void>;
}) {
  // (11 Okt 2026) Belum ada laporan tersimpan -> terisi otomatis dari identifikasi (PML) / pendataan (PPL, korwil); petugas memeriksa lalu menyimpan.
  const oto = hari.otomatis ?? null;
  const sumber = pen.sumber_otomatis ?? null;
  const sat = pen.satuan_laporan ?? pen.kegiatan.satuan_realisasi;
  const awalOto = !hari.realisasi && boleh ? oto : null;
  const [lokasi, setLokasi] = useState<Lokasi[]>(hari.realisasi?.lokasi ?? awalOto?.lokasi ?? []);
  const [jumlah, setJumlah] = useState<string>(hari.realisasi ? String(hari.realisasi.jumlah_realisasi) : awalOto ? String(awalOto.jumlah) : "");
  const [kendala, setKendala] = useState(hari.realisasi?.kendala ?? "");
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; ok: boolean } | null>(null);
  const [kec, setKec] = useState("");
  const [nag, setNag] = useState("");
  const [jor, setJor] = useState("");

  const daftarKec = useMemo(() => Array.from(new Set(opsi.master.map((m) => m.kecamatan))), [opsi]);
  const daftarNag = useMemo(() => Array.from(new Set(opsi.master.filter((m) => m.kecamatan === kec).map((m) => m.nagari))), [opsi, kec]);
  const daftarJor = useMemo(() => opsi.master.filter((m) => m.kecamatan === kec && m.nagari === nag).map((m) => m.jorong), [opsi, kec, nag]);

  function tambah(l: Lokasi) {
    if (lokasi.some((x) => x.kecamatan === l.kecamatan && x.nagari === l.nagari && x.jorong === l.jorong)) return;
    setLokasi((v) => [...v, l].slice(0, 10));
  }

  async function simpan() {
    setBusy(true);
    setPesan(null);
    try {
      const res = await fetch(`/api/sigap/translok/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "realisasi", penugasan_id: pen.id, tanggal: hari.tanggal, lokasi, jumlah_realisasi: Number(jumlah), kendala }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Gagal menyimpan.");
      setPesan({ teks: "Laporan realisasi tersimpan.", ok: true });
      await onTersimpan();
    } catch (e) {
      setPesan({ teks: e instanceof Error ? e.message : "Gagal menyimpan.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const SELECT = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#0F3D7A] disabled:bg-slate-50";
  const tersimpan = !!hari.realisasi;
  const banding = oto ? bandingkanOtomatis({ lokasi, jumlah: jumlah === "" ? null : Number(jumlah) }, oto) : null;
  // (14 Okt 2026) Isian yang BERBEDA dari hasil lembar (lokasi atau jumlah) wajib disertai alasan singkat di kolom Kendala -- supaya selisih dengan data lembar tercatat.
  const butuhAlasan = !!banding && !banding.semuaSama && kendala.trim().length < 5;
  const namaLembar = sumber === "identifikasi" ? "Lembar Identifikasi" : "Lembar Pendataan";
  function pakaiOtomatis() {
    if (!oto) return;
    setLokasi(oto.lokasi.map((l) => ({ ...l })));
    setJumlah(String(oto.jumlah));
    setPesan(null);
  }
  const TAG = <span className="ml-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-800">otomatis</span>;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[16px] font-extrabold">📝 Laporan realisasi</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tersimpan ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          {tersimpan ? "✓ Tersimpan" : "Belum diisi"}
        </span>
      </div>

      {/* (11 Okt 2026) Keterangan isian otomatis dari identifikasi / pendataan */}
      {sumber && !oto && (
        <p className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] leading-snug text-slate-600">
          Belum ada hasil di {namaLembar} atas nama Anda pada tanggal ini, jadi isian belum terisi otomatis. Isi manual, atau lengkapi hasilnya lalu muat ulang halaman ini.
        </p>
      )}
      {/* (15 Okt 2026) Laporan diambil dari pendataan: bila belum ada hasil, petugas diarahkan ke Lembar Pendataan (Sub SLS prioritas) dari dalam formulir */}
      {sumber === "pendataan" && !oto && !tersimpan && boleh && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-900">
          <p>Laporan ini diambil dari hasil pendataan. Lengkapi dulu status KK di Lembar Pendataan, lalu kembali ke sini untuk memeriksa dan menyimpan laporan.</p>
          <a href={alamatLembarUtama("/sigap/pendataan")} className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#E0A526] px-4 text-[14px] font-extrabold text-[#1E2A47]">
            Buka Lembar Pendataan
          </a>
        </div>
      )}
      {sumber && oto && banding && (
        <div className={`mt-2.5 rounded-xl px-3 py-2 text-[12.5px] leading-snug ${banding.semuaSama ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900"}`}>
          {banding.semuaSama ? (
            <p>
              <b>{tersimpan ? "✓ Sesuai" : "Terisi otomatis dari"} {LABEL_SUMBER[oto.sumber]}:</b> {oto.jumlah} {sat} di {oto.lokasi.length} jorong.{!tersimpan && " Periksa; bila sudah benar tekan Konfirmasi & simpan laporan, bila perlu ubah dulu lokasi atau jumlahnya."}
            </p>
          ) : (
            <p>
              <b>Isian berbeda dari {LABEL_SUMBER[oto.sumber]}</b> ({oto.jumlah} {sat} di {oto.lokasi.length} jorong).
              {boleh && (
                <button type="button" onClick={pakaiOtomatis} className="ml-1.5 font-extrabold underline">
                  Pakai data otomatis
                </button>
              )}
            </p>
          )}
          {oto.lokasi_terpotong > 0 && <p className="mt-1">Catatan: {oto.lokasi_terpotong} jorong lain tidak muat (maksimal 10 lokasi per laporan); tambahkan di Kendala bila perlu.</p>}
        </div>
      )}

      {/* Lokasi */}
      <p className="mb-1.5 mt-3 text-[13px] font-bold text-slate-700">Lokasi{banding?.lokasiSama && TAG}</p>
      {lokasi.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {lokasi.map((l, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-[#C9D6EA] bg-[#F3F7FC] py-1 pl-3 pr-1.5 text-[12.5px] font-semibold text-[#0F3D7A]">
              {judul(l.jorong)}, {judul(l.nagari)}
              {boleh && (
                <button type="button" onClick={() => setLokasi((v) => v.filter((_, j) => j !== i))} className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] text-slate-500" aria-label="Hapus lokasi">
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-slate-500">Belum ada lokasi.</p>
      )}

      {boleh && (
        <div className="mt-2.5 space-y-2 rounded-xl bg-[#F6F8FB] p-3">
          {opsi.wilayah_tim.length > 0 && (
            <select
              className={SELECT}
              value=""
              onChange={(e) => {
                const w = opsi.wilayah_tim.find((x) => x.idsubsls === e.target.value);
                if (w) tambah({ kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.jorong, idsubsls: w.idsubsls });
              }}
            >
              <option value="">＋ Pilih dari wilayah tim Anda…</option>
              {opsi.wilayah_tim.map((w) => (
                <option key={w.idsubsls ?? ""} value={w.idsubsls ?? ""}>
                  {judul(w.jorong)} ({w.sub_sls}) · {judul(w.nagari)}
                </option>
              ))}
            </select>
          )}
          <p className="text-[11.5px] font-semibold text-slate-500">{opsi.wilayah_tim.length > 0 ? "atau lokasi lain:" : "Pilih kecamatan → nagari → jorong:"}</p>
          <select className={SELECT} value={kec} onChange={(e) => { setKec(e.target.value); setNag(""); setJor(""); }}>
            <option value="">Kecamatan…</option>
            {daftarKec.map((k) => <option key={k} value={k}>{judul(k)}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select className={SELECT} value={nag} disabled={!kec} onChange={(e) => { setNag(e.target.value); setJor(""); }}>
              <option value="">Nagari…</option>
              {daftarNag.map((n) => <option key={n} value={n}>{judul(n)}</option>)}
            </select>
            <select className={SELECT} value={jor} disabled={!nag} onChange={(e) => setJor(e.target.value)}>
              <option value="">Jorong…</option>
              {daftarJor.map((j) => <option key={j} value={j}>{judul(j)}</option>)}
            </select>
          </div>
          <button
            type="button"
            disabled={!kec || !nag || !jor}
            onClick={() => { tambah({ kecamatan: kec, nagari: nag, jorong: jor }); setJor(""); }}
            className="w-full rounded-xl border border-[#0F3D7A] bg-white py-2 text-[13px] font-bold text-[#0F3D7A] disabled:opacity-40"
          >
            ＋ Tambahkan lokasi
          </button>
        </div>
      )}

      {/* Jumlah */}
      <p className="mb-1.5 mt-4 text-[13px] font-bold text-slate-700">
        Jumlah {sat} {sumber === "identifikasi" ? "diidentifikasi" : pen.peran === "pml" ? "diperiksa" : "didata"}
        {banding?.jumlahSama && TAG}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!boleh} onClick={() => setJumlah((v) => String(Math.max(0, (Number(v) || 0) - 1)))} className="h-12 w-12 shrink-0 rounded-xl border border-slate-300 text-[20px] font-bold disabled:opacity-40">−</button>
        <input
          inputMode="numeric"
          disabled={!boleh}
          value={jumlah}
          onChange={(e) => {
            // (14 Okt 2026) batas 500 sama dengan server (sebelumnya HP menerima sampai 999 lalu ditolak saat simpan)
            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
            setJumlah(v !== "" && Number(v) > MAKS_JUMLAH ? String(MAKS_JUMLAH) : v);
          }}
          placeholder="0"
          className="h-12 w-full rounded-xl border border-slate-300 text-center text-[22px] font-extrabold outline-none focus:border-[#0F3D7A] disabled:bg-slate-50"
        />
        <button type="button" disabled={!boleh} onClick={() => setJumlah((v) => String(Math.min(MAKS_JUMLAH, (Number(v) || 0) + 1)))} className="h-12 w-12 shrink-0 rounded-xl border border-slate-300 text-[20px] font-bold disabled:opacity-40">＋</button>
      </div>

      {/* Kendala */}
      <p className="mb-1.5 mt-4 text-[13px] font-bold text-slate-700">
        Kendala / catatan{" "}
        {banding && !banding.semuaSama ? <span className="font-bold text-amber-800">(wajib: isian berbeda dari lembar)</span> : <span className="font-normal text-slate-500">(opsional)</span>}
      </p>
      <textarea
        disabled={!boleh}
        value={kendala}
        onChange={(e) => setKendala(e.target.value)}
        rows={3}
        placeholder="Mis. hujan deras, akses jalan terputus, responden tidak di rumah"
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] outline-none focus:border-[#0F3D7A] disabled:bg-slate-50"
      />

      {pesan && <p className={`mt-2 text-[13px] font-semibold ${pesan.ok ? "text-emerald-700" : "text-red-700"}`}>{pesan.ok ? "✓ " : "⚠ "}{pesan.teks}</p>}
      {boleh && butuhAlasan && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900">
          Isian berbeda dari {oto ? LABEL_SUMBER[oto.sumber] : "lembar"} ({oto?.jumlah} {sat}). Tuliskan alasan singkat di kolom Kendala (minimal 5 huruf), atau tekan Pakai data otomatis.
        </p>
      )}
      {boleh && (
        <button
          type="button"
          disabled={busy || lokasi.length === 0 || jumlah === "" || butuhAlasan}
          onClick={simpan}
          className="mt-3 w-full rounded-xl bg-[#0F3D7A] py-3.5 text-[15px] font-extrabold text-white shadow disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : tersimpan ? "Perbarui laporan" : banding?.semuaSama ? "Konfirmasi & simpan laporan" : banding ? "Simpan laporan (isian diubah)" : "Simpan laporan"}
        </button>
      )}
    </section>
  );
}

// ======================================================================
function PanelFoto({ token, pen, hari, boleh, onBerubah }: { token: string; pen: Pen; hari: Hari; boleh: boolean; onBerubah: () => Promise<void> }) {
  const [progres, setProgres] = useState<Record<number, number>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [lihat, setLihat] = useState<string | null>(null);
  const inputRef = useRef<Record<number, HTMLInputElement | null>>({});
  // (6 Okt 2026) Unggah beberapa foto sekaligus lalu tandai jenisnya (slot) -- permintaan user.
  const [antre, setAntre] = useState<{ id: number; file: File; url: string; slot: number }[]>([]);
  const [massal, setMassal] = useState(false);
  const jml = hari.foto.length;
  const MAKS = nFoto(pen); // (7 Okt 2026) jumlah foto per kegiatan
  const SARAN_FOTO = labelFoto(pen.kegiatan.jenis);
  const persen = Math.round((jml / MAKS) * 100);

  async function unggah(slot: number, file: File, tanpaMuat = false): Promise<boolean> {
    let berhasil = false;
    setGalat(null);
    setProgres((p) => ({ ...p, [slot]: 1 }));
    const blob = await kecilkanFoto(file);
    const fd = new FormData();
    fd.append("penugasan_id", String(pen.id));
    fd.append("tanggal", hari.tanggal);
    fd.append("slot", String(slot));
    fd.append("file", blob, file.name.replace(/\.[^.]+$/, "") + ".jpg");
    await new Promise<void>((selesai) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/sigap/translok/${token}/foto`);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgres((p) => ({ ...p, [slot]: Math.max(1, Math.round((e.loaded / e.total) * 95)) }));
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 300) setGalat(json?.error ?? "Gagal mengunggah foto.");
          else berhasil = true;
        } catch {
          if (xhr.status >= 300) setGalat("Gagal mengunggah foto.");
        }
        selesai();
      };
      xhr.onerror = () => {
        setGalat("Koneksi terputus saat mengunggah. Coba lagi.");
        selesai();
      };
      xhr.send(fd);
    });
    if (!tanpaMuat) await onBerubah();
    setProgres((p) => {
      const n = { ...p };
      delete n[slot];
      return n;
    });
    return berhasil;
  }

  function pilihBanyak(files: FileList | null) {
    if (!files || files.length === 0) return;
    antre.forEach((a) => URL.revokeObjectURL(a.url));
    const kosong = Array.from({ length: MAKS }, (_, i) => i + 1).filter((sl) => !hari.foto.some((f) => f.slot === sl));
    const daftar = Array.from(files)
      .filter((f) => /^image\//.test(f.type || "image/jpeg"))
      .slice(0, MAKS)
      .map((file, i) => ({ id: Date.now() + i, file, url: URL.createObjectURL(file), slot: kosong[i] ?? 0 }));
    if (files.length > MAKS) setGalat(`Maksimal ${MAKS} foto; hanya ${MAKS} foto pertama yang diambil.`);
    setAntre(daftar);
  }

  /** Tandai jenis (slot) satu foto; slot yg sudah dipakai foto antrean lain dilepas dari foto itu. */
  function tandai(id: number, slot: number) {
    setAntre((v) => v.map((a) => (a.id === id ? { ...a, slot } : a.slot === slot && slot !== 0 ? { ...a, slot: 0 } : a)));
  }

  function batalAntre() {
    antre.forEach((a) => URL.revokeObjectURL(a.url));
    setAntre([]);
  }

  async function unggahSemua() {
    if (antre.some((a) => !a.slot)) return setGalat("Tandai jenis setiap foto dulu.");
    setMassal(true);
    let gagal = 0;
    for (const a of antre) {
      const ok = await unggah(a.slot, a.file, true);
      if (!ok) gagal++;
    }
    await onBerubah();
    setMassal(false);
    batalAntre();
    if (gagal) setGalat(`${gagal} foto gagal diunggah. Coba lagi untuk foto yang belum masuk.`);
  }

  async function hapus(slot: number) {
    if (!window.confirm(`Hapus foto ${slot}?`)) return;
    const res = await fetch(`/api/sigap/translok/${token}/foto?penugasan_id=${pen.id}&tanggal=${hari.tanggal}&slot=${slot}`, { method: "DELETE" });
    if (!res.ok) setGalat((await res.json().catch(() => ({})))?.error ?? "Gagal menghapus.");
    await onBerubah();
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[16px] font-extrabold">📷 Dokumentasi</p>
          <p className="text-[12px] text-[#55657D]">Wajib {MAKS} foto untuk tanggal ini</p>
        </div>
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E4E9F0" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={jml >= MAKS ? "#1E7A4C" : "#0F3D7A"} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(persen / 100) * 97.4} 97.4`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold">{jml}/{MAKS}</span>
        </div>
      </div>

      {galat && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-800">⚠ {galat}</p>}

      {boleh && antre.length === 0 && (
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0F3D7A] px-3 py-3 text-[14px] font-extrabold text-white shadow">
          📤 Pilih beberapa foto sekaligus (maks {MAKS})
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              pilihBanyak(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {antre.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-[#0F3D7A]/30 bg-[#F6F8FB] p-3">
          <p className="text-[14px] font-extrabold">Tandai jenis setiap foto</p>
          <p className="text-[12px] text-[#55657D]">Pilih foto ini termasuk yang mana. Satu jenis hanya untuk satu foto.</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {antre.map((a) => {
              const lama = a.slot ? hari.foto.some((f) => f.slot === a.slot) : false;
              return (
                <div key={a.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="p-1.5">
                    <select
                      value={a.slot}
                      disabled={massal}
                      onChange={(e) => tandai(a.id, Number(e.target.value))}
                      className={`w-full rounded-lg border px-1.5 py-1.5 text-[12px] font-bold outline-none ${a.slot ? "border-[#0F3D7A]/40 text-[#0F3D7A]" : "border-red-300 text-red-700"}`}
                    >
                      <option value={0}>— Pilih jenis —</option>
                      {SARAN_FOTO.map((lbl, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}. {lbl}
                          {hari.foto.some((f) => f.slot === i + 1) ? " (ganti foto lama)" : ""}
                        </option>
                      ))}
                    </select>
                    {lama && <p className="mt-0.5 text-[10.5px] font-semibold text-amber-700">Akan mengganti foto lama</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" disabled={massal} onClick={batalAntre} className="rounded-xl border border-[#C9D6EA] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0F3D7A] disabled:opacity-50">
              Batal
            </button>
            <button
              type="button"
              disabled={massal || antre.some((a) => !a.slot)}
              onClick={unggahSemua}
              className="flex-1 rounded-xl bg-[#1E7A4C] py-2.5 text-[14px] font-extrabold text-white shadow disabled:opacity-50"
            >
              {massal ? "Mengunggah…" : `Unggah ${antre.length} foto`}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {Array.from({ length: MAKS }, (_, i) => i + 1).map((slot) => {
          const f = hari.foto.find((x) => x.slot === slot);
          const p = progres[slot];
          return (
            <div key={slot} className={`group relative aspect-[4/3] overflow-hidden rounded-xl ${f ? "bg-slate-900" : boleh ? "border-2 border-dashed border-[#B9C7DA] bg-[#F6F8FB]" : "border border-slate-200 bg-slate-50"}`}>
              {f?.url && (
                <button type="button" onClick={() => setLihat(f.url)} className="absolute inset-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Foto ${slot}`} className="h-full w-full object-cover" />
                </button>
              )}
              {f && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[10.5px] font-bold text-white shadow">
                  ✓ Foto {slot}{f.susulan ? " · susulan" : ""}
                </span>
              )}
              {!f && (
                <label className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center ${boleh ? "cursor-pointer" : ""}`}>
                  <span className="text-[22px]">{boleh ? "📷" : "🔒"}</span>
                  <span className="text-[12px] font-bold text-[#0F3D7A]">Foto {slot}</span>
                  <span className="text-[10.5px] leading-tight text-slate-500">{SARAN_FOTO[slot - 1]}</span>
                  {boleh && (
                    <input
                      ref={(el) => {
                        inputRef.current[slot] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) unggah(slot, file);
                      }}
                    />
                  )}
                </label>
              )}
              {f && boleh && (
                <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1">
                  <label className="flex-1 cursor-pointer rounded-lg bg-white/90 py-1 text-center text-[11px] font-bold text-[#0F3D7A] backdrop-blur">
                    Ganti
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) unggah(slot, file);
                      }}
                    />
                  </label>
                  <button type="button" onClick={() => hapus(slot)} className="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-red-700 backdrop-blur">
                    Hapus
                  </button>
                </div>
              )}
              {p !== undefined && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0F3D7A]/80 text-white">
                  <span className="text-[13px] font-bold">Mengunggah… {p}%</span>
                  <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/30">
                    <div className="h-full bg-white transition-all" style={{ width: `${p}%` }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {boleh && jml < MAKS && (
        <p className="mt-2.5 text-[12px] text-[#55657D]">Ketuk kotak foto untuk memotret per jenis, atau pakai tombol "Pilih beberapa foto sekaligus" lalu tandai jenisnya. Foto otomatis dikecilkan agar hemat kuota.</p>
      )}

      {lihat && (
        <button type="button" onClick={() => setLihat(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lihat} alt="Pratinjau" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </section>
  );
}
