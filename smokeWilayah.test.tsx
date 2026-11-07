import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { DataAlokasiSaya, WilayahAlokasi } from "@/lib/alokasiWilayah";

vi.mock("@/app/portal/sesi", () => ({ apiPortal: async () => ({}), pemilikSesi: () => 1 }));
vi.mock("@/app/sigap/admin/ui", () => ({
  BTN: "b", BTN_O: "bo", BTN_R: "br", BTN_T: "bt", TD: "td", TH: "th",
  Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>,
  Kartu: ({ judul, ket, kanan, children }: { judul?: unknown; ket?: unknown; kanan?: unknown; children?: unknown }) => <section><h3>{judul as never}</h3><p>{ket as never}</p>{kanan as never}{children as never}</section>,
  Memuat: () => <span>Memuat…</span>,
  Pesan: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));
import WilayahSaya, { BarisKk, type AksiBaris } from "@/app/sigap/sampel/WilayahSaya";
import TagSampel from "@/app/sigap/kelola/pendataan/TagSampel";
import type { InfoJendela, TagKk } from "@/lib/tagSampel";
import AlokasiWilayah from "@/app/sigap/kelola/pendataan/AlokasiWilayah";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const w = (id: number, o: Partial<WilayahAlokasi> = {}): WilayahAlokasi => ({
  id, idsubsls: `13031100050001${String(id).padStart(2, "0")}`, nks: "0001A", target: 10, kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN", sub_sls: "01", kd_kec: "1303110",
  ppl_akun_id: 1, pml_akun_id: 2, ppl_nama: "Ani Putri", pml_nama: "Budi", jumlah_kk: 107, ...o,
});
const dasar = (o: Partial<DataAlokasiSaya>): DataAlokasiSaya => ({
  sekarang: "2026-11-07T10:00:00Z", kegiatan: { id: 6, nama: "Seruti Triwulan IV 2026" }, peran: "ppl", saya: { id: 1, nama: "Ani Putri" },
  konfig: { target_per_sls: 10, maks_sls_per_ppl: 2, dengan_updating: true, cadangan_per_sls: 1 }, wilayah: [w(1), w(2, { jumlah_kk: 0, nks: null })], ...o,
});
const muatKk = async () => ({ kk: [], salinan: false });

describe("WilayahSaya (HP)", () => {
  it("PPL: dua sub SLS, NKS sebagai penanda, jumlah KK, model dengan updating", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({})} muatKk={muatKk} luring={false} />));
    for (const k of ["Wilayah saya", "2 sub SLS", "target 20 sampel", "dengan updating", "NKS 0001A", "Target 10 sampel", "107 KK di daftar", "daftar KK belum ada", "Lakukan updating di FASIH lebih dulu"]) expect(t).toContain(k);
    expect(t).not.toContain("NKS null");
  });
  it("model tanpa updating: langsung tandai sampel dari daftar KK", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({ konfig: { target_per_sls: 10, maks_sls_per_ppl: 2, dengan_updating: false, cadangan_per_sls: 0 } })} muatKk={muatKk} luring={false} />));
    expect(t).toContain("tanpa updating");
    expect(t).toContain("langsung ditandai dari daftar KK ini");
    expect(t).not.toContain("Lakukan updating di FASIH");
  });
  it("PML: dikelompokkan per PPL; luring menampilkan peringatan", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({ peran: "pml", wilayah: [w(1), w(2, { ppl_akun_id: 4, ppl_nama: "Dedi" })] })} muatKk={muatKk} luring />));
    expect(t).toContain("Wilayah PPL saya");
    expect(t).toContain("Ani Putri");
    expect(t).toContain("Dedi");
    expect(t).toContain("Tidak tersambung");
  });
  it("tanpa wilayah: tidak menampilkan apa pun", () => {
    expect(renderToString(<WilayahSaya data={dasar({ wilayah: [] })} muatKk={muatKk} luring={false} />)).toBe("");
  });
});

describe("AlokasiWilayah (Kelola)", () => {
  it("render awal tanpa galat: judul, memuat", () => {
    const t = teksDari(renderToString(<AlokasiWilayah kegiatanId={6} nama="Seruti Triwulan IV 2026" />));
    expect(t).toContain("Alokasi per Sub SLS");
    expect(t).toContain("Memuat");
    expect(t).toContain("kode Sub SLS 16 digit");
  });
});

const jendelaAt = (status: InfoJendela["status"], jam = 5): InfoJendela => ({
  status, jumlah_buka: status === "belum" ? 0 : 1, detik_sisa: 0, sekarang: new Date().toISOString(),
  ...(status === "belum" ? {} : { dibuka_at: new Date(Date.now() - 3600_000).toISOString(), batas_at: new Date(Date.now() + jam * 3600_000).toISOString(), ditutup_at: new Date(Date.now() + jam * 3600_000).toISOString() }),
});

