-- 20261107c_arsip_penomoran.sql
-- (7 Nov 2026) Sistem penomoran surat dan menu Arsip (buku nomor).
-- Dasar: Peraturan BPS Nomor 1 Tahun 2023 tentang Pedoman Tata Naskah Dinas BPS, Pasal 63 sampai 65:
--   penugasan (surat tugas, surat perintah) dan surat dinas ke luar : [derajat keamanan]-[nomor]/[unit kerja]/[kode klasifikasi arsip]/[tahun]
--   korespondensi internal                                         : [nomor]/[unit kerja]/[kode klasifikasi arsip]/[tahun]
--   naskah khusus (surat perjanjian/SPK, berita acara/BAST, ...)   : [nomor]/[tahun]
-- Peraturan tidak menyebut apakah nomor urut satu register atau per jenis. Data nyata (B-1232..B-1278 SS.330, B-1285..B-1450 VS.330) menunjukkan
-- SATU register surat keluar per tahun, jadi itu bawaannya; semua format, register, dan kode arsip dapat diubah admin dari menu Arsip.
--
-- Prinsip: nomor DIAMBIL dari sistem (atomik, tanpa celah akibat dua orang mengambil bersamaan), tidak pernah dipakai ulang (yang dibatalkan tetap
-- tercatat), dan nomor yang terbit di luar sistem dapat dicatat supaya urutan tidak bentrok.
-- Aman dijalankan ulang. Tidak mengubah tabel yang sudah ada. Semua tabel tertutup untuk anon/authenticated (hanya lewat API dengan service role).

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Pengaturan, kode klasifikasi arsip, register, jenis dokumen
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.arsip_pengaturan (
  kunci      text primary key,
  nilai      text not null,
  diubah_at  timestamptz not null default now(),
  diubah_oleh bigint
);

create table if not exists public.arsip_kode (
  kode          text primary key check (kode ~ '^[A-Z]{2}\.[0-9]{3}(\.[0-9]+)?$'),
  nama          text not null check (length(btrim(nama)) between 3 and 200),
  kelompok      text not null default 'substantif' check (kelompok in ('substantif','fasilitatif')),
  catatan       text,
  aktif         boolean not null default true,
  diverifikasi  boolean not null default false,
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now()
);
comment on table public.arsip_kode is 'Kode klasifikasi arsip yang dipakai pada nomor surat (mis. VS.330). diverifikasi=false berarti artinya belum dicocokkan dengan tabel resmi klasifikasi arsip BPS.';

create table if not exists public.arsip_register (
  kode     text primary key check (kode ~ '^[a-z][a-z0-9_]{1,30}$'),
  nama     text not null,
  catatan  text
);

create table if not exists public.arsip_counter (
  register   text not null references public.arsip_register(kode),
  tahun      integer not null check (tahun between 2000 and 2100),
  terakhir   integer not null default 0 check (terakhir >= 0),
  diubah_at  timestamptz not null default now(),
  primary key (register, tahun)
);

create table if not exists public.arsip_jenis (
  kode        text primary key check (kode ~ '^[a-z][a-z0-9_]{1,30}$'),
  nama        text not null check (length(btrim(nama)) between 3 and 120),
  kategori    text not null check (kategori in ('penugasan','korespondensi_eksternal','korespondensi_internal','naskah_khusus')),
  register    text not null references public.arsip_register(kode),
  format      text not null check (format like '%{urut%' and format like '%{tahun}%' and length(format) <= 120),
  keamanan    text not null default 'B' check (keamanan ~ '^[A-Z]{1,2}$'),
  kka_bawaan  text references public.arsip_kode(kode),
  aktif       boolean not null default true,
  urutan      integer not null default 100,
  dasar       text
);
comment on column public.arsip_jenis.format is 'Pola nomor. Token: {keamanan} {urut} {urut3} {urut4} {unit} {kka} {tahun}.';

