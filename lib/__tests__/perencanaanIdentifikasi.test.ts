// (11 Okt 2026) Uji form identifikasi per tahap + turunan paket administrasi (uji coba)
import { expect, test } from "vitest";
import {
  FORM_TAHAP,
  KATALOG_PAKET,
  belumDijawab,
  cekPaketKePok,
  jawabanEfektif,
  modulDariForm,
  paketDariForm,
  paketKegiatan,
  paketPendataan,
  paketTahap,
  periksaPendataan,
  pertanyaanTampil,
  subKegiatanBaru,
  type Jawaban,
} from "../perencanaanIdentifikasi";
import { buatKegiatan } from "../perencanaanGsbpm";

const P = FORM_TAHAP.pelatihan!;
const kode = (j: Jawaban) => paketDariForm(P, j).map((x) => x.kode).sort();

test("semua aturan & paket merujuk ke katalog dan ke pertanyaan yang ada", () => {
  for (const f of Object.values(FORM_TAHAP)) {
    const ada = new Set(f!.pertanyaan.map((p) => p.kode));
    for (const a of f!.aturan) {
      expect(KATALOG_PAKET[a.paket], a.paket).toBeDefined();
      for (const s of a.jika) expect(ada.has(s.k), `${f!.judul}: ${s.k}`).toBe(true);
    }
    // pertanyaan hanya bergantung pada pertanyaan di atasnya
    f!.pertanyaan.forEach((p, i) => {
      const atas = new Set(f!.pertanyaan.slice(0, i).map((q) => q.kode));
      for (const s of [...(p.tampil ?? []), ...(p.otomatis ?? []).flatMap((o) => o.jika)]) expect(atas.has(s.k), `${p.kode} -> ${s.k}`).toBe(true);
    });
  }
});

test("luar kota: tempat otomatis hotel, konsumsi otomatis tidak", () => {
  const ef = jawabanEfektif(P, { jenis: "luring", lokasi: "luar", tempat: "kantor", konsumsi: true });
  expect(ef.tempat).toBe("hotel");
  expect(ef.konsumsi).toBe(false);
  const t = pertanyaanTampil(P, { jenis: "luring", lokasi: "luar" });
  expect(t.find((x) => x.p.kode === "tempat")?.otomatis?.nilai).toBe("hotel");
  expect(t.find((x) => x.p.kode === "konsumsi")?.otomatis?.nilai).toBe(false);
  expect(t.some((x) => x.p.kode === "paket_meeting")).toBe(true);
});

test("dalam kota di kantor: konsumsi otomatis ya, paket meeting tidak ditanyakan", () => {
  const j = { jenis: "luring", lokasi: "dalam", tempat: "kantor" };
  expect(jawabanEfektif(P, j).konsumsi).toBe(true);
  expect(pertanyaanTampil(P, j).some((x) => x.p.kode === "paket_meeting")).toBe(false);
});

test("daring: lokasi/tempat/konsumsi disembunyikan dan jawaban lamanya dibuang", () => {
  const ef = jawabanEfektif(P, { jenis: "daring", lokasi: "dalam", tempat: "hotel", konsumsi: true, pulsa: true });
  expect(ef.lokasi).toBeUndefined();
  expect(ef.tempat).toBeUndefined();
  expect(ef.konsumsi).toBeUndefined();
  expect(pertanyaanTampil(P, { jenis: "daring" }).map((x) => x.p.kode)).toEqual(["jenis", "peserta", "pulsa", "honor_instruktur", "narasumber", "jml_peserta", "jml_kelas", "jml_hari", "jml_jp"]);
});

test("paket pelatihan sesuai lokasi/tempat/peserta", () => {
  const dasar = { bahan: false, honor_instruktur: false, narasumber: false };
  // di kantor, peserta mitra: translok + konsumsi
  expect(kode({ ...dasar, jenis: "luring", peserta: "mitra", lokasi: "dalam", tempat: "kantor" })).toEqual(["521211-A", "524113-A"]);
  // di kantor, organik saja: tanpa translok
  expect(kode({ ...dasar, jenis: "luring", peserta: "organik", lokasi: "dalam", tempat: "kantor" })).toEqual(["521211-A"]);
  // hotel dalam kota: paket meeting dalam kota, tanpa konsumsi sendiri
  expect(kode({ ...dasar, jenis: "luring", peserta: "keduanya", lokasi: "dalam", tempat: "hotel" })).toEqual(["524114-A", "524114-B"]);
  // luar kota
  expect(kode({ ...dasar, jenis: "luring", peserta: "keduanya", lokasi: "luar" })).toEqual(["524119-A", "524119-B"]);
  // daring + pulsa + instruktur + narasumber
  expect(kode({ jenis: "daring", peserta: "mitra", pulsa: true, honor_instruktur: true, narasumber: true })).toEqual(["521211-D", "521213-C", "522151"]);
  // modul
  expect(modulDariForm(P, { jenis: "daring" })).toContain("Rapat Zoom");
  expect(modulDariForm(P, { jenis: "daring" })).not.toContain("Presensi bertitik lokasi");
});

