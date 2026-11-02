import { describe, expect, it } from "vitest";
import {
  TAHAP_KOSONG, URUTAN_TAHAP, akhirHariWib, cariTahap, hitungTahapan, izinBerlaku, kunciUntuk, periksaPermintaanIzin, ringkasIzin, teksKartuTerkunci, tesDenganIzin,
  type BarisIzin, type MasukanTahapan,
} from "../sigapTahapan";

const NOW = new Date("2026-11-09T04:00:00Z").getTime(); // 11.00 WIB
const masuk = (o: Partial<Record<string, { ada: boolean; tuntas: boolean }>>): MasukanTahapan => ({ ...TAHAP_KOSONG(), ...o });
const izin = (o: Partial<BarisIzin> = {}): BarisIzin => ({ tahap: "posttest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", dibuat_at: "2026-11-09T03:00:00Z", ...o });

describe("urutan dan blokir", () => {
  it("urutan baku", () => expect([...URUTAN_TAHAP]).toEqual(["video", "vanguard", "pretest", "kuis", "posttest"]));

  it("blokir mati: tidak ada yang terkunci walau tahap sebelumnya belum tuntas", () => {
    const h = hitungTahapan(masuk({ pretest: { ada: true, tuntas: false }, posttest: { ada: true, tuntas: false } }), false, [], NOW);
    expect(h.every((x) => !x.terkunci)).toBe(true);
  });

  it("pretest belum tuntas mengunci posttest, bukan pretest", () => {
    const h = hitungTahapan(masuk({ pretest: { ada: true, tuntas: false }, posttest: { ada: true, tuntas: false } }), true, [], NOW);
    expect(cariTahap(h, "pretest")!.terkunci).toBe(false);
    const pt = cariTahap(h, "posttest")!;
    expect(pt.terkunci).toBe(true);
    expect(pt.kunci_oleh).toBe("pretest");
    expect(pt.pesan).toBe("Selesaikan Pretest dulu.");
  });

  it("pretest tuntas tetapi kuis ada dan belum ikut: posttest terkunci oleh kuis", () => {
    const h = hitungTahapan(masuk({ pretest: { ada: true, tuntas: true }, kuis: { ada: true, tuntas: false }, posttest: { ada: true, tuntas: false } }), true, [], NOW);
    expect(cariTahap(h, "posttest")!.kunci_oleh).toBe("kuis");
    expect(kunciUntuk(h, "posttest")?.pesan).toBe("Selesaikan Kuis Adu Sigap dulu.");
  });

  it("tanpa kuis (ada=false) posttest tidak terhalang kuis", () => {
    const h = hitungTahapan(masuk({ pretest: { ada: true, tuntas: true }, posttest: { ada: true, tuntas: false } }), true, [], NOW);
    expect(cariTahap(h, "posttest")!.terkunci).toBe(false);
  });

  it("semua tuntas: tidak ada kunci", () => {
    const h = hitungTahapan(masuk({ pretest: { ada: true, tuntas: true }, kuis: { ada: true, tuntas: true }, posttest: { ada: true, tuntas: true } }), true, [], NOW);
    expect(h.some((x) => x.terkunci)).toBe(false);
  });

  it("video wajib belum tuntas mengunci pretest dan posttest; penghalang = tahap pertama yang belum tuntas", () => {
    const h = hitungTahapan(masuk({ video: { ada: true, tuntas: false }, vanguard: { ada: true, tuntas: false }, pretest: { ada: true, tuntas: false }, posttest: { ada: true, tuntas: false } }), true, [], NOW);
    expect(cariTahap(h, "vanguard")!.kunci_oleh).toBe("video");
    expect(cariTahap(h, "pretest")!.kunci_oleh).toBe("video");
    expect(cariTahap(h, "posttest")!.kunci_oleh).toBe("video");
  });

  it("video tuntas, vanguard belum: pretest terkunci oleh vanguard", () => {
    const h = hitungTahapan(masuk({ video: { ada: true, tuntas: true }, vanguard: { ada: true, tuntas: false }, pretest: { ada: true, tuntas: false } }), true, [], NOW);
    expect(cariTahap(h, "pretest")!.kunci_oleh).toBe("vanguard");
  });

  it("tahap yang tidak ada tidak pernah terkunci dan tidak pernah menghalangi", () => {
    const h = hitungTahapan(masuk({ video: { ada: false, tuntas: false }, pretest: { ada: true, tuntas: false } }), true, [], NOW);
    expect(h.find((x) => x.kode === "video")!.terkunci).toBe(false);
    expect(cariTahap(h, "pretest")!.terkunci).toBe(false);
  });
});

