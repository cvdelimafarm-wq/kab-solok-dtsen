import { describe, expect, it } from "vitest";
import {
  argsAkunBaru, argsSkor, hitungSkor, pratinjauSkor, argsWaktu, bagianMasterSah, dokumenKelompok, kelompokDokumen, komaDariAngka, pakaiAkun, pakaiSatuan, periksaAkunBaru, periksaFaktor, periksaSatuanBaru, periksaSkor,
  periksaTanggal, periksaToleransi, periksaWaktu, persenDariPecahan, ringkasKelompok, ringkasRiwayat, susunKewenangan, teksSatuanRagu, teksTanggal, teksTotalBobot, type AkunMaster, type DokMaster, type WaktuMaster,
} from "../master";

describe("akun", () => {
  it("memeriksa kode dan nama akun baru", () => {
    expect(periksaAkunBaru("521811", "Belanja ATK", [])).toEqual([]);
    expect(periksaAkunBaru("12345", "Belanja ATK", [])[0]).toContain("6 angka");
    expect(periksaAkunBaru("541111", "Belanja ATK", [])[0]).toContain("6 angka");
    expect(periksaAkunBaru("521811", "Belanja ATK", ["521811"])[0]).toContain("sudah ada");
    expect(periksaAkunBaru("521811", "ab", [])[0]).toContain("Nama akun");
  });
  it("menentukan kelompok dan pola awal dari kode", () => {
    expect(argsAkunBaru(" 524113", " Perjalanan ")).toEqual({ kode: "524113", nama: "Perjalanan", kelompok_kode: "524", pola_kode: "PDN", aktif: true });
    expect(argsAkunBaru("511111", "Gaji").pola_kode).toBe("PEG");
    expect(argsAkunBaru("532111", "Peralatan").pola_kode).toBe("MDL");
    expect(argsAkunBaru("521211", "Konsumsi")).toMatchObject({ kelompok_kode: "52L", pola_kode: "BRG" });
  });
  it("menghitung item dan nilai POK per akun", () => {
    const p = pakaiAkun([{ id: 1, kode: "521811" }, { id: 2, kode: "524113" }], [{ akun_node_id: 1, jumlah: "100" }, { akun_node_id: 1, jumlah: 50 }, { akun_node_id: 2, jumlah: 7 }, { akun_node_id: 9, jumlah: 5 }]);
    expect(p.get("521811")).toEqual({ n: 2, nilai: 150 }); expect(p.get("524113")).toEqual({ n: 1, nilai: 7 }); expect(p.size).toBe(2);
  });
  it("meringkas kelompok", () => {
    const akun: AkunMaster[] = [{ kode: "521811", nama: "a", kelompok_kode: "52L", pola_kode: "BRG", aktif: true }, { kode: "524113", nama: "b", kelompok_kode: "524", pola_kode: "PDN", aktif: true }];
    const r = ringkasKelompok([{ kode: "52L", nama: "Lain" }, { kode: "524", nama: "Dinas" }, { kode: "51", nama: "Pegawai" }], akun, new Map([["521811", { n: 1, nilai: 10 }], ["524113", { n: 1, nilai: 5 }]]));
    expect(r.map((x) => [x.kode, x.nAkun, x.nilai])).toEqual([["52L", 1, 10], ["524", 1, 5], ["51", 0, 0]]);
    expect(r[1].aturan).toContain("524xxx");
  });
});

describe("satuan", () => {
  const satuan = [{ kode: "OK", arti: "orang kali", pasti: true, urut: 1, aktif: true }, { kode: "OJP", arti: "orang jam pelajaran", pasti: false, urut: 2, aktif: true }];
  it("memetakan penulisan POK lewat alias dan kode baku", () => {
    const m = pakaiSatuan(["OK", "O-K", " ok ", "OJP", "XYZ", null], satuan, [{ alias: "O-K", satuan_kode: "OK" }]);
    expect(m.get("OK")).toBe(3); expect(m.get("OJP")).toBe(1); expect(m.size).toBe(2);
  });
  it("memeriksa satuan baru dan teks keraguan", () => {
    expect(periksaSatuanBaru("tahun", "tahun", [])).toEqual([]);
    expect(periksaSatuanBaru("OK", "orang kali", ["ok"])[0]).toContain("sudah ada");
    expect(periksaSatuanBaru("A B", "arti", [])[0]).toContain("Kode satuan");
    expect(periksaSatuanBaru("ZZ", "", [])[0]).toContain("Arti");
    expect(teksSatuanRagu(satuan)).toBe("1 arti perlu dikonfirmasi");
    expect(teksSatuanRagu([satuan[0]])).toBe("semua arti sudah dikonfirmasi");
  });
});

