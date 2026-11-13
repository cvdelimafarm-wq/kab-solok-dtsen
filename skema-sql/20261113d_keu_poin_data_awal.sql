-- skema-sql/20261113d_keu_poin_data_awal.sql
--
-- (13 Nov 2026, C) Data awal matriks Poin beban kerja. Menambah baris saja; idempoten. Diuji kering dulu (begin ... rollback).
--   * Survei (dapat diubah di tab): Umum (pekerjaan kantor/semua survei), Susenas, Seruti TW II & IV, Seruti TW I & III, Sakernas, IMK, SPDT NTP, PSP Pascabencana.
--   * Dua jenis pekerjaan baru di katalog Delego: Mengajar pelatihan dan Mengikuti pelatihan (satuan JP). Katalog Delego masih skala 75, jadi
--     poin_per_satuan katalog = 12,5 × 75/100 = 9,38; matriks memakai skala 100 (12,5).
--   * Sel data awal: tiap jenis lama × Umum = poin katalog × 100/75 (skala ke kapasitas 100); standar Ketua Tim 13 Nov:
--     Periksa dokumen × Susenas = 100/12 = 8,33; Periksa dokumen × Seruti TW II & IV = 100/18 = 5,56; Mengajar dan Mengikuti pelatihan × Umum = 12,5 per JP.
--   * Poin berlaku = data awal, sumber 'awal', satu baris riwayat per sel.

begin;

insert into keu_poin_survei(kode, nama, pola, urut) values
  ('umum', 'Umum (semua survei / pekerjaan kantor)', '', 1),
  ('susenas', 'Susenas', 'susenas', 10),
  ('seruti_tw24', 'Seruti TW II & IV', 'seruti.*(triwulan (ii|iv)\y|tw ?(ii|iv|2|4)\y)', 20),
  ('seruti_tw13', 'Seruti TW I & III', 'seruti.*(triwulan (i|iii)\y|tw ?(i|iii|1|3)\y)', 21),
  ('sakernas', 'Sakernas', 'sakernas', 30),
  ('imk', 'IMK (Industri Mikro dan Kecil)', '(\mimk\M|industri mikro)', 40),
  ('spdt_ntp', 'SPDT NTP', 'spdt|nilai tukar petani', 50),
  ('psp_bencana', 'PSP Pascabencana', 'pascabencana|status pemulihan', 60)
on conflict (kode) do nothing;

insert into keu_dlg_jenis(kode, nama, satuan, poin_per_satuan, uraian, perlu_hasil, perlu_tinjau, urut, aktif, skor_status, skor_alasan)
select x.kode, x.nama, 'JP', 9.38, x.uraian, false, false, x.urut, true, 'disetujui', 'Standar Ketua Tim 13 Nov 2026: 8 JP = 100 poin (skala 100); katalog skala 75 = 9,38 per JP'
from (values ('mengajar_pelatihan', 'Mengajar pelatihan', 'Mengajar atau menjadi narasumber pelatihan petugas; satuan jam pelajaran (JP).', 90),
             ('ikut_pelatihan', 'Mengikuti pelatihan', 'Mengikuti pelatihan sebagai peserta; satuan jam pelajaran (JP).', 91)) x(kode, nama, uraian, urut)
where not exists (select 1 from keu_dlg_jenis j where j.kode = x.kode);

-- sel data awal
insert into keu_poin_sel(jenis_id, survei_id, awal, awal_ket)
select j.id, (select id from keu_poin_survei where kode = 'umum'),
       case when j.kode in ('mengajar_pelatihan', 'ikut_pelatihan') then 12.50 else round(j.poin_per_satuan * 100 / 75, 2) end,
       case when j.kode in ('mengajar_pelatihan', 'ikut_pelatihan') then 'Standar Ketua Tim 13 Nov: 8 JP = 100 poin'
            else 'Katalog Delego ' || j.poin_per_satuan || ' poin (skala 75) × 100/75' end
from keu_dlg_jenis j where j.aktif
on conflict (jenis_id, survei_id) do nothing;

insert into keu_poin_sel(jenis_id, survei_id, awal, awal_ket)
select j.id, s.id, x.poin, x.ket
from (values ('susenas', 8.33, 'Standar Ketua Tim 13 Nov: 12 dokumen (1 set kuesioner) per hari'),
             ('seruti_tw24', 5.56, 'Standar Ketua Tim 13 Nov: 18 dokumen per hari')) x(survei, poin, ket)
join keu_poin_survei s on s.kode = x.survei
join keu_dlg_jenis j on j.kode = 'periksa_dokumen'
on conflict (jenis_id, survei_id) do nothing;

insert into keu_poin_riwayat(sel_id, poin_lama, poin_baru, sumber, alasan, status, diputus_at)
select s.id, null, s.awal, 'awal', 'Data awal: ' || s.awal_ket, 'berlaku', now()
from keu_poin_sel s where s.poin_berlaku is null and s.awal is not null;

update keu_poin_sel set poin_berlaku = awal, sumber_berlaku = 'awal', berlaku_at = now() where poin_berlaku is null and awal is not null;

commit;
