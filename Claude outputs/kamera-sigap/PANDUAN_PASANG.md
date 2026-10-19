# Kamera SIGAP — panduan pasang (19 Okt 2026)

Semua berkas di folder ini adalah **salinan baru yang belum ada di repo Anda**. Tidak ada berkas repo yang saya ubah, tidak ada migrasi yang dijalankan, tidak ada yang di-push. Anda yang menyalin, menjalankan SQL, commit, dan push.

Aturan yang dipegang: tidak ada hapus otomatis; saklar bawaan `unggah` (migrasi tidak mengubah perilaku apa pun sampai Anda menyalakan kamera); masa simpan 3 tahun hanya penanda.

## 1. Berkas yang disalin (struktur sama dengan repo)

| Berkas | Isi |
|---|---|
| `supabase/migrations/20261019d_kamera_sigap.sql` | Tabel, kolom, fungsi, pengaman. **Dijalankan oleh Anda.** |
| `lib/sigapFoto.ts` | Aturan murni: waktu resmi, kepercayaan hijau/kuning/merah, kode, masa simpan 3 tahun |
| `lib/sigapFotoCap.ts` | Cap di server (sharp): logo, teks, QR, sidik gambar |
| `lib/sigapFotoServer.ts` | Token potret, saklar, hak akses, rekan tim, wilayah tugas |
| `lib/sigapFotoRoute.ts` | Pembantu sesi untuk route |
| `lib/__tests__/sigapFoto.test.ts` | 25 uji logika murni |
| `app/api/sigap/foto/{mode,token,rekan,tag,tag/keputusan,berkas,periksa,pengaturan,usulan-hapus}/route.ts` dan `app/api/sigap/foto/route.ts` | API |
| `app/api/verifikasi-foto/route.ts`, `app/verifikasi/page.tsx` | Verifikasi publik (kode/QR + unggah) |
| `app/sigap/foto/*` | Kamera, Bagikan, Foto saya, Periksa, antrean IndexedDB, halaman, **gerbang `FotoKegiatan`** |
| `app/sigap/kelola/foto/page.tsx` | Saklar, foto perlu diperiksa, usulan hapus |
| `public/fonts/PlusJakartaSans-{Bold,Regular}.ttf` | Font cap (dipakai langsung oleh sharp; tidak bergantung font Railway) |
| `public/sigap-logo-cap.png` | Logo SIGAP final untuk cap |
| `uji-tambahan/*` | Uji opsional (SQL di PGlite, route dengan DB tiruan, cap, token). Bukan bagian aplikasi |

## 2. Urutan pasang

1. Salin berkas di atas ke repo.
2. `npm i qrcode` dan `npm i -D @types/qrcode` (sharp sudah ada).
3. (Opsional) set `NEXT_PUBLIC_SITE_URL=https://bps-solokkab.up.railway.app` agar QR selalu memakai alamat tetap. Tanpa itu dipakai alamat permintaan.
4. `npm test` lalu `npx tsc --noEmit`.
5. Jalankan SQL `20261019d_kamera_sigap.sql` di Supabase (aman sebelum atau sesudah deploy; bawaan tetap `unggah`).
6. Commit dan push (Anda). Deploy.
7. Sambungkan dua titik pasang di bawah.
8. Uji dengan satu kegiatan: Kelola › Foto kamera › set kegiatan itu `Kamera SIGAP`.

## 3. Dua titik pasang yang belum bisa saya pasang

Berkas ini **tidak ada di salinan repo yang saya punya**, jadi saya tidak mengedit dan tidak mengujinya:

**a. Halaman foto kegiatan (Transport Lokal/Dokumentasi).** Bungkus komponen unggah foto lama:

```tsx
import FotoKegiatan from "@/app/sigap/foto/FotoKegiatan";
// ...
<FotoKegiatan kegiatanId={penugasan.kegiatan.id} fallback={<UnggahFotoLama ... />} />
```

Mode `unggah` (atau saklar gagal dibaca) menampilkan `fallback` apa adanya. Mode `kamera` menampilkan tombol ke `/sigap/foto?kegiatan=ID`.

**b. Kartu di beranda portal untuk Kelola › Foto kamera.** Di `lib/portal/server.ts` (`susunBeranda`), tambahkan kartu seperti kartu Kelola lain, mis.:

