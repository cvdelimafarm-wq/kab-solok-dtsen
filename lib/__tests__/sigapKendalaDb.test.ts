// (3 Nov 2026) Kendala pelatihan: petugas menolak / mundur -> ganti, kosong, alihkan, urungkan; papan dan calon pengganti.
import { describe, expect, it } from "vitest";
import { PESAN_SQL, cariKandidat, muatPapan, terapkanKendala, urungkanKendala } from "../sigapKendalaDb";

type Baris = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tabel = Record<string, Baris[]>;

/** Basis data tiruan di memori: select/insert/update/upsert/delete dengan eq, neq, is, in, or(sumber), ilike, order, limit. Tabel yang tidak ada -> galat. */
function dbTiruan(awal: Tabel, gagal: (t: string, op: string) => boolean = () => false) {
  const tabel: Tabel = JSON.parse(JSON.stringify(awal));
  const urut: Record<string, number> = {};
  const db = {
    from(t: string) {
      const filter: ((r: Baris) => boolean)[] = [];
      let op = "select";
      let isi: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      let konflik: string[] = [];
      let tampilkan = false;
      let batas = Infinity;
      let urutan: { k: string; naik: boolean } | null = null;
      const q: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      const jalan = () => {
        if (!tabel[t]) return { data: null, error: { message: "tabel tidak ada" } };
        if (gagal(t, op)) return { data: null, error: { message: "gagal paksa" } };
        const cocok = tabel[t].filter((r) => filter.every((f) => f(r)));
        if (op === "insert") {
          const baru = (Array.isArray(isi) ? isi : [isi]).map((v: Baris) => ({ id: v.id ?? (urut[t] = (urut[t] ?? 1000) + 1), ...v }));
          tabel[t].push(...baru);
          return { data: baru, error: null };
        }
        if (op === "upsert") {
          const v = isi as Baris;
          const ada = tabel[t].find((r) => konflik.every((k) => r[k] === v[k]));
          if (ada) Object.assign(ada, v);
          else tabel[t].push({ ...v });
          return { data: [ada ?? v], error: null };
        }
        if (op === "update") {
          for (const r of cocok) Object.assign(r, isi);
          return { data: cocok, error: null };
        }
        if (op === "delete") {
          tabel[t] = tabel[t].filter((r) => !cocok.includes(r));
          return { data: cocok, error: null };
        }
        let hasil = [...cocok];
        if (urutan) {
          const { k, naik } = urutan;
          hasil.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (naik ? 1 : -1));
        }
        hasil = hasil.slice(0, batas);
        return { data: hasil, error: null };
      };
      q.select = () => ((tampilkan = true), q);
      q.insert = (v: unknown) => ((op = "insert"), (isi = v), q);
      q.update = (v: unknown) => ((op = "update"), (isi = v), q);
      q.delete = () => ((op = "delete"), q);
      q.upsert = (v: unknown, o?: { onConflict?: string }) => ((op = "upsert"), (isi = v), (konflik = (o?.onConflict ?? "id").split(",")), q);
      q.eq = (k: string, v: unknown) => (filter.push((r) => r[k] === v), q);
      q.neq = (k: string, v: unknown) => (filter.push((r) => r[k] !== v), q);
      q.is = (k: string, v: unknown) => (filter.push((r) => (r[k] ?? null) === v), q);
      q.in = (k: string, v: unknown[]) => (filter.push((r) => v.includes(r[k])), q);
      q.ilike = (k: string, p: string) => {
        const x = p.replace(/%/g, "").toLowerCase();
        filter.push((r) => String(r[k] ?? "").toLowerCase().includes(x));
        return q;
      };
      q.or = (s: string) => {
        // hanya bentuk "sumber.is.null,sumber.neq.X"
        const bagian = s.split(",").map((b) => b.split("."));
        filter.push((r) => bagian.some(([k, o, v]) => (o === "is" ? (r[k] ?? null) === null : r[k] !== v)));
        return q;
      };
      q.order = (k: string, o?: { ascending?: boolean }) => ((urutan = { k, naik: o?.ascending !== false }), q);
      q.limit = (n: number) => ((batas = n), q);
      q.maybeSingle = async () => {
        const r = jalan();
        return { data: r.error ? null : ((r.data as Baris[])[0] ?? null), error: r.error };
      };
      q.single = async () => {
        const r = jalan();
        return { data: r.error ? null : ((r.data as Baris[])[0] ?? null), error: r.error };
      };
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        void tampilkan;
        return Promise.resolve(jalan()).then(res, rej);
      };
      return q;
    },
  };
  return { db, tabel };
}

