// (9 Okt 2026) Uji tahap kegiatan induk: status modul/tahap, aturan buka, ringkasan Layer 1, pemeriksaan masukan admin.
import { describe, expect, it } from "vitest";
import { chipPeranTim, periksaTahapAdmin, ringkasInduk, susunTahap, tahapSekarang, tanggalWib, type Induk, type KonteksTahap, type TahapDef } from "../sigapTahap";
import type { RingkasKegiatan } from "../sigapKegiatan";

const T = (kode: string, urutan: number, isi: string[], buka_mode: TahapDef["buka_mode"] = "langsung", buka_tanggal: string | null = null): TahapDef => ({
  kode,
  urutan,
  nama: kode[0].toUpperCase() + kode.slice(1),
  uraian: null,
  isi,
  buka_mode,
  buka_tanggal,
});

const INDUK = (tahap: TahapDef[], ekstra: Partial<Induk> = {}): Induk => ({
  kode: "pascabencana",
  nama: "Pendataan Pascabencana",
  pendek: "Pendataan Pascabencana",
  ikon: "bencana",
  menyerap: [],
  tahap,
  perencanaan: { konfirmasi: true, href: "/bencana/konfirmasi/x" },
  wilayah: { total: 15, ada_laporan: 3, kk: 2121, kk_terdampak: 599 },
  ...ekstra,
});

const TL = (kegiatan_id: number, nada: RingkasKegiatan["nada"], pecahan: number | null = 0.4): RingkasKegiatan => ({
  id: `translok-${kegiatan_id}0`,
  judul: `Transport Lokal ${kegiatan_id}`,
  pendek: "TL",
  ikon: "motor",
  nada,
  pecahan,
  selesai: 1,
  total: 5,
  sub: "1/5 · uji",
  peringatan: false,
  href: `/sigap/kegiatan/translok-${kegiatan_id}0`,
  kegiatan_id,
});

const NOW = Date.parse("2026-10-09T05:00:00Z"); // 12.00 WIB, 9 Okt 2026
const K = (induk: Induk, ekstra: Partial<KonteksTahap> = {}): KonteksTahap => ({ induk, hub: null, hubMuat: "siap", keg: [], nowMs: NOW, ...ekstra });

describe("tanggalWib", () => {
  it("memakai zona WIB (lewat tengah malam UTC)", () => {
    expect(tanggalWib(Date.parse("2026-10-09T18:30:00Z"))).toBe("2026-10-10");
    expect(tanggalWib(NOW)).toBe("2026-10-09");
  });
});

