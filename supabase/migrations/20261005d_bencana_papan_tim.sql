-- (5 Okt 2026) Langkah 5 "Papan Tim" (keroyokan): penanda PRIVATE / KEROYOK per Sub SLS.
-- Data lama seluruhnya 'keroyok' (keputusan user).
alter table public.bencana_alokasi_subsls add column if not exists mode_kerja text not null default 'keroyok';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='bencana_alokasi_subsls_mode_kerja_check') then
    alter table public.bencana_alokasi_subsls add constraint bencana_alokasi_subsls_mode_kerja_check check (mode_kerja in ('private','keroyok'));
  end if;
end $$;

-- PPL ganti tim / menolak: Sub SLS-nya tetap milik tim lama, PPL dilepas & private -> keroyok.
create or replace function public.bencana_trg_ppl_ganti_tim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.atasan_id is not distinct from old.atasan_id then return null; end if;
  update bencana_alokasi_subsls set pml_id = new.atasan_id
   where ppl_id = new.id and pml_id is null and new.atasan_id is not null;
  update bencana_alokasi_subsls set ppl_id = null, mode_kerja = 'keroyok', jarak_km = null, jarak_metode = null, jarak_status = null
   where ppl_id = new.id and pml_id is not null and pml_id is distinct from new.atasan_id;
  return null;
end $$;

create or replace function public.bencana_trg_ppl_menolak() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_kontak_pendaftaran_bencana = 'menolak'
     and old.status_kontak_pendaftaran_bencana is distinct from 'menolak'
     and coalesce(new.peran, '') = 'ppl' then
    update bencana_alokasi_subsls set ppl_id = null, mode_kerja = 'keroyok', jarak_km = null, jarak_metode = null, jarak_status = null
     where ppl_id = new.id and pml_id is not null;
    update bencana_petugas set atasan_id = null where id = new.id and atasan_id is not null;
  end if;
  return null;
end $$;

-- Notifikasi perubahan mode Private/Keroyok.
create or replace function public.bencana_trg_notif_mode() returns trigger
language plpgsql security definer set search_path = public as $$
declare lbl text; nm text;
begin
  if coalesce(current_setting('bencana.notif_off', true), '') = '1' then return null; end if;
  if new.mode_kerja is not distinct from old.mode_kerja then return null; end if;
  lbl := bencana_label_subsls(new.idsubsls);
  select nama into nm from bencana_petugas where id = new.ppl_id;
  if new.mode_kerja = 'private' then
    perform bencana_notif(new.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' kini PRIVATE: dikerjakan oleh Anda sendiri.');
    perform bencana_notif(new.pml_id, 'pml', 'Sub SLS ' || lbl || ' kini PRIVATE (dikerjakan ' || coalesce(nm, '-') || ').');
  else
    perform bencana_notif(new.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' kini KEROYOK: dikerjakan bersama seluruh PPL tim.');
    perform bencana_notif(new.pml_id, 'pml', 'Sub SLS ' || lbl || ' kini KEROYOK (dikerjakan bersama seluruh PPL tim).');
  end if;
  return null;
end $$;

drop trigger if exists bencana_notif_mode on public.bencana_alokasi_subsls;
create trigger bencana_notif_mode after update of mode_kerja on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_notif_mode();
