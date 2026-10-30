import { describe, expect, it } from "vitest";
import { alamatHariIni, alamatPengawasan, alamatSampel, modulRutin, pakaiTemplateMenu, putuskanTab, selaraskanTumpuk, susunBar, tabBarDariTranslok } from "../sigapMenuKegiatan";

const TL = { href: "/sigap/translok/tok123?p=7", kegiatanId: 2 };

describe("template menu kegiatan", () => {
  it("modul rutin vs sekali jalan", () => {
    for (const m of ["pendataan", "spdt_lembar", "monitoring_korwil", "translok:2", "sampel:5"]) expect(modulRutin(m)).toBe(true);
    for (const m of ["konfirmasi", "pelatihan", "identifikasi", "wilayah_tim"]) expect(modulRutin(m)).toBe(false);
  });

  it("SPDT NTP (semua rutin dan berbar) memakai template; Pasca Bencana (ada sekali jalan) tidak", () => {
    expect(pakaiTemplateMenu([{ isi: ["spdt_lembar"] }, { isi: ["translok:2"] }])).toBe(true);
    expect(pakaiTemplateMenu([{ isi: ["konfirmasi"] }, { isi: ["pelatihan", "translok:3"] }, { isi: ["pendataan", "translok:1"] }, { isi: [] }])).toBe(false);
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
