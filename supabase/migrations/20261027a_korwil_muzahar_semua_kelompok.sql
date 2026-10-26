-- =====================================================================
-- 20261027a_korwil_muzahar_semua_kelompok.sql
-- (27 Okt 2026) Permintaan user: Muzahar (akun 410) menjadi korwil/kortim untuk SEMUA kelompok pendataan (1-6), sama seperti M. Iqbal Hadi (akun 354).
-- Keadaan sebelumnya: Muzahar kortim hanya di kelompok 5 (urutan 2); Iqbal kortim di kelompok 1-6 (urutan 3).
-- Yang berubah: 5 baris baru di bencana_kelompok_tim (kelompok 1, 2, 3, 4, 6; peran kortim; urutan 4). Kelompok 5 tidak disentuh.
-- Tidak mengubah sigap_penugasan, bencana_petugas, hari kerja, maupun tarif. Idempoten (aman dijalankan dua kali). Satu transaksi.
-- Pasangkan dengan kode: app/api/portal/korwil/monitoring/route.ts + lib/portal/korwilMonitor.ts (kortim banyak kelompok mendapat pemilih kelompok).
-- Pemulihan: delete from bencana_kelompok_tim where kegiatan_id = 1 and peran = 'kortim' and akun_id = 410 and kelompok <> 5;
-- =====================================================================
begin;

do $$
declare v_akun bigint := 410; v_keg bigint := 1; v_nama text; v_ada integer;
begin
  select nama into v_nama from sigap_akun where id = v_akun;
  if v_nama is null then raise exception 'Akun % tidak ditemukan.', v_akun; end if;
  if v_nama not ilike '%muzahar%' then raise exception 'Akun % bukan Muzahar (nama: %). Dibatalkan.', v_akun, v_nama; end if;
  select count(distinct kelompok) into v_ada from bencana_kelompok_tim where kegiatan_id = v_keg and peran = 'kortim' and aktif and kelompok between 1 and 6;
  if v_ada <> 6 then raise exception 'Kelompok 1-6 pada kegiatan % belum lengkap (% ditemukan). Dibatalkan.', v_keg, v_ada; end if;
end $$;

insert into bencana_kelompok_tim (kegiatan_id, kelompok, peran, akun_id, urutan, aktif)
select 1, k, 'kortim', 410, 4, true
from generate_series(1, 6) as k
on conflict (kegiatan_id, kelompok, peran, akun_id) do update set aktif = true;
-- (kelompok 5: baris lama tetap, urutan 2 tidak diubah, sehingga kelompok 5 tetap menjadi tampilan bawaan Muzahar)

-- Ringkasan hasil (harus: 6 kelompok untuk Muzahar, 6 untuk Iqbal)
select akun_id, count(*) as jumlah_kelompok, string_agg(kelompok::text || '(u' || urutan || ')', ', ' order by kelompok) as kelompok
from bencana_kelompok_tim
where kegiatan_id = 1 and peran = 'kortim' and aktif and akun_id in (354, 410)
group by akun_id order by akun_id;

commit;
