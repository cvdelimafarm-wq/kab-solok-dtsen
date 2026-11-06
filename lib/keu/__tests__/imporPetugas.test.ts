import { describe, expect, it } from "vitest";
import { normalisasi } from "../identifikasi";
import { awalLanjutan, type IsiLanjutan } from "../lanjutan";
import { jumlahSlot } from "../selisihLanjutan";
import {
  barisDariTabel, barisTemplate, pahamiPeran, pahamiStatus, pahamiSumber, rencanaImpor, terapkanImpor, type BarisMentah,
} from "../imporPetugas";

const FORM = normalisasi({
  nama: "Seruti Triwulan IV 2026", periode: "Triwulanan", keList: ["Triwulan IV"], berbagi: false,
  sesi: { briefing: { on: false }, pelatihan: { on: false } },
  peran: { pml: { on: true, nOrg: 2, nMit: 0, status: "Organik", translok: true }, ppl: { on: true, nOrg: 0, nMit: 2, status: "Mitra", translok: true } },
});
const dasar = (): IsiLanjutan => awalLanjutan(FORM, 2026);
const ORG = [{ nama: "Iqbal Hadi", ket: "", akun: 1 }, { nama: "Sinta Dewi", ket: "", akun: 2 }, { nama: "Budi", ket: "", akun: 3 }];
const MIT = [{ nama: "Farah Sahara", ket: "Gunung Talang", akun: 10 }, { nama: "Budi", ket: "Kubung", akun: 11 }, { nama: "Budi", ket: "Lembang", akun: 12 }, { nama: "Rina", ket: "", akun: 13 }];
const b = (baris: number, nama: string, peran: string, status = "", sumber = ""): BarisMentah => ({ baris, nama, peran, status, sumber });

describe("memahami isian", () => {
  it("peran: kode, nama, dan alias", () => {
    expect(pahamiPeran("PPL")).toBe("ppl"); expect(pahamiPeran(" petugas  entri ")).toBe("entri"); expect(pahamiPeran("Korwil")).toBe("kortim");
    expect(pahamiPeran("Ketua")).toBeNull(); expect(pahamiPeran("")).toBeNull();
  });
  it("status dan sumber", () => {
    expect(pahamiStatus("organik")).toBe("Organik"); expect(pahamiStatus("Mitra")).toBe("Mitra"); expect(pahamiStatus("")).toBe(""); expect(pahamiStatus("honorer")).toBeNull();
    expect(pahamiSumber("Langsung dari kepka")).toBe("kepka"); expect(pahamiSumber("Lewat seleksi")).toBe("seleksi"); expect(pahamiSumber("")).toBe(""); expect(pahamiSumber("x")).toBeNull();
  });
});

describe("barisDariTabel", () => {
  it("mencari baris judul, melewati baris kosong dan catatan, memberi nomor baris berkas", () => {
    const t = [["Daftar petugas Seruti"], ["No", "Nama Petugas", "Peran", "Status", "Sumber mitra"], ["1", "Rina", "PPL", "Mitra", ""], ["", "", "", "", ""], ["", "# catatan", "", "", ""], ["3", "Sinta Dewi", "PML", "", ""]];
    const r = barisDariTabel(t);
    expect(r.galat).toBeNull();
    expect(r.baris.map((x) => [x.baris, x.nama, x.peran])).toEqual([[3, "Rina", "PPL"], [6, "Sinta Dewi", "PML"]]);
  });
  it("tanpa kolom Nama dan Peran = galat", () => {
    expect(barisDariTabel([["A", "B"], ["1", "2"]]).galat).toMatch(/Baris judul/);
  });
});

