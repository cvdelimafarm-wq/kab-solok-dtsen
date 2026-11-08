import { describe, expect, it, vi } from "vitest";
import { lepasAdministrasiAkun, tambahPesertaAdministrasi } from "@/lib/sigapAdministrasiDaftar";
import {
  aturJumlahKelas,
  bagiRataPeserta,
  cabutPanitia,
  cariAkunLibat,
  gabungKelas,
  hapusKelas,
  keluarkanPeserta,
  libatkanPeserta,
  kelasEfektif,
  labelKelasNama,
  masukkanBelumBerkelas,
  muatKelasKegiatan,
  muatPanitia,
  muatPesertaKelas,
  nomorPilihanKuis,
  periksaKuota,
  periksaNamaKelas,
  pindahkanPesertaKelas,
  tambahKelas,
  tambahPanitia,
  ubahKelas,
  ukuranBagiRata,
} from "@/lib/sigapKelasKegiatan";

// tanggal pelatihan dari basis data sungguhan tidak relevan di sini
vi.mock("@/lib/sigapTesDb", () => ({ SUMBER_ADMINISTRASI: "administrasi", undanganUntuk: async () => ({ tanggal_iso: "2026-11-10" }) }));

type Baris = Record<string, unknown>;

/** Basis data tiruan: tabel = larik baris; pembangun kueri berantai cukup untuk fungsi di sigapKelasKegiatan. */
function dbTiruan(awal: Record<string, Baris[]>) {
  const t: Record<string, Baris[]> = Object.fromEntries(Object.entries(awal).map(([k, v]) => [k, v.map((b) => ({ ...b }))]));
  const db = {
    from(nama: string) {
      if (!t[nama]) t[nama] = [];
      const filters: ((b: Baris) => boolean)[] = [];
      let aksi: "select" | "update" | "delete" = "select";
      let patch: Baris = {};
      let hitung = false;
      let kepala = false;
      let batas = Infinity;
      let urutKolom: string | null = null;
      const jalankan = () => {
        const cocok = t[nama].filter((b) => filters.every((f) => f(b)));
        if (aksi === "update") {
          cocok.forEach((b) => Object.assign(b, patch));
          return { data: null, error: null };
        }
        if (aksi === "delete") {
          t[nama] = t[nama].filter((b) => !cocok.includes(b));
          return { data: null, error: null };
        }
        let hasil = [...cocok];
        if (urutKolom) hasil.sort((a, b) => Number(a[urutKolom!]) - Number(b[urutKolom!]));
        hasil = hasil.slice(0, batas);
        return { data: kepala ? null : hasil, error: null, count: hitung ? cocok.length : null };
      };
      const q: Record<string, unknown> = {
        select(_k?: string, opsi?: { count?: string; head?: boolean }) {
          hitung = !!opsi?.count;
          kepala = !!opsi?.head;
          return q;
        },
        eq(k: string, v: unknown) { filters.push((b) => b[k] === v); return q; },
        ilike(k: string, pola: string) { const kata = pola.replace(/%/g, "").toLowerCase(); filters.push((b) => String(b[k] ?? "").toLowerCase().includes(kata)); return q; },
        neq(k: string, v: unknown) { filters.push((b) => b[k] !== v); return q; },
        in(k: string, v: unknown[]) { filters.push((b) => v.includes(b[k])); return q; },
        not(k: string, op: string, v: unknown) {
          if (op === "is" && v === null) filters.push((b) => b[k] != null);
          if (op === "in" && typeof v === "string") {
            const daftar = v.replace(/[()]/g, "").split(",");
            filters.push((b) => !daftar.includes(String(b[k])));
          }
          return q;
        },
        or(teks: string) {
          const bagian = teks.split(",").map((s) => s.split("."));
          filters.push((b) => bagian.some(([k, op, v]) => (op === "is" ? b[k] == null : b[k] === Number(v))));
          return q;
        },
        order(k: string) { urutKolom = k; return q; },
        limit(n: number) { batas = n; return q; },
        maybeSingle: async () => ({ data: jalankan().data?.[0] ?? null, error: null }),
        update(p: Baris) { aksi = "update"; patch = p; return q; },
        delete() { aksi = "delete"; return q; },
        insert: (b: Baris | Baris[]) => {
          const baris = Array.isArray(b) ? b : [b];
          let error: { message: string } | null = null;
          let terakhir: Baris | null = null;
          for (const x of baris) {
            if (nama === "sigap_pelatihan_kelas" && t[nama].some((y) => y.kegiatan_id === x.kegiatan_id && y.nomor === x.nomor)) {
              error = { message: "dup" };
              break;
            }
            const baru = { ...x };
            if (nama === "sigap_penugasan" && baru.id === undefined) baru.id = Math.max(0, ...t[nama].map((y) => Number(y.id) || 0)) + 1;
            t[nama].push(baru);
            terakhir = baru;
          }
          const hasil = Promise.resolve({ error }) as Promise<{ error: { message: string } | null }> & { select: () => { single: () => Promise<{ data: Baris | null; error: { message: string } | null }> } };
          hasil.select = () => ({ single: async () => ({ data: error ? null : terakhir, error }) });
          return hasil;
        },
        upsert: async (b: Baris | Baris[], opsi?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          const baris = Array.isArray(b) ? b : [b];
          const kunci = (opsi?.onConflict ?? "").split(",");
          for (const x of baris) {
            const ada = t[nama].find((y) => kunci.every((k) => y[k] === x[k]));
            if (ada) { if (!opsi?.ignoreDuplicates) Object.assign(ada, x); } else t[nama].push({ ...x });
          }
          return { error: null };
        },
        then(ok: (v: unknown) => unknown, tolak?: (e: unknown) => unknown) { return Promise.resolve(jalankan()).then(ok, tolak); },
      };
      return q;
    },
  };
  return { db: db as never, t };
}

