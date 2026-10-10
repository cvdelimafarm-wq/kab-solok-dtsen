"use client";

// (7 Okt 2026) Portal satu login -- beranda: kartu sesuai peran & periode (dihitung server, /api/portal/beranda).
// (8 Okt 2026) Beranda HP mengikuti mockup identitas SIGAP, variasi 3 "Tugas utama + ikon cepat" (permintaan user): saat pertama masuk,
// kartu atas menampilkan SATU tugas paling mendesak (pelatihan: kuis live / tes / presensi / foto / langkah berikutnya; kegiatan lain dari kartu),
// lalu menu sebagai ikon cepat 4 kolom (titik emas = ada tugas aktif). Pemilihan tugas: lib/sigapTugasUtama.ts.
// (8 Okt 2026) Struktur 3 layer (permintaan user, mockup disetujui): halaman lama "Menu Anda" (/sigap) dihapus; Beranda ini = Layer 1 "Kegiatan saya":
// ikon bulat per kegiatan dengan cincin progres + tanda seru bila mendesak, mendesak di depan (lib/sigapKegiatan.ts). Mengetuk ikon membuka
// Layer 2 (tahapan bernomor) atau langsung halaman kerja bila kegiatan belum punya tahapan terukur.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Kartu } from "@/lib/portal/server";
import { ikonKartu, pilihTugasUtama, tugasDariKartu, tugasUtamaPelatihan, type HubTugas, type NadaLencana, type TugasUtama } from "@/lib/sigapTugasUtama";
import { ringkasDariKartu, ringkasPelatihan, tugasDariKegiatan, urutKegiatan, type NadaKegiatan, type RingkasKegiatan } from "@/lib/sigapKegiatan";
import { ringkasInduk, susunTahap, tahapSekarang, type Induk } from "@/lib/sigapTahap";
import { IkonKegiatan } from "./CincinKegiatan";
import AktifkanNotifikasi from "./AktifkanNotifikasi";
import PengaturanAwal from "./PengaturanAwal";
import ModalFotoPanitia from "@/app/sigap/pelatihan/ModalFotoPanitia"; // (9 Okt 2026) pengingat foto pelatihan untuk panitia
import ModalRapat from "./ModalRapat"; // (9 Okt 2026) presensi rapat Zoom (modal + token)
import GantiPinCepat from "./GantiPinCepat";
import IkonMenu from "./IkonMenu";
import { matikanPush } from "./pushKlien";
import { PIN_AWAL } from "@/lib/sigapMasukNama";
import { apiPortal, bacaSesi, hapusSemuaSesi, simpanPenyisiran, type SsoPenyisiran } from "./sesi";

