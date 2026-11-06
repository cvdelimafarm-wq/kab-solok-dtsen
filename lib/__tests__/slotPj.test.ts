// lib/__tests__/slotPj.test.ts
// (6 Nov 2026) Slot PJ / Wakil PJ per kegiatan: slot kosong boleh, mengisi memberi peran pj_kegiatan, mengganti/mengosongkan mencabut peran buatan slot saja.
import { describe, expect, it } from "vitest";
import { aturSlotPj, bacaSlotPj, jabatanSah } from "@/lib/slotPj";

type Baris = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function buatDb(t: Record<string, Baris[]>, tanpaTabel: string[] = []) {
  class Q implements PromiseLike<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    private f: ((r: Baris) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private muat: Baris = {};
    private minta = false;
    constructor(private nama: string) {}
    select() { this.minta = true; return this; }
    eq(k: string, v: unknown) { this.f.push((r) => r[k] === v); return this; }
    in(k: string, v: unknown[]) { this.f.push((r) => v.includes(r[k])); return this; }
    insert(b: Baris) { this.op = "insert"; this.muat = b; return this; }
    update(b: Baris) { this.op = "update"; this.muat = b; return this; }
    delete() { this.op = "delete"; return this; }
    maybeSingle() { return Promise.resolve(this.jalan(true)); }
    then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, tolak?: ((e: unknown) => B | PromiseLike<B>) | null) { return Promise.resolve(this.jalan(false)).then(ok, tolak); } // eslint-disable-line @typescript-eslint/no-explicit-any
    private jalan(satu: boolean): { data: any; error: any } { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (tanpaTabel.includes(this.nama)) return { data: null, error: { message: "relation does not exist" } };
      const tabel = (t[this.nama] ??= []);
      if (this.op === "insert") {
        const baru = { id: tabel.reduce((m, r) => Math.max(m, r.id ?? 0), 0) + 1, ...this.muat };
        tabel.push(baru);
        return { data: this.minta ? baru : null, error: null };
      }
      const cocok = tabel.filter((r) => this.f.every((g) => g(r)));
      if (this.op === "update") { for (const r of cocok) Object.assign(r, this.muat); return { data: null, error: null }; }
      if (this.op === "delete") { t[this.nama] = tabel.filter((r) => !cocok.includes(r)); return { data: null, error: null }; }
      return { data: satu ? cocok[0] ?? null : cocok, error: null };
    }
  }
  return { from: (n: string) => new Q(n) } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const dasar = (): Record<string, Baris[]> => ({
  sigap_akun: [{ id: 1, nama: "Ani", aktif: true }, { id: 2, nama: "Budi", aktif: true }, { id: 3, nama: "Citra", aktif: false }],
  sigap_peran: [{ id: 2, kode: "pj_kegiatan" }],
  sigap_akun_peran: [{ id: 10, akun_id: 2, peran_id: 2, kegiatan_id: 7, diberi_oleh: "iqbal" }],
  sigap_kegiatan_penanggung_jawab: [
    { kegiatan_id: 7, jabatan: "pj", akun_id: null, peran_diberikan_id: null },
    { kegiatan_id: 7, jabatan: "wakil_pj", akun_id: null, peran_diberikan_id: null },
  ],
});

describe("bacaSlotPj", () => {
  it("dua slot selalu ada; kosong sebelum diisi, nama terisi setelahnya", async () => {
    const t = dasar();
    const a = await bacaSlotPj(buatDb(t), 7);
    expect(a).toEqual({ tersedia: true, slot: [{ jabatan: "pj", akun_id: null, nama: null }, { jabatan: "wakil_pj", akun_id: null, nama: null }] });
    t.sigap_kegiatan_penanggung_jawab[1].akun_id = 1;
    expect((await bacaSlotPj(buatDb(t), 7)).slot[1]).toEqual({ jabatan: "wakil_pj", akun_id: 1, nama: "Ani" });
  });
  it("tabel belum ada: tidak galat, dua slot kosong, tersedia=false", async () => {
    const r = await bacaSlotPj(buatDb(dasar(), ["sigap_kegiatan_penanggung_jawab"]), 7);
    expect(r.tersedia).toBe(false);
    expect(r.slot).toHaveLength(2);
  });
  it("jabatanSah", () => {
    expect(jabatanSah("pj")).toBe(true);
    expect(jabatanSah("wakil_pj")).toBe(true);
    expect(jabatanSah("ketua")).toBe(false);
  });
});

