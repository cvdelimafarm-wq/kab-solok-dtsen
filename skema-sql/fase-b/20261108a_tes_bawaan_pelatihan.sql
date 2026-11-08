-- 20261108a_tes_bawaan_pelatihan.sql
--
-- (8 Nov 2026) Tab "Soal & Jadwal" tidak menampilkan kartu Pretest/Posttest (tempat unggah soal dan jadwal) untuk
-- "Pelatihan Petugas Seruti Triwulan IV 2026" (kegiatan id 7), karena pelatihan itu dibuat tanpa baris pretest/posttest di sigap_tes
-- (pelatihan yang dibuat lewat tombol "+ Pelatihan baru" otomatis mendapat keduanya; id 7 tidak lewat jalur itu).
--
-- Yang dilakukan: menambahkan pretest dan posttest bawaan untuk setiap pelatihan yang belum punya (saat ini hanya id 7).
-- Pola sama dengan kode "+ Pelatihan baru": buka 07.00 WIB hari pertama, tutup 22.00 WIB hari terakhir, durasi 15 menit,
-- TIDAK AKTIF (belum tampil bagi peserta) sampai soal diunggah, wajib lulus mati. Tidak mengubah baris yang sudah ada. Aman diulang.

begin;

insert into public.sigap_tes (kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at, aktif, ulang_maks, wajib_lulus, nilai_lulus)
select k.id, j.jenis,
       left((case j.jenis when 'pretest' then 'Pretest' else 'Posttest' end) || ' · ' || k.nama, 160),
       ((k.tanggal_mulai::text || ' 07:00:00+07')::timestamptz), 15,
       ((coalesce(k.tanggal_selesai, k.tanggal_mulai)::text || ' 22:00:00+07')::timestamptz),
       false, 1, false, 70
from public.sigap_kegiatan k
cross join (values ('pretest'), ('posttest')) as j(jenis)
where k.jenis = 'pelatihan'
  and k.tanggal_mulai is not null
  and not exists (select 1 from public.sigap_tes t where t.kegiatan_id = k.id and t.jenis = j.jenis);

commit;

-- Verifikasi (harapan: kegiatan 7 punya pretest dan posttest, aktif = false, 0 soal):
--   select t.id, t.kegiatan_id, t.jenis, t.aktif, t.buka_at, t.tutup_at,
--          (select count(*) from public.sigap_tes_soal s where s.tes_id = t.id) as soal
--     from public.sigap_tes t where t.kegiatan_id = 7 order by t.jenis;