describe("susunTahap", () => {
  it("tahap berisi modul yang tak berlaku bagi petugas disembunyikan; tahap tanpa isi tetap tampil", () => {
    const induk = INDUK([T("perencanaan", 1, ["konfirmasi"]), T("pelatihan", 2, ["pelatihan", "translok:3"]), T("evaluasi", 3, [])]);
    const h = susunTahap(K(induk)); // bukan peserta pelatihan (hub null, siap) & tanpa Transport Lokal
    expect(h.map((x) => x.kode)).toEqual(["perencanaan", "evaluasi"]);
    expect(h.map((x) => x.no)).toEqual([1, 2]);
    expect(h[0].status).toBe("selesai");
    expect(h[1].status).toBe("menunggu");
    expect(h[1].ringkas).toBe("Belum ada isi");
  });

  it("konfirmasi belum -> perlu; selesai -> selesai", () => {
    const belum = susunTahap(K(INDUK([T("perencanaan", 1, ["konfirmasi"])], { perencanaan: { konfirmasi: null, href: "/bencana/konfirmasi/x" } })));
    expect(belum[0].status).toBe("perlu");
    expect(belum[0].modul[0].href).toBe("/bencana/konfirmasi/x");
    const tanpaHalaman = susunTahap(K(INDUK([T("perencanaan", 1, ["konfirmasi"])], { perencanaan: { konfirmasi: null, href: null, pesan: "Plotting dibatalkan" } })));
    expect(tanpaHalaman[0].status).toBe("menunggu");
    expect(tanpaHalaman[0].modul[0].ket).toBe("Plotting dibatalkan");
  });

  it("wilayah tim: progres dari Sub SLS yang sudah ada laporan", () => {
    const h = susunTahap(K(INDUK([T("pendataan", 1, ["wilayah_tim"])])));
    expect(h[0].status).toBe("berjalan");
    expect(h[0].pecahan).toBeCloseTo(3 / 15);
    expect(h[0].modul[0].ket).toBe("15 Sub SLS pendataan · 3 sudah ada laporan"); // (26 Okt 2026) jelas: ini Sub SLS pendataan, bukan Sub SLS identifikasi
    const semua = susunTahap(K(INDUK([T("pendataan", 1, ["wilayah_tim"])], { wilayah: { total: 4, ada_laporan: 4, kk: 1, kk_terdampak: 1 } })));
    expect(semua[0].status).toBe("selesai");
    const kosong = susunTahap(K(INDUK([T("pendataan", 1, ["wilayah_tim"])], { wilayah: { total: 0, ada_laporan: 0, kk: 0, kk_terdampak: 0 } })));
    expect(kosong).toHaveLength(0); // tak ada wilayah -> modul tak berlaku -> tahap disembunyikan
  });

  it("identifikasi: teks menyebut 'Sub SLS identifikasi' (beda dengan Sub SLS pendataan)", () => {
    const ket = (terisi: number) => susunTahap(K(INDUK([T("pendataan", 1, ["identifikasi"])], { identifikasi: { total: 31, terisi, tidak_terdampak: 0, hasil: 120 } })))[0].modul[0].ket;
    expect(ket(31)).toBe("Semua 31 Sub SLS identifikasi sudah terisi · 120 KK terdampak");
    expect(ket(10)).toBe("10 dari 31 Sub SLS identifikasi terisi");
    expect(ket(0)).toBe("Belum ada yang terisi · 31 Sub SLS identifikasi menunggu hasil");
  });

  it("Transport Lokal dipilih menurut kegiatan_id & membawa tautan balik ke tahap", () => {
    const induk = INDUK([T("pelatihan", 1, ["translok:3"]), T("pendataan", 2, ["translok:1"])]);
    const h = susunTahap(K(induk, { keg: [TL(1, "emas"), TL(3, "hijau", 1), TL(2, "merah")] }));
    expect(h.map((x) => x.status)).toEqual(["selesai", "perlu"]);
    expect(h[1].modul).toHaveLength(1);
    expect(h[1].modul[0].href).toBe(`/sigap/kegiatan/translok-10?dari=${encodeURIComponent("/sigap/kegiatan/pascabencana/pendataan")}`);
  });

  it("tahap Pelatihan membuka halaman Langkah yang sudah ada", () => {
    const hub = { peserta: {}, undangan: { tanggal_iso: "2026-10-12T01:00:00Z" }, tes: [], langkah: null, presensi: null, kuis: null, token_translok: null };
    const h = susunTahap(K(INDUK([T("pelatihan", 1, ["pelatihan"])]), { hub }));
    expect(h[0].rute).toBe("/sigap/pelatihan");
    expect(h[0].modul[0].href).toBe("/sigap/pelatihan");
  });

  it("memuat/gagal: modul pelatihan tetap tampil sebagai menunggu (jangan menghilang)", () => {
    for (const m of ["memuat", "gagal"] as const) {
      const h = susunTahap(K(INDUK([T("pelatihan", 1, ["pelatihan"])]), { hubMuat: m }));
      expect(h).toHaveLength(1);
      expect(h[0].status).toBe("menunggu");
    }
  });

  it("aturan buka: setelah tahap sebelumnya", () => {
    const induk = INDUK([T("pelatihan", 1, ["translok:3"]), T("pendataan", 2, ["translok:1"], "setelah_sebelumnya")]);
    const kunci = susunTahap(K(induk, { keg: [TL(3, "biru"), TL(1, "emas")] }));
    expect(kunci[1].terkunci).toBe(true);
    expect(kunci[1].status).toBe("terkunci");
    expect(kunci[1].alasanKunci).toBe("Dibuka setelah Pelatihan selesai");
    const buka = susunTahap(K(induk, { keg: [TL(3, "hijau", 1), TL(1, "emas")] }));
    expect(buka[1].terkunci).toBe(false);
    expect(buka[1].status).toBe("perlu");
  });

  it("aturan buka: tanggal", () => {
    const induk = INDUK([T("evaluasi", 1, [], "tanggal", "2026-10-20")]);
    const h = susunTahap(K(induk));
    expect(h[0].terkunci).toBe(true);
    expect(h[0].alasanKunci).toBe("Dibuka 20 Okt 2026");
    const nanti = susunTahap(K(induk, { nowMs: Date.parse("2026-10-20T00:30:00Z") })); // 07.30 WIB 20 Okt
    expect(nanti[0].terkunci).toBe(false);
  });

  it("setelah_sebelumnya pada tahap pertama tidak terkunci", () => {
    const h = susunTahap(K(INDUK([T("perencanaan", 1, ["konfirmasi"], "setelah_sebelumnya")])));
    expect(h[0].terkunci).toBe(false);
  });
});

