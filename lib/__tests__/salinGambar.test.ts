import { afterEach, describe, expect, it, vi } from "vitest";
import { namaBerkasGambar, salinAtauBagikanGambar } from "@/app/components/SalinGambar";

afterEach(() => vi.unstubAllGlobals());

describe("namaBerkasGambar", () => {
  it("membuat nama aman dengan tanggal", () => {
    expect(namaBerkasGambar("Peta jadwal – Seruti TW IV", "2026-11-02")).toBe("peta-jadwal-seruti-tw-iv-2026-11-02.png");
    expect(namaBerkasGambar("   ", "2026-11-02")).toBe("grafik-2026-11-02.png");
  });
});

describe("salinAtauBagikanGambar", () => {
  const blob = new Blob(["x"], { type: "image/png" });
  it("menyalin ke papan klip bila didukung (Promise diteruskan langsung)", async () => {
    const tulis = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", class { constructor(public d: unknown) {} });
    vi.stubGlobal("navigator", { clipboard: { write: tulis } });
    expect(await salinAtauBagikanGambar(Promise.resolve(blob), "a.png")).toBe("disalin");
    expect(tulis).toHaveBeenCalledOnce();
  });
  it("membagikan berkas bila papan klip tidak ada tetapi lembar bagikan ada", async () => {
    const bagikan = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share: bagikan });
    expect(await salinAtauBagikanGambar(Promise.resolve(blob), "a.png")).toBe("dibagikan");
    expect(bagikan).toHaveBeenCalledOnce();
  });
  it("mengunduh bila tidak ada keduanya", async () => {
    const klik = vi.fn();
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    vi.stubGlobal("document", { createElement: () => ({ click: klik, remove: () => undefined }), body: { appendChild: () => undefined } });
    expect(await salinAtauBagikanGambar(Promise.resolve(blob), "a.png")).toBe("diunduh");
    expect(klik).toHaveBeenCalledOnce();
  });
  it("pengguna membatalkan lembar bagikan -> batal, tanpa unduhan", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share: () => Promise.reject(new DOMException("x", "AbortError")) });
    expect(await salinAtauBagikanGambar(Promise.resolve(blob), "a.png")).toBe("batal");
  });
  it("galat pembuatan gambar diteruskan ke pemanggil", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", {});
    await expect(salinAtauBagikanGambar(Promise.reject(new Error("gagal")), "a.png")).rejects.toThrow("gagal");
  });
});