describe("jendela rilis di HP", () => {
  it("terbuka: tampil sisa waktu", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({ jendela: jendelaAt("terbuka") })} muatKk={muatKk} luring={false} />));
    expect(t).toContain("Penandaan sampel sedang dibuka");
    expect(t).toMatch(/Sisa waktu \d+ jam/);
  });
  it("belum dibuka dan terkunci", () => {
    expect(teksDari(renderToString(<WilayahSaya data={dasar({ jendela: jendelaAt("belum") })} muatKk={muatKk} luring={false} />))).toContain("belum dibuka oleh Ketua tim");
    expect(teksDari(renderToString(<WilayahSaya data={dasar({ jendela: jendelaAt("terkunci") })} muatKk={muatKk} luring={false} />))).toContain("sudah dikunci");
  });
  it("terbuka tetapi hitung mundur habis di HP: dianggap terkunci", () => {
    const j = { ...jendelaAt("terbuka"), batas_at: new Date(Date.now() - 1000).toISOString() };
    expect(teksDari(renderToString(<WilayahSaya data={dasar({ jendela: j })} muatKk={muatKk} luring={false} />))).toContain("sudah dikunci");
  });
  it("rekap tag pada kartu sub SLS", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({ wilayah: [w(1, { tag: { utama: 7, cadangan: 1, hasil: 3 } })] })} muatKk={muatKk} luring={false} />));
    expect(t).toContain("Utama 7/10 · Cadangan 1/1 · Hasil 3");
  });
});

const kk = { id: 5, nama_kk: "Pak Budi", anggota_lain: null, patokan: null, lat: null, lng: null };
const aksi = (o: Partial<AksiBaris> = {}): AksiBaris => ({ bisaTandai: true, bisaHasil: true, sibuk: false, cadanganAda: true, utamaPenuh: false, cadanganPenuh: false, onTag: () => {}, onLepas: () => {}, onHasil: () => {}, ...o });
const baris = (tag: TagKk | undefined, a: AksiBaris) => teksDari(renderToString(<ol><BarisKk k={kk} no={1} tag={tag} aksi={a} /></ol>));

describe("baris KK: penandaan", () => {
  it("belum bertag, jendela terbuka: dapat dijadikan utama atau cadangan", () => {
    const t = baris(undefined, aksi());
    expect(t).toContain("Jadikan utama");
    expect(t).toContain("Jadikan cadangan");
    expect(t).not.toContain("Lepas");
    expect(t).not.toContain("Hasil:");
  });
  it("tanpa cadangan: tombol cadangan tidak ada", () => {
    expect(baris(undefined, aksi({ cadanganAda: false }))).not.toContain("Jadikan cadangan");
  });
  it("utama: tombol ganti ke cadangan, lepas, dan hasil pendataan", () => {
    const t = baris({ kk_id: 5, peran: "utama", hasil: null, via: "hp" }, aksi());
    expect(t).toContain("UTAMA");
    expect(t).toContain("Jadikan cadangan");
    expect(t).not.toContain("Jadikan utama");
    expect(t).toContain("Lepas");
    for (const h of ["Didata", "Menolak", "Tidak ditemukan"]) expect(t).toContain(h);
  });
  it("jendela terkunci: tidak ada tombol tag, hasil tetap bisa diisi", () => {
    const t = baris({ kk_id: 5, peran: "utama", hasil: null, via: "hp" }, aksi({ bisaTandai: false }));
    expect(t).not.toContain("Jadikan");
    expect(t).not.toContain("Lepas");
    expect(t).toContain("Didata");
  });
  it("sudah ada hasil: tag tidak dapat diubah atau dilepas", () => {
    const tag: TagKk = { kk_id: 5, peran: "utama", hasil: "didata", via: "unggah" };
    const t = baris(tag, aksi());
    expect(t).not.toContain("Jadikan");
    expect(t).not.toContain("Lepas");
    expect(renderToString(<ol><BarisKk k={kk} no={1} tag={tag} aksi={aksi()} /></ol>)).toContain('aria-pressed="true"');
  });
  it("PML (hanya lihat): chip peran tanpa tombol aksi", () => {
    const t = baris({ kk_id: 5, peran: "cadangan", hasil: null, via: "hp" }, aksi({ bisaTandai: false, bisaHasil: false }));
    expect(t).toContain("CADANGAN");
    expect(t).not.toContain("Jadikan");
    expect(t).not.toContain("Hasil:");
  });
  it("target penuh: tombol utama dinonaktifkan", () => {
    const h = renderToString(<ol><BarisKk k={kk} no={1} tag={undefined} aksi={aksi({ utamaPenuh: true })} /></ol>);
    expect(h).toMatch(/disabled=""[^>]*aria-label="Jadikan Pak Budi sampel utama"/);
  });
});

describe("TagSampel (Kelola)", () => {
  it("render awal: judul dan memuat", () => {
    const t = teksDari(renderToString(<TagSampel kegiatanId={6} nama="Seruti Triwulan IV 2026" />));
    expect(t).toContain("Tag Sampel Stage 2");
    expect(t).toContain("Jendela Rilis");
    expect(t).toContain("Memuat");
  });
});
