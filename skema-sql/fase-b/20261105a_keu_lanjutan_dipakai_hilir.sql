-- 20261105a — Versi Identifikasi lanjutan yang DIPAKAI MODUL HILIR ("Simpan saja" tidak lagi mengubah angka hilir).
--
-- Latar: setiap simpan lanjutan selalu menjadi isi terbaru, dan semua modul hilir (usulan penugasan, Delego, kebutuhan rekrutmen dan pengadaan,
-- pelaksanaan, gap, kelas pelatihan) membaca isi terbaru itu. Bila Revisi petugas atau kelas disimpan, angka hilir ikut berubah seketika.
-- Berkas ini menambah PENANDA di baris lanjutan: bila terisi, hilir membaca salinan penanda (versi, status, isi), bukan isi terbaru.
--   * kolom kosong (semua baris yang ada sekarang) = hilir mengikuti versi terbaru, perilaku lama tidak berubah;
--   * keu_lanjutan_simpan(..., p_terapkan => false) = "Simpan saja": versi baru tersimpan dan tercatat di riwayat, hilir tetap di versi sebelumnya
--     (bila sudah ada penanda, penanda lama dipertahankan sampai diterapkan);
--   * keu_lanjutan_simpan(..., p_terapkan => true, bawaan) = "Simpan dan terapkan": penanda dilepas, hilir mengikuti versi baru;
--   * keu_lanjutan_terapkan(p_ident) = menerapkan versi terbaru ke hilir tanpa mengubah isi (sesudah H-15 wajib beralasan dan masuk antrean keputusan KPA).
-- Riwayat tetap append-only (keu_ident_lanjutan_versi tidak disentuh). Halaman Identifikasi lanjutan tetap membaca isi terbaru.
-- Aman dijalankan ulang. JALANKAN SEBELUM menerapkan kode aplikasi yang membaca kolom baru.

-- 1. Kolom penanda ------------------------------------------------------------------------------------------------------------------------
alter table public.keu_ident_lanjutan
  add column if not exists ver_hilir integer,
  add column if not exists isi_hilir jsonb,
  add column if not exists status_hilir text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'keu_ident_lanjutan_hilir_check' and conrelid = 'public.keu_ident_lanjutan'::regclass) then
    alter table public.keu_ident_lanjutan add constraint keu_ident_lanjutan_hilir_check check (
      (ver_hilir is null and isi_hilir is null and status_hilir is null)
      or (ver_hilir is not null and isi_hilir is not null and status_hilir in ('draf', 'final') and ver_hilir >= 1 and ver_hilir < ver and jsonb_typeof(isi_hilir) = 'object')
    );
  end if;
end $$;

-- 2. Tampilan: pintu baca hilir mengikuti penanda; halaman lanjutan tetap membaca isi terbaru -------------------------------------------------
create or replace view public.keu_v_ident_lanjutan as
 select l.id, l.ident_id, l.tahun, l.ro_kode, l.ver, l.ident_ver, i.ver as ident_ver_sekarang, l.kebijakan_id, kb.ver as kebijakan_ver, l.isi, l.status, l.pasca_h15,
        l.dibuat_oleh, l.diubah_oleh, ak.nama as diubah_oleh_nama, l.dibuat_at, l.diubah_at,
        l.ver_hilir, l.status_hilir, l.isi_hilir
   from keu_ident_lanjutan l
   join keu_ident i on i.id = l.ident_id
   left join keu_kebijakan_lembar kb on kb.id = l.kebijakan_id
   left join sigap_akun ak on ak.id = l.diubah_oleh;

create or replace view public.keu_v_ident_petugas as
 select l.ident_id, l.tahun, l.ro_kode, coalesce(l.status_hilir, l.status) as status_lanjutan, coalesce(l.ver_hilir, l.ver) as lanjutan_ver,
        (p.ord)::integer as urut, (p.e ->> 'id'::text) as kode, (p.e ->> 'nama'::text) as nama, ((p.e ->> 'menyusul'::text))::boolean as menyusul,
        nullif((p.e ->> 'peran'::text), ''::text) as peran, (p.e ->> 'status'::text) as status, nullif((p.e ->> 'sumber'::text), ''::text) as sumber,
        ((p.e ->> 'baru'::text))::boolean as baru, (p.e -> 'jabatan'::text) as jabatan
   from keu_ident_lanjutan l
  cross join lateral jsonb_array_elements(coalesce((coalesce(l.isi_hilir, l.isi) -> 'petugas'::text), '[]'::jsonb)) with ordinality p(e, ord);