```ts
if (akun_super_atau_izin) kartu.push({ kode: "foto", grup: "kelola", judul: "Foto Kamera", uraian: "Saklar kamera/unggah, pemeriksaan foto, usulan hapus.", href: "/sigap/kelola/foto" });
```

Hak admin foto: akun `super`, atau izin `translok.verifikasi` level `kelola` (dimiliki 4 peran saat ini; konstanta `MENU_ADMIN_FOTO` di `lib/sigapFotoServer.ts`, mudah diganti ke menu lain, mis. `akses.kelola`). Pemeriksaan foto juga bisa oleh PML pemotret (dari alokasi Sub SLS/kelompok), tanpa izin menu. Tanpa kartu, halaman tetap terbuka lewat alamat langsung.

## 4. Cara kerja singkat

- Petugas membuka kamera: server menerbitkan **token** (waktu server). Waktu foto = waktu token + jam monotonik HP. Mengubah jam HP tidak berpengaruh.
- Foto dikirim dengan koordinat GPS. Akurasi > 100 m ditolak. Server mencetak cap (logo, waktu WIB, koordinat, wilayah bila dikenali, nama, kegiatan, kode, QR) lalu menyimpan ke bucket `sigap-files` di `kamera/<kegiatan>/<tanggal>/<kode>.jpg`.
- Server menilai **hijau/kuning/merah**. Merah = tag ditahan, belum masuk nomor foto, sampai PML/admin menandai Diperiksa.
- Foto yang diterima menulis baris ke `sigap_dokumentasi` (`sumber='kamera'`, `foto_id`), jadi alur SPJ lama tetap berjalan.
- Hari kerja, batas 23.59 WIB, kunci admin, dan periode memakai `cekAksesIsian` yang sama dengan unggah lama (terhadap **tanggal foto**).
- Tag: rekan tim dari kelompok kortim/PML + alokasi Sub SLS (PML↔PPL) yang punya penugasan aktif di kegiatan sama; di luar tim lewat pencarian, wajib disetujui penerima, boleh jadi bukti kegiatan penerima (kegiatan tujuan harus bermode kamera). Maksimal 8 orang per foto.

## 5. Hal yang berbeda dari mockup (harap dibaca)

1. **Cap tanpa peta mini** (tidak ada tile peta di server).
2. **Nama nagari/kecamatan hanya bila** titik berada dalam 1,5 km dari KK pada Sub SLS alokasi petugas; selain itu hanya koordinat.
3. **Kode 12 heksa** (`SGP-XXXX-XXXX-XXXX`), bukan 8.
4. **Halaman verifikasi publik tidak menampilkan foto arsip** maupun koordinat; foto hanya terlihat setelah login (pemotret, yang di-tag, PML, admin). Unggah tanpa kode hanya cocok persis (SHA-256); dengan kode juga bisa "mirip" (sidik gambar).
5. **Nomor foto tidak bisa diubah penerima setelah Terima** (mengubah = mencabut baris = hapus). Pilih nomor sebelum menekan Terima. Jika nomor itu sudah terisi, foto lama dilepas dari nomornya (tidak dihapus; berkas lama dicatat di `sigap_audit`).
6. **"Dipertanyakan" hanya menandai.** Baris nomor foto yang sudah terisi tidak dicabut (mencabut = hapus). Foto/tag baru yang dipertanyakan ditahan.
7. **Foto tanpa sinyal**: bila token sempat diperoleh dalam 30 menit sebelumnya, waktunya tetap terverifikasi; bila tidak, waktu = waktu terima server dan ditandai kuning. Foto yang baru terkirim setelah lewat 23.59 ditolak seperti jalur lama kecuali ada izin susulan.
8. Saklar bekerja di **tampilan** (gerbang `FotoKegiatan`) dan di route kamera (kegiatan bermode unggah ditolak 403). Route unggah foto lama **tidak saya ubah**, jadi tetap bisa dipanggil langsung walau kegiatan bermode kamera. Kedua jenis foto bisa berdampingan karena tiap baris `sigap_dokumentasi` punya `sumber`.

## 6. Masa simpan 3 tahun dan penghapusan (tanpa hapus otomatis)