describe("parameter dan waktu", () => {
  it("faktor kebutuhan 0,5 sampai 1,0", () => {
    expect(periksaFaktor("0,9").nilai).toBe(0.9); expect(periksaFaktor("1").nilai).toBe(1);
    expect(periksaFaktor("0,4").nilai).toBeNull(); expect(periksaFaktor("1,2").galat).toHaveLength(1); expect(periksaFaktor("abc").nilai).toBeNull();
  });
  it("toleransi persen disimpan sebagai pecahan", () => {
    expect(periksaToleransi("5").nilai).toBe(0.05); expect(periksaToleransi("7,5 %").nilai).toBe(0.075); expect(periksaToleransi("0").nilai).toBe(0);
    expect(periksaToleransi("60").nilai).toBeNull(); expect(periksaToleransi("-1").nilai).toBeNull();
    expect(persenDariPecahan(0.05)).toBe("5"); expect(persenDariPecahan(0.075)).toBe("7,5"); expect(komaDariAngka(0.9)).toBe("0,9");
  });
  it("tanggal", () => {
    expect(teksTanggal("2026-12-27")).toBe("27 Desember 2026"); expect(periksaTanggal("2026-02-30")).toHaveLength(1); expect(periksaTanggal("2026-12-27")).toEqual([]); expect(periksaTanggal("27/12/2026")).toHaveLength(1);
  });
  it("mengisi waktu bertanggal dan teks", () => {
    const tgl: WaktuMaster = { kode: "tenggat_pok", nama: "Tenggat", nilai: "27 Desember 2026", nilai_tanggal: "2026-12-27", ket: "", urut: 5 };
    const txt: WaktuMaster = { kode: "unggah_realisasi", nama: "Unggah", nilai: "Mingguan", nilai_tanggal: null, ket: "", urut: 6 };
    expect(argsWaktu(tgl, "2026-12-20")).toEqual({ nilai_tanggal: "2026-12-20", nilai: "20 Desember 2026" });
    expect(argsWaktu(txt, "  Mingguan, Selasa ")).toEqual({ nilai: "Mingguan, Selasa" });
    expect(periksaWaktu(tgl, "2026-13-01")).toHaveLength(1); expect(periksaWaktu(txt, "ab")).toHaveLength(1); expect(periksaWaktu(txt, "Mingguan")).toEqual([]);
  });
});

describe("skor RAB", () => {
  const b = { penarikan: 35, volume: 25, cakupan: 20, disiplin: 20 };
  it("memeriksa bobot dan ambang", () => {
    expect(periksaSkor(b, { baik: 85, cukup: 70 })).toEqual([]);
    expect(periksaSkor({ ...b, volume: 25.5 }, { baik: 85, cukup: 70 })[0]).toContain("bilangan bulat");
    expect(periksaSkor({ penarikan: 0, volume: 0, cakupan: 0, disiplin: 0 }, { baik: 85, cukup: 70 })[0]).toContain("tidak boleh 0");
    expect(periksaSkor(b, { baik: 60, cukup: 70 })[0]).toContain("Ambang Cukup");
    expect(periksaSkor({ ...b, cakupan: 101 }, { baik: 85, cukup: 70 }).length).toBeGreaterThan(0);
  });
  it("teks total bobot", () => {
    expect(teksTotalBobot(b, true)).toBe("Total bobot 100. PPK dapat mengubah.");
    expect(teksTotalBobot({ ...b, volume: 30 }, false)).toContain("dinormalkan menjadi 100");
  });
  it("argumen tulis", () => { expect(argsSkor(b, { baik: 85, cukup: 70 })).toEqual({ bobot_penarikan: 35, bobot_volume: 25, bobot_cakupan: 20, bobot_disiplin: 20, ambang_baik: 85, ambang_cukup: 70 }); });
});

describe("pratinjau skor", () => {
  const b = { penarikan: 35, volume: 25, cakupan: 20, disiplin: 20 }, a = { baik: 85, cukup: 70 };
  it("menghitung skor tertimbang dan melewati komponen yang tak dapat dinilai", () => {
    expect(hitungSkor({ ro_kode: "x", n_penarikan: 100, n_volume: 100, n_cakupan: 100, n_disiplin: 100 }, b, a)).toMatchObject({ skor: 100, label: "Baik" });
    expect(hitungSkor({ ro_kode: "x", n_penarikan: null, n_volume: 80, n_cakupan: 60, n_disiplin: 100 }, b, a).skor).toBe(Math.round(((80 * 25 + 60 * 20 + 100 * 20) / 65) * 10) / 10);
    expect(hitungSkor({ ro_kode: "x", n_penarikan: 70, n_volume: 70, n_cakupan: 70, n_disiplin: 70 }, b, a).label).toBe("Cukup");
    expect(hitungSkor({ ro_kode: "x", n_penarikan: 10, n_volume: 10, n_cakupan: 10, n_disiplin: 10 }, b, a).label).toBe("Perlu pembinaan");
    expect(hitungSkor({ ro_kode: "x", n_penarikan: null, n_volume: null, n_cakupan: null, n_disiplin: null }, b, a)).toMatchObject({ skor: null, label: "-" });
  });
  it("tiga tertinggi dan tiga terendah", () => {
    const rows = [10, 90, 50, 70, 30, 100, 20].map((v, i) => ({ ro_kode: "r" + i, n_penarikan: v, n_volume: v, n_cakupan: v, n_disiplin: v }));
    const p = pratinjauSkor(rows, b, a);
    expect(p.tertinggi.map((x) => x.skor)).toEqual([100, 90, 70]); expect(p.terendah.map((x) => x.skor)).toEqual([30, 20, 10]);
    expect(pratinjauSkor(rows.slice(0, 3), b, a).terendah).toEqual([]);
  });
});

