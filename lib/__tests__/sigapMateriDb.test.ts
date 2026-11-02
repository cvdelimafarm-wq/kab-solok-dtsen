// Menguji lib/sigapMateriDb.ts dengan db tiruan di memori: muat materi/progres, laporan putar (anti-curang), buka tautan, tandai manual, simpan/sembunyikan, ringkasan wajib, dan tahan SQL belum dijalankan.
import { describe, expect, it } from "vitest";
import { PESAN_SQL_MATERI, catatBuka, catatManual, laporPutar, muatMateri, muatProgresBatch, muatStatusMateriBatch, nonaktifkanMateri, simpanMateri } from "../sigapMateriDb";

type Baris = Record<string, unknown>;
function fakeDb(tabel: Record<string, Baris[]>, tolak: string[] = []) {
  let seq = 100;
  return {
    from(nama: string) {
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Baris = {};
      let konflik: string[] = [];
      const saring: ((r: Baris) => boolean)[] = [];
      let batas = Infinity;
      const q: Record<string, unknown> & { run: () => { data: Baris[] | null; error: { message: string } | null } } = {
        select: () => q,
        insert: (x: Baris) => { op = "insert"; payload = x; return q; },
        update: (x: Baris) => { op = "update"; payload = x; return q; },
        upsert: (x: Baris, o: { onConflict: string }) => { op = "upsert"; payload = x; konflik = o.onConflict.split(","); return q; },
        eq: (k: string, v: unknown) => { saring.push((r) => r[k] === v); return q; },
        in: (k: string, v: unknown[]) => { saring.push((r) => v.includes(r[k])); return q; },
        is: (k: string, v: unknown) => { saring.push((r) => (r[k] ?? null) === v); return q; },
        order: () => q,
        limit: (n: number) => { batas = n; return q; },
        run() {
          if (tolak.includes(nama)) return { data: null, error: { message: `relation "public.${nama}" does not exist` } };
          const t = (tabel[nama] ??= []);
          if (op === "insert") { const b = { id: ++seq, aktif: true, ...payload }; t.push(b); return { data: [b], error: null }; }
          if (op === "upsert") {
            const ada = t.find((r) => konflik.every((k) => r[k] === payload[k]));
            if (ada) Object.assign(ada, payload); else t.push({ ...payload });
            return { data: [payload], error: null };
          }
          const cocok = t.filter((r) => saring.every((f) => f(r)));
          if (op === "update") { cocok.forEach((r) => Object.assign(r, payload)); return { data: cocok.map((r) => ({ ...r })), error: null }; }
          return { data: cocok.slice(0, batas).map((r) => ({ ...r })), error: null };
        },
        maybeSingle() { const r = q.run(); return Promise.resolve({ data: r.data ? r.data[0] ?? null : null, error: r.error }); },
        single() { const r = q.run(); return Promise.resolve({ data: r.data ? r.data[0] ?? null : null, error: r.error }); },
        then(ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) { return Promise.resolve(q.run()).then(ok, ko); },
      };
      return q;
    },
  } as never;
}

const NOW = new Date("2026-11-09T04:00:00Z").getTime();
const video = (o: Baris = {}): Baris => ({ id: 1, kegiatan_id: 7, urutan: 1, jenis: "video", judul: "Pengantar", url: "https://youtu.be/dQw4w9WgXcQ", youtube_id: "dQw4w9WgXcQ", durasi_detik: 100, wajib: true, aktif: true, ...o });
const tautan = (o: Baris = {}): Baris => ({ id: 2, kegiatan_id: 7, urutan: 2, jenis: "tautan", judul: "Buku pedoman", url: "https://drive.google.com/x", youtube_id: null, durasi_detik: null, wajib: true, aktif: true, ...o });
const lap = (segmen: [number, number][], durasi: number | null = null, materi_id = 1) => ({ materi_id, segmen, durasi });

