-- (5 Okt 2026) PLOTTING DUA LAPIS: Sub SLS -> PML (tim, wajib) -> PPL (opsional).
-- Permintaan user: "plotting bisa plot PML dulu, sehingga jika PPL-nya dilepas
-- maka wilayah kerja PML tetap nempel ke PML, kecuali diminta lepas semuanya".
--   - bencana_alokasi_subsls.pml_id = tim pemilik Sub SLS; ppl_id boleh kosong
--     ("belum ada PPL").
--   - PPL keluar/pindah tim atau MENOLAK -> ppl_id dikosongkan, pml_id TETAP.
--   - PML menolak/diganti -> baris tidak berubah ("menunggu PML pengganti").
--   - Sub SLS kembali "belum diplot" HANYA lewat "Lepas dari tim"/"Lepas semua".

alter table public.bencana_alokasi_subsls add column if not exists pml_id bigint references public.bencana_petugas(id);
alter table public.bencana_alokasi_subsls alter column ppl_id drop not null;
create index if not exists bencana_alokasi_subsls_pml on public.bencana_alokasi_subsls(pml_id);

-- Data lama: PML diambil dari atasan PPL pemegangnya (PPL tanpa PML -> tetap kosong).
update public.bencana_alokasi_subsls a set pml_id = p.atasan_id
from public.bencana_petugas p where p.id = a.ppl_id and a.pml_id is null and p.atasan_id is not null;

-- Kertas kerja: PML dibaca dari baris alokasi (fallback atasan PPL utk jaga2).
create or replace function public.bencana_kertas_kerja_alokasi()
 returns table(idsubsls text, kecamatan text, nagari text, sls text, sub_sls text, is_terdampak boolean, kk_total numeric, punya_data_kk boolean, skor_beban_pendataan numeric, porsi_kk numeric, jarak_km numeric, jarak_status text, jumlah_hari_kerja numeric, skor_jarak numeric, skor_beban_akhir numeric, terkunci boolean, ppl_id bigint, ppl_nama text, pml_id bigint, pml_nama text, korwil_id bigint, korwil_nama text)
 language sql stable security definer set search_path to 'public'
as $function$
  with pengaturan as (
    select
      coalesce(max(nilai) filter (where kunci = 'pembagi_jarak_km'), 5) as pembagi_jarak,
      coalesce(max(nilai) filter (where kunci = 'menit_per_kk_terdampak'), 20) as menit_terdampak,
      coalesce(max(nilai) filter (where kunci = 'menit_per_kk_tidak_terdampak'), 3) as menit_tidak_terdampak,
      coalesce(max(nilai) filter (where kunci = 'jam_kerja_per_hari'), 5) as jam_kerja
    from bencana_pengaturan_beban
  ),
  dasar as (
    select
      s.*,
      pengaturan.pembagi_jarak,
      greatest(1, ceil(
        (s.kk_terdampak_estimasi * pengaturan.menit_terdampak
         + s.kk_tidak_terdampak_estimasi * pengaturan.menit_tidak_terdampak)
        / nullif(pengaturan.jam_kerja * 60, 0)
      )) as jumlah_hari_kerja
    from bencana_skor_beban_subsls() s
    cross join pengaturan
  )
  select
    d.idsubsls, d.kecamatan, d.nagari, d.sls, d.sub_sls, d.is_terdampak, d.kk_total, d.punya_data_kk,
    case when a.porsi_kk is not null and d.kk_total > 0
      then round(d.skor_beban_pendataan * a.porsi_kk / d.kk_total, 2)
      else d.skor_beban_pendataan end as skor_beban_pendataan,
    a.porsi_kk,
    a.jarak_km,
    coalesce(a.jarak_status, 'tanpa_data') as jarak_status,
    case when a.porsi_kk is not null and d.kk_total > 0
      then round(d.jumlah_hari_kerja * a.porsi_kk / d.kk_total, 2)
      else d.jumlah_hari_kerja end as jumlah_hari_kerja,
    coalesce(round(
      a.jarak_km / d.pembagi_jarak *
      (case when a.porsi_kk is not null and d.kk_total > 0
        then d.jumlah_hari_kerja * a.porsi_kk / d.kk_total
        else d.jumlah_hari_kerja end)
    , 2), 0) as skor_jarak,
    round(
      (case when a.porsi_kk is not null and d.kk_total > 0
        then d.skor_beban_pendataan * a.porsi_kk / d.kk_total
        else d.skor_beban_pendataan end)
      + coalesce(
          a.jarak_km / d.pembagi_jarak *
          (case when a.porsi_kk is not null and d.kk_total > 0
            then d.jumlah_hari_kerja * a.porsi_kk / d.kk_total
            else d.jumlah_hari_kerja end)
        , 0)
    , 2) as skor_beban_akhir,
    coalesce(a.terkunci, false) as terkunci,
    ppl.id as ppl_id, ppl.nama as ppl_nama,
    pml.id as pml_id, pml.nama as pml_nama,
    korwil.id as korwil_id, korwil.nama as korwil_nama
  from dasar d
  join bencana_sampel_subsls sp on sp.idsubsls = d.idsubsls and sp.termasuk_sampel = true
  left join bencana_alokasi_subsls a on a.idsubsls = d.idsubsls
  left join bencana_petugas ppl on ppl.id = a.ppl_id
  left join bencana_petugas pml on pml.id = coalesce(a.pml_id, ppl.atasan_id)
  left join bencana_petugas korwil on korwil.id = pml.atasan_id
  order by d.kecamatan, d.nagari, d.sls, d.sub_sls, a.porsi_kk desc nulls last, ppl.nama;
