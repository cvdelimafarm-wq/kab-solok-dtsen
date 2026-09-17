-- supabase/migrations/20260917_penyisiran_usaha.sql
--
-- Skema untuk fitur "Lembar Pengecekan Penyisiran Undercoverage Usaha"
-- (menu baru di /seruti) — daftar keluarga hasil pencocokan SE2026 vs
-- DUTP/DTSEN/PNM Mekar (dari script penyisiran_undercoverage_usaha.py di
-- komputer BPS Kab Solok, dijalankan OFFLINE) yang perlu dikunjungi ulang
-- petugas lapangan untuk verifikasi indikasi usaha.
--
-- BEDA PENTING dari kp_anomali_* / seruti_sampel dkk: tabel di sini berisi
-- NAMA KEPALA KELUARGA, ALAMAT, dan KOORDINAT GPS PRESISI warga (TIDAK ada
-- NIK/Nomor KK sama sekali -- sudah dibuang di sisi script Python sebelum
-- pernah meninggalkan komputer BPS). Karena datanya tetap sensitif, tabel
-- ini SENGAJA TIDAK dibuka untuk role anon/authenticated sama sekali
-- (beda dari kp_anomali_temuan yang memang didesain public-read). Semua
-- akses -- baca maupun tulis -- WAJIB lewat app/api/penyisiran/*, yang
-- mewajibkan token sesi hasil verifikasi PIN (lihat lib/penyisiranAuth.ts)
-- dan memakai SUPABASE_SERVICE_ROLE_KEY di server (bypass RLS).
--
-- File ini AMAN dijalankan ulang (idempotent).
-- Cara pakai: Supabase SQL Editor (dashboard project dtsen-usulan-solok)
-- -> paste seluruh isi file ini -> Run.

create table if not exists penyisiran_usaha (
  id bigint generated always as identity primary key,
  kode_identitas text not null,   -- field "id" dari data_checklist_penyisiran.json (natural key)
  idsubsls text,
  kec_kode text,
  kec_nama text,
  nagari_kode text,
  nagari_nama text,
  sls_kode text,
  sls_nama text,
  subsls_kode text,
  nama_kk text,
  alamat text,
  lat double precision,
  lng double precision,
  bukti_dutp boolean not null default false,
  bukti_dtsen boolean not null default false,
  bukti_pnm boolean not null default false,
  pnm_sektor text,
  pnm_subsektor text,
  dtsen_lapangan_usaha text,
  catatan_sensus text,

  -- diisi petugas lapangan lewat menu ini:
  status_kunjungan text not null default 'belum',
  catatan_petugas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table penyisiran_usaha drop constraint if exists penyisiran_usaha_status_check;
alter table penyisiran_usaha add constraint penyisiran_usaha_status_check
  check (status_kunjungan in ('belum', 'ditemukan', 'tidak_ditemukan', 'tidak_bisa'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'penyisiran_usaha_kode_identitas_key'
  ) then
    alter table penyisiran_usaha add constraint penyisiran_usaha_kode_identitas_key unique (kode_identitas);
  end if;
end $$;

create index if not exists idx_penyisiran_kec on penyisiran_usaha (kec_kode);
create index if not exists idx_penyisiran_nagari on penyisiran_usaha (kec_kode, nagari_kode);
create index if not exists idx_penyisiran_status on penyisiran_usaha (status_kunjungan);
create index if not exists idx_penyisiran_koordinat on penyisiran_usaha (lat, lng) where lat is not null;

-- ---------- Row Level Security: AKTIF, TANPA policy anon/authenticated ----------
alter table penyisiran_usaha enable row level security;
revoke all on penyisiran_usaha from anon, authenticated;

-- ---------- RPC: upsert satu batch dari data_checklist_penyisiran.json ----------
-- Dipanggil oleh app/api/penyisiran/upload/route.ts. Pola "catatan hidup"
-- sama seperti kp_anomali_upsert_batch: kalau kode_identitas SUDAH ada,
-- kolom data sumber (wilayah/bukti usaha) diperbarui, TAPI status_kunjungan
-- & catatan_petugas yang sudah diisi petugas lapangan SENGAJA TIDAK
-- disentuh -- supaya upload ulang (mis. setelah data sumber diperbaiki)
-- tidak menghapus progres checklist yang sudah jalan.
create or replace function penyisiran_upsert_batch(p_rows jsonb)
returns table (baru int, diperbarui int)
language plpgsql
as $$
declare
  v_item jsonb;
  v_ada boolean;
  v_baru int := 0;
  v_diperbarui int := 0;
begin
  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    select exists(
      select 1 from penyisiran_usaha where kode_identitas = (v_item->>'id')
    ) into v_ada;

    if v_ada then
      update penyisiran_usaha set
        idsubsls = v_item->>'idsubsls',
        kec_kode = v_item->>'kec_kode',
        kec_nama = v_item->>'kec_nama',
        nagari_kode = v_item->>'nagari_kode',
        nagari_nama = v_item->>'nagari_nama',
        sls_kode = v_item->>'sls_kode',
        sls_nama = v_item->>'sls_nama',
        subsls_kode = v_item->>'subsls_kode',
        nama_kk = v_item->>'nama_kk',
        alamat = v_item->>'alamat',
        lat = nullif(v_item->>'lat', '')::double precision,
        lng = nullif(v_item->>'lng', '')::double precision,
        bukti_dutp = coalesce((v_item->>'bukti_dutp')::boolean, false),
        bukti_dtsen = coalesce((v_item->>'bukti_dtsen')::boolean, false),
        bukti_pnm = coalesce((v_item->>'bukti_pnm')::boolean, false),
        pnm_sektor = v_item->>'pnm_sektor',
        pnm_subsektor = v_item->>'pnm_subsektor',
        dtsen_lapangan_usaha = v_item->>'dtsen_lapangan_usaha',
        catatan_sensus = v_item->>'catatan_sensus',
        updated_at = now()
      where kode_identitas = (v_item->>'id');
      v_diperbarui := v_diperbarui + 1;
    else
      insert into penyisiran_usaha (
        kode_identitas, idsubsls, kec_kode, kec_nama, nagari_kode, nagari_nama,
        sls_kode, sls_nama, subsls_kode, nama_kk, alamat, lat, lng,
        bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, pnm_subsektor,
        dtsen_lapangan_usaha, catatan_sensus
      ) values (
        v_item->>'id', v_item->>'idsubsls', v_item->>'kec_kode', v_item->>'kec_nama',
        v_item->>'nagari_kode', v_item->>'nagari_nama', v_item->>'sls_kode', v_item->>'sls_nama',
        v_item->>'subsls_kode', v_item->>'nama_kk', v_item->>'alamat',
        nullif(v_item->>'lat', '')::double precision, nullif(v_item->>'lng', '')::double precision,
        coalesce((v_item->>'bukti_dutp')::boolean, false),
        coalesce((v_item->>'bukti_dtsen')::boolean, false),
        coalesce((v_item->>'bukti_pnm')::boolean, false),
        v_item->>'pnm_sektor', v_item->>'pnm_subsektor',
        v_item->>'dtsen_lapangan_usaha', v_item->>'catatan_sensus'
      );
      v_baru := v_baru + 1;
    end if;
  end loop;

  return query select v_baru, v_diperbarui;
end;
$$;

grant execute on function penyisiran_upsert_batch(jsonb) to service_role;

-- ---------- RPC: ringkasan (stat tile + daftar kecamatan utk filter) ----------
create or replace function penyisiran_summary()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total', count(*),
    'belum', count(*) filter (where status_kunjungan = 'belum'),
    'ditemukan', count(*) filter (where status_kunjungan = 'ditemukan'),
    'tidak_ditemukan', count(*) filter (where status_kunjungan = 'tidak_ditemukan'),
    'tidak_bisa', count(*) filter (where status_kunjungan = 'tidak_bisa'),
    'kecamatan', (
      select coalesce(jsonb_agg(jsonb_build_object('kode', kec_kode, 'nama', kec_nama, 'jumlah', jumlah) order by kec_nama), '[]'::jsonb)
      from (
        select kec_kode, max(kec_nama) as kec_nama, count(*) as jumlah
        from penyisiran_usaha
        where kec_kode is not null and kec_kode <> ''
        group by kec_kode
      ) k
    )
  )
  from penyisiran_usaha;
$$;

grant execute on function penyisiran_summary() to service_role;

-- ---------- RPC: daftar nagari (utk filter tahap 2, setelah kecamatan dipilih) ----------
create or replace function penyisiran_nagari_list(p_kec text)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('kode', nagari_kode, 'nama', nagari_nama, 'jumlah', jumlah) order by nagari_nama), '[]'::jsonb)
  from (
    select nagari_kode, max(nagari_nama) as nagari_nama, count(*) as jumlah
    from penyisiran_usaha
    where kec_kode = p_kec and nagari_kode is not null and nagari_kode <> ''
    group by nagari_kode
  ) n;
$$;

grant execute on function penyisiran_nagari_list(text) to service_role;
