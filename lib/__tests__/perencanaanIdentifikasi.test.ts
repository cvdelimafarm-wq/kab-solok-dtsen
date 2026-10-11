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
  pilihanTampil,
  sisipkanSub,
  susunanKosong,
  kelasBaru,
  periksaSusunan,
  ringkasSusunan,
  bacaSusunan,
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
  const ef = jawabanEfektif(P, { jenis: "daring", lokasi: "dalam", tempat: "hotel", konsumsi: true, pulsa: "mitra" });
  expect(ef.lokasi).toBeUndefined();
  expect(ef.tempat).toBeUndefined();
  expect(ef.konsumsi).toBeUndefined();
  expect(pertanyaanTampil(P, { jenis: "daring" }).map((x) => x.p.kode)).toEqual(["jenis", "peserta", "pulsa", "honor_instruktur", "narasumber", "jml_hari", "jml_jp"]);
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
  expect(kode({ jenis: "daring", peserta: "mitra", pulsa: "mitra", honor_instruktur: true, narasumber: true })).toEqual(["521211-D", "521213-C", "522151"]);
  // modul
  expect(modulDariForm(P, { jenis: "daring" })).toContain("Rapat Zoom");
  expect(modulDariForm(P, { jenis: "daring" })).not.toContain("Presensi bertitik lokasi");
});

test("pulsa daring: pilihan mengikuti peserta; organik saja otomatis tidak", () => {
  const pul = (peserta: string) => pilihanTampil(P.pertanyaan.find((p) => p.kode === "pulsa")!, { jenis: "daring", peserta }).map((x) => x.label);
  expect(pul("mitra")).toEqual(["Ya, untuk mitra", "Tidak"]);
  expect(pul("keduanya")).toEqual(["Ya, untuk mitra", "Ya, untuk organik dan mitra", "Tidak"]);
  expect(jawabanEfektif(P, { jenis: "daring", peserta: "organik", pulsa: "mitra" }).pulsa).toBe("tidak");
  // ganti peserta keduanya -> mitra: pilihan "keduanya" gugur, harus dijawab ulang
  expect(jawabanEfektif(P, { jenis: "daring", peserta: "mitra", pulsa: "keduanya" }).pulsa).toBeUndefined();
  expect(paketDariForm(P, { jenis: "hybrid", peserta: "keduanya", pulsa: "keduanya" }).find((x) => x.kode === "521211-D")?.ket).toBe("Pulsa peserta daring (organik dan mitra)");
  expect(kode({ jenis: "daring", peserta: "keduanya", pulsa: "tidak" })).toEqual([]);
});

test("susunan kelas & panitia: ringkasan, pemeriksaan, paket honor panitia", () => {
  const s = susunanKosong();
  expect(periksaSusunan(s)).toEqual(["Susunan kelas: tambahkan minimal satu kelas."]);
  s.jabatan.push("Koseka");
  s.kelas = [kelasBaru("k1", 1, s.jabatan), kelasBaru("k2", 2, s.jabatan)];
  expect(periksaSusunan(s)[0]).toBe("Kelas 1: jumlah PPL, PML, Koseka belum diisi (isi 0 bila tidak ada).");
  s.kelas[0].peserta = { PPL: 20, PML: 5, Koseka: 0 };
  s.kelas[0].instruktur = "Nurafiza";
  s.kelas[1].peserta = { PPL: 22, PML: 5, Koseka: 1 };
  expect(periksaSusunan(s)).toEqual([]);
  expect(ringkasSusunan(s)).toEqual({ kelas: 2, perJabatan: { PPL: 42, PML: 10, Koseka: 1 }, peserta: 53, instruktur: 1, instrukturBelum: 1, panitia: 0 });
  s.panitia = [{ id: "p1", nama: "Oryza", tugas: "ketua" }];
  expect(periksaSusunan(s)).toEqual(["Panitia: honor (SK) belum dijawab."]);
  s.honorPanitia = true;
  const j = { jenis: "luring", peserta: "mitra", lokasi: "dalam", tempat: "kantor", susunan: s } as unknown as Record<string, unknown>;
  expect(paketTahap("pelatihan", j).map((x) => x.kode)).toContain("521213-A");
  // dibaca ulang dari JSON tetap sama; data rusak -> kosong dengan jabatan bawaan
  expect(bacaSusunan(JSON.parse(JSON.stringify(s)))).toEqual(s);
  expect(bacaSusunan("x")).toEqual(susunanKosong());
});

test("belumDijawab: otomatis & angka opsional tidak diminta", () => {
  const j: Jawaban = { jenis: "luring", peserta: "mitra", lokasi: "luar", paket_meeting: "fullboard", bahan: true, honor_instruktur: true, narasumber: false, jml_hari: 3 };
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
  s.peran.pengawas = { dipakai: true, status: "keduanya", honor: true, satuan: "Ruta", target: 160, translok: "lebih8", pulsa: false, supervisi: true, honorUntuk: "keduanya" };
  const j = { sub: [s] };
  expect(periksaPendataan(j)).toEqual([]);
  const k = paketPendataan(j).map((x) => x.kode).sort();
  expect(k).toEqual(["521211-D", "521213-D", "521213-P", "524111-A", "524113-A", "524113-B"]);
  // honor mitra pencacah & pengawas digabung dalam satu paket
  expect(paketPendataan(j).find((x) => x.kode === "521213-D")?.ket).toMatch(/pencacah.*;.*pengawas/);
  expect(paketTahap("pendataan", j).length).toBe(6);
});

test("pendataan: status keduanya -> honor hanya mitra atau organik & mitra", () => {
  const s = subKegiatanBaru("s1", "Listing / updating", "listing");
  s.mode = "capi";
  s.penunjukJalan = false;
  s.peran.pengawas.dipakai = false;
  s.peran.pencacah = { dipakai: true, status: "keduanya", honor: true, honorUntuk: null, satuan: "BS", target: null, translok: "tidak", pulsa: false, supervisi: null };
  expect(periksaPendataan({ sub: [s] })).toEqual(["Listing / updating · Pencacah (PPL): honor untuk siapa belum diisi."]);
  s.peran.pencacah.honorUntuk = "mitra";
  expect(paketPendataan({ sub: [s] }).map((x) => x.kode)).toEqual(["521213-D"]);
  s.peran.pencacah.honorUntuk = "keduanya";
  expect(paketPendataan({ sub: [s] }).map((x) => x.kode)).toEqual(["521213-D", "521213-P"]);
});

test("pendataan: urutan listing -> pencacahan -> lainnya", () => {
  let d = sisipkanSub([], subKegiatanBaru("a", "Lainnya", "lainnya"));
  d = sisipkanSub(d, subKegiatanBaru("b", "Pencacahan sampel", "pencacahan"));
  d = sisipkanSub(d, subKegiatanBaru("c", "Listing / updating", "listing"));
  expect(d.map((s) => s.id)).toEqual(["c", "b", "a"]);
  expect(periksaPendataan({ sub: [subKegiatanBaru("x", "X")] }).some((m) => m.includes("jenis"))).toBe(false);
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
  k.tahap.analisis = { dipakai: false, jawaban: { konsultasi_prov: true }, diubah: null }; // tahap dimatikan -> tidak dihitung
  const p = paketKegiatan(k.tahap);
  expect(p.map((x) => x.kode)).toEqual(["521211-A", "524113-A"]);
  expect(p[0].sumber).toBe("Pelatihan petugas, Evaluasi");
  expect(p[0].ket).toBe("Konsumsi pelatihan di kantor; Konsumsi rapat evaluasi");
});
