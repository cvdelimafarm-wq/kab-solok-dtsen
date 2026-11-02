import "./reactGlobal";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/sigapTesDb", () => ({ FILTER_BUKAN_ADMINISTRASI: "sumber.is.null" }));
vi.mock("@/lib/sigapAkses", () => ({ boleh: (izin: Record<string, unknown>, menu: string) => !!izin[menu] }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown; [k: string]: unknown }) => e("a", { href: p.href, "aria-current": p["aria-current"] as string | undefined }, p.children as React.ReactNode) }));

import { aturAtasan, muatKetentuan, muatProgres, muatSimpulHierarki, muatTampilan, simpanKetentuan, simpanRespons, tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";
import { TabPelatihan, daftarTab } from "@/app/sigap/pelatihan/TabPelatihan";
import type { SimpulHierarki } from "@/lib/hierarkiPelatihan";

(globalThis as unknown as { React: typeof React }).React = React;

type Hasil = { data?: unknown; error?: { message: string } | null };
/** Basis data palsu: tiap tabel punya hasil tetap (atau fungsi), semua pemanggilan rantai dicatat. */
function palsu(tabel: Record<string, Hasil | (() => Hasil)>) {
  const catatan: { tabel: string; aksi: string; arg?: unknown }[] = [];
  const db = {
    from(nama: string) {
      const ambil = (): Hasil => {
        const t = tabel[nama];
        if (!t) return { data: [], error: null };
        return typeof t === "function" ? t() : t;
      };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "or", "limit", "order", "is"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve(ambil());
      b.upsert = (arg: unknown) => {
        catatan.push({ tabel: nama, aksi: "upsert", arg });
        return Promise.resolve(ambil());
      };
      b.then = (ok: (h: Hasil) => unknown, tolak?: (e: unknown) => unknown) => Promise.resolve(ambil()).then(ok, tolak);
      return b;
    },
  };
  return { db: db as never, catatan };
}

const S = (akun_id: number, peran: SimpulHierarki["peran"], atasan: number | null, tersembunyi = false): SimpulHierarki => ({ akun_id, nama: `A${akun_id}`, peran, atasan_akun_id: atasan, kelas: null, tersembunyi });

describe("ketentuan dan respons", () => {
  it("muatKetentuan: tabel belum ada (error) -> bawaan OTOMATIS (tab_pengaturan null)", async () => {
    const { db } = palsu({ sigap_pelatihan_ketentuan: { data: null, error: { message: "relation does not exist" } } });
    expect(await muatKetentuan(db, 1)).toEqual({ tab_pengaturan: null, butir: [], versi: 1, ada: false });
  });
  it("muatKetentuan: membaca baris; true/false manual, null otomatis", async () => {
    const { db } = palsu({ sigap_pelatihan_ketentuan: { data: { tab_baru: true, butir: ["Bawa laptop"], versi: 3 }, error: null } });
    const k = await muatKetentuan(db, 1);
    expect(k.tab_pengaturan).toBe(true);
    expect(k.butir).toEqual(["Bawa laptop"]);
    expect(k.versi).toBe(3);
    expect(k.ada).toBe(true);
    const n = palsu({ sigap_pelatihan_ketentuan: { data: { tab_baru: null, butir: [], versi: 1 }, error: null } });
    expect((await muatKetentuan(n.db, 1)).tab_pengaturan).toBeNull();
  });
  it("muatTampilan: otomatis baru selama pelatihan belum selesai, lama bila sudah selesai; manual mengalahkan otomatis", async () => {
    const mk = (tab: boolean | null, selesai: string) => palsu({
      sigap_pelatihan_ketentuan: { data: { tab_baru: tab, butir: [], versi: 1 }, error: null },
      sigap_kegiatan: { data: { tanggal_mulai: selesai, tanggal_selesai: selesai }, error: null },
    }).db;
    const depan = mk(null, "2999-01-01");
    const lalu = mk(null, "2000-01-01");
    const a = await muatTampilan(depan, 1);
    expect(a).toMatchObject({ tab_baru: true, otomatis: true, kegiatan_selesai: false });
    const b = await muatTampilan(lalu, 1);
    expect(b).toMatchObject({ tab_baru: false, otomatis: true, kegiatan_selesai: true });
    expect(await muatTampilan(mk(true, "2000-01-01"), 1)).toMatchObject({ tab_baru: true, otomatis: false });
    expect(await muatTampilan(mk(false, "2999-01-01"), 1)).toMatchObject({ tab_baru: false, otomatis: false });
  });
  it("simpanKetentuan: versi naik hanya bila butir berubah; saklar saja tidak menaikkan versi; null = kembali otomatis", async () => {
    const { db, catatan } = palsu({ sigap_pelatihan_ketentuan: { data: { tab_baru: false, butir: ["A"], versi: 2 }, error: null } });
    const sama = await simpanKetentuan(db, 1, { tab_baru: true }, "Iqbal");
    expect(sama.ok && sama.ketentuan).toMatchObject({ tab_pengaturan: true, versi: 2, butir: ["A"] });
    const beda = await simpanKetentuan(db, 1, { butir: ["A", "B"] }, "Iqbal");
    expect(beda.ok && beda.ketentuan).toMatchObject({ versi: 3, butir: ["A", "B"] });
    const oto = await simpanKetentuan(db, 1, { tab_baru: null }, "Iqbal");
    expect(oto.ok && oto.ketentuan.tab_pengaturan).toBeNull();
    const ups = catatan.filter((c) => c.aksi === "upsert");
    expect(ups).toHaveLength(3);
    expect((ups[2].arg as { tab_baru: unknown }).tab_baru).toBeNull();
  });
  it("simpanKetentuan: galat tulis -> pesan jelas (zi dan zj), tidak melempar", async () => {
    let n = 0;
    const { db } = palsu({ sigap_pelatihan_ketentuan: () => (n++ === 0 ? { data: null, error: null } : { data: null, error: { message: "x" } }) });
    const h = await simpanKetentuan(db, 1, { tab_baru: true }, "Iqbal");
    expect(h.ok).toBe(false);
    expect(!h.ok && h.pesan).toContain("20261102zi");
    expect(!h.ok && h.pesan).toContain("20261102zj");
  });
  it("simpanRespons: kirim satu baris dan gagal dengan pesan bila tabel belum ada", async () => {
    const a = palsu({ sigap_pelatihan_undangan_respons: { data: null, error: null } });
    expect((await simpanRespons(a.db, 1, 7, "terima", null, 2)).ok).toBe(true);
    expect(a.catatan[0].arg).toMatchObject({ kegiatan_id: 1, akun_id: 7, respons: "terima", versi_ketentuan: 2 });
    const b = palsu({ sigap_pelatihan_undangan_respons: { data: null, error: { message: "x" } } });
    expect((await simpanRespons(b.db, 1, 7, "terima", null, 2)).ok).toBe(false);
  });
});

describe("hierarki", () => {
  it("muatSimpulHierarki: tabel hierarki belum ada -> simpul dari penugasan tanpa atasan, tersedia=false", async () => {
    const { db } = palsu({
      sigap_pelatihan_hierarki: { data: null, error: { message: "no table" } },
      sigap_penugasan: { data: [{ akun_id: 1, peran: "korwil", kelas: null }, { akun_id: 2, peran: "ppl", kelas: 2 }, { akun_id: 3, peran: "panitia", kelas: null }], error: null },
      sigap_akun: { data: [{ id: 1, nama: "Budi" }, { id: 2, nama: "Sari" }], error: null },
      sigap_pelatihan_undangan_respons: { data: [{ akun_id: 2 }], error: null },
    });
    const h = await muatSimpulHierarki(db, 1);
    expect(h.tersedia).toBe(false);
    expect(h.simpul.map((s) => s.akun_id).sort()).toEqual([1, 2]); // panitia bukan bagian hierarki
    expect(h.simpul.find((s) => s.akun_id === 2)).toMatchObject({ nama: "Sari", kelas: 2, tersembunyi: true, atasan_akun_id: null });
  });
  it("muatSimpulHierarki: baris hierarki dipakai; peserta tanpa baris ditambahkan tanpa atasan", async () => {
    const { db } = palsu({
      sigap_pelatihan_hierarki: { data: [{ akun_id: 1, peran_pelatihan: "pml", atasan_akun_id: null }, { akun_id: 2, peran_pelatihan: "ppl", atasan_akun_id: 1 }], error: null },
      sigap_penugasan: { data: [{ akun_id: 1, peran: "pml", kelas: null }, { akun_id: 2, peran: "ppl", kelas: null }, { akun_id: 4, peran: "ppl", kelas: null }], error: null },
      sigap_akun: { data: [], error: null },
    });
    const h = await muatSimpulHierarki(db, 1);
    expect(h.tersedia).toBe(true);
    expect(h.simpul.find((s) => s.akun_id === 2)?.atasan_akun_id).toBe(1);
    expect(h.simpul.find((s) => s.akun_id === 4)?.atasan_akun_id).toBeNull();
    expect(h.simpul.find((s) => s.akun_id === 4)?.nama).toBe("Akun 4");
  });
  const semua = [S(1, "korwil", null), S(2, "pml", 1), S(3, "ppl", 2)];
  it("aturAtasan: menolak diri sendiri, bukan peserta, atasan asing, dan siklus", async () => {
    const { db } = palsu({ sigap_pelatihan_hierarki: { data: null, error: null } });
    expect((await aturAtasan(db, 1, 9, 1, null, "x", semua)).ok).toBe(false);
    expect(await aturAtasan(db, 1, 2, 2, null, "x", semua)).toEqual({ ok: false, pesan: "Atasan tidak boleh diri sendiri." });
    expect(await aturAtasan(db, 1, 2, 99, null, "x", semua)).toEqual({ ok: false, pesan: "Atasan harus peserta pelatihan ini." });
    expect(await aturAtasan(db, 1, 1, 3, null, "x", semua)).toEqual({ ok: false, pesan: "Pilihan itu membuat atasan melingkar." });
  });
  it("aturAtasan: berhasil menyimpan dengan sumber manual; atasan null diperbolehkan", async () => {
    const { db, catatan } = palsu({ sigap_pelatihan_hierarki: { data: null, error: null } });
    expect((await aturAtasan(db, 5, 3, 1, null, "Iqbal", semua)).ok).toBe(true);
    expect(catatan[0].arg).toMatchObject({ kegiatan_id: 5, akun_id: 3, atasan_akun_id: 1, peran_pelatihan: "ppl", sumber: "manual" });
    expect((await aturAtasan(db, 5, 3, null, "pml", "Iqbal", semua)).ok).toBe(true);
    expect(catatan[1].arg).toMatchObject({ atasan_akun_id: null, peran_pelatihan: "pml" });
  });
  it("tentukanPengguna: izin kelola -> panitia; punya kelas -> instruktur; selain itu peserta", async () => {
    const kosong = palsu({ sigap_kuis_instruktur_kelas: { data: [], error: null } }).db;
    expect(await tentukanPengguna(kosong, 1, 7, { "pelatihan.kelola": { level: "lihat", semua: true, kegiatan: [] } })).toEqual({ jenis: "panitia" });
    const ins = palsu({ sigap_kuis_instruktur_kelas: { data: [{ kelas: 2 }], error: null } }).db;
    expect(await tentukanPengguna(ins, 1, 7, {})).toEqual({ jenis: "instruktur", kelas: 2 });
    expect(await tentukanPengguna(kosong, 1, 7, {})).toEqual({ jenis: "peserta", akun_id: 7 });
  });
});

describe("muatProgres", () => {
  it("menggabungkan undangan, tes (skor terbaik, tidak diturunkan percobaan berjalan), dan kehadiran", async () => {
    const { db } = palsu({
      sigap_pelatihan_undangan_respons: { data: [{ akun_id: 1, respons: "terima" }, { akun_id: 2, respons: "tolak" }], error: null },
      sigap_tes: { data: [{ id: 10, jenis: "pretest" }, { id: 11, jenis: "posttest" }], error: null },
      sigap_pelatihan_presensi: { data: [{ akun_id: 1 }], error: null },
      sigap_tes_sesi: {
        data: [
          { tes_id: 10, akun_id: 1, selesai_at: "2026-11-05T01:00:00Z", skor: "60.00", skor_terbaik: null },
          { tes_id: 11, akun_id: 1, selesai_at: "2026-11-05T05:00:00Z", skor: 70, skor_terbaik: 80 },
          { tes_id: 11, akun_id: 1, selesai_at: null, skor: null, skor_terbaik: null }, // percobaan ke-2 berjalan
          { tes_id: 10, akun_id: 2, selesai_at: null, skor: null, skor_terbaik: null },
        ],
        error: null,
      },
    });
    const p = await muatProgres(db, 1, [1, 2, 3]);
    expect(p.get(1)).toEqual({ undangan: "terima", pretest: { status: "selesai", skor: 60 }, posttest: { status: "selesai", skor: 80 }, hadir: true });
    expect(p.get(2)).toMatchObject({ undangan: "tolak", pretest: { status: "mengerjakan", skor: null }, hadir: false });
    expect(p.get(3)).toEqual({ undangan: "belum", pretest: { status: "belum", skor: null }, posttest: { status: "belum", skor: null }, hadir: false });
  });
  it("pembacaan yang melempar dianggap kosong, bukan galat", async () => {
    const { db } = palsu({
      sigap_pelatihan_undangan_respons: () => {
        throw new Error("tabel tidak ada");
      },
    });
    const p = await muatProgres(db, 1, [1]);
    expect(p.get(1)?.undangan).toBe("belum");
  });
});

describe("bilah 5 tab", () => {
  it("lima tab berurutan Hari ini · Instrumen · Pelatihan · Kamera · Monitoring", () => {
    expect(daftarTab("/sigap/translok/abc").map((t) => t.label)).toEqual(["Hari ini", "Instrumen", "Pelatihan", "Kamera", "Monitoring"]);
  });
  it("tab aktif bertanda halaman; Kamera tanpa tautan dinonaktifkan (bukan tautan)", () => {
    const h = renderToStaticMarkup(e(TabPelatihan, { aktif: "monitoring", kameraHref: null }));
    expect(h.match(/aria-current="page"/g)?.length).toBe(1);
    expect(h).toContain('href="/sigap/pelatihan/monitoring"');
    expect(h).toContain('href="/sigap/pelatihan?tab=pelatihan"');
    expect(h).toContain("aria-disabled");
    expect(h).not.toContain("translok");
    const ada = renderToStaticMarkup(e(TabPelatihan, { aktif: "hari-ini", kameraHref: "/sigap/translok/abc" }));
    expect(ada).toContain('href="/sigap/translok/abc"');
    expect(ada).not.toContain("aria-disabled");
  });
});
