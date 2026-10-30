-- =====================================================================
-- 20261024e_keu_revisi.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE B2: jadwal revisi, usulan per RO,
-- pernyataan sah oleh PPK, laporan ke KPA.
-- Bergantung pada 20261024a, c, d. Aman diulang. Tanpa DELETE/DROP.
--
--  D-25 PPK menentukan jadwal dan jenis revisi; jadwal bawaan Revisi POK tgl 10
--       (buka, tutup 2 hari kemudian); PPK dapat melewati atau memulihkan.
--       Sah memerlukan nomor dan tanggal dokumen dasar dan menaikkan versi sistem.
--  D-01 PPK menyatakan sah sendirian; KPA hanya menerima laporan.
--  D-02/D-03 alur usulan: draf -> menunggu ketua -> menunggu PPK -> disetujui;
--       PPK yang merangkap ketua tim: langsung disetujui.
-- =====================================================================

create table if not exists keu_revisi_jadwal (
  id          bigint generated always as identity primary key,
  tahun       smallint not null references keu_tahun_anggaran(tahun),
  jenis       text not null check (jenis in ('pok','administrasi','dipa_djpb','dipa_dja')),
  judul       text not null check (length(btrim(judul)) >= 3),
  buka        date not null,
  tutup       date not null,
  ulang       text not null default '',                 -- mis. 'bulanan tgl 10'
  status      text not null default 'terjadwal'
              check (status in ('terjadwal','dibuka','terkumpul','diterapkan','sah','dilewati')),
  catatan     text not null default '',
  dibuat_oleh bigint references sigap_akun(id),
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now(),
  check (tutup >= buka),
  unique (tahun, jenis, buka)
);

create table if not exists keu_revisi_usulan (
  id          bigint generated always as identity primary key,
  jadwal_id   bigint not null references keu_revisi_jadwal(id),
  ro_kode     text not null references keu_ro(kode),
  rab_id      bigint references keu_rab(id),            -- RAB acuan usulan ini (bila ada)
  status      text not null default 'draf'
              check (status in ('draf','menunggu_ketua','menunggu_ppk','disetujui','dikembalikan')),
  dibuat_oleh bigint not null references sigap_akun(id),
  diajukan_oleh bigint references sigap_akun(id),
  diajukan_at timestamptz,
  disetujui_ketua_oleh bigint references sigap_akun(id),
  disetujui_ketua_at   timestamptz,
  disahkan_oleh bigint references sigap_akun(id),
  disahkan_at timestamptz,
  catatan     text not null default '',
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now(),
  unique (jadwal_id, ro_kode),
  constraint usulan_sah_lengkap check (status <> 'disetujui' or (disahkan_oleh is not null and disahkan_at is not null))
);
create index if not exists keu_revisi_usulan_ro_idx on keu_revisi_usulan(ro_kode);

create table if not exists keu_revisi_usulan_riwayat (
  id         bigint generated always as identity primary key,
  usulan_id  bigint not null references keu_revisi_usulan(id),
  aksi       text not null,
  dari       text not null,
  ke         text not null,
  oleh       bigint references sigap_akun(id),
  catatan    text not null default '',
  waktu      timestamptz not null default now()
);

create table if not exists keu_revisi_sah (
  id             bigint generated always as identity primary key,
  jadwal_id      bigint not null unique references keu_revisi_jadwal(id),
  versi_sistem   smallint not null check (versi_sistem >= 1),
  nomor_dokumen  text not null check (length(btrim(nomor_dokumen)) >= 3),
  tanggal_dokumen date not null,
  pok_versi_dasar_id bigint references keu_pok_versi(id),   -- versi POK resmi saat dinyatakan sah
  pok_versi_hasil_id bigint references keu_pok_versi(id),   -- diisi setelah PDF POK hasil revisi diunggah dan berlaku
  dicatat_oleh   bigint not null references sigap_akun(id),
  dicatat_at     timestamptz not null default now()
);

-- Antrean laporan ringkas ke KPA (tanpa persetujuan; pengirim berada di aplikasi)
create table if not exists keu_laporan_kpa (
  id         bigint generated always as identity primary key,
  jenis      text not null check (jenis in ('revisi_sah','realisasi','skor')),
  rujukan_id bigint,
  isi        jsonb not null default '{}'::jsonb,
  status     text not null default 'antre' check (status in ('antre','terkirim','gagal')),
  dibuat_at  timestamptz not null default now(),
  dikirim_at timestamptz
);
create index if not exists keu_laporan_kpa_antre_idx on keu_laporan_kpa(status) where status = 'antre';