create or replace view public.keu_v_ident_acuan as
 select i.id as ident_id, i.tahun, i.ro_kode, i.nama, i.ver as ident_ver,
        (select v.form from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver) as form_sah,
        i.upd, (l.id is not null) as lanjutan_ada, coalesce(l.ver_hilir, l.ver) as lanjutan_ver, coalesce(l.status_hilir, l.status) as lanjutan_status, l.pasca_h15,
        coalesce(l.isi_hilir, l.isi) as lanjutan_isi, l.kebijakan_id, kb.ver as kebijakan_ver,
        case when l.id is null then 'awal'::text else 'lanjutan'::text end as sumber,
        l.ver as lanjutan_ver_terbaru
   from keu_ident i
   left join keu_ident_lanjutan l on l.ident_id = i.id
   left join keu_kebijakan_lembar kb on kb.id = l.kebijakan_id
  where i.ver >= 1 and i.status <> 'dibatalkan'::text;

-- 3. Simpan: p_terapkan (bawaan true = perilaku lama) ------------------------------------------------------------------------------------
drop function if exists public.keu_lanjutan_simpan(bigint, jsonb, text, timestamptz, bigint);

create or replace function public.keu_lanjutan_simpan(p_ident bigint, p_isi jsonb, p_alasan text default ''::text, p_diubah timestamptz default null, p_akun bigint default keu_akun_sesi(), p_terapkan boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i keu_ident; l keu_ident_lanjutan; g text[]; v_st text; v_sah jsonb; v_pasca boolean; v_keb bigint; v_cat text := btrim(coalesce(p_alasan, ''));
  v_hari date := (now() at time zone 'Asia/Jakarta')::date; v_mulai date; v_ver int; v_at timestamptz; v_ada boolean;
  v_terapkan boolean := coalesce(p_terapkan, true); v_pin_ver int; v_pin_isi jsonb; v_pin_st text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menyusun identifikasi lanjutan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan; lanjutan tidak dapat diubah' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan; lanjutan dapat diisi sesudah identifikasi awal disahkan' using errcode = '23514'; end if;
  g := keu_lanjutan_periksa(p_isi);
  if cardinality(g) > 0 then
    raise exception 'Isi lanjutan belum sah: %', array_to_string(g[1:5], '; ') || case when cardinality(g) > 5 then format(' (dan %s lainnya)', cardinality(g) - 5) else '' end using errcode = '23514';
  end if;
  v_st := keu_lanjutan_status(p_isi);
  select v.form into v_sah from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver;
  v_mulai := keu_ident_mulai_awal(v_sah, i.tahun::int);
  v_pasca := v_mulai is not null and v_hari >= v_mulai - 15;
  select b.lembar_id into v_keb from keu_v_kebijakan_berlaku b where b.tahun = i.tahun limit 1;
  select * into l from keu_ident_lanjutan where ident_id = i.id for update;
  v_ada := found;

  perform set_config('keu.via_fungsi', '1', true);
  if not v_ada then
    insert into keu_ident_lanjutan(ident_id, tahun, ro_kode, ver, ident_ver, kebijakan_id, isi, status, pasca_h15, dibuat_oleh, diubah_oleh)
      values (i.id, i.tahun, i.ro_kode, 1, i.ver, v_keb, p_isi, v_st, v_pasca, p_akun, p_akun) returning ver, diubah_at into v_ver, v_at;
    insert into keu_ident_lanjutan_versi(ident_id, ver, isi, status, ident_ver, kebijakan_id, pasca_h15, alasan, oleh) values (i.id, 1, p_isi, v_st, i.ver, v_keb, v_pasca, v_cat, p_akun);
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'lanjutan', null, v_st, i.ver, p_akun, 'Identifikasi lanjutan dibuat (versi 1, ' || v_st || ')');
  else
    if p_diubah is not null and p_diubah <> l.diubah_at then raise exception 'Isian sudah diubah orang lain; muat ulang halaman' using errcode = '40001'; end if;
    if l.isi = p_isi and l.ident_ver = i.ver and l.kebijakan_id is not distinct from v_keb then
      -- isi tidak berubah. "Simpan dan terapkan" tetap melepas penanda yang masih tertinggal.
      if v_terapkan and l.ver_hilir is not null then
        if v_pasca and char_length(v_cat) < 10 then
          raise exception 'Penerapan ke modul hilir sesudah H-15 wajib disertai alasan (minimal 10 huruf)' using errcode = '23514';
        end if;
        update keu_ident_lanjutan set ver_hilir = null, isi_hilir = null, status_hilir = null, diubah_oleh = p_akun where id = l.id returning diubah_at into v_at;
        insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'lanjutan', l.status, l.status, i.ver, p_akun,
          'Identifikasi lanjutan versi ' || l.ver || ' diterapkan ke modul hilir (sebelumnya hilir memakai versi ' || l.ver_hilir || ')' || case when v_cat <> '' then ': ' || v_cat else '' end);
        if v_pasca then
          insert into keu_pengecualian(ident_id, jenis, objek, alasan, lanjutan_ver, otomatis, diajukan_oleh)
            values (i.id, 'perubahan_h15', 'Penerapan versi ' || l.ver || ' ke modul hilir (sesudah H-15)', left(v_cat, 1000), l.ver, true, p_akun) on conflict do nothing;
        end if;
        perform set_config('keu.via_fungsi', '', true);
        return jsonb_build_object('ver', l.ver, 'status', l.status, 'pasca_h15', l.pasca_h15, 'diubah_at', v_at, 'berubah', true, 'ver_hilir', l.ver);
      end if;
      perform set_config('keu.via_fungsi', '', true);
      return jsonb_build_object('ver', l.ver, 'status', l.status, 'pasca_h15', l.pasca_h15, 'diubah_at', l.diubah_at, 'berubah', false, 'ver_hilir', coalesce(l.ver_hilir, l.ver));
    end if;
    if l.status = 'final' and v_pasca and l.isi is distinct from p_isi and char_length(v_cat) < 10 then
      raise exception 'Perubahan sesudah H-15 pada lanjutan Final wajib disertai alasan (minimal 10 huruf)' using errcode = '23514';
    end if;
    if v_terapkan and l.ver_hilir is not null and v_pasca and char_length(v_cat) < 10 then
      raise exception 'Penerapan ke modul hilir sesudah H-15 wajib disertai alasan (minimal 10 huruf)' using errcode = '23514';
    end if;
    if v_terapkan then
      v_pin_ver := null; v_pin_isi := null; v_pin_st := null;
    elsif l.ver_hilir is not null then
      v_pin_ver := l.ver_hilir; v_pin_isi := l.isi_hilir; v_pin_st := l.status_hilir;
    else
      v_pin_ver := l.ver; v_pin_isi := l.isi; v_pin_st := l.status;
    end if;
    update keu_ident_lanjutan set ver = l.ver + 1, ident_ver = i.ver, kebijakan_id = v_keb, isi = p_isi, status = v_st, pasca_h15 = v_pasca, diubah_oleh = p_akun,
           ver_hilir = v_pin_ver, isi_hilir = v_pin_isi, status_hilir = v_pin_st
      where id = l.id returning ver, diubah_at into v_ver, v_at;
    insert into keu_ident_lanjutan_versi(ident_id, ver, isi, status, ident_ver, kebijakan_id, pasca_h15, alasan, oleh) values (i.id, v_ver, p_isi, v_st, i.ver, v_keb, v_pasca, v_cat, p_akun);
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'lanjutan', l.status, v_st, i.ver, p_akun,
      'Identifikasi lanjutan versi ' || v_ver || ' (' || v_st || ')' || case when v_pasca then ', sesudah H-15' else '' end
      || case when v_pin_ver is not null then ', modul hilir tetap memakai versi ' || v_pin_ver else '' end || case when v_cat <> '' then ': ' || v_cat else '' end);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('ver', v_ver, 'status', v_st, 'pasca_h15', v_pasca, 'diubah_at', v_at, 'berubah', true, 'ver_hilir', coalesce(v_pin_ver, v_ver));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $function$;

