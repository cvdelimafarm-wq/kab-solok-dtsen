import { describe, expect, it } from "vitest";
import { alurDariLangkah, bacaLangkahDariAlamat, catatanBerikutnya, hitungLangkahPelatihan, jendelaPelatihan, posisiLangkah, progresLangkah, statusLangkah, teksLangkah, type MasukanLangkah } from "../alurPelatihan";

const MULAI = new Date("2026-11-05T08:00:00+07:00").getTime();
const SEBELUM = MULAI - 3 * 86_400_000;
const HARI_H = MULAI + 3_600_000;

const dasar = (o: Partial<MasukanLangkah> = {}): MasukanLangkah => ({
  langkah: { undangan_dibuka: false, instrumen_diunduh: false, foto_total: 5, slot: [] },
  tes: [
    { jenis: "pretest", status: "belum_buka" },
    { jenis: "posttest", status: "belum_buka" },
  ],
  presensi: null,
  kuis: null,
  fotoTranslok: true,
  mulaiMs: MULAI,
  now: SEBELUM,
  ...o,
});
const kode = (m: MasukanLangkah) => hitungLangkahPelatihan(m).map((l) => l.kode);

describe("jendelaPelatihan", () => {
  it("membaca jam dari teks 'pukul'", () => {
    const j = jendelaPelatihan({ pukul: "08.30–16.00 WIB", tanggal_iso: "2026-11-05" });
    expect(j.mulai).toBe(new Date("2026-11-05T08:30:00+07:00").getTime());
    expect(j.selesai).toBe(new Date("2026-11-05T16:00:00+07:00").getTime());
  });
  it("bawaan 08.00-16.00 bila teks tak terbaca", () => {
    expect(jendelaPelatihan({ pukul: "", tanggal_iso: "2026-11-05" }).mulai).toBe(MULAI);
  });
});

describe("urutan langkah", () => {
  it("dasar: foto awal -> posttest -> foto akhir bila kelas perlu foto", () => {
    expect(kode(dasar())).toEqual(["undangan", "instrumen", "pretest", "hadir", "foto_awal", "posttest", "foto_akhir"]);
  });
  it("kelas Daring: tanpa langkah foto", () => {
    expect(kode(dasar({ fotoTranslok: false }))).toEqual(["undangan", "instrumen", "pretest", "hadir", "posttest"]);
  });
  it("Adu Sigap disisipkan setelah presensi bila ada kuis, dan tidak dihitung wajib", () => {
    const m = dasar({ kuis: { pernah_ikut: false, ada_ruang_selesai: false, ada_ruang_aktif: false } });
    const d = hitungLangkahPelatihan(m);
    expect(d.map((l) => l.kode).slice(3, 6)).toEqual(["hadir", "kuis", "foto_awal"]);
    expect(d.find((l) => l.kode === "kuis")?.tambahan).toBe(true);
    expect(progresLangkah(d).wajib).toBe(d.length - 1);
  });
  it("tujuan tautan: halaman sendiri atau ?langkah= pada halaman Langkah", () => {
    const d = hitungLangkahPelatihan(dasar());
    const h = (k: string) => d.find((l) => l.kode === k)!;
    expect(h("undangan").href).toBe("/sigap/pelatihan/undangan");
    expect(h("pretest").href).toBe("/sigap/pelatihan/tes/pretest");
    expect(h("hadir").href).toBe("/sigap/pelatihan?langkah=hadir");
    expect(h("foto_awal").href).toBe("/sigap/pelatihan?langkah=foto_awal");
    expect(h("undangan").halaman).toBe(true);
    expect(h("hadir").halaman).toBe(false);
  });
});