-- ---------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------
create or replace function keu_jaga_status_via_fungsi() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'Status % hanya dapat diubah melalui fungsi alur.', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.status not in ('draf','terjadwal') and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'Baris baru harus berstatus awal (draf/terjadwal).' using errcode = '23514';
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- usulan: hanya dapat dibuat/diajukan saat jadwal dibuka; dibuat oleh yang berwenang pada RO itu
create or replace function keu_usulan_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_st text; v_akun bigint := keu_akun_sesi();
begin
  if tg_op = 'DELETE' then
    if v_akun is not null then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  select status into v_st from keu_revisi_jadwal where id = new.jadwal_id;
  if tg_op = 'INSERT' then
    if v_st <> 'dibuka' then
      raise exception 'Usulan hanya dapat dibuat saat jadwal dibuka (status jadwal %).', v_st using errcode = '23514';
    end if;
    if v_akun is not null and not (keu_boleh(v_akun, 'rab', new.ro_kode) or keu_boleh(v_akun, 'draf', new.ro_kode)) then
      raise exception 'Akun % tidak berwenang membuat usulan RO %.', v_akun, new.ro_kode using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' and new.catatan is distinct from old.catatan and new.status = old.status
        and old.status not in ('draf','dikembalikan') then
    raise exception 'Usulan berstatus % tidak dapat diubah.', old.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function keu_usulan_cek() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Jadwal: satu pintu transisi (PPK)
--  buka: terjadwal->dibuka   tutup: dibuka->terkumpul   terapkan: terkumpul->diterapkan
--  sah: diterapkan->sah (nomor + tanggal dokumen wajib)
--  lewati: terjadwal|dibuka->dilewati   pulihkan: dilewati->terjadwal (selama jendela belum lewat)
-- ---------------------------------------------------------------------
create or replace function keu_jadwal_aksi(p_jadwal bigint, p_aksi text, p_nomor text default null, p_tanggal date default null,
                                           p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare j keu_revisi_jadwal; ke text; v_ver int; v_pok bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'jadwal') then raise exception 'Akun % bukan PPK (tidak berwenang atas jadwal)', p_akun using errcode = '42501'; end if;
  select * into j from keu_revisi_jadwal where id = p_jadwal for update;
  if not found then raise exception 'Jadwal % tidak ada', p_jadwal using errcode = 'P0002'; end if;
  ke := case p_aksi
    when 'buka' then case when j.status = 'terjadwal' then 'dibuka' end
    when 'tutup' then case when j.status = 'dibuka' then 'terkumpul' end
    when 'terapkan' then case when j.status = 'terkumpul' then 'diterapkan' end
    when 'sah' then case when j.status = 'diterapkan' then 'sah' end
    when 'lewati' then case when j.status in ('terjadwal','dibuka') then 'dilewati' end
    when 'pulihkan' then case when j.status = 'dilewati' then 'terjadwal' end
  end;
  if p_aksi not in ('buka','tutup','terapkan','sah','lewati','pulihkan') then
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;
  if ke is null then raise exception 'Aksi % tidak dapat dilakukan pada jadwal berstatus %', p_aksi, j.status using errcode = '23514'; end if;
  if p_aksi = 'pulihkan' and j.tutup < current_date then
    raise exception 'Jadwal tidak dapat dipulihkan: jendela sudah lewat (%).', j.tutup using errcode = '23514';
  end if;
  if p_aksi = 'sah' and (length(btrim(coalesce(p_nomor,''))) < 3 or p_tanggal is null) then
    raise exception 'Nomor dan tanggal dokumen dasar wajib diisi; sah dicatat dari dokumen resmi.' using errcode = '23514';
  end if;

  perform set_config('keu.via_fungsi', '1', true);
  update keu_revisi_jadwal set status = ke where id = j.id;
  if p_aksi = 'sah' then
    select count(*) + 1 into v_ver from keu_revisi_sah s join keu_revisi_jadwal x on x.id = s.jadwal_id where x.tahun = j.tahun;
    select id into v_pok from keu_pok_versi where tahun = j.tahun and status = 'berlaku';
    insert into keu_revisi_sah(jadwal_id, versi_sistem, nomor_dokumen, tanggal_dokumen, pok_versi_dasar_id, dicatat_oleh)
    values (j.id, v_ver, btrim(p_nomor), p_tanggal, v_pok, p_akun);
    insert into keu_laporan_kpa(jenis, rujukan_id, isi)
    values ('revisi_sah', j.id, jsonb_build_object('judul', j.judul, 'jenis', j.jenis, 'nomor_dokumen', btrim(p_nomor),
            'tanggal_dokumen', p_tanggal, 'versi_sistem', v_ver,
            'usulan_disetujui', (select count(*) from keu_revisi_usulan where jadwal_id = j.id and status = 'disetujui')));
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_jadwal_aksi(bigint, text, text, date, bigint) from public, anon, authenticated;