const peserta = (id: number, kelas: number | null, extra: Baris = {}) => ({ id, kegiatan_id: 7, akun_id: 100 + id, peran: "ppl", kelas, aktif: true, sumber: null, ...extra });
const akun = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 101 + i, nama: `Petugas ${String(i + 1).padStart(2, "0")}`, aktif: true }));

describe("fungsi murni kelas pelatihan", () => {
  it("gabungKelas: tabel kosong -> Kelas 1; kelas terpakai di luar tabel ikut tampil; tanpa kembar dan berurutan", () => {
    expect(gabungKelas([], [])).toEqual([{ nomor: 1, nama: "Kelas 1", kuota: null }]);
    expect(gabungKelas([{ nomor: 2, nama: "Kelas B", kuota: 20 }], [3, 2, 3, 0, 99]).map((k) => [k.nomor, k.nama, k.kuota])).toEqual([[2, "Kelas B", 20], [3, "Kelas 3", null]]);
  });

  it("kelasEfektif: satu kelas -> peserta tanpa kelas masuk kelas itu; banyak kelas -> null", () => {
    const satu = gabungKelas([{ nomor: 1, nama: "Kelas 1", kuota: null }], []);
    const dua = gabungKelas([{ nomor: 1, nama: "A", kuota: null }, { nomor: 2, nama: "B", kuota: null }], []);
    expect(kelasEfektif(null, satu)).toBe(1);
    expect(kelasEfektif(5, satu)).toBe(1);
    expect(kelasEfektif(null, dua)).toBeNull();
    expect(kelasEfektif(2, dua)).toBe(2);
    expect(kelasEfektif(9, dua)).toBeNull();
  });

  it("nomorPilihanKuis: Semua Kelas (0) hanya bila kelas > 1", () => {
    const dua = gabungKelas([{ nomor: 1, nama: "A", kuota: null }, { nomor: 2, nama: "B", kuota: null }], []);
    expect(nomorPilihanKuis(dua)).toEqual([0, 1, 2]);
    expect(nomorPilihanKuis(gabungKelas([], []))).toEqual([1]);
  });

  it("labelKelasNama memakai nama kelas pelatihan", () => {
    const d = gabungKelas([{ nomor: 1, nama: "Kelas Pagi", kuota: null }], []);
    expect(labelKelasNama(1, d)).toBe("Kelas Pagi");
    expect(labelKelasNama(0, d)).toBe("Semua Kelas");
    expect(labelKelasNama(4, d)).toBe("Kelas 4");
    expect(labelKelasNama(null, d)).toBe("?");
  });

  it("ukuranBagiRata selisih paling banyak 1 dan jumlahnya tetap", () => {
    expect(ukuranBagiRata(94, 4)).toEqual([24, 24, 23, 23]);
    expect(ukuranBagiRata(3, 5)).toEqual([1, 1, 1, 0, 0]);
    expect(ukuranBagiRata(0, 3)).toEqual([0, 0, 0]);
    expect(ukuranBagiRata(5, 0)).toEqual([]);
  });

  it("periksa nama dan kuota", () => {
    expect(periksaNamaKelas("  Kelas   Pagi ")).toEqual({ ok: true, nama: "Kelas Pagi" });
    expect(periksaNamaKelas("   ").ok).toBe(false);
    expect(periksaNamaKelas("x".repeat(61)).ok).toBe(false);
    expect(periksaKuota("")).toEqual({ ok: true, kuota: null });
    expect(periksaKuota(null)).toEqual({ ok: true, kuota: null });
    expect(periksaKuota("25")).toEqual({ ok: true, kuota: 25 });
    expect(periksaKuota(0).ok).toBe(false);
    expect(periksaKuota(501).ok).toBe(false);
    expect(periksaKuota(2.5).ok).toBe(false);
  });
});

