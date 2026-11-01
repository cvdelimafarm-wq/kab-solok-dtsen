-- 20261101t_induk_seruti_tw4.sql
--
-- (1 Nov 2026) Kegiatan induk ("survei") Seruti Triwulan IV 2026: mengelompokkan pendataan (sigap_kegiatan id 6) dan pelatihan (id 7).
-- Efek: Kelola Pelatihan menampilkan pelatihan Seruti di bawah survei "Seruti Triwulan IV 2026" (bukan "Pelatihan lainnya"), dan Beranda petugas
-- memuat tahap proses bisnis: Pelatihan (langkah pelatihan + Transport Lokal pelatihan) lalu Pendataan (Transport Lokal pendataan).
-- Pola sama dengan induk pascabencana dan spdt_ntp. Aman dijalankan berulang (upsert). Ikon "grafik" boleh diganti; kegiatan_ids sesuai id kegiatan di database.
-- Tahap lanjutan (lembar pendataan, QC, evaluasi) ditambahkan nanti lewat baris sigap_tahap baru.

insert into public.sigap_induk (kode, nama, pendek, ikon, kegiatan_ids, urutan, aktif)
values ('seruti_tw4', 'Seruti Triwulan IV 2026', 'Seruti TW IV', 'grafik', array[6, 7]::bigint[], 3, true)
on conflict (kode) do update set nama = excluded.nama, pendek = excluded.pendek, ikon = excluded.ikon, kegiatan_ids = excluded.kegiatan_ids, urutan = excluded.urutan, aktif = excluded.aktif;

insert into public.sigap_tahap (induk_kode, kode, urutan, nama, uraian, isi, buka_mode, aktif)
values
  ('seruti_tw4', 'pelatihan', 1, 'Pelatihan', 'Langkah pelatihan dan Transport Lokal pelatihan.', array['pelatihan', 'translok:7']::text[], 'langsung', true),
  ('seruti_tw4', 'pendataan', 2, 'Pendataan', 'Transport Lokal: hari kerja, laporan, dan foto dokumentasi.', array['translok:6']::text[], 'langsung', true)
on conflict (induk_kode, kode) do update set urutan = excluded.urutan, nama = excluded.nama, uraian = excluded.uraian, isi = excluded.isi, buka_mode = excluded.buka_mode, aktif = excluded.aktif, diubah_at = now();
