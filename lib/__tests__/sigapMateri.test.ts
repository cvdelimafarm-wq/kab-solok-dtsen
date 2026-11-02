import { describe, expect, it } from "vitest";
import {
  PROGRES_KOSONG, bacaSegmen, detikUnik, gabungSegmen, idYoutube, periksaLaporan, periksaMateri, persenProgres, ringkasMateri, terapkanLaporan, videoSelesai,
  type Progres, type Segmen,
} from "../sigapMateri";

const T0 = new Date("2026-11-09T04:00:00Z").getTime();
const lap = (segmen: Segmen[], durasi: number | null = 100) => ({ materi_id: 1, segmen, durasi });

describe("idYoutube", () => {
  const ID = "dQw4w9WgXcQ";
  it("bentuk tautan yang umum", () => {
    for (const u of [`https://youtu.be/${ID}`, `https://www.youtube.com/watch?v=${ID}&t=10s`, `https://m.youtube.com/watch?v=${ID}`, `https://www.youtube.com/embed/${ID}`, `https://youtube.com/shorts/${ID}?feature=share`, `https://www.youtube.com/live/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`, `  https://youtu.be/${ID}  `]) expect(idYoutube(u)).toBe(ID);
  });
  it("selain YouTube / tidak sah = null", () => {
    for (const u of ["https://vimeo.com/123456789", "https://youtube.com/watch?v=pendek", "https://youtube.com/", "javascript:alert(1)", "bukan tautan", "https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"]) expect(idYoutube(u)).toBeNull();
  });
});

describe("periksaMateri", () => {
  it("video YouTube sah, durasi dibulatkan, wajib hanya bila true", () => {
    const r = periksaMateri({ jenis: "video", judul: "  Pengantar   Seruti ", url: "https://youtu.be/dQw4w9WgXcQ", durasi_detik: 600.4, wajib: true, urutan: 2 });
    expect(r).toEqual({ ok: true, materi: { id: null, jenis: "video", judul: "Pengantar Seruti", url: "https://youtu.be/dQw4w9WgXcQ", youtube_id: "dQw4w9WgXcQ", durasi_detik: 600, wajib: true, urutan: 2 } });
    expect((periksaMateri({ jenis: "video", judul: "Abc", url: "https://youtu.be/dQw4w9WgXcQ", wajib: "ya" }) as { materi: { wajib: boolean } }).materi.wajib).toBe(false);
  });
  it("video bukan YouTube ditolak; tautan biasa boleh dan tidak punya youtube_id / durasi", () => {
    expect(periksaMateri({ jenis: "video", judul: "Abc", url: "https://vimeo.com/1" }).ok).toBe(false);
    const t = periksaMateri({ jenis: "tautan", judul: "Buku pedoman", url: "https://drive.google.com/x", durasi_detik: 300 });
    expect(t).toMatchObject({ ok: true, materi: { jenis: "tautan", youtube_id: null, durasi_detik: null } });
  });
  it("judul, tautan, jenis, durasi diperiksa", () => {
    expect(periksaMateri({ jenis: "audio", judul: "Abc", url: "https://x.id" }).ok).toBe(false);
    expect(periksaMateri({ jenis: "tautan", judul: "ab", url: "https://x.id" }).ok).toBe(false);
    expect(periksaMateri({ jenis: "tautan", judul: "Abc", url: "" }).ok).toBe(false);
    expect(periksaMateri({ jenis: "tautan", judul: "Abc", url: "ftp://x.id" }).ok).toBe(false);
    expect(periksaMateri({ jenis: "tautan", judul: "Abc", url: "javascript:alert(1)" }).ok).toBe(false);
    expect(periksaMateri({ jenis: "tautan", judul: "x".repeat(161), url: "https://x.id" }).ok).toBe(false);
    expect(periksaMateri({ jenis: "video", judul: "Abc", url: "https://youtu.be/dQw4w9WgXcQ", durasi_detik: 2 }).ok).toBe(false);
    expect(periksaMateri({ jenis: "video", judul: "Abc", url: "https://youtu.be/dQw4w9WgXcQ", durasi_detik: 99999 }).ok).toBe(false);
    expect(periksaMateri(null).ok).toBe(false);
  });
  it("id hanya bilangan bulat positif", () => {
    expect((periksaMateri({ id: 5, jenis: "tautan", judul: "Abc", url: "https://x.id" }) as { materi: { id: number } }).materi.id).toBe(5);
    expect((periksaMateri({ id: -1, jenis: "tautan", judul: "Abc", url: "https://x.id" }) as { materi: { id: number | null } }).materi.id).toBeNull();
  });
});

