-- 18 Okt 2026 -- Status NON AKTIF (dibekukan/freeze) untuk Sub SLS -- permintaan user:
-- "non aktifkan/freeze seluruh sub sls di nagari Gantuang Ciri, berikan statusnya non aktif, sehingga PML tidak dapat mengajukan sub sls ini untuk pendataan/FASIH".
--
-- Yang dilakukan:
--  1. Kolom baru bencana_wilayah.nonaktif (+ alasan, waktu). Tidak ada data yang dihapus; alokasi, daftar KK, dan hasil pendataan tetap utuh.
--  2. Seluruh Sub SLS Nagari Gantuang Ciri (Kec. Kubung, desa 1303110005; 14 Sub SLS) ditandai non aktif.
--  3. Pemicu pada bencana_pendataan_permintaan: INSERT permintaan untuk Sub SLS non aktif ditolak dengan pesan SUB_NONAKTIF. Ini penjaga terakhir untuk SEMUA jalur
--     (kartu Plotting tim -> bencana_pendataan_minta_total, Kolam wilayah -> bencana_kolam_pilih, dan fungsi lama bencana_pendataan_minta).
--  4. bencana_kolam_progres: Sub SLS non aktif tidak dihitung sebagai target wilayah awal (syarat 70% Kolam wilayah).
--  5. Aplikasi (kartu Plotting tim) menampilkan lencana "Non aktif" dan menonaktifkan kotak pilih; API menolak lebih dulu dengan pesan yang jelas.
--
-- TIDAK diubah: permintaan yang SUDAH diajukan sebelum pembekuan (status menunggu/sudah_keluar) tetap berlaku; batalkan terpisah bila perlu.
-- Aman dijalankan ulang. Terapkan SEBELUM atau SESUDAH deploy kode: kode lama mengabaikan kolom baru; kode baru jatuh ke kolom lama bila kolom belum ada.

alter table public.bencana_wilayah
  add column if not exists nonaktif boolean not null default false,
  add column if not exists nonaktif_alasan text,
  add column if not exists nonaktif_at timestamptz;

create or replace function public.bencana_tolak_permintaan_nonaktif()
 returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.bencana_wilayah w where w.idsubsls = new.idsubsls and w.nonaktif) then
    raise exception 'SUB_NONAKTIF';
  end if;
  return new;
end;
$function$;

drop trigger if exists bencana_permintaan_tolak_nonaktif on public.bencana_pendataan_permintaan;
create trigger bencana_permintaan_tolak_nonaktif
  before insert on public.bencana_pendataan_permintaan
  for each row execute function public.bencana_tolak_permintaan_nonaktif();

-- Bekukan seluruh Sub SLS Nagari Gantuang Ciri (14 Sub SLS)
update public.bencana_wilayah
   set nonaktif = true,
       nonaktif_alasan = 'Nagari Gantuang Ciri dibekukan admin',
       nonaktif_at = now()
 where left(iddesa, 10) = '1303110005'
   and nagari = 'GANTUANG CIRI'
   and not nonaktif;

insert into public.sigap_audit (akun_id, aksi, detail, waktu)
select 354, 'wilayah.nonaktif', jsonb_build_object('nagari', 'GANTUANG CIRI', 'iddesa', '1303110005', 'jumlah_sub', count(*)), now()
  from public.bencana_wilayah
 where left(iddesa, 10) = '1303110005' and nonaktif;

-- 5. Sub SLS non aktif DIKELUARKAN dari target wilayah awal PML pada syarat Kolam wilayah (mis. "wilayah awal selesai > 70%"): permintaan user agar Gantuang Ciri
--    tidak mengganggu pengajuan Kolam wilayah. Hanya klausa "awal" yang berubah (menambah bencana_wilayah.nonaktif); bagian lain fungsi sama persis dengan 20261016c/e.
create or replace function public.bencana_kolam_progres(p_pml bigint)
 returns jsonb
 language sql stable security definer set search_path to 'public'
as $function$
  with kolam as (
    select p.idsubsls from public.bencana_pendataan_permintaan p
    where p.pml_id = p_pml and p.dari_kolam and p.status in ('menunggu','sudah_keluar')
  ), awal as (
    select distinct a.idsubsls from public.bencana_alokasi_subsls a
    where a.pml_id = p_pml and a.idsubsls not in (select idsubsls from kolam)
      and not exists (select 1 from public.bencana_wilayah w where w.idsubsls = a.idsubsls and w.nonaktif)
  )
  select jsonb_build_object(
    'awal_total',      (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.idsubsls in (select idsubsls from awal)),
    'awal_didata',     (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.hasil is not null and k.idsubsls in (select idsubsls from awal)),
    'tambahan_sub',    (select count(*) from kolam),
    'tambahan_total',  (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.idsubsls in (select idsubsls from kolam)),
    'tambahan_didata', (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.hasil is not null and k.idsubsls in (select idsubsls from kolam)),
    'izin_wilayah',    exists (select 1 from public.bencana_kolam_izin z where z.pml_id = p_pml and z.aktif)
  );
$function$;

-- Cara mengaktifkan kembali (jalankan manual bila keputusan berubah):
--   update public.bencana_wilayah set nonaktif = false, nonaktif_alasan = null, nonaktif_at = null where left(iddesa, 10) = '1303110005';
