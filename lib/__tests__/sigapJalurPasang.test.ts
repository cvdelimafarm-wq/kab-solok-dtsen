// (9 Okt 2026) Uji jalurPasang: tombol utama halaman pasang SIGAP sesuai HP + browser.
import { describe, expect, it } from "vitest";
import { jalurPasang } from "../sigapGerbangApp";

const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 13; SM-A325F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  waAndroid: "Mozilla/5.0 (Linux; Android 13; RMX3363 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36",
  fbAndroid: "Mozilla/5.0 (Linux; Android 12; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0;]",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  firefoxIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15",
  igIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0",
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("jalurPasang", () => {
  it("Chrome dan Samsung Internet Android -> tombol Instal", () => {
    expect(jalurPasang(UA.chromeAndroid)).toBe("android");
    expect(jalurPasang(UA.samsung)).toBe("android");
  });
  it("browser di dalam WhatsApp/Facebook Android -> Buka di Chrome", () => {
    expect(jalurPasang(UA.waAndroid)).toBe("tertanam-android");
    expect(jalurPasang(UA.fbAndroid)).toBe("tertanam-android");
  });
  it("iPhone Safari dan iPad (mengaku Macintosh, layar sentuh) -> langkah Safari", () => {
    expect(jalurPasang(UA.safariIphone)).toBe("ios-safari");
    expect(jalurPasang(UA.ipadSafari, 5)).toBe("ios-safari");
  });
  it("Chrome iPhone -> langkah Bagikan di kolom alamat", () => {
    expect(jalurPasang(UA.chromeIphone)).toBe("ios-chrome");
  });
  it("browser iPhone lain dan Instagram iPhone -> salin tautan ke Safari", () => {
    expect(jalurPasang(UA.firefoxIphone)).toBe("ios-lain");
    expect(jalurPasang(UA.igIphone)).toBe("ios-lain");
  });
});