create table if not exists public.arsip_kegiatan_kka (
  kegiatan_id  bigint primary key,
  kka          text not null references public.arsip_kode(kode),
  diubah_at    timestamptz not null default now()
);
comment on table public.arsip_kegiatan_kka is 'Kode arsip bawaan per kegiatan (mis. SPDT NTP = VS.330, Penyisiran SE2026 = SS.330). Dipakai bila pengambil nomor tidak memilih kode sendiri.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Buku nomor
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.arsip_nomor (
  id           bigint generated always as identity primary key,
  jenis        text not null references public.arsip_jenis(kode),
  register     text not null references public.arsip_register(kode),
  tahun        integer not null,
  urut         integer not null check (urut >= 1),
  nomor        text not null,
  kka          text,
  tanggal      date not null,
  perihal      text,
  kegiatan_id  bigint,
  sumber       text not null default 'sistem' check (sumber in ('sistem','luar','impor')),
  status       text not null default 'terpakai' check (status in ('terpakai','batal')),
  alasan_batal text,
  rujukan      text,
  dibuat_oleh  bigint,
  dibuat_nama  text,
  dibuat_at    timestamptz not null default now(),
  batal_oleh   bigint,
  batal_at     timestamptz
);
comment on column public.arsip_nomor.sumber is 'sistem = diambil lewat SIGAP; luar = dicatat manual (terbit di luar SIGAP); impor = nomor lama dari data yang sudah ada (boleh bentrok, ditandai di tampilan).';
comment on column public.arsip_nomor.rujukan is 'Kunci agar satu dokumen tidak mengambil dua nomor, mis. sigap_penugasan:123. Kosong untuk pengambilan manual.';

-- nomor urut tidak boleh kembar dalam satu register dan tahun (selain data impor lama)
create unique index if not exists arsip_nomor_urut_uq on public.arsip_nomor (register, tahun, urut) where status = 'terpakai' and sumber <> 'impor';
-- satu dokumen, satu nomor aktif
create unique index if not exists arsip_nomor_rujukan_uq on public.arsip_nomor (jenis, rujukan) where rujukan is not null and status = 'terpakai';
create index if not exists arsip_nomor_tgl_idx on public.arsip_nomor (tahun desc, register, urut desc);
create index if not exists arsip_nomor_keg_idx on public.arsip_nomor (kegiatan_id) where kegiatan_id is not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- Fungsi
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.arsip_susun_nomor(p_format text, p_keamanan text, p_urut integer, p_unit text, p_kka text, p_tahun integer)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(p_format,
    '{keamanan}', coalesce(p_keamanan, '')),
    '{urut}', p_urut::text),
    '{urut3}', lpad(p_urut::text, 3, '0')),
    '{urut4}', lpad(p_urut::text, 4, '0')),
    '{unit}', coalesce(p_unit, '')),
    '{kka}', coalesce(p_kka, '')),
    '{tahun}', p_tahun::text)
$$;

