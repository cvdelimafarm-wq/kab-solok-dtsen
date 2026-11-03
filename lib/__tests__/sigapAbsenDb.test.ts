import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigapTesDb", () => ({ FILTER_BUKAN_ADMINISTRASI: "sumber.is.null" }));
vi.mock("@/lib/sigapAkses", () => ({ boleh: () => true }));

import { catatDatangManual, centangPeserta, hariKegiatan, kirimKode, konfirmasiLokasi, mulaiSesi, muatAtur, muatDatang, muatHadir, muatSesiHari, pesertaKelas, sesiTerbukaUntuk, simpanAtur, simpanPosisiPengelola, tutupSesi, ambilSesi, gantiMetode } from "@/lib/sigapAbsenDb";

type Baris = Record<string, unknown>;

/** Basis data palsu dalam memori: cukup untuk rantai yang dipakai lib (select/eq/in/or/order/limit/maybeSingle/insert/update/delete/upsert). */
function buatDb(awal: Record<string, Baris[]> = {}, tanpaTabel: string[] = []) {
  const tabel: Record<string, Baris[]> = JSON.parse(JSON.stringify(awal));
  const seq: Record<string, number> = {};
  const kunciUnik: Record<string, string[]> = {
    sigap_kegiatan_absen_hadir: ["absen_sesi_id", "akun_id"],
    sigap_kegiatan_absen_salah: ["absen_sesi_id", "akun_id"],
    sigap_kegiatan_absen_posisi: ["absen_sesi_id"],
    sigap_kegiatan_absen_atur: ["kegiatan_id"],
  };
  const db = {
    from(nama: string) {
      const hilang = tanpaTabel.includes(nama);
      const rows = (tabel[nama] ??= []);
      const filter: ((r: Baris) => boolean)[] = [];
      let aksi: "select" | "insert" | "update" | "delete" | "upsert" = "select";
      let isi: Baris | Baris[] = {};
      let urut: { k: string; naik: boolean } | null = null;
      let batas = 1e9;
      let kembalikan = false;
      const b: Record<string, unknown> = {};
      const jalankan = (): { data: unknown; error: { message: string; code?: string } | null } => {
        if (hilang) return { data: null, error: { message: "relation does not exist" } };
        const cocok = () => rows.filter((r) => filter.every((f) => f(r)));
        if (aksi === "select") {
          let h = cocok();
          if (urut) { const { k, naik } = urut; h = [...h].sort((x, y) => (String(x[k]) < String(y[k]) ? -1 : String(x[k]) > String(y[k]) ? 1 : 0) * (naik ? 1 : -1)); }
          return { data: h.slice(0, batas).map((r) => ({ ...r })), error: null };
        }
        if (aksi === "insert") {
          const baru = { ...(isi as Baris) };
          if (nama === "sigap_kegiatan_absen_sesi") {
            const dup = rows.find((r) => r.kegiatan_id === baru.kegiatan_id && r.tanggal === baru.tanggal && r.no === baru.no && (r.kelas ?? null) === (baru.kelas ?? null));
            if (dup) return { data: null, error: { message: "dup", code: "23505" } };
          }
          if (tabel[nama] && ["sigap_kegiatan_absen_sesi", "sigap_kegiatan_absen_buka"].includes(nama)) baru.id = baru.id ?? (seq[nama] = (seq[nama] ?? 0) + 1);
          rows.push(baru);
          return { data: kembalikan ? { ...baru } : null, error: null };
        }
        if (aksi === "update") {
          const h = cocok();
          for (const r of h) Object.assign(r, isi);
          return { data: kembalikan ? h.map((r) => ({ ...r })) : null, error: null };
        }
        if (aksi === "delete") {
          for (const r of cocok()) rows.splice(rows.indexOf(r), 1);
          return { data: null, error: null };
        }
        const kunci = kunciUnik[nama] ?? ["id"];
        const baru = { ...(isi as Baris) };
        const ada = rows.find((r) => kunci.every((k) => r[k] === baru[k]));
        if (ada) Object.assign(ada, baru); else rows.push(baru);
        return { data: null, error: null };
      };
      for (const [m, f] of [["eq", (k: string, v: unknown) => (r: Baris) => r[k] === v], ["in", (k: string, v: unknown[]) => (r: Baris) => v.includes(r[k])]] as const) {
        b[m] = (k: string, v: never) => { filter.push((f as (k: string, v: never) => (r: Baris) => boolean)(k, v)); return b; };
      }
      b.or = () => b;
      b.select = () => { if (aksi !== "select") kembalikan = true; return b; };
      b.order = (k: string, o?: { ascending?: boolean }) => { urut = { k, naik: o?.ascending !== false }; return b; };
      b.limit = (n: number) => { batas = n; return b; };
      b.insert = (v: Baris) => { aksi = "insert"; isi = v; return b; };
      b.update = (v: Baris) => { aksi = "update"; isi = v; return b; };
      b.delete = () => { aksi = "delete"; return b; };
      b.upsert = (v: Baris) => { aksi = "upsert"; isi = v; return b; };
      b.maybeSingle = () => { const h = jalankan(); return Promise.resolve(Array.isArray(h.data) ? { data: h.data[0] ?? null, error: h.error } : h); };
      b.then = (ok: (h: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(jalankan()).then(ok, no);
      return b;
    },
  };
  return { db: db as never, tabel };
}

const T0 = Date.parse("2026-11-09T03:00:00Z"); // 10:00 WIB, 9 Nov 2026
const acak = () => 0.5;
const kegiatan = 7;
const mulai = (db: never, patch: Partial<{ no: number; kelas: number | null; metode: ("centang" | "kode" | "radar")[]; tanggal: string }> = {}, now = T0) =>
  mulaiSesi(db, kegiatan, { tanggal: patch.tanggal ?? "2026-11-09", no: patch.no ?? 2, label: "Sesi 2", jam: "10:00", kelas: patch.kelas ?? null, metode: patch.metode ?? ["centang", "kode", "radar"], disarankan: 2 }, "Panitia A", acak, now);

describe("pengaturan dan hari", () => {
  it("muatAtur: tanpa tabel/baris -> bawaan", async () => {
    const { db } = buatDb({}, ["sigap_kegiatan_absen_atur"]);
    const a = await muatAtur(db, kegiatan);
    expect(a).toMatchObject({ jendela_menit: 30, radius_m: 25, ada: false });
    expect(a.sesi).toHaveLength(4);
  });
  it("simpanAtur memeriksa batas dan menyimpan", async () => {
    const { db, tabel } = buatDb();
    expect((await simpanAtur(db, kegiatan, { jendela_menit: 2 }, "x")).ok).toBe(false);
    expect((await simpanAtur(db, kegiatan, { radius_m: 9999 }, "x")).ok).toBe(false);
    const h = await simpanAtur(db, kegiatan, { jendela_menit: 45, radius_m: 30, sesi: [{ no: 1, label: "Pagi", jam: "8:30" }] }, "Iqbal");
    expect(h.ok && h.atur).toMatchObject({ jendela_menit: 45, radius_m: 30, sesi: [{ no: 1, label: "Pagi", jam: "08:30" }] });
    expect(tabel.sigap_kegiatan_absen_atur).toHaveLength(1);
    expect((await muatAtur(db, kegiatan)).ada).toBe(true);
    const gagal = buatDb({}, ["sigap_kegiatan_absen_atur"]);
    expect((await simpanAtur(gagal.db, kegiatan, { jendela_menit: 30 }, "x")).ok).toBe(false);
  });
  it("hariKegiatan dari tanggal mulai dan selesai", async () => {
    const { db } = buatDb({ sigap_kegiatan: [{ id: kegiatan, tanggal_mulai: "2026-11-09", tanggal_selesai: "2026-11-10" }] });
    expect(await hariKegiatan(db, kegiatan)).toEqual(["2026-11-09", "2026-11-10"]);
  });
});

describe("peserta", () => {
  it("hanya PML/PPL aktif, tanpa penolak, per kelas", async () => {
    const { db } = buatDb({
      sigap_penugasan: [
        { id: 1, kegiatan_id: kegiatan, akun_id: 11, peran: "ppl", kelas: 1, aktif: true },
        { id: 2, kegiatan_id: kegiatan, akun_id: 12, peran: "pml", kelas: 2, aktif: true },
        { id: 3, kegiatan_id: kegiatan, akun_id: 13, peran: "ppl", kelas: 1, aktif: true },
        { id: 4, kegiatan_id: kegiatan, akun_id: 14, peran: "panitia", kelas: 1, aktif: true },
      ],
      sigap_akun: [{ id: 11, nama: "Budi" }, { id: 12, nama: "Cici" }, { id: 13, nama: "Ani" }, { id: 14, nama: "Pak P" }],
      sigap_pelatihan_undangan_respons: [{ kegiatan_id: kegiatan, akun_id: 13, respons: "tolak" }],
    });
    expect((await pesertaKelas(db, kegiatan, null)).map((p) => p.nama)).toEqual(["Budi", "Cici"]);
    expect((await pesertaKelas(db, kegiatan, 1)).map((p) => p.nama)).toEqual(["Budi"]);
  });
});

describe("mulai, buka kembali, tutup", () => {
  it("membuat sesi dengan jendela 30 menit dan kode 6 digit", async () => {
    const { db, tabel } = buatDb();
    const h = await mulai(db);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.sesi.status).toBe("dibuka");
    expect(Date.parse(h.sesi.tutup_at) - Date.parse(h.sesi.dibuka_at)).toBe(30 * 60_000);
    expect(h.sesi.kode).toMatch(/^\d{6}$/);
    expect(tabel.sigap_kegiatan_absen_buka).toHaveLength(1);
    expect(tabel.sigap_kegiatan_absen_buka[0]).toMatchObject({ disarankan_no: 2, dipilih_no: 2 });
  });
  it("tanpa metode kode -> tanpa kode", async () => {
    const { db } = buatDb();
    const h = await mulai(db, { metode: ["centang"] });
    expect(h.ok && h.sesi.kode).toBeNull();
  });
  it("membuka kembali: kode tetap, jendela baru, kehadiran lama tidak hilang, percobaan salah dibersihkan", async () => {
    const { db, tabel } = buatDb();
    const a = await mulai(db);
    if (!a.ok) throw new Error("gagal");
    tabel.sigap_kegiatan_absen_hadir = [{ absen_sesi_id: a.sesi.id, akun_id: 11, metode: "centang", diterima: true }];
    tabel.sigap_kegiatan_absen_salah = [{ absen_sesi_id: a.sesi.id, akun_id: 12, jumlah: 5, terakhir_at: new Date(T0).toISOString() }];
    const b = await mulai(db, {}, T0 + 3 * 3600_000);
    expect(b.ok && b.sesi.id).toBe(a.sesi.id);
    expect(b.ok && b.sesi.kode).toBe(a.sesi.kode);
    expect(b.ok && Date.parse(b.sesi.dibuka_at)).toBe(T0 + 3 * 3600_000);
    expect(tabel.sigap_kegiatan_absen_hadir).toHaveLength(1);
    expect(tabel.sigap_kegiatan_absen_salah).toHaveLength(0);
    expect(tabel.sigap_kegiatan_absen_buka).toHaveLength(2);
  });
  it("kelas berbeda = sesi berbeda pada nomor yang sama", async () => {
    const { db } = buatDb();
    const a = await mulai(db, { kelas: 1 });
    const b = await mulai(db, { kelas: 2 });
    expect(a.ok && b.ok && a.sesi.id !== b.sesi.id).toBe(true);
  });
  it("tabel belum ada -> pesan jelas", async () => {
    const { db } = buatDb({}, ["sigap_kegiatan_absen_sesi"]);
    const h = await mulai(db);
    expect(!h.ok && h.pesan).toContain("20261102zk");
  });
  it("tutupSesi menutup lebih awal; sesiTerbukaUntuk menyaring jendela, status, dan kelas", async () => {
    const { db } = buatDb();
    const a = await mulai(db, { no: 1, kelas: 1 });
    const b = await mulai(db, { no: 2, kelas: null });
    if (!a.ok || !b.ok) throw new Error("gagal");
    expect((await sesiTerbukaUntuk(db, kegiatan, 1, T0 + 60_000)).map((s) => s.no)).toEqual([1, 2]);
    expect((await sesiTerbukaUntuk(db, kegiatan, 2, T0 + 60_000)).map((s) => s.no)).toEqual([2]);
    expect(await sesiTerbukaUntuk(db, kegiatan, 1, T0 + 31 * 60_000)).toEqual([]);
    await tutupSesi(db, kegiatan, b.sesi.id, T0 + 5 * 60_000);
    expect((await sesiTerbukaUntuk(db, kegiatan, 1, T0 + 6 * 60_000)).map((s) => s.no)).toEqual([1]);
    expect((await muatSesiHari(db, kegiatan, "2026-11-09")).sesi).toHaveLength(2);
    expect((await ambilSesi(db, kegiatan, b.sesi.id))?.status).toBe("ditutup");
  });
});

describe("kode", () => {
  let db: never; let sesi: Awaited<ReturnType<typeof ambilSesi>>; let tabel: Record<string, Baris[]>;
  beforeEach(async () => {
    const x = buatDb();
    db = x.db; tabel = x.tabel;
    const h = await mulai(db, { metode: ["kode"], kelas: 1 });
    if (!h.ok) throw new Error("gagal");
    sesi = h.sesi;
  });
  it("kode benar -> hadir (metode kode); ulang -> sudah", async () => {
    const h = await kirimKode(db, sesi, 11, 1, sesi!.kode, T0 + 1000);
    expect(h.ok).toBe(true);
    expect(tabel.sigap_kegiatan_absen_hadir[0]).toMatchObject({ akun_id: 11, metode: "kode", diterima: true, manual: false });
    expect(await kirimKode(db, sesi, 11, 1, "000000", T0 + 2000)).toEqual({ ok: true, sudah: true });
  });
  it("salah 5x -> menunggu 1 menit; sesudahnya boleh lagi", async () => {
    let t = T0 + 1000;
    for (let i = 1; i <= 5; i++) {
      const h = await kirimKode(db, sesi, 11, 1, "111111", t);
      expect(h.ok).toBe(false);
      if (!h.ok) expect(h.sisa_percobaan).toBe(5 - i);
      t += 1000;
    }
    const tunggu = await kirimKode(db, sesi, 11, 1, sesi!.kode, t);
    expect(!tunggu.ok && tunggu.status).toBe(429);
    const nanti = await kirimKode(db, sesi, 11, 1, sesi!.kode, t + 61_000);
    expect(nanti.ok).toBe(true);
  });
  it("menolak: sesi habis, kelas lain, metode tidak aktif, sesi tidak ada", async () => {
    expect((await kirimKode(db, sesi, 11, 1, sesi!.kode, T0 + 31 * 60_000))).toMatchObject({ ok: false, status: 409 });
    expect((await kirimKode(db, sesi, 11, 2, sesi!.kode, T0 + 1000))).toMatchObject({ ok: false, status: 403 });
    expect((await kirimKode(db, null, 11, 1, "1", T0))).toMatchObject({ ok: false, status: 404 });
    const x = buatDb();
    const s2 = await mulai(x.db, { metode: ["centang"] });
    if (!s2.ok) throw new Error("gagal");
    expect((await kirimKode(x.db, s2.sesi, 11, null, "1", T0 + 1000))).toMatchObject({ ok: false, status: 409 });
  });
});

describe("radar", () => {
  const pusat = { lat: -0.7893, lng: 100.65, akurasi: 5 };
  it("masuk radius -> hadir; di luar -> dicatat diterima=false; tanpa posisi pengelola -> ditolak tanpa catatan", async () => {
    const { db, tabel } = buatDb();
    const h = await mulai(db, { metode: ["radar"] });
    if (!h.ok) throw new Error("gagal");
    const tanpa = await konfirmasiLokasi(db, h.sesi, 11, null, { lat: -0.7893, lng: 100.65, akurasi: 5 }, T0 + 1000);
    expect(tanpa).toMatchObject({ ok: false, kode: "tanpa_pusat" });
    expect(tabel.sigap_kegiatan_absen_hadir ?? []).toHaveLength(0);
    await simpanPosisiPengelola(db, h.sesi, 99, pusat, T0 + 2000);
    const luar = await konfirmasiLokasi(db, h.sesi, 12, null, { lat: -0.7893 + 0.001, lng: 100.65, akurasi: 8 }, T0 + 3000);
    expect(luar).toMatchObject({ ok: false, kode: "luar" });
    expect(tabel.sigap_kegiatan_absen_hadir[0]).toMatchObject({ akun_id: 12, diterima: false, metode: "radar" });
    const masuk = await konfirmasiLokasi(db, h.sesi, 12, null, { lat: -0.7893 + 0.0001, lng: 100.65, akurasi: 8 }, T0 + 4000);
    expect(masuk.ok).toBe(true);
    expect(tabel.sigap_kegiatan_absen_hadir).toHaveLength(1);
    expect(tabel.sigap_kegiatan_absen_hadir[0]).toMatchObject({ akun_id: 12, diterima: true });
    const basi = await konfirmasiLokasi(db, h.sesi, 13, null, { lat: -0.7893, lng: 100.65, akurasi: 5 }, T0 + 2000 + 60_000);
    expect(basi).toMatchObject({ ok: false, kode: "basi" });
  });
});

describe("centang manual, kedatangan", () => {
  it("centangPeserta: centang dan batalkan", async () => {
    const { db, tabel } = buatDb();
    const h = await mulai(db, { metode: ["centang"] });
    if (!h.ok) throw new Error("gagal");
    await centangPeserta(db, h.sesi, 11, true, "Panitia A", null);
    expect(tabel.sigap_kegiatan_absen_hadir[0]).toMatchObject({ akun_id: 11, metode: "centang", manual: true, diterima: true });
    expect((await muatHadir(db, [h.sesi.id])).filter((x) => x.diterima)).toHaveLength(1);
    await centangPeserta(db, h.sesi, 11, false, "Panitia A", null);
    expect(tabel.sigap_kegiatan_absen_hadir).toHaveLength(0);
  });
  it("kedatangan: muatDatang mengambil yang paling awal; centang manual wajib beralasan dan tidak menggandakan", async () => {
    const { db, tabel } = buatDb({ sigap_pelatihan_presensi: [
      { kegiatan_id: kegiatan, akun_id: 11, tanggal: "2026-11-09", diterima: true, at: "2026-11-09T01:05:00Z", manual: false, terlambat: false, jarak_m: 40 },
      { kegiatan_id: kegiatan, akun_id: 11, tanggal: "2026-11-09", diterima: true, at: "2026-11-09T01:00:00Z", manual: false, terlambat: true, jarak_m: 10 },
      { kegiatan_id: kegiatan, akun_id: 12, tanggal: "2026-11-09", diterima: false, at: "2026-11-09T01:00:00Z", manual: false, terlambat: false, jarak_m: 900 },
    ] });
    const d = await muatDatang(db, kegiatan, "2026-11-09", [11, 12]);
    expect(d.get(11)).toMatchObject({ at: "2026-11-09T01:00:00Z", terlambat: true });
    expect(d.has(12)).toBe(false);
    const p = { akun_id: 12, nama: "Cici", kelas: 1, penugasan_id: 2 };
    expect((await catatDatangManual(db, kegiatan, p, "2026-11-09", "  ", "Panitia", T0)).ok).toBe(false);
    expect((await catatDatangManual(db, kegiatan, p, "2026-11-09", "GPS meleset di dalam gedung", "Panitia", T0)).ok).toBe(true);
    expect((await catatDatangManual(db, kegiatan, p, "2026-11-09", "ulang", "Panitia", T0)).ok).toBe(true);
    expect(tabel.sigap_pelatihan_presensi.filter((r) => r.akun_id === 12 && r.diterima)).toHaveLength(1);
    expect(tabel.sigap_pelatihan_presensi.find((r) => r.manual)).toMatchObject({ alasan: "GPS meleset di dalam gedung", dicatat_oleh: "Panitia", sesi_no: 1 });
  });
});

describe("gantiMetode (3 Nov 2026): ganti metode di tengah jalan, jendela waktu tetap", () => {
  it("kode -> radar: metode menjadi satu-satunya radar, tutup_at tidak berubah, kode lama tetap tersimpan", async () => {
    const { db } = buatDb();
    const h = await mulai(db, { metode: ["kode"], kelas: 1 });
    if (!h.ok) throw new Error("gagal");
    const tutupLama = h.sesi.tutup_at;
    const g = await gantiMetode(db, h.sesi, "radar", acak);
    expect(g.ok).toBe(true);
    const baru = await ambilSesi(db, kegiatan, h.sesi.id);
    expect(baru?.metode).toEqual(["radar"]);
    expect(baru?.tutup_at).toBe(tutupLama);
    expect(baru?.kode).toBe(h.sesi.kode);
  });
  it("radar -> kode: kode dibuat bila belum ada, dan peserta tidak lagi bisa memakai radar", async () => {
    const { db, tabel } = buatDb();
    const h = await mulai(db, { metode: ["radar"], kelas: 1 });
    if (!h.ok) throw new Error("gagal");
    expect(h.sesi.kode).toBeNull();
    const g = await gantiMetode(db, h.sesi, "kode", acak);
    expect(g.ok && g.kode).toMatch(/^\d{6}$/);
    const baru = (await ambilSesi(db, kegiatan, h.sesi.id))!;
    const r = await konfirmasiLokasi(db, baru, 11, 1, { lat: -0.79, lng: 100.65, akurasi: 5 }, T0 + 1000);
    expect(r.ok).toBe(false);
    expect(tabel.sigap_kegiatan_absen_hadir ?? []).toHaveLength(0);
  });
  it("tabel belum ada -> pesan jelas", async () => {
    const { db } = buatDb({}, ["sigap_kegiatan_absen_sesi"]);
    const g = await gantiMetode(db, { id: 1, kegiatan_id: kegiatan, kode: null } as never, "kode", acak);
    expect(g.ok).toBe(false);
  });
});