revoke all on function public.keu_lanjutan_simpan(bigint, jsonb, text, timestamptz, bigint, boolean) from public, anon, authenticated;
grant execute on function public.keu_lanjutan_simpan(bigint, jsonb, text, timestamptz, bigint, boolean) to service_role;

-- 4. Terapkan versi terbaru ke hilir tanpa mengubah isi ---------------------------------------------------------------------------------
create or replace function public.keu_lanjutan_terapkan(p_ident bigint, p_alasan text default ''::text, p_akun bigint default keu_akun_sesi())
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i keu_ident; l keu_ident_lanjutan; v_sah jsonb; v_pasca boolean; v_mulai date; v_cat text := btrim(coalesce(p_alasan, '')); v_hari date := (now() at time zone 'Asia/Jakarta')::date; v_at timestamptz;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menyusun identifikasi lanjutan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan; lanjutan tidak dapat diubah' using errcode = '23514'; end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id for update;
  if not found then raise exception 'Identifikasi lanjutan belum disimpan' using errcode = '23514'; end if;
  if l.ver_hilir is null then
    return jsonb_build_object('ver', l.ver, 'status', l.status, 'pasca_h15', l.pasca_h15, 'diubah_at', l.diubah_at, 'berubah', false, 'ver_hilir', l.ver);
  end if;
  select v.form into v_sah from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver;
  v_mulai := keu_ident_mulai_awal(v_sah, i.tahun::int);
  v_pasca := v_mulai is not null and v_hari >= v_mulai - 15;
  if v_pasca and char_length(v_cat) < 10 then
    raise exception 'Penerapan ke modul hilir sesudah H-15 wajib disertai alasan (minimal 10 huruf)' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_ident_lanjutan set ver_hilir = null, isi_hilir = null, status_hilir = null, diubah_oleh = p_akun where id = l.id returning diubah_at into v_at;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'lanjutan', l.status, l.status, i.ver, p_akun,
    'Identifikasi lanjutan versi ' || l.ver || ' diterapkan ke modul hilir (sebelumnya hilir memakai versi ' || l.ver_hilir || ')' || case when v_cat <> '' then ': ' || v_cat else '' end);
  if v_pasca then
    insert into keu_pengecualian(ident_id, jenis, objek, alasan, lanjutan_ver, otomatis, diajukan_oleh)
      values (i.id, 'perubahan_h15', 'Penerapan versi ' || l.ver || ' ke modul hilir (sesudah H-15)', left(v_cat, 1000), l.ver, true, p_akun) on conflict do nothing;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('ver', l.ver, 'status', l.status, 'pasca_h15', l.pasca_h15, 'diubah_at', v_at, 'berubah', true, 'ver_hilir', l.ver);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $function$;