describe("status langkah", () => {
  it("awal: undangan 'sekarang' (bisa dikerjakan), instrumen juga, pretest menyusul", () => {
    expect(statusLangkah(hitungLangkahPelatihan(dasar())).slice(0, 4)).toEqual(["sekarang", "sekarang", "menyusul", "menyusul"]);
  });
  it("undangan dan instrumen selesai, pretest dibuka -> pretest sekarang", () => {
    const m = dasar({ langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] }, tes: [{ jenis: "pretest", status: "buka" }, { jenis: "posttest", status: "belum_buka" }] });
    const st = statusLangkah(hitungLangkahPelatihan(m));
    expect(st.slice(0, 3)).toEqual(["selesai", "selesai", "sekarang"]);
  });
  it("pretest terlewat ditandai terlewat; langkah wajib pertama yang belum selesai menjadi 'sekarang'", () => {
    const m = dasar({ langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] }, tes: [{ jenis: "pretest", status: "terlewat" }, { jenis: "posttest", status: "belum_buka" }] });
    const st = statusLangkah(hitungLangkahPelatihan(m));
    expect(st[2]).toBe("terlewat");
    expect(st[3]).toBe("sekarang"); // presensi: langkah wajib pertama yang belum selesai/terlewat
  });
  it("foto: selesai bila semua slot bagian itu ada; bisa dikerjakan sejak jam mulai", () => {
    const sebelum = hitungLangkahPelatihan(dasar({ now: SEBELUM })).find((l) => l.kode === "foto_awal")!;
    expect(sebelum.bisaSekarang).toBe(false);
    const hari = hitungLangkahPelatihan(dasar({ now: HARI_H, langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [1, 2, 3] } })).find((l) => l.kode === "foto_awal")!;
    expect(hari.bisaSekarang).toBe(true);
    expect(hari.selesai).toBe(true);
    const sebagian = hitungLangkahPelatihan(dasar({ now: HARI_H, langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [1, 2] } })).find((l) => l.kode === "foto_awal")!;
    expect(sebagian.selesai).toBe(false);
  });
  it("kuis: terlewat bila sudah ada ruang selesai dan peserta belum ikut", () => {
    const d = hitungLangkahPelatihan(dasar({ kuis: { pernah_ikut: false, ada_ruang_selesai: true, ada_ruang_aktif: false } }));
    expect(d.find((l) => l.kode === "kuis")?.terlewat).toBe(true);
  });
  it("tes tanpa jadwal: tidak selesai, tidak terlewat, tidak bisa", () => {
    const d = hitungLangkahPelatihan(dasar({ tes: [] }));
    const pre = d.find((l) => l.kode === "pretest")!;
    expect([pre.selesai, pre.terlewat, pre.bisaSekarang]).toEqual([false, false, false]);
  });
});

describe("posisi dan teks", () => {
  const d = hitungLangkahPelatihan(dasar());
  it("posisi memakai nomor urut dan total", () => {
    const p = posisiLangkah(d, "pretest")!;
    expect(p.no).toBe(3);
    expect(p.total).toBe(d.length);
    expect(teksLangkah(p)).toBe(`Langkah 3 dari ${d.length} · Pretest`);
    expect(p.sebelumnya?.kode).toBe("instrumen");
    expect(p.berikutnya?.kode).toBe("hadir");
  });
  it("kode tak dikenal -> null", () => {
    expect(posisiLangkah(d, "lain")).toBeNull();
  });
  it("alurDariLangkah memberi label bernomor dan ikon = kode", () => {
    const a = alurDariLangkah(d);
    expect(a[0]).toMatchObject({ kode: "undangan", label: "1 · Undangan", ikon: "undangan" });
  });
});

describe("catatan berikutnya", () => {
  it("ada bila langkah berikutnya menyusul, tidak ada bila bisa dikerjakan atau langkah terakhir", () => {
    const d = hitungLangkahPelatihan(dasar({ langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] } }));
    expect(catatanBerikutnya(d, "pretest")).toMatch(/Presensi belum bisa dikerjakan/); // presensi belum dibuka -> menyusul
    expect(catatanBerikutnya(d, "instrumen")).toBeNull(); // pretest = langkah wajib pertama yang belum selesai ("Berikutnya")
    expect(catatanBerikutnya(d, "undangan")).toBeNull(); // instrumen bisa dikerjakan
    expect(catatanBerikutnya(d, d[d.length - 1].kode)).toBeNull();
    expect(catatanBerikutnya(d, "tak-ada")).toBeNull();
  });
});

describe("bacaLangkahDariAlamat", () => {
  it("hanya kode yang dikenal", () => {
    expect(bacaLangkahDariAlamat("hadir")).toBe("hadir");
    expect(bacaLangkahDariAlamat("foto_akhir")).toBe("foto_akhir");
    expect(bacaLangkahDariAlamat("<script>")).toBeNull();
    expect(bacaLangkahDariAlamat(null)).toBeNull();
    expect(bacaLangkahDariAlamat("")).toBeNull();
  });
});
