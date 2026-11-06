-- 20261106g_kolom_akun_penunjuk_petugas.sql
-- Satu identitas petugas, tahap 4a. Dijalankan Iqbal di SQL Editor Supabase, SETELAH 20261106f.
--
-- Tabel-tabel yang menunjuk ID petugas lama (bencana_petugas.id) diberi kolom pendamping yang menunjuk akun (sigap_akun.id):
--   * kolom lama TIDAK diubah atau dihapus (modul bencana lama masih menulisnya sampai 20 Nov 2026);
--   * kolom baru diisi dari kolom lama lewat sigap_akun.petugas_bencana_id (isi awal di bawah);
--   * pemicu BEFORE INSERT/UPDATE mengisi kolom baru otomatis saat kolom lama ditulis. Bila kode baru menulis kolom baru langsung
--     (kolom lama kosong), nilainya DIPERTAHANKAN.
-- Pemakaian nyata (dicek 6 Nov): sigap_realisasi, sigap_dokumentasi, sigap_izin_susulan punya kolom petugas_id tetapi SELURUH barisnya
-- kosong (mereka memakai penugasan_id), dan bencana_notifikasi serta bencana_dokumen_periksa kosong; kelimanya tidak diberi kolom baru
-- dan kolom lamanya dibuang di tahap 4b.
-- Tidak ada baris yang dihapus.

begin;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'roster_ke_penugasan' and not tgisinternal) then
    raise exception 'Pengaman: jalankan 20261106f dulu. Dibatalkan.';
  end if;
end $$;

create or replace function public.trg_isi_akun_dari_roster()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  i   int := 0;
  j   jsonb := to_jsonb(new);
  jl  jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v   bigint;
  src text;
  dst text;
begin
  -- argumen berpasangan: (kolom_lama, kolom_akun, kolom_lama, kolom_akun, ...)
  while i < tg_nargs loop
    src := tg_argv[i];
    dst := tg_argv[i + 1];
    if tg_op = 'INSERT' or (j ->> src) is distinct from (jl ->> src) then
      if (j ->> src) is not null then
        select id into v from sigap_akun where petugas_bencana_id = (j ->> src)::bigint;
        j := jsonb_set(j, array[dst], coalesce(to_jsonb(v), 'null'::jsonb));
      elsif tg_op = 'UPDATE' then
        j := jsonb_set(j, array[dst], 'null'::jsonb);
      end if;
    end if;
    i := i + 2;
  end loop;
  return jsonb_populate_record(new, j);
end
$$;

do $$
declare
  r     record;
  i     int;
  srcs  text;
  args  text;
