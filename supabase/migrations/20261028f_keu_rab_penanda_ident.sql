-- =====================================================================
-- 20261028f_keu_rab_penanda_ident.sql
-- SIGAP - Penanda "RAB per survei": baris RAB boleh ditautkan ke satu rincian identifikasi sehingga tab RAB per survei dapat menyaringnya, menandai yang diubah
-- dari saran identifikasi, dan menawarkan penyesuaian saat identifikasi direvisi. Tidak ada tabel rincian ganda: rincian survei = baris keu_rab_baris yang sama
-- dengan RAB standar (hasilnya otomatis ada di RAB standar). Item baru untuk revisi POK memakai keu_rab_item.baru + akun_tujuan yang sudah ada.
--
-- Kolom baru pada keu_rab_baris (semua boleh kosong; baris lama tidak berubah):
--   ident_id    identifikasi sumber; ident_ver = versi identifikasi saat rincian disalin; ident_kunci = kunci rincian (akun|uraian[#n]);
--   ident_vol, ident_harga = volume dan harga SARAN identifikasi saat disalin (dasar penanda "diubah dari identifikasi" dan pembanding saat identifikasi direvisi).
-- Pemeriksa: ident_id dan ident_kunci terisi bersama atau kosong bersama.
-- Juga: keu_v_rab_baris memuat kolom baru (di akhir); keu_rab_baru_alasan menyalin penanda saat RAB versi baru dibuat dari RAB lama.
-- Bergantung pada 20261024n. Aman diulang. Tanpa DELETE/DROP. Tidak mengubah data. Kembaran TypeScript: lib/keu/rab.ts (IsianBaris, dataBaris). Uji: 73_uji_rab_penanda_ident.sql.
-- =====================================================================
alter table keu_rab_baris add column if not exists ident_id    bigint references keu_ident(id);
alter table keu_rab_baris add column if not exists ident_ver   integer check (ident_ver is null or ident_ver >= 1);
alter table keu_rab_baris add column if not exists ident_kunci text check (ident_kunci is null or char_length(ident_kunci) between 1 and 300);
alter table keu_rab_baris add column if not exists ident_vol   numeric check (ident_vol is null or ident_vol >= 0);
alter table keu_rab_baris add column if not exists ident_harga numeric check (ident_harga is null or ident_harga >= 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_rab_baris'::regclass and conname = 'keu_rab_baris_ident_serasi') then
    alter table keu_rab_baris add constraint keu_rab_baris_ident_serasi check ((ident_id is null) = (ident_kunci is null));
  end if;
end $$;
create index if not exists keu_rab_baris_ident_idx on keu_rab_baris(ident_id) where ident_id is not null;
comment on column keu_rab_baris.ident_id is 'Identifikasi sumber rincian ini (RAB per survei); kosong = baris RAB biasa.';
comment on column keu_rab_baris.ident_kunci is 'Kunci rincian identifikasi (akun|uraian[#n]) agar baris dapat dicocokkan kembali saat identifikasi direvisi.';

create or replace view keu_v_rab_baris with (security_invoker = true) as
select b.id as baris_id, b.item_id, i.rab_id, i.pok_kunci, b.urut, b.ket, b.volume, b.satuan, b.harga_satuan, b.jumlah,
       (b.jumlah_tetap is not null) as jumlah_dikunci, b.sama_dengan_item, b.catatan, b.tautan,
       b.periode, b.bulan_mulai, b.bulan_sampai, b.minggu, b.manual,
       b.ident_id, b.ident_ver, b.ident_kunci, b.ident_vol, b.ident_harga
from keu_rab_baris b
join keu_rab_item i on i.id = b.item_id;

-- penyalinan RAB versi baru ikut membawa penanda
do $$
declare d text; d0 text; n1 int; n2 int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_rab_baru_alasan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_rab_baru_alasan tidak ditemukan'; end if;
  if position('ident_kunci' in d) = 0 then
    n1 := (length(d) - length(replace(d, 'bulan_sampai, minggu, manual)', ''))) / length('bulan_sampai, minggu, manual)');
    n2 := (length(d) - length(replace(d, 'br.minggu, false)', ''))) / length('br.minggu, false)');
    if n1 <> 1 or n2 <> 1 then raise exception 'Penambalan gagal: pola penyalinan baris tidak dikenali (% dan % kecocokan)', n1, n2; end if;
    d0 := d;
    d := replace(d, 'bulan_sampai, minggu, manual)', 'bulan_sampai, minggu, manual, ident_id, ident_ver, ident_kunci, ident_vol, ident_harga)');
    d := replace(d, 'br.minggu, false)', 'br.minggu, false, br.ident_id, br.ident_ver, br.ident_kunci, br.ident_vol, br.ident_harga)');
    if d = d0 then raise exception 'Penambalan gagal'; end if;
    execute d;
  end if;
end $$;
