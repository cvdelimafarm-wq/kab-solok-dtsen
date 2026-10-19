-- 20261019d_kamera_sigap.sql
-- (19 Okt 2026) Kamera SIGAP + berbagi foto bersama + verifikasi kode/QR + saklar kamera/unggah.
--
-- AMAN DIJALANKAN KAPAN SAJA:
--  * Hanya MENAMBAH tabel/kolom/fungsi baru. Tidak mengubah atau menghapus baris yang sudah ada.
--  * Saklar bawaan = 'unggah' (metode lama), jadi sesudah migrasi TIDAK ADA perubahan perilaku
--    sampai akun super sendiri menyalakan kamera di Kelola > Foto kamera.
--  * Idempoten (boleh dijalankan ulang).
--  * Tabel baru: RLS aktif tanpa policy (hanya service role/server). Fungsi: SECURITY DEFINER, tanpa akses publik.
--  * Foto TIDAK PERNAH dihapus otomatis. Trigger di bawah melarang DELETE pada tabel foto & tag.
--
-- Pulihkan (hanya bila perlu, tanpa menyentuh data lama):
--   update sigap_foto_pengaturan set mode_bawaan = 'unggah' where id = 1;
-- (Tabel/kolom baru dibiarkan; sigap_dokumentasi lama tetap berfungsi karena kolom barunya opsional.)

-- ============================================================ 1. Saklar
create table if not exists sigap_foto_pengaturan (
  id           smallint primary key check (id = 1),
  mode_bawaan  text not null default 'unggah' check (mode_bawaan in ('kamera','unggah')),
  diubah_at    timestamptz not null default now(),
  diubah_oleh  bigint references sigap_akun(id)
);
insert into sigap_foto_pengaturan (id, mode_bawaan) values (1, 'unggah') on conflict (id) do nothing;

create table if not exists sigap_foto_pengaturan_kegiatan (
  kegiatan_id  bigint primary key references sigap_kegiatan(id),
  mode         text not null default 'ikuti' check (mode in ('ikuti','kamera','unggah')),
  diubah_at    timestamptz not null default now(),
  diubah_oleh  bigint references sigap_akun(id)
);

-- ============================================================ 2. Foto
create table if not exists sigap_foto (
  id                   bigint generated always as identity primary key,
  kode                 text not null unique,                      -- SGP-XXXX-XXXX-XXXX (tercetak di foto & QR)
  kegiatan_id          bigint not null references sigap_kegiatan(id),
  akun_pengambil       bigint not null references sigap_akun(id),
  tanggal              date   not null,                           -- tanggal WIB dari waktu resmi
  diambil_at           timestamptz not null,                      -- WAKTU RESMI (server + jam monotonik), bukan jam HP
  diterima_at          timestamptz not null default now(),        -- kapan server menerima berkas
  waktu_hp             timestamptz,                               -- jam HP saat potret (pembanding saja)
  selisih_detik        integer,                                   -- waktu_hp - diambil_at
  waktu_terverifikasi  boolean not null default false,            -- true bila memakai token potret
  lat                  double precision,
  lng                  double precision,
  akurasi_m            real,
  posisi_at            timestamptz,
  jarak_wilayah_m      integer,                                   -- jarak ke KK terdekat pada Sub SLS alokasi (slot 2-4)
  lokasi_teks          text,                                      -- nagari/kecamatan bila dikenali
  file_path            text not null,
  ukuran_byte          integer,
  sha256               text not null,                             -- berkas ber-cap (yang disimpan)
  sha256_asli          text not null unique,                      -- berkas mentah kiriman HP (tolak duplikat)
  sidik_gambar         text,                                      -- dHash 64-bit (hex)
  token_nonce          text unique,                               -- token potret sekali pakai
  kepercayaan          text not null default 'hijau' check (kepercayaan in ('hijau','kuning','merah')),
  alasan               text[] not null default '{}',
  status_periksa       text not null default 'belum' check (status_periksa in ('belum','diperiksa','dipertanyakan')),
  diperiksa_oleh       bigint references sigap_akun(id),
  diperiksa_at         timestamptz,
  catatan_periksa      text,
  simpan_sampai        date,                                      -- masa simpan (3 tahun); bukan jadwal hapus
  usul_hapus_at        timestamptz,
  hapus_disetujui_at   timestamptz,
  hapus_disetujui_oleh bigint references sigap_akun(id),
  file_dihapus_at      timestamptz                                -- diisi OLEH ANDA setelah berkas fisik dihapus manual
);
create index if not exists sigap_foto_pengambil_idx on sigap_foto (akun_pengambil, tanggal);
create index if not exists sigap_foto_kegiatan_idx  on sigap_foto (kegiatan_id, tanggal);
create index if not exists sigap_foto_sidik_idx     on sigap_foto (sidik_gambar) where sidik_gambar is not null;
create index if not exists sigap_foto_usul_idx      on sigap_foto (usul_hapus_at) where usul_hapus_at is not null;

