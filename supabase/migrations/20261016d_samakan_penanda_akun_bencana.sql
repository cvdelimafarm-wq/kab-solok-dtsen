-- 20261016d_samakan_penanda_akun_bencana.sql
-- (16 Okt 2026) Samakan penanda akun: petugas yang PIN-nya dibuat lewat undangan pascabencana (bencana_undangan) tetapi
-- sigap_akun.akun_dibuat_at masih kosong dianggap "belum membuat akun" di laporan. Login SIGAP SUDAH berfungsi untuk mereka
-- (PIN bencana dipakai sebagai cadangan), jadi ini hanya merapikan penanda.
-- Hanya mengisi kolom yang kosong dari tanggal akun bencana; hash PIN TIDAK disalin; tidak ada data dihapus. Idempotent (jalankan ulang aman).
-- Perkiraan: 78 akun (per 16 Okt 2026).

begin;

do $$
declare n int;
begin
  update sigap_akun a
     set akun_dibuat_at = u.akun_dibuat_at
    from bencana_undangan u
   where u.petugas_id = a.petugas_bencana_id
     and a.pin_hash is null
     and a.akun_dibuat_at is null
     and u.pin_hash is not null
     and u.akun_dibuat_at is not null;
  get diagnostics n = row_count;
  raise notice 'penanda akun_dibuat_at diisi untuk % akun (perkiraan 78)', n;
end $$;

commit;