const K = 7;
const akun = (id: number, nama: string, kec = "Koto Parik", jenis = "mitra") => ({ id, nama, jenis, aktif: true, alamat_kecamatan: kec });
const pen = (id: number, akun_id: number, peran: string, extra: Baris = {}) => ({ id, kegiatan_id: K, akun_id, peran, kelas: 2, aktif: true, sumber: "st", maks_hari: 5, ...extra });
const hier = (akun_id: number, atasan: number | null, peran = "ppl") => ({ kegiatan_id: K, akun_id, peran_pelatihan: peran, atasan_akun_id: atasan, sumber: "salin_psp" });

function dasar(): Tabel {
  return {
    sigap_akun: [akun(1, "Pml Satu"), akun(2, "Ppl Dua"), akun(3, "Ppl Tiga"), akun(4, "Pml Empat", "Lubuk"), akun(5, "Calon Lima"), akun(6, "Calon Enam", "Lubuk"), akun(9, "Admin", "x", "organik")],
    sigap_penugasan: [pen(11, 1, "pml"), pen(12, 2, "ppl"), pen(13, 3, "ppl"), pen(14, 4, "pml")],
    sigap_pelatihan_hierarki: [hier(2, 1), hier(3, 1)],
    sigap_pelatihan_kendala: [],
    sigap_pelatihan_undangan_respons: [],
    sigap_mitra_pool: [],
  };
}

describe("terapkanKendala: ganti", () => {
  it("PML diganti calon baru: bawahan pindah, penugasan baru mewarisi peran dan kelas, petugas lama nonaktif", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const h = await terapkanKendala(db, K, 99, { akun_id: 1, keputusan: "ganti", pengganti_akun_id: 5, catatan: "sakit" });
    expect(h.ok).toBe(true);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 1)?.aktif).toBe(false);
    const baru = tabel.sigap_penugasan.find((p) => p.akun_id === 5)!;
    expect(baru).toMatchObject({ kegiatan_id: K, peran: "pml", kelas: 2, aktif: true, maks_hari: 5, sumber: "kendala:99" });
    expect(tabel.sigap_pelatihan_hierarki.filter((x) => x.atasan_akun_id === 5).map((x) => x.akun_id).sort()).toEqual([2, 3]);
    expect(tabel.sigap_pelatihan_hierarki.some((x) => x.atasan_akun_id === 1)).toBe(false);
    expect(tabel.sigap_pelatihan_kendala).toHaveLength(1);
    expect(tabel.sigap_pelatihan_kendala[0]).toMatchObject({ akun_id: 1, keputusan: "ganti", pengganti_akun_id: 5, catatan: "sakit", oleh: 99, peran: "pml" });
  });

  it("PPL diganti: calon mewarisi atasan lewat baris hierarki baru, baris petugas lama dihapus", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const h = await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 });
    expect(h.ok).toBe(true);
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 5)).toMatchObject({ atasan_akun_id: 1, peran_pelatihan: "ppl", sumber: "manual" });
    expect(tabel.sigap_pelatihan_hierarki.some((x) => x.akun_id === 2)).toBe(false);
  });

  it("calon yang pernah punya penugasan nonaktif diaktifkan kembali (tidak membuat baris ganda)", async () => {
    const t = dasar();
    t.sigap_penugasan.push(pen(15, 5, "ppl", { aktif: false, kelas: 4, sumber: "lama" }));
    const { db, tabel } = dbTiruan(t);
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 })).ok).toBe(true);
    const baris = tabel.sigap_penugasan.filter((p) => p.akun_id === 5);
    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ aktif: true, peran: "ppl", kelas: 2 });
  });

  it("menolak: calon sudah petugas aktif, calon menolak undangan, calon diri sendiri, tanpa calon", async () => {
    const t = dasar();
    t.sigap_pelatihan_undangan_respons.push({ kegiatan_id: K, akun_id: 6, respons: "tolak", alasan: null });
    const { db, tabel } = dbTiruan(t);
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 3 })).ok).toBe(false);
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 6 })).ok).toBe(false);
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 2 })).ok).toBe(false);
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti" })).ok).toBe(false);
    expect(tabel.sigap_pelatihan_kendala).toHaveLength(0);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 2)?.aktif).toBe(true);
  });

  it("langkah di tengah gagal -> keadaan dikembalikan dan catatan dihapus", async () => {
    const { db, tabel } = dbTiruan(dasar(), (t, op) => t === "sigap_pelatihan_hierarki" && op === "update");
    const h = await terapkanKendala(db, K, 99, { akun_id: 1, keputusan: "ganti", pengganti_akun_id: 5 });
    expect(h.ok).toBe(false);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 1)?.aktif).toBe(true);
    expect(tabel.sigap_penugasan.some((p) => p.akun_id === 5)).toBe(false);
    expect(tabel.sigap_pelatihan_kendala).toHaveLength(0);
  });
});