begin
  for r in
    select * from (values
      ('bencana_alokasi_subsls',            array['ppl_id', 'ppl_akun_id', 'pml_id', 'pml_akun_id']),
      ('bencana_petugas_kegiatan_lain',     array['petugas_id', 'petugas_akun_id']),
      ('bencana_tawaran_menginap_kandidat', array['petugas_id', 'petugas_akun_id']),
      ('bencana_pembatalan_plot',           array['pml_id', 'pml_akun_id', 'petugas_id', 'petugas_akun_id']),
      ('bencana_identifikasi_subsls',       array['pml_id', 'pml_akun_id']),
      ('bencana_identifikasi_alokasi',      array['pml_pendamping_id', 'pml_pendamping_akun_id', 'pml_pelaksana_id', 'pml_pelaksana_akun_id']),
      ('bencana_pendataan_permintaan',      array['pml_id', 'pml_akun_id']),
      ('bencana_kolam_izin',                array['pml_id', 'pml_akun_id']),
      ('bencana_undangan',                  array['petugas_id', 'petugas_akun_id'])
    ) as v(tabel, pasangan)
  loop
    srcs := null;
    args := null;
    i := 1;
    while i < array_length(r.pasangan, 1) loop
      execute format('alter table public.%I add column if not exists %I bigint references public.sigap_akun(id)', r.tabel, r.pasangan[i + 1]);
      execute format('update public.%I t set %I = a.id from public.sigap_akun a where a.petugas_bencana_id = t.%I and t.%I is null',
                     r.tabel, r.pasangan[i + 1], r.pasangan[i], r.pasangan[i + 1]);
      execute format('create index if not exists %I on public.%I (%I) where %I is not null',
                     r.tabel || '_' || r.pasangan[i + 1] || '_idx', r.tabel, r.pasangan[i + 1], r.pasangan[i + 1]);
      srcs := concat_ws(', ', srcs, quote_ident(r.pasangan[i]));
      args := concat_ws(', ', args, quote_literal(r.pasangan[i]), quote_literal(r.pasangan[i + 1]));
      i := i + 2;
    end loop;
    execute format('drop trigger if exists isi_akun_dari_roster on public.%I', r.tabel);
    execute format('create trigger isi_akun_dari_roster before insert or update of %s on public.%I for each row execute function public.trg_isi_akun_dari_roster(%s)',
                   srcs, r.tabel, args);
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------- verifikasi
-- Kolom "belum terisi" harus 0, kecuali bencana_undangan = 1 (petugas lama id 473 NURLATHIFA HARMI, nonaktif, tanpa akun).
select 'alokasi_subsls.ppl' as kolom, count(ppl_id) as terisi_lama, count(ppl_akun_id) as terisi_akun, count(*) filter (where ppl_id is not null and ppl_akun_id is null) as belum from bencana_alokasi_subsls
union all select 'alokasi_subsls.pml', count(pml_id), count(pml_akun_id), count(*) filter (where pml_id is not null and pml_akun_id is null) from bencana_alokasi_subsls
union all select 'petugas_kegiatan_lain', count(petugas_id), count(petugas_akun_id), count(*) filter (where petugas_id is not null and petugas_akun_id is null) from bencana_petugas_kegiatan_lain
union all select 'tawaran_menginap_kandidat', count(petugas_id), count(petugas_akun_id), count(*) filter (where petugas_id is not null and petugas_akun_id is null) from bencana_tawaran_menginap_kandidat
union all select 'pembatalan_plot.pml', count(pml_id), count(pml_akun_id), count(*) filter (where pml_id is not null and pml_akun_id is null) from bencana_pembatalan_plot
union all select 'pembatalan_plot.petugas', count(petugas_id), count(petugas_akun_id), count(*) filter (where petugas_id is not null and petugas_akun_id is null) from bencana_pembatalan_plot
union all select 'identifikasi_subsls.pml', count(pml_id), count(pml_akun_id), count(*) filter (where pml_id is not null and pml_akun_id is null) from bencana_identifikasi_subsls
union all select 'identifikasi_alokasi.pendamping', count(pml_pendamping_id), count(pml_pendamping_akun_id), count(*) filter (where pml_pendamping_id is not null and pml_pendamping_akun_id is null) from bencana_identifikasi_alokasi
union all select 'identifikasi_alokasi.pelaksana', count(pml_pelaksana_id), count(pml_pelaksana_akun_id), count(*) filter (where pml_pelaksana_id is not null and pml_pelaksana_akun_id is null) from bencana_identifikasi_alokasi
union all select 'pendataan_permintaan.pml', count(pml_id), count(pml_akun_id), count(*) filter (where pml_id is not null and pml_akun_id is null) from bencana_pendataan_permintaan
union all select 'kolam_izin.pml', count(pml_id), count(pml_akun_id), count(*) filter (where pml_id is not null and pml_akun_id is null) from bencana_kolam_izin
union all select 'undangan (belum = 1)', count(petugas_id), count(petugas_akun_id), count(*) filter (where petugas_id is not null and petugas_akun_id is null) from bencana_undangan
union all select 'pemicu terpasang (9)', count(*), 0, 0 from pg_trigger where tgname = 'isi_akun_dari_roster' and not tgisinternal;
