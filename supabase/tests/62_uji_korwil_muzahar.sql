-- =====================================================================
-- 62_uji_korwil_muzahar.sql - uji hasil 20261027a (Muzahar kortim semua kelompok). Jalankan SESUDAH 20261027a. Hanya membaca; diakhiri galat sengaja
-- sehingga hasilnya dibawa dalam pesan "HASIL_UJI: {...}". Tidak ada data tersimpan.
-- Harapan: muzahar_kelompok = [5,1,2,3,4,6] (bawaan 5 lebih dulu), iqbal_kelompok = [1,2,3,4,5,6], kortim_per_kelompok = {1:4, 2:4, 3:4, 4:4, 5:3, 6:4},
--          dobel = 0, pml_berubah = false (jumlah PML per kelompok tetap 3), penugasan_muzahar_korwil = 1 (id 295), hari_kerja_muzahar tidak berubah.
-- =====================================================================
do $uji$
declare h jsonb := '{}'::jsonb;
begin
  h := h || jsonb_build_object(
    'muzahar_kelompok', (select jsonb_agg(kelompok order by urutan, kelompok) from bencana_kelompok_tim where kegiatan_id = 1 and peran = 'kortim' and aktif and akun_id = 410),
    'iqbal_kelompok',   (select jsonb_agg(kelompok order by urutan, kelompok) from bencana_kelompok_tim where kegiatan_id = 1 and peran = 'kortim' and aktif and akun_id = 354),
    'kortim_per_kelompok', (select jsonb_object_agg(kelompok, n order by kelompok) from (select kelompok, count(*) n from bencana_kelompok_tim where kegiatan_id = 1 and peran = 'kortim' and aktif group by kelompok) x),
    'pml_per_kelompok',    (select jsonb_object_agg(kelompok, n order by kelompok) from (select kelompok, count(*) n from bencana_kelompok_tim where kegiatan_id = 1 and peran = 'pml' and aktif group by kelompok) x),
    'dobel', (select count(*) from (select 1 from bencana_kelompok_tim group by kegiatan_id, kelompok, peran, akun_id having count(*) > 1) d),
    'penugasan_muzahar_korwil', (select jsonb_agg(id) from sigap_penugasan where akun_id = 410 and kegiatan_id = 1 and peran = 'korwil' and aktif),
    'hari_kerja_muzahar', (select count(*) from sigap_hari_kerja where penugasan_id = 295),
    'baris_tim_total', (select count(*) from bencana_kelompok_tim where kegiatan_id = 1));
  raise exception 'HASIL_UJI: %', h::text;
end $uji$;
