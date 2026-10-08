-- (8 Okt 2026) Penanda akun yang masih memakai PIN awal bersama 1303 (diganti pegawai sendiri lewat layar "Ganti PIN").
-- Penanda selalu dicek ulang terhadap hash PIN sebenarnya oleh server (lib/sigapPin.masihPinAwal), jadi aman bila basi.
alter table public.sigap_akun add column if not exists pin_bawaan boolean not null default false;

update public.sigap_akun set pin_bawaan = true
 where id in (4,6,23,67,73,148,160,200,266,281,299,322,346,357,410,464,478,550,563,671,710,712,787,788,789,790,791,792)
   and pin_hash is not null;
