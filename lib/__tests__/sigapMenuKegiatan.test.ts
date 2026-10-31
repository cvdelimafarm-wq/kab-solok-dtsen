import { describe, expect, it } from "vitest";
import { alamatHariIni, alamatPengawasan, alamatSampel, idTranslokMenu, indukMemuatModul, langkahSekali, modulRutin, pakaiTemplateMenu, peranMenuDariInduk, putuskanTab, selaraskanTumpuk, susunBar, tabBarDariTranslok, tahapMenu } from "../sigapMenuKegiatan";

const TL = { href: "/sigap/translok/tok123?p=7", kegiatanId: 2 };

describe("template menu kegiatan", () => {
  it("modul rutin vs sekali jalan", () => {
    for (const m of ["pendataan", "spdt_lembar", "monitoring_korwil", "translok:2", "sampel:5"]) expect(modulRutin(m)).toBe(true);
    for (const m of ["konfirmasi", "pelatihan", "identifikasi", "wilayah_tim"]) expect(modulRutin(m)).toBe(false);
  });

  it("SPDT NTP (semua rutin dan berbar) memakai template", () => {
    expect(pakaiTemplateMenu([{ isi: ["spdt_lembar"] }, { isi: ["translok:2"] }])).toBe(true);
  });

  it("Pascabencana (Fase 4): bagian Pendataan memakai template, tahap Pelatihan diabaikan; konfirmasi/identifikasi = langkah sekali jalan", () => {
    const pasca = [{ isi: ["konfirmasi"] }, { isi: ["pelatihan", "translok:3"] }, { isi: ["monitoring_korwil", "wilayah_tim", "identifikasi", "pendataan", "translok:1"] }, { isi: [] }];
    expect(pakaiTemplateMenu(pasca)).toBe(true);
    // tanpa modul pemicu (lembar pendataan / supervisi) belum bertemplate
    expect(pakaiTemplateMenu([{ isi: ["konfirmasi"] }, { isi: ["pelatihan", "translok:3"] }, { isi: ["wilayah_tim", "translok:1"] }, { isi: [] }])).toBe(false);
    // modul rutin yang halamannya belum berbar membatalkan template
    expect(pakaiTemplateMenu([{ isi: ["pendataan", "sampel:9"] }])).toBe(false);
    // hanya pelatihan: bukan kegiatan bermenu
    expect(pakaiTemplateMenu([{ isi: ["pelatihan", "translok:3"] }])).toBe(false);
  });

  it("tahapMenu membuang tahap Pelatihan; idTranslokMenu hanya translok milik kegiatan bermenu", () => {
    const pasca = [{ isi: ["konfirmasi"] }, { isi: ["pelatihan", "translok:3"] }, { isi: ["pendataan", "translok:1"] }];
    expect(tahapMenu(pasca)).toHaveLength(2);
    expect(idTranslokMenu(pasca)).toEqual([1]);
    expect(idTranslokMenu([{ isi: ["spdt_lembar"] }, { isi: ["translok:2"] }])).toEqual([2]);
  });

  it("peran menu: SPDT menurut spdt.peran; Pascabencana kortim = supervisor, selain itu peran tim", () => {
    expect(peranMenuDariInduk({ spdt: { peran: "pml" } })).toBe("pml");
    expect(peranMenuDariInduk({ spdt: { peran: "supervisor" } })).toBe("supervisor");
    expect(peranMenuDariInduk({ korwil: { kelompok: 1 }, wilayah: { peran: "pml" } })).toBe("supervisor");
    expect(peranMenuDariInduk({ wilayah: { peran: "ppl" } })).toBe("ppl");
    expect(peranMenuDariInduk({ wilayah: { peran: "pml" } })).toBe("pml");
    expect(peranMenuDariInduk({ spdt: null, korwil: null, wilayah: null })).toBeNull();
    expect(peranMenuDariInduk({ wilayah: { peran: "tak-dikenal" } })).toBeNull();
  });

  it("Pascabencana: bar PPL, PML (belum ada lembar pengawasan) dan kortim", () => {
    const TL1 = { href: "/sigap/translok/tokabc?p=4", kegiatanId: 1 };
    const ppl = susunBar({ kode: "pascabencana", peran: "ppl", modul: ["wilayah_tim", "identifikasi", "pendataan"], translok: TL1 });
    expect(ppl.map((x) => x.kunci)).toEqual(["hari_ini", "sampel", "kamera", "translok"]);
    expect(ppl[1].href).toBe("/sigap/pendataan?k=pascabencana");
    expect(ppl[2].href).toBe("/sigap/foto?kegiatan=1");
    const pml = susunBar({ kode: "pascabencana", peran: "pml", modul: ["wilayah_tim", "identifikasi", "pendataan"], translok: TL1 });
    expect(pml.map((x) => x.kunci)).toEqual(["hari_ini", "sampel", "kamera", "translok"]);
    const kortim = susunBar({ kode: "pascabencana", peran: "supervisor", modul: ["monitoring_korwil"], translok: TL1 });
    expect(kortim.map((x) => x.label)).toEqual(["Hari Ini", "Supervisi", "Kamera", "Translok"]);
    expect(kortim[1].href).toBe("/sigap/korwil?k=pascabencana");
  });

  it("langkah sekali jalan: hanya konfirmasi/identifikasi yang belum selesai; ?dari= dialihkan ke Hari Ini", () => {
    const modul = [
      { kode: "konfirmasi", judul: "Konfirmasi kesediaan & wilayah", ket: "Konfirmasi bersedia", status: "perlu", href: "/sigap/bencana/konfirmasi", aksi: "Konfirmasi sekarang" },
      { kode: "identifikasi", judul: "Lembar Identifikasi SLS", ket: "3 dari 10 Sub SLS identifikasi terisi", status: "berjalan", href: "/sigap/identifikasi?dari=%2Fsigap%2Fkegiatan%2Fpascabencana%2Fpendataan", aksi: "Isi sekarang" },
      { kode: "pendataan", judul: "Lembar Pendataan KK", ket: "x", status: "perlu", href: "/sigap/pendataan", aksi: "Buka" },
      { kode: "wilayah_tim", judul: "Wilayah", ket: "x", status: "menunggu", href: null },
    ];
    const l = langkahSekali("pascabencana", modul);
    expect(l.map((x) => x.kode)).toEqual(["konfirmasi", "identifikasi"]);
    expect(l[0]).toMatchObject({ href: "/sigap/bencana/konfirmasi", aksi: "Konfirmasi sekarang", mendesak: true });
    expect(l[1].href).toBe("/sigap/identifikasi?dari=%2Fsigap%2Fkegiatan%2Fpascabencana");
    expect(l[1].mendesak).toBe(false);
    // selesai atau tanpa halaman: tidak tampil
    expect(langkahSekali("pascabencana", [{ ...modul[0], status: "selesai" }, { ...modul[1], href: null }])).toEqual([]);
  });

  it("kegiatan rutin yang halamannya belum berbar belum memakai template", () => {
    expect(pakaiTemplateMenu([{ isi: ["sampel:5"] }, { isi: ["translok:2"] }])).toBe(false);
    expect(pakaiTemplateMenu([])).toBe(false);
    expect(pakaiTemplateMenu([{ isi: [] }])).toBe(false);
  });

  it("PPL: Hari Ini | Sampel | Kamera | Translok", () => {
    const b = susunBar({ kode: "spdt_ntp", peran: "ppl", modul: ["spdt_lembar", "translok:2"], translok: TL });
    expect(b.map((x) => x.kunci)).toEqual(["hari_ini", "sampel", "kamera", "translok"]);
    expect(b[0].href).toBe("/sigap/translok/tok123?p=7&k=spdt_ntp&tab=hari_ini");
    expect(b[1].href).toBe("/sigap/spdt?tab=sampel&k=spdt_ntp");
    expect(b[2].href).toBe("/sigap/foto?kegiatan=2");
    expect(b[3].href).toBe("/sigap/translok/tok123?p=7&k=spdt_ntp&tab=hari_kerja");
  });

  it("PML: ada Pengawasan; Supervisor: Supervisi", () => {
    const pml = susunBar({ kode: "spdt_ntp", peran: "pml", modul: ["spdt_lembar", "translok:2"], translok: TL });
    expect(pml.map((x) => x.label)).toEqual(["Hari Ini", "Sampel", "Pengawasan", "Kamera", "Translok"]);
    const sv = susunBar({ kode: "spdt_ntp", peran: "supervisor", modul: ["spdt_lembar"], translok: null });
    expect(sv.map((x) => x.label)).toEqual(["Hari Ini", "Sampel", "Supervisi"]);
    expect(sv[0].href).toBe("/sigap/kegiatan/spdt_ntp");
    expect(sv[2].href).toBe("/sigap/spdt?tab=pengawasan&k=spdt_ntp");
  });

  it("tanpa penugasan Translok: tidak ada Kamera dan Translok", () => {
    const b = susunBar({ kode: "x", peran: "ppl", modul: ["spdt_lembar"], translok: null });
    expect(b.map((x) => x.kunci)).toEqual(["hari_ini", "sampel"]);
  });

  it("istilah bisa diganti per kegiatan", () => {
    const b = susunBar({ kode: "x", peran: "pml", modul: ["spdt_lembar", "translok:2"], translok: TL, istilah: { sampel: "Pendataan", pengawasan: "Monitoring", translok: "Perjalanan" } });
    expect(b.map((x) => x.label)).toEqual(["Hari Ini", "Pendataan", "Monitoring", "Kamera", "Perjalanan"]);
  });

  it("alamat tab menurut modul", () => {
    expect(alamatSampel(["sampel:5"])).toBe("/sigap/sampel?k=5");
    expect(alamatSampel(["pendataan"])).toBe("/sigap/pendataan");
    expect(alamatSampel(["translok:2"])).toBeNull();
    expect(alamatPengawasan(["monitoring_korwil"], "supervisor")).toBe("/sigap/korwil");
    expect(alamatPengawasan(["spdt_lembar"], "ppl")).toBeNull();
    expect(alamatHariIni({ kode: "k", translok: null })).toBe("/sigap/kegiatan/k");
  });

  it("tiga tab Translok dilipat menjadi satu item", () => {
    expect(tabBarDariTranslok("hari_ini")).toBe("hari_ini");
    for (const t of ["hari_kerja", "arsip", "foto"]) expect(tabBarDariTranslok(t)).toBe("translok");
  });
});

