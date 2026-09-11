# Usulan Update Data DTSEN — Kabupaten Solok

Next.js 15 + Supabase. Project Supabase: `dtsen-usulan-solok` (ref `nlwkpakyfprugqwklxiu`, region Singapura).

## Alur

- **Wali Jorong** (418 orang) — buka `/j/[token]` (link unik per Jorong, tanpa login), isi lembar identifikasi 10 variabel, kirim. Diproses lewat Edge Function `submit-usulan` (sudah live).
- **Operator Wali Nagari** — setup pertama kali lewat **satu link bersama** `/atur-pin`: pilih Nagari, masukkan Kode Aktivasi (dibagikan sekali lewat Surat Edaran resmi), Nomor HP, dan buat PIN sendiri. Selanjutnya login di `/login` pakai **Nomor HP + PIN 6 digit**. Baca usulan masuk, generate & cetak Surat Keterangan, verifikasi, kirim ke BPS.
- **BPS** — sama seperti Operator (Nomor HP + PIN), periksa usulan yang masuk, tandai diterima lengkap / disetujui / ditolak.
- **Dashboard** (`/dashboard`) — progress per Jorong + daftar usulan terbaru.

### Kenapa satu link + kode aktivasi, bukan 74 link unik?

Nomor HP saja bukan rahasia — kalau cuma itu syaratnya, siapa pun yang tahu nomor HP operator bisa buru-buru klaim akun sebelum orang aslinya sempat setup. Kode aktivasi bersama jadi penghalang tambahan yang jauh lebih gampang didistribusikan (sekali umumkan lewat Surat Edaran) dibanding kelola 74 link unik.

### Login pakai Nomor HP + PIN, bukan email

Di belakang layar tetap Supabase Auth email+password (sudah teruji), tapi nomor HP disintesis jadi email placeholder (`hp<nomor>@dtsen-solok.internal`) dan PIN dipakai sebagai password. Operator tidak pernah melihat email ini.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local   # sudah terisi URL & anon key project
npm run dev
```

## Deploy ke Railway

1. Push folder ini ke repo Git.
2. Di Railway: New Project → Deploy from GitHub repo.
3. Set environment variables sesuai `.env.example`.
4. Railway otomatis mendeteksi Next.js dan menjalankan `npm run build` + `npm run start`.

## Yang masih perlu dikerjakan

- **Jalankan pre-provisioning akun Operator Nagari** lewat function `bulk-create-operators` (lihat instruksi terpisah) — membuat 74 akun placeholder yang siap di-setup.
- **Sebarkan Kode Aktivasi** (`SOLOK-46C3MN`) dan link `/atur-pin` lewat Surat Edaran resmi ke Camat/Wali Nagari. Kode ini di-hardcode di function `setup-pin` — kalau perlu diganti/dicabut, redeploy function dengan kode baru.
- **Buat akun BPS** dengan cara yang sama (profiles dengan role `bps`, lewat SQL manual atau function serupa).
- **Isi `wali_jorong_nama` dan `wali_jorong_hp`** untuk 418 baris di tabel `jorong` — dipakai untuk generate link (`token_akses`) dan ditampilkan di Surat Keterangan.
- **Bagikan link Wali Jorong**: `https://<domain-app>/j/<token_akses>` — ambil `token_akses` dari tabel `jorong`.
- Template Surat Keterangan di `/dashboard/usulan/[id]/surat` masih generik — sesuaikan dengan format resmi Pemerintah Nagari kalau ada template baku.

## Edge Functions (sudah live)

- `submit-usulan` — validasi token Jorong, insert ke `usulan` + `status_log`.
- `jorong-info` — validasi token, kembalikan nama Jorong/Nagari/Kecamatan untuk ditampilkan di form.
- `bulk-create-operators` — sekali-pakai, pre-provisioning 74 akun placeholder Operator Nagari. Hapus setelah dipakai.
- `setup-pin` — validasi Kode Aktivasi + Nagari, simpan nomor HP + PIN operator, aktifkan akun.

Base URL: `https://nlwkpakyfprugqwklxiu.supabase.co/functions/v1`
