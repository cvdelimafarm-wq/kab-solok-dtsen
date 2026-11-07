// lib/__tests__/pembantuShapefile.ts
// (7 Nov 2026) Pembangun berkas SHP/DBF kecil untuk uji pembaca shapefile (bukan berkas uji sendiri).

// ---------- pembangun berkas uji
export function bangunShp(rekaman: (number[][][] | null)[]): ArrayBuffer {
  const bagian: Uint8Array[] = [];
  rekaman.forEach((cincin, i) => {
    let isi: ArrayBuffer;
    if (!cincin) {
      isi = new ArrayBuffer(4);
      new DataView(isi).setInt32(0, 0, true);
    } else {
      const nTitik = cincin.reduce((s, c) => s + c.length, 0);
      isi = new ArrayBuffer(44 + cincin.length * 4 + nTitik * 16);
      const dv = new DataView(isi);
      dv.setInt32(0, 5, true);
      dv.setInt32(36, cincin.length, true);
      dv.setInt32(40, nTitik, true);
      let idx = 0;
      cincin.forEach((c, k) => {
        dv.setInt32(44 + k * 4, idx, true);
        idx += c.length;
      });
      let o = 44 + cincin.length * 4;
      for (const c of cincin) for (const [x, y] of c) {
        dv.setFloat64(o, x, true);
        dv.setFloat64(o + 8, y, true);
        o += 16;
      }
    }
    const kepala = new ArrayBuffer(8);
    const kv = new DataView(kepala);
    kv.setInt32(0, i + 1, false);
    kv.setInt32(4, isi.byteLength / 2, false);
    bagian.push(new Uint8Array(kepala), new Uint8Array(isi));
  });
  const total = 100 + bagian.reduce((s, b) => s + b.length, 0);
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setInt32(0, 9994, false);
  dv.setInt32(24, total / 2, false);
  dv.setInt32(28, 1000, true);
  dv.setInt32(32, 5, true);
  let o = 100;
  for (const b of bagian) {
    new Uint8Array(buf).set(b, o);
    o += b.length;
  }
  return buf;
}

export function bangunDbf(kolom: { nama: string; panjang: number }[], baris: (string[] | "hapus")[]): ArrayBuffer {
  const panjangKepala = 32 + kolom.length * 32 + 1;
  const panjangBaris = 1 + kolom.reduce((s, k) => s + k.panjang, 0);
  const buf = new ArrayBuffer(panjangKepala + baris.length * panjangBaris + 1);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8[0] = 3;
  dv.setUint32(4, baris.length, true);
  dv.setUint16(8, panjangKepala, true);
  dv.setUint16(10, panjangBaris, true);
  kolom.forEach((k, i) => {
    const o = 32 + i * 32;
    for (let c = 0; c < k.nama.length; c++) u8[o + c] = k.nama.charCodeAt(c);
    u8[o + 11] = "C".charCodeAt(0);
    u8[o + 16] = k.panjang;
  });
  u8[32 + kolom.length * 32] = 0x0d;
  baris.forEach((b, r) => {
    const o = panjangKepala + r * panjangBaris;
    u8[o] = b === "hapus" ? 0x2a : 0x20;
    if (b === "hapus") return;
    let p = o + 1;
    kolom.forEach((k, i) => {
      const t = new TextEncoder().encode(b[i]);
      u8.fill(0x20, p, p + k.panjang);
      u8.set(t.subarray(0, k.panjang), p);
      p += k.panjang;
    });
  });
  return buf;
}

// kotak kecil di sekitar (100.85, -1.20) searah jarum jam (luar menurut shapefile)
export const kotak = (x: number, y: number, sisi = 0.002): number[][] => [[x, y], [x, y + sisi], [x + sisi, y + sisi], [x + sisi, y], [x, y]];
export const KECIL = (c: number[][]) => c.slice().reverse(); // berlawanan jarum jam

