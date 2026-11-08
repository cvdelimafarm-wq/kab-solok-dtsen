import { describe, expect, it } from "vitest";
import { pastikanTesBawaan } from "@/lib/sigapTesDb";

type Baris = Record<string, unknown>;

// db tiruan minimal untuk sigap_kegiatan (satu baris) dan sigap_tes (daftar), cukup untuk select/eq/maybeSingle/upsert
function dbTiruan(keg: Baris | null, tes: Baris[], galatUpsert = false) {
  const disisipkan: Baris[] = [];
  const db = {
    from(tabel: string) {
      if (tabel === "sigap_kegiatan") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: keg }) }) }) };
      }
      return {
        select: () => ({ eq: async () => ({ data: tes }) }),
        upsert: async (baris: Baris[], opsi: Record<string, unknown>) => {
          expect(opsi).toEqual({ onConflict: "kegiatan_id,jenis", ignoreDuplicates: true });
          if (galatUpsert) return { error: { message: "x" } };
          disisipkan.push(...baris);
          return { error: null };
        },
      };
    },
  };
  return { db: db as never, disisipkan };
}

const PEL = { nama: "Pelatihan Petugas Seruti Triwulan IV 2026", jenis: "pelatihan", tanggal_mulai: "2026-11-09", tanggal_selesai: "2026-11-09" };

describe("pastikanTesBawaan", () => {
  it("pelatihan tanpa tes: pretest dan posttest dibuat, tidak aktif, wajib lulus mati, jadwal 07.00-22.00 WIB", async () => {
    const { db, disisipkan } = dbTiruan(PEL, []);
    expect(await pastikanTesBawaan(db, 7)).toBe(2);
    expect(disisipkan.map((b) => b.jenis).sort()).toEqual(["posttest", "pretest"]);
    for (const b of disisipkan) {
      expect(b.kegiatan_id).toBe(7);
      expect(b.aktif).toBe(false);
      expect(b.wajib_lulus).toBe(false);
      expect(b.durasi_menit).toBe(15);
      expect(b.buka_at).toBe("2026-11-09T00:00:00.000Z"); // 9 Nov 07.00 WIB
      expect(b.tutup_at).toBe("2026-11-09T15:00:00.000Z"); // 9 Nov 22.00 WIB
      expect(String(b.judul)).toContain("Seruti Triwulan IV 2026");
    }
  });

  it("hanya menambah jenis yang belum ada dan tidak menyentuh yang sudah ada", async () => {
    const { db, disisipkan } = dbTiruan(PEL, [{ jenis: "pretest" }]);
    expect(await pastikanTesBawaan(db, 7)).toBe(1);
    expect(disisipkan.map((b) => b.jenis)).toEqual(["posttest"]);
  });

  it("sudah lengkap: tidak menulis apa pun", async () => {
    const { db, disisipkan } = dbTiruan(PEL, [{ jenis: "pretest" }, { jenis: "posttest" }]);
    expect(await pastikanTesBawaan(db, 7)).toBe(0);
    expect(disisipkan).toEqual([]);
  });

  it("bukan pelatihan, tanpa tanggal mulai, atau kegiatan tidak ada: tidak menulis apa pun", async () => {
    for (const keg of [{ ...PEL, jenis: "pendataan" }, { ...PEL, tanggal_mulai: null }, null]) {
      const { db, disisipkan } = dbTiruan(keg, []);
      expect(await pastikanTesBawaan(db, 7)).toBe(0);
      expect(disisipkan).toEqual([]);
    }
  });

  it("tanggal selesai kosong atau lebih awal dari mulai: tutup tetap setelah buka", async () => {
    for (const selesai of [null, "2026-11-01"]) {
      const { db, disisipkan } = dbTiruan({ ...PEL, tanggal_selesai: selesai }, []);
      expect(await pastikanTesBawaan(db, 7)).toBe(2);
      for (const b of disisipkan) expect(new Date(String(b.tutup_at)).getTime()).toBeGreaterThan(new Date(String(b.buka_at)).getTime());
    }
  });

  it("gagal menulis: mengembalikan 0 dan tidak melempar galat", async () => {
    const { db } = dbTiruan(PEL, [], true);
    expect(await pastikanTesBawaan(db, 7)).toBe(0);
  });
});
