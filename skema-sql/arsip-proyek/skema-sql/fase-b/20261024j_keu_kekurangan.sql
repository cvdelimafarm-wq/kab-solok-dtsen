-- =====================================================================
-- 20261024j_keu_kekurangan.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE F: catatan kekurangan RAB dan tambahan pagu.
-- Bergantung pada 20261024a-f dan h, i. Aman diulang. Tanpa DELETE/DROP.
--
--  D-07 Pencatat kekurangan RAB: hanya ketua tim dan admin RO, untuk RO sendiri (kewenangan kek_catat).
--  D-09 Dana penggenap tidak minus dan RO tepat sampai pagu resmi; RAB yang melebihi pagu resmi dicatat di sini.
--  D-14 Saat pusat menambah pagu (revisi DJA atau DJPb) dan PPK mencatat tambahan, ketua tim
--       (kewenangan kek_putus) memutuskan tiap catatan: penuhi, tunda, tolak.
--         * tolak wajib alasan; total dipenuhi tidak melebihi tambahan;
--         * sisa tambahan menjadi dana penggenap (dicatat sebagai sisa_penggenap);
--         * yang ditunda muncul lagi pada tambahan berikutnya; yang ditolak diarsipkan.
--  D-15 PPK melihat daftar kekurangan per KRO (view) untuk memutuskan paket usulan DIPA.
--  4.7  K4 saran urutan menurut prioritas lalu tanggal catat (fungsi keu_kekurangan_saran); keputusan tetap di ketua tim.
--
--  Alur:  tercatat -> (ditunda <-> ditunda) -> dipenuhi | ditolak ; tercatat/ditunda -> ditarik (oleh pencatat/ketua).
--  Tambahan pagu: terbuka -> diputus | dibatalkan. Satu tambahan terbuka per RO pada satu waktu.
--  Catatan dipenuhi dapat ditautkan ke item RAB resmi (keu_kekurangan_tautkan_rab); SIGAP tidak menulis RAB sendiri.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_tambahan_pagu (
  id             bigint generated always as identity primary key,
  tahun          smallint not null references keu_tahun_anggaran(tahun),
  ro_kode        text not null references keu_ro(kode),
  jumlah         numeric(18,0) not null check (jumlah > 0),
  jalur          text not null check (jalur in ('dja','djpb')),
  nomor_dokumen  text not null check (length(btrim(nomor_dokumen)) >= 3),
  tanggal_dokumen date not null,
  jadwal_id      bigint references keu_revisi_jadwal(id),
  catatan        text not null default '',
  status         text not null default 'terbuka' check (status in ('terbuka','diputus','dibatalkan')),
  dicatat_oleh   bigint references sigap_akun(id),
  diputus_oleh   bigint references sigap_akun(id),
  diputus_at     timestamptz,
  dipenuhi_total numeric(18,0),
  sisa_penggenap numeric(18,0),
  alasan_batal   text not null default '',
  dibuat_at      timestamptz not null default now(),
  diubah_at      timestamptz not null default now(),
  constraint tambahan_diputus check (
    (status = 'diputus' and diputus_oleh is not null and diputus_at is not null
       and dipenuhi_total >= 0 and sisa_penggenap >= 0 and dipenuhi_total + sisa_penggenap = jumlah)
    or (status <> 'diputus' and diputus_oleh is null and diputus_at is null and dipenuhi_total is null and sisa_penggenap is null)),
  constraint tambahan_batal check (status <> 'dibatalkan' or length(btrim(alasan_batal)) >= 5)
);
create unique index if not exists keu_tambahan_terbuka_uq on keu_tambahan_pagu(ro_kode) where status = 'terbuka';
create unique index if not exists keu_tambahan_dokumen_uq on keu_tambahan_pagu(jalur, lower(btrim(nomor_dokumen)), ro_kode) where status <> 'dibatalkan';

