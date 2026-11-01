-- 20261101zc_keu_delego_sinkron.sql
-- Delego perangkum, tahap 2 (1 Nov 2026). Dijalankan SETELAH 20261101zb (yang sudah terpasang di produksi). Idempoten.
--   1. keu_dlg_sinkron: penghubung otomatis dari modul lain ke butir Delego (tanpa kerja dua kali):
--        - revisi anggaran (keu_revisi_usulan): status draf/dikembalikan -> butir "Menyusun revisi" untuk penyusun;
--          menunggu_ketua -> butir "Menyetujui revisi" untuk Ketua Tim RO itu
--        - dokumen administrasi (keu_adm_dok): status draf -> butir "Melengkapi dokumen" untuk pengubah terakhir
--        - pengadaan hasil identifikasi (keu_ident_pengadaan): status diajukan -> butir "Menindaklanjuti pengadaan" untuk Ketua Tim RO itu
--      Butir dibuat sekali (kunci sumber_jenis/sumber_id/sumber_varian) dan DITUTUP OTOMATIS (selesai) begitu sumbernya tidak lagi aktif.
--      Skor butir otomatis adalah angka bawaan (revisi 10, setuju revisi 4, dokumen 3, pengadaan 5 poin) yang bisa dikalibrasi lewat Katalog skor.
--   2. keu_dlg_kalibrasi: bahan kalibrasi skor (menit nyata per satuan dari laporan yang mengisi jam kerja nyata).
--   3. keu_dlg_atur_urusan: pemberi mengatur jenis urusan, kegiatan tertaut, dan cara tutup (tinjau/ringan) sebuah delegasi.

create or replace function keu_dlg_sinkron(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hari date := keu_dlg_hari_ini(); v_hk smallint[] := keu_dlg_hk(null); v_t date; v_n int := 0; v_dibuat int := 0; v_ditutup int := 0; k record; v_aktif int := 0;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) or keu_dlg_putus_ok(p_akun)) then
    raise exception 'Hanya pemberi delegasi tingkat tim atau Kepala yang menyinkronkan' using errcode = '42501';
  end if;
  v_t := v_hari;
  while keu_dlg_hitung_hk(v_hari, v_t, v_hk) < 2 and v_n < 14 loop v_t := v_t + 1; v_n := v_n + 1; end loop;

  create temp table if not exists tmp_dlg_sinkron (sj text, sid text, sv text, ro text, penerima bigint, judul text, uraian text, poin numeric) on commit drop;
  delete from tmp_dlg_sinkron;

  -- revisi anggaran: penyusun
  insert into tmp_dlg_sinkron
  select 'revisi', r.id::text, 'susun', r.ro_kode, coalesce(r.diajukan_oleh, r.dibuat_oleh), 'Menyusun revisi anggaran RO ' || r.ro_kode,
         'Revisi berstatus ' || r.status || '. Butir ini otomatis dari modul Revisi dan tertutup sendiri saat revisi diajukan.', 10
    from keu_revisi_usulan r where r.status in ('draf','dikembalikan') and r.ro_kode is not null;
  -- revisi anggaran: persetujuan Ketua Tim
  insert into tmp_dlg_sinkron
  select 'revisi', r.id::text, 'ketua_' || w, r.ro_kode, w, 'Menyetujui revisi anggaran RO ' || r.ro_kode,
         'Revisi menunggu persetujuan Ketua Tim. Butir otomatis dari modul Revisi.', 4
    from keu_revisi_usulan r cross join lateral keu_dlg_ketua_ro(r.ro_kode) w where r.status = 'menunggu_ketua' and r.ro_kode is not null;
  -- dokumen administrasi yang sedang disiapkan
  insert into tmp_dlg_sinkron
  select 'adm', d.id::text, 'lengkapi', d.ro_kode, d.diubah_oleh, 'Melengkapi dokumen administrasi ' || coalesce(nullif(d.kunci_stabil, ''), d.id::text),
         'Dokumen berstatus draf. Butir otomatis dari modul Administrasi dan tertutup sendiri saat berkas diunggah.', 3
    from keu_adm_dok d where d.status = 'draf' and d.ro_kode is not null and d.diubah_oleh is not null;
  -- pengadaan hasil identifikasi yang diajukan
  insert into tmp_dlg_sinkron
  select 'pengadaan', p.id::text, 'ketua_' || w, i.ro_kode, w, 'Menindaklanjuti pengadaan: ' || left(p.item, 120),
         'Pengadaan berstatus diajukan. Butir otomatis dari Identifikasi dan tertutup sendiri saat statusnya berubah.', 5
    from keu_ident_pengadaan p join keu_ident i on i.id = p.ident_id cross join lateral keu_dlg_ketua_ro(i.ro_kode) w
   where p.status = 'diajukan' and i.ro_kode is not null;

  -- hanya akun organik yang aktif
  delete from tmp_dlg_sinkron t where not exists (select 1 from sigap_akun a where a.id = t.penerima and a.aktif and a.jenis = 'organik');
  select count(*) into v_aktif from tmp_dlg_sinkron;

  perform set_config('keu.via_fungsi', '1', true);
  for k in select t.* from tmp_dlg_sinkron t
            where not exists (select 1 from keu_dlg_delegasi d where d.sumber_jenis = t.sj and d.sumber_id = t.sid and d.sumber_varian = t.sv)
  loop
    insert into keu_dlg_delegasi(tahun, ident_id, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot, hari_kerja, mulai, tenggat,
                                 status, dibuat_oleh, perlu_hasil, perlu_tinjau, kelas, kegiatan_id, mode_tutup, sumber_jenis, sumber_id, sumber_varian)
    values (extract(year from v_hari)::smallint, null, k.ro, k.judul, k.uraian, k.penerima, 'pegawai', '', 'paket', k.poin, round(k.poin / greatest(keu_dlg_hitung_hk(v_hari, v_t, v_hk), 1), 2), 1, v_hk, v_hari, v_t,
            'baru', p_akun, false, false, 'proses', null, 'sumber', k.sj, k.sid, k.sv);
    v_dibuat := v_dibuat + 1;
  end loop;
  -- tutup otomatis butir yang sumbernya sudah tidak aktif
  update keu_dlg_delegasi d set status = 'selesai', alasan = left(coalesce(nullif(d.alasan, ''), '') || ' Selesai otomatis: sumber di modul asal sudah berubah.', 500), diubah_at = now()
   where d.sumber_jenis in ('revisi','adm','pengadaan') and d.status in ('baru','berjalan')
     and not exists (select 1 from tmp_dlg_sinkron t where t.sj = d.sumber_jenis and t.sid = d.sumber_id and t.sv = d.sumber_varian);
  get diagnostics v_ditutup = row_count;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('dibuat', v_dibuat, 'ditutup', v_ditutup, 'sumber_aktif', v_aktif);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

