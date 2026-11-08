// lib/__tests__/sigapAgenda.test.ts
// (9 Nov 2026) Agenda hari H: tes dimulai instruktur (jendela, status, batas pengerjaan, hasil langsung).
import { describe, expect, it } from "vitest";
import { aksiAgendaSah, aksiTersedia, peringatanMulai, statusAgenda, tesDenganAgenda, tutupJendela } from "../sigapAgenda";
import { batasPengerjaan, hasilBolehTampil, hitungBatas, statusTes, type TesBaris } from "../sigapTes";

const MULAI = "2026-11-09T01:05:00.000Z"; // 08.05 WIB
const menit = (m: number) => new Date(new Date(MULAI).getTime() + m * 60_000);
const tes: TesBaris = {
  id: 19, kegiatan_id: 7, jenis: "pretest", judul: "Pretest", buka_at: "2026-11-09T00:00:00.000Z", durasi_menit: 15, tutup_at: "2026-11-09T15:00:00.000Z", aktif: true, ulang_maks: 1,
};
const baru = { mulai_at: null, selesai_at: null, jendela_menit: 30 };
const jalan = { mulai_at: MULAI, selesai_at: null, jendela_menit: 30 };

describe("jendela dan status agenda", () => {
  it("belum dimulai = menunggu, tanpa penutupan", () => {
    expect(tutupJendela(baru)).toBeNull();
    expect(statusAgenda(baru, menit(0))).toBe("menunggu");
  });
  it("dimulai: berjalan sampai Mulai + jendela, lalu selesai", () => {
    expect(tutupJendela(jalan)).toBe(menit(30).toISOString());
    expect(statusAgenda(jalan, menit(1))).toBe("berjalan");
    expect(statusAgenda(jalan, menit(29.9))).toBe("berjalan");
    expect(statusAgenda(jalan, menit(30))).toBe("selesai");
  });
  it("Selesai ditekan lebih awal menutup jendela saat itu juga", () => {
    const a = { ...jalan, selesai_at: menit(10).toISOString() };
    expect(tutupJendela(a)).toBe(menit(10).toISOString());
    expect(statusAgenda(a, menit(9))).toBe("berjalan");
    expect(statusAgenda(a, menit(10))).toBe("selesai");
  });
  it("Selesai yang ditekan sesudah jendela habis tidak memperpanjang", () => {
    expect(tutupJendela({ ...jalan, selesai_at: menit(50).toISOString() })).toBe(menit(30).toISOString());
  });
  it("aksi yang tersedia mengikuti status", () => {
    expect(aksiTersedia("menunggu")).toEqual(["mulai"]);
    expect(aksiTersedia("berjalan")).toEqual(["selesai"]);
    expect(aksiTersedia("selesai")).toEqual(["buka_lagi"]);
    expect(aksiAgendaSah("mulai") && aksiAgendaSah("selesai") && aksiAgendaSah("buka_lagi")).toBe(true);
    expect(aksiAgendaSah("hapus")).toBe(false);
    expect(aksiAgendaSah(null)).toBe(false);
  });
});

describe("tesDenganAgenda", () => {
  it("tanpa agenda sama sekali: tes apa adanya (objek sama)", () => {
    expect(tesDenganAgenda(tes, null, false)).toBe(tes);
  });
  it("ada agenda tetapi kelas peserta tidak punya baris: menunggu (tidak terbuka sendiri lewat jadwal)", () => {
    const t = tesDenganAgenda(tes, null, true);
    expect(t.agenda).toEqual({ menunggu: true, mulai_at: null, tutup_at: null });
    expect(statusTes(t, 50, null, menit(5))).toBe("belum_buka");
  });
  it("belum dimulai instruktur: belum_buka walau jadwal sudah lewat; Posttest dan Pretest sama-sama menunggu", () => {
    const t = tesDenganAgenda(tes, baru, true);
    expect(statusTes(t, 50, null, menit(5))).toBe("belum_buka");
    expect(statusTes({ ...t, aktif: false }, 50, null, menit(5))).toBe("nonaktif"); // "Tarik tes dari peserta" tetap menang
    expect(statusTes(t, 0, null, menit(5))).toBe("soal_belum_ada");
  });
  it("sesudah Mulai: buka sampai jendela habis, lalu terlewat bagi yang belum mulai", () => {
    const t = tesDenganAgenda(tes, jalan, true);
    expect(t.buka_at).toBe(MULAI);
    expect(t.tutup_at).toBe(menit(30).toISOString());
    expect(statusTes(t, 50, null, menit(1))).toBe("buka");
    expect(statusTes(t, 50, null, menit(30))).toBe("terlewat");
  });
  it("Mulai lebih awal dari jadwal tes diperbolehkan", () => {
    const awal = tesDenganAgenda({ ...tes, buka_at: "2026-11-09T05:00:00.000Z" }, jalan, true);
    expect(statusTes(awal, 50, null, menit(1))).toBe("buka");
  });
});

