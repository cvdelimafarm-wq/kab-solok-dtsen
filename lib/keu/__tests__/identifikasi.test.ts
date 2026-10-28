import { describe, expect, it } from "vitest";
import {
  akunDipicu, awalForm, bedaForm, dampakRevisi, hariBulan, hitungJadwal, hitungMitra, jabatanHonorTim, jadwalValid, jendelaPeriode, kebutuhan, kematangan,
  mulaiPendataanAwal, normalisasi, periksa, periodeTurunan, ringkasPetugas, sesudahH15, tambahHari, tanggalH15, tanggalSesi, tglBulan, type Form, tujuanPesan, hurufBagianDariSumber } from "../identifikasi";
import {
  HAK_KOSONG, aksiTersedia, agendaPeriode, barisH15, cocokkanPok, evaluasiDari, labelStatus, langkahTampil, namaVersi, paketUntukAkun, periksaGeser, rekrutmenDari, siapaMenunggu, statusH15,
  type BarisPok,
} from "../identifikasiHilir";
import vektor from "./identifikasi.vektor.json";
import { instrDari, instrLengkap, labelJalur, selisihHari, tanggalRapat } from "../identifikasi";
import { ubahRec } from "../waktu";

/** Contoh dari mockup: Susenas Maret terintegrasi Seruti Triwulan I 2026. */
function contoh(ubah: (f: Form) => void = () => {}): Form {
  const f = normalisasi({
    nama: "Susenas Maret terintegrasi Seruti Triwulan I 2026",
    periode: "Triwulanan", keList: ["Triwulan I"], adaUpdating: false, adaDiseminasi: true,
    jend: { mb: 2, mj: "tgl", mn: 1, sb: 2, sj: "akhir", sn: 0, perk: false },
    // (28 Okt 2026) bawaan awalForm kini serba Perkiraan dan pengolahan sama dengan pendataan; contoh mockup tetap memakai isian lama
    rel: {
      updating: { aM: "mulai", dM: -10, aS: "mulai", dS: -1, perk: false },
      pengolahan: { aM: "mulai", dM: 14, aS: "selesai", dS: 15, perk: false },
      pasca: { aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true },
      diseminasi: { aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true },
    },
    tunggal: { mulai: "", selesai: "", perk: false },
    sesi: {
      briefing: { on: false },
      pelatihan: { on: true, bentuk: "Luring", tempat: "Kantor", tgl: { "Triwulan I": { mulai: "2026-02-23", selesai: "2026-02-25" } }, pulsa: false, perl: true, pengajar: true, instr: { jumlah: 2, level: "Inda", asal: "Eksternal", jam: 8, perk: false } },
    },
    rapat: { persiapan: { on: true, media: ["Apel pagi"] }, pelaksanaan: { on: true, media: ["Zoom"] }, evaluasi: { on: true, media: ["Tatap muka"] } },
    instrumen: "FASIH",
    peran: {
      supervisor: { on: true, translok: true, honor: false, status: "Organik", nOrg: 1, nMit: 0, perk: false },
      kortim: { on: false },
      pml: { on: true, translok: true, honor: true, status: "Organik dan mitra", nOrg: 2, nMit: 4, perk: true },
      ppl: { on: true, translok: false, honor: true, status: "Mitra", nOrg: 0, nMit: 12, perk: true },
      entri: { on: false },
    },
    konsultasi: true, cara: "Tatap muka (perjalanan dinas)",
  });
  ubah(f);
  return f;
}

describe("tanggal", () => {
  it("hari dalam bulan dan jepitan tanggal", () => {
    expect(hariBulan(2026, 1)).toBe(28);
    expect(hariBulan(2028, 1)).toBe(29);
    expect(hariBulan(2026, 12)).toBe(31); // Januari tahun berikutnya
    expect(tglBulan(2026, 1, 31)).toBe("2026-02-28");
    expect(tglBulan(2026, 12, 5)).toBe("2027-01-05");
    expect(tambahHari("2026-03-31", 15)).toBe("2026-04-15");
    expect(tambahHari("", 3)).toBe("");
  });
});

describe("paritas jendela pendataan dengan SQL keu_ident_jendela", () => {
  it(`semua ${vektor.length} vektor sama persis`, () => {
    let beda = 0;
    for (const v of vektor as { f: Record<string, unknown>; p: string; t: number; sql: string[] | null }[]) {
      const f = normalisasi(v.f);
      const j = jendelaPeriode(f, v.p, v.t);
      const ts = j.mulai && j.selesai ? [j.mulai, j.selesai] : null;
      if (JSON.stringify(ts) !== JSON.stringify(v.sql)) { beda++; if (beda < 5) console.log("BEDA", JSON.stringify(v), ts); }
    }
    expect(beda).toBe(0);
  });
});

describe("jadwal", () => {
  it("contoh mockup: pola, pengolahan, pasca, diseminasi dan penanda perkiraan", () => {
    const j = hitungJadwal(contoh(), "Triwulan I", 2026);
    expect(j.pendataan).toEqual({ mulai: "2026-03-01", selesai: "2026-03-31", perk: false });
    expect(j.updating).toBeUndefined();
    expect(j.pengolahan).toEqual({ mulai: "2026-03-15", selesai: "2026-04-15", perk: false });
    expect(j.pasca).toEqual({ mulai: "2026-04-16", selesai: "2026-04-30", perk: true });
    expect(j.diseminasi).toEqual({ mulai: "2026-05-01", selesai: "2026-05-15", perk: true });
  });
  it("updating mendahului pendataan; tanpa diseminasi tahap hilang", () => {
    const j = hitungJadwal(contoh((f) => { f.adaUpdating = true; f.adaDiseminasi = false; }), "Triwulan I", 2026);
    expect(j.updating).toEqual({ mulai: "2026-02-19", selesai: "2026-02-28", perk: false });
    expect(j.diseminasi).toBeUndefined();
  });
  it("tanpa pendataan: pengolahan mengikuti jendela", () => {
    const j = hitungJadwal(contoh((f) => { f.instrumen = "Tanpa pendataan"; }), "Triwulan I", 2026);
    expect(j.pendataan).toBeUndefined();
    expect(j.pengolahan).toEqual({ mulai: "2026-03-01", selesai: "2026-03-31", perk: false });
  });
  it("pembaruan H-15 menggeser pendataan, menegaskan Fix, dan menggeser tahap turunan", () => {
    const j = hitungJadwal(contoh(), "Triwulan I", 2026, { mulai: "2026-03-05", selesai: "2026-03-31" });
    expect(j.pendataan).toEqual({ mulai: "2026-03-05", selesai: "2026-03-31", perk: false });
    expect(j.pengolahan?.mulai).toBe("2026-03-19");
  });
  it("pengecualian periode menggantikan pola", () => {
    const f = contoh((g) => { g.keList = ["Triwulan I", "Triwulan II"]; g.kecuali = { "Triwulan II": { on: true, mulai: "2026-07-06", selesai: "2026-07-20", alasan: "Libur", perk: true } }; });
    expect(jendelaPeriode(f, "Triwulan II", 2026)).toEqual({ mulai: "2026-07-06", selesai: "2026-07-20", perk: true });
    expect(jendelaPeriode(f, "Triwulan I", 2026).mulai).toBe("2026-03-01");
  });
  it("Ad-hoc: satu periode setahun, pola seperti tahunan", () => {
    const f = contoh((g) => { g.periode = "Ad-hoc"; g.keList = ["Ad-hoc"]; g.jend = { mb: 7, mj: "tgl", mn: 3, sb: 8, sj: "akhir", sn: 0, perk: true }; });
    expect(jendelaPeriode(f, "Ad-hoc", 2026)).toEqual({ mulai: "2026-08-03", selesai: "2026-09-30", perk: true });
  });
  it("tanggal sesi periode lain digeser sebesar selisih mulai pendataan (92 hari Maret ke Juni)", () => {
    const f = contoh((g) => { g.keList = ["Triwulan I", "Triwulan II"]; });
    expect(periodeTurunan(f, "Triwulan II", 2026)).toBe(true);
    expect(periodeTurunan(f, "Triwulan I", 2026)).toBe(false);
    expect(tanggalSesi(f, "pelatihan", "Triwulan II", 2026)).toEqual({ mulai: "2026-05-26", selesai: "2026-05-28" });
  });
});

