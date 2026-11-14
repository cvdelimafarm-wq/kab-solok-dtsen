-- skema-sql/20261114l_dlg_mutu_tinjau.sql
--
-- (14 Nov 2026, Fase 4a "Mutu saat tinjau") Poin diakui = poin volume x faktor pengakuan.
--  * keu_dlg_mutu_setelan (satu baris): bobot faktor pengakuan (USUL 50/25/25: kualitas, kedisiplinan, ketepatan waktu),
--    nilai ketepatan bila laporan terlambat, dan ambang penanda kewajaran. PENGATURAN YANG DAPAT DIUBAH (menunggu putusan Iqbal).
--  * keu_dlg_laporan: kolom mutu_kualitas, mutu_disiplin (1-5, diisi peninjau), mutu_tepat (0-1, dari laporan terlambat), faktor_akui.
--  * keu_dlg_tinjau_mutu(): menyetujui laporan (lewat keu_dlg_tinjau) sekaligus mencatat mutu dan poin diakui.
--  * keu_dlg_mutu_atur(): mengubah setelan (hanya pemutus/Kepala).
--  * Pemicu keu_t6_mutu_ulang: laporan yang diubah dan kembali menunggu tinjau kehilangan nilai mutunya.
--  * keu_dlg_monitor: "dikoreksi Kepala" tidak lagi menghitung potongan mutu (faktor_akui terisi).
--  * keu_dlg_tinjau_bahan: antrean membawa `terlambat`; laporan saya membawa mutu; setelan mutu ikut dikirim.
-- Hanya menambah kolom/tabel/fungsi; dua fungsi lama diperbarui dengan penggantian teks yang diperiksa.

begin;

create table if not exists keu_dlg_mutu_setelan (
  id smallint primary key default 1 check (id = 1),
  w_kualitas smallint not null default 50 check (w_kualitas between 0 and 100),
  w_disiplin smallint not null default 25 check (w_disiplin between 0 and 100),
  w_tepat smallint not null default 25 check (w_tepat between 0 and 100),
  tepat_terlambat numeric not null default 0.5 check (tepat_terlambat between 0 and 1),
  ambang_jumlah_kali numeric not null default 2 check (ambang_jumlah_kali > 0),
  ambang_poin_laporan numeric not null default 150 check (ambang_poin_laporan > 0),
  ambang_kecepatan_kali numeric not null default 1.5 check (ambang_kecepatan_kali > 0),
  diubah_oleh bigint,
  diubah_at timestamptz not null default now(),
  constraint keu_dlg_mutu_setelan_jumlah check (w_kualitas + w_disiplin + w_tepat = 100)
);
insert into keu_dlg_mutu_setelan (id) values (1) on conflict (id) do nothing;
alter table keu_dlg_mutu_setelan enable row level security;
comment on table keu_dlg_mutu_setelan is '(14 Nov 2026, Fase 4a) Bobot faktor pengakuan dan ambang kewajaran. Nilai awal = usul; dapat diubah pemutus.';

alter table keu_dlg_laporan add column if not exists mutu_kualitas smallint check (mutu_kualitas between 1 and 5);
alter table keu_dlg_laporan add column if not exists mutu_disiplin smallint check (mutu_disiplin between 1 and 5);
alter table keu_dlg_laporan add column if not exists mutu_tepat numeric check (mutu_tepat between 0 and 1);
alter table keu_dlg_laporan add column if not exists faktor_akui numeric check (faktor_akui between 0 and 1);

-- Laporan yang isinya diubah lalu kembali menunggu tinjau: nilai mutu lama tidak berlaku.
create or replace function keu_dlg_mutu_ulang() returns trigger language plpgsql as $f$
begin
  if new.tinjau_status = 'menunggu' and old.tinjau_status is distinct from 'menunggu' or (new.poin_diakui is null and old.faktor_akui is not null and new.faktor_akui is not distinct from old.faktor_akui) then
    new.mutu_kualitas := null; new.mutu_disiplin := null; new.mutu_tepat := null; new.faktor_akui := null;
  end if;
  return new;
end $f$;
drop trigger if exists keu_t6_mutu_ulang on keu_dlg_laporan;
create trigger keu_t6_mutu_ulang before update on keu_dlg_laporan for each row execute function keu_dlg_mutu_ulang();

