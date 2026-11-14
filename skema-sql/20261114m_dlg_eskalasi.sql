-- skema-sql/20261114m_dlg_eskalasi.sql
--
-- (14 Nov 2026, Fase 4b "Eskalasi berjawab") Butir Delego yang lewat tenggat dan belum tuntas:
--   1. penerima WAJIB MENJELASKAN dalam `jam_jelas` jam (usul 24);
--   2. push kedua ke penerima dan pemberi setelah `hk_push2` hari kerja (usul 1) bila belum dijelaskan;
--   3. pemberi/Ketua Tim WAJIB MENJAWAB paling lambat `hk_jawab` hari kerja (usul 2): perpanjang, alihkan, kurangi target, batalkan, atau tetap dengan bantuan;
--   4. yang belum dijawab sampai `hk_kepala` hari kerja sejak lewat tenggat (usul 3) NAIK KE KEPALA.
--   Sistem menyarankan, manusia memutuskan: tidak ada sanksi otomatis. Saran pembinaan bila `kali_bina` kali lewat tenggat dalam 30 hari (usul 3) hanya ditampilkan.
-- Objek baru: keu_dlg_eskalasi_setelan (PENGATURAN YANG DAPAT DIUBAH), keu_dlg_eskalasi, keu_dlg_eskalasi_jalan (cron 15 menit),
--   keu_dlg_eskalasi_jelaskan, keu_dlg_eskalasi_jawab, keu_dlg_eskalasi_bahan (baca), keu_dlg_eskalasi_atur.
-- Hanya menambah. Aksi jawaban memakai fungsi yang sudah ada (keu_dlg_ubah, keu_dlg_pindah) sehingga hak dan aturan lama tetap berlaku.

begin;

create table if not exists keu_dlg_eskalasi_setelan (
  id smallint primary key default 1 check (id = 1),
  aktif boolean not null default true,
  jam_jelas smallint not null default 24 check (jam_jelas between 1 and 168),
  hk_push2 smallint not null default 1 check (hk_push2 between 0 and 10),
  hk_jawab smallint not null default 2 check (hk_jawab between 1 and 10),
  hk_kepala smallint not null default 3 check (hk_kepala between 1 and 15),
  kali_bina smallint not null default 3 check (kali_bina between 1 and 20),
  jam_tenang_mulai smallint not null default 20 check (jam_tenang_mulai between 0 and 23),
  jam_tenang_selesai smallint not null default 7 check (jam_tenang_selesai between 0 and 23),
  diubah_oleh bigint,
  diubah_at timestamptz not null default now()
);
insert into keu_dlg_eskalasi_setelan (id) values (1) on conflict (id) do nothing;
alter table keu_dlg_eskalasi_setelan enable row level security;
comment on table keu_dlg_eskalasi_setelan is '(14 Nov 2026, Fase 4b) Batas waktu eskalasi dan jam tenang. Nilai awal = usul; dapat diubah pemutus.';

create table if not exists keu_dlg_eskalasi (
  id bigserial primary key,
  delegasi_id bigint not null references keu_dlg_delegasi(id) on delete cascade,
  penerima_akun bigint not null,
  tenggat date not null,
  mulai_at timestamptz not null default now(),
  batas_jelas_at timestamptz not null,
  penjelasan text,
  dijelaskan_at timestamptz,
  push2_at timestamptz,
  batas_jawab date,
  naik_kepala_at timestamptz,
  putusan text check (putusan in ('perpanjang','alihkan','kurangi','batalkan','tetap_bantuan')),
  catatan text,
  data jsonb,
  dijawab_oleh bigint,
  dijawab_at timestamptz,
  ditutup_at timestamptz,
  ditutup_karena text check (ditutup_karena in ('dijawab','tuntas','status')),
  status text not null default 'menunggu_penjelasan' check (status in ('menunggu_penjelasan','menunggu_jawaban','naik_kepala','selesai'))
);
create unique index if not exists keu_dlg_eskalasi_terbuka_uq on keu_dlg_eskalasi (delegasi_id) where ditutup_at is null;
create index if not exists keu_dlg_eskalasi_penerima_ix on keu_dlg_eskalasi (penerima_akun, mulai_at desc);
alter table keu_dlg_eskalasi enable row level security;
comment on table keu_dlg_eskalasi is '(14 Nov 2026, Fase 4b) Butir lewat tenggat: penjelasan penerima, jawaban pimpinan, naik ke Kepala.';