describe("kebutuhan belanja", () => {
  it("contoh mockup menurunkan 9 kebutuhan dan 5 akun", () => {
    const f = contoh();
    expect(kebutuhan(f)).toHaveLength(9);
    expect(akunDipicu(f)).toEqual(["521211", "521213", "522151", "524111", "524113"]);
  });
  it("konsumsi sesi luring hanya bila ada mitra; tempat hotel memakai paket 524114 atau 524119", () => {
    const tanpaMitra = contoh((g) => { g.peran.pml.status = "Organik"; g.peran.ppl.status = "Organik"; g.peran.ppl.nOrg = 3; });
    expect(hitungMitra(tanpaMitra)).toBe(0);
    expect(kebutuhan(tanpaMitra).some((n) => n.sumber === "B" && n.paket[0] === "521211-A")).toBe(false);
    expect(kebutuhan(tanpaMitra).some((n) => n.paket[0] === "521211-B")).toBe(true); // perlengkapan pelatihan tetap, ada atau tanpa mitra
    const dalam = contoh((g) => { g.sesi.pelatihan.tempat = "Hotel dalam kota"; });
    expect(kebutuhan(dalam).find((n) => n.akun === "524114")).toMatchObject({ paket: ["524114"], jalur: "Pengadaan" });
    expect(kebutuhan(dalam).some((n) => n.sumber === "B" && n.paket[0] === "521211-A")).toBe(false); // 521211 hanya tanpa paket
    expect(akunDipicu(dalam)).toContain("524114");
    const luar = contoh((g) => { g.sesi.pelatihan.tempat = "Hotel luar kota"; });
    expect(akunDipicu(luar)).toContain("524119");
    expect(akunDipicu(luar)).not.toContain("524114");
    for (const t of ["Kantor", "Lokasi lain"] as const) {
      const f = contoh((g) => { g.sesi.pelatihan.tempat = t; });
      expect(kebutuhan(f).filter((n) => n.sumber === "B" && n.paket[0] === "521211-A")).toHaveLength(1);
    }
  });
  it("perlengkapan hanya pelatihan; pulsa peserta hanya bila ada mitra", () => {
    const f = contoh((g) => { g.sesi.briefing = { on: true, bentuk: "Luring", tempat: "Kantor", tgl: {}, pulsa: false, perl: true, pengajar: false }; });
    expect(kebutuhan(f).filter((n) => n.paket[0] === "521211-B" && n.teks.startsWith("Briefing"))).toHaveLength(0);
    expect(normalisasi({ sesi: { briefing: { on: true, bentuk: "Luring", perl: true } } }).sesi.briefing.perl).toBe(false);
    const pulsa = contoh((g) => { g.sesi.pelatihan.bentuk = "Daring"; g.sesi.pelatihan.pulsa = true; });
    expect(kebutuhan(pulsa).some((n) => n.paket[0] === "521211-D")).toBe(true);
    const tanpa = contoh((g) => { g.sesi.pelatihan.bentuk = "Daring"; g.sesi.pelatihan.pulsa = true; g.peran.pml.status = "Organik"; g.peran.ppl.status = "Organik"; g.peran.ppl.nOrg = 1; });
    expect(kebutuhan(tanpa).some((n) => n.paket[0] === "521211-D" && n.teks.includes("peserta"))).toBe(false);
  });
  it("rapat persiapan, pelaksanaan, evaluasi: konsumsi bila luring (tatap muka) + ada mitra; keduanya harus terpenuhi", () => {
    for (const id of ["persiapan", "pelaksanaan", "evaluasi"] as const) {
      const ada = (f: Form) => kebutuhan(f).some((n) => n.teks.includes(`rapat ${id}`));
      expect(ada(contoh((g) => { g.rapat[id] = { on: true, media: ["Tatap muka"], mitra: false }; }))).toBe(true); // luring + ada mitra (penanda mitra lama diabaikan)
      expect(ada(contoh((g) => { g.rapat[id] = { on: true, media: ["Zoom"], mitra: true }; }))).toBe(false); // bukan luring
      const tanpaMitra = contoh((g) => { g.rapat[id] = { on: true, media: ["Tatap muka"], mitra: true }; g.peran.pml.status = "Organik"; g.peran.ppl.status = "Organik"; g.peran.ppl.nOrg = 1; });
      expect(ada(tanpaMitra)).toBe(false); // luring tetapi tanpa mitra
      expect(periksa(tanpaMitra, 2026).peringatan).toContain(`Rapat ${id} tatap muka: tidak ada petugas mitra, konsumsi tidak dihitung.`);
    }
  });
  it("awalForm: semua tanggal bawaannya Perkiraan dan pengolahan sama dengan pendataan", () => {
    const f = awalForm();
    expect(f.jend.perk).toBe(true);
    expect(f.tunggal.perk).toBe(true);
    for (const k of ["updating", "pengolahan", "pasca", "diseminasi"] as const) expect(f.rel[k].perk).toBe(true);
    expect(f.rel.pengolahan).toMatchObject({ aM: "mulai", dM: 0, aS: "selesai", dS: 0 });
  });
  it("translok ditanyakan pada semua peran; cetak buku = persediaan 521811; rilis dan spanduk dihapus", () => {
    const f = contoh((g) => { g.peran.ppl.translok = true; g.peran.supervisor.translok = false; });
    const tl = kebutuhan(f).filter((n) => n.akun === "524113").map((n) => n.teks);
    expect(tl).toContain("Translok PPL");
    expect(tl).not.toContain("Translok Supervisor");
    const buku = contoh((g) => { g.cetakBuku = true; g.cetakKab = true; });
    expect(kebutuhan(buku).find((n) => n.akun === "521811")).toMatchObject({ paket: ["521811"], jalur: "Pengadaan" });
    expect(kebutuhan(contoh((g) => { g.cetakBuku = true; g.cetakKab = false; })).some((n) => n.akun === "521811")).toBe(false);
    expect(kebutuhan(contoh((g) => { g.adaDiseminasi = false; g.cetakBuku = true; g.cetakKab = true; })).some((n) => n.akun === "521811")).toBe(false);
    expect(akunDipicu(buku)).not.toContain("522191");
    const lama = normalisasi({ rilis: true, spanduk: true, cetakBuku: true }) as unknown as Record<string, unknown>;
    expect("rilis" in lama || "spanduk" in lama).toBe(false);
  });
  it("berbagi pelatihan menghapus kebutuhan sesi", () => {
    const f = contoh((g) => { g.berbagi = true; g.rujukan = "Seruti Triwulan II 2026"; });
    expect(akunDipicu(f)).toEqual(["521211", "521213", "524111", "524113"]); // 521211 tetap dari rapat evaluasi tatap muka
    expect(kebutuhan(f).some((n) => n.akun === "522151")).toBe(false);
  });
  it("pulsa lapangan FASIH tidak ganda bila pulsa sesi sudah ada", () => {
    const f = contoh((g) => { g.sesi.pelatihan.bentuk = "Hybrid"; g.sesi.pelatihan.pulsa = true; g.pulsaLap = true; });
    expect(kebutuhan(f).filter((n) => n.paket[0] === "521211-D")).toHaveLength(1);
  });
  it("petugas entri hanya untuk PAPI", () => {
    const f = contoh((g) => { g.peran.entri.on = true; g.peran.entri.honor = true; });
    expect(kebutuhan(f).some((n) => n.teks.includes("Petugas entri"))).toBe(false);
    f.instrumen = "PAPI";
    expect(kebutuhan(f).some((n) => n.teks.includes("Petugas entri"))).toBe(true);
  });
  it("tanpa pendataan: tidak ada honor/translok dan mitra 0", () => {
    const f = contoh((g) => { g.instrumen = "Tanpa pendataan"; });
    expect(kebutuhan(f).some((n) => n.sumber === "E")).toBe(false);
    expect(hitungMitra(f)).toBe(0);
  });
  it("mitra dan petugas dihitung dari status", () => {
    const f = contoh();
    expect(hitungMitra(f)).toBe(16);
    expect(ringkasPetugas(f)).toMatchObject({ totOrg: 3, totMit: 16, total: 19, mitraPeran: ["PML", "PPL"], perkPeran: ["PML", "PPL"] });
  });
  it("Ad-hoc: honor tim hanya bila periode Ad-hoc dan honor = Ya", () => {
    const f = contoh((g) => { g.tim = { honor: true, ketua: true, wakil: false, anggota: true }; });
    expect(jabatanHonorTim(f)).toEqual([]); // bukan Ad-hoc: diabaikan
    expect(kebutuhan(f).some((n) => n.sumber === "E2")).toBe(false);
    f.periode = "Ad-hoc"; f.keList = ["Ad-hoc"];
    expect(jabatanHonorTim(f)).toEqual(["Ketua tim", "Anggota"]);
    const n = kebutuhan(f).find((x) => x.sumber === "E2");
    expect(n).toMatchObject({ akun: "521213", paket: ["521213-P"], jalur: "Non-pengadaan" });
    f.tim.honor = false;
    expect(kebutuhan(f).some((x) => x.sumber === "E2")).toBe(false);
  });
  it("Ad-hoc: honor tim tanpa centang jabatan adalah masalah", () => {
    const f = contoh((g) => { g.periode = "Ad-hoc"; g.keList = ["Ad-hoc"]; g.sesi.pelatihan.tgl = { "Ad-hoc": { mulai: "2026-02-23", selesai: "2026-02-25" } }; g.tim = { honor: true, ketua: false, wakil: false, anggota: false }; });
    expect(periksa(f, 2026).masalah).toContain("Honor tim: centang minimal satu jabatan (ketua tim, wakil, atau anggota).");
    f.tim.wakil = true;
    expect(periksa(f, 2026).masalah).toEqual([]);
  });
  it("sesi luring atau hybrid wajib memilih tempat; tanpa mitra diberi peringatan", () => {
    const f = contoh((g) => { g.sesi.pelatihan.tempat = ""; });
    expect(periksa(f, 2026).masalah).toContain("Pelatihan: pilih tempat pelaksanaan (kantor, hotel, atau lokasi lain).");
    const g2 = contoh((g) => { g.peran.pml.status = "Organik"; g.peran.ppl.status = "Organik"; g.peran.ppl.nOrg = 1; });
    expect(periksa(g2, 2026).peringatan).toContain("Pelatihan luring: tidak ada petugas mitra, konsumsi atau paket tidak dihitung.");
  });
});

