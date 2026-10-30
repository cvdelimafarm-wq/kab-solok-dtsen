-- STUB lokal untuk uji DDL. Bukan migrasi. Meniru kolom kunci tabel master Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create table sigap_akun (id bigint generated always as identity primary key, nama text not null, jenis text not null, nik text, nip text, aktif boolean not null default true);
create table sigap_kegiatan (id bigint generated always as identity primary key, kode text not null unique, nama text not null, kode_anggaran text, aktif boolean not null default true);
create table sigap_penugasan (id bigint generated always as identity primary key, kegiatan_id bigint not null references sigap_kegiatan(id), akun_id bigint not null references sigap_akun(id), peran text not null, aktif boolean not null default true);
create table sigap_audit (id bigint generated always as identity primary key, akun_id bigint, aksi text not null, detail jsonb, waktu timestamptz not null default now());
create table sigap_peran (id bigint generated always as identity primary key, kode text not null unique, nama text not null);
create table pedia_regulasi (id bigint generated always as identity primary key, jenis text not null, nomor text not null, tahun int not null, judul text, status text not null default 'berlaku');
insert into sigap_akun(nama,jenis) values ('Uji Pegawai A','organik'),('Uji Pegawai B','organik'),('Uji Mitra C','mitra'),('Uji Mitra D','mitra');
insert into sigap_kegiatan(kode,nama) values ('BNC','Data Tunggal Bencana');
insert into sigap_peran(kode,nama) values ('admin_anggaran','Admin anggaran'),('pj_kegiatan','PJ kegiatan'),('bendahara','Bendahara');
