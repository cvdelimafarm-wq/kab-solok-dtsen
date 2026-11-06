-- 20261106i_penanda_magang.sql
-- (6 Nov 2026) Penanda "pegawai magang" pada akun SIGAP. Hanya PENANDA kategori (muncul sebagai label di daftar Pengguna & keterangan saran login);
-- tidak mengubah hak akses, penugasan, atau penilaian. Aman dijalankan ulang.
-- Akun yang ditandai: id 788-792 (organik) dan 299 (mitra), dengan penjaga nama (id + nama harus cocok, sehingga salah id tidak menandai orang lain).

alter table public.sigap_akun add column if not exists magang boolean not null default false;

update public.sigap_akun
   set magang = true
 where ((id = 788 and lower(nama) = 'nurul')
     or (id = 789 and lower(nama) = 'prana yessa')
     or (id = 790 and lower(nama) = 'sepviani rahma putri')
     or (id = 791 and lower(nama) = 'ulfa zakiyyah')
     or (id = 792 and lower(nama) = 'yusra susanti')
     or (id = 299 and lower(nama) = 'iqbal widia saputra'))
   and magang is distinct from true;

notify pgrst, 'reload schema';

-- Pemeriksaan (SELECT): enam akun harus tampil dengan magang = true
select id, nama, jenis, aktif, magang
  from public.sigap_akun
 where magang is true
 order by id;
