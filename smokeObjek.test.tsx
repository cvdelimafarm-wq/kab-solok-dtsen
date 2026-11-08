import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/app/portal/sesi", () => ({ apiPortal: async () => ({}), pemilikSesi: () => 1 }));
vi.mock("@/app/sigap/admin/ui", () => ({
  BTN: "b", BTN_O: "bo", BTN_R: "br", BTN_T: "bt", TD: "td", TH: "th",
  Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>,
  Kartu: ({ judul, ket, kanan, children }: { judul?: unknown; ket?: unknown; kanan?: unknown; children?: unknown }) => <section><h3>{judul as never}</h3><p>{ket as never}</p>{kanan as never}{children as never}</section>,
  Memuat: () => <span>Memuat…</span>,
  Pesan: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));
import ModelSampel from "@/app/sigap/kelola/pendataan/ModelSampel";
import ObjekSampel from "@/app/sigap/kelola/pendataan/ObjekSampel";
import type { DataObjekAdmin } from "@/lib/sampelObjek";

const teksDari = (h: string) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const DATA: DataObjekAdmin = {
  sekarang: "2026-11-08T00:00:00Z",
  kegiatan: { id: 7, nama: "Survei X" },
  boleh_kelola: true,
  siap: true,
  model: 2,
  profil: { model: 2, variabel: ["nagari", "sls", "nama_sampel", "ppl", "pml", "bebas1"], label_bebas: { bebas1: "Jenis usaha" }, level: "sls" },
  alokasi_model1_aktif: false,
  rekap: { objek: 40, sampel: 55, wilayah: 6, ppl: 2, pml: 1, tanpa_petugas: 5 },
  hasil: { objek: 40, sampel: 55, didata: 20, menolak: 4, tidak_ditemukan: 1, belum: 15, sampel_didata: 31 },
  ringkas_ppl: [{ ppl_id: 1, ppl_nama: "Ani Putri", pml_nama: "Budi", objek: 20, sampel: 30, didata: 12, menolak: 2, tidak_ditemukan: 0, belum: 6, sampel_didata: 20 }],
  tanpa_petugas: 5,
  riwayat: [{ id: 3, nama_berkas: "sampel.xlsx", diunggah_at: "2026-11-08T01:00:00Z", oleh: "Iqbal", jumlah: 40, jumlah_sampel: 55, dengan_petugas: 35, aktif: true }],
  petugas: { ppl: 2, pml: 1 },
};

describe("ObjekSampel (Kelola)", () => {
  it("menampilkan profil, kolom templat, ringkasan dan hasil", () => {
    const t = teksDari(renderToString(<ObjekSampel kegiatanId={7} nama="Survei X" data={DATA} muat={async () => {}} />));
    for (const x of [
      "Daftar sampel", "Model 2", "tingkat wilayah Jorong/SLS", "satu baris = satu sampel", "Nagari, Jorong/SLS, Nama Sampel, Nama PPL, Nama PML, Jenis usaha",
      "Unduh templat Excel", "Pilih berkas Excel", "40 baris", "55 sampel", "6 wilayah", "2 PPL", "5 baris belum berpetugas",
      "20 didata (31 sampel)", "4 menolak", "1 tidak ditemukan", "15 belum dicatat", "Ani Putri", "Riwayat unggahan", "sampel.xlsx",
    ]) expect(t).toContain(x);
  });

  it("model 3 tanpa wilayah: tanpa chip wilayah", () => {
    const d: DataObjekAdmin = { ...DATA, model: 3, profil: { model: 3, variabel: ["jumlah", "ppl", "pml"], label_bebas: {}, level: null } };
    const t = teksDari(renderToString(<ObjekSampel kegiatanId={7} nama="Survei X" data={d} muat={async () => {}} />));
    expect(t).toContain("tanpa wilayah");
    expect(t).toContain("satu baris mewakili beberapa sampel");
    expect(t).not.toContain("6 wilayah");
  });

  it("tanpa akses kelola: pesan hanya lihat dan tombol pilih berkas nonaktif", () => {
    const h = renderToString(<ObjekSampel kegiatanId={7} nama="Survei X" data={{ ...DATA, boleh_kelola: false }} muat={async () => {}} />);
    expect(teksDari(h)).toContain("hanya dapat melihat");
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Pilih berkas Excel/);
  });

  it("daftar kosong: tanpa chip hasil dan tabel per PPL", () => {
    const d: DataObjekAdmin = { ...DATA, rekap: { objek: 0, sampel: 0, wilayah: 0, ppl: 0, pml: 0, tanpa_petugas: 0 }, hasil: { objek: 0, sampel: 0, didata: 0, menolak: 0, tidak_ditemukan: 0, belum: 0, sampel_didata: 0 }, ringkas_ppl: [], tanpa_petugas: 0, riwayat: [] };
    const t = teksDari(renderToString(<ObjekSampel kegiatanId={7} nama="Survei X" data={d} muat={async () => {}} />));
    expect(t).not.toContain("belum dicatat");
    expect(t).not.toContain("Per PPL saat ini");
    expect(t).not.toContain("Riwayat unggahan");
  });
});

describe("ModelSampel (Kelola)", () => {
  it("render awal sebelum data: kartu model dengan penanda memuat", () => {
    const t = teksDari(renderToString(<ModelSampel kegiatanId={7} nama="Survei X" />));
    expect(t).toContain("Model sampel");
    expect(t).toContain("Memuat");
  });
});
