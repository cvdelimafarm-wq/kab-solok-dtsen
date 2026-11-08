-- 20261109b_laporan_foto_hari.sql
-- (9 Nov 2026) Foto pelaksanaan pelatihan: 4 foto PER HARI per kelas (panitia + instruktur satu kumpulan).
-- Menambah kolom `tanggal` (hari pelaksanaan) pada lampiran foto laporan. Foto lama diberi tanggal hari pertama kegiatannya.
-- Aman dijalankan berulang. Kode aplikasi tetap jalan sebelum SQL ini dipasang (foto dihitung hari pertama).

alter table public.sigap_pelatihan_laporan_foto add column if not exists tanggal date;

-- Foto lama (tanpa tanggal) = hari pertama kegiatan; kegiatan tanpa tanggal mulai dibiarkan kosong.
update public.sigap_pelatihan_laporan_foto f
   set tanggal = k.tanggal_mulai
  from public.sigap_kegiatan k
 where f.kegiatan_id = k.id
   and f.tanggal is null
   and k.tanggal_mulai is not null;

create index if not exists sigap_pelatihan_laporan_foto_hari_idx
  on public.sigap_pelatihan_laporan_foto (kegiatan_id, kelas, tanggal);

-- Cek: jumlah foto per kegiatan/kelas/tanggal
-- select kegiatan_id, kelas, tanggal, count(*) from public.sigap_pelatihan_laporan_foto group by 1,2,3 order by 1,2,3;
