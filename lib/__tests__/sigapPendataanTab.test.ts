import { describe, expect, it } from "vitest";
import { KEGIATAN_PENDATAAN, PINTU_TAB, SUB_ADMINISTRASI, SUB_PEMERIKSAAN, SUB_PER_TAB, SUB_QC, SUB_TIM, bacaSubDari, urlSubDari, TAB_AWAL, TAB_PENDATAAN, bacaSubPemeriksaan, bacaTabPendataan, labelTabPendataan, urlSubPemeriksaan, urlTabPendataan, type KodeTabPendataan } from "../sigapPendataanTab";

describe("TAB_PENDATAAN", () => {
  it("urutan runut mengikuti alur kerja; kode unik; Ringkasan paling depan", () => {
    expect(TAB_PENDATAAN.map((t) => t.kode)).toEqual(["ringkasan", "persiapan", "tim", "siaran", "qc", "monitoring", "pemeriksaan", "administrasi"]);
    expect(new Set(TAB_PENDATAAN.map((t) => t.kode)).size).toBe(TAB_PENDATAAN.length);
    expect(TAB_AWAL).toBe("ringkasan");
  });
  it("tab bernomor 1-7 berurutan", () => {
    const nomor = TAB_PENDATAAN.map((t) => /^(\d) ·/.exec(t.label)?.[1]).filter(Boolean);
    expect(nomor).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });
  it("label ditemukan per kode", () => {
    expect(labelTabPendataan("monitoring")).toBe("5 · Monitoring");
    expect(labelTabPendataan("qc")).toBe("4 · QC Pemahaman");
  });
});

describe("bacaTabPendataan", () => {
  it("kode dikenal -> tab itu (huruf besar/spasi diabaikan)", () => {
    expect(bacaTabPendataan("monitoring")).toBe("monitoring");
    expect(bacaTabPendataan("  Administrasi ")).toBe("administrasi");
  });
  it("alamat lama: ?tab=unggah -> Persiapan; tanpa ?tab / tak dikenal -> Ringkasan", () => {
    expect(bacaTabPendataan("unggah")).toBe("persiapan");
    expect(bacaTabPendataan(null)).toBe("ringkasan");
    expect(bacaTabPendataan(undefined)).toBe("ringkasan");
    expect(bacaTabPendataan("")).toBe("ringkasan");
    expect(bacaTabPendataan("entah")).toBe("ringkasan");
  });
});

describe("urlTabPendataan", () => {
  const P = "/sigap/kelola/pendataan";
  it("Ringkasan = tanpa ?tab", () => {
    expect(urlTabPendataan(P, "?tab=tim", "ringkasan")).toBe(P);
  });
  it("tab lain mengisi ?tab", () => {
    expect(urlTabPendataan(P, "", "siaran")).toBe(`${P}?tab=siaran`);
  });
  it("?v hanya hidup di Monitoring; parameter lain tetap", () => {
    expect(urlTabPendataan(P, "?tab=monitoring&v=poin", "monitoring")).toBe(`${P}?tab=monitoring&v=poin`);
    expect(urlTabPendataan(P, "?tab=monitoring&v=poin", "tim")).toBe(`${P}?tab=tim`);
    expect(urlTabPendataan(P, "?x=1&v=poin", "pemeriksaan")).toBe(`${P}?x=1&tab=pemeriksaan`);
  });
});

describe("sub-pilihan tab Pemeriksaan", () => {
  const P = "/sigap/kelola/pendataan";
  it("tiga sub-pilihan berurutan, kode unik", () => {
    expect(SUB_PEMERIKSAAN.map((x) => x.kode)).toEqual(["identifikasi", "lapangan", "foto"]);
  });
  it("bacaSubPemeriksaan: dikenal -> itu; kosong/tak dikenal -> identifikasi", () => {
    expect(bacaSubPemeriksaan("foto")).toBe("foto");
    expect(bacaSubPemeriksaan(" Lapangan ")).toBe("lapangan");
    expect(bacaSubPemeriksaan(null)).toBe("identifikasi");
    expect(bacaSubPemeriksaan("entah")).toBe("identifikasi");
  });
  it("urlSubPemeriksaan: selalu membawa ?tab=pemeriksaan; identifikasi = tanpa ?sub; buang ?v", () => {
    expect(urlSubPemeriksaan(P, "?tab=pemeriksaan", "foto")).toBe(`${P}?tab=pemeriksaan&sub=foto`);
    expect(urlSubPemeriksaan(P, "?tab=pemeriksaan&sub=foto", "identifikasi")).toBe(`${P}?tab=pemeriksaan`);
    expect(urlSubPemeriksaan(P, "?v=poin", "lapangan")).toBe(`${P}?tab=pemeriksaan&sub=lapangan`);
  });
  it("?sub hanya hidup di tab Pemeriksaan", () => {
    expect(urlTabPendataan(P, "?tab=pemeriksaan&sub=foto", "tim")).toBe(`${P}?tab=tim`);
    expect(urlTabPendataan(P, "?tab=pemeriksaan&sub=foto", "pemeriksaan")).toBe(`${P}?tab=pemeriksaan&sub=foto`);
  });
});

