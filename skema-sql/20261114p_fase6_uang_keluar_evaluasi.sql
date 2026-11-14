-- skema-sql/20261114p_fase6_uang_keluar_evaluasi.sql
--
-- (14 Nov 2026, Fase 6 "Uang keluar dan evaluasi")
--  6a keu_ident_spk_sekaligus(): SPK semua mitra yang siap terbit sekali jalan. Nomor dari register Arsip `spk` (atomik, idempoten per dokumen),
--     terbit lewat keu_ident_dokumen_simpan (hak, syarat lanjutan Final, penandatangan tetap diperiksa di sana). p_uji = true hanya menampilkan.
--  6b keu_daftar_bayar(): daftar bayar dari hari kerja yang SAH per kegiatan tertaut (hari lampau, laporan + foto sesuai aturan kegiatan,
--     dibatasi maks_hari) x tarif kegiatan per peran. Penilai hari sama dengan lib/sigap.ts hariLengkap (Administrasi translok).
--  6c keu_pembayaran_cocok_bahan() / keu_pembayaran_tandai_cocok(): catatan pembayaran "dicatat" yang sudah tampak di unggahan realisasi SAKTI
--     (kunci POK sama, realisasi s.d. >= jumlah dicatat untuk kunci itu) disarankan "tercermin"; ditandai atas tindakan PJ Administrasi/PPK.
--  6d keu_ident_evaluasi + keu_ident_evaluasi_bahan() / _simpan(): tahap 8 evaluasi (rapor survei, pelajaran, kalibrasi).
--  6e keu_ident_salin(): salin identifikasi menjadi draf survei berikutnya (lewat keu_ident_buat, hak sama).
-- Hanya menambah. Tidak mengubah data keuangan yang sudah ada.

begin;

-- 6a ---------------------------------------------------------------------------------------------------------------------
create or replace function keu_ident_spk_sekaligus(p_ident bigint, p_tanggal date default null, p_ttd_akun bigint default null, p_ttd_jabatan text default '',
                                                   p_uji boolean default true, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare i keu_ident; l keu_ident_lanjutan; p jsonb; v_kode text; v_nama text; v_peran text; v_nomor text; v_aktor text; v_st text;
        r_siap jsonb := '[]'::jsonb; r_terbit jsonb := '[]'::jsonb; r_lewat jsonb := '[]'::jsonb; v_sudah int := 0;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not (keu_boleh(p_akun, 'ident_susun', i.ro_kode) or keu_ident_punya(p_akun, 'TU')) then
    raise exception 'Akun % tidak berwenang mengurus SPK identifikasi RO %', p_akun, i.ro_kode using errcode = '42501';
  end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id;
  if not found then raise exception 'Identifikasi lanjutan belum ada' using errcode = '23514'; end if;
  for p in select * from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) loop
    if coalesce(p ->> 'status', '') <> 'Mitra' then continue; end if;
    v_st := null;
    v_kode := coalesce(p ->> 'id', ''); v_nama := btrim(coalesce(p ->> 'nama', '')); v_peran := coalesce(p ->> 'peran', '');
    select status into v_st from keu_ident_dokumen where ident_id = i.id and jenis = 'tugas' and kunci = v_kode;
    if v_st = 'terbit' then v_sudah := v_sudah + 1; continue; end if;
    if coalesce((p ->> 'menyusul')::boolean, false) or v_nama = '' then
      r_lewat := r_lewat || jsonb_build_object('kode', v_kode, 'nama', v_nama, 'alasan', 'Nama mitra belum diisi'); continue;
    end if;
    if v_peran = '' then r_lewat := r_lewat || jsonb_build_object('kode', v_kode, 'nama', v_nama, 'alasan', 'Peran belum dipilih'); continue; end if;
    r_siap := r_siap || jsonb_build_object('kode', v_kode, 'nama', v_nama, 'peran', v_peran, 'konsep', v_st is not null);
  end loop;
  if p_uji then
    return jsonb_build_object('uji', true, 'status_lanjutan', l.status, 'siap', r_siap, 'lewat', r_lewat, 'sudah_terbit', v_sudah);
  end if;
  if l.status <> 'final' then raise exception 'SPK hanya dapat diterbitkan bila identifikasi lanjutan Final (sekarang %)', l.status using errcode = '23514'; end if;
  if p_tanggal is null then raise exception 'Tanggal SPK wajib diisi' using errcode = '23514'; end if;
  if jsonb_array_length(r_siap) = 0 then raise exception 'Tidak ada SPK yang siap diterbitkan' using errcode = '23514'; end if;
  select nama into v_aktor from sigap_akun where id = p_akun;
  for p in select * from jsonb_array_elements(r_siap) loop
    v_nomor := (arsip_ambil_nomor('spk', null, p_tanggal, left('SPK ' || (p ->> 'nama') || ' (' || i.nama || ')', 300), null,
                                  'keu_ident_dokumen:' || i.id || ':tugas:' || (p ->> 'kode'), p_akun, v_aktor)) ->> 'nomor';
    perform keu_ident_dokumen_simpan(i.id, 'tugas', p ->> 'kode', 'terbit', v_nomor, p_tanggal, p_ttd_akun, p_ttd_jabatan, '', p_akun);
    r_terbit := r_terbit || jsonb_build_object('kode', p ->> 'kode', 'nama', p ->> 'nama', 'nomor', v_nomor);
  end loop;
  return jsonb_build_object('uji', false, 'terbit', r_terbit, 'lewat', r_lewat, 'sudah_terbit', v_sudah);