describe("muatMateri", () => {
  it("hanya materi aktif kegiatan itu, urut", async () => {
    const db = fakeDb({ sigap_pelatihan_materi: [video(), tautan({ aktif: false }), video({ id: 3, kegiatan_id: 9 })] });
    const r = await muatMateri(db, 7);
    expect(r.tersedia).toBe(true);
    expect(r.materi.map((m) => m.id)).toEqual([1]);
  });
  it("SQL belum dijalankan: tidak tersedia, daftar kosong (tidak melempar)", async () => {
    expect(await muatMateri(fakeDb({}, ["sigap_pelatihan_materi"]), 7)).toEqual({ tersedia: false, materi: [] });
  });
});

describe("laporPutar", () => {
  it("menyimpan progres pertama; laporan berikutnya menambah", async () => {
    const tabel = { sigap_pelatihan_materi: [video()], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    const a = await laporPutar(db, 7, 11, lap([[0, 5]]), NOW);
    expect(a).toMatchObject({ ok: true, selesai_baru: false });
    const b = await laporPutar(db, 7, 11, lap([[5, 10]]), NOW + 5000);
    expect(b).toMatchObject({ ok: true });
    expect(tabel.sigap_pelatihan_materi_progres).toHaveLength(1);
    expect(tabel.sigap_pelatihan_materi_progres[0]).toMatchObject({ materi_id: 1, akun_id: 11, detik_unik: 10 });
  });
  it("sampai habis -> selesai_at terisi dan selesai_baru true pada laporan terakhir", async () => {
    const tabel = { sigap_pelatihan_materi: [video()], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    let selesai = false;
    for (let i = 0; i < 20; i++) {
      const h = await laporPutar(db, 7, 11, lap([[i * 5, i * 5 + 5]]), NOW + i * 5000);
      if (h.ok && h.selesai_baru) selesai = true;
    }
    expect(selesai).toBe(true);
    expect(tabel.sigap_pelatihan_materi_progres[0].selesai_at).toBeTruthy();
    expect(tabel.sigap_pelatihan_materi_progres[0].selesai_manual).toBe(false);
  });
  it("melaporkan 'sudah menonton 90 detik' dalam 5 detik dipangkas", async () => {
    const tabel = { sigap_pelatihan_materi: [video()], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    await laporPutar(db, 7, 11, lap([[0, 5]]), NOW);
    const h = await laporPutar(db, 7, 11, lap([[5, 30], [30, 55], [55, 80]]), NOW + 5000);
    expect(h).toMatchObject({ ok: true, dipangkas: true });
    expect(Number(tabel.sigap_pelatihan_materi_progres[0].detik_unik)).toBeLessThan(25);
  });
  it("durasi dari pemutar disimpan bila pengelola tidak mengisi; yang sudah ada tidak ditimpa", async () => {
    const tabel = { sigap_pelatihan_materi: [video({ id: 1, durasi_detik: null }), video({ id: 4, durasi_detik: 200 })], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    await laporPutar(db, 7, 11, lap([[0, 5]], 120, 1), NOW);
    await laporPutar(db, 7, 11, lap([[0, 5]], 30, 4), NOW);
    expect(tabel.sigap_pelatihan_materi.find((m) => m.id === 1)!.durasi_detik).toBe(120);
    expect(tabel.sigap_pelatihan_materi.find((m) => m.id === 4)!.durasi_detik).toBe(200);
  });
  it("materi lain kegiatan / tidak aktif / bukan video / tidak ada: ditolak dengan status tepat", async () => {
    const db = fakeDb({ sigap_pelatihan_materi: [video({ kegiatan_id: 9 }), tautan(), video({ id: 5, aktif: false })], sigap_pelatihan_materi_progres: [] });
    expect(await laporPutar(db, 7, 11, lap([[0, 5]], null, 1), NOW)).toMatchObject({ ok: false, status: 404 });
    expect(await laporPutar(db, 7, 11, lap([[0, 5]], null, 2), NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await laporPutar(db, 7, 11, lap([[0, 5]], null, 5), NOW)).toMatchObject({ ok: false, status: 404 });
  });
  it("progres akun lain tidak ikut tercampur", async () => {
    const tabel = { sigap_pelatihan_materi: [video()], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    await laporPutar(db, 7, 11, lap([[0, 10]]), NOW);
    await laporPutar(db, 7, 12, lap([[0, 4]]), NOW);
    expect(tabel.sigap_pelatihan_materi_progres.map((p) => [p.akun_id, p.detik_unik])).toEqual([[11, 10], [12, 4]]);
  });
  it("SQL belum dijalankan: pesan menunjuk SQL, status 500", async () => {
    expect(await laporPutar(fakeDb({}, ["sigap_pelatihan_materi"]), 7, 11, lap([[0, 5]]), NOW)).toMatchObject({ ok: false, pesan: PESAN_SQL_MATERI, status: 500 });
  });
});

describe("catatBuka / catatManual", () => {
  it("tautan: dibuka pertama kali dicatat; pembukaan ulang tidak mengubah waktu", async () => {
    const tabel = { sigap_pelatihan_materi: [tautan()], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    const a = await catatBuka(db, 7, 11, 2, NOW);
    expect(a.ok && a.progres.selesai_at).toBe(new Date(NOW).toISOString());
    const b = await catatBuka(db, 7, 11, 2, NOW + 60_000);
    expect(b.ok && b.progres.selesai_at).toBe(new Date(NOW).toISOString());
    expect(tabel.sigap_pelatihan_materi_progres).toHaveLength(1);
  });
  it("buka hanya untuk tautan; manual hanya untuk video", async () => {
    const db = fakeDb({ sigap_pelatihan_materi: [video(), tautan()], sigap_pelatihan_materi_progres: [] });
    expect(await catatBuka(db, 7, 11, 1, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await catatManual(db, 7, 11, 2, NOW)).toMatchObject({ ok: false, status: 400 });
  });
  it("manual: selesai dengan tanda manual; tidak menimpa penyelesaian yang terbukti", async () => {
    const tabel = { sigap_pelatihan_materi: [video()], sigap_pelatihan_materi_progres: [] as Baris[] };
    const db = fakeDb(tabel);
    const a = await catatManual(db, 7, 11, 1, NOW);
    expect(a.ok && a.progres).toMatchObject({ selesai_manual: true });
    tabel.sigap_pelatihan_materi_progres[0].selesai_manual = false; // seandainya sebelumnya terbukti
    const b = await catatManual(db, 7, 11, 1, NOW + 1000);
    expect(b.ok && b.progres.selesai_manual).toBe(false);
  });
});

describe("simpanMateri / nonaktifkanMateri", () => {
  const masuk = { id: null, jenis: "tautan" as const, judul: "Buku pedoman", url: "https://x.id/a", youtube_id: null, durasi_detik: null, wajib: true, urutan: 3 };
  it("baru: menyimpan dengan pembuat; ubah: hanya milik kegiatan itu", async () => {
    const tabel = { sigap_pelatihan_materi: [tautan({ id: 2, kegiatan_id: 9 })] as Baris[] };
    const db = fakeDb(tabel);
    const baru = await simpanMateri(db, 7, masuk, "Budi");
    expect(baru.ok).toBe(true);
    expect(tabel.sigap_pelatihan_materi.at(-1)).toMatchObject({ kegiatan_id: 7, dibuat_oleh: "Budi", wajib: true, urutan: 3 });
    expect(await simpanMateri(db, 7, { ...masuk, id: 2 }, "Budi")).toMatchObject({ ok: false, status: 404 }); // milik kegiatan 9
    const idBaru = (baru as { id: number }).id;
    expect(await simpanMateri(db, 7, { ...masuk, id: idBaru, judul: "Judul baru" }, "Budi")).toMatchObject({ ok: true, id: idBaru });
    expect(tabel.sigap_pelatihan_materi.at(-1)!.judul).toBe("Judul baru");
  });
  it("sembunyikan: aktif=false; ulang/tidak ada = 404; SQL belum ada = pesan SQL", async () => {
    const tabel = { sigap_pelatihan_materi: [tautan()] as Baris[] };
    const db = fakeDb(tabel);
    expect(await nonaktifkanMateri(db, 7, 2)).toMatchObject({ ok: true, judul: "Buku pedoman" });
    expect(tabel.sigap_pelatihan_materi[0].aktif).toBe(false);
    expect(await nonaktifkanMateri(db, 7, 2)).toMatchObject({ ok: false, status: 404 });
    expect(await simpanMateri(fakeDb({}, ["sigap_pelatihan_materi"]), 7, masuk, "Budi")).toMatchObject({ ok: false, pesan: PESAN_SQL_MATERI });
    expect(await nonaktifkanMateri(fakeDb({}, ["sigap_pelatihan_materi"]), 7, 2)).toMatchObject({ ok: false, pesan: PESAN_SQL_MATERI });
  });
});

describe("muatProgresBatch & muatStatusMateriBatch", () => {
  const prog = (materi: number, akun: number, o: Baris = {}): Baris => ({ materi_id: materi, akun_id: akun, segmen: [], detik_unik: 0, selesai_at: null, selesai_manual: false, putar_terakhir_at: null, ...o });
  const selesai = "2026-11-09T03:00:00Z";
  const tabel = () => ({
    sigap_pelatihan_materi: [video(), tautan(), tautan({ id: 3, wajib: false, judul: "Opsional" })],
    sigap_pelatihan_materi_progres: [prog(1, 11, { selesai_at: selesai }), prog(2, 11, { selesai_at: selesai }), prog(1, 12, { selesai_at: selesai, selesai_manual: true }), prog(1, 13, { detik_unik: 40 })],
  });
  it("progres per akun per materi", async () => {
    const p = await muatProgresBatch(fakeDb(tabel()), [1, 2], [11, 12, 13, 14]);
    expect(p.get(11)!.size).toBe(2);
    expect(p.get(13)!.get(1)!.detik_unik).toBe(40);
    expect(p.has(14)).toBe(false);
  });
  it("status wajib: hanya video + tautan wajib dihitung; manual ditandai", async () => {
    const s = await muatStatusMateriBatch(fakeDb(tabel()), 7, [11, 12, 13, 14]);
    expect(s).toMatchObject({ tersedia: true, video_wajib_ada: true, wajib_total: 2 });
    expect(s.belum.get(11)).toBe(0);
    expect(s.belum.get(12)).toBe(1); // tautan wajib belum dibuka
    expect(s.belum.get(13)).toBe(2);
    expect(s.belum.get(14)).toBe(2);
    expect([...s.video_tuntas].sort()).toEqual([11, 12]);
    expect([...s.manual]).toEqual([12]);
  });
  it("tanpa materi wajib: tidak ada yang wajib, tidak ada yang menghalangi", async () => {
    const s = await muatStatusMateriBatch(fakeDb({ sigap_pelatihan_materi: [tautan({ wajib: false })] }), 7, [11]);
    expect(s).toMatchObject({ tersedia: true, video_wajib_ada: false, wajib_total: 0 });
    expect(s.belum.size).toBe(0);
  });
  it("SQL belum dijalankan: tidak tersedia dan tidak melempar", async () => {
    const s = await muatStatusMateriBatch(fakeDb({}, ["sigap_pelatihan_materi"]), 7, [11]);
    expect(s).toMatchObject({ tersedia: false, video_wajib_ada: false, wajib_total: 0 });
  });
  it("tabel progres belum ada tetapi materi ada: semua belum selesai", async () => {
    const s = await muatStatusMateriBatch(fakeDb({ sigap_pelatihan_materi: [video()] }, ["sigap_pelatihan_materi_progres"]), 7, [11]);
    expect(s.belum.get(11)).toBe(1);
    expect(s.video_tuntas.has(11)).toBe(false);
  });
});