-- Mengambil nomor berikutnya. Idempoten per rujukan: dokumen yang sama selalu mendapat nomor yang sama selama nomornya belum dibatalkan.
create or replace function public.arsip_ambil_nomor(
  p_jenis text, p_kka text default null, p_tanggal date default null, p_perihal text default null,
  p_kegiatan bigint default null, p_rujukan text default null, p_oleh bigint default null, p_nama text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j       public.arsip_jenis%rowtype;
  v_kka   text;
  v_unit  text;
  v_tgl   date;
  v_tahun integer;
  v_urut  integer;
  v_row   public.arsip_nomor%rowtype;
begin
  select * into j from public.arsip_jenis where kode = p_jenis and aktif;
  if not found then
    raise exception 'Jenis dokumen "%" tidak dikenal atau sedang nonaktif.', p_jenis;
  end if;

  if p_rujukan is not null then
    select * into v_row from public.arsip_nomor where jenis = j.kode and rujukan = p_rujukan and status = 'terpakai';
    if found then
      return jsonb_build_object('id', v_row.id, 'nomor', v_row.nomor, 'urut', v_row.urut, 'tahun', v_row.tahun, 'kka', v_row.kka, 'sudah_ada', true);
    end if;
  end if;

  v_tgl := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_tahun := extract(year from v_tgl)::integer;

  v_kka := nullif(btrim(coalesce(p_kka, '')), '');
  if v_kka is null and p_kegiatan is not null then
    select kka into v_kka from public.arsip_kegiatan_kka where kegiatan_id = p_kegiatan;
  end if;
  if v_kka is null then v_kka := j.kka_bawaan; end if;
  if position('{kka}' in j.format) > 0 then
    if v_kka is null then
      raise exception 'Kode klasifikasi arsip untuk "%" belum ditentukan. Pilih kode arsip, atau atur kode arsip kegiatannya di menu Arsip.', j.nama;
    end if;
    if not exists (select 1 from public.arsip_kode where kode = v_kka and aktif) then
      raise exception 'Kode arsip % tidak ada atau sedang nonaktif.', v_kka;
    end if;
  else
    v_kka := null;
  end if;

  select nilai into v_unit from public.arsip_pengaturan where kunci = 'kode_unit';
  if position('{unit}' in j.format) > 0 and v_unit is null then
    raise exception 'Kode unit kerja belum diatur di menu Arsip (Pengaturan).';
  end if;

  insert into public.arsip_counter (register, tahun, terakhir) values (j.register, v_tahun, 0) on conflict do nothing;
  update public.arsip_counter set terakhir = terakhir + 1, diubah_at = now()
   where register = j.register and tahun = v_tahun
   returning terakhir into v_urut;

  insert into public.arsip_nomor (jenis, register, tahun, urut, nomor, kka, tanggal, perihal, kegiatan_id, sumber, rujukan, dibuat_oleh, dibuat_nama)
  values (j.kode, j.register, v_tahun, v_urut, public.arsip_susun_nomor(j.format, j.keamanan, v_urut, v_unit, v_kka, v_tahun), v_kka, v_tgl,
          nullif(btrim(coalesce(p_perihal, '')), ''), p_kegiatan, 'sistem', p_rujukan, p_oleh, p_nama)
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'nomor', v_row.nomor, 'urut', v_row.urut, 'tahun', v_row.tahun, 'kka', v_row.kka, 'sudah_ada', false);
end $$;

-- Mencatat nomor yang terbit di luar sistem (buku agenda manual). Menaikkan hitungan register bila nomornya lebih tinggi.
create or replace function public.arsip_catat_luar(
  p_jenis text, p_urut integer, p_tanggal date, p_perihal text default null, p_kka text default null,
  p_kegiatan bigint default null, p_oleh bigint default null, p_nama text default null, p_nomor text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j       public.arsip_jenis%rowtype;
  v_kka   text;
  v_unit  text;
  v_tahun integer;
  v_nomor text;
  v_row   public.arsip_nomor%rowtype;
begin
  select * into j from public.arsip_jenis where kode = p_jenis;
  if not found then raise exception 'Jenis dokumen "%" tidak dikenal.', p_jenis; end if;
  if p_urut is null or p_urut < 1 then raise exception 'Nomor urut harus bilangan bulat positif.'; end if;
  if p_tanggal is null then raise exception 'Tanggal surat wajib diisi.'; end if;
  v_tahun := extract(year from p_tanggal)::integer;

  select * into v_row from public.arsip_nomor where register = j.register and tahun = v_tahun and urut = p_urut and status = 'terpakai' and sumber <> 'impor';
  if found then
    raise exception 'Nomor urut % tahun % pada register ini sudah tercatat (%).', p_urut, v_tahun, v_row.nomor;
  end if;

  v_kka := nullif(btrim(coalesce(p_kka, '')), '');
  if v_kka is null then v_kka := j.kka_bawaan; end if;
  if position('{kka}' in j.format) > 0 and v_kka is null then
    raise exception 'Kode klasifikasi arsip wajib dipilih untuk jenis "%".', j.nama;
  end if;
  if position('{kka}' in j.format) = 0 then v_kka := null; end if;
  select nilai into v_unit from public.arsip_pengaturan where kunci = 'kode_unit';

  v_nomor := coalesce(nullif(btrim(coalesce(p_nomor, '')), ''), public.arsip_susun_nomor(j.format, j.keamanan, p_urut, v_unit, v_kka, v_tahun));

  insert into public.arsip_counter (register, tahun, terakhir) values (j.register, v_tahun, p_urut)
  on conflict (register, tahun) do update set terakhir = greatest(public.arsip_counter.terakhir, excluded.terakhir), diubah_at = now();

  insert into public.arsip_nomor (jenis, register, tahun, urut, nomor, kka, tanggal, perihal, kegiatan_id, sumber, dibuat_oleh, dibuat_nama)
  values (j.kode, j.register, v_tahun, p_urut, v_nomor, v_kka, p_tanggal, nullif(btrim(coalesce(p_perihal, '')), ''), p_kegiatan, 'luar', p_oleh, p_nama)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'nomor', v_row.nomor, 'urut', v_row.urut, 'tahun', v_row.tahun);
