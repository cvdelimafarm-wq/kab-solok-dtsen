-- 20261106e_satu_identitas_tahap2.sql
-- Satu identitas petugas, tahap 2: rumah baru bagi atribut yang selama ini hanya ada di daftar petugas lama
-- (bencana_petugas). Dijalankan Iqbal di SQL Editor Supabase, SETELAH 20261106d.
--
-- Putusan Iqbal (6 Nov 2026):
--   * nilai kinerja, red flag, dan rekomendasi PML melekat pada KEGIATAN, lalu diakumulasi sebagai riwayat;
--   * petugas ber-red flag ditandai di kegiatan mana pun, tetapi TIDAK menghalangi rekrut atau penugasan kembali;
--   * identitas = sigap_akun.id; penugasan hanya lewat sigap_penugasan.
--
-- Isi:
--   A. sigap_akun: kolom no_hp, sobat_id, email_fasih, alamat_nagari (diisi dari daftar lama, lalu master mitra untuk no_hp)
--   B. sigap_penugasan: kolom atasan_akun_id dan konfirmasi_pendaftaran (diisi untuk kegiatan 1 PSP)
--   C. tabel sigap_penilaian_flag (red flag dan rekomendasi PML per kolom penilaian = per kegiatan), diisi dari penanda lama
--   D. view v_kinerja_akun (akumulasi nilai dan penanda lintas kegiatan)
--   E. bersihkan peran dan atasan pada 16 bekas PPL nonaktif di daftar lama
-- Tidak ada baris yang dihapus. Kolom lama di bencana_petugas TIDAK disentuh (modul bencana lama masih memakainya sampai 20 Nov).
-- Nilai kinerja tidak dipindah: sigap_penilaian_mitra sudah menyimpannya per kolom, dan pemicu sigap_penilaian_turunkan
-- sudah menurunkan rata-ratanya ke daftar lama.

begin;

-- ---------------------------------------------------------------- pengaman
do $$
declare n int;
begin
  select count(*) into n from sigap_penugasan where kegiatan_id = 1 and aktif;
  if n <> 100 then raise exception 'Pengaman: penugasan PSP aktif % (seharusnya 100). Dibatalkan.', n; end if;

  select count(*) into n from bencana_petugas where peran is not null and aktif = false;
  if n <> 16 then raise exception 'Pengaman: bekas PPL nonaktif berperan % (seharusnya 16). Dibatalkan.', n; end if;

  select count(*) into n from sigap_penilaian_kolom where id = 1 and kode = 'SE2026';
  if n <> 1 then raise exception 'Pengaman: kolom penilaian SE2026 (id 1) tidak ditemukan. Dibatalkan.'; end if;
end $$;

-- ---------------------------------------------------------------- A. kolom baru di sigap_akun
alter table sigap_akun
  add column if not exists no_hp text,
  add column if not exists sobat_id text,
  add column if not exists email_fasih text,
  add column if not exists alamat_nagari text;

-- Sumber utama daftar lama (paling mutakhir, sebagian diperbaiki petugas sendiri saat mendaftar); no_hp cadangan dari master mitra.
update sigap_akun a
   set no_hp         = coalesce(nullif(btrim(a.no_hp), ''), s.hp_roster, s.hp_master),
       sobat_id      = coalesce(nullif(btrim(a.sobat_id), ''), s.sobat),
       email_fasih   = coalesce(nullif(btrim(a.email_fasih), ''), s.email),
       alamat_nagari = coalesce(nullif(btrim(a.alamat_nagari), ''), s.nagari)
  from (
    select x.id,
           nullif(btrim(bp.no_hp), '')         as hp_roster,
           nullif(btrim(m.no_telp), '')        as hp_master,
           nullif(btrim(bp.sobat_id), '')      as sobat,
           nullif(btrim(bp.email_fasih), '')   as email,
           nullif(btrim(bp.alamat_nagari), '') as nagari
      from sigap_akun x
      left join bencana_petugas bp on bp.id = x.petugas_bencana_id
      left join bencana_mitra   m  on m.id  = x.mitra_id
  ) s
 where s.id = a.id;

-- Data pribadi: hanya server (service role) yang boleh membaca.
-- (RLS sigap_akun sudah aktif; kolom baru ikut terlindungi.)

-- ---------------------------------------------------------------- B. sigap_penugasan: atasan dan konfirmasi
alter table sigap_penugasan
  add column if not exists atasan_akun_id bigint references sigap_akun(id),
  add column if not exists konfirmasi_pendaftaran boolean;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sigap_penugasan_atasan_bukan_diri') then
    alter table sigap_penugasan
      add constraint sigap_penugasan_atasan_bukan_diri check (atasan_akun_id is null or atasan_akun_id <> akun_id);
  end if;
end $$;

create index if not exists sigap_penugasan_atasan_idx on sigap_penugasan (kegiatan_id, atasan_akun_id) where atasan_akun_id is not null;

update sigap_penugasan p
   set atasan_akun_id         = aa.id,
       konfirmasi_pendaftaran = bp.pendaftaran_bencana_konfirmasi
  from sigap_akun a
  join bencana_petugas bp on bp.id = a.petugas_bencana_id
  left join sigap_akun aa on aa.petugas_bencana_id = bp.atasan_id
 where p.akun_id = a.id
   and p.kegiatan_id = 1
   and p.aktif;

