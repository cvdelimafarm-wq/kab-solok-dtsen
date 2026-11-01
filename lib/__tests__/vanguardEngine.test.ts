import { describe, expect, it } from "vitest";
import { KASUS, KASUS_BERNILAI, KASUS_DITANGGUHKAN, MAKS_BINTANG, SEMUA_KASUS, URUTAN_LEVEL, cariKasus } from "../vanguard/kasus";
import { F, R, TOLERANSI, compute, engineChecks, evaluate, fmt, hitungBintang, isiOtomatisR1, kasusBenar, rp, tingkatKesalahan } from "../vanguard/engine";
import { SEL_PER_BLOK, idSelKasus, labelSel, selDikenal } from "../vanguard/sel";
import type { Kasus } from "../vanguard/tipe";

const kasus = (kode: string): Kasus => {
  const k = cariKasus(kode);
  if (!k) throw new Error(`kasus ${kode} tidak ada`);
  return k;
};
/** Isian benar sebuah kasus; kasus lengkap: VII Rincian 1 diisi otomatis dari kontrol (seperti tombol bantu prototipe). */
const isianBenar = (k: Kasus) => (k.lengkap ? isiOtomatisR1(k.kunci) : { ...k.kunci });

describe("data kasus", () => {
  it("kasus bernilai + 1 kalkulator bebas; maksimal bintang = 3 per kasus bernilai; 71 kode awal tetap ada (kode dibekukan)", () => {
    expect(KASUS).toHaveLength(KASUS_BERNILAI.length + 1);
    expect(KASUS_BERNILAI.length).toBeGreaterThanOrEqual(70);
    expect(MAKS_BINTANG).toBe(KASUS_BERNILAI.length * 3);
    const awal = [["A", 11], ["B", 8], ["C", 7], ["D", 18], ["E", 18], ["G", 8]].flatMap(([l, n]) => Array.from({ length: n as number }, (_, i) => `${l}${String(i + 1).padStart(2, "0")}`)).concat("H01");
    expect(awal).toHaveLength(71);
    for (const kode of awal) expect(SEMUA_KASUS.some((k) => k.kode === kode), kode).toBe(true); // kode dibekukan: kasus ditangguhkan tetap ada di berkas
    expect(KASUS.filter((k) => k.bebas).map((k) => k.kode)).toEqual(["H01"]);
    expect(KASUS.filter((k) => k.lengkap)).toHaveLength(8);
  });
  it("kode stabil: huruf level + dua digit, unik, berurutan per level, urutan level sesuai layar", () => {
    const kode = SEMUA_KASUS.map((k) => k.kode); // termasuk yang ditangguhkan: kodenya tidak boleh bergeser atau dipakai ulang
    expect(new Set(kode).size).toBe(kode.length);
    kode.forEach((c) => expect(c).toMatch(/^[A-EGH]\d{2}$/));
    const cacah: Record<string, number> = {};
    for (const k of SEMUA_KASUS) {
      cacah[k.level] = (cacah[k.level] ?? 0) + 1;
      expect(k.kode).toBe(k.level + String(cacah[k.level]).padStart(2, "0"));
    }
    expect([...new Set(KASUS.map((k) => k.level))]).toEqual(URUTAN_LEVEL);
    // kode yang dipakai rekaman tidak boleh bergeser
    expect(kasus("A01").judul).toBe("Telur asin kiriman saudara");
    expect(kasus("G01").nama).toBe("ali");
    expect(kasus("G02").judul).toBe("Rumah tangga Pak Iwan");
  });
  it("tiap kasus bernilai punya dua petunjuk, cara hitung, pembahasan, dan rujukan halaman Buku 4", () => {
    for (const k of KASUS_BERNILAI) {
      expect(k.petunjuk, k.kode).toHaveLength(2);
      expect(k.langkah.length, k.kode).toBeGreaterThanOrEqual(1);
      expect(k.pembahasan.length, k.kode).toBeGreaterThan(10);
      expect(k.rujukan, k.kode).toMatch(/^Buku 4 hlm\. \d+/);
    }
  });
  it("(d) setiap id pada kunci, jebakan, dan alternatif ada di kotak isian kasus itu", () => {
    for (const k of KASUS_BERNILAI) {
      const ada = new Set(idSelKasus(k));
      for (const id of [...Object.keys(k.kunci), ...k.jebakan.map((t) => t.k), ...k.alternatif.map((a) => a.k)]) {
        expect(selDikenal(id), `${k.kode}: ${id}`).toBe(true);
        expect(ada.has(id), `${k.kode}: ${id} tidak ada di blok ${k.blok.join(",")}`).toBe(true);
      }
    }
  });
  it("jebakan hanya pada kotak yang seharusnya kosong; nilai keliru khas tidak sama dengan kunci", () => {
    for (const k of KASUS_BERNILAI) {
      k.jebakan.forEach((t) => expect(k.kunci[t.k] ?? 0, `${k.kode}: ${t.k}`).toBe(0));
      k.alternatif.forEach((a) => expect(Math.abs((k.kunci[a.k] ?? 0) - a.v), `${k.kode}: ${a.k}`).toBeGreaterThan(TOLERANSI));
    }
  });
  it("kasus yang semua kotaknya harus kosong punya pesan khusus", () => {
    const kosong = KASUS_BERNILAI.filter((k) => Object.keys(k.kunci).length === 0);
    expect(kosong.map((k) => k.kode)).toEqual(expect.arrayContaining(["A10", "A11", "B04", "D07"]));
    kosong.forEach((k) => expect(k.nol, k.kode).toBeTruthy());
  });
  it("sel isian: tidak ada id ganda dan label terbentuk untuk semua kotak", () => {
    const ids = Object.values(SEL_PER_BLOK).flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(labelSel("e_rtLain_barangD")).toBe("V.E · 3 Rumah tangga lain · (3) Barang/jasa diterima");
    expect(labelSel("tidak_ada")).toBe("tidak_ada");
    expect(idSelKasus(kasus("G01"))).not.toContain("vii_p1");
    expect(idSelKasus({ blok: ["VII"], lengkap: false })).toContain("vii_p1");
  });
});

