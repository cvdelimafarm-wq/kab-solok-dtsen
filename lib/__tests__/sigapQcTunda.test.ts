import { describe, it, expect } from "vitest";
import { instanWib, jamKeMenit, SLOT_TENGGAT, SLOT_TUNDA } from "../sigapQc";
import { JEDA_PUSH_MENIT, MENIT_TUNDA, akunBarusaja, pesanTunda, petaTundaBerlaku, saringPenerima, slotTunda, teksTunda, tundaJatuhTempo, tundaSudahDikirim, type TundaAktif } from "../sigapQcTunda";

const wib = (tgl: string, jam: string) => instanWib(tgl, jamKeMenit(jam)!);
const iso = (tgl: string, jam: string) => wib(tgl, jam).toISOString();
const ms = (tgl: string, jam: string) => wib(tgl, jam).getTime();

describe("tunda: konstanta dan slot", () => {
  it("2 jam, jeda 60 menit, slot per tunda", () => {
    expect(MENIT_TUNDA).toBe(120);
    expect(JEDA_PUSH_MENIT).toBe(60);
    expect(slotTunda(1)).toBe(SLOT_TUNDA + 1);
    expect(slotTunda(3)).toBe(203);
    expect(SLOT_TENGGAT).toBeLessThan(100); // di bawah slot berkala (100+)
    expect(SLOT_TUNDA).toBeGreaterThan(150);
  });
});

describe("petaTundaBerlaku", () => {
  const d: TundaAktif[] = [
    { akun_id: 1, ke: 1, sampai: iso("2026-10-28", "08:00") },
    { akun_id: 2, ke: 2, sampai: iso("2026-10-28", "10:00") },
    { akun_id: 3, ke: 1, sampai: "bukan tanggal" },
  ];
  it("hanya yang sampai-nya di masa depan", () => {
    const p = petaTundaBerlaku(d, ms("2026-10-28", "09:00"));
    expect([...p.keys()]).toEqual([2]);
    expect(p.get(2)).toBe(ms("2026-10-28", "10:00"));
  });
  it("tepat saat berakhir sudah tidak berlaku", () => {
    expect(petaTundaBerlaku(d, ms("2026-10-28", "08:00")).has(1)).toBe(false);
    expect(petaTundaBerlaku(d, ms("2026-10-28", "07:59")).has(1)).toBe(true);
  });
});

describe("tundaJatuhTempo", () => {
  const d: TundaAktif[] = [
    { akun_id: 1, ke: 1, sampai: iso("2026-10-28", "08:00") },
    { akun_id: 2, ke: 2, sampai: iso("2026-10-28", "10:00") },
  ];
  it("yang sudah berakhir dan belum dikirim", () => {
    expect(tundaJatuhTempo(d, ms("2026-10-28", "08:03")).map((t) => t.akun_id)).toEqual([1]);
    expect(tundaJatuhTempo(d, ms("2026-10-28", "10:05")).map((t) => t.akun_id)).toEqual([1, 2]);
  });
  it("yang sudah dikirim (slot 200+ke tercatat) tidak diulang", () => {
    const sudah = tundaSudahDikirim([{ akun_id: 1, slot: 201 }, { akun_id: 9, slot: 3 }, { akun_id: 2, slot: 100 }]);
    expect([...sudah]).toEqual(["1:201"]);
    expect(tundaJatuhTempo(d, ms("2026-10-28", "10:05"), sudah).map((t) => t.akun_id)).toEqual([2]);
  });
  it("tunda ke-2 petugas yang sama bukan duplikat tunda ke-1", () => {
    const dd: TundaAktif[] = [{ akun_id: 1, ke: 2, sampai: iso("2026-10-28", "10:00") }];
    const sudah = tundaSudahDikirim([{ akun_id: 1, slot: 201 }]);
    expect(tundaJatuhTempo(dd, ms("2026-10-28", "10:05"), sudah).map((t) => `${t.akun_id}:${t.ke}`)).toEqual(["1:2"]);
  });
  it("tunda yang dipotong tepat di batas dilewati (digantikan pengingat tenggat); yang melewati batas tetap dikirim", () => {
    const dd: TundaAktif[] = [
      { akun_id: 1, ke: 1, sampai: iso("2026-10-28", "20:00") },
      { akun_id: 2, ke: 1, sampai: iso("2026-10-28", "20:30") }, // ditekan sesudah batas
    ];
    const batas = ms("2026-10-28", "20:00");
    expect(tundaJatuhTempo(dd, ms("2026-10-28", "20:35"), new Set(), batas).map((t) => t.akun_id)).toEqual([2]);
    expect(tundaJatuhTempo(dd, ms("2026-10-28", "20:35"), new Set(), null).map((t) => t.akun_id)).toEqual([1, 2]);
  });
  it("tidak di jam senyap: ditunda sampai senyap berakhir", () => {
    const malam: TundaAktif[] = [{ akun_id: 1, ke: 1, sampai: iso("2026-10-28", "23:30") }];
    expect(tundaJatuhTempo(malam, ms("2026-10-28", "23:40"))).toEqual([]);
    expect(tundaJatuhTempo(malam, ms("2026-10-29", "05:55"))).toEqual([]);
    expect(tundaJatuhTempo(malam, ms("2026-10-29", "06:00")).length).toBe(1);
  });
});

