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
import WilayahSaya from "@/app/sigap/sampel/WilayahSaya";
import AlokasiWilayah from "@/app/sigap/kelola/pendataan/AlokasiWilayah";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const w = (id: number, o: Partial<WilayahAlokasi> = {}): WilayahAlokasi => ({
  id, idsubsls: `13031100050001${String(id).padStart(2, "0")}`, nks: "0001A", target: 10, kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN", sub_sls: "01", kd_kec: "1303110",
  ppl_akun_id: 1, pml_akun_id: 2, ppl_nama: "Ani Putri", pml_nama: "Budi", jumlah_kk: 107, ...o,
});
const dasar = (o: Partial<DataAlokasiSaya>): DataAlokasiSaya => ({
  sekarang: "2026-11-07T10:00:00Z", kegiatan: { id: 6, nama: "Seruti Triwulan IV 2026" }, peran: "ppl", saya: { id: 1, nama: "Ani Putri" },
  konfig: { target_per_sls: 10, maks_sls_per_ppl: 2, dengan_updating: true }, wilayah: [w(1), w(2, { jumlah_kk: 0, nks: null })], ...o,
});
const muatKk = async () => ({ kk: [], salinan: false });

describe("WilayahSaya (HP)", () => {
  it("PPL: dua sub SLS, NKS sebagai penanda, jumlah KK, model dengan updating", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({})} muatKk={muatKk} luring={false} />));
    for (const k of ["Wilayah saya", "2 sub SLS", "target 20 sampel", "dengan updating", "NKS 0001A", "Target 10 sampel", "107 KK di daftar", "daftar KK belum ada", "Lakukan updating di FASIH lebih dulu"]) expect(t).toContain(k);
    expect(t).not.toContain("NKS null");
  });
  it("model tanpa updating: langsung tandai sampel dari daftar KK", () => {
    const t = teksDari(renderToString(<WilayahSaya data={dasar({ konfig: { target_per_sls: 10, maks_sls_per_ppl: 2, dengan_updating: false } })} muatKk={muatKk} luring={false} />));
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