- `simpan_sampai` = tanggal selesai kegiatan (atau tanggal foto bila lebih akhir) + 3 tahun. **Asumsi**: dihitung dari akhir kegiatan; ubah di `simpanSampai()` bila SPJ memakai acuan lain. Angka 3 tahun adalah keputusan Anda; saya belum memverifikasinya ke jadwal retensi arsip.
- Foto tanpa tag diterima: ditandai setelah 90 hari.
- Kelola › Foto kamera menampilkan: masa simpan habis, tidak pernah dipakai, diusulkan, disetujui. Admin **mengusulkan**, akun super **menyetujui**. Sistem berhenti di situ.
- Database melarang `DELETE` pada `sigap_foto` dan `sigap_foto_tag` (trigger). Penghapusan fisik berkas Anda lakukan sendiri:

```sql
-- 1) daftar yang sudah Anda setujui dan berkasnya belum dihapus
select id, kode, file_path from sigap_foto
 where hapus_disetujui_at is not null and file_dihapus_at is null;
-- 2) hapus berkas itu secara manual di Supabase Storage (bucket sigap-files)
-- 3) tandai (baris tidak dihapus, hanya diberi tanda)
update sigap_foto set file_dihapus_at = now() where id in (/* id yang berkasnya sudah dihapus */);
```

**Peringatan:** foto yang menjadi bukti (`sigap_dokumentasi.foto_id` terisi) akan meninggalkan baris SPJ dengan berkas yang hilang bila dihapus. Halaman Kelola menandainya "dipakai sebagai bukti". Jangan hapus sebelum masa pemeriksaan SPJ selesai.

## 7. Saklar dan pemulihan

- Kelola › Foto kamera: bawaan global + per kegiatan (Ikuti bawaan / Kamera SIGAP / Unggah foto). Setiap perubahan dicatat di `sigap_audit` (`foto.saklar`).
- Darurat tanpa membuka aplikasi: `update sigap_foto_pengaturan set mode_bawaan='unggah' where id=1;` dan `update sigap_foto_pengaturan_kegiatan set mode='unggah';`.
- Bila tabel pengaturan tidak terbaca, aplikasi memakai metode lama (unggah). Kamera tidak pernah dipaksa.

## 8. Yang sudah diuji, dan yang belum

Sudah (di sandbox, tanpa menyentuh database Anda):
- 25 uji logika murni (waktu resmi, kepercayaan, kode, masa simpan).
- Cap: hasil gambar dilihat langsung (potret, mendatar, nama panjang). Sidik gambar tetap dekat setelah cap dan kompresi ulang.
- SQL dijalankan di Postgres sementara (PGlite) dengan tabel tiruan: idempoten, penempatan, ganti nomor terisi (tanpa hapus), tahan→lepas, larangan DELETE/ubah kolom bukti, unik, fungsi tak bisa dipanggil peran `anon`/`authenticated`. Kolom dan batasan tabel produksi dibaca (hanya baca) untuk mencocokkan; tidak ada trigger lain pada `sigap_dokumentasi`.
- Route POST foto dengan DB tiruan (11 skenario: normal, merah, tanpa token, luar tim, akurasi, mode unggah, kunci/23.59, duplikat, token ganda, batas tag).
- `tsc --noEmit` bersih untuk semua berkas baru.

Belum:
- **Tidak diuji di database produksi, di HP sungguhan, atau di Railway.** GPS, kamera, IndexedDB, dan izin peramban hanya teruji secara tipe, bukan di perangkat. Uji di satu HP Android dan satu iPhone.
- Route `tag/keputusan`, `periksa`, `usulan-hapus`, `pengaturan` hanya lolos tipe dan ditinjau; belum ada uji otomatis.
- Memori sharp di Railway: dipasang `cache(false)` dan `concurrency(1)`; pantau saat uji beban (lihat catatan kebocoran memori).
- Titik pasang 3a/3b belum dipasang.

## 9. Batas yang harus dipahami pemakai

Peramban tidak bisa membuktikan GPS tidak dipalsukan atau kamera asli. Yang dilakukan: waktu dari server, akurasi, jarak ke wilayah, kecepatan antar-foto, koordinat identik, sidik gambar, kode/QR, pemeriksaan PML, dan jejak hanya-tambah. Ini mempersulit dan membuat kecurangan terdeteksi, bukan menutup mutlak. Foto di dalam rumah responden perlu izin responden.
