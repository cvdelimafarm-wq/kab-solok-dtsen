-- skema-sql/20261113c_keu_poin_beban.sql
--
-- (13 Nov 2026, keputusan C Iqbal 13 Nov sore) Master > tab "Poin beban kerja": SUMBER UTAMA poin per satuan menurut jenis pekerjaan × survei.
-- Hanya menambah tabel, view, dan fungsi; data awal diisi terpisah (20261113d, uji kering dulu).
--
-- Skala: kapasitas 100 poin per hari, hari kerja 450 menit (7,5 jam). Katalog Delego lama (keu_dlg_jenis.poin_per_satuan) masih skala 75;
-- Delego baru membaca matriks ini saat kapasitas Delego dipindah ke 100 (supaya beban tidak bercampur dua skala). View keu_v_poin_berlaku disiapkan untuk itu.
--
-- Aturan (semua angka ada di keu_poin_atur dan DAPAT DIUBAH; nilai bawaan = usul tertulis, menunggu keputusan Iqbal):
--   * Sumber berlaku: input manual yang dicentang "menimpa" (wajib beralasan) > riwayat (>= 10 laporan dari >= 3 orang) > usul pegawai (>= 3 pengusul)
--     > input manual > data awal. Bila riwayat dan usul sama-sama memenuhi: menit = w × riwayat + (1 − w) × usul, w = n ÷ (n + 20), n = jumlah laporan.
--   * Rata-rata riwayat dan usul dihitung sesudah pencilan dibuang (di luar 1,5 × rentang antarkuartil); pencilan tetap tersimpan.
--   * Standar per hari = 450 ÷ menit per satuan; poin per satuan = 100 ÷ standar per hari.
--   * Perubahan poin berlaku lebih dari 25% perlu persetujuan (pemberi delegasi tingkat tim, bukan pengusulnya). Tiap perubahan menambah baris riwayat.
--   * Poin baru hanya berlaku untuk delegasi baru (delegasi menyimpan salinan poin saat dibuat).
--   * Usul pegawai: sesudah melapor pada jenis pekerjaan itu, sekali per jenis × survei per triwulan.
-- Uji: supabase/tests/85_uji_poin_beban.sql (selalu rollback).

begin;

create table if not exists keu_poin_atur (
  kunci text primary key,
  nilai numeric not null,
  ket text not null default '',
  diubah_oleh bigint references sigap_akun(id),
  diubah_at timestamptz not null default now()
);
insert into keu_poin_atur(kunci, nilai, ket) values
  ('kapasitas', 100, 'Poin per hari kerja penuh (keputusan 13 Nov).'),
  ('menit_hari', 450, 'Menit kerja efektif per hari (7,5 jam).'),
  ('min_laporan', 10, 'Riwayat dipakai bila jumlah laporan berisi menit nyata minimal sekian (usul).'),
  ('min_orang_laporan', 3, 'Riwayat dipakai bila laporan berasal dari minimal sekian orang (usul).'),
  ('min_pengusul', 3, 'Usul pegawai dipakai bila pengusul minimal sekian orang (usul, menunggu keputusan).'),
  ('k_iqr', 1.5, 'Pencilan: di luar k × rentang antarkuartil (usul, menunggu keputusan).'),
  ('k_bobot', 20, 'w = n ÷ (n + k) untuk menggabungkan riwayat dan usul (usul).'),
  ('ambang_ubah', 25, 'Perubahan poin lebih dari sekian persen perlu persetujuan.')
on conflict (kunci) do nothing;
alter table keu_poin_atur enable row level security;
revoke all on keu_poin_atur from anon, authenticated;

create table if not exists keu_poin_survei (
  id bigserial primary key,
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,30}$'),
  nama text not null check (char_length(nama) between 2 and 80),
  pola text not null default '' check (char_length(pola) <= 200),
  urut smallint not null default 100,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);
comment on column keu_poin_survei.pola is 'Ekspresi reguler (tanpa membedakan huruf besar) untuk mengenali survei dari nama kegiatan, identifikasi, atau judul delegasi. Kosong = tidak dicocokkan (mis. Umum).';
alter table keu_poin_survei enable row level security;
revoke all on keu_poin_survei from anon, authenticated;