describe("muatKelasKegiatan", () => {
  it("memakai tabel kelas, ditambah kelas yang terpakai peserta aktif dan instruktur", async () => {
    const { db } = dbTiruan({
      sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: null }],
      sigap_penugasan: [peserta(1, 1), peserta(2, 3), peserta(3, 4, { aktif: false })],
      sigap_kuis_instruktur_kelas: [{ kegiatan_id: 7, akun_id: 9, kelas: 2 }],
    });
    expect((await muatKelasKegiatan(db, 7)).map((k) => k.nomor)).toEqual([1, 2, 3]);
  });
  it("pelatihan lain tidak ikut", async () => {
    const { db } = dbTiruan({ sigap_pelatihan_kelas: [{ kegiatan_id: 3, nomor: 1, nama: "x", kuota: null }, { kegiatan_id: 3, nomor: 2, nama: "y", kuota: null }] });
    expect((await muatKelasKegiatan(db, 7)).map((k) => k.nomor)).toEqual([1]);
  });
});

describe("mengatur kelas", () => {
  const awal = () => ({
    sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: null }],
    sigap_penugasan: [peserta(1, 1), peserta(2, 1), peserta(3, 1), peserta(4, null)],
    sigap_akun: akun(4),
    sigap_kuis_instruktur_kelas: [],
    sigap_kuis_ruang: [],
    sigap_kuis_kelas: [],
  });

  it("atur jumlah: menambah kelas bernama Kelas N, lalu mengurangi kelas kosong dari nomor terbesar", async () => {
    const { db } = dbTiruan(awal());
    expect(await aturJumlahKelas(db, 7, 3)).toMatchObject({ ok: true, jumlah: 3 });
    expect((await muatKelasKegiatan(db, 7)).map((k) => k.nama)).toEqual(["Kelas 1", "Kelas 2", "Kelas 3"]);
    expect(await aturJumlahKelas(db, 7, 1)).toMatchObject({ ok: true, jumlah: 1 });
  });

  it("atur jumlah ditolak di luar 1..20 dan saat kelas yang akan dibuang masih berisi peserta", async () => {
    const { db } = dbTiruan({ ...awal(), sigap_penugasan: [peserta(1, 1), peserta(2, 2)], sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: null }, { kegiatan_id: 7, nomor: 2, nama: "Kelas 2", kuota: null }] });
    expect((await aturJumlahKelas(db, 7, 0)).ok).toBe(false);
    expect((await aturJumlahKelas(db, 7, 21)).ok).toBe(false);
    const h = await aturJumlahKelas(db, 7, 1);
    expect(h.ok).toBe(false);
    expect(!h.ok && h.pesan).toContain("masih berisi 1 peserta");
    expect((await muatKelasKegiatan(db, 7)).length).toBe(2);
  });

  it("hapus kelas: minimal satu kelas, ditolak bila ada peserta/instruktur/ruang berjalan, berhasil bila kosong", async () => {
    const tabel = {
      ...awal(),
      sigap_penugasan: [peserta(1, 1)],
      sigap_pelatihan_kelas: [1, 2, 3, 4].map((n) => ({ kegiatan_id: 7, nomor: n, nama: `Kelas ${n}`, kuota: null })),
      sigap_kuis_instruktur_kelas: [{ kegiatan_id: 7, akun_id: 9, kelas: 2 }],
      sigap_kuis_ruang: [{ id: 1, kegiatan_id: 7, kelas: 3, status: "lobi" }, { id: 2, kegiatan_id: 7, kelas: 4, status: "selesai" }],
      sigap_kuis_kelas: [{ kegiatan_id: 7, kelas: 4, kuis_id: 5 }],
    };
    const { db, t } = dbTiruan(tabel);
    const peserta1 = await hapusKelas(db, 7, 1);
    expect(!peserta1.ok && peserta1.pesan).toContain("peserta");
    const ins = await hapusKelas(db, 7, 2);
    expect(!ins.ok && ins.pesan).toContain("instruktur");
    const ruang = await hapusKelas(db, 7, 3);
    expect(!ruang.ok && ruang.pesan).toContain("Ruang Adu Sigap");
    expect(await hapusKelas(db, 7, 4)).toEqual({ ok: true });
    expect(t.sigap_pelatihan_kelas.map((k) => k.nomor)).toEqual([1, 2, 3]);
    expect(t.sigap_kuis_kelas).toEqual([]); // pengaturan kuis kelas yang dihapus ikut dibuang

    const satu = dbTiruan(awal());
    const h = await hapusKelas(satu.db, 7, 1);
    expect(!h.ok && h.pesan).toContain("minimal satu kelas");
  });

  it("ubah kelas: nama unik, kuota tidak boleh di bawah isi kelas, kuota kosong = bebas", async () => {
    const tabel = { ...awal(), sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: null }, { kegiatan_id: 7, nomor: 2, nama: "Kelas 2", kuota: null }] };
    const { db, t } = dbTiruan(tabel);
    expect((await ubahKelas(db, 7, 2, "kelas 1", null)).ok).toBe(false); // nama kembar (tak peka huruf)
    const kecil = await ubahKelas(db, 7, 1, "Pagi", 2); // berisi 3 peserta
    expect(!kecil.ok && kecil.pesan).toContain("lebih dari kuota 2");
    expect(await ubahKelas(db, 7, 1, "Pagi", 5)).toEqual({ ok: true });
    expect(t.sigap_pelatihan_kelas.find((k) => k.nomor === 1)).toMatchObject({ nama: "Pagi", kuota: 5 });
    expect(await ubahKelas(db, 7, 1, "Pagi", "")).toEqual({ ok: true });
    expect(t.sigap_pelatihan_kelas.find((k) => k.nomor === 1)?.kuota).toBeNull();
    expect((await ubahKelas(db, 7, 9, "Z", null)).ok).toBe(false); // kelas tidak ada
  });

  it("tambah kelas memakai nomor kosong terkecil dan menolak melebihi 20", async () => {
    const { db } = dbTiruan({ ...awal(), sigap_pelatihan_kelas: [1, 3].map((n) => ({ kegiatan_id: 7, nomor: n, nama: `Kelas ${n}`, kuota: null })) });
    const h = await tambahKelas(db, 7);
    expect(h).toMatchObject({ ok: true, nomor: 2 });
    const penuh = dbTiruan({ ...awal(), sigap_pelatihan_kelas: Array.from({ length: 20 }, (_, i) => ({ kegiatan_id: 7, nomor: i + 1, nama: `Kelas ${i + 1}`, kuota: null })) });
    expect((await tambahKelas(penuh.db, 7)).ok).toBe(false);
  });

  it("tabel kelas belum ada (SQL belum dijalankan): ditolak dengan petunjuk", async () => {
    const rusak = { from: () => ({ select: () => ({ limit: async () => ({ error: { message: "relation does not exist" } }) }) }) } as never;
    const h = await ubahKelas(rusak, 7, 1, "A", null);
    expect(!h.ok && h.pesan).toContain("20261108b_kelas_pelatihan.sql");
  });
});

