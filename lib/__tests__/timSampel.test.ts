import { describe, expect, it } from "vitest";
import { cocokkanPetugasSampel, periksaBarisSampel, petaKolomSampel, templatSampel, KOLOM_TEMPLAT_SAMPEL } from "../sampelSls";
import { bandingkanPenugasan, bentukTimJson, cocokkanAtasan, ringkasTim, susunTim } from "../timSampel";

const B = (o: Record<string, unknown> = {}) => ({
  "Kode Wilayah": "1303010001000100",
  "Nama Responden": "Budi",
  "Nama Anggota Ruta Lain": "",
  "Status Sampel": "Utama",
  Latitude: "",
  Longitude: "",
  "Nama PPL": "Mitra A",
  "Nama PML": "Pegawai B",
  "Nama Korwil": "Pegawai C",
  "Nama Supervisor": "Pegawai S",
  ...o,
});

const AKUN = [
  { id: 1, nama: "Mitra A" },
  { id: 2, nama: "Mitra D" },
  { id: 3, nama: "Pegawai B, S.Tr.Stat." },
  { id: 4, nama: "Pegawai B2" },
  { id: 5, nama: "Pegawai C, A.Md." },
  { id: 6, nama: "Pegawai S, S.Si." },
];
const NAMA = new Map(AKUN.map((a) => [a.id, a.nama]));

function alur(baris: Record<string, unknown>[]) {
  const p = periksaBarisSampel(baris);
  const at = cocokkanAtasan(p.baris, AKUN, AKUN, p.nomor);
  const cocok = cocokkanPetugasSampel(at.baris, AKUN, AKUN, p.nomor);
  return { p, at, cocok, tim: susunTim(cocok.cocok, NAMA) };
}

describe("kolom Korwil dan Supervisor pada berkas", () => {
  it("judul kolom dikenali dan nilai kosong tidak membuat kunci", () => {
    const m = petaKolomSampel(["Nama Korwil", "Koordinator Wilayah", "SPV", "Nama Supervisor (opsional)"]);
    expect(m.korwil).toBe("Nama Korwil");
    expect(m.supervisor).toBe("SPV");
    const r = periksaBarisSampel([B({ "Nama Korwil": "", "Nama Supervisor": "" })]);
    expect(r.galat).toEqual([]);
    expect(Object.keys(r.baris[0])).not.toContain("korwil_nama");
    expect(Object.keys(r.baris[0])).not.toContain("supervisor_nama");
  });
  it("berkas lama tanpa kolom tersebut tetap sah", () => {
    const { ["Nama Korwil"]: _a, ["Nama Supervisor"]: _b, ...lama } = B();
    const r = periksaBarisSampel([lama]);
    expect(r.galat).toEqual([]);
    expect(r.baris).toHaveLength(1);
  });
  it("templat memuat kolom baru dan dapat dibaca kembali", () => {
    const t = templatSampel();
    expect(t[0]).toEqual([...KOLOM_TEMPLAT_SAMPEL]);
    expect(t[0]).toContain("Nama Korwil");
    expect(t[0]).toContain("Nama Supervisor");
    const objek = t.slice(1).map((b) => Object.fromEntries(t[0].map((k, i) => [k, b[i]])));
    expect(periksaBarisSampel(objek).galat).toEqual([]);
  });
});

describe("cocokkanAtasan", () => {
  it("gelar di belakang koma tidak menghalangi; baris sejajar dengan masukan", () => {
    const { at } = alur([B(), B({ "Nama Responden": "Cici" })]);
    expect(at.galat).toEqual([]);
    expect(at.baris.map((b) => [b.korwil_akun_id, b.supervisor_akun_id])).toEqual([[5, 6], [5, 6]]);
    expect(at.pemetaan.map((p) => p.peran)).toEqual(["korwil", "supervisor"]);
  });
  it("nama tidak ada atau ganda menjadi galat dengan nomor baris Excel", () => {
    const kembar = [...AKUN, { id: 7, nama: "Pegawai B, S.E." }];
    const p = periksaBarisSampel([B(), B({ "Nama Korwil": "Orang Asing" }), B({ "Nama Supervisor": "Pegawai B" })]);
    const at = cocokkanAtasan(p.baris, kembar, kembar, p.nomor);
    expect(at.galat.map((g) => g.baris)).toEqual([3, 4]);
    expect(at.galat[0].pesan).toContain("Orang Asing");
    expect(at.galat[1].pesan).toContain("cocok dengan 2");
  });
  it("kolom kosong menghasilkan null", () => {
    const { at } = alur([B({ "Nama Korwil": "", "Nama Supervisor": "" })]);
    expect(at.baris[0].korwil_akun_id).toBeNull();
    expect(at.baris[0].supervisor_akun_id).toBeNull();
  });
});

