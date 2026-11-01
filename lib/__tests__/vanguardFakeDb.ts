// Basis data palsu dalam memori untuk uji (hanya sebagian kecil API Supabase yang dipakai kode Vanguard). Bukan berkas uji.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Baris = Record<string, any>;
export type Tabel = Record<string, Baris[]>;
export type Galat = { code?: string; message: string } | null;

class Q implements PromiseLike<any> {
  private saring: ((r: Baris) => boolean)[] = [];
  private op: "select" | "insert" = "select";
  private muat: Baris[] = [];
  private opsi: { count?: string; head?: boolean } = {};
  private urut: { k: string; naik: boolean } | null = null;
  private batas = Infinity;
  private kembalikan = false;
  constructor(private t: Tabel, private nama: string, private gagal: (nama: string) => Galat) {}
  select(_k?: string, opsi?: { count?: string; head?: boolean }) { if (this.op === "insert") this.kembalikan = true; this.opsi = opsi ?? {}; return this; }
  eq(k: string, v: unknown) { this.saring.push((r) => r[k] === v); return this; }
  is(k: string, v: unknown) { this.saring.push((r) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)); return this; }
  or(ekspresi: string) { if (ekspresi.includes("sumber.neq.administrasi")) this.saring.push((r) => r.sumber !== "administrasi"); return this; }
  order(k: string, o?: { ascending?: boolean }) { this.urut = { k, naik: o?.ascending !== false }; return this; }
  limit(n: number) { this.batas = n; return this; }
  insert(baris: Baris | Baris[]) { this.op = "insert"; this.muat = Array.isArray(baris) ? baris : [baris]; return this; }
  maybeSingle() { return Promise.resolve(this.jalan(true)); }
  single() { return Promise.resolve(this.jalan(true)); }
  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, tolak?: ((e: unknown) => B | PromiseLike<B>) | null) { return Promise.resolve(this.jalan(false)).then(ok, tolak); }
  private jalan(satu: boolean): { data: any; error: Galat; count?: number } {
    const g = this.gagal(this.nama + ":" + this.op);
    if (g) return { data: null, error: g };
    const tabel = (this.t[this.nama] ??= []);
    if (this.op === "insert") {
      const jadi: Baris[] = [];
      for (const b of this.muat) {
        if (this.nama === "sigap_vanguard_percobaan") {
          if (tabel.some((r) => r.kegiatan_id === b.kegiatan_id && r.akun_id === b.akun_id && r.kasus === b.kasus && r.nomor === b.nomor)) return { data: null, error: { code: "23505", message: "duplikat" } };
        }
        const baru = { id: tabel.length + 1, ...b };
        tabel.push(baru); jadi.push(baru);
      }
      return { data: this.kembalikan ? (satu ? jadi[0] ?? null : jadi) : null, error: null };
    }
    let r = tabel.filter((x) => this.saring.every((f) => f(x)));
    if (this.urut) { const { k, naik } = this.urut; r = [...r].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (naik ? 1 : -1)); }
    r = r.slice(0, this.batas);
    if (this.opsi.head) return { data: null, error: null, count: this.saring.length === 0 ? tabel.length : tabel.filter((x) => this.saring.every((f) => f(x))).length };
    return { data: satu ? r[0] ?? null : r, error: null };
  }
}

export function buatDbPalsu(t: Tabel, gagal: (nama: string) => Galat = () => null) {
  return { from: (nama: string) => new Q(t, nama, gagal) } as any;
}
