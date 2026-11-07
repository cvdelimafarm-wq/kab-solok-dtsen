import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const st = vi.hoisted(() => ({ kk: [] as unknown[] | null, niat: [] as unknown[] | null, anggaran: null as unknown }));
vi.mock("@/app/sigap/keu-ui", () => ({
  Catatan: ({ children }: { children: unknown }) => <p>{children as never}</p>, Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>, Memuat: () => <b>memuat</b>,
  judulKartu: "j", kartu: "k", tombolUtama: "tu",
}));
vi.mock("@/app/sigap/ro/useKeu", () => ({
  aksiKeu: async () => ({ ok: true, data: [] }), tulisKeuKlien: async () => ({ ok: true, data: {} }),
  useAnggaranRo: () => ({ anggaran: st.anggaran, galat: null }),
  useBacaKeu: (u: string | null) => {
    const baris = u && u.includes("keu_niat_butir") ? st.niat : st.kk;
    return { baris, memuat: baris === null, galat: null, terpotong: false, muat: async () => {} };
  },
}));
import KartuIsiNiat from "@/app/sigap/revisi/kertas/KartuIsiNiat";

const teks = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const anggaran = [{
  komponen: "052", pok: 1000000, realisasi: 0, rab: 600000,
  akun: [{ akun: "524113", pok: 1000000, realisasi: 0, rab: 600000, item: [
    { detail_id: 1, kunci: "k1", komponen: "052", akun: "524113", nomor_item: "1", uraian: "Pengawasan", volume: 10, satuan: "OK", pok: 1000000, realisasi: 0, rab: 600000, statusRab: "rinci", selesai: false },
  ] }],
}];
const barisKk = (o: Record<string, unknown> = {}) => ({
  id: 11, jadwal_id: 2, ro_kode: "2906.BMA.006", kro: "2906.BMA", detail_id: 1, pok_kunci: "k1", komponen_kode: "052", akun_semula: "524113", akun_menjadi: "524113", uraian_semula: "Pengawasan", uraian_menjadi: "Pengawasan",
  vol_semula: 10, vol_menjadi: 10, sat_semula: "OK", sat_menjadi: "OK", harga_semula: 100000, harga_menjadi: 100000, jumlah_semula: 1000000, jumlah_menjadi: 1000000, selisih: 0,
  pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: 1, pemicu: null, ...o,
});
const gambar = (bisa = true) => teks(renderToString(<KartuIsiNiat jadwal={2} ro="2906.BMA.006" bisa={bisa} sesudah={async () => {}} />));

describe("KartuIsiNiat", () => {
  it("memuat", () => {
    st.kk = null; st.niat = null; st.anggaran = null;
    expect(gambar()).toContain("memuat");
  });
  it("tanpa rencana berjumlah: tidak menampilkan apa pun", () => {
    st.kk = []; st.niat = []; st.anggaran = anggaran;
    expect(renderToString(<KartuIsiNiat jadwal={2} ro="2906.BMA.006" bisa sesudah={async () => {}} />)).toBe("");
  });
  it("kertas kerja belum dimuat: ajakan memuat baris POK", () => {
    st.kk = []; st.niat = [{ ro_kode: "2906.BMA.006", pok_kunci: "k1", niat: "lepas", jumlah: 350000, catatan: null }]; st.anggaran = anggaran;
    const h = gambar();
    expect(h).toContain("belum dimuat");
    expect(h).toContain("Muat baris POK RO ini");
  });
  it("rencana Lepas: daftar langkah dan tombol Isi", () => {
    st.kk = [barisKk()]; st.niat = [{ ro_kode: "2906.BMA.006", pok_kunci: "k1", niat: "lepas", jumlah: 350000, catatan: null }]; st.anggaran = anggaran;
    const h = gambar();
    for (const k of ["1 baris siap diisi", "Pengawasan", "vol 10 → 7", "Isi ke kertas kerja", "dilepas Rp 300.000"]) expect(h).toContain(k);
  });
  it("tanpa hak: tombol Isi tetap ada tetapi dijelaskan", () => {
    st.kk = [barisKk()]; st.niat = [{ ro_kode: "2906.BMA.006", pok_kunci: "k1", niat: "lepas", jumlah: 350000, catatan: null }]; st.anggaran = anggaran;
    expect(gambar(false)).toContain("tidak memiliki hak");
  });
  it("baris sudah diubah: dilewati, tanpa tombol Isi", () => {
    st.kk = [barisKk({ vol_menjadi: 7, jumlah_menjadi: 700000 })]; st.niat = [{ ro_kode: "2906.BMA.006", pok_kunci: "k1", niat: "lepas", jumlah: 350000, catatan: null }]; st.anggaran = anggaran;
    const h = gambar();
    expect(h).toContain("1 butir dilewati");
    expect(h).not.toContain("Isi ke kertas kerja");
  });
});
