# Ringkasan gabungan: Anggaran, Revisi POK, Mockup Kertas Kerja, Skema SQL (21-24 Okt 2026)

## Cakupan

Menggabungkan 37 catatan Proyek PORTAL BPS (SIGAP, BPS Kab. Solok) bertanggal 21-24 Okt 2026: tata kelola kantor (mockup+skema, 21 Okt); menu sidebar v2, klien Supabase bersama, logika RAB, tab Anggaran/RAB, daftar uji pasca-deploy, cek PMK vs skema Draf 4 (22-23 Okt); mockup "Kertas Kerja Revisi POK SIGAP" tahap 1-14 (23-24 Okt); skema SQL `keu_` Fase A-N, impor POK 2026, tahap bangun 4c-4n, selisih mockup vs produksi (24 Okt); perbaikan "Foto saya" (23 Okt). "Bapak" = M. Iqbal Hadi. SQL lengkap ada di repo laptop (skema-sql/arsip-proyek). Angka bertanda ILUSTRASI di sumber bukan data nyata.

---

## 1. Arah produk dan dasar hukum

- SIGAP = Sistem Integrasi Kegiatan BPS (payung, keputusan 22 Okt), bukan lagi nama modul anggaran/SPJ (usulan Claude, belum diputuskan: "Anggaran & SPJ").
- Draf 4 (dikoreksi 23 Okt): SIGAP = platform pengelolaan satu kegiatan statistik berbasis GSBPM; kertas kerja revisi hanya satu fitur. Satker = pengguna layanan, bukan pemutus; PMK dipakai untuk menentukan jenis revisi, lampiran, pemeriksaan kesesuaian, pengingat tenggat. Empat jenis: Revisi POK (Pasal 173), Administrasi (Pasal 120 ayat 4), DIPA DJPb (Pasal 172, 174), DIPA DJA (Pasal 165). Mode Pagu Tetap (POK/Administrasi) vs Mode Revisi DIPA. Pemicu P-01..P-08 = ketidaksamaan RAB dengan POK.
- Invarian: RAB hanya acuan, tidak pernah ditulis ke POK.
- Pengesah (keputusan 24 Okt): sah cukup di PPK; KPA hanya menerima laporan (butuh SK pendelegasian KPA ke PPK; Bapak menjawab "iya"). PPK rangkap ketua tim: RAB langsung sah.
- Fitur tak mungkin selesai sebelum batas DJA 30 Okt 2026; revisi TA 2026 manual, SIGAP disiapkan untuk TA 2027.

**Cek PMK (23 Okt; PMK 62/2023, 107/2024, 41/2026, bukan naskah konsolidasi):**
- Pergeseran dalam 1 KRO oleh KPA sesuai (Pasal 173; IV.C 5a-c); syarat: pagu satker, satuan/volume RO, jenis belanja, sumber dana tetap; reviu APIP. "Bukan RO PN" lebih ketat dari PMK (jadikan aturan internal berlabel).
- Jenis belanja = dua digit pertama akun (terverifikasi). Antar jenis belanja = DJPb (Pasal 124 ayat 2b); turun volume RO total = DJA.
- Antar-KRO/antar-kegiatan/antar-satker harus dipecah: antar-Kegiatan, antar-Satker, Kegiatan baru = Eselon I + Kanwil (Pasal 172); antar-Program = DJA; antar-Kanwil = Dit. Pelaksanaan Anggaran. Antar-KRO dalam 1 Kegiatan di luar Pasal 173 (ada kerancuan dengan Lampiran 2.af; ikuti yang ketat, tanya Kanwil).
- Tambah pagu bukan wewenang KPA. Belanja pegawai tidak jadi sumber penutup (Pasal 146, 144). Pagu baris tidak di bawah Booked+Realisasi = prinsip (Pasal 180), istilah Booked tidak ada di PMK. RO/Komponen Khusus sesuai; "Izin Presiden" bukan syarat RO Khusus (Pasal 165 ayat 1e7 dan 159).
- Baris penggenap lump sum: tidak ada rujukan (tak didukung/tak dilarang); Pasal 124 ayat 4 menelaah relevansi akun dengan RO, jadi rawan; tanya Kanwil/APIP.
- Status Mode DIPA perlu ditambah: Diterapkan, Disetujui KPA, (Eselon I), Diajukan, Dikembalikan/Ditolak/Disahkan; jangan komitmenkan belanja terdampak sebelum Disahkan. Plt/Plh Kepala Satker otomatis KPA (Pasal 183); PPK tidak boleh rangkap KPA/PPSPM.
- **Tenggat:** DJA 31 Okt (Sabtu; efektif Jumat 30 Okt); DJPb dan revisi K/L yang mengubah DIPA 30 Nov; Revisi POK/administrasi 27 Des (Minggu; efektif 23 Des karena 24-25 Des libur, SKB 1497/2025); pagu minus belanja pegawai 31 Des; item tertentu 15 Des. Lewat batas hanya direktif Presiden/mendesak dengan Menkeu (Pasal 179).
- Dampak: artboard u1, u2, u4 (berlabel antar-RO) ternyata antar-Kegiatan, u3 antar-Program, perlu label dikoreksi. Penanda pergeseran perlu lima tingkat (dalam RO, antar-RO dalam KRO, antar-KRO, antar-Kegiatan, antar-Program). `keu_revisi.jenjang_berwenang` terlalu kasar (PMK: enam pemutus); status belum punya "dikembalikan".
- Belum pasti: PER-9/PB/2023 masih berlaku utuh?; kolom wewenang beberapa baris IV.C sulit dibaca; Perdirjen terbaru dan SK cuti bersama 2026 tak diperiksa; apakah POK Solok punya RO Khusus (Q-20).

