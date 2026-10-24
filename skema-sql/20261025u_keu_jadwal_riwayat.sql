-- =====================================================================
-- 20261025u_keu_jadwal_riwayat.sql
-- Kertas Kerja Revisi POK (SIGAP) - papan 5 "Siklus status, peran, dan riwayat".
-- Bergantung pada 20261024a-t. Aman diulang. Tanpa DELETE/DROP. Hanya menambah (tabel, fungsi, view, trigger) dan
-- menyisipkan satu baris pencatatan ke dalam keu_jadwal_aksi (lewat penggantian teks terjaga).
--
--  1. keu_jadwal_riwayat  : riwayat tahap per jadwal (append-only): siapa, kapan, aksi, status tujuan, nomor dan tanggal dokumen, catatan.
--                           Jejak audit umum (sigap_audit) tidak memuat id jadwal pada pembaruan status, sehingga tidak bisa dipakai untuk ini.
--                           Baris 'awal' = status jadwal saat pencatatan dimulai (isi ulang dari keadaan sekarang).
--  2. keu_jadwal_aksi     : tetap, hanya ditambah satu INSERT ke keu_jadwal_riwayat tiap perpindahan status.
--  3. keu_jadwal_catat    : pengajuan dan hasil resmi revisi DIPA (ajukan | kembalikan | tolak | perbaiki). Tidak mengubah status jadwal
--                           (tetap 'diterapkan' sampai dinyatakan sah); posisi diturunkan dari baris riwayat terakhir.
--  4. keu_jadwal_langkah  : satu pintu untuk halaman Status: enam aksi lama (lewat keu_jadwal_aksi, dengan catatan) dan empat aksi baru.
--  5. keu_v_jadwal_riwayat: tampilan baca untuk aplikasi.
-- =====================================================================

create table if not exists keu_jadwal_riwayat (
  id         bigserial primary key,
  jadwal_id  bigint not null references keu_revisi_jadwal(id),
  waktu      timestamptz not null default now(),
  aksi       text not null check (aksi in ('awal','buka','tutup','terapkan','sah','lewati','pulihkan','ajukan','kembalikan','tolak','perbaiki')),
  status_ke  text not null check (status_ke in ('terjadwal','dibuka','terkumpul','diterapkan','sah','dilewati','diajukan','dikembalikan','ditolak')),
  nomor      text not null default '' check (length(nomor) <= 120),
  tanggal    date,
  catatan    text not null default '' check (length(catatan) <= 300),
  oleh       bigint references sigap_akun(id)
);
comment on table keu_jadwal_riwayat is 'Riwayat tahap jadwal revisi (append-only). Ditulis oleh keu_jadwal_aksi dan keu_jadwal_catat; tidak diubah atau dihapus dari aplikasi.';
create index if not exists keu_jadwal_riwayat_jadwal_idx on keu_jadwal_riwayat (jadwal_id, id);

-- Isi awal: keadaan jadwal sekarang (hanya untuk jadwal yang belum punya baris riwayat).
insert into keu_jadwal_riwayat (jadwal_id, waktu, aksi, status_ke, nomor, tanggal, catatan)
select j.id, coalesce(s.dicatat_at, j.diubah_at, now()), 'awal', j.status,
       coalesce(left(s.nomor_dokumen, 120), ''), s.tanggal_dokumen,
       'Status saat pencatatan riwayat dimulai. Perpindahan sebelumnya hanya ada di jejak audit umum.'
from keu_revisi_jadwal j
left join keu_revisi_sah s on s.jadwal_id = j.id
where not exists (select 1 from keu_jadwal_riwayat r where r.jadwal_id = j.id);

create or replace function keu_jadwal_riwayat_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    if keu_akun_sesi() is not null then
      raise exception 'Riwayat jadwal hanya bertambah; tidak boleh diubah atau dihapus dari aplikasi.' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  return new;
end $$;
revoke execute on function keu_jadwal_riwayat_jaga() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_jadwal_riwayat'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_jadwal_riwayat for each row execute function keu_jadwal_riwayat_jaga();
    create trigger keu_t1_jaga before insert or update or delete on keu_jadwal_riwayat for each row execute function keu_jaga('jadwal');
  end if;
end $$;

alter table keu_jadwal_riwayat enable row level security;
revoke all on table keu_jadwal_riwayat from anon, authenticated;
grant all on table keu_jadwal_riwayat to service_role;
grant usage, select on sequence keu_jadwal_riwayat_id_seq to service_role;