end $f$;
revoke execute on function keu_ident_spk_sekaligus(bigint, date, bigint, text, boolean, bigint) from public, anon, authenticated;

-- 6b ---------------------------------------------------------------------------------------------------------------------
create or replace function keu_daftar_bayar(p_ident bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare i keu_ident; v_hari date := (now() at time zone 'Asia/Jakarta')::date; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not exists (select 1 from sigap_akun where id = p_akun and aktif and jenis = 'organik') then raise exception 'Daftar bayar hanya untuk pegawai organik' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  with keg as (
    select t.kegiatan_id, t.fungsi, g.nama, coalesce(g.wajib_laporan, true) as wl,
           case when g.jumlah_foto between 1 and 10 then g.jumlah_foto else 5 end as jf
      from keu_ident_kegiatan t join sigap_kegiatan g on g.id = t.kegiatan_id
     where t.ident_id = i.id and t.dilepas_at is null
  ), pen as (
    select p.id, p.kegiatan_id, p.akun_id, p.peran, p.maks_hari, p.dikunci_at
      from sigap_penugasan p join keg on keg.kegiatan_id = p.kegiatan_id
     where p.aktif and (p.sumber is null or p.sumber <> 'administrasi')
  ), hari as (
    select h.penugasan_id, h.tanggal,
           exists (select 1 from sigap_realisasi x where x.penugasan_id = h.penugasan_id and x.tanggal = h.tanggal) as ada_lap,
           (select count(distinct d.slot) from sigap_dokumentasi d where d.penugasan_id = h.penugasan_id and d.tanggal = h.tanggal) as foto
      from sigap_hari_kerja h join pen on pen.id = h.penugasan_id
     where h.uji_coba_sampai is null or h.uji_coba_sampai > now()
  ), baris as (
    select pen.id as penugasan_id, pen.kegiatan_id, pen.akun_id, pen.peran, pen.maks_hari, pen.dikunci_at is not null as terverifikasi,
           a.nama, a.jenis, coalesce(tf.tarif, 0)::numeric as tarif,
           count(hr.tanggal)::int as n_hari,
           count(hr.tanggal) filter (where hr.tanggal < v_hari)::int as n_lampau,
           count(hr.tanggal) filter (where hr.tanggal < v_hari and (not keg.wl or hr.ada_lap) and hr.foto >= keg.jf)::int as n_sah
      from pen join keg on keg.kegiatan_id = pen.kegiatan_id
      left join hari hr on hr.penugasan_id = pen.id
      left join sigap_akun a on a.id = pen.akun_id
      left join sigap_kegiatan_tarif tf on tf.kegiatan_id = pen.kegiatan_id and tf.peran = pen.peran
     group by pen.id, pen.kegiatan_id, pen.akun_id, pen.peran, pen.maks_hari, pen.dikunci_at, a.nama, a.jenis, tf.tarif
  ), hitung as (
    select b.*, least(b.n_sah, coalesce(b.maks_hari, b.n_sah)) as n_dibayar,
           least(b.n_hari, coalesce(b.maks_hari, b.n_hari)) as n_rencana
      from baris b
  )
  select jsonb_build_object(
    'hari_ini', v_hari, 'ident_id', i.id, 'ro_kode', i.ro_kode,
    'kegiatan', coalesce((select jsonb_agg(jsonb_build_object(
        'kegiatan_id', k.kegiatan_id, 'nama', k.nama, 'fungsi', k.fungsi, 'wajib_laporan', k.wl, 'jumlah_foto', k.jf,
        'baris', coalesce((select jsonb_agg(jsonb_build_object('penugasan_id', h.penugasan_id, 'akun_id', h.akun_id, 'nama', h.nama, 'jenis', h.jenis, 'peran', h.peran,
                    'maks_hari', h.maks_hari, 'n_hari', h.n_hari, 'n_lampau', h.n_lampau, 'n_sah', h.n_sah, 'n_dibayar', h.n_dibayar, 'n_rencana', h.n_rencana,
                    'tarif', h.tarif, 'nominal', h.n_dibayar * h.tarif, 'nominal_rencana', h.n_rencana * h.tarif, 'terverifikasi', h.terverifikasi) order by h.peran, h.nama)
                   from hitung h where h.kegiatan_id = k.kegiatan_id), '[]'::jsonb),
        'total', (select coalesce(sum(h.n_dibayar * h.tarif), 0) from hitung h where h.kegiatan_id = k.kegiatan_id),
        'total_rencana', (select coalesce(sum(h.n_rencana * h.tarif), 0) from hitung h where h.kegiatan_id = k.kegiatan_id),
        'tanpa_tarif', (select count(*) from hitung h where h.kegiatan_id = k.kegiatan_id and h.tarif = 0)
      ) order by k.fungsi, k.kegiatan_id) from keg k), '[]'::jsonb),
    'dicatat_ro', (select coalesce(sum(b.jumlah), 0) from keu_pembayaran b where b.ro_kode = i.ro_kode and b.jenis = 'bayar' and b.dibatalkan_at is null)
  ) into r;
  return r;
end $f$;
revoke execute on function keu_daftar_bayar(bigint, bigint) from public, anon, authenticated;

-- 6c ---------------------------------------------------------------------------------------------------------------------
create or replace function keu_pembayaran_cocok_bahan(p_ro text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with c as (
    select b.id, b.pok_kunci, b.jumlah, b.tanggal, b.nomor_ref,
           sum(b.jumlah) over (partition by b.pok_kunci) as dicatat_kunci,
           (select max(v.real_sd) from keu_v_realisasi_item_sekarang v where v.ro_kode = b.ro_kode and v.kunci_stabil = b.pok_kunci) as real_sd,
           (select max(v.sampai_tanggal) from keu_v_realisasi_item_sekarang v where v.ro_kode = b.ro_kode and v.kunci_stabil = b.pok_kunci) as sampai
      from keu_pembayaran b
     where b.ro_kode = p_ro and b.jenis = 'bayar' and b.dibatalkan_at is null and b.status = 'dicatat' and b.pok_kunci is not null
  )
  select jsonb_build_object('boleh', coalesce(keu_boleh(p_akun, 'bayar_catat', p_ro), false),
    'baris', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'pok_kunci', c.pok_kunci, 'jumlah', c.jumlah, 'tanggal', c.tanggal, 'nomor_ref', c.nomor_ref,
              'dicatat_kunci', c.dicatat_kunci, 'real_sd', c.real_sd, 'sampai', c.sampai, 'cocok', coalesce(c.real_sd >= c.dicatat_kunci, false)) order by c.tanggal), '[]'::jsonb))
    into r from c;
  return r;