## 2. Aturan bisnis kertas kerja revisi POK (keputusan Bapak, mockup tahap 1-14)

Mockup: https://claude.ai/artifact/6uugHF9thUYQC1JKAii7Ap (7 artboard V1 sampai 16 papan V45); contoh KRO 2903.BMA (3 RO, 80 detail, Rp 640.959.000, POK nyata 30 Sep 2026).

**Tampilan/interaksi:** hierarki RO > Komponen > Akun > Item; kolom SEMULA|MENJADI|PERUBAHAN|KETERSEDIAAN (Booked, Realisasi, Cek); label "revisi ke-N" mengikuti nomor revisi POK. Warna: RO navy, Komponen biru muda, Akun amber, Item putih, rincian RAB hijau muda; POK Jumlah biru, RAB Jumlah hijau. Kolom Satuan di MENJADI (perubahan satuan item perlu kolom di skema). Tabel dipadatkan, judul kolom tengah, kartu selebar layar. Aksi lewat kotak centang + bilah aksi (Ganti akun, Batalkan pindah akun, Tambah item, Tandai selesai, Buka kembali, Tampilkan RAB, Hanya yang dipilih), bukan tombol per baris. Modal konfirmasi sebelum semua hapus. Grid "Per bulan" tepat di bawah baris rincian pemilik. Tema SIGAP navy #0F2A46.

**Ganti akun (skema pasangan, usul Bapak):** akun lama dikosongkan, akun baru berisi salinan dengan Semula kosong, tampil berpasangan (P-03; P-08 bila angka/redaksi ikut berubah). Item dengan Booked/Realisasi: hanya sisa dipindah, akun lama menampung Booked+Realisasi; bila pagu habis terpakai tidak bisa dipindah. Skema butuh `pindah_dari`/`pindah_ke` dan jumlah tersimpan.

**Redaksi (tahap 10):** uraian item POK resmi tidak diedit langsung; ganti = kosongkan lama + tambah baru (pasangan, P-02; bila akun/angka ikut berubah P-08). Item non-POK boleh diedit langsung. Terbuka: P-02 saja atau P-06+P-07 (tanya Kanwil).

**RAB dan jadwal:** item boleh dirinci banyak baris; status Belum ada RAB / RAB = Item / RAB rinci. Periode Sekali/Bulanan/Triwulanan; jadwal 12 bulan, tag minggu M1 (tgl 1-7), M2 (8-14), M3 (15-21), M4 (22-akhir); format "Ke samping" atau "Lipat per bulan". Usulan tag bawaan (ILUSTRASI, isian Claude): honor/jasa profesi M4, perjalanan dan transport lokal M4, paket meeting M3, bahan/persediaan M2, modal M3, lainnya M3. Item selesai: anggaran dikosongkan sampai Booked+Realisasi, sisa jadi dana bebas (kalimat Bapak terpotong, ini asumsi). Kartu: Kelengkapan RAB (x/y), Realisasi TA lalu (ILUSTRASI), Realisasi resmi SPAN (unggah mengunci Realisasi; mengurangi RAB bulan terdepan FIFO; baris merah bila tanpa RAB, melebihi RAB, bulan tak terjadwal).

**Kecukupan dan geseran (tahap 8-11):** K = RAB belum selesai / faktor (bawaan 0,9, nilai belum diputuskan) + RAB selesai; toleransi 5%. Status Kurang (POK<RAB), Tipis (<K), Cukup (<=K(1+r)), Lebih; per KRO dan kelompok, hanya item ber-RAB. Kelompok belanja: 51; 524; 52L (52 selain 524); 53 (R-16); donor, penerima, penggenap satu kelompok. Dua tombol: "Terapkan RAB dalam batas pagu" (geseran minimal) dan "RAB penuh (Revisi DIPA)". Sumber berurutan: Dana penggenap, item selesai, kelebihan di atas RAB, tanpa RAB (opsi), kategori ditunda (opsi); tidak di bawah Booked+Realisasi (R-06). Kekurangan = max(0, RAB-POK) per item (angka turunan). Buku selisih dengan jalur penutup bertingkat (turunkan volume ditunda; KRO lain DJPb tingkat 3; antar-Kegiatan Eselon I tingkat 4; tambah pagu/antar-Program DJA tingkat 5; tunda). Revisi DIPA: PPK memutuskan per KRO terima semua/sebagian/tunda.