describe("terapkanKendala: alihkan", () => {
  it("seluruh bawahan pindah ke satu petugas seperan; beban ganda dilaporkan", async () => {
    const t = dasar();
    t.sigap_pelatihan_hierarki = [hier(2, 1), hier(3, 1), hier(12, 4)]; // Pml Empat sudah punya 1 bawahan
    const { db, tabel } = dbTiruan(t);
    const h = await terapkanKendala(db, K, 99, { akun_id: 1, keputusan: "alihkan", pengganti_akun_id: 4 });
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.beban).toEqual({ nama: "Pml Empat", sebelum: 1, sesudah: 3 });
    expect(tabel.sigap_pelatihan_hierarki.filter((x) => x.atasan_akun_id === 4).map((x) => x.akun_id).sort((a, b) => a - b)).toEqual([2, 3, 12]);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 1)?.aktif).toBe(false);
    expect(tabel.sigap_penugasan.filter((p) => p.akun_id === 4)).toHaveLength(1); // tidak ada penugasan baru
  });

  it("hanya ke petugas aktif seperan", async () => {
    const { db } = dbTiruan(dasar());
    const lain = await terapkanKendala(db, K, 99, { akun_id: 1, keputusan: "alihkan", pengganti_akun_id: 2 }); // PPL, bukan PML
    expect(lain.ok).toBe(false);
    const bukanPetugas = await terapkanKendala(db, K, 99, { akun_id: 1, keputusan: "alihkan", pengganti_akun_id: 5 });
    expect(bukanPetugas.ok).toBe(false);
  });
});

describe("terapkanKendala: kosong dan penyelesaiannya", () => {
  it("kosong menonaktifkan, mencatat, dan tidak boleh diulang; keputusan ganti kemudian menandai kosong selesai", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const a = await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "kosong" });
    expect(a.ok).toBe(true);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 2)?.aktif).toBe(false);
    expect(tabel.sigap_pelatihan_hierarki.some((x) => x.akun_id === 2)).toBe(true); // hierarki tidak disentuh
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "kosong" })).ok).toBe(false);
    const b = await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 });
    expect(b.ok).toBe(true);
    const [k1, k2] = tabel.sigap_pelatihan_kendala;
    expect(k1.keputusan).toBe("kosong");
    expect(k1.selesai_at).toBeTruthy();
    expect(k2.keputusan).toBe("ganti");
    expect(k2.selesai_at ?? null).toBeNull();
  });

  it("petugas yang sudah punya keputusan ganti/alihkan tidak bisa diputus lagi sebelum diurungkan", async () => {
    const { db } = dbTiruan(dasar());
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 })).ok).toBe(true);
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "kosong" })).ok).toBe(false);
  });
});

