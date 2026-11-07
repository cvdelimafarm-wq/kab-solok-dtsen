import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { DataWilayahSampel } from "@/lib/wilayahSampelIdent";

const { bebas } = vi.hoisted(() => ({
  bebas: (khusus: Record<string, unknown> = {}) =>
    new Proxy({}, { has: () => true, get: (_t, k) => (k === "then" || k === "__esModule" ? undefined : k in khusus ? khusus[k as string] : () => null) }),
}));
vi.mock("@/app/sigap/keu-ui", () => bebas({ kolom: "kolom", label: "label", tombolBahaya: "x", tombolKecil: "y" }));
vi.mock("@/lib/keu/kebijakan", () => bebas({ JABATAN: [] }));
vi.mock("@/lib/keu/lanjutan", () => bebas({ ID_LJ: { wilayah: "lj-wilayah" }, KODE_PERAN: [], NAMA_PERAN: {}, METODE_KELAS: [], PAKET_KELAS: [], PERJALANAN_KELAS: [], TEMPAT_KELAS: [], NAMA_PERJALANAN: {}, NAMA_SUMBER: {}, MAKS_INSTRUKTUR: 3 }));
vi.mock("@/lib/keu/identifikasi", () => bebas({ ASAL_INSTRUKTUR: [], LEVEL_INSTRUKTUR: [], NAMA_LEVEL: {} }));
vi.mock("@/lib/keu/tautAwal", () => bebas());
vi.mock("@/lib/keu/pilihNama", () => bebas());
vi.mock("@/lib/keu/pilihInstruktur", () => bebas({ PILIHAN_LAINNYA: "x" }));
vi.mock("@/lib/keu/isianTanggal", () => bebas());
vi.mock("@/app/components/SelectCari", () => ({ default: () => null }));
vi.mock("@/app/sigap/kelola/perencanaan/identifikasi/PilihNama", () => ({ default: () => null }));
vi.mock("@/app/sigap/kelola/perencanaan/identifikasi/Kontrol", () => ({
  Angka: () => null, Cat: ({ children }: { children: unknown }) => <p className="cat">{children as never}</p>, Centang: () => null, FixPerk: () => null, Pilihan: () => null, Tgl: () => null,
  Bagian: ({ judul, children }: { judul: string; children: unknown }) => <section><h2>{judul}</h2>{children as never}</section>,
  Isian: ({ judul, children }: { judul: string; children: unknown }) => <label><span>{judul}</span>{children as never}</label>,
}));
import { KartuWilayah } from "@/app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/Isian";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const isi = (wilayah = "") => ({ v: 1, wilayah, kelas: [], peran: {}, petugas: [] }) as never;
const data = (o: Partial<DataWilayahSampel> = {}): DataWilayahSampel => ({
  tertaut: true, siap: true, kegiatan: [{ id: 6, nama: "Seruti Triwulan IV 2026" }],
  nagari: [{ kecamatan: "Kubung", nagari: "Selayo", sub_sls: 2, target: 20 }, { kecamatan: "X Koto Diatas", nagari: "Pasilihan", sub_sls: 1, target: 10 }],
  total_sub_sls: 3, total_target: 30, tanpa_master: 0, ...o,
});
const lay = (o: Record<string, unknown> = {}) => ({ data: data(), memuat: false, galat: null, terpotong: 0, tersimpan: null, ...o }) as never;

describe("KartuWilayah (Identifikasi lanjutan) merujuk wilayah sampel", () => {
  it("memakai daftar nagari dari alokasi: hanya-baca, tanpa textarea, ada rekap dan tautan", () => {
    const h = renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati={false} sampel={lay()} />);
    const t = teksDari(h);
    expect(h).not.toContain("<textarea");
    expect(t).toContain("2 nagari");
    expect(t).toContain("3 sub SLS");
    expect(t).toContain("target 30 sampel");
    expect(t).toContain("Selayo");
    expect(t).toContain("X Koto Diatas");
    expect(t).toContain("Seruti Triwulan IV 2026");
    expect(h).toContain('href="/sigap/kelola/pendataan"');
  });
  it("tanpa alokasi tertaut: pesan arahan dan isian manual tetap ada", () => {
    const h = renderToString(<KartuWilayah isi={isi("Nagari A")} ubah={() => {}} mati={false} sampel={lay({ data: data({ nagari: [], tertaut: false }) })} />);
    expect(h).toContain("<textarea");
    expect(teksDari(h)).toContain("belum tertaut ke kegiatan pendataan");
  });
  it("tertaut tetapi alokasi belum diunggah: pesan berbeda", () => {
    const h = renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati={false} sampel={lay({ data: data({ nagari: [], total_sub_sls: 0 }) })} />);
    expect(teksDari(h)).toContain("Alokasi sub SLS belum diunggah");
  });
  it("sedang memuat: tidak menampilkan textarea dulu", () => {
    const h = renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati={false} sampel={lay({ data: null, memuat: true })} />);
    expect(h).not.toContain("<textarea");
    expect(teksDari(h)).toContain("Memuat wilayah sampel");
  });
  it("tanpa prop sampel (kompatibel lama): isian manual", () => {
    const h = renderToString(<KartuWilayah isi={isi("x")} ubah={() => {}} mati={false} />);
    expect(h).toContain("<textarea");
  });
  it("tersimpan berbeda dari alokasi terbaru: ada peringatan, beda untuk mode baca", () => {
    const beda = lay({ tersimpan: "Nagari Lama, Kecamatan Lama" });
    expect(teksDari(renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati={false} sampel={beda} />))).toContain("menyimpan sekarang akan memperbarui");
    expect(teksDari(renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati sampel={beda} />))).toContain("Tekan Revisi");
    const sama = lay({ tersimpan: "Nagari Pasilihan, Kecamatan X Koto Diatas\nNagari Selayo, Kecamatan Kubung" });
    expect(teksDari(renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati sampel={sama} />))).not.toContain("berbeda");
  });
  it("peringatan nagari tanpa master dan teks terpotong", () => {
    const t = teksDari(renderToString(<KartuWilayah isi={isi()} ubah={() => {}} mati={false} sampel={lay({ data: data({ tanpa_master: 2 }), terpotong: 4 })} />));
    expect(t).toContain("2 sub SLS beralokasi belum punya nama");
    expect(t).toContain("4 nagari terakhir");
  });
});
