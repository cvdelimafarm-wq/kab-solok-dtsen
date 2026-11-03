// (3 Nov 2026) Gerbang undangan pelatihan: sebelum undangan diterima peserta tidak mengakses apa pun selain kartu undangan; menolak = dikeluarkan dari pelatihan.
import { describe, expect, it } from "vitest";
import { gerbangDari, tabBolehSaatTerkunci, PESAN_GERBANG, TUBUH_GERBANG } from "../gerbangUndangan";
import { gerbangTertutup, keluarkanPenolak, muatDaftarPenolak, periksaGerbang } from "../sigapPelatihanBaruDb";
import { tugasUtamaPelatihan, type HubTugas } from "../sigapTugasUtama";
import { ringkasPelatihan } from "../sigapKegiatan";

describe("gerbangDari (murni)", () => {
  it("bukan tampilan lima tab: selalu boleh (pelatihan lama / selesai tidak berubah)", () => {
    expect(gerbangDari(false, null)).toBe("boleh");
    expect(gerbangDari(false, "tolak")).toBe("boleh");
  });
  it("tampilan lima tab: hanya yang MENERIMA yang boleh; belum menjawab dan penolak yang diaktifkan kembali harus menerima dahulu", () => {
    expect(gerbangDari(true, "terima")).toBe("boleh");
    expect(gerbangDari(true, null)).toBe("belum");
    expect(gerbangDari(true, "tolak")).toBe("belum");
  });
  it("saat terkunci hanya tab Hari ini yang terbuka; pesan seragam", () => {
    expect(tabBolehSaatTerkunci("hari-ini")).toBe(true);
    for (const k of ["instrumen", "pelatihan", "absen", "kamera", "monitoring"]) expect(tabBolehSaatTerkunci(k)).toBe(false);
    expect(TUBUH_GERBANG).toEqual({ error: PESAN_GERBANG, undangan_belum: true });
  });
});

/** db palsu: from(tabel) -> rantai yang semua .eq/.select/.in/.order/.limit mengembalikan dirinya; maybeSingle / await menghasilkan isi tabel. */
function dbPalsu(isi: Record<string, { data?: unknown; error?: unknown } | (() => never)>, perbarui?: (t: string, v: unknown) => { data?: unknown; error?: unknown }) {
  return {
    from(t: string) {
      const h = () => {
        const x = isi[t];
        if (typeof x === "function") x();
        return Promise.resolve((x as { data?: unknown; error?: unknown } | undefined) ?? { data: null, error: null });
      };
      const rantai: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "or", "order", "limit"]) rantai[m] = () => rantai;
      rantai.maybeSingle = h;
      rantai.then = (ok: (v: unknown) => unknown, tolak?: (e: unknown) => unknown) => h().then(ok, tolak);
      rantai.update = (v: unknown) => {
        const hasil = perbarui?.(t, v) ?? { data: [], error: null };
        const r2: Record<string, unknown> = {};
        for (const m of ["eq", "or", "select"]) r2[m] = () => r2;
        r2.then = (ok: (z: unknown) => unknown) => Promise.resolve(hasil).then(ok);
        return r2;
      };
      return rantai;
    },
  } as never;
}