describe("kasus ditangguhkan (belum dikonfirmasi)", () => {
  it("kasus ber-bidang ditangguhkan: ada alasan, tidak ikut KASUS/bernilai/bintang, tetap ada di SEMUA_KASUS", () => {
    expect(KASUS_DITANGGUHKAN.map((k) => k.kode)).toContain("D18");
    for (const k of KASUS_DITANGGUHKAN) {
      expect(k.ditangguhkan, k.kode).toBeTruthy();
      expect(KASUS.some((x) => x.kode === k.kode), k.kode).toBe(false);
      expect(cariKasus(k.kode), k.kode).toBeUndefined();
      expect(SEMUA_KASUS.some((x) => x.kode === k.kode), k.kode).toBe(true);
    }
    expect(KASUS.length + KASUS_DITANGGUHKAN.length).toBe(SEMUA_KASUS.length);
    expect(MAKS_BINTANG).toBe(KASUS.filter((k) => !k.bebas).length * 3);
  });
});

describe("(a)(b) mengisi kunci benar, mengosongkan salah", () => {
  it("(a) kunci → benar pada seluruh 70 kasus (kasus lengkap dengan VII Rincian 1 otomatis)", () => {
    for (const k of KASUS_BERNILAI) {
      const h = kasusBenar(k, isianBenar(k));
      expect(h.benar, k.kode).toBe(true);
      expect(h.evaluasi.fb, k.kode).toHaveLength(0);
    }
  });
  it("(b) kosong → salah, kecuali kasus yang memang semua kotaknya kosong", () => {
    for (const k of KASUS_BERNILAI) {
      const harusKosong = Object.keys(k.kunci).length === 0;
      expect(kasusBenar(k, {}).benar === (harusKosong && !k.lengkap), k.kode).toBe(true);
      expect(evaluate(k, {}).ok, k.kode).toBe(harusKosong);
    }
  });
  it("kasus lengkap: kunci tanpa VII Rincian 1 gagal pada kontrol, bukan pada kotak", () => {
    const k = kasus("G02");
    const h = kasusBenar(k, { ...k.kunci });
    expect(h.evaluasi.ok).toBe(true);
    expect(h.benar).toBe(false);
  });
});

