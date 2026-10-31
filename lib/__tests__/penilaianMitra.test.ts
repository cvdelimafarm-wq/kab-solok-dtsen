import { describe, expect, it } from "vitest";
import { buatKode, cocokkanMitra, normalNama, periksaBanyak, periksaKolomBaru, periksaNilai, rataRata, uraiTempel } from "../penilaianMitra";

describe("rataRata", () => {
  it("rata-rata satu desimal, abaikan kosong/tak sah", () => {
    expect(rataRata([4, 5])).toBe(4.5);
    expect(rataRata([4, null, undefined, 3])).toBe(3.5);
    expect(rataRata([1, 2, 2])).toBe(1.7);
    expect(rataRata([])).toBeNull();
    expect(rataRata([null, 9, 0])).toBeNull();
  });
});

describe("buatKode", () => {
  it("huruf besar dan minus", () => {
    expect(buatKode("Sakernas TW IV")).toBe("SAKERNAS-TW-IV");
    expect(buatKode("  Seruti (TW-4) 2026 ")).toBe("SERUTI-TW-4-2026");
    expect(buatKode("Kégiatan Ünik")).toBe("KEGIATAN-UNIK");
    expect(buatKode("!!!")).toBeNull();
  });
  it("maks 40 karakter tanpa minus di ujung", () => {
    const k = buatKode("a".repeat(39) + " b cde")!;
    expect(k.length).toBeLessThanOrEqual(40);
    expect(k.endsWith("-")).toBe(false);
  });
});

describe("periksaKolomBaru", () => {
  it("nama bebas", () => {
    expect(periksaKolomBaru({ nama: "Survei X" }, null)).toEqual({ ok: true, nilai: { nama: "Survei X", kode: "SURVEI-X", kegiatan_id: null } });
  });
  it("kegiatan terpilih: nama dan kode dari kegiatan bila nama kosong", () => {
    expect(periksaKolomBaru({}, { id: 3, nama: "Sakernas TW IV", kode: "SAK-TW4" })).toEqual({ ok: true, nilai: { nama: "Sakernas TW IV", kode: "SAK-TW4", kegiatan_id: 3 } });
    expect(periksaKolomBaru({ nama: "Nama lain" }, { id: 3, nama: "Sakernas TW IV" })).toMatchObject({ ok: true, nilai: { nama: "Nama lain", kode: "SAKERNAS-TW-IV", kegiatan_id: 3 } });
  });
  it("menolak kosong, terlalu panjang, simbol", () => {
    expect(periksaKolomBaru({}, null).ok).toBe(false);
    expect(periksaKolomBaru({ nama: "x".repeat(121) }, null).ok).toBe(false);
    expect(periksaKolomBaru({ nama: "<b>x</b>" }, null).ok).toBe(false);
    expect(periksaKolomBaru({ nama: "---" }, null).ok).toBe(false);
  });
});

describe("periksaNilai", () => {
  it("menerima nilai 1-5 dan catatan", () => {
    expect(periksaNilai({ kolom_id: 1, akun_id: 2, nilai: 4, catatan: "  bagus  " })).toEqual({ ok: true, nilai: { kolom_id: 1, akun_id: 2, nilai: 4, catatan: "bagus" } });
  });
  it("nilai null = hapus (catatan dibuang)", () => {
    expect(periksaNilai({ kolom_id: 1, akun_id: 2, nilai: null, catatan: "x" })).toEqual({ ok: true, nilai: { kolom_id: 1, akun_id: 2, nilai: null, catatan: null } });
  });
  it("menolak nilai di luar 1-5, pecahan, teks", () => {
    for (const nilai of [0, 6, 3.5, "4", NaN]) expect(periksaNilai({ kolom_id: 1, akun_id: 2, nilai }).ok).toBe(false);
  });
  it("menolak id tak sah dan catatan kepanjangan", () => {
    expect(periksaNilai({ kolom_id: 0, akun_id: 2, nilai: 3 }).ok).toBe(false);
    expect(periksaNilai({ kolom_id: 1, akun_id: "2", nilai: 3 }).ok).toBe(false);
    expect(periksaNilai({ kolom_id: 1, akun_id: 2, nilai: 3, catatan: "x".repeat(501) }).ok).toBe(false);
  });
});