describe("batas pengerjaan: sama untuk semua, tidak dipotong jendela", () => {
  const t = tesDenganAgenda(tes, jalan, true);
  it("mulai di awal dan di menit terakhir jendela sama-sama mendapat 15 menit penuh", () => {
    expect(batasPengerjaan(t, menit(1)).toISOString()).toBe(menit(16).toISOString());
    expect(batasPengerjaan(t, menit(29)).toISOString()).toBe(menit(44).toISOString()); // lewat penutupan jendela, tetap 15 menit
  });
  it("tes biasa tetap dipotong tutup_at (perilaku lama)", () => {
    expect(batasPengerjaan(tes, new Date("2026-11-09T14:55:00.000Z")).toISOString()).toBe("2026-11-09T15:00:00.000Z");
    expect(batasPengerjaan(tes, menit(1)).toISOString()).toBe(hitungBatas(menit(1), 15, tes.tutup_at).toISOString());
  });
  it("menunggu instruktur: memakai aturan lama (tidak dipakai karena mulai ditolak)", () => {
    const m = tesDenganAgenda(tes, baru, true);
    expect(batasPengerjaan(m, menit(1)).toISOString()).toBe(hitungBatas(menit(1), 15, tes.tutup_at).toISOString());
  });
});

describe("status peserta yang sudah mulai", () => {
  const t = tesDenganAgenda(tes, jalan, true);
  const sesi = { batas_at: menit(16).toISOString(), selesai_at: null as string | null };
  it("mengerjakan lalu selesai (kirim atau waktu habis) tidak bergantung jendela", () => {
    expect(statusTes(t, 50, sesi, menit(10))).toBe("mengerjakan");
    expect(statusTes(t, 50, { ...sesi, selesai_at: menit(12).toISOString() }, menit(13))).toBe("selesai");
    expect(statusTes(t, 50, sesi, menit(17))).toBe("selesai");
    expect(statusTes(t, 50, sesi, menit(40))).toBe("selesai"); // jendela sudah tutup, sesi tetap sah
  });
});

describe("hasil tampil segera pada tes dimulai instruktur", () => {
  it("tes berjadwal biasa: tetap menunggu tutup_at", () => {
    expect(hasilBolehTampil(tes, menit(1))).toBe(false);
    expect(hasilBolehTampil(tes, new Date("2026-11-09T15:00:00.000Z"))).toBe(true);
  });
  it("tes dengan agenda: tampil begitu peserta selesai (jendela belum tutup pun)", () => {
    expect(hasilBolehTampil(tesDenganAgenda(tes, jalan, true), menit(1))).toBe(true);
  });
});

describe("peringatan urutan", () => {
  it("Posttest sebelum Pretest selesai diberi peringatan, bukan diblokir", () => {
    expect(peringatanMulai("posttest", [{ jenis: "pretest", status: "menunggu" }, { jenis: "posttest", status: "menunggu" }])).toMatch(/belum dimulai/);
    expect(peringatanMulai("posttest", [{ jenis: "pretest", status: "berjalan" }])).toMatch(/masih berjalan/);
  });
  it("tanpa peringatan bila Pretest selesai, tidak ada Pretest, atau yang dimulai Pretest", () => {
    expect(peringatanMulai("posttest", [{ jenis: "pretest", status: "selesai" }])).toBeNull();
    expect(peringatanMulai("posttest", [{ jenis: "posttest", status: "menunggu" }])).toBeNull();
    expect(peringatanMulai("pretest", [{ jenis: "pretest", status: "menunggu" }])).toBeNull();
  });
});
