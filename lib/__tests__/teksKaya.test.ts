import { describe, expect, it } from "vitest";
import { uraiIsi } from "@/lib/sigapPengumuman";
import { bakukanMarkup, htmlDariMarkup, markupDariSimpul, memuatPenanda, type Simpul } from "@/lib/teksKaya";

// pohon buatan seperti hasil contentEditable di browser
const T = (s: string): Simpul => ({ nodeType: 3, nodeName: "#text", nodeValue: s, childNodes: [] });
const E = (nama: string, anak: Simpul[] = [], o?: { fw?: string; bg?: string; href?: string; fs?: string }): Simpul => ({
  nodeType: 1,
  nodeName: nama,
  nodeValue: null,
  childNodes: anak,
  style: { fontWeight: o?.fw ?? "", backgroundColor: o?.bg ?? "", fontStyle: o?.fs ?? "" },
  getAttribute: (n) => (n === "href" ? o?.href ?? null : null),
});

const CONTOH = [
  "**Kesempatan melengkapi foto dan laporan yang terlewat.**\n\n==Dibuka besok, Rabu 21 Oktober 2026, pukul 06.00–10.00 WIB.== Setelah pukul 10.00 akses ditutup otomatis.\n\n- Berlaku untuk ==hari kerja sejak awal pendataan sampai 20 Oktober 2026== yang foto atau laporannya belum lengkap\n- ==Siapkan foto dari sekarang==: kumpulkan foto yang masih ada di galeri HP\n- ==Kesempatan hanya sekali==. Tanggal yang masih belum lengkap tidak masuk Kwitansi\n\nPukul 06.00, buka menu **Perbaiki administrasi** di aplikasi untuk memulai.",
  "**Jendela melengkapi foto dan laporan sudah dibuka.**\n\n==Berlaku sampai pukul 10.00 WIB hari ini, hanya sekali.==\n\n- Foto tanggal yang terlewat diunggah lewat menu **Perbaiki administrasi**\n- Laporan dilengkapi lewat Lembar Pendataan (mode perbaikan)",
  "Bapak/Ibu petugas, kami mengundang untuk mengikuti **briefing pendataan** secara daring via Zoom:\n\n- **Hari/tanggal:** Selasa, 20 Oktober 2026\n- **Waktu:** ==08.00 – 08.45 WIB==\n- **Tautan Zoom:** [Buka tautan briefing](https://telkomsel.zoom.us/j/98559750469?pwd=abc.1) (tanpa password)\n\nMohon bergabung tepat waktu. Terima kasih.",
  "Baris satu\nBaris dua dalam paragraf yang sama\n\nParagraf kedua",
  "## Yang perlu disiapkan\n\nSebelum mulai, __periksa dulu__ hal berikut:\n\n1. Foto ==semua== lokasi\n2. Laporan **harian**\n3. Tautan [Zoom](https://zoom.us/j/1)\n\n## Catatan\n\n- Satu\n- Dua",
];

describe("bolak-balik markup <-> editor", () => {
  it("isi yang sudah baku kembali persis sama (templat siaran)", () => {
    for (const x of CONTOH) expect(bakukanMarkup(x)).toBe(x);
  });
  it("hasil bolak-balik diurai pengurai modal dengan blok yang sama", () => {
    for (const x of CONTOH) expect(uraiIsi(bakukanMarkup(x))).toEqual(uraiIsi(x));
  });
  it("kosong tetap kosong, dan HTML editor kosong berisi satu paragraf", () => {
    expect(bakukanMarkup("")).toBe("");
    expect(htmlDariMarkup("")).toBe("<p><br></p>");
  });
  it("HTML untuk editor: tebal b, sorot mark berlatar, daftar ul/li, tautan a, teks di-escape", () => {
    const h = htmlDariMarkup("a <b> & **t** ==s==\n\n- x\n- [y](https://a.b/c)");
    expect(h).toContain("<p>a &lt;b&gt; &amp; <b>t</b> <mark style=\"background-color:#FFE680\">s</mark></p>");
    expect(h).toContain("<ul><li>x</li><li><a href=\"https://a.b/c\">y</a></li></ul>");
  });
});

