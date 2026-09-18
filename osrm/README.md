# Server OSRM (jarak jalan) -- panduan deploy ke Railway

Folder ini menjalankan [OSRM](https://project-osrm.org/) (Open Source Routing Machine) sendiri, dipakai aplikasi utama untuk menghitung **jarak jalan** (bukan garis lurus) dari lokasi rumah petugas penyisiran ke titik tengah tiap SLS, di tab **Perencanaan Lapangan**. Lihat komentar di `lib/jarakJalan.ts` untuk detail cara aplikasi memanggilnya.

Kalau server ini belum di-deploy (atau sedang down), aplikasi **otomatis** memakai jarak garis lurus (haversine) sebagai cadangan -- jadi fitur tidak akan pernah error/kosong gara-gara ini, deploy server ini kapan saja siap.

Panduan di bawah ini ditulis SANGAT detail (tombol per tombol) karena dashboard Railway sering berubah tampilan sedikit -- kalau ada label tombol yang sedikit beda dari yang tertulis di sini, cari tombol dengan MAKSUD yang sama (biasanya posisinya mirip).

---

## Bagian 1 -- Buat service OSRM di project Railway yang sama

Asumsi: aplikasi Next.js utama sudah ter-deploy di Railway, dalam satu **Project**. Service OSRM ini akan jadi service KEDUA di project yang sama (satu repo GitHub, dua service, beda Root Directory -- ini yang disebut "monorepo" di Railway).

1. Buka [railway.com](https://railway.com), login, lalu klik **Project** yang sudah berisi aplikasi utama untuk membukanya (masuk ke "project canvas" -- tampilan kotak-kotak/kartu berisi service-service yang sudah ada).
2. Di pojok kanan atas project canvas, klik tombol **`+ Create`**.
3. Dari menu yang muncul, pilih **`Empty Service`**. Sebuah kartu service baru (kosong, belum tersambung ke apa pun) akan muncul di canvas.
4. Ganti nama kartu itu supaya tidak bingung dengan service utama: klik nama service tersebut (biasanya tertulis "Empty Service" atau semacamnya) di bagian atas kartu/panel, lalu ketik nama baru, misalnya `osrm`, dan tekan **Enter**.
5. Klik kartu service `osrm` itu untuk membuka panelnya, lalu klik tab **`Settings`** di bagian atas panel.
6. Di tab Settings, cari bagian **`Source`** (sumber kode). Klik **`Connect Repo`** (atau tombol dengan maksud "hubungkan ke GitHub repo"), lalu pilih repo GitHub yang sama dengan aplikasi utama dari daftar/dropdown yang muncul.
7. Masih di bagian **Source**, cari field **`Root Directory`**. Kalau field ini belum kelihatan, klik dulu link/tombol **`Add Root Directory`** untuk memunculkannya. Isi field ini dengan:
   ```
   osrm
   ```
   (tanpa garis miring di depan, cukup nama foldernya -- ini memberi tahu Railway: "untuk service ini, treat folder `osrm/` di dalam repo sebagai root/akar kode-nya", jadi Railway akan otomatis memakai `osrm/Dockerfile` untuk build service ini, terpisah dari aplikasi Next.js utama).
8. Klik tombol **`Deploy`** yang muncul di bagian bawah/atas panel Settings (atau cukup tekan **`Shift + Enter`**) untuk menyimpan perubahan Source & Root Directory ini. Railway akan mulai build & deploy pertama secara otomatis.

## Bagian 2 -- Tambahkan Volume persisten (WAJIB)

Ini WAJIB dilakukan SEBELUM deploy pertama selesai memproses data (atau segera setelahnya, lalu redeploy) -- tanpa volume, data yang sudah diproses (perintah `osrm-extract`/`osrm-partition`/`osrm-customize`, bisa makan waktu beberapa menit) akan hilang tiap kali container restart/redeploy, dan harus diproses ulang dari nol setiap kali.

1. Dari project canvas (bukan dari dalam panel service), buka **Command Palette** dengan menekan **`Cmd + K`** (Mac) atau **`Ctrl + K`** (Windows/Linux). Ketik kata kunci **`volume`**, lalu pilih opsi untuk membuat volume baru (misalnya "New Volume" / "Create Volume").
   - Alternatif kalau Command Palette tidak memunculkan opsi ini: klik-kanan pada area kosong di project canvas, lalu cari opsi volume di menu yang muncul.
2. Railway akan meminta memilih **service** yang akan disambungkan ke volume ini -- pilih service **`osrm`** yang baru dibuat tadi (JANGAN pilih service aplikasi utama).
3. Sebuah kartu Volume baru akan muncul, biasanya sudah otomatis "menempel" ke kartu service `osrm` di canvas. Klik kartu Volume tersebut untuk membuka pengaturannya.
4. Cari field **`Mount Path`** (lokasi mount di dalam container), isi dengan:
   ```
   /data
   ```
   lalu simpan (biasanya otomatis tersimpan begitu pindah fokus dari field itu, atau ada tombol simpan/checkmark kecil di sebelahnya).
5. Kalau perubahan ini memicu redeploy otomatis, biarkan saja -- itu yang diinginkan (deploy berikutnya akan memakai volume ini).

## Bagian 3 -- Generate domain publik

1. Buka lagi panel service **`osrm`**, klik tab **`Settings`**.
2. Cari bagian **`Networking`**, lalu sub-bagian **`Public Networking`**.
3. Klik tombol **`Generate Domain`**.
4. Railway akan menampilkan sebuah field kecil berisi port (biasanya sudah terisi default, misalnya `5000` atau `8080`) di sebelah tombol tadi, lalu setelah domain ter-generate, sebuah URL publik akan muncul, formatnya seperti:
   ```
   osrm-production-xxxx.up.railway.app
   ```
   **Salin URL ini** (tanpa `https://` boleh, tanpa garis miring `/` di akhir) -- dipakai di Bagian 5.

### Soal port -- kapan perlu diatur manual

Railway (fitur "Magic Ports") otomatis meng-inject environment variable `PORT` ke dalam container saat runtime, dan mendeteksi port yang benar-benar dipakai container untuk mendengarkan koneksi. `entrypoint.sh` di folder ini sudah menyesuaikan diri ke variable itu (`--port "${PORT:-5000}"`), jadi **normalnya tidak perlu diatur apa-apa secara manual** -- cukup Generate Domain seperti di atas.

Kalau setelah deploy sukses (log menunjukkan baris `[osrm] Menjalankan osrm-routed di port ...`) tapi domain publiknya tetap tidak merespons (timeout / "Application failed to respond"):

1. Buka log deploy service `osrm` (tab **`Deployments`** → klik deployment terakhir → lihat log), catat angka port persis yang tertulis di baris `[osrm] Menjalankan osrm-routed di port <ANGKA>`.
2. Buka tab **`Settings`** → **`Networking`** → **`Public Networking`**.
3. Di sebelah domain yang sudah dibuat, akan ada field/dropdown kecil bertuliskan angka port (**Target Port**). Klik field itu, ganti dengan angka port yang dicatat dari log tadi, lalu simpan.
4. Tidak perlu redeploy -- perubahan target port langsung berlaku untuk domain yang sudah ada.

## Bagian 4 -- Pantau proses pertama kali

Buka tab **`Deployments`** pada panel service `osrm`, klik deployment yang sedang berjalan untuk melihat log-nya secara live. Pada deploy PERTAMA, container akan:

- Mengunduh extract OSM Sumatra dari Geofabrik (~beberapa ratus MB),
- Memotongnya ke bounding box Sumatera Barat (env `OSRM_BBOX` di `Dockerfile`, sudah diisi default -- ubah kalau area kerja meluas ke provinsi lain, lihat Bagian 6),
- Menjalankan `osrm-extract` → `osrm-partition` → `osrm-customize`.

Proses ini bisa makan waktu beberapa menit tergantung resource plan Railway. Deploy/restart BERIKUTNYA akan langsung menyala cepat karena data di volume `/data` sudah terproses (asalkan Bagian 2 sudah dilakukan sebelum deploy pertama ini selesai -- kalau volume baru ditambahkan SETELAH deploy pertama, cukup klik tombol **`Redeploy`** sekali lagi dari tab Deployments supaya prosesnya berjalan dan hasilnya kali ini tersimpan di volume).

## Bagian 5 -- Sambungkan ke aplikasi utama

1. Klik kartu service **aplikasi utama** (Next.js) di project canvas yang sama, buka tab **`Variables`**.
2. Klik tombol **`New Variable`**.
3. Isi nama variable:
   ```
   OSRM_BASE_URL
   ```
   dan isi nilainya dengan URL domain yang disalin dari Bagian 3, contoh:
   ```
   https://osrm-production-xxxx.up.railway.app
   ```
   (pastikan pakai `https://` di depan, TANPA garis miring `/` di akhir).
4. Simpan/tambahkan variable tersebut (klik tombol tambah/centang pada form, sesuai yang muncul).
5. Menambahkan variable baru biasanya otomatis memicu redeploy aplikasi utama. Kalau tidak otomatis, buka tab **`Deployments`** aplikasi utama dan klik tombol **`Redeploy`** secara manual supaya env var baru terbaca.

## Menguji server OSRM secara manual

Buka di browser atau `curl` URL berikut (ganti domain & koordinat sesuai kebutuhan -- format OSRM: `lon,lat`, BUKAN `lat,lon`):

```
https://osrm-production-xxxx.up.railway.app/table/v1/driving/100.6520,-0.7893;100.6600,-0.8000?sources=0&destinations=1&annotations=distance
```

Respons sukses berbentuk JSON `{"code":"Ok","distances":[[..., <meter>]]}`. Kalau responsnya bukan itu (error/timeout), aplikasi utama akan otomatis pakai haversine sampai server ini bisa dijangkau lagi.

## Bagian 6 -- Kalau butuh area lebih luas dari Sumatera Barat

1. Buka file `osrm/Dockerfile` di repo, ubah baris `ENV OSRM_BBOX="98.4,-3.5,101.9,0.8"` (format: `kiri,bawah,kanan,atas` = `min_lon,min_lat,max_lon,max_lat`).
2. Push perubahan ini ke GitHub -- Railway akan otomatis mendeteksi push baru dan mulai redeploy service `osrm` (kalau auto-deploy aktif; kalau tidak, klik **`Deploy`** manual dari panel service).
3. **Hapus isi volume `/data`** supaya data diproses ulang dengan bbox baru -- kalau tidak dihapus, `entrypoint.sh` akan mengira data lama (bbox kecil) sudah cukup dan TIDAK memproses ulang. Caranya: buka kartu Volume di canvas → cari opsi hapus/kosongkan data (biasanya di menu titik-tiga `...` pada kartu volume, atau hapus volume lalu buat baru dengan mount path `/data` yang sama seperti Bagian 2).

---

Sources:
- [Public Networking | Railway Docs](https://docs.railway.com/public-networking)
- [Application Failed to Respond | Railway Docs](https://docs.railway.com/networking/troubleshooting/application-failed-to-respond)
- [Changelog #0192 — Magic Ports, Dashboard Performance Improvements, Volume Support in Runtime V2 | Railway](https://railway.com/changelog/2024-06-28-magic-ports)
- [Deploying a Monorepo | Railway Docs](https://docs.railway.com/deployments/monorepo)
- [Deploying a Monorepo to Railway | Railway Guides](https://docs.railway.com/guides/deploying-a-monorepo)
- [Using Volumes | Railway Docs](https://docs.railway.com/volumes)
- [Using Variables | Railway Docs](https://docs.railway.com/variables)
- [Ultimate Guide to Deploying Monorepo Project on Railway App | Kapsys](https://kapsys.io/user-experience/ultimate-guide-to-deploying-monorepo-project-on-railway-app)