describe("tahapSekarang", () => {
  it("mendesak didahulukan atas perlu; tahap terkunci dilewati", () => {
    const induk = INDUK([T("perencanaan", 1, ["konfirmasi"]), T("pelatihan", 2, ["translok:3"]), T("pendataan", 3, ["translok:1"], "tanggal", "2099-01-01")]);
    const h = susunTahap(K(induk, { keg: [TL(3, "merah"), TL(1, "merah")], perencanaan: undefined } as Partial<KonteksTahap>));
    // perencanaan selesai (konfirmasi true); pelatihan mendesak; pendataan terkunci (walau mendesak)
    const s = tahapSekarang(h);
    expect(s?.tahap.kode).toBe("pelatihan");
    expect(s?.modul.status).toBe("mendesak");
  });
  it("null bila tak ada yang mendesak/perlu", () => {
    expect(tahapSekarang(susunTahap(K(INDUK([T("perencanaan", 1, ["konfirmasi"])]))))).toBeNull();
  });
});

describe("ringkasInduk (ikon Layer 1)", () => {
  it("hijau bila semua tahap selesai", () => {
    const r = ringkasInduk(K(INDUK([T("perencanaan", 1, ["konfirmasi"])])))!;
    expect(r.nada).toBe("hijau");
    expect(r.id).toBe("induk-pascabencana");
    expect(r.href).toBe("/sigap/kegiatan/pascabencana");
    expect(r.pecahan).toBe(1);
  });
  it("merah bila ada tahap terbuka yang mendesak, dengan tanda seru", () => {
    const r = ringkasInduk(K(INDUK([T("perencanaan", 1, ["konfirmasi"]), T("pelatihan", 2, ["translok:3"])]), { keg: [TL(3, "merah")] }))!;
    expect(r.nada).toBe("merah");
    expect(r.peringatan).toBe(true);
    expect(r.sub.startsWith("1/2 tahap")).toBe(true);
  });
  it("abu bila belum ada yang dikerjakan", () => {
    const r = ringkasInduk(K(INDUK([T("pendataan", 1, ["wilayah_tim"])], { wilayah: { total: 5, ada_laporan: 0, kk: 10, kk_terdampak: 1 } })))!;
    expect(r.nada).toBe("abu");
  });
  it("biru bila berjalan tanpa tugas mendesak", () => {
    const r = ringkasInduk(K(INDUK([T("pendataan", 1, ["wilayah_tim"])])))!;
    expect(r.nada).toBe("biru");
  });
  it("null bila tak ada tahap yang berlaku", () => {
    expect(ringkasInduk(K(INDUK([T("pelatihan", 1, ["pelatihan"])])))).toBeNull();
  });
});

describe("periksaTahapAdmin", () => {
  const sah = { kode: "pelatihan", nama: "Pelatihan", isi: ["pelatihan", "translok:3"], buka_mode: "langsung", buka_tanggal: null };
  it("menerima masukan sah", () => {
    expect(periksaTahapAdmin(sah, [1, 3])).toBeNull();
  });
  it("menolak kode, nama, modul, dan aturan yang salah", () => {
    expect(periksaTahapAdmin({ ...sah, kode: "Pelatihan Baru" }, [1, 3])).toMatch(/Kode tahap/);
    expect(periksaTahapAdmin({ ...sah, nama: "  " }, [1, 3])).toMatch(/wajib diisi/);
    expect(periksaTahapAdmin({ ...sah, isi: ["rahasia"] }, [1, 3])).toMatch(/tidak dikenal/);
    expect(periksaTahapAdmin({ ...sah, isi: ["translok:9"] }, [1, 3])).toMatch(/bukan bagian/);
    expect(periksaTahapAdmin({ ...sah, isi: ["pelatihan", "pelatihan"] }, [1, 3])).toMatch(/dua kali/);
    expect(periksaTahapAdmin({ ...sah, buka_mode: "tanggal" }, [1, 3])).toMatch(/tanggalnya belum diisi/);
    expect(periksaTahapAdmin({ ...sah, buka_mode: "acak" }, [1, 3])).toMatch(/tidak dikenal/);
  });
});

