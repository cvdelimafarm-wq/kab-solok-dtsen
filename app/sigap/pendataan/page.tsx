"use client";

// app/sigap/pendataan/page.tsx
//
// (11 Okt 2026) Lembar Pendataan keroyokan PPL/PML (mockup disetujui user; pewarnaan "A": warna = PPL, bentuk = hasil).
// Seluruh anggota tim (PML + semua PPL-nya) melihat SEMUA KK di Sub SLS timnya dan menandai hasil: didata-terdampak, didata-tidak terdampak, tidak ditemukan.
// Hasil terakhir yang berlaku (menurut waktu kejadian di HP); pelaku tercatat di log. Tab: Peta | Daftar KK | Monitoring (bersama PPL dan PML).
// Tahap 1: titik KK di kanvas tanpa peta dasar; peta jalan offline (tahap 2), flag "segera didata" oleh PML (tahap 3), draf translok (tahap 4).
// (14 Okt 2026) Alur baru -- permintaan user: halaman dibuka dengan kartu "Plotting tim hari ini"; tab Peta | Daftar KK | Monitoring baru
// tampil setelah kartu Sub SLS diklik (alamat ?sub=<idsubsls>, tombol Kembali HP kembali ke kartu). Tombol "+ Keluarga baru" di kanan bawah.
// (14 Okt 2026) Desain ringkas -- permintaan user (mockup kanvas "Lembar Pendataan", HpPendataan.dc.html): TAMPILAN saja, logika catat/antrean/akses tidak berubah.
//   Header navy tunggal (judul + angka, pemilih Sub SLS, tab bersegmen); pemilih Sub SLS jadi lembar bawah (menggantikan <select> dan tombol "← Plotting tim");
//   kartu filter tunggal (bilah progres + pemilih PPL + 4 angka saring); peta mengisi sisa layar; Daftar KK satu kartu rapat; Monitoring per-PPL berupa baris (bukan tabel).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pilihSubPrioritas } from "@/lib/sigapSubPrioritas";
import IkonMenu from "@/app/portal/IkonMenu";
import { keAtas } from "@/app/portal/navigasi";
import BannerAntrean from "@/app/portal/BannerAntrean";
import { useAntrean } from "@/app/portal/antreanKirim";
import { dariAman } from "../identifikasi/useIdentifikasi";
import PlottingTim from "./PlottingTim";
import TambahKk from "./TambahKk";
import CapaianFloat from "./CapaianFloat";
import PetaKk, { IkonHasil, PANDANG_AWAL, warnaPelaku, type Pandang } from "./PetaKk";
import { inisial, namaDepan, tandaiKk, useKkSub, useTimPendataan, useUnduhKkLatar, uuid, waktuRingkas } from "./usePendataan";
import { apiPortal } from "@/app/portal/sesi";
import { tandaBasi } from "@/app/portal/dataBersama";
import { peringatanSekali, tglPanjangPerbaikan } from "@/lib/sigapPerbaikan";
import {
  HASIL_KK,
  LABEL_HASIL,
  LABEL_PENDEK,
  WARNA_BELUM,
  buatProyeksi,
  jarakMeter,
  ringkasPerPpl,
  ringkasPerSub,
  type Anggota,
  type HasilKk,
  type KkLembar,
  type SubTim,
} from "@/lib/pendataan";

type Tab = "peta" | "daftar" | "mon";
type FStatus = "semua" | "belum" | HasilKk;
type Urut = "belum" | "nama" | "dekat";
type Lembar = null | "sub" | "ppl";

const KUNCI_SUB = "sigap_pendataan_sub";
const KUNCI_PERBAIKAN = "sigap_perbaikan_tampung_v1";
const ALASAN_TIDAK_DITEMUKAN = ["Rumah kosong", "Pindah", "Menolak", "Alamat tidak ada"];
const SUBTEKS: Record<HasilKk, string> = { terdampak: "Keluarga terdampak bencana", tidak_terdampak: "Keluarga tidak terdampak", tidak_ditemukan: "Rumah kosong, pindah, menolak, atau alamat tidak ada" };
const URUT_LABEL: Record<Urut, string> = { belum: "Belum dulu", nama: "Nama", dekat: "Terdekat" };
const URUT_BERIKUT: Record<Urut, Urut> = { belum: "nama", nama: "dekat", dekat: "belum" };

// (14 Okt 2026) warna bilah progres: sama untuk kartu filter, Monitoring, dan lembar pilih
const WARNA_BAR = { terdampak: "#0F2A52", tidak_terdampak: "#4C86E8", tidak_ditemukan: "#B7791F", belum: "#CBD6E4" } as const;
const PIL: Record<HasilKk | "belum", [string, string, string]> = {
  terdampak: ["#0F2A52", "#FFFFFF", "Terdampak"],
  tidak_terdampak: ["#E6EEFC", "#1F5FD1", "Tidak"],
  tidak_ditemukan: ["#FFF4D6", "#8A6200", "Tdk temu"],
  belum: ["#EEF2F7", "#5B6B84", "Belum"],
};