create table if not exists keu_kekurangan (
  id             bigint generated always as identity primary key,
  tahun          smallint not null references keu_tahun_anggaran(tahun),
  ro_kode        text not null references keu_ro(kode),
  komponen_kode  text check (komponen_kode is null or komponen_kode ~ '^[0-9]{3}$'),
  akun_kode      text not null references keu_master_akun(kode),
  uraian         text not null check (length(btrim(uraian)) >= 4),
  jumlah         numeric(18,0) not null check (jumlah > 0),
  prioritas_kode text not null references keu_master_prioritas(kode),
  alasan         text not null check (length(btrim(alasan)) >= 5),
  status         text not null default 'tercatat' check (status in ('tercatat','ditunda','dipenuhi','ditolak','ditarik')),
  dicatat_oleh   bigint references sigap_akun(id),
  dicatat_at     timestamptz not null default now(),
  tambahan_id    bigint references keu_tambahan_pagu(id),
  diputus_oleh   bigint references sigap_akun(id),
  diputus_at     timestamptz,
  alasan_putus   text not null default '',
  rab_item_id    bigint references keu_rab_item(id),
  dibuat_at      timestamptz not null default now(),
  diubah_at      timestamptz not null default now(),
  constraint kek_putus_lengkap check (
    (status in ('dipenuhi','ditolak') and tambahan_id is not null and diputus_oleh is not null and diputus_at is not null)
    or (status = 'ditarik' and diputus_oleh is not null and diputus_at is not null)
    or (status in ('tercatat','ditunda') and diputus_oleh is null and diputus_at is null)),
  constraint kek_alasan_putus check (status not in ('ditolak','ditarik') or length(btrim(alasan_putus)) >= 5),
  constraint kek_rab_hanya_dipenuhi check (rab_item_id is null or status = 'dipenuhi')
);
create index if not exists keu_kekurangan_ro_idx on keu_kekurangan(ro_kode, status);
create unique index if not exists keu_kekurangan_terbuka_uq on keu_kekurangan(ro_kode, akun_kode, lower(btrim(uraian))) where status in ('tercatat','ditunda');
create unique index if not exists keu_kekurangan_rab_uq on keu_kekurangan(rab_item_id) where rab_item_id is not null;

-- riwayat keputusan (hanya bertambah): satu baris per catatan per tambahan pagu
create table if not exists keu_kekurangan_putus (
  id            bigint generated always as identity primary key,
  tambahan_id   bigint not null references keu_tambahan_pagu(id),
  kekurangan_id bigint not null references keu_kekurangan(id),
  keputusan     text not null check (keputusan in ('penuhi','tunda','tolak')),
  jumlah        numeric(18,0) not null check (jumlah > 0),
  alasan        text not null default '',
  oleh          bigint references sigap_akun(id),
  at            timestamptz not null default now(),
  constraint putus_unik unique (tambahan_id, kekurangan_id),
  constraint putus_tolak_alasan check (keputusan <> 'tolak' or length(btrim(alasan)) >= 5)
);
create index if not exists keu_kekurangan_putus_kek_idx on keu_kekurangan_putus(kekurangan_id);

-- ---------------------------------------------------------------------
-- 2. Penjaga
-- ---------------------------------------------------------------------
create or replace function keu_kek_jaga()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if keu_akun_sesi() is not null then
    if tg_op = 'DELETE' then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    if not v_fungsi then
      raise exception 'Tabel % hanya dapat diubah melalui fungsi alur kekurangan RAB.', tg_table_name using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function keu_kekurangan_cek()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'tercatat' then
      raise exception 'Catatan kekurangan baru harus berstatus tercatat' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.tahun, new.ro_kode, new.dicatat_oleh, new.dicatat_at) is distinct from (old.tahun, old.ro_kode, old.dicatat_oleh, old.dicatat_at) then
    raise exception 'Tahun, RO, dan pencatat tidak dapat diubah' using errcode = '23514';
  end if;
  if old.status in ('dipenuhi','ditolak','ditarik') then
    -- catatan yang sudah diputuskan beku; hanya penautan ke item RAB (sekali)
    if (new.status, new.akun_kode, new.komponen_kode, new.uraian, new.jumlah, new.prioritas_kode, new.alasan, new.tambahan_id,
        new.diputus_oleh, new.diputus_at, new.alasan_putus)
       is distinct from
       (old.status, old.akun_kode, old.komponen_kode, old.uraian, old.jumlah, old.prioritas_kode, old.alasan, old.tambahan_id,
        old.diputus_oleh, old.diputus_at, old.alasan_putus) then
      raise exception 'Catatan kekurangan yang sudah % tidak dapat diubah', old.status using errcode = '23514';
    end if;
    if old.rab_item_id is not null and new.rab_item_id is distinct from old.rab_item_id then
      raise exception 'Tautan ke item RAB tidak dapat diganti' using errcode = '23514';
    end if;
  elsif new.status <> old.status then
    if coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
      raise exception 'Status kekurangan hanya dapat diubah melalui fungsi alur.' using errcode = '42501';
    end if;
    if not (old.status in ('tercatat','ditunda') and new.status in ('ditunda','dipenuhi','ditolak','ditarik')) then
      raise exception 'Perpindahan status % -> % tidak diizinkan', old.status, new.status using errcode = '23514';
    end if;
  end if;
  new.diubah_at := now();
  return new;
