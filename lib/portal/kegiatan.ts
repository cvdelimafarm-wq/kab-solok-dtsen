// lib/portal/kegiatan.ts  (hanya server)
//
// (8 Okt 2026) Adapter "tahapan" Transport Lokal untuk struktur 3 layer: dari penugasan + hari kerja + laporan + foto menjadi daftar langkah bernomor
// (Persiapan / Pelaksanaan / Penyelesaian) dan ringkasan Layer 1 (cincin progres). Kegiatan lain belum punya tahapan terukur.
// (14 Okt 2026) Permintaan user (fokus utama: kejelasan yang belum dilengkapi + pengingat dinamis):
//  - Hari dinilai dengan penilai yang SAMA dengan halaman kerja (hariDinilai: laporan manual ATAU laporan dianggap dari hasil lembar).
//  - Daftar `kekurangan` (lib/sigapKekurangan.ts): apa persisnya yang belum lengkap + tautan yang membuka bagian itu.
//  - Langkah 2/3/5 membuka tab/hari/bagian yang tepat (?tab=&tgl=&fokus=), bukan sekadar halaman kerja.

import type { Db, Penugasan } from "@/lib/sigap";
import { HK_AKTIF, hariIniWib } from "@/lib/sigap";
import { laporanDianggap, satuanLaporan, sumberUntukPeran, type SumberOtomatis } from "@/lib/realisasiOtomatis";
import { ambilRealisasiOtomatisRingan } from "@/lib/portal/realisasiOtomatis";
import type { LangkahKegiatan, NadaKegiatan, RingkasKegiatan, StatusLangkah } from "@/lib/sigapKegiatan";
import { hariLengkapDinilai, hitungTerlewat, susunKekurangan, type IsianHari, type MasukanKekurangan } from "@/lib/sigapKekurangan";
import { alamatLembarUtama } from "@/lib/sigapSubPrioritas";

