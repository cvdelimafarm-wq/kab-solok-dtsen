// lib/pdf/sigap/zip.ts
//
// (5 Okt 2026) Penulis ZIP minimal utk unduhan "ZIP per file" SPJ SIGAP -- permintaan user.
// Tidak memakai pustaka (jszip tidak tersedia di semua lingkungan): metode STORE (tanpa kompresi,
// PDF memang sudah terkompresi) + CRC32, nama file UTF-8 (flag bit 11). Cukup utk < 4 GB / < 65535 file.

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABEL_CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Waktu & tanggal format DOS (dipakai header ZIP). */
function waktuDos(d: Date): { waktu: number; tanggal: number } {
  const th = Math.max(1980, d.getFullYear());
  return {
    waktu: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    tanggal: ((th - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function buatZip(files: { nama: string; data: Uint8Array }[], sekarang: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { waktu, tanggal } = waktuDos(sekarang);
  const lokal: Uint8Array[] = [];
  const pusat: Uint8Array[] = [];
  let offset = 0;
  const dipakai = new Set<string>();

  for (const f of files) {
    // Nama ganda diberi akhiran supaya tidak saling timpa saat diekstrak.
    let nama = f.nama;
    for (let i = 2; dipakai.has(nama); i++) nama = f.nama.replace(/(\.[^.]*)?$/, (m) => `_${i}${m}`);
    dipakai.add(nama);
    const namaB = enc.encode(nama);
    const crc = crc32(f.data);
    const ukuran = f.data.length;

    const h = new Uint8Array(30 + namaB.length);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // versi minimal
    v.setUint16(6, 0x0800, true); // bit 11: nama UTF-8
    v.setUint16(8, 0, true); // STORE
    v.setUint16(10, waktu, true);
    v.setUint16(12, tanggal, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, ukuran, true);
    v.setUint32(22, ukuran, true);
    v.setUint16(26, namaB.length, true);
    v.setUint16(28, 0, true);
    h.set(namaB, 30);
    lokal.push(h, f.data);

    const c = new Uint8Array(46 + namaB.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint16(12, waktu, true);
    w.setUint16(14, tanggal, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, ukuran, true);
    w.setUint32(24, ukuran, true);
    w.setUint16(28, namaB.length, true);
    w.setUint16(30, 0, true);
    w.setUint16(32, 0, true);
    w.setUint16(34, 0, true);
    w.setUint16(36, 0, true);
    w.setUint32(38, 0, true);
    w.setUint32(42, offset, true);
    c.set(namaB, 46);
    pusat.push(c);
    offset += h.length + ukuran;
  }

  const ukuranPusat = pusat.reduce((s, x) => s + x.length, 0);
  const akhir = new Uint8Array(22);
  const e = new DataView(akhir.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, ukuranPusat, true);
  e.setUint32(16, offset, true);

  const total = offset + ukuranPusat + akhir.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...lokal, ...pusat, akhir]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
