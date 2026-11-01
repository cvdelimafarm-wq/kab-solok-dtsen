"use client";

// app/sigap/vanguard/Vanguard.tsx
//
// (1 Nov 2026) VANGUARD V2b: layar-layar Vanguard (pembuka, beranda, kasus, hasil akhir). Penilaian memakai engine murni lib/vanguard (kunci ada di perangkat: Mode Latihan).
// Dua mode (ditentukan CARA MASUK, bukan pilihan petugas):
//   bebas    = tanpa ?k=: tidak ada panggilan ke server; bintang hanya disimpan di perangkat (localStorage, boleh gagal);
//   tercatat = dengan ?k=ID dan boleh mencatat: tiap "Periksa" juga dikirim ke api/sigap/vanguard yang MENILAI ULANG dan mencatat. Gagal kirim tidak menghalangi umpan balik.
// Tombol Back (di layar maupun Back HP) mundur satu langkah lewat mekanisme repo useTutupDenganBack (app/portal/lapisan.ts): kalkulator tertutup dulu, lalu kasus -> daftar -> keluar halaman (kembali ke SIGAP).
// HTML lembar, cerita, petunjuk, dan pembahasan berasal dari berkas kasus di repo (tepercaya, sama seperti prototipe); masukan petugas hanya bilangan bulat.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "./vanguard.css";
import { apiPortal } from "@/app/portal/sesi";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { bacaSesi } from "@/app/sigap/admin/api";
import { compute, engineChecks, fmt, hitungBintang, isiOtomatisR1, kasusBenar, rp } from "@/lib/vanguard/engine";
import { KASUS_PUBLIK, KASUS_PUBLIK_BERNILAI, NAMA_LEVEL, URUTAN_LEVEL } from "@/lib/vanguard/kasus/daftar";
import { kutipanIv, lembarBlok, type Status } from "@/lib/vanguard/lembar";
import { FUNGSI, TOMBOL, hitungEkspresi, tekanPad } from "@/lib/vanguard/keypad";
import { alamatVanguard, tujuanAman } from "@/lib/vanguard/navigasi";
import { saranKasus, type Kelemahan, type PetaKemampuan, type Saran } from "@/lib/vanguard/remedial";
import { LABEL_JENIS } from "@/lib/vanguard/dasbor";
import { labelSel } from "@/lib/vanguard/sel";
import { bacaPengaturan, hasilFinal, hitungLulus, isoKeInputWib, levelDibuka, maksPercobaan, type HasilFinal, type Pengaturan, type StatusJadwal } from "@/lib/vanguard/pengaturan";
import type { Kasus, KasusPublik, KasusRahasia, Koreksi, Kontrol, Level, Nilai, PeriksaEngine } from "@/lib/vanguard/tipe";
import { Lambang, LogoPenuh } from "./Logo";

type PengKirim = Pengaturan & { status: StatusJadwal };
type Layar = "pembuka" | "beranda" | "kasus" | "akhir";
type Info = { memuat: boolean; mode: "bebas" | "tercatat"; boleh: boolean; alasan: string | null; uji: boolean };
type StatusRahasia = "idle" | "memuat" | "siap" | "ditolak" | "gagal";
type Catat = { status: "tidak" | "mengirim" | "ok" | "gagal"; nomor?: number; pesan?: string };
type Hasil = {
  jenis: "benar" | "salah" | "kunci" | "bebas";
  /** Mode uji: hanya vonis dari server; tanpa rincian kotak, koreksi, atau pembahasan. */
  uji?: boolean;
  jmlSalah?: number;
  bintang: number | null;
  baris: { k: string; e: number; u: number; ok: boolean }[];
  koreksi: Koreksi[];
  pemeriksaan: PeriksaEngine[];
  ctl: Kontrol | null;
};

const KUNCI_LOKAL = "vanguard.bebas.v1";
const OPERATOR = /[+\-−×÷*/()]/;
const DITOLAK_SERVER = /^(Latihan Vanguard|Kasus ini belum|Batas percobaan)/;
const wib = (iso: string | null) => `${isoKeInputWib(iso).replace("T", " ")} WIB`;
const html = (h: string) => ({ __html: h });
const bintangTeks = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));