describe("segmen", () => {
  it("gabungSegmen: tumpang tindih, bersentuhan, celah <= 1 detik, urutan, sampah dibuang", () => {
    expect(gabungSegmen([[10, 20], [0, 5], [5, 8], [19, 30], [31, 40]])).toEqual([[0, 8], [10, 40]]);
    expect(gabungSegmen([[5, 5], [8, 3], [NaN, 4]] as unknown as Segmen[])).toEqual([]);
  });
  it("detikUnik tidak menghitung dua kali bagian yang diputar ulang", () => {
    expect(detikUnik([[0, 10], [5, 15], [0, 10]])).toBe(15);
  });
  it("bacaSegmen aman terhadap data rusak", () => {
    expect(bacaSegmen("x")).toEqual([]);
    expect(bacaSegmen([[0, 5], "a", [1], [2, "b"], [3, 9]])).toEqual([[0, 9]]);
  });
});

describe("periksaLaporan", () => {
  it("sah", () => expect(periksaLaporan({ materi_id: 3, segmen: [[0, 5], [10, 15]], durasi: 120.2 })).toEqual({ ok: true, laporan: { materi_id: 3, segmen: [[0, 5], [10, 15]], durasi: 120 } }));
  it("menolak: tanpa segmen, terlalu banyak, terbalik, negatif, terlalu panjang, durasi aneh, id salah", () => {
    expect(periksaLaporan({ materi_id: 3, segmen: [] }).ok).toBe(false);
    expect(periksaLaporan({ materi_id: 3, segmen: Array.from({ length: 7 }, (_, i) => [i * 10, i * 10 + 2]) }).ok).toBe(false);
    expect(periksaLaporan({ materi_id: 3, segmen: [[5, 5]] }).ok).toBe(false);
    expect(periksaLaporan({ materi_id: 3, segmen: [[-1, 5]] }).ok).toBe(false);
    expect(periksaLaporan({ materi_id: 3, segmen: [[0, 31]] }).ok).toBe(false);
    expect(periksaLaporan({ materi_id: 3, segmen: [[0, 5]], durasi: 1 }).ok).toBe(false);
    expect(periksaLaporan({ materi_id: 0, segmen: [[0, 5]] }).ok).toBe(false);
    expect(periksaLaporan(null).ok).toBe(false);
  });
});

describe("videoSelesai", () => {
  it("butuh >= 95% DAN bagian akhir (95% tanpa akhir = belum)", () => {
    expect(videoSelesai([[0, 95]], 100)).toBe(false); // 95% tetapi akhir belum
    expect(videoSelesai([[0, 94], [97, 100]], 100)).toBe(true); // unik 97 (>= 95) dan akhir tercapai
  });
  it("kasus sah", () => {
    expect(videoSelesai([[0, 100]], 100)).toBe(true);
    expect(videoSelesai([[0, 60], [62, 100]], 100)).toBe(true); // celah 2 detik: unik 98
    expect(videoSelesai([[0, 90], [97, 100]], 100)).toBe(false); // unik 93
    expect(videoSelesai([[0, 100]], null)).toBe(false);
    expect(videoSelesai([], 100)).toBe(false);
  });
});

