-- supabase/migrations/20260916_kp_anomali.sql
--
-- Skema untuk fitur "Anomali Cepat" (tab ke-4 /seruti) — deteksi anomali
-- VSEN26.KP dari hasil export aplikasi desktop entri Susenas, dgn alur
-- konfirmasi PPL per temuan.
--
-- MODEL DATA: "catatan hidup" (live record), BUKAN snapshot per-upload.
-- Aplikasi desktop entri MENIMPA/menghapus data lama tiap ada perbaikan —
-- jadi tiap file yang diupload adalah SNAPSHOT LENGKAP kondisi terkini,
-- bukan cuma data baru. Karena itu:
--   - Temuan yang sama & nilainya sama antar-upload -> status konfirmasi
--     PPL yang sudah ada TETAP dipertahankan (tidak perlu dikonfirmasi ulang).
--   - Temuan yang nilainya BERUBAH -> otomatis balik ke 'pending' (perlu
--     dicek ulang, karena datanya sudah beda dari saat terakhir dikonfirmasi).
--   - Temuan lama yang TIDAK MUNCUL LAGI di upload terbaru (sudah diperbaiki
--     sampai anomalinya hilang, atau RT-nya dihapus) -> otomatis ditandai
--     'resolved', bukan dihapus, supaya ada jejak riwayat.
--
-- File ini AMAN dijalankan ulang (idempotent) — pakai IF NOT EXISTS /
-- DROP...IF EXISTS di semua tempat, jadi boleh di-run lagi tanpa error
-- meskipun sebagian sudah pernah dijalankan sebelumnya.
--
-- Cara pakai: Supabase SQL Editor (dashboard project dtsen-usulan-solok)
-- → paste seluruh isi file ini → Run.

-- ---------- kp_anomali_upload: log tiap kali file diupload (audit trail) ----------
create table if not exists kp_anomali_upload (
  id bigint generated always as identity primary key,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  keterangan text,           -- mis. "Semester 2 - 2026, Kab Solok"
  filenames text,            -- daftar nama file yang diproses, dipisah koma
  total_temuan integer       -- jumlah temuan pada snapshot ini (utk info saja)
);

-- Kolom ringkasan tambahan — pakai ALTER TABLE ADD COLUMN IF NOT EXISTS
-- (bukan cuma di dalam CREATE TABLE di atas) supaya TETAP ditambahkan
-- meskipun tabelnya sudah pernah dibuat lebih dulu dari versi migrasi
-- yang lebih lama sebelum kolom-kolom ini ada (CREATE TABLE IF NOT EXISTS
-- akan MELEWATI tabel yang sudah ada, jadi kolom baru di dalamnya tidak
-- pernah ikut ditambahkan kalau cuma diandalkan dari situ).
alter table kp_anomali_upload add column if not exists jumlah_baru integer;
alter table kp_anomali_upload add column if not exists jumlah_berubah integer;
alter table kp_anomali_upload add column if not exists jumlah_tetap integer;
alter table kp_anomali_upload add column if not exists jumlah_selesai integer;