test("belumDijawab: otomatis & angka opsional tidak diminta", () => {
  const j: Jawaban = { jenis: "luring", peserta: "mitra", lokasi: "luar", paket_meeting: "fullboard", bahan: true, honor_instruktur: true, narasumber: false, jml_peserta: 40, jml_kelas: 2, jml_hari: 3 };
  expect(belumDijawab(P, j)).toEqual([]);
  expect(belumDijawab(P, { ...j, jml_hari: null }).map((p) => p.kode)).toEqual(["jml_hari"]);
  expect(belumDijawab(P, {}).map((p) => p.kode)[0]).toBe("jenis");
});

test("pendataan: sub-kegiatan x peran menurunkan paket", () => {
  const s = subKegiatanBaru("s1", "Pencacahan Susenas");
  s.jenis = "pencacahan";
  s.mode = "capi";
  s.penunjukJalan = false;
  s.peran.pencacah = { dipakai: true, status: "mitra", honor: true, satuan: "Ruta", target: 160, translok: "kurang8", pulsa: true, supervisi: null };
  s.peran.pengawas = { dipakai: true, status: "keduanya", honor: true, satuan: "Ruta", target: 160, translok: "lebih8", pulsa: false, supervisi: true };
  const j = { sub: [s] };
  expect(periksaPendataan(j)).toEqual([]);
  const k = paketPendataan(j).map((x) => x.kode).sort();
  expect(k).toEqual(["521211-D", "521213-D", "521213-P", "524111-A", "524113-A", "524113-B"]);
  // honor mitra pencacah & pengawas digabung dalam satu paket
  expect(paketPendataan(j).find((x) => x.kode === "521213-D")?.ket).toMatch(/pencacah.*;.*pengawas/);
  expect(paketTahap("pendataan", j).length).toBe(6);
});

test("pendataan: isian kurang dilaporkan per sub-kegiatan & peran", () => {
  expect(periksaPendataan({ sub: [] })).toEqual(["Tambahkan minimal satu sub-kegiatan pendataan."]);
  const pesan = periksaPendataan({ sub: [subKegiatanBaru("s1")] });
  expect(pesan).toContain("Sub-kegiatan 1: nama belum diisi.");
  expect(pesan.some((m) => m.startsWith("Sub-kegiatan 1 · Pengawas (PML)") && m.includes("supervisi"))).toBe(true);
});

test("paketTahap & cek ke POK", () => {
  expect(paketTahap("pelatihan", null)).toEqual([]);
  expect(paketTahap("evaluasi", { rapat: true, rapat_tempat: "kantor" }).map((x) => x.kode)).toEqual(["521211-A"]);
  expect(cekPaketKePok("521211", new Set(["521211"]), new Set(["521211"]))).toBe("teralokasi");
  expect(cekPaketKePok("524113", new Set(), new Set(["524113"]))).toBe("ada_di_ro");
  expect(cekPaketKePok("524119", new Set(), new Set())).toBe("tidak_ada");
});

test("paketKegiatan: gabungan tahap dipakai saja, urut kode, sumber digabung", () => {
  const k = buatKegiatan({ roId: "r", nama: "Susenas" }, "k1", "2026-10-11T00:00:00.000Z");
  k.tahap.pelatihan.jawaban = { jenis: "luring", peserta: "mitra", lokasi: "dalam", tempat: "kantor", bahan: false, honor_instruktur: false, narasumber: false };
  k.tahap.evaluasi.jawaban = { rapat: true, rapat_tempat: "kantor" };
  k.tahap.pengolahan.jawaban = { status: "mitra", honor: true, pulsa: false }; // tidak dipakai bawaan
  const p = paketKegiatan(k.tahap);
  expect(p.map((x) => x.kode)).toEqual(["521211-A", "524113-A"]);
  expect(p[0].sumber).toBe("Pelatihan petugas, Evaluasi");
  expect(p[0].ket).toBe("Konsumsi pelatihan di kantor; Konsumsi rapat evaluasi");
});