export default function Vanguard() {
  const q = useSearchParams();
  const kegiatan = useMemo(() => { const v = q.get("k"); return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null; }, [q]);
  const tujuan = useMemo(() => tujuanAman(q.get("dari")), [q]);

  const [layar, setLayar] = useState<Layar>("pembuka");
  const [idx, setIdx] = useState(0);
  const [vals, setVals] = useState<Nilai>({});
  const [status, setStatus] = useState<Status>({});
  const [hint, setHint] = useState(0);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  const [bintang, setBintang] = useState<Record<string, number>>({});
  const [rev, setRev] = useState<Record<string, boolean>>({});
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [catat, setCatat] = useState<Catat>({ status: "tidak" });
  const [pad, setPad] = useState<{ id: string; expr: string; ganti: boolean } | null>(null);
  const [pas, setPas] = useState(false);
  const [lemah, setLemah] = useState<Kelemahan[]>([]);
  const [kemampuan, setKemampuan] = useState<PetaKemampuan>({});
  const [rahasia, setRahasia] = useState<Record<string, KasusRahasia>>({});
  const [statusRahasia, setStatusRahasia] = useState<Record<string, StatusRahasia>>({});
  const [peng, setPeng] = useState<PengKirim | null>(null);
  const [benarKode, setBenarKode] = useState<string[]>([]);
  const kalkRef = useRef(0);
  const [info, setInfo] = useState<Info>({ memuat: kegiatan !== null, mode: kegiatan ? "tercatat" : "bebas", boleh: false, alasan: null, uji: false });
  const mulaiRef = useRef(Date.now());
  const hasilRef = useRef<HTMLDivElement | null>(null);
  const lembarRef = useRef<HTMLDivElement | null>(null);
  const skrol = useRef<HTMLDivElement | null>(null);

  const k: KasusPublik | null = layar === "kasus" ? KASUS_PUBLIK[idx] ?? null : null;
  const kp: Kasus | null = k && rahasia[k.kode] ? { ...k, ...rahasia[k.kode] } : null; // kasus PENUH (latihan, rahasia sudah dimuat)
  const jadwal: StatusJadwal = peng?.status ?? "buka";
  const dicatat = info.mode === "tercatat" && info.boleh && jadwal === "buka";
  const uji = dicatat && info.uji; // mode uji berlaku: server menilai, tanpa kunci/petunjuk/pembahasan di perangkat
  const alasanTampil = info.alasan ?? (info.mode === "tercatat" && info.boleh && jadwal !== "buka" && peng
    ? (jadwal === "belum_buka" ? `Latihan tercatat untuk kegiatan ini baru dibuka ${wib(peng.buka_at)}.` : `Latihan tercatat untuk kegiatan ini sudah ditutup${peng.tutup_at ? ` (${wib(peng.tutup_at)})` : ""}.`)
    : null);
  const infoTampil: Info = { ...info, alasan: alasanTampil };
  const levelAktif = useMemo(() => new Set<Level>(dicatat && peng ? levelDibuka(peng) : URUTAN_LEVEL), [dicatat, peng]);
  const bernilaiAktif = useMemo(() => KASUS_PUBLIK_BERNILAI.filter((x) => levelAktif.has(x.level)), [levelAktif]);
  const maksBintang = bernilaiAktif.length * 3;

  // ---------- masuk, mode, dan riwayat ----------
  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    if (kegiatan === null) {
      try {
        const s = JSON.parse(window.localStorage.getItem(KUNCI_LOKAL) ?? "null") as { bintang?: Record<string, number>; tries?: Record<string, number> } | null;
        if (s?.bintang) setBintang(s.bintang);
        if (s?.tries) setTries(s.tries);
      } catch { /* penyimpanan lokal boleh gagal */ }
      return;
    }
    let batal = false;
    (async () => {
      try {
        const r = await apiPortal<{ mode: "bebas" | "tercatat"; boleh: boolean; alasan: string | null; riwayat: { kasus: string; percobaan: number; benar: boolean; bintang: number }[]; lemah?: Kelemahan[]; uji?: boolean; kemampuan?: PetaKemampuan; pengaturan?: Record<string, unknown> & { status?: string } }>(`/api/sigap/vanguard?kegiatan=${kegiatan}`);
        if (batal) return;
        setInfo({ memuat: false, mode: r.mode, boleh: r.boleh, alasan: r.alasan, uji: r.uji === true });
        setKemampuan(r.kemampuan ?? {});
        setLemah(Array.isArray(r.lemah) ? r.lemah : []);
        if (r.pengaturan) setPeng({ ...bacaPengaturan(r.pengaturan), status: r.pengaturan.status === "belum_buka" || r.pengaturan.status === "tutup" ? r.pengaturan.status : "buka" });
        setBenarKode(r.riwayat.filter((x) => x.benar).map((x) => x.kasus));
        setTries(Object.fromEntries(r.riwayat.map((x) => [x.kasus, x.percobaan])));
        setBintang(Object.fromEntries(r.riwayat.filter((x) => x.benar).map((x) => [x.kasus, x.bintang])));
      } catch (e) {
        if (batal || (e instanceof Error && e.message === "SESI_BERAKHIR")) return;
        setInfo({ memuat: false, mode: "tercatat", boleh: false, alasan: "Tidak dapat memuat status pencatatan; latihan tetap bisa dilakukan tetapi tidak dicatat.", uji: false });
      }
    })();
    return () => { batal = true; };
  }, [kegiatan]);

  useEffect(() => {
    if (kegiatan !== null) return;
    try { window.localStorage.setItem(KUNCI_LOKAL, JSON.stringify({ bintang, tries })); } catch { /* abaikan */ }
  }, [bintang, tries, kegiatan]);

  // ---------- Back: kalkulator di atas kasus, kasus di atas daftar; Back dari daftar = keluar halaman (kembali ke SIGAP) ----------
  // Sengaja TIDAK ada lapisan untuk daftar kasus: lapisan yang didaftarkan ulang sesudah Back (tanpa sentuhan pengguna) membuat Chrome melewati entri riwayat
  // (perlindungan jebakan Back), sehingga Back berikutnya meloncat dua langkah. Lapisan kasus dan kalkulator selalu dibuka oleh ketukan, jadi aman.
  useTutupDenganBack(pad !== null, () => setPad(null));
  useTutupDenganBack(layar === "kasus" || layar === "akhir", () => { setPad(null); setLayar("beranda"); });

  // ---------- hitungan dan lembar ----------
  const e = useMemo(() => compute(vals), [vals]);
  const htmlLembar = useMemo(() => (k ? lembarBlok(k, { vals, co: e.co, status }) : ""), [k, vals, e, status]);
  const disk = e.co.disk;

  useLayoutEffect(() => {
    const kotak = lembarRef.current;
    if (!kotak) return;
    kotak.querySelectorAll<HTMLElement>(".paper").forEach((p) => {
      const t = p.firstElementChild as HTMLElement | null;
      if (!t) return;
      t.style.zoom = "";
      if (pas) { const s = Math.min(1, (p.clientWidth - 2) / t.scrollWidth); if (s < 1) t.style.zoom = String(s); }
    });
  }, [htmlLembar, pas, layar]);

  // ---------- layar kasus ----------
  // Bagian rahasia kasus (kunci, petunjuk, pembahasan) diminta per kasus dan hanya pada latihan; server menolaknya bila kasus itu sedang diujikan kepada akun ini.
  const ambilRahasia = async (kode: string): Promise<KasusRahasia | null> => {
    if (rahasia[kode]) return rahasia[kode];
    setStatusRahasia((s) => ({ ...s, [kode]: "memuat" }));
    try {
      const r = await apiPortal<{ rahasia: KasusRahasia }>(`/api/sigap/vanguard/kasus?kode=${kode}`);
      setRahasia((x) => ({ ...x, [kode]: r.rahasia }));
      setStatusRahasia((s) => ({ ...s, [kode]: "siap" }));
      return r.rahasia;
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return null;
      setStatusRahasia((s) => ({ ...s, [kode]: e instanceof Error && /diujikan/.test(e.message) ? "ditolak" : "gagal" }));
      return null;
    }
  };

  const bukaKasus = (i: number) => {
    const kode = KASUS_PUBLIK[i].kode;
    if (!uji && !KASUS_PUBLIK[i].bebas) void ambilRahasia(kode);
    setVals({}); setStatus({}); setHasil(null); setCatat({ status: "tidak" }); setHint(hints[kode] ?? 0); setPad(null);
    mulaiRef.current = Date.now();
    setIdx(i);
    setLayar("kasus");
    skrol.current?.scrollTo({ top: 0 });
  };
  const keBeranda = () => { setPad(null); setLayar("beranda"); skrol.current?.scrollTo({ top: 0 }); };

  const kirim = async (kas: KasusPublik, isian: Nilai, lihatJawaban: boolean, petunjuk: number): Promise<{ nomor: number; benar: boolean; bintang: number; jmlSalah?: number } | null> => {
    if (!dicatat || kegiatan === null) return null;
    setCatat({ status: "mengirim" });
    const kalkKirim = Math.min(500, kalkRef.current);
    try {
      const r = await apiPortal<{ nomor: number; benar: boolean; bintang: number; jmlSalah?: number }>("/api/sigap/vanguard", {
        method: "POST",
        body: JSON.stringify({ kegiatan, kasus: kas.kode, isian, petunjuk, lihatJawaban, kalkulator: kalkKirim, durasiDtk: Math.min(86400, Math.max(0, Math.round((Date.now() - mulaiRef.current) / 1000))) }),
      });
      kalkRef.current = Math.max(0, kalkRef.current - kalkKirim);
      setCatat({ status: "ok", nomor: r.nomor });
      setTries((t) => ({ ...t, [kas.kode]: r.nomor }));
      if (r.benar) { setBenarKode((b) => (b.includes(kas.kode) ? b : [...b, kas.kode])); setBintang((b) => ({ ...b, [kas.kode]: Math.max(b[kas.kode] ?? 0, r.bintang) })); setHasil((h) => (h && h.jenis === "benar" ? { ...h, bintang: r.bintang } : h)); }
      return r;
    } catch (err) {
      if (err instanceof Error && err.message === "SESI_BERAKHIR") return null;
      setCatat({ status: "gagal", pesan: err instanceof Error ? err.message : "Gagal mencatat." });
      return null;
    }
  };

  const gulirKeHasil = () => window.setTimeout(() => hasilRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);

  // Mode uji: SERVER yang menilai; perangkat hanya menerima vonis (benar atau tidak, dan jumlah kotak yang salah), tanpa kunci, koreksi, atau pembahasan.
  const periksaUji = async () => {
    if (!k) return;
    const r = await kirim(k, vals, false, 0);
    if (!r) return;
    setHasil({ jenis: r.benar ? "benar" : "salah", bintang: r.benar ? r.bintang : null, baris: [], koreksi: [], pemeriksaan: [], ctl: null, uji: true, jmlSalah: r.jmlSalah });
    gulirKeHasil();
  };

  const periksa = () => {
    if (!k) return;
    if (uji && !k.bebas) { void periksaUji(); return; }
    const nomor = (tries[k.kode] ?? 0) + 1;
    setTries((t) => ({ ...t, [k.kode]: nomor }));
    if (k.bebas) {
      setHasil({ jenis: "bebas", bintang: null, baris: [], koreksi: [], pemeriksaan: engineChecks(e), ctl: e.ctl });
      gulirKeHasil();
      return;
    }
    if (!kp) return; // rahasia belum dimuat (tombol Periksa nonaktif sampai siap)
    const r = kasusBenar(kp, vals);
    const st: Status = {};
    for (const b of r.evaluasi.rows) if (b.e !== 0 || b.u !== 0) st[b.k] = b.ok ? "ok" : "no";
    setStatus(st);
    const b = r.benar ? (rev[k.kode] ? 0 : hitungBintang({ petunjuk: hint, percobaan: nomor, lihatJawaban: false })) : null;
    if (b !== null) setBintang((x) => ({ ...x, [k.kode]: Math.max(x[k.kode] ?? 0, b) }));
    setHasil({ jenis: r.benar ? "benar" : "salah", bintang: b, baris: r.evaluasi.rows, koreksi: r.evaluasi.fb, pemeriksaan: r.pemeriksaan, ctl: k.lengkap && r.benar ? e.ctl : null });
    void kirim(k, vals, false, hint);
    gulirKeHasil();
  };

  const lihatJawaban = () => {
    if (!k || !kp || uji) return;
    const kunci: Nilai = { ...kp.kunci };
    const isi = k.lengkap ? isiOtomatisR1(kunci) : kunci;
    setRev((r) => ({ ...r, [k.kode]: true }));
    setBintang((b) => (b[k.kode] == null ? { ...b, [k.kode]: 0 } : b));
    setVals(isi);
    const r = kasusBenar(kp, isi);
    const st: Status = {};
    for (const b of r.evaluasi.rows) if (b.e !== 0 || b.u !== 0) st[b.k] = "ok";
    setStatus(st);
    setHasil({ jenis: "kunci", bintang: null, baris: r.evaluasi.rows, koreksi: [], pemeriksaan: r.pemeriksaan, ctl: k.lengkap ? compute(isi).ctl : null });
    void kirim(k, isi, true, hint);
    gulirKeHasil();
  };

  // ---------- lembar entri (kalkulator) ----------
  const nilaiPad = pad ? hitungEkspresi(pad.expr) : null;
  const padSah = nilaiPad !== null && nilaiPad >= 0;
  const bukaPad = (id: string) => {
    (document.activeElement as HTMLElement | null)?.blur(); // fokus dilepas dari kotak agar Enter di kalkulator tidak membuka ulang kotak yang sama
    setPad({ id, expr: vals[id] ? String(vals[id]) : "", ganti: !!vals[id] });
  };
  const simpanPad = useCallback(() => {
    if (!pad) return;
    const v = hitungEkspresi(pad.expr);
    if (v === null || v < 0) return;
    const bulat = Math.round(v);
    if (dicatat && OPERATOR.test(pad.expr)) kalkRef.current = Math.min(500, kalkRef.current + 1);
    setVals((x) => { const baru = { ...x }; if (bulat) baru[pad.id] = bulat; else delete baru[pad.id]; return baru; });
    setStatus((s) => { if (!s[pad.id]) return s; const baru = { ...s }; delete baru[pad.id]; return baru; });
    setPad(null);
  }, [pad, dicatat]);
  useEffect(() => {
    if (!pad) return;
    const tombol = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setPad(null);
      else if (ev.key === "Enter") { ev.preventDefault(); simpanPad(); }
      else if (ev.key === "Backspace") setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, "⌫") } : p));
      else if (/^[0-9()]$/.test(ev.key)) setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, ev.key) } : p));
      else if (ev.key === "," || ev.key === ".") setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, ",") } : p));
      else if (ev.key === "+") setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, "+") } : p));
      else if (ev.key === "-") setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, "−") } : p));
      else if (ev.key === "*" || ev.key === "x") setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, "×") } : p));
      else if (ev.key === "/") setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, "÷") } : p));
    };
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [pad, simpanPad]);

  const klikLembar = (ev: React.MouseEvent) => { const td = (ev.target as HTMLElement).closest<HTMLElement>("td.in"); if (td?.dataset.id) bukaPad(td.dataset.id); };
  const tombolLembar = (ev: React.KeyboardEvent) => {
    if (pad || (ev.key !== "Enter" && ev.key !== " ")) return;
    const td = (ev.target as HTMLElement).closest<HTMLElement>("td.in");
    if (td?.dataset.id) { ev.preventDefault(); bukaPad(td.dataset.id); }
  };

  const isiOtomatis = () => { setVals((v) => isiOtomatisR1(v)); setStatus({}); };
  const muatContoh = async () => {
    const ali = KASUS_PUBLIK.find((x) => x.nama === "ali");
    if (!ali || uji) return;
    const r = await ambilRahasia(ali.kode);
    if (!r) return;
    setVals(isiOtomatisR1({ ...r.kunci, vii_p1: 0 }));
    setStatus({});
  };

  // ---------- total ----------
  const totalBintang = Object.entries(bintang).filter(([kode]) => bernilaiAktif.some((x) => x.kode === kode)).reduce((a, [, b]) => a + b, 0);
  const selesai = bernilaiAktif.filter((x) => bintang[x.kode] != null).length;
  const lulus = useMemo(() => (dicatat && peng ? hitungLulus(peng, benarKode) : null), [dicatat, peng, benarKode]);
  // Hasil final menurut aturan kegiatan (sampai lulus, batas percobaan, final setelah percobaan terakhir); dihitung dari buku yang sama dengan server.
  const fin = useMemo<HasilFinal | null>(() => {
    if (!dicatat || !peng) return null;
    const kode = new Set([...Object.keys(tries), ...benarKode]);
    return hasilFinal(peng, [...kode].map((x) => ({ kasus: x, percobaan: tries[x] ?? 0, benar: benarKode.includes(x) })));
  }, [dicatat, peng, tries, benarKode]);
  const idxLanjut = k ? KASUS_PUBLIK.findIndex((c, i) => i > idx && levelAktif.has(c.level)) : -1;
  const habis = !!(dicatat && k && !k.bebas && peng && (tries[k.kode] ?? 0) >= maksPercobaan(peng) && peng.maks_percobaan !== null);
  // Latihan kesalahan saya: hanya mode tercatat (butuh riwayat kesalahan di server)
  const saran: Saran[] = useMemo(() => {
    if (!dicatat || uji) return [];
    const kode = new Set([...Object.keys(tries), ...Object.keys(bintang)]);
    return saranKasus(lemah, [...kode].map((k) => ({ kasus: k, percobaan: tries[k] ?? 0, benar: bintang[k] != null, bintang: bintang[k] ?? 0 })), kemampuan)
      .filter((x) => { const c = KASUS_PUBLIK.find((y) => y.kode === x.kasus); return !!c && levelAktif.has(c.level); });
  }, [dicatat, uji, lemah, kemampuan, tries, bintang, levelAktif]);
  const modeTeks = uji ? "UJI · hasil Anda dicatat dan menentukan kelulusan" : dicatat ? "Pelatihan · hasil Anda dicatat" : "Simulasi bebas · data tidak dicatat";

  // ---------- tampilan ----------
  const judul = layar === "kasus" && k ? `Kasus ${k.kode} · ${k.judul}` : layar === "akhir" ? "Hasil akhir" : "Simulasi isian Blok V–VII";
  const persen = layar === "akhir" ? 100 : layar === "kasus" ? (idx / KASUS_PUBLIK.length) * 100 : (bernilaiAktif.length ? selesai / bernilaiAktif.length : 0) * 100;

  if (layar === "pembuka") {
    return (
      <div className="vg"><div className="phone">
        <div className="buka">
          <div className="atas">PELATIHAN PETUGAS · VSEN26.KP</div>
          <div className="kartu">
            <LogoPenuh />
            <div><div className="j1">Jaga data dari garis depan.</div><div className="j2">Simulasi pengisian kuesioner KP Susenas</div></div>
            <div className={`chip ${dicatat ? "ya" : "tidak"}`} role="status">
              {info.memuat ? "Memeriksa status pencatatan…" : uji ? "UJI · hasil Anda dicatat dan menentukan kelulusan" : dicatat ? "PELATIHAN · hasil Anda dicatat" : "SIMULASI BEBAS · data tidak dicatat"}
            </div>
            {!info.memuat && info.mode === "tercatat" && !dicatat && alasanTampil && <div className="j2" style={{ padding: "0 14px" }}>{alasanTampil} Anda tetap dapat berlatih; hasilnya tidak dicatat.</div>}
          </div>
          <div className="bawah">
            <button type="button" className="masuk" disabled={info.memuat} onClick={() => setLayar("beranda")}>Masuk ke Vanguard</button>
            <Link className="pulang" href={tujuan}>← Kembali ke SIGAP</Link>
            <div className="oleh">Diselenggarakan oleh <b>BPS Kabupaten Solok</b></div>
          </div>
        </div>
      </div></div>
    );
  }

  return (
    <div className="vg"><div className="phone">
      <div className="vgtop">
        <span className="lencana"><Lambang px={20} /></span>
        <div className="nm">VANGUARD<small>Survey Intelligence Platform</small></div>
        <Link href={tujuan}>Kembali ke SIGAP</Link>
      </div>
      <div className="appbar">
        <div className="l1"><b>BADAN PUSAT STATISTIK · VSEN26.KP</b><span className="r">RAHASIA</span></div>
        <h1>{judul}</h1>
        <div className="l3"><span>★ {totalBintang} / {maksBintang}</span><button className="tog" type="button" aria-pressed={pas} onClick={() => setPas((x) => !x)}>{pas ? "Kertas: pas layar" : "Kertas: geser"}</button></div>
        <div className="bar"><i style={{ width: `${persen}%` }} /></div>
      </div>

      <div className="scroll" ref={skrol}><div className="stack">
        {layar === "beranda" && <Beranda balik={alamatVanguard({ kegiatan, dari: tujuan })} bintang={bintang} selesai={selesai} total={bernilaiAktif.length} levelAktif={levelAktif} dicatat={dicatat} uji={uji} info={infoTampil} peng={dicatat ? peng : null} lulus={lulus} fin={fin} saran={saran} lemah={lemah} onBuka={bukaKasus} onAkhir={() => setLayar("akhir")} />}

        {layar === "kasus" && k && (
          <>
            <div className="sheet memo">
              <span className="tag">Kasus {k.kode} · {NAMA_LEVEL[k.level]}</span>
              <h2>{k.judul}</h2>
              <p dangerouslySetInnerHTML={html(k.cerita)} />
              {k.info && <ul>{k.info.map((x, i) => <li key={i} dangerouslySetInnerHTML={html(x)} />)}</ul>}
              {k.bebas && !uji && <div className="btns" style={{ padding: "8px 0 0", border: 0 }}><button type="button" className="btn" onClick={() => void muatContoh()}>Muat contoh Pak Ali</button></div>}
            </div>
            {k.iv && <div dangerouslySetInnerHTML={html(kutipanIv(k.iv))} />}
            {uji && !k.bebas && <div className="catat ya" role="status"><b>Mode uji:</b> tanpa petunjuk, tanpa kunci, dan tanpa pembahasan. Setiap kali Anda menekan Periksa, jawaban dikirim ke server untuk dinilai dan dicatat. Hasil menentukan kelulusan.</div>}
            {!uji && !k.bebas && statusRahasia[k.kode] === "ditolak" && <div className="catat gagal" role="alert">Kasus ini sedang diujikan kepada Anda di sebuah kegiatan, sehingga tidak tersedia untuk latihan selama uji berlangsung.</div>}
            {!uji && !k.bebas && statusRahasia[k.kode] === "gagal" && <div className="catat gagal" role="alert">Kunci kasus belum dapat dimuat. Periksa sinyal, lalu buka ulang kasus ini dari daftar.</div>}
            {uji && !hasil && catat.status === "gagal" && <CatatInfo catat={catat} dicatat={dicatat} />}
            {habis && <div className="catat gagal" role="alert">Batas percobaan untuk kasus ini sudah tercapai ({peng?.maks_percobaan}×). Pilih kasus lain dari daftar.</div>}
            <div className="legend"><span><i className="sw" style={{ background: "#fff" }} />isian Anda (ketuk)</span><span><i className="sw" style={{ background: "#f1f1f1" }} />otomatis</span><span><i className="sw" style={{ background: "#a6a6a6" }} />tidak berlaku</span></div>
            {!uji && kp && hint > 0 && <div className="hint stack" style={{ gap: 6 }}>{kp.petunjuk.slice(0, hint).map((t, i) => <div key={i}><b>Petunjuk {i + 1}.</b> <span dangerouslySetInnerHTML={html(t)} /></div>)}</div>}
            <div ref={lembarRef} className="stack" style={{ gap: 12 }} onClick={klikLembar} onKeyDown={tombolLembar} dangerouslySetInnerHTML={html(htmlLembar)} />
            {k.blok.includes("VII") && (
              <div className={`sheet dk ${Math.abs(disk) <= 1 ? "ok" : "no"}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12.5 }}><b>Diskrepansi</b> = selisih Blok VI − selisih Blok VII. Harus nol bila Blok VII konsisten dengan Blok V.</div>
                  <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 17, whiteSpace: "nowrap", color: Math.abs(disk) <= 1 ? "var(--good)" : "var(--bad)" }}>{rp(disk)}</div>
                </div>
              </div>
            )}
            <div ref={hasilRef}>
              {hasil && (
                <PanelHasil k={k} rah={uji ? null : kp} hasil={hasil} catat={catat} dicatat={dicatat} adaLanjut={idxLanjut >= 0}
                  onUlang={() => { setHasil(null); setStatus({}); setCatat({ status: "tidak" }); }} onKunci={lihatJawaban}
                  onLanjut={() => bukaKasus(idxLanjut)} onAkhir={() => setLayar("akhir")} />
              )}
            </div>
          </>
        )}

        {layar === "akhir" && <Akhir bintang={bintang} total={totalBintang} maks={maksBintang} daftar={bernilaiAktif} lulus={lulus} fin={fin} nilaiLulus={peng?.nilai_lulus ?? null} uji={uji} dicatat={dicatat} onBuka={bukaKasus} onDaftar={keBeranda} />}
      </div></div>

      {layar === "kasus" && k && (
        <div className="dock">
          <button type="button" className="btn" aria-label="Daftar kasus" onClick={keBeranda}>☰</button>
          {k.bebas ? <button type="button" className="btn amb" onClick={isiOtomatis}>Isi R.1 otomatis</button>
            : uji ? <button type="button" className="btn" disabled>Tanpa petunjuk</button>
            : <button type="button" className="btn" disabled={!kp || hint >= kp.petunjuk.length} onClick={() => { if (!kp) return; const n = Math.min(kp.petunjuk.length, hint + 1); setHint(n); setHints((h) => ({ ...h, [k.kode]: n })); }}>Petunjuk{kp && kp.petunjuk.length ? ` ${hint}/${kp.petunjuk.length}` : ""}</button>}
          <button type="button" className="btn pri" disabled={catat.status === "mengirim" || habis || (!uji && !k.bebas && !kp)} onClick={periksa}>{!uji && !k.bebas && !kp && statusRahasia[k.kode] !== "ditolak" && statusRahasia[k.kode] !== "gagal" ? "Memuat…" : "Periksa"}</button>
        </div>
      )}
      <div className="vgfoot"><b>{modeTeks}</b>{dicatat ? "" : " · tidak menentukan kelulusan"}</div>

      {pad && (
        <div className="ov"><div className="pad" role="dialog" aria-label="Isi angka">
          <div className="ttl">Isi angka (Rp)</div>
          <div className="lab">{labelSel(pad.id)}</div>
          <div className="disp">{pad.expr || "0"}</div>
          {pad.ganti && <div style={{ fontSize: 11.5, color: "#444", marginTop: 3 }}>Ketik angka untuk mengganti nilai ini, atau tekan + − × ÷ untuk melanjutkannya.</div>}
          <div className="out">{nilaiPad === null ? "…" : nilaiPad < 0 ? "Tidak boleh negatif" : `Rp${fmt(nilaiPad)}`}</div>
          <div className="keys">
            {TOMBOL.map((t) => <button key={t} type="button" className={`k${/[÷×−+]/.test(t) ? " op" : ""}`} onClick={() => setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, t) } : p))}>{t}</button>)}
            {FUNGSI.map((f) => <button key={f.teks} type="button" className="k fn" style={{ gridColumn: "span 2" }} onClick={() => setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, f.nilai) } : p))}>{f.teks}</button>)}
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => setPad(null)}>Batal</button>
            <button type="button" className="btn" onClick={() => setPad((p) => (p ? { ...p, expr: "", ganti: false } : p))}>Kosongkan</button>
            <button type="button" className="btn pri" disabled={!padSah} onClick={simpanPad}>Simpan</button>
          </div>
        </div></div>
      )}
    </div></div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function Beranda({ balik, bintang, selesai, total, levelAktif, dicatat, uji, info, peng, lulus, fin, saran, lemah, onBuka, onAkhir }: { balik: string; bintang: Record<string, number>; selesai: number; total: number; levelAktif: Set<Level>; dicatat: boolean; uji: boolean; info: Info; peng: PengKirim | null; lulus: ReturnType<typeof hitungLulus> | null; fin: HasilFinal | null; saran: Saran[]; lemah: Kelemahan[]; onBuka: (i: number) => void; onAkhir: () => void }) {
  return (
    <>
      <div className={`catat ${dicatat ? "ya" : "tidak"}`} role="status">
        {uji ? <><b>Mode uji:</b> tanpa petunjuk, kunci, atau pembahasan. Setiap kali Anda menekan Periksa, jawaban dinilai server dan dicatat; hasilnya menentukan kelulusan.</>
          : dicatat ? <><b>Pelatihan:</b> setiap kali Anda menekan Periksa, percobaan dicatat untuk BPS Kabupaten Solok (kesalahan dan jumlah percobaan).</>
          : <><b>Simulasi bebas:</b> jawaban Anda tidak dicatat dan tidak menentukan apa pun. Berlatihlah sebebasnya.{info.mode === "tercatat" && info.alasan ? ` (${info.alasan})` : ""}</>}
      </div>
      <div className="sheet"><span className="tag">Cara main</span><p style={{ fontSize: 13 }}>Baca hasil wawancara dan kutipan Blok IV, lalu isi Blok V (dan VI–VII pada kasus lengkap) seperti di kuesioner. <b>Ketuk kotak isian</b> untuk memasukkan angka; kalkulator ada di lembar isian. Sel <span className="sw" style={{ background: "#a6a6a6", width: 11, height: 11 }} /> abu-abu tidak berlaku. Kotak bertinta biru adalah isian Anda; kotak abu muda dihitung otomatis.</p></div>
      <div className="panel"><div className="jd">RINGKASAN SAYA</div><div style={{ fontSize: 13, marginTop: 3 }}>{selesai} dari {total} kasus sudah dikerjakan.</div></div>
      <div className="panel" role="region" aria-label="Mode Kuesioner Penuh">
        <div className="jd">MODE KUESIONER PENUH · UJI COBA</div>
        <div style={{ fontSize: 12.5, marginTop: 3 }}>Isi Blok IV.1 (konsumsi makanan) seperti di kuesioner asli dari catatan belanja satu rumah tangga. Hanya latihan, tidak dicatat.</div>
        <Link className="item" style={{ marginTop: 6, textDecoration: "none", color: "inherit" }} href={`/sigap/vanguard/kuesioner?kasus=K01&dari=${encodeURIComponent(balik)}`}>
          <span className="num">K01</span><span className="t">Dapur Bu Maryati<small>Minyak, bumbu, minuman, bahan lainnya</small></span><span className="st">▶</span>
        </Link>
      </div>
      {peng && (peng.nilai_lulus !== null || peng.maks_percobaan !== null || peng.tutup_at) && (
        <div className="panel" role="region" aria-label="Aturan kegiatan">
          <div className="jd">ATURAN KEGIATAN INI</div>
          <div style={{ fontSize: 12.5, marginTop: 3 }}>
            {lulus && peng.nilai_lulus !== null && <div>Lulus bila minimal <b>{peng.nilai_lulus}%</b> dari {lulus.dibuka} kasus dijawab benar tanpa melihat jawaban. Anda: <b>{lulus.benar} kasus ({lulus.persen}%)</b> · <HasilFinalTeks fin={fin} nilaiLulus={peng.nilai_lulus} />.</div>}
            {peng.maks_percobaan !== null && <div>Batas percobaan: {peng.maks_percobaan}× per kasus.</div>}
            {peng.tutup_at && <div>Ditutup: {wib(peng.tutup_at)}.</div>}
          </div>
        </div>
      )}
      {saran.length > 0 && (
        <div className="panel" role="region" aria-label="Latihan kesalahan saya">
          <div className="jd">LATIHAN KESALAHAN SAYA</div>
          {lemah[0] && <div style={{ fontSize: 12.5, marginTop: 3 }}>Kesalahan Anda yang paling sering: <b>{LABEL_JENIS[lemah[0].jenis]}</b> ({lemah[0].jumlah}×). Kasus berikut disarankan untuk mengulangnya.</div>}
          <div style={{ marginTop: 6 }}>
            {saran.map((x) => (
              <button key={x.kasus} type="button" className="item" onClick={() => onBuka(KASUS_PUBLIK.findIndex((c) => c.kode === x.kasus))}>
                <span className="num">{x.kasus}</span>
                <span className="t">{x.judul}<small>{x.alasan.join(" · ")}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
      {URUTAN_LEVEL.filter((lv) => levelAktif.has(lv)).map((lv) => (
        <div key={lv}>
          <div><span className="lv">{lv} · {NAMA_LEVEL[lv]}</span></div>
          {KASUS_PUBLIK.map((c, i) => c.level !== lv ? null : (
            <button key={c.kode} type="button" className={`item${bintang[c.kode] != null && !c.bebas ? " done" : ""}`} onClick={() => onBuka(i)}>
              <span className="num">{c.kode}</span>
              <span className="t">{c.judul}<small>{c.lengkap ? "Blok V–VII lengkap" : c.bebas ? "Tanpa kunci" : `Blok ${c.blok.map((b) => (/^[A-G]$/.test(b) ? `V.${b}` : b)).join(" + ")}`}</small></span>
              <span className="st">{bintang[c.kode] != null && !c.bebas ? bintangTeks(bintang[c.kode]) : ""}</span>
            </button>
          ))}
        </div>
      ))}
      {total > 0 && selesai >= total && <button type="button" className="btn pri" style={{ width: "100%" }} onClick={onAkhir}>Lihat hasil akhir</button>}
    </>
  );
}

function Akhir({ bintang, total, maks, daftar, lulus, fin, nilaiLulus, uji, dicatat, onBuka, onDaftar }: { bintang: Record<string, number>; total: number; maks: number; daftar: KasusPublik[]; lulus: ReturnType<typeof hitungLulus> | null; fin: HasilFinal | null; nilaiLulus: number | null; uji: boolean; dicatat: boolean; onBuka: (i: number) => void; onDaftar: () => void }) {
  return (
    <>
      <div className="sheet" style={{ textAlign: "center" }}>
        <span className="tag">Skor</span><div className="score">{total} / {maks}</div>
        <p style={{ marginTop: 6, fontSize: 13 }}>{total >= maks * 0.8 ? "Sangat baik. Pola pasangan Blok IV dan V sudah dikuasai." : total >= maks * 0.5 ? "Cukup baik. Ulangi kasus bertanda bintang rendah." : "Pelajari lagi pasangan Blok IV dan V, lalu ulangi kasus."}</p>
        <p className="ref" style={{ marginTop: 6 }}>{dicatat ? `${uji ? "Hasil uji Anda tercatat dan menentukan kelulusan." : "Hasil percobaan Anda tercatat untuk BPS Kabupaten Solok."}${lulus && nilaiLulus !== null ? ` Kelulusan: ${lulus.benar} dari ${lulus.dibuka} kasus benar (${lulus.persen}%), syarat ${nilaiLulus}%.` : ""}` : "Simulasi bebas: skor ini hanya tersimpan di perangkat Anda."}</p>
        {dicatat && fin && fin.status !== "tanpa_batas" && <div className={`catat ${fin.status === "lulus" ? "ya" : fin.status === "tidak_lulus" ? "gagal" : "tidak"}`} role="status" style={{ marginTop: 8, textAlign: "left" }}><HasilFinalTeks fin={fin} nilaiLulus={nilaiLulus} panjang /></div>}
      </div>
      {daftar.map((c) => (
        <button key={c.kode} type="button" className="item" onClick={() => onBuka(KASUS_PUBLIK.indexOf(c))}>
          <span className="num">{c.kode}</span><span className="t">{c.judul}</span><span className="st">{bintang[c.kode] != null ? bintangTeks(bintang[c.kode]) : "–"}</span>
        </button>
      ))}
      <button type="button" className="btn" style={{ width: "100%" }} onClick={onDaftar}>Daftar kasus</button>
    </>
  );
}

function HasilFinalTeks({ fin, nilaiLulus, panjang = false }: { fin: HasilFinal | null; nilaiLulus: number | null; panjang?: boolean }) {
  if (!fin || nilaiLulus === null) return null;
  if (fin.status === "lulus") return <b>✓ LULUS{panjang ? ` (nilai ${fin.nilai}, syarat ${nilaiLulus})` : ""}</b>;
  if (fin.status === "tidak_lulus") return <><b>Hasil final: TIDAK LULUS</b>{panjang ? <> (nilai {fin.nilai}, syarat {nilaiLulus}). Percobaan Anda sudah habis. Anda <b>tetap dapat mendata dengan pendampingan khusus</b>.</> : " · tetap dapat mendata dengan pendampingan khusus"}</>;
  return <>belum lulus{panjang ? <> (nilai {fin.nilai}, syarat {nilaiLulus}). Masih ada percobaan: lanjutkan sampai lulus. Hasil final ditetapkan setelah percobaan terakhir.</> : " · hasil final setelah percobaan terakhir"}</>;
}

function KontrolTabel({ ctl }: { ctl: Kontrol }) {
  const baris = (a: [string, number][]) => a.map((x, i) => <tr key={i}><td>{x[0]}</td><td className="n">{fmt(x[1])}</td></tr>);
  return (
    <details className="ctl"><summary>Tabel kontrol engine (VII Rincian 1)</summary>
      <table><tbody>
        <tr className="t"><td colSpan={2}>Kontrol mengambil uang dan tabungan</td></tr>{baris(ctl.e)}
        <tr className="t"><td>Total 1</td><td className="n">{fmt(ctl.e1)}</td></tr>{baris(ctl.e2a)}
        <tr className="t"><td>Total 2</td><td className="n">{fmt(ctl.e2)}</td></tr>
        <tr className="t"><td>Mengambil uang dan tabungan (T1 − T2)</td><td className="n">{rp(ctl.r1k2)}</td></tr>
        <tr className="t"><td colSpan={2}>Kontrol menyimpan uang dan menabung</td></tr>{baris(ctl.h)}
        <tr className="t"><td>Total 1</td><td className="n">{fmt(ctl.h1)}</td></tr>
        <tr><td>Transfer modal dibayar (V.F K.4+K.5)</td><td className="n">{fmt(ctl.h2)}</td></tr>
        <tr className="t"><td>Menyimpan dan menabung (T1 − T2)</td><td className="n">{rp(ctl.r1k4)}</td></tr>
      </tbody></table>
    </details>
  );
}

function PanelHasil({ k, rah, hasil, catat, dicatat, adaLanjut, onUlang, onKunci, onLanjut, onAkhir }: {
  k: KasusPublik; rah: KasusRahasia | null; hasil: Hasil; catat: Catat; dicatat: boolean; adaLanjut: boolean;
  onUlang: () => void; onKunci: () => void; onLanjut: () => void; onAkhir: () => void;
}) {
  const benar = hasil.jenis === "benar";
  const kunci = hasil.jenis === "kunci";
  const bebas = hasil.jenis === "bebas";
  const baris = hasil.baris.filter((x) => x.e !== 0 || x.u !== 0);
  const jmlSalah = hasil.uji ? hasil.jmlSalah ?? 0 : hasil.baris.filter((x) => !x.ok).length + hasil.pemeriksaan.filter((x) => !x.ok && !x.info).length;
  const bagus = benar || kunci || (bebas && hasil.pemeriksaan.every((x) => x.ok));
  const koreksi: { k: string | null; m: string }[] = [...(!kunci && rah?.nol && hasil.koreksi.length ? [{ k: null, m: rah.nol }] : []), ...(kunci ? [] : hasil.koreksi)];
  return (
    <div className={`res ${bagus ? "good" : "bad"}`}>
      <div className="vd">
        <span className="ic">{bagus ? "✓" : "!"}</span>
        <div>
          <strong>{bebas ? "Validasi engine" : benar ? "Benar" : kunci ? "Jawaban yang benar" : "Belum tepat"}</strong>
          <small>{bebas ? "Hasil hitung otomatis dari isian Anda." : benar ? `Semua kotak dan validasi sesuai. ${bintangTeks(hasil.bintang ?? 0)}` : kunci ? "Kotak sudah diisi dengan jawaban benar." : `${jmlSalah} hal perlu diperbaiki.`}</small>
        </div>
      </div>
      <CatatInfo catat={catat} dicatat={dicatat} />
      {!bebas && !hasil.uji && (baris.length === 0
        ? <section><h3>Cek per kotak</h3><p style={{ fontSize: 13 }}>Semua kotak pada kasus ini seharusnya kosong.</p></section>
        : <section><h3>Cek per kotak</h3>
            <table className="tbl"><thead><tr><th>Kotak</th><th style={{ textAlign: "right" }}>Anda</th><th style={{ textAlign: "right" }}>Benar</th></tr></thead>
              <tbody>{baris.map((x) => <tr key={x.k}><td>{labelSel(x.k)}</td><td className={`n ${x.ok ? "y" : "x"}`}>{x.ok ? "✓ " : "✗ "}{fmt(x.u)}</td><td className="n">{fmt(x.e)}</td></tr>)}</tbody></table>
          </section>)}
      {hasil.pemeriksaan.length > 0 && (
        <section><h3>{bebas ? "Pemeriksaan" : "Validasi engine"}</h3>
          {hasil.pemeriksaan.map((x, i) => <div key={i} className={`chk ${x.ok ? "ok" : "no"}`}><b>{x.info ? "i" : x.ok ? "✓" : "✗"}</b><span>{x.t}</span></div>)}
          {hasil.ctl && <KontrolTabel ctl={hasil.ctl} />}
        </section>
      )}
      {koreksi.length > 0 && !bebas && (
        <section><h3>Koreksi</h3><ul className="fb">{koreksi.map((f, i) => <li key={i}>{f.k && <b>{labelSel(f.k)}. </b>}{f.m}</li>)}</ul></section>
      )}
      {hasil.uji && benar && <div className="btns">{adaLanjut ? <button type="button" className="btn pri" onClick={onLanjut}>Kasus berikutnya</button> : <button type="button" className="btn pri" onClick={onAkhir}>Lihat hasil akhir</button>}</div>}
      {!hasil.uji && (benar || kunci) && rah && (
        <>
          <section><h3>Cara hitung</h3><ol className="steps">{rah.langkah.map((s, i) => <li key={i} dangerouslySetInnerHTML={html(s)} />)}</ol></section>
          <section><h3>Pembahasan</h3><p style={{ fontSize: 13 }} dangerouslySetInnerHTML={html(rah.pembahasan)} /><p className="ref" style={{ marginTop: 6 }}>Rujukan: {rah.rujukan}</p></section>
          <div className="btns">{adaLanjut ? <button type="button" className="btn pri" onClick={onLanjut}>Kasus berikutnya</button> : <button type="button" className="btn pri" onClick={onAkhir}>Lihat hasil akhir</button>}</div>
        </>
      )}
      {hasil.jenis === "salah" && <div className="btns"><button type="button" className="btn pri" onClick={onUlang}>Coba lagi</button>{!hasil.uji && <button type="button" className="btn" onClick={onKunci}>Lihat jawaban</button>}</div>}
    </div>
  );
}

function CatatInfo({ catat, dicatat }: { catat: Catat; dicatat: boolean }) {
  if (!dicatat) return null;
  if (catat.status === "mengirim") return <div className="catat tidak" role="status" style={{ margin: "8px 12px" }}>Mencatat percobaan…</div>;
  if (catat.status === "ok") return <div className="catat ya" role="status" style={{ margin: "8px 12px" }}>Tercatat: percobaan ke-{catat.nomor} pada kasus ini.</div>;
  if (catat.status === "gagal" && catat.pesan && DITOLAK_SERVER.test(catat.pesan)) return <div className="catat gagal" role="alert" style={{ margin: "8px 12px" }}>Percobaan ini tidak dicatat: {catat.pesan}</div>;
  if (catat.status === "gagal") return <div className="catat gagal" role="alert" style={{ margin: "8px 12px" }}>Percobaan ini belum tercatat ({catat.pesan}). Tekan Periksa lagi bila sinyal sudah baik.</div>;
  return null;
}
