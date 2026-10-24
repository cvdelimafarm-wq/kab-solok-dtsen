-- 20261025x_keu_rab_alasan_versi.sql
-- (25 Okt 2026, tahap 24) Alasan versi RAB (papan 1 mockup: "alasan versi wajib, minimal 10 karakter"). SUDAH DIJALANKAN di produksi lewat SQL editor.
--  * keu_rab.alasan_versi (null untuk versi lama; bila terisi minimal 10 karakter).
--  * keu_rab_baru_alasan(p_ro, p_dari, p_alasan, p_akun): fungsi BARU berdampingan. Bila p_dari diisi (versi baru dari RAB sebelumnya) alasan WAJIB
--    minimal 10 karakter; RAB pertama (p_dari kosong) boleh tanpa alasan dan diberi alasan bawaan.
--  * keu_rab_baru(p_ro, p_dari, p_akun) tetap ada sebagai pembungkus: p_dari kosong -> RAB pertama; p_dari diisi -> ditolak (wajib lewat keu_rab_baru_alasan).
--  * keu_jalankan: nama 'keu_rab_baru_alasan' ditambahkan ke daftar v_izin (hanya itu yang berubah; definisi lengkap ada di berkas fase-b sebelumnya).
--    Tanpa DROP supaya tidak memerlukan konfirmasi perubahan destruktif.
alter table keu_rab add column if not exists alasan_versi text;
alter table keu_rab add constraint keu_rab_alasan_versi_ck check (alasan_versi is null or char_length(btrim(alasan_versi)) >= 10);

create function keu_rab_baru_alasan(p_ro text, p_dari bigint default null, p_alasan text default null, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_pok bigint; v_no int; v_new bigint; it record; br record; v_item bigint; v_baris bigint; v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (keu_boleh(p_akun, 'rab', p_ro) or keu_boleh(p_akun, 'draf', p_ro)) then
    raise exception 'Akun % tidak berwenang menyusun RAB RO %', p_akun, p_ro using errcode = '42501';
  end if;
  if p_dari is not null and (v_alasan is null or char_length(v_alasan) < 10) then
    raise exception 'Alasan versi RAB wajib diisi, minimal 10 karakter' using errcode = '23514';
  end if;
  select id into v_pok from keu_pok_versi where status = 'berlaku' order by tahun desc limit 1;
  if v_pok is null then raise exception 'Belum ada versi POK berlaku' using errcode = '23514'; end if;
  if exists (select 1 from keu_rab where ro_kode = p_ro and status in ('draf','menunggu_ketua','menunggu_ppk','dikembalikan')) then
    raise exception 'RO % masih memiliki RAB dalam pengerjaan', p_ro using errcode = '23505';
  end if;
  select coalesce(max(nomor), 0) + 1 into v_no from keu_rab where ro_kode = p_ro;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_rab(ro_kode, pok_versi_id, nomor, dibuat_oleh, alasan_versi)
  values (p_ro, v_pok, v_no, p_akun, coalesce(v_alasan, case when p_dari is null then 'RAB pertama disusun dari POK berlaku' end)) returning id into v_new;
  perform set_config('keu.via_fungsi', '', true);
  if p_dari is not null then
    for it in select * from keu_rab_item where rab_id = p_dari order by id loop
      -- kunci yang tidak ada lagi pada POK baru: ikuti alias; bila tetap tidak ada, jadikan item baru
      insert into keu_rab_item(rab_id, pok_kunci, komponen_kode, akun_kode, akun_tujuan, uraian, satuan, prioritas_kode, selesai, catatan)
      values (v_new,
              case when it.pok_kunci is null then null
                   when exists (select 1 from keu_pok_detail d where d.versi_id = v_pok and d.kunci_stabil = keu_kunci_resolusi(it.pok_kunci)) then keu_kunci_resolusi(it.pok_kunci)
                   else null end,
              it.komponen_kode, it.akun_kode, it.akun_tujuan, it.uraian, it.satuan, it.prioritas_kode, it.selesai, it.catatan)
      returning id into v_item;
      for br in select * from keu_rab_baris where item_id = it.id order by urut, id loop
        insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan, jumlah_tetap, sama_dengan_item, catatan, tautan, periode, bulan_mulai, bulan_sampai, minggu, manual)
        values (v_item, br.urut, br.ket, br.volume, br.satuan, br.harga_satuan, br.jumlah_tetap, br.sama_dengan_item, br.catatan, br.tautan, br.periode, br.bulan_mulai, br.bulan_sampai, br.minggu, false)
        returning id into v_baris;
        if br.manual then
          perform set_config('keu.ratakan', '1', true);
          update keu_rab_jadwal j set nilai = o.nilai, minggu = o.minggu
            from keu_rab_jadwal o where o.baris_id = br.id and j.baris_id = v_baris and j.bulan = o.bulan;
          perform set_config('keu.ratakan', '', true);
          update keu_rab_baris set manual = true where id = v_baris;
        end if;
      end loop;
    end loop;
  end if;
  insert into keu_rab_riwayat(rab_id, aksi, dari, ke, oleh, catatan)
  values (v_new, 'buat', '-', 'draf', p_akun, case when p_dari is null then 'RAB baru' else 'Salinan dari RAB ' || p_dari || ': ' || v_alasan end);
  return v_new;
end $function$;

revoke all on function keu_rab_baru_alasan(text, bigint, text, bigint) from public, anon, authenticated;
grant execute on function keu_rab_baru_alasan(text, bigint, text, bigint) to service_role;

create or replace function keu_rab_baru(p_ro text, p_dari bigint default null, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_dari is not null then
    raise exception 'Versi baru dari RAB sebelumnya wajib beralasan; gunakan keu_rab_baru_alasan' using errcode = '23514';
  end if;
  return keu_rab_baru_alasan(p_ro, null, null, p_akun);
end $function$;
