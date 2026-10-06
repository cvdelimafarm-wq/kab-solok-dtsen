-- (7 Okt 2026) SIGAP PEDIA -- TRIGGER imutabilitas, penomoran, pencarian & penjaga storage.
--
-- SUDAH DITERAPKAN 7 Okt 2026 (15 trigger + 1 trigger storage + bucket sigap-pedia + penjaga storage). File ini disimpan
-- sbg catatan & utk lingkungan baru; aman dijalankan ulang (idempoten). Fungsi dibuat oleh 20261007a.
-- Test: supabase/tests/pedia_trigger_test.sql (19 test, semua lulus 7 Okt 2026, di-ROLLBACK).
--
-- Cek setelah dijalankan:
--   select tgname from pg_trigger where tgname like 'pedia_%' order by 1;   -- 16 baris (15 tabel pedia_ + 1 di storage.objects)

drop trigger if exists pedia_entri_bi on pedia_entri;
create trigger pedia_entri_bi before insert on pedia_entri for each row execute function pedia_entri_sebelum_insert();
drop trigger if exists pedia_entri_jaga_u on pedia_entri;
create trigger pedia_entri_jaga_u before update on pedia_entri for each row execute function pedia_entri_jaga();
drop trigger if exists pedia_entri_jaga_d on pedia_entri;
create trigger pedia_entri_jaga_d before delete on pedia_entri for each row execute function pedia_entri_jaga();

drop trigger if exists pedia_kategori_jaga_d on pedia_kategori;
create trigger pedia_kategori_jaga_d before delete on pedia_kategori for each row execute function pedia_kategori_jaga();

drop trigger if exists pedia_entri_tag_jaga on pedia_entri_tag;
create trigger pedia_entri_tag_jaga before insert or update or delete on pedia_entri_tag for each row execute function pedia_relasi_jaga();
drop trigger if exists pedia_entri_regulasi_jaga on pedia_entri_regulasi;
create trigger pedia_entri_regulasi_jaga before insert or update or delete on pedia_entri_regulasi for each row execute function pedia_relasi_jaga();
drop trigger if exists pedia_tautan_jaga on pedia_tautan;
create trigger pedia_tautan_jaga before insert or update or delete on pedia_tautan for each row execute function pedia_relasi_jaga();

drop trigger if exists pedia_regulasi_status_u on pedia_regulasi;
create trigger pedia_regulasi_status_u before update on pedia_regulasi for each row execute function pedia_regulasi_status();

drop trigger if exists pedia_file_jaga_iud on pedia_file;
create trigger pedia_file_jaga_iud before insert or update or delete on pedia_file for each row execute function pedia_file_jaga();

drop trigger if exists pedia_audit_bi on pedia_audit;
create trigger pedia_audit_bi before insert on pedia_audit for each row execute function pedia_audit_cek_insert();
drop trigger if exists pedia_audit_ud on pedia_audit;
create trigger pedia_audit_ud before update or delete on pedia_audit for each row execute function pedia_audit_jaga();

drop trigger if exists pedia_cari_entri on pedia_entri;
create trigger pedia_cari_entri after insert or update on pedia_entri for each row execute function pedia_cari_picu();
drop trigger if exists pedia_cari_tag on pedia_entri_tag;
create trigger pedia_cari_tag after insert or delete on pedia_entri_tag for each row execute function pedia_cari_picu();
drop trigger if exists pedia_cari_reg on pedia_entri_regulasi;
create trigger pedia_cari_reg after insert or delete on pedia_entri_regulasi for each row execute function pedia_cari_picu();
drop trigger if exists pedia_cari_regulasi on pedia_regulasi;
create trigger pedia_cari_regulasi after update on pedia_regulasi for each row execute function pedia_cari_picu();

-- ---------------------------------------------------------------- storage: bucket privat + penjaga hapus/timpa
-- Bucket juga dibuat otomatis oleh server saat unggahan pertama bila belum ada.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sigap-pedia', 'sigap-pedia', false, 26214400)
on conflict (id) do nothing;

create or replace function public.pedia_storage_jaga() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.bucket_id = 'sigap-pedia' then raise exception 'SIGAP PEDIA: file bukti di storage tidak boleh dihapus'; end if;
    return old;
  end if;
  if old.bucket_id = 'sigap-pedia' and (
       new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name
       or (old.version is not null and new.version is distinct from old.version)
       or (old.metadata ->> 'eTag' is not null and new.metadata ->> 'eTag' is distinct from old.metadata ->> 'eTag')
       or (old.metadata ->> 'size' is not null and new.metadata ->> 'size' is distinct from old.metadata ->> 'size')) then
    raise exception 'SIGAP PEDIA: file bukti di storage tidak boleh ditimpa/dipindah';
  end if;
  return new;
end $$;
drop trigger if exists pedia_storage_jaga_ud on storage.objects;
create trigger pedia_storage_jaga_ud before update or delete on storage.objects for each row execute function public.pedia_storage_jaga();

select tgname from pg_trigger where tgname like 'pedia_%' order by 1;