**Dana penggenap (tahap 9, menggantikan tahap 8):** sisa ditampung baris penggenap per akun (ketentuan kantor): 524 menjadi "Perjalanan dinas Kabupaten", akun 52 lain = nama akun + "Kabupaten". Tak pernah minus (D-30), tepat pagu (R-17), hanya 52xxxx, satu baris per akun+komponen (D-09). Akibat: satu RO bisa punya beberapa baris penggenap 524111/524113/524119; bila ingin satu baris perlu akun penampung. Kategori prioritas bawaan (Inti/Penting/Dapat ditunda) tidak sesuai kebiasaan kantor; bisa ditambah/diubah/ditandai boleh ditunda.

**Kekurangan RAB (papan 15):** pencatat hanya ketua tim dan admin RO RO sendiri; PPK mencatat tambahan pagu resmi (DJA/DJPb); ketua tim memutuskan per catatan penuhi/tunda/tolak (tolak wajib alasan; total <= tambahan; sisa jadi penggenap; tunda muncul lagi pada tambahan berikut).

**Peran dan alur (papan 10-11):** admin RO ajukan, ketua setujui, PPK sahkan; pengaju tidak menyetujui sendiri; ketua yang mengajukan langsung ke PPK; PPK rangkap ketua langsung sah. Ketua tim ditetapkan hanya Admin Aplikasi (D-31); satu orang boleh banyak peran; kode RO nyata tak selalu angka (D-32). Jadwal bawaan Revisi POK tgl 10 tiap bulan; sah wajib nomor+tanggal dokumen.

**Administrasi per item (papan 13):** item dipetakan ke lembar kelengkapan (akun+uraian); status Belum/Draf SIGAP/Terunggah/Terverifikasi; verifikasi PPK dan/atau bendahara atau akun diberi kewenangan (contoh Tata Usaha); item tanpa lembar pakai pola umum; seksi "D" ganda diganti E; seluruh 297 dokumen (265 SME + 32 pola) ditandai dapat dibuat SIGAP, dikoreksi satu per satu lewat Master.

**Master (papan 14) dan level baru (papan 16):** Master: 43 akun, 20 satuan baku (OJP=Orang/Jam/Pelajaran, THN, EA, M2, OT, U/THN=Unit/Tahun, M2/TH; alias SEGMN digabung SGMN), 7 pola dokumen, kewenangan 17 tindakan x 9 peran (Admin dan PPK boleh ubah master), skor RAB (bobot 35/25/20/20; ambang 85/70; terlihat semua; pembinaan; hanya PPK ubah; rumus sementara dari Claude). Level baru (P1-P8, 8 level, kode sementara T-nnn). Jalur: Item/Akun = Revisi POK; Komponen biasa/Subkomponen = Revisi POK (DUGAAN); Komponen Khusus = DJA; RO baru = DJPb (DUGAAN); KRO baru = DJPb; Kegiatan baru = Eselon I+Kanwil; Program baru = DJA; tambah pagu = DJA.

**Uji berkas contoh (tahap 13):** Excel GLP039 "Laporan Fa Detail 16 Segmen" (periode September 2026) hanya Kegiatan 2906 (2 RO, 52 item, Rp 395.774.000), terbaca benar semua; seluruh satker (Rp 13,4 miliar) belum ada. PDF laporan salah 2 dari 52 baris (hanya tampilan). PDF POK RKKS 30 Sep: 38 RO, 677 baris, Rp 13.431.536.000 cocok; 29 baris selisih pembulatan harga. Lock Pagu = pagu sedang diusulkan revisi (RO 2906.BMA.005: pagu revisi 10.682.000, lock 1.823.000, POK 8.859.000). Nomor item (mis. 000252) hanya di laporan realisasi. Parser acuan: `claude/referensi/parser-laporan-fa-detail-xlsx.py`.

## 3. Struktur SQL `keu_` per fase

Prinsip: aplikasi mengisi `app.akun_id` per transaksi, penjaga tabel memeriksa `keu_boleh`; kosong (editor SQL) = hak tak diperiksa tetapi aturan data berlaku. Tanpa DELETE dari aplikasi; riwayat append-only; audit ke `sigap_audit`; RLS aktif; satu ketua tim aktif per RO, satu PPK dan KPA. Migrasi aman diulang; tiap fase punya cek baca-saja `z..` (baris P0 harus 0). Uji di sandbox PostgreSQL 16. Tabel `keu_` berjalan: A 25, B 39, D 45, E 48, F 51, G 53; l, m, n tanpa tabel.

