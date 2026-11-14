-- skema-sql/20261114u_kewenangan_bendahara.sql
--
-- (14 Nov 2026) Putusan Ketua Tim: kewenangan Bendahara (BEND) diberikan kepada Alex Kandria, sesuai satu sumber pejabat (keu_pejabat).
-- Sama dengan PPK dan KPA (20261114t): BEND milik M. Iqbal Hadi tetap ada sebagai AKSES UJI sampai 31 Desember 2026. Tanpa hapus.

begin;

update keu_penugasan t
   set uji = true,
       berlaku_sampai = date '2026-12-31',
       ket = btrim(t.ket || ' | Akses uji 2026 (putusan Ketua Tim 14 Nov 2026); pejabat resmi di keu_pejabat')
 where t.dibatalkan_at is null and t.peran_kode = 'BEND' and t.ro_kode is null
   and t.akun_id = (select id from sigap_akun where aktif and nama ilike 'M. Iqbal Hadi%' order by id limit 1)
   and not t.uji;

insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai, berlaku_sampai, ket, uji)
select p.akun_id, 'BEND', null, p.berlaku_mulai, p.berlaku_sampai, 'Penetapan resmi sesuai keu_pejabat (putusan Ketua Tim 14 Nov 2026)', false
from keu_pejabat p
where p.dibatalkan_at is null and p.jabatan_kode = 'BEND' and p.akun_id is not null
  and p.masa @> (now() at time zone 'Asia/Jakarta')::date
  and not exists (select 1 from keu_penugasan t where t.akun_id = p.akun_id and t.peran_kode = 'BEND' and t.dibatalkan_at is null and not t.uji
                    and t.masa && p.masa);

commit;