describe("kewenangan dan dokumen", () => {
  it("menyusun matriks tindakan x peran menurut urutan", () => {
    const m = susunKewenangan(
      [{ kode: "b", nama: "B", ket: "", pemberi_kode: null, urut: 2, aktif: true }, { kode: "a", nama: "A", ket: "", pemberi_kode: null, urut: 1, aktif: true }, { kode: "x", nama: "X", ket: "", pemberi_kode: null, urut: 3, aktif: false }],
      [{ kewenangan_kode: "a", peran_kode: "PPK", perlu_pemberian: false, ket: null }, { kewenangan_kode: "b", peran_kode: "TU", perlu_pemberian: true, ket: null }],
      [{ kode: "TU", nama: "TU", ket: "", lingkup: "global", urut: 2, aktif: true }, { kode: "PPK", nama: "PPK", ket: "", lingkup: "global", urut: 1, aktif: true }],
    );
    expect(m.peran.map((p) => p.kode)).toEqual(["PPK", "TU"]);
    expect(m.baris.map((r) => r.kode)).toEqual(["a", "b"]);
    expect(m.baris[0].sel).toEqual([{ peran: "PPK", ada: true, perluPemberian: false }, { peran: "TU", ada: false, perluPemberian: false }]);
    expect(m.baris[1].sel[1]).toEqual({ peran: "TU", ada: true, perluPemberian: true });
  });
  it("mengelompokkan dokumen: pola umum dahulu, lalu lembar", () => {
    const d = (id: number, sumber: string, kode: string, gen: boolean, seksi = 1, no = 1): DokMaster => ({ id, sumber, kode, seksi_urut: seksi, seksi_huruf: null, seksi_judul: null, no, uraian: "u" + id, pihak: [], ket: null, gen, aktif: true });
    const dok = [d(1, "skema", "521211", true), d(2, "pola", "PEG", false), d(3, "pola", "PEG", true, 1, 2), d(4, "skema", "521211", false, 2, 1)];
    const k = kelompokDokumen(dok, [{ kode: "PEG", nama: "Belanja pegawai" }]);
    expect(k.map((x) => x.kunci)).toEqual(["pola:PEG", "skema:521211"]);
    expect(k[0]).toMatchObject({ judul: "Pola umum: Belanja pegawai", n: 2, nGen: 1 });
    expect(k[1].judul).toBe("Lembar 521211");
    expect(dokumenKelompok(dok, "skema:521211").map((x) => x.id)).toEqual([1, 4]);
  });
});

describe("riwayat dan bagian", () => {
  it("meringkas perubahan", () => {
    expect(ringkasRiwayat({ id: 1, waktu: "", aksi: "keu.keu_master_akun.insert", detail: { tabel: "keu_master_akun", baru: { kode: "521999", nama: "x" } }, oleh_nama: null })).toBe("menambah akun 521999");
    expect(ringkasRiwayat({ id: 2, waktu: "", aksi: "keu.keu_master_param.update", detail: { tabel: "keu_master_param", lama: { nilai: 0.9 }, baru: { nilai: 0.85 } }, oleh_nama: null })).toBe("mengubah parameter: nilai 0.9 menjadi 0.85");
    expect(ringkasRiwayat({ id: 3, waktu: "", aksi: "keu.keu_master_akun.update", detail: { tabel: "keu_master_akun", lama: { aktif: true }, baru: { aktif: false } }, oleh_nama: null })).toContain("aktif ya menjadi tidak");
  });
  it("riwayat menyembunyikan kolom pencatat otomatis", () => {
    expect(ringkasRiwayat({ id: 4, waktu: "", aksi: "keu.keu_master_skor.update", detail: { tabel: "keu_master_skor", lama: { diubah_oleh: null, ambang_cukup: 70 }, baru: { diubah_oleh: 354, diubah_at: "x", ambang_cukup: 71 } }, oleh_nama: null })).toBe("mengubah skor RAB: ambang_cukup 70 menjadi 71");
  });
  it("bagian sah", () => { expect(bagianMasterSah("skor")).toBe("skor"); expect(bagianMasterSah("aneh")).toBe("akun"); expect(bagianMasterSah(null)).toBe("akun"); });
});