// (11 Okt 2026) Modul "pendataan" (Lembar Pendataan KK) di tahap Pendataan -- permintaan user: gabung ke kegiatan Pendataan Pascabencana.
describe("modul pendataan", () => {
  const induk = (p: Induk["pendataan"]) => INDUK([T("pendataan", 1, ["pendataan"])], { pendataan: p });

  it("tidak tampil bila tim belum punya daftar KK (tahap berisi modul itu ikut disembunyikan)", () => {
    expect(susunTahap(K(induk(null)))).toEqual([]);
    expect(susunTahap(K(induk({ total: 0, didata: 0, terdampak: 0 })))).toEqual([]);
    expect(susunTahap(K(INDUK([T("pendataan", 1, ["pendataan"])])))).toEqual([]); // data lama tanpa field pendataan
  });

  it("status: belum ada yang didata = perlu; sebagian = berjalan; semua = selesai", () => {
    const m = (p: NonNullable<Induk["pendataan"]>) => susunTahap(K(induk(p)))[0].modul[0];
    expect(m({ total: 40, didata: 0, terdampak: 0 })).toMatchObject({ kode: "pendataan", status: "perlu", aksi: "Buka lembar" });
    expect(m({ total: 40, didata: 0, terdampak: 0 }).ket).toBe("Belum ada yang punya hasil · 40 KK tim menunggu"); // (26 Okt 2026) satu istilah: "punya hasil"
    expect(m({ total: 40, didata: 40, terdampak: 22 }).ket).toBe("Semua 40 KK sudah punya hasil · 22 terdampak");
    expect(m({ total: 40, didata: 12, terdampak: 5 })).toMatchObject({ status: "berjalan", ket: "12 dari 40 KK tim sudah punya hasil" });
    expect(m({ total: 40, didata: 40, terdampak: 22 })).toMatchObject({ status: "selesai", aksi: "Lihat", pecahan: 1 });
  });

  it("tautan memuat ?dari= ke halaman tahap supaya Back pulang ke tahap Pendataan", () => {
    const h = susunModulHref(induk({ total: 10, didata: 1, terdampak: 0 }));
    expect(h).toBe("/sigap/pendataan?dari=" + encodeURIComponent("/sigap/kegiatan/pascabencana/pendataan"));
  });
});

function susunModulHref(i: Induk): string | null {
  return susunTahap(K(i))[0].modul[0].href;
}

// (16 Okt 2026) Modul "spdt_lembar" (Lembar Pendataan SPDT NTP) -- lembar bantu tanpa status pendataan.
describe("modul spdt_lembar", () => {
  const induk = (s: Induk["spdt"], tahap = [T("lembar_pendataan", 1, ["spdt_lembar"]), T("translok", 2, ["translok:2"])]) =>
    INDUK(tahap, { kode: "spdt_ntp", nama: "SPDT NTP 2026", pendek: "SPDT NTP", ikon: "grafik", perencanaan: null, wilayah: null, spdt: s });

  it("sah dipilih admin; tidak tampil bagi akun tanpa peran SPDT NTP (tahap ikut disembunyikan)", () => {
    expect(periksaTahapAdmin({ kode: "lembar", nama: "Lembar", isi: ["spdt_lembar"], buka_mode: "langsung", buka_tanggal: null }, [2])).toBeNull();
    expect(susunTahap(K(induk(null)))).toEqual([]);
    expect(susunTahap(K(induk({ peran: "ppl", total: 0, ppl: 0, pml: 0 })))).toEqual([]); // PPL tanpa KK
  });

  it("PPL & PML: berjalan (tanpa penyelesaian), tautan ke /sigap/spdt dengan ?dari= ke tahap", () => {
    const m = susunTahap(K(induk({ peran: "ppl", total: 25, ppl: 1, pml: 1 })))[0].modul[0];
    expect(m).toMatchObject({ kode: "spdt_lembar", status: "berjalan", aksi: "Buka lembar", pecahan: 0 });
    expect(m.ket).toContain("25 KK di wilayah tugas Anda");
    expect(m.href).toBe("/sigap/spdt?dari=" + encodeURIComponent("/sigap/kegiatan/spdt_ntp/lembar_pendataan"));
  });

  it("Supervisor tanpa penugasan tetap melihat modul; tombolnya Buka monitoring", () => {
    const h = susunTahap(K(induk({ peran: "supervisor", total: 811, ppl: 40, pml: 15 })));
    expect(h.map((x) => x.kode)).toEqual(["lembar_pendataan"]); // translok:2 tak berlaku (tak ada penugasan)
    expect(h[0].modul[0]).toMatchObject({ aksi: "Buka monitoring", status: "berjalan" });
    expect(h[0].modul[0].ket).toContain("811 KK seluruh wilayah");
  });

  it("ringkasan Layer 1 berwarna biru (berjalan), bukan merah/emas", () => {
    const r = ringkasInduk(K(induk({ peran: "pml", total: 45, ppl: 2, pml: 1 })));
    expect(r?.nada).toBe("biru");
    expect(r?.href).toBe("/sigap/kegiatan/spdt_ntp");
  });
});

