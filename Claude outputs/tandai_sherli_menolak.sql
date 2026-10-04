-- Tandai Sherli Handayani (id 60) menolak
update public.bencana_petugas
set status_kontak_pendaftaran_bencana = 'menolak',
    catatan_penolakan_pendaftaran_bencana = 'Menolak (disampaikan petugas ke admin, Okt 2026); sebelumnya sudah menyatakan bersedia.',
    dikontak_pendaftaran_bencana_at = now()
where id = 60;