describe("pemeriksaan", () => {
  it("contoh mockup lengkap, dengan tiga peringatan perkiraan", () => {
    const r = periksa(contoh(), 2026);
    expect(r.masalah).toEqual([]);
    expect(r.peringatan).toEqual([
      "Jadwal Pasca pengolahan masih perkiraan.",
      "Jadwal Diseminasi masih perkiraan.",
      "Jumlah petugas masih perkiraan: PML, PPL.",
    ]);
  });
  it("formulir awal kosong: nama, tanggal pelatihan, dll. diminta", () => {
    const r = periksa(awalForm(), 2026);
    expect(r.masalah).toContain("Nama survei wajib diisi.");
  });
  it("pelatihan tidak boleh beririsan dengan pendataan", () => {
    const r = periksa(contoh((f) => { f.sesi.pelatihan.tgl["Triwulan I"] = { mulai: "2026-02-27", selesai: "2026-03-02" }; }), 2026);
    expect(r.masalah).toContain("Pendataan dimulai sebelum pelatihan selesai (tidak boleh beririsan).");
  });
  it("PPL wajib; honor organik perlu dasar; jumlah minimal 1", () => {
    let r = periksa(contoh((f) => { f.peran.ppl.on = false; }), 2026);
    expect(r.masalah).toContain("PPL wajib dipakai bila ada pendataan (usulan).");
    r = periksa(contoh((f) => { f.peran.kortim = { ...f.peran.kortim, on: true, honor: true, status: "Organik", nOrg: 1 }; }), 2026);
    expect(r.masalah).toContain("Kortim: honorarium untuk status Organik perlu lampiran dasar atau juknis.");
    r = periksa(contoh((f) => { f.peran.ppl.nMit = 0; }), 2026);
    expect(r.masalah).toContain("PPL: isi jumlah petugas mitra (minimal 1).");
  });
  it("pengecualian wajib beralasan; pengecualian dengan tanggal terbalik ditolak", () => {
    const r = periksa(contoh((f) => { f.keList = ["Triwulan I", "Triwulan II"]; f.kecuali = { "Triwulan II": { on: true, mulai: "2026-07-20", selesai: "2026-07-06", alasan: "", perk: false } }; }), 2026);
    expect(r.masalah).toContain("Triwulan II: Pendataan: tanggal selesai sebelum tanggal mulai.");
    expect(r.masalah).toContain("Triwulan II: pengecualian jadwal wajib disertai alasan.");
  });
  it("berbagi pelatihan: rujukan wajib, tidak boleh diri sendiri, belum sah = peringatan", () => {
    expect(periksa(contoh((f) => { f.berbagi = true; }), 2026).masalah).toContain("Pilih survei yang dirujuk untuk pelatihan dan briefing.");
    expect(periksa(contoh((f) => { f.berbagi = true; f.rujukan = f.nama; }), 2026).masalah).toContain("Survei tidak dapat merujuk dirinya sendiri.");
    const r = periksa(contoh((f) => { f.berbagi = true; f.rujukan = "Lain"; }), 2026, { rujukan: { sah: false } });
    expect(r.masalah).toEqual([]);
    expect(r.peringatan).toContain("Survei yang dirujuk belum disahkan; pelatihannya belum dapat dipastikan.");
  });
  it("rapat dan bentuk sesi", () => {
    const r = periksa(contoh((f) => { f.rapat.evaluasi.media = []; f.sesi.pelatihan.bentuk = ""; }), 2026);
    expect(r.masalah).toContain("Rapat evaluasi: pilih minimal satu media.");
    expect(r.masalah).toContain("Pelatihan: pilih bentuk pelaksanaan.");
  });
  it("jadwalValid memberi daftar perkiraan", () => {
    const r = jadwalValid(contoh(), "Triwulan I", 2026);
    expect(r.perk).toEqual(["pasca", "diseminasi"]);
  });
});