describe("(c) pesan koreksi muncul", () => {
  it("setiap nilai keliru khas memunculkan pesannya (jenis alternatif, berat)", () => {
    let n = 0;
    for (const k of KASUS_BERNILAI) {
      for (const a of k.alternatif) {
        const f = evaluate(k, { ...isianBenar(k), [a.k]: a.v }).fb.find((x) => x.k === a.k);
        expect(f?.m, `${k.kode}: ${a.k}`).toContain(a.m);
        n++;
      }
    }
    expect(n).toBe(KASUS_BERNILAI.reduce((a, k) => a + k.alternatif.length, 0)); // semua nilai keliru khas teruji
    expect(n).toBeGreaterThanOrEqual(37); // 37 pada 71 kasus awal
  });
  it("setiap jebakan memunculkan pesannya (jenis jebakan, fatal)", () => {
    let n = 0;
    for (const k of KASUS_BERNILAI) {
      for (const t of k.jebakan.filter((x) => x.m)) {
        const f = evaluate(k, { ...isianBenar(k), [t.k]: 1000 }).fb.find((x) => x.k === t.k);
        expect(f?.m, `${k.kode}: ${t.k}`).toContain(t.m);
        expect(f?.jenis).toBe("jebakan");
        expect(f?.tingkat).toBe("fatal");
        n++;
      }
    }
    expect(n).toBe(KASUS_BERNILAI.reduce((a, k) => a + k.jebakan.filter((x) => x.m).length, 0)); // semua jebakan teruji
    expect(n).toBeGreaterThanOrEqual(31); // 31 pada 71 kasus awal
  });
});

describe("jenis dan tingkat kesalahan (keputusan 1 Nov 2026)", () => {
  const k = kasus("A01"); // kunci: e_rtLain_barangD = 6.000 × 30/7 × 12
  const benar = k.kunci.e_rtLain_barangD;
  const sel = "e_rtLain_barangD";
  const fb = (u: Record<string, number>) => evaluate(k, u).fb;

  it("kunci A01 = Rp308.571 dan toleransi ±Rp1", () => {
    expect(benar).toBe(R(6000 * F));
    expect(benar).toBe(308571);
    expect(evaluate(k, { [sel]: benar + 1 }).ok).toBe(true);
    expect(evaluate(k, { [sel]: benar - 1 }).ok).toBe(true);
    expect(evaluate(k, { [sel]: benar + 2 }).ok).toBe(false);
  });
  it("masih nilai seminggu → konversi_seminggu (fatal)", () => {
    const f = fb({ [sel]: 6000 })[0];
    expect(f).toMatchObject({ k: sel, jenis: "konversi_seminggu", tingkat: "fatal" });
    expect(f.m).toContain("masih nilai seminggu");
  });
  it("masih nilai sebulan → konversi_sebulan (fatal)", () => {
    const f = fb({ [sel]: R(benar / 12) })[0];
    expect(f).toMatchObject({ jenis: "konversi_sebulan", tingkat: "fatal" });
    expect(f.m).toContain("masih nilai sebulan");
  });
  it("nilai benar di kotak lain → SATU kesalahan salah_letak (fatal) yang menyebut kotak asalnya; kotak keliru tidak dihukum lagi (V8d)", () => {
    const hasil = fb({ e_nirlaba_uangD: benar });
    expect(hasil).toHaveLength(1);
    expect(hasil[0]).toMatchObject({ k: sel, jenis: "salah_letak", tingkat: "fatal", dari: "e_nirlaba_uangD" });
    expect(hasil[0].m).toContain("kotak yang salah");
  });
  it("pasangan salah letak satu-satu: satu nilai tidak dapat menjelaskan dua kotak wajib; kotak wajib lain tetap belum_diisi", () => {
    const hasil = fb({ e_nirlaba_uangD: benar, e_nirlaba_barangD: benar + 5 });
    expect(hasil.filter((x) => x.jenis === "salah_letak")).toHaveLength(1);
    expect(hasil.some((x) => x.k === "e_nirlaba_barangD" && x.jenis === "harus_kosong")).toBe(true);
  });
  it("kotak yang harus kosong terisi → harus_kosong (fatal)", () => {
    expect(fb({ [sel]: benar, e_nirlaba_uangD: 500 })[0]).toMatchObject({ k: "e_nirlaba_uangD", jenis: "harus_kosong", tingkat: "fatal" });
  });
  it("kotak wajib belum diisi → belum_diisi (berat)", () => {
    expect(fb({})[0]).toMatchObject({ k: sel, jenis: "belum_diisi", tingkat: "berat" });
  });
  it("angka meleset: sampai 5% ringan, lebih dari 5% berat", () => {
    expect(fb({ [sel]: R(benar * 1.03) })[0]).toMatchObject({ jenis: "angka_meleset", tingkat: "ringan" });
    expect(fb({ [sel]: R(benar * 0.97) })[0]).toMatchObject({ jenis: "angka_meleset", tingkat: "ringan" });
    expect(fb({ [sel]: R(benar * 1.3) })[0]).toMatchObject({ jenis: "angka_meleset", tingkat: "berat" });
  });
  it("tabel tingkat menurut jenis", () => {
    expect(tingkatKesalahan("diskrepansi")).toBe("fatal");
    expect(tingkatKesalahan("kontrol_vii")).toBe("fatal");
    expect(tingkatKesalahan("alternatif")).toBe("berat");
    expect(tingkatKesalahan("angka_meleset", 0, 100)).toBe("berat"); // kunci 0 tidak punya selisih relatif
    expect(tingkatKesalahan("angka_meleset", 1000, 1050)).toBe("ringan");
    expect(tingkatKesalahan("angka_meleset", 1000, 1051)).toBe("berat");
  });
});

