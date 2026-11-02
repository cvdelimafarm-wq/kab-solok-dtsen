import { describe, expect, it } from "vitest";
import { muatAturan, muatSkorPertama, simpanAturan, PESAN_SQL_ATURAN } from "../sigapAturanDb";
import { hitungAkhir, SKEMA_BAWAAN } from "../sigapNilaiHitung";

type Baris = Record<string, unknown>;
type Tabel = Record<string, Baris[]>;

/** Db tiruan minimal: select / eq / in / not / limit / maybeSingle / upsert. Tabel yang tidak ada di `tabel` menghasilkan galat seperti PostgREST. */
function dbTiruan(tabel: Tabel, galatKolom: string[] = []) {
  const cek = (nama: string, kolom?: string) => {
    if (!(nama in tabel)) return { message: `relation "${nama}" does not exist` };
    if (kolom && galatKolom.some((g) => kolom.includes(g))) return { message: `column "${galatKolom[0]}" does not exist` };
    return null;
  };
  return {
    from(nama: string) {
      let baris = [...(tabel[nama] ?? [])];
      let kolomPilih = "";
      const q: Record<string, unknown> = {
        select(k: string) { kolomPilih = k; return q; },
        eq(k: string, v: unknown) { baris = baris.filter((r) => r[k] === v); return q; },
        in(k: string, v: unknown[]) { baris = baris.filter((r) => v.includes(r[k])); return q; },
        not(k: string, _o: string, v: unknown) { baris = baris.filter((r) => r[k] !== v); return q; },
        limit() { return q; },
        maybeSingle() { const e = cek(nama, kolomPilih); return Promise.resolve({ data: e ? null : baris[0] ?? null, error: e }); },
        upsert(isi: Baris) {
          const e = cek(nama);
          if (!e) {
            const i = (tabel[nama] ?? []).findIndex((r) => r.kegiatan_id === isi.kegiatan_id);
            if (i >= 0) tabel[nama][i] = { ...tabel[nama][i], ...isi };
            else tabel[nama].push(isi);
          }
          return Promise.resolve({ error: e });
        },
        then(ok: (v: unknown) => unknown) { const e = cek(nama, kolomPilih); return Promise.resolve({ data: e ? null : baris, error: e }).then(ok); },
      };
      return q;
    },
  } as never;
}

describe("muatAturan", () => {
  it("tanpa baris: PSP versi 1, kegiatan lain versi 2", async () => {
    const t: Tabel = { sigap_kegiatan: [{ id: 3, kode: "pelatihan_psp_pascabencana_2026" }, { id: 7, kode: "pelatihan_seruti_tw4_2026" }], sigap_pelatihan_aturan: [] };
    expect((await muatAturan(dbTiruan(t), 3)).versi).toBe(1);
    expect((await muatAturan(dbTiruan(t), 7)).versi).toBe(2);
    expect((await muatAturan(dbTiruan(t), 7)).eksplisit).toBe(false);
  });
  it("baris tersimpan menang atas bawaan", async () => {
    const t: Tabel = { sigap_kegiatan: [{ id: 3, kode: "pelatihan_psp_pascabencana_2026" }], sigap_pelatihan_aturan: [{ kegiatan_id: 3, aturan_versi: 2, blokir_tahap: true, izin_ajukan: false }] };
    const a = await muatAturan(dbTiruan(t), 3);
    expect(a).toEqual({ versi: 2, blokir_tahap: true, izin_ajukan: false, eksplisit: true });
  });
  it("tabel belum ada (SQL belum jalan): jatuh ke bawaan tanpa galat", async () => {
    const t: Tabel = { sigap_kegiatan: [{ id: 3, kode: "pelatihan_psp_pascabencana_2026" }, { id: 7, kode: "x" }] };
    expect((await muatAturan(dbTiruan(t), 3)).versi).toBe(1);
    expect((await muatAturan(dbTiruan(t), 7)).versi).toBe(2);
  });
});

