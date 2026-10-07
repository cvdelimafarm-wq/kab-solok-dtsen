-- (7 Okt 2026) Jenis kegiatan & aturan isian per kegiatan + kegiatan Pelatihan PSP Pascabencana 8 Okt 2026 -- permintaan user:
-- "buatkan di sistem tugas tgl 8 ini agar petugas bisa mengisi dokumentasi, karena ini pelatihan maka tidak perlu mengisi laporan".
-- Keputusan user: kegiatan terpisah; ada transport peserta (masuk Kwitansi); pengaturan per kegiatan
-- (Admin Transport Lokal > Kegiatan, peran & tarif). DITERAPKAN 7 Okt 2026. Aman dijalankan ulang.

alter table sigap_kegiatan add column if not exists jenis text not null default 'pendataan';
alter table sigap_kegiatan add column if not exists wajib_laporan boolean not null default true;
alter table sigap_kegiatan add column if not exists jumlah_foto integer not null default 5;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='sigap_kegiatan_jenis_check') then
    alter table sigap_kegiatan add constraint sigap_kegiatan_jenis_check check (jenis in ('pendataan','pelatihan','rapat','lainnya'));
  end if;
  if not exists (select 1 from pg_constraint where conname='sigap_kegiatan_jumlah_foto_check') then
    alter table sigap_kegiatan add constraint sigap_kegiatan_jumlah_foto_check check (jumlah_foto between 1 and 10);
  end if;
end $$;

-- Kegiatan pelatihan (id 3 di produksi). MAK 524114; tarif = RKKS "Perjalanan Peserta Pelatihan Petugas di kab/kota" Rp366.000.
insert into sigap_kegiatan (kode, nama, kode_anggaran, tanggal_mulai, tanggal_selesai, aktif, satuan_realisasi, jenis, wajib_laporan, jumlah_foto, hari_tenggang)
values ('pelatihan_psp_pascabencana_2026', 'Pelatihan Petugas PSP Pascabencana 2026', '054.01.GG.2907.BMA.009.052.A.524114', '2026-10-08', '2026-10-08', true, 'peserta', 'pelatihan', false, 5, 7)
on conflict (kode) do nothing;
insert into sigap_kegiatan_tarif (kegiatan_id, peran, uraian_detail, tarif, label_jabatan)
select k.id, x.peran, 'Perjalanan Peserta Pelatihan Petugas di kab/kota', 366000, x.label
from sigap_kegiatan k, (values ('ppl','Peserta Pelatihan PSP Pascabencana 2026 (PPL)'),('pml','Peserta Pelatihan PSP Pascabencana 2026 (PML)'),('korwil','Peserta Pelatihan PSP Pascabencana 2026 (Korwil)')) x(peran,label)
where k.kode='pelatihan_psp_pascabencana_2026'
on conflict (kegiatan_id, peran) do nothing;

-- Peserta = semua penugasan aktif pendataan pascabencana (87) + 6 organik korwil (revisi ST B-1443, permintaan user).
insert into sigap_penugasan (kegiatan_id, akun_id, peran, aktif, sumber)
select k.id, p.akun_id, p.peran, true, 'st_pelatihan_20261008'
from sigap_penugasan p, sigap_kegiatan k
where p.kegiatan_id = 1 and p.aktif and k.kode='pelatihan_psp_pascabencana_2026'
on conflict (kegiatan_id, akun_id) do nothing;
insert into sigap_penugasan (kegiatan_id, akun_id, peran, aktif, sumber)
select k.id, x.akun, 'korwil', true, 'st_pelatihan_20261008'
from sigap_kegiatan k, (values (4),(148),(563),(322),(346),(550)) x(akun)  -- Adrianus, Deswaty, Riva Hestaria, Kafsal, Lucia Veronica, Riko Putra Roma
where k.kode='pelatihan_psp_pascabencana_2026'
on conflict (kegiatan_id, akun_id) do nothing;

-- Hari kerja 8 Okt diisi otomatis (kecuali akun yg sudah punya hari kerja di tanggal itu -- 1 tanggal = 1 kegiatan).
insert into sigap_hari_kerja (penugasan_id, akun_id, tanggal)
select p.id, p.akun_id, date '2026-10-08'
from sigap_penugasan p join sigap_kegiatan k on k.id=p.kegiatan_id
where k.kode='pelatihan_psp_pascabencana_2026' and p.aktif
  and not exists (select 1 from sigap_hari_kerja h where h.akun_id=p.akun_id and h.tanggal=date '2026-10-08');
insert into sigap_hari_kerja_riwayat (penugasan_id, tanggal, aksi, oleh)
select h.penugasan_id, h.tanggal, 'tambah', 'admin:pelatihan 8 Okt (otomatis, permintaan user)'
from sigap_hari_kerja h join sigap_penugasan p on p.id=h.penugasan_id join sigap_kegiatan k on k.id=p.kegiatan_id
where k.kode='pelatihan_psp_pascabencana_2026'
  and not exists (select 1 from sigap_hari_kerja_riwayat r where r.penugasan_id=h.penugasan_id and r.tanggal=h.tanggal);
