// (7 Okt 2026) SIGAP PEDIA -- test parsing .eml & verifikasi DKIM (sampel .eml uji ditandatangani kunci uji
// fixtures/dkim.key; kunci publiknya disajikan resolver DNS palsu -- tanpa jaringan).
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { tebakNomorTiket, uraiEml, verifikasiDkim } from "../eml";

const F = path.join(__dirname, "fixtures");
const eml = fs.readFileSync(path.join(F, "contoh_dkim.eml"));
const pub = fs.readFileSync(path.join(F, "dkim.pub.b64"), "utf8").trim();
const resolverUji = async (name: string) => {
  if (name === "s2026._domainkey.uji.kemenkeu.go.id") return [[`v=DKIM1; k=rsa; p=${pub}`]];
  const e = new Error("NXDOMAIN") as Error & { code: string };
  e.code = "ENOTFOUND";
  throw e;
};

describe("parsing .eml", () => {
  it("header, tanggal, Message-ID & lampiran", async () => {
    const u = await uraiEml(eml);
    expect(u.header.from).toContain("hai@uji.kemenkeu.go.id");
    expect(u.header.subject).toContain("20261002-GTZWQS");
    expect(u.header.date).toBe("2026-10-02T03:15:00.000Z");
    expect(u.header.message_id).toBe("<uji-20261002-GTZWQS@uji.kemenkeu.go.id>");
    expect(u.lampiran).toHaveLength(1);
    expect(u.lampiran[0].data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(u.teks).toContain("PMK 113/PMK.05/2012");
  });
  it("nomor tiket ditebak dari subjek", () => {
    expect(tebakNomorTiket("[Tiket 20261002-GTZWQS] Jawaban")).toBe("20261002-GTZWQS");
  });
});

describe("DKIM", () => {
  it("PASS utk domain penanda tangan sebenarnya + snapshot kunci DNS tersimpan", async () => {
    const d = await verifikasiDkim(eml, { resolverUji });
    expect(d.status).toBe("pass");
    expect(d.domain).toBe("uji.kemenkeu.go.id");
    expect(d.selector).toBe("s2026");
    expect(d.snapshot_dns[0].nama).toBe("s2026._domainkey.uji.kemenkeu.go.id");
    expect(JSON.stringify(d.snapshot_dns[0].jawaban)).toContain(pub.slice(0, 20));
  });
  it("tetap PASS dgn snapshot walau kunci DNS sudah hilang/diganti", async () => {
    const d = await verifikasiDkim(eml, { resolverUji });
    const lagi = await verifikasiDkim(eml, { snapshot: d.snapshot_dns });
    expect(lagi.status).toBe("pass");
    expect(lagi.mode).toBe("snapshot");
  });
  it("isi email diubah -> tidak PASS", async () => {
    const rusak = Buffer.from(eml.toString().replace("visum SPD", "visum SPX"));
    const d = await verifikasiDkim(rusak, { resolverUji });
    expect(d.status).not.toBe("pass");
  });
  it("kunci tidak ditemukan -> tidak PASS", async () => {
    const d = await verifikasiDkim(eml, { resolverUji: async () => [] });
    expect(d.status).not.toBe("pass");
  });
});