create table if not exists sigap_foto_tag (
  id             bigint generated always as identity primary key,
  foto_id        bigint not null references sigap_foto(id),
  akun_id        bigint not null references sigap_akun(id),
  peran_tag      text not null check (peran_tag in ('pemotret','tim','luar_tim')),
  status         text not null default 'diajukan' check (status in ('diajukan','diterima','ditolak','ditahan','dilepas')),
  penugasan_id   bigint references sigap_penugasan(id),
  slot           smallint check (slot between 1 and 5),
  slot_usulan    smallint check (slot_usulan between 1 and 5),
  dokumentasi_id bigint references sigap_dokumentasi(id),
  diajukan_at    timestamptz not null default now(),
  diubah_at      timestamptz not null default now(),
  diubah_oleh    bigint references sigap_akun(id),
  unique (foto_id, akun_id)
);
create index if not exists sigap_foto_tag_akun_idx on sigap_foto_tag (akun_id, status);

create table if not exists sigap_foto_cek (
  id        bigint generated always as identity primary key,
  kode      text,
  hasil     text not null,          -- cocok | mirip | beda | tidak_ada | dibatasi
  akun_id   bigint references sigap_akun(id),
  ip_hash   text,
  dicek_at  timestamptz not null default now()
);
create index if not exists sigap_foto_cek_ip_idx   on sigap_foto_cek (ip_hash, dicek_at);
create index if not exists sigap_foto_cek_kode_idx on sigap_foto_cek (kode);

-- ============================================================ 3. Kolom tambahan di jalur lama (opsional, tidak mengubah baris lama)
alter table sigap_dokumentasi add column if not exists foto_id bigint references sigap_foto(id);
alter table sigap_dokumentasi add column if not exists sumber  text not null default 'unggah';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sigap_dokumentasi_sumber_chk') then
    alter table sigap_dokumentasi add constraint sigap_dokumentasi_sumber_chk check (sumber in ('unggah','kamera'));
  end if;
end $$;
create index if not exists sigap_dokumentasi_foto_idx on sigap_dokumentasi (foto_id) where foto_id is not null;

-- ============================================================ 4. Pengaman integritas (jejak hanya-tambah)
create or replace function sigap_foto_larang_hapus() returns trigger language plpgsql as $f$
begin
  raise exception 'Foto kamera SIGAP tidak boleh dihapus dari basis data. Hapus berkas fisik secara manual setelah persetujuan, lalu isi file_dihapus_at.';
end $f$;

create or replace function sigap_foto_jaga_ubah() returns trigger language plpgsql as $f$
begin
  if new.kode is distinct from old.kode
     or new.kegiatan_id is distinct from old.kegiatan_id
     or new.akun_pengambil is distinct from old.akun_pengambil
     or new.tanggal is distinct from old.tanggal
     or new.diambil_at is distinct from old.diambil_at
     or new.lat is distinct from old.lat
     or new.lng is distinct from old.lng
     or new.akurasi_m is distinct from old.akurasi_m
     or new.file_path is distinct from old.file_path
     or new.sha256 is distinct from old.sha256
     or new.sha256_asli is distinct from old.sha256_asli
     or new.token_nonce is distinct from old.token_nonce then
    raise exception 'Kolom bukti pada sigap_foto tidak boleh diubah.';
  end if;
  return new;
end $f$;

drop trigger if exists sigap_foto_hapus_trg on sigap_foto;
create trigger sigap_foto_hapus_trg before delete on sigap_foto for each row execute function sigap_foto_larang_hapus();
drop trigger if exists sigap_foto_tag_hapus_trg on sigap_foto_tag;
create trigger sigap_foto_tag_hapus_trg before delete on sigap_foto_tag for each row execute function sigap_foto_larang_hapus();
drop trigger if exists sigap_foto_ubah_trg on sigap_foto;
create trigger sigap_foto_ubah_trg before update on sigap_foto for each row execute function sigap_foto_jaga_ubah();