describe("terapkanKendala: syarat umum", () => {
  it("tabel belum ada -> petunjuk SQL, tidak ada yang diubah", async () => {
    const t = dasar();
    delete t.sigap_pelatihan_kendala;
    const { db, tabel } = dbTiruan(t);
    const h = await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "kosong" });
    expect(h).toEqual({ ok: false, pesan: PESAN_SQL });
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 2)?.aktif).toBe(true);
  });
  it("bukan petugas pelatihan ini / peserta administrasi / keputusan tak dikenal", async () => {
    const t = dasar();
    t.sigap_penugasan.push(pen(16, 6, "ppl", { sumber: "administrasi" }));
    const { db } = dbTiruan(t);
    expect((await terapkanKendala(db, K, 99, { akun_id: 5, keputusan: "kosong" })).ok).toBe(false);
    expect((await terapkanKendala(db, K, 99, { akun_id: 6, keputusan: "kosong" })).ok).toBe(false);
    // @ts-expect-error nilai di luar daftar
    expect((await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "hapus" })).ok).toBe(false);
  });
});

describe("urungkanKendala", () => {
  it("ganti diurungkan: petugas lama aktif, hierarki lama dan bawahan kembali, calon baru dihapus", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const awal = JSON.parse(JSON.stringify({ pen: tabel.sigap_penugasan, hi: tabel.sigap_pelatihan_hierarki }));
    const h = await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 });
    expect(h.ok).toBe(true);
    const id = h.ok ? h.id : 0;
    const u = await urungkanKendala(db, K, id, 99);
    expect(u.ok).toBe(true);
    const norm = (a: Baris[], k: string) => [...a].sort((x, y) => x[k] - y[k]);
    expect(norm(tabel.sigap_penugasan, "id")).toEqual(norm(awal.pen, "id"));
    expect(norm(tabel.sigap_pelatihan_hierarki, "akun_id").map((x) => [x.akun_id, x.atasan_akun_id])).toEqual(norm(awal.hi, "akun_id").map((x) => [x.akun_id, x.atasan_akun_id]));
    expect(tabel.sigap_pelatihan_kendala[0].dibatalkan_at).toBeTruthy();
    expect((await urungkanKendala(db, K, id, 99)).ok).toBe(false); // tidak dua kali
  });

  it("alihkan diurungkan: bawahan kembali ke petugas lama", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const h = await terapkanKendala(db, K, 99, { akun_id: 1, keputusan: "alihkan", pengganti_akun_id: 4 });
    expect(h.ok).toBe(true);
    expect((await urungkanKendala(db, K, h.ok ? h.id : 0, 99)).ok).toBe(true);
    expect(tabel.sigap_pelatihan_hierarki.filter((x) => x.atasan_akun_id === 1).map((x) => x.akun_id).sort()).toEqual([2, 3]);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 1)?.aktif).toBe(true);
  });

  it("keputusan yang sudah digantikan tidak bisa diurungkan; id asing ditolak", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const a = await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "kosong" });
    await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 });
    expect((await urungkanKendala(db, K, a.ok ? a.id : 0, 99)).ok).toBe(false);
    expect((await urungkanKendala(db, K, 424242, 99)).ok).toBe(false);
    expect((await urungkanKendala(db, K + 1, tabel.sigap_pelatihan_kendala[1].id, 99)).ok).toBe(false);
  });
});