describe("izin buka kunci", () => {
  const dasar = masuk({ pretest: { ada: true, tuntas: false }, posttest: { ada: true, tuntas: false } });

  it("izin berlaku membuka tahapan yang diizinkan saja", () => {
    const h = hitungTahapan(dasar, true, [izin()], NOW);
    const pt = cariTahap(h, "posttest")!;
    expect(pt.terkunci).toBe(false);
    expect(pt.dibuka_izin).toBe(true);
  });

  it("izin untuk tahapan lain tidak membuka", () => {
    const h = hitungTahapan(dasar, true, [izin({ tahap: "pretest" })], NOW);
    expect(cariTahap(h, "posttest")!.terkunci).toBe(true);
  });

  it("izin menunggu / ditolak / kedaluwarsa tidak membuka", () => {
    for (const b of [izin({ status: "menunggu" }), izin({ status: "ditolak" }), izin({ berlaku_sampai: "2026-11-08T16:59:59.000Z" })]) {
      expect(cariTahap(hitungTahapan(dasar, true, [b], NOW), "posttest")!.terkunci).toBe(true);
    }
  });

  it("izinBerlaku: batas tepat", () => {
    expect(izinBerlaku(izin({ berlaku_sampai: new Date(NOW + 1).toISOString() }), NOW)).toBe(true);
    expect(izinBerlaku(izin({ berlaku_sampai: new Date(NOW).toISOString() }), NOW)).toBe(false);
    expect(izinBerlaku(null, NOW)).toBe(false);
  });

  it("ringkasIzin: berlaku > menunggu > ditolak; kedaluwarsa diabaikan", () => {
    expect(ringkasIzin([izin({ status: "ditolak" }), izin({ status: "menunggu", dibuat_at: "2026-11-09T03:30:00Z" })], "posttest", NOW)?.status).toBe("menunggu");
    expect(ringkasIzin([izin({ status: "menunggu" }), izin()], "posttest", NOW)?.status).toBe("disetujui");
    expect(ringkasIzin([izin({ berlaku_sampai: "2026-11-08T16:59:59.000Z" })], "posttest", NOW)).toBeNull();
    expect(ringkasIzin([izin({ status: "ditolak", alasan: "x" })], "posttest", NOW)).toEqual({ status: "ditolak", alasan: "x", berlaku_sampai: null });
    expect(ringkasIzin([izin()], "pretest", NOW)).toBeNull();
  });
});

describe("jendela pribadi", () => {
  it("akhirHariWib = 23.59.59 WIB hari yang sama", () => {
    expect(akhirHariWib(NOW)).toBe("2026-11-09T16:59:59.000Z");
    // 00.30 WIB tanggal 10 = 17.30 UTC tanggal 9 -> akhir hari tanggal 10 WIB
    expect(akhirHariWib(new Date("2026-11-09T17:30:00Z").getTime())).toBe("2026-11-10T16:59:59.000Z");
    // 23.59 WIB masih hari yang sama
    expect(akhirHariWib(new Date("2026-11-09T16:59:00Z").getTime())).toBe("2026-11-09T16:59:59.000Z");
  });

  const tes = { buka_at: "2026-11-09T06:00:00Z", tutup_at: "2026-11-09T07:00:00Z", judul: "Posttest" };
  it("tanpa izin berlaku tes tidak berubah (objek sama)", () => {
    expect(tesDenganIzin(tes, null, NOW)).toBe(tes);
    expect(tesDenganIzin(tes, izin({ status: "menunggu" }), NOW)).toBe(tes);
  });
  it("tes belum dibuka: izin membukanya sekarang juga", () => {
    const t = tesDenganIzin(tes, izin(), NOW);
    expect(new Date(t.buka_at).getTime()).toBe(NOW);
    expect(t.tutup_at).toBe("2026-11-09T16:59:59.000Z");
    expect(t.judul).toBe("Posttest");
  });
  it("tes sudah tutup: izin membukanya kembali sampai 23.59", () => {
    const lewat = { buka_at: "2026-11-09T01:00:00Z", tutup_at: "2026-11-09T03:00:00Z" };
    const t = tesDenganIzin(lewat, izin(), NOW);
    expect(t.buka_at).toBe(lewat.buka_at);
    expect(t.tutup_at).toBe("2026-11-09T16:59:59.000Z");
  });
  it("izin tidak memperpendek jendela yang lebih lebar", () => {
    const panjang = { buka_at: "2026-11-09T01:00:00Z", tutup_at: "2026-11-12T03:00:00Z" };
    expect(tesDenganIzin(panjang, izin(), NOW).tutup_at).toBe(panjang.tutup_at);
  });
});

describe("masukan dan teks", () => {
  it("periksaPermintaanIzin", () => {
    expect(periksaPermintaanIzin({ tahap: "posttest", alasan: "  Kendala   HP " })).toEqual({ ok: true, izin: { tahap: "posttest", alasan: "Kendala HP" } });
    expect(periksaPermintaanIzin({ tahap: "kuis", alasan: "abc" }).ok).toBe(false);
    expect(periksaPermintaanIzin({ tahap: "pretest", alasan: "ab" }).ok).toBe(false);
    expect(periksaPermintaanIzin({ tahap: "pretest", alasan: "x".repeat(201) }).ok).toBe(false);
    expect(periksaPermintaanIzin(null).ok).toBe(false);
  });
  it("teksKartuTerkunci", () => {
    const k = { oleh_label: "Pretest" };
    expect(teksKartuTerkunci(k, null, true).tombolMinta).toBe(true);
    expect(teksKartuTerkunci(k, null, false).tombolMinta).toBe(false);
    expect(teksKartuTerkunci(k, { status: "menunggu", berlaku_sampai: null }, true).tombolMinta).toBe(false);
    expect(teksKartuTerkunci(k, { status: "ditolak", berlaku_sampai: null }, true).tombolMinta).toBe(true);
    expect(teksKartuTerkunci(k, null, false).ket).toContain("Selesaikan Pretest dulu");
  });
});