// (30 Okt 2026) Modul "sampel:<kegiatan_id>" (Sampel per SLS: Sakernas, Seruti, IMK) -- lembar bantu, tampil hanya bagi akun yang punya alokasi sampel.
describe("modul sampel:<id>", () => {
  const induk = (sampel: Induk["sampel"], isi = ["sampel:5"]) =>
    INDUK([T("pendataan", 1, isi)], { kode: "sakernas", nama: "Sakernas TW IV", pendek: "Sakernas", ikon: "grafik", perencanaan: null, wilayah: null, sampel });
  const ppl = { kegiatan_id: 5, peran: "ppl" as const, sls: 2, utama: 20, cadangan: 4, diganti: 1, ppl: 1 };

  it("sah dipilih admin hanya untuk kegiatan induk itu", () => {
    const sah = { kode: "pendataan", nama: "Pendataan", isi: ["sampel:5"], buka_mode: "langsung", buka_tanggal: null };
    expect(periksaTahapAdmin(sah, [5])).toBeNull();
    expect(periksaTahapAdmin(sah, [6])).toMatch(/bukan bagian/);
    expect(periksaTahapAdmin({ ...sah, isi: ["sampel:abc"] }, [5])).toMatch(/tidak dikenal/);
  });

  it("tidak tampil bagi akun tanpa alokasi sampel (tahap ikut disembunyikan)", () => {
    expect(susunTahap(K(induk(undefined)))).toEqual([]);
    expect(susunTahap(K(induk({})))).toEqual([]);
    expect(susunTahap(K(induk({ 7: ppl })))).toEqual([]); // sampel kegiatan lain
  });

  it("PPL: berjalan, tautan ke /sigap/sampel?k=<id> dengan ?dari= ke tahap", () => {
    const m = susunTahap(K(induk({ 5: ppl })))[0].modul[0];
    expect(m).toMatchObject({ kode: "sampel:5", status: "berjalan", aksi: "Buka sampel", pecahan: 0 });
    expect(m.ket).toContain("2 SLS");
    expect(m.href).toBe("/sigap/sampel?k=5&dari=" + encodeURIComponent("/sigap/kegiatan/sakernas/pendataan"));
  });

  it("PML: tombol Lihat sampel", () => {
    const m = susunTahap(K(induk({ 5: { ...ppl, peran: "pml", ppl: 3 } })))[0].modul[0];
    expect(m.aksi).toBe("Lihat sampel");
    expect(m.ket).toContain("3 PPL");
  });
});

describe("chipPeranTim (Beranda PML/PPL)", () => {
  const depan = (n: string | null | undefined) => (n ?? "").split(" ")[0];
  const w = { total: 3, ada_laporan: 1, kk: 10, kk_terdampak: 4 };
  it("menampilkan peran dan nama tim", () => {
    expect(chipPeranTim({ ...w, peran: "pml", pml_nama: "Budi Santoso" }, depan)).toBe("PML · Tim Budi");
    expect(chipPeranTim({ ...w, peran: "ppl", pml_nama: "Budi Santoso" }, depan)).toBe("PPL · Tim Budi");
  });
  it("tanpa nama PML hanya peran; tanpa peran / tanpa wilayah -> null", () => {
    expect(chipPeranTim({ ...w, peran: "ppl", pml_nama: null }, depan)).toBe("PPL");
    expect(chipPeranTim(w, depan)).toBeNull();
    expect(chipPeranTim(null, depan)).toBeNull();
  });
});