describe("periksaGerbang (server)", () => {
  const PEL = { sigap_kegiatan: { data: { jenis: "pelatihan", tanggal_mulai: "2026-11-01", tanggal_selesai: "2999-01-01" } } };
  it("menerima -> boleh (cukup satu pembacaan)", async () => {
    expect(await periksaGerbang(dbPalsu({ sigap_pelatihan_undangan_respons: { data: { respons: "terima" } } }), 7, 1)).toBe("boleh");
  });
  it("pelatihan lima tab, belum menjawab -> belum; menolak (diaktifkan kembali) -> belum", async () => {
    expect(await periksaGerbang(dbPalsu({ ...PEL, sigap_pelatihan_undangan_respons: { data: null } }), 7, 1)).toBe("belum");
    expect(await periksaGerbang(dbPalsu({ ...PEL, sigap_pelatihan_undangan_respons: { data: { respons: "tolak" } } }), 7, 1)).toBe("belum");
  });
  it("kegiatan bukan pelatihan, tabel belum ada, atau galat baca -> boleh (tidak pernah mengunci karena galat)", async () => {
    expect(await periksaGerbang(dbPalsu({ sigap_kegiatan: { data: { jenis: "pendataan" } }, sigap_pelatihan_undangan_respons: { data: null } }), 7, 1)).toBe("boleh");
    expect(await periksaGerbang(dbPalsu({ sigap_pelatihan_undangan_respons: { error: { message: "tak ada" } } }), 7, 1)).toBe("boleh");
    expect(await periksaGerbang(dbPalsu({ sigap_pelatihan_undangan_respons: () => { throw new Error("x"); } }), 7, 1)).toBe("boleh");
  });
  it("pelatihan yang sudah selesai (tampilan lama) -> boleh walau belum menjawab", async () => {
    const lama = { sigap_kegiatan: { data: { jenis: "pelatihan", tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-01-02" } }, sigap_pelatihan_undangan_respons: { data: null } };
    expect(await periksaGerbang(dbPalsu(lama), 3, 1)).toBe("boleh");
  });
  it("pengelola (izin lihat Kelola Pelatihan) tidak tertahan walau belum menerima", async () => {
    const izin = { "pelatihan.kelola": { level: "lihat", semua: true, kegiatan: [] } } as never;
    const db = dbPalsu({ ...PEL, sigap_pelatihan_undangan_respons: { data: null } });
    expect(await gerbangTertutup(db, 7, 1, izin)).toBe(false);
    expect(await gerbangTertutup(db, 7, 1, {} as never)).toBe(true);
  });
});

describe("keluarkanPenolak dan daftar penolak", () => {
  it("menonaktifkan penugasan peserta (aktif=false) dan melaporkan jumlahnya", async () => {
    let dikirim: unknown = null;
    const db = dbPalsu({}, (t, v) => { dikirim = { t, v }; return { data: [{ id: 5 }], error: null }; });
    expect(await keluarkanPenolak(db, 7, 1)).toEqual({ ok: true, dikeluarkan: 1 });
    expect(dikirim).toEqual({ t: "sigap_penugasan", v: { aktif: false } });
  });
  it("gagal menulis -> pesan jelas, tidak melempar", async () => {
    const db = dbPalsu({}, () => ({ data: null, error: { message: "x" } }));
    expect(await keluarkanPenolak(db, 7, 1)).toMatchObject({ ok: false });
  });
  it("daftar penolak memuat nama + alasan; kosong bila tabel belum ada", async () => {
    const db = dbPalsu({ sigap_pelatihan_undangan_respons: { data: [{ akun_id: 9, alasan: "sakit", dijawab_at: "2026-11-03T01:00:00Z" }] }, sigap_akun: { data: [{ id: 9, nama: "Budi" }] } });
    expect(await muatDaftarPenolak(db, 7)).toEqual([{ akun_id: 9, nama: "Budi", alasan: "sakit", dijawab_at: "2026-11-03T01:00:00Z" }]);
    expect(await muatDaftarPenolak(dbPalsu({ sigap_pelatihan_undangan_respons: { error: { message: "x" } } }), 7)).toEqual([]);
  });
});

describe("Beranda saat gerbang tertutup", () => {
  const hub: HubTugas = { kegiatan_id: 7, peserta: { peran: "ppl" }, undangan: { tanggal_iso: "2026-11-10" }, tes: [], langkah: null, presensi: null, kuis: null, token_translok: null, terkunci_undangan: true };
  it("satu-satunya tugas: Respons undangan pelatihan (mendesak) menuju Hari ini kegiatannya", () => {
    const t = tugasUtamaPelatihan(hub, Date.parse("2026-11-03T03:00:00Z"));
    expect(t).toMatchObject({ judul: "Respons undangan pelatihan", aksi: "Buka undangan", skor: 100 });
    expect(t!.href).toContain("/sigap/pelatihan/hari-ini");
    expect(t!.href).toContain("kegiatan=7");
  });
  it("ikon pelatihan di Beranda menampilkan ajakan merespons undangan", () => {
    const r = ringkasPelatihan(hub, Date.parse("2026-11-03T03:00:00Z"));
    expect(r?.sub).toContain("Respons undangan pelatihan");
    expect(r?.nada).toBe("merah");
  });
  it("tanpa gerbang: perilaku lama (bukan peserta -> tidak ada tugas)", () => {
    expect(tugasUtamaPelatihan({ ...hub, peserta: null }, Date.now())).toBeNull();
  });
});