describe("kematangan", () => {
  it("contoh mockup: 9 butir (termasuk jadwal pelatihan dan instruktur Fix), 4 perkiraan", () => {
    const k = kematangan(contoh());
    expect(k.butir).toHaveLength(9);
    expect(k.butir).toContainEqual({ t: "Instruktur pelatihan", perk: false });
    expect(k.butir).toContainEqual({ t: "Jadwal pelatihan", perk: false });
    expect(k.nPerk).toBe(4);
    expect(k.nFix).toBe(5);
    expect(k.butir.filter((b) => b.perk).map((b) => b.t)).toEqual(["Jadwal Pasca pengolahan (relatif)", "Jadwal Diseminasi (relatif)", "Jumlah petugas PML", "Jumlah petugas PPL"]);
  });
});

describe("jadwal sesi dan rapat: Perkiraan atau Fix", () => {
  const TW1 = "Triwulan I";
  it("rapat evaluasi dan pelatihan Perkiraan (bulan + minggu) masuk kematangan dan peringatan", () => {
    const f = contoh((g) => {
      g.rapat.evaluasi.tgl = { [TW1]: ubahRec(undefined, { bulan: 3, minggu: 2 }, 2026) };
      g.sesi.pelatihan.tgl[TW1] = ubahRec(undefined, { bulan: 1, minggu: 3 }, 2026);
    });
    expect(tanggalRapat(f, "evaluasi", TW1, 2026)).toEqual({ mulai: "2026-04-13", selesai: "2026-04-17" });
    expect(f.sesi.pelatihan.tgl[TW1]).toMatchObject({ mulai: "2026-02-16", selesai: "2026-02-20" });
    const k = kematangan(f);
    expect(k.butir).toContainEqual({ t: "Jadwal rapat evaluasi", perk: true });
    expect(k.butir).toContainEqual({ t: "Jadwal pelatihan", perk: true });
    const r = periksa(f, 2026);
    expect(r.peringatan).toContain("Jadwal rapat evaluasi masih perkiraan.");
    expect(r.peringatan).toContain("Jadwal pelatihan masih perkiraan.");
  });
  it("rapat tanpa jadwal tidak dihitung sebagai butir maupun peringatan", () => {
    const f = contoh();
    expect(kematangan(f).butir.some((b) => b.t.startsWith("Jadwal rapat"))).toBe(false);
    expect(periksa(f, 2026).peringatan.some((p) => p.includes("rapat"))).toBe(false);
  });
  it("pelatihan Perkiraan yang beririsan dengan pendataan hanya jadi peringatan; yang Fix tetap masalah", () => {
    const psn = "Pendataan dimulai sebelum pelatihan selesai (tidak boleh beririsan).";
    const perk = periksa(contoh((g) => { g.sesi.pelatihan.tgl[TW1] = ubahRec(undefined, { bulan: 2, minggu: 1 }, 2026); }), 2026);
    expect(perk.masalah).not.toContain(psn);
    expect(perk.peringatan).toContain("Pendataan dimulai sebelum pelatihan selesai (jadwal pelatihan masih perkiraan).");
    const fix = periksa(contoh((g) => { g.sesi.pelatihan.tgl[TW1] = ubahRec(undefined, { perk: false, mode: "rentang", mulai: "2026-02-27", selesai: "2026-03-02" }, 2026); }), 2026);
    expect(fix.masalah).toContain(psn);
  });
  it("rapat Fix dengan tanggal selesai sebelum mulai = masalah", () => {
    const f = contoh((g) => { g.rapat.evaluasi.tgl = { [TW1]: ubahRec(undefined, { perk: false, mode: "rentang", mulai: "2026-04-17", selesai: "2026-04-13" }, 2026) }; });
    expect(periksa(f, 2026).masalah).toContain("Rapat evaluasi: tanggal selesai sebelum tanggal mulai.");
  });
  it("periode turunan: tanggal rapat digeser sebesar selisih mulai pendataan", () => {
    const f = contoh((g) => {
      g.keList = [TW1, "Triwulan II"];
      g.rapat.evaluasi.tgl = { [TW1]: ubahRec(undefined, { bulan: 3, minggu: 2 }, 2026) };
    });
    const a = tanggalRapat(f, "evaluasi", TW1, 2026);
    const b = tanggalRapat(f, "evaluasi", "Triwulan II", 2026);
    const d = selisihHari(hitungJadwal(f, "Triwulan II", 2026).pendataan!.mulai, hitungJadwal(f, TW1, 2026).pendataan!.mulai);
    expect(selisihHari(b.mulai, a.mulai)).toBe(d);
    expect(selisihHari(b.selesai, a.selesai)).toBe(d);
  });
  it("normalisasi memulihkan rekaman jadwal yang ngawur dan mempertahankan data lama", () => {
    const f = normalisasi({ rapat: { evaluasi: { tgl: { [TW1]: { mulai: "2026-04-13", selesai: "2026-04-17", bulan: 99, minggu: 0, perk: "ya" } } } }, sesi: { pelatihan: { tgl: { [TW1]: { mulai: "2026-02-23", selesai: "2026-02-25" } } } } });
    expect(f.rapat.evaluasi.tgl?.[TW1]).toEqual({ mulai: "2026-04-13", selesai: "2026-04-17", bulan: 11, minggu: 1 });
    expect(f.sesi.pelatihan.tgl[TW1]).toEqual({ mulai: "2026-02-23", selesai: "2026-02-25" });
  });
  it("bedaForm memberi label yang terbaca untuk jadwal rapat", () => {
    const a = contoh();
    const b = contoh((g) => { g.rapat.evaluasi.tgl = { [TW1]: ubahRec(undefined, { bulan: 3, minggu: 2 }, 2026) }; });
    const t = bedaForm(a, b).map((x) => x.t);
    expect(t).toContain("Rapat evaluasi (Triwulan I): bulan: (kosong) → April");
    expect(t).toContain("Rapat evaluasi (Triwulan I): penanda Fix atau Perkiraan: Fix → Perkiraan");
  });
});