| Fase | Berkas | Isi utama | Cek/uji |
|---|---|---|---|
| A | `20261024a_keu_master`, `b_keu_master_dokumen`, `c_keu_pok` | master (akun 43, satuan 20, level 8, jalur 26, RO 35, 297 dokumen), POK versi/node/detail, alias kunci, `keu_pok_berlakukan` | `z_cek_kesehatan_keu`, `gen_a.js` |
| B | `d_keu_rab`, `e_keu_revisi`, `f_keu_kertas_kerja` | RAB+jadwal, jadwal/usulan/sah/antrean KPA, kertas kerja, geseran, keputusan KRO, R-xx | `z2_..._bdf`; uji 30-32; `jalan.sh semua` (17 berkas) |
| (g) | skrip impor POK | bagian 4 | - |
| D (h) | `h_keu_unggah_realisasi_skor` | unggah POK resmi/realisasi GLP039, banding, peringatan SPAN, skor | `z3`; uji 40; `jalan_h.sh` |
| E (i) | `i_keu_administrasi` | adm_peta/dok/riwayat, `keu_adm_aksi` | `z4`; uji 41 |
| F (j) | `j_keu_kekurangan` | kekurangan, tambahan pagu, putus | `z5`; uji 42 |
| G (k) | `k_keu_struktur_usulan` | usulan struktur, kode T-nnn, pencocokan | `z6`; uji 43 |
| l | `l_keu_tulis` | gerbang `keu_tulis`, `keu_jalankan` | `z7`; uji 44 |
| m | `m_keu_v_penugasan_ro` | view penugasan | `z8`; uji 45 |
| n | `n_keu_v_rab_baris` | view `keu_v_rab_baris`, `keu_v_rab_jejak` | `z9`; uji 46, 47; `jalan_n.sh` |

Tambahan: SQL o (view `keu_v_rab_jadwal_item`), z10, p (`keu_usulan_buat`, izin gerbang, `keu_v_usulan_jejak`) SUDAH diterapkan. Draf lama `20261022b_keu_anggaran.sql` JANGAN dijalankan.

**Cara menjalankan produksi:** cek `list_tables`; pasang berurutan a-c, d-f, h, i, j, k, l, m, n (SQL editor, "Run and enable RLS"); jalankan z tiap fase dan `z_cek` terbaru (baris 4 = "N dari N": 39, 45, 48, 51, 53). Hak aplikasi di DB hidup setelah penugasan (ketua tim, admin RO, PPK) diisi.

**Aturan pokok per fase:**
- A: harga_satuan numeric(18,2); `jumlah` disimpan (bukan volume x harga) + `selisih_pembulatan`; nomor_item terpisah dari kunci_stabil; node punya `kemunculan`, `ro_kode`, volume/satuan RO. Tata Usaha verifikasi hanya bila PPK memberi.
- B: alur RAB/usulan (D-02/03); jadwal hanya PPK (D-25), sah menaikkan versi sistem dan antrean KPA; kertas kerja per jadwal+RO; Semula terkunci, akun/redaksi POK resmi diganti via `keu_kk_pasangkan` (D-11/13). Pemeriksaan R-01,03,05,07,08,09,15,16; pada Pagu Tetap R-01/03/05/16 merah dan MERAH MENGHALANGI status diterapkan. Kecukupan D-28, keputusan PPK per KRO D-15, faktor 0,9 dan toleransi 5% di `keu_master_param`. Belum dihitung: R-02, R-04 (menunggu kolom), R-06 (menunggu realisasi), R-10..14. Penggenap satu per akun+komponen.
- D: unggah POK oleh PPK (`pok_pdf`), nomor revisi harus lebih besar dari versi berlaku (sementara 1); KRO kembar digabung; terima langsung memberlakukan; jadwal pok/administrasi wajib pagu sama; RO belum di Master ditolak. Realisasi oleh bendahara (`realisasi`): s.d.=lalu+ini, sisa=pagu-lock-s.d. (toleransi 1), satu unggahan per tanggal data, Booked belum ada sumber. **Skor: rumus SEMENTARA** menunggu keputusan Bapak (pertanyaan terbuka 5).
- E: tab RO dibuka ketua/admin RO, PPK, bendahara, pemegang `keu_akses_adm` (Admin Aplikasi dan KPA tidak otomatis); pengunggah tak boleh verifikasi sendiri kecuali PPK; kembalikan butuh alasan >= 5 huruf, dokumen terverifikasi hanya PPK; berkas fisik di storage (hash SHA-256); catatan terikat kunci_stabil.
- F: satu tambahan terbuka per RO; putusan harus mencakup SEMUA catatan terbuka RO; PPK tak memutuskan kecuali rangkap ketua RO itu; sisa jadi `sisa_penggenap`; tambahan pagu butuh nomor, tanggal, jalur.
- G: uraian min. 3 huruf (item "ATK"); tingkat Tim (str_tim) vs PPK (str_ppk); RO T-nnn PPK langsung sah; usul ke pusat wajib nomor surat dan jadwal berjenis sesuai; pencocokan atas perintah PPK; satu kode resmi satu usulan aktif; hanya `aktif` yang `boleh_komitmen`; pemindahan RAB/penugasan/kertas kerja dari T-nnn belum otomatis.
- l: supabase-js tak bisa `set_config`, jadi `keu_tulis`/`keu_jalankan` menyetel akun; hanya service_role, hanya insert/update, klien tak boleh kirim `p_akun`.
- m, n: view hanya service_role (`security_invoker`, dicabut dari anon/authenticated), tanpa NIK/NIP.
- Temuan: penjaga hapus `keu_revisi_usulan` awalnya tak ada; riwayat awalnya dapat diubah (kini `keu_catat_saja`); uji rangkap peran tergantung urutan (diperbaiki).