create table if not exists keu_poin_sel (
  id bigserial primary key,
  jenis_id bigint not null references keu_dlg_jenis(id),
  survei_id bigint not null references keu_poin_survei(id),
  awal numeric(10,2) check (awal is null or awal > 0),
  awal_ket text not null default '',
  manual numeric(10,2) check (manual is null or manual > 0),
  manual_timpa boolean not null default false,
  manual_alasan text not null default '' check (char_length(manual_alasan) <= 300),
  manual_oleh bigint references sigap_akun(id),
  manual_at timestamptz,
  poin_berlaku numeric(10,2),
  sumber_berlaku text check (sumber_berlaku in ('riwayat', 'gabungan', 'usul', 'manual', 'awal')),
  berlaku_at timestamptz,
  unique (jenis_id, survei_id)
);
alter table keu_poin_sel enable row level security;
revoke all on keu_poin_sel from anon, authenticated;

create table if not exists keu_poin_usul (
  id bigserial primary key,
  sel_id bigint not null references keu_poin_sel(id),
  akun_id bigint not null references sigap_akun(id),
  per_hari numeric(10,2) not null check (per_hari > 0 and per_hari <= 10000),
  triwulan text not null check (triwulan ~ '^\d{4}-Q[1-4]$'),
  delegasi_id bigint references keu_dlg_delegasi(id),
  catatan text not null default '' check (char_length(catatan) <= 300),
  dibuat_at timestamptz not null default now(),
  unique (sel_id, akun_id, triwulan)
);
alter table keu_poin_usul enable row level security;
revoke all on keu_poin_usul from anon, authenticated;

create table if not exists keu_poin_riwayat (
  id bigserial primary key,
  sel_id bigint not null references keu_poin_sel(id),
  poin_lama numeric(10,2),
  poin_baru numeric(10,2) not null,
  sumber text not null,
  alasan text not null default '' check (char_length(alasan) <= 300),
  status text not null check (status in ('berlaku', 'menunggu', 'ditolak', 'usang')),
  diajukan_oleh bigint references sigap_akun(id),
  diajukan_at timestamptz not null default now(),
  diputus_oleh bigint references sigap_akun(id),
  diputus_at timestamptz,
  catatan_putus text not null default '' check (char_length(catatan_putus) <= 300)
);
create unique index if not exists keu_poin_riwayat_menunggu_uq on keu_poin_riwayat (sel_id) where status = 'menunggu';
alter table keu_poin_riwayat enable row level security;
revoke all on keu_poin_riwayat from anon, authenticated;

-- Pengaturan
create or replace function keu_poin_nilai(p_kunci text) returns numeric
language sql stable set search_path to 'public' as $f$ select nilai from keu_poin_atur where kunci = p_kunci $f$;

-- Rata-rata sesudah pencilan dibuang (k × IQR). Kurang dari 4 nilai: tanpa pembuangan.
create or replace function keu_poin_rata(p_nilai numeric[], p_k numeric default null)
returns table (rata numeric, n_pakai int, n_pencilan int)
language plpgsql stable set search_path to 'public' as $f$
declare q1 numeric; q3 numeric; k numeric := coalesce(p_k, keu_poin_nilai('k_iqr'), 1.5); lo numeric; hi numeric;
begin
  if p_nilai is null or cardinality(p_nilai) = 0 then rata := null; n_pakai := 0; n_pencilan := 0; return next; return; end if;
  if cardinality(p_nilai) < 4 then
    select avg(x), count(*)::int into rata, n_pakai from unnest(p_nilai) x; n_pencilan := 0; return next; return;
  end if;
  select percentile_cont(0.25) within group (order by x), percentile_cont(0.75) within group (order by x) into q1, q3 from unnest(p_nilai) x;
  lo := q1 - k * (q3 - q1); hi := q3 + k * (q3 - q1);
  select avg(x) filter (where x between lo and hi), (count(*) filter (where x between lo and hi))::int, (count(*) filter (where x not between lo and hi))::int
    into rata, n_pakai, n_pencilan from unnest(p_nilai) x;
  return next;
end $f$;

-- Survei dari teks (nama kegiatan / identifikasi / judul delegasi): pola pertama yang cocok menurut urut; tidak ada = 'umum'.
create or replace function keu_poin_survei_dari(p_teks text) returns bigint
language sql stable set search_path to 'public' as $f$
  select coalesce(
    (select s.id from keu_poin_survei s where s.aktif and s.pola <> '' and coalesce(p_teks, '') ~* s.pola order by s.urut, s.id limit 1),
    (select s.id from keu_poin_survei s where s.kode = 'umum'))
