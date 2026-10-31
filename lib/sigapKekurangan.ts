// lib/sigapKekurangan.ts
//
// (14 Okt 2026) "Yang belum dilengkapi" petugas Transport Lokal -- permintaan user (fokus utama): petugas harus jelas bagian mana yang belum
// lengkap (foto, laporan, ...), tombolnya membuka TEPAT bagian itu (bukan sekadar halaman kerja), dan pengingatnya berubah menurut kondisi
// nyata (bukan status tetap). Mockup: mockup-pengingat-dinamis-kekurangan.html. Murni (tanpa React/DB) supaya mudah diuji.
//
// Satu daftar kekurangan dihitung dari data yang sudah ada; kartu Beranda, kartu "Kerjakan sekarang" tahapan kegiatan, langkah bernomor,
// dan (nanti) modal pengingat membaca daftar yang SAMA supaya isinya tidak saling bertentangan. Urutan = skor tertinggi dulu:
//   perbaikan administrasi mendesak 91 > hari ini mendesak (sisa < 2 jam) 88 > perbaikan administrasi 78 (menggantikan 'izin susulan' per hari, 15 Okt) > hari ini 72..75 > pilih hari kerja 65 > hari terlewat 60.
//   Dalam "hari ini": hasil lembar sudah ada tetapi laporan belum / lembar belum ada hasil (+3) > foto (+2) > laporan manual (+0).
// Hari lampau yang tidak lengkap HANYA diingatkan dalam JENDELA_TERLEWAT_HARI hari (sesudahnya tidak bisa diperbaiki selain izin admin dan
// pengingat yang tak bisa ditindaklanjuti hanya menjadi gangguan); daftar lengkapnya tetap ada di tab Hari Kerja halaman kerja.

import { hariDinilai, type AturanIsian } from "@/lib/sigap";

export type NadaKekurangan = "merah" | "emas" | "biru";
export type JenisKekurangan = "izin_susulan" | "perbaikan" | "foto" | "laporan" | "lembar" | "hari_terlewat" | "hari_kerja";

/** (15 Okt 2026) Satu hari kerja lampau yang masih bisa diperbaiki (izin 24 jam), dipakai modal dan menu "Perbaiki administrasi". */
export type HariPerbaikan = { tanggal: string; laporan: boolean; foto: number; fotoTotal: number; sampai: string };

/** Alamat menu perbaikan administrasi (halaman tersendiri, bukan halaman kerja translok). */
export const alamatMenuPerbaikan = (penugasanId: number): string => `/sigap/perbaikan?p=${penugasanId}`;

export type Kekurangan = {
  /** unik per kekurangan + keadaan: berubah bila angkanya berubah (mis. foto 3 -> 4). Dipakai sebagai kunci modal "sekali per kekurangan". */
  kode: string;
  jenis: JenisKekurangan;
  tanggal: string | null;
  skor: number;
  nada: NadaKekurangan;
  /** label kecil di atas kartu: "TUGAS HARI INI", "SEGERA", "PERLU TINDAKAN", "PERSIAPAN" */
  label: string;
  judul: string;
  /** teks pendek untuk baris kecil (Layer 1), mis. "Foto kurang 3" */
  ringkas: string;
  uraian: string;
  /** batas akhir (ISO) untuk hitung mundur yang dihitung di klien; kosong = tidak ada hitung mundur */
  batas: string | null;
  /** lencana statis (tanpa hitung mundur), mis. "terlewat" */
  lencana?: { teks: string; nada: NadaKekurangan };
  progres?: { selesai: number; total: number };
  aksi: string;
  /** alamat internal yang membuka bagian yang kurang (tab/tgl/fokus untuk halaman kerja; /sigap/pendataan atau /sigap/identifikasi untuk lembar) */
  href: string;
  /** tombol kedua (mis. "Minta izin susulan ke admin" lewat WhatsApp, atau "Isi laporan manual"); luar = tautan keluar aplikasi */
  sekunder?: { teks: string; href: string; luar?: boolean };
  /** jenis "perbaikan": penugasan dan daftar hari yang bisa diperbaiki (checklist di modal/menu) */
  penugasanId?: number;
  hari?: HariPerbaikan[];
  /** jenis "perbaikan": alamat halaman kerja translok (foto/laporan manual) dan apakah laporan diperbaiki lewat daftar KK (kegiatan pendataan) */
  hrefKerja?: string;
  lewatKk?: boolean;
};