## 4. Impor POK 2026

- Selesai dan terverifikasi (project Supabase `nlwkpakyfprugqwklxiu`): `keu_pok_versi` id 2, tahun 2026, revisi 1 (SEMENTARA), efektif 2026-09-30, 524 node, 677 detail, Rp 13.431.536.000, md5 detail 342fc53740221235cd2696ee9e1613bc; z_cek 39/39. Berkas `g1_versi_node.sql`, `g2_detail_1.sql`, `g3_detail_2_berlakukan.sql`, `gen_impor.py`, `g_impor_pok.sql` (sandbox); penjaga md5; aman diulang.
- Sementara: nomor revisi 1 hanya penanda (versi baru lewat unggah POK resmi, jangan ubah versi beku); hash = sha256 pok_tree.json bukan PDF asli; volume RO kosong; nomor_item resmi belum ada; sumber_dana bawaan RM; tanda_blokir false; sisa teks pada beberapa uraian (mis. "- 66,00066,0001.0 DOK honor petugas").
- **Unggah POK SATKER-25 DITERIMA atas perintah pengguna (24 Okt):** 625 baris, 35 RO, Rp 13.430.319.000 = ALOKASI. Banding vs revisi 1: 509 sama, 64 berubah, 52 baru, 104 hilang, 20 RO berselisih, selisih -1.217.000. Unggahan #2 diterima: versi sistem #3 (revisi 2, efektif 23 Okt 2026) berlaku, #2 "digantikan". Baris baru/hilang belum dipadankan; kertas kerja jadwal 7 tetap memakai Semula POK lama. Unggahan #1 Ditolak.

## 5. Tahap bangun aplikasi dan selisih mockup vs produksi

Produksi bps-solokkab.up.railway.app; verifikasi Chrome, akun 354, RO fiktif 2906.BMA.005, jadwal UJI id 7.
- 4c/4d: halaman anggaran berbingkai sidebar, tab RO, panel Tarik, label jadwal. 4e: Administrasi per item (`lib/keu/adm.ts`). 4f: kertas kerja per RO (Dana penggenap, Hapus, item baru, Kosongkan, R-xx diverifikasi).
- 4g: Kertas Kerja per KRO `/sigap/revisi/kertas?jadwal=&kro=&ro=&dari=` (matriks 15 kolom, filter/urut, aksi massal, rumus =18*2, R-01..17, kecukupan+keputusan PPK, buku selisih/geseran); `lib/keu/matriks.ts` 25 tes.
- 4h: sub-tab RAB dan RAB bulanan (`?sub=rab|bulanan`), `rabKro.ts`; SQL o+z10. Data uji: RAB no. 2 RO 005, rincian Rp 1.280.000.
- 4i: tab Revisi dan Tim dan akses di ruang kerja RO, parameter `dari=`, tab terakhir diingat (localStorage), SQL p. Aturan: aksi hanya saat jadwal dibuka; pengaju tak menyetujui sendiri. Belum diuji: Kembalikan dan ketua-lalu-PPK (butuh akun lain).
- 4j: `/sigap/revisi/pok` unggah PDF POK resmi (pdf.js di peramban), cek jumlah berjenjang, banding per RO, padankan baru-hilang, Terima dua langkah, Tolak alasan >= 5 huruf. Parser tervalidasi DIPA 3/4.pdf (DIPA 4: 616 baris, 29 RO, Rp 11.957.858.000). Rencana uji: unggah DIPA 4.pdf lalu TOLAK, jangan terima.
- 4k: tampilan matriks sesuai mockup (layar penuh, kepala Semula/Menjadi, nama komponen/akun, kode item `komp.akun.nn`). Temuan: nomor_item di `keu_v_adm_lembar` masih null untuk RO uji.
- 4l: RAB inline hierarkis, geseran minimal (`geseranMinimal.ts`, 11 tes), Turunkan item ditunda, Terapkan RAB dalam batas pagu, RAB penuh (pratinjau geseran terverifikasi; geseran/RAB penuh belum diterapkan). Catatan: RAB draf tertaut ke kertas kerja lewat kunci POK (`rab_item_id` hanya dari RAB disahkan).
- 4m: RAB bulanan samping/lipat, saring RO, panel perkiraan pencairan; USULAN_TAG isian Claude; "realisasi -" belum dibuat. 225 tes.
- 4n (DIKOMIT, MENUNGGU deploy dan uji): panel Kecukupan lengkap (faktor/toleransi dibaca dari `keu_master_param`, edit di papan 14), Ekspor Excel (SheetJS)/PDF (pdf-lib) + tanda tangan, kartu Versi RAB (baca saja). Penetap per jenis (isian Claude, mohon koreksi): Revisi POK/administrasi = PPK sah + KPA terima laporan; DJPb = Kanwil DJPb; DJA = Ditjen Anggaran. 234 tes.