-- Jam tenang WIB: push tidak dikirim di antara jam_tenang_mulai dan jam_tenang_selesai (dicatat, dikirim pada putaran berikutnya)
create or replace function keu_dlg_jam_tenang(p_now timestamptz default now()) returns boolean
language sql stable security definer set search_path to 'public' as $f$
  select case when s.jam_tenang_mulai = s.jam_tenang_selesai then false
              when s.jam_tenang_mulai > s.jam_tenang_selesai
                then extract(hour from p_now at time zone 'Asia/Jakarta') >= s.jam_tenang_mulai or extract(hour from p_now at time zone 'Asia/Jakarta') < s.jam_tenang_selesai
              else extract(hour from p_now at time zone 'Asia/Jakarta') >= s.jam_tenang_mulai and extract(hour from p_now at time zone 'Asia/Jakarta') < s.jam_tenang_selesai end
    from keu_dlg_eskalasi_setelan s where s.id = 1
$f$;

create or replace function keu_dlg_eskalasi_jalan(p_sekarang timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare
  v_now timestamptz := coalesce(p_sekarang, now()); v_hari date := (coalesce(p_sekarang, now()) at time zone 'Asia/Jakarta')::date;
  s keu_dlg_eskalasi_setelan; d keu_dlg_delegasi; e keu_dlg_eskalasi; w bigint;
  v_baru int := 0; v_push2 int := 0; v_jawab int := 0; v_kepala int := 0; v_tutup int := 0; v_tenang boolean;
begin
  select * into s from keu_dlg_eskalasi_setelan where id = 1;
  if not s.aktif then return jsonb_build_object('aktif', false); end if;
  v_tenang := keu_dlg_jam_tenang(v_now);

  -- 0. tutup yang sudah tidak relevan: delegasi selesai/batal/ditunda, tuntas, atau tenggat sudah dipindah ke depan
  for e in select x.* from keu_dlg_eskalasi x join keu_dlg_delegasi dd on dd.id = x.delegasi_id
            where x.ditutup_at is null and (dd.status not in ('baru','berjalan') or keu_dlg_tuntas(dd.id) or dd.tenggat >= v_hari) loop
    update keu_dlg_eskalasi set ditutup_at = v_now, status = 'selesai',
           ditutup_karena = case when keu_dlg_tuntas(e.delegasi_id) then 'tuntas' else 'status' end where id = e.id;
    v_tutup := v_tutup + 1;
  end loop;

  if v_tenang then return jsonb_build_object('tenang', true, 'tutup', v_tutup); end if;

  -- 1. butir baru lewat tenggat: buka eskalasi, minta penjelasan
  for d in select x.* from keu_dlg_delegasi x
            where x.status in ('baru','berjalan') and x.tenggat < v_hari and x.penerima_akun is not null and not keu_dlg_tuntas(x.id)
              and not exists (select 1 from keu_dlg_eskalasi y where y.delegasi_id = x.id and y.ditutup_at is null)
              and not exists (select 1 from keu_dlg_eskalasi y where y.delegasi_id = x.id and y.tenggat = x.tenggat) loop
    insert into keu_dlg_eskalasi (delegasi_id, penerima_akun, tenggat, mulai_at, batas_jelas_at)
    values (d.id, d.penerima_akun, d.tenggat, v_now, v_now + make_interval(hours => s.jam_jelas));
    perform keu_dlg_notif2(d.penerima_akun, 'delegasi_tenggat', 'Pekerjaan belum selesai: ' || d.judul,
      'Tenggat ' || to_char(d.tenggat, 'DD-MM-YYYY') || ' sudah lewat. Jelaskan kendalanya dalam ' || s.jam_jelas || ' jam agar Ketua Tim dapat menjawab.', '/sigap/delego/saya', null);
    v_baru := v_baru + 1;
  end loop;

  -- 2. push kedua bila belum dijelaskan setelah hk_push2 hari kerja
  for e in select * from keu_dlg_eskalasi where ditutup_at is null and dijelaskan_at is null and push2_at is null
              and keu_dlg_hk_lewat((mulai_at at time zone 'Asia/Jakarta')::date, v_hari) >= s.hk_push2 and s.hk_push2 > 0 loop
    select * into d from keu_dlg_delegasi where id = e.delegasi_id;
    perform keu_dlg_notif2(e.penerima_akun, 'delegasi_tenggat', 'Pengingat kedua: ' || d.judul, 'Penjelasan belum dikirim. Buka Delego dan jelaskan mengapa pekerjaan belum selesai.', '/sigap/delego/saya', null);
    if d.dibuat_oleh is not null and d.dibuat_oleh <> e.penerima_akun then
      perform keu_dlg_notif2(d.dibuat_oleh, 'delegasi_tenggat', 'Belum selesai dan belum dijelaskan: ' || d.judul, 'Penerima belum menjelaskan. Jawab di Tinjau, tab Belum selesai.', '/sigap/delego/tinjau', null);
    end if;
    update keu_dlg_eskalasi set push2_at = v_now where id = e.id;
    v_push2 := v_push2 + 1;
  end loop;

  -- 3. batas penjelasan lewat tanpa penjelasan: pimpinan tetap wajib menjawab
  for e in select * from keu_dlg_eskalasi where ditutup_at is null and status = 'menunggu_penjelasan' and dijelaskan_at is null and batas_jelas_at <= v_now loop
    select * into d from keu_dlg_delegasi where id = e.delegasi_id;
    update keu_dlg_eskalasi set status = 'menunggu_jawaban', batas_jawab = keu_dlg_hk_tambah(v_hari, s.hk_jawab) where id = e.id;
    if d.dibuat_oleh is not null and d.dibuat_oleh <> e.penerima_akun then
      perform keu_dlg_notif2(d.dibuat_oleh, 'delegasi_tenggat', 'Perlu jawaban Anda: ' || d.judul,
        'Pekerjaan lewat tenggat tanpa penjelasan. Jawab paling lambat ' || to_char(keu_dlg_hk_tambah(v_hari, s.hk_jawab), 'DD-MM-YYYY') || '.', '/sigap/delego/tinjau', null);
    end if;
    v_jawab := v_jawab + 1;
  end loop;

  -- 4. belum dijawab sampai hk_kepala hari kerja sejak lewat tenggat: naik ke Kepala
  for e in select * from keu_dlg_eskalasi where ditutup_at is null and naik_kepala_at is null and dijawab_at is null
              and keu_dlg_hk_lewat((mulai_at at time zone 'Asia/Jakarta')::date, v_hari) >= s.hk_kepala loop
    select * into d from keu_dlg_delegasi where id = e.delegasi_id;
    update keu_dlg_eskalasi set status = 'naik_kepala', naik_kepala_at = v_now, batas_jawab = coalesce(batas_jawab, v_hari) where id = e.id;
    for w in select * from keu_dlg_pemutus() loop
      perform keu_dlg_notif2(w, 'delegasi_tenggat', 'Naik ke Kepala: ' || d.judul,
        'Lewat tenggat ' || to_char(e.tenggat, 'DD-MM-YYYY') || ' dan belum dijawab Ketua Tim.', '/sigap/delego/tinjau', null);
    end loop;
    v_kepala := v_kepala + 1;
  end loop;

  return jsonb_build_object('baru', v_baru, 'push2', v_push2, 'menunggu_jawaban', v_jawab, 'naik_kepala', v_kepala, 'tutup', v_tutup);
end $f$;
revoke execute on function keu_dlg_eskalasi_jalan(timestamptz) from public, anon, authenticated;

create or replace function keu_dlg_eskalasi_jelaskan(p_id bigint, p_isi text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare e keu_dlg_eskalasi; d keu_dlg_delegasi; s keu_dlg_eskalasi_setelan; v_isi text := btrim(coalesce(p_isi, '')); v_batas date;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into e from keu_dlg_eskalasi where id = p_id for update;
  if not found or e.ditutup_at is not null then raise exception 'Butir ini sudah ditutup' using errcode = '23514'; end if;
  if e.penerima_akun <> p_akun then raise exception 'Hanya penerima pekerjaan yang dapat menjelaskan' using errcode = '42501'; end if;
  if char_length(v_isi) < 10 then raise exception 'Penjelasan minimal 10 huruf' using errcode = '23514'; end if;
  select * into s from keu_dlg_eskalasi_setelan where id = 1;
  select * into d from keu_dlg_delegasi where id = e.delegasi_id;
  v_batas := coalesce(e.batas_jawab, keu_dlg_hk_tambah(keu_dlg_hari_ini(), s.hk_jawab));
  update keu_dlg_eskalasi set penjelasan = left(v_isi, 1000), dijelaskan_at = now(), batas_jawab = v_batas,
         status = case when status = 'naik_kepala' then status else 'menunggu_jawaban' end where id = e.id;
  if d.dibuat_oleh is not null and d.dibuat_oleh <> p_akun then
    perform keu_dlg_notif2(d.dibuat_oleh, 'delegasi_tenggat', 'Penjelasan masuk: ' || d.judul, left(v_isi, 200) || ' Jawab paling lambat ' || to_char(v_batas, 'DD-MM-YYYY') || '.', '/sigap/delego/tinjau', p_akun);
  end if;
  return jsonb_build_object('id', e.id, 'batas_jawab', v_batas);
end $f$;
revoke execute on function keu_dlg_eskalasi_jelaskan(bigint, text, bigint) from public, anon, authenticated;

create or replace function keu_dlg_eskalasi_jawab(p_id bigint, p_putusan text, p_catatan text, p_data jsonb default '{}'::jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare e keu_dlg_eskalasi; d keu_dlg_delegasi; v_cat text := btrim(coalesce(p_catatan, '')); v_teks text; v_hasil jsonb := '{}'::jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_putusan not in ('perpanjang','alihkan','kurangi','batalkan','tetap_bantuan') then raise exception 'Jawaban tidak dikenal' using errcode = '22023'; end if;
  select * into e from keu_dlg_eskalasi where id = p_id for update;
  if not found or e.ditutup_at is not null then raise exception 'Butir ini sudah ditutup' using errcode = '23514'; end if;
  select * into d from keu_dlg_delegasi where id = e.delegasi_id;
  if p_akun = d.penerima_akun and not keu_dlg_putus_ok(p_akun) then raise exception 'Penerima tidak dapat menjawab butirnya sendiri' using errcode = '42501'; end if;
  if not keu_dlg_boleh_tinjau(p_akun, d.id) then raise exception 'Anda tidak berwenang menjawab butir ini' using errcode = '42501'; end if;
  if char_length(v_cat) < 10 then raise exception 'Catatan jawaban minimal 10 huruf' using errcode = '23514'; end if;
  p_data := coalesce(p_data, '{}'::jsonb);

  if p_putusan = 'perpanjang' then
    if nullif(p_data->>'tenggat', '') is null or (p_data->>'tenggat')::date < keu_dlg_hari_ini() then raise exception 'Tenggat baru wajib diisi dan tidak boleh sebelum hari ini' using errcode = '23514'; end if;
    v_hasil := keu_dlg_ubah(d.id, jsonb_build_object('tenggat', p_data->>'tenggat'), p_akun);
    v_teks := 'Tenggat diperpanjang sampai ' || to_char((p_data->>'tenggat')::date, 'DD-MM-YYYY') || '.';
  elsif p_putusan = 'kurangi' then
    if nullif(p_data->>'target_total', '') is null or (p_data->>'target_total')::numeric < 0 then raise exception 'Target baru wajib diisi' using errcode = '23514'; end if;
    v_hasil := keu_dlg_ubah(d.id, jsonb_build_object('target_total', p_data->>'target_total') || case when nullif(p_data->>'tenggat','') is not null then jsonb_build_object('tenggat', p_data->>'tenggat') else '{}'::jsonb end, p_akun);
    v_teks := 'Target dikurangi menjadi ' || trim(to_char((p_data->>'target_total')::numeric, 'FM999999990.##')) || ' poin.';
  elsif p_putusan = 'batalkan' then
    v_hasil := keu_dlg_ubah(d.id, jsonb_build_object('status', 'batal', 'alasan', left(v_cat, 300)), p_akun);
    v_teks := 'Pekerjaan dibatalkan.';
  elsif p_putusan = 'alihkan' then
    if nullif(p_data->>'ke', '') is null then raise exception 'Penerima baru wajib dipilih' using errcode = '23514'; end if;
    v_hasil := keu_dlg_pindah(d.id, (p_data->>'ke')::bigint, d.ver, p_akun);
    if nullif(p_data->>'tenggat', '') is not null then
      v_hasil := v_hasil || jsonb_build_object('ubah', keu_dlg_ubah(d.id, jsonb_build_object('tenggat', p_data->>'tenggat'), p_akun));
    end if;
    v_teks := 'Pekerjaan dialihkan ke ' || coalesce((select nama from sigap_akun where id = (p_data->>'ke')::bigint), 'pegawai lain') || '.';
  else
    v_teks := 'Tetap dikerjakan dengan bantuan.';
  end if;

  update keu_dlg_eskalasi set putusan = p_putusan, catatan = left(v_cat, 1000), data = p_data, dijawab_oleh = p_akun, dijawab_at = now(),
         ditutup_at = now(), ditutup_karena = 'dijawab', status = 'selesai' where id = e.id;
  perform keu_dlg_notif2(e.penerima_akun, 'delegasi_tenggat', 'Jawaban pimpinan: ' || d.judul, v_teks || ' ' || left(v_cat, 200), '/sigap/delego/saya', p_akun);
  return jsonb_build_object('id', e.id, 'putusan', p_putusan, 'hasil', v_hasil);
end $f$;
revoke execute on function keu_dlg_eskalasi_jawab(bigint, text, text, jsonb, bigint) from public, anon, authenticated;

create or replace function keu_dlg_eskalasi_bahan(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_hari date := keu_dlg_hari_ini(); v_putus boolean; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  v_putus := keu_dlg_putus_ok(p_akun);
  with b as (
    select e.id, e.delegasi_id, e.penerima_akun, e.tenggat, e.mulai_at, e.batas_jelas_at, e.penjelasan, e.dijelaskan_at, e.push2_at, e.batas_jawab,
           e.naik_kepala_at, e.putusan, e.catatan, e.data, e.dijawab_at, e.ditutup_at, e.ditutup_karena, e.status,
           d.judul, d.ro_kode, d.satuan, d.target_total, d.poin_per_satuan, d.ver, d.dibuat_oleh as pemberi_akun, d.kegiatan_id,
           a.nama as penerima_nama, pb.nama as pemberi_nama, j.nama as dijawab_nama, k.nama as kegiatan_nama,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_lapor,
           (select count(*) from keu_dlg_eskalasi z where z.penerima_akun = e.penerima_akun and z.mulai_at > now() - interval '30 days')::int as n_lewat_30,
           keu_dlg_hk_lewat((e.mulai_at at time zone 'Asia/Jakarta')::date, v_hari) as hk_sejak,
           (e.ditutup_at is null and e.batas_jawab is not null and v_hari > e.batas_jawab) as lewat_jawab
      from keu_dlg_eskalasi e join keu_dlg_delegasi d on d.id = e.delegasi_id join sigap_akun a on a.id = e.penerima_akun
      left join sigap_akun pb on pb.id = d.dibuat_oleh left join sigap_akun j on j.id = e.dijawab_oleh left join sigap_kegiatan k on k.id = d.kegiatan_id
     where e.ditutup_at is null or e.ditutup_at > now() - interval '14 days'
  )
  select jsonb_build_object(
    'hari_ini', v_hari, 'pemutus', v_putus,
    'setelan', (select to_jsonb(s) - 'diubah_oleh' from keu_dlg_eskalasi_setelan s where s.id = 1),
    'saya', (select coalesce(jsonb_agg(to_jsonb(b) order by (b.ditutup_at is not null), b.mulai_at desc), '[]'::jsonb) from b where b.penerima_akun = p_akun),
    'pimpinan', (select coalesce(jsonb_agg(to_jsonb(b) order by (b.ditutup_at is not null), (b.status = 'naik_kepala') desc, b.mulai_at), '[]'::jsonb) from b
                  where b.penerima_akun <> p_akun and (keu_dlg_boleh_tinjau(p_akun, b.delegasi_id) or (v_putus and b.status = 'naik_kepala'))),
    'ringkas', jsonb_build_object(
      'terbuka', (select count(*) from b where b.ditutup_at is null and (v_putus or keu_dlg_boleh_tinjau(p_akun, b.delegasi_id))),
      'lewat_jawab', (select count(*) from b where b.lewat_jawab and (v_putus or keu_dlg_boleh_tinjau(p_akun, b.delegasi_id))),
      'naik_kepala', (select count(*) from b where b.ditutup_at is null and b.status = 'naik_kepala')
    )
  ) into r;
  return r;
end $f$;
revoke execute on function keu_dlg_eskalasi_bahan(bigint) from public, anon, authenticated;

create or replace function keu_dlg_eskalasi_atur(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare r keu_dlg_eskalasi_setelan;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_dlg_putus_ok(p_akun) then raise exception 'Hanya Kepala atau pemutus yang dapat mengubah setelan eskalasi' using errcode = '42501'; end if;
  update keu_dlg_eskalasi_setelan set
    aktif = coalesce((p_data->>'aktif')::boolean, aktif),
    jam_jelas = coalesce((p_data->>'jam_jelas')::smallint, jam_jelas),
    hk_push2 = coalesce((p_data->>'hk_push2')::smallint, hk_push2),
    hk_jawab = coalesce((p_data->>'hk_jawab')::smallint, hk_jawab),
    hk_kepala = coalesce((p_data->>'hk_kepala')::smallint, hk_kepala),
    kali_bina = coalesce((p_data->>'kali_bina')::smallint, kali_bina),
    jam_tenang_mulai = coalesce((p_data->>'jam_tenang_mulai')::smallint, jam_tenang_mulai),
    jam_tenang_selesai = coalesce((p_data->>'jam_tenang_selesai')::smallint, jam_tenang_selesai),
    diubah_oleh = p_akun, diubah_at = now()
  where id = 1 returning * into r;
  return to_jsonb(r);
end $f$;
revoke execute on function keu_dlg_eskalasi_atur(jsonb, bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_dlg_eskalasi_jawab''' in d) = 0 then
    d := replace(d, '''keu_dlg_mutu_atur''];', '''keu_dlg_mutu_atur'',''keu_dlg_eskalasi_jelaskan'',''keu_dlg_eskalasi_jawab'',''keu_dlg_eskalasi_bahan'',''keu_dlg_eskalasi_atur''];');
    if position('''keu_dlg_eskalasi_jawab''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;

-- Jadwal (di luar transaksi): tiap 15 menit
select cron.schedule('delego-eskalasi-15m', '*/15 * * * *', 'select public.keu_dlg_eskalasi_jalan()');
