// lib/vanguard/engine.ts  (murni: tanpa DOM, DB, atau React)
//
// (1 Nov 2026) VANGUARD V1: engine perhitungan dan penilaian, dipindahkan APA ADANYA dari prototipe simulasi_v3_referensi.html (compute, evaluate,
// engineChecks) menjadi fungsi murni yang sama-sama dipakai browser dan server. Aturan: Buku 4 (konversi seminggu x 30/7 x 12, toleransi Rp1 per kotak).
// Tambahan V1 (tidak ada di prototipe): jenis dan tingkat kesalahan untuk dasbor (keputusan Iqbal 1 Nov: fatal menurut jenis kesalahan) dan hitungBintang.
// Kesetaraan dengan prototipe diuji dengan tes diferensial (vanguardEngine.test.ts + skrip uji prototipe di catatan V1).

import { AR, BR, D_ROWS, E_ROWS, F_ROWS, G_MAIN, G_SUB, idSelKasus, labelSel } from "./sel";
import type { BarisNilai, HasilEvaluasi, HasilHitung, JenisKesalahan, Kasus, Koreksi, Kontrol, Nilai, PeriksaEngine, Tingkat } from "./tipe";

export const F = (30 / 7) * 12; // pengali seminggu -> setahun
export const R = Math.round;
export const TOLERANSI = 1; // rupiah per kotak

