import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { susunAnggaran } from "@/lib/keu/ro";

const st = vi.hoisted(() => ({ galatNiat: null as string | null, niat: [] as unknown[], boleh: true as boolean | null, memuat: false, bayar: [] as unknown[], bayarTersedia: true, antrean: [] as unknown[] }));
const lembar = (id: number, komp: string, akun: string, uraian: string, volume: number, jumlah: number) => ({ detail_id: id, ro_kode: "2906.BMA.006", komponen_kode: komp, akun_kode: akun, kunci_stabil: `K${id}`, nomor_item: null, uraian, volume, satuan: "OK", jumlah });
const L = [lembar(1, "005", "521213", "honor A", 10, 10_000_000), lembar(2, "051", "524119", "pelatihan", 2, 8_000_000), lembar(3, "051", "521211", "bahan", 2, 3_000_000)];
const ANG = susunAnggaran(L, [{ detail_id: 1, real_sd: 0, pagu: 10_000_000 }], [
  { pok_kunci: "K1", baru: false, status: "rinci", jumlah_rab: 20_000_000, selesai: false },
  { pok_kunci: "K2", baru: false, status: "rinci", jumlah_rab: 2_000_000, selesai: false },
  { pok_kunci: "KB", baru: true, status: "rinci", jumlah_rab: 4_715_000, selesai: false, uraian: "paket fullday", akun_kode: "524114" } as never,
]);
vi.mock("@/app/sigap/keu-ui", () => ({
  Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>, Galat: () => null, judulKartu: "j", kartu: "k", kisi: "g", Kosong: () => null,
  Kpi: ({ label, nilai, sub }: { label: string; nilai: unknown; sub?: unknown }) => <div>{label} {nilai as never} {sub as never}</div>, Memuat: () => null, Potong: () => null, tombolKecil: "t", tombolAktif: "ta",
  Catatan: ({ children }: { children: unknown }) => <div>{children as never}</div>, kolom: "kl", label: "lb", tombolBahaya: "tb", tombolUtama: "tu",
}));
vi.mock("@/lib/keu/revisi", () => ({}));
vi.mock("@/app/sigap/ro/useKeu", () => ({
  useAnggaranRo: () => ({
    anggaran: ANG, itemBaru: [{ jumlah_rab: 4_715_000, uraian: "paket fullday", akun_kode: "524114" }], rab: { rab_id: 7, ro_kode: "2906.BMA.006", nomor: 1, status: "draf" }, sampaiTanggal: "2026-10-31", memuat: false, galat: null, terpotong: false,
    bayar: st.bayar, bayarTersedia: st.bayarTersedia, barisRab: [{ baris_id: 1, item_id: 10, pok_kunci: "K1", ket: "Honor PPL Seruti", jumlah: 20_000_000, rab_id: 7 }], antrean: st.antrean, hariIni: "2026-11-07", muatBayar: async () => {},
  }),
  useBoleh: () => st.boleh, tulisKeuKlien: async () => ({ ok: true, data: {} }),
  useBacaKeu: (url: string | null) => ({
    baris: url?.includes("keu_niat_butir") ? (st.galatNiat ? null : st.niat) : url?.includes("keu_ro") ? [{ kode: "2906.BMA.006", nama: "Publikasi Survei" }] : url?.includes("keu_master_akun") ? [{ kode: "521213", nama: "Belanja Honor" }] : null,
    memuat: url?.includes("keu_niat_butir") ? st.memuat : false, galat: url?.includes("pok_struktur") ? "belum ada" : url?.includes("keu_niat_butir") ? st.galatNiat : null, terpotong: false, muat: async () => {},
  }),
}));
import { TabAnggaran } from "@/app/sigap/ro/[kode]/Tab";
import { TabPembayaran } from "@/app/sigap/ro/[kode]/Pembayaran";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");

describe("TabAnggaran", () => {
  it("render dasar: kolom, Kartu Gap, item baru", () => {
    const teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    for (const k of ["RAB belum dibayar", "Gap anggaran RO", "Kebutuhan", "Belum dikaji", "Neraca RO", "TANPA SUB KOMPONEN", "Belanja Honor", "Item baru di RAB", "paket fullday"]) expect(teks).toContain(k);
    expect(teks).not.toContain("Sisa kebutuhan");
  });
  it("Rencana tindakan: butir kurang dan lebih, pilihan bawaan, neraca", () => {
    st.galatNiat = null; st.niat = []; st.boleh = true;
    const teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    for (const k of ["Rencana tindakan per butir", "Butir kurang", "Butir berlebih", "Tambal dari donor", "Lepas sebagai donor", "Minta tambahan pagu", "(pilihan bawaan)", "Neraca rencana", "Perubahan pagu RO"]) expect(teks).toContain(k);
    console.log(teks.slice(teks.indexOf("Rencana tindakan per butir"), teks.indexOf("Rencana tindakan per butir") + 1600));
  });
  it("pilihan tersimpan memengaruhi neraca; tanpa hak ada keterangan", () => {
    st.niat = [{ pok_kunci: "K2", niat: "lepas", jumlah: "6000000" }, { pok_kunci: "K1", niat: "tambal", jumlah: "6000000" }]; st.boleh = false;
    const teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    expect(teks).toContain("Hanya ketua tim dan admin RO yang dapat mengubah rencana");
    expect(teks).toContain("Dilepas (donor) Rp 6.000.000");
    expect(teks).toContain("Dibutuhkan sumber Rp 10.715.000");
  });
  it("tabel niat belum ada: catatan, tanpa kontrol", () => {
    st.galatNiat = "relation does not exist";
    const teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    expect(teks).toContain("belum dapat disimpan karena tabelnya belum tersedia");
    expect(teks).not.toContain("Butir kurang");
  });
  it("selama memuat: tanpa kontrol", () => {
    st.galatNiat = null; st.memuat = true;
    const teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    st.memuat = false;
    expect(teks).toContain("Memuat rencana tindakan");
    expect(teks).not.toContain("Tambal dari donor");
  });
});

