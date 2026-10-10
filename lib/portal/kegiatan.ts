// lib/portal/kegiatan.ts  (hanya server)
//
// (8 Okt 2026) Adapter "tahapan" Transport Lokal untuk struktur 3 layer: dari penugasan + hari kerja + laporan + foto menjadi daftar langkah bernomor
// (Persiapan / Pelaksanaan / Penyelesaian) dan ringkasan Layer 1 (cincin progres). Kegiatan lain belum punya tahapan terukur.

import type { Db, Penugasan } from "@/lib/sigap";
import { HK_AKTIF, hariIniWib, hariLengkap } from "@/lib/sigap";
import type { LangkahKegiatan, NadaKegiatan, RingkasKegiatan, StatusLangkah } from "@/lib/sigapKegiatan";

function tglPendek(iso: string): string {
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${b[m - 1]} ${y}`;
}

export type MasukanTranslok = {
  p: Pick<Penugasan, "id" | "kegiatan" | "label_jabatan" | "status_periode" | "ditutup_pada" | "dikunci_at">;
  hariKerja: string[];
  /** tanggal -> { laporan, foto } */
  isian: Record<string, { laporan: boolean; foto: number }>;
  hariIni: string;
  hrefKerja: string;
  nowMs: number;
};

/** Murni (tanpa DB) supaya bisa diuji. */
export function susunTranslok(m: MasukanTranslok): RingkasKegiatan {
  const { p, hariKerja, isian, hariIni, hrefKerja, nowMs } = m;
  const k = p.kegiatan;
  const lengkap = (t: string) => hariLengkap(!!isian[t]?.laporan, isian[t]?.foto ?? 0, k);
  const berlaku = hariKerja.filter((t) => t <= hariIni);
  const lengkapN = berlaku.filter(lengkap).length;
  const adaHariIni = hariKerja.includes(hariIni);
  const lengkapHariIni = adaHariIni && lengkap(hariIni);
  const aktif = p.status_periode === "aktif" || p.status_periode === "tenggang";
  const dikunci = !!p.dikunci_at;
  const akhirHari = new Date(`${hariIni}T23:59:00+07:00`).getTime();
  const sisaDetik = (akhirHari - nowMs) / 1000;

  // --- langkah 3: laporan & foto harian
  let s3: StatusLangkah;
  let ket3: string;
  let batas3: string | null = null;
  const terlewatN = berlaku.filter((t) => t < hariIni && !lengkap(t)).length;
  if (hariKerja.length === 0) {
    s3 = "menunggu";
    ket3 = "Setelah hari kerja dipilih";
  } else if (adaHariIni && !lengkapHariIni && aktif) {
    const f = isian[hariIni]?.foto ?? 0;
    const bagian = [k.wajib_laporan ? (isian[hariIni]?.laporan ? "laporan sudah" : "laporan belum") : null, `foto ${f} dari ${k.jumlah_foto}`].filter(Boolean).join(", ");
    s3 = sisaDetik < 7200 ? "mendesak" : "perlu";
    ket3 = `Hari ini: ${bagian}. Batas 23.59 WIB.`;
    batas3 = new Date(akhirHari).toISOString();
  } else if (terlewatN > 0) {
    s3 = "perlu";
    ket3 = `${terlewatN} hari kerja belum lengkap. Minta izin susulan ke admin.`;
  } else if (berlaku.length > 0 && lengkapN === hariKerja.length) {
    s3 = "selesai";
    ket3 = `${hariKerja.length} hari kerja lengkap`;
  } else if (berlaku.length === 0) {
    s3 = "menunggu";
    ket3 = `Hari kerja pertama ${tglPendek(hariKerja[0])}`;
  } else {
    s3 = "berjalan";
    ket3 = `${lengkapN} dari ${hariKerja.length} hari kerja lengkap`;
  }

  const s2: StatusLangkah = hariKerja.length > 0 ? "selesai" : aktif ? "perlu" : "menunggu";
  const langkah: LangkahKegiatan[] = [
    { no: 1, kode: "penugasan", kelompok: "Persiapan", judul: "Terima penugasan", ket: p.label_jabatan, status: "selesai" },
    {
      no: 2,
      kode: "hari_kerja",
      kelompok: "Persiapan",
      judul: "Pilih hari kerja",
      ket: hariKerja.length ? `${hariKerja.length} hari kerja dipilih` : "Belum ada hari kerja dipilih",
      status: s2,
      href: hrefKerja,
      aksi: "Pilih hari kerja",
    },
    { no: 3, kode: "harian", kelompok: "Pelaksanaan", judul: k.wajib_laporan ? "Laporan & foto harian" : "Foto harian", ket: ket3, status: s3, href: hrefKerja, aksi: s3 === "mendesak" || s3 === "perlu" ? "Lanjutkan isi hari ini" : "Buka isian", batas: batas3 },
    { no: 4, kode: "verifikasi", kelompok: "Penyelesaian", judul: "Rekap & verifikasi admin", ket: dikunci ? "SPJ sudah dikunci admin" : "Setelah semua hari kerja terisi", status: dikunci ? "selesai" : "menunggu" },
    { no: 5, kode: "spj", kelompok: "Penyelesaian", judul: "Unduh SPJ", ket: dikunci ? "SPJ siap diunduh" : "Setelah SPJ dikunci admin", status: dikunci ? "sekarang" : "terkunci", href: dikunci ? hrefKerja : null, aksi: "Unduh SPJ" },
  ];

  const selesai = langkah.filter((l) => l.status === "selesai").length;
  const total = langkah.length;
  const bagian3 = langkah[2].status !== "selesai" && hariKerja.length > 0 ? lengkapN / hariKerja.length : 0;
  const pecahan = Math.min(1, (selesai + bagian3) / total);

  let nada: NadaKegiatan;
  let pesan: string;
  if (p.status_periode === "akan_datang" || p.status_periode === "belum_diatur") {
    nada = "abu";
    pesan = "Belum mulai";
  } else if (dikunci && selesai >= 4) {
    nada = "hijau";
    pesan = "SPJ dikunci";
  } else if (s3 === "mendesak") {
    nada = "merah";
    pesan = "Isian hari ini belum lengkap";
  } else if (s3 === "perlu" || s2 === "perlu") {
    nada = "emas";
    pesan = s2 === "perlu" ? "Pilih hari kerja" : adaHariIni && !lengkapHariIni ? `Foto kurang ${Math.max(0, k.jumlah_foto - (isian[hariIni]?.foto ?? 0))}` : "Ada hari belum lengkap";
  } else if (p.status_periode === "tenggang") {
    nada = "emas";
    pesan = "Masa tenggang";
  } else {
    nada = "biru";
    pesan = "Berjalan";
  }

  return {
    id: `translok-${p.id}`,
    judul: `Transport Lokal — ${k.nama}`,
    pendek: `Translok ${k.nama}`.slice(0, 38),
    ikon: "motor",
    nada,
    pecahan,
    selesai,
    total,
    sub: `${selesai}/${total} · ${pesan}`,
    peringatan: nada === "merah" || nada === "emas",
    href: `/sigap/kegiatan/translok-${p.id}`,
    langkah,
    kegiatan_id: k.id,
  };
}

/** Semua penugasan Transport Lokal non-arsip milik akun -> ringkasan + langkah. */
export async function kegiatanTranslok(db: Db, akunId: number, token: string, pen: Penugasan[], nowMs: number): Promise<RingkasKegiatan[]> {
  const aktif = pen.filter((p) => p.status_periode !== "arsip");
  if (aktif.length === 0) return [];
  const ids = aktif.map((p) => p.id);
  const [{ data: hk }, { data: lap }, { data: dok }] = await Promise.all([
    db.from("sigap_hari_kerja").select("penugasan_id, tanggal").eq("akun_id", akunId).or(HK_AKTIF()),
    db.from("sigap_realisasi").select("penugasan_id, tanggal").in("penugasan_id", ids),
    db.from("sigap_dokumentasi").select("penugasan_id, tanggal").in("penugasan_id", ids),
  ]);
  const hariIni = hariIniWib();
  return aktif.map((p) => {
    const hariKerja = Array.from(new Set((hk ?? []).filter((h) => h.penugasan_id === p.id).map((h) => h.tanggal as string))).sort();
    const isian: Record<string, { laporan: boolean; foto: number }> = {};
    for (const t of hariKerja) {
      isian[t] = {
        laporan: (lap ?? []).some((r) => r.penugasan_id === p.id && r.tanggal === t),
        foto: (dok ?? []).filter((f) => f.penugasan_id === p.id && f.tanggal === t).length,
      };
    }
    return susunTranslok({ p, hariKerja, isian, hariIni, hrefKerja: `/sigap/translok/${token}?p=${p.id}`, nowMs }); // (10 Okt 2026) ?p= -> halaman langsung membuka kegiatan ini, bukan penugasan pertama
  });
}
