-- Pecah kolom "Ada" pada panel "Ringkasan Hasil Identifikasi" (tab
-- Manajemen Target) jadi 3: Ada dari PPL / Ada dari Jorong (Jorong +
-- Tetangga digabung) / Ada dari keduanya.
--
-- Kolom identifikasi_ppl_role yg SUDAH ADA cuma nyimpen peran TERAKHIR
-- yg menulis (lihat komentar di app/api/penyisiran/identifikasi/route.ts)
-- -- kalau PPL isi "ada" dulu lalu Jorong ikut konfirmasi "ada" jg (nilai
-- SAMA, cuma re-konfirmasi), identifikasi_ppl_role ketimpa jd
-- "identifikasi_jorong" & jejak PPL hilang. Makanya perlu 2 kolom
-- terpisah yg TIDAK saling menimpa spt di bawah ini.

alter table public.penyisiran_usaha
  add column if not exists ada_konfirmasi_ppl boolean not null default false,
  add column if not exists ada_konfirmasi_jorong boolean not null default false;

-- Backfill data yg SUDAH berstatus 'ada' sblm kolom ini ada -- pakai
-- identifikasi_ppl_role (peran terakhir) sbg pendekatan terbaik yg
-- tersedia. coalesce(...,false) WAJIB krn identifikasi_ppl_role bisa NULL
-- (baris "ada" lama sblm kolom role ini ada) -- tanpa coalesce, hasil
-- perbandingan `null = 'x'` adalah NULL (bukan false) & melanggar
-- constraint NOT NULL kolom baru. CATATAN: backfill ini TIDAK BISA
-- merekonstruksi "keduanya" utk data lama (krn peran sebelumnya sdh
-- tertimpa) -- baris lama paling banter kebagian salah satu dari 2 flag,
-- bukan dua2nya. Mulai skrg (lewat endpoint PATCH yg diperbarui),
-- breakdown ini akan akurat.
update public.penyisiran_usaha
set
  ada_konfirmasi_ppl = coalesce(identifikasi_ppl_role = 'identifikasi_ppl', false),
  ada_konfirmasi_jorong = coalesce(identifikasi_ppl_role in ('identifikasi_jorong', 'identifikasi_tetangga'), false)
where identifikasi_ppl = 'ada';

-- RPC ringkasan: kolom "ada" tunggal dipecah jd ada_ppl/ada_jorong/
-- ada_keduanya (mutually exclusive, jumlah ketiganya = total yg 'ada').
-- Perlu DROP dulu krn Postgres tdk mengizinkan CREATE OR REPLACE FUNCTION
-- mengubah struktur kolom hasil (OUT parameters) fungsi yg sudah ada.
drop function if exists public.penyisiran_ringkasan_identifikasi(text);

create function public.penyisiran_ringkasan_identifikasi(p_level text)
returns table(
  kode text,
  nama text,
  ada_ppl bigint,
  ada_jorong bigint,
  ada_keduanya bigint,
  belum bigint,
  tidak_ada bigint,
  ragu bigint,
  total bigint
)
language sql
stable
as $function$
  select
    case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end as kode,
    case p_level
      when 'nagari' then max(nagari_nama)
      when 'subsls' then max(sls_nama) || '-' || max(subsls_kode)
      else max(kec_nama)
    end as nama,
    count(*) filter (
      where identifikasi_ppl = 'ada' and ada_konfirmasi_ppl and not ada_konfirmasi_jorong
    ) as ada_ppl,
    count(*) filter (
      where identifikasi_ppl = 'ada' and ada_konfirmasi_jorong and not ada_konfirmasi_ppl
    ) as ada_jorong,
    count(*) filter (
      where identifikasi_ppl = 'ada' and ada_konfirmasi_ppl and ada_konfirmasi_jorong
    ) as ada_keduanya,
    count(*) filter (where identifikasi_ppl = 'belum') as belum,
    count(*) filter (where identifikasi_ppl = 'tidak_ada') as tidak_ada,
    count(*) filter (where identifikasi_ppl = 'ragu') as ragu,
    count(*) as total
  from penyisiran_usaha
  where (case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end) is not null
    and (case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end) <> ''
  group by 1
  order by 2;
$function$;
