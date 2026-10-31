import { describe, expect, it } from "vitest";
import { bersihkanBarisAnomali, cocokkanNama, kemiripan, kunciTemuan, normNama, petaBarisAnomali, petaKolomAnomali, pmlTerbanyak, ringkasTemuan, templatAnomali, validasiKonfirmasi } from "@/lib/sigapAnomali";

describe("petaKolomAnomali", () => {
  it("mengenali judul baku dan alias; kolom lain bukan medan baku", () => {
    const k = petaKolomAnomali(["ID Anggota", "Kode Temuan", "ID Sampel", "Periode", "Keterangan", "Nilai RT"]);
    expect(k).toEqual({ id_anggota: "ID Anggota", kode: "Kode Temuan", id_sampel: "ID Sampel", periode: "Periode", keterangan: "Keterangan" });
    expect(petaKolomAnomali(["Nama Petugas", "Kode Anomali", "NKS"])).toMatchObject({ id_anggota: "Nama Petugas", kode: "Kode Anomali", id_sampel: "NKS" });
  });
});

describe("petaBarisAnomali", () => {
  const judul = { "ID Anggota": "", "Kode Temuan": "", "ID Sampel": "", Periode: "", Keterangan: "", "Nilai RT": "" };
  const b = (o: Record<string, string>) => ({ ...judul, ...o });
  it("memetakan baris, merapikan kode, menyimpan kolom lain sebagai rincian, melewati baris kosong", () => {
    const h = petaBarisAnomali([b({ "ID Anggota": "Budi Santoso", "Kode Temuan": " kp-02 ", "ID Sampel": "NKS 1", "Nilai RT": "9000000" }), b({})], "2026-09");
    expect(h.galat).toEqual([]);
    expect(h.dilewati).toBe(1);
    expect(h.baris).toEqual([{ id_anggota: "Budi Santoso", kode: "KP-02", id_sampel: "NKS 1", periode: "2026-09", keterangan: null, rincian: { "Nilai RT": "9000000" } }]);
    expect(h.kolomRincian).toEqual(["Nilai RT"]);
  });
  it("galat: kolom wajib hilang, id/kode kosong, berkas kosong, terlalu banyak", () => {
    expect(petaBarisAnomali([{ A: "x", B: "y" }]).galat[0].pesan).toMatch(/Kolom tidak ditemukan/);
    const h = petaBarisAnomali([b({ "Kode Temuan": "KP-01" }), b({ "ID Anggota": "A" })]);
    expect(h.galat.map((g) => [g.baris, g.pesan])).toEqual([[2, "ID Anggota kosong."], [3, "Kode Temuan kosong."]]);
    expect(petaBarisAnomali([]).galat[0].baris).toBe(0);
    expect(petaBarisAnomali(Array.from({ length: 2001 }, () => b({ "ID Anggota": "A", "Kode Temuan": "K" }))).galat[0].pesan).toMatch(/Terlalu banyak/);
  });
  it("templat memuat judul baku dan dapat dibaca kembali", () => {
    const t = templatAnomali();
    const objek = t.slice(1).map((r) => Object.fromEntries(t[0].map((j, i) => [j, r[i]])));
    expect(petaBarisAnomali(objek).baris.length).toBe(2);
  });
});

describe("normNama", () => {
  it("membuang gelar, tanda baca, aksen, dan merapikan spasi", () => {
    expect(normNama("Arini Alva Syaadah, S.Tr.Stat.")).toBe("arini alva syaadah");
    expect(normNama("  Dr.  Ir. Hj. Siti   Nurhaliza, M.Si ")).toBe("siti nurhaliza");
    expect(normNama("Ayu Sepriani, S.E.")).toBe("ayu sepriani");
    expect(normNama("Dina Marizka, S.Tr.Stat.")).toBe("dina marizka");
    expect(normNama("M. Iqbal Hadi")).toBe("m iqbal hadi");
    expect(normNama("Rina A")).toBe("rina a");
    expect(normNama("Café  Ünik")).toBe("cafe unik");
    expect(normNama("Ayu Sepriani")).toBe("ayu sepriani");
  });
  it("tidak menghabiskan nama satu kata", () => {
    expect(normNama("Adriyanto")).toBe("adriyanto");
    expect(normNama("S.E.")).not.toBe("");
    expect(normNama("Hj")).not.toBe("");
  });
});

