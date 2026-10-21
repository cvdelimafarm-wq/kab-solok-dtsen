// app/sigap/foto/antreanFoto.ts  (hanya klien)
//
// (19 Okt 2026) Antrean foto kamera yang belum terkirim (tanpa sinyal). Disimpan di IndexedDB (berkas foto terlalu besar untuk localStorage;
// antreanKirim.ts hanya untuk JSON). Item hanya dibuang dari antrean HP ini SETELAH server menjawab sukses/duplikat -- tidak ada data server yang dihapus.
// Foto yang diambil tanpa token yang masih berlaku dikirim apa adanya: server menetapkan waktu = waktu terima dan menandainya kuning.

const DB = "sigap-foto-antrean";
const TOKO = "antrean";

export type ItemAntrean = {
  id?: number;
  akun_id: number | null;
  dibuat_ms: number;
  blob: Blob;
  kegiatan_id: number;
  token: string | null;
  elapsed_mono_ms: number | null;
  elapsed_wall_ms: number | null;
  waktu_hp: number;
  lat: number;
  lng: number;
  akurasi: number;
  posisi_umur_ms: number | null;
  slot: number | null;
  tag: { akun_id: number; slot_usulan: number | null }[];
  galat_terakhir?: string | null;
  /** (21 Okt 2026) true = foto baru dipotret dan pratinjau masih terbuka (belum "milik antrean"); lihat kirimAntrean.ts */
  draf?: boolean;
  /** detak terakhir draf (ms): layar pratinjau yang masih terbuka memperbaruinya; draf yang detaknya lama dianggap tertinggal dan ikut terkirim */
  jantung_ms?: number;
};

function buka(): Promise<IDBDatabase> {
  return new Promise((ok, gagal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TOKO, { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => gagal(r.error);
  });
}

function jalankan<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return buka().then(
    (db) =>
      new Promise<T>((ok, gagal) => {
        const tx = db.transaction(TOKO, mode);
        const req = f(tx.objectStore(TOKO));
        tx.oncomplete = () => {
          ok(req.result);
          db.close();
        };
        tx.onerror = () => {
          gagal(tx.error);
          db.close();
        };
      })
  );
}

export const tambahAntrean = (x: ItemAntrean) => jalankan<IDBValidKey>("readwrite", (s) => s.add(x));
export const daftarAntrean = () => jalankan<ItemAntrean[]>("readonly", (s) => s.getAll());
export const perbaruiAntrean = (x: ItemAntrean) => jalankan<IDBValidKey>("readwrite", (s) => s.put(x));
export const lepasAntrean = (id: number) => jalankan<undefined>("readwrite", (s) => s.delete(id));

export function formDariItem(x: ItemAntrean): FormData {
  const f = new FormData();
  f.append("berkas", x.blob, "foto.jpg");
  f.append("kegiatan_id", String(x.kegiatan_id));
  if (x.token) f.append("token", x.token);
  if (x.elapsed_mono_ms !== null) f.append("elapsed_mono_ms", String(Math.round(x.elapsed_mono_ms)));
  if (x.elapsed_wall_ms !== null) f.append("elapsed_wall_ms", String(Math.round(x.elapsed_wall_ms)));
  f.append("waktu_hp", String(x.waktu_hp));
  f.append("lat", String(x.lat));
  f.append("lng", String(x.lng));
  f.append("akurasi", String(x.akurasi));
  if (x.posisi_umur_ms !== null) f.append("posisi_umur_ms", String(Math.round(x.posisi_umur_ms)));
  if (x.slot !== null) f.append("slot", String(x.slot));
  if (x.tag.length) f.append("tag", JSON.stringify(x.tag));
  return f;
}
