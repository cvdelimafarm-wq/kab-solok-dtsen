import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { KASUS, KASUS_DITANGGUHKAN, rahasiaKasus } from "../vanguard/kasus";
import { KASUS_PUBLIK, KODE_DITANGGUHKAN, MAKS_BINTANG } from "../vanguard/kasus/daftar";

const RAHASIA = ["kunci", "jebakan", "alternatif", "nol", "petunjuk", "langkah", "pembahasan", "rujukan"];
const AKAR = path.resolve(__dirname, "..", "..");

describe("data kasus publik (V5b)", () => {
  it("publik.json mengikuti level-*.json (jalankan node scripts/vanguard-bangun-publik.mjs bila gagal)", () => {
    const harapan = KASUS.map((k) => Object.fromEntries(Object.entries(k).filter(([f]) => !RAHASIA.includes(f))));
    expect(KASUS_PUBLIK).toEqual(harapan);
  });
  it("tidak ada bidang rahasia di publik.json; jumlah dan urutan kode sama dengan KASUS", () => {
    for (const k of KASUS_PUBLIK) for (const f of RAHASIA) expect(Object.keys(k), `${k.kode}.${f}`).not.toContain(f);
    expect(KASUS_PUBLIK.map((k) => k.kode)).toEqual(KASUS.map((k) => k.kode));
    expect(MAKS_BINTANG).toBe(KASUS.filter((k) => !k.bebas).length * 3);
  });
  it("kasus ditangguhkan tidak ada di publik.json; kodenya tercatat di ditangguhkan.json (alasan dan kunci tidak ikut)", () => {
    expect([...KODE_DITANGGUHKAN].sort()).toEqual(KASUS_DITANGGUHKAN.map((k) => k.kode).sort());
    for (const kode of KODE_DITANGGUHKAN) expect(KASUS_PUBLIK.some((k) => k.kode === kode), kode).toBe(false);
    const mentah = fs.readFileSync(path.join(AKAR, "lib/vanguard/kasus/ditangguhkan.json"), "utf8");
    expect(mentah).not.toContain("Buku 4");
    expect(mentah).not.toContain("kunci");
  });
  it("rahasiaKasus memuat semua bidang rahasia dan tidak ada bahan soal", () => {
    const r = rahasiaKasus(KASUS[0]);
    for (const f of ["kunci", "jebakan", "alternatif", "petunjuk", "langkah", "pembahasan", "rujukan"]) expect(Object.keys(r)).toContain(f);
    expect(Object.keys(r)).not.toContain("cerita");
  });
  it("angka kunci tidak muncul dalam bentuk kunci di publik.json (kunci sel tidak ikut)", () => {
    const mentah = fs.readFileSync(path.join(AKAR, "lib/vanguard/kasus/publik.json"), "utf8");
    expect(mentah).not.toContain('"kunci"');
    expect(mentah).not.toContain('"pembahasan"');
    expect(mentah).not.toContain('"petunjuk"');
  });
});

// Kode klien (dimuat ke perangkat petugas) tidak boleh mencapai data kasus penuh. Ditelusuri lewat rantai impor dari berkas klien.
describe("kode klien tidak mengimpor kunci (V5b)", () => {
  const TERLARANG = [/lib\/vanguard\/kasus\/index\.ts$/, /lib\/vanguard\/kasus\/level-[A-Z]\.json$/, /lib\/vanguard\/rekam\.ts$/, /lib\/vanguard\/kuesioner\/nilaiK\.ts$/, /lib\/vanguard\/kuesioner\/templat-k\.json$/, /lib\/vanguard\/kuesioner\/templat\.ts$/, /lib\/vanguard\/kasus\/acak\.ts$/, /lib\/vanguard\/kasus\/templat-[a-z]\.json$/, /lib\/vanguard\/sertifikasi\/nilai\.ts$/, /lib\/vanguard\/kuesioner\/rekamK\.ts$/, /lib\/vanguardAkses\.ts$/, /lib\/vanguardPengaturanDb\.ts$/, /app\/api\//];
  const MULAI = ["app/sigap/vanguard/Vanguard.tsx", "app/sigap/vanguard/kuesioner/KuesionerPenuh.tsx", "app/sigap/vanguard/kuesioner/PapanIsianK.tsx", "app/sigap/vanguard/sertifikasi/Sertifikasi.tsx", "app/sigap/vanguard/sertifikasi/admin/DasborSertifikasi.tsx", "app/sigap/vanguard/dasbor/Dasbor.tsx", "app/sigap/vanguard/TautanDasborVanguard.tsx", "app/sigap/vanguard/RemarkBawahanVanguard.tsx", "app/portal/KartuVanguard.tsx", "app/sigap/KartuVanguardHariIni.tsx"];
  const coba = (dasar: string): string | null => {
    for (const ekor of ["", ".ts", ".tsx", ".json", "/index.ts", "/index.tsx"]) { const p = dasar + ekor; if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; }
    return null;
  };
  function jelajah(awal: string): string[] {
    const lihat = new Set<string>(); const antre = [awal]; const ditemukan: string[] = [];
    while (antre.length) {
      const f = antre.pop()!;
      if (lihat.has(f)) continue;
      lihat.add(f); ditemukan.push(f);
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g)) {
        const spes = m[1] ?? m[2];
        if (!spes || spes.startsWith("next") || spes === "react") continue;
        const dasar = spes.startsWith("@/") ? path.join(AKAR, spes.slice(2)) : spes.startsWith(".") ? path.resolve(path.dirname(f), spes) : null;
        const hasil = dasar ? coba(dasar) : null;
        if (hasil) antre.push(hasil);
      }
    }
    return ditemukan;
  }
  for (const mulai of MULAI) {
    const berkas = path.join(AKAR, mulai);
    it(`${mulai}: rantai impornya tidak mencapai data kasus penuh atau kode server`, () => {
      if (!fs.existsSync(berkas)) return; // sandbox tanpa berkas ini
      const bocor = jelajah(berkas).filter((f) => TERLARANG.some((r) => r.test(f.split(path.sep).join("/"))));
      expect(bocor.map((f) => path.relative(AKAR, f))).toEqual([]);
    });
  }
});
