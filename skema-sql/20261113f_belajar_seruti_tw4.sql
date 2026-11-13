-- skema-sql/20261113f_belajar_seruti_tw4.sql
--
-- (13 Nov 2026, B) Aturan kegiatan belajar dan mutu Seruti TW IV ke sumber tunggal sigap_belajar_aturan. Menambah baris saja; idempoten.
-- Diuji kering dulu: 6 baris kegiatan 7 (pelatihan) + 1 baris kegiatan 6 (pendataan); cermin lama TIDAK berubah (sudah sama dengan keadaan sekarang).
-- Sumber keadaan (select 13 Nov):
--   kegiatan 7: sigap_pelatihan_aturan vanguard wajib, 3 hari berturut, tenggat 9 Nov, blokir tahap; fitur vanguard aktif; fitur vanguard_roleplay dimatikan 9 Nov 16.25 WIB;
--               sigap_tes pretest dan posttest aktif (tidak wajib lulus); ada kuis.
--   kegiatan 6: fitur vanguard aktif; identifikasi 7 form.vanguard.pendataan = true.
-- Keputusan Iqbal 13 Nov sore: aturan awal Vanguard wajib; yang dibatalkan hanya Vanguard pada hari pelatihan (9 Nov) karena sinyal buruk dan aplikasi bermasalah.

begin;

insert into sigap_belajar_aturan(kegiatan_id, waktu, butir, aktif, wajib, tenggat, blokir, catatan, batal_alasan, batal_oleh, batal_at, diubah_oleh)
values
  (7, 'pra_pelatihan',  'vanguard_latihan',  true, true,  date '2026-11-09', true,  'Latihan pengisian kuesioner interaktif 3 hari berturut-turut sebelum pelatihan (aturan kegiatan 8 Nov).', null, null, null, 'M. Iqbal Hadi, SST.'),
  (7, 'saat_pelatihan', 'pretest',           true, false, date '2026-11-09', false, 'Pretest 9 Nov (tidak wajib lulus).', null, null, null, 'M. Iqbal Hadi, SST.'),
  (7, 'saat_pelatihan', 'vanguard_roleplay', true, false, date '2026-11-09', false, 'Roleplay Vanguard bersama kelas pada hari pelatihan.',
      'Dibatalkan pada hari pelatihan karena sinyal buruk dan aplikasi bermasalah.', 'M. Iqbal Hadi, SST.', timestamptz '2026-11-09 09:25:45.296+00', 'M. Iqbal Hadi, SST.'),
  (7, 'saat_pelatihan', 'posttest',          true, false, date '2026-11-09', false, 'Posttest 9 Nov (tidak wajib lulus).', null, null, null, 'M. Iqbal Hadi, SST.'),
  (7, 'saat_pelatihan', 'kuis',              true, false, date '2026-11-09', false, 'Kuis saat pelatihan.', null, null, null, 'M. Iqbal Hadi, SST.'),
  (6, 'saat_pendataan', 'vanguard_latihan',  true, false, null,              false, 'Latihan interaktif selama pendataan (identifikasi: Vanguard pendataan = Ya).', null, null, null, 'M. Iqbal Hadi, SST.')
on conflict (kegiatan_id, waktu, butir) do nothing;

commit;