describe("aturSlotPj", () => {
  it("mengisi slot kosong memberi peran pj_kegiatan pada kegiatan itu", async () => {
    const t = dasar();
    const r = await aturSlotPj(buatDb(t), { kegiatanId: 7, jabatan: "wakil_pj", akunId: 1, oleh: "Iqbal (#354)" });
    expect(r).toEqual({ ok: true, berubah: true, peranDiberi: true, peranDicabut: false });
    const peran = t.sigap_akun_peran.find((x) => x.akun_id === 1)!;
    expect(peran).toMatchObject({ peran_id: 2, kegiatan_id: 7 });
    expect(t.sigap_kegiatan_penanggung_jawab.find((x) => x.jabatan === "wakil_pj")).toMatchObject({ akun_id: 1, peran_diberikan_id: peran.id, diubah_oleh: "Iqbal (#354)" });
  });
  it("mengganti pemegang mencabut peran buatan slot dan memberi peran ke pemegang baru", async () => {
    const t = dasar();
    const db = buatDb(t);
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: 1, oleh: "x" });
    const r = await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: 2, oleh: "x" });
    expect(r).toMatchObject({ ok: true, peranDicabut: true });
    expect(t.sigap_akun_peran.some((x) => x.akun_id === 1)).toBe(false);
    // akun 2 sudah punya peran itu sebelum slot (id 10): tidak dibuat ganda dan tidak ditandai milik slot
    expect(t.sigap_akun_peran.filter((x) => x.akun_id === 2)).toHaveLength(1);
    expect(t.sigap_kegiatan_penanggung_jawab.find((x) => x.jabatan === "wakil_pj")).toMatchObject({ akun_id: 2, peran_diberikan_id: null });
  });
  it("mengosongkan slot mencabut peran buatan slot, tetapi tidak peran lama yang bukan buatan slot", async () => {
    const t = dasar();
    const db = buatDb(t);
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: 1, oleh: "x" });
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: null, oleh: "x" });
    expect(t.sigap_akun_peran.some((x) => x.akun_id === 1)).toBe(false);
    expect(t.sigap_kegiatan_penanggung_jawab.find((x) => x.jabatan === "wakil_pj")).toMatchObject({ akun_id: null, peran_diberikan_id: null });
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "pj", akunId: 2, oleh: "x" }); // peran lama id 10 dipakai ulang
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "pj", akunId: null, oleh: "x" });
    expect(t.sigap_akun_peran.some((x) => x.id === 10)).toBe(true);
  });
  it("tidak ada perubahan bila slot sudah berisi akun yang sama", async () => {
    const t = dasar();
    const db = buatDb(t);
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "pj", akunId: 1, oleh: "x" });
    expect(await aturSlotPj(db, { kegiatanId: 7, jabatan: "pj", akunId: 1, oleh: "x" })).toMatchObject({ ok: true, berubah: false });
  });
  it("menolak akun yang sama di PJ dan Wakil PJ, akun nonaktif, akun tak ada, kegiatan tanpa slot, tabel belum ada", async () => {
    const t = dasar();
    const db = buatDb(t);
    await aturSlotPj(db, { kegiatanId: 7, jabatan: "pj", akunId: 1, oleh: "x" });
    expect(await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: 1, oleh: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: 3, oleh: "x" })).toMatchObject({ ok: false, status: 404 });
    expect(await aturSlotPj(db, { kegiatanId: 7, jabatan: "wakil_pj", akunId: 99, oleh: "x" })).toMatchObject({ ok: false, status: 404 });
    expect(await aturSlotPj(db, { kegiatanId: 8, jabatan: "pj", akunId: 1, oleh: "x" })).toMatchObject({ ok: false, status: 404 });
    expect(await aturSlotPj(buatDb(dasar(), ["sigap_kegiatan_penanggung_jawab"]), { kegiatanId: 7, jabatan: "pj", akunId: 1, oleh: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(t.sigap_kegiatan_penanggung_jawab.find((x) => x.jabatan === "wakil_pj")!.akun_id).toBeNull();
  });
});