describe("simpanAturan", () => {
  it("menyimpan dan dibaca kembali", async () => {
    const t: Tabel = { sigap_kegiatan: [{ id: 3, kode: "pelatihan_psp_pascabencana_2026" }], sigap_pelatihan_aturan: [] };
    const db = dbTiruan(t);
    expect(await simpanAturan(db, 3, { versi: 2, blokir_tahap: false, izin_ajukan: false }, "Iqbal")).toEqual({ ok: true });
    expect((await muatAturan(db, 3)).versi).toBe(2);
    expect(await simpanAturan(db, 3, { versi: 1, blokir_tahap: true, izin_ajukan: true }, "Iqbal")).toEqual({ ok: true });
    expect(t.sigap_pelatihan_aturan).toHaveLength(1);
    expect(t.sigap_pelatihan_aturan[0].aturan_versi).toBe(1);
  });
  it("tabel belum ada: pesan yang menunjuk SQL-nya", async () => {
    const r = await simpanAturan(dbTiruan({ sigap_kegiatan: [] }), 3, { versi: 2, blokir_tahap: false, izin_ajukan: false }, "x");
    expect(r).toEqual({ ok: false, pesan: PESAN_SQL_ATURAN });
  });
});

describe("muatSkorPertama", () => {
  it("memakai skor_awal, melengkapi dari arsip untuk yang kosong", async () => {
    const t: Tabel = {
      sigap_tes_sesi: [{ id: 1, skor_awal: 55 }, { id: 2, skor_awal: null }, { id: 3, skor_awal: null }],
      sigap_tes_sesi_arsip: [{ sesi_id: 2, percobaan: 1, skor: 40 }, { sesi_id: 2, percobaan: 2, skor: 90 }],
    };
    const h = await muatSkorPertama(dbTiruan(t), [1, 2, 3]);
    expect(h.get(1)).toBe(55);
    expect(h.get(2)).toBe(40);
    expect(h.has(3)).toBe(false);
  });
  it("kolom skor_awal belum ada: hanya arsip yang dipakai", async () => {
    const t: Tabel = { sigap_tes_sesi: [{ id: 2 }], sigap_tes_sesi_arsip: [{ sesi_id: 2, percobaan: 1, skor: "61.50" }] };
    const h = await muatSkorPertama(dbTiruan(t, ["skor_awal"]), [2]);
    expect(h.get(2)).toBe(61.5);
  });
  it("daftar kosong", async () => {
    expect((await muatSkorPertama(dbTiruan({}), [])).size).toBe(0);
  });
});

describe("hitungAkhir menurut versi", () => {
  const n = { pretest: 70, posttest: 70, kuis: { ruang_id: 1, kelas: 1, poin: 0, benar: 7, menjawab: 10, total_soal: 10, benar_pct: 70, poin_pct: 0 } };
  it("versi 1 tanpa wajib lulus: tidak ada flag lulus (perilaku lama)", () => {
    expect(hitungAkhir(SKEMA_BAWAAN, n).lulus).toBeUndefined();
  });
  it("versi 2: tepat 70 = tidak lulus, flag tampil walau tidak wajib", () => {
    const h = hitungAkhir(SKEMA_BAWAAN, n, 2);
    expect(h.akhir).toBe(70);
    expect(h.lulus).toBe(false);
    expect(hitungAkhir(SKEMA_BAWAAN, { ...n, posttest: 71 }, 2).lulus).toBe(true);
  });
  it("versi 2: nilai belum lengkap tidak diberi flag", () => {
    const h = hitungAkhir(SKEMA_BAWAAN, { pretest: 90, posttest: null, kuis: null }, 2);
    expect(h.lengkap).toBe(false);
    expect(h.lulus).toBeUndefined();
  });
  it("versi 1 dengan wajib lulus akhir: >= ambang", () => {
    const skema = { ...SKEMA_BAWAAN, lulus_akhir: { wajib: true, nilai: 70 } };
    expect(hitungAkhir(skema, n, 1).lulus).toBe(true);
    expect(hitungAkhir(skema, n, 2).lulus).toBe(false);
  });
});