-- jadwal bawaan Revisi POK: buka tanggal p_hari, tutup 2 hari kemudian, untuk bulan p_dari..12
create or replace function keu_jadwal_bulanan(p_tahun int, p_dari int default 1, p_hari int default 10, p_akun bigint default keu_akun_sesi())
returns int language plpgsql security definer set search_path = public as $$
declare b int; n int := 0; tg date; nm text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'jadwal') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  if not exists (select 1 from keu_tahun_anggaran where tahun = p_tahun) then
    raise exception 'Tahun anggaran % belum ada', p_tahun using errcode = '23503';
  end if;
  for b in p_dari..12 loop
    tg := make_date(p_tahun, b, p_hari);
    insert into keu_revisi_jadwal(tahun, jenis, judul, buka, tutup, ulang, dibuat_oleh)
    values (p_tahun, 'pok', 'Revisi POK ' || nm[b] || ' ' || p_tahun, tg, tg + 2, 'bulanan tgl ' || p_hari, p_akun)
    on conflict (tahun, jenis, buka) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function keu_jadwal_bulanan(int, int, int, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Usulan RO: alur sama dengan RAB (D-02, D-03)
-- ---------------------------------------------------------------------
create or replace function keu_usulan_aksi(p_usulan bigint, p_aksi text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare u keu_revisi_usulan; j keu_revisi_jadwal; ke text; v_ketua boolean; v_adm boolean; v_ppk boolean;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into u from keu_revisi_usulan where id = p_usulan for update;
  if not found then raise exception 'Usulan % tidak ada', p_usulan using errcode = 'P0002'; end if;
  select * into j from keu_revisi_jadwal where id = u.jadwal_id;
  v_ketua := keu_boleh(p_akun, 'rab', u.ro_kode);
  v_adm   := keu_boleh(p_akun, 'draf', u.ro_kode);
  v_ppk   := keu_boleh(p_akun, 'sahkan');
  if p_aksi in ('ajukan','setuju_ketua','sahkan') and j.status <> 'dibuka' then
    raise exception 'Jendela usulan tidak dibuka (jadwal berstatus %).', j.status using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);

  if p_aksi = 'ajukan' then
    if u.status not in ('draf','dikembalikan') then raise exception 'Hanya draf/dikembalikan yang dapat diajukan (status %)', u.status using errcode = '23514'; end if;
    if v_ketua then
      if v_ppk then ke := 'disetujui';
        update keu_revisi_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;
      else ke := 'menunggu_ppk';
        update keu_revisi_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now() where id = u.id;
      end if;
    elsif v_adm then ke := 'menunggu_ketua';
      update keu_revisi_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now() where id = u.id;
    else raise exception 'Akun % tidak berwenang mengajukan usulan RO %', p_akun, u.ro_kode using errcode = '42501'; end if;

  elsif p_aksi = 'setuju_ketua' then
    if u.status <> 'menunggu_ketua' then raise exception 'Usulan tidak menunggu ketua tim (status %)', u.status using errcode = '23514'; end if;
    if not keu_boleh(p_akun, 'setuju_ketua', u.ro_kode) then raise exception 'Akun % bukan ketua tim RO %', p_akun, u.ro_kode using errcode = '42501'; end if;
    if p_akun = u.diajukan_oleh then raise exception 'Pengaju tidak boleh menyetujui usulannya sendiri' using errcode = '42501'; end if;
    if v_ppk then ke := 'disetujui';
      update keu_revisi_usulan set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;
    else ke := 'menunggu_ppk';
      update keu_revisi_usulan set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now() where id = u.id;
    end if;

  elsif p_aksi = 'sahkan' then
    if u.status <> 'menunggu_ppk' then raise exception 'Usulan tidak menunggu PPK (status %)', u.status using errcode = '23514'; end if;
    if not v_ppk then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
    if p_akun = u.diajukan_oleh and not v_ketua then raise exception 'Pengaju tidak boleh mengesahkan usulannya sendiri' using errcode = '42501'; end if;
    ke := 'disetujui';
    update keu_revisi_usulan set status = ke, disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;

  elsif p_aksi = 'kembalikan' then
    if length(btrim(coalesce(p_catatan,''))) < 5 then raise exception 'Alasan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if j.status <> 'dibuka' then raise exception 'Jendela usulan tidak dibuka' using errcode = '23514'; end if;
    if u.status = 'menunggu_ketua' and keu_boleh(p_akun, 'setuju_ketua', u.ro_kode) then ke := 'dikembalikan';
    elsif u.status = 'menunggu_ppk' and v_ppk then ke := 'dikembalikan';
    else raise exception 'Akun % tidak dapat mengembalikan usulan berstatus %', p_akun, u.status using errcode = '42501'; end if;
    update keu_revisi_usulan set status = ke, catatan = p_catatan where id = u.id;
  else
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;

  insert into keu_revisi_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (u.id, p_aksi, u.status, ke, p_akun, coalesce(p_catatan,''));
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_usulan_aksi(bigint, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- View
-- ---------------------------------------------------------------------
create or replace view keu_v_revisi_ringkas with (security_invoker = true) as
select j.id as jadwal_id, j.tahun, j.jenis, j.judul, j.buka, j.tutup, j.status,
       count(u.id) as n_usulan,
       count(*) filter (where u.status = 'disetujui') as n_disetujui,
       count(*) filter (where u.status in ('menunggu_ketua','menunggu_ppk')) as n_proses,
       count(*) filter (where u.status in ('draf','dikembalikan')) as n_draf
from keu_revisi_jadwal j left join keu_revisi_usulan u on u.jadwal_id = j.id
group by j.id;

-- usulan yang ikut paket: hanya yang disetujui, pada jadwal yang sudah ditutup
create or replace view keu_v_revisi_paket with (security_invoker = true) as
select u.jadwal_id, u.id as usulan_id, u.ro_kode, u.status,
       (u.status = 'disetujui' and j.status in ('terkumpul','diterapkan','sah')) as ikut_paket,
       (j.status in ('terkumpul','diterapkan','sah') and u.status <> 'disetujui') as tidak_ikut_paket
from keu_revisi_usulan u join keu_revisi_jadwal j on j.id = u.jadwal_id;

-- pengingat tenggat (tidak mengunci)
create or replace view keu_v_tenggat with (security_invoker = true) as
select w.kode, w.nama, w.nilai_tanggal as tanggal, (w.nilai_tanggal - current_date) as sisa_hari
from keu_master_waktu w where w.nilai_tanggal is not null;

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_revisi_jadwal'::regclass and tgname = 'keu_t0_status') then
    create trigger keu_t0_status before insert or update on keu_revisi_jadwal for each row execute function keu_jaga_status_via_fungsi();
    create trigger keu_t1_jaga before insert or update or delete on keu_revisi_jadwal for each row execute function keu_jaga('jadwal');
    create trigger keu_t9_jejak after insert or update on keu_revisi_jadwal for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_revisi_usulan'::regclass and tgname = 'keu_t0_status') then
    create trigger keu_t0_status before insert or update on keu_revisi_usulan for each row execute function keu_jaga_status_via_fungsi();
    create trigger keu_t1_cek before insert or update or delete on keu_revisi_usulan for each row execute function keu_usulan_cek();
    create trigger keu_t9_jejak after insert or update on keu_revisi_usulan for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_revisi_sah'::regclass and tgname = 'keu_t9_jejak') then
    create trigger keu_t1_jaga before insert or update or delete on keu_revisi_sah for each row execute function keu_jaga('jadwal');
    create trigger keu_t9_jejak after insert or update on keu_revisi_sah for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_revisi_usulan_riwayat'::regclass and tgname = 'keu_t1_catat') then
    create trigger keu_t1_catat before update or delete on keu_revisi_usulan_riwayat for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_laporan_kpa'::regclass and tgname = 'keu_t1_catat') then
    create trigger keu_t1_catat before update or delete on keu_laporan_kpa for each row execute function keu_catat_saja('tanpa_hapus');
  end if;
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in
             ('keu_revisi_jadwal','keu_revisi_usulan','keu_revisi_usulan_riwayat','keu_revisi_sah','keu_laporan_kpa')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_revisi_ringkas, keu_v_revisi_paket, keu_v_tenggat from anon, authenticated;
grant select on keu_v_revisi_ringkas, keu_v_revisi_paket, keu_v_tenggat to service_role;