describe("saringPenerima", () => {
  const now = ms("2026-10-28", "09:00");
  const tunda = new Map<number, number>([[2, ms("2026-10-28", "10:00")]]);
  const baru = new Set<number>([3]);
  it("pengingat biasa: buang yang menunda dan yang baru dikirimi", () => {
    expect(saringPenerima([1, 2, 3, 4], 1, tunda, baru, now)).toEqual([1, 4]);
    expect(saringPenerima([1, 2, 3, 4], 105, tunda, baru, now)).toEqual([1, 4]); // berkala juga
  });
  it("TENGGAT selalu dikirim ke semua", () => {
    expect(saringPenerima([1, 2, 3, 4], SLOT_TENGGAT, tunda, baru, now)).toEqual([1, 2, 3, 4]);
  });
  it("tunda yang sudah lewat tidak menyaring", () => {
    expect(saringPenerima([2], 1, tunda, new Set(), ms("2026-10-28", "10:01"))).toEqual([2]);
  });
  it("tidak mengubah daftar masukan", () => {
    const a = [1, 2];
    saringPenerima(a, 1, tunda, baru, now);
    expect(a).toEqual([1, 2]);
  });
});

describe("akunBarusaja", () => {
  const now = ms("2026-10-28", "09:00");
  it("dalam 60 menit terakhir", () => {
    const b = akunBarusaja(
      [
        { akun_id: 1, dibuat_at: iso("2026-10-28", "08:30") },
        { akun_id: 2, dibuat_at: iso("2026-10-28", "07:59") },
        { akun_id: 3, dibuat_at: iso("2026-10-28", "08:00") },
        { akun_id: 4, dibuat_at: "rusak" },
      ],
      now
    );
    expect([...b].sort()).toEqual([1, 3]);
  });
  it("jeda bisa diatur", () => {
    expect(akunBarusaja([{ akun_id: 1, dibuat_at: iso("2026-10-28", "08:30") }], now, 20).size).toBe(0);
  });
});

describe("teks untuk petugas", () => {
  it("teksTunda: jam WIB, null bila lewat/kosong", () => {
    expect(teksTunda(iso("2026-10-28", "08:05"), ms("2026-10-28", "06:05"))).toBe("Pengingat berikutnya pukul 08:05 WIB.");
    expect(teksTunda(iso("2026-10-28", "08:05"), ms("2026-10-28", "08:05"))).toBeNull();
    expect(teksTunda(null, 0)).toBeNull();
    expect(teksTunda("rusak", 0)).toBeNull();
  });
  it("pesanTunda: biasa dan dipotong di batas", () => {
    expect(pesanTunda(iso("2026-10-28", "08:05"), false)).toBe("Ditunda. Pengingat berikutnya pukul 08:05 WIB. Soal tetap wajib diisi.");
    expect(pesanTunda(iso("2026-10-28", "20:00"), true)).toBe("Ditunda sampai batas pengisian pukul 20:00 WIB. Soal tetap wajib diisi.");
  });
});
