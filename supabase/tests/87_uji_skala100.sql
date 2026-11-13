-- supabase/tests/87_uji_skala100.sql
-- Uji fase D (Delego skala 100 membaca Master Poin beban kerja). Seluruhnya dibatalkan (rollback).
begin;

do $$
declare
  j_sus bigint; j_ser bigint; v jsonb; a bigint; d keu_dlg_delegasi; v_kat numeric; v_m numeric;
begin
  perform set_config('keu.via_fungsi', '1', true); -- penjaga tabel Delego: sisipan uji dianggap lewat fungsi
  -- 1. tanggal skala 100
  if keu_dlg_skala100_mulai() <> date '2026-11-16' then raise exception 'Tanggal skala 100 bukan 16 Nov 2026'; end if;

  -- 2. poin berlaku per survei: jenis pemeriksaan dokumen Susenas / Seruti (dari data awal C)
  select s.jenis_id into j_ser from keu_poin_sel s join keu_poin_survei v on v.id = s.survei_id
   where v.kode like 'seruti%' and s.poin_berlaku between 5.5 and 5.6 limit 1;
  if j_ser is null then raise exception 'Sel Seruti 5,56 poin tidak ditemukan'; end if;
  v := keu_poin_untuk(j_ser, 'Pemeriksaan dokumen Seruti Triwulan IV');
  if (v ->> 'poin')::numeric not between 5.5 and 5.6 then raise exception 'keu_poin_untuk Seruti salah: %', v; end if;
  raise notice 'Seruti: %', v;

  -- 3. teks tanpa survei cocok jatuh ke Umum atau katalog × 100/75
  v := keu_poin_untuk(j_ser, 'Rapat koordinasi kantor');
  if v is null or (v ->> 'poin')::numeric <= 0 then raise exception 'Cadangan Umum/katalog kosong: %', v; end if;
  raise notice 'Umum/katalog: %', v;

  -- 4. daftar pratinjau berisi semua jenis aktif
  if jsonb_array_length(keu_poin_untuk_daftar('Seruti')) <> (select count(*) from keu_dlg_jenis where aktif) then raise exception 'Daftar pratinjau tidak lengkap'; end if;

  -- 5. pemicu: delegasi mulai 16 Nov dengan salinan katalog -> diganti poin matriks, target ikut berskala
  select poin_per_satuan into v_kat from keu_dlg_jenis where id = j_ser;
  select id into a from sigap_akun order by id limit 1;
  insert into keu_dlg_delegasi(tahun, penerima_akun, peran_penerima, ro_kode, judul, satuan, target_total, target_harian, mulai, tenggat, jenis_id, poin_per_satuan, dibuat_oleh, diubah_oleh)
  values (2026, a, 'pegawai', 'TIM-KESRA', 'Pemeriksaan dokumen Seruti Triwulan IV', 'dokumen', 18 * v_kat, 18 * v_kat, date '2026-11-16', date '2026-11-16', j_ser, v_kat, a, a)
  returning * into d;
  v_m := (keu_poin_untuk(j_ser, 'Pemeriksaan dokumen Seruti Triwulan IV') ->> 'poin')::numeric;
  if d.poin_per_satuan <> v_m then raise exception 'Pemicu tidak mengganti poin: % vs %', d.poin_per_satuan, v_m; end if;
  if d.poin_katalog <> v_kat then raise exception 'poin_katalog tidak tersimpan'; end if;
  if abs(d.target_harian - 18 * v_m) > 0.05 then raise exception 'Target harian tidak berskala: %', d.target_harian; end if;
  raise notice 'Delegasi uji: pps % (katalog %), target harian %, sumber %', d.poin_per_satuan, d.poin_katalog, d.target_harian, d.poin_sumber;

  -- 6. delegasi mulai sebelum 16 Nov tidak disentuh
  insert into keu_dlg_delegasi(tahun, penerima_akun, peran_penerima, ro_kode, judul, satuan, target_total, target_harian, mulai, tenggat, jenis_id, poin_per_satuan, dibuat_oleh, diubah_oleh)
  values (2026, a, 'pegawai', 'TIM-KESRA', 'Pemeriksaan dokumen Seruti Triwulan IV', 'dokumen', 18 * v_kat, 18 * v_kat, date '2026-11-13', date '2026-11-13', j_ser, v_kat, a, a)
  returning * into d;
  if d.poin_per_satuan <> v_kat or d.poin_katalog is not null then raise exception 'Delegasi lama ikut diganti'; end if;

  -- 7. poin yang diisi sendiri tidak diganti
  insert into keu_dlg_delegasi(tahun, penerima_akun, peran_penerima, ro_kode, judul, satuan, target_total, target_harian, mulai, tenggat, jenis_id, poin_per_satuan, dibuat_oleh, diubah_oleh)
  values (2026, a, 'pegawai', 'TIM-KESRA', 'Pemeriksaan dokumen Seruti Triwulan IV', 'dokumen', 30, 30, date '2026-11-16', date '2026-11-16', j_ser, v_kat + 1, a, a)
  returning * into d;
  if d.poin_per_satuan <> v_kat + 1 or d.poin_sumber <> 'diisi' then raise exception 'Poin isian sendiri ikut diganti'; end if;

  raise notice 'Uji 87 lulus';
end $$;

rollback;
