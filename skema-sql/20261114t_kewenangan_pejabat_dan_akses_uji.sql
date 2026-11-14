-- skema-sql/20261114t_kewenangan_pejabat_dan_akses_uji.sql
--
-- (14 Nov 2026) Putusan Ketua Tim: kewenangan PPK diberikan kepada Novriady dan kewenangan Kepala (KPA) kepada Bambang Suryanggono,
-- sesuai satu sumber pejabat (keu_pejabat). M. Iqbal Hadi TETAP memegang kewenangan PPK dan KPA yang serupa sebagai AKSES UJI sampai
-- 31 Desember 2026.
--
-- Aturan lama "satu PPK dan satu KPA pada satu masa" (penugasan_pejabat_tunggal) tetap berlaku untuk penugasan resmi; penugasan bertanda
-- uji tidak ikut dihitung, sehingga akses uji dapat berjalan bersamaan dengan pejabat resmi. Tidak ada baris yang dihapus.

begin;

alter table keu_penugasan add column if not exists uji boolean not null default false;
comment on column keu_penugasan.uji is 'Akses uji coba (bukan penetapan resmi): tidak dihitung dalam aturan satu PPK/KPA. Diberi batas berlaku_sampai.';

alter table keu_penugasan drop constraint if exists penugasan_pejabat_tunggal;
alter table keu_penugasan add constraint penugasan_pejabat_tunggal
  exclude using gist (peran_kode with =, masa with &&)
  where ((peran_kode = any (array['PPK'::text, 'KPA'::text])) and dibatalkan_at is null and not uji);

-- Akses uji Iqbal (PPK dan KPA): ditandai uji dan berakhir 31 Desember 2026.
update keu_penugasan t
   set uji = true,
       berlaku_sampai = date '2026-12-31',
       ket = btrim(t.ket || ' | Akses uji 2026 (putusan Ketua Tim 14 Nov 2026); pejabat resmi di keu_pejabat')
 where t.dibatalkan_at is null and t.peran_kode in ('PPK', 'KPA') and t.ro_kode is null
   and t.akun_id = (select id from sigap_akun where aktif and nama ilike 'M. Iqbal Hadi%' order by id limit 1)
   and not t.uji;

-- Kewenangan resmi mengikuti pejabat yang berlaku hari ini di keu_pejabat (PPK -> Novriady, KPA -> Bambang Suryanggono).
insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai, berlaku_sampai, ket, uji)
select p.akun_id, p.jabatan_kode, null, p.berlaku_mulai, p.berlaku_sampai, 'Penetapan resmi sesuai keu_pejabat (putusan Ketua Tim 14 Nov 2026)', false
from keu_pejabat p
where p.dibatalkan_at is null and p.jabatan_kode in ('PPK', 'KPA') and p.akun_id is not null
  and p.masa @> (now() at time zone 'Asia/Jakarta')::date
  and not exists (select 1 from keu_penugasan t where t.akun_id = p.akun_id and t.peran_kode = p.jabatan_kode and t.dibatalkan_at is null and not t.uji
                    and t.masa && p.masa);

commit;
