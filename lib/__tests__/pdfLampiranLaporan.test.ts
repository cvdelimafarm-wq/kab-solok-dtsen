import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buatPdfLaporanPelatihan, buatPdfLaporanInstruktur, type DataLaporan } from "../pdf/sigap/pelatihan";

async function pdfContoh(n: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([595, 842]);
  return new Uint8Array(await d.save());
}
const dasar = (u?: DataLaporan["undangan"], catatan?: string | null): DataLaporan => ({
  info: { kegiatanNama: "Pelatihan Seruti", kegiatanKode: "SERUTI", kelas: 1, tanggal: "2026-11-09", tempat: "Aula", instruktur: ["Iqbal"] },
  jumlahPeserta: 10, hadir: 9, tes: [], kenaikanRata: null, ringkasan: "r", kendala: "k", catatan: "c", tanggalCetak: "Solok, 9 November 2026",
  undangan: u, fotoCatatan: catatan,
}) as DataLaporan;

describe("lampiran undangan di PDF laporan", () => {
  it("menempel halaman PDF surat setelah halaman pemisah", async () => {
    const polos = await PDFDocument.load(await buatPdfLaporanPelatihan(dasar(null)));
    const dengan = await PDFDocument.load(await buatPdfLaporanPelatihan(dasar({ bytes: await pdfContoh(2), nomor: "B-457/13030/VS.220/2026", tanggal: "2026-11-06", perihal: "Undangan Pelatihan" })));
    expect(dengan.getPageCount()).toBe(polos.getPageCount() + 1 + 2); // pemisah + 2 halaman surat
  });
  it("PDF rusak tidak menggagalkan laporan", async () => {
    const polos = await PDFDocument.load(await buatPdfLaporanInstruktur(dasar(null)));
    const rusak = await PDFDocument.load(await buatPdfLaporanInstruktur(dasar({ bytes: new Uint8Array([1, 2, 3]), nomor: "1", tanggal: "2026-11-06", perihal: "x" })));
    expect(rusak.getPageCount()).toBe(polos.getPageCount() + 1);
  });
  it("catatan foto belum lengkap menambah halaman lampiran walau tanpa foto", async () => {
    const polos = await PDFDocument.load(await buatPdfLaporanPelatihan(dasar(null)));
    const dgn = await PDFDocument.load(await buatPdfLaporanPelatihan(dasar(null, "Foto pelaksanaan belum lengkap (target 4 foto per hari): 9 Nov kurang 4.")));
    expect(dgn.getPageCount()).toBe(polos.getPageCount() + 1);
  });
});
