// (22 Okt 2026) Uji susunan sidebar SIGAP v2: urutan kelompok mengikuti siklus kegiatan, syarat izin. (23 Okt 2026) Dokumen Induk v2: grup Referensi dihapus, alamat baru /sigap/kelola/monitoring.
import { describe, expect, it } from "vitest";
import { NAMA_PORTAL } from "../halaman";
import { NAMA_PAYUNG, susunMenu, URUTAN_KELOMPOK, type IzinMenuSidebar, type ItemMenu } from "../sigapMenuV2";

const SEMUA: IzinMenuSidebar = {
  tokenPetugas: "tok123",
  adaSubAdmin: true,
  perencanaan: true,
  pelatihanKelola: true,
  kontrak: true,
  pediaKelola: true,
  lapangan: true,
  pendataanKelola: true,
  akses: true,
  aplikasi: true,
  delego: true,
};
const KOSONG: IzinMenuSidebar = {
  tokenPetugas: null,
  adaSubAdmin: false,
  perencanaan: false,
  pelatihanKelola: false,
  kontrak: false,
  pediaKelola: false,
  lapangan: false,
  pendataanKelola: false,
  akses: false,
  aplikasi: false,
  delego: false,
};

const semuaItem = (i: IzinMenuSidebar): ItemMenu[] => susunMenu(i).flatMap((k) => k.item);
const cari = (i: IzinMenuSidebar, id: string) => semuaItem(i).find((x) => x.id === id);

