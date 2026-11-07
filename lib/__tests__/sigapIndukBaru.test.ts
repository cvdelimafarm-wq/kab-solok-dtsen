import { describe, expect, it } from "vitest";
import { kegiatanTanpaInduk, kodeIndukDariNama, susunIndukBaru } from "@/lib/sigapIndukBaru";
import { periksaTahapAdmin } from "@/lib/sigapTahap";

// data nyata 7 Nov 2026 (kegiatan 1..8) dan induk pascabencana [1,3], spdt_ntp [2,5], seruti_tw4 [6,7]
const KEG = [
  { id: 1, nama: "Pendataan Pascabencana 2026", jenis: "pendataan", aktif: true },
  { id: 2, nama: "SPDT NTP 2026", jenis: "pendataan", aktif: true },
  { id: 4, nama: "UJI Fiktif Pelaksanaan", jenis: "pendataan", aktif: false },
  { id: 6, nama: "Seruti Triwulan IV 2026", jenis: "pendataan", aktif: true },
  { id: 9, nama: "IMK 2026", jenis: "pendataan", aktif: true },
  { id: 10, nama: "Pelatihan Sakernas TW IV", jenis: "pelatihan", aktif: true },
];
const INDUK = [{ kegiatan_ids: ["1", "3"] }, { kegiatan_ids: ["2", "5"] }, { kegiatan_ids: ["6", "7"] }];

describe("kegiatanTanpaInduk", () => {
  it("hanya kegiatan aktif yang punya penugasan aktif dan belum di induk mana pun", () => {
    const pen = new Map([[1, 100], [2, 59], [6, 23], [9, 12], [10, 0]]);
    expect(kegiatanTanpaInduk(KEG, pen, INDUK)).toEqual([{ id: 9, nama: "IMK 2026", jenis: "pendataan", penugasan: 12 }]);
  });
  it("kegiatan nonaktif atau tanpa penugasan tidak diperingatkan", () => {
    expect(kegiatanTanpaInduk(KEG, new Map([[4, 5], [10, 0]]), INDUK)).toEqual([]);
  });
  it("id induk bertipe string (bigint[] dari PostgREST) tetap dikenali", () => {
    expect(kegiatanTanpaInduk([{ id: 6, nama: "S", aktif: true }], new Map([[6, 3]]), [{ kegiatan_ids: ["6"] }])).toEqual([]);
  });
});

describe("kodeIndukDariNama", () => {
  it("huruf kecil, angka, garis bawah, dan sah untuk kode induk", () => {
    expect(kodeIndukDariNama("IMK 2026 (Triwulan I)", new Set())).toBe("imk_2026_triwulan_i");
  });
  it("tidak kembar", () => {
    expect(kodeIndukDariNama("IMK 2026", new Set(["imk_2026", "imk_2026_2"]))).toBe("imk_2026_3");
  });
  it("nama tanpa huruf atau angka: kode bawaan", () => {
    expect(kodeIndukDariNama("!!!", new Set())).toBe("kegiatan");
  });
  it("dibatasi panjangnya", () => {
    expect(kodeIndukDariNama("a".repeat(80), new Set()).length).toBeLessThanOrEqual(26);
  });
});

describe("susunIndukBaru", () => {
  it("pendataan: satu tahap Pendataan berisi hanya Transport Lokal kegiatan itu, lolos periksaTahapAdmin", () => {
    const r = susunIndukBaru(KEG[4], new Set(["pascabencana"]), 3);
    if (!r.ok) throw new Error(r.pesan);
    expect(r.baru.induk).toMatchObject({ kode: "imk_2026", nama: "IMK 2026", kegiatan_ids: [9], urutan: 4, aktif: true });
    expect(r.baru.tahap).toHaveLength(1);
    expect(r.baru.tahap[0]).toMatchObject({ kode: "pendataan", isi: ["translok:9"], buka_mode: "langsung", aktif: true, urutan: 1 });
    expect(periksaTahapAdmin(r.baru.tahap[0], r.baru.induk.kegiatan_ids)).toBeNull();
  });
  it("pelatihan: Pelatihan + Transport Lokal (sama dengan tahap pelatihan Seruti)", () => {
    const r = susunIndukBaru(KEG[5], new Set(), 0);
    if (!r.ok) throw new Error(r.pesan);
    expect(r.baru.tahap[0]).toMatchObject({ kode: "pelatihan", nama: "Pelatihan", isi: ["pelatihan", "translok:10"] });
  });
  it("jenis lain: tahap Pelaksanaan", () => {
    const r = susunIndukBaru({ id: 11, nama: "Rapat", jenis: null }, new Set(), 0);
    if (!r.ok) throw new Error(r.pesan);
    expect(r.baru.tahap[0]).toMatchObject({ kode: "pelaksanaan", isi: ["translok:11"] });
  });
  it("nama panjang dipendekkan untuk kartu; nama kosong ditolak", () => {
    const r = susunIndukBaru({ id: 12, nama: "Survei Panjang Sekali Dengan Nama Yang Tidak Muat Di Kartu", jenis: "pendataan" }, new Set(), 0);
    if (!r.ok) throw new Error(r.pesan);
    expect(r.baru.induk.pendek.length).toBeLessThanOrEqual(28);
    expect(susunIndukBaru({ id: 13, nama: "  ", jenis: null }, new Set(), 0).ok).toBe(false);
  });
});

describe("pemasangan (pemindaian sumber)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const baca = (rel: string) => require("node:fs").readFileSync(require("node:path").resolve(__dirname, "..", "..", rel), "utf8") as string;
  it("API: buat_induk dicek sudah/belum masuk induk, membersihkan induk bila tahap gagal, dan dicatat di audit", () => {
    const src = baca("app/api/portal/admin/tahap/route.ts");
    const b = src.slice(src.indexOf('body.aksi === "buat_induk"'), src.indexOf("const indukKode"));
    expect(b).toMatch(/sudah menjadi bagian dari sebuah induk/);
    expect(b).toMatch(/from\("sigap_induk"\)\.delete\(\)/);
    expect(b).toMatch(/catatAudit\(db, akun\.id, "induk\.buat"/);
    expect(src).toMatch(/tanpa_induk/);
  });
  it("API: aksi buat_induk berada di belakang izin portal.kelola", () => {
    const src = baca("app/api/portal/admin/tahap/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.indexOf('boleh(izin, "portal.kelola", "kelola")')).toBeGreaterThan(-1);
    expect(post.indexOf('boleh(izin, "portal.kelola", "kelola")')).toBeLessThan(post.indexOf('"buat_induk"'));
  });
  it("halaman: tombol Buat induk memanggil aksi buat_induk dan memilih induk baru", () => {
    const src = baca("app/portal/admin/tahap/page.tsx");
    expect(src).toMatch(/aksi: "buat_induk"/);
    expect(src).toMatch(/kodeRef\.current = r\.kode/);
  });
});
