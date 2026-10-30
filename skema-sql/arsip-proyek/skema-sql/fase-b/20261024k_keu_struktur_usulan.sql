-- =====================================================================
-- 20261024k_keu_struktur_usulan.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE G: usulan struktur mata anggaran (tambah level), kode sementara T-nnn.
-- Bergantung pada 20261024a-f, h, i, j. Aman diulang. Tanpa DELETE/DROP.
--
--  Prosedur P1 sampai P8 (spesifikasi bagian 6):
--   P1 pilih level dan induk; P2 isi kode, uraian (RO: volume dan satuan; Item: volume, satuan baku, harga);
--   P3 pemeriksaan (format kode, tidak duplikat, akun ada di Master, satuan baku, pengusul berwenang);
--   P4 jalur ditunjuk sistem dari Master jalur (keu_jalur), bukan dipilih manual;
--   P5 dana harus ada sumbernya: sumber dalam/lintas/tambahan (jalur tambahan = DJA; kebutuhan tanpa pagu dicatat di Fase F);
--   P6 baris usulan berkode sementara T-nnn: ketua tim mengajukan, admin RO menunggu ketua tim, PPK mengesahkan;
--   P7 POK resmi terbit dan dibandingkan (keu_struktur_cocokkan); P8 pemadanan: sama = aktif, berbeda = manual
--      (keu_struktur_padankan); Item diikat ke nomor item resmi lewat keu_item_nomor (terlihat di view).
--  Baris yang belum aktif tidak boleh dipakai untuk komitmen atau SPJ (kolom boleh_komitmen pada view).
--  Level yang dikosongkan menjadi tidak aktif, tidak dihapus.
--
--  Alur status:
--    draf -> menunggu_ketua (admin RO) -> menunggu_ppk -> sah -> diusulkan -> aktif | perlu_dipadankan -> aktif
--    kembalikan -> dikembalikan -> ajukan lagi;  batal (sebelum diusulkan);  ditolak_pusat (PPK, sesudah diusulkan)
--  Level pusat/PPK (Program, Kegiatan, KRO, RO): hanya PPK (kewenangan str_ppk), langsung sah saat diajukan.
--  Level tim (Komponen, Subkomponen, Akun, Item): kewenangan str_tim; pemisahan tugas seperti usulan revisi.
--  RO usulan yang sah didaftarkan di keu_ro dengan kode T-nnn agar RAB dan penugasan dapat disiapkan.
--  BATASAN: SIGAP belum memindahkan RAB/penugasan dari kode T-nnn ke kode resmi; view keu_v_ro_sementara
--  menunjukkan pemakaian kode sementara agar langkah itu dapat dikerjakan (aplikasi atau migrasi berikutnya).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_struktur_usulan (
  id                bigint generated always as identity primary key,
  tahun             smallint not null references keu_tahun_anggaran(tahun),
  kode_sementara    text not null unique check (kode_sementara ~ '^T-[0-9]{3}$'),
  level             text not null references keu_struktur_level(kode),
  induk_kunci       text,                                         -- jalur induk resmi pada POK berlaku
  induk_usulan_id   bigint references keu_struktur_usulan(id),    -- atau induk berupa usulan lain
  ro_kode           text,                                         -- RO pemilik (RO usulan: kode sementaranya sendiri)
  kode              text,
  uraian            text not null check (length(btrim(uraian)) >= 4),
  volume            numeric(14,2),
  satuan            text,
  harga             numeric(18,2),
  jumlah            numeric(18,0),
  sumber            text not null check (sumber in ('dalam','lintas','tambahan')),
  khusus            boolean not null default false,
  jalur_kode        text not null check (jalur_kode in ('pok','djpb','dja')),
  kepastian         text not null check (kepastian in ('catatan','dugaan')),
  tenggat_kode      text,
  status            text not null default 'draf' check (status in
                      ('draf','menunggu_ketua','menunggu_ppk','dikembalikan','sah','diusulkan','aktif','perlu_dipadankan','dibatalkan','ditolak_pusat')),
  catatan           text not null default '',
  dibuat_oleh       bigint references sigap_akun(id),
  diajukan_oleh     bigint references sigap_akun(id),
  diajukan_at       timestamptz,
  disetujui_ketua_oleh bigint references sigap_akun(id),
  disetujui_ketua_at   timestamptz,
  disahkan_oleh     bigint references sigap_akun(id),
  disahkan_at       timestamptz,
  jadwal_id         bigint references keu_revisi_jadwal(id),
  nomor_dokumen     text,
  diusulkan_at      timestamptz,
  kode_resmi        text,
  cara_padan        text check (cara_padan in ('sama','manual')),
  dipadankan_oleh   bigint references sigap_akun(id),
  dipadankan_at     timestamptz,
  alasan_akhir      text not null default '',
  dibuat_at         timestamptz not null default now(),
  diubah_at         timestamptz not null default now(),
  constraint str_induk check (
    (level = 'program' and induk_kunci is null and induk_usulan_id is null)
    or (level <> 'program' and ((induk_kunci is not null) <> (induk_usulan_id is not null)))),
  constraint str_isi check (
    (level = 'item' and kode is null and volume > 0 and harga > 0 and jumlah >= 0 and satuan is not null)
    or (level = 'ro' and kode is not null and volume > 0 and satuan is not null and harga is null and jumlah is null)
    or (level not in ('item','ro') and kode is not null and volume is null and satuan is null and harga is null and jumlah is null)),
  constraint str_khusus check (not khusus or level = 'komponen'),
  constraint str_aktif check (
    (status = 'aktif' and kode_resmi is not null and cara_padan is not null and dipadankan_at is not null)
    or (status <> 'aktif' and kode_resmi is null and cara_padan is null and dipadankan_oleh is null and dipadankan_at is null)),
  constraint str_diusulkan check (status not in ('diusulkan','aktif','perlu_dipadankan') or diusulkan_at is not null),
  constraint str_alasan check (status not in ('dibatalkan','ditolak_pusat') or length(btrim(alasan_akhir)) >= 5)
);
create index if not exists keu_struktur_usulan_ro_idx on keu_struktur_usulan(ro_kode);
create index if not exists keu_struktur_usulan_status_idx on keu_struktur_usulan(tahun, status);
create unique index if not exists keu_struktur_usulan_terbuka_uq on keu_struktur_usulan(
    level, (coalesce(induk_kunci, 'U' || induk_usulan_id::text)), (case when level = 'item' then lower(btrim(uraian)) else upper(kode) end))
  where status not in ('dibatalkan','ditolak_pusat');