end $f$;
revoke execute on function keu_pembayaran_cocok_bahan(text, bigint) from public, anon, authenticated;

create or replace function keu_pembayaran_tandai_cocok(p_ro text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_ids bigint[]; v_n int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'bayar_catat', p_ro), false) then raise exception 'Hanya PJ Administrasi atau PPK yang dapat menandai pembayaran' using errcode = '42501'; end if;
  select array_agg((x ->> 'id')::bigint) into v_ids from jsonb_array_elements(keu_pembayaran_cocok_bahan(p_ro, p_akun) -> 'baris') x where (x ->> 'cocok')::boolean;
  if v_ids is null then return jsonb_build_object('ditandai', 0); end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_pembayaran set status = 'tercermin', tercermin_oleh = p_akun, tercermin_at = now() where id = any(v_ids) and status = 'dicatat';
  get diagnostics v_n = row_count;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('ditandai', v_n);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $f$;
revoke execute on function keu_pembayaran_tandai_cocok(text, bigint) from public, anon, authenticated;

-- 6d ---------------------------------------------------------------------------------------------------------------------
create table if not exists keu_ident_evaluasi (
  ident_id bigint primary key references keu_ident(id) on delete cascade,
  pelajaran text not null default '',
  kalibrasi text not null default '',
  tindak_lanjut text not null default '',
  disimpan_oleh bigint,
  disimpan_at timestamptz not null default now()
);
alter table keu_ident_evaluasi enable row level security;
comment on table keu_ident_evaluasi is '(14 Nov 2026, Fase 6) Tahap 8 evaluasi survei: pelajaran, kalibrasi (standar/poin/hari), tindak lanjut untuk survei berikutnya.';

