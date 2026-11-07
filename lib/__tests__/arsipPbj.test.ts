import { describe, expect, it } from "vitest";
import { periksaFormat, susunNomor, uraiNomor } from "@/lib/arsip/nomor";
import { DAFTAR_PBJ, KODE_PBJ_SAH, rujukanPbj, slugPaket } from "@/lib/arsip/pbj";

const FORMAT_PBJ = "{urut3}/PPK-BPSKAB/SOLOK/K/{tahun}";

describe("penomoran pengadaan barang/jasa", () => {
  it("pola sah dan menghasilkan nomor seperti jadwal pekerjaan", () => {
    expect(periksaFormat(FORMAT_PBJ)).toBeNull();
    expect(susunNomor(FORMAT_PBJ, { urut: 74, tahun: 2026 })).toBe("074/PPK-BPSKAB/SOLOK/K/2026");
    expect(susunNomor(FORMAT_PBJ, { urut: 97, tahun: 2026 })).toBe("097/PPK-BPSKAB/SOLOK/K/2026");
    expect(susunNomor(FORMAT_PBJ, { urut: 123, tahun: 2026 })).toBe("123/PPK-BPSKAB/SOLOK/K/2026");
  });

  it("nomor pengadaan yang ditempel dapat diurai (nomor urut dan tahun)", () => {
    expect(uraiNomor("084/PPK-BPSKAB/SOLOK/K/2026")).toEqual({ keamanan: null, urut: 84, unit: null, kka: null, tahun: 2026 });
    expect(uraiNomor("B-1451/13030/VS.330/2026")?.kka).toBe("VS.330");
    expect(uraiNomor("7/2026")?.urut).toBe(7);
    expect(uraiNomor("bukan nomor")).toBeNull();
  });

  it("daftar dokumen: 23 butir, kode unik, urutan sesuai jadwal pekerjaan", () => {
    expect(DAFTAR_PBJ).toHaveLength(23);
    expect(KODE_PBJ_SAH.size).toBe(23);
    expect(DAFTAR_PBJ[0].nama).toBe("Formulir Permintaan");
    expect(DAFTAR_PBJ[22].nama).toBe("Berita Acara Pembayaran");
    expect(DAFTAR_PBJ.find((b) => b.kode === "penawaran")?.bernomorBawaan).toBe(false);
    expect(DAFTAR_PBJ.filter((b) => b.bernomorBawaan)).toHaveLength(22);
    expect(DAFTAR_PBJ.filter((b) => b.pelaksana === "Penyedia").map((b) => b.nama)).toEqual(["Surat Penawaran Harga", "Surat Permohonan Pembayaran", "Invoice"]);
  });

  it("rujukan paket stabil terhadap huruf besar, spasi, dan tanda baca", () => {
    expect(slugPaket("Paket Meeting Susenas Maret dan Seruti Triwulan I 2026")).toBe("paket-meeting-susenas-maret-dan-seruti-triwulan-i-2026");
    expect(rujukanPbj("  Paket  Meeting, Susenas ", "spk")).toBe(rujukanPbj("paket meeting susenas", "spk"));
    expect(rujukanPbj("Paket A", "spk")).not.toBe(rujukanPbj("Paket B", "spk"));
    expect(rujukanPbj("Paket A", "spk")).not.toBe(rujukanPbj("Paket A", "spmk"));
  });
});