$function$;

-- Ringkasan beban per PML/Korwil: Sub SLS dihitung dari kepemilikan TIM (pml_id), bukan lewat PPL.
create or replace function public.bencana_ringkasan_beban_pml()
 returns table(pml_id bigint, pml_nama text, korwil_nama text, jumlah_ppl bigint, jumlah_subsls bigint, total_skor_beban_akhir numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select
    pml.id, pml.nama, korwil.nama,
    (select count(*) from bencana_petugas x where x.atasan_id = pml.id and x.peran = 'ppl'),
    count(k.idsubsls),
    round(coalesce(sum(k.skor_beban_akhir), 0), 2)
  from bencana_petugas pml
  left join bencana_kertas_kerja_alokasi() k on k.pml_id = pml.id
  left join bencana_petugas korwil on korwil.id = pml.atasan_id
  where pml.peran = 'pml'
  group by pml.id, pml.nama, korwil.nama
  order by 6 desc nulls last;
$function$;

create or replace function public.bencana_ringkasan_beban_korwil()
 returns table(korwil_id bigint, korwil_nama text, jumlah_pml bigint, jumlah_ppl bigint, jumlah_subsls bigint, total_skor_beban_akhir numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select
    korwil.id, korwil.nama,
    (select count(*) from bencana_petugas x where x.atasan_id = korwil.id and x.peran = 'pml'),
    (select count(*) from bencana_petugas y join bencana_petugas x on x.id = y.atasan_id
       where x.atasan_id = korwil.id and x.peran = 'pml' and y.peran = 'ppl'),
    count(k.idsubsls),
    round(coalesce(sum(k.skor_beban_akhir), 0), 2)
  from bencana_petugas korwil
  left join bencana_petugas pml on pml.atasan_id = korwil.id and pml.peran = 'pml'
  left join bencana_kertas_kerja_alokasi() k on k.pml_id = pml.id
  where korwil.peran = 'korwil'
  group by korwil.id, korwil.nama
  order by 6 desc nulls last;
$function$;

-- ===== TRIGGER =====
-- (a) Isi pml_id otomatis dari PML (atasan) PPL kalau rute lama hanya mengirim ppl_id
--     (auto-plot, impor, pecah). Kalau PPL diganti TANPA menyebut PML, PML ikut tim PPL baru.
create or replace function public.bencana_trg_alokasi_isi_pml() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_atasan bigint;
begin
  if new.ppl_id is not null then
    select atasan_id into v_atasan from bencana_petugas where id = new.ppl_id;
    if tg_op = 'INSERT' then
      if new.pml_id is null then new.pml_id := v_atasan; end if;
    elsif new.ppl_id is distinct from old.ppl_id and new.pml_id is not distinct from old.pml_id and v_atasan is not null then
      new.pml_id := v_atasan;
    end if;
  end if;
  return new;
end $$;

-- (b) PPL pindah/keluar tim: Sub SLS di tim lama TETAP milik tim lama (ppl_id dikosongkan);
--     Sub SLS "tanpa PML" (data lama) yg dipegangnya ikut masuk tim barunya.
create or replace function public.bencana_trg_ppl_ganti_tim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.atasan_id is not distinct from old.atasan_id then return null; end if;
  update bencana_alokasi_subsls set pml_id = new.atasan_id
   where ppl_id = new.id and pml_id is null and new.atasan_id is not null;
  update bencana_alokasi_subsls set ppl_id = null, jarak_km = null, jarak_metode = null, jarak_status = null
   where ppl_id = new.id and pml_id is not null and pml_id is distinct from new.atasan_id;
  return null;
end $$;

-- (c) PPL MENOLAK: lepas dari Sub SLS (tetap milik PML) & keluar tim.
create or replace function public.bencana_trg_ppl_menolak() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_kontak_pendaftaran_bencana = 'menolak'
     and old.status_kontak_pendaftaran_bencana is distinct from 'menolak'
     and coalesce(new.peran, '') = 'ppl' then
    update bencana_alokasi_subsls set ppl_id = null, jarak_km = null, jarak_metode = null, jarak_status = null
     where ppl_id = new.id and pml_id is not null;
    update bencana_petugas set atasan_id = null where id = new.id and atasan_id is not null;
  end if;
  return null;
end $$;

-- (d) Notifikasi perubahan alokasi (versi dua lapis: tim & PPL).
create or replace function public.bencana_trg_notif_alokasi() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lbl text; nm_baru text; nm_lama text;
begin
  if coalesce(current_setting('bencana.notif_off', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    lbl := bencana_label_subsls(new.idsubsls);
    select nama into nm_baru from bencana_petugas where id = new.ppl_id;
    perform bencana_notif(new.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' ditambahkan ke wilayah tugas Anda.');
    perform bencana_notif(new.pml_id, 'pml', 'Sub SLS ' || lbl || ' ditambahkan ke wilayah tim Anda' ||
      case when nm_baru is not null then ' (PPL: ' || nm_baru || ').' else ' (belum ada PPL).' end);
  elsif tg_op = 'DELETE' then
    lbl := bencana_label_subsls(old.idsubsls);
    perform bencana_notif(old.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' dilepas dari wilayah tugas Anda.');
    perform bencana_notif(old.pml_id, 'pml', 'Sub SLS ' || lbl || ' dilepas dari wilayah tim Anda.');
  elsif tg_op = 'UPDATE' then
    lbl := bencana_label_subsls(new.idsubsls);
    if new.pml_id is distinct from old.pml_id then
      perform bencana_notif(old.pml_id, 'pml', 'Sub SLS ' || lbl || ' dipindahkan dari tim Anda.');
      perform bencana_notif(new.pml_id, 'pml', 'Sub SLS ' || lbl || ' ditambahkan ke wilayah tim Anda.');
    end if;
    if new.ppl_id is distinct from old.ppl_id then
      select nama into nm_lama from bencana_petugas where id = old.ppl_id;
      select nama into nm_baru from bencana_petugas where id = new.ppl_id;
      perform bencana_notif(old.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' tidak lagi menjadi tanggung jawab Anda.');
      perform bencana_notif(new.ppl_id, 'ppl', 'Sub SLS ' || lbl || ' menjadi tanggung jawab Anda.');
      if new.pml_id is not distinct from old.pml_id then
        perform bencana_notif(new.pml_id, 'pml', 'Penanggung jawab Sub SLS ' || lbl || ': ' ||
          coalesce(nm_lama, 'belum ada PPL') || ' → ' || coalesce(nm_baru, 'belum ada PPL') || '.');
      end if;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists bencana_alokasi_isi_pml on public.bencana_alokasi_subsls;
create trigger bencana_alokasi_isi_pml before insert or update of ppl_id, pml_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_alokasi_isi_pml();

drop trigger if exists bencana_notif_alokasi on public.bencana_alokasi_subsls;
create trigger bencana_notif_alokasi after insert or delete or update of ppl_id, pml_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_notif_alokasi();

drop trigger if exists bencana_ppl_ganti_tim on public.bencana_petugas;
create trigger bencana_ppl_ganti_tim after update of atasan_id on public.bencana_petugas
  for each row execute function public.bencana_trg_ppl_ganti_tim();

drop trigger if exists bencana_notif_tim on public.bencana_petugas;
create trigger bencana_notif_tim after update of atasan_id on public.bencana_petugas
  for each row execute function public.bencana_trg_notif_tim();

drop trigger if exists bencana_ppl_menolak on public.bencana_petugas;
create trigger bencana_ppl_menolak after update of status_kontak_pendaftaran_bencana on public.bencana_petugas
  for each row execute function public.bencana_trg_ppl_menolak();

-- Aturan lama "menolak -> keluar tim" (20261005b) diganti trigger (c) di atas.
drop trigger if exists bencana_menolak_petugas on public.bencana_petugas;
drop trigger if exists bencana_menolak_alokasi on public.bencana_alokasi_subsls;
drop function if exists public.bencana_trg_menolak_alokasi();
drop function if exists public.bencana_trg_menolak_petugas();
drop function if exists public.bencana_keluarkan_jika_menolak(bigint);