-- ============================================================ 5. Penempatan atomik: foto -> nomor foto kegiatan (sigap_dokumentasi)
-- Tidak menghapus: bila nomor sudah terisi, tag foto lama dilepas (status 'dilepas') dan berkas lama dicatat ke sigap_audit.
-- Validasi hari kerja / 23.59 / kunci / periode dilakukan di kode aplikasi (cekAksesIsian) SEBELUM fungsi ini dipanggil.
create or replace function sigap_foto_tempatkan(
  p_tag_id bigint, p_akun_id bigint, p_penugasan_id bigint, p_slot smallint,
  p_susulan boolean default false, p_tahan boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  t   sigap_foto_tag%rowtype;
  f   sigap_foto%rowtype;
  pen sigap_penugasan%rowtype;
  d   sigap_dokumentasi%rowtype;
  dok_id bigint;
  lama_path text; lama_foto bigint;
begin
  select * into t from sigap_foto_tag where id = p_tag_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'tag_tidak_ada'); end if;
  if t.akun_id <> p_akun_id then return jsonb_build_object('ok', false, 'error', 'bukan_milik_anda'); end if;
  if t.status not in ('diajukan','ditahan') then return jsonb_build_object('ok', false, 'error', 'sudah_diputuskan', 'status', t.status); end if;
  if p_slot is null or p_slot < 1 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'slot_tidak_valid'); end if;

  select * into f from sigap_foto where id = t.foto_id;
  select * into pen from sigap_penugasan where id = p_penugasan_id and akun_id = p_akun_id and aktif;
  if not found then return jsonb_build_object('ok', false, 'error', 'penugasan_tidak_valid'); end if;

  if p_tahan then   -- kepercayaan merah: simpan pilihan, belum ditulis ke nomor foto sampai diperiksa
    update sigap_foto_tag set status = 'ditahan', penugasan_id = p_penugasan_id, slot = p_slot,
           diubah_at = now(), diubah_oleh = p_akun_id where id = t.id;
    return jsonb_build_object('ok', true, 'status', 'ditahan');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sigapfoto:' || p_penugasan_id || ':' || f.tanggal || ':' || p_slot, 0));

  select * into d from sigap_dokumentasi where penugasan_id = p_penugasan_id and tanggal = f.tanggal and slot = p_slot for update;
  if found then
    lama_path := d.file_path; lama_foto := d.foto_id;
    if lama_foto is not null then
      update sigap_foto_tag set status = 'dilepas', dokumentasi_id = null, diubah_at = now(), diubah_oleh = p_akun_id
       where dokumentasi_id = d.id and id <> t.id;
    end if;
    update sigap_dokumentasi set foto_id = f.id, sumber = 'kamera', file_path = f.file_path,
           file_nama_asli = f.kode || '.jpg', ukuran_byte = f.ukuran_byte, susulan = p_susulan, diunggah_at = now()
     where id = d.id;
    dok_id := d.id;
    insert into sigap_audit (akun_id, aksi, detail) values (p_akun_id, 'foto.nomor_diganti',
      jsonb_build_object('penugasan_id', p_penugasan_id, 'tanggal', f.tanggal, 'slot', p_slot,
                         'file_lama', lama_path, 'foto_lama', lama_foto, 'foto_baru', f.id, 'kode', f.kode));
  else
    insert into sigap_dokumentasi (kegiatan_id, petugas_id, tanggal, slot, file_path, file_nama_asli, ukuran_byte, susulan, penugasan_id, foto_id, sumber)
    values (pen.kegiatan_id, null, f.tanggal, p_slot, f.file_path, f.kode || '.jpg', f.ukuran_byte, p_susulan, p_penugasan_id, f.id, 'kamera')
    returning id into dok_id;
  end if;

  update sigap_foto_tag set status = 'diterima', penugasan_id = p_penugasan_id, slot = p_slot, dokumentasi_id = dok_id,
         diubah_at = now(), diubah_oleh = p_akun_id where id = t.id;
  return jsonb_build_object('ok', true, 'status', 'diterima', 'dokumentasi_id', dok_id, 'file_lama', lama_path);
end $f$;

-- Melepas tag 'ditahan' sesudah foto diperiksa PML/admin (memanggil fungsi di atas atas nama pemilik tag).
create or replace function sigap_foto_lepas_tahan(p_foto_id bigint, p_oleh bigint)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare r record; hasil jsonb; n int := 0; gagal int := 0;
begin
  for r in select id, akun_id, penugasan_id, slot from sigap_foto_tag
            where foto_id = p_foto_id and status = 'ditahan' and penugasan_id is not null and slot is not null loop
    update sigap_foto_tag set status = 'diajukan' where id = r.id;
    hasil := sigap_foto_tempatkan(r.id, r.akun_id, r.penugasan_id, r.slot, false, false);
    if (hasil->>'ok')::boolean then n := n + 1; else gagal := gagal + 1; end if;
  end loop;
  insert into sigap_audit (akun_id, aksi, detail) values (p_oleh, 'foto.tahan_dilepas', jsonb_build_object('foto_id', p_foto_id, 'berhasil', n, 'gagal', gagal));
  return jsonb_build_object('ok', true, 'berhasil', n, 'gagal', gagal);
end $f$;

revoke all on function sigap_foto_tempatkan(bigint, bigint, bigint, smallint, boolean, boolean) from public, anon, authenticated;
revoke all on function sigap_foto_lepas_tahan(bigint, bigint) from public, anon, authenticated;

-- ============================================================ 6. RLS: aktif tanpa policy (hanya service role)
alter table sigap_foto_pengaturan           enable row level security;
alter table sigap_foto_pengaturan_kegiatan  enable row level security;
alter table sigap_foto                      enable row level security;
alter table sigap_foto_tag                  enable row level security;
alter table sigap_foto_cek                  enable row level security;

-- ============================================================ 7. Pemeriksaan (hanya membaca)
select 'sigap_foto_pengaturan' as tabel, mode_bawaan::text as isi from sigap_foto_pengaturan
union all select 'sigap_foto', count(*)::text from sigap_foto
union all select 'sigap_dokumentasi.sumber=unggah', count(*)::text from sigap_dokumentasi where sumber = 'unggah';
