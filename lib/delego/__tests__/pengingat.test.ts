import { describe, expect, it } from "vitest";
import { galatSetelanEskalasi, galatSetelanMutu, jadwalWib } from "@/lib/delego/pengingat";

describe("jadwalWib", () => {
  it("menerjemahkan jadwal UTC ke WIB", () => {
    expect(jadwalWib("0 11 * * *")).toBe("pukul 18.00 WIB, setiap hari");
    expect(jadwalWib("15 0 * * 1-5")).toBe("pukul 07.15 WIB, Senin sampai Jumat");
    expect(jadwalWib("*/15 * * * *")).toBe("tiap 15 menit");
    expect(jadwalWib("0 23 * * *")).toBe("pukul 06.00 WIB, setiap hari");
  });
  it("pola lain dikembalikan apa adanya", () => {
    expect(jadwalWib("0 0 1 * *")).toBe("0 0 1 * *");
  });
});

describe("pemeriksaan setelan", () => {
  const mutu = { w_kualitas: 50, w_disiplin: 25, w_tepat: 25, tepat_terlambat: 0.5, ambang_jumlah_kali: 2, ambang_poin_laporan: 150, ambang_kecepatan_kali: 1.5 };
  it("bobot mutu harus berjumlah 100", () => {
    expect(galatSetelanMutu(mutu)).toBeNull();
    expect(galatSetelanMutu({ ...mutu, w_tepat: 30 })).toMatch(/100/);
  });
  const esk = { jam_jelas: 24, hk_push2: 1, hk_jawab: 2, hk_kepala: 3, hk_usulan: 3, kali_bina: 3, jam_tenang_mulai: 20, jam_tenang_selesai: 7 };
  it("batas eskalasi masuk akal", () => {
    expect(galatSetelanEskalasi(esk)).toBeNull();
    expect(galatSetelanEskalasi({ ...esk, hk_kepala: 1 })).toMatch(/Kepala/);
    expect(galatSetelanEskalasi({ ...esk, jam_jelas: 0 })).toMatch(/penjelasan/);
  });
});
