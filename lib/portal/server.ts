// lib/portal/server.ts  (hanya server)
//
// (7 Okt 2026) Portal satu login -- permintaan user: "buat portal login hanya 1 saja di depan, kemudian user bisa
// menggunakan/akses kartu/menu sesuai periodenya jadi ada identifikasi user role dan menu yg dapat dia akses".
// Identitas tunggal = sigap_akun (sesi HMAC dari lib/sigapAkses). Aplikasi lama dijembatani:
//  - Penyisiran : akun dicocokkan nama ke petugas_penyisiran_akun -> token penyisiran_petugas (lib/penyisiranAuth).
//  - Bencana    : sigap_akun.petugas_bencana_id -> halaman tujuan (lib/undangan.tentukanTujuan).
//  - DTSEN      : operator Wali Nagari tetap akun Supabase (nomor HP + PIN 6 digit), diketik di form yg sama.
// Kartu dihitung DI SERVER dari peran (sigap_akun_peran -> sigap_peran_izin) + periode kegiatan.

import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/lib/sigap";
import { penugasanAkun } from "@/lib/sigap";
import { boleh, izinAkun, sesiDariHeader, type PeranAkun, type PetaIzin } from "@/lib/sigapAkses";
import { tentukanTujuan } from "@/lib/undangan";

export function dbPortal(): Db | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export type AkunPortal = { id: number; nama: string; jenis: string; token: string; petugas_bencana_id: number | null; aktif: boolean };

export async function akunDariSesi(db: Db, h: Headers): Promise<AkunPortal | null> {
  const id = sesiDariHeader(h);
  if (!id) return null;
  const { data } = await db.from("sigap_akun").select("id, nama, jenis, token, petugas_bencana_id, aktif").eq("id", id).maybeSingle();
  if (!data || !data.aktif) return null;
  return data as AkunPortal;
}

/** Nama ternormalisasi gaya penyisiran (huruf besar, spasi tunggal), dgn & tanpa gelar sesudah koma. */
export function kandidatNamaPenyisiran(nama: string): string[] {
  const n = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
  return Array.from(new Set([n(nama), n(nama.split(",")[0])])).filter(Boolean);
}

export type AkunPenyisiran = { id: number; nama: string; lat: number | null; lng: number | null };

/** Akun petugas penyisiran yg cocok (tepat 1) dgn nama akun portal, atau null. */
export async function cocokPenyisiran(db: Db, nama: string): Promise<AkunPenyisiran | null> {
  for (const k of kandidatNamaPenyisiran(nama)) {
    const { data } = await db.from("petugas_penyisiran_akun").select("id, nama, aktif, lat, lng").eq("nama_norm", k).limit(2);
    const aktif = (data ?? []).filter((x) => x.aktif !== false);
    if (aktif.length === 1) return { id: aktif[0].id as number, nama: aktif[0].nama as string, lat: (aktif[0].lat as number | null) ?? null, lng: (aktif[0].lng as number | null) ?? null };
    if (aktif.length > 1) return null; // ganda -> jangan menebak
  }
  return null;
}

/** Boleh masuk portal: punya penugasan, peran, pegawai organik, petugas bencana, atau petugas penyisiran. */
export async function bolehMasukPortal(db: Db, akun: { id: number; nama: string; jenis?: string | null; petugas_bencana_id?: number | null }): Promise<boolean> {
  if (akun.jenis === "organik" || akun.petugas_bencana_id) return true;
  if ((await penugasanAkun(db, akun.id)).length > 0) return true;
  if ((await izinAkun(db, akun.id)).peran.length > 0) return true;
  return !!(await cocokPenyisiran(db, akun.nama));
}

// ---------------------------------------------------------------- kartu beranda
export type Nada = "aktif" | "tenggang" | "arsip" | "info" | "peringatan";
export type Kartu = {
  kode: string;
  grup: "tugas" | "kelola" | "referensi" | "riwayat";
  judul: string;
  uraian: string;
  status?: { label: string; nada: Nada };
  href?: string | null;
  sso?: "penyisiran";
  label_aksi?: string;
  gelap?: boolean;
};

