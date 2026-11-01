import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("next/server", () => ({ NextRequest: class {}, NextResponse: { json: () => ({}) } }));

import { idKegiatanPelatihan } from "../sigapTesDb";

type Tabel = Record<string, unknown[]>;
function dbTiruan(t: Tabel) {
  return {
    from(nama: string) {
      const data = t[nama] ?? [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: data[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => res({ data, error: null });
      return q;
    },
  } as never;
}

const keg = (id: number, m: string | null, s: string | null = m) => ({ id, tanggal_mulai: m, tanggal_selesai: s });
const besok = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10);
const lalu = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);

describe("idKegiatanPelatihan untuk peserta", () => {
  it("peserta hanya pelatihan bawaan -> bawaan", async () => {
    const db = dbTiruan({ sigap_kegiatan: [keg(3, lalu)], sigap_penugasan: [{ kegiatan_id: 3 }] });
    expect(await idKegiatanPelatihan(db, null, 9001)).toBe(3);
  });
  it("peserta bawaan (selesai) dan pelatihan lain yang akan datang -> yang akan datang", async () => {
    const db = dbTiruan({ sigap_kegiatan: [keg(3, lalu), keg(7, besok)], sigap_penugasan: [{ kegiatan_id: 3 }, { kegiatan_id: 7 }] });
    expect(await idKegiatanPelatihan(db, null, 9002)).toBe(7);
  });
  it("bukan peserta bawaan, tepat satu pelatihan lain -> pelatihan itu (perilaku lama)", async () => {
    const db = dbTiruan({ sigap_kegiatan: [keg(3, lalu), keg(5, besok)], sigap_penugasan: [{ kegiatan_id: 5 }] });
    // maybeSingle (bawaan) = baris pertama; kandidat = semua baris sigap_kegiatan yang dikembalikan tiruan; pilih berdasarkan aturan tanggal
    expect(await idKegiatanPelatihan(db, null, 9003)).toBe(5);
  });
  it("tanpa penugasan sama sekali -> bawaan", async () => {
    const db = dbTiruan({ sigap_kegiatan: [keg(3, lalu)], sigap_penugasan: [] });
    expect(await idKegiatanPelatihan(db, null, 9004)).toBe(3);
  });
  it("tanpa akunId (rute admin) -> bawaan, tanpa membaca penugasan", async () => {
    const db = dbTiruan({ sigap_kegiatan: [keg(3, lalu), keg(7, besok)], sigap_penugasan: [{ kegiatan_id: 7 }] });
    expect(await idKegiatanPelatihan(db, null)).toBe(3);
  });
  it("?kegiatan=ID menang atas pilihan otomatis", async () => {
    const db = dbTiruan({ sigap_kegiatan: [keg(7, besok)], sigap_penugasan: [{ kegiatan_id: 3 }] });
    const req = { nextUrl: { searchParams: new URLSearchParams("kegiatan=7") } };
    expect(await idKegiatanPelatihan(db, req, 9005)).toBe(7);
  });
});
