-- skema-sql/20261113a_fase0_pembetulan_data.sql
--
-- (13 Nov 2026, Fase 0, prompt chat pembangunan 13 Nov) Pembetulan DATA saja; tidak mengubah skema, tidak menghapus apa pun.
-- Diuji kering (begin ... rollback) sebelum dijalankan: 2 baris keu_item_nomor, 1 baris keu_ident_kegiatan (+1 riwayat), 1 baris sigap_kegiatan.
--
-- 1. Realisasi RO 2906.BMA.006: daftar RO 84,4% vs ruang RO 57,7%. Dua item realisasi (nomor 000260 dan 000261, akun 521213 komponen 005) tidak
--    terpetakan ke item POK karena uraiannya berbeda sedikit ("... terintegrasi Susenas" vs "... terintegrasi"; awalan "Susenas honor ..."). Pagunya
--    persis sama dengan item POK 968 (Rp25.800.000) dan 969 (Rp87.040.000). Pemetaan ditambah dengan sumber 'manual'. Idempoten.
-- 5. Kegiatan 6 (pendataan Seruti TW IV) ditautkan ke identifikasi 7 lewat fungsi resminya (riwayat ikut tercatat), dan tanggal mulainya disamakan
--    dengan identifikasi yang sah: jadwal pendataan = tanggal 10 bulan ke-2 Triwulan IV = 10 Nov 2026 (form.jend mb=1, mn=10). Tanggal selesai tetap.

begin;

insert into keu_item_nomor(tahun, nomor_item, kunci_stabil, sumber)
select 2026, x.n, d.kunci_stabil, 'manual'
from (values ('000260', 968::bigint), ('000261', 969::bigint)) x(n, did)
join keu_pok_detail d on d.id = x.did
where not exists (select 1 from keu_item_nomor k where k.tahun = 2026 and k.nomor_item = x.n);

do $$
begin
  if not exists (select 1 from keu_ident_kegiatan where ident_id = 7 and kegiatan_id = 6 and dilepas_at is null) then
    perform keu_ident_kegiatan_tautkan(7, 6, 'pendataan', 'Pembetulan Fase 0 (13 Nov): pendataan Seruti TW IV dari identifikasi 7', 354);
  end if;
end $$;

update sigap_kegiatan
   set tanggal_mulai = date '2026-11-10',
       periode_diubah_oleh = 'Claude (Fase 0, atas perintah M. Iqbal Hadi): disamakan dengan identifikasi 7 yang sah',
       periode_diubah_at = now()
 where id = 6 and tanggal_mulai = date '2026-11-11';

commit;