describe("normalisasi", () => {
  it("melengkapi isian sebagian dan membatasi nilai", () => {
    const f = normalisasi({ nama: "x", jend: { mb: 99, mn: 0 }, periode: "Tidak dikenal", keList: ["Triwulan II", "Triwulan I", "Lain"], peran: { ppl: { nMit: -5 } } });
    expect(f.jend.mb).toBe(24);
    expect(f.jend.mn).toBe(1);
    expect(f.periode).toBe("Triwulanan");
    expect(f.keList).toEqual(["Triwulan I", "Triwulan II"]);
    expect(f.peran.ppl.nMit).toBe(0);
    expect(f.peran.supervisor.on).toBe(true);
    expect(f.tim).toEqual({ honor: false, ketua: false, wakil: false, anggota: false });
  });
  it("masukan bukan objek menghasilkan formulir awal", () => {
    expect(normalisasi(null)).toEqual(awalForm());
    expect(normalisasi("xx")).toEqual(awalForm());
  });
  it("bolak-balik JSON stabil", () => {
    const f = contoh();
    expect(normalisasi(JSON.parse(JSON.stringify(f)))).toEqual(f);
  });
});

describe("beda dan dampak revisi", () => {
  it("menyebut isian yang berubah dengan label mudah dibaca", () => {
    const a = contoh(); const b = contoh((f) => { f.peran.ppl.nMit = 20; f.jend.perk = true; f.tim.honor = false; });
    const d = bedaForm(a, b).map((x) => x.t);
    expect(d).toContain("PPL: jumlah mitra: 12 → 20");
    expect(d).toContain("Pola jendela pendataan: penanda Fix atau Perkiraan: Fix → Perkiraan");
    expect(bedaForm(a, a)).toEqual([]);
  });
  it("dampak: mitra bertambah, akun tetap", () => {
    const a = contoh(); const b = contoh((f) => { f.peran.ppl.nMit = 20; });
    const t = dampakRevisi(a, b);
    expect(t).toContain("kebutuhan mitra 16 menjadi 24 orang");
    expect(t).toContain("daftar akun tidak berubah");
    expect(t).toContain("jadwal dan agenda tetap");
    expect(dampakRevisi(a, a)).toBe("");
  });
  it("dampak: akun bertambah dan jadwal berubah", () => {
    const a = contoh(); const b = contoh((f) => { f.cetakBuku = true; f.cetakKab = true; f.jend.sn = 20; f.jend.sj = "tgl"; });
    const t = dampakRevisi(a, b);
    expect(t).toContain("akun bertambah 521811");
    expect(t).toContain("PPK dan Tata Usaha (paralel), lalu KPA");
    expect(t).toContain("jadwal atau agenda berubah");
  });
});

