import { describe, expect, it } from "vitest";
import { kunciNama, susunKesehatanOrang, type AkunMaster, type PoolMaster, type ProfilMaster } from "../masterOrang";

const a = (id: number, nama: string, o: Partial<AkunMaster> = {}): AkunMaster => ({ id, nama, jenis: "mitra", aktif: true, magang: false, alamat_kecamatan: "KUBUNG", sudah_masuk: true, ...o });
const p = (akun_id: number, o: Partial<PoolMaster> = {}): PoolMaster => ({ akun_id, tahun: 2026, status: "aktif", ...o });
const pr = (id: number, akun_id: number | null, nama = `Pegawai ${id}`): ProfilMaster => ({ id, akun_id, nama_lengkap: nama });
const cari = (d: ReturnType<typeof susunKesehatanOrang>, kode: string) => d.temuan.find((t) => t.kode === kode);

describe("kunciNama", () => {
  it("menyamakan huruf, aksen, tanda baca, dan spasi", () => {
    expect(kunciNama("  Desi   RATNA-sari. ")).toBe("desi ratna sari");
    expect(kunciNama("Éfi")).toBe("efi");
  });
});

describe("susunKesehatanOrang", () => {
  it("data bersih: tidak ada temuan, ringkasan benar", () => {
    const d = susunKesehatanOrang([a(1, "Ani"), a(2, "Budi", { jenis: "organik" })], [p(1)], [pr(1, 2)], 2026);
    expect(d.siap).toBe(true);
    expect(d.temuan).toEqual([]);
    expect(d.ringkas).toMatchObject({ mitra_aktif: 1, pool_aktif: 1, organik_aktif: 1, profil_pegawai: 1, akun_nonaktif: 0 });
  });
  it("mitra aktif tanpa pool tahun ini (pool tahun lain dan pool nonaktif tidak dihitung)", () => {
    const d = susunKesehatanOrang([a(1, "Ani"), a(2, "Budi"), a(3, "Citra"), a(4, "Dewi", { aktif: false })], [p(1), p(2, { tahun: 2025 }), p(3, { status: "nonaktif" })], [], 2026);
    expect(cari(d, "mitra_tanpa_pool")?.contoh.map((x) => x.nama)).toEqual(["Budi", "Citra"]);
    expect(d.ringkas).toMatchObject({ pool_aktif: 1, pool_nonaktif: 1, akun_nonaktif: 1 });
  });
  it("anggota pool aktif yang akunnya nonaktif, bukan mitra, atau hilang", () => {
    const d = susunKesehatanOrang([a(1, "Ani", { aktif: false }), a(2, "Budi", { jenis: "organik" }), a(3, "Citra")], [p(1), p(2), p(3), p(99)], [pr(1, 2)], 2026);
    const t = cari(d, "pool_tak_sah");
    expect(t?.jumlah).toBe(3);
    expect(t?.contoh.map((x) => x.ket).join("|")).toMatch(/akun nonaktif/);
    expect(t?.contoh.map((x) => x.ket).join("|")).toMatch(/jenis organik/);
    expect(t?.contoh.map((x) => x.nama).join("|")).toMatch(/tidak ditemukan/);
  });
  it("organik tanpa profil: magang dikecualikan; profil tanpa akun aktif ditandai", () => {
    const d = susunKesehatanOrang(
      [a(1, "Organik Tanpa Profil", { jenis: "organik" }), a(2, "Magang", { jenis: "organik", magang: true }), a(3, "Organik Sah", { jenis: "organik" }), a(4, "Akun Mati", { jenis: "organik", aktif: false })],
      [], [pr(1, 3, "Organik Sah"), pr(2, null, "Tanpa Akun"), pr(3, 4, "Akun Mati")], 2026,
    );
    expect(cari(d, "organik_tanpa_profil")?.contoh.map((x) => x.nama)).toEqual(["Organik Tanpa Profil"]);
    expect(cari(d, "profil_tanpa_akun")?.contoh.map((x) => x.nama).sort()).toEqual(["Akun Mati", "Tanpa Akun"]);
    expect(d.ringkas.organik_magang).toBe(1);
  });
  it("nama kembar hanya di antara akun aktif", () => {
    const d = susunKesehatanOrang([a(1, "Desi Ratna Sari"), a(2, "desi  ratna sari", { alamat_kecamatan: "GUNUNG TALANG" }), a(3, "Desi Ratna Sari", { aktif: false }), a(4, "Lain")], [p(1), p(2), p(4)], [], 2026);
    const t = cari(d, "nama_kembar");
    expect(t?.jumlah).toBe(2);
    expect(t?.contoh.map((x) => x.id).sort()).toEqual([1, 2]);
  });
  it("tanpa kecamatan dan belum pernah masuk dihitung; contoh dibatasi 12", () => {
    const akun = Array.from({ length: 30 }, (_, i) => a(i + 1, `Orang ${String(i).padStart(2, "0")}`, { alamat_kecamatan: i % 2 ? "  " : null, sudah_masuk: i < 10 }));
    const d = susunKesehatanOrang(akun, akun.map((x) => p(x.id)), [], 2026);
    const t = cari(d, "tanpa_kecamatan");
    expect(t?.jumlah).toBe(30);
    expect(t?.contoh).toHaveLength(12);
    expect(t?.tingkat).toBe("info");
    expect(d.ringkas.belum_pernah_masuk).toBe(20);
  });
  it("tidak membawa data pribadi ke keluaran", () => {
    const d = susunKesehatanOrang([a(1, "Ani")], [], [], 2026);
    const kunci = new Set<string>();
    const telusur = (x: unknown) => { if (Array.isArray(x)) x.forEach(telusur); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { kunci.add(k); telusur(v); } };
    telusur(d);
    for (const larang of ["nik", "nip", "nip_baru", "no_hp", "email", "token", "pin_hash", "rekening", "npwp"]) expect(kunci.has(larang)).toBe(false);
  });
});
