import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/app/portal/sesi", () => ({ apiPortal: async () => ({}), pemilikSesi: () => 1 }));
vi.mock("@/app/portal/petaDasarOffline", () => ({ ambilManifestDasar: async () => ({ manifest: null, dariJaringan: true }) }));
vi.mock("@/app/sigap/admin/ui", () => ({
  BTN: "b", BTN_O: "bo", BTN_R: "br", BTN_T: "bt", TD: "td", TH: "th",
  Chip: ({ children }: { children: unknown }) => <span>{children as never}</span>,
  Kartu: ({ judul, ket, kanan, children }: { judul?: unknown; ket?: unknown; kanan?: unknown; children?: unknown }) => <section><h3>{judul as never}</h3><p>{ket as never}</p>{kanan as never}{children as never}</section>,
  Memuat: () => <span>Memuat…</span>,
  Pesan: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));
import PetaTim, { HasilPetaTim } from "@/app/sigap/kelola/pendataan/PetaTim";
import { bacaManifestDasar } from "@/lib/petaDasar";
import { kelompokPetaKegiatan } from "@/lib/petaKegiatan";

const teksDari = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ALOKASI = [
  { idsubsls: "1303040001000100", ppl_akun_id: 11, pml_akun_id: 21, ppl_nama: "Ani", pml_nama: "Budi" },
  { idsubsls: "1303040001000200", ppl_akun_id: 12, pml_akun_id: 21, ppl_nama: "Cici", pml_nama: "Budi" },
];

describe("PetaTim (Kelola)", () => {
  it("render awal: judul dan tombol periksa, tanpa memuat sendiri", () => {
    const t = teksDari(renderToString(<PetaTim kegiatanId={7} nama="Seruti Triwulan IV 2026" />));
    expect(t).toContain("Peta dasar tim");
    expect(t).toContain("Periksa status peta");
    expect(t).not.toContain("Memuat");
  });

  it("tanpa manifest: semua berkas belum ada, perintah dan nama ditampilkan", () => {
    const k = kelompokPetaKegiatan(ALOKASI, 7);
    const t = teksDari(renderToString(<HasilPetaTim kegiatanId={7} kelompok={k} manifest={null} />));
    for (const x of ["4 berkas diperlukan", "4 belum ada", "node scripts/peta/potong-peta.mjs --kegiatan=7 --unggah", "--perkiraan", "Korwil/Supervisor", "Seluruh wilayah", "Ani", "Cici", "Budi", "belum ada"]) expect(t).toContain(x);
    expect(t.match(/Salin perintah/g)).toHaveLength(4);
  });

  it("semua sesuai: pesan beres, tanpa cara membuat", () => {
    const k = kelompokPetaKegiatan(ALOKASI, 7);
    const tim = Object.fromEntries(k.map((x) => [String(x.kunci), { berkas: `tim-${x.kunci}.pmtiles`, ukuran: 2 * 1048576, versi: "v", hash: x.hash }]));
    const t = teksDari(renderToString(<HasilPetaTim kegiatanId={7} kelompok={k} manifest={bacaManifestDasar({ versi: "v", tim })} />));
    expect(t).toContain("4 sesuai");
    expect(t).toContain("Semua peta tim sesuai dengan alokasi sekarang");
    expect(t).not.toContain("Cara membuat");
    expect(t).not.toContain("belum ada");
  });

  it("alokasi berubah: berkas ditandai usang", () => {
    const k = kelompokPetaKegiatan(ALOKASI, 7);
    const tim = Object.fromEntries(k.map((x) => [String(x.kunci), { berkas: `tim-${x.kunci}.pmtiles`, ukuran: 1048576, versi: "v", hash: x.peran === "pml" ? "00000000" : x.hash }]));
    const t = teksDari(renderToString(<HasilPetaTim kegiatanId={7} kelompok={k} manifest={bacaManifestDasar({ versi: "v", tim })} />));
    expect(t).toContain("1 usang");
    expect(t).toContain("3 sesuai");
    expect(t).toContain("Cara membuat");
  });
});