export type IsianHari = {
  /** laporan manual sudah tersimpan */
  laporan: boolean;
  /** nomor slot foto yang sudah ada */
  slot: number[];
  /** (21 Okt 2026) jumlah foto Kamera SIGAP yang sudah terkirim pada tanggal itu tetapi belum menempati nomor mana pun (cadangan/tergeser) */
  cadangan?: number;
  /** hari lampau tanpa laporan manual tetapi ada hasil lembar (dihitung selesai) */
  dianggap?: boolean;
  /** jumlah hasil di lembar (identifikasi/pendataan) pada tanggal itu; null = tak ada/ tak berlaku */
  hasilLembar?: number | null;
  /** nama jorong utama dari hasil lembar (opsional) */
  jorong?: string | null;
};

export type MasukanKekurangan = {
  penugasanId: number;
  namaKegiatan: string;
  /** nama petugas, untuk teks permintaan izin susulan */
  namaPetugas?: string | null;
  aturan: AturanIsian;
  satuan: string;
  /** status periode aktif/tenggang dan SPJ belum dikunci; selain itu tidak ada pengingat */
  aktif: boolean;
  hariKerja: string[];
  isian: Record<string, IsianHari>;
  /** izin susulan yang masih berlaku: tanggal -> berlaku_sampai (ISO) */
  izin?: Record<string, string>;
  hariIni: string;
  /** "/sigap/translok/<token>?p=<id>" -- ke halaman kerja; parameter tab/tgl/fokus ditambahkan di sini */
  hrefDasar: string;
  /** sumber laporan otomatis menurut peran (PML = identifikasi, PPL/korwil = pendataan); null = tak ada lembar */
  sumber?: "identifikasi" | "pendataan" | "qc" | "spdt" | null; // (31 Okt 2026) "spdt" = laporan otomatis dari "sudah buka lembar" SPDT NTP (lib/realisasiOtomatis.ts)
  hrefLembar?: string | null;
  /** nomor WhatsApp admin anggaran berbentuk 62xxxxxxxxxx; null = tombol WhatsApp tidak ditampilkan */
  waAdmin?: string | null;
};