describe("persetujuan paralel: label, langkah, tombol", () => {
  const dasar = { status: "draf" as const, ver: 0, rev: false, langkah: 0, kembali_oleh: null, catatan_kembali: "", diajukan_oleh: 7, dibuat_oleh: 7 };
  const menunggu = (o: Partial<{ ok_ppk: boolean; ok_tu: boolean; pasca_h15: boolean; langkah: number }>) => ({ ...dasar, status: "menunggu_setuju" as const, ...o });
  it("nama versi: identifikasi awal, lalu terupdate", () => {
    expect(namaVersi(1)).toBe("Identifikasi awal");
    expect(namaVersi(2)).toBe("Terupdate v2");
    expect(namaVersi(3)).toBe("Terupdate v3");
  });
  it("siapa yang ditunggu", () => {
    expect(siapaMenunggu({})).toBe("PPK dan Tata Usaha");
    expect(siapaMenunggu({ ok_tu: true })).toBe("PPK");
    expect(siapaMenunggu({ ok_ppk: true })).toBe("Tata Usaha");
    expect(siapaMenunggu({ ok_ppk: true, ok_tu: true })).toBe("KPA");
    expect(siapaMenunggu({ pasca_h15: true })).toBe("KPA (sesudah H-15)");
  });
  it("label status", () => {
    expect(labelStatus(dasar)).toMatchObject({ teks: "Draf", nada: "abu" });
    expect(labelStatus({ ...dasar, kembali_oleh: "Tata Usaha", catatan_kembali: "Lengkapi" })).toMatchObject({ teks: "Draf, dikembalikan", nada: "merah" });
    expect(labelStatus(menunggu({})).teks).toBe("Menunggu PPK dan Tata Usaha");
    expect(labelStatus(menunggu({ ok_tu: true, langkah: 1 })).teks).toBe("Menunggu PPK");
    expect(labelStatus({ ...menunggu({ ok_ppk: true, ok_tu: true, langkah: 2 }), rev: true, ver: 1 }).teks).toBe("Menunggu KPA (revisi)");
    expect(labelStatus({ ...menunggu({ pasca_h15: true }), rev: true, ver: 1 })).toMatchObject({ teks: "Menunggu KPA (sesudah H-15) (revisi)" });
    expect(labelStatus({ ...dasar, status: "sah", ver: 1 })).toMatchObject({ teks: "Identifikasi awal", nada: "hijau" });
    expect(labelStatus({ ...dasar, status: "sah", ver: 2 })).toMatchObject({ teks: "Terupdate v2", nada: "hijau" });
    expect(labelStatus({ ...dasar, status: "revisi", ver: 2 }).teks).toBe("Revisi v3 (draf)");
  });
  it("langkah tampil", () => {
    const st = (o: Parameters<typeof menunggu>[0]) => langkahTampil({ ...menunggu(o), kembali_oleh: null }).map((l) => l.status);
    expect(st({})).toEqual(["Giliran sekarang", "Giliran sekarang", "Menunggu giliran"]); // PPK dan TU paralel
    expect(st({ ok_tu: true, langkah: 1 })).toEqual(["Giliran sekarang", "Disetujui", "Menunggu giliran"]);
    expect(st({ ok_ppk: true, ok_tu: true, langkah: 2 })).toEqual(["Disetujui", "Disetujui", "Giliran sekarang"]);
    expect(st({ pasca_h15: true })).toEqual(["Tidak diperlukan", "Tidak diperlukan", "Giliran sekarang"]);
    expect(langkahTampil({ status: "sah", langkah: 3, kembali_oleh: null }).every((l) => l.status === "Disetujui")).toBe(true);
    expect(langkahTampil({ status: "draf", langkah: 0, kembali_oleh: "PPK" })[0].status).toBe("Mengembalikan");
  });
  it("tombol sesuai hak dan giliran", () => {
    const admin = { ...HAK_KOSONG, susun: true };
    expect(aksiTersedia(dasar, admin, 6)).toEqual(["simpan", "kirim", "batal"]);
    expect(aksiTersedia({ ...dasar, status: "revisi", ver: 1 }, admin, 6)).toEqual(["simpan", "kirim", "batal_revisi"]);
    expect(aksiTersedia(dasar, HAK_KOSONG, 12)).toEqual([]);
    const m = { ...dasar, status: "menunggu_ketua" as const, diajukan_oleh: 6 };
    expect(aksiTersedia(m, { ...HAK_KOSONG, ketua: true }, 4)).toEqual(["setuju_ketua", "kembalikan", "tarik"]);
    expect(aksiTersedia(m, { ...HAK_KOSONG, ketua: true }, 6)).toEqual(["kembalikan", "tarik"]); // pengirim tidak menyetujui sendiri
    // PPK dan TU boleh lebih dulu mana pun; KPA menunggu keduanya
    expect(aksiTersedia(menunggu({}), { ...HAK_KOSONG, ppk: true }, 3)).toEqual(["setujui", "kembalikan", "tarik"]);
    expect(aksiTersedia(menunggu({}), { ...HAK_KOSONG, tu: true }, 8)).toEqual(["setujui", "kembalikan"]);
    expect(aksiTersedia(menunggu({}), { ...HAK_KOSONG, kpa: true }, 2)).toEqual([]); // KPA belum boleh
    expect(aksiTersedia(menunggu({ ok_ppk: true, langkah: 1 }), { ...HAK_KOSONG, ppk: true }, 3)).toEqual([]); // PPK tidak dua kali
    expect(aksiTersedia(menunggu({ ok_ppk: true, langkah: 1 }), { ...HAK_KOSONG, tu: true }, 8)).toEqual(["setujui", "kembalikan"]); // sudah ada yang menyetujui: tidak bisa ditarik
    expect(aksiTersedia(menunggu({ ok_ppk: true, ok_tu: true, langkah: 2 }), { ...HAK_KOSONG, kpa: true }, 2)).toEqual(["setujui", "kembalikan"]);
    // sesudah H-15 hanya KPA
    expect(aksiTersedia(menunggu({ pasca_h15: true }), { ...HAK_KOSONG, ppk: true, tu: true }, 3)).toEqual(["tarik"]); // PPK pengirim masih bisa menarik (langkah 0)
    expect(aksiTersedia(menunggu({ pasca_h15: true }), { ...HAK_KOSONG, kpa: true }, 2)).toEqual(["setujui", "kembalikan"]);
    expect(aksiTersedia({ ...dasar, status: "sah", ver: 1 }, admin, 6)).toEqual(["ajukan_revisi"]);
  });
});

describe("penegasan H-15", () => {
  it("status menurut tanggal (jendela H-15 sampai hari mulai)", () => {
    const mulai = "2026-03-01";
    const s = (hariIni: string, sudah = false, adaSah = true) => statusH15({ adaSah, hariIni, asliMulai: mulai, sudahDiperbarui: sudah }).status;
    expect(s("2026-02-12")).toBe("Belum waktunya");
    expect(s("2026-02-14")).toBe("Jatuh tempo H-15, tegaskan tanggal");
    expect(s("2026-03-01")).toBe("Jatuh tempo H-15, tegaskan tanggal");
    expect(s("2026-03-02")).toBe("Terlambat");
    expect(s("2026-03-02", true)).toBe("Sudah ditegaskan");
    expect(s("2026-02-14", false, false)).toBe("Menunggu identifikasi awal disahkan");
  });
  it("tanggal tidak boleh bergeser (ambang 7 hari dihapus): perubahan tanggal lewat revisi", () => {
    const asli = { mulai: "2026-03-01", selesai: "2026-03-31" };
    expect(periksaGeser(asli, { mulai: "2026-03-01", selesai: "2026-03-31" })).toMatchObject({ geserMulai: 0, geserSelesai: 0, lewat: false, salah: false });
    expect(periksaGeser(asli, { mulai: "2026-03-02", selesai: "2026-03-31" })).toMatchObject({ geserMulai: 1, lewat: true });
    expect(periksaGeser(asli, { mulai: "2026-03-08", selesai: "2026-03-31" }).lewat).toBe(true);
    expect(periksaGeser(asli, { mulai: "2026-03-01", selesai: "2026-04-09" })).toMatchObject({ geserSelesai: 9, lewat: true });
    expect(periksaGeser(asli, { mulai: "2026-03-05", selesai: "2026-03-04" }).salah).toBe(true);
    expect(periksaGeser(asli, { mulai: "", selesai: "2026-03-04" }).salah).toBe(true);
  });
  it("mulai pendataan paling awal, tanggal H-15, dan sesudah H-15 (revisi hanya KPA)", () => {
    const f = contoh((g) => { g.keList = ["Triwulan I", "Triwulan II"]; });
    expect(mulaiPendataanAwal(f, 2026)).toBe("2026-03-01");
    expect(tanggalH15(f, 2026)).toBe("2026-02-14");
    expect(sesudahH15(f, 2026, "2026-02-13")).toBe(false);
    expect(sesudahH15(f, 2026, "2026-02-14")).toBe(true);
    expect(sesudahH15(f, 2026, "2026-06-01")).toBe(true);
    expect(mulaiPendataanAwal(contoh((g) => { g.instrumen = "Tanpa pendataan"; }), 2026)).toBeNull();
    expect(tanggalH15(contoh((g) => { g.instrumen = "Tanpa pendataan"; }), 2026)).toBeNull();
    const tunggal = contoh((g) => { g.periode = "Tanpa periode"; g.keList = []; g.tunggal = { mulai: "2026-05-04", selesai: "2026-05-18", perk: false }; });
    expect(tanggalH15(tunggal, 2026)).toBe("2026-04-19");
    expect(mulaiPendataanAwal(contoh((g) => { g.periode = "Tanpa periode"; g.keList = []; }), 2026)).toBeNull(); // tanggal kosong
    // pengecualian periode memajukan tanggal awal
    const kecuali = contoh((g) => { g.keList = ["Triwulan I", "Triwulan II"]; g.kecuali = { "Triwulan II": { on: true, mulai: "2026-02-02", selesai: "2026-02-20", alasan: "uji", perk: false } }; });
    expect(mulaiPendataanAwal(kecuali, 2026)).toBe("2026-02-02");
  });
  it("baris H-15 per periode; kosong bila tanpa periode atau tanpa pendataan", () => {
    const f = contoh((g) => { g.keList = ["Triwulan I", "Triwulan II"]; });
    const b = barisH15(f, 2026, { "Triwulan I": { mulai: "2026-03-03", selesai: "2026-03-31" } }, "2026-05-20");
    expect(b.map((x) => [x.periode, x.h15, x.status])).toEqual([["Triwulan I", "2026-02-14", "Sudah ditegaskan"], ["Triwulan II", "2026-05-17", "Jatuh tempo H-15, tegaskan tanggal"]]);
    expect(b[0].efektif).toEqual({ mulai: "2026-03-03", selesai: "2026-03-31" });
    expect(barisH15(contoh((g) => { g.instrumen = "Tanpa pendataan"; }), 2026, null, "2026-01-01")).toEqual([]);
    expect(barisH15(contoh((g) => { g.periode = "Tanpa periode"; g.keList = []; }), 2026, null, "2026-01-01")).toEqual([]);
  });
});

