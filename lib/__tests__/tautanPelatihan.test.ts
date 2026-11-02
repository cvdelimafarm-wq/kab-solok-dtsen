import { describe, expect, it } from "vitest";
import { tautanPelatihan } from "../tautanPelatihan";
import { tugasUtamaPelatihan, type HubTugas } from "../sigapTugasUtama";
import { ringkasPelatihan } from "../sigapKegiatan";
import { alamatGantiPelatihan, urutkanPilihan, type PilihanPelatihan } from "../sigapPelatihanNama";
import { pesanIzinDibuka, pesanIzinDiminta, pesanIzinDiputuskan, URL_PENGELOLA, URL_PESERTA } from "../sigapIzinPesan";

const NOW = Date.parse("2026-11-03T03:00:00Z");
const hub = (kegiatan_id: number | null | undefined, ubah: Partial<HubTugas> = {}): HubTugas => ({
  kegiatan_id,
  peserta: {},
  undangan: { tanggal_iso: "2026-11-09" },
  tes: [],
  langkah: { undangan_dibuka: false, instrumen_diunduh: false, foto: 0, foto_total: 5, slot: [] },
  presensi: null,
  kuis: null,
  token_translok: null,
  ...ubah,
});

describe("tautanPelatihan", () => {
  it("menambahkan ?kegiatan=ID, mempertahankan query dan hash", () => {
    expect(tautanPelatihan("/sigap/pelatihan", 12)).toBe("/sigap/pelatihan?kegiatan=12");
    expect(tautanPelatihan("/sigap/pelatihan/kuis?kelas=2&gabung=1", 12)).toBe("/sigap/pelatihan/kuis?kelas=2&gabung=1&kegiatan=12");
    expect(tautanPelatihan("/sigap/pelatihan#x", 7)).toBe("/sigap/pelatihan?kegiatan=7#x");
  });
  it("ID kosong / tidak valid / sudah ada -> tidak diubah", () => {
    for (const v of [null, undefined, 0, -3, 1.5, NaN]) expect(tautanPelatihan("/sigap/pelatihan", v as number)).toBe("/sigap/pelatihan");
    expect(tautanPelatihan("/sigap/pelatihan?kegiatan=3", 9)).toBe("/sigap/pelatihan?kegiatan=3");
  });
});

describe("tautan Tugas Utama dan ringkasan membawa kegiatan hub", () => {
  it("undangan dan instrumen", () => {
    const t = tugasUtamaPelatihan(hub(31), NOW)!;
    expect(t.href).toBe("/sigap/pelatihan?kegiatan=31");
    const u = tugasUtamaPelatihan(hub(31, { langkah: { undangan_dibuka: true, instrumen_diunduh: false, foto: 0, foto_total: 5, slot: [] } }), NOW)!;
    expect(u.href).toBe("/sigap/pelatihan?kegiatan=31");
  });
  it("tes dibuka membawa kegiatan; tanpa kegiatan_id tautan lama", () => {
    const tes = [{ jenis: "pretest", status: "buka", buka_at: new Date(NOW - 600_000).toISOString(), tutup_at: new Date(NOW + 3_600_000).toISOString(), durasi_menit: 30, jumlah_soal: 20, sesi: null }];
    expect(tugasUtamaPelatihan(hub(31, { tes }), NOW)!.href).toBe("/sigap/pelatihan/tes/pretest?kegiatan=31");
    expect(tugasUtamaPelatihan(hub(undefined, { tes }), NOW)!.href).toBe("/sigap/pelatihan/tes/pretest");
  });
  it("ringkasPelatihan", () => {
    expect(ringkasPelatihan(hub(44), NOW)!.href).toBe("/sigap/pelatihan?kegiatan=44");
    expect(ringkasPelatihan(hub(null), NOW)!.href).toBe("/sigap/pelatihan");
  });
});

describe("notifikasi izin membawa kegiatan", () => {
  it("url pengelola dan peserta", () => {
    expect(pesanIzinDiminta("A", "pretest", "sinyal", 1, 31).url).toBe(`${URL_PENGELOLA}?kegiatan=31`);
    expect(pesanIzinDiputuskan(true, "pretest", "B", 1, 31).url).toBe(`${URL_PESERTA}?kegiatan=31`);
    expect(pesanIzinDibuka("pretest", "B", 5, 31).url).toBe(`${URL_PESERTA}?kegiatan=31`);
    expect(pesanIzinDibuka("pretest", "B", 5).url).toBe(URL_PESERTA);
  });
});

describe("pemilih pelatihan", () => {
  const p = (id: number, mulai: string | null, selesai: string | null): PilihanPelatihan => ({ id, nama: `K${id}`, kode: `k${id}`, tanggal_mulai: mulai, tanggal_selesai: selesai });
  it("kurang dari dua -> kosong", () => {
    expect(urutkanPilihan([], "2026-11-03")).toEqual([]);
    expect(urutkanPilihan([p(1, "2026-11-09", "2026-11-09")], "2026-11-03")).toEqual([]);
  });
  it("yang belum selesai paling awal dulu, lalu yang sudah selesai terbaru dulu", () => {
    const d = [p(3, "2026-11-20", "2026-11-21"), p(1, "2026-10-01", "2026-10-02"), p(2, "2026-11-09", "2026-11-09")];
    expect(urutkanPilihan(d, "2026-11-03").map((x) => x.id)).toEqual([2, 3, 1]);
  });
  it("alamat ganti pelatihan menjaga parameter lain", () => {
    expect(alamatGantiPelatihan("/sigap/pelatihan/hari-ini", "", 5)).toBe("/sigap/pelatihan/hari-ini?kegiatan=5");
    expect(alamatGantiPelatihan("/sigap/pelatihan", "?tab=pelatihan&kegiatan=2", 5)).toBe("/sigap/pelatihan?tab=pelatihan&kegiatan=5");
  });
});