export const JENDELA_TERLEWAT_HARI = 3;
/** Batas jam (WIB): sebelum jam ini, bila lembar belum punya hasil hari itu, pengingat mengarahkan ke lembar; sesudahnya ke isian laporan. */
export const JAM_SIANG = 15;
/** Sisa waktu (detik) di bawah ini = mendesak. */
export const AMBANG_MENDESAK_DETIK = 7200;

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tglPendekKek(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1]}`;
}
const jamWib = (ms: number) => new Date(ms + 7 * 3_600_000).getUTCHours();
const jamMenitWib = (ms: number) => {
  const d = new Date(ms + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const pad = (n: number) => String(n).padStart(2, "0");
/** "sisa 1 j 14 mnt" / "sisa 12:30" */
export function teksSisaKek(detik: number): string {
  const s = Math.max(0, Math.floor(detik));
  return s < 3600 ? `sisa ${pad(Math.floor(s / 60))}:${pad(s % 60)}` : `sisa ${Math.floor(s / 3600)} j ${pad(Math.floor((s % 3600) / 60))} mnt`;
}

/** Nomor slot 1..jumlah yang belum ada. */
export function slotKurang(ada: number[], jumlah: number): number[] {
  const s = new Set(ada);
  const out: number[] = [];
  for (let i = 1; i <= jumlah; i++) if (!s.has(i)) out.push(i);
  return out;
}

/** [3,4,5] -> "3–5"; [3,5] -> "3, 5"; [5] -> "5". */
export function rentangNomor(n: number[]): string {
  if (n.length === 0) return "";
  const urut = [...n].sort((a, b) => a - b);
  const berurutan = urut.every((x, i) => i === 0 || x === urut[i - 1] + 1);
  return berurutan && urut.length >= 3 ? `${urut[0]}–${urut[urut.length - 1]}` : urut.join(", ");
}

const KOSONG: IsianHari = { laporan: false, slot: [] };

/** Bagian yang kurang pada satu hari menurut aturan kegiatan (dengan laporan dianggap dihitung selesai). */
export function bagianKurang(i: IsianHari | undefined, aturan: AturanIsian): { laporan: boolean; foto: number[]; fotoN: number } {
  const x = i ?? KOSONG;
  const laporan = aturan.wajib_laporan && !(x.laporan || x.dianggap);
  const kurangN = Math.max(0, aturan.jumlah_foto - x.slot.length);
  const foto = kurangN > 0 ? slotKurang(x.slot, aturan.jumlah_foto).slice(0, kurangN) : [];
  return { laporan, foto, fotoN: kurangN };
}

/** Hari lengkap menurut penilai bersama (lib/sigap.ts hariDinilai). */
export function hariLengkapDinilai(i: IsianHari | undefined, aturan: AturanIsian): boolean {
  const x = i ?? KOSONG;
  return hariDinilai(x.laporan, !!x.dianggap, x.slot.length, aturan);
}

export function ringkasKurang(b: { laporan: boolean; fotoN: number }, aturan: AturanIsian): string {
  const p: string[] = [];
  if (b.laporan) p.push("laporan belum");
  if (b.fotoN > 0) p.push(`foto ${aturan.jumlah_foto - b.fotoN}/${aturan.jumlah_foto}`);
  return p.join(", ");
}

/** 08xxxxxxxxxx / +62xxxxxxxxxx / 62xxxxxxxxxx -> 62xxxxxxxxxx; selain itu null. */
export function normalisasiNomorWa(s: string | null | undefined): string | null {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return null;
  const n = d.startsWith("62") ? d : d.startsWith("0") ? `62${d.slice(1)}` : d.startsWith("8") ? `62${d}` : "";
  return n.length >= 10 && n.length <= 15 ? n : null;
}

/** Tautan WhatsApp ke admin dengan teks permintaan izin susulan yang sudah terisi. */
export function tautanWaIzinSusulan(nomor: string, o: { namaPetugas?: string | null; namaKegiatan: string; tanggal: string; kurang: string }): string {
  const teks = `Mohon izin susulan isian ${o.namaKegiatan} tanggal ${tglPendekKek(o.tanggal)}${o.kurang ? ` (kekurangan: ${o.kurang})` : ""}.${o.namaPetugas ? ` Terima kasih. ${o.namaPetugas}` : " Terima kasih."}`;
  return `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}`;
}

function selisihHari(dari: string, ke: string): number {
  return Math.round((Date.parse(`${ke}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000);
}