describe("peserta ke kelas", () => {
  const dua = () => ({
    sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: 2 }, { kegiatan_id: 7, nomor: 2, nama: "Kelas 2", kuota: null }],
    sigap_penugasan: [peserta(1, 1), peserta(2, null), peserta(3, null), peserta(4, 2), peserta(5, 2, { aktif: false })],
    sigap_akun: akun(5),
    sigap_kuis_instruktur_kelas: [],
  });

  it("pindah peserta: hanya peserta aktif pelatihan ini, kelas tujuan harus ada, kuota dijaga", async () => {
    const { db, t } = dbTiruan(dua());
    expect((await pindahkanPesertaKelas(db, 7, [], 2)).ok).toBe(false);
    expect((await pindahkanPesertaKelas(db, 7, [2], 9)).ok).toBe(false); // kelas 9 tidak ada
    expect((await pindahkanPesertaKelas(db, 7, [999], 2)).ok).toBe(false); // bukan peserta
    expect(await pindahkanPesertaKelas(db, 7, [2, 3], 1)).toMatchObject({ ok: false }); // kuota 2, sudah ada 1
    expect(await pindahkanPesertaKelas(db, 7, [2], 1)).toEqual({ ok: true, berubah: 1 });
    expect(t.sigap_penugasan.find((p) => p.id === 2)?.kelas).toBe(1);
    expect(await pindahkanPesertaKelas(db, 7, [2], 1)).toEqual({ ok: true, berubah: 0 }); // sudah di sana
    expect(await pindahkanPesertaKelas(db, 7, [5], 1)).toMatchObject({ ok: false }); // tidak aktif
    expect(await pindahkanPesertaKelas(db, 7, [2], null)).toEqual({ ok: true, berubah: 1 }); // dikeluarkan dari kelas
  });

  it("masukkan semua yang belum berkelas", async () => {
    const { db, t } = dbTiruan(dua());
    expect(await masukkanBelumBerkelas(db, 7, 2)).toEqual({ ok: true, berubah: 2 });
    expect(t.sigap_penugasan.filter((p) => p.aktif).map((p) => p.kelas)).toEqual([1, 2, 2, 2]);
    expect(await masukkanBelumBerkelas(db, 7, 2)).toEqual({ ok: true, berubah: 0 });
  });

  it("bagi rata: potongan berurutan menurut nama, selisih paling banyak 1; ditolak bila melanggar kuota", async () => {
    const tabel = dua();
    tabel.sigap_pelatihan_kelas[0].kuota = null;
    const { db, t } = dbTiruan(tabel);
    expect(await bagiRataPeserta(db, 7)).toMatchObject({ ok: true });
    const per = (k: number) => t.sigap_penugasan.filter((p) => p.aktif && p.kelas === k).length;
    expect([per(1), per(2)]).toEqual([2, 2]);
    const sempit = dbTiruan({ ...dua(), sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: 1 }, { kegiatan_id: 7, nomor: 2, nama: "Kelas 2", kuota: null }] });
    const h = await bagiRataPeserta(sempit.db, 7);
    expect(!h.ok && h.pesan).toContain("kuota");
  });

  it("bagi rata tanpa peserta ditolak", async () => {
    const { db } = dbTiruan({ ...dua(), sigap_penugasan: [] });
    expect((await bagiRataPeserta(db, 7)).ok).toBe(false);
  });
});

