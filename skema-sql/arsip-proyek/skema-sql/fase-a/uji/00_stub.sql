do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create table sigap_akun (id bigint generated always as identity primary key, nama text not null, jenis text not null, nik text, nip text, aktif boolean not null default true, super boolean not null default false);
create table sigap_kegiatan (id bigint generated always as identity primary key, kode text not null unique, nama text not null, aktif boolean not null default true);
create table sigap_audit (id bigint generated always as identity primary key, akun_id bigint, aksi text not null, detail jsonb, waktu timestamptz not null default now());
insert into sigap_akun(nama,jenis) values ('Admin','organik'),('Kepala','organik'),('PPK','organik'),('Ketua A','organik'),('Ketua B','organik'),('AdminRO A','organik'),('Bendahara','organik'),('TU','organik'),('Mitra','mitra');