describe("terapkanLaporan", () => {
  it("laporan pertama menambah detik unik, belum selesai", () => {
    const h = terapkanLaporan(PROGRES_KOSONG(), lap([[0, 10]]), 100, T0);
    expect(h.progres.detik_unik).toBe(10);
    expect(h.progres.selesai_at).toBeNull();
    expect(h.ditambah).toBe(10);
    expect(h.progres.putar_terakhir_at).toBe(new Date(T0).toISOString());
  });
  it("laporan pertama dibatasi 30 detik walau klien melaporkan banyak bagian", () => {
    const h = terapkanLaporan(PROGRES_KOSONG(), lap([[0, 30], [40, 70], [80, 100]]), 200, T0);
    expect(h.progres.detik_unik).toBeLessThanOrEqual(30);
    expect(h.dipangkas).toBe(true);
  });
  it("laju dibatasi waktu nyata: 5 detik berlalu hanya mengizinkan ~14 detik (1,25 x 5 + 8)", () => {
    const awal: Progres = { ...PROGRES_KOSONG(), segmen: [[0, 10]], detik_unik: 10, putar_terakhir_at: new Date(T0).toISOString() };
    const h = terapkanLaporan(awal, lap([[10, 40]]), 100, T0 + 5000);
    expect(h.ditambah).toBeLessThanOrEqual(14);
    expect(h.ditambah).toBeGreaterThanOrEqual(13);
    expect(h.dipangkas).toBe(true);
  });
  it("memutar normal tiap 5 detik lolos tanpa dipangkas", () => {
    let p = terapkanLaporan(PROGRES_KOSONG(), lap([[0, 5]]), 100, T0).progres;
    for (let i = 1; i < 10; i++) {
      const h = terapkanLaporan(p, lap([[i * 5, i * 5 + 5]]), 100, T0 + i * 5000);
      expect(h.dipangkas).toBe(false);
      p = h.progres;
    }
    expect(p.detik_unik).toBe(50);
  });
  it("memutar ulang bagian yang sama tidak menambah detik unik", () => {
    const awal: Progres = { ...PROGRES_KOSONG(), segmen: [[0, 20]], detik_unik: 20, putar_terakhir_at: new Date(T0).toISOString() };
    const h = terapkanLaporan(awal, lap([[5, 15]]), 100, T0 + 60_000);
    expect(h.ditambah).toBe(0);
    expect(h.progres.detik_unik).toBe(20);
  });
  it("bagian melewati durasi dipotong; seluruhnya di luar durasi diabaikan", () => {
    const h = terapkanLaporan(PROGRES_KOSONG(), lap([[95, 120], [150, 160]]), 100, T0);
    expect(h.progres.segmen).toEqual([[95, 100]]);
  });
  it("menonton sampai habis -> selesai_baru, selesai_at terisi", () => {
    let p: Progres = PROGRES_KOSONG();
    let selesai = false;
    for (let i = 0; i < 20; i++) {
      const h = terapkanLaporan(p, lap([[i * 5, i * 5 + 5]]), 100, T0 + i * 5000);
      p = h.progres;
      selesai = selesai || h.selesai_baru;
    }
    expect(selesai).toBe(true);
    expect(p.selesai_at).not.toBeNull();
    expect(p.detik_unik).toBe(100);
  });
  it("melompat ke akhir tidak menyelesaikan video", () => {
    const h = terapkanLaporan(PROGRES_KOSONG(), lap([[90, 100]]), 100, T0);
    expect(h.progres.selesai_at).toBeNull();
  });
  it("sudah selesai: laporan lanjutan tidak mengubah apa pun", () => {
    const sudah: Progres = { ...PROGRES_KOSONG(), segmen: [[0, 100]], detik_unik: 100, selesai_at: "2026-11-09T03:00:00.000Z" };
    const h = terapkanLaporan(sudah, lap([[0, 5]]), 100, T0);
    expect(h.progres).toBe(sudah);
    expect(h.selesai_baru).toBe(false);
  });
  it("durasi tidak diketahui: detik terkumpul tetapi tidak pernah selesai", () => {
    const h = terapkanLaporan(PROGRES_KOSONG(), lap([[0, 20]], null), null, T0);
    expect(h.progres.detik_unik).toBe(20);
    expect(h.progres.selesai_at).toBeNull();
  });
});

describe("ringkasan", () => {
  const materi = [
    { id: 1, jenis: "video" as const, wajib: true, durasi_detik: 100 },
    { id: 2, jenis: "tautan" as const, wajib: true, durasi_detik: null },
    { id: 3, jenis: "tautan" as const, wajib: false, durasi_detik: null },
  ];
  const sel = (manual = false): Progres => ({ ...PROGRES_KOSONG(), selesai_at: "2026-11-09T03:00:00.000Z", selesai_manual: manual });
  it("hanya materi wajib yang dihitung", () => {
    expect(ringkasMateri(materi, new Map())).toMatchObject({ wajib_total: 2, wajib_selesai: 0, belum: 2, video_wajib_ada: true, video_wajib_tuntas: false, ada_manual: false });
  });
  it("video tuntas tetapi tautan belum: video_wajib_tuntas true, belum 1", () => {
    expect(ringkasMateri(materi, new Map([[1, sel()]]))).toMatchObject({ wajib_selesai: 1, belum: 1, video_wajib_tuntas: true });
  });
  it("manual ditandai; semua selesai", () => {
    const r = ringkasMateri(materi, { 1: sel(true), 2: sel() });
    expect(r).toMatchObject({ belum: 0, ada_manual: true });
  });
  it("tanpa video wajib: video_wajib_ada false dan video_wajib_tuntas true (tidak mengunci)", () => {
    expect(ringkasMateri([materi[1], materi[2]], new Map())).toMatchObject({ video_wajib_ada: false, video_wajib_tuntas: true });
  });
  it("persenProgres", () => {
    expect(persenProgres(materi[0], { ...PROGRES_KOSONG(), detik_unik: 50 })).toBe(50);
    expect(persenProgres(materi[0], { ...PROGRES_KOSONG(), detik_unik: 99 })).toBe(99);
    expect(persenProgres(materi[0], sel())).toBe(100);
    expect(persenProgres(materi[0], null)).toBe(0);
    expect(persenProgres(materi[1], null)).toBe(0);
  });
});
