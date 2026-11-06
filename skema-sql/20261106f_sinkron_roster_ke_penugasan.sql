-- 20261106f_sinkron_roster_ke_penugasan.sql
-- Satu identitas petugas, tahap 3b. Dijalankan Iqbal di SQL Editor Supabase, SETELAH 20261106e.
--
-- Masalah: modul bencana lama (sampai 20 Nov 2026) masih mengubah `bencana_petugas` (atasan, konfirmasi, penanda kinerja),
-- sedangkan pembaca baru memakai `sigap_penugasan` dan `sigap_penilaian_flag`. Tanpa penyambung, keduanya bisa berbeda.
--
-- Keputusan desain: penyambung berupa PEMICU basis data (menangkap semua jalur tulis, termasuk SQL manual), bukan kode di tiap rute.
-- Pemicu hanya menyalin yang AMAN dan tidak bernilai administratif:
--   * atasan  -> sigap_penugasan.atasan_akun_id (penugasan PSP aktif yang sudah ada)
--   * konfirmasi pendaftaran -> sigap_penugasan.konfirmasi_pendaftaran
--   * red flag dan rekomendasi PML -> sigap_penilaian_flag (kolom SE2026)
-- Pemicu TIDAK membuat, menonaktifkan, atau mengubah peran penugasan. Penugasan terikat surat tugas dan tarif, jadi itu keputusan
-- admin lewat Penugasan & ST. Selisihnya ditampilkan di view v_selisih_roster_penugasan untuk dirapikan manual.
-- Pemicu ikut hilang saat tabel bencana_petugas dibuang (tahap 4b).

begin;

do $$
begin
  if (select count(*) from sigap_penilaian_kolom where id = 1 and kode = 'SE2026') <> 1 then
    raise exception 'Pengaman: kolom penilaian SE2026 (id 1) tidak ditemukan. Dibatalkan.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'sigap_penugasan' and column_name = 'atasan_akun_id') then
    raise exception 'Pengaman: jalankan 20261106e dulu. Dibatalkan.';
  end if;
end $$;

create or replace function public.trg_roster_ke_penugasan()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_akun   bigint;
  v_atasan bigint;
begin
  select id into v_akun from sigap_akun where petugas_bencana_id = new.id;
  if v_akun is null then
    return new;
  end if;

  -- atasan dan konfirmasi pendaftaran -> penugasan PSP yang aktif
  if tg_op = 'INSERT'
     or new.atasan_id is distinct from old.atasan_id
     or new.pendaftaran_bencana_konfirmasi is distinct from old.pendaftaran_bencana_konfirmasi then
    select id into v_atasan from sigap_akun where petugas_bencana_id = new.atasan_id;
    update sigap_penugasan
       set atasan_akun_id         = v_atasan,
           konfirmasi_pendaftaran = coalesce(new.pendaftaran_bencana_konfirmasi, konfirmasi_pendaftaran)
     where kegiatan_id = 1 and akun_id = v_akun and aktif;
  end if;

  -- penanda kinerja -> sigap_penilaian_flag (kolom SE2026, id 1)
  if tg_op = 'INSERT'
     or new.red_flag_kinerja is distinct from old.red_flag_kinerja
     or new.rekomendasi_pml is distinct from old.rekomendasi_pml then
    if coalesce(new.red_flag_kinerja, false) or coalesce(new.rekomendasi_pml, false) then
      insert into sigap_penilaian_flag (akun_id, kolom_id, red_flag, rekomendasi_pml, catatan, diubah_at)
      values (v_akun, 1, coalesce(new.red_flag_kinerja, false), coalesce(new.rekomendasi_pml, false), 'Disalin dari daftar petugas lama.', now())
      on conflict (akun_id, kolom_id)
      do update set red_flag = excluded.red_flag, rekomendasi_pml = excluded.rekomendasi_pml, diubah_at = now();
    else
      delete from sigap_penilaian_flag where akun_id = v_akun and kolom_id = 1;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists roster_ke_penugasan on bencana_petugas;
create trigger roster_ke_penugasan
  after insert or update of atasan_id, pendaftaran_bencana_konfirmasi, red_flag_kinerja, rekomendasi_pml
  on bencana_petugas
  for each row execute function public.trg_roster_ke_penugasan();

-- Selisih antara daftar lama dan penugasan PSP (kosong = sinkron). Penugasan adalah sumber kebenaran; roster lama hanya cermin.
create or replace view v_selisih_roster_penugasan with (security_invoker = true) as
select 'roster berperan, tanpa penugasan PSP aktif'::text as jenis,
       a.id as akun_id, bp.nama, bp.peran as peran_roster, null::text as peran_penugasan
  from bencana_petugas bp
  join sigap_akun a on a.petugas_bencana_id = bp.id
 where bp.peran is not null
   and not exists (select 1 from sigap_penugasan p where p.akun_id = a.id and p.kegiatan_id = 1 and p.aktif)
union all
select 'penugasan PSP aktif, roster tanpa peran',
       a.id, a.nama, bp.peran, p.peran
  from sigap_penugasan p
  join sigap_akun a on a.id = p.akun_id
  join bencana_petugas bp on bp.id = a.petugas_bencana_id
 where p.kegiatan_id = 1 and p.aktif and bp.peran is null
union all
select 'peran berbeda',
       a.id, a.nama, bp.peran, p.peran
  from sigap_penugasan p
  join sigap_akun a on a.id = p.akun_id
  join bencana_petugas bp on bp.id = a.petugas_bencana_id
 where p.kegiatan_id = 1 and p.aktif and bp.peran is not null and bp.peran <> p.peran
union all
select 'atasan berbeda',
       a.id, a.nama, bp.peran, p.peran
  from sigap_penugasan p
  join sigap_akun a on a.id = p.akun_id
  join bencana_petugas bp on bp.id = a.petugas_bencana_id
  left join sigap_akun aa on aa.petugas_bencana_id = bp.atasan_id
 where p.kegiatan_id = 1 and p.aktif and p.atasan_akun_id is distinct from aa.id;
revoke all on v_selisih_roster_penugasan from anon, authenticated;

commit;

-- ---------------------------------------------------------------- verifikasi
select 'pemicu terpasang (1)' as cek, count(*) as hasil from pg_trigger where tgname = 'roster_ke_penugasan' and not tgisinternal
union all select 'selisih roster vs penugasan (0)', count(*) from v_selisih_roster_penugasan;