describe("muatPanitia", () => {
  it("panitia = pemegang peran dengan menu pelatihan.kelola (lingkup pelatihan ini atau semua), tanpa instruktur, akun nonaktif dilewati", async () => {
    const { db } = dbTiruan({
      sigap_peran_izin: [{ peran_id: 1, menu_kode: "pelatihan.kelola" }, { peran_id: 2, menu_kode: "pelatihan.kelola" }, { peran_id: 3, menu_kode: "pelatihan.kelola" }, { peran_id: 4, menu_kode: "lain" }],
      sigap_peran: [{ id: 1, kode: "panitia_pelatihan", nama: "Panitia Pelatihan" }, { id: 2, kode: "instruktur_pelatihan", nama: "Instruktur" }, { id: 3, kode: "admin_aplikasi", nama: "Admin Aplikasi" }],
      sigap_akun_peran: [
        { akun_id: 10, peran_id: 1, kegiatan_id: 7 },
        { akun_id: 11, peran_id: 1, kegiatan_id: 3 }, // pelatihan lain
        { akun_id: 12, peran_id: 2, kegiatan_id: 7 }, // instruktur
        { akun_id: 13, peran_id: 3, kegiatan_id: null }, // admin global
        { akun_id: 14, peran_id: 1, kegiatan_id: 7 }, // nonaktif
      ],
      sigap_akun: [{ id: 10, nama: "Rina", aktif: true }, { id: 11, nama: "Budi", aktif: true }, { id: 12, nama: "Inda", aktif: true }, { id: 13, nama: "Iqbal", aktif: true }, { id: 14, nama: "Lama", aktif: false }],
    });
    const p = await muatPanitia(db, 7);
    expect(p.map((x) => [x.nama, x.lingkup])).toEqual([["Rina", "kegiatan"], ["Iqbal", "semua"]]);
  });
});

