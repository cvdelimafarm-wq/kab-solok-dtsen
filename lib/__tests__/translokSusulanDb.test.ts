/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

// kewenangan admin dan jejak audit dipalsukan: yang diuji di sini adalah rantai penyetuju dan alur menyetujui
const admin = new Set<number>();
vi.mock("@/lib/sigapAkses", () => ({
  izinAkun: async (_db: unknown, akunId: number) => ({ peran: [], izin: { admin: admin.has(akunId) } }),
  boleh: (izin: { admin?: boolean }) => !!izin.admin,
  catatAudit: async () => undefined,
}));

import { hariIniWib } from "@/lib/sigap";
import { kandidatSusulan, muatFakta, pembuatPenyetuju, setujuiSusulan, susulanMasuk } from "@/lib/translokSusulanDb";
import { JENDELA_SUSULAN_JAM, type BarisSusulan } from "@/lib/translokSusulan";

type Baris = Record<string, any>;
type Tabel = Record<string, Baris[]>;

/** Basis data palsu dalam memori: select/eq/in/is/gt/not/or(diabaikan)/order/limit/range/maybeSingle, insert/update/delete (+select), count head, indeks unik, dan kegagalan terprogram. */
function buatDb(t: Tabel, unik: Record<string, string[][]> = {}, gagal: (kunci: string) => boolean = () => false) {
  class Q implements PromiseLike<any> {
    private f: ((r: Baris) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private muat: Baris[] = [];
    private minta = false;
    private head = false;
    private urut: { k: string; naik: boolean } | null = null;
    private batas = Infinity;
    constructor(private nama: string) {}
    select(_k?: string, o?: { head?: boolean }) { this.minta = true; this.head = !!o?.head; return this; }
    eq(k: string, v: unknown) { this.f.push((r) => r[k] === v); return this; }
    in(k: string, v: unknown[]) { this.f.push((r) => v.includes(r[k])); return this; }
    is(k: string, v: unknown) { this.f.push((r) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)); return this; }
    gt(k: string, v: any) { this.f.push((r) => r[k] > v); return this; }
    not(k: string, _o: string, v: unknown) { this.f.push((r) => (v === null ? r[k] !== null && r[k] !== undefined : r[k] !== v)); return this; }
    or() { return this; }
    ilike(k: string, pola: string) { const awal = pola.replace(/%/g, "").toLowerCase(); this.f.push((r) => String(r[k] ?? "").toLowerCase().startsWith(awal)); return this; }
    order(k: string, o?: { ascending?: boolean }) { this.urut = { k, naik: o?.ascending !== false }; return this; }
    limit(n: number) { this.batas = n; return this; }
    range(a: number, b: number) { this.batas = b - a + 1; return this; }
    insert(b: Baris | Baris[]) { this.op = "insert"; this.muat = Array.isArray(b) ? b : [b]; return this; }
    update(b: Baris) { this.op = "update"; this.muat = [b]; return this; }
    delete() { this.op = "delete"; return this; }
    maybeSingle() { return Promise.resolve(this.jalan(true)); }
    then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, tolak?: ((e: unknown) => B | PromiseLike<B>) | null) { return Promise.resolve(this.jalan(false)).then(ok, tolak); }
    private jalan(satu: boolean): { data: any; error: any; count?: number } {
      if (gagal(`${this.nama}:${this.op}`)) return { data: null, error: { code: "XX000", message: "gagal terprogram" } };
      const tabel = (t[this.nama] ??= []);
      if (this.op === "insert") {
        const jadi: Baris[] = [];
        for (const b of this.muat) {
          for (const kolom of unik[this.nama] ?? []) {
            if (tabel.some((r) => kolom.every((k) => r[k] === b[k]))) return { data: null, error: { code: "23505", message: "duplikat" } };
          }
          const baru = { id: tabel.reduce((m, r) => Math.max(m, r.id ?? 0), 0) + 1, ...b };
          tabel.push(baru);
          jadi.push(baru);
        }
        return { data: this.minta ? (satu ? jadi[0] ?? null : jadi) : null, error: null };
      }
      const cocok = tabel.filter((r) => this.f.every((g) => g(r)));
      if (this.op === "update") {
        for (const r of cocok) Object.assign(r, this.muat[0]);
        return { data: this.minta ? (satu ? cocok[0] ?? null : cocok) : null, error: null };
      }
      if (this.op === "delete") {
        t[this.nama] = tabel.filter((r) => !cocok.includes(r));
        return { data: null, error: null };
      }
      let r = cocok;
      if (this.urut) { const { k, naik } = this.urut; r = [...r].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (naik ? 1 : -1)); }
      r = r.slice(0, this.batas);
      if (this.head) return { data: null, error: null, count: cocok.length };
      return { data: satu ? r[0] ?? null : r, error: null };
    }
  }
  return { from: (nama: string) => new Q(nama) } as any;
}