export const fmt = (n: number): string => String(Math.abs(R(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const rp = (n: number): string => (n < 0 ? "-" : "") + "Rp" + fmt(n);

/** Engine perhitungan Blok V -> VI -> VII + tabel kontrol (Buku 4 hlm. 343 dan 347). Sel kosong = 0. */
export function compute(v: Nilai): HasilHitung {
  const n = (id: string): number => v[id] || 0;
  const co: Record<string, number> = {};
  let aU = 0, aB = 0, aL = 0;
  for (let i = 1; i <= AR; i++) { aU += n(`a${i}_uang`); aB += n(`a${i}_barang`); aL += n(`a${i}_lembur`); }
  co.sumA_u = aU; co.sumA_b = aB; co.sumA_l = aL;
  let bP = 0, bC = 0, bS = 0;
  for (let i = 1; i <= BR; i++) { const p = n(`b${i}_produksi`), c = n(`b${i}_biaya`); co[`b${i}_s`] = p - c; bP += p; bC += c; bS += p - c; }
  co.sumB_p = bP; co.sumB_c = bC; co.sumB_s = bS;
  const cs = n("c_sewaRumah_produksi"); co.c_sewaRumah_s = cs;
  const ch = n("c_hasilLain_produksi") - n("c_hasilLain_biaya"); co.c_hasilLain_s = ch;
  const cP = cs + n("c_hasilLain_produksi"), cC = n("c_hasilLain_biaya"), cS = cs + ch;
  co.sumC_p = cP; co.sumC_c = cC; co.sumC_s = cS;
  let dT = 0, dB = 0;
  D_ROWS.forEach(([k]) => { dT += n(`d_${k}_diterima`); dB += n(`d_${k}_dibayar`); });
  co.sumD_t = dT; co.sumD_b = dB;
  // E
  const pU = n("e_pensiun_uang");
  const pem = { uD: pU + n("e_bantuan_uangD"), bD: n("e_bantuan_barangD"), uB: n("e_bantuan_uangB"), bB: n("e_bantuan_barangB") };
  co.e_pem_uD = pem.uD; co.e_pem_bD = pem.bD; co.e_pem_uB = pem.uB; co.e_pem_bB = pem.bB;
  let eUD = pem.uD, eBD = pem.bD, eUB = pem.uB, eBB = pem.bB;
  E_ROWS.forEach(([k]) => { eUD += n(`e_${k}_uangD`); eBD += n(`e_${k}_barangD`); eUB += n(`e_${k}_uangB`); eBB += n(`e_${k}_barangB`); });
  co.sumE_uD = eUD; co.sumE_bD = eBD; co.sumE_uB = eUB; co.sumE_bB = eBB;
  // F
  let fBD = 0, fLD = 0, fBB = 0, fLB = 0;
  F_ROWS.forEach(([k]) => { fBD += n(`f_${k}_bangunanD`); fLD += n(`f_${k}_lahanD`); fBB += n(`f_${k}_bangunanB`); fLB += n(`f_${k}_lahanB`); });
  co.sumF_bD = fBD; co.sumF_lD = fLD; co.sumF_bB = fBB; co.sumF_lB = fLB;
  // G
  let gt = 0, gk = 0;
  G_SUB.forEach(([k]) => { const t = n(`g_${k}_tambah`), q = n(`g_${k}_kurang`); co[`g_${k}_n`] = t - q; gt += t; gk += q; });
  co.g_aset_t = gt; co.g_aset_k = gk; co.g_aset_n = gt - gk;
  let GT = gt, GK = gk;
  G_MAIN.forEach(([k]) => { const t = n(`g_${k}_tambah`), q = n(`g_${k}_kurang`); co[`g_${k}_n`] = t - q; GT += t; GK += q; });
  co.sumG_t = GT; co.sumG_k = GK; co.sumG_n = GT - GK;
  // VI
  const p = [aU + aB + aL, bS, cS, dT, eUD + eBD, fBD + fLD];
  p.forEach((x, i) => { co[`vi_p${i + 1}`] = x; });
  const pt = p.reduce((a, b) => a + b, 0); co.vi_pt = pt;
  const g1 = n("vi_g1"), g = [g1, dB, eUB + eBB, fBB + fLB, GT - GK];
  g.slice(1).forEach((x, i) => { co[`vi_g${i + 2}`] = x; });
  const gtt = g.reduce((a, b) => a + b, 0); co.vi_gt = gtt;
  const selVI = pt - gtt; co.vi_sel = selVI;
  // VII (isian manual)
  const rv = [2, 3, 4, 5].map((i) => n(`vii_p${i}`)), pay = [2, 3, 4, 5].map((i) => n(`vii_g${i}`));
  const r1k2v = n("vii_p1"), r1k4v = n("vii_g1");
  co.vii_pt = r1k2v + rv.reduce((a, b) => a + b, 0); co.vii_gt = r1k4v + pay.reduce((a, b) => a + b, 0);
  const selVII = co.vii_gt - co.vii_pt; co.vii_sel = selVII;
  const disk = selVI - selVII; co.disk = disk;
  // Tabel kontrol
  const [, recv3, recv4, recv5] = rv, recv2 = rv[0];
  const [pay2, pay3, pay4, pay5] = pay;
  const sum = (a: [string, number][]) => a.reduce((x, y) => x + y[1], 0);
  const ctl = {} as Kontrol;
  ctl.e = [
    ["Konsumsi", g1],
    ["Biaya produksi (V.B K.6 + V.C K.3)", bC + cC],
    ["Transfer berjalan dibayar (V.E K.4+K.5)", eUB + eBB],
    ["Pendapatan kepemilikan dibayar", dB],
    ["Penambahan aset (V.G K.2)", GT],
    ["Transaksi keuangan keluar (VII K.4 R.2–5)", pay2 + pay3 + pay4 + pay5],
  ];
  ctl.e1 = sum(ctl.e);
  ctl.e2a = [
    ["Upah/gaji barang (V.A K.6)", aB],
    ["Produksi dikonsumsi sendiri (V.C K.2)", cP],
    ["Transfer berjalan diterima barang/jasa (V.E K.3)", eBD],
    ["Transfer modal diterima (V.F K.2+K.3)", fBD + fLD],
    ["Pembelian barang kredit (VII R.4 K.2)", recv4],
  ];
  ctl.e2 = sum(ctl.e2a);
  ctl.h = [
    ["Upah/gaji uang + lembur (V.A K.5+K.7)", aU + aL],
    ["Nilai produksi usaha (V.B K.5)", bP],
    ["Transfer berjalan diterima uang (V.E K.2)", eUD],
    ["Pendapatan kepemilikan diterima", dT],
    ["Pengurangan aset (V.G K.3)", GK],
    ["Transaksi keuangan diterima (VII K.2 R.2,3,5)", recv2 + recv3 + recv5],
  ];
  ctl.h1 = sum(ctl.h);
  ctl.h2 = fBB + fLB;
  ctl.r1k2 = ctl.e1 - ctl.e2; ctl.r1k4 = ctl.h1 - ctl.h2;
  ctl.bK2 = ctl.r1k2 - bC; ctl.bK4 = ctl.r1k4 - bC; // cara contoh Buku 4 (surplus V.B, tanpa biaya V.B di K.2)
  return { co, ctl, vals: { selVI, selVII, disk, r1k2: r1k2v, r1k4: r1k4v } };
}

// ---------------------------------------------------------------------------------------------
// Jenis dan tingkat kesalahan (keputusan Iqbal 1 Nov 2026: fatal menurut JENIS kesalahan)
//   fatal  : mengubah total atau memindahkan nilai ke tempat salah = salah letak, lupa x 30/7 x 12 atau x 12, kotak yang harus kosong terisi
//            (termasuk jebakan khas, yang selalu berupa kotak kosong terisi), diskrepansi Blok VI-VII, kontrol VII Rincian 1 tidak sesuai.
//   berat  : nilai keliru khas (alternatif), kotak wajib belum diisi, angka meleset lebih dari 5% dari nilai benar.
//   ringan : angka meleset sampai 5% dari nilai benar.
// ---------------------------------------------------------------------------------------------
export const BATAS_RINGAN = 0.05;

export function tingkatKesalahan(jenis: JenisKesalahan, e = 0, u = 0): Tingkat {
  switch (jenis) {
    case "konversi_seminggu":
    case "konversi_sebulan":
    case "salah_letak":
    case "harus_kosong":
    case "jebakan":
    case "kontrol_vii":
    case "diskrepansi":
      return "fatal";
    case "alternatif":
    case "belum_diisi":
      return "berat";
    case "angka_meleset":
      return e !== 0 && Math.abs(u - e) / Math.abs(e) <= BATAS_RINGAN ? "ringan" : "berat";
  }
}

/** Menilai isian terhadap kunci kasus: per kotak (toleransi Rp1) dan koreksi otomatis. Padanan evaluate() prototipe + jenis/tingkat. */
export function evaluate(c: Kasus, vals: Nilai): HasilEvaluasi {
  const ids = idSelKasus(c);
  const rows: BarisNilai[] = [];
  const fb: Koreksi[] = [];
  let ok = true;
  ids.forEach((id) => {
    const e = c.kunci[id] || 0, u = vals[id] || 0, good = Math.abs(u - e) <= TOLERANSI;
    if (!good) ok = false;
    rows.push({ k: id, e, u, ok: good });
  });
  rows.filter((r) => !r.ok).forEach((r) => {
    const msgs: string[] = [];
    let jenis: JenisKesalahan = "angka_meleset";
    const tr = c.jebakan.find((t) => t.k === r.k && r.e === 0 && r.u !== 0);
    if (tr) { msgs.push(tr.m); jenis = "jebakan"; }
    const al = c.alternatif.find((a) => a.k === r.k && Math.abs(a.v - r.u) <= TOLERANSI);
    if (al) { msgs.push(al.m); if (!tr) jenis = "alternatif"; }
    if (!msgs.length) {
      if (r.e === 0 && r.u !== 0) { msgs.push("Kotak ini seharusnya kosong."); jenis = "harus_kosong"; }
      else if (r.e !== 0 && r.u === 0) {
        const el = rows.find((o) => o.k !== r.k && o.e === 0 && Math.abs(o.u - r.e) <= TOLERANSI);
        if (el) { msgs.push(`Nilai yang benar ada di kotak lain (${labelSel(el.k)}). Pindahkan ke sini.`); jenis = "salah_letak"; }
        else { msgs.push("Kotak ini belum diisi."); jenis = "belum_diisi"; }
      } else if (r.e !== 0) {
        if (Math.abs(r.u - R(r.e / F)) <= TOLERANSI) { msgs.push("Nilai Anda sepertinya masih nilai seminggu. Kalikan 30/7 × 12."); jenis = "konversi_seminggu"; }
        else if (Math.abs(r.u - R(r.e / 12)) <= TOLERANSI) { msgs.push("Nilai Anda sepertinya masih nilai sebulan. Kalikan 12."); jenis = "konversi_sebulan"; }
        else { msgs.push("Angkanya belum tepat. Periksa kembali cara hitungnya."); jenis = "angka_meleset"; }
      }
    }
    fb.push({ k: r.k, m: msgs.join(" "), jenis, tingkat: tingkatKesalahan(jenis, r.e, r.u) });
  });
  return { ok, rows, fb };
}

/** Pemeriksaan tambahan kasus lengkap: VII Rincian 1 terhadap tabel kontrol (cara rumus atau cara contoh) dan diskrepansi Blok VI-VII. */
export function engineChecks(h: HasilHitung): PeriksaEngine[] {
  const k = h.ctl, v = h.vals, out: PeriksaEngine[] = [];
  const f = Math.abs(v.r1k2 - k.r1k2) <= TOLERANSI && Math.abs(v.r1k4 - k.r1k4) <= TOLERANSI;
  const b = Math.abs(v.r1k2 - k.bK2) <= TOLERANSI && Math.abs(v.r1k4 - k.bK4) <= TOLERANSI;
  out.push({
    ok: f || b,
    t: f || b
      ? `VII Rincian 1 sesuai tabel kontrol (${f ? "cara rumus Buku 4 hlm. 343 dan 347" : "cara contoh Buku 4"}).`
      : `VII Rincian 1 belum sesuai kontrol. Pengambilan tabungan seharusnya ${rp(k.r1k2)} (atau ${rp(k.bK2)} cara contoh) dan menyimpan/menabung ${rp(k.r1k4)} (atau ${rp(k.bK4)}).`,
    ...(f || b ? {} : { jenis: "kontrol_vii" as const, tingkat: "fatal" as const }),
  });
  const d = Math.abs(h.co.disk) <= TOLERANSI;
  out.push({
    ok: d,
    t: d
      ? "Diskrepansi nol: selisih Blok VI sama dengan selisih Blok VII."
      : `Diskrepansi ${rp(h.co.disk)}: selisih Blok VI (${rp(h.co.vi_sel)}) tidak sama dengan selisih Blok VII (${rp(h.co.vii_sel)}).`,
    ...(d ? {} : { jenis: "diskrepansi" as const, tingkat: "fatal" as const }),
  });
  if (h.co.vi_sel < 0) out.push({ ok: true, info: true, t: `Selisih Blok VI negatif (${rp(h.co.vi_sel)}). Ini boleh terjadi bila rumah tangga memakai uang kas tahun sebelumnya; lakukan probing, jangan mengubah angka agar positif.` });
  return out;
}

/** Mengisi VII Rincian 1 otomatis dari kontrol (cara rumus), seperti tombol bantu prototipe (autoR1). Hanya untuk kasus lengkap. */
export function isiOtomatisR1(v: Nilai): Nilai {
  const e = compute(v);
  const baru: Nilai = { ...v };
  const p1 = Math.max(0, R(e.ctl.r1k2)) || 0, g1 = R(e.ctl.r1k4) || 0;
  if (p1) baru.vii_p1 = p1; else delete baru.vii_p1;
  if (g1) baru.vii_g1 = g1; else delete baru.vii_g1;
  return baru;
}

/** Bintang 0-3: 3 dikurangi petunjuk dan percobaan ulang (minimal 1 bila benar); "Lihat jawaban" = 0. Hanya dipanggil bila jawaban benar. */
export function hitungBintang(o: { petunjuk: number; percobaan: number; lihatJawaban: boolean }): number {
  if (o.lihatJawaban) return 0;
  return Math.max(1, 3 - o.petunjuk - (o.percobaan - 1));
}

/** Kasus dinilai lulus penuh bila semua kotak benar dan (kasus lengkap) semua pemeriksaan engine lolos. */
export function kasusBenar(c: Kasus, vals: Nilai): { benar: boolean; evaluasi: HasilEvaluasi; pemeriksaan: PeriksaEngine[] } {
  const evaluasi = evaluate(c, vals);
  const pemeriksaan = c.lengkap ? engineChecks(compute(vals)) : [];
  return { benar: evaluasi.ok && pemeriksaan.every((x) => x.ok), evaluasi, pemeriksaan };
}
