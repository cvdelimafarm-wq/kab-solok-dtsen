-- skema-sql/20261114n_dlg_inisiatif.sql
--
-- (14 Nov 2026, Fase 4c "Inisiatif") Usulan pekerjaan pegawai dapat ditandai sebagai INISIATIF: jenis, alasan, manfaat.
--  * keu_dlg_delegasi: inisiatif_jenis, inisiatif_alasan, inisiatif_manfaat; usulan_ingat_at (pengingat usulan menggantung).
--  * keu_dlg_usul_inisiatif_isi(): dipanggil keu_dlg_usul sesudah menyisipkan usulan (alasan dan manfaat minimal 10 huruf).
--  * keu_dlg_eskalasi_setelan.hk_usulan (usul 3): usulan yang belum dijawab lewat batas ini diingatkan ke Ketua Tim dan Kepala, sekali.
--  * keu_dlg_usulan_ingat(): cron hari kerja pukul 09.00 WIB.
--  * keu_dlg_inisiatif_rekap(): hitungan inisiatif per pegawai (diajukan, disetujui, ditolak, menunggu) untuk monitoring dan rapor.
--  * keu_dlg_tinjau_bahan: usulan membawa isian inisiatif.
-- Hanya menambah; keu_dlg_usul dan keu_dlg_tinjau_bahan diperbarui dengan penggantian teks yang diperiksa.

begin;

alter table keu_dlg_delegasi add column if not exists inisiatif_jenis text
  check (inisiatif_jenis in ('perbaikan_proses','ide_baru','bantu_rekan','di_luar_tugas','lainnya'));
alter table keu_dlg_delegasi add column if not exists inisiatif_alasan text;
alter table keu_dlg_delegasi add column if not exists inisiatif_manfaat text;
alter table keu_dlg_delegasi add column if not exists usulan_ingat_at timestamptz;

alter table keu_dlg_eskalasi_setelan add column if not exists hk_usulan smallint not null default 3 check (hk_usulan between 1 and 15);

do $$
declare d text := pg_get_functiondef('keu_dlg_eskalasi_atur'::regproc);
begin
  if position('hk_usulan' in d) = 0 then
    d := replace(d, 'kali_bina = coalesce((p_data->>''kali_bina'')::smallint, kali_bina),', 'kali_bina = coalesce((p_data->>''kali_bina'')::smallint, kali_bina),' || chr(10) || '    hk_usulan = coalesce((p_data->>''hk_usulan'')::smallint, hk_usulan),');
    if position('hk_usulan' in d) = 0 then raise exception 'keu_dlg_eskalasi_atur tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

create or replace function keu_dlg_usul_inisiatif_isi(p_id bigint, p_ini jsonb)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_jenis text; v_alasan text; v_manfaat text;
begin
  if p_ini is null or jsonb_typeof(p_ini) <> 'object' then return; end if;
  v_jenis := nullif(btrim(coalesce(p_ini->>'jenis', '')), '');
  if v_jenis is null then return; end if;
  if v_jenis not in ('perbaikan_proses','ide_baru','bantu_rekan','di_luar_tugas','lainnya') then raise exception 'Jenis inisiatif tidak dikenal' using errcode = '23514'; end if;
  v_alasan := btrim(coalesce(p_ini->>'alasan', ''));
  v_manfaat := btrim(coalesce(p_ini->>'manfaat', ''));
  if char_length(v_alasan) < 10 then raise exception 'Alasan inisiatif minimal 10 huruf' using errcode = '23514'; end if;
  if char_length(v_manfaat) < 10 then raise exception 'Manfaat inisiatif minimal 10 huruf' using errcode = '23514'; end if;
  update keu_dlg_delegasi set inisiatif_jenis = v_jenis, inisiatif_alasan = left(v_alasan, 500), inisiatif_manfaat = left(v_manfaat, 500) where id = p_id;
end $f$;
revoke execute on function keu_dlg_usul_inisiatif_isi(bigint, jsonb) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_dlg_usul'::regproc);
begin
  if position('keu_dlg_usul_inisiatif_isi' in d) = 0 then
    d := replace(d, 'returning id into v_id;', 'returning id into v_id;' || chr(10) || '  perform keu_dlg_usul_inisiatif_isi(v_id, p_data -> ''inisiatif'');');
    if position('keu_dlg_usul_inisiatif_isi' in d) = 0 then raise exception 'keu_dlg_usul tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