-- ---------------------------------------------------------------- C. red flag dan rekomendasi PML per kegiatan
-- Satu baris = satu akun pada satu kolom penilaian (kolom = kegiatan). Red flag hanya penanda; tidak ada aturan yang memblokir.
create table if not exists sigap_penilaian_flag (
  akun_id         bigint      not null references sigap_akun(id),
  kolom_id        bigint      not null references sigap_penilaian_kolom(id),
  red_flag        boolean     not null default false,
  rekomendasi_pml boolean     not null default false,
  catatan         text,
  dinilai_oleh    bigint      references sigap_akun(id),
  diubah_at       timestamptz not null default now(),
  primary key (akun_id, kolom_id),
  constraint sigap_penilaian_flag_ada_penanda check (red_flag or rekomendasi_pml)
);
alter table sigap_penilaian_flag enable row level security;
revoke all on sigap_penilaian_flag from anon, authenticated;

-- Penanda lama (manual 3 Okt 2026) dicatat pada kolom SE2026, sumber nilai kinerja yang sama. Koreksi bila asalnya kegiatan lain.
insert into sigap_penilaian_flag (akun_id, kolom_id, red_flag, rekomendasi_pml, catatan)
select a.id, 1, coalesce(bp.red_flag_kinerja, false), coalesce(bp.rekomendasi_pml, false),
       'Dipindah dari daftar petugas lama (penanda manual 3 Okt 2026).'
  from bencana_petugas bp
  join sigap_akun a on a.petugas_bencana_id = bp.id
 where coalesce(bp.red_flag_kinerja, false) or coalesce(bp.rekomendasi_pml, false)
on conflict (akun_id, kolom_id) do nothing;

-- ---------------------------------------------------------------- D. akumulasi lintas kegiatan
create or replace view v_kinerja_akun with (security_invoker = true) as
select a.id as akun_id,
       n.jumlah_nilai,
       n.rata_nilai,
       coalesce(f.jumlah_red_flag, 0)          as jumlah_red_flag,
       coalesce(f.ada_red_flag, false)         as ada_red_flag,
       coalesce(f.jumlah_rekomendasi_pml, 0)   as jumlah_rekomendasi_pml,
       f.kegiatan_red_flag
  from sigap_akun a
  left join (
    select m.akun_id, count(m.nilai) as jumlah_nilai, round(avg(m.nilai)::numeric, 2) as rata_nilai
      from sigap_penilaian_mitra m
     group by m.akun_id
  ) n on n.akun_id = a.id
  left join (
    select pf.akun_id,
           count(*) filter (where pf.red_flag)         as jumlah_red_flag,
           bool_or(pf.red_flag)                        as ada_red_flag,
           count(*) filter (where pf.rekomendasi_pml)  as jumlah_rekomendasi_pml,
           string_agg(k.nama, ', ' order by k.urutan) filter (where pf.red_flag) as kegiatan_red_flag
      from sigap_penilaian_flag pf
      join sigap_penilaian_kolom k on k.id = pf.kolom_id
     group by pf.akun_id
  ) f on f.akun_id = a.id;
revoke all on v_kinerja_akun from anon, authenticated;

-- ---------------------------------------------------------------- E. bersihkan sisa peran bekas PPL nonaktif di daftar lama
-- Mereka sudah tidak aktif, tanpa alokasi dan tanpa realisasi, dan tidak memimpin siapa pun. Hanya peran dan atasan dikosongkan.
do $$
declare n int;
begin
  update bencana_petugas bp
     set peran = null, atasan_id = null
   where bp.aktif = false
     and bp.peran is not null
     and not exists (
       select 1 from sigap_akun a
         join sigap_penugasan p on p.akun_id = a.id and p.kegiatan_id = 1 and p.aktif
        where a.petugas_bencana_id = bp.id
     );
  get diagnostics n = row_count;
  if n <> 16 then raise exception 'Pengaman: yang dibersihkan % baris (seharusnya 16). Dibatalkan.', n; end if;
end $$;

commit;

-- ---------------------------------------------------------------- verifikasi (hasil yang diharapkan di kanan)
select 'akun aktif tanpa no_hp (<= 37)'                                   as cek, count(*) as hasil from sigap_akun where aktif and nullif(btrim(no_hp), '') is null
union all select 'akun terisi sobat_id (>= 77)',                              count(*) from sigap_akun where nullif(btrim(sobat_id), '') is not null
union all select 'penugasan PSP beratasan (84)',                              count(*) from sigap_penugasan where kegiatan_id = 1 and aktif and atasan_akun_id is not null
union all select 'penugasan PSP terkonfirmasi (84)',                          count(*) from sigap_penugasan where kegiatan_id = 1 and aktif and konfirmasi_pendaftaran is true
union all select 'PPL beratasan bukan PML (0)',                               count(*) from sigap_penugasan p join sigap_penugasan pa on pa.akun_id = p.atasan_akun_id and pa.kegiatan_id = 1 and pa.aktif where p.kegiatan_id = 1 and p.aktif and p.peran = 'ppl' and pa.peran <> 'pml'
union all select 'baris penanda di sigap_penilaian_flag',                     count(*) from sigap_penilaian_flag
union all select 'akun ber-red flag (12 dikurangi yang tak punya akun)',      count(*) from sigap_penilaian_flag where red_flag
union all select 'akun rekomendasi PML (35 dikurangi yang tak punya akun)',   count(*) from sigap_penilaian_flag where rekomendasi_pml
union all select 'penanda lama tanpa akun (0 bila semua tertaut)',            count(*) from bencana_petugas bp where (coalesce(bp.red_flag_kinerja, false) or coalesce(bp.rekomendasi_pml, false)) and not exists (select 1 from sigap_akun a where a.petugas_bencana_id = bp.id)
union all select 'bekas PPL nonaktif masih berperan (0)',                     count(*) from bencana_petugas where aktif = false and peran is not null
union all select 'roster berperan sekarang (96)',                             count(*) from bencana_petugas where peran is not null
union all select 'baris v_kinerja_akun (= akun, 792)',                        count(*) from v_kinerja_akun;
