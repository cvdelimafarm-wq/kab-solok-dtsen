-- =====================================================================
-- 20261028c_laporan_isi.sql
-- (28 Okt 2026, permintaan user) "Isi laporan SPJ": data apa yang dilampirkan pada Laporan Perjalanan Dinas per level (PPL, PML, korwil),
-- diatur per kegiatan di Kelola Pendataan > Persiapan. Berisi:
--   1. tabel sigap_laporan_isi_konfig (pengaturan per kegiatan; kosong = bawaan di kode);
--   2. fungsi sigap_isi_harian(akun[], dari, sampai, kegiatan): hasil pendataan terakhir tiap KK per hari WIB (kategori, alasan, Sub SLS) + jarak alokasi
--      rumah petugas ke Sub SLS -- dipakai laporan PPL / PML (tim) / korwil (kelompok). Hanya membaca.
-- Aturan hitung sama dengan bencana_realisasi_otomatis: hasil TERAKHIR tiap KK pada hari itu (WIB) PER PETUGAS, KK aktif (KK yang dicatat dua petugas pada hari yang sama dihitung di laporan masing-masing, seperti angka realisasi mereka). Tanpa hapus data; hak akses hanya service_role.
-- Aman dijalankan sebelum/sesudah deploy kode: bila tabel/fungsi belum ada, laporan memakai pengaturan bawaan dan tanpa lampiran data.
-- Jalankan oleh user (DDL produksi); lalu jalankan 70_uji_laporan_isi.sql (hanya SELECT).
-- =====================================================================
create table if not exists public.sigap_laporan_isi_konfig (
  kegiatan_id bigint primary key references public.sigap_kegiatan(id),
  konfig      jsonb not null,
  diubah_oleh text,
  diubah_at   timestamptz not null default now()
);
comment on table public.sigap_laporan_isi_konfig is 'Pengaturan Isi laporan SPJ per kegiatan (lampiran per level, judul/uraian, label variabel identifikasi). Lihat lib/sigapLaporanIsi.ts.';
alter table public.sigap_laporan_isi_konfig enable row level security;
revoke all on table public.sigap_laporan_isi_konfig from anon, authenticated;
grant all on table public.sigap_laporan_isi_konfig to service_role;

create or replace function public.sigap_isi_harian(p_akun_ids bigint[], p_dari date, p_sampai date, p_kegiatan_id bigint)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with terakhir as (
    select distinct on (l.akun_id, l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date)
           (l.waktu_kejadian at time zone 'Asia/Jakarta')::date as d, l.akun_id, l.hasil, l.alasan, k.idsubsls
      from public.bencana_pendataan_log l
      join public.bencana_pendataan_kk k on k.id = l.kk_id and k.aktif and k.kegiatan_id = p_kegiatan_id
     where l.akun_id = any(p_akun_ids)
       and (l.waktu_kejadian at time zone 'Asia/Jakarta')::date between p_dari and p_sampai
     order by l.akun_id, l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date, l.waktu_kejadian desc, l.id desc
  )
  select coalesce(jsonb_agg(r), '[]'::jsonb)
    from (
      select t.d as t, t.akun_id as a, t.hasil as h, t.alasan as al, t.idsubsls as s, al.jarak_km as j, al.jarak_status as js, (count(*))::int as n
        from terakhir t
        left join public.sigap_akun ak on ak.id = t.akun_id
        left join public.bencana_alokasi_subsls al on al.idsubsls = t.idsubsls and al.ppl_id = ak.petugas_bencana_id
       where t.hasil in ('terdampak', 'tidak_terdampak', 'tidak_ditemukan')
       group by t.d, t.akun_id, t.hasil, t.alasan, t.idsubsls, al.jarak_km, al.jarak_status
    ) r
$function$;
revoke all on function public.sigap_isi_harian(bigint[], date, date, bigint) from public, anon, authenticated;
grant execute on function public.sigap_isi_harian(bigint[], date, date, bigint) to service_role;