describe("rencanaImpor", () => {
  it("mengisi slot kosong lebih dulu, menautkan akun bila nama tepat satu", () => {
    const g = dasar();
    const { hasil, ringkas } = rencanaImpor(g, [b(2, "Iqbal Hadi", "PML", "Organik"), b(3, "Farah Sahara", "PPL", "Mitra", "Lewat seleksi")], ORG, MIT);
    expect(hasil[0]).toMatchObject({ tindakan: "isi_slot", akun: 1, tertaut: true, peran: "pml", status: "Organik" });
    expect(hasil[1]).toMatchObject({ tindakan: "isi_slot", akun: 10, sumber: "seleksi" });
    expect(ringkas).toMatchObject({ masuk: 2, isiSlot: 2, tambah: 0, lewati: 0, tertaut: 2 });
  });
  it("status kosong disimpulkan dari daftar; ada di dua daftar atau tak ada = dilewati", () => {
    const { hasil } = rencanaImpor(dasar(), [b(2, "Sinta Dewi", "PML"), b(3, "Rina", "PPL"), b(4, "Budi", "PPL"), b(5, "Orang Baru", "PPL")], ORG, MIT);
    expect(hasil[0]).toMatchObject({ status: "Organik", tindakan: "isi_slot" });
    expect(hasil[1]).toMatchObject({ status: "Mitra", tindakan: "isi_slot" });
    expect(hasil[2].tindakan).toBe("lewati"); expect(hasil[2].alasan).toMatch(/isi kolom Status/);
    expect(hasil[3].tindakan).toBe("lewati");
  });
  it("nama kembar dan nama di luar daftar tetap masuk tanpa tautan, dengan catatan", () => {
    const { hasil, ringkas } = rencanaImpor(dasar(), [b(2, "Budi", "PPL", "Mitra"), b(3, "Orang Luar", "PPL", "Mitra")], ORG, MIT);
    expect(hasil[0]).toMatchObject({ tertaut: false, tindakan: "isi_slot" }); expect(hasil[0].catatan.join(" ")).toMatch(/kembar/);
    expect(hasil[1]).toMatchObject({ tertaut: false }); expect(hasil[1].catatan.join(" ")).toMatch(/di luar daftar/);
    expect(ringkas.takTertaut).toBe(2);
  });
  it("sumber mitra kosong = kepka; organik mengabaikan sumber", () => {
    const { hasil } = rencanaImpor(dasar(), [b(2, "Rina", "PPL", "Mitra"), b(3, "Iqbal Hadi", "PML", "Organik", "Lewat seleksi")], ORG, MIT);
    expect(hasil[0].sumber).toBe("kepka");
    expect(hasil[1].sumber).toBe(""); expect(hasil[1].catatan.join(" ")).toMatch(/diabaikan/);
  });
  it("melewati: nama kosong, peran/status/sumber tak dikenal, duplikat pada berkas dan pada data yang ada", () => {
    const g = dasar(); g.petugas.find((p) => p.peran === "ppl")!.nama = "Rina";
    const { hasil } = rencanaImpor(g, [b(2, "", "PPL"), b(3, "Rina", "Ketua"), b(4, "Rina", "PPL", "Honorer"), b(5, "Rina", "PPL", "Mitra", "x"), b(6, "Rina", "PPL", "Mitra"), b(7, "Farah Sahara", "PPL", "Mitra"), b(8, "farah  sahara", "PPL", "Mitra")], ORG, MIT);
    expect(hasil.map((h) => h.tindakan)).toEqual(["lewati", "lewati", "lewati", "lewati", "lewati", "isi_slot", "lewati"]);
    expect(hasil[4].alasan).toMatch(/sudah ada/); expect(hasil[6].alasan).toMatch(/sudah ada/);
  });
  it("melebihi slot kosong = tambah", () => {
    const { hasil, ringkas } = rencanaImpor(dasar(), [b(2, "Rina", "PPL", "Mitra"), b(3, "Farah Sahara", "PPL", "Mitra"), b(4, "Budi", "PPL", "Mitra", "")], ORG, MIT);
    expect(hasil.map((h) => h.tindakan)).toEqual(["isi_slot", "isi_slot", "tambah"]);
    expect(ringkas).toMatchObject({ isiSlot: 2, tambah: 1 });
  });
  it("berkas kosong dan terlalu besar = galat", () => {
    expect(rencanaImpor(dasar(), [], ORG, MIT).galat).toMatch(/Tidak ada baris/);
    expect(rencanaImpor(dasar(), Array.from({ length: 501 }, (_, i) => b(i + 2, `N${i}`, "PPL", "Mitra")), ORG, MIT).galat).toMatch(/Terlalu banyak/);
  });
});

