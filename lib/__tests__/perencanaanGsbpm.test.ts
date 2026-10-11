// (11 Okt 2026) Uji hierarki perencanaan GSBPM per RO (uji coba)
import { expect, test } from "vitest";
import {
  TAHAP_GSBPM,
  aturTahapDipakai,
  bacaData,
  buatKegiatan,
  dataContoh,
  duplikatKegiatan,
  periksaKegiatan,
  periksaRo,
  pisahSubKomponen,
  rapikanKodeRo,
  ringkasKegiatan,
  statusTahap,
} from "../perencanaanGsbpm";

const T = "2026-10-11T07:00:00.000Z";

test("6 tahap urut, perencanaan & evaluasi wajib, pengolahan tidak dipakai bawaan", () => {
  expect(TAHAP_GSBPM.map((t) => t.kode)).toEqual(["perencanaan", "pelatihan", "pendataan", "pengolahan", "analisis", "evaluasi"]);
  expect(TAHAP_GSBPM.filter((t) => t.wajib).map((t) => t.kode)).toEqual(["perencanaan", "evaluasi"]);
  const k = buatKegiatan({ roId: "r", nama: "  Susenas  " }, "k1", T);
  expect(k.nama).toBe("Susenas");
  expect(k.tahap.pengolahan.dipakai).toBe(false);
  expect(ringkasKegiatan(k)).toEqual({ dipakai: 5, teridentifikasi: 0, tautanAnggaran: false });
});

test("contoh awal: RO 2906.BMA.006 dengan 4 kegiatan, periode & sub komponen kosong", () => {
  const d = dataContoh();
  expect(d.ro).toHaveLength(1);
  expect(d.ro[0].kode).toBe("2906.BMA.006");
  expect(d.kegiatan.map((k) => k.nama)[1]).toBe("Seruti Triwulan II 2026");
  expect(d.kegiatan.every((k) => k.mulai === null && k.subKomponen.length === 0)).toBe(true);
});

test("kode RO dirapikan dan diperiksa", () => {
  expect(rapikanKodeRo(" 054.01.gg.2906.bma.006 ")).toBe("2906.BMA.006");
  expect(periksaRo({ kode: "2906.BMA.006", nama: "X" }, [])).toBeNull();
  expect(periksaRo({ kode: "2906-BMA", nama: "X" }, [])).toMatch(/9999\.AAA\.999/);
  expect(periksaRo({ kode: "2906.BMA.006", nama: " " }, [])).toMatch(/Nama RO/);
  const ada = dataContoh().ro;
  expect(periksaRo({ kode: "2906.bma.006", nama: "X" }, ada)).toMatch(/sudah ada/);
  expect(periksaRo({ kode: "2906.BMA.006", nama: "X" }, ada, ada[0].id)).toBeNull();
});

test("sub komponen dipisah, dirapikan, tanpa duplikat", () => {
  expect(pisahSubKomponen("052.a, 052.A ; 051.b\n")).toEqual(["052.A", "051.B"]);
  expect(pisahSubKomponen("  ")).toEqual([]);
});

test("periode kegiatan diperiksa", () => {
  expect(periksaKegiatan({ nama: "A", mulai: "2026-03-01", selesai: "2026-03-31" })).toBeNull();
  expect(periksaKegiatan({ nama: "", mulai: null, selesai: null })).toMatch(/Nama/);
  expect(periksaKegiatan({ nama: "A", mulai: "2026-03-31", selesai: "2026-03-01" })).toMatch(/sebelum/);
});

test("tahap wajib tidak bisa dimatikan; opsional bisa", () => {
  const k = buatKegiatan({ roId: "r", nama: "A" }, "k1", T);
  expect(aturTahapDipakai(k, "perencanaan", false, T).tahap.perencanaan.dipakai).toBe(true);
  const k2 = aturTahapDipakai(k, "pengolahan", true, T);
  expect(k2.tahap.pengolahan.dipakai).toBe(true);
  expect(statusTahap(k2.tahap.pengolahan)).toBe("belum");
  expect(statusTahap(aturTahapDipakai(k, "pelatihan", false, T).tahap.pelatihan)).toBe("tidak_dipakai");
});

