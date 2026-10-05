-- (5 Okt 2026) Notifikasi perubahan alokasi -- permintaan user: "setiap perubahan
-- alokasi di-push notifikasi ke PML dan PPL bersangkutan". Saluran: kotak
-- pemberitahuan di halaman konfirmasi (PPL) & halaman PML, hilang setelah diklik "Oke".
-- Dibuat OTOMATIS oleh trigger DB, jadi berlaku utk SEMUA jalur perubahan
-- (reassign, pecah, auto-plot, impor, reset, SQL manual).
--
-- Matikan sementara dlm satu transaksi (mis. saat pembatalan yg punya pesan khusus):
--   select set_config('bencana.notif_off', '1', true);

create table if not exists public.bencana_notifikasi (
  id bigint generated always as identity primary key,
  petugas_id bigint not null references public.bencana_petugas(id),
  untuk text not null check (untuk in ('ppl','pml')),
  pesan text not null,
  dibuat_at timestamptz not null default now(),
  dibaca_at timestamptz
);
create index if not exists bencana_notifikasi_belum_dibaca on public.bencana_notifikasi (petugas_id, untuk) where dibaca_at is null;
alter table public.bencana_notifikasi enable row level security;

create or replace function public.bencana_label_subsls(p_id text) returns text
language sql stable set search_path = public as $$
  select coalesce(
    (select w.sls || ' (' || w.sub_sls || '), Nagari ' || w.nagari from bencana_wilayah w where w.idsubsls = p_id limit 1),
    p_id)
$$;

create or replace function public.bencana_notif(p_petugas bigint, p_untuk text, p_pesan text) returns void
language sql set search_path = public as $$
  insert into bencana_notifikasi (petugas_id, untuk, pesan) select p_petugas, p_untuk, p_pesan where p_petugas is not null
$$;

