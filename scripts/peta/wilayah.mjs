// scripts/peta/wilayah.mjs  (murni, tanpa jaringan)
//
// (20 Okt 2026) Membentuk wilayah potong peta per tim dari sel grid 0,01 derajat berisi KK (wilayah-tim.json).
// Sel diperlebar `pad` sel ke segala arah (supaya tepi peta tidak kosong), lalu digabung per baris menjadi persegi panjang yang
// tidak saling menimpa -> GeoJSON MultiPolygon untuk `pmtiles extract --region`.

export const UKURAN_SEL = 0.01;

/** lari [[y,x0,x1],...] -> Set "x,y" semua sel. */
export function selDariLari(lari) {
  const s = new Set();
  for (const [y, x0, x1] of lari) for (let x = x0; x <= x1; x++) s.add(`${x},${y}`);
  return s;
}

/** Perlebar himpunan sel sejauh `pad` sel (kotak (2pad+1)^2 di sekitar tiap sel). */
export function perlebar(sel, pad) {
  if (!(pad > 0)) return new Set(sel);
  const h = new Set();
  for (const k of sel) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) h.add(`${x + dx},${y + dy}`);
  }
  return h;
}

/** Himpunan sel -> lari per baris [[y,x0,x1],...] terurut. */
export function keLari(sel) {
  const perBaris = new Map();
  for (const k of sel) {
    const [x, y] = k.split(",").map(Number);
    if (!perBaris.has(y)) perBaris.set(y, []);
    perBaris.get(y).push(x);
  }
  const lari = [];
  for (const y of [...perBaris.keys()].sort((a, b) => a - b)) {
    const xs = perBaris.get(y).sort((a, b) => a - b);
    let awal = xs[0];
    let akhir = xs[0];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] === akhir + 1) akhir = xs[i];
      else {
        lari.push([y, awal, akhir]);
        awal = akhir = xs[i];
      }
    }
    lari.push([y, awal, akhir]);
  }
  return lari;
}

const b = (n) => Number((n * UKURAN_SEL).toFixed(6));

/** GeoJSON Feature (MultiPolygon) dari lari yang sudah diperlebar. Cincin berlawanan arah jarum jam sesuai RFC 7946. */
export function geojsonDariLari(lari) {
  const poligon = lari.map(([y, x0, x1]) => {
    const w = b(x0), e = b(x1 + 1), s = b(y), n = b(y + 1);
    return [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  });
  return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: poligon } };
}

/** Kotak batas [barat, selatan, timur, utara] dari lari. */
export function kotakBatas(lari) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [y, x0, x1] of lari) {
    w = Math.min(w, x0); e = Math.max(e, x1 + 1); s = Math.min(s, y); n = Math.max(n, y + 1);
  }
  return [b(w), b(s), b(e), b(n)];
}

export function jumlahSel(lari) {
  return lari.reduce((j, [, x0, x1]) => j + (x1 - x0 + 1), 0);
}

/** Wilayah potong satu tim: { lari, geojson, kotak, sel }. */
export function wilayahTim(lariKK, pad = 1) {
  const lari = keLari(perlebar(selDariLari(lariKK), pad));
  return { lari, geojson: geojsonDariLari(lari), kotak: kotakBatas(lari), sel: jumlahSel(lari) };
}

/** Sidik jari pendek (FNV-1a 32 bit) untuk versi berkas. */
export function sidik(teks) {
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