describe("muatPapan", () => {
  it("penolak nonaktif masuk 'perlu'; yang sudah diganti keluar; riwayat memberi tanda bisa_urung", async () => {
    const t = dasar();
    t.sigap_penugasan[1].aktif = false; // akun 2 menolak
    t.sigap_penugasan[2].aktif = false; // akun 3 menolak
    t.sigap_pelatihan_undangan_respons.push({ kegiatan_id: K, akun_id: 2, respons: "tolak", alasan: "sakit", dijawab_at: "2026-11-03T01:00:00Z" }, { kegiatan_id: K, akun_id: 3, respons: "tolak", alasan: null, dijawab_at: "2026-11-03T02:00:00Z" });
    const { db } = dbTiruan(t);
    let p = await muatPapan(db, K);
    expect(p.tersedia).toBe(true);
    expect(p.perlu.map((x) => x.akun_id).sort()).toEqual([2, 3]);
    expect(p.perlu.find((x) => x.akun_id === 2)).toMatchObject({ status: "menolak", alasan: "sakit", peran: "ppl" });
    expect(p.petugas.map((x) => x.akun_id).sort()).toEqual([1, 4]);
    expect(p.petugas.find((x) => x.akun_id === 1)?.bawahan).toBe(2);

    await terapkanKendala(db, K, 99, { akun_id: 2, keputusan: "ganti", pengganti_akun_id: 5 });
    await terapkanKendala(db, K, 99, { akun_id: 3, keputusan: "kosong" });
    p = await muatPapan(db, K);
    expect(p.perlu.map((x) => [x.akun_id, x.status])).toEqual([[3, "kosong"]]);
    expect(p.riwayat).toHaveLength(2);
    expect(p.riwayat.every((r) => r.bisa_urung)).toBe(true);
    expect(p.riwayat[0].oleh_nama).toBe("Akun 99");
  });

  it("tabel kendala belum ada -> tersedia=false tetapi petugas tetap dimuat", async () => {
    const t = dasar();
    delete t.sigap_pelatihan_kendala;
    const { db } = dbTiruan(t);
    const p = await muatPapan(db, K);
    expect(p.tersedia).toBe(false);
    expect(p.petugas.length).toBe(4);
    expect(p.riwayat).toEqual([]);
  });
});

describe("cariKandidat", () => {
  it("tanpa kata: saran satu kecamatan dengan petugas lama; yang sudah bertugas dan penolak tidak ditampilkan", async () => {
    const t = dasar();
    t.sigap_akun.push(akun(7, "Calon Tujuh"), akun(8, "Calon Delapan"));
    t.sigap_pelatihan_undangan_respons.push({ kegiatan_id: K, akun_id: 7, respons: "tolak" });
    t.sigap_penugasan.push(pen(17, 8, "ppl"));
    const { db } = dbTiruan(t);
    const r = await cariKandidat(db, K, "", "Koto Parik");
    expect(r.map((x) => x.nama)).toEqual(["Calon Lima", "Calon Enam"]); // satu kecamatan lebih dulu, lalu pelengkap
    expect(r.map((x) => x.sewilayah)).toEqual([true, false]);
  });

  it("dengan kata: hasil pencarian, satu kecamatan lebih dulu; 1 huruf = kosong", async () => {
    const { db } = dbTiruan(dasar());
    const r = await cariKandidat(db, K, "calon", "Koto Parik");
    expect(r.map((x) => x.nama)).toEqual(["Calon Lima", "Calon Enam"]);
    expect(r.map((x) => x.sewilayah)).toEqual([true, false]);
    expect(await cariKandidat(db, K, "c", "Koto Parik")).toEqual([]);
  });

  it("pool tahun ini disaring bila ada isinya; akun organik tidak jadi calon", async () => {
    const t = dasar();
    t.sigap_mitra_pool.push({ akun_id: 6, tahun: new Date().getFullYear(), status: "aktif" });
    const { db } = dbTiruan(t);
    const r = await cariKandidat(db, K, "", "Koto Parik");
    expect(r.map((x) => x.nama)).toEqual(["Calon Enam"]); // hanya yang ada di pool
    expect(r.some((x) => x.nama === "Admin")).toBe(false);
  });
});