create unique index if not exists keu_struktur_usulan_resmi_uq on keu_struktur_usulan(tahun, level, kode_resmi) where status = 'aktif';

create table if not exists keu_struktur_usulan_riwayat (
  id         bigint generated always as identity primary key,
  usulan_id  bigint not null references keu_struktur_usulan(id),
  aksi       text not null,
  dari       text,
  ke         text not null,
  oleh       bigint references sigap_akun(id),
  catatan    text not null default '',
  at         timestamptz not null default now()
);
create index if not exists keu_struktur_riwayat_idx on keu_struktur_usulan_riwayat(usulan_id, at);

-- ---------------------------------------------------------------------
-- 2. Tampilan bantu: jalur setiap simpul POK berlaku (untuk pencocokan induk dan kode resmi)
-- ---------------------------------------------------------------------
create or replace view keu_v_pok_jalur_node with (security_invoker = true) as
with recursive t as (
  select n.id, n.versi_id, n.tingkat, n.kode, n.nama, n.ro_kode,
         null::text as keg, null::text as kro, null::text as ro, null::text as komp, null::text as sub
  from keu_pok_node n join keu_pok_versi v on v.id = n.versi_id and v.status = 'berlaku'
  where n.induk_id is null
  union all
  select c.id, c.versi_id, c.tingkat, c.kode, c.nama, c.ro_kode,
         case when c.tingkat = 'kegiatan' then c.kode else p.keg end,
         case when c.tingkat = 'kro' then c.kode else p.kro end,
         case when c.tingkat = 'ro' then c.ro_kode else p.ro end,
         case when c.tingkat = 'komponen' then c.kode else p.komp end,
         case when c.tingkat = 'subkomp' then c.kode else p.sub end
  from t p join keu_pok_node c on c.induk_id = p.id
)
select t.id as node_id, t.versi_id, t.tingkat, t.kode, t.nama,
       case t.tingkat
         when 'program'  then t.kode
         when 'kegiatan' then t.kode
         when 'kro'      then t.keg || '.' || t.kode
         when 'ro'       then t.ro_kode
         when 'komponen' then t.ro || '/' || t.kode
         when 'subkomp'  then t.ro || '/' || t.komp || '/' || t.kode
         when 'akun'     then t.ro || '/' || t.komp || '/' || t.kode
       end as jalur
from t;
comment on view keu_v_pok_jalur_node is 'Jalur teks tiap simpul POK berlaku: program GG, kegiatan 2906, kro 2906.BMA, ro 2906.BMA.005, komponen 2906.BMA.005/055, akun 2906.BMA.005/055/521211.';

-- ---------------------------------------------------------------------
-- 3. Fungsi bantu
-- ---------------------------------------------------------------------
-- level induk yang diizinkan
create or replace function keu_struktur_induk_level(p_level text)
returns text[] language sql immutable as $$
  select case p_level
    when 'kegiatan' then array['program'] when 'kro' then array['kegiatan'] when 'ro' then array['kro']
    when 'komponen' then array['ro'] when 'subkomp' then array['komponen']
    when 'akun' then array['komponen','subkomp'] when 'item' then array['akun'] else array[]::text[] end
$$;

-- jalur resmi anak dari jalur induk
create or replace function keu_struktur_jalur_anak(p_level text, p_induk text, p_kode text)
returns text language sql immutable as $$
  select case p_level
    when 'program' then p_kode when 'kegiatan' then p_kode
    when 'kro' then p_induk || '.' || p_kode when 'ro' then p_induk || '.' || p_kode
    else p_induk || '/' || p_kode end
$$;

create or replace function keu_struktur_jalur_ada(p_level text, p_jalur text)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from keu_v_pok_jalur_node j where j.tingkat = p_level and j.jalur = p_jalur)
$$;

-- kode sementara berikutnya (mengabaikan kode T-nnn yang sudah dipakai RO)
create or replace function keu_struktur_kode_baru()
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('keu_struktur_kode'));
  select coalesce(max(x.n), 0) + 1 into n from (
    select substr(kode_sementara, 3)::int as n from keu_struktur_usulan
    union all select substr(kode, 3)::int from keu_ro where kode ~ '^T-[0-9]{3}$') x;
  if n > 999 then raise exception 'Kode sementara T-nnn habis (maksimum 999)' using errcode = '54000'; end if;
  return 'T-' || lpad(n::text, 3, '0');