describe("turunan hilir", () => {
  it("agenda memuat jadwal berpenanda, sesi, rapat, penugasan, dan H-15", () => {
    const t = agendaPeriode(contoh(), 2026, "Triwulan I").map((x) => x.t);
    expect(t[0]).toBe("Pendataan: 01/03/2026 s.d. 31/03/2026 (fix)");
    expect(t).toContain("Pelatihan luring: 23/02/2026 s.d. 25/02/2026");
    expect(t).toContain("Penugasan pengajar atau narasumber eksternal untuk pelatihan");
    expect(t).toContain("Rapat pelaksanaan (zoom)");
    expect(t).toContain("Penegasan tanggal periode H-15 (Triwulan I): 14/02/2026, oleh ketua tim atau operator");
    expect(t).toContain("Konsultasi teknis: tatap muka (perjalanan dinas)");
  });
  it("agenda mengikuti penegasan H-15", () => {
    const t = agendaPeriode(contoh(), 2026, "Triwulan I", { mulai: "2026-03-04", selesai: "2026-03-31" }).map((x) => x.t);
    expect(t).toContain("Pendataan Triwulan I sesudah penegasan: 04/03/2026 s.d. 31/03/2026");
    expect(t[0]).toBe("Pendataan: 04/03/2026 s.d. 31/03/2026 (fix)");
  });
  it("agenda Ad-hoc memuat honor tim", () => {
    const f = contoh((g) => { g.periode = "Ad-hoc"; g.keList = ["Ad-hoc"]; g.tim = { honor: true, ketua: true, wakil: true, anggota: false }; });
    expect(agendaPeriode(f, 2026, "Ad-hoc").map((x) => x.t)).toContain("Honor tim pelaksana: ketua tim, wakil");
  });
  it("rekrutmen dan evaluasi", () => {
    const r = rekrutmenDari(contoh());
    expect(r[0].t).toBe("Kebutuhan mitra seluruh peran: 16 orang (memuat perkiraan)");
    expect(r.map((x) => x.t)).toContain("Rekrut mitra PML: 4 orang (perkiraan)");
    expect(rekrutmenDari(contoh((f) => { f.instrumen = "Tanpa pendataan"; }))[0].t).toBe("Tanpa pendataan: rekrutmen tidak aktif.");
    expect(evaluasiDari(contoh())).toEqual(["Rapat evaluasi (wajib): tatap muka", "Umpan balik petugas lapangan", "Penilaian mitra: PML, PPL", "Rencana perbaikan (selalu)"]);
  });
});

describe("pencocokan paket belanja dengan POK", () => {
  const pok: BarisPok[] = [
    { kunci: "a", akun: "521211", uraian: "Snack peserta", paket: ["521211-A"] },
    { kunci: "b", akun: "524113", uraian: "Transport lokal", paket: ["524113-B"] },
    { kunci: "c", akun: "524111", uraian: "Perjalanan dinas", paket: ["524111-A"] },
    { kunci: "d", akun: "522151", uraian: "Honor narasumber", paket: [] },
    { kunci: "e", akun: "521213", uraian: "Honor mitra", paket: ["524113-A"] }, // paket salah akun: diabaikan
  ];
  it("tiga keadaan: ada, paket belum, hilang", () => {
    const h = cocokkanPok(kebutuhan(contoh()), pok);
    const by = Object.fromEntries(h.map((x) => [x.akun, x]));
    expect(by["524113"].status).toBe("ada"); // translok: salah satu paket cukup
    expect(by["524111"].status).toBe("ada");
    expect(by["521211"]).toMatchObject({ status: "paket_belum" });
    expect(by["521211"].ket).toContain("521211-B");
    expect(by["522151"]).toMatchObject({ status: "paket_belum" });
    expect(by["522151"].saran).toContain("Honor narasumber");
    expect(by["521213"].status).toBe("paket_belum"); // paket 524113-A pada akun 521213 tidak dihitung
    expect(cocokkanPok(kebutuhan(contoh()), pok.filter((r) => r.akun !== "524111")).find((x) => x.akun === "524111")?.status).toBe("hilang");
  });
  it("paket yang boleh dipilih untuk suatu akun", () => {
    expect(paketUntukAkun("521211")).toEqual(["521211-A", "521211-B", "521211-D"]);
    expect(paketUntukAkun("522151")).toEqual(["522151"]);
    expect(paketUntukAkun("524114")).toEqual(["524114"]);
    expect(paketUntukAkun("524119")).toEqual(["524119"]);
    expect(paketUntukAkun("521811")).toEqual(["521811"]);
    expect(paketUntukAkun("999999")).toEqual([]);
  });
});