describe("membaca hasil contentEditable", () => {
  it("div/br seperti Chrome, teks lepas di akar, dan nbsp", () => {
    const akar = [T("Awal"), E("DIV", [T("Kedua"), E("BR"), T("baris dua")]), E("DIV", [E("BR")]), E("DIV", [T("Ketiga spasi")])];
    expect(markupDariSimpul(akar)).toBe("Awal\n\nKedua\nbaris dua\n\nKetiga spasi");
  });
  it("tebal lewat b, strong, dan span font-weight; tidak tebal bila normal", () => {
    const akar = [E("P", [E("B", [T("a")]), T(" "), E("STRONG", [T("b")]), T(" "), E("SPAN", [T("c")], { fw: "700" }), T(" "), E("SPAN", [T("d")], { fw: "normal" })])];
    expect(markupDariSimpul(akar)).toBe("**a** **b** **c** d");
  });
  it("potongan tebal bertetangga menyatu, spasi tepi dikeluarkan dari penanda", () => {
    const akar = [E("P", [E("B", [T("sangat ")]), E("B", [T("penting ")]), T("sekali")])];
    expect(markupDariSimpul(akar)).toBe("**sangat penting** sekali");
  });
  it("sorot lewat mark dan span berlatar; latar transparan membatalkan sorot", () => {
    const akar = [E("P", [E("MARK", [T("a")]), T(" "), E("SPAN", [T("b")], { bg: "rgb(255, 230, 128)" }), T(" "), E("MARK", [E("SPAN", [T("c")], { bg: "transparent" })])])];
    expect(markupDariSimpul(akar)).toBe("==a== ==b== c");
  });
  it("tebal + sorot sekaligus -> sorot (penanda tidak bersarang)", () => {
    const akar = [E("P", [E("B", [E("MARK", [T("x")])]), E("MARK", [E("B", [T(" y")])])])];
    expect(markupDariSimpul(akar)).toBe("==x y==");
  });
  it("sorot/tebal tidak melewati baris baru: tiap baris dibungkus sendiri (pengurai lama tidak melintasi baris)", () => {
    const akar = [E("P", [E("B", [T("satu"), E("BR"), T("dua")])])];
    expect(markupDariSimpul(akar)).toBe("**satu**\n**dua**");
    expect(uraiIsi(markupDariSimpul(akar))[0]).toEqual({ tipe: "p", baris: [{ t: "tebal", teks: "satu" }, { t: "teks", teks: "\n" }, { t: "tebal", teks: "dua" }] });
  });
  it("daftar: butir kosong dibuang; baris baru dalam butir menjadi spasi", () => {
    const akar = [E("UL", [E("LI", [T("a")]), E("LI", [E("BR")]), E("LI", [T("b"), E("BR"), T("c")])])];
    expect(markupDariSimpul(akar)).toBe("- a\n- b c");
  });
  it("paragraf diikuti daftar diikuti paragraf dipisah baris kosong", () => {
    const akar = [E("P", [T("Judul")]), E("UL", [E("LI", [T("satu")]), E("LI", [T("dua")])]), E("P", [T("Penutup")])];
    expect(markupDariSimpul(akar)).toBe("Judul\n\n- satu\n- dua\n\nPenutup");
  });
  it("tautan https diterima; tautan tidak aman menjadi teks biasa; gaya di dalam tautan diabaikan", () => {
    const akar = [E("P", [E("A", [E("B", [T("Zoom")])], { href: "https://zoom.us/j/1" }), T(" "), E("A", [T("jahat")], { href: "javascript:alert(1)" })])];
    expect(markupDariSimpul(akar)).toBe("[Zoom](https://zoom.us/j/1) jahat");
  });
  it("tanda kurung penutup di alamat tautan di-encode agar tidak memotong penanda", () => {
    const akar = [E("P", [E("A", [T("x")], { href: "https://a.b/c_(d)" })])];
    expect(markupDariSimpul(akar)).toBe("[x](https://a.b/c_(d%29)");
  });
});

describe("teks biasa yang kebetulan memuat penanda", () => {
  it("**, == dan ]( dinetralkan dengan karakter lebar-nol sehingga tidak berubah arti", () => {
    const m = markupDariSimpul([E("P", [T("a **b** c ==d== [e](https://x.y)")])]);
    const blok = uraiIsi(m);
    expect(blok).toHaveLength(1);
    const potongan = (blok[0] as { tipe: "p"; baris: { t: string }[] }).baris;
    expect(potongan.every((p) => p.t === "teks")).toBe(true);
  });
  it("awal baris '- ' di paragraf tidak menjadi daftar", () => {
    const m = markupDariSimpul([E("P", [T("- bukan daftar"), E("BR"), T("• juga bukan")])]);
    const blok = uraiIsi(m);
    expect(blok.map((b) => b.tipe)).toEqual(["p"]);
  });
});

