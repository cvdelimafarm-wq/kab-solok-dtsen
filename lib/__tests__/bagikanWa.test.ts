import { describe, expect, it } from "vitest";
import { bisaBagikanBerkas, namaBerkasFoto, petunjukTujuan, tautanVerifikasi, teksBagikanFoto, urlWaTeks, waktuWib } from "../bagikanWa";

describe("bagikanWa", () => {
  it("nama berkas aman", () => {
    expect(namaBerkasFoto("SG-26/10 AB#12")).toBe("sigap-sg-26-10-ab-12.jpg");
    expect(namaBerkasFoto("***")).toBe("sigap-foto.jpg");
  });
  it("waktu WIB dari ISO UTC", () => {
    expect(waktuWib("2026-10-26T02:15:00Z")).toBe("26 Okt 2026, 09.15 WIB");
    expect(waktuWib("2026-10-26T20:05:00Z")).toBe("27 Okt 2026, 03.05 WIB");
    expect(waktuWib("bukan tanggal")).toBe("");
    expect(waktuWib(null)).toBe("");
  });
  it("teks keterangan: sapaan, waktu, lokasi, kode, link verifikasi", () => {
    expect(teksBagikanFoto({ kode: "SGP-1", lokasi: " Nagari X ", diambil_at: "2026-10-26T02:15:00Z", kegiatan: "Pascabencana 2026", asal: "https://contoh.id/" })).toBe(
      "Hai, saya berbagi foto pendataan Pascabencana 2026 dari SIGAP BPS Kab. Solok.\nWaktu: 26 Okt 2026, 09.15 WIB\nLokasi: Nagari X\nKode foto: SGP-1\nLink verifikasi: https://contoh.id/verifikasi?k=SGP-1",
    );
    expect(teksBagikanFoto({ kode: "SGP-2" })).toBe("Hai, saya berbagi foto pendataan dari SIGAP BPS Kab. Solok.\nKode foto: SGP-2\nLink verifikasi: https://bps-solokkab.up.railway.app/verifikasi?k=SGP-2");
  });
  it("tautan verifikasi sama dengan isi QR", () => {
    expect(tautanVerifikasi("SGP-4A7F-02C9-11E3", "https://bps-solokkab.up.railway.app/")).toBe("https://bps-solokkab.up.railway.app/verifikasi?k=SGP-4A7F-02C9-11E3");
    expect(tautanVerifikasi("A B", "")).toBe("https://bps-solokkab.up.railway.app/verifikasi?k=A%20B");
  });
  it("tautan teks dan dukungan bagikan berkas", () => {
    expect(urlWaTeks("a b\nc")).toBe("https://wa.me/?text=a%20b%0Ac");
    const f = new File(["x"], "a.jpg", { type: "image/jpeg" });
    expect(bisaBagikanBerkas(null, f)).toBe(false);
    expect(bisaBagikanBerkas({}, f)).toBe(false);
    expect(bisaBagikanBerkas({ share: () => {}, canShare: () => true }, f)).toBe(true);
    expect(bisaBagikanBerkas({ share: () => {}, canShare: () => false }, f)).toBe(false);
    expect(bisaBagikanBerkas({ share: () => {}, canShare: () => { throw new Error("x"); } }, f)).toBe(false);
  });
  it("petunjuk", () => {
    expect(petunjukTujuan("status")).toMatch(/Status saya/);
    expect(petunjukTujuan("chat")).toMatch(/kontak atau grup/);
  });
});
