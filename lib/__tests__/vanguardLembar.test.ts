import { describe, expect, it } from "vitest";
import { compute } from "../vanguard/engine";
import { KASUS } from "../vanguard/kasus";
import { boxes, idDiLembar, kutipanIv, lembarBlok, mny } from "../vanguard/lembar";
import { idSelKasus } from "../vanguard/sel";
import { hitungEkspresi, tekanPad, tekanTombol } from "../vanguard/keypad";
import { alamatDasbor, alamatVanguard, tujuanAman } from "../vanguard/navigasi";

/** Angka yang tampil pada sebuah sel (gabungan digit kotak) menurut atribut data-id atau data-co. */
const angkaSel = (html: string, atribut: string, id: string): string => {
  const m = new RegExp(`${atribut}="${id}"[^>]*>((?:(?!</td>).)*)</td>`).exec(html);
  return m ? angkaKotak(m[1]) : "(tidak ada)";
};
const angkaKotak = (potong: string): string => [...potong.matchAll(/<u>(\d?)<\/u>/g)].map((x) => x[1]).join("");

describe("lembar kuesioner (HTML)", () => {
  it("kotak digit: pola, pemisah, pemotongan dari kiri", () => {
    expect(boxes("b.bbb", "12")).toBe('<u></u><i class="sep">.</i><u></u><u>1</u><u>2</u>');
    expect(boxes("bb", "12345")).toBe("<u>4</u><u>5</u>");
    expect(mny(0)).toBe(mny(undefined));
    expect(mny(-5)).toContain('class="neg"');
    expect(angkaKotak(mny(1234))).toBe("1234");
  });
  it("untuk setiap kasus, kotak isian di layar = registri sel (urut sama)", () => {
    for (const k of KASUS) {
      const html = lembarBlok(k, { vals: {}, co: compute({}).co, status: {} });
      expect(idDiLembar(html), k.kode).toEqual(idSelKasus({ blok: k.blok, lengkap: false }));
    }
  });
  it("nilai isian dan status ok/no tampil di kotak yang tepat", () => {
    const k = KASUS.find((x) => x.blok.includes("A"))!;
    const html = lembarBlok(k, { vals: { a1_uang: 4500000 }, co: compute({ a1_uang: 4500000 }).co, status: { a1_uang: "ok", a2_uang: "no" } });
    expect(angkaSel(html, "data-id", "a1_uang")).toBe("4500000");
    expect(angkaSel(html, "data-id", "a1_barang")).toBe("");
    expect(html).toContain('class="in money ok" data-id="a1_uang"');
    expect(html).toContain('class="in money no" data-id="a2_uang"');
  });
  it("sel hitungan otomatis (data-co) mengikuti engine", () => {
    const k = KASUS.find((x) => x.blok.includes("A"))!;
    const vals = { a1_uang: 1000000, a2_uang: 250000 };
    const html = lembarBlok(k, { vals, co: compute(vals).co, status: {} });
    expect(html).toContain('data-co="sumA_u"');
    expect(angkaSel(html, "data-co", "sumA_u")).toBe("1250000");
  });
  it("kutipan Blok IV: ada untuk kasus berkutipan; kosong bila tidak ada", () => {
    expect(kutipanIv(undefined)).toBe("");
    const k = KASUS.find((x) => x.iv)!;
    expect(kutipanIv(k.iv)).toContain("BLOK IV");
  });
  it("label kotak memakai registri (bukan teks bebas)", () => {
    const k = KASUS.find((x) => x.blok.includes("D"))!;
    const html = lembarBlok(k, { vals: {}, co: {}, status: {} });
    expect(html).toContain('data-lbl="V.D · 1 Sewa lahan · (2) Diterima"');
  });
});

describe("kalkulator", () => {
  it("menghitung dengan prioritas operator, kurung, desimal koma, dan minus unary", () => {
    expect(hitungEkspresi("2+3×4")).toBe(14);
    expect(hitungEkspresi("(2+3)×4")).toBe(20);
    expect(hitungEkspresi("10÷4")).toBe(2.5);
    expect(hitungEkspresi("1,5×2")).toBe(3);
    expect(hitungEkspresi("−5+8")).toBe(3);
    expect(hitungEkspresi("2×−3")).toBe(-6);
    expect(hitungEkspresi("700000×30÷7×12")).toBeCloseTo(36_000_000, 3);
    expect(hitungEkspresi("1000/4*3-2")).toBe(748);
  });
  it("kosong = 0; rusak, pembagi nol, dan kode = null", () => {
    expect(hitungEkspresi("")).toBe(0);
    for (const x of ["2+", "(2", "2)", "1÷0", "abc", "process.exit()", "2**3", "((", "1,2,3", "alert(1)", "2+2;1"]) expect(hitungEkspresi(x), x).toBeNull();
    expect(hitungEkspresi("9".repeat(300))).toBeNull();
    expect(hitungEkspresi("(".repeat(100) + "1" + ")".repeat(100))).toBeNull();
  });
  it("tombol: C, hapus, tambah, batas panjang", () => {
    expect(tekanTombol("12", "C")).toBe("");
    expect(tekanTombol("12", "⌫")).toBe("1");
    expect(tekanTombol("12", "3")).toBe("123");
    expect(tekanTombol("1".repeat(200), "2").length).toBe(200);
  });
});