end $$;

create or replace function keu_tambahan_cek()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'terbuka' then
      raise exception 'Tambahan pagu baru harus berstatus terbuka' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.tahun, new.ro_kode, new.jumlah, new.jalur, new.nomor_dokumen, new.tanggal_dokumen, new.dicatat_oleh)
     is distinct from (old.tahun, old.ro_kode, old.jumlah, old.jalur, old.nomor_dokumen, old.tanggal_dokumen, old.dicatat_oleh) then
    raise exception 'Data tambahan pagu tidak diubah; batalkan lalu catat ulang' using errcode = '23514';
  end if;
  if old.status <> 'terbuka' and new.status is distinct from old.status then
    raise exception 'Tambahan pagu yang sudah % tidak dapat diubah', old.status using errcode = '23514';
  end if;
  if old.status <> 'terbuka' and (new.dipenuhi_total, new.sisa_penggenap, new.diputus_oleh, new.alasan_batal)
       is distinct from (old.dipenuhi_total, old.sisa_penggenap, old.diputus_oleh, old.alasan_batal) then
    raise exception 'Tambahan pagu yang sudah % tidak dapat diubah', old.status using errcode = '23514';
  end if;
  if new.status <> old.status and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'Status tambahan pagu hanya dapat diubah melalui fungsi alur.' using errcode = '42501';
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Fungsi alur
-- ---------------------------------------------------------------------
-- tahun anggaran yang sedang berlaku (POK berlaku terbaru); jika belum ada, tahun kalender
create or replace function keu_kek_tahun()
returns smallint language sql stable set search_path = public as $$
  select coalesce((select max(tahun) from keu_pok_versi where status = 'berlaku'), extract(year from current_date)::smallint)::smallint
$$;

-- 3a. mencatat kekurangan RAB (ketua tim atau admin RO RO itu)
create or replace function keu_kekurangan_catat(p_ro text, p_akun_kode text, p_uraian text, p_jumlah numeric,
                                                p_prioritas text, p_alasan text, p_komponen text default null,
                                                p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not exists (select 1 from keu_ro r where r.kode = p_ro and r.aktif) then
    raise exception 'RO % tidak ada atau tidak aktif', p_ro using errcode = '23514';
  end if;
  if not keu_boleh(p_akun, 'kek_catat', p_ro) then
    raise exception 'Akun % tidak berwenang mencatat kekurangan RAB pada RO %', p_akun, p_ro using errcode = '42501';
  end if;
  if not exists (select 1 from keu_master_akun a where a.kode = p_akun_kode and a.aktif) then
    raise exception 'Akun anggaran % tidak ada di Master akun', p_akun_kode using errcode = '23514';
  end if;
  if p_jumlah is null or p_jumlah <= 0 or p_jumlah <> round(p_jumlah) then
    raise exception 'Jumlah harus bilangan bulat rupiah lebih dari nol' using errcode = '23514';
  end if;
  if not exists (select 1 from keu_master_prioritas where kode = p_prioritas) then
    raise exception 'Prioritas % tidak dikenal', p_prioritas using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_uraian, ''))) < 4 then raise exception 'Uraian minimal 4 huruf' using errcode = '23514'; end if;
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan minimal 5 huruf' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_kekurangan(tahun, ro_kode, komponen_kode, akun_kode, uraian, jumlah, prioritas_kode, alasan, dicatat_oleh)
  values (keu_kek_tahun(), p_ro, nullif(btrim(coalesce(p_komponen, '')), ''), p_akun_kode, btrim(p_uraian), p_jumlah,
          p_prioritas, btrim(p_alasan), p_akun)
  returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kekurangan_catat(text, text, text, numeric, text, text, text, bigint) from public, anon, authenticated;

