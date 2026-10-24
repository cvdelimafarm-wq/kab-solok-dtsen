# lib/keu — gerbang aplikasi ke basis data keuangan (SIGAP Kertas Kerja Revisi POK)

Dipasang bersama berkas SQL `20261024l_keu_tulis.sql` (fungsi `keu_jalankan` dan `keu_tulis`). Tanpa berkas itu rute ini membalas 502 "migrasi belum dijalankan".

## Berkas
- `lib/keu/galat.ts`: SQLSTATE basis data -> status HTTP + pesan (pesan RAISE berbahasa Indonesia diteruskan; galat tak terduga tidak dibocorkan).
- `lib/keu/gerbang.ts`: `panggilKeu`, `tulisKeu` (hanya memakai `db.rpc`), pemeriksa masukan, dan `tanganiPanggil` / `tanganiTulis` (logika rute yang bisa diuji). Sesi "masuk sebagai" hanya boleh memanggil `FUNGSI_BACA`.
- `app/api/sigap/keu/panggil/route.ts`: `POST { fungsi, args }` (Authorization: Bearer <sesi>).
- `app/api/sigap/keu/tulis/route.ts`: `POST { tabel, op: "insert"|"update", data, kunci? }`.
- `lib/keu/__tests__/gerbang.test.ts`: 19 tes.

## Cara memakai dari halaman (contoh)
```ts
const r = await fetch("/api/sigap/keu/panggil", {
  method: "POST",
  headers: { Authorization: `Bearer ${sesi}`, "Content-Type": "application/json" },
  body: JSON.stringify({ fungsi: "keu_struktur_aksi", args: { p_id: 12, p_aksi: "ajukan" } }),
});
const j = await r.json(); // { data } atau { error, kode } dengan status 403/422/409/...
```
`p_akun` tidak pernah dikirim klien; server mengisinya dari sesi. Hak ditegakkan basis data, bukan rute ini.

## Yang sengaja belum ada
Pembacaan data (view `keu_v_*`) lewat rute terpisah per layar, dengan saringan hak akses per RO; dibangun bersama halaman `/sigap/ro/<KODE>`.