describe("periksaBanyak", () => {
  it("akun kembar hanya diambil sekali", () => {
    const r = periksaBanyak({ kolom_id: 1, baris: [{ akun_id: 5, nilai: 4 }, { akun_id: 5, nilai: 2 }, { akun_id: 6, nilai: 5, catatan: "ok" }] });
    expect(r).toEqual({ ok: true, kolom_id: 1, baris: [{ akun_id: 5, nilai: 4, catatan: null }, { akun_id: 6, nilai: 5, catatan: "ok" }] });
  });
  it("menolak kosong, kebanyakan, dan baris tanpa nilai", () => {
    expect(periksaBanyak({ kolom_id: 1, baris: [] }).ok).toBe(false);
    expect(periksaBanyak({ kolom_id: 1, baris: Array.from({ length: 501 }, (_, i) => ({ akun_id: i + 1, nilai: 3 })) }).ok).toBe(false);
    expect(periksaBanyak({ kolom_id: 1, baris: [{ akun_id: 1, nilai: null }] }).ok).toBe(false);
  });
});

describe("uraiTempel", () => {
  it("tab, lewati baris judul, catatan opsional", () => {
    const r = uraiTempel("NIK\tNilai\tCatatan\n1303010101010001\t4\tcekatan\n1303010101010002\t5\n");
    expect(r.galat).toEqual([]);
    expect(r.baris).toEqual([
      { kunci: "1303010101010001", nilai: 4, catatan: "cekatan", baris_ke: 2 },
      { kunci: "1303010101010002", nilai: 5, catatan: null, baris_ke: 3 },
    ]);
  });
  it("titik koma dan koma, nilai '4.0'", () => {
    expect(uraiTempel("Ani Putri;3").baris[0]).toMatchObject({ kunci: "Ani Putri", nilai: 3 });
    expect(uraiTempel("Budi,4.0").baris[0]).toMatchObject({ kunci: "Budi", nilai: 4 });
  });
  it("baris tak sah dilaporkan tanpa membatalkan yang lain", () => {
    const r = uraiTempel("Ani\t4\nBudi\t9\nCitra\tbagus\n\t3\nDedi\t2");
    expect(r.baris.map((b) => b.kunci)).toEqual(["Ani", "Dedi"]);
    expect(r.galat.map((g) => g.baris_ke)).toEqual([2, 3, 4]);
  });
});

describe("cocokkanMitra", () => {
  const mitra = [
    { id: 1, nama: "Ani Putri", nik: "1303010101010001" },
    { id: 2, nama: "Budi Santoso", nik: "1303010101010002" },
    { id: 3, nama: "Sari", nik: null },
    { id: 4, nama: "sari", nik: null },
  ];
  it("NIK utuh dan nama persis", () => {
    const h = cocokkanMitra(uraiTempel("1303010101010002\t5\nani  putri\t3").baris, mitra);
    expect(h.cocok.map((c) => [c.akun_id, c.nilai])).toEqual([[2, 5], [1, 3]]);
    expect(h.tidak_cocok).toEqual([]);
  });
  it("nama kembar = ambigu, tak dikenal = tidak cocok", () => {
    const h = cocokkanMitra(uraiTempel("Sari\t4\nOrang Lain\t2\n9999999999999999\t1").baris, mitra);
    expect(h.ambigu.map((x) => x.kunci)).toEqual(["Sari"]);
    expect(h.tidak_cocok.map((x) => x.kunci)).toEqual(["Orang Lain", "9999999999999999"]);
    expect(h.cocok).toEqual([]);
  });
  it("Mitra yang sama dua kali hanya dihitung sekali (baris pertama)", () => {
    const h = cocokkanMitra(uraiTempel("Ani Putri\t3\nAni Putri\t5").baris, mitra);
    expect(h.cocok).toHaveLength(1);
    expect(h.cocok[0].nilai).toBe(3);
  });
  it("normalNama", () => {
    expect(normalNama(" Ani,  Putri. ")).toBe("ani putri");
  });
});
