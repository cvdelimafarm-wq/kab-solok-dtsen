import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { TanggapanSaya } from "@/lib/keu/siklusRevisi";

const st = vi.hoisted(() => ({ jalur: "/sigap/delego/saya" }));
vi.mock("next/navigation", () => ({ usePathname: () => st.jalur, useRouter: () => ({ push: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
vi.mock("@/app/sigap/keu-ui", () => ({
  Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>, Galat: ({ pesan }: { pesan: unknown }) => <i>{String(pesan ?? "")}</i>, Kosong: ({ teks }: { teks: string }) => <p>{teks}</p>, Memuat: () => <b>memuat</b>,
  HalamanKeu: ({ judul, children }: { judul: unknown; children: unknown }) => <main><h1>{judul as never}</h1>{children as never}</main>,
  caps: "c", judulKartu: "j", kartu: "k", kolom: "kl", label: "lb", tombolBahaya: "tb", tombolKecil: "t", tombolUtama: "tu",
}));
vi.mock("@/app/sigap/ro/useKeu", () => ({ aksiKeu: async () => ({ ok: true, data: [] }) }));
import { BarisTanggapan, ModalTanggapanRevisi } from "@/app/sigap/revisi/tanggapan/TanggapanRevisi";
import HalamanTanggapan from "@/app/sigap/revisi/tanggapan/page";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const dasar = (o: Partial<TanggapanSaya> = {}): TanggapanSaya => ({
  jadwal_id: 2, judul: "Revisi POK Nov", jenis: "pok", tutup: "2099-12-31", ro_kode: "2906.BMA.006", status: "belum", tunda_kali: 0, sisa_tunda: 2, ingat_at: null,
  jatuh_tempo: false, oleh: null, oleh_nama: null, oleh_saya: null, alasan: null, ada_kurang: false, sudah_usulan: false, masih_buka: true, wajib: true, ...o,
});
const gambar = (t: TanggapanSaya) => teksDari(renderToString(<BarisTanggapan t={t} sesudah={async () => {}} />));

describe("BarisTanggapan", () => {
  it("belum ditanggapi: tiga pilihan", () => {
    const h = gambar(dasar());
    for (const k of ["2906.BMA.006", "Belum ditanggapi", "Ajukan sekarang", "Ingatkan saya", "Tidak mengusulkan revisi"]) expect(h).toContain(k);
  });
  it("penundaan habis: tanpa Ingatkan saya, ada keterangan", () => {
    const h = gambar(dasar({ status: "ingat", tunda_kali: 2, sisa_tunda: 0, oleh_saya: true, jatuh_tempo: true, ingat_at: "2026-11-09T08:00:00+07:00" }));
    expect(h).toContain("Saatnya menanggapi");
    expect(h).toContain("Ajukan sekarang");
    expect(h).not.toContain("Ingatkan saya");
    expect(h).toContain("Penundaan sudah dipakai habis");
  });
  it("diingatkan, belum jatuh tempo: menampilkan waktu dan sisa tunda", () => {
    const h = gambar(dasar({ status: "ingat", tunda_kali: 1, sisa_tunda: 1, oleh_saya: true, jatuh_tempo: false, ingat_at: "2026-11-09T08:00:00+07:00" }));
    expect(h).toContain("Diingatkan Sen, 9 Nov 08.00 WIB");
    expect(h).toContain("Dapat ditunda 1 kali lagi");
  });
  it("sudah ditanggapi rekan: tanpa tombol pilihan", () => {
    const h = gambar(dasar({ status: "ajukan", oleh_saya: false, oleh_nama: "Wakil A", wajib: false }));
    expect(h).toContain("Diajukan oleh Wakil A");
    expect(h).not.toContain("Ingatkan saya");
    expect(h).not.toContain("Tidak mengusulkan revisi");
  });
  it("tidak mengusulkan: alasan, penanda butir kurang, buka kembali", () => {
    const h = gambar(dasar({ status: "tidak", oleh_saya: true, alasan: "Tidak ada perubahan pagu", ada_kurang: true, wajib: false }));
    for (const k of ["Anda memilih tidak mengusulkan", "Alasan: Tidak ada perubahan pagu", "Ada butir kurang belum terdanai", "Buka kembali"]) expect(h).toContain(k);
  });
  it("ajukan oleh saya: tautan kertas kerja", () => {
    const h = renderToString(<BarisTanggapan t={dasar({ status: "ajukan", oleh_saya: true, wajib: false })} sesudah={async () => {}} />);
    expect(h).toContain("/sigap/revisi/kertas?jadwal=2&amp;kro=2906.BMA");
  });
});

describe("ModalTanggapanRevisi dan halaman", () => {
  it("modal tidak menggambar apa pun sebelum data dimuat", () => {
    expect(renderToString(<ModalTanggapanRevisi />)).toBe("");
  });
  it("modal tidak tampil di halaman Tanggapan sendiri", () => {
    st.jalur = "/sigap/revisi/tanggapan";
    expect(renderToString(<ModalTanggapanRevisi />)).toBe("");
    st.jalur = "/sigap/delego/saya";
  });
  it("halaman: judul dan keadaan memuat", () => {
    const h = teksDari(renderToString(<HalamanTanggapan />));
    expect(h).toContain("Tanggapan siklus revisi");
    expect(h).toContain("memuat");
  });
});
