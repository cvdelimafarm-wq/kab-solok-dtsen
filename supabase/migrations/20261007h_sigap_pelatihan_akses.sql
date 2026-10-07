-- (7 Okt 2026) Monitoring "belum akses pelatihan": catat akses pertama peserta ke halaman Pelatihan (kode 'akses').
alter table sigap_pelatihan_langkah drop constraint if exists sigap_pelatihan_langkah_kode_check;
alter table sigap_pelatihan_langkah add constraint sigap_pelatihan_langkah_kode_check check (kode in ('undangan','instrumen','akses'));

-- isi ulang dari log aktivitas yang sudah ada (akun peserta yang pernah mengirim detak halaman 'pelatihan')
insert into sigap_pelatihan_langkah (akun_id, kegiatan_id, kode, at)
select l.akun_id, 3, 'akses', min(l.mulai_at)
from sigap_log_sesi l
join sigap_penugasan p on p.akun_id = l.akun_id and p.kegiatan_id = 3 and p.aktif
where l.halaman = 'pelatihan'
group by l.akun_id
on conflict (akun_id, kegiatan_id, kode) do nothing;