create or replace function keu_ident_evaluasi_simpan(p_ident bigint, p_pelajaran text, p_kalibrasi text, p_tindak_lanjut text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare i keu_ident;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not (keu_boleh(p_akun, 'ident_susun', i.ro_kode) or keu_dlg_putus_ok(p_akun)) then raise exception 'Hanya ketua tim RO ini atau Kepala yang dapat menyimpan evaluasi' using errcode = '42501'; end if;
  insert into keu_ident_evaluasi (ident_id, pelajaran, kalibrasi, tindak_lanjut, disimpan_oleh, disimpan_at)
  values (i.id, left(btrim(coalesce(p_pelajaran, '')), 4000), left(btrim(coalesce(p_kalibrasi, '')), 4000), left(btrim(coalesce(p_tindak_lanjut, '')), 4000), p_akun, now())
  on conflict (ident_id) do update set pelajaran = excluded.pelajaran, kalibrasi = excluded.kalibrasi, tindak_lanjut = excluded.tindak_lanjut,
                                       disimpan_oleh = excluded.disimpan_oleh, disimpan_at = excluded.disimpan_at;
  return jsonb_build_object('ok', true);
end $f$;
revoke execute on function keu_ident_evaluasi_simpan(bigint, text, text, text, bigint) from public, anon, authenticated;

create or replace function keu_ident_evaluasi_bahan(p_ident bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare i keu_ident; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not exists (select 1 from sigap_akun where id = p_akun and aktif and jenis = 'organik') then raise exception 'Evaluasi hanya untuk pegawai organik' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  select jsonb_build_object(
    'ident', jsonb_build_object('id', i.id, 'nama', i.nama, 'ro_kode', i.ro_kode, 'tahun', i.tahun, 'status', i.status),
    'boleh_ubah', keu_boleh(p_akun, 'ident_susun', i.ro_kode) or keu_dlg_putus_ok(p_akun),
    'evaluasi', (select to_jsonb(e) || jsonb_build_object('disimpan_nama', a.nama) from keu_ident_evaluasi e left join sigap_akun a on a.id = e.disimpan_oleh where e.ident_id = i.id),
    'spk', jsonb_build_object(
      'mitra', (select count(*) from keu_ident_lanjutan l, jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) p where l.ident_id = i.id and p ->> 'status' = 'Mitra'),
      'terbit', (select count(*) from keu_ident_dokumen d where d.ident_id = i.id and d.jenis = 'tugas' and d.status = 'terbit'),
      'terbit_tanggal', (select coalesce(jsonb_agg(jsonb_build_object('kunci', d.kunci, 'tanggal', d.tanggal) order by d.kunci), '[]'::jsonb) from keu_ident_dokumen d where d.ident_id = i.id and d.jenis = 'tugas' and d.status = 'terbit')),
    'delego', (select jsonb_build_object(
        'butir', count(*), 'selesai', count(*) filter (where d.status = 'selesai'), 'batal', count(*) filter (where d.status = 'batal'),
        'berjalan', count(*) filter (where d.status in ('baru','berjalan')),
        'lewat_tenggat', (select count(*) from keu_dlg_eskalasi e join keu_dlg_delegasi x on x.id = e.delegasi_id where x.ident_id = i.id),
        'laporan', (select count(*) from keu_dlg_laporan l join keu_dlg_delegasi x on x.id = l.delegasi_id where x.ident_id = i.id),
        'poin', (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l join keu_dlg_delegasi x on x.id = l.delegasi_id where x.ident_id = i.id),
        'poin_diakui', (select coalesce(sum(case when l.tinjau_status = 'tidak_diakui' then 0 when l.tinjau_status = 'disetujui' then coalesce(l.poin_diakui, l.poin) else 0 end), 0)
                          from keu_dlg_laporan l join keu_dlg_delegasi x on x.id = l.delegasi_id where x.ident_id = i.id),
        'rata_faktor', (select round(avg(l.faktor_akui), 3) from keu_dlg_laporan l join keu_dlg_delegasi x on x.id = l.delegasi_id where x.ident_id = i.id and l.faktor_akui is not null))
      from keu_dlg_delegasi d where d.ident_id = i.id),
    'penilaian360', (select jsonb_build_object('n', count(*), 'penilai', count(distinct p.penilai_akun_id), 'dinilai', count(distinct p.dinilai_akun_id),
                       'rata', round(avg((p.kinerja + p.kedisiplinan + p.tim + p.kerjasama + p.komunikasi) / 5.0), 2))
                       from sigap_penilaian360 p join keu_ident_kegiatan t on t.kegiatan_id = p.kegiatan_id and t.ident_id = i.id and t.dilepas_at is null),
    'bayar', keu_daftar_bayar(i.id, p_akun)
  ) into r;
  return r;
end $f$;
revoke execute on function keu_ident_evaluasi_bahan(bigint, bigint) from public, anon, authenticated;

-- 6e ---------------------------------------------------------------------------------------------------------------------
create or replace function keu_ident_salin(p_ident bigint, p_nama text, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path to 'public' as $f$
declare i keu_ident; v_form jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  v_form := coalesce(i.form, '{}'::jsonb) || jsonb_build_object('nama', btrim(coalesce(p_nama, '')), 'salin_dari', i.id);
  return keu_ident_buat(i.ro_kode, v_form, p_akun);
end $f$;
revoke execute on function keu_ident_salin(bigint, text, bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_ident_spk_sekaligus''' in d) = 0 then
    d := replace(d, '''keu_dlg_pengingat_bahan''];', '''keu_dlg_pengingat_bahan'',''keu_ident_spk_sekaligus'',''keu_daftar_bayar'',''keu_pembayaran_cocok_bahan'',''keu_pembayaran_tandai_cocok'',''keu_ident_evaluasi_bahan'',''keu_ident_evaluasi_simpan'',''keu_ident_salin''];');
    if position('''keu_ident_spk_sekaligus''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