test("duplikat menyalin tahap & jawaban (salinan dalam), mengganti nama/periode/sub komponen", () => {
  const asal = buatKegiatan({ roId: "r", nama: "Susenas Maret", subKomponen: ["052.A"] }, "k1", T);
  asal.tahap.pelatihan = { dipakai: true, jawaban: { jenis: "luring", rinci: { lokasi: "dalam" } }, diubah: T };
  asal.tahap.pengolahan.dipakai = true;
  const salin = duplikatKegiatan(asal, { nama: "Susenas September", mulai: "2026-09-01", selesai: "2026-09-30", subKomponen: ["052.B"] }, "k2", "2026-10-12T00:00:00.000Z");
  expect(salin.id).toBe("k2");
  expect(salin.asalId).toBe("k1");
  expect(salin.subKomponen).toEqual(["052.B"]);
  expect(salin.tahap.pengolahan.dipakai).toBe(true);
  expect(salin.tahap.pelatihan.jawaban).toEqual({ jenis: "luring", rinci: { lokasi: "dalam" } });
  (salin.tahap.pelatihan.jawaban as { rinci: { lokasi: string } }).rinci.lokasi = "luar";
  expect((asal.tahap.pelatihan.jawaban as { rinci: { lokasi: string } }).rinci.lokasi).toBe("dalam");
  expect(ringkasKegiatan(salin)).toEqual({ dipakai: 6, teridentifikasi: 1, tautanAnggaran: true });
});

test("bacaData: rusak -> contoh; tahap hilang dilengkapi; kegiatan tanpa RO dibuang; wajib dipaksa dipakai", () => {
  expect(bacaData(null).ro[0].kode).toBe("2906.BMA.006");
  expect(bacaData("{bukan json").kegiatan).toHaveLength(4);
  const raw = JSON.stringify({
    versi: 1,
    ro: [{ id: "r1", kode: "2906.BMA.006", nama: "X", program: "054.01.GG", tahun: 2026 }],
    kegiatan: [
      { id: "a", roId: "r1", nama: "A", subKomponen: ["052.A"], tahap: { evaluasi: { dipakai: false, jawaban: null, diubah: null } } },
      { id: "b", roId: "hilang", nama: "B", subKomponen: [], tahap: {} },
    ],
  });
  const d = bacaData(raw);
  expect(d.kegiatan.map((k) => k.id)).toEqual(["a"]);
  expect(d.kegiatan[0].tahap.evaluasi.dipakai).toBe(true);
  expect(d.kegiatan[0].tahap.pelatihan.dipakai).toBe(true);
});

test("bacaData: baris POK & alokasi yang yatim dibuang, rencana dirapikan", () => {
  const raw = JSON.stringify({
    versi: 1,
    ro: [{ id: "r1", kode: "2906.BMA.006", nama: "X", program: "", tahun: 2026 }],
    kegiatan: [{ id: "k1", roId: "r1", nama: "A", subKomponen: [], tahap: {} }],
    pok: [
      { id: "p1", roId: "r1", komponen: "052", subKomponen: "A", akun: "524113", uraian: "Translok", volume: 10, satuan: "O-K", harga: 170000, jumlah: 1700000 },
      { id: "p2", roId: "hilang", komponen: "052", subKomponen: "A", akun: "524113", uraian: "X", volume: null, satuan: "", harga: null, jumlah: 1 },
    ],
    alokasi: [
      { id: "a1", detailId: "p1", kegiatanId: "k1", volume: 10, nilai: 1700000, rencana: [{ bulan: "2026-03", nilai: 1700000 }, { rusak: true }] },
      { id: "a2", detailId: "p2", kegiatanId: "k1", volume: null, nilai: 1, rencana: [] },
      { id: "a3", detailId: "p1", kegiatanId: "k-hilang", volume: null, nilai: 1, rencana: [] },
    ],
  });
  const d = bacaData(raw);
  expect(d.pok.map((p) => p.id)).toEqual(["p1"]);
  expect(d.alokasi.map((a) => a.id)).toEqual(["a1"]);
  expect(d.alokasi[0].rencana).toEqual([{ bulan: "2026-03", nilai: 1700000 }]);
  expect(dataContoh().pok).toEqual([]);
});
