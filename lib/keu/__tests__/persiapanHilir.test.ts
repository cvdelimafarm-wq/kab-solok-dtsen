import { describe, expect, it } from "vitest";
import { awalForm, type Form } from "../identifikasi";
import { peringatanDariPeriksa, periksaPelatihan, periksaPendataan, ringkasPelatihan, ringkasPendataan, ringkasPeran } from "../persiapanHilir";

/** Bentuk awal punya beberapa peran menyala bawaan; uji memulai dari semua peran mati supaya hitungan terkendali. */
function form(sunting?: (f: Form) => void): Form {
  const f = awalForm();
  for (const k of Object.keys(f.peran) as (keyof Form["peran"])[]) f.peran[k] = { ...f.peran[k], on: false, nOrg: 0, nMit: 0 };
  sunting?.(f);
  return f;
}

describe("ringkasPeran", () => {
  it("hanya peran yang dinyalakan, jumlah = organik + mitra", () => {
    const f = form((x) => {
      x.peran.ppl = { ...x.peran.ppl, on: true, nOrg: 2, nMit: 10, status: "Organik dan mitra" };
      x.peran.pml = { ...x.peran.pml, on: true, nOrg: 1, nMit: 3 };
      x.peran.supervisor = { ...x.peran.supervisor, on: false };
    });
    const r = ringkasPeran(f);
    expect(r.map((p) => p.id)).toEqual(["pml", "ppl"]);
    expect(r.find((p) => p.id === "ppl")!.jumlah).toBe(12);
    expect(r.find((p) => p.id === "pml")!.jumlah).toBe(4);
  });
  it("jumlah negatif/bukan angka dianggap 0", () => {
    const f = form((x) => {
      x.peran.ppl = { ...x.peran.ppl, on: true, nOrg: -3, nMit: Number.NaN };
    });
    expect(ringkasPeran(f).find((p) => p.id === "ppl")!.jumlah).toBe(0);
  });
});

describe("ringkasPelatihan + periksaPelatihan", () => {
  it("tanpa sesi: tahap boleh dilewati dan tidak ada peringatan", () => {
    const f = form((x) => {
      x.sesi.briefing.on = false;
      x.sesi.pelatihan.on = false;
    });
    const r = ringkasPelatihan(f);
    expect(r.adaSesi).toBe(false);
    const p = periksaPelatihan(r, []);
    expect(p).toHaveLength(1);
    expect(p[0].beres).toBe(true);
    expect(peringatanDariPeriksa(p)).toBeNull();
  });
  it("sesi pelatihan dengan pengajar: instruktur belum lengkap, peserta kosong, belum tertaut -> 3 butir kurang", () => {
    const f = form((x) => {
      x.sesi.pelatihan.on = true;
      x.sesi.pelatihan.pengajar = true;
      x.sesi.pelatihan.instr = { jumlah: 0, level: "", asal: "", jam: 0, perk: true };
    });
    const p = periksaPelatihan(ringkasPelatihan(f), []);
    expect(p.filter((b) => !b.beres).map((b) => b.kode)).toEqual(["instruktur-pelatihan", "peserta", "kegiatan"]);
    const w = peringatanDariPeriksa(p)!;
    expect(w).toContain("Belum lengkap di tahap ini");
    expect(w).toContain("tetap boleh lanjut");
  });
  it("semua lengkap -> tanpa peringatan", () => {
    const f = form((x) => {
      x.sesi.pelatihan.on = true;
      x.sesi.pelatihan.pengajar = true;
      x.sesi.pelatihan.instr = { jumlah: 2, level: "Inda", asal: "Internal BPS", jam: 6, perk: false };
      x.peran.ppl = { ...x.peran.ppl, on: true, nOrg: 0, nMit: 8 };
    });
    const p = periksaPelatihan(ringkasPelatihan(f), [{ fungsi: "pelatihan" }]);
    expect(p.every((b) => b.beres)).toBe(true);
    expect(peringatanDariPeriksa(p)).toBeNull();
  });
  it("tautan berfungsi pendataan tidak dihitung sebagai pelatihan", () => {
    const f = form((x) => {
      x.sesi.briefing.on = true;
      x.peran.ppl = { ...x.peran.ppl, on: true, nOrg: 0, nMit: 3 };
    });
    const p = periksaPelatihan(ringkasPelatihan(f), [{ fungsi: "pendataan" }]);
    expect(p.find((b) => b.kode === "kegiatan")!.beres).toBe(false);
  });
});

describe("ringkasPendataan + periksaPendataan", () => {
  it("tanpa pendataan: tahap boleh dilewati", () => {
    const f = form((x) => {
      x.instrumen = "Tanpa pendataan";
    });
    const r = ringkasPendataan(f, 2026, null);
    expect(r.ada).toBe(false);
    expect(r.jadwal).toEqual([]);
    expect(peringatanDariPeriksa(periksaPendataan(r, []))).toBeNull();
  });
  it("dengan pendataan: jadwal terhitung; butir petugas dan kegiatan kurang bila kosong", () => {
    const f = form((x) => {
      x.instrumen = "FASIH";
      x.periode = "Tahunan";
      x.peran.ppl = { ...x.peran.ppl, on: false };
      x.peran.pml = { ...x.peran.pml, on: false };
    });
    const r = ringkasPendataan(f, 2026, null);
    expect(r.ada).toBe(true);
    expect(r.instrumen).toBe("FASIH");
    const p = periksaPendataan(r, []);
    const kurang = p.filter((b) => !b.beres).map((b) => b.kode);
    expect(kurang).toContain("petugas");
    expect(kurang).toContain("kegiatan");
  });
  it("pembaruan H-15 (upd) dipakai sebagai jadwal efektif", () => {
    const f = form((x) => {
      x.instrumen = "FASIH";
      x.periode = "Tahunan";
    });
    const dasar = ringkasPendataan(f, 2026, null).jadwal;
    expect(dasar.length).toBeGreaterThan(0);
    const P = dasar[0].periode;
    const baru = ringkasPendataan(f, 2026, { [P]: { mulai: "2026-03-02", selesai: "2026-03-20" } }).jadwal.find((j) => j.periode === P)!;
    expect(baru.mulai).toBe("2026-03-02");
    expect(baru.selesai).toBe("2026-03-20");
  });
  it("petugas entri tidak dihitung sebagai petugas lapangan", () => {
    const f = form((x) => {
      x.instrumen = "FASIH";
      x.peran.ppl = { ...x.peran.ppl, on: true, nOrg: 0, nMit: 5 };
      x.peran.pml = { ...x.peran.pml, on: true, nOrg: 1, nMit: 0 };
      x.peran.entri = { ...x.peran.entri, on: true, nOrg: 0, nMit: 4 };
    });
    expect(ringkasPendataan(f, 2026, null).totalLapangan).toBe(6);
  });
});