**Selisih mockup vs produksi (24 Okt, sebelum 4g-4n; sebagian besar sudah ditutup):** papan 1 selisih terbesar (mockup halaman per satker/KRO dengan tiga sub-tab; produksi saat itu tab dalam satu RO) ditutup 4g-4n; papan 9/10 ditutup 4i; papan 12 ditutup 4j; papan 11 sudah serupa (cek form sah, laporan KPA, 12 jadwal bawaan 2027); papan 13 selisih (daftar dua kolom, filter status, "Hanya bagian saya", "Buat semua", pihak/keterangan, riwayat); papan 15 periksa tata letak dan 4 kartu. Belum dibangun: papan 2 Alur, 3 Pemicu (hanya label), 4 Lampiran, 5 Status, 7 Versi/RPD/dampak, 8 Peta KRO, 14 Master (edit), 16 Struktur level. Urutan berikut: 8, 14, 16; lalu 7, 4, 5.

## 6. Menu v2, klien Supabase, tab Anggaran, tata kelola, "Foto saya"

- **Sidebar v2 (22 Okt):** `lib/sigapMenuV2.ts`, `admin/Shell.tsx`, 15 tes. Urutan: Beranda; Perencanaan (Alur GSBPM, Anggaran segera); Pelaksanaan (Pelatihan, Kelola pelatihan, Pendataan, Transport lokal, Perjalanan dinas/Honor segera, Pengadaan); Pengendalian (Monitoring, Ruang keputusan segera); Pertanggungjawaban (Administrasi & SPJ, Audit dan bukti segera); Pengelolaan (SDM & Mitra, Tata kelola, Kantor, Diseminasi segera; Peran dan akses, Aplikasi & periode, Delego); Referensi (SIGAP PEDIA, Register & arsip bukti). Tanpa alamat baru; alamat /sigap/... tetap hidup. Mockup v2 versi 19 (40 artboard), Dokumen Induk SIGAP v2 (Claude Doc). Usulan belum diputuskan: alamat `/sigap/kelola/monitoring` dan `/sigap/kelola/spj` dengan pengalihan 307, Referensi dihapus. Peta Ekosistem 20 modul; Tahap 1 = 11 artboard.
- **Kolam wilayah:** SQL 20261022l dijalankan; awal maks 2, tambah bila tambahan kumulatif >= 50% selesai.
- **Klien Supabase bersama (kebocoran memori Railway):** `lib/supabaseServer.ts` (auth dimatikan, klien dibagi per url+kunci; klien bawaan menahan ~14,7 KB/klien); 121 berkas diganti impor; tidak diubah: impor tipe saja, "use client", klien anon/sesi. Uji pengaman `imporSupabaseServer.test.ts`. Target memori 300-600 MB.
- **Logika RAB `lib/anggaranRab.ts` (29 tes):** cadangan 5%, rentang v1 22%/v2 14%/v3 8%/v4+ 5%, penyusun != penyetuju, alasan revisi sah >= 20 karakter, `pasangkanRevisi`, RPD. Contoh: pagu RO 2907.BMA.009 Rp 937.222.000, RAB v4 Rp 748.164.540, sisa Rp 189.057.460. Kalibrasi tim diperlukan; kewenangan persetujuan tak dikodekan.
- **Tab Anggaran (RAB) di Perencanaan:** di-commit dan dideploy 23 Okt (commit 03ba9b1); data di localStorage `sigap_uji_rab_v1`; `AnggaranTab.tsx`, `anggaranRabUji.ts` (17 tes); v1 terkunci, versi baru wajib alasan >= 10 karakter; deteksi RAB basi `cocokDenganPok`.
- **Tata kelola (21 Okt):** 16 halaman mockup (Tata-Kelola, Register-Regulasi, Matriks-Kewenangan, Risiko-SPIP, Pelindungan-Data, Audit-dan-Bukti, Anggaran-Akun/Kontrol, SDM-Kinerja, Mitra x4, Keadaan-Khusus, Peluncuran-Bertahap, Skema-Data). Skema `claude/skema-sql/` 10 migrasi (113 tabel + 10 view, 156 uji, 0 P0). Keputusan rancangan Claude yang perlu dinilai: PPK/PPSPM/Bendahara tiga orang berbeda (pengecualian maks 90 hari); dugaan kecurangan tak memutus otomatis; risiko 1-5/6-11/12-19/>=20, hanya KPA terima risiko tinggi maks 1 triwulan; keadilan agregat; peluncuran bertahap mode bayangan, 26 skenario. Regulasi terverifikasi: PMK 62/2023 jo 107/2024 jo 41/2026, Perpres 46/2025, UU 27/2022, PermenPANRB 6/2022, Perpres 86/2007, UU 16/1997, PP 51/1999, Peraturan BPS 65/2024 dan 7/2025; perlu cek tim: UU 17/2003, 1/2004, 15/2004, PP 60/2008, dll.; peraturan BPS khusus mitra tak terverifikasi (7 parameter `belum_diisi`).
- **"Foto saya" (23 Okt):** `FotoSaya.tsx` mengabaikan `status_periksa`; perbaikan `statusPemeriksaan()` di `lib/sigapFoto.ts` (Sudah diperiksa/Dipertanyakan/Ditahan menunggu/Menunggu/Wajar), pengelompokan per tanggal, 4 tes. `SusunFoto.tsx` belum (RPC belum mengembalikan `status_periksa`).