-- 3b. mengubah catatan yang belum diputuskan (isian null = tidak diubah)
create or replace function keu_kekurangan_ubah(p_id bigint, p_uraian text default null, p_jumlah numeric default null,
                                               p_prioritas text default null, p_alasan text default null,
                                               p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare k keu_kekurangan%rowtype;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into k from keu_kekurangan where id = p_id for update;
  if not found then raise exception 'Catatan kekurangan % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'kek_catat', k.ro_kode) then
    raise exception 'Akun % tidak berwenang mengubah kekurangan RAB RO %', p_akun, k.ro_kode using errcode = '42501';
  end if;
  if k.status not in ('tercatat','ditunda') then
    raise exception 'Catatan yang sudah % tidak dapat diubah', k.status using errcode = '23514';
  end if;
  if p_jumlah is not null and (p_jumlah <= 0 or p_jumlah <> round(p_jumlah)) then
    raise exception 'Jumlah harus bilangan bulat rupiah lebih dari nol' using errcode = '23514';
  end if;
  if p_prioritas is not null and not exists (select 1 from keu_master_prioritas where kode = p_prioritas) then
    raise exception 'Prioritas % tidak dikenal', p_prioritas using errcode = '23514';
  end if;
  if p_uraian is not null and length(btrim(p_uraian)) < 4 then raise exception 'Uraian minimal 4 huruf' using errcode = '23514'; end if;
  if p_alasan is not null and length(btrim(p_alasan)) < 5 then raise exception 'Alasan minimal 5 huruf' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_kekurangan set uraian = coalesce(btrim(p_uraian), uraian), jumlah = coalesce(p_jumlah, jumlah),
         prioritas_kode = coalesce(p_prioritas, prioritas_kode), alasan = coalesce(btrim(p_alasan), alasan)
   where id = p_id;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kekurangan_ubah(bigint, text, numeric, text, text, bigint) from public, anon, authenticated;

-- 3c. menarik catatan (tidak jadi diajukan); alasan wajib
create or replace function keu_kekurangan_tarik(p_id bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare k keu_kekurangan%rowtype;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into k from keu_kekurangan where id = p_id for update;
  if not found then raise exception 'Catatan kekurangan % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'kek_catat', k.ro_kode) then
    raise exception 'Akun % tidak berwenang menarik kekurangan RAB RO %', p_akun, k.ro_kode using errcode = '42501';
  end if;
  if k.status not in ('tercatat','ditunda') then
    raise exception 'Catatan yang sudah % tidak dapat ditarik', k.status using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan penarikan minimal 5 huruf' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_kekurangan set status = 'ditarik', diputus_oleh = p_akun, diputus_at = now(), alasan_putus = btrim(p_alasan) where id = p_id;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kekurangan_tarik(bigint, text, bigint) from public, anon, authenticated;

-- 3d. PPK mencatat tambahan pagu resmi satu RO (revisi DJA atau DJPb yang sudah ada dokumennya)
create or replace function keu_tambahan_pagu_catat(p_ro text, p_jumlah numeric, p_jalur text, p_nomor text, p_tanggal date,
                                                   p_jadwal bigint default null, p_catatan text default '',
                                                   p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; j record; v_tahun smallint := keu_kek_tahun();
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'sahkan') then
    raise exception 'Hanya PPK yang mencatat tambahan pagu (akun %)', p_akun using errcode = '42501';
  end if;
  if not exists (select 1 from keu_ro r where r.kode = p_ro and r.aktif) then
    raise exception 'RO % tidak ada atau tidak aktif', p_ro using errcode = '23514';
  end if;
  if p_jumlah is null or p_jumlah <= 0 or p_jumlah <> round(p_jumlah) then
    raise exception 'Tambahan pagu harus bilangan bulat rupiah lebih dari nol' using errcode = '23514';
  end if;
  if p_jalur not in ('dja','djpb') then raise exception 'Jalur harus dja atau djpb' using errcode = '23514'; end if;
  if length(btrim(coalesce(p_nomor, ''))) < 3 then raise exception 'Nomor dokumen revisi wajib diisi' using errcode = '23514'; end if;
  if p_tanggal is null then raise exception 'Tanggal dokumen wajib diisi' using errcode = '23514'; end if;
  if p_jadwal is not null then
    select * into j from keu_revisi_jadwal where id = p_jadwal;
    if not found then raise exception 'Jadwal revisi % tidak ada', p_jadwal using errcode = '23514'; end if;
    if j.jenis <> 'dipa_' || p_jalur then
      raise exception 'Jadwal % berjenis %, tidak sesuai jalur %', p_jadwal, j.jenis, p_jalur using errcode = '23514';
    end if;
    v_tahun := j.tahun;
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_tambahan_pagu(tahun, ro_kode, jumlah, jalur, nomor_dokumen, tanggal_dokumen, jadwal_id, catatan, dicatat_oleh)
  values (v_tahun, p_ro, p_jumlah, p_jalur, btrim(p_nomor), p_tanggal, p_jadwal, btrim(coalesce(p_catatan, '')), p_akun)
  returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_tambahan_pagu_catat(text, numeric, text, text, date, bigint, text, bigint) from public, anon, authenticated;

-- 3e. membatalkan tambahan pagu yang masih terbuka (salah catat)
create or replace function keu_tambahan_pagu_batal(p_id bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'sahkan') then
    raise exception 'Hanya PPK yang membatalkan tambahan pagu (akun %)', p_akun using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan pembatalan minimal 5 huruf' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_tambahan_pagu set status = 'dibatalkan', alasan_batal = btrim(p_alasan) where id = p_id and status = 'terbuka';
  if not found then
    raise exception 'Tambahan pagu % tidak ada atau sudah tidak terbuka', p_id using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_tambahan_pagu_batal(bigint, text, bigint) from public, anon, authenticated;

-- 3f. saran urutan (K4): prioritas lalu tanggal catat; ambil bila masih muat. Hanya saran.
create or replace function keu_kekurangan_saran(p_tambahan bigint)
returns table(kekurangan_id bigint, saran text, jumlah numeric, sisa_setelah numeric)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare t record; r record; v_sisa numeric;
begin
  select tp.jumlah, tp.ro_kode into t from keu_tambahan_pagu tp where tp.id = p_tambahan and tp.status = 'terbuka';
  if not found then return; end if;
  v_sisa := t.jumlah;
  for r in
    select k.id, k.jumlah from keu_kekurangan k
    join keu_master_prioritas p on p.kode = k.prioritas_kode
    where k.ro_kode = t.ro_kode and k.status in ('tercatat','ditunda')
    order by p.urut, k.dicatat_at, k.id
  loop
    if r.jumlah <= v_sisa then
      v_sisa := v_sisa - r.jumlah;
      return query select r.id, 'penuhi'::text, r.jumlah, v_sisa;
    else
      return query select r.id, 'tunda'::text, r.jumlah, v_sisa;
    end if;
  end loop;
end $$;

-- 3g. ketua tim memutuskan SEMUA catatan terbuka satu RO sekaligus.
--     p_keputusan: [{"id": 12, "keputusan": "penuhi|tunda|tolak", "alasan": "wajib untuk tolak"}, ...]
--     mengembalikan sisa tambahan yang menjadi dana penggenap
create or replace function keu_kekurangan_putuskan(p_tambahan bigint, p_keputusan jsonb, p_akun bigint default keu_akun_sesi())
returns numeric language plpgsql security definer set search_path = public as $$
declare
  t keu_tambahan_pagu%rowtype; e jsonb; k keu_kekurangan%rowtype; v_jml numeric;
  v_id bigint; v_kep text; v_alasan text; v_pakai numeric := 0; v_sisa numeric; n int := 0; v_ids bigint[] := '{}';
  v_terbuka bigint[];
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into t from keu_tambahan_pagu where id = p_tambahan for update;
  if not found then raise exception 'Tambahan pagu % tidak ada', p_tambahan using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'kek_putus', t.ro_kode) then
    raise exception 'Akun % tidak berwenang memutuskan kekurangan RAB RO %', p_akun, t.ro_kode using errcode = '42501';
  end if;
  if t.status <> 'terbuka' then
    raise exception 'Tambahan pagu % sudah %', p_tambahan, t.status using errcode = '23514';
  end if;
  if p_keputusan is null or jsonb_typeof(p_keputusan) <> 'array' then
    raise exception 'Keputusan harus berupa daftar' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  select coalesce(array_agg(id order by id), '{}') into v_terbuka
    from (select id from keu_kekurangan where ro_kode = t.ro_kode and status in ('tercatat','ditunda') for update) x;

  -- periksa dulu seluruhnya
  for e in select * from jsonb_array_elements(p_keputusan) loop
    begin v_id := (e ->> 'id')::bigint; exception when others then v_id := null; end;
    v_kep := lower(coalesce(e ->> 'keputusan', ''));
    v_alasan := btrim(coalesce(e ->> 'alasan', ''));
    if v_id is null then raise exception 'Setiap keputusan harus memuat id catatan' using errcode = '23514'; end if;
    if v_kep not in ('penuhi','tunda','tolak') then raise exception 'Keputusan % tidak dikenal (penuhi, tunda, tolak)', v_kep using errcode = '22023'; end if;
    if v_id = any(v_ids) then raise exception 'Catatan % muncul lebih dari sekali', v_id using errcode = '23514'; end if;
    if not (v_id = any(v_terbuka)) then raise exception 'Catatan % bukan catatan terbuka RO %', v_id, t.ro_kode using errcode = '23514'; end if;
    if v_kep = 'tolak' and length(v_alasan) < 5 then raise exception 'Alasan penolakan wajib diisi (catatan %)', v_id using errcode = '23514'; end if;
    if v_kep = 'penuhi' then
      select kk.jumlah into v_jml from keu_kekurangan kk where kk.id = v_id;
      v_pakai := v_pakai + v_jml;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  if cardinality(v_ids) <> cardinality(v_terbuka) then
    raise exception '% catatan terbuka belum diputuskan; semua catatan RO % harus diputuskan sekaligus',
      cardinality(v_terbuka) - cardinality(v_ids), t.ro_kode using errcode = '23514';
  end if;
  if v_pakai > t.jumlah then
    raise exception 'Yang dipenuhi Rp % melebihi tambahan pagu Rp %. Dana penggenap tidak boleh minus.', v_pakai, t.jumlah using errcode = '23514';
  end if;

  -- terapkan
  for e in select * from jsonb_array_elements(p_keputusan) loop
    v_id := (e ->> 'id')::bigint; v_kep := lower(e ->> 'keputusan'); v_alasan := btrim(coalesce(e ->> 'alasan', ''));
    select * into k from keu_kekurangan where id = v_id;
    insert into keu_kekurangan_putus(tambahan_id, kekurangan_id, keputusan, jumlah, alasan, oleh)
    values (p_tambahan, v_id, v_kep, k.jumlah, v_alasan, p_akun);
    if v_kep = 'penuhi' then
      update keu_kekurangan set status = 'dipenuhi', tambahan_id = p_tambahan, diputus_oleh = p_akun, diputus_at = now(), alasan_putus = v_alasan where id = v_id;
    elsif v_kep = 'tolak' then
      update keu_kekurangan set status = 'ditolak', tambahan_id = p_tambahan, diputus_oleh = p_akun, diputus_at = now(), alasan_putus = v_alasan where id = v_id;
    else
      update keu_kekurangan set status = 'ditunda', alasan_putus = v_alasan where id = v_id;
    end if;
    n := n + 1;
  end loop;
  v_sisa := t.jumlah - v_pakai;
  update keu_tambahan_pagu set status = 'diputus', diputus_oleh = p_akun, diputus_at = now(), dipenuhi_total = v_pakai, sisa_penggenap = v_sisa
   where id = p_tambahan;
  perform set_config('keu.via_fungsi', '', true);
  return v_sisa;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kekurangan_putuskan(bigint, jsonb, bigint) from public, anon, authenticated;

-- 3h. menautkan catatan yang dipenuhi ke item RAB resmi (dibuat ketua tim di RAB; SIGAP tidak menulis RAB sendiri)
create or replace function keu_kekurangan_tautkan_rab(p_kek bigint, p_rab_item bigint, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare k keu_kekurangan%rowtype; ri record;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into k from keu_kekurangan where id = p_kek for update;
  if not found then raise exception 'Catatan kekurangan % tidak ada', p_kek using errcode = '23514'; end if;
  if not (keu_boleh(p_akun, 'rab', k.ro_kode) or keu_boleh(p_akun, 'draf', k.ro_kode)) then
    raise exception 'Akun % tidak berwenang atas RAB RO %', p_akun, k.ro_kode using errcode = '42501';
  end if;
  if k.status <> 'dipenuhi' then raise exception 'Hanya catatan yang dipenuhi yang dapat ditautkan (status %)', k.status using errcode = '23514'; end if;
  if k.rab_item_id is not null then raise exception 'Catatan sudah ditautkan ke item RAB %', k.rab_item_id using errcode = '23514'; end if;
  select i.id, i.akun_kode, r.ro_kode into ri from keu_rab_item i join keu_rab r on r.id = i.rab_id where i.id = p_rab_item;
  if not found then raise exception 'Item RAB % tidak ada', p_rab_item using errcode = '23514'; end if;
  if ri.ro_kode <> k.ro_kode then raise exception 'Item RAB berada di RO %, bukan %', ri.ro_kode, k.ro_kode using errcode = '23514'; end if;
  if ri.akun_kode <> k.akun_kode then raise exception 'Akun item RAB (%) berbeda dari akun catatan (%)', ri.akun_kode, k.akun_kode using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_kekurangan set rab_item_id = p_rab_item where id = p_kek;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kekurangan_tautkan_rab(bigint, bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. View
-- ---------------------------------------------------------------------
create or replace view keu_v_kekurangan with (security_invoker = true) as
select k.id, k.tahun, k.ro_kode, keu_ro_kro(k.ro_kode) as kro_kode, k.komponen_kode, k.akun_kode, a.nama as akun_nama,
       a.kelompok_kode, k.uraian, k.jumlah, k.prioritas_kode, p.nama as prioritas_nama, p.urut as prioritas_urut,
       k.alasan, k.status, k.dicatat_oleh, k.dicatat_at, k.tambahan_id, k.diputus_oleh, k.diputus_at, k.alasan_putus, k.rab_item_id,
       k.status in ('tercatat','ditunda') as terbuka,
       (select count(*) from keu_kekurangan_putus x where x.kekurangan_id = k.id and x.keputusan = 'tunda') as kali_ditunda
from keu_kekurangan k
join keu_master_akun a on a.kode = k.akun_kode
join keu_master_prioritas p on p.kode = k.prioritas_kode;
comment on view keu_v_kekurangan is 'Catatan kekurangan RAB beserta akun, kelompok belanja, prioritas, dan berapa kali ditunda.';

create or replace view keu_v_kekurangan_ro with (security_invoker = true) as
select k.tahun, k.ro_kode,
       count(*) filter (where k.terbuka) as n_terbuka,
       coalesce(sum(k.jumlah) filter (where k.terbuka), 0) as jumlah_terbuka,
       coalesce(sum(k.jumlah) filter (where k.terbuka and k.prioritas_kode = 'inti'), 0) as jumlah_inti,
       coalesce(sum(k.jumlah) filter (where k.terbuka and k.prioritas_kode = 'penting'), 0) as jumlah_penting,
       coalesce(sum(k.jumlah) filter (where k.terbuka and k.prioritas_kode = 'tunda'), 0) as jumlah_tunda,
       count(*) filter (where k.status = 'ditunda') as n_ditunda,
       count(*) filter (where k.status = 'dipenuhi') as n_dipenuhi,
       coalesce(sum(k.jumlah) filter (where k.status = 'dipenuhi'), 0) as jumlah_dipenuhi,
       count(*) filter (where k.status = 'ditolak') as n_ditolak,
       (select tp.id from keu_tambahan_pagu tp where tp.ro_kode = k.ro_kode and tp.status = 'terbuka') as tambahan_terbuka_id,
       (select tp.jumlah from keu_tambahan_pagu tp where tp.ro_kode = k.ro_kode and tp.status = 'terbuka') as tambahan_terbuka_jumlah
from keu_v_kekurangan k
group by k.tahun, k.ro_kode;
comment on view keu_v_kekurangan_ro is 'Ringkasan kekurangan RAB per RO dan tambahan pagu yang menunggu keputusan ketua tim.';

-- untuk PPK (D-15): kekurangan terbuka per KRO dan kelompok belanja
create or replace view keu_v_kekurangan_kro with (security_invoker = true) as
select k.tahun, k.kro_kode, k.kelompok_kode,
       count(distinct k.ro_kode) as n_ro, count(*) as n_catatan, sum(k.jumlah) as jumlah_terbuka,
       coalesce(sum(k.jumlah) filter (where k.prioritas_kode = 'inti'), 0) as jumlah_inti,
       coalesce(sum(k.jumlah) filter (where k.prioritas_kode = 'penting'), 0) as jumlah_penting,
       coalesce(sum(k.jumlah) filter (where k.prioritas_kode = 'tunda'), 0) as jumlah_tunda
from keu_v_kekurangan k
where k.terbuka
group by k.tahun, k.kro_kode, k.kelompok_kode;
comment on view keu_v_kekurangan_kro is 'Kekurangan RAB terbuka per KRO dan kelompok belanja (bahan PPK untuk paket usulan DIPA).';

create or replace view keu_v_tambahan_pagu with (security_invoker = true) as
select t.*, (select count(*) from keu_kekurangan_putus x where x.tambahan_id = t.id) as n_diputus
from keu_tambahan_pagu t;
comment on view keu_v_tambahan_pagu is 'Tambahan pagu resmi per RO dan keputusan ketua tim atasnya.';

-- ---------------------------------------------------------------------
-- 5. Trigger, RLS, hak
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_tambahan_pagu'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_tambahan_pagu for each row execute function keu_tambahan_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_tambahan_pagu for each row execute function keu_kek_jaga();
    create trigger keu_t9_jejak after insert or update on keu_tambahan_pagu for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kekurangan'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_kekurangan for each row execute function keu_kekurangan_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_kekurangan for each row execute function keu_kek_jaga();
    create trigger keu_t9_jejak after insert or update on keu_kekurangan for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kekurangan_putus'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_kekurangan_putus for each row execute function keu_kek_jaga();
    create trigger keu_t2_catat before update or delete on keu_kekurangan_putus for each row execute function keu_catat_saja();
  end if;
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_tambahan_pagu','keu_kekurangan','keu_kekurangan_putus')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke execute on function keu_kek_tahun(), keu_kekurangan_saran(bigint), keu_kek_jaga(), keu_kekurangan_cek(), keu_tambahan_cek()
  from public, anon, authenticated;
grant execute on function keu_kek_tahun(), keu_kekurangan_saran(bigint) to service_role;
revoke all on keu_v_kekurangan, keu_v_kekurangan_ro, keu_v_kekurangan_kro, keu_v_tambahan_pagu from anon, authenticated;
grant select on keu_v_kekurangan, keu_v_kekurangan_ro, keu_v_kekurangan_kro, keu_v_tambahan_pagu to service_role;
