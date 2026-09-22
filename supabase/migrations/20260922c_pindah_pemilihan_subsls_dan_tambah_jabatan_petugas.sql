-- (1) Pindahkan seksi "Monitoring Status Pemilihan Sub-SLS" dari tab
-- Monitoring ke tab Perencanaan Lapangan (permintaan user) -- key
-- 'pemilihan_subsls' DIHAPUS dari RPC gabungan penyisiran_monitoring_terpadu()
-- (revert ke versi 7-area sebelum migrasi tambah_pemilihan_subsls_ke_
-- monitoring_terpadu.sql), diganti RPC BERDIRI SENDIRI
-- penyisiran_pemilihan_subsls() (badan SQL SAMA, cuma dipanggil terpisah
-- lewat endpoint baru /api/penyisiran/pemilihan-subsls, dipakai komponen
-- baru di app/penyisiran/perencanaan-lapangan.tsx, ditaruh tepat di bawah
-- kartu "📋 Identifikasi Wilayah Sampel SLS"). RPC detail
-- penyisiran_detail_pemilihan_subsls(p_petugas_id) TIDAK berubah, tetap
-- dipakai apa adanya oleh modal rincian di lokasi baru.
create or replace function public.penyisiran_pemilihan_subsls()
returns jsonb
language sql
stable
as $function$
  with cakupan as (
    select a.petugas_id, u.idsubsls, u.status_kunjungan
    from penyisiran_alokasi_pilihan a
    join penyisiran_usaha u
      on u.kec_kode = a.kec_kode
     and u.nagari_kode = a.nagari_kode
     and u.sls_kode = a.sls_kode
     and (a.subsls_kode_list is null or u.subsls_kode = any(a.subsls_kode_list))
     and u.aktif
  ),
  per_petugas as (
    select petugas_id,
           count(distinct idsubsls) as jumlah_subsls_ditag,
           count(*) as jumlah_kk,
           count(*) filter (where status_kunjungan <> 'belum') as jumlah_ditemukan,
           count(*) filter (where status_kunjungan = 'belum') as jumlah_sisa
    from cakupan
    group by petugas_id
  )
  select jsonb_build_object(
    'per_petugas', (
      select coalesce(jsonb_agg(x order by x.jumlah_subsls_ditag desc, x.nama), '[]'::jsonb) from (
        select p.id, p.nama,
               p.alamat_kecamatan as kec_domisili,
               p.alamat_nagari as nagari_domisili,
               (
                 select string_agg(distinct a2.kec_nama, ', ' order by a2.kec_nama)
                 from penyisiran_alokasi_pilihan a2
                 where a2.petugas_id = p.id
               ) as kec_tugas,
               coalesce(pp.jumlah_subsls_ditag, 0) as jumlah_subsls_ditag,
               coalesce(pp.jumlah_kk, 0) as jumlah_kk,
               coalesce(pp.jumlah_ditemukan, 0) as jumlah_ditemukan,
               coalesce(pp.jumlah_sisa, 0) as jumlah_sisa
        from petugas_penyisiran_akun p
        left join per_petugas pp on pp.petugas_id = p.id
        where p.aktif
      ) x
    ),
    'total_subsls_belum_ditag', (
      select count(distinct u.idsubsls)
      from penyisiran_usaha u
      where u.aktif
        and not exists (
          select 1 from penyisiran_alokasi_pilihan ax
          where ax.kec_kode = u.kec_kode and ax.nagari_kode = u.nagari_kode and ax.sls_kode = u.sls_kode
            and (ax.subsls_kode_list is null or u.subsls_kode = any(ax.subsls_kode_list))
        )
    )
  );
$function$;