describe("tujuanPesan: kalimat menuju kartu terkait", () => {
  it("jadwal tahap menuju kartu tahap masing-masing", () => {
    expect(tujuanPesan("Jadwal Pasca pengolahan masih perkiraan.")).toBe("tahap-pasca");
    expect(tujuanPesan("Jadwal Diseminasi masih perkiraan.")).toBe("tahap-diseminasi");
    expect(tujuanPesan("Jadwal Updating (relatif)")).toBe("tahap-updating");
    expect(tujuanPesan("Pengolahan dimulai sebelum pendataan dimulai.")).toBe("tahap-pengolahan");
    expect(tujuanPesan("Pendataan dimulai sebelum updating selesai (tidak boleh beririsan).")).toBe("tahap-pendataan");
    expect(tujuanPesan("Pola jendela pendataan")).toBe("tahap-pendataan");
  });
  it("petugas, rapat, pelatihan, instrumen, dan bagian E (dulu F)", () => {
    expect(tujuanPesan("Jumlah petugas masih perkiraan: PML, PPL.")).toBe("bagian-d");
    expect(tujuanPesan("Penugasan Supervisor (organik; organik 1, fix): translok ya, honor tidak")).toBe("bagian-d");
    expect(tujuanPesan("Rapat evaluasi (wajib): tatap muka")).toBe("bagian-c");
    expect(tujuanPesan("Rapat persiapan menghadirkan mitra, tetapi tidak ada petugas mitra pada peran lapangan.")).toBe("bagian-c");
    expect(tujuanPesan("Survei yang dirujuk belum disahkan; pelatihannya belum dapat dipastikan.")).toBe("bagian-b");
    expect(tujuanPesan("Pendataan lapangan (FASIH)")).toBe("bagian-instrumen");
    expect(tujuanPesan("Cetak buku publikasi")).toBe("bagian-e");
    expect(tujuanPesan("Nama survei wajib diisi.")).toBe("bagian-a");
  });
  it("huruf bagian di ujung kalimat dan penegasan H-15", () => {
    expect(tujuanPesan("Translok Supervisor (D)")).toBe("bagian-d"); // huruf tampil baru: Organisasi pendataan lapangan = D
    expect(tujuanPesan("Konsumsi rapat evaluasi tatap muka (C)")).toBe("bagian-c");
    expect(tujuanPesan("Konsultasi teknis tatap muka (E)")).toBe("bagian-e");
    expect(tujuanPesan("Penegasan tanggal periode H-15 (Triwulan I): 14/02/2026, oleh ketua tim atau operator")).toBe("h-h15");
  });
  it("huruf tampil sumber kebutuhan mengikuti susunan formulir baru (kode sumber internal tidak berubah)", () => {
    const peta = ["B", "C", "D", "E", "E2", "F2", "H2"].map(hurufBagianDariSumber);
    expect(peta).toEqual(["B", "C", "A", "D", "D", "E", "E"]);
    expect(hurufBagianDariSumber("X")).toBe("X");
    // setiap huruf tampil menuju kartu yang ada
    for (const h of ["A", "B", "C", "D", "E"]) expect(tujuanPesan(`Contoh (${h})`)).toBe(`bagian-${h.toLowerCase()}`);
  });
  it("kalimat tanpa tujuan pasti tidak dipaksa", () => {
    expect(tujuanPesan("Rencana perbaikan (selalu)")).toBeNull();
    expect(tujuanPesan("")).toBeNull();
  });
});

describe("instruktur pelatihan dan briefing (identifikasi awal)", () => {
  it("bawaan: kosong dan Perkiraan; salinan lama tanpa instr dilengkapi", () => {
    const f = normalisasi({ sesi: { pelatihan: { on: true, pengajar: true } } });
    expect(f.sesi.pelatihan.instr).toEqual({ jumlah: 0, level: "", asal: "", jam: 0, perk: true });
    expect(instrLengkap(f.sesi.pelatihan.instr)).toBe(false);
    expect(instrDari({})).toEqual({ jumlah: 0, level: "", asal: "", jam: 0, perk: true });
  });
  it("normalisasi membatasi jumlah, jam, level, dan asal", () => {
    const f = normalisasi({ sesi: { pelatihan: { on: true, pengajar: true, instr: { jumlah: 999, jam: -5, level: "Pusat", asal: "X", perk: "ya" } } } });
    expect(f.sesi.pelatihan.instr).toEqual({ jumlah: 50, level: "", asal: "", jam: 0, perk: true });
    const g = normalisasi({ sesi: { pelatihan: { on: true, pengajar: true, instr: { jumlah: 2, jam: 12, level: "Innas", asal: "Internal BPS", perk: false } } } });
    expect(g.sesi.pelatihan.instr).toEqual({ jumlah: 2, level: "Innas", asal: "Internal BPS", jam: 12, perk: false });
    expect(instrLengkap(g.sesi.pelatihan.instr)).toBe(true);
  });
  it("peringatan bila pengajar Ya tetapi instruktur belum lengkap; hilang bila lengkap atau pengajar Tidak", () => {
    const tidakLengkap = contoh((g) => { g.sesi.pelatihan.instr = { jumlah: 0, level: "", asal: "", jam: 0, perk: true }; });
    expect(periksa(tidakLengkap, 2026).peringatan).toContain("Pelatihan: instruktur belum lengkap (jumlah, level Innas atau Inda, dan perkiraan jam).");
    expect(periksa(tidakLengkap, 2026).masalah).toEqual([]);
    expect(periksa(contoh(), 2026).peringatan.some((x) => x.includes("instruktur"))).toBe(false);
    const tanpa = contoh((g) => { g.sesi.pelatihan.pengajar = false; g.sesi.pelatihan.instr = { jumlah: 0, level: "", asal: "", jam: 0, perk: true }; });
    expect(periksa(tanpa, 2026).peringatan.some((x) => x.includes("instruktur"))).toBe(false);
  });
  it("kebutuhan honor pengajar memuat rincian instruktur bila terisi", () => {
    const k = kebutuhan(contoh()).find((x) => x.akun === "522151")!;
    expect(k.teks).toContain("2 instruktur, Inda, sekitar 8 jam");
    const kosong = contoh((g) => { g.sesi.pelatihan.instr = { jumlah: 0, level: "", asal: "", jam: 0, perk: true }; });
    expect(kebutuhan(kosong).find((x) => x.akun === "522151")!.teks).toBe("Pelatihan: honor pengajar atau narasumber eksternal");
  });
  it("kematangan: instruktur Perkiraan dihitung perkiraan; label beda revisi terbaca", () => {
    const f = contoh((g) => { g.sesi.pelatihan.instr.perk = true; });
    expect(kematangan(f).butir).toContainEqual({ t: "Instruktur pelatihan", perk: true });
    expect(labelJalur("sesi.pelatihan.instr.level")).toBe("Sesi Pelatihan: instruktur level (Innas atau Inda)");
  });
});