describe("cocokkanNama", () => {
  const akun = [
    { id: 1, nama: "Ayu Sepriani" },
    { id: 2, nama: "Budi Pernandes" },
    { id: 3, nama: "Budi Pernandes" },
    { id: 4, nama: "Arini Alva Syaadah, S.Tr.Stat." },
    { id: 5, nama: "Siti Nur Halimah" },
  ];
  it("ID akun angka yang ada -> cocok cara id", () => expect(cocokkanNama("4", akun)).toEqual({ status: "cocok", akunId: 4, cara: "id" }));
  it("ID akun angka yang tidak ada jatuh ke pencocokan nama", () => expect(cocokkanNama("999", akun)).toEqual({ status: "tidak", saran: [] }));
  it("nama persis (abaikan gelar/huruf besar) -> cocok", () => {
    expect(cocokkanNama("AYU SEPRIANI", akun)).toEqual({ status: "cocok", akunId: 1, cara: "nama" });
    expect(cocokkanNama("Arini Alva Syaadah", akun)).toEqual({ status: "cocok", akunId: 4, cara: "nama" });
  });
  it("dua akun bernama sama -> ambigu", () => expect(cocokkanNama("Budi Pernandes", akun)).toEqual({ status: "ambigu", kandidat: [2, 3] }));
  it("alias mengalahkan nama; alias ke akun yang tidak ada diabaikan", () => {
    expect(cocokkanNama("Budi Pernandes", akun, new Map([["budi pernandes", 3]]))).toEqual({ status: "cocok", akunId: 3, cara: "alias" });
    expect(cocokkanNama("Siti N", akun, new Map([["siti n", 77]]))).toMatchObject({ status: "tidak" });
  });
  it("tidak ketemu -> saran nama mirip, kosong bila tak ada", () => {
    const h = cocokkanNama("Siti Nur", akun);
    expect(h).toMatchObject({ status: "tidak" });
    expect(h.status === "tidak" && h.saran).toEqual([5]);
    expect(cocokkanNama("Orang Asing Sekali", akun)).toEqual({ status: "tidak", saran: [] });
    expect(cocokkanNama("   ", akun)).toEqual({ status: "tidak", saran: [] });
  });
  it("kemiripan simetris dan dalam 0..1", () => {
    expect(kemiripan("ab cd ef", "ab cd ef")).toBe(1);
    expect(kemiripan("ab cd", "ef gh")).toBe(0);
    expect(kemiripan("budi santoso", "santoso budi")).toBe(1);
  });
});

describe("kunciTemuan", () => {
  it("sama untuk variasi penulisan nama; berbeda bila kode/sampel/periode beda", () => {
    const a = kunciTemuan(3, "Ayu Sepriani, S.E.", "KP-02", "NKS 1", "2026-09");
    expect(a).toBe(kunciTemuan(3, "ayu  sepriani", "KP-02", "nks 1", "2026-09"));
    expect(a).not.toBe(kunciTemuan(3, "Ayu Sepriani", "KP-03", "NKS 1", "2026-09"));
    expect(a).not.toBe(kunciTemuan(3, "Ayu Sepriani", "KP-02", "NKS 2", "2026-09"));
    expect(a).not.toBe(kunciTemuan(4, "Ayu Sepriani", "KP-02", "NKS 1", "2026-09"));
  });
});

describe("validasiKonfirmasi", () => {
  it("penyebab wajib; lainnya wajib catatan; catatan maks 500", () => {
    expect(validasiKonfirmasi({ penyebab: "salah_catat", catatan: " perlu  diperbaiki " })).toEqual({ ok: true, data: { penyebab: "salah_catat", catatan: "perlu diperbaiki" } });
    expect(validasiKonfirmasi({ penyebab: "kondisi_benar" })).toEqual({ ok: true, data: { penyebab: "kondisi_benar", catatan: null } });
    expect(validasiKonfirmasi({ penyebab: "" }).ok).toBe(false);
    expect(validasiKonfirmasi({ penyebab: "ngarang" }).ok).toBe(false);
    expect(validasiKonfirmasi({ penyebab: "lainnya", catatan: "ya" }).ok).toBe(false);
    expect(validasiKonfirmasi({ penyebab: "salah_catat", catatan: "x".repeat(501) }).ok).toBe(false);
    expect(validasiKonfirmasi(null).ok).toBe(false);
  });
});

describe("pmlTerbanyak & ringkasTemuan", () => {
  it("memilih PML tersering untuk PPL; null bila tak ada", () => {
    const b = [
      { ppl_akun_id: 1, pml_akun_id: 10 },
      { ppl_akun_id: 1, pml_akun_id: 11 },
      { ppl_akun_id: 1, pml_akun_id: 11 },
      { ppl_akun_id: 2, pml_akun_id: 12 },
      { ppl_akun_id: 3, pml_akun_id: null },
    ];
    expect(pmlTerbanyak(b, 1)).toBe(11);
    expect(pmlTerbanyak(b, 3)).toBeNull();
    expect(pmlTerbanyak(b, 99)).toBeNull();
  });
  it("menghitung status", () => {
    expect(ringkasTemuan([{ status: "menunggu" }, { status: "menunggu" }, { status: "perlu_cocok" }, { status: "dikonfirmasi" }, { status: "x" }])).toEqual({ total: 5, perlu_cocok: 1, menunggu: 2, dikonfirmasi: 1 });
  });
});

describe("bersihkanBarisAnomali", () => {
  it("merapikan, memangkas, menolak kosong/berlebih", () => {
    const h = bersihkanBarisAnomali([{ id_anggota: " Budi ", kode: " kp 02 ", id_sampel: "", rincian: { a: " 1 ", b: "" } }]);
    expect(h).toEqual({ ok: true, baris: [{ id_anggota: "Budi", kode: "KP02", id_sampel: null, periode: null, keterangan: null, rincian: { a: "1" } }] });
    expect(bersihkanBarisAnomali([]).ok).toBe(false);
    expect(bersihkanBarisAnomali("x").ok).toBe(false);
    expect(bersihkanBarisAnomali([{ id_anggota: "", kode: "K" }]).ok).toBe(false);
    expect(bersihkanBarisAnomali([{ id_anggota: "A", kode: "K".repeat(41) }]).ok).toBe(false);
    expect(bersihkanBarisAnomali(Array.from({ length: 2001 }, () => ({ id_anggota: "A", kode: "K" }))).ok).toBe(false);
  });
});
