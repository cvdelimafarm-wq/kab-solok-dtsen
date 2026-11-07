import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { BarisMaster } from "@/lib/masterWilayah";

vi.mock("@/app/portal/sesi", () => ({ apiPortal: async () => ({}), pemilikSesi: () => 1 }));
vi.mock("@/app/sigap/admin/ui", () => ({
  BTN: "b", BTN_O: "bo", BTN_R: "br", BTN_T: "bt", TD: "td", TH: "th",
  Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>,
  Kartu: ({ judul, children }: { judul?: unknown; children?: unknown }) => <section><h3>{judul as never}</h3>{children as never}</section>,
  Memuat: () => <span>Memuat…</span>,
  Pesan: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));
import WilayahPeta, { Baris } from "@/app/sigap/kelola/master/WilayahPeta";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const b = (o: Partial<BarisMaster> = {}): BarisMaster => ({
  idsubsls: "1303110005000102", kd_kec: "1303110", kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN", sub_sls: "02", aktif: true,
  jumlah_kk: 107, kk_terbaru: "2026-11-01T00:00:00Z", gambar_peta: 2, jumlah_survei: 1,
  daftar_survei: [{ kegiatan_id: 6, kegiatan: "Seruti Triwulan IV 2026", nks: "0001A", target: 10, ppl: "Ani Putri", pml: null }], batas: true, ...o,
});
const tabel = (x: React.ReactNode) => renderToString(<table><tbody>{x}</tbody></table>);

describe("Master > Wilayah dan Peta", () => {
  it("keadaan awal: memuat", () => {
    expect(teksDari(renderToString(<WilayahPeta />))).toContain("Memuat");
  });
  it("baris menampilkan status peta, batas, KK, dan jumlah survei", () => {
    const t = teksDari(tabel(<Baris b={b()} sekarang="2026-11-07T10:00:00Z" terbuka={false} onKlik={() => {}} />));
    expect(t).toContain("GANTUANG CIRI");
    expect(t).toContain("2 gambar");
    expect(t).toContain("Ada");
    expect(t).toContain("Diperbarui");
    expect(t).toContain("107 KK");
    expect(t).toContain("1 survei");
  });
  it("tanpa KK, tanpa gambar, tanpa batas: penanda kurang", () => {
    const t = teksDari(tabel(<Baris b={b({ jumlah_kk: 0, gambar_peta: 0, batas: false, jumlah_survei: 0, daftar_survei: [] })} sekarang="2026-11-07T10:00:00Z" terbuka={false} onKlik={() => {}} />));
    expect(t).toContain("Belum ada");
    expect(t).toContain("Belum");
    expect(t).toContain("Tidak ada");
  });
  it("batas tidak diketahui tampil ?", () => {
    expect(teksDari(tabel(<Baris b={b({ batas: null })} sekarang="2026-11-07T10:00:00Z" terbuka={false} onKlik={() => {}} />))).toContain("?");
  });
  it("baris terbuka memuat kode penuh, PPL, dan PML belum ditetapkan", () => {
    const t = teksDari(tabel(<Baris b={b()} sekarang="2026-11-07T10:00:00Z" terbuka onKlik={() => {}} />));
    expect(t).toContain("1303110005000102");
    expect(t).toContain("NKS 0001A");
    expect(t).toContain("PPL Ani Putri");
    expect(t).toContain("PML belum ditetapkan");
  });
  it("baris terbuka tanpa survei", () => {
    expect(teksDari(tabel(<Baris b={b({ jumlah_survei: 0, daftar_survei: [] })} sekarang="2026-11-07T10:00:00Z" terbuka onKlik={() => {}} />))).toContain("Belum dipakai survei tahun ini");
  });
});