/** Daftar kekurangan terurut (skor tertinggi dulu). Kosong = tidak ada yang perlu diingatkan. */
export function susunKekurangan(m: MasukanKekurangan, nowMs: number): Kekurangan[] {
  const out: Kekurangan[] = [];
  if (!m.aktif) return out;
  const { aturan, hariIni, hariKerja } = m;
  const akhirHari = Date.parse(`${hariIni}T23:59:00+07:00`);
  const sisa = (akhirHari - nowMs) / 1000;
  const mendesak = sisa < AMBANG_MENDESAK_DETIK;
  const url = (q: string) => `${m.hrefDasar}${m.hrefDasar.includes("?") ? "&" : "?"}${q}`;
  const lembar = m.sumber === "identifikasi" ? "Lembar Identifikasi SLS" : m.sumber === "qc" ? "Lembar Quality Check" : "Lembar Pendataan"; // (27 Okt 2026) korwil = Lembar Quality Check
  const izin = m.izin ?? {};

  // --- 1. Perbaikan administrasi: hari lampau yang masih punya izin susulan (jendela 24 jam) dan belum lengkap.
  // (15 Okt 2026) Semua hari itu digabung jadi SATU kekurangan "Perbaiki administrasi" (modal + menu perbaikan), bukan satu per hari.
  const hariPerbaikan: HariPerbaikan[] = [];
  for (const t of hariKerja) {
    const sampai = izin[t];
    if (!sampai || t >= hariIni) continue;
    if (!((Date.parse(sampai) - nowMs) / 1000 > 0)) continue;
    const b = bagianKurang(m.isian[t], aturan);
    if (!b.laporan && b.fotoN === 0) continue;
    hariPerbaikan.push({ tanggal: t, laporan: b.laporan, foto: aturan.jumlah_foto - b.fotoN, fotoTotal: aturan.jumlah_foto, sampai: new Date(Date.parse(sampai)).toISOString() });
  }
  if (hariPerbaikan.length > 0) {
    const terdekat = hariPerbaikan.reduce((a, h) => (Date.parse(h.sampai) < Date.parse(a) ? h.sampai : a), hariPerbaikan[0].sampai);
    const mend = (Date.parse(terdekat) - nowMs) / 1000 < AMBANG_MENDESAK_DETIK;
    const n = hariPerbaikan.length;
    const wib = new Date(Date.parse(terdekat) + 7 * 3_600_000).toISOString().slice(0, 10);
    out.push({
      kode: `perbaikan:${m.penugasanId}:${hariPerbaikan.map((h) => `${h.tanggal}${h.laporan ? "L" : ""}${h.foto}`).join(",")}`,
      jenis: "perbaikan",
      tanggal: null,
      skor: mend ? 91 : 78,
      nada: mend ? "merah" : "emas",
      label: "PERBAIKI ADMINISTRASI",
      judul: `Perbaiki administrasi (${n} hari)`,
      ringkas: `Perbaiki ${n} hari`,
      uraian: `${hariPerbaikan.map((h) => tglPendekKek(h.tanggal)).join(", ")} belum lengkap. Kesempatan hanya sekali, berlaku sampai ${tglPendekKek(wib)} ${jamMenitWib(Date.parse(terdekat))} WIB.`,
      batas: terdekat,
      progres: undefined,
      aksi: "Lengkapi administrasi",
      href: alamatMenuPerbaikan(m.penugasanId),
      penugasanId: m.penugasanId,
      hari: hariPerbaikan,
      hrefKerja: m.hrefDasar,
      lewatKk: m.sumber === "pendataan" && !!m.hrefLembar,
    });
  }

  // --- 2. Hari ini (hari kerja, belum lengkap)
  if (hariKerja.includes(hariIni)) {
    const isi = m.isian[hariIni] ?? KOSONG;
    const b = bagianKurang(isi, aturan);
    const dasar = mendesak ? 88 : 72;
    const label = mendesak ? "SEGERA" : "TUGAS HARI INI";
    const nada: NadaKekurangan = mendesak ? "merah" : "emas";
    const batas = new Date(akhirHari).toISOString();
    const nFoto = aturan.jumlah_foto - b.fotoN;
    const nCadangan = isi.cadangan ?? 0;
    const adaHasil = (isi.hasilLembar ?? 0) > 0;
    // (15 Okt 2026) PML tidak lagi diarahkan ke Lembar Identifikasi: pekerjaannya beralih ke pengawasan, laporannya diisi manual (jumlah KK diawasi).
    const bisaLembar = !!m.sumber && m.sumber !== "identifikasi" && !!m.hrefLembar;
    const ket = (s: string) => `${s}${mendesak ? " Batas 23.59 WIB; sesudahnya hari ini tidak masuk Kwitansi." : " Batas 23.59 WIB."}`;

    if (b.laporan) {
      if (adaHasil) {
        out.push({
          kode: `laporan:${m.penugasanId}:${hariIni}:hasil${isi.hasilLembar}`,
          jenis: "laporan",
          tanggal: hariIni,
          skor: dasar + 3,
          nada,
          label,
          judul: "Laporan hari ini belum disimpan",
          ringkas: "Laporan belum",
          uraian: ket(`${lembar} mencatat ${isi.hasilLembar} ${m.satuan}${isi.jorong ? ` di ${isi.jorong}` : ""}. Angkanya sudah terisi otomatis di formulir laporan; periksa lalu simpan.`),
          batas,
          aksi: "Periksa & simpan laporan",
          href: url("tab=hari_ini&fokus=laporan"),
        });
      } else if (bisaLembar && jamWib(nowMs) < JAM_SIANG) {
        out.push({
          kode: `lembar:${m.penugasanId}:${hariIni}`,
          jenis: "lembar",
          tanggal: hariIni,
          skor: dasar + 3,
          nada,
          label,
          judul: `Belum ada hasil di ${lembar} hari ini`,
          ringkas: "Lembar belum ada hasil",
          uraian: ket(`Laporan diambil dari hasil ${lembar}. Buka formulir laporan; bila hasilnya masih kosong, Anda diarahkan ke ${lembar} untuk melengkapinya.`),
          batas,
          // (15 Okt 2026) Tombol utama = formulir laporan (sesuai judul langkah "Laporan & foto harian"); Lembar menjadi tombol kedua dan juga ditawarkan di dalam formulir.
          aksi: "Isi laporan",
          href: url("tab=hari_ini&fokus=laporan"),
          sekunder: { teks: `Buka ${lembar}`, href: m.hrefLembar! },
        });
      } else {
        out.push({
          kode: `laporan:${m.penugasanId}:${hariIni}:manual`,
          jenis: "laporan",
          tanggal: hariIni,
          skor: dasar,
          nada,
          label,
          judul: "Laporan hari ini belum diisi",
          ringkas: "Laporan belum",
          uraian: ket(`Isi lokasi dan jumlah ${m.satuan}, lalu simpan.${bisaLembar ? ` Belum ada hasil di ${lembar} hari ini.` : ""}`),
          batas,
          aksi: "Isi laporan",
          href: url("tab=hari_ini&fokus=laporan"),
          sekunder: bisaLembar ? { teks: `Buka ${lembar}`, href: m.hrefLembar! } : undefined,
        });
      }
    }
    if (b.fotoN > 0) {
      const semua = b.fotoN === aturan.jumlah_foto;
      // (21 Okt 2026) Foto Kamera SIGAP sudah terkirim tetapi tidak menempati nomor (dipilih ganda/tanpa nomor): arahkan ke panel "Nomor foto"
      // untuk MEMASANG, bukan menyuruh memotret/mengunggah lagi.
      const rapikan = nCadangan > 0;
      out.push({
        kode: `foto:${m.penugasanId}:${hariIni}:${b.foto.join("")}${rapikan ? `:c${nCadangan}` : ""}`,
        jenis: "foto",
        tanggal: hariIni,
        skor: dasar + 2,
        nada,
        label,
        judul: rapikan
          ? `Nomor ${rentangNomor(b.foto)} masih kosong, ada ${nCadangan} foto belum terpakai`
          : semua ? `Unggah ${aturan.jumlah_foto} foto dokumentasi` : b.fotoN === 1 ? `Tinggal 1 foto lagi (nomor ${b.foto[0]})` : `Foto kurang ${b.fotoN}: nomor ${b.foto.join(", ")}`,
        ringkas: rapikan ? `${nCadangan} foto belum bernomor` : "Foto belum lengkap", // (26 Okt 2026, B7) tidak mengulang judul ("Tinggal 1 foto lagi (nomor 5)" / "Foto kurang 3: nomor 3, 4, 5")
        uraian: ket(
          rapikan
            ? `Foto baru tercatat ${nFoto} dari ${aturan.jumlah_foto} nomor, padahal ${nCadangan} foto Kamera SIGAP sudah terkirim tetapi belum menempati nomor. Buka bagian foto, lalu pasang ke nomor yang kosong.${aturan.wajib_laporan && !b.laporan ? " Laporan sudah tersimpan." : ""}`
            : `${semua ? "Belum ada foto hari ini." : `Foto baru ${nFoto} dari ${aturan.jumlah_foto}.`}${aturan.wajib_laporan && !b.laporan ? " Laporan sudah tersimpan." : ""} Boleh satu per satu.`
        ),
        batas,
        progres: { selesai: nFoto, total: aturan.jumlah_foto },
        aksi: rapikan ? "Rapikan nomor foto" : `Unggah foto ${rentangNomor(b.foto)}`,
        href: url("tab=hari_ini&fokus=foto"),
      });
    }
  }

  // --- 3. Belum memilih hari kerja
  if (hariKerja.length === 0) {
    out.push({
      kode: `hari_kerja:${m.penugasanId}`,
      jenis: "hari_kerja",
      tanggal: null,
      skor: 65,
      nada: "emas",
      label: "PERSIAPAN",
      judul: "Pilih hari kerja",
      ringkas: "Pilih hari kerja",
      uraian: `Belum ada hari kerja dipilih. Laporan dan foto hanya bisa diisi pada hari kerja ${m.namaKegiatan}.`,
      batas: null,
      aksi: "Pilih hari kerja",
      href: url("tab=hari_kerja"),
    });
  }

  // --- 4. Hari lampau tidak lengkap (tanpa izin), dalam jendela terakhir saja
  const terlewat = hariKerja.filter((t) => {
    if (t >= hariIni) return false;
    if (izin[t] && Date.parse(izin[t]) > nowMs) return false; // sudah ditangani butir 1
    return !hariLengkapDinilai(m.isian[t], aturan);
  });
  const baru = terlewat.filter((t) => selisihHari(t, hariIni) <= JENDELA_TERLEWAT_HARI);
  if (baru.length > 0) {
    const t = baru[baru.length - 1];
    const b = bagianKurang(m.isian[t], aturan);
    const kurang = ringkasKurang(b, aturan);
    out.push({
      kode: `hari_terlewat:${m.penugasanId}:${t}:${b.laporan ? "L" : ""}${b.foto.join("")}`,
      jenis: "hari_terlewat",
      tanggal: t,
      skor: 60,
      nada: "emas",
      label: "PERLU TINDAKAN",
      judul: `${tglPendekKek(t)} belum lengkap (${kurang})`,
      ringkas: `${tglPendekKek(t)} terlewat`,
      uraian: `Isian tanggal ini sudah tutup. Minta izin susulan ke admin bila perlu.${baru.length > 1 ? ` Ada ${baru.length} hari terlewat.` : ""}`,
      batas: null,
      lencana: { teks: "terlewat", nada: "emas" },
      aksi: `Lihat hari ${tglPendekKek(t)}`,
      href: url(`tab=hari_kerja&tgl=${t}`),
      sekunder: m.waAdmin
        ? { teks: "Minta izin susulan ke admin", href: tautanWaIzinSusulan(m.waAdmin, { namaPetugas: m.namaPetugas, namaKegiatan: m.namaKegiatan, tanggal: t, kurang }), luar: true }
        : undefined,
    });
  }

  return out.map((x, i) => ({ x, i })).sort((a, b) => b.x.skor - a.x.skor || a.i - b.i).map((v) => v.x);
}

/** Jumlah hari lampau tidak lengkap tanpa izin aktif (semua, termasuk di luar jendela), untuk teks langkah. */
export function hitungTerlewat(m: Pick<MasukanKekurangan, "hariKerja" | "isian" | "aturan" | "hariIni" | "izin">, nowMs: number): { semua: number; baru: number; terbaru: string | null } {
  const izin = m.izin ?? {};
  const t = m.hariKerja.filter((x) => x < m.hariIni && !(izin[x] && Date.parse(izin[x]) > nowMs) && !hariLengkapDinilai(m.isian[x], m.aturan));
  const baru = t.filter((x) => selisihHari(x, m.hariIni) <= JENDELA_TERLEWAT_HARI);
  return { semua: t.length, baru: baru.length, terbaru: t.length ? t[t.length - 1] : null };
}
