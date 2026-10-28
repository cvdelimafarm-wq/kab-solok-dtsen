// lib/sigapTataFoto.ts
//
// (28 Okt 2026) Tata letak foto pada PDF Dokumentasi Foto SPJ. Fungsi MURNI (tanpa pdf-lib/DB) sehingga teruji.
// Susunan "2-1-2": baris 1 = foto 1|2, baris 2 = foto 3 (pusat perhatian), baris 3 = foto 4|5.
// Prioritas ukuran: foto 3 terbesar; foto 2 dan 4 tidak boleh dikecilkan di bawah ambang (setara foto datar
// ±ambang pt); foto 1 dan 5 mengisi sisa ruang. Foto tidak dipotong (cap tanggal dan QR di tepi bawah utuh).
// Slot yang tidak ada fotonya dilewati: baris kosong hilang dan ruangnya dipakai baris lain.
// Satuan: pt. Koordinat relatif terhadap pojok kiri-atas area foto (sumbu y ke bawah).

export type FotoUkur = { slot: number; aspek: number }; // aspek = lebar / tinggi gambar (setelah orientasi benar)

export type OpsiTata = {
  lebar: number; // lebar area foto
  tinggi: number; // tinggi area foto (termasuk teks keterangan tiap baris)
  gap?: number; // jarak mendatar antarfoto (bawaan 3)
  gapV?: number; // jarak tegak antarbaris (bawaan = gap)
  cap?: number; // ruang di atas tiap foto untuk keterangan (bawaan 16)
  capBawah?: number; // ruang di bawah tiap foto (bawaan 0)
  ambang?: number; // ukuran minimum foto 2 dan 4 (akar luas, pt; bawaan 140)
  lebarMin?: Record<number, number>; // lebar foto minimum per slot (mis. agar keterangan kartu muat)
};

export type Penempatan = {
  slot: number;
  x: number; // kiri foto
  yKet: number; // atas ruang keterangan / kartu
  y: number; // atas foto (di tengah tinggi baris)
  w: number;
  h: number;
  hBaris: number; // tinggi foto tertinggi pada baris ini (kartu satu baris sama tinggi)
  tinggiKartu: number; // cap + hBaris + capBawah
};

export const AMBANG_BAWAAN = 140;
export const FAKTOR_TEGAK = 0.85;
export const GAP_BAWAAN = 3;
export const CAP_BAWAAN = 16;

/** Baris tata letak: slot 1|2, 3, 4|5. Slot di luar 1..5 diabaikan. */
export function barisUntuk(slotAda: number[]): number[][] {
  const ada = new Set(slotAda);
  return [[1, 2], [3], [4, 5]].map((b) => b.filter((s) => ada.has(s))).filter((b) => b.length > 0);
}

const muat = (bw: number, bh: number, a: number): [number, number] => {
  const w = Math.min(bw, bh * a);
  return [w, w / a];
};
const ukuran = (w: number, h: number) => Math.sqrt(w * h);

type Hasil = { skor: [number, number]; rows: Map<number, [number, number]>[]; tinggiBaris: number[] };