describe("terapkanImpor", () => {
  it("mengisi slot tanpa mengubah jumlah; menambah baris baru menaikkan jumlah per peran", () => {
    const g = dasar();
    const sebelum = g.petugas.length;
    const { hasil } = rencanaImpor(g, [b(2, "Rina", "PPL", "Mitra"), b(3, "Farah Sahara", "PPL", "Mitra"), b(4, "Budi", "PPL", "Mitra")], ORG, MIT);
    const r = terapkanImpor(g, hasil);
    expect(r).toEqual({ diisi: 2, ditambah: 1, peranDiaktifkan: [] });
    expect(g.petugas).toHaveLength(sebelum + 1);
    expect(g.peran.ppl.nMit).toBe(3); expect(jumlahSlot(g, "ppl", "Mitra")).toBe(3);
    const rina = g.petugas.find((p) => p.nama === "Rina")!;
    expect(rina).toMatchObject({ akun: 13, menyusul: false, sumber: "kepka", status: "Mitra", peran: "ppl" });
    const budi = g.petugas.find((p) => p.nama === "Budi")!;
    expect("akun" in budi).toBe(false);
    expect(new Set(g.petugas.map((p) => p.id)).size).toBe(g.petugas.length);
  });
  it("peran yang tidak dipakai diaktifkan dan dilaporkan; baris dilewati tidak diterapkan", () => {
    const g = dasar();
    const { hasil } = rencanaImpor(g, [b(2, "Iqbal Hadi", "Supervisor", "Organik"), b(3, "", "PPL")], ORG, MIT);
    g.peran.supervisor.on = false; g.peran.supervisor.nOrg = 0; g.petugas = g.petugas.filter((p) => p.peran !== "supervisor");
    const r = terapkanImpor(g, hasil);
    expect(r).toMatchObject({ diisi: 0, ditambah: 1, peranDiaktifkan: ["supervisor"] });
    expect(g.peran.supervisor).toMatchObject({ on: true, nOrg: 1 });
  });
  it("tidak menimpa nama yang sudah ada", () => {
    const g = dasar(); const p = g.petugas.find((e) => e.peran === "pml")!; p.nama = "Sinta Dewi"; p.menyusul = false; p.akun = 2;
    const { hasil } = rencanaImpor(g, [b(2, "Iqbal Hadi", "PML", "Organik")], ORG, MIT);
    terapkanImpor(g, hasil);
    expect(g.petugas.find((e) => e.id === p.id)!.nama).toBe("Sinta Dewi");
    expect(g.petugas.filter((e) => e.peran === "pml").map((e) => e.nama).sort()).toEqual(["Iqbal Hadi", "Sinta Dewi"]);
  });
});

describe("barisTemplate", () => {
  it("judul + satu baris per slot kosong dengan peran dan status terisi", () => {
    const g = dasar();
    const t = barisTemplate(g);
    expect(t[0]).toEqual(["Nama", "Peran", "Status", "Sumber mitra"]);
    expect(t.length - 1).toBe(g.petugas.filter((p) => p.nama === "").length);
    expect(t.slice(1).every((r) => r[0] === "" && r[1] !== "" && (r[2] === "Organik" || r[2] === "Mitra"))).toBe(true);
    // template yang diisi kembali dibaca persis oleh barisDariTabel
    expect(barisDariTabel(t)).toMatchObject({ baris: [], tanpaNama: t.length - 1 });
    t[1][0] = "Rina";
    expect(barisDariTabel(t).baris).toHaveLength(1);
  });
});
