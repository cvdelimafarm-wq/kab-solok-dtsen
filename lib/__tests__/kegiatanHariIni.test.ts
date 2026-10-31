// lib/__tests__/kegiatanHariIni.test.ts
// (31 Okt 2026) Ringkasan HARI INI dari adapter Transport Lokal (susunTranslok -> RingkasKegiatan.hariIni) untuk kartu Beranda per survei dan push 13.00.
import { describe, expect, it } from "vitest";
import { susunTranslok, type MasukanTranslok } from "@/lib/portal/kegiatan";
import { peringatanMerah } from "@/lib/sigapBerandaKartu";

const HARI_INI = "2026-10-30";
const at = (jam: string) => Date.parse(`${HARI_INI}T${jam}:00+07:00`);
const HREF = "/sigap/translok/tok?p=46";

const pen = (o: Partial<MasukanTranslok["p"]> = {}): MasukanTranslok["p"] => ({
  id: 46,
  kegiatan: { id: 1, kode: "pascabencana_2026", nama: "Pendataan Pascabencana 2026", kode_anggaran: null, satuan_realisasi: "KK", jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 },
  label_jabatan: "PPL Pascabencana",
  status_periode: "aktif",
  ditutup_pada: null,
  dikunci_at: null,
  peran: "ppl",
  periode: { mulai: "2026-10-10", selesai: "2026-11-10" },
  ...o,
});
const masuk = (o: Partial<MasukanTranslok> = {}): MasukanTranslok => ({ p: pen(), hariKerja: [HARI_INI, "2026-11-02"], isian: {}, hariIni: HARI_INI, hrefKerja: HREF, nowMs: at("14:00"), sumber: "pendataan", hrefLembar: "/sigap/pendataan", satuan: "KK", ...o });

describe("susunTranslok: ringkasan hari ini", () => {
  it("hari kerja tanpa isian: jadwal ada, slot kosong, peringatan merah menyala lewat 13.00", () => {
    const h = susunTranslok(masuk()).hariIni!;
    expect(h).toMatchObject({ tanggal: HARI_INI, adaJadwal: true, hariKerjaBerikut: "2026-11-02", peran: "ppl", fotoTotal: 5, slot: [], wajibLaporan: true, laporanSudah: false, sumber: "pendataan", mulai: "2026-10-10", targetSelesai: "2026-11-10", hrefKerja: HREF, hrefLembar: "/sigap/pendataan" });
    expect(peringatanMerah(h, at("14:00"))).toBe(true);
    expect(peringatanMerah(h, at("12:00"))).toBe(false);
  });
  it("foto dan laporan terisi tercermin; hasil lembar > 0 dihitung laporan sudah", () => {
    const a = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: false, foto: 2, slot: [1, 2] } } })).hariIni!;
    expect(a.slot).toEqual([1, 2]);
    expect(a.laporanSudah).toBe(false);
    const b = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: false, foto: 0, hasilLembar: 4 } } })).hariIni!;
    expect(b.laporanSudah).toBe(true);
    expect(b.hasilLembar).toBe(4);
    expect(peringatanMerah(b, at("14:00"))).toBe(false);
    const c = susunTranslok(masuk({ isian: { [HARI_INI]: { laporan: true, foto: 0 } } })).hariIni!;
    expect(c.laporanSudah).toBe(true);
  });
  it("hari ini bukan hari kerja: adaJadwal salah, hari kerja berikutnya terisi, tanpa peringatan", () => {
    const h = susunTranslok(masuk({ hariKerja: ["2026-11-02"] })).hariIni!;
    expect(h.adaJadwal).toBe(false);
    expect(h.hariKerjaBerikut).toBe("2026-11-02");
    expect(peringatanMerah(h, at("15:00"))).toBe(false);
  });
  it("target selesai dari kolom kegiatan menggantikan akhir periode; tanpa periode -> null", () => {
    expect(susunTranslok(masuk({ targetSelesai: "2026-11-05" })).hariIni!.targetSelesai).toBe("2026-11-05");
    const h = susunTranslok(masuk({ p: pen({ periode: undefined, peran: undefined }) })).hariIni!;
    expect(h.targetSelesai).toBeNull();
    expect(h.mulai).toBeNull();
    expect(h.peran).toBe("ppl");
  });
  it("supervisor: peringatan hanya pada hari ke-1,3,5 periode (30 Okt = hari ke-21)", () => {
    const h = susunTranslok(masuk({ p: pen({ peran: "supervisor" }) })).hariIni!;
    expect(peringatanMerah(h, at("14:00"))).toBe(true);
    const kamis = susunTranslok(masuk({ p: pen({ peran: "supervisor" }), hariIni: "2026-10-29", hariKerja: ["2026-10-29"], nowMs: Date.parse("2026-10-29T14:00:00+07:00") })).hariIni!;
    expect(peringatanMerah(kamis, Date.parse("2026-10-29T14:00:00+07:00"))).toBe(false);
  });
});
