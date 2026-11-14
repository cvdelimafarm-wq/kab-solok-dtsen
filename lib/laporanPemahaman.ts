// lib/laporanPemahaman.ts  (murni, tanpa basis data dan tanpa React)
//
// (14 Nov 2026) Templat monitoring pemahaman, Laporan (K6): ringkasan otomatis, lembar Excel, dan halaman cetak (PDF lewat "Simpan sebagai PDF")
// disusun dari HasilPemahamanTes yang sama dengan mode Hari H dan Evaluasi (satu sumber hitung). Tidak ada hitungan baru di sini.
// Cetak: kepala tabel berulang di tiap halaman (thead), baris tidak terbelah, nomor halaman di kaki (@page).

import type { HasilPemahamanTes } from "@/lib/pemahamanTes";

export type KonteksLaporan = { kegiatan: string; tes: string; cakupan: string; dibuat: Date };

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : String(Math.round(n * 10) / 10).replace(".", ","));
const persen = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

export function tanggalJamWib(d: Date): string {
  const f = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${f.format(d).replace(/\./g, ".")} WIB`;
}

/** Ringkasan otomatis dalam kalimat (tanpa nama orang). */
export function ringkasanOtomatis(p: HasilPemahamanTes): string[] {
  const r = p.ringkas;
  const out: string[] = [];
  out.push(`${r.selesai} dari ${r.peserta} peserta (${persen(r.selesai, r.peserta)}) sudah menyelesaikan tes; ${r.belum} belum mulai${r.terlewat ? `, ${r.terlewat} kehabisan waktu` : ""}${r.mengerjakan ? `, ${r.mengerjakan} masih mengerjakan` : ""}.`);
  if (r.selesai > 0) out.push(`Rata-rata nilai percobaan pertama ${fmt(r.rata)}. ${r.lulus} peserta lulus (batas ${p.nilai_lulus}) dan ${r.belum_lulus} belum lulus.`);
  const naik = p.orang.filter((o) => o.naik !== null);
  if (p.ada_pembanding && naik.length) {
    const rata = naik.reduce((a, o) => a + (o.naik ?? 0), 0) / naik.length;
    out.push(`Dibanding pretest, nilai ${naik.length} peserta berubah rata-rata ${rata >= 0 ? "+" : ""}${fmt(rata)} poin; ${naik.filter((o) => (o.naik ?? 0) < 0).length} peserta turun.`);
  }
  const salah = [...p.soal].filter((s) => s.salah > 0).sort((a, b) => b.salah - a.salah).slice(0, 3);
  if (salah.length) out.push(`Soal paling banyak salah: ${salah.map((s) => `nomor ${s.nomor} (${s.pct_benar ?? "–"}% benar)`).join(", ")}.`);
  const periksa = p.soal.filter((s) => s.perlu_diperiksa);
  if (periksa.length) out.push(`${periksa.length} soal perlu diperiksa karena pilihan keliru dipilih lebih banyak daripada kunci: nomor ${periksa.map((s) => s.nomor).join(", ")}.`);
  if (p.topik.length) out.push(`Topik terlemah: ${p.topik[0].topik} (${p.topik[0].pct_benar ?? "–"}% benar).`);
  if (p.perlu_diingatkan.length) out.push(`${p.perlu_diingatkan.length} peserta perlu diingatkan.`);
  return out;
}

/** Lembar Excel (array of arrays per lembar). */
export function lembarExcel(p: HasilPemahamanTes, k: KonteksLaporan): { nama: string; baris: (string | number | null)[][]; lebar: number[] }[] {
  const r = p.ringkas;
  return [
    {
      nama: "Ringkasan",
      lebar: [34, 60],
      baris: [
        ["Laporan pemahaman", `${k.kegiatan} · ${k.tes}`],
        ["Cakupan", k.cakupan],
        ["Dibuat", tanggalJamWib(k.dibuat)],
        [],
        ["Peserta", r.peserta],
        ["Selesai", r.selesai],
        ["Belum mulai", r.belum],
        ["Kehabisan waktu", r.terlewat],
        ["Lulus", r.lulus],
        ["Belum lulus", r.belum_lulus],
        ["Rata-rata nilai pertama", r.rata],
        ["Batas lulus", p.nilai_lulus],
        [],
        ["Ringkasan"],
        ...ringkasanOtomatis(p).map((t) => ["", t]),
        [],
        ["Definisi"],
        ["", p.definisi.nilai],
        ["", p.definisi.lulus],
        ["", p.definisi.perlu_diperiksa],
      ],
    },
    {
      nama: "Nilai peserta",
      lebar: [30, 22, 7, 14, 10, 10, 10, 11, 10],
      baris: [
        ["Nama", "Tim", "Kelas", "Status", "Nilai pertama", "Terbaik", "Percobaan", ...(p.ada_pembanding ? ["Pretest", "Naik"] : []), "Lulus"],
        ...p.orang.map((o) => [o.nama, o.tim ?? "", o.kelas ?? "", o.status === "selesai" ? "Selesai" : o.status === "mengerjakan" ? "Mengerjakan" : o.status === "terlewat" ? "Waktu habis" : "Belum mulai", o.nilai, o.terbaik, o.percobaan, ...(p.ada_pembanding ? [o.pembanding, o.naik] : []), o.status === "selesai" ? (o.lulus ? "Ya" : "Tidak") : ""]),
      ],
    },
    {
      nama: "Soal",
      lebar: [6, 60, 16, 7, 9, 9, 9, 14, 14],
      baris: [
        ["No", "Soal", "Topik", "Kunci", "Menjawab", "Benar", "% benar", "Keliru terbanyak", "Perlu diperiksa"],
        ...p.soal.map((s) => [s.nomor, s.teks, s.topik ?? "", s.kunci, s.menjawab, s.benar, s.pct_benar, s.keliru_terbanyak ? `${s.keliru_terbanyak.kode} (${s.keliru_terbanyak.jumlah})` : "", s.perlu_diperiksa ? "Ya" : ""]),
      ],
    },
    {
      nama: "Perlu diingatkan",
      lebar: [30, 46, 46],
      baris: [["Nama", "Keadaan", "Saran"], ...p.perlu_diingatkan.map((x) => [x.nama, x.keadaan, x.saran])],
    },
  ];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function tabelHtml(kepala: string[], baris: (string | number | null)[][], kananMulai = 99): string {
  return `<table><thead><tr>${kepala.map((h, i) => `<th${i >= kananMulai ? ' class="k"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${baris
    .map((b) => `<tr>${b.map((v, i) => `<td${i >= kananMulai ? ' class="k"' : ""}>${esc(typeof v === "number" ? fmt(v) : (v ?? ""))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/** Halaman cetak lengkap (dibuka di jendela baru lalu window.print). */
export function htmlLaporan(p: HasilPemahamanTes, k: KonteksLaporan): string {
  const maks = Math.max(1, ...p.sebaran.map((s) => s.jumlah));
  const warna: Record<string, string> = { ok: "#13794B", wait: "#B7791F", bad: "#B42329", mut: "#8794A8" };
  const lembar = lembarExcel(p, k);
  const nilai = lembar[1];
  const soalSalah = [...p.soal].filter((s) => s.salah > 0 || s.perlu_diperiksa).sort((a, b) => b.salah - a.salah);
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${esc(`Laporan pemahaman · ${k.kegiatan} · ${k.tes}`)}</title>
<style>
@page { size: A4; margin: 14mm 12mm 16mm; @bottom-center { content: "Halaman " counter(page) " dari " counter(pages); font: 9pt sans-serif; color: #55657D; } }
body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #1B2B4B; font-size: 10.5pt; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 2pt; color: #0F2A52; } h2 { font-size: 12pt; margin: 14pt 0 5pt; color: #0F2A52; break-after: avoid; }
.sub { color: #55657D; font-size: 9.5pt; margin-bottom: 8pt; }
.kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; break-inside: avoid; }
.kpi div { border: 1px solid #DDE6F3; border-radius: 6pt; padding: 5pt 7pt; } .kpi b { display: block; font-size: 15pt; color: #0F2A52; } .kpi span { font-size: 8.5pt; color: #55657D; text-transform: uppercase; }
ul { margin: 4pt 0 0 14pt; padding: 0; } li { margin: 2pt 0; }
.bar { display: flex; align-items: center; gap: 6pt; font-size: 9.5pt; margin: 2pt 0; break-inside: avoid; } .bar i { display: block; height: 9pt; border-radius: 2pt; } .bar .t { width: 70pt; } .bar .w { flex: 1; background: #EEF2F7; border-radius: 2pt; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; } thead { display: table-header-group; } tr { break-inside: avoid; }
th { background: #F3F6FB; text-align: left; border-bottom: 1px solid #C9D5E6; padding: 3pt 4pt; } td { border-bottom: 1px solid #EEF2F7; padding: 3pt 4pt; vertical-align: top; } .k { text-align: right; }
.cat { font-size: 8.5pt; color: #55657D; margin-top: 10pt; }
</style></head><body>
<h1>Laporan pemahaman · ${esc(k.tes)}</h1>
<div class="sub">${esc(k.kegiatan)} · ${esc(k.cakupan)} · dibuat ${esc(tanggalJamWib(k.dibuat))}</div>
<div class="kpi"><div><span>Selesai</span><b>${p.ringkas.selesai}/${p.ringkas.peserta}</b></div><div><span>Lulus (batas ${p.nilai_lulus})</span><b>${p.ringkas.lulus}</b></div><div><span>Rata-rata nilai</span><b>${fmt(p.ringkas.rata)}</b></div><div><span>Perlu diingatkan</span><b>${p.perlu_diingatkan.length}</b></div></div>
<h2>Ringkasan</h2><ul>${ringkasanOtomatis(p).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
<h2>Sebaran nilai</h2>${p.sebaran.map((s) => `<div class="bar"><span class="t">${esc(s.label)}</span><span class="w"><i style="width:${(s.jumlah / maks) * 100}%;background:${warna[s.nada]}"></i></span><b>${s.jumlah}</b></div>`).join("")}
<h2>Nilai per peserta</h2>${tabelHtml(nilai.baris[0] as string[], nilai.baris.slice(1), 4)}
<h2>Perlu diingatkan</h2>${p.perlu_diingatkan.length ? tabelHtml(["Nama", "Keadaan", "Saran"], p.perlu_diingatkan.map((x) => [x.nama, x.keadaan, x.saran])) : "<p>Tidak ada.</p>"}
<h2>Catatan soal</h2>${soalSalah.length ? tabelHtml(["No", "Soal", "% benar", "Kunci", "Keliru terbanyak", "Catatan"], soalSalah.map((s) => [s.nomor, s.teks, s.pct_benar, s.kunci, s.keliru_terbanyak ? `${s.keliru_terbanyak.kode} (${s.keliru_terbanyak.jumlah})` : "", s.perlu_diperiksa ? "Perlu diperiksa" : ""])) : "<p>Tidak ada soal yang salah.</p>"}
<p class="cat">${esc(p.definisi.nilai)} ${esc(p.definisi.lulus)} Sumber: SIGAP, monitoring pemahaman (satu sumber hitung).</p>
</body></html>`;
}
