-- (7 Okt 2026) Reset PIN SIGAP: PIN sementara (hasil reset admin, wajib diganti, kedaluwarsa) + penanda kapan PIN terakhir diubah
-- (dipakai membuat tiket reset mandiri sekali pakai).
alter table sigap_akun add column if not exists pin_diubah_at timestamptz;
alter table sigap_akun add column if not exists pin_sementara_sampai timestamptz;
comment on column sigap_akun.pin_sementara_sampai is 'Bila terisi: PIN saat ini adalah PIN sementara hasil reset admin; berlaku s.d. waktu ini dan wajib diganti saat masuk.';