create or replace function keu_dlg_tinjau_mutu(p_laporan bigint, p_kualitas integer, p_disiplin integer, p_alasan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare s keu_dlg_mutu_setelan; l keu_dlg_laporan; v_tepat numeric; v_faktor numeric; v_poin numeric; v_alasan text := btrim(coalesce(p_alasan, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_kualitas is null or p_kualitas not between 1 and 5 then raise exception 'Nilai kualitas harus 1 sampai 5' using errcode = '23514'; end if;
  if p_disiplin is null or p_disiplin not between 1 and 5 then raise exception 'Nilai kedisiplinan harus 1 sampai 5' using errcode = '23514'; end if;
  if (p_kualitas < 3 or p_disiplin < 3) and char_length(v_alasan) < 5 then
    raise exception 'Nilai di bawah 3 wajib disertai alasan minimal 5 huruf' using errcode = '23514';
  end if;
  select * into s from keu_dlg_mutu_setelan where id = 1;
  -- keu_dlg_tinjau memeriksa hak, status menunggu, dan mencatat jejak tinjau
  perform keu_dlg_tinjau(p_laporan, 'setuju', v_alasan, '[]'::jsonb, p_akun);
  select * into l from keu_dlg_laporan where id = p_laporan;
  v_tepat := case when l.terlambat then s.tepat_terlambat else 1 end;
  v_faktor := round((s.w_kualitas * p_kualitas / 5.0 + s.w_disiplin * p_disiplin / 5.0 + s.w_tepat * v_tepat) / 100.0, 4);
  v_poin := round(coalesce(l.poin, 0) * v_faktor, 2);
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_laporan set mutu_kualitas = p_kualitas, mutu_disiplin = p_disiplin, mutu_tepat = v_tepat, faktor_akui = v_faktor, poin_diakui = v_poin where id = l.id;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('laporan', l.id, 'faktor', v_faktor, 'poin', l.poin, 'poin_diakui', v_poin, 'tepat', v_tepat);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $f$;
revoke execute on function keu_dlg_tinjau_mutu(bigint, integer, integer, text, bigint) from public, anon, authenticated;

create or replace function keu_dlg_mutu_atur(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare r keu_dlg_mutu_setelan;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_dlg_putus_ok(p_akun) then raise exception 'Hanya Kepala atau pemutus yang dapat mengubah setelan mutu' using errcode = '42501'; end if;
  update keu_dlg_mutu_setelan set
    w_kualitas = coalesce((p_data->>'w_kualitas')::smallint, w_kualitas),
    w_disiplin = coalesce((p_data->>'w_disiplin')::smallint, w_disiplin),
    w_tepat = coalesce((p_data->>'w_tepat')::smallint, w_tepat),
    tepat_terlambat = coalesce((p_data->>'tepat_terlambat')::numeric, tepat_terlambat),
    ambang_jumlah_kali = coalesce((p_data->>'ambang_jumlah_kali')::numeric, ambang_jumlah_kali),
    ambang_poin_laporan = coalesce((p_data->>'ambang_poin_laporan')::numeric, ambang_poin_laporan),
    ambang_kecepatan_kali = coalesce((p_data->>'ambang_kecepatan_kali')::numeric, ambang_kecepatan_kali),
    diubah_oleh = p_akun, diubah_at = now()
  where id = 1 returning * into r;
  return to_jsonb(r);
end $f$;
revoke execute on function keu_dlg_mutu_atur(jsonb, bigint) from public, anon, authenticated;

-- Monitoring Kepala: potongan mutu bukan koreksi Kepala
do $$
declare d text := pg_get_functiondef('keu_dlg_monitor'::regproc);
begin
  if position('lap.faktor_akui is null' in d) = 0 then
    d := replace(d, 'when lap.tinjau_status = ''disetujui'' and lap.poin_diakui is not null then lap.poin - lap.poin_diakui',
                    'when lap.tinjau_status = ''disetujui'' and lap.poin_diakui is not null and lap.faktor_akui is null then lap.poin - lap.poin_diakui');
    if position('lap.faktor_akui is null' in d) = 0 then raise exception 'keu_dlg_monitor tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

-- Bahan tinjau: terlambat di antrean, mutu di laporan saya, setelan mutu
do $$
declare d text := pg_get_functiondef('keu_dlg_tinjau_bahan'::regproc);
begin
  if position('''mutu_setelan''' in d) = 0 then
    d := replace(d, 'l.dikirim_at, l.tinjau_status, l.tinjau_alasan, l.mewakili,', 'l.dikirim_at, l.tinjau_status, l.tinjau_alasan, l.mewakili, l.terlambat,');
    d := replace(d, '''tinjau_alasan'', l.tinjau_alasan, ''poin_diakui'', l.poin_diakui)',
                    '''tinjau_alasan'', l.tinjau_alasan, ''poin_diakui'', l.poin_diakui, ''faktor_akui'', l.faktor_akui, ''mutu_kualitas'', l.mutu_kualitas, ''mutu_disiplin'', l.mutu_disiplin, ''mutu_tepat'', l.mutu_tepat)');
    d := replace(d, '''hari_ini'', v_hari, ''pemutus'', v_putus, ''beri'', v_beri,',
                    '''hari_ini'', v_hari, ''pemutus'', v_putus, ''beri'', v_beri, ''mutu_setelan'', (select to_jsonb(ms) - ''diubah_oleh'' from keu_dlg_mutu_setelan ms where ms.id = 1),');
    if position('l.mewakili, l.terlambat,' in d) = 0 or position('''faktor_akui'', l.faktor_akui' in d) = 0 or position('''mutu_setelan''' in d) = 0 then
      raise exception 'keu_dlg_tinjau_bahan tidak dikenali; migrasi dihentikan';
    end if;
    execute d;
  end if;
end $$;

-- Izin panggil lewat gerbang
do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_dlg_tinjau_mutu''' in d) = 0 then
    d := replace(d, '''keu_rujukan_terapkan_hari''];', '''keu_rujukan_terapkan_hari'',''keu_dlg_tinjau_mutu'',''keu_dlg_mutu_atur''];');
    if position('''keu_dlg_tinjau_mutu''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
