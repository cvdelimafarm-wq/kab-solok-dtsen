-- supabase/migrations/20260916_kp_anomali.sql
--
-- Skema untuk fitur "Anomali Cepat" (tab ke-4 /seruti) — deteksi anomali
-- VSEN26.KP dari hasil export aplikasi desktop entri Susenas, dgn alur
-- konfirmasi PPL per temuan.
--
-- Cara pakai: jalankan lewat Supabase SQL Editor (dashboard project
-- dtsen-usulan-solok), atau lewat Supabase CLI kalau sudah pakai migrasi
-- terstruktur di repo (`supabase db push`).

-- ---------- kp_anomali_upload: metadata tiap batch upload ----------
create table if not exists kp_anomali_upload (
  id bigint generated always as identity primary key,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,          -- email/nama user yg upload (isi dari session auth di route handler)
  keterangan text,           -- mis. "Semester 2 - 2026, Kab Solok"
  filenames text,            -- daftar nama file yang diproses, dipisah koma
  total_temuan integer
);

-- ---------- kp_anomali_temuan: satu baris = satu temuan anomali ----------
-- Finding + status konfirmasi digabung jadi satu tabel (lebih sederhana
-- utk CRUD dari sisi Next.js dibanding pisah 2 tabel + join).
create table if not exists kp_anomali_temuan (
  id bigint generated always as identity primary key,
  upload_id bigint not null references kp_anomali_upload(id) on delete cascade,

  kode_anomali text not null,        -- mis. 'KP-01', 'KP-11.015'
  kelompok text,                     -- mis. 'E. Verifikasi Substansi Komoditas'
  nks text,
  nurt text,
  nourutkomo integer,
  nama_krt text,
  keterangan text,                   -- pesan tetap per jenis anomali
  rincian text,                      -- nama rincian komoditas (khusus KP-11.xxx)
  kategori text,
  nama_lainnya text,                 -- isian teks bebas "sebutkan" (khusus KP-11.xxx)
  banyak numeric,
  nilai numeric,
  detail jsonb,                      -- data tambahan mentah per jenis cek

  status text not null default 'pending'
    check (status in ('pending', 'sesuai', 'perlu_koreksi')),
  catatan_ppl text,
  nama_ppl text,
  confirmed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_kp_temuan_upload on kp_anomali_temuan (upload_id);
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
--
-- Kalau nanti mau dibatasi (mis. cuma PPL yg terdaftar boleh konfirmasi),
-- perlu tabel referensi jorong/PPL ↔ NKS yang belum ada saat ini.

create policy "public read kp_anomali_upload"
  on kp_anomali_upload for select
  to anon, authenticated
  using (true);

create policy "public read kp_anomali_temuan"
  on kp_anomali_temuan for select
  to anon, authenticated
  using (true);

-- Konfirmasi PPL: update status/catatan_ppl/nama_ppl/confirmed_at.
create policy "public update kp_anomali_temuan"
  on kp_anomali_temuan for update
  to anon, authenticated
  using (true)
  with check (true);

-- INSERT sengaja TIDAK dibuka untuk role 'authenticated' — proses upload &
-- generate temuan dilakukan lewat API route (app/api/anomali-kp/upload)
-- yang memakai SUPABASE_SERVICE_ROLE_KEY (server-side only, bypass RLS).
-- Ini mencegah user biasa menyuntik data temuan palsu langsung dari client.

-- ---------- RPC ringkasan per kode anomali (dipakai tab Daftar Anomali) ----------
create or replace function kp_anomali_summary(p_upload_id bigint)
returns table (
  kode_anomali text,
  kelompok text,
  total bigint,
  pending bigint,
  sesuai bigint,
  perlu_koreksi bigint
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
    count(*) filter (where status = 'perlu_koreksi') as perlu_koreksi
  from kp_anomali_temuan
  where upload_id = p_upload_id
  group by kode_anomali
  order by kode_anomali;
$$;

grant execute on function kp_anomali_summary(bigint) to anon, authenticated;