describe("memuatPenanda (untuk tempel)", () => {
  it("mengenali penanda dan awal daftar", () => {
    expect(memuatPenanda("a **b**")).toBe(true);
    expect(memuatPenanda("a ==b==")).toBe(true);
    expect(memuatPenanda("x\n- y")).toBe(true);
    expect(memuatPenanda("[a](https://b.c)")).toBe(true);
    expect(memuatPenanda("teks biasa saja")).toBe(false);
    expect(memuatPenanda("3 - 2 = 1")).toBe(false);
  });
});

describe("miring, subjudul, daftar bernomor", () => {
  it("pengurai: __miring__, '## ' subjudul, '1. ' daftar bernomor; daftar berpoin dan bernomor bergantian dipisah", () => {
    const b = uraiIsi("## Judul\n\nteks __miring__ biasa\n1. satu\n2) dua\n- poin");
    expect(b[0]).toEqual({ tipe: "judul", baris: [{ t: "teks", teks: "Judul" }] });
    expect(b[1]).toEqual({ tipe: "p", baris: [{ t: "teks", teks: "teks " }, { t: "miring", teks: "miring" }, { t: "teks", teks: " biasa" }] });
    expect(b[2]).toEqual({ tipe: "daftar", bernomor: true, butir: [[{ t: "teks", teks: "satu" }], [{ t: "teks", teks: "dua" }]] });
    expect(b[3]).toEqual({ tipe: "daftar", butir: [[{ t: "teks", teks: "poin" }]] });
    expect(b).toHaveLength(4);
  });
  it("daftar berpoin lama tetap sama persis (tanpa properti bernomor)", () => {
    expect(uraiIsi("- a\n- b")).toEqual([{ tipe: "daftar", butir: [[{ t: "teks", teks: "a" }], [{ t: "teks", teks: "b" }]] }]);
  });
  it("'##' tanpa isi dan '#hashtag' tetap teks biasa", () => {
    expect(uraiIsi("## \n#hashtag")[0].tipe).toBe("p");
  });
  it("editor: miring lewat i, em, dan span font-style; normal membatalkan", () => {
    const akar = [E("P", [E("I", [T("a")]), T(" "), E("EM", [T("b")]), T(" "), E("SPAN", [T("c")], { fs: "italic" }), T(" "), E("I", [E("SPAN", [T("d")], { fs: "normal" })])])];
    expect(markupDariSimpul(akar)).toBe("__a__ __b__ __c__ d");
  });
  it("urutan menang saat gaya ganda: sorot > tebal > miring", () => {
    expect(markupDariSimpul([E("P", [E("B", [E("I", [T("x")])])])])).toBe("**x**");
    expect(markupDariSimpul([E("P", [E("I", [E("MARK", [T("y")])])])])).toBe("==y==");
  });
  it("editor: h3 menjadi subjudul satu baris tanpa penanda tebal; ol menjadi daftar bernomor berurut", () => {
    const akar = [E("H3", [E("B", [T("Bagian")]), E("BR"), T("satu")]), E("OL", [E("LI", [T("a")]), E("LI", [E("BR")]), E("LI", [E("I", [T("b")])])]), E("DIV", [T("tutup")])];
    expect(markupDariSimpul(akar)).toBe("## Bagian satu\n\n1. a\n2. __b__\n\ntutup");
  });
  it("paragraf yang diawali angka, '##' dinetralkan sehingga tidak jadi daftar/subjudul", () => {
    const m = markupDariSimpul([E("P", [T("2. bukan daftar"), E("BR"), T("## bukan judul")])]);
    expect(uraiIsi(m).map((b) => b.tipe)).toEqual(["p"]);
  });
  it("garis bawah ganda di teks biasa dinetralkan", () => {
    const m = markupDariSimpul([E("P", [T("file __init__ dan __main__")])]);
    const b = uraiIsi(m);
    expect((b[0] as { baris: { t: string }[] }).baris.every((x) => x.t === "teks")).toBe(true);
  });
  it("HTML editor: i, h3, ol", () => {
    const h = htmlDariMarkup("## J\n\n__m__\n\n1. a\n2. b");
    expect(h).toContain("<h3>J</h3>");
    expect(h).toContain("<p><i>m</i></p>");
    expect(h).toContain("<ol><li>a</li><li>b</li></ol>");
  });
  it("memuatPenanda mengenali miring, nomor, subjudul", () => {
    expect(memuatPenanda("a __b__")).toBe(true);
    expect(memuatPenanda("x\n1. y")).toBe(true);
    expect(memuatPenanda("## J")).toBe(true);
    expect(memuatPenanda("tahun 2026. selesai")).toBe(false);
  });
});