create or replace function keu_dlg_kalibrasi(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) or coalesce(keu_boleh(p_akun, 'delegasi_lihat', null), false) or keu_dlg_putus_ok(p_akun)) then
    raise exception 'Akun % tidak berwenang melihat kalibrasi', p_akun using errcode = '42501';
  end if;
  select jsonb_build_object('hari_ini', keu_dlg_hari_ini(), 'jenis', coalesce(jsonb_agg(x.o order by x.nama), '[]'::jsonb)) into r
    from (
      select j.nama, jsonb_build_object('id', j.id, 'nama', j.nama, 'satuan', j.satuan, 'poin_per_satuan', j.poin_per_satuan, 'n', count(*),
               'menit', jsonb_agg(round(l.menit_nyata::numeric / l.jumlah, 1) order by l.tanggal desc, l.id desc)) as o
        from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id join keu_dlg_jenis j on j.id = d.jenis_id
       where l.menit_nyata is not null and l.jumlah is not null and l.jumlah > 0 and l.tinjau_status <> 'tidak_diakui'
       group by j.id, j.nama, j.satuan, j.poin_per_satuan
    ) x;
  return r;
end $$;

create or replace function keu_dlg_atur_urusan(p_id bigint, p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_kelas text; v_keg bigint; v_mode text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if not (coalesce(keu_boleh(p_akun, 'delegasi_beri', d.ro_kode), false) or keu_dlg_putus_ok(p_akun)) then
    raise exception 'Hanya pemberi delegasi RO ini yang mengatur jenis urusan' using errcode = '42501';
  end if;
  v_kelas := coalesce(nullif(p_data ->> 'kelas', ''), d.kelas);
  if v_kelas not in ('langsung','penunjang','proses','lapangan','perintah','rutin') then raise exception 'Kelas pekerjaan tidak dikenal' using errcode = '23514'; end if;
  v_mode := coalesce(nullif(p_data ->> 'mode_tutup', ''), d.mode_tutup);
  if v_mode not in ('tinjau','ringan') and v_mode is distinct from d.mode_tutup then raise exception 'Cara tutup harus tinjau atau ringan' using errcode = '23514'; end if;
  if p_data ? 'kegiatan_id' then
    v_keg := nullif(p_data ->> 'kegiatan_id', '')::bigint;
    if v_keg is not null then
      if not exists (select 1 from sigap_kegiatan k where k.id = v_keg and k.aktif) then raise exception 'Kegiatan % tidak ada atau tidak aktif', v_keg using errcode = '23514'; end if;
      if keu_dlg_ro_kegiatan(v_keg) is distinct from d.ro_kode then raise exception 'Kegiatan % tidak termasuk RO %', v_keg, d.ro_kode using errcode = '23514'; end if;
    end if;
  else
    v_keg := d.kegiatan_id;
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi set kelas = v_kelas, kegiatan_id = v_keg, mode_tutup = v_mode, diubah_at = now() where id = d.id;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', d.id, 'kelas', v_kelas, 'kegiatan_id', v_keg, 'mode_tutup', v_mode);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('keu_dlg_sinkron','keu_dlg_kalibrasi','keu_dlg_atur_urusan')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

do $$
declare d text; v_baru text := '''keu_dlg_sinkron'',''keu_dlg_kalibrasi'',''keu_dlg_atur_urusan'',';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_sinkron''' in d) = 0 then
    d := replace(d, '''keu_dlg_tinjau_bahan'',', '''keu_dlg_tinjau_bahan'',' || v_baru);
    if position('''keu_dlg_sinkron''' in d) = 0 then raise exception 'Penambahan izin gagal: jalankan 20261101zb dulu'; end if;
    execute d;
  end if;
end $$;