const namaSub = (s: SubTim) => `${s.nagari} · ${s.sls}${s.sub_sls ? ` / ${s.sub_sls}` : ""}`;
const fmtJarak = (m: number) => (!Number.isFinite(m) ? "" : m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m / 10) * 10} m`);
/** "JORONG KAYU ARO" -> "Jorong Kayu Aro"; kata <= 2 huruf (II, IV, AA) tetap kapital. */
const judul = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
const namaPendek = (s: SubTim) => `${judul(s.sls)}${s.sub_sls ? ` / ${s.sub_sls}` : ""}`;
const persen = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Ikon garis inline (24x24, tebal 2) -- tanpa emoji. */
function Ik({ n, className = "h-[18px] w-[18px]" }: { n: "mata" | "pin" | "turun" | "kanan" | "tambah" | "kurang" | "semua" | "lokasi" | "cari" | "urut" | "lapis"; className?: string }) {
  const p = {
    mata: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
    turun: <path d="m6 9 6 6 6-6" />,
    kanan: <path d="m9 6 6 6-6 6" />,
    tambah: <path d="M12 5v14M5 12h14" />,
    kurang: <path d="M5 12h14" />,
    semua: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
    lokasi: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    cari: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    urut: <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />,
    lapis: (
      <>
        <path d="M3 7l9-4 9 4-9 4z" />
        <path d="m3 12 9 4 9-4M3 17l9 4 9-4" />
      </>
    ),
  }[n];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`flex-none fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] ${className}`}>
      {p}
    </svg>
  );
}

/** Avatar bulat berinisial, warna = warna PPL. */
function Av({ a, u = 22, tepi = true }: { a: Anggota | undefined; u?: number; tepi?: boolean }) {
  return (
    <span className={`grid flex-none place-items-center rounded-full text-[10.5px] font-extrabold leading-none text-white ${tepi ? "border-2 border-white" : ""}`} style={{ background: warnaPelaku(a), width: u, height: u }}>
      {a ? inisial(a.nama) : "?"}
    </span>
  );
}

/** Penanda bentuk hasil kecil (CSS) -- dipakai di kartu filter dan baris PPL. */
function Penanda({ k, warna, ukuran = 9 }: { k: HasilKk | "belum"; warna: string; ukuran?: number }) {
  if (k === "tidak_ditemukan") return <span className="inline-block flex-none rotate-45" style={{ width: ukuran - 1, height: ukuran - 1, background: warna }} />;
  if (k === "tidak_terdampak") return <span className="inline-block flex-none rounded-full border-2" style={{ width: ukuran, height: ukuran, borderColor: warna }} />;
  return <span className="inline-block flex-none rounded-full" style={{ width: ukuran, height: ukuran, background: warna }} />;
}

/** Bilah bertumpuk; bagian dengan n = 0 tidak digambar. */
function BilahTumpuk({ bagian, total, tinggi = 8, label }: { bagian: { n: number; warna: string }[]; total: number; tinggi?: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex overflow-hidden rounded-full bg-[#E3E9F2]" style={{ height: tinggi }}>
      {bagian.map((b, i) => (b.n > 0 && total > 0 ? <span key={i} style={{ width: `${(b.n / total) * 100}%`, background: b.warna }} /> : null))}
    </div>
  );
}

/** Lembar bawah (bottom sheet): latar gelap menutup, panel putih menempel di bawah. */
function LembarBawah({ judulLembar, kanan, onTutup, children }: { judulLembar: string; kanan?: string; onTutup: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={judulLembar}>
      <button type="button" aria-label="Tutup" onClick={onTutup} className="absolute inset-0 bg-[rgba(10,24,46,.45)]" />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[80dvh] max-w-xl flex-col rounded-t-[22px] bg-white px-3.5 pb-4 pt-2.5">
        <span className="mx-auto h-1 w-10 flex-none rounded-full bg-[#CBD6E4]" />
        <div className="mt-2 flex flex-none items-baseline">
          <h2 className="text-[16px] font-extrabold text-[#0F2A52]">{judulLembar}</h2>
          {kanan && <span className="ml-auto text-[12px] text-[#6B7A90]">{kanan}</span>}
        </div>
        <div className="mt-1.5 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function LembarPendataan() {
  const router = useRouter();
  const tim = useTimPendataan();
  const { menunggu } = useAntrean();
  const [dari, setDari] = useState<string | null>(null);
  const [subPilih, setSubPilih] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("peta");
  const [fStatus, setFStatus] = useState<FStatus>("semua");
  const [fPpl, setFPpl] = useState<number | null>(null);
  const [urut, setUrut] = useState<Urut>("belum");
  const [cari, setCari] = useState("");
  const [lembar, setLembar] = useState<Lembar>(null);
  const [terpilihId, setTerpilihId] = useState<number | null>(null);
  const [pandang, setPandang] = useState<Pandang>(PANDANG_AWAL);
  const [saya, setSaya] = useState<{ lat: number; lng: number } | null>(null);
  const [monPpl, setMonPpl] = useState<number | null>(null);
  const [toast, setToast] = useState<{ pesan: string; urungkan?: () => void } | null>(null);
  const dariKartu = useRef(false); // true bila Sub SLS dibuka dari kartu (ada entri riwayat yang bisa di-"back")
  // (15 Okt 2026) MODE PERBAIKAN (?perbaikan=<penugasan>&tgl=<hari kerja>): daftar KK sama persis, tetapi penandaan hanya ditampung dulu di HP ini lalu dikirim
  // sekali lewat tombol "Kirim perbaikan laporan" (dicatat sebagai pendataan tanggal hari kerja itu). Hanya KK yang belum punya hasil yang bisa ditandai.
  const [perbaikan, setPerbaikan] = useState<{ pen: number; tanggal: string } | null>(null);
  const [tampung, setTampung] = useState<Record<number, { hasil: HasilKk; alasan: string | null; kunci: string }>>({});
  const [infoPerbaikan, setInfoPerbaikan] = useState(false);
  const [konfirmKirim, setKonfirmKirim] = useState(false);
  const [kirimProses, setKirimProses] = useState(false);
  const [kirimPesan, setKirimPesan] = useState<string | null>(null);

  useEffect(() => {
    setDari(dariAman());
    try {
      // (14 Okt 2026) hanya ?sub di alamat yang langsung membuka Sub SLS; tanpa itu tampil kartu plotting dulu
      setSubPilih(new URLSearchParams(window.location.search).get("sub"));
      const q = new URLSearchParams(window.location.search);
      const pen = Number(q.get("perbaikan"));
      const tgl = q.get("tgl") ?? "";
      if (Number.isInteger(pen) && pen > 0 && /^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
        setPerbaikan({ pen, tanggal: tgl });
        setInfoPerbaikan(true);
        try {
          const simpan = JSON.parse(localStorage.getItem(`${KUNCI_PERBAIKAN}:${pen}:${tgl}`) ?? "null");
          if (simpan && typeof simpan === "object") setTampung(simpan);
        } catch {
          /* abaikan */
        }
      }
    } catch {
      /* abaikan */
    }
    const kembali = () => {
      dariKartu.current = false;
      setSubPilih(new URLSearchParams(window.location.search).get("sub"));
      setTerpilihId(null);
      setLembar(null);
    };
    window.addEventListener("popstate", kembali);
    return () => window.removeEventListener("popstate", kembali);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  // (14 Okt 2026) lembar bawah: Esc menutup
  useEffect(() => {
    if (!lembar) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && setLembar(null);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [lembar]);

  const data = tim.data;
  const subId = useMemo(() => {
    if (!data || data.sub.length === 0) return null;
    return data.sub.some((s) => s.idsubsls === subPilih) ? subPilih : null;
  }, [data, subPilih]);
  const kkQ = useKkSub(subId);
  useUnduhKkLatar(useMemo(() => (data ? data.sub.map((s) => s.idsubsls) : []), [data]), subId);

  const anggota = useMemo(() => new Map((data?.anggota ?? []).map((a) => [a.akun_id, a])), [data]);
  const kkAsli = useMemo(() => kkQ.data?.kk ?? [], [kkQ.data]);
  // mode perbaikan: tampilkan penandaan yang masih ditampung di atas daftar server (hanya KK yang belum punya hasil)
  const kk = useMemo(
    () => (perbaikan ? kkAsli.map((k) => (!k.hasil && tampung[k.id] ? { ...k, hasil: tampung[k.id].hasil, alasan: tampung[k.id].alasan, ppl_akun_id: data?.saya.akun_id ?? null } : k)) : kkAsli),
    [kkAsli, perbaikan, tampung, data]
  );
  const sayaAkun = data?.saya.akun_id ?? 0;

  const proj = useMemo(() => {
    const t = kk.filter((k) => k.lat !== null && k.lng !== null).map((k) => ({ lat: k.lat as number, lng: k.lng as number }));
    return buatProyeksi(t, 360, 440, 28);
  }, [kk]);
  const tanpaKoordinat = useMemo(() => kk.filter((k) => k.lat === null).length, [kk]);

  const hitung = useMemo(() => {
    const c = { semua: kk.length, belum: 0, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 };
    for (const k of kk) if (k.hasil) c[k.hasil]++;
    c.belum = c.semua - c.terdampak - c.tidak_terdampak - c.tidak_ditemukan;
    return c;
  }, [kk]);

  const lolos = (k: KkLembar) => (fStatus === "semua" ? true : fStatus === "belum" ? !k.hasil : k.hasil === fStatus) && (fPpl === null || k.ppl_akun_id === fPpl);
  const tampil = useMemo(() => new Set(kk.filter(lolos).map((k) => k.id)), [kk, fStatus, fPpl]); // eslint-disable-line react-hooks/exhaustive-deps

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const a = kk.filter(lolos).filter((k) => !q || k.nama_kk.toLowerCase().includes(q) || (k.anggota_lain ?? "").toLowerCase().includes(q));
    const jarak = (k: KkLembar) => (saya && k.lat !== null && k.lng !== null ? jarakMeter(saya, { lat: k.lat, lng: k.lng }) : Infinity);
    if (urut === "dekat" && saya) a.sort((p, q2) => jarak(p) - jarak(q2));
    else if (urut === "nama") a.sort((p, q2) => p.nama_kk.localeCompare(q2.nama_kk));
    else a.sort((p, q2) => Number(!!p.hasil) - Number(!!q2.hasil) || p.nama_kk.localeCompare(q2.nama_kk));
    return a;
  }, [kk, fStatus, fPpl, urut, saya, cari]); // eslint-disable-line react-hooks/exhaustive-deps

  const terpilih = terpilihId !== null ? kk.find((k) => k.id === terpilihId) ?? null : null;

  const perSub = useMemo(() => ringkasPerSub(data?.ringkas ?? []), [data]);
  const perPpl = useMemo(() => ringkasPerPpl(data?.ringkas ?? []), [data]);

  // (15 Okt 2026) ?utama=1 (dari tombol pengingat "Buka Lembar Pendataan"): langsung buka Sub SLS prioritas (lanjutan terakhir, atau sisa terbanyak).
  // Alamat dirapikan (utama dihapus, sub diisi) dengan replaceState, jadi tombol Kembali HP kembali ke halaman sebelumnya, bukan memutar ulang.
  const utamaDipakai = useRef(false);
  useEffect(() => {
    if (utamaDipakai.current || !data) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("utama") !== "1") return;
      utamaDipakai.current = true;
      u.searchParams.delete("utama");
      if (!u.searchParams.get("sub")) {
        let terakhir: string | null = null;
        try {
          terakhir = localStorage.getItem(KUNCI_SUB);
        } catch {
          /* abaikan */
        }
        const id = pilihSubPrioritas(data.sub.map((s) => s.idsubsls), perSub, terakhir);
        if (id) {
          pilihSub(id);
          setTab("peta");
          u.searchParams.set("sub", id);
        }
      }
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
    } catch {
      /* abaikan */
    }
  }, [data, perSub]); // eslint-disable-line react-hooks/exhaustive-deps

  function pilihSub(id: string) {
    setSubPilih(id);
    setTerpilihId(null);
    setPandang(PANDANG_AWAL);
    setFStatus("semua");
    setFPpl(null);
    setCari("");
    setSaya(null);
    try {
      localStorage.setItem(KUNCI_SUB, id);
    } catch {
      /* abaikan */
    }
  }

  function alamatSub(id: string | null): string {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("sub", id);
    else u.searchParams.delete("sub");
    return `${u.pathname}${u.search}${u.hash}`;
  }
  function bukaSub(id: string) {
    pilihSub(id);
    setTab("peta");
    try {
      window.history.pushState(window.history.state, "", alamatSub(id));
      dariKartu.current = true;
    } catch {
      /* abaikan */
    }
    window.scrollTo({ top: 0 });
  }
  function gantiSub(id: string) {
    pilihSub(id);
    try {
      window.history.replaceState(window.history.state, "", alamatSub(id));
    } catch {
      /* abaikan */
    }
  }
  function keKartu() {
    setTerpilihId(null);
    if (dariKartu.current) {
      dariKartu.current = false;
      window.history.back(); // popstate menutup Sub SLS
      return;
    }
    setSubPilih(null);
    try {
      window.history.replaceState(window.history.state, "", alamatSub(null));
    } catch {
      /* abaikan */
    }
  }

  function simpanTampung(baru: typeof tampung) {
    setTampung(baru);
    if (!perbaikan) return;
    try {
      localStorage.setItem(`${KUNCI_PERBAIKAN}:${perbaikan.pen}:${perbaikan.tanggal}`, JSON.stringify(baru));
    } catch {
      /* abaikan */
    }
  }
  const sudahAdaHasil = (k: KkLembar) => !!kkAsli.find((x) => x.id === k.id)?.hasil;
  async function kirimPerbaikan() {
    if (!perbaikan) return;
    setKirimProses(true);
    setKirimPesan(null);
    try {
      const items = Object.entries(tampung).map(([id, v]) => ({ kk_id: Number(id), hasil: v.hasil, alasan: v.alasan, kunci: v.kunci }));
      await apiPortal("/api/portal/perbaikan", { method: "POST", body: JSON.stringify({ aksi: "kirim_laporan", penugasan_id: perbaikan.pen, tanggal: perbaikan.tanggal, items }) });
      try {
        localStorage.removeItem(`${KUNCI_PERBAIKAN}:${perbaikan.pen}:${perbaikan.tanggal}`);
      } catch {
        /* abaikan */
      }
      tandaBasi("/api/portal/kegiatan");
      tandaBasi("/api/portal/pendataan");
      router.replace(`/sigap/perbaikan?p=${perbaikan.pen}`);
    } catch (e) {
      setKirimPesan(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim. Periksa sambungan lalu coba lagi.");
    } finally {
      setKirimProses(false);
    }
  }

  function tandai(k: KkLembar, hasil: HasilKk, alasan?: string) {
    if (!subId) return;
    if (perbaikan) {
      if (sudahAdaHasil(k)) return setToast({ pesan: "KK ini sudah punya hasil, tidak bisa diubah lewat perbaikan." });
      simpanTampung({ ...tampung, [k.id]: { hasil, alasan: alasan ?? null, kunci: tampung[k.id]?.kunci ?? uuid() } });
      return setToast({ pesan: `Ditandai: ${LABEL_HASIL[hasil]} (belum dikirim)` });
    }
    const sebelum = { hasil: k.hasil, ppl: k.ppl_akun_id, alasan: k.alasan };
    const r = tandaiKk(subId, k, hasil, alasan);
    if (!r.ok) return setToast({ pesan: r.pesan });
    // Urungkan hanya bila tidak menggeser atribusi rekan: KK sebelumnya belum didata, atau hasil milik saya sendiri
    const bisaUrung = sebelum.hasil === null || sebelum.ppl === sayaAkun;
    setToast({
      pesan: `Tersimpan: ${LABEL_HASIL[hasil]}`,
      urungkan: bisaUrung ? () => void tandaiKk(subId, k, sebelum.hasil ?? "belum", sebelum.hasil ? sebelum.alasan : null) : undefined,
    });
  }
  function kembalikan(k: KkLembar) {
    if (!subId) return;
    if (perbaikan) {
      if (sudahAdaHasil(k)) return setToast({ pesan: "KK ini sudah punya hasil, tidak bisa diubah lewat perbaikan." });
      const { [k.id]: _buang, ...sisa } = tampung; // eslint-disable-line @typescript-eslint/no-unused-vars
      simpanTampung(sisa);
      return setToast({ pesan: "Dikembalikan ke belum didata" });
    }
    const sebelum = { hasil: k.hasil, ppl: k.ppl_akun_id, alasan: k.alasan };
    const r = tandaiKk(subId, k, "belum");
    if (!r.ok) return setToast({ pesan: r.pesan });
    setToast({ pesan: "Dikembalikan ke belum didata", urungkan: sebelum.hasil && sebelum.ppl === sayaAkun ? () => void tandaiKk(subId, k, sebelum.hasil as HasilKk, sebelum.alasan) : undefined });
  }

  function cariPosisi() {
    if (!navigator.geolocation) return setToast({ pesan: "Perangkat ini tidak punya GPS." });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setSaya({ lat: p.coords.latitude, lng: p.coords.longitude });
        setUrut("dekat");
        setTab("daftar");
      },
      () => setToast({ pesan: "Lokasi tidak bisa dibaca. Izinkan lokasi untuk aplikasi ini lalu coba lagi." }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }
  // (14 Okt 2026) tombol urut satu ketukan: Belum dulu -> Nama -> Terdekat (butuh lokasi; bila belum ada, minta dulu)
  function gantiUrut() {
    const n = URUT_BERIKUT[urut];
    if (n === "dekat" && !saya) return cariPosisi();
    setUrut(n);
  }

  function lihatDiPeta(k: KkLembar) {
    if (!proj || k.lat === null || k.lng === null) return;
    setPandang({ cx: proj.x(k.lng), cy: proj.y(k.lat), z: 3.2 });
    setTab("peta");
  }

  const chipBase = "min-h-[40px] flex-none rounded-full px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5";
  const chipOn = "bg-[#0F2A52] text-white";
  const chipOff = "bg-white text-[#55657D] shadow-[0_2px_6px_rgba(15,42,82,.08)]";

  const subAktif = data?.sub.find((s) => s.idsubsls === subId) ?? null;
  const ppls = (data?.anggota ?? []).filter((a) => a.peran === "ppl");
  const bukanTim = tim.galat && /khusus anggota tim/i.test(tim.galat);

  const total = Object.values(perSub).reduce((n, s) => n + s.total, 0);
  const didata = Object.values(perSub).reduce((n, s) => n + s.didata, 0);
  const timHasil = Object.values(perSub).reduce(
    (h, s) => ({ terdampak: h.terdampak + s.total_hasil.terdampak, tidak_terdampak: h.tidak_terdampak + s.total_hasil.tidak_terdampak, tidak_ditemukan: h.tidak_ditemukan + s.total_hasil.tidak_ditemukan }),
    { terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 }
  );

  // (14 Okt 2026) Header: di tab Monitoring (dan saat belum membuka Sub SLS) pemilih = "Semua Sub SLS tim" dan angka = total tim
  const semuaSub = !subAktif || tab === "mon";
  const nagariUnik = Array.from(new Set((data?.sub ?? []).map((s) => s.nagari)));
  const kecUnik = Array.from(new Set((data?.sub ?? []).map((s) => s.kecamatan)));
  const urutSub = subAktif && data ? data.sub.findIndex((s) => s.idsubsls === subAktif.idsubsls) + 1 : 0;
  const hdrDidata = semuaSub ? didata : perSub[subAktif!.idsubsls]?.didata ?? 0;
  const hdrTotal = semuaSub ? total : perSub[subAktif!.idsubsls]?.total ?? 0;
  const hdrKet = semuaSub ? "KK tim" : "KK didata";

  // kelompok per nagari (urutan kemunculan) untuk lembar pilih Sub SLS dan kartu Per Sub SLS
  const kelompok = useMemo(() => {
    const out: { nagari: string; rows: SubTim[] }[] = [];
    for (const s of data?.sub ?? []) {
      let g = out.find((x) => x.nagari === s.nagari);
      if (!g) out.push((g = { nagari: s.nagari, rows: [] }));
      g.rows.push(s);
    }
    return out;
  }, [data]);

  const pplSaring = fPpl !== null ? anggota.get(fPpl) : undefined;
  const ringkasKk = (akun: number) => {
    const m = kk.filter((k) => k.ppl_akun_id === akun && k.hasil);
    return { n: m.length, td: m.filter((k) => k.hasil === "terdampak").length };
  };

  const adaFilter = !!data && !!subId && tab !== "mon" && kk.length > 0;

  return (
    <main className="flex min-h-[calc(100dvh_-_var(--tinggi-banner,0px))] flex-col bg-[#F2F6FC] text-[#1B2B4B]">
      {/* Header navy: baris 1 judul + angka, baris 2 pemilih Sub SLS, baris 3 tab bersegmen (sama untuk tiga tab) */}
      <header className="flex-none bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-3 pb-2.5 pt-2 text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => (subId ? keKartu() : keAtas(router, dari ?? "/"))} aria-label="Kembali" className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-white/[.14] active:bg-white/25">
              <IkonMenu n="kembali" className="h-[18px] w-[18px] text-white" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16.5px] font-extrabold leading-[1.15]">Lembar Pendataan</h1>
              <p className="truncate text-[11.5px] text-[#A9BCD8]">{data ? `Tim ${namaDepan(data.pml.nama)} · ${data.saya.peran === "pml" ? "PML" : "PPL"}` : "Pendataan Pascabencana"}</p>
            </div>
            {data && data.sub.length > 0 && (
              <div className="flex-none text-right">
                <div className="text-[15px] font-extrabold leading-[1.1]">
                  {hdrDidata}
                  <span className="text-[11.5px] font-semibold text-[#A9BCD8]">/{hdrTotal}</span>
                </div>
                <div className="text-[10.5px] text-[#A9BCD8]">{hdrKet}</div>
              </div>
            )}
          </div>

          {data && subId && subAktif && (
            <>
              <button type="button" onClick={() => setLembar("sub")} aria-haspopup="dialog" className="flex h-[46px] items-center gap-2.5 rounded-[12px] border border-white/[.16] bg-white/10 px-3 text-left active:bg-white/20">
                <Ik n="pin" className="h-[18px] w-[18px] text-[#F4B400]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-extrabold leading-tight text-white">{semuaSub ? "Semua Sub SLS tim" : namaPendek(subAktif)}</span>
                  <span className="block truncate text-[11px] leading-tight text-[#C9D8EE]">
                    {semuaSub
                      ? `${data.sub.length} Sub SLS · ${nagariUnik.length} nagari · ${kecUnik.length === 1 ? `Kec. ${judul(kecUnik[0])}` : `${kecUnik.length} kecamatan`}`
                      : `${judul(subAktif.nagari)} · Kec. ${judul(subAktif.kecamatan)}`}
                  </span>
                </span>
                {!semuaSub && <span className="flex-none whitespace-nowrap text-[11px] font-bold text-[#D3E0F5]">{`${urutSub}/${data.sub.length}`}</span>}
                <Ik n="turun" className="h-4 w-4 text-[#D3E0F5]" />
              </button>
              <div role="tablist" aria-label="Tampilan" className="flex gap-[3px] rounded-[12px] bg-white/10 p-[3px]">
                {([
                  ["peta", "Peta"],
                  ["daftar", "Daftar KK"],
                  ["mon", "Monitoring"],
                ] as [Tab, string][]).map(([k, t]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`grid h-[34px] flex-1 place-items-center rounded-[9px] text-[13px] font-bold ${tab === k ? "bg-white text-[#0F2A52]" : "text-[#D3E0F5]"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* (15 Okt 2026) MODE PERBAIKAN: strip sorot + tombol kirim di paling atas; jendela info saat dibuka */}
      {perbaikan && (
        <div className="mx-auto w-full max-w-xl space-y-2 px-2.5 pt-2.5">
          <div className="rounded-[14px] border-l-4 border-[#E0A526] bg-[#FFF4D6] px-3 py-2.5 text-[12.5px] leading-snug text-[#5E4300]">
            <b>MODE PERBAIKAN.</b> Hasil yang Anda tandai di sini direkam sebagai pendataan tanggal <b>{tglPanjangPerbaikan(perbaikan.tanggal)}</b> dan akan masuk ke laporan translok tanggal itu. Hanya KK yang belum punya hasil yang bisa ditandai.
          </div>
          <button
            type="button"
            disabled={Object.keys(tampung).length === 0}
            onClick={() => {
              setKirimPesan(null);
              setKonfirmKirim(true);
            }}
            className="min-h-[48px] w-full rounded-xl bg-[#E0A526] px-4 text-[14.5px] font-extrabold text-[#1E2A47] shadow-sm disabled:opacity-55"
          >
            {`Kirim perbaikan laporan (hari kerja ${Number(perbaikan.tanggal.slice(8))}/${Number(perbaikan.tanggal.slice(5, 7))}) · ${Object.keys(tampung).length} KK`}
          </button>
        </div>
      )}

      <div className={`mx-auto flex w-full max-w-xl flex-1 flex-col ${subId ? "" : "pb-28"}`}>
        <div className="space-y-2 px-2.5 pt-2.5 empty:hidden">
            {tim.galat && (
              <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
                {bukanTim ? "Lembar Pendataan khusus anggota tim PML dan PPL. Akun Anda belum terhubung ke tim pendataan." : tim.galat}
              </p>
            )}
            {!data && !tim.galat && <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}
            <BannerAntrean satuan="penandaan" />
            {data && data.sub.length === 0 && <p className="rounded-[16px] bg-white p-4 text-[13px] text-[#55657D] shadow-[0_8px_22px_rgba(15,42,82,.08)]">Tim Anda belum mendapat pembagian Sub SLS.</p>}
        </div>

        {/* (13 Okt 2026) Kartu plotting tim tampil PERTAMA: PML memilih maks. 2 Sub SLS + PPL lalu Kirim; PPL hanya melihat -- permintaan user */}
        {/* (14 Okt 2026) kartu Sub SLS diklik -> buka Peta | Daftar KK | Monitoring Sub SLS itu */}
        {data && data.sub.length > 0 && !subId && (
          <div className="px-3.5 pt-3">
            <PlottingTim anggota={data.anggota} sub={data.sub} totalKk={(id) => perSub[id]?.total ?? 0} sayaAkun={sayaAkun} onBuka={bukaSub} />
          </div>
        )}

        {data && subId && tab !== "mon" && (
          <>
            {kkQ.galat && !kkQ.data && <p className="mx-2.5 mt-2.5 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kkQ.galat}</p>}
            {kkQ.memuat && <div className="mx-2.5 mt-2.5 h-24 animate-pulse rounded-[16px] bg-white" aria-busy="true" />}
            {kkQ.data && kk.length === 0 && (
              <p className="mx-2.5 mt-2.5 rounded-[16px] bg-white p-4 text-[13px] text-[#55657D] shadow-[0_8px_22px_rgba(15,42,82,.08)]">Daftar KK untuk Sub SLS ini belum diunggah admin.</p>
            )}
          </>
        )}

        {/* Kartu filter tunggal (Peta dan Daftar KK): bilah progres + pemilih PPL + empat angka saring (ketuk = saring, ketuk lagi = semua) */}
        {adaFilter && (
          <section aria-label="Saringan" className="mx-2.5 mt-2 flex flex-none flex-col gap-1.5 rounded-[16px] bg-white px-2.5 py-2 shadow-[0_2px_10px_rgba(15,42,82,.06)]">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <BilahTumpuk
                  total={hitung.semua}
                  label={`${hitung.semua - hitung.belum} dari ${hitung.semua} KK didata`}
                  bagian={[
                    { n: hitung.terdampak, warna: WARNA_BAR.terdampak },
                    { n: hitung.tidak_terdampak, warna: WARNA_BAR.tidak_terdampak },
                    { n: hitung.tidak_ditemukan, warna: WARNA_BAR.tidak_ditemukan },
                    { n: hitung.belum, warna: WARNA_BAR.belum },
                  ]}
                />
              </div>
              <button type="button" onClick={() => setLembar("ppl")} aria-haspopup="dialog" className="inline-flex h-[30px] flex-none items-center gap-1 rounded-full border border-[#DCE5F2] bg-[#F1F5FC] pl-1 pr-1.5 active:bg-[#E3ECFB]">
                <span className="flex">
                  {pplSaring ? (
                    <Av a={pplSaring} />
                  ) : (
                    ppls.slice(0, 3).map((a, j) => (
                      <span key={a.akun_id} style={{ marginLeft: j ? -5 : 0 }}>
                        <Av a={a} />
                      </span>
                    ))
                  )}
                </span>
                <span className="ml-0.5 text-[12px] font-extrabold text-[#0F2A52]">{pplSaring ? namaDepan(pplSaring.nama) : "Semua PPL"}</span>
                <Ik n="turun" className="h-3.5 w-3.5 text-[#5B6B84]" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-[3px]" role="group" aria-label="Saring menurut status">
              {([
                ["terdampak", "Terdampak", hitung.terdampak],
                ["tidak_terdampak", "Tdk terdampak", hitung.tidak_terdampak],
                ["tidak_ditemukan", "Tdk ditemukan", hitung.tidak_ditemukan],
                ["belum", "Belum", hitung.belum],
              ] as [FStatus, string, number][]).map(([k, teks, n]) => {
                const on = fStatus === k;
                const ink = on ? "#FFFFFF" : "#0F2A52";
                const bentuk = (k === "belum" ? "belum" : k) as HasilKk | "belum";
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFStatus(on ? "semua" : k)}
                    className={`flex min-w-0 flex-col items-center gap-px rounded-[10px] px-0 py-1 ${on ? "bg-[#0F2A52]" : "bg-[#F5F8FE] shadow-[inset_0_0_0_1px_#E4ECF8]"}`}
                  >
                    <span className="inline-flex items-center gap-[5px] text-[15px] font-extrabold leading-tight" style={{ color: ink }}>
                      <Penanda k={bentuk} warna={k === "belum" && !on ? "#9AA6B6" : on ? "#D3E0F5" : ink} />
                      {n}
                    </span>
                    <span className="whitespace-nowrap text-[10.5px] font-semibold leading-tight tracking-[-0.4px]" style={{ color: on ? "#D3E0F5" : "#6B7A90" }}>
                      {teks}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- Peta: mengisi sisa layar */}
        {data && subId && tab === "peta" && kk.length > 0 && (
          <section className="relative m-2.5 min-h-[340px] flex-1 overflow-hidden rounded-[18px] border border-[#DDE3D6] bg-[#EEF2F7]">
            {proj ? (
              <>
                <div className="absolute inset-0">
                  <PetaKk kk={kk} proj={proj} anggota={anggota} pandang={pandang} setPandang={(f) => setPandang(f)} terpilih={terpilihId} tampil={tampil} onPilih={setTerpilihId} saya={saya} />
                </div>
                {/* satu pil vertikal: perbesar, perkecil, tampilkan semua */}
                <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_4px_12px_rgba(15,42,82,.15)]">
                  <button type="button" aria-label="Perbesar" onClick={() => setPandang((p) => ({ ...p, z: Math.min(8, p.z * 1.6) }))} className="grid h-[40px] w-[40px] place-items-center border-b border-[#EEF2F7] text-[#0F2A52] active:bg-[#F1F5FC]">
                    <Ik n="tambah" />
                  </button>
                  <button type="button" aria-label="Perkecil" onClick={() => setPandang((p) => ({ ...p, z: Math.max(1, p.z / 1.6) }))} className="grid h-[40px] w-[40px] place-items-center border-b border-[#EEF2F7] text-[#0F2A52] active:bg-[#F1F5FC]">
                    <Ik n="kurang" />
                  </button>
                  <button type="button" aria-label="Tampilkan semua" onClick={() => setPandang(PANDANG_AWAL)} className="grid h-[40px] w-[40px] place-items-center text-[#0F2A52] active:bg-[#F1F5FC]">
                    <Ik n="semua" />
                  </button>
                </div>
                {/* lokasi saya: kanan bawah, di atas tombol "Keluarga baru" yang mengambang (perilaku lama: urut terdekat) */}
                <button type="button" aria-label="Terdekat dari saya" onClick={cariPosisi} className="absolute bottom-[92px] right-2.5 grid h-[40px] w-[40px] place-items-center rounded-[12px] bg-white text-[#1F5FD1] shadow-[0_4px_12px_rgba(15,42,82,.15)] active:bg-[#F1F5FC]">
                  <Ik n="lokasi" />
                </button>
                {/* legenda bentuk kecil, kiri bawah */}
                <div className="absolute bottom-[34px] left-2.5 flex max-w-[150px] flex-col gap-0.5 rounded-[10px] bg-white/[.92] px-2.5 py-[5px] text-[10.5px] font-bold text-[#44546F]">
                  <span className="inline-flex items-center gap-1.5"><Penanda k="terdampak" warna="#44546F" />Terdampak</span>
                  <span className="inline-flex items-center gap-1.5"><Penanda k="tidak_terdampak" warna="#44546F" />Tidak terdampak</span>
                  <span className="inline-flex items-center gap-1.5"><Penanda k="tidak_ditemukan" warna="#44546F" />Tdk ditemukan</span>
                  <span className="font-semibold text-[#5B6B84]">Warna = PPL</span>
                  {tanpaKoordinat > 0 && <span className="font-semibold leading-tight text-[#5B6B84]">{tanpaKoordinat} KK tanpa koordinat hanya di Daftar KK</span>}
                </div>
              </>
            ) : (
              <p className="p-6 text-center text-[13px] text-[#55657D]">Belum ada KK yang punya koordinat di Sub SLS ini. Gunakan tab Daftar KK.</p>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------------- Daftar KK: cari + urut, satu kartu rapat */}
        {data && subId && tab === "daftar" && kk.length > 0 && (
          <section className="flex flex-1 flex-col gap-2 px-2.5 pt-2">
            <div className="flex gap-1.5">
              <label className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-[#DCE5F2] bg-white px-3 text-[#8A96A8]">
                <Ik n="cari" className="h-4 w-4" />
                <span className="sr-only">Cari nama KK</span>
                <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama KK" className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1B2B4B] outline-none placeholder:text-[#8A96A8]" />
              </label>
              <button type="button" onClick={gantiUrut} aria-label={`Urutan: ${URUT_LABEL[urut]}. Ketuk untuk mengganti`} className="inline-flex h-[38px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[12px] border border-[#DCE5F2] bg-white px-2.5 text-[12px] font-bold text-[#0F2A52] active:bg-[#F1F5FC]">
                <Ik n="urut" className="h-[15px] w-[15px]" />
                {URUT_LABEL[urut]}
              </button>
            </div>
            {/* padding bawah ~70 px supaya KK terakhir tidak tertutup tombol "Keluarga baru" */}
            <div className="rounded-[16px] bg-white pb-[70px] shadow-[0_2px_10px_rgba(15,42,82,.06)]">
              {daftar.length === 0 && <p className="p-4 text-[13px] text-[#55657D]">Tidak ada KK dengan penyaringan ini.</p>}
              {daftar.map((k) => {
                const a = k.ppl_akun_id ? anggota.get(k.ppl_akun_id) : undefined;
                const jarak = saya && k.lat !== null && k.lng !== null ? fmtJarak(jarakMeter(saya, { lat: k.lat, lng: k.lng })) : "";
                const p = PIL[k.hasil ?? "belum"];
                return (
                  <button key={k.id} type="button" onClick={() => setTerpilihId(k.id)} className="flex w-full items-center gap-[11px] border-b border-[#EEF2F7] px-3 py-2 text-left last:border-b-0 active:bg-[#F1F6FE]">
                    <IkonHasil hasil={k.hasil} warna={k.hasil ? warnaPelaku(a) : WARNA_BELUM} ukuran={20} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-bold leading-[1.25] text-[#0F2A52]">{k.nama_kk}</b>
                      <small className="block truncate text-[11.5px] leading-[1.3] text-[#6B7A90]">{[k.no_urut ? `No. ${k.no_urut}` : null, k.anggota_lain, a ? namaDepan(a.nama) : null, jarak].filter(Boolean).join(" · ") || "-"}</small>
                    </span>
                    <span className="flex-none whitespace-nowrap rounded-[9px] px-2 py-[3px] text-[11px] font-extrabold" style={{ background: p[0], color: p[1] }}>
                      {p[2]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- Monitoring: angka tim */}
        {data && subId && tab === "mon" && (
          <section className="flex flex-col gap-2.5 p-2.5">
            <div className="flex flex-col gap-2 rounded-[16px] bg-white px-3.5 py-3 shadow-[0_2px_10px_rgba(15,42,82,.06)]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12.5px] font-bold text-[#5B6B84]">Progres tim</span>
                <b className="ml-auto text-[22px] font-extrabold leading-none text-[#0F2A52]">{didata}</b>
                <span className="text-[12.5px] text-[#6B7A90]">
                  / {total} KK · {persen(didata, total)}%
                </span>
              </div>
              <BilahTumpuk
                total={total}
                label={`${didata} dari ${total} KK didata`}
                bagian={[
                  { n: timHasil.terdampak, warna: WARNA_BAR.terdampak },
                  { n: timHasil.tidak_terdampak, warna: WARNA_BAR.tidak_terdampak },
                  { n: timHasil.tidak_ditemukan, warna: WARNA_BAR.tidak_ditemukan },
                ]}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#5B6B84]">
                <span><b className="text-[#0F2A52]">{timHasil.terdampak}</b> terdampak</span>
                <span><b className="text-[#0F2A52]">{timHasil.tidak_terdampak}</b> tidak</span>
                <span><b className="text-[#0F2A52]">{timHasil.tidak_ditemukan}</b> tdk ditemukan</span>
                <span className="ml-auto text-[#8A96A8]">{waktuRingkas(new Date(tim.tiba || Date.now()).toISOString())}</span>
              </div>
              {menunggu.length > 0 && <p className="text-[11.5px] text-[#8A6200]">{menunggu.length} penandaan di HP ini belum terkirim, jadi belum masuk angka di bawah.</p>}
            </div>

            {/* Menurut PPL: baris per PPL (menggantikan tabel lebar); ketuk = saring Per Sub SLS di bawah */}
            <div className="rounded-[16px] bg-white py-1.5 shadow-[0_2px_10px_rgba(15,42,82,.06)]">
              <div className="flex items-center px-3.5 pb-1 pt-1.5">
                <h2 className="text-[13.5px] font-extrabold text-[#0F2A52]">Menurut PPL</h2>
                <span className="ml-auto text-[11px] text-[#8A96A8]">ketuk untuk menyaring</span>
              </div>
              {(data.anggota ?? []).filter((a) => a.peran === "ppl" || perPpl[a.akun_id]).map((a) => {
                const r = perPpl[a.akun_id];
                const on = monPpl === a.akun_id;
                const w = warnaPelaku(a);
                return (
                  <button
                    key={a.akun_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMonPpl(on ? null : a.akun_id)}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left ${on ? "bg-[#EEF3FC]" : ""}`}
                    style={{ boxShadow: on ? `inset 3px 0 0 ${w}` : undefined }}
                  >
                    <Av a={a} u={28} tepi={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold leading-tight text-[#0F2A52]">
                        {namaDepan(a.nama)}
                        {a.akun_id === sayaAkun ? " (saya)" : ""}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11.5px] text-[#5B6B84]">
                        <span className="inline-flex items-center gap-1"><Penanda k="terdampak" warna={w} />{r?.total.terdampak ?? 0}</span>
                        <span className="inline-flex items-center gap-1"><Penanda k="tidak_terdampak" warna={w} />{r?.total.tidak_terdampak ?? 0}</span>
                        <span className="inline-flex items-center gap-1"><Penanda k="tidak_ditemukan" warna={w} />{r?.total.tidak_ditemukan ?? 0}</span>
                        <span className="text-[#8A96A8]">hari ini {r?.didata_hari_ini ?? 0}</span>
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block text-[16px] font-extrabold leading-[1.1] text-[#0F2A52]">{r?.didata ?? 0}</span>
                      <span className="block text-[10.5px] text-[#8A96A8]">KK</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Per Sub SLS: dikelompokkan per nagari; ketuk = buka Sub SLS itu di tab Peta */}
            <div className="rounded-[16px] bg-white pb-1 pt-1.5 shadow-[0_2px_10px_rgba(15,42,82,.06)]">
              <div className="flex items-center px-3.5 pb-1.5 pt-1.5">
                <h2 className="text-[13.5px] font-extrabold text-[#0F2A52]">Per Sub SLS</h2>
                <span className="ml-auto text-[11.5px] font-bold text-[#1F5FD1]">{monPpl !== null ? namaDepan(anggota.get(monPpl)?.nama ?? "PPL") : "Semua PPL"}</span>
              </div>
              {kelompok.map((g) => (
                <div key={g.nagari}>
                  <div className="px-3.5 pb-0.5 pt-1.5 text-[10.5px] font-extrabold uppercase tracking-[1.2px] text-[#8A96A8]">{g.nagari}</div>
                  {g.rows.map((s) => {
                    const t = perSub[s.idsubsls];
                    const jml = monPpl !== null ? perPpl[monPpl]?.per_sub[s.idsubsls]?.didata ?? 0 : t?.didata ?? 0;
                    const tot = t?.total ?? 0;
                    return (
                      <button key={s.idsubsls} type="button" onClick={() => { gantiSub(s.idsubsls); setTab("peta"); }} className="flex w-full items-center gap-2.5 px-3.5 py-[7px] text-left active:bg-[#F1F6FE]">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1B2B4B]">{namaPendek(s)}</span>
                        <span className="h-[5px] w-12 flex-none overflow-hidden rounded-full bg-[#E3E9F2]">
                          <span className="block h-full" style={{ width: `${persen(jml, tot)}%`, background: monPpl !== null ? warnaPelaku(anggota.get(monPpl)) : "#1F5FD1" }} />
                        </span>
                        <span className="w-[52px] flex-none text-right text-[12px] text-[#5B6B84]"><b className="text-[#0F2A52]">{jml}</b>/{tot}</span>
                        <Ik n="kanan" className="h-3.5 w-3.5 text-[#A5B3C7]" />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Lembar bawah: pilih Sub SLS (teratas "Semua Sub SLS tim" = kembali ke kartu plotting; menggantikan tombol "← Plotting tim") */}
      {lembar === "sub" && data && (
        <LembarBawah judulLembar="Pilih Sub SLS" kanan={`${data.sub.length} Sub SLS tim`} onTutup={() => setLembar(null)}>
          <div className="flex flex-col gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => {
                setLembar(null);
                if (tab !== "mon") keKartu();
              }}
              className={`flex items-center gap-2.5 rounded-[13px] border border-[#E4ECF8] px-3 py-[9px] text-left ${semuaSub ? "bg-[#EEF3FC]" : "bg-white"}`}
            >
              <Ik n="lapis" className="h-[18px] w-[18px] text-[#1F5FD1]" />
              <span className="flex-1 text-[13.5px] font-extrabold text-[#0F2A52]">Semua Sub SLS tim</span>
              <span className="text-[12px] text-[#5B6B84]"><b className="text-[#0F2A52]">{didata}</b>/{total}</span>
            </button>
            {kelompok.map((g) => (
              <div key={g.nagari} className="flex flex-col gap-1">
                <div className="px-0.5 pt-1.5 text-[10.5px] font-extrabold uppercase tracking-[1.2px] text-[#8A96A8]">{g.nagari}</div>
                {g.rows.map((s) => {
                  const t = perSub[s.idsubsls];
                  const aktif = !semuaSub && s.idsubsls === subId;
                  return (
                    <button
                      key={s.idsubsls}
                      type="button"
                      aria-current={aktif}
                      onClick={() => {
                        setLembar(null);
                        if (s.idsubsls !== subId) gantiSub(s.idsubsls);
                        if (tab === "mon") setTab("peta");
                      }}
                      className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-left ${aktif ? "border-[1.5px] border-[#1F5FD1] bg-[#EEF3FC]" : "border border-[#EEF2F7] bg-white"}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[#0F2A52]">{namaPendek(s)}</span>
                      <span className="h-[5px] w-14 flex-none overflow-hidden rounded-full bg-[#E3E9F2]">
                        <span className="block h-full bg-[#1F5FD1]" style={{ width: `${persen(t?.didata ?? 0, t?.total ?? 0)}%` }} />
                      </span>
                      <span className="w-[50px] flex-none text-right text-[12px] text-[#5B6B84]"><b className="text-[#0F2A52]">{t?.didata ?? 0}</b>/{t?.total ?? 0}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </LembarBawah>
      )}

      {/* Lembar bawah: saring menurut PPL (avatar, nama, "n KK · n terdampak" di Sub SLS ini, radio) */}
      {lembar === "ppl" && data && (
        <LembarBawah judulLembar="Tampilkan hasil PPL" onTutup={() => setLembar(null)}>
          <div className="flex flex-col gap-1 pb-1" role="radiogroup" aria-label="PPL">
            {[null, ...ppls].map((a) => {
              const aktif = a === null ? fPpl === null : fPpl === a.akun_id;
              const r = a ? ringkasKk(a.akun_id) : null;
              return (
                <button
                  key={a ? a.akun_id : "semua"}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => {
                    setFPpl(a ? a.akun_id : null);
                    setLembar(null);
                  }}
                  className={`flex items-center gap-2.5 rounded-[13px] px-3 py-[9px] text-left ${aktif ? "bg-[#EEF3FC]" : ""}`}
                >
                  {a ? (
                    <Av a={a} u={30} tepi={false} />
                  ) : (
                    <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[#0F2A52] text-[11px] font-extrabold text-white">{ppls.length}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-[#0F2A52]">
                      {a ? `${a.nama}${a.akun_id === sayaAkun ? " (saya)" : ""}` : "Semua PPL"}
                    </span>
                    <span className="block text-[11px] text-[#6B7A90]">{r ? `${r.n} KK · ${r.td} terdampak` : `${hitung.semua - hitung.belum} KK didata di Sub SLS ini`}</span>
                  </span>
                  <span className="h-5 w-5 flex-none rounded-full" style={{ border: aktif ? "6px solid #1F5FD1" : "2px solid #CBD6E4" }} />
                </button>
              );
            })}
          </div>
        </LembarBawah>
      )}

      {terpilih && (
        <div role="dialog" aria-label={`KK ${terpilih.nama_kk}`} className="fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[78vh] max-w-xl overflow-y-auto rounded-t-[24px] bg-white px-4 pb-6 pt-2 shadow-[0_-12px_36px_rgba(15,42,82,.25)]">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#D9E3F2]" />
          <button type="button" onClick={() => setTerpilihId(null)} aria-label="Tutup" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-[22px] text-[#6B7A90]">
            ×
          </button>
          <h3 className="pr-10 text-[17px] font-extrabold text-[#0F2A52]">{terpilih.nama_kk}</h3>
          {terpilih.anggota_lain && <p className="mt-0.5 text-[12.5px] text-[#52627A]">Anggota: {terpilih.anggota_lain}</p>}
          <p className="mt-0.5 text-[12.5px] text-[#6B7A90]">
            {[terpilih.no_urut ? `No. ${terpilih.no_urut}` : null, terpilih.patokan, subAktif ? namaSub(subAktif) : null, saya && terpilih.lat !== null && terpilih.lng !== null ? `${fmtJarak(jarakMeter(saya, { lat: terpilih.lat, lng: terpilih.lng }))} dari Anda` : null].filter(Boolean).join(" · ")}
          </p>

          {terpilih.hasil && terpilih.ppl_akun_id !== sayaAkun && (
            <p className="mt-3 rounded-[12px] bg-[#FDEBDD] px-3 py-2 text-[12.5px] text-[#8A3B0C]">
              Sudah didata {anggota.get(terpilih.ppl_akun_id ?? 0)?.nama ? namaDepan(anggota.get(terpilih.ppl_akun_id ?? 0)!.nama) : "rekan tim"} ({waktuRingkas(terpilih.status_at)}): {LABEL_PENDEK[terpilih.hasil]}. Menandai ulang akan menimpa hasil ini; riwayat tetap tercatat.
            </p>
          )}
          {terpilih.hasil && terpilih.ppl_akun_id === sayaAkun && <p className="mt-3 text-[12px] text-[#6B7A90]">Anda menandai {waktuRingkas(terpilih.status_at)}.</p>}

          <div className="mt-3 space-y-2" role="group" aria-label="Hasil pendataan">
            {HASIL_KK.map((h) => {
              const aktif = terpilih.hasil === h && terpilih.ppl_akun_id === sayaAkun;
              return (
                <button key={h} type="button" aria-pressed={aktif} onClick={() => tandai(terpilih, h)} className={`flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border-2 px-3.5 py-2 text-left ${aktif ? "border-[#1F5FD1] bg-[#E3ECFB]" : "border-[#D9E3F2] bg-white active:bg-[#F1F6FE]"}`}>
                  <IkonHasil hasil={h} warna={warnaPelaku(anggota.get(sayaAkun))} ukuran={26} />
                  <span className="text-[14px] font-extrabold text-[#0F2A52]">
                    {LABEL_HASIL[h]}
                    <small className="block text-[11.5px] font-medium text-[#6B7A90]">{SUBTEKS[h]}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {terpilih.hasil === "tidak_ditemukan" && terpilih.ppl_akun_id === sayaAkun && (
            <div className="mt-3">
              <span className="text-[11.5px] font-bold text-[#52627A]">Alasan (boleh dikosongkan)</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ALASAN_TIDAK_DITEMUKAN.map((a) => (
                  <button key={a} type="button" aria-pressed={terpilih.alasan === a} onClick={() => tandai(terpilih, "tidak_ditemukan", a)} className={`${chipBase} ${terpilih.alasan === a ? chipOn : chipOff}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {terpilih.lat !== null && terpilih.lng !== null && (
              <>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${terpilih.lat},${terpilih.lng}`} target="_blank" rel="noopener noreferrer" className={`${chipBase} ${chipOff}`}>
                  Navigasi
                </a>
                <button type="button" onClick={() => lihatDiPeta(terpilih)} className={`${chipBase} ${chipOff}`}>
                  Lihat di peta
                </button>
              </>
            )}
            {terpilih.hasil && (
              <button type="button" onClick={() => kembalikan(terpilih)} className={`${chipBase} ${chipOff}`}>
                Kembalikan ke belum didata
              </button>
            )}
          </div>
        </div>
      )}

      {/* (14 Okt 2026) tombol tambah keluarga baru -- hanya saat Sub SLS dibuka, tab Peta / Daftar KK */}
      {!perbaikan && subAktif && tab !== "mon" && !terpilih && !lembar && <TambahKk sub={subAktif} namaSub={namaSub(subAktif)} onSelesai={(p) => setToast({ pesan: p })} />}

      {/* (15 Okt 2026) tombol float capaian hari ini (PPL): bertumpuk di atas "+ Keluarga baru" bila tombol itu tampil; tidak tampil di tab Monitoring */}
      {!perbaikan && !terpilih && !lembar && (!subAktif || tab !== "mon") && <CapaianFloat naik={!!subAktif && tab !== "mon"} />}

      {toast && (
        <div role="status" className={`fixed inset-x-3 ${subAktif && tab !== "mon" && !terpilih ? "bottom-24" : "bottom-4"} z-[60] mx-auto flex max-w-md items-center gap-3 rounded-[16px] bg-[#0F2A52] px-4 py-3 text-[13px] font-bold text-white shadow-[0_12px_30px_rgba(15,42,82,.4)]`}>
          <span className="min-w-0 flex-1">{toast.pesan}</span>
          {toast.urungkan && (
            <button
              type="button"
              onClick={() => {
                toast.urungkan?.();
                setToast(null);
              }}
              className="min-h-[40px] flex-none rounded-full bg-white/15 px-3.5 text-[12.5px] font-extrabold text-white"
            >
              Urungkan
            </button>
          )}
        </div>
      )}

      {perbaikan && infoPerbaikan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B1530]/60 p-4">
          <div role="dialog" aria-modal="true" aria-label="Info perbaikan laporan" className="w-full max-w-sm space-y-3 rounded-2xl bg-white px-5 py-5 shadow-2xl">
            <span className="inline-block rounded-full bg-[#FFF4D6] px-2.5 py-0.5 text-[11.5px] font-extrabold text-[#8A6200]">INFO PERBAIKAN</span>
            <h2 className="text-[17px] font-extrabold leading-snug">Anda memperbaiki pendataan tanggal {tglPanjangPerbaikan(perbaikan.tanggal)}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-[#3A4A66]">
              <li>
                Hasil pendataan yang Anda tandai akan <b>direkam sebagai pendataan tanggal {tglPanjangPerbaikan(perbaikan.tanggal)}</b>, bukan hari ini.
              </li>
              <li>
                Hasil itu <b>masuk ke laporan translok</b> tanggal tersebut.
              </li>
              <li>{peringatanSekali}</li>
            </ul>
            <button type="button" onClick={() => setInfoPerbaikan(false)} className="min-h-[46px] w-full rounded-xl bg-[#E0A526] px-4 text-[15px] font-extrabold text-[#1E2A47]">
              Mengerti, lanjutkan
            </button>
          </div>
        </div>
      )}

      {perbaikan && konfirmKirim && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0B1530]/60 p-0 sm:items-center sm:p-4" onClick={() => !kirimProses && setKonfirmKirim(false)}>
          <div role="dialog" aria-modal="true" aria-label="Konfirmasi kirim perbaikan" className="w-full max-w-sm space-y-3 rounded-t-2xl bg-white px-5 py-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[17px] font-extrabold leading-snug">Kirim perbaikan laporan?</h2>
            <p className="text-[13.5px] leading-relaxed text-[#3A4A66]">
              {Object.keys(tampung).length} KK akan direkam sebagai pendataan tanggal <b>{tglPanjangPerbaikan(perbaikan.tanggal)}</b> dan masuk ke laporan translok. {peringatanSekali}
            </p>
            {kirimPesan && <p className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kirimPesan}</p>}
            <button type="button" disabled={kirimProses} onClick={() => void kirimPerbaikan()} className="min-h-[46px] w-full rounded-xl bg-[#E0A526] px-4 text-[15px] font-extrabold text-[#1E2A47] disabled:opacity-60">
              {kirimProses ? "Mengirim…" : "Ya, kirim perbaikan"}
            </button>
            <button type="button" disabled={kirimProses} onClick={() => setKonfirmKirim(false)} className="min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-4 text-[14px] font-bold text-[#1E2A47]">
              Periksa lagi
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