-- ---------- kp_anomali_temuan: catatan HIDUP, satu baris per temuan unik ----------
create table if not exists kp_anomali_temuan (
  id bigint generated always as identity primary key,
  natural_key text,                  -- kunci unik: kode_anomali|nks|nurt|nourutkomo

  kode_anomali text not null,        -- mis. 'KP-01', 'KP-11.015'
  kelompok text,
  nks text,
  nurt text,
  nourutkomo integer,
  nama_krt text,
  keterangan text,
  rincian text,
  kategori text,
  nama_lainnya text,
  banyak numeric,
  nilai numeric,
  detail jsonb,

  status text not null default 'pending',
  catatan_ppl text,
  nama_ppl text,
  confirmed_at timestamptz,

  first_seen_upload_id bigint references kp_anomali_upload(id),
  last_seen_upload_id bigint references kp_anomali_upload(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kolom/constraint tambahan kalau tabel sudah pernah dibuat versi lama (aman diulang):
alter table kp_anomali_temuan add column if not exists natural_key text;
alter table kp_anomali_temuan add column if not exists first_seen_upload_id bigint references kp_anomali_upload(id);
alter table kp_anomali_temuan add column if not exists last_seen_upload_id bigint references kp_anomali_upload(id);
alter table kp_anomali_temuan add column if not exists updated_at timestamptz not null default now();
alter table kp_anomali_temuan add column if not exists narasi text; -- kalimat penjelasan lengkap dgn angka sungguhan

-- status sekarang juga boleh 'resolved' — drop constraint lama kalau ada, buat ulang
alter table kp_anomali_temuan drop constraint if exists kp_anomali_temuan_status_check;
alter table kp_anomali_temuan add constraint kp_anomali_temuan_status_check
  check (status in ('pending', 'sesuai', 'perlu_koreksi', 'resolved'));

-- Isi natural_key utk baris lama (kalau ada sisa dari percobaan sebelumnya)
update kp_anomali_temuan
set natural_key = kode_anomali || '|' || coalesce(nks,'') || '|' || coalesce(nurt,'') || '|' || coalesce(nourutkomo::text,'')
where natural_key is null;

-- Kalau ada duplikat natural_key dari data percobaan lama, unique constraint di
-- bawah akan GAGAL. Kalau itu terjadi: cara termudah, kosongkan dulu tabelnya
-- (data lama cuma hasil percobaan, aman dihapus) lalu jalankan ulang file ini:
--   truncate table kp_anomali_temuan restart identity;
--   truncate table kp_anomali_upload restart identity cascade;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kp_anomali_temuan_natural_key_key'
  ) then
    alter table kp_anomali_temuan add constraint kp_anomali_temuan_natural_key_key unique (natural_key);
  end if;
end $$;

create index if not exists idx_kp_temuan_kode on kp_anomali_temuan (kode_anomali);
create index if not exists idx_kp_temuan_status on kp_anomali_temuan (status);
create index if not exists idx_kp_temuan_nks_nurt on kp_anomali_temuan (nks, nurt);

-- ---------- Row Level Security ----------
alter table kp_anomali_upload enable row level security;
alter table kp_anomali_temuan enable row level security;

-- PENTING: halaman /seruti TIDAK memakai login (middleware.ts cuma
-- melindungi /dashboard/:path*) — PPL & siapa pun yang punya link akses
-- langsung tanpa Supabase Auth session, memakai anon key dari browser.
-- Jadi kebijakan di bawah dibuka untuk role `anon` juga, MENGIKUTI pola
-- yang sudah dipakai tabel seruti_sampel/seruti_ppl (lihat update
-- langsung dari client di app/seruti/page.tsx, fungsi submitJorong()).

drop policy if exists "public read kp_anomali_upload" on kp_anomali_upload;
create policy "public read kp_anomali_upload"
  on kp_anomali_upload for select
  to anon, authenticated
  using (true);

drop policy if exists "public read kp_anomali_temuan" on kp_anomali_temuan;
create policy "public read kp_anomali_temuan"
  on kp_anomali_temuan for select
  to anon, authenticated
  using (true);

-- Konfirmasi PPL: update status/catatan_ppl/nama_ppl/confirmed_at.
drop policy if exists "public update kp_anomali_temuan" on kp_anomali_temuan;
create policy "public update kp_anomali_temuan"
  on kp_anomali_temuan for update
  to anon, authenticated
  using (true)
  with check (true);

-- PENTING: RLS policy di atas cuma mengatur BARIS mana yang boleh diakses —
-- role anon/authenticated masih butuh izin dasar GRANT di level tabel
-- (terlewat kalau tabel dibuat lewat SQL Editor manual, beda dgn tabel yang
-- dibuat lewat Table Editor UI Supabase yang otomatis kasih grant ini).
-- Tanpa GRANT ini, semua query dari browser akan gagal dgn
-- "permission denied for table ..." walau kebijakan RLS-nya sudah benar.
grant select on kp_anomali_upload to anon, authenticated;
grant select, update on kp_anomali_temuan to anon, authenticated;

-- INSERT/UPSERT sengaja TIDAK dibuka untuk role anon/authenticated — proses
-- upload & upsert temuan HANYA lewat API route (app/api/anomali-kp/upload)
-- yang memakai SUPABASE_SERVICE_ROLE_KEY (server-side, bypass RLS). Ini
-- mencegah user biasa menyuntik data temuan palsu langsung dari client.

-- ---------- RPC utama: upsert satu batch temuan dari hasil parsing terbaru ----------
-- Dipanggil oleh app/api/anomali-kp/upload/route.ts, satu kali per upload,
-- dengan p_findings = array JSON seluruh temuan hasil runAllChecks().
create or replace function kp_anomali_upsert_batch(p_upload_id bigint, p_findings jsonb)
returns table (baru int, berubah int, tetap int, selesai int)
language plpgsql
as $$
declare
  v_item jsonb;
  v_key text;
  v_existing kp_anomali_temuan%rowtype;
  v_new_banyak numeric;
  v_new_nilai numeric;
  v_new_nama_lainnya text;
  v_changed boolean;
  v_baru int := 0;
  v_berubah int := 0;
  v_tetap int := 0;
  v_selesai int := 0;
begin
  for v_item in select * from jsonb_array_elements(p_findings)
  loop
    v_key := (v_item->>'kode_anomali') || '|' || coalesce(v_item->>'nks','') || '|'
             || coalesce(v_item->>'nurt','') || '|' || coalesce(v_item->>'nourutkomo','');
    v_new_banyak := nullif(v_item->>'banyak','')::numeric;
    v_new_nilai := nullif(v_item->>'nilai','')::numeric;
    v_new_nama_lainnya := v_item->>'nama_lainnya';

    select * into v_existing from kp_anomali_temuan where natural_key = v_key;

    if not found then
      insert into kp_anomali_temuan (
        natural_key, kode_anomali, kelompok, nks, nurt, nourutkomo, nama_krt,
        keterangan, narasi, rincian, kategori, nama_lainnya, banyak, nilai, detail,
        status, first_seen_upload_id, last_seen_upload_id, created_at, updated_at
      ) values (
        v_key, v_item->>'kode_anomali', v_item->>'kelompok',
        v_item->>'nks', v_item->>'nurt', nullif(v_item->>'nourutkomo','')::int, v_item->>'nama_krt',
        v_item->>'keterangan', v_item->>'narasi', v_item->>'rincian', v_item->>'kategori', v_new_nama_lainnya,
        v_new_banyak, v_new_nilai, v_item->'detail',
        'pending', p_upload_id, p_upload_id, now(), now()
      );
      v_baru := v_baru + 1;
    else
      v_changed := (
        v_existing.banyak is distinct from v_new_banyak
        or v_existing.nilai is distinct from v_new_nilai
        or v_existing.nama_lainnya is distinct from v_new_nama_lainnya
        or v_existing.detail is distinct from (v_item->'detail')
      );

      -- SELALU perbarui field deskriptif/kosmetik (keterangan, narasi, dst) —
      -- terlepas dari apakah nilainya berubah atau tidak. Ini penting supaya
      -- perbaikan pada logika narasi/keterangan di kode ikut ter-backfill ke
      -- temuan lama yang sudah ada saat diupload ulang, tanpa mereset status
      -- konfirmasi PPL yang tidak perlu (status cuma direset di blok
      -- v_changed di bawah, kalau NILAI-nya yang benar-benar berubah).
      update kp_anomali_temuan set
        kelompok = v_item->>'kelompok',
        nama_krt = v_item->>'nama_krt',
        keterangan = v_item->>'keterangan',
        narasi = v_item->>'narasi',
        rincian = v_item->>'rincian',
        kategori = v_item->>'kategori',
        last_seen_upload_id = p_upload_id,
        updated_at = now()
      where natural_key = v_key;

      if v_changed then
        update kp_anomali_temuan set
          nama_lainnya = v_new_nama_lainnya,
          banyak = v_new_banyak,
          nilai = v_new_nilai,
          detail = v_item->'detail',
          status = 'pending',
          catatan_ppl = null,
          nama_ppl = null,
          confirmed_at = null,
          updated_at = now()
        where natural_key = v_key;
        v_berubah := v_berubah + 1;
      else
        v_tetap := v_tetap + 1;
      end if;
    end if;
  end loop;

  -- Temuan lama yang TIDAK ter-touch di upload ini (natural_key-nya tidak
  -- ada lagi di p_findings) dan belum 'resolved' -> tandai 'resolved'.
  update kp_anomali_temuan
  set status = 'resolved', updated_at = now()
  where last_seen_upload_id <> p_upload_id
    and status <> 'resolved';
  get diagnostics v_selesai = row_count;

  return query select v_baru, v_berubah, v_tetap, v_selesai;
end;
$$;

grant execute on function kp_anomali_upsert_batch(bigint, jsonb) to service_role;

-- ---------- RPC ringkasan per kode anomali (kondisi TERKINI, bukan per-upload) ----------
create or replace function kp_anomali_summary()
returns table (
  kode_anomali text,
  kelompok text,
  total bigint,
  pending bigint,
  sesuai bigint,
  perlu_koreksi bigint,
  resolved bigint
)
language sql
stable
as $$
  select
    kode_anomali,
    max(kelompok) as kelompok,
    count(*) as total,
    count(*) filter (where status = 'pending') as pending,
    count(*) filter (where status = 'sesuai') as sesuai,
    count(*) filter (where status = 'perlu_koreksi') as perlu_koreksi,
    count(*) filter (where status = 'resolved') as resolved
  from kp_anomali_temuan
  group by kode_anomali
  order by kode_anomali;
$$;

grant execute on function kp_anomali_summary() to anon, authenticated;