function tglIndo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${b[m - 1]} ${y}`;
}

export async function susunBeranda(db: Db, akun: AkunPortal): Promise<{ peran: PeranAkun[]; izin: PetaIzin; kartu: Kartu[]; admin_aplikasi: boolean }> {
  const [pen, { peran, izin }, { data: apl }] = await Promise.all([
    penugasanAkun(db, akun.id),
    izinAkun(db, akun.id),
    db.from("portal_aplikasi").select("kode, nama, uraian, href, menu_admin, urutan, aktif").eq("aktif", true).order("urutan"),
  ]);
  const kartu: Kartu[] = [];

  // 1. Transport lokal per penugasan: aktif/tenggang -> Tugas aktif; arsip -> Riwayat (baca-saja).
  for (const p of pen) {
    const st = p.status_periode;
    const arsip = st === "arsip";
    const status: Kartu["status"] =
      st === "arsip"
        ? { label: "Arsip baca-saja", nada: "arsip" }
        : st === "tenggang"
          ? { label: `Masa tenggang s.d. ${tglIndo(p.ditutup_pada)}`, nada: "tenggang" }
          : st === "akan_datang"
            ? { label: `Mulai ${tglIndo(p.periode.mulai)}`, nada: "info" }
            : st === "belum_diatur"
              ? { label: "Periode belum diatur", nada: "info" }
              : { label: p.ditutup_pada ? `Aktif, input ditutup ${tglIndo(p.ditutup_pada)}` : "Aktif", nada: "aktif" };
    kartu.push({
      kode: `translok-${p.id}`,
      grup: arsip ? "riwayat" : "tugas",
      judul: `Transport Lokal — ${p.kegiatan.nama}`,
      uraian: arsip
        ? `Selesai ${tglIndo(p.periode.selesai)}. Lihat isian & unduh SPJ.`
        : `${p.label_jabatan}. Hari kerja, laporan harian & foto, SPJ.`,
      status: p.dikunci_at ? { label: "SPJ dikunci admin", nada: "arsip" } : status,
      href: `/sigap/translok/${akun.token}`,
      label_aksi: arsip ? "Lihat & unduh SPJ" : "Buka",
    });
  }

  // 2. Pendataan bencana (akun terhubung ke petugas bencana).
  if (akun.petugas_bencana_id) {
    const { data: pb } = await db.from("bencana_petugas").select("id, nama, token, aktif").eq("id", akun.petugas_bencana_id).maybeSingle();
    if (pb && pb.aktif !== false) {
      const t = await tentukanTujuan(db, { id: pb.id as number, nama: pb.nama as string, token: pb.token as string });
      if (t.tipe === "dibatalkan") {
        kartu.push({ kode: "bencana", grup: "riwayat", judul: "Pendataan Pascabencana", uraian: t.pesan, status: { label: "Plotting dibatalkan", nada: "arsip" }, href: null });
      } else if (t.path) {
        const label = t.tipe === "pml" ? "PML" : t.tipe === "menginap" ? "Tawaran menginap" : "PPL";
        kartu.push({ kode: "bencana", grup: "tugas", judul: `Pendataan Pascabencana — ${label}`, uraian: "Konfirmasi wilayah, lokasi & tim. Tanpa tautan undangan lagi.", status: { label: "Aktif", nada: "aktif" }, href: t.path, label_aksi: "Buka" });
      }
    }
  }

  // 3. Penyisiran SE2026 (nama cocok di daftar petugas penyisiran).
  const ps = await cocokPenyisiran(db, akun.nama);
  if (ps) {
    kartu.push({ kode: "penyisiran", grup: "tugas", judul: "Penyisiran & Identifikasi SE2026", uraian: "Checklist penyisiran usaha, identifikasi jorong, administrasi.", sso: "penyisiran", label_aksi: "Buka" });
  }

  // 4. Pengelolaan (dari izin peran).
  const adaTranslok = Object.keys(izin).some((k) => k.startsWith("translok."));
  if (adaTranslok) kartu.push({ kode: "admin-translok", grup: "kelola", judul: "Admin Transport Lokal", uraian: "Monitoring, penugasan, verifikasi & kunci SPJ, periode kegiatan.", href: "/sigap/kelola/translok" });
  if (boleh(izin, "kontrak.kelola", "lihat")) kartu.push({ kode: "kontrak", grup: "kelola", judul: "Pengadaan & Kontrak", uraian: "Paket pengadaan, master & penyedia, dokumen kontrak.", href: "/sigap/kelola/pengadaan" });
  if (boleh(izin, "pedia.kelola", "lihat")) kartu.push({ kode: "pedia-kelola", grup: "kelola", judul: "SIGAP PEDIA — Penatausahaan", uraian: "Register, rekap & arsip bukti.", href: "/sigap/kelola/pedia" });
  const aplAdmin: [string, string][] = [
    ["dtsen.admin", "dtsen"],
    ["bencana.admin", "bencana"],
    ["penyisiran.admin", "penyisiran"],
    ["seruti.admin", "seruti"],
    ["delego.admin", "delego"],
  ];
  for (const [menu, kode] of aplAdmin) {
    if (!boleh(izin, menu, "lihat")) continue;
    const a = (apl ?? []).find((x) => x.kode === kode);
    if (!a) continue;
    kartu.push({
      kode: `admin-${kode}`,
      grup: "kelola",
      judul: `Admin ${a.nama as string}`,
      uraian: kode === "dtsen" ? `${(a.uraian as string) ?? ""}. Masuk dashboard dengan nomor HP akun DTSEN.` : ((a.uraian as string) ?? ""),
      href: (a.href as string | null) ?? null,
      status: a.href ? undefined : { label: "Tautan belum diatur", nada: "info" },
    });
  }
  // (10 Okt 2026) Monitoring Lembar Identifikasi SLS: admin bencana (izin bencana.admin)
  if (boleh(izin, "bencana.admin", "lihat")) kartu.push({ kode: "admin-identifikasi", grup: "kelola", judul: "Monitoring Identifikasi SLS", uraian: "Progres PML mengisi Lembar Identifikasi SLS: Sub SLS terisi, KK terdampak awal vs hasil.", href: "/sigap/kelola/identifikasi" });
  if (boleh(izin, "akses.kelola", "kelola")) kartu.push({ kode: "akses", grup: "kelola", judul: "Kelola Peran & Akses", uraian: "Peran, izin per menu, akun & lingkup kegiatan.", href: "/sigap/kelola/akses" });
  const adminAplikasi = boleh(izin, "portal.kelola", "kelola");
  if (adminAplikasi || boleh(izin, "translok.kegiatan", "kelola")) {
    kartu.push({
      kode: "portal-admin",
      grup: "kelola",
      judul: adminAplikasi ? "Kelola Aplikasi, Admin & Periode" : "Periode Kegiatan",
      uraian: adminAplikasi ? "Admin Aplikasi: tunjuk admin per aplikasi, atur masa tenggang & buka ulang." : "Atur masa tenggang & buka ulang kegiatan.",
      href: "/sigap/kelola/aplikasi",
      gelap: true,
    });
  }

  // 5. Referensi.
  if (akun.jenis === "organik" || boleh(izin, "pedia.baca", "lihat")) kartu.push({ kode: "pedia", grup: "referensi", judul: "SIGAP PEDIA", uraian: "Ensiklopedia aturan & arsip bukti.", href: "/sigap/pedia" });
  if (akun.jenis === "organik") kartu.push({ kode: "seruti", grup: "referensi", judul: "Seruti", uraian: "Progres lapangan & kualitas data.", href: "/seruti" });

  return { peran, izin, kartu, admin_aplikasi: adminAplikasi };
}