describe("Back antar tab", () => {
  it("tab baru didorong, tab yang sudah ada dimundurkan (riwayat tidak menumpuk)", () => {
    let t: string[] = ["hari_ini"];
    let k = putuskanTab(t, "hari_ini", "sampel");
    expect(k).toEqual({ aksi: "maju", tumpuk: ["hari_ini", "sampel"] });
    t = (k as { tumpuk: string[] }).tumpuk;
    k = putuskanTab(t, "sampel", "pengawasan");
    t = (k as { tumpuk: string[] }).tumpuk;
    expect(t).toEqual(["hari_ini", "sampel", "pengawasan"]);
    // dari Pengawasan ke Hari Ini = mundur 2, bukan menambah entri
    expect(putuskanTab(t, "pengawasan", "hari_ini")).toEqual({ aksi: "mundur", n: 2, tumpuk: ["hari_ini"] });
    // dari Pengawasan ke Sampel = mundur 1 (sama dengan Back)
    expect(putuskanTab(t, "pengawasan", "sampel")).toEqual({ aksi: "mundur", n: 1, tumpuk: ["hari_ini", "sampel"] });
    expect(putuskanTab(t, "pengawasan", "pengawasan")).toEqual({ aksi: "tetap" });
  });

  it("Back sistem mengubah tab tampil: tumpukan diselaraskan", () => {
    expect(selaraskanTumpuk(["hari_ini", "sampel", "pengawasan"], "sampel")).toEqual(["hari_ini", "sampel"]);
    expect(selaraskanTumpuk(["hari_ini", "sampel"], "translok")).toEqual(["translok"]); // mendarat dari tautan dalam
    expect(selaraskanTumpuk([], "hari_ini")).toEqual(["hari_ini"]);
  });

  it("tumpukan dibatasi", () => {
    let t: string[] = ["a"];
    for (const x of ["b", "c", "d", "e", "f", "g", "h"]) t = (putuskanTab(t, t[t.length - 1], x) as { tumpuk: string[] }).tumpuk;
    expect(t.length).toBeLessThanOrEqual(6);
  });
});

describe("indukMemuatModul (tautan Translok tanpa ?k=)", () => {
  const spdt = [{ isi: ["spdt_lembar", "translok:2"] }];
  const bencana = [{ isi: ["translok:3", "pelatihan"] }, { isi: ["pendataan", "translok:1"] }];
  it("translok kegiatan bermenu cocok", () => {
    expect(indukMemuatModul(spdt, "translok:2")).toBe(true);
    expect(indukMemuatModul(bencana, "translok:1")).toBe(true);
  });
  it("translok tahap Pelatihan dan translok kegiatan lain tidak cocok", () => {
    expect(indukMemuatModul(bencana, "translok:3")).toBe(false);
    expect(indukMemuatModul(spdt, "translok:9")).toBe(false);
  });
  it("modul biasa cukup ada di salah satu tahap", () => {
    expect(indukMemuatModul(spdt, "spdt_lembar")).toBe(true);
    expect(indukMemuatModul(bencana, "pendataan")).toBe(true);
    expect(indukMemuatModul(bencana, "spdt_lembar")).toBe(false);
  });
});