describe("(e)(f) kasus lengkap: kontrol VII Rincian 1 dan diskrepansi", () => {
  it("(e) kunci + VII Rincian 1 otomatis → diskrepansi nol dan semua pemeriksaan lolos pada 8 kasus lengkap", () => {
    for (const k of KASUS.filter((x) => x.lengkap)) {
      const h = compute(isianBenar(k));
      expect(Math.abs(h.co.disk), k.kode).toBeLessThanOrEqual(TOLERANSI);
      expect(engineChecks(h).every((x) => x.ok), k.kode).toBe(true);
    }
  });
  it("(e) diterima juga cara contoh Buku 4 untuk VII Rincian 1", () => {
    for (const k of KASUS.filter((x) => x.lengkap)) {
      const b = compute(k.kunci).ctl;
      const h = compute({ ...k.kunci, vii_p1: R(b.bK2), vii_g1: R(b.bK4) });
      expect(engineChecks(h).every((x) => x.ok), k.kode).toBe(true);
    }
  });
  it("VII Rincian 1 salah → kontrol_vii (fatal); konsumsi VI diubah → diskrepansi (fatal)", () => {
    const k = kasus("G02");
    const salah = engineChecks(compute({ ...k.kunci, vii_p1: 5, vii_g1: 7 }));
    expect(salah[0]).toMatchObject({ ok: false, jenis: "kontrol_vii", tingkat: "fatal" });
    const lengkap = isianBenar(k);
    const disk = engineChecks(compute({ ...lengkap, vi_g1: (lengkap.vi_g1 ?? 0) + 5000 }));
    expect(disk.find((x) => x.jenis === "diskrepansi")).toMatchObject({ ok: false, tingkat: "fatal" });
  });
  it("(f) angka acuan Pak Iwan (Buku 4 hlm. 359–362): penerimaan Rp48.769.143, selisih Rp18.769.143, VII R.1 K.2 Rp8.630.857 dan K.4 Rp27.400.000 (cara contoh)", () => {
    const h = compute(kasus("G02").kunci);
    expect(h.co.vi_pt).toBe(48769143);
    expect(h.co.vi_sel).toBe(18769143);
    expect(R(h.ctl.bK2)).toBe(8630857);
    expect(R(h.ctl.bK4)).toBe(27400000);
  });
  it("(f) angka acuan Pak Ali (Buku 4 hlm. 355–357): R.1 K.2 Rp113.890.000 dan K.4 Rp115.900.000 (cara contoh)", () => {
    const h = compute(kasus("G01").kunci);
    expect(R(h.ctl.bK2)).toBe(113890000);
    expect(R(h.ctl.bK4)).toBe(115900000);
  });
});

describe("bintang dan format", () => {
  it("bintang = 3 − petunjuk − percobaan ulang, minimal 1; lihat jawaban = 0", () => {
    expect(hitungBintang({ petunjuk: 0, percobaan: 1, lihatJawaban: false })).toBe(3);
    expect(hitungBintang({ petunjuk: 1, percobaan: 1, lihatJawaban: false })).toBe(2);
    expect(hitungBintang({ petunjuk: 1, percobaan: 2, lihatJawaban: false })).toBe(1);
    expect(hitungBintang({ petunjuk: 2, percobaan: 5, lihatJawaban: false })).toBe(1);
    expect(hitungBintang({ petunjuk: 0, percobaan: 1, lihatJawaban: true })).toBe(0);
  });
  it("format rupiah", () => {
    expect(fmt(1234567.4)).toBe("1.234.567");
    expect(rp(-18769143)).toBe("-Rp18.769.143");
    expect(rp(0)).toBe("Rp0");
  });
  it("compute: sel kosong dihitung nol dan tidak mengubah masukan", () => {
    const masukan = { e_rtLain_barangD: 100 };
    const h = compute(masukan);
    expect(h.co.sumE_bD).toBe(100);
    expect(masukan).toEqual({ e_rtLain_barangD: 100 });
    expect(compute({}).co.vi_sel).toBe(0);
  });
});