end $$;
revoke execute on function keu_struktur_kode_baru() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Penjaga dan pemeriksa tabel
-- ---------------------------------------------------------------------
create or replace function keu_str_jaga()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if keu_akun_sesi() is not null then
    if tg_op = 'DELETE' then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    if not v_fungsi then
      raise exception 'Tabel % hanya dapat diubah melalui fungsi alur usulan struktur.', tg_table_name using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function keu_struktur_cek()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1'; v_j keu_master_jalur;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draf' then
      raise exception 'Usulan struktur baru harus berstatus draf' using errcode = '23514';
    end if;
    select * into v_j from keu_jalur(new.level, new.sumber, new.khusus);
    if v_j.id is null then
      raise exception 'Jalur untuk level % sumber % belum ada di Master jalur', new.level, new.sumber using errcode = '23514';
    end if;
    new.jalur_kode := v_j.jalur_kode; new.kepastian := v_j.kepastian; new.tenggat_kode := v_j.tenggat_kode;
    return new;
  end if;
  if (new.tahun, new.kode_sementara, new.level, new.dibuat_oleh) is distinct from (old.tahun, old.kode_sementara, old.level, old.dibuat_oleh) then
    raise exception 'Tahun, kode sementara, level, dan pembuat usulan tidak dapat diubah' using errcode = '23514';
  end if;
  -- isi usulan hanya dapat diubah selagi draf atau dikembalikan; jalur ikut berubah bila sumber berubah
  if old.status not in ('draf','dikembalikan') then
    if (new.induk_kunci, new.induk_usulan_id, new.ro_kode, new.kode, new.uraian, new.volume, new.satuan, new.harga, new.jumlah,
        new.sumber, new.khusus, new.jalur_kode)
       is distinct from
       (old.induk_kunci, old.induk_usulan_id, old.ro_kode, old.kode, old.uraian, old.volume, old.satuan, old.harga, old.jumlah,
        old.sumber, old.khusus, old.jalur_kode) then
      raise exception 'Isi usulan berstatus % tidak dapat diubah', old.status using errcode = '23514';
    end if;
  elsif (new.sumber, new.khusus) is distinct from (old.sumber, old.khusus) then
    select * into v_j from keu_jalur(new.level, new.sumber, new.khusus);
    if v_j.id is null then
      raise exception 'Jalur untuk level % sumber % belum ada di Master jalur', new.level, new.sumber using errcode = '23514';
    end if;
    new.jalur_kode := v_j.jalur_kode; new.kepastian := v_j.kepastian; new.tenggat_kode := v_j.tenggat_kode;
  end if;
  if new.status <> old.status then
    if not v_fungsi then
      raise exception 'Status usulan struktur hanya dapat diubah melalui fungsi alur.' using errcode = '42501';
    end if;
    if not (
         (old.status in ('draf','dikembalikan') and new.status in ('menunggu_ketua','menunggu_ppk','sah','dibatalkan'))
      or (old.status = 'menunggu_ketua' and new.status in ('menunggu_ppk','sah','dikembalikan','dibatalkan'))
      or (old.status = 'menunggu_ppk'   and new.status in ('sah','dikembalikan','dibatalkan'))
      or (old.status = 'sah'            and new.status in ('diusulkan','aktif','dibatalkan'))
      or (old.status = 'diusulkan'      and new.status in ('aktif','perlu_dipadankan','ditolak_pusat'))
      or (old.status = 'perlu_dipadankan' and new.status in ('aktif','ditolak_pusat'))) then
      raise exception 'Perpindahan status % -> % tidak diizinkan', old.status, new.status using errcode = '23514';
    end if;
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Fungsi alur
-- ---------------------------------------------------------------------
-- 5a. memeriksa isian level (dipakai membuat dan mengubah): format kode, akun, satuan; mengembalikan satuan baku
create or replace function keu_struktur_periksa(p_level text, p_kode text, p_uraian text, p_volume numeric, p_satuan text, p_harga numeric)
returns text language plpgsql stable set search_path = public as $$
declare l keu_struktur_level; v_sat text;
begin
  select * into l from keu_struktur_level where kode = p_level;
  if not found then raise exception 'Level % tidak dikenal', p_level using errcode = '23514'; end if;
  if length(btrim(coalesce(p_uraian, ''))) < 3 then raise exception 'Uraian minimal 3 huruf' using errcode = '23514'; end if;
  if p_level <> 'item' then
    if p_kode is null or l.format_re is null or p_kode !~ l.format_re then
      raise exception 'Format kode % tidak sah: %', p_level, l.format_ket using errcode = '23514';
    end if;
  end if;
  if p_level = 'akun' and not exists (select 1 from keu_master_akun a where a.kode = p_kode and a.aktif) then
    raise exception 'Akun % belum ada di Master akun; tambahkan dulu lengkap dengan pola dokumen', p_kode using errcode = '23514';
  end if;
  if p_level in ('ro','item') then
    if p_volume is null or p_volume <= 0 then raise exception 'Volume harus lebih dari nol' using errcode = '23514'; end if;
    v_sat := keu_satuan_baku(p_satuan);
    if v_sat is null or not exists (select 1 from keu_master_satuan s where s.kode = v_sat and s.aktif) then
      raise exception 'Satuan % belum ada di Master satuan', p_satuan using errcode = '23514';
    end if;
    if p_level = 'item' and (p_harga is null or p_harga <= 0) then
      raise exception 'Harga satuan harus lebih dari nol' using errcode = '23514';
    end if;
  end if;
  return v_sat;
end $$;

