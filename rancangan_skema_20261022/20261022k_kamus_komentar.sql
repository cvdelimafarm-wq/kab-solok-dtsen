-- =====================================================================
-- 20261022k_kamus_komentar.sql
-- Melengkapi kamus data: komentar tabel/view/fungsi yang belum ada.
-- Komentar dibaca Skema-Data (mockup) dan Supabase Studio. Aman diulang.
-- =====================================================================
comment on table keu_rab_baris is 'Baris RAB. Terkait baris POK (pok_detail_id) dan SBM; jumlah dihitung kolom generated. Tidak dapat diubah ketika versi RAB diajukan/disetujui/dikunci.';
comment on table keu_revisi_baris is 'Selisih per baris POK dalam suatu revisi (jumlah sebelum/sesudah). Kunci stabil menautkan baris lintas versi.';
comment on table keu_rpd is 'Rencana penarikan dana per RO per bulan; dasar deviasi realisasi dan peringatan IKPA.';
comment on table kual_kebutuhan is 'Kompetensi minimal per kegiatan dan peran (dasar analisis kesenjangan).';
comment on table kual_kompetensi is 'Kamus kompetensi (kode, nama, rumpun).';
comment on table kual_kualifikasi is 'Tingkat kompetensi yang dimiliki seseorang, bermasa berlaku dan bersumber (pelatihan, praktik, penilaian, pengakuan pengalaman).';
comment on table kual_umpan_balik is 'Umpan balik berjangkar perilaku (situasi-perilaku-dampak) dengan batas SLA pemberian.';
comment on table mitra_bast is 'Berita acara serah terima hasil kerja. Volume kumulatif tidak boleh melebihi volume SPK; pemeriksa dan penyetuju berbeda orang.';
comment on table mitra_nilai_seleksi is 'Nilai satu penilai untuk satu kriteria satu pendaftar. Penilai tidak boleh menilai dirinya sendiri.';
comment on table mitra_pendaftar is 'Pendaftar seleksi per periode dengan status corong; hasil akhir wajib diputuskan manusia dan penolakan wajib alasan kode.';
comment on table mitra_perjanjian is 'Perjanjian induk mitra per tahun; penandatangan harus PPK yang berlaku pada tanggal mulai.';
comment on table mitra_seleksi_periode is 'Periode seleksi mitra dengan kuota dan masa pendaftaran.';
comment on table sdm_penilaian is 'Penilaian kinerja oleh atasan; predikat diisi pejabat penilai sesuai lampiran peraturan.';
comment on table sdm_skp_butir is 'Butir sasaran kinerja (target, satuan, tautan opsional ke kegiatan).';
comment on table sdm_tindak_lanjut is 'Tindak lanjut hasil penilaian: pembinaan, pengembangan kompetensi, penghargaan.';
comment on table tkl_dpia is 'Penilaian dampak pelindungan data (DPIA) atas kegiatan pemrosesan; penyetuju berbeda dari penyusun.';
comment on table tkl_insiden is 'Insiden data pribadi. Batas notifikasi dihitung dari parameter (perlu dicek); penutupan wajib memuat pelajaran.';
comment on table tkl_kewajiban_realisasi is 'Pemenuhan kewajiban per periode; status selesai wajib bukti dan pelaksana.';
comment on table tkl_kontrol is 'Kontrol atas risiko (pencegahan, deteksi, korektif) dan objek teknis penegaknya.';
comment on table tkl_kontrol_uji is 'Hasil uji efektivitas kontrol; hasil selain efektif wajib catatan.';
comment on table tkl_proses is 'Proses bisnis hulu ke hilir yang menjadi acuan RACI dan risiko.';
comment on table tkl_risiko is 'Register risiko per unsur SPIP (kemungkinan x dampak = skor; tingkat dihitung).';
comment on table tkl_ropa_data is 'Kolom data pribadi per kegiatan pemrosesan. Hanya nama kolom rujukan, bukan nilai.';
comment on table tkl_sod_pelanggaran is 'Pelanggaran pemisahan tugas yang terdeteksi dan penjelasannya.';
comment on table tkl_temuan is 'Temuan pemeriksaan/pengujian. Penutupan ditolak sampai tindak lanjut selesai dan diverifikasi.';
comment on table tkl_tindak_lanjut is 'Tindak lanjut atas temuan; verifikator berbeda dari penanggung jawab; selesai wajib bukti.';
comment on table tkl_uat_hasil is 'Hasil uji penerimaan per skenario per putaran; hasil bukan lulus wajib catatan.';

comment on view keu_v_serapan is 'Pagu, terpakai, sisa, persen per baris POK.';
comment on view kual_v_gap is 'Kesenjangan kualifikasi per penugasan aktif.';
comment on view tkl_v_uat_gerbang is 'Persen lulus per kategori UAT dan status gerbang skenario kritis.';
comment on view tkl_v_kesehatan is 'Satu pintu pemeriksaan kesehatan tata kelola (angka harus 0, kecuali dua baris informasional).';
comment on function keu_terpakai(bigint, bigint) is 'Jumlah komitmen+realisasi aktif per baris POK; komitmen yang sudah punya realisasi tidak dihitung ganda.';
comment on function tkl_verifikasi_rantai(bigint, bigint) is 'Mengembalikan baris jejak pertama yang rusak; kosong berarti rantai utuh. Hanya server.';
comment on function tkl_param_num(text, date) is 'Membaca parameter numerik yang berlaku pada tanggal; NULL bila belum diisi.';
comment on table keu_aturan_validasi is 'Katalog aturan validasi anggaran (V01 dan seterusnya): tingkat blok/peringatan/info, saat berlaku, tindakan yang disarankan, dan penegaknya (constraint, trigger, aplikasi).';
comment on table keu_impor_galat is 'Baris dan kolom yang gagal pada satu batch impor POK, dengan kode galat. Impor sebagian gagal tidak menghentikan baris yang benar; galat diperbaiki lalu diimpor ulang sebagai batch baru.';
comment on table keu_pengadaan is 'Paket pengadaan barang/jasa yang menjadi dasar komitmen: nilai, metode (diisi dari ketentuan), PPK dan pelaksana berbeda. Tidak menghitung ambang nilai karena belum diverifikasi.';
comment on column mitra_pembayaran.bruto is 'Nilai kotor sebelum pajak; tidak boleh melebihi volume BAST x harga satuan SPK.';
comment on column mitra_persetujuan.tindakan is 'setuju | menolak | tarik. Penarikan adalah baris baru; baris lama tidak diubah.';
comment on column mitra_akses_log.alasan is 'Wajib minimal 10 karakter: alasan pembukaan data pribadi mitra.';
comment on column tkl_dugaan.status is 'Dugaan diubah statusnya hanya oleh peninjau manusia dengan catatan; sistem hanya membuat status baru.';
comment on column mitra_keadilan_ukur.air is 'Rasio dampak merugikan = persen Andal kelompok dibagi persen tertinggi antar kelompok; dihitung database.';