## 7. Masih terbuka / tertunda

**Keputusan menunggu Bapak**
- (24 Okt) Excel Laporan Ketersediaan Dana Detail SELURUH satker (ekspor tanpa filter Kegiatan).
- (24 Okt) Jalur RO baru dan Komponen/Subkomponen baru (tanya Kanwil); RO/KRO baru diajukan PPK saja?; Subkomponen sebagai level sendiri?
- (24 Okt) Koreksi 297 dokumen kelengkapan lewat Master; SK pendelegasian KPA ke PPK; rumus/bobot skor; nilai faktor K 0,9.
- (24 Okt) Penggenap boleh minus sementara?; satu akun penggenap per RO atau per akun+komponen, akun penampung tunggal; tempat keputusan PPK di paket DIPA; perlakuan item selesai saat akun dikosongkan.
- (24 Okt) Redaksi P-02 vs P-06+P-07; Q-26 (RO Khusus/blokir/Belanja Operasional); dasar hukum R-09 dan R-16; Q-20; perubahan satuan item di Menjadi; penetap tiap jenis revisi dan USULAN_TAG (isian Claude).
- (23 Okt) K-8/Q-29 pembagian peran PPK/KPA; koreksi label artboard u1-u4; persetujuan mockup Revisi-Anggaran baru.
- (22 Okt) Pertanyaan v2 butir 1-11 (nama modul, tempat SIGAP PEDIA, register regulasi, Beranda per peran, pemetaan 4 tahap vs GSBPM, 11 artboard Tahap 1, alamat baru, kaki sidebar, pengamanan data pribadi, tinggi artboard, akses kanvas); `dashboard_progress`/`seruti_progress` belum dicabut dari anon; rotasi kunci Supabase/Railway ditunda sampai build stabil; kalibrasi rentang/cadangan/pola RAB; kode program dari kode RO.
- (21 Okt) Tinjau SQL tata kelola (RLS/trigger) di branch; kalibrasi Skor Jejak; isi 7 parameter `belum_diisi`; verifikasi regulasi "perlu dicek"; render tinggi artboard; uji klik.
- (24 Okt, SQL) bila nomor revisi POK resmi <= 1 (perlu fungsi penamaan ulang); keputusan Fase G (3 huruf, PPK langsung sah di T-nnn, fungsi pindah dari T-nnn, pencocokan otomatis setelah impor); Fase F (satu tambahan terbuka per RO, putusan sekaligus); Fase E (kata pemicu longgar, akses TU/PBJ/Perencana, kembalikan terverifikasi hanya PPK).

**Pekerjaan bangun tertunda**
- Tahap 4n: deploy dan uji. "Alasan versi" RAB (min. 10 karakter) butuh kolom di `keu_rab` + SQL. Jadwal bulanan di editor rincian; "realisasi -" SPAN; "Jalur penutup" (papan 16).
- Papan 2, 3, 4, 5, 7, 8, 14 (edit), 16 dan penyesuaian papan 13, 15, 11 (lihat bagian 5).
- Belum diuji tulis di produksi: geseran dan RAB penuh (diterapkan), keputusan PPK, filter/urut per kolom, Kembalikan, persetujuan ketua-lalu-PPK. Penugasan nyata (ketua tim/admin RO/PPK) dan pemberian kewenangan belum diisi. Baris baru/hilang SATKER-25 belum dipadankan. R-02/R-04, nomor_item resmi, Booked belum ada. `SusunFoto.tsx` belum diperbarui.
- Daftar uji pasca-deploy 22 Okt belum dicentang: dasar; memori Railway 1-2 hari (acuan `claude/catatan-kebocoran-memori-railway.md`); reset PIN mandiri (kasus Riva); Kamera SIGAP (dialog "Foto ini belum masuk nomor Anda"; foto id 69 Widya akun 699, id 154 Puspita); sisa uji 20-21 Okt (QR foto ke domain portal, Siaran "Perubahan target harian" 60 poin berlaku 20 Okt, notifikasi HP Yeni Siswanti, unduh SPJ). Rujukan: `claude/catatan-perubahan-20okt-2026.md`, `catatan-tombol-rapikan-nomor-foto-21okt.md`, `catatan-nomor-foto-otomatis-pengaman-kirim-21okt.md`, `catatan-batalkan-keluarga-baru-21okt.md`, `catatan-tab-belum-diajukan-tugaskan-21okt.md`, `catatan-editor-siaran-bergaya-word-21okt.md`, `catatan-jendela-susulan-21okt-2026.md`.
- **Konfirmasi status SQL:** catatan fase a, b, h-n (pagi 24 Okt) menulis "belum dijalankan di produksi"; catatan status malam hanya menyebut tegas o, p, z10 dan impor POK 39 tabel diterapkan, padahal tahap 4e-4m bergantung pada h-n. Cek `list_tables` (harus 53) dan z_cek terbaru.