type Data = { nama: string; jenis: string; peran: string[]; peran_tautan?: Record<string, string | null>; admin_aplikasi: boolean; kartu: Kartu[]; pin_bawaan?: boolean };
type HubBeranda = HubTugas & { boleh_lihat_kelola: boolean; sekarang: string };
export type InfoDtsen = { nama: string; role: string | null } | null;

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const tanggalIndo = (ms: number) => {
  const d = new Date(ms + 7 * 3_600_000);
  return `${NAMA_HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${NAMA_BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const LENCANA: Record<NadaLencana, string> = {
  merah: "bg-[#FDE8E8] text-[#B42329]",
  emas: "bg-[#FFF4D6] text-[#8A6200]",
  biru: "bg-[#E6EEFC] text-[#1F5FD1]",
  hijau: "bg-[#E3F6EC] text-[#13794B]",
  abu: "bg-[#EEF2F7] text-[#5B6B84]",
};

/** "M. Iqbal Hadi, SST." -> "M. Iqbal Hadi"; inisial "MH". */
const namaSapaan = (n: string) => n.split(",")[0].trim();
const inisial = (n: string) => {
  const k = namaSapaan(n).split(/\s+/).filter((x) => x && !/\.$/.test(x));
  return ((k[0]?.[0] ?? "") + (k.length > 1 ? k[k.length - 1][0] : "")).toUpperCase() || "S";
};

export default function Beranda({ dtsen, onKeluar }: { dtsen: InfoDtsen; onKeluar: () => void }) {
  const adaSesi = typeof window !== "undefined" && !!bacaSesi();
  const [data, setData] = useState<Data | null>(null);
  const [hub, setHub] = useState<HubBeranda | null>(null);
  const [keg, setKeg] = useState<RingkasKegiatan[] | null>(null); // kegiatan bertahapan (Transport Lokal), /api/portal/kegiatan
  // (9 Okt 2026) kegiatan INDUK + tahap proses bisnis (mis. Pendataan Pascabencana: Perencanaan, Pelatihan, Pendataan, Evaluasi), /api/portal/induk
  const [induk, setInduk] = useState<Induk[] | null>(null);
  const [hubMuat, setHubMuat] = useState<"memuat" | "siap" | "gagal">("memuat");
  const [offset, setOffset] = useState(0); // selisih jam server - jam HP
  const [tik, setTik] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  // (8 Okt 2026) Ajakan ganti PIN awal 1303: spanduk tetap tampil sampai PIN diganti; tombolnya membuka layar ganti cepat.
  const [gantiPin, setGantiPin] = useState(false);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return;
    try {
      setData(await apiPortal<Data>("/api/portal/beranda"));
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return onKeluar();
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [onKeluar]);

  // Data pelatihan (untuk menentukan tugas paling mendesak). Gagal -> beranda tetap jalan tanpa bagian pelatihan.
  const muatHub = useCallback(async () => {
    if (!bacaSesi()) return;
    try {
      const h = await apiPortal<HubBeranda>("/api/sigap/pelatihan");
      setOffset(Date.parse(h.sekarang) - Date.now());
      setHub(h);
      setHubMuat("siap");
    } catch {
      setHubMuat((m) => (m === "siap" ? m : "gagal"));
    }
  }, []);

  const muatKeg = useCallback(async () => {
    if (!bacaSesi()) return;
    try {
      const d = await apiPortal<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan");
      setKeg(d.kegiatan);
    } catch {
      /* gagal: Transport Lokal tampil dari kartu biasa (tanpa cincin progres) */
    }
  }, []);

  const muatInduk = useCallback(async () => {
    if (!bacaSesi()) return;
    try {
      const d = await apiPortal<{ induk: Induk[] }>("/api/portal/induk");
      setInduk(d.induk);
    } catch {
      /* gagal: Beranda memakai ikon lama (pelatihan, Transport Lokal, bencana terpisah) */
    }
  }, []);

  useEffect(() => {
    muat();
    muatHub();
    muatKeg();
    muatInduk();
  }, [muat, muatHub, muatKeg, muatInduk]);

  // jam berjalan (sisa waktu) tiap 30 dtk; data pelatihan disegarkan tiap menit saat layar terlihat
  useEffect(() => {
    const a = setInterval(() => setTik((x) => x + 1), 30_000);
    const b = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      muatHub();
      muatKeg();
      muatInduk();
    }, 60_000);
    const c = () => {
      if (document.visibilityState !== "visible") return;
      muatHub();
      muatKeg();
      muatInduk();
    };
    document.addEventListener("visibilitychange", c);
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener("visibilitychange", c);
    };
  }, [muatHub, muatKeg, muatInduk]);

  async function keluar() {
    // (8 Okt 2026) lepas notifikasi push perangkat ini dari akun sebelum sesi dihapus (HP bisa dipakai bergantian)
    await Promise.race([matikanPush(), new Promise((r) => setTimeout(r, 2500))]);
    hapusSemuaSesi();
    if (dtsen) await createClient().auth.signOut().catch(() => {});
    onKeluar();
  }

  async function bukaSso(k: Kartu) {
    if (k.sso !== "penyisiran") return;
    setSibuk(k.kode);
    setError(null);
    try {
      const d = await apiPortal<SsoPenyisiran>("/api/portal/sso", { method: "POST", body: JSON.stringify({ app: "penyisiran" }) });
      simpanPenyisiran(d);
      window.location.href = "/penyisiran";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuka penyisiran.");
      setSibuk(null);
    }
  }

  const nowMs = Date.now() + offset;
  const { kartu, utama, kegiatan } = useMemo(() => {
    const k: Kartu[] = [...(data?.kartu ?? [])];
    if (dtsen) {
      k.unshift({
        kode: "dtsen-operator",
        grup: "tugas",
        judul: "Usulan Update Data DTSEN",
        uraian: "Terbitkan surat keterangan & pantau status usulan.",
        status: { label: "Aktif", nada: "aktif" },
        href: "/dashboard",
        label_aksi: "Buka dashboard",
      });
    }
    const sekarang = Date.now() + offset;
    const tp = hub ? tugasUtamaPelatihan(hub, sekarang) : null;
    const pel = hub ? ringkasPelatihan(hub, sekarang) : null;

    // Layer 1: semua kegiatan berlangsung. Transport Lokal: bertahapan dari server; sebelum/kalau gagal dimuat, dari kartu (tanpa cincin terukur).
    const translokKartu = k.filter((x) => x.kode.startsWith("translok-") && x.grup === "tugas");
    const translok: RingkasKegiatan[] =
      keg ??
      translokKartu.map((x) => ({
        id: x.kode,
        judul: x.judul,
        pendek: x.judul.replace(/^Transport Lokal — /, "Translok "),
        ikon: "motor" as const,
        nada: (x.status?.nada === "tenggang" ? "emas" : x.status?.nada === "info" ? "abu" : "biru") as NadaKegiatan,
        pecahan: null,
        selesai: null,
        total: null,
        sub: x.status?.label ?? "Buka",
        peringatan: x.status?.nada === "tenggang",
        href: x.href ?? null,
      }));
    const lain = k.map(ringkasDariKartu).filter((x): x is RingkasKegiatan => !!x);

    // (9 Okt 2026) Kegiatan INDUK: pelatihan, Transport Lokal, dan pendataan bencana yang tergabung dalam satu kegiatan diringkas menjadi SATU ikon
    // (Layer 1); tahapnya tampil di Layer 2. Menunggu data pelatihan & Transport Lokal siap dulu supaya ikon tidak berganti-ganti.
    const indukRingkas: RingkasKegiatan[] = [];
    const serap = new Set<string>();
    let tujuanBencana: { href: string; judul: string; uraian: string } | null = null;
    if (induk && keg && hubMuat !== "memuat") {
      for (const i of induk) {
        const r = ringkasInduk({ induk: i, hub, hubMuat, keg, nowMs: sekarang });
        if (!r) continue;
        indukRingkas.push(r);
        i.menyerap.forEach((x) => serap.add(x));
        // (10 Okt 2026) Tombol "Tugas aktif" pendataan bencana harus ke TAHAP yang sedang dikerjakan (mis. Pendataan), bukan ke halaman konfirmasi
        // undangan lama -- permintaan user (tangkapan layar akun Valina). Tahap sekarang = yang mendesak/perlu; bila tak ada, tahap yang berjalan; bila tak ada, garis waktu kegiatan.
        if (i.menyerap.includes("bencana")) {
          const ts = susunTahap({ induk: i, hub, hubMuat, keg, nowMs: sekarang });
          const kini = tahapSekarang(ts);
          const tujuan = kini?.tahap ?? ts.find((x) => !x.terkunci && x.status === "berjalan") ?? null;
          tujuanBencana = {
            href: tujuan?.rute ?? `/sigap/kegiatan/${i.kode}`,
            judul: i.nama,
            uraian: tujuan ? `Tahap ${tujuan.no} · ${tujuan.nama}${kini ? `: ${kini.modul.ket}` : ""}` : "Lihat tahapan dan tugas Anda.",
          };
        }
      }
    }
    const semua = urutKegiatan([...indukRingkas, ...(pel && !serap.has("pelatihan") ? [pel] : []), ...translok.filter((x) => !serap.has(x.id)), ...lain.filter((x) => !serap.has(x.id))]);

    // menu: sisa kartu (referensi, riwayat, pengelolaan) yang bukan kegiatan di Layer 1
    const jadiKegiatan = (x: Kartu) => (x.grup === "tugas" && (x.kode.startsWith("translok-") || ringkasDariKartu(x) !== null)) || x.kode === "pelatihan" || x.kode === "pelatihan-undangan" || x.kode === "pelatihan-instrumen";
    const sisa = k.filter((x) => !jadiKegiatan(x));
    if (hub?.boleh_lihat_kelola) sisa.push({ kode: "pelatihan-kelola", grup: "kelola", judul: "Kelola Pelatihan", uraian: "Peserta, presensi, tes, notifikasi.", href: "/sigap/kelola/pelatihan" });
    const tanpaTranslok = keg ? k.filter((x) => !x.kode.startsWith("translok-")) : k;
    const untukTugas = tujuanBencana ? tanpaTranslok.map((x) => (x.kode === "bencana" && x.grup === "tugas" ? { ...x, ...tujuanBencana } : x)) : tanpaTranslok;
    return { kartu: sisa, kegiatan: semua, utama: pilihTugasUtama(tp, tugasDariKegiatan(keg ?? [], sekarang), tugasDariKartu(untukTugas)) };
    // `tik` memaksa hitung ulang tiap 30 dtk (sisa waktu tes/foto berjalan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dtsen, hub, hubMuat, keg, induk, offset, tik]);

  const nama = data?.nama ?? dtsen?.nama ?? "";
  const menu = kartu.filter((k) => k.grup !== "kelola");
  const kelola = kartu.filter((k) => k.grup === "kelola");
  const menuUrut = [...menu].sort((a, b) => {
    const rank = (k: Kartu) => (k.grup === "tugas" ? 1 : k.grup === "referensi" ? 2 : 3);
    return rank(a) - rank(b);
  });
  // tombol "Kegiatan saya": kartu SSO (penyisiran) butuh aksi khusus -> cari kartunya
  const bukaSsoKegiatan = (idKeg: string) => {
    const kt = (data?.kartu ?? []).find((x) => x.kode === idKeg);
    if (kt) bukaSso(kt);
  };
  const memuatAwal = adaSesi && !data && !error;

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-[84px] pt-6 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2.5">
          {/* (9 Okt 2026) logo = tombol ke Beranda (di sini: kembali ke puncak halaman) */}
          <a
            href="/"
            aria-label="SIGAP, ke Beranda"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] bg-white shadow-[0_4px_12px_rgba(4,16,40,.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sigap-logo.png" alt="" width={29} height={29} className="h-[29px] w-[29px] object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-extrabold leading-none">SIGAP</span>
              <span className="mt-[3px] block truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-[#A9BCD8]">Sistem Integrasi Kegiatan BPS</span>
            </span>
          </a>
          {nama && <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#F4B400] text-[13px] font-extrabold text-[#0F2A52]">{inisial(nama)}</span>}
          <button type="button" onClick={keluar} className="flex-none rounded-lg border border-white/25 px-3 py-1.5 text-[12.5px] font-semibold text-[#D3E0F5] hover:bg-white/10">
            Keluar
          </button>
        </div>
        <div className="relative mx-auto mt-5 max-w-xl">
          <p className="text-[13px] text-[#A9BCD8]">{tanggalIndo(nowMs)}</p>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.3px]">Halo, {nama ? namaSapaan(nama) : "…"}</h1>
          <div className="-mx-5 mt-2.5 flex gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* (10 Okt 2026) label peran bisa ditekan -> membuka lembar pengelolaannya (tujuan dihitung server: peran_tautan) */}
            {(data?.peran ?? []).map((p) => {
              const tujuan = data?.peran_tautan?.[p] ?? null;
              if (!tujuan) return <span key={p} className="flex-none whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] text-[#D3E0F5]">{p}</span>;
              const kelasTekan = "flex-none whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] text-[#D3E0F5] ring-1 ring-white/25 transition hover:bg-white/20 active:bg-white/25";
              return tujuan.startsWith("http") ? (
                <a key={p} href={tujuan} target="_blank" rel="noopener noreferrer" className={kelasTekan} title={`Buka ${p}`}>{p} ›</a>
              ) : (
                <Link key={p} href={tujuan} className={kelasTekan} title={`Buka ${p}`}>{p} ›</Link>
              );
            })}
            {data?.jenis === "organik" && <span className="flex-none whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] text-[#D3E0F5]">Pegawai organik</span>}
            {data?.jenis === "mitra" && <span className="flex-none whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] text-[#D3E0F5]">Mitra statistik</span>}
            {dtsen && <span className="flex-none whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] text-[#D3E0F5]">Operator Wali Nagari</span>}
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-[62px] max-w-xl space-y-5 px-3.5">
        {data && <PengaturanAwal />}

        {/* Tugas utama */}
        {memuatAwal ? (
          <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-busy="true">
            <div className="h-3 w-28 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 flex items-center gap-3">
              <span className="h-[50px] w-[50px] animate-pulse rounded-[15px] bg-[#E6EDF8]" />
              <span className="flex-1 space-y-2">
                <span className="block h-4 w-3/4 animate-pulse rounded bg-[#E6EDF8]" />
                <span className="block h-3 w-1/2 animate-pulse rounded bg-[#EEF2F7]" />
              </span>
            </div>
            <div className="mt-4 h-[46px] animate-pulse rounded-[13px] bg-[#E6EDF8]" />
          </section>
        ) : (
          <KartuUtama u={utama} />
        )}

        {data?.pin_bawaan && (
          <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-[#F3DFA5] bg-[#FFF8E6] px-4 py-3 text-[13.5px] text-[#6B4C00]" role="alert">
            <IkonMenu n="awas" className="h-5 w-5 text-[#8A6200]" />
            <p className="min-w-[200px] flex-1 leading-snug">
              <b>Anda masih memakai PIN awal {PIN_AWAL}</b> yang sama dengan pegawai lain. Ganti dengan PIN sendiri agar akun Anda aman.
            </p>
            <button type="button" onClick={() => setGantiPin(true)} className="min-h-[40px] rounded-[12px] bg-[#1F5FD1] px-4 text-[13.5px] font-extrabold text-white hover:bg-[#1A4FB8]">
              Ganti PIN sekarang
            </button>
          </div>
        )}
        {error && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{error}</p>}
        {(data || dtsen) && kartu.length === 0 && kegiatan.length === 0 && (
          <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">
            Belum ada tugas atau menu aktif untuk akun Anda. Hubungi admin anggaran atau PJ kegiatan.
          </p>
        )}

        {kegiatan.length > 0 && (
          <section aria-label="Kegiatan saya">
            <div className="mb-2.5 flex items-baseline gap-2 px-1">
              <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Kegiatan saya</h2>
              <span className="text-[11.5px] text-[#6B7A90]">{kegiatan.length} kegiatan</span>
              {kegiatan.length > 1 && <span className="ml-auto text-[11.5px] text-[#6B7A90]">mendesak di depan</span>}
            </div>
            <ul className="grid grid-cols-3 gap-x-1.5 gap-y-4">
              {kegiatan.map((k) => (
                <li key={k.id}>
                  <IkonKegiatan k={k} sibuk={sibuk === k.id} onSso={() => bukaSsoKegiatan(k.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {menuUrut.length > 0 && <GrupIkon judul="Menu umum" isi={menuUrut} sibuk={sibuk} onSso={bukaSso} />}
        {kelola.length > 0 && <GrupIkon judul="Pengelolaan" isi={kelola} sibuk={sibuk} onSso={bukaSso} />}

        {data && <AktifkanNotifikasi />}
        {data && <ModalFotoPanitia />}
        {data && <ModalRapat />}
      </div>

      {gantiPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setGantiPin(false)}>
          <div className="max-h-full w-full max-w-[400px] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <GantiPinCepat
              onSelesai={() => {
                setGantiPin(false);
                setData((d) => (d ? { ...d, pin_bawaan: false } : d));
              }}
              onNanti={() => setGantiPin(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function KartuUtama({ u }: { u: TugasUtama | null }) {
  if (!u) {
    return (
      <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
        <span className="text-[11.5px] font-extrabold tracking-[0.16em] text-[#B8860B]">HARI INI</span>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-[50px] w-[50px] flex-none place-items-center rounded-[15px] bg-[#E3F6EC] text-[#13794B]">
            <IkonMenu n="centang" className="h-[26px] w-[26px]" />
          </span>
          <div>
            <p className="text-[16px] font-extrabold text-[#0F2A52]">Tidak ada tugas mendesak</p>
            <p className="text-[12.5px] text-[#5B6B84]">Pilih menu di bawah untuk melanjutkan.</p>
          </div>
        </div>
      </section>
    );
  }
  const p = u.progres;
  return (
    <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-label="Tugas utama">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-extrabold tracking-[0.16em] text-[#B8860B]">{u.label}</span>
        {u.lencana && <span className={`ml-auto rounded-[9px] px-2 py-[3px] text-[11px] font-bold ${LENCANA[u.lencana.nada]}`}>{u.lencana.teks}</span>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-[50px] w-[50px] flex-none place-items-center rounded-[15px] bg-gradient-to-br from-[#3B78E0] to-[#1A4590] text-white">
          <IkonMenu n={u.ikon} className="h-[26px] w-[26px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold leading-snug text-[#0F2A52]">{u.judul}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5B6B84]">{u.uraian}</p>
        </div>
      </div>
      {p && p.total > 0 && (
        <div className="mt-3.5" role="img" aria-label={`${p.selesai} dari ${p.total} langkah selesai`}>
          <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${p.total}, minmax(0, 1fr))` }}>
            {Array.from({ length: p.total }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-[3px] ${i < p.selesai ? "bg-[#19A463]" : "bg-[#E1E9F6]"}`} />
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-[#6B7A90]">{p.selesai} dari {p.total} selesai</p>
        </div>
      )}
      <Link href={u.href} className="mt-3.5 inline-flex min-h-[46px] w-full items-center justify-center rounded-[13px] bg-[#1F5FD1] px-4 text-[14.5px] font-extrabold text-white transition hover:bg-[#1A4FB8]">
        {u.aksi}
      </Link>
    </section>
  );
}

function GrupIkon({ judul, isi, sibuk, onSso }: { judul: string; isi: Kartu[]; sibuk: string | null; onSso: (k: Kartu) => void }) {
  return (
    <section aria-label={judul}>
      <h2 className="mb-2.5 px-1 text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
      <ul className="grid grid-cols-4 gap-x-1.5 gap-y-4 sm:grid-cols-5">
        {isi.map((k) => (
          <li key={k.kode}>
            <TileMenu k={k} sibuk={sibuk === k.kode} onSso={() => onSso(k)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Kartu "ada tugas" = grup tugas yang aktif / masa tenggang (titik emas di pojok ikon). */
const adaTugas = (k: Kartu) => k.grup === "tugas" && k.status?.nada !== "arsip" && k.status?.nada !== "info";

function TileMenu({ k, sibuk, onSso }: { k: Kartu; sibuk: boolean; onSso: () => void }) {
  const arsip = k.grup === "riwayat" || k.status?.nada === "arsip";
  const isi = (
    <span className={`flex flex-col items-center gap-1.5 ${arsip ? "opacity-70" : ""}`}>
      <span className={`relative grid h-14 w-14 place-items-center rounded-[17px] border border-[#DDE6F3] bg-white text-[#0F2A52] shadow-[0_2px_6px_rgba(15,42,82,.05)] ${sibuk ? "animate-pulse" : ""}`}>
        <IkonMenu n={ikonKartu(k.kode)} className="h-[25px] w-[25px]" />
        {adaTugas(k) && <span aria-hidden className="absolute -right-[3px] -top-[3px] h-2.5 w-2.5 rounded-full border-2 border-white bg-[#F4B400]" />}
      </span>
      <span className="line-clamp-2 min-h-[2.4em] text-center text-[11.5px] font-semibold leading-[1.2] text-[#1B2B4B]">{sibuk ? "Membuka…" : k.judul.replace(/^Transport Lokal — /, "Translok ").replace(/^Admin /, "Admin ")}</span>
      {adaTugas(k) && <span className="sr-only">ada tugas aktif</span>}
    </span>
  );
  const kelas = "block rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#1F5FD1]/50 active:scale-[0.97] transition";
  if (k.sso) {
    return (
      <button type="button" onClick={onSso} disabled={sibuk} className={`${kelas} w-full`}>
        {isi}
      </button>
    );
  }
  if (k.href) {
    return k.href.startsWith("http") ? (
      <a href={k.href} target="_blank" rel="noopener noreferrer" className={kelas}>
        {isi}
      </a>
    ) : (
      <Link href={k.href} className={kelas}>
        {isi}
      </Link>
    );
  }
  return <span className="block cursor-default">{isi}</span>;
}
