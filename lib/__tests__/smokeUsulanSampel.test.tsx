// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SUMBER_KOSONG, type SumberSampel } from "@/lib/keu/usulanSampel";
import { awalForm } from "@/lib/keu/identifikasi";
import { awalLanjutan } from "@/lib/keu/lanjutan";

vi.mock("@/app/portal/sesi", () => ({ apiPortal: vi.fn(async () => SUMBER_KOSONG) }));
vi.mock("@/app/sigap/keu-ui", () => ({ kolom: "k", tombolKecil: "t", tombolBahaya: "b" }));

import { PanelUsulanSampel } from "@/app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/KartuUsulanSampel";

const isi = awalLanjutan(awalForm(), 2026);
const ubah = () => {};
const ada: SumberSampel = { ...SUMBER_KOSONG, tersambung: true, kegiatan_id: 1, kegiatan_nama: "Survei X", model: 2, satuan: "objek", unit: 40, sampel: 120, plot_ppl: 0, plot_pml: 0 };

describe("PanelUsulanSampel", () => {
  it("menampilkan ringkasan sumber dan isian batas, tanpa usulan sebelum diisi", () => {
    const h = renderToString(<PanelUsulanSampel sumber={ada} isi={isi} ubah={ubah} mati={false} />);
    expect(h).toContain("40 objek di daftar sampel");
    expect(h).toContain("Batas objek per PPL");
    expect(h).toContain("PPL per PML");
    expect(h).not.toContain("Terapkan usulan");
  });
  it("model 1 memakai satuan sub SLS", () => {
    const h = renderToString(<PanelUsulanSampel sumber={{ ...ada, model: 1, satuan: "sub SLS" }} isi={isi} ubah={ubah} mati={false} />);
    expect(h).toContain("Batas sub SLS per PPL");
  });
  it("belum tertaut: hanya penjelasan, tanpa isian", () => {
    const h = renderToString(<PanelUsulanSampel sumber={SUMBER_KOSONG} isi={isi} ubah={ubah} mati={false} />);
    expect(h).toContain("belum ditautkan");
    expect(h).not.toContain("Batas");
  });
  it("mode baca menonaktifkan isian", () => {
    const h = renderToString(<PanelUsulanSampel sumber={ada} isi={isi} ubah={ubah} mati />);
    expect(h).toContain("disabled");
  });
});