-- Perubahan baris alokasi Sub SLS (tambah / pindah pemegang / lepas).
create or replace function public.bencana_trg_notif_alokasi() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lbl text; nm_baru text; nm_lama text; pml_baru bigint; pml_lama bigint;
begin
  if coalesce(current_setting('bencana.notif_off', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    lbl := bencana_label_subsls(new.idsubsls);
    select nama, atasan_id into nm_baru, pml_baru from bencana_petugas where id = new.ppl_id;
    perform bencana_notif(new.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' ditambahkan ke wilayah tugas Anda.');
    perform bencana_notif(pml_baru, 'pml', 'Sub SLS ' || lbl || ' ditambahkan ke wilayah tugas ' || nm_baru || '.');
  elsif tg_op = 'DELETE' then
    lbl := bencana_label_subsls(old.idsubsls);
    select nama, atasan_id into nm_lama, pml_lama from bencana_petugas where id = old.ppl_id;
    perform bencana_notif(old.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' dilepas dari wilayah tugas Anda.');
    perform bencana_notif(pml_lama, 'pml', 'Sub SLS ' || lbl || ' dilepas dari wilayah tugas ' || nm_lama || '.');
  elsif tg_op = 'UPDATE' and new.ppl_id is distinct from old.ppl_id then
    lbl := bencana_label_subsls(new.idsubsls);
    select nama, atasan_id into nm_lama, pml_lama from bencana_petugas where id = old.ppl_id;
    select nama, atasan_id into nm_baru, pml_baru from bencana_petugas where id = new.ppl_id;
    perform bencana_notif(old.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' dialihkan dari Anda ke ' || coalesce(nm_baru, '-') || '.');
    perform bencana_notif(new.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' dialihkan kepada Anda (sebelumnya ' || coalesce(nm_lama, '-') || ').');
    if pml_lama is not distinct from pml_baru then
      perform bencana_notif(pml_baru, 'pml', 'Sub SLS ' || lbl || ' dialihkan dari ' || coalesce(nm_lama, '-') || ' ke ' || coalesce(nm_baru, '-') || '.');
    else
      perform bencana_notif(pml_lama, 'pml', 'Sub SLS ' || lbl || ' dialihkan dari ' || coalesce(nm_lama, '-') || ' ke ' || coalesce(nm_baru, '-') || ' (di luar tim Anda).');
      perform bencana_notif(pml_baru, 'pml', 'Sub SLS ' || lbl || ' dialihkan ke ' || coalesce(nm_baru, '-') || ' (sebelumnya ' || coalesce(nm_lama, '-') || ').');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists bencana_notif_alokasi on public.bencana_alokasi_subsls;
create trigger bencana_notif_alokasi after insert or delete or update of ppl_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_notif_alokasi();

-- Pindah / keluar / masuk tim PPL (perubahan atasan_id).
create or replace function public.bencana_trg_notif_tim() returns trigger
language plpgsql security definer set search_path = public as $$
declare pml_lama_nm text; pml_baru_nm text;
begin
  if coalesce(current_setting('bencana.notif_off', true), '') = '1' then return null; end if;
  if new.atasan_id is not distinct from old.atasan_id then return null; end if;
  if coalesce(old.peran, '') <> 'ppl' and coalesce(new.peran, '') <> 'ppl' then return null; end if;
  select nama into pml_lama_nm from bencana_petugas where id = old.atasan_id;
  select nama into pml_baru_nm from bencana_petugas where id = new.atasan_id;
  if new.atasan_id is null then
    perform bencana_notif(new.id, 'ppl', 'Anda tidak lagi tergabung dalam tim PML ' || coalesce(pml_lama_nm, '-') || '.');
    perform bencana_notif(old.atasan_id, 'pml', new.nama || ' keluar dari tim Anda.');
  else
    perform bencana_notif(new.id, 'ppl', 'Anda tergabung dalam tim PML ' || pml_baru_nm ||
      case when old.atasan_id is not null then ' (sebelumnya tim ' || coalesce(pml_lama_nm, '-') || ').' else '.' end);
    perform bencana_notif(new.atasan_id, 'pml', new.nama || ' bergabung ke tim Anda' ||
      case when old.atasan_id is not null then ' (pindah dari tim ' || coalesce(pml_lama_nm, '-') || ').' else '.' end);
    perform bencana_notif(old.atasan_id, 'pml', new.nama || ' pindah ke tim ' || pml_baru_nm || '.');
  end if;
  return null;
end $$;

drop trigger if exists bencana_notif_tim on public.bencana_petugas;
create trigger bencana_notif_tim after update of atasan_id on public.bencana_petugas
  for each row execute function public.bencana_trg_notif_tim();

-- (5 Okt 2026) PPL MENOLAK otomatis keluar tim begitu tidak memegang Sub SLS lagi.
create or replace function public.bencana_keluarkan_jika_menolak(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update bencana_petugas p set atasan_id = null
  where p.id = p_id and p.atasan_id is not null and p.status_kontak_pendaftaran_bencana = 'menolak'
    and not exists (select 1 from bencana_alokasi_subsls a where a.ppl_id = p.id)
$$;
create or replace function public.bencana_trg_menolak_petugas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_kontak_pendaftaran_bencana = 'menolak' and old.status_kontak_pendaftaran_bencana is distinct from 'menolak' then
    perform bencana_keluarkan_jika_menolak(new.id);
  end if;
  return null;
end $$;
create or replace function public.bencana_trg_menolak_alokasi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or new.ppl_id is distinct from old.ppl_id then
    perform bencana_keluarkan_jika_menolak(old.ppl_id);
  end if;
  return null;
end $$;
drop trigger if exists bencana_menolak_petugas on public.bencana_petugas;
create trigger bencana_menolak_petugas after update of status_kontak_pendaftaran_bencana on public.bencana_petugas
  for each row execute function public.bencana_trg_menolak_petugas();
drop trigger if exists bencana_menolak_alokasi on public.bencana_alokasi_subsls;
create trigger bencana_menolak_alokasi after delete or update of ppl_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_menolak_alokasi();