describe("susunTim", () => {
  it("PPL ke PML ke korwil ke supervisor, nama tampil dari akun", () => {
    const { tim } = alur([B(), B({ "Nama Responden": "C" }), B({ "Nama PPL": "Mitra D", "Nama Responden": "D" })]);
    expect(tim.galat).toEqual([]);
    const per = Object.fromEntries(tim.simpul.map((s) => [s.akun_id, s]));
    expect(per[1]).toMatchObject({ peran: "ppl", atasan_akun_id: 3 });
    expect(per[2]).toMatchObject({ peran: "ppl", atasan_akun_id: 3 });
    expect(per[3]).toMatchObject({ peran: "pml", atasan_akun_id: 5, nama: "Pegawai B, S.Tr.Stat." });
    expect(per[5]).toMatchObject({ peran: "korwil", atasan_akun_id: 6 });
    expect(per[6]).toMatchObject({ peran: "supervisor", atasan_akun_id: null });
    expect(tim.simpul.map((s) => s.peran)).toEqual(["supervisor", "korwil", "pml", "ppl", "ppl"]);
  });
  it("tanpa korwil, atasan PML = supervisor; tanpa keduanya atasan PML kosong", () => {
    const a = alur([B({ "Nama Korwil": "" })]).tim.simpul.find((s) => s.peran === "pml");
    expect(a?.atasan_akun_id).toBe(6);
    const b = alur([B({ "Nama Korwil": "", "Nama Supervisor": "" })]).tim.simpul.find((s) => s.peran === "pml");
    expect(b?.atasan_akun_id).toBeNull();
  });
  it("PPL di bawah dua PML: dipakai yang terbanyak dengan peringatan (bukan galat)", () => {
    const { tim } = alur([B(), B({ "Nama Responden": "X" }), B({ "Nama Responden": "Y", "Nama PML": "Pegawai B2" })]);
    expect(tim.galat).toEqual([]);
    expect(tim.peringatan.join(" ")).toContain("2 PML berbeda");
    expect(tim.simpul.find((s) => s.akun_id === 1)?.atasan_akun_id).toBe(3);
  });
  it("seri dimenangkan id terkecil", () => {
    const { tim } = alur([B(), B({ "Nama Responden": "Y", "Nama PML": "Pegawai B2" })]);
    expect(tim.simpul.find((s) => s.akun_id === 1)?.atasan_akun_id).toBe(3);
  });
  it("orang yang sama dengan dua peran = galat", () => {
    const { tim } = alur([B(), B({ "Nama Responden": "Z", "Nama PPL": "Pegawai B", "Nama PML": "Pegawai B2" })]);
    expect(tim.galat.join(" ")).toContain("lebih dari satu peran");
  });
  it("atasan yang bukan anggota simpul dilepas", () => {
    const hasil = susunTim([{ ppl_akun_id: 1, pml_akun_id: 3, korwil_akun_id: null, supervisor_akun_id: null }], NAMA);
    expect(hasil.simpul.find((s) => s.akun_id === 1)?.atasan_akun_id).toBe(3);
    expect(hasil.simpul.find((s) => s.akun_id === 3)?.atasan_akun_id).toBeNull();
  });
});

describe("bandingkanPenugasan dan ringkasTim", () => {
  const { tim } = alur([B(), B({ "Nama Responden": "C", "Nama PPL": "Mitra D" })]);
  it("baru, sudah, dan bentrok peran", () => {
    const ada = new Map<number, string>([[1, "ppl"], [3, "ppl"]]);
    const b = bandingkanPenugasan(tim.simpul, ada);
    expect(b.sudah.map((s) => s.akun_id)).toEqual([1]);
    expect(b.bentrok).toEqual([{ akun_id: 3, nama: "Pegawai B, S.Tr.Stat.", peran_berkas: "pml", peran_ada: "ppl" }]);
    expect(b.baru.map((s) => s.akun_id).sort()).toEqual([2, 5, 6]);
  });
  it("ringkasan menghitung per peran dan yang tanpa atasan", () => {
    const b = bandingkanPenugasan(tim.simpul, new Map());
    const r = ringkasTim(tim.simpul, b);
    expect(r.per_peran).toEqual({ ppl: 2, pml: 1, korwil: 1, supervisor: 1 });
    expect(r.baru).toEqual({ ppl: 2, pml: 1, korwil: 1, supervisor: 1 });
    expect(r.tanpa_atasan).toEqual([]);
    const tanpa = ringkasTim(alur([B({ "Nama Korwil": "", "Nama Supervisor": "" })]).tim.simpul, { baru: [], sudah: [], bentrok: [] });
    expect(tanpa.tanpa_atasan).toEqual([{ nama: "Pegawai B, S.Tr.Stat.", peran: "pml" }]);
  });
  it("bentuk JSON hanya id, peran, atasan", () => {
    expect(bentukTimJson(tim.simpul)[0]).toEqual({ akun_id: 6, peran: "supervisor", atasan_akun_id: null });
  });
});
