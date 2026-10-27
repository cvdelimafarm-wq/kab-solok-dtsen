-- =====================================================================
-- 68_uji_masukan.sql - uji tabel sigap_masukan. Jalankan SETELAH 20261028a, dalam satu transaksi; diakhiri galat sengaja sehingga SEMUA dibatalkan
-- (hasil uji dibawa dalam pesan galat "HASIL_UJI: {...}"). Tidak ada data tersimpan.
-- Harapan: tabel_ada=true, rls=true, anon_boleh=false, service_boleh=true, sisip_sah=true, tolak_jenis/tolak_isi_pendek/tolak_isi_panjang/tolak_status berisi pesan galat,
--          status_bawaan='baru'.
-- =====================================================================
do $uji$
declare
  h jsonb := '{}'::jsonb; v_akun bigint; v_id bigint;
begin
  h := h || jsonb_build_object('tabel_ada', to_regclass('public.sigap_masukan') is not null,
                               'rls', (select relrowsecurity from pg_class where oid = 'public.sigap_masukan'::regclass),
                               'anon_boleh', has_table_privilege('anon', 'public.sigap_masukan', 'select'),
                               'authenticated_boleh', has_table_privilege('authenticated', 'public.sigap_masukan', 'select'),
                               'service_boleh', has_table_privilege('service_role', 'public.sigap_masukan', 'insert'));
  select id into v_akun from public.sigap_akun order by id limit 1;
  insert into public.sigap_masukan (akun_id, jenis, isi, halaman) values (v_akun, 'saran', 'Contoh masukan uji', '/sigap/foto') returning id into v_id;
  h := h || jsonb_build_object('sisip_sah', v_id is not null, 'status_bawaan', (select status from public.sigap_masukan where id = v_id));
  begin insert into public.sigap_masukan (akun_id, jenis, isi) values (v_akun, 'lain', 'isi cukup panjang'); h := h || jsonb_build_object('tolak_jenis', false);
  exception when others then h := h || jsonb_build_object('tolak_jenis', sqlerrm); end;
  begin insert into public.sigap_masukan (akun_id, jenis, isi) values (v_akun, 'galat', 'abc'); h := h || jsonb_build_object('tolak_isi_pendek', false);
  exception when others then h := h || jsonb_build_object('tolak_isi_pendek', sqlerrm); end;
  begin insert into public.sigap_masukan (akun_id, jenis, isi) values (v_akun, 'galat', repeat('a', 2001)); h := h || jsonb_build_object('tolak_isi_panjang', false);
  exception when others then h := h || jsonb_build_object('tolak_isi_panjang', sqlerrm); end;
  begin update public.sigap_masukan set status = 'hilang' where id = v_id; h := h || jsonb_build_object('tolak_status', false);
  exception when others then h := h || jsonb_build_object('tolak_status', sqlerrm); end;
  raise exception 'HASIL_UJI: %', h::text;
end $uji$;