describe("susunMenu v2", () => {
  it("urutan kelompok = siklus kegiatan, sama untuk akun berizin penuh maupun tanpa izin", () => {
    const label = ["Perencanaan", "Pelaksanaan", "Pengendalian", "Pertanggungjawaban", "Pengelolaan"];
    for (const izin of [SEMUA, KOSONG]) {
      const m = susunMenu(izin);
      expect(m.map((k) => k.kode)).toEqual(URUTAN_KELOMPOK);
      expect(m[0].label).toBeNull();
      expect(m.slice(1).map((k) => k.label)).toEqual(label);
    }
  });

  it("item Pendataan bertanda aktif untuk halaman Kelola Pendataan (23 Okt 2026)", () => {
    expect(cari(SEMUA, "pendataan")).toMatchObject({ href: "/sigap/kelola/pendataan", aktifKode: "pendataan_kelola" });
    expect(cari(KOSONG, "pendataan")).toBeUndefined();
  });

  it("Beranda selalu ada dan paling atas", () => {
    expect(susunMenu(KOSONG)[0].item[0]).toMatchObject({ id: "beranda", aksi: "beranda", aktifKode: "beranda" });
  });

  it("setiap kelompok punya minimal satu item (kelompok tidak pernah kosong)", () => {
    for (const izin of [SEMUA, KOSONG]) for (const k of susunMenu(izin)) expect(k.item.length).toBeGreaterThan(0);
  });

  it("id item unik dan tautan unik", () => {
    const item = semuaItem(SEMUA);
    expect(new Set(item.map((x) => x.id)).size).toBe(item.length);
    const href = item.map((x) => x.href).filter(Boolean) as string[];
    expect(new Set(href).size).toBe(href.length);
  });

  it("item 'segera' dan 'nonaktif' tidak punya tautan; item hidup selalu punya tautan atau aksi", () => {
    for (const izin of [SEMUA, KOSONG])
      for (const x of semuaItem(izin)) {
        if (x.status) expect(x.href).toBeUndefined();
        else expect(Boolean(x.href) || Boolean(x.aksi)).toBe(true);
      }
  });

  it("memakai alamat baru Monitoring dan tidak lagi menaut ke alamat lama yang dialihkan (lapangan, translok, admin)", () => {
    const href = semuaItem(SEMUA).map((x) => x.href).filter(Boolean) as string[];
    expect(href).toContain("/sigap/kelola/monitoring");
    expect(href).not.toContain("/sigap/kelola/lapangan");
    expect(href).not.toContain("/sigap/kelola/translok");
    expect(href).not.toContain("/sigap/admin");
    for (const h of href) expect(h.startsWith("/sigap/")).toBe(true);
    expect(href).toEqual(
      expect.arrayContaining([
        "/sigap/kelola/perencanaan",
        "/sigap/pelatihan",
        "/sigap/kelola/pelatihan",
        "/sigap/kelola/pendataan",
        "/sigap/translok/tok123",
        "/sigap/kelola/pengadaan",
        "/sigap/kelola/monitoring",
        "/sigap/kelola/akses",
        "/sigap/kelola/aplikasi",
        "/sigap/kelola/delego",
        "/sigap/pedia",
        "/sigap/kelola/pedia",
      ])
    );
  });

  it("tanpa izin apa pun: hanya Beranda, SIGAP PEDIA, dan item segera/nonaktif", () => {
    const hidup = semuaItem(KOSONG).filter((x) => !x.status);
    expect(hidup.map((x) => x.id)).toEqual(["beranda", "anggaran", "pedia"]);
  });

  it("izin pelatihan: halaman peserta tampil untuk petugas, Kelola pelatihan hanya untuk pengelola", () => {
    expect(cari({ ...KOSONG, tokenPetugas: "t" }, "pelatihan")).toBeDefined();
    expect(cari({ ...KOSONG, tokenPetugas: "t" }, "pelatihan-kelola")).toBeUndefined();
    expect(cari({ ...KOSONG, pelatihanKelola: true }, "pelatihan")).toBeDefined();
    expect(cari({ ...KOSONG, pelatihanKelola: true }, "pelatihan-kelola")).toMatchObject({ href: "/sigap/kelola/pelatihan", aktifKode: "pelatihan_kelola" });
    expect(cari(KOSONG, "pelatihan")).toBeUndefined();
  });

  it("Transport lokal: tautan ke halaman petugas bila punya penugasan, selain itu nonaktif", () => {
    expect(cari(SEMUA, "transport-lokal")).toMatchObject({ href: "/sigap/translok/tok123" });
    expect(cari(KOSONG, "transport-lokal")).toMatchObject({ status: "nonaktif" });
  });

  it("Pengadaan: tautan bila punya izin kontrak, selain itu nonaktif", () => {
    expect(cari(SEMUA, "pengadaan")).toMatchObject({ href: "/sigap/kelola/pengadaan", aktifKode: "kontrak" });
    expect(cari(KOSONG, "pengadaan")).toMatchObject({ status: "nonaktif" });
  });

  it("Administrasi & SPJ di kelompok Pertanggungjawaban: induk sub-menu admin transport bila ada sub-menu, selain itu segera", () => {
    const k = susunMenu(SEMUA).find((x) => x.kode === "pertanggungjawaban")!;
    expect(k.item.map((x) => x.id)).toEqual(["administrasi-spj", "audit-bukti"]);
    expect(k.item[0].aksi).toBe("admin_transport");
    expect(cari(KOSONG, "administrasi-spj")).toMatchObject({ status: "segera" });
  });

  it("Audit dan bukti: membuka Register & arsip bukti bagi pengelola PEDIA, selain itu segera (Referensi dihapus)", () => {
    expect(cari(SEMUA, "audit-bukti")).toMatchObject({ href: "/sigap/kelola/pedia", aktifKode: "pedia_kelola" });
    expect(cari(KOSONG, "audit-bukti")).toMatchObject({ status: "segera" });
    expect(cari({ ...KOSONG, pediaKelola: true }, "audit-bukti")).toMatchObject({ href: "/sigap/kelola/pedia" });
    expect(susunMenu(SEMUA).some((k) => (k.kode as string) === "referensi")).toBe(false);
  });

  it("Monitoring (lapangan) di Pengendalian hanya bila ada izin; Ruang keputusan masih segera", () => {
    expect(cari(SEMUA, "monitoring")).toMatchObject({ href: "/sigap/kelola/monitoring" });
    expect(cari(KOSONG, "monitoring")).toBeUndefined();
    expect(cari(KOSONG, "ruang-keputusan")).toMatchObject({ status: "segera" });
  });

  it("Pengelolaan memuat SDM & Mitra, Tata kelola, SIGAP PEDIA, Kantor, Diseminasi lalu item pengaturan sesuai izin", () => {
    const k = susunMenu(SEMUA).find((x) => x.kode === "pengelolaan")!;
    expect(k.item.map((x) => x.id)).toEqual(["sdm-mitra", "tata-kelola", "pedia", "kantor", "diseminasi", "peran-akses", "aplikasi-periode", "delego"]);
    const kosong = susunMenu(KOSONG).find((x) => x.kode === "pengelolaan")!;
    expect(kosong.item.map((x) => x.id)).toEqual(["sdm-mitra", "tata-kelola", "pedia", "kantor", "diseminasi"]);
  });

  it("Perencanaan: Alur GSBPM hanya untuk Admin Aplikasi; Anggaran terbuka untuk semua", () => {
    expect(cari(SEMUA, "alur-gsbpm")).toMatchObject({ href: "/sigap/kelola/perencanaan", aktifKode: "perencanaan" });
    expect(cari(KOSONG, "alur-gsbpm")).toBeUndefined();
    expect(cari(KOSONG, "anggaran")).toMatchObject({ href: "/sigap/ro", aktifKode: "anggaran" });
    expect(cari(KOSONG, "anggaran")?.status).toBeUndefined();
  });
});

describe("nama payung", () => {
  it("sama dengan nama portal dan tidak lagi memakai nama modul anggaran lama", () => {
    expect(NAMA_PORTAL).toContain(NAMA_PAYUNG);
    expect(NAMA_PAYUNG).not.toMatch(/Gerak Anggaran/i);
  });
});
