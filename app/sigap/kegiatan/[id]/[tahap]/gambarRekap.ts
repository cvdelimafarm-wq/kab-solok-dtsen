// app/sigap/kegiatan/[id]/[tahap]/gambarRekap.ts  (hanya klien)
//
// (11 Okt 2026) Menggambar rekap identifikasi satu nagari/kecamatan menjadi gambar PNG (canvas, tanpa pustaka) untuk disalin/dibagikan -- permintaan user.
// Isi hanya Sub SLS + status. Banyak baris dibagi ke beberapa kolom supaya gambar tidak terlalu tinggi untuk dibagikan lewat WhatsApp.

import { LABEL_STATUS_REKAP, bagiKolom, rapikanNama, susunBarisGambar, type BarisGambar, type KelompokRekap, type TingkatRekap } from "@/lib/rekapIdentifikasi";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PAD = 28;
const LEBAR_KOLOM = 380;
const JARAK_KOLOM = 20;
const TINGGI_BARIS = 34;
const BARIS_PER_KOLOM = 28;
const TINGGI_KEPALA = 112;
const TINGGI_KAKI = 38;
const BATAS_PIKSEL = 7600;

const WARNA = {
  latar: "#FFFFFF",
  ink: "#1B2B4B",
  navy: "#0F2A52",
  muted: "#6B7A90",
  garis: "#E6ECF5",
  bagian: "#EAF1FC",
  terdampak: { latar: "#E3F6EC", teks: "#13794B" },
  tidak: { latar: "#E3F0FA", teks: "#12618F" },
};

function potong(ctx: CanvasRenderingContext2D, teks: string, lebar: number): string {
  if (ctx.measureText(teks).width <= lebar) return teks;
  let s = teks;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > lebar) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function bulat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Susunan kolom gambar (dipakai juga untuk menghitung ukuran). */
export function susunKolomGambar(k: KelompokRekap, tingkat: TingkatRekap): BarisGambar[][] {
  const baris = susunBarisGambar(k, tingkat);
  const kolom = Math.max(1, Math.ceil(baris.length / BARIS_PER_KOLOM));
  return bagiKolom(baris, Math.ceil(baris.length / kolom));
}

export async function buatGambarRekap(k: KelompokRekap, tingkat: TingkatRekap, tanggalTeks: string): Promise<Blob> {
  const kolom = susunKolomGambar(k, tingkat);
  const nKolom = Math.max(1, kolom.length);
  const maksBaris = Math.max(1, ...kolom.map((c) => c.length));
  const lebar = Math.max(PAD * 2 + 460, PAD * 2 + nKolom * LEBAR_KOLOM + (nKolom - 1) * JARAK_KOLOM);
  const tinggi = TINGGI_KEPALA + maksBaris * TINGGI_BARIS + TINGGI_KAKI + 8;
  const skala = Math.min(2, BATAS_PIKSEL / Math.max(lebar, tinggi));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(lebar * skala);
  canvas.height = Math.round(tinggi * skala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Peramban tidak mendukung pembuatan gambar.");
  ctx.scale(skala, skala);

  ctx.fillStyle = WARNA.latar;
  ctx.fillRect(0, 0, lebar, tinggi);

  // kepala
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = WARNA.muted;
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText("REKAP HASIL IDENTIFIKASI · PENDATAAN PASCABENCANA", PAD, PAD + 8);
  ctx.fillStyle = WARNA.navy;
  ctx.font = `800 26px ${FONT}`;
  const judul = tingkat === "nagari" ? `Nagari ${rapikanNama(k.judul)}` : `Kecamatan ${rapikanNama(k.judul)}`;
  ctx.fillText(potong(ctx, judul, lebar - PAD * 2), PAD, PAD + 42);
  ctx.fillStyle = WARNA.ink;
  ctx.font = `600 14px ${FONT}`;
  const sub = [tingkat === "nagari" && k.induk ? `Kec. ${rapikanNama(k.induk)}` : `${k.nagari} nagari`, `${k.baris.length} Sub SLS`, `${k.terdampak} terdampak`, `${k.tidak} tidak terdampak`].join("  ·  ");
  ctx.fillText(potong(ctx, sub, lebar - PAD * 2), PAD, PAD + 68);
  ctx.strokeStyle = WARNA.garis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, TINGGI_KEPALA - 8);
  ctx.lineTo(lebar - PAD, TINGGI_KEPALA - 8);
  ctx.stroke();

  // isi
  kolom.forEach((c, ci) => {
    const x = PAD + ci * (LEBAR_KOLOM + JARAK_KOLOM);
    c.forEach((b, ri) => {
      const y = TINGGI_KEPALA + ri * TINGGI_BARIS;
      if (b.jenis === "bagian") {
        ctx.fillStyle = WARNA.bagian;
        bulat(ctx, x, y + 3, LEBAR_KOLOM, TINGGI_BARIS - 6, 8);
        ctx.fill();
        ctx.fillStyle = WARNA.navy;
        ctx.font = `800 13px ${FONT}`;
        ctx.fillText(potong(ctx, b.teks, LEBAR_KOLOM - 150), x + 10, y + TINGGI_BARIS / 2 + 4.5);
        ctx.fillStyle = WARNA.muted;
        ctx.font = `600 11.5px ${FONT}`;
        const ringkas = `${b.terdampak} terdampak · ${b.tidak} tidak`;
        ctx.textAlign = "right";
        ctx.fillText(ringkas, x + LEBAR_KOLOM - 10, y + TINGGI_BARIS / 2 + 4);
        ctx.textAlign = "left";
        return;
      }
      // garis tipis pemisah baris
      ctx.strokeStyle = WARNA.garis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + TINGGI_BARIS - 0.5);
      ctx.lineTo(x + LEBAR_KOLOM, y + TINGGI_BARIS - 0.5);
      ctx.stroke();

      const warna = b.status === "tidak_terdampak" ? WARNA.tidak : WARNA.terdampak;
      const label = LABEL_STATUS_REKAP[b.status];
      ctx.font = `800 11.5px ${FONT}`;
      const lebarChip = ctx.measureText(label).width + 20;
      ctx.fillStyle = warna.latar;
      bulat(ctx, x + LEBAR_KOLOM - lebarChip, y + 6, lebarChip, TINGGI_BARIS - 12, (TINGGI_BARIS - 12) / 2);
      ctx.fill();
      ctx.fillStyle = warna.teks;
      ctx.fillText(label, x + LEBAR_KOLOM - lebarChip + 10, y + TINGGI_BARIS / 2 + 4);

      ctx.fillStyle = WARNA.ink;
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText(potong(ctx, b.teks, LEBAR_KOLOM - lebarChip - 12), x + 4, y + TINGGI_BARIS / 2 + 5);
    });
  });

  // kaki
  ctx.fillStyle = WARNA.muted;
  ctx.font = `600 11.5px ${FONT}`;
  ctx.fillText(`Per ${tanggalTeks} · hanya Sub SLS yang sudah diidentifikasi · SIGAP BPS Kabupaten Solok`, PAD, tinggi - 14);

  return await new Promise<Blob>((ok, gagal) => canvas.toBlob((b) => (b ? ok(b) : gagal(new Error("Gagal membuat gambar."))), "image/png"));
}
