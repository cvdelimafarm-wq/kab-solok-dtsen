// lib/keu/__tests__/picuKegiatan.test.ts
// (13 Nov 2026, A) Kalimat hasil pemicu kegiatan dari identifikasi sah.
import { describe, expect, it } from "vitest";
import { kalimatPicu } from "../pelaksanaan";
import { TAMPILAN_BACA } from "../tampilan";

describe("kalimatPicu", () => {
  it("menyebut tiap fungsi dan periode", () => {
    expect(kalimatPicu({ ident: 6, aksi: [{ fungsi: "pelatihan", periode: "Tahun 2026", aksi: "dibuat", kegiatan: 15 }, { fungsi: "pendataan", periode: "Tahun 2026", aksi: "sudah_tertaut", kegiatan: 16 }] }))
      .toBe("Pelatihan Tahun 2026: kegiatan baru dibuat; Pendataan Tahun 2026: sudah tertaut, tidak ada perubahan.");
  });
  it("tanpa aksi", () => expect(kalimatPicu({ aksi: [] })).toContain("tidak ada kegiatan"));
  it("view baru boleh dibaca", () => {
    expect(TAMPILAN_BACA.keu_v_ident_kegiatan).toContain("sumber");
    expect(TAMPILAN_BACA.keu_v_ident_kegiatan_tanggal).toContain("mulai_baru");
  });
});
