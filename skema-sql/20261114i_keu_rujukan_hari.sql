-- skema-sql/20261114i_keu_rujukan_hari.sql
--
-- (14 Nov 2026, Fase 3 "Angka rujukan dan modal pembaruan", langkah pertama) HARI DIBAYAR sebagai angka rujukan bersama:
--  * keu_v_rujukan_penugasan: per identifikasi x kegiatan tertaut x peran -> jumlah penugasan aktif dan batas hari kerja (sigap_penugasan.maks_hari)
--    yang berlaku sekarang. Dibandingkan di aplikasi dengan hari dibayar pada RAB survei (keu_rab_survei_draf.isi.hari).
--  * keu_rujukan_terapkan_hari(): modal pembaruan arah RAB -> penugasan: menyamakan maks_hari penugasan aktif satu peran pada kegiatan yang tertaut.
--    Hak: keu_boleh_penugasan_kegiatan (sama dengan mengubah penugasan). Tiap penerapan dicatat di keu_rujukan_riwayat.
-- Hanya menambah objek baru. Tidak menyentuh data keuangan final (pagu, realisasi, SPK, pembayaran).

begin;

create table if not exists keu_rujukan_riwayat (
  id bigserial primary key,
  ident_id bigint not null references keu_ident(id) on delete cascade,
  kunci text not null,                -- mis. 'hari:ppl:Triwulan IV'
  asal text not null check (asal in ('rab', 'identifikasi', 'delegasi', 'penugasan')),
  tujuan text not null check (tujuan in ('penugasan', 'rab', 'identifikasi', 'delegasi', 'catat')),
  kegiatan_id bigint,
  lama jsonb,
  baru jsonb,
  jumlah_terdampak integer not null default 0,
  catatan text,
  oleh bigint,
  at timestamptz not null default now()
);
create index if not exists keu_rujukan_riwayat_ident on keu_rujukan_riwayat (ident_id, at desc);
alter table keu_rujukan_riwayat enable row level security;
comment on table keu_rujukan_riwayat is '(14 Nov 2026, Fase 3) Riwayat modal pembaruan angka rujukan: dari mana diubah, diterapkan ke mana, nilai lama/baru, jumlah terdampak.';

create or replace view keu_v_rujukan_penugasan as
select t.ident_id, t.kegiatan_id, g.nama as kegiatan_nama, t.fungsi, t.periode, p.peran,
       count(*)::int as n,
       min(p.maks_hari)::int as maks_min,
       max(p.maks_hari)::int as maks_max,
       count(*) filter (where p.maks_hari is null or p.maks_hari = 0)::int as n_kosong
  from keu_ident_kegiatan t
  join sigap_kegiatan g on g.id = t.kegiatan_id
  join sigap_penugasan p on p.kegiatan_id = t.kegiatan_id and p.aktif
 where t.dilepas_at is null
   and (p.sumber is null or p.sumber <> 'administrasi')
 group by t.ident_id, t.kegiatan_id, g.nama, t.fungsi, t.periode, p.peran;
revoke all on keu_v_rujukan_penugasan from anon, authenticated;
comment on view keu_v_rujukan_penugasan is '(14 Nov 2026, Fase 3) Batas hari kerja penugasan per peran pada kegiatan yang tertaut ke identifikasi.';

-- Tampilan baca untuk aplikasi: tanpa nilai lama per penugasan, dengan nama pelaku (kolom aman untuk daftar putih)
create or replace view keu_v_rujukan_pembaruan as
select r.id, r.ident_id, r.kunci, r.asal, r.tujuan, r.kegiatan_id, r.baru, r.jumlah_terdampak, a.nama as oleh_nama, r.at
  from keu_rujukan_riwayat r left join sigap_akun a on a.id = r.oleh;
revoke all on keu_v_rujukan_pembaruan from anon, authenticated;

create or replace function keu_rujukan_terapkan_hari(p_ident bigint, p_kegiatan bigint, p_peran text, p_hari integer, p_kunci text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_lama jsonb; v_n int;
begin
  if p_akun is null then raise exception 'Sesi tidak dikenal' using errcode = '42501'; end if;
  if p_hari is null or p_hari < 0 or p_hari > 366 then raise exception 'Hari dibayar harus 0 sampai 366' using errcode = '23514'; end if;
  if not exists (select 1 from keu_ident_kegiatan where ident_id = p_ident and kegiatan_id = p_kegiatan and dilepas_at is null) then
    raise exception 'Kegiatan % tidak tertaut ke identifikasi %', p_kegiatan, p_ident using errcode = '23514';
  end if;
  if not keu_boleh_penugasan_kegiatan(p_akun, p_kegiatan) then raise exception 'Anda tidak berwenang mengubah penugasan kegiatan ini' using errcode = '42501'; end if;
  select jsonb_agg(jsonb_build_object('penugasan_id', id, 'maks_hari', maks_hari) order by id) into v_lama
    from sigap_penugasan where kegiatan_id = p_kegiatan and aktif and peran = p_peran and (sumber is null or sumber <> 'administrasi');
  update sigap_penugasan set maks_hari = nullif(p_hari, 0)
   where kegiatan_id = p_kegiatan and aktif and peran = p_peran and (sumber is null or sumber <> 'administrasi')
     and maks_hari is distinct from nullif(p_hari, 0);
  get diagnostics v_n = row_count;
  insert into keu_rujukan_riwayat (ident_id, kunci, asal, tujuan, kegiatan_id, lama, baru, jumlah_terdampak, oleh)
  values (p_ident, coalesce(nullif(p_kunci, ''), 'hari:' || p_peran), 'rab', 'penugasan', p_kegiatan, coalesce(v_lama, '[]'::jsonb), jsonb_build_object('peran', p_peran, 'maks_hari', nullif(p_hari, 0)), v_n, p_akun);
  return jsonb_build_object('ok', true, 'diubah', v_n);
end $f$;
revoke execute on function keu_rujukan_terapkan_hari(bigint, bigint, text, integer, text, bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_rujukan_terapkan_hari''' in d) = 0 then
    d := replace(d, '''keu_dlg_draf_kursi''];', '''keu_dlg_draf_kursi'',''keu_rujukan_terapkan_hari''];');
    if position('''keu_rujukan_terapkan_hari''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