const TUNGGAK = { baris_id: 1, item_id: 10, pok_kunci: "K1", ket: "Honor PPL Seruti", jumlahBaris: 20_000_000, sisa: 20_000_000, tunggak: 10_000_000, tertua: "2026-11-07", hari: 3 };
const BAYAR = { id: 1, ro_kode: "2906.BMA.006", rab_id: 7, rab_item_id: 10, rab_baris_id: 1, pok_kunci: "K1", jenis: "bayar", tanggal: "2026-11-05", jumlah: "5000000", menutup: false, status: "dicatat", nomor_ref: "SPM-17", tautan: null, catatan: null, dibatalkan_at: null, alasan_batal: null };
const reset = () => { st.bayar = []; st.bayarTersedia = true; st.antrean = []; st.boleh = true; st.galatNiat = null; st.niat = []; st.memuat = false; };

describe("TabPembayaran", () => {
  it("antrean, form, dan KPI tampil bagi yang berwenang", () => {
    reset(); st.antrean = [TUNGGAK];
    const teks = teksDari(renderToString(<TabPembayaran kode="2906.BMA.006" />));
    for (const k of ["Pembayaran: catatan PJ Administrasi", "Jatuh tempo belum dicatat", "Dicatat, belum tampak di SAKTI", "Tanpa bukti dukung", "Catat pembayaran", "Honor PPL Seruti", "terlambat 3 hari", "Belum ada catatan pembayaran untuk RO ini."]) expect(teks).toContain(k);
    expect(teks).toContain("Rp 10.000.000");
  });
  it("daftar catatan: tanpa tautan ada penanda dan aksi; dengan tautan ada pintasan buka", () => {
    reset(); st.bayar = [BAYAR];
    let teks = teksDari(renderToString(<TabPembayaran kode="2906.BMA.006" />));
    for (const k of ["Belum ada bukti dukung", "Tautkan bukti", "Tandai tercermin di SAKTI", "Batalkan catatan", "dibayar bertahap", "SPM-17", "05/11/2026"]) expect(teks).toContain(k);
    st.bayar = [{ ...BAYAR, tautan: "https://drive.google.com/drive/folders/abc", status: "tercermin", menutup: true }];
    const html = renderToString(<TabPembayaran kode="2906.BMA.006" />);
    teks = teksDari(html);
    expect(teks).toContain("Buka bukti dukung");
    expect(teks).toContain("Kembalikan ke dicatat");
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("catatan dibatalkan tampil redup tanpa aksi dan tidak dihitung", () => {
    reset(); st.bayar = [{ ...BAYAR, dibatalkan_at: "2026-11-06T01:00:00Z", alasan_batal: "salah input" }];
    const teks = teksDari(renderToString(<TabPembayaran kode="2906.BMA.006" />));
    expect(teks).toContain("Dibatalkan");
    expect(teks).toContain("dibatalkan: salah input");
    expect(teks).not.toContain("Batalkan catatan");
    expect(teks).toContain("Catatan pembayaran (0)");
  });
  it("tanpa hak: hanya melihat", () => {
    reset(); st.boleh = false; st.bayar = [BAYAR]; st.antrean = [TUNGGAK];
    const teks = teksDari(renderToString(<TabPembayaran kode="2906.BMA.006" />));
    expect(teks).toContain("Hanya PJ Administrasi dan PPK yang dapat mencatat pembayaran");
    expect(teks).not.toContain("Simpan pembayaran");
    expect(teks).not.toContain("Tautkan bukti");
    expect(teks).not.toContain("Batalkan catatan");
  });
  it("tabel belum ada: catatan, tanpa form", () => {
    reset(); st.bayarTersedia = false;
    const teks = teksDari(renderToString(<TabPembayaran kode="2906.BMA.006" />));
    expect(teks).toContain("20261107d_catat_pembayaran.sql belum dijalankan");
    expect(teks).not.toContain("Catat pembayaran");
  });
  it("Kartu Gap: angka sementara bila ada jatuh tempo belum dicatat; catatan bila tabel belum ada", () => {
    reset(); st.antrean = [TUNGGAK];
    let teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    expect(teks).toContain("Angka sementara: 1 baris RAB sudah jatuh tempo tetapi belum dicatat pembayarannya (Rp 10.000.000)");
    reset(); st.bayarTersedia = false;
    teks = teksDari(renderToString(<TabAnggaran kode="2906.BMA.006" />));
    expect(teks).toContain("Catatan pembayaran belum tersedia");
    expect(teks).not.toContain("Angka sementara");
  });
});
