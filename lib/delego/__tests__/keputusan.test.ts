import { describe, expect, it } from "vitest";
import { argsKeputusan, galatKeputusan, ISIAN_KEPUTUSAN_KOSONG, judulButirBawaan, statusKeputusan } from "@/lib/delego/keputusan";

const S = { kode: "gap_keras", judul: "Temuan Gap keras", kunci: "gap:1:2", teks: "UJI Fiktif Survei Harga 27a", sub: "1 temuan keras · versi 2", ident_id: 1 };

describe("keputusan tercatat", () => {
  it("memeriksa pilihan, alasan, dan butir", () => {
    const f = { ...ISIAN_KEPUTUSAN_KOSONG, pilihan: "Batalkan identifikasi", alasan: "data uji coba saja" };
    expect(galatKeputusan(f, "2026-11-14", true)).toBeNull();
    expect(galatKeputusan({ ...f, alasan: "pendek" }, "2026-11-14", true)).toMatch(/Alasan/);
    const b = { ...f, butir: true, penerima: 23, tenggat: "2026-11-20", judulButir: "Batalkan" };
    expect(galatKeputusan(b, "2026-11-14", true)).toBeNull();
    expect(galatKeputusan({ ...b, tenggat: "2026-11-01" }, "2026-11-14", true)).toMatch(/sebelum/);
    expect(galatKeputusan(b, "2026-11-14", false)).toMatch(/pekerjaan tim/);
    expect(galatKeputusan({ ...b, kelompok: "TIM-UMUM" }, "2026-11-14", false)).toBeNull();
  });

  it("menyusun argumen: identifikasi dipakai bila ada, selain itu pekerjaan tim", () => {
    const f = { ...ISIAN_KEPUTUSAN_KOSONG, pilihan: "Batalkan identifikasi", alasan: "data uji coba saja", butir: true, penerima: 23, tenggat: "2026-11-20", judulButir: "Batalkan", targetHarian: "12,5" };
    const a = argsKeputusan(S, f);
    expect(a.p_ident).toBe(1);
    expect(a.p_butir).toEqual({ judul: "Batalkan", tenggat: "2026-11-20", target_harian: 12.5, penerima: [{ akun: 23, peran: "pegawai" }] });
    const b = argsKeputusan({ ...S, ident_id: null, kode: "tanpa_catatan", kunci: "catat:2026-11-09" }, { ...f, kelompok: "TIM-UMUM" });
    expect(b.p_ident).toBeNull();
    expect((b.p_butir as Record<string, unknown>).kelompok).toBe("TIM-UMUM");
    expect(argsKeputusan(S, { ...f, butir: false }).p_butir).toBeNull();
  });

  it("status lencana dan judul bawaan", () => {
    expect(statusKeputusan(null)).toBeNull();
    expect(statusKeputusan({ butir: 2, butir_selesai: 1, evaluasi: null })?.teks).toBe("Butir 1/2 selesai");
    expect(statusKeputusan({ butir: 0, butir_selesai: 0, evaluasi: null })?.nada).toBe("amber");
    expect(statusKeputusan({ butir: 1, butir_selesai: 1, evaluasi: "sinyal_hilang" })?.nada).toBe("hijau");
    expect(judulButirBawaan("", "Seruti")).toBe("Tindak lanjut: Seruti");
  });
});