function tglPendek(iso: string): string {
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${b[m - 1]} ${y}`;
}

/** Tambahkan parameter alamat ke tautan halaman kerja (yang sudah memuat ?p=). */
const tambahQ = (href: string, q: string) => `${href}${href.includes("?") ? "&" : "?"}${q}`;

export type IsianTranslok = {
  laporan: boolean;
  foto: number;
  /** nomor slot foto yang sudah ada (bila kosong, dianggap 1..foto) */
  slot?: number[];
  /** (21 Okt 2026) foto Kamera SIGAP terkirim yang belum menempati nomor pada tanggal ini */
  cadangan?: number;
  /** hari lampau tanpa laporan manual tetapi ada hasil lembar (dihitung selesai) */
  dianggap?: boolean;
  hasilLembar?: number | null;
  jorong?: string | null;
};

export type MasukanTranslok = {
  p: Pick<Penugasan, "id" | "kegiatan" | "label_jabatan" | "status_periode" | "ditutup_pada" | "dikunci_at">;
  hariKerja: string[];
  /** tanggal -> isian hari itu */
  isian: Record<string, IsianTranslok>;
  hariIni: string;
  hrefKerja: string;
  nowMs: number;
  /** izin susulan yang masih berlaku: tanggal -> berlaku_sampai (ISO) */
  izin?: Record<string, string>;
  namaPetugas?: string | null;
  satuan?: string;
  sumber?: SumberOtomatis | null;
  hrefLembar?: string | null;
  waAdmin?: string | null;
};

/** Murni (tanpa DB) supaya bisa diuji. */
export function susunTranslok(m: MasukanTranslok): RingkasKegiatan {
  const { p, hariKerja, isian, hariIni, hrefKerja, nowMs } = m;
  const k = p.kegiatan;
  const aktif = p.status_periode === "aktif" || p.status_periode === "tenggang";
  const dikunci = !!p.dikunci_at;

  const isianKek: Record<string, IsianHari> = {};
  for (const [t, v] of Object.entries(isian)) {
    isianKek[t] = { laporan: v.laporan, slot: v.slot ?? Array.from({ length: v.foto }, (_, i) => i + 1), cadangan: v.cadangan ?? 0, dianggap: !!v.dianggap, hasilLembar: v.hasilLembar ?? null, jorong: v.jorong ?? null };
  }
  const kekMasuk: MasukanKekurangan = {
    penugasanId: p.id,
    namaKegiatan: k.nama,
    namaPetugas: m.namaPetugas ?? null,
    aturan: k,
    satuan: m.satuan ?? k.satuan_realisasi,
    aktif: aktif && !dikunci,
    hariKerja,
    isian: isianKek,
    izin: m.izin,
    hariIni,
    hrefDasar: hrefKerja,
    sumber: m.sumber ?? null,
    hrefLembar: m.hrefLembar ?? null,
    waAdmin: m.waAdmin ?? null,
  };
  const kek = susunKekurangan(kekMasuk, nowMs);
  const ter = hitungTerlewat(kekMasuk, nowMs);
  const tugasHariIni = kek.find((x) => x.tanggal === hariIni && (x.jenis === "foto" || x.jenis === "laporan" || x.jenis === "lembar")) ?? null;
  const izinAktif = kek.find((x) => x.jenis === "perbaikan") ?? null; // (15 Okt 2026) izin susulan per hari digabung jadi satu "Perbaiki administrasi"

  const lengkap = (t: string) => hariLengkapDinilai(isianKek[t], k);
  const berlaku = hariKerja.filter((t) => t <= hariIni);
  const lengkapN = berlaku.filter(lengkap).length;
  const adaHariIni = hariKerja.includes(hariIni);
  const lengkapHariIni = adaHariIni && lengkap(hariIni);
  const akhirHari = new Date(`${hariIni}T23:59:00+07:00`).getTime();
  const sisaDetik = (akhirHari - nowMs) / 1000;

  // --- langkah 3: laporan & foto harian
  let s3: StatusLangkah;
  let ket3: string;
  let batas3: string | null = null;
  let href3: string = hrefKerja;
  let aksi3: string | undefined;
  if (hariKerja.length === 0) {
    s3 = "menunggu";
    ket3 = "Setelah hari kerja dipilih";
  } else if (adaHariIni && !lengkapHariIni && aktif) {
    const f = isian[hariIni]?.foto ?? 0;
    const bagian = [k.wajib_laporan ? (isian[hariIni]?.laporan ? "laporan sudah" : "laporan belum") : null, `foto ${f} dari ${k.jumlah_foto}`].filter(Boolean).join(", ");
    s3 = sisaDetik < 7200 ? "mendesak" : "perlu";
    ket3 = tugasHariIni ? `${tugasHariIni.judul}. Batas 23.59 WIB.` : `Hari ini: ${bagian}. Batas 23.59 WIB.`;
    batas3 = new Date(akhirHari).toISOString();
    if (tugasHariIni) {
      href3 = tugasHariIni.href;
      aksi3 = tugasHariIni.aksi;
    }
  } else if (izinAktif || ter.baru > 0) {
    // (14 Okt 2026) hari terlewat yang sudah diberi izin susulan tidak lagi disuruh "minta izin"; hari terlewat LAMA (lewat jendela) tidak membuat langkah merah terus-menerus
    s3 = "perlu";
    ket3 = izinAktif ? `${izinAktif.judul}. ${izinAktif.uraian}` : `${ter.baru} hari kerja belum lengkap. Minta izin susulan ke admin.`;
    if (izinAktif) {
      href3 = izinAktif.href;
      aksi3 = izinAktif.aksi;
      batas3 = izinAktif.batas;
    } else if (ter.terbaru) {
      href3 = tambahQ(hrefKerja, `tab=hari_kerja&tgl=${ter.terbaru}`);
      aksi3 = "Lihat hari terlewat";
    }
  } else if (berlaku.length > 0 && lengkapN === hariKerja.length) {
    s3 = "selesai";
    ket3 = `${hariKerja.length} hari kerja lengkap`;
  } else if (berlaku.length === 0) {
    s3 = "menunggu";
    ket3 = `Hari kerja pertama ${tglPendek(hariKerja[0])}`;
  } else {
    s3 = "berjalan";
    ket3 = `${lengkapN} dari ${hariKerja.length} hari kerja lengkap${ter.semua > 0 ? `. ${ter.semua} hari terlewat (tidak masuk Kwitansi).` : ""}`;
  }

  // (10 Okt 2026) Langkah "Laporan & foto harian" terkunci di luar hari kerja -- permintaan user: PPL yang menekannya melihat pesan
  // "Anda berada di luar hari kerja". Tetap terbuka bila ada yang perlu dilengkapi (hari terlewat / izin susulan), sudah selesai, atau hari ini hari kerja.
  let pesanKunci3: string | null = null;
  if (!adaHariIni && (s3 === "menunggu" || s3 === "berjalan")) {
    const berikut = hariKerja.find((t) => t > hariIni);
    pesanKunci3 =
      hariKerja.length === 0
        ? "Anda berada di luar hari kerja: belum ada hari kerja yang dipilih. Pilih hari kerja dulu di langkah 2."
        : `Anda berada di luar hari kerja. Laporan & foto harian hanya bisa diisi pada hari kerja${berikut ? ` (berikutnya ${tglPendek(berikut)})` : ""}.`;
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
      href: tambahQ(hrefKerja, "tab=hari_kerja"),
      aksi: "Pilih hari kerja",
    },
    {
      no: 3,
      kode: "harian",
      kelompok: "Pelaksanaan",
      judul: k.wajib_laporan ? "Laporan & foto harian" : "Foto harian",
      ket: ket3,
      status: s3,
      href: pesanKunci3 ? null : href3,
      aksi: s3 === "mendesak" || s3 === "perlu" ? (aksi3 ?? "Lanjutkan isi hari ini") : "Buka isian",
      batas: batas3,
      pesanKunci: pesanKunci3,
    },
    { no: 4, kode: "verifikasi", kelompok: "Penyelesaian", judul: "Rekap & verifikasi admin", ket: dikunci ? "SPJ sudah dikunci admin" : "Setelah semua hari kerja terisi", status: dikunci ? "selesai" : "menunggu" },
    { no: 5, kode: "spj", kelompok: "Penyelesaian", judul: "Unduh SPJ", ket: dikunci ? "SPJ siap diunduh" : "Setelah SPJ dikunci admin", status: dikunci ? "sekarang" : "terkunci", href: dikunci ? tambahQ(hrefKerja, "tab=arsip") : null, aksi: "Unduh SPJ" },
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
    pesan = tugasHariIni?.ringkas ?? "Isian hari ini belum lengkap";
  } else if (s3 === "perlu" || s2 === "perlu") {
    nada = "emas";
    pesan = s2 === "perlu" ? "Pilih hari kerja" : (tugasHariIni?.ringkas ?? izinAktif?.ringkas ?? kek.find((x) => x.jenis === "hari_terlewat")?.ringkas ?? "Ada hari belum lengkap");
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
    kekurangan: kek,
  };
}

/** Semua penugasan Transport Lokal non-arsip milik akun -> ringkasan + langkah. */
export async function kegiatanTranslok(
  db: Db,
  akunId: number,
  token: string,
  pen: Penugasan[],
  nowMs: number,
  opsi: { namaPetugas?: string | null; waAdmin?: string | null } = {}
): Promise<RingkasKegiatan[]> {
  return (await muatMasukanTranslok(db, akunId, token, pen, nowMs, opsi)).map((m) => susunTranslok(m));
}

/**
 * (21 Okt 2026) Foto Kamera SIGAP milik akun yang sudah terkirim tetapi tidak menempati nomor mana pun (tag pemotret masih "diajukan" atau
 * "dilepas" = tergeser foto lain). Kunci hasil: "<kegiatan_id>|<tanggal>". Syarat sama dengan panel Nomor foto (app/api/sigap/foto/susun):
 * foto merah yang belum diperiksa dan foto "dipertanyakan" tidak dihitung. Gagal membaca = dianggap tidak ada (Beranda tidak boleh ikut rusak).
 */
export async function hitungCadanganFoto(db: Db, akunId: number, fotoDipakai: (number | null)[]): Promise<Map<string, number>> {
  const hasil = new Map<string, number>();
  try {
    const { data: tag } = await db.from("sigap_foto_tag").select("foto_id").eq("akun_id", akunId).eq("peran_tag", "pemotret").in("status", ["diajukan", "dilepas"]).limit(500);
    const ids = (tag ?? []).map((t) => t.foto_id as number).filter((id) => !fotoDipakai.includes(id));
    if (!ids.length) return hasil;
    const { data: foto } = await db.from("sigap_foto").select("id, kegiatan_id, tanggal, kepercayaan, status_periksa").in("id", ids).eq("akun_pengambil", akunId);
    for (const f of foto ?? []) {
      if (f.status_periksa === "dipertanyakan") continue;
      if (f.kepercayaan === "merah" && f.status_periksa !== "diperiksa") continue;
      const k = `${f.kegiatan_id}|${f.tanggal}`;
      hasil.set(k, (hasil.get(k) ?? 0) + 1);
    }
  } catch {
    /* abaikan */
  }
  return hasil;
}

/**
 * (15 Okt 2026) Bahan mentah per penugasan (hari kerja, isian per tanggal, izin susulan aktif) sebelum disusun menjadi ringkasan.
 * Dipakai kegiatanTranslok dan siaran perbaikan admin (perlu isian per tanggal, bukan hanya kekurangan).
 */
export async function muatMasukanTranslok(
  db: Db,
  akunId: number,
  token: string,
  pen: Penugasan[],
  nowMs: number,
  opsi: { namaPetugas?: string | null; waAdmin?: string | null } = {}
): Promise<MasukanTranslok[]> {
  const aktif = pen.filter((p) => p.status_periode !== "arsip");
  if (aktif.length === 0) return [];
  const ids = aktif.map((p) => p.id);
  const [{ data: hk }, { data: lap }, { data: dok }, { data: izin }] = await Promise.all([
    db.from("sigap_hari_kerja").select("penugasan_id, tanggal").eq("akun_id", akunId).or(HK_AKTIF()),
    db.from("sigap_realisasi").select("penugasan_id, tanggal").in("penugasan_id", ids),
    db.from("sigap_dokumentasi").select("penugasan_id, tanggal, slot, foto_id").in("penugasan_id", ids),
    db.from("sigap_izin_susulan").select("penugasan_id, tanggal, berlaku_sampai").in("penugasan_id", ids).gt("berlaku_sampai", new Date(nowMs).toISOString()),
  ]);
  const hariIni = hariIniWib();
  const cadangan = await hitungCadanganFoto(db, akunId, (dok ?? []).map((d) => d.foto_id as number | null));
  return Promise.all(
    aktif.map(async (p) => {
      const hariKerja = Array.from(new Set((hk ?? []).filter((h) => h.penugasan_id === p.id).map((h) => h.tanggal as string))).sort();
      const satuan = satuanLaporan(p.kegiatan.kode, p.peran, p.kegiatan.satuan_realisasi);
      const sumber = sumberUntukPeran(p.kegiatan.kode, p.peran);
      // hasil lembar (identifikasi/pendataan) per tanggal: dasar "laporan dianggap" dan saran isi laporan
      const oto = sumber ? await ambilRealisasiOtomatisRingan(db, akunId, p.peran, p.kegiatan.kode, satuan, hariKerja.filter((t) => t <= hariIni)) : new Map();
      const isian: Record<string, IsianTranslok> = {};
      for (const t of hariKerja) {
        const laporan = (lap ?? []).some((r) => r.penugasan_id === p.id && r.tanggal === t);
        const fotoBaris = (dok ?? []).filter((f) => f.penugasan_id === p.id && f.tanggal === t);
        const o = oto.get(t) ?? null;
        isian[t] = {
          laporan,
          foto: fotoBaris.length,
          slot: fotoBaris.map((f) => Number(f.slot)).filter((n) => Number.isInteger(n) && n > 0),
          cadangan: cadangan.get(`${p.kegiatan.id}|${t}`) ?? 0,
          dianggap: !!p.kegiatan.wajib_laporan && laporanDianggap(t, hariIni, laporan, o),
          hasilLembar: o?.jumlah ?? null,
          jorong: o?.lokasi[0]?.jorong ?? null,
        };
      }
      const izinP: Record<string, string> = {};
      for (const z of izin ?? []) if (z.penugasan_id === p.id) izinP[z.tanggal as string] = z.berlaku_sampai as string;
      const masukan: MasukanTranslok = {
        p,
        hariKerja,
        isian,
        hariIni,
        hrefKerja: `/sigap/translok/${token}?p=${p.id}`, // (10 Okt 2026) ?p= -> halaman langsung membuka kegiatan ini, bukan penugasan pertama
        nowMs,
        izin: izinP,
        namaPetugas: opsi.namaPetugas ?? null,
        satuan,
        sumber,
        hrefLembar: sumber === "identifikasi" ? alamatLembarUtama("/sigap/identifikasi") : sumber === "pendataan" ? alamatLembarUtama("/sigap/pendataan") : null,
        waAdmin: opsi.waAdmin ?? null,
      };
      return masukan;
    })
  );
}