const HARI_INI = hariIniWib();
const mundur = (n: number) => { const d = new Date(`${HARI_INI}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const DUA_HARI = mundur(2);
const TIGA_HARI = mundur(3);

// PPL=1, PML=2, Korwil=3, Supervisor=4, PJ=6, PPL lain=7. Rantai lewat bencana_petugas: PPL(11)->PML(12)->Korwil(13)
function dasarTabel(): Tabel {
  return {
    sigap_akun: [
      { id: 1, nama: "Jahar Nas", petugas_bencana_id: 11, token: "tk1" }, { id: 2, nama: "Widya", petugas_bencana_id: 12, token: "tk2" },
      { id: 3, nama: "Deswaty", petugas_bencana_id: 13, token: "tk3" }, { id: 4, nama: "Sup", petugas_bencana_id: null, token: "tk4" },
      { id: 6, nama: "PJ Keg", petugas_bencana_id: null, token: "tk6" }, { id: 7, nama: "PPL Lain", petugas_bencana_id: 17, token: "tk7" },
    ],
    bencana_petugas: [{ id: 11, atasan_id: 12 }, { id: 12, atasan_id: 13 }, { id: 13, atasan_id: null }, { id: 17, atasan_id: null }],
    sigap_tim: [],
    sigap_peran: [{ id: 100, kode: "supervisor_psp" }, { id: 101, kode: "pj_kegiatan" }],
    sigap_akun_peran: [{ akun_id: 4, peran_id: 100, kegiatan_id: null }, { akun_id: 6, peran_id: 101, kegiatan_id: 1 }],
    sigap_penugasan: [{ id: 50, kegiatan_id: 1, akun_id: 1, peran: "ppl", aktif: true }, { id: 57, kegiatan_id: 1, akun_id: 7, peran: "ppl", aktif: true }],
    sigap_hari_kerja: [],
    sigap_hari_kerja_riwayat: [],
    sigap_realisasi: [],
    sigap_dokumentasi: [],
    sigap_izin_susulan: [],
    sigap_translok_susulan: [],
    sigap_translok_blokir: [],
  };
}

const UNIK = { sigap_hari_kerja: [["akun_id", "tanggal"], ["penugasan_id", "tanggal"]], sigap_translok_susulan: [] as string[][] };

function pen(o: Partial<any> = {}): any {
  return {
    id: 50,
    kegiatan: { id: 1, kode: "PSP", nama: "Pendataan Pascabencana", kode_anggaran: null, satuan_realisasi: "ruta", jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 },
    peran: "ppl", label_jabatan: "PPL", tarif: 100000, maks_hari: 25,
    periode: { mulai: mundur(20), selesai: mundur(-20) },
    surat_tugas: null, dikunci_at: null, status_periode: "berjalan", ditutup_pada: null, ...o,
  };
}
function pengajuan(o: Partial<BarisSusulan> = {}): BarisSusulan {
  return { id: 1, kegiatan_id: 1, penugasan_id: 50, akun_id: 1, tanggal: DUA_HARI, alasan: "HP rusak, foto tidak terkirim", status: "diajukan", mode: "tambah", diajukan_at: "2026-11-03T01:00:00Z", keputusan_oleh: null, keputusan_at: null, keputusan_catatan: null, izin_sampai: null, ...o };
}
const aktor = { id: 2, nama: "Widya" };

let t: Tabel;
beforeEach(() => { t = dasarTabel(); admin.clear(); });

describe("pembuatPenyetuju: dua tingkat atasan terdekat", () => {
  it("PPL: PML dan Korwil", async () => {
    const db = buatDb(t);
    const dari = await pembuatPenyetuju(db, 1);
    expect(dari(1).penyetuju).toEqual([2, 3]);
    expect(dari(1).levels).toEqual([[2], [3], [4], [6]]);
  });
  it("tanpa rantai (PPL lain): Supervisor dan PJ", async () => {
    const dari = await pembuatPenyetuju(buatDb(t), 1);
    expect(dari(7).penyetuju).toEqual([4, 6]);
  });
  it("sigap_tim menimpa atasan per kegiatan", async () => {
    t.sigap_tim = [{ kegiatan_id: 1, akun_id: 1, atasan_akun_id: 7 }];
    const dari = await pembuatPenyetuju(buatDb(t), 1);
    expect(dari(1).levels[0]).toEqual([7]);
    expect(dari(1).penyetuju).not.toContain(2); // PML lama tidak lagi atasan kegiatan ini
  });
});

describe("muatFakta dan kandidat", () => {
  it("kasus 4: hari belum pernah dipilih -> bisa diajukan (mode tambah)", async () => {
    const k = await kandidatSusulan(buatDb(t), 1, pen());
    const h = k.find((x) => x.tanggal === DUA_HARI);
    expect(h).toMatchObject({ ok: true, mode: "tambah" });
  });
  it("kasus 1 dan 2: hari kerja ada tetapi tidak lengkap -> mode lengkapi; lengkap -> tidak perlu", async () => {
    t.sigap_hari_kerja = [{ id: 1, penugasan_id: 50, akun_id: 1, tanggal: DUA_HARI, uji_coba_sampai: null }, { id: 2, penugasan_id: 50, akun_id: 1, tanggal: TIGA_HARI, uji_coba_sampai: null }];
    t.sigap_realisasi = [{ penugasan_id: 50, tanggal: TIGA_HARI }];
    t.sigap_dokumentasi = [1, 2, 3, 4, 5].map((n) => ({ penugasan_id: 50, tanggal: TIGA_HARI, slot: n }));
    t.sigap_dokumentasi.push({ penugasan_id: 50, tanggal: DUA_HARI, slot: 1 });
    const k = await kandidatSusulan(buatDb(t), 1, pen());
    expect(k.find((x) => x.tanggal === DUA_HARI)).toMatchObject({ ok: true, mode: "lengkapi" });
    expect(k.find((x) => x.tanggal === TIGA_HARI)?.ok).toBe(false);
  });
  it("tanggal yang sudah menjadi hari kerja di kegiatan lain ditolak", async () => {
    t.sigap_hari_kerja = [{ id: 1, penugasan_id: 99, akun_id: 1, tanggal: DUA_HARI, uji_coba_sampai: null }];
    const f = (await muatFakta(buatDb(t), 1, pen(), [DUA_HARI])).get(DUA_HARI)!;
    expect(f.dipakaiKegiatanLain).toBe(true);
  });
  it("izin aktif dan pengajuan terbuka terbaca; pengajuan itu sendiri bisa diabaikan saat menyetujui", async () => {
    t.sigap_izin_susulan = [{ penugasan_id: 50, tanggal: TIGA_HARI, berlaku_sampai: "2999-01-01T00:00:00Z" }];
    t.sigap_translok_susulan = [pengajuan({ id: 5, tanggal: DUA_HARI })];
    const db = buatDb(t);
    const a = await muatFakta(db, 1, pen(), [DUA_HARI, TIGA_HARI]);
    expect(a.get(TIGA_HARI)!.izinAktif).toBe(true);
    expect(a.get(DUA_HARI)!.pengajuanTerbuka).toBe(true);
    expect((await muatFakta(db, 1, pen(), [DUA_HARI], { abaikanTerbuka: true })).get(DUA_HARI)!.pengajuanTerbuka).toBe(false);
  });
  it("blokir sementara terbaca", async () => {
    t.sigap_translok_blokir = [{ kegiatan_id: 1, akun_id: 1, status: "blokir" }];
    expect((await muatFakta(buatDb(t), 1, pen(), [DUA_HARI])).get(DUA_HARI)!.diblokir).toBe(true);
  });
  it("kuota maks_hari memperhitungkan hari kerja aktif, bukan baris uji coba", async () => {
    t.sigap_hari_kerja = [
      { id: 1, penugasan_id: 50, akun_id: 1, tanggal: mundur(10), uji_coba_sampai: null },
      { id: 2, penugasan_id: 50, akun_id: 1, tanggal: mundur(9), uji_coba_sampai: "2999-01-01T00:00:00Z" },
    ];
    const f = (await muatFakta(buatDb(t), 1, pen(), [DUA_HARI])).get(DUA_HARI)!;
    expect(f.jumlahHariKerjaAktif).toBe(1);
  });
});

describe("setujuiSusulan", () => {
  it("mode tambah: membuat hari kerja + riwayat + izin 24 jam, dan pengajuan menjadi disetujui", async () => {
    t.sigap_translok_susulan = [pengajuan()];
    const db = buatDb(t, UNIK);
    const sebelum = Date.now();
    const h = await setujuiSusulan(db, pengajuan(), aktor, "silakan", pen());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.mode).toBe("tambah");
    expect(t.sigap_hari_kerja).toHaveLength(1);
    expect(t.sigap_hari_kerja[0]).toMatchObject({ penugasan_id: 50, akun_id: 1, tanggal: DUA_HARI });
    expect(t.sigap_hari_kerja_riwayat[0]).toMatchObject({ aksi: "tambah", tanggal: DUA_HARI });
    expect(t.sigap_izin_susulan).toHaveLength(1);
    expect(t.sigap_izin_susulan[0]).toMatchObject({ penugasan_id: 50, kegiatan_id: 1, tanggal: DUA_HARI });
    const lama = new Date(t.sigap_izin_susulan[0].berlaku_sampai).getTime() - sebelum;
    expect(lama).toBeGreaterThanOrEqual(JENDELA_SUSULAN_JAM * 3_600_000 - 1000);
    expect(lama).toBeLessThanOrEqual(JENDELA_SUSULAN_JAM * 3_600_000 + 5000);
    expect(t.sigap_translok_susulan[0]).toMatchObject({ status: "disetujui", mode: "tambah", keputusan_oleh: "Widya", keputusan_akun_id: 2, keputusan_catatan: "silakan" });
    expect(t.sigap_translok_susulan[0].izin_sampai).toBe(t.sigap_izin_susulan[0].berlaku_sampai);
  });

  it("mode lengkapi: hari kerja yang ada tidak digandakan; hanya izin dibuat", async () => {
    t.sigap_hari_kerja = [{ id: 1, penugasan_id: 50, akun_id: 1, tanggal: DUA_HARI, uji_coba_sampai: null }];
    t.sigap_translok_susulan = [pengajuan({ mode: "lengkapi" })];
    const h = await setujuiSusulan(buatDb(t, UNIK), pengajuan({ mode: "lengkapi" }), aktor, "", pen());
    expect(h.ok && h.mode).toBe("lengkapi");
    expect(t.sigap_hari_kerja).toHaveLength(1);
    expect(t.sigap_izin_susulan).toHaveLength(1);
    expect(t.sigap_translok_susulan[0].keputusan_catatan).toBeNull();
  });

  it("gagal membuat hari kerja (bentrok unik): pengajuan kembali diajukan, tidak ada izin", async () => {
    t.sigap_translok_susulan = [pengajuan()];
    // hari kerja akun yang sama sudah ada di kegiatan lain TETAPI tak terlihat saat validasi (balapan): disimulasikan lewat kegagalan insert
    const db = buatDb(t, UNIK, (k) => k === "sigap_hari_kerja:insert");
    const h = await setujuiSusulan(db, pengajuan(), aktor, "", pen());
    expect(h.ok).toBe(false);
    expect(t.sigap_translok_susulan[0]).toMatchObject({ status: "diajukan", mode: null, keputusan_oleh: null, izin_sampai: null });
    expect(t.sigap_izin_susulan).toHaveLength(0);
    expect(t.sigap_hari_kerja).toHaveLength(0);
  });

  it("gagal membuat izin: hari kerja yang baru dibuat dihapus lagi dan pengajuan kembali diajukan", async () => {
    t.sigap_translok_susulan = [pengajuan()];
    const db = buatDb(t, UNIK, (k) => k === "sigap_izin_susulan:insert");
    const h = await setujuiSusulan(db, pengajuan(), aktor, "", pen());
    expect(h.ok).toBe(false);
    expect(t.sigap_hari_kerja).toHaveLength(0);
    expect(t.sigap_translok_susulan[0].status).toBe("diajukan");
  });

  it("gagal membuat izin pada mode lengkapi: hari kerja lama TIDAK dihapus", async () => {
    t.sigap_hari_kerja = [{ id: 1, penugasan_id: 50, akun_id: 1, tanggal: DUA_HARI, uji_coba_sampai: null }];
    t.sigap_translok_susulan = [pengajuan({ mode: "lengkapi" })];
    const h = await setujuiSusulan(buatDb(t, UNIK, (k) => k === "sigap_izin_susulan:insert"), pengajuan({ mode: "lengkapi" }), aktor, "", pen());
    expect(h.ok).toBe(false);
    expect(t.sigap_hari_kerja).toHaveLength(1);
  });

  it("persetujuan kedua pada pengajuan yang sama ditolak (409) dan tidak membuat izin ganda", async () => {
    t.sigap_translok_susulan = [pengajuan()];
    const db = buatDb(t, UNIK);
    expect((await setujuiSusulan(db, pengajuan(), aktor, "", pen())).ok).toBe(true);
    const kedua = await setujuiSusulan(db, pengajuan(), { id: 3, nama: "Deswaty" }, "", pen());
    expect(kedua.ok).toBe(false);
    expect(t.sigap_izin_susulan).toHaveLength(1);
    expect(t.sigap_hari_kerja).toHaveLength(1);
  });

  it("validasi ulang saat menyetujui: SPJ dikunci / arsip / kuota penuh -> ditolak tanpa mengubah apa pun", async () => {
    t.sigap_translok_susulan = [pengajuan()];
    const db = buatDb(t, UNIK);
    for (const p of [pen({ dikunci_at: "2026-11-03T00:00:00Z" }), pen({ status_periode: "arsip" })]) {
      const h = await setujuiSusulan(db, pengajuan(), aktor, "", p);
      expect(h.ok).toBe(false);
    }
    t.sigap_hari_kerja = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, penugasan_id: 50, akun_id: 1, tanggal: `2026-09-${String(i + 1).padStart(2, "0")}`, uji_coba_sampai: null }));
    const penuh = await setujuiSusulan(db, pengajuan(), aktor, "", pen({ maks_hari: 25 }));
    expect(penuh.ok).toBe(false);
    expect(t.sigap_translok_susulan[0].status).toBe("diajukan");
    expect(t.sigap_izin_susulan).toHaveLength(0);
  });
});

describe("susulanMasuk: siapa melihat pengajuan siapa", () => {
  beforeEach(() => { t.sigap_translok_susulan = [pengajuan({ id: 1, akun_id: 1 }), pengajuan({ id: 2, akun_id: 7, penugasan_id: 57, diajukan_at: "2026-11-03T02:00:00Z" })]; });

  it("PML dan Korwil melihat pengajuan PPL mereka, bukan PPL lain", async () => {
    const db = buatDb(t);
    expect((await susulanMasuk(db, 2, 1)).map((x) => x.id)).toEqual([1]);
    expect((await susulanMasuk(db, 3, 1)).map((x) => x.id)).toEqual([1]);
  });
  it("Supervisor dan PJ hanya melihat yang tingkat 1-2 nya kosong (PPL tanpa rantai), bukan PPL yang punya PML dan Korwil", async () => {
    const db = buatDb(t);
    expect((await susulanMasuk(db, 4, 1)).map((x) => x.id)).toEqual([2]);
    expect((await susulanMasuk(db, 6, 1)).map((x) => x.id)).toEqual([2]);
  });
  it("admin translok melihat semuanya; pengaju tidak melihat miliknya sendiri; nama dan peran terisi", async () => {
    admin.add(9);
    const semua = await susulanMasuk(buatDb(t), 9, 1);
    expect(semua.map((x) => x.id)).toEqual([1, 2]);
    expect(semua[0]).toMatchObject({ nama: "Jahar Nas", peran: "ppl" });
    expect(await susulanMasuk(buatDb(t), 1, 1)).toEqual([]);
  });
  it("yang sudah diputuskan tidak muncul", async () => {
    t.sigap_translok_susulan[0].status = "disetujui";
    expect((await susulanMasuk(buatDb(t), 2, 1)).map((x) => x.id)).toEqual([]);
  });
  it("tabel belum ada (galat kueri): kosong, tidak melempar", async () => {
    const db = buatDb(t, {}, (k) => k.startsWith("sigap_translok_susulan"));
    expect(await susulanMasuk(db, 2, 1)).toEqual([]);
  });
});