/** Cari pembagian tinggi baris dan lebar kolom terbaik untuk ambang tertentu; null bila tak ada yang memenuhi. */
function cari(baris: number[][], aspek: Map<number, number>, lebar: number, avail: number, gap: number, ambang: number, lebarMin: Record<number, number>): Hasil | null {
  const n = baris.length;
  const penting = (s: number) => s === 2 || s === 4;
  // foto tegak secara alami sempit: ambangnya sedikit lebih ringan (85%) supaya tidak mengorbankan foto 3
  const lantai = (s: number) => (penting(s) ? ambang * ((aspek.get(s) ?? 1) < 1 ? FAKTOR_TEGAK : 1) : 0);
  const sempit = (s: number, w: number) => w < (lebarMin[s] ?? 0) - 0.01;
  // Pembagi tinggi: n=1 tunggal; n=2 satu parameter; n=3 dua parameter. Grid 1%.
  const frak: number[][] = [];
  const langkah = 0.01;
  if (n === 1) frak.push([1]);
  else if (n === 2) for (let a = 0.1; a <= 0.9001; a += langkah) frak.push([a, 1 - a]);
  else for (let a = 0.08; a <= 0.6001; a += langkah) for (let b = 0.08; b <= 0.6001; b += langkah) if (a + b <= 0.84) frak.push([a, 1 - a - b, b]);

  let terbaik: Hasil | null = null;
  const fGrid: number[] = [];
  for (let f = 0.1; f <= 0.9001; f += 0.02) fGrid.push(f);

  for (const fr of frak) {
    const tinggi = fr.map((f) => f * avail);
    const rows: Map<number, [number, number]>[] = [];
    let ok = true;
    let skorPusat = 0;
    let skorLain = 0;
    for (let i = 0; i < n && ok; i++) {
      const b = baris[i];
      const m = new Map<number, [number, number]>();
      if (b.length === 1) {
        const [w, h] = muat(lebar, tinggi[i], aspek.get(b[0])!);
        if (ukuran(w, h) < lantai(b[0]) || sempit(b[0], w)) { ok = false; break; }
        m.set(b[0], [w, h]);
        if (b[0] === 3) skorPusat += ukuran(w, h);
        else skorLain += ukuran(w, h);
      } else {
        let bestRow: { k: number; a: [number, number]; b: [number, number] } | null = null;
        for (const f of fGrid) {
          const ra = muat((lebar - gap) * f, tinggi[i], aspek.get(b[0])!);
          const rb = muat((lebar - gap) * (1 - f), tinggi[i], aspek.get(b[1])!);
          if (ukuran(...ra) < lantai(b[0]) || ukuran(...rb) < lantai(b[1]) || sempit(b[0], ra[0]) || sempit(b[1], rb[0])) continue;
          // utamakan yang terkecil di antara keduanya, lalu jumlahnya
          const k = Math.min(ukuran(...ra), ukuran(...rb)) * 1000 + ukuran(...ra) + ukuran(...rb);
          if (!bestRow || k > bestRow.k) bestRow = { k, a: ra, b: rb };
        }
        if (!bestRow) { ok = false; break; }
        m.set(b[0], bestRow.a);
        m.set(b[1], bestRow.b);
        skorLain += ukuran(...bestRow.a) + ukuran(...bestRow.b);
      }
      rows.push(m);
    }
    if (!ok) continue;
    const skor: [number, number] = [Math.round(skorPusat * 10) / 10, skorLain];
    if (!terbaik || skor[0] > terbaik.skor[0] || (skor[0] === terbaik.skor[0] && skor[1] > terbaik.skor[1])) {
      terbaik = { skor, rows, tinggiBaris: tinggi };
    }
  }
  return terbaik;
}

/**
 * Susun foto. Mengembalikan penempatan per slot (urut slot) dan ambang yang akhirnya dipakai
 * (diturunkan bertahap bila area terlalu sempit untuk ambang awal).
 */
export function tataFotoDokumentasi(foto: FotoUkur[], opsi: OpsiTata): { penempatan: Penempatan[]; ambang: number } {
  const gap = opsi.gap ?? GAP_BAWAAN;
  const gapV = opsi.gapV ?? gap;
  const cap = opsi.cap ?? CAP_BAWAAN;
  const capBawah = opsi.capBawah ?? 0;
  const aspek = new Map<number, number>();
  for (const f of foto) {
    if (f.slot < 1 || f.slot > 5) continue;
    aspek.set(f.slot, Number.isFinite(f.aspek) && f.aspek > 0.1 && f.aspek < 10 ? f.aspek : 16 / 9);
  }
  const baris = barisUntuk([...aspek.keys()]);
  if (baris.length === 0) return { penempatan: [], ambang: opsi.ambang ?? AMBANG_BAWAAN };
  const avail = opsi.tinggi - baris.length * (cap + capBawah) - gapV * (baris.length - 1);

  let ambang = opsi.ambang ?? AMBANG_BAWAAN;
  let h: Hasil | null = null;
  for (;;) {
    h = cari(baris, aspek, opsi.lebar, avail, gap, ambang, opsi.lebarMin ?? {});
    if (h || ambang <= 0) break;
    ambang = Math.max(0, ambang - 10);
  }
  // pengaman: lebar minimum per slot dilepas bila benar-benar tak ada susunan yang memenuhinya
  if (!h) { ambang = opsi.ambang ?? AMBANG_BAWAAN; for (;;) { h = cari(baris, aspek, opsi.lebar, avail, gap, ambang, {}); if (h || ambang <= 0) break; ambang = Math.max(0, ambang - 10); } }
  if (!h) return { penempatan: [], ambang };

  const penempatan: Penempatan[] = [];
  let y = 0;
  for (let i = 0; i < baris.length; i++) {
    const m = h.rows[i];
    const hBaris = Math.max(...[...m.values()].map(([, hh]) => hh));
    const totalW = [...m.values()].reduce((s, [w]) => s + w, 0) + gap * (m.size - 1);
    let x = (opsi.lebar - totalW) / 2;
    for (const s of baris[i]) {
      const [w, hh] = m.get(s)!;
      penempatan.push({ slot: s, x, yKet: y, y: y + cap + (hBaris - hh) / 2, w, h: hh, hBaris, tinggiKartu: cap + hBaris + capBawah });
      x += w + gap;
    }
    y += cap + hBaris + capBawah + gapV;
  }
  return { penempatan: penempatan.sort((a, b) => a.slot - b.slot), ambang };
}