**Data uji produksi tersisa (bertanda UJI, tanpa DELETE):** jadwal id 4 "UJI Administrasi fiktif" (Dilewati); jadwal id 7 "UJI Kertas kerja fiktif" (Dibuka; RO 006 dimuat 51 baris); RAB no. 2 (draf) RO 005 (Pengadaan ATK Rp 1.084.000, Konsumsi rapat Rp 1.280.000); tambahan pagu UJI-001/FIKTIF/2026 Rp 2.000.000; kekurangan UJI; unggahan realisasi UJI (Dibatalkan); usulan RO 005 jadwal 7 Disetujui (tak dapat dibatalkan). Akses uji akun 354 (`keu_akses_adm` id 1) masih aktif; batalkan via `dibatalkan_at` hanya bila diminta.

## 8. Peringatan dan pelajaran

- Build Railway 23 Okt gagal karena `app/api/penyisiran/spj/surat-tugas/route.ts` mengekspor selain handler (Next.js 15); dipindah ke `lib/spjSuratTugas.ts`. Jalankan `npm run build` lokal sebelum push (`tsc` tak menangkapnya). Deploy 22 Okt tertahan insiden Railway: deploy SEKALI saat pulih.
- Jangan jalankan `20261022b_keu_anggaran.sql`. Jangan terima unggahan POK uji (mengganti POK berlaku).
- Fungsi yang membaca akun dari sesi harus lewat `keu_jalankan`; panggilan langsung supabase-js melewati pemeriksaan hak.
- Celah skema 23 Okt (sebagian ditangani Fase A-D): KRO ganda per Kegiatan; jumlah generated tak cocok 29 baris POK; kunci_stabil butuh kemunculan; fungsi re-point kunci setelah impor; tabel `keu_revisi_jendela/langkah/berkas` dan `keu_aturan_validasi` tumpang tindih; kolom volume RO/"sesudah"/P-xx belum ada.
- Pengujian mockup hanya skrip node dan Chromium lokal; tampilan artifact terbit belum diverifikasi pada beberapa tahap; tag `sc-if` pernah hilang (diperbaiki V13); bug jendela geseran selalu tampil diperbaiki.
- PDF laporan realisasi tak andal (2/52 baris salah); Excel andal. Banyak angka ILUSTRASI dan isian Claude (USULAN_TAG, penetap revisi, rumus skor, rentang RAB) harus dikoreksi tim. Mockup belum persis sama dengan produksi.
- View `keu_v_*` hanya service_role; tabel riwayat mentah tak dibuka ke aplikasi. PMK bukan naskah konsolidasi; "Izin Presiden" jangan disatukan dengan RO Khusus.

## 9. Lampiran: sumber (37 path)

claude/selisih-mockup-vs-produksi-24okt.md; claude/status-bangun-kertas-kerja-revisi-24okt.md; claude/catatan-sql-fase-{n,m,l,k,j,i,h,b,a}-24okt.md; claude/catatan-impor-pok-2026-24okt.md; claude/catatan-mockup-kertas-kerja-revisi-tahap{14,13,12,11,10,9,8,7,6,5,4,3}-24okt.md; claude/catatan-mockup-kertas-kerja-revisi-tahap2-23okt.md; claude/catatan-mockup-kertas-kerja-revisi-23okt.md; claude/catatan-skema-sigap-draf4-revisi-anggaran-23okt.md; claude/catatan-cek-pmk-revisi-anggaran-vs-skema-23okt.md; claude/catatan-foto-saya-status-pemeriksaan-23okt.md; claude/catatan-tab-anggaran-rab-22okt.md; claude/daftar-uji-pasca-deploy-22okt.md; claude/catatan-anggaran-logika-dan-uji-pengaman-22okt.md; claude/catatan-sidebar-v2-dan-klien-bersama-22okt.md; claude/catatan-susunan-menu-v2-22okt.md; claude/catatan-pendalaman-tata-kelola-21okt.md

Tautan: mockup https://claude.ai/artifact/6uugHF9thUYQC1JKAii7Ap; Skema SIGAP Draf 4 https://claude.ai/artifact/NbjLfh8GCUmvH9EpG2JbzR.