describe("melibatkan orang di pelatihan (panitia, peserta)", () => {
  const dasar = () => ({
    sigap_akun: [
      { id: 1, nama: "Iqbal", aktif: true, jenis: "organik" },
      { id: 478, nama: "Oryza Maria Ulva", aktif: true, jenis: "organik" },
      { id: 9, nama: "Oryza Lama", aktif: false, jenis: "organik" },
      { id: 20, nama: "Rina Mitra", aktif: true, jenis: "mitra" },
    ],
    sigap_peran: [{ id: 11, kode: "panitia_pelatihan" }, { id: 12, kode: "pengelola_psp" }],
    sigap_peran_izin: [{ peran_id: 11, menu_kode: "pelatihan.kelola" }, { peran_id: 11, menu_kode: "pelatihan.administrasi" }],
    sigap_akun_peran: [{ id: 5, akun_id: 478, peran_id: 11, kegiatan_id: 3 }],
    sigap_kegiatan_tarif: [{ kegiatan_id: 7, peran: "ppl" }, { kegiatan_id: 7, peran: "pml" }],
    sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: null }],
    sigap_penugasan: [] as Baris[],
    sigap_kuis_instruktur_kelas: [] as Baris[],
  });
  const oleh = { aktorId: 1, adminAplikasi: false, diberiOleh: "pelatihan:1" };

  it("tambahPanitia: peran panitia berlingkup pelatihan ini; panitia pelatihan lain tidak mengganggu; tanpa duplikat", async () => {
    const { db, t } = dbTiruan(dasar());
    const h = await tambahPanitia(db, 7, 478, oleh);
    expect(h).toMatchObject({ ok: true, nama: "Oryza Maria Ulva" });
    expect(t.sigap_akun_peran.filter((x) => x.akun_id === 478).map((x) => x.kegiatan_id).sort()).toEqual([3, 7]);
    const lagi = await tambahPanitia(db, 7, 478, oleh);
    expect(lagi.ok).toBe(false);
    expect(t.sigap_akun_peran.filter((x) => x.akun_id === 478 && x.kegiatan_id === 7)).toHaveLength(1);
  });

  it("tambahPanitia: menolak diri sendiri (kecuali Admin Aplikasi), akun nonaktif, akun tak ada, dan peran yang memuat izin tertinggi", async () => {
    const { db } = dbTiruan(dasar());
    expect((await tambahPanitia(db, 7, 1, oleh)).ok).toBe(false);
    expect((await tambahPanitia(db, 7, 1, { ...oleh, adminAplikasi: true })).ok).toBe(true);
    expect((await tambahPanitia(db, 7, 9, oleh)).ok).toBe(false);
    expect((await tambahPanitia(db, 7, 999, oleh)).ok).toBe(false);
    const tinggi = dbTiruan({ ...dasar(), sigap_peran_izin: [{ peran_id: 11, menu_kode: "akses.kelola" }] });
    expect((await tambahPanitia(tinggi.db, 7, 478, oleh)).ok).toBe(false);
  });

  it("cabutPanitia: hanya Panitia Pelatihan berlingkup pelatihan ini; bukan diri sendiri", async () => {
    const d = dasar();
    d.sigap_akun_peran.push({ id: 6, akun_id: 20, peran_id: 11, kegiatan_id: 7 }, { id: 7, akun_id: 20, peran_id: 12, kegiatan_id: 7 }, { id: 8, akun_id: 1, peran_id: 11, kegiatan_id: 7 });
    const { db, t } = dbTiruan(d);
    expect((await cabutPanitia(db, 7, 5, oleh)).ok).toBe(false); // lingkup pelatihan lain
    expect((await cabutPanitia(db, 7, 7, oleh)).ok).toBe(false); // bukan peran panitia
    expect((await cabutPanitia(db, 7, 8, oleh)).ok).toBe(false); // diri sendiri
    expect((await cabutPanitia(db, 7, 6, oleh)).ok).toBe(true);
    expect(t.sigap_akun_peran.map((x) => x.id).sort()).toEqual([5, 7, 8]);
  });

  it("libatkanPeserta: buat penugasan baru, aktifkan kembali yang lama, tolak peran/kelas yang tidak ada dan peserta ganda", async () => {
    const d = dasar();
    d.sigap_penugasan.push({ id: 50, kegiatan_id: 7, akun_id: 20, peran: "ppl", aktif: false, kelas: null, sumber: "admin:354" });
    const { db, t } = dbTiruan(d);
    expect((await libatkanPeserta(db, 7, 478, "ppl", 1, 1)).ok).toBe(true);
    expect(t.sigap_penugasan.find((x) => x.akun_id === 478)).toMatchObject({ kegiatan_id: 7, peran: "ppl", aktif: true, kelas: 1, sumber: "pelatihan:1" });
    expect((await libatkanPeserta(db, 7, 478, "ppl", 1, 1)).ok).toBe(false);
    expect((await libatkanPeserta(db, 7, 20, "pml", null, 1)).ok).toBe(true);
    expect(t.sigap_penugasan.find((x) => x.id === 50)).toMatchObject({ aktif: true, peran: "pml", sumber: "admin:354" });
    expect((await libatkanPeserta(db, 7, 1, "korwil", null, 1)).ok).toBe(false);
    expect((await libatkanPeserta(db, 7, 1, "ppl", 4, 1)).ok).toBe(false);
    expect((await libatkanPeserta(db, 7, 9, "ppl", null, 1)).ok).toBe(false);
  });

  it("keluarkanPeserta: menonaktifkan, tidak menghapus; hanya di pelatihan itu", async () => {
    const d = dasar();
    d.sigap_penugasan.push({ id: 50, kegiatan_id: 7, akun_id: 20, peran: "ppl", aktif: true, kelas: 1 }, { id: 51, kegiatan_id: 3, akun_id: 20, peran: "ppl", aktif: true, kelas: 1 });
    const { db, t } = dbTiruan(d);
    expect((await keluarkanPeserta(db, 7, 51)).ok).toBe(false);
    expect((await keluarkanPeserta(db, 7, 50)).ok).toBe(true);
    expect(t.sigap_penugasan.find((x) => x.id === 50)).toMatchObject({ aktif: false });
    expect(t.sigap_penugasan).toHaveLength(2);
  });

  it("cariAkunLibat: kata kunci minimal 2 huruf, akun nonaktif tak muncul, keterlibatan saat ini ditandai", async () => {
    const d = dasar();
    d.sigap_akun_peran.push({ id: 6, akun_id: 478, peran_id: 11, kegiatan_id: 7 });
    d.sigap_penugasan.push({ id: 50, kegiatan_id: 7, akun_id: 478, peran: "ppl", aktif: true, kelas: 1 });
    d.sigap_kuis_instruktur_kelas.push({ kegiatan_id: 7, akun_id: 478, kelas: 1 });
    const { db } = dbTiruan(d);
    expect(await cariAkunLibat(db, 7, "o")).toEqual([]);
    const h = await cariAkunLibat(db, 7, "oryza");
    expect(h.map((x) => x.id)).toEqual([478]);
    expect(h[0].sebagai.sort()).toEqual(["Instruktur Kelas 1", "Panitia", "Peserta Kelas 1"]);
    expect((await cariAkunLibat(db, 7, "rina"))[0].sebagai).toEqual([]);
  });
});