$f$;

-- Laporan Delego berisi menit nyata dan jumlah, dipetakan ke sel (jenis × survei)
create or replace view keu_v_poin_laporan as
 select l.id as laporan_id, d.id as delegasi_id, d.jenis_id, d.penerima_akun as akun_id,
        keu_poin_survei_dari(coalesce(g.nama, i.nama, '') || ' ' || coalesce(d.judul, '')) as survei_id,
        l.tanggal, l.jumlah, l.menit_nyata, (l.menit_nyata::numeric / l.jumlah) as menit_per_satuan
   from keu_dlg_laporan l
   join keu_dlg_delegasi d on d.id = l.delegasi_id
   left join sigap_kegiatan g on g.id = d.kegiatan_id
   left join keu_ident i on i.id = d.ident_id
  where d.jenis_id is not null and l.jumlah > 0 and l.menit_nyata > 0 and d.status <> 'batal';
revoke all on keu_v_poin_laporan from anon, authenticated;

-- Hitung satu sel: semua sumber berdampingan + kandidat poin berlaku dan sumbernya
create or replace function keu_poin_hitung(p_sel bigint) returns jsonb
language plpgsql stable set search_path to 'public' as $f$
declare
  s keu_poin_sel; v_mh numeric := keu_poin_nilai('menit_hari'); v_kap numeric := keu_poin_nilai('kapasitas');
  ru record; rr record; v_orang int; v_usul_ok boolean; v_riw_ok boolean; v_menit numeric; v_w numeric; v_poin numeric; v_sumber text;
  v_u numeric[]; v_r numeric[];
begin
  select * into s from keu_poin_sel where id = p_sel;
  if not found then return null; end if;
  select array_agg(v_mh / u.per_hari) into v_u from keu_poin_usul u where u.sel_id = s.id;
  select * into ru from keu_poin_rata(v_u);
  select array_agg(l.menit_per_satuan), count(distinct l.akun_id) into v_r, v_orang from keu_v_poin_laporan l where l.jenis_id = s.jenis_id and l.survei_id = s.survei_id;
  select * into rr from keu_poin_rata(v_r);
  v_usul_ok := coalesce(ru.n_pakai, 0) >= keu_poin_nilai('min_pengusul') and ru.rata is not null;
  v_riw_ok := coalesce(rr.n_pakai, 0) >= keu_poin_nilai('min_laporan') and coalesce(v_orang, 0) >= keu_poin_nilai('min_orang_laporan') and rr.rata is not null;
  if s.manual is not null and s.manual_timpa then v_poin := s.manual; v_sumber := 'manual';
  elsif v_riw_ok and v_usul_ok then
    v_w := rr.n_pakai::numeric / (rr.n_pakai + keu_poin_nilai('k_bobot'));
    v_menit := v_w * rr.rata + (1 - v_w) * ru.rata; v_poin := v_menit * v_kap / v_mh; v_sumber := 'gabungan';
  elsif v_riw_ok then v_poin := rr.rata * v_kap / v_mh; v_sumber := 'riwayat';
  elsif v_usul_ok then v_poin := ru.rata * v_kap / v_mh; v_sumber := 'usul';
  elsif s.manual is not null then v_poin := s.manual; v_sumber := 'manual';
  elsif s.awal is not null then v_poin := s.awal; v_sumber := 'awal';
  end if;
  return jsonb_build_object(
    'awal', s.awal, 'manual', s.manual, 'manual_timpa', s.manual_timpa,
    'usul_poin', case when ru.rata is not null then round(ru.rata * v_kap / v_mh, 2) end, 'usul_per_hari', case when ru.rata is not null then round(v_mh / ru.rata, 1) end,
    'usul_n', coalesce(ru.n_pakai, 0), 'usul_pencilan', coalesce(ru.n_pencilan, 0), 'usul_cukup', v_usul_ok,
    'riwayat_poin', case when rr.rata is not null then round(rr.rata * v_kap / v_mh, 2) end, 'riwayat_per_hari', case when rr.rata is not null then round(v_mh / rr.rata, 1) end,
    'riwayat_n', coalesce(rr.n_pakai, 0), 'riwayat_pencilan', coalesce(rr.n_pencilan, 0), 'riwayat_orang', coalesce(v_orang, 0), 'riwayat_cukup', v_riw_ok,
    'bobot_riwayat', case when v_sumber = 'gabungan' then round(v_w, 3) end,
    'kandidat', round(v_poin, 2), 'sumber', v_sumber);
