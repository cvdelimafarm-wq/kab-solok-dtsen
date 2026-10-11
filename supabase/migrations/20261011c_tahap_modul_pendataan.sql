-- (11 Okt 2026) Lembar Pendataan KK masuk ke tahap "Pendataan" kegiatan Pendataan Pascabencana -- permintaan user (gabung, bukan menu terpisah).
-- Modul 'pendataan' diletakkan sesudah 'identifikasi' dan sebelum Transport Lokal. Idempotent; tidak menghapus apa pun.
-- Modul hanya tampil bagi PML/PPL yang timnya sudah punya daftar KK; bagi yang lain tahap tetap seperti sebelumnya.
update public.sigap_tahap
   set isi = (
         select coalesce(array_agg(x order by ord), '{}')
           from (
             select x, row_number() over () as ord
               from unnest(
                 case
                   when 'identifikasi' = any(isi) then
                     isi[1:array_position(isi, 'identifikasi')] || array['pendataan'] || isi[array_position(isi, 'identifikasi')+1:]
                   else isi || array['pendataan']
                 end
               ) as x
           ) t
       ),
       diubah_at = now()
 where induk_kode = 'pascabencana' and kode = 'pendataan' and not ('pendataan' = any(isi));

-- Pemeriksaan (harus: wilayah_tim, identifikasi, pendataan, translok:1)
-- select isi from public.sigap_tahap where induk_kode='pascabencana' and kode='pendataan';
