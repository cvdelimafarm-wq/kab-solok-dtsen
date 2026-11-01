import { describe, expect, it } from "vitest";
import { awalForm, normalisasi } from "../keu/identifikasi";
import { bolehMencatat, keadaanVanguard, pesertaAktif } from "../vanguardAkses";
import { buatDbPalsu, type Tabel } from "./vanguardFakeDb";

const formSah = (v: { pelatihan?: boolean; pendataan?: boolean }, ubah: (f: ReturnType<typeof awalForm>) => void = () => {}) => {
  const f = normalisasi({ sesi: { pelatihan: { on: true, bentuk: "Luring", tempat: "Kantor" } }, instrumen: "FASIH", vanguard: { pelatihan: false, pendataan: false, ...v } });
  ubah(f);
  return f;
};
const dasar = (lebih: Partial<Tabel> = {}): Tabel => ({
  sigap_kegiatan_fitur: [],
  keu_ident_kegiatan: [{ id: 1, ident_id: 10, kegiatan_id: 5, fungsi: "pendataan", dilepas_at: null }],
  keu_ident: [{ id: 10, status: "sah", ver: 1 }],
  keu_ident_versi: [{ ident_id: 10, ver: 1, form: formSah({ pendataan: true }) }],
  sigap_penugasan: [{ id: 1, kegiatan_id: 5, akun_id: 77, aktif: true, sumber: null }],
  ...lebih,
});

describe("keadaanVanguard", () => {
  it("menyala dari Identifikasi survei bila versi Sah menjawab Ya untuk fungsi tautannya", async () => {
    expect(await keadaanVanguard(buatDbPalsu(dasar()), 5)).toEqual({ menyala: true, sumber: "identifikasi", fungsi: "pendataan" });
  });
  it("mati bila jawaban Tidak, atau jawaban Ya hanya untuk fungsi lain", async () => {
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident_versi: [{ ident_id: 10, ver: 1, form: formSah({}) }] })), 5)).menyala).toBe(false);
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident_versi: [{ ident_id: 10, ver: 1, form: formSah({ pelatihan: true }) }] })), 5)).menyala).toBe(false);
  });
  it("pelatihan: Ya berlaku untuk tautan fungsi pelatihan", async () => {
    const t = dasar({ keu_ident_kegiatan: [{ id: 2, ident_id: 10, kegiatan_id: 5, fungsi: "pelatihan", dilepas_at: null }], keu_ident_versi: [{ ident_id: 10, ver: 1, form: formSah({ pelatihan: true }) }] });
    expect(await keadaanVanguard(buatDbPalsu(t), 5)).toEqual({ menyala: true, sumber: "identifikasi", fungsi: "pelatihan" });
  });
  it("memakai versi Sah TERBARU", async () => {
    const t = dasar({ keu_ident: [{ id: 10, status: "sah", ver: 2 }], keu_ident_versi: [{ ident_id: 10, ver: 1, form: formSah({ pendataan: true }) }, { ident_id: 10, ver: 2, form: formSah({}) }] });
    expect((await keadaanVanguard(buatDbPalsu(t), 5)).menyala).toBe(false);
  });
  it("tautan yang sudah dilepas, identifikasi dibatalkan, atau belum Sah tidak dihitung", async () => {
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident_kegiatan: [{ id: 1, ident_id: 10, kegiatan_id: 5, fungsi: "pendataan", dilepas_at: "2026-11-01" }] })), 5)).menyala).toBe(false);
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident: [{ id: 10, status: "dibatalkan", ver: 1 }] })), 5)).menyala).toBe(false);
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident: [{ id: 10, status: "draf", ver: 0 }] })), 5)).menyala).toBe(false);
  });
  it("fungsi 'lain' dan fungsi tak dikenal tidak pernah menyalakan", async () => {
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident_kegiatan: [{ id: 1, ident_id: 10, kegiatan_id: 5, fungsi: "lain", dilepas_at: null }] })), 5)).menyala).toBe(false);
    expect((await keadaanVanguard(buatDbPalsu(dasar({ keu_ident_kegiatan: [{ id: 1, ident_id: 10, kegiatan_id: 5, fungsi: "x", dilepas_at: null }] })), 5)).menyala).toBe(false);
  });
  it("bagian yang dimatikan di formulir meniadakan efek walau jawabannya Ya", async () => {
    const t = dasar({ keu_ident_versi: [{ ident_id: 10, ver: 1, form: formSah({ pendataan: true }, (f) => { f.instrumen = "Tanpa pendataan"; }) }] });
    expect((await keadaanVanguard(buatDbPalsu(t), 5)).menyala).toBe(false);
  });
  it("centang manual menang atas identifikasi, ya maupun tidak", async () => {
    expect(await keadaanVanguard(buatDbPalsu(dasar({ sigap_kegiatan_fitur: [{ kegiatan_id: 5, fitur: "vanguard", aktif: false }] })), 5)).toEqual({ menyala: false, sumber: "mati", fungsi: null });
    const t = dasar({ keu_ident_kegiatan: [], sigap_kegiatan_fitur: [{ kegiatan_id: 5, fitur: "vanguard", aktif: true }] });
    expect(await keadaanVanguard(buatDbPalsu(t), 5)).toEqual({ menyala: true, sumber: "centang", fungsi: null });
  });
  it("kegiatan lain tidak terpengaruh", async () => {
    expect((await keadaanVanguard(buatDbPalsu(dasar()), 6)).menyala).toBe(false);
  });
  it("formulir rusak tidak melempar galat", async () => {
    const t = dasar({ keu_ident_versi: [{ ident_id: 10, ver: 1, form: "bukan objek" }] });
    expect((await keadaanVanguard(buatDbPalsu(t), 5)).menyala).toBe(false);
  });
});

describe("pesertaAktif dan bolehMencatat", () => {
  it("peserta aktif; nonaktif, peserta tambahan administrasi, atau akun lain ditolak", async () => {
    expect(await pesertaAktif(buatDbPalsu(dasar()), 77, 5)).toBe(true);
    expect(await pesertaAktif(buatDbPalsu(dasar()), 78, 5)).toBe(false);
    expect(await pesertaAktif(buatDbPalsu(dasar({ sigap_penugasan: [{ id: 1, kegiatan_id: 5, akun_id: 77, aktif: false, sumber: null }] })), 77, 5)).toBe(false);
    expect(await pesertaAktif(buatDbPalsu(dasar({ sigap_penugasan: [{ id: 1, kegiatan_id: 5, akun_id: 77, aktif: true, sumber: "administrasi" }] })), 77, 5)).toBe(false);
  });
  it("boleh hanya bila menyala dan peserta; alasan penolakan jelas", async () => {
    expect(await bolehMencatat(buatDbPalsu(dasar()), 77, 5)).toMatchObject({ boleh: true, alasan: null });
    expect((await bolehMencatat(buatDbPalsu(dasar()), 78, 5)).alasan).toBe("Anda bukan peserta aktif kegiatan ini.");
    expect((await bolehMencatat(buatDbPalsu(dasar()), 77, 6)).alasan).toBe("Vanguard belum dinyalakan di kegiatan ini.");
  });
});
