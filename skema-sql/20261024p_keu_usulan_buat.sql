-- 20261024p_keu_usulan_buat.sql
-- (24 Okt 2026) Tab "Revisi" pada ruang kerja RO (papan 9/10): membuat usulan revisi RO lewat fungsi (bukan insert langsung) karena kolom dibuat_oleh wajib
-- dan harus berasal dari akun pelaku di server. Menambah fungsi keu_usulan_buat ke daftar izin gerbang keu_jalankan, dan tampilan jejak usulan.
-- Tanpa tabel baru; aman diulang. Hak membuat tetap ditegakkan penjaga tabel keu_usulan_cek (jadwal dibuka; berwenang rab/draf pada RO itu).

create or replace function keu_usulan_buat(p_jadwal bigint, p_ro text, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_rab bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  perform set_config('app.akun_id', p_akun::text, true);
  select id into v_rab from keu_rab where ro_kode = p_ro and status in ('draf','menunggu_ketua','menunggu_ppk','dikembalikan','disetujui')
   order by (status <> 'disetujui') desc, nomor desc, id desc limit 1;
  insert into keu_revisi_usulan(jadwal_id, ro_kode, rab_id, dibuat_oleh) values (p_jadwal, p_ro, v_rab, p_akun) returning id into v_id;
  return v_id;
end $$;
revoke execute on function keu_usulan_buat(bigint, text, bigint) from public, anon, authenticated;
grant execute on function keu_usulan_buat(bigint, text, bigint) to service_role;

-- daftar izin gerbang: tambahkan keu_usulan_buat bila belum ada
do $$
declare d text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'keu_jalankan';
  if position('''keu_usulan_buat''' in d) = 0 then
    d := replace(d, '''keu_usulan_aksi'']', '''keu_usulan_aksi'',''keu_usulan_buat'']');
    if position('''keu_usulan_buat''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak ditemukan'; end if;
    execute d;
  end if;
end $$;

create or replace view keu_v_usulan_jejak with (security_invoker = true) as
select r.id, r.usulan_id, u.jadwal_id, u.ro_kode, r.aksi, r.dari, r.ke, a.nama as oleh_nama, r.catatan, r.waktu
from keu_revisi_usulan_riwayat r
join keu_revisi_usulan u on u.id = r.usulan_id
left join sigap_akun a on a.id = r.oleh;
revoke all on keu_v_usulan_jejak from anon, authenticated;
grant select on keu_v_usulan_jejak to service_role;