describe("kalkulator: mode ganti pada kotak berisi", () => {
  it("angka pertama menggantikan nilai lama; operator melanjutkannya; hapus membuang mode ganti", () => {
    expect(tekanPad("6000", true, "7")).toEqual({ expr: "7", ganti: false });
    expect(tekanPad("6000", true, "000")).toEqual({ expr: "000", ganti: false });
    expect(tekanPad("6000", true, "(")).toEqual({ expr: "(", ganti: false });
    expect(tekanPad("6000", true, ",")).toEqual({ expr: ",", ganti: false });
    expect(tekanPad("6000", true, "×")).toEqual({ expr: "6000×", ganti: false });
    expect(tekanPad("6000", true, "×30÷7×12")).toEqual({ expr: "6000×30÷7×12", ganti: false });
    expect(tekanPad("6000", true, "⌫")).toEqual({ expr: "600", ganti: false });
    expect(tekanPad("6000", true, "C")).toEqual({ expr: "", ganti: false });
    expect(tekanPad("6000", false, "7")).toEqual({ expr: "60007", ganti: false });
  });
  it("urutan ketikan: angka baru lalu rumus menghasilkan nilai benar, bukan menempel pada angka lama", () => {
    let st = { expr: "6000", ganti: true };
    for (const ch of "6000×30÷7×12") st = { ...st, ...tekanPad(st.expr, st.ganti, ch === "×" || ch === "÷" ? ch : ch) };
    expect(st.expr).toBe("6000×30÷7×12");
    expect(Math.round(hitungEkspresi(st.expr) as number)).toBe(308571);
  });
});

describe("jalan pulang", () => {
  it("menerima jalur internal dengan query; menolak sisanya", () => {
    expect(tujuanAman("/sigap/translok/abc123?k=5")).toBe("/sigap/translok/abc123?k=5");
    expect(tujuanAman(encodeURIComponent("/sigap/translok/abc123?k=5&x=1"))).toBe("/sigap/translok/abc123?k=5&x=1");
    expect(tujuanAman("/")).toBe("/");
    for (const x of [null, undefined, "", "https://jahat.example", "//jahat.example", "/\\jahat", "javascript:alert(1)", "/sigap/../admin", "/a/./b", "/javascript:alert(1)", "sigap/x", "%E0%A4%A", "/x\u0000y", "/" + "a".repeat(301)]) expect(tujuanAman(x as string | null), String(x)).toBe("/");
  });
  it("alamatVanguard: kartu Hari Ini membawa kegiatan dan asal; kartu Beranda tidak membawa kegiatan", () => {
    expect(alamatVanguard({ kegiatan: 5, dari: "/sigap/translok/tok?k=5" })).toBe("/sigap/vanguard?k=5&dari=%2Fsigap%2Ftranslok%2Ftok%3Fk%3D5");
    expect(alamatVanguard({ kegiatan: null, dari: "/" })).toBe("/sigap/vanguard");
    expect(alamatVanguard({ kegiatan: 0, dari: "//x" })).toBe("/sigap/vanguard");
  });
  it("alamatDasbor: membawa kegiatan dan halaman asal (pintasan dari Kelola)", () => {
    expect(alamatDasbor({ kegiatan: 5, dari: "/sigap/pelatihan/kelola?survei=SPDT&tab=soal" })).toBe("/sigap/vanguard/dasbor?kegiatan=5&dari=%2Fsigap%2Fpelatihan%2Fkelola%3Fsurvei%3DSPDT%26tab%3Dsoal");
    expect(alamatDasbor({ kegiatan: 5, dari: "/" })).toBe("/sigap/vanguard/dasbor?kegiatan=5");
    expect(alamatDasbor({ kegiatan: 5, dari: "https://jahat.example" })).toBe("/sigap/vanguard/dasbor?kegiatan=5");
    expect(alamatDasbor({ kegiatan: 0, dari: "/" })).toBe("/sigap/vanguard/dasbor");
  });
});