revoke all on function public.keu_lanjutan_terapkan(bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.keu_lanjutan_terapkan(bigint, text, bigint) to service_role;

-- 5. Pembaca hilir di basis data memakai versi yang ditandai (tambalan satu baris pada fungsi yang ada) -----------------------------------------
-- Tiap tambalan mengganti SATU potongan teks pada definisi fungsi saat ini lalu memasangnya kembali; bila potongan tidak ditemukan, berhenti dengan galat
-- (bukan diam-diam melewati). Sudah ditambal = dilewati, jadi aman diulang.
do $tambal$
declare
  r record; d text;
begin
  for r in
    select * from (values
      ('keu_usulan_penugasan', '_hilir',
       'select * into l from keu_ident_lanjutan where ident_id = i.id;',
       E'select * into l from keu_ident_lanjutan where ident_id = i.id;\r\n  if l.ver_hilir is not null then l.isi := l.isi_hilir; l.status := l.status_hilir; end if;'),
      ('keu_usulan_terapkan', '_hilir',
       'select * into l from keu_ident_lanjutan where ident_id = i.id;',
       E'select * into l from keu_ident_lanjutan where ident_id = i.id;\r\n  if l.ver_hilir is not null then l.isi := l.isi_hilir; l.status := l.status_hilir; end if;'),
      ('keu_dlg_calon', '_hilir',
       'from keu_ident_lanjutan l,',
       'from (select k.ident_id, coalesce(k.isi_hilir, k.isi) as isi, coalesce(k.status_hilir, k.status) as status from keu_ident_lanjutan k) l,'),
      ('keu_dlg_ketua_ro', '_hilir',
       'join keu_ident_lanjutan l on l.ident_id = i.id and l.status = ''final''',
       'join (select k.ident_id, coalesce(k.isi_hilir, k.isi) as isi, coalesce(k.status_hilir, k.status) as status from keu_ident_lanjutan k) l on l.ident_id = i.id and l.status = ''final'''),
      ('keu_dlg_hak', '_hilir',
       'exists (select 1 from keu_ident_lanjutan l where l.ident_id = i.id and l.status = ''final'')',
       'exists (select 1 from keu_ident_lanjutan l where l.ident_id = i.id and coalesce(l.status_hilir, l.status) = ''final'')'),
      ('keu_jalankan', 'keu_lanjutan_terapkan',
       '''keu_lanjutan_simpan'',',
       '''keu_lanjutan_simpan'',''keu_lanjutan_terapkan'','),
      ('keu_lanjutan_versi_notif', 'yang ditandai',
       'versi tetap dipakai modul hilir',
       'modul hilir memakai versi yang ditandai (lihat halaman lanjutan)')
    ) as t(fn, tanda, cari, ganti)
  loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn;
    if d is null then raise exception 'Fungsi % tidak ditemukan', r.fn; end if;
    if position(r.tanda in d) > 0 then continue; end if;
    if position(r.cari in d) = 0 then raise exception 'Potongan yang akan ditambal tidak ditemukan pada fungsi %', r.fn; end if;
    execute replace(d, r.cari, r.ganti);
  end loop;
end $tambal$;