do $$
declare d text := pg_get_functiondef('keu_dlg_tinjau_bahan'::regproc);
begin
  if position('d.inisiatif_jenis' in d) = 0 then
    d := replace(d, 'd.kegiatan_id, d.kelas, d.skor_alasan, d.hari_kerja,', 'd.kegiatan_id, d.kelas, d.skor_alasan, d.hari_kerja, d.inisiatif_jenis, d.inisiatif_alasan, d.inisiatif_manfaat,');
    if position('d.inisiatif_jenis' in d) = 0 then raise exception 'keu_dlg_tinjau_bahan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

create or replace function keu_dlg_usulan_ingat(p_hari date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_hari date := coalesce(p_hari, keu_dlg_hari_ini()); s keu_dlg_eskalasi_setelan; d keu_dlg_delegasi; w bigint; v_n int := 0; v_nama text;
begin
  select * into s from keu_dlg_eskalasi_setelan where id = 1;
  if not s.aktif then return jsonb_build_object('aktif', false); end if;
  perform set_config('keu.via_fungsi', '1', true);
  for d in select * from keu_dlg_delegasi x where x.status = 'usulan' and x.usulan_ingat_at is null and x.usulan_at is not null
              and keu_dlg_hk_lewat((x.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) > s.hk_usulan loop
    select nama into v_nama from sigap_akun where id = d.usulan_oleh;
    for w in select distinct x from (select * from keu_dlg_ketua_ro(d.ro_kode) union select * from keu_dlg_pemutus()) t(x) loop
      perform keu_dlg_notif2(w, 'delegasi_usulan', 'Usulan menggantung: ' || d.judul,
        'Usulan ' || coalesce(v_nama, 'pegawai') || case when d.inisiatif_jenis is not null then ' (inisiatif)' else '' end
        || ' belum dijawab lebih dari ' || s.hk_usulan || ' hari kerja. Setujui atau tolak dengan alasan.', '/sigap/delego/tinjau', null);
    end loop;
    update keu_dlg_delegasi set usulan_ingat_at = now() where id = d.id;
    v_n := v_n + 1;
  end loop;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('diingatkan', v_n);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $f$;
revoke execute on function keu_dlg_usulan_ingat(date) from public, anon, authenticated;

create or replace function keu_dlg_inisiatif_rekap(p_dari date default null, p_sampai date default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_hari date := keu_dlg_hari_ini(); v_dari date; v_sampai date; v_putus boolean; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  v_dari := coalesce(p_dari, date_trunc('month', v_hari)::date);
  v_sampai := coalesce(p_sampai, v_hari);
  v_putus := keu_dlg_putus_ok(p_akun);
  with x as (
    select d.usulan_oleh as akun, a.nama, d.status, d.inisiatif_jenis
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.usulan_oleh
     where d.inisiatif_jenis is not null and (d.usulan_at at time zone 'Asia/Jakarta')::date between v_dari and v_sampai
       and (v_putus or d.usulan_oleh = p_akun or keu_dlg_beri(p_akun, d.ro_kode))
  )
  select jsonb_build_object('dari', v_dari, 'sampai', v_sampai,
    'pegawai', coalesce((select jsonb_agg(jsonb_build_object('akun', akun, 'nama', nama, 'diajukan', n, 'disetujui', ok, 'ditolak', tolak, 'menunggu', tunggu) order by ok desc, n desc, nama)
                           from (select akun, nama, count(*)::int n, count(*) filter (where status not in ('usulan','batal'))::int ok,
                                        count(*) filter (where status = 'batal')::int tolak, count(*) filter (where status = 'usulan')::int tunggu
                                   from x group by akun, nama) g), '[]'::jsonb),
    'per_jenis', coalesce((select jsonb_object_agg(inisiatif_jenis, n) from (select inisiatif_jenis, count(*)::int n from x group by inisiatif_jenis) j), '{}'::jsonb)
  ) into r;
  return r;
end $f$;
revoke execute on function keu_dlg_inisiatif_rekap(date, date, bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_dlg_inisiatif_rekap''' in d) = 0 then
    d := replace(d, '''keu_dlg_eskalasi_atur''];', '''keu_dlg_eskalasi_atur'',''keu_dlg_inisiatif_rekap''];');
    if position('''keu_dlg_inisiatif_rekap''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;

-- Jadwal (di luar transaksi): hari kerja pukul 09.00 WIB (02.00 UTC)
select cron.schedule('delego-usulan-0900', '0 2 * * 1-5', 'select public.keu_dlg_usulan_ingat()');