-- 5b. membuat usulan (draf). Salah satu dari p_induk (jalur resmi) atau p_induk_usulan diisi, kecuali Program.
create or replace function keu_struktur_usul(p_level text, p_induk text, p_induk_usulan bigint, p_kode text, p_uraian text,
                                             p_volume numeric, p_satuan text, p_harga numeric, p_sumber text,
                                             p_khusus boolean default false, p_catatan text default '',
                                             p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare
  l keu_struktur_level; pu keu_struktur_usulan; v_ro text; v_plevel text; v_sat text; v_id bigint; v_kode text := upper(btrim(coalesce(p_kode, '')));
  v_jalur text; v_boleh boolean; v_induk_kunci text := nullif(btrim(coalesce(p_induk, '')), ''); v_jumlah numeric; v_tahun smallint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into l from keu_struktur_level where kode = p_level;
  if not found then raise exception 'Level % tidak dikenal', p_level using errcode = '23514'; end if;
  if p_sumber not in ('dalam','lintas','tambahan') then raise exception 'Sumber dana harus dalam, lintas, atau tambahan' using errcode = '23514'; end if;
  if coalesce(p_khusus, false) and p_level <> 'komponen' then raise exception 'Hanya Komponen yang dapat bertanda khusus' using errcode = '23514'; end if;

  -- P1: induk
  if p_level = 'program' then
    if v_induk_kunci is not null or p_induk_usulan is not null then raise exception 'Program tidak punya induk' using errcode = '23514'; end if;
  else
    if (v_induk_kunci is not null) = (p_induk_usulan is not null) then
      raise exception 'Isi tepat satu: induk resmi (jalur) atau induk usulan' using errcode = '23514';
    end if;
    if v_induk_kunci is not null then
      select j.tingkat into v_plevel from keu_v_pok_jalur_node j
        where j.jalur = v_induk_kunci and j.tingkat = any (keu_struktur_induk_level(p_level)) limit 1;
      if v_plevel is null then
        raise exception 'Induk % tidak ada pada POK berlaku (level induk yang diizinkan: %)', v_induk_kunci, array_to_string(keu_struktur_induk_level(p_level), '/') using errcode = '23514';
      end if;
      v_ro := case when p_level in ('komponen','subkomp','akun','item') then split_part(v_induk_kunci, '/', 1) end;
    else
      select * into pu from keu_struktur_usulan where id = p_induk_usulan;
      if not found then raise exception 'Usulan induk % tidak ada', p_induk_usulan using errcode = '23514'; end if;
      if not (pu.level = any (keu_struktur_induk_level(p_level))) then
        raise exception 'Level induk % tidak sesuai untuk %', pu.level, p_level using errcode = '23514';
      end if;
      if pu.status in ('dibatalkan','ditolak_pusat') then raise exception 'Usulan induk % sudah %', pu.kode_sementara, pu.status using errcode = '23514'; end if;
      v_ro := pu.ro_kode;
    end if;
  end if;

  -- pengusul berwenang
  if l.pengusul = 'tim' then
    v_boleh := keu_boleh(p_akun, 'str_tim', v_ro);
  else
    v_boleh := keu_boleh(p_akun, 'str_ppk');
  end if;
  if not v_boleh then
    raise exception 'Akun % tidak berwenang mengusulkan % %', p_akun, l.nama, coalesce('pada RO ' || v_ro, '') using errcode = '42501';
  end if;

  -- P2, P3: isian
  v_sat := keu_struktur_periksa(p_level, v_kode, p_uraian, p_volume, p_satuan, p_harga);
  if p_level = 'item' then v_jumlah := round(p_volume * p_harga); v_kode := null; end if;

  -- tidak kembar dengan yang sudah ada di POK berlaku
  if v_induk_kunci is not null then
    if p_level = 'item' then
      if exists (select 1 from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id and v.status = 'berlaku'
                 where d.kunci_stabil = keu_kunci_detail(split_part(v_induk_kunci, '/', 1), split_part(v_induk_kunci, '/', 2),
                                                        split_part(v_induk_kunci, '/', 3), p_uraian, 1)) then
        raise exception 'Item dengan uraian itu sudah ada di POK berlaku (%)', v_induk_kunci using errcode = '23505';
      end if;
    elsif keu_struktur_jalur_ada(p_level, keu_struktur_jalur_anak(p_level, v_induk_kunci, v_kode)) then
      raise exception '% % sudah ada di POK berlaku', l.nama, keu_struktur_jalur_anak(p_level, v_induk_kunci, v_kode) using errcode = '23505';
    end if;
  elsif p_level = 'program' and keu_struktur_jalur_ada('program', v_kode) then
    raise exception 'Program % sudah ada di POK berlaku', v_kode using errcode = '23505';
  end if;

  v_tahun := keu_kek_tahun();
  v_id := null;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_struktur_usulan(tahun, kode_sementara, level, induk_kunci, induk_usulan_id, ro_kode, kode, uraian, volume, satuan, harga,
                                  jumlah, sumber, khusus, jalur_kode, kepastian, status, catatan, dibuat_oleh)
  values (v_tahun, keu_struktur_kode_baru(), p_level, v_induk_kunci, p_induk_usulan, v_ro, v_kode, btrim(p_uraian),
          case when p_level in ('ro','item') then p_volume end, case when p_level in ('ro','item') then v_sat end,
          case when p_level = 'item' then p_harga end, v_jumlah, p_sumber, coalesce(p_khusus, false), 'pok', 'catatan', 'draf',
          btrim(coalesce(p_catatan, '')), p_akun)
  returning id into v_id;
  if p_level = 'ro' then
    update keu_struktur_usulan set ro_kode = kode_sementara where id = v_id;
  end if;
  insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (v_id, 'buat', null, 'draf', p_akun, btrim(coalesce(p_catatan, '')));
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_usul(text, text, bigint, text, text, numeric, text, numeric, text, boolean, text, bigint) from public, anon, authenticated;

-- 5c. mengubah draf (isian null = tidak diubah)
create or replace function keu_struktur_ubah(p_id bigint, p_kode text default null, p_uraian text default null, p_volume numeric default null,
                                             p_satuan text default null, p_harga numeric default null, p_sumber text default null,
                                             p_catatan text default null, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare u keu_struktur_usulan; l keu_struktur_level; v_sat text; v_kode text; v_uraian text; v_vol numeric; v_harga numeric; v_boleh boolean;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into u from keu_struktur_usulan where id = p_id for update;
  if not found then raise exception 'Usulan % tidak ada', p_id using errcode = '23514'; end if;
  select * into l from keu_struktur_level where kode = u.level;
  if u.status not in ('draf','dikembalikan') then raise exception 'Usulan berstatus % tidak dapat diubah', u.status using errcode = '23514'; end if;
  v_boleh := p_akun = u.dibuat_oleh
          or (l.pengusul = 'tim' and (keu_boleh(p_akun, 'rab', u.ro_kode) or keu_boleh(p_akun, 'sahkan')))
          or (l.pengusul <> 'tim' and keu_boleh(p_akun, 'str_ppk'));
  if not v_boleh then raise exception 'Akun % tidak berwenang mengubah usulan %', p_akun, u.kode_sementara using errcode = '42501'; end if;
  if p_sumber is not null and p_sumber not in ('dalam','lintas','tambahan') then raise exception 'Sumber dana harus dalam, lintas, atau tambahan' using errcode = '23514'; end if;
  v_kode := case when u.level = 'item' then null else upper(btrim(coalesce(p_kode, u.kode))) end;
  v_uraian := coalesce(btrim(p_uraian), u.uraian);
  v_vol := coalesce(p_volume, u.volume);
  v_harga := coalesce(p_harga, u.harga);
  v_sat := keu_struktur_periksa(u.level, v_kode, v_uraian, v_vol, coalesce(p_satuan, u.satuan), v_harga);
  perform set_config('keu.via_fungsi', '1', true);
  update keu_struktur_usulan set kode = v_kode, uraian = v_uraian,
         volume = case when u.level in ('ro','item') then v_vol end,
         satuan = case when u.level in ('ro','item') then v_sat end,
         harga = case when u.level = 'item' then v_harga end,
         jumlah = case when u.level = 'item' then round(v_vol * v_harga) end,
         sumber = coalesce(p_sumber, sumber), catatan = coalesce(btrim(p_catatan), catatan)
   where id = p_id;
  insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh) values (p_id, 'ubah', u.status, u.status, p_akun);
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_ubah(bigint, text, text, numeric, text, numeric, text, text, bigint) from public, anon, authenticated;

-- 5d. alur persetujuan: ajukan | setuju_ketua | sahkan | kembalikan | batal
create or replace function keu_struktur_aksi(p_id bigint, p_aksi text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  u keu_struktur_usulan; l keu_struktur_level; ke text; v_ketua boolean; v_adm boolean; v_ppk boolean; v_tim boolean; v_pengaju_ppk boolean;
  v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into u from keu_struktur_usulan where id = p_id for update;
  if not found then raise exception 'Usulan % tidak ada', p_id using errcode = '23514'; end if;
  select * into l from keu_struktur_level where kode = u.level;
  v_tim := l.pengusul = 'tim';
  v_ppk := keu_boleh(p_akun, 'sahkan');
  v_ketua := v_tim and keu_boleh(p_akun, 'rab', u.ro_kode);
  v_adm := v_tim and keu_boleh(p_akun, 'draf', u.ro_kode);
  perform set_config('keu.via_fungsi', '1', true);

  if p_aksi = 'ajukan' then
    if u.status not in ('draf','dikembalikan') then raise exception 'Hanya draf atau dikembalikan yang dapat diajukan (status %)', u.status using errcode = '23514'; end if;
    if u.level <> 'program' and u.induk_usulan_id is not null and
       exists (select 1 from keu_struktur_usulan x where x.id = u.induk_usulan_id and x.status in ('dibatalkan','ditolak_pusat')) then
      raise exception 'Usulan induk sudah dibatalkan atau ditolak' using errcode = '23514';
    end if;
    if not v_tim then
      if not keu_boleh(p_akun, 'str_ppk') then raise exception 'Akun % tidak berwenang mengajukan %', p_akun, l.nama using errcode = '42501'; end if;
      ke := 'sah';
      update keu_struktur_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;
    elsif v_ketua then
      if v_ppk then
        ke := 'sah';
        update keu_struktur_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;
      else
        ke := 'menunggu_ppk';
        update keu_struktur_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now() where id = u.id;
      end if;
    elsif v_ppk and u.ro_kode like 'T-%' then
      -- RO sementara belum punya ketua tim yang ditetapkan: PPK langsung mengesahkan agar usulan tidak buntu
      ke := 'sah';
      update keu_struktur_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;
    elsif v_adm or v_ppk then
      ke := 'menunggu_ketua';
      update keu_struktur_usulan set status = ke, diajukan_oleh = p_akun, diajukan_at = now() where id = u.id;
    else
      raise exception 'Akun % tidak berwenang mengajukan usulan RO %', p_akun, u.ro_kode using errcode = '42501';
    end if;

  elsif p_aksi = 'setuju_ketua' then
    if u.status <> 'menunggu_ketua' then raise exception 'Usulan tidak menunggu ketua tim (status %)', u.status using errcode = '23514'; end if;
    if not keu_boleh(p_akun, 'setuju_ketua', u.ro_kode) then raise exception 'Akun % bukan ketua tim RO %', p_akun, u.ro_kode using errcode = '42501'; end if;
    if p_akun = u.diajukan_oleh then raise exception 'Pengaju tidak boleh menyetujui usulannya sendiri' using errcode = '42501'; end if;
    v_pengaju_ppk := u.diajukan_oleh is not null and keu_boleh(u.diajukan_oleh, 'sahkan');
    if v_ppk or v_pengaju_ppk then
      ke := 'sah';
      update keu_struktur_usulan set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now(),
             disahkan_oleh = case when v_ppk then p_akun else u.diajukan_oleh end, disahkan_at = now() where id = u.id;
    else
      ke := 'menunggu_ppk';
      update keu_struktur_usulan set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now() where id = u.id;
    end if;

  elsif p_aksi = 'sahkan' then
    if u.status <> 'menunggu_ppk' then raise exception 'Usulan tidak menunggu PPK (status %)', u.status using errcode = '23514'; end if;
    if not v_ppk then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
    if p_akun = u.diajukan_oleh and not keu_boleh(p_akun, 'rab', u.ro_kode) then
      raise exception 'Pengaju tidak boleh mengesahkan usulannya sendiri' using errcode = '42501';
    end if;
    ke := 'sah';
    update keu_struktur_usulan set status = ke, disahkan_oleh = p_akun, disahkan_at = now() where id = u.id;

  elsif p_aksi = 'kembalikan' then
    if length(v_cat) < 5 then raise exception 'Alasan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if u.status = 'menunggu_ketua' and keu_boleh(p_akun, 'setuju_ketua', u.ro_kode) then ke := 'dikembalikan';
    elsif u.status = 'menunggu_ppk' and v_ppk then ke := 'dikembalikan';
    else raise exception 'Akun % tidak dapat mengembalikan usulan berstatus %', p_akun, u.status using errcode = '42501'; end if;
    update keu_struktur_usulan set status = ke, catatan = v_cat where id = u.id;

  elsif p_aksi = 'batal' then
    if length(v_cat) < 5 then raise exception 'Alasan pembatalan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if u.status not in ('draf','dikembalikan','menunggu_ketua','menunggu_ppk','sah') then
      raise exception 'Usulan berstatus % tidak dapat dibatalkan dari sini (gunakan tolak_pusat bila sudah diusulkan)', u.status using errcode = '23514';
    end if;
    if not (p_akun = u.dibuat_oleh or v_ppk or v_ketua or (not v_tim and keu_boleh(p_akun, 'str_ppk'))) then
      raise exception 'Akun % tidak berwenang membatalkan usulan %', p_akun, u.kode_sementara using errcode = '42501';
    end if;
    if exists (select 1 from keu_struktur_usulan x where x.induk_usulan_id = u.id and x.status not in ('dibatalkan','ditolak_pusat')) then
      raise exception 'Masih ada usulan turunan yang berjalan; batalkan dulu' using errcode = '23514';
    end if;
    ke := 'dibatalkan';
    update keu_struktur_usulan set status = ke, alasan_akhir = v_cat where id = u.id;
    if u.level = 'ro' then update keu_ro set aktif = false where kode = u.kode_sementara; end if;
  else
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;

  -- RO usulan yang sah didaftarkan sebagai RO sementara
  if ke = 'sah' and u.level = 'ro' then
    insert into keu_ro(kode, nama) values (u.kode_sementara, u.uraian) on conflict (kode) do update set aktif = true;
  end if;
  insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (u.id, p_aksi, u.status, ke, p_akun, v_cat);
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_aksi(bigint, text, text, bigint) from public, anon, authenticated;

-- 5e. PPK menyatakan usulan sah telah diusulkan (paket DIPA atau revisi POK)
create or replace function keu_struktur_usulkan(p_id bigint, p_jadwal bigint default null, p_nomor_dokumen text default null,
                                                p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare u keu_struktur_usulan; j keu_revisi_jadwal;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'sahkan') then raise exception 'Hanya PPK yang menyatakan usulan diusulkan (akun %)', p_akun using errcode = '42501'; end if;
  select * into u from keu_struktur_usulan where id = p_id for update;
  if not found then raise exception 'Usulan % tidak ada', p_id using errcode = '23514'; end if;
  if u.status <> 'sah' then raise exception 'Hanya usulan sah yang dapat diusulkan (status %)', u.status using errcode = '23514'; end if;
  if u.jalur_kode in ('dja','djpb') and length(btrim(coalesce(p_nomor_dokumen, ''))) < 3 then
    raise exception 'Nomor surat usulan wajib diisi untuk jalur %', u.jalur_kode using errcode = '23514';
  end if;
  if p_jadwal is not null then
    select * into j from keu_revisi_jadwal where id = p_jadwal;
    if not found then raise exception 'Jadwal revisi % tidak ada', p_jadwal using errcode = '23514'; end if;
    if u.jalur_kode = 'pok' and j.jenis not in ('pok','administrasi') then
      raise exception 'Jadwal % berjenis %, tidak sesuai jalur pok', p_jadwal, j.jenis using errcode = '23514';
    elsif u.jalur_kode in ('dja','djpb') and j.jenis <> 'dipa_' || u.jalur_kode then
      raise exception 'Jadwal % berjenis %, tidak sesuai jalur %', p_jadwal, j.jenis, u.jalur_kode using errcode = '23514';
    end if;
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_struktur_usulan set status = 'diusulkan', diusulkan_at = now(), jadwal_id = p_jadwal, nomor_dokumen = nullif(btrim(coalesce(p_nomor_dokumen, '')), '')
   where id = p_id;
  insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (p_id, 'usulkan', 'sah', 'diusulkan', p_akun, coalesce(p_nomor_dokumen, ''));
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_usulkan(bigint, bigint, text, bigint) from public, anon, authenticated;

-- 5f. P7: membandingkan usulan dengan POK berlaku. Sama -> aktif; yang sudah diusulkan tetapi tidak ada pada POK
--     yang terbit sesudahnya -> perlu_dipadankan. Mengembalikan jumlah usulan yang berubah.
create or replace function keu_struktur_cocokkan(p_tahun smallint default keu_kek_tahun(), p_akun bigint default keu_akun_sesi())
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; pu keu_struktur_usulan; v_induk text; v_jalur text; v_n int := 0; v_ada boolean; v_pok_baru boolean; v_komp text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'sahkan') then raise exception 'Hanya PPK yang mencocokkan usulan dengan POK (akun %)', p_akun using errcode = '42501'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  for r in select u.*, l.no as lv_no from keu_struktur_usulan u join keu_struktur_level l on l.kode = u.level
           where u.tahun = p_tahun and u.status in ('sah','diusulkan','perlu_dipadankan') order by l.no, u.id
  loop
    -- jalur induk resmi
    if r.level = 'program' then v_induk := null;
    elsif r.induk_kunci is not null then v_induk := r.induk_kunci;
    else
      select * into pu from keu_struktur_usulan where id = r.induk_usulan_id;
      v_induk := case when pu.status = 'aktif' then pu.kode_resmi end;
    end if;
    continue when v_induk is null and r.level <> 'program';

    if r.level = 'item' then
      v_jalur := keu_kunci_detail(split_part(v_induk, '/', 1), split_part(v_induk, '/', 2), split_part(v_induk, '/', 3), r.uraian, 1);
      v_ada := exists (select 1 from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id and v.status = 'berlaku' where d.kunci_stabil = v_jalur);
    else
      v_jalur := keu_struktur_jalur_anak(r.level, v_induk, r.kode);
      v_ada := keu_struktur_jalur_ada(r.level, v_jalur);
    end if;

    if v_ada and not exists (select 1 from keu_struktur_usulan x where x.tahun = r.tahun and x.level = r.level and x.kode_resmi = v_jalur and x.status = 'aktif') then
      update keu_struktur_usulan set status = 'aktif', kode_resmi = v_jalur, cara_padan = 'sama', dipadankan_oleh = p_akun, dipadankan_at = now() where id = r.id;
      insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (r.id, 'cocok', r.status, 'aktif', p_akun, v_jalur);
      v_n := v_n + 1;
    elsif r.status = 'diusulkan' then
      select exists (select 1 from keu_pok_versi v where v.tahun = r.tahun and v.status = 'berlaku' and v.dibuat_at > r.diusulkan_at) into v_pok_baru;
      if v_pok_baru then
        update keu_struktur_usulan set status = 'perlu_dipadankan' where id = r.id;
        insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (r.id, 'perlu_padan', 'diusulkan', 'perlu_dipadankan', p_akun, v_jalur);
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  perform set_config('keu.via_fungsi', '', true);
  return v_n;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_cocokkan(smallint, bigint) from public, anon, authenticated;

-- 5g. P8: pemadanan manual. p_resmi = jalur resmi pada POK berlaku (Item: kunci_stabil detail).
create or replace function keu_struktur_padankan(p_id bigint, p_resmi text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare u keu_struktur_usulan; pu keu_struktur_usulan; v_induk_usulan text; v_induk_resmi text; v_lv text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'sahkan') then raise exception 'Hanya PPK yang memadankan usulan (akun %)', p_akun using errcode = '42501'; end if;
  select * into u from keu_struktur_usulan where id = p_id for update;
  if not found then raise exception 'Usulan % tidak ada', p_id using errcode = '23514'; end if;
  if u.status <> 'perlu_dipadankan' then raise exception 'Hanya usulan perlu_dipadankan yang dapat dipadankan (status %)', u.status using errcode = '23514'; end if;
  p_resmi := btrim(coalesce(p_resmi, ''));
  if u.level = 'item' then
    if not exists (select 1 from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id and v.status = 'berlaku' where d.kunci_stabil = p_resmi) then
      raise exception 'Item resmi % tidak ada pada POK berlaku', p_resmi using errcode = '23514';
    end if;
    v_induk_resmi := split_part(p_resmi, '/', 1) || '/' || split_part(p_resmi, '/', 2) || '/' || split_part(p_resmi, '/', 3);
  else
    if not keu_struktur_jalur_ada(u.level, p_resmi) then
      raise exception '% % tidak ada pada POK berlaku', u.level, p_resmi using errcode = '23514';
    end if;
    v_induk_resmi := case u.level
      when 'program' then null when 'kegiatan' then null
      when 'kro' then split_part(p_resmi, '.', 1) when 'ro' then split_part(p_resmi, '.', 1) || '.' || split_part(p_resmi, '.', 2)
      else regexp_replace(p_resmi, '/[^/]*$', '') end;
  end if;
  -- induk harus sama
  if u.level <> 'program' then
    if u.induk_kunci is not null then v_induk_usulan := u.induk_kunci;
    else
      select * into pu from keu_struktur_usulan where id = u.induk_usulan_id;
      if pu.status <> 'aktif' then raise exception 'Padankan dulu usulan induk % (status %)', pu.kode_sementara, pu.status using errcode = '23514'; end if;
      v_induk_usulan := pu.kode_resmi;
    end if;
    if v_induk_resmi is distinct from v_induk_usulan then
      raise exception 'Padanan berada di induk %, bukan %', v_induk_resmi, v_induk_usulan using errcode = '23514';
    end if;
  end if;
  if exists (select 1 from keu_struktur_usulan x where x.tahun = u.tahun and x.level = u.level and x.kode_resmi = p_resmi and x.status = 'aktif') then
    raise exception 'Kode resmi % sudah dipadankan dengan usulan lain', p_resmi using errcode = '23505';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_struktur_usulan set status = 'aktif', kode_resmi = p_resmi, cara_padan = 'manual', dipadankan_oleh = p_akun, dipadankan_at = now() where id = p_id;
  insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (p_id, 'padankan', 'perlu_dipadankan', 'aktif', p_akun, p_resmi);
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_padankan(bigint, text, bigint) from public, anon, authenticated;

-- 5h. pusat tidak menyetujui / tidak memuat usulan
create or replace function keu_struktur_tolak_pusat(p_id bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare u keu_struktur_usulan;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'sahkan') then raise exception 'Hanya PPK yang mencatat penolakan pusat (akun %)', p_akun using errcode = '42501'; end if;
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan minimal 5 huruf' using errcode = '23514'; end if;
  select * into u from keu_struktur_usulan where id = p_id for update;
  if not found then raise exception 'Usulan % tidak ada', p_id using errcode = '23514'; end if;
  if u.status not in ('diusulkan','perlu_dipadankan') then raise exception 'Usulan berstatus % tidak dapat ditolak pusat', u.status using errcode = '23514'; end if;
  if exists (select 1 from keu_struktur_usulan x where x.induk_usulan_id = u.id and x.status not in ('dibatalkan','ditolak_pusat')) then
    raise exception 'Masih ada usulan turunan yang berjalan; selesaikan dulu' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_struktur_usulan set status = 'ditolak_pusat', alasan_akhir = btrim(p_alasan) where id = p_id;
  if u.level = 'ro' then update keu_ro set aktif = false where kode = u.kode_sementara; end if;
  insert into keu_struktur_usulan_riwayat(usulan_id, aksi, dari, ke, oleh, catatan) values (p_id, 'tolak_pusat', u.status, 'ditolak_pusat', p_akun, btrim(p_alasan));
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_struktur_tolak_pusat(bigint, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. View
-- ---------------------------------------------------------------------
create or replace view keu_v_struktur_usulan with (security_invoker = true) as
select u.id, u.tahun, u.kode_sementara, u.level, l.nama as level_nama, l.no as level_no,
       coalesce(u.induk_kunci, pu.kode_sementara) as induk, u.induk_usulan_id, u.ro_kode, u.kode, u.uraian,
       u.volume, u.satuan, u.harga, u.jumlah, u.sumber, u.khusus,
       u.jalur_kode, j.nama as jalur_nama, j.pemutus as jalur_pemutus, j.dasar as jalur_dasar, u.kepastian, u.tenggat_kode,
       u.status, u.status = 'aktif' as boleh_komitmen,
       case u.status
         when 'draf' then 'pengaju' when 'dikembalikan' then 'pengaju' when 'menunggu_ketua' then 'ketua tim' when 'menunggu_ppk' then 'PPK'
         when 'sah' then 'PPK (diusulkan ke pusat)' when 'diusulkan' then 'pusat (POK resmi)' when 'perlu_dipadankan' then 'PPK (pemadanan)' end as menunggu,
       u.catatan, u.dibuat_oleh, u.diajukan_oleh, u.diajukan_at, u.disetujui_ketua_oleh, u.disahkan_oleh, u.disahkan_at,
       u.jadwal_id, u.nomor_dokumen, u.diusulkan_at, u.kode_resmi, u.cara_padan, u.dipadankan_at, u.alasan_akhir,
       n.nomor_item
from keu_struktur_usulan u
join keu_struktur_level l on l.kode = u.level
left join keu_struktur_usulan pu on pu.id = u.induk_usulan_id
left join keu_master_jalur j on j.level_kode = u.level and j.sumber = u.sumber and j.khusus = (u.khusus and u.level = 'komponen' and u.sumber <> 'tambahan')
left join keu_item_nomor n on n.tahun = u.tahun and u.level = 'item' and n.kunci_stabil = u.kode_resmi;
comment on view keu_v_struktur_usulan is 'Usulan struktur anggaran dengan jalur, siapa yang ditunggu, kode resmi, dan nomor item resmi (Item aktif). boleh_komitmen hanya untuk status aktif.';

create or replace view keu_v_struktur_ringkas with (security_invoker = true) as
select u.tahun, u.level, u.level_nama, u.level_no, u.status, count(*) as n
from keu_v_struktur_usulan u
group by u.tahun, u.level, u.level_nama, u.level_no, u.status;
comment on view keu_v_struktur_ringkas is 'Jumlah usulan struktur per level dan status.';

-- RO dengan kode sementara T-nnn dan pemakaiannya (bahan pemindahan ke kode resmi)
create or replace view keu_v_ro_sementara with (security_invoker = true) as
select r.kode as ro_sementara, r.nama, r.aktif, u.id as usulan_id, u.status as status_usulan, u.kode_resmi,
       (select count(*) from keu_rab x where x.ro_kode = r.kode) as n_rab,
       (select count(*) from keu_penugasan x where x.ro_kode = r.kode and x.dibatalkan_at is null) as n_penugasan,
       (select count(*) from keu_revisi_usulan x where x.ro_kode = r.kode) as n_usulan_revisi,
       (select count(*) from keu_kk_baris x where x.ro_kode = r.kode) as n_baris_kertas_kerja,
       (select count(*) from keu_kekurangan x where x.ro_kode = r.kode) as n_kekurangan,
       (select count(*) from keu_struktur_usulan x where x.ro_kode = r.kode and x.id <> coalesce(u.id, 0)) as n_usulan_turunan
from keu_ro r
left join keu_struktur_usulan u on u.kode_sementara = r.kode and u.level = 'ro'
where r.kode like 'T-%';
comment on view keu_v_ro_sementara is 'RO sementara T-nnn, status usulannya, kode resmi, dan jumlah catatan yang masih memakai kode sementara.';

-- ---------------------------------------------------------------------
-- 7. Trigger, RLS, hak
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_struktur_usulan'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_struktur_usulan for each row execute function keu_struktur_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_struktur_usulan for each row execute function keu_str_jaga();
    create trigger keu_t9_jejak after insert or update on keu_struktur_usulan for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_struktur_usulan_riwayat'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_struktur_usulan_riwayat for each row execute function keu_str_jaga();
    create trigger keu_t2_catat before update or delete on keu_struktur_usulan_riwayat for each row execute function keu_catat_saja();
  end if;
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_struktur_usulan','keu_struktur_usulan_riwayat')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke execute on function keu_struktur_induk_level(text), keu_struktur_jalur_anak(text, text, text), keu_struktur_jalur_ada(text, text),
                           keu_struktur_periksa(text, text, text, numeric, text, numeric), keu_str_jaga(), keu_struktur_cek()
  from public, anon, authenticated;
grant execute on function keu_struktur_induk_level(text), keu_struktur_jalur_anak(text, text, text), keu_struktur_jalur_ada(text, text),
                          keu_struktur_periksa(text, text, text, numeric, text, numeric) to service_role;
revoke all on keu_v_pok_jalur_node, keu_v_struktur_usulan, keu_v_struktur_ringkas, keu_v_ro_sementara from anon, authenticated;
grant select on keu_v_pok_jalur_node, keu_v_struktur_usulan, keu_v_struktur_ringkas, keu_v_ro_sementara to service_role;