end $$;

-- Membatalkan nomor (tidak dihapus, tidak dipakai ulang).
create or replace function public.arsip_batalkan(p_id bigint, p_alasan text, p_oleh bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.arsip_nomor%rowtype;
begin
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan pembatalan wajib diisi (minimal 5 huruf).'; end if;
  update public.arsip_nomor set status = 'batal', alasan_batal = btrim(p_alasan), batal_oleh = p_oleh, batal_at = now()
   where id = p_id and status = 'terpakai' returning * into v_row;
  if not found then raise exception 'Nomor tidak ditemukan atau sudah dibatalkan.'; end if;
  return jsonb_build_object('id', v_row.id, 'nomor', v_row.nomor);
end $$;

-- Mengatur nomor terakhir yang sudah terpakai (hanya boleh naik).
create or replace function public.arsip_atur_awal(p_register text, p_tahun integer, p_terakhir integer, p_oleh bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lama integer;
begin
  if not exists (select 1 from public.arsip_register where kode = p_register) then raise exception 'Register "%" tidak dikenal.', p_register; end if;
  if p_terakhir is null or p_terakhir < 0 then raise exception 'Nomor terakhir tidak valid.'; end if;
  select terakhir into v_lama from public.arsip_counter where register = p_register and tahun = p_tahun;
  if v_lama is not null and p_terakhir < v_lama then
    raise exception 'Nomor terakhir saat ini % ; hitungan tidak boleh diturunkan agar nomor tidak terpakai dua kali.', v_lama;
  end if;
  insert into public.arsip_counter (register, tahun, terakhir) values (p_register, p_tahun, p_terakhir)
  on conflict (register, tahun) do update set terakhir = excluded.terakhir, diubah_at = now();
  return jsonb_build_object('register', p_register, 'tahun', p_tahun, 'terakhir', p_terakhir, 'sebelumnya', coalesce(v_lama, 0));
end $$;

-- Hanya service role (API) yang boleh memanggil.
revoke all on function public.arsip_ambil_nomor(text, text, date, text, bigint, text, bigint, text) from public, anon, authenticated;
revoke all on function public.arsip_catat_luar(text, integer, date, text, text, bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.arsip_batalkan(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.arsip_atur_awal(text, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.arsip_ambil_nomor(text, text, date, text, bigint, text, bigint, text) to service_role;
grant execute on function public.arsip_catat_luar(text, integer, date, text, text, bigint, bigint, text, text) to service_role;
grant execute on function public.arsip_batalkan(bigint, text, bigint) to service_role;
grant execute on function public.arsip_atur_awal(text, integer, integer, bigint) to service_role;

-- Nomor yang terlewat (ada celah antara 1 dan nomor terakhir yang tercatat) dan nomor urut kembar pada data impor.
create or replace view public.arsip_v_celah as
select c.register, c.tahun, g.urut
  from public.arsip_counter c
  cross join lateral generate_series(1, c.terakhir) as g(urut)
 where not exists (select 1 from public.arsip_nomor n where n.register = c.register and n.tahun = c.tahun and n.urut = g.urut and n.status = 'terpakai');

create or replace view public.arsip_v_kembar as
select register, tahun, urut, count(*) as jumlah, array_agg(nomor order by id) as nomor
  from public.arsip_nomor where status = 'terpakai' group by register, tahun, urut having count(*) > 1;

-- ---------------------------------------------------------------------------------------------------------------------
-- Keamanan: tertutup untuk anon dan authenticated
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.arsip_pengaturan   enable row level security;
alter table public.arsip_kode         enable row level security;
alter table public.arsip_register     enable row level security;
alter table public.arsip_counter      enable row level security;
alter table public.arsip_jenis        enable row level security;
alter table public.arsip_kegiatan_kka enable row level security;
alter table public.arsip_nomor        enable row level security;
revoke all on public.arsip_pengaturan, public.arsip_kode, public.arsip_register, public.arsip_counter, public.arsip_jenis, public.arsip_kegiatan_kka, public.arsip_nomor from anon, authenticated;
revoke all on public.arsip_v_celah, public.arsip_v_kembar from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Isi awal
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.arsip_pengaturan (kunci, nilai) values ('kode_unit', '13030') on conflict do nothing;

-- Kode yang terbukti dipakai pada nomor surat kantor. Arti resmi belum diverifikasi: cocokkan dengan tabel klasifikasi arsip BPS, lalu tandai Terverifikasi.
insert into public.arsip_kode (kode, nama, kelompok, catatan, diverifikasi) values
  ('VS.330', 'Dipakai pada surat tugas kegiatan survei (SPDT NTP, Pendataan Pascabencana)', 'substantif', 'Tercatat dari nomor ST yang sudah terbit. Arti resmi belum diverifikasi.', false),
  ('SS.330', 'Dipakai pada surat tugas Penyisiran SE2026 (sensus)', 'substantif', 'Tercatat dari nomor ST penyisiran yang sudah terbit. Arti resmi belum diverifikasi.', false),
  ('VS.230', 'Dipakai pada undangan pelatihan petugas survei', 'substantif', 'Tercatat dari Undangan B-409/13030/VS.230/2026. Arti resmi belum diverifikasi.', false)
on conflict do nothing;

insert into public.arsip_register (kode, nama, catatan) values
  ('surat_keluar', 'Surat keluar (penugasan dan surat dinas)', 'Satu urutan per tahun untuk semua surat berformat B-nomor/unit/kode arsip/tahun.'),
  ('spk', 'Surat perjanjian / SPK', 'Naskah khusus: nomor dan tahun.'),
  ('bast', 'Berita acara / BAST', 'Naskah khusus: nomor dan tahun.')
on conflict do nothing;

insert into public.arsip_jenis (kode, nama, kategori, register, format, keamanan, kka_bawaan, urutan, dasar) values
  ('st',               'Surat tugas',                              'penugasan',               'surat_keluar', '{keamanan}-{urut}/{unit}/{kka}/{tahun}', 'B', 'VS.330', 10, 'Peraturan BPS 1/2023 Pasal 63 ayat (2)'),
  ('undangan',         'Undangan (pelatihan, rapat) ke luar',      'korespondensi_eksternal', 'surat_keluar', '{keamanan}-{urut}/{unit}/{kka}/{tahun}', 'B', 'VS.230', 20, 'Peraturan BPS 1/2023 Pasal 64 ayat (2)'),
  ('pengantar_nagari', 'Surat pengantar kegiatan ke nagari',       'korespondensi_eksternal', 'surat_keluar', '{keamanan}-{urut}/{unit}/{kka}/{tahun}', 'B', null,     30, 'Peraturan BPS 1/2023 Pasal 64 ayat (2). Bila dianggap naskah khusus, ubah format menjadi {urut}/{tahun} (Pasal 65).'),
  ('surat_dinas',      'Surat dinas lainnya (ke luar)',            'korespondensi_eksternal', 'surat_keluar', '{keamanan}-{urut}/{unit}/{kka}/{tahun}', 'B', null,     40, 'Peraturan BPS 1/2023 Pasal 64 ayat (2)'),
  ('spk',              'Surat perjanjian / SPK',                   'naskah_khusus',           'spk',          '{urut}/{tahun}',                         'B', null,     50, 'Peraturan BPS 1/2023 Pasal 65: nomor dan tahun terbit. Ubah format bila PPK memakai pola lain.'),
  ('bast',             'Berita acara / BAST',                      'naskah_khusus',           'bast',         '{urut}/{tahun}',                         'B', null,     60, 'Peraturan BPS 1/2023 Pasal 65: nomor dan tahun terbit.')
on conflict do nothing;

-- Kode arsip bawaan per kegiatan (isi sesuai kegiatan yang ada; ubah dari menu Arsip)
insert into public.arsip_kegiatan_kka (kegiatan_id, kka)
select k.id, 'VS.330' from public.sigap_kegiatan k where k.nama ilike '%SPDT NTP%' or k.nama ilike '%Pascabencana%'
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- Impor nomor ST yang sudah ada (satu kali; aman diulang)
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.arsip_nomor (jenis, register, tahun, urut, nomor, kka, tanggal, perihal, kegiatan_id, sumber, rujukan, dibuat_nama)
select 'st', 'surat_keluar', m[3]::integer, m[1]::integer, s.nomor_st, m[2], coalesce(s.tanggal_st, s.dibuat_at::date), 'Surat tugas (diimpor dari data SIGAP)', s.kegiatan_id, 'impor', 'sigap_surat_tugas:' || s.id, 'Impor awal'
  from public.sigap_surat_tugas s
 cross join lateral regexp_match(s.nomor_st, '^B-([0-9]+)/[0-9]{5}/([A-Z]{2}\.[0-9]{3})/([0-9]{4})$') as m
 where m is not null
   and not exists (select 1 from public.arsip_nomor a where a.sumber = 'impor' and a.rujukan = 'sigap_surat_tugas:' || s.id);

insert into public.arsip_nomor (jenis, register, tahun, urut, nomor, kka, tanggal, perihal, sumber, rujukan, dibuat_nama)
select 'st', 'surat_keluar', m[3]::integer, m[1]::integer, s.nomor_st, m[2], coalesce(s.tanggal_terbit, s.tanggal_mulai, s.created_at::date), 'Surat tugas penyisiran (diimpor dari data lama)', 'impor', 'spj_surat_tugas:' || s.id, 'Impor awal'
  from public.spj_surat_tugas s
 cross join lateral regexp_match(s.nomor_st, '^B-([0-9]+)/[0-9]{5}/([A-Z]{2}\.[0-9]{3})/([0-9]{4})$') as m
 where m is not null
   and not exists (select 1 from public.arsip_nomor a where a.sumber = 'impor' and a.rujukan = 'spj_surat_tugas:' || s.id);

-- Hitungan register surat keluar = nomor tertinggi yang pernah terpakai per tahun (hanya naik)
insert into public.arsip_counter (register, tahun, terakhir)
select register, tahun, max(urut) from public.arsip_nomor where register = 'surat_keluar' group by register, tahun
on conflict (register, tahun) do update set terakhir = greatest(public.arsip_counter.terakhir, excluded.terakhir), diubah_at = now();

-- ---------------------------------------------------------------------------------------------------------------------
-- Menu Arsip dan izinnya (arsip.kelola)
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.sigap_menu (kode, portal, nama, keterangan, urutan, aktif)
values ('arsip.kelola', 'Arsip', 'Penomoran surat dan buku arsip', 'Buku nomor surat, kode klasifikasi arsip, format nomor, pencatatan nomor luar sistem', 330, true)
on conflict (kode) do nothing;

insert into public.sigap_peran_izin (peran_id, menu_kode, level)
select p.id, 'arsip.kelola', case when p.kode in ('admin_anggaran', 'admin_aplikasi') then 'kelola' else 'lihat' end
  from public.sigap_peran p
 where p.kode in ('admin_anggaran', 'admin_aplikasi', 'bendahara')
   and not exists (select 1 from public.sigap_peran_izin i where i.peran_id = p.id and i.menu_kode = 'arsip.kelola');

commit;

-- ---------------------------------------------------------------------------------------------------------------------
-- Pemeriksaan (jalankan sendiri setelah berkas ini)
-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Hitungan register dan nomor yang diimpor:
--    select register, tahun, terakhir from arsip_counter order by 1, 2;
--    select sumber, count(*), min(urut), max(urut) from arsip_nomor group by 1;
-- 2) Nomor urut kembar pada data lama (mis. B-1429 yang dipakai dua kali):
--    select * from arsip_v_kembar;
-- 3) Celah nomor (nomor yang tidak tercatat di buku, mungkin terbit di luar sistem; catat lewat menu Arsip):
--    select register, tahun, count(*) as nomor_terlewat, min(urut), max(urut) from arsip_v_celah group by 1, 2;