-- ---------------------------------------------------------------- keu_jadwal_catat
create or replace function keu_jadwal_catat(p_jadwal bigint, p_aksi text, p_nomor text default '', p_tanggal date default null,
                                           p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare j keu_revisi_jadwal; sub text; ke text; v_nomor text := left(btrim(coalesce(p_nomor, '')), 120);
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'jadwal') then raise exception 'Akun % bukan PPK (tidak berwenang atas jadwal)', p_akun using errcode = '42501'; end if;
  if p_aksi is null or p_aksi not in ('ajukan','kembalikan','tolak','perbaiki') then
    raise exception 'Aksi % tidak dikenal (ajukan, kembalikan, tolak, atau perbaiki)', p_aksi using errcode = '22023';
  end if;
  select * into j from keu_revisi_jadwal where id = p_jadwal for update;
  if not found then raise exception 'Jadwal % tidak ada', p_jadwal using errcode = 'P0002'; end if;
  if j.jenis not in ('dipa_djpb','dipa_dja') then
    raise exception 'Pengajuan dan hasil resmi hanya untuk revisi DIPA; revisi POK dan administrasi ditetapkan di satker.' using errcode = '23514';
  end if;
  if j.status <> 'diterapkan' then
    raise exception 'Aksi % hanya dapat dilakukan pada jadwal berstatus diterapkan (sekarang %)', p_aksi, j.status using errcode = '23514';
  end if;
  select r.aksi into sub from keu_jadwal_riwayat r
   where r.jadwal_id = j.id and r.aksi in ('ajukan','kembalikan','tolak','perbaiki') order by r.id desc limit 1;

  if p_aksi = 'ajukan' and sub is not null and sub not in ('perbaiki') then
    raise exception 'Pengajuan sudah dicatat; catat hasilnya (dikembalikan, ditolak, atau disahkan).' using errcode = '23514';
  end if;
  if p_aksi in ('kembalikan','tolak') and sub is distinct from 'ajukan' then
    raise exception 'Belum ada pengajuan yang menunggu hasil; catat pengajuan lebih dahulu.' using errcode = '23514';
  end if;
  if p_aksi = 'perbaiki' and (sub is null or sub not in ('kembalikan','tolak')) then
    raise exception 'Perbaikan hanya setelah usulan dikembalikan atau ditolak.' using errcode = '23514';
  end if;
  if p_aksi in ('ajukan','kembalikan','tolak') and (length(v_nomor) < 3 or p_tanggal is null) then
    raise exception 'Nomor dan tanggal dokumen wajib diisi; hanya dicatat apa yang tertulis pada dokumen resmi.' using errcode = '23514';
  end if;

  ke := case p_aksi when 'ajukan' then 'diajukan' when 'kembalikan' then 'dikembalikan' when 'tolak' then 'ditolak' else 'diterapkan' end;
  insert into keu_jadwal_riwayat (jadwal_id, aksi, status_ke, nomor, tanggal, catatan, oleh)
  values (j.id, p_aksi, ke, case when p_aksi = 'perbaiki' then '' else v_nomor end, case when p_aksi = 'perbaiki' then null else p_tanggal end,
          left(btrim(coalesce(p_catatan, '')), 300), p_akun);
  return ke;
end $$;
revoke execute on function keu_jadwal_catat(bigint, text, text, date, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------- keu_jadwal_langkah
create or replace function keu_jadwal_langkah(p_jadwal bigint, p_aksi text, p_nomor text default '', p_tanggal date default null,
                                             p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare r text; j keu_revisi_jadwal; sub text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'jadwal') then raise exception 'Akun % bukan PPK (tidak berwenang atas jadwal)', p_akun using errcode = '42501'; end if;
  if p_aksi in ('ajukan','kembalikan','tolak','perbaiki') then
    return keu_jadwal_catat(p_jadwal, p_aksi, p_nomor, p_tanggal, p_catatan, p_akun);
  end if;
  if p_aksi = 'sah' then
    select * into j from keu_revisi_jadwal where id = p_jadwal;
    if found and j.jenis in ('dipa_djpb','dipa_dja') then
      select r2.aksi into sub from keu_jadwal_riwayat r2
       where r2.jadwal_id = j.id and r2.aksi in ('ajukan','kembalikan','tolak','perbaiki') order by r2.id desc limit 1;
      if sub is distinct from 'ajukan' then
        raise exception 'Revisi DIPA dinyatakan sah setelah pengajuan dicatat dan belum dikembalikan atau ditolak.' using errcode = '23514';
      end if;
    end if;
  end if;
  perform set_config('keu.catatan', left(btrim(coalesce(p_catatan, '')), 300), true);
  begin
    r := keu_jadwal_aksi(p_jadwal, p_aksi, p_nomor, p_tanggal, p_akun);
  exception when others then
    perform set_config('keu.catatan', '', true);
    raise;
  end;
  perform set_config('keu.catatan', '', true);
  return r;
end $$;
revoke execute on function keu_jadwal_langkah(bigint, text, text, date, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------- tampilan baca
create or replace view keu_v_jadwal_riwayat with (security_invoker = true) as
select r.id, r.jadwal_id, r.waktu, r.aksi, r.status_ke, r.nomor, r.tanggal, r.catatan, ak.nama as oleh_nama
from keu_jadwal_riwayat r
left join sigap_akun ak on ak.id = r.oleh;
grant select on keu_v_jadwal_riwayat to service_role;

-- ---------------------------------------------------------------- keu_jadwal_aksi mencatat riwayat; keu_jalankan mengenal keu_jadwal_langkah
do $$
declare d text; pola text := 'update keu_revisi_jadwal set status = ke where id = j.id;';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jadwal_aksi' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jadwal_aksi tidak ditemukan'; end if;
  if position('keu_jadwal_riwayat' in d) = 0 then
    if position(pola in d) = 0 then raise exception 'Penambahan pencatatan riwayat gagal: pola tidak ditemukan'; end if;
    d := replace(d, pola, pola || ' insert into keu_jadwal_riwayat(jadwal_id, aksi, status_ke, nomor, tanggal, catatan, oleh) values (j.id, p_aksi, ke, '
      || 'case when p_aksi = ''sah'' then left(btrim(p_nomor), 120) else '''' end, case when p_aksi = ''sah'' then p_tanggal end, '
      || 'left(btrim(coalesce(current_setting(''keu.catatan'', true), '''')), 300), p_akun);');
    execute d;
  end if;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_jadwal_langkah''' in d) = 0 then
    d := replace(d, '''keu_pok_unggah_tandai'',', '''keu_jadwal_langkah'',''keu_pok_unggah_tandai'',');
    if position('''keu_jadwal_langkah''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