describe("PINTU_TAB", () => {
  const semua = Object.values(PINTU_TAB).flatMap((k) => (k ?? []).flatMap((g) => g.item));
  it("Pemeriksaan: hanya item 'segera' (hasil lapangan & foto sudah tersemat)", () => {
    const item = (PINTU_TAB.pemeriksaan ?? []).flatMap((g) => g.item);
    expect(item.length).toBeGreaterThan(0);
    expect(item.every((i) => i.status === "segera")).toBe(true);
  });
  it("hanya tab yang isinya tautan memiliki pintu masuk", () => {
    const kunci = Object.keys(PINTU_TAB) as KodeTabPendataan[];
    expect(kunci.sort()).toEqual(["administrasi", "pemeriksaan", "tim"]);
  });
  it("id unik; item bertautan memakai alamat dalam aplikasi; item 'segera' tanpa tautan", () => {
    expect(new Set(semua.map((i) => i.id)).size).toBe(semua.length);
    for (const i of semua) {
      if (i.status === "segera") expect(i.href).toBeUndefined();
      else expect(i.href).toMatch(/^\/[a-z]/);
    }
  });
  it("transport lokal tidak lagi berupa tautan (sudah tersemat)", () => {
    expect(semua.filter((i) => i.href?.startsWith("/sigap/kelola/translok"))).toEqual([]);
  });
  it("tersisa: alokasi (/bencana), pelatihan, anggaran (perencanaan)", () => {
    expect(semua.filter((i) => i.href).map((i) => i.href).sort()).toEqual(["/bencana", "/sigap/kelola/pelatihan", "/sigap/kelola/perencanaan"]);
  });
});

describe("sub-pilihan umum (tim, administrasi)", () => {
  const P = "/sigap/kelola/pendataan";
  it("daftar, urutan, dan peta per tab", () => {
    expect(SUB_TIM.map((x) => x.kode)).toEqual(["alokasi", "penugasan"]);
    expect(SUB_ADMINISTRASI.map((x) => x.kode)).toEqual(["monitoring", "verifikasi", "tarif", "pengadaan", "anggaran"]);
    expect(Object.keys(SUB_PER_TAB).sort()).toEqual(["administrasi", "qc", "tim"]);
    expect(SUB_QC.map((x) => x.kode)).toEqual(["hari", "pengaturan", "soal"]);
    expect(KEGIATAN_PENDATAAN).toBe(1);
  });
  it("bacaSubDari: dikenal -> itu; selain itu sub pertama", () => {
    expect(bacaSubDari(SUB_ADMINISTRASI, "Verifikasi")).toBe("verifikasi");
    expect(bacaSubDari(SUB_ADMINISTRASI, "x")).toBe("monitoring");
    expect(bacaSubDari(SUB_TIM, null)).toBe("alokasi");
  });
  it("urlSubDari: sub pertama tanpa ?sub; lainnya mengisi ?sub; ?v dibuang", () => {
    expect(urlSubDari(SUB_TIM, "tim", P, "?tab=tim&sub=penugasan", "alokasi")).toBe(`${P}?tab=tim`);
    expect(urlSubDari(SUB_ADMINISTRASI, "administrasi", P, "?v=poin", "tarif")).toBe(`${P}?tab=administrasi&sub=tarif`);
  });
  it("urlTabPendataan: ?sub dipertahankan hanya bila tab sama; pindah tab membuangnya", () => {
    expect(urlTabPendataan(P, "?tab=tim&sub=penugasan", "tim")).toBe(`${P}?tab=tim&sub=penugasan`);
    expect(urlTabPendataan(P, "?tab=tim&sub=penugasan", "administrasi")).toBe(`${P}?tab=administrasi`);
    expect(urlTabPendataan(P, "?tab=administrasi&sub=tarif", "siaran")).toBe(`${P}?tab=siaran`);
  });
});

describe("tab QC Pemahaman (26 Okt 2026)", () => {
  const P = "/sigap/kelola/pendataan";
  it("terletak di tengah, antara Siaran dan Monitoring; alamat ?tab=qc dikenal", () => {
    const k = TAB_PENDATAAN.map((t) => t.kode);
    expect(k.indexOf("qc")).toBe(k.indexOf("siaran") + 1);
    expect(k.indexOf("qc")).toBe(k.indexOf("monitoring") - 1);
    expect(bacaTabPendataan("QC")).toBe("qc");
  });
  it("?sub hidup di tab qc bila tab sama, hilang saat pindah tab", () => {
    expect(urlTabPendataan(P, "?tab=qc&sub=soal", "qc")).toBe(`${P}?tab=qc&sub=soal`);
    expect(urlTabPendataan(P, "?tab=qc&sub=soal", "monitoring")).toBe(`${P}?tab=monitoring`);
    expect(urlSubDari(SUB_QC, "qc", P, "?tab=qc&sub=soal", "hari")).toBe(`${P}?tab=qc`);
    expect(urlSubDari(SUB_QC, "qc", P, "?tab=qc", "pengaturan")).toBe(`${P}?tab=qc&sub=pengaturan`);
  });
  it("tidak punya pintu masuk (isinya tersemat)", () => {
    expect(PINTU_TAB.qc).toBeUndefined();
  });
});

describe("nama tidak bentrok dengan menu Monitoring (23 Okt 2026)", () => {
  it("sub-pilihan kelengkapan SPJ transport lokal bernama 'Kelengkapan SPJ', bukan 'Monitoring'", () => {
    const sub = SUB_ADMINISTRASI.find((x) => x.kode === "monitoring")!;
    expect(sub.label).toBe("Kelengkapan SPJ");
    expect(sub.label).not.toMatch(/^Monitoring/);
  });
});
