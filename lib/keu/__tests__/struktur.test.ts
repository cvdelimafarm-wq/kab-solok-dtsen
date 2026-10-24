import { describe, expect, it } from "vitest";
import {
  aksiTersedia, angkaBersih, argsUbah, argsUsul, cariJalur, cekIsian, hakKosong, indukTerpilih, isianDariUsulan, isianKosong, jalurAnak, kandidatItem, kandidatSimpul,
  levelTampil, matriksJalur, nomorLevel, opsiInduk, periksaAlasan, periksaNomorDokumen, rapikanPilihan, ringkasStatus, satuanBaku, semuaLulus, teksRiwayat, teksTenggat, uraiPilihan,
  type Hak, type JalurMaster, type KonteksCek, type LevelStruktur, type NodeJalur, type UsulanStruktur,
} from "../struktur";

const L = (kode: string, no: number, induk: string | null, pengusul: string, re: string | null, tampil = true): LevelStruktur => ({ kode, no, nama: kode, istilah_sakti: kode, contoh: "x", format_ket: `format ${kode}`, format_re: re, induk_kode: induk, pengusul, tampil });
const LEVEL: LevelStruktur[] = [
  L("program", 1, null, "pusat", "^[A-Z]{2}$"), L("kegiatan", 2, "program", "pusat", "^[0-9]{4}$"), L("kro", 3, "kegiatan", "ppk", "^[A-Z]{3}$"), L("ro", 4, "kro", "ppk", "^[A-Z0-9]{3}$"),
  L("komponen", 5, "ro", "tim", "^[0-9]{3}$"), L("subkomp", 6, "komponen", "tim", "^[A-Z0-9]{1,2}$", false), L("akun", 7, "subkomp", "tim", "^[0-9]{6}$"), L("item", 8, "akun", "tim", null),
];
const lv = (k: string) => LEVEL.find((x) => x.kode === k)!;
const NODE: NodeJalur[] = [
  { node_id: 1, tingkat: "program", kode: "GG", nama: "Program GG", jalur: "GG" },
  { node_id: 2, tingkat: "kegiatan", kode: "2903", nama: "Kegiatan 2903", jalur: "2903" },
  { node_id: 3, tingkat: "kegiatan", kode: "2886", nama: "Kegiatan 2886", jalur: "2886" },
  { node_id: 4, tingkat: "kro", kode: "BMA", nama: "BMA", jalur: "2903.BMA" },
  { node_id: 5, tingkat: "kro", kode: "EBA", nama: "EBA", jalur: "2886.EBA" },
  { node_id: 6, tingkat: "ro", kode: "005", nama: "RO lima", jalur: "2903.BMA.005" },
  { node_id: 7, tingkat: "ro", kode: "956", nama: "Layanan BMN", jalur: "2886.EBA.956" },
  { node_id: 8, tingkat: "komponen", kode: "055", nama: "Komp", jalur: "2903.BMA.005/055" },
  { node_id: 9, tingkat: "komponen", kode: "051", nama: "Tanpa Komponen", jalur: "2886.EBA.956/051" },
  { node_id: 10, tingkat: "akun", kode: "521211", nama: "Belanja Bahan", jalur: "2903.BMA.005/055/521211" },
  { node_id: 11, tingkat: "subkomp", kode: "A", nama: "TANPA SUB", jalur: "2903.BMA.005/055/A" },
];
const U = (p: Partial<UsulanStruktur>): UsulanStruktur => ({
  id: 1, kode_sementara: "T-001", level: "item", level_nama: "Item", level_no: 8, induk: "2903.BMA.005/055/521211", induk_usulan_id: null, ro_kode: "2903.BMA.005", kode: null, uraian: "ATK baru",
  volume: 2, satuan: "OK", harga: 1000, jumlah: 2000, sumber: "dalam", khusus: false, jalur_kode: "pok", jalur_nama: "Revisi POK", jalur_pemutus: "PPK", kepastian: "catatan", tenggat_kode: "tenggat_pok",
  status: "draf", boleh_komitmen: false, menunggu: "pengaju", catatan: "", dibuat_oleh: 7, nomor_dokumen: null, kode_resmi: null, cara_padan: null, alasan_akhir: null, nomor_item: null, ...p,
});
const SATUAN = [{ kode: "OK", arti: "orang kali", pasti: true, urut: 1, aktif: true }, { kode: "PKT", arti: "paket", pasti: true, urut: 2, aktif: true }, { kode: "OFF", arti: "mati", pasti: true, urut: 3, aktif: false }];
const ALIAS = [{ alias: "O-K", satuan_kode: "OK" }, { alias: "PAKET", satuan_kode: "PKT" }, { alias: "MATI", satuan_kode: "OFF" }];
const AKUN = [{ kode: "521211", nama: "Belanja Bahan", aktif: true, pola_kode: "BRG" }, { kode: "999999", nama: "Nonaktif", aktif: false }];