end $f$;

-- Terapkan kandidat: langsung bila perubahan <= ambang, selain itu menunggu persetujuan. Internal (tanpa cek hak).
create or replace function keu_poin_terapkan(p_sel bigint, p_akun bigint, p_alasan text default '') returns text
language plpgsql security definer set search_path to 'public' as $f$
declare s keu_poin_sel; h jsonb; v_baru numeric; v_sumber text; v_ambang numeric := keu_poin_nilai('ambang_ubah');
begin
  select * into s from keu_poin_sel where id = p_sel for update;
  h := keu_poin_hitung(p_sel);
  v_baru := (h ->> 'kandidat')::numeric; v_sumber := h ->> 'sumber';
  if v_baru is null then return 'kosong'; end if;
  if s.poin_berlaku is not null and v_baru = s.poin_berlaku then
    if s.sumber_berlaku is distinct from v_sumber then update keu_poin_sel set sumber_berlaku = v_sumber where id = s.id; end if;
    update keu_poin_riwayat set status = 'usang', diputus_at = now() where sel_id = s.id and status = 'menunggu';
    return 'tetap';
  end if;
  update keu_poin_riwayat set status = 'usang', diputus_at = now() where sel_id = s.id and status = 'menunggu';
  if s.poin_berlaku is null or abs(v_baru - s.poin_berlaku) / s.poin_berlaku * 100 <= v_ambang then
    update keu_poin_sel set poin_berlaku = v_baru, sumber_berlaku = v_sumber, berlaku_at = now() where id = s.id;
    insert into keu_poin_riwayat(sel_id, poin_lama, poin_baru, sumber, alasan, status, diajukan_oleh, diputus_oleh, diputus_at)
      values (s.id, s.poin_berlaku, v_baru, v_sumber, left(coalesce(p_alasan, ''), 300), 'berlaku', p_akun, p_akun, now());
    return 'berlaku';
  end if;
  insert into keu_poin_riwayat(sel_id, poin_lama, poin_baru, sumber, alasan, status, diajukan_oleh)
    values (s.id, s.poin_berlaku, v_baru, v_sumber, left(coalesce(p_alasan, ''), 300), 'menunggu', p_akun);
  return 'menunggu';
end $f$;
revoke execute on function keu_poin_terapkan(bigint, bigint, text) from public, anon, authenticated;

create or replace function keu_poin_boleh_atur(p_akun bigint) returns boolean
language sql stable set search_path to 'public' as $f$ select p_akun is not null and coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) $f$;

