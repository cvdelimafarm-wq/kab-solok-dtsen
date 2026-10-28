// lib/keu/petaJadwal.ts
//
// (28 Okt 2026) Data untuk "Peta jadwal" (Gantt) identifikasi survei: satu periode, semua tahap, sesi (briefing, pelatihan), dan rapat pada satu garis waktu,
// lengkap dengan penanda Fix/Perkiraan dan daftar benturan jadwal. Fungsi murni (tanpa React); gambarnya ada di app/sigap/kelola/perencanaan/identifikasi/PetaJadwal.tsx.

import { daftarPeriode, hitungJadwal, periodeTurunan, selisihHari, tahapAktif, tambahHari, tanggalRapat, tanggalSesi, type Form } from "./identifikasi";
import { recPerk } from "./waktu";

export type KelompokPeta = "sesi" | "rapat" | "tahap";
export type BarisPeta = { kunci: string; nama: string; kel: KelompokPeta; mulai: string; selesai: string; perk: boolean; ada: boolean };
export type HasilPeta = { baris: BarisPeta[]; awal: string; akhir: string; konflik: string[] };

const MARGIN_HARI = 2;
const MIN_RENTANG_HARI = 14;

export function petaJadwal(f: Form, P: string, tahun: number): HasilPeta {
  const first = daftarPeriode(f)[0];
  const turunan = periodeTurunan(f, P, tahun);
  const jad = hitungJadwal(f, P, tahun);
  const aktif = tahapAktif(f);
  const baris: BarisPeta[] = [];
  const tambah = (kunci: string, nama: string, kel: KelompokPeta, mulai: string, selesai: string, perk: boolean) =>
    baris.push({ kunci, nama, kel, mulai, selesai, perk, ada: !!mulai && !!selesai });
  const sesi = (id: "briefing" | "pelatihan", nama: string) => {
    if (!f.sesi[id].on || f.berbagi) return;
    const t = tanggalSesi(f, id, P, tahun);
    tambah(id, nama, "sesi", t.mulai, t.selesai, recPerk(f.sesi[id].tgl?.[turunan ? first : P]));
  };
  const rapat = (id: "persiapan" | "pelaksanaan" | "evaluasi") => {
    if (id !== "evaluasi" && !f.rapat[id].on) return;
    const t = tanggalRapat(f, id, P, tahun);
    tambah(`rapat-${id}`, `Rapat ${id}`, "rapat", t.mulai, t.selesai, recPerk(f.rapat[id].tgl?.[turunan ? first : P]));
  };
  const tahap = (k: "updating" | "pendataan" | "pengolahan" | "pasca" | "diseminasi", nama: string) => {
    if (!aktif[k]) return;
    const j = jad[k];
    tambah(k, nama, "tahap", j?.mulai ?? "", j?.selesai ?? "", j ? !!j.perk : true);
  };
  sesi("briefing", "Briefing");
  sesi("pelatihan", "Pelatihan");
  rapat("persiapan");
  tahap("updating", "Updating");
  tahap("pendataan", "Pendataan");
  rapat("pelaksanaan");
  tahap("pengolahan", "Pengolahan");
  tahap("pasca", "Pasca pengolahan");
  rapat("evaluasi");
  tahap("diseminasi", "Diseminasi");

  const ada = baris.filter((b) => b.ada);
  let awal = ""; let akhir = "";
  if (ada.length) {
    awal = ada.reduce((m, b) => (b.mulai < m ? b.mulai : m), ada[0].mulai);
    akhir = ada.reduce((m, b) => (b.selesai > m ? b.selesai : m), ada[0].selesai);
    awal = tambahHari(awal, -MARGIN_HARI);
    akhir = tambahHari(akhir, MARGIN_HARI);
    if (selisihHari(akhir, awal) < MIN_RENTANG_HARI) akhir = tambahHari(awal, MIN_RENTANG_HARI);
  }

  const konflik: string[] = [];
  const by = (k: string) => baris.find((b) => b.kunci === k && b.ada);
  for (const b of ada) if (b.selesai < b.mulai) konflik.push(`${b.nama}: tanggal selesai sebelum tanggal mulai.`);
  const lapangan = by("updating") ?? by("pendataan");
  const pend = by("pendataan");
  for (const id of ["pelatihan", "briefing"] as const) {
    const s = by(id);
    if (s && lapangan && lapangan.mulai < s.selesai) konflik.push(`${s.nama} beririsan dengan ${lapangan.nama.toLowerCase()}.`);
  }
  const rp = by("rapat-persiapan");
  if (rp && pend && rp.mulai > pend.mulai) konflik.push("Rapat persiapan dijadwalkan setelah pendataan dimulai.");
  const re = by("rapat-evaluasi");
  if (re && pend && re.mulai < pend.selesai) konflik.push("Rapat evaluasi dijadwalkan sebelum pendataan selesai.");
  return { baris, awal, akhir, konflik };
}

/** Letak batang pada sumbu waktu awal..akhir, dalam persen (lebar minimal supaya satu hari tetap terlihat). */
export function posisiBar(awal: string, akhir: string, mulai: string, selesai: string): { kiri: number; lebar: number } {
  const total = Math.max(1, selisihHari(akhir, awal) + 1);
  const kiriHari = Math.max(0, selisihHari(mulai, awal));
  const hari = Math.max(1, selisihHari(selesai, mulai) + 1);
  const lebar = Math.min(100, Math.max(1.6, (hari / total) * 100));
  const kiri = Math.min(100 - lebar, (kiriHari / total) * 100);
  return { kiri: +kiri.toFixed(3), lebar: +lebar.toFixed(3) };
}

const NAMA_BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Penanda awal bulan pada sumbu: tanggal, letak (%), dan nama bulan (tahun ditambahkan pada Januari dan penanda pertama). */
export function tandaBulan(awal: string, akhir: string): { tgl: string; kiri: number; nama: string }[] {
  if (!awal || !akhir) return [];
  const total = Math.max(1, selisihHari(akhir, awal) + 1);
  const out: { tgl: string; kiri: number; nama: string }[] = [];
  const d = new Date(`${awal}T00:00:00Z`);
  let y = d.getUTCFullYear(); let m = d.getUTCMonth();
  for (let i = 0; i < 40; i++) {
    const tgl = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (tgl > akhir) break;
    if (tgl >= awal) out.push({ tgl, kiri: +((selisihHari(tgl, awal) / total) * 100).toFixed(3), nama: `${NAMA_BLN[m]}${m === 0 || out.length === 0 ? ` ${y}` : ""}` });
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

/** Penanda hari Senin pada sumbu (garis minggu); kosong bila rentang terlalu panjang (> 120 hari) agar tidak padat. */
export function tandaMinggu(awal: string, akhir: string): number[] {
  if (!awal || !akhir) return [];
  const total = selisihHari(akhir, awal) + 1;
  if (total > 120) return [];
  const out: number[] = [];
  for (let i = 0; i < total; i++) {
    const t = tambahHari(awal, i);
    if (new Date(`${t}T00:00:00Z`).getUTCDay() === 1) out.push(+((i / total) * 100).toFixed(3));
  }
  return out;
}