create or replace function public.penyisiran_monitoring_terpadu()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  v_result := jsonb_build_object(

    -- 1) Kualitas & kewajaran data kunjungan Penyisiran Usaha
    'kualitas_kunjungan', (
      select jsonb_build_object(
        'total_ditemukan', count(*) filter (where status_kunjungan = 'ditemukan'),
        'tanpa_bukti', count(*) filter (
          where status_kunjungan = 'ditemukan'
            and not coalesce(bukti_dutp, false)
            and not coalesce(bukti_dtsen, false)
            and not coalesce(bukti_pnm, false)
        ),
        'tanpa_catatan', count(*) filter (
          where status_kunjungan = 'ditemukan'
            and (catatan_petugas is null or btrim(catatan_petugas) = '')
        ),
        'per_kecamatan', (
          select coalesce(jsonb_agg(t order by t.kec_nama), '[]'::jsonb) from (
            select kec_nama,
              count(*) filter (where status_kunjungan = 'ditemukan') as total_ditemukan,
              count(*) filter (
                where status_kunjungan = 'ditemukan'
                  and not coalesce(bukti_dutp, false)
                  and not coalesce(bukti_dtsen, false)
                  and not coalesce(bukti_pnm, false)
              ) as tanpa_bukti
            from penyisiran_usaha
            group by kec_nama
          ) t
        )
      )
      from penyisiran_usaha
    ),

    -- Update beruntun sangat cepat (indikasi asal isi / bulk edit tanpa kunjungan nyata)
    'burst_update', (
      select coalesce(jsonb_agg(b order by b.jumlah desc), '[]'::jsonb) from (
        select oleh_nama,
               date_bin('5 minutes', created_at, timestamptz '2000-01-01') as bucket,
               count(*) as jumlah,
               min(created_at) as mulai,
               max(created_at) as selesai
        from penyisiran_riwayat
        where jenis = 'status_kunjungan' and oleh_role = 'penyisiran_petugas'
        group by oleh_nama, bucket
        having count(*) >= 15
        order by count(*) desc
        limit 50
      ) b
    ),

    -- 2) Konsistensi lintas sumber identifikasi (PPL vs Jorong vs Tetangga)
    'konsistensi_identifikasi', (
      with latest_per_role as (
        select distinct on (kode_identitas, oleh_role)
          kode_identitas, oleh_role, nilai_baru, created_at
        from penyisiran_riwayat
        where jenis = 'identifikasi_ppl'
        order by kode_identitas, oleh_role, created_at desc
      ),
      agg as (
        select kode_identitas,
          count(distinct oleh_role) as jumlah_sumber,
          count(distinct nilai_baru) filter (where nilai_baru is not null and nilai_baru <> 'belum') as jumlah_nilai_beda,
          jsonb_object_agg(oleh_role, nilai_baru) as nilai_per_sumber
        from latest_per_role
        group by kode_identitas
      )
      select jsonb_build_object(
        'total_multi_sumber', count(*) filter (where jumlah_sumber > 1),
        'total_konflik', count(*) filter (where jumlah_sumber > 1 and jumlah_nilai_beda > 1),
        'daftar_konflik', (
          select coalesce(jsonb_agg(x), '[]'::jsonb) from (
            select a.kode_identitas, u.nama_kk, u.sls_nama, u.subsls_kode, a.nilai_per_sumber
            from agg a
            join penyisiran_usaha u on u.kode_identitas = a.kode_identitas
            where a.jumlah_sumber > 1 and a.jumlah_nilai_beda > 1
            order by a.kode_identitas
            limit 300
          ) x
        )
      )
      from agg
    ),

    -- 3) Realisasi vs rencana (Perencanaan Lapangan) -- HANYA petugas AKTIF
    -- (diubah, sebelumnya jg menampilkan nonaktif yg py data historis).
    'realisasi_vs_rencana', (
      with rencana as (
        select petugas_id, sum(coalesce(array_length(subsls_kode_list, 1), 0)) as jumlah_rencana
        from penyisiran_alokasi_pilihan
        group by petugas_id
      ),
      realisasi as (
        select penyisiran_oleh_id as petugas_id,
               count(distinct idsubsls) as jumlah_realisasi,
               count(*) filter (where status_kunjungan <> 'belum') as jumlah_kunjungan
        from penyisiran_usaha
        where penyisiran_oleh_id is not null
        group by penyisiran_oleh_id
      ),
      hari as (
        select petugas_id, count(*) as jumlah_hari
        from penyisiran_alokasi_hari_tugas
        where dibatalkan_at is null
        group by petugas_id
      )
      select jsonb_build_object(
        'kuota_oh', 280,
        'oh_terpakai', (select coalesce(sum(jumlah_hari), 0) from hari),
        'per_petugas', (
          select coalesce(jsonb_agg(x order by x.nama), '[]'::jsonb) from (
            select p.id, p.nama,
              coalesce(r.jumlah_rencana, 0) as jumlah_rencana,
              coalesce(rl.jumlah_realisasi, 0) as jumlah_realisasi,
              coalesce(rl.jumlah_kunjungan, 0) as jumlah_kunjungan,
              coalesce(h.jumlah_hari, 0) as jumlah_hari
            from petugas_penyisiran_akun p
            left join rencana r on r.petugas_id = p.id
            left join realisasi rl on rl.petugas_id = p.id
            left join hari h on h.petugas_id = p.id
            where p.aktif
          ) x
        )
      )
    ),

    -- 4) Kelengkapan SPJ per petugas (Surat Tugas tanpa Visum)
    'kelengkapan_spj', (
      with pasangan as (
        select stp.surat_tugas_id, stp.petugas_jenis, stp.petugas_id,
               coalesce(p.nama, 'ID ' || stp.petugas_id::text) as nama,
               st.nomor_st, st.tanggal_mulai, st.tanggal_selesai
        from spj_surat_tugas_petugas stp
        join spj_surat_tugas st on st.id = stp.surat_tugas_id
        left join petugas_penyisiran_akun p
          on p.id = stp.petugas_id and stp.petugas_jenis = 'penyisiran'
      ),
      cek as (
        select ps.*, v.id as visum_id
        from pasangan ps
        left join spj_visum v
          on v.surat_tugas_id = ps.surat_tugas_id
         and v.petugas_id = ps.petugas_id
         and v.petugas_jenis = ps.petugas_jenis
      )
      select jsonb_build_object(
        'total_pasangan', count(*),
        'tanpa_visum', count(*) filter (where visum_id is null),
        'daftar_tanpa_visum', (
          select coalesce(jsonb_agg(x order by x.tanggal_mulai desc), '[]'::jsonb) from (
            select nomor_st, nama, petugas_jenis, tanggal_mulai, tanggal_selesai
            from cek where visum_id is null
            limit 200
          ) x
        )
      )
      from cek
    ),

    -- 5) Beban kerja & kelengkapan data Master Petugas
    'beban_kerja_petugas', (
      with span as (
        select pengawas_id, count(*) as jumlah_bawahan
        from petugas_penyisiran_akun
        where aktif and pengawas_id is not null
        group by pengawas_id
      )
      select jsonb_build_object(
        'span_pengawas', (
          select coalesce(jsonb_agg(x order by x.jumlah_bawahan desc), '[]'::jsonb) from (
            select p.nama as nama_pengawas, s.jumlah_bawahan
            from span s
            join petugas_penyisiran_akun p on p.id = s.pengawas_id
          ) x
        ),
        'data_tidak_lengkap', (
          select coalesce(jsonb_agg(x order by x.nama), '[]'::jsonb) from (
            select nama,
              (no_hp is null or btrim(no_hp) = '') as tanpa_hp,
              (nip is null or btrim(nip) = '') as tanpa_nip,
              (email is null or btrim(email) = '') as tanpa_email
            from petugas_penyisiran_akun
            where aktif and (
              no_hp is null or btrim(no_hp) = ''
              or nip is null or btrim(nip) = ''
              or email is null or btrim(email) = ''
            )
          ) x
        )
      )
    ),

    -- 6) Progres terhadap tenggat waktu (deadline Identifikasi: Minggu 20 Sep 2026 12:00 WIB)
    'progres_tenggat', (
      with harian as (
        select date_trunc('day', identifikasi_ppl_at) as tanggal, count(*) as jumlah
        from penyisiran_usaha
        where identifikasi_ppl_at is not null
          and identifikasi_ppl_at >= now() - interval '10 days'
        group by 1
        order by 1
      ),
      total as (
        select count(*) as total_keluarga,
               count(*) filter (where identifikasi_ppl is not null and identifikasi_ppl <> 'belum') as jumlah_selesai
        from penyisiran_usaha
      )
      select jsonb_build_object(
        'deadline', '2026-09-20T12:00:00+07:00',
        'total_keluarga', t.total_keluarga,
        'jumlah_selesai', t.jumlah_selesai,
        'sisa', t.total_keluarga - t.jumlah_selesai,
        'rata_rata_per_hari_7hr', (
          select round(coalesce(avg(z.jumlah), 0)) from (
            select jumlah from harian order by tanggal desc limit 7
          ) z
        ),
        'tren_harian', (select coalesce(jsonb_agg(h order by h.tanggal), '[]'::jsonb) from harian h)
      )
      from total t
    ),

    -- 7) Konflik alokasi wilayah PPL (1 ID Sub SLS dialokasikan ke >1 PPL)
    'konflik_alokasi_ppl', (
      with dup as (
        select idsubsls, count(*) as jumlah_ppl
        from ppl_alokasi_idsls
        group by idsubsls
        having count(*) > 1
      )
      select jsonb_build_object(
        'total_konflik', count(*),
        'daftar', (
          select coalesce(jsonb_agg(x order by x.idsubsls), '[]'::jsonb) from (
            select d.idsubsls, d.jumlah_ppl,
              (
                select jsonb_agg(jsonb_build_object(
                  'ppl_id', a.ppl_id,
                  'nama', pk.nama,
                  'status_pencocokan', a.status_pencocokan
                ))
                from ppl_alokasi_idsls a
                join ppl_akun pk on pk.id = a.ppl_id
                where a.idsubsls = d.idsubsls
              ) as ppl_list
            from dup d
            limit 300
          ) x
        )
      )
      from dup
    )
  );

  return v_result;
end;
$function$;

-- (2) Kolom "Jabatan" (PPL/PML/Kepala Kantor) di Master Petugas -- permintaan
-- user, dipakai jg utk monitoring "PPL belum ada PML" & "PML belum ada PPL"
-- (dihitung client-side di app/penyisiran/master-petugas.tsx dari kolom ini
-- + pengawas_id yg SUDAH ADA -- PPL "belum ada PML" = jabatan ppl & aktif &
-- (pengawas_id kosong ATAU pengawas yg ditunjuk BUKAN berjabatan pml); PML
-- "belum ada PPL" = jabatan pml & aktif & tidak ada petugas jabatan ppl aktif
-- yg pengawas_id-nya mengarah ke dia). Nullable (data lama belum terisi).
alter table public.petugas_penyisiran_akun
  add column if not exists jabatan text;

alter table public.petugas_penyisiran_akun
  drop constraint if exists petugas_penyisiran_akun_jabatan_check;

alter table public.petugas_penyisiran_akun
  add constraint petugas_penyisiran_akun_jabatan_check
  check (jabatan is null or jabatan in ('ppl', 'pml', 'kepala_kantor'));