describe("level dan nomor", () => {
  it("menyembunyikan subkomponen dan menomori ulang", () => {
    expect(levelTampil(LEVEL).map((x) => x.kode)).toEqual(["program", "kegiatan", "kro", "ro", "komponen", "akun", "item"]);
    expect(nomorLevel(LEVEL, "akun")).toBe(6);
    expect(nomorLevel(LEVEL, "subkomp")).toBe(0);
    expect(nomorLevel(LEVEL.map((x) => ({ ...x, tampil: true })), "akun")).toBe(7);
  });
});

describe("pilihan induk", () => {
  it("mengurai nilai pilihan", () => {
    expect(uraiPilihan("j:2903")).toEqual({ jenis: "jalur", nilai: "2903" });
    expect(uraiPilihan("u:12")).toEqual({ jenis: "usulan", nilai: "12" });
    expect(uraiPilihan("u:abc")).toBeNull(); expect(uraiPilihan("")).toBeNull(); expect(uraiPilihan(undefined)).toBeNull();
  });
  it("menyaring bertingkat menurut jalur POK", () => {
    expect(opsiInduk("ro", {}, NODE, []).map((o) => o.nilai)).toEqual(["j:2886.EBA.956", "j:2903.BMA.005"]);
    expect(opsiInduk("komponen", { ro: "j:2903.BMA.005" }, NODE, []).map((o) => o.nilai)).toEqual(["j:2903.BMA.005/055"]);
    expect(opsiInduk("akun", { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055" }, NODE, []).map((o) => o.nilai)).toEqual(["j:2903.BMA.005/055/521211"]);
    expect(opsiInduk("akun", { ro: "j:2886.EBA.956", komponen: "j:2886.EBA.956/051" }, NODE, [])).toEqual([]);
    expect(opsiInduk("kro", { kegiatan: "j:2886" }, NODE, []).map((o) => o.nilai)).toEqual(["j:2886.EBA"]);
    expect(opsiInduk("ro", { kro: "j:2903.BMA" }, NODE, []).map((o) => o.nilai)).toEqual(["j:2903.BMA.005"]);
  });
  it("memuat usulan induk yang masih berjalan, bukan yang batal", () => {
    const ro = U({ id: 5, kode_sementara: "T-005", level: "ro", induk: "2903.BMA", ro_kode: "T-005", kode: "ZZ1", uraian: "RO baru", status: "sah" });
    const batal = U({ id: 6, kode_sementara: "T-006", level: "ro", induk: "2903.BMA", ro_kode: "T-006", kode: "ZZ2", status: "dibatalkan" });
    const o = opsiInduk("ro", {}, NODE, [ro, batal]);
    expect(o.map((x) => x.nilai)).toEqual(["j:2886.EBA.956", "j:2903.BMA.005", "u:5"]);
    expect(o[2].usulan).toBe(true);
    const kom = U({ id: 7, kode_sementara: "T-007", level: "komponen", induk: "T-005", induk_usulan_id: 5, ro_kode: "T-005", kode: "077" });
    expect(opsiInduk("komponen", { ro: "u:5" }, NODE, [ro, kom]).map((x) => x.nilai)).toEqual(["u:7"]);
    expect(opsiInduk("komponen", { ro: "j:2903.BMA.005" }, NODE, [ro, kom]).map((x) => x.nilai)).toEqual(["j:2903.BMA.005/055"]);
  });
  it("membuang pilihan yang tidak lagi sah setelah induknya berubah", () => {
    const r = rapikanPilihan("item", { ro: "j:2886.EBA.956", komponen: "j:2903.BMA.005/055", akun: "j:2903.BMA.005/055/521211" }, NODE, []);
    expect(r).toEqual({ ro: "j:2886.EBA.956" });
    const ok = rapikanPilihan("item", { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055", akun: "j:2903.BMA.005/055/521211" }, NODE, []);
    expect(Object.keys(ok)).toEqual(["ro", "komponen", "akun"]);
  });
  it("menentukan induk dan kode RO untuk hak", () => {
    const p = { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055", akun: "j:2903.BMA.005/055/521211" };
    expect(indukTerpilih("item", p, NODE, [])).toMatchObject({ lengkap: true, induk: "2903.BMA.005/055/521211", indukUsulan: null, roKode: "2903.BMA.005" });
    expect(indukTerpilih("item", { ro: "j:2903.BMA.005" }, NODE, []).lengkap).toBe(false);
    expect(indukTerpilih("program", {}, NODE, [])).toMatchObject({ lengkap: true, induk: null, roKode: null });
    expect(indukTerpilih("ro", { kro: "j:2903.BMA" }, NODE, [])).toMatchObject({ induk: "2903.BMA", roKode: null });
    const ro = U({ id: 5, kode_sementara: "T-005", level: "ro", ro_kode: "T-005" });
    expect(indukTerpilih("komponen", { ro: "u:5" }, NODE, [ro])).toMatchObject({ induk: null, indukUsulan: 5, roKode: "T-005" });
  });
});

describe("jalur", () => {
  const J = (level: string, sumber: string, khusus: boolean, jalur: string): JalurMaster => ({ id: 1, level_kode: level, sumber, khusus, jalur_kode: jalur, nama: `Jalur ${jalur}`, pemutus: "X", dasar: "d", kepastian: "catatan", tenggat_kode: "tenggat_pok", syarat: [] });
  const JALUR = [J("komponen", "dalam", false, "pok"), J("komponen", "dalam", true, "dja"), J("komponen", "tambahan", false, "dja"), J("akun", "dalam", false, "pok")];
  it("meniru keu_jalur: khusus hanya komponen non-tambahan", () => {
    expect(cariJalur(JALUR, "komponen", "dalam", false)?.jalur_kode).toBe("pok");
    expect(cariJalur(JALUR, "komponen", "dalam", true)?.jalur_kode).toBe("dja");
    expect(cariJalur(JALUR, "komponen", "tambahan", true)?.jalur_kode).toBe("dja");
    expect(cariJalur(JALUR, "akun", "dalam", true)?.jalur_kode).toBe("pok");
    expect(cariJalur(JALUR, "akun", "lintas", false)).toBeNull();
  });
  it("matriks per level tampil dan teks tenggat", () => {
    const m = matriksJalur(LEVEL, JALUR);
    expect(m).toHaveLength(7);
    expect(m.find((x) => x.kode === "komponen")).toMatchObject({ no: 5, jalur: "Jalur pok", pengusul: "Ketua tim; admin RO sebagai draf" });
    expect(m.find((x) => x.kode === "program")?.jalur).toBe("-");
    const waktu = [{ kode: "tenggat_pok", nama: "n", nilai: "27 Desember 2026", nilai_tanggal: "2026-12-27", ket: "", urut: 1 }];
    expect(teksTenggat(waktu, "tenggat_pok")).toBe("27 Desember 2026");
    expect(teksTenggat(waktu, "x")).toBe("belum diatur");
    expect(teksTenggat(waktu, null)).toContain("tidak ada");
  });
  it("jalur anak sama dengan fungsi basis data", () => {
    expect(jalurAnak("program", null, "GG")).toBe("GG"); expect(jalurAnak("kro", "2903", "BMA")).toBe("2903.BMA"); expect(jalurAnak("ro", "2903.BMA", "005")).toBe("2903.BMA.005");
    expect(jalurAnak("komponen", "2903.BMA.005", "055")).toBe("2903.BMA.005/055"); expect(jalurAnak("akun", "2903.BMA.005/055", "521211")).toBe("2903.BMA.005/055/521211");
  });
});

describe("isian dan pemeriksaan", () => {
  const konteks = (level: string, pilih: Record<string, string>, i: Partial<ReturnType<typeof isianKosong>>, usulan: UsulanStruktur[] = []): KonteksCek =>
    ({ level: lv(level), induk: indukTerpilih(level, pilih, NODE, usulan), isian: { ...isianKosong(), ...i }, node: NODE, usulan, akun: AKUN, satuan: SATUAN, alias: ALIAS });
  const pAkun = { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055", akun: "j:2903.BMA.005/055/521211" };
  it("angka dan satuan baku", () => {
    expect(angkaBersih("1.500.000")).toBe(1500000); expect(angkaBersih("2,5")).toBe(2.5); expect(angkaBersih("abc")).toBeNaN(); expect(angkaBersih("")).toBeNaN();
    expect(satuanBaku("o-k", SATUAN, ALIAS)).toBe("OK"); expect(satuanBaku(" paket ", SATUAN, ALIAS)).toBe("PKT"); expect(satuanBaku("zzz", SATUAN, ALIAS)).toBeNull();
    expect(satuanBaku("mati", SATUAN, ALIAS)).toBeNull(); expect(satuanBaku("", SATUAN, ALIAS)).toBeNull();
  });
  it("item lengkap lulus semua", () => {
    const b = cekIsian(konteks("item", pAkun, { uraian: "Kertas HVS A4", volume: "10", satuan: "paket", harga: "55.000" }));
    expect(semuaLulus(b)).toBe(true);
    expect(b.find((x) => x.t.startsWith("Jumlah"))?.t).toContain("550.000");
  });
  it("item kurang: induk, volume, satuan, harga", () => {
    const b = cekIsian(konteks("item", { ro: "j:2903.BMA.005" }, { uraian: "ab", volume: "0", satuan: "tidakada", harga: "" }));
    expect(semuaLulus(b)).toBe(false);
    expect(b.filter((x) => !x.ok).length).toBeGreaterThanOrEqual(5);
    expect(b[0].t).toContain("Pilih induk");
  });
  it("akun harus ada di master dan aktif, format enam angka", () => {
    expect(semuaLulus(cekIsian(konteks("akun", { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055" }, { kode: "521219", uraian: "Akun baru" })))).toBe(false);
    expect(cekIsian(konteks("akun", { ro: "j:2886.EBA.956", komponen: "j:2886.EBA.956/051" }, { kode: "521211", uraian: "Belanja bahan" })).every((x) => x.ok)).toBe(true);
    expect(cekIsian(konteks("akun", { ro: "j:2886.EBA.956", komponen: "j:2886.EBA.956/051" }, { kode: "999999", uraian: "Nonaktif" })).some((x) => !x.ok && x.t.includes("Master akun"))).toBe(true);
    expect(cekIsian(konteks("akun", { ro: "j:2886.EBA.956", komponen: "j:2886.EBA.956/051" }, { kode: "12345", uraian: "Salah format" })).some((x) => !x.ok && x.t.startsWith("Format kode"))).toBe(true);
  });
  it("RO wajib volume dan satuan; kode tiga huruf atau angka", () => {
    expect(semuaLulus(cekIsian(konteks("ro", { kro: "j:2903.BMA" }, { kode: "zz1", uraian: "RO baru", volume: "12", satuan: "OK" })))).toBe(true);
    expect(semuaLulus(cekIsian(konteks("ro", { kro: "j:2903.BMA" }, { kode: "zz1", uraian: "RO baru" })))).toBe(false);
    expect(semuaLulus(cekIsian(konteks("ro", { kro: "j:2903.BMA" }, { kode: "z1", uraian: "RO baru", volume: "1", satuan: "OK" })))).toBe(false);
  });
  it("menolak kode yang sudah ada di POK berlaku dan usulan berjalan", () => {
    expect(cekIsian(konteks("ro", { kro: "j:2903.BMA" }, { kode: "005", uraian: "Kembar", volume: "1", satuan: "OK" })).find((x) => !x.ok)?.t).toContain("sudah ada di POK");
    const u = U({ level: "komponen", induk: "2903.BMA.005", kode: "077", uraian: "Komp baru" });
    expect(cekIsian(konteks("komponen", { ro: "j:2903.BMA.005" }, { kode: "077", uraian: "Komp lagi" }, [u])).find((x) => !x.ok)?.t).toContain("T-001");
    const batal = U({ level: "komponen", induk: "2903.BMA.005", kode: "077", status: "dibatalkan" });
    expect(semuaLulus(cekIsian(konteks("komponen", { ro: "j:2903.BMA.005" }, { kode: "077", uraian: "Komp lagi" }, [batal])))).toBe(true);
    const item = U({ uraian: "Kertas HVS A4" });
    expect(cekIsian(konteks("item", pAkun, { uraian: " kertas hvs a4 ", volume: "1", satuan: "OK", harga: "5" }, [item])).some((x) => !x.ok && x.t.includes("uraian"))).toBe(true);
  });
});

describe("argumen fungsi", () => {
  const pAkun = { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055", akun: "j:2903.BMA.005/055/521211" };
  it("item: tanpa kode, dengan volume, satuan, harga, induk resmi", () => {
    const a = argsUsul("item", indukTerpilih("item", pAkun, NODE, []), { ...isianKosong(), uraian: " Kertas ", volume: "10", satuan: "paket", harga: "55.000", catatan: " c " });
    expect(a).toEqual({ p_level: "item", p_uraian: "Kertas", p_sumber: "dalam", p_khusus: false, p_catatan: "c", p_induk: "2903.BMA.005/055/521211", p_volume: 10, p_satuan: "paket", p_harga: 55000 });
    expect("p_kode" in a).toBe(false);
  });
  it("komponen khusus dan induk usulan", () => {
    const ro = U({ id: 5, kode_sementara: "T-005", level: "ro", ro_kode: "T-005" });
    const a = argsUsul("komponen", indukTerpilih("komponen", { ro: "u:5" }, NODE, [ro]), { ...isianKosong(), kode: "077", uraian: "Komp", khusus: true });
    expect(a).toMatchObject({ p_level: "komponen", p_induk_usulan: 5, p_kode: "077", p_khusus: true });
    expect("p_induk" in a).toBe(false);
    expect(argsUsul("akun", indukTerpilih("akun", { ro: "j:2903.BMA.005", komponen: "j:2903.BMA.005/055" }, NODE, []), { ...isianKosong(), kode: "521211", uraian: "x", khusus: true }).p_khusus).toBe(false);
  });
  it("program tanpa induk; ubah mengikuti level", () => {
    const a = argsUsul("program", indukTerpilih("program", {}, NODE, []), { ...isianKosong(), kode: "xy", uraian: "Program baru", sumber: "tambahan" });
    expect(a).toMatchObject({ p_kode: "XY", p_sumber: "tambahan" });
    expect("p_induk" in a || "p_induk_usulan" in a).toBe(false);
    const u = U({ volume: 3, harga: 100, satuan: "OK" });
    expect(argsUbah(u, isianDariUsulan(u))).toMatchObject({ p_id: 1, p_volume: 3, p_satuan: "OK", p_harga: 100 });
    expect("p_kode" in argsUbah(u, isianDariUsulan(u))).toBe(false);
  });
});

describe("status dan aksi", () => {
  const hak = (p: Partial<Hak>): Hak => ({ ...hakKosong(), ...p });
  const RO = "2903.BMA.005";
  const nama = (u: UsulanStruktur, h: Hak) => aksiTersedia(u, lv(u.level), h).map((a) => `${a.kode}:${a.boleh ? 1 : 0}`);
  it("ringkasan status", () => {
    expect(ringkasStatus([{ status: "aktif" }, { status: "draf" }, { status: "sah" }, { status: "dibatalkan" }, { status: "ditolak_pusat" }])).toEqual({ total: 5, aktif: 1, proses: 2, akhir: 2 });
  });
  it("draf item: ketua tim atau PPK mengajukan, anggota biasa tidak", () => {
    const u = U({});
    expect(nama(u, hak({ perRo: { [RO]: { rab: true, setuju: true, draf: false } } }))).toEqual(["ajukan:1", "ubah:1", "batal:1"]);
    expect(nama(u, hak({ perRo: { [RO]: { rab: false, setuju: false, draf: false } } }))).toEqual(["ajukan:0", "ubah:0", "batal:1"]);
    expect(nama(u, hak({ ppk: true }))).toEqual(["ajukan:1", "ubah:1", "batal:1"]);
    expect(aksiTersedia(u, lv("item"), hak({ perRo: { [RO]: { rab: false, setuju: false, draf: true } } }))[0].nama).toBe("Ajukan ke ketua tim");
  });
  it("level PPK: hanya yang berwenang str_ppk mengajukan", () => {
    const u = U({ level: "ro", ro_kode: "T-009", jalur_kode: "djpb" });
    expect(nama(u, hak({ strPpk: true }))[0]).toBe("ajukan:1");
    expect(nama(u, hak({ strPpk: false }))[0]).toBe("ajukan:0");
  });
  it("menunggu ketua, menunggu PPK, sah, diusulkan, perlu dipadankan", () => {
    expect(nama(U({ status: "menunggu_ketua" }), hak({ perRo: { [RO]: { rab: true, setuju: true, draf: false } } }))).toEqual(["setuju_ketua:1", "kembalikan:1", "batal:1"]);
    expect(nama(U({ status: "menunggu_ppk" }), hak({ ppk: false }))).toEqual(["sahkan:0", "kembalikan:0", "batal:1"]);
    expect(aksiTersedia(U({ status: "menunggu_ppk" }), lv("item"), hak({ ppk: true }))[0].nama).toBe("Sahkan (Revisi POK)");
    const sahDja = aksiTersedia(U({ status: "sah", jalur_kode: "dja" }), lv("item"), hak({ ppk: true }))[0];
    expect(sahDja).toMatchObject({ kode: "usulkan", butuhNomor: true, boleh: true, nama: "Teruskan sebagai usulan DIPA" });
    expect(aksiTersedia(U({ status: "sah" }), lv("item"), hak({ ppk: true }))[0].butuhNomor).toBe(false);
    expect(nama(U({ status: "diusulkan" }), hak({ ppk: true }))).toEqual(["tolak_pusat:1"]);
    expect(nama(U({ status: "perlu_dipadankan" }), hak({ ppk: true }))).toEqual(["padankan:1", "tolak_pusat:1"]);
    expect(nama(U({ status: "aktif" }), hak({ ppk: true }))).toEqual([]);
    expect(nama(U({ status: "dibatalkan" }), hak({ ppk: true }))).toEqual([]);
  });
  it("alasan dan nomor dokumen", () => {
    expect(periksaAlasan("ya")).toHaveLength(1); expect(periksaAlasan("alasan jelas")).toEqual([]);
    expect(periksaNomorDokumen(U({ jalur_kode: "dja" }), "")).toHaveLength(1); expect(periksaNomorDokumen(U({ jalur_kode: "djpb" }), "S-12/2026")).toEqual([]); expect(periksaNomorDokumen(U({ jalur_kode: "pok" }), "")).toEqual([]);
  });
});

describe("pemadanan dan riwayat", () => {
  it("kandidat simpul sejenis di induk resmi yang sama, tanpa yang sudah dipasangkan", () => {
    const u = U({ level: "komponen", induk: "2903.BMA.005", kode: "077", status: "perlu_dipadankan" });
    const aktif = U({ id: 9, level: "komponen", status: "aktif", kode_resmi: "2886.EBA.956/051" });
    expect(kandidatSimpul(u, "2903.BMA.005", NODE, [aktif]).map((k) => k.nilai)).toEqual(["2903.BMA.005/055"]);
    const ro = U({ id: 3, level: "ro", induk: "2903.BMA", status: "perlu_dipadankan" });
    expect(kandidatSimpul(ro, "2903.BMA", NODE, []).map((k) => k.nilai)).toEqual(["2903.BMA.005"]);
    expect(kandidatSimpul(U({}), "x", NODE, [])).toEqual([]);
  });
  it("kandidat item dari detail POK", () => {
    const d = [{ kunci_stabil: "a", uraian: "Kertas", volume: 2, satuan: "PKT", harga_satuan: 1000, jumlah: 2000, nomor_item: "12" }, { kunci_stabil: "b", uraian: "Tinta", volume: 1, satuan: "PKT", harga_satuan: 500, jumlah: 500, nomor_item: null }];
    expect(kandidatItem(d, [U({ id: 4, status: "aktif", kode_resmi: "a" })]).map((k) => k.nilai)).toEqual(["b"]);
    expect(kandidatItem(d, [])[0].label).toContain("#12 Kertas");
  });
  it("teks riwayat", () => {
    const r = { id: 1, usulan_id: 1, kode_sementara: "T-003", level: "item", level_nama: "Item", aksi: "ajukan", dari: "draf", ke: "menunggu_ppk", oleh_nama: "Iqbal", catatan: "", waktu: "2026-10-24T01:00:00Z" };
    expect(teksRiwayat(r)).toBe("Iqbal mengajukan T-003: Draf menjadi Menunggu PPK.");
    expect(teksRiwayat({ ...r, aksi: "ubah", dari: "draf", ke: "draf", oleh_nama: null })).toBe("Sistem mengubah isian T-003.");
    expect(teksRiwayat({ ...r, aksi: "batal", ke: "dibatalkan", catatan: "salah input" })).toContain("(salah input)");
  });
});