describe("administrasi: panitia digabung dengan peserta, instruktur terpisah", () => {
  const dasar = () => ({
    sigap_akun: [{ id: 478, nama: "Oryza", aktif: true }, { id: 354, nama: "Iqbal", aktif: true }, { id: 30, nama: "Peserta", aktif: true }, { id: 9, nama: "Lama", aktif: false }],
    sigap_kegiatan_tarif: [{ kegiatan_id: 7, peran: "ppl" }, { kegiatan_id: 7, peran: "panitia" }, { kegiatan_id: 7, peran: "instruktur" }],
    sigap_penugasan: [{ id: 1, kegiatan_id: 7, akun_id: 30, peran: "ppl", aktif: true, kelas: 1, sumber: null }] as Baris[],
    sigap_hari_kerja: [] as Baris[],
    sigap_pelatihan_kelas: [{ kegiatan_id: 7, nomor: 1, nama: "Kelas 1", kuota: null }],
    sigap_kuis_instruktur_kelas: [] as Baris[],
  });

  it("tambahPesertaAdministrasi: panitia dan instruktur menjadi baris administrasi lengkap dengan hari kerja pada tanggal pelatihan", async () => {
    const { db, t } = dbTiruan(dasar());
    const a = await tambahPesertaAdministrasi(db, 7, { akunId: 478, peran: "panitia", kelas: 1 });
    expect(a).toMatchObject({ ok: true, nama: "Oryza" });
    const b = await tambahPesertaAdministrasi(db, 7, { akunId: 354, peran: "instruktur", kelas: 1 });
    expect(b.ok).toBe(true);
    expect(t.sigap_penugasan.filter((x) => x.sumber === "administrasi").map((x) => [x.akun_id, x.peran, x.kelas])).toEqual([[478, "panitia", 1], [354, "instruktur", 1]]);
    expect(t.sigap_hari_kerja.map((x) => [x.akun_id, x.tanggal])).toEqual([[478, "2026-11-10"], [354, "2026-11-10"]]);
  });

  it("tambahPesertaAdministrasi: menolak peran asing, tarif belum ada, akun nonaktif, kelas kosong, dan orang yang sudah terdaftar", async () => {
    const { db } = dbTiruan({ ...dasar(), sigap_kegiatan_tarif: [{ kegiatan_id: 7, peran: "ppl" }] });
    expect((await tambahPesertaAdministrasi(db, 7, { akunId: 478, peran: "bendahara", kelas: 1 })).ok).toBe(false);
    const tanpaTarif = await tambahPesertaAdministrasi(db, 7, { akunId: 478, peran: "panitia", kelas: 1 });
    expect(tanpaTarif).toMatchObject({ ok: false });
    expect(!tanpaTarif.ok && tanpaTarif.pesan).toContain("Tarif untuk peran PANITIA");
    expect((await tambahPesertaAdministrasi(db, 7, { akunId: 9, peran: "ppl", kelas: 1 })).ok).toBe(false);
    expect((await tambahPesertaAdministrasi(db, 7, { akunId: 478, peran: "ppl", kelas: null })).ok).toBe(false);
    const ganda = await tambahPesertaAdministrasi(db, 7, { akunId: 30, peran: "ppl", kelas: 1 });
    expect(!ganda.ok && ganda.status).toBe(409);
  });

  it("lepasAdministrasiAkun: hanya baris administrasi pada peran itu yang dinonaktifkan; peserta biasa tidak tersentuh", async () => {
    const { db, t } = dbTiruan(dasar());
    await tambahPesertaAdministrasi(db, 7, { akunId: 478, peran: "panitia", kelas: 1 });
    expect(await lepasAdministrasiAkun(db, 7, 30, "panitia")).toBe(0);
    expect(await lepasAdministrasiAkun(db, 7, 478, "panitia")).toBe(1);
    expect(t.sigap_penugasan.find((x) => x.akun_id === 478)).toMatchObject({ aktif: false });
    expect(t.sigap_penugasan.find((x) => x.akun_id === 30)).toMatchObject({ aktif: true });
  });

  it("panitia dan instruktur bukan peserta kelas: tidak dihitung di plotting peserta dan tidak membuat kelas \"terpakai\"", async () => {
    const d = dasar();
    d.sigap_penugasan.push(
      { id: 2, kegiatan_id: 7, akun_id: 478, peran: "panitia", aktif: true, kelas: 3, sumber: "administrasi" },
      { id: 3, kegiatan_id: 7, akun_id: 354, peran: "instruktur", aktif: true, kelas: 2, sumber: "administrasi" },
    );
    d.sigap_akun.push();
    const { db } = dbTiruan(d);
    const p = await muatPesertaKelas(db, 7);
    expect(p.map((x) => x.akun_id)).toEqual([30]);
    expect((await muatKelasKegiatan(db, 7)).map((k) => k.nomor)).toEqual([1]);
  });
});