-- RPC: input manual per sel (membuat sel bila belum ada). p_poin null = hapus input manual.
create or replace function keu_poin_manual_simpan(p_jenis bigint, p_survei bigint, p_poin numeric, p_timpa boolean default false, p_alasan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_sel bigint; v_alasan text := btrim(coalesce(p_alasan, '')); v_hasil text;
begin
  if not keu_poin_boleh_atur(p_akun) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengatur poin beban kerja' using errcode = '42501'; end if;
  if p_poin is not null and (p_poin <= 0 or p_poin > 1000) then raise exception 'Poin per satuan harus lebih dari 0 dan paling banyak 1000' using errcode = '23514'; end if;
  if char_length(v_alasan) < 5 then raise exception 'Alasan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
  if char_length(v_alasan) > 300 then raise exception 'Alasan maksimal 300 huruf' using errcode = '23514'; end if;
  if not exists (select 1 from keu_dlg_jenis where id = p_jenis) or not exists (select 1 from keu_poin_survei where id = p_survei) then
    raise exception 'Jenis pekerjaan atau survei tidak ada' using errcode = '23514';
  end if;
  insert into keu_poin_sel(jenis_id, survei_id) values (p_jenis, p_survei) on conflict (jenis_id, survei_id) do nothing;
  select id into v_sel from keu_poin_sel where jenis_id = p_jenis and survei_id = p_survei;
  update keu_poin_sel set manual = p_poin, manual_timpa = (p_poin is not null and coalesce(p_timpa, false)), manual_alasan = v_alasan, manual_oleh = p_akun, manual_at = now() where id = v_sel;
  v_hasil := keu_poin_terapkan(v_sel, p_akun, 'Input manual: ' || v_alasan);
  return jsonb_build_object('sel', v_sel, 'hasil', v_hasil, 'hitung', keu_poin_hitung(v_sel));
end $f$;

-- RPC: putus perubahan yang menunggu (bukan oleh pengusulnya)
create or replace function keu_poin_putus(p_riwayat bigint, p_setuju boolean, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path to 'public' as $f$
declare r keu_poin_riwayat; v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if not keu_poin_boleh_atur(p_akun) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat memutus perubahan poin' using errcode = '42501'; end if;
  select * into r from keu_poin_riwayat where id = p_riwayat for update;
  if not found or r.status <> 'menunggu' then raise exception 'Perubahan tidak ada atau sudah diputus' using errcode = '23514'; end if;
  if r.diajukan_oleh = p_akun then raise exception 'Pengusul perubahan tidak memutus usulannya sendiri' using errcode = '42501'; end if;
  if not p_setuju and char_length(v_cat) < 5 then raise exception 'Alasan menolak wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
  if p_setuju then
    update keu_poin_sel set poin_berlaku = r.poin_baru, sumber_berlaku = r.sumber, berlaku_at = now() where id = r.sel_id;
  end if;
  update keu_poin_riwayat set status = case when p_setuju then 'berlaku' else 'ditolak' end, diputus_oleh = p_akun, diputus_at = now(), catatan_putus = left(v_cat, 300) where id = r.id;
  return case when p_setuju then 'berlaku' else 'ditolak' end;
end $f$;

-- RPC: hitung ulang semua sel (atau satu) dari sumber terbaru
create or replace function keu_poin_hitung_ulang(p_sel bigint default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare x record; v_n jsonb := '{}'::jsonb; v_h text;
begin
  if not keu_poin_boleh_atur(p_akun) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat menghitung ulang poin' using errcode = '42501'; end if;
  for x in select id from keu_poin_sel where p_sel is null or id = p_sel order by id loop
    v_h := keu_poin_terapkan(x.id, p_akun, 'Hitung ulang dari sumber terbaru');
    v_n := jsonb_set(v_n, array[v_h], to_jsonb(coalesce((v_n ->> v_h)::int, 0) + 1));
  end loop;
  return v_n;
end $f$;

-- RPC: tambah atau ubah survei di matriks
create or replace function keu_poin_survei_simpan(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path to 'public' as $f$
declare v_id bigint := nullif(p_data ->> 'id', '')::bigint; v_kode text := lower(btrim(coalesce(p_data ->> 'kode', ''))); v_nama text := btrim(coalesce(p_data ->> 'nama', ''));
        v_pola text := btrim(coalesce(p_data ->> 'pola', '')); v_urut int := coalesce(nullif(p_data ->> 'urut', '')::int, 100); v_aktif boolean := coalesce((p_data ->> 'aktif')::boolean, true);
begin
  if not keu_poin_boleh_atur(p_akun) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengatur survei poin' using errcode = '42501'; end if;
  if v_pola <> '' then perform ('' ~* v_pola); end if; -- pola tidak sah -> galat
  if v_id is null then
    insert into keu_poin_survei(kode, nama, pola, urut, aktif) values (v_kode, v_nama, v_pola, v_urut, v_aktif) returning id into v_id;
  else
    update keu_poin_survei set nama = v_nama, pola = v_pola, urut = v_urut, aktif = v_aktif where id = v_id;
    if not found then raise exception 'Survei % tidak ada', v_id using errcode = '23514'; end if;
  end if;
  return v_id;
end $f$;

-- RPC: ubah pengaturan (angka usul yang dapat diubah)
create or replace function keu_poin_atur_simpan(p_kunci text, p_nilai numeric, p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path to 'public' as $f$
begin
  if not keu_poin_boleh_atur(p_akun) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengubah pengaturan poin' using errcode = '42501'; end if;
  if p_nilai is null or p_nilai <= 0 or p_nilai > 100000 then raise exception 'Nilai harus lebih dari 0' using errcode = '23514'; end if;
  update keu_poin_atur set nilai = p_nilai, diubah_oleh = p_akun, diubah_at = now() where kunci = p_kunci;
  if not found then raise exception 'Pengaturan % tidak ada', p_kunci using errcode = '23514'; end if;
  return 'ok';
end $f$;

-- RPC pegawai: perlu diminta usul untuk delegasi ini? (sudah pernah melapor dan belum mengusulkan pada triwulan berjalan)
create or replace function keu_poin_usul_perlu(p_delegasi bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare d keu_dlg_delegasi; v_survei bigint; v_sel bigint; v_tw text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY') || '-Q' || to_char(now() at time zone 'Asia/Jakarta', 'Q');
begin
  select * into d from keu_dlg_delegasi where id = p_delegasi;
  if not found or d.jenis_id is null or d.penerima_akun is distinct from p_akun then return jsonb_build_object('perlu', false); end if;
  if not exists (select 1 from keu_dlg_laporan where delegasi_id = d.id) then return jsonb_build_object('perlu', false); end if;
  v_survei := keu_poin_survei_dari(coalesce((select nama from sigap_kegiatan where id = d.kegiatan_id), (select nama from keu_ident where id = d.ident_id), '') || ' ' || coalesce(d.judul, ''));
  select id into v_sel from keu_poin_sel where jenis_id = d.jenis_id and survei_id = v_survei;
  if v_sel is not null and exists (select 1 from keu_poin_usul where sel_id = v_sel and akun_id = p_akun and triwulan = v_tw) then return jsonb_build_object('perlu', false); end if;
  return jsonb_build_object('perlu', true, 'jenis', (select nama from keu_dlg_jenis where id = d.jenis_id), 'satuan', (select satuan from keu_dlg_jenis where id = d.jenis_id),
                            'survei', (select nama from keu_poin_survei where id = v_survei), 'triwulan', v_tw);
end $f$;

-- RPC pegawai: kirim usul (berapa satuan wajar per hari) sesudah melapor
create or replace function keu_poin_usul_simpan(p_delegasi bigint, p_per_hari numeric, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path to 'public' as $f$
declare d keu_dlg_delegasi; v_survei bigint; v_sel bigint; v_tw text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY') || '-Q' || to_char(now() at time zone 'Asia/Jakarta', 'Q');
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_delegasi;
  if not found or d.jenis_id is null then raise exception 'Delegasi tidak ada atau tidak berjenis' using errcode = '23514'; end if;
  if d.penerima_akun is distinct from p_akun then raise exception 'Usul hanya dari penerima delegasi' using errcode = '42501'; end if;
  if not exists (select 1 from keu_dlg_laporan where delegasi_id = d.id) then raise exception 'Usul diminta sesudah Anda melapor pada pekerjaan ini' using errcode = '23514'; end if;
  if p_per_hari is null or p_per_hari <= 0 or p_per_hari > 10000 then raise exception 'Isi jumlah satuan per hari lebih dari 0' using errcode = '23514'; end if;
  v_survei := keu_poin_survei_dari(coalesce((select nama from sigap_kegiatan where id = d.kegiatan_id), (select nama from keu_ident where id = d.ident_id), '') || ' ' || coalesce(d.judul, ''));
  insert into keu_poin_sel(jenis_id, survei_id) values (d.jenis_id, v_survei) on conflict (jenis_id, survei_id) do nothing;
  select id into v_sel from keu_poin_sel where jenis_id = d.jenis_id and survei_id = v_survei;
  insert into keu_poin_usul(sel_id, akun_id, per_hari, triwulan, delegasi_id, catatan) values (v_sel, p_akun, p_per_hari, v_tw, d.id, left(btrim(coalesce(p_catatan, '')), 300))
    on conflict (sel_id, akun_id, triwulan) do nothing;
  if not found then return 'sudah'; end if;
  perform keu_poin_terapkan(v_sel, p_akun, 'Usul pegawai bertambah');
  return 'tersimpan';
end $f$;

-- Views baca
create or replace view keu_v_poin_sel as
 select s.id, s.jenis_id, j.kode as jenis_kode, j.nama as jenis_nama, j.satuan, j.urut as jenis_urut, j.aktif as jenis_aktif,
        s.survei_id, v.kode as survei_kode, v.nama as survei_nama, v.urut as survei_urut,
        s.awal, s.awal_ket, s.manual, s.manual_timpa, s.manual_alasan, a.nama as manual_oleh_nama, s.manual_at,
        s.poin_berlaku, s.sumber_berlaku, s.berlaku_at,
        case when s.poin_berlaku > 0 then round(keu_poin_nilai('kapasitas') / s.poin_berlaku, 1) end as standar_per_hari,
        h.hitung ->> 'usul_poin' as usul_poin, (h.hitung ->> 'usul_n')::int as usul_n, (h.hitung ->> 'usul_pencilan')::int as usul_pencilan,
        h.hitung ->> 'riwayat_poin' as riwayat_poin, (h.hitung ->> 'riwayat_n')::int as riwayat_n, (h.hitung ->> 'riwayat_orang')::int as riwayat_orang,
        h.hitung ->> 'kandidat' as kandidat, h.hitung ->> 'sumber' as sumber_kandidat,
        m.id as menunggu_id, m.poin_baru as menunggu_poin, m.sumber as menunggu_sumber, m.diajukan_oleh as menunggu_oleh, pa.nama as menunggu_oleh_nama
   from keu_poin_sel s
   join keu_dlg_jenis j on j.id = s.jenis_id
   join keu_poin_survei v on v.id = s.survei_id
   left join sigap_akun a on a.id = s.manual_oleh
   left join lateral (select keu_poin_hitung(s.id) as hitung) h on true
   left join keu_poin_riwayat m on m.sel_id = s.id and m.status = 'menunggu'
   left join sigap_akun pa on pa.id = m.diajukan_oleh;
revoke all on keu_v_poin_sel from anon, authenticated;

create or replace view keu_v_poin_riwayat as
 select r.id, r.sel_id, s.jenis_id, s.survei_id, r.poin_lama, r.poin_baru, r.sumber, r.alasan, r.status, r.diajukan_at, a.nama as diajukan_oleh_nama,
        r.diputus_at, b.nama as diputus_oleh_nama, r.catatan_putus
   from keu_poin_riwayat r join keu_poin_sel s on s.id = r.sel_id
   left join sigap_akun a on a.id = r.diajukan_oleh left join sigap_akun b on b.id = r.diputus_oleh;
revoke all on keu_v_poin_riwayat from anon, authenticated;

-- (20261113c3) nama baca untuk aplikasi: daftar putih gerbang menolak nama berisi "riwayat"
create or replace view keu_v_poin_perubahan as select * from keu_v_poin_riwayat;
revoke all on keu_v_poin_perubahan from anon, authenticated;

create or replace view keu_v_poin_berlaku as
 select s.jenis_id, s.survei_id, v.kode as survei_kode, s.poin_berlaku, s.sumber_berlaku, s.berlaku_at from keu_poin_sel s join keu_poin_survei v on v.id = s.survei_id where s.poin_berlaku is not null;
revoke all on keu_v_poin_berlaku from anon, authenticated;

-- (diterapkan terpisah sebagai 20261113c2) daftar jenis pekerjaan untuk baris matriks
create or replace view keu_v_poin_jenis as select id, kode, nama, satuan, urut, aktif, poin_per_satuan as poin_katalog_skala75 from keu_dlg_jenis;
revoke all on keu_v_poin_jenis from anon, authenticated;

create or replace view keu_v_poin_survei as select id, kode, nama, pola, urut, aktif from keu_poin_survei;
create or replace view keu_v_poin_atur as select r.kunci, r.nilai, r.ket, r.diubah_at, a.nama as diubah_oleh_nama from keu_poin_atur r left join sigap_akun a on a.id = r.diubah_oleh;
revoke all on keu_v_poin_survei, keu_v_poin_atur from anon, authenticated;

do $$ declare f text; begin
  foreach f in array array['keu_poin_rata(numeric[], numeric)','keu_poin_hitung(bigint)','keu_poin_survei_dari(text)','keu_poin_nilai(text)','keu_poin_boleh_atur(bigint)',
    'keu_poin_manual_simpan(bigint, bigint, numeric, boolean, text, bigint)','keu_poin_putus(bigint, boolean, text, bigint)','keu_poin_hitung_ulang(bigint, bigint)',
    'keu_poin_survei_simpan(jsonb, bigint)','keu_poin_atur_simpan(text, numeric, bigint)','keu_poin_usul_perlu(bigint, bigint)','keu_poin_usul_simpan(bigint, numeric, text, bigint)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Izin gerbang keu_jalankan: tambah fungsi RPC poin (sisa definisi tidak berubah)
do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_poin_manual_simpan''' in d) = 0 then
    d := replace(d, '''keu_ident_kegiatan_tanggal_putus''];', '''keu_ident_kegiatan_tanggal_putus'',''keu_poin_manual_simpan'',''keu_poin_putus'',''keu_poin_hitung_ulang'',''keu_poin_survei_simpan'',''keu_poin_atur_simpan'',''keu_poin_usul_perlu'',''keu_poin_usul_simpan''];');
    if position('''keu_poin_manual_simpan''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
